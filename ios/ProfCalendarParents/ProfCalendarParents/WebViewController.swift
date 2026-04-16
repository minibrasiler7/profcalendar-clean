import UIKit
import WebKit

class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    // MARK: - Configuration

    private let baseURLString = "https://profcalendar.org/parent/login"
    private let hostName = "profcalendar.org"
    private let themeColor = UIColor(red: 26/255, green: 26/255, blue: 46/255, alpha: 1)
    private let accentColor = UIColor(red: 99/255, green: 102/255, blue: 241/255, alpha: 1)

    // MARK: - UI Elements

    private var webView: WKWebView!
    private var activityIndicator: UIActivityIndicatorView!
    private var offlineView: UIView!
    private var refreshControl: UIRefreshControl!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = themeColor
        setupWebView()
        setupActivityIndicator()
        setupOfflineView()
        setupPullToRefresh()
        setupSwipeNavigation()
        loadBaseURL()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    // MARK: - Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.allowsInlineMediaPlayback = true

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = themeColor
        webView.scrollView.backgroundColor = themeColor
        webView.allowsBackForwardNavigationGestures = true

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func setupActivityIndicator() {
        activityIndicator = UIActivityIndicatorView(style: .large)
        activityIndicator.color = .white
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.hidesWhenStopped = true
        view.addSubview(activityIndicator)
        NSLayoutConstraint.activate([
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    private func setupOfflineView() {
        offlineView = UIView()
        offlineView.translatesAutoresizingMaskIntoConstraints = false
        offlineView.backgroundColor = themeColor
        offlineView.isHidden = true
        view.addSubview(offlineView)
        NSLayoutConstraint.activate([
            offlineView.topAnchor.constraint(equalTo: view.topAnchor),
            offlineView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            offlineView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            offlineView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        offlineView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: offlineView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: offlineView.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: offlineView.leadingAnchor, constant: 40),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: offlineView.trailingAnchor, constant: -40)
        ])

        let iconLabel = UILabel()
        iconLabel.text = "📡"
        iconLabel.font = UIFont.systemFont(ofSize: 48)
        stack.addArrangedSubview(iconLabel)

        let titleLabel = UILabel()
        titleLabel.text = "Pas de connexion"
        titleLabel.font = UIFont.boldSystemFont(ofSize: 22)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        stack.addArrangedSubview(titleLabel)

        let subtitleLabel = UILabel()
        subtitleLabel.text = "Vérifie ta connexion internet et réessaie."
        subtitleLabel.font = UIFont.systemFont(ofSize: 15)
        subtitleLabel.textColor = UIColor.lightGray
        subtitleLabel.textAlignment = .center
        subtitleLabel.numberOfLines = 0
        stack.addArrangedSubview(subtitleLabel)

        let retryButton = UIButton(type: .system)
        retryButton.setTitle("Réessayer", for: .normal)
        retryButton.setTitleColor(.white, for: .normal)
        retryButton.titleLabel?.font = UIFont.boldSystemFont(ofSize: 16)
        retryButton.backgroundColor = accentColor
        retryButton.layer.cornerRadius = 12
        retryButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 32, bottom: 12, right: 32)
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)
        stack.addArrangedSubview(retryButton)

        stack.setCustomSpacing(20, after: subtitleLabel)
    }

    private func setupPullToRefresh() {
        refreshControl = UIRefreshControl()
        refreshControl.tintColor = .white
        refreshControl.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.addSubview(refreshControl)
    }

    private func setupSwipeNavigation() {
        let swipeLeft = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipe(_:)))
        swipeLeft.direction = .left
        let swipeRight = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipe(_:)))
        swipeRight.direction = .right
        view.addGestureRecognizer(swipeLeft)
        view.addGestureRecognizer(swipeRight)
    }

    // MARK: - Actions

    private func loadBaseURL() {
        guard let url = URL(string: baseURLString) else { return }
        activityIndicator.startAnimating()
        webView.load(URLRequest(url: url))
    }

    @objc private func retryTapped() {
        offlineView.isHidden = true
        loadBaseURL()
    }

    @objc private func pullToRefresh() {
        if let url = webView.url {
            webView.load(URLRequest(url: url))
        } else {
            loadBaseURL()
        }
    }

    @objc private func handleSwipe(_ gesture: UISwipeGestureRecognizer) {
        if gesture.direction == .right && webView.canGoBack {
            webView.goBack()
        } else if gesture.direction == .left && webView.canGoForward {
            webView.goForward()
        }
    }

    private func showOfflineView() {
        offlineView.isHidden = false
        activityIndicator.stopAnimating()
    }

    private func injectSafeAreaCSS() {
        let js = """
        (function() {
            var top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)')) || \(Int(view.safeAreaInsets.top));
            var bottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)')) || \(Int(view.safeAreaInsets.bottom));
            var left = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-left)')) || \(Int(view.safeAreaInsets.left));
            var right = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-right)')) || \(Int(view.safeAreaInsets.right));
            document.documentElement.style.setProperty('--sat', top + 'px');
            document.documentElement.style.setProperty('--sab', bottom + 'px');
            document.documentElement.style.setProperty('--sal', left + 'px');
            document.documentElement.style.setProperty('--sar', right + 'px');
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
        refreshControl.endRefreshing()
        offlineView.isHidden = true
        injectSafeAreaCSS()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        refreshControl.endRefreshing()
        let nsError = error as NSError
        if nsError.code == NSURLErrorNotConnectedToInternet ||
           nsError.code == NSURLErrorNetworkConnectionLost ||
           nsError.code == NSURLErrorTimedOut {
            showOfflineView()
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        refreshControl.endRefreshing()
        let nsError = error as NSError
        if nsError.code == NSURLErrorNotConnectedToInternet ||
           nsError.code == NSURLErrorNetworkConnectionLost ||
           nsError.code == NSURLErrorTimedOut ||
           nsError.code == NSURLErrorCannotFindHost ||
           nsError.code == NSURLErrorCannotConnectToHost {
            showOfflineView()
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        let scheme = url.scheme ?? ""

        // Handle tel: and mailto: schemes
        if scheme == "tel" || scheme == "mailto" {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
            return
        }

        // Handle external links (different host)
        if let host = url.host, scheme.hasPrefix("http") {
            if host.contains(hostName) {
                decisionHandler(.allow)
            } else if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
            return
        }

        decisionHandler(.allow)
    }

    // MARK: - WKUIDelegate

    // Handle target="_blank" links
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil || !(navigationAction.targetFrame!.isMainFrame) {
            if let url = navigationAction.request.url {
                if let host = url.host, host.contains(hostName) {
                    webView.load(navigationAction.request)
                } else {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
            }
        }
        return nil
    }

    // JavaScript alert()
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler()
        })
        present(alert, animated: true)
    }

    // JavaScript confirm()
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(true)
        })
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in
            completionHandler(false)
        })
        present(alert, animated: true)
    }

    // JavaScript prompt()
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { textField in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in
            completionHandler(nil)
        })
        present(alert, animated: true)
    }
}
