# 🚀 Guide de Développement - ProfCalendar

## Structure des Branches

### Branches Principales
- **`main`** : Production (Render) - Code stable déployé
- **`develop`** : Développement principal - Intégration des fonctionnalités

### Branches de Travail
- **`feature/nom-fonctionnalite`** : Nouvelles fonctionnalités
- **`hotfix/nom-bug`** : Corrections urgentes en production
- **`release/vX.X.X`** : Préparation des releases

## Workflow de Développement

### 1. Nouvelle Fonctionnalité
```bash
# Créer une branche feature depuis develop
git checkout develop
git pull origin develop
git checkout -b feature/ma-nouvelle-fonctionnalite

# Développer et tester localement
# Faire des commits réguliers

# Pousser et créer une Pull Request vers develop
git push -u origin feature/ma-nouvelle-fonctionnalite
```

### 2. Correction de Bug
```bash
# Pour un bug non urgent
git checkout develop
git checkout -b feature/fix-bug-mineur

# Pour un bug critique en production
git checkout main
git checkout -b hotfix/fix-bug-critique
```

### 3. Déploiement en Production
```bash
# Merger develop vers main
git checkout main
git merge develop
git push origin main
# → Déploiement automatique sur Render
```

## Environnements

### 🏠 Développement Local
- **URL** : http://localhost:5000
- **Base de données** : SQLite locale ou PostgreSQL local
- **Branche** : `develop` ou `feature/*`
- **Debug** : Activé

### 🌐 Production (Render)
- **URL** : https://profcalendar-clean.onrender.com
- **Base de données** : PostgreSQL Render
- **Branche** : `main` uniquement
- **Debug** : Désactivé

## Configuration des Environnements

### Variables d'Environnement
```bash
# Développement (.env.local)
FLASK_ENV=development
DEBUG=True
DATABASE_URL=sqlite:///profcalendar_dev.db

# Production (Render)
FLASK_ENV=production
DEBUG=False
DATABASE_URL=postgresql://... (Render)
```

## Tests et Qualité

### Avant chaque commit
- [ ] Tester localement
- [ ] Vérifier la console JavaScript (pas d'erreurs)
- [ ] Tester les fonctionnalités modifiées
- [ ] Commit avec message descriptif

### Avant merge vers main
- [ ] Tests complets sur develop
- [ ] Validation des nouvelles fonctionnalités
- [ ] Vérification des performances
- [ ] Tests sur différents navigateurs/appareils

## Prochaines Étapes de Développement

Voir le fichier `TODO.md` pour la liste détaillée des tâches.

## Règles de Collaboration

1. **Jamais de push direct sur `main`**
2. **Toujours passer par des Pull Requests**
3. **Tester localement avant de pousser**
4. **Commits descriptifs et atomiques**
5. **Documentation des nouvelles fonctionnalités**