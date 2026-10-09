// Exact whole-source closure; every non-base clause is implemented by the v82 runtime.
const SOURCES={
  "Maddening Imp": {
    "oracle": "Flying\n{T}: Non-Wall creatures the active player controls attack this turn if able. At the beginning of the next end step, destroy each of those creatures that didn't attack this turn. Activate only during an opponent's turn and only before combat.",
    "cost": "{2}{B}",
    "type": "Creature — Imp",
    "layout": "normal"
  },
  "Magma Pummeler": {
    "oracle": "This creature enters with X +1/+1 counters on it.\nIf damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1 counters from it. When one or more counters are removed from this creature this way, it deals that much damage to any target.",
    "cost": "{X}{R}{R}",
    "type": "Creature — Elemental",
    "layout": "normal"
  },
  "Magnanimous Magistrate": {
    "oracle": "This creature enters with five reprieve counters on it.\nWhenever another nontoken creature you control dies, if its mana value was 1 or greater, you may remove that many reprieve counters from this creature. If you do, return that card to the battlefield under its owner's control.",
    "cost": "{5}{W}",
    "type": "Creature — Human Advisor",
    "layout": "normal"
  },
  "Meandering Towershell": {
    "oracle": "Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nWhenever this creature attacks, exile it. Return it to the battlefield under your control tapped and attacking at the beginning of the declare attackers step on your next turn.",
    "cost": "{3}{G}{G}",
    "type": "Creature — Turtle",
    "layout": "normal"
  },
  "Menacing Ogre": {
    "oracle": "Trample, haste\nWhen this creature enters, each player secretly chooses a number. Then those numbers are revealed. Each player with the highest number loses that much life. If you are one of those players, put two +1/+1 counters on this creature.",
    "cost": "{3}{R}{R}",
    "type": "Creature — Ogre",
    "layout": "normal"
  },
  "Mercenaries": {
    "oracle": "{3}: The next time this creature would deal damage to you this turn, prevent that damage. Any player may activate this ability.",
    "cost": "{3}{W}",
    "type": "Creature — Human Mercenary",
    "layout": "normal"
  },
  "Mirror-Shield Hoplite": {
    "oracle": "Vigilance\nWhenever a creature you control becomes the target of a backup ability, copy that ability. You may choose new targets for the copy. This ability triggers only once each turn.",
    "cost": "{R}{W}",
    "type": "Creature — Human Soldier",
    "layout": "normal"
  },
  "Mossbridge Troll": {
    "oracle": "If this creature would be destroyed, regenerate it.\nTap any number of untapped creatures you control other than this creature with total power 10 or greater: This creature gets +20/+20 until end of turn.",
    "cost": "{5}{G}{G}",
    "type": "Creature — Troll",
    "layout": "normal"
  },
  "Obsidian Charmaw": {
    "oracle": "This spell costs {1} less to cast for each land your opponents control that could produce {C}.\nFlying\nWhen this creature enters, destroy target nonbasic land an opponent controls.",
    "cost": "{3}{R}{R}",
    "type": "Creature — Dragon",
    "layout": "normal"
  },
  "Ochre Jelly": {
    "oracle": "Trample\nThis creature enters with X +1/+1 counters on it.\nSplit — When this creature dies, if it had two or more +1/+1 counters on it, create a token that's a copy of it at the beginning of the next end step. The token enters with half that many +1/+1 counters on it, rounded down.",
    "cost": "{X}{G}",
    "type": "Creature — Ooze",
    "layout": "normal"
  },
  "Oracle of Dust": {
    "oracle": "Devoid (This card has no color.)\n{2}, Put a card an opponent owns from exile into that player's graveyard: Draw a card, then discard a card.",
    "cost": "{4}{U}",
    "type": "Creature — Eldrazi Processor",
    "layout": "normal"
  },
  "Perplexing Chimera": {
    "oracle": "Whenever an opponent casts a spell, you may exchange control of this creature and that spell. If you do, you may choose new targets for the spell. (If the spell becomes a permanent, you control that permanent.)",
    "cost": "{4}{U}",
    "type": "Enchantment Creature — Chimera",
    "layout": "normal"
  },
  "Persistent Marshstalker": {
    "oracle": "This creature gets +1/+0 for each other Rat you control.\nThreshold — Whenever you attack with one or more Rats, if there are seven or more cards in your graveyard, you may pay {2}{B}. If you do, return this card from your graveyard to the battlefield tapped and attacking.",
    "cost": "{1}{B}",
    "type": "Creature — Rat Berserker",
    "layout": "normal"
  },
  "Portal Manipulator": {
    "oracle": "Flash\nWhen this creature enters during the declare attackers step, choose target player and any number of target attacking creatures their opponents control. Those creatures are now attacking that player.",
    "cost": "{2}{W/U}{W/U}",
    "type": "Creature — Human Wizard",
    "layout": "normal"
  },
  "Proud Wildbonder": {
    "oracle": "Trample\nCreatures you control with trample have \"You may have this creature assign its combat damage as though it weren't blocked.\"",
    "cost": "{2}{R/G}{R/G}",
    "type": "Creature — Human Warrior",
    "layout": "normal"
  },
  "Pulmonic Sliver": {
    "oracle": "All Sliver creatures have flying.\nAll Slivers have \"If this permanent would be put into a graveyard, you may put it on top of its owner's library instead.\"",
    "cost": "{3}{W}{W}",
    "type": "Creature — Sliver",
    "layout": "normal"
  },
  "Robber of the Rich": {
    "oracle": "Reach, haste\nWhenever this creature attacks, if defending player has more cards in hand than you, exile the top card of their library. During any turn you attacked with a Rogue, you may cast that card and you may spend mana as though it were mana of any color to cast that spell.",
    "cost": "{1}{R}",
    "type": "Creature — Human Archer Rogue",
    "layout": "normal"
  },
  "Rohirrim Chargers": {
    "oracle": "You may exert this creature as it attacks. (It won't untap during your next untap step.)\nWhenever you exert a creature, reveal cards from the top of your library until you reveal an Equipment card. Put that card onto the battlefield attached to that creature, then put the rest on the bottom of your library in a random order.",
    "cost": "{2}{R}{W}",
    "type": "Creature — Human Knight",
    "layout": "normal"
  },
  "Ruthless Technomancer": {
    "oracle": "When this creature enters, you may sacrifice another creature you control. If you do, create a number of Treasure tokens equal to that creature's power.\n{2}{B}, Sacrifice X artifacts: Return target creature card with power X or less from your graveyard to the battlefield. X can't be 0.",
    "cost": "{3}{B}",
    "type": "Creature — Human Wizard",
    "layout": "normal"
  },
  "Rysorian Badger": {
    "oracle": "Whenever this creature attacks and isn't blocked, you may exile up to two target creature cards from defending player's graveyard. If you do, you gain 1 life for each card exiled this way and this creature assigns no combat damage this turn.",
    "cost": "{2}{G}",
    "type": "Creature — Badger",
    "layout": "normal"
  },
  "Savior of Ollenbock": {
    "oracle": "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhenever this creature trains, exile up to one other target creature from the battlefield or creature card from a graveyard.\nWhen this creature leaves the battlefield, put the exiled cards onto the battlefield under their owners' control.",
    "cost": "{1}{W}{W}",
    "type": "Creature — Human Soldier",
    "layout": "normal"
  },
  "Simic Manipulator": {
    "oracle": "Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\n{T}, Remove one or more +1/+1 counters from this creature: Gain control of target creature with power less than or equal to the number of +1/+1 counters removed this way.",
    "cost": "{1}{U}{U}",
    "type": "Creature — Mutant Wizard",
    "layout": "normal"
  },
  "Spinerock Tyrant": {
    "oracle": "Flying\nWither (This deals damage to creatures in the form of -1/-1 counters.)\nWhenever you cast an instant or sorcery spell with a single target, you may copy it. If you do, those spells gain wither. You may choose new targets for the copy.",
    "cost": "{3}{R}{R}",
    "type": "Creature — Dragon",
    "layout": "normal"
  },
  "Stromgald Spy": {
    "oracle": "Whenever this creature attacks and isn't blocked, you may have defending player play with their hand revealed for as long as this creature remains on the battlefield. If you do, this creature assigns no combat damage this turn.",
    "cost": "{3}{B}",
    "type": "Creature — Human Rogue",
    "layout": "normal"
  },
  "Suppressor Skyguard": {
    "oracle": "Flying\nWhenever a player attacks you, if that player has another opponent who isn't being attacked, prevent all combat damage that would be dealt to you this combat.",
    "cost": "{2}{W}{U}",
    "type": "Creature — Human Knight",
    "layout": "normal"
  },
  "Templar Knight": {
    "oracle": "Vigilance\n{W}, Tap five untapped attacking creatures you control named Templar Knight: Search your library for a legendary artifact card, put it onto the battlefield, then shuffle.\nA deck can have any number of cards named Templar Knight.",
    "cost": "{1}{W}",
    "type": "Creature — Human Knight",
    "layout": "normal"
  },
  "Tranquil Frillback": {
    "oracle": "When this creature enters, you may pay {G} up to three times. When you pay this cost one or more times, choose up to that many —\n• Destroy target artifact or enchantment.\n• Exile target player's graveyard.\n• You gain 4 life.",
    "cost": "{2}{G}",
    "type": "Creature — Dinosaur",
    "layout": "normal"
  },
  "Vengeful Pharaoh": {
    "oracle": "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nWhenever combat damage is dealt to you or a planeswalker you control, if this card is in your graveyard, destroy target attacking creature, then put this card on top of your library.",
    "cost": "{2}{B}{B}{B}",
    "type": "Creature — Zombie",
    "layout": "normal"
  },
  "Vizkopa Confessor": {
    "oracle": "Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nWhen this creature enters, pay any amount of life. Target opponent reveals that many cards from their hand. You choose one of them and exile it.",
    "cost": "{3}{W}{B}",
    "type": "Creature — Human Cleric",
    "layout": "normal"
  },
  "Volatile Stormdrake": {
    "oracle": "Flying, hexproof from activated and triggered abilities\nWhen this creature enters, exchange control of this creature and target creature an opponent controls. If you do, you get {E}{E}{E}{E}, then sacrifice that creature unless you pay an amount of {E} equal to its mana value.",
    "cost": "{1}{U}",
    "type": "Creature — Drake",
    "layout": "normal"
  },
  "Whispering Specter": {
    "oracle": "Flying\nInfect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nWhenever this creature deals combat damage to a player, you may sacrifice it. If you do, that player discards a card for each poison counter they have.",
    "cost": "{1}{B}{B}",
    "type": "Creature — Phyrexian Specter",
    "layout": "normal"
  },
  "Ziatora's Envoy": {
    "oracle": "Trample\nWhenever this creature deals combat damage to a player, look at the top card of your library. You may play a land from the top of your library or cast a spell with mana value less than or equal to the damage dealt from the top of your library without paying its mana cost. If you don't, put that card into your hand.\nBlitz {2}{B}{R}{G}",
    "cost": "{1}{B}{R}{G}",
    "type": "Creature — Lizard Warrior",
    "layout": "normal"
  },
  "Sphinx Ambassador": {
    "oracle": "Flying\nWhenever this creature deals combat damage to a player, search that player's library for a card, then that player chooses a card name. If you searched for a creature card that doesn't have that name, you may put it onto the battlefield under your control. Then that player shuffles.",
    "cost": "{5}{U}{U}",
    "type": "Creature — Sphinx",
    "layout": "normal"
  }
};
const BASES={
  "Maddening Imp": "Flying",
  "Magma Pummeler": "This creature enters with X +1/+1 counters on it.",
  "Magnanimous Magistrate": "This creature enters with five reprieve counters on it.",
  "Meandering Towershell": "Islandwalk",
  "Menacing Ogre": "Trample, haste",
  "Mirror-Shield Hoplite": "Vigilance",
  "Obsidian Charmaw": "Flying\nWhen this creature enters, destroy target nonbasic land an opponent controls.",
  "Ochre Jelly": "Trample\nThis creature enters with X +1/+1 counters on it.",
  "Oracle of Dust": "Devoid",
  "Persistent Marshstalker": "This creature gets +1/+0 for each other Rat you control.",
  "Portal Manipulator": "Flash",
  "Proud Wildbonder": "Trample",
  "Pulmonic Sliver": "All Sliver creatures have flying.",
  "Robber of the Rich": "Reach, haste",
  "Rohirrim Chargers": "You may exert this creature as it attacks. (It won't untap during your next untap step.)",
  "Savior of Ollenbock": "Training",
  "Simic Manipulator": "Evolve",
  "Spinerock Tyrant": "Flying\nWither",
  "Suppressor Skyguard": "Flying",
  "Templar Knight": "Vigilance\nA deck can have any number of cards named Templar Knight.",
  "Vengeful Pharaoh": "Deathtouch",
  "Vizkopa Confessor": "Extort",
  "Volatile Stormdrake": "Flying",
  "Whispering Specter": "Flying\nInfect",
  "Sphinx Ambassador": "Flying",
  "Ziatora's Envoy": "Trample\nBlitz {2}{B}{R}{G}"
};
export function normalizeCard(card,original=card){const source=SOURCES[original.name];return source&&original.oracle_text===source.oracle&&original.mana_cost===source.cost&&original.type_line===source.type&&original.layout===source.layout?{...card,completeSourceV82:true}:card;}
export function compileWholeCard(card,h){if(!card.completeSourceV82||!SOURCES[card.name])return null;const base=BASES[card.name]?h.compileCurrent({...card,completeSourceV82:false,oracle_text:BASES[card.name]}):{implementation:[],implementedKeywords:[],oracleContracts:[]};if(BASES[card.name]&&!base.semanticClass)throw Error('v82 base '+card.name+': '+base.reason);const operation={kind:'creature-complete-v82',mode:card.name,contract:'generic-continuous-effect'};return {semanticClass:'creature-template',implementation:[...base.implementation,operation],implementedKeywords:base.implementedKeywords||[],oracleContracts:[...new Set([...(base.oracleContracts||[]),operation.contract])],rulesCore:h.stripReminderText(card.oracle_text)};}
