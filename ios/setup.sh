#!/bin/bash
# ============================================
# ProfCalendar iOS - Script de setup
# ============================================
# Ce script installe xcodegen (si nécessaire) et génère
# les 3 projets Xcode pour les apps ProfCalendar.
#
# Usage: cd ios && chmod +x setup.sh && ./setup.sh
# ============================================

set -e

echo ""
echo "========================================="
echo "  ProfCalendar iOS - Setup des projets"
echo "========================================="
echo ""

# Vérifier que Xcode est installé
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode n'est pas installé. Installe-le depuis le Mac App Store."
    exit 1
fi
echo "✅ Xcode détecté"

# Vérifier/installer xcodegen
if ! command -v xcodegen &> /dev/null; then
    echo "📦 Installation de xcodegen via Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew n'est pas installé. Installe-le: https://brew.sh"
        exit 1
    fi
    brew install xcodegen
fi
echo "✅ xcodegen détecté"

# Répertoire courant
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Générer les 3 projets
PROJECTS=("ProfCalendarEleves" "ProfCalendarParents" "ProfCalendarEnseignant")
LABELS=("Élèves (iPhone)" "Parents (iPhone)" "Enseignant (iPad)")

for i in "${!PROJECTS[@]}"; do
    PROJECT="${PROJECTS[$i]}"
    LABEL="${LABELS[$i]}"
    PROJECT_DIR="$SCRIPT_DIR/$PROJECT"

    echo ""
    echo "🔨 Génération du projet $LABEL..."

    if [ ! -d "$PROJECT_DIR" ]; then
        echo "❌ Répertoire $PROJECT_DIR introuvable"
        continue
    fi

    cd "$PROJECT_DIR"
    xcodegen generate
    echo "✅ $PROJECT.xcodeproj créé"
done

echo ""
echo "========================================="
echo "  ✅ Tous les projets sont prêts !"
echo "========================================="
echo ""
echo "Prochaines étapes :"
echo ""
echo "1. Ouvrir chaque projet dans Xcode :"
echo "   open ProfCalendarEleves/ProfCalendarEleves.xcodeproj"
echo "   open ProfCalendarParents/ProfCalendarParents.xcodeproj"
echo "   open ProfCalendarEnseignant/ProfCalendarEnseignant.xcodeproj"
echo ""
echo "2. Dans Xcode > Signing & Capabilities :"
echo "   - Sélectionner ton Team (compte Apple Developer)"
echo "   - Vérifier le Bundle ID"
echo ""
echo "3. Ajouter les icônes d'app (1024x1024 PNG) :"
echo "   - Glisser dans Assets.xcassets > AppIcon"
echo ""
echo "4. Builder et tester sur simulateur ou device"
echo ""
echo "5. Archive > Distribute > App Store Connect"
echo ""
