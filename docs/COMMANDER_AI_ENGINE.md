# Commander AI Engine V2

Commander AI Engine V2 je klasični, potpuno lokalni game-AI sloj. Ne koristi API, autentifikaciju, mrežni poziv, LLM, neuronski/ONNX/WebGPU model, embedding niti trening. Postojeće card skripte i `Game` metode ostaju jedini autoritet za legalnost i izvršavanje pravila.

## Arhitektura

Tok jedne odluke je:

1. `createBotPlayerView(game, playerId, actionWindow)` pravi zamrznut javni pogled.
2. `generateLegalActions(view)` pretvara legalni action window rules enginea u jedinstvenu listu kandidata.
3. `inferCardSemantics(def)` i `DECK_AI_PROFILES` daju role/synergy kontekst.
4. `assessPlayerThreat` i `evaluateState` izračunavaju utility za svakog igrača.
5. Jeftini `quickScore` rangira sve legalne kandidate.
6. Najbolji kandidati u interaktivnoj igri prolaze kroz utility-vector beam search.
7. `simulateAction` izvršava cast/activation/land na izolovanoj kopiji preko istog `Game.performAction` rules puta.
8. Seedovani tie-break bira samo među približno jednakim scoreovima.
9. Strukturirani decision log bilježi izbor, alternative, breakdown, prijetnje, node/depth podatke i fallback.

Centralni javni ulaz je:

```js
await MTG.chooseBotAction({
  gameState,
  botPlayerId,
  difficulty: 'easy' | 'normal' | 'hard',
  seed,
  actionWindow, // interni rules-engine prozor; opcionalan za main/priority
});
```

Rezultat sadrži `action`, `score`, `reason`, `consideredActions` i detaljni `log`.

## Rules layer i legalne akcije

AI ne računa sam da li se spell može baciti ili sposobnost platiti. Koristi:

- `Game.castableList` za spellove, komandere, alternative/additional costove i timing;
- `Game.activatableList` za sposobnosti, mana/utility izvore, crew, equip, cycling, graveyard i face-up akcije;
- `Game.playableLands` za land drop;
- `Game.legalTargets` za target/protection/hexproof/shroud/ward kandidate;
- `Game.canBlock` za blokere;
- `Game.canAttackTarget` / `Game.legalAttackTargets` za igrače i planeswalkere;
- postojeći priority/stack/trigger/action handler tok za izvršavanje.

Generator pokriva action windowe koje engine trenutno emituje: main, priority, attackers, blockers, targets, cards, modal/multi izbor, X, mana sources, mulligan/bottom, scry i trigger ordering. Mana solver ostaje rules odgovornost i uklanja dominirane payment kombinacije prije AI-ja. Targeti, combat planovi i X vrijednosti koriste ograničeni beam/threshold pruning.

## Zaštita skrivenih informacija

`BotPlayerView` daje botu:

- vlastitu ruku;
- javni battlefield, graveyard, exile i command zone;
- stack, life, poison, commander damage, hand/library count, otvorenu manu;
- javni log, fazu, aktivnog igrača i priority holdera;
- javni deck ID/profil fiksnog precona.

Ne daje protivničku ruku, sadržaj/redoslijed biblioteke, nepoznati top, face-down identitet ili skrivene izbore. Interna veza prema live pravilima je u privatnom `WeakMap` adapteru i ne postoji na javnom objektu. Interakcija iz nepoznate ruke procjenjuje se samo iz javnog hand counta, boja/open mana i javne gustoće interactiona u precon profilu.

Simulacija ne dopušta protivniku da reaguje na osnovu stvarnog skrivenog sadržaja ruke. Takav rizik ulazi kao vjerovatnoća, ne kao stvarna informacija. Testovi mijenjaju nepoznatu kartu i redoslijed protivničke biblioteke te potvrđuju isti hash/izbor.

## Card roleovi i synergy

