"""Endpoint server pour recevoir et logger les erreurs/freezes côté client.

Pourquoi : le lecteur PDF freeze parfois côté iPad (WKWebView). Quand
le main thread JS est bloqué, on ne peut pas envoyer la requête depuis
le même tick — mais on peut intercepter les "longtasks" (>5s), les
erreurs JS classiques (window.onerror) et les rejets de promesse
(unhandledrejection) AVANT que le freeze ne devienne définitif, et les
remonter ici. Render affichera alors ces logs dans son onglet Logs.

Architecture :
  - Endpoint léger, sans auth obligatoire (les iPads en mode déconnecté
    doivent quand même pouvoir poster)
  - Rate limit basique (10 req / minute / IP) pour éviter qu'un client
    en boucle d'erreur sature les logs
  - Le payload est tronqué pour ne pas faire exploser les logs si un
    client envoie un stack trace gigantesque
"""

import time
from collections import defaultdict
from threading import Lock

from flask import Blueprint, request, jsonify, current_app


diagnostic_bp = Blueprint('diagnostic', __name__, url_prefix='/api/diagnostic')


# Rate limit en mémoire (simple, par-process). Pour Render Free 1 worker
# c'est OK ; sur multi-worker on aurait des compteurs séparés par worker,
# ce qui est acceptable pour un canal best-effort de télémétrie.
_RATE_BUCKET = defaultdict(list)  # ip → list[timestamp]
_RATE_LOCK = Lock()
_RATE_WINDOW_SEC = 60
_RATE_MAX = 10


def _rate_limited(ip: str) -> bool:
    now = time.time()
    with _RATE_LOCK:
        bucket = _RATE_BUCKET[ip]
        # garder seulement les events dans la fenêtre courante
        bucket[:] = [t for t in bucket if now - t < _RATE_WINDOW_SEC]
        if len(bucket) >= _RATE_MAX:
            return True
        bucket.append(now)
    return False


def _truncate(value, max_len: int):
    """Renvoie value tronquée à max_len caractères, en chaîne."""
    if value is None:
        return ''
    s = str(value)
    return s[:max_len] + (f'… ({len(s) - max_len} chars de plus)' if len(s) > max_len else '')


@diagnostic_bp.route('/client-log', methods=['POST'])
def client_log():
    """Reçoit un rapport d'erreur/freeze du client et le log.

    Body JSON attendu :
        {
          "type":     "error"|"unhandledrejection"|"longtask"|"freeze"|"info",
          "message":  str,
          "source":   str (URL),
          "lineno":   int,
          "colno":    int,
          "stack":    str (tronqué côté client si besoin),
          "userAgent": str,
          "url":      str (page courante),
          "duration": float (pour longtask, en ms),
          "context":  dict (libre, ex: numéro de tab PDF actif, taille du doc, …)
        }

    Réponse : {"ok": true} (toujours, sauf rate limit où on renvoie 429).
    """
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()
    if _rate_limited(ip):
        return jsonify({'ok': False, 'error': 'rate_limited'}), 429

    data = request.get_json(silent=True) or {}
    log_type = _truncate(data.get('type', 'unknown'), 30)
    message = _truncate(data.get('message', ''), 500)
    source = _truncate(data.get('source', ''), 200)
    lineno = data.get('lineno') or 0
    colno = data.get('colno') or 0
    stack = _truncate(data.get('stack', ''), 2000)
    user_agent = _truncate(data.get('userAgent', '') or request.headers.get('User-Agent', ''), 200)
    page_url = _truncate(data.get('url', ''), 300)
    duration = data.get('duration')
    context = data.get('context')

    # On utilise WARNING pour que ça ressorte facilement dans les filtres
    # Render. Les vraies erreurs (ex: stack trace présent) sont logguées en
    # ERROR pour qu'on puisse trier.
    level = 'error' if stack or log_type in ('error', 'unhandledrejection') else 'warning'

    header = f"[client-log type={log_type} ip={ip}]"
    fields = [
        f"page={page_url}",
        f"msg={message}",
    ]
    if source:
        fields.append(f"src={source}:{lineno}:{colno}")
    if duration is not None:
        fields.append(f"duration_ms={duration}")
    if user_agent:
        fields.append(f"ua={user_agent}")
    if context:
        fields.append(f"context={_truncate(context, 400)}")
    if stack:
        fields.append(f"stack={stack}")

    line = f"{header} " + " | ".join(fields)
    if level == 'error':
        current_app.logger.error(line)
    else:
        current_app.logger.warning(line)

    return jsonify({'ok': True})
