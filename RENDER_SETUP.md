# 🌐 Configuration Render - Production & Développement

## Architecture Recommandée

```
🟢 PRODUCTION
├── Service: profcalendar-clean
├── URL: https://profcalendar-clean.onrender.com
├── Branch: main
├── DB: profcalendar-db (PostgreSQL)
└── Users: Vrais utilisateurs

🟡 DÉVELOPPEMENT  
├── Service: profcalendar-clean-dev
├── URL: https://profcalendar-clean-dev.onrender.com
├── Branch: develop
├── DB: profcalendar-db-dev (PostgreSQL) 
└── Users: Tests uniquement
```

## Configuration Production (Existante)

### Service Web : profcalendar-clean
- **Repository** : `minibrasiler7/profcalendar-clean`
- **Branch** : `main`
- **Build Command** : `pip install -r requirements.txt`
- **Start Command** : `python render_production.py`

### Variables d'Environnement Production
```bash
DATABASE_URL=<URL_POSTGRES_PROD>
SECRET_KEY=<CLE_SECRETE_PROD>
FLASK_ENV=production
DEBUG=False
```

## Configuration Développement (À Créer)

### 1. Créer le Service Web Dev

1. **Render Dashboard** → New → Web Service
2. **Settings** :
   - Name: `profcalendar-clean-dev`
   - Repository: `minibrasiler7/profcalendar-clean`  
   - Branch: `develop` ← **Important !**
   - Environment: Python 3
   - Region: Same as production
   - Plan: Free

3. **Build & Deploy** :
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python render_production.py`
   - Auto-Deploy: Yes

### 2. Créer la Base de Données Dev

1. **Render Dashboard** → New → PostgreSQL
2. **Settings** :
   - Name: `profcalendar-db-dev`
   - Plan: Free (suffisant pour dev)
   - Region: Same as web service

### 3. Variables d'Environnement Dev

```bash
# À configurer dans profcalendar-clean-dev
DATABASE_URL=<URL_POSTGRES_DEV>
SECRET_KEY=dev-secret-key-different-from-prod
FLASK_ENV=development
DEBUG=True

# Optionnel pour le développement
MAX_CONTENT_LENGTH=50331648  # 48MB pour tests
TEMPLATES_AUTO_RELOAD=True
```

## Workflow de Déploiement

### Développement → Staging
```bash
git checkout develop
git add .
git commit -m "feature: nouvelle fonctionnalité"
git push origin develop
# → Auto-deploy sur profcalendar-clean-dev
```

### Staging → Production  
```bash
git checkout main
git merge develop
git push origin main
# → Auto-deploy sur profcalendar-clean (production)
```

## Gestion des Données

### Base de Données Development
- **Données de test** uniquement
- **Schema identique** à la production
- **Migrations** testées ici d'abord
- **Reset** possible sans risque

### Synchronisation Schema
```bash
# En cas de changement de schema
1. Développer les migrations sur develop
2. Tester sur DB dev
3. Merger vers main 
4. Appliquer en production
```

## Alternative Économique

Si tu veux éviter les coûts supplémentaires :

### Option 1: Base SQLite Locale
```bash
# .env.local (développement local)
DATABASE_URL=sqlite:///profcalendar_dev.db
```

### Option 2: Service Dev Temporaire
- Créer le service dev seulement quand nécessaire
- Supprimer après tests
- Utiliser principalement le développement local

### Option 3: Branches Multiples sur Même Service
- Changer la branche du service existant pour tests
- Revenir sur main après validation
- ⚠️ Risqué mais économique

## Surveillance et Monitoring

### Production
- **Logs** : Activer les logs détaillés
- **Alertes** : Configurer les alertes Render
- **Backups** : Sauvegardes automatiques DB

### Développement  
- **Debug** : Logs détaillés activés
- **Tests** : Libre d'expérimenter
- **Reset** : Possibilité de reset complet

## Sécurité

### Données de Test
- **Jamais de vraies données** en développement
- **Anonymisation** si copie depuis production
- **Credentials séparés** entre environnements

### Accès
- **URLs différentes** pour éviter les confusions
- **Credentials différents** 
- **Variables d'environnement distinctes**

## Coûts Estimés

### Configuration Complète
- **Web Service Prod** : Gratuit (750h/mois)
- **Web Service Dev** : Gratuit (750h/mois)  
- **PostgreSQL Prod** : Gratuit (1 DB)
- **PostgreSQL Dev** : $7/mois

### Total : $7/mois pour un setup professionnel complet

### Alternative : $0/mois avec SQLite local pour dev