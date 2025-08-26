#!/usr/bin/env python3
"""
Script de migration direct pour ajouter timezone_offset sans passer par Flask-Login
"""
from flask import Flask, request, jsonify, Response
from sqlalchemy import create_engine, text
import os
import json

# Créer une app Flask minimaliste sans login manager
direct_app = Flask(__name__)
direct_app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'migration-key')

# Connexion directe à la base de données
database_url = os.environ.get('DATABASE_URL', 'sqlite:///database/teacher_planner.db')
engine = create_engine(database_url)

@direct_app.route('/direct-migrate')
def migration_page():
    """Page HTML simple pour la migration"""
    html = """
<!DOCTYPE html>
<html>
<head>
    <title>Migration Timezone - Direct</title>
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
    <h1>🚀 Migration Timezone - Direct</h1>
    <p>Cette page permet d'ajouter la colonne <code>timezone_offset</code> directement dans PostgreSQL.</p>
    
    <div class="info">
        <strong>⚠️ Info :</strong> Cette migration contourne Flask-Login pour éviter l'erreur de colonne manquante.
    </div>
    <br>
    
    <div style="margin-bottom: 20px;">
        <label for="password"><strong>Mot de passe de migration :</strong></label><br>
        <input type="password" id="password" placeholder="migrate123" style="padding: 8px; width: 200px; margin-top: 5px;">
        <small style="display: block; color: #666; margin-top: 3px;">Par défaut : migrate123</small>
    </div>
    
    <button class="btn" onclick="executeMigration()">🔧 Exécuter la migration</button>
    
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
                const response = await fetch('/direct-migrate/add-column', {
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
                    resultDiv.innerHTML = `<div class="success">✅ ${data.message}<br><br><strong>🎉 Vous pouvez maintenant utiliser l'application normalement !</strong></div>`;
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
    return html

@direct_app.route('/direct-migrate/add-column', methods=['POST'])
def add_timezone_column():
    """Ajouter la colonne timezone_offset sans Flask-Login"""
    
    try:
        # Vérifier le mot de passe
        data = request.get_json()
        password = data.get('password') if data else None
        expected_password = os.environ.get('MIGRATION_PASSWORD', 'migrate123')
        
        if password != expected_password:
            return jsonify({
                'success': False, 
                'error': 'Mot de passe de migration incorrect'
            }), 403
        
        # Déterminer le type de base de données
        is_postgres = 'postgresql' in database_url or 'postgres' in database_url
        
        result_msg = f'🔧 Base de données détectée: {"PostgreSQL" if is_postgres else "SQLite"}\n'
        result_msg += f'📍 URL: {database_url[:50]}...\n'
        
        # Vérifier si la colonne existe déjà
        with engine.connect() as conn:
            if is_postgres:
                # PostgreSQL
                result = conn.execute(text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' 
                    AND column_name = 'timezone_offset'
                """))
                
                if result.fetchone():
                    return jsonify({
                        'success': True, 
                        'message': f'{result_msg}✅ La colonne timezone_offset existe déjà dans la table users.'
                    })
            else:
                # SQLite
                result = conn.execute(text("PRAGMA table_info(users)"))
                columns = [row[1] for row in result]
                if 'timezone_offset' in columns:
                    return jsonify({
                        'success': True, 
                        'message': f'{result_msg}✅ La colonne timezone_offset existe déjà dans la table users.'
                    })
            
            # Ajouter la colonne
            result_msg += '🚀 Ajout de la colonne timezone_offset...\n'
            conn.execute(text('ALTER TABLE users ADD COLUMN timezone_offset INTEGER DEFAULT 0'))
            conn.commit()
            
            result_msg += '✅ Migration terminée avec succès !'
            
            return jsonify({
                'success': True,
                'message': result_msg
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Erreur lors de la migration: {str(e)}'
        }), 500

if __name__ == '__main__':
    print("🚀 Serveur de migration direct démarré")
    print("📍 Accès: http://localhost:5001/direct-migrate")
    direct_app.run(host='0.0.0.0', port=5001, debug=True)