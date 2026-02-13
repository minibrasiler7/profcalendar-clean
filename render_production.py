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
            # --- Email verification migrations ---
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

            # --- Encryption migrations (add_encryption_001) ---
            ("email_hash sur students",
             "ALTER TABLE students ADD COLUMN email_hash VARCHAR(64)"),
            ("index email_hash students",
             "CREATE INDEX IF NOT EXISTS ix_students_email_hash ON students (email_hash)"),
            ("students.first_name vers Text",
             "ALTER TABLE students ALTER COLUMN first_name TYPE TEXT"),
            ("students.last_name vers Text",
             "ALTER TABLE students ALTER COLUMN last_name TYPE TEXT"),
            ("students.email vers Text",
             "ALTER TABLE students ALTER COLUMN email TYPE TEXT"),
            ("students.date_of_birth vers Text",
             "ALTER TABLE students ALTER COLUMN date_of_birth TYPE TEXT USING date_of_birth::TEXT"),
            ("students.parent_email_mother vers Text",
             "ALTER TABLE students ALTER COLUMN parent_email_mother TYPE TEXT"),
            ("students.parent_email_father vers Text",
             "ALTER TABLE students ALTER COLUMN parent_email_father TYPE TEXT"),
            ("email_hash sur parents",
             "ALTER TABLE parents ADD COLUMN email_hash VARCHAR(64)"),
            ("parents.email vers Text",
             "ALTER TABLE parents ALTER COLUMN email TYPE TEXT"),
            ("parents.first_name vers Text",
             "ALTER TABLE parents ALTER COLUMN first_name TYPE TEXT"),
            ("parents.last_name vers Text",
             "ALTER TABLE parents ALTER COLUMN last_name TYPE TEXT"),
            ("index unique email_hash parents",
             "CREATE UNIQUE INDEX IF NOT EXISTS ix_parents_email_hash ON parents (email_hash)"),
            ("grades.title vers Text",
             "ALTER TABLE grades ALTER COLUMN title TYPE TEXT"),
            ("student_accommodations.custom_name vers Text",
             "ALTER TABLE student_accommodations ALTER COLUMN custom_name TYPE TEXT"),
            ("sanction_templates.name vers Text",
             "ALTER TABLE sanction_templates ALTER COLUMN name TYPE TEXT"),
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

        # Supprimer l'ancienne contrainte unique sur parents.email si elle existe
        try:
            db.session.execute(text("ALTER TABLE parents DROP CONSTRAINT IF EXISTS parents_email_key"))
            db.session.commit()
            print("OK: suppression contrainte unique parents.email")
        except Exception as e:
            db.session.rollback()
            print(f"SKIP contrainte parents.email: {e}")

        # Stamper Alembic à la dernière migration appliquée
        try:
            from flask_migrate import stamp
            stamp(revision='add_encryption_001')
            print("Alembic stampe a add_encryption_001")
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

