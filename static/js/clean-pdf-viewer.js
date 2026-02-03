/**
 * Clean PDF Viewer - Version 2.0
 * Architecture propre et moderne pour annotation de PDF avec Apple Pencil
 *
 * @version 2.0.0
 * @author TeacherPlanner
 *
 * Fonctionnalités :
 * - Layout sidebar (1/5) + viewer (4/5)
 * - Miniatures avec navigation et ajout de pages
 * - Annotations vectorielles avec perfect-freehand
 * - Détection stylet/doigt (stylet = annotation, doigt = scroll/zoom)
 * - Outils : stylo, surligneur, gomme, règle, compas, angle, arc, formes
 * - Pages graphiques avec axes configurables
 * - Historique Undo/Redo global
 * - Sauvegarde automatique optimisée
 */

'use strict';

class CleanPDFViewer {
    constructor(containerId, options = {}) {
        // Configuration
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container #${containerId} not found`);
        }

        // Options
        this.options = {
            fileId: options.fileId || null,
            pdfUrl: options.pdfUrl || null,
            // Nouvelles options pour les feuilles blanches
            blankSheetId: options.blankSheetId || null,  // ID de la feuille blanche (si c'est une feuille blanche)
            lessonDate: options.lessonDate || null,      // Date de la leçon (pour feuilles blanches)
            periodNumber: options.periodNumber || null,  // Numéro de période (pour feuilles blanches)
            classroomId: options.classroomId || null,    // ID de la classe (pour feuilles blanches)
            title: options.title || 'Feuille blanche',   // Titre de la feuille blanche
            showSidebar: options.showSidebar !== false,
            enableAnnotations: options.enableAnnotations !== false,
            autoSaveInterval: options.autoSaveInterval || 2000, // 2 secondes
            initialScale: options.initialScale || null, // Scale initial forcé (null = auto)
            annotationOffset: options.annotationOffset || {x: 0, y: 0}, // Offset pour les annotations
            ...options
        };

        // État du viewer
        this.pdf = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.rotation = 0;

        // Pages (originales + ajoutées)
        this.pages = new Map(); // pageNum -> {type: 'pdf'|'blank'|'graph', data: {...}}
        this.pageOrder = []; // Ordre des pages [1, 2, '2a', 3, ...]

        // Annotations (format vectoriel pour tous les outils)
        this.annotations = new Map(); // pageNum -> [{type, data, timestamp}, ...]
        this.annotationHistory = []; // Historique global pour undo/redo
        this.historyIndex = -1;

        // Outil actuel
        this.currentTool = 'pen'; // pen, highlighter, eraser, ruler, compass, angle, arc, arrow, rectangle, disk, grid, student-tracking
        this.currentColor = '#000000';
        this.currentSize = 2;
        this.currentOpacity = 1.0;

        // État du dessin
        this.isDrawing = false;
        this.currentStroke = null;
        this.tempCanvas = null; // Canvas temporaire pour preview

        // Détection stylet/doigt
        this.lastPointerType = null;

        // Curseur Apple Pencil Pro
        this.pencilCursor = null;
        this.cursorVisible = false;
        this.lastHoverX = 0;
        this.lastHoverY = 0;

        // Sauvegarde automatique
        this.autoSaveTimer = null;
        this.isDirty = false;

        // Éléments DOM
        this.elements = {};

        // Outils d'annotation
        this.annotationTools = null;

        // État de l'équerre
        this.setSquareActive = false;

        // État de l'outil texte
        this.selectedTextBox = null;      // Zone de texte actuellement sélectionnée
        this.textInputOverlay = null;     // Élément HTML pour l'édition de texte
        this.textBoxControls = null;      // Conteneur des contrôles de la zone de texte
        this.textDragState = null;        // État du drag (déplacement/redimensionnement)

