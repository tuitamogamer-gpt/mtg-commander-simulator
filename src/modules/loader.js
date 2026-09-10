// ===== loader.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Builds final card definitions from raw DB + scripts; game factory
(function () {
  const U = MTG;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  // Blame Game je izbačen iz proizvoda: njegov identitet zavisi od velikog
  // broja političkih/goad i damage-redirection interakcija koje ne možemo
  // certifikovati bez kompromisa. Raw karte ostaju dostupne drugim deckovima.
  MTG.EXCLUDED_DECKS = new Set(['Blame Game']);

  MTG.initData = function (rawDB) {
    if (MTG.applyOracleBatches) MTG.applyOracleBatches(rawDB);
    MTG.DB = rawDB;
    MTG.DEFS = MTG.buildDefs(rawDB.cards, MTG.SCRIPTS);
    // token defs: merge script-ish fields already inline
    MTG.DECKS = {};
    for (const d of rawDB.decks) {
      if (MTG.EXCLUDED_DECKS.has(d.name)) continue;
      const key = d.name;
      MTG.DECKS[key] = d;
    }
    // deck meta (blurbs & archetypes for UI/AI)
    MTG.DECK_META = {
    "Riders of Rohan": {"icon": "⚔️", "colors": ["U", "R", "W"], "style": "Human cavalry", "blurb": "Deploy Humans before combat to rally Éowyn’s hasty army.", "set": "The Lord of the Rings Commander (2023)"},
    "The Hosts of Mordor": {"icon": "🔥", "colors": ["U", "B", "R"], "style": "Amass and reanimation", "blurb": "Fill the graveyard, raise an Orc Army, and cast Sauron to recover your strongest creature.", "set": "The Lord of the Rings Commander (2023)"},
    "Food and Fellowship": {"icon": "🍲", "colors": ["W", "B", "G"], "style": "Food and life gain", "blurb": "Sam supplies Food while Frodo turns life gain and the Ring into cards.", "set": "The Lord of the Rings Commander (2023)"},
    "Sliver Swarm": {"icon": "🧬", "colors": ["W", "U", "B", "R", "G"], "style": "Sliver tribal", "blurb": "Share Sliver abilities across your army, then encore fallen Slivers for a finishing attack.", "set": "Commander Masters (2023)"},
    "Planeswalker Party": {"icon": "✨", "colors": ["W", "U", "R"], "style": "Planeswalker control", "blurb": "Protect your planeswalkers with blockers, then build loyalty and multiply activations.", "set": "Commander Masters (2023)"},
    "Mishra's Burnished Banner": {"icon": "⚙️", "colors": ["U", "B", "R"], "style": "Artifact copies and sacrifice", "blurb": "Mishra turns a noncreature artifact into a temporary attacking Warform.", "set": "The Brothers’ War Commander (2022)"},
    "Urza's Iron Alliance": {"icon": "🤖", "colors": ["W", "U", "B"], "style": "Artifact creatures and Constructs", "blurb": "Urza discounts himself for artifact creatures and creates growing Constructs at your end step.", "set": "The Brothers’ War Commander (2022)"},
    "Rebellion Rising": {"icon": "☀️", "colors": ["R", "W"], "style": "Attacking tokens and exile cards", "blurb": "Neyali gives attacking tokens double strike and finds cards to play on turns you attack with a token.", "set": "Phyrexia: All Will Be One Commander (2023)"},
    "Corrupting Influence": {"icon": "☣️", "colors": ["W", "B", "G"], "style": "Poison and proliferate", "blurb": "Ixhel spreads poison and steals cards from opponents with three or more poison counters.", "set": "Phyrexia: All Will Be One Commander (2023)"},
    "Tinker Time": {"icon": "🔧", "colors": ["G", "U", "R"], "style": "Artifact token diversity", "blurb": "Gimbal creates Gremlins that grow with the number of differently named artifact tokens you control.", "set": "March of the Machine Commander (2023)"},
    "Growing Threat": {"icon": "🥚", "colors": ["W", "B"], "style": "Incubate and proliferate", "blurb": "Brimaz incubates when you cast Phyrexians or artifacts and proliferates after a Phyrexian dies.", "set": "March of the Machine Commander (2023)"},
    "Divine Convocation": {"icon": "🪽", "colors": ["U", "R", "W"], "style": "Convoke and creature tokens", "blurb": "Kasla rewards convoke spells with scrying and cards while flying tokens help pay for large spells.", "set": "March of the Machine Commander (2023)"},
    "Cavalry Charge": {"icon": "🐎", "colors": ["W", "U", "B"], "style": "Knights and reanimation", "blurb": "Sidar filters your hand as Knights attack and returns a fallen Knight after combat damage.", "set": "March of the Machine Commander (2023)"},
    "Call for Backup": {"icon": "🌸", "colors": ["R", "G", "W"], "style": "Backup and doubled counters", "blurb": "Bright-Palm shares backup and doubles counters on an attacker while restricting smaller blockers.", "set": "March of the Machine Commander (2023)"},
    "From Cute to Brute": {"icon": "🌓", "colors": ["W", "U", "B", "R", "G"], "style": "Transforming legends and five colors", "blurb": "Esika helps legends produce mana, while the Prismatic Bridge finds creatures and planeswalkers.", "set": "Secret Lair Commander (2023)"},

    "Mind Flayarrrs": {"icon":"🦑","colors":["U","B"],"style":"Horrors, mill, and theft","blurb":"Horrors mill opponents on combat damage, then the Captain takes a milled artifact or creature.","set":"Commander Legends: Battle for Baldur’s Gate (2022)"},
    "Party Time": {"icon":"🎲","colors":["W","B"],"style":"Full party and creature value","blurb":"Nalia casts party creatures from the top and rewards four distinct party members with counters and deathtouch.","set":"Commander Legends: Battle for Baldur’s Gate (2022)"},
    "Draconic Dissent": {"icon":"🐲","colors":["U","R"],"style":"Dragons and forced combat","blurb":"Firkraag goads a creature for each player attacked by your Dragons and draws from required attackers connecting.","set":"Commander Legends: Battle for Baldur’s Gate (2022)"},
    "Exit from Exile": {"icon":"🐺","colors":["R","G"],"style":"Exile casting and Wolves","blurb":"Faldorn creates Wolves when you cast from exile or a land enters from exile under your control.","set":"Commander Legends: Battle for Baldur’s Gate (2022)"},
    "Painbow": {"icon":"🌈","colors":["W","U","B","R","G"],"style":"Five-color threats and counters","blurb":"Jared makes five-color Kavu and gives creatures counters equal to their number of colors.","set":"Dominaria United Commander (2022)"},
    "Legends' Legacy": {"icon":"📜","colors":["W","B","R"],"style":"Legends and graveyard value","blurb":"Dihada protects legendary creatures, finds legends, and turns the other revealed cards into Treasures.","set":"Dominaria United Commander (2022)"},
    "Tyranid Swarm": {"icon":"🧬","colors":["G","U","R"],"style":"Ravenous X creatures","blurb":"The Swarmlord grows with your command-zone casts and draws when your creatures with counters die.","set":"Warhammer 40,000 Commander (2022)"},
    "The Ruinous Powers": {"icon":"☄️","colors":["U","B","R"],"style":"Life loss and cascade","blurb":"Abaddon gives qualifying spells from your hand cascade during your turn, based on opposing life lost.","set":"Warhammer 40,000 Commander (2022)"},
    "Necron Dynasties": {"icon":"💀","colors":["B"],"style":"Artifact reanimation and unearth","blurb":"Szarekh fills your graveyard and returns an artifact creature or Vehicle milled by its attack.","set":"Warhammer 40,000 Commander (2022)"},
    "Forces of the Imperium": {"icon":"⚜️","colors":["W","U","B"],"style":"Vigilant armies and squad","blurb":"Greyfax gives your other creatures +1/+0 and vigilance and can tap a threat while investigating.","set":"Warhammer 40,000 Commander (2022)"},
    "Vampiric Bloodline": {"icon": "🩸", "colors": ["B", "R"], "style": "Vampires and Blood", "blurb": "Strefan turns life loss into Blood and attacking Vampires.", "set": "Innistrad: Crimson Vow Commander (2021)"},
    "Spirit Squadron": {"icon": "👻", "colors": ["W", "U"], "style": "Spirits and flying tokens", "blurb": "Millicent discounts herself for your Spirits and replaces departing nontoken Spirits.", "set": "Innistrad: Crimson Vow Commander (2021)"},
    "Buckle Up": {"icon": "🚘", "colors": ["W", "U"], "style": "Vehicles and Pilots", "blurb": "Kotori gives your Vehicles crew 2 and helps an artifact creature race with lifelink.", "set": "Kamigawa: Neon Dynasty Commander (2022)"},
    "Upgrades Unleashed": {"icon": "🌸", "colors": ["R", "G"], "style": "Modified creatures and counters", "blurb": "Chishiro makes Spirits for Auras and Equipment and grows your modified creatures.", "set": "Kamigawa: Neon Dynasty Commander (2022)"},
    "Heads I Win, Tails You Lose": {"icon": "🪙", "colors": ["U", "R"], "style": "Coin flips and partner commanders", "blurb": "Zndrsplt draws from won flips while Okaun doubles his power and toughness.", "set": "Secret Lair Commander (2022)"},
    "Riveteers Rampage": {"icon": "🔥", "colors": ["B", "R", "G"], "style": "Blitz and creature recursion", "blurb": "Henzie gives large creature spells blitz and discounts blitz for your command-zone casts.", "set": "Streets of New Capenna Commander (2022)"},
    "Obscura Operation": {"icon": "🕵️", "colors": ["W", "U", "B"], "style": "Connive and evasive attacks", "blurb": "Kamiz makes an attacker unblockable, lets it connive, and gives a smaller attacker double strike.", "set": "Streets of New Capenna Commander (2022)"},
    "Bedecked Brokers": {"icon": "🛡️", "colors": ["G", "W", "U"], "style": "Counter diversity and shields", "blurb": "Perrie rewards the number of different counter kinds across your permanents.", "set": "Streets of New Capenna Commander (2022)"},
    "Maestros Massacre": {"icon": "🎨", "colors": ["U", "B", "R"], "style": "Casualty and spell copies", "blurb": "Anhelo grants casualty 2 to your first instant or sorcery each turn.", "set": "Streets of New Capenna Commander (2022)"},
    "Cabaretti Cacophony": {"icon": "🎉", "colors": ["R", "G", "W"], "style": "Creature tokens and goad", "blurb": "Kitt Kanto taps your creatures to strengthen and goad an active player’s creature.", "set": "Streets of New Capenna Commander (2022)"},

    "Land's Wrath": {"icon": "🌋", "colors": ["R", "G", "W"], "style": "Landfall and animated lands", "blurb": "Obuun grows your creatures with landfall and animates a land for combat.", "set": "Zendikar Rising Commander (2020)"},
    "Arm for Battle": {"icon": "⚔️", "colors": ["R", "W"], "style": "Equipment and commander attacks", "blurb": "Wyleth turns each attached Aura and Equipment into a card whenever he attacks.", "set": "Commander Legends (2020)"},
    "Reap the Tides": {"icon": "🌊", "colors": ["G", "U"], "style": "Extra lands and sea monsters", "blurb": "Aesi allows an extra land each turn and draws a card whenever your land enters.", "set": "Commander Legends (2020)"},
    "Phantom Premonition": {"icon": "👻", "colors": ["W", "U"], "style": "Foretell and blink", "blurb": "Ranar discounts your first foretell action each turn and creates Spirits from qualifying exile events.", "set": "Kaldheim Commander (2021)"},
    "Elven Empire": {"icon": "🌿", "colors": ["B", "G"], "style": "Elf tokens and life drain", "blurb": "Lathril makes Elf Warriors from combat damage and taps an Elf army to drain the table.", "set": "Kaldheim Commander (2021)"},
    "Undead Unleashed": {"icon": "🧟", "colors": ["U", "B"], "style": "Zombie tokens and sacrifice", "blurb": "Wilhelt replaces other Zombies without decayed that die with decayed Zombies.", "set": "Innistrad: Midnight Hunt Commander (2021)"},
    "Dungeons of Death": {"icon": "🗝️", "colors": ["W", "U", "B"], "style": "Dungeons and reanimation", "blurb": "Sefris ventures when creature cards enter your graveyard and reanimates after a dungeon.", "set": "Adventures in the Forgotten Realms Commander (2021)"},
    "Aura of Courage": {"icon": "🛡️", "colors": ["G", "W", "U"], "style": "Auras and Equipment", "blurb": "Galea casts Auras and Equipment from the top of your library.", "set": "Adventures in the Forgotten Realms Commander (2021)"},
    "Draconic Rage": {"icon": "🐉", "colors": ["R", "G"], "style": "Dragons and dice", "blurb": "Vrondiss creates Dragon Spirits when dealt damage.", "set": "Adventures in the Forgotten Realms Commander (2021)"},
    "Planar Portal": {"icon": "🔥", "colors": ["B", "R"], "style": "Exile cards and Treasures", "blurb": "Prosper turns cards played from exile into Treasures.", "set": "Adventures in the Forgotten Realms Commander (2021)"},

    "Mystic Intellect": {"icon": "📜", "colors": ["W", "U", "R"], "style": "Flashback and spell copies", "blurb": "Sevinne copies your first instant or sorcery cast from the graveyard each turn.", "set": "Commander (2019)"},
    "Faceless Menace": {"icon": "🎭", "colors": ["B", "G", "U"], "style": "Morph and hidden creatures", "blurb": "Kadena discounts your first face-down creature spell each turn and draws when a face-down creature enters.", "set": "Commander (2019)"},
    "Timeless Wisdom": {"icon": "🪽", "colors": ["W", "U", "R"], "style": "Cycling and token value", "blurb": "Gavi makes your first cycling cost each turn free and rewards your second draw with a Dinosaur Cat.", "set": "Commander (2020)"},
    "Enhanced Evolution": {"icon": "🧬", "colors": ["B", "G", "U"], "style": "Mutate and creature recursion", "blurb": "Otrimi combines mutate abilities with trample and returns mutate creatures after a combat hit.", "set": "Commander (2020)"},
    "Ruthless Regiment": {"icon": "🛡️", "colors": ["R", "W", "B"], "style": "Humans and attack pressure", "blurb": "Jirina recruits Humans based on her command-zone casts and gives your other Humans +2/+0.", "set": "Commander (2020)"},
    "Arcane Maelstrom": {"icon": "🌩️", "colors": ["G", "U", "R"], "style": "Instants and spell copies", "blurb": "A tapped Kalamax copies your first instant each turn and grows whenever you copy an instant.", "set": "Commander (2020)"},
    "Symbiotic Swarm": {"icon": "🪲", "colors": ["W", "B", "G"], "style": "Graveyard and keyword counters", "blurb": "Kathril turns creature keywords in your graveyard into counters and grows for the counters actually placed.", "set": "Commander (2020)"},
    "Sneak Attack": {"icon": "🗡️", "colors": ["U", "B"], "style": "Rogues and combat milling", "blurb": "Anowon boosts other Rogues and turns Rogue combat damage into milling and potential card draw.", "set": "Zendikar Rising Commander (2020)"},

    "Draconic Domination": {"icon": "🐉", "colors": ["B", "G", "R", "U", "W"], "style": "Dragons And Eminence", "blurb": "The Ur-Dragon reduces Dragon costs from the command zone and rewards a full flight with cards and a free permanent.", "set": "Commander (2017)"},
    "Vampiric Bloodlust": {"icon": "🦇", "colors": ["B", "R", "W"], "style": "Vampire Swarm", "blurb": "Edgar creates a Vampire for each other Vampire spell, then grows the whole tribe when he attacks.", "set": "Commander (2017)"},
    "Feline Ferocity": {"icon": "🐈", "colors": ["G", "W"], "style": "Cats And Equipment", "blurb": "Arahbo boosts a Cat before combat and can turn another attacking Cat into a trampling threat.", "set": "Commander (2017)"},
    "Arcane Wizardry": {"icon": "🧙", "colors": ["B", "R", "U"], "style": "Wizards And Copies", "blurb": "Inalla offers temporary Wizard copies whose entry abilities build value and whose bodies can attack immediately.", "set": "Commander (2017)"},
    "Exquisite Invention": {"icon": "⚙️", "colors": ["R", "U"], "style": "Artifact Engines", "blurb": "Saheeli creates Servos and gives the next spell a discount based on your artifact count.", "set": "Commander (2018)"},
    "Subjective Reality": {"icon": "🔮", "colors": ["B", "U", "W"], "style": "Top-Deck And Blink", "blurb": "Aminatou sets up the top of your library and blinks owned permanents to reuse their entry abilities.", "set": "Commander (2018)"},
    "Nature's Vengeance": {"icon": "🌿", "colors": ["B", "G", "R"], "style": "Lands And Recursion", "blurb": "Lord Windgrace turns discarded lands into extra cards and brings lands back from the graveyard.", "set": "Commander (2018)"},
    "Adaptive Enchantment": {"icon": "🎭", "colors": ["G", "U", "W"], "style": "Auras And Enchantments", "blurb": "Estrid protects permanents with Masks, untaps enchanted permanents and rebuilds enchantments from the graveyard.", "set": "Commander (2018)"},
    "Merciless Rage": {"icon": "🔥", "colors": ["B", "R"], "style": "Madness And Discard", "blurb": "Anje discards and draws at speed, untapping whenever you discard a card with madness.", "set": "Commander (2019)"},
    "Primal Genesis": {"icon": "🦏", "colors": ["G", "R", "W"], "style": "Populate And Attack", "blurb": "Ghired brings a trampling Rhino and populates an attacking token every time he attacks.", "set": "Commander (2019)"},

      "Call the Spirits": {"icon":"👻","colors":["W","B"],"style":"Enchantments, experience and Spirits","blurb":"Daxos turns each enchantment spell into lasting experience and an army of growing Spirits.","set":"Commander (2015)"},
      "Seize Control": {"icon":"🧪","colors":["U","R"],"style":"Cost reduction and copied spells","blurb":"Mizzix makes large instants and sorceries affordable as your experience grows.","set":"Commander (2015)"},
      "Plunder the Graves": {"icon":"🍄","colors":["B","G"],"style":"Sacrifice and graveyard recursion","blurb":"Meren builds experience from fallen creatures and brings them back at your end step.","set":"Commander (2015)"},
      "Wade into Battle": {"icon":"⚔️","colors":["R","W"],"style":"Large creatures and double strike","blurb":"Kalemne gains experience from expensive creatures and becomes a vigilant double-strike threat.","set":"Commander (2015)"},
      "Swell the Host": {"icon":"🌊","colors":["G","U"],"style":"Creature entries and experience counters","blurb":"Ezuri rewards small creatures, then places your accumulated experience on another creature before combat.","set":"Commander (2015)"},
      "Entropic Uprising": {"icon":"🌀","colors":["U","B","R","G"],"style":"Four-color cascade and wheels","blurb":"Yidris turns a successful combat hit into cascade for spells you cast from your hand that turn.","set":"Commander (2016)"},
      "Open Hostility": {"icon":"🦏","colors":["B","R","G","W"],"style":"Combat pressure across opponents","blurb":"Saskia chooses a player as she enters and sends extra creature damage toward that player.","set":"Commander (2016)"},
      "Stalwart Unity": {"icon":"🏛️","colors":["R","G","W","U"],"style":"Shared draws and protected development","blurb":"Kynaios and Tiro help every player develop while your defenses buy time to use the extra resources.","set":"Commander (2016)"},
      "Breed Lethality": {"icon":"☣️","colors":["W","U","B","G"],"style":"Growing counters and evasive threats","blurb":"Atraxa proliferates at your end step while the deck spreads counters across an expanding board.","set":"Commander (2016)"},
      "Invent Superiority": {"icon":"⚙️","colors":["W","U","B","R"],"style":"Artifacts, Thopters and recursion","blurb":"Breya makes Thopters and converts spare artifacts into damage, removal or life.","set":"Commander (2016)"},
      "Forged in Stone": {"icon":"⚒️","colors":["W"],"style":"Equipment and resilient armies","blurb":"Nahiri forges Equipment, raises Kor Soldiers, and rebuilds a resilient white army.","set":"Commander (2014)"},
      "Peer Through Time": {"icon":"⌛","colors":["U"],"style":"Mana engines and blue control","blurb":"Teferi untaps powerful mana sources and uses blue card advantage to keep large threats coming.","set":"Commander (2014)"},
      "Sworn to Darkness": {"icon":"👹","colors":["B"],"style":"Demons, sacrifice and life drain","blurb":"Ob Nixilis builds a Demon army while black mana engines, sacrifice and life drain wear down the table.","set":"Commander (2014)"},
      "Built from Scratch": {"icon":"🔩","colors":["R"],"style":"Artifact sacrifice and reanimation","blurb":"Daretti turns discarded machines into battlefield threats and rebuilds after every exchange.","set":"Commander (2014)"},
      "Guided by Nature": {"icon":"🌳","colors":["G"],"style":"Elves, mana and overwhelming combat","blurb":"Freyalise grows an Elf mana engine that turns into a large army and powerful green finishers.","set":"Commander (2014)"},
      "Lorehold Legacies": {"icon":"⚒️","colors":["R","W"],"style":"Artifact recursion and copies","blurb":"Osgir rebuilds fallen artifacts as pairs of tokens, turning discarded relics into mana and massive constructs.","set":"Commander (2021)"},
      "Prismari Performance": {"icon":"🎼","colors":["U","R"],"style":"Big spells and magecraft","blurb":"Zaffai rewards large instants, sorceries, and copies with Elementals and bursts of damage.","set":"Commander (2021)"},
      "Quantum Quandrix": {"icon":"🌀","colors":["G","U"],"style":"Token copies and counters","blurb":"Adrix and Nev double token production, building Fractals, copies, and growing armies.","set":"Commander (2021)"},
      "Silverquill Statement": {"icon":"🪶","colors":["W","B"],"style":"Political combat and counters","blurb":"Breena rewards carefully chosen attacks with cards and counters while protective threats discourage retaliation.","set":"Commander (2021)"},
      "Witherbloom Witchcraft": {"icon":"🌿","colors":["B","G"],"style":"Life gain and growing creatures","blurb":"Willowdusk converts life gained or lost into counters, backed by Food, lifelink, and graveyard recovery.","set":"Commander (2021)"},
      'First Flight': {icon:'🦅',colors:['W','U'],style:'Flying and control',blurb:'Isperia protects the skies with flying creatures, card draw, and timely answers.',set:'Starter Commander Decks (2022)'},
      'Grave Danger': {icon:'🧟',colors:['U','B'],style:'Zombies and graveyard',blurb:'Gisa and Geralf fill the graveyard and cast returning Zombies to rebuild the horde.',set:'Starter Commander Decks (2022)'},
      'Chaos Incarnate': {icon:'🔥',colors:['B','R'],style:'Forced combat and sacrifice',blurb:'Kardur sends opposing armies into combat while demons, sacrifice, and damage wear down the table.',set:'Starter Commander Decks (2022)'},
      'Draconic Destruction': {icon:'🐉',colors:['R','G'],style:'Dragons and ramp',blurb:'Atarka leads a flight of Dragons into double-strike attacks, backed by ramp and powerful combat triggers.',set:'Starter Commander Decks (2022)'},
      'Token Triumph': {icon:'🌱',colors:['G','W'],style:'Tokens and convoke',blurb:'Emmara creates Soldiers as she taps, growing a wide army with convoke, counters, and creature boosts.',set:'Starter Commander Decks (2022)'},
      'Squirreled Away': { icon: '🐿️', colors: ['B', 'G'], style: 'Tokens and sacrifice', blurb: 'Squirrels, Food, and sacrifice synergies build wide boards and drain the table.', set: 'Bloomburrow Commander (2024)' },
      'Animated Army': { icon: '🥁', colors: ['R', 'G'], style: 'Animated artifacts', blurb: 'Bello turns artifacts and enchantments into a hasty 4/4 army.', set: 'Bloomburrow Commander (2024)' },
      'Family Matters': { icon: '🐭', colors: ['U', 'R', 'W'], style: 'Offspring and fliers', blurb: 'Zinnia gives offspring to every creature, filling the skies with small copies.', set: 'Bloomburrow Commander (2024)' },
      'Endless Punishment': { icon: '👹', colors: ['B', 'R'], style: 'Group slug', blurb: 'Valgavoth grows while opponents bleed for every action.', set: 'Duskmourn Commander (2024)' },
      'Quick Draw': { icon: '🎯', colors: ['U', 'R'], style: 'Spellslinger', blurb: 'Stella Lee copies instants and sorceries with speed and precision.', set: 'Outlaws of Thunder Junction Commander (2024)' },
      'Abzan Armor': { icon: '🛡️', colors: ['W', 'B', 'G'], style: 'Toughness and defenders', blurb: 'Felothar lets walls attack with toughness: slow, impenetrable force.', set: 'Tarkir: Dragonstorm Commander (2025)' },
      'Deep Clue Sea': { icon: '🔍', colors: ['G', 'W', 'U'], style: 'Clues and card draw', blurb: 'Morska investigates with Clue tokens, piles of cards, and huge finishers.', set: 'Murders at Karlov Manor Commander (2024)' },
      'Blame Game': { icon: '⚖️', colors: ['R', 'W'], style: 'Goad and politics', blurb: 'Nelly Borca turns opponents against one another in multiplayer chaos.', set: 'Murders at Karlov Manor Commander (2024)' },
      'Turtle Power': { icon: '🐢', colors: ['W', 'U', 'B', 'R', 'G'], style: '+1/+1 counters and tokens', blurb: 'Heroes in a Half Shell: Mutants, Ninjas, and Turtles grow with every hit. Cowabunga!', set: 'Teenage Mutant Ninja Turtles Commander (2026)' },
      'Mardu Surge': { icon: '⚔️', colors: ['R', 'W', 'B'], style: 'Go-wide tokens', blurb: 'Zurgo Stormrender mobilizes waves of attacking tokens that keep their value when they leave.', set: 'Tarkir: Dragonstorm Commander (2025)' },
      'Blight Curse': { icon: '🍄', colors: ['B', 'R', 'G'], style: '-1/-1 counters and wither', blurb: 'Auntie Ool poisons boards while Necroskitter steals corpses and Hapatra creates Snakes.', set: 'Lorwyn Eclipsed Commander (2026)' },
      'Counter Intelligence': { icon: '🛸', colors: ['U', 'R', 'W'], style: 'Artifacts and charge counters', blurb: 'Inspirit stations a spacecraft, proliferates charge counters, and threatens a Darksteel Reactor win.', set: 'Edge of Eternities Commander (2025)' },
      'Most Wanted': { icon: '🤠', colors: ['R', 'W', 'B'], style: 'Outlaws and Treasure', blurb: 'Olivia leads outlaw heists with Treasure for every hit, theft, and Wild West politics.', set: 'Outlaws of Thunder Junction Commander (2024)' },
      'Elven Council': { icon: '🧝', colors: ['G', 'U'], style: 'Elves and voting', blurb: 'Galadriel calls a vote each combat amid Elves, Ring temptations, politics, and wisdom.', set: 'LOTR: Tales of Middle-earth Commander (2023)' },
      'Prismari Artistry': { icon: '🎨', colors: ['U', 'R'], style: 'Spellslinger and copies', blurb: 'Rootha turns every instant and sorcery into explosive X/X Elemental art.', set: 'Secrets of Strixhaven Commander (2026)' },
      'Avengers Assemble': { icon: '🛡️', colors: ['U', 'R', 'W'], style: 'Hero typal and counters', blurb: 'Captain America assembles the Avengers, and every Hero strengthens the team.', set: 'Marvel Super Heroes Commander (2026)' },
      'Doom Prevails': { icon: '🤖', colors: ['U', 'B', 'R'], style: 'Villains and connive', blurb: 'Doctor Doom leads a gallery of villains through connive, graveyard mayhem, theft, and punishment.', set: 'Marvel Super Heroes Commander (2026)' },
      'The Fantastic Four': { icon: '4️⃣', colors: ['R', 'G', 'W', 'U'], style: 'Noncreature synergies', blurb: "Marvel's first family triggers abilities with every noncreature spell. Flame On! It's Clobberin' Time!", set: 'Marvel Super Heroes Commander (2026)' },
      'Wakanda Forever': { icon: '🐾', colors: ['G', 'W'], style: 'Artifacts and monarch', blurb: "T'Challa harnesses Vibranium mana, equipment, and the fight for the crown. Wakanda forever!", set: 'Marvel Super Heroes Commander (2026)' },
      'Scions & Spellcraft': { icon: '🔮', colors: ['W', 'U', 'B'], style: 'Spellslinger and drain', blurb: "Y'shtola drains each opponent whenever you cast a noncreature spell with mana value 3 or greater.", set: 'Final Fantasy Commander (2025)' },
      'Coven Counters': { icon: '🌾', colors: ['G', 'W'], style: '+1/+1 counters and Coven', blurb: 'Leinore adds a counter each combat, while three different powers unlock Coven card draw.', set: 'Innistrad: Midnight Hunt Commander (2021)' },
      'Quandrix Unlimited': { icon: '♾️', colors: ['U', 'G'], style: 'Landfall and counters', blurb: 'Zimone turns landfall into a growing equation of counters, card advantage, and enormous Fractals.', set: 'Secrets of Strixhaven Commander (2026)' },
      'Dance of the Elements': { icon: '🌈', colors: ['W', 'U', 'B', 'R', 'G'], style: 'Elemental typal and graveyard', blurb: 'Ashling conducts all five colors, returning Elementals from the graveyard for one limitless final dance.', set: 'Lorwyn Eclipsed Commander (2026)' },
      'World Shaper': { icon: '🌍', colors: ['B', 'R', 'G'], style: 'Lands and sacrifice', blurb: 'Hearthhull stations a living worldship while sacrificed lands fuel recursion, tokens, and landfall.', set: 'Edge of Eternities Commander (2025)' },
      'Limit Break': { icon: '⚔️', colors: ['W', 'R', 'G'], style: 'Equipment and modified creatures', blurb: 'Cloud equips a party of heroes, turns modified creatures into threats, and climbs toward a decisive Limit Break.', set: 'Final Fantasy Commander (2025)' },
      'Temur Roar': { icon: '🐉', colors: ['U', 'R', 'G'], style: 'Dragons and combat', blurb: 'Ureni calls Dragons from the library while Temur ramp, haste, and combat pressure keep the skies roaring.', set: 'Tarkir: Dragonstorm Commander (2025)' },
      'Sultai Arisen': { icon: '🪦', colors: ['U', 'B', 'G'], style: 'Graveyard and reanimation', blurb: 'Teval mills and recycles a deep graveyard, turning every fallen card into another source of value.', set: 'Tarkir: Dragonstorm Commander (2025)' },
      'Jeskai Striker': { icon: '🥋', colors: ['W', 'U', 'R'], style: 'Spellslinger and copies', blurb: 'Shiko and Narset reward the second spell each turn with precise copies, fresh cards, and explosive prowess turns.', set: 'Tarkir: Dragonstorm Commander (2025)' },
    };
    if (MTG.buildCardCatalog) MTG.buildCardCatalog(rawDB, MTG.DEFS);
    if (MTG.buildDeckAIProfiles) MTG.buildDeckAIProfiles();
  };

  // ============================================================
  // KOMANDERI: partner pravila i legalni izbori po deku
  // ============================================================
  // Podržane varijante:
  //   Partner                    – bilo koja druga karta sa običnim Partnerom
  //   Partner—<Label>            – samo karta sa ISTIM labelom (npr. TMNT "Character select")
  //   Partner with <Ime>         – samo ta imenovana karta
  //   Friends forever            – bilo koja druga sa Friends forever
  //   Choose a Background        – + bilo koji Background
  //   Doctor's companion         – + bilo koji legendarni Doctor
  MTG.cmdTag = function (def) {
    const o = (def && def.oracle) || '';
    const sub = MTG.normalizeSubtypes((def && def.subtypes) || []);
    const sup = (def && def.super) || [];
    const types = (def && def.types) || [];
    const t = { kind: null, label: null, with: null };
    let m;
    if ((m = /^Partner with ([^(\n]+?)\s*(?:\(|$)/m.exec(o))) { t.kind = 'with'; t.with = m[1].trim().replace(/\.$/, ''); }
    else if ((m = /^Partner\s*[—–-]\s*([^(\n]+?)\s*(?:\(|$)/m.exec(o))) { t.kind = 'named'; t.label = m[1].trim(); }
    else if (/^Partner\s*(?:\(|$)/m.test(o)) { t.kind = 'partner'; }
    else if (/^Friends forever/m.test(o)) { t.kind = 'named'; t.label = 'Friends forever'; }
    else if (/Doctor's companion/i.test(o)) { t.kind = 'doctorsCompanion'; }
    else if (/Choose a Background/i.test(o)) { t.kind = 'background'; }
    t.isBackground = sub.indexOf('Background') >= 0 && sup.indexOf('Legendary') >= 0 && types.indexOf('Enchantment') >= 0;
    // Doctor's companion names the Doctor, not every legendary object with
    // Doctor among its subtypes: it must be a Time Lord Doctor creature with
    // no additional creature types.
    t.isDoctor = sup.indexOf('Legendary') >= 0 && types.indexOf('Creature') >= 0 &&
      sub.length === 2 && sub.indexOf('Time Lord') >= 0 && sub.indexOf('Doctor') >= 0 &&
      !def.changeling && !(def.kws || []).includes('changeling');
    return t;
  };

  // ljudski čitljiv opis partner sposobnosti
  MTG.cmdTagLabel = function (tag) {
    if (!tag || !tag.kind) return '';
    if (tag.kind === 'with') return '🤝 Partner with: ' + tag.with;
    if (tag.kind === 'named') return '🤝 Partner — ' + tag.label;
    if (tag.kind === 'partner') return '🤝 Partner';
    if (tag.kind === 'background') return '🤝 Choose a Background';
    if (tag.kind === 'doctorsCompanion') return '🤝 Doctor\'s companion';
    return '';
  };

  // može li ovo dvoje biti par komandera?
  MTG.canPartner = function (defA, defB) {
    if (!defA || !defB || defA.name === defB.name) return false;
    const a = MTG.cmdTag(defA), b = MTG.cmdTag(defB);
    if (a.kind === 'with' || b.kind === 'with')
      return a.with === defB.name || b.with === defA.name;
    if (a.kind === 'partner' && b.kind === 'partner') return true;
    if (a.kind === 'named' && b.kind === 'named' &&
      String(a.label).toLowerCase() === String(b.label).toLowerCase()) return true;
    if (a.kind === 'background' && b.isBackground) return true;
    if (b.kind === 'background' && a.isBackground) return true;
    if (a.kind === 'doctorsCompanion' && b.isDoctor) return true;
    if (b.kind === 'doctorsCompanion' && a.isDoctor) return true;
    return false;
  };

  MTG.canBeCommander = function (def, deckData) {
    if (!def) return false;
    // Fiksni fabrički deckovi imaju auditiran face-commander izuzetak
    // (planeswalkeri, legendarni Spacecraft…). Pasted/custom liste ne smiju
    // tim izuzetkom proglasiti proizvoljnu kartu commanderom.
    if (deckData && deckData.commander === def.name && deckData.trustedFaceCommander !== false) return true;
    const sup = def.super || [], o = def.oracle || '';
    if (def.canBeCommanderExtra) return true;
    if (/can be your commander/i.test(o)) return true;
    if ((def.subtypes || []).indexOf('Background') >= 0)
      return sup.indexOf('Legendary') >= 0 && (def.types || []).indexOf('Enchantment') >= 0;
    return sup.indexOf('Legendary') >= 0 && (def.types || []).indexOf('Creature') >= 0;
  };

  // Commander color identity: mana cost + mana simboli u rules tekstu (bez
  // reminder teksta) + eksplicitne dopune za color indicator/specijalne karte.
  MTG.cardColorIdentity = function (def) {
    if (!def) return [];
    const found = new Set();
    const add = values => { for (const color of values || []) if (COLORS.includes(color)) found.add(color); };
    add(U.colorsOfCost(def.cost || ''));
    const rules = String(def.oracle || '').replace(/\([^()]*\)/g, '');
    add(U.colorsOfCost((rules.match(/\{[^}]+\}/g) || []).join('')));
    add(def.colorIdentityExtra);
    add(def._ci);
    const landColors = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
    for (const subtype of def.subtypes || []) if (landColors[subtype]) found.add(landColors[subtype]);
    return COLORS.filter(color => found.has(color));
  };

  MTG.deckColorIdentity = function (deckData, defs) {
    defs = defs || MTG.DEFS;
    const found = new Set();
    for (const entry of deckData && deckData.cards || []) {
      for (const color of MTG.cardColorIdentity(defs[entry.name])) found.add(color);
    }
    return COLORS.filter(color => found.has(color));
  };

  // svi legalni komanderi u deku, sortirano: face commander prvi, pa partneri, pa ostali
  MTG.legalCommanders = function (deckData, defs) {
    defs = defs || MTG.DEFS;
    if (!deckData) return [];
    const seen = {}, out = [];
    for (const entry of deckData.cards || []) {
      if (seen[entry.name]) continue;
      seen[entry.name] = 1;
      const def = defs[entry.name];
      if (!MTG.canBeCommander(def, deckData)) continue;
      const tag = MTG.cmdTag(def);
      out.push({
        name: entry.name, def, tag,
        isDefault: entry.name === deckData.commander,
        partnerLabel: MTG.cmdTagLabel(tag),
      });
    }
    // Kandidat je stvarno legalan samo ako sam, ili sa legalnim partnerom iz
    // istog decka, pokriva color identity svih 100 karata.
    const viable = out.filter(candidate => {
      if (MTG.validateCommanders(deckData, [candidate.name], defs).ok) return true;
      return out.some(mate => mate !== candidate && MTG.canPartner(candidate.def, mate.def) &&
        MTG.validateCommanders(deckData, [candidate.name, mate.name], defs).ok);
    });
    viable.sort((a, b) => (b.isDefault - a.isDefault) || ((b.tag.kind ? 1 : 0) - (a.tag.kind ? 1 : 0)) || a.name.localeCompare(b.name));
    return viable;
  };

  // provjera izbora (1 ili 2 imena)
  MTG.validateCommanders = function (deckData, names, defs) {
    defs = defs || MTG.DEFS;
    names = (names || []).filter(Boolean);
    if (!names.length) return { ok: false, why: 'No commander selected.' };
    if (names.length > 2) return { ok: false, why: 'Choose no more than two commanders.' };
    const pool = {};
    for (const entry of (deckData.cards || [])) pool[entry.name] = (pool[entry.name] || 0) + entry.n;
    for (const n of names) {
      if (!pool[n]) return { ok: false, why: `${n} is not in this deck.` };
      if (!MTG.canBeCommander(defs[n], deckData)) return { ok: false, why: `${n} cannot be a commander.` };
    }
    if (names.length === 2) {
      if (names[0] === names[1]) return { ok: false, why: 'The same commander cannot be selected twice.' };
      if (!MTG.canPartner(defs[names[0]], defs[names[1]]))
        return { ok: false, why: `${names[0]} and ${names[1]} are not partners.` };
    }
    const commanderColors = new Set();
    for (const name of names) for (const color of MTG.cardColorIdentity(defs[name])) commanderColors.add(color);
    const deckColors = MTG.deckColorIdentity(deckData, defs);
    const outside = deckColors.filter(color => !commanderColors.has(color));
    if (outside.length) {
      return { ok: false, why: `The deck contains colors outside the commanders' color identity: ${outside.join(', ')}.` };
    }
    return { ok: true, why: '' };
  };

  // Preserve the printed default pair as well as the Turtle Power pairing.
  MTG.defaultCommanders = function (deckData, defs) {
    const names = deckData && deckData.name === 'Turtle Power'
      ? ['Leonardo, the Balance', 'Michelangelo, the Heart']
      : [deckData && deckData.commander, deckData && deckData.partner].filter(Boolean);
    return MTG.validateCommanders(deckData, names, defs || MTG.DEFS).ok
      ? names : [deckData.commander];
  };

  // AI/nasumičan izbor: face commander, ili slučajan legalan (par ako može)
  MTG.randomCommanders = function (deckData, rnd, defs) {
    defs = defs || MTG.DEFS;
    const legals = MTG.legalCommanders(deckData, defs);
    if (!legals.length) return MTG.defaultCommanders(deckData, defs);
    const pick = legals[Math.floor(rnd() * legals.length)];
    const mates = legals.filter(l => MTG.canPartner(pick.def, l.def) &&
      MTG.validateCommanders(deckData, [pick.name, l.name], defs).ok);
    // A candidate may be legal only together with a partner (its own color
    // identity does not cover the deck). Such a pick must always bring a mate;
    // otherwise the engine rejected the selection and silently fell back to
    // the printed commander.
    const soloLegal = MTG.validateCommanders(deckData, [pick.name], defs).ok;
    if (mates.length && (!soloLegal || rnd() < 0.6)) {
      const mate = mates[Math.floor(rnd() * mates.length)];
      return [pick.name, mate.name];
    }
    if (!soloLegal) return MTG.defaultCommanders(deckData, defs);
    return [pick.name];
  };

  // ============================================================
  // KLASIFIKACIJA PRIJETNJE — šta mi je bot upravo uperio u glavu?
  // ============================================================
  MTG.THREAT_KINDS = {
    counter: { icon: '🚫', label: 'Counterspell', cls: 'counter', hint: 'This counters your spell. If you have a response, now is the time.' },
    exile: { icon: '🌀', label: 'Exile', cls: 'exile', hint: 'Exiled cards do not go to the graveyard. Regeneration and graveyard recursion do not help.' },
    destroy: { icon: '💀', label: 'Removal', cls: 'destroy', hint: 'This destroys your permanent.' },
    sacrifice: { icon: '🔪', label: 'Forced sacrifice', cls: 'destroy', hint: 'You must sacrifice. Hexproof and indestructible do not save it.' },
    bounce: { icon: '↩️', label: 'Bounce', cls: 'bounce', hint: 'This returns your permanent to your hand.' },
    damage: { icon: '🔥', label: 'Direct damage', cls: 'damage', hint: 'Damage is aimed at you or your creature.' },
    steal: { icon: '🤝', label: 'Control change', cls: 'steal', hint: 'This takes control of your permanent.' },
    discard: { icon: '🃏', label: 'Discard', cls: 'discard', hint: 'This makes you discard cards.' },
    debuff: { icon: '⬇️', label: 'Debuff', cls: 'debuff', hint: 'This weakens, taps, or restricts your creature.' },
    tax: { icon: '💸', label: 'Tax or life loss', cls: 'debuff', hint: 'You lose life or resources, or must pay a cost.' },
    goad: { icon: '😈', label: 'Goad and politics', cls: 'steal', hint: 'Your creatures are forced to attack someone else.' },
    target: { icon: '🎯', label: 'Targeting you', cls: 'target', hint: 'The bot aimed this at you.' },
  };

  // vraća {key, icon, label, cls, hint} — najspecifičnija kategorija koja se poklopi
  MTG.threatKind = function (def, targets) {
    const o = ((def && def.oracle) || '').replace(/\s+/g, ' ');
    const t = s => new RegExp(s, 'i').test(o);
    const hitsSpell = (targets || []).flat().some(x => x && x.kind && !x.zone);
    if (hitsSpell || t('counter target') || t('counter (?:that|it)\\b') || t('counter all')) return kind('counter');
    if (t('exile target') || t('exile (?:all|each|any number of|up to)') || t('exile (?:that|it) (?:card|creature|permanent)')) return kind('exile');
    if (t('gain control of')) return kind('steal');
    if (t('goad')) return kind('goad');
    if (t('sacrific\\w+ (?:a|an|that|the|one|two|\\d)')) return kind('sacrifice');
    if (t('destroy target') || t('destroy (?:all|each|any number of|up to)')) return kind('destroy');
    if (t('return target .* to .*hand') ||
      t('shuffles? .* into (?:their|its owner\'s) library') ||
      t('(?:on top|on the bottom) of (?:its owner\'s|their) library')) return kind('bounce');
    if (t('deals? \\d+ damage') || t('deals? damage equal') || t('deals? X damage')) return kind('damage');
    if (t('discards? ')) return kind('discard');
    if (t('gets? [-−]\\d') || t('tap target') || t("(?:doesn't|does not) untap") || t('-1/-1 counter')) return kind('debuff');
    if (t('loses? \\d+ life') || t('lose life') || t('pay(?:s)? ')) return kind('tax');
    return kind('target');
    function kind(k) { return Object.assign({ key: k }, MTG.THREAT_KINDS[k]); }
  };

  // opis meta u jednoj liniji ("TEBE", imena permanenata, "tvoj spell X")
  MTG.threatTargetNames = function (targets, human) {
    const out = [];
    for (const x of (targets || []).flat()) {
      if (!x) continue;
      if (x === human) out.push('YOU');
      else if (x.kind && !x.zone) out.push(`your spell "${x.name || (x.card && x.card.name) || '?'}"`);
      else if (x.name) out.push(x.name);
    }
    return out;
  };

  // redovi za prikaz commander štete — poštuje kućno pravilo o zbiru partnera
  MTG.cmdDamageRows = function (g, p) {
    const sum = !!(g.houseRules && g.houseRules.sumPartnerDamage);
    const ent = Object.entries(p.commanderDamage || {});
    const rows = [];
    if (!sum) {
      for (const [iid, n] of ent) {
        const c = g.byIid(parseInt(iid, 10));
        rows.push({ label: c ? c.name.split(',')[0] : '?', n, detail: c ? c.name : '' });
      }
    } else {
      const byKey = {};
      for (const [iid, n] of ent) {
        const c = g.byIid(parseInt(iid, 10));
        const own = c && c.owner ? c.owner : null;
        const k = own ? 'p' + own.idx : iid;
        if (!byKey[k]) { byKey[k] = { label: own ? own.name : '?', n: 0, parts: [] }; rows.push(byKey[k]); }
        byKey[k].n += n;
        byKey[k].parts.push(`${c ? c.name.split(',')[0] : '?'} ${n}`);
      }
      for (const r of rows) r.detail = r.parts.join(' + ');
    }
    rows.sort((a, b) => b.n - a.n);
    return rows;
  };

  // A bot may pilot an imported deck, but only when the player hands that deck
  // to the seat on purpose. The random filler stays built-in so "Random" never
  // silently mirrors the player's own list back at them.
  MTG.selectAIDecks = function (humanDeck, aiCount, selections, rnd) {
    const chosen = Array.from({ length: aiCount }, (_, index) => {
      const name = (selections || [])[index];
      return name && name !== humanDeck && MTG.DECKS[name] ? name : '';
    });
    const seen = new Set([humanDeck]);
    for (let i = 0; i < chosen.length; i++) {
      if (!chosen[i] || seen.has(chosen[i])) chosen[i] = '';
      else seen.add(chosen[i]);
    }
    const pool = Object.keys(MTG.DECKS).filter(name => !seen.has(name) && !MTG.DECKS[name].custom);
    U.shuffle(pool, rnd || Math.random);
    return chosen.map(name => name || pool.shift()).filter(Boolean);
  };

  MTG.newGame = function (opts) {
    // opts: {humanDeck, aiDecks:[names], aiStyles:[keys], seed, onEvent, humanController, difficulty, maxTurns,
    //        humanCommanders:[names], remoteHumans?:[{deck,name,commanders,controller}], aiRandomCommanders:bool,
    //        diplomacyEnabled:bool}. Online Commander supplies remote humans and local AI in any supported seat combination.
    const customSkills = MTG.validateAISkillSetup(opts.aiStyles || [], opts.aiCustomSkills || MTG.snapshotAISkills(opts.aiStyles));
    customSkills.forEach(MTG.registerAISkill);
    const g = new MTG.Game({
      seed: opts.seed, onEvent: opts.onEvent, maxTurns: opts.maxTurns, paced: opts.paced,
      difficulty: opts.difficulty || 'normal', humanDeck: opts.humanDeck,
      aiRandomCommanders: !!opts.aiRandomCommanders,
      houseRules: Object.assign({}, opts.houseRules,
        opts.sumPartnerDamage !== undefined ? { sumPartnerDamage: !!opts.sumPartnerDamage } : {}),
    });
    const names = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'];
    const players = [];
    const humanP = g.addPlayer(opts.humanName || names[0], MTG.DECKS[opts.humanDeck], null, !opts.humanController);
    humanP.onlineSeat = 0;
    if (opts.humanCommanders && opts.humanCommanders.length) humanP.chosenCommanders = opts.humanCommanders.slice(0, 2);
    players.push(humanP);
    const remoteSpecs = Array.isArray(opts.remoteHumans)
      ? opts.remoteHumans.slice(0, 3)
      : opts.remoteHuman ? [opts.remoteHuman] : [];
    const remotePlayers = remoteSpecs.map((remote, index) => {
      const seat = remote.onlineSeat ?? index + 1;
      if (!remote.deck || !MTG.DECKS[remote.deck]) throw new Error(`Online Player ${seat + 1} needs a valid deck.`);
      if (!remote.controller) throw new Error(`Online Player ${seat + 1} needs a remote controller.`);
      const player = g.addPlayer(remote.name || `Player ${seat + 1}`, MTG.DECKS[remote.deck], null, false);
      player.onlineSeat = seat;
      player.onlineConnected = true;
      if (remote.commanders && remote.commanders.length) player.chosenCommanders = remote.commanders.slice(0, 2);
      players.push(player);
      return player;
    });
    const styleKeys = Object.keys(MTG.AI_STYLES || {}).filter(k => k !== 'balanced' && !MTG.AI_STYLES[k].custom);
    const styles = [];
    for (let botIndex = 0; botIndex < opts.aiDecks.length; botIndex++) {
      const dk = opts.aiDecks[botIndex];
      const q = g.addPlayer(opts.aiNames?.[botIndex] || names[botIndex + 1] + '', MTG.DECKS[dk], null, true);
      q.onlineSeat = opts.aiSeats?.[botIndex] ?? botIndex + remotePlayers.length + 1;
      if (opts.aiCommanders?.[botIndex]?.length) q.chosenCommanders = opts.aiCommanders[botIndex].slice(0, 2);
      let st = (opts.aiStyles && opts.aiStyles[botIndex]) || 'random';
      q.requestedAIStyle = st;
      if (st === 'random') st = styleKeys.length ? styleKeys[Math.floor(g.rnd() * styleKeys.length)] : 'balanced';
      styles.push({ player: q, style: st });
      players.push(q);
    }
    for (const p of g.players) {
      if (p === humanP && opts.humanController) {
        p.controller = opts.humanController(p);
        p.isAI = false;
      } else if (remotePlayers.includes(p)) {
        const remote = remoteSpecs[remotePlayers.indexOf(p)];
        p.controller = typeof remote.controller === 'function' ? remote.controller(p) : remote.controller;
        p.isAI = false;
      } else {
        const st = (styles.find(s => s.player === p) || {}).style || 'balanced';
        p.controller = new MTG.AIController(p, { difficulty: opts.difficulty || 'normal', style: st });
        p.isAI = true;
      }
      if (p !== humanP && opts.aiRandomCommanders && !p.chosenCommanders)
        p.chosenCommanders = MTG.randomCommanders(p.deck, g.rnd, MTG.DEFS);
      g.buildDeck(p, p.deck, MTG.DEFS);
      p.deckName = p.deck.name;
    }
    // objavi izbor komandera u log (samo kad odstupa od face commandera)
    for (const p of g.players) {
      const nm = p.commanders.map(c => c.name);
      if (nm.length > 1 || (nm.length === 1 && nm[0] !== p.deck.commander))
        g.lg(`👑 ${p.name}: ${nm.join(' + ')}${nm.length > 1 ? ' (partners)' : ''}`);
    }
    // randomize turn order
    U.shuffle(g.players, g.rnd);
    g.players.forEach((p, idx) => p.idx = idx);
    // Diplomacy already understands more than one non-AI responder, but the
    // current host spotlight UI is single-seat. Keep it off for live games
    // until its review surface is also routed through the room.
    if (MTG.initDiplomacy) MTG.initDiplomacy(g, remotePlayers.length ? false : !!opts.diplomacyEnabled);
    // objavi stilove botova u log
    for (const p of g.players) {
      if (p.isAI && p.aiStyle && MTG.AI_STYLES && MTG.AI_STYLES[p.aiStyle]) {
        const m = MTG.AI_STYLES[p.aiStyle];
        g.lg(`🎭 ${p.name} (${p.deckName}) plays with style: ${m.icon} ${m.label}`);
      }
    }
    return g;
  };
})();
