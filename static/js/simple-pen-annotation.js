/**
 * Simple Pen Annotation System
 * Based on official perfect-freehand example
 * https://github.com/steveruizok/perfect-freehand
 */

'use strict';

class SimplePenAnnotation {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Options perfect-freehand
        this.options = {
            size: options.size || 4,
            thinning: options.thinning !== undefined ? options.thinning : 0.5,
            smoothing: options.smoothing !== undefined ? options.smoothing : 0.5,
            streamline: options.streamline !== undefined ? options.streamline : 0.5,
            easing: options.easing || (t => t),
            start: options.start || { taper: 0, cap: true },
            end: options.end || { taper: 0, cap: true },
            simulatePressure: options.simulatePressure !== false,
            color: options.color || '#000000',
            opacity: options.opacity || 1.0
        };

        // État du dessin
        this.isDrawing = false;
        this.isEnabled = true;
        this.currentPoints = [];
        this.strokes = []; // Historique de tous les strokes
        this.pointerId = null;

        // IMPORTANT: Initialiser backgroundImageData mais NE PAS sauvegarder automatiquement
        // Le background sera sauvegardé manuellement après le chargement des annotations
        // pour éviter de sauvegarder un canvas vide
        this.backgroundImageData = null;
        // this.saveBackground(); // DÉSACTIVÉ - sera appelé manuellement après le chargement

        // OPTIMISATION: Throttle pour limiter les redraws pendant le dessin
        this.lastRedrawTime = 0;
        this.redrawThrottle = 16; // ~60fps max

        // Sauvegarder les styles CSS originaux
        this.originalTouchAction = this.canvas.style.touchAction;
        this.originalUserSelect = this.canvas.style.userSelect;

        // IMPORTANT: Par défaut, permettre le scroll/zoom avec les doigts
        this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        this.canvas.style.userSelect = 'none';
        this.canvas.style.webkitUserSelect = 'none';
        this.canvas.style.msUserSelect = 'none';

