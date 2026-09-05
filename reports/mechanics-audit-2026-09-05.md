# Audit pravila, igrača, lokalnog bota i arene — 5. septembar 2026.

Checkpoint za izričito zatraženi commit, push i deploy dosadašnjeg rada. Početni katalog: **18.484 definicije**, 27 ugrađenih deckova i 168 generičkih Oracle serija. Traženi nastavak importa: **1.000 novih karata**. Trenutno je uvezeno **400/1.000** karata, serije **0169–0172**, ukupno **18.884** definicije. Poslije ovog izdanja nastavlja se audit i preostalih 600 karata.

## Potvrđene ispravke

| Problem | Sadašnje ponašanje i provjera |
| --- | --- |
| Istovremene smrti i poništavanje countera | Cijeli SBA prolaz koristi isto prethodno stanje. Butcher Ghoul/Persist zadržavaju relevantne prethodne countere; Blood Artist i Dauthi Voidwalker vide sve članove istovremenog događaja. Provjereno stvarnim plaćenim Black Sun’s Zenith i Pyroclasm putanjama za čovjeka i lokalni AI. |
| Shield i ranije označena šteta | Shield zamjenjuje uništenje efektom, a ne lethal-damage SBA. Trošenje shielda na Murder ili Wrath of God više ne briše raniju štetu. Pyroclasm → shield → Disfigure, kao i zasebna regeneracija, imaju izvršne regresije za oba kontrolora. |
| Ulazak permanenta i plaćanje | Permanent koji još prolazi as-enters izbore nije dostupan za manu niti ulazi u pregled postojećeg battlefielda. AI procjena budućeg untapped landa privremeno razmatra buduće stanje i zatim vraća stvarno stanje. |
| Kopija nakon blinka | Nova inkarnacija odbacuje prethodne izračunate karakteristike. Clever Impersonator koji poslije blinka kopira Garruk Wildspeaker dobija odgovarajuće loyalty countere; provjeren je i povratak iz planeswalkera u stvorenje. |
| Skrivena lica karata | Vlasništvo nad face-down kartom u exileu samo po sebi ne otkriva identitet. Manifest/cloak identitet vidi trenutni kontrolor; javni 2/2 status ostaje vidljiv ostalim igračima. Plaćeni Extract Power i promjena kontrole imaju regresije. |
| Time Lord | Višerječni tip tretira se kao jedan tip. Time Lord Regeneration i Doctor’s companion ne prihvataju izmišljene zasebne tipove Time/Lord. Stari manifesti ostaju sačuvani, uz preciznu kompatibilnost u runtimeu. |
| Equipped uslovi | Bonusi provjeravaju stvarno zakačenu Equipment kartu, promjenu nosioca i kontrole. Zamriel i Dalakos imaju scenarije zakačivanja, odvajanja i promjene poteza. |
| Ponovljivo plaćanje | Prismite se može aktivirati više puta tokom jednog plaćanja. Stvarni cast Kalonian Tusker iz 4 bezbojne mane prolazi za igrača i bota; nepotpuna mana ne mijenja pool, tapovani Signet se ne koristi dvaput. |
| Faziranje attachmenta i cleanup | Direktno i indirektno faziranje razlikuju pripadnost grupi i povratak. Fazirana Aura/Equipment ne odlazi automatski u groblje kada nosilac nestane; faziranje se čuva kroz save/load i AI klon. Cleanup uklanja označenu štetu i s faziranih permanenata: plaćeni Giant Growth → Lightning Bolt → Clever Concealment prolazi cijeli potez i stvorenje preživljava povratak, za oba kontrolora. |
| Podijeljena šteta | Količine se biraju prije troškova i odgovora. Gubitak mete ne preraspodjeljuje njenu štetu; kopija zadržava podjelu uz nove mete. Provjereni su i split/Adventure castovi, Fire // Ice i Explosive Crystal; 550 povezanih provjera prolazi. |
| Pretraga i kontrolor meta | Obavezna pretraga za nekvalifikovanu kartu ne dopušta proizvoljan neuspjeh. Zajednički kvalifikator kontrolora važi za obje grane unije, npr. creature or planeswalker you don't control; devet postojećih karata provjereno za oba kontrolora. |
| Varijabilna i ograničena mana | Količina može koristiti trenutnu snagu ili snimak plaćenog žrtvovanja. Podjele boja i zabrane trošenja prolaze stvarno plaćanje; loyalty i ciljane sposobnosti ostaju na Stacku. |

| Clash | Obje biblioteke otkrivaju vrh istovremeno; slijede APNAP odluke, pa zajedničko premještanje. Prazna biblioteka i izjednačenje ne daju pobjedu. Lash Out pamti kontrolora umrle mete, Weed Strangle posljednju žilavost; kopija Research the Deep ne vraća originalni spell sa Stacka. Plaćeni Marvo napad uključuje clash, draw i besplatni cast. |
| Faze borbe i ograničenja castovanja | Prazna borba čuva odgovarajuće priority prozore bez lažnog događaja „napadaš“. Endless Foot Assault ne stvara Ninju kada nema napadača. Ograničenja broja spellova i vremena castovanja provjeravaju se kroz stvarne poteze, besplatne spellove i kopije. |
| Borbene sposobnosti | Annihilator, provoke i melee imaju izvršne putanje za čovjeka i bota. Broj napadnutih igrača zadržava istoriju deklaracije i nakon ispadanja igrača; Doran/High Alert koriste ispravnu karakteristiku za damage i odluku bota. |
| Aktivacija i counteri | Zabrane aktivacije, troškovi skidanja countera i uslovi upotrebe koriste istu provjeru pri prikazu i izvršenju. Fazirani izvor se odbija i kada je izbor već bio otvoren, prije trošenja mane ili countera. |
| Mana i karakteristike | Izbor boje, aditivni basic-land tipovi i promjene tipa/boje poštuju trajanje, kontrolora i priloge. Intrinsic mana iz land tipova, oduzimanje sposobnosti i uslovni efekti imaju plaćene regresije. |

