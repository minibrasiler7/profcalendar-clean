/**
 * PDF Touch Annotations - Support tactile pour dessiner sur PDF
 * Spécialement conçu pour iPad et tablettes
 * 
 * @version 1.0.0
 * @author ProfCalendar
 */

(function() {
    'use strict';

    // Détection des appareils tactiles
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (!isTouchDevice) {
        return;
    }


    // Variables globales pour le dessin
    let isDrawing = false;
    let currentTool = 'pen';
    let currentColor = '#ff0000';
    let currentStrokeWidth = 3;
    let lastTouchPoint = null;
    let annotationPath = [];

    /**
     * Initialise les annotations tactiles après le chargement du PDF
     */
    function initPDFTouchAnnotations() {
        // Attendre que les canvas soient créés
        setTimeout(() => {
            setupTouchAnnotationHandlers();
        }, 1000);
    }

    /**
     * Configure les gestionnaires tactiles pour toutes les pages PDF
     */
    function setupTouchAnnotationHandlers() {
        // Observer les nouveaux canvas qui sont créés dynamiquement
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList && node.classList.contains('pdf-page-wrapper')) {
                            setupPageTouchAnnotations(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('.pdf-page-wrapper').forEach(setupPageTouchAnnotations);
                        }
                    }
                });
            });
        });

        // Observer le conteneur des pages PDF
        const pagesContainer = document.getElementById('pdfPagesContainer');
        if (pagesContainer) {
            observer.observe(pagesContainer, { 
                childList: true, 
                subtree: true 
            });
        }

        // Configurer les pages existantes
        document.querySelectorAll('.pdf-page-wrapper').forEach(setupPageTouchAnnotations);
    }

    /**
     * Configure les annotations tactiles pour une page PDF spécifique
     */
    function setupPageTouchAnnotations(pageWrapper) {
        if (pageWrapper.dataset.touchAnnotationsConfigured) {
            return; // Déjà configuré
        }

        const pageNum = pageWrapper.id.split('-').pop();
        const annotationCanvas = pageWrapper.querySelector(`#annotation-canvas-${pageNum}`);
        
        if (!annotationCanvas) {
            return;
        }

        // Récupérer les outils depuis les variables globales de la page
        const getAnnotationTools = () => {
            return {
                tool: window.currentTool || currentTool,
                color: window.currentAnnotationColor || window.currentColor || currentColor,
                strokeWidth: window.currentStrokeWidth || currentStrokeWidth
            };
        };

        // Variables de dessin pour cette page
        let pageIsDrawing = false;
        let pageLastPoint = null;
        let pageCurrentPath = [];

        /**
         * Gestion du début du dessin tactile
         */
        function handleTouchStart(e) {
            // Seulement pour 1 doigt (dessin), pas pour les gestes multi-touch
            if (e.touches.length !== 1) return;

            // Log pour debug
            }

            // Empêcher les autres interactions tactiles pendant le dessin
            e.preventDefault();
            e.stopPropagation();

            const tools = getAnnotationTools();
            const touch = e.touches[0];
            const rect = annotationCanvas.getBoundingClientRect();
            const ctx = annotationCanvas.getContext('2d');

            // Vérifier que le canvas et contexte sont valides
            if (!ctx || annotationCanvas.width === 0 || annotationCanvas.height === 0) {
                }
                return;
            }

            // Coordonnées relatives au canvas
            const x = (touch.clientX - rect.left) * (annotationCanvas.width / rect.width);
            const y = (touch.clientY - rect.top) * (annotationCanvas.height / rect.height);

            pageIsDrawing = true;
            pageLastPoint = { x, y };
            pageCurrentPath = [{ x, y }];

            // Configuration du style de dessin
            ctx.globalCompositeOperation = tools.tool === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = tools.color;
            ctx.lineWidth = tools.strokeWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Commencer le chemin
            ctx.beginPath();
            ctx.moveTo(x, y);

            }

        }

        /**
         * Gestion du mouvement pendant le dessin tactile
         */
        function handleTouchMove(e) {
            if (!pageIsDrawing) return;
            
            e.preventDefault();
            e.stopPropagation();

            if (e.touches.length !== 1) return;

            const touch = e.touches[0];
            const rect = annotationCanvas.getBoundingClientRect();
            const ctx = annotationCanvas.getContext('2d');

            // Coordonnées relatives au canvas
            const x = (touch.clientX - rect.left) * (annotationCanvas.width / rect.width);
            const y = (touch.clientY - rect.top) * (annotationCanvas.height / rect.height);

            if (pageLastPoint) {
                // Dessiner une ligne lisse
                ctx.lineTo(x, y);
                ctx.stroke();

                // Ajouter le point au chemin pour la sauvegarde
                pageCurrentPath.push({ x, y });
            }

            pageLastPoint = { x, y };
        }

        /**
         * Gestion de la fin du dessin tactile
         */
        function handleTouchEnd(e) {
            if (!pageIsDrawing) return;

            e.preventDefault();
            e.stopPropagation();

            pageIsDrawing = false;
            pageLastPoint = null;

            // Sauvegarder l'annotation si nécessaire
            if (pageCurrentPath.length > 0 && window.saveAnnotationToDatabase) {
                const tools = getAnnotationTools();
                const annotation = {
                    type: 'path',
                    tool: tools.tool,
                    color: tools.color,
                    strokeWidth: tools.strokeWidth,
                    points: pageCurrentPath,
                    page: parseInt(pageNum)
                };

                // Utiliser la fonction globale de sauvegarde si elle existe
                window.saveAnnotationToDatabase(annotation);
            }

            pageCurrentPath = [];
        }

        /**
         * Gestion de l'annulation du touch (ex: appel entrant)
         */
        function handleTouchCancel(e) {
            pageIsDrawing = false;
            pageLastPoint = null;
            pageCurrentPath = [];
        }

        // Ajouter les événements tactiles spécialisés
        annotationCanvas.addEventListener('touchstart', handleTouchStart, { 
            passive: false,
            capture: true // Capturer avant les autres handlers
        });
        annotationCanvas.addEventListener('touchmove', handleTouchMove, { 
            passive: false,
            capture: true
        });
        annotationCanvas.addEventListener('touchend', handleTouchEnd, { 
            passive: false,
            capture: true
        });
        annotationCanvas.addEventListener('touchcancel', handleTouchCancel, { 
            passive: false,
            capture: true
        });

        // Permettre les annotations tactiles
        annotationCanvas.style.touchAction = 'none';
        annotationCanvas.style.pointerEvents = 'auto';

        // Marquer comme configuré
        pageWrapper.dataset.touchAnnotationsConfigured = 'true';
        
    }

    /**
     * Intégration avec les outils d'annotation existants
     */
    function integrateWithExistingTools() {
        // Écouter les changements d'outils
        document.addEventListener('click', (e) => {
            // Détecter les clics sur les outils d'annotation
            if (e.target.classList.contains('btn-annotation-tool')) {
                const tool = e.target.dataset.tool;
                if (tool) {
                    currentTool = tool;
                }
            }
            
            // Détecter les changements de couleur
            if (e.target.classList.contains('color-btn')) {
                const color = e.target.style.backgroundColor;
                if (color) {
                    currentColor = color;
                }
            }
        });

        // Écouter les changements d'épaisseur
        const strokeControls = document.querySelectorAll('.stroke-btn');
        strokeControls.forEach(control => {
            control.addEventListener('click', () => {
                const width = control.dataset.width;
                if (width) {
                    currentStrokeWidth = parseInt(width);
                }
            });
        });
    }

    /**
     * Améliorer la réactivité tactile des outils
     */
    function enhanceToolResponsiveness() {
        // Améliorer les boutons d'outils pour le tactile
        const toolButtons = document.querySelectorAll('.btn-annotation-tool, .color-btn, .stroke-btn');
        
        toolButtons.forEach(button => {
            // Feedback tactile immédiat
            button.addEventListener('touchstart', function(e) {
                this.style.transform = 'scale(0.9)';
                this.style.transition = 'transform 0.1s';
                
                // Ajouter une classe active temporaire
                this.classList.add('touch-active');
            }, { passive: true });

            button.addEventListener('touchend', function(e) {
                this.style.transform = '';
                this.classList.remove('touch-active');
                
                // Simuler un clic si c'était un tap rapide
                if (e.timeStamp - (e.target.touchStartTime || 0) < 300) {
                    this.click();
                }
            }, { passive: true });

            button.addEventListener('touchcancel', function(e) {
                this.style.transform = '';
                this.classList.remove('touch-active');
            }, { passive: true });
        });
    }

    /**
     * Initialisation principale
     */
    function init() {
        
        initPDFTouchAnnotations();
        integrateWithExistingTools();
        enhanceToolResponsiveness();
        
    }

    // Initialiser au chargement du DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Réinitialiser quand un PDF est chargé
    window.addEventListener('pdfLoaded', init);
    window.addEventListener('pdfViewerOpened', init);

    // Exposer l'init pour réinitialisation manuelle
    window.initPDFTouchAnnotations = init;

})();