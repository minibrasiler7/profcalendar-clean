#!/usr/bin/env python3
"""
Script pour ajouter la colonne timezone_offset à la table users
Compatible PostgreSQL et SQLite
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from extensions import db
from sqlalchemy import text

def add_timezone_column():
    with app.app_context():
        try:
            # Déterminer le type de base de données
            db_url = str(db.engine.url)
            is_postgres = 'postgresql' in db_url or 'postgres' in db_url
            
            print(f'Base de données détectée: {"PostgreSQL" if is_postgres else "SQLite"}')
            print(f'URL: {db_url}')
            
            # Vérifier si la colonne existe déjà
            with db.engine.connect() as conn:
                if is_postgres:
                    # PostgreSQL
                    result = conn.execute(text('''
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'users' 
                        AND column_name = 'timezone_offset'
                    '''))
                else:
                    # SQLite
                    result = conn.execute(text("PRAGMA table_info(users)"))
                    columns = [row[1] for row in result]
                    if 'timezone_offset' in columns:
                        print('La colonne timezone_offset existe déjà dans la table users.')
                        return
                    result = None  # Pour éviter le fetchone() plus bas
                
                if result and result.fetchone():
                    print('La colonne timezone_offset existe déjà dans la table users.')
                    return
                
                # Ajouter la colonne
                print('Ajout de la colonne timezone_offset à la table users...')
                conn.execute(text('ALTER TABLE users ADD COLUMN timezone_offset INTEGER DEFAULT 0'))
                conn.commit()
                
                print('✅ Colonne timezone_offset ajoutée avec succès !')
            
        except Exception as e:
            print(f'❌ Erreur lors de l\'ajout de la colonne: {e}')
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    add_timezone_column()