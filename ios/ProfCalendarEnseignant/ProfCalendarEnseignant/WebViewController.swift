import UIKit
import UIKit.UIGestureRecognizerSubclass  // requis pour surcharger touchesBegan/… et écrire `state` (PencilEraserForwarder)
import WebKit
import MobileCoreServices
import UniformTypeIdentifiers
import PhotosUI
import PencilKit
import QuartzCore

class WebViewController: UIViewController {

    // MARK: - Constants

    private let baseURLString = "https://profcalendar.org/auth/login"
    private let hostName = "profcalendar.org"
    private let themeColor = UIColor(red: 26/255, green: 26/255, blue: 46/255, alpha: 1)
    private let accentColor = UIColor(red: 99/255, green: 102/255, blue: 241/255, alpha: 1)

    /// Hôtes de paiement externes que l'app NE DOIT JAMAIS ouvrir, ni dans
    /// la WebView ni dans Safari. Apple Guideline 3.1.1 interdit aux apps
    /// de mener l'utilisateur vers un autre système de paiement que
    /// l'In-App Purchase. Si une route serveur essaie de rediriger vers
    /// l'un de ces hôtes, on cancel la navigation et on déclenche le
    /// paywall StoreKit natif à la place.
    private let blockedPaymentHosts: [String] = [
        "stripe.com",
        "checkout.stripe.com",
        "billing.stripe.com",
        "buy.stripe.com",
        "paypal.com",
        "paypal.me",
    ]

    // MARK: - UI Elements

    private var webView: WKWebView!
    private var activityIndicator: UIActivityIndicatorView!
    private var refreshControl: UIRefreshControl!
    private var offlineView: UIView!
    private var offlineRetryButton: UIButton!

    // MARK: - File Upload State

    private var fileUploadCompletion: (([URL]?) -> Void)?

    // MARK: - PencilKit (Apple Pencil natif)

    private let drawingCoordinator = DrawingCoordinator()
    private var pencilCanvas: PKCanvasView!
    // Conteneur qui CLIPPE l'overlay PencilKit à la zone de dessin visible
    // (sous la barre d'outils, dans le viewport). Le canvas, lui, garde la
    // taille/position de la PAGE → les coordonnées des traits restent
    // page-relatives (aucune translation à corriger).
    private var pencilCanvasContainer: PassthroughContainerView!
    private var pencilKitMessageHandler: PencilKitMessageHandler!
    // Gomme native "deux-en-un" : transmet la position de la gomme Pencil au web
    // (efface aussi les traits rechargés + persistance), sans bloquer l'effacement
    // natif PKEraserTool. Voir PencilEraserForwarder en bas de fichier.
    private var eraserForwarder: PencilEraserForwarder?

