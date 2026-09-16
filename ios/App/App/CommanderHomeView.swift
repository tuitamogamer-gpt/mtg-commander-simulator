import SwiftUI

enum CommanderTheme {
    static let background = Color(red: 7 / 255, green: 9 / 255, blue: 12 / 255)
    static let surface = Color(red: 19 / 255, green: 24 / 255, blue: 30 / 255)
    static let copper = Color(red: 240 / 255, green: 171 / 255, blue: 112 / 255)
}

enum GameMode: String, Identifiable {
    case solo, online
    var id: String { rawValue }
    var title: String { self == .solo ? "Offline Solo" : "Commander Online" }
    static let onlineURL = URL(string: "https://mtg-commander-simulator.vercel.app/")!
}

struct CommanderHomeView: View {
    @State private var selectedGame: GameMode?

    var body: some View {
        TabView {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        hero
                        VStack(spacing: 14) {
                            modeButton(.solo, title: "Play solo", subtitle: "Your deck. Your pace. No connection needed.", icon: "sparkles", prominent: true)
                            modeButton(.online, title: "Play online", subtitle: "Accounts, cloud saves and private Live tables.", icon: "person.2.fill", prominent: false)
                        }
                        Label("The complete game, always at your table.", systemImage: "square.stack.3d.up")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Text("Offline and online libraries are stored separately. A running guest game stays in memory while the app is open.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: 680)
                    .padding(24)
                    .frame(maxWidth: .infinity)
                }
                .background(CommanderTheme.background)
                .navigationTitle("Commander")
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Text("SIMULATOR").font(.caption2.weight(.bold)).tracking(2).foregroundStyle(CommanderTheme.copper) } }
            }
            .tabItem { Label("Play", systemImage: "suit.diamond.fill") }
            NavigationStack { CommanderGuideView() }
                .tabItem { Label("Guide", systemImage: "book.closed") }
            NavigationStack { CommanderSettingsView() }
                .tabItem { Label("Settings", systemImage: "slider.horizontal.3") }
        }
        .tint(CommanderTheme.copper)
        .fullScreenCover(item: $selectedGame) { mode in GameScreen(mode: mode) }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack(alignment: .bottomLeading) {
                Image("TableArtwork").resizable().scaledToFill()
                    .frame(height: 220).clipped()
                LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                Text("YOUR SEAT IS WAITING")
                    .font(.caption.weight(.bold)).tracking(2).padding(20)
            }
            .frame(height: 220).clipShape(RoundedRectangle(cornerRadius: 24))
            Text("Your deck.\nYour legend.")
                .font(.largeTitle.weight(.bold)).foregroundStyle(CommanderTheme.copper)
                .accessibilityAddTraits(.isHeader)
            Text("Build your pod, outplay the table, and make the next great Commander story yours.")
                .font(.body).foregroundStyle(.secondary)
        }
    }

    private func modeButton(_ mode: GameMode, title: String, subtitle: String, icon: String, prominent: Bool) -> some View {
        Button { selectedGame = mode } label: {
            HStack(spacing: 16) {
                Image(systemName: icon).font(.title2).frame(width: 32)
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.title3.weight(.semibold))
                    Text(subtitle).font(.subheadline)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right")
            }
            .padding(20).frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(prominent ? CommanderTheme.background : .white)
            .background(prominent ? CommanderTheme.copper : CommanderTheme.surface, in: RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("play-\(mode.rawValue)")
    }
}

struct CommanderGuideView: View {
    var body: some View {
        List {
            Section("Your first table") {
                guideRow("1", "Choose a deck", "Open Play solo, explore the library and choose a commander. The deck guide explains its game plan.")
                guideRow("2", "Build your pod", "Pick one to three AI opponents, difficulty and preferred rules. Keep or mulligan your opening hand.")
                guideRow("3", "Play at your pace", "Tap a card to inspect it. Use the action buttons to play lands, cast spells and pass priority. HOLD lets you stop at the next priority window.")
                guideRow("4", "Review what happened", "The stack and effect reviews explain the result. Tap Proceed when you are ready to continue.")
            }
            Section("On iPhone and iPad") {
                Label("Rotate to landscape for more room on the battlefield.", systemImage: "rotate.right")
                Label("Use the game's display settings for reduced motion, contrast and audio.", systemImage: "accessibility")
                Label("Home and Reload ask before closing an active table.", systemImage: "exclamationmark.circle")
            }
            Section("Online play") {
                Text("Play online uses the existing hosted game. Sign in there for cloud saves and synced decks. Private multiplayer is in testing and requires an internet connection.")
                Text("Keep the host app visible during Live games. iOS may suspend the game in the background; there is no host migration.")
            }
            Section("Saving") {
                Text("Offline imported decks, favorites and settings stay on this installation. A guest match is not a durable checkpoint: closing the table or iOS reclaiming its memory can end it. Use the online account's Save & Continue for a cloud checkpoint.")
                Text("Debug snapshots replay the setup from turn one. They are not midgame saves. JSON exports open the iOS share sheet so you can save them to Files.")
            }
        }
        .navigationTitle("Field guide")
    }

    private func guideRow(_ number: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text(number).font(.headline).foregroundStyle(CommanderTheme.copper).frame(width: 24)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }.padding(.vertical, 6)
        }
    }
}

struct CommanderSettingsView: View {
    @AppStorage("keepTableAwake") private var keepTableAwake = true

    var body: some View {
        Form {
            Section {
                Toggle("Keep screen awake at the table", isOn: $keepTableAwake)
            } footer: { Text("Applies while a game is visible. Your normal screen timeout returns when you leave the table or background the app.") }
            Section("Game settings") {
                Text("Audio, motion, contrast, AI styles and gameplay controls are available inside the game's menu.")
            }
            Section("Data and support") {
                Link("Data and account information", destination: URL(string: "https://github.com/tuitamogamer-gpt/mtg-commander-simulator/blob/main/docs/data-and-accounts.md")!)
                Link("Report a game issue", destination: URL(string: "https://github.com/tuitamogamer-gpt/mtg-commander-simulator/issues")!)
                Text("Offline Solo does not require an account. Online uses the existing service and stores its session in this app. Safari's session and local libraries are separate.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Commander Simulator") {
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
                Text("Unofficial fan content. Not approved or endorsed by Wizards of the Coast. Portions of the materials are property of Wizards of the Coast. © Wizards of the Coast LLC.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
    }
}

#Preview { CommanderHomeView().preferredColorScheme(.dark) }
