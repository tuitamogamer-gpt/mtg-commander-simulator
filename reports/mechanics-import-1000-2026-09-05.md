# Završetak audita i importa 1.000 karata — 5. septembar 2026.

Zahtjev za narednih **1.000 novih karata** završen je u deset potpunih serija **oracle-0169–oracle-0178**. Katalog ima **19.484 definicije**, uključujući **17.800 generičkih Oracle karata**, uz 27 ugrađenih deckova. Dvije dodatne spremne karte nisu uvezene; traženi broj nije prekoračen.

Svaka serija prošla je provjeru cijele karte prije upisa. Završna provjera svih 1.000 novih karata ima **2.000 human/local-AI izvršavanja, 3.230 operacionih putanja, 8.901 ugniježđenu provjeru, 426 keyword putanja i 3.943 provjere stanja partije**, bez grešaka. Svih **5.200 izvora** iz serija 0127–0178 odgovara pinovanom izvoru i deklarisanoj istorijskoj kompatibilnosti.

Izvor je Scryfall `oracle_cards`, datum `2026-08-30T09:01:56.964+00:00`, SHA-256 `a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528`. Završni hash compilera je `27cd14e3733cf45ba1ed8726501b6bac040fa17b3e255fef92b37b30a924c3d4`. Registracija i parsiranje sami po sebi nisu korišteni kao dokaz podrške.

## Mehanike i bot

