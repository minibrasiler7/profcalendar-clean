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
    // Zone de dessin visible (le conteneur .pdf-viewer côté web, sous la barre
    // d'outils, dans le viewport). On l'utilise pour CLIPPER l'overlay natif.
    // Toujours affectée AVANT pageRect (dont le didSet déclenche le recadrage),
    // pour que updatePencilCanvasFrame lise une valeur fraîche.
    var clipRect = CGRect.zero

    // Config dessin courante
    var currentToolName: String = "pen"
    var currentColorHex: String = "#000000"
    var currentSize: Double = 2.0
    var currentOpacity: Double = 1.0
    var currentScale: Double = 1.0
    var currentPageId: String = "page-1"

    // Nombre de traits deja envoyes au web depuis le dernier effacement du
    // canvas. On n'efface plus le canvas apres chaque trait (l'encre native
    // reste affichee pendant la session) : on envoie donc seulement les
    // NOUVEAUX traits au-dela de ce compteur.
    private var sentStrokeCount = 0

    // FILET DE SÉCURITÉ scroll. On coupe le scroll de la WebView le temps d'un
    // tracé Pencil (palm-rejection). Le rétablissement via canvasViewDidEndUsingTool
    // n'est PAS fiable : quand le tracé sort du cadre du canvas (ex. trait tiré
    // au-dessus du PDF) ou est annulé, ce délégué peut ne jamais être appelé →
    // le scroll restait bloqué jusqu'au changement d'outil. Ce work item, (re)armé
    // au début ET à chaque mouvement du tracé, réactive le scroll peu après la fin
    // réelle du tracé même si le délégué de fin manque. Annulé immédiatement quand
    // canvasViewDidEndUsingTool arrive (cas normal → réactivation instantanée).
    private var scrollReenableWorkItem: DispatchWorkItem?
    private let scrollReenableDelay: TimeInterval = 0.6

    private func scheduleScrollReenable() {
        scrollReenableWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.webView?.scrollView.isScrollEnabled = true
            self?.webView?.scrollView.bounces = true
        }
        scrollReenableWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + scrollReenableDelay, execute: item)
    }

    private func reenableScrollNow() {
        scrollReenableWorkItem?.cancel()
        scrollReenableWorkItem = nil
        webView?.scrollView.isScrollEnabled = true
        webView?.scrollView.bounces = true
    }

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
        clipRect: CGRect,
        scale: Double,
        pageId: String
    ) {
        self.currentToolName = tool
        self.currentColorHex = color
        self.currentSize = size
        self.currentOpacity = opacity
        self.clipRect = clipRect      // AVANT pageRect (cf. commentaire propriété)
        self.pageRect = pageRect
        self.currentScale = scale
        // Changement de page : repartir d'un canvas natif vierge (les traits de
        // la page precedente ont deja ete materialises cote JS via le flush).
        if pageId != self.currentPageId {
            clearCanvas()
        }
        self.currentPageId = pageId
        self.isPencilKitActive = true

        // Mettre a jour l'outil PencilKit
        canvasView?.tool = currentPKTool

        print("[DrawingCoordinator] PencilKit activated: \(tool), color: \(color), size: \(size)")
    }

    func deactivatePencilKit() {
        isPencilKitActive = false
        clearCanvas() // Effacer le canvas natif + reinitialiser le compteur
        print("[DrawingCoordinator] PencilKit deactivated")
    }

    /// Efface l'encre native et reinitialise le compteur de traits envoyes.
    /// Appele a la desactivation et au changement de page (pour eviter que
    /// l'encre d'une page "bave" sur une autre). Le JS materialise les traits
    /// sur son canvas (flush) AVANT cet effacement.
    func clearCanvas() {
        canvasView?.drawing = PKDrawing()
        sentStrokeCount = 0
    }

    func updateTool(tool: String, color: String, size: Double, opacity: Double) {
        self.currentToolName = tool
        self.currentColorHex = color
        self.currentSize = size
        self.currentOpacity = opacity
        canvasView?.tool = currentPKTool
    }

    func updatePageRect(_ rect: CGRect, clipRect: CGRect, pageId: String? = nil) {
        // Changement de page pendant que PencilKit est actif : effacer l'encre
        // native (le JS a deja materialise les traits de la page quittee).
        if let pageId = pageId, pageId != self.currentPageId {
            clearCanvas()
            self.currentPageId = pageId
        }
        self.clipRect = clipRect      // AVANT pageRect (cf. commentaire propriété)
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
                    // keepsNativeInk=true : on NE vide PLUS le canvas natif après
                    // chaque trait. L'encre Apple native reste affichée "telle
                    // quelle" pendant toute la session (zéro re-rendu JS → pas de
                    // reshape ni de translation à main levée). Le web ne sert qu'à
                    // SAUVEGARDER le trait ; il le matérialise sur son canvas
                    // seulement au flush (changement de page / d'outil non-natif /
                    // fermeture), juste avant que clearCanvas() vide le natif.
                }
            }
        }
    }
}

// MARK: - PKCanvasViewDelegate

extension DrawingCoordinator: PKCanvasViewDelegate {
    // Début d'un vrai tracé Pencil : couper le scroll de la WebView le temps du
    // tracé (évite qu'une paume posée ne fasse défiler la page pendant qu'on
    // écrit). Le scroll au doigt reste possible le reste du temps.
    func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) {
        webView?.scrollView.isScrollEnabled = false
        // Armer le filet de sécurité : si la fin du tracé n'est pas signalée
        // (tracé sorti du cadre / annulé), le scroll sera quand même rétabli.
        scheduleScrollReenable()
    }

    // Fin du tracé Pencil : rétablir le scroll IMMÉDIATEMENT (cas normal).
    func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
        reenableScrollNow()
    }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        // Le tracé évolue → repousser le filet de sécurité. Tant que le stylet
        // bouge, le scroll reste coupé ; il sera rétabli peu après le DERNIER
        // mouvement, même si canvasViewDidEndUsingTool ne se déclenche pas.
        scheduleScrollReenable()

        let strokes = canvasView.drawing.strokes

        // Le nombre de traits a diminue (ex : gomme native / undo) → on
        // resynchronise simplement le compteur. (La gomme passe par le chemin
        // web ; le natif ne gere que pen/surligneur.)
        guard strokes.count > sentStrokeCount else {
            sentStrokeCount = strokes.count
            return
        }

        // N'envoyer que les NOUVEAUX traits au web (pour la sauvegarde). On
        // n'efface PLUS le canvas natif : l'encre reste affichee "telle quelle"
        // pendant toute la session. Le canvas est efface a la desactivation ou
        // au changement de page (clearCanvas()), apres que le JS a materialise
        // les traits sur son propre canvas (flush).
        for index in sentStrokeCount..<strokes.count {
            let strokeData = StrokeConverter.convert(
                stroke: strokes[index],
                tool: currentToolName,
                color: currentColorHex,
                size: currentSize,
                opacity: currentOpacity,
                pageId: currentPageId,
                scale: currentScale
            )
            sendStrokeToWeb(strokeData: strokeData)
        }
        sentStrokeCount = strokes.count
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
