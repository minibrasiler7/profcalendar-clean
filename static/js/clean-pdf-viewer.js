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
            showSidebar: options.showSidebar !== false,
            enableAnnotations: options.enableAnnotations !== false,
            autoSaveInterval: options.autoSaveInterval || 5000, // 5 secondes
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

        // Sauvegarde automatique
        this.autoSaveTimer = null;
        this.isDirty = false;

        // Éléments DOM
        this.elements = {};

        // Outils d'annotation
        this.annotationTools = null;

        // Initialiser
        this.init();
    }

    /**
     * Initialisation du viewer
     */
    async init() {
        // Créer l'interface
        this.createUI();

        // Ajouter classe au body pour bloquer le scroll global
        document.body.classList.add('pdf-viewer-active');

        // NOUVELLE ARCHITECTURE: Le viewer est en position fixed, le BODY scroll
        // Forcer le body à pouvoir scroller (retirer overflow: hidden)
        this.originalBodyOverflow = document.body.style.overflow;
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
        }

        // Charger les annotations sauvegardées
        console.log('[Init] Vérification fileId:', this.options.fileId);
        if (this.options.fileId) {
            console.log('[Init] Appel de loadAnnotations()...');
            await this.loadAnnotations();
        } else {
            console.log('[Init] Pas de fileId, annotations non chargées');
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
                    </div>
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
            loading: this.container.querySelector('#pdf-loading')
        };

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
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: white;
                border-bottom: 1px solid #e0e0e0;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                gap: 16px;
            }

            .toolbar-left,
            .toolbar-center,
            .toolbar-right {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .btn-tool,
            .btn-action {
                width: 40px;
                height: 40px;
                border: none;
                background: transparent;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                color: #333;
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
                pointer-events: none;
                border: 2px solid #e0e0e0;
            }

            .custom-color-wrapper {
                position: relative;
                width: 32px;
                height: 32px;
            }

            #color-picker {
                width: 32px;
                height: 32px;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                padding: 0;
                -webkit-appearance: none;
                -moz-appearance: none;
                appearance: none;
            }

            #color-picker::-webkit-color-swatch-wrapper {
                padding: 0;
                border-radius: 50%;
            }

            #color-picker::-webkit-color-swatch {
                border: 2px solid #e0e0e0;
                border-radius: 50%;
            }

            #color-picker::-moz-color-swatch {
                border: 2px solid #e0e0e0;
                border-radius: 50%;
            }

            #color-picker.active {
                border: 3px solid #007aff;
                box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
            }

            #color-picker.active::-webkit-color-swatch {
                border-color: #007aff;
                border-width: 3px;
            }

            #color-picker.active::-moz-color-swatch {
                border-color: #007aff;
                border-width: 3px;
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
                this.elements.colorPicker.classList.remove('active');

                // Activer le bouton cliqué
                btn.classList.add('active');

                // Utiliser la couleur du bouton
                this.currentColor = btn.dataset.color;
            });
        });

        // Color picker (couleur personnalisée)
        this.elements.colorPicker.addEventListener('change', (e) => {
            this.currentColor = e.target.value;
        });

        this.elements.colorPicker.addEventListener('click', () => {
            // Retirer active des autres boutons
            this.container.querySelectorAll('.btn-color').forEach(b => b.classList.remove('active'));
            // Activer le color picker
            this.elements.colorPicker.classList.add('active');
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
            });
        });

        // Actions
        this.elements.btnUndo.addEventListener('click', () => this.undo());
        this.elements.btnRedo.addEventListener('click', () => this.redo());
        this.elements.btnClearPage.addEventListener('click', () => this.clearCurrentPage());
        this.elements.btnDownload.addEventListener('click', () => this.showDownloadMenu());
        this.elements.btnClose.addEventListener('click', () => this.close());

        // Scroll viewer pour détecter la page actuelle
        this.elements.viewer.addEventListener('scroll', () => this.updateCurrentPageFromScroll());

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
            // OU si c'est un seul touch (potentiellement un stylet)
            if (this.isAnnotating) {
                console.log('[Viewer NEW] touchstart - BLOQUANT (annotation en cours)');
                e.preventDefault();
            }
        }, { passive: false });

        this.elements.viewer.addEventListener('touchmove', (e) => {
            if (this.isAnnotating) {
                console.log('[Viewer NEW] touchmove - BLOQUANT (annotation en cours)');
                e.preventDefault();
            }
        }, { passive: false });

        // Gestionnaires pointer events au niveau viewer
        this.elements.viewer.addEventListener('pointerdown', (e) => {
            console.log(`[Viewer NEW] pointerdown type: ${e.pointerType}`);
            this.lastPointerType = e.pointerType;

            // Activer visuellement les canvas au premier contact stylet
            if (e.pointerType === 'pen' && !this.penDetected) {
                console.log('[Viewer NEW] PREMIER contact stylet - activation visuelle des canvas');
                this.penDetected = true;
                this.container.querySelectorAll('.annotation-canvas').forEach(canvas => {
                    canvas.classList.add('pen-active');
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
                    const pageId = wrapper ? parseInt(wrapper.dataset.pageId) : undefined;
                    console.log(`[Viewer NEW] Canvas trouvé pour pageId: ${pageId}`);
                    this.startAnnotation(e, canvas, pageId);
                } else {
                    console.log('[Viewer NEW] ERREUR: Aucun canvas trouvé à cette position');
                }
            } else if (e.pointerType === 'touch') {
                console.log('[Viewer NEW] Touch détecté - LAISSANT PASSER pour scroll/zoom');
                this.isAnnotating = false;
                // NE RIEN FAIRE - laisser le scroll natif fonctionner
            }
        }, { passive: false });

        this.elements.viewer.addEventListener('pointermove', (e) => {
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
            console.log(`[Viewer] touchmove - touches: ${e.touches.length}, defaultPrevented: ${e.defaultPrevented}, scrollTop: ${this.elements.viewer.scrollTop}`);
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
     * Charger un PDF
     */
    async loadPDF(url) {
        this.showLoading(true);

        try {
            // Charger avec PDF.js
            const loadingTask = pdfjsLib.getDocument(url);
            this.pdf = await loadingTask.promise;
            this.totalPages = this.pdf.numPages;

            // Initialiser l'ordre des pages
            this.pageOrder = Array.from({length: this.totalPages}, (_, i) => i + 1);

            // Initialiser les pages
            for (let i = 1; i <= this.totalPages; i++) {
                this.pages.set(i, {type: 'pdf', pageNum: i});
            }

            // Rendre les miniatures et les pages
            await this.renderThumbnails();
            await this.renderPages();

            // Aller à la première page
            this.goToPage(1);

        } catch (error) {
            console.error('Erreur chargement PDF:', error);
            alert('Erreur lors du chargement du PDF');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Rendre les miniatures
     */
    async renderThumbnails() {
        this.elements.thumbnailsContainer.innerHTML = '';

        for (const pageId of this.pageOrder) {
            const thumbnailItem = await this.createThumbnail(pageId);
            this.elements.thumbnailsContainer.appendChild(thumbnailItem);
        }
    }

    /**
     * Créer une miniature
     */
    async createThumbnail(pageId) {
        const div = document.createElement('div');
        div.className = 'thumbnail-wrapper';

        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item';
        thumb.dataset.pageId = pageId;

        const canvas = document.createElement('canvas');
        canvas.className = 'thumbnail-canvas';

        const numberLabel = document.createElement('div');
        numberLabel.className = 'thumbnail-number';
        numberLabel.textContent = pageId;

        thumb.appendChild(canvas);
        thumb.appendChild(numberLabel);

        // Clic sur miniature = navigation
        thumb.addEventListener('click', () => this.goToPage(pageId));

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
        const page = await this.pdf.getPage(pageNum);
        const viewport = page.getViewport({scale: 0.2});

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;
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
            await this.renderPDFPage(pdfCanvas, annotationCanvas, pageData.pageNum);
        } else if (pageData && pageData.type === 'blank') {
            this.renderBlankPage(pdfCanvas, annotationCanvas);
        } else if (pageData && pageData.type === 'graph') {
            this.renderGraphPage(pdfCanvas, annotationCanvas, pageData.data);
        }

        // Configurer les événements d'annotation
        this.setupAnnotationEvents(annotationCanvas, pageId);

        return wrapper;
    }

    /**
     * Rendre une page PDF sur canvas
     */
    async renderPDFPage(pdfCanvas, annotationCanvas, pageNum) {
        const page = await this.pdf.getPage(pageNum);

        // Calculer le scale pour occuper 95% de la largeur du viewer
        const viewerWidth = this.elements.viewer.clientWidth;
        const targetWidth = viewerWidth * 0.95;
        const baseViewport = page.getViewport({scale: 1});
        const calculatedScale = targetWidth / baseViewport.width;

        // Utiliser le scale calculé ou le scale actuel (pour le zoom)
        const scale = this.scale === 1.0 ? calculatedScale : this.scale;
        const viewport = page.getViewport({scale: scale});

        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        annotationCanvas.width = viewport.width;
        annotationCanvas.height = viewport.height;

        const ctx = pdfCanvas.getContext('2d');
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        // Redessiner les annotations existantes
        this.redrawAnnotations(annotationCanvas, pageNum);
    }

    /**
     * Rendre une page vierge
     */
    renderBlankPage(pdfCanvas, annotationCanvas) {
        // Page A4 : 210mm × 297mm à 96 DPI = 794 × 1123 pixels
        const width = 794;
        const height = 1123;

        pdfCanvas.width = width;
        pdfCanvas.height = height;
        annotationCanvas.width = width;
        annotationCanvas.height = height;

        const ctx = pdfCanvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
    }

    /**
     * Rendre une page graphique
     */
    renderGraphPage(pdfCanvas, annotationCanvas, graphData = {}) {
        const width = 794;
        const height = 1123;

        pdfCanvas.width = width;
        pdfCanvas.height = height;
        annotationCanvas.width = width;
        annotationCanvas.height = height;

        const ctx = pdfCanvas.getContext('2d');

        // Fond blanc
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Dessiner les axes
        const xMin = graphData.xMin || -15;
        const xMax = graphData.xMax || 15;
        const yMin = graphData.yMin || -15;
        const yMax = graphData.yMax || 15;

        this.drawGraphAxes(ctx, width, height, xMin, xMax, yMin, yMax);
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
     * Configurer les événements d'annotation sur un canvas
     */
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
     */
    getCanvasAtPoint(clientX, clientY) {
        // Parcourir tous les canvas pour trouver celui sous le pointeur
        const allCanvas = this.container.querySelectorAll('.annotation-canvas');
        for (const canvas of allCanvas) {
            const rect = canvas.getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right &&
                clientY >= rect.top && clientY <= rect.bottom) {
                return canvas;
            }
        }
        return null;
    }

    /**
     * Démarrer une annotation
     */
    startAnnotation(e, canvas, pageId) {
        this.isDrawing = true;
        this.currentCanvas = canvas;
        this.currentPageId = pageId;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

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
            this.toggleGridOnPage(canvas, pageId);
            this.isDrawing = false;
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
        // Vérifier si la grille existe déjà
        if (!this.pageGrids) {
            this.pageGrids = new Map();
        }

        const hasGrid = this.pageGrids.get(pageId);

        if (hasGrid) {
            // Supprimer la grille
            this.pageGrids.set(pageId, false);
            // Supprimer l'annotation grille
            const pageAnnotations = this.annotations.get(pageId) || [];
            const filteredAnnotations = pageAnnotations.filter(a => a.tool !== 'grid');
            this.annotations.set(pageId, filteredAnnotations);
        } else {
            // Ajouter la grille
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
        }

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

        // Validation: rejeter les points hors du canvas
        if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) {
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
                }, 500);
            }

            this.currentStroke.points.push({x, y, pressure: e.pressure || 0.5});
            this.drawAnglePreview(canvas, pageId);
            return;
        }

        // Gérer l'outil arc
        if (this.currentTool === 'arc' && this.arcState) {
            const now = Date.now();
            const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
            const distance = Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2);

            // Marge de 5 pixels pour considérer qu'on ne bouge pas
            if (distance > 5) {
                this.arcState.lastMoveTime = now;
                if (this.arcState.validationTimer) {
                    clearTimeout(this.arcState.validationTimer);
                    this.arcState.validationTimer = null;
                }
            } else if (!this.arcState.validationTimer && this.arcState.step === 1) {
                // Commencer le timer de validation si immobile
                this.arcState.validationTimer = setTimeout(() => {
                    this.validateArcFirstSegment(canvas, pageId);
                }, 500);
            }

            this.currentStroke.points.push({x, y, pressure: e.pressure || 0.5});
            this.drawArcPreview(canvas, pageId);
            return;
        }

        this.currentStroke.points.push({x, y, pressure: e.pressure || 0.5});

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

            // Montrer le rayon
            const radius = Math.sqrt(
                (currentPoint.x - startPoint.x) ** 2 +
                (currentPoint.y - startPoint.y) ** 2
            );
            ctx.fillStyle = this.currentColor;
            ctx.font = '12px Arial';
            ctx.fillText(`r=${radius.toFixed(0)}px`,
                (startPoint.x + currentPoint.x) / 2,
                (startPoint.y + currentPoint.y) / 2 - 10);
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
            const endAngle = Math.atan2(
                currentPoint.y - startPoint.y,
                currentPoint.x - startPoint.x
            );

            // Dessiner l'arc
            let angleDiff = endAngle - startAngle;
            if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, radius, startAngle, endAngle, angleDiff < 0);
            ctx.stroke();

            // Dessiner les rayons en pointillé
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(this.arcState.firstSegmentEnd.x, this.arcState.firstSegmentEnd.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            const endOnArc = {
                x: startPoint.x + radius * Math.cos(endAngle),
                y: startPoint.y + radius * Math.sin(endAngle)
            };
            ctx.lineTo(endOnArc.x, endOnArc.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    /**
     * Terminer une annotation
     */
    endAnnotation(e, canvas, pageId) {
        this.isDrawing = false;
        this.currentCanvas = null;
        this.currentPageId = null;

        // Gérer la gomme - pas d'annotation à sauvegarder
        if (this.currentTool === 'eraser') {
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
                    opacity: this.currentOpacity,
                    points: [
                        this.arcState.startPoint,
                        this.arcState.firstSegmentEnd,
                        this.currentStroke.points[this.currentStroke.points.length - 1]
                    ]
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
        console.log(`[Redraw] Page ${pageId} - ${pageAnnotations.length} annotations à dessiner`);

        for (const annotation of pageAnnotations) {
            this.drawAnnotation(ctx, annotation);
        }
    }

    /**
     * Dessiner une annotation
     */
    drawAnnotation(ctx, annotation) {
        if (!annotation || !annotation.points || annotation.points.length === 0) return;

        const options = {
            color: annotation.color,
            size: annotation.size,
            opacity: annotation.opacity
        };

        if (this.annotationTools) {
            switch (annotation.tool) {
                case 'pen':
                case 'highlighter':
                    this.annotationTools.drawWithPerfectFreehand(ctx, annotation.points, options);
                    break;

                case 'ruler':
                    if (annotation.points.length >= 2) {
                        const start = annotation.points[0];
                        const end = annotation.points[annotation.points.length - 1];
                        this.annotationTools.drawRuler(ctx, start, end, options);
                    }
                    break;

                case 'compass':
                    if (annotation.points.length >= 2) {
                        const center = annotation.points[0];
                        const edge = annotation.points[annotation.points.length - 1];
                        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
                        this.annotationTools.drawCompass(ctx, center, radius, options);
                    }
                    break;

                case 'angle':
                    if (annotation.points.length >= 3) {
                        const center = annotation.points[0];
                        const point1 = annotation.points[1];
                        const point2 = annotation.points[annotation.points.length - 1];
                        this.annotationTools.drawAngle(ctx, center, point1, point2, options);
                    }
                    break;

                case 'arc':
                    if (annotation.points.length >= 3) {
                        const center = annotation.points[0];
                        const start = annotation.points[1];
                        const end = annotation.points[annotation.points.length - 1];
                        const radius = Math.sqrt((start.x - center.x) ** 2 + (start.y - center.y) ** 2);
                        const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
                        const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
                        this.annotationTools.drawArc(ctx, center, radius, startAngle, endAngle, options);
                    }
                    break;

                case 'arrow':
                    if (annotation.points.length >= 2) {
                        const start = annotation.points[0];
                        const end = annotation.points[annotation.points.length - 1];
                        this.annotationTools.drawArrow(ctx, start, end, options);
                    }
                    break;

                case 'rectangle':
                    if (annotation.points.length >= 2) {
                        const start = annotation.points[0];
                        const end = annotation.points[annotation.points.length - 1];
                        this.annotationTools.drawRectangle(ctx, start, end, options);
                    }
                    break;

                case 'disk':
                    if (annotation.points.length >= 2) {
                        const center = annotation.points[0];
                        const edge = annotation.points[annotation.points.length - 1];
                        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
                        this.annotationTools.drawDisk(ctx, center, radius, options);
                    }
                    break;

                case 'grid':
                    if (annotation.canvasWidth && annotation.canvasHeight) {
                        this.annotationTools.drawGrid(ctx, annotation.canvasWidth, annotation.canvasHeight);
                    }
                    break;

                default:
                    this.annotationTools.drawSimple(ctx, annotation.points, options);
            }
        } else {
            // Fallback
            ctx.strokeStyle = annotation.color;
            ctx.lineWidth = annotation.size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = annotation.opacity;

            ctx.beginPath();
            ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
            for (let i = 1; i < annotation.points.length; i++) {
                ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    /**
     * Ajouter une annotation à l'historique
     */
    addAnnotationToHistory(pageId, annotation) {
        console.log('[History] ADD AVANT - historyIndex:', this.historyIndex, 'historyLength:', this.annotationHistory.length, 'tool:', annotation.tool);

        // Tronquer l'historique si on est au milieu (cela invalide le redo)
        if (this.historyIndex < this.annotationHistory.length - 1) {
            console.log('[History] Troncature - suppression de', this.annotationHistory.length - this.historyIndex - 1, 'entrées');
            this.annotationHistory = this.annotationHistory.slice(0, this.historyIndex + 1);
            // Reconstruire les annotations depuis l'historique pour être cohérent
            this.rebuildAnnotationsFromHistory();
        }

        // Ajouter un ID unique à l'annotation pour la traçabilité
        annotation.id = Date.now() + '_' + Math.random();

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
            const pageId = parseInt(pageIdStr); // Normaliser en nombre
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
     * Changer d'outil
     */
    setTool(tool) {
        this.currentTool = tool;

        // Mettre à jour l'UI
        this.container.querySelectorAll('.btn-tool').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
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
            // Toggle la grille sur la page actuelle immédiatement
            this.toggleGridOnCurrentPage();
            // Revenir au stylo
            this.setTool('pen');
            return;
        } else {
            this.currentOpacity = 1.0;
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
        }

        // Afficher le modal
        modal.style.display = 'flex';

        // Stocker la référence pour fermeture
        window.cleanPDFViewer = this;
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
        // TODO: Détecter quelle page est la plus visible
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
            <button class="add-graph" style="display: block; width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer;">
                📊 Page graphique
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
     * Effectuer l'envoi aux élèves
     */
    async performSendToStudents(selectedStudents) {
        this.showLoading(true);

        try {
            // Générer le PDF avec annotations
            const pdfBlob = await this.exportPDFWithAnnotations();

            // Préparer les données
            const formData = new FormData();
            formData.append('pdf_file', pdfBlob, this.options.fileName || 'document_annote.pdf');
            formData.append('action', 'send_to_students');
            formData.append('send_mode', 'selected');
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
                alert(`Document envoyé avec succès à ${result.shares_created} élève(s)`);
            } else {
                alert('Erreur: ' + (result.message || 'Erreur inconnue'));
            }

        } catch (error) {
            console.error('Erreur lors de l\'envoi:', error);
            alert('Erreur lors de l\'envoi du document');
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
        if (!this.options.fileId) {
            console.log('[Load] Pas de fileId, chargement ignoré');
            return;
        }

        try {
            console.log('[Load] Chargement des annotations pour fileId:', this.options.fileId);
            const response = await fetch(`/file_manager/api/load-annotations/${this.options.fileId}`);

            if (response.ok) {
                const data = await response.json();
                console.log('[Load] Données reçues:', data);

                if (data.success && data.annotations) {
                    // Charger les annotations par page
                    const annotationsData = data.annotations;

                    // Vider les annotations actuelles
                    this.annotations.clear();
                    this.annotationHistory = [];
                    this.historyIndex = -1;

                    // Reconstruire les annotations et l'historique
                    for (const [pageIdStr, pageAnnotations] of Object.entries(annotationsData)) {
                        const pageId = parseInt(pageIdStr);

                        if (!this.annotations.has(pageId)) {
                            this.annotations.set(pageId, []);
                        }

                        // Ajouter chaque annotation à la page ET à l'historique
                        for (const annotation of pageAnnotations) {
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
        if (!this.options.fileId) {
            console.log('[Save] Pas de fileId, sauvegarde ignorée');
            return;
        }

        if (!this.isDirty) {
            console.log('[Save] Pas de modifications, sauvegarde ignorée');
            return;
        }

        try {
            // Préparer les données
            const annotationsData = {};
            this.annotations.forEach((annotations, pageId) => {
                // Filtrer les grilles qui ne doivent pas être sauvegardées
                const annotationsToSave = annotations.filter(a => a.tool !== 'grid');
                if (annotationsToSave.length > 0) {
                    annotationsData[pageId] = annotationsToSave;
                }
            });

            console.log('[Save] Sauvegarde de', Object.keys(annotationsData).length, 'pages avec annotations');

            const response = await fetch('/file_manager/api/save-annotations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    file_id: this.options.fileId,
                    annotations: annotationsData
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
     * Sauvegarder les annotations de manière SYNCHRONE
     * Utilisé pour beforeunload/pagehide/visibilitychange
     */
    saveAnnotationsSync() {
        if (!this.options.fileId || !this.isDirty) {
            return;
        }

        try {
            // Préparer les données
            const annotationsData = {};
            this.annotations.forEach((annotations, pageId) => {
                const annotationsToSave = annotations.filter(a => a.tool !== 'grid');
                if (annotationsToSave.length > 0) {
                    annotationsData[pageId] = annotationsToSave;
                }
            });

            console.log('[SaveSync] Sauvegarde synchrone de', Object.keys(annotationsData).length, 'pages');

            const data = JSON.stringify({
                file_id: this.options.fileId,
                annotations: annotationsData
            });

            // XMLHttpRequest synchrone (déprécié mais nécessaire pour beforeunload)
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/file_manager/api/save-annotations', false); // false = synchrone
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(data);

            if (xhr.status === 200) {
                console.log('[SaveSync] Sauvegarde synchrone réussie');
                this.isDirty = false;
            } else {
                console.error('[SaveSync] Erreur HTTP:', xhr.status);
            }
        } catch (error) {
            console.error('[SaveSync] Erreur:', error);
        }
    }

    /**
     * Démarrer l'auto-save
     */
    startAutoSave() {
        this.autoSaveTimer = setInterval(() => {
            if (this.isDirty) {
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
    }

    /**
     * Fermer le viewer
     */
    async close() {
        console.log('[Close] Fermeture du viewer PDF...');

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

        // Restaurer l'overflow original du body
        if (this.originalBodyOverflow !== undefined) {
            document.body.style.overflow = this.originalBodyOverflow;
            console.log('[PDF Viewer] Body overflow restauré à:', this.originalBodyOverflow || 'vide');
        }

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
}

// Export global
if (typeof window !== 'undefined') {
    window.CleanPDFViewer = CleanPDFViewer;
}
