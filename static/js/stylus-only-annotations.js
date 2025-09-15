/**
 * Stylus Only Annotations - Performance Optimized
 * Système d'annotation avec stylet uniquement - logs de debug supprimés
 */

(function() {
    'use strict';

    // Détection des appareils tactiles
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (!isTouchDevice) {
        return;
    }

    // Variables globales
    let isDrawingWithStylus = false;
    let currentPath = [];
    let isDragMode = false;

    /**
     * Détermine si une touch provient d'un stylet
     */
    function isStylusTouch(touch) {
        // Force > 0 généralement indique un stylet Apple Pencil
        const hasForce = touch.force && touch.force > 0;
        // Radiustable très faible pour stylet précis
        const hasSmallRadius = touch.radiusX !== undefined && touch.radiusX < 2;
        // Type de touch explicite (Safari iOS récent)
        const isStylusType = touch.touchType === 'stylus';
        
        return hasForce || hasSmallRadius || isStylusType;
    }

    /**
     * Configuration du mode tactile pour les pages
     */
    function setupStylusOnlyForPage(pageWrapper) {
        if (!pageWrapper || pageWrapper.dataset.stylusConfigured) {
            return;
        }

        const pageNum = pageWrapper.id.split('-').pop();
        const annotationCanvas = pageWrapper.querySelector(`#annotation-canvas-${pageNum}`);
        
        if (!annotationCanvas) {
            return;
        }

        // Configuration pour iOS/iPad - autoriser seulement le stylet
        if (isIOS) {
            annotationCanvas.style.touchAction = 'none';
            annotationCanvas.style.pointerEvents = 'auto';
        }

        // Gestionnaires d'événements tactiles
        annotationCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        annotationCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        annotationCanvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        annotationCanvas.addEventListener('touchcancel', handleTouchCancel, { passive: false });

        pageWrapper.dataset.stylusConfigured = 'true';
    }

    /**
     * Gestion du début de touch
     */
    function handleTouchStart(e) {
        if (e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        const isStylus = isStylusTouch(touch);
        
        if (isStylus) {
            isDrawingWithStylus = true;
            currentPath = [];
            e.preventDefault();
        } else {
            // Doigt - autoriser le scroll sur iOS
            isDragMode = true;
        }
    }

    /**
     * Gestion du mouvement de touch
     */
    function handleTouchMove(e) {
        if (e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        const isStylus = isStylusTouch(touch);
        
        if (isStylus && isDrawingWithStylus) {
            e.preventDefault();
            // Logique de dessin...
        }
        // Sinon, laisser le comportement natif de scroll
    }

    /**
     * Gestion de la fin de touch
     */
    function handleTouchEnd(e) {
        if (isDrawingWithStylus) {
            isDrawingWithStylus = false;
            currentPath = [];
        }
        isDragMode = false;
    }

    /**
     * Gestion de l'annulation de touch
     */
    function handleTouchCancel(e) {
        isDrawingWithStylus = false;
        isDragMode = false;
        currentPath = [];
    }

    /**
     * Observer pour les nouvelles pages PDF
     */
    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList && node.classList.contains('pdf-page-wrapper')) {
                            setupStylusOnlyForPage(node);
                        }
                        // Rechercher dans les enfants
                        if (node.querySelectorAll) {
                            node.querySelectorAll('.pdf-page-wrapper').forEach(setupStylusOnlyForPage);
                        }
                    }
                });
            });
        });

        const container = document.getElementById('pdfPagesContainer');
        if (container) {
            observer.observe(container, { childList: true, subtree: true });
        }
    }

    /**
     * Configuration des pages existantes
     */
    function setupExistingPages() {
        const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');
        pageWrappers.forEach(setupStylusOnlyForPage);
    }

    /**
     * Initialisation
     */
    function init() {
        setupObserver();
        setupExistingPages();
    }

    // Démarrage
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Réinitialiser lors du chargement PDF
    window.addEventListener('pdfLoaded', init);
    window.addEventListener('pdfViewerOpened', init);

})();