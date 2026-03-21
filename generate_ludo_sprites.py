#!/usr/bin/env python3
"""
==========================================================================
  ProfCalendar RPG — Générateur de Sprites via l'API Ludo.ai
==========================================================================

Ce script génère tous les sprites nécessaires pour le jeu RPG isométrique
style Final Fantasy Tactics, avec des chihuahuas fantasy comme personnages.

Usage:
    # Définir la clé API dans une variable d'environnement
    export LUDO_API_KEY="votre-clé-api-ici"

    # Générer tout
    python generate_ludo_sprites.py --all

    # Générer seulement les portraits manquants
    python generate_ludo_sprites.py --portraits

    # Générer seulement les sprites de mouvement
    python generate_ludo_sprites.py --movement

    # Générer seulement les sprites d'attaque
    python generate_ludo_sprites.py --attacks

    # Générer seulement les sprites de mort
    python generate_ludo_sprites.py --death

    # Générer seulement les tuiles de terrain
    python generate_ludo_sprites.py --terrain

    # Générer pour une classe spécifique
    python generate_ludo_sprites.py --class guerrier

    # Mode dry-run (affiche l'inventaire sans appeler l'API)
    python generate_ludo_sprites.py --dry-run

Estimation crédits:
    - Portraits: ~13 classes × 0.5 = 6.5 crédits
    - Mouvement: ~20 classes × 2 directions × 0.5 (pose) + 5 (anim) = ~110 crédits
    - Attaques: ~62 skills × 2 directions × 5 = ~620 crédits
    - Mort: ~20 classes × 0.5 = 10 crédits
    - Terrain: ~8 tuiles × 0.5 = 4 crédits
    - TOTAL ESTIMÉ: ~750 crédits (environ 3 mois du plan Indie)
"""

import os
import sys
import json
import time
import base64
import argparse
import random
import logging
from pathlib import Path
from io import BytesIO

try:
    import requests
except ImportError:
    print("❌ Module 'requests' requis. Installez-le avec: pip install requests")
    sys.exit(1)

try:
    from PIL import Image, ImageOps
except ImportError:
    print("❌ Module 'Pillow' requis. Installez-le avec: pip install Pillow")
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

API_BASE_URL = "https://api.ludo.ai/api"
API_KEY = os.environ.get("LUDO_API_KEY", "")

# Dossiers de sortie
BASE_DIR = Path(__file__).parent
PORTRAITS_DIR = BASE_DIR / "static" / "img" / "chihuahua"
SPRITES_DIR = BASE_DIR / "static" / "img" / "sprites"
MOVEMENT_DIR = SPRITES_DIR / "movement"
ATTACK_DIR = SPRITES_DIR / "attacks"
DEATH_DIR = SPRITES_DIR / "death"
TERRAIN_DIR = SPRITES_DIR / "terrain"
STYLE_REFERENCES_DIR = PORTRAITS_DIR / "références"

# Délai entre les requêtes API (rate limit: 1 requête simultanée)
API_DELAY = 3  # secondes

# Configuration des sprites
SPRITE_FRAME_SIZE = 128  # pixels par frame
SPRITE_FRAMES = 9        # frames par animation de mouvement
ATTACK_FRAMES = 9         # frames par animation d'attaque

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  STYLE DE RÉFÉRENCE (basé sur les images existantes)
# ═══════════════════════════════════════════════════════════════════

# Ce prompt de style est ajouté à chaque génération pour maintenir la cohérence
STYLE_PREFIX = (
    "Chihuahua dog character in detailed comic fantasy art style, "
    "chibi proportions with large head and small muscular body, "
    "thick bold black ink outlines, detailed crosshatching and shading, "
    "richly detailed fantasy armor, leather straps, weapons, and accessories, "
    "dynamic action pose, expressive fierce face, "
    "muted earthy tones with selective color accents, "
    "white background, full body character art, centered, "
    "high detail comic book illustration quality, "
    "no text, no watermark"
)

# Prompt spécifique pour les sprites isométriques (plus petit, plus simple)
SPRITE_STYLE_PREFIX = (
    "Chihuahua dog character sprite for isometric RPG game, "
    "chibi proportions, thick bold black ink outlines, "
    "detailed comic fantasy art style, transparent background, "
    "clean crisp edges, readable silhouette, muted earthy tones, "
    "game-ready sprite asset, comic book illustration quality"
)


# ═══════════════════════════════════════════════════════════════════
#  DÉFINITION DES CLASSES ET COMPÉTENCES
# ═══════════════════════════════════════════════════════════════════

# Classes de base + évolutions avec leurs descriptions visuelles
CLASSES = {
    # ── CLASSES DE BASE ──
    'guerrier': {
        'name': 'Guerrier',
        'has_portrait': True,
        'visual': 'wearing dark leather armor with metal plates, red bandana, wielding a short sword and small round shield, dark cape',
        'color': '#ef4444',
    },
    'mage': {
        'name': 'Mage',
        'has_portrait': True,
        'visual': 'wearing purple wizard robes with golden ornaments, large purple wizard hat with jewel, holding crystal staff with blue gem, reading a spellbook, blue magical aura swirling',
        'color': '#667eea',
    },
    'archer': {
        'name': 'Archer',
        'has_portrait': True,
        'visual': 'wearing green hooded cloak and leather armor, holding ornate bow with green magical energy, quiver of arrows on back',
        'color': '#10b981',
    },
    'guerisseur': {
        'name': 'Guérisseur',
        'has_portrait': True,
        'visual': 'wearing white and gold healer robes with red trim, hood up, holding golden winged staff, glowing green healing heart magic in hand',
        'color': '#f59e0b',
    },

    # ── ÉVOLUTIONS GUERRIER ──
    'chevalier': {
        'name': 'Chevalier',
        'has_portrait': True,
        'visual': 'wearing full silver plate armor with red plume helmet and golden crown, wielding holy sword and ornate shield with cross emblem, red cape flowing',
        'color': '#c0c0c0',
    },
    'berserker': {
        'name': 'Berserker',
        'has_portrait': True,
        'visual': 'wearing spiked bone and metal armor, red mohawk, wielding two flaming battle axes, skull decorations, fierce expression, fire effects',
        'color': '#ef4444',
    },
    'paladin': {
        'name': 'Paladin',
        'has_portrait': False,
        'visual': 'wearing shining white and gold holy plate armor, angelic wings small on back, wielding golden holy sword glowing with divine light, halo effect, blue cape',
        'color': '#fbbf24',
    },
    'gladiateur': {
        'name': 'Gladiateur',
        'has_portrait': False,
        'visual': 'wearing Roman-style gladiator armor with exposed muscular chest, metal shoulder guards, wielding trident and net, leather straps, arena champion crown',
        'color': '#b91c1c',
    },

    # ── ÉVOLUTIONS MAGE ──
    'pyromancien': {
        'name': 'Pyromancien',
        'has_portrait': False,
        'visual': 'wearing red and black flame-pattern robes, fire crown on head, wielding burning fire staff, surrounded by flames and embers, molten eyes glowing',
        'color': '#ef4444',
    },
    'enchanteur': {
        'name': 'Enchanteur',
        'has_portrait': False,
        'visual': 'wearing elegant purple and silver enchanted robes with rune patterns, floating magical runes around body, holding crystalline orb, mystical third eye on forehead',
        'color': '#a855f7',
    },
    'archimage': {
        'name': 'Archimage',
        'has_portrait': False,
        'visual': 'wearing grand dark blue and gold archmage robes with constellation patterns, enormous pointed hat with stars, holding ancient tome and galaxy staff, cosmic energy swirling',
        'color': '#1e3a8a',
    },
    'chronomancien': {
        'name': 'Chronomancien',
        'has_portrait': False,
        'visual': 'wearing teal and bronze clockwork robes with gear patterns, pocket watch accessories, holding hourglass staff with flowing sand, clock gears floating around, time distortion effects',
        'color': '#0d9488',
    },

    # ── ÉVOLUTIONS ARCHER ──
    'ranger': {
        'name': 'Ranger',
        'has_portrait': True,
        'visual': 'wearing forest green leaf-pattern cloak and brown leather armor, woodland bow with nature magic, small wolf companion, owl on shoulder, nature theme',
        'color': '#059669',
    },
    'sniper': {
        'name': 'Sniper',
        'has_portrait': False,
        'visual': 'wearing dark tactical cloak with hood covering face, one glowing eye visible, holding sleek long-range crossbow with scope, mechanical arm guard, shadowy and precise',
        'color': '#0f172a',
    },
    'chasseur_de_dragons': {
        'name': 'Chasseur de dragons',
        'has_portrait': False,
        'visual': 'wearing dragon-scale armor in red and bronze, dragon fang necklace, wielding massive dragonslayer bow with dragon wing motif, dragon skull shoulder pad, fierce and legendary',
        'color': '#dc2626',
    },
    'assassin': {
        'name': 'Assassin',
        'has_portrait': False,
        'visual': 'wearing black ninja-style outfit with dark purple accents, face mask, dual wielding curved daggers dripping with poison, smoke effects, crescent moon symbol, stealthy pose',
        'color': '#4c1d95',
    },

    # ── ÉVOLUTIONS GUÉRISSEUR ──
    'pretre': {
        'name': 'Prêtre',
        'has_portrait': False,
        'visual': 'wearing ornate white and gold priestly vestments with religious symbols, tall mitre hat, holding golden crosier staff with diamond, radiant holy light emanating, prayer beads',
        'color': '#fbbf24',
    },
    'druide': {
        'name': 'Druide',
        'has_portrait': False,
        'visual': 'wearing living bark and vine armor with flowers growing, antler headpiece, holding gnarled wooden staff with glowing green crystal, forest spirits and butterflies around, nature magic',
        'color': '#10b981',
    },
    'saint': {
        'name': 'Saint',
        'has_portrait': False,
        'visual': 'wearing radiant white and celestial blue robes with angelic motifs, golden halo above head, large feathered angel wings, holding sacred chalice, divine light beams, serene expression',
        'color': '#f0f9ff',
    },
    'chaman': {
        'name': 'Chaman',
        'has_portrait': False,
        'visual': 'wearing tribal outfit with feathers and bones, spirit mask on forehead, totem staff with animal spirits swirling, tribal paint markings, ethereal ghost wolf companion, mystical smoke',
        'color': '#7c3aed',
    },
}


