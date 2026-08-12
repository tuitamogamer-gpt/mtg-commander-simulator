# Opšti audit skriptovanosti karata — 2026-08-12

## Zaključak

- Raw baza: **1.288/1.288 PASS**, 0 bez eksplicitne skripte, 0 `autoScripted`, 0 `simplified`.
- Aktivni proizvod: **20 deckova**, svaki po 100 karata; **1.237 stvarno jedinstvenih aktivnih karata**.
- Card/deck provjere: **1.722/1.722 PASS**. Ovo su jedinstvene karte unutar svakog decka, pa se karta koja je u više deckova provjerava u svakom od njih.
- Izvan aktivnog proizvoda: **51/51 PASS**. To su raw karte koje se pojavljuju samo u izbačenom `Blame Game` decku.
- Source integritet: **0** duplih `SC[...]` registracija i **0** preostalih pojednostavljenih implementacija.
- Testovi: **64/64 PASS**, uključujući zaseban strukturalni prolaz svih 1.288 karata, ciljane rules testove i determinističku četveroigračku smoke partiju za svaki aktivni deck.
- Desktop browser smoke: stvarna partija je prošla mulligan, draw, main 1 i main 2 bez console/page greške; pregledan je završni screenshot.

Puni rezultat za svaku kartu i svaki aktivni deck nalazi se u `reports/card-certification.md`; mašinski čitljiv rezultat je u `reports/card-certification.json`.

## Šta znači PASS

Za svaku raw kartu provjereno je da postoji finalna definicija i eksplicitna skripta, da ne koristi heuristički autoscript ili `simplified` oznaku, da nema tihu duplu registraciju te da njene osnovne Oracle strukture imaju odgovarajuću izvršnu putanju: spell resolution/modes, mana sposobnosti landova, equip/attach, Aura mete, aktivirane sposobnosti, planeswalker loyalty sposobnosti i posebni engine hookovi.

Strukturalna provjera je dopunjena ciljanim semantičkim testovima za pronađene greške. PASS nije tvrdnja da je matematički isprobana svaka moguća kombinacija 1.288 karata; Commander proizvodi ogroman kombinatorni prostor. To znači da audit nije pronašao preostalu poznatu neskriptovanu ili eksplicitno pojednostavljenu putanju u provjerenom setu i da svi trenutni release gateovi prolaze.

## Pronađeno i odmah ispravljeno