    // MARK: - External display detection
    //
    // Quand un écran externe est connecté (Apple TV / HDMI), on cache la
    // status bar pour que la WebView occupe TOUTE la hauteur de l'iPad.
    // Comme on est en mode mirror (UIApplicationSupportsMultipleScenes =
    // false), la TV recopie l'iPad : plus l'iPad est plein écran, plus la
    // TV l'est aussi. Réduit les bandes noires en haut/bas.
    private var hasExternalDisplay: Bool = false {
        didSet {
            guard hasExternalDisplay != oldValue else { return }
            setNeedsStatusBarAppearanceUpdate()
            view.setNeedsLayout()
        }
    }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        setupDrawingCoordinator()
        setupWebView()
        setupPencilKitCanvas()
        setupActivityIndicator()
        setupRefreshControl()
        setupOfflineView()
        setupSwipeNavigation()
        setupKeyboardObservers()
        setupApplePencilInteraction()
        observeExternalDisplay()
        loadBaseURL()
    }

    private func observeExternalDisplay() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(updateExternalDisplayState),
            name: UIScreen.didConnectNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(updateExternalDisplayState),
            name: UIScreen.didDisconnectNotification,
            object: nil
        )
        updateExternalDisplayState()
    }

    @objc private func updateExternalDisplayState() {
        hasExternalDisplay = UIScreen.screens.count > 1
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // En mode TV (status bar masquée) la WebView prend tout l'écran ;
        // sinon on conserve l'inset du haut pour ne pas passer sous la
        // status bar.
        let topInset = hasExternalDisplay ? 0 : view.safeAreaInsets.top
        let contentFrame = CGRect(
            x: 0,
            y: topInset,
            width: view.bounds.width,
            height: view.bounds.height - topInset
        )
        webView?.frame = contentFrame
        offlineView?.frame = contentFrame
        // IMPORTANT : ne PAS réécrire le frame du PKCanvasView quand il est
        // visible. Sinon updatePencilCanvasFrame() (appelé à l'activation
        // avec le rect précis de la page PDF) est écrasé ici à la première
        // invalidation de layout, et le PKCanvasView se met à couvrir TOUTE
        // la WebView (incluant la barre d'outils du lecteur PDF) →
        // impossible de changer d'outil avec le stylet.
        if let container = pencilCanvasContainer, container.isHidden {
            // SÉCURITÉ : caché → cadre NUL (et non plein écran). Sinon ce cadre
            // plein écran devient le repli si l'overlay s'affiche avant d'avoir
            // un pageRect valide → il recouvre toute la WebView (barre d'outils
            // figée, dessin partout, scroll mort).
            container.frame = .zero
            pencilCanvas?.frame = .zero
        } else if pencilCanvasContainer != nil {
            // PencilKit actif → recadrer l'overlay (conteneur + canvas) selon le
            // dernier pageRect/clipRect connus.
            updatePencilCanvasFrame()
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .darkContent
    }

    override var prefersStatusBarHidden: Bool {
        return hasExternalDisplay
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Setup

    private func setupDrawingCoordinator() {
        drawingCoordinator.delegate = self
        pencilKitMessageHandler = PencilKitMessageHandler(coordinator: drawingCoordinator)
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Allow fullscreen (e.g., videos)
        if #available(iOS 15.4, *) {
            config.preferences.isElementFullscreenEnabled = true
        }

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        // Enregistrer le handler PencilKit pour les messages JavaScript -> Swift
        // Le web envoie: window.webkit.messageHandlers.pencilKit.postMessage({action: "activate", config: {...}})
        config.userContentController.add(pencilKitMessageHandler, name: "pencilKit")

        // Handler IAP : le web peut demander d'ouvrir le paywall natif via
        //   window.webkit.messageHandlers.iap.postMessage({action: "openPaywall"})
        // ou récupérer le statut Premium courant côté Apple.
        if #available(iOS 15.0, *) {
            config.userContentController.add(IAPMessageHandler(controller: self), name: "iap")
        }

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.backgroundColor = .white
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .white
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Marquer l'app native pour détection côté serveur / JS
        let existingUA = webView.value(forKey: "userAgent") as? String ?? ""
        webView.customUserAgent = existingUA + " ProfCalendarApp-iOS/1.0"

        // Apple Pencil: seul le doigt scroll, le stylet passe au canvas PencilKit
        webView.scrollView.panGestureRecognizer.allowedTouchTypes = [
            NSNumber(value: UITouch.TouchType.direct.rawValue)
        ]

        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        // Stocker la reference dans le coordinator
        drawingCoordinator.webView = webView

        view.addSubview(webView)
    }

    private func setupPencilKitCanvas() {
        // PassthroughCanvasView : laisse passer les touches du DOIGT vers la
        // WebView (scroll) tout en captant l'Apple Pencil (dessin). Sans ça,
        // l'overlay intercepte le doigt et bloque le scroll de la page.
        pencilCanvas = PassthroughCanvasView()
        pencilCanvas.backgroundColor = .clear
        pencilCanvas.isOpaque = false
        pencilCanvas.drawingPolicy = .pencilOnly  // Seul l'Apple Pencil dessine, le doigt scroll
        pencilCanvas.delegate = drawingCoordinator
        pencilCanvas.tool = drawingCoordinator.currentPKTool

        // Desactiver le scroll du canvas PencilKit (PKCanvasView herite de UIScrollView)
        pencilCanvas.isScrollEnabled = false
        pencilCanvas.bounces = false

        // CLIPPER le canvas sur ses propres bords (= la PAGE, cf. frame ci-dessous).
        // Le conteneur clippe déjà la zone visible MAIS son clipsToBounds n'arrête
        // pas l'encre EN COURS de PencilKit (rendu hors-limites, confirmé par les
        // logs). En clippant le canvas lui-même à la taille de la page, le trait vif
        // qui « bave » au-dessus du bord supérieur du PDF est découpé. L'encre
        // légitime (sur la page) n'est jamais affectée.
        pencilCanvas.clipsToBounds = true

        pencilCanvas.isHidden = false  // La visibilité est gérée par le conteneur
        pencilCanvas.translatesAutoresizingMaskIntoConstraints = true

        // Conteneur clippant : caché par défaut, activé via le bridge JS. Il est
        // borné à la zone de dessin visible (clipRect) ; le canvas est placé
        // DEDANS à la position de la page (donc clippé visuellement à la barre
        // d'outils / au viewport), sans changer les coordonnées des traits.
        pencilCanvasContainer = PassthroughContainerView()
        pencilCanvasContainer.backgroundColor = .clear
        pencilCanvasContainer.isOpaque = false
        pencilCanvasContainer.clipsToBounds = true
        pencilCanvasContainer.isHidden = true
        pencilCanvasContainer.translatesAutoresizingMaskIntoConstraints = true
        pencilCanvasContainer.addSubview(pencilCanvas)

        drawingCoordinator.canvasView = pencilCanvas

        // Gomme native "deux-en-un" : un recognizer non bloquant transmet la
        // position de la gomme Pencil au web pendant que PKEraserTool efface
        // l'encre native. Le web efface alors aussi les traits rechargés
        // (perfect-freehand) et persiste la coupe. Inactif hors gomme.
        let forwarder = PencilEraserForwarder(target: nil, action: nil)
        forwarder.isActive = { [weak self] in self?.drawingCoordinator.currentToolName == "eraser" }
        forwarder.onMove = { [weak self] loc in
            guard let self = self, let canvas = self.pencilCanvas else { return }
            let w = canvas.bounds.width
            let h = canvas.bounds.height
            guard w > 0, h > 0 else { return }
            let fx = min(max(loc.x / w, 0), 1)
            let fy = min(max(loc.y / h, 0), 1)
            let js = "window.pencilKitBridge && window.pencilKitBridge.onEraserMove && window.pencilKitBridge.onEraserMove(\(fx), \(fy))"
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
        forwarder.onEnd = { [weak self] in
            guard let self = self else { return }
            self.webView?.evaluateJavaScript("window.pencilKitBridge && window.pencilKitBridge.onEraserEnd && window.pencilKitBridge.onEraserEnd()", completionHandler: nil)
        }
        pencilCanvas.addGestureRecognizer(forwarder)
        eraserForwarder = forwarder

        view.addSubview(pencilCanvasContainer)
    }

    private func setupActivityIndicator() {
        activityIndicator = UIActivityIndicatorView(style: .large)
        activityIndicator.color = .white
        activityIndicator.hidesWhenStopped = true
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(activityIndicator)

        NSLayoutConstraint.activate([
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    private func setupRefreshControl() {
        refreshControl = UIRefreshControl()
        refreshControl.tintColor = .white
        refreshControl.addTarget(self, action: #selector(handleRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl
    }

    private func setupOfflineView() {
        offlineView = UIView(frame: view.bounds)
        offlineView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        offlineView.backgroundColor = themeColor
        offlineView.isHidden = true

        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.alignment = .center
        stackView.spacing = 16
        stackView.translatesAutoresizingMaskIntoConstraints = false

        let emojiLabel = UILabel()
        emojiLabel.text = "📡"
        emojiLabel.font = UIFont.systemFont(ofSize: 64)
        emojiLabel.textAlignment = .center

        let titleLabel = UILabel()
        titleLabel.text = "Connexion impossible"
        titleLabel.font = UIFont.boldSystemFont(ofSize: 22)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center

        let messageLabel = UILabel()
        messageLabel.text = "Veuillez vérifier votre connexion internet\net réessayer."
        messageLabel.font = UIFont.systemFont(ofSize: 16)
        messageLabel.textColor = UIColor.lightGray
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0

        offlineRetryButton = UIButton(type: .system)
        offlineRetryButton.setTitle("Réessayer", for: .normal)
        offlineRetryButton.setTitleColor(.white, for: .normal)
        offlineRetryButton.titleLabel?.font = UIFont.boldSystemFont(ofSize: 17)
        offlineRetryButton.backgroundColor = accentColor
        offlineRetryButton.layer.cornerRadius = 12
        offlineRetryButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 32, bottom: 12, right: 32)
        offlineRetryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        stackView.addArrangedSubview(emojiLabel)
        stackView.addArrangedSubview(titleLabel)
        stackView.addArrangedSubview(messageLabel)
        stackView.addArrangedSubview(offlineRetryButton)

        offlineView.addSubview(stackView)

        NSLayoutConstraint.activate([
            stackView.centerXAnchor.constraint(equalTo: offlineView.centerXAnchor),
            stackView.centerYAnchor.constraint(equalTo: offlineView.centerYAnchor),
            stackView.leadingAnchor.constraint(greaterThanOrEqualTo: offlineView.leadingAnchor, constant: 32),
            stackView.trailingAnchor.constraint(lessThanOrEqualTo: offlineView.trailingAnchor, constant: -32)
        ])

        view.addSubview(offlineView)
    }

    private func setupSwipeNavigation() {
        let swipeLeft = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipe(_:)))
        swipeLeft.direction = .left
        let swipeRight = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipe(_:)))
        swipeRight.direction = .right
        // WKWebView already has allowsBackForwardNavigationGestures, but these are extra fallbacks
    }

    private func setupApplePencilInteraction() {
        // UIPencilInteraction — handles double-tap on Apple Pencil 2
        if #available(iOS 12.1, *) {
            let interaction = UIPencilInteraction()
            interaction.delegate = self
            view.addInteraction(interaction)
        }
    }

    private func setupKeyboardObservers() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillShow(_:)),
            name: UIResponder.keyboardWillShowNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillHide(_:)),
            name: UIResponder.keyboardWillHideNotification, object: nil
        )
    }

    // MARK: - Loading

    private func loadBaseURL() {
        guard let url = URL(string: baseURLString) else { return }
        let request = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30)
        webView.load(request)
        activityIndicator.startAnimating()
        offlineView.isHidden = true
    }

    /// Recharge la page actuellement affichée dans la WebView.
    /// Appelé après une activation Premium réussie pour que l'UI reflète
    /// le nouveau statut.
    func reloadCurrentPage() {
        if webView.url != nil {
            webView.reload()
        } else {
            loadBaseURL()
        }
    }

    // MARK: - Actions

    @objc private func handleRefresh() {
        webView.reload()
    }

    @objc private func retryTapped() {
        loadBaseURL()
    }

    @objc private func handleSwipe(_ gesture: UISwipeGestureRecognizer) {
        if gesture.direction == .right && webView.canGoBack {
            webView.goBack()
        } else if gesture.direction == .left && webView.canGoForward {
            webView.goForward()
        }
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let keyboardFrame = userInfo[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let insets = UIEdgeInsets(top: 0, left: 0, bottom: keyboardFrame.height, right: 0)
        webView.scrollView.contentInset = insets
        webView.scrollView.scrollIndicatorInsets = insets
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
    }

    // MARK: - Safe Area & PencilKit JS Injection

    private func injectSafeAreaCSS() {
        let safeArea = view.safeAreaInsets
        let js = """
        (function() {
            document.documentElement.style.setProperty('--safe-area-top', '\(safeArea.top)px');
            document.documentElement.style.setProperty('--safe-area-bottom', '\(safeArea.bottom)px');
            document.documentElement.style.setProperty('--safe-area-left', '\(safeArea.left)px');
            document.documentElement.style.setProperty('--safe-area-right', '\(safeArea.right)px');
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func injectPencilKitBridge() {
        let js = """
        (function() {
            if (window.__pencilKitBridgeSetup) return;
            window.__pencilKitBridgeSetup = true;

            // Mark platform as iPad with native PencilKit support
            document.documentElement.dataset.iosPlatform = 'ipad';
            document.documentElement.dataset.pencilKitSupported = 'true';
            document.documentElement.classList.add('pencil-kit-supported');

            // PencilKit Bridge — le web app utilise ces fonctions
            window.pencilKitBridge = window.pencilKitBridge || {};

            // Activer le canvas PencilKit natif (appele par le web)
            window.pencilKitBridge.activate = function(config) {
                window.webkit.messageHandlers.pencilKit.postMessage({
                    action: 'activate',
                    config: config
                });
            };

            // Desactiver le canvas PencilKit
            window.pencilKitBridge.deactivate = function() {
                window.webkit.messageHandlers.pencilKit.postMessage({
                    action: 'deactivate'
                });
            };

            // Mettre a jour la position de la page (scroll/zoom)
            window.pencilKitBridge.updatePageRect = function(config) {
                window.webkit.messageHandlers.pencilKit.postMessage({
                    action: 'updatePageRect',
                    config: config
                });
            };

            // Changer l'outil en cours
            window.pencilKitBridge.updateTool = function(config) {
                window.webkit.messageHandlers.pencilKit.postMessage({
                    action: 'updateTool',
                    config: config
                });
            };

            // Callback: sera appelee par Swift quand un stroke est termine
            // Le web app doit definir cette fonction:
            // window.pencilKitBridge.onStrokeCompleted = function(strokeData) { ... }

            // Helper: verifier si PencilKit est disponible
            window.pencilKitBridge.isAvailable = true;

            // Ce build garde l'encre PencilKit native affichee pendant la session
            // (n'efface plus le canvas apres chaque trait). Le JS s'appuie sur ce
            // flag pour NE PAS re-tracer le trait via perfect-freehand pendant la
            // session : le trait reste "tel quel". perfect-freehand n'intervient
            // qu'au flush (changement de page/outil) et au rechargement.
            window.pencilKitBridge.keepsNativeInk = true;

            console.log('[ProfCalendar] PencilKit bridge initialized');
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - File Upload Helpers

    private func presentFileUploadOptions(completion: @escaping ([URL]?) -> Void) {
        fileUploadCompletion = completion

        let alert = UIAlertController(
            title: "Ajouter un fichier",
            message: "Choisissez la source du fichier",
            preferredStyle: .actionSheet
        )

        // Camera option
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            alert.addAction(UIAlertAction(title: "Appareil photo", style: .default) { [weak self] _ in
                self?.presentCamera()
            })
        }

        // Photo Library
        alert.addAction(UIAlertAction(title: "Photothèque", style: .default) { [weak self] _ in
            self?.presentPhotoLibrary()
        })

        // Document picker (Files app)
        alert.addAction(UIAlertAction(title: "Fichiers", style: .default) { [weak self] _ in
            self?.presentDocumentPicker()
        })

        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { [weak self] _ in
            self?.fileUploadCompletion?(nil)
            self?.fileUploadCompletion = nil
        })

        // iPad popover configuration
        if let popover = alert.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(
                x: view.bounds.midX, y: view.bounds.midY,
                width: 0, height: 0
            )
            popover.permittedArrowDirections = []
        }

        present(alert, animated: true)
    }

    private func presentCamera() {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = self
        picker.allowsEditing = false
        present(picker, animated: true)
    }

    private func presentPhotoLibrary() {
        if #available(iOS 14.0, *) {
            var config = PHPickerConfiguration()
            config.selectionLimit = 0 // 0 = unlimited
            config.filter = .any(of: [.images, .videos])
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            present(picker, animated: true)
        } else {
            let picker = UIImagePickerController()
            picker.sourceType = .photoLibrary
            picker.delegate = self
            picker.allowsEditing = false
            present(picker, animated: true)
        }
    }

    private func presentDocumentPicker() {
        let supportedTypes: [UTType] = [
            .pdf, .image, .plainText, .spreadsheet, .presentation,
            .data, .content, .item
        ]
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: supportedTypes, asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = true
        present(picker, animated: true)
    }

    private func saveImageToTempFile(_ image: UIImage) -> URL? {
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "upload_\(UUID().uuidString).jpg"
        let fileURL = tempDir.appendingPathComponent(fileName)
        guard let data = image.jpegData(compressionQuality: 0.85) else { return nil }
        do {
            try data.write(to: fileURL)
            return fileURL
        } catch {
            print("Error saving image to temp file: \(error)")
            return nil
        }
    }

    // MARK: - File Download Helpers

    private func handleDownload(url: URL) {
        activityIndicator.startAnimating()

        let task = URLSession.shared.downloadTask(with: url) { [weak self] localURL, response, error in
            DispatchQueue.main.async {
                self?.activityIndicator.stopAnimating()

                guard let localURL = localURL, error == nil else {
                    self?.showAlert(
                        title: "Erreur",
                        message: "Impossible de télécharger le fichier."
                    )
                    return
                }

                let fileName = response?.suggestedFilename ?? url.lastPathComponent
                let tempDir = FileManager.default.temporaryDirectory
                let destURL = tempDir.appendingPathComponent(fileName)

                try? FileManager.default.removeItem(at: destURL)
                do {
                    try FileManager.default.moveItem(at: localURL, to: destURL)
                } catch {
                    return
                }

                let activityVC = UIActivityViewController(
                    activityItems: [destURL],
                    applicationActivities: nil
                )
                if let popover = activityVC.popoverPresentationController {
                    popover.sourceView = self?.view
                    popover.sourceRect = CGRect(
                        x: (self?.view.bounds.midX ?? 0),
                        y: (self?.view.bounds.midY ?? 0),
                        width: 0, height: 0
                    )
                }
                self?.present(activityVC, animated: true)
            }
        }
        task.resume()
    }

    private func showAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

