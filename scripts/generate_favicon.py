#!/usr/bin/env python3
"""
Générateur du favicon du site ProfCalendar.

Reprend exactement le logo utilisé pour l'app iPad « ProfCalendar Enseignant »
(le PNG 1024x1024 de l'AppIcon) et en décline toutes les tailles attendues par
les navigateurs et plateformes :

  - favicon.ico          (multi-résolution 16/32/48, demandé d'office par les navigateurs)
  - favicon-16x16.png    (onglets)
  - favicon-32x32.png    (onglets HiDPI / barre des tâches)
  - apple-touch-icon.png (180x180, écran d'accueil iOS — fond opaque exigé)
  - android-chrome-192x192.png / -512x512.png (PWA / Android)
  - site.webmanifest

Le logo source comporte une large marge blanche : on recadre automatiquement
sur le contenu (bounding box des pixels non-blancs) puis on le recentre sur un
carré blanc avec une marge contrôlée, pour que le dessin reste lisible à 16px.

Usage:
    python3 scripts/generate_favicon.py
"""

from PIL import Image
import os

# Logo source = AppIcon de l'app iPad Enseignant
SOURCE_LOGO = (
    'ios/ProfCalendarEnseignant/ProfCalendarEnseignant/'
    'Assets.xcassets/AppIcon.appiconset/ChatGPT Image 15 avr. 2026 à 20_40_56.png'
)

OUTPUT_DIR = 'static/img/favicon'

# Tailles PNG à générer (nom de fichier -> côté en px)
PNG_SIZES = {
    'favicon-16x16.png': 16,
    'favicon-32x32.png': 32,
    'favicon-48x48.png': 48,
    'apple-touch-icon.png': 180,
    'android-chrome-192x192.png': 192,
    'android-chrome-512x512.png': 512,
}

# Résolutions empaquetées dans favicon.ico
ICO_SIZES = [16, 32, 48]

# Marge blanche conservée autour du contenu recadré (fraction du côté du contenu)
PADDING_RATIO = 0.08

# Seuil au-delà duquel un pixel est considéré comme « fond blanc »
WHITE_THRESHOLD = 248


def autocrop_to_square(img):
    """Recadre sur le contenu non-blanc puis recentre sur un carré blanc.

    Retourne une image RGB carrée, fond blanc, contenu centré avec une marge.
    """
    rgb = img.convert('RGB')

    # Bounding box du contenu : on isole les pixels « non blancs ».
    # On crée un masque en convertissant en niveaux de gris puis en seuillant.
    gray = rgb.convert('L')
    mask = gray.point(lambda p: 255 if p < WHITE_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        # Image entièrement blanche (cas improbable) : on garde tel quel
        content = rgb
    else:
        content = rgb.crop(bbox)

    # Côté du carré = plus grande dimension du contenu + marge
    cw, ch = content.size
    side = max(cw, ch)
    padding = int(side * PADDING_RATIO)
    canvas_side = side + 2 * padding

    canvas = Image.new('RGB', (canvas_side, canvas_side), (255, 255, 255))
    offset = ((canvas_side - cw) // 2, (canvas_side - ch) // 2)
    canvas.paste(content, offset)
    return canvas


def main():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    source_path = os.path.join(project_root, SOURCE_LOGO)
    output_dir = os.path.join(project_root, OUTPUT_DIR)
    os.makedirs(output_dir, exist_ok=True)

    print(f"Logo source : {source_path}")
    if not os.path.exists(source_path):
        raise SystemExit(f"❌ Logo introuvable : {source_path}")

    src = Image.open(source_path)
    print(f"  Dimensions source : {src.size[0]}x{src.size[1]}")

    base = autocrop_to_square(src)
    print(f"  Carré recadré : {base.size[0]}x{base.size[1]}")
    print()

    # PNG individuels (LANCZOS = rééchantillonnage de haute qualité)
    for filename, size in PNG_SIZES.items():
        icon = base.resize((size, size), Image.LANCZOS)
        out = os.path.join(output_dir, filename)
        icon.save(out, 'PNG', optimize=True)
        print(f"✓ {filename} ({size}x{size})")

    # favicon.ico multi-résolution
    ico_path = os.path.join(output_dir, 'favicon.ico')
    base.resize((256, 256), Image.LANCZOS).save(
        ico_path, format='ICO', sizes=[(s, s) for s in ICO_SIZES]
    )
    print(f"✓ favicon.ico ({'/'.join(str(s) for s in ICO_SIZES)})")

    print()
    print("✅ Favicon généré dans", OUTPUT_DIR)


if __name__ == '__main__':
    main()