Pravila su provjerena prema [zvaničnom pravilniku](https://magic.wizards.com/en/rules). Posebno je potvrđena aktuelna izmjena CR 605.1a: sposobnosti čiji trošak ili efekt pomjera kartu u/iz biblioteke koriste Stack. Postojeće ponašanje Chromatic Sphere i Millikin odgovara toj izmjeni. [Wizards, The Hobbit Update Bulletin](https://magic.wizards.com/en/news/announcements/the-hobbit-update-bulletin).

## Arena i frontend

- 11 pozadina: šest mana paleta i pet scena, uključujući Moonlit Grove, Molten Forge i Astral Sanctum.
- Izbor se otvara iz menija arene; promjena i podešavanje zatamnjenja primjenjuju se odmah.
- Preferencije se pamte kroz reload i novu partiju. Blokiran browser storage ostavlja funkcionalan izbor za trenutnu sesiju.
- Tastatura, Escape, povratak fokusa i već otvorena odluka ostaju funkcionalni.
- Provjerene širine: 320, 390, 820, 1440 i 1900 px; uključeno stvarno igranje landa poslije promjene pozadine.
- Izabrana boja novih chosen-color permanenata prikazuje se među trajnim izborima igrača.
- Clash prikazuje oba vlasnika, obje mana vrijednosti i rezultat; mobilni izbor drži dvije karte i oba dugmeta unutar ekrana. Stvarni plaćeni Lash Out završava bez zaostale odluke ili AI fallbacka.

Vizuelni dokazi: [mobilni izbor](../output/web-game/arena-backgrounds-release400/mobile-picker.png), [arena sa scenom](../output/web-game/arena-backgrounds-release400/desktop-forge-arena.png).

## Izvršna pokrivenost

| Provjera | Rezultat |
| --- | --- |
| Novi deterministički AI krug kroz svih 27 deckova | 27 završenih partija na katalogu 18.884, 17.914 odluka i 4.926 provjera invarijanti; bez prijavljenih fallback odluka ili povreda provjeravanih invarijanti |
| Partija kroz stvarni browser UI | Završena partija Abzan Armor protiv Turtle Power (pobjednik AI Dragon, potez 18); odluke za mulligan, glavnu fazu, prioritet, borbu, izbor i otkrivanje karata; provjeren rematch |
| Pozadine kroz browser i standardni web-game klijent | PASS; 11 pozadina, pet širina, očuvana odluka, promjena kroz tastaturu, upornost preferencija |
| Stroga strukturna certifikacija checkpointa | 18.884/18.884 definicija; 1.580 jedinstvenih karata u ugrađenim deckovima; 2.347 card/deck provjera |
| Potpuni skup testova | 5.284/5.284 PASS; nula padova, preskočenih ili otkazanih testova. Izvršni Oracle gate: 34.400/34.400 human/AI prolaza, 47.380/47.380 operacija, 10.136/10.136 keyword putanja i 80.275 ugniježđenih provjera |
| Stvarno uvezeno | 400/1.000; serije 0169–0172, katalog 18.884. Pinned source/runtime/state/app parity 400/400; 800 human/AI putanja, 1.326 operacija, 164 keyword putanje, 2.981 ugniježđena provjera i 1.571 invariant/stable-game provjera |
| Istorijski izvor serija 0127–0172 | 4.600/4.600 provjerenih izvora i sačuvana istorijska struktura; jedina eksplicitna kompatibilnost je Time Lord Regeneration iz serije 0144 |
| Browser novih serija | Pravi 100-card import, čuvanje/reload, Deck → Pod → Review, plaćeni spell nove karte i odgovor bota na Stacku; bez konzolnih grešaka |

Dokazi su u `output/mechanics-arena-2026-09-05/`, `output/oracle-0169-0178/` i `output/web-game/`.

## Granice rezultata

Prolazak testova potvrđuje izvršene slučajeve i provjeravane invarijante. Ne dokazuje svaku moguću kombinaciju svih Magic karata i svih multiplayer stanja. Nepotpuno podržane karte ne ulaze u katalog radi popunjavanja broja. Preostalih 600 karata nije uvezeno. Sljedeći audit uključuje fazirane objekte nakon ispadanja kontrolora; dosadašnji dokaz pokazuje da njihov povratak treba dodatnu ispravku. Proširenja za library pretrage, prenos countera i odložene objekte ostaju odvojena do izvršne provjere.

Novi import koristi isti pinovani Scryfall izvor: `2026-08-30T09:01:56.964+00:00`, SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Upis se radi samo u potpunim serijama od 100 nakon izvršne provjere za igrača i stvarni lokalni AI.
