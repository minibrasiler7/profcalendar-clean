#!/usr/bin/env python3
"""
Script pour ajouter les colonnes is_pinned et pin_order à la table class_files_v2
"""

import os
from app import create_app
from extensions import db

def add_pinning_columns():
    """Ajoute les colonnes d'épinglage à la table class_files_v2"""
    app = create_app()
    
    with app.app_context():
        try:
            # Ajouter la colonne is_pinned
            db.engine.execute("""
                ALTER TABLE class_files_v2 
                ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE
            """)
            print("✅ Colonne is_pinned ajoutée avec succès")
            
            # Ajouter la colonne pin_order
            db.engine.execute("""
                ALTER TABLE class_files_v2 
                ADD COLUMN IF NOT EXISTS pin_order INTEGER DEFAULT 0
            """)
            print("✅ Colonne pin_order ajoutée avec succès")
            
            # Commit les changements
            db.session.commit()
            print("✅ Migration terminée avec succès")
            
        except Exception as e:
            print(f"❌ Erreur lors de la migration: {e}")
            db.session.rollback()

if __name__ == '__main__':
    add_pinning_columns()