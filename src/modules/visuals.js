// ===== visuals.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const ICONS = new Set([
    'crown', 'stack', 'log', 'deals', 'hold', 'mana', 'menu', 'attack',
    'shield', 'target', 'library', 'cards', 'graveyard', 'exile', 'effects', 'player',
    'info', 'ring',
  ]);

  MTG.icon = function icon(name, extraClass = '') {
    const safeName = ICONS.has(name) ? name : 'info';
    const safeClass = String(extraClass || '').replace(/[^a-zA-Z0-9 _-]/g, '');
    return `<svg class="gameicon${safeClass ? ` ${safeClass}` : ''}" aria-hidden="true" focusable="false"><use href="/assets/icons/game-ui.svg#icon-${safeName}"></use></svg>`;
  };

  MTG.COMMANDER_INTROS = Object.freeze({
    'Felothar the Steadfast': '/assets/commander-intros/felothar-the-steadfast.mp4',
    'Bello, Bard of the Brambles': '/assets/commander-intros/bello-bard-of-the-brambles.mp4',
    'Captain America, Team Leader': '/assets/commander-intros/captain-america-team-leader.mp4',
    'Auntie Ool, Cursewretch': '/assets/commander-intros/auntie-ool-cursewretch.mp4',
    'Inspirit, Flagship Vessel': '/assets/commander-intros/inspirit-flagship-vessel.mp4',
    'Morska, Undersea Sleuth': '/assets/commander-intros/morska-undersea-sleuth.mp4',
    'Doctor Doom, King of Latveria': '/assets/commander-intros/doctor-doom-king-of-latveria.mp4',
    'Galadriel, Elven-Queen': '/assets/commander-intros/galadriel-elven-queen.mp4',
    'Valgavoth, Harrower of Souls': '/assets/commander-intros/valgavoth-harrower-of-souls.mp4',
    "Zinnia, Valley's Voice": '/assets/commander-intros/zinnia-valleys-voice.mp4',
    'Zurgo Stormrender': '/assets/commander-intros/zurgo-stormrender.mp4',
    'Olivia, Opulent Outlaw': '/assets/commander-intros/olivia-opulent-outlaw.mp4',
    'Rootha, Mastering the Moment': '/assets/commander-intros/rootha-mastering-the-moment.mp4',
    'Stella Lee, Wild Card': '/assets/commander-intros/stella-lee-wild-card.mp4',
    'Hazel of the Rootbloom': '/assets/commander-intros/hazel-of-the-rootbloom.mp4',
    'Invisible Woman': '/assets/commander-intros/invisible-woman.mp4',
    'Leonardo, the Balance': '/assets/commander-intros/leonardo-the-balance.mp4',
    'Michelangelo, the Heart': '/assets/commander-intros/michelangelo-the-heart.mp4',
    "T'Challa, the Black Panther": '/assets/commander-intros/tchalla-the-black-panther.mp4',
    "Y'shtola, Night's Blessed": '/assets/commander-intros/yshtola-nights-blessed.mp4',
    'Leinore, Autumn Sovereign': '/assets/commander-intros/leinore-autumn-sovereign.mp4',
    'Zimone, Infinite Analyst': '/assets/commander-intros/zimone-infinite-analyst.mp4',
    'Ashling, the Limitless': '/assets/commander-intros/ashling-the-limitless.mp4',
    'Hearthhull, the Worldseed': '/assets/commander-intros/hearthhull-the-worldseed.mp4',
    'Cloud, Ex-SOLDIER': '/assets/commander-intros/cloud-ex-soldier.mp4',
    'Ureni of the Unwritten': '/assets/commander-intros/ureni-of-the-unwritten.mp4',
    'Teval, the Balanced Scale': '/assets/commander-intros/teval-the-balanced-scale.mp4',
    'Shiko and Narset, Unified': '/assets/commander-intros/shiko-and-narset-unified.mp4',
  });

  MTG.COMMANDER_INTRO_LABELS = Object.freeze({});
})();
