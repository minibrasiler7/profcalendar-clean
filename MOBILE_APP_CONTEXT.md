# ProfCalendar — Applications Mobiles (Élève & Parent)

## Vue d'ensemble

Il existe **3 implémentations mobiles** dans le projet, chacune avec un rôle différent :

| App | Langage | Cible | Dossier | Statut |
|---|---|---|---|---|
| **App React Native (Expo)** | JavaScript (React Native) | Élèves + Parents (iOS & Android) | `profcalendar-app/` | App principale, la plus complète |
| **App Ionic/Capacitor** | WebView wrappée | Parents + Élèves (Android build prêt) | `mobile/` | Wrapper WebView simple |
| **App iOS Native** | Swift (SwiftUI + PencilKit) | Enseignants (iPad) | Dossier séparé `ios/` | Annotations PDF au stylet |

---

## 1. App React Native / Expo (App principale élève & parent)

### Localisation
```
profcalendar-clean/profcalendar-app/
```

### Langage & Stack
- **JavaScript** avec React Native + Expo SDK 54
- **Navigation** : `@react-navigation` (stack + bottom-tabs)
- **HTTP** : Axios avec intercepteurs JWT
- **Auth** : JWT stocké dans `expo-secure-store`
- **Temps réel** : `socket.io-client` (combats RPG)
- **Bundle ID** : `com.profcalendar.app` (iOS & Android)

### Architecture
```
profcalendar-app/
├── App.js                          # Point d'entrée Expo
├── app.json                        # Config Expo (nom, icônes, bundle ID)
├── package.json                    # Dépendances
├── src/
│   ├── api/
│   │   └── client.js               # Client Axios + JWT interceptors
│   │                                 # Base URL : https://profcalendar-clean.onrender.com/api/v1
│   │                                 # ⚠️ Pointe vers l'ancien nom du service Render !
│   │                                 # Devrait être : https://profcalendar.org/api/v1
│   ├── context/
│   │   └── AuthContext.js           # Provider React pour l'état auth (token, user, userType)
│   ├── navigation/
│   │   ├── AuthNavigator.js         # Routes non-connecté (login, register, choix rôle)
│   │   ├── StudentNavigator.js      # Tab navigator élève (Dashboard, Missions, RPG, etc.)
│   │   └── ParentNavigator.js       # Tab navigator parent (Dashboard, Notes, Absences, etc.)
│   └── screens/
│       ├── auth/                    # 7 écrans d'auth
│       │   ├── RoleSelectScreen.js  # Choix "Je suis élève" / "Je suis parent"
│       │   ├── StudentLoginScreen.js
│       │   ├── StudentRegisterScreen.js
│       │   ├── ParentLoginScreen.js
│       │   ├── ParentRegisterScreen.js
│       │   ├── LinkChildScreen.js   # Lier un enfant (parent)
│       │   └── VerifyEmailScreen.js
│       ├── student/                 # 8 écrans élève
│       │   ├── DashboardScreen.js   # Accueil élève (notes, fichiers, remarques)
│       │   ├── MissionsScreen.js    # Liste des exercices à faire
│       │   ├── ExerciseSolveScreen.js # Résolution d'exercice (QCM, texte, etc.)
│       │   ├── GradesScreen.js      # Notes et moyennes
│       │   ├── FilesScreen.js       # Fichiers partagés par l'enseignant
│       │   ├── TeachersScreen.js    # Liste des enseignants
│       │   ├── RPGDashboardScreen.js # Profil RPG (XP, niveau, monstres)
│       │   └── CombatScreen.js      # Combat RPG en temps réel (SocketIO)
│       └── parent/                  # 10 écrans parent
│           ├── DashboardScreen.js   # Accueil parent (résumé enfant)
│           ├── GradesScreen.js      # Notes de l'enfant
│           ├── AttendanceScreen.js  # Présences / absences
│           ├── SanctionsScreen.js   # Sanctions / comportement
│           ├── RemarksScreen.js     # Remarques de l'enseignant
│           ├── JustifyAbsenceScreen.js # Justifier une absence
│           ├── TeachersScreen.js    # Enseignants de l'enfant
│           ├── LinkTeacherScreen.js # Lier un enseignant
│           ├── AddChildScreen.js    # Ajouter un enfant
│           └── MoreScreen.js        # Paramètres
```

### API Backend (côté serveur Flask)

L'app communique avec le backend via une **API REST JSON + JWT** définie dans :
```
profcalendar-clean/routes/api.py
```
- **Préfixe** : `/api/v1/`
- **Auth** : JWT Bearer token (durée 30 jours)
- **Endpoints principaux** :
  - `POST /api/v1/auth/student/login` → retourne JWT élève
  - `POST /api/v1/auth/parent/login` → retourne JWT parent
  - `GET /api/v1/student/dashboard` → données dashboard élève
  - `GET /api/v1/student/missions` → exercices disponibles
  - `POST /api/v1/student/missions/<id>/submit` → soumettre réponses
  - `GET /api/v1/parent/dashboard` → données dashboard parent
  - Et d'autres endpoints pour notes, fichiers, présences, etc.

