//
//  StrokeConverter.swift
//  ProfCalendarViewer
//
//  Convertit un PKStroke (PencilKit) en donnees JSON
//  compatibles avec le format d'annotation de CleanPDFViewer.
//

import PencilKit
import UIKit

struct StrokePoint: Codable {
    let x: Double
    let y: Double
    let pressure: Double
}

struct StrokeData: Codable {
    let points: [StrokePoint]
    let tool: String
    let color: String
    let size: Double
    let opacity: Double
    let pageId: String
}

class StrokeConverter {
    
    /// Convertit un PKStroke en StrokeData pour le bridge JavaScript
    static func convert(
        stroke: PKStroke,
        tool: String,
        color: String,
        size: Double,
        opacity: Double,
        pageId: String,
        scale: Double
    ) -> StrokeData {
        
        var points: [StrokePoint] = []
        let path = stroke.path
        
        // Echantillonner les points du stroke
        // PKStrokePath est parametrique, on echantillonne a intervalles reguliers
        let pointCount = max(Int(path.count), 2)
        
        for i in 0..<pointCount {
            let point = path[i]

            // Coordonnées PencilKit -> coordonnées canvas web.
            //
            // PencilKit retourne des points dans le repère local du
            // PKCanvasView dont le frame est posé sur le rect CSS de la
            // page PDF (ex: 800x1000 points). Le canvas web de PDF.js
            // est dimensionné à viewport.width = natural × scale, soit
            // exactement le même que la taille CSS où le canvas est
            // rendu sur l'écran (canvas.width = canvas.style.width).
            //
            // → 1 point PencilKit = 1 pixel sur le canvas web.
            //   Aucune conversion nécessaire.
            //
            // L'ancienne division par `scale` était fausse : elle
            // produisait des points dans [0, natural], rendus ensuite
            // sur un canvas de [0, natural×scale] = trait réduit à 1/scale
            // et ancré en haut-gauche.
            let webX = Double(point.location.x)
            let webY = Double(point.location.y)

            // La force PencilKit (0-1) mappe directement sur la pression.
            let pressure = Double(point.force)

            points.append(StrokePoint(
                x: webX,
                y: webY,
                pressure: min(max(pressure, 0.0), 1.0)
            ))
        }
        
        return StrokeData(
            points: points,
            tool: tool,
            color: color,
            size: size,
            opacity: opacity,
            pageId: pageId
        )
    }
    
    /// Encode un StrokeData en JSON string pour le bridge JavaScript
    static func toJSON(_ strokeData: StrokeData) -> String? {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(strokeData) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
