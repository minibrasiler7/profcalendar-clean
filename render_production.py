#!/usr/bin/env python3
"""
ProfCalendar - Production App for Render
Version: 1bc396b - Force Gunicorn reload for template fix
"""
import os
from app import create_app
from extensions import db

# Configuration pour la production
os.environ['FLASK_ENV'] = 'production'

# Créer l'application avec la configuration de production
app = create_app('production')

def init_db():
    """Initialise la base de données et applique les migrations"""
    with app.app_context():
        from sqlalchemy import text

        # Approche directe : ajouter les colonnes manquantes via SQL
        migrations = [
            ("email_verified sur users",
             "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE"),
            ("email_verified sur parents",
             "ALTER TABLE parents ADD COLUMN email_verified BOOLEAN DEFAULT FALSE"),
            ("email_verified sur students",
             "ALTER TABLE students ADD COLUMN email_verified BOOLEAN DEFAULT FALSE"),
            ("table email_verifications",
             """CREATE TABLE IF NOT EXISTS email_verifications (
                id SERIAL PRIMARY KEY,
                email VARCHAR(120) NOT NULL,
                code VARCHAR(6) NOT NULL,
                user_type VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                is_used BOOLEAN DEFAULT FALSE
             )"""),
            ("index sur email_verifications",
             "CREATE INDEX IF NOT EXISTS ix_email_verifications_email ON email_verifications (email)"),
            ("marquer comptes existants comme verifies",
             "UPDATE users SET email_verified = TRUE WHERE email_verified IS NULL OR email_verified = FALSE"),
            ("marquer parents existants comme verifies",
             "UPDATE parents SET email_verified = TRUE WHERE email_verified IS NULL OR email_verified = FALSE"),
            ("marquer eleves existants comme verifies",
             "UPDATE students SET email_verified = TRUE WHERE email_verified IS NULL OR email_verified = FALSE"),
        ]

        for description, sql in migrations:
            try:
                db.session.execute(text(sql))
                db.session.commit()
                print(f"OK: {description}")
            except Exception as e:
                db.session.rollback()
                if "already exists" in str(e) or "duplicate column" in str(e).lower():
                    print(f"SKIP (deja fait): {description}")
                else:
                    print(f"ERREUR {description}: {e}")

        # Stamper Alembic pour les futures migrations
        try:
            from flask_migrate import stamp
            stamp(revision='77214c11cbcf')
            print("Alembic stampe a 77214c11cbcf")
        except Exception as e:
            print(f"Stamp alembic: {e}")

if __name__ == "__main__":
    # Initialiser la base de données au démarrage
    init_db()
    
    # Récupérer le port depuis les variables d'environnement
    port = int(os.environ.get("PORT", 5000))
    
    print(f"Demarrage ProfCalendar sur le port {port}")
    print(f"Mode: Production")
    
    # Lancer l'application
    app.run(host="0.0.0.0", port=port, debug=False)

