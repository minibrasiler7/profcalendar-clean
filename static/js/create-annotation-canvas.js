/**
 * Create Annotation Canvas - Crée automatiquement les canvas d'annotation
 * Solution finale pour le système d'annotations iPad
 */

(function() {
    'use strict';

    console.log('🎨 Création automatique des canvas d\'annotation...');

    // Variables globales pour le dessin
    let isDrawing = false;
    let currentStroke = [];
    let currentTool = 'pen';
    let currentColor = '#ff0000';
    let currentStrokeWidth = 3;

    /**
     * Créer un canvas d'annotation pour une page PDF
     */
    function createAnnotationCanvas(pageWrapper, pageNum) {
        const pdfCanvas = pageWrapper.querySelector(`#pdf-canvas-${pageNum}, .pdf-canvas`);
        if (!pdfCanvas) {
            console.warn(`⚠️ PDF Canvas non trouvé pour page ${pageNum}`);
            return null;
        }

        // Vérifier si le canvas d'annotation existe déjà
        let annotationCanvas = pageWrapper.querySelector(`#annotation-canvas-${pageNum}`);
        if (annotationCanvas) {
            console.log(`ℹ️ Canvas d'annotation existe déjà pour page ${pageNum}`);
            return annotationCanvas;
        }

        // Créer le nouveau canvas d'annotation
        annotationCanvas = document.createElement('canvas');
        annotationCanvas.id = `annotation-canvas-${pageNum}`;
        annotationCanvas.className = 'annotation-canvas';
        
        // Copier les dimensions exactes du PDF canvas
        annotationCanvas.width = pdfCanvas.width;
        annotationCanvas.height = pdfCanvas.height;
        
        // Positionner par-dessus le PDF canvas
        annotationCanvas.style.position = 'absolute';
        annotationCanvas.style.top = '0';
        annotationCanvas.style.left = '0';
        annotationCanvas.style.width = pdfCanvas.style.width || `${pdfCanvas.width}px`;
        annotationCanvas.style.height = pdfCanvas.style.height || `${pdfCanvas.height}px`;
        annotationCanvas.style.zIndex = '100';
        annotationCanvas.style.pointerEvents = 'none'; // Par défaut, laisser passer les événements
        annotationCanvas.style.touchAction = 'none'; // Sera géré dynamiquement
        annotationCanvas.style.userSelect = 'none';
        
        // S'assurer que le conteneur parent a position relative
        if (pageWrapper.style.position !== 'relative' && pageWrapper.style.position !== 'absolute') {
            pageWrapper.style.position = 'relative';
        }
        
        // Ajouter au DOM
        pageWrapper.appendChild(annotationCanvas);

        // Fonction de détection stylet locale
        function isStylusTouch(touch) {
            return touch.touchType === 'stylus' || 
                   (touch.force !== undefined && touch.radiusX !== undefined && 
                    touch.force > 0.05 && (touch.radiusX < 10 || touch.radiusY < 10));
        }

        // Ajouter un système de détection globale des touches sur le conteneur parent
        pageWrapper.addEventListener('touchstart', function(e) {
            const touches = Array.from(e.touches || []);
            const hasStylusOnly = touches.length === 1 && isStylusTouch(touches[0]);
            
            if (hasStylusOnly) {
                // Activer le canvas pour intercepter les événements stylet
                annotationCanvas.style.pointerEvents = 'auto';
                if (window.debugLog_custom) {
                    window.debugLog_custom(`✏️ Canvas P${pageNum} activé pour stylet`);
                }
            } else {
                // Désactiver le canvas pour laisser passer scroll/zoom
                annotationCanvas.style.pointerEvents = 'none';
                if (window.debugLog_custom) {
                    window.debugLog_custom(`👆 Canvas P${pageNum} désactivé: ${touches.length} touches`);
                }
            }
        }, { passive: true, capture: true });

        // Désactiver le canvas quand on lève tous les doigts
        pageWrapper.addEventListener('touchend', function(e) {
            if (e.touches.length === 0) {
                annotationCanvas.style.pointerEvents = 'none';
                if (window.debugLog_custom) {
                    window.debugLog_custom(`🛑 Canvas P${pageNum} désactivé - fin de touch`);
                }
            }
        }, { passive: true });
        
        console.log(`✅ Canvas d'annotation créé pour page ${pageNum}: ${annotationCanvas.width}x${annotationCanvas.height}`);
        if (window.debugLog_custom) {
            window.debugLog_custom(`✅ Canvas créé P${pageNum}: ${annotationCanvas.width}x${annotationCanvas.height}`);
        }

        return annotationCanvas;
    }

    /**
     * Configurer les événements stylet sur un canvas
     */
    function setupStylusEvents(annotationCanvas, pageNum) {
        let pageIsDrawing = false;
        let pageCurrentStroke = [];

        /**
         * Détecter si c'est un stylet
         */
        function isStylusTouch(touch) {
            return touch.touchType === 'stylus' || 
                   (touch.force !== undefined && touch.radiusX !== undefined && 
                    touch.force > 0.05 && (touch.radiusX < 10 || touch.radiusY < 10));
        }

        /**
         * Obtenir les outils actuels
         */
        function getCurrentTools() {
            return {
                tool: window.currentTool || currentTool,
                color: window.currentAnnotationColor || window.currentColor || currentColor,
                strokeWidth: window.currentStrokeWidth || currentStrokeWidth
            };
        }

        /**
         * Début du dessin stylet
         */
        function handleStylusStart(e) {
            // Analyser les touches
            const touches = Array.from(e.touches || []);
            const stylusTouch = touches.find(isStylusTouch);
            
            // Si ce n'est PAS un stylet seul, laisser passer l'événement
            if (!stylusTouch || touches.length !== 1) {
                if (window.debugLog_custom) {
                    window.debugLog_custom(`👆 Geste non-stylet P${pageNum}: ${touches.length} touches, stylet: ${!!stylusTouch}`);
                }
                return; // Ne pas preventDefault/stopPropagation - laisser passer
            }

            if (window.debugLog_custom) {
                window.debugLog_custom(`✏️ Dessin stylet P${pageNum} force:${stylusTouch.force?.toFixed(2)}`);
            }

            e.preventDefault();
            e.stopPropagation();

            const rect = annotationCanvas.getBoundingClientRect();
            const ctx = annotationCanvas.getContext('2d');
            const tools = getCurrentTools();

            // Coordonnées relatives au canvas
            const x = (stylusTouch.clientX - rect.left) * (annotationCanvas.width / rect.width);
            const y = (stylusTouch.clientY - rect.top) * (annotationCanvas.height / rect.height);

            pageIsDrawing = true;
            pageCurrentStroke = [{ x, y, pressure: stylusTouch.force || 0.5 }];

            // Configuration du contexte
            ctx.globalCompositeOperation = tools.tool === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = tools.color;
            ctx.lineWidth = tools.strokeWidth * (stylusTouch.force || 0.5);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Commencer le trait
            ctx.beginPath();
            ctx.moveTo(x, y);
        }

        /**
         * Mouvement du stylet
         */
        function handleStylusMove(e) {
            // Si on n'est pas en train de dessiner, laisser passer tous les événements
            if (!pageIsDrawing) {
                return; // Ne pas intercepter les gestes de scroll/zoom
            }

            const touches = Array.from(e.touches || []);
            const stylusTouch = touches.find(isStylusTouch);
            
            if (!stylusTouch) {
                handleStylusEnd(e);
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const rect = annotationCanvas.getBoundingClientRect();
            const ctx = annotationCanvas.getContext('2d');
            const tools = getCurrentTools();

            const x = (stylusTouch.clientX - rect.left) * (annotationCanvas.width / rect.width);
            const y = (stylusTouch.clientY - rect.top) * (annotationCanvas.height / rect.height);

            // Adapter l'épaisseur à la pression
            const pressure = stylusTouch.force || 0.5;
            ctx.lineWidth = tools.strokeWidth * Math.max(0.1, pressure);

            // Dessiner
            ctx.lineTo(x, y);
            ctx.stroke();

            pageCurrentStroke.push({ x, y, pressure });
        }

        /**
         * Fin du dessin stylet
         */
        function handleStylusEnd(e) {
            if (!pageIsDrawing) return;

            pageIsDrawing = false;

            if (window.debugLog_custom) {
                window.debugLog_custom(`🎨 Trait terminé P${pageNum}: ${pageCurrentStroke.length} points`);
            }

            // Sauvegarder si possible
            if (pageCurrentStroke.length > 1) {
                const tools = getCurrentTools();
                const annotation = {
                    type: 'stylus_stroke',
                    tool: tools.tool,
                    color: tools.color,
                    strokeWidth: tools.strokeWidth,
                    points: pageCurrentStroke,
                    page: parseInt(pageNum),
                    timestamp: Date.now()
                };

                // Tenter de sauvegarder
                if (window.saveAnnotationToDatabase) {
                    try {
                        window.saveAnnotationToDatabase(annotation);
                    } catch (error) {
                        console.warn('⚠️ Erreur sauvegarde annotation:', error);
                    }
                }
            }

            pageCurrentStroke = [];
        }

        // Ajouter les événements - NE PAS utiliser capture pour permettre la propagation
        annotationCanvas.addEventListener('touchstart', handleStylusStart, { passive: false, capture: false });
        annotationCanvas.addEventListener('touchmove', handleStylusMove, { passive: false, capture: false });
        annotationCanvas.addEventListener('touchend', handleStylusEnd, { passive: false, capture: false });
        annotationCanvas.addEventListener('touchcancel', handleStylusEnd, { passive: false, capture: false });

        console.log(`✅ Événements stylet configurés pour page ${pageNum}`);
    }

    /**
     * Traiter toutes les pages PDF trouvées
     */
    function processAllPages() {
        // Chercher tous les wrappers de page possibles
        const pageWrappers = document.querySelectorAll(
            '.pdf-page-wrapper, .pdf-page-container, [id*="page-wrapper"], [id*="page-container"]'
        );

        if (pageWrappers.length === 0) {
            if (window.debugLog_custom) {
                window.debugLog_custom('⚠️ Aucune page PDF trouvée');
            }
            return;
        }

        let canvasCreated = 0;
        pageWrappers.forEach((wrapper, index) => {
            // Extraire le numéro de page de l'ID ou utiliser l'index
            let pageNum = index + 1;
            if (wrapper.id) {
                const match = wrapper.id.match(/(\d+)/);
                if (match) {
                    pageNum = parseInt(match[1]);
                }
            }

            const canvas = createAnnotationCanvas(wrapper, pageNum);
            if (canvas) {
                setupStylusEvents(canvas, pageNum);
                canvasCreated++;
            }
        });

        console.log(`✅ ${canvasCreated} canvas d'annotation créés sur ${pageWrappers.length} pages`);
        if (window.debugLog_custom) {
            window.debugLog_custom(`✅ ${canvasCreated} canvas créés automatiquement`);
        }
    }

    /**
     * Observer les nouvelles pages créées dynamiquement
     */
    function watchForNewPages() {
        const observer = new MutationObserver((mutations) => {
            let hasNewPages = false;
            
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList && (
                            node.classList.contains('pdf-page-wrapper') ||
                            node.classList.contains('pdf-page-container') ||
                            node.id && (node.id.includes('page-wrapper') || node.id.includes('page-container'))
                        )) {
                            hasNewPages = true;
                        } else if (node.querySelectorAll) {
                            const newPages = node.querySelectorAll(
                                '.pdf-page-wrapper, .pdf-page-container, [id*="page-wrapper"], [id*="page-container"]'
                            );
                            if (newPages.length > 0) {
                                hasNewPages = true;
                            }
                        }
                    }
                });
            });

            if (hasNewPages) {
                if (window.debugLog_custom) {
                    window.debugLog_custom('🆕 Nouvelles pages PDF détectées');
                }
                setTimeout(processAllPages, 500);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('👁️ Observer pages PDF configuré');
    }

    /**
     * Test de diagnostic
     */
    window.testCanvasCreation = function() {
        console.log('🧪 Test de création de canvas:');
        processAllPages();
        
        const annotationCanvases = document.querySelectorAll('.annotation-canvas');
        console.log(`📊 Résultat: ${annotationCanvases.length} canvas d'annotation trouvés`);
        
        annotationCanvases.forEach((canvas, index) => {
            console.log(`  Canvas ${index + 1}: ${canvas.id}, ${canvas.width}x${canvas.height}`);
        });

        if (window.debugLog_custom) {
            window.debugLog_custom(`🧪 Test: ${annotationCanvases.length} canvas trouvés`);
        }
    };

    /**
     * Initialisation
     */
    function init() {
        console.log('🚀 Initialisation création canvas annotations...');
        
        // Traiter les pages existantes
        setTimeout(processAllPages, 1000);
        
        // Observer les nouvelles pages
        watchForNewPages();
        
        // Re-traiter périodiquement au cas où
        setTimeout(processAllPages, 3000);
        setTimeout(processAllPages, 5000);
        
        console.log('✅ Système création canvas initialisé');
        if (window.debugLog_custom) {
            window.debugLog_custom('✅ Création auto canvas activée');
        }
    }

    // Initialiser après tout le reste
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(init, 2000);
        });
    } else {
        setTimeout(init, 2000);
    }

    // Réinitialiser quand un PDF est chargé
    window.addEventListener('pdfLoaded', () => {
        setTimeout(init, 1000);
    });

})();