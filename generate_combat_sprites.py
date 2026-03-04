#!/usr/bin/env python3
"""
Generate pixel art sprites for a combat RPG system using Pillow.
Creates chihuahua classes, monsters, tiles, and effects with animation frames.
"""

import os
from PIL import Image, ImageDraw


# Color definitions
COLORS = {
    'red': '#ef4444',
    'purple': '#667eea',
    'green': '#10b981',
    'yellow': '#f59e0b',
    'blue': '#3b82f6',
    'light_blue': '#60a5fa',
    'dark_blue': '#1e40af',
    'white': '#ffffff',
    'black': '#000000',
    'gray': '#808080',
    'dark_gray': '#404040',
    'brown': '#8b4513',
    'light_brown': '#a0522d',
    'orange': '#ff8c00',
    'light_orange': '#ffa500',
    'yellow_bright': '#ffff00',
    'light_green': '#7ee8b7',
    'dark_green': '#0d7f4a',
}


def hex_to_rgb(hex_color):
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def create_directories(base_path):
    """Create all necessary output directories."""
    dirs = [
        'static/img/combat/chihuahua',
        'static/img/combat/monsters',
        'static/img/combat/tiles',
        'static/img/combat/effects',
    ]
    for dir_path in dirs:
        full_path = os.path.join(base_path, dir_path)
        os.makedirs(full_path, exist_ok=True)


def draw_chihuahua_idle(draw, x, y, size, color_hex):
    """Draw an idle chihuahua."""
    color = hex_to_rgb(color_hex)
    scale = size // 64  # Normalize to 64x64

    # Body
    draw.ellipse([x + 16*scale, y + 28*scale, x + 48*scale, y + 48*scale], fill=color)

    # Head
    draw.ellipse([x + 18*scale, y + 12*scale, x + 46*scale, y + 30*scale], fill=color)

    # Ears
    draw.ellipse([x + 14*scale, y + 8*scale, x + 22*scale, y + 18*scale], fill=color)
    draw.ellipse([x + 42*scale, y + 8*scale, x + 50*scale, y + 18*scale], fill=color)

    # Eyes
    draw.ellipse([x + 22*scale, y + 16*scale, x + 26*scale, y + 20*scale], fill=hex_to_rgb('#000000'))
    draw.ellipse([x + 38*scale, y + 16*scale, x + 42*scale, y + 20*scale], fill=hex_to_rgb('#000000'))

    # Snout
    draw.ellipse([x + 26*scale, y + 22*scale, x + 38*scale, y + 28*scale], fill=hex_to_rgb('#ffcccc'))

    # Legs
    draw.rectangle([x + 20*scale, y + 46*scale, x + 26*scale, y + 56*scale], fill=color)
    draw.rectangle([x + 38*scale, y + 46*scale, x + 44*scale, y + 56*scale], fill=color)

    # Tail
    draw.ellipse([x + 44*scale, y + 38*scale, x + 54*scale, y + 46*scale], fill=color)


def draw_chihuahua_attack(draw, x, y, size, color_hex):
    """Draw a chihuahua in attack pose."""
    color = hex_to_rgb(color_hex)
    scale = size // 64

    # Body (tilted)
    draw.ellipse([x + 14*scale, y + 30*scale, x + 46*scale, y + 48*scale], fill=color)

    # Head
    draw.ellipse([x + 20*scale, y + 10*scale, x + 46*scale, y + 28*scale], fill=color)

    # Ears
    draw.ellipse([x + 16*scale, y + 6*scale, x + 24*scale, y + 16*scale], fill=color)
    draw.ellipse([x + 42*scale, y + 6*scale, x + 50*scale, y + 16*scale], fill=color)

    # Eyes
    draw.ellipse([x + 24*scale, y + 14*scale, x + 28*scale, y + 18*scale], fill=hex_to_rgb('#000000'))
    draw.ellipse([x + 40*scale, y + 14*scale, x + 44*scale, y + 18*scale], fill=hex_to_rgb('#000000'))

    # Snout
    draw.ellipse([x + 28*scale, y + 20*scale, x + 38*scale, y + 26*scale], fill=hex_to_rgb('#ffcccc'))

    # Raised front leg
    draw.rectangle([x + 38*scale, y + 24*scale, x + 44*scale, y + 38*scale], fill=color)

    # Back legs
    draw.rectangle([x + 18*scale, y + 46*scale, x + 24*scale, y + 56*scale], fill=color)
    draw.rectangle([x + 40*scale, y + 46*scale, x + 46*scale, y + 56*scale], fill=color)

    # Tail up
    draw.ellipse([x + 42*scale, y + 32*scale, x + 52*scale, y + 44*scale], fill=color)


