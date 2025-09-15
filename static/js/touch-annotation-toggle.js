/**
 * Touch Annotation Toggle - DISABLED
 * Le bouton de toggle a été désactivé, mode stylet seul par défaut
 */

(function() {
    'use strict';

    // Détection des appareils tactiles
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (!isTouchDevice) {
        return;
    }

    /**
     * Configuration par défaut : stylet seul (pas d'annotations doigt)
     */
    function setDefaultStylusMode() {
        // Forcer le mode stylet seul par défaut
        window.forceFingerAnnotations = false;
        
        // Sauvegarder cette préférence
        try {
            localStorage.setItem('fingerAnnotationsEnabled', 'false');
        } catch (e) {
            console.warn('Impossible de sauvegarder la préférence:', e);
        }
    }

    /**
     * Initialisation - Mode stylet seul par défaut
     */
    function init() {
        setDefaultStylusMode();
        console.log('🖊️ Mode stylet seul activé par défaut');
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