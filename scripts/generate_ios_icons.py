#!/usr/bin/env python3
"""
Générateur d'icônes iOS pour les apps ProfCalendar Élèves et Parents.

Génère une icône 1024x1024 pour chaque app avec un thème de couleur distinct :
- Élèves : dégradé bleu vers vert (inspiré de la couleur primary ProfCalendar)
- Parents : dégradé orange vers rouge (pour bien distinguer visuellement)

Le design reprend le logo ProfCalendar (calendrier + points) dans un carré arrondi.

Usage:
    python3 scripts/generate_ios_icons.py
"""

from PIL import Image, ImageDraw, ImageFilter
import os
import math

# Taille d'icône requise par iOS App Store
ICON_SIZE = 1024

# Configuration des 2 apps
APPS = {
    'students': {
        'name': 'ProfCalendar Élèves',
        'output_dir': 'ios/ProfCalendarEleves/ProfCalendarEleves/Assets.xcassets/AppIcon.appiconset',
        # Bleu → Vert (énergie, jeunesse)
        'gradient_start': (79, 70, 229),    # Indigo
        'gradient_end': (16, 185, 129),      # Emerald
        'calendar_body': (255, 255, 255),    # Corps blanc
        'calendar_header': (79, 70, 229),    # Header indigo
        'calendar_dots': (79, 70, 229),      # Points indigo
    },
    'parents': {
        'name': 'ProfCalendar Parents',
        'output_dir': 'ios/ProfCalendarParents/ProfCalendarParents/Assets.xcassets/AppIcon.appiconset',
        # Orange → Rouge (attention, suivi)
        'gradient_start': (251, 146, 60),    # Orange
        'gradient_end': (239, 68, 68),       # Red
        'calendar_body': (255, 255, 255),    # Corps blanc
        'calendar_header': (239, 68, 68),    # Header red
        'calendar_dots': (239, 68, 68),      # Points red
    },
}


def create_gradient_background(size, color_start, color_end):
    """Crée un fond avec dégradé diagonal."""
    img = Image.new('RGB', (size, size), color_start)
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            # Interpolation diagonale : top-left → bottom-right
            t = (x + y) / (2 * size)
            t = max(0.0, min(1.0, t))
            r = int(color_start[0] * (1 - t) + color_end[0] * t)
            g = int(color_start[1] * (1 - t) + color_end[1] * t)
            b = int(color_start[2] * (1 - t) + color_end[2] * t)
            pixels[x, y] = (r, g, b)
    return img