def draw_chihuahua_hurt(draw, x, y, size, color_hex):
    """Draw a chihuahua in hurt pose."""
    color = hex_to_rgb(color_hex)
    scale = size // 64

    # Body (recoiling, tilted back)
    draw.ellipse([x + 12*scale, y + 26*scale, x + 48*scale, y + 44*scale], fill=color)

    # Head (tilted back)
    draw.ellipse([x + 16*scale, y + 8*scale, x + 44*scale, y + 26*scale], fill=color)

    # Ears (drooped)
    draw.ellipse([x + 12*scale, y + 12*scale, x + 20*scale, y + 22*scale], fill=color)
    draw.ellipse([x + 44*scale, y + 12*scale, x + 52*scale, y + 22*scale], fill=color)

    # Eyes (X shape - hurt)
    draw.line([x + 20*scale, y + 14*scale, x + 24*scale, y + 18*scale], fill=hex_to_rgb('#000000'), width=1)
    draw.line([x + 24*scale, y + 14*scale, x + 20*scale, y + 18*scale], fill=hex_to_rgb('#000000'), width=1)
    draw.line([x + 40*scale, y + 14*scale, x + 44*scale, y + 18*scale], fill=hex_to_rgb('#000000'), width=1)
    draw.line([x + 44*scale, y + 14*scale, x + 40*scale, y + 18*scale], fill=hex_to_rgb('#000000'), width=1)

    # Snout
    draw.ellipse([x + 26*scale, y + 18*scale, x + 38*scale, y + 24*scale], fill=hex_to_rgb('#ffcccc'))

    # Back legs bent
    draw.rectangle([x + 18*scale, y + 42*scale, x + 24*scale, y + 52*scale], fill=color)
    draw.rectangle([x + 40*scale, y + 42*scale, x + 46*scale, y + 52*scale], fill=color)

    # Tail down
    draw.ellipse([x + 44*scale, y + 40*scale, x + 54*scale, y + 48*scale], fill=color)


def draw_chihuahua_ko(draw, x, y, size, color_hex):
    """Draw a knocked out chihuahua."""
    color = hex_to_rgb(color_hex)
    # Desaturate for KO
    color = tuple(int(c * 0.6) for c in color)
    scale = size // 64

    # Body (on its side)
    draw.ellipse([x + 10*scale, y + 36*scale, x + 50*scale, y + 50*scale], fill=color)

    # Head (on its side)
    draw.ellipse([x + 14*scale, y + 16*scale, x + 42*scale, y + 36*scale], fill=color)

    # Ears (drooped flat)
    draw.ellipse([x + 10*scale, y + 20*scale, x + 18*scale, y + 28*scale], fill=color)
    draw.ellipse([x + 46*scale, y + 20*scale, x + 54*scale, y + 28*scale], fill=color)

    # Eyes (closed/X)
    draw.line([x + 18*scale, y + 20*scale, x + 22*scale, y + 24*scale], fill=hex_to_rgb('#000000'), width=1)
    draw.line([x + 22*scale, y + 20*scale, x + 18*scale, y + 24*scale], fill=hex_to_rgb('#000000'), width=1)
    draw.line([x + 36*scale, y + 20*scale, x + 40*scale, y + 24*scale], fill=hex_to_rgb('#000000'), width=1)
    draw.line([x + 40*scale, y + 20*scale, x + 36*scale, y + 24*scale], fill=hex_to_rgb('#000000'), width=1)

    # Snout
    draw.ellipse([x + 22*scale, y + 24*scale, x + 34*scale, y + 32*scale], fill=tuple(int(c * 0.7) for c in hex_to_rgb('#ffcccc')))

    # Legs (stretched out)
    draw.rectangle([x + 12*scale, y + 48*scale, x + 18*scale, y + 58*scale], fill=color)
    draw.rectangle([x + 46*scale, y + 48*scale, x + 52*scale, y + 58*scale], fill=color)

    # Tail (limp)
    draw.ellipse([x + 44*scale, y + 44*scale, x + 54*scale, y + 52*scale], fill=color)


def draw_class_accessory(draw, x, y, size, class_name, color_hex):
    """Draw class-specific accessories."""
    scale = size // 64

    if class_name == 'guerrier':
        # Sword
        draw.rectangle([x + 46*scale, y + 18*scale, x + 48*scale, y + 40*scale], fill=hex_to_rgb('#c0c0c0'))
        draw.polygon([(x + 44*scale, y + 16*scale), (x + 50*scale, y + 16*scale), (x + 47*scale, y + 12*scale)],
                    fill=hex_to_rgb('#ffff00'))

    elif class_name == 'mage':
        # Wizard hat
        draw.polygon([(x + 20*scale, y + 8*scale), (x + 28*scale, y + 8*scale), (x + 26*scale, y + 2*scale)],
                    fill=hex_to_rgb(color_hex))
        draw.rectangle([x + 18*scale, y + 10*scale, x + 30*scale, y + 12*scale], fill=hex_to_rgb('#ffff00'))

        # Staff
        draw.rectangle([x + 50*scale, y + 16*scale, x + 52*scale, y + 44*scale], fill=hex_to_rgb('#8b4513'))
        draw.ellipse([x + 48*scale, y + 12*scale, x + 54*scale, y + 18*scale], fill=hex_to_rgb('#ffff00'))

    elif class_name == 'archer':
        # Bow
        draw.arc([x + 46*scale, y + 18*scale, x + 52*scale, y + 40*scale], 0, 360, fill=hex_to_rgb('#8b4513'), width=2)
        # Arrow
        draw.rectangle([x + 38*scale, y + 26*scale, x + 48*scale, y + 28*scale], fill=hex_to_rgb('#cd853f'))

    elif class_name == 'guerisseur':
        # Healing staff
        draw.rectangle([x + 48*scale, y + 16*scale, x + 50*scale, y + 44*scale], fill=hex_to_rgb('#8b4513'))
        # Halo/aura
        draw.arc([x + 14*scale, y + 4*scale, x + 50*scale, y + 24*scale], 0, 360, fill=hex_to_rgb(color_hex), width=2)
        # Staff orb
        draw.ellipse([x + 46*scale, y + 12*scale, x + 54*scale, y + 20*scale], fill=hex_to_rgb('#00ff00'))