        // Bind event handlers
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handlePointerEnter = this.handlePointerEnter.bind(this);
        this.handlePointerLeave = this.handlePointerLeave.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);

        // Ajouter les event listeners
        // IMPORTANT: passive: false pour pouvoir appeler preventDefault()
        this.canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
        this.canvas.addEventListener('pointermove', this.handlePointerMove, { passive: false });
        this.canvas.addEventListener('pointerup', this.handlePointerUp, { passive: false });
        this.canvas.addEventListener('pointercancel', this.handlePointerUp, { passive: false });
        this.canvas.addEventListener('pointerenter', this.handlePointerEnter, { passive: false });
        this.canvas.addEventListener('pointerleave', this.handlePointerLeave);

        // CRITIQUE: Bloquer aussi les événements touch natifs pour le stylet
        // Safari génère parfois des événements touch même pour le stylet
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    }

    handleTouchStart(e) {
        // Bloquer touchstart si c'est un stylet (détecté par touchType stylus)
        const touch = e.touches[0];
        const isStylus = touch && touch.touchType === 'stylus';

        if (isStylus || this.canvas.style.touchAction === 'none') {
            // Stylet ou touchAction déjà à none (stylet détecté précédemment)
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    handleTouchMove(e) {
        // Toujours bloquer touchmove si touchAction est none (stylet actif)
        if (this.canvas.style.touchAction === 'none' || this.isDrawing) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    handlePointerEnter(e) {
        // Détecter quand le stylet survole le canvas et bloquer le scroll
        if (e.pointerType === 'pen') {
            // CRITIQUE: Appeler preventDefault() immédiatement pour bloquer le scroll
            // Ne pas attendre que touch-action CSS soit appliqué (trop lent)
            e.preventDefault();
            e.stopPropagation();
            this.canvas.style.touchAction = 'none';
        } else if (e.pointerType === 'touch') {
            // IMPORTANT: Un doigt entre - s'assurer que le scroll est activé
            // (peut arriver si le stylet a laissé touchAction: none)
            this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        }
    }

    handlePointerLeave(e) {
        // Quand le stylet quitte le canvas, réactiver le scroll pour les doigts
        if (e.pointerType === 'pen') {
            if (!this.isDrawing) {
                this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
            }
        }
    }

    handlePointerDown(e) {
        if (!this.isEnabled) {
            return;
        }

        const isStylus = e.pointerType === 'pen';
        const isMouse = e.pointerType === 'mouse';
        const isFinger = e.pointerType === 'touch';

        if (isFinger) {
            // Doigt détecté - ne rien faire, laisser le scroll/zoom natif
            return;
        }

        if (!isStylus && !isMouse) {
            // Type de pointeur inconnu - ignorer
            return;
        }

        // Stylet ou souris - bloquer le scroll et dessiner
        this.canvas.style.touchAction = 'none';

        // IMPORTANT: Empêcher le comportement par défaut ET la propagation
        e.preventDefault();
        e.stopPropagation();

        // CRITIQUE: Capturer le pointeur pour recevoir tous les événements
        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (err) {
            // Silently fail
        }

        this.isDrawing = true;
        this.pointerId = e.pointerId;

        // Coordonnées relatives au canvas
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Initialiser avec le premier point
        this.currentPoints = [[x, y, e.pressure || 0.5]];
    }

    handlePointerMove(e) {
        if (!this.isDrawing) return;
        if (e.buttons !== 1) return; // Seulement si le bouton est enfoncé

        // IMPORTANT: Empêcher le comportement par défaut ET la propagation
        e.preventDefault();
        e.stopPropagation();

        // Coordonnées relatives au canvas
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Ajouter le point
        this.currentPoints.push([x, y, e.pressure || 0.5]);

        // OPTIMISATION: Throttle redraws à ~60fps pour éviter la dégradation de performance
        // Cela limite le nombre de redraws complets tout en collectant tous les points
        const now = Date.now();
        if (now - this.lastRedrawTime > this.redrawThrottle) {
            this.redraw();
            this.lastRedrawTime = now;
        }
    }

    handlePointerUp(e) {
        if (!this.isDrawing) {
            return;
        }

        // IMPORTANT: Empêcher le comportement par défaut ET la propagation
        e.preventDefault();
        e.stopPropagation();

        // Libérer la capture du pointeur
        try {
            this.canvas.releasePointerCapture(e.pointerId);
        } catch (err) {
            // Silently fail
        }

        this.isDrawing = false;
        this.pointerId = null;

        // Réactiver le scroll/zoom après le dessin
        this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';

        // Sauvegarder le stroke complet
        if (this.currentPoints.length > 0) {
            this.strokes.push({
                points: this.currentPoints.slice(),
                options: { ...this.options }
            });
        }

        this.currentPoints = [];
        this.redraw();

        // Mettre à jour le background pour inclure le nouveau stroke
        this.saveBackground();
    }

    saveBackground() {
        // Sauvegarder l'état actuel du canvas (annotations des autres outils)
        try {
            this.backgroundImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        } catch (e) {
            console.error('Erreur lors de la sauvegarde du background:', e);
        }
    }

    redraw() {
        // IMPORTANT: Effacer le canvas et restaurer le background
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Restaurer le background (annotations des autres outils)
        if (this.backgroundImageData) {
            this.ctx.putImageData(this.backgroundImageData, 0, 0);
        }

        // Redessiner tous les strokes sauvegardés de SimplePenAnnotation
        this.strokes.forEach(strokeData => {
            this.drawStroke(strokeData.points, strokeData.options);
        });

        // Dessiner le stroke en cours
        if (this.isDrawing && this.currentPoints.length > 0) {
            this.drawStroke(this.currentPoints, this.options);
        }
    }

    drawStroke(points, options) {
        if (!points || points.length === 0) return;
        if (typeof window.getStroke === 'undefined') {
            console.error('perfect-freehand (getStroke) non disponible');
            return;
        }

        // Obtenir le polygone du stroke
        const stroke = window.getStroke(points, {
            size: options.size,
            thinning: options.thinning,
            smoothing: options.smoothing,
            streamline: options.streamline,
            easing: options.easing,
            start: options.start,
            end: options.end,
            simulatePressure: options.simulatePressure
        });

        if (!stroke || stroke.length < 3) return;

        // Dessiner le polygone
        this.ctx.save();
        this.ctx.fillStyle = options.color;
        this.ctx.globalAlpha = options.opacity;

        this.ctx.beginPath();
        this.ctx.moveTo(stroke[0][0], stroke[0][1]);
        for (let i = 1; i < stroke.length; i++) {
            this.ctx.lineTo(stroke[i][0], stroke[i][1]);
        }
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
    }

    // Méthodes utilitaires
    clear() {
        this.strokes = [];
        this.currentPoints = [];
        // Effacer tout le canvas (y compris les annotations des autres outils)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    clearStrokes() {
        // Effacer seulement les strokes de SimplePenAnnotation, pas le canvas
        // Utilisé après un undo/redo pour éviter que les strokes réapparaissent
        this.strokes = [];
        this.currentPoints = [];
    }

    undo() {
        if (this.strokes.length > 0) {
            this.strokes.pop();
            this.redraw();
            return true;
        }
        return false;
    }

    updateOptions(newOptions) {
        Object.assign(this.options, newOptions);
    }

    /**
     * Exporte les strokes vectoriels pour sauvegarde
     */
    exportStrokes() {
        return {
            strokes: this.strokes.map(stroke => ({
                points: stroke.points,
                options: stroke.options
            }))
        };
    }

    /**
     * Importe des strokes vectoriels et les redessine
     */
    importStrokes(data) {
        if (data && Array.isArray(data.strokes)) {
            this.strokes = data.strokes.map(stroke => ({
                points: stroke.points,
                options: stroke.options
            }));
            this.redraw();
        }
    }

    enable() {
        this.isEnabled = true;
        this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        // Sauvegarder le background actuel pour préserver les autres annotations
        this.saveBackground();
    }

    disable() {
        this.isEnabled = false;
        this.isDrawing = false;
        this.canvas.style.touchAction = this.originalTouchAction || 'auto';
        // Sauvegarder à nouveau pour capturer les nouveaux strokes au background
        this.saveBackground();
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
        this.canvas.removeEventListener('pointermove', this.handlePointerMove);
        this.canvas.removeEventListener('pointerup', this.handlePointerUp);
        this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
        this.canvas.removeEventListener('pointerenter', this.handlePointerEnter);
        this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);

        // Restaurer les styles originaux
        this.canvas.style.touchAction = this.originalTouchAction;
        this.canvas.style.userSelect = this.originalUserSelect;
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.SimplePenAnnotation = SimplePenAnnotation;
}
