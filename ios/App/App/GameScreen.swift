import Observation
import SwiftUI
import WebKit

@MainActor @Observable
final class GameSession {
    let mode: GameMode
    var loading = true
    var failure: String?
    weak var webView: WKWebView?

    init(mode: GameMode) { self.mode = mode }

    func reload() {
        failure = nil
        loading = true
        guard let webView else { return }
        if webView.url == nil, mode == .online {
            webView.load(URLRequest(url: GameMode.onlineURL))
        } else {
            webView.reload()
        }
    }
}

struct GameScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("keepTableAwake") private var keepTableAwake = true
    @State private var session: GameSession
    @State private var pendingAction: TableAction?

    private enum TableAction: String, Identifiable {
        case home, reload
        var id: String { rawValue }
    }

    init(mode: GameMode) { _session = State(initialValue: GameSession(mode: mode)) }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { pendingAction = .home } label: { Label("Home", systemImage: "chevron.left") }
                    .frame(minHeight: 44).accessibilityIdentifier("table-home")
                Spacer()
                Text(session.mode.title).font(.subheadline.weight(.semibold))
                Spacer()
                Button { pendingAction = .reload } label: { Image(systemName: "arrow.clockwise").frame(width: 44, height: 44) }
                    .accessibilityLabel("Reload table")
            }
            .padding(.horizontal, 12).background(CommanderTheme.surface)
            ZStack {
                GameWebView(session: session)
                if session.loading && session.failure == nil {
                    VStack(spacing: 14) {
                        ProgressView().controlSize(.large)
                        Text("Opening your table…").font(.headline)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(CommanderTheme.background)
                }
                if let failure = session.failure {
                    ContentUnavailableView {
                        Label("The table could not open", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(failure)
                    } actions: {
                        Button("Try again") { session.reload() }.buttonStyle(.borderedProminent)
                        Button("Return home") { dismiss() }.buttonStyle(.bordered)
                    }
                    .background(CommanderTheme.background)
                }
            }
        }
        .background(CommanderTheme.background)
        .tint(CommanderTheme.copper)
        .interactiveDismissDisabled()
        .confirmationDialog("Leave the current table?", isPresented: Binding(
            get: { pendingAction != nil }, set: { if !$0 { pendingAction = nil } }
        ), titleVisibility: .visible, presenting: pendingAction) { action in
            Button(action == .home ? "Return home" : "Reload table", role: .destructive) {
                if action == .home { dismiss() } else { session.reload() }
                pendingAction = nil
            }
            Button("Keep playing", role: .cancel) { pendingAction = nil }
        } message: { _ in
            Text("Unsaved progress will be lost. Leaving a Live table can disconnect other players. Save a Solo checkpoint in the online game first if you want to continue later.")
        }
        .onAppear { updateIdleTimer() }
        .onChange(of: scenePhase) { _, _ in updateIdleTimer() }
        .onChange(of: keepTableAwake) { _, _ in updateIdleTimer() }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private func updateIdleTimer() {
        UIApplication.shared.isIdleTimerDisabled = keepTableAwake && scenePhase == .active
    }
}

struct GameWebView: UIViewControllerRepresentable {
    let session: GameSession

    func makeUIViewController(context: Context) -> UIViewController {
        if session.mode == .solo { return OfflineGameController(session: session) }
        return OnlineGameController(session: session)
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {}

    static func dismantleUIViewController(_ controller: UIViewController, coordinator: ()) {
        (controller as? OfflineGameController)?.stop()
        (controller as? OnlineGameController)?.stop()
    }
}