def generate_chihuahua_sprite(base_path, class_name, class_color, frame):
    """Generate a single chihuahua sprite."""
    size = 64
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # Draw the base chihuahua
    if frame == 'idle':
        draw_chihuahua_idle(draw, 0, 0, size, class_color)
    elif frame == 'attack':
        draw_chihuahua_attack(draw, 0, 0, size, class_color)
    elif frame == 'hurt':
        draw_chihuahua_hurt(draw, 0, 0, size, class_color)
    elif frame == 'ko':
        draw_chihuahua_ko(draw, 0, 0, size, class_color)

    # Add class-specific accessories
    if frame != 'ko':
        draw_class_accessory(draw, 0, 0, size, class_name, class_color)

    # Save sprite
    output_dir = os.path.join(base_path, 'static/img/combat/chihuahua')
    output_path = os.path.join(output_dir, f'{class_name}_{frame}.png')
    img.save(output_path)
    print(f"Generated: {class_name}_{frame}.png")

    return img


def generate_chihuahua_spritesheet(base_path, class_name, class_color):
    """Generate a spritesheet with all frames for a chihuahua class."""
    frames = ['idle', 'attack', 'hurt', 'ko']
    spritesheet = Image.new('RGBA', (256, 64), (255, 255, 255, 0))

    for i, frame in enumerate(frames):
        img = generate_chihuahua_sprite(base_path, class_name, class_color, frame)
        spritesheet.paste(img, (i * 64, 0), img)

    output_dir = os.path.join(base_path, 'static/img/combat/chihuahua')
    output_path = os.path.join(output_dir, f'{class_name}_sheet.png')
    spritesheet.save(output_path)
    print(f"Generated: {class_name}_sheet.png")


def draw_slime(draw, x, y, size, frame):
    """Draw a slime monster."""
    color = hex_to_rgb(COLORS['light_blue'])

    if frame == 'idle':
        draw.ellipse([x + 4, y + 10, x + 44, y + 46], fill=color)
        draw.ellipse([x + 8, y + 4, x + 16, y + 12], fill=color)
        draw.ellipse([x + 28, y + 6, x + 36, y + 14], fill=color)
    elif frame == 'attack':
        draw.ellipse([x + 4, y + 12, x + 44, y + 44], fill=color)
        draw.ellipse([x + 8, y + 2, x + 16, y + 10], fill=color)
        draw.ellipse([x + 28, y + 4, x + 36, y + 12], fill=color)
        draw.ellipse([x + 40, y + 28, x + 48, y + 40], fill=color)
    elif frame == 'hurt':
        draw.ellipse([x + 4, y + 14, x + 44, y + 48], fill=color)
        draw.ellipse([x + 8, y + 6, x + 16, y + 14], fill=color)
        draw.ellipse([x + 28, y + 8, x + 36, y + 16], fill=color)
    elif frame == 'ko':
        color = tuple(int(c * 0.5) for c in color)
        draw.ellipse([x + 4, y + 24, x + 44, y + 48], fill=color)
        draw.ellipse([x + 8, y + 16, x + 16, y + 24], fill=color)
        draw.ellipse([x + 28, y + 18, x + 36, y + 26], fill=color)