// MARK: - WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
        refreshControl.endRefreshing()
        offlineView.isHidden = true
        injectSafeAreaCSS()
        injectPencilKitBridge()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        refreshControl.endRefreshing()
        handleNavigationError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        refreshControl.endRefreshing()
        handleNavigationError(error)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let scheme = url.scheme?.lowercased() ?? ""

        // Handle tel: and mailto:
        if scheme == "tel" || scheme == "mailto" {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
            return
        }

        // Handle blob: URLs (allow for downloads)
        if scheme == "blob" {
            decisionHandler(.allow)
            return
        }

        // Handle external links (not our host)
        if let host = url.host?.lowercased(),
           scheme == "https" || scheme == "http" {

            // Apple Guideline 3.1.1 : on ne doit JAMAIS mener l'utilisateur
            // vers un système de paiement digital autre que IAP. Si le
            // serveur tente une redirection vers Stripe/PayPal/etc., on
            // cancel la navigation et on ouvre directement le paywall
            // StoreKit natif à la place — c'est plus sûr que d'ouvrir
            // Safari (que Apple considère aussi comme une violation).
            if blockedPaymentHosts.contains(where: { host == $0 || host.hasSuffix(".\($0)") || host.hasSuffix($0) }) {
                NSLog("[IAP] Blocked external payment URL: \(url.absoluteString) → opening native paywall")
                decisionHandler(.cancel)
                DispatchQueue.main.async { [weak self] in
                    self?.presentNativePaywall()
                }
                return
            }

            if !host.contains(hostName) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
                decisionHandler(.cancel)
                return
            }
        }

        // Handle file downloads (PDF, etc.)
        let pathExtension = url.pathExtension.lowercased()
        let downloadExtensions = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "csv"]
        if downloadExtensions.contains(pathExtension) &&
            navigationAction.navigationType == .linkActivated {
            handleDownload(url: url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if let response = navigationResponse.response as? HTTPURLResponse,
           let contentDisposition = response.value(forHTTPHeaderField: "Content-Disposition"),
           contentDisposition.lowercased().contains("attachment") {
            if let url = response.url {
                handleDownload(url: url)
                decisionHandler(.cancel)
                return
            }
        }

        if #available(iOS 15.0, *) {
            if !navigationResponse.canShowMIMEType {
                decisionHandler(.download)
                return
            }
        }

        decisionHandler(.allow)
    }

    // MARK: - Native paywall (Apple Guideline 3.1.1 fallback)
    //
    // Si une route serveur tente une redirection vers un système de
    // paiement externe (Stripe, PayPal...), on intercepte côté navigation
    // policy et on appelle cette méthode pour ouvrir le paywall StoreKit
    // natif à la place. C'est l'option safe pour rester conforme à la
    // règle 3.1.1 : l'utilisateur ne quitte jamais l'app pour payer.
    fileprivate func presentNativePaywall() {
        // Évite les doubles présentations si la WebView génère plusieurs
        // tentatives de redirection en rafale.
        if presentedViewController is UINavigationController {
            return
        }
        let paywall = PaywallViewController()
        let nav = UINavigationController(rootViewController: paywall)
        nav.modalPresentationStyle = .formSheet
        present(nav, animated: true)
    }

    private func handleNavigationError(_ error: Error) {
        let nsError = error as NSError
        // Ignore cancelled navigations
        if nsError.code == NSURLErrorCancelled { return }

        // Show offline view for connectivity errors
        let offlineErrors = [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorTimedOut,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorDNSLookupFailed
        ]
        if offlineErrors.contains(nsError.code) {
            offlineView.isHidden = false
        }
    }
}

