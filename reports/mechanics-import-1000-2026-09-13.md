# Import narednih 1.000 karata — 13. septembar 2026.

Dodano je **1.000 novih Commander-legal papirnih karata** u deset kompletnih serija **oracle-0179–oracle-0188**. Baza sada ima **22.541 definiciju**, sve dostupne za provjereni deck import: 18.800 generičkih Oracle karata, 58 ranijih ručnih Oracle zapisa i 3.683 native definicije. Ažurirani su početni ekran, README, certifikacija i [izvezeni katalog](../docs/card-catalog.md).

U poređenju sa istim sačuvanim Oracle izvorom, predstavljeno je **22.512 od 30.784** legalnih papirnih Oracle ID-jeva; preostalo je **8.272**. Razlika između broja definicija i Oracle ID-jeva objašnjena je u katalogu. Import ne mijenja 150 ugrađenih špilova.

## Serije i porijeklo

| Serija | Karata | Prva karta | Posljednja karta |
| --- | ---: | --- | --- |
| [oracle-0179](oracle-import/batch-0179.json) | 100 | Aarakocra Sneak | Smite the Deathless |
| [oracle-0180](oracle-import/batch-0180.json) | 100 | Aisling Leprechaun | Yarok's Wavecrasher |
| [oracle-0181](oracle-import/batch-0181.json) | 100 | Agate-Blade Assassin | Watchdog |
| [oracle-0182](oracle-import/batch-0182.json) | 100 | Amulet of Vigor | Zhang Liao, Hero of Hefei |
| [oracle-0183](oracle-import/batch-0183.json) | 100 | Air Nomad Student | Wrangler of the Damned |
| [oracle-0184](oracle-import/batch-0184.json) | 100 | Acquisition Octopus | Zombie Ogre |
| [oracle-0185](oracle-import/batch-0185.json) | 100 | Achilles Davenport | Wurmwall Sweeper |
| [oracle-0186](oracle-import/batch-0186.json) | 100 | Alms | Zarda, the Power Princess |
| [oracle-0187](oracle-import/batch-0187.json) | 100 | Abstergo Entertainment | Tribal Unity |
| [oracle-0188](oracle-import/batch-0188.json) | 100 | Abduction | Zombie Scavengers |

Izvor je sačuvani Scryfall `oracle_cards` snimak od **2026-08-30T09:01:56.964+00:00**, bulk ID `27bf3214-1271-490b-bdfe-c0be6c23d02e`. SHA-256 kompresovanog izvora:

```text
a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528
```

Provjera porijekla prolazi za svih 1.000 zapisa: jedinstveni Oracle ID, Scryfall ID i ime, legalnost i paper filter, puna Oracle pravila, ponovljena kompilacija, identične runtime/manifest datoteke, kompletan state i uredne app registracije. Ranije serije 0001–0178 zadržane su bez izmjena.

## Pravila i izvršne putanje

Novi compiler **v9** prvo zadržava kompletan uspješan rezultat compilera v8. Dodatna gramatika uključuje se samo tokom nove kompilacije; nepoznata ili nepotpuna klauzula i dalje odbija kartu. Podržane kombinacije sada obuhvataju:

- Initiative, venture, discover i dodatne posmatrane događaje, sa stvarnim izborima i triggerima.
- Amplify, Champion, Devour, Recover, Mayhem, Reconfigure, Freerunning, Station, Increment, Leyline i Daybound/Nightbound.
- Preciznije mete, brojanja i uslove; različite kontrolore i vlasnike; odvojene grupe meta; posljednje poznate karakteristike i identitet karte kroz promjene zona.
- Dodatne Aure, ograničenja enchant meta, animaciju artefakata i landova, Umbra armor i izuzetak koji dozvoljava Wards Aurama da ostanu pričvršćene.
- Blight, Modified, dodijeljene keyword sposobnosti, zaštitu igrača, zabrane bacanja, life gain i damage prevention, te postavljanje životnih poena kroz stvarne gain/lose događaje.
- Efekte koji traju dok izvor ostaje na stolu, pod kontrolom ili tapovan, uz pravilno isticanje nakon promjene inkarnacije.

**1.000/1.000 karata prolazi produkcijsku izvršnu provjeru za čovjeka i lokalni AI:** 2.000 card-role putanja, 474 keyword putanje, 3.170 putanja operacija i 7.174 ugniježđene provjere. Invarijante stanja provjerene su u **3.913** testnih partija. Dodatni foundation paket ima **181/181 PASS**, uključujući odbijanje nepoznatih klauzula i kontrolne scenarije za nepravilne mete, promjenu kontrolora, nestanak izvora, istek efekta i stvarno plaćanje.

## Validacija

Puni paket planiran je za svih **420 testnih datoteka**: 419 kroz `node --test --test-concurrency=4`, uz zaseban `headless-smoke.test.mjs`. Headless runner sada podržava `HEADLESS_SHARD_COUNT=2` i `HEADLESS_SHARD_INDEX=0` odnosno `1`, tako da dva izolovana procesa zadržavaju originalne indekse, protivnike, seedove i sve provjere završetka. Bez tih varijabli ponašanje ostaje jedan puni prolaz.

