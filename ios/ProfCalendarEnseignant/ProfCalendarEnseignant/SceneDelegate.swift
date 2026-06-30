import UIKit
import StoreKit

// MARK: - Scene Delegate
//
// Mode "mirror" simple : avec UIApplicationSupportsMultipleScenes = false
// (cf. Info.plist), iOS recopie la scène iPad sur l'écran externe (Apple TV
// / HDMI) au lieu d'en créer une distincte. Ça garantit que l'écran externe
// affiche EXACTEMENT ce qu'il y a sur l'iPad — y compris les modals JS comme
// le lecteur PDF — au prix d'éventuelles bandes noires si le ratio iPad ne
// correspond pas au ratio de la TV. (Recommandation : tenir l'iPad en
// landscape pour minimiser ces bandes.)

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        let webVC = WebViewController()
        let nav = UINavigationController(rootViewController: webVC)
        nav.setNavigationBarHidden(true, animated: false)
        window.rootViewController = nav
        self.window = window
        window.makeKeyAndVisible()

        // Sollicitation d'avis App Store (après plusieurs ouvertures).
        Self.maybeRequestReview(in: windowScene)
    }

    // MARK: - Demande d'avis App Store
    //
    // Bonne pratique Apple : solliciter un avis seulement après que
    // l'utilisateur a montré de l'engagement (plusieurs ouvertures de l'app),
    // jamais au tout premier lancement, et au plus une fois par version. iOS
    // limite de toute façon l'affichage réel (≤ 3 fois / 365 jours) et ne
    // garantit pas l'apparition de la fenêtre. Idéalement, on pourra plus tard
    // déclencher ceci sur un « moment positif » signalé par l'app web via le
    // pont JS, plutôt que sur le simple compteur de lancements.
    private static func maybeRequestReview(in scene: UIWindowScene) {
        let defaults = UserDefaults.standard
        let countKey = "reviewLaunchCount"
        let versionKey = "reviewLastVersion"

        let count = defaults.integer(forKey: countKey) + 1
        defaults.set(count, forKey: countKey)

        let version = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? ""
        let alreadyAskedThisVersion = defaults.string(forKey: versionKey) == version

        guard count >= 4, !alreadyAskedThisVersion else { return }

        // Léger délai pour laisser l'interface s'afficher avant la pop-up système.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak scene] in
            guard let scene = scene else { return }
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: scene)
            } else if #available(iOS 14.0, *) {
                SKStoreReviewController.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview()
            }
            defaults.set(version, forKey: versionKey)
        }
    }

    func sceneDidDisconnect(_ scene: UIScene) {}
    func sceneDidBecomeActive(_ scene: UIScene) {}
    func sceneWillResignActive(_ scene: UIScene) {}
    func sceneWillEnterForeground(_ scene: UIScene) {}
    func sceneDidEnterBackground(_ scene: UIScene) {}
}