// MARK: - WKUIDelegate

extension WebViewController: WKUIDelegate {

    // Handle target="_blank" links
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            // Apple Guideline 3.1.1 : blocage des paiements externes
            // même via window.open / target=_blank. Si le site appelle
            // par exemple window.open('https://checkout.stripe.com/...'),
            // on intercepte ici et on ouvre le paywall StoreKit natif.
            if let host = url.host?.lowercased(),
               blockedPaymentHosts.contains(where: { host == $0 || host.hasSuffix(".\($0)") || host.hasSuffix($0) }) {
                NSLog("[IAP] Blocked external payment window.open: \(url.absoluteString) → opening native paywall")
                DispatchQueue.main.async { [weak self] in
                    self?.presentNativePaywall()
                }
                return nil
            }

            if let host = url.host, host.contains(hostName) {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
        }
        return nil
    }

    // JavaScript alert()
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler()
        })
        present(alert, animated: true)
    }

    // JavaScript confirm()
    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "Confirmer", style: .default) { _ in
            completionHandler(true)
        })
        present(alert, animated: true)
    }

    // JavaScript prompt()
    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { textField in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in
            completionHandler(nil)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        present(alert, animated: true)
    }

    // MARK: - File Upload Panel (iOS 18.4+ custom handler)
    // On iOS < 18.4, WKWebView handles <input type="file"> natively.

    @available(iOS 18.4, *)
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        presentFileUploadOptions(completion: completionHandler)
    }
}

