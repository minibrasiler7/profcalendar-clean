"""Notifications push Expo (app Parents & Élèves).

Envoi via l'API push d'Expo (https://exp.host/--/api/v2/push/send) : aucun
certificat APNs à gérer côté serveur, Expo relaie vers Apple. Les jetons
(ExponentPushToken[...]) sont enregistrés par l'app via
POST /api/v1/student/push-token et stockés sur students.expo_push_token.

send_push_async() part en thread démon (comme les emails d'annonces) pour ne
jamais bloquer ni faire échouer la requête appelante.
"""
import logging
import threading

logger = logging.getLogger(__name__)

_EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


def _send_push_sync(tokens, title, body, data=None):
    import requests

    tokens = [t for t in (tokens or []) if t and str(t).startswith('ExponentPushToken')]
    if not tokens:
        return 0
    messages = [{
        'to': t,
        'title': title,
        'body': body,
        'sound': 'default',
        'data': data or {},
    } for t in tokens]
    sent = 0
    # L'API Expo accepte jusqu'à 100 messages par requête.
    for i in range(0, len(messages), 100):
        chunk = messages[i:i + 100]
        try:
            resp = requests.post(_EXPO_PUSH_URL, json=chunk, timeout=10)
            if resp.status_code == 200:
                sent += len(chunk)
            else:
                logger.warning("Expo push HTTP %s: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.warning("Expo push échec: %s", e)
    return sent


def send_push_async(tokens, title, body, data=None):
    """Envoie des notifications push en arrière-plan (fire-and-forget)."""
    tokens = [t for t in (tokens or []) if t]
    if not tokens:
        return
    threading.Thread(
        target=_send_push_sync, args=(tokens, title, body, data), daemon=True
    ).start()
