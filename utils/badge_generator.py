"""Génération aléatoire d'images de badges 5x5 pour les exercices interactifs.

Un badge = grille 5x5 (25 cases) où chaque case est soit blanche, soit
peinte de la couleur "flashy" choisie pour ce badge. La couleur est tirée
au hasard parmi une palette de couleurs vives.

Le résultat est stocké dans Exercise comme :
- badge_pattern : str de 25 chars '0'/'1'  (0=blanc, 1=couleur)
- badge_color   : str hexadécimal #RRGGBB

Pour l'affichage, on génère un SVG côté serveur (cf. render_badge_svg).
"""

import random
from typing import Optional, Tuple


# Palette de couleurs flashy. Choisies pour rester vives sans cogner les yeux.
FLASHY_COLORS = [
    '#FF3B30',  # rouge
    '#FF9500',  # orange
    '#FFCC00',  # jaune
    '#34C759',  # vert
    '#00C7BE',  # cyan
    '#007AFF',  # bleu
    '#AF52DE',  # violet
    '#FF2D55',  # magenta / rose
    '#5AC8FA',  # bleu clair
    '#A2845E',  # bronze (un peu moins flashy mais lisible)
]


def generate_badge(seed: Optional[int] = None) -> Tuple[str, str]:
    """Génère une nouvelle image de badge aléatoire.

    Returns:
        (pattern, color) où pattern est une str de 25 chars '0'/'1'
        et color un hex #RRGGBB.

    Args:
        seed: Si fourni, rend la génération déterministe (utile pour les tests
              ou pour régénérer un badge identique à partir d'une seed).
    """
    rng = random.Random(seed) if seed is not None else random

    color = rng.choice(FLASHY_COLORS)

    # Pattern : on veut une image qui soit visuellement intéressante.
    # On vise environ 40-65% de cases colorées pour éviter les badges
    # quasi-vides ou quasi-pleins.
    fill_count = rng.randint(10, 16)  # entre 10 et 16 cases sur 25
    indices = list(range(25))
    rng.shuffle(indices)
    filled = set(indices[:fill_count])
    pattern = ''.join('1' if i in filled else '0' for i in range(25))

    return pattern, color


def render_badge_svg(pattern: Optional[str],
                     color: Optional[str],
                     size: int = 100,
                     greyed: bool = False) -> str:
    """Rend un badge en SVG inline (string).

    Args:
        pattern: 25 chars '0'/'1'. Si None, retourne un SVG vide carré gris.
        color:   couleur hex pour les cases '1'. Si None, gris.
        size:    taille en pixels du SVG carré.
        greyed:  si True, force toutes les cases colorées à un gris (badge
                 non débloqué côté élève).
    """
    if not pattern or len(pattern) != 25:
        # Fallback : carré gris uniforme
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" '
                f'height="{size}" viewBox="0 0 5 5">'
                f'<rect width="5" height="5" fill="#E5E7EB"/></svg>')

    fill = '#9CA3AF' if greyed else (color or '#9CA3AF')
    bg = '#F9FAFB' if greyed else '#FFFFFF'

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" '
        f'height="{size}" viewBox="0 0 5 5" shape-rendering="crispEdges">'
    ]
    # Fond
    parts.append(f'<rect width="5" height="5" fill="{bg}"/>')

    for i, ch in enumerate(pattern):
        if ch == '1':
            x = i % 5
            y = i // 5
            parts.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{fill}"/>')

    parts.append('</svg>')
    return ''.join(parts)
