/**
 * PDFViewer - Composant réutilisable pour l'affichage et l'annotation de PDF
 * Version: 1.0.0
 * Auteur: ProfCalendar
 */

class PDFViewer {
    constructor(containerId, options = {}) {
        // Configuration par défaut
        this.options = {
            enableAnnotations: true,
            showThumbnails: true,
            showPageNumbers: true,
            scale: 1.0,
            annotationTools: ['pen', 'highlighter', 'eraser'],
            saveAnnotationsUrl: '/file-manager/api/save-annotations',
            loadAnnotationsUrl: '/file-manager/api/annotations',
            defaultColors: ['#000000', '#EF4444', '#F59E0B', '#EAB308', '#22C55E', '#3B82F6'],
            autoSave: true,
            saveDelay: 2000,
            debug: false,
            ...options
        };

        // Conteneur principal
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container avec l'ID "${containerId}" non trouvé`);
        }

        // Variables d'état PDF
        this.pdfDocument = null;
        this.currentPageNum = 1;
        this.currentScale = this.options.scale;
        this.isLoading = false;
        this.currentFileId = null;
        this.isScrolling = false;

        // Variables d'annotation
        this.annotations = [];
        this.annotationsByPage = {};
        this.undoHistory = [];
        this.undoHistoryByPage = {};
        this.currentStroke = [];
        this.isDrawing = false;
        this.lastPoint = null;

        // Outils d'annotation
        this.currentTool = 'pen';
        this.currentColor = '#000000';
        this.currentLineWidth = 3;

        // Variables de sauvegarde
        this.saveTimeout = null;
        this.hasUnsavedChanges = false;

        // Callbacks d'événements
        this.eventCallbacks = {};

