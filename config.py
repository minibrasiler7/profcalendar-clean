import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    # Configuration générale
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-secret-key-change-in-production"

    # Configuration base de données (identique à la production)
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL") or \
        "sqlite:///" + os.path.join(basedir, "database", "teacher_planner.db")
    
    # Debug: afficher le type de base de données utilisé
    if os.environ.get("DATABASE_URL"):
        if os.environ.get("DATABASE_URL").startswith("postgresql"):
            print(f"🔧 DATABASE: PostgreSQL (même config que production)")
        else:
            print(f"🔧 DATABASE: URL personnalisée")
    else:
        print(f"🔧 DATABASE: SQLite local")
    
    print(f"🔧 SECRET_KEY source: {\"ENV\" if os.environ.get(\"SECRET_KEY\") else \"default\"}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Configuration session
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_COOKIE_SECURE = False  # Mettre True en production avec HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # Configuration WTForms
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None
