"""Email de bienvenue / onboarding envoyé juste après l'inscription.

Complète les relances d'essai (services/trial_reminders.py) : la bienvenue
accueille le prof, confirme ses 30 jours de Premium et donne les premiers
gestes pour activer la valeur tôt (meilleure activation → meilleure
conversion). Envoi via le helper générique services.email_service.send_email
(échec silencieux : un email raté ne doit jamais casser l'inscription).
"""
import os
import logging

from services.email_service import send_email

logger = logging.getLogger(__name__)

APP_BASE_URL = os.environ.get('APP_BASE_URL', 'https://profcalendar.org').rstrip('/')
DASHBOARD_URL = APP_BASE_URL + '/planning/dashboard'


def _welcome_html(name):
    return f"""
    <div style="font-family:'Inter',Arial,sans-serif; max-width:540px; margin:0 auto; padding:2rem;">
        <div style="text-align:center; margin-bottom:1.5rem;">
            <h1 style="color:#2d3748; font-size:1.5rem; margin:0;">ProfCalendar</h1>
        </div>
        <div style="background:#ffffff; border:1px solid #E5E7EB; border-radius:12px; padding:1.75rem;">
            <h2 style="color:#4F46E5; font-size:1.3rem; margin:0 0 1rem;">Bienvenue {name} 🎉</h2>
            <p style="color:#374151; line-height:1.55;">
                Ton compte ProfCalendar est prêt — et tu profites de
                <strong>30 jours de Premium offerts</strong>, toutes les
                fonctionnalités débloquées (gestion de classe, notes, présences,
                exercices interactifs, collaboration).
            </p>
            <p style="color:#374151; line-height:1.55; margin-top:1rem;"><strong>Pour bien démarrer&nbsp;:</strong></p>
            <ol style="color:#4B5563; font-size:0.95rem; line-height:1.5; padding-left:1.2rem; margin:0.5rem 0 1.5rem;">
                <li style="margin-bottom:0.4rem;">Crée ta <strong>première classe</strong> — c'est le seul geste pour tout activer (30&nbsp;secondes).</li>
                <li style="margin-bottom:0.4rem;">Planifie tes cours dans le <strong>calendrier</strong>.</li>
                <li style="margin-bottom:0.4rem;">Sur iPad, annote tes <strong>PDF au stylet</strong> (Apple Pencil).</li>
            </ol>
            <div style="text-align:center;">
                <a href="{DASHBOARD_URL}"
                   style="display:inline-block; background:#4F46E5; color:#fff; text-decoration:none;
                          font-weight:600; padding:0.85rem 1.75rem; border-radius:0.5rem;">
                    Ouvrir mon tableau de bord
                </a>
            </div>
            <p style="color:#6B7280; font-size:0.9rem; line-height:1.5; margin-top:1.5rem;">
                Une question ou une idée&nbsp;? Réponds simplement à cet email&nbsp;: je lis tout. 🙂
            </p>
        </div>
        <p style="color:#A0AEC0; font-size:0.72rem; text-align:center; margin-top:1.5rem;">
            Tu reçois cet email parce que tu viens de créer un compte ProfCalendar.
        </p>
    </div>
    """


def send_welcome_email(email, username=None):
    """Envoie l'email de bienvenue. Retourne True/False, ne lève jamais."""
    if not email:
        return False
    name = (username or '').strip() or 'à toi'
    try:
        return send_email(
            email,
            "Bienvenue sur ProfCalendar 🎉 — tes 30 jours de Premium sont actifs",
            _welcome_html(name),
        )
    except Exception:
        logger.exception("[welcome] échec envoi à %s", email)
        return False
