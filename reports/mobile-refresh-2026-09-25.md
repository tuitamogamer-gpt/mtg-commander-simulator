# Mobilni prikaz — 25. 9. 2026.

## Promjene

- **Hand** je novi mobilni prikaz cijele ruke u mreži. Koristi postojeće karte i njihove akcije; navigacija ne odgovara na odluke enginea.
- **View all / Back to board** povezuje ruku i battlefield. Broj karata je vidljiv u navigaciji, a sve destinacije imaju `aria-pressed`.
- Na stolu su sortiranje i naslov ruke iznad karata, pa karte koriste cijelu širinu. U landscape prikazu veličina proširenih karata prati dostupnu visinu.
- U landscape Hand prikazu suspend/egzil zona je sa strane, tako da cijela karta ostaje vidljiva. Prazna ruka ima čitljivu poruku u sredini prikaza.
- Glavna odluka i donja navigacija ostaju izvan prostora za skrolanje ruke. Nova odluka zadržava postojeći automatski povratak na Mine.
- Mobilna priprema ima kraće zaglavlje, veće čitljive oznake koraka i sažetije preset opcije. Biblioteka drži rezultate i pretragu pri vrhu, a sortiranje i Grid/Compact otvara kroz Filters.
- Početna stranica ističe Play solo preko pune širine; biblioteka i igra s prijateljima su odmah ispod.
- Novi `src/mobile.css` je učitan iza postojećih stilova i ograničen na mobilne širine. Desktop zadržava svoj raspored.

## Provjere

- `npm.cmd run check`: prolazi.
- `git diff --check`: prolazi.
- `node --test tests/command-table.test.mjs tests/player-tools.test.mjs tests/arena-tools.test.mjs tests/responsive-client-v3.test.mjs tests/ios-package.test.mjs`: **31/31 prolazi**.
- Dodana je izvršna regresijska provjera da promjena mobilnog prikaza zadržava istu neodgovorenu odluku i iste objekte karata. Provjera nove odluke sada kreće iz prikaza Hand.
- Browser provjera kroz Codexov preglednik: Mine, Table, Hand i Stack na 320×568, 390×844, 430×932, 820×1180 i 844×390. Nema horizontalnog prelijevanja; navigacija i odluka ostaju unutar ekrana. Između 20 kombinacija zadržani su isti identiteti karata i tekst odluke.
- Povratak iz sva četiri mobilna prikaza provjeren je i na 1024 i 1440 px: desktop prikazuje ruku i battlefield, skriva mobilnu navigaciju i ne prelijeva stranicu.
- `suspendVisibility` fixture provjeren je na 844×390, 667×375, 320×568 i 390×844: suspend zona je dostupna, cijela karta staje u ruku, a odluka je vidljiva ispod. `battlefieldLayout` korišten je za pregled gustog battlefielda i prazne ruke.
- U stvarnoj Solo partiji, Quick Draw, seed 11081: Island je odigran iz Hand prikaza kroz uobičajeni card sheet. Broj karata se smanjio s 8 na 7, Island se pojavio među resursima i pogled se vratio na Mine.
- U pripremi su provjereni pretraga, filter boje, sortiranje, Compact/Grid, Deck Spotlight, Build this pod, Learn a deck i Review. Preset je prenesen u završni pregled kao jedan AI i easy težina.
- Postojeća skripta `tests/browser/mobile-table-view.mjs` proširena je za Hand, praznu/veliku ruku i povratak na desktop. Ta Playwright skripta nije izvršavana u ovoj sesiji; gore su navedene zasebno izvršene provjere.

## Pregled toka

1. **Početna stranica:** glavna Solo akcija je jasna i dostupna; alternativni načini rada su odmah ispod.
2. **Biblioteka:** funkcionalni filteri, sortiranje i izbor decka; sažetije zaglavlje oslobađa prostor.
3. **Pod i Review:** preset mijenja stvarne postavke, a nastavak ostaje dostupan pri dnu.
4. **Stol i ruka:** četiri odvojena mobilna prikaza; karte imaju originalne akcije i odluka ostaje na ekranu.
5. **Card sheet:** igranje landa iz proširene ruke provjereno do rezultata na stolu.

Aktuelni snimci i mjerenja na ovom računaru su u `.local/mobile-refresh/`. Početni snimci s porta 8000 nisu korišteni za numeričko poređenje: preglednik je imao staru predmemoriju. Provjere izmjena koriste lokalni pregled na portu 8001 bez predmemorije.

Provjere su rađene u Chromium pregledniku s promjenom viewporta. Nisu zamjena za provjeru na fizičkom telefonu, Safari tipkovnice ili cijele Live partije. Gore su rezultati provjere implementacije prije objave; šire provjere i produkcijski deployment bilježe se zasebno u lokalnoj evidenciji objave.
