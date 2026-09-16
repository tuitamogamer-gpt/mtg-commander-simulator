import UIKit
import WebKit

@MainActor
final class GameExportBridge: NSObject, WKScriptMessageHandlerWithReply {
    private weak var presenter: UIViewController?
    private weak var webView: WKWebView?
    private let handlerName = "commanderExport"

    static func install(on webView: WKWebView, presenter: UIViewController) -> GameExportBridge {
        let bridge = GameExportBridge()
        bridge.presenter = presenter
        bridge.webView = webView
        let controller = webView.configuration.userContentController
        controller.addScriptMessageHandler(bridge, contentWorld: .page, name: bridge.handlerName)
        if let url = Bundle.main.url(forResource: "NativeExports", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        return bridge
    }

    func uninstall() {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: handlerName, contentWorld: .page)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        let local = origin.protocol == "capacitor" && origin.host == "localhost"
        let hosted = origin.protocol == "https" && origin.host == GameMode.onlineURL.host && (origin.port == 0 || origin.port == 443)
        guard message.frameInfo.isMainFrame, local || hosted,
              let body = message.body as? [String: Any],
              let text = body["text"] as? String,
              let filename = body["filename"] as? String,
              filename.lowercased().hasSuffix(".json"),
              let data = text.data(using: .utf8), data.count <= 8 * 1024 * 1024,
              (try? JSONSerialization.jsonObject(with: data)) != nil else {
            replyHandler(nil, "Only JSON game exports up to 8 MB can be shared.")
            return
        }
        guard let presenter, presenter.viewIfLoaded?.window != nil, presenter.presentedViewController == nil else {
            replyHandler(nil, "Close the current dialog and export again.")
            return
        }
        let safeName = String(filename.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || "-_.".unicodeScalars.contains($0) ? String($0) : "_" }.joined().suffix(120))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("commander-\(UUID().uuidString)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let file = directory.appendingPathComponent(safeName)
            try data.write(to: file, options: .atomic)
            let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = presenter.view
            share.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
            share.completionWithItemsHandler = { _, completed, _, error in
                try? FileManager.default.removeItem(at: directory)
                replyHandler(["shared": completed], error?.localizedDescription)
            }
            presenter.present(share, animated: true)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            replyHandler(nil, "The export could not be prepared. Please try again.")
        }
    }
}
