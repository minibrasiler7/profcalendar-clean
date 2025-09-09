/**
 * Stylus-Only Annotations for iPad
 * Utilise uniquement l'Apple Pencil pour dessiner, les doigts pour naviguer
 * 
 * @version 1.0.0
 * @author TeacherPlanner
 */

(function() {
    'use strict';

    // Détection des capacités tactiles
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (!isTouchDevice) {
        console.log('🖱️ Appareil non-tactile, skip stylus annotations');
        return;
    }

    console.log('✏️ Système stylet-uniquement activé pour:', isIOS ? 'iPad' : 'Appareil tactile');

    // Variables globales
    let isDrawingWithStylus = false;
    let currentStylusStroke = [];
    let activePage = null;
    let activeCanvas = null;

    /**
     * Détecter si c'est un stylet (Apple Pencil)
     */
    function isStylusTouch(touch) {
        // Méthode 1: touchType (standard)
        if (touch.touchType === 'stylus') {
            return true;
        }
        
        // Méthode 2: force et radiusX/radiusY (Apple Pencil a des valeurs spécifiques)
        if (touch.force !== undefined && touch.radiusX !== undefined) {
            // Apple Pencil tend à avoir une force plus élevée et un rayon plus petit
            const isPencilLike = touch.force > 0.1 && (touch.radiusX < 5 || touch.radiusY < 5);
            return isPencilLike;
        }
        
        // Méthode 3: pointerType si disponible
        if (window.PointerEvent && touch.pointerType === 'pen') {
            return true;
        }
        
        return false;
    }

    /**
     * Obtenir les informations sur le type de touch
     */
    function analyzeTouchType(e) {
        const touches = Array.from(e.touches || []);
        const analysis = {
            total: touches.length,
            stylus: 0,
            finger: 0,
            hasPencil: false,
            touches: []
        };

        touches.forEach((touch, index) => {
            const isStylus = isStylusTouch(touch);
            const touchInfo = {
                index,
                type: isStylus ? 'stylus' : 'finger',
                touchType: touch.touchType,
                force: touch.force,
                radiusX: touch.radiusX,
                radiusY: touch.radiusY,
                x: Math.round(touch.clientX),
                y: Math.round(touch.clientY)
            };
            
            analysis.touches.push(touchInfo);
            
            if (isStylus) {
                analysis.stylus++;
                analysis.hasPencil = true;
            } else {
                analysis.finger++;
            }
        });

        return analysis;
    }

    /**
     * Configurer les annotations stylet pour une page PDF
     */
    function setupStylusAnnotationsForPage(pageWrapper) {
        if (pageWrapper.dataset.stylusConfigured) {
            return; // Déjà configuré
        }

        const pageNum = pageWrapper.id.split('-').pop();
        const pdfCanvas = pageWrapper.querySelector(`#pdf-canvas-${pageNum}`);
        const annotationCanvas = pageWrapper.querySelector(`#annotation-canvas-${pageNum}`);
        
        if (!pdfCanvas || !annotationCanvas) {
            console.warn(`⚠️ Canvas manquants pour la page ${pageNum}`);
            return;
        }

        if (window.debugLog_custom) {
            window.debugLog_custom(`✏️ Config stylet page ${pageNum}`);
        }

        // Variables de dessin pour cette page
        let pageIsDrawing = false;
        let pageCurrentStroke = [];

        /**
         * Début du dessin avec stylet
         */
        function handleStylusStart(e) {
            const touchAnalysis = analyzeTouchType(e);
            
            if (window.debugLog_custom) {
                window.debugLog_custom(`✏️ TouchStart P${pageNum}: ${touchAnalysis.stylus} stylet, ${touchAnalysis.finger} doigts`);
            }

            // Seulement si on a exactement 1 stylet et 0 doigt
            if (touchAnalysis.stylus !== 1 || touchAnalysis.finger !== 0) {
                return; // Laisser passer aux gestes de navigation
            }

            e.preventDefault();
            e.stopPropagation();

            const stylusTouch = touchAnalysis.touches.find(t => t.type === 'stylus');
            const rect = annotationCanvas.getBoundingClientRect();
            const ctx = annotationCanvas.getContext('2d');

            // Coordonnées relatives au canvas
            const x = (stylusTouch.x - rect.left) * (annotationCanvas.width / rect.width);
            const y = (stylusTouch.y - rect.top) * (annotationCanvas.height / rect.height);

            // Obtenir les outils actuels
            const tools = getCurrentAnnotationTools();
            
            pageIsDrawing = true;
            activePage = pageNum;
            activeCanvas = annotationCanvas;
            pageCurrentStroke = [{ x, y, pressure: stylusTouch.force || 0.5 }];

            // Configuration du style
            ctx.globalCompositeOperation = tools.tool === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = tools.color;
            ctx.lineWidth = tools.strokeWidth * (stylusTouch.force || 0.5); // Varier selon la pression
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Commencer le trait
            ctx.beginPath();
            ctx.moveTo(x, y);

            if (window.debugLog_custom) {
                window.debugLog_custom(`🎨 Dessin stylet démarré: ${Math.round(x)},${Math.round(y)} force:${stylusTouch.force}`);
            }
        }

        /**
         * Mouvement du stylet
         */
        function handleStylusMove(e) {
            if (!pageIsDrawing) return;

            const touchAnalysis = analyzeTouchType(e);
            
            // Continuer seulement avec le stylet
            if (touchAnalysis.stylus !== 1) {
                // Si le stylet disparaît, arrêter le dessin
                handleStylusEnd(e);
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const stylusTouch = touchAnalysis.touches.find(t => t.type === 'stylus');
            const rect = annotationCanvas.getBoundingClientRect();
            const ctx = annotationCanvas.getContext('2d');

            const x = (stylusTouch.x - rect.left) * (annotationCanvas.width / rect.width);
            const y = (stylusTouch.y - rect.top) * (annotationCanvas.height / rect.height);

            // Ajuster l'épaisseur selon la pression
            const pressure = stylusTouch.force || 0.5;
            const tools = getCurrentAnnotationTools();
            ctx.lineWidth = tools.strokeWidth * pressure;

            // Dessiner le trait
            ctx.lineTo(x, y);
            ctx.stroke();

            // Ajouter au stroke pour sauvegarde
            pageCurrentStroke.push({ x, y, pressure });
        }

        /**
         * Fin du dessin stylet
         */
        function handleStylusEnd(e) {
            if (!pageIsDrawing) return;

            pageIsDrawing = false;
            
            // Sauvegarder l'annotation
            if (pageCurrentStroke.length > 1 && window.saveAnnotationToDatabase) {
                const tools = getCurrentAnnotationTools();
                const annotation = {
                    type: 'stylus_stroke',
                    tool: tools.tool,
                    color: tools.color,
                    strokeWidth: tools.strokeWidth,
                    points: pageCurrentStroke,
                    page: parseInt(pageNum),
                    device: 'stylus'
                };

                window.saveAnnotationToDatabase(annotation);
                
                if (window.debugLog_custom) {
                    window.debugLog_custom(`💾 Trait stylet sauvé: ${pageCurrentStroke.length} points`);
                }
            }

            pageCurrentStroke = [];
            activePage = null;
            activeCanvas = null;
        }

        // Ajouter les événements uniquement sur le canvas d'annotation
        annotationCanvas.addEventListener('touchstart', handleStylusStart, { 
            passive: false,
            capture: true // Priorité élevée
        });
        
        annotationCanvas.addEventListener('touchmove', handleStylusMove, { 
            passive: false,
            capture: true
        });
        
        annotationCanvas.addEventListener('touchend', handleStylusEnd, { 
            passive: false,
            capture: true
        });
        
        annotationCanvas.addEventListener('touchcancel', handleStylusEnd, { 
            passive: false,
            capture: true
        });

        // Configuration CSS
        annotationCanvas.style.touchAction = 'none'; // Désactiver tous les gestes par défaut
        annotationCanvas.style.pointerEvents = 'auto';
        annotationCanvas.style.userSelect = 'none';

        // Marquer comme configuré
        pageWrapper.dataset.stylusConfigured = 'true';
        
        console.log(`✅ Page ${pageNum} configurée pour stylet uniquement`);
        if (window.debugLog_custom) {
            window.debugLog_custom(`✅ Page ${pageNum} prête pour Apple Pencil`);
        }
    }

    /**
     * Obtenir les outils d'annotation actuels
     */
    function getCurrentAnnotationTools() {
        return {
            tool: window.currentTool || 'pen',
            color: window.currentAnnotationColor || window.currentColor || '#ff0000',
            strokeWidth: window.currentStrokeWidth || 3
        };
    }

    /**
     * Configurer toutes les pages existantes
     */
    function setupAllPages() {
        const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');
        
        if (window.debugLog_custom) {
            window.debugLog_custom(`🔧 Config ${pageWrappers.length} pages pour stylet`);
        }

        pageWrappers.forEach(setupStylusAnnotationsForPage);
    }

    /**
     * Observer les nouvelles pages créées dynamiquement
     */
    function watchForNewPages() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList && node.classList.contains('pdf-page-wrapper')) {
                            setTimeout(() => setupStylusAnnotationsForPage(node), 100);
                        } else if (node.querySelectorAll) {
                            const newPages = node.querySelectorAll('.pdf-page-wrapper');
                            newPages.forEach(page => {
                                setTimeout(() => setupStylusAnnotationsForPage(page), 100);
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('👁️ Observer stylet configuré');
    }

    /**
     * Améliorer la détection des outils
     */
    function enhanceToolDetection() {
        // Écouter les changements d'outils
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-annotation-tool')) {
                if (window.debugLog_custom) {
                    window.debugLog_custom('🔧 Outil stylet: ' + (e.target.dataset.tool || 'unknown'));
                }
            }
        });
    }

    /**
     * Test manuel du système stylet
     */
    window.testStylusSystem = function() {
        console.log('🧪 Test du système stylet:');
        const pages = document.querySelectorAll('.pdf-page-wrapper');
        console.log('  📄 Pages configurées:', pages.length);
        
        pages.forEach((page, index) => {
            const isConfigured = page.dataset.stylusConfigured === 'true';
            const canvas = page.querySelector('[id^="annotation-canvas-"]');
            console.log(`  📄 Page ${index + 1}: Configuré=${isConfigured}, Canvas=${!!canvas}`);
            if (canvas) {
                console.log(`    - Touch action: ${canvas.style.touchAction}`);
                console.log(`    - Pointer events: ${canvas.style.pointerEvents}`);
            }
        });

        if (window.debugLog_custom) {
            window.debugLog_custom('🧪 Test stylet: ' + pages.length + ' pages vérifiées');
        }
    };

    /**
     * Initialisation
     */
    function init() {
        console.log('🚀 Initialisation du système stylet uniquement...');
        
        setupAllPages();
        watchForNewPages();
        enhanceToolDetection();
        
        console.log('✅ Système stylet initialisé - Utilisez Apple Pencil pour dessiner !');
        if (window.debugLog_custom) {
            window.debugLog_custom('✅ Stylet-seulement configuré');
            window.debugLog_custom('ℹ️ Dessiner = Apple Pencil, Naviguer = Doigts');
        }
    }

    // Initialiser après les autres systèmes
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