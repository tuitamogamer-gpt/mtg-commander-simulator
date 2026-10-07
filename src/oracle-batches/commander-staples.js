// Source fields verified by scripts/sync-commander-staples-source.mjs.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
MTG.registerOracleBatch({
  "schemaVersion": 1,
  "id": "manual-commander-staples",
  "sequence": "manual-001",
  "generatedAt": "2026-10-05T20:21:16.000Z",
  "source": {
    "provider": "Scryfall",
    "endpoint": "https://api.scryfall.com/bulk-data",
    "bulkType": "oracle_cards",
    "bulkId": "27bf3214-1271-490b-bdfe-c0be6c23d02e",
    "bulkUpdatedAt": "2026-08-30T09:01:56.964+00:00",
    "bulkDescription": "A JSON file containing one Scryfall card object for each Oracle ID on Scryfall. The chosen sets for the cards are an attempt to return the most up-to-date recognizable version of the card.",
    "bulkSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528",
    "pinnedSnapshot": {
      "bulkType": "oracle_cards",
      "bulkId": "27bf3214-1271-490b-bdfe-c0be6c23d02e",
      "bulkUpdatedAt": "2026-08-30T09:01:56.964+00:00",
      "bulkSha256": "a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528"
    },
    "verifiedAgainstPinnedSnapshot": true
  },
  "selectionPolicy": {
    "games": [
      "paper"
    ],
    "commanderLegality": "legal",
    "names": "Seven popular Commander staples that were absent from the runtime and listed in docs/catalog/remaining-cards.csv.",
    "semanticClasses": [
      "manual-deck-semantic"
    ],
    "note": "Every entry requires an explicit implementation in scripts-commander-staples.js and human/AI interaction tests in tests/commander-staples.test.mjs."
  },
  "cards": [
    {
      "position": 1,
      "oracleId": "153376c9-dffd-458c-8ce3-a4c8269bc4e9",
      "scryfallId": "861b5889-0183-4bee-afeb-a4b2aa700a8e",
      "semanticClass": "manual-deck-semantic",
      "implementedKeywords": [],
      "rulesCore": "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.",
      "raw": {
        "name": "Smothering Tithe",
        "cost": "{3}{W}",
        "super": [],
        "types": [
          "Enchantment"
        ],
        "subtypes": [],
        "oracle": "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")",
        "_ci": [
          "W"
        ],
        "_oracleId": "153376c9-dffd-458c-8ce3-a4c8269bc4e9",
        "_scryfallId": "861b5889-0183-4bee-afeb-a4b2aa700a8e",
        "_layout": "normal",
        "_set": "cmm",
        "_collectorNumber": "57",
        "_rarity": "mythic",
        "_produced": [
          "B",
          "G",
          "R",
          "U",
          "W"
        ]
      },
      "catalog": {
        "typeLine": "Enchantment",
        "colorIdentity": [
          "W"
        ],
        "colors": [
          "W"
        ],
        "keywords": [
          "Treasure"
        ],
        "commanderLegality": "legal",
        "set": "cmm",
        "setName": "Commander Masters",
        "collectorNumber": "57",
        "rarity": "mythic",
        "releasedAt": "2023-08-04",
        "scryfallUri": "https://scryfall.com/card/cmm/57/smothering-tithe?utm_source=api"
      }
    },
    {
      "position": 2,
      "oracleId": "5def9f38-0a0b-4e8d-9f9d-29dcb46520b4",
      "scryfallId": "f3537373-ef54-4578-9d05-6216420ee349",
      "semanticClass": "manual-deck-semantic",
      "implementedKeywords": [],
      "rulesCore": "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.",
      "raw": {
        "name": "Esper Sentinel",
        "cost": "{W}",
        "super": [],
        "types": [
          "Artifact",
          "Creature"
        ],
        "subtypes": [
          "Human",
          "Soldier"
        ],
        "oracle": "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.",
        "_ci": [
          "W"
        ],
        "_oracleId": "5def9f38-0a0b-4e8d-9f9d-29dcb46520b4",
        "_scryfallId": "f3537373-ef54-4578-9d05-6216420ee349",
        "_layout": "normal",
        "_set": "mh2",
        "_collectorNumber": "12",
        "_rarity": "rare",
        "power": "1",
        "toughness": "1"
      },
      "catalog": {
        "typeLine": "Artifact Creature — Human Soldier",
        "colorIdentity": [
          "W"
        ],
        "colors": [
          "W"
        ],
        "keywords": [],
        "commanderLegality": "legal",
        "set": "mh2",
        "setName": "Modern Horizons 2",
        "collectorNumber": "12",
        "rarity": "rare",
        "releasedAt": "2021-06-18",
        "scryfallUri": "https://scryfall.com/card/mh2/12/esper-sentinel?utm_source=api"
      }
    },
    {
      "position": 3,
      "oracleId": "ea5103f5-27e0-4eb1-902c-7f34652d6bf3",
      "scryfallId": "7c024bae-5631-4e20-ac69-df392ac9e109",
      "semanticClass": "manual-deck-semantic",
      "implementedKeywords": [],
      "rulesCore": "Flash\nWhen this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1.",
      "raw": {
        "name": "Orcish Bowmasters",
        "cost": "{1}{B}",
        "super": [],
        "types": [
          "Creature"
        ],
        "subtypes": [
          "Orc",
          "Archer"
        ],
        "oracle": "Flash\nWhen this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1.",
        "_ci": [
          "B"
        ],
        "_oracleId": "ea5103f5-27e0-4eb1-902c-7f34652d6bf3",
        "_scryfallId": "7c024bae-5631-4e20-ac69-df392ac9e109",
        "_layout": "normal",
        "_set": "ltr",
        "_collectorNumber": "103",
        "_rarity": "rare",
        "power": "1",
        "toughness": "1"
      },
      "catalog": {
        "typeLine": "Creature — Orc Archer",
        "colorIdentity": [
          "B"
        ],
        "colors": [
          "B"
        ],
        "keywords": [
          "Amass",
          "Flash"
        ],
        "commanderLegality": "legal",
        "set": "ltr",
        "setName": "The Lord of the Rings: Tales of Middle-earth",
        "collectorNumber": "103",
        "rarity": "rare",
        "releasedAt": "2023-06-23",
        "scryfallUri": "https://scryfall.com/card/ltr/103/orcish-bowmasters?utm_source=api"
      }
    },
    {
      "position": 4,
      "oracleId": "94a844d2-0574-45a7-b347-e0e329767c42",
      "scryfallId": "c89c6895-b0f8-444a-9c89-c6b4fd027b3e",
      "semanticClass": "manual-deck-semantic",
      "implementedKeywords": [],
      "rulesCore": "Skip your draw step.\nWhenever you discard a card, exile that card from your graveyard.\nPay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.",
      "raw": {
        "name": "Necropotence",
        "cost": "{B}{B}{B}",
        "super": [],
        "types": [
          "Enchantment"
        ],
        "subtypes": [],
        "oracle": "Skip your draw step.\nWhenever you discard a card, exile that card from your graveyard.\nPay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.",
        "_ci": [
          "B"
        ],
        "_oracleId": "94a844d2-0574-45a7-b347-e0e329767c42",
        "_scryfallId": "c89c6895-b0f8-444a-9c89-c6b4fd027b3e",
        "_layout": "normal",
        "_set": "ima",
        "_collectorNumber": "98",
        "_rarity": "mythic"
      },
      "catalog": {
        "typeLine": "Enchantment",
        "colorIdentity": [
          "B"
        ],
        "colors": [
          "B"
        ],
        "keywords": [],
        "commanderLegality": "legal",
        "set": "ima",
        "setName": "Iconic Masters",
        "collectorNumber": "98",
        "rarity": "mythic",
        "releasedAt": "2017-11-17",
        "scryfallUri": "https://scryfall.com/card/ima/98/necropotence?utm_source=api"
      }
    },
    {
      "position": 5,
      "oracleId": "27e0948b-9916-473b-8d8c-a51bdfbc7457",
      "scryfallId": "0e51d796-7279-4c06-87f0-37adbdaa41df",
      "semanticClass": "manual-deck-semantic",
      "implementedKeywords": [],
      "rulesCore": "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.\nAt the beginning of the end step, sacrifice this enchantment.",
      "raw": {
        "name": "Underworld Breach",
        "cost": "{1}{R}",
        "super": [],
        "types": [
          "Enchantment"
        ],
        "subtypes": [],
        "oracle": "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment.",
        "_ci": [
          "R"
        ],
        "_oracleId": "27e0948b-9916-473b-8d8c-a51bdfbc7457",
        "_scryfallId": "0e51d796-7279-4c06-87f0-37adbdaa41df",
        "_layout": "normal",
        "_set": "thb",
        "_collectorNumber": "161",
        "_rarity": "rare"
      },
      "catalog": {
        "typeLine": "Enchantment",
        "colorIdentity": [
          "R"
        ],
        "colors": [
          "R"
        ],
        "keywords": [],
        "commanderLegality": "legal",
        "set": "thb",
        "setName": "Theros Beyond Death",
        "collectorNumber": "161",
        "rarity": "rare",
        "releasedAt": "2020-01-24",
        "scryfallUri": "https://scryfall.com/card/thb/161/underworld-breach?utm_source=api"
      }
    },
    {
      "position": 6,
      "oracleId": "74d3277a-38e5-4732-afed-084a56148f20",
      "scryfallId": "3c429c40-2389-41e5-8681-4bb274e25eba",
      "semanticClass": "manual-deck-semantic",
      "implementedKeywords": [],
      "rulesCore": "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.",
      "raw": {
        "name": "Mana Drain",
        "cost": "{U}{U}",
        "super": [],
        "types": [
          "Instant"
        ],
        "subtypes": [],
        "oracle": "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.",
        "_ci": [
          "U"
        ],
        "_oracleId": "74d3277a-38e5-4732-afed-084a56148f20",
        "_scryfallId": "3c429c40-2389-41e5-8681-4bb274e25eba",
        "_layout": "normal",
        "_set": "2x2",
        "_collectorNumber": "57",
        "_rarity": "mythic",
        "_produced": [
          "C"
        ]
      },
      "catalog": {
        "typeLine": "Instant",
        "colorIdentity": [
          "U"
        ],
        "colors": [
          "U"
        ],
        "keywords": [],
        "commanderLegality": "legal",
        "set": "2x2",
        "setName": "Double Masters 2022",
        "collectorNumber": "57",
        "rarity": "mythic",
        "releasedAt": "2022-07-08",
        "scryfallUri": "https://scryfall.com/card/2x2/57/mana-drain?utm_source=api"
      }
    },
    {
      "position": 7,
      "oracleId": "e87906d2-db1a-4e19-b910-adb4eb339945",
      "scryfallId": "7b7a348a-51f7-4dc5-8fe7-1c70fea5e050",
      "semanticClass": "manual-deck-semantic",
      "implementedKeywords": [],
      "rulesCore": "When Urza enters, create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"\nTap an untapped artifact you control: Add {U}.\n{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost.",
      "raw": {
        "name": "Urza, Lord High Artificer",
        "cost": "{2}{U}{U}",
        "super": [
          "Legendary"
        ],
        "types": [
          "Creature"
        ],
        "subtypes": [
          "Human",
          "Artificer"
        ],
        "oracle": "When Urza enters, create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"\nTap an untapped artifact you control: Add {U}.\n{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost.",
        "_ci": [
          "U"
        ],
        "_oracleId": "e87906d2-db1a-4e19-b910-adb4eb339945",
        "_scryfallId": "7b7a348a-51f7-4dc5-8fe7-1c70fea5e050",
        "_layout": "normal",
        "_set": "cmm",
        "_collectorNumber": "130",
        "_rarity": "mythic",
        "power": "1",
        "toughness": "4",
        "_produced": [
          "U"
        ]
      },
      "catalog": {
        "typeLine": "Legendary Creature — Human Artificer",
        "colorIdentity": [
          "U"
        ],
        "colors": [
          "U"
        ],
        "keywords": [],
        "commanderLegality": "legal",
        "set": "cmm",
        "setName": "Commander Masters",
        "collectorNumber": "130",
        "rarity": "mythic",
        "releasedAt": "2023-08-04",
        "scryfallUri": "https://scryfall.com/card/cmm/130/urza-lord-high-artificer?utm_source=api"
      }
    }
  ]
});
