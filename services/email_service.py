import os
import resend


def send_verification_code(email, code, user_type='teacher'):
    """Envoyer un code de vérification par email via Resend.

    Args:
        email: Adresse email du destinataire
        code: Code de vérification à 6 chiffres
        user_type: Type d'utilisateur ('teacher', 'parent', 'student')

    Returns:
        True si l'envoi a réussi, False sinon
    """
    api_key = os.environ.get('RESEND_API_KEY')
    from_email = os.environ.get('RESEND_FROM_EMAIL', 'onboarding@resend.dev')

    print(f"[EMAIL] === ENVOI CODE VÉRIFICATION ===")
    print(f"[EMAIL] Destinataire: {email}, Type: {user_type}")
    print(f"[EMAIL] RESEND_API_KEY présente: {bool(api_key)}")
    print(f"[EMAIL] RESEND_FROM_EMAIL: {from_email}")

    # Vérifier que l'adresse expéditeur est valide (contient un @domaine.ext)
    if not from_email or '@' not in from_email or '.' not in from_email.split('@')[-1]:
        print(f"[EMAIL] RESEND_FROM_EMAIL invalide: '{from_email}', utilisation du fallback")
        from_email = 'onboarding@resend.dev'

    if not api_key:
        print("[EMAIL] ERREUR: RESEND_API_KEY non configurée - impossible d'envoyer des emails!")
        return False

    print(f"[EMAIL] Envoi via Resend depuis {from_email} vers {email}...")
    resend.api_key = api_key

    type_labels = {
        'teacher': 'Enseignant',
        'parent': 'Parent',
        'student': 'Élève'
    }
    user_label = type_labels.get(user_type, 'Utilisateur')

    html_content = f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 2rem;">
        <div style="text-align: center; margin-bottom: 2rem;">
            <h1 style="color: #2d3748; font-size: 1.5rem;">ProfCalendar</h1>
            <p style="color: #718096;">Vérification de votre adresse email</p>
        </div>

        <div style="background-color: #f7fafc; border-radius: 12px; padding: 2rem; text-align: center;">
            <p style="color: #4a5568; margin-bottom: 1rem;">
                Votre code de vérification ({user_label}) :
            </p>
            <div style="font-size: 2.5rem; font-weight: 700; letter-spacing: 0.5rem; color: #2d3748;
                        background: white; padding: 1rem 2rem; border-radius: 8px; display: inline-block;
                        border: 2px solid #e2e8f0;">
                {code}
            </div>
            <p style="color: #718096; font-size: 0.875rem; margin-top: 1.5rem;">
                Ce code expire dans 10 minutes.
            </p>
        </div>

        <p style="color: #a0aec0; font-size: 0.75rem; text-align: center; margin-top: 2rem;">
            Si vous n'avez pas demandé ce code, ignorez cet email.
        </p>
    </div>
    """

    try:
        result = resend.Emails.send({
            "from": from_email,
            "to": [email],
            "subject": f"ProfCalendar - Code de vérification : {code}",
            "html": html_content
        })
        print(f"[EMAIL] SUCCÈS - Email envoyé à {email} - Resend response: {result}")
        return True
    except Exception as e:
        print(f"[EMAIL] ÉCHEC - Erreur envoi à {email}: {type(e).__name__}: {e}")
        return False