// MARK: - WKDownloadDelegate (iOS 15+)

@available(iOS 15.0, *)
extension WebViewController: WKDownloadDelegate {

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(suggestedFilename)
        try? FileManager.default.removeItem(at: fileURL)
        completionHandler(fileURL)
    }

    func downloadDidFinish(_ download: WKDownload) {
        // After download completes, present share sheet
        guard let url = download.progress.fileURL ?? findLatestTempFile() else { return }
        DispatchQueue.main.async { [weak self] in
            let activityVC = UIActivityViewController(
                activityItems: [url],
                applicationActivities: nil
            )
            if let popover = activityVC.popoverPresentationController {
                popover.sourceView = self?.view
                popover.sourceRect = CGRect(
                    x: (self?.view.bounds.midX ?? 0),
                    y: (self?.view.bounds.midY ?? 0),
                    width: 0, height: 0
                )
            }
            self?.present(activityVC, animated: true)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        DispatchQueue.main.async { [weak self] in
            self?.showAlert(
                title: "Erreur de téléchargement",
                message: "Le fichier n'a pas pu être téléchargé."
            )
        }
    }

    private func findLatestTempFile() -> URL? {
        let tempDir = FileManager.default.temporaryDirectory
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: tempDir,
            includingPropertiesForKeys: [.creationDateKey],
            options: .skipsHiddenFiles
        ) else { return nil }

        return files
            .sorted { (a, b) -> Bool in
                let dateA = (try? a.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast
                let dateB = (try? b.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast
                return dateA > dateB
            }
            .first
    }
}

// MARK: - UIImagePickerControllerDelegate

extension WebViewController: UIImagePickerControllerDelegate, UINavigationControllerDelegate {

    func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        picker.dismiss(animated: true)

        if let image = info[.originalImage] as? UIImage,
           let fileURL = saveImageToTempFile(image) {
            fileUploadCompletion?([fileURL])
        } else if let videoURL = info[.mediaURL] as? URL {
            fileUploadCompletion?([videoURL])
        } else {
            fileUploadCompletion?(nil)
        }
        fileUploadCompletion = nil
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        fileUploadCompletion?(nil)
        fileUploadCompletion = nil
    }
}

