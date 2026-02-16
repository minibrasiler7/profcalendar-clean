from config import Config
from flask import Flask, redirect, url_for, flash
from flask_login import current_user
from extensions import db, login_manager, migrate
import logging
import stripe

def create_app(config_name='development'):
    """Factory pour créer l'application Flask"""
    app = Flask(__name__)
    
    # Configuration
    if config_name == 'production':
        from config_production import ProductionConfig
        app.config.from_object(ProductionConfig)
    else:
        app.config.from_object(Config)

    # Forcer le rechargement des templates en production pour éviter le cache
    app.config['TEMPLATES_AUTO_RELOAD'] = True
    app.jinja_env.auto_reload = True

    # Initialisation des extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Veuillez vous connecter pour accéder à cette page.'
    
    # Initialisation du moteur de chiffrement
    try:
        from utils.encryption import encryption_engine
        encryption_engine.init_app(app)
        if encryption_engine.is_enabled:
            print("✅ Chiffrement des données activé")
        else:
            print("⚠️  Chiffrement désactivé (ENCRYPTION_KEY non définie)")
    except ImportError:
        print("❌ Module de chiffrement non trouvé")

    # Enregistrer les filtres Jinja2
    try:
        from utils.jinja_filters import register_filters
        register_filters(app)
        print("✅ Filtres Jinja2 enregistrés")
    except ImportError:
        print("❌ Filtres Jinja2 non trouvés")
    
    # Import du modèle EmailVerification pour les migrations Alembic
    from models.email_verification import EmailVerification

    # Rendre csrf_token() disponible dans tous les templates Jinja2
    from flask_wtf.csrf import generate_csrf
    app.jinja_env.globals['csrf_token'] = generate_csrf

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

    # Blueprint push tokens
    try:
        from routes.push import push_bp
        app.register_blueprint(push_bp)
        print("✅ push blueprint ajouté")
    except ImportError:
        print("❌ push blueprint non trouvé")

    # Debug blueprint
    try:
        from routes.debug_constraint import debug_bp
        app.register_blueprint(debug_bp)
        print("✅ debug blueprint ajouté")
    except ImportError:
        print("❌ debug blueprint non trouvé")

    # Blueprint send to students
    try:
        from routes.send_to_students import send_to_students_bp
        app.register_blueprint(send_to_students_bp)
        print("✅ send_to_students blueprint ajouté")
    except ImportError:
        print("❌ send_to_students blueprint non trouvé")

    # Blueprint fin d'année scolaire
    try:
        from routes.year_end import year_end_bp
        app.register_blueprint(year_end_bp)
        print("✅ year_end blueprint ajouté")
    except ImportError:
        print("❌ year_end blueprint non trouvé")

    # Blueprint abonnements
    try:
        from routes.subscription import subscription_bp
        app.register_blueprint(subscription_bp)
        print("✅ subscription blueprint ajouté")
    except ImportError:
        print("❌ subscription blueprint non trouvé")

    # Blueprint administration
    try:
        from routes.admin import admin_bp
        app.register_blueprint(admin_bp)
        print("✅ admin blueprint ajouté")
    except ImportError:
        print("❌ admin blueprint non trouvé")

    # Commandes CLI pour les données de test
    try:
        from scripts.seed_test_data import register_seed_command
        register_seed_command(app)
        print("✅ Commandes seed-test-data enregistrées")
    except ImportError:
        print("❌ Commandes seed non trouvées")

    # Initialisation Stripe
    stripe.api_key = app.config.get('STRIPE_SECRET_KEY')

    # Migration: ajouter les colonnes si elles n'existent pas
    with app.app_context():
        try:
            # Colonnes TOTP
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(32)"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE"
            ))
            # Colonnes abonnement/premium
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'freemium'"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Table subscriptions
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    stripe_subscription_id VARCHAR(255),
                    stripe_customer_id VARCHAR(255),
                    status VARCHAR(50) DEFAULT 'active',
                    billing_cycle VARCHAR(20),
                    price_id VARCHAR(255),
                    amount INTEGER,
                    currency VARCHAR(10) DEFAULT 'chf',
                    current_period_start TIMESTAMP,
                    current_period_end TIMESTAMP,
                    canceled_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Table vouchers
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS vouchers (
                    id SERIAL PRIMARY KEY,
                    code VARCHAR(50) UNIQUE NOT NULL,
                    voucher_type VARCHAR(50) NOT NULL,
                    duration_days INTEGER,
                    max_uses INTEGER,
                    current_uses INTEGER DEFAULT 0,
                    created_by_id INTEGER NOT NULL REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE
                )
            """))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Table d'association user_voucher_redemptions
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS user_voucher_redemptions (
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
                    redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, voucher_id)
                )
            """))
            db.session.commit()
        except Exception:
            db.session.rollback()

    # Middleware : contrôle d'accès premium
    PREMIUM_ENDPOINTS = {
        'evaluations.', 'attendance.', 'sanctions.',
        'collaboration.', 'file_manager.', 'class_files.'
    }
    PREMIUM_EXACT = {'planning.manage_classes'}

    @app.before_request
    def check_premium_access():
        """Redirige les utilisateurs freemium vers la page pricing pour les routes premium"""
        from flask import request
        from models.user import User

        if not request.endpoint:
            return

        # Vérifier si c'est un endpoint premium
        is_premium_route = request.endpoint in PREMIUM_EXACT
        if not is_premium_route:
            for prefix in PREMIUM_ENDPOINTS:
                if request.endpoint.startswith(prefix):
                    is_premium_route = True
                    break

        if not is_premium_route:
            return

        # Vérifier l'authentification et le type d'utilisateur
        if not current_user.is_authenticated:
            return

        if not isinstance(current_user, User):
            return

        # Vérifier l'accès premium
        if not current_user.has_premium_access():
            flash('Cette fonctionnalité nécessite un abonnement Premium.', 'warning')
            return redirect(url_for('subscription.pricing'))

    @app.route('/')
    def index():
        return redirect(url_for('auth.login'))

    return app

# Création de l'instance par défaut
app = create_app()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