def draw_calendar_icon(img, center, size, body_color, header_color, dots_color):
    """Dessine une icône de calendrier simplifié au centre."""
    draw = ImageDraw.Draw(img, 'RGBA')
    cx, cy = center

    # Dimensions du calendrier (largeur, hauteur)
    w = size
    h = int(size * 0.92)

    # Coordonnées du rectangle du calendrier
    left = cx - w // 2
    top = cy - h // 2 + int(size * 0.03)
    right = cx + w // 2
    bottom = cy + h // 2 + int(size * 0.03)

    # Corps du calendrier : rectangle arrondi blanc
    corner_radius = int(size * 0.1)
    draw.rounded_rectangle(
        [(left, top), (right, bottom)],
        radius=corner_radius,
        fill=(*body_color, 255),
    )

    # Barre du haut (header) colorée
    header_height = int(h * 0.28)
    draw.rounded_rectangle(
        [(left, top), (right, top + header_height)],
        radius=corner_radius,
        fill=(*header_color, 255),
    )
    # Rectangle qui masque les coins arrondis du bas du header
    draw.rectangle(
        [(left, top + header_height - corner_radius), (right, top + header_height)],
        fill=(*header_color, 255),
    )

    # Anneaux du haut (petits rectangles verticaux qui dépassent)
    ring_width = int(size * 0.05)
    ring_height = int(size * 0.13)
    ring_color = (*header_color, 255)
    ring_y_top = top - int(ring_height * 0.5)
    ring_y_bottom = top + int(ring_height * 0.5)
    ring_left_x = cx - int(w * 0.24)
    ring_right_x = cx + int(w * 0.24)
    for rx in [ring_left_x, ring_right_x]:
        draw.rounded_rectangle(
            [(rx - ring_width // 2, ring_y_top), (rx + ring_width // 2, ring_y_bottom)],
            radius=int(ring_width * 0.3),
            fill=ring_color,
        )

    # Grille de jours : 3 rangées de 3 points
    dot_radius = int(size * 0.06)
    grid_top_padding = int(h * 0.15)
    grid_bottom_padding = int(h * 0.12)
    grid_start_y = top + header_height + grid_top_padding
    grid_end_y = bottom - grid_bottom_padding
    grid_height = grid_end_y - grid_start_y

    grid_side_padding = int(w * 0.2)
    grid_start_x = left + grid_side_padding
    grid_end_x = right - grid_side_padding
    grid_width = grid_end_x - grid_start_x

    rows, cols = 3, 3
    for row in range(rows):
        for col in range(cols):
            dx = grid_start_x + int(col * (grid_width / (cols - 1)))
            dy = grid_start_y + int(row * (grid_height / (rows - 1)))
            # Dernière rangée légèrement atténuée pour le rythme visuel
            alpha = 255 if row < 2 else 110
            draw.ellipse(
                [(dx - dot_radius, dy - dot_radius), (dx + dot_radius, dy + dot_radius)],
                fill=(*dots_color, alpha),
            )


def create_app_icon(config, output_path):
    """Crée une icône complète pour une app."""
    # 1. Fond dégradé
    img = create_gradient_background(
        ICON_SIZE,
        config['gradient_start'],
        config['gradient_end'],
    )

    # 2. Ajout d'un léger vignettage pour donner de la profondeur
    overlay = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    # Vignette radiale sombre aux coins
    vignette_alpha = 40
    for i in range(0, ICON_SIZE // 2, 2):
        alpha = int(vignette_alpha * (i / (ICON_SIZE // 2)))
        overlay_draw.rectangle(
            [(i, i), (ICON_SIZE - i, ICON_SIZE - i)],
            outline=(0, 0, 0, alpha),
        )
    img = Image.alpha_composite(img.convert('RGBA'), overlay)

    # 3. Dessiner le calendrier au centre
    center = (ICON_SIZE // 2, ICON_SIZE // 2)
    calendar_size = int(ICON_SIZE * 0.55)
    draw_calendar_icon(
        img,
        center,
        calendar_size,
        body_color=config['calendar_body'],
        header_color=config['calendar_header'],
        dots_color=config['calendar_dots'],
    )

    # 4. Conversion en RGB (App Store exige pas d'alpha)
    final = Image.new('RGB', (ICON_SIZE, ICON_SIZE), (255, 255, 255))
    final.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)

    # 5. Sauvegarde
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final.save(output_path, 'PNG', optimize=True)
    print(f"✓ Généré : {output_path} ({final.size[0]}x{final.size[1]})")


def create_contents_json(output_dir, icon_filename):
    """Crée le Contents.json requis par Xcode."""
    contents = '''{
  "images" : [
    {
      "filename" : "''' + icon_filename + '''",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
'''
    path = os.path.join(output_dir, 'Contents.json')
    with open(path, 'w') as f:
        f.write(contents)
    print(f"✓ Écrit : {path}")


def main():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    print(f"Projet racine : {project_root}")
    print()

    for app_key, config in APPS.items():
        print(f"=== {config['name']} ===")
        output_dir = os.path.join(project_root, config['output_dir'])
        icon_filename = f"AppIcon-{app_key}.png"
        icon_path = os.path.join(output_dir, icon_filename)

        # Supprime les anciens fichiers PNG pour nettoyer
        if os.path.exists(output_dir):
            for f in os.listdir(output_dir):
                if f.endswith('.png'):
                    old_path = os.path.join(output_dir, f)
                    os.remove(old_path)
                    print(f"  Supprimé : {f}")

        create_app_icon(config, icon_path)
        create_contents_json(output_dir, icon_filename)
        print()

    print("✅ Icônes générées avec succès !")
    print("   → Ouvre Xcode et vérifie visuellement dans Assets.xcassets/AppIcon")


if __name__ == '__main__':
    main()
