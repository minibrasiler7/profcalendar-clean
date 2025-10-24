---
description: Workflow automatisé complet - correction, déploiement, test et analyse
---

# Workflow Auto Deploy & Test

Exécute un cycle complet d'amélioration, déploiement et test automatisé.

## Instructions

Tu dois suivre ce workflow de manière **autonome et récursive** :

### 1. Correction du code
- Analyse les corrections à apporter basées sur le contexte fourni
- Implémente les changements nécessaires
- Vérifie la syntaxe et la logique

### 2. Commit et Push automatique
```bash
# Vérifie les changements
git status
git diff

# Commit avec un message descriptif
git add .
git commit -m "fix: [description automatique des corrections]"

# Push vers la branche actuelle
git push origin $(git branch --show-current)
