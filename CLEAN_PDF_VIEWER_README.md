# Clean PDF Viewer - Documentation

## 📋 Vue d'ensemble

Nouveau lecteur PDF moderne avec architecture propre, créé from scratch pour remplacer l'ancien système instable.

## ✨ Fonctionnalités

### Layout
- **Sidebar gauche (1/5)** : Miniatures des pages avec scroll vertical
- **Viewer droite (4/5)** : Affichage du PDF avec scroll tactile
- Navigation par clic sur miniature
- Bouton **+** sous chaque miniature pour ajouter des pages

### Détection stylet/doigt
- **Stylet** : Annotation avec tous les outils
- **Doigt** : Scroll et zoom pinch uniquement
- Détection automatique via `pointerType`

### Outils d'annotation (tous vectoriels avec perfect-freehand)

1. **✏️ Stylo**
   - Taille variable (1-20px)
   - Couleur personnalisable
   - Rendu avec perfect-freehand

2. **🖍️ Surligneur**
   - Couleurs fluo (#FFFF00, #FF6B6B, #4ECDC4, etc.)
   - Opacité 50%
   - Taille variable

3. **🧹 Gomme**
   - Découpage vectoriel des strokes (Option B)
   - Taille variable
   - Préserve les autres annotations

4. **📏 Règle**
   - Trait droit de point A à point B
   - Couleur variable

5. **⭕ Compas**
   - Premier point = centre
   - Distance = rayon
   - Affiche flèche du rayon pendant le tracé
   - Couleur variable

6. **📐 Angle**
   - Premier point = vertex (centre)
   - Maintenir 0.5s pour valider le premier segment
   - Affiche la mesure en degrés
   - **Toujours ≤ 180°** (angle le plus petit)

7. **🌙 Arc de cercle**
   - Logique similaire à l'angle
   - Pas d'affichage du rayon (seulement l'arc)

8. **➡️ Flèche**
   - Pointe avec triangle rempli
   - Couleur variable

9. **⬜ Rectangle**
   - Contour seulement
   - Couleur variable

10. **⚫ Disque rempli**
    - Cercle plein
    - Couleur variable

11. **📊 Grille 1cm**
    - Grille de 1cm × 1cm réels
    - 37.8px à 96 DPI
    - Couleur #cccccc

12. **👥 Suivi des élèves**
    - Affiche le panneau par-dessus le PDF
    - Bouton de fermeture pour revenir

### Pages spéciales

#### Pages vierges
- Format A4 : 794 × 1123 pixels
- Fond blanc

#### Pages graphiques
- Axes X et Y : -15 à +15 par défaut
- Panneau de configuration :
  - Modifier l'intervalle de chaque axe
  - Entrer une fonction mathématique
  - Choisir la couleur du trait
  - Bouton "Tout effacer"

### Historique & Sauvegarde

- **Undo/Redo global** : Historique unique pour tout le document
- **Auto-save** : Toutes les 5 secondes si modifications
- **Sauvegarde optimisée** : Ne bloque pas l'interface
- **Format vectoriel** : Toutes les annotations en vecteur

### Menu Télécharger/Envoyer

- Télécharger le PDF avec annotations
- Envoyer à tous les élèves
- Envoyer aux élèves absents durant la période
- Sélectionner des élèves spécifiques

## 🏗️ Architecture

### Fichiers

```
static/js/
├── clean-pdf-viewer.js      # Viewer principal (1774 lignes)
└── clean-pdf-tools.js        # Outils d'annotation avancés

templates/
└── test_clean_viewer.html    # Page de test
```

### Classes principales

#### `CleanPDFViewer`
Gère le viewer, les pages, la navigation, l'historique

**Méthodes clés :**
- `loadPDF(url)` : Charger un PDF
- `renderPages()` : Rendre toutes les pages
- `addPage(afterPageId, type)` : Ajouter page vierge/graphique
- `undo()` / `redo()` : Historique global
- `saveAnnotations()` : Sauvegarder (auto-save)
- `close()` : Fermer et nettoyer

#### `AnnotationTools`
Gère le rendu des outils avec perfect-freehand

**Méthodes clés :**
- `drawWithPerfectFreehand()` : Rendu stylo/surligneur
- `drawRuler()`, `drawCompass()`, `drawAngle()`, `drawArc()`
- `drawArrow()`, `drawRectangle()`, `drawDisk()`, `drawGrid()`
- `eraseVectorial()` : Gomme avec découpage

## 🔌 Intégration dans lesson_view.html

### 1. Ajouter les scripts