**Puni suite nije prošao do kraja. Testovi su zaustavljeni na izričit korisnikov zahtjev „Stop tests and push commit deploy”.** Nisu ponovo pokrenuti nakon tog zahtjeva.

Prije prekida glavni log je prijavio 18 padova. Ponovljeni paketi od **14/14** i **168/168** prolaze nakon ispravki za 17 tih prijavljenih stavki: dopunjeni browser VM stubovi, odvojeno ime sintetičke Red Ward karte, precizirana provjera historic creature/Saga presjeka, v8/v9 granica brojčanog Reinforce troška, očuvane zabrane counter troškova i zaseban WeakMap za događaje u AI klonu. **Pad zbirne izvršne provjere svih 18.800 generičkih Oracle karata ostao je nerazjašnjen.** Raniji prolaz svih 1.000 novih karata ne zamjenjuje taj širi test.

Nakon ispravke AI kloniranja ponovljen je headless prolaz u dva procesa. Do korisnikovog prekida završeno je **14/150** partija, bez prijavljenog pada u tih 14. Raniji prekinuti prolazi ne računaju se kao puni PASS. Ne postoji završni ukupan broj prolaznih testova jer glavni proces nije završio.

| Provjera | Rezultat |
| --- | --- |
| `npm.cmd run check` | PASS prije završnih ciljnih ispravki; poslije naloga za prekid nije ponavljan |
| `npm.cmd run audit` | PASS; 150 špilova, bez duplih registracija i simplified oznaka |
| `npm.cmd run certify:strict` | PASS; 22.541/22.541 definicija, 12.603/12.603 card/deck provjera |
| `npm.cmd audit --omit=dev --audit-level=high` | PASS; 0 ranjivosti |
| Pinovani izvor, serije 179–188 | PASS; 1.000/1.000 zapisa |
| Export kataloga | Regenerisan nakon završne dopune compilera; raniji `--check` je prolazio, a nakon naloga za prekid nije ponavljan |
| `git diff --check` | PASS |

Browser import prolazi svih **16 provjera**: stvarno lijepljenje liste od 100 karata iz novog skupa, čuvanje u My Library, reload i ponovna validacija, Pod/Review, mulligan, plaćen spell iz novog skupa i stvarni hard-AI spell preko Stacka. Nema console/page grešaka ni AI fallbacka. Desktop player-experience i mobilni table runner takođe prolaze; mobilni runner provjerava različite veličine ruke i širine od 320 do 1440 px. Pregledani su screenshotovi stvarne partije i mobilnog Table prikaza. Lokalni Live runner prolazi svih **6 provjera** sa dva izolovana browsera: uvezeni guest špil, WebSocket lobby, privatni Arena prikazi, stvarni guest potez i povratak na isto mjesto poslije reloada.

Navedene gameplay i browser provjere izvršene su lokalno. Browser runneri koriste privremeni lokalni server i svjež guest profil; izvršeni su prije završne ispravke WeakMap-a u AI klonu. Nakon naloga za prekid korisnik je izričito zatražio commit, push i produkcijski deploy na postojeći MTG projekat. Lokalni zapis `.local/oracle-v9-release-evidence.json` bilježi rezultat objave i provjeru produkcijske revizije/HTTP odgovora; lokalni gameplay testovi sami po sebi ne potvrđuju javni server.

## Dokazi i ponavljanje

- `.local/oracle-v9-production-final.json` i `.log`: svih 1.000 produkcijskih karata i obje uloge.
- `.local/oracle-v9-foundation-final.log`: 181 namjenska regresija, uključujući Bayekovu animiranu Sagu.
- `.local/oracle-v9-provenance-final.json`: cijeli cohort, deduplikacija, izvor i hash-evi.
- `.local/oracle-v9-catalog-final.log`: konačno generisanje kataloga nakon dopune compilera.
- `.local/oracle-v9-browser-import/report.json`: prirodni import i plaćeni spellovi; screenshotovi u istom direktoriju.
- `.local/oracle-v9-browser-mobile/report.json` i `output/web-game/player-experience/`: desktop/mobilne provjere i screenshotovi.
- `.local/oracle-v9-browser-live/`: lokalna dva Live klijenta, stvarni potez i reconnect.
- `.local/oracle-v9-full-final.log`: prekinuti glavni paket; sadrži nerazjašnjen pad ukupne Oracle matrice.
- `.local/oracle-v9-browser-stubs-fixed.log` i `.local/oracle-v9-secondary-fixed.log`: uspješni ciljni ponovljeni paketi.
- `.local/oracle-v9-headless-final-shard-0.log` i `-1.log`: 14 završenih partija na ispravljenom runtimeu prije prekida.
- `.local/oracle-v9-user-stop-tests.json` i `.local/oracle-v9-final-validation.json`: korisnikov nalog za prekid, zaustavljeni procesi i tačan nepotpuni status.

Lokalni logovi i sačuvani izvor ostaju izvan repozitorija. Manifesti serija, regresije i izvezeni katalog čuvaju ponovljivu specifikaciju. Ove provjere potvrđuju izvršene scenarije; ne predstavljaju dokaz svake moguće kombinacije Magic karata.
