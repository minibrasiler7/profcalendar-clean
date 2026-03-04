#!/usr/bin/env python3
"""
Generate monster walk & attack animation spritesheets using PixelLab API.

Usage:
    1. Set your PixelLab API key: export PIXELLAB_SECRET=your_key_here
    2. Run: python generate_monster_animations.py [--monsters slime,wolf] [--actions walk,attack]

This script:
- Reads existing monster sprites as reference images
- Uses PixelLab's animate_with_text to generate 4-frame walk and attack animations
- Saves spritesheets (4 frames × image_width) for each monster/direction/action
- For each direction (se, sw, ne, nw), generates walk + attack animations

Output structure:
    static/img/combat/monsters/{monster}/walk_{dir}.png   (spritesheet: 4 frames)
    static/img/combat/monsters/{monster}/attack_{dir}.png  (spritesheet: 4 frames)
"""

import os
import sys
import time
import argparse
from PIL import Image

# ── Monster descriptions for PixelLab ──
MONSTER_DESCRIPTIONS = {
    'slime': 'a green slime blob monster, pixel art RPG enemy',
    'rat': 'a giant rat monster, pixel art RPG enemy, brown fur',
    'kobold': 'a small kobold lizard warrior, pixel art RPG enemy, green scales',
    'bat': 'a dark bat creature with spread wings, pixel art RPG enemy',
    'goblin': 'a green goblin warrior with a club, pixel art RPG enemy',
    'wolf': 'a grey wolf, pixel art RPG enemy, silver fur',
    'zombie': 'a shambling zombie with torn clothes, pixel art RPG enemy, green skin',
    'mushroom': 'a mushroom creature monster, pixel art RPG enemy, red cap',
    'bandit': 'a human bandit thief with a dagger, pixel art RPG enemy',
    'fire_elemental': 'a fire elemental made of flames, pixel art RPG enemy, orange fire',
    'ogre': 'a large ogre brute with a club, pixel art RPG enemy, brown skin',
    'vampire': 'a vampire lord with a cape, pixel art RPG enemy, pale skin',
    'witch': 'a dark witch with a pointed hat, pixel art RPG enemy, purple robes',
    'spider': 'a giant spider with eight legs, pixel art RPG enemy, dark body',
    'golem': 'a stone golem creature, pixel art RPG enemy, grey rock body',
    'necromancer': 'a necromancer dark mage with a staff, pixel art RPG enemy',
    'lich': 'a lich undead sorcerer with glowing eyes, pixel art RPG enemy',
    'dragon': 'a red dragon with wings, pixel art RPG enemy, scales and fire',
    'hydra': 'a multi-headed hydra serpent, pixel art RPG enemy, green scales',
    'shadow': 'a dark shadow wraith ghost, pixel art RPG enemy, ethereal dark form',
}

# Map our directions (se/sw/ne/nw) to PixelLab Direction type
DIR_TO_PIXELLAB = {
    'se': 'south-east',
    'sw': 'south-west',
    'ne': 'north-east',
    'nw': 'north-west',
}

# Actions to generate
ACTIONS = {
    'walk': 'walking forward slowly, moving legs',
    'attack': 'attacking with a powerful strike, lunging forward',
}

# Per-monster attack overrides for more appropriate animations
ATTACK_OVERRIDES = {
    'slime': 'bouncing up and slamming down, stretching body',
    'bat': 'diving forward with claws extended, swooping attack',
    'fire_elemental': 'shooting a fireball, flames intensifying',
    'spider': 'lunging forward with fangs, biting attack',
    'dragon': 'breathing fire, opening mouth wide',
    'hydra': 'striking forward with multiple heads, biting',
    'shadow': 'lunging forward with dark energy, ethereal strike',
    'witch': 'casting a spell, waving staff with magic energy',
    'necromancer': 'casting dark magic, raising staff with purple energy',
    'lich': 'casting a death spell, skeletal hands glowing',
    'mushroom': 'releasing spores, puffing up body',
    'wolf': 'leaping forward to bite, pouncing attack',
}

WALK_OVERRIDES = {
    'slime': 'bouncing slowly, squishing and stretching',
    'bat': 'flying forward, flapping wings',
    'fire_elemental': 'floating forward, flames flickering',
    'shadow': 'gliding forward, ethereal movement',
    'spider': 'crawling forward, moving eight legs',
}