- Manifest karta u vlastitom card sheetu pokazuje akciju okretanja, trošak ili razlog nedostupnosti. Kontrole ostaju dostupne na niskim i mobilnim ekranima. Delve računa konačni generički trošak i X, koristi dovoljno karata iz groblja i odbija nevažeće izbore prije trošenja resursa. Botov javni dnevnik ne otkriva privatne Manifest Dread izbore ili identitet neizabrane face-up alternative. Detalji i zaseban provjereni snapshot su u [auditu sposobnosti](ability-audit-2026-09-05.md).
- Vernal Sovereign više ne odbija plativo bacanje kada se kombinuju Jegantha i Flamebraider mana. Plaćanje obojenog simbola prvo koristi odgovarajuću manu koja ne može platiti generički trošak. Šest regresija pada prije popravke i prolazi poslije; identično početno stanje iz partije seed 951121, potez 48, sada uspješno plaća bacanje.
- Modalni spellovi provjeravaju postoji li kompletan legalan izbor meta za svaki ponuđeni mod. Nexus Mentality sa samo jednim vlastitim nonland permanentom više ne nudi prenos countera na nepostojeću drugu metu. Osam regresija, 64 povezana testa i šest stvarnih desktop/mobilnih/AI browser scenarija prolaze. Isti seed 951100 završava sa jednim uspješnim bacanjem umjesto ponovljenih odbijanja; dozvoljen cast bez korisnog efekta nije označen kao optimalna strategija bota.
- Kotis dozvola za bacanje iz groblja vezana je za tačnu inkarnaciju izvora i karte. Timeless Witness vraća izvornu definiciju pri promjeni zone i više ne zadržava isteklu dozvolu nakon smrti Kotisa. Izbor tri karte samo priprema plaćanje: neuspješno plaćanje mane ne egziluje karte i ne troši poteznu dozvolu. Kotis i Delve rezervišu odvojene karte, a dostupnost akcije uključuje oba troška. Plaćeni Kotis spell nema Flashback zamjenu odlaska sa Stacka: Counterspell ga šalje u groblje, a Reprieve u ruku. Pravi Think Twice Flashback pri counterovanju, vraćanju ili razrješenju i dalje ide u egzil. Dvadeset pet namjenskih regresija i 84 povezana testa prolaze, kao i sedam dodatnih Flashback kontrola; četiri nova Kotis izlazna scenarija dokazano padaju prije popravke i prolaze poslije.
- Gravecrawler i Exploration Broodship koriste zasebne dozvole za bacanje, uz normalan odlazak sa Stacka. Gravecrawlerov Zombie uslov pripada njegovoj vlastitoj dozvoli. Broodship provjerava vlastiti potez, živu inkarnaciju izvora i jednom-po-potezu ograničenje; odabrani land može dati manu prije žrtvovanja, a neuspjelo plaćanje ne troši land niti dozvolu. X procjena rezerviše isti land kao stvarno plaćanje, pa Crystal Vein ne može platiti trošak dva puta. Preklopljeni Kotis/Broodship grantovi vraćaju izvornu definiciju nezavisno od redoslijeda. Prolazi 39 namjenskih i 133 povezana testa; početni paket od 26 scenarija imao je 23 reprodukovana pada prije popravke.
- Sedam dodatnih regresija provjerava preklopljene grantove u oba redoslijeda za čovjeka i lokalni AI, samo jedan odabrani dodatni trošak nakon ponovljenih preračunavanja, vjernu AI kopiju te JSON čuvanje i učitavanje partije. Kopija ne mijenja izvorno stanje, a obnovljena partija zadržava izvršne definicije i pravilno uklanja istekle dozvole.
- Orcish Mine koristi posljednjeg kontrolora enchantovanog landa za štetu, uključujući promjene kontrole i odlazak landa tokom razrješenja. Istorijski manifest serije 0167 ostaje nepromijenjen.
- Guardian Project prati stvarno ime i identitet ulazeće inkarnacije, kopije, groblje i promjene prije razrješenja. Chrome Replicator razlikuje tokene i landove od traženih permanenata. Winnow ponovo provjerava zajedničko ime pri razrješenju; četiri Shrine enchantmenta broje sva groblja i djeluju na igrača koji je bacio spell. Nameless Morph i split karte imaju zasebne plaćene regresije. Endless Atlas i Sceptre of Eternal Glory zadržavaju postojeće istorijske deskriptore.
- Ripple koristi stvarni cast događaj i odgovarajući broj zasebnih triggera. Otkrivena karta dobija dozvolu za besplatno bacanje uz stvarne mete i dodatne troškove; naknadni Ripple triggeri čekaju završetak trenutnog efekta. Preostale karte idu na dno izabranim redoslijedom. Provjereni su Rule of Law, nestanak izvora, face-down karte i bacanje druge polovine odgovarajuće split karte.
- Raniji dio istog zadatka popravio je SBA redoslijed, commander promjenu zone, marked damage/shield, kopirane spellove i tokene, nezavisne Ward troškove, trajanje kontrole, Soulbond, land tipove, delayed/state triggere, pretrage po imenu, Exert i Exploit. Raniji checkpoint je dokumentovan u [prvom auditu](mechanics-audit-2026-09-05.md).

## Arena i provjere kroz interfejs

Arena ima **11 sačuvanih pozadina: šest paleta i pet scena**, uz podešavanje zatamnjenja. Provjerene su širine 320, 390, 820, 1440 i 1900 px, tastatura, čuvanje izbora i stvarna akcija u partiji poslije promjene. Popravka iz paralelne mobilne sesije vraća odgovarajući Table raspored i drži Find i ostale kontrole dostupnim na uskom ekranu.

HOLD sada zaustavlja sljedeći stvarni prozor prioriteta i kada igrač nema instant ili aktivaciju. Full control prikazuje i vlastiti spell, trigger i prazan Stack; uobičajeni režimi i dalje automatski propuštaju nepotrebne prozore. Nema prioriteta usred razrješenja. Dvanaest novih regresija i pet desktop/mobilnih browser scenarija potvrđuje ponašanje.

Named-count browser scenariji pokrivaju svih sedam novih izvora i ponavljaju Guardian Project i Winnow na 390 px: **9/9 prolazi**, bez grešaka i AI fallbacka. Ripple browser provjerava desktop čovjeka, mobilni ekran i lokalni AI, sa stvarno plaćenim početnim spellom, dvije besplatne kopije i izborom redoslijeda dna biblioteke. Manifest/Delve browser iz druge sesije ima pet scenarija i četiri veličine ekrana.