// MARK: - PHPickerViewControllerDelegate

@available(iOS 14.0, *)
extension WebViewController: PHPickerViewControllerDelegate {

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)

        if results.isEmpty {
            fileUploadCompletion?(nil)
            fileUploadCompletion = nil
            return
        }

        let group = DispatchGroup()
        var urls: [URL] = []
        let tempDir = FileManager.default.temporaryDirectory

        for result in results {
            let provider = result.itemProvider

            // Try loading as image first
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                group.enter()
                provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, error in
                    defer { group.leave() }
                    guard let url = url else { return }

                    let destURL = tempDir.appendingPathComponent(
                        "upload_\(UUID().uuidString).\(url.pathExtension)"
                    )
                    try? FileManager.default.copyItem(at: url, to: destURL)
                    urls.append(destURL)
                }
            }
            // Try loading as video
            else if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                group.enter()
                provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, error in
                    defer { group.leave() }
                    guard let url = url else { return }

                    let destURL = tempDir.appendingPathComponent(
                        "upload_\(UUID().uuidString).\(url.pathExtension)"
                    )
                    try? FileManager.default.copyItem(at: url, to: destURL)
                    urls.append(destURL)
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            if urls.isEmpty {
                self?.fileUploadCompletion?(nil)
            } else {
                self?.fileUploadCompletion?(urls)
            }
            self?.fileUploadCompletion = nil
        }
    }
}

// MARK: - UIDocumentPickerDelegate

extension WebViewController: UIDocumentPickerDelegate {

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        if urls.isEmpty {
            fileUploadCompletion?(nil)
        } else {
            fileUploadCompletion?(urls)
        }
        fileUploadCompletion = nil
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        fileUploadCompletion?(nil)
        fileUploadCompletion = nil
    }
}

// MARK: - DrawingCoordinatorDelegate (PencilKit overlay)

extension WebViewController: DrawingCoordinatorDelegate {

    func drawingCoordinator(_ coordinator: DrawingCoordinator, didChangeActiveState isActive: Bool) {
        pencilCanvasContainer.isHidden = !isActive

        if isActive {
            // IMPORTANT : on NE coupe PLUS le scroll de la WebView ici. Avant,
            // dès que l'outil stylo/surligneur était actif, le scroll était mort
            // (l'enseignant ne pouvait plus faire défiler la page). Désormais le
            // scroll au DOIGT reste possible : l'overlay (PassthroughCanvasView)
            // laisse passer les touches du doigt vers la WebView, et le scroll
            // n'est coupé QUE le temps d'un vrai tracé Pencil (voir
            // canvasViewDidBeginUsingTool / canvasViewDidEndUsingTool).
            updatePencilCanvasFrame()

            // S'assurer que l'overlay est au-dessus de tout (sauf activity indicator)
            view.bringSubviewToFront(pencilCanvasContainer)

            pencilCanvas.tool = coordinator.currentPKTool
            // NE PLUS vider le canvas natif ici. keepsNativeInk=true : l'encre
            // native doit PERSISTER pendant la session. Avant, ce
            // `drawing = PKDrawing()` se déclenchait à CHAQUE (ré)activation —
            // donc à chaque changement d'outil stylo↔surligneur — et faisait
            // DISPARAÎTRE les traits déjà tracés. Le canvas est désormais vidé
            // uniquement au changement de page (DrawingCoordinator.activatePencilKit,
            // via clearCanvas) et à la désactivation (passage gomme/règle/…),
            // APRÈS que le JS a matérialisé les traits (flush).
        } else {
            // Filet de sécurité : si un tracé avait coupé le scroll, le rétablir.
            webView.scrollView.isScrollEnabled = true
            webView.scrollView.bounces = true
        }
    }