```html
<!-- PDF.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
</script>

<!-- Perfect Freehand -->
<script type="module">
    import { getStroke } from 'https://cdn.skypack.dev/perfect-freehand@1.2.0';
    window.getStroke = getStroke;
</script>

<!-- Clean PDF Viewer -->
<script src="{{ url_for('static', filename='js/clean-pdf-tools.js') }}"></script>
<script src="{{ url_for('static', filename='js/clean-pdf-viewer.js') }}"></script>
```

### 2. Créer le container

```html
<div id="clean-pdf-viewer-container" style="display: none;"></div>
```

### 3. Initialiser le viewer

```javascript
let cleanPDFViewer = null;

function openPDFWithCleanViewer(pdfUrl, fileId) {
    // Afficher le container
    const container = document.getElementById('clean-pdf-viewer-container');
    container.style.display = 'block';

    // Créer le viewer
    cleanPDFViewer = new CleanPDFViewer('clean-pdf-viewer-container', {
        fileId: fileId,
        pdfUrl: pdfUrl,
        showSidebar: true,
        enableAnnotations: true,
        autoSaveInterval: 5000,
        onClose: () => {
            container.style.display = 'none';
            cleanPDFViewer = null;
        }
    });
}
```

### 4. Fermer le viewer

```javascript
function closePDFViewer() {
    if (cleanPDFViewer) {
        cleanPDFViewer.close();
    }
}
```

## 🧪 Test

### Route Flask (à ajouter)

```python
@app.route('/test_clean_viewer')
def test_clean_viewer():
    return render_template('test_clean_viewer.html')
```

### Tester

1. Démarrer Flask
2. Aller sur `/test_clean_viewer`
3. Vérifier :
   - Layout sidebar + viewer
   - Miniatures avec boutons +
   - Outils dans la toolbar
   - Détection stylet/doigt
   - Annotations avec perfect-freehand

## 📊 Comparaison ancien vs nouveau

| Fonctionnalité | Ancien (unified-pdf-viewer.js) | Nouveau (clean-pdf-viewer.js) |
|---|---|---|
| **Taille** | 14 023 lignes | 1 774 lignes |
| **Architecture** | Monolithique | Modulaire |
| **Outils** | Mélange vectoriel/bitmap | 100% vectoriel |
| **Gomme** | Bugguée (efface tout) | Découpage vectoriel |
| **Historique** | Par page | Global |
| **Code obsolète** | 20+ sections SUPPRIMÉ | 0 |
| **Performance** | Logs partout | Optimisé |
| **Maintenance** | Difficile | Facile |

## 🚀 Prochaines étapes

1. ✅ Architecture de base
2. ✅ Layout et miniatures
3. ✅ Détection stylet/doigt
4. ✅ Outils vectoriels
5. ⏳ Tester sur iPad avec Apple Pencil
6. ⏳ Intégrer dans lesson_view.html
7. ⏳ Migrer les routes Flask existantes
8. ⏳ Désactiver l'ancien viewer

## 📝 Notes techniques

### Gomme vectorielle

La gomme utilise l'**Option B** (découpage vectoriel) :
- Teste l'intersection avec chaque point du stroke
- Découpe le stroke en segments si nécessaire
- Retourne plusieurs strokes si le stroke est coupé en deux

```javascript
// Exemple
const annotations = [{points: [p1, p2, p3, p4, p5]}];
const erased = tools.eraseVectorial(annotations, eraserPoint, eraserSize);
// Résultat : [{points: [p1, p2]}, {points: [p4, p5]}] // p3 effacé
```

### Grille 1cm

```javascript
// 1cm réel à 96 DPI
const gridSize = 37.8; // pixels

// Formule : 1cm = 1/2.54 inches = 0.3937 inches
// 0.3937 inches × 96 DPI = 37.8 pixels
```

### Perfect-freehand

```javascript
const outlinePoints = window.getStroke(points, {
    size: 2,              // Taille du trait
    thinning: 0,          // Pas de variation
    smoothing: 0.15,      // Lissage minimal
    streamline: 0.3,      // Streamline minimal
    simulatePressure: false,
    last: true            // true si stroke terminé
});
```

## 🐛 Debugging

### Activer les logs

```javascript
window.viewer.debug = true; // Dans la console
```

### Vérifier perfect-freehand

```javascript
console.log(typeof window.getStroke); // doit être 'function'
```

### Inspecter les annotations

```javascript
console.log(viewer.annotations); // Map de pageId -> annotations[]
console.log(viewer.annotationHistory); // Historique global
```

## 📞 Support

Pour tout problème ou question, consulter le code source ou ouvrir une issue.

---

**Version** : 2.0.0
**Date** : 2025-01-18
**Auteur** : ProfCalendar
