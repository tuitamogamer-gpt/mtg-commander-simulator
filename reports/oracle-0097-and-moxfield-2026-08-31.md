# Oracle 0097–0126 i Moxfield provjera — 2026-08-31

Dodano je **3.000 novih karata**, u 30 kompletnih batchova od 100, od oracle-0097 do oracle-0126. Lokalni katalog sada sadrži **14.284 definicije**: 12.600 generičkih Oracle karata, 58 ručno implementiranih Sauron karata i 1.626 ranijih definicija. Prva nova karta je A Realm Reborn, posljednja Zuran Orb.

**Implementacija i lokalne izvršne provjere su završene. Završna provjera proširenog kataloga u internom browseru ostala je blokirana URL sigurnosnim pravilom.** Nije korišten alternativni browser, sirovi browser protokol niti mrežni zaobilazni put. Nije izvršen commit, push ili deploy.

Naknadno je korisnik odobrio **commit, push i produkcijski deploy svih izmjena**. Ovaj dokument i prateći JSON čuvaju stanje završenog QA prije objave; njihove tadašnje `release: false` vrijednosti nisu trenutni status produkcije. Objava koristi postojeću granu `feature/oracle-card-catalog`, postojeći Vercel projekat i javni link. Browser ograničenje ostaje navedeno i nakon odobrenja objave.

## Završni rezultati

| Provjera | Rezultat |
|---|---:|
| Puni npm test | 2061/2061, bez grešaka, preskakanja ili otkazivanja |
| V7 namjenski rubni slučajevi | 467/467 |
| Nove karte, ljudski i stvarni lokalni AI kontroler | 6000/6000 |
| Nove karte, keyword provjere | 1608 |
| Nove karte, operacijske putanje / dodatne provjere | 8622 / 13023 |
| Cijeli generički katalog, ljudski i lokalni AI | 25200/25200 |
| Cijeli generički katalog, keyword provjere | 7754 |
| Cijeli katalog, operacijske putanje / dodatne provjere | 32476 / 43879 |
| Stroga strukturna certifikacija | 14284/14284 definicije |
| Aktivni deckovi | 27; 1580/1580 jedinstvenih karata; 2347/2347 card/deck provjera |
| Provjera porijekla i pariteta batchova | 3000/3000 |
| Sintaksa i source audit | PASS |
| Tačan Moxfield deck i pilot/regresije | 100 karata bez zamjena; 20/20 testova |

Izvršni dokazi obuhvataju stvarne troškove, mete, Stack, zone, kontrolisane događaje i odluke lokalnog AI-ja. Strukturna certifikacija je odvojena od tih dokaza. Rezultati ne dokazuju svaku moguću višestranačku kombinaciju niti cijelu partiju odigranu u browseru.

## Izvor i način importa

Pinovan je Scryfall Oracle snapshot **2026-08-30T09:01:56.964+00:00**, 38.627 redova, SHA-256 a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528. V6 je imao samo 20 preostalih podržanih kandidata; zato je proširena zatvorena V7 gramatika i runtime. Neprepoznate klauzule ostaju odbijene.

Svih 30 planova prvo je provjereno prema prethodno izvršenom draftu od 3.000 karata, pa atomarno upisano po batchu. Provjera ponovo kompajlira svaki red iz pinovanog izvora, poredi cijeli runtime modul s izvještajem, provjerava registracije u app.js, import-state, Commander legalnost i duplikate imena/Oracle/Scryfall identiteta. Dodatni preflight izvještaj opisuje početno stanje i više nije konačni rezultat.

Nove porodice uključuju Adventure/Split/Fuse/Aftermath, kopiranje pri ulasku, Saga poglavlja, Backup, Replicate, Ravenous, Overload i Firebending; stvarne dodatne troškove i alternativna plaćanja; dinamičke countere i karakteristike; exile/graveyard dozvole; aktivirane i trigger sposobnosti; zaštitu, prevenciju štete i borbena ograničenja. Lokalni AI ostaje bez vanjskih modela, API poziva ili telemetrije.