# Compétences par classe (pour sprites d'attaque)
CLASS_SKILLS = {
    'guerrier': [
        {'id': 'coup_epee', 'name': 'Coup d\'épée', 'animation': 'horizontal sword slash attack, blade swing'},
        {'id': 'bouclier_protect', 'name': 'Protection', 'animation': 'raising shield up in defensive stance, shield glow'},
        {'id': 'charge', 'name': 'Charge', 'animation': 'charging forward with shoulder bash, running attack'},
        {'id': 'tourbillon', 'name': 'Tourbillon', 'animation': 'spinning attack with sword extended, 360 degree spin'},
        {'id': 'cri_guerre', 'name': 'Cri de guerre', 'animation': 'roaring battle cry, arms raised, shockwave effect'},
        {'id': 'frappe_titan', 'name': 'Frappe du titan', 'animation': 'massive overhead sword slam into ground, earth-shattering impact'},
    ],
    'mage': [
        {'id': 'boule_feu', 'name': 'Boule de feu', 'animation': 'casting fireball spell, hands extended with fire orb launching'},
        {'id': 'barriere_magique', 'name': 'Barrière magique', 'animation': 'conjuring magical shield barrier, hexagonal blue shield appearing'},
        {'id': 'eclair', 'name': 'Éclair', 'animation': 'calling lightning bolt from above, staff raised to sky'},
        {'id': 'blizzard', 'name': 'Blizzard', 'animation': 'casting ice storm spell, arms spread with snowflakes and ice shards'},
        {'id': 'teleportation', 'name': 'Téléportation', 'animation': 'teleporting with magical particle dissolve and reappear effect'},
        {'id': 'meteor', 'name': 'Météore', 'animation': 'summoning giant meteor from sky, both hands raised with cosmic energy'},
    ],
    'archer': [
        {'id': 'tir_precis', 'name': 'Tir précis', 'animation': 'precise bow shot, pulling arrow back and releasing'},
        {'id': 'pluie_fleches', 'name': 'Pluie de flèches', 'animation': 'shooting multiple arrows into the sky raining down'},
        {'id': 'esquive', 'name': 'Esquive', 'animation': 'acrobatic dodge roll to the side, quick evasive move'},
        {'id': 'fleche_poison', 'name': 'Flèche empoisonnée', 'animation': 'shooting green glowing poisoned arrow'},
        {'id': 'piege', 'name': 'Piège', 'animation': 'placing trap on ground, mechanical device setting'},
        {'id': 'tir_ultime', 'name': 'Tir ultime', 'animation': 'charging ultimate arrow with golden energy, massive power shot release'},
    ],
    'guerisseur': [
        {'id': 'soin', 'name': 'Soin', 'animation': 'healing spell casting, green sparkles and heart shape forming from hands'},
        {'id': 'coup_baton', 'name': 'Coup de bâton', 'animation': 'swinging staff forward in melee strike'},
        {'id': 'benediction', 'name': 'Bénédiction', 'animation': 'blessing with golden light beam from staff, buff aura spreading'},
        {'id': 'guerison_groupe', 'name': 'Guérison de groupe', 'animation': 'wide area healing with green energy wave expanding outward'},
        {'id': 'purification', 'name': 'Purification', 'animation': 'purifying holy water splash, white light cleansing'},
        {'id': 'resurrection', 'name': 'Résurrection', 'animation': 'resurrection spell with golden angel wings and bright light beam upward'},
    ],
}

# Les évolutions utilisent les skills de leur classe de base
EVOLUTION_BASE_CLASS = {
    'chevalier': 'guerrier', 'berserker': 'guerrier', 'paladin': 'guerrier', 'gladiateur': 'guerrier',
    'pyromancien': 'mage', 'enchanteur': 'mage', 'archimage': 'mage', 'chronomancien': 'mage',
    'ranger': 'archer', 'sniper': 'archer', 'chasseur_de_dragons': 'archer', 'assassin': 'archer',
    'pretre': 'guerisseur', 'druide': 'guerisseur', 'saint': 'guerisseur', 'chaman': 'guerisseur',
}


# Tuiles de terrain pour la carte isométrique
TERRAIN_TILES = {
    'plaine': {
        'name': 'Plaine',
        'visual': 'green grass plain tile, lush meadow with small flowers, isometric perspective, game tile',
    },
    'eau': {
        'name': 'Eau',
        'visual': 'clear blue water tile with gentle ripples, reflective surface, isometric perspective, game tile',
    },
    'terre': {
        'name': 'Terre',
        'visual': 'brown dirt path tile with pebbles and cracks, dry earth, isometric perspective, game tile',
    },
    'roche': {
        'name': 'Roche',
        'visual': 'gray stone rock tile with rough texture and cracks, mountain surface, isometric perspective, game tile',
    },
    'foret': {
        'name': 'Forêt',
        'visual': 'forest tile with tall trees and undergrowth, green canopy, isometric perspective, game tile',
    },
    'sable': {
        'name': 'Sable',
        'visual': 'golden sand desert tile with dunes, sandy texture, isometric perspective, game tile',
    },
    'neige': {
        'name': 'Neige',
        'visual': 'white snow tile with ice patches and frost, winter ground, isometric perspective, game tile',
    },
    'lave': {
        'name': 'Lave',
        'visual': 'glowing red lava tile with magma cracks, volcanic surface, isometric perspective, game tile',
    },
}


