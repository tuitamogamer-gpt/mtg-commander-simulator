# Brothers’ War / Phyrexia / March of the Machine / Secret Lair — ten original precons

Implemented on 9 September 2026 from baseline `db5d98b`. The batch preserves all **1,000 original cards**, reuses **503** of **642** distinct card identities and adds **139 native definitions**. The runtime now contains **110 selectable decks**, **20,777 definitions** and **20,759 importable definitions**. Commit, push and production deployment are authorized; observed release evidence is recorded separately under `output/precon-brc-onc-moc-sld-2026-09-09/`.

## Imported decks

| Deck | Default commander | Cards |
| --- | --- | ---: |
| Mishra's Burnished Banner | Mishra, Eminent One | 100 |
| Urza's Iron Alliance | Urza, Chief Artificer | 100 |
| Rebellion Rising | Neyali, Suns' Vanguard | 100 |
| Corrupting Influence | Ixhel, Scion of Atraxa | 100 |
| Tinker Time | Gimbal, Gremlin Prodigy | 100 |
| Growing Threat | Brimaz, Blight of Oreskos | 100 |
| Divine Convocation | Kasla, the Broken Halo | 100 |
| Cavalry Charge | Sidar Jabari of Zhalfir | 100 |
| Call for Backup | Bright-Palm, Soul Awakener | 100 |
| From Cute to Brute | Esika, God of the Tree | 100 |

## Sources and preservation

The pinned [Moxfield queue](../precon-starter-2026-09-06/moxfield-index.tsv) determines order. These are independently matched **Wizards and MTGJSON lists**, not direct Moxfield exports. Original quantities and cards are retained regardless of banlist status.

- [The Brothers’ War official decklists](https://magic.wizards.com/en/news/announcements/brothers-war-commander-decklists-2022-10-28)
- [Phyrexia: All Will Be One official decklists](https://magic.wizards.com/en/news/announcements/phyrexia-all-will-be-one-commander-decklists)
- [March of the Machine official decklists](https://magic.wizards.com/en/news/announcements/march-of-the-machine-commander-decklists)
- [From Cute to Brute official list](https://magic.wizards.com/en/news/announcements/commander-returns-to-secret-lair-with-from-cute-to-brute)

[decklists.json](decklists.json) and ten text exports retain exact lists; [oracle.json](oracle.json) pins full Oracle text and physical faces. [intake.json](intake.json) preserves the initial 139-new/503-reused split even after idempotent importer reruns find no missing cards. [source-validation.json](source-validation.json) records per-list URLs, hashes, retained source wording differences, prior-record preservation and byte-idempotence.

All 2,780 previous raw definitions, 101 raw deck records, 4,358 image mappings and 101 commander crops remain unchanged as data. Previously tracked artwork and videos are unchanged. Existing combined definitions are reused for modal and Adventure aliases, including Esika / The Prismatic Bridge. Source wording and combined-face differences are recorded explicitly rather than rewriting previous records.

## Rules, art and play support

New modules implement the missing creatures, spells, artifacts, lands and 33 physical double-faced cards. Shared hooks cover paid convoke/backup/incubate interactions, poison and proliferate, offering, linked exile and graveyard casting, day/night, additional beginning phases, ward, restricted mana, attachments, cast card copies and persistent token definitions. Costs and target choices use the normal Stack and controller interfaces.

Each deck has a guide, opening-hand advice, legal signature cards and an AI profile. **365 new WebP files** include printed faces, ten commander crops and linked token artwork. [images.json](images.json) contains provenance and file hashes. No videos were generated.

## Verification

The final isolated regression passes **270/270**; selector and mechanic UI checks pass **40/40**; mixed Live passes **7/7**. Two natural games finish and rematch, and all ten final AI games finish without fallback. The diagnostic full suite completed **9,292 tests with 16 failures**, all corrected and reconciled in focused final evidence; the full suite was not rerun on the final tree.

Final measured results and full-run reconciliation are in [qa.json](qa.json). Release inputs are recorded in [tested-inputs.json](tested-inputs.json). Native execution smoke is a broad runtime check, not a claim that every possible interaction is exhaustively verified. Semantic tests exercise actual costs, choices and resolution; browser tests distinguish natural full games from controlled boards.

Reproduction commands:

```sh
node scripts/verify-brc-onc-moc-sld-import.mjs
node --test --test-concurrency=4 tests/bom-*.test.mjs
node scripts/smoke-brc-onc-moc-sld-precons.mjs
node scripts/smoke-brc-onc-moc-sld-games.mjs
npm run check
npm run audit
npm run certify:strict
```

Playwright scripts are under `tests/browser/brc-onc-moc-sld-{precons,abilities,gameplay,live}.mjs`; provide `PLAYWRIGHT_MODULE` when Playwright is installed outside this repository. `BOM_RESUME=1` resumes completed mechanic scenarios in a local interrupted browser run. Screenshots and logs stay under the ignored `output/` evidence directory.
