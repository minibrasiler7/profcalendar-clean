"""Outils personnels réservés à un ou quelques comptes enseignants.

Les fonctions « thèmes et exercices », « décaler les planifications » et « objectifs
en PDF » ne sont proposées qu'aux comptes dont l'adresse figure dans
OWNER_FEATURES_EMAILS (par défaut le compte du créateur de ProfCalendar). Pour tous
les autres comptes, rien n'est affiché et les routes répondent 404.
"""
import os
from functools import wraps

from flask import abort
from flask_login import current_user

DEFAULT_OWNER_EMAILS = 'loic.strauch@edu-vd.ch'


def owner_emails():
    raw = os.environ.get('OWNER_FEATURES_EMAILS') or DEFAULT_OWNER_EMAILS
    return {e.strip().lower() for e in raw.split(',') if e.strip()}


def has_owner_features(user=None):
    """Vrai si ce compte enseignant a droit aux outils personnels."""
    user = current_user if user is None else user
    try:
        if not getattr(user, 'is_authenticated', False):
            return False
        from models.user import User
        obj = user._get_current_object() if hasattr(user, '_get_current_object') else user
        if not isinstance(obj, User):          # parents et élèves : jamais
            return False
        return (obj.email or '').strip().lower() in owner_emails()
    except Exception:
        return False


def owner_required(view):
    """Route réservée : 404 pour tout autre compte (la fonction n'existe pas pour lui)."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not has_owner_features():
            abort(404)
        return view(*args, **kwargs)
    return wrapper


def owner_context():
    """`owner_features` dans tous les gabarits."""
    return {'owner_features': has_owner_features()}
