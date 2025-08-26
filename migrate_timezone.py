#!/usr/bin/env python3
"""
Route temporaire pour migrer la colonne timezone_offset en production
"""
from flask import Blueprint, jsonify, request, render_template, session
from extensions import db
from sqlalchemy import text

migrate_bp = Blueprint('migrate', __name__, url_prefix='/migrate')

@migrate_bp.route('/')
def migrate_page():
    """Page pour lancer les migrations - sans login required pour éviter l'erreur de colonne"""
    return render_template('migrate_timezone.html')

@migrate_bp.route('/add-timezone-column', methods=['POST'])
def add_timezone_column():
    """Route temporaire pour ajouter la colonne timezone_offset"""
    
    # Sécurité basique : vérifier un token ou mot de passe simple
    import os
    migration_password = request.json.get('password') if request.is_json else request.form.get('password')
    expected_password = os.environ.get('MIGRATION_PASSWORD', 'migrate123')
    
    if migration_password != expected_password:
        return jsonify({
            'success': False, 
            'error': 'Mot de passe de migration incorrect'
        }), 403
    
    try:
        # Déterminer le type de base de données
        db_url = str(db.engine.url)
        is_postgres = 'postgresql' in db_url or 'postgres' in db_url
        
        result_msg = f'Base de données détectée: {"PostgreSQL" if is_postgres else "SQLite"}\n'
        
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
                
                if result.fetchone():
                    return jsonify({
                        'success': True, 
                        'message': 'La colonne timezone_offset existe déjà dans la table users.'
                    })
            else:
                # SQLite
                result = conn.execute(text("PRAGMA table_info(users)"))
                columns = [row[1] for row in result]
                if 'timezone_offset' in columns:
                    return jsonify({
                        'success': True, 
                        'message': 'La colonne timezone_offset existe déjà dans la table users.'
                    })
            
            # Ajouter la colonne
            conn.execute(text('ALTER TABLE users ADD COLUMN timezone_offset INTEGER DEFAULT 0'))
            conn.commit()
            
            return jsonify({
                'success': True,
                'message': f'✅ Colonne timezone_offset ajoutée avec succès ! ({result_msg.strip()})'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erreur lors de l\'ajout de la colonne: {str(e)}'
        }), 500