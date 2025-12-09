/**
 * Clean PDF Tools - Système d'outils d'annotation avancés
 * Utilise perfect-freehand pour le rendu vectoriel
 *
 * @version 2.0.0
 */

'use strict';

/**
 * Gestionnaire d'outils d'annotation
 */
class AnnotationTools {
    constructor(viewer) {
        this.viewer = viewer;
    }

    /**
     * Dessiner avec perfect-freehand
     */
    drawWithPerfectFreehand(ctx, points, options = {}) {
        if (typeof window.getStroke === 'undefined') {
            // Fallback si perfect-freehand pas chargé
            return this.drawSimple(ctx, points, options);
        }

        // Convertir au format perfect-freehand [x, y, pressure]
        const pfPoints = points.map(p => [p.x, p.y, p.pressure || 0.5]);

        // Générer le stroke
        const outlinePoints = window.getStroke(pfPoints, {
            size: options.size || 2,
            thinning: options.thinning || 0,
            smoothing: options.smoothing || 0.15,
            streamline: options.streamline || 0.3,
            simulatePressure: options.simulatePressure || false,
            last: options.last !== false
        });

        // Dessiner le polygone
        if (outlinePoints.length > 0) {
            ctx.save();
            ctx.fillStyle = options.color || '#000000';
            ctx.globalAlpha = options.opacity || 1.0;

            ctx.beginPath();
            ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);

            for (let i = 1; i < outlinePoints.length; i++) {
                ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
            }

            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    /**
     * Dessin simple (fallback)
     */
    drawSimple(ctx, points, options = {}) {
        if (points.length < 2) return;

        ctx.save();
        ctx.strokeStyle = options.color || '#000000';
        ctx.lineWidth = options.size || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = options.opacity || 1.0;

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        ctx.stroke();
        ctx.restore();
    }

    /**
     * Dessiner une règle (ligne droite)
     */
    drawRuler(ctx, start, end, options = {}) {
        const points = [
            {x: start.x, y: start.y, pressure: 0.5},
            {x: end.x, y: end.y, pressure: 0.5}
        ];

        this.drawWithPerfectFreehand(ctx, points, {
            ...options,
            streamline: 0, // Pas de lissage pour une ligne droite
            smoothing: 0
        });

        // Calculer la distance en pixels
        const distancePixels = Math.sqrt(
            (end.x - start.x) ** 2 + (end.y - start.y) ** 2
        );

        // Convertir en centimètres (1 cm = 37.8 pixels à 96 DPI)
        const distanceCm = distancePixels / 37.8;

        // Afficher la mesure au milieu du segment
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        // Angle du segment pour orienter le texte
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        ctx.save();
        ctx.translate(midX, midY);

        // Rotation du texte pour qu'il soit parallèle au segment
        let textAngle = angle;
        // Si l'angle est trop penché, inverser pour que le texte soit lisible
        if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
            textAngle += Math.PI;
        }
        ctx.rotate(textAngle);

        // Fond blanc pour le texte
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 14px Arial';
        const text = `${distanceCm.toFixed(1)} cm`;
        const metrics = ctx.measureText(text);
        const padding = 4;
        ctx.fillRect(
            -metrics.width / 2 - padding,
            -14 - padding,
            metrics.width + padding * 2,
            18 + padding * 2
        );

        // Texte de la mesure
        ctx.fillStyle = options.color || '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, -7);

        ctx.restore();
    }

