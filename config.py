import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    # Configuration générale
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    # Configuration base de données
    # Fix pour Render: convertir postgresql:// vers postgresql+psycopg2://
    database_url = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'database', 'teacher_planner.db')
    
    # Debug: afficher l'URL de base de données (masquer le mot de passe)
    if database_url.startswith('postgresql'):
        print(f"🔧 DATABASE: PostgreSQL détecté")
        database_url = database_url.replace('postgresql://', 'postgresql+psycopg2://', 1)
    else:
        print(f"🔧 DATABASE: SQLite utilisé - {database_url}")
    
    SQLALCHEMY_DATABASE_URI = database_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Configuration session
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_COOKIE_SECURE = False  # Mettre True en production avec HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

    # Configuration WTForms
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None




































































