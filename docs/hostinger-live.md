# Commander Live na Hostinger VPS-u

Uputstvo za selidbu servera za Live sobe (multiplejer) sa Vercel funkcije na
stalno uključen server. Sve što je potrebno već je u repozitorijumu, u
`deploy/hostinger/`. Engleski opis arhitekture je u [deployment.md](deployment.md).

## Šta se seli, a šta ostaje

| Deo | Sada | Posle selidbe |
| --- | --- | --- |
| Stranica igre (`index.html`, `src/`, `assets/`) | Vercel | Vercel, bez promene |
| Solo igra i AI | pregledač igrača | bez promene |
| Nalozi i sačuvane partije (`/api/account`) | Vercel funkcija | Vercel funkcija, bez promene |
| **Live sobe (`/api/ws`, WebSocket)** | Vercel funkcija | **Hostinger VPS** |
| **Skladište soba** | spoljni Redis ili PostgreSQL | **Redis na istom VPS-u** |

Link za poziv, adresa stranice i identitet mesta za stolom ostaju isti. Menja se
samo adresa na koju se pregledač povezuje za sobu.

Šta se dobija:

- Veza više nema ograničenje trajanja. Na Vercel-u funkcija živi najviše 300
  sekundi (`vercel.json`), pa se svaka veza posle toga mora ponovo uspostaviti.
- Sobe više ne zavise od kvote spoljnog skladišta. Redis je na istom serveru.
- Server proverava svaku vezu na 30 sekundi, pa igrač čiji je laptop zaspao
  bude označen kao odsutan umesto da ostane „povezan".

Šta se **ne** menja: partiju i dalje vodi pregledač domaćina. Ako domaćin
zatvori ili osveži karticu, partija je izgubljena, kao i do sada.

## Pre početka

