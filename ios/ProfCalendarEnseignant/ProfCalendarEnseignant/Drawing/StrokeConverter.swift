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
            
            // Convertir les coordonnees PencilKit -> coordonnees web
            // Diviser par le scale pour obtenir les coordonnees non-zoomees
            let webX = Double(point.location.x) / scale
            let webY = Double(point.location.y) / scale
            
            // La force PencilKit (0-1) mappe directement sur la pression
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
