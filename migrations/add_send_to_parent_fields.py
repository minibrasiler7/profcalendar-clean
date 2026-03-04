"""
Migration pour ajouter les champs send_to_parent_and_student à StudentRemark
"""
import sys
import os

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extensions import db
from sqlalchemy import text
from flask import Flask
from dotenv import load_dotenv

load_dotenv()

def migrate():
    """Ajoute les colonnes pour l'envoi de remarques aux parents et élèves"""
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)

    with app.app_context():
        try:
            # Ajouter les nouvelles colonnes
            with db.engine.connect() as conn:
                # Vérifier si les colonnes existent déjà
                result = conn.execute(text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name='student_remarks'
                    AND column_name='send_to_parent_and_student'
                """))

                if result.fetchone() is None:
                    print("Ajout de la colonne send_to_parent_and_student...")
                    conn.execute(text("""
                        ALTER TABLE student_remarks
                        ADD COLUMN send_to_parent_and_student BOOLEAN DEFAULT FALSE
                    """))
                    conn.commit()
                    print("✓ Colonne send_to_parent_and_student ajoutée")
                else:
                    print("✓ Colonne send_to_parent_and_student existe déjà")

                result = conn.execute(text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name='student_remarks'
                    AND column_name='is_viewed_by_parent'
                """))

                if result.fetchone() is None:
                    print("Ajout de la colonne is_viewed_by_parent...")
                    conn.execute(text("""
                        ALTER TABLE student_remarks
                        ADD COLUMN is_viewed_by_parent BOOLEAN DEFAULT FALSE
                    """))
                    conn.commit()
                    print("✓ Colonne is_viewed_by_parent ajoutée")
                else:
                    print("✓ Colonne is_viewed_by_parent existe déjà")

                result = conn.execute(text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name='student_remarks'
                    AND column_name='is_viewed_by_student'
                """))

                if result.fetchone() is None:
                    print("Ajout de la colonne is_viewed_by_student...")
                    conn.execute(text("""
                        ALTER TABLE student_remarks
                        ADD COLUMN is_viewed_by_student BOOLEAN DEFAULT FALSE
                    """))
                    conn.commit()
                    print("✓ Colonne is_viewed_by_student ajoutée")
                else:
                    print("✓ Colonne is_viewed_by_student existe déjà")

            print("\n✅ Migration terminée avec succès!")

        except Exception as e:
            print(f"\n❌ Erreur lors de la migration: {e}")
            raise

if __name__ == '__main__':
    migrate()