        // Initialiser
        this.init();
    }

    /**
     * Initialisation du viewer
     */
    async init() {
        console.log('🔥 CLEAN PDF VIEWER - VERSION 2024-12-09-16:30 - INIT STARTED');

        // IMPORTANT: Forcer la réinitialisation des états d'interaction
        this.isAnnotating = false;
        this.isDrawing = false;
        this.setSquareActive = false;

        console.log('[Init] États réinitialisés - isAnnotating:', this.isAnnotating, 'isDrawing:', this.isDrawing, 'setSquareActive:', this.setSquareActive);

        // Créer l'interface
        this.createUI();

        // Ajouter classe au body pour bloquer le scroll global
        document.body.classList.add('pdf-viewer-active');

        // NOUVELLE ARCHITECTURE: Le viewer est en position fixed, le BODY scroll
        // Forcer le body à pouvoir scroller (retirer overflow: hidden)
        this.originalBodyOverflow = document.body.style.overflow;
        this.originalHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'visible';
        document.body.style.touchAction = 'pan-x pan-y pinch-zoom';
        document.documentElement.style.overflow = 'visible'; // html aussi
        console.log('[PDF Viewer] Body/HTML overflow forcé à visible pour scroll natif');

        // Initialiser les outils d'annotation
        if (typeof AnnotationTools !== 'undefined') {
            this.annotationTools = new AnnotationTools(this);
        }

        // Charger le PDF si URL fournie
        if (this.options.pdfUrl) {
            console.log('[Init] Chargement du PDF:', this.options.pdfUrl);
            await this.loadPDF(this.options.pdfUrl);
        } else {
            console.log('[Init] Aucun PDF fourni - mode pages blanches');
        }

        // Charger les annotations sauvegardées OU la feuille blanche
        if (this.options.blankSheetId !== null || (this.options.lessonDate && this.options.periodNumber)) {
            // Mode feuille blanche
            console.log('[Init] Mode feuille blanche détecté, blankSheetId:', this.options.blankSheetId);
            await this.loadBlankSheet();
        } else if (this.options.fileId) {
            // Mode annotation sur PDF existant
            console.log('[Init] Mode annotation sur PDF, fileId:', this.options.fileId);
            await this.loadAnnotations();
        } else {
            console.log('[Init] Pas de fileId ni de blankSheetId, annotations non chargées');
        }

        // Si aucune page n'existe après le chargement, créer une première page blanche
        if (this.pageOrder.length === 0) {
            console.log('[Init] Aucune page trouvée, création d\'une première page blanche');
            const newPageId = `blank_${Date.now()}`;
            this.pages.set(newPageId, {type: 'blank', data: {}});
            this.pageOrder.push(newPageId);
            this.totalPages = 1;
            this.currentPage = newPageId;

            // Re-rendre
            await this.renderThumbnails();
            await this.renderPages();

            this.isDirty = true; // Marquer comme modifié pour forcer la première sauvegarde
        }

        // Démarrer l'auto-save
        this.startAutoSave();

        // Sauvegarder avant la fermeture du navigateur
        this.setupBeforeUnload();
    }

    /**
     * Créer l'interface utilisateur
     */
    createUI() {
        this.container.innerHTML = `
            <div class="clean-pdf-viewer">
                <!-- Barre d'outils en haut -->
                <div class="pdf-toolbar">
                    <div class="toolbar-left">
                        <button class="btn-tool" data-tool="pen" title="Stylo">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-tool" data-tool="highlighter" title="Surligneur">
                            <i class="fas fa-highlighter"></i>
                        </button>
                        <button class="btn-tool" data-tool="eraser" title="Gomme">
                            <i class="fas fa-eraser"></i>
                        </button>
                        <div class="separator"></div>
                        <button class="btn-tool" data-tool="ruler" title="Règle">
                            <i class="fas fa-ruler"></i>
                        </button>
                        <button class="btn-tool" data-tool="compass" title="Compas">
                            <i class="fas fa-compass-drafting"></i>
                        </button>
                        <button class="btn-tool" data-tool="angle" title="Angle">
                            <i class="fas fa-angle-right"></i>
                        </button>
                        <button class="btn-tool" data-tool="arc" title="Arc de cercle">
                            <i class="fas fa-circle-notch"></i>
                        </button>
                        <div class="separator"></div>
                        <button class="btn-tool" data-tool="arrow" title="Flèche">
                            <i class="fas fa-arrow-right"></i>
                        </button>
                        <button class="btn-tool" data-tool="rectangle" title="Rectangle">
                            <i class="far fa-square"></i>
                        </button>
                        <button class="btn-tool" data-tool="disk" title="Disque">
                            <i class="fas fa-circle"></i>
                        </button>
                        <button class="btn-tool" data-tool="grid" title="Grille">
                            <i class="fas fa-border-all"></i>
                        </button>
                        <button class="btn-tool" data-tool="set-square" title="Équerre">
                            <i class="fas fa-ruler-combined"></i>
                        </button>
                        <button class="btn-tool" data-tool="text" title="Texte">
                            <i class="fas fa-font"></i>
                        </button>
                        <div class="separator"></div>
                        <button class="btn-tool" data-tool="student-tracking" title="Suivi des élèves">
                            <i class="fas fa-users"></i>
                        </button>
                    </div>

                    <div class="toolbar-center">
                        <div class="color-selector">
                            <button class="btn-color active" data-color="#000000" style="background-color: #000000;" title="Noir"></button>
                            <button class="btn-color" data-color="#FF0000" style="background-color: #FF0000;" title="Rouge"></button>
                            <button class="btn-color" data-color="#00FF00" style="background-color: #00FF00;" title="Vert"></button>
                            <button class="btn-color" data-color="#0000FF" style="background-color: #0000FF;" title="Bleu"></button>
                            <div class="custom-color-wrapper">
                                <input type="color" id="color-picker" value="#FF00FF">
                                <button class="btn-color btn-color-custom" id="btn-custom-color" title="Couleur personnalisée"></button>
                            </div>
                        </div>
                        <div class="separator"></div>
                        <div class="size-selector">
                            <button class="btn-size active" data-size="2" title="2px">
                                <span class="size-preview" style="height: 2px;"></span>
                            </button>
                            <button class="btn-size" data-size="4" title="4px">
                                <span class="size-preview" style="height: 4px;"></span>
                            </button>
                            <button class="btn-size" data-size="6" title="6px">
                                <span class="size-preview" style="height: 6px;"></span>
                            </button>
                            <button class="btn-size" data-size="8" title="8px">
                                <span class="size-preview" style="height: 8px;"></span>
                            </button>
                            <button class="btn-size" data-size="10" title="10px">
                                <span class="size-preview" style="height: 10px;"></span>
                            </button>
                        </div>
                    </div>

                    <div class="toolbar-right">
                        <button class="btn-action" id="btn-undo" title="Annuler">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button class="btn-action" id="btn-redo" title="Rétablir">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button class="btn-action" id="btn-clear-page" title="Effacer la page">
                            <i class="fas fa-trash"></i>
                        </button>
                        <div class="separator"></div>
                        <button class="btn-action" id="btn-download" title="Télécharger/Envoyer">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-action" id="btn-close" title="Fermer">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <!-- Zone principale -->
                <div class="pdf-main">
                    <!-- Sidebar gauche (1/5) -->
                    <div class="pdf-sidebar">
                        <div class="thumbnails-container" id="thumbnails-container">
                            <!-- Les miniatures seront ajoutées ici -->
                        </div>
                    </div>

                    <!-- Viewer droite (4/5) -->
                    <div class="pdf-viewer" id="pdf-viewer">
                        <div class="pdf-pages-container" id="pdf-pages-container">
                            <!-- Les pages seront rendues ici -->
                        </div>
                        <!-- Curseur Apple Pencil Pro -->
                        <div class="pencil-cursor" id="pencil-cursor" style="display: none;"></div>
                    </div>
                </div>

                <!-- Mini-toolbar flottante pour le zoom -->
                <div class="pdf-mini-toolbar" id="pdf-mini-toolbar">
                    <button class="btn-tool" data-mini-tool="pen" title="Stylo">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-tool" data-mini-tool="highlighter" title="Surligneur">
                        <i class="fas fa-highlighter"></i>
                    </button>
                    <button class="btn-tool" data-mini-tool="eraser" title="Gomme">
                        <i class="fas fa-eraser"></i>
                    </button>
                    <div class="separator" style="width: 100%; height: 1px;"></div>
                    <button class="btn-tool" data-mini-tool="undo" title="Annuler">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button class="btn-tool" data-mini-tool="redo" title="Rétablir">
                        <i class="fas fa-redo"></i>
                    </button>
                </div>

                <!-- Loading overlay -->
                <div class="pdf-loading" id="pdf-loading" style="display: none;">
                    <div class="spinner"></div>
                    <p>Chargement...</p>
                </div>
            </div>
        `;

        // Stocker les références
        this.elements = {
            toolbar: this.container.querySelector('.pdf-toolbar'),
            miniToolbar: this.container.querySelector('#pdf-mini-toolbar'),
            sidebar: this.container.querySelector('.pdf-sidebar'),
            viewer: this.container.querySelector('.pdf-viewer'),
            thumbnailsContainer: this.container.querySelector('#thumbnails-container'),
            pagesContainer: this.container.querySelector('#pdf-pages-container'),
            colorPicker: this.container.querySelector('#color-picker'),
            btnUndo: this.container.querySelector('#btn-undo'),
            btnRedo: this.container.querySelector('#btn-redo'),
            btnClearPage: this.container.querySelector('#btn-clear-page'),
            btnDownload: this.container.querySelector('#btn-download'),
            btnClose: this.container.querySelector('#btn-close'),
            loading: this.container.querySelector('#pdf-loading'),
            pencilCursor: this.container.querySelector('#pencil-cursor')
        };

        // Initialiser le curseur
        this.pencilCursor = this.elements.pencilCursor;

        // Ajouter les styles CSS
        this.injectStyles();

        // Configurer les event listeners
        this.setupEventListeners();
    }

    /**
     * Injecter les styles CSS
     */
    injectStyles() {
        const styleId = 'clean-pdf-viewer-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .clean-pdf-viewer {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100vh;
                display: flex;
                flex-direction: column;
                background: #f5f5f5;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                z-index: 9999;
            }

            /* Toolbar */
            .pdf-toolbar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border-bottom: 1px solid #e0e0e0;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                gap: 16px;
                z-index: 999999;
                /* Force un nouveau contexte de rendu pour ignorer le zoom natif */
                transform: translateZ(0);
                -webkit-transform: translateZ(0);
                will-change: transform;
            }

            .toolbar-left,
            .toolbar-center,
            .toolbar-right {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            @media (min-height: 850px) {
                .toolbar-left, .toolbar-center, .toolbar-right {
                    gap: 6px;
                }
            }

            @media (min-height: 1100px) {
                .toolbar-left, .toolbar-center, .toolbar-right {
                    gap: 8px;
                }
            }

            .btn-tool,
            .btn-action {
                width: 32px;
                height: 32px;
                border: none;
                background: transparent;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                color: #333;
                font-size: 14px;
            }

            /* Media queries pour adapter la taille selon la hauteur */
            @media (min-height: 750px) {
                .btn-tool, .btn-action {
                    width: 36px;
                    height: 36px;
                    font-size: 15px;
                }
            }

            @media (min-height: 850px) {
                .btn-tool, .btn-action {
                    width: 38px;
                    height: 38px;
                    font-size: 16px;
                }
            }

            @media (min-height: 950px) {
                .btn-tool, .btn-action {
                    width: 40px;
                    height: 40px;
                    font-size: 17px;
                }
            }

            @media (min-height: 1100px) {
                .btn-tool, .btn-action {
                    width: 42px;
                    height: 42px;
                    font-size: 18px;
                }
            }

            .btn-tool:hover,
            .btn-action:hover {
                background: #f0f0f0;
            }

            .btn-tool.active {
                background: #007aff;
                color: white;
            }

            .separator {
                width: 1px;
                height: 24px;
                background: #e0e0e0;
                margin: 0 4px;
            }

            /* Mini-toolbar flottante visible pendant le zoom */
            .pdf-mini-toolbar {
                position: fixed;
                /* bottom et right seront définis dynamiquement par JavaScript */
                display: none;
                flex-direction: column;
                gap: 8px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border-radius: 16px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.2);
                z-index: 9999999;
                /* transform et transformOrigin seront définis par JavaScript */
                touch-action: none;
                pointer-events: auto;
            }

            .pdf-mini-toolbar.visible {
                display: flex;
            }

            .pdf-mini-toolbar .btn-tool {
                width: 44px;
                height: 44px;
                font-size: 20px;
            }

            /* Color selector */
            .color-selector {
                display: flex;
                gap: 6px;
                align-items: center;
            }

            .btn-color {
                width: 32px;
                height: 32px;
                border: 2px solid #e0e0e0;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.2s;
                padding: 0;
                position: relative;
            }

            .btn-color:hover {
                transform: scale(1.1);
                border-color: #999;
            }

            .btn-color.active {
                border-color: #007aff;
                border-width: 3px;
                box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
            }

            .btn-color-custom {
                position: absolute;
                top: 0;
                left: 0;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                pointer-events: none;
                background: #FF00FF;
                border: 2px solid #e0e0e0;
                transition: all 0.2s;
            }

            .custom-color-wrapper {
                position: relative;
                width: 32px;
                height: 32px;
            }

            .custom-color-wrapper.active .btn-color-custom {
                border-color: #007aff;
                border-width: 3px;
                box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
            }

            #color-picker {
                width: 32px;
                height: 32px;
                opacity: 0;
                cursor: pointer;
                position: absolute;
                top: 0;
                left: 0;
            }

            /* Size selector */
            .size-selector {
                display: flex;
                gap: 6px;
                align-items: center;
            }

            .btn-size {
                width: 36px;
                height: 32px;
                border: 2px solid #e0e0e0;
                border-radius: 6px;
                background: white;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 4px;
            }

            .btn-size:hover {
                background: #f0f0f0;
                border-color: #999;
            }

            .btn-size.active {
                background: #007aff;
                border-color: #007aff;
            }

            .size-preview {
                width: 100%;
                background: #333;
                border-radius: 2px;
            }

            .btn-size.active .size-preview {
                background: white;
            }

            /* Main area */
            .pdf-main {
                display: flex;
                flex: 1;
                /* CRITIQUE: NE PAS mettre overflow: hidden car cela bloque le scroll du viewer */
                overflow: visible;
            }

            /* Sidebar (1/5) */
            .pdf-sidebar {
                width: 20%;
                background: white;
                border-right: 1px solid #e0e0e0;
                overflow-y: auto;
                padding: 16px;
            }

            .thumbnails-container {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .thumbnail-item {
                position: relative;
                cursor: pointer;
                border: 2px solid transparent;
                border-radius: 8px;
                overflow: hidden;
                transition: all 0.2s;
            }

            .thumbnail-item:hover {
                border-color: #007aff;
            }

            .thumbnail-item.active {
                border-color: #007aff;
                box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.2);
            }

            .thumbnail-canvas {
                width: 100%;
                height: auto;
                display: block;
            }

            .thumbnail-number {
                position: absolute;
                top: 4px;
                left: 4px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
            }

            .thumbnail-add-btn {
                width: 100%;
                height: 40px;
                margin-top: 8px;
                border: 2px dashed #ccc;
                background: transparent;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                color: #666;
                font-size: 14px;
                transition: all 0.2s;
            }

            .thumbnail-add-btn:hover {
                border-color: #007aff;
                color: #007aff;
                background: rgba(0, 122, 255, 0.05);
            }

            /* Viewer (4/5) */
            .pdf-viewer {
                flex: 1;
                min-height: 0;
                overflow: auto !important; /* Zone de scroll pour les doigts */
                -webkit-overflow-scrolling: touch; /* Scroll fluide iOS */
                padding: 16px;
                padding-top: 80px; /* Espace pour la toolbar fixe */
                position: relative;
            }

            .pdf-pages-container {
                max-width: 95%;
                margin: 0 auto;
            }

            .pdf-page-wrapper {
                position: relative;
                margin-bottom: 24px;
                background: white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                border-radius: 4px;
                overflow: hidden;
            }

            .pdf-canvas-container {
                position: relative;
                width: 100%;
            }

            .pdf-canvas,
            .annotation-canvas {
                display: block;
                width: 100%;
                height: auto;
            }

            .annotation-canvas {
                position: absolute;
                top: 0;
                left: 0;
                /* Toujours VISIBLE pour voir les annotations */
                /* Mais transparent aux événements par défaut */
                pointer-events: none !important;
                /* Désactiver la sélection bleue sur iOS */
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
                /* Z-index bas pour laisser passer les touches */
                z-index: 1;
            }

            /* Classe ajoutée dynamiquement quand stylet détecté */
            .annotation-canvas.pen-active {
                /* GARDER pointer-events: none PERMANENT */
                /* Les événements sont capturés au niveau du viewer, pas du canvas */
                /* Cela évite que le canvas avec passive:false bloque le scroll des doigts */
                z-index: 10; /* Monter au-dessus pour l'affichage */
            }

            /* Conteneur principal doit supporter le zoom et scroll */
            .pdf-viewer {
                touch-action: pan-x pan-y pinch-zoom;
                -webkit-overflow-scrolling: touch;
                overflow: auto;
                /* Désactiver la sélection sur tout le viewer */
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
            }

            .pdf-pages-container {
                touch-action: pan-x pan-y pinch-zoom;
                overflow: visible;
            }

            .pdf-page-wrapper {
                touch-action: pan-x pan-y pinch-zoom;
            }

            /* Loading */
            .pdf-loading {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255,255,255,0.9);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }

            .spinner {
                width: 50px;
                height: 50px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #007aff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            /* Curseur Apple Pencil Pro */
            .pencil-cursor {
                position: absolute;
                pointer-events: none;
                z-index: 10000;
                transition: opacity 0.15s ease;
            }

            /* Curseur stylo - simple point (taille dynamique définie par JS) */
            .pencil-cursor.pen-cursor {
                border-radius: 50%;
                background: var(--cursor-color, #000);
                border: 2px solid rgba(255, 255, 255, 0.8);
                box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
                transform: translate(-50%, -50%);
                transition: width 0.1s ease, height 0.1s ease;
            }

            /* Curseur gomme - effet liquid glass (taille dynamique définie par JS) */
            .pencil-cursor.eraser-cursor {
                border-radius: 50%;
                background: linear-gradient(135deg,
                    rgba(255, 255, 255, 0.4) 0%,
                    rgba(255, 255, 255, 0.1) 50%,
                    rgba(255, 255, 255, 0.2) 100%);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 2px solid rgba(255, 255, 255, 0.6);
                box-shadow:
                    0 8px 32px rgba(0, 0, 0, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.9),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.1);
                transform: translate(-50%, -50%);
                transition: width 0.15s ease, height 0.15s ease;
            }

            /* Animation liquid pour la gomme */
            .pencil-cursor.eraser-cursor::before {
                content: '';
                position: absolute;
                inset: 4px;
                border-radius: 50%;
                background: radial-gradient(circle at 30% 30%,
                    rgba(255, 255, 255, 0.8) 0%,
                    rgba(255, 255, 255, 0.2) 50%,
                    transparent 100%);
                animation: liquid-shimmer 2s ease-in-out infinite;
            }

            @keyframes liquid-shimmer {
                0%, 100% {
                    opacity: 0.6;
                    transform: scale(1);
                }
                50% {
                    opacity: 1;
                    transform: scale(1.1);
                }
            }

            /* Bouton de configuration du graphique */
            .graph-config-btn {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: white;
                border: 2px solid #4F46E5;
                color: #4F46E5;
                font-size: 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
                transition: all 0.2s ease;
                z-index: 100;
            }

            .graph-config-btn:hover {
                background: #4F46E5;
                color: white;
                transform: scale(1.05);
                box-shadow: 0 6px 16px rgba(79, 70, 229, 0.3);
            }

            .graph-config-btn:active {
                transform: scale(0.95);
            }

            /* Bouton de configuration de la frise chronologique */
            .timeline-config-btn {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: white;
                border: 2px solid #667eea;
                color: #667eea;
                font-size: 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
                transition: all 0.2s ease;
                z-index: 100;
            }

            .timeline-config-btn:hover {
                background: #667eea;
                color: white;
                transform: scale(1.05);
                box-shadow: 0 6px 16px rgba(102, 126, 234, 0.3);
            }

            .timeline-config-btn:active {
                transform: scale(0.95);
            }

            /* Bouton d'animation du marcheur sur la frise */
            .timeline-animation-btn {
                position: absolute;
                top: 16px;
                right: 76px;
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                transition: all 0.2s ease;
                z-index: 100;
            }

            .timeline-animation-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }

            .timeline-animation-btn:active {
                transform: scale(0.95);
            }

            /* Bouton mode test sur la frise */
            .timeline-test-btn {
                position: absolute;
                top: 16px;
                right: 136px;
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
                transition: all 0.2s ease;
                z-index: 100;
            }

            .timeline-test-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
            }

            .timeline-test-btn:active {
                transform: scale(0.95);
            }

            /* Bouton quitter le mode test */
            .timeline-exit-test-btn {
                position: absolute;
                top: 16px;
                right: 16px;
                padding: 10px 20px;
                border-radius: 8px;
                background: #ef4444;
                border: none;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
                transition: all 0.2s ease;
                z-index: 100;
            }

            .timeline-exit-test-btn:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
            }

            /* Sélecteur d'emoji pour la frise */
            .emoji-option:hover {
                background: #e0e7ff !important;
                transform: scale(1.2);
            }

            .emoji-dropdown::-webkit-scrollbar {
                width: 6px;
            }

            .emoji-dropdown::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
            }

            .emoji-dropdown::-webkit-scrollbar-thumb {
                background: #c7d2fe;
                border-radius: 3px;
            }

            .emoji-dropdown::-webkit-scrollbar-thumb:hover {
                background: #a5b4fc;
            }

            /* Panneau de configuration du graphique */
            .graph-config-panel {
                position: fixed;
                top: 0;
                right: -450px;
                width: 450px;
                height: 100vh;
                background: white;
                box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
                z-index: 10001;
                display: flex;
                flex-direction: column;
                transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .graph-config-panel.open {
                right: 0;
            }

            .graph-config-header {
                padding: 24px;
                background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .graph-config-header h3 {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
            }

            .graph-config-close {
                background: transparent;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                width: 36px;
                height: 36px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            }

            .graph-config-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .graph-config-body {
                flex: 1;
                overflow-y: auto;
                padding: 24px;
            }

            .graph-config-section {
                margin-bottom: 32px;
            }

            .graph-config-section h4 {
                margin: 0 0 16px 0;
                font-size: 16px;
                font-weight: 600;
                color: #1F2937;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .graph-config-section h4 i {
                color: #4F46E5;
            }

            .graph-input-group {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-bottom: 12px;
            }

            .graph-input-wrapper {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .graph-input-wrapper label {
                font-size: 13px;
                font-weight: 500;
                color: #6B7280;
            }

            .graph-input-wrapper input {
                padding: 10px 12px;
                border: 2px solid #E5E7EB;
                border-radius: 8px;
                font-size: 14px;
                transition: all 0.2s;
            }

            .graph-input-wrapper input:focus {
                outline: none;
                border-color: #4F46E5;
                box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
            }

            .graph-checkbox-wrapper {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px;
                background: #F9FAFB;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s;
            }

            .graph-checkbox-wrapper:hover {
                background: #F3F4F6;
            }

            .graph-checkbox-wrapper input[type="checkbox"] {
                width: 20px;
                height: 20px;
                cursor: pointer;
                accent-color: #4F46E5;
            }

            .graph-checkbox-wrapper label {
                font-size: 14px;
                color: #374151;
                cursor: pointer;
                flex: 1;
            }

            /* Liste des fonctions */
            .graph-functions-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 16px;
            }

            .graph-function-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px;
                background: #F9FAFB;
                border: 2px solid #E5E7EB;
                border-radius: 10px;
                transition: all 0.2s;
            }

            .graph-function-item:hover {
                border-color: #4F46E5;
                background: white;
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.1);
            }

            .graph-function-color {
                width: 32px;
                height: 32px;
                border-radius: 6px;
                border: none;
                cursor: pointer;
                transition: transform 0.2s;
            }

            .graph-function-color:hover {
                transform: scale(1.1);
            }

            .graph-function-input {
                flex: 1;
                padding: 8px 12px;
                border: 1px solid #D1D5DB;
                border-radius: 6px;
                font-size: 14px;
                font-family: 'Courier New', monospace;
            }

            .graph-function-input:focus {
                outline: none;
                border-color: #4F46E5;
            }

            .graph-function-input.error {
                border-color: #EF4444;
                background: #FEF2F2;
            }

            .graph-function-delete {
                width: 32px;
                height: 32px;
                border: none;
                background: #FEE2E2;
                color: #DC2626;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .graph-function-delete:hover {
                background: #DC2626;
                color: white;
            }

            .graph-add-function-btn {
                width: 100%;
                padding: 12px;
                background: #4F46E5;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            }

            .graph-add-function-btn:hover {
                background: #4338CA;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
            }

            .graph-add-function-btn:active {
                transform: translateY(0);
            }

            .graph-config-footer {
                padding: 20px 24px;
                border-top: 1px solid #E5E7EB;
                background: #F9FAFB;
            }

            .graph-apply-btn {
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }

            .graph-apply-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(79, 70, 229, 0.4);
            }

            .graph-apply-btn:active {
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Configurer les event listeners
     */
    setupEventListeners() {
        // Outils
        this.container.querySelectorAll('.btn-tool').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.tool;
                this.setTool(tool);
            });
        });

        // Boutons de couleur (fixes)
        this.container.querySelectorAll('.btn-color[data-color]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();

                // Retirer la classe active de tous les boutons de couleur
                this.container.querySelectorAll('.btn-color').forEach(b => b.classList.remove('active'));
                this.container.querySelector('.custom-color-wrapper').classList.remove('active');

                // Activer le bouton cliqué
                btn.classList.add('active');

                // Utiliser la couleur du bouton
                this.currentColor = btn.dataset.color;
            });
        });

        // Color picker (couleur personnalisée)
        this.elements.colorPicker.addEventListener('change', (e) => {
            this.currentColor = e.target.value;

            // Mettre à jour la couleur du bouton custom
            const btnCustom = this.container.querySelector('#btn-custom-color');
            btnCustom.style.background = e.target.value;

            console.log('[ColorPicker] Couleur changée:', e.target.value);
        });

        this.elements.colorPicker.addEventListener('click', () => {
            // Retirer active des autres boutons
            this.container.querySelectorAll('.btn-color').forEach(b => b.classList.remove('active'));

            // Activer le wrapper du color picker
            this.container.querySelector('.custom-color-wrapper').classList.add('active');
        });

        // Boutons de taille
        this.container.querySelectorAll('.btn-size').forEach(btn => {
            btn.addEventListener('click', () => {
                // Retirer la classe active de tous les boutons
                this.container.querySelectorAll('.btn-size').forEach(b => b.classList.remove('active'));

                // Activer le bouton cliqué
                btn.classList.add('active');

                // Définir la taille
                this.currentSize = parseInt(btn.dataset.size);

                // Mettre à jour le curseur si visible
                if (this.cursorVisible) {
                    this.updatePencilCursor(this.lastHoverX, this.lastHoverY, true);
                }
            });
        });

        // Actions
        this.elements.btnUndo.addEventListener('click', () => this.undo());
        this.elements.btnRedo.addEventListener('click', () => this.redo());
        this.elements.btnClearPage.addEventListener('click', () => this.clearCurrentPage());
        this.elements.btnDownload.addEventListener('click', () => this.showDownloadMenu());
        this.elements.btnClose.addEventListener('click', () => this.close());

        // Mini-toolbar event handlers
        this.elements.miniToolbar.querySelectorAll('[data-mini-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.miniTool;
                if (tool === 'undo') {
                    this.undo();
                } else if (tool === 'redo') {
                    this.redo();
                } else {
                    this.setTool(tool);
                }
            });
        });

        // Détection du zoom natif pour afficher/masquer la mini-toolbar
        this.setupZoomDetection();

        // Scroll viewer pour détecter la page actuelle
        this.elements.viewer.addEventListener('scroll', () => {
            this.updateCurrentPageFromScroll();
            // Mettre à jour la position des contrôles de texte lors du scroll
            if (this.selectedTextBox) {
                this.updateTextBoxControlsPosition();
            }
        });

        // NOUVELLE APPROCHE: Capturer les événements stylet au niveau du VIEWER
        // Les canvas gardent pointer-events: none en PERMANENCE
        // Cela évite que le canvas bloque le scroll des doigts avec ses listeners passive:false
        this.penDetected = false;

        // Variable pour traquer si on est en mode annotation (stylet actif)
        this.isAnnotating = false;

        // IMPORTANT: Sur iOS, il faut bloquer touchstart pour empêcher le scroll du stylet
        // On ne peut pas utiliser seulement preventDefault() dans pointerdown
        this.elements.viewer.addEventListener('touchstart', (e) => {
            console.log(`[Viewer NEW] touchstart - touches: ${e.touches.length}`);

            // Si on est en train d'annoter (stylet détecté via pointer events)
            // OU si l'équerre est active (bloquer scroll/zoom des doigts)
            if (this.isAnnotating || this.setSquareActive) {
                console.log('[Viewer NEW] touchstart - BLOQUANT (annotation en cours ou équerre active)');
                e.preventDefault();
            }
        }, { passive: false });

        this.elements.viewer.addEventListener('touchmove', (e) => {
            if (this.isAnnotating || this.setSquareActive) {
                // Log seulement occasionnellement pour éviter de surcharger la console
                if (Math.random() < 0.01) {
                    console.log('[Viewer NEW] touchmove - BLOQUANT (annotation en cours ou équerre active)');
                }
                e.preventDefault();
            }
        }, { passive: false });

        // Gestionnaire Apple Pencil Pro squeeze (pincement)
        // Sur Apple Pencil Pro avec iOS 17.5+, le squeeze est détecté via plusieurs méthodes
        this.lastPencilInteraction = 0;
        this.previousTool = 'pen'; // Pour mémoriser l'outil avant la gomme

        // Méthode 1: Événement pointerdown avec button spécial
        document.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'pen') {
                const now = Date.now();
                const timeSinceLastInteraction = now - this.lastPencilInteraction;

                // Logger TOUS les événements pen pour debugging
                console.log('[Apple Pencil Debug] pointerdown - button:', e.button, 'buttons:', e.buttons, 'pressure:', e.pressure, 'tiltX:', e.tiltX, 'tiltY:', e.tiltY);

                // Apple Pencil Pro squeeze: peut être détecté via plusieurs valeurs
                // button === 5 (eraser button sur certains modèles)
                // button === -1 (squeeze sur certains iOS)
                // button === 2 (bouton droit)
                // button === 32 (autre valeur squeeze)
                // buttons & 32 (bit 5 pour eraser/squeeze)
                const isSqueezeOrTap =
                    e.button === 5 ||  // Eraser button
                    e.button === -1 || // Squeeze gesture
                    e.button === 2 ||  // Right click / squeeze
                    e.button === 32 || // Squeeze value
                    (e.buttons & 32) !== 0; // Bit 5 set

                if (isSqueezeOrTap) {
                    console.log('[Apple Pencil Pro] ✅ SQUEEZE DÉTECTÉ ! button:', e.button, 'buttons:', e.buttons);
                    this.handlePencilDoubleTap();
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                this.lastPencilInteraction = now;
            }
        }, { capture: true, passive: false });

        // Méthode 2: Écouter l'événement 'pencilsqueeze' (si disponible sur iOS)
        if ('onpencilsqueeze' in document) {
            document.addEventListener('pencilsqueeze', (e) => {
                console.log('[Apple Pencil Pro] Événement pencilsqueeze natif détecté');
                this.handlePencilDoubleTap();
                e.preventDefault();
            });
        }

        // Méthode 3: Tester avec contextmenu (squeeze peut déclencher le menu contextuel)
        document.addEventListener('contextmenu', (e) => {
            console.log('[Apple Pencil Debug] contextmenu déclenché - type:', e.type);

            // Vérifier si c'est près d'un événement pen récent
            const timeSinceLastPen = Date.now() - this.lastPencilInteraction;
            if (timeSinceLastPen < 300) { // Dans les 300ms après un événement pen
                console.log('[Apple Pencil Pro] ✅ SQUEEZE détecté via contextmenu !');
                this.handlePencilDoubleTap();
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { capture: true });

        // Méthode 4: Écouter les événements avec modificateurs (iOS peut mapper le squeeze à un modificateur)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') {
                console.log('[Apple Pencil Debug] Touche modificateur:', e.key);
                const timeSinceLastPen = Date.now() - this.lastPencilInteraction;
                if (timeSinceLastPen < 200) {
                    console.log('[Apple Pencil Pro] ✅ SQUEEZE possible détecté via modificateur !');
                    this.handlePencilDoubleTap();
                }
            }
        });

        // Gestionnaires pointer events au niveau viewer
        this.elements.viewer.addEventListener('pointerdown', (e) => {
            console.log(`[Viewer NEW] pointerdown type: ${e.pointerType}`);
            this.lastPointerType = e.pointerType;

            // Masquer le curseur lors du contact
            if (e.pointerType === 'pen') {
                this.updatePencilCursor(0, 0, false);
            }

            // Activer visuellement les canvas au premier contact stylet
            // OPTIMISÉ: Utiliser requestAnimationFrame pour éviter de bloquer le thread principal
            if (e.pointerType === 'pen' && !this.penDetected) {
                console.log('[Viewer NEW] PREMIER contact stylet - activation visuelle des canvas');
                this.penDetected = true;

                // Activation asynchrone pour ne pas bloquer le début du trait
                requestAnimationFrame(() => {
                    const canvases = this.container.querySelectorAll('.annotation-canvas');
                    canvases.forEach(canvas => {
                        canvas.classList.add('pen-active');
                    });
                });
            }

            // Stylet = annotation, bloquer scroll et démarrer annotation
            if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
                console.log(`[Viewer NEW] ${e.pointerType === 'pen' ? 'Stylet' : 'Souris'} détecté - bloquant scroll`);
                this.isAnnotating = true;
                e.preventDefault();
                e.stopPropagation();

                // Trouver le canvas correspondant à la position du pointeur
                const canvas = this.getCanvasAtPoint(e.clientX, e.clientY);
                if (canvas) {
                    // Récupérer le pageId depuis le wrapper parent
                    const wrapper = canvas.closest('.pdf-page-wrapper');
                    // NE PAS utiliser parseInt car les pageId custom sont des strings (ex: "1_1765040967410")
                    const pageIdStr = wrapper ? wrapper.dataset.pageId : undefined;
                    const pageId = pageIdStr && pageIdStr.includes('_') ? pageIdStr : parseInt(pageIdStr);
                    console.log(`[Viewer NEW] Canvas trouvé pour pageId: ${pageId}`);
                    this.startAnnotation(e, canvas, pageId);
                } else {
                    console.log('[Viewer NEW] ERREUR: Aucun canvas trouvé à cette position');
                }
            } else if (e.pointerType === 'touch') {
                // Si l'équerre est active, NE PAS bloquer la propagation
                // Les gestionnaires de l'équerre au niveau document ont besoin de recevoir ces événements
                if (this.setSquareActive) {
                    console.log('[Viewer NEW] Touch détecté - laissant passer pour équerre');
                    this.isAnnotating = false;
                    // NE PAS e.preventDefault() ni e.stopPropagation()
                } else {
                    console.log('[Viewer NEW] Touch détecté - LAISSANT PASSER pour scroll/zoom');
                    this.isAnnotating = false;
                    // NE RIEN FAIRE - laisser le scroll natif fonctionner
                }
            }
        }, { passive: false });

        this.elements.viewer.addEventListener('pointermove', (e) => {
            // Afficher le curseur pour l'Apple Pencil Pro (hover)
            // SEULEMENT si on n'est pas en train de dessiner
            if (e.pointerType === 'pen' && !this.isDrawing) {
                // Calculer les coordonnées relatives au viewer
                const viewerRect = this.elements.viewer.getBoundingClientRect();
                const relativeX = e.clientX - viewerRect.left + this.elements.viewer.scrollLeft;
                const relativeY = e.clientY - viewerRect.top + this.elements.viewer.scrollTop;
                this.updatePencilCursor(relativeX, relativeY, true);
            }

            if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
                e.preventDefault();
                e.stopPropagation();

                if (this.isDrawing && this.currentCanvas) {
                    this.continueAnnotation(e, this.currentCanvas, this.currentPageId);
                }
            }
        }, { passive: false });

        this.elements.viewer.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
                console.log('[Viewer NEW] pointerup - fin annotation');
                this.isAnnotating = false;
                e.preventDefault();
                e.stopPropagation();

                if (this.isDrawing && this.currentCanvas) {
                    this.endAnnotation(e, this.currentCanvas, this.currentPageId);
                }

                // Réafficher le curseur après le contact
                if (e.pointerType === 'pen') {
                    const viewerRect = this.elements.viewer.getBoundingClientRect();
                    const relativeX = e.clientX - viewerRect.left + this.elements.viewer.scrollLeft;
                    const relativeY = e.clientY - viewerRect.top + this.elements.viewer.scrollTop;
                    this.updatePencilCursor(relativeX, relativeY, true);
                }
            }
        }, { passive: false });

        this.elements.viewer.addEventListener('pointercancel', (e) => {
            if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
                console.log('[Viewer NEW] pointercancel - annulation annotation');
                this.isAnnotating = false;
                if (this.isDrawing && this.currentCanvas) {
                    this.endAnnotation(e, this.currentCanvas, this.currentPageId);
                }
            }
        }, { passive: false });

        // Masquer le curseur quand le stylet sort du viewer
        this.elements.viewer.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'pen') {
                this.updatePencilCursor(0, 0, false);
            }
        });

        // DEBUG: Vérifier si les événements touch arrivent au viewer
        this.elements.viewer.addEventListener('touchstart', (e) => {
            console.log(`[Viewer] touchstart - touches: ${e.touches.length}`);
            console.log(`[Viewer] Viewer scrollable? scrollHeight: ${this.elements.viewer.scrollHeight}, clientHeight: ${this.elements.viewer.clientHeight}`);
            console.log(`[Viewer] Overflow: ${window.getComputedStyle(this.elements.viewer).overflow}`);
            console.log(`[Viewer] touch-action: ${window.getComputedStyle(this.elements.viewer).touchAction}`);

            // Debug parents
            console.log(`[Container] .clean-pdf-viewer overflow: ${window.getComputedStyle(this.container).overflow}`);
            console.log(`[Container] .clean-pdf-viewer touch-action: ${window.getComputedStyle(this.container).touchAction}`);
            console.log(`[Body] overflow: ${window.getComputedStyle(document.body).overflow}`);
            console.log(`[Body] touch-action: ${window.getComputedStyle(document.body).touchAction}`);
        }, { passive: true });

        this.elements.viewer.addEventListener('touchmove', (e) => {
            // Log seulement occasionnellement pour éviter de surcharger la console
            if (Math.random() < 0.01) {
                console.log(`[Viewer] touchmove - touches: ${e.touches.length}, defaultPrevented: ${e.defaultPrevented}, scrollTop: ${this.elements.viewer.scrollTop}`);
            }
        }, { passive: true });

        // TEST CRITIQUE: Vérifier si le viewer PEUT scroller programmatiquement
        setTimeout(() => {
            console.log('═══ DIAGNOSTIC SCROLL ═══');
            const beforeScroll = this.elements.viewer.scrollTop;
            this.elements.viewer.scrollTop = 100;
            const afterScroll = this.elements.viewer.scrollTop;

            if (afterScroll !== 100) {
                console.error('❌ SCROLL BLOQUÉ - Le viewer ne peut PAS scroller!');
                console.log('Analyse de la hiérarchie CSS:');

                let el = this.elements.viewer;
                for (let i = 0; i < 5 && el; i++) {
                    const s = window.getComputedStyle(el);
                    console.log(`${i}. ${el.className || el.tagName}: overflow=${s.overflow}, position=${s.position}, height=${s.height}, maxHeight=${s.maxHeight}`);
                    el = el.parentElement;
                }
            } else {
                console.log('✅ Scroll programmatique OK - Le problème est ailleurs');
            }
        }, 2000);
    }

    /**
     * Configurer la détection du zoom natif Safari
     */
    setupZoomDetection() {
        if (!window.visualViewport) {
            console.log('[Zoom Detection] visualViewport non supporté');
            return;
        }

        console.log('[Zoom Detection] Configuration du détecteur de zoom');
        console.log('[Zoom Detection] miniToolbar element:', this.elements.miniToolbar);

        if (!this.elements.miniToolbar) {
            console.error('[Zoom Detection] ERREUR: miniToolbar non trouvé!');
            return;
        }

        const checkZoom = () => {
            const scale = window.visualViewport.scale || 1;
            const isZoomed = scale > 1.05; // Tolérance de 5%

            console.log('[Zoom Detection] Scale:', scale, 'isZoomed:', isZoomed);

            if (isZoomed) {
                // Afficher la mini-toolbar
                console.log('[Zoom Detection] Affichage de la mini-toolbar');
                this.elements.miniToolbar.classList.add('visible');

                // Adapter la taille et la position en fonction du zoom
                // pour qu'elle reste toujours à la même taille visuelle et position
                const vp = window.visualViewport;

                // Position désirée dans le viewport visible (en pixels du viewport)
                const desiredBottomVh = 50; // 50% de la hauteur du viewport
                const desiredRightPx = 20; // Marge depuis le bord droit du viewport

                // Calculer la position absolue en tenant compte de l'offset du zoom
                // offsetLeft/offsetTop indiquent où est le viewport par rapport à la page
                // Pour bottom: on utilise la position absolue dans la page
                const bottomPx = vp.offsetTop + vp.height * (desiredBottomVh / 100);

                // Pour right: on doit calculer depuis le bord droit de la page
                // pageWidth - (offsetLeft + vpWidth) = distance du bord droit du viewport au bord droit de la page
                // On ajoute la marge désirée
                const pageWidth = vp.width * scale;
                const rightPx = (pageWidth - (vp.offsetLeft + vp.width)) + desiredRightPx;

                // Appliquer la position et le scale inverse pour compenser le zoom
                this.elements.miniToolbar.style.bottom = `${bottomPx}px`;
                this.elements.miniToolbar.style.right = `${rightPx}px`;
                this.elements.miniToolbar.style.transform = `scale(${1 / scale})`;
                this.elements.miniToolbar.style.transformOrigin = 'bottom right';

                console.log('[Zoom Detection] VP offset:', vp.offsetLeft, vp.offsetTop,
                           'Position: bottom=' + bottomPx + 'px, right=' + rightPx + 'px, scale=' + (1/scale));
            } else {
                // Masquer la mini-toolbar
                console.log('[Zoom Detection] Masquage de la mini-toolbar');
                this.elements.miniToolbar.classList.remove('visible');
                // Réinitialiser les transformations
                this.elements.miniToolbar.style.transform = '';
            }
        };

        // Écouter les événements de resize et scroll du visualViewport
        window.visualViewport.addEventListener('resize', () => {
            console.log('[Zoom Detection] Event: resize');
            checkZoom();
        });
        window.visualViewport.addEventListener('scroll', () => {
            console.log('[Zoom Detection] Event: scroll');
            checkZoom();
        });

        // Vérification initiale
        console.log('[Zoom Detection] Vérification initiale...');
        checkZoom();
    }

    /**
     * Charger un PDF
     */
    async loadPDF(url) {
        console.log('[loadPDF] Début du chargement:', url);

        // Réinitialiser l'état d'annotation pour éviter que le viewer reste bloqué
        this.isAnnotating = false;
        this.isDrawing = false;

        this.showLoading(true);

        try {
            // Charger avec PDF.js
            console.log('[loadPDF] Création de la tâche de chargement...');
            const loadingTask = pdfjsLib.getDocument(url);
            console.log('[loadPDF] En attente du PDF...');
            this.pdf = await loadingTask.promise;
            console.log('[loadPDF] PDF chargé, nombre de pages:', this.pdf.numPages);
            this.totalPages = this.pdf.numPages;

            // Initialiser l'ordre des pages
            this.pageOrder = Array.from({length: this.totalPages}, (_, i) => i + 1);
            console.log('[loadPDF] Ordre des pages initialisé');

            // Initialiser les pages
            for (let i = 1; i <= this.totalPages; i++) {
                this.pages.set(i, {type: 'pdf', pageNum: i});
            }
            console.log('[loadPDF] Pages initialisées');

            // Rendre les miniatures et les pages
            console.log('[loadPDF] Début du rendu des miniatures...');
            await this.renderThumbnails();
            console.log('[loadPDF] Miniatures rendues, début du rendu des pages...');
            await this.renderPages();
            console.log('[loadPDF] Pages rendues');

            // Aller à la première page
            this.goToPage(1);
            console.log('[loadPDF] Navigation vers la page 1 terminée');

        } catch (error) {
            console.error('[loadPDF] Erreur chargement PDF:', error);
            alert('Erreur lors du chargement du PDF: ' + error.message);
        } finally {
            console.log('[loadPDF] Masquage du loading...');
            this.showLoading(false);
            console.log('[loadPDF] Chargement terminé');
        }
    }

    /**
     * Rendre les miniatures
     */
    async renderThumbnails() {
        console.log('[renderThumbnails] Début - pageOrder.length:', this.pageOrder.length);
        console.log('[renderThumbnails] thumbnailsContainer:', this.elements.thumbnailsContainer);
        console.log('[renderThumbnails] thumbnailsContainer display:', window.getComputedStyle(this.elements.thumbnailsContainer).display);
        console.log('[renderThumbnails] thumbnailsContainer dimensions:', this.elements.thumbnailsContainer.offsetWidth, 'x', this.elements.thumbnailsContainer.offsetHeight);
        this.elements.thumbnailsContainer.innerHTML = '';

        for (let i = 0; i < this.pageOrder.length; i++) {
            const pageId = this.pageOrder[i];
            const pageNumber = i + 1; // Numéro séquentiel (1, 2, 3, ...)
            console.log('[renderThumbnails] Création miniature pour pageId:', pageId, 'pageNumber:', pageNumber);
            const thumbnailItem = await this.createThumbnail(pageId, pageNumber);
            console.log('[renderThumbnails] thumbnailItem créé:', thumbnailItem);
            this.elements.thumbnailsContainer.appendChild(thumbnailItem);
            console.log('[renderThumbnails] thumbnailItem ajouté au DOM');
        }
        console.log('[renderThumbnails] Terminé - miniatures rendues:', this.pageOrder.length);
        console.log('[renderThumbnails] thumbnailsContainer final children count:', this.elements.thumbnailsContainer.children.length);
    }

    /**
     * Créer une miniature
     */
    async createThumbnail(pageId, pageNumber) {
        const div = document.createElement('div');
        div.className = 'thumbnail-wrapper';

        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item';
        thumb.dataset.pageId = pageId;

        const canvas = document.createElement('canvas');
        canvas.className = 'thumbnail-canvas';

        const numberLabel = document.createElement('div');
        numberLabel.className = 'thumbnail-number';
        numberLabel.textContent = pageNumber; // Afficher le numéro séquentiel

        thumb.appendChild(canvas);
        thumb.appendChild(numberLabel);

        // Long press sur miniature avec stylet = menu contextuel
        let longPressTimer = null;
        let longPressTriggered = false;
        let longPressStartX = 0;
        let longPressStartY = 0;
        const MOVE_TOLERANCE = 10; // pixels de tolérance pour le mouvement

        // Désactiver la sélection utilisateur sur les miniatures
        thumb.style.userSelect = 'none';
        thumb.style.webkitUserSelect = 'none';

        // Clic sur miniature = navigation (sauf si long press a été déclenché)
        thumb.addEventListener('click', (e) => {
            if (!longPressTriggered) {
                this.goToPage(pageId);
            }
            longPressTriggered = false; // Reset pour le prochain clic
        });

        // Clic droit sur miniature = menu contextuel
        thumb.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showPageContextMenu(e, pageId, pageNumber);
        });

        thumb.addEventListener('pointerdown', (e) => {
            // Seulement pour le stylet
            if (e.pointerType === 'pen') {
                console.log('[LongPress] pointerdown - stylet détecté');
                e.preventDefault(); // Empêcher la sélection native
                longPressTriggered = false;
                longPressStartX = e.clientX;
                longPressStartY = e.clientY;

                // Sauvegarder la position du pointeur
                const savedEvent = {
                    clientX: e.clientX,
                    clientY: e.clientY
                };

                longPressTimer = setTimeout(() => {
                    console.log('[LongPress] Timer déclenché - affichage menu');
                    longPressTriggered = true;
                    // Vibration haptique si disponible
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                    this.showPageContextMenu(savedEvent, pageId, pageNumber);
                }, 500); // 500ms pour le long press
            }
        });

        thumb.addEventListener('pointerup', (e) => {
            if (longPressTimer) {
                console.log('[LongPress] pointerup - annulation timer');
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });

        thumb.addEventListener('pointermove', (e) => {
            // Si le stylet bouge trop, annuler le long press
            if (longPressTimer) {
                const deltaX = Math.abs(e.clientX - longPressStartX);
                const deltaY = Math.abs(e.clientY - longPressStartY);

                if (deltaX > MOVE_TOLERANCE || deltaY > MOVE_TOLERANCE) {
                    console.log(`[LongPress] pointermove - mouvement trop grand (${deltaX}, ${deltaY}) - annulation`);
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }
        });

        thumb.addEventListener('pointercancel', (e) => {
            if (longPressTimer) {
                console.log('[LongPress] pointercancel - annulation timer');
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });

        // Rendre la miniature
        const pageData = this.pages.get(pageId);
        if (pageData && pageData.type === 'pdf') {
            await this.renderThumbnailCanvas(canvas, pageData.pageNum);
        }

        // Bouton +
        const addBtn = document.createElement('button');
        addBtn.className = 'thumbnail-add-btn';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Ajouter';
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showAddPageMenu(pageId);
        });

        div.appendChild(thumb);
        div.appendChild(addBtn);

        return div;
    }

    /**
     * Rendre une miniature sur canvas
     */
    async renderThumbnailCanvas(canvas, pageNum) {
        console.log('[renderThumbnailCanvas] Rendu miniature page:', pageNum);
        console.log('[renderThumbnailCanvas] Canvas element:', canvas);
        console.log('[renderThumbnailCanvas] Canvas parent:', canvas.parentElement);

        const page = await this.pdf.getPage(pageNum);
        const viewport = page.getViewport({scale: 0.2});

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        console.log('[renderThumbnailCanvas] Canvas dimensions SET TO:', canvas.width, 'x', canvas.height);
        console.log('[renderThumbnailCanvas] Canvas style:', window.getComputedStyle(canvas).display, window.getComputedStyle(canvas).width, window.getComputedStyle(canvas).height);

        const ctx = canvas.getContext('2d');
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;
        console.log('[renderThumbnailCanvas] ✅ Miniature rendue pour page:', pageNum);
        console.log('[renderThumbnailCanvas] Canvas AFTER render - displayed dimensions:', canvas.offsetWidth, 'x', canvas.offsetHeight);
    }

    /**
     * Rendre toutes les pages
     */
    async renderPages() {
        this.elements.pagesContainer.innerHTML = '';

        for (const pageId of this.pageOrder) {
            const pageWrapper = await this.createPageWrapper(pageId);
            this.elements.pagesContainer.appendChild(pageWrapper);
        }
    }

    /**
     * Créer un wrapper de page
     */
    async createPageWrapper(pageId) {
        const wrapper = document.createElement('div');
        wrapper.className = 'pdf-page-wrapper';
        wrapper.dataset.pageId = pageId;

        const container = document.createElement('div');
        container.className = 'pdf-canvas-container';

        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.className = 'pdf-canvas';

        const annotationCanvas = document.createElement('canvas');
        annotationCanvas.className = 'annotation-canvas';

        container.appendChild(pdfCanvas);
        container.appendChild(annotationCanvas);
        wrapper.appendChild(container);

        // Rendre la page
        const pageData = this.pages.get(pageId);
        if (pageData && pageData.type === 'pdf') {
            await this.renderPDFPage(pdfCanvas, annotationCanvas, pageData.pageNum, pageId);
        } else if (pageData && pageData.type === 'blank') {
            await this.renderBlankPage(pdfCanvas, annotationCanvas, pageId);
        } else if (pageData && pageData.type === 'graph') {
            await this.renderGraphPage(pdfCanvas, annotationCanvas, pageData.data, pageId);

            // Ajouter un bouton de configuration pour les pages graphiques
            const configBtn = document.createElement('button');
            configBtn.className = 'graph-config-btn';
            configBtn.innerHTML = '<i class="fas fa-cog"></i>';
            configBtn.title = 'Configurer le graphique';
            configBtn.addEventListener('click', () => this.openGraphConfigPanel(pageId));
            container.appendChild(configBtn);
        } else if (pageData && pageData.type === 'timeline') {
            await this.renderTimelinePage(pdfCanvas, annotationCanvas, pageData.data, pageId);

            // Ajouter un bouton de configuration pour les frises chronologiques
            const configBtn = document.createElement('button');
            configBtn.className = 'timeline-config-btn';
            configBtn.innerHTML = '<i class="fas fa-cog"></i>';
            configBtn.title = 'Configurer la frise chronologique';
            configBtn.addEventListener('click', () => this.openTimelineConfigPanel(pageId));
            container.appendChild(configBtn);

            // Ajouter les boutons si il y a des événements
            const events = pageData.data?.events || [];
            if (events.length > 0) {
                // Bouton mode test
                const testBtn = document.createElement('button');
                testBtn.className = 'timeline-test-btn';
                testBtn.innerHTML = '❓';
                testBtn.title = 'Mode test - Cliquez sur les événements pour révéler leur contenu';
                testBtn.addEventListener('click', () => this.startTimelineTestMode(pageId));
                container.appendChild(testBtn);

                // Bouton animation (seulement pour les frises horizontales)
                if (pageData.data?.orientation !== 'vertical') {
                    const animBtn = document.createElement('button');
                    animBtn.className = 'timeline-animation-btn';
                    animBtn.innerHTML = '🚶';
                    animBtn.title = 'Lancer l\'animation du marcheur';
                    animBtn.addEventListener('click', () => this.startTimelineWalkerAnimation(pageId));
                    container.appendChild(animBtn);
                }
            }
        }

        // Configurer les événements d'annotation
        this.setupAnnotationEvents(annotationCanvas, pageId);

        return wrapper;
    }

    /**
     * Rendre une page PDF sur canvas
     */
    async renderPDFPage(pdfCanvas, annotationCanvas, pageNum, pageId) {
        const page = await this.pdf.getPage(pageNum);

        // Calculer le scale pour occuper 95% de la largeur du viewer
        const viewerWidth = this.elements.viewer.clientWidth;
        const targetWidth = viewerWidth * 0.95;
        const baseViewport = page.getViewport({scale: 1});
        const calculatedScale = targetWidth / baseViewport.width;

        // Utiliser le scale calculé ou le scale actuel (pour le zoom)
        const scale = this.scale === 1.0 ? calculatedScale : this.scale;
        const viewport = page.getViewport({scale: scale});

        // Stocker le scale actuel pour l'utiliser lors de la création d'annotations
        this.currentScale = scale;

        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        annotationCanvas.width = viewport.width;
        annotationCanvas.height = viewport.height;

        const ctx = pdfCanvas.getContext('2d');
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        // Redessiner les annotations existantes en utilisant pageId
        this.redrawAnnotations(annotationCanvas, pageId);

        // Extraire et afficher les liens
        await this.renderPageLinks(page, viewport, pdfCanvas.parentElement, pageId);
    }

    /**
     * Rendre une page vierge
     */
    async renderBlankPage(pdfCanvas, annotationCanvas, pageId) {
        // Adapter la taille à celle des pages PDF (même logique que renderPDFPage)
        // Utiliser une page de référence si disponible, sinon taille A4
        let width, height;

        if (this.pdf && this.pdf.numPages > 0) {
            // Utiliser les dimensions de la première page PDF comme référence
            const referencePage = await this.pdf.getPage(1);
            const viewerWidth = this.elements.viewer.clientWidth;
            const targetWidth = viewerWidth * 0.95;
            const baseViewport = referencePage.getViewport({scale: 1});
            const calculatedScale = targetWidth / baseViewport.width;
            const scale = this.scale === 1.0 ? calculatedScale : this.scale;
            const viewport = referencePage.getViewport({scale: scale});
            width = viewport.width;
            height = viewport.height;
        } else {
            // Fallback: Page A4 à 96 DPI
            const viewerWidth = this.elements.viewer.clientWidth;
            const targetWidth = viewerWidth * 0.95;
            const a4Ratio = 297 / 210; // ratio hauteur/largeur A4
            width = targetWidth;
            height = width * a4Ratio;
        }

        pdfCanvas.width = width;
        pdfCanvas.height = height;
        annotationCanvas.width = width;
        annotationCanvas.height = height;

        const ctx = pdfCanvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Redessiner les annotations existantes si pageId est fourni
        if (pageId) {
            this.redrawAnnotations(annotationCanvas, pageId);
        }
    }

    /**
     * Rendre une page graphique
     */
    async renderGraphPage(pdfCanvas, annotationCanvas, graphData = {}, pageId) {
        // Adapter la taille à celle des pages PDF (même logique que renderBlankPage)
        let width, height;

        if (this.pdf && this.pdf.numPages > 0) {
            // Utiliser les dimensions de la première page PDF comme référence
            const referencePage = await this.pdf.getPage(1);
            const viewerWidth = this.elements.viewer.clientWidth;
            const targetWidth = viewerWidth * 0.95;
            const baseViewport = referencePage.getViewport({scale: 1});
            const calculatedScale = targetWidth / baseViewport.width;
            const scale = this.scale === 1.0 ? calculatedScale : this.scale;
            const viewport = referencePage.getViewport({scale: scale});
            width = viewport.width;
            height = viewport.height;
        } else {
            // Fallback: Page A4 à 96 DPI
            const viewerWidth = this.elements.viewer.clientWidth;
            const targetWidth = viewerWidth * 0.95;
            const a4Ratio = 297 / 210; // ratio hauteur/largeur A4
            width = targetWidth;
            height = width * a4Ratio;
        }

        pdfCanvas.width = width;
        pdfCanvas.height = height;
        annotationCanvas.width = width;
        annotationCanvas.height = height;

        const ctx = pdfCanvas.getContext('2d');

        // Fond blanc
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Paramètres du graphique
        const xMin = graphData.xMin ?? -10;
        const xMax = graphData.xMax ?? 10;
        const yMin = graphData.yMin ?? -10;
        const yMax = graphData.yMax ?? 10;
        const showGrid = graphData.showGrid ?? true;
        const gridSpacing = graphData.gridSpacing ?? 1;

        // Dessiner la grille si activée
        if (showGrid) {
            this.drawGraphGrid(ctx, width, height, xMin, xMax, yMin, yMax, gridSpacing);
        }

        // Dessiner les axes
        this.drawGraphAxes(ctx, width, height, xMin, xMax, yMin, yMax);

        // Dessiner les fonctions
        if (graphData.functions && graphData.functions.length > 0) {
            graphData.functions.forEach(func => {
                if (func.expression && func.expression.trim()) {
                    this.drawFunction(ctx, width, height, xMin, xMax, yMin, yMax, func.expression, func.color);
                }
            });
        }

        // Redessiner les annotations existantes si pageId est fourni
        if (pageId) {
            this.redrawAnnotations(annotationCanvas, pageId);
        }
    }

    /**
     * Dessiner les axes d'un graphique
     */
    drawGraphAxes(ctx, width, height, xMin, xMax, yMin, yMax) {
        const margin = 50;
        const graphWidth = width - 2 * margin;
        const graphHeight = height - 2 * margin;

        // Axes
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();

        // Axe X
        const zeroY = margin + graphHeight * (yMax / (yMax - yMin));
        ctx.moveTo(margin, zeroY);
        ctx.lineTo(width - margin, zeroY);

        // Axe Y
        const zeroX = margin + graphWidth * (-xMin / (xMax - xMin));
        ctx.moveTo(zeroX, margin);
        ctx.lineTo(zeroX, height - margin);

        ctx.stroke();

        // Graduations et labels
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';

        // Labels axe X
        for (let x = xMin; x <= xMax; x += 1) {
            const px = margin + graphWidth * ((x - xMin) / (xMax - xMin));
            ctx.fillText(x.toString(), px, zeroY + 20);

            // Graduation
            ctx.beginPath();
            ctx.moveTo(px, zeroY - 5);
            ctx.lineTo(px, zeroY + 5);
            ctx.stroke();
        }

        // Labels axe Y
        ctx.textAlign = 'right';
        for (let y = yMin; y <= yMax; y += 1) {
            const py = margin + graphHeight * ((yMax - y) / (yMax - yMin));
            ctx.fillText(y.toString(), zeroX - 10, py + 4);

            // Graduation
            ctx.beginPath();
            ctx.moveTo(zeroX - 5, py);
            ctx.lineTo(zeroX + 5, py);
            ctx.stroke();
        }
    }

    /**
     * Dessiner la grille d'un graphique
     */
    drawGraphGrid(ctx, width, height, xMin, xMax, yMin, yMax, spacing) {
        const margin = 50;
        const graphWidth = width - 2 * margin;
        const graphHeight = height - 2 * margin;

        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 1;

        // Lignes verticales
        for (let x = Math.ceil(xMin / spacing) * spacing; x <= xMax; x += spacing) {
            const px = margin + graphWidth * ((x - xMin) / (xMax - xMin));
            ctx.beginPath();
            ctx.moveTo(px, margin);
            ctx.lineTo(px, height - margin);
            ctx.stroke();
        }

        // Lignes horizontales
        for (let y = Math.ceil(yMin / spacing) * spacing; y <= yMax; y += spacing) {
            const py = margin + graphHeight * ((yMax - y) / (yMax - yMin));
            ctx.beginPath();
            ctx.moveTo(margin, py);
            ctx.lineTo(width - margin, py);
            ctx.stroke();
        }
    }

    /**
     * Dessiner une fonction mathématique
     */
    drawFunction(ctx, width, height, xMin, xMax, yMin, yMax, expression, color) {
        const margin = 50;
        const graphWidth = width - 2 * margin;
        const graphHeight = height - 2 * margin;

        // Nombre de points pour dessiner la courbe
        const numPoints = Math.max(500, graphWidth * 2);
        const step = (xMax - xMin) / numPoints;

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();

        let firstPoint = true;

        for (let i = 0; i <= numPoints; i++) {
            const x = xMin + i * step;
            let y;

            try {
                y = this.evaluateMathExpression(expression, x);

                // Vérifier si y est un nombre valide
                if (isNaN(y) || !isFinite(y)) continue;

                // Vérifier si y est dans les limites
                if (y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) continue;

                // Convertir en coordonnées canvas
                const px = margin + graphWidth * ((x - xMin) / (xMax - xMin));
                const py = margin + graphHeight * ((yMax - y) / (yMax - yMin));

                if (firstPoint) {
                    ctx.moveTo(px, py);
                    firstPoint = false;
                } else {
                    ctx.lineTo(px, py);
                }
            } catch (e) {
                // Ignorer les erreurs d'évaluation
                continue;
            }
        }

        ctx.stroke();
    }

    /**
     * Évaluer une expression mathématique avec une valeur x
     */
    evaluateMathExpression(expression, xValue) {
        // Remplacer x par la valeur
        let expr = expression.replace(/x/g, `(${xValue})`);

        // Remplacer les fonctions mathématiques
        expr = expr.replace(/sin/g, 'Math.sin');
        expr = expr.replace(/cos/g, 'Math.cos');
        expr = expr.replace(/tan/g, 'Math.tan');
        expr = expr.replace(/sqrt/g, 'Math.sqrt');
        expr = expr.replace(/abs/g, 'Math.abs');
        expr = expr.replace(/exp/g, 'Math.exp');
        expr = expr.replace(/log/g, 'Math.log');
        expr = expr.replace(/pow/g, 'Math.pow');

        // Remplacer ^ par **  (puissance)
        expr = expr.replace(/\^/g, '**');

        // Évaluer l'expression
        try {
            return eval(expr);
        } catch (e) {
            throw new Error('Invalid expression');
        }
    }

    /**
     * Rendre une page de frise chronologique
     */
    async renderTimelinePage(pdfCanvas, annotationCanvas, timelineData = {}, pageId) {
        // Adapter la taille à celle des pages PDF
        let width, height;

        if (this.pdf && this.pdf.numPages > 0) {
            const referencePage = await this.pdf.getPage(1);
            const viewerWidth = this.elements.viewer.clientWidth;
            const targetWidth = viewerWidth * 0.95;
            const baseViewport = referencePage.getViewport({scale: 1});
            const calculatedScale = targetWidth / baseViewport.width;
            const scale = this.scale === 1.0 ? calculatedScale : this.scale;
            const viewport = referencePage.getViewport({scale: scale});
            width = viewport.width;
            height = viewport.height;
        } else {
            const viewerWidth = this.elements.viewer.clientWidth;
            const targetWidth = viewerWidth * 0.95;
            const a4Ratio = 297 / 210;
            width = targetWidth;
            height = width * a4Ratio;
        }

        pdfCanvas.width = width;
        pdfCanvas.height = height;
        annotationCanvas.width = width;
        annotationCanvas.height = height;

        const ctx = pdfCanvas.getContext('2d');

        // Fond blanc
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Paramètres de la frise
        const orientation = timelineData.orientation || 'horizontal';
        const startYear = timelineData.startYear || new Date().getFullYear();
        const endYear = timelineData.endYear || new Date().getFullYear() + 10;
        const title = timelineData.title || 'Frise chronologique';
        const events = timelineData.events || [];
        const lineColor = timelineData.lineColor || '#667eea';
        const showYears = timelineData.showYears !== false;
        const tickInterval = timelineData.tickInterval || null;

        // Dessiner le titre
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 40);

        // Dessiner la frise
        if (orientation === 'horizontal') {
            this.drawHorizontalTimeline(ctx, width, height, startYear, endYear, events, lineColor, showYears, tickInterval);
        } else {
            this.drawVerticalTimeline(ctx, width, height, startYear, endYear, events, lineColor, showYears, tickInterval);
        }

        // Redessiner les annotations existantes
        if (pageId) {
            this.redrawAnnotations(annotationCanvas, pageId);
        }
    }

    /**
     * Calculer l'intervalle optimal pour les graduations de la frise
     * Retourne un intervalle qui donne entre 10 et 25 traits avec des nombres ronds
     */
    calculateOptimalInterval(yearRange, fixedInterval = null) {
        // Si un intervalle fixe est spécifié, l'utiliser
        if (fixedInterval && fixedInterval > 0) {
            return fixedInterval;
        }

        // Intervalles possibles (nombres ronds)
        const possibleIntervals = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

        // Chercher l'intervalle qui donne entre 10 et 25 traits
        for (const interval of possibleIntervals) {
            const numTicks = Math.floor(yearRange / interval) + 1;
            if (numTicks >= 10 && numTicks <= 25) {
                return interval;
            }
        }

        // Si aucun intervalle ne convient, calculer un intervalle approximatif
        const targetTicks = 15; // Viser 15 traits
        const rawInterval = yearRange / targetTicks;

        // Arrondir à un nombre "joli"
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
        const normalized = rawInterval / magnitude;

        let niceInterval;
        if (normalized <= 1.5) niceInterval = 1;
        else if (normalized <= 3) niceInterval = 2;
        else if (normalized <= 7) niceInterval = 5;
        else niceInterval = 10;

        return niceInterval * magnitude;
    }

    /**
     * Calculer les positions des événements pour éviter les chevauchements
     */
    calculateEventPositions(events, startYear, yearRange, lineLength, lineStartX, boxWidth) {
        // Trier les événements par année
        const sortedEvents = [...events].map((event, originalIndex) => ({
            ...event,
            originalIndex,
            x: lineStartX + (((event.year || startYear) - startYear) / yearRange) * lineLength
        })).sort((a, b) => a.x - b.x);

        // Calculer les niveaux pour éviter les chevauchements
        const minSpacing = boxWidth + 20; // Espacement minimum entre deux boîtes
        const topLevels = []; // Positions X occupées en haut à chaque niveau
        const bottomLevels = []; // Positions X occupées en bas à chaque niveau

        sortedEvents.forEach((event, idx) => {
            const eventX = event.x;
            let level = 0;
            let isTop = idx % 2 === 0; // Alterner par défaut

            // Chercher le niveau le plus proche de la ligne où l'événement peut être placé
            const levelsToCheck = isTop ? topLevels : bottomLevels;

            for (let l = 0; l < 10; l++) { // Max 10 niveaux
                const currentLevel = isTop ? topLevels[l] : bottomLevels[l];
                if (!currentLevel) {
                    // Ce niveau est vide
                    level = l;
                    break;
                }

                // Vérifier si on peut placer l'événement à ce niveau
                const canPlace = currentLevel.every(pos => Math.abs(pos - eventX) >= minSpacing);
                if (canPlace) {
                    level = l;
                    break;
                }
                level = l + 1;
            }

            // Enregistrer la position
            if (isTop) {
                if (!topLevels[level]) topLevels[level] = [];
                topLevels[level].push(eventX);
            } else {
                if (!bottomLevels[level]) bottomLevels[level] = [];
                bottomLevels[level].push(eventX);
            }

            event.level = level;
            event.isTop = isTop;
        });

        return sortedEvents;
    }

    /**
     * Dessiner une frise chronologique horizontale
     */
    drawHorizontalTimeline(ctx, width, height, startYear, endYear, events, lineColor, showYears, tickInterval = null, isAnimating = false, visibleEventIndices = null) {
        const margin = 80;
        const lineY = height / 2;
        const lineStartX = margin;
        const lineEndX = width - margin;
        const lineLength = lineEndX - lineStartX;
        const yearRange = endYear - startYear;

        // Ligne principale
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineY);
        ctx.lineTo(lineEndX, lineY);
        ctx.stroke();

        // Flèche à la fin
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(lineEndX, lineY);
        ctx.lineTo(lineEndX - 15, lineY - 8);
        ctx.lineTo(lineEndX - 15, lineY + 8);
        ctx.closePath();
        ctx.fill();

        // Marques d'années avec intervalle optimisé
        if (showYears) {
            const interval = this.calculateOptimalInterval(yearRange, tickInterval);
            const firstTick = Math.ceil(startYear / interval) * interval;

            ctx.fillStyle = '#4b5563';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';

            for (let year = firstTick; year <= endYear; year += interval) {
                const x = lineStartX + ((year - startYear) / yearRange) * lineLength;

                // Graduation
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, lineY - 10);
                ctx.lineTo(x, lineY + 10);
                ctx.stroke();

                // Année
                ctx.fillText(year.toString(), x, lineY + 30);
            }
        }

        // Calculer les positions des événements pour éviter les chevauchements
        const boxWidth = 150;
        const boxHeight = 70; // Augmenté pour l'emoji
        const positionedEvents = this.calculateEventPositions(events, startYear, yearRange, lineLength, lineStartX, boxWidth);

        // Filtrer les événements visibles
        const visibleEvents = positionedEvents.filter(event => {
            if (isAnimating && visibleEventIndices && !visibleEventIndices.includes(event.originalIndex)) {
                return false;
            }
            return true;
        });

        // PASSE 1 : Dessiner tous les traits pointillés et points EN PREMIER (pour qu'ils passent sous les boîtes)
        visibleEvents.forEach((event) => {
            const eventX = event.x;
            const baseOffset = 80;
            const levelOffset = event.level * (boxHeight + 20);
            const eventY = event.isTop ? lineY - baseOffset - levelOffset : lineY + baseOffset + levelOffset;
            const markerColor = event.color || '#3b82f6';

            // Ligne verticale vers l'événement (trait pointillé)
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(eventX, lineY);
            const lineEndY = event.isTop ? eventY + boxHeight / 2 : eventY - boxHeight / 2;
            ctx.lineTo(eventX, lineEndY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Point sur la ligne
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.arc(eventX, lineY, 8, 0, Math.PI * 2);
            ctx.fill();
        });

        // PASSE 2 : Dessiner toutes les boîtes d'événements PAR-DESSUS les traits
        visibleEvents.forEach((event) => {
            const eventX = event.x;
            const baseOffset = 80;
            const levelOffset = event.level * (boxHeight + 20);
            const eventY = event.isTop ? lineY - baseOffset - levelOffset : lineY + baseOffset + levelOffset;
            const markerColor = event.color || '#3b82f6';

            // Boîte d'événement
            const boxX = eventX - boxWidth / 2;
            const boxY = eventY - boxHeight / 2;

            // Ombre
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(boxX + 3, boxY + 3, boxWidth, boxHeight);

            // Fond
            ctx.fillStyle = 'white';
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

            // Emoji (si présent)
            let titleOffsetY = boxY + 20;
            if (event.emoji) {
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(event.emoji, eventX, boxY + 22);
                titleOffsetY = boxY + 40;
            }

            // Titre de l'événement
            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(event.title || 'Événement', eventX, titleOffsetY, boxWidth - 10);

            // Description
            if (event.description) {
                ctx.font = '10px Arial';
                ctx.fillStyle = '#6b7280';
                const words = event.description.split(' ');
                let line = '';
                let y = titleOffsetY + 14;

                for (let word of words) {
                    const testLine = line + word + ' ';
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > boxWidth - 20 && line.length > 0) {
                        ctx.fillText(line, eventX, y, boxWidth - 10);
                        line = word + ' ';
                        y += 12;
                        if (y > boxY + boxHeight - 8) break;
                    } else {
                        line = testLine;
                    }
                }
                if (y <= boxY + boxHeight - 8 && line.length > 0) {
                    ctx.fillText(line, eventX, y, boxWidth - 10);
                }
            }
        });

        return { lineStartX, lineEndX, lineY, positionedEvents };
    }

    /**
     * Dessiner le personnage marcheur sur la frise
     */
    drawWalker(ctx, x, y, direction = 1, frame = 0) {
        ctx.save();
        ctx.translate(x, y);
        if (direction < 0) ctx.scale(-1, 1);

        // Petit bonhomme stylisé
        const scale = 0.8;
        ctx.scale(scale, scale);

        // Tête
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(0, -35, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Yeux
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(-4, -38, 2, 0, Math.PI * 2);
        ctx.arc(4, -38, 2, 0, Math.PI * 2);
        ctx.fill();

        // Sourire
        ctx.beginPath();
        ctx.arc(0, -33, 5, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();

        // Corps
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(-8, -22, 16, 25);

        // Jambes (animation de marche)
        const legAngle = Math.sin(frame * 0.3) * 0.4;
        ctx.fillStyle = '#1f2937';

        // Jambe gauche
        ctx.save();
        ctx.translate(-4, 3);
        ctx.rotate(legAngle);
        ctx.fillRect(-3, 0, 6, 20);
        ctx.restore();

        // Jambe droite
        ctx.save();
        ctx.translate(4, 3);
        ctx.rotate(-legAngle);
        ctx.fillRect(-3, 0, 6, 20);
        ctx.restore();

        // Bras (animation de balancement)
        const armAngle = Math.sin(frame * 0.3) * 0.3;
        ctx.fillStyle = '#fbbf24';

        // Bras gauche
        ctx.save();
        ctx.translate(-8, -18);
        ctx.rotate(-armAngle);
        ctx.fillRect(-3, 0, 6, 15);
        ctx.restore();

        // Bras droit
        ctx.save();
        ctx.translate(8, -18);
        ctx.rotate(armAngle);
        ctx.fillRect(-3, 0, 6, 15);
        ctx.restore();

        ctx.restore();
    }

    /**
     * Lancer l'animation du marcheur sur la frise
     */
    startTimelineWalkerAnimation(pageId) {
        const pageData = this.pages.get(pageId);
        if (!pageData || pageData.type !== 'timeline') return;

        const data = pageData.data || {};
        const events = data.events || [];
        if (events.length === 0) return;

        // Arrêter toute animation précédente
        if (this.walkerAnimationId) {
            cancelAnimationFrame(this.walkerAnimationId);
            this.walkerAnimationId = null;
        }

        // Trouver le canvas
        const pageWrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
        if (!pageWrapper) return;
        const pdfCanvas = pageWrapper.querySelector('.pdf-canvas');
        if (!pdfCanvas) return;
        const ctx = pdfCanvas.getContext('2d');

        const width = pdfCanvas.width;
        const height = pdfCanvas.height;
        const margin = 80;
        const lineY = height / 2;
        const lineStartX = margin;
        const lineEndX = width - margin;
        const lineLength = lineEndX - lineStartX;
        const startYear = data.startYear || new Date().getFullYear();
        const endYear = data.endYear || new Date().getFullYear() + 10;
        const yearRange = endYear - startYear;
        const lineColor = data.lineColor || '#667eea';
        const tickInterval = data.tickInterval || null;

        // Trier les événements par année
        const sortedEvents = [...events].map((e, i) => ({
            ...e,
            originalIndex: i,
            x: lineStartX + (((e.year || startYear) - startYear) / yearRange) * lineLength
        })).sort((a, b) => a.x - b.x);

        let walkerX = lineStartX - 30;
        let currentEventIndex = -1;
        let eventDisplayTimer = 0;
        let visibleEvents = [];
        let frame = 0;
        let isShowingEvent = false;
        const eventDisplayDuration = 150; // Frames (environ 2.5 secondes à 60fps)
        const walkerSpeed = 2;

        const animate = () => {
            frame++;

            // Effacer et redessiner le fond
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);

            // Redessiner le titre
            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(data.title || 'Frise chronologique', width / 2, 40);

            // Redessiner la frise avec seulement les événements visibles
            this.drawHorizontalTimeline(
                ctx, width, height, startYear, endYear,
                events, lineColor, data.showYears !== false, tickInterval,
                true, visibleEvents
            );

            // Logique de l'animation
            if (!isShowingEvent) {
                // Le marcheur avance
                walkerX += walkerSpeed;

                // Vérifier si on atteint un événement
                const nextEvent = sortedEvents[currentEventIndex + 1];
                if (nextEvent && walkerX >= nextEvent.x) {
                    currentEventIndex++;
                    visibleEvents.push(nextEvent.originalIndex);
                    isShowingEvent = true;
                    eventDisplayTimer = 0;
                }

                // Vérifier si on a terminé
                if (walkerX > lineEndX + 30) {
                    // Animation terminée - redessiner la frise normalement en restant sur la page
                    (async () => {
                        await this.renderPages();
                        setTimeout(() => {
                            const newPageWrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
                            if (newPageWrapper) {
                                newPageWrapper.scrollIntoView({ behavior: 'instant', block: 'center' });
                            }
                        }, 50);
                    })();
                    return;
                }
            } else {
                // Afficher l'événement pendant un moment
                eventDisplayTimer++;
                if (eventDisplayTimer >= eventDisplayDuration) {
                    isShowingEvent = false;
                    // Retirer l'événement de la liste visible
                    const lastEventIndex = visibleEvents.pop();
                }
            }

            // Dessiner le marcheur
            this.drawWalker(ctx, walkerX, lineY - 10, 1, frame);

            this.walkerAnimationId = requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Lancer le mode test sur la frise chronologique
     * Les événements sont cachés et l'élève doit cliquer pour les révéler
     */
    startTimelineTestMode(pageId) {
        const pageData = this.pages.get(pageId);
        if (!pageData || pageData.type !== 'timeline') return;

        const data = pageData.data || {};
        const events = data.events || [];
        if (events.length === 0) return;

        // Trouver le wrapper et le canvas
        const pageWrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
        if (!pageWrapper) return;
        const canvasContainer = pageWrapper.querySelector('.pdf-canvas-container');
        const pdfCanvas = pageWrapper.querySelector('.pdf-canvas');
        if (!pdfCanvas || !canvasContainer) return;

        const ctx = pdfCanvas.getContext('2d');
        const width = pdfCanvas.width;
        const height = pdfCanvas.height;

        // Paramètres de la frise
        const orientation = data.orientation || 'horizontal';
        const startYear = data.startYear || new Date().getFullYear();
        const endYear = data.endYear || new Date().getFullYear() + 10;
        const lineColor = data.lineColor || '#667eea';
        const tickInterval = data.tickInterval || null;
        const yearRange = endYear - startYear;

        // Cacher les boutons normaux
        const configBtn = canvasContainer.querySelector('.timeline-config-btn');
        const animBtn = canvasContainer.querySelector('.timeline-animation-btn');
        const testBtn = canvasContainer.querySelector('.timeline-test-btn');
        if (configBtn) configBtn.style.display = 'none';
        if (animBtn) animBtn.style.display = 'none';
        if (testBtn) testBtn.style.display = 'none';

        // Ajouter le bouton pour quitter le mode test
        const exitBtn = document.createElement('button');
        exitBtn.className = 'timeline-exit-test-btn';
        exitBtn.innerHTML = '✕ Quitter le test';
        exitBtn.addEventListener('click', () => this.exitTimelineTestMode(pageId));
        canvasContainer.appendChild(exitBtn);

        // Créer l'overlay pour les cartes cliquables
        const overlay = document.createElement('div');
        overlay.className = 'timeline-test-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
        `;
        canvasContainer.appendChild(overlay);

        // Redessiner la frise avec les événements cachés
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Titre
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(data.title || 'Frise chronologique', width / 2, 40);

        // Dessiner la frise de base (ligne et graduations) mais pas les événements normaux
        if (orientation === 'horizontal') {
            this.drawTimelineTestModeHorizontal(ctx, pdfCanvas, width, height, startYear, endYear, events, lineColor, data.showYears !== false, tickInterval, overlay);
        } else {
            this.drawTimelineTestModeVertical(ctx, pdfCanvas, width, height, startYear, endYear, events, lineColor, data.showYears !== false, tickInterval, overlay);
        }

        // Stocker l'état du mode test
        pageData.testMode = true;
    }

    /**
     * Dessiner la frise horizontale en mode test
     */
    drawTimelineTestModeHorizontal(ctx, canvas, width, height, startYear, endYear, events, lineColor, showYears, tickInterval, overlay) {
        const margin = 80;
        const lineY = height / 2;
        const lineStartX = margin;
        const lineEndX = width - margin;
        const lineLength = lineEndX - lineStartX;
        const yearRange = endYear - startYear;

        // Ligne principale
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineY);
        ctx.lineTo(lineEndX, lineY);
        ctx.stroke();

        // Flèche à la fin
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(lineEndX, lineY);
        ctx.lineTo(lineEndX - 15, lineY - 8);
        ctx.lineTo(lineEndX - 15, lineY + 8);
        ctx.closePath();
        ctx.fill();

        // Marques d'années
        if (showYears) {
            const interval = this.calculateOptimalInterval(yearRange, tickInterval);
            const firstTick = Math.ceil(startYear / interval) * interval;

            ctx.fillStyle = '#4b5563';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';

            for (let year = firstTick; year <= endYear; year += interval) {
                const x = lineStartX + ((year - startYear) / yearRange) * lineLength;
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, lineY - 10);
                ctx.lineTo(x, lineY + 10);
                ctx.stroke();
                ctx.fillText(year.toString(), x, lineY + 30);
            }
        }

        // Calculer les positions des événements
        const boxWidth = 150;
        const boxHeight = 70;
        const positionedEvents = this.calculateEventPositions(events, startYear, yearRange, lineLength, lineStartX, boxWidth);

        // Obtenir les dimensions réelles du canvas sur l'écran
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / width;
        const scaleY = canvasRect.height / height;

        // Dessiner les points et les cartes cachées
        positionedEvents.forEach((event, idx) => {
            const eventX = event.x;
            const baseOffset = 80;
            const levelOffset = event.level * (boxHeight + 20);
            const eventY = event.isTop ? lineY - baseOffset - levelOffset : lineY + baseOffset + levelOffset;
            const markerColor = event.color || '#3b82f6';

            // Point sur la ligne
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.arc(eventX, lineY, 8, 0, Math.PI * 2);
            ctx.fill();

            // Trait pointillé
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(eventX, lineY);
            ctx.lineTo(eventX, event.isTop ? eventY + boxHeight / 2 : eventY - boxHeight / 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Boîte cachée (avec ?)
            const boxX = eventX - boxWidth / 2;
            const boxY = eventY - boxHeight / 2;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(boxX + 3, boxY + 3, boxWidth, boxHeight);

            ctx.fillStyle = '#f3f4f6';
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

            // Année
            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(event.year.toString(), eventX, boxY + 25);

            // Point d'interrogation
            ctx.font = 'bold 28px Arial';
            ctx.fillStyle = '#9ca3af';
            ctx.fillText('?', eventX, boxY + 55);

            // Créer la zone cliquable HTML
            const clickZone = document.createElement('div');
            clickZone.className = 'timeline-test-card';
            clickZone.dataset.eventIndex = idx;
            clickZone.dataset.revealed = 'false';
            clickZone.style.cssText = `
                position: absolute;
                left: ${boxX * scaleX}px;
                top: ${boxY * scaleY}px;
                width: ${boxWidth * scaleX}px;
                height: ${boxHeight * scaleY}px;
                cursor: pointer;
                pointer-events: auto;
                border-radius: 4px;
            `;

            // Stocker les données de l'événement
            clickZone.dataset.eventData = JSON.stringify({
                x: eventX,
                y: eventY,
                boxX: boxX,
                boxY: boxY,
                boxWidth: boxWidth,
                boxHeight: boxHeight,
                year: event.year,
                title: event.title,
                description: event.description,
                emoji: event.emoji,
                color: markerColor
            });

            clickZone.addEventListener('click', (e) => this.revealTimelineEvent(e, ctx, canvas, scaleX, scaleY));
            overlay.appendChild(clickZone);
        });
    }

    /**
     * Dessiner la frise verticale en mode test
     */
    drawTimelineTestModeVertical(ctx, canvas, width, height, startYear, endYear, events, lineColor, showYears, tickInterval, overlay) {
        const marginTop = 100;
        const marginBottom = 80;
        const lineX = width / 2;
        const lineStartY = marginTop;
        const lineEndY = height - marginBottom;
        const lineLength = lineEndY - lineStartY;
        const yearRange = endYear - startYear;

        // Ligne principale
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(lineX, lineStartY);
        ctx.lineTo(lineX, lineEndY);
        ctx.stroke();

        // Flèche en bas
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(lineX, lineEndY);
        ctx.lineTo(lineX - 8, lineEndY - 15);
        ctx.lineTo(lineX + 8, lineEndY - 15);
        ctx.closePath();
        ctx.fill();

        // Marques d'années
        if (showYears) {
            const interval = this.calculateOptimalInterval(yearRange, tickInterval);
            const firstTick = Math.ceil(startYear / interval) * interval;

            ctx.fillStyle = '#4b5563';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';

            for (let year = firstTick; year <= endYear; year += interval) {
                const y = lineStartY + ((year - startYear) / yearRange) * lineLength;
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(lineX - 10, y);
                ctx.lineTo(lineX + 10, y);
                ctx.stroke();
                ctx.fillText(year.toString(), lineX + 20, y + 5);
            }
        }

        // Calculer les positions des événements
        const boxWidth = 150;
        const boxHeight = 70;
        const positionedEvents = this.calculateVerticalEventPositions(events, startYear, yearRange, lineLength, lineStartY, boxHeight);

        // Obtenir les dimensions réelles du canvas sur l'écran
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / width;
        const scaleY = canvasRect.height / height;

        // Dessiner les points et les cartes cachées
        positionedEvents.forEach((event, idx) => {
            const eventY = event.y;
            const baseOffset = 200;
            const levelOffset = event.level * (boxWidth + 20);
            const eventX = event.isLeft ? lineX - baseOffset - levelOffset : lineX + baseOffset + levelOffset;
            const markerColor = event.color || '#3b82f6';

            // Point sur la ligne
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.arc(lineX, eventY, 8, 0, Math.PI * 2);
            ctx.fill();

            // Trait pointillé
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(lineX, eventY);
            ctx.lineTo(event.isLeft ? eventX + boxWidth / 2 : eventX - boxWidth / 2, eventY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Boîte cachée (avec ?)
            const boxX = eventX - boxWidth / 2;
            const boxY = eventY - boxHeight / 2;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(boxX + 3, boxY + 3, boxWidth, boxHeight);

            ctx.fillStyle = '#f3f4f6';
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

            // Année
            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(event.year.toString(), eventX, boxY + 25);

            // Point d'interrogation
            ctx.font = 'bold 28px Arial';
            ctx.fillStyle = '#9ca3af';
            ctx.fillText('?', eventX, boxY + 55);

            // Créer la zone cliquable HTML
            const clickZone = document.createElement('div');
            clickZone.className = 'timeline-test-card';
            clickZone.dataset.eventIndex = idx;
            clickZone.dataset.revealed = 'false';
            clickZone.style.cssText = `
                position: absolute;
                left: ${boxX * scaleX}px;
                top: ${boxY * scaleY}px;
                width: ${boxWidth * scaleX}px;
                height: ${boxHeight * scaleY}px;
                cursor: pointer;
                pointer-events: auto;
                border-radius: 4px;
            `;

            // Stocker les données de l'événement
            clickZone.dataset.eventData = JSON.stringify({
                x: eventX,
                y: eventY,
                boxX: boxX,
                boxY: boxY,
                boxWidth: boxWidth,
                boxHeight: boxHeight,
                year: event.year,
                title: event.title,
                description: event.description,
                emoji: event.emoji,
                color: markerColor
            });

            clickZone.addEventListener('click', (e) => this.revealTimelineEvent(e, ctx, canvas, scaleX, scaleY));
            overlay.appendChild(clickZone);
        });
    }

    /**
     * Révéler un événement lors du clic en mode test
     */
    revealTimelineEvent(e, ctx, canvas, scaleX, scaleY) {
        const clickZone = e.currentTarget;
        if (clickZone.dataset.revealed === 'true') return;

        clickZone.dataset.revealed = 'true';
        clickZone.style.cursor = 'default';

        const eventData = JSON.parse(clickZone.dataset.eventData);
        const { boxX, boxY, boxWidth, boxHeight, year, title, description, emoji, color } = eventData;

        // Animation de révélation - redessiner la boîte avec le contenu
        // Effacer l'ancienne boîte
        ctx.fillStyle = 'white';
        ctx.fillRect(boxX - 5, boxY - 5, boxWidth + 10, boxHeight + 10);

        // Redessiner la boîte avec le contenu révélé
        // Ombre
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(boxX + 3, boxY + 3, boxWidth, boxHeight);

        // Fond avec effet de succès
        ctx.fillStyle = '#ecfdf5';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // Emoji (si présent)
        let titleOffsetY = boxY + 20;
        if (emoji) {
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(emoji, eventData.x, boxY + 22);
            titleOffsetY = boxY + 40;
        }

        // Titre de l'événement
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title || 'Événement', eventData.x, titleOffsetY, boxWidth - 10);

        // Description
        if (description) {
            ctx.font = '10px Arial';
            ctx.fillStyle = '#6b7280';
            const words = description.split(' ');
            let line = '';
            let y = titleOffsetY + 14;

            for (let word of words) {
                const testLine = line + word + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > boxWidth - 20 && line.length > 0) {
                    ctx.fillText(line, eventData.x, y, boxWidth - 10);
                    line = word + ' ';
                    y += 12;
                    if (y > boxY + boxHeight - 8) break;
                } else {
                    line = testLine;
                }
            }
            if (y <= boxY + boxHeight - 8 && line.length > 0) {
                ctx.fillText(line, eventData.x, y, boxWidth - 10);
            }
        }

        // Petit effet visuel sur la zone cliquable
        clickZone.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
    }

    /**
     * Quitter le mode test
     */
    async exitTimelineTestMode(pageId) {
        const pageData = this.pages.get(pageId);
        if (pageData) {
            pageData.testMode = false;
        }

        // Redessiner la page normalement
        await this.renderPages();

        // Scroller vers la page
        setTimeout(() => {
            const pageWrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
            if (pageWrapper) {
                pageWrapper.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
        }, 50);
    }

    /**
     * Calculer les positions des événements verticaux pour éviter les chevauchements
     */
    calculateVerticalEventPositions(events, startYear, yearRange, lineLength, lineStartY, boxHeight) {
        // Trier les événements par année
        const sortedEvents = [...events].map((event, originalIndex) => ({
            ...event,
            originalIndex,
            y: lineStartY + (((event.year || startYear) - startYear) / yearRange) * lineLength
        })).sort((a, b) => a.y - b.y);

        // Calculer les niveaux pour éviter les chevauchements
        const minSpacing = boxHeight + 15;
        const leftLevels = [];
        const rightLevels = [];

        sortedEvents.forEach((event, idx) => {
            const eventY = event.y;
            let level = 0;
            let isLeft = idx % 2 === 0;

            const levelsToCheck = isLeft ? leftLevels : rightLevels;

            for (let l = 0; l < 10; l++) {
                const currentLevel = isLeft ? leftLevels[l] : rightLevels[l];
                if (!currentLevel) {
                    level = l;
                    break;
                }

                const canPlace = currentLevel.every(pos => Math.abs(pos - eventY) >= minSpacing);
                if (canPlace) {
                    level = l;
                    break;
                }
                level = l + 1;
            }

            if (isLeft) {
                if (!leftLevels[level]) leftLevels[level] = [];
                leftLevels[level].push(eventY);
            } else {
                if (!rightLevels[level]) rightLevels[level] = [];
                rightLevels[level].push(eventY);
            }

            event.level = level;
            event.isLeft = isLeft;
        });

        return sortedEvents;
    }

    /**
     * Dessiner une frise chronologique verticale
     */
    drawVerticalTimeline(ctx, width, height, startYear, endYear, events, lineColor, showYears, tickInterval = null) {
        const marginTop = 100;
        const marginBottom = 80;
        const lineX = width / 2;
        const lineStartY = marginTop;
        const lineEndY = height - marginBottom;
        const lineLength = lineEndY - lineStartY;
        const yearRange = endYear - startYear;

        // Ligne principale
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(lineX, lineStartY);
        ctx.lineTo(lineX, lineEndY);
        ctx.stroke();

        // Flèche en bas
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(lineX, lineEndY);
        ctx.lineTo(lineX - 8, lineEndY - 15);
        ctx.lineTo(lineX + 8, lineEndY - 15);
        ctx.closePath();
        ctx.fill();

        // Marques d'années avec intervalle optimisé
        if (showYears) {
            const interval = this.calculateOptimalInterval(yearRange, tickInterval);
            const firstTick = Math.ceil(startYear / interval) * interval;

            ctx.fillStyle = '#4b5563';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';

            for (let year = firstTick; year <= endYear; year += interval) {
                const y = lineStartY + ((year - startYear) / yearRange) * lineLength;

                // Graduation
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(lineX - 10, y);
                ctx.lineTo(lineX + 10, y);
                ctx.stroke();

                // Année
                ctx.fillText(year.toString(), lineX + 20, y + 5);
            }
        }

        // Calculer les positions des événements pour éviter les chevauchements
        const boxWidth = 150;
        const boxHeight = 70;
        const positionedEvents = this.calculateVerticalEventPositions(events, startYear, yearRange, lineLength, lineStartY, boxHeight);

        // PASSE 1 : Dessiner tous les traits pointillés et points EN PREMIER
        positionedEvents.forEach((event) => {
            const eventY = event.y;
            const baseOffset = 200;
            const levelOffset = event.level * (boxWidth + 20);
            const eventX = event.isLeft ? lineX - baseOffset - levelOffset : lineX + baseOffset + levelOffset;
            const markerColor = event.color || '#3b82f6';

            // Ligne horizontale vers l'événement (trait pointillé)
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(lineX, eventY);
            const lineEndX = event.isLeft ? eventX + boxWidth / 2 : eventX - boxWidth / 2;
            ctx.lineTo(lineEndX, eventY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Point sur la ligne
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.arc(lineX, eventY, 8, 0, Math.PI * 2);
            ctx.fill();
        });

        // PASSE 2 : Dessiner toutes les boîtes d'événements PAR-DESSUS les traits
        positionedEvents.forEach((event) => {
            const eventY = event.y;
            const baseOffset = 200;
            const levelOffset = event.level * (boxWidth + 20);
            const eventX = event.isLeft ? lineX - baseOffset - levelOffset : lineX + baseOffset + levelOffset;
            const markerColor = event.color || '#3b82f6';

            // Boîte d'événement
            const boxX = eventX - boxWidth / 2;
            const boxY = eventY - boxHeight / 2;

            // Ombre
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(boxX + 3, boxY + 3, boxWidth, boxHeight);

            // Fond
            ctx.fillStyle = 'white';
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

            // Emoji (si présent)
            let titleOffsetY = boxY + 20;
            if (event.emoji) {
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(event.emoji, eventX, boxY + 22);
                titleOffsetY = boxY + 40;
            }

            // Titre de l'événement
            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(event.title || 'Événement', eventX, titleOffsetY, boxWidth - 10);

            // Description
            if (event.description) {
                ctx.font = '10px Arial';
                ctx.fillStyle = '#6b7280';
                const words = event.description.split(' ');
                let line = '';
                let y = titleOffsetY + 14;

                for (let word of words) {
                    const testLine = line + word + ' ';
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > boxWidth - 20 && line.length > 0) {
                        ctx.fillText(line, eventX, y, boxWidth - 10);
                        line = word + ' ';
                        y += 12;
                        if (y > boxY + boxHeight - 8) break;
                    } else {
                        line = testLine;
                    }
                }
                if (y <= boxY + boxHeight - 8 && line.length > 0) {
                    ctx.fillText(line, eventX, y, boxWidth - 10);
                }
            }
        });
    }

    /**
     * Liste des emojis historiques disponibles
     */
    getHistoryEmojis() {
        return [
            { emoji: '', label: 'Aucun' },
            { emoji: '👑', label: 'Couronne (royauté)' },
            { emoji: '⚔️', label: 'Épées (guerre)' },
            { emoji: '🏰', label: 'Château' },
            { emoji: '📜', label: 'Parchemin' },
            { emoji: '🗡️', label: 'Épée' },
            { emoji: '🛡️', label: 'Bouclier' },
            { emoji: '⛪', label: 'Église' },
            { emoji: '🏛️', label: 'Monument' },
            { emoji: '🎭', label: 'Théâtre/Arts' },
            { emoji: '🎨', label: 'Art' },
            { emoji: '📖', label: 'Livre' },
            { emoji: '🔬', label: 'Science' },
            { emoji: '💡', label: 'Invention' },
            { emoji: '🚂', label: 'Train (révolution industrielle)' },
            { emoji: '⚓', label: 'Ancre (navigation)' },
            { emoji: '🗺️', label: 'Carte (exploration)' },
            { emoji: '🏴', label: 'Drapeau' },
            { emoji: '✝️', label: 'Religion' },
            { emoji: '☪️', label: 'Islam' },
            { emoji: '🕎', label: 'Judaïsme' },
            { emoji: '🔥', label: 'Feu/Destruction' },
            { emoji: '💀', label: 'Mort/Épidémie' },
            { emoji: '🌍', label: 'Monde' },
            { emoji: '🗽', label: 'Liberté' },
            { emoji: '⚖️', label: 'Justice/Loi' },
            { emoji: '🎵', label: 'Musique' },
            { emoji: '🏆', label: 'Victoire' },
            { emoji: '💎', label: 'Richesse' },
            { emoji: '🌾', label: 'Agriculture' },
            { emoji: '🏺', label: 'Antiquité' },
            { emoji: '🗿', label: 'Préhistoire' },
            { emoji: '📝', label: 'Écriture/Traité' },
            { emoji: '🎓', label: 'Éducation' },
            { emoji: '🚀', label: 'Espace' },
            { emoji: '💻', label: 'Informatique' },
            { emoji: '⚡', label: 'Électricité' },
            { emoji: '🏥', label: 'Médecine' },
            { emoji: '🗳️', label: 'Vote/Démocratie' },
            { emoji: '✊', label: 'Révolution' }
        ];
    }

    /**
     * Ouvrir le panneau de configuration de la frise chronologique
     */
    openTimelineConfigPanel(pageId) {
        const pageData = this.pages.get(pageId);
        if (!pageData || pageData.type !== 'timeline') return;

        const data = pageData.data || {};
        const events = data.events || [];

        // Créer le panneau
        const panel = document.createElement('div');
        panel.id = 'timeline-config-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 650px;
            max-height: 85vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 10001;
            overflow-y: auto;
        `;

        panel.innerHTML = `
            <div style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0;">Configurer la frise chronologique</h3>
                    <button id="timeline-close-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Titre de la frise</label>
                    <input type="text" id="timeline-title" value="${data.title || 'Frise chronologique'}"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Année de début</label>
                        <input type="number" id="timeline-start-year" value="${data.startYear || new Date().getFullYear()}"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Année de fin</label>
                        <input type="number" id="timeline-end-year" value="${data.endYear || (new Date().getFullYear() + 10)}"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Orientation</label>
                        <select id="timeline-orientation" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                            <option value="horizontal" ${data.orientation === 'horizontal' || !data.orientation ? 'selected' : ''}>Horizontale</option>
                            <option value="vertical" ${data.orientation === 'vertical' ? 'selected' : ''}>Verticale</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Intervalle des graduations</label>
                        <select id="timeline-tick-interval" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                            <option value="auto" ${!data.tickInterval ? 'selected' : ''}>Automatique (10-25 traits)</option>
                            <option value="1" ${data.tickInterval === 1 ? 'selected' : ''}>Tous les 1 an</option>
                            <option value="5" ${data.tickInterval === 5 ? 'selected' : ''}>Tous les 5 ans</option>
                            <option value="10" ${data.tickInterval === 10 ? 'selected' : ''}>Tous les 10 ans</option>
                            <option value="25" ${data.tickInterval === 25 ? 'selected' : ''}>Tous les 25 ans</option>
                            <option value="50" ${data.tickInterval === 50 ? 'selected' : ''}>Tous les 50 ans</option>
                            <option value="100" ${data.tickInterval === 100 ? 'selected' : ''}>Tous les 100 ans</option>
                            <option value="500" ${data.tickInterval === 500 ? 'selected' : ''}>Tous les 500 ans</option>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Couleur de la ligne</label>
                        <input type="color" id="timeline-line-color" value="${data.lineColor || '#667eea'}"
                               style="width: 100px; height: 40px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">
                    </div>
                    <div style="display: flex; align-items: flex-end;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="timeline-show-years" ${data.showYears !== false ? 'checked' : ''}>
                            <span>Afficher les années</span>
                        </label>
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h4 style="margin: 0;">Événements</h4>
                        <button id="add-event-btn" style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                            + Ajouter un événement
                        </button>
                    </div>
                    <div id="events-list" style="max-height: 250px; overflow-y: auto;">
                        ${events.map((event, index) => this.renderEventItem(event, index)).join('')}
                    </div>
                </div>

                <div style="display: flex; gap: 12px; margin-top: 24px;">
                    <button id="apply-timeline-btn" style="flex: 1; padding: 12px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        Appliquer
                    </button>
                    <button id="cancel-timeline-btn" style="flex: 1; padding: 12px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        Annuler
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // Event listeners
        document.getElementById('timeline-close-btn').addEventListener('click', () => panel.remove());
        document.getElementById('cancel-timeline-btn').addEventListener('click', () => panel.remove());

        document.getElementById('add-event-btn').addEventListener('click', () => {
            const eventsList = document.getElementById('events-list');
            const newIndex = eventsList.children.length;
            const newEventHtml = this.renderEventItem({
                year: parseInt(document.getElementById('timeline-start-year').value),
                title: '',
                description: '',
                color: '#3b82f6',
                emoji: ''
            }, newIndex);
            eventsList.insertAdjacentHTML('beforeend', newEventHtml);
            this.attachEmojiPickerEvents(eventsList.lastElementChild);
        });

        document.getElementById('apply-timeline-btn').addEventListener('click', async () => {
            await this.saveTimelineConfig(pageData, panel, pageId);
            panel.remove();
        });

        // Délégation d'événements pour les boutons de suppression
        document.getElementById('events-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-event-btn') || e.target.closest('.delete-event-btn')) {
                const btn = e.target.classList.contains('delete-event-btn') ? e.target : e.target.closest('.delete-event-btn');
                btn.closest('.timeline-event-item').remove();
            }
        });

        // Attacher les événements pour les sélecteurs d'emoji existants
        document.querySelectorAll('.timeline-event-item').forEach(item => {
            this.attachEmojiPickerEvents(item);
        });

        // Listener global pour fermer les dropdowns emoji (une seule fois par panneau)
        const closeDropdowns = (e) => {
            if (!e.target.closest('.emoji-picker-btn') && !e.target.closest('.emoji-dropdown')) {
                document.querySelectorAll('.emoji-dropdown').forEach(d => {
                    d.style.display = 'none';
                });
            }
        };
        panel.addEventListener('click', closeDropdowns);
    }

    /**
     * Sauvegarder la configuration de la frise
     */
    async saveTimelineConfig(pageData, panel, pageId) {
        // Collecter les événements
        const eventElements = document.querySelectorAll('.timeline-event-item');
        const collectedEvents = [];

        eventElements.forEach(elem => {
            const year = parseInt(elem.querySelector('.event-year').value);
            const title = elem.querySelector('.event-title').value;
            const description = elem.querySelector('.event-description').value;
            const color = elem.querySelector('.event-color').value;
            const emoji = elem.querySelector('.event-emoji').value || '';

            if (title) { // Seulement si le titre n'est pas vide
                collectedEvents.push({ year, title, description, color, emoji });
            }
        });

        // Récupérer l'intervalle de graduation
        const tickIntervalValue = document.getElementById('timeline-tick-interval').value;
        const tickInterval = tickIntervalValue === 'auto' ? null : parseInt(tickIntervalValue);

        // Mettre à jour les données
        pageData.data = {
            title: document.getElementById('timeline-title').value,
            startYear: parseInt(document.getElementById('timeline-start-year').value),
            endYear: parseInt(document.getElementById('timeline-end-year').value),
            orientation: document.getElementById('timeline-orientation').value,
            lineColor: document.getElementById('timeline-line-color').value,
            showYears: document.getElementById('timeline-show-years').checked,
            tickInterval: tickInterval,
            events: collectedEvents
        };

        // Re-rendre la page et scroller vers la page modifiée
        await this.renderPages();
        this.isDirty = true;

        // Scroller vers la page modifiée après le rendu
        setTimeout(() => {
            const pageWrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
            if (pageWrapper) {
                pageWrapper.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
        }, 50);
    }

    /**
     * Attacher les événements pour le sélecteur d'emoji
     */
    attachEmojiPickerEvents(eventItem) {
        const emojiBtn = eventItem.querySelector('.emoji-picker-btn');
        const emojiInput = eventItem.querySelector('.event-emoji');
        const emojiDropdown = eventItem.querySelector('.emoji-dropdown');

        if (!emojiBtn || !emojiDropdown) return;

        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Fermer tous les autres dropdowns
            document.querySelectorAll('.emoji-dropdown').forEach(d => {
                if (d !== emojiDropdown) d.style.display = 'none';
            });
            emojiDropdown.style.display = emojiDropdown.style.display === 'none' ? 'grid' : 'none';
        });

        emojiDropdown.querySelectorAll('.emoji-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const emoji = opt.dataset.emoji;
                emojiInput.value = emoji;
                emojiBtn.textContent = emoji || '😀';
                emojiDropdown.style.display = 'none';
            });
        });

        // Note: Le listener global pour fermer les dropdowns est géré une seule fois
    }

    /**
     * Rendre un élément d'événement pour la liste
     */
    renderEventItem(event, index) {
        const emojis = this.getHistoryEmojis();
        const emojiOptions = emojis.map(e =>
            `<div class="emoji-option" data-emoji="${e.emoji}" title="${e.label}" style="cursor: pointer; padding: 4px; border-radius: 4px; text-align: center; font-size: 18px;">${e.emoji || '❌'}</div>`
        ).join('');

        return `
            <div class="timeline-event-item" style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 8px; border: 1px solid #e5e7eb;">
                <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                    <input type="number" class="event-year" value="${event.year || new Date().getFullYear()}"
                           placeholder="Année" style="width: 80px; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                    <input type="color" class="event-color" value="${event.color || '#3b82f6'}"
                           title="Couleur" style="width: 40px; height: 32px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
                    <div style="position: relative;">
                        <input type="hidden" class="event-emoji" value="${event.emoji || ''}">
                        <button type="button" class="emoji-picker-btn" style="width: 36px; height: 32px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: white; font-size: 16px;" title="Choisir un emoji">
                            ${event.emoji || '😀'}
                        </button>
                        <div class="emoji-dropdown" style="display: none; position: absolute; top: 100%; left: 0; z-index: 1000; background: white; border: 1px solid #ddd; border-radius: 8px; padding: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); grid-template-columns: repeat(8, 1fr); gap: 2px; width: 280px; max-height: 200px; overflow-y: auto;">
                            ${emojiOptions}
                        </div>
                    </div>
                    <input type="text" class="event-title" value="${event.title || ''}"
                           placeholder="Titre de l'événement" style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                    <button class="delete-event-btn" type="button" style="width: 32px; height: 32px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">×</button>
                </div>
                <textarea class="event-description" placeholder="Description (optionnelle)"
                          style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; min-height: 40px; font-size: 13px; font-family: Arial;">${event.description || ''}</textarea>
            </div>
        `;
    }

    /**
     * Ouvrir le panneau de configuration du graphique
     */
    openGraphConfigPanel(pageId) {
        const pageData = this.pages.get(pageId);
        if (!pageData || pageData.type !== 'graph') return;

        // Initialiser les données par défaut si nécessaire
        if (!pageData.data) {
            pageData.data = {};
        }
        const data = pageData.data;
        data.xMin = data.xMin ?? -10;
        data.xMax = data.xMax ?? 10;
        data.yMin = data.yMin ?? -10;
        data.yMax = data.yMax ?? 10;
        data.showGrid = data.showGrid ?? true;
        data.gridSpacing = data.gridSpacing ?? 1;
        data.functions = data.functions || [];

        // Supprimer le panneau existant s'il y en a un
        const existingPanel = document.getElementById('graph-config-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        // Créer le panneau
        const panel = document.createElement('div');
        panel.id = 'graph-config-panel';
        panel.className = 'graph-config-panel';

        panel.innerHTML = `
            <div class="graph-config-header">
                <h3><i class="fas fa-chart-line"></i> Configuration du Graphique</h3>
                <button class="graph-config-close"><i class="fas fa-times"></i></button>
            </div>

            <div class="graph-config-body">
                <!-- Axes -->
                <div class="graph-config-section">
                    <h4><i class="fas fa-arrows-alt"></i> Intervalles des Axes</h4>
                    <div class="graph-input-group">
                        <div class="graph-input-wrapper">
                            <label>X Min</label>
                            <input type="number" id="graph-xmin" value="${data.xMin}" step="1">
                        </div>
                        <div class="graph-input-wrapper">
                            <label>X Max</label>
                            <input type="number" id="graph-xmax" value="${data.xMax}" step="1">
                        </div>
                    </div>
                    <div class="graph-input-group">
                        <div class="graph-input-wrapper">
                            <label>Y Min</label>
                            <input type="number" id="graph-ymin" value="${data.yMin}" step="1">
                        </div>
                        <div class="graph-input-wrapper">
                            <label>Y Max</label>
                            <input type="number" id="graph-ymax" value="${data.yMax}" step="1">
                        </div>
                    </div>
                </div>

                <!-- Grille -->
                <div class="graph-config-section">
                    <h4><i class="fas fa-th"></i> Grille</h4>
                    <div class="graph-checkbox-wrapper">
                        <input type="checkbox" id="graph-show-grid" ${data.showGrid ? 'checked' : ''}>
                        <label for="graph-show-grid">Afficher la grille</label>
                    </div>
                    <div class="graph-input-wrapper" style="margin-top: 12px;">
                        <label>Espacement de la grille</label>
                        <input type="number" id="graph-grid-spacing" value="${data.gridSpacing}" step="0.5" min="0.1">
                    </div>
                </div>

                <!-- Fonctions -->
                <div class="graph-config-section">
                    <h4><i class="fas fa-function"></i> Fonctions</h4>
                    <div class="graph-functions-list" id="graph-functions-list"></div>
                    <button class="graph-add-function-btn" id="graph-add-function">
                        <i class="fas fa-plus"></i> Ajouter une fonction
                    </button>
                    <div style="margin-top: 12px; padding: 12px; background: #FEF3C7; border-radius: 8px; font-size: 13px; color: #92400E;">
                        <strong>Syntaxe :</strong> Utilisez <code>x</code> comme variable. Ex: <code>x^2</code>, <code>sin(x)</code>, <code>2*x + 3</code>
                        <br><strong>Fonctions disponibles :</strong> sin, cos, tan, sqrt, abs, exp, log, pow
                    </div>
                </div>
            </div>

            <div class="graph-config-footer">
                <button class="graph-apply-btn" id="graph-apply">
                    <i class="fas fa-check"></i> Appliquer les modifications
                </button>
            </div>
        `;

        document.body.appendChild(panel);

        // Animer l'ouverture
        setTimeout(() => panel.classList.add('open'), 10);

        // Charger les fonctions existantes
        this.renderGraphFunctionsList(data.functions);

        // Event listeners
        panel.querySelector('.graph-config-close').addEventListener('click', () => {
            panel.classList.remove('open');
            setTimeout(() => panel.remove(), 300);
        });

        panel.querySelector('#graph-add-function').addEventListener('click', () => {
            const newFunc = {
                expression: '',
                color: this.getRandomColor()
            };
            data.functions.push(newFunc);
            this.renderGraphFunctionsList(data.functions);
        });

        panel.querySelector('#graph-apply').addEventListener('click', () => {
            // Récupérer les valeurs
            data.xMin = parseFloat(panel.querySelector('#graph-xmin').value);
            data.xMax = parseFloat(panel.querySelector('#graph-xmax').value);
            data.yMin = parseFloat(panel.querySelector('#graph-ymin').value);
            data.yMax = parseFloat(panel.querySelector('#graph-ymax').value);
            data.showGrid = panel.querySelector('#graph-show-grid').checked;
            data.gridSpacing = parseFloat(panel.querySelector('#graph-grid-spacing').value);

            // Valider
            if (data.xMin >= data.xMax || data.yMin >= data.yMax) {
                alert('Les intervalles ne sont pas valides. Min doit être < Max.');
                return;
            }

            // Fermer le panneau
            panel.classList.remove('open');
            setTimeout(() => panel.remove(), 300);

            // Re-rendre seulement la page graphique actuelle
            this.rerenderGraphPage(pageId);

            this.isDirty = true;
        });
    }

    /**
     * Re-rendre une page graphique spécifique
     */
    async rerenderGraphPage(pageId) {
        // Trouver le wrapper de la page
        const wrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
        if (!wrapper) return;

        const pageData = this.pages.get(pageId);
        if (!pageData || pageData.type !== 'graph') return;

        // Trouver les canvas
        const pdfCanvas = wrapper.querySelector('.pdf-canvas');
        const annotationCanvas = wrapper.querySelector('.annotation-canvas');

        if (!pdfCanvas || !annotationCanvas) return;

        // Re-rendre le graphique
        await this.renderGraphPage(pdfCanvas, annotationCanvas, pageData.data, pageId);
    }

    /**
     * Rendre la liste des fonctions dans le panneau
     */
    renderGraphFunctionsList(functions) {
        const list = document.getElementById('graph-functions-list');
        if (!list) return;

        list.innerHTML = '';

        functions.forEach((func, index) => {
            const item = document.createElement('div');
            item.className = 'graph-function-item';
            item.innerHTML = `
                <input type="color" class="graph-function-color" value="${func.color}" data-index="${index}">
                <input type="text" class="graph-function-input" value="${func.expression}" placeholder="Ex: x^2 + 2*x - 1" data-index="${index}" autocapitalize="off" autocorrect="off" spellcheck="false">
                <button class="graph-function-delete" data-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            list.appendChild(item);
        });

        // Event listeners pour les couleurs
        list.querySelectorAll('.graph-function-color').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                functions[index].color = e.target.value;
            });
        });

        // Event listeners pour les expressions
        list.querySelectorAll('.graph-function-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                functions[index].expression = e.target.value;

                // Validation basique
                if (e.target.value && !this.validateMathExpression(e.target.value)) {
                    e.target.classList.add('error');
                } else {
                    e.target.classList.remove('error');
                }
            });
        });

        // Event listeners pour la suppression
        list.querySelectorAll('.graph-function-delete').forEach(button => {
            button.addEventListener('click', (e) => {
                const index = parseInt(e.target.closest('.graph-function-delete').dataset.index);
                functions.splice(index, 1);
                this.renderGraphFunctionsList(functions);
            });
        });
    }

    /**
     * Validation basique d'expression mathématique
     */
    validateMathExpression(expr) {
        // Vérifier les caractères autorisés
        const allowedPattern = /^[x0-9+\-*\/().,\s^sincotaqrtbsexplgpw]+$/i;
        if (!allowedPattern.test(expr)) return false;

        // Vérifier les parenthèses équilibrées
        let openCount = 0;
        for (let char of expr) {
            if (char === '(') openCount++;
            if (char === ')') openCount--;
            if (openCount < 0) return false;
        }
        return openCount === 0;
    }

    /**
     * Générer une couleur aléatoire pour une fonction
     */
    getRandomColor() {
        const colors = [
            '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
            '#6366F1', '#8B5CF6', '#EC4899', '#14B8A6'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Configurer les événements d'annotation sur un canvas
     */
    /**
     * Extraire et afficher les liens d'une page PDF
     */
    async renderPageLinks(page, viewport, container, pageId) {
        try {
            // Supprimer les anciens liens s'ils existent
            const oldLinks = container.querySelectorAll('.pdf-link-button, .pdf-link-overlay');
            oldLinks.forEach(link => link.remove());

            // Obtenir les annotations (liens) de la page
            const annotations = await page.getAnnotations();

            // Filtrer uniquement les liens web
            const links = annotations.filter(annotation =>
                annotation.subtype === 'Link' && annotation.url
            );

            if (links.length === 0) return;

            // Grouper les liens par URL (pour éviter les doublons sur plusieurs lignes)
            const linksByUrl = new Map();
            for (const link of links) {
                if (!linksByUrl.has(link.url)) {
                    linksByUrl.set(link.url, []);
                }
                linksByUrl.get(link.url).push(link);
            }

            // Créer un bouton pour chaque URL unique
            for (const [url, linkRects] of linksByUrl) {
                // Trouver le rectangle moyen (centre de tous les rectangles)
                let totalX = 0, totalY = 0, count = 0;
                for (const link of linkRects) {
                    const rect = link.rect;
                    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);
                    totalX += (x1 + x2) / 2;
                    totalY += (y1 + y2) / 2;
                    count++;
                }
                const centerX = totalX / count;
                const centerY = totalY / count;

                // Créer le bouton rond avec icône de chaîne
                const linkButton = document.createElement('a');
                linkButton.className = 'pdf-link-button';
                linkButton.href = url;
                linkButton.target = '_blank';
                linkButton.rel = 'noopener noreferrer';
                linkButton.innerHTML = '<i class="fas fa-link"></i>';

                // Style du bouton petit et rond avec 30% d'opacité
                linkButton.style.position = 'absolute';
                linkButton.style.left = `${centerX}px`;
                linkButton.style.top = `${centerY}px`;
                linkButton.style.transform = 'translate(-50%, -50%)';
                linkButton.style.width = '32px';
                linkButton.style.height = '32px';
                linkButton.style.display = 'flex';
                linkButton.style.alignItems = 'center';
                linkButton.style.justifyContent = 'center';
                linkButton.style.padding = '0';
                linkButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                linkButton.style.color = 'white';
                linkButton.style.borderRadius = '50%';
                linkButton.style.fontSize = '14px';
                linkButton.style.textDecoration = 'none';
                linkButton.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
                linkButton.style.cursor = 'pointer';
                linkButton.style.zIndex = '5';
                linkButton.style.transition = 'all 0.3s ease';
                linkButton.style.border = 'none';
                linkButton.style.opacity = '0.3';

                // Effet hover - augmenter l'opacité
                linkButton.addEventListener('mouseenter', () => {
                    linkButton.style.opacity = '1';
                    linkButton.style.transform = 'translate(-50%, -50%) scale(1.1)';
                    linkButton.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.5)';
                });

                linkButton.addEventListener('mouseleave', () => {
                    linkButton.style.opacity = '0.3';
                    linkButton.style.transform = 'translate(-50%, -50%) scale(1)';
                    linkButton.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
                });

                container.appendChild(linkButton);
            }
        } catch (error) {
            console.error('[Links] Erreur lors de l\'extraction des liens:', error);
        }
    }

    setupAnnotationEvents(canvas, pageId) {
        // Normaliser pageId en nombre pour éviter les problèmes de type
        const normalizedPageId = typeof pageId === 'string' ? parseInt(pageId) : pageId;

        // STRATÉGIE FINALE: Utiliser SEULEMENT les pointer events
        // - Canvas avec pointer-events: none par défaut (laisse passer au viewer)
        // - Quand pointerType === 'pen' détecté → activer canvas temporairement
        // - Quand pointerType === 'touch' → canvas transparent, viewer scroll/zoom
        // PLUS BESOIN de listeners sur le canvas !
        // Les événements sont capturés au niveau du VIEWER
        // Le canvas garde pointer-events: none en PERMANENCE
        // Cela évite que le canvas bloque le scroll des doigts
    }

    /**
     * OBSOLETE: Gestion touch - plus nécessaire car on utilise les pointer events au niveau viewer
     */
    handleTouchStart(e, canvas, pageId) {
        console.log(`[Touch] touchstart - touches: ${e.touches.length}, changedTouches: ${e.changedTouches.length}`);

        // Si c'est un stylet (1 seul touch avec petit radius) OU Apple Pencil
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const radiusX = touch.radiusX || touch.webkitRadiusX || 0;
            const radiusY = touch.radiusY || touch.webkitRadiusY || 0;

            console.log(`[Touch] radiusX: ${radiusX}, radiusY: ${radiusY}, force: ${touch.force}`);

            // Apple Pencil a typiquement un radius < 5 et peut avoir touchType === 'stylus'
            const isStylus = (radiusX < 5 && radiusY < 5) || touch.touchType === 'stylus';

            if (isStylus) {
                console.log('[Touch] STYLET détecté - activation du canvas et blocage scroll');
                // Activer le canvas pour intercepter les pointer events du stylet
                canvas.classList.add('stylus-active');
                e.preventDefault(); // Bloquer le scroll
                // Le pointer event prendra le relais pour l'annotation
                return;
            }
        }

        // Multi-touch OU gros radius = doigts → canvas reste désactivé
        console.log('[Touch] DOIGTS détectés - canvas désactivé, scroll du viewer actif');
        // Le canvas a pointer-events: none, donc les événements passent au viewer
        // NE PAS appeler preventDefault() - laisser le scroll natif
    }

    /**
     * Gestion touchmove
     */
    handleTouchMove(e, canvas, pageId) {
        // Même logique que touchstart
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const radiusX = touch.radiusX || touch.webkitRadiusX || 0;
            const radiusY = touch.radiusY || touch.webkitRadiusY || 0;
            const isStylus = (radiusX < 5 && radiusY < 5) || touch.touchType === 'stylus';

            if (isStylus) {
                e.preventDefault(); // Bloquer le scroll pour le stylet
                canvas.classList.add('stylus-active'); // Maintenir le canvas actif
                return;
            }
        }
        // Laisser passer pour les doigts (canvas reste avec pointer-events: none)
    }

    /**
     * Gestion touchend
     */
    handleTouchEnd(e, canvas, pageId) {
        // Désactiver le canvas quand plus de touch (permet aux doigts de scroller après)
        if (e.touches.length === 0) {
            console.log('[Touch] touchend - désactivation du canvas');
            canvas.classList.remove('stylus-active');
        }
    }

    /**
     * Trouver le canvas à une position donnée
     * OPTIMISÉ: Utilise elementFromPoint au lieu de parcourir tous les canvas
     */
    getCanvasAtPoint(clientX, clientY) {
        // Utiliser l'API native du navigateur - beaucoup plus performant
        // que de parcourir tous les canvas avec getBoundingClientRect()
        const element = document.elementFromPoint(clientX, clientY);

        if (!element) {
            return null;
        }

        // Si c'est directement un canvas d'annotation, le retourner
        if (element.classList.contains('annotation-canvas')) {
            return element;
        }

        // Sinon, vérifier si c'est un enfant d'un container de canvas
        const canvas = element.closest('.pdf-canvas-container')?.querySelector('.annotation-canvas');
        return canvas || null;
    }

    /**
     * Démarrer une annotation
     */
    startAnnotation(e, canvas, pageId) {
        console.log('[StartAnnotation] pageId:', pageId, 'type:', typeof pageId);
        this.isDrawing = true;
        this.currentCanvas = canvas;
        this.currentPageId = pageId;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let x = (e.clientX - rect.left) * scaleX;
        let y = (e.clientY - rect.top) * scaleY;

        // Appliquer l'aimantation à l'équerre dès le début du trait
        if (this.setSquareActive && (this.currentTool === 'pen' || this.currentTool === 'ruler')) {
            const snapped = this.snapToSetSquare(e.clientX, e.clientY, canvas);
            if (snapped) {
                x = snapped.x;
                y = snapped.y;
                console.log('[Snap Start] Point de départ aimanté à', x.toFixed(1), y.toFixed(1));
            }
        }

        // Gérer la gomme différemment
        if (this.currentTool === 'eraser') {
            this.currentStroke = {
                tool: 'eraser',
                color: '#ffffff',
                size: this.currentSize * 3, // Gomme plus grande
                opacity: 1.0,
                points: [{x, y, pressure: e.pressure || 0.5}],
                startTime: Date.now(),
                pageId: pageId
            };
            // Commencer l'effacement immédiatement
            this.eraseAtPoint(canvas, pageId, x, y);
            return;
        }

        // Gérer l'outil angle avec validation en 2 étapes
        if (this.currentTool === 'angle') {
            if (!this.angleState) {
                // Première étape : commencer le premier segment
                this.angleState = {
                    step: 1,
                    startPoint: {x, y},
                    firstSegmentEnd: null,
                    validationTimer: null,
                    lastMoveTime: Date.now(),
                    pageId: pageId
                };
            }
            this.currentStroke = {
                tool: 'angle',
                color: this.currentColor,
                size: this.currentSize,
                opacity: this.currentOpacity,
                points: [{x, y, pressure: e.pressure || 0.5}],
                startTime: Date.now(),
                pageId: pageId
            };
            return;
        }

        // Gérer l'outil arc avec validation en 2 étapes
        if (this.currentTool === 'arc') {
            if (!this.arcState) {
                // Première étape : commencer le premier segment
                this.arcState = {
                    step: 1,
                    startPoint: {x, y},
                    firstSegmentEnd: null,
                    validationTimer: null,
                    lastMoveTime: Date.now(),
                    pageId: pageId
                };
            }
            this.currentStroke = {
                tool: 'arc',
                color: this.currentColor,
                size: this.currentSize,
                opacity: this.currentOpacity,
                points: [{x, y, pressure: e.pressure || 0.5}],
                startTime: Date.now(),
                pageId: pageId
            };
            return;
        }

        // Gérer l'outil grille (toggle)
        if (this.currentTool === 'grid') {
            console.log('[Grid] Outil grille actif, toggle sur page:', pageId);
            this.toggleGridOnPage(canvas, pageId);
            this.isDrawing = false;
            // Revenir automatiquement au stylo après toggle
            console.log('[Grid] Retour automatique au stylo');
            this.setTool('pen');
            return;
        }

        // Gérer l'outil texte
        if (this.currentTool === 'text') {
            console.log('[Text] Outil texte actif, position:', x, y);
            this.isDrawing = false;

            // Vérifier si on clique sur une zone de texte existante
            const clickedTextBox = this.findTextBoxAtPosition(pageId, x, y);

            if (clickedTextBox) {
                // Sélectionner cette zone de texte
                this.selectTextBox(clickedTextBox, canvas, pageId);
            } else {
                // Désélectionner toute zone précédente
                this.deselectTextBox();

                // Créer une nouvelle zone de texte
                const textBox = {
                    tool: 'text',
                    id: 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    pageId: pageId,
                    x: x - 150,  // Centrer la boîte sur le clic
                    y: y - 40,
                    width: 300,
                    height: 80,
                    text: '',
                    fontSize: 16,
                    fontFamily: 'Arial',
                    color: this.currentColor,
                    isSelected: true,
                    canvasWidth: canvas.width,
                    canvasHeight: canvas.height
                };

                // S'assurer que la boîte ne sort pas du canvas
                if (textBox.x < 0) textBox.x = 10;
                if (textBox.y < 0) textBox.y = 10;
                if (textBox.x + textBox.width > canvas.width) textBox.x = canvas.width - textBox.width - 10;
                if (textBox.y + textBox.height > canvas.height) textBox.y = canvas.height - textBox.height - 10;

                // Ajouter à l'historique
                this.addAnnotationToHistory(pageId, textBox);

                // Sélectionner la nouvelle zone
                this.selectTextBox(textBox, canvas, pageId);

                console.log('[Text] Nouvelle zone de texte créée:', textBox);
            }
            return;
        }

        // Initialiser selon l'outil standard
        this.currentStroke = {
            tool: this.currentTool,
            color: this.currentColor,
            size: this.currentSize,
            opacity: this.currentTool === 'highlighter' ? 0.5 : this.currentOpacity,
            points: [{x, y, pressure: e.pressure || 0.5}],
            startTime: Date.now(),
            pageId: pageId
        };

        // Pour l'outil pen, initialiser la détection de ligne droite
        if (this.currentTool === 'pen') {
            this.penLineDetection = {
                lastMoveTime: Date.now(),
                validationTimer: null,
                shouldCreateStraightLine: false
            };
        }
    }

    /**
     * Effacer à un point donné
     */
    eraseAtPoint(canvas, pageId, x, y) {
        const eraserSize = this.currentSize * 5; // Gomme assez grande
        const pageAnnotations = this.annotations.get(pageId) || [];

        // Filtrer les annotations qui sont touchées par la gomme
        const newAnnotations = [];
        let hasErased = false;

        for (const annotation of pageAnnotations) {
            // Ne pas effacer la grille
            if (annotation.tool === 'grid') {
                newAnnotations.push(annotation);
                continue;
            }

            // Gérer les zones de texte séparément
            if (annotation.tool === 'text') {
                // Vérifier si la gomme touche la zone de texte
                const inBox = x >= annotation.x && x <= annotation.x + annotation.width &&
                              y >= annotation.y && y <= annotation.y + annotation.height;
                if (inBox) {
                    hasErased = true;
                    // Si c'est la zone sélectionnée, la désélectionner d'abord
                    if (this.selectedTextBox && this.selectedTextBox.id === annotation.id) {
                        this.deselectTextBox();
                    }
                    // Ne pas ajouter à newAnnotations = suppression
                } else {
                    newAnnotations.push(annotation);
                }
                continue;
            }

            // Vérifier si l'annotation est touchée par la gomme
            const isTouched = this.isAnnotationTouchedByEraser(annotation, x, y, eraserSize);

            if (isTouched) {
                hasErased = true;
                // Pour les formes simples (cercle, rectangle, ligne, etc.), on supprime entièrement
                // Pour les strokes (pen, highlighter), on peut découper si le système le supporte
                if (annotation.tool === 'pen' || annotation.tool === 'highlighter') {
                    // Essayer de découper le stroke
                    if (this.annotationTools && this.annotationTools.cutStroke) {
                        const cutStrokes = this.annotationTools.cutStroke(annotation, {x, y}, eraserSize);
                        if (cutStrokes && cutStrokes.length > 0) {
                            newAnnotations.push(...cutStrokes);
                        }
                    }
                    // Sinon, le stroke est supprimé complètement
                }
                // Pour les autres outils (formes), on supprime complètement l'annotation
                // (ne pas l'ajouter à newAnnotations)
            } else {
                newAnnotations.push(annotation);
            }
        }

        if (hasErased) {
            this.annotations.set(pageId, newAnnotations);
            this.redrawAnnotations(canvas, pageId);
            this.isDirty = true;
        }
    }

    /**
     * Vérifier si une annotation est touchée par la gomme
     */
    isAnnotationTouchedByEraser(annotation, x, y, eraserSize) {
        const points = annotation.points || [];

        // Pour les formes avec points
        if (points.length > 0) {
            // Vérifier chaque point
            for (const point of points) {
                const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
                if (dist < eraserSize) {
                    return true;
                }
            }

            // Pour les lignes, vérifier aussi les segments entre les points
            if (points.length >= 2) {
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];
                    if (this.pointToSegmentDistance(x, y, p1.x, p1.y, p2.x, p2.y) < eraserSize) {
                        return true;
                    }
                }
            }
        }

        // Pour les cercles/disques - utiliser les points stockés pour calculer centre et rayon
        if (annotation.tool === 'circle' || annotation.tool === 'disk' || annotation.tool === 'compass') {
            let center, radius;

            // Les cercles/disques stockent les points: premier = centre, dernier = bord
            if (points.length >= 2) {
                center = points[0];
                const edge = points[points.length - 1];
                radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
            } else if (annotation.center && annotation.radius) {
                center = annotation.center;
                radius = annotation.radius;
            }

            if (center && radius) {
                const distToCenter = Math.sqrt((center.x - x) ** 2 + (center.y - y) ** 2);

                // Pour le cercle, touché si on est sur le contour (dans une marge autour du rayon)
                if (annotation.tool === 'circle' || annotation.tool === 'compass') {
                    if (Math.abs(distToCenter - radius) < eraserSize) {
                        return true;
                    }
                }

                // Pour le disque, touché si on est à l'intérieur OU sur le contour
                if (annotation.tool === 'disk') {
                    if (distToCenter <= radius + eraserSize) {
                        return true;
                    }
                }
            }
        }

        // Pour les rectangles
        if (annotation.tool === 'rectangle') {
            if (annotation.start && annotation.end) {
                const minX = Math.min(annotation.start.x, annotation.end.x);
                const maxX = Math.max(annotation.start.x, annotation.end.x);
                const minY = Math.min(annotation.start.y, annotation.end.y);
                const maxY = Math.max(annotation.start.y, annotation.end.y);

                // Vérifier les 4 côtés du rectangle
                if (this.pointToSegmentDistance(x, y, minX, minY, maxX, minY) < eraserSize ||
                    this.pointToSegmentDistance(x, y, maxX, minY, maxX, maxY) < eraserSize ||
                    this.pointToSegmentDistance(x, y, maxX, maxY, minX, maxY) < eraserSize ||
                    this.pointToSegmentDistance(x, y, minX, maxY, minX, minY) < eraserSize) {
                    return true;
                }
            }
        }

        // Pour les arcs de cercle
        if (annotation.tool === 'arc') {
            if (points.length >= 3) {
                const center = points[0];
                const startPoint = points[1];
                const endPoint = points[2];

                const radius = Math.sqrt((startPoint.x - center.x) ** 2 + (startPoint.y - center.y) ** 2);
                const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
                const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);

                const distToCenter = Math.sqrt((center.x - x) ** 2 + (center.y - y) ** 2);

                // Vérifier si on est sur l'arc (à la bonne distance du centre)
                if (Math.abs(distToCenter - radius) < eraserSize) {
                    // Vérifier si l'angle du point est dans l'arc
                    const pointAngle = Math.atan2(y - center.y, x - center.x);

                    // Normaliser les angles
                    let start = startAngle;
                    let end = endAngle;
                    let point = pointAngle;

                    // Vérifier si le point est dans l'arc (simplifié)
                    // On considère que c'est touché si on est sur le cercle à la bonne distance
                    return true;
                }
            }
        }

        // Pour les angles
        if (annotation.tool === 'angle') {
            if (points.length >= 3) {
                const vertex = points[0];
                const p1 = points[1];
                const p2 = points[2];

                // Vérifier les deux segments de l'angle
                if (this.pointToSegmentDistance(x, y, vertex.x, vertex.y, p1.x, p1.y) < eraserSize ||
                    this.pointToSegmentDistance(x, y, vertex.x, vertex.y, p2.x, p2.y) < eraserSize) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Distance d'un point à un segment
     */
    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Toggle grille sur une page
     */
    toggleGridOnPage(canvas, pageId) {
        console.log('[Grid] toggleGridOnPage appelé - pageId:', pageId, 'canvas:', canvas.width, 'x', canvas.height);

        // Vérifier si la grille existe déjà
        if (!this.pageGrids) {
            this.pageGrids = new Map();
            console.log('[Grid] Initialisation de pageGrids Map');
        }

        const hasGrid = this.pageGrids.get(pageId);
        console.log('[Grid] hasGrid actuel:', hasGrid);

        if (hasGrid) {
            // Supprimer la grille
            console.log('[Grid] Suppression de la grille');
            this.pageGrids.set(pageId, false);
            // Supprimer l'annotation grille
            const pageAnnotations = this.annotations.get(pageId) || [];
            const filteredAnnotations = pageAnnotations.filter(a => a.tool !== 'grid');
            this.annotations.set(pageId, filteredAnnotations);
            console.log('[Grid] Grille supprimée, annotations restantes:', filteredAnnotations.length);
        } else {
            // Ajouter la grille
            console.log('[Grid] Ajout de la grille');
            this.pageGrids.set(pageId, true);
            // Ajouter une annotation grille
            const gridAnnotation = {
                tool: 'grid',
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                id: Date.now() + '_grid'
            };
            if (!this.annotations.has(pageId)) {
                this.annotations.set(pageId, []);
            }
            this.annotations.get(pageId).unshift(gridAnnotation); // Ajouter au début pour dessiner en premier
            console.log('[Grid] Grille ajoutée, total annotations:', this.annotations.get(pageId).length);
        }

        console.log('[Grid] Appel redrawAnnotations');
        this.redrawAnnotations(canvas, pageId);
        this.isDirty = true;
    }

    /**
     * Continuer une annotation
     */
    continueAnnotation(e, canvas, pageId) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Validation: rejeter les points hors du canvas (mais être tolérant pour la gomme)
        const margin = this.currentTool === 'eraser' ? 50 : 0; // Marge de tolérance pour la gomme
        if (x < -margin || y < -margin || x > canvas.width + margin || y > canvas.height + margin) {
            console.warn('[Annotation] Point hors canvas ignoré:', {x, y, width: canvas.width, height: canvas.height});
            return;
        }

        // Validation: rejeter les sauts anormaux (> 200px)
        if (this.currentStroke && this.currentStroke.points.length > 0) {
            const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
            const distance = Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2);

            // Seuil de 200px pour détecter un saut anormal
            if (distance > 200) {
                console.warn('[Annotation] Saut anormal détecté et ignoré:', {
                    distance: distance.toFixed(1),
                    from: lastPoint,
                    to: {x, y}
                });
                return;
            }
        }

        // Gérer la gomme
        if (this.currentTool === 'eraser') {
            // Ajouter le point au stroke pour tracer le chemin de la gomme
            if (this.currentStroke && this.currentStroke.points) {
                this.currentStroke.points.push({x, y, pressure: e.pressure || 0.5});
            }
            this.eraseAtPoint(canvas, pageId, x, y);
            return;
        }

        // Gérer l'outil angle
        if (this.currentTool === 'angle' && this.angleState) {
            const now = Date.now();
            const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
            const distance = Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2);

            // Marge de 5 pixels pour considérer qu'on ne bouge pas
            if (distance > 5) {
                this.angleState.lastMoveTime = now;
                if (this.angleState.validationTimer) {
                    clearTimeout(this.angleState.validationTimer);
                    this.angleState.validationTimer = null;
                }
            } else if (!this.angleState.validationTimer && this.angleState.step === 1) {
                // Commencer le timer de validation si immobile
                this.angleState.validationTimer = setTimeout(() => {
                    this.validateAngleFirstSegment(canvas, pageId);
                }, 1000); // 1 seconde pour validation
            }

            this.currentStroke.points.push({x, y, pressure: e.pressure || 0.5});
            this.drawAnglePreview(canvas, pageId);
            return;
        }

        // Gérer l'outil arc
        if (this.currentTool === 'arc' && this.arcState) {
            const now = Date.now();

            // Initialiser le point de référence si nécessaire
            if (!this.arcState.referencePoint) {
                this.arcState.referencePoint = {
                    x: this.currentStroke.points[this.currentStroke.points.length - 1].x,
                    y: this.currentStroke.points[this.currentStroke.points.length - 1].y
                };
            }

            const refPoint = this.arcState.referencePoint;
            const distance = Math.sqrt((x - refPoint.x) ** 2 + (y - refPoint.y) ** 2);

            // Marge de 5 pixels pour considérer qu'on ne bouge pas
            if (distance > 5) {
                // On bouge, mettre à jour le point de référence
                this.arcState.referencePoint = {x, y};
                this.arcState.lastMoveTime = now;
                if (this.arcState.validationTimer) {
                    clearTimeout(this.arcState.validationTimer);
                    this.arcState.validationTimer = null;
                }
            } else if (!this.arcState.validationTimer && this.arcState.step === 1) {
                // Commencer le timer de validation si immobile
                this.arcState.validationTimer = setTimeout(() => {
                    this.validateArcFirstSegment(canvas, pageId);
                }, 2500); // 2.5 secondes pour validation
            }

            this.currentStroke.points.push({x, y, pressure: e.pressure || 0.5});
            this.drawArcPreview(canvas, pageId);
            return;
        }

        // Appliquer l'aimantation à l'équerre si active
        let finalX = x;
        let finalY = y;
        if (this.setSquareActive && (this.currentTool === 'pen' || this.currentTool === 'ruler')) {
            const snapped = this.snapToSetSquare(e.clientX, e.clientY, canvas);
            if (snapped) {
                finalX = snapped.x;
                finalY = snapped.y;
                console.log('[Snap] Point aimanté de', x.toFixed(1), y.toFixed(1), 'à', finalX.toFixed(1), finalY.toFixed(1));
            }
        }

        // Détecter ligne droite pour l'outil pen
        if (this.currentTool === 'pen' && this.penLineDetection && this.currentStroke.points.length > 0) {
            const now = Date.now();
            const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
            const distance = Math.sqrt((finalX - lastPoint.x) ** 2 + (finalY - lastPoint.y) ** 2);

            // Marge de 3 pixels pour considérer qu'on ne bouge pas
            if (distance > 3) {
                // On bouge, réinitialiser le timer
                this.penLineDetection.lastMoveTime = now;
                if (this.penLineDetection.validationTimer) {
                    clearTimeout(this.penLineDetection.validationTimer);
                    this.penLineDetection.validationTimer = null;
                }
                this.penLineDetection.shouldCreateStraightLine = false;
            } else if (!this.penLineDetection.validationTimer && !this.penLineDetection.shouldCreateStraightLine) {
                // Immobile, démarrer le timer de 2 secondes
                this.penLineDetection.validationTimer = setTimeout(() => {
                    console.log('[Pen Line Detection] 2 secondes d\'immobilité détectées, création de la ligne droite');
                    this.penLineDetection.shouldCreateStraightLine = true;
                    this.penLineDetection.validationTimer = null;

                    // Créer immédiatement la ligne droite
                    if (this.currentStroke && this.currentStroke.points.length > 1) {
                        const firstPoint = this.currentStroke.points[0];
                        const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
                        this.currentStroke.points = [firstPoint, lastPoint];
                        this.currentStroke.tool = 'pen-line'; // Nouveau type pour ligne sans mesure

                        // Redessiner immédiatement avec la ligne droite
                        this.drawStrokePreview(canvas, this.currentStroke, pageId);
                    }
                }, 2000); // 2 secondes
            }
        }

        this.currentStroke.points.push({x: finalX, y: finalY, pressure: e.pressure || 0.5});

        // Redessiner le preview
        this.drawStrokePreview(canvas, this.currentStroke, pageId);
    }

    /**
     * Valider le premier segment de l'outil angle
     */
    validateAngleFirstSegment(canvas, pageId) {
        if (!this.angleState || this.angleState.step !== 1) return;

        const points = this.currentStroke.points;
        if (points.length < 2) return;

        // Sauvegarder le premier segment
        this.angleState.step = 2;
        this.angleState.firstSegmentEnd = {...points[points.length - 1]};

        // Feedback visuel (le segment devient validé)
        this.drawAnglePreview(canvas, pageId);
    }

    /**
     * Valider le premier segment de l'outil arc
     */
    validateArcFirstSegment(canvas, pageId) {
        if (!this.arcState || this.arcState.step !== 1) return;

        const points = this.currentStroke.points;
        if (points.length < 2) return;

        // Sauvegarder le premier segment
        this.arcState.step = 2;
        this.arcState.firstSegmentEnd = {...points[points.length - 1]};
        this.arcState.visitedAngles = []; // Pour stocker tous les angles parcourus

        // Feedback visuel
        this.drawArcPreview(canvas, pageId);
    }

    /**
     * Dessiner le preview de l'outil angle
     */
    drawAnglePreview(canvas, pageId) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Redessiner les annotations existantes
        const pageAnnotations = this.annotations.get(pageId) || [];
        for (const annotation of pageAnnotations) {
            this.drawAnnotation(ctx, annotation);
        }

        if (!this.angleState || !this.currentStroke) return;

        const points = this.currentStroke.points;
        const startPoint = this.angleState.startPoint;
        const currentPoint = points[points.length - 1];

        ctx.save();
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentSize;
        ctx.lineCap = 'round';

        if (this.angleState.step === 1) {
            // Dessiner le premier segment en cours
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
        } else if (this.angleState.step === 2) {
            // Dessiner le premier segment validé
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(this.angleState.firstSegmentEnd.x, this.angleState.firstSegmentEnd.y);
            ctx.stroke();

            // Dessiner le deuxième segment en preview
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Calculer et afficher l'angle
            const angle1 = Math.atan2(
                this.angleState.firstSegmentEnd.y - startPoint.y,
                this.angleState.firstSegmentEnd.x - startPoint.x
            );
            const angle2 = Math.atan2(
                currentPoint.y - startPoint.y,
                currentPoint.x - startPoint.x
            );

            let angleDiff = Math.abs(angle2 - angle1);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            const angleDegrees = angleDiff * 180 / Math.PI;

            // Dessiner l'arc de l'angle
            const arcRadius = Math.min(50, Math.sqrt(
                (this.angleState.firstSegmentEnd.x - startPoint.x) ** 2 +
                (this.angleState.firstSegmentEnd.y - startPoint.y) ** 2
            ) * 0.3);

            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, arcRadius,
                Math.min(angle1, angle2), Math.max(angle1, angle2));
            ctx.stroke();

            // Afficher la mesure de l'angle
            const labelAngle = (angle1 + angle2) / 2;
            const labelX = startPoint.x + (arcRadius + 25) * Math.cos(labelAngle);
            const labelY = startPoint.y + (arcRadius + 25) * Math.sin(labelAngle);

            ctx.fillStyle = this.currentColor;
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${angleDegrees.toFixed(1)}°`, labelX, labelY);
        }

        // Réinitialiser setLineDash AVANT restore pour ne pas polluer les autres dessins
        ctx.setLineDash([]);
        ctx.restore();
    }

    /**
     * Dessiner le preview de l'outil arc
     */
    drawArcPreview(canvas, pageId) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Redessiner les annotations existantes
        const pageAnnotations = this.annotations.get(pageId) || [];
        for (const annotation of pageAnnotations) {
            this.drawAnnotation(ctx, annotation);
        }

        if (!this.arcState || !this.currentStroke) return;

        const points = this.currentStroke.points;
        const startPoint = this.arcState.startPoint;
        const currentPoint = points[points.length - 1];

        ctx.save();
        ctx.strokeStyle = this.currentColor;
        ctx.lineWidth = this.currentSize;
        ctx.lineCap = 'round';

        if (this.arcState.step === 1) {
            // Dessiner le premier segment en cours (rayon)
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();

            // Montrer le rayon en centimètres
            const radius = Math.sqrt(
                (currentPoint.x - startPoint.x) ** 2 +
                (currentPoint.y - startPoint.y) ** 2
            );
            const radiusCm = radius / 37.8; // 1 cm = 37.8 pixels à 96 DPI

            const midX = (startPoint.x + currentPoint.x) / 2;
            const midY = (startPoint.y + currentPoint.y) / 2;

            // Fond blanc pour le texte
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 14px Arial';
            const text = `r = ${radiusCm.toFixed(1)} cm`;
            const metrics = ctx.measureText(text);
            const padding = 4;
            ctx.fillRect(
                midX - metrics.width / 2 - padding,
                midY - 17,
                metrics.width + padding * 2,
                20
            );

            // Texte du rayon
            ctx.fillStyle = this.currentColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, midX, midY - 7);
        } else if (this.arcState.step === 2) {
            // Calculer le rayon depuis le premier segment
            const radius = Math.sqrt(
                (this.arcState.firstSegmentEnd.x - startPoint.x) ** 2 +
                (this.arcState.firstSegmentEnd.y - startPoint.y) ** 2
            );

            // Calculer les angles
            const startAngle = Math.atan2(
                this.arcState.firstSegmentEnd.y - startPoint.y,
                this.arcState.firstSegmentEnd.x - startPoint.x
            );
            const currentAngle = Math.atan2(
                currentPoint.y - startPoint.y,
                currentPoint.x - startPoint.x
            );

            // Ajouter l'angle actuel à la liste des angles visités
            if (!this.arcState.visitedAngles) {
                this.arcState.visitedAngles = [];
            }
            this.arcState.visitedAngles.push(currentAngle);

            // Appliquer l'opacité de 25%
            ctx.globalAlpha = 0.25;

            // Dessiner tous les arcs cumulatifs entre les angles consécutifs visités
            if (this.arcState.visitedAngles.length > 1) {
                for (let i = 0; i < this.arcState.visitedAngles.length - 1; i++) {
                    const angle1 = this.arcState.visitedAngles[i];
                    const angle2 = this.arcState.visitedAngles[i + 1];

                    let angleDiff = angle2 - angle1;
                    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                    ctx.beginPath();
                    ctx.arc(startPoint.x, startPoint.y, radius, angle1, angle2, angleDiff < 0);
                    ctx.stroke();
                }
            }

            // Dessiner aussi l'arc du start au premier angle visité
            let angleDiff = this.arcState.visitedAngles[0] - startAngle;
            if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, radius, startAngle, this.arcState.visitedAngles[0], angleDiff < 0);
            ctx.stroke();

            // Réinitialiser l'opacité
            ctx.globalAlpha = 1.0;

            // Dessiner les rayons en pointillé
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(this.arcState.firstSegmentEnd.x, this.arcState.firstSegmentEnd.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            const endOnArc = {
                x: startPoint.x + radius * Math.cos(currentAngle),
                y: startPoint.y + radius * Math.sin(currentAngle)
            };
            ctx.lineTo(endOnArc.x, endOnArc.y);
            ctx.stroke();
        }

        // Réinitialiser setLineDash AVANT restore pour ne pas polluer les autres dessins
        ctx.setLineDash([]);
        ctx.restore();
    }

    /**
     * Terminer une annotation
     */
    endAnnotation(e, canvas, pageId) {
        this.isDrawing = false;
        this.currentCanvas = null;
        this.currentPageId = null;

        // Gérer la gomme - sauvegarder l'état final dans l'historique
        if (this.currentTool === 'eraser') {
            // Sauvegarder l'état complet de la page dans l'historique
            // Cela permet de garder la cohérence pour undo/redo
            const pageAnnotations = this.annotations.get(pageId) || [];
            if (pageAnnotations.length >= 0) {
                // Créer un snapshot de l'état actuel
                this.saveToHistory();
            }
            this.currentStroke = null;
            return;
        }

        // Gérer la fin de l'outil angle
        if (this.currentTool === 'angle' && this.angleState) {
            if (this.angleState.validationTimer) {
                clearTimeout(this.angleState.validationTimer);
            }

            // Si on est à l'étape 2, sauvegarder l'annotation
            if (this.angleState.step === 2) {
                const angleAnnotation = {
                    tool: 'angle',
                    color: this.currentColor,
                    size: this.currentSize,
                    opacity: this.currentOpacity,
                    points: [
                        this.angleState.startPoint,
                        this.angleState.firstSegmentEnd,
                        this.currentStroke.points[this.currentStroke.points.length - 1]
                    ]
                };
                this.addAnnotationToHistory(pageId, angleAnnotation);
            }

            // Reset de l'état angle
            this.angleState = null;
            this.currentStroke = null;
            this.redrawAnnotations(canvas, pageId);
            this.isDirty = true;
            return;
        }

        // Gérer la fin de l'outil arc
        if (this.currentTool === 'arc' && this.arcState) {
            if (this.arcState.validationTimer) {
                clearTimeout(this.arcState.validationTimer);
            }

            // Si on est à l'étape 2, sauvegarder l'annotation
            if (this.arcState.step === 2) {
                const arcAnnotation = {
                    tool: 'arc',
                    color: this.currentColor,
                    size: this.currentSize,
                    opacity: 0.25, // Arc toujours à 25% d'opacité
                    points: [
                        this.arcState.startPoint,
                        this.arcState.firstSegmentEnd,
                        this.currentStroke.points[this.currentStroke.points.length - 1]
                    ],
                    visitedAngles: this.arcState.visitedAngles || [] // Sauvegarder tous les angles parcourus
                };
                this.addAnnotationToHistory(pageId, arcAnnotation);
            }

            // Reset de l'état arc
            this.arcState = null;
            this.currentStroke = null;
            this.redrawAnnotations(canvas, pageId);
            this.isDirty = true;
            return;
        }

        // Gérer la ligne droite pour l'outil pen
        if (this.currentTool === 'pen' && this.penLineDetection) {
            // Nettoyer le timer si présent
            if (this.penLineDetection.validationTimer) {
                clearTimeout(this.penLineDetection.validationTimer);
            }

            // La ligne droite a déjà été créée dans continueAnnotation si activée
            // Pas besoin de la recréer ici, juste s'assurer que tool = 'pen-line' si nécessaire
            if (this.penLineDetection.shouldCreateStraightLine && this.currentStroke) {
                // S'assurer que le tool est bien 'pen-line' (déjà fait normalement)
                if (this.currentStroke.tool !== 'pen-line') {
                    this.currentStroke.tool = 'pen-line';
                }
            }

            // Reset de la détection
            this.penLineDetection = null;
        }

        // Sauvegarder l'annotation standard
        if (this.currentStroke && this.currentStroke.points && this.currentStroke.points.length > 1) {
            this.addAnnotationToHistory(pageId, this.currentStroke);
        }

        // Redessiner toutes les annotations
        this.redrawAnnotations(canvas, pageId);

        this.currentStroke = null;
        this.isDirty = true;
    }

    /**
     * Annuler une annotation
     */
    cancelAnnotation() {
        this.isDrawing = false;
        this.currentStroke = null;
    }

    /**
     * Dessiner le preview d'un stroke
     */
    drawStrokePreview(canvas, stroke, pageId) {
        const ctx = canvas.getContext('2d');

        // Effacer le canvas avant de redessiner
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Redessiner toutes les annotations existantes
        const pageAnnotations = this.annotations.get(pageId) || [];
        for (const annotation of pageAnnotations) {
            this.drawAnnotation(ctx, annotation);
        }

        // Dessiner le preview du stroke en cours
        if (!stroke || !stroke.points || stroke.points.length === 0) return;

        const options = {
            color: stroke.color,
            size: stroke.size,
            opacity: stroke.opacity
        };

        // Dessiner selon l'outil
        if (this.annotationTools) {
            switch (stroke.tool) {
                case 'pen':
                case 'highlighter':
                    this.annotationTools.drawWithPerfectFreehand(ctx, stroke.points, options);
                    break;

                case 'pen-line':
                    // Ligne droite sans mesure (créée par détection automatique)
                    if (stroke.points.length >= 2) {
                        const start = stroke.points[0];
                        const end = stroke.points[stroke.points.length - 1];
                        // Dessiner juste une ligne droite simple, sans la mesure
                        ctx.save();
                        ctx.strokeStyle = options.color || '#000000';
                        ctx.lineWidth = options.size || 2;
                        ctx.globalAlpha = options.opacity || 1.0;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(start.x, start.y);
                        ctx.lineTo(end.x, end.y);
                        ctx.stroke();
                        ctx.restore();
                    }
                    break;

                case 'ruler':
                    if (stroke.points.length >= 2) {
                        const start = stroke.points[0];
                        const end = stroke.points[stroke.points.length - 1];
                        this.annotationTools.drawRuler(ctx, start, end, options);
                    }
                    break;

                case 'compass':
                    if (stroke.points.length >= 2) {
                        const center = stroke.points[0];
                        const edge = stroke.points[stroke.points.length - 1];
                        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
                        this.annotationTools.drawCompass(ctx, center, radius, options);
                        this.annotationTools.drawCompassRadius(ctx, center, edge, radius);
                    }
                    break;

                case 'arrow':
                    if (stroke.points.length >= 2) {
                        const start = stroke.points[0];
                        const end = stroke.points[stroke.points.length - 1];
                        this.annotationTools.drawArrow(ctx, start, end, options);
                    }
                    break;

                case 'rectangle':
                    if (stroke.points.length >= 2) {
                        const start = stroke.points[0];
                        const end = stroke.points[stroke.points.length - 1];
                        this.annotationTools.drawRectangle(ctx, start, end, options);
                    }
                    break;

                case 'disk':
                    if (stroke.points.length >= 2) {
                        const center = stroke.points[0];
                        const edge = stroke.points[stroke.points.length - 1];
                        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
                        this.annotationTools.drawDisk(ctx, center, radius, options);
                    }
                    break;

                default:
                    // Fallback: dessin simple
                    this.annotationTools.drawSimple(ctx, stroke.points, options);
            }
        } else {
            // Fallback si AnnotationTools n'est pas disponible
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = stroke.opacity;

            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    /**
     * Redessiner toutes les annotations d'une page
     */
    redrawAnnotations(canvas, pageId) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const pageAnnotations = this.annotations.get(pageId) || [];
        console.log(`[Redraw] Page ${pageId} (type: ${typeof pageId}) - ${pageAnnotations.length} annotations à dessiner`);
        console.log('[Redraw] Toutes les clés dans annotations:', [...this.annotations.keys()]);

        for (const annotation of pageAnnotations) {
            this.drawAnnotation(ctx, annotation);
        }
    }

    /**
     * Dessiner une annotation
     */
    drawAnnotation(ctx, annotation) {
        // La grille et le texte n'ont pas de points, donc on ne vérifie pas pour eux
        if (!annotation) return;
        if (annotation.tool !== 'grid' && annotation.tool !== 'text' && (!annotation.points || annotation.points.length === 0)) return;

        const options = {
            color: annotation.color,
            size: annotation.size,
            opacity: annotation.opacity
        };

        // Calculer le ratio de transformation basé sur les dimensions du canvas
        let scaleRatioX = 1.0;
        let scaleRatioY = 1.0;

        // Obtenir les dimensions actuelles du canvas
        const currentCanvas = ctx.canvas;
        const currentWidth = currentCanvas.width;
        const currentHeight = currentCanvas.height;

        // Si l'annotation a été créée sur un canvas de taille différente, recalculer les coordonnées
        if (annotation.canvasWidth && annotation.canvasHeight) {
            if (annotation.canvasWidth !== currentWidth || annotation.canvasHeight !== currentHeight) {
                scaleRatioX = currentWidth / annotation.canvasWidth;
                scaleRatioY = currentHeight / annotation.canvasHeight;

                // Appliquer le multiplicateur de scale si spécifié (pour ajuster finement l'alignement)
                const scaleMultiplier = this.options.annotationScaleMultiplier || 1.0;
                if (scaleMultiplier !== 1.0) {
                    scaleRatioX *= scaleMultiplier;
                    scaleRatioY *= scaleMultiplier;
                    console.log('[DrawAnnotation] Scale multiplier appliqué:', scaleMultiplier);
                }

                console.log('[DrawAnnotation] Canvas transformation - original:', annotation.canvasWidth, 'x', annotation.canvasHeight,
                           'actuel:', currentWidth, 'x', currentHeight, 'ratios:', scaleRatioX, 'x', scaleRatioY);
            }
        }

        // Transformer les points et la taille si nécessaire
        let pointsToUse = annotation.points;
        let optionsToUse = options;

        if ((scaleRatioX !== 1.0 || scaleRatioY !== 1.0) && annotation.points) {
            // Transformer chaque point selon le format (tableau [x,y] ou objet {x,y})
            if (annotation.points.length > 0) {
                if (Array.isArray(annotation.points[0])) {
                    // Format tableau [[x,y], [x,y], ...] utilisé par pen/highlighter
                    pointsToUse = annotation.points.map(p => [p[0] * scaleRatioX, p[1] * scaleRatioY]);
                } else if (annotation.points[0].x !== undefined) {
                    // Format objet [{x,y}, {x,y}, ...] utilisé par les autres outils
                    pointsToUse = annotation.points.map(p => ({x: p.x * scaleRatioX, y: p.y * scaleRatioY}));
                }
            }
            // Transformer la taille du trait (utiliser la moyenne des ratios)
            const avgRatio = (scaleRatioX + scaleRatioY) / 2;
            optionsToUse = {...options, size: (options.size || 2) * avgRatio};
            console.log('[DrawAnnotation] Points transformés - premier point original:', annotation.points[0], 'transformé:', pointsToUse[0]);
        }

        // Appliquer l'offset Y si spécifié dans les options du viewer (uniquement pour /calendar)
        const offsetY = this.options.annotationOffsetY || 0;
        if (offsetY !== 0 && pointsToUse && pointsToUse.length > 0) {
            // Si pointsToUse n'a pas été transformé, c'est une référence à annotation.points
            // On doit faire une copie pour ne pas modifier l'original
            if (pointsToUse === annotation.points) {
                if (Array.isArray(pointsToUse[0])) {
                    pointsToUse = pointsToUse.map(p => [...p]);
                } else if (pointsToUse[0].x !== undefined) {
                    pointsToUse = pointsToUse.map(p => ({...p}));
                }
            }

            // Appliquer l'offset Y
            if (Array.isArray(pointsToUse[0])) {
                // Format tableau [[x,y], [x,y], ...]
                pointsToUse = pointsToUse.map(p => [p[0], p[1] + offsetY]);
            } else if (pointsToUse[0].x !== undefined) {
                // Format objet [{x,y}, {x,y}, ...]
                pointsToUse = pointsToUse.map(p => ({x: p.x, y: p.y + offsetY}));
            }
            console.log('[DrawAnnotation] Offset Y appliqué:', offsetY, 'px');
        }

        ctx.save();

        if (this.annotationTools) {
            switch (annotation.tool) {
                case 'pen':
                case 'highlighter':
                    this.annotationTools.drawWithPerfectFreehand(ctx, pointsToUse, optionsToUse);
                    break;

                case 'pen-line':
                    // Ligne droite sans mesure (créée par détection automatique)
                    if (pointsToUse.length >= 2) {
                        const start = pointsToUse[0];
                        const end = pointsToUse[pointsToUse.length - 1];
                        // Dessiner juste une ligne droite simple, sans la mesure
                        ctx.save();
                        ctx.strokeStyle = optionsToUse.color || '#000000';
                        ctx.lineWidth = optionsToUse.size || 2;
                        ctx.globalAlpha = optionsToUse.opacity || 1.0;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(start.x, start.y);
                        ctx.lineTo(end.x, end.y);
                        ctx.stroke();
                        ctx.restore();
                    }
                    break;

                case 'ruler':
                    if (pointsToUse.length >= 2) {
                        const start = pointsToUse[0];
                        const end = pointsToUse[pointsToUse.length - 1];
                        this.annotationTools.drawRuler(ctx, start, end, optionsToUse);
                    }
                    break;

                case 'compass':
                    if (pointsToUse.length >= 2) {
                        const center = pointsToUse[0];
                        const edge = pointsToUse[pointsToUse.length - 1];
                        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
                        this.annotationTools.drawCompass(ctx, center, radius, optionsToUse);
                    }
                    break;

                case 'angle':
                    if (pointsToUse.length >= 3) {
                        const center = pointsToUse[0];
                        const point1 = pointsToUse[1];
                        const point2 = pointsToUse[pointsToUse.length - 1];
                        this.annotationTools.drawAngle(ctx, center, point1, point2, optionsToUse);
                    }
                    break;

                case 'arc':
                    if (pointsToUse.length >= 3) {
                        const center = pointsToUse[0];
                        const start = pointsToUse[1];
                        const end = pointsToUse[pointsToUse.length - 1];
                        const radius = Math.sqrt((start.x - center.x) ** 2 + (start.y - center.y) ** 2);
                        const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
                        const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
                        // Passer les angles visités si disponibles
                        const arcOptions = {...optionsToUse, visitedAngles: annotation.visitedAngles};
                        this.annotationTools.drawArc(ctx, center, radius, startAngle, endAngle, arcOptions);
                    }
                    break;

                case 'arrow':
                    if (pointsToUse.length >= 2) {
                        const start = pointsToUse[0];
                        const end = pointsToUse[pointsToUse.length - 1];
                        this.annotationTools.drawArrow(ctx, start, end, optionsToUse);
                    }
                    break;

                case 'rectangle':
                    if (pointsToUse.length >= 2) {
                        const start = pointsToUse[0];
                        const end = pointsToUse[pointsToUse.length - 1];
                        this.annotationTools.drawRectangle(ctx, start, end, optionsToUse);
                    }
                    break;

                case 'disk':
                    if (pointsToUse.length >= 2) {
                        const center = pointsToUse[0];
                        const edge = pointsToUse[pointsToUse.length - 1];
                        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
                        this.annotationTools.drawDisk(ctx, center, radius, optionsToUse);
                    }
                    break;

                case 'grid':
                    console.log('[Draw] Grid case - stored canvasWidth:', annotation.canvasWidth, 'canvasHeight:', annotation.canvasHeight);
                    if (annotation.canvasWidth && annotation.canvasHeight) {
                        console.log('[Draw] Calling drawGrid with current canvas dimensions');
                        // Pour la grille, utiliser les dimensions ACTUELLES du canvas (pas les dimensions sauvegardées)
                        this.annotationTools.drawGrid(ctx, currentWidth, currentHeight);
                        console.log('[Draw] drawGrid completed');
                    } else {
                        console.warn('[Draw] Grid missing dimensions');
                    }
                    break;

                case 'text':
                    // Dessiner la zone de texte
                    this.drawTextBox(ctx, annotation, scaleRatioX, scaleRatioY);
                    break;

                default:
                    this.annotationTools.drawSimple(ctx, pointsToUse, optionsToUse);
            }
        } else {
            // Fallback
            ctx.strokeStyle = annotation.color;
            ctx.lineWidth = optionsToUse.size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = annotation.opacity;

            ctx.beginPath();
            ctx.moveTo(pointsToUse[0].x, pointsToUse[0].y);
            for (let i = 1; i < pointsToUse.length; i++) {
                ctx.lineTo(pointsToUse[i].x, pointsToUse[i].y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        // Restaurer le contexte après transformation
        ctx.restore();
    }

    // ============================================================
    // MÉTHODES POUR L'OUTIL TEXTE
    // ============================================================

    /**
     * Dessiner une zone de texte sur le canvas
     */
    drawTextBox(ctx, textBox, scaleRatioX = 1, scaleRatioY = 1) {
        if (!textBox) return;

        // Appliquer le scale si nécessaire
        const x = textBox.x * scaleRatioX;
        const y = textBox.y * scaleRatioY;
        const width = textBox.width * scaleRatioX;
        const height = textBox.height * scaleRatioY;
        const fontSize = textBox.fontSize * ((scaleRatioX + scaleRatioY) / 2);

        ctx.save();

        // Dessiner le fond (léger)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(x, y, width, height);

        // Dessiner la bordure
        const isSelected = this.selectedTextBox && this.selectedTextBox.id === textBox.id;
        ctx.strokeStyle = isSelected ? '#007aff' : '#cccccc';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(x, y, width, height);

        // Dessiner le texte
        if (textBox.text) {
            ctx.fillStyle = textBox.color || '#000000';
            ctx.font = `${fontSize}px ${textBox.fontFamily || 'Arial'}`;
            ctx.textBaseline = 'top';

            // Découper le texte en lignes
            const padding = 8 * scaleRatioX;
            const lineHeight = fontSize * 1.3;
            const maxWidth = width - (padding * 2);
            const lines = this.wrapText(ctx, textBox.text, maxWidth);

            // Dessiner chaque ligne
            lines.forEach((line, index) => {
                const lineY = y + padding + (index * lineHeight);
                if (lineY + lineHeight < y + height) {
                    ctx.fillText(line, x + padding, lineY);
                }
            });
        }

        ctx.restore();
    }

    /**
     * Découper le texte en lignes
     */
    wrapText(ctx, text, maxWidth) {
        const lines = [];
        const paragraphs = text.split('\n');

        for (const paragraph of paragraphs) {
            if (!paragraph) {
                lines.push('');
                continue;
            }

            const words = paragraph.split(' ');
            let currentLine = '';

            for (const word of words) {
                const testLine = currentLine ? currentLine + ' ' + word : word;
                const metrics = ctx.measureText(testLine);

                if (metrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine) {
                lines.push(currentLine);
            }
        }

        return lines.length > 0 ? lines : [''];
    }

    /**
     * Trouver une zone de texte à une position donnée
     */
    findTextBoxAtPosition(pageId, x, y) {
        const pageAnnotations = this.annotations.get(pageId) || [];

        // Chercher en ordre inverse (les dernières annotations sont au-dessus)
        for (let i = pageAnnotations.length - 1; i >= 0; i--) {
            const annotation = pageAnnotations[i];
            if (annotation.tool === 'text') {
                if (x >= annotation.x && x <= annotation.x + annotation.width &&
                    y >= annotation.y && y <= annotation.y + annotation.height) {
                    return annotation;
                }
            }
        }
        return null;
    }

    /**
     * Sélectionner une zone de texte
     */
    selectTextBox(textBox, canvas, pageId) {
        console.log('[Text] Sélection de la zone de texte:', textBox.id);

        // Désélectionner l'ancienne zone
        if (this.selectedTextBox && this.selectedTextBox.id !== textBox.id) {
            this.deselectTextBox();
        }

        this.selectedTextBox = textBox;
        this.selectedTextBoxCanvas = canvas;
        this.selectedTextBoxPageId = pageId;

        // Créer les contrôles HTML
        this.createTextBoxControls(textBox, canvas, pageId);

        // Créer l'overlay de saisie de texte
        this.createTextInputOverlay(textBox, canvas, pageId);

        // Redessiner pour montrer la sélection
        this.redrawAnnotations(canvas, pageId);
    }

    /**
     * Désélectionner la zone de texte active
     */
    deselectTextBox() {
        if (!this.selectedTextBox) return;

        console.log('[Text] Désélection de la zone de texte');

        // Sauvegarder le texte si modifié
        if (this.textInputOverlay) {
            this.updateTextBoxContent();
        }

        // Supprimer les contrôles
        this.removeTextBoxControls();

        // Supprimer l'overlay de saisie
        this.removeTextInputOverlay();

        const canvas = this.selectedTextBoxCanvas;
        const pageId = this.selectedTextBoxPageId;

        this.selectedTextBox = null;
        this.selectedTextBoxCanvas = null;
        this.selectedTextBoxPageId = null;

        // Redessiner
        if (canvas && pageId) {
            this.redrawAnnotations(canvas, pageId);
        }
    }

    /**
     * Créer les contrôles de la zone de texte
     */
    createTextBoxControls(textBox, canvas, pageId) {
        // Supprimer les anciens contrôles
        this.removeTextBoxControls();

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;

        // Positions en pixels écran
        const boxX = rect.left + (textBox.x * scaleX);
        const boxY = rect.top + (textBox.y * scaleY);
        const boxWidth = textBox.width * scaleX;
        const boxHeight = textBox.height * scaleY;

        console.log('[TextControls] Création des contrôles:', {
            canvasRect: rect,
            textBox: {x: textBox.x, y: textBox.y, width: textBox.width, height: textBox.height},
            screenPos: {boxX, boxY, boxWidth, boxHeight},
            scale: {scaleX, scaleY}
        });

        // Créer le conteneur des contrôles
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'text-box-controls';
        controlsContainer.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 10000;
            left: ${boxX}px;
            top: ${boxY}px;
            width: ${boxWidth}px;
            height: ${boxHeight}px;
            overflow: visible;
        `;

        // Styles communs pour les boutons
        const buttonStyle = `
            position: absolute;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: white;
            border: 2px solid #007aff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            pointer-events: auto;
            color: #007aff;
        `;

        // Bouton de déplacement (haut)
        const moveBtn = document.createElement('button');
        moveBtn.innerHTML = '<i class="fas fa-arrows-alt"></i>';
        moveBtn.style.cssText = buttonStyle + `
            left: 50%;
            top: -36px;
            transform: translateX(-50%);
        `;
        moveBtn.title = 'Déplacer';
        moveBtn.addEventListener('mousedown', (e) => this.startTextBoxDrag(e, 'move'));
        moveBtn.addEventListener('touchstart', (e) => this.startTextBoxDrag(e, 'move'), {passive: false});
        controlsContainer.appendChild(moveBtn);

        // Bouton de suppression (bas)
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.style.cssText = buttonStyle + `
            left: 50%;
            bottom: -36px;
            transform: translateX(-50%);
            border-color: #ff3b30;
            color: #ff3b30;
        `;
        deleteBtn.title = 'Supprimer';
        deleteBtn.addEventListener('click', () => this.deleteSelectedTextBox());
        controlsContainer.appendChild(deleteBtn);

        // Sélecteur de taille de police (gauche)
        const fontSizeBtn = document.createElement('button');
        fontSizeBtn.innerHTML = '<i class="fas fa-text-height"></i>';
        fontSizeBtn.style.cssText = buttonStyle + `
            left: -36px;
            top: 50%;
            transform: translateY(-50%);
        `;
        fontSizeBtn.title = 'Taille de police';
        fontSizeBtn.addEventListener('click', (e) => this.showFontSizeMenu(e));
        controlsContainer.appendChild(fontSizeBtn);

        // Sélecteur de police (droite)
        const fontFamilyBtn = document.createElement('button');
        fontFamilyBtn.innerHTML = '<i class="fas fa-font"></i>';
        fontFamilyBtn.style.cssText = buttonStyle + `
            right: -36px;
            top: 50%;
            transform: translateY(-50%);
        `;
        fontFamilyBtn.title = 'Police';
        fontFamilyBtn.addEventListener('click', (e) => this.showFontFamilyMenu(e));
        controlsContainer.appendChild(fontFamilyBtn);

        // Poignées de redimensionnement (coins)
        const handleStyle = `
            position: absolute;
            width: 12px;
            height: 12px;
            background: white;
            border: 2px solid #007aff;
            border-radius: 2px;
            pointer-events: auto;
        `;

        // Coin inférieur droit (principal pour le redimensionnement)
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = handleStyle + `
            right: -6px;
            bottom: -6px;
            cursor: nwse-resize;
        `;
        resizeHandle.addEventListener('mousedown', (e) => this.startTextBoxDrag(e, 'resize'));
        resizeHandle.addEventListener('touchstart', (e) => this.startTextBoxDrag(e, 'resize'), {passive: false});
        controlsContainer.appendChild(resizeHandle);

        // Coin supérieur gauche
        const resizeHandleTL = document.createElement('div');
        resizeHandleTL.style.cssText = handleStyle + `
            left: -6px;
            top: -6px;
            cursor: nwse-resize;
        `;
        resizeHandleTL.addEventListener('mousedown', (e) => this.startTextBoxDrag(e, 'resize-tl'));
        resizeHandleTL.addEventListener('touchstart', (e) => this.startTextBoxDrag(e, 'resize-tl'), {passive: false});
        controlsContainer.appendChild(resizeHandleTL);

        // Coin supérieur droit
        const resizeHandleTR = document.createElement('div');
        resizeHandleTR.style.cssText = handleStyle + `
            right: -6px;
            top: -6px;
            cursor: nesw-resize;
        `;
        resizeHandleTR.addEventListener('mousedown', (e) => this.startTextBoxDrag(e, 'resize-tr'));
        resizeHandleTR.addEventListener('touchstart', (e) => this.startTextBoxDrag(e, 'resize-tr'), {passive: false});
        controlsContainer.appendChild(resizeHandleTR);

        // Coin inférieur gauche
        const resizeHandleBL = document.createElement('div');
        resizeHandleBL.style.cssText = handleStyle + `
            left: -6px;
            bottom: -6px;
            cursor: nesw-resize;
        `;
        resizeHandleBL.addEventListener('mousedown', (e) => this.startTextBoxDrag(e, 'resize-bl'));
        resizeHandleBL.addEventListener('touchstart', (e) => this.startTextBoxDrag(e, 'resize-bl'), {passive: false});
        controlsContainer.appendChild(resizeHandleBL);

        document.body.appendChild(controlsContainer);
        this.textBoxControls = controlsContainer;

        console.log('[TextControls] Contrôles ajoutés au DOM:', controlsContainer);
    }

    /**
     * Supprimer les contrôles de la zone de texte
     */
    removeTextBoxControls() {
        if (this.textBoxControls) {
            this.textBoxControls.remove();
            this.textBoxControls = null;
        }

        // Supprimer les menus ouverts
        const menus = document.querySelectorAll('.text-box-menu');
        menus.forEach(menu => menu.remove());
    }

    /**
     * Créer l'overlay de saisie de texte
     */
    createTextInputOverlay(textBox, canvas, pageId) {
        this.removeTextInputOverlay();

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;

        const boxX = rect.left + (textBox.x * scaleX);
        const boxY = rect.top + (textBox.y * scaleY);
        const boxWidth = textBox.width * scaleX;
        const boxHeight = textBox.height * scaleY;

        const textarea = document.createElement('textarea');
        textarea.className = 'text-box-input';
        textarea.value = textBox.text || '';
        textarea.style.cssText = `
            position: fixed;
            left: ${boxX + 8}px;
            top: ${boxY + 8}px;
            width: ${boxWidth - 16}px;
            height: ${boxHeight - 16}px;
            border: none;
            background: transparent;
            resize: none;
            outline: none;
            font-family: ${textBox.fontFamily || 'Arial'};
            font-size: ${textBox.fontSize * scaleX}px;
            color: ${textBox.color || '#000000'};
            overflow: hidden;
            z-index: 10001;
            padding: 0;
            margin: 0;
            line-height: 1.3;
        `;

        // Événements pour mettre à jour le texte
        textarea.addEventListener('input', () => {
            this.updateTextBoxContent();
        });

        // Empêcher la propagation des événements clavier
        textarea.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });

        // Empêcher la désélection quand on clique dans le textarea
        textarea.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        document.body.appendChild(textarea);
        this.textInputOverlay = textarea;

        // Focus sur le textarea
        setTimeout(() => textarea.focus(), 50);
    }

    /**
     * Supprimer l'overlay de saisie
     */
    removeTextInputOverlay() {
        if (this.textInputOverlay) {
            this.textInputOverlay.remove();
            this.textInputOverlay = null;
        }
    }

    /**
     * Mettre à jour le contenu de la zone de texte
     */
    updateTextBoxContent() {
        if (!this.selectedTextBox || !this.textInputOverlay) return;

        const newText = this.textInputOverlay.value;
        if (newText !== this.selectedTextBox.text) {
            this.selectedTextBox.text = newText;

            // Mettre à jour dans les annotations
            this.updateTextBoxInAnnotations(this.selectedTextBox);

            // Redessiner
            if (this.selectedTextBoxCanvas && this.selectedTextBoxPageId) {
                this.redrawAnnotations(this.selectedTextBoxCanvas, this.selectedTextBoxPageId);
            }

            this.isDirty = true;
        }
    }

    /**
     * Mettre à jour une zone de texte dans les annotations
     */
    updateTextBoxInAnnotations(textBox) {
        const pageAnnotations = this.annotations.get(textBox.pageId) || [];
        const index = pageAnnotations.findIndex(a => a.id === textBox.id);

        if (index !== -1) {
            pageAnnotations[index] = {...textBox};
            this.annotations.set(textBox.pageId, pageAnnotations);
        }
    }

    /**
     * Démarrer le drag d'une zone de texte
     */
    startTextBoxDrag(e, type) {
        e.preventDefault();
        e.stopPropagation();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        this.textDragState = {
            type: type,
            startX: clientX,
            startY: clientY,
            initialX: this.selectedTextBox.x,
            initialY: this.selectedTextBox.y,
            initialWidth: this.selectedTextBox.width,
            initialHeight: this.selectedTextBox.height
        };

        // Ajouter les listeners de drag
        const moveHandler = (e) => this.handleTextBoxDrag(e);
        const endHandler = (e) => this.endTextBoxDrag(e, moveHandler, endHandler);

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchmove', moveHandler, {passive: false});
        document.addEventListener('touchend', endHandler);
    }

    /**
     * Gérer le drag d'une zone de texte
     */
    handleTextBoxDrag(e) {
        if (!this.textDragState || !this.selectedTextBox) return;

        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const canvas = this.selectedTextBoxCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const deltaX = (clientX - this.textDragState.startX) * scaleX;
        const deltaY = (clientY - this.textDragState.startY) * scaleY;

        switch (this.textDragState.type) {
            case 'move':
                this.selectedTextBox.x = Math.max(0, Math.min(
                    canvas.width - this.selectedTextBox.width,
                    this.textDragState.initialX + deltaX
                ));
                this.selectedTextBox.y = Math.max(0, Math.min(
                    canvas.height - this.selectedTextBox.height,
                    this.textDragState.initialY + deltaY
                ));
                break;

            case 'resize':
                this.selectedTextBox.width = Math.max(100, this.textDragState.initialWidth + deltaX);
                this.selectedTextBox.height = Math.max(50, this.textDragState.initialHeight + deltaY);
                break;

            case 'resize-tl':
                const newWidthTL = Math.max(100, this.textDragState.initialWidth - deltaX);
                const newHeightTL = Math.max(50, this.textDragState.initialHeight - deltaY);
                this.selectedTextBox.x = this.textDragState.initialX + (this.textDragState.initialWidth - newWidthTL);
                this.selectedTextBox.y = this.textDragState.initialY + (this.textDragState.initialHeight - newHeightTL);
                this.selectedTextBox.width = newWidthTL;
                this.selectedTextBox.height = newHeightTL;
                break;

            case 'resize-tr':
                const newHeightTR = Math.max(50, this.textDragState.initialHeight - deltaY);
                this.selectedTextBox.y = this.textDragState.initialY + (this.textDragState.initialHeight - newHeightTR);
                this.selectedTextBox.width = Math.max(100, this.textDragState.initialWidth + deltaX);
                this.selectedTextBox.height = newHeightTR;
                break;

            case 'resize-bl':
                const newWidthBL = Math.max(100, this.textDragState.initialWidth - deltaX);
                this.selectedTextBox.x = this.textDragState.initialX + (this.textDragState.initialWidth - newWidthBL);
                this.selectedTextBox.width = newWidthBL;
                this.selectedTextBox.height = Math.max(50, this.textDragState.initialHeight + deltaY);
                break;
        }

        // Mettre à jour les contrôles et l'overlay
        this.updateTextBoxControlsPosition();

        // Mettre à jour dans les annotations et redessiner
        this.updateTextBoxInAnnotations(this.selectedTextBox);
        this.redrawAnnotations(this.selectedTextBoxCanvas, this.selectedTextBoxPageId);
    }

    /**
     * Terminer le drag d'une zone de texte
     */
    endTextBoxDrag(e, moveHandler, endHandler) {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', endHandler);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('touchend', endHandler);

        this.textDragState = null;
        this.isDirty = true;
    }

    /**
     * Mettre à jour la position des contrôles
     */
    updateTextBoxControlsPosition() {
        if (!this.textBoxControls || !this.selectedTextBox || !this.selectedTextBoxCanvas) return;

        const canvas = this.selectedTextBoxCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;

        const boxX = rect.left + (this.selectedTextBox.x * scaleX);
        const boxY = rect.top + (this.selectedTextBox.y * scaleY);
        const boxWidth = this.selectedTextBox.width * scaleX;
        const boxHeight = this.selectedTextBox.height * scaleY;

        this.textBoxControls.style.left = `${boxX}px`;
        this.textBoxControls.style.top = `${boxY}px`;
        this.textBoxControls.style.width = `${boxWidth}px`;
        this.textBoxControls.style.height = `${boxHeight}px`;

        // Mettre à jour l'overlay de texte aussi
        if (this.textInputOverlay) {
            this.textInputOverlay.style.left = `${boxX + 8}px`;
            this.textInputOverlay.style.top = `${boxY + 8}px`;
            this.textInputOverlay.style.width = `${boxWidth - 16}px`;
            this.textInputOverlay.style.height = `${boxHeight - 16}px`;
        }
    }

    /**
     * Supprimer la zone de texte sélectionnée
     */
    deleteSelectedTextBox() {
        if (!this.selectedTextBox) return;

        const pageId = this.selectedTextBoxPageId;
        const textBoxId = this.selectedTextBox.id;

        console.log('[Text] Suppression de la zone de texte:', textBoxId);

        // Supprimer des annotations
        const pageAnnotations = this.annotations.get(pageId) || [];
        const newAnnotations = pageAnnotations.filter(a => a.id !== textBoxId);
        this.annotations.set(pageId, newAnnotations);

        // Désélectionner
        this.deselectTextBox();

        // Redessiner
        const canvas = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"] .annotation-canvas`);
        if (canvas) {
            this.redrawAnnotations(canvas, pageId);
        }

        this.isDirty = true;
    }

    /**
     * Afficher le menu de taille de police
     */
    showFontSizeMenu(e) {
        e.stopPropagation();
        this.closeAllMenus();

        const sizes = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
        const menu = this.createTextBoxMenu(sizes.map(size => ({
            label: `${size}px`,
            value: size,
            selected: this.selectedTextBox.fontSize === size
        })), (value) => {
            this.selectedTextBox.fontSize = value;
            this.updateTextBoxInAnnotations(this.selectedTextBox);
            this.updateTextInputOverlayStyle();
            this.redrawAnnotations(this.selectedTextBoxCanvas, this.selectedTextBoxPageId);
            this.isDirty = true;
        });

        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        menu.style.left = `${rect.left - 60}px`;
        menu.style.top = `${rect.top}px`;
    }

    /**
     * Afficher le menu de police
     */
    showFontFamilyMenu(e) {
        e.stopPropagation();
        this.closeAllMenus();

        const fonts = [
            {label: 'Arial', value: 'Arial'},
            {label: 'Times New Roman', value: 'Times New Roman'},
            {label: 'Georgia', value: 'Georgia'},
            {label: 'Courier New', value: 'Courier New'},
            {label: 'Comic Sans MS', value: 'Comic Sans MS'}
        ];

        const menu = this.createTextBoxMenu(fonts.map(font => ({
            label: font.label,
            value: font.value,
            selected: this.selectedTextBox.fontFamily === font.value
        })), (value) => {
            this.selectedTextBox.fontFamily = value;
            this.updateTextBoxInAnnotations(this.selectedTextBox);
            this.updateTextInputOverlayStyle();
            this.redrawAnnotations(this.selectedTextBoxCanvas, this.selectedTextBoxPageId);
            this.isDirty = true;
        });

        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        menu.style.left = `${rect.right + 10}px`;
        menu.style.top = `${rect.top}px`;
    }

    /**
     * Créer un menu pour les options de texte
     */
    createTextBoxMenu(options, onSelect) {
        const menu = document.createElement('div');
        menu.className = 'text-box-menu';
        menu.style.cssText = `
            position: fixed;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10002;
            overflow: hidden;
            min-width: 120px;
        `;

        options.forEach(opt => {
            const item = document.createElement('button');
            item.textContent = opt.label;
            item.style.cssText = `
                display: block;
                width: 100%;
                padding: 10px 15px;
                border: none;
                background: ${opt.selected ? '#f0f0f0' : 'white'};
                text-align: left;
                cursor: pointer;
                font-family: ${opt.value.includes(' ') ? `"${opt.value}"` : opt.value};
                font-size: 14px;
            `;
            item.addEventListener('mouseenter', () => item.style.background = '#f0f0f0');
            item.addEventListener('mouseleave', () => item.style.background = opt.selected ? '#f0f0f0' : 'white');
            item.addEventListener('click', () => {
                onSelect(opt.value);
                menu.remove();
            });
            menu.appendChild(item);
        });

        document.body.appendChild(menu);

        // Fermer le menu si on clique ailleurs
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);

        return menu;
    }

    /**
     * Fermer tous les menus ouverts
     */
    closeAllMenus() {
        document.querySelectorAll('.text-box-menu').forEach(menu => menu.remove());
    }

    /**
     * Mettre à jour le style de l'overlay de texte
     */
    updateTextInputOverlayStyle() {
        if (!this.textInputOverlay || !this.selectedTextBox || !this.selectedTextBoxCanvas) return;

        const canvas = this.selectedTextBoxCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;

        this.textInputOverlay.style.fontFamily = this.selectedTextBox.fontFamily || 'Arial';
        this.textInputOverlay.style.fontSize = `${this.selectedTextBox.fontSize * scaleX}px`;
    }

    // ============================================================
    // FIN DES MÉTHODES POUR L'OUTIL TEXTE
    // ============================================================

    /**
     * Ajouter une annotation à l'historique
     */
    addAnnotationToHistory(pageId, annotation) {
        console.log('[History] ADD AVANT - pageId:', pageId, 'type:', typeof pageId, 'historyIndex:', this.historyIndex, 'historyLength:', this.annotationHistory.length, 'tool:', annotation.tool);

        // Tronquer l'historique si on est au milieu (cela invalide le redo)
        if (this.historyIndex < this.annotationHistory.length - 1) {
            console.log('[History] Troncature - suppression de', this.annotationHistory.length - this.historyIndex - 1, 'entrées');
            this.annotationHistory = this.annotationHistory.slice(0, this.historyIndex + 1);
            // Reconstruire les annotations depuis l'historique pour être cohérent
            this.rebuildAnnotationsFromHistory();
        }

        // Ajouter un ID unique à l'annotation pour la traçabilité
        annotation.id = Date.now() + '_' + Math.random();

        // Sauvegarder les dimensions du canvas pour recalculer les coordonnées plus tard
        if (!annotation.canvasWidth || !annotation.canvasHeight) {
            // Trouver le canvas d'annotation via le DOM
            const pageWrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
            const canvas = pageWrapper?.querySelector('.annotation-canvas');
            if (canvas) {
                annotation.canvasWidth = canvas.width;
                annotation.canvasHeight = canvas.height;
                console.log('[History] Sauvegarde dimensions canvas:', annotation.canvasWidth, 'x', annotation.canvasHeight, 'pour pageId:', pageId);
            } else {
                console.warn('[History] Canvas d\'annotation introuvable pour pageId:', pageId);
            }
        }

        // Ajouter à l'historique
        this.annotationHistory.push({
            action: 'add',
            pageId: pageId,
            annotation: {...annotation}
        });

        // CORRECTION: Utiliser la longueur de l'historique après le push
        this.historyIndex = this.annotationHistory.length - 1;

        console.log('[History] ADD APRÈS - historyIndex:', this.historyIndex, 'historyLength:', this.annotationHistory.length);

        // Mettre à jour les annotations de la page
        if (!this.annotations.has(pageId)) {
            this.annotations.set(pageId, []);
        }
        this.annotations.get(pageId).push(annotation);

        this.updateUndoRedoButtons();
    }

    /**
     * Reconstruire les annotations depuis l'historique
     */
    rebuildAnnotationsFromHistory() {
        console.log('[Rebuild] Début - historyIndex:', this.historyIndex, 'historyLength:', this.annotationHistory.length);

        // Sauvegarder les grilles (elles ne sont pas dans l'historique)
        const savedGrids = new Map();
        for (const [pageId, annotations] of this.annotations) {
            const grids = annotations.filter(a => a.tool === 'grid');
            if (grids.length > 0) {
                savedGrids.set(pageId, grids);
            }
        }

        // Vider toutes les annotations
        this.annotations.clear();

        // Restaurer les grilles
        for (const [pageId, grids] of savedGrids) {
            this.annotations.set(pageId, [...grids]);
        }

        // Rejouer l'historique jusqu'à historyIndex (inclus)
        // Si historyIndex est -1, aucune annotation n'est affichée (sauf les grilles)
        let totalRebuilt = 0;
        if (this.historyIndex >= 0) {
            for (let i = 0; i <= this.historyIndex; i++) {
                const entry = this.annotationHistory[i];
                if (entry.action === 'add') {
                    const pageId = entry.pageId;
                    if (!this.annotations.has(pageId)) {
                        this.annotations.set(pageId, []);
                    }
                    // Ne pas ajouter les grilles (déjà restaurées)
                    if (entry.annotation.tool !== 'grid') {
                        this.annotations.get(pageId).push({...entry.annotation});
                        totalRebuilt++;
                    }
                }
            }
        }

        console.log('[Rebuild] Fin - annotations par page:', [...this.annotations.keys()], 'Total reconstruites:', totalRebuilt);
    }

    /**
     * Undo - Annuler la dernière action
     */
    undo() {
        console.log('[Undo] historyIndex avant:', this.historyIndex, 'historyLength:', this.annotationHistory.length);

        // Vérifier qu'on peut encore annuler
        if (this.historyIndex < 0) {
            console.log('[Undo] Impossible - déjà au début');
            return;
        }

        // Décrémenter de 1 seulement
        this.historyIndex--;

        console.log('[Undo] historyIndex après:', this.historyIndex);

        // Reconstruire les annotations depuis l'historique
        this.rebuildAnnotationsFromHistory();

        this.redrawAllPages();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Redo - Rétablir la dernière action annulée
     */
    redo() {
        console.log('[Redo] historyIndex avant:', this.historyIndex, 'historyLength:', this.annotationHistory.length);

        // Vérifier qu'on peut encore refaire
        if (this.historyIndex >= this.annotationHistory.length - 1) {
            console.log('[Redo] Impossible - déjà à la fin');
            return;
        }

        // Incrémenter de 1 seulement
        this.historyIndex++;

        console.log('[Redo] historyIndex après:', this.historyIndex);

        // Reconstruire les annotations depuis l'historique
        this.rebuildAnnotationsFromHistory();

        this.redrawAllPages();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Mettre à jour les boutons undo/redo
     */
    updateUndoRedoButtons() {
        // Désactiver undo si on est au début (index < 0 signifie aucune annotation affichée)
        const canUndo = this.historyIndex >= 0;
        // Désactiver redo si on est à la fin
        const canRedo = this.historyIndex < this.annotationHistory.length - 1;

        this.elements.btnUndo.disabled = !canUndo;
        this.elements.btnRedo.disabled = !canRedo;

        console.log('[Buttons] Undo:', canUndo ? 'ENABLED' : 'DISABLED', '| Redo:', canRedo ? 'ENABLED' : 'DISABLED', '| Index:', this.historyIndex, '| Total:', this.annotationHistory.length);
    }

    /**
     * Redessiner toutes les pages
     */
    redrawAllPages() {
        const canvases = this.container.querySelectorAll('.annotation-canvas');
        canvases.forEach(canvas => {
            const pageIdStr = canvas.closest('.pdf-page-wrapper').dataset.pageId;
            // NE PAS utiliser parseInt car les pageId custom sont des strings (ex: "1_1765040967410")
            const pageId = pageIdStr.includes('_') ? pageIdStr : parseInt(pageIdStr);
            this.redrawAnnotations(canvas, pageId);
        });
    }

    /**
     * Effacer la page actuelle
     */
    clearCurrentPage() {
        if (!confirm('Effacer toutes les annotations de cette page ?')) return;

        const pageId = this.currentPage;

        // Supprimer les annotations de cette page
        this.annotations.set(pageId, []);

        // Supprimer les entrées d'historique pour cette page
        this.annotationHistory = this.annotationHistory.filter(entry => entry.pageId !== pageId);

        // Réajuster historyIndex si nécessaire
        this.historyIndex = this.annotationHistory.length - 1;

        // Supprimer aussi l'état de la grille pour cette page
        if (this.pageGrids) {
            this.pageGrids.delete(pageId);
        }

        // Redessiner
        this.redrawAllPages();
        this.updateUndoRedoButtons();
        this.isDirty = true;

        console.log('[Clear] Page', pageId, 'effacée. Historique restant:', this.annotationHistory.length);
    }

    /**
     * Mettre à jour le curseur Apple Pencil Pro
     */
    updatePencilCursor(x, y, visible) {
        if (!this.pencilCursor) return;

        if (visible) {
            // Sauvegarder la position pour les futures mises à jour
            this.lastHoverX = x;
            this.lastHoverY = y;

            // Positionner le curseur exactement aux coordonnées de l'événement
            // Utiliser les mêmes coordonnées clientX/clientY sans transformation
            // Le curseur est en position:fixed donc en coordonnées viewport
            this.pencilCursor.style.left = `${x}px`;
            this.pencilCursor.style.top = `${y}px`;
            this.pencilCursor.style.display = 'block';

            // Calculer la taille du curseur en fonction de la taille du trait
            // Ajouter un peu de marge pour la visibilité (bordure + ombre)
            const cursorSize = this.currentSize + 4; // +4px pour la bordure (2px de chaque côté)

            // Appliquer le style selon l'outil actuel
            if (this.currentTool === 'eraser') {
                this.pencilCursor.className = 'pencil-cursor eraser-cursor';
                // La gomme a une taille fixe plus grande (zone d'effacement)
                const eraserSize = Math.max(30, this.currentSize * 4);
                this.pencilCursor.style.width = `${eraserSize}px`;
                this.pencilCursor.style.height = `${eraserSize}px`;
            } else {
                this.pencilCursor.className = 'pencil-cursor pen-cursor';
                // Adapter la taille du curseur au trait
                this.pencilCursor.style.width = `${cursorSize}px`;
                this.pencilCursor.style.height = `${cursorSize}px`;
                // Appliquer la couleur actuelle pour le stylo
                this.pencilCursor.style.setProperty('--cursor-color', this.currentColor);
            }

            this.cursorVisible = true;
        } else {
            // Masquer le curseur
            this.pencilCursor.style.display = 'none';
            this.cursorVisible = false;
        }
    }

    /**
     * Changer d'outil
     */
    /**
     * Gérer le double-tap de l'Apple Pencil
     * Action intelligente : basculer entre stylo et gomme
     */
    handlePencilDoubleTap() {
        console.log('[Apple Pencil] Outil actuel:', this.currentTool);

        if (this.currentTool === 'eraser') {
            // Si on est en mode gomme, revenir à l'outil précédent
            console.log('[Apple Pencil] Gomme → ', this.previousTool);
            this.setTool(this.previousTool);
        } else {
            // Sinon, mémoriser l'outil actuel et passer à la gomme
            console.log('[Apple Pencil]', this.currentTool, '→ Gomme');
            this.previousTool = this.currentTool;
            this.setTool('eraser');
        }

        // Feedback visuel : afficher brièvement une notification
        this.showToolSwitchNotification();
    }

    /**
     * Afficher une notification visuelle de changement d'outil
     */
    showToolSwitchNotification() {
        // Créer ou réutiliser l'élément de notification
        let notification = document.getElementById('pencil-tap-notification');

        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'pencil-tap-notification';
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 20px 40px;
                border-radius: 10px;
                font-size: 18px;
                font-weight: bold;
                z-index: 10001;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s ease;
            `;
            document.body.appendChild(notification);
        }

        // Mettre à jour le contenu
        const toolName = this.currentTool === 'eraser' ? 'Gomme' :
                        this.currentTool === 'pen' ? 'Stylo' :
                        this.currentTool === 'highlighter' ? 'Surligneur' :
                        this.currentTool.charAt(0).toUpperCase() + this.currentTool.slice(1);

        notification.textContent = toolName;

        // Animer l'apparition
        notification.style.opacity = '1';

        // Masquer après 800ms
        setTimeout(() => {
            notification.style.opacity = '0';
        }, 800);
    }

    setTool(tool) {
        console.log('[Tool] setTool appelé avec:', tool);

        // Désélectionner la zone de texte si on change d'outil (sauf si on reste sur text)
        if (tool !== 'text' && this.selectedTextBox) {
            this.deselectTextBox();
        }

        // Cas spécial : l'équerre est un toggle qui ne change pas l'outil actif
        if (tool === 'set-square') {
            const setSquare = document.querySelector('.set-square-overlay');
            const btn = this.container.querySelector('.btn-tool[data-tool="set-square"]');

            if (setSquare && setSquare.style.display !== 'none') {
                // Équerre déjà affichée, la masquer
                this.hideSetSquare();
                if (btn) btn.classList.remove('active');
            } else {
                // Afficher l'équerre
                this.showSetSquare();
                if (btn) btn.classList.add('active');
            }
            return; // Ne pas changer l'outil actif
        }

        // Pour tous les autres outils
        this.currentTool = tool;

        // Mettre à jour l'UI dans la toolbar principale (sauf pour set-square qui garde son état)
        this.container.querySelectorAll('.btn-tool[data-tool]').forEach(btn => {
            if (btn.dataset.tool !== 'set-square') {
                btn.classList.toggle('active', btn.dataset.tool === tool);
            }
        });

        // Mettre à jour l'UI dans la mini-toolbar
        this.elements.miniToolbar.querySelectorAll('.btn-tool[data-mini-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.miniTool === tool);
        });

        // Adapter les paramètres selon l'outil
        if (tool === 'highlighter') {
            this.currentOpacity = 0.5;
            this.elements.colorPicker.value = '#FFFF00'; // Jaune fluo par défaut
            this.currentColor = '#FFFF00';
        } else if (tool === 'student-tracking') {
            // Ouvrir le modal de gestion de classe
            this.openClassManagementModal();
            // Revenir à l'outil précédent
            this.setTool('pen');
            return;
        } else if (tool === 'grid') {
            // L'utilisateur doit taper sur la page pour toggle la grille
            // (géré dans startAnnotation)
            this.currentOpacity = 1.0;
        } else if (tool === 'text') {
            // Outil texte - la couleur actuelle sera utilisée pour le texte
            this.currentOpacity = 1.0;
            // Désélectionner toute zone de texte précédente si on change d'outil
            // Ne pas faire ici car on veut garder la sélection si on reste sur l'outil texte
        } else {
            // Retour à l'opacité normale et couleur noire pour les autres outils
            this.currentOpacity = 1.0;
            // Si la couleur actuelle est jaune (surligneur), revenir au noir
            if (this.currentColor === '#FFFF00' || this.currentColor === '#ffff00') {
                this.currentColor = '#000000';
                this.elements.colorPicker.value = '#000000';
                // Mettre à jour les boutons de couleur
                this.container.querySelectorAll('.btn-color').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.color === '#000000');
                });
                this.container.querySelector('.custom-color-wrapper').classList.remove('active');
            }
        }
    }

    /**
     * Toggle la grille sur la page actuelle
     */
    toggleGridOnCurrentPage() {
        // Trouver le canvas de la page actuelle
        const pageWrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${this.currentPage}"]`);
        if (!pageWrapper) {
            console.error('[Grid] Page wrapper non trouvé pour page:', this.currentPage);
            return;
        }

        const canvas = pageWrapper.querySelector('.annotation-canvas');
        if (!canvas) {
            console.error('[Grid] Canvas non trouvé pour page:', this.currentPage);
            return;
        }

        console.log('[Grid] Toggle grille sur page:', this.currentPage);
        this.toggleGridOnPage(canvas, this.currentPage);
    }

    /**
     * Ouvrir le modal de gestion de classe
     */
    openClassManagementModal() {
        // Vérifier si le modal existe déjà
        let modal = document.getElementById('class-management-modal');

        if (!modal) {
            // Créer le modal
            modal = document.createElement('div');
            modal.id = 'class-management-modal';
            modal.className = 'class-management-modal';
            modal.innerHTML = `
                <div class="class-modal-overlay" onclick="window.cleanPDFViewer.closeClassManagementModal()"></div>
                <div class="class-modal-content">
                    <div class="class-modal-header">
                        <h2><i class="fas fa-users"></i> Gestion de classe</h2>
                        <button class="class-modal-close" onclick="window.cleanPDFViewer.closeClassManagementModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="class-modal-body" id="class-modal-body">
                        <!-- Le contenu de .attendance-section sera copié ici -->
                    </div>
                </div>
            `;

            // Ajouter les styles du modal
            this.injectClassManagementStyles();

            document.body.appendChild(modal);
        }

        // Copier le contenu de .attendance-section dans le modal
        const attendanceSection = document.querySelector('.attendance-section');
        const modalBody = modal.querySelector('#class-modal-body');

        if (attendanceSection && modalBody) {
            modalBody.innerHTML = attendanceSection.innerHTML;

            // Réattacher les événements pour les interactions
            this.attachAttendanceEventHandlers(modalBody);

            // Réattacher les événements pour les onglets de suivi
            this.attachTrackingTabHandlers(modalBody);

            // Réattacher les événements pour les sanctions
            this.attachSanctionEventHandlers(modalBody);
        }

        // Afficher le modal
        modal.style.display = 'flex';

        // Stocker la référence pour fermeture
        window.cleanPDFViewer = this;
    }

    /**
     * Attacher les gestionnaires d'événements pour les onglets de suivi
     */
    attachTrackingTabHandlers(container) {
        const tabs = container.querySelectorAll('.tracking-tab');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();

                // Récupérer le nom de l'onglet depuis l'attribut onclick
                const onclickAttr = tab.getAttribute('onclick');
                const tabName = onclickAttr ? onclickAttr.match(/showTrackingTab\('([^']+)'\)/)?.[1] : null;

                if (!tabName) return;

                // Désactiver tous les onglets dans le modal
                container.querySelectorAll('.tracking-tab').forEach(t => {
                    t.classList.remove('active');
                });

                // Masquer tous les contenus dans le modal
                container.querySelectorAll('.tracking-content').forEach(content => {
                    content.classList.remove('active');
                });

                // Activer l'onglet cliqué
                tab.classList.add('active');

                // Afficher le contenu correspondant
                const contentId = tabName + '-content';
                const content = container.querySelector(`#${contentId}`);
                if (content) {
                    content.classList.add('active');
                }

                // Si c'est l'onglet plan de classe, charger le plan
                if (tabName === 'seating-plan') {
                    setTimeout(() => {
                        // Vérifier si le plan n'est pas déjà chargé
                        const workspace = container.querySelector('#seating-workspace');
                        if (workspace && workspace.children.length === 0) {
                            // Le plan n'est pas encore chargé
                            this.loadSeatingPlanInModal(container);
                        } else if (workspace) {
                            // Le plan est déjà chargé
                            // Ne rien faire - le plan garde son échelle d'origine
                            console.log('[Modal] Plan de classe déjà chargé, conservation de l\'échelle');
                        }
                    }, 100);
                }
            });
        });
    }

    /**
     * Attacher les gestionnaires d'événements pour les sanctions dans le modal
     */
    attachSanctionEventHandlers(container) {
        // Trouver tous les boutons de sanctions
        const decreaseButtons = container.querySelectorAll('.count-btn.decrease');
        const increaseButtons = container.querySelectorAll('.count-btn.increase');

        decreaseButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const onclickAttr = btn.getAttribute('onclick');
                const match = onclickAttr?.match(/updateSanctionCount\((\d+),\s*(\d+),\s*(-?\d+)\)/);
                if (match) {
                    const studentId = parseInt(match[1]);
                    const sanctionId = parseInt(match[2]);
                    await this.updateSanctionCount(studentId, sanctionId, -1, container);
                }
            });
        });

        increaseButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const onclickAttr = btn.getAttribute('onclick');
                const match = onclickAttr?.match(/updateSanctionCount\((\d+),\s*(\d+),\s*(-?\d+)\)/);
                if (match) {
                    const studentId = parseInt(match[1]);
                    const sanctionId = parseInt(match[2]);
                    await this.updateSanctionCount(studentId, sanctionId, 1, container);
                }
            });
        });
    }

    /**
     * Mettre à jour le compteur de sanctions
     */
    async updateSanctionCount(studentId, sanctionId, delta, container) {
        const countElement = container.querySelector(`[data-student="${studentId}"][data-sanction="${sanctionId}"]`);
        if (!countElement) return;

        const currentCount = parseInt(countElement.textContent);
        const newCount = Math.max(0, currentCount + delta);

        try {
            const response = await fetch('/planning/update-sanction-count', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    student_id: studentId,
                    template_id: sanctionId,
                    count: newCount
                })
            });

            const result = await response.json();

            if (result.success) {
                countElement.textContent = result.new_count;

                // Mettre à jour les classes CSS selon le nombre
                countElement.className = 'count-display';
                countElement.setAttribute('data-student', studentId);
                countElement.setAttribute('data-sanction', sanctionId);

                if (result.new_count >= 6) {
                    countElement.classList.add('danger');
                } else if (result.new_count >= 3) {
                    countElement.classList.add('warning');
                }

                // Animation de mise à jour
                countElement.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    countElement.style.transform = 'scale(1)';
                }, 200);

                // Mettre à jour aussi dans la page principale si elle existe
                const mainElement = document.querySelector(`.attendance-section [data-student="${studentId}"][data-sanction="${sanctionId}"]`);
                if (mainElement) {
                    mainElement.textContent = result.new_count;
                    mainElement.className = 'count-display';
                    mainElement.setAttribute('data-student', studentId);
                    mainElement.setAttribute('data-sanction', sanctionId);
                    if (result.new_count >= 6) {
                        mainElement.classList.add('danger');
                    } else if (result.new_count >= 3) {
                        mainElement.classList.add('warning');
                    }
                }
            } else {
                alert(result.message || 'Erreur lors de la mise à jour');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la communication avec le serveur');
        }
    }

    /**
     * Charger le plan de classe dans le modal
     */
    loadSeatingPlanInModal(container) {
        const workspace = container.querySelector('#seating-workspace');
        const viewer = container.querySelector('#seating-plan-viewer');

        if (!workspace || !viewer) {
            console.error('[Modal] Workspace ou viewer de plan de classe non trouvé');
            return;
        }

        // Appeler la fonction globale loadSeatingPlan si elle existe
        // mais en modifiant temporairement getElementById pour chercher dans le modal
        const originalGetElementById = document.getElementById;
        document.getElementById = function(id) {
            // Chercher d'abord dans le modal
            const element = container.querySelector(`#${id}`);
            if (element) return element;
            // Sinon chercher dans le document
            return originalGetElementById.call(document, id);
        };

        try {
            if (typeof loadSeatingPlan === 'function') {
                loadSeatingPlan();
                // Ajuster l'échelle avec notre propre fonction pour le modal
                setTimeout(() => {
                    this.adjustSeatingScaleInModal(container);
                }, 150);
            }
        } finally {
            // Restaurer la fonction originale
            document.getElementById = originalGetElementById;
        }
    }

    /**
     * Ajuster l'échelle du plan de classe dans le modal (version spécifique modal)
     */
    adjustSeatingScaleInModal(container) {
        const workspace = container.querySelector('#seating-workspace');
        const viewer = container.querySelector('#seating-plan-viewer');

        if (!workspace || !viewer) {
            console.log('[Modal] Workspace ou viewer non trouvé pour ajustement échelle');
            return;
        }

        // Attendre que le viewer ait une taille
        if (viewer.offsetWidth === 0) {
            setTimeout(() => this.adjustSeatingScaleInModal(container), 100);
            return;
        }

        const elements = workspace.querySelectorAll('.seating-element');
        if (elements.length === 0) {
            console.log('[Modal] Aucun élément de plan trouvé');
            return;
        }

        // Calculer les limites du contenu
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        elements.forEach(element => {
            const x = parseFloat(element.style.left) || 0;
            const y = parseFloat(element.style.top) || 0;
            const width = element.offsetWidth;
            const height = element.offsetHeight;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
        });

        // Ajouter une marge
        const margin = 40;
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;

        // Calculer les dimensions du contenu
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        // Obtenir les dimensions du viewer
        const viewerWidth = viewer.offsetWidth;
        const viewerHeight = viewer.offsetHeight || 400;

        // Calculer l'échelle pour adapter le contenu
        const scaleX = viewerWidth / contentWidth;
        const scaleY = viewerHeight / contentHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Ne pas agrandir au-delà de 100%

        // Centrer le contenu
        const scaledWidth = contentWidth * scale;
        const scaledHeight = contentHeight * scale;
        const translateX = (viewerWidth - scaledWidth) / 2 - minX * scale;
        const translateY = (viewerHeight - scaledHeight) / 2 - minY * scale;

        // Appliquer la transformation
        workspace.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        workspace.style.transformOrigin = '0 0';

        console.log(`[Modal] Plan ajusté: échelle ${scale.toFixed(2)}, translation (${translateX.toFixed(0)}, ${translateY.toFixed(0)})`);
    }

    /**
     * Attacher les gestionnaires d'événements pour le suivi des élèves dans le modal
     */
    attachAttendanceEventHandlers(container) {
        // Récupérer les données de la leçon depuis le DOM ou les variables globales
        // Les variables sont définies dans lesson_view.html avec const, pas window
        const classroomId = this.getLessonData('classroomId');
        const lessonDate = this.getLessonData('lessonDate');
        const periodNumber = this.getLessonData('periodNumber');

        console.log('[PDF Viewer] Données récupérées:', { classroomId, lessonDate, periodNumber });

        // Gestionnaire pour toggle présent/absent
        container.querySelectorAll('.student-info').forEach(studentInfo => {
            const studentElement = studentInfo.closest('.student-attendance');
            const studentId = parseInt(studentElement.dataset.studentId);

            studentInfo.onclick = async (e) => {
                e.preventDefault();
                await this.toggleAttendanceStatus(studentId, studentElement, classroomId, lessonDate, periodNumber);
            };
        });

        // Gestionnaire pour le bouton retard
        container.querySelectorAll('.btn-late').forEach(btn => {
            const studentElement = btn.closest('.student-attendance');
            const studentId = parseInt(studentElement.dataset.studentId);

            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.setLateStatus(studentId, studentElement, classroomId, lessonDate, periodNumber);
            };
        });

        // Gestionnaire pour Enter sur les champs de minutes
        container.querySelectorAll('.late-minutes').forEach(input => {
            input.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    const studentElement = input.closest('.student-attendance');
                    const studentId = parseInt(studentElement.dataset.studentId);
                    await this.setLateStatus(studentId, studentElement, classroomId, lessonDate, periodNumber);
                }
            });
        });
    }

    /**
     * Basculer entre présent/absent
     */
    async toggleAttendanceStatus(studentId, studentElement, classroomId, lessonDate, periodNumber) {
        const currentStatus = studentElement.dataset.status;
        let newStatus;

        // Cycle: present -> absent -> present (ignorer late dans le cycle)
        if (currentStatus === 'present' || currentStatus === 'late') {
            newStatus = 'absent';
        } else {
            newStatus = 'present';
        }

        // Réinitialiser le champ de retard
        const lateInput = studentElement.querySelector('.late-minutes');
        if (lateInput) lateInput.value = '';

        await this.updateAttendanceStatus(studentId, newStatus, null, studentElement, classroomId, lessonDate, periodNumber);
    }

    /**
     * Marquer un élève en retard (toggle)
     */
    async setLateStatus(studentId, studentElement, classroomId, lessonDate, periodNumber) {
        const lateInput = studentElement.querySelector('.late-minutes');

        // Vérifier le statut actuel de l'élève
        const isCurrentlyLate = studentElement.classList.contains('late');

        if (isCurrentlyLate) {
            // Si déjà en retard, remettre présent
            await this.updateAttendanceStatus(studentId, 'present', null, studentElement, classroomId, lessonDate, periodNumber);
        } else {
            // Sinon, marquer en retard
            const minutes = lateInput ? lateInput.value : '';

            if (!minutes || minutes <= 0) {
                alert('Veuillez entrer le nombre de minutes de retard');
                if (lateInput) lateInput.focus();
                return;
            }

            await this.updateAttendanceStatus(studentId, 'late', parseInt(minutes), studentElement, classroomId, lessonDate, periodNumber);
        }
    }

    /**
     * Envoyer la mise à jour au serveur et mettre à jour l'interface
     */
    async updateAttendanceStatus(studentId, status, lateMinutes, studentElement, classroomId, lessonDate, periodNumber) {
        console.log('[PDF Viewer] Envoi de la mise à jour:', {
            student_id: studentId,
            classroom_id: classroomId,
            date: lessonDate,
            period_number: periodNumber,
            status: status,
            late_minutes: lateMinutes
        });

        try {
            const response = await fetch('/planning/update-attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    student_id: studentId,
                    classroom_id: classroomId,
                    date: lessonDate,
                    period_number: periodNumber,
                    status: status,
                    late_minutes: lateMinutes
                })
            });

            console.log('[PDF Viewer] Réponse HTTP:', response.status, response.statusText);

            const result = await response.json();

            if (result.success) {
                // Mettre à jour l'interface dans le modal
                const lateInput = studentElement.querySelector('.late-minutes');

                // Retirer toutes les classes de statut
                studentElement.classList.remove('present', 'absent', 'late');

                // Ajouter la nouvelle classe
                studentElement.classList.add(status);
                studentElement.dataset.status = status;

                // Si ce n'est pas un retard, vider le champ
                if (status !== 'late' && lateInput) {
                    lateInput.value = '';
                } else if (status === 'late' && lateInput) {
                    lateInput.value = lateMinutes;
                }

                // Mettre à jour l'apparence du bouton retard
                this.updateAttendanceButton(studentElement);

                // Mettre à jour les statistiques dans le modal
                this.updateAttendanceStats();

                // Afficher une animation visuelle
                this.showQuickNotification(studentElement, status);

                // Mettre à jour aussi l'élément dans la page principale si elle existe
                const mainElement = document.querySelector(`.attendance-section .student-attendance[data-student-id="${studentId}"]`);
                if (mainElement) {
                    mainElement.classList.remove('present', 'absent', 'late');
                    mainElement.classList.add(status);
                    mainElement.dataset.status = status;

                    const mainLateInput = mainElement.querySelector('.late-minutes');
                    if (status !== 'late' && mainLateInput) {
                        mainLateInput.value = '';
                    } else if (status === 'late' && mainLateInput) {
                        mainLateInput.value = lateMinutes;
                    }

                    // Mettre à jour les stats dans la page principale
                    if (typeof updateStats === 'function') {
                        updateStats();
                    }
                }

            } else {
                alert('Erreur lors de la mise à jour de la présence');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la communication avec le serveur');
        }
    }

    /**
     * Mettre à jour l'apparence du bouton retard selon le statut
     */
    updateAttendanceButton(studentElement) {
        const lateButton = studentElement.querySelector('.btn-late');
        if (!lateButton) return;

        if (studentElement.classList.contains('late')) {
            // Élève en retard - bouton pour remettre présent
            lateButton.title = 'Remettre présent';
            lateButton.innerHTML = '<i class="fas fa-undo"></i>';
        } else {
            // Élève présent ou absent - bouton pour marquer en retard
            lateButton.title = 'Marquer en retard';
            lateButton.innerHTML = '<i class="fas fa-clock"></i>';
        }
    }

    /**
     * Mettre à jour les statistiques d'attendance dans le modal
     */
    updateAttendanceStats() {
        const modal = document.getElementById('class-management-modal');
        if (!modal) return;

        let present = 0;
        let absent = 0;
        let late = 0;

        modal.querySelectorAll('.student-attendance').forEach(student => {
            const status = student.dataset.status;
            if (status === 'present') present++;
            else if (status === 'absent') absent++;
            else if (status === 'late') late++;
        });

        const presentCount = modal.querySelector('#presentCount');
        const absentCount = modal.querySelector('#absentCount');
        const lateCount = modal.querySelector('#lateCount');

        if (presentCount) presentCount.textContent = present;
        if (absentCount) absentCount.textContent = absent;
        if (lateCount) lateCount.textContent = late;
    }

    /**
     * Afficher une notification visuelle rapide
     */
    showQuickNotification(element, status) {
        element.style.transform = 'scale(0.95)';
        setTimeout(() => {
            element.style.transform = 'scale(1)';
        }, 200);
    }

    /**
     * Récupérer les données de la leçon depuis les data attributes
     */
    getLessonData(key) {
        const attendanceSection = document.querySelector('.attendance-section');
        if (!attendanceSection) {
            console.error('Section attendance introuvable');
            return null;
        }

        // Convertir camelCase en kebab-case pour les data attributes
        const dataKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        const value = attendanceSection.dataset[key] || attendanceSection.getAttribute(`data-${dataKey}`);

        // Convertir en nombre si c'est un ID ou period number
        if (key === 'classroomId' || key === 'periodNumber') {
            return value ? parseInt(value) : null;
        }

        return value;
    }

    /**
     * Fermer le modal de gestion de classe
     */
    closeClassManagementModal() {
        const modal = document.getElementById('class-management-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Injecter les styles du modal de gestion de classe
     */
    injectClassManagementStyles() {
        const styleId = 'class-management-modal-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .class-management-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10000;
                justify-content: center;
                align-items: center;
            }

            .class-modal-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
            }

            .class-modal-content {
                position: relative;
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .class-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid #e0e0e0;
                background: #f8f9fa;
            }

            .class-modal-header h2 {
                margin: 0;
                font-size: 1.25rem;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .class-modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: #666;
                padding: 8px;
                border-radius: 8px;
                transition: all 0.2s;
            }

            .class-modal-close:hover {
                background: #e0e0e0;
                color: #333;
            }

            .class-modal-body {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            }

            /* Styles copiés pour le contenu du modal */
            .class-modal-body .tracking-tabs {
                display: flex;
                border-bottom: 2px solid #e5e7eb;
                margin-bottom: 1rem;
            }

            .class-modal-body .tracking-tab {
                padding: 0.75rem 1.5rem;
                background: none;
                border: none;
                border-bottom: 3px solid transparent;
                cursor: pointer;
                font-weight: 500;
            }

            .class-modal-body .tracking-tab.active {
                color: #007aff;
                border-bottom-color: #007aff;
            }

            .class-modal-body .attendance-stats {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 0.5rem;
                margin-bottom: 1rem;
            }

            .class-modal-body .stat-item {
                text-align: center;
                padding: 0.75rem;
                border-radius: 8px;
            }

            .class-modal-body .stat-item.present {
                background-color: #D1FAE5;
                color: #065F46;
            }

            .class-modal-body .stat-item.absent {
                background-color: #FEE2E2;
                color: #991B1B;
            }

            .class-modal-body .stat-item.late {
                background-color: #FEF3C7;
                color: #92400E;
            }

            .class-modal-body .stat-value {
                font-size: 1.5rem;
                font-weight: 700;
            }

            .class-modal-body .stat-label {
                font-size: 0.75rem;
            }

            .class-modal-body .students-list {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .class-modal-body .student-attendance {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.75rem;
                border-radius: 8px;
                background-color: #f3f4f6;
            }

            .class-modal-body .student-attendance.present {
                background-color: #D1FAE5;
            }

            .class-modal-body .student-attendance.absent {
                background-color: #FEE2E2;
            }

            .class-modal-body .student-attendance.late {
                background-color: #FEF3C7;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Naviguer vers une page
     */
    goToPage(pageId) {
        this.currentPage = pageId;

        // Scroller vers la page dans le viewer (pas dans la sidebar)
        const wrapper = this.elements.pagesContainer.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
        if (wrapper) {
            // Scroller dans le conteneur pdf-viewer, pas juste le wrapper
            const viewerRect = this.elements.viewer.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            const scrollTop = this.elements.viewer.scrollTop + (wrapperRect.top - viewerRect.top);

            this.elements.viewer.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
        }

        // Mettre à jour les miniatures
        this.updateThumbnailsActive();
    }

    /**
     * Mettre à jour la page actuelle depuis le scroll
     */
    updateCurrentPageFromScroll() {
        const viewerRect = this.elements.viewer.getBoundingClientRect();
        const viewerCenter = viewerRect.top + viewerRect.height / 2;

        let closestPage = null;
        let closestDistance = Infinity;

        // Parcourir toutes les pages pour trouver la plus proche du centre
        this.elements.pagesContainer.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
            const pageRect = wrapper.getBoundingClientRect();
            const pageCenter = pageRect.top + pageRect.height / 2;
            const distance = Math.abs(pageCenter - viewerCenter);

            // Vérifier aussi que la page est au moins partiellement visible
            const isVisible = pageRect.bottom > viewerRect.top && pageRect.top < viewerRect.bottom;

            if (isVisible && distance < closestDistance) {
                closestDistance = distance;
                closestPage = wrapper.dataset.pageId;
            }
        });

        // Mettre à jour la page courante si elle a changé
        if (closestPage && closestPage !== this.currentPage) {
            const oldPage = this.currentPage;
            this.currentPage = closestPage;

            // Normaliser le pageId pour la comparaison (string ou number)
            const normalizedClosestPage = closestPage.includes && closestPage.includes('_') ? closestPage : parseInt(closestPage);

            this.currentPage = normalizedClosestPage;

            // Mettre à jour la sélection dans la barre latérale
            this.updateThumbnailsActive();

            console.log(`[Scroll] Page courante changée: ${oldPage} → ${this.currentPage}`);
        }
    }

    /**
     * Mettre à jour les miniatures actives
     */
    updateThumbnailsActive() {
        this.container.querySelectorAll('.thumbnail-item').forEach(thumb => {
            thumb.classList.toggle('active', thumb.dataset.pageId == this.currentPage);
        });
    }

    /**
     * Afficher le menu d'ajout de page
     */
    showAddPageMenu(afterPageId) {
        const menu = document.createElement('div');
        menu.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            z-index: 10000;
        `;

        menu.innerHTML = `
            <h3 style="margin: 0 0 16px 0;">Ajouter une page</h3>
            <button class="add-blank" style="display: block; width: 100%; margin-bottom: 8px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer;">
                📄 Page vierge
            </button>
            <button class="add-graph" style="display: block; width: 100%; margin-bottom: 8px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer;">
                📊 Page graphique
            </button>
            <button class="add-timeline" style="display: block; width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer;">
                📅 Frise chronologique
            </button>
        `;

        document.body.appendChild(menu);

        menu.querySelector('.add-blank').addEventListener('click', () => {
            this.addPage(afterPageId, 'blank');
            menu.remove();
        });

        menu.querySelector('.add-graph').addEventListener('click', () => {
            this.addPage(afterPageId, 'graph');
            menu.remove();
        });

        menu.querySelector('.add-timeline').addEventListener('click', () => {
            this.addPage(afterPageId, 'timeline');
            menu.remove();
        });

        // Fermer si clic à côté
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    }

    /**
     * Ajouter une page
     */
    async addPage(afterPageId, type) {
        // Générer un ID unique
        const newPageId = `${afterPageId}_${Date.now()}`;

        // Ajouter aux pages
        this.pages.set(newPageId, {type: type, data: {}});

        // Insérer dans l'ordre
        const index = this.pageOrder.indexOf(afterPageId);
        this.pageOrder.splice(index + 1, 0, newPageId);

        // Re-rendre
        await this.renderThumbnails();
        await this.renderPages();

        // Naviguer vers la nouvelle page
        this.goToPage(newPageId);

        this.isDirty = true;
    }

    /**
     * Ajouter une page blanche après la page courante
     */
    async addBlankPageAfterCurrent() {
        // Si aucune page n'existe (aucun PDF ouvert), créer une première page blanche
        if (this.pageOrder.length === 0) {
            console.log('[AddBlankPage] Aucune page existante, création de la première page blanche');

            // Créer la première page blanche
            const newPageId = `blank_${Date.now()}`;
            this.pages.set(newPageId, {type: 'blank', data: {}});
            this.pageOrder.push(newPageId);

            // Mettre à jour le nombre total de pages
            this.totalPages = 1;

            // Re-rendre
            await this.renderThumbnails();
            await this.renderPages();

            // Naviguer vers la nouvelle page
            this.goToPage(newPageId);

            this.isDirty = true;
            return;
        }

        // Utiliser la page courante ou la dernière page si aucune n'est définie
        let currentPageId = this.currentPage;

        if (!currentPageId && this.pageOrder.length > 0) {
            currentPageId = this.pageOrder[this.pageOrder.length - 1];
        }

        if (!currentPageId) {
            console.warn('[AddBlankPage] Aucune page disponible');
            return;
        }

        console.log('[AddBlankPage] Ajout d\'une page blanche après la page:', currentPageId);

        // Utiliser la méthode existante addPage
        await this.addPage(currentPageId, 'blank');
    }

    /**
     * Afficher le menu contextuel pour une page
     */
    showPageContextMenu(event, pageId, pageNumber) {
        // Supprimer tout menu existant
        const existingMenu = document.getElementById('page-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.id = 'page-context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${event.clientY}px;
            left: ${event.clientX}px;
            background: white;
            padding: 8px 0;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            z-index: 10000;
            min-width: 180px;
        `;

        menu.innerHTML = `
            <div class="context-menu-item" style="padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-trash" style="color: #dc3545; width: 16px;"></i>
                <span>Supprimer la page ${pageNumber}</span>
            </div>
        `;

        document.body.appendChild(menu);

        // Ajouter l'événement au hover
        const menuItem = menu.querySelector('.context-menu-item');
        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.backgroundColor = '#f5f5f5';
        });
        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.backgroundColor = 'transparent';
        });

        // Gérer le clic sur "Supprimer"
        menuItem.addEventListener('click', () => {
            menu.remove();
            this.deletePage(pageId, pageNumber);
        });

        // Fermer si clic à côté
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    }

    /**
     * Supprimer une page
     */
    async deletePage(pageId, pageNumber) {
        // Demander confirmation
        if (!confirm(`Voulez-vous vraiment supprimer la page ${pageNumber} ?\n\nCette action supprimera également toutes les annotations de cette page et ne peut pas être annulée.`)) {
            return;
        }

        const pageData = this.pages.get(pageId);

        // Si c'est une page PDF, il faut recalculer les pageNum de toutes les pages suivantes
        if (pageData && pageData.type === 'pdf') {
            const deletedPageNum = pageData.pageNum;

            // Supprimer la page de pageOrder
            const index = this.pageOrder.indexOf(pageId);
            this.pageOrder.splice(index, 1);

            // Supprimer de pages
            this.pages.delete(pageId);

            // Supprimer les annotations de cette page
            this.annotations.delete(pageId);

            // Recalculer les pageNum des pages PDF suivantes et mettre à jour leurs annotations
            const annotationsToUpdate = new Map();

            for (let i = 0; i < this.pageOrder.length; i++) {
                const currentPageId = this.pageOrder[i];
                const currentPageData = this.pages.get(currentPageId);

                // Si c'est une page PDF avec un pageNum supérieur à celui supprimé
                if (currentPageData && currentPageData.type === 'pdf' && currentPageData.pageNum > deletedPageNum) {
                    // Ancien pageNum
                    const oldPageNum = currentPageData.pageNum;
                    // Nouveau pageNum (décrémenté de 1)
                    const newPageNum = oldPageNum - 1;

                    // Mettre à jour le pageNum dans pages
                    currentPageData.pageNum = newPageNum;

                    // Si l'ancien pageNum avait des annotations, les déplacer
                    if (this.annotations.has(oldPageNum)) {
                        annotationsToUpdate.set(newPageNum, this.annotations.get(oldPageNum));
                        this.annotations.delete(oldPageNum);
                    }
                }
            }

            // Appliquer les annotations mises à jour
            annotationsToUpdate.forEach((annotations, newPageNum) => {
                this.annotations.set(newPageNum, annotations);
            });

        } else {
            // Pour les pages custom (blank, graph), juste supprimer
            const index = this.pageOrder.indexOf(pageId);
            this.pageOrder.splice(index, 1);
            this.pages.delete(pageId);
            this.annotations.delete(pageId);
        }

        // Nettoyer l'historique des annotations de cette page
        this.annotationHistory = this.annotationHistory.filter(item => item.pageId !== pageId);

        // Re-rendre tout
        await this.renderThumbnails();
        await this.renderPages();

        // Naviguer vers la première page si on était sur la page supprimée
        if (this.currentPage === pageId) {
            this.goToPage(this.pageOrder[0]);
        }

        this.isDirty = true;

        console.log(`[DeletePage] Page ${pageNumber} (ID: ${pageId}) supprimée avec succès`);
    }

    /**
     * Afficher le menu télécharger/envoyer
     */
    showDownloadMenu() {
        // Vérifier si le menu existe déjà
        let menu = document.getElementById('pdf-download-menu');

        if (menu) {
            menu.remove();
        }

        // Créer le menu
        menu = document.createElement('div');
        menu.id = 'pdf-download-menu';
        menu.className = 'pdf-download-menu';
        menu.innerHTML = `
            <div class="download-menu-overlay" onclick="window.cleanPDFViewer.closeDownloadMenu()"></div>
            <div class="download-menu-content">
                <div class="download-menu-header">
                    <h3><i class="fas fa-download"></i> Télécharger / Envoyer</h3>
                    <button class="download-menu-close" onclick="window.cleanPDFViewer.closeDownloadMenu()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="download-menu-body">
                    <button class="download-option" onclick="window.cleanPDFViewer.downloadPDF()">
                        <i class="fas fa-file-download"></i>
                        <span>Télécharger le PDF annoté</span>
                    </button>
                    <div class="download-separator"></div>
                    <h4>Envoyer aux élèves</h4>
                    <button class="download-option" onclick="window.cleanPDFViewer.sendToStudents('all')">
                        <i class="fas fa-users"></i>
                        <span>Tous les élèves</span>
                    </button>
                    <button class="download-option" onclick="window.cleanPDFViewer.sendToStudents('absent')">
                        <i class="fas fa-user-times"></i>
                        <span>Élèves absents uniquement</span>
                    </button>
                    <button class="download-option" onclick="window.cleanPDFViewer.openStudentSelectionPanel()">
                        <i class="fas fa-user-check"></i>
                        <span>Sélectionner des élèves...</span>
                    </button>
                </div>
            </div>
        `;

        // Ajouter les styles
        this.injectDownloadMenuStyles();

        document.body.appendChild(menu);
        window.cleanPDFViewer = this;
    }

    /**
     * Fermer le menu de téléchargement
     */
    closeDownloadMenu() {
        const menu = document.getElementById('pdf-download-menu');
        if (menu) {
            menu.remove();
        }
    }

    /**
     * Télécharger le PDF avec annotations
     */
    async downloadPDF() {
        this.closeDownloadMenu();
        this.showLoading(true);

        try {
            const pdfBlob = await this.exportPDFWithAnnotations();

            // Créer le lien de téléchargement
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `document_annote_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Erreur lors du téléchargement:', error);
            alert('Erreur lors du téléchargement du PDF');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Envoyer le PDF aux élèves
     */
    async sendToStudents(mode) {
        this.closeDownloadMenu();

        // Récupérer la liste des élèves depuis la page
        const students = this.getStudentsFromPage();

        if (!students || students.length === 0) {
            alert('Aucun élève trouvé dans la classe');
            return;
        }

        let selectedStudents = [];

        if (mode === 'all') {
            selectedStudents = students;
        } else if (mode === 'absent') {
            selectedStudents = students.filter(s => s.status === 'absent');
            if (selectedStudents.length === 0) {
                alert('Aucun élève absent');
                return;
            }
        }

        if (selectedStudents.length === 0) {
            alert('Aucun élève sélectionné');
            return;
        }

        await this.performSendToStudents(selectedStudents);
    }

    /**
     * Ouvrir le panneau de sélection des élèves
     */
    openStudentSelectionPanel() {
        this.closeDownloadMenu();

        const students = this.getStudentsFromPage();

        if (!students || students.length === 0) {
            alert('Aucun élève trouvé dans la classe');
            return;
        }

        // Créer le panneau de sélection
        let panel = document.getElementById('student-selection-panel');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = 'student-selection-panel';
        panel.className = 'student-selection-panel';

        const studentsHTML = students.map(s => `
            <label class="student-select-item">
                <input type="checkbox" value="${s.id}" data-name="${s.name}" ${s.status === 'absent' ? 'data-absent="true"' : ''}>
                <span class="student-select-name">${s.name}</span>
                ${s.status === 'absent' ? '<span class="student-absent-badge">Absent</span>' : ''}
            </label>
        `).join('');

        panel.innerHTML = `
            <div class="student-panel-overlay" onclick="window.cleanPDFViewer.closeStudentSelectionPanel()"></div>
            <div class="student-panel-content">
                <div class="student-panel-header">
                    <h3><i class="fas fa-users"></i> Sélectionner les élèves</h3>
                    <button class="student-panel-close" onclick="window.cleanPDFViewer.closeStudentSelectionPanel()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="student-panel-actions">
                    <button onclick="window.cleanPDFViewer.selectAllStudentsInPanel()">Tout sélectionner</button>
                    <button onclick="window.cleanPDFViewer.selectAbsentStudentsInPanel()">Absents uniquement</button>
                    <button onclick="window.cleanPDFViewer.deselectAllStudentsInPanel()">Tout désélectionner</button>
                </div>
                <div class="student-panel-list">
                    ${studentsHTML}
                </div>
                <div class="student-panel-footer">
                    <span id="selected-count">0 élève(s) sélectionné(s)</span>
                    <button class="btn-send" onclick="window.cleanPDFViewer.sendToSelectedStudents()">
                        <i class="fas fa-paper-plane"></i> Envoyer
                    </button>
                </div>
            </div>
        `;

        this.injectStudentSelectionStyles();
        document.body.appendChild(panel);

        // Ajouter les événements de comptage
        panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => this.updateSelectedCount());
        });
    }

    /**
     * Fermer le panneau de sélection
     */
    closeStudentSelectionPanel() {
        const panel = document.getElementById('student-selection-panel');
        if (panel) panel.remove();
    }

    /**
     * Sélectionner tous les élèves
     */
    selectAllStudentsInPanel() {
        document.querySelectorAll('#student-selection-panel input[type="checkbox"]').forEach(cb => cb.checked = true);
        this.updateSelectedCount();
    }

    /**
     * Sélectionner les absents
     */
    selectAbsentStudentsInPanel() {
        document.querySelectorAll('#student-selection-panel input[type="checkbox"]').forEach(cb => {
            cb.checked = cb.dataset.absent === 'true';
        });
        this.updateSelectedCount();
    }

    /**
     * Désélectionner tous
     */
    deselectAllStudentsInPanel() {
        document.querySelectorAll('#student-selection-panel input[type="checkbox"]').forEach(cb => cb.checked = false);
        this.updateSelectedCount();
    }

    /**
     * Mettre à jour le compteur
     */
    updateSelectedCount() {
        const count = document.querySelectorAll('#student-selection-panel input[type="checkbox"]:checked').length;
        const countSpan = document.getElementById('selected-count');
        if (countSpan) {
            countSpan.textContent = `${count} élève(s) sélectionné(s)`;
        }
    }

    /**
     * Envoyer aux élèves sélectionnés
     */
    async sendToSelectedStudents() {
        const checkboxes = document.querySelectorAll('#student-selection-panel input[type="checkbox"]:checked');
        const selectedStudents = Array.from(checkboxes).map(cb => ({
            id: cb.value,
            name: cb.dataset.name
        }));

        if (selectedStudents.length === 0) {
            alert('Veuillez sélectionner au moins un élève');
            return;
        }

        this.closeStudentSelectionPanel();
        await this.performSendToStudents(selectedStudents);
    }

    /**
     * Récupérer les élèves depuis la page
     */
    getStudentsFromPage() {
        const students = [];
        const studentElements = document.querySelectorAll('.student-attendance');

        studentElements.forEach(el => {
            const nameEl = el.querySelector('.student-name');
            const id = el.dataset.studentId || el.querySelector('[data-student-id]')?.dataset.studentId;

            if (nameEl) {
                let status = 'present';
                if (el.classList.contains('absent')) status = 'absent';
                else if (el.classList.contains('late')) status = 'late';

                students.push({
                    id: id || students.length + 1,
                    name: nameEl.textContent.trim(),
                    status: status
                });
            }
        });

        return students;
    }

    /**
     * Effectuer l'envoi aux élèves - partage le fichier existant
     */
    async performSendToStudents(selectedStudents) {
        this.showLoading(true);

        try {
            // Préparer les données - envoyer l'ID du fichier au lieu du PDF complet
            const formData = new FormData();
            formData.append('file_id', this.options.fileId);  // ID du fichier à partager
            formData.append('selected_students', JSON.stringify(selectedStudents));

            // Récupérer l'ID de classe depuis la page
            const classId = this.getClassIdFromPage();
            if (classId) {
                formData.append('current_class_id', classId);
            }

            // Envoyer
            const response = await fetch('/api/send-to-students', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                alert(`Document partagé avec succès avec ${result.shares_created} élève(s)`);
            } else {
                alert('Erreur: ' + (result.message || 'Erreur inconnue'));
            }

        } catch (error) {
            console.error('Erreur lors du partage:', error);
            alert('Erreur lors du partage du document');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Récupérer l'ID de classe depuis la page
     */
    getClassIdFromPage() {
        // Essayer plusieurs méthodes
        const classIdEl = document.querySelector('[data-class-id]');
        if (classIdEl) return classIdEl.dataset.classId;

        // Essayer de récupérer depuis l'URL
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('class_id') || urlParams.get('classroom_id');
    }

    /**
     * Exporter le PDF avec annotations
     */
    async exportPDFWithAnnotations() {
        if (!this.pdf) {
            throw new Error('Aucun PDF chargé');
        }

        // Utiliser PDF-lib pour créer le nouveau PDF
        const { PDFDocument, rgb } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js');

        // Charger le PDF original
        const pdfBytes = await fetch(this.options.pdfUrl).then(res => res.arrayBuffer());
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        // Pour chaque page, dessiner les annotations
        for (let i = 0; i < pages.length; i++) {
            const pageId = i + 1;
            const pageAnnotations = this.annotations.get(pageId) || [];
            const page = pages[i];
            const { width, height } = page.getSize();

            // Récupérer le canvas d'annotation pour cette page
            const wrapper = this.container.querySelector(`.pdf-page-wrapper[data-page-id="${pageId}"]`);
            if (!wrapper) continue;

            const annotationCanvas = wrapper.querySelector('.annotation-canvas');
            if (!annotationCanvas) continue;

            // Convertir le canvas en image
            const canvasDataUrl = annotationCanvas.toDataURL('image/png');
            const canvasImageBytes = await fetch(canvasDataUrl).then(res => res.arrayBuffer());
            const canvasImage = await pdfDoc.embedPng(canvasImageBytes);

            // Calculer le ratio
            const canvasWidth = annotationCanvas.width;
            const canvasHeight = annotationCanvas.height;
            const scaleX = width / canvasWidth;
            const scaleY = height / canvasHeight;

            // Dessiner l'image des annotations sur la page
            page.drawImage(canvasImage, {
                x: 0,
                y: 0,
                width: width,
                height: height,
            });
        }

        // Sauvegarder le PDF
        const modifiedPdfBytes = await pdfDoc.save();
        return new Blob([modifiedPdfBytes], { type: 'application/pdf' });
    }

    /**
     * Injecter les styles du menu de téléchargement
     */
    injectDownloadMenuStyles() {
        const styleId = 'pdf-download-menu-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .pdf-download-menu {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10001;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .download-menu-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
            }

            .download-menu-content {
                position: relative;
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 400px;
                overflow: hidden;
            }

            .download-menu-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid #e0e0e0;
                background: #f8f9fa;
            }

            .download-menu-header h3 {
                margin: 0;
                font-size: 1.1rem;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .download-menu-close {
                background: none;
                border: none;
                font-size: 1.25rem;
                cursor: pointer;
                color: #666;
                padding: 6px;
                border-radius: 6px;
            }

            .download-menu-close:hover {
                background: #e0e0e0;
            }

            .download-menu-body {
                padding: 16px;
            }

            .download-menu-body h4 {
                margin: 16px 0 8px 0;
                font-size: 0.875rem;
                color: #666;
            }

            .download-option {
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                padding: 12px 16px;
                border: none;
                background: #f8f9fa;
                border-radius: 8px;
                cursor: pointer;
                font-size: 0.95rem;
                margin-bottom: 8px;
                transition: all 0.2s;
            }

            .download-option:hover {
                background: #e9ecef;
            }

            .download-option i {
                width: 20px;
                color: #007aff;
            }

            .download-separator {
                height: 1px;
                background: #e0e0e0;
                margin: 16px 0;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Injecter les styles du panneau de sélection
     */
    injectStudentSelectionStyles() {
        const styleId = 'student-selection-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .student-selection-panel {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10002;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .student-panel-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
            }

            .student-panel-content {
                position: relative;
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 500px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .student-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid #e0e0e0;
                background: #f8f9fa;
            }

            .student-panel-header h3 {
                margin: 0;
                font-size: 1.1rem;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .student-panel-close {
                background: none;
                border: none;
                font-size: 1.25rem;
                cursor: pointer;
                color: #666;
            }

            .student-panel-actions {
                display: flex;
                gap: 8px;
                padding: 12px 16px;
                border-bottom: 1px solid #e0e0e0;
            }

            .student-panel-actions button {
                padding: 6px 12px;
                border: 1px solid #ddd;
                background: white;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.8rem;
            }

            .student-panel-actions button:hover {
                background: #f0f0f0;
            }

            .student-panel-list {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }

            .student-select-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                border-radius: 8px;
                cursor: pointer;
                margin-bottom: 8px;
                background: #f8f9fa;
            }

            .student-select-item:hover {
                background: #e9ecef;
            }

            .student-select-item input {
                width: 18px;
                height: 18px;
            }

            .student-select-name {
                flex: 1;
            }

            .student-absent-badge {
                background: #FEE2E2;
                color: #991B1B;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.75rem;
            }

            .student-panel-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px;
                border-top: 1px solid #e0e0e0;
                background: #f8f9fa;
            }

            .student-panel-footer .btn-send {
                background: #007aff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .student-panel-footer .btn-send:hover {
                background: #0056b3;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Charger les annotations
     */
    async loadAnnotations() {
        // Si c'est une feuille blanche, utiliser le chargement spécifique
        if (this.options.blankSheetId !== null || (this.options.lessonDate && this.options.periodNumber)) {
            return this.loadBlankSheet();
        }

        if (!this.options.fileId) {
            console.log('[Load] Pas de fileId, chargement ignoré');
            return;
        }

        try{
            console.log('[Load] Chargement des annotations pour fileId:', this.options.fileId);
            console.log('[Load] Envoi de la requête fetch...');
            const response = await fetch(`/file_manager/api/load-annotations/${this.options.fileId}`);
            console.log('[Load] Réponse reçue, status:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('[Load] Données reçues:', data);

                if (data.success && data.annotations) {
                    // Charger les pages custom si présentes
                    if (data.custom_pages && data.custom_pages.length > 0) {
                        console.log('[Load] Chargement de', data.custom_pages.length, 'pages custom');

                        // Trier les pages custom par position
                        const customPagesSorted = data.custom_pages.sort((a, b) => a.position - b.position);

                        // Reconstruire l'ordre des pages
                        for (const customPage of customPagesSorted) {
                            this.pages.set(customPage.pageId, {
                                type: customPage.type,
                                data: customPage.data || {}
                            });

                            // Insérer dans pageOrder à la bonne position
                            if (customPage.position < this.pageOrder.length) {
                                this.pageOrder.splice(customPage.position, 0, customPage.pageId);
                            } else {
                                this.pageOrder.push(customPage.pageId);
                            }
                        }

                        console.log('[Load] Pages custom chargées, nouvel ordre:', this.pageOrder);
                    }

                    // Charger les annotations par page
                    const annotationsData = data.annotations;

                    // Vider les annotations actuelles
                    this.annotations.clear();
                    this.annotationHistory = [];
                    this.historyIndex = -1;

                    // Reconstruire les annotations et l'historique
                    for (const [pageIdStr, pageAnnotations] of Object.entries(annotationsData)) {
                        // pageId peut être un nombre ou une string (pour les pages custom)
                        const pageId = pageIdStr.includes('_') ? pageIdStr : parseInt(pageIdStr);

                        if (!this.annotations.has(pageId)) {
                            this.annotations.set(pageId, []);
                        }

                        // Ajouter chaque annotation à la page ET à l'historique
                        for (const annotation of pageAnnotations) {
                            // LOG DE DEBUG: Vérifier les dimensions AVANT la migration
                            console.log(`[Load] DEBUG AVANT migration pageId ${pageId} tool ${annotation.tool}: canvasW=${annotation.canvasWidth} canvasH=${annotation.canvasHeight} hasW=${'canvasWidth' in annotation} hasH=${'canvasHeight' in annotation}`);

                            // Migrer les annotations legacy sans canvasWidth/canvasHeight
                            // Assumer qu'elles ont été créées sur un canvas "standard" (viewer plein écran sur /lesson)
                            // Taille de référence : PDF A4 à scale ~1.7 = 1200x1697 pixels
                            if (!annotation.canvasWidth || !annotation.canvasHeight) {
                                annotation.canvasWidth = 1200;
                                annotation.canvasHeight = 1697;
                                console.log('[Load] Migration annotation legacy - assigné dimensions par défaut:', annotation.canvasWidth, 'x', annotation.canvasHeight);
                            }

                            // LOG DE DEBUG: Vérifier les dimensions APRÈS la migration
                            console.log(`[Load] DEBUG APRÈS migration pageId ${pageId} tool ${annotation.tool}: canvasW=${annotation.canvasWidth} canvasH=${annotation.canvasHeight}`);

                            // Ajouter à la Map des annotations
                            this.annotations.get(pageId).push(annotation);

                            // Ajouter à l'historique pour le undo/redo
                            this.annotationHistory.push({
                                action: 'add',
                                pageId: pageId,
                                annotation: {...annotation}
                            });
                        }
                    }

                    // Mettre à jour historyIndex pour pointer sur la dernière annotation
                    this.historyIndex = this.annotationHistory.length - 1;

                    console.log('[Load] Annotations chargées:', this.annotationHistory.length, 'annotations dans l\'historique');
                    console.log('[Load] Pages avec annotations:', [...this.annotations.keys()]);

                    // Re-rendre les thumbnails et pages
                    await this.renderThumbnails();
                    await this.renderPages();

                    // Attendre un instant pour que les canvas soient prêts, puis redessiner
                    setTimeout(() => {
                        console.log('[Load] Redessinage après chargement...');
                        this.redrawAllPages();
                        this.updateUndoRedoButtons();
                    }, 100);

                    // Marquer comme non modifié puisqu'on vient de charger
                    this.isDirty = false;
                } else {
                    console.log('[Load] Aucune annotation à charger');
                }
            } else if (response.status === 404) {
                console.log('[Load] Aucune annotation sauvegardée pour ce fichier');
            } else {
                console.error('[Load] Erreur HTTP:', response.status);
            }
        } catch (error) {
            console.error('[Load] Erreur chargement annotations:', error);
        }
    }

    /**
     * Sauvegarder les annotations (version asynchrone)
     */
    async saveAnnotations() {
        // Si c'est une feuille blanche (blankSheetId ou lessonDate+periodNumber), utiliser la sauvegarde spécifique
        if (this.options.blankSheetId !== null || (this.options.lessonDate && this.options.periodNumber)) {
            return this.saveBlankSheet();
        }

        if (!this.options.fileId) {
            console.log('[Save] Pas de fileId, sauvegarde ignorée');
            return;
        }

        if (!this.isDirty) {
            console.log('[Save] Pas de modifications, sauvegarde ignorée');
            return;
        }

        try {
            // Préparer les données d'annotations
            const annotationsData = {};
            this.annotations.forEach((annotations, pageId) => {
                // Filtrer les grilles qui ne doivent pas être sauvegardées
                const annotationsToSave = annotations.filter(a => a.tool !== 'grid');
                if (annotationsToSave.length > 0) {
                    annotationsData[pageId] = annotationsToSave;
                }
            });

            // Préparer les pages custom (vierges et graphiques)
            const customPages = [];
            this.pages.forEach((pageData, pageId) => {
                if (pageData.type === 'blank' || pageData.type === 'graph' || pageData.type === 'timeline') {
                    const pageIndex = this.pageOrder.indexOf(pageId);
                    customPages.push({
                        pageId: pageId,
                        type: pageData.type,
                        data: pageData.data || {},
                        position: pageIndex // Position dans l'ordre des pages
                    });
                }
            });

            console.log('[Save] Sauvegarde de', Object.keys(annotationsData).length, 'pages avec annotations et', customPages.length, 'pages custom');

            // LOG DE DEBUG: Vérifier les dimensions des annotations avant sauvegarde
            for (const [pageId, pageAnnotations] of Object.entries(annotationsData)) {
                for (const ann of pageAnnotations) {
                    console.log(`[Save] DEBUG pageId ${pageId} tool ${ann.tool}: canvasW=${ann.canvasWidth} canvasH=${ann.canvasHeight} hasW=${'canvasWidth' in ann} hasH=${'canvasHeight' in ann}`);
                }
            }

            const response = await fetch('/file_manager/api/save-annotations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    file_id: this.options.fileId,
                    annotations: annotationsData,
                    custom_pages: customPages
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('[Save] Sauvegarde réussie:', result);
                this.isDirty = false;
            } else {
                console.error('[Save] Erreur HTTP:', response.status);
            }
        } catch (error) {
            console.error('[Save] Erreur sauvegarde:', error);
        }
    }

    /**
     * Sauvegarde les données d'une feuille blanche
     */
    async saveBlankSheet() {
        if (!this.isDirty) {
            console.log('[SaveBlankSheet] Pas de modifications, sauvegarde ignorée');
            return;
        }

        try {
            // Préparer les données d'annotations
            const annotationsData = {};
            this.annotations.forEach((annotations, pageId) => {
                const annotationsToSave = annotations.filter(a => a.tool !== 'grid');
                if (annotationsToSave.length > 0) {
                    annotationsData[pageId] = annotationsToSave;
                }
            });

            // Préparer les pages custom (vierges et graphiques)
            const customPages = [];
            this.pages.forEach((pageData, pageId) => {
                if (pageData.type === 'blank' || pageData.type === 'graph' || pageData.type === 'timeline') {
                    const pageIndex = this.pageOrder.indexOf(pageId);
                    customPages.push({
                        pageId: pageId,
                        type: pageData.type,
                        data: pageData.data || {},
                        position: pageIndex
                    });
                }
            });

            console.log('[SaveBlankSheet] Sauvegarde feuille blanche, annotations:', Object.keys(annotationsData).length, 'pages, custom:', customPages.length, 'pages');

            const sheetData = {
                sheet_id: this.options.blankSheetId,  // null si nouvelle feuille
                lesson_date: this.options.lessonDate,
                period_number: this.options.periodNumber,
                classroom_id: this.options.classroomId,
                title: this.options.title || 'Feuille blanche',
                sheet_data: {
                    custom_pages: customPages,
                    annotations: annotationsData
                }
            };

            const response = await fetch('/planning/api/blank-sheets/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(sheetData)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('[SaveBlankSheet] Sauvegarde réussie:', result);

                // Mettre à jour l'ID si c'était une nouvelle feuille
                if (!this.options.blankSheetId && result.sheet_id) {
                    this.options.blankSheetId = result.sheet_id;
                    console.log('[SaveBlankSheet] Nouvelle feuille créée avec ID:', result.sheet_id);
                }

                this.isDirty = false;
            } else {
                const error = await response.json();
                console.error('[SaveBlankSheet] Erreur HTTP:', response.status, error);
            }
        } catch (error) {
            console.error('[SaveBlankSheet] Erreur sauvegarde:', error);
        }
    }

    /**
     * Charge les données d'une feuille blanche
     */
    async loadBlankSheet() {
        if (!this.options.blankSheetId) {
            console.log('[LoadBlankSheet] Pas de blankSheetId, création nouvelle feuille');
            // Créer une première page blanche
            await this.addBlankPageAfterCurrent();
            return;
        }

        try {
            console.log('[LoadBlankSheet] Chargement feuille:', this.options.blankSheetId);

            const response = await fetch(`/planning/api/blank-sheets/${this.options.blankSheetId}`);

            if (!response.ok) {
                console.error('[LoadBlankSheet] Erreur HTTP:', response.status);
                return;
            }

            const result = await response.json();

            if (!result.success) {
                console.error('[LoadBlankSheet] Erreur:', result.message);
                return;
            }

            const sheet = result.sheet;
            const sheetData = sheet.sheet_data;

            console.log('[LoadBlankSheet] Données chargées:', sheetData);

            // Charger les annotations AVANT de rendre les pages
            if (sheetData.annotations) {
                console.log('[LoadBlankSheet] Chargement annotations pour', Object.keys(sheetData.annotations).length, 'pages');

                for (const [pageId, pageAnnotations] of Object.entries(sheetData.annotations)) {
                    // Migrer les annotations legacy sans canvasWidth/canvasHeight
                    // Utiliser les dimensions standard d'une page A4 à 96 DPI en largeur = viewerWidth * 0.95
                    const migratedAnnotations = pageAnnotations.map(annotation => {
                        if (!annotation.canvasWidth || !annotation.canvasHeight) {
                            // Dimensions standard pour une page créée sur /lesson (plein écran)
                            // Ces valeurs seront ajustées automatiquement lors du redimensionnement
                            annotation.canvasWidth = 1200;  // Largeur typique d'un viewer plein écran
                            annotation.canvasHeight = 1697;  // Hauteur A4 proportionnelle
                            console.log('[LoadBlankSheet] Migration annotation legacy - ajout dimensions:', annotation.canvasWidth, 'x', annotation.canvasHeight);
                        }
                        return annotation;
                    });

                    this.annotations.set(pageId, migratedAnnotations);
                }

                console.log('[LoadBlankSheet] Annotations chargées en mémoire');
            }

            // Charger les pages custom
            if (sheetData.custom_pages && sheetData.custom_pages.length > 0) {
                console.log('[LoadBlankSheet] Chargement de', sheetData.custom_pages.length, 'pages custom');

                const customPagesSorted = sheetData.custom_pages.sort((a, b) => a.position - b.position);

                for (const customPage of customPagesSorted) {
                    console.log('[LoadBlankSheet] Ajout page:', customPage.pageId, 'type:', customPage.type, 'position:', customPage.position);
                    this.pages.set(customPage.pageId, {
                        type: customPage.type,
                        data: customPage.data || {}
                    });

                    if (customPage.position < this.pageOrder.length) {
                        this.pageOrder.splice(customPage.position, 0, customPage.pageId);
                    } else {
                        this.pageOrder.push(customPage.pageId);
                    }
                }

                // Mettre à jour le nombre total de pages
                this.totalPages = this.pageOrder.length;
                console.log('[LoadBlankSheet] Total pages:', this.totalPages, 'pageOrder:', this.pageOrder);

                // Rendre les pages (les annotations déjà en mémoire seront dessinées automatiquement)
                console.log('[LoadBlankSheet] Début rendu thumbnails...');
                await this.renderThumbnails();
                console.log('[LoadBlankSheet] Thumbnails rendus, début rendu pages...');
                await this.renderPages();
                console.log('[LoadBlankSheet] Pages rendues');
            } else {
                // Aucune page custom, créer une page blanche par défaut
                console.log('[LoadBlankSheet] Aucune page custom, création page blanche par défaut');
                await this.addBlankPageAfterCurrent();
            }

            this.isDirty = false;
            console.log('[LoadBlankSheet] Chargement terminé');

        } catch (error) {
            console.error('[LoadBlankSheet] Erreur chargement:', error);
            // En cas d'erreur, créer une page blanche par défaut
            await this.addBlankPageAfterCurrent();
        }
    }

    /**
     * Sauvegarder les annotations de manière SYNCHRONE
     * Utilisé pour beforeunload/pagehide/visibilitychange
     */
    saveAnnotationsSync() {
        console.log('[SaveSync] Appel saveAnnotationsSync - fileId:', this.options.fileId, 'isDirty:', this.isDirty);

        if (!this.options.fileId) {
            console.warn('[SaveSync] Pas de fileId, abandon');
            return;
        }

        if (!this.isDirty) {
            console.log('[SaveSync] Pas de modifications, abandon');
            return;
        }

        try {
            // Préparer les données d'annotations
            const annotationsData = {};
            this.annotations.forEach((annotations, pageId) => {
                const annotationsToSave = annotations.filter(a => a.tool !== 'grid');
                if (annotationsToSave.length > 0) {
                    annotationsData[pageId] = annotationsToSave;
                }
            });

            // Préparer les pages custom (vierges et graphiques)
            const customPages = [];
            this.pages.forEach((pageData, pageId) => {
                if (pageData.type === 'blank' || pageData.type === 'graph' || pageData.type === 'timeline') {
                    const pageIndex = this.pageOrder.indexOf(pageId);
                    customPages.push({
                        pageId: pageId,
                        type: pageData.type,
                        data: pageData.data || {},
                        position: pageIndex
                    });
                }
            });

            const pageCount = Object.keys(annotationsData).length;
            const totalAnnotations = Object.values(annotationsData).reduce((sum, arr) => sum + arr.length, 0);

            console.log('[SaveSync] Sauvegarde synchrone de', pageCount, 'pages,', totalAnnotations, 'annotations et', customPages.length, 'pages custom');

            const data = JSON.stringify({
                file_id: this.options.fileId,
                annotations: annotationsData,
                custom_pages: customPages
            });

            // XMLHttpRequest synchrone (déprécié mais nécessaire pour beforeunload)
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/file_manager/api/save-annotations', false); // false = synchrone
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(data);

            if (xhr.status === 200) {
                console.log('[SaveSync] ✅ Sauvegarde synchrone réussie');
                this.isDirty = false;
            } else {
                console.error('[SaveSync] ❌ Erreur HTTP:', xhr.status, xhr.responseText);
            }
        } catch (error) {
            console.error('[SaveSync] ❌ Exception:', error);
        }
    }

    /**
     * Démarrer l'auto-save
     */
    startAutoSave() {
        console.log('[AutoSave] Démarrage auto-save toutes les', this.options.autoSaveInterval, 'ms');
        this.autoSaveTimer = setInterval(() => {
            if (this.isDirty) {
                console.log('[AutoSave] Sauvegarde automatique déclenchée');
                this.saveAnnotations();
            }
        }, this.options.autoSaveInterval);
    }

    /**
     * Arrêter l'auto-save
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Configurer la sauvegarde avant fermeture du navigateur
     */
    setupBeforeUnload() {
        // Utiliser visibilitychange pour sauvegarder avant que la page soit cachée
        this.visibilityHandler = () => {
            if (document.visibilityState === 'hidden' && this.isDirty) {
                console.log('[Visibility] Sauvegarde avant masquage de la page...');
                // Sauvegarder de manière SYNCHRONE
                this.saveAnnotationsSync();
            }
        };

        // Listener pour beforeunload (fermeture de fenêtre)
        this.beforeUnloadHandler = (e) => {
            if (this.isDirty) {
                console.log('[BeforeUnload] Sauvegarde avant fermeture...');
                // Sauvegarder de manière SYNCHRONE
                this.saveAnnotationsSync();
            }
        };

        // Listener pour pagehide (iOS Safari)
        this.pagehideHandler = (e) => {
            if (this.isDirty) {
                console.log('[PageHide] Sauvegarde avant fermeture page...');
                // Sauvegarder de manière SYNCHRONE
                this.saveAnnotationsSync();
            }
        };

        document.addEventListener('visibilitychange', this.visibilityHandler);
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        window.addEventListener('pagehide', this.pagehideHandler);
    }

    /**
     * Nettoyer les listeners de fermeture
     */
    cleanupBeforeUnload() {
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }
        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
            this.beforeUnloadHandler = null;
        }
        if (this.pagehideHandler) {
            window.removeEventListener('pagehide', this.pagehideHandler);
            this.pagehideHandler = null;
        }
    }

    /**
     * Afficher/masquer le loading
     */
    showLoading(show) {
        this.elements.loading.style.display = show ? 'flex' : 'none';

        // Si on affiche le loading, réinitialiser les états d'interaction
        // pour éviter que le viewer reste bloqué
        if (show) {
            this.isAnnotating = false;
            this.isDrawing = false;
        }
    }

    /**
     * Fermer le viewer
     */
    async close() {
        console.log('[Close] Fermeture du viewer PDF...');

        // Masquer l'équerre si elle est affichée
        this.hideSetSquare();

        // Sauvegarder avant de fermer
        if (this.isDirty) {
            try {
                await this.saveAnnotations();
            } catch (e) {
                console.error('[Close] Erreur sauvegarde:', e);
            }
        }

        // Nettoyer les timers et listeners
        this.stopAutoSave();
        this.cleanupBeforeUnload();

        // Retirer la classe du body pour restaurer le scroll global
        document.body.classList.remove('pdf-viewer-active');

        // Restaurer l'overflow original du body et html
        // Forcer la restauration même si originalBodyOverflow est vide
        if (this.originalBodyOverflow !== undefined) {
            document.body.style.overflow = this.originalBodyOverflow;
            console.log('[PDF Viewer] Body overflow restauré à:', this.originalBodyOverflow || 'vide');
        } else {
            // Si pas de valeur sauvegardée, supprimer le style inline pour revenir au CSS
            document.body.style.overflow = '';
            console.log('[PDF Viewer] Body overflow supprimé (pas de valeur sauvegardée)');
        }

        if (this.originalHtmlOverflow !== undefined) {
            document.documentElement.style.overflow = this.originalHtmlOverflow;
            console.log('[PDF Viewer] HTML overflow restauré à:', this.originalHtmlOverflow || 'vide');
        } else {
            document.documentElement.style.overflow = '';
            console.log('[PDF Viewer] HTML overflow supprimé (pas de valeur sauvegardée)');
        }

        // Restaurer le touchAction aussi
        document.body.style.touchAction = '';

        // Forcer un re-flow pour s'assurer que les styles sont appliqués
        document.body.offsetHeight;

        // Nettoyer le DOM
        this.container.innerHTML = '';
        this.container.style.display = 'none';

        // Fermer aussi le modal parent s'il existe (fileViewerModal)
        const fileViewerModal = document.getElementById('fileViewerModal');
        if (fileViewerModal) {
            fileViewerModal.classList.remove('show');
            fileViewerModal.classList.remove('embedded');
            fileViewerModal.style.display = 'none';
            console.log('[Close] Modal fileViewerModal fermé');
        }

        // Réafficher le contenu principal de la page lesson
        const lessonContainer = document.querySelector('.lesson-container');
        if (lessonContainer) {
            lessonContainer.style.display = '';
            console.log('[Close] Lesson container réaffiché');
        }

        // IMPORTANT: Vérification finale pour s'assurer que le scroll fonctionne
        // Certaines pages peuvent avoir un overflow:hidden qui persiste
        setTimeout(() => {
            // Vérifier si le body a toujours overflow:hidden
            const bodyOverflow = window.getComputedStyle(document.body).overflow;
            const htmlOverflow = window.getComputedStyle(document.documentElement).overflow;

            console.log('[Close] Vérification finale - body overflow:', bodyOverflow, ', html overflow:', htmlOverflow);

            if (bodyOverflow === 'hidden') {
                console.warn('[Close] Body overflow encore hidden, forçage à auto');
                document.body.style.overflow = 'auto';
            }
            if (htmlOverflow === 'hidden') {
                console.warn('[Close] HTML overflow encore hidden, forçage à auto');
                document.documentElement.style.overflow = 'auto';
            }

            // Forcer un dernier reflow
            document.body.offsetHeight;
        }, 100);

        // Appeler le callback si fourni
        if (this.options.onClose) {
            console.log('[Close] Appel du callback onClose');
            try {
                this.options.onClose();
            } catch (e) {
                console.error('[Close] Erreur dans onClose:', e);
            }
        }
    }

    /**
     * Détruit complètement le viewer sans sauvegarder
     */
    destroy() {
        console.log('[Destroy] Destruction du viewer PDF...');

        // Masquer l'équerre si elle est affichée
        this.hideSetSquare();

        // Nettoyer les timers et listeners
        this.stopAutoSave();
        this.cleanupBeforeUnload();

        // Nettoyer le DOM
        if (this.container) {
            this.container.innerHTML = '';
            this.container.style.display = 'none';
        }

        console.log('[Destroy] Viewer détruit');
    }

    /**
     * Afficher l'équerre (set square)
     */
    showSetSquare() {
        console.log('[SetSquare] Affichage de l\'équerre');

        // Vérifier si l'équerre existe déjà (chercher dans le body car position fixed)
        let setSquare = document.querySelector('.set-square-overlay');

        if (!setSquare) {
            // Calculer les dimensions de l'équerre
            // L'hypothénuse doit faire 2/3 de la largeur du PDF
            const pdfCanvas = this.container.querySelector('.pdf-canvas');
            if (!pdfCanvas) {
                console.error('[SetSquare] Canvas PDF non trouvé');
                return;
            }

            const pdfWidth = pdfCanvas.offsetWidth;
            const hypotenuse = (pdfWidth * 2) / 3;
            // Pour un triangle 45-45-90, les deux côtés égaux = hypotenuse / √2
            const side = hypotenuse / Math.sqrt(2);

            // Créer l'overlay SVG avec des dimensions généreuses pour éviter la coupure
            const svgSize = Math.max(hypotenuse, side) * 2; // Taille suffisante pour toute rotation
            setSquare = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            setSquare.classList.add('set-square-overlay');
            setSquare.setAttribute('width', svgSize);
            setSquare.setAttribute('height', svgSize);
            setSquare.style.position = 'fixed'; // Fixed pour éviter les problèmes de scroll
            setSquare.style.pointerEvents = 'none'; // Le SVG ne capte aucun événement - CRUCIAL pour le stylet
            setSquare.style.zIndex = '10000'; // AU-DESSUS de tout pour être visible

            // Positionner au centre du viewer
            const viewer = this.elements.viewer;
            const viewerRect = viewer.getBoundingClientRect();
            const centerX = viewerRect.left + viewerRect.width / 2 - svgSize / 2;
            const centerY = viewerRect.top + viewerRect.height / 2 - svgSize / 2;
            setSquare.style.left = centerX + 'px';
            setSquare.style.top = centerY + 'px';

            // Créer le groupe principal qui sera transformé
            const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            mainGroup.setAttribute('id', 'set-square-main-group');

            // Centrer le triangle dans le SVG
            const offsetX = svgSize / 2 - side / 2;
            const offsetY = svgSize / 2 - side / 2;
            mainGroup.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

            // Dessiner le triangle simple gris semi-transparent
            const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            triangle.setAttribute('id', 'set-square-triangle');
            triangle.setAttribute('points', `0,${side} ${side},${side} ${side},0`);
            triangle.setAttribute('fill', 'rgba(128, 128, 128, 0.5)'); // Gris semi-transparent
            triangle.setAttribute('stroke', 'rgba(64, 64, 64, 0.8)');
            triangle.setAttribute('stroke-width', '2');
            // ASTUCE: pointer-events none pour laisser passer le stylet
            // On activera pointer-events dynamiquement seulement pour les touches
            triangle.style.pointerEvents = 'none';
            triangle.style.touchAction = 'none';
            mainGroup.appendChild(triangle);

            setSquare.appendChild(mainGroup);

            // Ajouter au body (pas au viewer) pour position fixed
            document.body.appendChild(setSquare);

            // Calculer le centre de gravité du triangle 45-45-90
            // Pour un triangle avec sommets (0,side), (side,side), (side,0):
            // centroïde = ((x1+x2+x3)/3, (y1+y2+y3)/3) = ((0+side+side)/3, (side+side+0)/3)
            const centroidX = (0 + side + side) / 3; // = 2*side/3
            const centroidY = (side + side + 0) / 3; // = 2*side/3

            // Initialiser les variables de transformation
            this.setSquareTransform = {
                x: 0,
                y: 0,
                rotation: 0,
                scale: 1,
                centroidX: centroidX,
                centroidY: centroidY,
                offsetX: offsetX,
                offsetY: offsetY,
                side: side
            };

            // Ajouter les gestionnaires de gestes tactiles au triangle
            this.attachSetSquareGestures(setSquare, mainGroup, triangle);
        } else {
            // Si l'équerre existe déjà, simplement l'afficher
            setSquare.style.display = 'block';
        }

        // Marquer l'équerre comme active
        this.setSquareActive = true;
        console.log('[SetSquare] Équerre activée - scroll/zoom doigts bloqués');

        // Ajouter un gestionnaire global pour bloquer TOUS les touches quand équerre active
        // Ceci complète les gestionnaires sur le viewer pour capturer les touches qui passent ailleurs
        this.blockScrollWhenSetSquareActive();
    }

    /**
     * Bloquer le scroll/zoom global quand l'équerre est active
     */
    blockScrollWhenSetSquareActive() {
        // Si un handler existe déjà, le retirer d'abord
        if (this.globalTouchBlockHandler) {
            document.removeEventListener('touchstart', this.globalTouchBlockHandler, { passive: false });
            document.removeEventListener('touchmove', this.globalTouchBlockHandler, { passive: false });
        }

        // Créer un nouveau handler qui bloque les touches sur le viewer SAUF boutons et équerre
        this.globalTouchBlockHandler = (e) => {
            // Vérifier si l'équerre est toujours active
            if (this.setSquareActive) {
                const target = e.target;

                // NE PAS bloquer les touches sur:
                // - Les boutons de la toolbar
                // - L'équerre elle-même (gérée par les listeners pointer)
                if (target && (
                    target.closest('.toolbar') ||
                    target.closest('.btn-tool') ||
                    target.closest('button') ||
                    target.tagName === 'BUTTON' ||
                    target.classList.contains('btn-tool') ||
                    target.closest('.set-square-overlay')
                )) {
                    console.log('[SetSquare Global] ✓ Touch autorisé sur:', target.className || target.tagName);
                    return; // Laisser passer
                }

                // Bloquer tout le reste (scroll/zoom sur le viewer)
                console.log('[SetSquare Global] ✋ Blocage touch sur viewer');
                e.preventDefault();
                // NE PAS stopPropagation - laisser les événements se propager pour les autres handlers
            }
        };

        // Attacher au document pour capturer TOUS les événements touch
        document.addEventListener('touchstart', this.globalTouchBlockHandler, { passive: false, capture: true });
        document.addEventListener('touchmove', this.globalTouchBlockHandler, { passive: false, capture: true });

        console.log('[SetSquare] Gestionnaires globaux de blocage attachés');
    }

    /**
     * Masquer l'équerre
     */
    hideSetSquare() {
        const setSquare = document.querySelector('.set-square-overlay');
        if (setSquare) {
            setSquare.style.display = 'none';
            console.log('[SetSquare] Équerre masquée');
        }

        // Marquer l'équerre comme inactive
        this.setSquareActive = false;

        // Retirer les gestionnaires globaux de blocage touch
        if (this.globalTouchBlockHandler) {
            document.removeEventListener('touchstart', this.globalTouchBlockHandler, { passive: false, capture: true });
            document.removeEventListener('touchmove', this.globalTouchBlockHandler, { passive: false, capture: true });
            this.globalTouchBlockHandler = null;
            console.log('[SetSquare] Gestionnaires globaux de blocage retirés');
        }

        // NOTE: On ne retire PAS les gestionnaires pointer de l'équerre
        // car ils vérifient déjà this.setSquareActive et retournent immédiatement si false.
        // Cela évite d'avoir à les réattacher à chaque réactivation de l'équerre.
        // Les gestionnaires restent attachés mais inactifs quand l'équerre est cachée.

        // CORRECTION BUG: Si on retire les gestionnaires ici, ils ne sont pas réattachés
        // lors de la réactivation (car showSetSquare() ne les attache que lors de la création initiale).
        // Résultat: l'équerre ne peut plus tourner ni se déplacer après la première désactivation.

        console.log('[SetSquare] Équerre désactivée - scroll/zoom doigts restaurés');
    }

    /**
     * Calculer l'aimantation au bord de l'équerre
     * @param {number} clientX - Position X du pointeur en coordonnées client
     * @param {number} clientY - Position Y du pointeur en coordonnées client
     * @param {HTMLCanvasElement} canvas - Canvas de dessin
     * @returns {Object|null} - Nouvelles coordonnées {x, y} dans le canvas si aimantation, null sinon
     */
    snapToSetSquare(clientX, clientY, canvas) {
        const setSquare = document.querySelector('.set-square-overlay');
        if (!setSquare || setSquare.style.display === 'none') {
            console.log('[Snap DEBUG] Équerre introuvable ou masquée');
            return null;
        }

        const SNAP_THRESHOLD = 20; // Distance en pixels pour l'aimantation
        console.log(`[Snap DEBUG] Vérification snap pour point (${clientX.toFixed(1)}, ${clientY.toFixed(1)})`);

        // Obtenir le triangle SVG et ses coordonnées transformées
        const triangleElement = setSquare.querySelector('#set-square-triangle');
        if (!triangleElement) {
            console.log('[Snap DEBUG] Triangle introuvable');
            return null;
        }

        // Utiliser getBBox pour obtenir les dimensions du triangle dans son système de coordonnées local
        const bbox = triangleElement.getBBox();
        console.log('[Snap DEBUG] Triangle bbox:', bbox);

        // Récupérer la matrice de transformation complète (incluant tous les transforms SVG)
        const screenCTM = triangleElement.getScreenCTM();

        if (!screenCTM) {
            console.log('[Snap DEBUG] Impossible d\'obtenir la matrice de transformation');
            return null;
        }

        console.log('[Snap DEBUG] Matrice de transformation:', {
            a: screenCTM.a, b: screenCTM.b, c: screenCTM.c,
            d: screenCTM.d, e: screenCTM.e, f: screenCTM.f
        });

        // Les 3 sommets du triangle dans le système de coordonnées local SVG
        // Le triangle a 3 points: (0, side), (side, side), (side, 0)
        const side = this.setSquareTransform.side;
        const localVertices = [
            {x: 0, y: side},           // Sommet inférieur gauche
            {x: side, y: side},        // Sommet inférieur droit (angle droit)
            {x: side, y: 0}            // Sommet supérieur droit
        ];

        // Transformer les sommets en coordonnées écran en utilisant la matrice CTM
        const screenVertices = localVertices.map(v => {
            const point = setSquare.createSVGPoint();
            point.x = v.x;
            point.y = v.y;
            const transformed = point.matrixTransform(screenCTM);
            return {x: transformed.x, y: transformed.y};
        });

        console.log('[Snap DEBUG] Sommets transformés:', screenVertices);

        // Les 3 bords du triangle
        const edges = [
            {name: 'base', p1: screenVertices[0], p2: screenVertices[1]},      // Bord horizontal (base)
            {name: 'vertical', p1: screenVertices[1], p2: screenVertices[2]},  // Bord vertical (côté droit)
            {name: 'hypoténuse', p1: screenVertices[2], p2: screenVertices[0]} // Hypothénuse
        ];

        // Vérifier la distance à chaque bord
        let closestPoint = null;
        let minDistance = SNAP_THRESHOLD;
        let closestEdge = null;

        for (const edge of edges) {
            const {p1, p2, name} = edge;

            // Calculer la distance du point au segment
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const lengthSq = dx * dx + dy * dy;

            if (lengthSq === 0) {
                console.log(`[Snap DEBUG] Bord ${name} - points identiques, ignoré`);
                continue;
            }

            // Paramètre t du point le plus proche sur le segment
            let t = ((clientX - p1.x) * dx + (clientY - p1.y) * dy) / lengthSq;
            t = Math.max(0, Math.min(1, t)); // Clamper à [0, 1]

            // Point le plus proche sur le segment (en coordonnées écran)
            const nearestX = p1.x + t * dx;
            const nearestY = p1.y + t * dy;

            // Distance au point
            const distance = Math.sqrt((clientX - nearestX) ** 2 + (clientY - nearestY) ** 2);

            console.log(`[Snap DEBUG] Bord ${name}: distance=${distance.toFixed(1)}px, t=${t.toFixed(2)}, nearest=(${nearestX.toFixed(1)}, ${nearestY.toFixed(1)})`);

            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = {x: nearestX, y: nearestY}; // Garder en coordonnées écran pour l'instant
                closestEdge = name;
            }
        }

        if (closestPoint) {
            // Convertir en coordonnées canvas
            const canvasRect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / canvasRect.width;
            const scaleY = canvas.height / canvasRect.height;

            const canvasX = (closestPoint.x - canvasRect.left) * scaleX;
            const canvasY = (closestPoint.y - canvasRect.top) * scaleY;

            console.log(`[Snap DEBUG] ✓ SNAP sur ${closestEdge} à ${minDistance.toFixed(1)}px - écran(${closestPoint.x.toFixed(1)}, ${closestPoint.y.toFixed(1)}) -> canvas(${canvasX.toFixed(1)}, ${canvasY.toFixed(1)})`);

            return {x: canvasX, y: canvasY};
        }

        console.log('[Snap DEBUG] ✗ Aucun bord dans la zone de snap');
        return null;
    }

    /**
     * Attacher les gestionnaires de gestes pour l'équerre
     */
    attachSetSquareGestures(svgElement, mainGroup, triangleElement) {
        let pointers = new Map(); // Stocker les pointeurs actifs (seulement touch, pas pen)
        let initialDistance = 0;
        let initialRotation = 0;
        let initialAngle = 0;

        const updateTransform = () => {
            // Rotation autour du centre de gravité du triangle
            const cx = this.setSquareTransform.centroidX;
            const cy = this.setSquareTransform.centroidY;
            const offsetX = this.setSquareTransform.offsetX;
            const offsetY = this.setSquareTransform.offsetY;

            const transform = `translate(${offsetX}, ${offsetY}) rotate(${this.setSquareTransform.rotation}, ${cx}, ${cy}) scale(${this.setSquareTransform.scale})`;
            mainGroup.setAttribute('transform', transform);
        };

        // Écouter au niveau du document pour détecter les touches sur le triangle
        // Le triangle a pointer-events: none donc on doit activer dynamiquement
        const handlePointerDown = (e) => {
            console.log(`[SetSquare DEBUG] pointerdown - type: ${e.pointerType}, setSquareActive: ${this.setSquareActive}, target: ${e.target?.tagName}`);

            // IMPORTANT: Ne traiter QUE si l'équerre est active
            if (!this.setSquareActive) {
                console.log('[SetSquare DEBUG] Équerre non active, ignorer');
                return;
            }

            // Ignorer le stylet - le stylet ne doit JAMAIS être capturé
            if (e.pointerType === 'pen') {
                console.log('[SetSquare DEBUG] Stylet détecté - LAISSER PASSER (return)');
                return;
            }

            // Pour les doigts, accepter tous les touches sur l'équerre
            if (e.pointerType === 'touch') {
                console.log('[SetSquare DEBUG] Touch détecté - activation manipulation');

                e.stopPropagation();
                e.preventDefault();

                pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
                console.log('[SetSquare DEBUG] Pointers actifs:', pointers.size);

                if (pointers.size === 2) {
                    // Deux doigts - préparer la rotation
                    const pts = Array.from(pointers.values());
                    const dx = pts[1].x - pts[0].x;
                    const dy = pts[1].y - pts[0].y;
                    initialDistance = Math.sqrt(dx * dx + dy * dy);
                    initialAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                    initialRotation = this.setSquareTransform.rotation;
                    console.log('[SetSquare] Rotation initialisée, angle:', initialAngle);
                }
            }
        };
        // NE PAS utiliser capture: true - sinon on intercepte le stylet avant le viewer
        document.addEventListener('pointerdown', handlePointerDown);
        this.setSquarePointerDownHandler = handlePointerDown;

        const handlePointerMove = (e) => {
            if (!this.setSquareActive) return;
            if (e.pointerType === 'pen') return;
            if (!pointers.has(e.pointerId)) return;

            e.stopPropagation();
            e.preventDefault();

            const oldPointer = pointers.get(e.pointerId);
            pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

            if (pointers.size === 1) {
                // Un doigt - translation du SVG entier
                const dx = e.clientX - oldPointer.x;
                const dy = e.clientY - oldPointer.y;

                const currentLeft = parseFloat(svgElement.style.left) || 0;
                const currentTop = parseFloat(svgElement.style.top) || 0;

                svgElement.style.left = (currentLeft + dx) + 'px';
                svgElement.style.top = (currentTop + dy) + 'px';
            } else if (pointers.size === 2) {
                // Deux doigts - rotation autour du centroïde
                const pts = Array.from(pointers.values());
                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);

                this.setSquareTransform.rotation = initialRotation + (currentAngle - initialAngle);
                console.log('[SetSquare] Rotation:', this.setSquareTransform.rotation);
                updateTransform();
            }
        };
        document.addEventListener('pointermove', handlePointerMove);
        this.setSquarePointerMoveHandler = handlePointerMove;

        const handlePointerUp = (e) => {
            if (!this.setSquareActive) return;
            if (e.pointerType === 'pen') return;
            if (pointers.has(e.pointerId)) {
                pointers.delete(e.pointerId);
            }
        };
        document.addEventListener('pointerup', handlePointerUp);
        this.setSquarePointerUpHandler = handlePointerUp;

        const handlePointerCancel = (e) => {
            if (!this.setSquareActive) return;
            if (e.pointerType === 'pen') return;
            if (pointers.has(e.pointerId)) {
                pointers.delete(e.pointerId);
            }
        };
        document.addEventListener('pointercancel', handlePointerCancel);
        this.setSquarePointerCancelHandler = handlePointerCancel;
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.CleanPDFViewer = CleanPDFViewer;
}
