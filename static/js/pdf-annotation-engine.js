/**
 * PDF Annotation Engine - Système d'annotation vectorielle haute performance
 * Utilise perfect-freehand pour un rendu de qualité Apple Freeform
 * @version 2.0.0
 */

'use strict';

class PDFAnnotationEngine {
    constructor(options = {}) {
        // Configuration
        this.options = {
            // Paramètres perfect-freehand
            size: options.size || 4,
            thinning: options.thinning || 0.5,
            smoothing: options.smoothing || 0.5,
            streamline: options.streamline || 0.5,
            easing: options.easing || function(t) { return t; },
            start: options.start || { taper: 0, cap: true },
            end: options.end || { taper: 0, cap: true },
            simulatePressure: options.simulatePressure !== false,

            // Paramètres de performance
            renderThrottle: options.renderThrottle || 16, // 60fps
            maxHistorySize: options.maxHistorySize || 50,

            // Paramètres visuels
            color: options.color || '#000000',
            opacity: options.opacity || 1.0,
        };

        // État du dessin
        this.isDrawing = false;
        this.currentPath = [];
        this.currentStroke = null;
        this.lastPoint = null;
        this.lastRenderTime = 0;

        // Historique pour undo/redo
        this.history = [];
        this.historyIndex = -1;

        // Cache pour optimisation
        this.pathCache = new Map();
    }

    /**
     * Démarre un nouveau tracé
     * @param {number} x - Coordonnée X
     * @param {number} y - Coordonnée Y
     * @param {number} pressure - Pression du stylet (0-1)
     */
    startPath(x, y, pressure = 0.5) {
        this.isDrawing = true;
        this.currentPath = [[x, y, pressure]];
        this.lastPoint = { x, y, pressure, timestamp: Date.now() };
        this.currentStroke = null;
    }

    /**
     * Ajoute un point au tracé en cours
     * @param {number} x - Coordonnée X
     * @param {number} y - Coordonnée Y
     * @param {number} pressure - Pression du stylet (0-1)
     * @returns {Array|null} Polygone du stroke ou null si throttlé
     */
    addPoint(x, y, pressure = 0.5) {
        if (!this.isDrawing) return null;

        const now = Date.now();

        // TOUJOURS ajouter le point (jamais sauter)
        this.currentPath.push([x, y, pressure]);
        this.lastPoint = { x, y, pressure, timestamp: now };

        // Vérifier disponibilité de getStroke
        if (typeof window.getStroke === 'undefined') {
            console.warn('perfect-freehand (getStroke) non disponible');
            return null;
        }

        // Throttling intelligent : toujours calculer le stroke pour éviter les trous
        // Le throttle sera géré au niveau du rendu canvas
        const shouldThrottle = (now - this.lastRenderTime) < this.options.renderThrottle;

        if (!shouldThrottle) {
            this.lastRenderTime = now;
        }

        // TOUJOURS générer le stroke pour éviter les trous visuels
        this.currentStroke = window.getStroke(this.currentPath, {
            size: this.options.size,
            thinning: this.options.thinning,
            smoothing: this.options.smoothing,
            streamline: this.options.streamline,
            easing: this.options.easing,
            start: this.options.start,
            end: this.options.end,
            simulatePressure: this.options.simulatePressure,
        });

        // Toujours retourner le stroke (pas de null qui cause les trous)
        return this.currentStroke;
    }

    /**
     * Termine le tracé en cours
     * @returns {Object} Données du tracé finalisé
     */
    endPath() {
        if (!this.isDrawing) return null;

        this.isDrawing = false;

        // Générer le stroke final (sans throttling)
        if (typeof window.getStroke === 'undefined') {
            console.warn('perfect-freehand (getStroke) non disponible');
            return null;
        }

        const finalStroke = window.getStroke(this.currentPath, {
            size: this.options.size,
            thinning: this.options.thinning,
            smoothing: this.options.smoothing,
            streamline: this.options.streamline,
            easing: this.options.easing,
            start: this.options.start,
            end: this.options.end,
            simulatePressure: this.options.simulatePressure,
        });

        const pathData = {
            id: this.generateId(),
            type: 'stroke',
            points: this.currentPath,
            stroke: finalStroke,
            color: this.options.color,
            opacity: this.options.opacity,
            timestamp: Date.now(),
        };

        // Ajouter à l'historique
        this.addToHistory(pathData);

        // Réinitialiser
        this.currentPath = [];
        this.currentStroke = null;

        return pathData;
    }

