import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Démarrer le gestionnaire In-App Purchase (StoreKit 2). Charge les
        // produits Premium et écoute les Transaction.updates pour traiter
        // les renouvellements automatiques.
        if #available(iOS 15.0, *) {
            IAPManager.shared.start()
        }
        return true
    }

    // MARK: UISceneSession Lifecycle
    //
    // On ne fournit volontairement PAS d'override de
    // `application(_:configurationForConnecting:options:)`. Le comportement
    // par défaut d'UIKit est de chercher la configuration dans la clé
    // `UISceneConfigurations` de l'Info.plist. Notre Info.plist ne déclare
    // que `UIWindowSceneSessionRoleApplication` — donc iOS ne crée une
    // scène que pour la fenêtre principale iPad. Pour un écran externe
    // (Apple TV / HDMI), aucun rôle n'est configuré, ce qui force iOS à
    // basculer sur le miroir système : la TV recopie l'iPad au lieu
    // d'avoir sa propre scène / WebView désynchronisée.

    func application(
        _ application: UIApplication,
        didDiscardSceneSessions sceneSessions: Set<UISceneSession>
    ) {
        // No-op
    }
}
