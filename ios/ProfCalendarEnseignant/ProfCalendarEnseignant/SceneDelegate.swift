import UIKit
import WebKit

// MARK: - Scene Navigation Sync
//
// Bus interne pour synchroniser la navigation entre :
//   • la scène iPad (WebViewController complet)
//   • une éventuelle scène sur écran externe (ExternalDisplayViewController)
//
// Fonctionne via NotificationCenter pour rester découplé des deux types de
// view controllers. Stocke aussi la dernière URL connue, ce qui permet à la
// scène externe de démarrer directement sur la page actuelle de l'iPad
// plutôt que sur l'écran de login.

enum SceneNavigationSync {
    static let notificationName = Notification.Name("ProfCalendarSceneNavigationSync")
    static private(set) var lastURL: URL?

    static func broadcast(url: URL, from sender: AnyObject) {
        lastURL = url
        NotificationCenter.default.post(
            name: notificationName,
            object: sender,
            userInfo: ["url": url]
        )
    }
}

// MARK: - External Display View Controller
//
// WKWebView plein écran pour l'écran externe (TV via HDMI / Apple TV).
// Pas de barre de statut réservée, pas de safe area, pas de PencilKit,
// pas de pull-to-refresh, pas d'upload de fichiers. Juste du contenu web
// zoomé pour être lisible depuis le fond de la classe.

final class ExternalDisplayViewController: UIViewController, WKNavigationDelegate {

    private let baseURLString = "https://profcalendar.org/auth/login"
    private let hostName = "profcalendar.org"
    private var webView: WKWebView!
    private var navSyncObserver: NSObjectProtocol?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupWebView()
        observeNavigationSync()
        loadInitialURL()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        adjustPageZoomForScreenSize()
    }

    deinit {
        if let observer = navSyncObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    override var prefersStatusBarHidden: Bool { return true }
    override var prefersHomeIndicatorAutoHidden: Bool { return true }

    // MARK: - Dynamic scaling
    //
    // Le site est dessiné pour une viewport iPad (~1024 pt landscape).
    // Sur une TV FHD on a typiquement ~1920 pt de large, sur 4K ~3840 pt.
    // On calcule dynamiquement un pageZoom pour que le contenu remplisse
    // la TV au lieu d'apparaître minuscule.

    private let referenceViewportWidth: CGFloat = 1024
    private let minZoom: CGFloat = 1.0
    private let maxZoom: CGFloat = 3.0

    private func adjustPageZoomForScreenSize() {
        guard let webView = webView else { return }
        let availableWidth = view.bounds.width
        guard availableWidth > 0 else { return }
        let rawZoom = availableWidth / referenceViewportWidth
        let clamped = max(minZoom, min(maxZoom, rawZoom))
        if abs(webView.pageZoom - clamped) > 0.01 {
            webView.pageZoom = clamped
        }
    }

    // MARK: - Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        let existingUA = webView.value(forKey: "userAgent") as? String ?? ""
        webView.customUserAgent = existingUA + " ProfCalendarApp-iOS/1.0 ExternalDisplay"

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func observeNavigationSync() {
        navSyncObserver = NotificationCenter.default.addObserver(
            forName: SceneNavigationSync.notificationName,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let sender = notification.object as AnyObject?,
                  sender !== self,
                  let url = notification.userInfo?["url"] as? URL,
                  self.webView?.url?.absoluteString != url.absoluteString else {
                return
            }
            self.webView.load(URLRequest(url: url))
        }
    }

    private func loadInitialURL() {
        let initialURL = SceneNavigationSync.lastURL ?? URL(string: baseURLString)!
        webView.load(URLRequest(url: initialURL))
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        injectTVStyling()
        // Une scène externe peut aussi avoir navigué (via un redirect 302 par
        // exemple). On re-broadcaste pour que l'iPad suive.
        if let url = webView.url, !url.absoluteString.isEmpty {
            SceneNavigationSync.broadcast(url: url, from: self)
        }
    }

    /// Marque la page comme "mode TV" pour d'éventuelles règles CSS
    /// spécifiques côté serveur. Le scaling lui-même passe par
    /// webView.pageZoom (voir adjustPageZoomForScreenSize).
    private func injectTVStyling() {
        let js = """
        (function() {
            if (window.__profCalendarTVMode) return;
            window.__profCalendarTVMode = true;
            document.documentElement.dataset.profcalendarTvMode = 'true';
            document.body && (document.body.style.backgroundColor = '#000');
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

// MARK: - Scene Delegate

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)

        let rootVC: UIViewController
        if session.role == .windowApplication {
            // Scène iPad : WebViewController complet (PencilKit, upload, etc.)
            let webVC = WebViewController()
            let navController = UINavigationController(rootViewController: webVC)
            navController.setNavigationBarHidden(true, animated: false)
            rootVC = navController
        } else {
            // Scène secondaire (écran externe / AirPlay étendu / Stage Manager) :
            // version simplifiée pleine TV.
            rootVC = ExternalDisplayViewController()
        }

        window.rootViewController = rootVC
        self.window = window
        window.makeKeyAndVisible()
    }

    func sceneDidDisconnect(_ scene: UIScene) {}
    func sceneDidBecomeActive(_ scene: UIScene) {}
    func sceneWillResignActive(_ scene: UIScene) {}
    func sceneWillEnterForeground(_ scene: UIScene) {}
    func sceneDidEnterBackground(_ scene: UIScene) {}
}
