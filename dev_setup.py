#!/usr/bin/env python3
"""
Script d'installation et configuration pour l'environnement de développement
ProfCalendar

Usage:
    python dev_setup.py
"""

import os
import subprocess
import sys
from pathlib import Path

def run_command(command, description):
    """Exécute une commande et affiche le résultat"""
    print(f"🔧 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, 
                              capture_output=True, text=True)
        print(f"✅ {description} - Succès")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} - Erreur: {e.stderr}")
        return False

def create_dev_env():
    """Crée le fichier .env.local pour le développement"""
    env_local = Path(".env.local")
    if env_local.exists():
        print(f"✅ {env_local} existe déjà")
        return
    
    env_example = Path(".env.example")
    if env_example.exists():
        # Copier .env.example vers .env.local
        with open(env_example, 'r') as f:
            content = f.read()
        
        with open(env_local, 'w') as f:
            f.write(content)
        
        print(f"✅ Créé {env_local} depuis {env_example}")
    else:
        print(f"❌ {env_example} non trouvé")

def create_directories():
    """Crée les dossiers nécessaires pour le développement"""
    dirs = [
        "logs",
        "uploads", 
        "uploads/temp",
        "tests",
        "tests/unit",
        "tests/integration"
    ]
    
    for dir_path in dirs:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
        print(f"✅ Dossier créé: {dir_path}")

def setup_git_hooks():
    """Configure les hooks Git pour le développement"""
    hooks_dir = Path(".git/hooks")
    if not hooks_dir.exists():
        print("❌ Pas dans un repo Git")
        return
    
    # Pre-commit hook simple
    pre_commit = hooks_dir / "pre-commit"
    pre_commit_content = """#!/bin/bash
# Hook pre-commit simple pour ProfCalendar

echo "🔍 Vérification avant commit..."

# Vérifier les fichiers Python avec flake8 si disponible
if command -v flake8 &> /dev/null; then
    echo "🐍 Vérification Python..."
    flake8 --max-line-length=100 --exclude=migrations,venv,.venv
fi

# Vérifier les fichiers JavaScript/CSS de base
echo "🌐 Vérification des assets..."

echo "✅ Vérifications terminées"
exit 0
"""
    
    with open(pre_commit, 'w') as f:
        f.write(pre_commit_content)
    
    # Rendre exécutable
    run_command("chmod +x .git/hooks/pre-commit", "Configuration hook pre-commit")

def main():
    print("🚀 Configuration de l'environnement de développement ProfCalendar")
    print("=" * 60)
    
    # Vérifier qu'on est dans le bon répertoire
    if not Path("app.py").exists():
        print("❌ Erreur: Exécuter ce script depuis la racine du projet ProfCalendar")
        sys.exit(1)
    
    # Vérifier la branche Git
    try:
        result = subprocess.run("git branch --show-current", 
                              shell=True, capture_output=True, text=True)
        current_branch = result.stdout.strip()
        print(f"📂 Branche actuelle: {current_branch}")
        
        if current_branch != "develop":
            print("⚠️  Recommandation: Basculer sur la branche 'develop' pour le développement")
            print("   git checkout develop")
    except:
        print("ℹ️  Impossible de détecter la branche Git")
    
    print("\n🔧 Configuration de l'environnement...")
    
    # Créer l'environnement de développement
    create_dev_env()
    
    # Créer les dossiers nécessaires
    create_directories()
    
    # Configurer Git hooks
    setup_git_hooks()
    
    # Vérifier les dépendances Python
    print("\n🐍 Vérification des dépendances Python...")
    if run_command("pip check", "Vérification dépendances"):
        print("✅ Dépendances Python OK")
    else:
        print("⚠️  Problème avec les dépendances - Exécuter: pip install -r requirements.txt")
    
    print("\n" + "=" * 60)
    print("✅ Configuration terminée !")
    print("\n📋 Prochaines étapes:")
    print("1. Vérifier le fichier .env.local")
    print("2. Lancer l'app: python app.py")
    print("3. Ouvrir: http://localhost:5000")
    print("4. Consulter DEVELOPMENT.md et TODO.md")
    print("\n🎯 Bon développement !")

if __name__ == "__main__":
    main()