#!/usr/bin/env python3
"""Generate correct isometric tiles for ProfCalendar combat arena."""
from PIL import Image, ImageDraw
import random, os

OUT = '/sessions/zen-optimistic-gauss/mnt/profcalendar-clean/static/img/combat/tiles'
os.makedirs(OUT, exist_ok=True)

W, H_TOP, H_SIDE = 64, 32, 12  # tile width, top face height, side depth
H_TOTAL = H_TOP + H_SIDE  # 44px total

# Isometric diamond vertices for TOP face
# Top: (32, 0), Right: (63, 15), Bottom: (32, 31), Left: (0, 15)
TOP_DIAMOND = [(32, 0), (63, 15), (32, 31), (0, 15)]

# Left side face: bottom-left of diamond going down
LEFT_SIDE = [(0, 15), (32, 31), (32, 31 + H_SIDE), (0, 15 + H_SIDE)]

# Right side face: bottom-right of diamond going down
RIGHT_SIDE = [(32, 31), (63, 15), (63, 15 + H_SIDE), (32, 31 + H_SIDE)]

def is_in_diamond(x, y, diamond=TOP_DIAMOND):
    """Check if point (x,y) is inside the diamond polygon."""
    # Use cross product method for convex polygon
    n = len(diamond)
    for i in range(n):
        x1, y1 = diamond[i]
        x2, y2 = diamond[(i + 1) % n]
        cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
        if cross < 0:
            return False
    return True

def is_in_polygon(x, y, poly):
    """Ray casting algorithm for point-in-polygon."""
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

def rand_color(base, variation=20):
    """Return a color randomly varied from base."""
    return tuple(max(0, min(255, c + random.randint(-variation, variation))) for c in base)

