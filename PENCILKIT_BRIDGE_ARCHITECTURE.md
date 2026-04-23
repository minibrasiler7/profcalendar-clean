# PencilKit Bridge Architecture
## ProfCalendar - iPad Native Drawing Integration

---

## Vue d'ensemble

L'objectif est d'obtenir un trait stylo natif iOS (zero latence) dans le lecteur PDF web, en utilisant PencilKit via un WKWebView bridge.

```
+--------------------------------------------------+
|  App Swift (WKWebView)                           |
|                                                  |
|  +--------------------------------------------+  |
|  |  Web App (profcalendar.org)                |  |
|  |                                            |  |
|  |  +--------------------------------------+  |  |
|  |  |  PDF Viewer (CleanPDFViewer)         |  |  |
|  |  |                                      |  |  |
|  |  |  Canvas annotations (web)            |  |  |
|  |  +--------------------------------------+  |  |
|  +--------------------------------------------+  |
|                                                  |
|  +--------------------------------------------+  |
|  |  PencilKit Canvas (natif, transparent)     |  |  <- Overlay quand outil = pen/highlighter
|  |  - Zero latence Apple Pencil               |  |
|  |  - Pression, inclinaison, azimuth          |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
```

---

## Flux de données

### 1. Activation du dessin natif
```
Web (JS) ---> Swift: "activatePencilKit" { tool: "pen", color: "#000", size: 2 }
Swift: Affiche PencilKit canvas transparent au-dessus de la WebView
```

### 2. Pendant le dessin
```
PencilKit gere tout nativement (zero latence)
L'utilisateur voit le trait directement via PencilKit
Aucune communication avec le web pendant le dessin
```

### 3. Fin du trait (stylet releve)
```
Swift ---> Web (JS): "strokeCompleted" {
    points: [{x, y, pressure, timestamp}, ...],
    color: "#000000",
    size: 2,
    tool: "pen",
    pageId: "page-1"
}
Web: Convertit en annotation standard et sauvegarde
PencilKit: Efface son canvas (le web prend le relais pour l'affichage)
```

### 4. Desactivation (changement d'outil)
```
Web (JS) ---> Swift: "deactivatePencilKit"
Swift: Cache le canvas PencilKit
Web: Reprend le controle total (outils geometriques, etc.)
```

---

## Gestion des outils

| Outil | Moteur | Raison |
|-------|--------|--------|
| **Stylo** | PencilKit (natif) | Latence zero, pression reelle |
| **Surligneur** | PencilKit (natif) | Meme avantage que stylo |
| Regle | Web (canvas) | Outil geometrique, pas besoin de latence |
| Compas | Web (canvas) | Outil geometrique |
| Rectangle | Web (canvas) | Outil geometrique |
| Fleche | Web (canvas) | Outil geometrique |
| Gomme | Web (canvas) | Besoin d'acceder aux annotations existantes |
| Texte | Web (canvas) | Interface HTML |

---

## Format d'annotation unifie

Toutes les annotations (PencilKit ou web) sont stockees dans le meme format :

```javascript
{
    id: "annotation-uuid",
    tool: "pen",              // ou "highlighter"
    color: "#000000",
    size: 2,
    opacity: 1.0,
    points: [
        { x: 100.5, y: 200.3, pressure: 0.7 },
        { x: 101.2, y: 201.1, pressure: 0.8 },
        // ...
    ],
    source: "pencilkit",      // ou "web" - pour tracking
    pageId: "page-1",
    timestamp: 1712600000000
}
```

Le rendu final utilise **perfect-freehand** dans les deux cas, garantissant un aspect visuel identique quelle que soit la source.

---

## Architecture Swift

### Fichiers principaux