Stanje produkcije provereno 21. 11. 2026: `https://www.mtgpod.xyz/api/ws` vraća
503 („Live room storage is unavailable"), a `/api/account` vraća 500. Dakle,
Live trenutno ne radi, pa nema aktivnih soba koje bi selidba prekinula. Nalozi
su odvojen problem (vidi [Šta ovo ne rešava](#šta-ovo-ne-rešava)).

Potrebno je:

1. **Hostinger VPS sa root (SSH) pristupom i Docker-om.** Ovaj servis je Node
   proces, a ne igra koja se pokreće iz Game Panel-a, pa sam panel nije
   potreban. Najjednostavnije je izabrati Ubuntu šablon sa već instaliranim
   Docker-om (ili čist Ubuntu, pa Docker instalirati u koraku 2).
   Ako VPS već ima Game Panel i želiš da ga zadržiš, prvo uradi proveru portova
   iz koraka 2.
2. **Poddomen** za server soba, na primer `live.mtgpod.xyz`, i pristup DNS-u.
3. **Pristup Vercel projektu** (podešavanje promenljivih i novi deploy).

Koliki server: u mirovanju ceo paket troši oko 40 MB memorije (izmereno:
server soba 20 MB, Caddy 13 MB, Redis 4 MB). Redis je ograničen na 512 MB.
Test opterećenja nije rađen, pa ovo nije obećanje o broju igrača; za početak je
dovoljan plan sa 2 GB memorije ili više.

## Korak 1: DNS

Dodaj `A` zapis: `live.mtgpod.xyz` → javna IP adresa VPS-a. Sačekaj da se
proširi pre prvog pokretanja, inače sertifikat ne može da se izda:

```sh
dig +short live.mtgpod.xyz
```

## Korak 2: Priprema VPS-a

Prijavi se preko SSH i proveri da li su portovi 80 i 443 slobodni:

```sh
ss -ltnp | grep -E ':(80|443)\s' || echo "80 i 443 su slobodni"
docker --version && docker compose version
```

- **Slobodni su**: nastavi dalje.
- **Zauzeti su** (obično ih drži panel): sertifikat se automatski izdaje samo
  na standardnim portovima. Tada ili reinstaliraj VPS sa Docker šablonom, ili
  javi koji program drži portove pa da se Caddy zameni pravilom u tom programu.
  `LIVE_HTTP_PORT` i `LIVE_HTTPS_PORT` u `.env` pomeraju Caddy na druge portove,
  ali tada sertifikat moraš obezbediti drugačije.

Ako Docker nije instaliran:

```sh
curl -fsSL https://get.docker.com | sh
```

Otvori portove 22, 80 i 443. Ako je u hPanel-u uključen zaštitni zid za VPS,
dozvoli ih i tamo; ako koristiš `ufw` na samom serveru:

```sh
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

Port 6379 (Redis) i 8787 (server soba) **ne** otvaraj. Nisu objavljeni van
Docker mreže i ne treba da budu.

## Korak 3: Kod i podešavanja

```sh
git clone https://github.com/tuitamogamer-gpt/mtg-commander-simulator.git /opt/commander
cd /opt/commander/deploy/hostinger
cp env.example .env && chmod 600 .env
nano .env
```

Ako je repozitorijum privatan, kloniraj ga preko deploy ključa (GitHub →
Settings → Deploy keys, samo čitanje).

U `.env` proveri dve vrednosti:

| Promenljiva | Vrednost |
| --- | --- |
| `LIVE_DOMAIN` | poddomen iz koraka 1, bez `https://` |
| `LIVE_ALLOWED_ORIGINS` | adrese stranice igre, tačno kako ih pregledač prikazuje: `https://www.mtgpod.xyz,https://mtgpod.xyz` |

Stranice sa bilo kog drugog sajta server odbija. Greška u ovoj listi zaustavlja
server pri pokretanju umesto da tiho otvori ili zatvori pristup.

## Korak 4: Pokretanje

```sh
docker compose up -d --build
docker compose ps
```

Sva tri servisa treba da budu `running`, a `live` i `redis` i `healthy`. Prvo
pokretanje traje minut-dva (preuzimanje slika, izdavanje sertifikata).

Pokreću se tri kontejnera:

- `live`: server soba (isti kod kao na Vercel-u, `api/ws.js`), bez root prava.
- `redis`: skladište soba. Sobe same ističu posle 24 sata; otvorene sobe
  preživljavaju restart servera.
- `caddy`: HTTPS. Sam izdaje i obnavlja sertifikat.

Sve se samo podiže posle restarta VPS-a (`restart: unless-stopped`).

## Korak 5: Provera pre prebacivanja

Na serveru:

```sh
curl --fail-with-body https://live.mtgpod.xyz/api/ws
```

Očekivan odgovor: `{"ok":true,"service":"commander-live","storage":"redis",...}`.

Sa svog računara, iz kopije repozitorijuma, pusti proveru koja se ponaša kao
dva pregledača na stranici igre:

```sh
npm ci
npm run live:smoke -- https://live.mtgpod.xyz --origin https://www.mtgpod.xyz
```

Treba da prođe svih 8 provera: zdravlje, čitanje sa stranice igre, otvaranje
sobe, ulazak drugog igrača, odbijanje tuđeg sajta, odlazak igrača. Provera
otvori jednu probnu sobu koja sama istekne i ništa drugo ne menja.

Dok ovaj korak ne prođe, igrači i dalje koriste staru adresu. Ništa nije
prebačeno.

## Korak 6: Prebacivanje

Na Vercel-u (Project → Settings → Environment Variables), za **Production**:

```
COMMANDER_LIVE_ORIGIN=https://live.mtgpod.xyz
```

Zatim pokreni novi Production deploy. Build upisuje adresu u
`src/live-config.js`; pogrešna vrednost obara build umesto da ode na
produkciju.

Proveri na `https://www.mtgpod.xyz`:

1. Na početnoj strani, u traci sa brojkama, piše „Live rooms online".
2. Otvori sobu („Play with friends"), pa link za poziv otvori u drugom
   pregledaču ili privatnom prozoru. Oba igrača treba da vide lobi.
3. U alatima pregledača (Network → WS) veza ide na `wss://live.mtgpod.xyz/api/ws`.

Kartice otvorene pre deploy-a koriste staru adresu dok se ne osveže.

## Vraćanje na staro

Obriši `COMMANDER_LIVE_ORIGIN` na Vercel-u i pokreni novi deploy. Stranica se
vraća na sopstvenu adresu (`/api/ws` na Vercel-u). VPS može da ostane upaljen;
niko se više ne povezuje na njega. Sobe otvorene na VPS-u ne prelaze nazad.

## Održavanje

| Šta | Kako |
| --- | --- |
| Nova verzija servera | `sh /opt/commander/deploy/hostinger/update.sh` |
| Stanje | `docker compose ps` |
| Dnevnik servera soba | `docker compose logs -f live` |
| Dnevnik HTTPS-a | `docker compose logs -f caddy` |
| Zauzeće | `docker stats --no-stream` |
| Zaustavljanje | `docker compose down` (sobe ostaju sačuvane) |

Šta igrači vide kad se server restartuje (izmereno u probi): veza se zatvori sa
porukom da se servis restartuje, stranica se sama ponovo poveže posle oko 1,5
sekunde, a soba je pauzirana jer su sva mesta zabeležena kao odsutna. Domaćin
nastavlja partiju kad se svi vrate. Sam restart servera traje ispod sekunde.

Server treba ažurirati samo kad se menja kod u `api/ws.js`, `server/` ili
`logic.js`. Izmene stranice (dizajn, karte, pravila u pregledaču) idu samo na
Vercel, kao i do sada.

Nadzor: bilo koji servis za proveru dostupnosti može da gađa
`https://live.mtgpod.xyz/api/ws` i traži HTTP 200. Odgovor je 200 samo kad
server dohvata svoje skladište.

Rezervne kopije nisu potrebne: sobe su privremene i ističu posle 24 sata. Na
ovom serveru nema naloga ni sačuvanih partija.

Dnevnici se sami rotiraju (10 MB × 5 po servisu).

## Kad nešto ne radi

| Pojava | Prvo proveri |
| --- | --- |
| `docker compose up` odmah staje sa porukom o `LIVE_DOMAIN` ili `LIVE_ALLOWED_ORIGINS` | `.env` ne postoji ili je vrednost prazna |
| `live` se stalno restartuje | `docker compose logs live`: neispravna adresa u `LIVE_ALLOWED_ORIGINS` ili skladište nije dostupno |
| Sertifikat se ne izdaje | DNS zapis još ne pokazuje na VPS, ili port 80/443 nije otvoren (hPanel firewall), ili ga drži drugi program |
| Zdravlje radi, a soba ne može da se otvori sa sajta | adresa stranice nije u `LIVE_ALLOWED_ORIGINS` (npr. fali varijanta bez `www`) |
| Na sajtu i dalje piše da Live nije dostupan | `COMMANDER_LIVE_ORIGIN` nije postavljen za Production, ili deploy nije ponovljen posle izmene |
| Novi igrači dobijaju odbijanje, postojeći igraju | dostignut `LIVE_MAX_CONNECTIONS`; povećaj ga u `.env`, pa `docker compose up -d` |
| Soba „ne postoji ili je istekla" | prošla su 24 sata bez izmena, ili je obrisan Redis volumen (`docker compose down -v`) |

## Šta ovo ne rešava

- **Nalozi.** `/api/account` ostaje na Vercel-u i zavisi od svog skladišta, koje
  trenutno vraća grešku. Prijava, sačuvane Solo partije i biblioteka špilova
  vezana za nalog neće proraditi ovom selidbom. Nalozi čuvaju trajne podatke
  igrača, pa njihova selidba traži prenos podataka i rezervne kopije; to je
  poseban posao.
- **Gubitak partije kad domaćin zatvori karticu.** Server čuva sobu i poglede
  igrača, ne celu partiju.
- **Zaštita od varanja.** Domaćinov pregledač vodi partiju, kao i do sada; Live
  je namenjen stolovima kojima veruješ.
