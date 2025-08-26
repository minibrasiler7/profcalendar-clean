#!/usr/bin/env python3
"""
Route temporaire pour ajouter les champs de fusion à la table schedules
"""
from flask import Blueprint, jsonify, request, Response
from extensions import db
from sqlalchemy import text

migrate_schedule_bp = Blueprint('migrate_schedule', __name__, url_prefix='/migrate-schedule')

@migrate_schedule_bp.route('/')
def migration_page():
    """Page pour ajouter les champs de fusion à schedules"""
    html = """
<!DOCTYPE html>
<html>
<head>
    <title>Migration Schedule Fields</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .btn { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        .btn:hover { background: #0056b3; }
        .result { margin-top: 20px; padding: 15px; border-radius: 5px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
    </style>
</head>
<body>
    <h1>🔗 Migration Schedule - Fusion des périodes</h1>
    <p>Cette page permet d'ajouter les champs de fusion à la table <code>schedules</code>.</p>
    
    <div class="info">
        <strong>⚠️ Erreur :</strong> <code>column schedules.is_merged does not exist</code><br>
        Cette migration ajoute les champs : <code>is_merged</code>, <code>merged_with_previous</code>, <code>has_merged_next</code>
    </div>
    <br>
    
    <div style="margin-bottom: 20px;">
        <label for="password"><strong>Mot de passe de migration :</strong></label><br>
        <input type="password" id="password" placeholder="migrate123" style="padding: 8px; width: 200px; margin-top: 5px;">
        <small style="display: block; color: #666; margin-top: 3px;">Par défaut : migrate123</small>
    </div>
    
    <button class="btn" onclick="executeMigration()">🔧 Ajouter les champs de fusion</button>
    
    <div id="result"></div>

    <script>
        async function executeMigration() {
            const resultDiv = document.getElementById('result');
            const password = document.getElementById('password').value;
            
            if (!password) {
                resultDiv.innerHTML = '<div class="error">❌ Veuillez saisir le mot de passe de migration</div>';
                return;
            }
            
            resultDiv.innerHTML = '<div class="info">🔄 Migration en cours...</div>';
            
            try {
                const response = await fetch('/migrate-schedule/add-fields', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        password: password
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    resultDiv.innerHTML = `<div class="success">✅ ${data.message}<br><br><strong>🎉 La fonctionnalité de fusion des périodes est maintenant disponible !</strong></div>`;
                } else {
                    resultDiv.innerHTML = `<div class="error">❌ ${data.error}</div>`;
                }
                
            } catch (error) {
                resultDiv.innerHTML = `<div class="error">❌ Erreur réseau: ${error.message}</div>`;
            }
        }
    </script>
</body>
</html>
    """
    return Response(html, mimetype='text/html')

@migrate_schedule_bp.route('/add-fields', methods=['POST'])
def add_schedule_fields():
    """Ajouter les champs de fusion à la table schedules"""
    
    try:
        # Vérifier le mot de passe
        data = request.get_json()
        password = data.get('password') if data else None
        import os
        expected_password = os.environ.get('MIGRATION_PASSWORD', 'migrate123')
        
        if password != expected_password:
            return jsonify({
                'success': False, 
                'error': 'Mot de passe de migration incorrect'
            }), 403
        
        # Déterminer le type de base de données
        db_url = str(db.engine.url)
        is_postgres = 'postgresql' in db_url or 'postgres' in db_url
        
        result_msg = f'🔧 Base de données détectée: {"PostgreSQL" if is_postgres else "SQLite"}\n'
        
        # Vérifier si les colonnes existent déjà
        with db.engine.connect() as conn:
            if is_postgres:
                # PostgreSQL
                result = conn.execute(text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'schedules' 
                    AND column_name IN ('is_merged', 'merged_with_previous', 'has_merged_next')
                """))
                existing_columns = [row[0] for row in result]
            else:
                # SQLite
                result = conn.execute(text("PRAGMA table_info(schedules)"))
                columns = [row[1] for row in result]
                existing_columns = [col for col in ['is_merged', 'merged_with_previous', 'has_merged_next'] if col in columns]
            
            fields_to_add = []
            for field in ['is_merged', 'merged_with_previous', 'has_merged_next']:
                if field not in existing_columns:
                    fields_to_add.append(field)
            
            if not fields_to_add:
                return jsonify({
                    'success': True, 
                    'message': f'{result_msg}✅ Tous les champs de fusion existent déjà dans la table schedules.'
                })
            
            # Ajouter les colonnes manquantes
            for field in fields_to_add:
                result_msg += f'📝 Ajout de la colonne {field}...\n'
                conn.execute(text(f'ALTER TABLE schedules ADD COLUMN {field} BOOLEAN DEFAULT FALSE'))
            
            conn.commit()
            result_msg += '✅ Champs de fusion ajoutés avec succès !\n'
            result_msg += '🔗 La fonctionnalité de fusion des périodes est maintenant opérationnelle.'
            
            return jsonify({
                'success': True,
                'message': result_msg
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erreur lors de l\'ajout des champs: {str(e)}'
        }), 500