Role i synergy tagovi se primarno izvode iz strukturiranih tipova, oracle teksta i postojećih `def` polja. Rezultat se cacheira po definiciji. `MTG.AI_CARD_ROLE_OVERRIDES` je jedino centralno mjesto za neuobičajene karte poput sacrifice/combo enginea koje tekstualna klasifikacija ne može dovoljno precizno rangirati.

Nova override dopuna izgleda ovako:

```js
'Ime karte': {
  addRoles: ['engine', 'combo-piece'],
  addTags: ['sacrifice'],
  removeRoles: [],
}
```

Ne dodavati AI odluke u card skriptu.

## Profili 20 precona

`buildDeckAIProfiles` prolazi stvarne aktivne deckliste. Svaki profil ima archetype, preferiranu dužinu igre, svih deset evaluator težina, glavne synergy tagove, engine, finisher i protected-piece liste te commander importance. Dvadeset eksplicitnih archetype/synergy hintova dopunjuje mjerljive podatke iz stvarnih 100 karata; nema praznog placeholder profila.

Za novi fiksni precon:

1. dodati deck i `DECK_META` kao i do sada;
2. dodati jedan `DECK_PROFILE_HINTS` zapis (archetype, length, tags, commanderImportance);
3. pokrenuti `npm run test:ai` i `npm run certify:strict`;
4. provjeriti izvedene engine/finisher liste u `MTG.DECK_AI_PROFILES[deckId]`.

## Evaluator i multiplayer Max-N

`evaluateState` vraća survival/life/commander safety, board/card/mana/interaction vrijednost, commander/synergy/combo/graveyard/recovery progres, immediate win/loss i threat/vulnerability mapu.

Vrijednost permanenta uključuje statove, engine/card-advantage/mana/kombo/sacrifice role, commander i deck synergy, countere, evasion, protection, tapped i summoning-sick stanje. Terminalna pobjeda/poraz ima score reda `+/-1,000,000`.

Svaki kandidat proizvodi utility vector za sve igrače iz istog javnog observer viewa. Bot maksimizira svoj element; nijedan score ne koristi `isAI`, "human" bonus ili zajednički bots-vs-human rezultat. Kingmaking penalty se aktivira kad eliminacija ostavi drugog protivnika daleko iznad actorove utility vrijednosti.

## Threat, removal, counter i wipe

Threat uključuje lethal/commander damage, board/evasion, engine/combo role, hand count, open mana/boje, interaction density, momentum i recovery. Zato 2/2 sacrifice/death engine može biti važniji removal target od običnog 9/9.

Removal se čuva bez dovoljno dobre mete. Counterspell se kažnjava bez protivničkog relevantnog stack objekta. Board wipe poredi vrijednost svih tabli, survival rizik i recovery; ne baca se samo zato što je legalan.

## Combat

Attacker i blocker planovi koriste poseban inkrementalni beam. Napad ocjenjuje damage, commander lethal, block/trade rizik, threat mete i crackback. Blok procjenjuje lethal prevention, trade, engine preservation, commander damage, deathtouch i menace legalnost. Jedan plan može napasti više različitih branitelja ili planeswalkera.

Live combat i dalje prolazi puni engine combat resolver. AI snapshot projektuje samo neposrednu deklaraciju/tap/block vrijednost; složene nepoznate combat trikove tretira kao javni interaction rizik. Ovo je namjerna granica trenutne implementacije.

## Simulacija, beam i performanse

Snapshot clone čuva prototipe i funkcije card skripti, ali kopira svako mutabilno stanje. Definicije/deck podaci su dijeljeni kao immutable podaci. Simulirani tokeni koriste negativne lokalne IID-jeve, pa analiza ne pomjera live allocator. Prije i poslije svake simulacije provjerava se puni live fingerprint.

Konfiguracija je:

```txt
easy   beam 4  depth 1  max 200 nodes
normal beam 10 depth 3  max 2500 nodes
hard   beam 18 depth 4  max 10000 nodes
```

Interaktivna (`paced`) igra koristi duboku pretragu. Veliki headless stability gate koristi isti public view, evaluator i quick ranking bez rekurzivnog snapshotovanja, da kompletnih 20 partija ostane praktičan test. `forceSearch: true` uključuje puni beam u testu/benchmarku.