# ═══════════════════════════════════════════════════════════════════
#  CLIENT API LUDO.AI
# ═══════════════════════════════════════════════════════════════════

class LudoAPIClient:
    """Client pour l'API REST de Ludo.ai"""

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("❌ Clé API manquante. Définir LUDO_API_KEY dans les variables d'environnement.")
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"ApiKey {api_key}",
            "Content-Type": "application/json",
        })
        self.credits_used = 0

    def _post(self, endpoint: str, payload: dict) -> dict:
        """Envoyer une requête POST à l'API Ludo.ai"""
        url = f"{API_BASE_URL}/{endpoint}"
        log.info(f"  → API POST {url}")
        log.debug(f"    Payload: {json.dumps(payload, indent=2)[:500]}")

        try:
            response = self.session.post(url, json=payload, timeout=120)
            log.info(f"  → Réponse: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            log.debug(f"    Réponse JSON: {json.dumps(data, indent=2)[:500]}")
            return data
        except requests.exceptions.HTTPError as e:
            log.error(f"  ✗ Erreur HTTP {response.status_code}: {response.text[:500]}")
            raise
        except requests.exceptions.Timeout:
            log.error(f"  ✗ Timeout sur {endpoint}")
            raise
        except requests.exceptions.RequestException as e:
            log.error(f"  ✗ Erreur réseau: {e}")
            raise

    def test_endpoints(self):
        """
        Tester différentes variantes d'endpoints pour trouver les bons.
        Lance ça en premier pour découvrir l'API.
        """
        test_payload = {
            "prompt": "test",
            "image_type": "sprite",
        }

        # Variantes possibles de noms d'endpoints (incluant les noms MCP officiels)
        candidates = [
            # Noms MCP officiels
            "createImage",
            "generateWithStyle",
            "editImage",
            "generatePose",
            "removeImageBackground",
            "animateSprite",
            # Variantes REST communes
            "create-image",
            "image/create",
            "images/create",
            "image/generate",
            "images/generate",
            "generate/image",
            "image",
            "images",
            "sprite/generate",
        ]

        # Tester aussi les variantes d'auth headers
        log.info("🔍 Test des endpoints et headers d'authentification...")
        log.info(f"   Base URL: {API_BASE_URL}")

        # D'abord tester le vrai endpoint confirmé par Swagger
        for header_name in ["Authorization", "Authentication"]:
            self.session.headers.pop("Authentication", None)
            self.session.headers.pop("Authorization", None)
            self.session.headers[header_name] = f"ApiKey {self.api_key}"

            test_url = f"{API_BASE_URL}/assets/image"
            try:
                resp = self.session.post(test_url, json=test_payload, timeout=15)
                status = resp.status_code
                body = resp.text[:200]
                if status == 401:
                    log.info(f"   {header_name}: {test_url} → 401 (mauvais header ou clé)")
                elif status == 404:
                    log.info(f"   {header_name}: {test_url} → 404 (endpoint pas trouvé)")
                elif status == 200:
                    log.info(f"   ✅ {header_name}: {test_url} → 200 OK!")
                    return {"header": header_name, "endpoint": "assets/image"}
                else:
                    log.info(f"   {header_name}: {test_url} → {status}: {body}")
            except Exception as e:
                log.info(f"   {header_name}: {test_url} → Erreur: {e}")

        # Tester toutes les variantes d'endpoints
        for header_name in ["Authentication", "Authorization"]:
            self.session.headers.pop("Authentication", None)
            self.session.headers.pop("Authorization", None)
            self.session.headers[header_name] = f"ApiKey {self.api_key}"

            for endpoint in candidates:
                url = f"{API_BASE_URL}/{endpoint}"
                try:
                    resp = self.session.post(url, json=test_payload, timeout=10)
                    status = resp.status_code
                    body = resp.text[:200]
                    marker = "✅" if status == 200 else "  "
                    log.info(f"   {marker} {header_name} | POST {endpoint} → {status}")
                    if status == 200:
                        log.info(f"      Réponse: {body}")
                        return {"header": header_name, "endpoint": endpoint}
                    elif status != 404:
                        log.info(f"      Réponse: {body}")
                except Exception as e:
                    log.info(f"      {header_name} | POST {endpoint} → Erreur: {e}")

        # Phase 2: tester d'autres méthodes HTTP sur les endpoints qui ont retourné 405
        log.info("\n🔍 Phase 2: Test des méthodes HTTP alternatives sur endpoints 405...")
        method_405_endpoints = ["images/create", "images/generate"]
        methods = ["GET", "PUT", "PATCH"]

        for header_name in ["Authentication", "Authorization"]:
            self.session.headers.pop("Authentication", None)
            self.session.headers.pop("Authorization", None)
            self.session.headers[header_name] = f"ApiKey {self.api_key}"

            for endpoint in method_405_endpoints:
                for method in methods:
                    url = f"{API_BASE_URL}/{endpoint}"
                    try:
                        if method == "GET":
                            resp = self.session.get(url, params=test_payload, timeout=10)
                        elif method == "PUT":
                            resp = self.session.put(url, json=test_payload, timeout=10)
                        elif method == "PATCH":
                            resp = self.session.patch(url, json=test_payload, timeout=10)

                        status = resp.status_code
                        body = resp.text[:300]
                        marker = "✅" if status == 200 else "  "
                        log.info(f"   {marker} {header_name} | {method} {endpoint} → {status}")
                        if status not in (404, 405):
                            log.info(f"      Réponse: {body}")
                        if status == 200:
                            return {"header": header_name, "endpoint": endpoint, "method": method}
                    except Exception as e:
                        log.info(f"      {header_name} | {method} {endpoint} → Erreur: {e}")

        # Phase 3: tester d'autres chemins de base
        log.info("\n🔍 Phase 3: Test d'autres chemins de base...")
        alt_bases = [
            "https://api.ludo.ai/v1",
            "https://api.ludo.ai",
            "https://app.ludo.ai/api",
            "https://mcp.ludo.ai/api",
        ]
        for base in alt_bases:
            for header_name in ["Authentication", "Authorization"]:
                self.session.headers.pop("Authentication", None)
                self.session.headers.pop("Authorization", None)
                self.session.headers[header_name] = f"ApiKey {self.api_key}"

                for endpoint in ["createImage", "generateWithStyle", "images/create",
                                 "images/generate", "image"]:
                    url = f"{base}/{endpoint}"
                    try:
                        resp = self.session.post(url, json=test_payload, timeout=10)
                        status = resp.status_code
                        body = resp.text[:300]
                        if status not in (404, 405):
                            log.info(f"   {header_name} | POST {url} → {status}: {body}")
                        if status == 200:
                            return {"header": header_name, "endpoint": endpoint, "base": base}
                    except Exception as e:
                        pass

        # Phase 4: Essayer de récupérer la doc Swagger/OpenAPI
        log.info("\n🔍 Phase 4: Recherche de documentation Swagger/OpenAPI...")
        doc_urls = [
            "https://api.ludo.ai/api-documentation",
            "https://api.ludo.ai/swagger.json",
            "https://api.ludo.ai/openapi.json",
            "https://api.ludo.ai/docs",
            "https://api.ludo.ai/api/docs",
            "https://api.ludo.ai/api/swagger.json",
            "https://api.ludo.ai/api/openapi.json",
        ]
        for url in doc_urls:
            try:
                resp = self.session.get(url, timeout=10)
                if resp.status_code == 200:
                    body = resp.text[:1000]
                    log.info(f"   ✅ Documentation trouvée: {url}")
                    log.info(f"      Contenu: {body}")
                    # Si c'est du JSON, essayer de parser les endpoints
                    try:
                        doc = resp.json()
                        if "paths" in doc:
                            log.info(f"      Endpoints trouvés:")
                            for path, methods in doc["paths"].items():
                                log.info(f"         {path}: {list(methods.keys())}")
                    except Exception:
                        pass
            except Exception:
                pass

        log.error("❌ Aucun endpoint trouvé! Vérifiez votre clé API et la documentation.")
        log.info("\n💡 Suggestions:")
        log.info("   1. Vérifiez que votre abonnement inclut l'accès API")
        log.info("   2. Consultez https://ludo.ai/docs/api-mcp pour la doc exacte")
        log.info("   3. Les endpoints 'images/create' et 'images/generate' existent (405)")
        log.info("      mais n'acceptent pas POST — vérifiez la méthode HTTP requise")
        return None

    def _poll_result(self, endpoint: str, task_id: str, max_wait: int = 180) -> dict:
        """
        Certains endpoints sont asynchrones.
        Si la réponse contient un task_id/job_id, on poll jusqu'à complétion.
        """
        url = f"{API_BASE_URL}/{endpoint}/{task_id}"
        start = time.time()
        while time.time() - start < max_wait:
            try:
                resp = self.session.get(url, timeout=30)
                data = resp.json()
                status = data.get("status", "").lower()
                if status in ("completed", "done", "success"):
                    return data
                elif status in ("failed", "error"):
                    log.error(f"  ✗ Tâche échouée: {data}")
                    return data
                log.info(f"  ⏳ En attente... ({status})")
                time.sleep(5)
            except Exception:
                time.sleep(5)
        log.error(f"  ✗ Timeout après {max_wait}s")
        return {}

    def _extract_images(self, result, endpoint: str = "") -> list:
        """Extraire les URLs d'images d'une réponse API (gère plusieurs formats)."""
        images = []

        # Si la réponse est directement une liste d'objets [{url: ...}, ...]
        if isinstance(result, list):
            log.info(f"  📋 Réponse de type liste: {len(result)} éléments")
            for item in result:
                if isinstance(item, dict) and "url" in item:
                    images.append(item["url"])
                elif isinstance(item, str):
                    images.append(item)
            return [img for img in images if img]

        if not isinstance(result, dict):
            log.warning(f"  ⚠ Réponse non-dict/list: {type(result)}: {str(result)[:200]}")
            return images

        # Log la structure de la réponse pour debug
        log.info(f"  📋 Clés de la réponse: {list(result.keys())}")
        log.debug(f"  📋 Réponse complète: {json.dumps(result, default=str)[:500]}")

        # Formats de réponse possibles
        if "images" in result:
            raw = result["images"]
            log.info(f"  📋 Format 'images': {len(raw)} éléments")
            images = [img.get("url", img) if isinstance(img, dict) else img
                     for img in raw]
        elif "image_url" in result:
            images = [result["image_url"]]
        elif "image_urls" in result:
            images = result["image_urls"]
        elif "url" in result:
            images = [result["url"]]
        elif "urls" in result:
            images = result["urls"]
        elif "data" in result:
            data = result["data"]
            if isinstance(data, list):
                images = [d.get("url", d.get("image_url", "")) if isinstance(d, dict) else d
                         for d in data]
            elif isinstance(data, dict):
                images = [data.get("url", data.get("image_url", ""))]
        elif "results" in result:
            images = [r.get("url", r.get("image_url", ""))
                     for r in result["results"]]
        elif "output" in result:
            out = result["output"]
            if isinstance(out, str):
                images = [out]
            elif isinstance(out, dict):
                images = [out.get("url", out.get("image_url", ""))]
            elif isinstance(out, list):
                images = [o.get("url", o) if isinstance(o, dict) else o for o in out]
        # Si c'est asynchrone
        elif "task_id" in result or "job_id" in result:
            task_id = result.get("task_id", result.get("job_id"))
            log.info(f"  ⏳ Tâche asynchrone: {task_id}")
            poll_result = self._poll_result(endpoint, task_id)
            return self._extract_images(poll_result, endpoint)
        else:
            # Dernier recours: chercher toute valeur qui ressemble à une URL
            for key, val in result.items():
                if isinstance(val, str) and (val.startswith("http") and
                    any(ext in val.lower() for ext in ['.png', '.jpg', '.jpeg', '.webp'])):
                    log.info(f"  📋 URL trouvée dans clé '{key}': {val[:100]}")
                    images.append(val)

        if not images:
            log.warning(f"  ⚠ Pas d'images trouvées. Réponse brute: {json.dumps(result, default=str)[:300]}")

        return [img for img in images if img]  # Filtrer les vides

    def generate_image(self, prompt: str, image_type: str = "sprite",
                       art_style: str = "Digital Art",
                       perspective: str = "Isometric",
                       aspect_ratio: str = "ar_1_1",
                       n: int = 1) -> list:
        """
        POST /api/assets/image — Générer une image.
        Coût: 0.5 crédit par image.
        """
        payload = {
            "prompt": prompt,
            "image_type": image_type,
            "art_style": art_style,
            "perspective": perspective,
            "aspect_ratio": aspect_ratio,
            "n": n,
            "augment_prompt": True,
        }
        result = self._post("assets/image", payload)
        self.credits_used += 0.5 * n
        time.sleep(API_DELAY)
        return self._extract_images(result, "assets/image")

    def style_transfer(self, prompt: str, style_image_url: str,
                       image_type: str = "sprite", n: int = 1) -> list:
        """
        POST /api/assets/image/style — Générer une image avec le style d'une référence.
        Coût: 0.5 crédit.
        """
        payload = {
            "prompt": prompt,
            "style_image": style_image_url,
            "image_type": image_type,
            "n": n,
        }
        result = self._post("assets/image/style", payload)
        self.credits_used += 0.5 * n
        time.sleep(API_DELAY)
        return self._extract_images(result, "assets/image/style")

    def generate_pose(self, image_url: str, target_pose: str) -> dict:
        """
        POST /api/assets/sprite/pose — Nouvelle pose pour un sprite.
        Coût: 0.5 crédit.
        """
        payload = {
            "image": image_url,
            "target_pose": target_pose,
        }
        result = self._post("assets/sprite/pose", payload)
        self.credits_used += 0.5
        time.sleep(API_DELAY)
        return result

    def animate_sprite(self, image_url: str, motion_prompt: str,
                       frames: int = 9, frame_size: int = 128,
                       loop: bool = True) -> dict:
        """
        POST /api/assets/sprite/animate — Animer un sprite en spritesheet.
        Coût: 5 crédits.
        """
        payload = {
            "initial_image": image_url,
            "motion_prompt": motion_prompt,
            "frames": frames,
            "frame_size": frame_size,
            "loop": loop,
        }
        result = self._post("assets/sprite/animate", payload)
        self.credits_used += 5
        # L'animation peut prendre 30-90 secondes
        if isinstance(result, dict) and result.get("status") in ("processing", "pending"):
            task_id = result.get("task_id", result.get("job_id", ""))
            if task_id:
                result = self._poll_result("assets/sprite/animate", task_id, max_wait=180)
        time.sleep(API_DELAY)
        return result

    def remove_background(self, image_url: str) -> str:
        """
        POST /api/assets/image/remove-background — Retirer le fond.
        Coût: 0.5 crédit.
        """
        payload = {"image": image_url}
        result = self._post("assets/image/remove-background", payload)
        self.credits_used += 0.5
        time.sleep(API_DELAY)
        if isinstance(result, dict):
            return result.get("image_url", result.get("url", ""))
        return ""


# ═══════════════════════════════════════════════════════════════════
#  UTILITAIRES
# ═══════════════════════════════════════════════════════════════════

def download_image(url: str, save_path: Path) -> bool:
    """Télécharger une image depuis une URL et la sauvegarder."""
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, 'wb') as f:
            f.write(resp.content)
        log.info(f"  ✓ Sauvegardé: {save_path}")
        return True
    except Exception as e:
        log.error(f"  ✗ Échec téléchargement {url}: {e}")
        return False


