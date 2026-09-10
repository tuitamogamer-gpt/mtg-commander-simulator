# Mobilni Command Table — 10. 9. 2026.

## Izmjene

- Mobilni fokus prati novog aktivnog protivnika, uključujući dodatni potez istog igrača. Ručni izbor vrijedi do sljedećeg poteza; desktop zadržava ručni fokus.
- Kratki ekrani prikazuju jedan battlefield. Dodir protivnikovog mjesta otvara njegov board, a Mine vlastiti. Početak vlastitog poteza vraća vlastiti board.
- Landscape telefoni prikazuju hand pored battlefielda. Kontrole, aktivni potez i odabrani board imaju jasne oznake.
- Guste mobilne battlefield linije skrolaju horizontalno. Vertikalni potez preko karata vodi do resursa. Pozicije skrola ostaju sačuvane tokom renderovanja.
- Table prikaz skrola kroz sve protivnike. Dodir običnog zaglavlja otvara detalje umjesto skrivenog sažimanja boarda; izbor mete zadržava postojeće kontrole.

## Provjere

- `node --test tests/command-table.test.mjs tests/responsive-client-v3.test.mjs`: 18/18 prolazi.
- `npm.cmd run check`, direktne provjere sintakse izmijenjenih JS datoteka i `git diff --check`: prolaze.
- `tests/browser/command-table.mjs`: svih šest grupa prolazi, bez browser grešaka ili neuspjelih zahtjeva. Uključuje promjene poteza, ručni izbor, eliminaciju, promjenu veličine ekrana, stvarne touch događaje, izbor vlastite/protivničke mete na 320 px i odgovor na Stack.
- `tests/browser/mobile-table-view.mjs`: svih sedam grupa prolazi, bez browser grešaka ili neuspjelih zahtjeva. Uključuje stvarnu seeded Solo partiju, igranje landa nakon navigacije te normalan, prazan i velik hand.
- Browser provjere koriste lokalni Chrome kroz Playwright, uz emulirani dodir. Provjerene veličine uključuju 320×568, 390×660/720/844, 430×932, 667×375, 767×900, 820×1180, 844×390, 1024×900 i 1440×1000/1024.

Snimci i JSON rezultati na ovom računaru nalaze se u `.local/mobile-final/` i `.local/mobile-layout-final/`.

Za naknadni commit, push i produkcijsku objavu korisnik je izričito zatražio da se testovi ne pokreću ponovo. Objava koristi prethodno zabilježene rezultate iznad; završna provjera potvrđuje deployment i objavljenu reviziju.

## Postojeći problem u širem UI testu

`tests/browser/arena-refresh.mjs` prolazi provjere zadržavanja DOM elemenata, skrola, izbora mete i Stack odgovora, zatim pada na tvrdnji da zatvaranje ponovo renderovanog card sheeta vraća fokus na isti hand kontrolni element.

Isti pad je reprodukovan sa originalnim `command-table.js`, `arena-render.js` i `command-table.css` iz početnog `HEAD`, posluženim kroz izolovanu browser probu. Problem vraćanja fokusa ostaje neriješen; ovaj širi UI paket nije potpuno prolazan. Dokazi su u `.local/mobile-refresh-after/` i `.local/mobile-refresh-baseline/`. Cijeli paket mehanika nije pokretan za ovu izmjenu prikaza.
