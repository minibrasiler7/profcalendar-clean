#!/usr/bin/env python3
import os

print("Demarrage du debogage...")

try:
    print("Import Flask...")
    from flask import Flask
    print("Flask importe avec succes")

    print("Creation app Flask...")
    app = Flask(__name__)
    print("App Flask creee")

    @app.route('/')
    def hello():
        return '''
        <h1>ProfCalendar - Mode Debug</h1>
        <p>Flask fonctionne</p>
        <p>Render OK</p>
        <p>Debogage en cours...</p>
        '''

    @app.route('/health')
    def health():
        return {"status": "OK", "debug": True}

    if __name__ == "__main__":
        port = int(os.environ.get("PORT", 5000))
        print(f"Lancement sur le port {port}")
        app.run(host="0.0.0.0", port=port, debug=False)

except Exception as e:
    print(f"ERREUR: {e}")
    import traceback
    traceback.print_exc()
    raise