def mirror_image_horizontal(input_path: Path, output_path: Path) -> bool:
    """
    Créer une symétrie horizontale (miroir vertical) d'une image.
    Utilisé pour créer les directions SW à partir de SE et NW à partir de NE.
    """
    try:
        img = Image.open(input_path)
        mirrored = ImageOps.mirror(img)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        mirrored.save(output_path)
        log.info(f"  ✓ Miroir créé: {output_path}")
        return True
    except Exception as e:
        log.error(f"  ✗ Échec miroir {input_path}: {e}")
        return False


def mirror_spritesheet_horizontal(input_path: Path, output_path: Path,
                                   frame_width: int = 0, frame_height: int = 0,
                                   grid_cols: int = 3, grid_rows: int = 3) -> bool:
    """
    Créer une symétrie horizontale d'un spritesheet frame par frame.
    Chaque frame individuelle est mirrorée, pas le spritesheet entier.
    Si frame_width/frame_height sont 0, les calculer automatiquement depuis la grille.
    """
    try:
        sheet = Image.open(input_path)

        # Calculer la taille des frames depuis la grille si pas spécifié
        if frame_width <= 0 or frame_height <= 0:
            frame_width = sheet.width // grid_cols
            frame_height = sheet.height // grid_rows
            log.info(f"    📐 Taille de frame auto-détectée: {frame_width}×{frame_height} "
                     f"(grille {grid_cols}×{grid_rows} sur image {sheet.width}×{sheet.height})")

        cols = sheet.width // frame_width
        rows = sheet.height // frame_height

        new_sheet = Image.new('RGBA', sheet.size, (0, 0, 0, 0))

        for row in range(rows):
            for col in range(cols):
                x = col * frame_width
                y = row * frame_height
                frame = sheet.crop((x, y, x + frame_width, y + frame_height))
                mirrored_frame = ImageOps.mirror(frame)
                new_sheet.paste(mirrored_frame, (x, y))

        output_path.parent.mkdir(parents=True, exist_ok=True)
        new_sheet.save(output_path)
        log.info(f"  ✓ Spritesheet miroir créé: {output_path}")
        return True
    except Exception as e:
        log.error(f"  ✗ Échec miroir spritesheet {input_path}: {e}")
        return False


