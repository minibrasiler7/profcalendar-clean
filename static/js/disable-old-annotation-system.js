/**
 * Disable Old Annotation System - Désactive l'ancien système défaillant
 * Empêche les erreurs getBoundingClientRect et conflits tactiles
 */

(function() {
    'use strict';

    console.log('🚫 Désactivation de l\'ancien système d\'annotation...');

    /**
     * Désactiver les fonctions problématiques
     */
    function disableOldSystem() {
        // Liste des fonctions à désactiver - TOUTES les fonctions d'annotation
        const functionsToDisable = [
            'startDrawing',
            'startDrawingMultiPage', 
            'draw',
            'drawMultiPage',
            'stopDrawing',
            'stopDrawingMultiPage',
            'handleTouch',
            'handleTouchMultiPage',
            'setupAnnotations',
            'enableDrawing',
            'disableDrawing',
            'getCanvasCoordinates',
            'initializeCanvases'
        ];

        functionsToDisable.forEach(funcName => {
            if (window[funcName]) {
                const originalFunc = window[funcName];
                window[funcName] = function(...args) {
                    console.log(`🚫 Fonction ${funcName} désactivée - utiliser le système stylet`);
                    if (window.debugLog_custom) {
                        window.debugLog_custom(`🚫 ${funcName} désactivée`);
                    }
                    return null;
                };
                console.log(`✅ Fonction ${funcName} désactivée`);
            }
        });
    }

    /**
     * Bloquer les event listeners problématiques
     */
    function blockProblematicListeners() {
        // Override addEventListener pour capturer les anciens listeners
        const originalAddEventListener = Element.prototype.addEventListener;
        
        Element.prototype.addEventListener = function(type, listener, options) {
            // Si c'est un canvas d'annotation ET un événement tactile/souris de l'ancien système
            if ((type === 'mousedown' || type === 'mousemove' || type === 'mouseup' || 
                 type === 'touchstart' || type === 'touchmove' || type === 'touchend') &&
                this.id && this.id.includes('annotation-canvas')) {
                
                // Vérifier si c'est un listener de l'ancien système
                const listenerStr = listener.toString();
                // Ne bloquer QUE les anciens listeners, pas ceux du nouveau unified-pdf-viewer
                if ((listenerStr.includes('drawMultiPage') ||
                     listenerStr.includes('getBoundingClientRect')) &&
                     !listenerStr.includes('this.startDrawing') &&
                     !listenerStr.includes('✌️') &&
                     !listenerStr.includes('isStylusTouch')) {
                    
                    // Bloquer listener de l'ancien système silencieusement
                    return; // Ne pas ajouter le listener
                }
            }
            
            // Sinon, ajouter normalement
            return originalAddEventListener.call(this, type, listener, options);
        };
    }

    /**
     * Activer le scroll natif sur le conteneur PDF
     */
    function enableNativeScroll() {
        setTimeout(() => {
            const pdfContainer = document.querySelector('.pdf-container');
            if (pdfContainer) {
                // Propriétés pour un scroll fluide
                pdfContainer.style.overflow = 'auto';
                pdfContainer.style.overflowX = 'hidden';
                pdfContainer.style.overflowY = 'auto';
                pdfContainer.style.webkitOverflowScrolling = 'touch';
                pdfContainer.style.touchAction = 'pan-y';
                
                console.log('✅ Scroll natif activé sur conteneur PDF');
                if (window.debugLog_custom) {
                    window.debugLog_custom('✅ Scroll natif PDF activé');
                }
            }
            
            // Permettre le scroll sur le viewer principal aussi
            const viewerContainer = document.getElementById('viewerContainer');
            if (viewerContainer) {
                viewerContainer.style.overflow = 'auto';
                viewerContainer.style.webkitOverflowScrolling = 'touch';
                viewerContainer.style.touchAction = 'pan-y';
                
                console.log('✅ Scroll natif activé sur viewer');
            }
        }, 1000);
    }

    /**
     * Nettoyer les anciens event listeners
     */
    function cleanupOldListeners() {
        setTimeout(() => {
            // Trouver tous les canvas d'annotation
            const annotationCanvases = document.querySelectorAll('[id*="annotation-canvas"]');
            
            annotationCanvases.forEach(canvas => {
                // Cloner le canvas pour supprimer tous ses event listeners
                const newCanvas = canvas.cloneNode(true);
                canvas.parentNode.replaceChild(newCanvas, canvas);
                
                console.log(`🧹 Listeners nettoyés sur ${newCanvas.id}`);
                if (window.debugLog_custom) {
                    window.debugLog_custom(`🧹 Nettoyage ${newCanvas.id}`);
                }
            });
            
            console.log(`✅ ${annotationCanvases.length} canvas nettoyés`);
        }, 2000);
    }

    /**
     * Forcer l'utilisation du nouveau système uniquement
     */
    function forceNewSystemOnly() {
        // Surveiller la création de nouveaux canvas
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Si c'est un canvas d'annotation
                        if (node.id && node.id.includes('annotation-canvas')) {
                            // Configurer immédiatement pour le nouveau système
                            node.style.touchAction = 'none';
                            node.style.pointerEvents = 'auto';
                            node.dataset.newSystemOnly = 'true';
                            
                            console.log(`🆕 Canvas ${node.id} configuré pour nouveau système uniquement`);
                            if (window.debugLog_custom) {
                                window.debugLog_custom(`🆕 ${node.id} → nouveau système`);
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
    }

    /**
     * Override des fonctions problématiques avec des versions sûres
     */
    function createSafeFallbacks() {
        // Remplacer getBoundingClientRect par une version sécurisée globalement
        const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        
        Element.prototype.getBoundingClientRect = function() {
            try {
                if (!this.parentNode || !document.contains(this)) {
                    console.warn('⚠️ getBoundingClientRect sur élément détaché:', this);
                    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
                }
                return originalGetBoundingClientRect.call(this);
            } catch (error) {
                console.warn('⚠️ Erreur getBoundingClientRect:', error);
                return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
            }
        };
    }

    /**
     * Initialisation
     */
    function init() {
        console.log('🚀 Initialisation de la désactivation système...');
        
        createSafeFallbacks();
        blockProblematicListeners();
        enableNativeScroll();
        forceNewSystemOnly();
        
        // Bloquer unified-pdf-viewer immédiatement
        blockUnifiedPdfViewer();
        
        // Bloquer aussi immédiatement les fonctions globales
        disableOldSystem();
        
        // Désactiver après un délai pour laisser les autres systèmes se charger
        setTimeout(() => {
            disableOldSystem(); // Re-bloquer
            cleanupOldListeners();
            blockUnifiedPdfViewer(); // Re-bloquer au cas où
        }, 1000);
        
        // Re-bloquer après plus de temps
        setTimeout(() => {
            disableOldSystem();
            blockUnifiedPdfViewer();
        }, 3000);
        
        /**
         * Bloquer complètement unified-pdf-viewer.js
         */
        function blockUnifiedPdfViewer() {
            // NE PAS bloquer les fonctions d'ouverture du PDF !
            const functionsToKeep = ['openFileViewer', 'openFileWithUnifiedViewer', 'loadPDF'];
            
            // Bloquer TOUTES les fonctions d'annotation problématiques (single + multi page)
            const problematicFunctions = [
                // Fonctions multipage
                'setupMultiPageAnnotations', 'startDrawingMultiPage', 'drawMultiPage', 'stopDrawingMultiPage',
                'handleTouchMultiPage', 'getCanvasCoordinates', 'initializeCanvases',
                // Fonctions single page problématiques
                'startDrawing', 'draw', 'stopDrawing', 'handleTouch',
                // Autres fonctions d'annotation
                'setupAnnotations', 'enableDrawing', 'disableDrawing'
            ];

            problematicFunctions.forEach(funcName => {
                if (window[funcName]) {
                    window[funcName] = function(...args) {
                        console.log(`🚫 ${funcName} bloquée (annotations seulement)`);
                        if (window.debugLog_custom) {
                            window.debugLog_custom(`🚫 ${funcName} annotation bloquée`);
                        }
                        return null;
                    };
                }
            });
            
            console.log('✅ Ouverture PDF préservée, annotations bloquées');
            if (window.debugLog_custom) {
                window.debugLog_custom('✅ PDF ouverture OK, annotations bloquées');
            }
        }
        
        console.log('✅ Ancien système désactivé - Nouveau système stylet actif');
        if (window.debugLog_custom) {
            window.debugLog_custom('✅ Migration vers nouveau système terminée');
        }
    }

    // Initialiser en premier
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();