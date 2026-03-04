#!/usr/bin/env python3
"""
Génère les sprites isométriques pour le combat tactique FFT-like.
- Tuiles losange 64×32 avec face latérale (effet 3D)
- Sprites personnages/monstres adaptés pour la vue iso
- Obstacle wall en 3D
"""
from PIL import Image, ImageDraw, ImageFilter
import os, math, random

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_TILES = os.path.join(BASE, 'static', 'img', 'combat', 'tiles')
OUT_CHIHUAHUA = os.path.join(BASE, 'static', 'img', 'combat', 'chihuahua')
OUT_MONSTERS = os.path.join(BASE, 'static', 'img', 'combat', 'monsters')
OUT_EFFECTS = os.path.join(BASE, 'static', 'img', 'combat', 'effects')

os.makedirs(OUT_TILES, exist_ok=True)
os.makedirs(OUT_CHIHUAHUA, exist_ok=True)
os.makedirs(OUT_MONSTERS, exist_ok=True)
os.makedirs(OUT_EFFECTS, exist_ok=True)

TILE_W = 64
TILE_H = 32
DEPTH = 16  # hauteur latérale 3D


# ═══════════════════════════════════════════════════════════════
#  TUILES ISOMÉTRIQUES (losange 64×32 + face latérale)
# ═══════════════════════════════════════════════════════════════

