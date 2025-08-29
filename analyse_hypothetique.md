# Analyse hypothétique du problème P1 vs P4

## Ce que les logs nous disent

```
=== LESSON DEBUG === Searching date: 2025-09-01, weekday: 0
=== LESSON DEBUG === Found planning: 4
=== LESSON DEBUG === Returning planning lesson: P4
```

## Scénarios possibles

### Scénario 1 : P1 n'existe pas dans Planning
- Il n'y a pas de planification pour P1 le 2025-09-01
- La première planification trouvée est P4
- **Solution** : Créer une planification pour P1 ou vérifier le Schedule

### Scénario 2 : P1 existe mais n'est pas un cours
- Il y a une planification P1 mais avec `classroom_id=NULL` et `mixed_group_id=NULL`
- Le système l'ignore et trouve P4 comme premier "cours"
- **Solution** : Vérifier le contenu de la planification P1

### Scénario 3 : Logique de tri incorrecte
- Les planifications ne sont pas triées par `period_number`
- P4 est trouvé en premier par hasard
- **Solution** : Ajouter `ORDER BY period_number` (déjà fait dans mes corrections)

### Scénario 4 : P1 est de type "Autre"
- P1 existe mais c'est une tâche administrative (`custom_task_title`)
- Mon filtre l'exclut correctement, donc P4 devient le premier cours
- **Solution** : C'est le comportement attendu si P1 n'est pas un cours

## Test à faire une fois le déploiement effectif

1. Vérifier via la vue calendrier `/planning/calendar` ce qui est affiché pour P1 le lundi 2025-09-01
2. Si P1 montre un cours → bug dans la détection
3. Si P1 montre "Autre" ou rien → comportement correct

## Commandes de test sur le serveur

```bash
# Une fois le déploiement effectif
python quick_debug.py

# Vérifier les nouveaux logs détaillés
curl https://profcalendar-clean.onrender.com/planning/ 
```

Les nouveaux logs devraient montrer :
```
=== LESSON DEBUG === Checking period P1 on 2025-09-01
=== LESSON DEBUG === P1 on 2025-09-01: Planning found: true/false
```

Au lieu de juste `"Found planning: 4"`.