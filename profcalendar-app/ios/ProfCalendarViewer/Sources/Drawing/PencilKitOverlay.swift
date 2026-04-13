//
//  PencilKitOverlay.swift
//  ProfCalendarViewer
//
//  Canvas PencilKit transparent qui se superpose a la WebView.
//  Gere le dessin natif Apple Pencil avec zero latence.
//

import SwiftUI
import PencilKit

struct PencilKitOverlay: UIViewRepresentable {
    @ObservedObject var coordinator: DrawingCoordinator
    
    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .pencilOnly  // Seul l'Apple Pencil dessine
        canvas.delegate = context.coordinator
        canvas.tool = coordinator.currentPKTool
        
        // Desactiver le scroll du canvas
        canvas.scrollView.isScrollEnabled = false
        canvas.scrollView.bounces = false
        
        coordinator.canvasView = canvas
        
        return canvas
    }
    
    func updateUIView(_ uiView: PKCanvasView, context: Context) {
        uiView.tool = coordinator.currentPKTool
    }
    
    func makeCoordinator() -> PencilKitDelegate {
        PencilKitDelegate(drawingCoordinator: coordinator)
    }
}

class PencilKitDelegate: NSObject, PKCanvasViewDelegate {
    let drawingCoordinator: DrawingCoordinator
    
    init(drawingCoordinator: DrawingCoordinator) {
        self.drawingCoordinator = drawingCoordinator
    }
    
    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        // Un nouveau trait a ete complete
        let drawing = canvasView.drawing
        guard let lastStroke = drawing.strokes.last else { return }
        
        // Convertir le PKStroke en donnees JSON
        let strokeData = StrokeConverter.convert(
            stroke: lastStroke,
            tool: drawingCoordinator.currentToolName,
            color: drawingCoordinator.currentColorHex,
            size: drawingCoordinator.currentSize,
            opacity: drawingCoordinator.currentOpacity,
            pageId: drawingCoordinator.currentPageId,
            scale: drawingCoordinator.currentScale
        )
        
        // Envoyer au web via JavaScript bridge
        drawingCoordinator.sendStrokeToWeb(strokeData: strokeData)
        
        // Effacer le canvas PencilKit (le web prend le relais pour l'affichage)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            canvasView.drawing = PKDrawing()
        }
    }
}
