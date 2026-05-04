/**
 * BadgeImage : rendu d'un badge d'exercice interactif (grille 5x5).
 *
 * Le serveur renvoie pour chaque exercice :
 *   - badge_pattern : str de 25 chars '0'/'1'  (0 = case blanche, 1 = case colorée)
 *   - badge_color   : hex #RRGGBB de la couleur "remplie"
 *
 * Le composant rend un carré de "size" pixels, divisé en 5x5. Si `greyed`
 * est vrai, on remplace la couleur principale par un gris (badge non gagné).
 *
 * Implémentation : View + 25 sous-Views absolutely positioned. On évite
 * react-native-svg pour ne pas ajouter une dépendance lourde.
 */

import React from 'react';
import { View } from 'react-native';

export default function BadgeImage({ pattern, color, size = 80, greyed = false, style }) {
  const isValid = typeof pattern === 'string' && pattern.length === 25;
  const cellSize = size / 5;
  const fillColor = greyed ? '#9CA3AF' : (color || '#9CA3AF');
  const bgColor = greyed ? '#F9FAFB' : '#FFFFFF';

  if (!isValid) {
    // Fallback : carré gris
    return (
      <View
        style={[
          { width: size, height: size, backgroundColor: '#E5E7EB', borderRadius: 6 },
          style,
        ]}
      />
    );
  }

  const cells = [];
  for (let i = 0; i < 25; i++) {
    if (pattern[i] === '1') {
      const x = i % 5;
      const y = Math.floor(i / 5);
      cells.push(
        <View
          key={i}
          style={{
            position: 'absolute',
            left: x * cellSize,
            top: y * cellSize,
            width: cellSize,
            height: cellSize,
            backgroundColor: fillColor,
          }}
        />
      );
    }
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          backgroundColor: bgColor,
          borderRadius: 6,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {cells}
    </View>
  );
}
