# Setup In-App Purchase — Guide pas-à-pas

Ce guide reprend tout ce qu'il faut configurer côté **App Store Connect**
avant de pouvoir tester l'achat Premium dans l'app iPad.

Le code Swift et le backend Flask sont déjà en place. Il ne te reste qu'à
créer les produits dans App Store Connect, lier les notifications, tester
en sandbox, puis soumettre l'app pour review.

---

## 1. Créer les abonnements dans App Store Connect

### 1.1 Aller dans la bonne section

1. https://appstoreconnect.apple.com → ton app **ProfCalendar Enseignant**
2. Onglet **Monetization** dans la sidebar
3. **Subscriptions** → **+** (créer un groupe d'abonnement)

### 1.2 Créer le groupe d'abonnement

- **Reference Name** : `Premium`
- **Subscription Group Display Name** : `ProfCalendar Premium`
  (visible par les utilisateurs ; localiser en français aussi)

### 1.3 Créer les deux abonnements

À l'intérieur du groupe, créer 2 produits :

#### A. Premium mensuel

| Champ | Valeur |
|---|---|
| **Reference Name** | `Premium Monthly` (interne, jamais affiché) |
| **Product ID** | `ch.teacherplanner.teacher.premium.monthly` ⚠️ EXACT |
| **Subscription Duration** | 1 Month |
| **Price** | CHF 4.90 (Tier 5 ou équivalent dans ton pays) |
| **Localization French** | Display Name : « ProfCalendar Premium mensuel »<br>Description : « Accès complet à toutes les fonctionnalités. Renouvellement automatique chaque mois. » |

#### B. Premium annuel

| Champ | Valeur |
|---|---|
| **Reference Name** | `Premium Annual` |
| **Product ID** | `ch.teacherplanner.teacher.premium.annual` ⚠️ EXACT |
| **Subscription Duration** | 1 Year |
| **Price** | CHF 39.90 |
| **Localization French** | Display Name : « ProfCalendar Premium annuel »<br>Description : « Accès complet à toutes les fonctionnalités. Économisez 32 % sur le tarif mensuel. Renouvellement automatique chaque année. » |

### 1.4 (Optionnel) Offre d'essai gratuit 30 jours

Sur chaque produit → **Introductory Offers** → ajouter un offre « Free Trial » de 30 jours.

Cohérent avec le flow web (où l'utilisateur a 30 jours d'essai automatique à l'inscription).

### 1.5 App Review Information

Pour chaque produit, dans **Review Information** :
- **Review Screenshot** : capture d'écran du paywall iOS (PaywallViewController).
  Tu peux faire ça en lançant l'app dans le simulateur après avoir bumped la version, ouvrir le paywall, ⌘+S.
- **Review Notes** : « Subscription used to unlock all Premium features in the
  classroom management app. Test by tapping Settings > Subscription. »

---

## 2. Configurer App Store Server Notifications V2

C'est l'URL où Apple POSTe à chaque événement d'abonnement
(renouvellements, annulations, etc.). Le backend Flask l'écoute déjà sur
`/api/iap/notifications`.

1. App Store Connect → ton app → **General** → **App Information**
2. Section **App Store Server Notifications**
3. **Version 2 URL Production** : `https://profcalendar.org/api/iap/notifications`
4. **Version 2 URL Sandbox** : `https://profcalendar.org/api/iap/notifications`
   (même URL — le serveur reconnaît automatiquement l'environnement via
   le champ `environment` du JWS).
5. **Save**.

Apple te propose un bouton « Send test notification » — clique-le pour
vérifier que ton serveur répond bien `200 OK`.

---

## 3. Variables d'environnement Render

Ajoute sur Render → ton service → **Environment** :

```
APPLE_IAP_BUNDLE_ID=ch.teacherplanner.teacher
```

(C'est déjà la valeur par défaut hardcodée si la variable est absente, mais
c'est plus propre de la fixer explicitement.)

Aucune clé API ni private key n'est nécessaire : la validation des JWS se
fait offline avec les certificats racine Apple embarqués dans
`utils/apple_iap.py`.

---

## 4. Tester en sandbox

### 4.1 Créer un compte test sandbox

App Store Connect → **Users and Access** → **Sandbox Testers** → **+**
- Crée un compte avec un email factice (ex: `test+ipad@profcalendar.org`)
- Note bien le mot de passe.

### 4.2 Se déconnecter du vrai App Store sur l'iPad

Réglages → ton nom → Media & Purchases → **Sign Out** (NE PAS te
déconnecter de l'iCloud principal — juste de l'App Store).

### 4.3 Builder et installer l'app sur l'iPad

Dans Xcode :
1. `open ios/ProfCalendarEnseignant/ProfCalendarEnseignant.xcodeproj`
2. Sélectionner ton iPad comme destination
3. **Run** (⌘R)
4. L'app s'installe et se lance

### 4.4 Tester l'achat

1. Dans l'app, navigue jusqu'à la page Paramètres → **Abonnement**
2. Clique **Voir les abonnements** → le paywall natif s'ouvre
3. Choisis **Mensuel** → boîte de dialogue Apple s'affiche
4. Connecte-toi avec le compte sandbox créé en 4.1
5. Confirme l'achat (le sandbox n'est pas réellement débité)
6. L'app affiche « Premium activé 🎉 »
7. La WebView recharge → tu vois maintenant toutes les fonctions débloquées

### 4.5 Tester le renouvellement automatique

En sandbox, **1 mois = 5 minutes**. Donc après ~5 min, tu devrais recevoir
une notification de renouvellement sur ton endpoint
`/api/iap/notifications`. Vérifie dans les logs Render :

```
[IAP notif] DID_RENEW /
```

Tu peux aussi vérifier dans Postgres :
```sql
SELECT * FROM apple_subscriptions ORDER BY created_at DESC LIMIT 5;
```

### 4.6 Tester la restauration

1. Désinstalle l'app de l'iPad
2. Réinstalle-la
3. Va dans Abonnement → **Restaurer mes achats**
4. Le serveur doit te remettre en Premium

---

## 5. Soumettre l'app pour review

1. Bump déjà fait : version `1.1.0`, build `4` (dans Info.plist + project.yml).
2. Xcode : **Product → Archive**
3. **Distribute App → App Store Connect → Upload**
4. Sur App Store Connect → **+ Version 1.1.0**
   - **What's New** : « Possibilité de souscrire à Premium directement
     depuis l'app via votre compte Apple. »
5. Sélectionne le build qui vient d'être uploadé.
6. **In-App Purchases** : coche les 2 produits Premium qu'on a créés.
7. **App Review Information → Notes** :

   ```
   Hi App Review team,

   Following the previous rejection (Guideline 3.1.1), we have implemented
   In-App Purchases for the Premium subscription:
     - ch.teacherplanner.teacher.premium.monthly (CHF 4.90/month)
     - ch.teacherplanner.teacher.premium.annual  (CHF 39.90/year)

   The purchase flow is accessible from the user menu > Subscription, which
   now opens a native StoreKit 2 paywall (see screenshot). No external
   payment UI is presented in the iOS app.

   Backend implementation:
     - /api/iap/validate-transaction verifies the signed JWS sent by
       StoreKit using the Apple Root CA G3 trust chain (offline).
     - /api/iap/notifications receives App Store Server Notifications V2
       for renewals, cancellations, refunds and grace periods.
     - User.is_premium() checks both Apple subscriptions and existing
       Stripe web subscriptions (the same account can have either).

   Sandbox test account:
     email: [crée un compte test sur ton site et mets-le ici]
     password: [...]

   Thanks!
   ```

8. **Submit for Review**.

---

## 6. Après approbation

- Le statut passe à **Pending Developer Release** → tu cliques **Release**
- L'app passe en production
- À chaque achat réel, le backend Flask reçoit le JWS, marque l'utilisateur
  Premium dans la DB, et envoie une notification de renouvellement à chaque
  cycle.

---

## Annexe : ce qui se passe quand un user achète

```
[User clique "Mensuel" dans le paywall]
    ↓
StoreKit 2 affiche le dialog Apple (Face ID / password)
    ↓
User confirme
    ↓
StoreKit retourne Transaction { jwsRepresentation: "eyJ..." }
    ↓
IAPManager.purchase() → POST /api/iap/validate-transaction
    ↓
Backend :
  - utils.apple_iap.verify_signed_jws() vérifie la chaîne Apple Root CA G3
  - process_transaction_for_user() upsert dans apple_subscriptions
  - User.subscription_tier = 'premium', premium_until = expires_date
    ↓
200 OK → IAPManager poste .iapPremiumActivated
    ↓
IAPMessageHandler.premiumActivated → WebViewController.reloadCurrentPage()
    ↓
WebView recharge avec le statut Premium activé
```

À chaque renouvellement, Apple POSTe à `/api/iap/notifications` un JWS
contenant la nouvelle transaction. Le backend met à jour `expires_date`,
l'utilisateur reste Premium sans rien faire.

---

## Annexe : sécurité

- Le JWS d'Apple est signé avec une clé EC256. La vérification se fait
  offline avec la chaîne x5c du header et l'Apple Root CA G3 embarqué.
  Aucune communication réseau nécessaire pour valider.
- L'`original_transaction_id` est unique. Si quelqu'un essaie d'envoyer le
  JWS d'un autre user, `process_transaction_for_user` refuse.
- `appAccountToken` (UUID lié au user) est passé au moment de l'achat —
  on pourrait l'utiliser pour un audit en cas de litige.
- Le webhook `/api/iap/notifications` ne fait pas d'authentification de
  session (Apple → notre serveur) mais valide le JWS, donc on est protégé
  contre un faux webhook.