def draw_goblin(draw, x, y, size, frame):
    """Draw a goblin monster."""
    color = hex_to_rgb(COLORS['dark_green'])
    skin = hex_to_rgb(COLORS['light_green'])

    if frame == 'idle':
        # Body
        draw.rectangle([x + 8, y + 14, x + 40, y + 38], fill=color)
        # Head
        draw.ellipse([x + 10, y + 6, x + 38, y + 16], fill=skin)
        # Ears (pointy)
        draw.polygon([(x + 12, y + 4), (x + 14, y - 2), (x + 16, y + 4)], fill=color)
        draw.polygon([(x + 32, y + 4), (x + 34, y - 2), (x + 36, y + 4)], fill=color)
        # Eyes
        draw.ellipse([x + 14, y + 8, x + 18, y + 12], fill=hex_to_rgb('#ffff00'))
        draw.ellipse([x + 30, y + 8, x + 34, y + 12], fill=hex_to_rgb('#ffff00'))
        # Legs
        draw.rectangle([x + 12, y + 36, x + 18, y + 46], fill=color)
        draw.rectangle([x + 30, y + 36, x + 36, y + 46], fill=color)
    elif frame == 'attack':
        draw.rectangle([x + 6, y + 14, x + 42, y + 36], fill=color)
        draw.ellipse([x + 8, y + 4, x + 40, y + 16], fill=skin)
        draw.polygon([(x + 10, y + 2), (x + 12, y - 4), (x + 14, y + 2)], fill=color)
        draw.polygon([(x + 34, y + 2), (x + 36, y - 4), (x + 38, y + 2)], fill=color)
        draw.ellipse([x + 12, y + 6, x + 16, y + 10], fill=hex_to_rgb('#ffff00'))
        draw.ellipse([x + 32, y + 6, x + 36, y + 10], fill=hex_to_rgb('#ffff00'))
        draw.rectangle([x + 10, y + 34, x + 16, y + 44], fill=color)
        draw.rectangle([x + 32, y + 34, x + 38, y + 44], fill=color)
    elif frame == 'hurt':
        draw.rectangle([x + 8, y + 16, x + 40, y + 40], fill=color)
        draw.ellipse([x + 10, y + 8, x + 38, y + 18], fill=skin)
        draw.polygon([(x + 12, y + 6), (x + 14, y + 0), (x + 16, y + 6)], fill=color)
        draw.polygon([(x + 32, y + 6), (x + 34, y + 0), (x + 36, y + 6)], fill=color)
        draw.ellipse([x + 14, y + 10, x + 18, y + 14], fill=hex_to_rgb('#000000'))
        draw.ellipse([x + 30, y + 10, x + 34, y + 14], fill=hex_to_rgb('#000000'))
        draw.rectangle([x + 12, y + 38, x + 18, y + 46], fill=color)
        draw.rectangle([x + 30, y + 38, x + 36, y + 46], fill=color)
    elif frame == 'ko':
        color = tuple(int(c * 0.6) for c in color)
        skin = tuple(int(c * 0.6) for c in skin)
        draw.rectangle([x + 8, y + 28, x + 40, y + 42], fill=color)
        draw.ellipse([x + 10, y + 18, x + 38, y + 28], fill=skin)


def draw_orc(draw, x, y, size, frame):
    """Draw an orc monster."""
    color = hex_to_rgb(COLORS['brown'])
    skin = hex_to_rgb(COLORS['light_brown'])

    if frame == 'idle':
        # Body
        draw.rectangle([x + 10, y + 18, x + 54, y + 48], fill=color)
        # Head
        draw.ellipse([x + 14, y + 4, x + 50, y + 20], fill=skin)
        # Tusk
        draw.polygon([(x + 18, y + 18), (x + 16, y + 26), (x + 20, y + 26)], fill=hex_to_rgb('#ffff99'))
        draw.polygon([(x + 46, y + 18), (x + 44, y + 26), (x + 48, y + 26)], fill=hex_to_rgb('#ffff99'))
        # Eyes
        draw.ellipse([x + 18, y + 8, x + 24, y + 14], fill=hex_to_rgb('#000000'))
        draw.ellipse([x + 40, y + 8, x + 46, y + 14], fill=hex_to_rgb('#000000'))
        # Legs
        draw.rectangle([x + 14, y + 46, x + 22, y + 62], fill=color)
        draw.rectangle([x + 42, y + 46, x + 50, y + 62], fill=color)
    elif frame == 'attack':
        draw.rectangle([x + 8, y + 16, x + 56, y + 46], fill=color)
        draw.ellipse([x + 12, y + 2, x + 52, y + 18], fill=skin)
        draw.polygon([(x + 16, y + 16), (x + 14, y + 24), (x + 18, y + 24)], fill=hex_to_rgb('#ffff99'))
        draw.polygon([(x + 48, y + 16), (x + 46, y + 24), (x + 50, y + 24)], fill=hex_to_rgb('#ffff99'))
        draw.ellipse([x + 16, y + 6, x + 22, y + 12], fill=hex_to_rgb('#000000'))
        draw.ellipse([x + 42, y + 6, x + 48, y + 12], fill=hex_to_rgb('#000000'))
        draw.rectangle([x + 12, y + 44, x + 20, y + 60], fill=color)
        draw.rectangle([x + 44, y + 44, x + 52, y + 60], fill=color)
        draw.rectangle([x + 52, y + 24, x + 62, y + 40], fill=color)
    elif frame == 'hurt':
        draw.rectangle([x + 10, y + 20, x + 54, y + 50], fill=color)
        draw.ellipse([x + 14, y + 6, x + 50, y + 22], fill=skin)
        draw.ellipse([x + 18, y + 10, x + 24, y + 16], fill=hex_to_rgb('#000000'))
        draw.ellipse([x + 40, y + 10, x + 46, y + 16], fill=hex_to_rgb('#000000'))
        draw.rectangle([x + 14, y + 48, x + 22, y + 62], fill=color)
        draw.rectangle([x + 42, y + 48, x + 50, y + 62], fill=color)
    elif frame == 'ko':
        color = tuple(int(c * 0.6) for c in color)
        skin = tuple(int(c * 0.6) for c in skin)
        draw.rectangle([x + 10, y + 32, x + 54, y + 50], fill=color)
        draw.ellipse([x + 14, y + 18, x + 50, y + 34], fill=skin)
        draw.rectangle([x + 14, y + 48, x + 22, y + 62], fill=color)
        draw.rectangle([x + 42, y + 48, x + 50, y + 62], fill=color)


