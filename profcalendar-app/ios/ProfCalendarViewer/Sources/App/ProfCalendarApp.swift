//
//  ProfCalendarApp.swift
//  ProfCalendarViewer
//
//  Application wrapper qui charge ProfCalendar dans une WKWebView
//  avec PencilKit overlay pour le dessin natif sur iPad.
//

import SwiftUI

@main
struct ProfCalendarApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .edgesIgnoringSafeArea(.all)
        }
    }
}