```
profcalendar-app/
  ios/
    ProfCalendarViewer/
      ProfCalendarViewer.xcodeproj
      Sources/
        App/
          ProfCalendarApp.swift        # Point d'entree
          ContentView.swift            # Vue principale
        WebView/
          WebViewCoordinator.swift     # WKWebView + JS bridge
          MessageHandler.swift         # Gestion messages JS <-> Swift
        Drawing/
          PencilKitOverlay.swift       # Canvas PencilKit transparent
          StrokeConverter.swift        # Conversion PKStroke -> points JSON
          DrawingCoordinator.swift     # Logique activation/desactivation
        Models/
          StrokeData.swift             # Modele de donnees stroke
```

### JavaScript Bridge Protocol

**Web -> Swift (WKScriptMessageHandler):**
```javascript
// Depuis clean-pdf-viewer.js
window.webkit.messageHandlers.pencilKit.postMessage({
    action: "activate",
    config: {
        tool: "pen",
        color: "#000000",
        size: 2,
        opacity: 1.0,
        pageRect: { x: 0, y: 60, width: 375, height: 600 },
        scale: 2.0
    }
});

window.webkit.messageHandlers.pencilKit.postMessage({
    action: "deactivate"
});
```

**Swift -> Web (evaluateJavaScript):**
```swift
let js = "window.pencilKitBridge.onStrokeCompleted(\(jsonString))"
webView.evaluateJavaScript(js)
```

---

## Modifications cote Web (clean-pdf-viewer.js)

### 1. Detection de l'environnement
```javascript
// Detecter si on est dans une WKWebView avec PencilKit
get isPencilKitAvailable() {
    return window.webkit?.messageHandlers?.pencilKit != null;
}
```

### 2. Bridge API globale
```javascript
// API que Swift appelle apres un trait
window.pencilKitBridge = {
    onStrokeCompleted: (strokeData) => {
        // Convertir et sauvegarder comme annotation standard
        const annotation = this.convertPencilKitStroke(strokeData);
        this.saveAnnotation(annotation);
        this.redrawAnnotations(canvas, pageId);
    },
    
    onPageChanged: (pageId) => {
        // Informer Swift du changement de page
    }
};
```

### 3. Activation/desactivation selon l'outil
```javascript
setTool(tool) {
    // ... code existant ...
    
    if (this.isPencilKitAvailable) {
        if (tool === 'pen' || tool === 'highlighter') {
            // Activer PencilKit natif
            window.webkit.messageHandlers.pencilKit.postMessage({
                action: 'activate',
                config: {
                    tool: tool,
                    color: this.currentColor,
                    size: this.currentSize,
                    opacity: tool === 'highlighter' ? 0.5 : this.currentOpacity,
                    pageRect: this.getVisiblePageRect(),
                    scale: this.currentScale
                }
            });
        } else {
            // Desactiver PencilKit, repasser en web
            window.webkit.messageHandlers.pencilKit.postMessage({
                action: 'deactivate'
            });
        }
    }
}
```

---

## Etapes d'implementation

### Phase 1: JavaScript Bridge (cette session)
- [ ] Ajouter detection PencilKit dans CleanPDFViewer
- [ ] Creer window.pencilKitBridge API
- [ ] Modifier setTool() pour activer/desactiver PencilKit
- [ ] Ajouter convertPencilKitStroke() pour convertir les donnees
- [ ] Envoyer les infos de page/zoom a Swift

### Phase 2: App Swift (Xcode requis)
- [ ] Creer projet Xcode avec WKWebView
- [ ] Implementer WKScriptMessageHandler
- [ ] Ajouter PencilKit overlay transparent
- [ ] Convertir PKStroke en tableau de points
- [ ] Envoyer les strokes au web via evaluateJavaScript
- [ ] Gerer le positionnement/zoom du canvas PencilKit

### Phase 3: Integration
- [ ] Tester avec vrais PDF sur iPad
- [ ] Ajuster la conversion coordonnees (zoom, scroll, page)
- [ ] Tester coexistence annotations web + PencilKit
- [ ] Optimiser performance
