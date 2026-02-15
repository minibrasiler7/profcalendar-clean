# ProfCalendar mobile (Capacitor)

Squelette Capacitor pour emballer la plateforme Parents/Élèves en application mobile (Android/iOS) sans réécrire le front.

## Principe
- On charge directement l’URL existante de la plateforme via `server.url` (ex : production HTTPS).
- Optionnellement, on peut embarquer des assets statiques locaux dans `web-dist` si on dispose d’un export web.

## Pré-requis
- Node 18+ et npm/yarn.
- Android Studio (pour Android) et Xcode + CocoaPods (pour iOS/macOS).
- URL publique de la plateforme (HTTPS recommandé).

## Installation
```bash
cd mobile
npm install
```

## Configuration des 2 applis (Parents et Élèves)
- Parents : `mobile/capacitor.config.ts` pointe par défaut sur `https://profcalendar-clean-dev.onrender.com/parent/login`
- Élèves : `mobile/capacitor.students.config.ts` pointe sur `https://profcalendar-clean-dev.onrender.com/student/login`

Changer l’URL si besoin : définir `MOBILE_WEB_URL` avant les commandes, ou modifier directement `server.url` dans les fichiers ci-dessus.

### Utiliser un bundle web local (optionnel)
1. Placez les fichiers web (index.html + assets) dans `mobile/web-dist/`.
2. Supprimez/neutralisez `server.url` dans la config choisie (Parents ou Élèves) pour qu’elle utilise `webDir`.

## Commandes utiles
```bash
# Vérifier la config Capacitor
npm run cap:doctor

# Ajouter les plateformes (à faire une fois)
npm run cap:add:android
npm run cap:add:ios

# Synchroniser les assets/config vers les plateformes
npm run cap:sync

# Ouvrir dans Android Studio / Xcode
npm run cap:open:android
npm run cap:open:ios
```

### Choisir la config Parents ou Élèves
- Par défaut, Capacitor lit `capacitor.config.ts` (Parents).
- Pour utiliser la config Élèves : ajouter `--config capacitor.students.config.ts` aux commandes, ex :
```bash
npx cap sync --config capacitor.students.config.ts
npx cap open android --config capacitor.students.config.ts
```

## Push / permissions
- Dépendance ajoutée : `@capacitor/push-notifications`. Après `npm install`, faites `npx cap sync` (et `--config capacitor.students.config.ts` si vous sync l’app Élèves).
- Android :
  - Créez un projet Firebase, récupérez `google-services.json` et placez-le dans `mobile/android/app/` (après avoir ajouté/sync Android).
  - Ou utilisez les scripts de copie depuis `mobile/firebase/parents` ou `mobile/firebase/students` :
  ```bash
  npm run firebase:parents   # copie vers android/app/google-services.json
  npm run firebase:students  # copie la version Élèves
  ```
  - Dans `android/app/build.gradle`, appliquez le plugin `com.google.gms.google-services` (Capacitor le gère si le fichier est là) et assurez-vous d’avoir `classpath "com.google.gms:google-services:4.4.0"` dans le `build.gradle` projet.
  - Autorisations push déjà prises en charge par le plugin ; Android 13+ demandera la permission au runtime.
- iOS :
  - Activez Push Notifications et Remote Notifications dans les “Signing & Capabilities” du target Xcode (Parents ou Élèves).
  - Fournissez la clé APNs (ou certificat) côté backend si vous passez par FCM ou directement APNs.
- Dans le code web (optionnel), vous pouvez appeler `PushNotifications` via Capacitor ; voyez l’exemple `static/js/capacitor-push-helper.js` pour un enregistrement simple (gracieux si hors app).

## Icônes / splash
Utilisez `@capacitor/assets` pour générer les icônes/splash à partir d’une image source :
```bash
npx @capacitor/assets generate --iconSource=./assets/icon.png --splashSource=./assets/splash.png
```
Placez vos sources dans `mobile/assets/` (à créer) avant de lancer la génération.

Des icônes/splash de base sont fournis :
- Parents : `assets/icon-parents.svg`, `assets/splash-parents.svg`
- Élèves : `assets/icon-students.svg`, `assets/splash-students.svg`
Exemple génération (Parents) :
```bash
npx @capacitor/assets generate \
  --iconSource=./assets/icon-parents.svg \
  --splashSource=./assets/splash-parents.svg
```
et pour Élèves, remplacez par les fichiers correspondants + `--config capacitor.students.config.ts` sur les commandes `cap sync`.

### Copie des google-services.json (Android)
Les fichiers fournis sont attendus dans :
- `mobile/firebase/parents/google-services.json`
- `mobile/firebase/students/google-services.json`

Scripts pratiques :
```bash
npm run firebase:parents    # copie vers android/app/google-services.json (Parents)
npm run firebase:students   # copie vers android/app/google-services.json (Élèves)
```
⚠️ Lancez `npx cap add android` une fois avant d’utiliser ces scripts (dossier `mobile/android/app/` requis).
