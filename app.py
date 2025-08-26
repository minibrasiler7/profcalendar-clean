from config import Config
from flask import Flask
from extensions import db, login_manager
import logging

def create_app(config_name='development'):
    """Factory pour créer l'application Flask"""
    app = Flask(__name__)
    
    # Configuration
    if config_name == 'production':
        from config_production import ProductionConfig
        app.config.from_object(ProductionConfig)
    else:
        app.config.from_object(Config)
    
    # Initialisation des extensions
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Veuillez vous connecter pour accéder à cette page.'
    
    # Enregistrer les filtres Jinja2
    try:
        from utils.jinja_filters import register_filters
        register_filters(app)
        print("✅ Filtres Jinja2 enregistrés")
    except ImportError:
        print("❌ Filtres Jinja2 non trouvés")
    
    # Enregistrement des blueprints
    from routes.auth import auth_bp
    from routes.planning import planning_bp
    from routes.schedule import schedule_bp
    from routes.setup import setup_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(planning_bp)
    app.register_blueprint(schedule_bp)
    app.register_blueprint(setup_bp)
    
    # Blueprints additionnels avec gestion d'erreur
    try:
        from routes.parent_auth import parent_auth_bp
        app.register_blueprint(parent_auth_bp)
    except ImportError:
        print("parent_auth blueprint non trouvé")

    try:
        from routes.student_auth import student_auth_bp  
        app.register_blueprint(student_auth_bp)
    except ImportError:
        print("student_auth blueprint non trouvé")

    try:
        from routes.collaboration import collaboration_bp
        app.register_blueprint(collaboration_bp)
    except ImportError:
        print("collaboration blueprint non trouvé")
        
    try:
        from routes.evaluations import evaluations_bp
        app.register_blueprint(evaluations_bp)
    except ImportError:
        print("evaluations blueprint non trouvé")
        
    try:
        from routes.attendance import attendance_bp
        app.register_blueprint(attendance_bp)
    except ImportError:
        print("attendance blueprint non trouvé")
        
    try:
        from routes.sanctions import sanctions_bp
        app.register_blueprint(sanctions_bp)
    except ImportError:
        print("sanctions blueprint non trouvé")
        
    try:
        from routes.settings import settings_bp
        app.register_blueprint(settings_bp)
    except ImportError:
        print("settings blueprint non trouvé")
        
    try:
        from routes.file_manager import file_manager_bp
        app.register_blueprint(file_manager_bp)
        print("✅ file_manager blueprint ajouté")
    except ImportError:
        print("❌ file_manager blueprint non trouvé")
        
    try:
        from routes.class_files import class_files_bp
        app.register_blueprint(class_files_bp)
        print("✅ class_files blueprint ajouté")
    except ImportError:
        print("❌ class_files blueprint non trouvé")
        
    # Blueprint temporaire pour migration schedule
    try:
        from migrate_schedule_fields import migrate_schedule_bp
        app.register_blueprint(migrate_schedule_bp)
        print("✅ migrate_schedule blueprint ajouté (temporaire)")
    except ImportError:
        print("❌ migrate_schedule blueprint non trouvé")
        
        
    # mixed_groups n'existe pas, on le retire
    # try:
    #     from routes.mixed_groups import mixed_groups_bp
    #     app.register_blueprint(mixed_groups_bp)
    # except ImportError:
    #     print("mixed_groups blueprint non trouvé")
    
    return app

# Création de l'instance par défaut
app = create_app()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
