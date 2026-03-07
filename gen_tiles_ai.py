#!/usr/bin/env python3
"""
Generate isometric tiles for ProfCalendar combat arena using PixelLab AI API.

Usage:
  1. pip install pixellab Pillow
  2. python gen_tiles_ai.py

This script uses the PixelLab API to generate beautiful pixel art isometric tiles,
then composites them into the correct 64×44px isometric format with side faces.

PixelLab API key is included (Loic's key). Each tile costs ~1 API credit.
"""

import os
import sys
import time

try:
    import pixellab
except ImportError:
    print("Installing pixellab SDK...")
    os.system(f"{sys.executable} -m pip install pixellab --break-system-packages 2>/dev/null || {sys.executable} -m pip install pixellab")
    import pixellab

from PIL import Image, ImageDraw

# ── Configuration ──
API_KEY = "da54bcb0-8efd-4e34-a8e3-220b00f52973"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'img', 'combat', 'tiles')
os.makedirs(OUT_DIR, exist_ok=True)

# Tile geometry
W, H_TOP, H_SIDE = 64, 32, 12
H_TOTAL = H_TOP + H_SIDE  # 44px
TOP_DIAMOND = [(32, 0), (63, 15), (32, 31), (0, 15)]
LEFT_SIDE = [(0, 15), (32, 31), (32, 31 + H_SIDE), (0, 15 + H_SIDE)]
RIGHT_SIDE = [(32, 31), (63, 15), (63, 15 + H_SIDE), (32, 31 + H_SIDE)]

# Initialize PixelLab client
client = pixellab.Client(secret=API_KEY)

# ── Tile definitions ──
TILES = {
    'iso_grass.png': {
        'prompt': 'lush green grass terrain tile, pixel art, top-down isometric view, some small flowers and clovers, vibrant green, game asset',
        'side_l': (55, 120, 40),
        'side_r': (40, 95, 30),
    },
    'iso_dirt.png': {
        'prompt': 'brown dirt terrain tile, pixel art, top-down isometric view, some pebbles and cracks, earthy tones, game asset',
        'side_l': (100, 70, 40),
        'side_r': (80, 55, 30),
    },
    'iso_stone.png': {
        'prompt': 'cobblestone path terrain tile, pixel art, top-down isometric view, grey stone bricks with mortar lines, medieval fantasy, game asset',
        'side_l': (110, 110, 120),
        'side_r': (90, 90, 100),
    },
    'iso_water.png': {
        'prompt': 'clear blue water terrain tile, pixel art, top-down isometric view, gentle waves and light reflections, transparent blue, game asset',
        'side_l': (30, 90, 150),
        'side_r': (20, 70, 130),
    },
    'iso_sand.png': {
        'prompt': 'sandy beach terrain tile, pixel art, top-down isometric view, fine yellow sand with small shells, warm tones, game asset',
        'side_l': (180, 155, 110),
        'side_r': (160, 135, 95),
    },
    'iso_forest.png': {
        'prompt': 'dark forest terrain tile, pixel art, top-down isometric view, dense tree canopy with leaves, deep green, game asset',
        'side_l': (25, 80, 25),
        'side_r': (18, 60, 18),
    },
    'iso_wall.png': {
        'prompt': 'dark stone wall terrain tile, pixel art, top-down isometric view, dark grey brick pattern, dungeon style, game asset',
        'side_l': (45, 45, 55),
        'side_r': (35, 35, 45),
    },
    'iso_lava.png': {
        'prompt': 'molten lava terrain tile, pixel art, top-down isometric view, glowing orange and red with dark crust, volcanic, game asset',
        'side_l': (120, 30, 10),
        'side_r': (90, 20, 5),
    },
}


def is_in_diamond(x, y):
    """Check if point (x,y) is inside the isometric diamond."""
    n = len(TOP_DIAMOND)
    for i in range(n):
        x1, y1 = TOP_DIAMOND[i]
        x2, y2 = TOP_DIAMOND[(i + 1) % n]
        cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
        if cross < 0:
            return False
    return True


def is_in_polygon(x, y, poly):
    """Ray casting point-in-polygon test."""
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