def draw_iso_tile(draw, top_color, side_color, y_offset=0, img_h=48):
    """Dessine un losange iso avec face latérale."""
    cx = TILE_W // 2
    # Face supérieure (losange)
    top_points = [
        (cx, y_offset),          # haut
        (TILE_W, TILE_H//2 + y_offset),  # droite
        (cx, TILE_H + y_offset),         # bas
        (0, TILE_H//2 + y_offset),       # gauche
    ]
    # Face latérale droite
    right_side = [
        (cx, TILE_H + y_offset),
        (TILE_W, TILE_H//2 + y_offset),
        (TILE_W, TILE_H//2 + y_offset + DEPTH),
        (cx, TILE_H + y_offset + DEPTH),
    ]
    # Face latérale gauche
    left_side = [
        (0, TILE_H//2 + y_offset),
        (cx, TILE_H + y_offset),
        (cx, TILE_H + y_offset + DEPTH),
        (0, TILE_H//2 + y_offset + DEPTH),
    ]

    # Couleurs latérales (plus sombres)
    r, g, b = side_color
    dark_right = (max(0, r - 30), max(0, g - 30), max(0, b - 30))
    dark_left = (max(0, r - 50), max(0, g - 50), max(0, b - 50))

    draw.polygon(left_side, fill=dark_left)
    draw.polygon(right_side, fill=dark_right)
    draw.polygon(top_points, fill=top_color)

    # Contour léger
    draw.line(top_points + [top_points[0]], fill=(0, 0, 0, 80), width=1)


def generate_grass_tile():
    img = Image.new('RGBA', (TILE_W, TILE_H + DEPTH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_iso_tile(draw, (76, 153, 0), (60, 120, 0))

    # Petites touffes d'herbe aléatoires
    random.seed(42)
    cx = TILE_W // 2
    for _ in range(8):
        x = random.randint(8, TILE_W - 8)
        # Vérifier si le point est dans le losange
        dy = abs(x - cx)
        max_y_range = TILE_H // 2 - dy * TILE_H // TILE_W
        if max_y_range > 2:
            y = TILE_H // 2 + random.randint(-max_y_range + 2, max_y_range - 2)
            shade = random.randint(-20, 20)
            c = (76 + shade, 153 + shade, 0)
            draw.ellipse([x-2, y-1, x+2, y+1], fill=c)

    img.save(os.path.join(OUT_TILES, 'iso_grass.png'))


def generate_stone_tile():
    img = Image.new('RGBA', (TILE_W, TILE_H + DEPTH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_iso_tile(draw, (160, 160, 160), (130, 130, 130))

    # Texture pierre
    random.seed(43)
    cx = TILE_W // 2
    for _ in range(5):
        x = random.randint(12, TILE_W - 12)
        dy = abs(x - cx)
        max_y_range = TILE_H // 2 - dy * TILE_H // TILE_W
        if max_y_range > 3:
            y = TILE_H // 2 + random.randint(-max_y_range + 3, max_y_range - 3)
            shade = random.randint(-15, 15)
            c = (160 + shade, 160 + shade, 160 + shade)
            draw.rectangle([x-3, y-1, x+3, y+1], fill=c)

    img.save(os.path.join(OUT_TILES, 'iso_stone.png'))


def generate_dirt_tile():
    img = Image.new('RGBA', (TILE_W, TILE_H + DEPTH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_iso_tile(draw, (139, 90, 43), (110, 70, 30))
    img.save(os.path.join(OUT_TILES, 'iso_dirt.png'))


def generate_water_tile():
    """Eau = obstacle, effet transparent bleu."""
    img = Image.new('RGBA', (TILE_W, TILE_H + DEPTH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = TILE_W // 2
    top_points = [
        (cx, 0), (TILE_W, TILE_H//2), (cx, TILE_H), (0, TILE_H//2)
    ]
    # Pas de face latérale pour l'eau (au même niveau)
    draw.polygon(top_points, fill=(30, 100, 200, 160))

    # Reflets
    draw.line([(20, TILE_H//2 - 2), (44, TILE_H//2 - 2)], fill=(100, 180, 255, 120), width=1)
    draw.line([(24, TILE_H//2 + 4), (40, TILE_H//2 + 4)], fill=(100, 180, 255, 100), width=1)

    draw.line(top_points + [top_points[0]], fill=(20, 80, 180, 100), width=1)

    img.save(os.path.join(OUT_TILES, 'iso_water.png'))


def generate_wall_tile():
    """Mur = obstacle, bloc surélevé."""
    extra_h = 20
    total_h = TILE_H + DEPTH + extra_h
    img = Image.new('RGBA', (TILE_W, total_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = TILE_W // 2
    y_off = 0

    # Face supérieure
    top = [(cx, y_off), (TILE_W, TILE_H//2 + y_off), (cx, TILE_H + y_off), (0, TILE_H//2 + y_off)]
    # Face droite (plus haute)
    right = [
        (cx, TILE_H + y_off), (TILE_W, TILE_H//2 + y_off),
        (TILE_W, TILE_H//2 + y_off + DEPTH + extra_h),
        (cx, TILE_H + y_off + DEPTH + extra_h)
    ]
    # Face gauche
    left = [
        (0, TILE_H//2 + y_off), (cx, TILE_H + y_off),
        (cx, TILE_H + y_off + DEPTH + extra_h),
        (0, TILE_H//2 + y_off + DEPTH + extra_h)
    ]

    draw.polygon(left, fill=(80, 70, 60))
    draw.polygon(right, fill=(100, 90, 75))
    draw.polygon(top, fill=(130, 115, 95))

    # Lignes de briques
    for i in range(2):
        by = TILE_H + y_off + 8 + i * 12
        draw.line([(cx, by), (TILE_W, by - TILE_H//4)], fill=(90, 80, 65), width=1)
        draw.line([(0, by - TILE_H//4), (cx, by)], fill=(70, 60, 50), width=1)

    draw.line(top + [top[0]], fill=(60, 50, 40, 150), width=1)

    img.save(os.path.join(OUT_TILES, 'iso_wall.png'))


def generate_highlight_tiles():
    """Tuiles de highlight : bleu (déplacement), rouge (attaque), vert (soin)."""
    colors = {
        'move': (50, 120, 255, 100),
        'attack': (255, 50, 50, 100),
        'heal': (50, 255, 100, 100),
        'selected': (255, 255, 50, 120),
    }
    cx = TILE_W // 2
    for name, color in colors.items():
        img = Image.new('RGBA', (TILE_W, TILE_H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        top_points = [(cx, 0), (TILE_W, TILE_H//2), (cx, TILE_H), (0, TILE_H//2)]
        draw.polygon(top_points, fill=color)
        # Contour plus visible
        border = (color[0], color[1], color[2], min(255, color[3] + 80))
        draw.line(top_points + [top_points[0]], fill=border, width=2)
        img.save(os.path.join(OUT_TILES, f'iso_highlight_{name}.png'))


# ═══════════════════════════════════════════════════════════════
#  SPRITES PERSONNAGES ISOMÉTRIQUES
# ═══════════════════════════════════════════════════════════════

CLASS_COLORS = {
    'guerrier': {'body': (200, 60, 60), 'accent': (255, 100, 100), 'weapon': (180, 180, 180)},
    'mage':     {'body': (80, 100, 220), 'accent': (120, 140, 255), 'weapon': (200, 160, 255)},
    'archer':   {'body': (40, 160, 80), 'accent': (80, 200, 120), 'weapon': (139, 90, 43)},
    'guerisseur': {'body': (220, 180, 40), 'accent': (255, 220, 80), 'weapon': (255, 255, 200)},
}

def draw_chihuahua_iso(draw, cx, cy, colors, direction='se', state='idle'):
    """Dessine un chihuahua en pixel art isométrique."""
    body = colors['body']
    accent = colors['accent']
    weapon = colors['weapon']

    # Base couleur peau chihuahua
    skin = (210, 170, 120)
    skin_dark = (180, 140, 90)
    ear = (190, 150, 100)
    eye = (40, 40, 40)
    nose = (60, 40, 30)

    # Ajustement selon direction
    flip = direction in ('nw', 'sw')
    facing_up = direction in ('ne', 'nw')

    sx = -1 if flip else 1

    # Corps (ellipse inclinée pour iso)
    body_y = cy + 2
    draw.ellipse([cx - 10, body_y - 6, cx + 10, body_y + 6], fill=skin)

    # Vêtement/armure par-dessus
    draw.ellipse([cx - 8, body_y - 4, cx + 8, body_y + 4], fill=body)

    # Tête
    head_y = cy - 8
    head_x = cx + sx * 2
    draw.ellipse([head_x - 7, head_y - 7, head_x + 7, head_y + 5], fill=skin)

    # Oreilles pointues (signature chihuahua)
    ear_base_y = head_y - 5
    draw.polygon([
        (head_x - 5, ear_base_y), (head_x - 8, ear_base_y - 8), (head_x - 1, ear_base_y)
    ], fill=ear)
    draw.polygon([
        (head_x + 1, ear_base_y), (head_x + 8, ear_base_y - 8), (head_x + 5, ear_base_y)
    ], fill=ear)

    # Yeux
    if not facing_up:
        draw.ellipse([head_x - 4, head_y - 3, head_x - 1, head_y], fill=eye)
        draw.ellipse([head_x + 1, head_y - 3, head_x + 4, head_y], fill=eye)
        # Reflets
        draw.point((head_x - 3, head_y - 2), fill=(255, 255, 255))
        draw.point((head_x + 2, head_y - 2), fill=(255, 255, 255))
        # Nez
        draw.ellipse([head_x - 1, head_y + 1, head_x + 1, head_y + 3], fill=nose)

    # Pattes
    draw.rectangle([cx - 8, cy + 6, cx - 5, cy + 12], fill=skin_dark)
    draw.rectangle([cx + 5, cy + 6, cx + 8, cy + 12], fill=skin_dark)

    # Queue (côté opposé à la direction)
    tail_x = cx - sx * 12
    draw.line([(cx - sx * 8, body_y), (tail_x, body_y - 6)], fill=skin, width=2)

    # Arme/accessoire selon classe
    if state == 'attack':
        weapon_x = cx + sx * 14
        weapon_y = cy - 4
        # Arme levée
        draw.line([(cx + sx * 8, cy), (weapon_x, weapon_y - 10)], fill=weapon, width=2)
        draw.ellipse([weapon_x - 3, weapon_y - 13, weapon_x + 3, weapon_y - 7], fill=accent)
    elif state == 'hurt':
        # Incliné
        pass  # Le dessin est déjà décalé
    elif state == 'ko':
        pass  # Géré séparément

    # Ombre au sol
    draw.ellipse([cx - 8, cy + 11, cx + 8, cy + 14], fill=(0, 0, 0, 40))


def generate_chihuahua_iso_sprites():
    """Génère les sprites iso pour les 4 classes × 4 directions × 4 états."""
    states = ['idle', 'attack', 'hurt', 'ko']
    directions = ['se', 'sw', 'ne', 'nw']

    sprite_size = 48  # Taille sprite iso (plus petit que 64 pour tenir sur les tuiles)

    for cls_name, colors in CLASS_COLORS.items():
        for direction in directions:
            for state in states:
                img = Image.new('RGBA', (sprite_size, sprite_size), (0, 0, 0, 0))
                draw = ImageDraw.Draw(img)

                cx = sprite_size // 2
                cy = sprite_size // 2

                if state == 'ko':
                    # Couché
                    cy += 8
                    draw.ellipse([cx - 12, cy - 3, cx + 12, cy + 3], fill=(210, 170, 120))
                    draw.ellipse([cx - 10, cy - 2, cx + 10, cy + 2], fill=colors['body'])
                    # X eyes
                    draw.line([(cx + 6, cy - 4), (cx + 10, cy)], fill=(40, 40, 40), width=1)
                    draw.line([(cx + 6, cy), (cx + 10, cy - 4)], fill=(40, 40, 40), width=1)
                    draw.ellipse([cx - 8, cy + 2, cx + 8, cy + 5], fill=(0, 0, 0, 40))
                elif state == 'hurt':
                    cy += 2
                    draw_chihuahua_iso(draw, cx - 2, cy, colors, direction, 'hurt')
                    # Flash rouge
                    overlay = Image.new('RGBA', (sprite_size, sprite_size), (255, 0, 0, 40))
                    img = Image.alpha_composite(img, overlay)
                else:
                    draw_chihuahua_iso(draw, cx, cy, colors, direction, state)

                img.save(os.path.join(OUT_CHIHUAHUA, f'{cls_name}_{direction}_{state}.png'))

        # Générer aussi la spritesheet combinée (4 directions × 4 états = 16 frames)
        sheet_w = sprite_size * 4  # 4 states per row
        sheet_h = sprite_size * 4  # 4 directions
        sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
        for di, direction in enumerate(directions):
            for si, state in enumerate(states):
                frame = Image.open(os.path.join(OUT_CHIHUAHUA, f'{cls_name}_{direction}_{state}.png'))
                sheet.paste(frame, (si * sprite_size, di * sprite_size))
        sheet.save(os.path.join(OUT_CHIHUAHUA, f'{cls_name}_iso_sheet.png'))
        print(f"  ✓ {cls_name} : 16 sprites + sheet")


# ═══════════════════════════════════════════════════════════════
#  SPRITES MONSTRES ISOMÉTRIQUES
# ═══════════════════════════════════════════════════════════════

MONSTER_CONFIGS = {
    'goblin': {'size': 40, 'color': (80, 160, 60), 'dark': (50, 120, 30)},
    'orc': {'size': 52, 'color': (130, 90, 50), 'dark': (100, 65, 30)},
    'slime': {'size': 36, 'color': (60, 140, 220), 'dark': (30, 100, 180)},
    'skeleton': {'size': 48, 'color': (220, 220, 210), 'dark': (180, 180, 170)},
    'dragon': {'size': 64, 'color': (200, 50, 50), 'dark': (160, 30, 30)},
}


def draw_goblin(draw, cx, cy, state, color, dark):
    # Petit goblin vert
    draw.ellipse([cx-8, cy-4, cx+8, cy+8], fill=color)  # corps
    draw.ellipse([cx-6, cy-10, cx+6, cy-1], fill=color)  # tête
    draw.polygon([(cx-6, cy-8), (cx-10, cy-14), (cx-3, cy-6)], fill=dark)  # oreille gauche
    draw.polygon([(cx+6, cy-8), (cx+10, cy-14), (cx+3, cy-6)], fill=dark)  # oreille droite
    draw.ellipse([cx-4, cy-7, cx-1, cy-4], fill=(255, 50, 50))  # oeil
    draw.ellipse([cx+1, cy-7, cx+4, cy-4], fill=(255, 50, 50))  # oeil
    draw.rectangle([cx-6, cy+6, cx-3, cy+12], fill=dark)  # patte
    draw.rectangle([cx+3, cy+6, cx+6, cy+12], fill=dark)  # patte
    if state == 'attack':
        draw.line([(cx+8, cy-2), (cx+16, cy-8)], fill=(160, 160, 160), width=2)
    draw.ellipse([cx-7, cy+11, cx+7, cy+14], fill=(0, 0, 0, 40))


def draw_orc(draw, cx, cy, state, color, dark):
    draw.ellipse([cx-12, cy-6, cx+12, cy+10], fill=color)  # corps
    draw.ellipse([cx-8, cy-14, cx+8, cy-2], fill=color)  # tête
    draw.ellipse([cx-3, cy-10, cx-1, cy-7], fill=(255, 200, 50))  # oeil
    draw.ellipse([cx+1, cy-10, cx+3, cy-7], fill=(255, 200, 50))  # oeil
    draw.arc([cx-4, cy-6, cx+4, cy-2], 0, 180, fill=(60, 30, 20), width=2)  # bouche
    draw.rectangle([cx-10, cy+8, cx-6, cy+16], fill=dark)
    draw.rectangle([cx+6, cy+8, cx+10, cy+16], fill=dark)
    if state == 'attack':
        draw.rectangle([cx+10, cy-12, cx+14, cy+4], fill=(120, 80, 40))  # massue
        draw.ellipse([cx+8, cy-16, cx+16, cy-10], fill=(100, 100, 100))
    draw.ellipse([cx-10, cy+14, cx+10, cy+18], fill=(0, 0, 0, 40))


def draw_slime(draw, cx, cy, state, color, dark):
    # Blob
    h = cy + 4 if state == 'attack' else cy + 6
    draw.ellipse([cx-10, cy-4, cx+10, h], fill=color)
    # Reflet
    draw.ellipse([cx-5, cy-2, cx+2, cy+2], fill=(min(255, color[0]+60), min(255, color[1]+60), min(255, color[2]+60), 150))
    draw.ellipse([cx-3, cy-1, cx+1, cy+1], fill=(255, 255, 255, 100))
    # Yeux
    draw.ellipse([cx-5, cy, cx-2, cy+3], fill=(20, 20, 40))
    draw.ellipse([cx+2, cy, cx+5, cy+3], fill=(20, 20, 40))
    draw.ellipse([cx-6, cy+5, cx+6, cy+8], fill=(0, 0, 0, 30))


def draw_skeleton(draw, cx, cy, state, color, dark):
    # Skull
    draw.ellipse([cx-7, cy-12, cx+7, cy-1], fill=color)
    draw.ellipse([cx-4, cy-9, cx-1, cy-5], fill=(40, 40, 40))  # oeil
    draw.ellipse([cx+1, cy-9, cx+4, cy-5], fill=(40, 40, 40))  # oeil
    draw.rectangle([cx-3, cy-4, cx+3, cy-1], fill=(40, 40, 40))  # mouth
    # Ribcage
    draw.rectangle([cx-2, cy-1, cx+2, cy+8], fill=color)
    for i in range(3):
        y = cy + 1 + i * 3
        draw.line([(cx-6, y), (cx+6, y)], fill=dark, width=1)
    # Legs
    draw.line([(cx-1, cy+8), (cx-5, cy+14)], fill=color, width=2)
    draw.line([(cx+1, cy+8), (cx+5, cy+14)], fill=color, width=2)
    if state == 'attack':
        draw.line([(cx+6, cy-2), (cx+14, cy-8)], fill=(200, 200, 200), width=2)
    draw.ellipse([cx-6, cy+13, cx+6, cy+16], fill=(0, 0, 0, 40))


def draw_dragon(draw, cx, cy, state, color, dark):
    # Body
    draw.ellipse([cx-16, cy-6, cx+16, cy+12], fill=color)
    # Head
    draw.ellipse([cx+8, cy-18, cx+24, cy-4], fill=color)
    draw.ellipse([cx+16, cy-14, cx+22, cy-10], fill=(255, 200, 50))  # oeil
    draw.ellipse([cx+18, cy-13, cx+20, cy-11], fill=(40, 40, 40))  # pupille
    # Horns
    draw.polygon([(cx+12, cy-16), (cx+8, cy-26), (cx+14, cy-18)], fill=dark)
    draw.polygon([(cx+18, cy-16), (cx+22, cy-26), (cx+20, cy-18)], fill=dark)
    # Wings
    draw.polygon([(cx-4, cy-4), (cx-20, cy-24), (cx+4, cy-8)], fill=(min(255, color[0]+30), dark[1], dark[2]))
    draw.polygon([(cx+4, cy-6), (cx+8, cy-20), (cx+12, cy-8)], fill=(min(255, color[0]+20), dark[1]+10, dark[2]+10))
    # Tail
    draw.line([(cx-14, cy+4), (cx-24, cy), (cx-28, cy-4)], fill=dark, width=3)
    # Legs
    draw.rectangle([cx-10, cy+10, cx-5, cy+18], fill=dark)
    draw.rectangle([cx+5, cy+10, cx+10, cy+18], fill=dark)
    # Fire breath in attack
    if state == 'attack':
        for i in range(4):
            fx = cx + 24 + i * 4
            fy = cy - 12 + i
            r = 4 - i
            draw.ellipse([fx-r, fy-r, fx+r, fy+r], fill=(255, 150 - i*30, 0, 200 - i*40))
    draw.ellipse([cx-14, cy+16, cx+14, cy+20], fill=(0, 0, 0, 40))


MONSTER_DRAWERS = {
    'goblin': draw_goblin,
    'orc': draw_orc,
    'slime': draw_slime,
    'skeleton': draw_skeleton,
    'dragon': draw_dragon,
}


def generate_monster_iso_sprites():
    """Génère les sprites monstres isométriques."""
    states = ['idle', 'attack', 'hurt', 'ko']

    for monster_name, config in MONSTER_CONFIGS.items():
        size = config['size']
        pad_size = max(64, size + 16)  # Padding
        drawer = MONSTER_DRAWERS[monster_name]

        for state in states:
            img = Image.new('RGBA', (pad_size, pad_size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)

            cx = pad_size // 2
            cy = pad_size // 2

            if state == 'ko':
                # Couché + gris
                cy += 6
                draw.ellipse([cx-size//3, cy-4, cx+size//3, cy+4], fill=(150, 150, 150, 180))
                draw.line([(cx-3, cy-2), (cx+3, cy+2)], fill=(80, 80, 80), width=1)
                draw.line([(cx-3, cy+2), (cx+3, cy-2)], fill=(80, 80, 80), width=1)
            elif state == 'hurt':
                drawer(draw, cx, cy, 'idle', config['color'], config['dark'])
                overlay = Image.new('RGBA', (pad_size, pad_size), (255, 0, 0, 50))
                img = Image.alpha_composite(img, overlay)
            else:
                drawer(draw, cx, cy, state, config['color'], config['dark'])

            img.save(os.path.join(OUT_MONSTERS, f'{monster_name}_iso_{state}.png'))

        # Spritesheet
        sheet = Image.new('RGBA', (pad_size * 4, pad_size), (0, 0, 0, 0))
        for si, state in enumerate(states):
            frame = Image.open(os.path.join(OUT_MONSTERS, f'{monster_name}_iso_{state}.png'))
            sheet.paste(frame, (si * pad_size, 0))
        sheet.save(os.path.join(OUT_MONSTERS, f'{monster_name}_iso_sheet.png'))
        print(f"  ✓ {monster_name} : 4 sprites + sheet")


# ═══════════════════════════════════════════════════════════════
#  EFFETS
# ═══════════════════════════════════════════════════════════════

def generate_iso_effects():
    """Génère des sprites d'effets pour les animations de combat."""
    size = 48

    # Slash effect
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for i in range(3):
        x = size//2 - 8 + i * 8
        draw.arc([x-10, 4, x+10, size-4], 200, 340, fill=(255, 255-i*40, 255-i*80, 220-i*40), width=3)
    img.save(os.path.join(OUT_EFFECTS, 'iso_slash.png'))

    # Fireball
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size//2, size//2
    draw.ellipse([cx-12, cy-12, cx+12, cy+12], fill=(255, 100, 0, 200))
    draw.ellipse([cx-8, cy-8, cx+8, cy+8], fill=(255, 180, 0, 220))
    draw.ellipse([cx-4, cy-4, cx+4, cy+4], fill=(255, 255, 100, 240))
    img.save(os.path.join(OUT_EFFECTS, 'iso_fireball.png'))

    # Heal
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size//2, size//2
    for r in range(16, 4, -2):
        alpha = 60 + (16 - r) * 12
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(50, 255, 100, alpha))
    # Cross
    draw.rectangle([cx-2, cy-8, cx+2, cy+8], fill=(200, 255, 200, 200))
    draw.rectangle([cx-8, cy-2, cx+8, cy+2], fill=(200, 255, 200, 200))
    img.save(os.path.join(OUT_EFFECTS, 'iso_heal.png'))

    # Shield
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size//2, size//2
    # Shield shape
    points = [(cx, cy-14), (cx+12, cy-6), (cx+10, cy+6), (cx, cy+14), (cx-10, cy+6), (cx-12, cy-6)]
    draw.polygon(points, fill=(60, 120, 255, 150))
    draw.line(points + [points[0]], fill=(100, 160, 255, 200), width=2)
    img.save(os.path.join(OUT_EFFECTS, 'iso_shield.png'))

    # Damage number background
    img = Image.new('RGBA', (40, 24), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, 39, 23], radius=6, fill=(200, 30, 30, 180))
    img.save(os.path.join(OUT_EFFECTS, 'dmg_bg.png'))

    print("  ✓ Effets : slash, fireball, heal, shield, dmg_bg")


# ═══════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("=== Génération des sprites isométriques ===\n")

    print("1. Tuiles isométriques (64×32 + depth)...")
    generate_grass_tile()
    generate_stone_tile()
    generate_dirt_tile()
    generate_water_tile()
    generate_wall_tile()
    generate_highlight_tiles()
    print("  ✓ 5 tuiles + 4 highlights\n")

    print("2. Chihuahuas isométriques (4 classes × 4 dir × 4 états)...")
    generate_chihuahua_iso_sprites()
    print()

    print("3. Monstres isométriques (5 types × 4 états)...")
    generate_monster_iso_sprites()
    print()

    print("4. Effets de combat...")
    generate_iso_effects()
    print()

    print("=== Terminé ! ===")

    # Résumé
    tiles = [f for f in os.listdir(OUT_TILES) if f.startswith('iso_')]
    chi = [f for f in os.listdir(OUT_CHIHUAHUA) if '_iso_' in f or '_se_' in f or '_sw_' in f or '_ne_' in f or '_nw_' in f]
    mons = [f for f in os.listdir(OUT_MONSTERS) if '_iso_' in f]
    effs = [f for f in os.listdir(OUT_EFFECTS) if f.startswith('iso_') or f == 'dmg_bg.png']
    print(f"\nTotal : {len(tiles)} tuiles, {len(chi)} chihuahuas, {len(mons)} monstres, {len(effs)} effets")
