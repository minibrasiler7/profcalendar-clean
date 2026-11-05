import os
import sys
from contextlib import nullcontext

import resend
from flask_babel import gettext as _gettext, force_locale, get_locale as _babel_get_locale


def _log(msg):
    """Log forcé vers stderr (non bufferisé) pour visibilité sur Render."""
    sys.stderr.write(f"{msg}\n")
    sys.stderr.flush()


# ----------------------------------------------------------------------
# Langue des e-mails
# Chaque e-mail part dans la langue du destinataire (User.locale, remplie à
# l'inscription, à la connexion et au changement de langue). Textes source
# en français : sans traduction, le français part tel quel.
# ----------------------------------------------------------------------
EMAIL_LOCALES = ('fr', 'en', 'es', 'de', 'it')


def email_locale(locale):
    """Langue d'e-mail sûre (fr/en/es/de/it) ; inconnue ou vide → 'fr'.

    À utiliser hors requête (boucles de fond) :
    ``with force_locale(email_locale(user.locale)): ...``
    """
    loc = str(locale or '').strip().lower().replace('-', '_').split('_')[0]
    return loc if loc in EMAIL_LOCALES else 'fr'


def email_language(locale=None):
    """Contexte de langue pour construire un e-mail.

    - langue connue (fr/en/es/de/it) → imposée (force_locale), même si la page
      courante est dans une autre langue ;
    - sinon : langue courante (requête en cours, ou langue déjà imposée par un
      force_locale englobant) ;
    - app_context sans requête ni langue imposée (le sélecteur de langue lit la
      session) → français.
    """
    loc = str(locale or '').strip().lower().replace('-', '_').split('_')[0]
    if loc in EMAIL_LOCALES:
        return force_locale(loc)
    try:
        _babel_get_locale()
        return nullcontext()
    except Exception:
        return force_locale('fr')


def get_user_locale(email):
    """Langue mémorisée du compte enseignant de cette adresse (ou None)."""
    if not email:
        return None
    try:
        from extensions import db
        from models.user import User
        row = db.session.query(User.locale).filter(User.email == email).first()
        return row[0] if row else None
    except Exception:
        try:
            from extensions import db
            db.session.rollback()
        except Exception:
            pass
        return None


def send_verification_code(email, code, user_type='teacher', locale=None):
    """Envoyer un code de vérification par email via Resend.

    Args:
        email: Adresse email du destinataire
        code: Code de vérification à 6 chiffres
        user_type: Type d'utilisateur ('teacher', 'parent', 'student')
        locale: langue de l'e-mail ; par défaut, celle du compte enseignant
            (User.locale) ou à défaut la langue de la page courante

    Returns:
        True si l'envoi a réussi, False sinon
    """
    api_key = os.environ.get('RESEND_API_KEY')
    from_email = os.environ.get('RESEND_FROM_EMAIL', 'onboarding@resend.dev')

    _log(f"[EMAIL] === ENVOI CODE VÉRIFICATION ===")
    _log(f"[EMAIL] Destinataire: {email}, Type: {user_type}")
    _log(f"[EMAIL] RESEND_API_KEY présente: {bool(api_key)}")
    _log(f"[EMAIL] RESEND_FROM_EMAIL: {from_email}")

    # Vérifier que l'adresse expéditeur est valide (contient un @domaine.ext)
    if not from_email or '@' not in from_email or '.' not in from_email.split('@')[-1]:
        _log(f"[EMAIL] RESEND_FROM_EMAIL invalide: '{from_email}', utilisation du fallback")
        from_email = 'onboarding@resend.dev'

    if not api_key:
        _log("[EMAIL] ERREUR: RESEND_API_KEY non configurée - impossible d'envoyer des emails!")
        return False

    _log(f"[EMAIL] Envoi via Resend depuis {from_email} vers {email}...")
    resend.api_key = api_key

    if locale is None and user_type == 'teacher':
        locale = get_user_locale(email)

    with email_language(locale):
        type_labels = {
            'teacher': _gettext('Enseignant'),
            'parent': _gettext('Parent'),
            'student': _gettext('Élève'),
        }
        user_label = type_labels.get(user_type) or _gettext('Utilisateur')

        html_content = f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 2rem;">
        <div style="text-align: center; margin-bottom: 2rem;">
            <h1 style="color: #2d3748; font-size: 1.5rem;">ProfCalendar</h1>
            <p style="color: #718096;">{_gettext('Vérification de votre adresse email')}</p>
        </div>

        <div style="background-color: #f7fafc; border-radius: 12px; padding: 2rem; text-align: center;">
            <p style="color: #4a5568; margin-bottom: 1rem;">
                {_gettext('Votre code de vérification (%(type)s) :', type=user_label)}
            </p>
            <div style="font-size: 2.5rem; font-weight: 700; letter-spacing: 0.5rem; color: #2d3748;
                        background: white; padding: 1rem 2rem; border-radius: 8px; display: inline-block;
                        border: 2px solid #e2e8f0;">
                {code}
            </div>
            <p style="color: #718096; font-size: 0.875rem; margin-top: 1.5rem;">
                {_gettext('Ce code expire dans 10 minutes.')}
            </p>
        </div>

        <p style="color: #a0aec0; font-size: 0.75rem; text-align: center; margin-top: 2rem;">
            {_gettext("Si vous n'avez pas demandé ce code, ignorez cet email.")}
        </p>
    </div>
    """
        subject = _gettext('ProfCalendar - Code de vérification : %(code)s', code=code)

    try:
        result = resend.Emails.send({
            "from": from_email,
            "to": [email],
            "subject": subject,
            "html": html_content
        })
        _log(f"[EMAIL] SUCCÈS - Email envoyé à {email} - Resend response: {result}")
        return True
    except Exception as e:
        _log(f"[EMAIL] ÉCHEC - Erreur envoi à {email}: {type(e).__name__}: {e}")
        return False


def send_email(to_email, subject, html_content):
    """Envoi générique d'un email via Resend (transactionnel).

    Réutilisé par les relances d'essai (et tout autre email applicatif).

    Args:
        to_email: adresse du destinataire
        subject: sujet
        html_content: corps HTML déjà construit

    Returns:
        True si l'envoi a réussi, False sinon.
    """
    api_key = os.environ.get('RESEND_API_KEY')
    from_email = os.environ.get('RESEND_FROM_EMAIL', 'onboarding@resend.dev')

    if not from_email or '@' not in from_email or '.' not in from_email.split('@')[-1]:
        from_email = 'onboarding@resend.dev'

    if not api_key:
        _log("[EMAIL] ERREUR: RESEND_API_KEY non configurée - email non envoyé.")
        return False

    resend.api_key = api_key
    try:
        result = resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
            # Les e-mails invitent à « répondre » : la réponse doit arriver dans une
            # vraie boîte (Zoho), pas sur l'adresse d'envoi technique.
            "reply_to": os.environ.get('REPLY_TO_EMAIL', 'contact@profcalendar.org'),
        })
        _log(f"[EMAIL] SUCCÈS - '{subject}' → {to_email} - {result}")
        return True
    except Exception as e:
        _log(f"[EMAIL] ÉCHEC - '{subject}' → {to_email}: {type(e).__name__}: {e}")
        return False
