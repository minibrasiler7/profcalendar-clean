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
    
    return app

# Création de l'instance par défaut
app = create_app()