def draw_skeleton(draw, x, y, size, frame):
    """Draw a skeleton monster."""
    color = hex_to_rgb(COLORS['white'])

    if frame == 'idle':
        # Spine
        draw.rectangle([x + 28, y + 8, x + 36, y + 50], fill=color)
        # Skull
        draw.ellipse([x + 18, y + 4, x + 46, y + 20], fill=color)
        # Eye sockets
        draw.rectangle([x + 22, y + 8, x + 28, y + 14], fill=hex_to_rgb('#000000'))
        draw.rectangle([x + 36, y + 8, x + 42, y + 14], fill=hex_to_rgb('#000000'))
        # Teeth
        for i in range(4):
            draw.rectangle([x + 22 + i*3, y + 16, x + 24 + i*3, y + 18], fill=hex_to_rgb('#000000'))
            draw.rectangle([x + 36 + i*3, y + 16, x + 38 + i*3, y + 18], fill=hex_to_rgb('#000000'))
        # Ribs
        for i in range(3):
            draw.line([x + 16, y + 22 + i*6, x + 48, y + 22 + i*6], fill=color, width=2)
        # Arms
        draw.rectangle([x + 8, y + 26, x + 18, y + 32], fill=color)
        draw.rectangle([x + 46, y + 26, x + 56, y + 32], fill=color)
        # Legs
        draw.rectangle([x + 22, y + 50, x + 28, y + 62], fill=color)
        draw.rectangle([x + 36, y + 50, x + 42, y + 62], fill=color)
    elif frame == 'attack':
        draw.rectangle([x + 28, y + 6, x + 36, y + 48], fill=color)
        draw.ellipse([x + 18, y + 2, x + 46, y + 18], fill=color)
        draw.rectangle([x + 22, y + 6, x + 28, y + 12], fill=hex_to_rgb('#000000'))
        draw.rectangle([x + 36, y + 6, x + 42, y + 12], fill=hex_to_rgb('#000000'))
        for i in range(3):
            draw.line([x + 16, y + 20 + i*6, x + 48, y + 20 + i*6], fill=color, width=2)
        draw.rectangle([x + 4, y + 20, x + 16, y + 28], fill=color)
        draw.rectangle([x + 48, y + 20, x + 60, y + 28], fill=color)
        draw.rectangle([x + 20, y + 48, x + 26, y + 60], fill=color)
        draw.rectangle([x + 38, y + 48, x + 44, y + 60], fill=color)
    elif frame == 'hurt':
        draw.rectangle([x + 28, y + 10, x + 36, y + 52], fill=color)
        draw.ellipse([x + 18, y + 6, x + 46, y + 22], fill=color)
        draw.rectangle([x + 22, y + 10, x + 28, y + 16], fill=hex_to_rgb('#000000'))
        draw.rectangle([x + 36, y + 10, x + 42, y + 16], fill=hex_to_rgb('#000000'))
        draw.rectangle([x + 10, y + 28, x + 20, y + 34], fill=color)
        draw.rectangle([x + 44, y + 28, x + 54, y + 34], fill=color)
        draw.rectangle([x + 22, y + 52, x + 28, y + 62], fill=color)
        draw.rectangle([x + 36, y + 52, x + 42, y + 62], fill=color)
    elif frame == 'ko':
        color = tuple(int(c * 0.7) for c in color)
        draw.rectangle([x + 28, y + 30, x + 36, y + 50], fill=color)
        draw.ellipse([x + 18, y + 24, x + 46, y + 38], fill=color)
        draw.rectangle([x + 22, y + 26, x + 28, y + 32], fill=hex_to_rgb('#404040'))
        draw.rectangle([x + 36, y + 26, x + 42, y + 32], fill=hex_to_rgb('#404040'))
        draw.rectangle([x + 12, y + 48, x + 22, y + 54], fill=color)
        draw.rectangle([x + 42, y + 48, x + 52, y + 54], fill=color)