| Karta / područje | Kako nije radilo prije | Ispravka |
|---|---|---|
| The Mycosynth Gardens | Nije imala copy aktivaciju. | Dodan izbor artefakta, plaćanje njegovog mana valuea, kopiranje i vraćanje originalnog identiteta pri promjeni zone. |
| Trading Post | Imala je samo dvije od četiri aktivirane sposobnosti; žrtvovanje nije pravilno obuhvatalo sebe. | Skriptovana sva četiri moda i legalan self-sacrifice artefakta. |
| Tezzeret, Betrayer of Flesh | Nedostajali static popust i pune loyalty putanje; +1 izbor i -2 Vehicle izuzetak nisu bili tačni. | Dodan kumulativni prvi-artifact-activation popust, sve tri loyalty sposobnosti i -6 emblem. Neuspjela aktivacija više ne troši popust. |
| Plaza of Heroes | Nedostajala treća mana sposobnost. | Dodana mana boje među legendarnim permanentima kontrolora. |
| The Wasp, Winsome Avenger | ETB zaštita Heroja i ciljani tap pri napadu nisu bili potpuni. | Dodani odgovarajući ETB i attack triggeri. |
| Shang-Chi and the Ten Rings | Deseti +1/+1 counter nije imao pouzdan zaseban događaj. | Centralni `plusAdded` događaj sada prati prelazak preko desetog countera. |
| Human Torch | Attack i reflektovana combat šteta nisu bili kompletni. | Attack proizvodi {R}{G}{W}{U}; stvarno nanesena combat šteta se reflektuje. |
| Estinien Varlineau | Second-main efekt nije znao koji su jedinstveni protivnici pogođeni. | Centralno se bilježe stvarni combat hitovi i provjeravaju u `postcombatMain`. |
| Fandaniel, Telophoroi Ascian | Nedostajao end-step izbor. | Dodan sacrifice-or-life tok. |
| Ardbert, Warrior of Darkness | Bijeli i crni/crni dio bili su spojeni, pa višebojni spell nije dobijao oba trigera. | Razdvojeni triggeri; spell odgovarajućih boja sada aktivira oba. |
| Thancred Waters | ETB nije davao indestructible drugom legendarnom permanentu. | Dodana legalna ciljna ETB putanja sa pravilnim trajanjem. |
| Innocuous Researcher | Nedostajao optional untap landa i ograničenje bacanja. | Dodan end-step izbor te centralni timing/cast lock. |
| Black Market Connections | Pokretao se u upkeepu. | Premješten na početak prvog maina (`precombatMain`). |
| Cosmic Crucible | Bio vezan za pogrešnu fazu i nije nudio proizvoljnu kombinaciju boja. | Prvi-main trigger sada nudi sva četiri izbora boje. |
| Archnemesis | Koristio je mrtvo polje `hostPlayer` i nije pouzdano mijenjao prokletog igrača. | Uveden `cursedPlayer` i retarget pri napadu. |
| Hildibrand Manderville | Smrt nije davala stvarnu Adventure dozvolu iz groblja. | Dodana dozvola do kraja sljedećeg vlastitog poteza. |
| Endless Ranks of HYDRA | Commander ETB/attack iz groblja bio je modelovan kao kasni, attack-only delayed efekt. | Oba grobljanska triggera su stvarno registrovana. |
| Ancestral Communion | Kopija nije bila prava stack kopija i meta nije bila stvarna. | Dodan cast trigger, legalna meta i centralni `copySpell` tok. |
| Gix, Yawgmoth Praetor | Nedostajala {4}{B}{B}{B}, discard-X sposobnost; draw filter je bio preširok. | Dodana aktivacija i ispravljen damage/draw uslov. |
| Papalymo Totolymo | Aktivirana sposobnost je nedostajala. | Dodana puna aktivacijska putanja. |
| Escape Tunnel | Nedostajala unblockable sposobnost. | Dodana druga aktivacija sa legalnom metom. |
| Metalwork Colossus | U groblju je imao prazno `abilities: []`. | Implementiran stvarni `gyAbility` sa žrtvovanjem dva artefakta kao cijenom. |
| Magma Opus | Jeftina aktivacija iz ruke bila je predstavljena kao bacanje cijelog spella. | Pretvorena u zasebni hand ability: odbaci kartu i napravi Treasure. |
| Council of Reeds | Legend-rule tekst bio je no-op static. | State-based legend provjera sada poštuje izuzetak za stvorenja kontrolora. |
| Quicksilver, Speedster | `grantsFlash` nije bio aktivan dok je karta tapped. | Dodan funkcionalni static grant. |
| Will of the Abzan | `castCondBoth` je bio mrtvo polje. | Engine sada dozvoljava i izvršava oba moda kada kontrolor ima komandera. |
| Aether Channeler | Modeovi su se birali pri castu i ponovo na ETB-u. | Uklonjen dupli cast izbor; ostao pravilan ETB izbor. |
| Merchant of Truth | Clue tokeni nisu stvarno dobijali exalted. | Dodan attack trigger koji broji kontrolisane Clue izvore. |
| The Odd Acorn Gang | Gang je birao i tapao drugo stvorenje umjesto da svakom Squirrelu da sposobnost. | Static sada svakom Squirrelu dodjeljuje vlastitu tap aktivaciju. |
| Dearly Departed | Counter je dolazio kroz zakašnjeli ETB trigger, a ne pri ulasku. | Dodan graveyard ETB replacement hook; Human ulazi sa counterom. |
| Arcane Denial | Kontrolor counterovanog spella bio je prisiljen vući dvije. | Implementiran izbor od nula do dvije, kako Oracle nalaže. |
| Fortune Teller's Talent | `revealOwnTop` nije imao stvarni privatni UI prikaz. | Dodan privatni, klikabilni prikaz vršne karte biblioteke. |
| Everlasting Torment | “Damage can't be prevented” nije zaobilazio sve shield/protection/until prevention putanje. | Prevencija je centralno označena i preskočena kada je Torment aktivan; wither ostaje primijenjen. |
| Thriving Grove / Thriving Moor | Bili su generički any-color landovi bez izbora dodatne boje. | Koriste zajednički Thriving land izbor pri ulasku. |
| Captain America, Living Legend | “First time tapped each turn” oslanjao se na nepotpun tap događaj. | Centralni tap događaj sada bilježi svaki untapped→tapped prelaz i `firstThisTurn`. |
| Comeuppance | Štitio je samo igrača, vraćao samo creature štetu i nije provjeravao kontrolora izvora/planeswalkere. | Sprječava samo tuđe izvore prema igraču i njegovim planeswalkerima; creature štetu vraća stvorenju, noncreature kontroloru izvora. |
| Deflecting Palm | Nije birao konkretan izvor; hvatao je sljedeći bilo koji damage event. | Na rezoluciji se bira izvor, a samo njegov sljedeći damage event se sprječava i vraća kontroloru izvora. |
| Gideon's Sacrifice | Štitio je samo igrača i birao samo stvorenje. | Bira stvorenje ili planeswalkera i preusmjerava štetu sa igrača i svih njegovih permanenata. |
| Selfless Squire | Sprječavao je štetu, ali nije dobijao +1/+1 countere za spriječenu količinu. | Uveden centralni `damagePrevented` događaj i odgovarajući counter trigger. |
| Feather, Radiant Arbiter | Kopiranje spellova koji ciljaju samo Feather nije postojalo. | Bira bilo koji broj drugih legalnih creature meta, plaća {2} po meti i pravi zasebnu stack kopiju za svaku. |
| Hot Pursuit | Nedostajao je drugi trigger; goad je ostajao trajno i nakon odlaska enchantmenta. | Goad sada zavisi od prisutnosti Hot Pursuita; nakon dva ispadanja preuzima sva goadovana/suspected stvorenja, untapuje ih, daje haste i vraća kontrolu u cleanupu. |
| Sedam land registracija | Duple registracije su tiho prepisivale ranije skripte. | Uklonjeni duplikati za Canopy Vista, Sunpetal Grove, Fortified Village, Frostboil Snarl, Ferrous Lake, Sungrass Prairie i Scattered Groves. |
| Into the Time Vortex | Imao je prazni `resolve` samo da zadovolji stari certifier. | Označen kao rules-only spell: cijeli Oracle efekat čine centralno skriptovani cascade i rebound. |
| Zastarjela polja | `aftermathName`, `isCreatureModal`, `unblockableIfIsland`, `xxCost` i `xxxCost` nisu imali potrošača. | Uklonjena mrtva polja ili zamijenjena stvarnim centralnim putanjama. |

