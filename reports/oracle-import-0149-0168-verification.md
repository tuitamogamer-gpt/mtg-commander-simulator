# Oracle import 0149–0168

Uvezeno je **2.000 novih karata**, u 20 potpunih paketa po 100. Katalog sada sadrži **18.484 definicije**: 16800 generičkih Oracle karata, 58 namjenski obrađenih karata i 1626 ranijih definicija.

Izvor je nepromijenjeni Scryfall Oracle snimak od **2026-08-30T09:01:56.964+00:00**. Provjerene su sve Oracle identifikacije, puna izvorna polja, Commander legalnost, odsustvo duplikata, prevedena pravila, runtime moduli i registracija u aplikaciji. Nepodržane karte ostaju u redu za kasniju obradu.

SHA-256 izvora: `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`.

| Provjera | Rezultat |
|---|---|
| Porijeklo i podudaranje cijelih karata | 2000/2000 |
| Stvarne interakcije čovjeka i lokalnog AI-ja | 4000/4000 |
| Putanje operacija | 6866/6866 |
| Keyword dokazi | 1128/1128 |
| Ugniježđene provjere efekata | 16767 |
| Puna testna zbirka | 4600/4600, bez grešaka |
| Human/AI provjere cijelog generičkog kataloga | 33600/33600 |
| Stroga certifikacija definicija | 18484/18484 |
| JavaScript sintaksa | PASS |
| Browser guest import, library, pod i gameplay | 16/16 |

Browser: 5 novih human karata i 6 AI spellova odigrano je uz stvarno plaćanje. U partiji sa seedom 34372319, do stabilnog desetog poteza bilo je 35 AI odluka, bez fallbacka, browser grešaka ili zaglavljenih okidača. AI browser protivnici koristili su postojeće deckove; zaseban dokaz svih 2.000 novih karata provjerava oba kontrolora. Zapis i završna slika su u `output/oracle-0149-0168/browser-final`.

Dodana je izvršna podrška za potrebne efekte, troškove, okidače, izbor meta, energy countere, Aura/Equipment interakcije, dodatne faze i poteze, kopiranje te gubitak sposobnosti. Energy je povezan s prikazom, čuvanjem partije, proliferate odlukama i zajedničkim budžetom pri plaćanju mane. Provjere obuhvataju ljudske odluke i lokalni AI, promjene zona, odgovor na Stacku i neuspjele troškove.

Postojeće Fableove izmjene u zajedničkom checkoutu sačuvane su. Ova isporuka je lokalna; commit, push i deploy nisu rađeni.

Izvršni dokazi i zapisnici: `output/oracle-0149-0168/`. Pojedinačne karte: `reports/oracle-import/batch-0149.json` do `batch-0168.json`.
