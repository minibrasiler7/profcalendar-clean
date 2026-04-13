//
//  PencilKitMessageHandler.swift
//  ProfCalendarViewer
//
//  Gere les messages JavaScript -> Swift pour PencilKit.
//

import WebKit

class PencilKitMessageHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: DrawingCoordinator?
    
    init(coordinator: DrawingCoordinator) {
        self.coordinator = coordinator
    }
    
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            print("[PencilKit] Invalid message format")
            return
        }
        
        let config = body["config"] as? [String: Any]
        
        DispatchQueue.main.async { [weak self] in
            switch action {
            case "activate":
                self?.handleActivate(config: config)
            case "deactivate":
                self?.coordinator?.deactivatePencilKit()
            case "updatePageRect":
                self?.handleUpdatePageRect(config: config)
            default:
                print("[PencilKit] Unknown action: \(action)")
            }
        }
    }
    
    private func handleActivate(config: [String: Any]?) {
        guard let config = config else { return }
        
        let tool = config["tool"] as? String ?? "pen"
        let color = config["color"] as? String ?? "#000000"
        let size = config["size"] as? Double ?? 2.0
        let opacity = config["opacity"] as? Double ?? 1.0
        let scale = config["scale"] as? Double ?? 1.0
        let pageId = config["pageId"] as? String ?? "page-1"
        
        // Page rect
        var pageRect = CGRect.zero
        if let rectData = config["pageRect"] as? [String: Any] {
            pageRect = CGRect(
                x: rectData["x"] as? Double ?? 0,
                y: rectData["y"] as? Double ?? 0,
                width: rectData["width"] as? Double ?? 0,
                height: rectData["height"] as? Double ?? 0
            )
        }
        
        coordinator?.activatePencilKit(
            tool: tool,
            color: color,
            size: size,
            opacity: opacity,
            pageRect: pageRect,
            scale: scale,
            pageId: pageId
        )
    }
    
    private func handleUpdatePageRect(config: [String: Any]?) {
        guard let config = config,
              let rectData = config["pageRect"] as? [String: Any] else { return }
        
        let rect = CGRect(
            x: rectData["x"] as? Double ?? 0,
            y: rectData["y"] as? Double ?? 0,
            width: rectData["width"] as? Double ?? 0,
            height: rectData["height"] as? Double ?? 0
        )
        
        coordinator?.updatePageRect(rect)
    }
}