Završna provjera je otkrila i ispravila mana putanju za Moonring Island: osnovni land podtip sada daje svoju manu čak i kada je navedena samo u reminder tekstu. Testovi provjeravaju enters-tapped, stvarno plaćanje plave mane i ugašenu sposobnost. Masterwork of Ingenuity ima stvarni copy/equip test; certifikator više ne zamjenjuje riječ Equipment za odštampanu Equip sposobnost. Ažurirana su strukturna očekivanja za 126 batchova, split/adventure/Saga mete i graveyard aktivacije.

Pravila su provjeravana prema [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260619.pdf) i službenim bilješkama za [Backup](https://magic.wizards.com/en/news/feature/march-of-the-machine-release-notes), [Replicate](https://magic.wizards.com/en/news/feature/ravnica-remastered-release-notes), [Overload](https://magic.wizards.com/en/news/feature/commander-masters-release-notes) i [Firebending](https://magic.wizards.com/en/news/feature/avatar-the-last-airbender-release-notes).

## Moxfield deck

Korišten je javni [Sauron, the dark lord (ready to play), Gustavo82](https://moxfield.com/decks/8Xcac_CNTUiWNEOG4B5UQw). Stvarna prikazana Moxfield stranica pročitana je ranije u ovom zadatku kroz Codex interni browser. Lista ima 100 karata, 79 jedinstvenih imena i 36 landova. Nema zamjena niti novog objavljivanja na korisnikovom Moxfield računu.

- [Lista spremna za import](decks/sauron-moxfield-2026-08-31.txt)
- [Izvorni browser zapis](decks/sauron-moxfield-2026-08-31.json)
- [Završna provjera s 14.284 definicije](decks/sauron-moxfield-final-2026-08-31.json)

Tačna lista na završnom katalogu daje 100/100 riješenih karata, 79/79 engine-certified imena i 19 interakcijskih ugovora. Dvije kontrolisane četveroigračke partije završavaju s pobjednikom prije limita: seed 829301 s ne-AI ljudskim kontrolerom i seed 829302 s deckom na stvarnom lokalnom AIController-u. Namjenski piloti takođe igraju land i plaćaju/razrješavaju Dreadhorde Invasion. Nema zabilježenog AI fallbacka ili preostalih pending triggera.

Raniji browser prolaz, prije završnog importa: tačan tekst je unesen, provjeren, sačuvan u guest Library, ponovo učitan i pokrenut kroz Play Solo. Čovjek je odigrao Island i platio Infiltration Lens; bot je odigrao Talisman of Curiosity. Na turnu 7 čovjek je odigrao Mountain i platio Callous Dismissal za {1}{U}, vratio Talisman i dobio 1/1 Zombie Army. Stack je očišćen i igra se vratila na ljudski main-phase prompt. Pregledani stabilni screenshot nije imao neispravne slike ili horizontalno prelijevanje, a browser log nije imao upozorenja/greške. Tadašnja generička slika Army tokena je historijsko opažanje, ne nova tvrdnja o završnoj verziji.

Kasniji reload pokazao je nedostupni optional commander-video helper. Pozivi sada dozvoljavaju odsustvo helpera i zadržavaju prikaz karte. Sljedeća browser radnja je blokirana URL pravilom, pa ova prezentacijska zaštita i završni katalog nisu ponovo provjereni u browseru. Raniji prolaz je djelimična partija, ne kompletan browser meč.

## Dokazi

[Mašinski izvještaj](oracle-0097-0126-verification.json) sadrži tačne brojeve, SHA-256 test logova, izvora, batchova i ključnih implementacijskih fajlova. Pojedinačni batch izvještaji su u oracle-import/batch-0097.json do batch-0126.json. Puni lokalni logovi i raniji screenshotovi su u output/oracle-0097-0126/ (ignored). Prvi završni suite imao je dva zastarjela strukturna očekivanja; konačni PASS iznad dolazi iz ponovljenog kompletnog paketa nakon ispravki.