    /**
     * Dessiner un compas (cercle)
     */
    drawCompass(ctx, center, radius, options = {}) {
        ctx.save();
        ctx.strokeStyle = options.color || '#000000';
        ctx.lineWidth = options.size || 2;
        ctx.globalAlpha = options.opacity || 1.0;

        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Dessiner le rayon du compas (preview)
     */
    drawCompassRadius(ctx, center, currentPoint, radius) {
        ctx.save();
        ctx.strokeStyle = '#007aff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        // Ligne du rayon
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();

        // Flèche
        const angle = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;

        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(currentPoint.x, currentPoint.y);
        ctx.lineTo(
            currentPoint.x - arrowLength * Math.cos(angle - arrowAngle),
            currentPoint.y - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.moveTo(currentPoint.x, currentPoint.y);
        ctx.lineTo(
            currentPoint.x - arrowLength * Math.cos(angle + arrowAngle),
            currentPoint.y - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.stroke();

        // Label du rayon en centimètres
        const midX = (center.x + currentPoint.x) / 2;
        const midY = (center.y + currentPoint.y) / 2;

        // Convertir le rayon en centimètres (1 cm = 37.8 pixels à 96 DPI)
        const radiusCm = radius / 37.8;

        // Fond blanc pour le texte
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 14px Arial';
        const text = `r = ${radiusCm.toFixed(1)} cm`;
        const metrics = ctx.measureText(text);
        const padding = 4;
        ctx.fillRect(
            midX - metrics.width / 2 - padding,
            midY - 17,
            metrics.width + padding * 2,
            20
        );

        // Texte du rayon
        ctx.fillStyle = '#007aff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, midX, midY - 7);

        ctx.restore();
    }

    /**
     * Dessiner un angle
     */
    drawAngle(ctx, center, point1, point2, options = {}) {
        // Calculer l'angle
        const angle1 = Math.atan2(point1.y - center.y, point1.x - center.x);
        const angle2 = Math.atan2(point2.y - center.y, point2.x - center.x);

        let angleDiff = angle2 - angle1;

        // Normaliser l'angle entre -π et π
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Prendre l'angle le plus petit (≤ 180°)
        if (Math.abs(angleDiff) > Math.PI) {
            angleDiff = angleDiff > 0 ? angleDiff - 2 * Math.PI : angleDiff + 2 * Math.PI;
        }

        const angleDegrees = Math.abs(angleDiff) * 180 / Math.PI;

        ctx.save();
        ctx.strokeStyle = options.color || '#000000';
        ctx.lineWidth = options.size || 2;
        ctx.globalAlpha = options.opacity || 1.0;

        // Dessiner les deux segments
        const radius = Math.min(
            Math.sqrt((point1.x - center.x) ** 2 + (point1.y - center.y) ** 2),
            Math.sqrt((point2.x - center.x) ** 2 + (point2.y - center.y) ** 2)
        );

        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(point1.x, point1.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(point2.x, point2.y);
        ctx.stroke();

        // Arc de l'angle
        const arcRadius = Math.min(50, radius * 0.3);
        ctx.beginPath();
        ctx.arc(center.x, center.y, arcRadius, angle1, angle2, angleDiff < 0);
        ctx.stroke();

        // Label de l'angle
        const labelAngle = (angle1 + angle2) / 2;
        const labelRadius = arcRadius + 20;
        const labelX = center.x + labelRadius * Math.cos(labelAngle);
        const labelY = center.y + labelRadius * Math.sin(labelAngle);

        ctx.fillStyle = options.color || '#000000';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${angleDegrees.toFixed(1)}°`, labelX, labelY);

        ctx.restore();

        return angleDegrees;
    }

    /**
     * Dessiner un arc de cercle
     */
    drawArc(ctx, center, radius, startAngle, endAngle, options = {}) {
        ctx.save();
        ctx.strokeStyle = options.color || '#000000';
        ctx.lineWidth = options.size || 2;
        ctx.globalAlpha = options.opacity || 1.0;

        // Si on a des angles visités (tracé cumulatif), les dessiner
        if (options.visitedAngles && options.visitedAngles.length > 0) {
            // Dessiner l'arc du startAngle au premier angle visité
            let angleDiff = options.visitedAngles[0] - startAngle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, startAngle, options.visitedAngles[0], angleDiff < 0);
            ctx.stroke();

            // Dessiner tous les arcs entre angles visités consécutifs
            for (let i = 0; i < options.visitedAngles.length - 1; i++) {
                const angle1 = options.visitedAngles[i];
                const angle2 = options.visitedAngles[i + 1];

                let angleDiff = angle2 - angle1;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                ctx.beginPath();
                ctx.arc(center.x, center.y, radius, angle1, angle2, angleDiff < 0);
                ctx.stroke();
            }
        } else {
            // Mode classique : dessiner un seul arc
            let angleDiff = endAngle - startAngle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, startAngle, endAngle, angleDiff < 0);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Dessiner une flèche
     */
    drawArrow(ctx, start, end, options = {}) {
        ctx.save();
        ctx.strokeStyle = options.color || '#000000';
        ctx.fillStyle = options.color || '#000000';
        ctx.lineWidth = options.size || 2;
        ctx.globalAlpha = options.opacity || 1.0;

        // Ligne principale
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        // Pointe de la flèche
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const arrowLength = 20;
        const arrowAngle = Math.PI / 6;

        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
            end.x - arrowLength * Math.cos(angle - arrowAngle),
            end.y - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.lineTo(
            end.x - arrowLength * Math.cos(angle + arrowAngle),
            end.y - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    /**
     * Dessiner un rectangle
     */
    drawRectangle(ctx, start, end, options = {}) {
        ctx.save();
        ctx.strokeStyle = options.color || '#000000';
        ctx.lineWidth = options.size || 2;
        ctx.globalAlpha = options.opacity || 1.0;

        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);

        ctx.strokeRect(x, y, width, height);

        ctx.restore();
    }

    /**
     * Dessiner un disque rempli
     */
    drawDisk(ctx, center, radius, options = {}) {
        ctx.save();
        ctx.fillStyle = options.color || '#000000';
        ctx.globalAlpha = options.opacity || 1.0;

        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /**
     * Dessiner une grille 1cm × 1cm avec 50% d'opacité
     */
    drawGrid(ctx, width, height) {
        // 1cm réel = 37.8 pixels à 96 DPI
        const gridSize = 37.8;

        ctx.save();
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.5; // 50% d'opacité

        // Lignes verticales
        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Lignes horizontales
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Gomme vectorielle - découper les strokes
     * Cette fonction est complexe et nécessite de tester l'intersection
     */
    eraseVectorial(annotations, eraserPoint, eraserSize) {
        const erasedAnnotations = [];
        const keptAnnotations = [];

        for (const annotation of annotations) {
            if (this.intersectsEraser(annotation, eraserPoint, eraserSize)) {
                // Option B : Découper le stroke
                const cutStrokes = this.cutStroke(annotation, eraserPoint, eraserSize);
                keptAnnotations.push(...cutStrokes);
            } else {
                keptAnnotations.push(annotation);
            }
        }

        return keptAnnotations;
    }

    /**
     * Tester si une annotation intersecte la gomme
     */
    intersectsEraser(annotation, eraserPoint, eraserSize) {
        if (!annotation.points) return false;

        for (const point of annotation.points) {
            const dist = Math.sqrt(
                (point.x - eraserPoint.x) ** 2 +
                (point.y - eraserPoint.y) ** 2
            );

            if (dist <= eraserSize) {
                return true;
            }
        }

        return false;
    }

    /**
     * Découper un stroke au niveau de la gomme
     * Retourne plusieurs strokes si nécessaire
     */
    cutStroke(annotation, eraserPoint, eraserSize) {
        if (!annotation.points || annotation.points.length < 2) {
            return [];
        }

        const segments = [];
        let currentSegment = [];

        for (const point of annotation.points) {
            const dist = Math.sqrt(
                (point.x - eraserPoint.x) ** 2 +
                (point.y - eraserPoint.y) ** 2
            );

            if (dist > eraserSize) {
                // Point en dehors de la zone d'effacement
                currentSegment.push(point);
            } else {
                // Point dans la zone d'effacement
                if (currentSegment.length > 1) {
                    // Sauvegarder le segment actuel
                    segments.push({
                        ...annotation,
                        points: currentSegment
                    });
                }
                currentSegment = [];
            }
        }

        // Sauvegarder le dernier segment
        if (currentSegment.length > 1) {
            segments.push({
                ...annotation,
                points: currentSegment
            });
        }

        return segments;
    }

    /**
     * Calculer la distance entre un point et un segment
     */
    distanceToSegment(point, segmentStart, segmentEnd) {
        const A = point.x - segmentStart.x;
        const B = point.y - segmentStart.y;
        const C = segmentEnd.x - segmentStart.x;
        const D = segmentEnd.y - segmentStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = segmentStart.x;
            yy = segmentStart.y;
        } else if (param > 1) {
            xx = segmentEnd.x;
            yy = segmentEnd.y;
        } else {
            xx = segmentStart.x + param * C;
            yy = segmentStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.AnnotationTools = AnnotationTools;
}
