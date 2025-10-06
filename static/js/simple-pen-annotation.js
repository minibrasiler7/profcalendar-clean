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

        // Ajouter les event listeners
        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        this.canvas.addEventListener('pointermove', this.handlePointerMove);
        this.canvas.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('pointercancel', this.handlePointerUp);
        this.canvas.addEventListener('pointerenter', this.handlePointerEnter);
        this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    }

    handlePointerEnter(e) {
        // Détecter quand le stylet survole le canvas et bloquer le scroll
        if (e.pointerType === 'pen') {
            this.canvas.style.touchAction = 'none';
        }
    }

    handlePointerLeave(e) {
        // Quand le stylet quitte le canvas, réactiver le scroll pour les doigts
        if (e.pointerType === 'pen' && !this.isDrawing) {
            this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        }
    }

    handlePointerDown(e) {
        if (!this.isEnabled) return;

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

        // Redessiner
        this.redraw();
    }

    handlePointerUp(e) {
        if (!this.isDrawing) return;

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
    }

    redraw() {
        // Effacer le canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Redessiner tous les strokes sauvegardés
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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

    enable() {
        this.isEnabled = true;
        this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
    }

    disable() {
        this.isEnabled = false;
        this.isDrawing = false;
        this.canvas.style.touchAction = this.originalTouchAction || 'auto';
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
        this.canvas.removeEventListener('pointermove', this.handlePointerMove);
        this.canvas.removeEventListener('pointerup', this.handlePointerUp);
        this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
        this.canvas.removeEventListener('pointerenter', this.handlePointerEnter);
        this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);

        // Restaurer les styles originaux
        this.canvas.style.touchAction = this.originalTouchAction;
        this.canvas.style.userSelect = this.originalUserSelect;
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.SimplePenAnnotation = SimplePenAnnotation;
}
