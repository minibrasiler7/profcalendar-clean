"""
CONFIGURATION DE PRODUCTION
===========================

Configuration sécurisée pour l'environnement de production
"""

import os
from dotenv import load_dotenv
import logging
from datetime import timedelta

# Charger les variables d'environnement
load_dotenv()

class ProductionConfig:
    """Configuration de production sécurisée"""
    
    # Sécurité de base
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'fallback_key_change_me_immediately'
    DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'
    TESTING = False
    
    # Base de données
    DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///database/teacher_planner.db')
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'connect_args': {
            'options': '-c client_encoding=utf8',
        },
    }
    
    # Session et cookies — persistants pour iPad/web (évite les re-logins)
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    # Remember cookie — auto-reconnexion même après expiration de session
    REMEMBER_COOKIE_DURATION = timedelta(days=90)
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SECURE = True
    REMEMBER_COOKIE_SAMESITE = 'Lax'

    # Cookies sécurisés - HTTPS obligatoire en production
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # HTTPS
    FORCE_HTTPS = os.environ.get('FORCE_HTTPS', 'False').lower() == 'true'
    
    # Upload et fichiers
    MAX_CONTENT_LENGTH = 250 * 1024 * 1024  # 250MB max (pour les gros PDF)
    # Utiliser le stockage persistant Render si disponible (fallback si R2 non configuré)
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', '/opt/render/project/src/uploads')

    # Cloudflare R2 - Stockage externe (optionnel, activé si les 3 variables sont définies)
    R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID')
    R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
    R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
    R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'profcalendar-files')
    
    # Configuration Resend (service d'envoi email transactionnel)
    RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
    RESEND_FROM_EMAIL = os.environ.get('RESEND_FROM_EMAIL', 'noreply@profcalendar.org')

    # Configuration Stripe (abonnements)
    STRIPE_PUBLIC_KEY = os.environ.get('STRIPE_PUBLIC_KEY')
    STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')
    STRIPE_PRICE_MONTHLY = os.environ.get('STRIPE_PRICE_MONTHLY')
    STRIPE_PRICE_ANNUAL = os.environ.get('STRIPE_PRICE_ANNUAL')

    # WTForms
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None

    # Rate limiting
    RATE_LIMIT_ENABLED = os.environ.get('RATE_LIMIT_ENABLED', 'True').lower() == 'true'
    RATE_LIMIT_DEFAULT = os.environ.get('RATE_LIMIT_DEFAULT', '100 per hour')
    
    # Logging
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    LOG_FILE = os.environ.get('LOG_FILE', 'logs/profcalendar.log')
    
    @staticmethod
    def init_app(app):
        """Initialiser l'application avec cette configuration"""
        
        # Configuration du logging
        ProductionConfig.setup_logging(app)
        
        # Vérifications de sécurité
        ProductionConfig.validate_security(app)
        
        # Headers de sécurité
        ProductionConfig.setup_security_headers(app)
    
    @staticmethod
    def setup_logging(app):
        """Configurer le système de logs"""
        
        # Créer le répertoire de logs s'il n'existe pas
        os.makedirs(os.path.dirname(ProductionConfig.LOG_FILE), exist_ok=True)
        
        # Configuration du logging
        logging.basicConfig(
            level=getattr(logging, ProductionConfig.LOG_LEVEL),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(ProductionConfig.LOG_FILE),
                logging.StreamHandler()
            ]
        )
        
        # Logger spécifique pour l'application
        app.logger.setLevel(getattr(logging, ProductionConfig.LOG_LEVEL))
        app.logger.info("Configuration de production initialisée")
    
    @staticmethod
    def validate_security(app):
        """Valider la configuration de sécurité"""
        
        # Vérifier que la SECRET_KEY n'est pas la valeur par défaut
        if app.config['SECRET_KEY'] in ['fallback_key_change_me_immediately', 'dev']:
            app.logger.error("🚨 SECRET_KEY par défaut détectée! Changez-la immédiatement!")
            raise ValueError("SECRET_KEY de production requise")
        
        # Vérifier que DEBUG est désactivé
        if app.config['DEBUG']:
            app.logger.warning("⚠️  DEBUG est activé en production!")
        
        # Vérifier la longueur de la clé secrète
        if len(app.config['SECRET_KEY']) < 32:
            app.logger.warning("⚠️  SECRET_KEY trop courte (< 32 caractères)")
        
        app.logger.info("✅ Validation de sécurité réussie")
    
    @staticmethod
    def setup_security_headers(app):
        """Configurer les headers de sécurité"""
        
        @app.after_request
        def add_security_headers(response):
            # Protection XSS
            response.headers['X-Content-Type-Options'] = 'nosniff'
            response.headers['X-Frame-Options'] = 'DENY'
            response.headers['X-XSS-Protection'] = '1; mode=block'
            
            # CSP de base
            response.headers['Content-Security-Policy'] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://js.stripe.com; "
                "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
                "font-src 'self' https://cdnjs.cloudflare.com; "
                "img-src 'self' data: https://*.stripe.com https://*.r2.cloudflarestorage.com; "
                "frame-src https://js.stripe.com https://hooks.stripe.com; "
                "connect-src 'self' wss: ws: https://api.stripe.com; "
            )
            
            # HTTPS obligatoire si configuré
            if app.config.get('FORCE_HTTPS'):
                response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
            
            return response

class DevelopmentConfig:
    """Configuration pour le développement"""
    
    DEBUG = True
    TESTING = False
    SECRET_KEY = 'dev_key_not_for_production'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///database/teacher_planner.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    @staticmethod
    def init_app(app):
        app.logger.info("Mode développement activé")

class TestingConfig:
    """Configuration pour les tests"""
    
    TESTING = True
    DEBUG = False
    SECRET_KEY = 'test_key'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    WTF_CSRF_ENABLED = False
    
    @staticmethod
    def init_app(app):
        pass

# Dictionnaire des configurations disponibles
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}