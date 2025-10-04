# Plan de Migration - Système d'Annotation PDF

## 📋 Résumé
Migration du système d'annotation actuel (dessin Canvas natif) vers **perfect-freehand** pour obtenir une qualité Apple Freeform.

## ✅ Étapes Complétées

### 1. Recherche de bibliothèques
- **Choix : perfect-freehand v1.2.0**
- Utilisée par tldraw (concurrent direct de Freeform)
- Rendu vectoriel fluide avec sensibilité à la pression
- Performances optimales pour stylet

### 2. Nouveau système créé
- **Fichier : `static/js/pdf-annotation-engine.js`**
- Classe `PDFAnnotationEngine` avec :
  - Support perfect-freehand
  - Historique undo/redo
  - Export/Import JSON
  - Pression simulée par vélocité
  - Rendu optimisé avec throttling

### 3. Installation perfect-freehand
- **Via CDN Skypack** dans `templates/planning/lesson_view.html`
- Import en tant que module ES6
- Disponible via `window.getStroke`

---

## 🧹 Fonctions à Nettoyer dans unified-pdf-viewer.js

### Fonctions de dessin lissé (À SUPPRIMER)
Ces fonctions seront remplacées par perfect-freehand :

1. **`generateSmoothStroke(points)`** (ligne ~12175)
   - Génère un stroke avec l'ancienne méthode

2. **`drawSmoothStroke(ctx, stroke)`** (ligne ~12219)
   - Dessine un polygone lissé (ancien système)

3. **`drawPressureSensitiveStroke(ctx, stroke)`** (ligne ~12261)
   - Dessine avec variation de pression (ancien)

4. **`renderSmoothStrokeOptimized(ctx, points, force)`** (ligne ~12335)
   - Rendu optimisé avec throttling (ancien)

5. **`drawClassicStroke(ctx, points)`** (ligne ~12401)
   - Tracé classique avec shadow blur (cause pixellisation)

6. **`smoothPoints(points)`** (ligne ~12442)
   - Lissage gaussien des points

7. **`applyCatmullRomSmoothing(points)`** (ligne ~12472)
   - Lissage Catmull-Rom pour courbes

8. **`drawMultiPassStroke(ctx, points)`** (ligne ~12518)
   - Rendu multicouche (complexe, cause lenteur)

9. **`drawCurvedPath(ctx, points)`** (ligne ~12552)
   - Dessine un chemin courbe avec pression

### Variables de dessin lissé (À SUPPRIMER)
Dans le constructeur :
- `this.smoothDrawingPath` (ligne ~139)
- `this.currentSmoothStroke` (ligne ~140)
- `this.lastRenderTime` (ligne ~141)
- `this.renderThrottleMs` (ligne ~142)
- `this.fastDrawingMode` (ligne ~143)
- `this.lastTimestamp` (ligne ~144)

### Appels à remplacer
Dans la méthode `draw()` :
- Ligne 4357 : `this.renderSmoothStrokeOptimized(ctx, this.smoothDrawingPath)`
- Ligne 4393 : `this.renderSmoothStrokeOptimized(ctx, this.smoothDrawingPath, true)`

---

## 🔄 Plan d'Intégration

### Étape 1: Adapter unified-pdf-viewer.js
1. Importer `PDFAnnotationEngine`
2. Créer une instance par page
3. Remplacer les appels de dessin par les méthodes du nouveau moteur

### Étape 2: Mapper les événements
- `startDrawing()` → `engine.startPath(x, y, pressure)`
- `draw()` → `engine.addPoint(x, y, pressure)` → `engine.renderCurrentStroke(ctx)`
- `stopDrawing()` → `pathData = engine.endPath()` → Sauvegarder

### Étape 3: Gestion de la pression
- Utiliser `PointerEvent.pressure` si disponible
- Sinon : `engine.calculatePressureFromVelocity()`

### Étape 4: Persistance
- Remplacer le système actuel de sauvegarde ImageData
- Utiliser `engine.export()` pour JSON
- Charger avec `engine.import(data)`

---

## 🎯 Bénéfices Attendus

### Performance
- ✅ Moins de calculs lourds (Catmull-Rom, multi-pass)
- ✅ Throttling intelligent intégré
- ✅ Rendu vectoriel (pas de pixellisation)

### Qualité
- ✅ Traits nets sans flou (pas de shadowBlur)
- ✅ Pression naturelle (perfect-freehand)
- ✅ Courbes fluides (algorithme éprouvé)

### Réactivité
- ✅ Pas de perte de points en écriture rapide
- ✅ Suivi parfait du stylet
- ✅ Undo/Redo natif

---

## 📝 Prochaines Étapes

1. ✅ **Créer le fichier pdf-annotation-engine.js**
2. ✅ **Installer perfect-freehand via CDN**
3. ⏳ **Nettoyer les anciennes fonctions**
4. ⏳ **Intégrer le nouveau moteur dans unified-pdf-viewer.js**
5. ⏳ **Tester sur iPad avec Apple Pencil**
6. ⏳ **Commit et push vers develop**

---

## 🔗 Références

- **perfect-freehand** : https://github.com/steveruizok/perfect-freehand
- **tldraw** (utilise perfect-freehand) : https://github.com/tldraw/tldraw
- **CDN Skypack** : https://cdn.skypack.dev/perfect-freehand@1.2.0
