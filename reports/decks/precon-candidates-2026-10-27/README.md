# Moxfield precon review — 27 October 2026

The twelve latest displayed entries in the supplied [Moxfield Commander Precons listing](https://moxfield.com/decks/public?q=eyJmb3JtYXQiOiJjb21tYW5kZXJQcmVjb25zIn0%3D) represent ten distinct lists. Seven already match built-in decks exactly after verified name normalization. **Odds and Ends** is the one complete, supported missing deck and has been imported. The two Star Trek decks remain blocked. No existing deck or card definition was replaced.

| Candidate | Source count, including commander | Baseline status and decision |
| --- | ---: | --- |
| [Odds and Ends](https://moxfield.com/decks/21PMEusrfEmeqhQVYP59dA) | 100 | Missing; imported with Yennett, Cryptic Sovereign. All 91 distinct identities pass runtime certification and interaction checks. |
| [We Are The Borg](https://moxfield.com/decks/ALne8k6SV06cVQolK5RMTw) | 100 | Missing; 37 card definitions unavailable. Do not import yet. |
| [Federation Fleet](https://moxfield.com/decks/RT6Ka5EM9kqDUnH0I52oYw) | 72 on Moxfield; 100 from Wizards | Missing; 34 definitions unavailable in the complete official list. Moxfield omits 28 cards; 25 of those also lack Scryfall Oracle records in this retrieval. Do not import yet. |
| Multiverse Reforged | 100 | Already imported; exact list match. |
| Tramplesaurus Rex | 100 | Already imported; exact list match. |
| Keen Engineering | 100 | Already imported; exact list match. |
| Wretched Ranks | 100 | Already imported; exact list match. |
| Calling All Angels | 100 | Already imported; exact list match. |
| Reign of Dragons | 100 | Already imported; exact list match. |
| Hatsune Miku | 100 | Already imported; exact list match. |

The Moxfield account is labeled **Wizards of the Coast (by Moxfield)**. Independent publisher lists were retrieved from Wizards. This review covers these twelve displayed candidates, not an exhaustive audit of all 204 search results.

## Edition and date checks

- The [Borg Collector's Edition](https://moxfield.com/decks/ItfTSnvJ9UCFeACUNsSibQ) has exactly the same card names and quantities as the ordinary Borg list. The [Federation Collector's Edition](https://moxfield.com/decks/uMuxITyLQU-DPoeX14Av3A) matches the same incomplete 72-card ordinary list. These are printing treatments, not four distinct decks.
- The [Wizards Star Trek article](https://magic.wizards.com/en/news/announcements/star-trek-commander-decklists) publishes complete 100-card lists for both decks and states **13 November 2026** as their release date. The Borg list matches Moxfield exactly. The 28 Federation omissions are recorded individually in [intake.json](intake.json).
- The [Wizards Odds and Ends article](https://magic.wizards.com/en/news/announcements/secret-lair-commander-deck-odds-and-ends-decklist) and [MTGJSON list](https://mtgjson.com/api/v5/decks/OddsAndEnds_SLD.json) confirm **28 September 2026**. Moxfield's title says “Odd and Ends”; the imported name follows the publisher, **Odds and Ends**.
- MTGJSON records **2 October 2026** for Multiverse Reforged and the five Foundations Commander decks, and **10 August 2026** for Hatsune Miku. Recent Moxfield edits were not treated as release dates or new deck identities.

## Star Trek support needed

Both complete official lists need **70 distinct missing card definitions** in total: 37 Borg cards and 34 Federation cards, with Seven of Nine shared between them. Of these, 25 currently lack verified Scryfall text; 22 match existing compiler patterns; 23 require explicit semantics beyond the present parser. A parser match does not register or certify a card, so none was silently added or substituted.

| Area | Concrete support work |
| --- | --- |
| Assimilate | The Borg Queen, Gift of Perfection, Assimilate the Wounded and Assimilation Assessor need zone-specific selection/control changes, a +1/+1 counter, artifact/Borg type changes, and correct object lifetime. The Best of Both Worlds additionally links its final chapter to the creature assimilated by that Saga. |
| Spacecraft | Station tap costs and charge thresholds already have engine contracts. New cards still need their own tier abilities and tests, especially Transwarp Hub's noncreature tier, Borg Scout Sphere's granted flying, and Queen's Diamond's charge-scaled mana restricted to casting a commander. |
| Borg resource engines | Explicit cases include Optimization Annex's counter replacement, Hugh's granted replicate on artifact spells, Võx's separate next-spell discounts, Seven of Nine's conditional reflexive target, and Conquest Mission's threshold token counts. |
| Combat and modal effects | Korok counts the opponents attacked that turn; Extraction Integrant grants a blocking trigger; Collective Override changes mode permission when a commander is controlled; Join the Collective counts the nonartifact creatures actually destroyed. |
| Federation | Picard combines historic-entry draw with second-card counters. Beverly Crusher and Dr. Pulaski have second-card triggers; Ambassador K'Ehleyr reveals each player's top card before drawing and counts the nonlands. These need executable definitions and targeted proofs. The 25 unavailable texts prevent a complete mechanics review of the remaining preview cards. |

[star-trek-mechanics.json](star-trek-mechanics.json) gives the exact per-card parser decision, and [oracle.json](oracle.json) pins all 202 available Scryfall identities retrieved for the three missing lists plus the 25 `notFound` entries. The complete source lists are preserved; partial Moxfield decks were not accepted as playable decks.

## Odds and Ends import

The [100-card export](odds-and-ends.txt) matches Moxfield, Wizards and MTGJSON by identity and quantity. Runtime validation checks commander identity, singleton rules, color identity, supported definitions and interaction contracts. The fresh Oracle records independently confirm all 91 identities are Commander-legal. The validator's existing provenance warning for 46 legacy cards remains visible in the audit; those cards were not reclassified or assigned invented Oracle IDs.

The catalog grows from **175 to 176 decks**, retaining **32,136 runtime definitions**. All 175 earlier lists, all 3,934 native raw definitions and every existing image mapping are unchanged; see [preservation.json](preservation.json). The import adds a dedicated three-stage guide, AI profile, 23 missing card images and one commander art crop. Adventure face aliases share the correct card artwork. Repeating the importer checks for an existing equivalent list and does not create another copy.

Existing implementations cover Yennett's odd-mana attack casting, top-card ordering, Shared Fate's draw replacement and exile permissions, Psychic Battle's retargeting, Space Beleren's sectors, Exchange of Words, phasing, turn ending and other effects. Internal certification is an import gate; the focused tests and full-game checks provide additional, bounded evidence rather than proof of every multiplayer interaction.

The first full-game run exposed an AI loop: Soothsaying remained legally activatable with X=0 after all mana was spent, and the generic activation bonus repeatedly selected it. The AI now declines a library-ordering activation that cannot inspect any cards, values a useful small look, preserves spare mana and discounts repeated ordering during the same turn. The legal human X=0 action remains unchanged. Three regression tests cover the zero-mana exit, useful paid activation and repeat behavior, and the human choice. The same three pod seeds are rerun after this fix.

## Validation

- **148 tests pass** across the new import and AI regressions, baseline, existing AI, commander visuals, Foundations precons, inspected free casting and Psychic Battle target-clone isolation. The final restriction of the new heuristic to supported fixed/paid-X counts also passes all three focused AI tests.
- **Three four-player games finish with winners in 51, 39 and 32 turns**, including the formerly stalled seed 102701. They cover nine different opposing decks, with no decision fallback, fatal log entry or final state/recalculation invariant failure. See [headless.json](headless.json).
- **Desktop 1440px and mobile 390px browser checks pass**: selector, guide/card images, a complete opening hand/library/commander total, real UI commander payment and stack resolution, and no page overflow. Both screenshots were visually inspected; no browser error was recorded. See [browser.json](browser.json).
- Syntax and strict certification pass: **32,136/32,136 definitions**, **14,657/14,657 card/deck checks**. The repeat import preserves the exact data digest. Earlier source lists and images remain unchanged.

[qa.json](qa.json) records the verification scope and the initial findings corrected before release. This is a targeted regression run, not the repository's entire test suite.

## Reproduce

```sh
node scripts/review-precon-candidates.mjs
node scripts/review-star-trek-mechanics.mjs
node scripts/import-odds-and-ends.mjs --write
node scripts/sync-landing-counts.mjs
node scripts/sync-odds-images.mjs
node --test tests/odds-and-ends.test.mjs
node scripts/smoke-odds-and-ends.mjs
npm run check
npm run certify:strict
```

The scripts use the pinned [source snapshot](sources.json). They do not refresh or reinterpret the live Moxfield “last updated” field. Browser verification uses `tests/browser/odds-and-ends.mjs`; set `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` when Chromium is supplied by the environment, and `PRECON_BASE_URL` to check a deployment.
