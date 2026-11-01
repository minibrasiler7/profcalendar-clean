"""Contrôle d'accès par abonnement (modèle payant dès l'inscription).

Tout l'outil enseignant est payant : plus de niveau gratuit ni d'essai. Les
comptes créés avant la bascule ont l'accès à vie (User.lifetime_premium, voir
models/user.py PAID_MODEL_SINCE et le filet de sécurité dans app.py).

Restent accessibles sans abonnement : connexion et inscription, pages
Abonnement et paiement (Stripe, StoreKit), paramètres du compte (mot de
passe, export, suppression), pages publiques, espaces élève et parent, API
mobile. Les administrateurs ne sont jamais bloqués.
"""
from flask import request, redirect, url_for, flash, jsonify
from flask_babel import gettext
from flask_login import current_user

# Blueprints de l'outil enseignant (préfixes d'endpoint).
PAYWALLED_PREFIXES = (
    'planning.', 'schedule.', 'setup.', 'file_manager.', 'class_files.',
    'evaluations.', 'attendance.', 'sanctions.', 'collaboration.',
    'exercises.', 'combat.', 'year_end.', 'devoirs.', 'formative.',
    'announcements.', 'send_to_students.',
)
# Routes déclarées directement dans app.py (tableau de bord, aide, onboarding).
PAYWALLED_PATHS = ('/api/dashboard/', '/api/onboarding/', '/api/help/')


def is_paywalled_request():
    endpoint = request.endpoint
    if not endpoint:
        return False
    return endpoint.startswith(PAYWALLED_PREFIXES) or request.path.startswith(PAYWALLED_PATHS)


# Page demandée par un non-abonné → clé de section affichée sur la page de
# tarifs et page correspondante du compte de démonstration.
LOCKED_SECTIONS = {
    'calendar': '/planning/calendar',
    'lesson': '/planning/lesson',
    'classes': '/planning/manage-classes',
    'files': '/file_manager/',
    'schedule': '/schedule/weekly',
    'dashboard': '/planning/',
}


def locked_section_key(endpoint):
    endpoint = endpoint or ''
    if endpoint == 'planning.calendar_view':
        return 'calendar'
    if endpoint == 'planning.lesson_view':
        return 'lesson'
    if endpoint.startswith('planning.manage_classes') or endpoint.startswith(('evaluations.', 'attendance.', 'sanctions.')):
        return 'classes'
    if endpoint.startswith(('file_manager.', 'class_files.')):
        return 'files'
    if endpoint.startswith(('schedule.', 'setup.')):
        return 'schedule'
    return 'dashboard'


def register_subscription_gate(app):
    from models.user import User

    @app.before_request
    def check_subscription_access():
        """Renvoie un enseignant sans abonnement vers la page Abonnement."""
        if not is_paywalled_request():
            return
        # Non connecté → c'est login_required qui tranche. Élèves et parents
        # (autres classes) ne dépendent pas de l'abonnement du prof.
        if not current_user.is_authenticated or not isinstance(current_user, User):
            return
        if current_user.is_admin or current_user.has_premium_access():
            return

        wants_json = (request.is_json or '/api/' in request.path
                      or 'application/json' in (request.headers.get('Accept') or ''))
        if wants_json:
            return jsonify({'error': 'subscription_required',
                            'redirect': url_for('subscription.pricing')}), 402
        # Plus de renvoi muet : la page de tarifs explique quelle page est
        # réservée aux abonnés et propose de la voir sur le compte d'exemple.
        return redirect(url_for('subscription.pricing', locked=locked_section_key(request.endpoint)))
