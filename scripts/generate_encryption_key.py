#!/usr/bin/env python3
"""
Script pour générer une clé de chiffrement Fernet pour ProfCalendar.

Usage:
    python scripts/generate_encryption_key.py

La clé générée doit être ajoutée à:
- .env (développement local)
- Variables d'environnement Render (production)

⚠️ IMPORTANT:
- Ne jamais commiter la clé dans le code source
- Conservez une sauvegarde sécurisée de la clé
- Si la clé est perdue, les données chiffrées seront irrécupérables
"""
from cryptography.fernet import Fernet


def main():
    key = Fernet.generate_key().decode('utf-8')
    print("=" * 60)
    print("  Clé de chiffrement Fernet générée")
    print("=" * 60)
    print()
    print(f"ENCRYPTION_KEY={key}")
    print()
    print("Ajoutez cette ligne à votre fichier .env")
    print("et dans les variables d'environnement sur Render.")
    print()
    print("⚠️  Conservez une copie sécurisée de cette clé !")
    print("    Si elle est perdue, les données chiffrées")
    print("    seront irrécupérables.")
    print("=" * 60)


if __name__ == '__main__':
    main()