### Point important ⚠️
Le fichier `src/api/client.js` pointe vers `https://profcalendar-clean.onrender.com/api/v1` (l'ancien nom du service). Il faudrait le mettre à jour vers `https://profcalendar.org/api/v1` pour la production.

---

## 2. App Ionic / Capacitor (Wrapper WebView)

### Localisation
```
profcalendar-clean/mobile/
```

### Langage & Stack
- **Capacitor** (wrapper natif autour d'une WebView)
- Pas de code JS/TS propre — charge directement les pages web du serveur
- Build Android prêt (`mobile/android/`)

### Principe
C'est un simple **wrapper WebView** qui charge l'application web existante dans une coque native. Deux configurations :

- **`capacitor.config.ts`** → App Parents (`ch.teacherplanner.parents`)
  - Charge `https://profcalendar-clean-dev.onrender.com/parent/login`
  - ⚠️ Pointe vers le serveur dev !

- **`capacitor.students.config.ts`** → App Élèves (`ch.teacherplanner.students`)
  - Charge `https://profcalendar-clean-dev.onrender.com/student/login`
  - ⚠️ Pointe aussi vers le serveur dev !

### Points importants ⚠️
- Les deux configs pointent vers l'URL **dev**, pas production
- Devrait être mis à jour vers `https://profcalendar.org/parent/login` et `https://profcalendar.org/student/login`
- L'app Android est buildée mais l'app iOS Capacitor n'est pas configurée

---

## 3. App iOS Native (Enseignant — PencilKit)

### Localisation
```
ios/ProfCalendarViewer/     (dossier séparé, hors du repo principal)
```

### Langage & Stack
- **Swift 5.9+** avec **SwiftUI**
- **Frameworks** : PencilKit (annotations), WebKit (WKWebView), SwiftUI
- **Cible** : iOS 18.0+, iPad avec Apple Pencil
- **Xcode** : projet .xcodeproj (Xcode 16+)

### Principe
L'app iPad charge le site web ProfCalendar dans une WKWebView, avec une **couche PencilKit transparente par-dessus** pour capturer les traits de stylet à 240Hz. Les traits sont convertis en JSON et envoyés au web via un bridge JavaScript bidirectionnel.

### Architecture (7 fichiers Swift)
```
Sources/
├── App/
│   ├── ProfCalendarApp.swift        # @main, point d'entrée
│   └── ContentView.swift            # ZStack: WebView + PencilKit overlay
├── WebView/
│   ├── WebViewCoordinator.swift     # WKWebView qui charge profcalendar.org
│   └── PencilKitMessageHandler.swift # Bridge JS ↔ Swift (WKScriptMessageHandler)
└── Drawing/
    ├── DrawingCoordinator.swift     # État central (@Published, outils, pages)
    ├── PencilKitOverlay.swift       # PKCanvasView transparent
    └── StrokeConverter.swift        # PKStroke → JSON (points, pression, angle)
```

### URL chargée
```swift
// WebViewCoordinator.swift
URL(string: "https://profcalendar.org")  // ✅ Pointe vers la production
```

---

## Résumé des URLs à corriger

| Fichier | URL actuelle | URL correcte |
|---|---|---|
| `profcalendar-app/src/api/client.js` | `profcalendar-clean.onrender.com/api/v1` | `profcalendar.org/api/v1` |
| `mobile/capacitor.config.ts` | `profcalendar-clean-dev.onrender.com/parent/login` | `profcalendar.org/parent/login` |
| `mobile/capacitor.students.config.ts` | `profcalendar-clean-dev.onrender.com/student/login` | `profcalendar.org/student/login` |
| `ios/.../WebViewCoordinator.swift` | `profcalendar.org` | ✅ Déjà correct |

---

## Ce qui reste à faire côté mobile

1. **Corriger les URLs** des 3 fichiers listés ci-dessus pour pointer vers la production
2. **Tester l'API REST** (`/api/v1/`) — tests S22 à S25 du plan de test
3. **Builder l'app Expo** pour iOS et Android (`npx expo build` ou EAS Build)
4. **Tester sur appareil** — les tests S1-S4 (responsive/mobile) du plan de test
5. **Push notifications** — le backend a un blueprint `push_bp` et un modèle `PushToken`, mais l'intégration Expo Push n'est pas forcément complète
6. **Publication stores** — nécessite un compte Apple Developer ($99/an) et Google Play Console ($25 one-time)