def create_tile(name, top_base, top_colors, side_l_base, side_r_base, texture_func=None):
    """Create a tile with given color palette."""
    img = Image.new('RGBA', (W, H_TOTAL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw sides first (they're behind the top face)
    # Left side - darker
    draw.polygon(LEFT_SIDE, fill=side_l_base)
    # Right side - darkest
    draw.polygon(RIGHT_SIDE, fill=side_r_base)

    # Draw top face
    draw.polygon(TOP_DIAMOND, fill=top_base)

    # Add pixel-art texture to top face
    for y in range(H_TOP + 1):
        for x in range(W):
            if is_in_diamond(x, y):
                if texture_func:
                    c = texture_func(x, y)
                    if c:
                        img.putpixel((x, y), c + (255,))
                elif random.random() < 0.3:
                    c = random.choice(top_colors)
                    img.putpixel((x, y), c + (255,))

    # Add texture to sides
    for y in range(H_TOP - 1, H_TOTAL):
        for x in range(W):
            if is_in_polygon(x, y, LEFT_SIDE):
                if random.random() < 0.15:
                    r, g, b = side_l_base[:3]
                    d = random.randint(-15, 15)
                    img.putpixel((x, y), (max(0,min(255,r+d)), max(0,min(255,g+d)), max(0,min(255,b+d)), 255))
            elif is_in_polygon(x, y, RIGHT_SIDE):
                if random.random() < 0.15:
                    r, g, b = side_r_base[:3]
                    d = random.randint(-15, 15)
                    img.putpixel((x, y), (max(0,min(255,r+d)), max(0,min(255,g+d)), max(0,min(255,b+d)), 255))

    # Edge lines for definition
    draw.line([TOP_DIAMOND[0], TOP_DIAMOND[1]], fill=(0, 0, 0, 60), width=1)
    draw.line([TOP_DIAMOND[1], TOP_DIAMOND[2]], fill=(0, 0, 0, 80), width=1)
    draw.line([TOP_DIAMOND[2], TOP_DIAMOND[3]], fill=(0, 0, 0, 80), width=1)
    draw.line([TOP_DIAMOND[3], TOP_DIAMOND[0]], fill=(0, 0, 0, 60), width=1)

    # Side bottom edges
    draw.line([LEFT_SIDE[2], LEFT_SIDE[3]], fill=(0, 0, 0, 100), width=1)
    draw.line([RIGHT_SIDE[2], RIGHT_SIDE[3]], fill=(0, 0, 0, 100), width=1)
    draw.line([LEFT_SIDE[3], (0, 15)], fill=(0, 0, 0, 80), width=1)
    draw.line([RIGHT_SIDE[2], (63, 15 + H_SIDE)], fill=(0, 0, 0, 80), width=1)

    img.save(os.path.join(OUT, name))
    print(f'  {name}: {img.size}')

# ── GRASS ──
def grass_texture(x, y):
    r = random.random()
    if r < 0.08:
        return random.choice([(80, 180, 80), (60, 160, 60)])  # dark blades
    elif r < 0.18:
        return random.choice([(120, 220, 100), (100, 210, 80)])  # light blades
    elif r < 0.22:
        return (140, 230, 120)  # highlight
    elif r < 0.24 and y > 5 and y < 28:
        return random.choice([(200, 200, 50), (220, 180, 60)])  # tiny flower
    return None

print("Generating tiles...")
create_tile('iso_grass.png',
    top_base=(76, 175, 76),
    top_colors=[(60,150,60), (90,190,80), (70,165,70), (100,200,90)],
    side_l_base=(55, 120, 40),
    side_r_base=(40, 95, 30),
    texture_func=grass_texture)

# ── DIRT ──
def dirt_texture(x, y):
    r = random.random()
    if r < 0.1:
        return random.choice([(120, 80, 50), (100, 65, 35)])  # dark patches
    elif r < 0.2:
        return random.choice([(170, 120, 80), (160, 115, 75)])  # light patches
    elif r < 0.25:
        return (90, 60, 30)  # pebble dark
    elif r < 0.28:
        return (180, 140, 100)  # pebble light
    return None

create_tile('iso_dirt.png',
    top_base=(139, 100, 60),
    top_colors=[(120,80,50), (150,110,70), (130,90,55)],
    side_l_base=(100, 70, 40),
    side_r_base=(80, 55, 30),
    texture_func=dirt_texture)

# ── STONE ──
def stone_texture(x, y):
    # Grid pattern for cobblestones
    gx = x % 12
    gy = y % 10
    if gx == 0 or gy == 0:
        return (100, 100, 110)  # mortar lines
    r = random.random()
    if r < 0.15:
        return random.choice([(140, 140, 155), (160, 160, 170)])
    elif r < 0.22:
        return (120, 120, 130)
    return None

create_tile('iso_stone.png',
    top_base=(150, 150, 160),
    top_colors=[(130,130,140), (160,160,170), (140,140,150)],
    side_l_base=(110, 110, 120),
    side_r_base=(90, 90, 100),
    texture_func=stone_texture)

# ── WATER ──
def water_texture(x, y):
    # Wave patterns
    wave = (x + y * 2) % 16
    r = random.random()
    if wave < 2:
        return (100, 180, 240)  # wave crest (light)
    elif wave < 4 and r < 0.3:
        return (80, 160, 220)  # wave highlight
    elif r < 0.1:
        return (40, 100, 180)  # deep dark
    elif r < 0.18:
        return (90, 170, 230)  # shimmer
    elif r < 0.22:
        return (200, 220, 255)  # sparkle
    return None

create_tile('iso_water.png',
    top_base=(60, 140, 210),
    top_colors=[(50,130,200), (70,150,220), (80,160,230)],
    side_l_base=(30, 90, 150),
    side_r_base=(20, 70, 130),
    texture_func=water_texture)

# ── SAND ──
def sand_texture(x, y):
    r = random.random()
    # Wind ripples
    ripple = (x + y) % 8
    if ripple == 0 and r < 0.4:
        return (220, 200, 150)  # ripple highlight
    elif r < 0.1:
        return (200, 175, 120)  # dark grain
    elif r < 0.18:
        return (240, 215, 165)  # light grain
    elif r < 0.21:
        return (210, 190, 140)  # medium
    elif r < 0.23 and y > 10 and y < 25:
        return (180, 160, 120)  # shell/pebble
    return None

create_tile('iso_sand.png',
    top_base=(220, 195, 145),
    top_colors=[(210,185,135), (230,205,155), (215,190,140)],
    side_l_base=(180, 155, 110),
    side_r_base=(160, 135, 95),
    texture_func=sand_texture)

# ── FOREST ──
def forest_texture(x, y):
    # Tree canopy clusters
    cx, cy = 20, 12
    cx2, cy2 = 42, 18
    cx3, cy3 = 30, 8

    for tcx, tcy in [(cx,cy), (cx2,cy2), (cx3, cy3)]:
        dist = ((x - tcx)**2 + (y - tcy)**2) ** 0.5
        if dist < 8:
            r = random.random()
            if dist < 3:
                return (20, 80, 30)  # tree center (dark)
            elif r < 0.4:
                return random.choice([(30, 100, 40), (25, 90, 35)])
            elif r < 0.6:
                return (50, 130, 55)  # leaf highlight

    r = random.random()
    if r < 0.1:
        return (25, 95, 30)
    elif r < 0.2:
        return (55, 140, 60)
    return None

create_tile('iso_forest.png',
    top_base=(40, 115, 45),
    top_colors=[(30,100,35), (50,130,55), (35,110,40)],
    side_l_base=(25, 80, 25),
    side_r_base=(18, 60, 18),
    texture_func=forest_texture)

# ── WALL ──
def wall_texture(x, y):
    # Brick pattern
    row = y % 8
    shifted = (x + (4 if (y // 8) % 2 else 0)) % 10
    if row == 0 or shifted == 0:
        return (40, 40, 45)  # mortar
    r = random.random()
    if r < 0.15:
        return random.choice([(70, 70, 80), (80, 80, 90)])
    elif r < 0.22:
        return (55, 55, 65)
    return None

create_tile('iso_wall.png',
    top_base=(65, 65, 75),
    top_colors=[(55,55,65), (75,75,85), (60,60,70)],
    side_l_base=(45, 45, 55),
    side_r_base=(35, 35, 45),
    texture_func=wall_texture)

# ── LAVA ──
def lava_texture(x, y):
    # Flowing veins pattern
    vein = ((x * 3 + y * 7) % 20)
    r = random.random()
    if vein < 3:
        return (255, 220, 50)  # bright yellow vein
    elif vein < 5 and r < 0.5:
        return (255, 180, 30)  # orange vein
    elif r < 0.1:
        return (80, 20, 10)  # dark crust
    elif r < 0.2:
        return (200, 80, 20)  # orange glow
    elif r < 0.28:
        return (255, 140, 40)  # hot spot
    return None

create_tile('iso_lava.png',
    top_base=(180, 60, 20),
    top_colors=[(160,50,15), (200,70,25), (220,100,30)],
    side_l_base=(120, 30, 10),
    side_r_base=(90, 20, 5),
    texture_func=lava_texture)

# ── HIGHLIGHT TILES (flat diamonds, no depth, semi-transparent) ──
def create_highlight(name, color, alpha=140):
    img = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    diamond = [(32, 0), (63, 15), (32, 31), (0, 15)]
    r, g, b = color
    draw.polygon(diamond, fill=(r, g, b, alpha))
    # Bright edge
    edge_color = (min(255, r+60), min(255, g+60), min(255, b+60), 200)
    draw.line([diamond[0], diamond[1]], fill=edge_color, width=1)
    draw.line([diamond[1], diamond[2]], fill=edge_color, width=1)
    draw.line([diamond[2], diamond[3]], fill=edge_color, width=1)
    draw.line([diamond[3], diamond[0]], fill=edge_color, width=1)
    img.save(os.path.join(OUT, name))
    print(f'  {name}: {img.size}')

create_highlight('iso_highlight_move.png', (60, 120, 255), 100)
create_highlight('iso_highlight_attack.png', (255, 60, 60), 100)
create_highlight('iso_highlight_heal.png', (60, 220, 80), 100)
create_highlight('iso_highlight_selected.png', (255, 220, 50), 120)

print("\nDone! All tiles generated.")
