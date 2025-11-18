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

        // Initialiser
        this.init();
    }

    /**
     * Initialisation du viewer
     */
    async init() {
        // Créer l'interface
        this.createUI();

        // Charger le PDF si URL fournie
        if (this.options.pdfUrl) {
            await this.loadPDF(this.options.pdfUrl);
        }

        // Charger les annotations sauvegardées
        if (this.options.fileId) {
            await this.loadAnnotations();
        }

        // Démarrer l'auto-save
        this.startAutoSave();
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
                        <input type="color" id="color-picker" value="#000000" title="Couleur">
                        <input type="range" id="size-slider" min="1" max="20" value="2" title="Taille">
                        <span id="size-value">2</span>
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
            sizeSlider: this.container.querySelector('#size-slider'),
            sizeValue: this.container.querySelector('#size-value'),
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
                width: 100%;
                height: 100vh;
                display: flex;
                flex-direction: column;
                background: #f5f5f5;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

            #color-picker {
                width: 40px;
                height: 40px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                cursor: pointer;
            }

            #size-slider {
                width: 100px;
            }

            #size-value {
                min-width: 30px;
                text-align: center;
                font-weight: 500;
            }

            /* Main area */
            .pdf-main {
                display: flex;
                flex: 1;
                overflow: hidden;
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
                overflow: auto;
                padding: 16px;
                /* Scroll tactile smooth */
                -webkit-overflow-scrolling: touch;
                overscroll-behavior: contain;
            }

            .pdf-pages-container {
                max-width: 900px;
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
                /* Permet le dessin avec stylet, scroll avec doigt */
                touch-action: pan-x pan-y pinch-zoom;
                pointer-events: auto;
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

        // Couleur et taille
        this.elements.colorPicker.addEventListener('change', (e) => {
            this.currentColor = e.target.value;
        });

        this.elements.sizeSlider.addEventListener('input', (e) => {
            this.currentSize = parseInt(e.target.value);
            this.elements.sizeValue.textContent = this.currentSize;
        });

        // Actions
        this.elements.btnUndo.addEventListener('click', () => this.undo());
        this.elements.btnRedo.addEventListener('click', () => this.redo());
        this.elements.btnClearPage.addEventListener('click', () => this.clearCurrentPage());
        this.elements.btnDownload.addEventListener('click', () => this.showDownloadMenu());
        this.elements.btnClose.addEventListener('click', () => this.close());

        // Scroll viewer pour détecter la page actuelle
        this.elements.viewer.addEventListener('scroll', () => this.updateCurrentPageFromScroll());
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
        const viewport = page.getViewport({scale: this.scale});

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
        // Pointer events pour détecter stylet vs doigt
        canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e, canvas, pageId));
        canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e, canvas, pageId));
        canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e, canvas, pageId));
        canvas.addEventListener('pointercancel', (e) => this.handlePointerCancel(e, canvas, pageId));
    }

    /**
     * Gestion pointerdown
     */
    handlePointerDown(e, canvas, pageId) {
        this.lastPointerType = e.pointerType;

        // Doigt = scroll/zoom, ignorer pour annotation
        if (e.pointerType === 'touch') {
            return;
        }

        // Stylet ou souris = annotation
        if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
            e.preventDefault();
            this.startAnnotation(e, canvas, pageId);
        }
    }

    /**
     * Gestion pointermove
     */
    handlePointerMove(e, canvas, pageId) {
        if (!this.isDrawing) return;
        if (e.pointerType === 'touch') return;

        e.preventDefault();
        this.continueAnnotation(e, canvas, pageId);
    }

    /**
     * Gestion pointerup
     */
    handlePointerUp(e, canvas, pageId) {
        if (!this.isDrawing) return;
        if (e.pointerType === 'touch') return;

        e.preventDefault();
        this.endAnnotation(e, canvas, pageId);
    }

    /**
     * Gestion pointercancel
     */
    handlePointerCancel(e, canvas, pageId) {
        if (!this.isDrawing) return;
        this.cancelAnnotation();
    }

    /**
     * Démarrer une annotation
     */
    startAnnotation(e, canvas, pageId) {
        this.isDrawing = true;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Initialiser selon l'outil
        this.currentStroke = {
            tool: this.currentTool,
            color: this.currentColor,
            size: this.currentSize,
            opacity: this.currentOpacity,
            points: [{x, y, pressure: e.pressure || 0.5}],
            startTime: Date.now(),
            pageId: pageId
        };

        // TODO: Logique spécifique selon l'outil
    }

    /**
     * Continuer une annotation
     */
    continueAnnotation(e, canvas, pageId) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.currentStroke.points.push({x, y, pressure: e.pressure || 0.5});

        // Redessiner le preview
        this.drawStrokePreview(canvas, this.currentStroke);
    }

    /**
     * Terminer une annotation
     */
    endAnnotation(e, canvas, pageId) {
        this.isDrawing = false;

        // Sauvegarder l'annotation
        this.addAnnotationToHistory(pageId, this.currentStroke);

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
    drawStrokePreview(canvas, stroke) {
        // TODO: Utiliser perfect-freehand pour le rendu
        const ctx = canvas.getContext('2d');

        // Pour l'instant, dessin simple
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = stroke.opacity;

        ctx.beginPath();
        if (stroke.points.length > 0) {
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;
    }

    /**
     * Redessiner toutes les annotations d'une page
     */
    redrawAnnotations(canvas, pageId) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const pageAnnotations = this.annotations.get(pageId) || [];
        for (const annotation of pageAnnotations) {
            this.drawAnnotation(ctx, annotation);
        }
    }

    /**
     * Dessiner une annotation
     */
    drawAnnotation(ctx, annotation) {
        // TODO: Rendu selon le type d'outil avec perfect-freehand
        this.drawStrokePreview({getContext: () => ctx}, annotation);
    }

    /**
     * Ajouter une annotation à l'historique
     */
    addAnnotationToHistory(pageId, annotation) {
        // Tronquer l'historique si on est au milieu
        if (this.historyIndex < this.annotationHistory.length - 1) {
            this.annotationHistory = this.annotationHistory.slice(0, this.historyIndex + 1);
        }

        // Ajouter
        this.annotationHistory.push({
            action: 'add',
            pageId: pageId,
            annotation: {...annotation}
        });

        this.historyIndex++;

        // Mettre à jour les annotations de la page
        if (!this.annotations.has(pageId)) {
            this.annotations.set(pageId, []);
        }
        this.annotations.get(pageId).push(annotation);

        this.updateUndoRedoButtons();
    }

    /**
     * Undo
     */
    undo() {
        if (this.historyIndex < 0) return;

        const entry = this.annotationHistory[this.historyIndex];

        if (entry.action === 'add') {
            // Retirer l'annotation
            const pageAnnotations = this.annotations.get(entry.pageId);
            if (pageAnnotations) {
                const index = pageAnnotations.indexOf(entry.annotation);
                if (index > -1) {
                    pageAnnotations.splice(index, 1);
                }
            }
        }

        this.historyIndex--;
        this.redrawAllPages();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Redo
     */
    redo() {
        if (this.historyIndex >= this.annotationHistory.length - 1) return;

        this.historyIndex++;
        const entry = this.annotationHistory[this.historyIndex];

        if (entry.action === 'add') {
            // Rajouter l'annotation
            if (!this.annotations.has(entry.pageId)) {
                this.annotations.set(entry.pageId, []);
            }
            this.annotations.get(entry.pageId).push(entry.annotation);
        }

        this.redrawAllPages();
        this.updateUndoRedoButtons();
        this.isDirty = true;
    }

    /**
     * Mettre à jour les boutons undo/redo
     */
    updateUndoRedoButtons() {
        this.elements.btnUndo.disabled = this.historyIndex < 0;
        this.elements.btnRedo.disabled = this.historyIndex >= this.annotationHistory.length - 1;
    }

    /**
     * Redessiner toutes les pages
     */
    redrawAllPages() {
        const canvases = this.container.querySelectorAll('.annotation-canvas');
        canvases.forEach(canvas => {
            const pageId = canvas.closest('.pdf-page-wrapper').dataset.pageId;
            this.redrawAnnotations(canvas, pageId);
        });
    }

    /**
     * Effacer la page actuelle
     */
    clearCurrentPage() {
        if (!confirm('Effacer toutes les annotations de cette page ?')) return;

        const pageAnnotations = this.annotations.get(this.currentPage);
        if (pageAnnotations && pageAnnotations.length > 0) {
            this.annotations.set(this.currentPage, []);
            this.redrawAllPages();
            this.isDirty = true;
        }
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
        } else {
            this.currentOpacity = 1.0;
        }
    }

    /**
     * Naviguer vers une page
     */
    goToPage(pageId) {
        this.currentPage = pageId;

        // Scroller vers la page
        const wrapper = this.container.querySelector(`[data-page-id="${pageId}"]`);
        if (wrapper) {
            wrapper.scrollIntoView({behavior: 'smooth', block: 'start'});
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
        // TODO: Menu avec options
        alert('Téléchargement - à implémenter');
    }

    /**
     * Charger les annotations
     */
    async loadAnnotations() {
        if (!this.options.fileId) return;

        try {
            const response = await fetch(`/get_annotations/${this.options.fileId}`);
            if (response.ok) {
                const data = await response.json();
                // TODO: Charger les annotations
            }
        } catch (error) {
            console.error('Erreur chargement annotations:', error);
        }
    }

    /**
     * Sauvegarder les annotations
     */
    async saveAnnotations() {
        if (!this.isDirty || !this.options.fileId) return;

        try {
            // Préparer les données
            const annotationsData = {};
            this.annotations.forEach((annotations, pageId) => {
                annotationsData[pageId] = annotations;
            });

            const response = await fetch('/save_annotations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    file_id: this.options.fileId,
                    annotations: annotationsData
                })
            });

            if (response.ok) {
                this.isDirty = false;
            }
        } catch (error) {
            console.error('Erreur sauvegarde:', error);
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
     * Afficher/masquer le loading
     */
    showLoading(show) {
        this.elements.loading.style.display = show ? 'flex' : 'none';
    }

    /**
     * Fermer le viewer
     */
    async close() {
        // Sauvegarder avant de fermer
        if (this.isDirty) {
            await this.saveAnnotations();
        }

        // Nettoyer
        this.stopAutoSave();
        this.container.innerHTML = '';
        this.container.style.display = 'none';

        // Callback
        if (this.options.onClose) {
            this.options.onClose();
        }
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.CleanPDFViewer = CleanPDFViewer;
}
