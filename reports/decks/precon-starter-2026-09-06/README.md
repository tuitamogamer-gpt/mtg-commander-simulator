# Prvih pet Moxfield precona — 6. septembar 2026.

Pet Starter Commander deckova iz 2022. dodano je u standardni izbor za igrača i lokalni AI. Izbor raste sa 27 na 32 decka. Svaka lista ima originalnih 100 karata, uključujući commandera. Novi video materijal nije pravljen.

| Deck i Moxfield izvor | Commander | Različite karte | Postojeće definicije | Nove definicije |
|---|---|---:|---:|---:|
| [First Flight](https://moxfield.com/decks/4aWzNrYbU0utRRc4VP2y_g) | Isperia, Supreme Judge | 72 | 63 | 9 |
| [Grave Danger](https://moxfield.com/decks/C69lZxaCm0mccIVMd6ZAMg) | Gisa and Geralf | 71 | 58 | 13 |
| [Chaos Incarnate](https://moxfield.com/decks/y48MuxOOF0-B5kxdP7zNsw) | Kardur, Doomscourge | 73 | 56 | 17 |
| [Draconic Destruction](https://moxfield.com/decks/vKenUyAq5Eaneqf1Dazp1w) | Atarka, World Render | 72 | 60 | 12 |
| [Token Triumph](https://moxfield.com/decks/s-gC4gfPC0eVReuXm2Eo7w) | Emmara, Soul of the Accord | 73 | 63 | 10 |

Među svih 500 fizičkih karata ima 337 različitih naziva: 276 je već postojalo u runtime katalogu, a dodana je samo 61 nova definicija. Postojeće karte koje se pojavljuju u više deckova računaju se jednom u ukupnom broju. Katalog raste sa 19.484 na 19.545 definicija.

## Izvori i ponovljiv import

- [Zvanični Moxfield Commander Precons indeks](https://moxfield.com/decks/public?q=eyJmb3JtYXQiOiJjb21tYW5kZXJQcmVjb25zIn0%3D) prikazao je svih **193/193** rezultata. Svih 193 jedinstvena linka vlasnika `WizardsOfTheCoast` sačuvana su u [moxfield-index.tsv](moxfield-index.tsv). URL za red je `https://moxfield.com/decks/` + `moxfield_id`. `display_title` čuva naslov tačno kako ga je lista prikazala, uključujući skraćivanje sa `...`. Indeks uključuje Collector i Anthology izdanja te se broj 193 ne predstavlja kao broj različitih lista karata. Samo pet iz ove serije je novo uvezeno.
- Pet `.txt` datoteka u ovom direktoriju preuzeto je kroz Moxfield Download → Export Options. [intake.json](intake.json) čuva njihove SHA-256 vrijednosti, source URL-ove i stanje kataloga prije importa.
- Izbor serije i deck liste potvrđuje [Wizards: Starter Commander Decks Decklists](https://magic.wizards.com/en/news/announcements/starter-commander-decks-decklists-2022-10-20).
- [oracle.json](oracle.json) čuva Scryfall collection odgovor za svih 337 naziva, Oracle/Scryfall identifikatore, tekst i karakteristike. Pronađeno je 337/337 karata. Poređenje runtime Oracle teksta daje 335 podudaranja nakon normalizacije i dvije ekvivalentne samoreference: Soul Snare i Steel Hellkite imaju stariji zapis vlastitog imena umjesto novijeg „this enchantment/creature“. Njihova pravila nisu promijenjena.
- `node scripts/import-starter-precons.mjs --write` provjerava 100 karata, commandera, duplikate i izvor. Ponovno pokretanje dodaje nula definicija i nula deckova. Ako se postojeća lista razlikuje, import se prekida.

Svih 1.626 ranijih osnovnih card objekata i svih 28 ranijih sirovih deck lista očuvano je. Postojeći Oracle batch podaci nisu mijenjani. Ranije izuzeti Blame Game ostaje izvan standardnog izbora.

## Implementacija

Svih 61 novih definicija ima eksplicitnu izvršnu skriptu u `scripts-starter-precons.js` i `scripts-starter-precons-advanced.js`. Pomoćna pravila za njihove interakcije nalaze se u `starter-precon-rules.js`.

Pokrivene su dozvole za cast iz graveyarda vezane za konkretan objekat, Sephara/Scourge alternativni troškovi, Havengul Lich pozajmljene aktivacije, izbori i X modovi, loyalty sposobnosti, Gideon zahtjevi za napad, dodatna cijena ciljanja Jubilant Skybonder, Wild Ricochet preusmjeravanje i kopija te Savage Ventmaw mana do kraja poteza. Zajedničke fight putanje sada šalju događaj za svako biće koje se bori, uz simultanu štetu, kako bi Foe-Razer Regent radio i uz ranije podržane fight karte. Postojeći fight, damage, Tree i Zurgo scenariji uključeni su u regresiju.

Svih pet deckova ima metadata, vodič, AI profil i originalni Scryfall commander art. Svih 337 karata ove serije ima lokalnu sliku. Postojeći video izbor ostaje očuvan; novih pet deckova koristi art bez novog uvodnog videa.

## Izvršene provjere

| Provjera | Rezultat i dokaz |
|---|---|
| Nove karte i dozvole | 38 testova pokriva izvršene i provjerene scenarije za svih 61 novih naziva; plaćeni cast/Stack/resolve, aktivacije, izbori, LKI i source identity, uključujući human/AI alternativne cast putanje |
| Planeswalkeri i X | Zajedno sa novim kartama 56/56 PASS; svih 12 aktivnih planeswalkera/35 sposobnosti i 69 aktivnih X spellova; negativne timing provjere za sva četiri nova planeswalkera |
| Postojeće fight/damage interakcije | 155/155 PASS u povezanom regresijskom krugu |
| Cijeli deckovi | 32/32 determinističke četveroigračke partije imaju pobjednika prije limita i bez preostalih triggera |
| Standardni browser tok | 10/10 PASS: svih pet deckova na 1440 px i 390 px kroz Deck → Pod → Review → opening hand, pa kontrolisani plaćeni commander kroz stvarne UI/Stack komande; bez horizontalnog overflowa, AI fallbacka i page/console grešaka |
| Cijela human UI partija | Grave Danger protiv Draconic Destruction na 390×844: 132 interakcije, šest landova, devet spellova, dva napada, mete i blokiranje; kraj na potezu 16 i uspješan rematch; bez page/console/request grešaka |
| Integracija postojećeg kataloga | 48/48 AI/baseline/commander visuals/card audit; 19/19 image/opponent choice/deck spotlight; stari pinovani legacy katalog prolazi provjeru integriteta |
| Završni puni paket | **7.215/7.215 PASS**, bez pada, otkazivanja ili preskakanja; 1.068,76 sekundi; svih 907 provjerenih source/test/config datoteka ostalo neizmijenjeno tokom cijelog izvršavanja |
| Završna certifikacija | **19.545/19.545** definicija, **1.808/1.808** aktivnih jedinstvenih karata i **2.708/2.708** karta/deck provjera PASS; syntax i audit PASS; nula duplih registracija i simplified karata |
| Završni vizuelni pregled | Ponovljeni browser krug **10/10 PASS** nakon dopune vodiča; pregledani desktop Dragon spotlight, mobilni First Flight spotlight i Emmara na battlefield-u; standardni skill client potvrđuje početni Solo vodič i 32 decka bez page/console grešaka |

Samostalni deck krug završio je nove deckove na potezima 54 (First Flight), 35 (Grave Danger), 66 (Chaos Incarnate), 45 (Draconic Destruction) i 39 (Token Triumph). Browser provjera svih pet koristi stvarni izbor i početnu podjelu, a zatim kontrolisanu tablu za ponovljiv plaćeni commander scenario. Cijela human partija zasebno je odigrana normalnim UI tokom.

Konačni zbirni rezultat i izvorni hash-evi su u [qa.json](qa.json). Dokazi su u `output/precon-starter-2026-09-06/`: `full-tests-final.log`, `final-source-parity.json`, `final-pw-x-starter.log`, `fight-regressions.log`, `deck-smoke-final.log`, `browser/result.json`, `full-human-game/result.json`, `certify-final.log` i screenshotovi uz browser rezultate. Testovi se mogu ponoviti pomoću `tests/starter-precons.test.mjs`, `tests/browser/starter-precons.mjs` i `tests/headless-smoke.test.mjs`. Browser testu se po potrebi prosljeđuje putanja do instaliranog Playwright modula kroz `PLAYWRIGHT_MODULE`; test cijele human partije prihvata `PLAYER_HUMAN_DECK` i `PLAYER_AI_DECK`.

Poslije punog paketa ispravljene su samo dvije rečenice koje certifikacijski generator piše u Markdown: Oracle batch karte sada se zaista ponovo koriste u ugrađenim preconima. Logika provjere nije mijenjana; syntax i stroga certifikacija ponovljeni su nakon te tekstualne izmjene. Postojeći CSV izvoz kompletnog kataloga zadržava jasno označen snapshot od 5. septembra; ovaj izvještaj dokumentuje noviju seriju.

Ovaj izvještaj i `qa.json` bilježe završenu lokalnu provjeru prije objave. Korisnik je zatim izričito odobrio „Push commit deploy, pa nastavi narednih 5“. Dokazi objave ove serije vode se u `output/release-starter-2026-09-06/`. Sljedeća serija kreće od sačuvanog Moxfield indeksa uz novo poređenje listi sa trenutnim runtime katalogom.
