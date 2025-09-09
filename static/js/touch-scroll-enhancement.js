/**
 * Touch Scroll Enhancement for PDF Viewer
 * Améliore l'expérience de scroll tactile sur iPad et tablettes
 * 
 * @version 1.0.0
 * @author TeacherPlanner
 */

(function() {
    'use strict';

    // Détection des appareils tactiles
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (!isTouchDevice) {
        console.log('🖱️ Appareil non-tactile détecté, skip touch enhancements');
        return;
    }

    console.log('📱 Amélioration tactile activée pour:', isIOS ? 'iOS' : 'Appareil tactile');

    /**
     * Analyser les types de touch (stylet vs doigt)
     */
    function analyzeTouchTypes(e) {
        const touches = Array.from(e.touches || []);
        const analysis = {
            total: touches.length,
            stylus: 0,
            finger: 0
        };

        touches.forEach(touch => {
            // Détecter le stylet via touchType ou caractéristiques physiques
            const isStylus = touch.touchType === 'stylus' || 
                           (touch.force !== undefined && touch.radiusX !== undefined && 
                            touch.force > 0.1 && (touch.radiusX < 5 || touch.radiusY < 5));
            
            if (isStylus) {
                analysis.stylus++;
            } else {
                analysis.finger++;
            }
        });

        return analysis;
    }

    /**
     * Améliore le scroll tactile pour un conteneur PDF
     */
    function enhanceTouchScroll() {
        // Attendre que le DOM soit prêt
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', enhanceTouchScroll);
            return;
        }

        const pdfContainer = document.querySelector('.pdf-container');
        if (!pdfContainer) {
            console.warn('⚠️ Conteneur PDF non trouvé pour l\'amélioration tactile');
            return;
        }

        // Variables pour le touch scroll
        let lastTouchY = 0;
        let isScrolling = false;
        let touchStartTime = 0;
        let touchStartY = 0;

        /**
         * Gestion du début du touch
         */
        function handleTouchStart(e) {
            // Analyser les types de touch
            const touchAnalysis = analyzeTouchTypes(e);
            
            // Ignorer complètement si c'est un stylet seul
            if (touchAnalysis.stylus > 0 && touchAnalysis.finger === 0) {
                return; // Laisser le stylet gérer les annotations
            }

            // Ne gérer que les gestes avec des doigts
            if (touchAnalysis.finger === 0) {
                return; // Pas de doigts = pas de scroll
            }

            touchStartTime = Date.now();
            touchStartY = e.touches[0].clientY;
            lastTouchY = e.touches[0].clientY;
            isScrolling = true;

            // Arrêter toute animation de scroll en cours
            pdfContainer.style.scrollBehavior = 'auto';
        }

        /**
         * Gestion du mouvement tactile
         */
        function handleTouchMove(e) {
            if (!isScrolling) return;

            // Analyser les types de touch
            const touchAnalysis = analyzeTouchTypes(e);
            
            // Arrêter le scroll si un stylet apparaît
            if (touchAnalysis.stylus > 0 && touchAnalysis.finger === 0) {
                isScrolling = false;
                return;
            }

            // Continuer seulement avec des doigts
            if (touchAnalysis.finger === 0) {
                isScrolling = false;
                return;
            }

            const currentY = e.touches[0].clientY;
            const deltaY = lastTouchY - currentY;
            
            // Laisser le scroll natif faire le travail, juste éviter le bounce
            if (pdfContainer.scrollTop === 0 && deltaY < 0) {
                e.preventDefault(); // Éviter le bounce en haut
            } else if (pdfContainer.scrollTop >= pdfContainer.scrollHeight - pdfContainer.clientHeight && deltaY > 0) {
                e.preventDefault(); // Éviter le bounce en bas
            }
            
            lastTouchY = currentY;
        }

        /**
         * Gestion de la fin du touch
         */
        function handleTouchEnd(e) {
            if (!isScrolling) return;
            
            isScrolling = false;
            const touchEndTime = Date.now();
            const touchDuration = touchEndTime - touchStartTime;
            const touchDistance = Math.abs(e.changedTouches[0].clientY - touchStartY);
            
            // Si c'est un swipe rapide, ajouter du momentum
            if (touchDuration < 300 && touchDistance > 30) {
                const velocity = touchDistance / touchDuration;
                addMomentumScroll(velocity, e.changedTouches[0].clientY < touchStartY);
            }

            // Remettre le scroll behavior smooth après un délai
            setTimeout(() => {
                pdfContainer.style.scrollBehavior = 'smooth';
            }, 100);
        }

        /**
         * Ajoute un effet de momentum au scroll
         */
        function addMomentumScroll(velocity, isScrollingDown) {
            const maxVelocity = 2;
            const clampedVelocity = Math.min(velocity, maxVelocity);
            const scrollDistance = clampedVelocity * 100;
            
            const startScroll = pdfContainer.scrollTop;
            const targetScroll = isScrollingDown ? 
                Math.min(startScroll + scrollDistance, pdfContainer.scrollHeight - pdfContainer.clientHeight) :
                Math.max(startScroll - scrollDistance, 0);
            
            // Animation de momentum
            pdfContainer.style.scrollBehavior = 'smooth';
            pdfContainer.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        }

        /**
         * Gestion des gestes de pincement pour le zoom (désactivé sur le conteneur)
         */
        function handleTouchGesture(e) {
            // Empêcher le zoom sur le conteneur principal, le laisser aux canvas PDF
            if (e.touches && e.touches.length > 1 && e.target === pdfContainer) {
                e.preventDefault();
            }
        }

        // Utiliser principalement le scroll natif, avec amélioration tactile légère
        pdfContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
        pdfContainer.addEventListener('touchmove', handleTouchMove, { passive: false }); // Pour éviter le bounce
        pdfContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
        pdfContainer.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        console.log('✅ Amélioration tactile appliquée au conteneur PDF');
    }

    /**
     * Améliore les interactions tactiles des pages PDF
     */
    function enhancePDFPagesTouch() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Améliorer les pages PDF nouvellement ajoutées
                        const pdfPages = node.querySelectorAll ? node.querySelectorAll('.pdf-page-container') : [];
                        pdfPages.forEach(enhanceSinglePageTouch);
                        
                        // Si le node lui-même est une page PDF
                        if (node.classList && node.classList.contains('pdf-page-container')) {
                            enhanceSinglePageTouch(node);
                        }
                    }
                });
            });
        });

        // Observer les changements dans le conteneur des pages
        const pagesContainer = document.querySelector('.pdf-pages-container');
        if (pagesContainer) {
            observer.observe(pagesContainer, { 
                childList: true, 
                subtree: true 
            });
        }

        // Améliorer les pages existantes
        document.querySelectorAll('.pdf-page-container').forEach(enhanceSinglePageTouch);
    }

    /**
     * Améliore une page PDF individuelle
     */
    function enhanceSinglePageTouch(pageContainer) {
        if (pageContainer.dataset.touchEnhanced) return; // Éviter la double initialisation
        
        const canvas = pageContainer.querySelector('.pdf-canvas');
        if (!canvas) return;

        // Variables pour le zoom tactile
        let lastTouchDistance = 0;
        let isZooming = false;

        /**
         * Calculer la distance entre deux touches
         */
        function getTouchDistance(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        /**
         * Gestion du zoom tactile
         */
        function handleZoomStart(e) {
            if (e.touches.length !== 2) return;
            
            isZooming = true;
            lastTouchDistance = getTouchDistance(e.touches);
            e.preventDefault();
        }

        function handleZoomMove(e) {
            if (!isZooming || e.touches.length !== 2) return;
            
            const currentDistance = getTouchDistance(e.touches);
            const scale = currentDistance / lastTouchDistance;
            
            // Appliquer un zoom subtil (optionnel - peut être désactivé si ça interfère)
            if (Math.abs(scale - 1) > 0.1) {
                const currentTransform = canvas.style.transform || 'scale(1)';
                const currentScale = parseFloat(currentTransform.match(/scale\(([\d.]+)\)/)?.[1] || 1);
                const newScale = Math.max(0.5, Math.min(3, currentScale * scale));
                
                canvas.style.transform = `scale(${newScale})`;
                canvas.style.transformOrigin = 'center';
                
                lastTouchDistance = currentDistance;
            }
            
            e.preventDefault();
        }

        function handleZoomEnd() {
            isZooming = false;
        }

        // Ajouter les événements tactiles pour cette page
        pageContainer.addEventListener('touchstart', handleZoomStart, { passive: false });
        pageContainer.addEventListener('touchmove', handleZoomMove, { passive: false });
        pageContainer.addEventListener('touchend', handleZoomEnd, { passive: true });
        pageContainer.addEventListener('touchcancel', handleZoomEnd, { passive: true });

        // Marquer comme amélioré
        pageContainer.dataset.touchEnhanced = 'true';
    }

    /**
     * Optimiser les boutons pour le tactile
     */
    function enhanceButtonsForTouch() {
        // Améliorer tous les boutons avec une meilleure zone tactile
        const buttons = document.querySelectorAll('.btn-tool, .btn-annotation-tool, .btn-nav, .thumbnail-item');
        buttons.forEach(button => {
            // Ajouter un feedback tactile
            button.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.95)';
                this.style.transition = 'transform 0.1s';
            }, { passive: true });
            
            button.addEventListener('touchend', function() {
                this.style.transform = '';
            }, { passive: true });
            
            button.addEventListener('touchcancel', function() {
                this.style.transform = '';
            }, { passive: true });
        });
    }

    /**
     * Corriger le scroll bounce sur iOS
     */
    function fixIOSScrollBounce() {
        if (!isIOS) return;

        const pdfContainer = document.querySelector('.pdf-container');
        if (!pdfContainer) return;

        // Éviter le bounce en limitant le scroll aux bornes
        pdfContainer.addEventListener('scroll', function() {
            const maxScroll = this.scrollHeight - this.clientHeight;
            
            if (this.scrollTop < 0) {
                this.scrollTop = 0;
            } else if (this.scrollTop > maxScroll) {
                this.scrollTop = maxScroll;
            }
        }, { passive: true });
    }

    /**
     * Initialisation principale
     */
    function init() {
        console.log('🚀 Initialisation des améliorations tactiles...');
        
        enhanceTouchScroll();
        enhancePDFPagesTouch();
        enhanceButtonsForTouch();
        fixIOSScrollBounce();
        
        console.log('✅ Améliorations tactiles initialisées');
    }

    // Initialiser quand possible
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Réinitialiser quand le lecteur PDF est ouvert
    window.addEventListener('pdfViewerOpened', init);

})();