# Provjera sposobnosti: Manifest, Delve i ostale podržane mehanike

Zahtjev: provjeriti sposobnosti u igri, posebno Manifest 2/2 bez dostupnog okretanja. Provjera se odnosi na implementirani katalog i pravila enginea. Nije tvrdnja da je provjerena svaka moguća kombinacija svih Magic karata.

## Potvrđeni problemi i popravke

- **Manifest interfejs:** osnovna plaćena akcija enginea radila je, ali bez mane dugme je nestajalo bez objašnjenja. Na ekranu 1280×720 slika i tekst mogli su odsjeći kontrole. Vlastita face-down karta sada pokazuje istaknuto `Turn face up`, trošak ili razlog nedostupnosti. Raspored čuva dugmad u ekranu, a duži tekst se zasebno pomjera.
- **Delve i X:** groblje se nije računalo u maksimalni X, a izbor za egzil gledao je samo fiksni generički dio cijene. `Logic Knot` sada koristi pet karata iz groblja i {U}{U} za X=5; `Empty the Pits` koristi šest i {B}{B}{B}{B} za X=3, stvara tri tapovana Zombie tokena.
- **Delve plaćanje:** minimalni potreban broj karata proizlazi iz stvarno dostupne mane. Tasigur sa četiri landa i dvije karte u groblju koristi obje i plaća preostale četiri mane. Duplikati, tuđe karte, prevelik izbor i otkazivanje ne troše resurse. Provjera identiteta dijeli se sa Escape plaćanjem.
- **Delve uz druge troškove:** koristi konačni generički trošak, uključujući X, dodatne troškove i dozvoljenu alternativnu cijenu. Ne može zamijeniti obojeni simbol, platiti okretanje Manifesta ili povećati X aktivirane sposobnosti.
- **AI i skriveni identitet:** izbor troši najmanje potrebnih, slabije vrijednih karata. Neizabrana face-up alternativa i privatni Manifest Dread izbor više ne otkrivaju originalna imena kroz javni AI dnevnik.

Manifest mana-cost akcija može okrenuti samo creature kartu s plativim mana costom. Morph i Disguise mogu ponuditi vlastiti trošak. Akcija ne koristi Stack niti ponavlja ulazak na battlefield. Delve je način plaćanja konačnog generičkog troška spella. Referenca: [Wizards Comprehensive Rules, 701.40 i 702.66](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt).

## Ponovljiva provjera

`npm run test:mechanics` je jedinstven ulaz u kompletni postojeći suite, uključujući novi `tests/manifest-delve-audit.test.mjs`, sve Oracle izvršne matrice, combat, mana, priority, zone, countere i lokalni AI. Alias namjerno pokreće cijeli suite da sposobnosti ne izgube provjeru svojih zajedničkih zavisnosti.

| Provjera | Rezultat |
| --- | --- |
| Novi Manifest/Delve regresijski scenariji | 28/28 PASS |
| Završni Morph/Disguise/Manifest/Delve paket | 73/73 PASS |
| AI i privatnost, zajedno s novim regresijama | 59/59 PASS |
| Ciljani Oracle paket: Sibsig Muckdraggers, Cabal Surgeon, Salvage Titan | 14/14 PASS |
| Cijela Oracle matrica, 17.600 generičkih karata × dva kontrolora | 35.200/35.200 izvršavanja, 10.328/10.328 keyword putanja, 48.666/48.666 operacionih putanja; 83.200 ugniježđenih provjera |
| Browser: human Manifest, noncreature, AI Manifest, human/AI Delve | 5/5 PASS, bez runtime/request grešaka |
| Dostupnost face-up i Close dugmeta | 1280×720, 390×844, 820×900, 1440×1000 PASS |
| Skill Playwright client | Stalwart Pathlighter uspješno okrenut u 3/1, screenshot i stanje pregledani |
| Sintaksa i stroga certifikacija | PASS; 19.284/19.284 definicije |
| Završni kompletni suite | **6.966/6.966 PASS**, bez padova, preskočenih ili otkazanih testova |

Generic-effect testni kontrolor čuva staged graveyard karte kada potpuno finansiran spell ponudi opcionalni Delve. Poseban `mechanic-delve` dokaz i očekivanje povratka u ruku ostaju sačuvani. Morph/Disguise AI test potvrđuje odabranu akciju i stvarno okretanje bez zahtjeva da javni dnevnik prethodno otkrije skrivenu kartu.

Browser runner: `tests/browser/manifest-delve.mjs`. Koristi `PLAYWRIGHT_MODULE` za postojeću Playwright instalaciju; `WEB_GAME_CLIENT` opcionalno uključuje skill runner. Sve stranice se služe lokalno uz testni account handler. Početne table su kontrolisane; dalje idu stvarni klikovi, controller odluke, plaćanje, Stack i rezolucija.

Dokazi: `output/ability-audit-2026-09-05/`, posebno `full-suite-verified.log`, `targeted-final-2.log`, `privacy-final.log`, `bulk-focused-final.log`, `certify.log` i `browser/results.json`. Screenshotovi prije i poslije te tekstualno stanje su u istom direktorijumu.

Provjereni snapshot: HEAD `1376abe55069ec33e9759d3a45ae6eab295851d9` plus lokalni diff. SHA-256 zapisi 289 source/test fajlova u `verified-snapshot.json` potvrđuju da se izvor nije promijenio tokom završnog suitea. Broj testova obuhvata i paralelno završenu Orcish Mine regresiju, koja nije izmjena ovog zahtjeva.

Pri završetku ovog zasebnog audita izmjene su bile lokalne. Paralelni Oracle import i Orcish Mine popravka nisu pripisani ovom auditu. Naknadna zajednička provjera svih izmjena i kataloga od 19.484 definicije dokumentovana je u [završnom auditu i importu 1.000 karata](mechanics-import-1000-2026-09-05.md); gornji brojevi ostaju rezultat istorijskog snapshota.
