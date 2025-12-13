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
