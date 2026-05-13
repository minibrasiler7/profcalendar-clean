//
//  PaywallViewController.swift
//  ProfCalendarEnseignant
//
//  Écran d'abonnement présenté à l'utilisateur quand il veut débloquer
//  Premium depuis l'app iPad. Conforme aux exigences Apple :
//   - Boutons clairs (Mensuel + Annuel)
//   - Mention du prix dans la devise locale (fournie par StoreKit)
//   - Bouton « Restaurer mes achats »
//   - Liens vers les CGU et la politique de confidentialité
//   - Information sur le renouvellement automatique
//

import UIKit
import StoreKit

@available(iOS 15.0, *)
final class PaywallViewController: UIViewController {

    // MARK: - UI

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()
    private let monthlyButton = UIButton(type: .system)
    private let annualButton = UIButton(type: .system)
    private let restoreButton = UIButton(type: .system)
    private let loadingIndicator = UIActivityIndicatorView(style: .large)

    private var products: [Product] = []

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = "Premium"
        setupUI()
        setupCloseButton()

        // Charger les produits (s'ils ne sont pas déjà en cache)
        if IAPManager.shared.products.isEmpty {
            loadingIndicator.startAnimating()
            Task { @MainActor in
                await IAPManager.shared.loadProducts()
                self.refreshUI()
            }
        } else {
            self.products = IAPManager.shared.products
            refreshUI()
        }