def draw_dragon(draw, x, y, size, frame):
    """Draw a dragon monster."""
    color = hex_to_rgb(COLORS['red'])

    if frame == 'idle':
        # Body
        draw.ellipse([x + 20, y + 32, x + 76, y + 60], fill=color)
        # Head
        draw.ellipse([x + 60, y + 16, x + 86, y + 36], fill=color)
        # Snout
        draw.rectangle([x + 82, y + 22, x + 92, y + 32], fill=color)
        # Eyes
        draw.ellipse([x + 68, y + 18, x + 74, y + 24], fill=hex_to_rgb('#ffff00'))
        # Horns
        draw.polygon([(x + 64, y + 14), (x + 62, y + 6), (x + 66, y + 12)], fill=color)
        draw.polygon([(x + 82, y + 14), (x + 84, y + 6), (x + 86, y + 12)], fill=color)
        # Wings
        draw.polygon([(x + 50, y + 28), (x + 38, y + 8), (x + 48, y + 24)], fill=hex_to_rgb('#ff6b6b'))
        draw.polygon([(x + 76, y + 28), (x + 88, y + 8), (x + 78, y + 24)], fill=hex_to_rgb('#ff6b6b'))
        # Tail
        draw.ellipse([x + 20, y + 40, x + 32, y + 56], fill=color)
        # Legs
        draw.rectangle([x + 30, y + 58, x + 36, y + 72], fill=color)
        draw.rectangle([x + 60, y + 58, x + 66, y + 72], fill=color)
    elif frame == 'attack':
        draw.ellipse([x + 18, y + 30, x + 78, y + 58], fill=color)
        draw.ellipse([x + 62, y + 12, x + 88, y + 32], fill=color)
        draw.rectangle([x + 84, y + 18, x + 96, y + 28], fill=color)
        draw.ellipse([x + 70, y + 14, x + 76, y + 20], fill=hex_to_rgb('#ffff00'))
        draw.polygon([(x + 66, y + 10), (x + 64, y + 0), (x + 68, y + 8)], fill=color)
        draw.polygon([(x + 84, y + 10), (x + 86, y + 0), (x + 88, y + 8)], fill=color)
        draw.polygon([(x + 48, y + 24), (x + 34, y + 0), (x + 46, y + 20)], fill=hex_to_rgb('#ff6b6b'))
        draw.polygon([(x + 78, y + 24), (x + 92, y + 0), (x + 80, y + 20)], fill=hex_to_rgb('#ff6b6b'))
        draw.ellipse([x + 18, y + 38, x + 32, y + 54], fill=color)
        draw.rectangle([x + 28, y + 56, x + 34, y + 70], fill=color)
        draw.rectangle([x + 62, y + 56, x + 68, y + 70], fill=color)
    elif frame == 'hurt':
        draw.ellipse([x + 20, y + 34, x + 76, y + 62], fill=color)
        draw.ellipse([x + 60, y + 18, x + 86, y + 38], fill=color)
        draw.rectangle([x + 82, y + 24, x + 92, y + 34], fill=color)
        draw.ellipse([x + 68, y + 20, x + 74, y + 26], fill=hex_to_rgb('#000000'))
        draw.polygon([(x + 64, y + 16), (x + 62, y + 8), (x + 66, y + 14)], fill=color)
        draw.polygon([(x + 82, y + 16), (x + 84, y + 8), (x + 86, y + 14)], fill=color)
        draw.polygon([(x + 50, y + 30), (x + 38, y + 12), (x + 48, y + 26)], fill=hex_to_rgb('#ff6b6b'))
        draw.polygon([(x + 76, y + 30), (x + 88, y + 12), (x + 78, y + 26)], fill=hex_to_rgb('#ff6b6b'))
        draw.ellipse([x + 20, y + 42, x + 32, y + 58], fill=color)
        draw.rectangle([x + 30, y + 60, x + 36, y + 72], fill=color)
        draw.rectangle([x + 60, y + 60, x + 66, y + 72], fill=color)
    elif frame == 'ko':
        color = tuple(int(c * 0.6) for c in color)
        draw.ellipse([x + 20, y + 44, x + 76, y + 70], fill=color)
        draw.ellipse([x + 60, y + 28, x + 86, y + 48], fill=color)
        draw.rectangle([x + 82, y + 34, x + 92, y + 44], fill=color)
        draw.ellipse([x + 68, y + 30, x + 74, y + 36], fill=hex_to_rgb('#404040'))
        draw.polygon([(x + 50, y + 40), (x + 38, y + 22), (x + 48, y + 36)], fill=tuple(int(c * 0.6) for c in hex_to_rgb('#ff6b6b')))
        draw.polygon([(x + 76, y + 40), (x + 88, y + 22), (x + 78, y + 36)], fill=tuple(int(c * 0.6) for c in hex_to_rgb('#ff6b6b')))
        draw.rectangle([x + 30, y + 68, x + 36, y + 72], fill=color)
        draw.rectangle([x + 60, y + 68, x + 66, y + 72], fill=color)


