# Déployer ProfCalendar (parents + élèves) sur iOS et Android

App Expo / React Native qui contient à la fois le flux parent et le flux élève,
l'utilisateur choisi son rôle au login. Un seul Bundle ID, une seule app sur
chaque store.

| | iOS | Android |
|---|---|---|
| Bundle ID / Package | `com.profcalendar.app` | `com.profcalendar.app` |
| Store | App Store | Google Play |
| Min OS | iOS 13.4+ (RN 0.81) | Android 7.0+ (API 24) |

Architecture choisie : **EAS Build** (cloud Expo) — pas besoin d'archiver dans
Xcode ou de bricoler avec Gradle, EAS gère tout, y compris les certificats
Apple et le keystore Android.

---

## 0. Prérequis (une seule fois)

### a. Comptes

- ✅ **Apple Developer** (99 USD/an) — déjà actif.
- ⏳ **Google Play Console** (25 USD une seule fois) — à créer sur
  https://play.google.com/console quand tu seras prêt à déployer Android.
- ⏳ **Compte Expo** (gratuit) — créer sur https://expo.dev (login GitHub OK).

### b. Outils locaux

```bash
# CLI EAS (Expo Application Services)
npm install -g eas-cli

# Vérifier
eas --version    # doit être >= 16.0.0

# Login Expo (te dirige vers le navigateur)
eas login
```

### c. Premier setup du projet

```bash
cd profcalendar-app

# Lier ce projet à ton compte Expo (créer le projet côté Expo)
# Ça ajoute "extra.eas.projectId" et "owner" dans app.json automatiquement
eas init

# (Si demandé : confirmer le slug "profcalendar-app" et créer un nouveau projet)
```

---

## 1. iOS — App Store

### a. Côté Apple Developer (une fois)

1. Va sur https://developer.apple.com/account
2. **Certificates, Identifiers & Profiles** → **Identifiers** → **+** :
   - App ID : `com.profcalendar.app`
   - Description : `ProfCalendar`
   - Capabilities : laisse par défaut pour l'instant (rajoute Push si besoin
     plus tard)
3. Note ton **Team ID** (en haut à droite, format `XXXXXXXXXX`).

### b. Côté App Store Connect (une fois)

1. https://appstoreconnect.apple.com → **My Apps** → **+** :
   - Platform : iOS
   - Name : `ProfCalendar`
   - Primary Language : French
   - Bundle ID : sélectionne `com.profcalendar.app` créé à l'étape précédente
   - SKU : `profcalendar-app-parents-eleves` (libre, mais unique)
2. Note l'**Apple ID** de l'app (numérique, dans App Information → General).
   Tu peux le mettre dans `eas.json` sous `submit.production.ios.ascAppId`
   pour automatiser, mais ce n'est pas obligatoire.

### c. Builder

```bash
cd profcalendar-app

# Build de production (cloud, ~15-20 min)
eas build --platform ios --profile production

# La première fois, EAS te demandera :
# - Apple ID (ton compte développeur)
# - Mot de passe (utilise un mot de passe d'app spécifique : appleid.apple.com → Security → App-Specific Passwords)
# - Il va générer Distribution Certificate + Provisioning Profile automatiquement
```

Le build apparaît sur https://expo.dev → ton projet → Builds. Quand il est
terminé tu peux télécharger le `.ipa` ou laisser EAS le pousser directement.

### d. Soumettre à TestFlight + App Store

```bash
# Pousse automatiquement le dernier build iOS vers App Store Connect
eas submit --platform ios --latest

# EAS demande l'ASC API Key OU ton Apple ID
```

Une fois sur App Store Connect :
1. **TestFlight** → ajouter testeurs internes (toi + collègues). Disponible
   en quelques minutes après upload.
2. **App Store** → remplir la fiche (description, captures d'écran, mots-clés
   FR/EN, classification d'âge, politique de confidentialité — utilise
   l'URL `https://profcalendar.org/privacy`).
3. **Submit for Review** → Apple répond généralement en 24-48 h.

---

## 2. Android — Google Play

### a. Créer le compte Play Console (si pas déjà fait)

1. https://play.google.com/console → s'inscrire (25 USD une fois, paiement
   par carte).
2. Compléter le profil développeur (peut prendre 48 h pour validation).

### b. Côté Play Console (une fois)