def image_to_base64(image_path: Path) -> str:
    """Convertir une image en string base64 pour l'API."""
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def load_style_references() -> list:
    """Charge toutes les images de référence de style en base64."""
    refs = []
    if STYLE_REFERENCES_DIR.exists():
        for img_path in sorted(STYLE_REFERENCES_DIR.glob("*.png")):
            b64 = f"data:image/png;base64,{image_to_base64(img_path)}"
            refs.append({"path": img_path, "b64": b64, "name": img_path.stem})
            log.info(f"  📎 Référence de style chargée: {img_path.name}")
    if not refs:
        log.warning("  ⚠ Aucune image de référence trouvée dans références/")
    return refs


def pick_style_reference(references: list, class_id: str) -> str | None:
    """Choisit la meilleure image de référence pour une classe donnée.
    Si une référence correspond exactement à la classe, l'utiliser.
    Sinon, utiliser une référence aléatoire pour varier le style."""
    if not references:
        return None
    # Chercher une correspondance exacte
    for ref in references:
        if ref['name'].lower() == class_id.lower():
            return ref['b64']
    # Sinon, rotation parmi les références pour varier
    return random.choice(references)['b64']


def get_existing_portrait_url(class_id: str) -> str | None:
    """Retourne le chemin local du portrait existant pour le style transfer."""
    portrait_path = PORTRAITS_DIR / f"{class_id}.png"
    if portrait_path.exists():
        return str(portrait_path)
    return None


# ═══════════════════════════════════════════════════════════════════
#  GÉNÉRATEURS
# ═══════════════════════════════════════════════════════════════════

def generate_missing_portraits(client: LudoAPIClient, dry_run: bool = False,
                                force: bool = False):
    """
    Génère les portraits des classes qui n'en ont pas encore.
    Avec --force, regénère TOUS les portraits (y compris les existants).
    Utilise le style transfer avec un portrait existant comme référence.
    """
    log.info("=" * 60)
    if force:
        log.info("📸 REGÉNÉRATION DE TOUS LES PORTRAITS (--force)")
    else:
        log.info("📸 GÉNÉRATION DES PORTRAITS MANQUANTS")
    log.info("=" * 60)

    if force:
        to_generate = dict(CLASSES)
    else:
        to_generate = {k: v for k, v in CLASSES.items() if not v['has_portrait']}

    if not to_generate:
        log.info("  ✓ Tous les portraits existent déjà!")
        return

    log.info(f"  {len(to_generate)} portraits à générer:")
    for class_id, cls in to_generate.items():
        existing = "🔄" if cls['has_portrait'] else "🆕"
        log.info(f"    {existing} {cls['name']} ({class_id})")

    if dry_run:
        log.info(f"  💰 Coût estimé: {len(to_generate) * 0.5} crédits")
        return

    # Charger les images de référence de style depuis le dossier références/
    log.info(f"\n  📂 Chargement des références de style depuis {STYLE_REFERENCES_DIR}")
    style_refs = load_style_references()

    for class_id, cls in to_generate.items():
        log.info(f"\n  🎨 Génération: {cls['name']}")

        prompt = f"{STYLE_PREFIX}, {cls['visual']}"

        try:
            # Toujours utiliser style_transfer avec une image de référence
            ref_b64 = pick_style_reference(style_refs, class_id)

            if ref_b64:
                log.info(f"    📎 Utilisation du style transfer avec référence")
                images = client.style_transfer(
                    prompt=prompt,
                    style_image_url=ref_b64,
                    image_type="art",
                )
            else:
                # Fallback si aucune référence disponible
                log.warning(f"    ⚠ Pas de référence, fallback sur generate_image")
                images = client.generate_image(
                    prompt=prompt,
                    image_type="art",
                    art_style="Digital Art",
                    perspective="Side-Scroll",
                    aspect_ratio="ar_1_1",
                )

            if images:
                save_path = PORTRAITS_DIR / f"{class_id}.png"
                download_image(images[0], save_path)
            else:
                log.warning(f"  ⚠ Aucune image retournée pour {cls['name']}")

        except Exception as e:
            log.error(f"  ✗ Erreur pour {cls['name']}: {e}")
            continue


