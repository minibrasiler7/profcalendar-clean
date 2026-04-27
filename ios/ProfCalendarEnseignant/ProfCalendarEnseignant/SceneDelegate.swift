import UIKit

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
    }

    func sceneDidDisconnect(_ scene: UIScene) {}
    func sceneDidBecomeActive(_ scene: UIScene) {}
    func sceneWillResignActive(_ scene: UIScene) {}
    func sceneWillEnterForeground(_ scene: UIScene) {}
    func sceneDidEnterBackground(_ scene: UIScene) {}
}