    func drawingCoordinator(_ coordinator: DrawingCoordinator, didUpdatePageRect rect: CGRect) {
        updatePencilCanvasFrame()
    }

    private func updatePencilCanvasFrame() {
        guard pencilCanvasContainer != nil else { return }
        let pageRect = drawingCoordinator.pageRect
        let clipRect = drawingCoordinator.clipRect

        // SÉCURITÉ : pageRect invalide → cadre NUL (ne recouvre rien) plutôt que
        // de garder l'ancien cadre (souvent plein écran) → évite de figer la
        // barre d'outils / rendre tout l'écran annotable.
        guard pageRect.width > 0 && pageRect.height > 0 else {
            print("[DrawingCoordinator][diag] pageRect invalide \(pageRect) -> frame .zero")
            pencilCanvasContainer.frame = .zero
            pencilCanvas.frame = .zero
            return
        }

        pencilCanvas.translatesAutoresizingMaskIntoConstraints = true
        pencilCanvasContainer.translatesAutoresizingMaskIntoConstraints = true

        // CONVERSION coordonnées WEB → coordonnées VUE.
        // Les rects viennent de getBoundingClientRect (repère de la WebView). Or la
        // WebView est posée à y = topInset (zone sûre, cf. viewDidLayoutSubviews) ;
        // l'overlay PencilKit, lui, est un sous-vue de `view`. Sans cet ajout,
        // l'overlay est REMONTÉ de `topInset` → on dessine au-dessus du PDF, on ne
        // peut pas dessiner tout en bas, et l'overlay mord sur la barre d'outils.
        // (x = 0 pour la WebView → pas de décalage horizontal ; gauche/droite déjà OK.)
        let yOffset = webView?.frame.minY ?? 0

        if clipRect.width > 0 && clipRect.height > 0 {
            // Conteneur = ZONE DE DESSIN VISIBLE (sous la barre d'outils, dans le
            // viewport), recalée en coordonnées de `view`.
            pencilCanvasContainer.frame = CGRect(
                x: clipRect.minX,
                y: clipRect.minY + yOffset,
                width: clipRect.width,
                height: clipRect.height
            )
            // Canvas = taille de la PAGE, positionné DANS le conteneur. La position
            // est RELATIVE au conteneur → pageRect - clipRect (le yOffset est déjà
            // porté par le conteneur, ne pas le rajouter ici).
            pencilCanvas.frame = CGRect(
                x: pageRect.minX - clipRect.minX,
                y: pageRect.minY - clipRect.minY,
                width: pageRect.width,
                height: pageRect.height
            )
            pencilCanvas.contentSize = pencilCanvas.bounds.size
            pencilCanvas.contentOffset = .zero
        } else {
            // Repli (pas de clipRect transmis) : plein page. Le JS garantit
            // désormais un clipRect valide → ce repli ne devrait plus survenir.
            pencilCanvasContainer.frame = CGRect(
                x: pageRect.minX,
                y: pageRect.minY + yOffset,
                width: pageRect.width,
                height: pageRect.height
            )
            pencilCanvas.frame = pencilCanvasContainer.bounds
            pencilCanvas.contentSize = pencilCanvas.bounds.size
            pencilCanvas.contentOffset = .zero
            print("[DrawingCoordinator][diag] (fallback sans clip) frame overlay = \(pageRect) +yOffset=\(yOffset)")
        }
    }
}

// MARK: - UIPencilInteractionDelegate (double-tap Apple Pencil 2)