def generate_animations(monsters=None, actions=None, sprite_size=56):
    """Generate walk and attack animations for all monsters."""
    try:
        import pixellab
    except ImportError:
        print("ERROR: pixellab not installed. Run: pip install pixellab")
        sys.exit(1)

    # Initialize client
    secret = os.environ.get('PIXELLAB_SECRET')
    if not secret:
        print("ERROR: Set PIXELLAB_SECRET environment variable with your PixelLab API key")
        print("  Get a key at: https://www.pixellab.ai/pixellab-api")
        sys.exit(1)

    client = pixellab.Client(secret=secret)

    # Check balance
    try:
        balance = client.get_balance()
        print(f"PixelLab balance: ${balance.usd:.2f}")
    except Exception as e:
        print(f"Warning: Could not check balance: {e}")

    base_dir = os.path.join(os.path.dirname(__file__), 'static', 'img', 'combat', 'monsters')

    if monsters is None:
        monsters = list(MONSTER_DESCRIPTIONS.keys())
    if actions is None:
        actions = list(ACTIONS.keys())

    total = len(monsters) * len(actions) * 4  # 4 directions
    done = 0
    errors = []

    for monster in monsters:
        desc = MONSTER_DESCRIPTIONS.get(monster, f'a {monster} monster, pixel art RPG enemy')
        monster_dir = os.path.join(base_dir, monster)

        if not os.path.isdir(monster_dir):
            print(f"  SKIP {monster}: directory not found")
            continue

        for action_name in actions:
            # Get action description
            if action_name == 'attack' and monster in ATTACK_OVERRIDES:
                action_desc = ATTACK_OVERRIDES[monster]
            elif action_name == 'walk' and monster in WALK_OVERRIDES:
                action_desc = WALK_OVERRIDES[monster]
            else:
                action_desc = ACTIONS[action_name]

            for dir_key, pixellab_dir in DIR_TO_PIXELLAB.items():
                done += 1
                output_path = os.path.join(monster_dir, f'{action_name}_{dir_key}.png')

                # Skip if already generated
                if os.path.exists(output_path):
                    print(f"  [{done}/{total}] SKIP {monster}/{action_name}_{dir_key} (exists)")
                    continue

                # Load reference image
                ref_path = os.path.join(monster_dir, f'{dir_key}.png')
                if not os.path.exists(ref_path):
                    print(f"  [{done}/{total}] SKIP {monster}/{action_name}_{dir_key} (no ref sprite)")
                    continue

                try:
                    ref_img = Image.open(ref_path).convert('RGBA')
                except Exception as e:
                    print(f"  [{done}/{total}] SKIP {monster}/{action_name}_{dir_key} (bad ref: {e})")
                    continue

                # Determine image size (use original or default to 56)
                w, h = ref_img.size
                img_size = {"width": w, "height": h}

                print(f"  [{done}/{total}] Generating {monster}/{action_name}_{dir_key}...", end=' ', flush=True)

                try:
                    response = client.animate_with_text(
                        image_size=img_size,
                        description=desc,
                        action=action_desc,
                        reference_image=ref_img,
                        view="high top-down",  # isometric-like view
                        direction=pixellab_dir,
                        n_frames=4,
                        start_frame_index=0,
                        text_guidance_scale=7.5,
                        image_guidance_scale=1.5,
                        seed=42,  # reproducible
                    )

                    # Combine frames into a spritesheet (horizontal strip)
                    frames = [img.pil_image() for img in response.images]
                    if not frames:
                        print("NO FRAMES")
                        continue

                    sheet_w = w * len(frames)
                    sheet_h = h
                    spritesheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
                    for i, frame in enumerate(frames):
                        # Resize frame to match original sprite size if needed
                        if frame.size != (w, h):
                            frame = frame.resize((w, h), Image.NEAREST)
                        spritesheet.paste(frame, (i * w, 0))

                    spritesheet.save(output_path)
                    cost = response.usage.usd if hasattr(response, 'usage') else '?'
                    print(f"OK ({len(frames)} frames, ${cost})")

                    # Small delay to avoid rate limiting
                    time.sleep(0.5)

                except Exception as e:
                    error_msg = f"{monster}/{action_name}_{dir_key}: {e}"
                    print(f"ERROR: {e}")
                    errors.append(error_msg)
                    time.sleep(1)  # longer delay on error

    print(f"\n{'='*50}")
    print(f"Done! Generated {done - len(errors)} / {total} spritesheets")
    if errors:
        print(f"\n{len(errors)} errors:")
        for e in errors:
            print(f"  - {e}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate monster animation spritesheets via PixelLab API')
    parser.add_argument('--monsters', type=str, help='Comma-separated list of monsters (default: all)')
    parser.add_argument('--actions', type=str, help='Comma-separated list of actions (default: walk,attack)')
    parser.add_argument('--sprite-size', type=int, default=56, help='Sprite size in pixels (default: 56)')
    args = parser.parse_args()

    monsters = args.monsters.split(',') if args.monsters else None
    actions = args.actions.split(',') if args.actions else None

    print("="*50)
    print("PixelLab Monster Animation Generator")
    print("="*50)
    print(f"Monsters: {monsters or 'ALL (20)'}")
    print(f"Actions: {actions or 'walk, attack'}")
    print(f"Directions: se, sw, ne, nw")
    print(f"Total animations: {len(monsters or MONSTER_DESCRIPTIONS) * len(actions or ACTIONS) * 4}")
    print()

    generate_animations(monsters, actions, args.sprite_size)
