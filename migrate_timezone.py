#!/usr/bin/env python3
"""
Route temporaire pour migrer la colonne timezone_offset en production
"""
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from extensions import db
from sqlalchemy import text

migrate_bp = Blueprint('migrate', __name__, url_prefix='/migrate')

@migrate_bp.route('/')
@login_required
def migrate_page():
    """Page pour lancer les migrations"""
    from flask import render_template
    if current_user.id != 1:
        return "Non autorisé", 403
    return render_template('migrate_timezone.html')

@migrate_bp.route('/add-timezone-column', methods=['POST'])
@login_required
def add_timezone_column():
    """Route temporaire pour ajouter la colonne timezone_offset"""
    
    # Sécurité : vérifier que c'est un admin/premier utilisateur
    if current_user.id != 1:
        return jsonify({'error': 'Non autorisé'}), 403
    
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