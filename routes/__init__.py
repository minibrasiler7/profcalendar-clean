# Ce fichier rend le dossier routes un package Python

from functools import wraps
from flask import redirect, url_for, flash
from flask_login import login_required, current_user


def teacher_required(f):
    """Décorateur pour vérifier que c'est bien un enseignant qui est connecté"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        from models.parent import Parent
        from models.student import Student

        if isinstance(current_user, Parent):
            flash('Accès réservé aux enseignants', 'error')
            return redirect(url_for('parent_auth.dashboard'))
        elif isinstance(current_user, Student):
            flash('Accès réservé aux enseignants', 'error')
            return redirect(url_for('student_auth.dashboard'))
        return f(*args, **kwargs)
    return decorated_function


def premium_required(f):
    """Décorateur pour vérifier que l'utilisateur a un abonnement premium"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        from models.user import User

        if not isinstance(current_user, User):
            flash('Accès réservé aux enseignants premium', 'error')
            return redirect(url_for('auth.login'))

        if not current_user.has_premium_access():
            flash('Cette fonctionnalité nécessite un abonnement premium.', 'warning')
            return redirect(url_for('subscription.pricing'))

        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Décorateur pour vérifier que l'utilisateur est administrateur"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        from models.user import User

        if not isinstance(current_user, User) or not current_user.is_admin:
            flash('Accès réservé aux administrateurs', 'error')
            return redirect(url_for('planning.dashboard'))

        return f(*args, **kwargs)
    return decorated_function
