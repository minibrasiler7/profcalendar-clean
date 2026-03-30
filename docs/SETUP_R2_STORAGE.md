# Configuration Cloudflare R2 pour ProfCalendar

## 1. Créer un compte Cloudflare

1. Aller sur https://dash.cloudflare.com/sign-up
2. Créer un compte gratuit
3. Aller dans **R2 Object Storage** dans le menu de gauche

## 2. Créer un bucket R2

1. Cliquer sur **Create bucket**
2. Nom du bucket: `profcalendar-files`
3. Laisser la région par défaut (automatic)
4. Cliquer **Create bucket**

## 3. Créer les clés API

1. Aller dans **R2 Object Storage** > **Manage R2 API Tokens**
2. Cliquer **Create API token**
3. Permissions: **Object Read & Write**
4. Spécifier le bucket: `profcalendar-files`
5. TTL: Laisser par défaut (pas d'expiration)
6. Cliquer **Create API Token**
7. **IMPORTANT**: Copier immédiatement les 3 valeurs:
   - **Account ID** (visible dans l'URL du dashboard: `dash.cloudflare.com/<ACCOUNT_ID>/...`)
   - **Access Key ID**
   - **Secret Access Key**

## 4. Configurer les variables d'environnement sur Render

Dans le dashboard Render > votre service > **Environment** :

```
R2_ACCOUNT_ID=votre_account_id_cloudflare
R2_ACCESS_KEY_ID=votre_access_key_id
R2_SECRET_ACCESS_KEY=votre_secret_access_key
R2_BUCKET_NAME=profcalendar-files
```

## 5. Lancer la migration de base de données

Après le déploiement, exécuter dans le shell Render :

```bash
flask db upgrade
```

Cela ajoutera les colonnes `r2_key` et `r2_thumbnail_key` à la table `user_files`.

Si Flask-Migrate ne fonctionne pas directement, vous pouvez exécuter le SQL manuellement :

```sql
ALTER TABLE user_files ADD COLUMN IF NOT EXISTS r2_key VARCHAR(500);
ALTER TABLE user_files ADD COLUMN IF NOT EXISTS r2_thumbnail_key VARCHAR(500);
```

## 6. Vérification

Une fois configuré :
- Les **nouveaux fichiers** seront stockés sur R2
- Les **anciens fichiers** (BLOB/disque) continuent de fonctionner normalement
- Le système essaie R2 en premier, puis BLOB, puis disque local

## Tarification R2

- **10 Go gratuits** par mois
- Au-delà: **$0.015/Go/mois** (~1.5 centimes par Go)
- **Pas de frais de bande passante sortante** (egress)
- Pour 100 utilisateurs premium x 3 Go = 300 Go = ~$4.50/mois

## Architecture

```
Upload: Fichier -> Flask -> R2 (ou disque si R2 indisponible)
Download: Flask -> R2 -> BLOB -> Disque (cascade de fallback)
Delete: Supprime de R2 + disque + BLOB + base de données
```

## Dépannage

- Si R2 n'est pas configuré, le système fonctionne normalement avec le disque local
- Les logs indiquent "R2 non configuré" si les variables manquent
- Vérifier les logs pour "Erreur upload R2" en cas de problème
