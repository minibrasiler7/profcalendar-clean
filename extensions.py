from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_migrate import Migrate

# Initialisation des extensions
db = SQLAlchemy()
login_manager = LoginManager()
migrate = Migrate()

# Configuration du user_loader pour gérer les trois types d'utilisateurs
@login_manager.user_loader
def load_user(user_id):
    """Charger un utilisateur (enseignant, parent ou élève) par son ID composite"""
    from flask import session

    # L'ID composite a le format "type:id" (ex: "parent:1", "teacher:2", "student:3")
    if ':' in str(user_id):
        user_type, actual_id = user_id.split(':', 1)

        if user_type == 'parent':
            from models.parent import Parent
            return Parent.query.get(int(actual_id))
        elif user_type == 'teacher':
            from models.user import User
            return User.query.get(int(actual_id))
        elif user_type == 'student':
            from models.student import Student
            return Student.query.get(int(actual_id))
    else:
        # Fallback pour la compatibilité avec les sessions existantes
        user_type = session.get('user_type', 'teacher')

        if user_type == 'parent':
            from models.parent import Parent
            return Parent.query.get(int(user_id))
        elif user_type == 'student':
            from models.student import Student
            return Student.query.get(int(user_id))
        else:
            from models.user import User
            return User.query.get(int(user_id))

    return None

@login_manager.unauthorized_handler
def unauthorized():
    """Gestion de la redirection selon le type d'utilisateur"""
    from flask import session, redirect, url_for, request

    # Déterminer vers quelle page de login rediriger selon le contexte
    user_type = session.get('user_type')

    # Si on est sur une route student, rediriger vers student login
    if request.path.startswith('/student'):
        return redirect(url_for('student_auth.login'))
    # Si on est sur une route parent, rediriger vers parent login
    elif request.path.startswith('/parent'):
        return redirect(url_for('parent_auth.login'))
    # Sinon rediriger vers teacher login par défaut
    else:
        return redirect(url_for('auth.login'))