Novi browser paket za izlaze sa Stacka ima **12/12 PASS**: osam Counterspell putanja kroz četiri izvora i oba kontrolora, te četiri Reprieve kontrole. Plaćanje, mete, HOLD, odgovor i razrješenje koriste stvarni interfejs; mobilni čovjek je na 390 px, a lokalni hard AI na desktopu. Provjereni su odredište karte, tačna mana, tri Kotis egzila, jedan Broodship land, potezna ograničenja i fizički identitet karata. Nema runtime grešaka niti AI fallbacka; stvarni Flashback zadržava egzil.

Završnih **deset lokalnih browser provjera** prolazi na istom zamrznutom kodu: pozadine, HOLD, po 54 rasporeda u Chromiumu i WebKitu, prirodni import serija 0177–0178 sa čuvanjem i ponovnim učitavanjem, ljudska partija od 89 odluka / 18 poteza sa rematchom, Nexus Mentality, Kotis, Manifest/Delve i novi paket izlaza sa Stacka. SHA-256 svih **1.067 source/test datoteka** identičan je prije i poslije provjere; pregledani su novi screenshotovi. Svi runneri prolaze funkcionalne i runtime provjere. Mrežni monitoring razlikuje se po runneru: oba mobilna runnera prate neuspjele zahtjeve, pozadine i ljudska partija prate HTTP greške, a Manifest/Delve zadržava isključenje `ERR_ABORTED`. Prazna mrežna lista se ne podrazumijeva za runnere koji je ne prikupljaju. `npm run check`, `npm run audit` i `npm run certify:strict` prolaze; stroga certifikacija pokriva 19.484/19.484 definicije i 2.347 card/deck provjera.

## Završna provjera cijele igre

Kompletni postojeći suite, pokrenut kao `node --test --test-concurrency=4 tests/*.test.mjs`, završio je sa **7.147/7.147 PASS**, bez padova, preskočenih, otkazanih ili TODO testova, za 758,26 sekundi. Ograničenje na četiri radnika mijenja samo paralelizam. Svih 1.067 izvora, testova, skripti, konfiguracija i Oracle izvještaja u završnom manifestu ostalo je identično tokom provjere.

Svih **27 determinističkih partija** preko 27 ugrađenih deckova završilo je prirodno, za 32–73 poteza. Stvarni lokalni AI napravio je **19.689 odluka**, uz **5.435 provjera stanja**, bez odbijenih akcija, fallbacka ili narušenih invarijanti. Završni skup uključuje ponavljanje oba ranije problematična seeda, 951100 i 951121, poslije popravki Nexus/Kotis interakcija.

## Dokazi

- `output/oracle-0169-0178/first-1000-verification-summary.json`: tačan broj, izvor, runtime/state/app parity i izvršne putanje.
- `output/oracle-0169-0178/named-count-browser/browser/report.json`: stvarni cast, target, Stack, rezolucija i slike desktop/mobilnog interfejsa.
- `output/oracle-0169-0178/ripple-sandbox/`: izvor, pravila, regresije i browser dokazi.
- `output/release-all-2026-09-05/vernal-sandbox/verification.json`: identično ponavljanje ranije odbijenog plaćanja.
- `output/final-1000-2026-09-05/`: završne zajedničke provjere i verifikacija objave.
- `output/final-1000-2026-09-05/native-permission-verified.json` i `kotis-stack-exit-verification.json`: plaćeni izlazi sa Stacka, tačni dodatni troškovi, izvor dozvole i negativni scenariji.
- `output/release-final-1000-2026-09-05/final-local-browser-summary.json`: deset završnih browser provjera, manifest istog izvora i pregledane slike.
- `output/final-1000-2026-09-05/local-verification.json` i `final-import-release-check.json`: završni kompletni suite, 27 partija i potvrda nepromijenjenih izvora svih deset novih serija.

Rezultati potvrđuju izvršene scenarije i invarijante podržanog kataloga; ne predstavljaju dokaz svake moguće kombinacije Magic karata i multiplayer stanja.
