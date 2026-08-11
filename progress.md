Original prompt: Pretvori postojeći MTG Commander simulator u desktop-only Commander klijent za fiksni set postojećih deckova. Svaka nonland karta i relevantna odluka moraju biti vidljive i potvrđene kroz Proceed; priority, stack, end-step stopovi i combat moraju pratiti prava Commander pravila; svaki deck i svaka karta moraju proći zasebnu certifikaciju. Blame Game je kandidat za uklanjanje. Završni koraci su Git push i Vercel redeploy tek nakon release gateova.

# Desktop Commander overhaul

## Scope

- Desktop only; minimalna podržana širina 1280 px.
- Fiksni ugrađeni deckovi; bez novih deckova i bez proizvoljnog importa.
- Engine događaji su autoritativni; UI ne smije sakrivati relevantne akcije.
- Aggregate simulacije su safety net, ne zamjena za card-by-card i deck-by-deck certifikaciju.
- `Blame Game` je uklonjen iz aktivnog proizvoda; njegove raw definicije ostaju samo zbog karata koje dijeli sa drugim deckovima.

## Trenutna faza

- [x] Izolovana grana `codex/desktop-commander-overhaul`.
- [x] Reproducibilan baseline i test runner.
- [x] Modularna browser osnova bez monolitnog HTML-a.
- [x] Ispravan priority/stack/trigger state machine sa holderom, punim pass krugom i APNAP batchom.
- [x] Desktop action stage, stop profili, end-step prozor i combat vizualizacija.
- [x] Card-by-card certifikacija po svakom od 20 deckova.
- [x] Release gate, GitHub push i Vercel produkcijski redeploy.

## Završni status provjere

- `npm test`: 31/31, uključujući svih 20 zasebnih deck-smoke partija i ciljane card-rule ugovore.
- `npm run certify:strict`: 1722/1722 card/deck provjere, 0 FAIL.
- `npm run audit`: 20 aktivnih deckova po 100 karata, 0 duplicate script registracija, 0 `simplified` karata.
- Desktop Playwright: stvarni UI tok do 26. poteza, action stage/Proceed i reveal popupovi, bez console/page greške.

## Dnevnik

- 2026-08-11: Završen početni audit. Core happy path je stabilan, ali postoje tihi rules bugovi, ekstremni AI/deck balance outlieri i monolitna arhitektura bez testova.
- 2026-08-11: Korisnik zaključao desktop-only, vidljive akcije, pravi priority i card-by-card certifikaciju kao cilj.
- 2026-08-11: Dodani Node baseline audit/test runner te semantički `render_game_to_text` i `advanceTime` browser hookovi.
- 2026-08-11: Prvi `npm test` otkrio da Node 22 ne prihvata direktorij kao test target; test skripta prebačena na eksplicitni glob.
- 2026-08-11: `npm run check`, `npm test` i source audit prolaze. Playwright baseline je vizuelno pregledan na desktopu; setup snapshot vraća `{mode: "setup", deckCount: 21}` bez konzolne greške.
- 2026-08-11: Priority state machine prebačen sa aktivni-igrač-first petlje na eksplicitnog holdera/pass counter. Rekurzivni priority pozivi se spajaju u jednu sesiju; simultani triggeri se batchuju na stack prije otvaranja priorityja.
- 2026-08-11: Prvi priority unit-test prolaz pokazao je da test mora presresti `askPriorityAction` direktno, jer engine namjerno ne otvara controller prompt igraču bez legalne akcije. Harness je korigovan.
- 2026-08-11: Dodan headless safety net: svaki od 21 decka mora završiti jednu determinističku četveroigračku partiju bez turn-limita, zaostalog stacka ili pending triggera. Ovo nije zamjena za kasniju card-by-card certifikaciju.
- 2026-08-11: Smoke gate korigovan: game-over smije ostaviti nebitan objekt na stacku jer igra završava odmah kad ostane jedan igrač; pending trigger queue i turn limit i dalje moraju biti čisti.
- 2026-08-11: Dodan query-param desktop smoke ulaz (`smokeDeck`, `seed`) koji pokreće stvarnu UI partiju i staje na prvoj ljudskoj odluci radi Playwright/screenshot provjere.
- 2026-08-11: Pripremljen deterministički codemod za razdvajanje monolita na HTML shell, CSS, aplikacijski JavaScript i card/deck podatke.
- 2026-08-11: Monolit razdvojen: `index.html` 799 B, `src/styles.css` 54 KB, `src/app.js` 1.07 MB, `src/data.js` 508 KB. Headless bootstrap koristi idempotentni globalni `var MTG` u oba modula.
- 2026-08-11: Pripremljen drugi deterministički codemod koji postojeće virtualne module pretvara u stvarne browser ES module fajlove, uz zadržavanje globalnog MTG registra tokom migracije.
- 2026-08-11: Uklonjeni proizvoljni deck import i Moxfield serverless API; proizvod je sada eksplicitno fiksni scripted set. Uveden desktop-only gate ispod 1280 px i vraćen normalan browser zoom meta tag.
- 2026-08-11: Commander legality sada računa mana simbole iz cost/oracle teksta, validira cijeli deck prema izabranom solo/partner identitetu i player mana identity izvodi samo iz commandera.
- 2026-08-11: Abzan legality dokaz: Felothar i Betor su legalni solo; Ikra Shidiqi i Sidar Kondo su legalni isključivo zajedno kao Partner par. Ostali ranije ponuđeni legendari su filtrirani.
- 2026-08-11: Uvedeni eksplicitni protection hookovi za targeting, damage i blocking. Riders of Gavony sada bira tip i stvarno štiti Humane od stvorenja tog tipa.
- 2026-08-11: Scavenger Grounds više nije dvaput registrovan i kao cijenu žrtvuje bilo koji Desert; Lyse Hext smanjuje noncreature spellove i dobija double strike nakon drugog takvog spella u potezu.
- 2026-08-11: `Blame Game` je uklonjen iz aktivnog seta; ostaje 20 certifikovanih deckova.
- 2026-08-11: Uvedeni centralni action stage, pravi priority pass krugovi, APNAP trigger ordering, end-step/combat/full stop profili i vidljivi combat assignment/damage efekti.
- 2026-08-11: Zatvorene sve označene i naknadno pronađene aproksimacije aktivnih deckova, uključujući Goat, Erestor, Graywater Encore, Bloodcaster, Dead Before Sunrise, Spree, Foundry, Brewmaster, Vraska, Mirror Entity, Celeborn, Galadhrim Ambush i Lethal Scheme.
- 2026-08-11: Test gate je 31/31 zelen, uključujući po jednu determinističku četveroigračku partiju za svaki od 20 deckova; strict certifikacija je 1722/1722.
- 2026-08-11: Playwright desktop tok je ručno pregledan kroz 26 poteza bez browser grešaka. Tastatura sada može birati karte i potvrditi Proceed/reveal modale.
- 2026-08-11: Commit `e4d7c03` je pushovan na `codex/desktop-commander-overhaul`; Vercel produkcija je dostigla `READY`, alias `https://mtg-commander-simulator.vercel.app` vraća HTTP 200, a svi stvarni JS/CSS asseti su dostupni.
- 2026-08-11: Produkcijski Chromium smoke je na javnom aliasu izabrao `Most Wanted`, pokrenuo četveroigračku partiju do mulligana i završio bez console/page grešaka.