def generate_movement_sprites(client: LudoAPIClient, class_filter: str = None,
                               dry_run: bool = False):
    """
    Génère les sprites de mouvement isométrique pour chaque classe.

    Directions générées via l'API:
    - SE (sud-est): face visible, corps tourné vers la droite → marche
    - NE (nord-est): dos visible, corps tourné vers la droite → marche

    Directions obtenues par symétrie:
    - SW (sud-ouest): miroir horizontal de SE
    - NW (nord-ouest): miroir horizontal de NE
    """
    log.info("=" * 60)
    log.info("🚶 GÉNÉRATION DES SPRITES DE MOUVEMENT")
    log.info("=" * 60)

    classes = CLASSES
    if class_filter:
        classes = {k: v for k, v in CLASSES.items() if k == class_filter}

    total_sprites = len(classes) * 2  # 2 directions générées (SE, NE)
    log.info(f"  {len(classes)} classes × 2 directions = {total_sprites} sprites à générer")
    log.info(f"  + {total_sprites} miroirs = {total_sprites * 2} sprites totaux")

    if dry_run:
        # Pose: 0.5 × total_sprites + Animation: 5 × total_sprites
        cost = total_sprites * 5.5
        log.info(f"  💰 Coût estimé: {cost} crédits")
        return

    directions = {
        'se': {
            'pose_desc': 'Idle (Front)',
            'facing': 'facing front-right, three-quarter view from front, looking toward bottom-right',
            'walk_anim': 'walking cycle moving toward bottom-right, isometric south-east movement',
        },
        'ne': {
            'pose_desc': 'Idle (Back)',
            'facing': 'facing back-right, three-quarter view from behind, looking toward top-right',
            'walk_anim': 'walking cycle moving toward top-right, isometric north-east movement, seen from behind',
        },
    }

    # Charger les références de style (portraits existants)
    log.info(f"\n  📂 Chargement des portraits comme référence de style")
    style_refs = load_style_references()

    for class_id, cls in classes.items():
        log.info(f"\n  🏃 {cls['name']} — Mouvement")

        # Charger le portrait de la classe comme référence de style
        portrait_path = PORTRAITS_DIR / f"{class_id}.png"
        if portrait_path.exists():
            portrait_b64 = f"data:image/png;base64,{image_to_base64(portrait_path)}"
            log.info(f"    📎 Portrait {class_id}.png chargé comme référence de style")
        else:
            # Fallback sur les références générales
            portrait_b64 = pick_style_reference(style_refs, class_id)
            if portrait_b64:
                log.info(f"    📎 Référence générale utilisée (pas de portrait)")
            else:
                log.warning(f"    ⚠ Aucune référence de style disponible pour {cls['name']}")

        for dir_key, dir_info in directions.items():
            log.info(f"    Direction: {dir_key.upper()}")

            # 1) Générer la pose statique dans la bonne direction
            sprite_prompt = (
                f"{SPRITE_STYLE_PREFIX}, {cls['visual']}, "
                f"{dir_info['facing']}, "
                f"walking pose, full body visible, "
                f"isometric RPG game sprite"
            )

            try:
                # Utiliser style_transfer avec le portrait comme référence
                if portrait_b64:
                    log.info(f"    📎 Style transfer avec portrait")
                    images = client.style_transfer(
                        prompt=sprite_prompt,
                        style_image_url=portrait_b64,
                        image_type="sprite",
                    )
                else:
                    # Fallback sans référence
                    images = client.generate_image(
                        prompt=sprite_prompt,
                        image_type="sprite",
                        perspective="Isometric",
                        aspect_ratio="ar_1_1",
                    )

                if not images:
                    log.warning(f"    ⚠ Pas d'image pour {cls['name']} {dir_key}")
                    continue

                # Sauvegarder le sprite statique
                static_path = MOVEMENT_DIR / class_id / f"walk_{dir_key}_static.png"
                download_image(images[0], static_path)

                # 2) Retirer le background
                transparent_url = client.remove_background(images[0])
                if transparent_url:
                    transparent_path = MOVEMENT_DIR / class_id / f"walk_{dir_key}_transparent.png"
                    download_image(transparent_url, transparent_path)
                    source_url = transparent_url
                else:
                    source_url = images[0]

                # 3) Animer en spritesheet de marche
                anim_result = client.animate_sprite(
                    image_url=source_url,
                    motion_prompt=dir_info['walk_anim'],
                    frames=SPRITE_FRAMES,
                    frame_size=SPRITE_FRAME_SIZE,
                    loop=True,
                )

                # Sauvegarder le spritesheet
                if isinstance(anim_result, dict):
                    sheet_url = anim_result.get("spritesheet_url", "")
                    if sheet_url:
                        sheet_path = MOVEMENT_DIR / class_id / f"walk_{dir_key}_sheet.png"
                        download_image(sheet_url, sheet_path)

                        # 4) Créer le miroir pour l'autre direction
                        mirror_dir = 'sw' if dir_key == 'se' else 'nw'
                        mirror_path = MOVEMENT_DIR / class_id / f"walk_{mirror_dir}_sheet.png"
                        mirror_spritesheet_horizontal(
                            sheet_path, mirror_path,
                            SPRITE_FRAME_SIZE, SPRITE_FRAME_SIZE
                        )

                    # Sauvegarder aussi le GIF si disponible
                    gif_url = anim_result.get("gif_url", "")
                    if gif_url:
                        gif_path = MOVEMENT_DIR / class_id / f"walk_{dir_key}.gif"
                        download_image(gif_url, gif_path)

            except Exception as e:
                log.error(f"    ✗ Erreur {cls['name']} {dir_key}: {e}")
                continue


def generate_attack_sprites(client: LudoAPIClient, class_filter: str = None,
                             dry_run: bool = False):
    """
    Génère les sprites d'attaque pour chaque compétence de chaque classe.

    Pour les évolutions, on utilise les mêmes compétences que la classe de base
    mais avec l'apparence de l'évolution.

    Directions: SE (généré) + SW (miroir), NE (généré) + NW (miroir)
    """
    log.info("=" * 60)
    log.info("⚔️  GÉNÉRATION DES SPRITES D'ATTAQUE")
    log.info("=" * 60)

    # Construire la liste complète classe → skills
    class_skills_map = {}
    for class_id, cls in CLASSES.items():
        if class_filter and class_id != class_filter:
            continue

        # Trouver les skills applicables
        if class_id in CLASS_SKILLS:
            skills = CLASS_SKILLS[class_id]
        elif class_id in EVOLUTION_BASE_CLASS:
            base = EVOLUTION_BASE_CLASS[class_id]
            skills = CLASS_SKILLS.get(base, [])
        else:
            skills = []

        if skills:
            class_skills_map[class_id] = skills

    total_anims = sum(len(skills) for skills in class_skills_map.values()) * 2  # ×2 directions
    log.info(f"  {len(class_skills_map)} classes, {total_anims} animations à générer")

    if dry_run:
        cost = total_anims * 5.5  # 0.5 (image) + 5 (anim)
        log.info(f"  💰 Coût estimé: {cost} crédits")
        return

    attack_directions = {
        'se': 'facing front-right, attacking toward bottom-right, three-quarter front view',
        'ne': 'facing back-right, attacking toward top-right, three-quarter back view',
    }

    # Charger les références de style
    style_refs = load_style_references()

    for class_id, skills in class_skills_map.items():
        cls = CLASSES[class_id]
        log.info(f"\n  ⚔️  {cls['name']} — {len(skills)} compétences")

        # Charger le portrait de la classe comme référence
        portrait_path = PORTRAITS_DIR / f"{class_id}.png"
        if portrait_path.exists():
            portrait_b64 = f"data:image/png;base64,{image_to_base64(portrait_path)}"
            log.info(f"    📎 Portrait {class_id}.png comme référence de style")
        else:
            portrait_b64 = pick_style_reference(style_refs, class_id)

        for skill in skills:
            for dir_key, dir_desc in attack_directions.items():
                log.info(f"    {skill['name']} ({dir_key.upper()})")

                attack_prompt = (
                    f"{SPRITE_STYLE_PREFIX}, {cls['visual']}, "
                    f"{dir_desc}, "
                    f"{skill['animation']}, "
                    f"attack animation frame, game sprite"
                )

                try:
                    # Utiliser style_transfer avec le portrait comme référence
                    if portrait_b64:
                        images = client.style_transfer(
                            prompt=attack_prompt,
                            style_image_url=portrait_b64,
                            image_type="sprite",
                        )
                    else:
                        images = client.generate_image(
                            prompt=attack_prompt,
                            image_type="sprite",
                            perspective="Isometric",
                        )

                    if not images:
                        log.warning(f"      ⚠ Pas d'image")
                        continue

                    # Retirer le background
                    transparent_url = client.remove_background(images[0])
                    source_url = transparent_url if transparent_url else images[0]

                    # Animer
                    anim_result = client.animate_sprite(
                        image_url=source_url,
                        motion_prompt=skill['animation'],
                        frames=ATTACK_FRAMES,
                        frame_size=SPRITE_FRAME_SIZE,
                        loop=False,  # Les attaques ne bouclent pas
                    )

                    if isinstance(anim_result, dict):
                        sheet_url = anim_result.get("spritesheet_url", "")
                        if sheet_url:
                            # Sauvegarder
                            sheet_path = ATTACK_DIR / class_id / f"{skill['id']}_{dir_key}_sheet.png"
                            download_image(sheet_url, sheet_path)

                            # Miroir
                            mirror_dir = 'sw' if dir_key == 'se' else 'nw'
                            mirror_path = ATTACK_DIR / class_id / f"{skill['id']}_{mirror_dir}_sheet.png"
                            mirror_spritesheet_horizontal(
                                sheet_path, mirror_path,
                                SPRITE_FRAME_SIZE, SPRITE_FRAME_SIZE
                            )

                        gif_url = anim_result.get("gif_url", "")
                        if gif_url:
                            gif_path = ATTACK_DIR / class_id / f"{skill['id']}_{dir_key}.gif"
                            download_image(gif_url, gif_path)

                except Exception as e:
                    log.error(f"      ✗ Erreur: {e}")
                    continue


