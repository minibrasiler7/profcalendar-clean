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
        try:
            from flask_migrate import upgrade, stamp
            from sqlalchemy import text

            # Vérifier si Alembic a déjà été initialisé sur cette DB
            result = db.session.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version')"
            )).scalar()

            if result:
                # Table alembic_version existe, vérifier si elle a du contenu
                version = db.session.execute(text("SELECT version_num FROM alembic_version")).scalar()
                if version:
                    print(f"Alembic version actuelle: {version}")
                else:
                    # Table existe mais vide - stamper à la révision juste avant nos nouvelles migrations
                    print("Alembic table vide, stamp à 3894eb851cd3")
                    stamp(revision='3894eb851cd3')
            else:
                # Pas de table alembic_version : DB créée avec create_all()
                # Stamper pour dire que toutes les anciennes migrations sont déjà appliquées
                print("Pas de table alembic_version, stamp à 3894eb851cd3")
                stamp(revision='3894eb851cd3')

            db.session.commit()

            # Maintenant appliquer les nouvelles migrations
            upgrade()
            print("Migrations appliquees avec succes")
        except Exception as e:
            print(f"Erreur migrations: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    # Initialiser la base de données au démarrage
    init_db()
    
    # Récupérer le port depuis les variables d'environnement
    port = int(os.environ.get("PORT", 5000))
    
    print(f"Demarrage ProfCalendar sur le port {port}")
    print(f"Mode: Production")
    
    # Lancer l'application
    app.run(host="0.0.0.0", port=port, debug=False)

