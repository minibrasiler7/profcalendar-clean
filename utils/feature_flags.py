"""Interrupteurs de fonctionnalités.

Trois fonctions globales sont masquées (code conservé, réactivables par
variable d'environnement sur Render) et un module par enseignant, « Espace
élèves et parents », est désactivé par défaut et s'active dans Paramètres.

    FEATURE_TEACHER_COLLABORATION=1  → collaboration entre enseignants
    FEATURE_RPG_COMBAT=1             → combat RPG en classe
    FEATURE_DASHBOARD_LAYOUTS=1      → barre des 7 dispositions du tableau de bord
"""
import os

from flask import request, redirect, url_for, flash, jsonify, g, abort
from flask_login import current_user


def _on(name):
    return os.environ.get(name, '0').strip().lower() in ('1', 'true', 'yes', 'on')


# Maître de classe, code enseignant, invitations, classes dérivées, groupes
# mixtes, coches centralisées. Jamais utilisé en un an : masqué.
TEACHER_COLLABORATION = _on('FEATURE_TEACHER_COLLABORATION')
# Combat RPG (Phaser + SocketIO), profils, badges, objets.
RPG_COMBAT = _on('FEATURE_RPG_COMBAT')
# Barre des dispositions du tableau de bord (7 modes).
DASHBOARD_LAYOUTS = _on('FEATURE_DASHBOARD_LAYOUTS')


# --- Module « Espace élèves et parents » (par enseignant) -------------------

def students_space_enabled(user=None):
    """Codes élèves et parents, app « Parents & Élèves », exercices
    interactifs, partage de fichiers aux élèves, devoirs à rendre, remarques
    envoyées aux parents. Préférence par enseignant ; au premier appel elle
    est déduite des données existantes (élèves avec email ou compte,
    exercices créés, devoirs en ligne) puis mémorisée."""
    from models.user import User
    user = user if user is not None else current_user
    if not getattr(user, 'is_authenticated', False) or not isinstance(user, User):
        return False
    cache = getattr(g, '_students_space', None)
    if cache is not None and cache[0] == user.id:
        return cache[1]

    value = _read_students_space(user.id)
    if value is None:
        value = _infer_students_space(user.id)
        set_students_space(user.id, value)
    g._students_space = (user.id, bool(value))
    return bool(value)


# La colonne user_preferences.students_space_enabled est posée par le filet
# de sécurité d'app.py et lue/écrite en SQL direct (une ligne de préférences
# est créée au besoin).
def _read_students_space(user_id):
    from extensions import db
    try:
        row = db.session.execute(db.text(
            "SELECT students_space_enabled FROM user_preferences WHERE user_id = :u"
        ), {'u': user_id}).first()
    except Exception:
        db.session.rollback()
        return None
    return None if (row is None or row[0] is None) else bool(row[0])


def set_students_space(user_id, enabled):
    from extensions import db
    from models.user_preferences import UserPreferences
    try:
        UserPreferences.get_or_create_for_user(user_id)
        db.session.execute(db.text(
            "UPDATE user_preferences SET students_space_enabled = :v WHERE user_id = :u"
        ), {'v': bool(enabled), 'u': user_id})
        db.session.commit()
    except Exception:
        db.session.rollback()
    g._students_space = (user_id, bool(enabled))


def _infer_students_space(user_id):
    from extensions import db
    from models.student import Student
    from models.exercise import Exercise
    from models.devoir import Devoir
    try:
        if db.session.query(Student.id).filter(
                Student.user_id == user_id,
                db.or_(Student.password_hash.isnot(None), Student.email_hash.isnot(None))).first():
            return True
        if db.session.query(Exercise.id).filter_by(user_id=user_id).first():
            return True
        if db.session.query(Devoir.id).filter(
                Devoir.user_id == user_id,
                Devoir.devoir_type.in_(('submission', 'exercise'))).first():
            return True
    except Exception:
        db.session.rollback()
    return False


def feature_context():
    """Variables de gabarit : FEATURE_COLLAB, FEATURE_RPG, FEATURE_LAYOUTS,
    students_space (booléen du module de l'enseignant connecté)."""
    return {
        'FEATURE_COLLAB': TEACHER_COLLABORATION,
        'FEATURE_RPG': RPG_COMBAT,
        'FEATURE_LAYOUTS': DASHBOARD_LAYOUTS,
        'students_space': students_space_enabled(),
    }


# --- Garde-fous côté serveur ------------------------------------------------

# Collaboration entre enseignants : routes rendues introuvables quand le
# drapeau est éteint (les pages qui les appellent sont masquées).
COLLAB_ENDPOINTS = {
    'collaboration.create_teacher_code', 'collaboration.regenerate_teacher_code',
    'collaboration.create_shared_class', 'collaboration.deactivate_code',
    'collaboration.end_collaboration', 'collaboration.delete_collaboration',
    'setup.check_teacher', 'setup.search_teachers', 'setup.get_teacher_classes_by_id',
    'setup.get_teacher_classes', 'setup.send_invitation', 'setup.become_class_master',
    'setup.respond_to_invitation', 'setup.manage_classrooms_initial',
    'setup.sync_class_masters', 'setup.api_validate_access_code',
    'setup.api_mixed_class_students', 'setup.api_own_classes', 'setup.api_class_students',
    'planning.add_student_from_master', 'planning.check_master_plan_available',
    'planning.load_master_seating_plan', 'planning.api_mixed_group_available_students',
    'planning.api_add_mixed_group_students', 'planning.api_delete_mixed_group_student',
}

# Espace élèves et parents : routes qui n'ont de sens qu'avec le module.
STUDENTS_SPACE_PREFIXES = ('exercises.', 'send_to_students.')
STUDENTS_SPACE_ENDPOINTS = {
    'collaboration.index', 'class_files.list_students_for_sharing',
    'class_files.share_file_with_students', 'planning.generate_class_code',
    'planning.get_parent_code',
}


def register_feature_gate(app):
    from models.user import User

    @app.before_request
    def check_feature_flags():
        endpoint = request.endpoint
        if not endpoint:
            return
        path = request.path

        if not RPG_COMBAT:
            if endpoint.startswith('combat.') or endpoint == 'student_auth.rpg_avatar' \
                    or '/student/rpg/' in path or '/student/combat/' in path:
                abort(404)

        if not DASHBOARD_LAYOUTS and path.startswith('/api/dashboard/layout'):
            abort(404)

        if not TEACHER_COLLABORATION and endpoint in COLLAB_ENDPOINTS:
            abort(404)

        # Module élèves/parents : seulement pour un enseignant connecté qui ne
        # l'a pas activé (élèves et parents, autres classes, ne sont pas touchés).
        if endpoint.startswith(STUDENTS_SPACE_PREFIXES) or endpoint in STUDENTS_SPACE_ENDPOINTS:
            if current_user.is_authenticated and isinstance(current_user, User) \
                    and not students_space_enabled(current_user):
                wants_json = (request.is_json or '/api/' in path
                              or 'application/json' in (request.headers.get('Accept') or ''))
                if wants_json:
                    return jsonify({'error': 'students_space_disabled',
                                    'message': "Active l'espace élèves et parents dans Paramètres."}), 403
                flash("Active d'abord l'espace élèves et parents dans Paramètres.", 'info')
                return redirect(url_for('settings.students_space'))