def generate_death_sprites(client: LudoAPIClient, class_filter: str = None,
                            dry_run: bool = False):
    """
    Génère un sprite de mort pour chaque classe.
    Un seul sprite statique (le personnage KO/mort au sol).
    """
    log.info("=" * 60)
    log.info("💀 GÉNÉRATION DES SPRITES DE MORT")
    log.info("=" * 60)

    classes = CLASSES
    if class_filter:
        classes = {k: v for k, v in CLASSES.items() if k == class_filter}

    log.info(f"  {len(classes)} sprites de mort à générer")

    if dry_run:
        log.info(f"  💰 Coût estimé: {len(classes) * 0.5} crédits")
        return

    # Charger les références de style
    style_refs = load_style_references()

    for class_id, cls in classes.items():
        log.info(f"\n  💀 {cls['name']} — Mort")

        # Charger le portrait de la classe comme référence
        portrait_path = PORTRAITS_DIR / f"{class_id}.png"
        if portrait_path.exists():
            portrait_b64 = f"data:image/png;base64,{image_to_base64(portrait_path)}"
        else:
            portrait_b64 = pick_style_reference(style_refs, class_id)

        death_prompt = (
            f"{SPRITE_STYLE_PREFIX}, {cls['visual']}, "
            f"knocked out, lying on the ground defeated, X eyes, "
            f"stars circling above head, game over pose, "
            f"isometric perspective, game sprite"
        )

        try:
            if portrait_b64:
                images = client.style_transfer(
                    prompt=death_prompt,
                    style_image_url=portrait_b64,
                    image_type="sprite",
                )
            else:
                images = client.generate_image(
                    prompt=death_prompt,
                    image_type="sprite",
                    perspective="Isometric",
                )

            if images:
                # Retirer le background
                transparent_url = client.remove_background(images[0])
                final_url = transparent_url if transparent_url else images[0]

                save_path = DEATH_DIR / f"{class_id}_ko.png"
                download_image(final_url, save_path)
            else:
                log.warning(f"  ⚠ Pas d'image pour {cls['name']}")

        except Exception as e:
            log.error(f"  ✗ Erreur {cls['name']}: {e}")
            continue


def generate_terrain_tiles(client: LudoAPIClient, dry_run: bool = False):
    """
    Génère les tuiles de terrain isométriques.
    """
    log.info("=" * 60)
    log.info("🗺️  GÉNÉRATION DES TUILES DE TERRAIN")
    log.info("=" * 60)

    log.info(f"  {len(TERRAIN_TILES)} tuiles à générer")

    if dry_run:
        log.info(f"  💰 Coût estimé: {len(TERRAIN_TILES) * 0.5} crédits")
        return

    for tile_id, tile in TERRAIN_TILES.items():
        log.info(f"\n  🗺️  {tile['name']}")

        tile_prompt = (
            f"Isometric game tile, {tile['visual']}, "
            f"diamond-shaped isometric tile, seamless edges, "
            f"RPG game terrain, clean sharp edges, "
            f"no characters, tileable, game asset"
        )

        try:
            images = client.generate_image(
                prompt=tile_prompt,
                image_type="texture",
                art_style="Digital Art",
                perspective="Isometric",
                aspect_ratio="ar_1_1",
            )

            if images:
                save_path = TERRAIN_DIR / f"{tile_id}.png"
                download_image(images[0], save_path)
            else:
                log.warning(f"  ⚠ Pas d'image pour {tile['name']}")

        except Exception as e:
            log.error(f"  ✗ Erreur {tile['name']}: {e}")
            continue


# ═══════════════════════════════════════════════════════════════════
#  INVENTAIRE & ESTIMATION
# ═══════════════════════════════════════════════════════════════════

def print_inventory():
    """Affiche l'inventaire complet de tous les sprites nécessaires."""
    print("\n" + "=" * 70)
    print("  📋 INVENTAIRE COMPLET DES SPRITES À GÉNÉRER")
    print("=" * 70)

    # 1. Portraits
    missing_portraits = {k: v for k, v in CLASSES.items() if not v['has_portrait']}
    print(f"\n📸 PORTRAITS ({len(missing_portraits)} manquants / {len(CLASSES)} total)")
    for class_id, cls in CLASSES.items():
        status = "✅" if cls['has_portrait'] else "❌"
        print(f"  {status} {cls['name']:25s} ({class_id})")

    # 2. Mouvement
    total_movement = len(CLASSES) * 4  # 4 directions
    generated = len(CLASSES) * 2  # 2 générées
    mirrored = len(CLASSES) * 2   # 2 miroirs
    print(f"\n🚶 SPRITES DE MOUVEMENT ({total_movement} total)")
    print(f"  Généré par API: {generated} (SE + NE)")
    print(f"  Miroirs auto:   {mirrored} (SW + NW)")
    for class_id, cls in CLASSES.items():
        print(f"  📁 {cls['name']}: walk_se, walk_ne (+ miroirs sw, nw)")

    # 3. Attaques
    total_attack_anims = 0
    print(f"\n⚔️  SPRITES D'ATTAQUE")
    for class_id, cls in CLASSES.items():
        if class_id in CLASS_SKILLS:
            skills = CLASS_SKILLS[class_id]
        elif class_id in EVOLUTION_BASE_CLASS:
            skills = CLASS_SKILLS.get(EVOLUTION_BASE_CLASS[class_id], [])
        else:
            skills = []

        n = len(skills) * 4  # 4 directions
        n_gen = len(skills) * 2
        total_attack_anims += n_gen
        print(f"  📁 {cls['name']:25s}: {len(skills)} skills × 4 dirs = {n} spritesheets")
        for s in skills:
            print(f"      - {s['name']}")

    # 4. Mort
    print(f"\n💀 SPRITES DE MORT ({len(CLASSES)} total)")
    for cls in CLASSES.values():
        print(f"  - {cls['name']}_ko.png")

    # 5. Terrain
    print(f"\n🗺️  TUILES DE TERRAIN ({len(TERRAIN_TILES)} total)")
    for tile_id, tile in TERRAIN_TILES.items():
        print(f"  - {tile['name']:15s} ({tile_id}.png)")

    # Résumé des coûts
    portrait_credits = len(missing_portraits) * 0.5
    movement_credits = len(CLASSES) * 2 * (0.5 + 0.5 + 5)  # image + bg_remove + anim
    attack_credits = total_attack_anims * (0.5 + 0.5 + 5)
    death_credits = len(CLASSES) * (0.5 + 0.5)  # image + bg_remove
    terrain_credits = len(TERRAIN_TILES) * 0.5

    total = portrait_credits + movement_credits + attack_credits + death_credits + terrain_credits

    print(f"\n{'=' * 70}")
    print(f"  💰 ESTIMATION DES CRÉDITS LUDO.AI")
    print(f"{'=' * 70}")
    print(f"  📸 Portraits:    {portrait_credits:>8.1f} crédits  ({len(missing_portraits)} images)")
    print(f"  🚶 Mouvement:    {movement_credits:>8.1f} crédits  ({len(CLASSES) * 2} sprites + anims)")
    print(f"  ⚔️  Attaques:     {attack_credits:>8.1f} crédits  ({total_attack_anims} sprites + anims)")
    print(f"  💀 Mort:         {death_credits:>8.1f} crédits  ({len(CLASSES)} images)")
    print(f"  🗺️  Terrain:      {terrain_credits:>8.1f} crédits  ({len(TERRAIN_TILES)} tuiles)")
    print(f"  {'─' * 50}")
    print(f"  🔥 TOTAL:        {total:>8.1f} crédits")
    print(f"")
    print(f"  💡 Plan Indie (250 crédits/mois): ~{total / 250:.1f} mois")
    print(f"  💡 Suggestion: Générer par lots (--portraits d'abord, puis --terrain, etc.)")
    print(f"{'=' * 70}\n")