def generate_monster_sprite(base_path, monster_type, size):
    """Generate a single monster sprite."""
    frames = ['idle', 'attack', 'hurt', 'ko']
    sprite_imgs = []

    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    for frame in frames:
        img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)

        if monster_type == 'slime':
            draw_slime(draw, 0, 0, size, frame)
        elif monster_type == 'goblin':
            draw_goblin(draw, 0, 0, size, frame)
        elif monster_type == 'orc':
            draw_orc(draw, 0, 0, size, frame)
        elif monster_type == 'skeleton':
            draw_skeleton(draw, 0, 0, size, frame)
        elif monster_type == 'dragon':
            draw_dragon(draw, 0, 0, size, frame)

        # Save individual sprite
        output_dir = os.path.join(base_path, 'static/img/combat/monsters')
        output_path = os.path.join(output_dir, f'{monster_type}_{frame}.png')
        img.save(output_path)
        print(f"Generated: {monster_type}_{frame}.png")

        sprite_imgs.append(img)

    # Generate spritesheet
    spritesheet_width = size * 4
    spritesheet = Image.new('RGBA', (spritesheet_width, size), (255, 255, 255, 0))
    for i, sprite_img in enumerate(sprite_imgs):
        spritesheet.paste(sprite_img, (i * size, 0), sprite_img)

    output_dir = os.path.join(base_path, 'static/img/combat/monsters')
    output_path = os.path.join(output_dir, f'{monster_type}_sheet.png')
    spritesheet.save(output_path)
    print(f"Generated: {monster_type}_sheet.png")


def generate_tile(base_path, tile_type):
    """Generate a single tile sprite."""
    size = 32
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    if tile_type == 'grass':
        draw.rectangle([0, 0, size, size], fill=hex_to_rgb(COLORS['green']))
        draw.rectangle([4, 8, 8, 12], fill=hex_to_rgb(COLORS['dark_green']))
        draw.rectangle([12, 6, 16, 10], fill=hex_to_rgb(COLORS['dark_green']))
        draw.rectangle([20, 8, 24, 12], fill=hex_to_rgb(COLORS['dark_green']))
        draw.rectangle([28, 6, 32, 10], fill=hex_to_rgb(COLORS['dark_green']))
        draw.rectangle([6, 18, 10, 22], fill=hex_to_rgb(COLORS['dark_green']))
        draw.rectangle([16, 20, 20, 24], fill=hex_to_rgb(COLORS['dark_green']))
        draw.rectangle([24, 18, 28, 22], fill=hex_to_rgb(COLORS['dark_green']))

    elif tile_type == 'dirt':
        draw.rectangle([0, 0, size, size], fill=hex_to_rgb(COLORS['brown']))
        # Dirt texture
        for x in range(0, size, 8):
            for y in range(0, size, 8):
                draw.rectangle([x + 2, y + 2, x + 6, y + 6], fill=hex_to_rgb(COLORS['light_brown']))

    elif tile_type == 'stone':
        draw.rectangle([0, 0, size, size], fill=hex_to_rgb(COLORS['gray']))
        # Stone grid pattern
        for x in range(0, size, 16):
            draw.line([x, 0, x, size], fill=hex_to_rgb(COLORS['dark_gray']), width=1)
        for y in range(0, size, 16):
            draw.line([0, y, size, y], fill=hex_to_rgb(COLORS['dark_gray']), width=1)
        # Stone texture
        for x in range(2, size, 8):
            for y in range(2, size, 8):
                draw.rectangle([x, y, x + 2, y + 2], fill=hex_to_rgb(COLORS['dark_gray']))

    elif tile_type == 'water':
        draw.rectangle([0, 0, size, size], fill=hex_to_rgb(COLORS['dark_blue']))
        # Wave pattern
        for i in range(0, size, 4):
            draw.arc([i - 2, 0, i + 6, 8], 0, 180, fill=hex_to_rgb(COLORS['light_blue']), width=1)
            draw.arc([i - 2, 8, i + 6, 16], 0, 180, fill=hex_to_rgb(COLORS['light_blue']), width=1)
            draw.arc([i - 2, 16, i + 6, 24], 0, 180, fill=hex_to_rgb(COLORS['light_blue']), width=1)
            draw.arc([i - 2, 24, i + 6, 32], 0, 180, fill=hex_to_rgb(COLORS['light_blue']), width=1)

    # Save tile
    output_dir = os.path.join(base_path, 'static/img/combat/tiles')
    output_path = os.path.join(output_dir, f'{tile_type}.png')
    img.save(output_path)
    print(f"Generated: {tile_type}.png")

    return img


def generate_tileset(base_path):
    """Generate a tileset with all tile types."""
    tile_types = ['grass', 'dirt', 'stone', 'water']
    tileset = Image.new('RGBA', (128, 32), (255, 255, 255, 0))

    for i, tile_type in enumerate(tile_types):
        tile_img = generate_tile(base_path, tile_type)
        tileset.paste(tile_img, (i * 32, 0), tile_img)

    output_dir = os.path.join(base_path, 'static/img/combat/tiles')
    output_path = os.path.join(output_dir, 'tileset.png')
    tileset.save(output_path)
    print(f"Generated: tileset.png")


