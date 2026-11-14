// ===== visuals.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const ICONS = new Set([
    'crown', 'stack', 'log', 'deals', 'hold', 'mana', 'menu', 'attack',
    'shield', 'target', 'library', 'cards', 'graveyard', 'exile', 'effects', 'player',
    'info', 'life', 'playmat', 'expand', 'ring', 'counterspell', 'indestructible', 'hexproof', 'shroud',
    'first-strike', 'double-strike', 'minus-counter', 'proliferate',
    'flying', 'deathtouch', 'lifelink', 'trample', 'haste', 'vigilance',
    'menace', 'reach', 'defender', 'flash', 'prowess', 'ward', 'wither',
    'forestwalk', 'myriad', 'skulk',
    'ability', 'hourglass', 'clock', 'warning', 'lock', 'arrow', 'map', 'fire',
    'moon', 'pause', 'eye', 'mute', 'forward', 'hint', 'link', 'controls', 'help', 'book', 'stun', 'gift', 'box', 'rotate',
  ]);

  MTG.icon = function icon(name, extraClass = '') {
    const safeName = ICONS.has(name) ? name : 'info';
    const safeClass = String(extraClass || '').replace(/[^a-zA-Z0-9 _-]/g, '');
    return `<svg class="gameicon${safeClass ? ` ${safeClass}` : ''}" aria-hidden="true" focusable="false"><use href="./assets/icons/game-ui.svg#icon-${safeName}"></use></svg>`;
  };

  // Prompts, hints and toasts were written with a leading emoji, which every
  // platform draws in its own colour font. Shown, the mark is the matching
  // icon of the table's own set; the text itself is unchanged.
  const LEAD_ICONS = [['\u{1F3B4}', 'cards'], ['\u{1F3AF}', 'target'], ['\u{1F590}', 'hold'], ['\u26A1', 'flash'], ['\u{1F451}', 'crown']];
  MTG.iconizeLead = function iconizeLead(root, selector) {
    if (!root || !root.querySelectorAll) return;
    const nodes = selector ? root.querySelectorAll(selector) : [root];
    for (const node of nodes) {
      const first = node.firstChild;
      if (!first || first.nodeType !== 3) continue;
      const text = first.nodeValue.replace(/^\s+/, '');
      const lead = LEAD_ICONS.find(([mark]) => text.startsWith(mark));
      if (!lead) continue;
      first.nodeValue = text.slice(lead[0].length).replace(/^\uFE0F?\s*/, '');
      node.insertAdjacentHTML('afterbegin', MTG.icon(lead[1], 'leadicon'));
    }
  };

  // Rules text speaks in symbols: {T}, {2}, {B}, {W/U}. Printed as braces
  // they read as code, in a card sheet, on an ability's button, in a prompt.
  // Shown, each is the glyph of the local mana set. The characters stay in the
  // page, clipped, so what a screen reader, a copy or a test finds in the text
  // is unchanged.
  const SYMBOL_FILES = new Set(['W', 'U', 'B', 'R', 'G', 'C', 'X', 'T']);
  const SYMBOL_HEX = { W: '#e8e3c8', U: '#4a90d9', B: '#7a5f8a', R: '#d95a4a', G: '#5aa860', C: '#9a9a9a' };
  const RAW_PARENTS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE', 'CODE', 'PRE', 'KBD']);
  function symbolGlyph(code) {
    if (SYMBOL_FILES.has(code)) return `<img class="msym mana-glyph tsymglyph" src="./assets/mana/${code}.svg" alt="" aria-hidden="true">`;
    if (code.includes('/')) {
      const [left, right] = code.split('/');
      const hue = part => SYMBOL_HEX[part] || (part === 'P' ? '#7f5a72' : '#b9b4a6');
      return `<span class="msym mana-glyph mana-combo tsymglyph" data-left="${left}" data-right="${right}" style="--mana-left:${hue(left)};--mana-right:${hue(right)}" aria-hidden="true"></span>`;
    }
    return `<span class="msym mana-glyph mana-generic tsymglyph${code.length > 2 ? ' wide' : ''}" data-symbol="${code}" aria-hidden="true"></span>`;
  }
  // Marks that scripts and labels write as emoji, which every platform draws
  // in its own colour font. Shown, each is the matching icon of the table's
  // set; the character stays in the page like a symbol's braces do.
  const MARKS = new Map([
    ['\u2699', 'ability'], ['\u2692', 'ability'], ['\u26A1', 'flash'], ['\u{1F0CF}', 'cards'], ['\u{1F3B4}', 'cards'],
    ['\u23F3', 'hourglass'], ['\u23F0', 'clock'], ['\u26A0', 'warning'], ['\u{1F512}', 'lock'], ['\u25B6', 'arrow'],
    ['\u2728', 'effects'], ['\u2726', 'effects'], ['\u{1F451}', 'crown'], ['\u265B', 'crown'], ['\u{1F3AF}', 'target'],
    ['\u{1F590}', 'hold'], ['\u2694', 'attack'], ['\u{1F6E1}', 'shield'], ['\u{1F91D}', 'deals'], ['\u{1F54A}', 'deals'],
    ['\u{1FA78}', 'life'], ['\u2620', 'deathtouch'], ['\u{1F480}', 'deathtouch'], ['\u{1FAA6}', 'graveyard'],
    ['\u{1F4DC}', 'log'], ['\u{1F5FA}', 'map'], ['\u{1F48D}', 'ring'], ['\u{1F525}', 'fire'],
    ['\u{1F319}', 'moon'], ['\u23F8', 'pause'], ['\u{1F441}', 'eye'], ['\u{1F515}', 'mute'], ['\u23E9', 'forward'],
    ['\u{1F4A1}', 'hint'], ['\u{1F517}', 'link'], ['\u{1F39B}', 'controls'], ['\u2753', 'help'], ['\u{1F4D6}', 'book'],
    ['\u{1F4AB}', 'stun'], ['\u{1F381}', 'gift'], ['\u{1F4E6}', 'box'], ['\u{1F504}', 'rotate'], ['\u{1F300}', 'exile'],
    ['\u2764', 'life'], ['\u{1F52E}', 'mana'],
  ]);
  const TOKEN = new RegExp(`\\{([A-Z0-9]{1,5}(?:\\/[A-Z0-9]{1,2}){0,2})\\}|(${[...MARKS.keys()].join('|')})\\uFE0F?`, 'gu');
  const MAYBE_TOKEN = new RegExp(`\\{|${[...MARKS.keys()].join('|')}`, 'u');
  MTG.hasTextSymbols = text => MAYBE_TOKEN.test(text);
  MTG.symbolizeTextNode = function symbolizeTextNode(node) {
    const parent = node && node.parentNode, text = node && node.nodeValue;
    if (!parent || parent.nodeType !== 1 || !text || !MAYBE_TOKEN.test(text)) return false;
    if (parent.namespaceURI !== 'http://www.w3.org/1999/xhtml' || RAW_PARENTS.has(parent.tagName) ||
      parent.classList.contains('tsymraw') || parent.isContentEditable || parent.closest?.('[data-raw-symbols]')) return false;
    // matchAll starts where a global expression last stopped.
    TOKEN.lastIndex = 0;
    const matches = [...text.matchAll(TOKEN)];
    if (!matches.length) return false;
    const doc = node.ownerDocument, fragment = doc.createDocumentFragment();
    let last = 0;
    for (const match of matches) {
      if (match.index > last) fragment.append(text.slice(last, match.index));
      const symbol = doc.createElement('span');
      symbol.className = match[1] ? 'tsym' : 'tsym tmark';
      symbol.innerHTML = `<span class="tsymraw">${match[0]}</span>` +
        (match[1] ? symbolGlyph(match[1]) : MTG.icon(MARKS.get(match[2]), 'tmarkicon'));
      fragment.append(symbol);
      last = match.index + match[0].length;
    }
    if (last < text.length) fragment.append(text.slice(last));
    parent.replaceChild(fragment, node);
    return true;
  };
  MTG.symbolizeTree = function symbolizeTree(root) {
    const doc = root && (root.ownerDocument || (root.nodeType === 9 ? root : null));
    if (!doc || !doc.createTreeWalker) return root;
    if (root.nodeType === 3) { MTG.symbolizeTextNode(root); return root; }
    const walker = doc.createTreeWalker(root, 4);
    const nodes = [];
    while (walker.nextNode()) if (MAYBE_TOKEN.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
    for (const node of nodes) MTG.symbolizeTextNode(node);
    return root;
  };
  // Sheets, dialogs, toasts and menus are built in many places. Whatever
  // enters the page is read once here, before it is painted.
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
    const watch = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 3) MTG.symbolizeTextNode(node);
        else if (node.nodeType === 1 && !node.classList.contains('tsym') && MAYBE_TOKEN.test(node.textContent)) MTG.symbolizeTree(node);
      }
    });
    watch.observe(document.documentElement, { childList: true, subtree: true });
  }

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
    unblockable: Object.freeze({ icon: 'skulk', label: "Can't be blocked", tone: 'cyan', derived: 'unblockable' }),
  });

  // Some abilities use derived fields rather than cur.kw. Keep battlefield
  // badges and the card sheet aligned with those current characteristics.
  MTG.cardHasVisualAbility = function cardHasVisualAbility(card, keyword, visual) {
    if (!card || !card.cur) return false;
    if (visual && visual.derived === 'ward') return !!card.cur.wardCost || !!card.cur.extraWards?.length;
    if (visual && visual.derived === 'unblockable') return !!card.cur.unblockable;
    if (keyword === 'hexproof' && card.cur.hexproof) return true;
    if (keyword === 'shroud' && card.cur.shroud) return true;
    return card.kw(keyword);
  };

  // Shared accessible-dialog enhancer for the setup and Arena. It does not
  // decide whether Escape is legal; each product surface keeps that rule.
  MTG.enhanceDialog = function enhanceDialog(overlay, dialog, options = {}) {
    if (!overlay || !dialog || overlay.dataset.dialogEnhanced === 'true') return dialog;
    overlay.dataset.dialogEnhanced = 'true';
    if (dialog.getAttribute('role') !== 'alertdialog') dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = dialog.querySelector('[data-dialog-title], .mtitle, .gameover, .sname, .stackpoptitle, h1, h2');
    if (title) {
      if (!title.id) title.id = `dialog-title-${Math.random().toString(36).slice(2, 9)}`;
      dialog.setAttribute('aria-labelledby', title.id);
    } else if (!dialog.getAttribute('aria-label')) dialog.setAttribute('aria-label', options.label || 'Dialog');
    const returnFocus = options.returnFocus || overlay._dialogReturnFocus || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    overlay._dialogReturnFocus = returnFocus;
    const focusable = () => [...dialog.querySelectorAll(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    )].filter(node => {
      if (node.hidden || node.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      if (node.tabIndex < 0 || globalThis.getComputedStyle?.(node).visibility === 'hidden') return false;
      if (node.getClientRects && !node.getClientRects().length) return false;
      // Closed details can contain focusable descendants that querySelectorAll
      // still returns. Only that details element's own summary remains usable.
      const closed = node.closest('details:not([open])');
      return !closed || node === closed.querySelector('summary');
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || overlay.inert) return;
      const nodes = focusable();
      if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
    requestAnimationFrame(() => {
      if (!overlay.isConnected || overlay.inert || dialog.contains(document.activeElement)) return;
      (options.initialFocus || focusable()[0] || dialog).focus({ preventScroll: true });
    });
    if (returnFocus && returnFocus !== document.body) {
      const observer = new MutationObserver(() => {
        if (overlay.isConnected) return;
        observer.disconnect();
        if (!overlay._dialogReplaced && returnFocus.isConnected && !returnFocus.closest('[inert]') &&
            (!document.activeElement || document.activeElement === document.body)) returnFocus.focus({ preventScroll: true });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return dialog;
  };

  // A visually covered table must also be unavailable to keyboard and assistive
  // technology. Run after every arena commit, since the renderer may reuse nodes.
  MTG.clearDialogOwnership = function clearDialogOwnership(root) {
    if (!root) return;
    for (const child of root.children) {
      if (child.dataset.dialogInert === 'true') {
        child.inert = false; delete child.dataset.dialogInert;
        if (child.dataset.dialogHidden === 'true') { child.removeAttribute('aria-hidden'); delete child.dataset.dialogHidden; }
      }
    }
  };
  MTG.syncDialogOwnership = function syncDialogOwnership(root) {
    if (!root) return;
    MTG.clearDialogOwnership(root);
    const surfaces = [...root.children].filter(node => node.matches('.overlay, .quickmenuov, .revealwrap, .logpanel'));
    const layer = node => Number(globalThis.getComputedStyle?.(node).zIndex) || 0;
    const top = surfaces.reduce((current, node) => !current || layer(node) >= layer(current) ? node : current, null);
    for (const child of root.children) {
      if (top && child !== top && !child.inert) {
        child.inert = true; child.dataset.dialogInert = 'true';
        if (!child.hasAttribute('aria-hidden')) { child.setAttribute('aria-hidden', 'true'); child.dataset.dialogHidden = 'true'; }
      }
    }
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
