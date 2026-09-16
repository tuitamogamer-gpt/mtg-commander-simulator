# Commander Simulator za iPhone i iPad

Projekt koristi nativni SwiftUI početni ekran i postojeći JavaScript engine igre u WKWebViewu. Capacitor služi lokalne module, slike, zvuk i video. Minimalni sistem je **iOS/iPadOS 17**, a za kompilaciju je potreban **Mac s Xcodeom 26 ili novijim**.

## Najbrži put: pripremljeni ZIP na Macu

1. Prenesi `dist/commander-ios-mac.zip` na Mac i raspakuj ga.
2. Otvori `ios/App/App.xcodeproj` u Xcodeu. Pusti da Xcode preuzme Capacitor kroz Swift Package Manager. Prvo otvaranje traži internet.
3. Izaberi scheme **App**, zatim iPhone ili iPad simulator i pritisni **Run**.
4. Za svoj iPhone: poveži uređaj, u **App → Signing & Capabilities → Team** izaberi svoj Apple račun/team, zatim izaberi uređaj i **Run**. Ako bundle ID nije dostupan za tvoj team, promijeni `com.tuitamogamer.commandersimulator` u svoj jedinstveni ID.

ZIP već sadrži kompletan web paket i konfiguraciju: za ovaj put nisu potrebni Node, npm ni CocoaPods. Na fizičkom uređaju prati Xcodeove upute za Developer Mode i potpisivanje. ZIP je **izvorni Xcode projekt**, a ne potpisana `.ipa` aplikacija.

## Rad iz Git check-outa

Na Mac prenesi trenutne izmjene ili preuzmi commit koji ih sadrži. Zatim iz korijena repozitorija:

```bash
npm ci
npm run ios:sync
npm run ios:test
bash scripts/verify-ios-mac.sh
npm run ios:open
```

Na Windowsu koristi `npm.cmd` umjesto `npm`. `ios:bundle`, `ios:sync` i JavaScript testovi rade na Windowsu. Xcode, simulator, potpisivanje i `.ipa` export rade na Macu.

`ios:sync` kopira igru iz `dist/ios-web` u `ios/App/App/public`. Ove generirane kopije nisu u Gitu. Ponovi komandu nakon promjene enginea, CSS-a, karti ili medija. Ne pokreći ponovo `cap add ios` preko ovog projekta: prilagođeni SwiftUI ekran i integracije već postoje.

Za novi ZIP pokreni `npm run ios:package` (`npm.cmd run ios:package` na Windowsu). Komanda koristi sistemski `tar` i u arhivu uključuje samo Xcode projekt, ugrađenu igru i upute.

## Šta aplikacija nudi

- **Play solo:** engine, 150 trenutnih precon deckova i postojeći lokalni mediji su u instalaciji. Moguće je igrati bez interneta. Karte bez lokalne slike koriste tekstualni prikaz/fallback; njihov Scryfall artwork traži internet.
- **Play online:** postojeća HTTPS igra, računi, cloud saves i privatni Live. WKWebView zadržava cookies na pravom produkcijskom originu, bez proxyja ili promjena autentifikacije.
- Nativni početni ekran, vodič, postavka da ekran ostane budan i portrait/landscape na iPhoneu/iPadu.
- Potvrda prije povratka kući i reload-a. Vanjski linkovi iz online igre otvaraju se izvan aplikacije.
- JSON debug/AI-skill izvoz kroz iOS share sheet, uključujući **Save to Files**. Uvoz koristi postojeći web file picker.
- Stanje učitavanja, mrežna greška s retry dugmetom i poruka ako iOS ugasi web proces zbog memorije.

Offline i online imaju zasebnu lokalnu pohranu. Podaci iz Safarija se ne uvoze automatski. Guest partija nije trajni lokalni checkpoint: gašenje, reload ili oslobađanje memorije može izgubiti napredak. Za trajni Solo checkpoint koristi online račun i **Save & Continue**. Debug JSON vraća početni setup, ne stanje usred partije.

Live host mora držati aplikaciju aktivnom. iOS može suspendovati JavaScript i socket kad aplikacija ode u pozadinu. Aplikacija ne obećava pozadinsko hostovanje ni migraciju hosta.

## Provjera prije dijeljenja aplikacije

Na Macu provjeri:

1. Build i pokretanje na iPhone i iPad simulatoru; portrait, landscape i safe areas.
2. Solo s isključenim internetom: izbor decka, pod, mulligan, land/spell, inspect, stack i AI potez.
3. Uvoz deckliste, ponovno pokretanje aplikacije i prisutnost biblioteke.
4. JSON izvoz u Files i ponovni uvoz; native confirm/prompt u Judge alatima.
5. Online prijava, cloud save/continue i privatni Live s drugim uređajem.
6. Povratak iz pozadine, gubitak mreže i nativna potvrda izlaska.

Workflow `.github/workflows/ios-build.yml` priprema paket i radi nepotpisani simulator build na macOS-u. Nije zamjena za provjeru na uređaju i ne objavljuje aplikaciju.

Projekt je pripremljen na Windowsu: lokalna provjera JavaScripta/paketa ne potvrđuje da je Swift/Xcode build prošao. Native kompilaciju treba provjeriti na Macu. TestFlight/App Store objava nije izvršena. Za distribuciju pripremi potpisivanje, App Store Connect podatke i provjeri deklaracije privatnosti prema stvarnom servisu. Postojeći backend još nema samostalno brisanje korisničkog računa.

## Struktura

| Putanja | Namjena |
| --- | --- |
| `ios/App/App/CommanderHomeView.swift` | Početni ekran, vodič i postavke |
| `ios/App/App/GameScreen.swift` | Sesija, učitavanje, izlazak i screen timeout |
| `ios/App/App/GameWebControllers.swift` | Lokalni/online WKWebView, navigacija i JS dijalozi |
| `ios/App/App/GameExportBridge.swift` | JSON izvoz i share sheet |
| `mobile/` | Offline prilagodbe ugrađenog web interfejsa |
| `scripts/build-ios-web.mjs` | Paket runtime datoteka bez servera, tajni i radnih fajlova |
| `capacitor.config.json` | App ID i iOS konfiguracija |

Reference: [Capacitor iOS](https://capacitorjs.com/docs/ios), [Swift Package Manager](https://capacitorjs.com/docs/ios/spm), [Apple UIKit integration](https://developer.apple.com/documentation/swiftui/uiviewcontrollerrepresentable), [podaci igre](data-and-accounts.md).