def generate_effect(base_path, effect_type):
    """Generate a single effect sprite."""
    size = 64
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    if effect_type == 'slash':
        # Red diagonal slash lines
        draw.line([20, 10, 44, 54], fill=hex_to_rgb(COLORS['red']), width=3)
        draw.line([18, 14, 46, 58], fill=hex_to_rgb(COLORS['red']), width=2)
        draw.line([22, 6, 48, 50], fill=hex_to_rgb(COLORS['red']), width=2)
        draw.line([24, 12, 50, 56], fill=hex_to_rgb(COLORS['orange']), width=2)
        draw.line([20, 16, 44, 52], fill=hex_to_rgb(COLORS['orange']), width=1)

    elif effect_type == 'fireball':
        # Orange/yellow circle with glow
        draw.ellipse([16, 16, 48, 48], fill=hex_to_rgb(COLORS['light_orange']))
        draw.ellipse([20, 20, 44, 44], fill=hex_to_rgb(COLORS['yellow_bright']))
        # Inner glow
        draw.ellipse([24, 24, 40, 40], fill=hex_to_rgb(COLORS['white']))
        # Outer glow
        draw.ellipse([12, 12, 52, 52], outline=hex_to_rgb(COLORS['orange']), width=2)
        draw.ellipse([10, 10, 54, 54], outline=hex_to_rgb(COLORS['light_orange']), width=1)

    elif effect_type == 'heal':
        # Green circles/sparkles
        draw.ellipse([20, 20, 44, 44], fill=hex_to_rgb(COLORS['light_green']))
        draw.ellipse([26, 26, 38, 38], fill=hex_to_rgb(COLORS['green']))
        # Sparkle points
        draw.polygon([(32, 8), (34, 14), (40, 12), (36, 16), (38, 22), (32, 18), (26, 22), (28, 16), (24, 12), (30, 14)], fill=hex_to_rgb(COLORS['light_green']))
        draw.polygon([(8, 32), (14, 34), (12, 40), (16, 36), (22, 38), (18, 32), (22, 26), (16, 28), (12, 24), (14, 30)], fill=hex_to_rgb(COLORS['light_green']))
        draw.polygon([(56, 32), (60, 34), (62, 40), (58, 36), (62, 38), (56, 32), (56, 26), (58, 28), (62, 24), (60, 30)], fill=hex_to_rgb(COLORS['light_green']))

    elif effect_type == 'shield':
        # Blue translucent circle
        # Create semi-transparent blue
        overlay = Image.new('RGBA', (size, size), (255, 255, 255, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.ellipse([12, 12, 52, 52], fill=hex_to_rgb(COLORS['light_blue']) + (180,))
        overlay_draw.ellipse([16, 16, 48, 48], outline=hex_to_rgb(COLORS['blue']), width=2)
        # Protective cross pattern inside
        overlay_draw.line([32, 18, 32, 46], fill=hex_to_rgb(COLORS['blue']), width=2)
        overlay_draw.line([18, 32, 46, 32], fill=hex_to_rgb(COLORS['blue']), width=2)
        img = Image.alpha_composite(img, overlay)

    # Save effect
    output_dir = os.path.join(base_path, 'static/img/combat/effects')
    output_path = os.path.join(output_dir, f'{effect_type}.png')
    img.save(output_path)
    print(f"Generated: {effect_type}.png")

    return img


def main():
    """Generate all sprites."""
    # Get base path
    base_path = os.path.dirname(os.path.abspath(__file__))

    print(f"Base path: {base_path}")
    print("Creating directories...")
    create_directories(base_path)

    # Generate chihuahua classes
    print("\nGenerating Chihuahua Classes...")
    chihuahua_classes = {
        'guerrier': COLORS['red'],
        'mage': COLORS['purple'],
        'archer': COLORS['green'],
        'guerisseur': COLORS['yellow'],
    }

    for class_name, class_color in chihuahua_classes.items():
        print(f"\nGenerating {class_name} chihuahua...")
        generate_chihuahua_spritesheet(base_path, class_name, class_color)

    # Generate monsters
    print("\nGenerating Monsters...")
    monsters = {
        'slime': 48,
        'goblin': 48,
        'orc': 64,
        'skeleton': 64,
        'dragon': 96,
    }

    for monster_type, size in monsters.items():
        print(f"\nGenerating {monster_type}...")
        generate_monster_sprite(base_path, monster_type, size)

    # Generate tiles
    print("\nGenerating Tiles...")
    tile_types = ['grass', 'dirt', 'stone', 'water']
    for tile_type in tile_types:
        generate_tile(base_path, tile_type)

    print("\nGenerating tileset...")
    generate_tileset(base_path)

    # Generate effects
    print("\nGenerating Effects...")
    effect_types = ['slash', 'fireball', 'heal', 'shield']
    for effect_type in effect_types:
        generate_effect(base_path, effect_type)

    print("\n" + "="*50)
    print("All sprites generated successfully!")
    print("="*50)


if __name__ == '__main__':
    main()
