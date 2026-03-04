// Inscription push minimaliste pour les vues web chargées dans Capacitor.
// Ne fait rien dans un navigateur classique.
(function () {
  if (typeof window === 'undefined' || !window.Capacitor || !window.Capacitor.isNativePlatform?.()) {
    return;
  }

  const { PushNotifications } = window.Capacitor.Plugins || {};
  if (!PushNotifications) {
    console.warn('Capacitor Push plugin non disponible');
    return;
  }

  async function registerPush() {
    try {
      // Demander l’autorisation (Android 13+ / iOS)
      const permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive !== 'granted') {
        const req = await PushNotifications.requestPermissions();
        if (req.receive !== 'granted') {
          console.warn('Permission push refusée');
          return;
        }
      }

      await PushNotifications.register();

      PushNotifications.addListener('registration', (token) => {
        console.log('Push token obtenu', token.value);
        // TODO: envoyez ce token à votre backend si besoin
        window.dispatchEvent(new CustomEvent('push-token', { detail: token.value }));

        // Envoi backend (gracieux si endpoint absent)
        try {
          fetch('/api/push/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              token: token.value,
              platform: Capacitor.getPlatform?.() || 'unknown'
            })
          }).catch((err) => console.warn('Enregistrement push côté backend échoué', err));
        } catch (err) {
          console.warn('Enregistrement push côté backend échoué', err);
        }
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Erreur d’enregistrement push', err);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push reçu (foreground)', notification);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Action push', action);
      });
    } catch (error) {
      console.error('Erreur registre push', error);
    }
  }

  registerPush();
})();
