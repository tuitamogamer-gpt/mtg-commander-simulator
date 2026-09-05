// ===== visuals.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const ICONS = new Set([
    'crown', 'stack', 'log', 'deals', 'hold', 'mana', 'menu', 'attack',
    'shield', 'target', 'library', 'cards', 'graveyard', 'exile', 'effects', 'player',
    'info', 'ring', 'counterspell', 'indestructible', 'hexproof', 'shroud',
    'first-strike', 'double-strike', 'minus-counter', 'proliferate',
    'flying', 'deathtouch', 'lifelink', 'trample', 'haste', 'vigilance',
    'menace', 'reach', 'defender', 'flash', 'prowess', 'ward', 'wither',
    'forestwalk', 'myriad', 'skulk',
  ]);

  MTG.icon = function icon(name, extraClass = '') {
    const safeName = ICONS.has(name) ? name : 'info';
    const safeClass = String(extraClass || '').replace(/[^a-zA-Z0-9 _-]/g, '');
    return `<svg class="gameicon${safeClass ? ` ${safeClass}` : ''}" aria-hidden="true" focusable="false"><use href="./assets/icons/game-ui.svg#icon-${safeName}"></use></svg>`;
  };

  // One visual language shared by battlefield badges, notices and full-screen
  // gameplay FX.  Labels stay explicit because similar shield-like keywords
  // must never depend on colour alone.
  MTG.KEYWORD_VISUALS = Object.freeze({
    flying: Object.freeze({ icon: 'flying', label: 'Flying', tone: 'sky' }),
    deathtouch: Object.freeze({ icon: 'deathtouch', label: 'Deathtouch', tone: 'acid' }),
    lifelink: Object.freeze({ icon: 'lifelink', label: 'Lifelink', tone: 'rose' }),
    trample: Object.freeze({ icon: 'trample', label: 'Trample', tone: 'green' }),
    haste: Object.freeze({ icon: 'haste', label: 'Haste', tone: 'red' }),
    vigilance: Object.freeze({ icon: 'vigilance', label: 'Vigilance', tone: 'white' }),
    menace: Object.freeze({ icon: 'menace', label: 'Menace', tone: 'crimson' }),
    reach: Object.freeze({ icon: 'reach', label: 'Reach', tone: 'green' }),
    defender: Object.freeze({ icon: 'defender', label: 'Defender', tone: 'silver' }),
    flash: Object.freeze({ icon: 'flash', label: 'Flash', tone: 'violet' }),
    prowess: Object.freeze({ icon: 'prowess', label: 'Prowess', tone: 'cyan' }),
    ward: Object.freeze({ icon: 'ward', label: 'Ward', tone: 'blue', derived: 'ward' }),
    indestructible: Object.freeze({ icon: 'indestructible', label: 'Indestructible', tone: 'gold' }),
    hexproof: Object.freeze({ icon: 'hexproof', label: 'Hexproof', tone: 'blue' }),
    shroud: Object.freeze({ icon: 'shroud', label: 'Shroud', tone: 'violet' }),
    'first strike': Object.freeze({ icon: 'first-strike', label: 'First strike', tone: 'red' }),
    'double strike': Object.freeze({ icon: 'double-strike', label: 'Double strike', tone: 'orange' }),
    wither: Object.freeze({ icon: 'wither', label: 'Wither', tone: 'acid' }),
    forestwalk: Object.freeze({ icon: 'forestwalk', label: 'Forestwalk', tone: 'green' }),
    myriad: Object.freeze({ icon: 'myriad', label: 'Myriad', tone: 'cyan' }),
    skulk: Object.freeze({ icon: 'skulk', label: 'Skulk', tone: 'silver' }),
  });

  // Ward lives in cur.wardCost rather than cur.kw.  Keeping this lookup next
  // to the visual registry makes battlefield badges and the card sheet agree.
  MTG.cardHasVisualAbility = function cardHasVisualAbility(card, keyword, visual) {
    if (!card || !card.cur) return false;
    if (visual && visual.derived === 'ward') return !!card.cur.wardCost || !!card.cur.extraWards?.length;
    if (keyword === 'hexproof' && card.cur.hexproof) return true;
    if (keyword === 'shroud' && card.cur.shroud) return true;
    return card.kw(keyword);
  };

  // Shared accessible-dialog enhancer for the setup and Arena. It does not
  // decide whether Escape is legal; each product surface keeps that rule.
  MTG.enhanceDialog = function enhanceDialog(overlay, dialog, options = {}) {
    if (!overlay || !dialog || overlay.dataset.dialogEnhanced === 'true') return dialog;
    overlay.dataset.dialogEnhanced = 'true';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = dialog.querySelector('[data-dialog-title], .mtitle, .gameover, h1, h2');
    if (title) {
      if (!title.id) title.id = `dialog-title-${Math.random().toString(36).slice(2, 9)}`;
      dialog.setAttribute('aria-labelledby', title.id);
    } else dialog.setAttribute('aria-label', options.label || 'Dialog');
    const returnFocus = options.returnFocus || overlay._dialogReturnFocus || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    overlay._dialogReturnFocus = returnFocus;
    const focusable = () => [...dialog.querySelectorAll(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )].filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
    requestAnimationFrame(() => {
      if (!overlay.isConnected || dialog.contains(document.activeElement)) return;
      (options.initialFocus || focusable()[0] || dialog).focus({ preventScroll: true });
    });
    if (returnFocus && returnFocus !== document.body) {
      const observer = new MutationObserver(() => {
        if (overlay.isConnected) return;
        observer.disconnect();
        if (!overlay._dialogReplaced && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return dialog;
  };

  MTG.COMMANDER_INTROS = Object.freeze({
    'Felothar the Steadfast': './assets/commander-intros/felothar-the-steadfast.mp4',
    'Bello, Bard of the Brambles': './assets/commander-intros/bello-bard-of-the-brambles.mp4',
    'Captain America, Team Leader': './assets/commander-intros/captain-america-team-leader.mp4',
    'Auntie Ool, Cursewretch': './assets/commander-intros/auntie-ool-cursewretch.mp4',
    'Inspirit, Flagship Vessel': './assets/commander-intros/inspirit-flagship-vessel.mp4',
    'Morska, Undersea Sleuth': './assets/commander-intros/morska-undersea-sleuth.mp4',
    'Doctor Doom, King of Latveria': './assets/commander-intros/doctor-doom-king-of-latveria.mp4',
    'Galadriel, Elven-Queen': './assets/commander-intros/galadriel-elven-queen.mp4',
    'Valgavoth, Harrower of Souls': './assets/commander-intros/valgavoth-harrower-of-souls.mp4',
    "Zinnia, Valley's Voice": './assets/commander-intros/zinnia-valleys-voice.mp4',
    'Zurgo Stormrender': './assets/commander-intros/zurgo-stormrender.mp4',
    'Olivia, Opulent Outlaw': './assets/commander-intros/olivia-opulent-outlaw.mp4',
    'Rootha, Mastering the Moment': './assets/commander-intros/rootha-mastering-the-moment.mp4',
    'Stella Lee, Wild Card': './assets/commander-intros/stella-lee-wild-card.mp4',
    'Hazel of the Rootbloom': './assets/commander-intros/hazel-of-the-rootbloom.mp4',
    'Invisible Woman': './assets/commander-intros/invisible-woman.mp4',
    'Leonardo, the Balance': './assets/commander-intros/leonardo-the-balance.mp4',
    'Michelangelo, the Heart': './assets/commander-intros/michelangelo-the-heart.mp4',
    "T'Challa, the Black Panther": './assets/commander-intros/tchalla-the-black-panther.mp4',
    "Y'shtola, Night's Blessed": './assets/commander-intros/yshtola-nights-blessed.mp4',
    'Leinore, Autumn Sovereign': './assets/commander-intros/leinore-autumn-sovereign.mp4',
    'Zimone, Infinite Analyst': './assets/commander-intros/zimone-infinite-analyst.mp4',
    'Ashling, the Limitless': './assets/commander-intros/ashling-the-limitless.mp4',
    'Hearthhull, the Worldseed': './assets/commander-intros/hearthhull-the-worldseed.mp4',
    'Cloud, Ex-SOLDIER': './assets/commander-intros/cloud-ex-soldier.mp4',
    'Ureni of the Unwritten': './assets/commander-intros/ureni-of-the-unwritten.mp4',
    'Teval, the Balanced Scale': './assets/commander-intros/teval-the-balanced-scale.mp4',
    'Shiko and Narset, Unified': './assets/commander-intros/shiko-and-narset-unified.mp4',
  });

  // Videos belong to the predefined decks, never to imported lists that
  // happen to use the same commander. Unknown deck origins use card art.
  MTG.commanderIntroForDeck = function commanderIntroForDeck(deck, commanderName) {
    if (!deck || deck.custom || deck.imported) return null;
    const predefined = MTG.DECKS && MTG.DECKS[deck.name];
    if (!predefined || predefined.custom || predefined.imported) return null;
    return MTG.COMMANDER_INTROS[commanderName] || null;
  };

  MTG.COMMANDER_INTRO_LABELS = Object.freeze({});
})();
