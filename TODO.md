# 📋 TODO - ProfCalendar Development

## 🚨 Bugs Mineurs à Corriger

### PDF Viewer & Annotations
- [ ] **Curseur gomme** - Améliorer le curseur CSS (actuellement basique)
- [ ] **Cache navigation** - Les pages PDF se rechargent parfois inutilement  
- [ ] **Scroll synchronisation** - Parfois le scroll ne suit pas la page active
- [ ] **Touch events iPad** - Optimiser la détection stylet vs doigt
- [ ] **Canvas performance** - Optimiser pour les gros PDFs (>20 pages)

### Interface Utilisateur
- [ ] **Responsive design** - Améliorer l'affichage mobile/tablette
- [ ] **Loading states** - Ajouter des indicateurs de chargement cohérents
- [ ] **Error handling** - Meilleurs messages d'erreur utilisateur
- [ ] **Keyboard shortcuts** - Raccourcis clavier pour les outils d'annotation

### Backend & Performance  
- [ ] **Database queries** - Optimiser les requêtes lentes
- [ ] **File upload limits** - Gérer les gros fichiers PDF
- [ ] **Session management** - Améliorer la gestion des sessions utilisateur
- [ ] **API rate limiting** - Protéger contre les abus

## ✨ Nouvelles Fonctionnalités

### Priority 1 - Core Features
- [ ] **Sauvegarde automatique** - Auto-save des annotations toutes les 30s
- [ ] **Historique des modifications** - Voir l'historique des changements
- [ ] **Export annotations** - Exporter PDF avec annotations intégrées
- [ ] **Templates de cours** - Modèles de planification pré-définis
- [ ] **Collaboration temps réel** - Plusieurs enseignants sur un cours

### Priority 2 - UX Improvements  
- [ ] **Thème sombre** - Mode dark/light pour l'interface
- [ ] **Personnalisation toolbar** - Réorganiser les outils d'annotation
- [ ] **Raccourcis personnalisés** - Configurer ses propres raccourcis
- [ ] **Onboarding** - Guide d'utilisation pour nouveaux utilisateurs
- [ ] **Recherche globale** - Rechercher dans tous les documents

### Priority 3 - Advanced Features
- [ ] **API publique** - API REST pour intégrations externes
- [ ] **Plugins système** - Architecture de plugins pour extensions
- [ ] **Analytics** - Statistiques d'utilisation pour les établissements
- [ ] **Multi-langues** - Support international (EN, ES, DE...)
- [ ] **SSO Integration** - Connexion avec systèmes scolaires existants

## 🔧 Améliorations Techniques

### Code Quality
- [ ] **Tests automatisés** - Tests unitaires et d'intégration
- [ ] **Documentation API** - Documentation complète des endpoints
- [ ] **Type hints Python** - Ajouter les annotations de type
- [ ] **JavaScript modules** - Refactoriser en modules ES6
- [ ] **CSS organization** - Organiser le CSS avec des variables

### DevOps & Infrastructure
- [ ] **Environment configs** - Configs séparées dev/staging/prod
- [ ] **Docker setup** - Containerisation pour développement
- [ ] **CI/CD pipeline** - Tests automatiques sur GitHub Actions
- [ ] **Monitoring** - Logs et métriques de performance
- [ ] **Backup strategy** - Sauvegarde automatique des données

### Security
- [ ] **Input validation** - Validation stricte des entrées
- [ ] **File upload security** - Scanner les fichiers uploadés
- [ ] **Rate limiting** - Protection contre les attaques DDoS
- [ ] **HTTPS enforcement** - Forcer HTTPS partout
- [ ] **Security headers** - Ajouter les headers de sécurité

## 📅 Roadmap Suggérée

### Sprint 1 (2 semaines) - Stabilisation
- Fix bugs mineurs connus
- Améliorer error handling
- Ajouter tests de base

### Sprint 2 (2 semaines) - UX Core
- Sauvegarde automatique annotations
- Améliorer curseur gomme 
- Loading states cohérents

### Sprint 3 (2 semaines) - Features
- Export PDF avec annotations
- Templates de cours basiques
- Thème sombre

### Sprint 4 (2 semaines) - Performance
- Optimiser requêtes DB
- Améliorer performance PDF viewer
- Cache intelligent

## 🎯 Comment Contribuer

1. **Choisir une tâche** dans la liste ci-dessus
2. **Créer une branche** : `git checkout -b feature/nom-tache`
3. **Développer et tester** localement
4. **Créer une Pull Request** vers `develop`
5. **Review et merge** après validation

## Notes d'Implémentation

### Outils Recommandés
- **Frontend** : Vanilla JS → Vue.js/React (migration future)
- **CSS** : CSS custom props → Tailwind CSS (migration future)  
- **Testing** : pytest + JavaScript testing framework
- **Monitoring** : Sentry pour error tracking
- **Documentation** : Sphinx pour docs Python + JSDoc