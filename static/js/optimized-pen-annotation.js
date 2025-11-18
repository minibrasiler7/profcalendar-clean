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
 * - Global RenderManager pour éviter les throttles Safari iOS
 */

'use strict';

/**
 * GLOBAL RENDER MANAGER
 *
 * Safari iOS throttle sévèrement les multiples requestAnimationFrame loops.
 * Avec 32 PDF pages = 32 loops séparés → premier render delayed de 500-3800ms
 *
 * Solution: UN SEUL loop global qui render tous les canvas "dirty"
 */
class GlobalRenderManager {
    constructor() {
        this.instances = new Set();
        this.animationFrameId = null;
        this.isRunning = false;
        this._renderCounter = 0;
        this._lastLogTime = 0;
    }

    /**
     * Enregistre une instance OptimizedPenAnnotation
     */
    register(instance) {
        this.instances.add(instance);

        // Démarrer la boucle si pas encore démarrée
        if (!this.isRunning) {
            this.start();
        }
    }

    /**
     * Désenregistre une instance
     */
    unregister(instance) {
        this.instances.delete(instance);

        // Arrêter la boucle si plus d'instances
        if (this.instances.size === 0 && this.isRunning) {
            this.stop();
        }
    }

    /**
     * Démarre la boucle de rendu globale
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;

        const loop = () => {
            this._renderCounter++;
            const now = performance.now();

            // Render toutes les instances qui ont needsRedraw = true
            for (const instance of this.instances) {
                if (instance.needsRedraw) {
                    instance.render();
                    instance.needsRedraw = false;
                }
            }

            this.animationFrameId = requestAnimationFrame(loop);
        };

        loop();
    }

    /**
     * Arrête la boucle de rendu globale
     */
    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
}

