//
//  IAPMessageHandler.swift
//  ProfCalendarEnseignant
//
//  Pont JavaScript ↔ Swift pour les achats In-App. Le web envoie :
//    window.webkit.messageHandlers.iap.postMessage({action: "openPaywall"})
//  et on présente le PaywallViewController par dessus la WebView.
//

import Foundation
import UIKit
import WebKit

@available(iOS 15.0, *)
final class IAPMessageHandler: NSObject, WKScriptMessageHandler {

    private weak var controller: UIViewController?

    init(controller: UIViewController) {
        self.controller = controller
        super.init()

        // Quand le backend a activé Premium suite à une transaction
        // (validate-transaction OK), on recharge la WebView pour que l'UI
        // reflète immédiatement le nouveau statut.
        NotificationCenter.default.addObserver(
            self, selector: #selector(premiumActivated),
            name: .iapPremiumActivated, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "openPaywall":
            DispatchQueue.main.async { self.presentPaywall() }
        case "getProducts":
            // La page d'abonnement (pricing_ios.html) affiche les vrais prix
            // StoreKit, dans la monnaie de la vitrine de l'utilisateur.
            sendProducts(to: message.webView)
        default:
            print("[IAP message] Action inconnue : \(action)")
        }
    }

    // MARK: - Prix des abonnements pour la page web

    private func sendProducts(to webView: WKWebView?) {
        guard let webView = webView else { return }
        Task { @MainActor in
            if IAPManager.shared.products.isEmpty {
                await IAPManager.shared.loadProducts()
            }
            var payload: [String: [String: String]] = [:]
            for product in IAPManager.shared.products {
                let key: String
                switch product.id {
                case IAPManager.monthlyProductId: key = "monthly"
                case IAPManager.annualProductId: key = "annual"
                default: key = product.id
                }
                payload[key] = ["price": product.displayPrice, "name": product.displayName]
            }
            guard !payload.isEmpty,
                  let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8) else { return }
            webView.evaluateJavaScript("window.pcIapProducts && window.pcIapProducts(\(json));", completionHandler: nil)
        }
    }

    // MARK: - Présentation du paywall

    private func presentPaywall() {
        guard let host = controller else { return }
        let paywall = PaywallViewController()
        let nav = UINavigationController(rootViewController: paywall)
        nav.modalPresentationStyle = .formSheet
        host.present(nav, animated: true)
    }

    // MARK: - Reload WebView après activation Premium

    @objc private func premiumActivated() {
        DispatchQueue.main.async { [weak self] in
            // Le contrôleur racine est le WebViewController. On lui demande
            // de recharger la page courante pour rafraîchir le statut Premium.
            guard let webController = self?.controller as? WebViewController else { return }
            webController.reloadCurrentPage()
        }
    }
}
