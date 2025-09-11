/**
 * Toggle Touch Annotations - Permet de basculer les annotations tactiles avec les doigts
 * Utilitaire pour iPad et tablettes
 * 
 * @version 1.0.0
 * @author TeacherPlanner
 */

(function() {
    'use strict';

    // Détection des appareils tactiles
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (!isTouchDevice) {
        return;
    }

    /**
     * Créer le bouton de basculement
     */
    function createToggleButton() {
        // Vérifier si le bouton existe déjà
        if (document.getElementById('finger-annotation-toggle')) {
            return;
        }

        const button = document.createElement('button');
        button.id = 'finger-annotation-toggle';
        button.innerHTML = `
            <span id="toggle-icon">👆</span>
            <span id="toggle-text">Annotations doigt</span>
        `;
        
        // Style du bouton
        button.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border: none;
            border-radius: 25px;
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            min-height: 44px;
            min-width: 44px;
            transition: all 0.2s;
            user-select: none;
            -webkit-user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // État initial
        updateButtonState(button, window.forceFingerAnnotations || false);

        // Événement de clic
        button.addEventListener('click', function() {
            const newState = !window.forceFingerAnnotations;
            window.forceFingerAnnotations = newState;
            updateButtonState(button, newState);
            
            // Afficher notification
            showNotification(newState);
            
            // Sauvegarder la préférence
            try {
                localStorage.setItem('fingerAnnotationsEnabled', newState.toString());
            } catch (e) {
                console.warn('Impossible de sauvegarder la préférence:', e);
            }
        });

        // Ajouter feedback tactile
        button.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.95)';
        }, { passive: true });

        button.addEventListener('touchend', function() {
            this.style.transform = 'scale(1)';
        }, { passive: true });

        document.body.appendChild(button);
    }

    /**
     * Mettre à jour l'état visuel du bouton
     */
    function updateButtonState(button, isEnabled) {
        const icon = button.querySelector('#toggle-icon');
        const text = button.querySelector('#toggle-text');
        
        if (isEnabled) {
            button.style.background = 'rgba(76, 175, 80, 0.9)';
            icon.textContent = '✏️';
            text.textContent = 'Doigt activé';
            button.title = 'Annotations avec les doigts activées. Cliquez pour désactiver.';
        } else {
            button.style.background = 'rgba(0, 0, 0, 0.8)';
            icon.textContent = '👆';
            text.textContent = 'Stylet seul';
            button.title = 'Seul le stylet peut annoter. Cliquez pour permettre les doigts.';
        }
    }

    /**
     * Afficher une notification temporaire
     */
    function showNotification(isEnabled) {
        // Supprimer les notifications existantes
        const existingNotifications = document.querySelectorAll('.finger-annotation-notification');
        existingNotifications.forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = 'finger-annotation-notification';
        notification.textContent = isEnabled ? 
            '✏️ Annotations avec les doigts activées' : 
            '🖊️ Seul le stylet peut annoter';
        
        notification.style.cssText = `
            position: fixed;
            top: 70px;
            right: 10px;
            background: ${isEnabled ? 'rgba(76, 175, 80, 0.95)' : 'rgba(33, 150, 243, 0.95)'};
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            z-index: 10001;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideInFadeOut 3s ease-in-out forwards;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Ajouter l'animation CSS
        if (!document.getElementById('finger-annotation-styles')) {
            const style = document.createElement('style');
            style.id = 'finger-annotation-styles';
            style.textContent = `
                @keyframes slideInFadeOut {
                    0% {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    15% {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    85% {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    100% {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Supprimer la notification après l'animation
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    /**
     * Restaurer la préférence sauvegardée
     */
    function restoreSavedPreference() {
        try {
            const saved = localStorage.getItem('fingerAnnotationsEnabled');
            if (saved !== null) {
                window.forceFingerAnnotations = saved === 'true';
            }
        } catch (e) {
            console.warn('Impossible de restaurer la préférence:', e);
        }
    }

    /**
     * Initialisation
     */
    function init() {
        // Restaurer la préférence
        restoreSavedPreference();
        
        // Créer le bouton
        createToggleButton();
        
        console.log('🔧 Toggle annotations tactiles initialisé');
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