## Difficulty i kontrolisana nasumičnost

Difficulty mijenja beam width/depth/node budget, target/combat limit i tie toleranciju. Easy smije izabrati drugi približno dobar potez. Normal je default. Hard koristi najdublju pretragu.

V2 ne koristi `Math.random`. `mulberry32(seed)` se poziva samo kada je više scoreova unutar difficulty tie tolerancije. Isti state/bot/difficulty/seed daje isti rezultat. Stvarni random efekti igre i početni game seed ostaju dio rules enginea.

## Decision log i debug

`game.aiDecisionLog` čuva zadnjih 160 odluka. Standardni UI Log panel prikazuje posljednjih pet, sa scoreom, dvije alternative, nodes/depth i fallback statusom. `render_game_to_text` izlaže posljednje tri bez skrivene informacije.

## Testovi i benchmark

```bash
npm run check
npm run test:ai
npm test
npm run benchmark:ai
npm run audit
npm run certify:strict
```

`tests/ai-v2.test.mjs` pokriva profile, legalnost, hidden-information invariance, reveal, threat/removal, wipe, FFA human/bot neutralnost, combat, commander lethal, blokere, determinizam, rules-engine simulaciju, sequencing i decision log. `tests/headless-smoke.test.mjs` izvršava po jednu determinističku četveroigračku partiju za svih 20 deckova.

## Poznata realna ograničenja

- Puna combat damage rezolucija nije rekurzivno klonirana u beam; deklaracija je rules-validirana, a detaljni damage/trigger tok izvršava live combat engine.
- Hidden-hand model je profilna vjerovatnoća, ne Monte Carlo determinization cijelog precona.
- Search ne pokušava dokazivati beskonačne kombo petlje; node/depth/priority guardovi uvijek daju legalan fallback.
- Card-role inference je namjerno konzervativan. Neuobičajene engine/kombo karte trebaju centralni override i ciljani test.
- Max-N je aproksimacija utility-vector pretrage u trenutnom action windowu, ne iscrpna simulacija cijelog preostalog kruga od četiri igrača.

## Late-game survival

All styles and difficulties share a public-board survival score for combat. Attack plans account for the remaining untapped blockers, vigilance survivors, flying/reach and other engine block restrictions, and each surviving opponent's next turn before our next untap. Currently tapped opposing creatures normally become threats again on that turn. Eliminating one player is useful progress; only eliminating the last remaining opponents receives the terminal win bonus.

Block plans score the combined outcome rather than adding isolated block bonuses. The bounded forecast covers first/double strike, trample, deathtouch, lifelink, indestructible, shield/regeneration, and life/commander-damage/poison defeat. An emergency greedy plan considers menace pairs together and lets any persona sacrifice an engine to avoid visible lethal damage. Cheap reserve estimates prune partial attack declarations; the more expensive combat forecast runs on the final candidates. Concentrated finish attempts remain available even when their partial declarations expose the bot.

Poison forecasts distinguish infect damage from life loss and add toxic only for each positive player-damage event. New infect/wither counters reduce subsequent combat-step power or toughness-based damage; existing counters are already reflected in live stats and are not applied twice in AI clones. Public poison and visible infect/toxic changes participate in the evaluation cache key. `tests/oracle-poison-survival-integration.test.mjs` exercises these combinations through actual card casts, local AI choices, simulation clones, and engine combat on all three difficulties.

This is a tactical estimate, not a replacement rules engine or an exhaustive solution of the game. It cannot predict hidden tricks, future draws, arbitrary death/attack triggers, or every replacement effect. Live combat still resolves those through the existing engine. No external AI, network request, or opponent hidden-hand access is added. Large mandatory card selections also prune impossible subsets so long games with large cleanup discards remain responsive.

Regression coverage: `tests/ai-lategame-survival.test.mjs` runs all ten styles at all three difficulties, actual combat damage through the engine, third-player/cumulative crackback, commander lethal, evasive blockers, forced attacks, concentrated wins, deterministic/immutable decisions, and large cleanup selections.