    /**
     * Dessine un stroke sur le canvas
     * @param {CanvasRenderingContext2D} ctx - Contexte canvas
     * @param {Array} strokePoints - Points du polygone du stroke
     * @param {string} color - Couleur
     * @param {number} opacity - Opacité
     */
    drawStroke(ctx, strokePoints, color = this.options.color, opacity = this.options.opacity) {
        if (!strokePoints || strokePoints.length < 3) return;

        ctx.save();

        // Configuration du rendu
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = 'source-over';

        // Anti-aliasing de qualité
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Dessiner le polygone
        ctx.beginPath();
        ctx.moveTo(strokePoints[0][0], strokePoints[0][1]);

        for (let i = 1; i < strokePoints.length; i++) {
            ctx.lineTo(strokePoints[i][0], strokePoints[i][1]);
        }

        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    /**
     * Calcule la pression simulée basée sur la vélocité
     * @param {Object} currentPoint - Point actuel {x, y}
     * @param {Object} lastPoint - Point précédent {x, y, timestamp}
     * @returns {number} Pression simulée (0-1)
     */
    calculatePressureFromVelocity(currentPoint, lastPoint) {
        if (!lastPoint) return 0.5;

        const now = Date.now();
        const dt = Math.max(1, now - (lastPoint.timestamp || now));
        const dx = currentPoint.x - lastPoint.x;
        const dy = currentPoint.y - lastPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const velocity = distance / dt;

        // Plus la vélocité est élevée, moins la pression est forte
        // Formule ajustée pour obtenir un effet naturel
        const pressure = Math.max(0.2, Math.min(1.0, 1.0 - Math.min(velocity / 2, 0.8)));

        return pressure;
    }

    /**
     * Ajoute un tracé à l'historique
     * @param {Object} pathData - Données du tracé
     */
    addToHistory(pathData) {
        // Supprimer l'historique après l'index actuel (si on a fait undo)
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push(pathData);
        this.historyIndex++;

        // Limiter la taille de l'historique
        if (this.history.length > this.options.maxHistorySize) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    /**
     * Annule le dernier tracé (undo)
     * @returns {boolean} True si undo effectué
     */
    undo() {
        if (this.historyIndex < 0) return false;
        this.historyIndex--;
        return true;
    }

    /**
     * Rétablit le dernier tracé annulé (redo)
     * @returns {boolean} True si redo effectué
     */
    redo() {
        if (this.historyIndex >= this.history.length - 1) return false;
        this.historyIndex++;
        return true;
    }

    /**
     * Obtient tous les tracés visibles (jusqu'à historyIndex)
     * @returns {Array} Liste des tracés visibles
     */
    getVisiblePaths() {
        return this.history.slice(0, this.historyIndex + 1);
    }

    /**
     * Efface tout l'historique
     */
    clearAll() {
        this.history = [];
        this.historyIndex = -1;
        this.currentPath = [];
        this.currentStroke = null;
        this.pathCache.clear();
    }

    /**
     * Exporte les annotations en format JSON
     * @returns {Object} Données d'export
     */
    export() {
        return {
            version: '2.0.0',
            paths: this.history,
            options: this.options,
        };
    }

    /**
     * Importe des annotations depuis JSON
     * @param {Object} data - Données à importer
     */
    import(data) {
        if (!data || !data.paths) return false;

        this.history = data.paths;
        this.historyIndex = this.history.length - 1;

        if (data.options) {
            this.options = { ...this.options, ...data.options };
        }

        return true;
    }

    /**
     * Met à jour les options de dessin
     * @param {Object} newOptions - Nouvelles options
     */
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
    }

    /**
     * Génère un ID unique
     * @returns {string} ID unique
     */
    generateId() {
        return `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Convertit un stroke en SVG path
     * @param {Array} strokePoints - Points du polygone
     * @returns {string} SVG path string
     */
    strokeToSVGPath(strokePoints) {
        if (!strokePoints || strokePoints.length < 3) return '';

        const d = strokePoints.reduce((acc, [x, y], i) => {
            if (i === 0) return `M ${x} ${y}`;
            return `${acc} L ${x} ${y}`;
        }, '');

        return `${d} Z`;
    }

    /**
     * Rendu optimisé du stroke en cours (prévisualisation)
     * @param {CanvasRenderingContext2D} ctx - Contexte canvas
     */
    renderCurrentStroke(ctx) {
        if (this.currentStroke && this.currentStroke.length > 0) {
            this.drawStroke(ctx, this.currentStroke);
        }
    }

    /**
     * Rendu de tous les strokes visibles
     * @param {CanvasRenderingContext2D} ctx - Contexte canvas
     */
    renderAllStrokes(ctx) {
        const visiblePaths = this.getVisiblePaths();
        const self = this;

        visiblePaths.forEach(function(pathData) {
            self.drawStroke(ctx, pathData.stroke, pathData.color, pathData.opacity);
        });
    }
}

// Exposer globalement pour compatibilité sans modules ES6
if (typeof window !== 'undefined') {
    window.PDFAnnotationEngine = PDFAnnotationEngine;
    console.log('✅ PDFAnnotationEngine exposé globalement');

    // Vérifier que getStroke est disponible
    if (typeof window.getStroke === 'undefined') {
        console.warn('⚠️ perfect-freehand (getStroke) pas encore chargé - attendez perfectFreehandLoaded event');
    } else {
        console.log('✅ perfect-freehand (getStroke) disponible');
    }
}
