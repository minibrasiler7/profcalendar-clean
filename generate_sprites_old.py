#!/usr/bin/env python3
"""
Sprite generator for ProfCalendar RPG — Chihuahua avatars
Uses Replicate API with Flux Schnell to generate chihuahua RPG character sprites.
"""

import os
import time
import requests
import replicate

# ── Config ──────────────────────────────────────────────────────
OUTPUT_DIR = "/sessions/zen-optimistic-gauss/profcalendar-temp/static/img/chihuahua"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Replicate API key — set via environment variable:
#   export REPLICATE_API_TOKEN="your_key_here"
if not os.environ.get("REPLICATE_API_TOKEN"):
    print("❌ Set REPLICATE_API_TOKEN environment variable first")
    print("   export REPLICATE_API_TOKEN='r8_...'")
    exit(1)

# ── Prompt definitions ──────────────────────────────────────────
# Base style consistent across all sprites
BASE_STYLE = (
    "cute chibi chihuahua dog character, RPG game sprite, "
    "full body, front-facing, centered, white background, "
    "clean digital art, cartoon style, vibrant colors, "
    "high quality, game asset, no text, single character, pixel-perfect edges"
)

SPRITES = {
    # ─── 4 Base classes ───
    "guerrier": f"a {BASE_STYLE}, warrior class, wearing steel plate armor and helmet with horns, holding a large sword, red cape, fierce determined expression, medieval knight theme",
    "mage": f"a {BASE_STYLE}, mage class, wearing dark purple wizard robe and pointed hat with stars, holding a glowing magic staff with crystal orb, mystical blue aura, magical sparkles",
    "archer": f"a {BASE_STYLE}, archer class, wearing green leather armor and hood like Robin Hood, carrying a wooden bow and quiver of arrows on back, forest ranger theme",
    "guerisseur": f"a {BASE_STYLE}, healer monk class, wearing white and gold monastic robes, holding a golden holy staff with glowing light, peaceful serene expression, divine halo effect",

    # ─── Guerrier evolutions ───
    "chevalier": f"a {BASE_STYLE}, holy knight paladin, wearing shining silver plate armor with golden cross emblem, large tower shield and holy sword, blue cape, noble and righteous look",
    "berserker": f"a {BASE_STYLE}, berserker barbarian, wearing torn dark red fur armor, dual wielding battle axes, wild fierce expression, glowing red eyes, fire aura, battle scars, rage mode",
    "paladin": f"a {BASE_STYLE}, sacred paladin warrior, wearing ornate white and gold heavy armor with angel wings motif, wielding holy glowing greatsword, divine golden light aura, halo above head",
    "gladiateur": f"a {BASE_STYLE}, gladiator champion, wearing bronze Roman gladiator armor with leather straps, wielding trident and net, red mohawk helmet crest, arena fighter, muscular",

    # ─── Mage evolutions ───
    "pyromancien": f"a {BASE_STYLE}, fire mage pyromancer, wearing dark red and black robes with flame patterns, hands engulfed in fire, fire crown, casting fireball, ember particles, intense orange glow",
    "enchanteur": f"a {BASE_STYLE}, enchanter illusionist, wearing elegant teal and silver flowing robes, holding enchanted book of spells, swirling magical runes orbiting around, mystical purple and teal aura",
    "archimage": f"a {BASE_STYLE}, archmage supreme wizard, wearing majestic dark blue and gold ornate robes with constellation patterns, wielding ancient staff with massive glowing crystal, multiple floating orbs of power, cosmic energy aura",
    "chronomancien": f"a {BASE_STYLE}, chronomancer time mage, wearing silver and clock-themed robes with gear patterns, holding floating hourglass and clock hands, warped space-time effects, blue-white temporal energy spirals",

    # ─── Archer evolutions ───
    "ranger": f"a {BASE_STYLE}, forest ranger survivor, wearing brown and green camouflage leather armor with leaf patterns, carrying longbow and hunting knife, wolf companion pet beside, nature theme, vines",
    "sniper": f"a {BASE_STYLE}, elite sniper sharpshooter, wearing dark navy tactical leather with crosshair emblem, wielding ornate mechanical crossbow with scope, one eye glowing with targeting reticle, precise and calm",
    "chasseur_de_dragons": f"a {BASE_STYLE}, legendary dragon hunter, wearing dragon scale armor in dark red and black, wielding dragon fang spear and dragonbone shield, dragon tooth necklace, epic hero pose, fire-resistant cloak",
    "assassin": f"a {BASE_STYLE}, shadow assassin ninja, wearing dark black and purple stealth outfit with hood and mask, dual wielding curved daggers, shadow energy wisps, stealthy crouching pose, mysterious glowing violet eyes",

    # ─── Guérisseur evolutions ───
    "pretre": f"a {BASE_STYLE}, high priest divine healer, wearing elaborate white and gold priestly vestments with holy symbols, wielding golden scepter with radiant cross, healing light beams, angelic wings of light",
    "druide": f"a {BASE_STYLE}, nature druid shaman, wearing brown and green wooden bark armor with moss and flowers, holding gnarled oak staff with glowing green crystal, small forest spirits floating nearby, leaves swirling",
    "saint": f"a {BASE_STYLE}, divine saint celestial being, wearing pure white and gold ethereal robes, massive golden halo and angel wings, radiating warm healing golden light in all directions, floating above ground, peaceful divine expression",
    "chaman": f"a {BASE_STYLE}, spirit shaman mystic, wearing tribal feathered outfit with bone decorations and spirit mask, holding totem staff with glowing spirit orbs, ghostly spirit animals circling, blue and green spiritual energy",
}


def generate_sprite(name, prompt):
    """Generate a single sprite using Replicate Flux Schnell."""
    output_path = os.path.join(OUTPUT_DIR, f"{name}.png")

    # Skip if already exists (for re-runs)
    if os.path.exists(output_path) and os.path.getsize(output_path) > 10000:
        print(f"⏭️  {name}.png already exists, skipping")
        return True

    print(f"🎨 Generating {name}...")
    try:
        output = replicate.run(
            "black-forest-labs/flux-schnell",
            input={
                "prompt": prompt,
                "num_outputs": 1,
                "aspect_ratio": "1:1",
                "output_format": "png",
                "output_quality": 95,
                "go_fast": True,
            }
        )

        # output is a list of FileOutput URLs
        if output and len(output) > 0:
            img_url = str(output[0])
            print(f"   ↳ Downloading from {img_url[:80]}...")

            response = requests.get(img_url, timeout=60)
            if response.status_code == 200:
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                size_kb = os.path.getsize(output_path) / 1024
                print(f"   ✅ {name}.png saved ({size_kb:.0f} KB)")
                return True
            else:
                print(f"   ❌ Download failed: HTTP {response.status_code}")
                return False
        else:
            print(f"   ❌ No output returned")
            return False

    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def main():
    print(f"╔══════════════════════════════════════════════╗")
    print(f"║  ProfCalendar RPG — Chihuahua Sprite Gen    ║")
    print(f"║  {len(SPRITES)} sprites to generate              ║")
    print(f"╚══════════════════════════════════════════════╝\n")

    success = 0
    failed = []

    for name, prompt in SPRITES.items():
        ok = generate_sprite(name, prompt)
        if ok:
            success += 1
        else:
            failed.append(name)
        # Small delay to be nice to the API
        time.sleep(1)

    print(f"\n{'='*50}")
    print(f"✅ Generated: {success}/{len(SPRITES)}")
    if failed:
        print(f"❌ Failed: {', '.join(failed)}")
    print(f"📁 Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