        NotificationCenter.default.addObserver(
            self, selector: #selector(productsLoaded),
            name: .iapProductsLoaded, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Build UI

    private func setupCloseButton() {
        let close = UIBarButtonItem(
            barButtonSystemItem: .close, target: self,
            action: #selector(dismissSelf))
        navigationItem.leftBarButtonItem = close
    }

    @objc private func dismissSelf() {
        dismiss(animated: true)
    }

    private func setupUI() {
        // ScrollView pour les petits écrans
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        contentStack.axis = .vertical
        contentStack.alignment = .fill
        contentStack.spacing = 16
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        contentStack.isLayoutMarginsRelativeArrangement = true
        contentStack.layoutMargins = UIEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        scrollView.addSubview(contentStack)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            contentStack.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentStack.widthAnchor.constraint(equalTo: scrollView.widthAnchor),
        ])

        // Titre
        let title = UILabel()
        title.text = "ProfCalendar Premium"
        title.font = .systemFont(ofSize: 28, weight: .bold)
        title.textAlignment = .center
        title.numberOfLines = 0

        let subtitle = UILabel()
        subtitle.text = "Débloquez toutes les fonctionnalités pour gérer vos classes."
        subtitle.font = .systemFont(ofSize: 16)
        subtitle.textAlignment = .center
        subtitle.textColor = .secondaryLabel
        subtitle.numberOfLines = 0

        // Liste des avantages
        let features = [
            "✓ Gestion complète de classe (élèves, notes, présences)",
            "✓ Plan de classe interactif et groupes",
            "✓ Exercices interactifs (QCM, dictées, etc.)",
            "✓ Annotation de PDF avec Apple Pencil",
            "✓ Collaboration avec d'autres enseignants",
            "✓ Gestion des sanctions et aménagements",
        ]
        let featuresStack = UIStackView()
        featuresStack.axis = .vertical
        featuresStack.spacing = 8
        for line in features {
            let label = UILabel()
            label.text = line
            label.font = .systemFont(ofSize: 15)
            label.textColor = .label
            label.numberOfLines = 0
            featuresStack.addArrangedSubview(label)
        }

        // Boutons d'abonnement
        configurePlanButton(monthlyButton, title: "Mensuel", subtitle: "Sans engagement",
                             tint: .systemIndigo)
        monthlyButton.addTarget(self, action: #selector(tappedMonthly), for: .touchUpInside)

        configurePlanButton(annualButton, title: "Annuel", subtitle: "Économisez 32 %",
                             tint: .systemPurple, highlighted: true)
        annualButton.addTarget(self, action: #selector(tappedAnnual), for: .touchUpInside)

        // Restore + mentions légales
        restoreButton.setTitle("Restaurer mes achats", for: .normal)
        restoreButton.titleLabel?.font = .systemFont(ofSize: 14)
        restoreButton.addTarget(self, action: #selector(tappedRestore), for: .touchUpInside)

        let disclaimer = UILabel()
        disclaimer.text = """
            Les abonnements se renouvellent automatiquement sauf annulation au moins 24 h avant la fin de la période en cours. Vous pouvez gérer ou annuler dans Réglages → Apple ID → Abonnements.
            """
        disclaimer.font = .systemFont(ofSize: 11)
        disclaimer.textColor = .secondaryLabel
        disclaimer.numberOfLines = 0
        disclaimer.textAlignment = .center

        let legalStack = UIStackView()
        legalStack.axis = .horizontal
        legalStack.spacing = 16
        legalStack.distribution = .equalCentering
        let cgu = UIButton(type: .system)
        cgu.setTitle("CGU", for: .normal)
        cgu.titleLabel?.font = .systemFont(ofSize: 12)
        cgu.addTarget(self, action: #selector(openTerms), for: .touchUpInside)
        let priv = UIButton(type: .system)
        priv.setTitle("Confidentialité", for: .normal)
        priv.titleLabel?.font = .systemFont(ofSize: 12)
        priv.addTarget(self, action: #selector(openPrivacy), for: .touchUpInside)
        legalStack.addArrangedSubview(cgu)
        legalStack.addArrangedSubview(priv)

        // Loading indicator
        loadingIndicator.hidesWhenStopped = true

        // Assemble
        contentStack.addArrangedSubview(title)
        contentStack.addArrangedSubview(subtitle)
        contentStack.addArrangedSubview(spacer(height: 8))
        contentStack.addArrangedSubview(featuresStack)
        contentStack.addArrangedSubview(spacer(height: 16))
        contentStack.addArrangedSubview(loadingIndicator)
        contentStack.addArrangedSubview(monthlyButton)
        contentStack.addArrangedSubview(annualButton)
        contentStack.addArrangedSubview(spacer(height: 8))
        contentStack.addArrangedSubview(restoreButton)
        contentStack.addArrangedSubview(disclaimer)
        contentStack.addArrangedSubview(legalStack)
    }

    private func configurePlanButton(_ button: UIButton, title: String, subtitle: String,
                                      tint: UIColor, highlighted: Bool = false) {
        button.translatesAutoresizingMaskIntoConstraints = false
        button.contentEdgeInsets = UIEdgeInsets(top: 14, left: 16, bottom: 14, right: 16)
        button.titleLabel?.numberOfLines = 0
        button.titleLabel?.textAlignment = .center
        button.backgroundColor = highlighted ? tint : tint.withAlphaComponent(0.12)
        button.setTitleColor(highlighted ? .white : tint, for: .normal)
        button.layer.cornerRadius = 14
        if highlighted {
            button.layer.shadowColor = tint.cgColor
            button.layer.shadowRadius = 10
            button.layer.shadowOpacity = 0.3
            button.layer.shadowOffset = CGSize(width: 0, height: 4)
        }
        button.setTitle("\(title)\n\(subtitle)", for: .normal)
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 64).isActive = true
    }

    private func spacer(height: CGFloat) -> UIView {
        let v = UIView()
        v.translatesAutoresizingMaskIntoConstraints = false
        v.heightAnchor.constraint(equalToConstant: height).isActive = true
        return v
    }

    // MARK: - Refresh UI avec les prix réels

    @objc private func productsLoaded() {
        DispatchQueue.main.async { self.refreshUI() }
    }

    private func refreshUI() {
        loadingIndicator.stopAnimating()
        self.products = IAPManager.shared.products

        let monthly = products.first { $0.id == IAPManager.monthlyProductId }
        let annual = products.first { $0.id == IAPManager.annualProductId }

        if let p = monthly {
            monthlyButton.setTitle("Mensuel\n\(p.displayPrice) / mois", for: .normal)
            monthlyButton.isEnabled = true
        } else {
            monthlyButton.setTitle("Mensuel\nIndisponible", for: .normal)
            monthlyButton.isEnabled = false
        }
        if let p = annual {
            annualButton.setTitle("Annuel — Meilleure offre\n\(p.displayPrice) / an", for: .normal)
            annualButton.isEnabled = true
        } else {
            annualButton.setTitle("Annuel\nIndisponible", for: .normal)
            annualButton.isEnabled = false
        }
    }

    // MARK: - Actions

    @objc private func tappedMonthly() {
        guard let p = products.first(where: { $0.id == IAPManager.monthlyProductId }) else { return }
        triggerPurchase(p)
    }

    @objc private func tappedAnnual() {
        guard let p = products.first(where: { $0.id == IAPManager.annualProductId }) else { return }
        triggerPurchase(p)
    }

    private func triggerPurchase(_ product: Product) {
        loadingIndicator.startAnimating()
        view.isUserInteractionEnabled = false
        Task { @MainActor in
            let result = await IAPManager.shared.purchase(product)
            self.loadingIndicator.stopAnimating()
            self.view.isUserInteractionEnabled = true
            self.handleResult(result)
        }
    }

    @objc private func tappedRestore() {
        loadingIndicator.startAnimating()
        Task { @MainActor in
            let count = await IAPManager.shared.restorePurchases()
            self.loadingIndicator.stopAnimating()
            let msg = count > 0
                ? "Achats restaurés (\(count))."
                : "Aucun abonnement actif trouvé sur ce compte Apple."
            self.showAlert(title: "Restauration", message: msg)
            if count > 0 { self.dismissAndReload() }
        }
    }

    private func handleResult(_ result: PurchaseResult) {
        switch result {
        case .success:
            showAlert(title: "Premium activé 🎉",
                      message: "Votre abonnement est actif. Bienvenue !")
            dismissAndReload()
        case .cancelled:
            break
        case .pending:
            showAlert(title: "En attente",
                      message: "L'achat est en attente d'approbation (Ask to Buy).")
        case .failed(let msg):
            showAlert(title: "Erreur", message: msg)
        case .backendError(let msg):
            showAlert(title: "Activation incomplète",
                      message: "L'achat a réussi côté Apple, mais l'activation côté serveur a échoué. " + msg + " Vous pouvez réessayer via « Restaurer mes achats ».")
        }
    }

    private func dismissAndReload() {
        // Demander au WebView de se recharger pour prendre en compte le
        // nouveau statut premium côté serveur.
        NotificationCenter.default.post(name: .iapPremiumActivated, object: nil)
        dismiss(animated: true)
    }

    private func showAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    @objc private func openTerms() {
        if let url = URL(string: "https://profcalendar.org/terms") {
            UIApplication.shared.open(url)
        }
    }

    @objc private func openPrivacy() {
        if let url = URL(string: "https://profcalendar.org/privacy") {
            UIApplication.shared.open(url)
        }
    }
}
