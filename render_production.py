#!/usr/bin/env python3
"""
ProfCalendar - Production App for Render
"""
import os
from app import create_app
from extensions import db

# Configuration pour la production
os.environ['FLASK_ENV'] = 'production'

# Créer l'application avec la configuration de production
app = create_app('production')

# Fonction pour initialiser la base de données
def init_db():
    """Initialise la base de données si nécessaire"""
    with app.app_context():
        # Créer toutes les tables
        db.create_all()
        print("✅ Base de données initialisée")

if __name__ == "__main__":
    # Initialiser la base de données au démarrage
    init_db()
    
    # Récupérer le port depuis les variables d'environnement
    port = int(os.environ.get("PORT", 5000))
    
    print(f"🚀 Démarrage ProfCalendar sur le port {port}")
    print(f"🔧 Mode: {'Production' if os.environ.get('FLASK_ENV') == 'production' else 'Development'}")
    
    # Lancer l'application
    app.run(host="0.0.0.0", port=port, debug=False)