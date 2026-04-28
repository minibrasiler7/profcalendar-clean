//
//  DrawingCoordinator.swift
//  ProfCalendarEnseignant
//
//  Coordinateur central qui gere l'etat du dessin PencilKit
//  et la communication entre la WebView et le canvas natif.
//  (Adapté en UIKit depuis le projet ProfCalendarViewer)
//

import UIKit
import PencilKit
import WebKit

protocol DrawingCoordinatorDelegate: AnyObject {
    func drawingCoordinator(_ coordinator: DrawingCoordinator, didChangeActiveState isActive: Bool)
    func drawingCoordinator(_ coordinator: DrawingCoordinator, didUpdatePageRect rect: CGRect)
}

class DrawingCoordinator: NSObject {
    // Etat PencilKit
    var isPencilKitActive = false {
        didSet {
            delegate?.drawingCoordinator(self, didChangeActiveState: isPencilKitActive)
        }
    }
    var pageRect = CGRect.zero {
        didSet {
            delegate?.drawingCoordinator(self, didUpdatePageRect: pageRect)
        }
    }

    // Config dessin courante
    var currentToolName: String = "pen"
    var currentColorHex: String = "#000000"
    var currentSize: Double = 2.0
    var currentOpacity: Double = 1.0
    var currentScale: Double = 1.0
    var currentPageId: String = "page-1"

    // References UI
    weak var webView: WKWebView?
    weak var canvasView: PKCanvasView?
    weak var delegate: DrawingCoordinatorDelegate?

    // Outil PencilKit courant
    var currentPKTool: PKTool {
        let color = UIColor(hex: currentColorHex)?.withAlphaComponent(currentOpacity) ?? .black

        switch currentToolName {
        case "highlighter":
            return PKInkingTool(.marker, color: color, width: CGFloat(currentSize * currentScale * 3))
        case "eraser":
            return PKEraserTool(.bitmap)
        default: // pen
            return PKInkingTool(.pen, color: color, width: CGFloat(currentSize * currentScale))
        }
    }

    // MARK: - Activation / Desactivation

    func activatePencilKit(
        tool: String,
        color: String,
        size: Double,
        opacity: Double,
        pageRect: CGRect,
        scale: Double,
        pageId: String
    ) {
        self.currentToolName = tool
        self.currentColorHex = color
        self.currentSize = size
        self.currentOpacity = opacity
        self.pageRect = pageRect
        self.currentScale = scale
        self.currentPageId = pageId
        self.isPencilKitActive = true

        // Mettre a jour l'outil PencilKit
        canvasView?.tool = currentPKTool

        print("[DrawingCoordinator] PencilKit activated: \(tool), color: \(color), size: \(size)")
    }

    func deactivatePencilKit() {
        isPencilKitActive = false
        canvasView?.drawing = PKDrawing() // Effacer le canvas
        print("[DrawingCoordinator] PencilKit deactivated")
    }

    func updateTool(tool: String, color: String, size: Double, opacity: Double) {
        self.currentToolName = tool
        self.currentColorHex = color
        self.currentSize = size
        self.currentOpacity = opacity
        canvasView?.tool = currentPKTool
    }

    func updatePageRect(_ rect: CGRect) {
        self.pageRect = rect
    }

    // MARK: - Communication avec le Web

    func sendStrokeToWeb(strokeData: StrokeData) {
        guard let json = StrokeConverter.toJSON(strokeData) else {
            print("[DrawingCoordinator] Failed to encode stroke")
            return
        }

        let js = "window.pencilKitBridge && window.pencilKitBridge.onStrokeCompleted(\(json))"

        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js) { result, error in
                if let error = error {
                    print("[DrawingCoordinator] JS error: \(error.localizedDescription)")
                } else {
                    print("[DrawingCoordinator] Stroke sent to web successfully")
                }
            }
        }
    }
}

// MARK: - PKCanvasViewDelegate

extension DrawingCoordinator: PKCanvasViewDelegate {
    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        // Un nouveau trait a ete complete
        let drawing = canvasView.drawing
        guard let lastStroke = drawing.strokes.last else { return }

        // Convertir le PKStroke en donnees JSON
        let strokeData = StrokeConverter.convert(
            stroke: lastStroke,
            tool: currentToolName,
            color: currentColorHex,
            size: currentSize,
            opacity: currentOpacity,
            pageId: currentPageId,
            scale: currentScale
        )

        // Envoyer au web via JavaScript bridge
        sendStrokeToWeb(strokeData: strokeData)

        // Effacer le canvas PencilKit (le web prend le relais pour l'affichage)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            canvasView.drawing = PKDrawing()
        }
    }
}

// MARK: - UIColor hex extension

extension UIColor {
    convenience init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else { return nil }

        let r = CGFloat((rgb & 0xFF0000) >> 16) / 255.0
        let g = CGFloat((rgb & 0x00FF00) >> 8) / 255.0
        let b = CGFloat(rgb & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b, alpha: 1.0)
    }
}
