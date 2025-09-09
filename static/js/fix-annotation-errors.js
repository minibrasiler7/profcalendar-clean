/**
 * Fix Annotation Errors - Correction des erreurs d'annotation iPad
 * Corrige les erreurs getBoundingClientRect et améliore la robustesse
 */

(function() {
    'use strict';

    console.log('🔧 Chargement du correctif d\'annotations...');

    /**
     * Fonction utilitaire pour vérifier si un élément est valide
     */
    function isValidElement(element) {
        return element && 
               element.nodeType === Node.ELEMENT_NODE && 
               element.parentNode && 
               document.contains(element);
    }

    /**
     * getBoundingClientRect sécurisé
     */
    function safeBoundingClientRect(element) {
        if (!isValidElement(element)) {
            console.warn('⚠️ Element invalide pour getBoundingClientRect:', element);
            return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        }
        
        try {
            return element.getBoundingClientRect();
        } catch (error) {
            console.warn('⚠️ Erreur getBoundingClientRect:', error, element);
            return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        }
    }

    /**
     * Corriger les fonctions existantes avec des vérifications robustes
     */
    function patchExistingFunctions() {
        // Attendre que les fonctions soient définies
        setTimeout(() => {
            // Patch pour startDrawingMultiPage
            if (window.startDrawingMultiPage) {
                const originalStartDrawing = window.startDrawingMultiPage;
                window.startDrawingMultiPage = function(e, pageNum) {
                    if (!e || !e.target) {
                        console.warn('⚠️ Event ou target invalide dans startDrawingMultiPage');
                        return;
                    }

                    if (!isValidElement(e.target)) {
                        console.warn('⚠️ Target invalide dans startDrawingMultiPage:', e.target);
                        return;
                    }

                    try {
                        return originalStartDrawing.call(this, e, pageNum);
                    } catch (error) {
                        console.error('❌ Erreur dans startDrawingMultiPage:', error);
                        if (window.debugLog_custom) {
                            window.debugLog_custom('❌ Erreur startDrawing: ' + error.message);
                        }
                    }
                };
            }

            // Patch pour drawMultiPage
            if (window.drawMultiPage) {
                const originalDraw = window.drawMultiPage;
                window.drawMultiPage = function(e, pageNum) {
                    if (!e || !e.target) {
                        console.warn('⚠️ Event ou target invalide dans drawMultiPage');
                        return;
                    }

                    if (!isValidElement(e.target)) {
                        console.warn('⚠️ Target invalide dans drawMultiPage:', e.target);
                        return;
                    }

                    try {
                        return originalDraw.call(this, e, pageNum);
                    } catch (error) {
                        console.error('❌ Erreur dans drawMultiPage:', error);
                        if (window.debugLog_custom) {
                            window.debugLog_custom('❌ Erreur draw: ' + error.message);
                        }
                    }
                };
            }

            // Patch pour getCanvasCoordinates si elle existe
            if (window.getCanvasCoordinates) {
                const originalGetCoords = window.getCanvasCoordinates;
                window.getCanvasCoordinates = function(e) {
                    if (!window.annotationCanvas || !isValidElement(window.annotationCanvas)) {
                        console.warn('⚠️ annotationCanvas invalide dans getCanvasCoordinates');
                        return { x: 0, y: 0 };
                    }

                    try {
                        return originalGetCoords.call(this, e);
                    } catch (error) {
                        console.error('❌ Erreur dans getCanvasCoordinates:', error);
                        return { x: 0, y: 0 };
                    }
                };
            }

            console.log('✅ Fonctions d\'annotation patchées');
            if (window.debugLog_custom) {
                window.debugLog_custom('✅ Correctifs appliqués aux fonctions d\'annotation');
            }
        }, 2000);
    }

    /**
     * Améliorer les gestionnaires d'événements tactiles existants
     */
    function improveExistingTouchHandlers() {
        // Attendre que le système soit initialisé
        setTimeout(() => {
            // Rechercher tous les canvas d'annotation existants
            const canvases = document.querySelectorAll('[id^="annotation-canvas-"]');
            
            if (window.debugLog_custom) {
                window.debugLog_custom('🔍 Amélioration: ' + canvases.length + ' canvas trouvés');
            }

            canvases.forEach(canvas => {
                if (!isValidElement(canvas)) return;

                const pageNum = canvas.id.split('-').pop();
                
                // Ajouter des gestionnaires tactiles robustes
                canvas.addEventListener('touchstart', function(e) {
                    if (window.debugLog_custom) {
                        window.debugLog_custom('👆 TouchStart robuste sur page ' + pageNum);
                    }

                    if (!isValidElement(this)) {
                        console.warn('⚠️ Canvas invalide dans touchstart');
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    // Simuler un événement souris robuste
                    const touch = e.touches[0];
                    const rect = safeBoundingClientRect(this);
                    
                    const mouseEvent = new MouseEvent('mousedown', {
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        bubbles: true
                    });

                    // Ajouter les propriétés nécessaires
                    Object.defineProperty(mouseEvent, 'target', {
                        value: this,
                        enumerable: true
                    });

                    try {
                        if (window.startDrawingMultiPage) {
                            window.startDrawingMultiPage(mouseEvent, parseInt(pageNum));
                        }
                    } catch (error) {
                        console.error('❌ Erreur simulation touchstart:', error);
                        if (window.debugLog_custom) {
                            window.debugLog_custom('❌ Erreur touch→mouse: ' + error.message);
                        }
                    }
                }, { passive: false });

                canvas.addEventListener('touchmove', function(e) {
                    if (!isValidElement(this) || !e.touches || e.touches.length !== 1) return;

                    e.preventDefault();
                    e.stopPropagation();

                    const touch = e.touches[0];
                    const rect = safeBoundingClientRect(this);
                    
                    const mouseEvent = new MouseEvent('mousemove', {
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        bubbles: true
                    });

                    Object.defineProperty(mouseEvent, 'target', {
                        value: this,
                        enumerable: true
                    });

                    try {
                        if (window.drawMultiPage) {
                            window.drawMultiPage(mouseEvent, parseInt(pageNum));
                        }
                    } catch (error) {
                        console.error('❌ Erreur simulation touchmove:', error);
                    }
                }, { passive: false });

                canvas.addEventListener('touchend', function(e) {
                    if (!isValidElement(this)) return;

                    e.preventDefault();
                    e.stopPropagation();

                    const mouseEvent = new MouseEvent('mouseup', {
                        bubbles: true
                    });

                    Object.defineProperty(mouseEvent, 'target', {
                        value: this,
                        enumerable: true
                    });

                    try {
                        if (window.stopDrawingMultiPage) {
                            window.stopDrawingMultiPage(mouseEvent, parseInt(pageNum));
                        }
                    } catch (error) {
                        console.error('❌ Erreur simulation touchend:', error);
                    }
                }, { passive: false });

                // Configurer le canvas pour les interactions tactiles
                canvas.style.touchAction = 'none';
                canvas.style.userSelect = 'none';
                
                if (window.debugLog_custom) {
                    window.debugLog_custom('✅ Canvas ' + pageNum + ' configuré pour tactile');
                }
            });

        }, 3000);
    }

    /**
     * Surveiller la création dynamique des canvas
     */
    function watchForNewCanvases() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Vérifier si c'est un nouveau canvas d'annotation
                        if (node.id && node.id.startsWith('annotation-canvas-')) {
                            if (window.debugLog_custom) {
                                window.debugLog_custom('🆕 Nouveau canvas: ' + node.id);
                            }
                            // Configurer le nouveau canvas après un délai
                            setTimeout(() => improveExistingTouchHandlers(), 500);
                        }
                        // Ou chercher des canvas dans les nouveaux éléments
                        else if (node.querySelectorAll) {
                            const newCanvases = node.querySelectorAll('[id^="annotation-canvas-"]');
                            if (newCanvases.length > 0) {
                                if (window.debugLog_custom) {
                                    window.debugLog_custom('🆕 ' + newCanvases.length + ' nouveaux canvas détectés');
                                }
                                setTimeout(() => improveExistingTouchHandlers(), 500);
                            }
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('👁️ Observer pour nouveaux canvas activé');
    }

    /**
     * Fonction de test pour vérifier les corrections
     */
    window.testAnnotationFixes = function() {
        const canvases = document.querySelectorAll('[id^="annotation-canvas-"]');
        console.log('🧪 Test des corrections d\'annotation:');
        console.log('  📋 Canvas trouvés:', canvases.length);
        
        canvases.forEach((canvas, index) => {
            console.log(`  📋 Canvas ${index + 1}: ${canvas.id}`);
            console.log(`    - Valid element: ${isValidElement(canvas)}`);
            console.log(`    - In document: ${document.contains(canvas)}`);
            console.log(`    - Touch action: ${canvas.style.touchAction}`);
            
            const rect = safeBoundingClientRect(canvas);
            console.log(`    - Rect: ${rect.width}x${rect.height} at ${rect.left},${rect.top}`);
        });

        if (window.debugLog_custom) {
            window.debugLog_custom('🧪 Test corrections: ' + canvases.length + ' canvas vérifiés');
        }
    };

    /**
     * Initialisation
     */
    function init() {
        console.log('🚀 Initialisation des correctifs d\'annotation...');
        
        // Exposer la fonction utilitaire globalement
        window.safeBoundingClientRect = safeBoundingClientRect;
        window.isValidElement = isValidElement;
        
        // Appliquer les correctifs
        patchExistingFunctions();
        improveExistingTouchHandlers();
        watchForNewCanvases();

        console.log('✅ Correctifs d\'annotation initialisés');
        if (window.debugLog_custom) {
            window.debugLog_custom('✅ Correctifs d\'erreurs appliqués');
        }
    }

    // Initialiser après chargement du DOM et des autres scripts
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(init, 1000);
        });
    } else {
        setTimeout(init, 1000);
    }

    // Réappliquer quand un PDF est chargé
    window.addEventListener('pdfLoaded', () => {
        setTimeout(init, 1000);
    });

})();