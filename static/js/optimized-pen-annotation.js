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
        // console.log(`🔄 [RenderManager] Instance enregistrée, total: ${this.instances.size}`);

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
        // console.log(`🔄 [RenderManager] Instance désenregistrée, total: ${this.instances.size}`);

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
        // console.log(`✅ [RenderManager] Démarrage de la boucle de rendu globale`);

        const loop = () => {
            this._renderCounter++;
            const now = performance.now();

            // Log throttled toutes les 5 secondes (désactivé en production)
            // if (now - this._lastLogTime > 5000) {
            //     const dirtyCount = Array.from(this.instances).filter(i => i.needsRedraw).length;
            //     console.log(`🎨 [RenderManager] Loop #${this._renderCounter}, ${this.instances.size} instances, ${dirtyCount} dirty`);
            //     this._lastLogTime = now;
            // }

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

        // console.log(`🛑 [RenderManager] Boucle de rendu globale arrêtée`);
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

        // Vérifier la résolution du canvas pour diagnostic si nécessaire
        // const dpr = window.devicePixelRatio || 1;
        // const cssWidth = canvas.offsetWidth;
        // const cssHeight = canvas.offsetHeight;
        // console.log(`🔍 CANVAS INIT: DPR=${dpr}, Canvas physique=${canvas.width}x${canvas.height}, CSS=${cssWidth}x${cssHeight}, Ratio=${(canvas.width/cssWidth).toFixed(2)}`);

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
        console.log(`🖊️ [OptimizedPen] POINTERDOWN START:`, {
            isEnabled: this.isEnabled,
            isPinching: this.isPinching,
            pointerType: e.pointerType,
            buttons: e.buttons,
            pressure: e.pressure,
            timestamp: performance.now()
        });

        if (!this.isEnabled || this.isPinching) {
            console.log(`⛔ [OptimizedPen] Dessin désactivé ou pinching, retour`);
            return;
        }

        const isStylus = e.pointerType === 'pen';
        const isMouse = e.pointerType === 'mouse';
        const isFinger = e.pointerType === 'touch';

        // Ignorer les doigts - laisser le scroll/zoom natif
        if (isFinger) {
            console.log(`👆 [OptimizedPen] Doigt détecté, ignorer`);
            return;
        }

        // Accepter seulement stylet ou souris
        if (!isStylus && !isMouse) {
            console.log(`❓ [OptimizedPen] Type de pointeur inconnu, ignorer`);
            return;
        }

        console.log(`✅ [OptimizedPen] Démarrage du dessin avec ${e.pointerType}`);

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
        if (!this._pointerMoveCounter) this._pointerMoveCounter = 0;
        this._pointerMoveCounter++;
        const shouldLog = this._pointerMoveCounter % 20 === 0;

        if (!this.isDrawing) {
            if (shouldLog) {
                console.log(`🔵 [OptimizedPen] POINTERMOVE #${this._pointerMoveCounter} - NON DRAWING`);
            }
            return;
        }
        if (e.buttons !== 1) {
            if (shouldLog) {
                console.log(`🔵 [OptimizedPen] POINTERMOVE #${this._pointerMoveCounter} - buttons=${e.buttons}`);
            }
            return;
        }

        if (shouldLog) {
            console.log(`🔵 [OptimizedPen] POINTERMOVE #${this._pointerMoveCounter}:`, {
                isDrawing: this.isDrawing,
                buttons: e.buttons,
                pressure: e.pressure,
                pointsCount: this.currentStroke ? this.currentStroke.points.length : 0,
                timestamp: performance.now()
            });
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

        if (shouldLog && timeSinceLastPoint > 50) {
            console.log(`⏱️ [OptimizedPen] Gap de ${timeSinceLastPoint.toFixed(0)}ms depuis dernier point`);
        }

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

            // DEBUG: Log uniquement sur le premier needsRedraw
            if (!this._needsRedrawLogged) {
                console.log(`✅ [OptimizedPen] needsRedraw activé, ${pointsAdded} points ajoutés`);
                this._needsRedrawLogged = true;

                // CRITIQUE: Render ultra-minimal pour "warm up" le canvas
                // Safari iOS bloque le canvas rendering, donc on fait un simple point
                console.log(`⚡ [OptimizedPen] Quick initial render to warm up canvas`);
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
        console.log(`🟢 [OptimizedPen] POINTERUP:`, {
            isDrawing: this.isDrawing,
            pointsCount: this.currentStroke ? this.currentStroke.points.length : 0,
            totalMoves: this._pointerMoveCounter || 0,
            timestamp: performance.now()
        });
        this._pointerMoveCounter = 0;

        if (!this.isDrawing) {
            console.log(`⚠️ [OptimizedPen] POINTERUP mais isDrawing=false`);
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
        console.log(`✅ [OptimizedPen] Dessin terminé, stroke sauvegardé`);

        // Reset render counter and flags
        this._renderCounter = 0;
        this._lastRenderTime = null;
        this._needsRedrawLogged = false;

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
        // DEBUG: Logger les appels à render() avec throttling
        if (!this._renderCounter) this._renderCounter = 0;
        this._renderCounter++;

        const now = performance.now();
        if (this._lastRenderTime) {
            const timeSinceLastRender = now - this._lastRenderTime;
            if (this._renderCounter % 20 === 0) {
                console.log(`🎨 [OptimizedPen] RENDER #${this._renderCounter}:`, {
                    isDrawing: this.isDrawing,
                    pointsCount: this.currentStroke ? this.currentStroke.points.length : 0,
                    timeSinceLastRender: timeSinceLastRender.toFixed(1) + 'ms',
                    timestamp: now.toFixed(0)
                });
            }
            // Détecter les gaps > 100ms dans le rendu (seulement si on dessine)
            // Note: Ignorer le premier render après pointerdown (gap normal entre strokes)
            if (this.isDrawing && !this._isNewStroke && timeSinceLastRender > 100 && timeSinceLastRender < 5000) {
                console.warn(`⚠️ [OptimizedPen] RENDER GAP de ${timeSinceLastRender.toFixed(0)}ms détecté pendant le dessin!`);
            }
            // Clear le flag après le premier render
            if (this._isNewStroke) {
                this._isNewStroke = false;
            }
        }
        this._lastRenderTime = now;

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
        ctx.fillStyle = options.color;

        // Dessiner les traits entre les points avec courbes quadratiques
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        if (points.length === 2) {
            // Ligne simple pour 2 points
            ctx.lineTo(points[1].x, points[1].y);
        } else if (points.length === 3) {
            // Pour 3 points, courbe quadratique simple
            ctx.quadraticCurveTo(points[1].x, points[1].y, points[2].x, points[2].y);
        } else {
            // Catmull-Rom spline pour un lissage parfait (comme iOS Notes)
            // Premier segment: courbe quadratique vers le milieu entre p0 et p1
            const mid1X = (points[0].x + points[1].x) / 2;
            const mid1Y = (points[0].y + points[1].y) / 2;
            ctx.quadraticCurveTo(points[0].x, points[0].y, mid1X, mid1Y);

            // Segments intermédiaires: courbe quadratique avec point de contrôle au point actuel
            for (let i = 1; i < points.length - 1; i++) {
                const midX = (points[i].x + points[i + 1].x) / 2;
                const midY = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
            }

            // Dernier segment: courbe quadratique jusqu'au dernier point
            const lastIdx = points.length - 1;
            ctx.quadraticCurveTo(points[lastIdx].x, points[lastIdx].y, points[lastIdx].x, points[lastIdx].y);
        }

        ctx.stroke();

        // IMPORTANT: Dessiner des cercles uniquement aux extrémités pour lineCap rond
        // Ne PAS dessiner de cercles à tous les points intermédiaires (crée des "perles" visibles)
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, effectiveSize / 2, 0, Math.PI * 2);
        ctx.fill();

        if (points.length > 1) {
            ctx.beginPath();
            ctx.arc(points[points.length - 1].x, points[points.length - 1].y, effectiveSize / 2, 0, Math.PI * 2);
            ctx.fill();
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