1. **All apps** → **Create app** :
   - App name : `ProfCalendar`
   - Default language : French
   - App or game : App
   - Free or paid : Free (sauf si tu factures sur Play, ce qui n'est pas
     ton cas — l'abonnement Premium se fait via Stripe sur le web).
   - Accepter les déclarations.

### c. Builder

```bash
cd profcalendar-app

# Premier build Android : EAS te propose de générer un keystore.
# ⚠️ LE KEYSTORE EST PRÉCIEUX : si tu le perds, tu ne pourras plus
# mettre à jour ton app sur le Play Store. EAS le stocke dans le cloud
# (tu peux aussi le télécharger en backup).
eas build --platform android --profile production
```

Tu obtiens un fichier `.aab` (Android App Bundle, format requis par Play).

### d. Soumettre

```bash
# Pousse le build vers Play Console (piste "internal testing" par défaut)
eas submit --platform android --latest

# La première fois, EAS demande un Service Account Key JSON
# de Google Play. Voir https://docs.expo.dev/submit/android/ pour le générer
# (5 min sur Google Cloud Console).
```

Une fois sur Play Console :
1. **Internal testing** → ajouter testeurs par email. App dispo en ~15 min.
2. **Production** → remplir la fiche (icône 512×512, captures, description,
   politique de confidentialité, classification de contenu) puis publier.

---

## 3. Builder en local (alternative ou debug)

Si EAS Cloud rame ou si tu épuises ton quota free tier, tu peux builder en
local. C'est gratuit mais plus manuel.

### iOS local

```bash
cd profcalendar-app/ios
pod install
cd ..

# Ouvrir Xcode
open ios/ProfCalendar.xcworkspace

# Dans Xcode :
# - Sélectionner "Any iOS Device (arm64)" comme cible
# - Product → Archive
# - Une fois l'archive faite : Window → Organizer → Distribute App → App Store Connect
```

### Android local

```bash
cd profcalendar-app/android

# Génère un AAB signé (requiert que le keystore soit configuré dans gradle.properties)
./gradlew bundleRelease

# Le fichier sort dans app/build/outputs/bundle/release/app-release.aab
# Tu l'uploades manuellement sur play.google.com/console
```

---

## 4. Mettre à jour l'app

EAS gère les versions automatiquement avec `appVersionSource: "remote"` :

```bash
# Itération de code → build
eas build --platform all --profile production

# Soumission
eas submit --platform all --latest
```

Le numéro de build (iOS `buildNumber`, Android `versionCode`) s'incrémente
tout seul grâce à `"autoIncrement": true` dans `eas.json`. Tu n'as à toucher
`version` dans `app.json` que pour les releases marketing (1.0 → 1.1 → 2.0).

---

## 5. EAS Updates (optionnel — mises à jour OTA)

Pour patcher l'app sans repasser par TestFlight / Play Console (utile pour
les bugs urgents JS-only, pas pour les changements natifs) :

```bash
npx expo install expo-updates
eas update:configure
eas update --branch production --message "Fix tarteline X"
```

Pas obligatoire au début, à activer plus tard si besoin.

---

## 6. Checklist avant la première soumission

- [ ] Icône 1024×1024 sans canal alpha (`assets/icon.png` actuel = 350 KB,
      vérifier qu'il fait bien 1024 et est carré opaque)
- [ ] Splash screen défini (`assets/splash-icon.png` OK)
- [ ] Captures d'écran à fournir aux stores :
  - iOS : au moins 1 image 6.5" (1284×2778) + 1 image 6.7" (1290×2796)
  - Android : 2 captures minimum, format portrait
- [ ] Politique de confidentialité publique : `https://profcalendar.org/privacy` ✅
- [ ] CGU publiques : `https://profcalendar.org/terms` ✅
- [ ] Classification de contenu (PEGI / ESRB) — répondre aux questions du
      questionnaire, l'app n'a rien de sensible donc PEGI 3
- [ ] Texte d'utilisation des permissions (`NSCameraUsageDescription` etc.)
      en français ET pertinent — déjà dans `app.json` ✅
- [ ] (iOS) Compte de test fourni à Apple pour la review (login parent
      ou élève qui marche)
- [ ] (Android) Idem dans Play Console → App content → App access

---

## 7. Dépannage rapide

| Problème | Solution |
|---|---|
| `eas: command not found` | `npm install -g eas-cli` |
| Build iOS échoue sur "No bundle URL present" | Vérifier que `metro.config.js` est OK et `node_modules` réinstallé |
| Build Android échoue sur "SDK location not found" | Ne te concerne pas avec EAS cloud, c'est du local |
| App rejetée par Apple pour "guideline 4.0 spam" | Ajoute plus de captures + description plus détaillée |
| Push notifs ne marchent pas | Voir `mobile/firebase/` pour les `google-services.json` |
| Crash au lancement après build | `expo prebuild --clean` puis `eas build` à nouveau |

---

## Liens utiles

- Doc EAS Build : https://docs.expo.dev/build/introduction/
- Doc EAS Submit : https://docs.expo.dev/submit/introduction/
- App Store Connect : https://appstoreconnect.apple.com
- Play Console : https://play.google.com/console
- Expo Dashboard : https://expo.dev
