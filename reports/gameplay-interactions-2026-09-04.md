# Pregled sitnih, ali bitnih gameplay interakcija — 2026-09-04

Nakon Windswift Slice prijave urađen je fokusiran pregled srodnih problema: stvarni rezultat damagea, simultani fight i death događaji, djelimično legalne mete, blink i trajanje efekata. Popravljene su implementacije 11 karata i zajednička obrada wither/infect + deathtouch. Ovo je pregled tih porodica interakcija, a ne potvrda da je svaka karta u katalogu potpuno ispravna.

## Potvrđeni problemi i popravke

| Karta / mehanika | Potvrđeni problem | Sadašnje ponašanje |
| --- | --- | --- |
| Wither/infect + deathtouch | Damage pretvoren u -1/-1 countere nije aktivirao deathtouch; smrt se mogla obraditi prije damage događaja. | Pozitivan damage zadržava deathtouch i redoslijed događaja. Regeneration i indestructible imaju zasebne provjere. |
| Deathtouch + indestructible | Stara deathtouch oznaka mogla je ubiti preživjelo stvorenje kada kasnije izgubi indestructible. | Oznaka se potroši pri prvoj provjeri state-based actions; označeni damage ostaje prema pravilima. |
| Grothama, All-Devouring | Prvi wither udar mijenjao je snagu uzvratnog udarca; provjera izvora nije čuvala tačnu instancu. | Fight uzima snagu i sposobnosti oba izvora prije damagea i provjerava instancu napadača. |
| Brash Taunter | Uzvratni damage i njegov trigger mogli su biti umanjeni prvim udarcem; uklonjen ili blinkan izvor mogao je učestvovati. | Simultan fight i provjera živog izvora, tipa i instance. |
| Voracious Hydra (handler Aggro Amalgam) | Wither je mogao smanjiti uzvratni damage sa 2 na 0. | Simultan fight uz provjeru tačne instance ETB izvora. |
| Fight for the Throne | Jedna nelegalna meta gasila je i nezavisni efekat na drugoj; prvi damage mogao je ukloniti uslovni lifelink prije uzvrata. | Legalna vlastita meta dobija counter, legalna protivnička dobija death praćenje; fight traži obje. Snaga i sposobnosti uzimaju se prije oba udarca. |
| Decree of Pain | Sekvencijalno uništavanje gubilo je death triggere: Blood Artist sa još tri stvorenja davao je 1 umjesto 4 triggera. | Grupno uništavanje čuva simultane death događaje i broj stvarno uništenih stvorenja za draw. |
| Colossal Whale | Blink izvora ili promjena instance mete mogla je ostaviti kartu u exileu ili vratiti pogrešnu instancu. | Exile i povratak prate tačne instance; odlazak Whale odmah završava trajanje, bez dodatnog return triggera na Stacku. |
| Heroic Intervention | Hexproof je mogao ostati na novoj instanci nakon blinka. | Privremena zaštita pripada samo originalnoj instanci. |
| Patriot, Shield Wielder | Isti problem prenošenja hexproofa nakon blinka. | Zaštita provjerava identitet i verziju zone. |
| Heroic Sacrifice | Redirect i death nagrada mogli su pratiti novu instancu nakon blinka. | Oba efekta vezana su za originalnu instancu. |
| Plaza of Heroes | Aktivacija je žrtvovala land umjesto da ga exilea; zaštita je mogla pratiti blink. | Stvarni exile trošak, bez lažnog sacrifice događaja, i zaštita tačne instance. |
| Subterfuge | Combat draw ostajao je vezan za početnog kontrolera; blink je mogao zadržati sposobnost. | Privremenu sposobnost dobija konkretno stvorenje: draw dobija njegov trenutni kontroler, a blink/cleanup je uklanjaju. |

## Provjera

- Dodano **68 regresijskih testova**: damage keywords 13, fight 17, zone results 20, delayed identity 18. Testovi koriste stvarne cast/activation troškove, izbor meta i Stack, uz ljudske kontrolere i lokalni AI. Pojedinačni engine testovi pokrivaju redoslijed događaja i SBA detalje.
- Završni povezani skup: **353/353 PASS**, bez preskočenih testova. Uključuje četiri nova fajla te Windswift, Tree of Perdition, CR conformance, marked damage UI, prevention, divided damage, Elven Council, Turtle Power, deck audit sextet, planeswalker combat, Avengers Assemble, Dance Elements, Wakanda Forever i Sauron.
- Headless i AI skup: **25/25 PASS**. Svih **27 deckova** završilo je determinističku četveroigračku partiju sa pobjednikom prije limita, bez preostalih pending triggera. Ovaj skup je završen prije posljednje uske Fight for the Throne izmjene; poslije nje ponovljeni su povezani skup i Wakanda testovi sa kompletnim partijama.
- Ukupno **378 prolaznih testova**. `npm run check` i scoped `git diff --check` prolaze. Puni repository suite nije pokrenut za ovaj pregled.
- Browser, ljudska putanja: Windswift iz ruke, izbor oba stvorenja, plaćanje sa tri Foresta. Sedge Scorpion uz Everlasting Torment nanosi 1 wither damage Colossal Dreadmawu; Dreadmaw umire od deathtoucha. Excess je 0 i tokeni se ispravno ne stvaraju.
- Browser, lokalni AI: AI sam bira isti plaćeni spell i mete; spell je vidljiv na Stacku, zatim se dobija isti rezultat. Obje putanje završavaju bez pending odluka, Stack sadržaja i console/page/HTTP grešaka. Screenshotovi su vizuelno pregledani. Ostalih 11 karata pokriveno je izvršivim testovima; nisu sve pojedinačno odigrane kroz browser.
- Dodatni develop-web-game klijent prikazao je i snimio postojeći Galadriel vote UI. Taj odvojeni statički smoke ima jedan očekivani `/api/account` 404; namenski gameplay browser test koristi stub za account i nema grešaka.

## Dokazi i ponavljanje

Novi testovi: `tests/subtle-damage-keywords.test.mjs`, `tests/subtle-fight-interactions.test.mjs`, `tests/subtle-zone-results.test.mjs`, `tests/subtle-delayed-identity.test.mjs`.

```sh
node --test tests/subtle-damage-keywords.test.mjs tests/subtle-fight-interactions.test.mjs tests/subtle-zone-results.test.mjs tests/subtle-delayed-identity.test.mjs
node --test tests/headless-smoke.test.mjs tests/ai-v2.test.mjs
npm run check
```

Lokalni dokazi su u `output/subtle-interactions-audit/`: `aggregate.log`, `headless-ai.log`, `browser-check.mjs`, `browser-evidence.json`, `human-wither-deathtouch.png`, `human-wither-log.png`, `ai-spell-on-stack.png`, `ai-wither-deathtouch.png` i `client/`. Raniji Windswift browser dokaz sa četiri zelena 1/1 Elf Warrior tokena ostaje u `output/windswift-slice/`.

Sve izmjene su lokalne. Nije urađen commit, push niti deploy. Postojeći nepovezani Oracle i drugi WIP je sačuvan.
