"""Mode démonstration : un visiteur explore un compte d'exemple, en lecture seule.

- GET /demo : connecte le visiteur au compte de démo (services/demo_account.py),
  sans mot de passe, et pose le drapeau de session « demo_mode ».
- GET /demo/exit?to=register|login : déconnecte et renvoie vers l'inscription
  (défaut) ou la connexion.
- Toute requête d'écriture (POST, PUT, PATCH, DELETE) en mode démo est refusée :
  JSON 403 avec l'en-tête X-Demo-Readonly pour les appels JavaScript, sinon
  retour à la page précédente avec un message. Les quelques POST de pure
  lecture sont listés dans READONLY_POST_ENDPOINTS.
"""
from flask import Blueprint, flash, jsonify, redirect, request, session, url_for
from flask_babel import gettext
from flask_login import current_user, login_user, logout_user

SESSION_KEY = 'demo_mode'
demo_bp = Blueprint('demo', __name__, url_prefix='/demo')

# Endpoints POST qui ne modifient rien (chargements de données) : autorisés en démo.
READONLY_POST_ENDPOINTS = set()


def is_demo_session():
    from services.demo_account import DEMO_EMAIL
    return bool(session.get(SESSION_KEY)) and current_user.is_authenticated \
        and getattr(current_user, 'email', None) == DEMO_EMAIL


def _readonly_message():
    return gettext("Mode démonstration : rien n'est enregistré. Crée ton compte pour utiliser ProfCalendar avec tes classes.")


@demo_bp.route('', strict_slashes=False)
def start():
    from services.demo_account import ensure_demo_account
    if current_user.is_authenticated and not is_demo_session():
        logout_user()          # un compte réel (non abonné, par exemple) cède la place à la démo
    try:
        user = ensure_demo_account()
    except Exception as e:     # la démo ne doit jamais casser le site
        from extensions import db
        db.session.rollback()
        print(f'[DEMO] ❌ préparation du compte impossible : {e}')
        flash(gettext("La démonstration est momentanément indisponible."), 'warning')
        return redirect(url_for('index'))
    session['user_type'] = 'teacher'
    login_user(user, remember=False)
    session[SESSION_KEY] = True
    print('[DEMO] session de démonstration ouverte')
    target = request.args.get('next', '')
    if not target.startswith('/') or target.startswith('//'):
        target = url_for('planning.dashboard')
    return redirect(target)


@demo_bp.route('/exit')
def exit_demo():
    to = request.args.get('to', 'register')
    if is_demo_session() or session.get(SESSION_KEY):
        session.pop(SESSION_KEY, None)
        session.pop('user_type', None)
        logout_user()
    return redirect(url_for('auth.login' if to == 'login' else 'auth.register'))


def register_demo_mode(app):
    app.register_blueprint(demo_bp)

    @app.before_request
    def demo_readonly_guard():
        if not session.get(SESSION_KEY):
            return None
        if not is_demo_session():          # drapeau orphelin (autre compte connecté) : on nettoie
            session.pop(SESSION_KEY, None)
            return None
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return None
        if request.endpoint in READONLY_POST_ENDPOINTS or (request.endpoint or '').startswith('demo.'):
            return None
        msg = _readonly_message()
        wants_json = (request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
                      or 'application/json' in (request.headers.get('Accept') or '')
                      or request.path.startswith('/api/') or '/api/' in request.path)
        if wants_json:
            resp = jsonify(success=False, demo=True, error=msg, message=msg)
            resp.status_code = 403
            resp.headers['X-Demo-Readonly'] = '1'
            return resp
        flash(msg, 'info')
        back = request.referrer if request.referrer and request.referrer.startswith(request.host_url) else url_for('planning.dashboard')
        return redirect(back)

    @app.after_request
    def demo_noindex(resp):
        # Les pages vues en démo ne doivent jamais être indexées (un robot qui
        # suivrait /demo parcourrait le compte d'exemple).
        if session.get(SESSION_KEY) or request.path.startswith('/demo'):
            resp.headers['X-Robots-Tag'] = 'noindex, nofollow'
        return resp

    @app.context_processor
    def demo_context():
        try:
            return {'is_demo_session': is_demo_session()}
        except Exception:
            return {'is_demo_session': False}
