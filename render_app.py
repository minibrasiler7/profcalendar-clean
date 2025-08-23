from flask import Flask
import os

app = Flask(__name__)

@app.route('/')
def hello():
    return """
    <h1>🎉 ProfCalendar sur Render</h1>
    <p>✅ Le serveur fonctionne parfaitement !</p>
    <p>✅ Python : OK</p>
    <p>✅ Flask : OK</p>
    <p>✅ Render : OK</p>
    <hr>
    <p>Version de test - Application en cours de finalisation...</p>
    """

@app.route('/health')
def health():
    return {"status": "OK", "service": "ProfCalendar"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Starting app on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)