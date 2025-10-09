/**
 * UnifiedPDFViewer - Composant PDF unifié avec outils avancés
 * Version: 2.0.0
 * Auteur: TeacherPlanner
 * 
 * Fonctionnalités:
 * - Mode adaptatif (complet, prévisualisation, étudiant)
 * - Outils d'annotation avancés
 * - Recherche de texte
 * - Navigation optimisée
 * - Sauvegarde automatique
 * - Interface moderne et responsive
 */

class UnifiedPDFViewer {
    constructor(containerId, options = {}) {
        // Configuration par mode d'utilisation
        this.modes = {
            'teacher': {
                name: 'Mode Enseignant',
                annotations: true,
                tools: ['pen', 'highlighter', 'eraser', 'ruler', 'compass', 'protractor', 'arc', 'text', 'arrow', 'rectangle', 'circle', 'grid'],
                features: ['search', 'thumbnails', 'ruler', 'laser', 'present'],
                colors: ['#000000', '#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899'],
                permissions: ['save', 'export', 'share']
            },
            'student': {
                name: 'Mode Étudiant',
                annotations: true,
                tools: ['highlighter', 'text', 'grid'],
                features: ['search', 'thumbnails'],
                colors: ['#F59E0B', '#22C55E', '#3B82F6', '#EC4899'],
                permissions: ['save']
            },
            'preview': {
                name: 'Mode Aperçu',
                annotations: false,
                tools: [],
                features: ['search', 'thumbnails'],
                colors: [],
                permissions: []
            },
            'split': {
                name: 'Mode Split Vue',
                annotations: true,
                tools: ['pen', 'highlighter', 'eraser', 'ruler', 'compass', 'protractor', 'arc', 'text', 'arrow', 'rectangle', 'circle', 'grid'],
                features: ['search', 'thumbnails', 'ruler', 'laser', 'present'],
                colors: ['#000000', '#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899'],
                permissions: ['save', 'export', 'share'],
                layout: 'split' // Indicateur pour l'affichage en split
            }
        };

        // Options par défaut
        this.options = {
            mode: 'teacher',
            enableKeyboardShortcuts: true,
            enableTouchGestures: true,
            autoSave: true,
            saveDelay: 3000,
            maxZoom: 2.5,
            minZoom: 0.5,
            zoomStep: 0.25,
            viewMode: 'continuous', // 'single' ou 'continuous'
            pageSpacing: 20, // Espacement entre les pages en mode continu
            apiEndpoints: {
                saveAnnotations: '/api/save-annotations',
                loadAnnotations: '/api/load-annotations',
                search: '/api/search-pdf'
            },
            debug: false,
            language: 'fr',
            studentData: null, // Données des élèves de la classe
            sanctionsData: null, // Données des sanctions
            seatingPlanHTML: null, // HTML du plan de classe
            smoothDrawing: false, // Désactiver perfect-freehand - utiliser tracé natif lissé
            pressureSensitive: true, // Variation d'épaisseur selon pression
            antiAliasing: true, // Anti-aliasing avancé pour contours lisses
            blurEffect: 0, // Pas de flou - rendu net
            ...options
        };

        // Configuration du mode
        this.currentMode = this.modes[this.options.mode] || this.modes.teacher;
        
        // Initialisation des propriétés
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container "${containerId}" non trouvé`);
        }

        // État PDF
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        // Ajuster l'échelle selon le mode
        if (this.currentMode.layout === 'split') {
            this.currentScale = 1.0; // Échelle réduite pour le mode split
        } else {
            this.currentScale = 1.5; // Échelle par défaut pour les autres modes
        }
        this.rotation = 0;
        this.isLoading = false;
        this.fileId = null;
        this.fileName = '';
        this.pages = new Map(); // Stockage des pages rendues
        this.pageElements = new Map(); // Éléments DOM des pages

        // État annotations
        this.annotations = new Map(); // page -> annotations[]
        this.currentTool = this.currentMode.tools[0] || 'pen';
        this.currentColor = this.currentMode.colors[0] || '#000000';
        this.penColor = this.currentMode.colors[0] || '#000000'; // Couleur fixe pour les outils géométriques
        this.penLineWidth = 2; // Épaisseur fixe pour les outils géométriques
        this.currentLineWidth = 2;
        this.blankPages = new Set(); // Pages vierges ajoutées
        this.deletedPages = new Set(); // Pages supprimées
        this.addedPages = new Map(); // Pages blanches ajoutées
        
        // Graphiques
        this.graphPages = new Map(); // page -> graph data
        this.currentGraphPage = null; // Page graphique actuellement sélectionnée
        this.graphControlPanel = null; // Panneau de contrôle graphique
        this.isDrawing = false;
        this.lastPoint = null;
        this.undoStack = new Map(); // page -> undo operations[]
        this.redoStack = new Map();

        // Fonctionnalité ligne droite automatique (style iPad)
        this.straightLineTimer = null;
        this.straightLineTimeout = 1000; // 2 secondes par défaut
        this.drawingPath = []; // Points du trait en cours
        this.startPoint = null; // Point de départ pour la ligne droite
        this.isStabilized = false; // Flag pour éviter les multiples conversions
        this.currentStrokeImageData = null; // Sauvegarde du canvas avant le trait actuel

        // Nouveau moteur d'annotation avec perfect-freehand
        this.annotationEngines = new Map(); // Un moteur par page
        
        // Variables pour l'outil rapporteur
        this.protractorState = 'initial'; // 'initial', 'drawing_first_line', 'waiting_validation', 'drawing_second_line'
        this.protractorCenterPoint = null;
        this.protractorFirstPoint = null;
        this.protractorSecondPoint = null;
        this.protractorValidationTimer = null;
        this.protractorValidationTimeout = 1000; // 1.5 secondes
        this.protractorCanvasState = null;
        this.protractorAngleElement = null;
        // Aimantation aux angles entiers
        this.protractorSnapToInteger = true; // Activer l'aimantation par défaut
        this.protractorSnapTolerance = 2; // Tolérance d'aimantation en degrés
        this.protractorSnappedPoint = null; // Point corrigé par l'aimantation

        // Outil règle
        this.rulerStartPoint = null; // Point de départ de la règle
        this.rulerCurrentPoint = null; // Point actuel de la règle
        this.rulerMeasureElement = null; // Élément d'affichage de la mesure
        this.rulerCanvasState = null; // Sauvegarde du canvas pour la prévisualisation
        this.a4PixelsPerCm = 28.35; // Pixels par cm pour A4 à 72 DPI (approximation)

        // Outil compas
        this.compassCenterPoint = null; // Point central du compas
        this.compassCurrentPoint = null; // Point actuel du compas
        this.compassRadiusElement = null; // Élément d'affichage du rayon
        this.compassCanvasState = null; // Sauvegarde du canvas pour la prévisualisation

        // Outil arc de cercle
        this.arcState = 'initial'; // 'initial', 'drawing_radius', 'waiting_validation', 'drawing_arc'
        this.arcCenterPoint = null; // Point central de l'arc
        this.arcRadiusPoint = null; // Point définissant le rayon
        this.arcEndPoint = null; // Point de fin de l'arc
        this.arcValidationTimer = null;
        this.arcValidationTimeout = 1000; // 1.5 secondes comme le rapporteur
        this.arcCanvasState = null; // Sauvegarde du canvas
        this.arcRadiusElement = null; // Élément d'affichage du rayon pendant le tracé
        this.arcAngleElement = null; // Élément d'affichage de l'angle pendant le tracé
        // Aimantation aux angles entiers pour l'arc
        this.arcSnapToInteger = true; // Activer l'aimantation par défaut
        this.arcSnapTolerance = 2; // Tolérance d'aimantation en degrés
        this.arcSnappedEndPoint = null; // Point corrigé par l'aimantation

        // Menu contextuel miniatures
        this.currentContextMenu = null;
        this.contextMenuPageNumber = null;

        // Gestion des pages ajoutées/supprimées
        this.addedPages = new Map(); // pages blanches ajoutées
        this.deletedPages = new Set(); // pages supprimées

        // Outil flèche
        this.arrowStartPoint = null; // Point de départ de la flèche
        this.arrowEndPoint = null; // Point d'arrivée de la flèche
        this.arrowCanvasState = null; // Sauvegarde du canvas pour la prévisualisation
        this.arrowLengthElement = null; // Élément d'affichage de la longueur

        // Outil rectangle
        this.rectangleStartPoint = null; // Point de départ du rectangle
        this.rectangleEndPoint = null; // Point d'arrivée du rectangle
        this.rectangleCanvasState = null; // Sauvegarde du canvas pour la prévisualisation
        this.rectangleMeasureElement = null; // Élément d'affichage des dimensions

        // Outil cercle
        this.circleStartPoint = null; // Point de départ du cercle (centre)
        this.circleEndPoint = null; // Point d'arrivée du cercle (définit le rayon)
        this.circleCanvasState = null; // Sauvegarde du canvas pour la prévisualisation
        this.circleMeasureElement = null; // Élément d'affichage du rayon

        // Outil grille
        this.gridSizeCm = 1; // Taille de la grille en centimètres (1cm par défaut)
        this.gridVisible = new Map(); // page -> boolean - visibilité de la grille par page
        this.gridColor = '#CCCCCC'; // Couleur de la grille
        this.gridOpacity = 0.5; // Opacité de la grille
        this.canvasStateBeforeGrid = new Map(); // page -> ImageData - état du canvas avant la grille

        // État interface
        this.isFullscreen = false;
        this.showSidebar = true;
        this.showToolbar = true;
        this.searchResults = [];
        this.currentSearchIndex = -1;

        // Événements
        this.eventListeners = new Map();
        this.saveTimeout = null;

        // Initialisation
        this.init();
    }

    /**
     * Initialisation du composant
     */
    init() {
        
        // Créer l'interface
        this.createInterface();
        
        // Initialiser les événements
        this.initEventListeners();
        
        // Raccourcis clavier
        if (this.options.enableKeyboardShortcuts) {
            this.initKeyboardShortcuts();
        }

        // Gestes tactiles
        if (this.options.enableTouchGestures) {
            this.initTouchGestures();
        }

    }

    /**
     * Création de l'interface utilisateur
     */
    createInterface() {
        // Déterminer les classes CSS selon le mode
        const containerClasses = ['unified-pdf-viewer'];
        if (this.currentMode.layout === 'split') {
            containerClasses.push('split-view-container');
        }
        
        this.container.innerHTML = `
            <div class="${containerClasses.join(' ')}" data-mode="${this.options.mode}">
                ${this.currentMode.layout === 'split' ? `
                <!-- Bouton de fermeture pour le mode split -->
                <button class="pdf-close-button" id="pdf-close-button" title="Fermer le lecteur PDF">
                    <i class="fas fa-times"></i>
                </button>
                ` : ''}
                <!-- Corps principal -->
                <div class="pdf-main">
                    <!-- Barre latérale -->
                    <div class="pdf-sidebar" id="pdf-sidebar" ${!this.showSidebar ? 'style="display: none;"' : ''}>
                        ${this.createSidebar()}
                    </div>
                    
                    <!-- Zone de visualisation -->
                    <div class="pdf-viewer-area">
                        <!-- Barre d'outils d'annotation -->
                        ${this.currentMode.annotations ? `<div class="pdf-annotation-toolbar">${this.createAnnotationToolbar()}</div>` : ''}
                        
                        <!-- Conteneur PDF -->
                        <div class="pdf-container" id="pdf-container">
                            <div class="pdf-loading" id="pdf-loading">
                                <div class="spinner"></div>
                                <p>Chargement du PDF...</p>
                            </div>
                            <div class="pdf-pages-container" id="pdf-pages-container">
                                <!-- Les pages seront générées dynamiquement ici -->
                            </div>
                        </div>
                        
                        <!-- Contrôles de navigation -->
                        <div class="pdf-nav-controls">
                            ${this.createNavigationControls()}
                        </div>
                    </div>
                </div>
                
                <!-- Boîtes de dialogue -->
                ${this.createDialogs()}
                
                <!-- Curseur personnalisé pour la gomme -->
                <div class="eraser-cursor" id="eraser-cursor"></div>
            </div>
        `;

        // Initialiser les références DOM
        this.initDOMReferences();
        
        // Appliquer les styles critiques
        this.injectCriticalStyles();
        
        // Initialiser les événements du bouton téléchargement
        this.initDownloadButton();
        
        // Configurer le mode d'affichage initial
        this.setupViewMode();
        
        // Configuration silencieuse pour performance maximale
        
        // Gestion automatique du cache
        this.manageBrowserCache();

        // Activer l'outil par défaut si les annotations sont disponibles
        if (this.currentMode.annotations && this.currentTool) {
            setTimeout(() => {
                this.setCurrentTool(this.currentTool);
                // Vérifier la taille de la toolbar après initialisation
                this.handleToolbarResize();
            }, 100);
        }
    }
    
    /**
     * Injection des styles critiques pour la toolbar
     */
    injectCriticalStyles() {
        if (!document.getElementById('unified-pdf-viewer-critical-styles')) {
            const style = document.createElement('style');
            style.id = 'unified-pdf-viewer-critical-styles';
            style.textContent = `
                /* === TAILLES PAR DÉFAUT RÉDUITES === */
                
                .pdf-annotation-toolbar .btn-tool, 
                .pdf-annotation-toolbar .btn-annotation-tool {
                    width: 28px !important;
                    height: 28px !important;
                    font-size: 12px !important;
                }
                
                .pdf-annotation-toolbar .color-btn {
                    width: 20px !important;
                    height: 20px !important;
                }
                
                .pdf-annotation-toolbar .stroke-btn {
                    width: 24px !important;
                    height: 24px !important;
                }
                
                .pdf-annotation-toolbar {
                    padding: 0.375rem 0.5rem !important;
                    gap: 0.25rem !important;
                    overflow: hidden !important;
                    min-height: 2.5rem !important;
                }
                
                .pdf-annotation-toolbar .annotation-tools,
                .pdf-annotation-toolbar .color-palette,
                .pdf-annotation-toolbar .stroke-options,
                .pdf-annotation-toolbar .annotation-actions {
                    gap: 0.1875rem !important;
                }
                
                .pdf-annotation-toolbar .student-tracking-section {
                    margin-left: 0.375rem !important;
                    padding-left: 0.375rem !important;
                    border-left: 1px solid #e5e7eb !important;
                }
                
                .pdf-annotation-toolbar .student-tracking-section .btn-tool {
                    background: #10b981 !important;
                    color: white !important;
                    border-color: #059669 !important;
                }
                
                .pdf-annotation-toolbar .student-tracking-section .btn-tool:hover {
                    background: #059669 !important;
                    transform: translateY(-1px) !important;
                }
                
                .pdf-annotation-toolbar .download-btn {
                    background: #3b82f6 !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.2s ease !important;
                    font-size: 12px !important;
                    width: 28px !important;
                    height: 28px !important;
                }
                
                .pdf-annotation-toolbar .download-btn:hover {
                    background: #2563eb !important;
                    transform: translateY(-1px) !important;
                }
                
                .download-menu-container {
                    position: relative !important;
                    display: inline-block !important;
                }
                
                /* === STYLES RESPONSIFS AVEC PRIORITÉ === */
                
                .pdf-annotation-toolbar.compact .btn-tool,
                .pdf-annotation-toolbar.compact .btn-annotation-tool,
                .pdf-annotation-toolbar.compact .download-btn {
                    width: 24px !important;
                    height: 24px !important;
                    font-size: 11px !important;
                }
                
                .pdf-annotation-toolbar.compact .color-btn {
                    width: 18px !important;
                    height: 18px !important;
                }
                
                .pdf-annotation-toolbar.compact .stroke-btn {
                    width: 20px !important;
                    height: 20px !important;
                }
                
                .pdf-annotation-toolbar.very-compact .btn-tool,
                .pdf-annotation-toolbar.very-compact .btn-annotation-tool,
                .pdf-annotation-toolbar.very-compact .download-btn {
                    width: 22px !important;
                    height: 22px !important;
                    font-size: 10px !important;
                }
                
                .pdf-annotation-toolbar.very-compact .color-btn {
                    width: 16px !important;
                    height: 16px !important;
                }
                
                .pdf-annotation-toolbar.very-compact .stroke-btn {
                    width: 18px !important;
                    height: 18px !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .btn-tool,
                .pdf-annotation-toolbar.ultra-compact .btn-annotation-tool,
                .pdf-annotation-toolbar.ultra-compact .download-btn {
                    width: 20px !important;
                    height: 20px !important;
                    font-size: 9px !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .color-btn {
                    width: 14px !important;
                    height: 14px !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .stroke-btn {
                    width: 16px !important;
                    height: 16px !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact {
                    padding: 0.25rem !important;
                    gap: 0.125rem !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .annotation-tools,
                .pdf-annotation-toolbar.ultra-compact .color-palette,
                .pdf-annotation-toolbar.ultra-compact .stroke-options,
                .pdf-annotation-toolbar.ultra-compact .annotation-actions {
                    gap: 0.0625rem !important;
                }
                
                /* === MENU DÉROULANT TÉLÉCHARGEMENT === */
                #download-dropdown-menu {
                    position: fixed !important;
                    z-index: 99999 !important;
                    background: white !important;
                    border: 1px solid #e5e7eb !important;
                    border-radius: 8px !important;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
                    min-width: 180px !important;
                    overflow: hidden !important;
                }
                
                .download-option {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    padding: 12px 16px !important;
                    cursor: pointer !important;
                    transition: background-color 0.2s ease !important;
                    color: #374151 !important;
                    font-size: 14px !important;
                    border: none !important;
                    background: transparent !important;
                    margin: 0 !important;
                }
                
                .download-option:hover {
                    background-color: #f3f4f6 !important;
                }
                
                .download-option:first-child {
                    border-bottom: 1px solid #f3f4f6 !important;
                }
                
                .download-option i {
                    color: #6b7280 !important;
                    width: 16px !important;
                    text-align: center !important;
                }
                
                .download-option span {
                    flex: 1 !important;
                }
                
                /* === ANIMATIONS POUR EXPORT === */
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                
                @keyframes slideOutRight {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
                
                /* === STYLES POUR LE MODE SPLIT VUE === */
                .split-view-container {
                    position: fixed !important;
                    top: 0 !important;
                    right: 0 !important;
                    width: 50vw !important;
                    height: 100vh !important;
                    z-index: 10000 !important;
                    background: white !important;
                    border-left: 1px solid #e5e7eb !important;
                    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1) !important;
                }
                
                /* Bouton de fermeture pour le mode split */
                .pdf-close-button {
                    position: absolute !important;
                    top: 5px !important;
                    right: 5px !important;
                    width: 28px !important;
                    height: 28px !important;
                    border-radius: 50% !important;
                    background: white !important;
                    border: 1px solid #e5e7eb !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    z-index: 10001 !important;
                    transition: all 0.2s !important;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
                }
                
                .pdf-close-button:hover {
                    background: #f3f4f6 !important;
                    transform: scale(1.05) !important;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
                }
                
                .pdf-close-button i {
                    font-size: 14px !important;
                    color: #6b7280 !important;
                }
                
                .pdf-close-button:hover i {
                    color: #374151 !important;
                }
                
                .split-view-container .pdf-annotation-toolbar {
                    padding: 0.25rem 0.375rem !important;
                    gap: 0.125rem !important;
                    min-height: 2rem !important;
                }
                
                .split-view-container .btn-tool,
                .split-view-container .btn-annotation-tool,
                .split-view-container .download-btn {
                    width: 24px !important;
                    height: 24px !important;
                    font-size: 10px !important;
                }
                
                .split-view-container .color-btn {
                    width: 16px !important;
                    height: 16px !important;
                }
                
                .split-view-container .stroke-btn {
                    width: 20px !important;
                    height: 20px !important;
                }
                
                .split-view-container #pdf-content-area {
                    height: calc(100vh - 3rem) !important;
                    width: 100% !important;
                }
                
                .split-view-container .pdf-page-container {
                    max-width: calc(50vw - 160px) !important; /* Largeur réduite pour tenir compte de la sidebar */
                    width: 100% !important;
                    margin: 0 auto 1rem auto !important;
                }
                
                .split-view-container .pdf-pages-container {
                    max-width: 100% !important;
                    overflow-x: hidden !important;
                }
                
                .split-view-container .pdf-canvas {
                    max-width: 100% !important;
                    height: auto !important;
                }
                
                .split-view-container .pdf-annotation-layer {
                    max-width: 100% !important;
                    height: auto !important;
                }
                
                .split-view-container .pdf-sidebar {
                    width: 120px !important;
                    min-width: 120px !important;
                }
                
                .split-view-container .thumbnail-sidebar {
                    width: 100% !important;
                }
                
                .split-view-container .thumbnails-container {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 0.75rem !important;
                    padding: 0.5rem !important;
                    height: 100% !important;
                    overflow-y: auto !important;
                }
                
                .split-view-container .thumbnail-item {
                    width: 100% !important;
                    height: auto !important;
                    margin-bottom: 0 !important;
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: center !important;
                    padding: 0.5rem !important;
                    background: #f9fafb !important;
                    border: 2px solid #e5e7eb !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    transition: all 0.2s !important;
                    min-height: 120px !important;
                }
                
                .split-view-container .thumbnail-item:hover {
                    border-color: #3b82f6 !important;
                    background: #eff6ff !important;
                }
                
                .split-view-container .thumbnail-item.active {
                    border-color: #3b82f6 !important;
                    background: #dbeafe !important;
                    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2) !important;
                }
                
                .split-view-container .thumbnail-canvas {
                    width: auto !important;
                    max-width: 100% !important;
                    height: auto !important;
                    max-height: 100px !important;
                    object-fit: contain !important;
                    display: block !important;
                    margin: 0 auto !important;
                }
                
                .split-view-container .thumbnail-number {
                    margin-top: 0.5rem !important;
                    font-size: 0.75rem !important;
                    font-weight: 600 !important;
                    color: #374151 !important;
                }
                
                .split-view-container .pdf-nav-controls {
                    position: fixed !important;
                    bottom: 0 !important;
                    right: 0 !important;
                    width: 50vw !important;
                    margin: 0 !important;
                    background: white !important;
                    border-top: 1px solid #e5e7eb !important;
                    z-index: 1001 !important;
                }
                
                .split-view-container .pdf-viewer-area {
                    height: 100vh !important;
                    display: flex !important;
                    flex-direction: column !important;
                }
                
                .split-view-container .pdf-container {
                    flex: 1 !important;
                    height: auto !important;
                    padding-bottom: 60px !important; /* Espace pour les contrôles de navigation */
                }
                
                /* Masquer le bouton "Suivi élève" en mode split */
                .split-view-container .student-tracking-section {
                    display: none !important;
                }
                
                /* Responsive pour écrans plus petits en mode split */
                @media (max-width: 1200px) {
                    .split-view-container {
                        width: 55vw !important;
                    }
                    
                    .split-view-container .pdf-page-container {
                        max-width: calc(55vw - 140px) !important;
                    }
                    
                    .split-view-container .pdf-nav-controls {
                        width: 55vw !important;
                    }
                }
                
                @media (max-width: 900px) {
                    .split-view-container {
                        width: 60vw !important;
                    }
                    
                    .split-view-container .pdf-page-container {
                        max-width: calc(60vw - 120px) !important;
                    }
                    
                    .split-view-container .pdf-nav-controls {
                        width: 60vw !important;
                    }
                    
                    .split-view-container .pdf-sidebar {
                        width: 100px !important;
                        min-width: 100px !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Configuration du mode d'affichage
     */
    setupViewMode() {
        if (this.options.viewMode === 'continuous') {
            this.elements.container?.classList.add('continuous-view');
        } else {
            this.elements.container?.classList.add('single-view');
        }
    }

    /**
     * Création de la barre latérale
     */
    createSidebar() {
        const tabs = [];

        let isFirstTab = true;
        
        // Onglet miniatures
        if (this.currentMode.features.includes('thumbnails')) {
            tabs.push(`
                <div class="sidebar-tab${isFirstTab ? ' active' : ''}" data-tab="thumbnails">
                    <i class="fas fa-th"></i> Pages
                </div>
            `);
            isFirstTab = false;
        }

        // Onglet annotations - SUPPRIMÉ
        // if (this.currentMode.annotations) {
        //     tabs.push(`
        //         <div class="sidebar-tab${isFirstTab ? ' active' : ''}" data-tab="annotations">
        //             <i class="fas fa-sticky-note"></i> Annotations
        //         </div>
        //     `);
        //     isFirstTab = false;
        // }

        // Onglet recherche - SUPPRIMÉ
        // if (this.currentMode.features.includes('search')) {
        //     tabs.push(`
        //         <div class="sidebar-tab${isFirstTab ? ' active' : ''}" data-tab="search">
        //             <i class="fas fa-search"></i> Recherche
        //         </div>
        //     `);
        //     isFirstTab = false;
        // }

        const firstPanelActive = this.currentMode.features.includes('thumbnails') ? 'thumbnails' : 'thumbnails';

        return `
            <div class="sidebar-tabs">
                ${tabs.join('')}
            </div>
            <div class="sidebar-content">
                <div class="sidebar-panel${firstPanelActive === 'thumbnails' ? ' active' : ''}" id="thumbnails-panel">
                    <div class="thumbnails-container" id="thumbnails-container">
                        <!-- Miniatures générées dynamiquement -->
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Création de la barre d'outils d'annotation
     */
    createAnnotationToolbar() {
        if (!this.currentMode.annotations) return '';

        const tools = [];

        // Outils de dessin
        this.currentMode.tools.forEach(tool => {
            const icons = {
                'pen': 'fa-pen',
                'highlighter': 'fa-highlighter',
                'eraser': 'fa-eraser',
                'ruler': 'fa-ruler',
                'compass': 'fa-circle-dot',
                'protractor': 'fa-angle-right',
                'arc': 'fa-circle-notch',
                'text': 'fa-font',
                'arrow': 'fa-arrow-right',
                'rectangle': 'fa-square',
                'circle': 'fa-circle',
                'grid': 'fa-th'
            };

            const names = {
                'pen': 'Stylo',
                'highlighter': 'Surligneur',
                'eraser': 'Gomme',
                'ruler': 'Règle',
                'compass': 'Compas',
                'protractor': 'Rapporteur',
                'arc': 'Arc',
                'text': 'Texte',
                'arrow': 'Flèche',
                'rectangle': 'Rectangle',
                'circle': 'Cercle',
                'grid': 'Grille'
            };

            tools.push(`
                <button class="btn-annotation-tool ${tool === this.currentTool ? 'active' : ''}" 
                        data-tool="${tool}" title="${names[tool]}">
                    <i class="fas ${icons[tool]}"></i>
                </button>
            `);
        });

        // Palette de couleurs
        const colorPalette = this.currentMode.colors.map(color => 
            `<button class="color-btn ${color === this.currentColor ? 'active' : ''}" 
                     data-color="${color}" 
                     style="background-color: ${color}" 
                     title="Couleur ${color}"></button>`
        ).join('');

        // Épaisseur du trait
        const strokeWidths = [1, 2, 3, 5, 8].map(width => 
            `<button class="stroke-btn ${width === this.currentLineWidth ? 'active' : ''}" 
                     data-width="${width}" title="Épaisseur ${width}px">
                <div class="stroke-preview" style="height: ${width}px;"></div>
             </button>`
        ).join('');

        return `
            <div class="annotation-tools">
                ${tools.join('')}
            </div>
            <div class="color-palette">
                ${colorPalette}
            </div>
            <div class="stroke-options">
                ${strokeWidths}
            </div>
            ${this.options.enableStudentTracking !== false ? `
            <div class="student-tracking-section">
                <button class="btn-tool" id="btn-student-tracking" title="Suivi élève">
                    <i class="fas fa-user-graduate"></i>
                </button>
            </div>
            ` : ''}
            <div class="annotation-actions">
                <button class="btn-tool" id="btn-undo" title="Annuler">
                    <i class="fas fa-undo"></i>
                </button>
                <button class="btn-tool" id="btn-redo" title="Refaire">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="btn-tool" id="btn-clear-page" title="Effacer la page">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="btn-tool" id="btn-fullscreen" title="Plein écran">
                    <i class="fas fa-expand"></i>
                </button>
            </div>
            <div class="download-menu-container" style="position: relative;">
                <button class="download-btn" id="btn-download-menu" title="Options de téléchargement" style="position: relative; z-index: 10;">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        `;
    }

    /**
     * Création des contrôles de navigation
     */
    createNavigationControls() {
        return `
            <div class="nav-left">
                <button class="btn-nav" id="btn-nav-prev" title="Page précédente">
                    <i class="fas fa-chevron-left"></i>
                </button>
            </div>
            <div class="nav-center">
                <span class="page-indicator" id="page-indicator">1 / 1</span>
            </div>
            <div class="nav-right">
                <button class="btn-nav" id="btn-nav-next" title="Page suivante">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    /**
     * Création des boîtes de dialogue
     */
    createDialogs() {
        return `
            <!-- Dialog de recherche avancée -->
            <div class="dialog" id="search-dialog">
                <div class="dialog-content">
                    <h3>Recherche avancée</h3>
                    <div class="search-options">
                        <label><input type="checkbox" id="search-case-sensitive"> Sensible à la casse</label>
                        <label><input type="checkbox" id="search-whole-words"> Mots entiers uniquement</label>
                        <label><input type="checkbox" id="search-regex"> Expression régulière</label>
                    </div>
                    <div class="dialog-actions">
                        <button class="btn-secondary" id="btn-search-cancel">Annuler</button>
                        <button class="btn-primary" id="btn-search-start">Rechercher</button>
                    </div>
                </div>
            </div>

            <!-- Dialog d'export -->
            <div class="dialog" id="export-dialog">
                <div class="dialog-content">
                    <h3>Exporter le document</h3>
                    <div class="export-options">
                        <label><input type="radio" name="export-type" value="pdf" checked> PDF avec annotations</label>
                        <label><input type="radio" name="export-type" value="images"> Images (PNG)</label>
                        <label><input type="radio" name="export-type" value="annotations"> Annotations uniquement</label>
                    </div>
                    <div class="page-range">
                        <label>Pages :</label>
                        <label><input type="radio" name="page-range" value="all" checked> Toutes</label>
                        <label><input type="radio" name="page-range" value="current"> Page actuelle</label>
                        <label><input type="radio" name="page-range" value="range"> Plage : 
                            <input type="text" id="page-range-input" placeholder="ex: 1-5, 8, 10-12">
                        </label>
                    </div>
                    <div class="dialog-actions">
                        <button class="btn-secondary" id="btn-export-cancel">Annuler</button>
                        <button class="btn-primary" id="btn-export-start">Exporter</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Initialisation des références DOM
     */
    initDOMReferences() {
        // Appliquer des adaptations spécifiques au mode split
        if (this.currentMode.layout === 'split') {
            // Ajouter l'ID pdf-content-area au conteneur principal pour les styles CSS
            const mainContainer = this.container.querySelector('.pdf-viewer-area');
            if (mainContainer) {
                mainContainer.id = 'pdf-content-area';
            }
        }
        
        this.elements = {
            container: document.getElementById('pdf-container'),
            pagesContainer: document.getElementById('pdf-pages-container'),
            loading: document.getElementById('pdf-loading'),
            toolbar: document.getElementById('pdf-toolbar'),
            sidebar: document.getElementById('pdf-sidebar'),
            
            // Navigation
            prevPage: document.getElementById('btn-prev-page'),
            nextPage: document.getElementById('btn-next-page'),
            currentPageInput: document.getElementById('current-page-input'),
            totalPages: document.getElementById('total-pages'),
            pageIndicator: document.getElementById('page-indicator'),
            
            // Zoom et mode d'affichage
            zoomSelect: document.getElementById('zoom-select'),
            zoomIn: document.getElementById('btn-zoom-in'),
            zoomOut: document.getElementById('btn-zoom-out'),
            viewModeBtn: document.getElementById('btn-view-mode'),
            
            // Recherche
            searchInput: document.getElementById('search-input'),
            searchBtn: document.getElementById('btn-search'),
            searchPrev: document.getElementById('btn-search-prev'),
            searchNext: document.getElementById('btn-search-next'),
            searchInfo: document.getElementById('search-info'),
            
            // Miniatures
            thumbnailsContainer: document.getElementById('thumbnails-container'),
            
            // Annotations
            annotationsList: document.getElementById('annotations-list'),
            
            // Curseur personnalisé
            eraserCursor: document.getElementById('eraser-cursor')
        };

        // Les canvas seront créés dynamiquement pour chaque page en mode continu
    }

    /**
     * Chargement d'un fichier PDF
     */
    async loadPDF(url, fileId = null, fileName = null) {
        try {
            this.showLoading(true);
            this.fileId = fileId;
            // Si un nom de fichier est fourni, l'utiliser, sinon extraire de l'URL
            this.fileName = fileName || url.split('/').pop();
            

            // Configuration de PDF.js
            const loadingTask = pdfjsLib.getDocument({
                url: url,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true
            });

            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;
            

            // Charger les annotations et la structure des pages AVANT le rendu
            if (this.currentMode.annotations && this.fileId) {
                await this.loadAnnotations();
                // La structure des pages a été restaurée, mettre à jour le total si nécessaire
            }

            // Mettre à jour l'interface
            this.updatePageInfo();
            
            // Initialiser le rendu selon le mode
            // Vérifier s'il y a des modifications de pages
            const hasPageModifications = (this.deletedPages && this.deletedPages.size > 0) || 
                                       (this.addedPages && this.addedPages.size > 0);
            
            if (this.options.viewMode === 'continuous') {
                if (hasPageModifications) {
                    await this.renderAllPagesWithAddedPages();
                } else {
                    await this.renderAllPages();
                }
            } else {
                await this.renderPage(1);
            }
            
            // Redessiner les annotations après le rendu des pages
            if (this.currentMode.annotations && this.fileId && this.annotations && this.annotations.size > 0) {
                await this.redrawAllAnnotations();
            }
            
            // Ajuster automatiquement à la largeur si souhaité
            // Décommentez la ligne suivante pour ajuster automatiquement à la largeur
            // this.fitToWidth();
            
            // Générer les miniatures avec un délai pour éviter les conflits
            if (this.currentMode.features.includes('thumbnails')) {
                // Marquer que les miniatures doivent être générées
                this.thumbnailsGenerated = false;
                setTimeout(() => {
                    // Vérifier si les miniatures n'ont pas déjà été générées
                    if (this.thumbnailsGenerated) {
                        return;
                    }
                    
                    // Vérifier s'il y a des pages modifiées
                    const hasModifications = (this.deletedPages && this.deletedPages.size > 0) || 
                                           (this.addedPages && this.addedPages.size > 0) ||
                                           (this.blankPages && this.blankPages.size > 0);
                    
                    if (hasModifications) {
                        this.generateThumbnailsWithAllPages();
                    } else {
                        this.generateThumbnails();
                    }
                    this.thumbnailsGenerated = true;
                }, 500);
            }

            this.showLoading(false);
            
            // Activer l'outil par défaut (stylo) après le chargement du PDF
            if (this.currentMode.annotations) {
                this.setCurrentTool('pen');
            }
            
            this.emit('pdf-loaded', { totalPages: this.totalPages, fileName: this.fileName });
            
        } catch (error) {
            this.showLoading(false);
            this.showError('Erreur lors du chargement du PDF: ' + error.message);
        }
    }

    /**
     * Rendu de toutes les pages en mode continu
     */
    async renderAllPages() {
        if (!this.pdfDoc) return;

        // Si des pages ont été ajoutées ou supprimées, utiliser la méthode spécialisée
        const hasModifications = (this.deletedPages && this.deletedPages.size > 0) ||
                               (this.addedPages && this.addedPages.size > 0) ||
                               (this.blankPages && this.blankPages.size > 0);

        if (hasModifications) {
            return await this.renderAllPagesWithAddedPages();
        }

        // SAUVEGARDER l'historique existant avant de recréer les pages
        console.log('💾 Sauvegarde de l\'historique avant re-rendu...');
        const savedUndoStack = new Map();
        const savedRedoStack = new Map();
        this.undoStack.forEach((stack, pageNum) => {
            if (stack && stack.length > 0) {
                savedUndoStack.set(pageNum, stack.slice()); // Copier le tableau
                console.log(`  - Page ${pageNum}: ${stack.length} états undo`);
            }
        });
        this.redoStack.forEach((stack, pageNum) => {
            if (stack && stack.length > 0) {
                savedRedoStack.set(pageNum, stack.slice());
            }
        });

        // Vider le conteneur
        this.elements.pagesContainer.innerHTML = '';
        this.pageElements.clear();

        // Créer et rendre chaque page
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            await this.createPageElement(pageNum);
        }

        // Configurer la détection de page visible
        this.setupPageVisibilityObserver();

        // Initialiser l'historique undo/redo avec un état vide pour chaque page
        this.initializeUndoHistory();

        // RESTAURER l'historique sauvegardé
        console.log('📥 Restauration de l\'historique après re-rendu...');
        savedUndoStack.forEach((stack, pageNum) => {
            this.undoStack.set(pageNum, stack);
            console.log(`  - Page ${pageNum}: ${stack.length} états restaurés`);
        });
        savedRedoStack.forEach((stack, pageNum) => {
            this.redoStack.set(pageNum, stack);
        });
        
        
        // Debug: Vérifier la hauteur totale du conteneur
        setTimeout(() => {
            const container = this.elements.pagesContainer;
            if (container) {
            }
        }, 1000);
    }

    /**
     * Création d'un élément de page
     */
    async createPageElement(pageNum) {
        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ 
                scale: this.currentScale, 
                rotation: this.rotation 
            });

            // Créer le conteneur de la page
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container';
            pageContainer.dataset.pageNumber = pageNum;
            pageContainer.style.marginBottom = `${this.options.pageSpacing}px`;

            // Créer le canvas principal
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-canvas';
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.dataset.pageNumber = pageNum;

            // Créer le canvas d'annotation si nécessaire
            let annotationCanvas = null;
            let annotationCtx = null;
            if (this.currentMode.annotations) {
                annotationCanvas = document.createElement('canvas');
                annotationCanvas.className = 'pdf-annotation-layer';
                annotationCanvas.dataset.pageNumber = pageNum;
                annotationCanvas.style.position = 'absolute';
                annotationCanvas.style.top = '0';
                annotationCanvas.style.left = '0';
                annotationCanvas.style.pointerEvents = 'none';
                
                // Configuration haute résolution pour tracé lisse
                const { ctx } = this.setupHighDPICanvas(annotationCanvas, viewport.width, viewport.height);
                annotationCtx = ctx;
            }

            // Ajouter un indicateur de page
            const pageIndicator = document.createElement('div');
            pageIndicator.className = 'page-number-indicator';
            pageIndicator.textContent = pageNum;

            // Assembler le conteneur
            pageContainer.style.position = 'relative';
            pageContainer.appendChild(canvas);
            if (annotationCanvas) {
                pageContainer.appendChild(annotationCanvas);
            }
            pageContainer.appendChild(pageIndicator);

            // Ajouter au conteneur principal
            this.elements.pagesContainer.appendChild(pageContainer);

            // Stocker les références
            this.pageElements.set(pageNum, {
                container: pageContainer,
                canvas: canvas,
                annotationCanvas: annotationCanvas,
                ctx: canvas.getContext('2d'),
                annotationCtx: annotationCtx, // Utiliser le contexte haute résolution
                viewport: viewport
            });

            // Rendre la page PDF
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            // Ne PAS appeler renderPageAnnotations au chargement initial
            // Cela efface les canvas inutilement - les annotations sont déjà sur le canvas
            // renderPageAnnotations sera appelée seulement quand nécessaire (grille, etc.)

            // Configurer les événements d'annotation pour cette page
            if (this.currentMode.annotations && annotationCanvas) {
                this.setupPageAnnotationEvents(pageNum, annotationCanvas);
            }


        } catch (error) {
        }
    }

    /**
     * Rendu d'une page (mode page unique)
     */
    async renderPage(pageNum) {
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPages) {
            return;
        }

        if (this.options.viewMode === 'continuous') {
            // En mode continu, juste scroller vers la page
            this.scrollToPage(pageNum);
            return;
        }

        try {
            this.currentPage = pageNum;

            // Vider le conteneur et créer une seule page
            this.elements.pagesContainer.innerHTML = '';
            await this.createPageElement(pageNum);
            
            // Initialiser l'historique pour cette page
            this.initializeUndoHistory();

            // Mettre à jour l'interface
            this.updatePageInfo();
            this.updateNavigationState();
            
            // Mettre à jour la visibilité des boutons graphiques
            this.updateAllGraphButtonsVisibility();

            this.emit('page-rendered', { pageNum });

        } catch (error) {
            this.showError('Erreur lors du rendu de la page: ' + error.message);
        }
    }

    /**
     * Scroll vers une page spécifique en mode continu
     */
    scrollToPage(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        
        if (pageElement && pageElement.container) {
            
            // Vérifier si l'élément est bien dans le DOM
            if (!document.contains(pageElement.container)) {
                return;
            }
            
            // Méthode 1: Scroll direct vers la position
            const targetScrollTop = pageElement.container.offsetTop - 20; // Petit offset
            
            this.elements.container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
            
            this.currentPage = pageNum;
            this.updatePageInfo();
        } else {
        }
    }

    /**
     * Configuration de l'observateur de visibilité des pages
     */
    setupPageVisibilityObserver() {
        if (!('IntersectionObserver' in window)) return;

        const observer = new IntersectionObserver((entries) => {
            let mostVisiblePage = null;
            let maxVisibility = 0;

            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.dataset.pageNumber);
                    const visibility = entry.intersectionRatio;
                    
                    if (visibility > maxVisibility) {
                        maxVisibility = visibility;
                        mostVisiblePage = pageNum;
                    }
                }
            });

            if (mostVisiblePage && mostVisiblePage !== this.currentPage) {
                this.currentPage = mostVisiblePage;
                this.updatePageInfo();
                this.updateThumbnailSelection();
                
                // Mettre à jour la visibilité des boutons graphiques
                this.updateAllGraphButtonsVisibility();
            }
        }, {
            root: null, // Utiliser le viewport par défaut
            threshold: [0.1, 0.5, 0.9]
        });

        // Observer toutes les pages
        this.pageElements.forEach((element, pageNum) => {
            observer.observe(element.container);
        });

        this.pageObserver = observer;
    }

    /**
     * Gestion des événements
     */
    initEventListeners() {
        // Navigation
        this.elements.prevPage?.addEventListener('click', () => this.previousPage());
        this.elements.nextPage?.addEventListener('click', () => this.nextPage());
        this.elements.currentPageInput?.addEventListener('change', (e) => {
            const pageNum = parseInt(e.target.value);
            if (pageNum >= 1 && pageNum <= this.totalPages) {
                this.goToPage(pageNum);
            }
        });

        // Zoom
        this.elements.zoomSelect?.addEventListener('change', (e) => this.setZoom(e.target.value));
        this.elements.zoomIn?.addEventListener('click', () => this.zoomIn());
        this.elements.zoomOut?.addEventListener('click', () => this.zoomOut());

        // Recherche
        this.elements.searchBtn?.addEventListener('click', () => this.search());
        this.elements.searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.search();
        });
        this.elements.searchPrev?.addEventListener('click', () => this.searchPrevious());
        this.elements.searchNext?.addEventListener('click', () => this.searchNext());

        // Annotations (si disponibles)
        if (this.currentMode.annotations) {
            this.initAnnotationEvents();
        }
        
        // Bouton de fermeture (mode split)
        if (this.currentMode.layout === 'split') {
            const closeButton = document.getElementById('pdf-close-button');
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    this.destroy();
                    // Appeler la fonction de fermeture définie dans calendar
                    if (typeof closePdfViewer === 'function') {
                        closePdfViewer();
                    }
                });
            }
        }

        // Redimensionnement
        window.addEventListener('resize', () => {
            this.handleResize();
            this.handleToolbarResize();
        });


        // Navigation des boutons du bas
        document.getElementById('btn-nav-prev')?.addEventListener('click', () => this.previousPage());
        document.getElementById('btn-nav-next')?.addEventListener('click', () => this.nextPage());
        
        // Gestion des onglets de la sidebar
        document.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.activateSidebarTab(tabName);
            });
        });
    }

    /**
     * Raccourcis clavier
     */
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return; // Ignorer si on écrit dans un champ
            }

            switch (e.key) {
                case 'ArrowLeft':
                case 'PageUp':
                    e.preventDefault();
                    this.previousPage();
                    break;
                case 'ArrowRight':
                case 'PageDown':
                    e.preventDefault();
                    this.nextPage();
                    break;
                case 'Home':
                    e.preventDefault();
                    this.goToPage(1);
                    break;
                case 'End':
                    e.preventDefault();
                    this.goToPage(this.totalPages);
                    break;
                case '+':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.zoomIn();
                    }
                    break;
                case '-':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.zoomOut();
                    }
                    break;
                case 'f':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.elements.searchInput?.focus();
                    }
                    break;
                case 'F11':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case 'g':
                case 'G':
                    // Ouvrir le panneau graphique si on est sur une page graphique
                    if (this.isCurrentPageGraph(this.currentPage)) {
                        e.preventDefault();
                        this.showGraphControlPanel(this.currentPage);
                    }
                    break;
                case 'v':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.toggleViewMode();
                    }
                    break;
                case 'z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.redo(); // Ctrl+Shift+Z = Redo
                        } else {
                            this.undo(); // Ctrl+Z = Undo
                        }
                    }
                    break;
                case 'y':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.redo(); // Ctrl+Y = Redo
                    }
                    break;
            }
        });
    }

    // ... (Les autres méthodes seront dans la suite)

    /**
     * Utilitaires
     */
    log(...args) {
        if (this.options.debug) {
            console.log('[UnifiedPDFViewer]', ...args);
        }
    }

    emit(eventName, data = {}) {
        const event = new CustomEvent(eventName, { detail: data });
        this.container.dispatchEvent(event);
    }

    showLoading(show) {
        if (this.elements.loading) {
            this.elements.loading.style.display = show ? 'flex' : 'none';
        }
    }

    showError(message) {
        // Implémentation d'affichage d'erreur
        console.error('[UnifiedPDFViewer] Erreur:', message);
        // Ici on pourrait ajouter une notification toast
    }

    updatePageInfo() {
        if (this.elements.currentPageInput) {
            this.elements.currentPageInput.value = this.currentPage;
        }
        if (this.elements.totalPages) {
            this.elements.totalPages.textContent = this.totalPages;
        }
        if (this.elements.pageIndicator) {
            this.elements.pageIndicator.textContent = `${this.currentPage} / ${this.totalPages}`;
        }
        
        // Mettre à jour l'état des boutons undo/redo pour la page courante
        this.updateUndoRedoButtons();
    }

    updateNavigationState() {
        if (this.elements.prevPage) {
            this.elements.prevPage.disabled = this.currentPage <= 1;
        }
        if (this.elements.nextPage) {
            this.elements.nextPage.disabled = this.currentPage >= this.totalPages;
        }
    }

    // Navigation
    previousPage() {
        if (this.currentPage > 1) {
            this.renderPage(this.currentPage - 1);
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.renderPage(this.currentPage + 1);
        }
    }

    goToPage(pageNum) {
        if (pageNum >= 1 && pageNum <= this.totalPages && pageNum !== this.currentPage) {
            this.renderPage(pageNum);
        }
    }

    // Zoom
    zoomIn() {
        const newScale = Math.min(this.currentScale + this.options.zoomStep, this.options.maxZoom);
        this.setZoom(newScale);
    }

    zoomOut() {
        const newScale = Math.max(this.currentScale - this.options.zoomStep, this.options.minZoom);
        this.setZoom(newScale);
    }

    setZoom(value) {
        if (typeof value === 'string') {
            switch (value) {
                case 'fit-width':
                    this.fitToWidth();
                    return;
                case 'fit-page':
                    this.fitToPage();
                    return;
                default:
                    value = parseFloat(value);
            }
        }

        if (isNaN(value) || value < this.options.minZoom || value > this.options.maxZoom) {
            return;
        }

        this.currentScale = value;

        console.log(`🔍 Zoom changé vers ${value}x`);

        // Re-render toutes les pages avec le nouveau zoom (avec délai pour éviter les race conditions)
        const self = this;
        setTimeout(function() {
            self.renderAllPages().then(function() {
                // Re-rendre les annotations vectorielles après le rendu des pages
                self.rerenderAllVectorAnnotations();
            }).catch(function(error) {
                console.error('❌ Erreur re-rendu pages:', error);
                // Fallback: render seulement la page courante
                self.renderPage(self.currentPage);
                self.rerenderAllVectorAnnotations();
            });

            // APPEL DIRECT supplémentaire pour s'assurer que les vecteurs sont toujours re-rendus
            // même si renderAllPages ne retourne pas de promesse correcte
            setTimeout(function() {
                self.rerenderAllVectorAnnotations();
            }, 300);
        }, 50);

        if (this.elements.zoomSelect) {
            this.elements.zoomSelect.value = value.toString();
        }
    }

    fitToWidth() {
        // Implémentation ajustement largeur
        const containerWidth = this.elements.container.clientWidth - 40; // padding
        if (this.pdfDoc && this.currentPage) {
            this.pdfDoc.getPage(this.currentPage).then(page => {
                const viewport = page.getViewport({ scale: 1 });
                const scale = containerWidth / viewport.width;
                this.setZoom(scale);
            });
        }
    }

    fitToPage() {
        // Implémentation ajustement page
        const containerWidth = this.elements.container.clientWidth - 40;
        const containerHeight = this.elements.container.clientHeight - 40;
        
        if (this.pdfDoc && this.currentPage) {
            this.pdfDoc.getPage(this.currentPage).then(page => {
                const viewport = page.getViewport({ scale: 1 });
                const scaleX = containerWidth / viewport.width;
                const scaleY = containerHeight / viewport.height;
                const scale = Math.min(scaleX, scaleY);
                this.setZoom(scale);
            });
        }
    }

    // Recherche
    async search(query = null) {
        // Implémentation de recherche sera ajoutée
    }

    /**
     * Basculer entre mode continu et page unique
     */
    async toggleViewMode() {
        const newMode = this.options.viewMode === 'continuous' ? 'single' : 'continuous';
        
        // Sauvegarder la page actuelle
        const currentPageBeforeSwitch = this.currentPage;
        
        // Mettre à jour le mode
        this.options.viewMode = newMode;
        
        // Mettre à jour l'interface
        this.updateViewModeButton();
        
        // Détruire l'observateur existant si il existe
        if (this.pageObserver) {
            this.pageObserver.disconnect();
            this.pageObserver = null;
        }
        
        // Re-rendre selon le nouveau mode
        if (newMode === 'continuous') {
            await this.renderAllPages();
            // Scroller vers la page actuelle
            this.scrollToPage(currentPageBeforeSwitch);
        } else {
            await this.renderPage(currentPageBeforeSwitch);
        }
        
        this.emit('view-mode-changed', { mode: newMode, currentPage: currentPageBeforeSwitch });
    }
    
    /**
     * Mettre à jour le bouton de mode d'affichage
     */
    updateViewModeButton() {
        if (this.elements.viewModeBtn) {
            const isContinuous = this.options.viewMode === 'continuous';
            this.elements.viewModeBtn.classList.toggle('active', isContinuous);
            
            const icon = this.elements.viewModeBtn.querySelector('i');
            if (icon) {
                icon.className = isContinuous ? 'fas fa-list' : 'fas fa-square';
            }
            
            this.elements.viewModeBtn.title = isContinuous ? 'Mode page unique' : 'Mode continu';
        }
    }
    
    /**
     * Mettre à jour la sélection des miniatures
     */
    updateThumbnailSelection() {
        const thumbnails = document.querySelectorAll('.thumbnail-item');
        thumbnails.forEach(thumb => {
            const pageNum = parseInt(thumb.dataset.pageNumber);
            thumb.classList.toggle('active', pageNum === this.currentPage);
        });
    }
    
    /**
     * Activer un onglet de la sidebar
     */
    activateSidebarTab(tabName) {
        // Désactiver tous les onglets
        document.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Désactiver tous les panels
        document.querySelectorAll('.sidebar-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        // Activer l'onglet et le panel correspondants
        const activeTab = document.querySelector(`.sidebar-tab[data-tab="${tabName}"]`);
        const activePanel = document.getElementById(`${tabName}-panel`);
        
        if (activeTab) activeTab.classList.add('active');
        if (activePanel) activePanel.classList.add('active');
        
    }

    // Méthodes publiques pour contrôle externe
    async destroy() {
        console.log('🗑️ Destruction du PDF viewer - nettoyage complet');

        // IMPORTANT: Sauvegarder les annotations avant de détruire
        if (this.currentMode.annotations && this.fileId) {
            console.log('  💾 Sauvegarde des annotations avant fermeture...');
            try {
                await this.saveAnnotations();
                console.log('  ✅ Annotations sauvegardées');
            } catch (error) {
                console.error('  ❌ Erreur lors de la sauvegarde:', error);
            }
        }

        // IMPORTANT: Détruire tous les moteurs d'annotation SimplePenAnnotation
        if (this.annotationEngines) {
            console.log(`  🧹 Nettoyage de ${this.annotationEngines.size} moteurs d'annotation`);
            this.annotationEngines.forEach((engine, pageNum) => {
                if (engine && typeof engine.destroy === 'function') {
                    engine.destroy();
                }
            });
            this.annotationEngines.clear();
        }

        // Nettoyage lors de la destruction
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        if (this.pageObserver) {
            this.pageObserver.disconnect();
        }

        // Fermer le panneau de configuration du graphique s'il est ouvert
        if (this.graphControlPanel) {
            this.hideGraphControlPanel();
        }

        // Nettoyer les event handlers du graphique
        if (this.graphEventHandlers) {
            this.graphEventHandlers = null;
        }

        // Nettoyer le handler de téléchargement
        if (this.downloadClickHandler) {
            document.removeEventListener('click', this.downloadClickHandler, true);
            this.downloadClickHandler = null;
        }

        // Nettoyer le handler de clic texte s'il existe
        if (this.textClickHandler) {
            document.removeEventListener('click', this.textClickHandler, true);
            this.textClickHandler = null;
        }

        this.eventListeners.clear();

        console.log('✅ Destruction terminée');
    }

    // Gestion du redimensionnement
    handleResize() {
        // Ajuster si nécessaire lors du redimensionnement
        setTimeout(() => {
            if (this.elements.zoomSelect?.value === 'fit-width') {
                this.fitToWidth();
            } else if (this.elements.zoomSelect?.value === 'fit-page') {
                this.fitToPage();
            }
        }, 100);
    }
    
    /**
     * Gestion du redimensionnement de la barre d'outils
     */
    handleToolbarResize() {
        const toolbar = document.querySelector('.pdf-annotation-toolbar');
        if (!toolbar) return;
        
        // Utiliser la largeur du conteneur PDF plutôt que de la fenêtre
        const pdfMain = document.querySelector('.pdf-main');
        const pdfViewerArea = document.querySelector('.pdf-viewer-area');
        const referenceContainer = pdfViewerArea || pdfMain || toolbar.parentElement;
        
        const availableWidth = referenceContainer.offsetWidth;
        const toolbarContent = toolbar.scrollWidth;
        
        
        // Différents niveaux de compaction selon l'espace disponible
        toolbar.classList.remove('compact', 'very-compact', 'ultra-compact');
        
        // Forcer la compaction selon la largeur disponible, même si pas de débordement visible
        if (availableWidth < 450) {
            toolbar.classList.add('ultra-compact');
        } else if (availableWidth < 600) {
            toolbar.classList.add('very-compact');
        } else if (availableWidth < 750 || toolbarContent > availableWidth) {
            toolbar.classList.add('compact');
        } else {
        }
        
        // Forcer un nouveau calcul après application des styles
        setTimeout(() => {
            const newScrollWidth = toolbar.scrollWidth;
            const newAvailableWidth = referenceContainer.offsetWidth;
            if (newScrollWidth > newAvailableWidth && !toolbar.classList.contains('ultra-compact')) {
                // Si on déborde encore, passer au niveau suivant
                if (toolbar.classList.contains('compact')) {
                    toolbar.classList.remove('compact');
                    toolbar.classList.add('very-compact');
                } else if (toolbar.classList.contains('very-compact')) {
                    toolbar.classList.remove('very-compact');
                    toolbar.classList.add('ultra-compact');
                }
            }
        }, 50);
    }

    /**
     * Initialisation des événements d'annotation
     */
    initAnnotationEvents() {
        // Sélecteurs d'outils
        document.querySelectorAll('.btn-annotation-tool').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.tool;
                // Performance optimisée - logs supprimés
                this.setCurrentTool(tool);
            });
        });

        // Palette de couleurs
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const color = e.currentTarget.dataset.color;
                this.setCurrentColor(color);
            });
        });

        // Épaisseur du trait
        document.querySelectorAll('.stroke-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const width = parseInt(e.currentTarget.dataset.width);
                this.setCurrentLineWidth(width);
            });
        });

        // Boutons Annuler/Refaire
        document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
        document.getElementById('btn-clear-page')?.addEventListener('click', () => this.clearCurrentPage());
        
        // Bouton plein écran
        document.getElementById('btn-fullscreen')?.addEventListener('click', () => this.toggleFullscreen());
        
        // Bouton suivi élève
        document.getElementById('btn-student-tracking')?.addEventListener('click', () => this.openStudentTracking());
    }
    
    /**
     * Initialiser les événements du bouton téléchargement
     */
    initDownloadButton() {
        // Utiliser la délégation d'événements pour éviter les problèmes de clonage DOM
        if (!this.downloadClickHandler) {
            this.downloadClickHandler = (e) => {
                // Vérifier si le clic vient du bouton de téléchargement ou de ses enfants
                const downloadBtn = e.target.closest('#btn-download-menu');
                
                if (downloadBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation(); // Empêcher toute propagation ultérieure
                    
                    this.toggleDownloadMenu(downloadBtn);
                }
            };
            
            // Ajouter l'événement au document avec capture=true pour intercepter avant tout autre handler
            document.addEventListener('click', this.downloadClickHandler, true);
        }
        
        // S'assurer que le bouton est toujours interactable
        const downloadBtn = document.getElementById('btn-download-menu');
        if (downloadBtn) {
            // Forcer les propriétés d'interactivité
            downloadBtn.style.pointerEvents = 'auto';
            downloadBtn.style.zIndex = '1000';
            downloadBtn.style.cursor = 'pointer';
            downloadBtn.disabled = false;
            downloadBtn.setAttribute('aria-disabled', 'false');
            
            // Vérifier l'état actuel
            const btnStyle = window.getComputedStyle(downloadBtn);
            
        } else {
        }
    }
    
    /**
     * Basculer l'affichage du menu de téléchargement
     */
    toggleDownloadMenu(button) {
        const existingMenu = document.getElementById('download-dropdown-menu');
        
        if (existingMenu) {
            // Fermer le menu existant
            existingMenu.remove();
            return;
        }
        
        // Créer un conteneur isolé pour éviter les transformations héritées
        const container = document.createElement('div');
        container.id = 'download-dropdown-container';
        container.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            pointer-events: none !important;
            z-index: 2147483647 !important;
            transform: none !important;
            will-change: auto !important;
        `;
        
        // Créer le menu dans le conteneur isolé
        const dropdown = document.createElement('div');
        dropdown.id = 'download-dropdown-menu';
        dropdown.className = 'download-dropdown show';
        
        // Configuration du contenu
        dropdown.innerHTML = `
            <div class="download-option" data-action="download" style="display: flex; align-items: center; gap: 8px; padding: 12px 16px; cursor: pointer; transition: background-color 0.2s ease; color: #374151; font-size: 14px; border: none; background: transparent;">
                <i class="fas fa-download" style="color: #6b7280; width: 16px; text-align: center;"></i>
                <span style="flex: 1;">Télécharger</span>
            </div>
            <div class="download-option" data-action="send-students" style="display: flex; align-items: center; gap: 8px; padding: 12px 16px; cursor: pointer; transition: background-color 0.2s ease; color: #374151; font-size: 14px; border: none; background: transparent;">
                <i class="fas fa-paper-plane" style="color: #6b7280; width: 16px; text-align: center;"></i>
                <span style="flex: 1;">Envoyer aux élèves</span>
            </div>
        `;
        
        // Calculer la position du bouton
        const buttonRect = button.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Position calculée
        let menuTop = buttonRect.bottom + 4;
        let menuLeft = buttonRect.right - 180;
        
        // Ajustements viewport
        if (menuTop + 100 > viewportHeight) {
            menuTop = buttonRect.top - 100 - 4;
        }
        
        if (menuLeft < 10) {
            menuLeft = buttonRect.left;
        }
        
        if (menuLeft + 180 > viewportWidth - 10) {
            menuLeft = viewportWidth - 190;
        }
        
        // Style du menu avec position absolue dans le conteneur
        dropdown.style.cssText = `
            position: absolute !important;
            top: ${menuTop}px !important;
            left: ${menuLeft}px !important;
            background: white !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 8px !important;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
            min-width: 180px !important;
            max-width: 250px !important;
            pointer-events: auto !important;
            display: block !important;
            opacity: 1 !important;
            visibility: visible !important;
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
        `;
        
        // Ajouter au DOM
        container.appendChild(dropdown);
        document.body.appendChild(container);
        
        
        // Forcer un recalcul du layout
        container.offsetHeight; // Force reflow
        
        // Vérifier la position réelle
        const menuRect = dropdown.getBoundingClientRect();
        
        // Si toujours mal positionné, utiliser une solution de dernier recours
        if (Math.abs(menuRect.top - menuTop) > 10) {
            
            // Créer un nouveau menu directement sous la toolbar
            container.remove();
            
            const fallbackMenu = document.createElement('div');
            fallbackMenu.id = 'download-dropdown-menu';
            fallbackMenu.className = 'download-dropdown show';
            fallbackMenu.innerHTML = dropdown.innerHTML;
            
            // Positionner directement sous la toolbar
            const toolbar = document.querySelector('.pdf-toolbar');
            const toolbarRect = toolbar ? toolbar.getBoundingClientRect() : { bottom: 60 };
            
            fallbackMenu.style.cssText = `
                position: fixed !important;
                top: ${toolbarRect.bottom + 10}px !important;
                right: 20px !important;
                background: white !important;
                border: 1px solid #e5e7eb !important;
                border-radius: 8px !important;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
                z-index: 2147483647 !important;
                min-width: 180px !important;
                pointer-events: auto !important;
                display: block !important;
            `;
            
            document.body.appendChild(fallbackMenu);
            dropdown = fallbackMenu;
            
        }
        
        // Événements du menu
        dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.download-option');
            if (option) {
                const action = option.dataset.action;
                this.handleDownloadAction(action);
                
                // Nettoyer le conteneur aussi s'il existe
                const cont = document.getElementById('download-dropdown-container');
                if (cont) cont.remove();
                else dropdown.remove();
            }
        });
        
        // Fermer le menu si on clique ailleurs
        const closeMenu = (e) => {
            if (!dropdown.contains(e.target) && !button.contains(e.target)) {
                const cont = document.getElementById('download-dropdown-container');
                if (cont) cont.remove();
                else dropdown.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        // Ajouter l'événement avec un délai
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 10);
        
        // Hover effects
        dropdown.querySelectorAll('.download-option').forEach(option => {
            option.addEventListener('mouseenter', () => {
                option.style.backgroundColor = '#f3f4f6';
            });
            option.addEventListener('mouseleave', () => {
                option.style.backgroundColor = 'transparent';
            });
        });
        
    }
    
    /**
     * Ouvre le panneau de suivi élève
     */
    openStudentTracking() {
        
        try {
            // Mettre à jour les données depuis le DOM principal avant d'ouvrir
            this.updateStudentDataFromDOM();
            
            // Vérifier si le panneau existe déjà et le réutiliser
            if (this.studentTrackingPanel && document.body.contains(this.studentTrackingPanel)) {
                // Rafraîchir le contenu si le panneau existe déjà
                this.refreshStudentTrackingContent();
                this.studentTrackingPanel.style.display = 'block';
            } else {
                // Nettoyer l'ancien panneau s'il existe mais n'est plus dans le DOM
                if (this.studentTrackingPanel) {
                    this.studentTrackingPanel = null;
                }
                
                // Supprimer les anciens styles s'ils existent
                const existingStyles = document.getElementById('student-tracking-styles');
                if (existingStyles) {
                    existingStyles.remove();
                }
                
                // Créer un nouveau panneau
                this.createStudentTrackingPanel();
            }
        } catch (error) {
            console.error('❌ Erreur lors de l’ouverture du panneau de suivi:', error);
            alert('Erreur lors de l’ouverture du panneau de suivi. Veuillez réessayer.');
        }
    }
    
    /**
     * Met à jour les données des élèves depuis le DOM principal
     */
    updateStudentDataFromDOM() {
        // Mettre à jour les données des sanctions
        const sanctionsData = {};
        document.querySelectorAll('.count-display').forEach(element => {
            const studentId = element.dataset.student;
            const sanctionId = element.dataset.sanction;
            const count = parseInt(element.textContent) || 0;
            sanctionsData[`${studentId}_${sanctionId}`] = count;
        });
        this.options.sanctionsData = sanctionsData;
        
        // Mettre à jour le plan de classe
        const seatingWorkspace = document.querySelector('#seating-workspace');
        if (seatingWorkspace) {
            this.options.seatingPlanHTML = seatingWorkspace.outerHTML;
        }
    }
    
    /**
     * Rafraîchit le contenu du panneau de suivi
     */
    refreshStudentTrackingContent() {
        if (!this.studentTrackingPanel) return;
        
        // Mettre à jour le contenu HTML
        this.studentTrackingPanel.innerHTML = this.getStudentTrackingHTML();
        
        // Reconfigurer les événements
        this.setupStudentTrackingEvents();
        
    }
    
    /**
     * Crée le panneau de suivi d'élèves
     */
    createStudentTrackingPanel() {
        // Créer le conteneur principal
        this.studentTrackingPanel = document.createElement('div');
        this.studentTrackingPanel.id = 'student-tracking-panel';
        this.studentTrackingPanel.innerHTML = this.getStudentTrackingHTML();
        
        // Ajouter les styles CSS
        this.injectStudentTrackingCSS();
        
        // Ajouter au DOM
        document.body.appendChild(this.studentTrackingPanel);
        
        // Configurer les événements
        this.setupStudentTrackingEvents();
        
    }
    
    /**
     * Génère le HTML du panneau de suivi d'élèves
     */
    getStudentTrackingHTML() {
        return `
            <div class="student-tracking-overlay">
                <div class="student-tracking-container">
                    <div class="student-tracking-header">
                        <h2><i class="fas fa-user-check"></i> Suivi des élèves</h2>
                        <button class="close-btn" onclick="this.closeStudentTracking()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="attendance-section">
                        <div class="section-header">
                            <h2 class="section-title">
                                <i class="fas fa-user-check"></i> Suivi des élèves
                            </h2>
                        </div>

                        <!-- Onglets de suivi -->
                        <div class="tracking-tabs">
                            <button class="tracking-tab active" onclick="showTrackingTab('attendance')">
                                <i class="fas fa-user-check"></i> Présences
                            </button>
                            
                            ${this.shouldShowSanctionsTab() ? `
                            <button class="tracking-tab" onclick="showTrackingTab('sanctions')">
                                <i class="fas fa-exclamation-triangle"></i> ${this.getSanctionsTabLabel()}
                            </button>
                            ` : ''}
                            
                            ${this.shouldShowSeatingPlanTab() ? `
                            <button class="tracking-tab" onclick="showTrackingTab('seating-plan')">
                                <i class="fas fa-th"></i> Plan de classe
                            </button>
                            ` : ''}
                        </div>

                        <div class="attendance-content tracking-content active" id="attendance-content">
                            <!-- Statistiques -->
                            <div class="attendance-stats">
                                <div class="stat-item present">
                                    <div class="stat-value" id="presentCount">7</div>
                                    <div class="stat-label">Présents</div>
                                </div>
                                <div class="stat-item absent">
                                    <div class="stat-value" id="absentCount">0</div>
                                    <div class="stat-label">Absents</div>
                                </div>
                                <div class="stat-item late">
                                    <div class="stat-value" id="lateCount">0</div>
                                    <div class="stat-label">Retards</div>
                                </div>
                            </div>

                            <!-- Liste des élèves -->
                            <div style="margin-bottom: 1rem; padding: 0.5rem; background-color: #f8f9fa; border-radius: 0.375rem;">
                                <h4 style="margin: 0; font-size: 0.875rem; color: #374151; display: flex; align-items: center;">
                                    <i class="fas fa-users" style="margin-right: 0.5rem; color: #6b7280;"></i>
                                    ${this.getClassInfo()}
                                </h4>
                                <p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: #6b7280;">
                                    ${this.getStudentCount()} élève(s) dans la classe
                                </p>
                            </div>
                            
                            <div class="students-list">
                                ${this.generateStudentsList()}
                            </div>
                        </div>

                        ${this.shouldShowSanctionsTab() ? `
                        <!-- Section sanctions -->
                        <div class="sanctions-content tracking-content" id="sanctions-content">
                            <div class="sanctions-table-container">
                                <table class="sanctions-table">
                                    <thead>
                                        <tr>
                                            <th class="student-column">Élève</th>
                                            ${this.generateSanctionHeaders()}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${this.generateSanctionsTable()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${this.shouldShowSeatingPlanTab() ? `
                        <!-- Section plan de classe -->
                        <div class="seating-plan-content tracking-content" id="seating-plan-content">
                            <div class="seating-plan-header">
                                <div class="seating-plan-info">
                                    <h3><i class="fas fa-th"></i> Plan de classe</h3>
                                    <p>Cliquez sur les tables pour ajouter des avertissements : jaune → rouge → noir</p>
                                </div>
                                <button id="undo-warning-btn" class="btn btn-primary" onclick="undoLastWarning()" disabled="">
                                    <i class="fas fa-undo"></i> Annuler
                                </button>
                            </div>
                            <div class="seating-plan-container">
                                <div class="seating-plan-viewer" id="seating-plan-viewer">
                                    ${this.generateSeatingPlan()}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Génère la liste des élèves pour les présences
     */
    generateStudentsList() {
        // Utiliser les données réelles des élèves si disponibles
        let students = [];
        
        try {
            if (this.options.studentData && Array.isArray(this.options.studentData)) {
                students = this.options.studentData;
            } else if (typeof window !== 'undefined' && window.studentsData && Array.isArray(window.studentsData)) {
                // Fallback: utiliser les données globales de la page
                students = window.studentsData;
            } else {
                // Essayer de récupérer depuis le DOM
                const studentElements = document.querySelectorAll('.student-attendance[data-student-id]');
                if (studentElements.length > 0) {
                    students = Array.from(studentElements).map(el => {
                        const nameEl = el.querySelector('.student-name');
                        const name = nameEl ? nameEl.textContent.trim() : 'Unknown';
                        return {
                            id: parseInt(el.dataset.studentId),
                            full_name: name,
                            first_name: name.split(' ')[0] || name,
                            last_name: name.split(' ')[1] || ''
                        };
                    });
                } else {
                    // Fallback: données par défaut pour les tests
                    console.warn('Aucune donnée délève trouvée, utilisation des données de test');
                    students = [
                        { id: 1, first_name: 'Test', last_name: 'Élève', full_name: 'Test Élève' }
                    ];
                }
            }
        } catch (error) {
            console.error('Erreur lors de la récupération des données élèves:', error);
            students = [];
        }
        
        return students.map(student => {
            // Obtenir l'avatar (première lettre du prénom)
            const avatar = student.first_name ? student.first_name.charAt(0).toUpperCase() : '?';
            const displayName = student.full_name || `${student.first_name} ${student.last_name || ''}`.trim();
            
            // Obtenir le statut d'attendance actuel depuis le DOM si disponible
            let currentStatus = 'present';
            const existingElement = document.querySelector(`#student-${student.id}`);
            if (existingElement) {
                currentStatus = existingElement.dataset.status || 'present';
            }
            
            return `
            <div class="student-attendance ${currentStatus}" id="student-${student.id}" data-student-id="${student.id}" data-status="${currentStatus}">
                <div class="student-info" onclick="toggleAttendance(${student.id})">
                    <div class="student-avatar">${avatar}</div>
                    <div class="student-name-container">
                        <span class="student-name">${displayName}</span>
                    </div>
                </div>
                <div class="late-controls">
                    <input type="number" class="late-minutes" id="late-${student.id}" value="" min="1" max="120" placeholder="min">
                    <button class="btn-late" onclick="setLateStatus(${student.id})" title="Marquer en retard">
                        <i class="fas fa-clock"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    }
    
    /**
     * Obtient les informations de la classe
     */
    getClassInfo() {
        // Essayer de récupérer depuis le DOM principal
        const classNameElement = document.querySelector('.classroom-name');
        if (classNameElement) {
            return classNameElement.textContent.trim();
        }
        return 'Classe entière';
    }
    
    /**
     * Obtient le nombre d'élèves
     */
    getStudentCount() {
        if (this.options.studentData && Array.isArray(this.options.studentData)) {
            return this.options.studentData.length;
        } else if (typeof window !== 'undefined' && window.studentsData) {
            return window.studentsData.length;
        }
        return 0;
    }
    
    /**
     * Vérifie s'il faut afficher l'onglet sanctions
     */
    shouldShowSanctionsTab() {
        // Vérifier s'il y a des colonnes de sanctions dans le DOM principal
        const mainSanctionHeaders = document.querySelectorAll('.main-content .sanctions-table thead .sanction-column');
        if (mainSanctionHeaders.length > 0) {
            return true;
        }
        
        // Vérifier s'il y a des éléments de comptage de sanctions
        const sanctionCounters = document.querySelectorAll('.count-display[data-sanction]');
        if (sanctionCounters.length > 0) {
            return true;
        }
        
        // Vérifier dans la section sanctions
        const sanctionsSection = document.querySelector('#sanctions-section');
        if (sanctionsSection && !sanctionsSection.classList.contains('d-none')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Vérifie s'il faut afficher l'onglet plan de classe
     */
    shouldShowSeatingPlanTab() {
        // Vérifier s'il y a un plan de classe dans le DOM principal
        const seatingWorkspace = document.querySelector('#seating-workspace');
        if (seatingWorkspace) {
            // Vérifier qu'il y a vraiment des éléments de plan (pas juste le conteneur vide)
            const seatingElements = seatingWorkspace.querySelectorAll('.seating-element');
            return seatingElements.length > 0;
        }
        
        // Vérifier si le HTML du plan de classe a été fourni dans les options
        if (this.options.seatingPlanHTML) {
            return !this.options.seatingPlanHTML.includes('seating-plan-empty');
        }
        
        return false;
    }
    
    /**
     * Génère le label de l'onglet sanctions avec le nombre de types
     */
    getSanctionsTabLabel() {
        const mainSanctionHeaders = document.querySelectorAll('.main-content .sanctions-table thead .sanction-column');
        const count = mainSanctionHeaders.length;
        
        if (count > 0) {
            return `Coches (${count})`;
        }
        
        // Compter les types uniques de sanctions depuis les compteurs
        const sanctionTypes = new Set();
        document.querySelectorAll('.count-display[data-sanction]').forEach(el => {
            sanctionTypes.add(el.dataset.sanction);
        });
        
        return sanctionTypes.size > 0 ? `Coches (${sanctionTypes.size})` : 'Coches';
    }
    
    /**
     * Génère les en-têtes de sanctions
     */
    generateSanctionHeaders() {
        // Récupérer les types de sanctions depuis la section sanctions
        const sanctionHeaders = document.querySelectorAll('#sanctions-content .sanctions-table .sanction-column');
        
        if (sanctionHeaders.length > 0) {
            // Utiliser les vrais en-têtes
            return Array.from(sanctionHeaders).map(header => {
                return `<th class="sanction-column">${header.textContent.trim()}</th>`;
            }).join('');
        }
        
        // Essayer d'autres sélecteurs
        const altHeaders = document.querySelectorAll('.sanctions-table thead .sanction-column, .sanction-column');
        if (altHeaders.length > 0) {
            return Array.from(altHeaders).map(header => {
                return `<th class="sanction-column">${header.textContent.trim()}</th>`;
            }).join('');
        }
        
        // Si aucun en-tête trouvé, retourner vide
        return '';
    }
    
    /**
     * Génère le tableau des sanctions
     */
    generateSanctionsTable() {
        // Utiliser les données réelles des élèves si disponibles
        let students = [];
        
        if (this.options.studentData && Array.isArray(this.options.studentData)) {
            students = this.options.studentData;
        } else if (typeof window !== 'undefined' && window.studentsData) {
            // Fallback: utiliser les données globales de la page
            students = window.studentsData;
        } else {
            // Fallback: données par défaut pour les tests
            students = [
                { id: 1, first_name: 'Test', last_name: 'Élève', full_name: 'Test Élève' }
            ];
        }
        
        // Récupérer les types de sanctions depuis le DOM ou utiliser les défauts
        let sanctionTypes = [{ id: 4, name: 'comportement' }, { id: 3, name: 'oubli' }];
        
        // Chercher les vrais types de sanctions dans le DOM
        const sanctionHeaders = document.querySelectorAll('#sanctions-content .sanctions-table .sanction-column');
        if (sanctionHeaders.length > 0) {
            sanctionTypes = Array.from(sanctionHeaders).map((header, index) => {
                const text = header.textContent.trim();
                // Récupérer les IDs uniques depuis les compteurs existants
                const uniqueIds = new Set();
                document.querySelectorAll('.count-display[data-sanction]').forEach(el => {
                    if (el.dataset.sanction) {
                        uniqueIds.add(parseInt(el.dataset.sanction));
                    }
                });
                const idsArray = Array.from(uniqueIds).sort();
                const sanctionId = idsArray[index] || (index + 1);
                return { id: sanctionId, name: text };
            });
        } else {
            // Fallback: récupérer depuis les compteurs existants
            const uniqueTypes = new Map();
            document.querySelectorAll('.count-display[data-sanction]').forEach(el => {
                if (el.dataset.sanction) {
                    const id = parseInt(el.dataset.sanction);
                    if (!uniqueTypes.has(id)) {
                        uniqueTypes.set(id, `Type ${id}`);
                    }
                }
            });
            if (uniqueTypes.size > 0) {
                sanctionTypes = Array.from(uniqueTypes.entries()).map(([id, name]) => ({ id, name }));
            }
        }
        
        return students.map(student => {
            const displayName = student.full_name || `${student.first_name} ${student.last_name || ''}`.trim();
            
            // Récupérer les compteurs actuels depuis le DOM ou les données
            const getSanctionCount = (studentId, sanctionId) => {
                // D'abord essayer depuis le DOM
                const countElement = document.querySelector(`[data-student="${studentId}"][data-sanction="${sanctionId}"]`);
                if (countElement) {
                    return parseInt(countElement.textContent) || 0;
                }
                
                // Ensuite essayer depuis les données de sanctions
                if (this.options.sanctionsData && this.options.sanctionsData[`${studentId}_${sanctionId}`] !== undefined) {
                    return this.options.sanctionsData[`${studentId}_${sanctionId}`];
                }
                
                // Sinon retourner 0
                return 0;
            };
            
            return `
            <tr>
                <td class="student-name">${displayName}</td>
                ${sanctionTypes.map(sanction => `
                    <td class="sanction-count">
                        <div class="count-controls">
                            <button class="count-btn decrease" onclick="updateSanctionCount(${student.id}, ${sanction.id}, -1)">
                                <i class="fas fa-minus"></i>
                            </button>
                            <span class="count-display" data-student="${student.id}" data-sanction="${sanction.id}">${getSanctionCount(student.id, sanction.id)}</span>
                            <button class="count-btn increase" onclick="updateSanctionCount(${student.id}, ${sanction.id}, 1)">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </td>
                `).join('')}
            </tr>
            `;
        }).join('');
    }
    
    /**
     * Génère le plan de classe
     */
    generateSeatingPlan() {
        // Vérifier d'abord si on devrait afficher le plan de classe
        if (!this.shouldShowSeatingPlanTab()) {
            return `
                <div class="seating-workspace" id="seating-workspace-pdf" style="transform: translate(0px, 0px) scale(1); transform-origin: 0px 0px 0px;">
                    <div class="seating-plan-empty" style="text-align: center; padding: 40px; color: #6b7280;">
                        <i class="fas fa-th" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                        <p>Aucun plan de classe configuré</p>
                        <p style="font-size: 0.875rem; margin-top: 8px;">Créez un plan de classe dans la gestion des élèves</p>
                    </div>
                </div>
            `;
        }
        
        // Utiliser le plan de classe fourni ou celui du DOM
        if (this.options.seatingPlanHTML && !this.options.seatingPlanHTML.includes('seating-plan-empty')) {
            return this.options.seatingPlanHTML.replace('id="seating-workspace"', 'id="seating-workspace-pdf"');
        }
        
        // Essayer de récupérer le plan de classe depuis le DOM principal
        const existingSeatingPlan = document.querySelector('#seating-workspace');
        if (existingSeatingPlan) {
            const seatingElements = existingSeatingPlan.querySelectorAll('.seating-element');
            if (seatingElements.length > 0) {
                // Cloner le plan existant
                const clonedPlan = existingSeatingPlan.cloneNode(true);
                // Retirer l'ID pour éviter les conflits
                clonedPlan.id = 'seating-workspace-pdf';
                return clonedPlan.outerHTML;
            }
        }
        
        // Plan vide si aucune donnée valide n'est disponible
        return `
            <div class="seating-workspace" id="seating-workspace-pdf" style="transform: translate(0px, 0px) scale(1); transform-origin: 0px 0px 0px;">
                <div class="seating-plan-empty" style="text-align: center; padding: 40px; color: #6b7280;">
                    <i class="fas fa-th" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p>Plan de classe vide</p>
                    <p style="font-size: 0.875rem; margin-top: 8px;">Ajoutez des tables et placez vos élèves</p>
                </div>
            </div>
        `;
    }
    
    /**
     * Injecte les styles CSS pour le panneau de suivi d'élèves
     */
    injectStudentTrackingCSS() {
        if (document.getElementById('student-tracking-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'student-tracking-styles';
        style.textContent = `
            #student-tracking-panel {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            
            /* Préfixer tous les styles avec #student-tracking-panel pour éviter les conflits */
            
            .student-tracking-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .student-tracking-container {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                max-width: 90vw;
                max-height: 90vh;
                width: 1000px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            
            .student-tracking-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem 1.5rem;
                background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                color: white;
                border-bottom: 1px solid #e5e7eb;
            }
            
            .student-tracking-header h2 {
                margin: 0;
                font-size: 1.25rem;
                font-weight: 600;
            }
            
            .close-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.2s;
            }
            
            .close-btn:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            
            #student-tracking-panel .attendance-section {
                padding: 1.5rem;
                overflow-y: auto;
                flex: 1;
            }
            
            #student-tracking-panel .section-title {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 1.125rem;
                font-weight: 600;
                color: #374151;
                margin: 0 0 1rem 0;
            }
            
            #student-tracking-panel .tracking-tabs {
                display: flex;
                gap: 0.5rem;
                margin-bottom: 1.5rem;
                border-bottom: 1px solid #e5e7eb;
            }
            
            #student-tracking-panel .tracking-tab {
                padding: 0.75rem 1rem;
                border: none;
                background: transparent;
                color: #6b7280;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-weight: 500;
            }
            
            #student-tracking-panel .tracking-tab:hover {
                color: #3b82f6;
                background: #f8fafc;
            }
            
            #student-tracking-panel .tracking-tab.active {
                color: #3b82f6;
                border-bottom-color: #3b82f6;
            }
            
            #student-tracking-panel .tracking-content {
                display: none;
            }
            
            #student-tracking-panel .tracking-content.active {
                display: block;
            }
            
            #student-tracking-panel .attendance-stats {
                display: flex;
                gap: 1rem;
                margin-bottom: 1.5rem;
            }
            
            #student-tracking-panel .stat-item {
                flex: 1;
                padding: 1rem;
                border-radius: 8px;
                text-align: center;
            }
            
            #student-tracking-panel .stat-item.present {
                background: #dcfce7;
                color: #166534;
            }
            
            #student-tracking-panel .stat-item.absent {
                background: #fecaca;
                color: #991b1b;
            }
            
            #student-tracking-panel .stat-item.late {
                background: #fef3c7;
                color: #92400e;
            }
            
            #student-tracking-panel .stat-value {
                font-size: 2rem;
                font-weight: bold;
                margin-bottom: 0.25rem;
            }
            
            #student-tracking-panel .stat-label {
                font-size: 0.875rem;
                font-weight: 500;
            }
            
            #student-tracking-panel .students-list {
                space-y: 0.5rem;
            }
            
            #student-tracking-panel .student-attendance {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.75rem;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                margin-bottom: 0.5rem;
                transition: all 0.2s;
            }
            
            #student-tracking-panel .student-attendance:hover {
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            #student-tracking-panel .student-attendance.present {
                background: #f0fdf4;
                border-color: #22c55e;
            }
            
            #student-tracking-panel .student-attendance.absent {
                background: #fef2f2;
                border-color: #ef4444;
            }
            
            #student-tracking-panel .student-attendance.late {
                background: #fffbeb;
                border-color: #f59e0b;
            }
            
            #student-tracking-panel .student-info {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                cursor: pointer;
            }
            
            #student-tracking-panel .student-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: #3b82f6;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                font-size: 1.125rem;
            }
            
            #student-tracking-panel .student-name {
                font-weight: 500;
                color: #374151;
            }
            
            #student-tracking-panel .late-controls {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            #student-tracking-panel .late-minutes {
                width: 60px;
                padding: 0.25rem 0.5rem;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 0.875rem;
            }
            
            #student-tracking-panel .btn-late {
                padding: 0.25rem 0.5rem;
                background: #f59e0b;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            #student-tracking-panel .btn-late:hover {
                background: #d97706;
            }
            
            #student-tracking-panel .sanctions-table-container {
                overflow-x: auto;
            }
            
            #student-tracking-panel .sanctions-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 0.875rem;
            }
            
            .sanctions-table th,
            .sanctions-table td {
                padding: 0.75rem;
                text-align: left;
                border-bottom: 1px solid #e5e7eb;
            }
            
            .sanctions-table th {
                background: #f9fafb;
                font-weight: 600;
                color: #374151;
            }
            
            .count-controls {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .count-btn {
                width: 28px;
                height: 28px;
                border: 1px solid #d1d5db;
                background: white;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .count-btn:hover {
                background: #f3f4f6;
                border-color: #9ca3af;
            }
            
            .count-btn.increase:hover {
                background: #dcfce7;
                border-color: #22c55e;
                color: #166534;
            }
            
            .count-btn.decrease:hover {
                background: #fecaca;
                border-color: #ef4444;
                color: #991b1b;
            }
            
            .count-display {
                min-width: 30px;
                text-align: center;
                font-weight: 600;
            }
            
            .seating-plan-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
            }
            
            .seating-plan-info h3 {
                margin: 0 0 0.25rem 0;
                color: #374151;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .seating-plan-info p {
                margin: 0;
                font-size: 0.875rem;
                color: #6b7280;
            }
            
            .seating-plan-container {
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                height: 400px;
                overflow: auto;
                background: #f9fafb;
            }
            
            .seating-plan-viewer {
                position: relative;
                width: 100%;
                height: 100%;
            }
            
            .seating-workspace {
                position: relative;
                width: 100%;
                height: 100%;
            }
            
            .seating-element {
                border: 2px solid #d1d5db;
                border-radius: 6px;
                background: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.75rem;
                font-weight: 500;
                color: #6b7280;
            }
            
            .desk-double,
            .desk-single {
                background: #f8fafc;
                border-color: #cbd5e1;
            }
            
            .teacher-desk {
                background: #ddd6fe;
                border-color: #a78bfa;
                color: #5b21b6;
            }
            
            .student-slots {
                display: flex;
                width: 100%;
                height: 100%;
            }
            
            .student-slot {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                border-right: 1px solid #d1d5db;
                transition: background-color 0.2s;
            }
            
            .student-slot:last-child {
                border-right: none;
            }
            
            .student-slot.occupied {
                background: #dbeafe;
                color: #1e40af;
            }
            
            .student-slot:hover {
                background: #f3f4f6;
            }
            
            .student-placed {
                font-weight: 600;
                font-size: 0.75rem;
            }
            
            .btn {
                padding: 0.5rem 1rem;
                border-radius: 6px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
            }
            
            .btn-primary {
                background: #3b82f6;
                color: white;
            }
            
            .btn-primary:hover:not(:disabled) {
                background: #2563eb;
            }
            
            .btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Configure les événements du panneau de suivi d'élèves
     */
    setupStudentTrackingEvents() {
        // Fermer le panneau en cliquant sur l'overlay
        const overlay = this.studentTrackingPanel.querySelector('.student-tracking-overlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeStudentTracking();
            }
        });
        
        // Bouton de fermeture
        const closeBtn = this.studentTrackingPanel.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => this.closeStudentTracking());
        
        // Gestion globale des fonctions dans le contexte du PDF viewer
        window.showTrackingTab = (tabName) => this.showTrackingTab(tabName);
        window.toggleAttendance = (studentId) => this.toggleAttendance(studentId);
        window.setLateStatus = (studentId) => this.setLateStatus(studentId);
        window.updateSanctionCount = (studentId, sanctionType, delta) => this.updateSanctionCount(studentId, sanctionType, delta);
        window.undoLastWarning = () => this.undoLastWarning();
    }
    
    /**
     * Ferme le panneau de suivi d'élèves
     */
    closeStudentTracking() {
        if (this.studentTrackingPanel) {
            this.studentTrackingPanel.style.display = 'none';
        }
    }
    
    /**
     * Supprime complètement le panneau et ses styles
     */
    removeStudentTrackingPanel() {
        // Supprimer le panneau du DOM
        if (this.studentTrackingPanel) {
            this.studentTrackingPanel.remove();
            this.studentTrackingPanel = null;
        }
        
        // Supprimer les styles CSS pour éviter les conflits
        const existingStyles = document.getElementById('student-tracking-styles');
        if (existingStyles) {
            existingStyles.remove();
        }
        
        // Nettoyer les fonctions globales en les réassignant à undefined
        if (typeof window !== 'undefined') {
            try {
                window.showTrackingTab = undefined;
                window.toggleAttendance = undefined;
                window.setLateStatus = undefined;
                window.updateSanctionCount = undefined;
                window.undoLastWarning = undefined;
            } catch (e) {
                console.warn('Impossible de nettoyer les fonctions globales:', e);
            }
        }
        
    }
    
    /**
     * Affiche un onglet de suivi spécifique
     */
    showTrackingTab(tabName) {
        // Masquer tous les contenus
        const contents = this.studentTrackingPanel.querySelectorAll('.tracking-content');
        contents.forEach(content => content.classList.remove('active'));
        
        // Désactiver tous les onglets
        const tabs = this.studentTrackingPanel.querySelectorAll('.tracking-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        
        // Activer l'onglet et le contenu correspondants
        const targetContent = this.studentTrackingPanel.querySelector(`#${tabName}-content`);
        const targetTab = this.studentTrackingPanel.querySelector(`[onclick="showTrackingTab('${tabName}')"]`);
        
        if (targetContent && targetTab) {
            targetContent.classList.add('active');
            targetTab.classList.add('active');
        } else {
            // Si l'onglet demandé n'existe pas, basculer vers l'onglet présences
            console.warn(`Onglet ${tabName} non disponible, basculement vers présences`);
            const attendanceContent = this.studentTrackingPanel.querySelector('#attendance-content');
            const attendanceTab = this.studentTrackingPanel.querySelector(`[onclick="showTrackingTab('attendance')"]`);
            
            if (attendanceContent && attendanceTab) {
                attendanceContent.classList.add('active');
                attendanceTab.classList.add('active');
            }
        }
    }
    
    /**
     * Bascule le statut de présence d'un élève
     */
    toggleAttendance(studentId) {
        const studentElement = this.studentTrackingPanel.querySelector(`#student-${studentId}`);
        if (!studentElement) return;
        
        const currentStatus = studentElement.dataset.status;
        let newStatus;
        
        // Cycle: present → absent → present
        if (currentStatus === 'present') {
            newStatus = 'absent';
        } else {
            newStatus = 'present';
        }
        
        // Mettre à jour l'élément dans le panneau PDF
        studentElement.dataset.status = newStatus;
        studentElement.className = `student-attendance ${newStatus}`;
        
        // Mettre à jour les statistiques
        this.updateAttendanceStats();
        
        // Synchroniser avec la page principale si la fonction existe
        if (typeof window.toggleAttendanceMain === 'function') {
            window.toggleAttendanceMain(studentId, newStatus);
        } else {
            // Essayer de mettre à jour directement le DOM principal
            const mainStudentElement = document.querySelector(`#student-${studentId}`);
            if (mainStudentElement && mainStudentElement !== studentElement) {
                mainStudentElement.dataset.status = newStatus;
                mainStudentElement.className = `student-attendance ${newStatus}`;
            }
        }
    }
    
    /**
     * Marque un élève en retard
     */
    setLateStatus(studentId) {
        const studentElement = this.studentTrackingPanel.querySelector(`#student-${studentId}`);
        const minutesInput = this.studentTrackingPanel.querySelector(`#late-${studentId}`);
        
        if (!studentElement || !minutesInput) return;
        
        const minutes = parseInt(minutesInput.value) || 0;
        if (minutes <= 0) {
            alert('Veuillez saisir le nombre de minutes de retard');
            return;
        }
        
        // Marquer comme en retard
        studentElement.dataset.status = 'late';
        studentElement.className = 'student-attendance late';
        
        // Mettre à jour les statistiques
        this.updateAttendanceStats();
    }
    
    /**
     * Met à jour les statistiques de présence
     */
    updateAttendanceStats() {
        const students = this.studentTrackingPanel.querySelectorAll('.student-attendance');
        let presentCount = 0;
        let absentCount = 0;
        let lateCount = 0;
        
        students.forEach(student => {
            const status = student.dataset.status;
            switch (status) {
                case 'present': presentCount++; break;
                case 'absent': absentCount++; break;
                case 'late': lateCount++; break;
            }
        });
        
        // Mettre à jour l'affichage
        const presentDisplay = this.studentTrackingPanel.querySelector('#presentCount');
        const absentDisplay = this.studentTrackingPanel.querySelector('#absentCount');
        const lateDisplay = this.studentTrackingPanel.querySelector('#lateCount');
        
        if (presentDisplay) presentDisplay.textContent = presentCount;
        if (absentDisplay) absentDisplay.textContent = absentCount;
        if (lateDisplay) lateDisplay.textContent = lateCount;
    }
    
    /**
     * Met à jour le compteur de sanctions
     */
    updateSanctionCount(studentId, sanctionType, delta) {
        const countDisplay = this.studentTrackingPanel.querySelector(`[data-student="${studentId}"][data-sanction="${sanctionType}"]`);
        if (!countDisplay) return;
        
        const currentCount = parseInt(countDisplay.textContent) || 0;
        const newCount = Math.max(0, currentCount + delta);
        
        // Mettre à jour dans le panneau PDF
        countDisplay.textContent = newCount;
        
        // Synchroniser avec la page principale
        if (typeof window.updateSanctionCountMain === 'function') {
            window.updateSanctionCountMain(studentId, sanctionType, delta);
        } else {
            // Essayer de mettre à jour directement le DOM principal
            const mainCountDisplay = document.querySelector(`[data-student="${studentId}"][data-sanction="${sanctionType}"]`);
            if (mainCountDisplay && mainCountDisplay !== countDisplay) {
                mainCountDisplay.textContent = newCount;
            }
        }
    }
    
    /**
     * Annule le dernier avertissement (placeholder)
     */
    undoLastWarning() {
    }
    
    /**
     * Génère le HTML du panneau d'envoi aux élèves
     */
    getSendToStudentsHTML() {
        return `
            <div class="send-to-students-overlay">
                <div class="send-to-students-container">
                    <div class="send-to-students-header">
                        <h2><i class="fas fa-paper-plane"></i> Envoyer aux élèves</h2>
                        <button class="close-btn" data-action="close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="send-to-students-content">
                        <div class="send-options">
                            <h3>Options d'envoi</h3>
                            
                            <div class="send-option">
                                <label class="option-label">
                                    <input type="radio" name="sendMode" value="all" checked>
                                    <div class="option-content">
                                        <div class="option-title">
                                            <i class="fas fa-users"></i>
                                            Tous les élèves
                                        </div>
                                        <div class="option-description">
                                            Envoyer le document à tous les élèves de la classe
                                        </div>
                                    </div>
                                </label>
                            </div>
                            
                            <div class="send-option">
                                <label class="option-label">
                                    <input type="radio" name="sendMode" value="absent">
                                    <div class="option-content">
                                        <div class="option-title">
                                            <i class="fas fa-user-slash"></i>
                                            Élèves absents
                                        </div>
                                        <div class="option-description">
                                            Envoyer uniquement aux élèves marqués comme absents
                                        </div>
                                    </div>
                                </label>
                            </div>
                            
                            <div class="send-option">
                                <label class="option-label">
                                    <input type="radio" name="sendMode" value="custom">
                                    <div class="option-content">
                                        <div class="option-title">
                                            <i class="fas fa-user-check"></i>
                                            Sélection personnalisée
                                        </div>
                                        <div class="option-description">
                                            Choisir manuellement les élèves destinataires
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        
                        <div class="students-selection" id="students-selection" style="display: none;">
                            <h3>Sélectionner les élèves</h3>
                            <div class="selection-controls">
                                <button type="button" class="btn btn-secondary" data-action="select-all">
                                    <i class="fas fa-check-square"></i> Tous
                                </button>
                                <button type="button" class="btn btn-secondary" data-action="unselect-all">
                                    <i class="fas fa-square"></i> Aucun
                                </button>
                            </div>
                            <div class="students-list-send">
                                ${this.generateStudentsSelectionList()}
                            </div>
                        </div>
                        
                        <div class="send-summary" id="send-summary">
                            <div class="summary-info">
                                <i class="fas fa-info-circle"></i>
                                <span id="send-summary-text">Tous les élèves recevront le document</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="send-to-students-footer">
                        <button class="btn btn-secondary" data-action="close">
                            <i class="fas fa-times"></i> Annuler
                        </button>
                        <button class="btn btn-primary" id="send-confirm-btn" data-action="confirm">
                            <i class="fas fa-paper-plane"></i> Envoyer
                        </button>
                    </div>
                    
                    <div class="send-progress" id="send-progress" style="display: none;">
                        <div class="progress-info">
                            <i class="fas fa-spinner fa-spin"></i>
                            <span>Envoi en cours...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Génère la liste des élèves pour la sélection
     */
    generateStudentsSelectionList() {
        // Utiliser les données réelles des élèves si disponibles
        let students = [];
        
        if (this.options.studentData && Array.isArray(this.options.studentData)) {
            students = this.options.studentData;
        } else if (typeof window !== 'undefined' && window.studentsData && Array.isArray(window.studentsData)) {
            students = window.studentsData;
        }
        
        if (students.length === 0) {
            return '<p class="no-students">Aucun élève trouvé dans cette classe</p>';
        }
        
        return students.map(student => {
            const displayName = student.full_name || `${student.first_name} ${student.last_name || ''}`.trim();
            const avatar = student.first_name ? student.first_name.charAt(0).toUpperCase() : '?';
            
            // Vérifier le statut de présence actuel
            const attendanceElement = document.querySelector(`#student-${student.id}`);
            const isAbsent = attendanceElement && attendanceElement.dataset.status === 'absent';
            
            return `
                <div class="student-select-item">
                    <label class="student-select-label">
                        <input type="checkbox" class="student-checkbox" value="${student.id}" data-student-name="${displayName}" data-absent="${isAbsent}">
                        <div class="student-select-info">
                            <div class="student-avatar-small">${avatar}</div>
                            <div class="student-name-select">
                                <span class="student-name">${displayName}</span>
                                ${isAbsent ? '<span class="absent-badge">Absent</span>' : '<span class="present-badge">Présent</span>'}
                            </div>
                        </div>
                    </label>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Nettoie et détruit l'instance du PDF viewer
     */
    destroy() {
        
        try {
            // Fermer et supprimer le panneau de suivi d'élèves
            if (this.studentTrackingPanel) {
                this.studentTrackingPanel.style.display = 'none';
                // Différer la suppression pour éviter les conflits
                setTimeout(() => {
                    this.removeStudentTrackingPanel();
                }, 100);
            }
            
            // Nettoyer les autres ressources du PDF viewer
            if (this.graphPanel) {
                this.closeGraphPanel();
            }
            
            // Nettoyer les événements globaux
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
            }
            
            // Nettoyer les timers
            if (this.autoSaveTimer) {
                clearTimeout(this.autoSaveTimer);
            }
            
        } catch (error) {
            console.error('❌ Erreur lors de la destruction du PDF viewer:', error);
        }
    }
    
    /**
     * Configuration des événements d'annotation pour une page spécifique
     * Note: SimplePenAnnotation gère ses propres événements pour l'outil 'pen'
     * Cette fonction configure les événements pour TOUS LES AUTRES OUTILS
     */
    setupPageAnnotationEvents(pageNum, annotationCanvas) {
        // Initialiser le moteur d'annotation si l'outil stylo est actif
        if (this.currentTool === 'pen' && !this.annotationEngines.has(pageNum)) {
            this.initAnnotationEngine(pageNum);
        }

        // Configuration des événements pointer pour TOUS LES AUTRES OUTILS
        // (highlighter, rectangle, circle, arrow, line, text, eraser)
        // SimplePenAnnotation gère déjà l'outil 'pen', donc on skip les events pour 'pen'

        annotationCanvas.addEventListener('pointerdown', (e) => {
            // Si c'est l'outil pen, laisser SimplePenAnnotation gérer
            if (this.currentTool === 'pen') return;

            // IMPORTANT: Vérifier que le stylet touche vraiment l'écran
            // e.buttons === 0 signifie que le stylet survole sans toucher (hover)
            // On ne commence à dessiner que si le stylet touche vraiment (buttons > 0)
            if (e.buttons === 0) {
                return; // Hover seulement, ne pas dessiner
            }

            // Pour tous les autres outils, gérer normalement
            this.startDrawing(e, pageNum);
        });

        annotationCanvas.addEventListener('pointermove', (e) => {
            // Si c'est l'outil pen, laisser SimplePenAnnotation gérer
            if (this.currentTool === 'pen') return;

            // Si le stylet est en hover (buttons === 0), afficher le curseur
            // mais ne pas dessiner
            if (e.buttons === 0) {
                // Le curseur CSS s'occupera de l'affichage visuel
                return;
            }

            if (this.isDrawing) {
                this.draw(e, pageNum);
            }
        });

        annotationCanvas.addEventListener('pointerup', (e) => {
            // Si c'est l'outil pen, laisser SimplePenAnnotation gérer
            if (this.currentTool === 'pen') return;

            if (this.isDrawing) {
                this.stopDrawing(e, pageNum);
            }
        });

        annotationCanvas.addEventListener('pointerleave', (e) => {
            // Si c'est l'outil pen, laisser SimplePenAnnotation gérer
            if (this.currentTool === 'pen') return;

            if (this.isDrawing) {
                this.stopDrawing(e, pageNum);
            }
        });

        // TEMPORAIREMENT DÉSACTIVÉ: Support tactile - laissons pointer events gérer tout
        // Les pointer events gèrent automatiquement touch + stylet + souris
        // Les touch events bloquaient les pointer events avec preventDefault
        /*
        annotationCanvas.addEventListener('touchstart', (e) => {
            
            // Multi-touch : TOUJOURS désactiver le canvas et laisser zoom natif passer au PDF
            if (e.touches.length > 1) {
                // Désactiver temporairement le canvas pour laisser passer les événements
                annotationCanvas.style.pointerEvents = 'none';
                
                // Le ré-activer après un court délai pour la prochaine interaction
                setTimeout(() => {
                    if (this.currentTool && this.currentTool !== 'none') {
                        annotationCanvas.style.pointerEvents = 'auto';
                    }
                }, 500);
                
                return; // Ne pas interférer du tout
            }
            
            // Single touch : vérifier si c'est un stylet
            const touch = e.touches[0];
            const isStylus = this.isStylusTouch(touch);
            
            // Seulement bloquer si c'est un stylet ET qu'on a un outil sélectionné
            if (isStylus && this.currentTool && this.currentTool !== 'none') {
                e.preventDefault();
                annotationCanvas.style.touchAction = 'none';
                
                const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                
                try {
                    Object.defineProperty(mouseEvent, 'target', {
                        value: e.target,
                        writable: false,
                        configurable: true
                    });
                } catch (err) {
                    // Fallback silencieux
                }
                
                mouseEvent.isStylusEvent = true;
                this.startDrawing(mouseEvent, pageNum);
            } else {
                // Désactiver temporairement le canvas pour laisser passer l'événement doigt au PDF
                annotationCanvas.style.pointerEvents = 'none';
                
                // Le ré-activer après un délai pour la prochaine interaction
                setTimeout(() => {
                    if (this.currentTool && this.currentTool !== 'none') {
                        annotationCanvas.style.pointerEvents = 'auto';
                    }
                }, 200);
            }
            // Sinon (doigt ou pas d'outil), laisser le comportement natif passer au PDF
        }, { passive: false }); // Non-passif seulement pour pouvoir preventDefault si nécessaire

        annotationCanvas.addEventListener('touchmove', (e) => {
            // Seulement gérer si on est en train de dessiner
            if (!this.isDrawing) {
                // Si on n'est pas en train de dessiner, s'assurer que le canvas ne bloque pas multi-touch
                if (e.touches.length > 1) {
                    annotationCanvas.style.pointerEvents = 'none';
                    setTimeout(() => {
                        if (this.currentTool && this.currentTool !== 'none') {
                            annotationCanvas.style.pointerEvents = 'auto';
                        }
                    }, 300);
                }
                return;
            }
            
            // Multi-touch : arrêter le dessin et désactiver canvas pour laisser zoom natif
            if (e.touches.length > 1) {
                this.stopDrawing(e, pageNum);
                annotationCanvas.style.pointerEvents = 'none';
                
                setTimeout(() => {
                    if (this.currentTool && this.currentTool !== 'none') {
                        annotationCanvas.style.pointerEvents = 'auto';
                    }
                }, 500);
                return;
            }
            
            const touch = e.touches[0];
            const isStylus = this.isStylusTouch(touch);
            
            // Seulement continuer si c'est un stylet
            if (isStylus) {
                e.preventDefault();
                const mouseEvent = new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                
                try {
                    Object.defineProperty(mouseEvent, 'target', {
                        value: e.target,
                        writable: false,
                        configurable: true
                    });
                } catch (err) {
                    // Fallback silencieux
                }
                
                mouseEvent.isStylusEvent = true;
                this.draw(mouseEvent, pageNum);
            }
        });

        annotationCanvas.addEventListener('touchend', (e) => {
            // Toujours remettre le touch-action par défaut après l'interaction
            setTimeout(() => {
                annotationCanvas.style.touchAction = 'pan-x pan-y pinch-zoom';
                // Gérer les pointerEvents dynamiquement selon l'état de l'outil
                if (this.currentTool && this.currentTool !== 'none') {
                    annotationCanvas.style.pointerEvents = 'auto';
                } else {
                    annotationCanvas.style.pointerEvents = 'none';
                }
            }, 100);
            
            // Seulement traiter si on était en train de dessiner avec un stylet
            if (this.isDrawing) {
                e.preventDefault();
                this.stopDrawing(null, pageNum);
            }
            // Sinon laisser le comportement natif (ex: tap, scroll, zoom)
        });
        */
    }

    /**
     * Méthodes d'annotation de base
     */
    setCurrentTool(tool) {
        // Changement d'outil optimisé
        
        // Supprimer toute zone de texte active lors du changement d'outil
        if (this.currentTool === 'text' && tool !== 'text') {
            this.removeActiveTextInput();
        }
        
        this.currentTool = tool;
        
        // Optimisation: Mise à jour des boutons maintenant gérée dans updateToolCursor()
        
        // Mettre à jour la palette de couleurs selon l'outil
        this.updateColorPalette(tool);
        
        // Les outils géométriques utilisent maintenant directement this.currentColor et this.currentLineWidth
        
        // Ajuster l'épaisseur par défaut selon l'outil
        if (tool === 'highlighter' && this.currentLineWidth < 5) {
            this.setCurrentLineWidth(8); // Épaisseur plus importante pour le surligneur
        } else if (tool === 'pen' && this.currentLineWidth > 5) {
            this.setCurrentLineWidth(2); // Épaisseur normale pour le stylo
        }
        
        // OPTIMISATION: Mise à jour instantanée du curseur
        this.updateToolCursor(tool);

        // Gérer SimplePenAnnotation pour l'outil stylo
        if (tool === 'pen') {
            // Activer SimplePenAnnotation pour toutes les pages
            this.pageElements.forEach((pageElement, pageNum) => {
                if (!this.annotationEngines.has(pageNum)) {
                    this.initAnnotationEngine(pageNum);
                } else {
                    this.annotationEngines.get(pageNum).enable();
                }
            });
        } else {
            // Désactiver SimplePenAnnotation quand on change d'outil
            this.annotationEngines.forEach(engine => {
                engine.disable();
            });
        }

        // Réinitialiser les contextes de manière optimisée - batch processing
        requestAnimationFrame(() => {
            for (const [pageNum, pageElement] of this.pageElements) {
                if (pageElement?.annotationCtx && pageElement.annotationCanvas) {
                    // Activer les événements et ajuster le mode de composition
                    pageElement.annotationCanvas.style.pointerEvents = tool ? 'auto' : 'none';
                    pageElement.annotationCtx.globalCompositeOperation = 'source-over';

                    // Fix spécial pour eraser
                    if (tool === 'eraser') {
                        pageElement.annotationCanvas.style.display = 'block';
                        pageElement.annotationCanvas.style.visibility = 'visible';
                    }
                }
            }
        });

        // DÉSACTIVER le curseur personnalisé pour la gomme (il masque les annotations)
        if (this.elements.eraserCursor) {
            // TOUJOURS cacher le curseur personnalisé pour éviter qu'il masque les annotations
            this.elements.eraserCursor.style.display = 'none';
            this.removeEraserCursorEvents();
        }
    }
    
    /**
     * Debug function to inspect annotations state
     */
    debugAnnotationsState() {
        let totalPixels = 0;
        this.pageElements.forEach((pageElement, pageNum) => {
            if (pageElement?.annotationCtx) {
                const imageData = pageElement.annotationCtx.getImageData(0, 0, pageElement.annotationCtx.canvas.width, pageElement.annotationCtx.canvas.height);
                const pixelCount = imageData.data.filter((value, index) => index % 4 === 3 && value > 0).length;
                totalPixels += pixelCount;
            }
        });
        return { totalPixels, currentTool: this.currentTool };
    }
    
    /**
     * OPTIMISATION: Met à jour le curseur d'outil via CSS global (performance maximale)
     */
    updateToolCursor(tool) {
        // Supprimer toutes les classes d'outil du body pour reset
        document.body.classList.remove('tool-pen', 'tool-highlighter', 'tool-eraser', 'tool-text');
        
        // Ajouter la classe pour l'outil actuel - utilise CSS pour tous les canvas à la fois
        if (tool) {
            document.body.classList.add(`tool-${tool}`);
        }
        
        // Mise à jour instantanée des boutons UI
        document.querySelectorAll('.btn-annotation-tool').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    }
    
    /**
     * Met à jour la taille du curseur de la gomme
     */
    updateEraserCursorSize() {
        if (!this.elements.eraserCursor) return;
        
        const size = this.currentLineWidth * 8; // Taille plus proportionnelle
        this.elements.eraserCursor.style.width = `${size}px`;
        this.elements.eraserCursor.style.height = `${size}px`;
        // Centrage parfait avec transform au lieu de margin
        this.elements.eraserCursor.style.transform = `translate(-50%, -50%)`;
        
    }
    
    /**
     * Configure les événements de suivi de souris pour le curseur de la gomme
     */
    setupEraserCursorEvents() {
        this.eraserMouseMoveHandler = (e) => {
            if (!this.elements.eraserCursor) return;
            
            // Positionnement par rapport à la fenêtre pour un alignement parfait
            this.elements.eraserCursor.style.left = `${e.clientX}px`;
            this.elements.eraserCursor.style.top = `${e.clientY}px`;
            this.elements.eraserCursor.style.opacity = '0.7';
        };
        
        this.eraserMouseLeaveHandler = () => {
            if (this.elements.eraserCursor) {
                this.elements.eraserCursor.style.opacity = '0';
            }
        };
        
        this.eraserMouseEnterHandler = () => {
            if (this.elements.eraserCursor) {
                this.elements.eraserCursor.style.opacity = '0.7';
            }
        };
        
        // Attacher les événements au document pour un suivi global
        document.addEventListener('mousemove', this.eraserMouseMoveHandler);
        
        // Attacher les événements aux canvas d'annotation pour la visibilité
        const annotationCanvases = document.querySelectorAll('.pdf-annotation-layer');
        annotationCanvases.forEach(canvas => {
            canvas.addEventListener('mouseenter', this.eraserMouseEnterHandler);
            canvas.addEventListener('mouseleave', this.eraserMouseLeaveHandler);
        });
        
        // Événement global pour masquer quand on sort complètement
        if (this.elements.container) {
            this.elements.container.addEventListener('mouseleave', this.eraserMouseLeaveHandler);
        }
        
    }
    
    /**
     * Supprime les événements de suivi de souris pour le curseur de la gomme
     */
    removeEraserCursorEvents() {
        // Supprimer l'événement global
        if (this.eraserMouseMoveHandler) {
            document.removeEventListener('mousemove', this.eraserMouseMoveHandler);
        }
        
        // Supprimer les événements des canvas
        const annotationCanvases = document.querySelectorAll('.pdf-annotation-layer');
        annotationCanvases.forEach(canvas => {
            if (this.eraserMouseEnterHandler) {
                canvas.removeEventListener('mouseenter', this.eraserMouseEnterHandler);
            }
            if (this.eraserMouseLeaveHandler) {
                canvas.removeEventListener('mouseleave', this.eraserMouseLeaveHandler);
            }
        });
        
        // Supprimer l'événement du conteneur
        if (this.elements.container && this.eraserMouseLeaveHandler) {
            this.elements.container.removeEventListener('mouseleave', this.eraserMouseLeaveHandler);
        }
        
    }
    
    /**
     * Met à jour la palette de couleurs selon l'outil sélectionné
     */
    updateColorPalette(tool) {
        const colorPalette = document.querySelector('.color-palette');
        if (!colorPalette) return;
        
        let colors;
        if (tool === 'highlighter') {
            // Couleurs fluos pour le surligneur
            colors = [
                '#FF004F', // Rose/magenta fluo
                '#FDFF00', // Jaune fluo
                '#66FF00', // Vert lime fluo
                '#00F3FF', // Cyan fluo
                '#9F00FF'  // Violet fluo
            ];
        } else {
            // Couleurs normales pour les autres outils
            colors = this.currentMode.colors;
        }
        
        // Reconstruire la palette de couleurs
        const colorButtons = colors.map(color => 
            `<button class="color-btn ${color === this.currentColor ? 'active' : ''}" 
                     data-color="${color}" 
                     style="background-color: ${color}" 
                     title="Couleur ${color}"></button>`
        ).join('');
        
        colorPalette.innerHTML = colorButtons;
        
        // Réattacher les événements
        colorPalette.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const color = e.currentTarget.dataset.color;
                this.setCurrentColor(color);
            });
        });
        
        // Si la couleur actuelle n'est pas dans la nouvelle palette, prendre la première
        if (!colors.includes(this.currentColor)) {
            this.setCurrentColor(colors[0]);
        }
        
    }
    
    setCurrentColor(color) {
        this.currentColor = color;

        // Les outils géométriques utilisent maintenant directement this.currentColor

        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === color);
        });

        // Mettre à jour tous les moteurs d'annotation existants
        this.annotationEngines.forEach((engine, pageNum) => {
            this.updateAnnotationEngineOptions(pageNum);
        });
    }
    
    setCurrentLineWidth(width) {
        this.currentLineWidth = width;

        console.log('📏 Changement de largeur du stylo:', width);

        // Les outils géométriques utilisent maintenant directement this.currentLineWidth
        document.querySelectorAll('.stroke-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.width) === width);
        });

        // Mettre à jour tous les moteurs d'annotation existants
        this.annotationEngines.forEach((engine, pageNum) => {
            this.updateAnnotationEngineOptions(pageNum);
        });

        // Mettre à jour la taille du curseur de la gomme si elle est active
        if (this.currentTool === 'eraser') {
            this.updateEraserCursorSize();
        }
    }
    
    /**
     * Ajuste les coordonnées selon le mode d'affichage
     * Utilise le canvas principal comme référence pour éviter les décalages
     */
    adjustCoordinatesForMode(e, rect, pageNum) {
        // Pour corriger le décalage, utilisons toujours le canvas principal comme référence
        // car le canvas d'annotation peut avoir un positionnement légèrement différent
        let finalRect = rect;
        
        if (pageNum) {
            const pageElement = this.pageElements.get(pageNum);
            if (pageElement?.canvas) {
                finalRect = pageElement.canvas.getBoundingClientRect();
                if (this.options.debug) {
                }
            }
        }
        
        let baseCoords = {
            x: e.clientX - finalRect.left,
            y: e.clientY - finalRect.top
        };
        
        // Ajustement pour le rapport taille logique/taille d'affichage du canvas
        if (pageNum) {
            const pageElement = this.pageElements.get(pageNum);
            if (pageElement?.canvas) {
                const scaleX = pageElement.canvas.width / pageElement.canvas.offsetWidth;
                const scaleY = pageElement.canvas.height / pageElement.canvas.offsetHeight;
                
                baseCoords = {
                    x: baseCoords.x * scaleX,
                    y: baseCoords.y * scaleY
                };
                
                if (this.options.debug) {
                }
            }
        }
        
        // Debug: Log coordinate information
        if (this.options.debug) {
            
            if (pageNum) {
                const pageElement = this.pageElements.get(pageNum);
                if (pageElement?.canvas && pageElement?.annotationCanvas) {
                }
            }
            
        }
        
        return baseCoords;
    }
    
    /**
     * Détecter si un touch provient d'un stylet
     */
    isStylusTouch(touch) {
        // Méthode 1: Propriété touchType (supporté par certains navigateurs)
        if (touch.touchType === 'stylus') {
            return true;
        }
        
        // Méthode 2: Apple Pencil détection (iOS Safari)
        if (touch.force !== undefined) {
            // Apple Pencil a généralement force > 0 même avec pression légère
            if (touch.force > 0) {
                return true;
            }
        }
        
        // Méthode 3: Détection par rayon (Apple Pencil a un rayon très petit)
        if (touch.radiusX !== undefined && touch.radiusY !== undefined) {
            const avgRadius = (touch.radiusX + touch.radiusY) / 2;
            // Apple Pencil a généralement un rayon < 5
            if (avgRadius < 5) {
                return true;
            }
        }
        
        // Méthode 4: Pointer events
        if (window.PointerEvent && touch.pointerType === 'pen') {
            return true;
        }
        
        // Par défaut, considérer comme un doigt
        return false;
    }
    
    startDrawing(e, pageNum) {
        if (!this.currentMode.annotations) {
            return;
        }
        
        this.isDrawing = true;
        
        // Vérification de sécurité pour e.target et fallback
        let targetElement = e.target;
        if (!targetElement) {
            // Fallback: essayer de trouver le canvas d'annotation de cette page
            const pageElement = this.pageElements.get(pageNum);
            targetElement = pageElement?.annotationCanvas;
            
            if (!targetElement) {
                return;
            }
        }
        
        const rect = targetElement.getBoundingClientRect();
        
        // Ajuster les coordonnées pour le mode split
        const adjustedCoords = this.adjustCoordinatesForMode(e, rect, pageNum);
        this.lastPoint = {
            x: adjustedCoords.x,
            y: adjustedCoords.y
        };
        
        
        // Ne pas sauvegarder ici - on sauvegarde après l'action complétée
        
        // Initialiser la fonctionnalité ligne droite pour le stylo
        if (this.currentTool === 'pen') {
            this.startPoint = { ...this.lastPoint };
            this.drawingPath = [{ ...this.lastPoint }];
            this.isStabilized = false;

            // Sauvegarder l'état du canvas avant de commencer le trait
            const pageElement = this.pageElements.get(pageNum);
            if (pageElement?.annotationCanvas) {
                const ctx = pageElement.annotationCtx;
                this.currentStrokeImageData = ctx.getImageData(0, 0, pageElement.annotationCanvas.width, pageElement.annotationCanvas.height);
            }

            // Initialiser le moteur d'annotation pour cette page si nécessaire
            if (!this.annotationEngines.has(pageNum)) {
                this.initAnnotationEngine(pageNum);
            }

            // Démarrer le tracé avec le nouveau moteur perfect-freehand
            const engine = this.annotationEngines.get(pageNum);
            console.log('🎨 Début du tracé - Largeur:', engine.options.size, 'Position:', this.lastPoint);
            // Toujours utiliser une pression constante de 0.5 pour largeur uniforme
            const pressure = 0.5;
            engine.startPath(this.lastPoint.x, this.lastPoint.y, pressure);

            // Démarrer le timer pour la ligne droite automatique
            this.straightLineTimer = setTimeout(() => {
                this.convertToStraightLine(pageNum);
            }, this.straightLineTimeout);
        }

        // Initialiser l'outil règle
        if (this.currentTool === 'ruler') {
            this.rulerStartPoint = { ...this.lastPoint };
            this.rulerCurrentPoint = { ...this.lastPoint };
            this.createRulerMeasureElement();
        }

        // Initialiser l'outil compas
        if (this.currentTool === 'compass') {
            this.compassCenterPoint = { ...this.lastPoint };
            this.compassCurrentPoint = { ...this.lastPoint };
            this.createCompassRadiusElement();
        }

        // Initialiser l'outil rapporteur
        if (this.currentTool === 'protractor') {
            if (this.protractorState === 'initial') {
                // Premier clic : définir le centre de l'angle
                this.protractorCenterPoint = { ...this.lastPoint };
                this.protractorFirstPoint = { ...this.lastPoint };
                this.protractorState = 'drawing_first_line';
                this.createProtractorAngleElement();
            }
        }

        // Initialiser l'outil arc de cercle
        if (this.currentTool === 'arc') {
            if (this.arcState === 'initial') {
                // Sauvegarder l'état canvas PROPRE avant tout dessin
                const pageElement = this.pageElements.get(pageNum);
                if (pageElement?.annotationCtx && !this.arcCanvasState) {
                    this.arcCanvasState = pageElement.annotationCtx.getImageData(0, 0, pageElement.annotationCtx.canvas.width, pageElement.annotationCtx.canvas.height);
                }
                
                // Premier clic : définir le centre de l'arc
                this.arcCenterPoint = { ...this.lastPoint };
                this.arcRadiusPoint = { ...this.lastPoint };
                this.arcState = 'drawing_radius';
                this.createArcRadiusElement();
            }
        }
        
        // Initialiser l'outil texte
        if (this.currentTool === 'text') {
            // Ne pas démarrer le mode dessin pour le texte
            this.isDrawing = false;
            
            // Si il y a déjà une zone de texte active, la finaliser d'abord
            if (this.activeTextInput) {
                this.finalizeText(this.activeTextInput);
                return; // Ne pas créer de nouvelle zone
            }
            
            // Créer une zone de texte à la position du clic (avec délai pour éviter la propagation)
            setTimeout(() => {
                this.createTextInput(pageNum, this.lastPoint);
            }, 50);
            return; // Arrêter ici pour l'outil texte
        }
        
        // Initialiser l'outil flèche
        if (this.currentTool === 'arrow') {
            // Sauvegarder l'état du canvas pour la prévisualisation
            const pageElement = this.pageElements.get(pageNum);
            if (pageElement?.annotationCtx && !this.arrowCanvasState) {
                this.arrowCanvasState = pageElement.annotationCtx.getImageData(0, 0, pageElement.annotationCtx.canvas.width, pageElement.annotationCtx.canvas.height);
            }
            
            this.arrowStartPoint = { ...this.lastPoint };
            this.arrowEndPoint = { ...this.lastPoint };
            this.createArrowLengthElement();
        }
        
        // Initialiser l'outil rectangle
        if (this.currentTool === 'rectangle') {
            // Sauvegarder l'état du canvas pour la prévisualisation
            const pageElement = this.pageElements.get(pageNum);
            if (pageElement?.annotationCtx && !this.rectangleCanvasState) {
                this.rectangleCanvasState = pageElement.annotationCtx.getImageData(0, 0, pageElement.annotationCtx.canvas.width, pageElement.annotationCtx.canvas.height);
            }
            
            this.rectangleStartPoint = { ...this.lastPoint };
            this.rectangleEndPoint = { ...this.lastPoint };
            this.createRectangleMeasureElement();
        }
        
        // Initialiser l'outil cercle
        if (this.currentTool === 'circle') {
            // Sauvegarder l'état du canvas pour la prévisualisation
            const pageElement = this.pageElements.get(pageNum);
            if (pageElement?.annotationCtx && !this.circleCanvasState) {
                this.circleCanvasState = pageElement.annotationCtx.getImageData(0, 0, pageElement.annotationCtx.canvas.width, pageElement.annotationCtx.canvas.height);
            }
            
            this.circleStartPoint = { ...this.lastPoint };
            this.circleEndPoint = { ...this.lastPoint };
            this.createCircleMeasureElement();
        }

        // Outil grille - basculer la visibilité
        if (this.currentTool === 'grid') {
            const currentVisibility = this.gridVisible.get(pageNum) || false;
            this.gridVisible.set(pageNum, !currentVisibility);
            this.toggleGridDisplay(pageNum);
            
            // Empêcher le mode dessin pour la grille
            this.isDrawing = false;
            return; // Arrêter ici pour l'outil grille
        }
        
        const pageElement = this.pageElements.get(pageNum);
        if (pageElement?.annotationCanvas) {
            // NE PAS activer pointerEvents ici - géré dynamiquement par le système de détection stylet
            
            // Pour le surligneur, commencer un nouveau chemin continu
            if (this.currentTool === 'highlighter') {
                const ctx = pageElement.annotationCtx;
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 0.01; // 1% d'opacité pour un contrôle ultra-fin
                ctx.strokeStyle = this.currentColor;
                ctx.lineWidth = this.currentLineWidth * 3;
                ctx.lineCap = 'round'; // Changer en round pour les extrémités
                ctx.lineJoin = 'round'; // Changer en round pour les jointures
                
                // Commencer un nouveau chemin
                ctx.beginPath();
                ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
            }
        } else {
        }
    }
    
    draw(e, pageNum) {
        if (!this.isDrawing || !this.currentMode.annotations) return;

        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        // Vérification de sécurité pour e.target et fallback
        let targetElement = e.target;
        if (!targetElement) {
            // Fallback: essayer de trouver le canvas d'annotation de cette page
            const pageElement = this.pageElements.get(pageNum);
            targetElement = pageElement?.annotationCanvas;
            if (!targetElement) return;
        }
        
        const rect = targetElement.getBoundingClientRect();
        const currentPoint = this.adjustCoordinatesForMode(e, rect, pageNum);
        
        // Logs de débogage pour le premier trait
        if (!this.drawingLogged) {
            this.drawingLogged = true;
        }
        
        const ctx = pageElement.annotationCtx;
        
        if (this.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = this.currentColor;
            // Utiliser la même taille que le curseur visuel
            ctx.lineWidth = this.currentLineWidth * 8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
        } else if (this.currentTool === 'highlighter') {
            // S'assurer qu'on n'est plus en mode effacement pour le surligneur
            ctx.globalCompositeOperation = 'source-over';
            // Pour le surligneur, continuer le chemin existant pour un trait continu
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
            
            // Remettre l'opacité à 1% pour le prochain segment
            ctx.globalAlpha = 0.01;
        } else if (this.currentTool === 'ruler') {
            // Pour la règle, dessiner la ligne en temps réel
            this.rulerCurrentPoint = { ...currentPoint };
            this.drawRulerPreview(pageNum);
            this.updateRulerMeasure(pageNum);
        } else if (this.currentTool === 'compass') {
            // Pour le compas, dessiner le cercle en temps réel
            this.compassCurrentPoint = { ...currentPoint };
            this.drawCompassPreview(pageNum);
            this.updateCompassRadius(pageNum);
        } else if (this.currentTool === 'protractor') {
            // Pour le rapporteur, gérer les différents états
            if (this.protractorState === 'drawing_first_line') {
                this.protractorFirstPoint = { ...currentPoint };
                this.drawProtractorFirstLinePreview(pageNum);
                
                // Logique de validation par immobilité
                const distance = Math.sqrt(
                    Math.pow(currentPoint.x - this.protractorCenterPoint.x, 2) + 
                    Math.pow(currentPoint.y - this.protractorCenterPoint.y, 2)
                );
                
                // Si on a bougé assez loin du centre et qu'on n'a pas encore démarré le timer
                if (distance > 20 && !this.protractorValidationTimer) {
                    this.startProtractorValidationTimer(pageNum);
                } 
                // Si on bouge pendant le timer, le relancer
                else if (distance > 20 && this.protractorValidationTimer) {
                    this.startProtractorValidationTimer(pageNum); // Ceci va nettoyer l'ancien timer
                }
            } else if (this.protractorState === 'drawing_second_line') {
                this.protractorSecondPoint = { ...currentPoint };
                this.drawProtractorAnglePreview(pageNum);
                this.updateProtractorAngle(pageNum);
            }
        } else if (this.currentTool === 'arc') {
            // Pour l'arc de cercle, gérer les différents états
            if (this.arcState === 'drawing_radius') {
                this.arcRadiusPoint = { ...currentPoint };
                this.drawArcRadiusPreview(pageNum);
                this.updateArcRadius(pageNum);
                
                // Logique de validation par immobilité (comme le rapporteur)
                const distance = Math.sqrt(
                    Math.pow(currentPoint.x - this.arcCenterPoint.x, 2) + 
                    Math.pow(currentPoint.y - this.arcCenterPoint.y, 2)
                );
                
                // Si on a bougé assez loin du centre et qu'on n'a pas encore démarré le timer
                if (distance > 20 && !this.arcValidationTimer) {
                    this.startArcValidationTimer(pageNum);
                } 
                // Si on bouge pendant le timer, le relancer
                else if (distance > 20 && this.arcValidationTimer) {
                    this.startArcValidationTimer(pageNum);
                }
            } else if (this.arcState === 'drawing_arc') {
                this.arcEndPoint = { ...currentPoint };
                this.drawArcPreview(pageNum);
                this.updateArcRadius(pageNum);
                this.updateArcAngle(pageNum);
            }
        } else if (this.currentTool === 'arrow') {
            // Pour la flèche, dessiner la flèche en temps réel
            this.arrowEndPoint = { ...currentPoint };
            this.drawArrowPreview(pageNum);
            this.updateArrowLength(pageNum);
        } else if (this.currentTool === 'rectangle') {
            // Pour le rectangle, dessiner le rectangle en temps réel
            this.rectangleEndPoint = { ...currentPoint };
            this.drawRectanglePreview(pageNum);
            this.updateRectangleMeasure(pageNum);
        } else if (this.currentTool === 'circle') {
            // Pour le cercle, dessiner le cercle en temps réel
            this.circleEndPoint = { ...currentPoint };
            this.drawCirclePreview(pageNum);
            this.updateCircleMeasure(pageNum);
        } else {
            // Configuration pour le stylo et autres outils
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0; // Opacité complète
            ctx.strokeStyle = this.currentColor;
            ctx.lineWidth = this.currentLineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Pour le stylo, utiliser le nouveau moteur perfect-freehand
            if (this.currentTool === 'pen') {
                this.drawingPath.push({ ...currentPoint });

                // Si on bouge significativement, annuler le timer de ligne droite
                const distance = Math.sqrt(
                    Math.pow(currentPoint.x - this.startPoint.x, 2) +
                    Math.pow(currentPoint.y - this.startPoint.y, 2)
                );

                // Si on bouge de plus de 10 pixels du point de départ, reset le timer
                if (distance > 10 && this.straightLineTimer && !this.isStabilized) {
                    clearTimeout(this.straightLineTimer);
                    this.straightLineTimer = setTimeout(() => {
                        this.convertToStraightLine(pageNum);
                    }, this.straightLineTimeout);
                }

                // Utiliser le nouveau moteur d'annotation perfect-freehand
                const engine = this.annotationEngines.get(pageNum);
                if (!engine) {
                    console.error(`❌ CRITIQUE: Pas de moteur d'annotation pour la page ${pageNum} pendant le dessin!`);
                    return;
                }

                // Interpoler les points si la distance est grande (éviter les trous)
                const dx = currentPoint.x - this.lastPoint.x;
                const dy = currentPoint.y - this.lastPoint.y;
                const pointDistance = Math.sqrt(dx * dx + dy * dy);

                // Si distance > 5 pixels, interpoler des points intermédiaires
                if (pointDistance > 5) {
                    const steps = Math.ceil(pointDistance / 3); // Point tous les 3 pixels
                    for (let i = 1; i <= steps; i++) {
                        const t = i / steps;
                        const interpX = this.lastPoint.x + dx * t;
                        const interpY = this.lastPoint.y + dy * t;
                        const pressure = 0.5;
                        engine.addPoint(interpX, interpY, pressure);
                    }
                } else {
                    // Sinon ajouter le point directement
                    const pressure = 0.5;
                    engine.addPoint(currentPoint.x, currentPoint.y, pressure);
                }

                // Rendu optimisé : effacer l'ancien stroke et redessiner le nouveau
                const strokePoints = engine.currentStroke;
                if (strokePoints) {
                    if (this.currentStrokeImageData) {
                        // Restaurer l'état avant le dernier stroke pour éviter accumulation
                        ctx.putImageData(this.currentStrokeImageData, 0, 0);
                    }

                    // Dessiner le nouveau stroke complet
                    engine.renderCurrentStroke(ctx);

                    // Sauvegarder l'état pour le prochain frame
                    this.currentStrokeImageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
                }
            } else {
                // Tracé classique pour les autres outils
                ctx.beginPath();
                ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
                ctx.lineTo(currentPoint.x, currentPoint.y);
                ctx.stroke();
            }
        }
        
        this.lastPoint = currentPoint;
    }
    
    stopDrawing(e, pageNum) {
        if (this.isDrawing) {
            
            // Nettoyer le timer de ligne droite pour le stylo
            if (this.currentTool === 'pen' && this.straightLineTimer) {
                clearTimeout(this.straightLineTimer);
                this.straightLineTimer = null;
            }

            // Finaliser le tracé avec le nouveau moteur perfect-freehand
            if (this.currentTool === 'pen') {
                const engine = this.annotationEngines.get(pageNum);
                if (engine) {
                    const pathData = engine.endPath();

                    // Nettoyer les données temporaires
                    this.currentStrokeImageData = null;
                }
            }
            
            const pageElement = this.pageElements.get(pageNum);
            
            // Pour le surligneur, simplement remettre l'opacité normale sans ajouter de point
            if (this.currentTool === 'highlighter' && pageElement?.annotationCtx) {
                const ctx = pageElement.annotationCtx;
                ctx.globalAlpha = 1.0; // Remettre l'opacité normale
            }

            // Pour la règle, finaliser la ligne et nettoyer l'affichage
            if (this.currentTool === 'ruler') {
                this.finalizeRulerLine(pageNum);
                this.cleanupRulerDisplay();
            }

            // Pour le compas, finaliser le cercle et nettoyer l'affichage
            if (this.currentTool === 'compass') {
                this.finalizeCompassCircle(pageNum);
                this.cleanupCompassDisplay();
            }

            // Pour le rapporteur, finaliser l'angle et nettoyer l'affichage
            if (this.currentTool === 'protractor') {
                if (this.protractorState === 'drawing_second_line') {
                    this.finalizeProtractorAngle(pageNum);
                    this.cleanupProtractorDisplay();
                    this.resetProtractorState();
                } else if (this.protractorState === 'drawing_first_line') {
                    // Si on relâche pendant le premier trait, annuler
                    this.resetProtractorState();
                    this.cleanupProtractorDisplay();
                }
            }

            // Pour l'arc de cercle, finaliser l'arc et nettoyer l'affichage
            if (this.currentTool === 'arc') {
                if (this.arcState === 'drawing_arc') {
                    this.finalizeArc(pageNum);
                    this.cleanupArcDisplay();
                    this.resetArcState();
                } else if (this.arcState === 'drawing_radius') {
                    // Si on relâche pendant le premier trait (rayon), annuler
                    this.resetArcState();
                    this.cleanupArcDisplay();
                }
            }

            // Pour la flèche, finaliser la flèche et nettoyer l'affichage
            if (this.currentTool === 'arrow') {
                this.finalizeArrow(pageNum);
                this.cleanupArrowDisplay();
            }

            // Pour le rectangle, finaliser le rectangle et nettoyer l'affichage
            if (this.currentTool === 'rectangle') {
                this.finalizeRectangle(pageNum);
                this.cleanupRectangleDisplay();
            }

            // Pour le cercle, finaliser le cercle et nettoyer l'affichage
            if (this.currentTool === 'circle') {
                this.finalizeCircle(pageNum);
                this.cleanupCircleDisplay();
            }
            
            // Pour la gomme, s'assurer de remettre le mode de composition normal
            if (this.currentTool === 'eraser' && pageElement?.annotationCtx) {
                pageElement.annotationCtx.globalCompositeOperation = 'source-over';
            }
            
            // Sauvegarder l'état final pour tous les outils dans l'historique undo/redo
            this.saveCanvasState(pageNum);
            
            this.isDrawing = false;
            this.lastPoint = null;
            this.drawingLogged = false; // Reset pour le prochain trait
            
            // Reset des variables ligne droite
            this.drawingPath = [];
            this.startPoint = null;
            this.isStabilized = false;
            this.currentStrokeImageData = null;

            // Reset des variables règle
            this.rulerStartPoint = null;
            this.rulerCurrentPoint = null;

            // Reset des variables compas
            this.compassCenterPoint = null;
            this.compassCurrentPoint = null;
            
            // Nettoyage partiel des variables rapporteur (garder l'état si en cours)
            if (this.currentTool !== 'protractor' || this.protractorState === 'initial') {
                this.resetProtractorState();
            }
            
            if (pageElement?.annotationCanvas) {
                // Ne pas désactiver pointer-events ici car l'outil est toujours sélectionné
                // pageElement.annotationCanvas.style.pointerEvents = 'none';
            }
            
            // Sauvegarder automatiquement si activé
            if (this.options.autoSave) {
                this.scheduleAutoSave();
            }
        }
    }

    /**
     * Convertit le trait actuel en ligne droite (fonctionnalité style iPad)
     */
    convertToStraightLine(pageNum) {
        if (!this.isDrawing || this.currentTool !== 'pen' || this.isStabilized) {
            return;
        }

        this.isStabilized = true;

        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || this.drawingPath.length < 2) {
            return;
        }

        const ctx = pageElement.annotationCtx;
        const startPoint = this.startPoint;
        const endPoint = this.drawingPath[this.drawingPath.length - 1];

        // Calculer la distance pour vérifier si c'est une vraie ligne
        const distance = Math.sqrt(
            Math.pow(endPoint.x - startPoint.x, 2) + 
            Math.pow(endPoint.y - startPoint.y, 2)
        );

        // Seulement convertir si la ligne fait au moins 20 pixels
        if (distance < 20) {
            return;
        }


        // Restaurer l'état du canvas avant le trait actuel (efface seulement le trait en cours)
        if (this.currentStrokeImageData) {
            ctx.putImageData(this.currentStrokeImageData, 0, 0);
        }

        // Remplacer le tracé lissé par une ligne droite parfaite
        this.smoothDrawingPath = [
            this.convertPointForPerfectFreehand(startPoint, 0.5),
            this.convertPointForPerfectFreehand(endPoint, 0.5)
        ];

        // Dessiner la ligne droite parfaite
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.stroke();


        // Mettre à jour le chemin avec juste les deux points
        this.drawingPath = [startPoint, endPoint];

        // Effet visuel de feedback (petit flash)
        this.showStraightLineConfirmation(pageElement.annotationCanvas);
    }

    /**
     * Efface les annotations de la page (pour redessiner proprement)
     */
    clearPageAnnotations(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (pageElement?.annotationCtx) {
            const canvas = pageElement.annotationCanvas;
            pageElement.annotationCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    /**
     * Affiche une confirmation visuelle de la conversion en ligne droite
     */
    showStraightLineConfirmation(canvas) {
        // Effet flash subtil pour confirmer la conversion
        const originalFilter = canvas.style.filter;
        canvas.style.filter = 'brightness(1.2)';
        
        setTimeout(() => {
            canvas.style.filter = originalFilter;
        }, 150);

    }

    /**
     * Crée l'élément d'affichage de la mesure pour la règle
     */
    createRulerMeasureElement() {
        // Supprimer l'ancien élément s'il existe
        if (this.rulerMeasureElement) {
            this.rulerMeasureElement.remove();
        }

        this.rulerMeasureElement = document.createElement('div');
        this.rulerMeasureElement.id = 'ruler-measure';
        this.rulerMeasureElement.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            pointer-events: none;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            transform: translate(-50%, -120%);
            display: none;
        `;

        document.body.appendChild(this.rulerMeasureElement);
    }

    /**
     * Dessine la prévisualisation de la règle en temps réel
     */
    drawRulerPreview(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.rulerStartPoint || !this.rulerCurrentPoint) {
            return;
        }

        const ctx = pageElement.annotationCtx;
        const canvas = pageElement.annotationCanvas;

        // Sauvegarder l'état propre du canvas la première fois (AVANT toute prévisualisation)
        if (!this.rulerCanvasState) {
            this.rulerCanvasState = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        
        // Restaurer l'état propre du canvas (sans aucune prévisualisation)
        ctx.putImageData(this.rulerCanvasState, 0, 0);

        // Dessiner la ligne de prévisualisation
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#FF4444'; // Rouge pour la prévisualisation
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.setLineDash([5, 5]); // Ligne pointillée

        ctx.beginPath();
        ctx.moveTo(this.rulerStartPoint.x, this.rulerStartPoint.y);
        ctx.lineTo(this.rulerCurrentPoint.x, this.rulerCurrentPoint.y);
        ctx.stroke();

        // Dessiner les marqueurs aux extrémités
        this.drawRulerEndpoints(ctx);

        ctx.restore();
    }

    /**
     * Dessine les marqueurs aux extrémités de la règle (prévisualisation)
     */
    drawRulerEndpoints(ctx) {
        const radius = 4;
        
        // Durant la prévisualisation, dessiner seulement le point d'arrivée rouge
        // Le point de départ noir sera ajouté seulement lors de la finalisation
        ctx.fillStyle = '#FF4444';
        ctx.beginPath();
        ctx.arc(this.rulerCurrentPoint.x, this.rulerCurrentPoint.y, radius, 0, 2 * Math.PI);
        ctx.fill();
    }

    /**
     * Met à jour l'affichage de la mesure
     */
    updateRulerMeasure(pageNum) {
        if (!this.rulerMeasureElement || !this.rulerStartPoint || !this.rulerCurrentPoint) {
            return;
        }

        // Calculer la distance en pixels
        const deltaX = this.rulerCurrentPoint.x - this.rulerStartPoint.x;
        const deltaY = this.rulerCurrentPoint.y - this.rulerStartPoint.y;
        const distancePixels = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Convertir en centimètres (en tenant compte du zoom)
        const distanceCm = (distancePixels / (this.a4PixelsPerCm * this.currentScale));

        // Position du curseur pour afficher la mesure
        const midX = (this.rulerStartPoint.x + this.rulerCurrentPoint.x) / 2;
        const midY = (this.rulerStartPoint.y + this.rulerCurrentPoint.y) / 2;

        // Convertir en coordonnées de fenêtre (utiliser la page courante)
        const canvas = this.pageElements.get(pageNum)?.annotationCanvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const windowX = rect.left + midX;
            const windowY = rect.top + midY;

            this.rulerMeasureElement.style.left = windowX + 'px';
            this.rulerMeasureElement.style.top = windowY + 'px';
            this.rulerMeasureElement.style.display = 'block';
            this.rulerMeasureElement.textContent = `${distanceCm.toFixed(1)} cm`;
        }
    }

    /**
     * Finalise la ligne de règle (la dessine de façon permanente)
     */
    finalizeRulerLine(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.rulerStartPoint || !this.rulerCurrentPoint) {
            return;
        }

        // Restaurer le canvas à l'état avant la prévisualisation
        if (this.rulerCanvasState) {
            const ctx = pageElement.annotationCtx;
            ctx.putImageData(this.rulerCanvasState, 0, 0);
        }

        // Dessiner la ligne finale (solide)
        const ctx = pageElement.annotationCtx;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash([]); // Ligne solide

        ctx.beginPath();
        ctx.moveTo(this.rulerStartPoint.x, this.rulerStartPoint.y);
        ctx.lineTo(this.rulerCurrentPoint.x, this.rulerCurrentPoint.y);
        ctx.stroke();

        // Dessiner les points d'extrémité noirs
        this.drawFinalRulerEndpoints(ctx);
        
        ctx.restore();

        this.rulerCanvasState = null;
    }

    /**
     * Nettoie l'affichage de la règle
     */
    cleanupRulerDisplay() {
        if (this.rulerMeasureElement) {
            this.rulerMeasureElement.style.display = 'none';
        }
        this.rulerCanvasState = null;
    }

    /**
     * Dessine les points d'extrémité noirs pour la ligne finale
     */
    drawFinalRulerEndpoints(ctx) {
        const radius = 3;
        
        // Point de départ (noir)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(this.rulerStartPoint.x, this.rulerStartPoint.y, radius, 0, 2 * Math.PI);
        ctx.fill();

        // Point d'arrivée (noir)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(this.rulerCurrentPoint.x, this.rulerCurrentPoint.y, radius, 0, 2 * Math.PI);
        ctx.fill();

    }

    /**
     * Crée l'élément d'affichage du rayon pour le compas
     */
    createCompassRadiusElement() {
        // Supprimer l'ancien élément s'il existe
        if (this.compassRadiusElement) {
            this.compassRadiusElement.remove();
        }

        this.compassRadiusElement = document.createElement('div');
        this.compassRadiusElement.id = 'compass-radius';
        this.compassRadiusElement.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            pointer-events: none;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 165, 0, 0.4);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            transform: translate(-50%, -120%);
            display: none;
        `;

        document.body.appendChild(this.compassRadiusElement);
    }

    /**
     * Dessine la prévisualisation du compas en temps réel
     */
    drawCompassPreview(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.compassCenterPoint || !this.compassCurrentPoint) {
            return;
        }

        const ctx = pageElement.annotationCtx;
        const canvas = pageElement.annotationCanvas;

        // Sauvegarder l'état propre du canvas la première fois (AVANT toute prévisualisation)
        if (!this.compassCanvasState) {
            this.compassCanvasState = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        
        // Restaurer l'état propre du canvas (sans aucune prévisualisation)
        ctx.putImageData(this.compassCanvasState, 0, 0);

        // Calculer le rayon
        const deltaX = this.compassCurrentPoint.x - this.compassCenterPoint.x;
        const deltaY = this.compassCurrentPoint.y - this.compassCenterPoint.y;
        const radius = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Dessiner la prévisualisation du cercle
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#FF4444'; // Rouge pour la prévisualisation
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.setLineDash([5, 5]); // Ligne pointillée

        ctx.beginPath();
        ctx.arc(this.compassCenterPoint.x, this.compassCenterPoint.y, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Dessiner la ligne du rayon
        ctx.setLineDash([2, 2]); // Ligne pointillée plus fine
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.compassCenterPoint.x, this.compassCenterPoint.y);
        ctx.lineTo(this.compassCurrentPoint.x, this.compassCurrentPoint.y);
        ctx.stroke();

        // Dessiner les marqueurs
        this.drawCompassMarkers(ctx);

        ctx.restore();
    }

    /**
     * Dessine les marqueurs du compas (centre et point du rayon)
     */
    drawCompassMarkers(ctx) {
        // Point central (vert)
        ctx.fillStyle = '#22C55E';
        ctx.beginPath();
        ctx.arc(this.compassCenterPoint.x, this.compassCenterPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Point du rayon (rouge)
        ctx.fillStyle = '#FF4444';
        ctx.beginPath();
        ctx.arc(this.compassCurrentPoint.x, this.compassCurrentPoint.y, 3, 0, 2 * Math.PI);
        ctx.fill();
    }

    /**
     * Met à jour l'affichage du rayon
     */
    updateCompassRadius(pageNum) {
        if (!this.compassRadiusElement || !this.compassCenterPoint || !this.compassCurrentPoint) {
            return;
        }

        // Calculer le rayon en pixels
        const deltaX = this.compassCurrentPoint.x - this.compassCenterPoint.x;
        const deltaY = this.compassCurrentPoint.y - this.compassCenterPoint.y;
        const radiusPixels = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Convertir en centimètres (en tenant compte du zoom)
        const radiusCm = (radiusPixels / (this.a4PixelsPerCm * this.currentScale));

        // Position du curseur pour afficher la mesure (au milieu du rayon)
        const midX = (this.compassCenterPoint.x + this.compassCurrentPoint.x) / 2;
        const midY = (this.compassCenterPoint.y + this.compassCurrentPoint.y) / 2;

        // Convertir en coordonnées de fenêtre (utiliser la page courante)
        const canvas = this.pageElements.get(pageNum)?.annotationCanvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const windowX = rect.left + midX;
            const windowY = rect.top + midY;

            this.compassRadiusElement.style.left = windowX + 'px';
            this.compassRadiusElement.style.top = windowY + 'px';
            this.compassRadiusElement.style.display = 'block';
            this.compassRadiusElement.textContent = `r: ${radiusCm.toFixed(1)} cm`;
        }
    }

    /**
     * Finalise le cercle du compas (le dessine de façon permanente)
     */
    finalizeCompassCircle(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.compassCenterPoint || !this.compassCurrentPoint) {
            return;
        }

        // Restaurer le canvas à l'état avant la prévisualisation
        if (this.compassCanvasState) {
            const ctx = pageElement.annotationCtx;
            ctx.putImageData(this.compassCanvasState, 0, 0);
        }

        // Calculer le rayon final
        const deltaX = this.compassCurrentPoint.x - this.compassCenterPoint.x;
        const deltaY = this.compassCurrentPoint.y - this.compassCenterPoint.y;
        const radius = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Dessiner le cercle final (solide)
        const ctx = pageElement.annotationCtx;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash([]); // Ligne solide

        ctx.beginPath();
        ctx.arc(this.compassCenterPoint.x, this.compassCenterPoint.y, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Dessiner le point central noir
        this.drawFinalCompassCenter(ctx);
        
        ctx.restore();

        this.compassCanvasState = null;
    }

    /**
     * Dessine le point central noir du compas
     */
    drawFinalCompassCenter(ctx) {
        // Point central (noir)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(this.compassCenterPoint.x, this.compassCenterPoint.y, 2, 0, 2 * Math.PI);
        ctx.fill();

    }

    /**
     * Nettoie l'affichage du compas
     */
    cleanupCompassDisplay() {
        if (this.compassRadiusElement) {
            this.compassRadiusElement.style.display = 'none';
        }
        this.compassCanvasState = null;
    }

    /**
     * ==========================================
     * FONCTIONS OUTIL RAPPORTEUR (PROTRACTOR)
     * ==========================================
     */

    /**
     * Crée l'élément d'affichage de l'angle pour le rapporteur
     */
    createProtractorAngleElement() {
        // Supprimer l'ancien élément s'il existe
        if (this.protractorAngleElement) {
            this.protractorAngleElement.remove();
        }

        this.protractorAngleElement = document.createElement('div');
        this.protractorAngleElement.id = 'protractor-angle';
        this.protractorAngleElement.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            pointer-events: none;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 165, 0, 0.4);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            transform: translate(-50%, -120%);
            display: none;
        `;

        document.body.appendChild(this.protractorAngleElement);
    }

    /**
     * Dessine la prévisualisation du premier trait du rapporteur
     */
    drawProtractorFirstLinePreview(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.protractorCenterPoint || !this.protractorFirstPoint) {
            return;
        }

        const ctx = pageElement.annotationCtx;
        const canvas = pageElement.annotationCanvas;

        // Sauvegarder l'état propre du canvas la première fois
        if (!this.protractorCanvasState) {
            this.protractorCanvasState = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        
        // Restaurer l'état propre du canvas
        ctx.putImageData(this.protractorCanvasState, 0, 0);

        // Dessiner la ligne de prévisualisation (comme la règle)
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#FF4444'; // Rouge pour la prévisualisation
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.setLineDash([5, 5]); // Ligne pointillée

        ctx.beginPath();
        ctx.moveTo(this.protractorCenterPoint.x, this.protractorCenterPoint.y);
        ctx.lineTo(this.protractorFirstPoint.x, this.protractorFirstPoint.y);
        ctx.stroke();

        // Dessiner le point central
        ctx.fillStyle = '#22C55E'; // Vert pour le centre
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(this.protractorCenterPoint.x, this.protractorCenterPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Dessiner le point d'extrémité
        ctx.fillStyle = '#FF4444'; // Rouge pour l'extrémité
        ctx.beginPath();
        ctx.arc(this.protractorFirstPoint.x, this.protractorFirstPoint.y, 3, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
    }

    /**
     * Démarre le timer de validation pour le premier trait
     */
    startProtractorValidationTimer(pageNum) {
        // Nettoyer le timer précédent
        if (this.protractorValidationTimer) {
            clearTimeout(this.protractorValidationTimer);
        }

        this.protractorValidationTimer = setTimeout(() => {
            this.validateFirstLine(pageNum);
        }, this.protractorValidationTimeout);

    }

    /**
     * Valide le premier trait et passe au deuxième trait
     */
    validateFirstLine(pageNum) {
        if (this.protractorState !== 'drawing_first_line') {
            return;
        }

        this.protractorState = 'drawing_second_line';
        this.protractorSecondPoint = { ...this.protractorFirstPoint }; // Commencer du même point

        // Dessiner le premier trait de façon permanente
        this.drawPermanentFirstLine(pageNum);

        // Effet visuel de confirmation
        this.showProtractorValidationFeedback(pageNum);
    }

    /**
     * Dessine le premier trait de façon permanente
     */
    drawPermanentFirstLine(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état propre et dessiner le trait permanent
        if (this.protractorCanvasState) {
            ctx.putImageData(this.protractorCanvasState, 0, 0);
        }

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(this.protractorCenterPoint.x, this.protractorCenterPoint.y);
        ctx.lineTo(this.protractorFirstPoint.x, this.protractorFirstPoint.y);
        ctx.stroke();

        ctx.restore();

        // Sauvegarder l'état avec le premier trait
        this.protractorCanvasState = ctx.getImageData(0, 0, pageElement.annotationCanvas.width, pageElement.annotationCanvas.height);
    }

    /**
     * Affiche un feedback visuel de validation
     */
    showProtractorValidationFeedback(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCanvas) return;

        // Effet flash subtil
        const canvas = pageElement.annotationCanvas;
        const originalFilter = canvas.style.filter;
        canvas.style.filter = 'brightness(1.3) saturate(1.2)';
        
        setTimeout(() => {
            canvas.style.filter = originalFilter;
        }, 200);

    }

    /**
     * Dessine la prévisualisation de l'angle complet
     */
    drawProtractorAnglePreview(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.protractorCenterPoint || !this.protractorFirstPoint || !this.protractorSecondPoint) {
            return;
        }

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état avec le premier trait permanent
        if (this.protractorCanvasState) {
            ctx.putImageData(this.protractorCanvasState, 0, 0);
        }

        // Utiliser le point aimanté s'il existe, sinon le point actuel
        const effectiveSecondPoint = this.protractorSnappedPoint || this.protractorSecondPoint;

        // Dessiner le deuxième trait en prévisualisation
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        
        // Couleur différente si aimanté
        ctx.strokeStyle = this.protractorSnappedPoint ? '#22C55E' : '#FF4444'; // Vert si aimanté, rouge sinon
        ctx.lineWidth = this.protractorSnappedPoint ? 3 : 2; // Plus épais si aimanté
        ctx.lineCap = 'round';
        ctx.setLineDash([5, 5]);

        ctx.beginPath();
        ctx.moveTo(this.protractorCenterPoint.x, this.protractorCenterPoint.y);
        ctx.lineTo(effectiveSecondPoint.x, effectiveSecondPoint.y);
        ctx.stroke();

        // Dessiner l'arc de l'angle avec le point effectif
        this.drawAngleArc(ctx, effectiveSecondPoint);

        // Dessiner les marqueurs avec le point effectif
        this.drawProtractorMarkers(ctx, effectiveSecondPoint);

        ctx.restore();
    }

    /**
     * Dessine l'arc représentant l'angle
     */
    drawAngleArc(ctx, effectiveSecondPoint = null) {
        const radius = 30; // Rayon de l'arc d'angle
        const secondPoint = effectiveSecondPoint || this.protractorSecondPoint;

        // Calculer les angles
        const angle1 = Math.atan2(
            this.protractorFirstPoint.y - this.protractorCenterPoint.y,
            this.protractorFirstPoint.x - this.protractorCenterPoint.x
        );
        const angle2 = Math.atan2(
            secondPoint.y - this.protractorCenterPoint.y,
            secondPoint.x - this.protractorCenterPoint.x
        );

        // Couleur différente si aimanté
        ctx.strokeStyle = this.protractorSnappedPoint ? '#22C55E' : '#8B5CF6'; // Vert si aimanté, violet sinon
        ctx.lineWidth = this.protractorSnappedPoint ? 3 : 2; // Plus épais si aimanté
        ctx.setLineDash([3, 3]);

        ctx.beginPath();
        // Dessiner l'arc dans le sens trigonométrique (antihoraire)
        // Si angle2 < angle1, on traverse 0°, donc on dessine dans le sens positif
        if (angle2 < angle1) {
            ctx.arc(this.protractorCenterPoint.x, this.protractorCenterPoint.y, radius, angle1, angle2 + 2 * Math.PI);
        } else {
            ctx.arc(this.protractorCenterPoint.x, this.protractorCenterPoint.y, radius, angle1, angle2);
        }
        ctx.stroke();
    }

    /**
     * Dessine les marqueurs du rapporteur
     */
    drawProtractorMarkers(ctx, effectiveSecondPoint = null) {
        const secondPoint = effectiveSecondPoint || this.protractorSecondPoint;

        // Point central (vert)
        ctx.fillStyle = '#22C55E';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(this.protractorCenterPoint.x, this.protractorCenterPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Point de fin du deuxième trait - couleur selon aimantation
        ctx.fillStyle = this.protractorSnappedPoint ? '#22C55E' : '#FF4444'; // Vert si aimanté, rouge sinon
        const pointRadius = this.protractorSnappedPoint ? 4 : 3; // Plus gros si aimanté
        ctx.beginPath();
        ctx.arc(secondPoint.x, secondPoint.y, pointRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Si aimanté, ajouter un anneau pour indiquer l'aimantation
        if (this.protractorSnappedPoint) {
            ctx.strokeStyle = '#22C55E';
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.arc(secondPoint.x, secondPoint.y, 8, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    /**
     * Met à jour l'affichage de l'angle en degrés avec aimantation
     */
    updateProtractorAngle(pageNum) {
        if (!this.protractorAngleElement || !this.protractorCenterPoint || !this.protractorFirstPoint || !this.protractorSecondPoint) {
            return;
        }

        // Calculer l'angle entre les deux traits
        const angle1 = Math.atan2(
            this.protractorFirstPoint.y - this.protractorCenterPoint.y,
            this.protractorFirstPoint.x - this.protractorCenterPoint.x
        );
        const angle2 = Math.atan2(
            this.protractorSecondPoint.y - this.protractorCenterPoint.y,
            this.protractorSecondPoint.x - this.protractorCenterPoint.x
        );

        let angleDiff = angle2 - angle1;
        
        // Normaliser l'angle entre 0 et 2π (permettre angles complets 0-360°)
        if (angleDiff < 0) angleDiff += 2 * Math.PI;
        
        // Convertir en degrés (0° à 360°)
        let angleDegrees = (angleDiff * 180) / Math.PI;

        // Calculer l'angle le plus petit pour l'affichage (≤ 180°)
        let displayAngle = angleDegrees;
        if (angleDegrees > 180) {
            displayAngle = 360 - angleDegrees;
        }

        // AIMANTATION AUX ANGLES ENTIERS (sur l'angle d'affichage)
        let snappedAngle = displayAngle;
        let isSnapped = false;

        if (this.protractorSnapToInteger) {
            const nearestInteger = Math.round(displayAngle);
            const difference = Math.abs(displayAngle - nearestInteger);
            
            // Si on est assez proche d'un angle entier, s'y aimanter
            if (difference <= this.protractorSnapTolerance) {
                snappedAngle = nearestInteger;
                isSnapped = true;
                
                // Pour l'aimantation, on doit recalculer l'angle complet correct
                let targetFullAngle = snappedAngle;
                if (angleDegrees > 180 && snappedAngle !== 180) {
                    targetFullAngle = 360 - snappedAngle;
                }
                
                // Calculer le point corrigé pour l'aimantation
                this.protractorSnappedPoint = this.calculateSnappedPoint(targetFullAngle);
                
            } else {
                this.protractorSnappedPoint = null;
            }
        }

        // Position pour afficher la mesure (au centre de l'angle) - utiliser la page courante
        const canvas = this.pageElements.get(pageNum)?.annotationCanvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const windowX = rect.left + this.protractorCenterPoint.x;
            const windowY = rect.top + this.protractorCenterPoint.y - 50; // Un peu au-dessus du centre

            this.protractorAngleElement.style.left = windowX + 'px';
            this.protractorAngleElement.style.top = windowY + 'px';
            this.protractorAngleElement.style.display = 'block';
            
            // Afficher l'angle le plus petit avec indicateur d'aimantation
            const displayText = isSnapped ? `${snappedAngle}° 🧲` : `${displayAngle.toFixed(1)}°`;
            this.protractorAngleElement.textContent = displayText;
            
            // Changer la couleur pour indiquer l'aimantation
            this.protractorAngleElement.style.color = isSnapped ? '#22C55E' : 'white';
            this.protractorAngleElement.style.borderColor = isSnapped ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255, 165, 0, 0.4)';
        }
    }

    /**
     * Calcule la position du point corrigé pour l'aimantation
     */
    calculateSnappedPoint(targetAngleDegrees) {
        if (!this.protractorCenterPoint || !this.protractorFirstPoint || !this.protractorSecondPoint) {
            return null;
        }

        // Calculer l'angle du premier trait
        const angle1 = Math.atan2(
            this.protractorFirstPoint.y - this.protractorCenterPoint.y,
            this.protractorFirstPoint.x - this.protractorCenterPoint.x
        );

        // Calculer l'angle cible en radians (relatif au premier trait)
        const targetAngleRad = (targetAngleDegrees * Math.PI) / 180;
        const finalAngle = angle1 + targetAngleRad;

        // Calculer la distance actuelle du deuxième point
        const currentDistance = Math.sqrt(
            Math.pow(this.protractorSecondPoint.x - this.protractorCenterPoint.x, 2) + 
            Math.pow(this.protractorSecondPoint.y - this.protractorCenterPoint.y, 2)
        );

        // Calculer le nouveau point à la bonne position
        const snappedX = this.protractorCenterPoint.x + currentDistance * Math.cos(finalAngle);
        const snappedY = this.protractorCenterPoint.y + currentDistance * Math.sin(finalAngle);

        return {
            x: snappedX,
            y: snappedY
        };
    }

    /**
     * Finalise l'angle (le dessine de façon permanente)
     */
    finalizeProtractorAngle(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.protractorCenterPoint || !this.protractorFirstPoint || !this.protractorSecondPoint) {
            return;
        }

        // Restaurer l'état avec le premier trait
        if (this.protractorCanvasState) {
            const ctx = pageElement.annotationCtx;
            ctx.putImageData(this.protractorCanvasState, 0, 0);
        }

        // Utiliser le point aimanté pour la finalisation s'il existe
        const finalSecondPoint = this.protractorSnappedPoint || this.protractorSecondPoint;

        // Dessiner le deuxième trait permanent
        const ctx = pageElement.annotationCtx;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(this.protractorCenterPoint.x, this.protractorCenterPoint.y);
        ctx.lineTo(finalSecondPoint.x, finalSecondPoint.y);
        ctx.stroke();

        // Dessiner les points finaux noirs
        this.drawFinalProtractorPoints(ctx, finalSecondPoint);
        
        ctx.restore();

        this.protractorCanvasState = null;
    }

    /**
     * Dessine les points finaux noirs du rapporteur
     */
    drawFinalProtractorPoints(ctx, finalSecondPoint = null) {
        const radius = 2;
        const secondPoint = finalSecondPoint || this.protractorSecondPoint;
        
        // Point central (noir)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(this.protractorCenterPoint.x, this.protractorCenterPoint.y, radius + 1, 0, 2 * Math.PI);
        ctx.fill();

        // Points d'extrémité (noirs)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(this.protractorFirstPoint.x, this.protractorFirstPoint.y, radius, 0, 2 * Math.PI);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(secondPoint.x, secondPoint.y, radius, 0, 2 * Math.PI);
        ctx.fill();

        // Log avec information d'aimantation
        const wasSnapped = this.protractorSnappedPoint ? ' (avec aimantation)' : '';
    }

    /**
     * Nettoie l'affichage du rapporteur
     */
    cleanupProtractorDisplay() {
        if (this.protractorAngleElement) {
            this.protractorAngleElement.style.display = 'none';
        }
        if (this.protractorValidationTimer) {
            clearTimeout(this.protractorValidationTimer);
            this.protractorValidationTimer = null;
        }
        this.protractorCanvasState = null;
    }

    /**
     * Remet à zéro l'état du rapporteur
     */
    resetProtractorState() {
        this.protractorState = 'initial';
        this.protractorCenterPoint = null;
        this.protractorFirstPoint = null;
        this.protractorSecondPoint = null;
        if (this.protractorValidationTimer) {
            clearTimeout(this.protractorValidationTimer);
            this.protractorValidationTimer = null;
        }
    }

    // =====================================================
    // MÉTHODES OUTIL ARC DE CERCLE
    // =====================================================

    createArcRadiusElement() {
        // Créer l'élément d'affichage du rayon flottant
        this.arcRadiusElement = document.createElement('div');
        this.arcRadiusElement.style.position = 'fixed';
        this.arcRadiusElement.style.background = 'rgba(0, 0, 0, 0.9)';
        this.arcRadiusElement.style.color = '#F97316';
        this.arcRadiusElement.style.padding = '8px 12px';
        this.arcRadiusElement.style.borderRadius = '8px';
        this.arcRadiusElement.style.fontSize = '14px';
        this.arcRadiusElement.style.fontFamily = 'Monaco, monospace';
        this.arcRadiusElement.style.fontWeight = '600';
        this.arcRadiusElement.style.pointerEvents = 'none';
        this.arcRadiusElement.style.zIndex = '10000';
        this.arcRadiusElement.style.border = '2px solid rgba(249, 115, 22, 0.4)';
        this.arcRadiusElement.style.backdropFilter = 'blur(10px)';
        this.arcRadiusElement.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
        this.arcRadiusElement.style.transition = 'all 0.2s ease';
        this.arcRadiusElement.style.display = 'none';
        this.arcRadiusElement.textContent = '0.0 cm';
        document.body.appendChild(this.arcRadiusElement);

        // Créer l'élément d'affichage de l'angle flottant
        this.arcAngleElement = document.createElement('div');
        this.arcAngleElement.style.position = 'fixed';
        this.arcAngleElement.style.background = 'rgba(0, 0, 0, 0.9)';
        this.arcAngleElement.style.color = '#3B82F6';
        this.arcAngleElement.style.padding = '8px 12px';
        this.arcAngleElement.style.borderRadius = '8px';
        this.arcAngleElement.style.fontSize = '14px';
        this.arcAngleElement.style.fontFamily = 'Monaco, monospace';
        this.arcAngleElement.style.fontWeight = '600';
        this.arcAngleElement.style.pointerEvents = 'none';
        this.arcAngleElement.style.zIndex = '10000';
        this.arcAngleElement.style.border = '2px solid rgba(59, 130, 246, 0.4)';
        this.arcAngleElement.style.backdropFilter = 'blur(10px)';
        this.arcAngleElement.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
        this.arcAngleElement.style.transition = 'all 0.2s ease';
        this.arcAngleElement.style.display = 'none';
        this.arcAngleElement.textContent = '0°';
        document.body.appendChild(this.arcAngleElement);
        
    }

    drawArcRadiusPreview(pageNum) {
        // Dessiner la prévisualisation du rayon (trait pointillé)
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état propre (sauvegardé à l'initialisation)
        if (this.arcCanvasState) {
            ctx.putImageData(this.arcCanvasState, 0, 0);
        }
        
        // Dessiner le trait de rayon en pointillé rouge
        ctx.save();
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(this.arcCenterPoint.x, this.arcCenterPoint.y);
        ctx.lineTo(this.arcRadiusPoint.x, this.arcRadiusPoint.y);
        ctx.stroke();
        ctx.restore();
        
        // Dessiner les points de référence
        this.drawArcRadiusMarkers(ctx);
        
    }

    drawArcRadiusMarkers(ctx) {
        // Dessiner les marqueurs pour le rayon
        ctx.save();
        
        // Point central (vert)
        ctx.fillStyle = '#22C55E';
        ctx.beginPath();
        ctx.arc(this.arcCenterPoint.x, this.arcCenterPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Point du rayon (rouge)
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(this.arcRadiusPoint.x, this.arcRadiusPoint.y, 3, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
    }

    startArcValidationTimer(pageNum) {
        // Démarrer le timer de validation pour le rayon (1.5s)
        if (this.arcValidationTimer) {
            clearTimeout(this.arcValidationTimer);
        }

        this.arcValidationTimer = setTimeout(() => {
            this.validateArcRadius(pageNum);
        }, this.arcValidationTimeout);
        
    }

    validateArcRadius(pageNum) {
        // Valider le rayon et passer au tracé de l'arc
        if (this.arcState !== 'drawing_radius') {
            return;
        }

        this.arcState = 'drawing_arc';
        this.arcEndPoint = { ...this.arcRadiusPoint };
        
        // Nettoyer le canvas et sauvegarder l'état propre (le rayon sera masqué)
        this.drawPermanentRadius(pageNum);
        this.showArcValidationFeedback(pageNum);
        
    }

    drawPermanentRadius(pageNum) {
        // Nettoyer complètement et sauvegarder un état propre (sans rayon)
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état initial vraiment propre (celui sauvé au tout début)
        if (this.arcCanvasState) {
            ctx.putImageData(this.arcCanvasState, 0, 0);
        }
        
        // NE PAS resauvegarder - on garde l'état initial propre pour la finalisation
    }

    showArcValidationFeedback(pageNum) {
        // Afficher un feedback visuel de validation
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCanvas) return;

        const canvas = pageElement.annotationCanvas;
        canvas.style.filter = 'brightness(1.3) saturate(1.5)';
        
        setTimeout(() => {
            canvas.style.filter = '';
        }, 200);
        
    }

    drawArcPreview(pageNum) {
        // Dessiner la prévisualisation de l'arc complet
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état propre (SANS le rayon permanent)
        if (this.arcCanvasState) {
            ctx.putImageData(this.arcCanvasState, 0, 0);
        }
        
        // Calculer le rayon
        const radius = Math.sqrt(
            Math.pow(this.arcRadiusPoint.x - this.arcCenterPoint.x, 2) + 
            Math.pow(this.arcRadiusPoint.y - this.arcCenterPoint.y, 2)
        );
        
        // Calculer les angles
        const startAngle = Math.atan2(
            this.arcRadiusPoint.y - this.arcCenterPoint.y,
            this.arcRadiusPoint.x - this.arcCenterPoint.x
        );
        let endAngle = Math.atan2(
            this.arcEndPoint.y - this.arcCenterPoint.y,
            this.arcEndPoint.x - this.arcCenterPoint.x
        );

        // Vérifier l'aimantation
        const snappedPoint = this.calculateArcSnappedPoint();
        if (snappedPoint) {
            this.arcSnappedEndPoint = snappedPoint;
            endAngle = Math.atan2(
                snappedPoint.y - this.arcCenterPoint.y,
                snappedPoint.x - this.arcCenterPoint.x
            );
        } else {
            this.arcSnappedEndPoint = null;
        }

        // Calculer l'angle et s'assurer qu'on prend toujours le plus petit arc (≤ 180°)
        let angleDiff = ((endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI));
        let clockwise = false;
        
        if (angleDiff > Math.PI) {
            // L'arc direct est > 180°, on prend l'arc dans l'autre sens
            clockwise = true;
            angleDiff = 2 * Math.PI - angleDiff;
        }
        
        // Dessiner l'arc en prévisualisation
        ctx.save();
        if (snappedPoint) {
            ctx.strokeStyle = '#22C55E'; // Vert pour l'aimantation
            ctx.lineWidth = this.currentLineWidth + 1;
        } else {
            ctx.strokeStyle = this.currentColor;
            ctx.lineWidth = this.currentLineWidth;
        }
        ctx.setLineDash([6, 3]);
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.arc(this.arcCenterPoint.x, this.arcCenterPoint.y, radius, startAngle, endAngle, clockwise);
        ctx.stroke();
        ctx.restore();
        
        // Dessiner les marqueurs
        this.drawArcPreviewMarkers(ctx, radius, snappedPoint);
        
    }

    drawArcPreviewMarkers(ctx, radius, snappedPoint) {
        // Dessiner les marqueurs pour l'arc
        ctx.save();
        
        // Point central (vert)
        ctx.fillStyle = '#22C55E';
        ctx.beginPath();
        ctx.arc(this.arcCenterPoint.x, this.arcCenterPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Point de début du rayon (orange)
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.arc(this.arcRadiusPoint.x, this.arcRadiusPoint.y, 3, 0, 2 * Math.PI);
        ctx.fill();
        
        // Point de fin de l'arc
        if (snappedPoint) {
            // Point aimanté (vert plus gros)
            ctx.fillStyle = '#22C55E';
            ctx.beginPath();
            ctx.arc(snappedPoint.x, snappedPoint.y, 4, 0, 2 * Math.PI);
            ctx.fill();
            
            // Anneau d'aimantation
            ctx.strokeStyle = '#22C55E';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(snappedPoint.x, snappedPoint.y, 8, 0, 2 * Math.PI);
            ctx.stroke();
        } else {
            // Point normal (bleu)
            ctx.fillStyle = '#3B82F6';
            ctx.beginPath();
            ctx.arc(this.arcEndPoint.x, this.arcEndPoint.y, 3, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        ctx.restore();
    }

    updateArcRadius(pageNum) {
        // Mettre à jour l'affichage du rayon
        if (!this.arcRadiusElement || !this.arcCenterPoint || !this.arcRadiusPoint) return;
        
        // Calculer le rayon en pixels puis en cm
        const radiusPixels = Math.sqrt(
            Math.pow(this.arcRadiusPoint.x - this.arcCenterPoint.x, 2) + 
            Math.pow(this.arcRadiusPoint.y - this.arcCenterPoint.y, 2)
        );
        const radiusCm = radiusPixels / this.a4PixelsPerCm;
        
        // Mettre à jour le texte
        this.arcRadiusElement.textContent = `${radiusCm.toFixed(1)} cm`;
        
        // Positionner l'élément (utiliser la page courante)
        const canvas = this.pageElements.get(pageNum)?.annotationCanvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.left + this.arcCenterPoint.x;
            const centerY = rect.top + this.arcCenterPoint.y;
            
            this.arcRadiusElement.style.left = `${centerX - 30}px`;
            this.arcRadiusElement.style.top = `${centerY - 40}px`;
            this.arcRadiusElement.style.display = 'block';
        }
        
    }

    updateArcAngle(pageNum) {
        // Mettre à jour l'affichage de l'angle de l'arc
        if (!this.arcAngleElement || !this.arcCenterPoint || !this.arcRadiusPoint || !this.arcEndPoint) return;
        
        // Calculer les angles
        const startAngle = Math.atan2(
            this.arcRadiusPoint.y - this.arcCenterPoint.y,
            this.arcRadiusPoint.x - this.arcCenterPoint.x
        );
        const endAngle = Math.atan2(
            this.arcEndPoint.y - this.arcCenterPoint.y,
            this.arcEndPoint.x - this.arcCenterPoint.x
        );

        // Calculer l'angle de l'arc et toujours prendre le plus petit (≤ 180°)
        let arcAngleDeg = ((endAngle - startAngle) * 180 / Math.PI + 360) % 360;
        if (arcAngleDeg > 180) {
            arcAngleDeg = 360 - arcAngleDeg;
        }

        // Vérifier l'aimantation
        const snappedPoint = this.calculateArcSnappedPoint();
        let displayText;
        let color;

        if (snappedPoint) {
            displayText = `${snappedPoint.snappedAngle}° 🧲`;
            color = '#22C55E';
            this.arcAngleElement.style.color = color;
            this.arcAngleElement.style.borderColor = 'rgba(34, 197, 94, 0.4)';
        } else {
            displayText = `${Math.round(arcAngleDeg)}°`;
            color = '#3B82F6';
            this.arcAngleElement.style.color = color;
            this.arcAngleElement.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        }
        
        // Mettre à jour le texte
        this.arcAngleElement.textContent = displayText;
        
        // Positionner l'élément (décalé par rapport au rayon) - utiliser la page courante
        const canvas = this.pageElements.get(pageNum)?.annotationCanvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.left + this.arcCenterPoint.x;
            const centerY = rect.top + this.arcCenterPoint.y;
            
            this.arcAngleElement.style.left = `${centerX + 20}px`;
            this.arcAngleElement.style.top = `${centerY - 40}px`;
            this.arcAngleElement.style.display = 'block';
        }
        
    }

    finalizeArc(pageNum) {
        // Finaliser l'arc de cercle (sans le rayon)
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état propre (SANS le rayon permanent)
        if (this.arcCanvasState) {
            ctx.putImageData(this.arcCanvasState, 0, 0);
        }
        
        // Calculer le rayon
        const radius = Math.sqrt(
            Math.pow(this.arcRadiusPoint.x - this.arcCenterPoint.x, 2) + 
            Math.pow(this.arcRadiusPoint.y - this.arcCenterPoint.y, 2)
        );
        
        // Calculer les angles
        const startAngle = Math.atan2(
            this.arcRadiusPoint.y - this.arcCenterPoint.y,
            this.arcRadiusPoint.x - this.arcCenterPoint.x
        );
        let endAngle = Math.atan2(
            this.arcEndPoint.y - this.arcCenterPoint.y,
            this.arcEndPoint.x - this.arcCenterPoint.x
        );

        // Utiliser le point aimanté si disponible
        const snappedPoint = this.arcSnappedEndPoint;
        if (snappedPoint) {
            endAngle = Math.atan2(
                snappedPoint.y - this.arcCenterPoint.y,
                snappedPoint.x - this.arcCenterPoint.x
            );
        }

        // Calculer l'angle et s'assurer qu'on prend toujours le plus petit arc (≤ 180°)
        let angleDiff = ((endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI));
        let clockwise = false;
        
        if (angleDiff > Math.PI) {
            // L'arc direct est > 180°, on prend l'arc dans l'autre sens
            clockwise = true;
            angleDiff = 2 * Math.PI - angleDiff;
        }

        const angleDeg = angleDiff * 180 / Math.PI;
        
        // Dessiner l'arc final (SANS le rayon)
        ctx.save();
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.arc(this.arcCenterPoint.x, this.arcCenterPoint.y, radius, startAngle, endAngle, clockwise);
        ctx.stroke();
        ctx.restore();
        
        // Dessiner seulement le point central final
        this.drawFinalArcPoints(ctx);
        
        const radiusCm = radius / this.a4PixelsPerCm;
        const snapInfo = snappedPoint ? ` (aimanté à ${snappedPoint.snappedAngle}°)` : '';
        
    }

    drawFinalArcPoints(ctx) {
        // Dessiner les points finaux de l'arc (seulement le centre)
        ctx.save();
        ctx.fillStyle = '#000000'; // Points noirs pour la finalisation
        
        // Point central uniquement
        ctx.beginPath();
        ctx.arc(this.arcCenterPoint.x, this.arcCenterPoint.y, 2, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
    }

    cleanupArcDisplay() {
        // Nettoyer l'affichage de l'arc
        if (this.arcRadiusElement) {
            this.arcRadiusElement.style.display = 'none';
        }
        
        if (this.arcAngleElement) {
            this.arcAngleElement.style.display = 'none';
        }
        
        if (this.arcValidationTimer) {
            clearTimeout(this.arcValidationTimer);
            this.arcValidationTimer = null;
        }
        
        this.arcCanvasState = null;
        
    }

    resetArcState() {
        // Réinitialiser l'état de l'outil arc
        this.arcState = 'initial';
        this.arcCenterPoint = null;
        this.arcRadiusPoint = null;
        this.arcEndPoint = null;
        this.arcSnappedEndPoint = null;
        this.arcCanvasState = null; // Réinitialiser l'état canvas
        if (this.arcValidationTimer) {
            clearTimeout(this.arcValidationTimer);
            this.arcValidationTimer = null;
        }
    }

    calculateArcSnappedPoint() {
        // Calculer le point corrigé par l'aimantation pour l'arc
        if (!this.arcCenterPoint || !this.arcRadiusPoint || !this.arcEndPoint) {
            return null;
        }

        // Calculer le rayon
        const radius = Math.sqrt(
            Math.pow(this.arcRadiusPoint.x - this.arcCenterPoint.x, 2) + 
            Math.pow(this.arcRadiusPoint.y - this.arcCenterPoint.y, 2)
        );

        // Calculer les angles
        const startAngle = Math.atan2(
            this.arcRadiusPoint.y - this.arcCenterPoint.y,
            this.arcRadiusPoint.x - this.arcCenterPoint.x
        );
        const endAngle = Math.atan2(
            this.arcEndPoint.y - this.arcCenterPoint.y,
            this.arcEndPoint.x - this.arcCenterPoint.x
        );

        // Calculer l'angle de l'arc en degrés
        let arcAngle = ((endAngle - startAngle) * 180 / Math.PI + 360) % 360;
        
        // Toujours prendre l'angle le plus petit (≤ 180°)
        if (arcAngle > 180) {
            arcAngle = 360 - arcAngle;
        }

        // Vérifier si on doit appliquer l'aimantation
        if (!this.arcSnapToInteger) {
            return null;
        }

        const nearestInteger = Math.round(arcAngle);
        const difference = Math.abs(arcAngle - nearestInteger);

        if (difference <= this.arcSnapTolerance) {
            // Calculer le nouvel angle final aimanté
            let snappedAngle = nearestInteger * Math.PI / 180;
            
            // Déterminer le sens (horaire ou antihoraire) pour le plus petit arc
            let finalEndAngle;
            if (((endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI)) <= Math.PI) {
                // Sens antihoraire (arc actuel <= 180°)
                finalEndAngle = startAngle + snappedAngle;
            } else {
                // Sens horaire (arc actuel > 180°, on veut le plus petit)
                finalEndAngle = startAngle - snappedAngle;
            }

            // Calculer la nouvelle position du point final
            const snappedX = this.arcCenterPoint.x + radius * Math.cos(finalEndAngle);
            const snappedY = this.arcCenterPoint.y + radius * Math.sin(finalEndAngle);

            return {
                x: snappedX,
                y: snappedY,
                snappedAngle: nearestInteger
            };
        }

        return null;
    }
    
    // =====================================================
    // MÉTHODES OUTIL TEXTE
    // =====================================================
    
    /**
     * Crée une zone de saisie de texte à la position cliquée
     */
    createTextInput(pageNum, position) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement) {
            return;
        }
        
        // Supprimer toute zone de texte existante
        this.removeActiveTextInput();
        
        // Créer l'input de texte
        const textInput = document.createElement('textarea');
        textInput.className = 'pdf-text-input';
        
        // Configuration de base
        textInput.placeholder = 'Tapez votre texte ici...';
        textInput.style.position = 'fixed';
        textInput.style.width = '200px';
        textInput.style.height = '60px';
        textInput.style.fontSize = '16px';
        textInput.style.fontFamily = 'Arial, sans-serif';
        textInput.style.padding = '8px';
        textInput.style.borderRadius = '4px';
        textInput.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        textInput.style.zIndex = '10000';
        textInput.style.resize = 'both';
        textInput.style.minWidth = '150px';
        textInput.style.minHeight = '40px';
        textInput.style.outline = 'none';
        
        // Appliquer la couleur sélectionnée au texte et à la bordure
        textInput.style.color = this.currentColor;
        textInput.style.border = `2px solid ${this.currentColor}`;
        textInput.style.boxShadow = `0 2px 8px ${this.currentColor}33`; // 33 = 20% d'opacité
        
        
        // Stocker les infos pour la finalisation
        textInput.dataset.pageNum = pageNum;
        textInput.dataset.x = position.x;
        textInput.dataset.y = position.y;
        
        // Calculer la position sur l'écran
        const canvas = pageElement.annotationCanvas;
        const canvasRect = canvas.getBoundingClientRect();
        const screenX = canvasRect.left + position.x;
        const screenY = canvasRect.top + position.y;
        
        textInput.style.left = `${screenX}px`;
        textInput.style.top = `${screenY}px`;
        
        // Pour l'outil texte, on ne sauvegarde PAS ici
        // La sauvegarde se fera après que le texte soit effectivement ajouté au canvas
        
        // Ajouter au body
        document.body.appendChild(textInput);
        
        // Stocker la référence IMMÉDIATEMENT
        this.activeTextInput = textInput;
        
        
        // Focus avec délai pour s'assurer que l'élément est bien rendu
        setTimeout(() => {
            if (textInput.parentNode) {
                textInput.focus();
                textInput.select();
            }
        }, 10);
        
        // Événements clavier seulement
        textInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.finalizeText(textInput);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.removeActiveTextInput();
            }
        });
        
        // Clic extérieur avec priorité haute pour intercepter avant les autres événements
        const setupClickHandler = () => {
            this.textClickHandler = (e) => {
                if (this.activeTextInput && 
                    !this.activeTextInput.contains(e.target) && 
                    this.activeTextInput.parentNode) {
                    
                    
                    // Empêcher la propagation pour éviter d'autres clics
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // Nettoyer immédiatement le gestionnaire
                    document.removeEventListener('click', this.textClickHandler, true);
                    this.textClickHandler = null;
                    
                    // Finaliser le texte
                    this.finalizeText(this.activeTextInput);
                    
                    return false;
                }
            };
            // Utiliser capture: true pour intercepter l'événement en premier
            document.addEventListener('click', this.textClickHandler, true);
        };
        
        // Délai de 200ms pour s'assurer que l'événement initial est terminé
        setTimeout(setupClickHandler, 200);
        
    }
    
    /**
     * Finalise le texte et le dessine sur le canvas
     */
    finalizeText(textInput) {
        // Vérifier que l'input existe encore et n'a pas déjà été supprimé
        if (!textInput || !textInput.parentNode) {
            return;
        }
        
        const text = textInput.value.trim();
        if (!text) {
            // Si pas de texte, juste supprimer l'input
            this.removeActiveTextInput();
            return;
        }
        
        const pageNum = parseInt(textInput.dataset.pageNum);
        const x = parseFloat(textInput.dataset.x);
        const y = parseFloat(textInput.dataset.y);
        
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) {
            this.removeActiveTextInput();
            return;
        }
        
        const ctx = pageElement.annotationCtx;
        
        // Configurer le style de texte
        ctx.save();
        ctx.font = '16px Arial';
        ctx.fillStyle = this.currentColor;
        ctx.textBaseline = 'top';
        
        // Gérer le texte multiligne
        const lines = text.split('\n');
        const lineHeight = 20;
        
        lines.forEach((line, index) => {
            if (line.trim()) { // Éviter de dessiner des lignes vides
                ctx.fillText(line, x, y + (index * lineHeight));
            }
        });
        
        ctx.restore();
        
        // Sauvegarder l'état APRÈS avoir ajouté le texte (comme les autres outils)
        this.saveCanvasState(pageNum);
        
        // Supprimer l'input
        this.removeActiveTextInput();
        
        
        // Programmer la sauvegarde automatique
        if (this.options.autoSave) {
            this.scheduleAutoSave();
        }
    }
    
    /**
     * Supprime la zone de texte active
     */
    removeActiveTextInput() {
        if (this.activeTextInput) {
            this.activeTextInput.remove();
            this.activeTextInput = null;
        }
        
        // Nettoyer le gestionnaire de clic extérieur
        if (this.textClickHandler) {
            document.removeEventListener('click', this.textClickHandler, true);
            this.textClickHandler = null;
        }
    }
    
    renderPageAnnotations(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        // Effacer le canvas d'annotation
        const ctx = pageElement.annotationCtx;
        
        // IMPORTANT: S'assurer que le contexte est en mode dessin normal avant de redessiner
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Restaurer le dernier état sauvegardé au lieu de laisser le canvas vide
        const undoHistory = this.undoStack.get(pageNum);
        if (undoHistory && undoHistory.length > 0) {
            // Restaurer le dernier état sauvegardé (sans le retirer de la stack)
            const lastState = undoHistory[undoHistory.length - 1];
            ctx.putImageData(lastState, 0, 0);
        }

        // Redessiner la grille si elle était visible
        const isGridVisible = this.gridVisible.get(pageNum) || false;
        if (isGridVisible) {
            this.drawGrid(pageNum);
        }
    }
    
    async loadAnnotations() {
        // Charger les annotations depuis l'API
        try {
            // Éviter les requêtes CORS lors des tests locaux
            if (window.location.protocol === 'file:') {
                return;
            }
            
            const response = await fetch(`${this.options.apiEndpoints.loadAnnotations}/${this.fileId}`);
            
            if (response.ok) {
                const data = await response.json();

                console.log('📥 Annotations chargées:', {
                    hasAnnotations: !!data.annotations,
                    hasCanvasData: !!(data.annotations && data.annotations.canvasData),
                    annotationsKeys: data.annotations ? Object.keys(data.annotations) : [],
                    canvasDataKeys: (data.annotations && data.annotations.canvasData) ? Object.keys(data.annotations.canvasData) : []
                });

                // Restaurer les annotations canvas
                if (data.annotations && data.annotations.canvasData) {
                    this.annotations = new Map(Object.entries(data.annotations.canvasData || {}));
                    console.log('✅ Annotations chargées depuis canvasData, pages:', Array.from(this.annotations.keys()));
                } else {
                    // Compatibilité avec l'ancien format
                    this.annotations = new Map(Object.entries(data.annotations || {}));
                    console.log('✅ Annotations chargées depuis ancien format, pages:', Array.from(this.annotations.keys()));
                }
                
                // Restaurer la structure des pages
                if (data.annotations && data.annotations.pageStructure) {
                    const pageStructure = data.annotations.pageStructure;
                    
                    // Restaurer les pages vierges
                    if (pageStructure.blankPages) {
                        this.blankPages = new Set(pageStructure.blankPages);
                    }
                    
                    // Restaurer les pages supprimées
                    if (pageStructure.deletedPages) {
                        this.deletedPages = new Set(pageStructure.deletedPages);
                    }
                    
                    // Restaurer les pages ajoutées
                    if (pageStructure.addedPages) {
                        this.addedPages = new Map(Object.entries(pageStructure.addedPages));
                    }
                    
                    // Restaurer le total des pages si disponible
                    if (pageStructure.totalPages && pageStructure.totalPages !== this.totalPages) {
                        this.totalPages = pageStructure.totalPages;
                        
                        // Mettre à jour l'affichage de navigation
                        this.updateNavigationState();
                    }
                }
                
                // Ne pas redessiner maintenant, cela sera fait après le rendu des pages
            } else {
            }
        } catch (error) {
            this.log('Erreur chargement annotations:', error);
        }
    }
    
    /**
     * Redessine toutes les annotations chargées sur les pages
     */
    async redrawAllAnnotations() {
        if (!this.annotations || this.annotations.size === 0) {
            console.log('⚠️ Pas d\'annotations à redessiner');
            return;
        }

        console.log(`🎨 Redessinage de ${this.annotations.size} pages avec annotations`);

        // Utiliser l'ancien système simple basé sur les numéros de page
        for (const [pageNumStr, annotationData] of this.annotations) {
            const pageNum = parseInt(pageNumStr);
            console.log(`  📄 Page ${pageNum}: hasImageData=${!!annotationData?.imageData}, width=${annotationData?.width}, height=${annotationData?.height}`);
            const pageContainer = document.querySelector(`.pdf-page-container[data-page-number="${pageNum}"]`);
            
            if (pageContainer) {
                const annotationCanvas = pageContainer.querySelector('.pdf-annotation-layer');
                
                if (annotationCanvas && annotationData?.imageData) {
                    try {
                        const img = new Image();
                        img.onload = () => {
                            const ctx = annotationCanvas.getContext('2d');
                            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                            
                            // FIX DPI: Compenser le scaling pour éviter annotations 4x plus grandes
                            const dpr = window.devicePixelRatio || 1;
                            ctx.drawImage(img, 0, 0, img.width / dpr, img.height / dpr);
                        };
                        img.src = annotationData.imageData;
                    } catch (error) {
                    }
                }
            }
        }
    }
    
    async saveAnnotations() {
        // Sauvegarder les annotations via l'API
        try {
            // Éviter les requêtes CORS lors des tests locaux
            if (window.location.protocol === 'file:') {
                console.log('⚠️ Mode file:// - sauvegarde désactivée');
                return;
            }

            console.log('💾 Début de la sauvegarde des annotations...');

            // Capturer les données des canvas d'annotation et la structure des pages
            const annotationsData = {
                canvasData: {},
                pageStructure: {
                    blankPages: this.blankPages ? Array.from(this.blankPages) : [],
                    deletedPages: this.deletedPages ? Array.from(this.deletedPages) : [],
                    addedPages: this.addedPages ? Object.fromEntries(this.addedPages) : {},
                    totalPages: this.totalPages
                }
            };

            // Capturer les annotations depuis this.pageElements (méthode originale)
            let pagesWithContent = 0;
            for (const [pageNum, pageElement] of this.pageElements) {
                if (pageElement.annotationCtx) {
                    const canvas = pageElement.annotationCtx.canvas;
                    // Vérifier si le canvas contient des dessins (pas complètement vide)
                    const imageData = pageElement.annotationCtx.getImageData(0, 0, canvas.width, canvas.height);
                    // Vérifier si au moins un pixel n'est pas complètement transparent/blanc
                    const hasContent = imageData.data.some((value, index) => {
                        const channel = index % 4;
                        // Vérifier tous les canaux de couleur (R, G, B) ou l'alpha
                        return (channel < 3 && value !== 255) || (channel === 3 && value > 0);
                    });

                    if (hasContent) {
                        annotationsData.canvasData[pageNum] = {
                            imageData: canvas.toDataURL('image/png'),
                            width: canvas.width,
                            height: canvas.height
                        };
                        pagesWithContent++;
                        console.log(`  ✏️ Page ${pageNum}: annotations trouvées (${canvas.width}x${canvas.height})`);
                    }
                }
            }

            console.log(`📊 Total: ${pagesWithContent} pages avec annotations`);

            
            
            const response = await fetch(this.options.apiEndpoints.saveAnnotations, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_id: this.fileId,
                    annotations: annotationsData
                })
            });

            if (response.ok) {
                console.log('✅ Annotations sauvegardées avec succès');
                this.emit('annotations-saved');
            } else {
                console.error('❌ Erreur HTTP lors de la sauvegarde:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde annotations:', error);
            this.log('Erreur sauvegarde annotations:', error);
        }
    }
    
    scheduleAutoSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.saveAnnotations();
        }, this.options.saveDelay);
    }
    
    // =====================================================
    // MÉTHODES GESTION HISTORIQUE (UNDO/REDO)
    // =====================================================

    /**
     * Initialise l'historique undo avec un état vide pour chaque page
     */
    initializeUndoHistory() {
        this.pageElements.forEach((pageElement, pageNum) => {
            if (pageElement?.annotationCtx) {
                const ctx = pageElement.annotationCtx;
                const emptyState = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
                
                // Initialiser les stacks pour cette page
                if (!this.undoStack.has(pageNum)) {
                    this.undoStack.set(pageNum, []);
                }
                if (!this.redoStack.has(pageNum)) {
                    this.redoStack.set(pageNum, []);
                }
                
                // Ajouter l'état vide initial
                this.undoStack.get(pageNum).push(emptyState);
            }
        });
        this.updateUndoRedoButtons();
    }

    /**
     * Initialise l'historique undo pour une page spécifique
     */
    initializeUndoHistoryForPage(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (pageElement?.annotationCtx) {
            const ctx = pageElement.annotationCtx;
            const emptyState = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
            
            // Initialiser les stacks pour cette page
            if (!this.undoStack.has(pageNum)) {
                this.undoStack.set(pageNum, []);
            }
            if (!this.redoStack.has(pageNum)) {
                this.redoStack.set(pageNum, []);
            }
            
            // Ajouter l'état vide initial
            this.undoStack.get(pageNum).push(emptyState);
            
            this.updateUndoRedoButtons();
        }
    }

    /**
     * Sauvegarde l'état actuel du canvas dans l'historique
     */
    saveCanvasState(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        // Sauvegarder les données vectorielles du moteur d'annotation
        const engine = this.annotationEngines.get(pageNum);
        let annotationData = null;

        if (engine) {
            // Exporter les données vectorielles (strokes perfect-freehand)
            annotationData = engine.export();
        }

        // Sauvegarder l'ImageData pour les autres outils (highlighter, shapes, etc.)
        // Note: Cette imageData contient aussi les strokes vectoriels actuels (en bitmap)
        // mais ils seront redessinés en vectoriel lors de la restauration
        const ctx = pageElement.annotationCtx;
        const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Initialiser les stacks pour cette page si nécessaire
        if (!this.undoStack.has(pageNum)) {
            this.undoStack.set(pageNum, []);
        }
        if (!this.redoStack.has(pageNum)) {
            this.redoStack.set(pageNum, []);
        }

        // Ajouter l'état actuel à la stack d'undo (avec données vectorielles + bitmap)
        const undoHistory = this.undoStack.get(pageNum);
        undoHistory.push({
            imageData: imageData,
            vectorData: annotationData, // Données vectorielles du stylo
            canvasWidth: ctx.canvas.width, // Sauvegarder la taille du canvas
            canvasHeight: ctx.canvas.height,
            scale: this.currentScale // Sauvegarder le zoom actuel
        });

        // Limiter la taille de l'historique (par exemple 20 états)
        if (undoHistory.length > 20) {
            undoHistory.shift(); // Supprimer le plus ancien
        }

        // Vider la stack de redo quand on fait une nouvelle action
        this.redoStack.set(pageNum, []);

        this.updateUndoRedoButtons();
    }

    /**
     * Transforme les données vectorielles selon un ratio de zoom
     */
    transformVectorData(vectorData, scaleRatio) {
        if (!vectorData || !vectorData.paths) return vectorData;

        // Créer une copie profonde des données
        const transformed = {
            version: vectorData.version,
            options: vectorData.options,
            paths: []
        };

        // Transformer chaque stroke
        vectorData.paths.forEach(pathData => {
            // Transformer les points originaux
            const transformedPoints = pathData.points.map(point => {
                return [
                    point[0] * scaleRatio,  // x
                    point[1] * scaleRatio,  // y
                    point[2]                // pressure (inchangée)
                ];
            });

            // Recalculer le stroke avec getStroke
            let transformedStroke = null;
            if (typeof window.getStroke !== 'undefined') {
                transformedStroke = window.getStroke(transformedPoints, {
                    size: vectorData.options.size,
                    thinning: vectorData.options.thinning,
                    smoothing: vectorData.options.smoothing,
                    streamline: vectorData.options.streamline,
                    easing: vectorData.options.easing,
                    start: vectorData.options.start,
                    end: vectorData.options.end,
                    simulatePressure: vectorData.options.simulatePressure
                });
            }

            transformed.paths.push({
                ...pathData,
                points: transformedPoints,
                stroke: transformedStroke || pathData.stroke
            });
        });

        return transformed;
    }

    /**
     * Re-rendre toutes les annotations vectorielles sur toutes les pages
     * (utilisé après un changement de zoom pour que les annotations restent nettes)
     */
    rerenderAllVectorAnnotations() {
        const self = this;
        this.annotationEngines.forEach(function(engine, pageNum) {
            const pageElement = self.pageElements.get(pageNum);
            if (pageElement?.annotationCtx) {
                const ctx = pageElement.annotationCtx;

                // Effacer uniquement les strokes vectoriels (pas les autres annotations)
                // Pour cela, on efface tout et on re-rend depuis l'historique
                const undoHistory = self.undoStack.get(pageNum);
                if (undoHistory && undoHistory.length > 0) {
                    const latestState = undoHistory[undoHistory.length - 1];
                    self.restoreCanvasState(pageNum, latestState);
                }
            }
        });
    }

    /**
     * Restaure l'état du canvas depuis les données sauvegardées (vectorielles + bitmap)
     */
    restoreCanvasState(pageNum, state) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) {
            console.warn(`⚠️ Page ${pageNum}: Pas de contexte d'annotation`);
            return;
        }

        const ctx = pageElement.annotationCtx;

        // Calculer le ratio de transformation si le zoom a changé
        const savedScale = state.scale || 1.0;
        const currentScale = this.currentScale;
        const scaleRatio = currentScale / savedScale;

        // Effacer le canvas
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Redessiner les strokes vectoriels à la nouvelle résolution/zoom
        if (state.vectorData && state.vectorData.paths && state.vectorData.paths.length > 0) {
            const engine = this.annotationEngines.get(pageNum);
            if (engine) {
                // Si le zoom a changé, transformer les coordonnées des points
                if (Math.abs(scaleRatio - 1.0) > 0.01) {
                    const transformedData = this.transformVectorData(state.vectorData, scaleRatio);
                    engine.import(transformedData);
                } else {
                    // Pas de changement de zoom, importer directement
                    engine.import(state.vectorData);
                }

                ctx.globalCompositeOperation = 'source-over';
                engine.renderAllStrokes(ctx);
            } else {
                console.warn(`  ⚠️ Pas de moteur d'annotation pour la page ${pageNum}`);
            }
        }

        // PUIS restaurer les autres annotations (highlighter, shapes, texte)
        // en mode 'destination-over' pour les dessiner SOUS les strokes vectoriels
        if (state.imageData) {
            // On ne peut pas utiliser putImageData avec compositing, donc on crée un canvas temporaire
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = ctx.canvas.width;
            tempCanvas.height = ctx.canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(state.imageData, 0, 0);

            // Dessiner l'imageData SOUS les strokes vectoriels (qui sont déjà sur ctx)
            ctx.globalCompositeOperation = 'destination-over';
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over'; // Remettre par défaut
        }
    }

    /**
     * Annule la dernière action sur la page courante
     */
    undo() {
        const pageNum = this.currentPage;
        const undoHistory = this.undoStack.get(pageNum);

        // Vérifier qu'il y a au moins 2 états (pour pouvoir revenir à un état précédent)
        if (!undoHistory || undoHistory.length < 2) {
            return;
        }

        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        // Retirer le dernier état (l'état actuel avec la dernière action)
        const currentState = undoHistory.pop();

        // Sauvegarder cet état dans la stack de redo
        if (!this.redoStack.has(pageNum)) {
            this.redoStack.set(pageNum, []);
        }
        this.redoStack.get(pageNum).push(currentState);

        // Restaurer l'état précédent (avant la dernière action)
        const previousState = undoHistory[undoHistory.length - 1];
        this.restoreCanvasState(pageNum, previousState);

        this.updateUndoRedoButtons();

        // Nettoyer les états des outils actifs
        this.resetToolStates();
    }

    /**
     * Refait la dernière action annulée sur la page courante
     */
    redo() {
        const pageNum = this.currentPage;
        const redoHistory = this.redoStack.get(pageNum);

        if (!redoHistory || redoHistory.length === 0) {
            return;
        }

        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        // Sauvegarder l'état actuel dans la stack d'undo
        const ctx = pageElement.annotationCtx;
        const currentImageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const engine = this.annotationEngines.get(pageNum);
        const currentVectorData = engine ? engine.export() : null;

        if (!this.undoStack.has(pageNum)) {
            this.undoStack.set(pageNum, []);
        }
        this.undoStack.get(pageNum).push({
            imageData: currentImageData,
            vectorData: currentVectorData
        });

        // Restaurer l'état suivant
        const nextState = redoHistory.pop();
        this.restoreCanvasState(pageNum, nextState);

        this.updateUndoRedoButtons();

        // Nettoyer les états des outils actifs
        this.resetToolStates();
    }

    /**
     * Vide la page courante
     */
    clearCurrentPage() {
        const pageNum = this.currentPage;
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;
        
        // Effacer le canvas
        const ctx = pageElement.annotationCtx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Sauvegarder l'état après effacement
        this.saveCanvasState(pageNum);
        
        
        // Nettoyer les états des outils actifs
        this.resetToolStates();
        
        // Programmer la sauvegarde automatique
        if (this.options.autoSave) {
            this.scheduleAutoSave();
        }
    }

    /**
     * Met à jour l'état des boutons undo/redo
     */
    updateUndoRedoButtons() {
        const pageNum = this.currentPage;
        const undoHistory = this.undoStack.get(pageNum) || [];
        const redoHistory = this.redoStack.get(pageNum) || [];
        
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        
        // Pour undo, on peut annuler s'il y a au moins 2 états (un état précédent + l'état actuel)
        const canUndo = undoHistory.length >= 2;
        const undoCount = Math.max(0, undoHistory.length - 1); // -1 car le dernier est l'état actuel
        
        if (undoBtn) {
            undoBtn.disabled = !canUndo;
            undoBtn.style.opacity = canUndo ? '1' : '0.5';
            undoBtn.title = canUndo ? `Annuler (${undoCount} action${undoCount > 1 ? 's' : ''})` : 'Aucune action à annuler';
        }
        
        if (redoBtn) {
            redoBtn.disabled = redoHistory.length === 0;
            redoBtn.style.opacity = redoHistory.length === 0 ? '0.5' : '1';
            redoBtn.title = redoHistory.length === 0 ? 'Aucune action à refaire' : `Refaire (${redoHistory.length} action${redoHistory.length > 1 ? 's' : ''})`;
        }
    }

    /**
     * Remet à zéro les états des outils actifs
     */
    resetToolStates() {
        // Réinitialiser les états des outils qui ont des méthodes reset
        if (typeof this.resetProtractorState === 'function') {
            this.resetProtractorState();
        }
        if (typeof this.resetArcState === 'function') {
            this.resetArcState();
        }
        
        // Nettoyer les éléments d'affichage
        this.cleanupRulerDisplay();
        this.cleanupCompassDisplay();
        this.cleanupProtractorDisplay();
        this.cleanupArcDisplay();
        
    }

    /**
     * Méthodes d'interface publique
     */
    openFileDialog() {
    }
    
    showExportDialog() {
    }
    
    rotateLeft() {
        this.rotation = (this.rotation - 90) % 360;
        this.refreshCurrentView();
    }
    
    rotateRight() {
        this.rotation = (this.rotation + 90) % 360;
        this.refreshCurrentView();
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.container.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }
    
    async refreshCurrentView() {
        if (this.options.viewMode === 'continuous') {
            await this.renderAllPages();
        } else {
            await this.renderPage(this.currentPage);
        }
    }
    
    async generateThumbnails() {
        if (!this.pdfDoc || !this.currentMode.features.includes('thumbnails')) return;

        const container = this.elements.thumbnailsContainer;
        if (!container) {
            return;
        }

        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            try {
                const page = await this.pdfDoc.getPage(pageNum);
                // Utiliser une échelle plus grande pour le mode split
                const scale = this.currentMode.layout === 'split' ? 0.25 : 0.15;
                const viewport = page.getViewport({ scale: scale }); // Échelle adaptée selon le mode

                // Créer le conteneur de la miniature
                const thumbnailItem = document.createElement('div');
                thumbnailItem.className = 'thumbnail-item';
                thumbnailItem.dataset.pageNumber = pageNum;

                // Créer le canvas pour la miniature
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(viewport.width, 50); // Taille minimum
                canvas.height = Math.max(viewport.height, 70); // Taille minimum
                canvas.className = 'thumbnail-canvas';
                
                // Style inline pour forcer la visibilité
                canvas.style.maxWidth = '100%';
                canvas.style.border = '1px solid #ccc';
                canvas.style.backgroundColor = '#f0f0f0';

                // Créer l'indicateur de numéro
                const thumbnailNumber = document.createElement('div');
                thumbnailNumber.className = 'thumbnail-number';
                thumbnailNumber.textContent = pageNum;

                // Assembler les éléments
                thumbnailItem.appendChild(canvas);
                thumbnailItem.appendChild(thumbnailNumber);

                // Marquer la première page comme active
                if (pageNum === 1) {
                    thumbnailItem.classList.add('active');
                }

                // Ajouter l'événement de clic
                thumbnailItem.addEventListener('click', () => {
                    if (this.options.viewMode === 'continuous') {
                        this.scrollToPage(pageNum);
                    } else {
                        this.goToPage(pageNum);
                    }
                });

                // Variables pour l'appui long (déclarées au niveau de la fonction)
                let pressTimer;
                let isLongPress = false;

                // Menu contextuel et appui long seulement si pas en mode preview
                if (this.options.mode !== 'preview') {
                    // Ajouter le menu contextuel (clic droit)
                    thumbnailItem.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this.showThumbnailContextMenu(e, pageNum);
                    });

                    // Gérer l'appui long avec mousedown/mouseup (desktop)
                    thumbnailItem.addEventListener('mousedown', (e) => {
                        // Ignorer le clic droit (bouton 2)
                        if (e.button === 2) return;
                        
                        isLongPress = false;
                        pressTimer = setTimeout(() => {
                            isLongPress = true;
                            this.showThumbnailContextMenu(e, pageNum);
                        }, 500); // 500ms pour l'appui long
                    });

                    thumbnailItem.addEventListener('mouseup', (e) => {
                        clearTimeout(pressTimer);
                        
                        // Empêcher le clic normal si c'était un appui long, mais ne pas fermer le menu
                        if (isLongPress) {
                            e.preventDefault();
                            e.stopPropagation();
                            // Le menu reste ouvert grâce au nouveau hideContextMenuHandler
                        }
                    });

                    thumbnailItem.addEventListener('mouseleave', () => {
                        clearTimeout(pressTimer);
                    });
                } else {
                    // En mode preview, désactiver le clic droit
                    thumbnailItem.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        return false;
                    });
                }

                // Appui long tactile pour mobile seulement si pas en mode preview
                if (this.options.mode !== 'preview') {
                    let touchTimer;
                    let isTouchLongPress = false;

                    thumbnailItem.addEventListener('touchstart', (e) => {
                        isTouchLongPress = false;
                        touchTimer = setTimeout(() => {
                            isTouchLongPress = true;
                            this.showThumbnailContextMenu(e, pageNum);
                        }, 500); // 500ms pour l'appui long
                    });

                    thumbnailItem.addEventListener('touchend', (e) => {
                        clearTimeout(touchTimer);
                        
                        // Empêcher le clic normal si c'était un appui long tactile, mais ne pas fermer le menu
                        if (isTouchLongPress) {
                            e.preventDefault();
                            e.stopPropagation();
                            // Le menu reste ouvert grâce au nouveau hideContextMenuHandler
                        }
                    });

                    thumbnailItem.addEventListener('touchmove', () => {
                        clearTimeout(touchTimer);
                        isTouchLongPress = false;
                    });
                }

                // Ajouter au conteneur
                container.appendChild(thumbnailItem);

                // Rendre la page sur le canvas APRÈS l'avoir ajouté au DOM
                const ctx = canvas.getContext('2d');
                
                // Dessiner un rectangle de test d'abord
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#333';
                ctx.font = '12px Arial';
                ctx.fillText(`Page ${pageNum}`, 5, 15);
                
                try {
                    await page.render({ canvasContext: ctx, viewport }).promise;
                } catch (renderError) {
                    this.log(`Erreur rendu miniature ${pageNum}:`, renderError);
                    // En cas d'erreur, laisser le rectangle de test
                }

            } catch (error) {
                this.log('Erreur génération miniature page', pageNum, error);
            }
        }

    }
    
    searchPrevious() {
        // Navigation recherche précédente
    }
    
    searchNext() {
        // Navigation recherche suivante
    }
    
    initTouchGestures() {
        // Initialisation des gestes tactiles
    }

    // =====================================================
    // MÉTHODES OUTIL FLÈCHE
    // =====================================================

    /**
     * Crée l'élément d'affichage de la longueur de la flèche
     */
    createArrowLengthElement() {
        this.arrowLengthElement = document.createElement('div');
        this.arrowLengthElement.className = 'measurement-display arrow-length';
        this.arrowLengthElement.style.position = 'absolute';
        this.arrowLengthElement.style.background = 'rgba(0, 0, 0, 0.8)';
        this.arrowLengthElement.style.color = 'white';
        this.arrowLengthElement.style.padding = '4px 8px';
        this.arrowLengthElement.style.borderRadius = '4px';
        this.arrowLengthElement.style.fontSize = '12px';
        this.arrowLengthElement.style.fontFamily = 'monospace';
        this.arrowLengthElement.style.pointerEvents = 'none';
        this.arrowLengthElement.style.zIndex = '1000';
        this.arrowLengthElement.style.whiteSpace = 'nowrap';
        this.arrowLengthElement.textContent = '0.0 cm';
        
        this.container.appendChild(this.arrowLengthElement);
    }

    /**
     * Dessine la prévisualisation de la flèche
     */
    drawArrowPreview(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.arrowCanvasState) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état du canvas
        ctx.putImageData(this.arrowCanvasState, 0, 0);
        
        // Dessiner la flèche en prévisualisation
        this.drawArrow(ctx, this.arrowStartPoint, this.arrowEndPoint, true);
    }

    /**
     * Dessine une flèche entre deux points
     */
    drawArrow(ctx, start, end, isPreview = false) {
        if (!start || !end) return;

        ctx.save();
        
        // Forcer le mode de composition normal (pas d'effacement)
        ctx.globalCompositeOperation = 'source-over';
        
        // Style de la flèche - utiliser la couleur et épaisseur courantes
        ctx.strokeStyle = this.currentColor;
        ctx.fillStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (isPreview) {
            // Style pointillé pour la prévisualisation
            ctx.setLineDash([5, 5]);
            ctx.globalAlpha = 0.7;
        }

        // Calculer l'angle de la flèche
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const angle = Math.atan2(dy, dx);
        
        // Longueur de la pointe de flèche
        const arrowHeadLength = Math.min(20, Math.sqrt(dx * dx + dy * dy) * 0.3);
        const arrowHeadAngle = Math.PI / 6; // 30 degrés

        // Dessiner la ligne principale
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        // Dessiner la pointe de flèche
        if (arrowHeadLength > 0) {
            ctx.beginPath();
            
            // Pointe gauche
            const leftX = end.x - arrowHeadLength * Math.cos(angle - arrowHeadAngle);
            const leftY = end.y - arrowHeadLength * Math.sin(angle - arrowHeadAngle);
            
            // Pointe droite
            const rightX = end.x - arrowHeadLength * Math.cos(angle + arrowHeadAngle);
            const rightY = end.y - arrowHeadLength * Math.sin(angle + arrowHeadAngle);
            
            // Dessiner le triangle de la pointe
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(leftX, leftY);
            ctx.lineTo(rightX, rightY);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Met à jour l'affichage de la longueur de la flèche
     */
    updateArrowLength(pageNum) {
        if (!this.arrowLengthElement || !this.arrowStartPoint || !this.arrowEndPoint) return;

        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCanvas) return;

        // Calculer la longueur en pixels
        const dx = this.arrowEndPoint.x - this.arrowStartPoint.x;
        const dy = this.arrowEndPoint.y - this.arrowStartPoint.y;
        const lengthPixels = Math.sqrt(dx * dx + dy * dy);
        
        // Convertir en centimètres (approximation : 96 DPI = 37.8 pixels par cm)
        const lengthCm = lengthPixels / 37.8;
        
        // Mettre à jour le texte
        this.arrowLengthElement.textContent = `${lengthCm.toFixed(1)} cm`;
        
        // Positionner l'élément au milieu de la flèche
        const canvas = pageElement.annotationCanvas;
        const canvasRect = canvas.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        
        const midX = (this.arrowStartPoint.x + this.arrowEndPoint.x) / 2;
        const midY = (this.arrowStartPoint.y + this.arrowEndPoint.y) / 2;
        
        const screenX = canvasRect.left - containerRect.left + midX;
        const screenY = canvasRect.top - containerRect.top + midY - 25; // Décalage vers le haut
        
        this.arrowLengthElement.style.left = `${screenX}px`;
        this.arrowLengthElement.style.top = `${screenY}px`;
        this.arrowLengthElement.style.display = 'block';
    }

    /**
     * Finalise la flèche et la dessine définitivement
     */
    finalizeArrow(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.arrowStartPoint || !this.arrowEndPoint) return;

        const ctx = pageElement.annotationCtx;
        
        // Dessiner la flèche finale (sans prévisualisation)
        this.drawArrow(ctx, this.arrowStartPoint, this.arrowEndPoint, false);
        
    }

    /**
     * Nettoie l'affichage de la flèche
     */
    cleanupArrowDisplay() {
        if (this.arrowLengthElement) {
            this.arrowLengthElement.remove();
            this.arrowLengthElement = null;
        }
        
        // Reset des points et de l'état
        this.arrowStartPoint = null;
        this.arrowEndPoint = null;
        this.arrowCanvasState = null;
        
    }

    // =====================================================
    // MÉTHODES OUTIL RECTANGLE
    // =====================================================

    /**
     * Crée l'élément d'affichage des dimensions du rectangle
     */
    createRectangleMeasureElement() {
        this.rectangleMeasureElement = document.createElement('div');
        this.rectangleMeasureElement.className = 'measurement-display rectangle-dimensions';
        this.rectangleMeasureElement.style.position = 'absolute';
        this.rectangleMeasureElement.style.background = 'rgba(0, 0, 0, 0.8)';
        this.rectangleMeasureElement.style.color = 'white';
        this.rectangleMeasureElement.style.padding = '4px 8px';
        this.rectangleMeasureElement.style.borderRadius = '4px';
        this.rectangleMeasureElement.style.fontSize = '12px';
        this.rectangleMeasureElement.style.fontFamily = 'monospace';
        this.rectangleMeasureElement.style.pointerEvents = 'none';
        this.rectangleMeasureElement.style.zIndex = '1000';
        this.rectangleMeasureElement.style.whiteSpace = 'nowrap';
        this.rectangleMeasureElement.textContent = '0.0 × 0.0 cm';
        
        this.container.appendChild(this.rectangleMeasureElement);
    }

    /**
     * Dessine la prévisualisation du rectangle
     */
    drawRectanglePreview(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.rectangleCanvasState) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état du canvas
        ctx.putImageData(this.rectangleCanvasState, 0, 0);
        
        // Dessiner le rectangle en prévisualisation
        this.drawRectangle(ctx, this.rectangleStartPoint, this.rectangleEndPoint, true);
    }

    /**
     * Dessine un rectangle entre deux points
     */
    drawRectangle(ctx, start, end, isPreview = false) {
        if (!start || !end) return;

        ctx.save();
        
        // Forcer le mode de composition normal (pas d'effacement)
        ctx.globalCompositeOperation = 'source-over';
        
        // Style du rectangle - utiliser la couleur et épaisseur courantes
        ctx.fillStyle = this.currentColor;
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (isPreview) {
            // Style pointillé pour la prévisualisation avec transparence
            ctx.setLineDash([5, 5]);
            ctx.globalAlpha = 0.5;
        }

        // Calculer les dimensions
        const width = end.x - start.x;
        const height = end.y - start.y;

        // Dessiner le rectangle plein
        ctx.beginPath();
        ctx.rect(start.x, start.y, width, height);
        
        if (isPreview) {
            // En prévisualisation, juste le contour pointillé
            ctx.stroke();
        } else {
            // En final, rectangle plein
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Met à jour l'affichage des dimensions du rectangle
     */
    updateRectangleMeasure(pageNum) {
        if (!this.rectangleMeasureElement || !this.rectangleStartPoint || !this.rectangleEndPoint) return;

        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCanvas) return;

        // Calculer les dimensions en pixels
        const widthPixels = Math.abs(this.rectangleEndPoint.x - this.rectangleStartPoint.x);
        const heightPixels = Math.abs(this.rectangleEndPoint.y - this.rectangleStartPoint.y);
        
        // Convertir en centimètres (approximation : 96 DPI = 37.8 pixels par cm)
        const widthCm = widthPixels / 37.8;
        const heightCm = heightPixels / 37.8;
        
        // Mettre à jour le texte
        this.rectangleMeasureElement.textContent = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
        
        // Positionner l'élément au centre du rectangle
        const canvas = pageElement.annotationCanvas;
        const canvasRect = canvas.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        
        const centerX = (this.rectangleStartPoint.x + this.rectangleEndPoint.x) / 2;
        const centerY = (this.rectangleStartPoint.y + this.rectangleEndPoint.y) / 2;
        
        const screenX = canvasRect.left - containerRect.left + centerX;
        const screenY = canvasRect.top - containerRect.top + centerY - 25; // Décalage vers le haut
        
        this.rectangleMeasureElement.style.left = `${screenX}px`;
        this.rectangleMeasureElement.style.top = `${screenY}px`;
        this.rectangleMeasureElement.style.display = 'block';
    }

    /**
     * Finalise le rectangle et le dessine définitivement
     */
    finalizeRectangle(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.rectangleStartPoint || !this.rectangleEndPoint) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état propre du canvas (sans prévisualisation)
        if (this.rectangleCanvasState) {
            ctx.putImageData(this.rectangleCanvasState, 0, 0);
        }
        
        // Dessiner le rectangle final (sans prévisualisation)
        this.drawRectangle(ctx, this.rectangleStartPoint, this.rectangleEndPoint, false);
        
    }

    /**
     * Nettoie l'affichage du rectangle
     */
    cleanupRectangleDisplay() {
        if (this.rectangleMeasureElement) {
            this.rectangleMeasureElement.remove();
            this.rectangleMeasureElement = null;
        }
        
        // Reset des points et de l'état
        this.rectangleStartPoint = null;
        this.rectangleEndPoint = null;
        this.rectangleCanvasState = null;
        
    }

    // =====================================================
    // MÉTHODES OUTIL CERCLE
    // =====================================================

    /**
     * Crée l'élément d'affichage du rayon du cercle
     */
    createCircleMeasureElement() {
        this.circleMeasureElement = document.createElement('div');
        this.circleMeasureElement.className = 'measurement-display circle-radius';
        this.circleMeasureElement.style.position = 'absolute';
        this.circleMeasureElement.style.background = 'rgba(0, 0, 0, 0.8)';
        this.circleMeasureElement.style.color = 'white';
        this.circleMeasureElement.style.padding = '4px 8px';
        this.circleMeasureElement.style.borderRadius = '4px';
        this.circleMeasureElement.style.fontSize = '12px';
        this.circleMeasureElement.style.fontFamily = 'monospace';
        this.circleMeasureElement.style.pointerEvents = 'none';
        this.circleMeasureElement.style.zIndex = '1000';
        this.circleMeasureElement.style.whiteSpace = 'nowrap';
        this.circleMeasureElement.textContent = 'r: 0.0 cm';
        
        this.container.appendChild(this.circleMeasureElement);
    }

    /**
     * Dessine la prévisualisation du cercle
     */
    drawCirclePreview(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.circleCanvasState) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état du canvas
        ctx.putImageData(this.circleCanvasState, 0, 0);
        
        // Dessiner le cercle en prévisualisation
        this.drawCircle(ctx, this.circleStartPoint, this.circleEndPoint, true);
    }

    /**
     * Dessine un cercle entre deux points (centre et point sur la circonférence)
     */
    drawCircle(ctx, center, edge, isPreview = false) {
        if (!center || !edge) return;

        ctx.save();
        
        // Forcer le mode de composition normal (pas d'effacement)
        ctx.globalCompositeOperation = 'source-over';
        
        // Style du cercle - utiliser la couleur et épaisseur courantes
        ctx.fillStyle = this.currentColor;
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentLineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (isPreview) {
            // Style pointillé pour la prévisualisation avec transparence
            ctx.setLineDash([5, 5]);
            ctx.globalAlpha = 0.5;
        }

        // Calculer le rayon
        const dx = edge.x - center.x;
        const dy = edge.y - center.y;
        const radius = Math.sqrt(dx * dx + dy * dy);

        // Dessiner le cercle
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
        
        if (isPreview) {
            // En prévisualisation, juste le contour pointillé
            ctx.stroke();
        } else {
            // En final, cercle plein
            ctx.fill();
        }

        // Dessiner le rayon en pointillé si c'est une prévisualisation
        if (isPreview && radius > 0) {
            ctx.save();
            ctx.setLineDash([2, 2]);
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(edge.x, edge.y);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    /**
     * Met à jour l'affichage du rayon du cercle
     */
    updateCircleMeasure(pageNum) {
        if (!this.circleMeasureElement || !this.circleStartPoint || !this.circleEndPoint) return;

        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCanvas) return;

        // Calculer le rayon en pixels
        const dx = this.circleEndPoint.x - this.circleStartPoint.x;
        const dy = this.circleEndPoint.y - this.circleStartPoint.y;
        const radiusPixels = Math.sqrt(dx * dx + dy * dy);
        
        // Convertir en centimètres (approximation : 96 DPI = 37.8 pixels par cm)
        const radiusCm = radiusPixels / 37.8;
        
        // Mettre à jour le texte
        this.circleMeasureElement.textContent = `r: ${radiusCm.toFixed(1)} cm`;
        
        // Positionner l'élément au milieu du rayon
        const canvas = pageElement.annotationCanvas;
        const canvasRect = canvas.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        
        const midX = (this.circleStartPoint.x + this.circleEndPoint.x) / 2;
        const midY = (this.circleStartPoint.y + this.circleEndPoint.y) / 2;
        
        const screenX = canvasRect.left - containerRect.left + midX;
        const screenY = canvasRect.top - containerRect.top + midY - 25; // Décalage vers le haut
        
        this.circleMeasureElement.style.left = `${screenX}px`;
        this.circleMeasureElement.style.top = `${screenY}px`;
        this.circleMeasureElement.style.display = 'block';
    }

    /**
     * Finalise le cercle et le dessine définitivement
     */
    finalizeCircle(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx || !this.circleStartPoint || !this.circleEndPoint) return;

        const ctx = pageElement.annotationCtx;
        
        // Restaurer l'état propre du canvas (sans prévisualisation)
        if (this.circleCanvasState) {
            ctx.putImageData(this.circleCanvasState, 0, 0);
        }
        
        // Dessiner le cercle final (sans prévisualisation)
        this.drawCircle(ctx, this.circleStartPoint, this.circleEndPoint, false);
        
    }

    /**
     * Nettoie l'affichage du cercle
     */
    cleanupCircleDisplay() {
        if (this.circleMeasureElement) {
            this.circleMeasureElement.remove();
            this.circleMeasureElement = null;
        }
        
        // Reset des points et de l'état
        this.circleStartPoint = null;
        this.circleEndPoint = null;
        this.circleCanvasState = null;
        
    }

    /**
     * Bascule l'affichage de la grille pour une page
     */
    toggleGridDisplay(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement) return;

        const isVisible = this.gridVisible.get(pageNum) || false;
        
        if (isVisible) {
            this.drawGrid(pageNum);
        } else {
            this.clearGrid(pageNum);
        }
    }

    /**
     * Dessine la grille sur une page
     */
    drawGrid(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        const ctx = pageElement.annotationCtx;
        const canvas = pageElement.annotationCanvas;
        
        // Sauvegarder l'état du canvas avant de dessiner la grille
        const canvasData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.canvasStateBeforeGrid.set(pageNum, canvasData);
        
        // Calculer la taille de la grille en pixels pour des carrés de 1cm
        const gridSizePixels = this.gridSizeCm * this.a4PixelsPerCm * this.currentScale;
        
        // Configurer le style de la grille
        ctx.save();
        ctx.strokeStyle = this.gridColor;
        ctx.globalAlpha = this.gridOpacity;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);

        // Dessiner les lignes verticales
        for (let x = 0; x <= canvas.width; x += gridSizePixels) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        // Dessiner les lignes horizontales
        for (let y = 0; y <= canvas.height; y += gridSizePixels) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Efface uniquement la grille d'une page (sans toucher aux autres annotations)
     */
    clearGrid(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCtx) return;

        const ctx = pageElement.annotationCtx;
        const savedState = this.canvasStateBeforeGrid.get(pageNum);
        
        if (savedState) {
            // Restaurer l'état du canvas avant que la grille soit dessinée
            ctx.putImageData(savedState, 0, 0);
            
            // Nettoyer la sauvegarde
            this.canvasStateBeforeGrid.delete(pageNum);
            
        } else {
            // Fallback: si pas d'état sauvegardé, redessiner les annotations sans grille
            this.renderPageAnnotations(pageNum);
        }
    }

    /**
     * Affiche le menu contextuel pour les miniatures
     */
    showThumbnailContextMenu(event, pageNumber) {
        // Debug: vérifier le mapping
        const thumbnailElement = event.target.closest('.thumbnail-item');
        const displayPageNumber = thumbnailElement?.dataset.pageNumber;
        const originalPageNumber = thumbnailElement?.dataset.originalPageNumber;
        
        
        // Utiliser le numéro d'affichage plutôt que le pageNumber passé en paramètre
        const correctPageNumber = displayPageNumber ? parseInt(displayPageNumber) : pageNumber;
        
        // Supprimer tout menu existant
        this.hideThumbnailContextMenu();

        // Créer le menu contextuel
        const contextMenu = document.createElement('div');
        contextMenu.className = 'thumbnail-context-menu';
        contextMenu.innerHTML = `
            <div class="context-menu-item delete-page" data-action="delete">
                <i class="fas fa-trash"></i>
                <span>Supprimer la page</span>
            </div>
            <div class="context-menu-item add-page" data-action="add">
                <i class="fas fa-plus"></i>
                <span>Ajouter page blanche après</span>
            </div>
            <div class="context-menu-item add-graph" data-action="graph">
                <i class="fas fa-chart-line"></i>
                <span>Créer un graphique après cette page</span>
            </div>
        `;

        // Positionner le menu
        const x = event.clientX || event.touches?.[0]?.clientX || 0;
        const y = event.clientY || event.touches?.[0]?.clientY || 0;
        
        contextMenu.style.position = 'fixed';
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.style.zIndex = '10000';

        // Ajouter au DOM
        document.body.appendChild(contextMenu);
        this.currentContextMenu = contextMenu;
        this.contextMenuPageNumber = correctPageNumber;

        // Ajouter les événements pour les options du menu
        contextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            if (action === 'delete') {
                this.deletePage(correctPageNumber);
            } else if (action === 'add') {
                this.addBlankPageAfter(correctPageNumber);
            } else if (action === 'graph') {
                this.addGraphPageAfter(correctPageNumber);
            }
            this.hideThumbnailContextMenu();
        });

        // Fermer le menu si on clique ailleurs
        setTimeout(() => {
            document.addEventListener('click', this.hideContextMenuHandler);
        }, 100);

    }

    /**
     * Cache le menu contextuel
     */
    hideThumbnailContextMenu() {
        if (this.currentContextMenu) {
            this.currentContextMenu.remove();
            this.currentContextMenu = null;
            this.contextMenuPageNumber = null;
            document.removeEventListener('click', this.hideContextMenuHandler);
        }
    }

    /**
     * Gestionnaire pour fermer le menu contextuel
     */
    hideContextMenuHandler = (e) => {
        // Ne fermer que si on clique en dehors du menu contextuel
        if (this.currentContextMenu && !this.currentContextMenu.contains(e.target)) {
            this.hideThumbnailContextMenu();
        }
    }

    /**
     * Supprime une page du PDF
     */
    async deletePage(pageNumber) {
        if (this.totalPages <= 1) {
            alert('Impossible de supprimer la dernière page du document.');
            return;
        }

        // Identifier le type de page (originale ou blanche)
        const pageIdentifier = this.getPageIdentifier(pageNumber);
        

        if (confirm(`Êtes-vous sûr de vouloir supprimer la page ${pageNumber} ?`)) {
            try {
                // Sauvegarder les annotations AVANT la suppression, en excluant la page à supprimer
                this.saveAllAnnotations(pageNumber);
                
                // Calculer la page vers laquelle naviguer après suppression (page précédente)
                const targetPageAfterDeletion = Math.max(1, pageNumber - 1);
                
                if (pageIdentifier.type === 'blank') {
                    // Supprimer une page blanche
                    await this.removeBlankPage(pageIdentifier.id);
                    // Pas besoin de sauvegarder à nouveau, car déjà fait
                    this.skipNextAnnotationSave = true;
                    await this.updateUIAfterBlankPageDeletion(pageNumber);
                    this.skipNextAnnotationSave = false;
                } else {
                    // Supprimer une page originale
                    await this.removePageFromDocument(pageIdentifier.pageNumber);
                    // Pas besoin de sauvegarder à nouveau
                    this.skipNextAnnotationSave = true;
                    await this.updateUIAfterPageDeletion(pageIdentifier.pageNumber);
                    this.skipNextAnnotationSave = false;
                }
                
                // Naviguer vers la page précédente (ou page 1 si on supprimait la première page)
                this.goToPage(targetPageAfterDeletion);
                
                // Sauvegarder automatiquement après suppression
                this.scheduleAutoSave();
                
            } catch (error) {
                console.error('❌ Erreur lors de la suppression:', error);
                alert('Erreur lors de la suppression de la page. Veuillez réessayer.');
            }
        }
    }

    /**
     * Supprime une page blanche
     */
    async removeBlankPage(blankPageId) {
        
        // Supprimer de la Map des pages ajoutées
        if (this.addedPages.has(blankPageId)) {
            this.addedPages.delete(blankPageId);
        }
        
        // Mettre à jour le nombre total de pages
        this.totalPages--;
        
    }

    /**
     * Met à jour l'interface après suppression d'une page blanche
     * @param {number} deletedPageNumber - Le numéro de page qui a été supprimé
     */
    async updateUIAfterBlankPageDeletion(deletedPageNumber = null) {
        
        // Régénérer toutes les miniatures avec exclusion de la page supprimée
        await this.regenerateThumbnailsWithAddedPages(deletedPageNumber);
        
        // Mettre à jour la navigation
        this.updateNavigationState();
        
        // Mettre à jour l'affichage
        if (this.options.viewMode === 'continuous') {
            await this.renderAllPagesWithAddedPages();
        } else {
            this.renderPage(this.currentPage);
        }
        
        // Restaurer les annotations après la régénération
        await this.restoreAllAnnotations();
        
        // Mettre à jour la sélection des miniatures
        this.updateThumbnailSelection();
        
    }

    /**
     * Convertit un numéro de page d'affichage vers le numéro de page original ou ID de page blanche
     */
    getPageIdentifier(displayPageNumber) {
        this.deletedPages = this.deletedPages || new Set();
        this.addedPages = this.addedPages || new Map();
        
        // Créer la séquence de pages pour trouver la correspondance
        const pageSequence = this.createPageSequence();
        
        if (displayPageNumber > 0 && displayPageNumber <= pageSequence.length) {
            const pageInfo = pageSequence[displayPageNumber - 1];
            
            if (pageInfo.isBlank) {
                return { type: 'blank', id: pageInfo.id };
            } else {
                return { type: 'original', pageNumber: pageInfo.originalPageNumber };
            }
        }
        
        // Fallback vers la première page
        return { type: 'original', pageNumber: 1 };
    }

    /**
     * Convertit un numéro de page d'affichage vers le numéro de page original (pour compatibilité)
     */
    getOriginalPageNumber(displayPageNumber) {
        const identifier = this.getPageIdentifier(displayPageNumber);
        if (identifier.type === 'original') {
            return identifier.pageNumber;
        }
        // Si c'est une page blanche, retourner la page originale suivante ou la dernière
        const pageSequence = this.createPageSequence();
        for (let i = displayPageNumber; i < pageSequence.length; i++) {
            if (!pageSequence[i].isBlank) {
                return pageSequence[i].originalPageNumber;
            }
        }
        // Si pas de page originale suivante, retourner la dernière page originale
        return this.pdfDoc.numPages;
    }

    /**
     * Supprime une page du document PDF en interne
     */
    async removePageFromDocument(pageNumber) {
        
        // Créer une liste des pages à conserver (toutes sauf celle supprimée)
        this.deletedPages = this.deletedPages || new Set();
        this.deletedPages.add(pageNumber);
        
        // Supprimer l'élément DOM de la page
        const pageElement = this.pageElements.get(pageNumber);
        if (pageElement?.element) {
            pageElement.element.remove();
        }
        
        // Supprimer les annotations de cette page
        this.annotations.delete(pageNumber);
        
        // Supprimer l'historique undo/redo de cette page
        this.undoStack.delete(pageNumber);
        this.redoStack.delete(pageNumber);
        
        // Renumberier les pages qui restent
        await this.renumberPagesAfterDeletion(pageNumber);
        
        // Mettre à jour le nombre total de pages
        this.totalPages--;
        
    }

    /**
     * Renumérote les pages après suppression
     */
    async renumberPagesAfterDeletion(deletedPageNumber) {
        
        // Maps temporaires pour stocker les données renumerotées
        const newPages = new Map();
        const newPageElements = new Map();
        const newAnnotations = new Map();
        const newUndoStack = new Map();
        const newRedoStack = new Map();
        
        // Renumeroter toutes les pages suivantes
        for (let oldPageNum = 1; oldPageNum <= this.totalPages + 1; oldPageNum++) {
            let newPageNum = oldPageNum;
            
            // Si c'est une page après celle supprimée, décrémenter le numéro
            if (oldPageNum > deletedPageNumber) {
                newPageNum = oldPageNum - 1;
            }
            // Si c'est la page supprimée, l'ignorer
            else if (oldPageNum === deletedPageNumber) {
                continue;
            }
            
            // Transférer les données avec le nouveau numéro
            if (this.pages.has(oldPageNum)) {
                newPages.set(newPageNum, this.pages.get(oldPageNum));
            }
            
            if (this.pageElements.has(oldPageNum)) {
                const pageElement = this.pageElements.get(oldPageNum);
                // Mettre à jour l'attribut data-page-number
                if (pageElement.element) {
                    pageElement.element.dataset.pageNumber = newPageNum;
                }
                newPageElements.set(newPageNum, pageElement);
            }
            
            if (this.annotations.has(oldPageNum)) {
                newAnnotations.set(newPageNum, this.annotations.get(oldPageNum));
            }
            
            if (this.undoStack.has(oldPageNum)) {
                newUndoStack.set(newPageNum, this.undoStack.get(oldPageNum));
            }
            
            if (this.redoStack.has(oldPageNum)) {
                newRedoStack.set(newPageNum, this.redoStack.get(oldPageNum));
            }
        }
        
        // Remplacer les Maps par les versions renumerotées
        this.pages = newPages;
        this.pageElements = newPageElements;
        this.annotations = newAnnotations;
        this.undoStack = newUndoStack;
        this.redoStack = newRedoStack;
        
    }

    /**
     * Met à jour l'interface utilisateur après suppression
     */
    async updateUIAfterPageDeletion(deletedPageNumber) {
        
        // Ajuster la page courante si nécessaire
        if (this.currentPage === deletedPageNumber) {
            // Si on a supprimé la dernière page, aller à la page précédente
            if (deletedPageNumber > this.totalPages) {
                this.currentPage = this.totalPages;
            }
            // Sinon rester sur le même numéro (qui affichera la page suivante)
        } else if (this.currentPage > deletedPageNumber) {
            // Si la page courante était après celle supprimée, la décrémenter
            this.currentPage--;
        }
        
        // Régénérer toutes les miniatures
        await this.regenerateThumbnails();
        
        // Mettre à jour la navigation
        this.updateNavigationState();
        
        // Mettre à jour l'affichage de la page courante
        if (this.options.viewMode === 'continuous') {
            // Utiliser la méthode qui gère toutes les modifications (suppressions ET ajouts)
            if (this.addedPages && this.addedPages.size > 0) {
                await this.renderAllPagesWithAddedPages();
            } else {
                await this.renderRemainingPagesInMainView();
            }
        } else {
            this.renderPage(this.currentPage);
        }
        
        // Restaurer les annotations après la régénération
        await this.restoreAllAnnotations();
        
        // Mettre à jour la sélection des miniatures
        this.updateThumbnailSelection();
        
    }

    /**
     * Régénère toutes les miniatures après modification
     */
    async regenerateThumbnails() {
        
        const container = document.getElementById('thumbnails-container');
        if (!container) return;
        
        // Sauvegarder les annotations avant de vider le conteneur
        this.saveAllAnnotations();
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Si des pages ont été modifiées (supprimées ou ajoutées), utiliser la méthode complète
        if ((this.deletedPages && this.deletedPages.size > 0) || (this.addedPages && this.addedPages.size > 0)) {
            await this.generateThumbnailsWithAllPages();
        } else {
            // Sinon utiliser la méthode standard
            await this.generateThumbnails();
        }
        
    }

    /**
     * Génère les miniatures uniquement pour les pages qui n'ont pas été supprimées
     */
    async generateThumbnailsForRemainingPages() {
        
        const container = document.getElementById('thumbnails-container');
        if (!container || !this.pdfDoc) return;

        this.deletedPages = this.deletedPages || new Set();
        let displayPageNumber = 1;

        // Générer miniatures pour chaque page originale non supprimée
        for (let originalPageNum = 1; originalPageNum <= this.pdfDoc.numPages; originalPageNum++) {
            // Ignorer les pages supprimées
            if (this.deletedPages.has(originalPageNum)) {
                continue;
            }

            // Créer l'élément miniature
            const thumbnailItem = document.createElement('div');
            thumbnailItem.className = 'thumbnail-item';
            thumbnailItem.dataset.pageNumber = displayPageNumber;
            thumbnailItem.dataset.originalPageNumber = originalPageNum;

            const canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            canvas.width = 91;
            canvas.height = 118;

            const thumbnailNumber = document.createElement('div');
            thumbnailNumber.className = 'thumbnail-number';
            thumbnailNumber.textContent = displayPageNumber;

            thumbnailItem.appendChild(canvas);
            thumbnailItem.appendChild(thumbnailNumber);

            // Événement de clic
            thumbnailItem.addEventListener('click', () => {
                if (this.options.viewMode === 'continuous') {
                    this.scrollToPage(displayPageNumber);
                } else {
                    this.goToPage(displayPageNumber);
                }
            });

            // Menu contextuel et appui long seulement si pas en mode preview
            if (this.options.mode !== 'preview') {
                // Menu contextuel (clic droit)
                thumbnailItem.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showThumbnailContextMenu(e, displayPageNumber);
                });

                // Appui long pour desktop et mobile
                let pressTimer;
                let isLongPress = false;

                thumbnailItem.addEventListener('mousedown', (e) => {
                    if (e.button === 2) return;
                    
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        this.showThumbnailContextMenu(e, displayPageNumber);
                    }, 500);
                });

                thumbnailItem.addEventListener('mouseup', (e) => {
                    clearTimeout(pressTimer);
                    if (isLongPress) {
                        e.preventDefault();
                        e.stopPropagation();
                        // Le menu reste ouvert grâce au nouveau hideContextMenuHandler
                    }
                });

                thumbnailItem.addEventListener('mouseleave', () => {
                    clearTimeout(pressTimer);
                });
            } else {
                // En mode preview, désactiver le clic droit
                thumbnailItem.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    return false;
                });
            }

            // Appui long tactile pour mobile seulement si pas en mode preview
            if (this.options.mode !== 'preview') {
                let touchTimer;
                let isTouchLongPress = false;

                thumbnailItem.addEventListener('touchstart', (e) => {
                    isTouchLongPress = false;
                    touchTimer = setTimeout(() => {
                        isTouchLongPress = true;
                        this.showThumbnailContextMenu(e, displayPageNumber);
                    }, 500);
                });

                thumbnailItem.addEventListener('touchend', (e) => {
                    clearTimeout(touchTimer);
                    if (isTouchLongPress) {
                        e.preventDefault();
                        e.stopPropagation();
                        // Le menu reste ouvert grâce au nouveau hideContextMenuHandler
                    }
                });

                thumbnailItem.addEventListener('touchmove', () => {
                    clearTimeout(touchTimer);
                    isTouchLongPress = false;
                });
            }

            // Marquer comme active si c'est la page courante
            if (displayPageNumber === this.currentPage) {
                thumbnailItem.classList.add('active');
            }

            // Ajouter au conteneur
            container.appendChild(thumbnailItem);

            // Rendre la page originale sur le canvas
            try {
                const page = await this.pdfDoc.getPage(originalPageNum);
                const ctx = canvas.getContext('2d');
                const viewport = page.getViewport({ scale: 0.15 });
                
                await page.render({
                    canvasContext: ctx,
                    viewport: viewport
                }).promise;

            } catch (error) {
                console.error(`Erreur rendu miniature ${displayPageNumber}:`, error);
            }

            displayPageNumber++;
        }

    }

    /**
     * Rendre les pages restantes dans la vue principale après suppression
     */
    async renderRemainingPagesInMainView() {
        if (!this.pdfDoc) return;

        
        // Vider le conteneur principal
        this.elements.pagesContainer.innerHTML = '';
        this.pageElements.clear();

        this.deletedPages = this.deletedPages || new Set();
        let displayPageNumber = 1;

        // Créer et rendre chaque page non supprimée
        for (let originalPageNum = 1; originalPageNum <= this.pdfDoc.numPages; originalPageNum++) {
            // Ignorer les pages supprimées
            if (this.deletedPages.has(originalPageNum)) {
                continue;
            }

            await this.createPageElementForOriginalPage(originalPageNum, displayPageNumber);
            displayPageNumber++;
        }

        // Reconfigurer la détection de page visible
        this.setupPageVisibilityObserver();
        
        // Reconfigurer les outils d'annotation pour toutes les pages
        this.reconfigureAnnotationTools();
        
    }

    /**
     * Créer un élément de page pour une page originale avec un nouveau numéro d'affichage
     */
    async createPageElementForOriginalPage(originalPageNum, displayPageNum) {
        try {
            const page = await this.pdfDoc.getPage(originalPageNum);
            
            // Calculer les dimensions
            const baseViewport = page.getViewport({ scale: 1.0 });
            const scaledViewport = page.getViewport({ scale: this.currentScale });
            
            // Créer le conteneur de la page
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container';
            pageContainer.dataset.pageNumber = displayPageNum;
            pageContainer.dataset.originalPageNumber = originalPageNum;
            
            // Canvas principal
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-canvas';
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            
            // Canvas pour annotations
            const annotationCanvas = document.createElement('canvas');
            annotationCanvas.className = 'pdf-annotation-layer';
            annotationCanvas.width = scaledViewport.width;
            annotationCanvas.height = scaledViewport.height;
            
            // Assembler la structure
            pageContainer.appendChild(canvas);
            pageContainer.appendChild(annotationCanvas);
            this.elements.pagesContainer.appendChild(pageContainer);
            
            // Obtenir les contextes
            const ctx = canvas.getContext('2d');
            const annotationCtx = annotationCanvas.getContext('2d');
            
            // Stocker les éléments de page
            const pageElement = {
                element: pageContainer,
                container: pageContainer,
                canvas: canvas,
                annotationCanvas: annotationCanvas,
                ctx: ctx,
                annotationCtx: annotationCtx,
                viewport: scaledViewport,
                originalPageNumber: originalPageNum
            };
            
            this.pageElements.set(displayPageNum, pageElement);
            
            // Rendre la page originale
            await page.render({
                canvasContext: ctx,
                viewport: scaledViewport
            }).promise;
            
            // Initialiser l'historique pour cette page
            this.initializeUndoHistoryForPage(displayPageNum);
            
            // Configurer les événements d'annotation pour cette page
            if (this.currentMode.annotations && annotationCanvas) {
                this.setupPageAnnotationEvents(displayPageNum, annotationCanvas);
            }
            
            
        } catch (error) {
            console.error(`Erreur création page ${displayPageNum}:`, error);
        }
    }

    /**
     * Initialise l'historique undo/redo pour une page spécifique
     */
    initializeUndoHistoryForPage(pageNum) {
        const pageElement = this.pageElements.get(pageNum);
        if (pageElement?.annotationCtx) {
            const ctx = pageElement.annotationCtx;
            const emptyState = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
            
            // Initialiser les stacks pour cette page
            if (!this.undoStack.has(pageNum)) {
                this.undoStack.set(pageNum, []);
            }
            if (!this.redoStack.has(pageNum)) {
                this.redoStack.set(pageNum, []);
            }
            
            // Ajouter l'état vide initial
            this.undoStack.get(pageNum).push(emptyState);
            
            this.updateUndoRedoButtons();
        }
    }

    /**
     * Ajoute une page blanche après la page spécifiée
     */
    async addBlankPageAfter(pageNumber) {
        
        if (confirm(`Ajouter une page blanche après la page ${pageNumber} ?`)) {
            try {
                // Créer et insérer la page blanche en utilisant la position d'affichage
                await this.insertBlankPageAfterDisplayPosition(pageNumber);
                
                // Mettre à jour l'interface utilisateur
                await this.updateUIAfterPageInsertionAtPosition(pageNumber);
                
                
                // Sauvegarder automatiquement après ajout
                this.scheduleAutoSave();
                
            } catch (error) {
                console.error('❌ Erreur lors de l\'ajout de page blanche:', error);
                alert('Erreur lors de l\'ajout de la page blanche. Veuillez réessayer.');
            }
        }
    }

    /**
     * Ajoute une page avec graphique après la page spécifiée
     */
    async addGraphPageAfter(pageNumber) {

        if (confirm(`Créer une page avec graphique après la page ${pageNumber} ?`)) {
            try {
                // Créer et insérer la page graphique en utilisant la position d'affichage
                await this.insertGraphPageAfterDisplayPosition(pageNumber);
                
                // Mettre à jour l'interface utilisateur et naviguer vers la nouvelle page
                await this.updateUIAfterGraphPageInsertionAtPosition(pageNumber);
                
                
                // Sauvegarder automatiquement après ajout
                this.scheduleAutoSave();
                
            } catch (error) {
                console.error('❌ Erreur lors de l\'ajout de page graphique:', error);
                alert('Erreur lors de l\'ajout de la page graphique. Veuillez réessayer.');
            }
        }
    }

    /**
     * Insère une page graphique après la position d'affichage spécifiée
     */
    async insertGraphPageAfterDisplayPosition(displayPageNumber) {
        
        // Initialiser le système de pages ajoutées si nécessaire
        this.addedPages = this.addedPages || new Map();
        
        // Générer un identifiant unique pour la page graphique
        const graphPageId = `graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Obtenir l'identifiant de la page à cette position
        const pageIdentifier = this.getPageIdentifier(displayPageNumber);
        
        // Créer les données de la page graphique avec la position d'affichage
        const graphPageData = {
            id: graphPageId,
            isBlank: true,
            isGraph: true,  // Changé de isGraphPage à isGraph
            insertAfterDisplay: displayPageNumber,
            insertAfterIdentifier: pageIdentifier,
            width: 595, // Taille A4 standard en points
            height: 842,
            createdAt: new Date().toISOString(),
            graphConfig: {
                xMin: -15,
                xMax: 15,
                yMin: -15,
                yMax: 15,
                gridSize: 1,
                functions: []
            }
        };
        
        // Stocker la page graphique
        this.addedPages.set(graphPageId, graphPageData);
        
        // Mettre à jour le nombre total de pages
        this.totalPages++;
        
    }

    /**
     * Met à jour l'interface utilisateur après insertion de page graphique à une position
     */
    async updateUIAfterGraphPageInsertionAtPosition(displayPageNumber) {
        
        // Régénérer toutes les miniatures avec les pages ajoutées
        await this.regenerateThumbnailsWithAddedPages();
        
        // Mettre à jour la navigation
        this.updateNavigationState();
        
        // Naviguer vers la nouvelle page graphique
        const newPageNumber = displayPageNumber + 1;
        
        if (this.options.viewMode === 'continuous') {
            await this.renderAllPagesWithAddedPages();
            // Scroller vers la nouvelle page
            setTimeout(() => {
                this.scrollToPage(newPageNumber);
            }, 100);
        } else {
            this.renderPage(newPageNumber);
        }
        
        // Sauvegarder automatiquement
        if (this.options.autoSave) {
            this.scheduleAutoSave();
        }
        
    }

    /**
     * Insère une page graphique après la page originale spécifiée (ancienne méthode pour compatibilité)
     */
    async insertGraphPageAfter(originalPageNumber) {
        
        // Initialiser le système de pages ajoutées si nécessaire
        this.addedPages = this.addedPages || new Map();
        
        // Générer un identifiant unique pour la page graphique
        const graphPageId = `graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Créer les données de la page graphique
        const graphPageData = {
            id: graphPageId,
            isBlank: true,
            isGraph: true,
            insertAfter: originalPageNumber,
            width: 595, // Taille A4 standard en points
            height: 842,
            createdAt: new Date().toISOString(),
            graphConfig: {
                xMin: -15,
                xMax: 15,
                yMin: -15,
                yMax: 15,
                gridSize: 1,
                functions: []
            }
        };
        
        // Stocker la page graphique
        this.addedPages.set(graphPageId, graphPageData);
        
        // Mettre à jour le nombre total de pages
        this.totalPages++;
        
    }

    /**
     * Met à jour l'interface utilisateur après insertion de page graphique
     */
    async updateUIAfterGraphPageInsertion(originalPageNumber) {
        
        // Régénérer toutes les miniatures avec les pages ajoutées
        await this.regenerateThumbnailsWithAddedPages();
        
        // Mettre à jour la navigation
        this.updateNavigationState();
        
        // Mettre à jour l'affichage de la page courante
        if (this.options.viewMode === 'continuous') {
            await this.renderAllPagesWithAddedPages();
        } else {
            this.renderPage(this.currentPage);
        }
        
        // Restaurer les annotations après la régénération
        await this.restoreAllAnnotations();
        
        // Réinitialiser les événements du bouton téléchargement après modification de l'UI
        this.initDownloadButton();
        
        // Naviguer vers la nouvelle page graphique créée
        const pageSequence = this.createPageSequence();
        const newGraphPageIndex = pageSequence.findIndex(page => 
            page.isBlank && page.id && this.addedPages.get(page.id)?.isGraph
        );
        
        if (newGraphPageIndex !== -1) {
            const newPageNumber = newGraphPageIndex + 1;
            this.goToPage(newPageNumber);
            
            // Ouvrir automatiquement le panneau de contrôle graphique (temporairement désactivé pour test)
            // setTimeout(() => {
            //     this.showGraphControlPanel(newPageNumber);
            // }, 500);
        }
        
        // Mettre à jour la sélection des miniatures
        this.updateThumbnailSelection();
        
    }

    /**
     * Insère une page blanche après la position d'affichage spécifiée
     */
    async insertBlankPageAfterDisplayPosition(displayPageNumber) {
        
        // Initialiser le système de pages ajoutées si nécessaire
        this.addedPages = this.addedPages || new Map();
        
        // Générer un identifiant unique pour la page blanche
        const blankPageId = `blank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Obtenir l'identifiant de la page à cette position
        const pageIdentifier = this.getPageIdentifier(displayPageNumber);
        
        // Créer les données de la page blanche avec la position d'affichage
        const blankPageData = {
            id: blankPageId,
            isBlank: true,
            insertAfterDisplay: displayPageNumber,
            insertAfterIdentifier: pageIdentifier,
            width: 595, // Taille A4 standard en points
            height: 842,
            createdAt: new Date().toISOString()
        };
        
        // Stocker la page blanche
        this.addedPages.set(blankPageId, blankPageData);
        
        // Mettre à jour le nombre total de pages
        this.totalPages++;
        
    }

    /**
     * Insère une page blanche après la page originale spécifiée (ancienne méthode pour compatibilité)
     */
    async insertBlankPageAfter(originalPageNumber) {
        
        // Initialiser le système de pages ajoutées si nécessaire
        this.addedPages = this.addedPages || new Map();
        
        // Générer un identifiant unique pour la page blanche
        const blankPageId = `blank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Créer les données de la page blanche
        const blankPageData = {
            id: blankPageId,
            isBlank: true,
            insertAfter: originalPageNumber,
            width: 595, // Taille A4 standard en points
            height: 842,
            createdAt: new Date().toISOString()
        };
        
        // Stocker la page blanche
        this.addedPages.set(blankPageId, blankPageData);
        
        // Mettre à jour le nombre total de pages
        this.totalPages++;
        
    }

    /**
     * Met à jour l'interface utilisateur après insertion de page à une position
     */
    async updateUIAfterPageInsertionAtPosition(displayPageNumber) {
        
        // Régénérer toutes les miniatures avec les pages ajoutées
        await this.regenerateThumbnailsWithAddedPages();
        
        // Mettre à jour la navigation
        this.updateNavigationState();
        
        // Mettre à jour l'affichage de la page courante
        if (this.options.viewMode === 'continuous') {
            await this.renderAllPagesWithAddedPages();
        } else {
            this.renderPage(this.currentPage);
        }
        
        // Sauvegarder automatiquement
        if (this.options.autoSave) {
            this.scheduleAutoSave();
        }
        
    }

    /**
     * Met à jour l'interface utilisateur après insertion de page (ancienne méthode pour compatibilité)
     */
    async updateUIAfterPageInsertion(originalPageNumber) {
        
        // Régénérer toutes les miniatures avec les pages ajoutées
        await this.regenerateThumbnailsWithAddedPages();
        
        // Mettre à jour la navigation
        this.updateNavigationState();
        
        // Mettre à jour l'affichage de la page courante
        if (this.options.viewMode === 'continuous') {
            await this.renderAllPagesWithAddedPages();
        } else {
            this.renderPage(this.currentPage);
        }
        
        // Restaurer les annotations après la régénération
        await this.restoreAllAnnotations();
        
        // Naviguer vers la nouvelle page blanche créée
        const pageSequence = this.createPageSequence();
        const newBlankPageIndex = pageSequence.findIndex(page => 
            page.isBlank && page.id && this.addedPages.get(page.id) && !this.addedPages.get(page.id).isGraph
        );
        
        if (newBlankPageIndex !== -1) {
            const newPageNumber = newBlankPageIndex + 1;
            this.goToPage(newPageNumber);
        }
        
        // Mettre à jour la sélection des miniatures
        this.updateThumbnailSelection();
        
    }

    /**
     * Sauvegarde les annotations de toutes les pages
     * @param {number} excludePageNumber - Numéro de page à exclure de la sauvegarde (optionnel)
     */
    saveAllAnnotations(excludePageNumber = null) {
        // Si on doit ignorer la sauvegarde (déjà faite avant suppression)
        if (this.skipNextAnnotationSave) {
            return;
        }
        
        if (excludePageNumber) {
        }
        
        // Vider la sauvegarde précédente si on ne fait pas d'exclusion
        if (!excludePageNumber) {
            this.annotationBackup = new Map();
        }
        
        // Sauvegarder les annotations des canvas d'annotation existants
        const annotationCanvases = document.querySelectorAll('.pdf-annotation-layer');
        annotationCanvases.forEach((canvas, index) => {
            const pageContainer = canvas.closest('.pdf-page-container');
            if (pageContainer) {
                const pageNumber = parseInt(pageContainer.dataset.pageNumber) || (index + 1);
                
                // Ignorer la page à exclure
                if (excludePageNumber && pageNumber === excludePageNumber) {
                    return;
                }
                
                const imageData = canvas.toDataURL();
                
                // Utiliser l'identifiant unique de la page
                const pageIdentifier = this.getPageIdentifier(pageNumber);
                const pageKey = pageIdentifier.type === 'blank' 
                    ? `blank_${pageIdentifier.id}` 
                    : `original_${pageIdentifier.pageNumber}`;
                
                // Stocker dans une sauvegarde temporaire
                if (!this.annotationBackup) {
                    this.annotationBackup = new Map();
                }
                this.annotationBackup.set(pageKey, imageData);
            }
        });
        
    }
    
    /**
     * Restaure les annotations après régénération
     */
    async restoreAllAnnotations() {
        if (!this.annotationBackup || this.annotationBackup.size === 0) {
            return;
        }
        
        
        // Parcourir toutes les pages affichées pour restaurer les annotations
        const pageContainers = document.querySelectorAll('.pdf-page-container');
        pageContainers.forEach(pageContainer => {
            const displayPageNumber = parseInt(pageContainer.dataset.pageNumber);
            if (!displayPageNumber) return;
            
            // Obtenir l'identifiant unique de cette page
            const pageIdentifier = this.getPageIdentifier(displayPageNumber);
            const pageKey = pageIdentifier.type === 'blank' 
                ? `blank_${pageIdentifier.id}` 
                : `original_${pageIdentifier.pageNumber}`;
            
            // Vérifier si nous avons des annotations pour cette page
            if (this.annotationBackup.has(pageKey)) {
                const imageData = this.annotationBackup.get(pageKey);
                const annotationCanvas = pageContainer.querySelector('.pdf-annotation-layer');
                
                if (annotationCanvas) {
                    const img = new Image();
                    img.onload = () => {
                        const ctx = annotationCanvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                    };
                    img.src = imageData;
                }
            }
        });
        
        // Nettoyer la sauvegarde
        this.annotationBackup.clear();
    }

    /**
     * Régénère les miniatures en incluant les pages ajoutées
     * @param {number} excludePageNumber - Numéro de page à exclure de la sauvegarde des annotations
     */
    async regenerateThumbnailsWithAddedPages(excludePageNumber = null) {
        
        const container = document.getElementById('thumbnails-container');
        if (!container) return;
        
        // Sauvegarder les annotations avant de vider le conteneur
        this.saveAllAnnotations(excludePageNumber);
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Générer les miniatures dans l'ordre correct
        await this.generateThumbnailsWithAllPages();
        
    }

    /**
     * Génère les miniatures pour toutes les pages (originales, supprimées, ajoutées)
     */
    async generateThumbnailsWithAllPages() {
        
        const container = document.getElementById('thumbnails-container');
        if (!container || !this.pdfDoc) return;
        
        // Marquer que les miniatures sont en cours de génération
        this.thumbnailsGenerated = true;
        
        // Vider le conteneur avant de générer les nouvelles miniatures
        container.innerHTML = '';

        this.deletedPages = this.deletedPages || new Set();
        this.addedPages = this.addedPages || new Map();
        
        let displayPageNumber = 1;
        
        // Créer une liste ordonnée de toutes les pages
        const pageSequence = this.createPageSequence();
        
        // Générer miniatures pour chaque page dans la séquence
        for (const pageInfo of pageSequence) {
            if (pageInfo.isBlank) {
                // Créer miniature pour page blanche
                await this.createBlankThumbnail(displayPageNumber, pageInfo.id);
            } else {
                // Créer miniature pour page originale
                await this.createOriginalThumbnail(displayPageNumber, pageInfo.originalPageNumber);
            }
            displayPageNumber++;
        }
        
    }

    /**
     * Crée la séquence ordonnée de toutes les pages
     */
    createPageSequence() {
        const sequence = [];
        
        
        // D'abord, créer une séquence de base avec les pages originales
        const baseSequence = [];
        for (let originalPageNum = 1; originalPageNum <= this.pdfDoc.numPages; originalPageNum++) {
            if (!this.deletedPages.has(originalPageNum)) {
                baseSequence.push({
                    isBlank: false,
                    originalPageNumber: originalPageNum
                });
            }
        }
        
        // Ensuite, insérer les pages ajoutées dans l'ordre correct
        // Trier les pages ajoutées par ordre de création pour maintenir la cohérence
        const sortedAddedPages = Array.from(this.addedPages.entries())
            .sort((a, b) => {
                const timeA = new Date(a[1].createdAt || '').getTime() || 0;
                const timeB = new Date(b[1].createdAt || '').getTime() || 0;
                return timeA - timeB;
            });
        
        // Construire la séquence finale en insérant les pages ajoutées
        let currentSequence = [...baseSequence];
        
        for (const [blankId, blankData] of sortedAddedPages) {
            if (blankData.insertAfterDisplay !== undefined) {
                // Nouvelle méthode : insertion basée sur la position d'affichage
                const insertPosition = Math.min(blankData.insertAfterDisplay, currentSequence.length);
                currentSequence.splice(insertPosition, 0, {
                    isBlank: true,
                    id: blankId,
                    blankData: blankData
                });
            } else if (blankData.insertAfter !== undefined) {
                // Ancienne méthode : insertion basée sur le numéro de page original
                let insertIndex = currentSequence.length;
                for (let i = 0; i < currentSequence.length; i++) {
                    if (!currentSequence[i].isBlank && currentSequence[i].originalPageNumber === blankData.insertAfter) {
                        insertIndex = i + 1;
                        break;
                    }
                }
                currentSequence.splice(insertIndex, 0, {
                    isBlank: true,
                    id: blankId,
                    blankData: blankData
                });
            }
        }
        
        return currentSequence;
    }

    /**
     * Crée une miniature pour une page blanche
     */
    async createBlankThumbnail(displayPageNum, blankPageId) {
        const container = document.getElementById('thumbnails-container');
        
        // Vérifier si c'est une page graphique
        const pageData = this.addedPages.get(blankPageId);
        const isGraphPage = pageData?.isGraph === true;
        
        // Créer l'élément miniature
        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = `thumbnail-item blank-page ${isGraphPage ? 'graph-page' : ''}`;
        thumbnailItem.dataset.pageNumber = displayPageNum;
        thumbnailItem.dataset.blankPageId = blankPageId;

        const canvas = document.createElement('canvas');
        canvas.className = 'thumbnail-canvas';
        canvas.width = 91;
        canvas.height = 118;

        const thumbnailNumber = document.createElement('div');
        thumbnailNumber.className = 'thumbnail-number';
        thumbnailNumber.textContent = displayPageNum;

        thumbnailItem.appendChild(canvas);
        thumbnailItem.appendChild(thumbnailNumber);

        // Dessiner une page blanche
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        
        // Ajouter une indication visuelle selon le type de page
        ctx.fillStyle = '#999';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        if (isGraphPage) {
            ctx.fillText('📊', canvas.width / 2, canvas.height / 2 - 5);
            ctx.fillText('Graphique', canvas.width / 2, canvas.height / 2 + 10);
        } else {
            ctx.fillText('Page', canvas.width / 2, canvas.height / 2 - 5);
            ctx.fillText('blanche', canvas.width / 2, canvas.height / 2 + 10);
        }

        // Ajouter les événements
        this.addThumbnailEvents(thumbnailItem, displayPageNum);

        // Marquer comme active si c'est la page courante
        if (displayPageNum === this.currentPage) {
            thumbnailItem.classList.add('active');
        }

        // Ajouter au conteneur
        container.appendChild(thumbnailItem);

    }

    /**
     * Crée une miniature pour une page originale
     */
    async createOriginalThumbnail(displayPageNum, originalPageNum) {
        const container = document.getElementById('thumbnails-container');
        
        // Créer l'élément miniature
        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = 'thumbnail-item';
        thumbnailItem.dataset.pageNumber = displayPageNum;
        thumbnailItem.dataset.originalPageNumber = originalPageNum;

        const canvas = document.createElement('canvas');
        canvas.className = 'thumbnail-canvas';
        canvas.width = 91;
        canvas.height = 118;

        const thumbnailNumber = document.createElement('div');
        thumbnailNumber.className = 'thumbnail-number';
        thumbnailNumber.textContent = displayPageNum;

        thumbnailItem.appendChild(canvas);
        thumbnailItem.appendChild(thumbnailNumber);

        // Ajouter les événements
        this.addThumbnailEvents(thumbnailItem, displayPageNum);

        // Marquer comme active si c'est la page courante
        if (displayPageNum === this.currentPage) {
            thumbnailItem.classList.add('active');
        }

        // Ajouter au conteneur
        container.appendChild(thumbnailItem);

        // Rendre la page originale sur le canvas
        try {
            const page = await this.pdfDoc.getPage(originalPageNum);
            const ctx = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: 0.15 });
            
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

        } catch (error) {
            console.error(`Erreur rendu miniature ${displayPageNum}:`, error);
        }
    }

    /**
     * Ajoute les événements aux miniatures
     */
    addThumbnailEvents(thumbnailItem, displayPageNum) {
        // Événement de clic
        thumbnailItem.addEventListener('click', () => {
            if (this.options.viewMode === 'continuous') {
                this.scrollToPage(displayPageNum);
            } else {
                this.goToPage(displayPageNum);
            }
            
            // Ouvrir le panneau graphique si c'est une page graphique
            if (this.isCurrentPageGraph(displayPageNum)) {
                setTimeout(() => {
                    this.showGraphControlPanel(displayPageNum);
                }, 200);
            }
        });

        // Menu contextuel et appui long seulement si pas en mode preview
        if (this.options.mode !== 'preview') {
            // Menu contextuel (clic droit)
            thumbnailItem.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showThumbnailContextMenu(e, displayPageNum);
            });

            // Appui long pour desktop et mobile
            let pressTimer;
            let isLongPress = false;

            thumbnailItem.addEventListener('mousedown', (e) => {
                if (e.button === 2) return;
                
                isLongPress = false;
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.showThumbnailContextMenu(e, displayPageNum);
                }, 500);
            });

            thumbnailItem.addEventListener('mouseup', (e) => {
                clearTimeout(pressTimer);
                if (isLongPress) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Le menu reste ouvert grâce au nouveau hideContextMenuHandler
                }
            });

            thumbnailItem.addEventListener('mouseleave', () => {
                clearTimeout(pressTimer);
            });
        } else {
            // En mode preview, désactiver le clic droit
            thumbnailItem.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            });
        }

        // Appui long tactile pour mobile seulement si pas en mode preview
        if (this.options.mode !== 'preview') {
            let touchTimer;
            let isTouchLongPress = false;

            thumbnailItem.addEventListener('touchstart', (e) => {
                isTouchLongPress = false;
                touchTimer = setTimeout(() => {
                    isTouchLongPress = true;
                    this.showThumbnailContextMenu(e, displayPageNum);
                }, 500);
            });

            thumbnailItem.addEventListener('touchend', (e) => {
                clearTimeout(touchTimer);
                if (isTouchLongPress) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Le menu reste ouvert grâce au nouveau hideContextMenuHandler
                }
            });

            thumbnailItem.addEventListener('touchmove', () => {
                clearTimeout(touchTimer);
                isTouchLongPress = false;
            });
        }
    }

    /**
     * Rendre toutes les pages avec les pages ajoutées
     */
    async renderAllPagesWithAddedPages() {
        if (!this.pdfDoc) return;

        
        // Vider le conteneur principal
        this.elements.pagesContainer.innerHTML = '';
        this.pageElements.clear();

        const pageSequence = this.createPageSequence();
        let displayPageNumber = 1;

        // Créer et rendre chaque page dans la séquence
        for (const pageInfo of pageSequence) {
            if (pageInfo.isBlank) {
                await this.createBlankPageElement(displayPageNumber, pageInfo.id);
            } else {
                await this.createPageElementForOriginalPage(pageInfo.originalPageNumber, displayPageNumber);
            }
            displayPageNumber++;
        }

        // Reconfigurer la détection de page visible
        this.setupPageVisibilityObserver();
        
        // Reconfigurer les outils d'annotation pour toutes les pages
        this.reconfigureAnnotationTools();
        
    }

    /**
     * Crée un élément de page pour une page blanche
     */
    async createBlankPageElement(displayPageNum, blankPageId) {
        try {
            const blankData = this.addedPages.get(blankPageId);
            
            // Calculer les dimensions
            const scaledWidth = blankData.width * this.currentScale;
            const scaledHeight = blankData.height * this.currentScale;
            
            // Créer le conteneur de la page
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container blank-page';
            pageContainer.dataset.pageNumber = displayPageNum;
            pageContainer.dataset.blankPageId = blankPageId;
            
            // Canvas principal
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-canvas';
            canvas.width = scaledWidth;
            canvas.height = scaledHeight;
            
            // Canvas pour annotations
            const annotationCanvas = document.createElement('canvas');
            annotationCanvas.className = 'pdf-annotation-layer';
            annotationCanvas.width = scaledWidth;
            annotationCanvas.height = scaledHeight;
            
            // Assembler la structure
            pageContainer.appendChild(canvas);
            pageContainer.appendChild(annotationCanvas);
            this.elements.pagesContainer.appendChild(pageContainer);
            
            // Obtenir les contextes
            const ctx = canvas.getContext('2d');
            const annotationCtx = annotationCanvas.getContext('2d');
            
            // Dessiner une page blanche
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, scaledWidth, scaledHeight);
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, scaledWidth, scaledHeight);
            
            // Si c'est une page graphique, dessiner le graphique
            if (blankData.isGraph && blankData.graphConfig) {
                this.drawGraph(ctx, scaledWidth, scaledHeight, blankData.graphConfig);
                // Ajouter le bouton de contrôle graphique
                this.addGraphControlButton(pageContainer, displayPageNum);
            }
            
            // Stocker les éléments de page
            const pageElement = {
                element: pageContainer,
                container: pageContainer,
                canvas: canvas,
                annotationCanvas: annotationCanvas,
                ctx: ctx,
                annotationCtx: annotationCtx,
                viewport: { width: scaledWidth, height: scaledHeight },
                isBlank: true,
                blankPageId: blankPageId
            };
            
            this.pageElements.set(displayPageNum, pageElement);
            
            // Initialiser l'historique pour cette page
            this.initializeUndoHistoryForPage(displayPageNum);
            
            // Configurer les événements d'annotation pour cette page
            if (this.currentMode.annotations && annotationCanvas) {
                this.setupPageAnnotationEvents(displayPageNum, annotationCanvas);
            }
            
            
        } catch (error) {
            console.error(`Erreur création page blanche ${displayPageNum}:`, error);
        }
    }

    /**
     * Reconfigure les outils d'annotation après régénération des pages
     */
    reconfigureAnnotationTools() {
        
        // Réactiver l'outil courant pour toutes les pages
        this.setCurrentTool(this.currentTool);
        
    }

    /**
     * Dessine un graphique mathématique sur le canvas
     */
    drawGraph(ctx, width, height, graphConfig) {
        const { xMin, xMax, yMin, yMax, gridSize, functions } = graphConfig;
        
        // Calculer les dimensions du graphique
        const margin = 40;
        const graphWidth = width - 2 * margin;
        const graphHeight = height - 2 * margin;
        
        // Calculer les échelles
        const xScale = graphWidth / (xMax - xMin);
        const yScale = graphHeight / (yMax - yMin);
        
        // Fonction pour convertir les coordonnées
        const toCanvasX = (x) => margin + (x - xMin) * xScale;
        const toCanvasY = (y) => height - margin - (y - yMin) * yScale;
        
        ctx.save();
        
        // Dessiner la grille
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;
        
        // Lignes verticales
        for (let x = Math.ceil(xMin / gridSize) * gridSize; x <= xMax; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(toCanvasX(x), margin);
            ctx.lineTo(toCanvasX(x), height - margin);
            ctx.stroke();
        }
        
        // Lignes horizontales
        for (let y = Math.ceil(yMin / gridSize) * gridSize; y <= yMax; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(margin, toCanvasY(y));
            ctx.lineTo(width - margin, toCanvasY(y));
            ctx.stroke();
        }
        
        // Dessiner les axes avec flèches
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.lineWidth = 2;
        
        // Axe X
        if (yMin <= 0 && yMax >= 0) {
            const y0 = toCanvasY(0);
            
            // Ligne principale de l'axe X
            ctx.beginPath();
            ctx.moveTo(margin, y0);
            ctx.lineTo(width - margin - 10, y0); // Laisser place pour la flèche
            ctx.stroke();
            
            // Flèche à droite de l'axe X
            ctx.beginPath();
            ctx.moveTo(width - margin, y0);
            ctx.lineTo(width - margin - 10, y0 - 5);
            ctx.lineTo(width - margin - 10, y0 + 5);
            ctx.closePath();
            ctx.fill();
            
            // Label "x" à droite de l'axe
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('x', width - margin + 15, y0);
        }
        
        // Axe Y
        if (xMin <= 0 && xMax >= 0) {
            const x0 = toCanvasX(0);
            
            // Ligne principale de l'axe Y
            ctx.beginPath();
            ctx.moveTo(x0, height - margin);
            ctx.lineTo(x0, margin + 10); // Laisser place pour la flèche
            ctx.stroke();
            
            // Flèche en haut de l'axe Y
            ctx.beginPath();
            ctx.moveTo(x0, margin);
            ctx.lineTo(x0 - 5, margin + 10);
            ctx.lineTo(x0 + 5, margin + 10);
            ctx.closePath();
            ctx.fill();
            
            // Label "y" en haut de l'axe
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('y', x0, margin - 15);
        }
        
        // Ajouter les graduations et nombres
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        // Graduations X
        for (let x = Math.ceil(xMin / gridSize) * gridSize; x <= xMax; x += gridSize) {
            if (x !== 0) {
                const canvasX = toCanvasX(x);
                const canvasY = yMin <= 0 && yMax >= 0 ? toCanvasY(0) : height - margin;
                
                // Trait de graduation
                ctx.beginPath();
                ctx.moveTo(canvasX, canvasY - 5);
                ctx.lineTo(canvasX, canvasY + 5);
                ctx.stroke();
                
                // Nombre
                ctx.fillText(x.toString(), canvasX, canvasY + 8);
            }
        }
        
        // Graduations Y
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let y = Math.ceil(yMin / gridSize) * gridSize; y <= yMax; y += gridSize) {
            if (y !== 0) {
                const canvasX = xMin <= 0 && xMax >= 0 ? toCanvasX(0) : margin;
                const canvasY = toCanvasY(y);
                
                // Trait de graduation
                ctx.beginPath();
                ctx.moveTo(canvasX - 5, canvasY);
                ctx.lineTo(canvasX + 5, canvasY);
                ctx.stroke();
                
                // Nombre
                ctx.fillText(y.toString(), canvasX - 8, canvasY);
            }
        }
        
        // Dessiner les fonctions
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        
        functions.forEach((func, index) => {
            try {
                ctx.strokeStyle = func.color || `hsl(${index * 60}, 70%, 50%)`;
                ctx.beginPath();
                let firstPoint = true;
                
                for (let canvasX = margin; canvasX <= width - margin; canvasX += 2) {
                    const mathX = (canvasX - margin) / xScale + xMin;
                    const mathY = this.evaluateFunction(func.expression, mathX);
                    
                    if (!isNaN(mathY) && isFinite(mathY) && mathY >= yMin && mathY <= yMax) {
                        const canvasY = toCanvasY(mathY);
                        
                        if (firstPoint) {
                            ctx.moveTo(canvasX, canvasY);
                            firstPoint = false;
                        } else {
                            ctx.lineTo(canvasX, canvasY);
                        }
                    } else {
                        firstPoint = true;
                    }
                }
                ctx.stroke();
            } catch (error) {
                console.warn(`Erreur lors du tracé de la fonction: ${func.expression}`, error);
            }
        });
        
        ctx.restore();
    }

    /**
     * Évalue une expression mathématique pour une valeur de x donnée
     */
    evaluateFunction(expression, x) {
        try {
            // Remplacer x par la valeur
            let expr = expression.replace(/x/g, `(${x})`);
            
            // Remplacer les fonctions mathématiques courantes
            expr = expr.replace(/sin/g, 'Math.sin');
            expr = expr.replace(/cos/g, 'Math.cos');
            expr = expr.replace(/tan/g, 'Math.tan');
            expr = expr.replace(/log/g, 'Math.log');
            expr = expr.replace(/sqrt/g, 'Math.sqrt');
            expr = expr.replace(/abs/g, 'Math.abs');
            expr = expr.replace(/pi/g, 'Math.PI');
            expr = expr.replace(/e/g, 'Math.E');
            expr = expr.replace(/\^/g, '**');
            
            return eval(expr);
        } catch (error) {
            return NaN;
        }
    }

    /**
     * Crée l'interface de contrôle pour les graphiques
     */
    createGraphControlPanel() {
        if (this.graphControlPanel) {
            this.graphControlPanel.remove();
        }

        const panel = document.createElement('div');
        panel.className = 'graph-control-panel';
        panel.innerHTML = `
            <div class="graph-control-header">
                <h3><i class="fas fa-chart-line"></i> Configuration du graphique</h3>
                <button class="graph-control-close" title="Fermer">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="graph-control-content">
                <div class="graph-section">
                    <h4>Limites des axes</h4>
                    <div class="axis-controls">
                        <div class="axis-row">
                            <label>Axe X:</label>
                            <input type="number" id="graph-x-min" placeholder="Min" value="-15" step="0.1">
                            <span>à</span>
                            <input type="number" id="graph-x-max" placeholder="Max" value="15" step="0.1">
                        </div>
                        <div class="axis-row">
                            <label>Axe Y:</label>
                            <input type="number" id="graph-y-min" placeholder="Min" value="-15" step="0.1">
                            <span>à</span>
                            <input type="number" id="graph-y-max" placeholder="Max" value="15" step="0.1">
                        </div>
                        <div class="axis-row">
                            <label>Grille:</label>
                            <input type="number" id="graph-grid-size" placeholder="Taille" value="1" step="0.1" min="0.1" max="5">
                            <span>unité(s)</span>
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <button id="graph-apply-axes" class="graph-btn primary">Appliquer</button>
                            <button id="graph-reset-axes" class="graph-btn secondary">Reset</button>
                        </div>
                    </div>
                </div>
                
                <div class="graph-section">
                    <h4>Fonctions mathématiques</h4>
                    <div class="function-controls">
                        <div class="function-input-row">
                            <input type="text" id="graph-function-input" placeholder="Ex: x^2, sin(x), 2*x+1" title="Fonctions disponibles: sin, cos, tan, log, sqrt, abs, pi, e">
                            <input type="color" id="graph-function-color" value="#ff0000" title="Couleur de la fonction">
                            <button id="graph-add-function" class="graph-btn primary" title="Ajouter la fonction">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                        <div class="function-presets" style="margin-bottom: 12px;">
                            <label style="font-size: 12px; color: #6b7280;">Fonctions prédéfinies:</label>
                            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                                <button class="preset-btn" data-function="x">x</button>
                                <button class="preset-btn" data-function="x^2">x²</button>
                                <button class="preset-btn" data-function="x^3">x³</button>
                                <button class="preset-btn" data-function="sin(x)">sin(x)</button>
                                <button class="preset-btn" data-function="cos(x)">cos(x)</button>
                                <button class="preset-btn" data-function="tan(x)">tan(x)</button>
                                <button class="preset-btn" data-function="log(x)">log(x)</button>
                                <button class="preset-btn" data-function="sqrt(x)">√x</button>
                                <button class="preset-btn" data-function="abs(x)">|x|</button>
                            </div>
                        </div>
                        <div class="functions-list" id="graph-functions-list">
                            <!-- Fonctions ajoutées apparaîtront ici -->
                        </div>
                    </div>
                </div>
                
                <div class="graph-section">
                    <h4>Actions</h4>
                    <div class="graph-actions">
                        <button id="graph-clear-all" class="graph-btn danger">
                            <i class="fas fa-trash"></i> Effacer tout
                        </button>
                        <button id="graph-save-config" class="graph-btn success">
                            <i class="fas fa-save"></i> Sauvegarder
                        </button>
                        <button id="graph-export-image" class="graph-btn secondary">
                            <i class="fas fa-download"></i> Exporter
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        this.graphControlPanel = panel;

        // Ajouter les styles pour les boutons preset
        this.addPresetButtonStyles();

        // Ajouter les événements
        this.setupGraphControlEvents();


        return panel;
    }

    /**
     * Ajoute les styles pour les boutons de fonctions prédéfinies et styles critiques du panneau
     */
    addPresetButtonStyles() {
        if (!document.getElementById('graph-preset-styles')) {
            const style = document.createElement('style');
            style.id = 'graph-preset-styles';
            style.textContent = `
                .preset-btn {
                    padding: 4px 8px;
                    border: 1px solid #d1d5db;
                    background: #f9fafb;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #374151;
                }
                .preset-btn:hover {
                    background: #e5e7eb;
                    border-color: #3b82f6;
                }
                .preset-btn:active {
                    transform: scale(0.95);
                }
            `;
            document.head.appendChild(style);
        }
        
        // S'assurer que les styles critiques du panneau graphique sont injectés
        this.ensureGraphPanelStyles();
    }

    /**
     * Injecte les styles critiques du panneau graphique si le CSS externe n'est pas disponible
     */
    ensureGraphPanelStyles() {
        if (!document.getElementById('graph-panel-critical-styles')) {
            const style = document.createElement('style');
            style.id = 'graph-panel-critical-styles';
            style.textContent = `
                .graph-control-panel {
                    position: fixed !important;
                    top: 50% !important;
                    right: 20px !important;
                    transform: translateY(-50%) !important;
                    width: 420px !important;
                    max-height: 80vh !important;
                    background: #ffffff !important;
                    border: 1px solid #e5e7eb !important;
                    border-radius: 12px !important;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
                    z-index: 999999 !important;
                    overflow: hidden !important;
                    display: block !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                }
                
                .graph-control-header {
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
                    color: white !important;
                    padding: 16px 20px !important;
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                }
                
                .graph-control-header h3 {
                    margin: 0 !important;
                    font-size: 16px !important;
                    font-weight: 600 !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                }
                
                .graph-control-close {
                    background: rgba(255, 255, 255, 0.2) !important;
                    border: none !important;
                    color: white !important;
                    width: 28px !important;
                    height: 28px !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: background-color 0.2s !important;
                }
                
                .graph-control-close:hover {
                    background: rgba(255, 255, 255, 0.3) !important;
                }
                
                .graph-control-content {
                    padding: 20px !important;
                    max-height: calc(80vh - 70px) !important;
                    overflow-y: auto !important;
                }
                
                .graph-section {
                    margin-bottom: 24px !important;
                }
                
                .graph-section:last-child {
                    margin-bottom: 0 !important;
                }
                
                .graph-section h4 {
                    margin: 0 0 12px 0 !important;
                    font-size: 14px !important;
                    font-weight: 600 !important;
                    color: #374151 !important;
                    padding-bottom: 8px !important;
                    border-bottom: 1px solid #f3f4f6 !important;
                }
                
                .axis-controls {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 12px !important;
                }
                
                .axis-row {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                }
                
                .axis-row label {
                    font-weight: 500 !important;
                    color: #4b5563 !important;
                    min-width: 50px !important;
                    font-size: 13px !important;
                }
                
                .axis-row input[type="number"] {
                    width: 70px !important;
                    padding: 6px 8px !important;
                    border: 1px solid #d1d5db !important;
                    border-radius: 6px !important;
                    font-size: 13px !important;
                    transition: border-color 0.2s !important;
                }
                
                .axis-row input[type="number"]:focus {
                    outline: none !important;
                    border-color: #3b82f6 !important;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                }
                
                .axis-row span {
                    color: #6b7280 !important;
                    font-size: 13px !important;
                }
                
                .function-controls {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 12px !important;
                }
                
                .function-input-row {
                    display: flex !important;
                    gap: 8px !important;
                    align-items: center !important;
                }
                
                .function-input-row input[type="text"] {
                    width: 240px !important;
                    padding: 8px 10px !important;
                    border: 1px solid #d1d5db !important;
                    border-radius: 6px !important;
                    font-size: 13px !important;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
                }
                
                .function-input-row input[type="text"]:focus {
                    outline: none !important;
                    border-color: #3b82f6 !important;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                }
                
                .function-input-row input[type="color"] {
                    width: 32px !important;
                    height: 32px !important;
                    border: 1px solid #d1d5db !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    background: none !important;
                    padding: 2px !important;
                }
                
                .functions-list {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 8px !important;
                    max-height: 200px !important;
                    overflow-y: auto !important;
                }
                
                .function-item {
                    display: flex !important;
                    align-items: center !important;
                    gap: 10px !important;
                    padding: 10px 12px !important;
                    background: #f8f9fa !important;
                    border: 1px solid #e9ecef !important;
                    border-radius: 6px !important;
                    transition: all 0.2s !important;
                }
                
                .function-item:hover {
                    background: #f1f3f4 !important;
                    border-color: #d1d5db !important;
                }
                
                .function-color {
                    width: 16px !important;
                    height: 16px !important;
                    border-radius: 3px !important;
                    border: 1px solid #d1d5db !important;
                    flex-shrink: 0 !important;
                }
                
                .function-expression {
                    flex: 1 !important;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
                    font-size: 12px !important;
                    color: #374151 !important;
                    word-break: break-all !important;
                }
                
                .function-delete {
                    background: #ef4444 !important;
                    border: none !important;
                    color: white !important;
                    width: 24px !important;
                    height: 24px !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: background-color 0.2s !important;
                    flex-shrink: 0 !important;
                }
                
                .function-delete:hover {
                    background: #dc2626 !important;
                }
                
                .function-color-picker {
                    width: 24px !important;
                    height: 24px !important;
                    border: 1px solid #d1d5db !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    background: none !important;
                    padding: 0 !important;
                    flex-shrink: 0 !important;
                }
                
                .graph-btn {
                    padding: 10px 16px !important;
                    border: none !important;
                    border-radius: 6px !important;
                    font-size: 13px !important;
                    font-weight: 500 !important;
                    cursor: pointer !important;
                    transition: all 0.2s !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 6px !important;
                    min-height: 36px !important;
                }
                
                .graph-btn.primary {
                    background: #3b82f6 !important;
                    color: white !important;
                }
                
                .graph-btn.primary:hover {
                    background: #2563eb !important;
                    transform: translateY(-1px) !important;
                }
                
                .graph-btn.secondary {
                    background: #6b7280 !important;
                    color: white !important;
                }
                
                .graph-btn.secondary:hover {
                    background: #4b5563 !important;
                }
                
                .graph-btn.success {
                    background: #10b981 !important;
                    color: white !important;
                }
                
                .graph-btn.success:hover {
                    background: #059669 !important;
                }
                
                .graph-btn.danger {
                    background: #ef4444 !important;
                    color: white !important;
                }
                
                .graph-btn.danger:hover {
                    background: #dc2626 !important;
                }
                
                .graph-actions {
                    display: flex !important;
                    gap: 8px !important;
                }
                
                .graph-actions .graph-btn {
                    flex: 1 !important;
                }
                
                /* === TAILLES PAR DÉFAUT RÉDUITES === */
                
                .btn-tool, .btn-annotation-tool {
                    width: 36px !important;
                    height: 36px !important;
                    font-size: 14px !important;
                }
                
                .color-btn {
                    width: 28px !important;
                    height: 28px !important;
                }
                
                .stroke-btn {
                    width: 32px !important;
                    height: 32px !important;
                }
                
                .pdf-annotation-toolbar {
                    padding: 0.75rem 1rem !important;
                    gap: 0.5rem !important;
                }
                
                /* === STYLES POUR LE MENU DE TÉLÉCHARGEMENT === */
                
                .download-menu-container {
                    position: relative !important;
                    display: inline-block !important;
                }
                
                .download-btn {
                    background: #3b82f6 !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 6px !important;
                    padding: 8px 12px !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.2s ease !important;
                    font-size: 14px !important;
                    width: 36px !important;
                    height: 36px !important;
                }
                
                .download-btn:hover {
                    background: #2563eb !important;
                    transform: translateY(-1px) !important;
                }
                
                .download-dropdown {
                    position: absolute !important;
                    top: 100% !important;
                    right: 0 !important;
                    background: white !important;
                    border: 1px solid #e5e7eb !important;
                    border-radius: 8px !important;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
                    z-index: 10000 !important;
                    min-width: 180px !important;
                    opacity: 0 !important;
                    visibility: hidden !important;
                    display: none !important;
                    pointer-events: none !important;
                    transform: translateY(-10px) !important;
                    transition: all 0.2s ease !important;
                    margin-top: 4px !important;
                }
                
                .download-dropdown.show {
                    opacity: 1 !important;
                    visibility: visible !important;
                    display: block !important;
                    pointer-events: auto !important;
                    transform: translateY(0) !important;
                }
                
                .download-option {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    padding: 12px 16px !important;
                    cursor: pointer !important;
                    transition: background-color 0.2s ease !important;
                    color: #374151 !important;
                    font-size: 14px !important;
                    border: none !important;
                    background: transparent !important;
                    width: 100% !important;
                    text-align: left !important;
                }
                
                .download-option:hover {
                    background: #f3f4f6 !important;
                }
                
                .download-option:first-child {
                    border-radius: 8px 8px 0 0 !important;
                }
                
                .download-option:last-child {
                    border-radius: 0 0 8px 8px !important;
                }
                
                .download-option i {
                    color: #6b7280 !important;
                    width: 16px !important;
                    text-align: center !important;
                }
                
                .download-option span {
                    flex: 1 !important;
                }
                
                /* === STYLES POUR LA SECTION SUIVI ÉLÈVE === */
                
                .student-tracking-section {
                    display: flex !important;
                    gap: var(--spacing-xs) !important;
                    margin-left: var(--spacing-md) !important;
                    padding-left: var(--spacing-md) !important;
                    border-left: 1px solid var(--border-color) !important;
                }
                
                .student-tracking-section .btn-tool {
                    background: #10b981 !important;
                    color: white !important;
                    border-color: #059669 !important;
                }
                
                .student-tracking-section .btn-tool:hover {
                    background: #059669 !important;
                    transform: translateY(-1px) !important;
                }
                
                /* === RESPONSIVE TOOLBAR === */
                
                /* Écrans moyens (tablettes) */
                @media (max-width: 1200px) {
                    .pdf-annotation-toolbar {
                        padding: 0.5rem 0.75rem !important;
                        gap: 0.5rem !important;
                    }
                    
                    .btn-tool, .btn-annotation-tool, .download-btn {
                        width: 36px !important;
                        height: 36px !important;
                        font-size: 13px !important;
                    }
                    
                    .color-btn {
                        width: 28px !important;
                        height: 28px !important;
                    }
                    
                    .stroke-btn {
                        width: 32px !important;
                        height: 32px !important;
                    }
                    
                    .student-tracking-section {
                        margin-left: 0.5rem !important;
                        padding-left: 0.5rem !important;
                    }
                }
                
                /* Écrans petits (mobiles large) */
                @media (max-width: 768px) {
                    .pdf-annotation-toolbar {
                        padding: 0.375rem 0.5rem !important;
                        gap: 0.25rem !important;
                        flex-wrap: wrap !important;
                        min-height: auto !important;
                    }
                    
                    .btn-tool, .btn-annotation-tool, .download-btn {
                        width: 32px !important;
                        height: 32px !important;
                        font-size: 12px !important;
                    }
                    
                    .color-btn {
                        width: 24px !important;
                        height: 24px !important;
                    }
                    
                    .stroke-btn {
                        width: 28px !important;
                        height: 28px !important;
                    }
                    
                    .annotation-tools, .color-palette {
                        gap: 0.25rem !important;
                    }
                    
                    .stroke-options {
                        gap: 0.25rem !important;
                    }
                    
                    .student-tracking-section {
                        margin-left: 0.25rem !important;
                        padding-left: 0.25rem !important;
                    }
                    
                    /* Forcer l'affichage sur une ligne */
                    .pdf-annotation-toolbar > * {
                        flex-shrink: 1 !important;
                    }
                }
                
                /* Très petits écrans (mobiles) */
                @media (max-width: 480px) {
                    .pdf-annotation-toolbar {
                        padding: 0.25rem !important;
                        gap: 0.125rem !important;
                    }
                    
                    .btn-tool, .btn-annotation-tool, .download-btn {
                        width: 28px !important;
                        height: 28px !important;
                        font-size: 11px !important;
                    }
                    
                    .color-btn {
                        width: 20px !important;
                        height: 20px !important;
                    }
                    
                    .stroke-btn {
                        width: 24px !important;
                        height: 24px !important;
                    }
                    
                    .annotation-tools {
                        gap: 0.125rem !important;
                    }
                    
                    .color-palette {
                        gap: 0.125rem !important;
                    }
                    
                    .stroke-options {
                        gap: 0.125rem !important;
                    }
                    
                    .student-tracking-section {
                        margin-left: 0.125rem !important;
                        padding-left: 0.125rem !important;
                        border-left: none !important;
                    }
                    
                    .annotation-actions {
                        gap: 0.125rem !important;
                    }
                }
                
                /* Écrans très larges - juste un peu plus d'espace */
                @media (min-width: 1400px) {
                    .pdf-annotation-toolbar {
                        padding: 0.875rem 1.25rem !important;
                        gap: 0.75rem !important;
                    }
                    
                    .btn-tool, .btn-annotation-tool, .download-btn {
                        width: 40px !important;
                        height: 40px !important;
                        font-size: 15px !important;
                    }
                    
                    .color-btn {
                        width: 30px !important;
                        height: 30px !important;
                    }
                    
                    .stroke-btn {
                        width: 34px !important;
                        height: 34px !important;
                    }
                }
                
                /* Mode compact dynamique */
                .pdf-annotation-toolbar.compact {
                    padding: 0.5rem 0.75rem !important;
                    gap: 0.375rem !important;
                }
                
                .pdf-annotation-toolbar.compact .btn-tool,
                .pdf-annotation-toolbar.compact .btn-annotation-tool,
                .pdf-annotation-toolbar.compact .download-btn {
                    width: 32px !important;
                    height: 32px !important;
                    font-size: 13px !important;
                }
                
                .pdf-annotation-toolbar.compact .color-btn {
                    width: 26px !important;
                    height: 26px !important;
                }
                
                .pdf-annotation-toolbar.compact .stroke-btn {
                    width: 30px !important;
                    height: 30px !important;
                }
                
                .pdf-annotation-toolbar.compact .annotation-tools,
                .pdf-annotation-toolbar.compact .color-palette,
                .pdf-annotation-toolbar.compact .stroke-options,
                .pdf-annotation-toolbar.compact .annotation-actions {
                    gap: 0.25rem !important;
                }
                
                .pdf-annotation-toolbar.compact .student-tracking-section {
                    margin-left: 0.25rem !important;
                    padding-left: 0.25rem !important;
                }
                
                /* Mode très compact */
                .pdf-annotation-toolbar.very-compact {
                    padding: 0.25rem 0.375rem !important;
                    gap: 0.2rem !important;
                }
                
                .pdf-annotation-toolbar.very-compact .btn-tool,
                .pdf-annotation-toolbar.very-compact .btn-annotation-tool,
                .pdf-annotation-toolbar.very-compact .download-btn {
                    width: 28px !important;
                    height: 28px !important;
                    font-size: 11px !important;
                }
                
                .pdf-annotation-toolbar.very-compact .color-btn {
                    width: 20px !important;
                    height: 20px !important;
                }
                
                .pdf-annotation-toolbar.very-compact .stroke-btn {
                    width: 24px !important;
                    height: 24px !important;
                }
                
                .pdf-annotation-toolbar.very-compact .annotation-tools,
                .pdf-annotation-toolbar.very-compact .color-palette,
                .pdf-annotation-toolbar.very-compact .stroke-options,
                .pdf-annotation-toolbar.very-compact .annotation-actions {
                    gap: 0.15rem !important;
                }
                
                .pdf-annotation-toolbar.very-compact .student-tracking-section {
                    margin-left: 0.15rem !important;
                    padding-left: 0.15rem !important;
                }
                
                /* Mode ultra-compact */
                .pdf-annotation-toolbar.ultra-compact {
                    padding: 0.2rem !important;
                    gap: 0.1rem !important;
                    flex-wrap: wrap !important;
                    min-height: auto !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .btn-tool,
                .pdf-annotation-toolbar.ultra-compact .btn-annotation-tool,
                .pdf-annotation-toolbar.ultra-compact .download-btn {
                    width: 24px !important;
                    height: 24px !important;
                    font-size: 10px !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .color-btn {
                    width: 18px !important;
                    height: 18px !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .stroke-btn {
                    width: 20px !important;
                    height: 20px !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .annotation-tools,
                .pdf-annotation-toolbar.ultra-compact .color-palette,
                .pdf-annotation-toolbar.ultra-compact .stroke-options,
                .pdf-annotation-toolbar.ultra-compact .annotation-actions {
                    gap: 0.1rem !important;
                }
                
                .pdf-annotation-toolbar.ultra-compact .student-tracking-section {
                    margin-left: 0.1rem !important;
                    padding-left: 0.1rem !important;
                    border-left: none !important;
                }
                
                /* Permettre au texte des tooltips d'être plus petit en mode ultra-compact */
                .pdf-annotation-toolbar.ultra-compact [title]:hover::after {
                    font-size: 10px !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Configure les événements pour l'interface graphique
     */
    setupGraphControlEvents() {
        if (!this.graphControlPanel) return;

        const panel = this.graphControlPanel;

        // Stocker les références aux handlers pour pouvoir les supprimer
        if (!this.graphEventHandlers) {
            this.graphEventHandlers = {};
        }

        // Fermer le panneau
        const closeBtn = panel.querySelector('.graph-control-close');
        if (closeBtn) {
            if (this.graphEventHandlers.close) {
                closeBtn.removeEventListener('click', this.graphEventHandlers.close);
            }
            this.graphEventHandlers.close = () => this.hideGraphControlPanel();
            closeBtn.addEventListener('click', this.graphEventHandlers.close);
        }

        // Appliquer les nouveaux axes
        const applyBtn = panel.querySelector('#graph-apply-axes');
        if (applyBtn) {
            if (this.graphEventHandlers.apply) {
                applyBtn.removeEventListener('click', this.graphEventHandlers.apply);
            }
            this.graphEventHandlers.apply = () => this.applyAxisLimits();
            applyBtn.addEventListener('click', this.graphEventHandlers.apply);
        }

        // Reset des axes
        const resetBtn = panel.querySelector('#graph-reset-axes');
        if (resetBtn) {
            if (this.graphEventHandlers.reset) {
                resetBtn.removeEventListener('click', this.graphEventHandlers.reset);
            }
            this.graphEventHandlers.reset = () => this.resetAxisLimits();
            resetBtn.addEventListener('click', this.graphEventHandlers.reset);
        }

        // Ajouter une fonction
        const addBtn = panel.querySelector('#graph-add-function');
        if (addBtn) {
            if (this.graphEventHandlers.addFunction) {
                addBtn.removeEventListener('click', this.graphEventHandlers.addFunction);
            }
            this.graphEventHandlers.addFunction = () => this.addMathFunction();
            addBtn.addEventListener('click', this.graphEventHandlers.addFunction);
        }

        // Entrée fonction avec Entrée
        const functionInput = panel.querySelector('#graph-function-input');
        if (functionInput) {
            if (this.graphEventHandlers.functionKeydown) {
                functionInput.removeEventListener('keydown', this.graphEventHandlers.functionKeydown);
            }
            this.graphEventHandlers.functionKeydown = (e) => {
                if (e.key === 'Enter') {
                    this.addMathFunction();
                }
            };
            functionInput.addEventListener('keydown', this.graphEventHandlers.functionKeydown);
        }

        // Boutons de fonctions prédéfinies
        panel.querySelectorAll('.preset-btn').forEach((btn, index) => {
            // Supprimer l'ancien event listener s'il existe
            const handlerKey = `preset_${index}`;
            if (this.graphEventHandlers[handlerKey]) {
                btn.removeEventListener('click', this.graphEventHandlers[handlerKey]);
            }
            
            // Créer et stocker le nouveau handler
            this.graphEventHandlers[handlerKey] = () => {
                const functionExpr = btn.dataset.function;
                document.getElementById('graph-function-input').value = functionExpr;
                this.addMathFunction();
            };
            
            btn.addEventListener('click', this.graphEventHandlers[handlerKey]);
        });

        // Événements en temps réel pour les axes
        panel.querySelectorAll('input[type="number"]').forEach((input, index) => {
            const handlerKey = `numberInput_${index}`;
            if (this.graphEventHandlers[handlerKey]) {
                input.removeEventListener('input', this.graphEventHandlers[handlerKey]);
            }
            
            this.graphEventHandlers[handlerKey] = () => {
                if (this.realTimePreview) {
                    clearTimeout(this.realTimePreview);
                }
                this.realTimePreview = setTimeout(() => {
                    this.applyAxisLimits();
                }, 500);
            };
            
            input.addEventListener('input', this.graphEventHandlers[handlerKey]);
        });

        // Effacer tout
        const clearBtn = panel.querySelector('#graph-clear-all');
        if (clearBtn) {
            if (this.graphEventHandlers.clearAll) {
                clearBtn.removeEventListener('click', this.graphEventHandlers.clearAll);
            }
            this.graphEventHandlers.clearAll = () => this.clearAllFunctions();
            clearBtn.addEventListener('click', this.graphEventHandlers.clearAll);
        }

        // Sauvegarder
        const saveBtn = panel.querySelector('#graph-save-config');
        if (saveBtn) {
            if (this.graphEventHandlers.saveConfig) {
                saveBtn.removeEventListener('click', this.graphEventHandlers.saveConfig);
            }
            this.graphEventHandlers.saveConfig = () => this.saveGraphConfiguration();
            saveBtn.addEventListener('click', this.graphEventHandlers.saveConfig);
        }

        // Exporter image
        const exportBtn = panel.querySelector('#graph-export-image');
        if (exportBtn) {
            if (this.graphEventHandlers.exportImage) {
                exportBtn.removeEventListener('click', this.graphEventHandlers.exportImage);
            }
            this.graphEventHandlers.exportImage = () => this.exportGraphAsImage();
            exportBtn.addEventListener('click', this.graphEventHandlers.exportImage);
        }
    }

    /**
     * Affiche le panneau de contrôle graphique
     */
    showGraphControlPanel(pageNumber) {
        if (!this.isCurrentPageGraph(pageNumber)) {
            return;
        }

        this.currentGraphPage = pageNumber;
        
        // Si le panneau existe déjà et est masqué, le réafficher
        if (this.graphControlPanel && this.graphControlPanel.style.display === 'none') {
            this.loadGraphConfigToPanel(pageNumber);
            // Reconfigurer les événements au cas où ils seraient perdus
            this.setupGraphControlEvents();
        } else {
            // Sinon, créer un nouveau panneau
            this.createGraphControlPanel();
            this.loadGraphConfigToPanel(pageNumber);
        }
        
        // S'assurer que le panneau est visible (les styles CSS sont maintenant injectés automatiquement)
        this.graphControlPanel.style.display = 'block';
        this.graphControlPanel.style.opacity = '1';
        this.graphControlPanel.style.pointerEvents = 'auto'; // Réactiver les interactions
        this.graphControlPanel.dataset.closing = 'false'; // Marquer comme ouvert
        
        // Vérifier que le panneau est bien dans le DOM
        if (!document.body.contains(this.graphControlPanel)) {
            document.body.appendChild(this.graphControlPanel);
        }
        
        // Animation d'entrée fluide
        this.graphControlPanel.style.transform = 'translateY(-50%) translateX(20px)';
        this.graphControlPanel.style.opacity = '0';
        
        // Forcer le reflow pour appliquer l'état initial
        this.graphControlPanel.offsetHeight;
        
        // Appliquer l'animation
        this.graphControlPanel.style.transition = 'all 0.3s ease';
        this.graphControlPanel.style.transform = 'translateY(-50%) translateX(0)';
        this.graphControlPanel.style.opacity = '1';
        
        
        // S'assurer que le scroll n'est pas bloqué lors de l'ouverture
        this.forceRestoreScrolling();
        
        // Masquer tous les boutons graphiques quand le panneau est ouvert
        this.updateAllGraphButtonsVisibility();
        
        this.showGraphMessage('Panneau de configuration ouvert', 'info');
    }

    /**
     * Vérifie si le panneau est visible
     */
    isPanelVisible() {
        if (!this.graphControlPanel) return false;
        
        const rect = this.graphControlPanel.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && 
                         rect.top >= 0 && rect.left >= 0 &&
                         rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
        
        return isVisible;
    }

    /**
     * Crée un panneau de secours avec styles inline complets
     */
    createFallbackPanel() {
        // Supprimer l'ancien panneau
        if (this.graphControlPanel) {
            this.graphControlPanel.remove();
        }

        // Créer un panneau de secours simple
        const fallbackPanel = document.createElement('div');
        fallbackPanel.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                right: 20px;
                transform: translateY(-50%);
                width: 320px;
                background: white;
                border: 2px solid #3b82f6;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 99999;
                font-family: Arial, sans-serif;
            ">
                <div style="
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    color: white;
                    padding: 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h3 style="margin: 0; font-size: 16px;">📊 Configuration du graphique</h3>
                    <button onclick="this.closest('div').remove()" style="
                        background: rgba(255,255,255,0.2);
                        border: none;
                        color: white;
                        width: 24px;
                        height: 24px;
                        border-radius: 4px;
                        cursor: pointer;
                    ">×</button>
                </div>
                <div style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                    <div style="margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 14px;">Limites des axes</h4>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                            <label style="width: 40px; font-size: 13px;">X:</label>
                            <input type="number" value="-15" step="0.1" style="flex: 1; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
                            <span style="color: #6b7280;">à</span>
                            <input type="number" value="15" step="0.1" style="flex: 1; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
                        </div>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                            <label style="width: 40px; font-size: 13px;">Y:</label>
                            <input type="number" value="-15" step="0.1" style="flex: 1; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
                            <span style="color: #6b7280;">à</span>
                            <input type="number" value="15" step="0.1" style="flex: 1; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
                        </div>
                        <button onclick="alert('Axes appliqués!')" style="
                            background: #3b82f6;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            margin-right: 8px;
                        ">Appliquer</button>
                        <button onclick="alert('Axes reset!')" style="
                            background: #6b7280;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                        ">Reset</button>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 14px;">Fonctions</h4>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" placeholder="Ex: x^2, sin(x)" style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px;">
                            <input type="color" value="#ff0000" style="width: 40px; height: 36px; border: 1px solid #d1d5db; border-radius: 4px;">
                            <button onclick="alert('Fonction ajoutée!')" style="
                                background: #3b82f6;
                                color: white;
                                border: none;
                                padding: 8px 12px;
                                border-radius: 4px;
                                cursor: pointer;
                            ">+</button>
                        </div>
                        <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; font-size: 12px; color: #666;">
                            Fonctions: x, x^2, sin(x), cos(x), log(x), sqrt(x), abs(x)
                        </div>
                    </div>
                    
                    <div>
                        <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 14px;">Actions</h4>
                        <button onclick="alert('Sauvegardé!')" style="
                            background: #10b981;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            margin-right: 8px;
                        ">💾 Sauvegarder</button>
                        <button onclick="alert('Exporté!')" style="
                            background: #6b7280;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                        ">📥 Exporter</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(fallbackPanel);
        this.graphControlPanel = fallbackPanel;
        
    }

    /**
     * Masque le panneau de contrôle graphique avec animation
     */
    hideGraphControlPanel() {
        if (this.graphControlPanel) {
            // Marquer immédiatement le panneau comme fermé pour les vérifications de visibilité
            this.graphControlPanel.dataset.closing = 'true';
            
            // Bloquer immédiatement les interactions avec le panneau
            this.graphControlPanel.style.pointerEvents = 'none';
            
            // FORCER la restauration complète du scroll immédiatement
            this.forceRestoreScrolling();
            
            // Animation de sortie
            this.graphControlPanel.style.transition = 'all 0.3s ease';
            this.graphControlPanel.style.transform = 'translateY(-50%) translateX(20px)';
            this.graphControlPanel.style.opacity = '0';
            
            // Masquer après l'animation
            setTimeout(() => {
                if (this.graphControlPanel) {
                    this.graphControlPanel.style.display = 'none';
                    this.graphControlPanel.style.transform = '';
                    this.graphControlPanel.dataset.closing = 'false';
                    
                    // DOUBLE VÉRIFICATION - forcer à nouveau la restauration
                    this.forceRestoreScrolling();
                }
                // Mettre à jour les boutons après que l'animation soit complète
                this.updateAllGraphButtonsVisibility();
            }, 300);
            
            // TRIPLE VÉRIFICATION après un délai supplémentaire
            setTimeout(() => {
                this.forceRestoreScrolling();
                // Forcer une réinitialisation complète des événements
                setTimeout(() => {
                    // Supprimer complètement l'ancien handler et le recréer
                    if (this.downloadClickHandler) {
                        document.removeEventListener('click', this.downloadClickHandler, true);
                        this.downloadClickHandler = null;
                    }
                    this.initDownloadButton();
                }, 200);
            }, 500);
            
        }
        // NE PAS mettre currentGraphPage à null ici pour permettre la réouverture
        // this.currentGraphPage = null;
        
        // Afficher les boutons graphiques immédiatement (panneau marqué comme fermé)
        this.updateAllGraphButtonsVisibility();
    }

    /**
     * Force la restauration complète du scrolling
     */
    forceRestoreScrolling() {
        // Nettoyer tous les styles qui pourraient bloquer le scroll
        document.body.style.overflow = '';
        document.body.style.overflowY = '';
        document.body.style.overflowX = '';
        document.body.style.position = '';
        document.body.style.height = '';
        document.body.style.width = '';
        document.body.style.touchAction = '';
        
        document.documentElement.style.overflow = '';
        document.documentElement.style.overflowY = '';
        document.documentElement.style.overflowX = '';
        document.documentElement.style.position = '';
        document.documentElement.style.height = '';
        document.documentElement.style.width = '';
        document.documentElement.style.touchAction = '';
        
        // Restaurer les événements sur le container principal
        if (this.container) {
            this.container.style.pointerEvents = '';
            this.container.style.overflow = '';
            this.container.style.overflowY = '';
            this.container.style.position = '';
            this.container.style.height = '';
            this.container.style.width = '';
            this.container.style.touchAction = '';
        }
        
        // Restaurer les événements sur tous les canvas d'annotation
        const annotationCanvases = this.container.querySelectorAll('.annotation-canvas');
        annotationCanvases.forEach(canvas => {
            canvas.style.pointerEvents = '';
            canvas.style.touchAction = '';
            canvas.style.userSelect = '';
        });
        
        // Nettoyer les overlays invisibles qui pourraient bloquer les interactions
        const panels = document.querySelectorAll('.graph-control-panel');
        panels.forEach(panel => {
            if (panel.style.display === 'none' || panel.dataset.closing === 'true') {
                panel.style.pointerEvents = 'none';
                panel.style.zIndex = '-1';
            }
        });
        
        // Nettoyer seulement les menus déroulants orphelins (sans parent visible)
        const dropdowns = document.querySelectorAll('#download-dropdown-menu, .download-dropdown, #download-dropdown-container');
        dropdowns.forEach(dropdown => {
            // Ne supprimer que si le menu semble orphelin ou mal positionné
            const rect = dropdown.getBoundingClientRect();
            if (rect.top < -1000 || rect.top > window.innerHeight + 1000) {
                dropdown.remove();
            }
        });
        
        // S'assurer que la barre d'outils est interactive
        const toolbar = document.querySelector('.pdf-toolbar');
        if (toolbar) {
            toolbar.style.pointerEvents = 'auto';
            toolbar.style.zIndex = '';
        }
        
        // Supprimer les classes qui pourraient bloquer le scroll
        document.body.classList.remove('no-scroll', 'modal-open', 'overflow-hidden');
        document.documentElement.classList.remove('no-scroll', 'modal-open', 'overflow-hidden');
        
        // Ne plus réinitialiser le bouton de téléchargement ici pour éviter les conflits
        // setTimeout(() => {
        //     this.initDownloadButton();
        // }, 100);
        
    }

    /**
     * Vérifie si une page est une page graphique
     */
    isCurrentPageGraph(pageNumber) {
        const pageSequence = this.createPageSequence();
        const pageInfo = pageSequence[pageNumber - 1];
        
        if (pageInfo && pageInfo.isBlank && pageInfo.id) {
            const pageData = this.addedPages.get(pageInfo.id);
            return pageData?.isGraph === true;
        }
        return false;
    }

    /**
     * Charge la configuration graphique dans le panneau
     */
    loadGraphConfigToPanel(pageNumber) {
        const pageSequence = this.createPageSequence();
        const pageInfo = pageSequence[pageNumber - 1];
        
        if (pageInfo && pageInfo.isBlank && pageInfo.id) {
            const pageData = this.addedPages.get(pageInfo.id);
            const config = pageData?.graphConfig;
            
            if (config) {
                document.getElementById('graph-x-min').value = config.xMin || -15;
                document.getElementById('graph-x-max').value = config.xMax || 15;
                document.getElementById('graph-y-min').value = config.yMin || -15;
                document.getElementById('graph-y-max').value = config.yMax || 15;
                document.getElementById('graph-grid-size').value = config.gridSize || 1;
                
                this.updateFunctionsList(config.functions || []);
            }
        }
    }

    /**
     * Applique les nouvelles limites des axes
     */
    applyAxisLimits() {
        if (!this.currentGraphPage) return;

        const xMin = parseFloat(document.getElementById('graph-x-min').value);
        const xMax = parseFloat(document.getElementById('graph-x-max').value);
        const yMin = parseFloat(document.getElementById('graph-y-min').value);
        const yMax = parseFloat(document.getElementById('graph-y-max').value);
        const gridSize = parseFloat(document.getElementById('graph-grid-size').value) || 1;

        // Validation améliorée
        if (isNaN(xMin) || isNaN(xMax) || isNaN(yMin) || isNaN(yMax)) {
            this.showGraphMessage('Veuillez entrer des valeurs numériques valides.', 'error');
            return;
        }

        if (xMin >= xMax || yMin >= yMax) {
            this.showGraphMessage('Les valeurs minimales doivent être inférieures aux maximales.', 'error');
            return;
        }

        if (Math.abs(xMax - xMin) < 0.1 || Math.abs(yMax - yMin) < 0.1) {
            this.showGraphMessage('L\'intervalle des axes est trop petit (minimum 0.1).', 'error');
            return;
        }

        this.updateGraphConfig(this.currentGraphPage, { xMin, xMax, yMin, yMax, gridSize });
        this.redrawCurrentGraphPage();
        
        this.showGraphMessage('Axes mis à jour avec succès!', 'success');
    }

    /**
     * Remet les axes à leurs valeurs par défaut
     */
    resetAxisLimits() {
        document.getElementById('graph-x-min').value = '-15';
        document.getElementById('graph-x-max').value = '15';
        document.getElementById('graph-y-min').value = '-15';
        document.getElementById('graph-y-max').value = '15';
        document.getElementById('graph-grid-size').value = '1';
        
        this.applyAxisLimits();
    }

    /**
     * Affiche un message dans l'interface graphique
     */
    showGraphMessage(message, type = 'info') {
        // Supprimer le message précédent s'il existe
        const existingMessage = document.querySelector('.graph-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Créer le nouveau message
        const messageDiv = document.createElement('div');
        messageDiv.className = `graph-message ${type}`;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            z-index: 1001;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transition: all 0.3s ease;
        `;

        // Couleurs selon le type
        const colors = {
            success: { bg: '#10b981', color: 'white' },
            error: { bg: '#ef4444', color: 'white' },
            warning: { bg: '#f59e0b', color: 'white' },
            info: { bg: '#3b82f6', color: 'white' }
        };

        const color = colors[type] || colors.info;
        messageDiv.style.backgroundColor = color.bg;
        messageDiv.style.color = color.color;
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        // Supprimer automatiquement après 3 secondes
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.style.opacity = '0';
                messageDiv.style.transform = 'translateX(100%)';
                setTimeout(() => messageDiv.remove(), 300);
            }
        }, 3000);
    }

    /**
     * Ajoute une fonction mathématique
     */
    addMathFunction() {
        const input = document.getElementById('graph-function-input');
        const colorInput = document.getElementById('graph-function-color');
        const expression = input.value.trim();
        
        if (!expression) {
            this.showGraphMessage('Veuillez entrer une expression mathématique.', 'warning');
            return;
        }

        // Test de validation amélioré
        try {
            const testResults = [];
            for (let x = -1; x <= 1; x += 0.5) {
                const result = this.evaluateFunction(expression, x);
                testResults.push(result);
            }
            
            // Vérifier qu'au moins une valeur est valide
            if (testResults.every(r => isNaN(r) || !isFinite(r))) {
                throw new Error('Aucun résultat valide pour les valeurs de test');
            }
        } catch (error) {
            this.showGraphMessage(`Expression invalide: ${error.message || 'Vérifiez la syntaxe'}`, 'error');
            return;
        }

        const func = {
            expression,
            color: colorInput.value,
            id: Date.now()
        };

        this.addFunctionToGraph(this.currentGraphPage, func);
        this.redrawCurrentGraphPage();
        
        // Vider le champ et générer nouvelle couleur
        input.value = '';
        colorInput.value = this.generateRandomColor();
        
        this.showGraphMessage(`Fonction "${expression}" ajoutée avec succès!`, 'success');
    }

    /**
     * Met à jour la configuration d'un graphique
     */
    updateGraphConfig(pageNumber, newConfig) {
        const pageSequence = this.createPageSequence();
        const pageInfo = pageSequence[pageNumber - 1];
        
        if (pageInfo && pageInfo.isBlank && pageInfo.id) {
            const pageData = this.addedPages.get(pageInfo.id);
            if (pageData?.graphConfig) {
                Object.assign(pageData.graphConfig, newConfig);
                // Sauvegarder automatiquement après modification de configuration
                this.scheduleAutoSave();
            }
        }
    }

    /**
     * Ajoute une fonction à un graphique
     */
    addFunctionToGraph(pageNumber, func) {
        const pageSequence = this.createPageSequence();
        const pageInfo = pageSequence[pageNumber - 1];
        
        if (pageInfo && pageInfo.isBlank && pageInfo.id) {
            const pageData = this.addedPages.get(pageInfo.id);
            if (pageData?.graphConfig) {
                pageData.graphConfig.functions.push(func);
                this.updateFunctionsList(pageData.graphConfig.functions);
                // Sauvegarder automatiquement après ajout de fonction
                this.scheduleAutoSave();
            }
        }
    }

    /**
     * Met à jour l'affichage de la liste des fonctions
     */
    updateFunctionsList(functions) {
        const list = document.getElementById('graph-functions-list');
        if (!list) return;

        if (functions.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: #6b7280; font-style: italic; padding: 20px;">Aucune fonction ajoutée</div>';
            return;
        }

        list.innerHTML = functions.map((func, index) => `
            <div class="function-item" data-id="${func.id}">
                <div class="function-color" style="background-color: ${func.color}" title="Couleur: ${func.color}"></div>
                <span class="function-expression" title="${func.expression}">${func.expression}</span>
                <input type="color" class="function-color-picker" value="${func.color}" data-id="${func.id}" title="Changer la couleur">
                <button class="function-delete" data-id="${func.id}" title="Supprimer cette fonction">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

        // Ajouter les événements pour les nouvelles fonctions
        this.setupFunctionListEvents();
    }

    /**
     * Configure les événements pour la liste des fonctions
     */
    setupFunctionListEvents() {
        const list = document.getElementById('graph-functions-list');
        if (!list) return;

        // Événements de suppression
        list.querySelectorAll('.function-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const functionId = parseInt(e.target.closest('[data-id]').dataset.id);
                this.removeFunction(functionId);
            });
        });

        // Événements de changement de couleur
        list.querySelectorAll('.function-color-picker').forEach(picker => {
            picker.addEventListener('change', (e) => {
                const functionId = parseInt(e.target.dataset.id);
                const newColor = e.target.value;
                this.changeFunctionColor(functionId, newColor);
            });
        });
    }

    /**
     * Supprime une fonction du graphique
     */
    removeFunction(functionId) {
        const pageSequence = this.createPageSequence();
        const pageInfo = pageSequence[this.currentGraphPage - 1];
        
        if (pageInfo && pageInfo.isBlank && pageInfo.id) {
            const pageData = this.addedPages.get(pageInfo.id);
            if (pageData?.graphConfig?.functions) {
                const functionIndex = pageData.graphConfig.functions.findIndex(f => f.id === functionId);
                if (functionIndex !== -1) {
                    const removedFunction = pageData.graphConfig.functions.splice(functionIndex, 1)[0];
                    this.updateFunctionsList(pageData.graphConfig.functions);
                    this.redrawCurrentGraphPage();
                    this.showGraphMessage(`Fonction "${removedFunction.expression}" supprimée`, 'info');
                    // Sauvegarder automatiquement après suppression de fonction
                    this.scheduleAutoSave();
                }
            }
        }
    }

    /**
     * Change la couleur d'une fonction
     */
    changeFunctionColor(functionId, newColor) {
        const pageSequence = this.createPageSequence();
        const pageInfo = pageSequence[this.currentGraphPage - 1];
        
        if (pageInfo && pageInfo.isBlank && pageInfo.id) {
            const pageData = this.addedPages.get(pageInfo.id);
            if (pageData?.graphConfig?.functions) {
                const func = pageData.graphConfig.functions.find(f => f.id === functionId);
                if (func) {
                    func.color = newColor;
                    // Mettre à jour l'affichage de la couleur dans l'interface
                    const colorDiv = document.querySelector(`.function-item[data-id="${functionId}"] .function-color`);
                    if (colorDiv) {
                        colorDiv.style.backgroundColor = newColor;
                    }
                    this.redrawCurrentGraphPage();
                    // Sauvegarder automatiquement après changement de couleur
                    this.scheduleAutoSave();
                }
            }
        }
    }

    /**
     * Redessine la page graphique actuelle
     */
    redrawCurrentGraphPage() {
        if (!this.currentGraphPage) return;

        const pageElement = this.pageElements.get(this.currentGraphPage);
        if (!pageElement) return;

        const pageSequence = this.createPageSequence();
        const pageInfo = pageSequence[this.currentGraphPage - 1];
        
        if (pageInfo && pageInfo.isBlank && pageInfo.id) {
            const pageData = this.addedPages.get(pageInfo.id);
            if (pageData?.isGraph && pageData.graphConfig) {
                // Effacer le canvas et redessiner
                const ctx = pageElement.ctx;
                const { width, height } = pageElement.viewport;
                
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 1;
                ctx.strokeRect(0, 0, width, height);
                
                this.drawGraph(ctx, width, height, pageData.graphConfig);
                
                // Ajouter le bouton de contrôle graphique
                this.addGraphControlButton(pageElement.container, this.currentGraphPage);
            }
        }
        
        // Réinitialiser les événements du bouton téléchargement après redraw
        this.initDownloadButton();
    }

    /**
     * Ajoute un bouton de contrôle graphique sur la page
     */
    addGraphControlButton(pageContainer, pageNumber) {
        
        // Supprimer le bouton existant s'il y en a un
        const existingButton = pageContainer.querySelector('.graph-control-btn');
        if (existingButton && existingButton.parentNode) {
            existingButton.parentNode.removeChild(existingButton);
        }

        // Créer le bouton de contrôle
        const controlButton = document.createElement('button');
        controlButton.className = 'graph-control-btn';
        controlButton.innerHTML = '<i class="fas fa-cog"></i> Configurer';
        controlButton.title = 'Ouvrir les paramètres du graphique (Raccourci: G)';
        
        // Styles inline pour s'assurer qu'ils s'appliquent
        controlButton.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            border: none;
            border-radius: 6px;
            padding: 6px 8px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            z-index: 999;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 3px;
            pointer-events: auto;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            width: 80px;
            height: 28px;
            justify-content: center;
        `;

        // Événement au survol
        controlButton.addEventListener('mouseenter', () => {
            controlButton.style.transform = 'translateY(-1px)';
            controlButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        });

        controlButton.addEventListener('mouseleave', () => {
            controlButton.style.transform = 'translateY(0)';
            controlButton.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
        });

        // Événement de clic - Test simplifié
        controlButton.onclick = (e) => {
            this.showGraphControlPanel(pageNumber);
            return false; // Empêche la propagation
        };

        // Événement alternatif avec addEventListener
        controlButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showGraphControlPanel(pageNumber);
        }, true); // Utiliser la phase de capture

        // Test avec mousedown pour vérifier que le bouton répond
        controlButton.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        // Test avec mouseup pour confirmer l'interaction
        controlButton.addEventListener('mouseup', (e) => {
            e.stopPropagation();
        });

        // Ajouter le bouton au container de la page pour position absolue
        pageContainer.appendChild(controlButton);
        
        // Positionner le bouton par rapport à la page et gérer sa visibilité
        const updateButtonPosition = () => {
            const pageRect = pageContainer.getBoundingClientRect();
            
            // Position absolue fixe sur la page - toujours visible si c'est une page graphique
            const buttonWidth = 80;
            const buttonHeight = 28;
            
            // Position absolue par rapport à la page, pas au viewport
            controlButton.style.position = 'absolute';
            controlButton.style.top = '15px'; // Position fixe sur la page
            controlButton.style.right = '15px'; // Position fixe sur la page
            controlButton.style.zIndex = '99999';
            
            // Vérifier si le bouton doit être visible (seulement basé sur les règles métier)
            const shouldBeVisible = this.shouldShowGraphButton(pageNumber);
            controlButton.style.display = shouldBeVisible ? 'flex' : 'none';
            
        };
        
        // Positionner initialement
        updateButtonPosition();
        
        // Repositionner lors du scroll et changement de page
        const scrollHandler = () => updateButtonPosition();
        window.addEventListener('scroll', scrollHandler);
        
        // Écouter les changements de page courante pour masquer/afficher le bouton
        this.container.addEventListener('page-changed', scrollHandler);
        
        // Stocker la référence du bouton pour pouvoir le gérer depuis d'autres méthodes
        if (!this.graphButtons) {
            this.graphButtons = new Map();
        }
        this.graphButtons.set(pageNumber, {
            button: controlButton,
            updatePosition: updateButtonPosition,
            cleanup: () => {
                window.removeEventListener('scroll', scrollHandler);
                this.container.removeEventListener('page-changed', scrollHandler);
            }
        });
        
        // Nettoyer les événements si le bouton est supprimé
        const viewer = this;
        const originalRemove = controlButton.remove;
        controlButton.remove = function() {
            const buttonData = viewer.graphButtons?.get(pageNumber);
            if (buttonData) {
                buttonData.cleanup();
                viewer.graphButtons.delete(pageNumber);
            }
            if (originalRemove) {
                originalRemove.call(this);
            }
        };
        
        
        // Test direct de l'élément cliquable
        setTimeout(() => {
            const testButton = document.querySelector(`[data-page-number="${pageNumber}"] .graph-control-btn`);
            if (testButton) {
            }
        }, 100);
    }

    /**
     * Détermine si le bouton Configurer doit être affiché pour une page graphique
     */
    shouldShowGraphButton(pageNumber) {
        // Ne pas afficher si ce n'est pas une page graphique
        if (!this.isCurrentPageGraph(pageNumber)) {
            return false;
        }
        
        // Ne pas afficher si le panneau de configuration est ouvert (mais considérer le flag closing)
        if (this.graphControlPanel && 
            this.graphControlPanel.style.display !== 'none' && 
            this.graphControlPanel.dataset.closing !== 'true') {
            return false;
        }
        
        // Ne pas afficher si on n'est pas sur cette page
        if (this.currentPage !== pageNumber) {
            return false;
        }
        
        return true;
    }

    /**
     * Met à jour la visibilité de tous les boutons graphiques et s'assure qu'ils existent
     */
    updateAllGraphButtonsVisibility() {
        
        // Vérifier et recréer les boutons manquants pour les pages graphiques visibles
        this.ensureGraphButtonsExist();
        
        if (this.graphButtons) {
            this.graphButtons.forEach((buttonData, pageNumber) => {
                if (buttonData.updatePosition) {
                    buttonData.updatePosition();
                }
            });
        }
    }

    /**
     * S'assure que tous les boutons graphiques nécessaires existent
     */
    ensureGraphButtonsExist() {
        const pageSequence = this.createPageSequence();
        
        pageSequence.forEach((pageInfo, index) => {
            const displayPageNum = index + 1;
            
            // Vérifier si c'est une page graphique
            if (pageInfo.isBlank && pageInfo.id) {
                const pageData = this.addedPages.get(pageInfo.id);
                if (pageData?.isGraph) {
                    
                    // Vérifier si le bouton existe déjà
                    const existingButton = this.graphButtons?.get(displayPageNum);
                    const buttonExists = existingButton && document.body.contains(existingButton.button);
                    
                    
                    if (!existingButton || !buttonExists) {
                        
                        // Trouver le container de la page
                        const pageElement = this.pageElements.get(displayPageNum);
                        
                        if (pageElement?.container) {
                            // Recréer le bouton
                            this.addGraphControlButton(pageElement.container, displayPageNum);
                        } else {
                            
                            // Essayer de recréer le container si nécessaire
                            setTimeout(() => {
                                const pageElement = this.pageElements.get(displayPageNum);
                                if (pageElement?.container) {
                                    this.addGraphControlButton(pageElement.container, displayPageNum);
                                } else {
                                }
                            }, 100);
                        }
                    }
                }
            }
        });
    }

    /**
     * Vérifie et affiche l'état des boutons Configurer dans toutes les pages graphiques
     */
    debugGraphButtons() {
        
        const allButtons = document.querySelectorAll('.graph-control-btn');
        
        allButtons.forEach((btn, index) => {
            const pageContainer = btn.closest('.pdf-page-container');
            const pageNumber = pageContainer ? pageContainer.dataset.pageNumber : 'inconnu';
        });
        
        // Vérifier les pages graphiques spécifiquement
        const pageSequence = this.createPageSequence();
        pageSequence.forEach((pageInfo, index) => {
            const displayPageNum = index + 1;
            if (pageInfo.isBlank && pageInfo.id) {
                const pageData = this.addedPages.get(pageInfo.id);
                if (pageData?.isGraph) {
                    const pageElement = this.pageElements.get(displayPageNum);
                    const button = pageElement?.container?.querySelector('.graph-control-btn');
                }
            }
        });
    }

    /**
     * Génère une couleur aléatoire pour les fonctions
     */
    generateRandomColor() {
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#orange', '#purple'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Efface toutes les fonctions du graphique
     */
    clearAllFunctions() {
        if (!this.currentGraphPage) return;

        if (confirm('Êtes-vous sûr de vouloir effacer toutes les fonctions ?')) {
            this.updateGraphConfig(this.currentGraphPage, { functions: [] });
            this.updateFunctionsList([]);
            this.redrawCurrentGraphPage();
            
        }
    }

    /**
     * Sauvegarde la configuration du graphique
     */
    saveGraphConfiguration() {
        if (!this.currentGraphPage) return;

        try {
            const pageSequence = this.createPageSequence();
            const pageInfo = pageSequence[this.currentGraphPage - 1];
            
            if (pageInfo && pageInfo.isBlank && pageInfo.id) {
                const pageData = this.addedPages.get(pageInfo.id);
                if (pageData?.graphConfig) {
                    // Créer un objet de sauvegarde complet
                    const saveData = {
                        type: 'graph-config',
                        timestamp: new Date().toISOString(),
                        config: JSON.parse(JSON.stringify(pageData.graphConfig))
                    };
                    
                    // Sauvegarder dans le localStorage pour persistance
                    const savedConfigs = JSON.parse(localStorage.getItem('graph-configs') || '[]');
                    savedConfigs.push(saveData);
                    
                    // Garder seulement les 10 dernières configurations
                    if (savedConfigs.length > 10) {
                        savedConfigs.splice(0, savedConfigs.length - 10);
                    }
                    
                    localStorage.setItem('graph-configs', JSON.stringify(savedConfigs));
                    
                    this.showGraphMessage('Configuration sauvegardée avec succès!', 'success');
                }
            }
        } catch (error) {
            this.showGraphMessage('Erreur lors de la sauvegarde', 'error');
        }
    }

    /**
     * Exporte le graphique en tant qu'image
     */
    exportGraphAsImage() {
        if (!this.currentGraphPage) return;

        try {
            const pageElement = this.pageElements.get(this.currentGraphPage);
            if (!pageElement || !pageElement.canvas) {
                this.showGraphMessage('Impossible d\'exporter: page non trouvée', 'error');
                return;
            }

            // Créer un canvas temporaire pour l'export
            const canvas = pageElement.canvas;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            
            const ctx = tempCanvas.getContext('2d');
            
            // Copier le contenu du canvas original
            ctx.drawImage(canvas, 0, 0);
            
            // Convertir en blob et télécharger
            tempCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `graphique-page-${this.currentGraphPage}-${new Date().toISOString().slice(0, 10)}.png`;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                this.showGraphMessage('Image exportée avec succès!', 'success');
            }, 'image/png');
            
        } catch (error) {
            this.showGraphMessage('Erreur lors de l\'export', 'error');
        }
    }
    
    /**
     * Gère les actions du menu de téléchargement
     */
    handleDownloadAction(action) {
        switch (action) {
            case 'download':
                this.downloadPDF();
                break;
            case 'send-students':
                this.sendToStudents();
                break;
            default:
        }
    }
    
    /**
     * Télécharge le PDF avec les annotations
     */
    async downloadPDF() {
        console.trace();
        
        // Afficher un indicateur de progression
        this.showExportProgress('Préparation de l\'export...');
        
        try {
            // Créer un nouveau PDF avec les annotations
            const blob = await this.exportPDFWithAnnotations();
            
            // Masquer l'indicateur de progression
            this.hideExportProgress();
            
            // Télécharger le fichier
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Générer un nom de fichier avec timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
            const baseName = this.fileName ? this.fileName.replace('.pdf', '') : 'document';
            link.download = `${baseName}_annote_${timestamp}.pdf`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            this.showSuccessMessage('PDF téléchargé avec succès !');
            
        } catch (error) {
            this.hideExportProgress();
            this.showErrorMessage(`Erreur lors du téléchargement: ${error.message}`);
        }
    }
    
    /**
     * Afficher un indicateur de progression pour l'export
     */
    showExportProgress(message = 'Export en cours...') {
        // Supprimer l'indicateur existant s'il y en a un
        this.hideExportProgress();
        
        const progressDiv = document.createElement('div');
        progressDiv.id = 'export-progress-indicator';
        progressDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            padding: 20px 30px;
            z-index: 99999;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: var(--font-family);
            font-size: 14px;
            color: #374151;
        `;
        
        progressDiv.innerHTML = `
            <div style="
                width: 20px;
                height: 20px;
                border: 2px solid #e5e7eb;
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            <span>${message}</span>
        `;
        
        document.body.appendChild(progressDiv);
    }
    
    /**
     * Masquer l'indicateur de progression
     */
    hideExportProgress() {
        const progressDiv = document.getElementById('export-progress-indicator');
        if (progressDiv) {
            progressDiv.remove();
        }
    }
    
    /**
     * Afficher un message de succès
     */
    showSuccessMessage(message) {
        this.showToast(message, 'success');
    }
    
    /**
     * Afficher un message d'erreur
     */
    showErrorMessage(message) {
        this.showToast(message, 'error');
    }
    
    /**
     * Afficher un toast message
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 99999;
            font-family: var(--font-family);
            font-size: 14px;
            font-weight: 500;
            max-width: 350px;
            animation: slideInRight 0.3s ease-out;
        `;
        
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Supprimer le toast après 3 secondes
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    /**
     * Ouvre le panneau de sélection pour envoyer le PDF aux élèves
     */
    async sendToStudents() {
        
        // Mettre à jour les données depuis le DOM principal
        this.updateStudentDataFromDOM();
        
        // Ouvrir le panneau de sélection des élèves
        this.openSendToStudentsPanel();
    }
    
    /**
     * Ouvre le panneau de sélection des élèves
     */
    openSendToStudentsPanel() {
        // Vérifier si le panneau existe déjà
        if (this.sendToStudentsPanel) {
            this.sendToStudentsPanel.style.display = 'block';
            return;
        }
        
        // Créer le panneau de sélection
        this.createSendToStudentsPanel();
    }
    
    /**
     * Crée le panneau de sélection des élèves
     */
    createSendToStudentsPanel() {
        // Créer le conteneur principal
        this.sendToStudentsPanel = document.createElement('div');
        this.sendToStudentsPanel.id = 'send-to-students-panel';
        this.sendToStudentsPanel.innerHTML = this.getSendToStudentsHTML();
        
        // Ajouter les styles CSS
        this.injectSendToStudentsCSS();
        
        // Ajouter au DOM
        document.body.appendChild(this.sendToStudentsPanel);
        
        // Configurer les événements
        this.setupSendToStudentsEvents();
        
    }
    
    /**
     * Envoie effectivement le PDF aux élèves sélectionnés
     */
    async performSendToStudents(selectedStudents, sendMode = 'selected') {
        try {
            this.showSendingProgress(true);
            
            // Créer un nouveau PDF avec les annotations
            const blob = await this.exportPDFWithAnnotations();
            
            // Créer un FormData pour l'envoi
            const formData = new FormData();
            formData.append('pdf_file', blob, this.fileName || 'document_annote.pdf');
            formData.append('action', 'send_to_students');
            formData.append('send_mode', sendMode);
            formData.append('selected_students', JSON.stringify(selectedStudents));
            
            // Ajouter l'ID de classe si disponible
            if (this.options.currentClassId) {
                formData.append('current_class_id', this.options.currentClassId);
            }
            
            // Envoyer au serveur
            const response = await fetch('/api/send-to-students', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showSendSuccess(result.message || 'Document envoyé avec succès!');
                this.closeSendToStudentsPanel();
            } else {
                throw new Error('Erreur serveur');
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi aux élèves:', error);
            this.showSendError('Erreur lors de l\'envoi: ' + error.message);
        } finally {
            this.showSendingProgress(false);
        }
    }
    
    /**
     * Exporte le PDF avec les annotations
     */
    async exportPDFWithAnnotations() {
        if (!this.pdfDoc) {
            throw new Error('Veuillez d\'abord charger un fichier PDF');
        }

        try {
            
            // Importer jsPDF si nécessaire
            if (typeof window.jsPDF === 'undefined' && !(window.jspdf && window.jspdf.jsPDF)) {
                await this.loadJsPDF();
            }
            
            // Debug: voir comment jsPDF est exposé

            // Accéder à jsPDF correctement selon la version
            const jsPDFConstructor = window.jspdf?.jsPDF || window.jsPDF;
            if (!jsPDFConstructor) {
                throw new Error('jsPDF not found after loading');
            }
            
            const pdf = new jsPDFConstructor('p', 'pt', 'a4');
            
            // Supprimer la première page vide
            pdf.deletePage(1);
            
            // Obtenir le nombre réel de pages dans le DOM
            const pageSequence = this.createPageSequence();
            const totalPagesInDOM = pageSequence.length;
            
            // Traiter chaque page
            for (let pageNum = 1; pageNum <= totalPagesInDOM; pageNum++) {
                
                // Mettre à jour l'indicateur de progression
                const progressElement = document.querySelector('#export-progress-indicator span');
                if (progressElement) {
                    progressElement.textContent = `Export page ${pageNum}/${this.totalPages}...`;
                }
                
                // Obtenir le canvas de la page avec annotations
                const canvas = await this.getPageCanvasWithAnnotations(pageNum);
                
                if (canvas) {
                    // Convertir le canvas en image
                    const imgData = canvas.toDataURL('image/jpeg', 0.95);
                    
                    // Calculer les dimensions pour le PDF
                    const pdfWidth = 595.28; // Largeur A4 en points
                    const pdfHeight = 841.89; // Hauteur A4 en points
                    const canvasAspectRatio = canvas.width / canvas.height;
                    const pdfAspectRatio = pdfWidth / pdfHeight;
                    
                    let imgWidth, imgHeight, x, y;
                    
                    if (canvasAspectRatio > pdfAspectRatio) {
                        // L'image est plus large
                        imgWidth = pdfWidth;
                        imgHeight = pdfWidth / canvasAspectRatio;
                        x = 0;
                        y = (pdfHeight - imgHeight) / 2;
                    } else {
                        // L'image est plus haute
                        imgHeight = pdfHeight;
                        imgWidth = pdfHeight * canvasAspectRatio;
                        x = (pdfWidth - imgWidth) / 2;
                        y = 0;
                    }
                    
                    // Ajouter une nouvelle page (sauf pour la première)
                    if (pageNum > 1) {
                        pdf.addPage();
                    } else {
                        // Ajouter la première page
                        pdf.addPage('a4', 'portrait');
                    }
                    
                    // Ajouter l'image au PDF
                    pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);
                    
                } else {
                }
            }
            
            // Générer le blob PDF
            const pdfBlob = pdf.output('blob');
            
            return pdfBlob;
            
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Charger jsPDF dynamiquement
     */
    async loadJsPDF() {
        return new Promise((resolve, reject) => {
            // Vérifier si jsPDF est déjà chargé (plusieurs façons possibles)
            if (typeof window.jsPDF !== 'undefined' || (window.jspdf && window.jspdf.jsPDF)) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => {
                // Vérifier que jsPDF est bien chargé
                if (window.jspdf?.jsPDF || window.jsPDF) {
                    resolve();
                } else {
                    reject(new Error('jsPDF chargé mais non trouvé dans window'));
                }
            };
            script.onerror = () => {
                reject(new Error('Impossible de charger jsPDF'));
            };
            document.head.appendChild(script);
        });
    }
    
    /**
     * Obtenir le canvas d'une page avec toutes les annotations
     */
    async getPageCanvasWithAnnotations(pageNum) {
        try {
            
            // D'abord essayer le fallback avec this.pageElements qui stocke les pages rendues
            if (this.pageElements && this.pageElements.size > 0) {
            }
            
            if (this.pageElements && this.pageElements.has(pageNum)) {
                const pageElement = this.pageElements.get(pageNum);
                
                // Créer un canvas composite avec le contenu de la page
                const compositeCanvas = document.createElement('canvas');
                compositeCanvas.width = pageElement.canvas.width;
                compositeCanvas.height = pageElement.canvas.height;
                const compositeCtx = compositeCanvas.getContext('2d');
                
                // Dessiner le PDF de base
                compositeCtx.drawImage(pageElement.canvas, 0, 0);
                
                // Dessiner les annotations
                if (pageElement.annotationCanvas) {
                    compositeCtx.drawImage(pageElement.annotationCanvas, 0, 0);
                } else {
                }
                
                return compositeCanvas;
            }
            
            // Chercher dans la zone principale du PDF (pas dans les miniatures)
            const pdfContainer = document.querySelector('#pdf-content-area, .pdf-content, .pdf-viewer-content');
            if (!pdfContainer) {
                return null;
            }
            
            // Trouver le conteneur de la page dans la zone principale
            const pageContainer = pdfContainer.querySelector(`.pdf-page-container[data-page-number="${pageNum}"]`);
            if (!pageContainer) {
                return null;
            }
            
            // Debug: voir ce qu'il y a dans le conteneur
            const canvases = pageContainer.querySelectorAll('canvas');
            canvases.forEach((c, i) => {
            });
            
            // Obtenir le canvas PDF principal
            const mainCanvas = pageContainer.querySelector('.pdf-canvas');
            if (!mainCanvas) {
                return null;
            }
            
            // Créer un canvas de composition
            const compositeCanvas = document.createElement('canvas');
            compositeCanvas.width = mainCanvas.width;
            compositeCanvas.height = mainCanvas.height;
            const compositeCtx = compositeCanvas.getContext('2d');
            
            // Dessiner le PDF de base
            compositeCtx.drawImage(mainCanvas, 0, 0);
            
            // Dessiner les annotations si elles existent
            const annotationCanvas = pageContainer.querySelector('.pdf-annotation-layer');
            if (annotationCanvas) {
                compositeCtx.drawImage(annotationCanvas, 0, 0);
            }
            
            // Dessiner les graphiques si c'est une page graphique
            if (this.graphPages && this.graphPages.has(pageNum)) {
                const graphCanvas = pageContainer.querySelector('.graph-canvas');
                if (graphCanvas) {
                    compositeCtx.drawImage(graphCanvas, 0, 0);
                }
            }
            
            return compositeCanvas;
            
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Configure les événements pour le panneau d'envoi aux élèves
     */
    setupSendToStudentsEvents() {
        const panel = this.sendToStudentsPanel;
        if (!panel) return;
        
        // Événements pour les options de mode d'envoi
        const modeRadios = panel.querySelectorAll('input[name="sendMode"]');
        modeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.onSendModeChange());
        });
        
        // Événements pour les checkboxes d'élèves
        const studentCheckboxes = panel.querySelectorAll('.student-checkbox');
        studentCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateSendSummary());
        });
        
        // Événements pour les boutons avec data-action
        panel.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (!button) return;
            
            const action = button.dataset.action;
            switch (action) {
                case 'close':
                    this.closeSendToStudentsPanel();
                    break;
                case 'select-all':
                    this.selectAllStudents();
                    break;
                case 'unselect-all':
                    this.unselectAllStudents();
                    break;
                case 'confirm':
                    this.confirmSendToStudents();
                    break;
            }
        });
        
        // Événement pour fermer avec Échap
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.style.display !== 'none') {
                this.closeSendToStudentsPanel();
            }
        });
        
        // Événement pour fermer en cliquant sur l'overlay
        panel.addEventListener('click', (e) => {
            if (e.target === panel) {
                this.closeSendToStudentsPanel();
            }
        });
        
        // Initialiser le mode par défaut
        this.onSendModeChange();
    }
    
    /**
     * Injecte les styles CSS pour le panneau d'envoi aux élèves
     */
    injectSendToStudentsCSS() {
        if (document.getElementById('send-to-students-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'send-to-students-styles';
        style.textContent = `
            #send-to-students-panel .send-to-students-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            
            #send-to-students-panel .send-to-students-container {
                background: white;
                border-radius: 12px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            }
            
            #send-to-students-panel .send-to-students-header {
                background: #3B82F6;
                color: white;
                padding: 1rem 1.5rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            #send-to-students-panel .send-to-students-header h2 {
                margin: 0;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            #send-to-students-panel .close-btn {
                background: none;
                border: none;
                color: white;
                font-size: 1.2rem;
                cursor: pointer;
                padding: 0.5rem;
                border-radius: 4px;
                transition: background-color 0.2s;
            }
            
            #send-to-students-panel .close-btn:hover {
                background-color: rgba(255, 255, 255, 0.2);
            }
            
            #send-to-students-panel .send-to-students-content {
                padding: 1.5rem;
                max-height: calc(80vh - 150px);
                overflow-y: auto;
            }
            
            #send-to-students-panel .send-options h3 {
                margin: 0 0 1rem 0;
                color: #374151;
                font-size: 1.1rem;
            }
            
            #send-to-students-panel .send-option {
                margin-bottom: 1rem;
            }
            
            #send-to-students-panel .option-label {
                display: flex;
                align-items: flex-start;
                gap: 0.75rem;
                padding: 1rem;
                border: 2px solid #E5E7EB;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            #send-to-students-panel .option-label:hover {
                border-color: #3B82F6;
                background-color: #F8FAFC;
            }
            
            #send-to-students-panel .option-label input[type="radio"]:checked + .option-content {
                color: #1E40AF;
            }
            
            #send-to-students-panel .option-label input[type="radio"]:checked {
                accent-color: #3B82F6;
            }
            
            #send-to-students-panel .option-title {
                font-weight: 600;
                margin-bottom: 0.25rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            #send-to-students-panel .option-description {
                font-size: 0.9rem;
                color: #6B7280;
            }
            
            #send-to-students-panel .students-selection {
                margin-top: 1.5rem;
                padding-top: 1.5rem;
                border-top: 1px solid #E5E7EB;
            }
            
            #send-to-students-panel .students-selection h3 {
                margin: 0 0 1rem 0;
                color: #374151;
                font-size: 1.1rem;
            }
            
            #send-to-students-panel .selection-controls {
                display: flex;
                gap: 0.5rem;
                margin-bottom: 1rem;
            }
            
            #send-to-students-panel .selection-controls .btn {
                padding: 0.5rem 1rem;
                border: 1px solid #D1D5DB;
                border-radius: 6px;
                background: white;
                cursor: pointer;
                font-size: 0.9rem;
                transition: all 0.2s;
            }
            
            #send-to-students-panel .selection-controls .btn:hover {
                background: #F3F4F6;
                border-color: #9CA3AF;
            }
            
            #send-to-students-panel .students-list-send {
                max-height: 200px;
                overflow-y: auto;
                border: 1px solid #E5E7EB;
                border-radius: 6px;
                padding: 0.5rem;
            }
            
            #send-to-students-panel .student-select-item {
                margin-bottom: 0.5rem;
            }
            
            #send-to-students-panel .student-select-label {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.5rem;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            #send-to-students-panel .student-select-label:hover {
                background-color: #F3F4F6;
            }
            
            #send-to-students-panel .student-select-info {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                flex: 1;
            }
            
            #send-to-students-panel .student-avatar-small {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: #3B82F6;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                font-size: 0.9rem;
            }
            
            #send-to-students-panel .student-name-select {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                flex: 1;
            }
            
            #send-to-students-panel .student-name {
                font-weight: 500;
            }
            
            #send-to-students-panel .absent-badge {
                background: #FEE2E2;
                color: #DC2626;
                padding: 0.25rem 0.5rem;
                border-radius: 4px;
                font-size: 0.75rem;
                font-weight: 500;
            }
            
            #send-to-students-panel .present-badge {
                background: #DCFCE7;
                color: #16A34A;
                padding: 0.25rem 0.5rem;
                border-radius: 4px;
                font-size: 0.75rem;
                font-weight: 500;
            }
            
            #send-to-students-panel .send-summary {
                margin-top: 1.5rem;
                padding: 1rem;
                background: #F8FAFC;
                border-radius: 6px;
                border-left: 4px solid #3B82F6;
            }
            
            #send-to-students-panel .summary-info {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: #374151;
            }
            
            #send-to-students-panel .send-to-students-footer {
                padding: 1rem 1.5rem;
                background: #F9FAFB;
                border-top: 1px solid #E5E7EB;
                display: flex;
                justify-content: space-between;
                gap: 1rem;
            }
            
            #send-to-students-panel .btn {
                padding: 0.75rem 1.5rem;
                border-radius: 6px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                border: none;
            }
            
            #send-to-students-panel .btn-secondary {
                background: #F3F4F6;
                color: #374151;
                border: 1px solid #D1D5DB;
            }
            
            #send-to-students-panel .btn-secondary:hover {
                background: #E5E7EB;
                border-color: #9CA3AF;
            }
            
            #send-to-students-panel .btn-primary {
                background: #3B82F6;
                color: white;
            }
            
            #send-to-students-panel .btn-primary:hover {
                background: #2563EB;
            }
            
            #send-to-students-panel .btn-primary:disabled {
                background: #9CA3AF;
                cursor: not-allowed;
            }
            
            #send-to-students-panel .send-progress {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 12px;
            }
            
            #send-to-students-panel .progress-info {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                color: #374151;
                font-weight: 500;
            }
            
            #send-to-students-panel .no-students {
                text-align: center;
                color: #6B7280;
                padding: 2rem;
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Gère le changement de mode d'envoi
     */
    onSendModeChange() {
        const panel = this.sendToStudentsPanel;
        if (!panel) return;
        
        const selectedMode = panel.querySelector('input[name="sendMode"]:checked')?.value;
        const studentsSelection = panel.querySelector('#students-selection');
        
        if (selectedMode === 'custom') {
            studentsSelection.style.display = 'block';
        } else {
            studentsSelection.style.display = 'none';
            
            // Pour les modes automatiques, présélectionner les élèves appropriés
            if (selectedMode === 'absent') {
                this.selectAbsentStudents();
            } else if (selectedMode === 'all') {
                this.selectAllStudents();
            }
        }
        
        this.updateSendSummary();
    }
    
    /**
     * Sélectionne tous les élèves
     */
    selectAllStudents() {
        const panel = this.sendToStudentsPanel;
        if (!panel) return;
        
        const checkboxes = panel.querySelectorAll('.student-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        
        this.updateSendSummary();
    }
    
    /**
     * Désélectionne tous les élèves
     */
    unselectAllStudents() {
        const panel = this.sendToStudentsPanel;
        if (!panel) return;
        
        const checkboxes = panel.querySelectorAll('.student-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        this.updateSendSummary();
    }
    
    /**
     * Sélectionne uniquement les élèves absents
     */
    selectAbsentStudents() {
        const panel = this.sendToStudentsPanel;
        if (!panel) return;
        
        const checkboxes = panel.querySelectorAll('.student-checkbox');
        checkboxes.forEach(checkbox => {
            const isAbsent = checkbox.dataset.absent === 'true';
            checkbox.checked = isAbsent;
        });
        
        this.updateSendSummary();
    }
    
    /**
     * Met à jour le résumé d'envoi
     */
    updateSendSummary() {
        const panel = this.sendToStudentsPanel;
        if (!panel) return;
        
        const selectedMode = panel.querySelector('input[name="sendMode"]:checked')?.value;
        const summaryText = panel.querySelector('#send-summary-text');
        const confirmBtn = panel.querySelector('#send-confirm-btn');
        
        if (!summaryText || !confirmBtn) return;
        
        let message = '';
        let studentCount = 0;
        
        if (selectedMode === 'all') {
            const totalStudents = panel.querySelectorAll('.student-checkbox').length;
            studentCount = totalStudents;
            message = `Tous les élèves (${totalStudents}) recevront le document`;
        } else if (selectedMode === 'absent') {
            const absentStudents = panel.querySelectorAll('.student-checkbox[data-absent="true"]').length;
            studentCount = absentStudents;
            message = absentStudents > 0 
                ? `Les élèves absents (${absentStudents}) recevront le document`
                : 'Aucun élève absent trouvé';
        } else if (selectedMode === 'custom') {
            const selectedStudents = panel.querySelectorAll('.student-checkbox:checked');
            studentCount = selectedStudents.length;
            message = selectedStudents.length > 0
                ? `${selectedStudents.length} élève(s) sélectionné(s) recevront le document`
                : 'Aucun élève sélectionné';
        }
        
        summaryText.textContent = message;
        confirmBtn.disabled = studentCount === 0;
    }
    
    /**
     * Confirme et lance l'envoi aux élèves
     */
    async confirmSendToStudents() {
        const panel = this.sendToStudentsPanel;
        if (!panel) return;
        
        const selectedMode = panel.querySelector('input[name="sendMode"]:checked')?.value;
        let selectedStudents = [];
        
        if (selectedMode === 'all') {
            // Tous les élèves
            const allCheckboxes = panel.querySelectorAll('.student-checkbox');
            selectedStudents = Array.from(allCheckboxes).map(cb => ({
                id: cb.value,
                name: cb.dataset.studentName
            }));
        } else if (selectedMode === 'absent') {
            // Seulement les absents
            const absentCheckboxes = panel.querySelectorAll('.student-checkbox[data-absent="true"]');
            selectedStudents = Array.from(absentCheckboxes).map(cb => ({
                id: cb.value,
                name: cb.dataset.studentName
            }));
        } else if (selectedMode === 'custom') {
            // Sélection personnalisée
            const checkedBoxes = panel.querySelectorAll('.student-checkbox:checked');
            selectedStudents = Array.from(checkedBoxes).map(cb => ({
                id: cb.value,
                name: cb.dataset.studentName
            }));
        }
        
        if (selectedStudents.length === 0) {
            this.showSendError('Aucun élève sélectionné pour l\'envoi');
            return;
        }
        
        // Lancer l'envoi effectif
        await this.performSendToStudents(selectedStudents, selectedMode);
    }
    
    /**
     * Ferme le panneau d'envoi aux élèves
     */
    closeSendToStudentsPanel() {
        if (this.sendToStudentsPanel) {
            this.sendToStudentsPanel.style.display = 'none';
            // Optionnel: supprimer complètement le panneau
            // this.sendToStudentsPanel.remove();
            // this.sendToStudentsPanel = null;
        }
    }
    
    /**
     * Affiche/masque l'indicateur de progression d'envoi
     */
    showSendingProgress(show) {
        const panel = this.sendToStudentsPanel;
        if (!panel) return;
        
        const progressElement = panel.querySelector('#send-progress');
        if (progressElement) {
            progressElement.style.display = show ? 'flex' : 'none';
        }
    }
    
    /**
     * Affiche un message de succès d'envoi
     */
    showSendSuccess(message) {
        // Utiliser le système de notification existant ou créer une simple alerte
        if (typeof this.showNotification === 'function') {
            this.showNotification(message, 'success');
        } else {
            alert('✅ ' + message);
        }
    }
    
    /**
     * Affiche un message d'erreur d'envoi
     */
    showSendError(message) {
        // Utiliser le système de notification existant ou créer une simple alerte
        if (typeof this.showNotification === 'function') {
            this.showNotification(message, 'error');
        } else {
            alert('❌ ' + message);
        }
    }

    // =====================================
    // Perfect-freehand optimisé - Tracés vectoriels lisses
    // =====================================

    /**
     * Convertit un point en format perfect-freehand
     * @param {Object} point - Point avec x, y, timestamp
     * @param {number} pressure - Pression du stylet (0-1, optionnel)
     * @returns {Array} - [x, y, pressure]
     */
    convertPointForPerfectFreehand(point, pressure = 0.5) {
        return [point.x, point.y, pressure];
    }

    /**
     * Calcule une pression simulée basée sur la vélocité
     * @param {Object} currentPoint - Point actuel
     * @param {Object} lastPoint - Point précédent
     * @param {number} lastTimestamp - Timestamp précédent
     * @returns {number} - Pression simulée (0.1-1.0)
     */
    calculatePressureFromVelocity(currentPoint, lastPoint, lastTimestamp) {
        if (!lastPoint || !lastTimestamp) return 0.5;
        
        const now = Date.now();
        const dt = Math.max(1, now - lastTimestamp);
        const dx = currentPoint.x - lastPoint.x;
        const dy = currentPoint.y - lastPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const velocity = distance / dt;
        
        // Normaliser vélocité: plus lent = plus de pression
        // Vitesse normale iPad = 0.1-2.0 pixels/ms
        const normalizedVelocity = Math.min(velocity / 1.0, 1.0);
        const pressure = Math.max(0.1, 1.0 - normalizedVelocity * 0.7);
        
        return pressure;
    }

    // ========================================
    // ANCIEN SYSTÈME DE DESSIN - SUPPRIMÉ
    // Remplacé par PDFAnnotationEngine + perfect-freehand
    // ========================================

    /**
     * Initialise le moteur d'annotation pour une page
     * @param {number} pageNum - Numéro de la page
     */
    initAnnotationEngine(pageNum) {
        // Vérifier que SimplePenAnnotation est disponible
        if (typeof window.SimplePenAnnotation === 'undefined') {
            console.error('SimplePenAnnotation non disponible');
            return;
        }

        const pageElement = this.pageElements.get(pageNum);
        if (!pageElement?.annotationCanvas) {
            console.error(`Canvas d'annotation non trouvé pour la page ${pageNum}`);
            return;
        }

        const engine = new window.SimplePenAnnotation(pageElement.annotationCanvas, {
            size: this.currentLineWidth,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: true,
            color: this.currentColor,
            opacity: 1.0
        });

        this.annotationEngines.set(pageNum, engine);
    }

    /**
     * Met à jour les options du moteur d'annotation
     * @param {number} pageNum - Numéro de la page
     */
    updateAnnotationEngineOptions(pageNum) {
        const engine = this.annotationEngines.get(pageNum);
        if (engine) {
            engine.updateOptions({
                size: this.currentLineWidth,
                color: this.currentColor,
            });
        }
    }

    // =====================================
    // Optimisation haute résolution (Retina/iPad)
    // =====================================

    /**
     * Configure un canvas pour haute résolution
     * @param {HTMLCanvasElement} canvas - Canvas à optimiser
     * @param {number} width - Largeur logique
     * @param {number} height - Hauteur logique
     */
    setupHighDPICanvas(canvas, width, height) {
        const dpr = window.devicePixelRatio || 1;
        
        if (this.options.debug) {
            console.log(`🔍 DPI Setup: devicePixelRatio=${dpr}, size=${width}x${height}`);
        }

        // Définir la taille physique du canvas (pixels réels)
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        // Définir la taille CSS (taille logique)
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        // Mettre à l'échelle le contexte pour correspondre au DPR
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        
        // Améliorer la qualité de rendu
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        return { dpr, ctx };
    }

    /**
     * Optimise tous les canvas d'annotation pour haute résolution
     */
    optimizeCanvasResolution() {
        this.pageElements.forEach((pageElement, pageNum) => {
            if (pageElement?.annotationCanvas) {
                const canvas = pageElement.annotationCanvas;
                const rect = canvas.getBoundingClientRect();
                
                // Sauvegarder le contenu actuel
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                tempCtx.drawImage(canvas, 0, 0);
                
                // Reconfigurer en haute résolution
                const { ctx } = this.setupHighDPICanvas(canvas, rect.width, rect.height);
                
                // Restaurer le contenu avec mise à l'échelle
                const dpr = window.devicePixelRatio || 1;
                ctx.save();
                ctx.scale(1/dpr, 1/dpr); // Compenser le scale automatique pour la restauration
                ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
                ctx.restore();
                
                // Mettre à jour la référence du contexte
                pageElement.annotationCtx = ctx;
                
                // Performance optimisée - logs canvas supprimés
            }
        });
    }
    
    // =====================================
    // Gestion automatique du cache
    // =====================================
    
    /**
     * Gère automatiquement le cache du navigateur
     */
    manageBrowserCache() {
        try {
            // Vérifier l'usage du stockage
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                navigator.storage.estimate().then(estimate => {
                    const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
                    const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
                    const percentUsed = ((estimate.usage / estimate.quota) * 100).toFixed(1);
                    
                    console.log(`💾 CACHE: ${usedMB}MB utilisés sur ${quotaMB}MB (${percentUsed}%)`);
                    
                    // Si plus de 80% du cache est utilisé, proposer de le vider
                    if (estimate.usage / estimate.quota > 0.8) {
                        console.warn('⚠️ CACHE PLEIN: Plus de 80% du cache utilisé - performance réduite');
                        this.showCacheWarning();
                    }
                });
            }
            
            // Mettre à jour le timestamp de la dernière visite
            const now = Date.now();
            const lastVisit = localStorage.getItem('pdf_viewer_last_visit');
            
            if (lastVisit) {
                const daysSinceLastVisit = (now - parseInt(lastVisit)) / (1000 * 60 * 60 * 24);
                
                // Si plus de 7 jours, suggérer un nettoyage du cache
                if (daysSinceLastVisit > 7) {
                    console.log('🧹 SUGGESTION: Cache ancien détecté, nettoyage recommandé');
                }
            }
            
            localStorage.setItem('pdf_viewer_last_visit', now.toString());
            
        } catch (error) {
            console.log('📱 Gestion cache non disponible sur cette plateforme');
        }
    }
    
    /**
     * Affiche un avertissement sur le cache plein
     */
    showCacheWarning() {
        // Créer une notification discrète
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: #f39c12; color: white; 
                        padding: 15px; border-radius: 8px; z-index: 10000; max-width: 300px; 
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 14px;">
                <strong>🚀 Performance</strong><br>
                Cache plein détecté. Pour une expérience optimale :<br>
                <em>Réglages → Safari → Effacer historique et données</em>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="float: right; background: none; border: none; color: white; font-size: 18px; cursor: pointer;">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-suppression après 10 secondes
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }
}

// Export pour utilisation ES6 modules (optionnel)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedPDFViewer;
}

// Rendre la classe disponible globalement pour utilisation dans le navigateur
if (typeof window !== 'undefined') {
    window.UnifiedPDFViewer = UnifiedPDFViewer;
    
    // Fonctions de debug globales une fois qu'un viewer est initialisé
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.pdfViewer) {
                window.debugAnnotations = () => window.pdfViewer.debugAnnotationsState();
            }
        }, 2000);
    });
}