## Karte sa namjerno praznim lokalnim script objektom

Ovo nisu neskriptovane karte:

- **Indomitable Ancients** je vanilla 2/10; nema rules tekst koji traži posebnu putanju.
- **Zetalpa, Primal Dawn** koristi samo standardne keyworde, koje centralni keyword parser učitava iz Oracle teksta.
- **Into the Time Vortex** nema zaseban resolution tekst; cascade i rebound izvršava centralni engine i označen je `rulesOnlySpell` umjesto lažnog praznog `resolve` callbacka.

## Aktivni i neaktivni opseg

`Blame Game` ostaje izbačen iz aktivnog proizvoda. Njegovih 51 jedinstvenih raw karata sada pojedinačno prolazi strukturalni card audit, uključujući šest gore popravljenih složenih karata. Ipak, cijeli deck nije ponovo uveden niti je proglašen gameplay-certifikovanim kao deck: njegov multiplayer politički/goad/damage-redirection sklop nije dio aktivnog 20-deck release gatea.

## Izvršene provjere

| Gate | Rezultat |
|---|---|
| `npm run check` | PASS |
| `npm run audit` | PASS — 20×100, 0 duplicate, 0 active/inactive simplified |
| `npm run certify:strict` | PASS — 1.288/1.288 raw, 1.237/1.237 active, 1.722/1.722 card/deck |
| `npm test` | PASS — 64/64 |
| `git diff --check` | PASS |
| Desktop Playwright smoke | PASS — mulligan do main 2, bez console/page greške |

Promjene u ovom auditu nisu commitovane, pushovane niti deployovane.
