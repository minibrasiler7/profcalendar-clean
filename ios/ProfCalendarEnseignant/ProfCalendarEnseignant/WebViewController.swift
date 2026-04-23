import UIKit
import WebKit
import MobileCoreServices
import UniformTypeIdentifiers
import PhotosUI
import PencilKit

class WebViewController: UIViewController {

    // MARK: - Constants

    private let baseURLString = "https://profcalendar.org/auth/login"
    private let hostName = "profcalendar.org"
    private let themeColor = UIColor(red: 26/255, green: 26/255, blue: 46/255, alpha: 1)
    private let accentColor = UIColor(red: 99/255, green: 102/255, blue: 241/255, alpha: 1)

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
    private var pencilKitMessageHandler: PencilKitMessageHandler!

    // MARK: - Cross-scene navigation sync (external display mirroring)

    // Toutes les instances actives, pour synchroniser la navigation entre
    // la scène iPad et une éventuelle scène d'écran externe (Stage Manager,
    // AirPlay étendu). Dès qu'une instance termine une navigation, elle
    // pousse l'URL aux autres.
    private static var liveInstances = NSHashTable<WebViewController>.weakObjects()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        WebViewController.liveInstances.add(self)
        setupDrawingCoordinator()
        setupWebView()
        setupPencilKitCanvas()
        setupActivityIndicator()
        setupRefreshControl()
        setupOfflineView()
        setupSwipeNavigation()
        setupKeyboardObservers()
        setupApplePencilInteraction()
        loadBaseURL()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Le webView démarre juste sous la status bar pour éviter que le contenu ne passe dessous
        let topInset = view.safeAreaInsets.top
        let bottomInset = view.safeAreaInsets.bottom
        let contentFrame = CGRect(
            x: 0,
            y: topInset,
            width: view.bounds.width,
            height: view.bounds.height - topInset
        )
        webView?.frame = contentFrame
        offlineView?.frame = contentFrame
        pencilCanvas?.frame = contentFrame
        _ = bottomInset
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .darkContent
    }

    override var prefersStatusBarHidden: Bool {
        return false
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
        pencilCanvas = PKCanvasView()
        pencilCanvas.backgroundColor = .clear
        pencilCanvas.isOpaque = false
        pencilCanvas.drawingPolicy = .pencilOnly  // Seul l'Apple Pencil dessine, le doigt scroll
        pencilCanvas.delegate = drawingCoordinator
        pencilCanvas.tool = drawingCoordinator.currentPKTool

        // Desactiver le scroll du canvas PencilKit (PKCanvasView herite de UIScrollView)
        pencilCanvas.isScrollEnabled = false
        pencilCanvas.bounces = false

        pencilCanvas.isHidden = true  // Cache par defaut, active via JS bridge
        pencilCanvas.translatesAutoresizingMaskIntoConstraints = false

        drawingCoordinator.canvasView = pencilCanvas

        view.addSubview(pencilCanvas)
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
        broadcastCurrentURLToOtherScenes()
    }

    /// Propage l'URL courante aux autres WebViewController actifs
    /// (écran externe en Stage Manager ou AirPlay étendu) afin que tous
    /// affichent la même page que l'iPad.
    private func broadcastCurrentURLToOtherScenes() {
        guard let url = webView.url, !url.absoluteString.isEmpty else { return }
        for other in WebViewController.liveInstances.allObjects {
            if other === self { continue }
            if other.webView?.url?.absoluteString == url.absoluteString { continue }
            other.webView?.load(URLRequest(url: url))
        }
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
        pencilCanvas.isHidden = !isActive

        if isActive {
            // Desactiver le scroll de la WebView pendant le dessin
            webView.scrollView.isScrollEnabled = false
            webView.scrollView.bounces = false

            // Positionner le canvas PencilKit sur la zone de la page
            updatePencilCanvasFrame()

            // S'assurer que le canvas est au-dessus de tout (sauf activity indicator)
            view.bringSubviewToFront(pencilCanvas)

            pencilCanvas.tool = coordinator.currentPKTool
            pencilCanvas.drawing = PKDrawing()
        } else {
            // Reactiver le scroll
            webView.scrollView.isScrollEnabled = true
            webView.scrollView.bounces = true
        }
    }

    func drawingCoordinator(_ coordinator: DrawingCoordinator, didUpdatePageRect rect: CGRect) {
        updatePencilCanvasFrame()
    }

    private func updatePencilCanvasFrame() {
        let rect = drawingCoordinator.pageRect
        guard rect.width > 0 && rect.height > 0 else { return }

        pencilCanvas.translatesAutoresizingMaskIntoConstraints = true
        pencilCanvas.frame = rect
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
