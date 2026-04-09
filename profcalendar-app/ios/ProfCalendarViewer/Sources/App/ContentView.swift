//
//  ContentView.swift
//  ProfCalendarViewer
//
//  Vue principale: WKWebView + PencilKit overlay
//

import SwiftUI

struct ContentView: View {
    @StateObject private var drawingCoordinator = DrawingCoordinator()
    
    var body: some View {
        ZStack {
            // WebView en arriere-plan
            WebViewContainer(coordinator: drawingCoordinator)
                .edgesIgnoringSafeArea(.all)
            
            // PencilKit overlay (transparent, au-dessus)
            if drawingCoordinator.isPencilKitActive {
                PencilKitOverlay(coordinator: drawingCoordinator)
                    .frame(
                        width: drawingCoordinator.pageRect.width,
                        height: drawingCoordinator.pageRect.height
                    )
                    .position(
                        x: drawingCoordinator.pageRect.midX,
                        y: drawingCoordinator.pageRect.midY
                    )
                    .allowsHitTesting(true)
            }
        }
        .statusBar(hidden: true)
    }
}