def generate_ai_tile(name, prompt, side_l, side_r):
    """Generate a tile using PixelLab AI, then composite into isometric format."""
    print(f"  Generating {name}...")

    # Generate a 64x64 top-down tile texture via PixelLab
    try:
        response = client.generate_image_pixflux(
            description=prompt,
            image_size={"width": 64, "height": 64},
        )
        ai_img = response.image.pil_image().convert('RGBA')
    except Exception as e:
        print(f"    ⚠ API error for {name}: {e}")
        print(f"    → Falling back to simple colored tile")
        ai_img = None

    # Create the final 64×44 isometric tile
    tile = Image.new('RGBA', (W, H_TOTAL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)

    # Draw side faces
    draw.polygon(LEFT_SIDE, fill=side_l + (255,))
    draw.polygon(RIGHT_SIDE, fill=side_r + (255,))

    # Add subtle texture to sides
    import random
    for y in range(H_TOP - 1, H_TOTAL):
        for x in range(W):
            if is_in_polygon(x, y, LEFT_SIDE):
                if random.random() < 0.12:
                    r, g, b = side_l
                    d = random.randint(-12, 12)
                    tile.putpixel((x, y), (max(0, min(255, r+d)), max(0, min(255, g+d)), max(0, min(255, b+d)), 255))
            elif is_in_polygon(x, y, RIGHT_SIDE):
                if random.random() < 0.12:
                    r, g, b = side_r
                    d = random.randint(-12, 12)
                    tile.putpixel((x, y), (max(0, min(255, r+d)), max(0, min(255, g+d)), max(0, min(255, b+d)), 255))

    # Map the AI-generated 64x64 texture onto the isometric diamond top face
    if ai_img:
        for ty in range(H_TOP + 1):
            for tx in range(W):
                if is_in_diamond(tx, ty):
                    # Map isometric diamond coords to flat 64x64 texture coords
                    # Inverse isometric projection
                    # The diamond maps (32,0)→top, (63,15)→right, (32,31)→bottom, (0,15)→left
                    # We need to convert diamond (tx,ty) to texture (u,v)
                    fx = tx / 63.0
                    fy = ty / 31.0
                    # Isometric to cartesian: u = fx + fy - 1, v = fy - fx + 0.5 (approx)
                    u = (fx - 0.5) + (fy - 0.5) + 0.5
                    v = (fy - 0.5) - (fx - 0.5) + 0.5
                    u = max(0.0, min(1.0, u))
                    v = max(0.0, min(1.0, v))
                    sx = int(u * 63)
                    sy = int(v * 63)
                    px = ai_img.getpixel((sx, sy))
                    if len(px) == 4 and px[3] > 0:
                        tile.putpixel((tx, ty), px)
                    elif len(px) == 3:
                        tile.putpixel((tx, ty), px + (255,))
    else:
        # Fallback: simple colored diamond
        draw.polygon(TOP_DIAMOND, fill=side_l + (255,))

    # Edge lines for definition
    draw.line([TOP_DIAMOND[0], TOP_DIAMOND[1]], fill=(0, 0, 0, 60), width=1)
    draw.line([TOP_DIAMOND[1], TOP_DIAMOND[2]], fill=(0, 0, 0, 80), width=1)
    draw.line([TOP_DIAMOND[2], TOP_DIAMOND[3]], fill=(0, 0, 0, 80), width=1)
    draw.line([TOP_DIAMOND[3], TOP_DIAMOND[0]], fill=(0, 0, 0, 60), width=1)
    draw.line([LEFT_SIDE[2], LEFT_SIDE[3]], fill=(0, 0, 0, 100), width=1)
    draw.line([RIGHT_SIDE[2], RIGHT_SIDE[3]], fill=(0, 0, 0, 100), width=1)

    tile.save(os.path.join(OUT_DIR, name))
    print(f"    ✓ {name} saved ({tile.size})")


def generate_highlights():
    """Generate flat highlight tiles (no AI needed, just colored diamonds)."""
    highlights = {
        'iso_highlight_move.png': ((60, 120, 255), 100),
        'iso_highlight_attack.png': ((255, 60, 60), 100),
        'iso_highlight_heal.png': ((60, 220, 80), 100),
        'iso_highlight_selected.png': ((255, 220, 50), 120),
    }
    for name, (color, alpha) in highlights.items():
        img = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        diamond = [(32, 0), (63, 15), (32, 31), (0, 15)]
        r, g, b = color
        draw.polygon(diamond, fill=(r, g, b, alpha))
        edge_color = (min(255, r+60), min(255, g+60), min(255, b+60), 200)
        for i in range(4):
            draw.line([diamond[i], diamond[(i+1) % 4]], fill=edge_color, width=1)
        img.save(os.path.join(OUT_DIR, name))
        print(f"  ✓ {name}")


if __name__ == '__main__':
    print("=" * 50)
    print("ProfCalendar AI Tile Generator (PixelLab)")
    print("=" * 50)
    print(f"\nOutput: {OUT_DIR}")
    print(f"Tiles to generate: {len(TILES)}\n")

    for name, config in TILES.items():
        generate_ai_tile(name, config['prompt'], config['side_l'], config['side_r'])
        time.sleep(1)  # Rate limiting

    print("\nGenerating highlight tiles...")
    generate_highlights()

    print("\n✅ Done! All tiles generated in:")
    print(f"   {OUT_DIR}")
