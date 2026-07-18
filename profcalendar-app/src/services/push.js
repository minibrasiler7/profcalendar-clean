import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import api from '../api/client';

// Afficher les notifications aussi quand l'app est au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Demande la permission de notifications, récupère le jeton Expo et
 * l'enregistre côté serveur (POST /student/push-token). Best effort :
 * ne lève jamais, renvoie le jeton ou null.
 */
export async function registerPushToken() {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData?.data;
    if (token) {
      await api.post('/student/push-token', { token });
    }
    return token || null;
  } catch (e) {
    console.log('Push registration error:', e?.message);
    return null;
  }
}