# ═══════════════════════════════════════════════════════════════════
#  MÉTADONNÉES SPRITES (pour l'intégration dans le jeu)
# ═══════════════════════════════════════════════════════════════════

def generate_sprites_metadata():
    """
    Génère un fichier JSON de métadonnées pour tous les sprites,
    utilisable par le moteur de jeu (Phaser.js ou custom).
    """
    metadata = {
        "frame_size": SPRITE_FRAME_SIZE,
        "classes": {},
        "terrain": {},
    }

    for class_id, cls in CLASSES.items():
        # Trouver les skills
        if class_id in CLASS_SKILLS:
            skills = CLASS_SKILLS[class_id]
        elif class_id in EVOLUTION_BASE_CLASS:
            skills = CLASS_SKILLS.get(EVOLUTION_BASE_CLASS[class_id], [])
        else:
            skills = []

        metadata["classes"][class_id] = {
            "name": cls['name'],
            "color": cls['color'],
            "portrait": f"img/chihuahua/{class_id}.png",
            "sprites": {
                "movement": {
                    "walk_se": f"img/sprites/movement/{class_id}/walk_se_sheet.png",
                    "walk_sw": f"img/sprites/movement/{class_id}/walk_sw_sheet.png",
                    "walk_ne": f"img/sprites/movement/{class_id}/walk_ne_sheet.png",
                    "walk_nw": f"img/sprites/movement/{class_id}/walk_nw_sheet.png",
                    "frames": SPRITE_FRAMES,
                    "loop": True,
                },
                "attacks": {
                    skill['id']: {
                        "name": skill['name'],
                        "se": f"img/sprites/attacks/{class_id}/{skill['id']}_se_sheet.png",
                        "sw": f"img/sprites/attacks/{class_id}/{skill['id']}_sw_sheet.png",
                        "ne": f"img/sprites/attacks/{class_id}/{skill['id']}_ne_sheet.png",
                        "nw": f"img/sprites/attacks/{class_id}/{skill['id']}_nw_sheet.png",
                        "frames": ATTACK_FRAMES,
                        "loop": False,
                    }
                    for skill in skills
                },
                "death": f"img/sprites/death/{class_id}_ko.png",
            },
        }

    for tile_id, tile in TERRAIN_TILES.items():
        metadata["terrain"][tile_id] = {
            "name": tile['name'],
            "path": f"img/sprites/terrain/{tile_id}.png",
        }

    # Sauvegarder
    meta_path = SPRITES_DIR / "sprites_metadata_iso.json"
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    log.info(f"  ✓ Métadonnées sauvegardées: {meta_path}")
    return metadata


# ═══════════════════════════════════════════════════════════════════
#  POINT D'ENTRÉE
# ═══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Génère les sprites RPG via l'API Ludo.ai",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples:
  python generate_ludo_sprites.py --dry-run          # Voir l'inventaire
  python generate_ludo_sprites.py --portraits         # Portraits seulement
  python generate_ludo_sprites.py --movement          # Mouvement seulement
  python generate_ludo_sprites.py --class guerrier    # Une classe seulement
  python generate_ludo_sprites.py --all               # Tout générer
        """,
    )

    parser.add_argument('--all', action='store_true', help='Générer tous les sprites')
    parser.add_argument('--portraits', action='store_true', help='Générer les portraits manquants')
    parser.add_argument('--movement', action='store_true', help='Générer les sprites de mouvement')
    parser.add_argument('--attacks', action='store_true', help='Générer les sprites d\'attaque')
    parser.add_argument('--death', action='store_true', help='Générer les sprites de mort')
    parser.add_argument('--terrain', action='store_true', help='Générer les tuiles de terrain')
    parser.add_argument('--metadata', action='store_true', help='Générer les métadonnées JSON')
    parser.add_argument('--class', dest='class_filter', help='Filtrer par classe (ex: guerrier)')
    parser.add_argument('--force', action='store_true', help='Regénérer les assets existants (portraits, etc.)')
    parser.add_argument('--dry-run', action='store_true', help='Afficher l\'inventaire sans appeler l\'API')
    parser.add_argument('--inventory', action='store_true', help='Afficher l\'inventaire complet')
    parser.add_argument('--test', action='store_true', help='Tester les endpoints API pour trouver les bons')
    parser.add_argument('--verbose', action='store_true', help='Afficher les logs détaillés (debug)')

    args = parser.parse_args()

    # Verbose mode
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Si aucun argument, afficher l'inventaire
    if not any([args.all, args.portraits, args.movement, args.attacks,
                args.death, args.terrain, args.metadata, args.dry_run,
                args.inventory, args.test]):
        parser.print_help()
        print()
        print_inventory()
        return

    if args.inventory or args.dry_run:
        print_inventory()
        if not any([args.all, args.portraits, args.movement, args.attacks,
                    args.death, args.terrain]):
            return

    # Mode test: découvrir les bons endpoints
    if args.test:
        if not API_KEY:
            print("❌ Variable d'environnement LUDO_API_KEY non définie!")
            sys.exit(1)
        client = LudoAPIClient(API_KEY)
        result = client.test_endpoints()
        if result:
            print(f"\n✅ Configuration trouvée:")
            print(f"   Header: {result['header']}")
            print(f"   Endpoint image: {result['endpoint']}")
            print(f"   URL complète: {API_BASE_URL}/{result['endpoint']}")
        return

    # Vérifier la clé API
    if not args.dry_run:
        if not API_KEY:
            print("❌ Variable d'environnement LUDO_API_KEY non définie!")
            print("   export LUDO_API_KEY=\"votre-clé-api\"")
            sys.exit(1)

        client = LudoAPIClient(API_KEY)
        log.info(f"✅ Client API initialisé")
    else:
        client = None

    # Créer les dossiers
    for d in [PORTRAITS_DIR, MOVEMENT_DIR, ATTACK_DIR, DEATH_DIR, TERRAIN_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    # Exécuter les générateurs demandés
    try:
        if args.all or args.portraits:
            generate_missing_portraits(client, dry_run=args.dry_run, force=args.force)

        if args.all or args.movement:
            generate_movement_sprites(client, args.class_filter, dry_run=args.dry_run)

        if args.all or args.attacks:
            generate_attack_sprites(client, args.class_filter, dry_run=args.dry_run)

        if args.all or args.death:
            generate_death_sprites(client, args.class_filter, dry_run=args.dry_run)

        if args.all or args.terrain:
            generate_terrain_tiles(client, dry_run=args.dry_run)

        if args.all or args.metadata:
            generate_sprites_metadata()

    except KeyboardInterrupt:
        log.info("\n⏹️  Interrompu par l'utilisateur")

    # Résumé
    if client and not args.dry_run:
        log.info(f"\n{'=' * 60}")
        log.info(f"  ✅ Terminé! Crédits utilisés: {client.credits_used:.1f}")
        log.info(f"{'=' * 60}")

    # Toujours générer les métadonnées à la fin
    if not args.dry_run:
        generate_sprites_metadata()


if __name__ == "__main__":
    main()