        // Initialiser le composant
        this.init();
    }

    /**
     * Initialisation du composant
     */
    async init() {
        this.log('📱 Initialisation du PDFViewer...');
        
        // Charger PDF.js si nécessaire
        await this.loadPDFJS();
        
        // Créer la structure HTML
        this.createHTML();
        
        // Initialiser les événements
        this.setupEvents();
        
        this.log('✅ PDFViewer initialisé avec succès');
        this.emit('ready');
    }

    /**
     * Charger PDF.js de manière asynchrone
     */
    async loadPDFJS() {
        if (typeof pdfjsLib !== 'undefined') {
            this.log('📚 PDF.js déjà chargé');
            return;
        }

        this.log('📚 Chargement de PDF.js...');
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                this.log('✅ PDF.js chargé et configuré');
                resolve();
            };
            script.onerror = () => {
                this.log('❌ Erreur lors du chargement de PDF.js');
                reject(new Error('Impossible de charger PDF.js'));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Créer la structure HTML du viewer
     */
    createHTML() {
        const html = `
            <div class="pdf-viewer-wrapper">
                ${this.options.enableAnnotations ? this.createToolbarHTML() : ''}
                
                <div class="pdf-viewer-main">
                    ${this.options.showThumbnails ? this.createThumbnailsHTML() : ''}
                    
                    <div class="pdf-viewer-content">
                        <div class="pdf-viewer-container" id="${this.containerId}-container">
                            <div class="pdf-pages-container" id="${this.containerId}-pages">
                                <!-- Les pages PDF seront ajoutées ici -->
                            </div>
                        </div>
                    </div>
                </div>
                
                ${this.options.enableAnnotations ? this.createFooterHTML() : ''}
            </div>
        `;
        
        this.container.innerHTML = html;
        
        // Référencer les éléments importants
        this.pagesContainer = document.getElementById(`${this.containerId}-pages`);
        this.viewerContainer = document.getElementById(`${this.containerId}-container`);
        this.thumbnailsContainer = document.getElementById(`${this.containerId}-thumbnails`);
        
        // Rendre le conteneur focusable pour la navigation clavier
        if (this.viewerContainer) {
            this.viewerContainer.tabIndex = 0;
        }
        
        // Log pour debug
        this.log(`🔍 Container elements found: pages=${!!this.pagesContainer}, viewer=${!!this.viewerContainer}, thumbnails=${!!this.thumbnailsContainer}`);
    }

    /**
     * Créer la barre d'outils
     */
    createToolbarHTML() {
        const toolsHTML = this.options.annotationTools.map(tool => {
            const icons = {
                pen: 'fas fa-pen',
                highlighter: 'fas fa-highlighter',
                eraser: 'fas fa-eraser'
            };
            const titles = {
                pen: 'Stylo',
                highlighter: 'Surligneur',
                eraser: 'Gomme'
            };
            
            return `
                <button class="pdf-tool-btn ${tool === 'pen' ? 'active' : ''}" 
                        data-tool="${tool}" 
                        title="${titles[tool]}">
                    <i class="${icons[tool]}"></i>
                </button>
            `;
        }).join('');

        const colorsHTML = this.options.defaultColors.map((color, index) => `
            <button class="pdf-color-btn ${index === 0 ? 'active' : ''}" 
                    data-color="${color}" 
                    style="background-color: ${color}" 
                    title="Couleur ${color}">
            </button>
        `).join('');

        return `
            <div class="pdf-viewer-toolbar">
                <div class="pdf-tools-group">
                    ${toolsHTML}
                </div>
                
                <div class="pdf-colors-group">
                    <div class="pdf-preset-colors">
                        ${colorsHTML}
                    </div>
                    <input type="color" 
                           id="${this.containerId}-color-picker" 
                           value="#000000" 
                           title="Couleur personnalisée"
                           class="pdf-custom-color">
                </div>
                
                <div class="pdf-stroke-group">
                    <label for="${this.containerId}-stroke-width">Épaisseur:</label>
                    <input type="range" 
                           id="${this.containerId}-stroke-width" 
                           min="1" 
                           max="20" 
                           value="3"
                           class="pdf-stroke-width">
                    <span id="${this.containerId}-stroke-value">3</span>
                </div>
                
                <div class="pdf-actions-group">
                    <button class="pdf-action-btn" id="${this.containerId}-undo" title="Annuler">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button class="pdf-action-btn" id="${this.containerId}-clear" title="Effacer tout">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Créer le panneau des miniatures
     */
    createThumbnailsHTML() {
        return `
            <div class="pdf-thumbnails-panel">
                <div class="pdf-thumbnails-header">
                    <h4>Pages</h4>
                </div>
                <div class="pdf-thumbnails-container" id="${this.containerId}-thumbnails">
                    <!-- Les miniatures seront ajoutées ici -->
                </div>
            </div>
        `;
    }

    /**
     * Créer le pied de page avec statut de sauvegarde
     */
    createFooterHTML() {
        return `
            <div class="pdf-viewer-footer">
                <div class="pdf-save-status" id="${this.containerId}-save-status">
                    <i class="fas fa-info-circle"></i>
                    <span>Prêt</span>
                </div>
                <div class="pdf-page-navigation">
                    <button class="pdf-nav-btn" id="${this.containerId}-prev-page" title="Page précédente">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <div class="pdf-page-info" id="${this.containerId}-page-info">
                        Page 1 / 1
                    </div>
                    <button class="pdf-nav-btn" id="${this.containerId}-next-page" title="Page suivante">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Configurer les événements
     */
    setupEvents() {
        if (this.options.enableAnnotations) {
            this.setupToolbarEvents();
        }
        
        if (this.options.showThumbnails) {
            this.setupThumbnailEvents();
        }
        
        this.setupScrollEvents();
        this.setupNavigationEvents();
        this.setupKeyboardNavigation();
    }

    /**
     * Configurer les événements de la barre d'outils
     */
    setupToolbarEvents() {
        // Outils
        this.container.querySelectorAll('[data-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setTool(e.target.closest('[data-tool]').dataset.tool);
            });
        });

        // Couleurs
        this.container.querySelectorAll('[data-color]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setColor(e.target.dataset.color);
            });
        });

        // Couleur personnalisée
        const colorPicker = document.getElementById(`${this.containerId}-color-picker`);
        if (colorPicker) {
            colorPicker.addEventListener('change', (e) => {
                this.setColor(e.target.value);
            });
        }

        // Épaisseur du trait
        const strokeWidth = document.getElementById(`${this.containerId}-stroke-width`);
        const strokeValue = document.getElementById(`${this.containerId}-stroke-value`);
        if (strokeWidth && strokeValue) {
            strokeWidth.addEventListener('input', (e) => {
                this.currentLineWidth = parseInt(e.target.value);
                strokeValue.textContent = this.currentLineWidth;
                this.log(`📏 Épaisseur du trait: ${this.currentLineWidth}`);
            });
        }

        // Actions
        const undoBtn = document.getElementById(`${this.containerId}-undo`);
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.undo());
        }

        const clearBtn = document.getElementById(`${this.containerId}-clear`);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAnnotations());
        }
    }

    /**
     * Configurer les événements des miniatures
     */
    setupThumbnailEvents() {
        // Les événements des miniatures seront ajoutés lors de leur création
    }

    /**
     * Configurer les événements de scroll
     */
    setupScrollEvents() {
        if (this.viewerContainer) {
            // Détecter le changement de page lors du scroll
            this.viewerContainer.addEventListener('scroll', () => {
                this.updateCurrentPage();
            });
            
            // Navigation à la molette désactivée temporairement pour éviter les conflits
            // TODO: Réactiver quand le scroll principal sera stable
            /*
            this.viewerContainer.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    return;
                }
                
                const scrollTop = this.viewerContainer.scrollTop;
                const scrollHeight = this.viewerContainer.scrollHeight;
                const clientHeight = this.viewerContainer.clientHeight;
                
                if (e.deltaY > 0 && scrollTop + clientHeight >= scrollHeight - 10) {
                    e.preventDefault();
                    this.goToNextPage();
                }
                else if (e.deltaY < 0 && scrollTop <= 10) {
                    e.preventDefault();
                    this.goToPreviousPage();
                }
            }, { passive: false });
            */
        }
    }

    /**
     * Configurer les événements de navigation
     */
    setupNavigationEvents() {
        // Boutons de navigation
        const prevBtn = document.getElementById(`${this.containerId}-prev-page`);
        const nextBtn = document.getElementById(`${this.containerId}-next-page`);
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.goToPreviousPage());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.goToNextPage());
        }
    }

    /**
     * Configurer la navigation au clavier
     */
    setupKeyboardNavigation() {
        // Écouter les événements clavier sur le conteneur viewer
        if (this.viewerContainer) {
            this.viewerContainer.addEventListener('keydown', (e) => {
                // Ne pas interférer si on est dans un champ de texte
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }
                
                switch(e.key) {
                    case 'ArrowLeft':
                    case 'PageUp':
                        e.preventDefault();
                        this.goToPreviousPage();
                        break;
                    case 'ArrowRight':
                    case 'PageDown':
                        e.preventDefault();
                        this.goToNextPage();
                        break;
                    case 'Home':
                        e.preventDefault();
                        this.scrollToPage(1);
                        break;
                    case 'End':
                        e.preventDefault();
                        if (this.pdfDocument) {
                            this.scrollToPage(this.pdfDocument.numPages);
                        }
                        break;
                }
            });
            
            // Écouter aussi sur le conteneur principal pour capturer plus d'événements
            this.container.addEventListener('keydown', (e) => {
                // Ne pas interférer si on est dans un champ de texte
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }
                
                // Focus le viewer container si une touche de navigation est pressée
                if (['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                    this.viewerContainer.focus();
                }
            });
        }
    }

    /**
     * Charger un PDF
     */
    async loadPDF(fileUrl, fileId = null) {
        this.log(`📄 Chargement du PDF: ${fileUrl}`);
        
        if (this.isLoading) {
            this.log('⚠️ Chargement déjà en cours...');
            return;
        }

        this.isLoading = true;
        this.currentFileId = fileId;
        this.updateSaveStatus('Chargement...', 'loading');
        
        try {
            // Charger les annotations existantes si fileId fourni
            if (fileId && this.options.enableAnnotations) {
                await this.loadAnnotations(fileId);
            }

            // Charger le document PDF
            const loadingTask = pdfjsLib.getDocument({
                url: fileUrl,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true,
                useSystemFonts: true
            });

            this.pdfDocument = await loadingTask.promise;
            this.log(`📄 PDF chargé avec ${this.pdfDocument.numPages} pages`);

            // Nettoyer le conteneur
            this.pagesContainer.innerHTML = '';
            if (this.thumbnailsContainer) {
                this.thumbnailsContainer.innerHTML = '';
            }

            // Rendre toutes les pages
            await this.renderAllPages();

            // Générer les miniatures si activées
            if (this.options.showThumbnails) {
                await this.generateThumbnails();
            }

            // Mettre à jour les informations
            this.updatePageInfo();
            this.updateSaveStatus('Prêt', 'success');

            this.emit('pdfLoaded', {
                numPages: this.pdfDocument.numPages,
                fileId: this.currentFileId
            });

        } catch (error) {
            this.log(`❌ Erreur lors du chargement: ${error.message}`);
            this.updateSaveStatus('Erreur de chargement', 'error');
            this.emit('error', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
        
        // S'assurer que le viewer commence à la page 1
        setTimeout(() => {
            if (this.viewerContainer) {
                this.viewerContainer.scrollTop = 0;
                this.log('📍 Scroll initial positionné à la page 1');
            }
        }, 100);
    }

    /**
     * Rendre toutes les pages du PDF
     */
    async renderAllPages() {
        this.log(`🔄 Rendu de ${this.pdfDocument.numPages} pages...`);
        
        for (let pageNum = 1; pageNum <= this.pdfDocument.numPages; pageNum++) {
            await this.renderPage(pageNum);
        }
        
        // Configurer les annotations pour toutes les pages
        if (this.options.enableAnnotations) {
            this.setupAllPageAnnotations();
        }
        
        this.log('✅ Toutes les pages rendues');
    }

    /**
     * Rendre une page spécifique
     */
    async renderPage(pageNum) {
        try {
            const page = await this.pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.currentScale });

            // Créer le wrapper de la page
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'pdf-page-wrapper';
            pageWrapper.id = `${this.containerId}-page-wrapper-${pageNum}`;

            // Canvas pour le PDF
            const pdfCanvas = document.createElement('canvas');
            pdfCanvas.className = 'pdf-canvas';
            pdfCanvas.id = `${this.containerId}-pdf-canvas-${pageNum}`;
            pdfCanvas.width = viewport.width;
            pdfCanvas.height = viewport.height;

            // Canvas pour les annotations
            const annotationCanvas = document.createElement('canvas');
            annotationCanvas.className = 'pdf-annotation-canvas';
            annotationCanvas.id = `${this.containerId}-annotation-canvas-${pageNum}`;
            annotationCanvas.width = viewport.width;
            annotationCanvas.height = viewport.height;

            // Numéro de page (si activé)
            if (this.options.showPageNumbers) {
                const pageNumber = document.createElement('div');
                pageNumber.className = 'pdf-page-number';
                pageNumber.textContent = `Page ${pageNum}`;
                pageWrapper.appendChild(pageNumber);
            }

            // Assembler la page
            pageWrapper.appendChild(pdfCanvas);
            pageWrapper.appendChild(annotationCanvas);
            this.pagesContainer.appendChild(pageWrapper);

            // Rendre le PDF sur le canvas
            const ctx = pdfCanvas.getContext('2d');
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            this.log(`📄 Page ${pageNum} rendue`);

        } catch (error) {
            this.log(`❌ Erreur lors du rendu de la page ${pageNum}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Générer les miniatures
     */
    async generateThumbnails() {
        if (!this.thumbnailsContainer) return;

        this.log('🖼️ Génération des miniatures...');
        
        for (let pageNum = 1; pageNum <= this.pdfDocument.numPages; pageNum++) {
            await this.createThumbnail(pageNum);
        }
        
        this.log('✅ Miniatures générées');
    }

    /**
     * Créer une miniature pour une page
     */
    async createThumbnail(pageNum) {
        try {
            const page = await this.pdfDocument.getPage(pageNum);
            const thumbnailScale = 0.25;
            const viewport = page.getViewport({ scale: thumbnailScale });

            const thumbnailCanvas = document.createElement('canvas');
            thumbnailCanvas.className = 'pdf-thumbnail-canvas';
            thumbnailCanvas.width = viewport.width;
            thumbnailCanvas.height = viewport.height;

            const ctx = thumbnailCanvas.getContext('2d');
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            // Wrapper pour la miniature
            const thumbnailItem = document.createElement('div');
            thumbnailItem.className = 'pdf-thumbnail-item';
            thumbnailItem.id = `${this.containerId}-thumbnail-${pageNum}`;
            thumbnailItem.appendChild(thumbnailCanvas);

            // Numéro de page
            const pageLabel = document.createElement('div');
            pageLabel.className = 'pdf-thumbnail-label';
            pageLabel.textContent = pageNum;
            thumbnailItem.appendChild(pageLabel);

            // Événement de clic
            thumbnailItem.addEventListener('click', () => {
                this.scrollToPage(pageNum);
            });

            this.thumbnailsContainer.appendChild(thumbnailItem);

        } catch (error) {
            this.log(`❌ Erreur lors de la création de la miniature ${pageNum}: ${error.message}`);
        }
    }

    /**
     * Configurer les annotations pour toutes les pages
     */
    setupAllPageAnnotations() {
        for (let pageNum = 1; pageNum <= this.pdfDocument.numPages; pageNum++) {
            const canvas = document.getElementById(`${this.containerId}-annotation-canvas-${pageNum}`);
            if (canvas) {
                this.setupPageAnnotations(canvas, pageNum);
            }
        }
        
        // Redessiner les annotations existantes
        this.redrawAllAnnotations();
    }

    /**
     * Configurer les annotations pour une page spécifique
     */
    setupPageAnnotations(canvas, pageNum) {
        let isPageDrawing = false;
        let pageCurrentStroke = [];

        const getCanvasCoordinates = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            return {
                x: (clientX - rect.left) * (canvas.width / rect.width),
                y: (clientY - rect.top) * (canvas.height / rect.height)
            };
        };

        const startDrawing = (e) => {
            if (!this.options.enableAnnotations) return;
            
            e.preventDefault();
            isPageDrawing = true;
            this.currentPageNum = pageNum;

            const coords = getCanvasCoordinates(e);
            pageCurrentStroke = [{
                x: coords.x,
                y: coords.y,
                tool: this.currentTool,
                color: this.currentColor,
                lineWidth: this.currentLineWidth
            }];

            const ctx = canvas.getContext('2d');
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = this.currentColor;
            ctx.lineWidth = this.currentLineWidth;

            if (this.currentTool === 'highlighter') {
                ctx.globalAlpha = 0.3;
            } else {
                ctx.globalAlpha = 1.0;
            }

            ctx.beginPath();
            ctx.moveTo(coords.x, coords.y);
        };

        const draw = (e) => {
            if (!isPageDrawing || !this.options.enableAnnotations) return;

            e.preventDefault();
            const coords = getCanvasCoordinates(e);
            
            pageCurrentStroke.push({
                x: coords.x,
                y: coords.y,
                tool: this.currentTool,
                color: this.currentColor,
                lineWidth: this.currentLineWidth
            });

            const ctx = canvas.getContext('2d');
            
            if (this.currentTool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = this.currentLineWidth * 2;
            } else {
                ctx.globalCompositeOperation = 'source-over';
            }

            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
        };

        const stopDrawing = (e) => {
            if (!isPageDrawing || !this.options.enableAnnotations) return;

            isPageDrawing = false;
            
            if (pageCurrentStroke.length > 1) {
                // Ajouter l'annotation à la liste
                if (!this.annotationsByPage[pageNum]) {
                    this.annotationsByPage[pageNum] = [];
                }
                
                this.annotationsByPage[pageNum].push({
                    pageNum: pageNum,
                    stroke: [...pageCurrentStroke],
                    timestamp: Date.now()
                });

                // Marquer comme modifié
                this.hasUnsavedChanges = true;
                
                // Programmer la sauvegarde automatique
                if (this.options.autoSave) {
                    this.scheduleAutoSave();
                }

                this.emit('annotationAdded', {
                    pageNum: pageNum,
                    stroke: pageCurrentStroke
                });
            }

            pageCurrentStroke = [];
        };

        // Événements souris
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Événements tactiles
        canvas.addEventListener('touchstart', startDrawing);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stopDrawing);
    }

    /**
     * Redessiner toutes les annotations
     */
    redrawAllAnnotations() {
        for (let pageNum = 1; pageNum <= this.pdfDocument.numPages; pageNum++) {
            this.redrawPageAnnotations(pageNum);
        }
    }

    /**
     * Redessiner les annotations d'une page
     */
    redrawPageAnnotations(pageNum) {
        const canvas = document.getElementById(`${this.containerId}-annotation-canvas-${pageNum}`);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const pageAnnotations = this.annotationsByPage[pageNum] || [];
        
        pageAnnotations.forEach(annotation => {
            if (annotation.stroke && annotation.stroke.length > 1) {
                ctx.beginPath();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                const firstPoint = annotation.stroke[0];
                ctx.strokeStyle = firstPoint.color;
                ctx.lineWidth = firstPoint.lineWidth;
                
                if (firstPoint.tool === 'highlighter') {
                    ctx.globalAlpha = 0.3;
                } else {
                    ctx.globalAlpha = 1.0;
                }
                
                if (firstPoint.tool === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                }

                ctx.moveTo(firstPoint.x, firstPoint.y);
                
                for (let i = 1; i < annotation.stroke.length; i++) {
                    const point = annotation.stroke[i];
                    ctx.lineTo(point.x, point.y);
                }
                
                ctx.stroke();
            }
        });
    }

    /**
     * Charger les annotations depuis le serveur
     */
    async loadAnnotations(fileId) {
        if (!this.options.enableAnnotations) return;

        try {
            const response = await fetch(`${this.options.loadAnnotationsUrl}/${fileId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.annotations) {
                    // Convertir les annotations au nouveau format
                    this.annotationsByPage = {};
                    
                    data.annotations.forEach(annotation => {
                        const pageNum = annotation.pageNum || 1;
                        if (!this.annotationsByPage[pageNum]) {
                            this.annotationsByPage[pageNum] = [];
                        }
                        this.annotationsByPage[pageNum].push(annotation);
                    });
                    
                    this.log(`📝 ${data.annotations.length} annotations chargées`);
                    
                    // Redessiner après un délai pour s'assurer que les canvas sont prêts
                    setTimeout(() => this.redrawAllAnnotations(), 500);
                }
            }
        } catch (error) {
            this.log(`ℹ️ Aucune annotation existante: ${error.message}`);
            this.annotationsByPage = {};
        }
    }

    /**
     * Sauvegarder les annotations
     */
    async saveAnnotations() {
        if (!this.options.enableAnnotations || !this.currentFileId || !this.hasUnsavedChanges) {
            return;
        }

        try {
            // Convertir les annotations au format serveur
            const annotations = [];
            Object.keys(this.annotationsByPage).forEach(pageNum => {
                this.annotationsByPage[pageNum].forEach(annotation => {
                    annotations.push(annotation);
                });
            });

            const response = await fetch(this.options.saveAnnotationsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_id: this.currentFileId,
                    annotations: annotations
                })
            });

            if (response.ok) {
                this.hasUnsavedChanges = false;
                this.updateSaveStatus('Sauvegardé', 'success');
                this.log('💾 Annotations sauvegardées');
                this.emit('annotationsSaved');
            } else {
                throw new Error('Erreur de sauvegarde');
            }
        } catch (error) {
            this.log(`❌ Erreur lors de la sauvegarde: ${error.message}`);
            this.updateSaveStatus('Erreur de sauvegarde', 'error');
            this.emit('error', error);
        }
    }

    /**
     * Programmer la sauvegarde automatique
     */
    scheduleAutoSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.updateSaveStatus('Modifications non sauvegardées...', 'warning');
        
        this.saveTimeout = setTimeout(() => {
            this.saveAnnotations();
        }, this.options.saveDelay);
    }

    /**
     * Défiler vers une page spécifique - VERSION SIMPLIFIÉE QUI MARCHE
     */
    scrollToPage(pageNum) {
        this.log(`🔄 SIMPLE SCROLL to page ${pageNum}`);
        
        // Indiquer qu'un scrolling programmatique est en cours
        this.isScrolling = true;
        
        const pageWrapper = document.getElementById(`${this.containerId}-page-wrapper-${pageNum}`);
        if (!pageWrapper || !this.viewerContainer) {
            this.log(`❌ Elements not found: pageWrapper=${!!pageWrapper}, container=${!!this.viewerContainer}`);
            this.isScrolling = false;
            return;
        }
        
        // Debug: afficher les éléments trouvés
        this.log(`📦 Found elements - Container: ${this.viewerContainer.id}, Page: ${pageWrapper.id}`);
        this.log(`📊 Container scroll before: ${this.viewerContainer.scrollTop}`);
        
        // MÉTHODE SIMPLE ET DIRECTE
        if (pageNum === 1) {
            // Page 1: aller au début
            this.viewerContainer.scrollTop = 0;
            this.log(`📍 Set scrollTop to 0 for page 1`);
        } else {
            // Autres pages: utiliser offsetTop
            const targetScrollTop = pageWrapper.offsetTop - 50; // 50px de marge
            this.viewerContainer.scrollTop = Math.max(0, targetScrollTop);
            this.log(`📍 Set scrollTop to ${targetScrollTop} for page ${pageNum}`);
        }
        
        // Vérifier le résultat et remettre le flag à false
        setTimeout(() => {
            this.log(`📊 Container scroll after: ${this.viewerContainer.scrollTop}`);
            const pageRect = pageWrapper.getBoundingClientRect();
            const containerRect = this.viewerContainer.getBoundingClientRect();
            this.log(`📐 Page position: ${pageRect.top - containerRect.top}px from container top`);
            
            // Réinitialiser le flag de scrolling programmatique
            this.isScrolling = false;
            this.log(`🔓 Scrolling programmatique terminé`);
        }, 150);
        
        // Mettre à jour l'interface
        this.currentPageNum = pageNum;
        this.updateActiveThumbnail(pageNum);
        this.updatePageInfo();
        this.emit('pageScrolled', { pageNum });
    }

    /**
     * Mettre à jour la page courante en fonction du scroll
     */
    updateCurrentPage() {
        if (!this.viewerContainer || !this.pdfDocument) return;

        const containerRect = this.viewerContainer.getBoundingClientRect();
        const containerTop = containerRect.top;
        const containerHeight = containerRect.height;
        
        // Utiliser le tiers supérieur comme zone de détection
        const detectionZone = containerTop + (containerHeight / 3);

        for (let pageNum = 1; pageNum <= this.pdfDocument.numPages; pageNum++) {
            const pageWrapper = document.getElementById(`${this.containerId}-page-wrapper-${pageNum}`);
            if (pageWrapper) {
                const pageRect = pageWrapper.getBoundingClientRect();
                
                // Une page est considérée comme courante si :
                // 1. Elle chevauche la zone de détection
                // 2. Ou si c'est la dernière page et qu'on a scrollé jusqu'au bout
                const isInDetectionZone = pageRect.top <= detectionZone && pageRect.bottom >= detectionZone;
                const isLastPageAtBottom = pageNum === this.pdfDocument.numPages && 
                                         pageRect.top <= containerTop + containerHeight;
                
                if (isInDetectionZone || isLastPageAtBottom) {
                    if (this.currentPageNum !== pageNum) {
                        this.currentPageNum = pageNum;
                        this.updatePageInfo();
                        this.updateActiveThumbnail(pageNum);
                        this.emit('pageChanged', { pageNum });
                        this.log(`📖 Current page changed to ${pageNum} (user scroll)`);
                    }
                    break;
                }
            }
        }
    }

    /**
     * Mettre à jour la miniature active
     */
    updateActiveThumbnail(pageNum) {
        if (!this.thumbnailsContainer) return;

        // Retirer la classe active de toutes les miniatures
        this.thumbnailsContainer.querySelectorAll('.pdf-thumbnail-item').forEach(item => {
            item.classList.remove('active');
        });

        // Ajouter la classe active à la miniature courante
        const currentThumbnail = document.getElementById(`${this.containerId}-thumbnail-${pageNum}`);
        if (currentThumbnail) {
            currentThumbnail.classList.add('active');
            
            // Faire défiler la miniature active dans la vue si nécessaire
            this.scrollThumbnailIntoView(currentThumbnail);
        }
    }

    /**
     * Faire défiler une miniature dans la vue visible
     */
    scrollThumbnailIntoView(thumbnailElement) {
        if (!thumbnailElement || !this.thumbnailsContainer) return;
        
        const containerRect = this.thumbnailsContainer.getBoundingClientRect();
        const thumbnailRect = thumbnailElement.getBoundingClientRect();
        
        // Vérifier si la miniature est en dehors de la vue
        const isAbove = thumbnailRect.top < containerRect.top;
        const isBelow = thumbnailRect.bottom > containerRect.bottom;
        
        if (isAbove || isBelow) {
            // Calculer la position de scroll pour centrer la miniature
            const scrollTop = this.thumbnailsContainer.scrollTop + 
                             (thumbnailRect.top - containerRect.top) - 
                             (containerRect.height / 2) + 
                             (thumbnailRect.height / 2);
            
            this.log(`📍 Scrolling thumbnail into view`);
            
            try {
                this.thumbnailsContainer.scrollTo({
                    top: Math.max(0, scrollTop),
                    behavior: 'smooth'
                });
            } catch (e) {
                // Fallback
                this.thumbnailsContainer.scrollTop = Math.max(0, scrollTop);
            }
        }
    }

    /**
     * Mettre à jour les informations de page
     */
    updatePageInfo() {
        const pageInfo = document.getElementById(`${this.containerId}-page-info`);
        if (pageInfo && this.pdfDocument) {
            pageInfo.textContent = `Page ${this.currentPageNum} / ${this.pdfDocument.numPages}`;
        }
        
        // Mettre à jour l'état des boutons de navigation
        const prevBtn = document.getElementById(`${this.containerId}-prev-page`);
        const nextBtn = document.getElementById(`${this.containerId}-next-page`);
        
        if (prevBtn) {
            prevBtn.disabled = this.currentPageNum <= 1;
        }
        
        if (nextBtn && this.pdfDocument) {
            nextBtn.disabled = this.currentPageNum >= this.pdfDocument.numPages;
        }
    }

    /**
     * Mettre à jour le statut de sauvegarde
     */
    updateSaveStatus(message, type = 'info') {
        const saveStatus = document.getElementById(`${this.containerId}-save-status`);
        if (saveStatus) {
            const icons = {
                info: 'fas fa-info-circle',
                success: 'fas fa-check-circle',
                warning: 'fas fa-exclamation-triangle',
                error: 'fas fa-times-circle',
                loading: 'fas fa-spinner fa-spin'
            };

            saveStatus.innerHTML = `
                <i class="${icons[type] || icons.info}"></i>
                <span>${message}</span>
            `;
            
            saveStatus.className = `pdf-save-status ${type}`;
        }
    }

    /**
     * Définir l'outil courant
     */
    setTool(tool) {
        this.currentTool = tool;
        
        // Mettre à jour l'interface
        this.container.querySelectorAll('[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        
        this.log(`🔧 Outil sélectionné: ${tool}`);
        this.emit('toolChanged', { tool });
    }

    /**
     * Définir la couleur courante
     */
    setColor(color) {
        this.currentColor = color;
        
        // Mettre à jour l'interface
        this.container.querySelectorAll('[data-color]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === color);
        });
        
        // Mettre à jour le color picker
        const colorPicker = document.getElementById(`${this.containerId}-color-picker`);
        if (colorPicker) {
            colorPicker.value = color;
        }
        
        this.log(`🎨 Couleur sélectionnée: ${color}`);
        this.emit('colorChanged', { color });
    }

    /**
     * Annuler la dernière annotation
     */
    undo() {
        if (this.annotationsByPage[this.currentPageNum] && this.annotationsByPage[this.currentPageNum].length > 0) {
            this.annotationsByPage[this.currentPageNum].pop();
            this.redrawPageAnnotations(this.currentPageNum);
            this.hasUnsavedChanges = true;
            
            if (this.options.autoSave) {
                this.scheduleAutoSave();
            }
            
            this.log('↶ Annotation annulée');
            this.emit('annotationUndone', { pageNum: this.currentPageNum });
        }
    }

    /**
     * Effacer toutes les annotations
     */
    clearAnnotations() {
        if (confirm('Êtes-vous sûr de vouloir effacer toutes les annotations ?')) {
            this.annotationsByPage = {};
            this.redrawAllAnnotations();
            this.hasUnsavedChanges = true;
            
            if (this.options.autoSave) {
                this.scheduleAutoSave();
            }
            
            this.log('🗑️ Toutes les annotations effacées');
            this.emit('annotationsCleared');
        }
    }

    /**
     * Aller à la page suivante
     */
    goToNextPage() {
        if (this.pdfDocument && this.currentPageNum < this.pdfDocument.numPages) {
            this.log(`➡️ Going to next page: ${this.currentPageNum + 1}`);
            this.scrollToPage(this.currentPageNum + 1);
        } else {
            this.log(`⚠️ Already at last page (${this.currentPageNum})`);
        }
    }

    /**
     * Aller à la page précédente
     */
    goToPreviousPage() {
        if (this.currentPageNum > 1) {
            this.log(`⬅️ Going to previous page: ${this.currentPageNum - 1}`);
            this.scrollToPage(this.currentPageNum - 1);
        } else {
            this.log(`⚠️ Already at first page (${this.currentPageNum})`);
        }
    }

    /**
     * Ajouter un outil personnalisé
     */
    addTool(toolName, toolConfig) {
        // Ajouter le nouvel outil à la liste
        if (!this.options.annotationTools.includes(toolName)) {
            this.options.annotationTools.push(toolName);
        }
        
        // Recréer la barre d'outils
        this.createHTML();
        this.setupEvents();
        
        this.log(`🔧 Outil "${toolName}" ajouté`);
        this.emit('toolAdded', { toolName, toolConfig });
    }

    /**
     * Événements personnalisés
     */
    on(event, callback) {
        if (!this.eventCallbacks[event]) {
            this.eventCallbacks[event] = [];
        }
        this.eventCallbacks[event].push(callback);
    }

    emit(event, data = {}) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(callback => {
                callback(data);
            });
        }
    }

    /**
     * Nettoyage et destruction
     */
    destroy() {
        // Sauvegarder avant destruction
        if (this.hasUnsavedChanges) {
            this.saveAnnotations();
        }
        
        // Nettoyer les timeouts
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        // Nettoyer le DOM
        this.container.innerHTML = '';
        
        this.log('💥 PDFViewer détruit');
        this.emit('destroyed');
    }

    /**
     * Fonction de log conditionnelle
     */
    log(message) {
        if (this.options.debug) {
            console.log(`[PDFViewer-${this.containerId}] ${message}`);
        }
    }

    /**
     * Méthode de debug pour diagnostiquer les problèmes de scroll
     */
    debugScroll() {
        if (!this.viewerContainer || !this.pdfDocument) {
            console.log('❌ PDF non chargé ou conteneur non trouvé');
            return;
        }

        console.log('🔍 === DEBUG SCROLL INFO ===');
        console.log(`📄 PDF: ${this.pdfDocument.numPages} pages`);
        console.log(`📍 Page courante: ${this.currentPageNum}`);
        console.log(`📦 Container ID: ${this.containerId}`);
        
        // Info conteneur
        const containerRect = this.viewerContainer.getBoundingClientRect();
        console.log(`🗃️ Container:`, {
            scrollTop: this.viewerContainer.scrollTop,
            scrollHeight: this.viewerContainer.scrollHeight,
            clientHeight: this.viewerContainer.clientHeight,
            rect: {
                top: containerRect.top,
                height: containerRect.height
            }
        });

        // Info pages
        for (let i = 1; i <= this.pdfDocument.numPages; i++) {
            const pageWrapper = document.getElementById(`${this.containerId}-page-wrapper-${i}`);
            if (pageWrapper) {
                const pageRect = pageWrapper.getBoundingClientRect();
                console.log(`📄 Page ${i}:`, {
                    offsetTop: pageWrapper.offsetTop,
                    rect: {
                        top: pageRect.top,
                        bottom: pageRect.bottom,
                        height: pageRect.height
                    },
                    visible: pageRect.top < containerRect.bottom && pageRect.bottom > containerRect.top
                });
            }
        }

        // Info miniatures
        if (this.thumbnailsContainer) {
            const thumbnails = this.thumbnailsContainer.querySelectorAll('.pdf-thumbnail-item');
            console.log(`🖼️ Miniatures: ${thumbnails.length} trouvées`);
        }
        
        // État du scroll
        console.log(`🔒 Scroll en cours: ${this.isScrolling}`);
    }

    /**
     * Test de navigation simple
     */
    testNavigation() {
        console.log('🧪 Test de navigation...');
        console.log(`📍 Page courante: ${this.currentPageNum}`);
        
        if (this.pdfDocument) {
            console.log(`📚 Total de pages: ${this.pdfDocument.numPages}`);
            
            // Test immédiat: aller à la page 2
            console.log('🧪 Test 1: Aller à la page 2...');
            this.scrollToPage(2);
            
            // Test après 2 secondes: retourner à la page 1
            setTimeout(() => {
                console.log('🧪 Test 2: Retourner à la page 1...');
                this.scrollToPage(1);
            }, 2000);
        }
    }

    /**
     * Test manuel pour débugger
     */
    testScrollToPage(pageNum) {
        console.log(`🧪 TEST MANUEL: Scroll vers page ${pageNum}`);
        this.scrollToPage(pageNum);
    }
}

// Exporter la classe pour utilisation
window.PDFViewer = PDFViewer;