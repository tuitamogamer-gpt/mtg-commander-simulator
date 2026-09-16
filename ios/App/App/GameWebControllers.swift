import Capacitor
import UIKit
import WebKit

// Capacitor serves bundled ES modules, media and local storage at capacitor://localhost.
// The online view uses the HTTPS origin directly so existing secure cookies and sockets work.
@MainActor
final class OfflineGameController: CAPBridgeViewController {
    private let session: GameSession
    private var navigation: GameNavigationDelegate?
    private var exports: GameExportBridge?

    init(session: GameSession) { self.session = session; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("Use init(session:)") }

    override func capacitorDidLoad() {
        guard let webView else { return }
        session.webView = webView
        let navigation = GameNavigationDelegate(session: session, upstream: webView.navigationDelegate)
        self.navigation = navigation
        webView.navigationDelegate = navigation
        exports = GameExportBridge.install(on: webView, presenter: self)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 7 / 255, green: 9 / 255, blue: 12 / 255, alpha: 1)
        webView.scrollView.bounces = false
    }

    func stop() { webView?.stopLoading(); exports?.uninstall(); session.webView = nil }
}

@MainActor
final class OnlineGameController: UIViewController {
    private let session: GameSession
    private var gameWebView: WKWebView?
    private var navigation: GameNavigationDelegate?
    private var dialogs: GameDialogDelegate?
    private var exports: GameExportBridge?

    init(session: GameSession) { self.session = session; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("Use init(session:)") }

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: configuration)
        let navigation = GameNavigationDelegate(session: session)
        let dialogs = GameDialogDelegate(presenter: self)
        self.navigation = navigation
        self.dialogs = dialogs
        self.gameWebView = webView
        webView.navigationDelegate = navigation
        webView.uiDelegate = dialogs
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 7 / 255, green: 9 / 255, blue: 12 / 255, alpha: 1)
        webView.scrollView.bounces = false
        session.webView = webView
        exports = GameExportBridge.install(on: webView, presenter: self)
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        gameWebView?.load(URLRequest(url: GameMode.onlineURL))
    }

    func stop() { gameWebView?.stopLoading(); exports?.uninstall(); session.webView = nil }
}

@MainActor
final class GameNavigationDelegate: NSObject, WKNavigationDelegate {
    private let session: GameSession
    private let upstream: WKNavigationDelegate?

    init(session: GameSession, upstream: WKNavigationDelegate? = nil) {
        self.session = session
        self.upstream = upstream
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let upstream {
            upstream.webView?(webView, decidePolicyFor: action, decisionHandler: decisionHandler)
            return
        }
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "https", url.host == GameMode.onlineURL.host, url.port == nil || url.port == 443 {
            if action.targetFrame == nil { webView.load(URLRequest(url: url)); decisionHandler(.cancel) }
            else { decisionHandler(.allow) }
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated, ["https", "http", "mailto"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        upstream?.webView?(webView, didStartProvisionalNavigation: navigation)
        session.loading = true
        session.failure = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        upstream?.webView?(webView, didFinish: navigation)
        session.loading = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        upstream?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        fail(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        upstream?.webView?(webView, didFail: navigation, withError: error)
        fail(error)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse, http.statusCode >= 400 {
            session.loading = false
            session.failure = "The online service returned an error (\(http.statusCode)). Try again, or return home for offline Solo."
            decisionHandler(.cancel)
        } else { decisionHandler(.allow) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        session.loading = false
        session.failure = "iOS closed the game to free memory. Reload to open a new table; unsaved progress may have been lost."
    }

    private func fail(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        session.loading = false
        session.failure = session.mode == .online
            ? "Check your connection and try again. Offline Solo remains available from Home."
            : "The installed game files could not load. Try reloading the table."
    }
}

// The game uses confirm and prompt for deck removal, mana, counters and Judge tools.
@MainActor
final class GameDialogDelegate: NSObject, WKUIDelegate {
    private weak var presenter: UIViewController?
    init(presenter: UIViewController) { self.presenter = presenter }

    private func present(_ alert: UIAlertController) -> Bool {
        guard let presenter, presenter.viewIfLoaded?.window != nil, presenter.presentedViewController == nil else { return false }
        presenter.present(alert, animated: true)
        return true
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "Commander", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        if !present(alert) { completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "Commander", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
        if !present(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: "Commander", message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText; $0.autocorrectionType = .no }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "Apply", style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text) })
        if !present(alert) { completionHandler(nil) }
    }
}
