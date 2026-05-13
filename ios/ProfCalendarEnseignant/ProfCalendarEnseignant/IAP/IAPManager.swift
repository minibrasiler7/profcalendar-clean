//
//  IAPManager.swift
//  ProfCalendarEnseignant
//
//  Gestion des achats In-App (StoreKit 2). Récupère les abonnements
//  configurés dans App Store Connect, lance les flux d'achat, écoute les
//  renouvellements automatiques, et envoie la transaction signée (JWS)
//  au backend Flask pour validation et activation du Premium.
//
//  Workflow d'achat :
//    1. IAPManager.shared.loadProducts() au démarrage de l'app
//    2. Affichage du paywall (PaywallViewController)
//    3. User clique « S'abonner » → IAPManager.shared.purchase(product)
//    4. StoreKit affiche l'écran Apple natif (Face ID / mot de passe)
//    5. À la validation, on récupère `transaction.jwsRepresentation`
//    6. POST /api/iap/validate-transaction avec ce JWS
//    7. Backend vérifie la signature Apple et marque l'user premium
//    8. On reload la WebView pour que l'UI prenne en compte le nouveau statut
//
//  Renouvellements automatiques :
//    - StoreKit envoie les `Transaction.updates` à `listenForTransactions()`
//    - Pour chaque update, on POSTe à /api/iap/validate-transaction
//

import Foundation
import StoreKit

@available(iOS 15.0, *)
final class IAPManager {

    static let shared = IAPManager()

    /// Product IDs configurés dans App Store Connect. Doivent matcher EXACTEMENT.
    static let monthlyProductId = "ch.teacherplanner.teacher.premium.monthly"
    static let annualProductId = "ch.teacherplanner.teacher.premium.annual"
    static let allProductIds: [String] = [monthlyProductId, annualProductId]

    /// Produits chargés depuis l'App Store. Vide tant que `loadProducts()` n'a pas tourné.
    private(set) var products: [Product] = []

    /// Tâche d'écoute des Transaction.updates (renouvellements en arrière-plan).
    private var updateListenerTask: Task<Void, Never>?

    private init() {}

    // MARK: - Démarrage

    /// À appeler dans AppDelegate.application(_:didFinishLaunching). Charge
    /// les produits depuis l'App Store et démarre l'écoute des transactions
    /// pour traiter les renouvellements automatiques.
    func start() {
        Task { @MainActor in
            await self.loadProducts()
        }
        self.updateListenerTask = listenForTransactions()
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - Chargement des produits

    @MainActor
    func loadProducts() async {
        do {
            let loaded = try await Product.products(for: IAPManager.allProductIds)
            self.products = loaded.sorted { (a, b) in
                // Mensuel d'abord, annuel ensuite
                if a.id == IAPManager.monthlyProductId { return true }
                if b.id == IAPManager.monthlyProductId { return false }
                return a.id < b.id
            }
            print("[IAP] Produits chargés: \(self.products.map { $0.id })")
            NotificationCenter.default.post(name: .iapProductsLoaded, object: nil)
        } catch {
            print("[IAP] Erreur loadProducts: \(error)")
        }
    }

    // MARK: - Achat

    /// Lance le flux d'achat StoreKit pour un produit donné. Renvoie un
    /// résultat décrivant si l'achat a réussi (et si le serveur l'a validé),
    /// a été annulé, ou a échoué.
    func purchase(_ product: Product, appAccountToken: UUID? = nil) async -> PurchaseResult {
        do {
            // Options : on passe un UUID lié au user ProfCalendar courant
            // pour qu'Apple le réinjecte dans le JWS (champ appAccountToken).
            // Permet au serveur de vérifier que la transaction appartient
            // bien à cet user même si la session HTTP serait compromise.
            var options: Set<Product.PurchaseOption> = []
            if let token = appAccountToken {
                options.insert(.appAccountToken(token))
            }
            let result = try await product.purchase(options: options)

            switch result {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    // Envoyer le JWS au backend pour activation server-side
                    let ok = await self.submitToBackend(jws: verification.jwsRepresentation)
                    await transaction.finish()
                    return ok ? .success : .backendError("Validation serveur échouée")
                case .unverified(_, let error):
                    return .failed("Transaction non vérifiée par Apple: \(error)")
                }
            case .userCancelled:
                return .cancelled
            case .pending:
                return .pending
            @unknown default:
                return .failed("Résultat inconnu")
            }
        } catch {
            return .failed("Erreur achat: \(error)")
        }
    }

    // MARK: - Restauration

    /// Re-récupère toutes les transactions actives de l'user et les renvoie
    /// au backend. À appeler quand l'utilisateur clique « Restaurer mes achats ».
    func restorePurchases() async -> Int {
        // Synchroniser avec l'App Store (peut demander mot de passe iCloud)
        do {
            try await AppStore.sync()
        } catch {
            print("[IAP] AppStore.sync échoué: \(error)")
        }

        var jwsList: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified = result {
                jwsList.append(result.jwsRepresentation)
            }
        }
        if jwsList.isEmpty { return 0 }

        // Un seul appel /api/iap/restore avec tout
        var restored = 0
        do {
            let url = URL(string: APIBaseURL.shared.absoluteString + "/api/iap/restore")!
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: [
                "signed_transactions": jwsList
            ])
            let (data, _) = try await URLSession.shared.data(for: req)
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let r = json["restored"] as? Int {
                restored = r
            }
        } catch {
            print("[IAP] restorePurchases backend error: \(error)")
        }
        return restored
    }

    // MARK: - Listener (renouvellements en arrière-plan)

    private func listenForTransactions() -> Task<Void, Never> {
        return Task.detached {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    let _ = await self.submitToBackend(jws: result.jwsRepresentation)
                    await transaction.finish()
                }
            }
        }
    }

    // MARK: - HTTP backend

    private func submitToBackend(jws: String) async -> Bool {
        do {
            let url = URL(string: APIBaseURL.shared.absoluteString + "/api/iap/validate-transaction")!
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: [
                "signed_transaction": jws
            ])
            let (data, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let success = json["success"] as? Bool, success {
                    NotificationCenter.default.post(name: .iapPremiumActivated, object: nil)
                    return true
                }
            }
            // Log d'erreur (utile en sandbox)
            let body = String(data: data, encoding: .utf8) ?? ""
            print("[IAP] Backend a refusé: \(body)")
            return false
        } catch {
            print("[IAP] submitToBackend error: \(error)")
            return false
        }
    }
}

@available(iOS 15.0, *)
enum PurchaseResult {
    case success
    case cancelled
    case pending           // En attente (Ask to Buy, SCA, etc.)
    case failed(String)
    case backendError(String)
}

extension Notification.Name {
    static let iapProductsLoaded = Notification.Name("IAPProductsLoaded")
    static let iapPremiumActivated = Notification.Name("IAPPremiumActivated")
}

/// Récupère la base URL du backend ProfCalendar pour les appels IAP.
/// Doit pointer vers la même URL que celle chargée par la WKWebView.
struct APIBaseURL {
    static let shared: URL = URL(string: "https://profcalendar.org")!
}