@available(iOS 12.1, *)
extension WebViewController: UIPencilInteractionDelegate {

    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        // Double-tap sur Apple Pencil 2 : notifier le web app
        let js = """
        if (window.pencilKitBridge && window.pencilKitBridge.onPencilDoubleTap) {
            window.pencilKitBridge.onPencilDoubleTap();
        }
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
        print("[WebViewController] Apple Pencil double-tap detected")
    }
}

// MARK: - PencilTouchState (départage hitTest)

/// État partagé entre l'overlay et le coordinateur de dessin pour résoudre
/// l'AMBIGUÏTÉ du hitTest au POSER du doigt/stylet.
///
/// Le problème (prouvé par les logs `[HitTest][diag] CONTAINER capte
/// (n=0/-1 types=[])`) : au tout premier hitTest d'un nouveau toucher, iOS
/// n'a pas encore inséré ce toucher dans `event.allTouches` → on ne peut PAS
/// savoir si c'est un doigt (→ scroll) ou un stylet (→ dessin). L'ancienne
/// règle « pas d'info → on capte » bloquait alors le scroll au doigt ; la
/// règle inverse « pas d'info → on laisse passer » ferait rater des traits.
///
/// Départage : on capte un toucher ambigu UNIQUEMENT si un stylet est
/// réellement dans les parages — soit un tracé est en cours (`isDrawing`),
/// soit un stylet a été vu très récemment dans un hitTest (`lastPencilSeen`,
/// alimenté notamment par le survol/proximité de l'Apple Pencil). Sinon on
/// laisse passer → la WebView scrolle.
enum PencilTouchState {
    /// Vrai entre canvasViewDidBeginUsingTool et …DidEndUsingTool.
    static var isDrawing = false
    /// Horodatage (CACurrentMediaTime) du dernier hitTest ayant vu un stylet.
    static var lastPencilSeen: CFTimeInterval = 0
    /// Fenêtre pendant laquelle un toucher ambigu est considéré "stylet".
    static let pencilRecencyWindow: CFTimeInterval = 0.15

    /// Décision pour un hitTest dont l'événement ne contient AUCUNE info de
    /// toucher exploitable (n<=0). true → capter (dessin), false → laisser
    /// passer (scroll).
    static func shouldCaptureAmbiguous() -> Bool {
        if isDrawing { return true }
        return (CACurrentMediaTime() - lastPencilSeen) < pencilRecencyWindow
    }
}

// MARK: - PassthroughCanvasView

/// PKCanvasView qui laisse passer les touches du DOIGT vers la vue située
/// dessous (la WebView) afin de permettre le scroll de la page, tout en
/// captant l'Apple Pencil pour dessiner.
final class PassthroughCanvasView: PKCanvasView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        PassthroughHitTest.shouldCapture(event) ? super.hitTest(point, with: event) : nil
    }
}

// MARK: - PassthroughContainerView

/// Conteneur de l'overlay PencilKit. Il CLIPPE le canvas à la zone de dessin
/// visible (sous la barre d'outils, dans le viewport) et LAISSE PASSER les
/// touches du doigt/paume vers la WebView (scroll) ; seul l'Apple Pencil
/// atteint le canvas (dessin).
final class PassthroughContainerView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        PassthroughHitTest.shouldCapture(event) ? super.hitTest(point, with: event) : nil
    }
}

// MARK: - Logique de hitTest partagée (overlay)

enum PassthroughHitTest {
    /// Décide si l'overlay doit CAPTER le toucher (true → dessin) ou le LAISSER
    /// PASSER à la WebView (false → scroll). Règle commune au conteneur et au canvas :
    ///  1. Stylet présent dans l'événement → CAPTER + mémoriser l'instant.
    ///  2. Doigt/paume seuls (aucun stylet) → laisser passer (scroll).
    ///  3. Aucune info de toucher (n<=0, cas du POSER) → départage par
    ///     PencilTouchState (stylet récent / tracé en cours).
    static func shouldCapture(_ event: UIEvent?) -> Bool {
        let all = event?.allTouches
        let hasPencil = all?.contains(where: { $0.type == .pencil }) ?? false
        if hasPencil {
            PencilTouchState.lastPencilSeen = CACurrentMediaTime()
            return true                               // (1) stylet → dessin
        }
        let hasOther = all?.contains(where: { $0.type != .pencil }) ?? false
        if hasOther {
            return false                              // (2) doigt seul → scroll
        }
        // (3) ambigu : aucune info exploitable → départage stylet récent / tracé.
        return PencilTouchState.shouldCaptureAmbiguous()
    }
}

// MARK: - Transfert position de la gomme Pencil → web (gomme native "deux-en-un")

/// Recognizer NON bloquant attaché au PKCanvasView. Pendant l'effacement,
/// PKEraserTool efface l'encre NATIVE à l'écran ; ce recognizer transmet la
/// position du stylet au web (via onMove) pour que la gomme web superposée
/// efface aussi les traits rechargés (perfect-freehand) et PERSISTE la coupe
/// dans le store. Il ne consomme PAS les touches (cancelsTouchesInView=false) et
/// reconnaît SIMULTANÉMENT avec les recognizers internes de PencilKit → l'encre
/// native continue de s'effacer normalement. Hors gomme (isActive == false), il
/// échoue immédiatement → zéro interférence avec le stylo.
final class PencilEraserForwarder: UIGestureRecognizer, UIGestureRecognizerDelegate {
    var isActive: (() -> Bool)?
    var onMove: ((CGPoint) -> Void)?
    var onEnd: (() -> Void)?

    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    private func pencilLocation(_ touches: Set<UITouch>) -> CGPoint? {
        guard let v = view else { return nil }
        let t = touches.first(where: { $0.type == .pencil }) ?? touches.first
        return t?.location(in: v)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        guard isActive?() ?? false else { state = .failed; return }
        if let p = pencilLocation(touches) { onMove?(p) }
        state = .began
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        guard state == .began || state == .changed else { return }
        if let p = pencilLocation(touches) { onMove?(p) }
        state = .changed
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        if state == .began || state == .changed { onEnd?() }
        state = .ended
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        if state == .began || state == .changed { onEnd?() }
        state = .cancelled
    }

    // Reconnaître EN MÊME TEMPS que les recognizers de PencilKit (sinon l'un
    // annule l'autre → soit l'effacement natif, soit le transfert casserait).
    func gestureRecognizer(_ g: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        return true
    }
}
