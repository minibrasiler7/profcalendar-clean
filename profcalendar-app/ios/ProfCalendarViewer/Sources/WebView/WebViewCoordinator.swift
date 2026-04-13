//
//  WebViewCoordinator.swift
//  ProfCalendarViewer
//
//  WKWebView qui charge profcalendar.org et gere le bridge JavaScript.
//

import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    @ObservedObject var coordinator: DrawingCoordinator
    
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        
        // Enregistrer le handler pour les messages PencilKit
        let handler = PencilKitMessageHandler(coordinator: coordinator)
        config.userContentController.add(handler, name: "pencilKit")
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.bounces = false
        
        // Stocker la reference dans le coordinator
        self.coordinator.webView = webView
        
        // Charger profcalendar
        if let url = URL(string: "https://profcalendar-clean-dev.onrender.com") {
            webView.load(URLRequest(url: url))
        }
        
        return webView
    }
    
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    
    func makeCoordinator() -> WebViewNavigationDelegate {
        WebViewNavigationDelegate()
    }
}

class WebViewNavigationDelegate: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[WebView] Page loaded")
    }
}
