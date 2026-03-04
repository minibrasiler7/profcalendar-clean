import os
from datetime import timedelta
from dotenv import load_dotenv

# Charger les variables d'environnement depuis .env
load_dotenv()

basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    # Configuration générale
    # En production, SECRET_KEY DOIT être définie via variable d'environnement
    SECRET_KEY = os.environ.get('SECRET_KEY')
    if not SECRET_KEY:
        # Avertissement si pas de SECRET_KEY
        if os.environ.get('FLASK_ENV') == 'production':
            raise ValueError("❌ SECRET_KEY doit être définie en production via variable d'environnement!")
        # Clé par défaut uniquement pour développement
        SECRET_KEY = 'dev-secret-key-change-in-production'

    # Configuration base de données (identique à la production)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'database', 'teacher_planner.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Configuration session
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    # Cookies sécurisés uniquement en production (HTTPS)
    SESSION_COOKIE_SECURE = os.environ.get('FLASK_ENV') == 'production'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

    # Configuration WTForms
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None

    # Configuration Resend (service d'envoi email transactionnel)
    RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
    RESEND_FROM_EMAIL = os.environ.get('RESEND_FROM_EMAIL', 'noreply@teacherplanner.com')

    # Configuration Stripe (abonnements)
    STRIPE_PUBLIC_KEY = os.environ.get('STRIPE_PUBLIC_KEY')
    STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')
    STRIPE_PRICE_MONTHLY = os.environ.get('STRIPE_PRICE_MONTHLY')   # ID du prix mensuel Stripe
    STRIPE_PRICE_ANNUAL = os.environ.get('STRIPE_PRICE_ANNUAL')     # ID du prix annuel Stripe
