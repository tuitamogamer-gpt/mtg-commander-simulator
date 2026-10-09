// ===== deck-import.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Runtime ugovor za main-menu paste import. Tekstualna lista ne ulazi u engine
// dok ne prođe format, Commander legalnost, engine-certification i interakcijski
// manifest. Tako custom deck koristi iste CardInst/stack/combat putanje kao
// fabrički deckovi, bez paralelnog ili pojednostavljenog enginea.
(function () {
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const ACCEPTED_ENGINE_STATUSES = new Set(['certified', 'certified-legacy']);
  const BASIC_NAMES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);
  const IMPORTED_DECK_SCHEMA = 'commander-deck/v1';
  const IMPORTED_LIBRARY_SCHEMA = 'commander-deck-library/v1';
  const IMPORTED_LIBRARY_KEY = 'mtg-custom-deck-library/v1';
  const IMPORTED_LIBRARY_LIMIT = 40;
  const IMPORTED_DECK_ID = /^deck-[a-z0-9-]{8,80}$/;

  const KEYWORD_CONTRACTS = MTG.ORACLE_KEYWORD_CONTRACTS = Object.freeze({
    flying: 'flying-evasion',
    reach: 'reach-blocking',
    forestwalk: 'landwalk-evasion',
    plainswalk: 'landwalk-evasion',
    islandwalk: 'landwalk-evasion',
    swampwalk: 'landwalk-evasion',
    mountainwalk: 'landwalk-evasion',
    fear: 'fear-evasion',
    intimidate: 'intimidate-evasion',
    skulk: 'skulk-evasion',
    shadow: 'shadow-blocking',
    horsemanship: 'horsemanship-evasion',
    menace: 'menace-blocking',
    'first strike': 'first-strike-step',
    'double strike': 'double-strike-steps',
    deathtouch: 'deathtouch-lethal',
    lifelink: 'lifelink-life-gain',
    trample: 'trample-assignment',
    wither: 'wither-counters',
    haste: 'haste-attack-timing',
    vigilance: 'vigilance-attack-tap',
    defender: 'defender-attack-restriction',
    indestructible: 'indestructible-destroy-sba',
    hexproof: 'hexproof-opponent-targeting',
    shroud: 'shroud-all-targeting',
    ward: 'ward-stack-payment',
    flash: 'flash-cast-timing',
    prowess: 'prowess-cast-trigger',
    phasing: 'phasing-untap-cycle',
  });

  MTG.ORACLE_INTERACTION_CONTRACTS = Object.freeze({
    'ordered-coin-replacement': {mechanics:['coin replacement'],path:'first coin-flip event each turn → active printed replacement makes the coins heads and wins those flips → later flips use the native coin engine'},
    'entry-choice-continuous-effect': {mechanics:['entry choice','continuous effect'],path:'actual controller chooses two distinct printed abilities as the permanent enters → bind choices to that incarnation → live filtered permanents gain the chosen abilities → reentry chooses again'},
    'entry-tapped-replacement': {mechanics:['entry replacement'],path:'complete closed entry rule → actual pre-entry controller choices and printed payments → apply its battlefield entry replacement'},
    'permanent-enduring-story-v68': {mechanics:['Storied'],path:'control a permanent with Storied → observe three artifacts, legendary permanents or Sagas → retain the enduring story for the rest of the game'},
    'as-enters-named-mode-v66': {mechanics:['entry-choice'],path:'as-enters replacement → actual controller chooses between the two exact printed modes → incarnation-bound mode enables its complete printed clauses → reentry chooses again'},
    'native-equip-alternative-v68': {mechanics:['Equip'],path:'live first-equip permission → choose printed cost or {0} → apply activation taxes → validate and pay → record the actual equip activation'},
    'card-draw-prohibition': {mechanics:['draw prohibition'],path:'check live draw prohibitions before proposing replacement effects or drawing each card'},
    'player-counter-prohibition-v68': {mechanics:['counter prohibition'],path:'live controller poison prohibition → native infect, toxic, player effects and proliferate reject new poison counters → source departure restores normal counter placement'},
    'adventure-casting': {mechanics:['adventure'],path:'paid Adventure cast → spell Stack → exile permission → paid permanent cast'},
    'creature-casting': { mechanics: ['creature'], path: 'cast spell → stack → permanent' },
    'permanent-casting': { mechanics: ['artifact', 'enchantment', 'planeswalker'], path: 'cast spell → stack → permanent' },
    'spell-casting': { mechanics: ['instant', 'sorcery'], path: 'cast spell → target lock → Stack → resolution → graveyard' },
    'land-play': { mechanics: ['land'], path: 'land-play timing → battlefield entry → mana/ETB path' },
    'vanilla-permanent': { mechanics: [], path: 'base P/T → continuous effects → combat/SBA' },
    'phasing-untap-cycle': { mechanics: ['phasing'], path: 'simultaneous own untap phase cycle → phased object exclusions → attachment and counter identity' },
    'flying-evasion': { mechanics: ['flying'], path: 'combat blocker legality' },
    'reach-blocking': { mechanics: ['reach'], path: 'combat blocker legality against flying' },
    'landwalk-evasion': { mechanics: ['landwalk'], path: 'matching defender land subtype → blocker legality' },
    'fear-evasion': { mechanics: ['fear'], path: 'artifact/black blocker legality' },
    'intimidate-evasion': { mechanics: ['intimidate'], path: 'artifact/shared-color blocker legality' },
    'skulk-evasion': { mechanics: ['skulk'], path: 'greater-power blocker restriction' },
    'shadow-blocking': { mechanics: ['shadow'], path: 'shadow parity blocker restriction' },
    'horsemanship-evasion': { mechanics: ['horsemanship'], path: 'horsemanship blocker restriction' },
    'menace-blocking': { mechanics: ['menace'], path: 'minimum two legal blockers' },
    'first-strike-step': { mechanics: ['first strike'], path: 'first-strike combat damage step' },
    'double-strike-steps': { mechanics: ['double strike'], path: 'first and normal combat damage steps' },
    'deathtouch-lethal': { mechanics: ['deathtouch'], path: 'damage marker → lethal/SBA' },
    'lifelink-life-gain': { mechanics: ['lifelink'], path: 'damage event → controller life gain' },
    'trample-assignment': { mechanics: ['trample'], path: 'lethal blocker assignment → defender overflow' },
    'wither-counters': { mechanics: ['wither'], path: 'creature damage → -1/-1 counters' },
    'haste-attack-timing': { mechanics: ['haste'], path: 'summoning-sickness attack/activation gate' },
    'vigilance-attack-tap': { mechanics: ['vigilance'], path: 'attacker declaration tap rule' },
    'defender-attack-restriction': { mechanics: ['defender'], path: 'attacker eligibility' },
    'indestructible-destroy-sba': { mechanics: ['indestructible'], path: 'destroy/deathtouch/lethal-damage replacement' },
    'hexproof-opponent-targeting': { mechanics: ['hexproof'], path: 'opponent target legality' },
    'shroud-all-targeting': { mechanics: ['shroud'], path: 'all-player target legality' },
    'ward-stack-payment': { mechanics: ['ward'], path: 'target lock → ward trigger → pay/counter' },
    'flash-cast-timing': { mechanics: ['flash'], path: 'priority cast timing' },
    'prowess-cast-trigger': { mechanics: ['prowess'], path: 'noncreature cast → trigger → EOT pump' },
    'manual-oracle-resolution': { mechanics: ['manual'], path: 'explicit per-card script → normal Stack/resolution path' },
    'trigger-stack': { mechanics: ['trigger'], path: 'engine event → queued trigger → priority → resolution' },
    'target-lock-revalidation': { mechanics: ['target'], path: 'legal target lock → ward/protection → resolution revalidation' },
    'activated-ability-cost': { mechanics: ['activated ability'], path: 'availability → target lock → cost payment → Stack' },
    'mana-source': { mechanics: ['mana'], path: 'mana ability → source selection → restricted pool/payment tracking' },
    'face-up-replacement-v43': { mechanics: ['morph'], path: 'paid face-up special action → replacement counters before state-based actions' },
    'land-enters-tapped': { mechanics: ['land'], path: 'battlefield entry replacement → tapped state' },
    'cant-block-static': { mechanics: ['combat'], path: 'continuous restriction → blocker eligibility' },
    'must-attack-static': { mechanics: ['combat'], path: 'attacker requirement → legal declaration' },
    'permanent-enters-tapped': { mechanics: ['permanent'], path: 'battlefield entry replacement → tapped state' },
    'permanent-entry-replacement': { mechanics: ['entry', 'discard', 'sacrifice'], path: 'pre-entry replacement → discard the controller’s hand or simultaneously sacrifice their lands → enter and publish ETB events' },
    'unblockable-static': { mechanics: ['combat'], path: 'continuous evasion → blocker eligibility' },
    'flying-blocker-only-static': { mechanics: ['combat'], path: 'continuous blocker restriction → blocker eligibility' },
    'protection-static': { mechanics: ['protection'], path: 'source quality → damage, targeting, blocking, attachment restrictions' },
    'cycling-ability': { mechanics: ['cycling'], path: 'hand ability → mana payment → discard → draw' },
    'mechanic-persist': { mechanics: ['persist'], path: 'dies event → return with -1/-1 counter' },
    'mechanic-undying': { mechanics: ['undying'], path: 'dies event → return with +1/+1 counter' },
    'mechanic-changeling': { mechanics: ['changeling'], path: 'continuous subtype identity → all creature types' },
    'mechanic-deck-limit-v10': { mechanics: ['deck construction'], path: 'printed named-card exception → exact copy limit during Commander deck validation' },
    'mechanic-convoke': { mechanics: ['convoke'], path: 'spell payment → tap creatures for generic or matching colored mana' },
    'mechanic-cascade': { mechanics: ['cascade'], path: 'cast trigger → exile until lower mana value → optional free cast' },
    'mechanic-storm': { mechanics: ['storm'], path: 'cast history → Stack copies with target choice' },
    'mechanic-flashback': { mechanics: ['flashback'], path: 'graveyard cast → alternative mana payment → exile on resolution' },
    'mechanic-rebound': { mechanics: ['rebound'], path: 'cast from hand → exile on resolution → free cast next upkeep' },
    'mechanic-suspend': { mechanics: ['suspend'], path: 'hand action → exile with time counters → upkeep removal → free cast' },
    'mechanic-morph': { mechanics: ['morph'], path: 'face-down cast → 2/2 hidden permanent → special-action turn face up' },
    'mechanic-megamorph': { mechanics: ['megamorph'], path: 'face-down cast → paid special action → face up with a +1/+1 counter' },
    'mechanic-disguise': { mechanics: ['disguise'], path: 'face-down cast → warded 2/2 hidden permanent → special-action turn face up' },
    'mechanic-devoid': { mechanics: ['devoid'], path: 'characteristic-defining ability → colorless object in every zone' },
    'mechanic-uncounterable': { mechanics: ['uncounterable'], path: 'Stack target → counter attempt → spell remains on Stack' },
    'etb-draw': { mechanics: ['trigger', 'draw'], path: 'self ETB event → trigger Stack → draw' },
    'etb-life-gain': { mechanics: ['trigger', 'life'], path: 'self ETB event → trigger Stack → life gain' },
    'dies-draw': { mechanics: ['trigger', 'draw'], path: 'self dies/LKI event → trigger Stack → draw' },
    'etb-loot': { mechanics: ['trigger', 'draw', 'discard'], path: 'self ETB event → ordered discard/draw choice → zone events' },
    'etb-treasure': { mechanics: ['trigger', 'token'], path: 'self ETB event → Treasure token creation → mana ability' },
    'etb-each-opponent-discard': { mechanics: ['trigger', 'discard'], path: 'self ETB event → all opponents choose → simultaneous graveyard batch' },
    'dies-life-gain': { mechanics: ['trigger', 'life'], path: 'self dies/LKI event → trigger Stack → controller life gain' },
    'noncreature-cast-counter-self': { mechanics: ['trigger', 'counter'], path: 'controller noncreature cast → trigger Stack → self +1/+1 counter' },
    'etb-library-selection': { mechanics: ['trigger', 'scry', 'surveil'], path: 'self ETB event → trigger Stack → ordered library choice' },
    'etb-token-creation': { mechanics: ['trigger', 'token'], path: 'self ETB event → trigger Stack → exact token characteristics' },
    'etb-counter-self': { mechanics: ['trigger', 'counter'], path: 'self ETB event → trigger Stack → counter placement' },
    'attachment-continuous-effect': { mechanics: ['attachment'], path: 'legal host → continuous P/T, keyword, attack, block or untap layer' },
    'aura-targeting': { mechanics: ['aura'], path: 'cast target lock → protection/revalidation → attached battlefield entry' },
    'equipment-attach-ability': { mechanics: ['equipment'], path: 'sorcery-speed target → mana payment → ability Stack → attach' },
    'crew-ability': { mechanics: ['vehicle'], path: 'tap creature power → Vehicle becomes creature for the turn' },
    'aura-etb-tap': { mechanics: ['aura', 'trigger'], path: 'attached Aura ETB → trigger Stack → tap host' },
    'spell-draw': { mechanics: ['spell', 'draw'], path: 'Stack resolution → exact card draw' },
    'spell-counter': { mechanics: ['spell', 'counter'], path: 'stack target lock → uncounterable check → counter' },
    'spell-destroy': { mechanics: ['spell', 'destroy'], path: 'permanent target lock → resolution revalidation → destroy/SBA' },
    'spell-exile': { mechanics: ['spell', 'exile'], path: 'permanent target lock → resolution revalidation → exile' },
    'spell-damage': { mechanics: ['spell', 'damage'], path: 'target lock or each-opponent set → damage event/SBA' },
    'spell-pump': { mechanics: ['spell', 'continuous effect'], path: 'creature target lock → EOT P/T/keyword layer → SBA' },
    'spell-team-pump': { mechanics: ['spell', 'continuous effect'], path: 'controller battlefield set → EOT P/T/keyword layer → SBA' },
    'spell-life-gain': { mechanics: ['spell', 'life'], path: 'Stack resolution → life gain event' },
    'spell-bounce': { mechanics: ['spell', 'zone change'], path: 'permanent target lock → hand zone change/LKI' },
    'spell-discard': { mechanics: ['spell', 'discard'], path: 'player target lock → controller card choice → discard events' },
    'spell-mill': { mechanics: ['spell', 'mill'], path: 'player target lock → ordered library-to-graveyard moves' },
    'spell-draw-discard': { mechanics: ['spell', 'draw', 'discard'], path: 'Stack resolution → ordered draw → exact discard choice' },
    'spell-token-creation': { mechanics: ['spell', 'token'], path: 'Stack resolution → exact token characteristics and abilities' },
    'spell-token-roll-threshold': { mechanics: ['spell', 'token', 'die roll'], path: 'Stack resolution → exact base tokens → deterministic die roll → subtype threshold bonus token' },
    'spell-global-pump': { mechanics: ['spell', 'continuous effect'], path: 'Stack resolution → battlefield snapshot → EOT P/T layer → SBA' },
    'spell-counter-on-permanent': { mechanics: ['spell', 'counter'], path: 'target lock → Stack resolution → counter placement' },
    'spell-damage-prevention': { mechanics: ['spell', 'prevention'], path: 'Stack resolution → EOT combat-damage prevention replacement' },
    'damage-prevention': { mechanics: ['prevention'], path: 'battlefield static ability → matching damage event → prevention' },
    'spell-tap-untap': { mechanics: ['spell', 'tap', 'untap'], path: 'target lock → Stack resolution → exact tapped state' },
    'spell-library-selection': { mechanics: ['spell', 'scry', 'surveil'], path: 'Stack resolution → ordered library choice and zone moves' },
    'spell-add-mana': { mechanics: ['spell', 'mana'], path: 'Stack resolution → color choice → mana pool' },
    'spell-board-wipe': { mechanics: ['spell', 'destroy'], path: 'Stack resolution → simultaneous permanent set → destroy/LKI/SBA' },
    'continuous-layer': { mechanics: ['continuous effect'], path: 'recalc layers → current types/keywords/P/T' },
    'saga-chapter-stack': { mechanics: ['saga'], path: 'lore counter → chapter trigger → priority → sacrifice SBA' },
    'amass-army': { mechanics: ['amass'], path: 'choose/create Army → add subtype → counter replacement/events' },
    'ring-temptation': { mechanics: ['the Ring tempts you'], path: 'advance emblem → choose Ring-bearer → cumulative combat triggers' },
    'graveyard-zone-change': { mechanics: ['graveyard'], path: 'zone batch/LKI → target or choice → move/reanimate/exile' },
    'combat-trigger': { mechanics: ['combat'], path: 'attack/block/damage event → trigger → combat-safe effect' },
    'draw-discard-replacement': { mechanics: ['draw', 'discard'], path: 'individual draw/discard → replacement → event history' },
    'ward-alternative-cost': { mechanics: ['ward'], path: 'opponent target → ward trigger → sacrifice/pay or counter' },
    'cost-modification': { mechanics: ['cost reduction'], path: 'spell context → generic modifier → payment → mana value unchanged' },
    'generic-trigger-effect': { mechanics: ['trigger'], path: 'exact event/filter → target lock → Stack → ordered closed effects' },
    'generic-activated-effect': { mechanics: ['activated ability'], path: 'timing/target lock → exact cost → Stack → ordered closed effects' },
    'generic-continuous-effect': { mechanics: ['continuous effect'], path: 'scope/controller filter → recalculation layer → P/T/keyword/evasion state' },
    'generic-cost-modification': { mechanics: ['cost modification'], path: 'spell/controller filter → total mana cost → actual payment' },
    'attachment-granted-operation': { mechanics: ['granted ability'], path: 'attached permanent → host ability/controller → Stack resolution' },
    'spell-generic-effect': { mechanics: ['spell'], path: 'paid cast → legal targets → Stack → ordered closed effects' },
    'spell-copy-effect': { mechanics: ['spell copying'], path: 'paid cast → legal Stack spell → reject copying the printed uncopyable spell' },
    'mechanic-splice-v11': { mechanics: ['splice'], path: 'hand reveal → additional cost → combined targets → ordered text → copied spell' },
    'mechanic-cipher-v13': { mechanics: ['cipher'], path: 'spell resolution → optional encoding → combat trigger → cast copy from exile' },
    'characteristic-color-v14': { mechanics: ['all-color characteristic'], path: 'printed definition → color characteristic in every zone' },
    'mechanic-optional-cost-v14': { mechanics: ['optional additional cost'], path: 'announce → legal modes and targets → reserve cost objects → pay mana and exact cost → resolve' },
    'spell-modal-generic-effect': { mechanics: ['modal spell'], path: 'choose printed modes and targets → paid cast → printed resolution order' },
    'characteristic-power-toughness': { mechanics: ['characteristic defining ability'], path: 'printed count expression → every zone → continuous P/T layer' },
    'mechanic-unearth': { mechanics: ['unearth'], path: 'sorcery activation in graveyard → Stack → haste → exile replacement and delayed exile' },
    'mechanic-grave-return-self': { mechanics: ['graveyard ability'], path: 'mana payment → Stack → same graveyard object returns to hand' },
    'mechanic-embalm': { mechanics: ['embalm'], path: 'sorcery graveyard activation → exile cost → white Zombie copy' },
    'mechanic-eternalize': { mechanics: ['eternalize'], path: 'sorcery graveyard activation → exile cost → black 4/4 Zombie copy' },
    'mechanic-ninjutsu': { mechanics: ['ninjutsu'], path: 'unblocked attacker return cost → Stack → tapped attacking entry' },
    'mechanic-foretell': { mechanics: ['foretell'], path: 'special action → face-down exile → later-turn alternative cast' },
    'mechanic-madness': { mechanics: ['madness'], path: 'discard replacement → exile trigger → paid alternative cast or graveyard' },
    'mechanic-buyback': { mechanics: ['buyback'], path: 'additional mana payment → return only on successful resolution' },
    'mechanic-split-second': { mechanics: ['split second'], path: 'Stack lock on spells and nonmana activations; special actions and triggers remain legal' },
    'mechanic-jump-start': { mechanics: ['jump-start'], path: 'graveyard cast → discard additional cost → exile on Stack departure' },
    'mechanic-fading': { mechanics: ['fading'], path: 'entry fade counters → upkeep removal or sacrifice' },
    'mechanic-vanishing': { mechanics: ['vanishing'], path: 'entry time counters → upkeep removal → separate last-counter sacrifice trigger' },
    'mechanic-cumulative-upkeep': { mechanics: ['cumulative upkeep'], path: 'upkeep age counter → full repeated payment or sacrifice' },
    'split-casting': { mechanics: ['split','fuse','aftermath'], path: 'choose legal half → pay face cost → face characteristics and resolution' },
    'double-faced-card': { mechanics: ['modal double-faced card'], path: 'choose a legal printed face → use that face on Stack or battlefield → reset to front after other zone changes' },
    'class-levels-v20': {mechanics:['Class levels'],path:'pay the successive level activation at sorcery speed → permanent designation → cumulative level abilities → reset on zone change'},
    'room-doors-v20': {mechanics:['Room doors'],path:'cast either door → unlocked characteristics and abilities → pay a locked door as a sorcery special action → unlock trigger → reset on zone change'},
    'flip-faces-v20': {mechanics:['Flip cards'],path:'cast the unflipped card → complete printed flip condition → one-way status change with retained mana cost and color → copy and zone reset semantics'},
    'permanent-haunt-v20': {mechanics:['Creature haunt'],path:'death trigger → target creature → exile the same graveyard object → track the haunted incarnation → resolve its printed death trigger from exile'},
    'damage-rule-v20': {mechanics:['Damage replacement and prevention'],path:'match exact source and recipient → affected player orders replacements → apply printed prevention, amount change or counters → perform exact additional effects'},
    'spell-keywords-v20': {mechanics:['Spell damage keywords'],path:'match a controlled instant or sorcery spell and its printed color restriction → retain granted damage keywords in the simultaneous damage snapshot → apply their normal damage rules'},
    'equip-cost-v20': {mechanics:['Equip cost changes'],path:'evaluate the selected equip target → apply the printed generic reduction → pay the resulting activation cost'},
    'ability-cost-attached-v20': {mechanics:['Attached ability cost changes'],path:'match only the attached permanent’s activated ability → apply its printed tax before reductions → pay the resulting cost including mana abilities'},
    'mana-flexibility-v20': {mechanics:['Flexible mana spending'],path:'match the printed spell or ability restriction → allow permitted colors to pay colored requirements → preserve colorless requirements and the actual colors spent'},
    'spell-cost-v20': {mechanics:['Spell cost changes'],path:'match the printed spell, player and zone → calculate the current amount → apply exact generic or colored adjustment → pay the resulting cost'},
    'permanent-day-night-v20': {mechanics:['Day and night'],path:'start day only when neither day nor night exists → preserve existing state → trigger only on the printed day to night or night to day transition'},
    'permanent-unattach-v20': {mechanics:['Becoming unattached'],path:'observe the actual attachment ending → retain the former host → put the printed triggered ability on the stack → resolve against that same object'},
    'mechanic-suspend-x-v20': {mechanics:['Variable suspend'],path:'declare and pay a positive X as a suspend special action → exile from hand with exactly X time counters → remove counters on upkeep → offer the printed optional free cast'},
    'mechanic-mana-x-v20': {mechanics:['Restricted X payments'],path:'declare X → pay its portion only with the printed mana colors → preserve the remaining fixed cost, cost adjustments and actual spending records'},
    'exile-return-v20': {mechanics:['Activated return from exile'],path:'activate only an owned card in exile → obey printed sorcery timing → pay the printed mana → put the ability on the stack → return that same exiled incarnation under its owner’s control with its printed tapped status'},
    'mechanic-tap-cost-v20': {mechanics:['Additional tap costs'],path:'choose the printed number of eligible untapped controlled permanents → reserve them during mana payment → validate their identities → tap them only for the successful cast'},
    'mechanic-craft-v20': {mechanics:['Craft'],path:'pay the printed mana and exile this artifact plus distinct qualifying materials from battlefield or graveyard → resolve the craft ability on the stack → return the same exiled card transformed under its owner’s control'},
    'craft-keywords-v20': {mechanics:['Craft linked abilities'],path:'read only the still-exiled materials linked to this crafted incarnation → inherit the printed keywords and their exact restrictions → stop when a material leaves exile or this permanent changes zones'},
    'permanent-choose-object-v20': {mechanics:['Chosen permanent'],path:'optionally choose the printed eligible permanent as this enters → retain its exact battlefield incarnation → apply the linked rules only while that same object remains'},
    'permanent-native-trigger-v20': {mechanics:['Enlist and crew triggers'],path:'observe the actual paid mechanic event → verify this source enlisted or crewed → capture the printed event object → put its complete reward on the stack'},
    'permanent-discard-replacement-v20': {mechanics:['Discard replacement'],path:'detect discard caused by an opponent’s spell or ability → offer the printed replacement in the ordered zone replacement choice → put the exact discarded card in its printed destination with its entry counters'},
    'target-restriction-v20': {mechanics:['Targeting restrictions'],path:'retain whether the stack object is a spell or an ability → match its controller and printed colors → exclude the printed objects at target selection and resolution'},
    'life-rule-v20': {mechanics:['Life total rules'],path:'apply only the printed player, turn and condition → preserve damage while bounding resulting life loss, lock life changes and payments, multiply loss, or suppress only the zero-life state-based loss'},
    'player-protection-v20': {mechanics:['Protection'],path:'match the protected player and source controller → prevent damage and reject targeting and Aura attachment → honor ability loss and the printed duration'},
    'mechanic-reveal-cost-v20': {mechanics:['Additional reveal costs'],path:'reserve one creature card in hand → validate and reveal that exact card with payment → preserve the bound card and last known characteristics on the spell'},
    'mechanic-prowl-v20': {mechanics:['Prowl'],path:'verify this turn’s combat damage by a shared creature type → offer and pay the printed alternative cost → retain the paid choice on the spell and its copies'},
    'mechanic-kicker-x-v20': {mechanics:['Variable kicker'],path:'announce an additional X → pay the printed kicker mana cost → capture the paid amount for the entering permanent’s triggered ability'},
    'permanent-choose-opponent-v20': {mechanics:['Chosen opponent'],path:'choose an opponent as this permanent enters → retain the choice for this incarnation → apply the printed linked continuous and upkeep effects'},
    'permanent-choose-card-type-v20': {mechanics:['Chosen card type'],path:'choose one allowed card type as this permanent enters → retain the choice for this incarnation → apply its linked rules'},
    'permanent-combat-tax-v20': {mechanics:['Combat mana payments'],path:'match each attacking or blocking creature and its printed restriction → calculate the live mana payment → validate and pay for the complete declaration'},
    'spell-alternative-v20': {mechanics:['Alternative spell costs'],path:'offer the printed alternative mana cost from a legal zone → preserve timing and additional costs → recheck the live permission → pay the selected cost'},
    'flashback-cost-v20': {mechanics:['Flashback cost changes'],path:'printed flashback cast → calculate applicable generic adjustment → pay exact cost → retain native exile replacement'},
    'case-solved-v20': {mechanics:['Case solved'],path:'own end step with intervening solve condition → permanent designation → solved abilities → reset on zone change'},
    'cast-disturb-v20': {mechanics:['disturb'],path:'printed front in graveyard → pay disturb cost → cast and resolve its back face → printed graveyard replacement'},
    'station-tiers-v20': {mechanics:['station tiers'],path:'sorcery-speed Station tap cost → charge counters equal to creature power → cumulative tier abilities and printed creature threshold'},
    'grant-mana-v20': {mechanics:['granted mana abilities'],path:'live filtered or attached source → printed activation costs and restricted mana'},
    'mechanic-assist-v20': {mechanics:['assist'],path:'one chosen other player may contribute generic mana → both payment plans validated → pay and cast'},
    'top-library-permission-v20': {mechanics:['library casting'],path:'live source and printed card filter → current library top → normal payment and timing'},
    'cast-permission-v20': {mechanics:['casting permissions'],path:'exact source and card zones → printed filter and turn limit → legal cost and timing → revalidate at announcement'},
    'ability-floor-cost-v20': {mechanics:['activation costs'],path:'live source filters the activated ability → generic reduction preserves the printed minimum cost'},
    'mechanic-impending-v20': {mechanics:['impending'],path:'alternative cast → time counters and noncreature state → controller end-step countdown'},
    'permanent-rule-v20': {mechanics:['permanent rules'],path:'live source and exact event or attachment scope → enforce the printed prohibition'},
    'permanent-static-v20': {mechanics:['continuous effects'],path:'live permanent and printed condition → filtered characteristics and permissions'},
    'permanent-trigger-doubler-v20': {mechanics:['additional triggers'],path:'qualifying permanent trigger or entry cause → additional matching trigger'},
    'permanent-counter-replacement-v20': {mechanics:['counter replacements'],path:'proposed counter addition → exact printed replacement scope → adjusted addition'},
    'permanent-event-trigger-v20': {mechanics:['counter threshold'],path:'actual counter change crosses printed threshold → triggered effect on the Stack'},
    'closed-permanent-clauses': {mechanics:['composed abilities'],path:'each complete printed clause → independently compiled operation'},
    'permanent-name-rule-v22': {mechanics:['Named card restriction'],path:'apply the printed casting, activation or cost rule to cards with the declared name while its source remains active'},
    'permanent-grantor-operation-v22': {mechanics:['Equipment granted ability'],path:'equip a live creature and grant it the printed activation with the Equipment source captured through payment and resolution'},
    'permanent-propagated-static-v22': {mechanics:['Propagated Equipment ability'],path:'an enchanted Equipment grants its printed static ability to the creature it currently equips'},
    'permanent-name-entry-v22': {mechanics:['Chosen card name'],path:'choose a permitted printed card name as the source enters and bind its printed name rules to that source incarnation'},
    'spell-repeat-modes-v22': {mechanics:['Repeated modes'],path:'choose the printed number or symbol budget of modes with repetition and announce all targets before paying and resolving the printed sequence'},
    'converted-casting-v22': {mechanics:['More Than Meets the Eye'],path:'choose the complete converted face and printed alternative cost, pay it and retain the physical front and back face relationship'},
    'living-metal-v22': {mechanics:['Living metal'],path:'the converted Vehicle has its creature type during its controller turn with its printed power and toughness'},
    'permanent-attached-type-set-v23': {mechanics:['Attached type change'],path:'apply the printed type, subtype, color and ability layers to the exact attached permanent'},
    'permanent-attached-name-v23': {mechanics:['Attached name change'],path:'the attached permanent has the printed replacement name while the Aura remains attached and active'},
    'permanent-attached-mechanic-v23': {mechanics:['Attached keyword'],path:'grant the host the printed executable keyword mechanic and exact cost while the Aura remains attached'},
    'permanent-zone-keyword-v23': {mechanics:['Granted zone ability'],path:'the active permanent grants the printed native keyword in its specified zone with its exact cost and restrictions'},
    'spell-origin-branches-v23': {mechanics:['Casting origin'],path:'compile both complete resolution bodies and use the graveyard branch only for a spell actually cast from that zone'},
    'mechanic-licid-v24': {mechanics:['Licid'],path:'Pay mana and tap to become an Aura attached to the targeted creature; the printed payment ends that continuous effect as a special action'},
    'spell-epic-v24': {mechanics:['Epic'],path:'Resolve the complete spell, prohibit further spell casting for its controller, and copy the spell without Epic at every subsequent own upkeep'},
    'grant-native-activation-v25': {mechanics:['equip','crew'],path:'Grant a separately paid native Equip or Crew ability while retaining every printed activation'},
    'permanent-linked-look-v25': {mechanics:['Linked exile information'],path:'Reveal or inspect only cards exiled by the matching acquisition and still in that exile incarnation'},
    'permanent-linked-permission-v25': {mechanics:['Linked exile casting'],path:'Grant the printed bounded casting permission for the exact acquired cards while its source and duration remain valid'},
    'attack-player-land-count-v25': {mechanics:['attack'],path:'Observe the declared defending player and count their lands before resolving the complete attack trigger'},
    'entry-life-v26': {mechanics:['entry'],path:'Pay the chosen legal life amount before entry and retain it for this battlefield incarnation'},
    'entry-form-v26': {mechanics:['entry'],path:'Choose copiable power, toughness and traits on paid entry or a paid turn face up'},
    'permanent-donor-mana-v28': {mechanics:['mana','additional cost'],path:'Pay an actual creature donor and produce mana using its captured printed characteristic and restrictions'},
    'permanent-zone-replacement-v28': {mechanics:['zone replacement'],path:'Choose the applicable replacement order and commit the resulting zone move atomically'},
    'permanent-named-animation-v29': {mechanics:['continuous characteristics','animation'],path:'Apply the printed animation only to the named permanent while its source and duration remain valid'},
    'spell-battlefield-exile-cost-v29': {mechanics:['additional cost'],path:'Choose and exile the required controlled creature as an actual additional casting cost'},
    'entry-land-type-v28': {mechanics:['entry','land type'],path:'Choose legal printed land types for the current battlefield incarnation, including optional life payments'},
    'chosen-land-types-v28': {mechanics:['land type','mana'],path:'Apply chosen land types in the native type layer and supply the correct intrinsic mana abilities'},
    'mana-activation-life-v28': {mechanics:['mana','life cost'],path:'Pay the printed additional life for each actual intrinsic mana activation'},
    'chosen-landwalk-v28': {mechanics:['combat','landwalk'],path:'Use the chosen defending land subtype to validate actual blocking'},
    'chosen-land-phasing-v28': {mechanics:['untap','phasing'],path:'Phase the chosen-type lands in each controller untap action without changing incarnation'},
    'chosen-land-tap-life-v28': {mechanics:['tap','life'],path:'Queue life gain for actual opposing chosen-land tap events'},
    'entry-creature-type-v28': {mechanics:['entry','creature type'],path:'Choose a legal creature type on paid or opening entry and retain it through saves'},
    'chosen-creature-types-v28': {mechanics:['continuous characteristics'],path:'Apply the selected creature type to all printed zones and restore printed types after expiration'},
    'spell-custom-cost-v28': {mechanics:['additional cost'],path:'Select and pay the exact printed additional objects before committing the spell'},
    'spell-tap-evidence-v28': {mechanics:['additional cost'],path:'Capture actual tapped objects and consume their characteristics on resolution and copies'},
    'spell-target-quota-v28': {mechanics:['target choice'],path:'Require the exact printed target quota from the locked spell announcement'},
    'spell-x-bound-v28': {mechanics:['X choice'],path:'Validate the printed X bound before paying mana or moving the source'},
    'entry-number-v27': {mechanics:['entry'],path:'Choose a legal integer on paid entry and retain it for this battlefield incarnation'},
    'chosen-number-casting-ban-v27': {mechanics:['casting'],path:'Prohibit noncreature spells with the chosen mana value, including announced X'},
    'number-cast-trigger-v27': {mechanics:['casting','trigger'],path:'Match an opponent creature spell power, toughness or mana value once per actual cast'},
    'number-attack-trigger-v27': {mechanics:['combat','trigger'],path:'Trigger once per attacked opponent and check the locked attacking creatures again on resolution'},
    'spell-cast-number-v27': {mechanics:['Additional casting cost'],path:'Choose the printed legal number during casting, retain it on spell copies and resolve both printed damage branches'},
    'spell-payment-snapshot-v27': {mechanics:['Paid object'],path:'Bind resolution values, searches and delayed consequences to actual paid objects and locked cohort identities'},
    'spell-kicker-sacrifice-union-v27': {mechanics:['Kicker'],path:'Reserve and pay the printed artifact-or-Goblin sacrifice before enabling the complete kicked spell branch'},
    'spell-sacrifice-all-v27': {mechanics:['Sacrifice'],path:'Gather every player choice before one native simultaneous sacrifice batch'},
    'permanent-linked-entry-exile-v27': {mechanics:['Linked exile entry'],path:'Bind printed entry acquisitions, returns and copy values to exact exiled objects'},
    'permanent-linked-own-turn-permission-v27': {mechanics:['Linked exile casting'],path:'Play only linked cards during the source controller own turns'},
    'permanent-mana-double-v27': {mechanics:['Mana'],path:'Pay the native activation and double every actual mana unit with its spending restriction'},
    'permanent-defending-cast-ban-v27': {mechanics:['Combat casting restriction'],path:'Prohibit the defending player casting while the printed combat source remains active'},
    'permanent-last-cast-color-ban-v27': {mechanics:['Casting restriction'],path:'Compare spell colors against the most recent actual cast and reject prohibited casts before payment'},
    'permanent-linked-lens-v26': {mechanics:['Linked exile mana'],path:'Add matching-name mana immediately from the exact imprinted land name'},
    'permanent-linked-look-play-v26': {mechanics:['Linked exile play'],path:'Inspect and play only live linked exile cards during the printed permission'},
    'spell-payment-values-v26': {mechanics:['Additional cost'],path:'Capture paid objects before their cost movement and retain their characteristics on spell copies'},
    'spell-casting-cohorts-v26': {mechanics:['Casting choice'],path:'Capture the printed cohort when the spell is cast and resolve against its locked identities'},
    'spell-conditional-rules-v26': {mechanics:['Conditional spell'],path:'Resolve every printed spell branch using its paid mana or resolution condition'},
    'spell-x-flash-v26': {mechanics:['Flash'],path:'Apply the printed flash threshold to the announced X and pay the actual spell cost'},
    'spell-damage-override-v26': {mechanics:['Damage'],path:'Use the printed damage traits and native simultaneous damage pipeline'},
    'permanent-linked-mana-v24': {mechanics:['Linked exile mana'],path:'Use the exact linked exiled cards to determine the printed mana choice while their exile incarnation remains valid'},
    'permanent-linked-name-ban-v24': {mechanics:['Linked exile restriction'],path:'Apply the printed casting restriction using only names of cards exiled by the linked ability'},
    'permanent-linked-cost-v24': {mechanics:['Linked exile discount'],path:'Apply the printed cost reduction only for card types recorded by the linked acquisition'},
    'mechanic-aggregate-cost-v24': {mechanics:['Additional cost'],path:'Announce optional sacrifices, reserve their exact identities, commit their payments, and retain the printed aggregate for resolution'},
    'mechanic-repeat-mana-v24': {mechanics:['Repeat payment'],path:'Choose and actually pay the printed optional mana cost any number of times and retain its count for resolution'},
    'mechanic-dual-kicker-v24': {mechanics:['Optional casting cost'],path:'Announce either or both printed kicker costs and pay each selected cost before casting'},
    'dual-kicker-entry-v24': {mechanics:['Optional casting cost'],path:'Apply the printed entry counters or keyword grants from the copied kicker choices'},
    'dual-kicker-entry-mill-v24': {mechanics:['Optional casting cost'],path:'Resolve the printed entry mill amount for every paid kicker cost'},
    'mechanic-hand-exile-reduction-v24': {mechanics:['Optional casting cost'],path:'Choose and reserve colored hand cards, reduce generic mana, and exile each reserved card as the casting cost'},
    'opening-reveal-v23': {mechanics:['Opening disclosure'],path:'optional opening-hand reveal creates the printed delayed Stack ability for the first specified event'},
    'mechanic-splice-payment-v23': {mechanics:['Splice'],path:'announce the combined spell and targets, reserve and pay all nonmana splice costs, and retain the spliced card in hand'},
    'mechanic-flashback-payment-v23': {mechanics:['Flashback'],path:'announce a graveyard spell with the exact alternative mana and nonmana costs, then exile it when it leaves the Stack'},
    'mechanic-buyback-payment-v23': {mechanics:['Buyback'],path:'reserve and pay mana plus additional buyback costs before the cast and return a resolved paid spell to hand'},
    'mechanic-escalate-payment-v23': {mechanics:['Escalate'],path:'announce modes and targets, then pay the printed nonmana cost for every additional mode'},
    'mechanic-replicate-payment-v23': {mechanics:['Replicate'],path:'announce and pay the energy replicate cost before creating the announced number of spell copies'},
    'mechanic-alternative-payment-v23': {mechanics:['Alternative cost'],path:'announce the printed alternative cost and X, reserve its legal nonmana choices, then commit all required payments before casting'},
    'mechanic-dragon-reveal-v23': {mechanics:['Dragon reveal'],path:'optionally reveal the printed Dragon card during casting and retain the reveal and controlled-Dragon snapshot for later resolution'},
    'mechanic-dragon-uncounterable-v23': {mechanics:['Dragon reveal'],path:'the casting-time reveal or controlled-Dragon snapshot gives the printed uncounterable property to the actual spell'},
    'mana-retention-v22': {mechanics:['Retained mana'],path:'retain unspent mana of the printed color through step and phase transitions while the source remains active'},
    'gift-spell-v21': {mechanics:['Gift'],path:'promise a gift when casting → announce the matching complete spell body → give the chosen opponent the gift before resolving the printed effects'},
    'mechanic-read-ahead-v21': {mechanics:['Read ahead'],path:'choose a starting chapter as the Saga enters → skip earlier chapters → advance through the remaining printed chapters'},
    'casting-waterbend-v21': {mechanics:['Additional waterbend cost'],path:'pay the printed mana cost and additional waterbend amount → tap eligible untapped artifacts or creatures for waterbend only'},
    'mechanic-compleated-v21': {mechanics:['Compleated'],path:'choose mana or life for each printed Phyrexian symbol → pay the chosen costs → enter with the exact printed loyalty reduction'},
    'self-cost-v21': {mechanics:['Variable spell cost'],path:'count the printed live objects or values → reduce the applicable generic or colored mana requirements → pay the resulting cost'},
    'spell-cost-sequence-v21': {mechanics:['Numbered spell cost'],path:'count this turn’s previously cast qualifying spells → apply the reduction only to the printed ordinal spell'},
    'spell-conditional-modes-v21': {mechanics:['Conditional modes'],path:'evaluate the printed condition when casting → choose an allowed combination → announce all selected targets → retain those modes through resolution'},
    'spell-kicker-branches-v21': {mechanics:['Kicker branches'],path:'choose and pay kicker when casting → announce the complete kicked or ordinary target set → resolve the chosen printed instructions'},
    'day-night-v9': {mechanics:['daybound','nightbound'],path:'cast the front → enter according to day/night → transform through the turn-based day/night action'},
    'mechanic-amplify-v9': {mechanics:['amplify'],path:'reveal matching hand cards on entry → enter with counters'},
    'mechanic-mutate-v10': {mechanics:['mutate'],path:'pay mutate cost → target an owned non-Human creature → merge over or under → trigger mutate abilities'},
    'mechanic-start-engines-v10': {mechanics:['start your engines'],path:'initialize speed → once-per-turn inherent trigger → max speed'},
    'mechanic-saddle-v10': {mechanics:['saddle'],path:'sorcery-speed activation → tap other creatures with enough total power → resolve saddled designation until cleanup'},
    'mechanic-prototype-v10': {mechanics:['prototype'],path:'choose printed characteristics → pay chosen cost → preserve prototype on Stack and battlefield → reset on zone departure'},
    'mechanic-bargain-v10': {mechanics:['bargain'],path:'optional artifact, enchantment or token sacrifice → reserve complete costs → pay and remember bargain'},
    'mana-bonus-v10': {mechanics:['additional mana'],path:'qualifying tap for mana → include the additional mana in affordability and actual payment'},
    'damage-prevention-rule-v10': {mechanics:['damage prevention prohibition'],path:'live source and printed damage scope → ignore prevention while applying other damage replacements'},
    'mechanic-saddle-crew-power-v10': {mechanics:['crew','saddle'],path:'printed power contribution → legal creature selection → actual crew or saddle tap payment'},
    'mechanic-prowess-v10': {mechanics:['prowess'],path:'noncreature cast → trigger → pump the same source object until cleanup'},
    'mechanic-player-rule-v10': {mechanics:['player restrictions'],path:'live permanent → authoritative land, search, or win/loss restriction'},
    'prepare-entry-v10': {mechanics:['prepare'],path:'entry replacement → one prepared copy in exile'},
    'prepare-casting-v10': {mechanics:['prepare','spell'],path:'prepared permanent → paid copy cast from exile → unprepare'},
    'mechanic-printed-keywords-v10': {mechanics:['wither'],path:'printed spell keyword → actual damage counters'},
    'characteristic-subtypes-v10': {mechanics:['characteristic defining types'],path:'additional printed creature types apply in every zone'},
    'mechanic-increment-v9': {mechanics:['increment'],path:'actual spell mana spent → intervening power or toughness comparison → counter'},
    'mechanic-player-shroud-v9': {mechanics:['shroud'],path:'active permanent prevents every player from targeting its controller'},
    'uncounterable-spells-v9': {mechanics:['uncounterable'],path:'live provider filters the actual spell on the Stack'},
    'cast-self-exile-v17': {mechanics:['exile casting'],path:'face-up card in its owner’s exile → normal paid cast and timing'},
    'hand-visibility-v17': {mechanics:['hand visibility'],path:'active source → scoped public hands in Solo and multiplayer'},
    'library-visibility-v17': {mechanics:['library visibility'],path:'active source → correctly scoped Solo and multiplayer top-card visibility'},
    'mechanic-freerunning-v9': {mechanics:['freerunning'],path:'Assassin or commander combat damage this turn → alternate paid cast'},
    'mechanic-leyline-v9': {mechanics:['opening permanent'],path:'opening-hand choice → battlefield before the first turn'},
    'mechanic-umbra-armor-v9': {mechanics:['umbra armor'],path:'enchanted permanent destruction → destroy this Aura and clear damage instead'},
    'casting-prohibition-v9': {mechanics:['casting restrictions'],path:'active source and printed turn window → prevent forbidden spell announcements and payments'},
    'mechanic-station-v9': {mechanics:['station'],path:'sorcery activation taps another creature → power on resolution → charge threshold'},
    'mechanic-skip-draw-v9': {mechanics:['skip draw step'],path:'active permanent causes its controller to skip the draw step'},
    'mechanic-devour-v9': {mechanics:['devour'],path:'sacrifice only the specified permanent type as this enters → add the printed number of counters per sacrifice'},
    'mechanic-recover-v9': {mechanics:['recover'],path:'another creature enters your graveyard from the battlefield → pay and return this card or exile it'},
    'mechanic-mayhem-v9': {mechanics:['mayhem'],path:'discard this exact card → cast it from your graveyard this turn with normal timing → resolve as a permanent'},
    'mechanic-reconfigure-v9': {mechanics:['reconfigure'],path:'pay sorcery activation → attach or unattach → update creature type'},
    'mechanic-champion-v9': {mechanics:['champion'],path:'optional exile of another matching permanent → linked leave trigger returns that exact card'},
    'damage-prevention-prohibition-v9': {mechanics:['damage prevention prohibition'],path:'active permanent prevents damage prevention'},
    'life-gain-prohibition-v9': {mechanics:['life gain prohibition'],path:'active permanent prevents life gain for the printed players'},
    'commander-pairing': { mechanics: ['commander pairing'], path: 'exact printed pairing tag → commander eligibility and exact mate rule → combined color identity; Partner with also targets a player, searches the named card and shuffles' },
    'mechanic-bestow': { mechanics: ['bestow'], path: 'choose the alternative cost → target as an Aura spell → enter attached, or continue resolving as a creature when the target is illegal → become a creature when unattached' },
    'mechanic-entwine': { mechanics: ['entwine'], path: 'choose every printed mode → pay the exact additional mana or sacrifice cost → announce every target → resolve the chosen modes in printed order' },
    'mechanic-strive-v8': { mechanics: ['strive'], path: 'announce every target → printed strive cost per target beyond the first → single payment → resolution against the whole target set' },
    'mechanic-ward-v8': { mechanics: ['ward'], path: 'opponent target → ward trigger → pay the printed life or discard cost or counter the spell' },
    'mechanic-mayhem-v8': { mechanics: ['mayhem'], path: 'discard this turn → graveyard cast for the mayhem cost → resolution → exile instead of graveyard' },
    'mechanic-level-up-v8': { mechanics: ['level up'], path: 'sorcery-speed level-up activation → level counter → the live band sets base power, toughness and printed keywords, and gates its own abilities, statics, triggers and mana' },
    'mechanic-harmonize-v8': { mechanics: ['harmonize'], path: 'graveyard cast permission → harmonize cost with the optional creature tap reduction → resolution → exile instead of graveyard' },
    'saga-chapters': { mechanics: ['saga'], path: 'lore crossing → chapter Stack → final chapter leaves Stack → state-based sacrifice' },
    'copy-as-enters': { mechanics: ['copy'], path: 'non-target entry choice → copiable characteristics and entry replacements → zone-change reset' },
    'copy-as-enters-v8': { mechanics: ['copy'], path: 'entry choice → exact copiable modifications → entry replacements → zone reset' },
    'as-enters-color-choice': { mechanics: ['color-choice'], path: 'entry replacement → controller selects an allowed color → persist on this object → choose again on reentry' },
    'as-enters-subtype-choice-v16': { mechanics: ['creature-type-choice'], path: 'entry replacement → choose an existing creature type → bind to this object → choose again on reentry' },
    'spell-target-tax-v16': { mechanics: ['casting-cost'], path: 'announce targets → apply each matching source surcharge once → pay the full spell cost' },
    'untap-limit-v17': { mechanics: ['untap-limit'], path: 'snapshot untap restrictions → affected controller chooses a legal subset → simultaneous untap' },
    'chosen-color-mana-source': { mechanics: ['mana', 'color-choice'], path: 'chosen color → tap the source → add only the selected mana → enforce any land ability spending restriction' },
    'mechanic-ascend': { mechanics: ['ascend'], path: 'ten controlled permanents → persistent city blessing → live conditional effects' },
    'aura-control-v8': { mechanics: ['control'], path: 'Aura attachment → continuous control layer → timestamp and dependency recheck' },
    'ordered-replacement-effect': { mechanics: ['replacement'], path: 'affected player orders applicable replacements → recheck after each → transformed event' },
    'graveyard-continuous-effect': { mechanics: ['graveyard-static'], path: 'source in owner graveyard → live condition → owner permanents receive keywords or mana abilities → source leaves graveyard and grant ends' },
    'continuous-ability-removal': { mechanics: ['ability-removal', 'continuous-effect'], path: 'type and color changes → layer-six ability removal and later grants → base power/toughness → source, zone and duration rechecks' },
    'continuous-layered-characteristics': { mechanics: ['type-color-change', 'continuous-effect'], path: 'begin type or color layer → capture affected permanents → continue the same effect through ability and power/toughness layers → recalculate on condition or source changes' },
    'continuous-characteristic-type': { mechanics: ['type-color-change'], path: 'continuous type and color layer → source condition and control → live affected permanents → source removal' },
    'continuous-basic-land-types': { mechanics: ['type-color-change', 'mana'], path: 'basic land type layer → intrinsic mana abilities → ability removal layer → source removal restores prior types and abilities' },
    'landwalk-override-v15': { mechanics: ['landwalk'], path: 'live global or attached source → ignore matching landwalk only while declaring blockers → source removal restores evasion' },
    'base-pt-static': { mechanics: ['base-power-toughness'], path: 'continuous layer 7b in timestamp order → modifiers and counters → live source removal' },
    'protection-static': { mechanics: ['protection'], path: 'live quality filter → targeting, damage, blocking and attachment restrictions' },
    'mechanic-evoke': { mechanics: ['evoke'], path: 'alternative mana payment → permanent spell → ETB sacrifice trigger' },
    'mechanic-dredge': { mechanics: ['dredge'], path: 'individual draw replacement → mill cost → graveyard card to hand' },
    'mechanic-surge': { mechanics: ['surge'], path: 'prior spell cast this turn → optional alternate mana cost' },
    'mechanic-spectacle': { mechanics: ['spectacle'], path: 'opponent lost life this turn → optional alternate mana cost' },
    'mechanic-devour': { mechanics: ['devour'], path: 'entry replacement → optional creature sacrifices → entry counters' },
    'mechanic-graft': { mechanics: ['graft'], path: 'entry counters → creature arrival trigger → move counter between exact objects' },
    'mechanic-plot': { mechanics: ['plot'], path: 'paid special action → exile → sorcery-speed free cast on a later turn' },
    'mechanic-dash': { mechanics: ['dash'], path: 'alternative payment → haste → delayed return at the next end step' },
    'mechanic-echo': { mechanics: ['echo'], path: 'control history → next-upkeep trigger → pay mana or sacrifice' },
    'mechanic-kicker': { mechanics: ['kicker'], path: 'optional additional mana payment → captured kicked choice' },
    'mechanic-additional-costs': { mechanics: ['additional costs'], path: 'announce targets → commit validated sacrifices/discards/life payment → Stack' },
    'mechanic-equip-reduction-v8': { mechanics: ['equip'], path: 'evaluate the actual Equipment activation and announced target → reduce only generic mana → pay' },
    'mechanic-zone-keyword-cost-v8': { mechanics: ['cycling','eternalize'], path: 'exact extra cost and source payment → respondable ability → draw or modified copy' },
    'mechanic-cycling-rule-v8': { mechanics: ['cycling'], path: 'battlefield cycling prohibition or generic discount → real legal activation and payment' },
    'mechanic-miracle-v8': { mechanics: ['miracle'], path: 'reveal first draw → respondable Miracle trigger → identity-bound optional paid cast during resolution' },
    'mechanic-encore-v8': { mechanics: ['encore'], path: 'pay and exile from graveyard → create copies for opponents → haste and attack requirements → sacrifice exact tokens at next end step' },
    'mechanic-keyword-payment-v8': { mechanics: ['flashback', 'kicker', 'buyback'], path: 'announce printed keyword cost → choose targets → validate complete payment → pay → resolve with paid keyword state' },
    'mechanic-upkeep-cost-v8': { mechanics: ['cumulative-upkeep', 'echo'], path: 'capture upkeep and source identity → choose every cost → validate complete payment → pay or sacrifice' },
    'mechanic-morph-cost-v8': { mechanics: ['morph'], path: 'cast face down → validate printed nonmana payment → pay → turn face up as a special action' },
    'mechanic-awaken-v8': { mechanics: ['awaken'], path: 'choose printed alternative cost → announce original targets and own land → pay → Stack → counters and permanent animation' },
    'mechanic-casting-choice-v8': { mechanics: ['additional costs'], path: 'announce targets → choose an affordable printed cost → validate exact objects → pay total mana and chosen cost → Stack' },
    'rule-static-v18': { mechanics: ['battlefield rules'], path: 'resolve source → apply the printed global rule while its abilities are active → restore normal rules after source leaves' },
    'ability-cost-v18': { mechanics: ['activation costs'], path: 'match source, zone and ability kind → adjust generic mana → pay the complete activation cost' },
    'keyword-cost-v19': { mechanics: ['buyback costs'], path: 'choose buyback → reduce its generic additional cost → pay and resolve with buyback' },
    'entry-prohibition-v19': { mechanics: ['battlefield entry prohibition'], path: 'origin zone and card types → active prohibition → keep original zone and identity' },
    'damage-redirection-v19': { mechanics: ['damage redirection'], path: 'affected player orders replacements → change recipient → recheck prevention and protection' },
    'entry-trigger-suppression-v19': { mechanics: ['entry trigger suppression'], path: 'entering object types → active rule → suppress entry and landfall triggers' },
    'spell-keyword-grant-v19': { mechanics: ['granted cascade', 'granted improvise'], path: 'live battlefield source → matching spell → casting payment or cascade Stack' },
    'filtered-lure-v19': { mechanics: ['blocking requirement'], path: 'matching blockers → bound source → maximum legal blocking requirements' },
    'blocking-permission-v19': { mechanics: ['blocking permission'], path: 'attacker subtype or shadow → canBlock → legal declaration' },
    'mechanic-alternative-costs-v8': { mechanics: ['alternative costs'], path: 'choose a printed canonical alternative → recheck its condition and zone → pay exact mana and additional costs → Stack → resolution' },
    'casting-cost-modifiers-v8': { mechanics: ['casting cost modifiers'], path: 'check every printed condition and live count → combine exact reductions → choose targets → pay the adjusted cost → Stack' },
    'casting-restriction-v8': { mechanics: ['casting restrictions'], path: 'reject an unmet printed casting restriction → satisfy it → recheck before payment → cast through Stack' },
    'state-trigger-v8': { mechanics: ['state triggers'], path: 'observe the current state → queue one trigger per source ability while pending → resolve through Stack → check the state again' },
    'ripple-cast-chain': { mechanics: ['ripple'], path: 'cast and pay → resolve Ripple → reveal the locked top cohort → optionally cast same-name spells → order the remainder on the bottom → place subsequent triggers' },
    'soulbond-pairing': { mechanics: ['soulbond'], path: 'resolve the printed entry trigger → choose an unpaired creature → retain the pair while both exact creatures stay under one controller' },
    'entry-counter-replacement': { mechanics: ['entry counters'], path: 'prepare the printed entry choice → inspect paid cast and public state → apply the exact counters as the permanent enters' },
    'creature-upgrade-status': { mechanics: ['monstrosity','tribute'], path: 'pay the printed activation or resolve the entry choice → exact counters and incarnation-bound status → respondable triggered consequence' },
    'exert-attack': { mechanics: ['exert'], path: 'choose exert while declaring attackers → pay the exertion cost → linked respondable trigger → skip the exerting player’s next actual untap step' },
    'ordered-draw-replacement': { mechanics: ['draw replacements'], path: 'propose one draw → affected player orders exact replacements → perform the chosen draw or replacement once' },
    'ordered-zone-replacement': { mechanics: ['zone replacements'], path: 'inspect the proposed zone move → affected player orders applicable replacements → move the same object once to the final zone' },
    'spell-limit-v8': { mechanics: ['casting restrictions'], path: 'track spells cast this turn → enforce every active per-player limit before announcement and payment → restore permission when the source leaves' },
    'public-activated-ability-v8': { mechanics: ['any-player activation'], path: 'controller or opponent chooses the printed ability → activating player pays all costs → that player controls the ability on Stack → source stays under its existing controller' },
    'mechanic-multikicker': { mechanics: ['multikicker'], path: 'repeated additional mana payment → captured payment count' },
    'mechanic-escape': { mechanics: ['escape'], path: 'graveyard spell → alternative mana and exile cost → normal resolution' },
    'mechanic-no-max-hand': { mechanics: ['hand size'], path: 'active permanent → cleanup maximum hand size' },
    'mechanic-player-hexproof': { mechanics: ['player hexproof'], path: 'active permanent → opponent target legality' },
    'mechanic-additional-land': { mechanics: ['additional land plays'], path: 'active permanent → per-turn land allowance' },
    'conditional-permanent-entry': { mechanics: ['conditional entry'], path: 'pre-entry condition → tapped or untapped replacement' },
    'spell-overload-effect': { mechanics: ['overload'], path: 'paid alternative cost → targetless complete expanded effect' },
    'must-be-blocked-static': { mechanics: ['blocking requirement'], path: 'attack declaration → an able blocker is required to block this attacker → damage against that blocker' },
    'lure-static': { mechanics: ['blocking requirement'], path: 'attack declaration → every able blocker is required to block this attacker → damage against all of them' },
    'mechanic-escape-counters': { mechanics: ['escape'], path: 'graveyard cast for the escape cost → the creature returns to the battlefield with the printed number of +1/+1 counters' },
    'mechanic-flash-surcharge': { mechanics: ['flash'], path: 'printed cost plus the extra generic mana offered as an alternative cost → instant-speed casting window → ordinary resolution' },
    'mechanic-enlist': { mechanics: ['enlist'], path: 'attack declaration → optional tap of a nonattacking, non-sick creature you control → that creature\'s power added until end of turn' },
    'mechanic-casualty': { mechanics: ['casualty'], path: 'optional sacrifice of a creature with the printed power as you cast → reflexive copy trigger → separately retargeted copy' },
    'mechanic-conspire': { mechanics: ['conspire'], path: 'optional tap of two untapped creatures sharing a color with the spell → reflexive copy trigger → separately retargeted copy' },
    'mechanic-replicate': { mechanics: ['replicate'], path: 'repeated additional mana payment → cast trigger → separately retargeted copies' },
    'mechanic-ravenous': { mechanics: ['ravenous'], path: 'chosen X → entry counters → threshold draw trigger' },
    'mechanic-graveyard-lands': { mechanics: ['graveyard land plays'], path: 'active permission → normal land play and turn allowance' },
    'mechanic-conditional-alternative': { mechanics: ['conditional alternative cost'], path: 'live condition → free cast with remaining additional costs' },
    'mechanic-retrace': { mechanics: ['retrace'], path: 'graveyard cast → mana and land discard payment → Stack' },
    'mechanic-soulshift': { mechanics: ['soulshift'], path: 'dies → Spirit graveyard target and mana value cap → optional return on resolution' },
    'mechanic-modular': { mechanics: ['modular'], path: 'entry counters → dies with last-known counters → artifact creature target' },
    'mechanic-fabricate': { mechanics: ['fabricate'], path: 'ETB → Stack → counters or Servo tokens, tied to source identity' },
    'mechanic-living-weapon': { mechanics: ['living weapon'], path: 'ETB → Germ creation and attachment before state-based actions' },
    'mechanic-for-mirrodin': { mechanics: ['For Mirrodin!'], path: 'ETB → Rebel creation and attachment before state-based actions' },
    'mechanic-afflict': { mechanics: ['afflict'], path: 'becomes blocked → Stack → captured defending player loses life' },
    'mechanic-ingest': { mechanics: ['ingest'], path: 'combat damage to player → Stack → top library card exiled' },
    'mechanic-offspring': { mechanics: ['offspring'], path: 'additional cast payment → ETB trigger → 1/1 copy token' },
    'mechanic-squad': {mechanics:['squad'],path:'repeated additional payment → ETB Stack trigger → exact copy count'},
    'mechanic-blitz': {mechanics:['blitz'],path:'alternative payment → haste and death draw → delayed sacrifice'},
    'mechanic-warp': {mechanics:['warp'],path:'hand alternative payment → delayed exile → later-turn owner cast'},
    'mechanic-dethrone': {mechanics:['dethrone'],path:'attack highest-life player → Stack → +1/+1 counter'},
    'mechanic-rampage': {mechanics:['rampage'],path:'becomes blocked → Stack → current excess-blocker pump'},
    'mechanic-mobilize': {mechanics:['mobilize'],path:'attack → Stack → tapped attacking Warriors → delayed sacrifice'},
    'permanent-enters-with-counters': { mechanics: ['counter'], path: 'battlefield entry replacement → exact/X counter placement → recalculation/SBA' },
    'conditional-land-entry': { mechanics: ['land'], path: 'entry condition → controller choice → tapped/untapped battlefield state' },
    'untap-step-restriction': { mechanics: ['untap'], path: 'untap step eligibility → source remains tapped' },
    'spell-v4-closed-ast': { mechanics: ['spell'], path: 'additional costs/modes/targets → Stack → ordered closed AST effects' },
    'mechanic-myriad': { mechanics: ['myriad'], path: 'attack trigger → opponent copies → combat → delayed exile' },
    'mechanic-infect': { mechanics: ['infect'], path: 'damage replacement → poison or -1/-1 counters → SBA' },
    'mechanic-exalted': { mechanics: ['exalted'], path: 'attacks-alone trigger → exact attacker EOT pump' },
    'mechanic-flanking': { mechanics: ['flanking'], path: 'block event → non-flanking blocker EOT debuff → SBA' },
    'mechanic-battle-cry': { mechanics: ['battle cry'], path: 'attack trigger → other attacking creatures EOT pump' },
    'mechanic-mentor': { mechanics: ['mentor'], path: 'attack trigger → lower-power attacking creature target → +1/+1 counter' },
    'mechanic-training': { mechanics: ['training'], path: 'attack pair power comparison → source +1/+1 counter' },
    'mechanic-riot': { mechanics: ['riot'], path: 'battlefield entry choice → haste or +1/+1 counter' },
    'mechanic-unleash': { mechanics: ['unleash'], path: 'battlefield entry choice → +1/+1 counter and block restriction' },
    'mechanic-evolve': { mechanics: ['evolve'], path: 'other creature ETB comparison → source +1/+1 counter' },
    'mechanic-extort': { mechanics: ['extort'], path: 'spell-cast trigger → optional hybrid payment → opponent drain/controller gain' },
    'mechanic-delve': { mechanics: ['delve'], path: 'spell payment → graveyard exile for generic reduction' },
    'mechanic-improvise': { mechanics: ['improvise'], path: 'spell payment → untapped artifact selection/tap for generic reduction' },
    'mechanic-affinity-artifacts': { mechanics: ['affinity'], path: 'artifact battlefield count → generic spell-cost reduction' },
    'mechanic-afterlife': { mechanics: ['afterlife'], path: 'dies trigger → exact white-black Spirit token count' },
    'mechanic-bushido': { mechanics: ['bushido'], path: 'block/becomes-blocked trigger → source EOT pump' },
    'mechanic-renown': { mechanics: ['renown'], path: 'first player combat damage → exact +1/+1 counters and renowned state' },
    'mechanic-bloodthirst': { mechanics: ['bloodthirst'], path: 'opponent damaged this turn → battlefield entry counters' },
    'mechanic-toxic': { mechanics: ['toxic'], path: 'player combat damage → exact poison counters → SBA' },
    'mechanic-typecycling': { mechanics: ['typecycling'], path: 'hand ability → mana/discard cost → exact land-type library search/shuffle' },
    'native-counter-trigger-grant-v58': { mechanics: ['counters', 'granted triggers'], path: 'actual counter placement → captured native event → once-per-turn additional +1/+1 counter trigger on the controlled permanent' },
    'native-conditional-entry-counters-v58': { mechanics: ['entry counters', 'Dragon reveal'], path: 'optional actual hand reveal or controlled Dragon → exact pre-entry +1/+1 counter' },
    'paid-hand-exile-land-mana-v58': { mechanics: ['hand activation', 'exile permission', 'mana'], path: 'pay and exile the hand object → ability Stack → chosen land gains printed three-color mana → cast permission bound to the exact exiled incarnation' },
    'copiable-entry-characteristics-v58': { mechanics: ['prototype', 'copy'], path: 'optional own artifact or creature entry copy → retain the entrant printed or prototype P/T → add Artifact Creature types' },
    'ordered-empty-draw-replacement-v58': { mechanics: ['draw replacement'], path: 'empty-library draw → native ordered replacement choice → skip that draw without a failed draw' },
    'permanent-entry-replacement-v58': { mechanics: ['entry replacement'], path: 'native pre-entry choices and mill → selected phylactery counter or printed stun counters and tapped state → actual entry' },
    'native-dynamic-ward-payment-v58': { mechanics: ['ward', 'life payment'], path: 'actual opponent target → native Ward trigger → life payment from live same-incarnation power or captured last-known power' },
    'entry-object-ability-v58': { mechanics: ['defender permission'], path: 'paid entry choice → attack-with-defender permission for that exact battlefield incarnation' },
    'native-token-evolve-grant-v58': { mechanics: ['evolve', 'granted triggers'], path: 'controlled creature token → native evolve trigger → captured entry stat comparison → counter placement' },
    'native-multiple-entry-counters-v58': { mechanics: ['kicker', 'entry counters'], path: 'actual paid casting condition → simultaneous printed counter kinds on entry → captured keyword grant' },
    'as-entry-color-choice': { mechanics: ['color choice'], path: 'actual entry choice → retain the chosen color on the exact object for its printed effects' },
    'as-entry-life-note': { mechanics: ['life tracking'], path: 'entry notes controller life → upkeep compares the captured prior total and updates the note' },
    'as-entry-opponent-controller': { mechanics: ['entry control'], path: 'caster chooses an opponent → enter under that opponent before entry and upkeep triggers' },
    'attachment-granted-ability': { mechanics: ['attachment', 'activation'], path: 'live attached grantor → host paid ability → physical grantor sacrifice and captured-controller draw' },
    'attachment-granted-upkeep-cost': { mechanics: ['attachment', 'cumulative upkeep'], path: 'host native upkeep trigger → age counter → scaled life payment or sacrifice' },
    'continuous-granted-upkeep-cost': { mechanics: ['cumulative upkeep'], path: 'live green-creature grant → native age counter → scaled mana payment or sacrifice' },
    'continuous-spell-keyword-grant': { mechanics: ['conspire'], path: 'live source grants noncreature spells conspire → actual two-creature tap payment → native spell copy' },
    'mana-production-replacement': { mechanics: ['mana replacement'], path: 'basic land actual tap mana → restore planned base output → apply current live replacements → add native mana bonuses' },
    'spell-target-restriction': { mechanics: ['target restriction'], path: 'printed Aura casting restriction → require a tapped legal target before announcement and payment' },
    'triggered-mana-ability': { mechanics: ['mana'], path: 'land tap for mana → native planned and actual additional mana with the printed chosen color, Elf count or produced type' },
    'top-library-visibility': { mechanics: ['library visibility'], path: 'live source → private visibility of the controller current library top without changing the card or zone' },
    'permanent-mana-production': { mechanics: ['mana'], path: 'live creature-type or monocolored-permanent count → exact native mana activation payment → printed color and quantity' },
    'damage-replacement': { mechanics: ['damage prevention'], path: 'controller turn → native replacement choice prevents damage to this permanent → prevention prohibition remains authoritative' },
    'spell-casting-restriction': { mechanics: ['casting restrictions'], path: 'reject this spell during its controller first three own turns before payment or movement → ordinary timing thereafter' },
    'commander-eligibility': { mechanics: ['commander eligibility'], path: 'printed planeswalker commander permission → native commander zone, tax, pairing and paid casting rules' },
    'hidden-zone-keyword-grant-v23': { mechanics: ['miracle', 'foretell'], path: 'live printed source and card-zone filter → native reveal or foretell action → exact incarnation permission and actual alternative payment' },
    'native-ward-grant-v58': { mechanics: ['ward', 'life payment'], path: 'live source grants other controlled creatures ward → native opponent-target trigger → pay two life or counter' },
    'native-conditioned-ability-grant-v58': { mechanics: ['outlast', 'granted activation'], path: 'live source and controlled counterless creature → native hybrid outlast cost and tap payment → counter placement' },
    'native-evidence-ward-v58': { mechanics: ['ward', 'collect evidence'], path: 'native opponent-target Ward trigger → select sufficient graveyard mana value → actual exile batch or counter the targeted spell or ability' },
    'native-life-recover-v58': { mechanics: ['recover', 'life payment'], path: 'another controlled creature enters its owner graveyard → optional rounded-up half-life payment → return the captured incarnation to hand or exile it' },
    'native-spell-target-restriction-v58': { mechanics: ['spell targeting'], path: 'same battlefield incarnation lacks the printed own attack or block history → prohibit spell targets while preserving ability targets' },
    'ordered-damage-life-floor-v58': { mechanics: ['damage replacement', 'life floor'], path: 'native ordered damage replacement → cap damage at controller life minus seven while life is at least seven → retain nondamage loss and nonprevention semantics' },
  });

  const COMBINATION_CONTRACTS = Object.freeze([
    { id: 'flying-vs-reach', all: ['flying', 'reach'] },
    { id: 'deathtouch-plus-trample', all: ['deathtouch', 'trample'] },
    { id: 'first-strike-plus-deathtouch', one: ['first strike', 'double strike'], all: ['deathtouch'] },
    { id: 'strike-plus-lifelink', one: ['first strike', 'double strike'], all: ['lifelink'] },
    { id: 'strike-plus-wither', one: ['first strike', 'double strike'], all: ['wither'] },
    { id: 'target-protection-stack', one: ['hexproof', 'shroud', 'ward'], all: [] },
  ]);

  function issue(code, message, card) {
    return Object.assign({ code, message }, card ? { card } : {});
  }

  function nameKey(value) {
    return String(value || '').normalize('NFKC')
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\s*\/{1,2}\s*/g, ' // ')
      .replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
  }

  let cachedNameCount = -1;
  let cachedCatalog = null;
  let cachedDefinitions = null;
  let cachedPrintingAliases = null;
  let cachedNameIndex = new Map();
  let cachedCanonicalNames = new Map();
  let cachedUnavailableIndex = new Map();
  let cachedAmbiguousNames = new Set();
  function nameIndex() {
    const names = Object.keys(MTG.CARD_CATALOG || MTG.DEFS || {});
    if (names.length !== cachedNameCount || cachedCatalog !== MTG.CARD_CATALOG ||
      cachedDefinitions !== MTG.DEFS || cachedPrintingAliases !== MTG.DECK_CARD_ALIASES) {
      cachedNameCount = names.length;
      cachedCatalog = MTG.CARD_CATALOG;
      cachedDefinitions = MTG.DEFS;
      cachedPrintingAliases = MTG.DECK_CARD_ALIASES;
      cachedNameIndex = new Map();
      cachedCanonicalNames = new Map();
      cachedUnavailableIndex = new Map();
      cachedAmbiguousNames = new Set();
      for (const name of names) {
        const key = nameKey(name);
        if (!cachedNameIndex.has(key)) cachedNameIndex.set(key, name);
        else { cachedNameIndex.set(key, null); cachedAmbiguousNames.add(key); }
      }
      // Canonical names take precedence over an unrelated printing alias.
      // Aliases shared by distinct identities stay ambiguous and fail closed.
      const canonicalKeys = new Set(cachedNameIndex.keys());
      const addAlias = (alias, name) => {
        const key = nameKey(alias);
        if (canonicalKeys.has(key)) return;
        if (!cachedNameIndex.has(key)) cachedNameIndex.set(key, name);
        else if (cachedNameIndex.get(key) !== name) { cachedNameIndex.set(key, null); cachedAmbiguousNames.add(key); }
      };
      for(const name of names)for(const alias of MTG.CARD_CATALOG?.[name]?.aliases||[]){
        addAlias(alias,name);
      }
      for (const row of MTG.DECK_CARD_ALIASES?.cards || []) {
        const matchesIdentity = name => {
          const entry = MTG.CARD_CATALOG?.[name];
          if (!entry || !MTG.DEFS?.[name]) return false;
          const native = row.nativeIdentities?.find(identity => identity.name === name);
          return entry.oracleId ? entry.oracleId === row.oracleId :
            !!native && entry.name === native.name && entry.manaCost === native.manaCost && entry.typeLine === native.typeLine;
        };
        if (!matchesIdentity(row.name)) continue;
        for (const name of row.runtimeNames || []) if (matchesIdentity(name)) {
          cachedCanonicalNames.set(name, row.name);
          cachedNameIndex.set(nameKey(name), row.name);
        }
        for (const alias of row.aliases) addAlias(alias, row.name);
      }
      for (const row of MTG.DECK_CARD_ALIASES?.unavailable || []) {
        for (const alias of [row.name, ...row.aliases]) {
          const key = nameKey(alias);
          if (canonicalKeys.has(key)) continue;
          // A source alias colliding with an unavailable identity must not
          // silently select the one identity whose gameplay happens to exist.
          if (row.deckCard !== false && cachedNameIndex.has(key)) {
            cachedNameIndex.set(key, null);
            cachedAmbiguousNames.add(key);
          }
          if (!cachedUnavailableIndex.has(key)) cachedUnavailableIndex.set(key, row);
          else if (cachedUnavailableIndex.get(key)?.oracleId !== row.oracleId) {
            const previous = cachedUnavailableIndex.get(key);
            if (previous?.deckCard === false && row.deckCard !== false) cachedUnavailableIndex.set(key, row);
            else if (!(previous?.deckCard !== false && row.deckCard === false)) {
              cachedUnavailableIndex.set(key, null);
              if (row.deckCard !== false) cachedAmbiguousNames.add(key);
            }
          }
        }
      }
    }
    return cachedNameIndex;
  }

  MTG.resolveDeckCardName = function (name) {
    if ((MTG.CARD_CATALOG && MTG.CARD_CATALOG[name]) || (MTG.DEFS && MTG.DEFS[name])) {
      if (cachedCatalog !== MTG.CARD_CATALOG || cachedDefinitions !== MTG.DEFS || cachedPrintingAliases !== MTG.DECK_CARD_ALIASES) nameIndex();
      return cachedCanonicalNames.get(name) || name;
    }
    return nameIndex().get(nameKey(name)) || null;
  };

  function stripExportSuffixes(value) {
    let name = String(value || '').trim();
    const commanderTagged = /(?:\*\s*(?:CMDR|COMMANDER|C)\s*\*|\[\s*commander\s*\]|#\s*commander)\s*$/i.test(name);
    name = name.replace(/\s*(?:\*\s*(?:CMDR|COMMANDER|C|F|FOIL)\s*\*|\[\s*commander\s*\]|#\s*commander)\s*$/gi, '').trim();
    name = name.replace(/\s*\[[A-Za-z0-9]{2,8}:?[^\]]*\]\s*$/, '').trim();
    name = name.replace(/\s*\([A-Za-z0-9]{2,8}\)(?:\s+[A-Za-z0-9★#-]+)?\s*$/, '').trim();
    return { name, commanderTagged };
  }

  MTG.parseDeckText = function (text) {
    const cards = [];
    const commanders = [];
    const ignored = [];
    let section = 'main';
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      if (!line || /^(?:#|\/\/)(?:\s|$)/.test(line)) continue;
      const sectionMatch = /^(Commander|Commanders|Deck|Mainboard|Main|Sideboard|Considering|Maybeboard|Companion|Tokens?)\s*:?\s*$/i.exec(line);
      if (sectionMatch) {
        const value = sectionMatch[1].toLowerCase();
        section = value.startsWith('commander') ? 'commander'
          : ['sideboard', 'considering', 'maybeboard', 'companion', 'token', 'tokens'].includes(value) ? 'skip' : 'main';
        continue;
      }
      if (/^SB:\s*/i.test(line) || section === 'skip') {
        ignored.push({ line: index + 1, text: line, reason: 'non-mainboard-section' });
        continue;
      }

      const quantityMatch = /^(\d+)\s*x?\s+(.+)$/i.exec(line);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
      const cleaned = stripExportSuffixes(quantityMatch ? quantityMatch[2] : line);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || !cleaned.name) {
        ignored.push({ line: index + 1, text: line, reason: 'invalid-card-line' });
        continue;
      }
      const isCommander = section === 'commander' || cleaned.commanderTagged;
      cards.push({ n: quantity, name: cleaned.name, section: isCommander ? 'Commander' : 'Main', line: index + 1 });
      if (isCommander && !commanders.some(name => nameKey(name) === nameKey(cleaned.name))) commanders.push(cleaned.name);
    }

    return { cards, commanders, commander: commanders[0] || null, ignored };
  };

  function allowedCopies(def) {
    if (!def) return 0;
    if(def.oracleDeckCopyLimitV10!==undefined)return def.oracleDeckCopyLimitV10==='all'?Infinity:def.oracleDeckCopyLimitV10;
    if ((def.super || []).includes('Basic') || BASIC_NAMES.has(def.name)) return Infinity;
    const oracle = String(def.oracle || '');
    if (/A deck can have any number of cards named/i.test(oracle)) return Infinity;
    const match = /A deck can have up to (\d+) cards named/i.exec(oracle);
    return match ? Number(match[1]) : 1;
  }

  function normalizedMechanic(keyword) {
    const value = String(keyword || '').trim().toLowerCase();
    return value.startsWith('ward ') ? 'ward' : value;
  }

  MTG.auditImportedDeckInteractions = function (deckData, defs) {
    defs = defs || MTG.DEFS;
    const mechanics = new Set();
    const contractCards = new Map();
    const unsupported = [];
    let batchCards = 0;

    const addContract = (id, name) => {
      if (!contractCards.has(id)) contractCards.set(id, new Set());
      contractCards.get(id).add(name);
    };

    for (const entry of deckData && deckData.cards || []) {
      const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name];
      const def = defs && defs[entry.name];
      if (!catalog || !def) continue;
      const script = MTG.SCRIPTS && MTG.SCRIPTS[entry.name];
      const isBatch = !!catalog.engineBatch;
      if (isBatch) {
        batchCards += entry.n;
        if ((def.types || []).includes('Creature')) addContract('creature-casting', entry.name);
        if ((def.types || []).some(type => type === 'Artifact' || type === 'Enchantment' || type === 'Planeswalker') &&
            !(def.types || []).includes('Creature')) addContract('permanent-casting', entry.name);
        if ((def.types || []).includes('Land')) addContract('land-play', entry.name);
        if ((def.types || []).some(type => type === 'Instant' || type === 'Sorcery')) addContract('spell-casting', entry.name);
        if (catalog.semanticClass === 'vanilla') addContract('vanilla-permanent', entry.name);
        if (!script || script.oracleImplemented !== true || script.oracleId !== catalog.oracleId) {
          unsupported.push({ card: entry.name, reason: 'missing-oracle-implementation-marker' });
        }
        const physicalDescriptor = script && script.oracleFaces;
        const oracleContracts = physicalDescriptor && Array.isArray(physicalDescriptor.oracleContracts)
          ? physicalDescriptor.oracleContracts
          : script && Array.isArray(script.oracleContracts) ? script.oracleContracts : [];
        const implementationKinds = catalog.implementationKinds || [];
        if (catalog.semanticClass === 'manual-deck-semantic' && !oracleContracts.length) {
          unsupported.push({ card: entry.name, reason: 'missing-manual-interaction-contracts' });
        }
        if (implementationKinds.length && !oracleContracts.length) {
          unsupported.push({ card: entry.name, reason: 'missing-template-interaction-contracts' });
        }
        const compiledImplementation = physicalDescriptor && Array.isArray(physicalDescriptor.oracleImplementation)
          ? physicalDescriptor.oracleImplementation
          : script && Array.isArray(script.oracleImplementation) ? script.oracleImplementation : [];
        const compiledKinds = compiledImplementation.length
          ? compiledImplementation.map(operation => operation.kind)
          : [];
        if (implementationKinds.length && (compiledKinds.length !== implementationKinds.length ||
            implementationKinds.some((kind, index) => compiledKinds[index] !== kind))) {
          unsupported.push({ card: entry.name, reason: 'compiled-template-mismatch' });
        }
        for (const contract of oracleContracts) {
          if (!MTG.ORACLE_INTERACTION_CONTRACTS[contract]) {
            const prefix = catalog.semanticClass === 'manual-deck-semantic'
              ? 'unknown-manual-contract:' : 'unknown-template-contract:';
            unsupported.push({ card: entry.name, reason: prefix + contract });
          } else {
            addContract(contract, entry.name);
          }
        }
      }
      const keywords = isBatch && catalog.semanticClass !== 'manual-deck-semantic'
        ? (catalog.implementedKeywords || [])
        : isBatch ? [] : [...(def.kws || []), ...(def.ward ? ['ward'] : [])];
      for (const rawKeyword of keywords) {
        const mechanic = normalizedMechanic(rawKeyword);
        if (!mechanic) continue;
        mechanics.add(mechanic);
        const contract = KEYWORD_CONTRACTS[mechanic];
        if (contract) addContract(contract, entry.name);
        else if (isBatch) unsupported.push({ card: entry.name, reason: `no-interaction-contract:${mechanic}` });
      }
    }

    const combinations = COMBINATION_CONTRACTS.filter(contract =>
      contract.all.every(mechanic => mechanics.has(mechanic)) &&
      (!contract.one || contract.one.some(mechanic => mechanics.has(mechanic))))
      .map(contract => contract.id);
    return {
      ready: unsupported.length === 0,
      batchCards,
      mechanics: [...mechanics].sort(),
      contracts: [...contractCards].sort(([a], [b]) => a.localeCompare(b)).map(([id, names]) => ({
        id,
        cards: [...names].sort(),
        path: MTG.ORACLE_INTERACTION_CONTRACTS[id] && MTG.ORACLE_INTERACTION_CONTRACTS[id].path || '',
      })),
      combinations,
      unsupported,
    };
  };

  MTG.validateImportedDeck = function (parsed, options) {
    options = options || {};
    const errors = [];
    const warnings = [];
    const aggregate = new Map();
    const unresolved = [];
    const inputCards = parsed && Array.isArray(parsed.cards) ? parsed.cards : [];
    const inputTotal = inputCards.reduce((sum, entry) => sum + (Number(entry.n) || 0), 0);
    if (inputTotal !== 100) errors.push(issue('deck-size', `Commander deck needs exactly 100 cards including commanders; found ${inputTotal}.`));

    for (const entry of inputCards) {
      const resolved = MTG.resolveDeckCardName(entry.name);
      if (!resolved) {
        unresolved.push(entry.name);
        const known = cachedUnavailableIndex.get(nameKey(entry.name));
        if (known && (!cachedAmbiguousNames.has(nameKey(entry.name)) || nameKey(known.name) === nameKey(entry.name))) {
          const legality = known.commanderLegality !== 'legal' ? ` It is ${known.commanderLegality.replace(/_/g, ' ')} in Commander.` : '';
          errors.push(issue('known-unavailable-card', `${entry.name} is recognized as ${known.name}, but has no available engine definition.${legality}`, entry.name));
        } else if (cachedAmbiguousNames.has(nameKey(entry.name))) {
          errors.push(issue('ambiguous-card-name', `${entry.name} matches multiple Oracle identities. Use the complete combined name for a split, double-faced, or Adventure card.`, entry.name));
        } else errors.push(issue('unknown-card', `${entry.name} is not available in the engine catalog.`, entry.name));
        continue;
      }
      const current = aggregate.get(resolved) || { n: 0, name: resolved, section: entry.section || 'Main' };
      current.n += Number(entry.n) || 0;
      if (entry.section === 'Commander') current.section = 'Commander';
      aggregate.set(resolved, current);
    }

    const cards = [...aggregate.values()];
    for (const entry of cards) {
      const def = MTG.DEFS && MTG.DEFS[entry.name];
      const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name];
      const max = allowedCopies(def);
      if (entry.n > max) errors.push(issue('singleton', `${entry.name} allows ${max} cop${max === 1 ? 'y' : 'ies'}, but the list contains ${entry.n}.`, entry.name));
      if (!catalog || !ACCEPTED_ENGINE_STATUSES.has(catalog.engineStatus) || catalog.deckImportEligible !== true) {
        errors.push(issue('engine-unsupported', `${entry.name} is not semantically certified for gameplay.`, entry.name));
      }
      if (catalog && catalog.commanderLegality && catalog.commanderLegality !== 'legal') {
        warnings.push(issue('commander-legality', `${entry.name} is ${catalog.commanderLegality} in Commander; the simulator preserves the original list.`, entry.name));
      }
    }

    const requestedCommanders = (options.commanders && options.commanders.length ? options.commanders : parsed && parsed.commanders || [])
      .map(name => MTG.resolveDeckCardName(name) || name);
    if (!requestedCommanders.length) errors.push(issue('missing-commander', 'Mark one or two cards in a Commander section or with *CMDR*.'));
    if (requestedCommanders.length > 2) errors.push(issue('commander-count', `Commander supports one or two legal commanders; found ${requestedCommanders.length}.`));
    for (const name of requestedCommanders) {
      const entry = aggregate.get(name);
      if (!entry) errors.push(issue('commander-missing-from-deck', `${name} is marked as commander but is not in the 100-card deck.`, name));
      else if (entry.n !== 1) errors.push(issue('commander-copy-count', `${name} must appear exactly once.`, name));
    }

    const deckName = String(options.name || `Imported — ${requestedCommanders.join(' + ') || 'Commander deck'}`).trim();
    const draftDeck = {
      name: deckName,
      set: 'CUSTOM',
      commander: requestedCommanders[0] || null,
      commanders: requestedCommanders.slice(0, 2),
      cards,
      custom: true,
      imported: true,
      trustedFaceCommander: false,
      source: 'pasted-decklist',
    };

    if (requestedCommanders.length >= 1 && requestedCommanders.length <= 2 &&
        requestedCommanders.every(name => aggregate.has(name) && MTG.DEFS && MTG.DEFS[name])) {
      const commanderCheck = MTG.validateCommanders(draftDeck, requestedCommanders, MTG.DEFS);
      if (!commanderCheck.ok) errors.push(issue('invalid-commanders', commanderCheck.why));
    }

    const unknownLegality = cards.filter(entry => {
      const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name];
      return catalog && catalog.engineStatus === 'certified-legacy' && !catalog.commanderLegality;
    });
    if (unknownLegality.length) warnings.push(issue('legacy-legality-provenance',
      `${unknownLegality.length} legacy engine cards predate per-card Scryfall legality metadata; their existing engine certification is retained.`));
    if (parsed && parsed.ignored && parsed.ignored.length) warnings.push(issue('ignored-sections',
      `${parsed.ignored.length} sideboard, maybeboard, companion, or token lines were ignored.`));

    const interactions = MTG.auditImportedDeckInteractions(draftDeck, MTG.DEFS);
    for (const problem of interactions.unsupported) {
      errors.push(issue('interaction-unsupported', `${problem.card}: ${problem.reason}.`, problem.card));
    }

    return {
      ok: errors.length === 0,
      deck: errors.length ? null : draftDeck,
      draftDeck,
      commanders: requestedCommanders,
      summary: {
        inputCards: inputTotal,
        resolvedCards: cards.reduce((sum, entry) => sum + entry.n, 0),
        uniqueCards: cards.length,
        unresolvedCards: unresolved.length,
        colorIdentity: requestedCommanders.flatMap(name => MTG.cardColorIdentity(MTG.DEFS && MTG.DEFS[name]))
          .filter((color, index, all) => COLORS.includes(color) && all.indexOf(color) === index),
        engineCertified: cards.filter(entry => {
          const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name];
          return !!catalog && ACCEPTED_ENGINE_STATUSES.has(catalog.engineStatus) && catalog.deckImportEligible === true;
        }).length,
      },
      interactions,
      errors,
      warnings,
    };
  };

  MTG.registerImportedDeck = function (validation, options) {
    options = options || {};
    if (!validation || !validation.ok || !validation.deck) throw new Error('Only a validated imported deck can be registered.');
    const deck = validation.deck;
    if (!MTG.DECKS || !MTG.DECK_META) throw new Error('Card/deck data must be initialized before deck registration.');
    if (MTG.DECKS[deck.name] && (!MTG.DECKS[deck.name].custom || !options.replace)) {
      throw new Error(`Deck name already exists: ${deck.name}`);
    }
    MTG.DECKS[deck.name] = deck;
    MTG.DECK_META[deck.name] = {
      icon: '📋',
      colors: validation.summary.colorIdentity.slice(),
      style: 'Imported decklist',
      blurb: `${validation.summary.uniqueCards} unique cards · ${validation.interactions.contracts.length} engine interaction contracts`,
      set: 'Pasted Commander deck',
      custom: true,
    };
    if (MTG.invalidateDeckAIProfile) MTG.invalidateDeckAIProfile(deck.name);
    return deck;
  };

  function deckIdPart(value) {
    let hash = 2166136261;
    const input = String(value || '');
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(7, '0');
  }

  function freshDeckId(validation) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `deck-${globalThis.crypto.randomUUID().toLowerCase()}`;
    }
    const seed = `${validation.deck.name}|${validation.commanders.join('|')}|${Date.now()}|${Math.random()}`;
    return `deck-${deckIdPart(seed)}-${deckIdPart(seed.split('').reverse().join(''))}`;
  }

  function copyRecord(record) {
    record = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    return {
      schema: IMPORTED_DECK_SCHEMA,
      id: record.id,
      name: record.name,
      commanders: Array.isArray(record.commanders) ? record.commanders.slice() : [],
      cards: Array.isArray(record.cards)
        ? record.cards.map(entry => ({ name: entry && entry.name, n: entry && entry.n, section: entry && entry.section }))
        : [],
      ...(record.auxiliaryV87 ? { auxiliaryV87: JSON.parse(JSON.stringify(record.auxiliaryV87)) } : {}),
      ...(Number.isSafeInteger(record.revision) ? { revision: record.revision } : {}),
      ...(record.createdAt ? { createdAt: record.createdAt } : {}),
      ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    };
  }

  function validRecordText(value, max) {
    return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= max &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }

  function guestRecordId(record) {
    return record && typeof record === 'object' && !Array.isArray(record) && typeof record.id === 'string'
      ? record.id
      : '';
  }

  function recordShapeErrors(record) {
    const errors = [];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return [issue('library-record', 'Saved deck record is not an object.')];
    }
    if (record.schema !== IMPORTED_DECK_SCHEMA) errors.push(issue('library-schema', 'Saved deck uses an unsupported library format.'));
    if (!validRecordText(record.id, 85) || !IMPORTED_DECK_ID.test(record.id)) {
      errors.push(issue('library-id', 'Saved deck has an invalid identifier.'));
    }
    if (!validRecordText(record.name, 80)) {
      errors.push(issue('library-name', 'Saved deck name must contain 1–80 trimmed, control-free characters.'));
    }
    const commandersValid = Array.isArray(record.commanders) && record.commanders.length >= 1 && record.commanders.length <= 2 &&
      record.commanders.every(value => validRecordText(value, 160));
    const commanderKeys = commandersValid ? record.commanders.map(nameKey) : [];
    const commandersUnique = commandersValid && new Set(commanderKeys).size === commanderKeys.length;
    if (!commandersValid || !commandersUnique) {
      errors.push(issue('library-commanders', 'Saved deck must name one or two commanders.'));
    }
    if (!Array.isArray(record.cards) || record.cards.length < 1 || record.cards.length > 100) {
      errors.push(issue('library-cards', 'Saved deck must contain canonical card rows.'));
      return errors;
    }
    const seen = new Set();
    const validRows = [];
    let total = 0;
    for (const row of record.cards) {
      const rowName = row && typeof row.name === 'string' ? row.name : '';
      if (!row || typeof row !== 'object' || Array.isArray(row) || !validRecordText(rowName, 160) ||
          !Number.isSafeInteger(row.n) || row.n < 1 || row.n > 100 ||
          !['Commander', 'Main'].includes(row && row.section)) {
        errors.push(issue('library-card-row', 'Saved deck contains a malformed card row.', validRecordText(rowName, 160) ? rowName : undefined));
        continue;
      }
      const key = nameKey(rowName);
      if (seen.has(key)) errors.push(issue('library-card-duplicate', `${rowName} appears in more than one saved row.`, rowName));
      seen.add(key);
      total += row.n;
      validRows.push(row);
    }
    if (total !== 100) errors.push(issue('deck-size', `Commander deck needs exactly 100 cards including commanders; found ${total}.`));
    if (commandersValid && commandersUnique) {
      const rowsByName = new Map(validRows.map(row => [row.name, row]));
      const commanderNames = new Set(record.commanders);
      for (const commander of record.commanders) {
        const row = rowsByName.get(commander);
        if (!row || row.n !== 1 || row.section !== 'Commander') {
          errors.push(issue('library-commander-row', `${commander} must appear exactly once in the Commander section.`, commander));
        }
      }
      const unexpectedCommander = validRows.find(row => row.section === 'Commander' && !commanderNames.has(row.name));
      if (unexpectedCommander) {
        errors.push(issue('library-unexpected-commander', `${unexpectedCommander.name} is not listed as a commander.`, unexpectedCommander.name));
      }
    }
    return errors;
  }

  MTG.IMPORTED_DECK_SCHEMA = IMPORTED_DECK_SCHEMA;
  MTG.IMPORTED_LIBRARY_SCHEMA = IMPORTED_LIBRARY_SCHEMA;
  MTG.IMPORTED_LIBRARY_KEY = IMPORTED_LIBRARY_KEY;
  MTG.IMPORTED_LIBRARY_LIMIT = IMPORTED_LIBRARY_LIMIT;

  MTG.createImportedDeckRecord = function (validation, options) {
    options = options || {};
    if (!validation || !validation.ok || !validation.deck) throw new Error('Only a validated imported deck can be saved.');
    const now = options.now || new Date().toISOString();
    return {
      schema: IMPORTED_DECK_SCHEMA,
      id: options.id || freshDeckId(validation),
      name: validation.deck.name,
      commanders: validation.commanders.slice(),
      cards: validation.deck.cards.map(entry => ({
        name: entry.name,
        n: entry.n,
        section: validation.commanders.includes(entry.name) ? 'Commander' : 'Main',
      })),
      ...(validation.deck.auxiliaryV87 ? { auxiliaryV87: JSON.parse(JSON.stringify(validation.deck.auxiliaryV87)) } : {}),
      ...(Number.isSafeInteger(options.revision) ? { revision: options.revision } : {}),
      createdAt: options.createdAt || now,
      updatedAt: now,
    };
  };

  MTG.validateImportedDeckRecord = function (record) {
    const structuralErrors = recordShapeErrors(record);
    const safeRecord = record && typeof record === 'object' ? record : {};
    const parsed = {
      cards: Array.isArray(safeRecord.cards) ? safeRecord.cards.map(entry => ({
        name: entry && entry.name,
        n: entry && entry.n,
        section: entry && entry.section,
      })) : [],
      commanders: Array.isArray(safeRecord.commanders) ? safeRecord.commanders.slice() : [],
      ignored: [],
      ...(safeRecord.auxiliaryV87 ? { auxiliaryV87: safeRecord.auxiliaryV87 } : {}),
    };
    const validation = MTG.validateImportedDeck(parsed, {
      name: typeof safeRecord.name === 'string' ? safeRecord.name.trim() : '',
      commanders: parsed.commanders,
    });
    if (!structuralErrors.length) return Object.assign({ record: copyRecord(safeRecord) }, validation);
    return Object.assign({}, validation, {
      ok: false,
      deck: null,
      record: null,
      errors: structuralErrors.concat(validation.errors || []),
    });
  };

  let registeredLibraryNames = new Set();
  let importedLibrary = { source: 'guest', error: null, entries: [] };

  MTG.clearImportedDeckLibraryRegistrations = function () {
    for (const name of registeredLibraryNames) {
      if (MTG.DECKS && MTG.DECKS[name] && MTG.DECKS[name].custom) delete MTG.DECKS[name];
      if (MTG.DECK_META && MTG.DECK_META[name] && MTG.DECK_META[name].custom) delete MTG.DECK_META[name];
      if (MTG.invalidateDeckAIProfile) MTG.invalidateDeckAIProfile(name);
    }
    registeredLibraryNames = new Set();
  };

  function publicLibrary() {
    return {
      source: importedLibrary.source,
      error: importedLibrary.error,
      entries: importedLibrary.entries.map(entry => ({
        record: entry.record ? copyRecord(entry.record) : null,
        id: entry.id,
        name: entry.name,
        commanders: entry.commanders.slice(),
        ready: entry.ready,
        issues: entry.issues.map(problem => ({ code: problem.code, message: problem.message, ...(problem.card ? { card: problem.card } : {}) })),
      })),
    };
  }

  MTG.getImportedDeckLibrary = publicLibrary;
  MTG.hideImportedDeckLibrary = function (options) {
    options = options || {};
    importedLibrary = { source: options.source || 'loading', error: options.error || null, entries: [] };
    return publicLibrary();
  };
  MTG.getImportedDeckLibraryEntry = function (id) {
    return importedLibrary.entries.find(entry => entry.id === id) || null;
  };

  // Imports create a new record. A reused optional name must not overwrite an
  // existing list or prevent another build with the same commander being saved.
  MTG.availableImportedDeckName = function (preferredName) {
    const base = (String(preferredName || '').trim() || 'Imported Commander deck').slice(0, 80).trimEnd();
    const occupied = new Set([
      ...Object.keys(MTG.DECKS || {}),
      ...importedLibrary.entries.map(entry => entry.name),
    ].map(nameKey));
    if (!occupied.has(nameKey(base))) return base;
    for (let number = 2; ; number += 1) {
      const suffix = ` (${number})`;
      const candidate = base.slice(0, 80 - suffix.length).trimEnd() + suffix;
      if (!occupied.has(nameKey(candidate))) return candidate;
    }
  };

  // An imported deck is only usable away from the browser that owns it — by a
  // bot seat that must survive a save, or by a live room the host has to build
  // locally — when the saved record travels with it. This is that record.
  MTG.importedDeckRecordFor = function (name) {
    const entry = importedLibrary.entries.find(item => item.ready && item.name === name);
    return entry && entry.record ? copyRecord(entry.record) : null;
  };

  // Registers a record that arrived from somewhere else (a live room seat, a
  // resumed checkpoint) so the local engine can build that deck.
  MTG.adoptImportedDeckRecord = function (record) {
    const validation = MTG.validateImportedDeckRecord(record);
    if (!validation.ok) {
      const problem = (validation.errors || [])[0];
      return { ok: false, error: problem && problem.message || 'This decklist no longer passes the engine check.' };
    }
    const name = validation.deck.name;
    const existing = MTG.DECKS && MTG.DECKS[name];
    if (existing && !existing.custom) return { ok: false, error: `A built-in deck is already named ${name}.` };
    MTG.registerImportedDeck(validation, { replace: true });
    return { ok: true, name };
  };

  MTG.hydrateImportedDeckLibrary = function (records, options) {
    options = options || {};
    MTG.clearImportedDeckLibraryRegistrations();
    const entries = [];
    const seenIds = new Set();
    const seenNames = new Set();
    const input = Array.isArray(records) ? records.slice(0, IMPORTED_LIBRARY_LIMIT) : [];
    for (const candidate of input) {
      const record = candidate && typeof candidate === 'object' ? candidate : {};
      const validation = MTG.validateImportedDeckRecord(record);
      const id = String(record.id || '');
      const name = String(record.name || '').trim();
      const issues = (validation.errors || []).slice();
      const normalizedName = nameKey(name);
      if (seenIds.has(id)) issues.push(issue('library-duplicate-id', 'Another saved deck uses this identifier.'));
      if (seenNames.has(normalizedName)) issues.push(issue('library-duplicate-name', `Another saved deck is also named ${name}.`));
      const existing = MTG.DECKS && MTG.DECKS[name];
      if (existing && !existing.custom) issues.push(issue('deck-name-collision', `A built-in deck is already named ${name}.`));
      const ready = validation.ok && issues.length === 0;
      if (ready) {
        try {
          MTG.registerImportedDeck(validation, { replace: true });
          registeredLibraryNames.add(name);
        } catch (error) {
          issues.push(issue('library-registration', error && error.message || 'Saved deck could not be registered.'));
        }
      }
      seenIds.add(id);
      seenNames.add(normalizedName);
      entries.push({
        record: validation.record || (record && typeof record === 'object' ? record : null),
        validation,
        id,
        name,
        commanders: Array.isArray(record.commanders) ? record.commanders.slice(0, 2) : [],
        ready: ready && issues.length === 0,
        issues,
      });
    }
    importedLibrary = { source: options.source || 'guest', error: options.error || null, entries };
    return publicLibrary();
  };

  MTG.readGuestImportedDeckRecords = function (storage) {
    storage = storage || globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return { ok: true, records: [] };
    try {
      const text = storage.getItem(IMPORTED_LIBRARY_KEY);
      if (!text) return { ok: true, records: [] };
      const value = JSON.parse(text);
      if (!value || value.schema !== IMPORTED_LIBRARY_SCHEMA || !Array.isArray(value.records)) {
        return { ok: false, records: [], error: 'Saved deck library uses an unsupported format.' };
      }
      if (value.records.length > IMPORTED_LIBRARY_LIMIT) {
        return { ok: false, records: [], error: `Saved deck library exceeds the ${IMPORTED_LIBRARY_LIMIT}-deck limit.` };
      }
      return { ok: true, records: value.records };
    } catch (error) {
      return { ok: false, records: [], error: `Saved deck library could not be read: ${error && error.message || 'invalid data'}.` };
    }
  };

  MTG.loadGuestImportedDeckLibrary = function (options) {
    options = options || {};
    const loaded = MTG.readGuestImportedDeckRecords(options.storage);
    return MTG.hydrateImportedDeckLibrary(loaded.records, { source: 'guest', error: loaded.ok ? null : loaded.error });
  };

  MTG.upsertGuestImportedDeck = function (record, options) {
    options = options || {};
    const storage = options.storage || globalThis.localStorage;
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Browser storage is unavailable. Sign in to save this deck across devices.');
    const validation = MTG.validateImportedDeckRecord(record);
    if (!validation.ok) {
      const error = new Error(validation.errors[0] && validation.errors[0].message || 'Deck is not engine-certified.');
      error.validation = validation;
      throw error;
    }
    const loaded = MTG.readGuestImportedDeckRecords(storage);
    if (!loaded.ok) throw new Error(loaded.error);
    const records = loaded.records.map(copyRecord);
    const sameId = records.findIndex(saved => saved.id === record.id);
    const sameName = records.findIndex(saved => nameKey(saved.name) === nameKey(record.name) && saved.id !== record.id);
    if (sameName >= 0) throw new Error(`A saved deck is already named ${record.name}. Remove it or choose another name.`);
    const existingBuiltIn = MTG.DECKS && MTG.DECKS[record.name];
    if (existingBuiltIn && !existingBuiltIn.custom) throw new Error(`A built-in deck is already named ${record.name}.`);
    const canonical = copyRecord(validation.record);
    if (sameId >= 0) records[sameId] = canonical;
    else {
      if (records.length >= IMPORTED_LIBRARY_LIMIT) throw new Error(`Your library can contain up to ${IMPORTED_LIBRARY_LIMIT} imported decks.`);
      records.push(canonical);
    }
    const payload = JSON.stringify({ schema: IMPORTED_LIBRARY_SCHEMA, records });
    storage.setItem(IMPORTED_LIBRARY_KEY, payload);
    MTG.hydrateImportedDeckLibrary(records, { source: 'guest' });
    return copyRecord(canonical);
  };

  MTG.removeGuestImportedDeck = function (id, options) {
    options = options || {};
    const storage = options.storage || globalThis.localStorage;
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Browser storage is unavailable.');
    const loaded = MTG.readGuestImportedDeckRecords(storage);
    if (!loaded.ok) {
      storage.setItem(IMPORTED_LIBRARY_KEY, JSON.stringify({ schema: IMPORTED_LIBRARY_SCHEMA, records: [] }));
      MTG.hydrateImportedDeckLibrary([], { source: 'guest' });
      return true;
    }
    const targetId = typeof id === 'string' ? id : '';
    const records = loaded.records.filter(record => guestRecordId(record) !== targetId).map(copyRecord);
    if (records.length === loaded.records.length) return false;
    storage.setItem(IMPORTED_LIBRARY_KEY, JSON.stringify({ schema: IMPORTED_LIBRARY_SCHEMA, records }));
    MTG.hydrateImportedDeckLibrary(records, { source: 'guest' });
    return true;
  };

  MTG.importCommanderDeck = function (text, options) {
    options = options || {};
    const parsed = MTG.parseDeckText(text);
    const validation = MTG.validateImportedDeck(parsed, options);
    if (validation.ok && options.register) MTG.registerImportedDeck(validation, options);
    return Object.assign({ parsed }, validation);
  };
})();