// Instance singleton globale
const globalRenderManager = new GlobalRenderManager();

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

        // IMPORTANT: touch-action: none est maintenant défini dans le CSS
        // Cela DOIT être dans le CSS pour éviter les blocages iOS
        // (Safari bloque pointermove si touch-action est changé dynamiquement)

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

        // Enregistrer auprès du gestionnaire de rendu global au lieu de démarrer une boucle individuelle
        globalRenderManager.register(this);
    }

    /**
     * Détection du stylet à l'entrée sur le canvas
     */
    handlePointerEnter(e) {
        if (e.pointerType === 'pen') {
            e.preventDefault();
            e.stopPropagation();
        }
        // Ne plus changer touchAction dynamiquement pour éviter les blocages iOS
    }

    /**
     * Réactivation du scroll quand le stylet quitte le canvas
     */
    handlePointerLeave(e) {
        // Ne plus changer touchAction dynamiquement pour éviter les blocages iOS
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

        // touchAction est déjà à 'none' en permanence
        e.preventDefault();
        e.stopPropagation();

        // Capturer le pointeur
        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (err) {
            // Silently fail
        }

        this.isDrawing = true;
        this._isNewStroke = true; // Flag pour ignorer le gap warning au premier render

        // IMPORTANT: Sauvegarder l'état du canvas avant de commencer le stroke
        // pour pouvoir le restaurer à chaque frame pendant le dessin
        try {
            this.canvasStateBeforeStroke = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        } catch (e) {
            console.error('[OptimizedPen] Erreur sauvegarde canvas:', e);
            this.canvasStateBeforeStroke = null;
        }

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
        if (!this.isDrawing) {
            return;
        }
        if (e.buttons !== 1) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        // OPTIMISATION: getCoalescedEvents() pour capturer tous les points
        // Sur iPad Pro avec Apple Pencil, cela donne jusqu'à 240Hz
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];

        // LIMITATION CONNUE: Safari iOS throttle les événements pointermove
        // Il peut y avoir des gaps de 500-1000ms où aucun événement n'est reçu
        // C'est une limitation du moteur de rendu Safari, pas un bug de notre code
        // Interpoler les points si gap > 100ms et distance significative
        const now = performance.now();
        const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
        const timeSinceLastPoint = lastPoint ? (now - lastPoint.timestamp) : 0;

        // SUPPRIMÉ: L'interpolation linéaire créait des lignes droites visibles dans les courbes
        // Les courbes quadratiques dans drawStroke() gèrent naturellement les gaps
        // sans créer d'artefacts visuels

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

            // CRITIQUE: Render ultra-minimal pour "warm up" le canvas
            // Safari iOS bloque le canvas rendering, donc on fait un simple point
            if (!this._needsRedrawLogged) {
                this._needsRedrawLogged = true;
                const firstPoint = this.currentStroke.points[0];
                if (firstPoint) {
                    this.ctx.fillStyle = this.currentStroke.options.color;
                    const dpr = window.devicePixelRatio || 1;
                    const size = this.currentStroke.options.size * dpr;
                    this.ctx.beginPath();
                    this.ctx.arc(firstPoint.x, firstPoint.y, size / 2, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }
    }

    /**
     * Fin du dessin
     */
    handlePointerUp(e) {
        if (!this.isDrawing) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Libérer la capture
        try {
            this.canvas.releasePointerCapture(e.pointerId);
        } catch (err) {
            // Silently fail
        }

        this.isDrawing = false;

        // Reset render counter and flags
        this._renderCounter = 0;
        this._lastRenderTime = null;
        this._needsRedrawLogged = false;
        this.canvasStateBeforeStroke = null; // Libérer la mémoire

        // touchAction reste à 'none' en permanence

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
        // touchAction reste à 'none' en permanence
        this.needsRedraw = true;
    }

    /**
     * SUPPRIMÉ: startRenderLoop() et stopRenderLoop()
     * La gestion du rendu est maintenant assurée par le GlobalRenderManager
     * Cela évite d'avoir 32 requestAnimationFrame loops qui saturent Safari iOS
     */

    /**
     * CRITIQUE: Rendu optimisé avec double buffering
     * - Restaure la base layer (tous les strokes complétés)
     * - Dessine le stroke en cours sur offscreen canvas
     * - Composite le tout sur le canvas principal
     */
    render() {
        if (!this._renderCounter) this._renderCounter = 0;
        this._renderCounter++;

        const now = performance.now();
        if (this._lastRenderTime) {
            // Clear le flag après le premier render
            if (this._isNewStroke) {
                this._isNewStroke = false;
            }
        }
        this._lastRenderTime = now;

        // IMPORTANT: Ne PAS effacer le canvas principal car il contient aussi
        // les annotations des autres outils (highlighter, formes, texte).
        //
        // Stratégie: Sauvegarder le canvas avant le premier point, puis restaurer
        // à chaque frame pour redessiner le stroke en cours sans perdre le reste.

        // Dessiner le stroke en cours si on est en train de dessiner
        if (this.isDrawing && this.currentStroke && this.currentStroke.points.length > 1) {
            // Restaurer l'état du canvas avant ce stroke (sauvegardé dans handlePointerDown)
            if (this.canvasStateBeforeStroke) {
                this.ctx.putImageData(this.canvasStateBeforeStroke, 0, 0);
            }

            // Dessiner le stroke en cours directement sur le canvas principal
            this.drawStroke(this.ctx, this.currentStroke);
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
     * CRITIQUE: Dessine un stroke avec perfect-freehand
     * Utilise le même algorithme que le site de référence
     */
    drawStroke(ctx, stroke) {
        if (!stroke || !stroke.points || stroke.points.length < 2) return;

        const points = stroke.points;
        const options = stroke.options;

        ctx.save();
        ctx.fillStyle = options.color;
        ctx.globalAlpha = 1.0; // IMPORTANT: Opacité toujours à 100%

        // IMPORTANT: Multiplier la taille par DPR pour compenser la résolution Retina
        const dpr = window.devicePixelRatio || 1;
        const effectiveSize = options.size * dpr;

        // Utiliser perfect-freehand si disponible
        if (typeof window.getStroke !== 'undefined') {
            // Convertir les points au format perfect-freehand [x, y, pressure]
            // IMPORTANT: Forcer une pression constante pour un trait uniforme
            const pfPoints = points.map(p => [p.x, p.y, 0.5]);

            // Générer le stroke avec perfect-freehand
            const outlinePoints = window.getStroke(pfPoints, {
                size: effectiveSize,
                thinning: 0,      // Pas de variation d'épaisseur basée sur la vitesse
                smoothing: 0.15,  // Lissage minimal pour éviter les variations
                streamline: 0.3,  // Streamline minimal pour garder tous les points
                simulatePressure: false,
                last: !this.isDrawing  // true si le stroke est terminé
            });

            // Dessiner le polygone de contour
            if (outlinePoints.length > 0) {
                ctx.beginPath();
                ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);

                for (let i = 1; i < outlinePoints.length; i++) {
                    ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
                }

                ctx.closePath();
                ctx.fill();
            }
        } else {
            // Fallback: dessin simple avec lineTo si perfect-freehand n'est pas disponible

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = options.color;
            ctx.lineWidth = effectiveSize;

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }

            ctx.stroke();
        }

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

        // Redimensionner les canvas
        this.canvas.width = width;
        this.canvas.height = height;
        this.offscreenCanvas.width = width;
        this.offscreenCanvas.height = height;

        // Recalculer les coordonnées des strokes
        const scaleX = width / oldWidth;
        const scaleY = height / oldHeight;

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
        // Désenregistrer du gestionnaire de rendu global
        globalRenderManager.unregister(this);

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
