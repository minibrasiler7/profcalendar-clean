/**
 * OptimizedPenAnnotation - Système d'annotation haute performance pour iPad
 * Inspiré de PencilKit iOS avec optimisations web
 *
 * @version 3.0.0
 * @author TeacherPlanner
 *
 * Caractéristiques:
 * - Double buffering pour éviter les redraws complets
 * - getCoalescedEvents() pour capturer tous les points Apple Pencil (240Hz)
 * - Interpolation Catmull-Rom pour des courbes lisses
 * - Canvas desynchronized pour réduire la latence
 * - Gestion vectorielle pure sans dégradation raster
 * - Détection intelligente stylet/doigt/pinch-zoom
 */

'use strict';

class OptimizedPenAnnotation {
    constructor(canvas, options = {}) {
        this.canvas = canvas;

        // CRITIQUE: Utiliser desynchronized pour réduire la latence de rendu
        // Permet au canvas de se mettre à jour sans attendre le vsync
        this.ctx = canvas.getContext('2d', {
            desynchronized: true,
            willReadFrequently: false,  // On ne lit pas souvent le canvas
            alpha: true
        });

        // Activer l'antialiasing pour des traits lisses
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        // DEBUG: Vérifier la résolution du canvas
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = canvas.offsetWidth;
        const cssHeight = canvas.offsetHeight;
        console.log(`🔍 CANVAS INIT: DPR=${dpr}, Canvas physique=${canvas.width}x${canvas.height}, CSS=${cssWidth}x${cssHeight}, Ratio=${(canvas.width/cssWidth).toFixed(2)}`);

        // Configuration
        this.options = {
            size: options.size || 2,
            color: options.color || '#000000',
            smoothing: options.smoothing !== undefined ? options.smoothing : 0.5,
            minDistance: options.minDistance || 1, // Distance minimale entre points
            ...options
        };

        // Callback pour notifier les événements
        this.onPinchZoom = options.onPinchZoom || null;
        this.onStrokeComplete = options.onStrokeComplete || null;

        // État du dessin
        this.isDrawing = false;
        this.isEnabled = true;
        this.currentStroke = null;
        this.strokes = [];

        // État pinch-to-zoom
        this.isPinching = false;
        this.pinchTimeout = null;
        this.lastTouchCount = 0;

        // OPTIMISATION: Double buffering
        // Canvas offscreen pour dessiner le stroke en cours
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = canvas.width;
        this.offscreenCanvas.height = canvas.height;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
            desynchronized: true,
            willReadFrequently: false,
            alpha: true
        });

        // Activer l'antialiasing pour l'offscreen canvas aussi
        this.offscreenCtx.imageSmoothingEnabled = true;
        this.offscreenCtx.imageSmoothingQuality = 'high';

        // Canvas de base avec tous les strokes complétés
        this.baseLayer = null; // ImageData sauvegardée des strokes complétés

        // OPTIMISATION: Dirty flag pour requestAnimationFrame
        this.needsRedraw = false;
        this.animationFrameId = null;

        // Interpolation des courbes
        this.tension = 0.5; // Tension pour Catmull-Rom (0 = linéaire, 0.5 = courbe douce)

        // Sauvegarder les styles CSS originaux
        this.originalTouchAction = this.canvas.style.touchAction;

        // IMPORTANT: Par défaut, permettre scroll/zoom avec les doigts
        this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        this.canvas.style.userSelect = 'none';
        this.canvas.style.webkitUserSelect = 'none';
        this.canvas.style.webkitTouchCallout = 'none';

        // Bind event handlers
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handlePointerCancel = this.handlePointerCancel.bind(this);
        this.handlePointerEnter = this.handlePointerEnter.bind(this);
        this.handlePointerLeave = this.handlePointerLeave.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.render = this.render.bind(this);

        // Ajouter les event listeners
        this.canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
        this.canvas.addEventListener('pointermove', this.handlePointerMove, { passive: false });
        this.canvas.addEventListener('pointerup', this.handlePointerUp, { passive: false });
        this.canvas.addEventListener('pointercancel', this.handlePointerCancel, { passive: false });
        this.canvas.addEventListener('pointerenter', this.handlePointerEnter, { passive: false });
        this.canvas.addEventListener('pointerleave', this.handlePointerLeave);

        // Touch events pour détecter le pinch
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });

        // Démarrer la boucle de rendu
        this.startRenderLoop();
    }

    /**
     * Détection du stylet à l'entrée sur le canvas
     */
    handlePointerEnter(e) {
        if (e.pointerType === 'pen') {
            e.preventDefault();
            e.stopPropagation();
            this.canvas.style.touchAction = 'none';
        } else if (e.pointerType === 'touch') {
            this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        }
    }

    /**
     * Réactivation du scroll quand le stylet quitte le canvas
     */
    handlePointerLeave(e) {
        if (e.pointerType === 'pen' && !this.isDrawing) {
            this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        }
    }

    /**
     * Détection du pinch-to-zoom (2+ doigts)
     */
    handleTouchStart(e) {
        this.lastTouchCount = e.touches.length;

        if (e.touches.length >= 2) {
            this.isPinching = true;

            // Annuler le dessin en cours si on commence un pinch
            if (this.isDrawing) {
                this.cancelCurrentStroke();
            }
            return;
        }

        // Bloquer touch si c'est un stylet
        const touch = e.touches[0];
        const isStylus = touch && touch.touchType === 'stylus';

        if (isStylus || this.canvas.style.touchAction === 'none') {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    /**
     * Fin du pinch-to-zoom
     */
    handleTouchEnd(e) {
        if (this.isPinching && e.touches.length < 2) {
            this.isPinching = false;

            // Attendre que le zoom CSS soit appliqué SANS bloquer les interactions
            // Réduire le timeout pour permettre au dessin de reprendre rapidement
            clearTimeout(this.pinchTimeout);
            this.pinchTimeout = setTimeout(() => {
                if (this.onPinchZoom) {
                    this.onPinchZoom();
                }
            }, 100); // Réduit de 500ms à 100ms pour éviter les gaps
        }

        this.lastTouchCount = e.touches.length;
    }

    /**
     * Début du dessin
     */
    handlePointerDown(e) {
        if (!this.isEnabled || this.isPinching) {
            return;
        }

        const isStylus = e.pointerType === 'pen';
        const isMouse = e.pointerType === 'mouse';
        const isFinger = e.pointerType === 'touch';

        // Ignorer les doigts - laisser le scroll/zoom natif
        if (isFinger) {
            return;
        }

        // Accepter seulement stylet ou souris
        if (!isStylus && !isMouse) {
            return;
        }

        // Bloquer le scroll pour le dessin
        this.canvas.style.touchAction = 'none';
        e.preventDefault();
        e.stopPropagation();

        // Capturer le pointeur
        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (err) {
            // Silently fail
        }

        this.isDrawing = true;

        // Initialiser un nouveau stroke
        this.currentStroke = {
            points: [],
            options: { ...this.options },
            timestamp: Date.now()
        };

        // Ajouter le premier point
        const point = {
            x: e.offsetX,
            y: e.offsetY,
            pressure: e.pressure || 0.5,
            timestamp: performance.now()
        };

        this.currentStroke.points.push(point);
        this.needsRedraw = true;
    }

    /**
     * Mouvement pendant le dessin - CRITIQUE pour la performance
     */
    handlePointerMove(e) {
        if (!this.isDrawing) return;
        if (e.buttons !== 1) return;

        e.preventDefault();
        e.stopPropagation();

        // OPTIMISATION: getCoalescedEvents() pour capturer tous les points
        // Sur iPad Pro avec Apple Pencil, cela donne jusqu'à 240Hz
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];

        // DEBUG: Vérifier si on reçoit bien tous les événements
        const now = performance.now();
        const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
        const timeSinceLastPoint = lastPoint ? (now - lastPoint.timestamp) : 0;

        if (timeSinceLastPoint > 50) {
            console.warn(`⚠️ GAP détecté: ${timeSinceLastPoint.toFixed(0)}ms entre événements, ${events.length} événements coalesced`);

            // Si gap > 100ms, c'est probablement un décrochage système
            // Créer un nouveau stroke pour éviter la ligne de rattrapage
            if (timeSinceLastPoint > 100 && this.currentStroke.points.length > 2) {
                console.log('🔄 Création d\'un nouveau stroke pour éviter la ligne de rattrapage');

                // Sauvegarder le stroke actuel
                this.strokes.push(this.currentStroke);
                if (this.onStrokeComplete) {
                    this.onStrokeComplete(this.currentStroke);
                }
                this.commitCurrentStroke();

                // Démarrer un nouveau stroke au premier point du gap
                const firstEvent = events[0];
                this.currentStroke = {
                    points: [{
                        x: firstEvent.offsetX,
                        y: firstEvent.offsetY,
                        pressure: firstEvent.pressure || 0.5,
                        timestamp: performance.now()
                    }],
                    options: { ...this.options },
                    timestamp: Date.now()
                };
            }
        }

        let pointsAdded = 0;

        for (const event of events) {
            const x = event.offsetX;
            const y = event.offsetY;

            // Toujours ajouter les points pour éviter les décrochages
            // Ne plus filtrer par distance pour garantir un trait continu
            const point = {
                x: x,
                y: y,
                pressure: event.pressure || 0.5,
                timestamp: performance.now()
            };

            this.currentStroke.points.push(point);
            pointsAdded++;
        }

        if (pointsAdded > 0) {
            this.needsRedraw = true;
        }
    }

    /**
     * Fin du dessin
     */
    handlePointerUp(e) {
        if (!this.isDrawing) return;

        e.preventDefault();
        e.stopPropagation();

        // Libérer la capture
        try {
            this.canvas.releasePointerCapture(e.pointerId);
        } catch (err) {
            // Silently fail
        }

        this.isDrawing = false;

        // Réactiver le scroll/zoom
        this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';

        // Sauvegarder le stroke complété
        if (this.currentStroke && this.currentStroke.points.length > 1) {
            this.strokes.push(this.currentStroke);

            // Notifier la complétion du stroke
            if (this.onStrokeComplete) {
                this.onStrokeComplete(this.currentStroke);
            }

            // Rendre le stroke final sur la base layer
            this.commitCurrentStroke();
        }

        this.currentStroke = null;
        this.needsRedraw = true;
    }

    /**
     * Annulation du dessin (appel entrant, etc.)
     */
    handlePointerCancel(e) {
        if (!this.isDrawing) return;

        this.cancelCurrentStroke();
    }

    /**
     * Annule le stroke en cours
     */
    cancelCurrentStroke() {
        this.isDrawing = false;
        this.currentStroke = null;
        this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
        this.needsRedraw = true;
    }

    /**
     * OPTIMISATION: Boucle de rendu avec requestAnimationFrame
     * Ne redessine que si nécessaire (dirty flag)
     */
    startRenderLoop() {
        const loop = () => {
            if (this.needsRedraw) {
                this.render();
                this.needsRedraw = false;
            }
            this.animationFrameId = requestAnimationFrame(loop);
        };
        loop();
    }

    /**
     * Arrête la boucle de rendu
     */
    stopRenderLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * CRITIQUE: Rendu optimisé avec double buffering
     * - Restaure la base layer (tous les strokes complétés)
     * - Dessine le stroke en cours sur offscreen canvas
     * - Composite le tout sur le canvas principal
     */
    render() {
        // Effacer le canvas principal
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Restaurer la base layer (strokes complétés)
        if (this.baseLayer) {
            this.ctx.putImageData(this.baseLayer, 0, 0);
        }

        // Dessiner le stroke en cours si on est en train de dessiner
        if (this.isDrawing && this.currentStroke && this.currentStroke.points.length > 1) {
            // Dessiner sur l'offscreen canvas
            this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
            this.drawStroke(this.offscreenCtx, this.currentStroke);

            // Copier sur le canvas principal
            this.ctx.drawImage(this.offscreenCanvas, 0, 0);
        }
    }

    /**
     * Commit le stroke en cours dans la base layer
     */
    commitCurrentStroke() {
        if (!this.currentStroke) return;

        // Dessiner le stroke sur le canvas principal
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Restaurer la base layer
        if (this.baseLayer) {
            this.ctx.putImageData(this.baseLayer, 0, 0);
        }

        // Dessiner le nouveau stroke
        this.drawStroke(this.ctx, this.currentStroke);

        // Sauvegarder la nouvelle base layer
        try {
            this.baseLayer = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        } catch (e) {
            console.error('Erreur sauvegarde base layer:', e);
        }
    }

    /**
     * CRITIQUE: Dessine un stroke uniforme comme l'app Fichiers d'iPad
     * Trait lisse, opaque, sans variation de pression
     */
    drawStroke(ctx, stroke) {
        if (!stroke || !stroke.points || stroke.points.length < 2) return;

        const points = stroke.points;
        const options = stroke.options;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = options.color;
        ctx.globalAlpha = 1.0; // IMPORTANT: Opacité toujours à 100%

        // IMPORTANT: Multiplier la taille par DPR pour compenser la résolution Retina
        // Le canvas physique est 2x plus grand, donc les traits doivent être 2x plus épais
        const dpr = window.devicePixelRatio || 1;
        const effectiveSize = options.size * dpr;
        ctx.lineWidth = effectiveSize;

        // Dessiner des cercles aux points pour garantir la continuité visuelle
        for (let i = 0; i < points.length; i++) {
            ctx.beginPath();
            ctx.arc(points[i].x, points[i].y, effectiveSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Dessiner les traits entre les points
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        if (points.length === 2) {
            // Ligne simple pour 2 points
            ctx.lineTo(points[1].x, points[1].y);
        } else {
            // Courbes quadratiques pour lissage (comme iOS)
            for (let i = 1; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];

                // Point de contrôle = point actuel
                // Point d'arrivée = milieu entre actuel et suivant
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;

                ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
            }

            // Dernier segment jusqu'au dernier point
            const lastPoint = points[points.length - 1];
            ctx.lineTo(lastPoint.x, lastPoint.y);
        }

        ctx.stroke();
        ctx.restore();
    }

    /**
     * Redessine tous les strokes depuis le début
     * Utilisé après undo, clear, ou changement de résolution
     */
    redrawAll() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Redessiner tous les strokes
        for (const stroke of this.strokes) {
            this.drawStroke(this.ctx, stroke);
        }

        // Sauvegarder la nouvelle base layer
        try {
            this.baseLayer = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        } catch (e) {
            console.error('Erreur redrawAll:', e);
        }

        this.needsRedraw = true;
    }

    /**
     * Undo - retire le dernier stroke
     */
    undo() {
        if (this.strokes.length === 0) return false;

        this.strokes.pop();
        this.redrawAll();

        return true;
    }

    /**
     * Clear - efface tous les strokes
     */
    clear() {
        this.strokes = [];
        this.baseLayer = null;
        this.currentStroke = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.needsRedraw = true;
    }

    /**
     * Exporte les strokes pour sauvegarde
     * Format compatible avec l'ancien système: [[x, y, pressure], ...]
     */
    exportStrokes() {
        return {
            version: '3.0.0',
            strokes: this.strokes.map(stroke => ({
                points: stroke.points.map(p => [p.x, p.y, p.pressure]),
                options: stroke.options,
                timestamp: stroke.timestamp
            }))
        };
    }

    /**
     * Exporte les strokes originaux (alias pour compatibilité)
     */
    exportOriginalStrokes() {
        return this.exportStrokes();
    }

    /**
     * Importe des strokes depuis une sauvegarde
     * Compatible avec l'ancien format [[x, y, pressure], ...] et le nouveau {x, y, pressure, timestamp}
     */
    importStrokes(data, preserveOriginals = false) {
        if (!data || !Array.isArray(data.strokes)) {
            return;
        }

        this.strokes = data.strokes.map(stroke => {
            // Normaliser les points pour supporter les deux formats
            let normalizedPoints;

            if (stroke.points.length > 0) {
                const firstPoint = stroke.points[0];

                // Ancien format: [x, y, pressure]
                if (Array.isArray(firstPoint)) {
                    normalizedPoints = stroke.points.map(p => ({
                        x: p[0],
                        y: p[1],
                        pressure: p[2] || 0.5,
                        timestamp: 0
                    }));
                }
                // Nouveau format: {x, y, pressure, timestamp}
                else if (typeof firstPoint === 'object') {
                    normalizedPoints = stroke.points.map(p => ({
                        x: p.x,
                        y: p.y,
                        pressure: p.pressure || 0.5,
                        timestamp: p.timestamp || 0
                    }));
                } else {
                    normalizedPoints = [];
                }
            } else {
                normalizedPoints = [];
            }

            return {
                points: normalizedPoints,
                options: stroke.options || { ...this.options },
                timestamp: stroke.timestamp || Date.now()
            };
        });

        this.redrawAll();
    }

    /**
     * Met à jour les options de dessin
     */
    updateOptions(newOptions) {
        Object.assign(this.options, newOptions);
    }

    /**
     * Active le système d'annotation
     */
    enable() {
        this.isEnabled = true;
        this.canvas.style.touchAction = 'pan-x pan-y pinch-zoom';
    }

    /**
     * Désactive le système d'annotation
     */
    disable() {
        this.isEnabled = false;
        this.isDrawing = false;
        this.currentStroke = null;
        this.canvas.style.touchAction = this.originalTouchAction || 'auto';
    }

    /**
     * Redimensionne les canvas après un zoom
     */
    resize(width, height) {
        const oldWidth = this.canvas.width;
        const oldHeight = this.canvas.height;

        if (oldWidth === 0 || oldHeight === 0) {
            return;
        }

        // DEBUG: Vérifier le redimensionnement
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = this.canvas.offsetWidth;
        const cssHeight = this.canvas.offsetHeight;
        console.log(`📐 RESIZE: ${oldWidth}x${oldHeight} → ${width}x${height}, CSS=${cssWidth}x${cssHeight}, DPR=${dpr}, Ratio nouveau=${(width/cssWidth).toFixed(2)}`);

        // Redimensionner les canvas
        this.canvas.width = width;
        this.canvas.height = height;
        this.offscreenCanvas.width = width;
        this.offscreenCanvas.height = height;

        // Recalculer les coordonnées des strokes
        const scaleX = width / oldWidth;
        const scaleY = height / oldHeight;

        console.log(`📐 Scaling points: x${scaleX.toFixed(3)}, y${scaleY.toFixed(3)}`);

        for (const stroke of this.strokes) {
            for (const point of stroke.points) {
                point.x *= scaleX;
                point.y *= scaleY;
            }
        }

        this.redrawAll();
    }

    /**
     * Nettoie et détruit l'instance
     */
    destroy() {
        // Arrêter la boucle de rendu
        this.stopRenderLoop();

        // Retirer les event listeners
        this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
        this.canvas.removeEventListener('pointermove', this.handlePointerMove);
        this.canvas.removeEventListener('pointerup', this.handlePointerUp);
        this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
        this.canvas.removeEventListener('pointerenter', this.handlePointerEnter);
        this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);

        // Restaurer les styles originaux
        this.canvas.style.touchAction = this.originalTouchAction;

        // Nettoyer les ressources
        this.strokes = [];
        this.baseLayer = null;
        this.currentStroke = null;
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.OptimizedPenAnnotation = OptimizedPenAnnotation;
}
