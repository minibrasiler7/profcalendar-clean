"""Email de bienvenue / onboarding envoyé juste après l'inscription.

La bienvenue accueille le prof, l'invite à démarrer l'essai gratuit de
14 jours (choisi juste après la vérification de l'email) et donne les
premiers gestes pour activer la valeur tôt. Envoi via le helper générique
services.email_service.send_email (échec silencieux : un email raté ne doit
jamais casser l'inscription).
"""
import os
import logging

from flask_babel import gettext as _gettext

from services.email_service import send_email, email_language, get_user_locale

logger = logging.getLogger(__name__)

APP_BASE_URL = os.environ.get('APP_BASE_URL', 'https://profcalendar.org').rstrip('/')
DASHBOARD_URL = APP_BASE_URL + '/planning/'
VIDEO_PRESENTATION = 'https://youtu.be/nclRivko3j4'


def _welcome_html(name, locale=None):
    with email_language(locale):
        t = {
            'title': (_gettext('Bienvenue %(name)s 🎉', name=name) if name
                      else _gettext('Bienvenue 🎉')),
            'intro': _gettext(
                "Votre compte ProfCalendar est créé. Démarrez votre <strong>essai gratuit de 14 jours</strong>&nbsp;: "
                "tout est débloqué (gestion de classe, notes, présences, fichiers annotés au stylet), "
                "rien n'est débité pendant l'essai et vous pouvez arrêter à tout moment avant la fin."),
            'discover': _gettext(
                "Pour voir l'outil en 2 minutes&nbsp;: <a href=\"%(video_url)s\">la vidéo de présentation</a> "
                "ou <a href=\"%(demo_url)s\">un compte d'exemple à explorer</a>.",
                video_url=VIDEO_PRESENTATION, demo_url=APP_BASE_URL + '/demo'),
            'start': _gettext('Pour bien démarrer&nbsp;:'),
            'step1': _gettext(
                'Créez vos <strong>classes</strong>, votre <strong>horaire</strong> et importez vos '
                '<strong>vacances</strong> — trois étapes guidées sur le tableau de bord.'),
            'step2': _gettext('Planifiez vos cours dans le <strong>calendrier</strong>.'),
            'step3': _gettext('Sur iPad, annotez vos <strong>PDF au stylet</strong> (Apple Pencil).'),
            'cta': _gettext('Démarrer mon essai gratuit'),
            'reply': _gettext('Une question ou une idée&nbsp;? Répondez simplement à cet e-mail&nbsp;: je lis tout. 🙂'),
            'footer': _gettext('Vous recevez cet e-mail parce que vous venez de créer un compte ProfCalendar.'),
        }
    return f"""
    <div style="font-family:'Inter',Arial,sans-serif; max-width:540px; margin:0 auto; padding:2rem;">
        <div style="text-align:center; margin-bottom:1.5rem;">
            <h1 style="color:#2d3748; font-size:1.5rem; margin:0;">ProfCalendar</h1>
        </div>
        <div style="background:#ffffff; border:1px solid #E5E7EB; border-radius:12px; padding:1.75rem;">
            <h2 style="color:#4F46E5; font-size:1.3rem; margin:0 0 1rem;">{t['title']}</h2>
            <p style="color:#374151; line-height:1.55;">
                {t['intro']}
            </p>
            <p style="color:#374151; line-height:1.55;">
                {t['discover']}
            </p>
            <p style="color:#374151; line-height:1.55; margin-top:1rem;"><strong>{t['start']}</strong></p>
            <ol style="color:#4B5563; font-size:0.95rem; line-height:1.5; padding-left:1.2rem; margin:0.5rem 0 1.5rem;">
                <li style="margin-bottom:0.4rem;">{t['step1']}</li>
                <li style="margin-bottom:0.4rem;">{t['step2']}</li>
                <li style="margin-bottom:0.4rem;">{t['step3']}</li>
            </ol>
            <div style="text-align:center;">
                <a href="{DASHBOARD_URL}"
                   style="display:inline-block; background:#4F46E5; color:#fff; text-decoration:none;
                          font-weight:600; padding:0.85rem 1.75rem; border-radius:0.5rem;">
                    {t['cta']}
                </a>
            </div>
            <p style="color:#6B7280; font-size:0.9rem; line-height:1.5; margin-top:1.5rem;">
                {t['reply']}
            </p>
        </div>
        <p style="color:#A0AEC0; font-size:0.72rem; text-align:center; margin-top:1.5rem;">
            {t['footer']}
        </p>
    </div>
    """


def send_welcome_email(email, username=None, locale=None):
    """Envoie l'email de bienvenue. Retourne True/False, ne lève jamais.

    Langue : `locale` si fournie, sinon celle du compte (User.locale), sinon
    la langue de la page courante.
    """
    if not email:
        return False
    name = (username or '').strip()
    try:
        with email_language(locale or get_user_locale(email)):
            return send_email(
                email,
                _gettext('Bienvenue sur ProfCalendar 🎉'),
                _welcome_html(name),
            )
    except Exception:
        logger.exception("[welcome] échec envoi à %s", email)
        return False
