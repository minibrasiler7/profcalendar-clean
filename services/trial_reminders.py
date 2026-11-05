"""Relances d'essai Premium par email (phase 2 de la com' d'essai).

Au moment de l'inscription, chaque prof reçoit 30 jours de Premium. Avant,
ça expirait en silence → aucune conversion. Ce module envoie 3 emails de
relance bien espacés :

    Étape 1 (stage=1) : ~5 jours avant la fin
    Étape 2 (stage=2) : dernier jour (≤ 1 jour restant)
    Étape 3 (stage=3) : à l'expiration

Idempotence : `User.trial_reminder_stage` mémorise la dernière relance
envoyée, donc chaque email part UNE SEULE fois même si la vérification
tourne plusieurs fois par jour. Les abonnés payants (Stripe/Apple) sont
exclus via `get_trial_info()`.

Déclenchement : un greenthread eventlet dans render_production.py appelle
`send_due_trial_reminders()` toutes les 6 h (process unique = pas de
doublon). Aussi exposé en CLI : `flask send-trial-reminders`.
"""

import os
import logging
from datetime import datetime

from flask_babel import gettext as _gettext, force_locale

from extensions import db
from models.user import User
from services.email_service import send_email, email_language, email_locale

logger = logging.getLogger(__name__)

PRICING_URL = (os.environ.get('APP_BASE_URL', 'https://profcalendar.org')
               .rstrip('/') + '/subscription/pricing')

# Domaines réservés par la norme (RFC 2606 / RFC 6761) : aucun serveur de
# messagerie ne peut les desservir, le fournisseur d'envoi les refuse toujours.
# Sans ce filtre, chaque compte de démo en .example.com restait candidat à
# VIE : l'envoi échouait, la transaction repartait en arrière, le stade de
# relance ne bougeait pas, et la boucle réessayait toutes les 6 h — 120 échecs
# par semaine dans les journaux de production pour 4 comptes de test.
UNDELIVERABLE_DOMAINS = ('example.com', 'example.org', 'example.net')
UNDELIVERABLE_SUFFIXES = ('.example', '.invalid', '.test', '.localhost', '.local')


def is_undeliverable(email):
    """L'adresse appartient-elle à un domaine qui ne peut rien recevoir ?"""
    if not email or '@' not in email:
        return True
    domain = email.rsplit('@', 1)[-1].strip().lower()
    return domain in UNDELIVERABLE_DOMAINS or domain.endswith(UNDELIVERABLE_SUFFIXES)

PREMIUM_PRICE = 'CHF&nbsp;4.90'


def _lost_features():
    """Ce que le prof perd quand l'essai se termine (rappel de valeur),
    dans la langue courante de l'e-mail."""
    return [
        _gettext("la gestion de classe (élèves, groupes)"),
        _gettext("les notes & évaluations"),
        _gettext("le suivi des présences"),
        _gettext("les exercices interactifs"),
        _gettext("la collaboration entre enseignants"),
    ]


def _wrap(title, accent, body_html, cta_label):
    """Gabarit HTML commun aux emails de relance (textes déjà traduits)."""
    features = ''.join(
        f'<li style="margin-bottom:0.35rem;">{f}</li>' for f in _lost_features()
    )
    price_line = _gettext('Premium ProfCalendar — dès %(price)s/mois, sans engagement.',
                          price=PREMIUM_PRICE)
    footer = _gettext('Vous recevez cet e-mail parce que vous avez un compte ProfCalendar.')
    return f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 2rem;">
        <div style="text-align:center; margin-bottom:1.5rem;">
            <h1 style="color:#2d3748; font-size:1.5rem; margin:0;">ProfCalendar</h1>
        </div>
        <div style="background:#ffffff; border:1px solid #E5E7EB; border-radius:12px; padding:1.75rem 1.75rem 2rem;">
            <h2 style="color:{accent}; font-size:1.25rem; margin:0 0 1rem;">{title}</h2>
            {body_html}
            <ul style="color:#4B5563; font-size:0.95rem; padding-left:1.2rem; margin:1rem 0 1.5rem;">
                {features}
            </ul>
            <div style="text-align:center;">
                <a href="{PRICING_URL}"
                   style="display:inline-block; background:{accent}; color:#fff; text-decoration:none;
                          font-weight:600; padding:0.85rem 1.75rem; border-radius:0.5rem;">
                    {cta_label}
                </a>
            </div>
            <p style="color:#9CA3AF; font-size:0.8rem; text-align:center; margin-top:1.25rem;">
                {price_line}
            </p>
        </div>
        <p style="color:#A0AEC0; font-size:0.72rem; text-align:center; margin-top:1.5rem;">
            {footer}
        </p>
    </div>
    """


_P = '<p style="color:#374151; line-height:1.55;">%s</p>'


def _content_for_stage(new_stage, days_remaining, locale=None):
    """Retourne (sujet, html) pour l'étape donnée.

    Langue : `locale` si fournie, sinon la langue courante (celle imposée par
    force_locale dans la boucle d'envoi), à défaut le français.
    """
    with email_language(locale):
        hello = _P % _gettext('Bonjour,')
        if new_stage == 1:
            d = days_remaining
            subject = _gettext('Plus que %(days)s jours de Premium sur ProfCalendar', days=d)
            body = hello + _P % _gettext(
                "Il vous reste <strong>%(days)s jours</strong> d'essai Premium. C'est le moment "
                "idéal pour profiter pleinement de tout ce que ProfCalendar vous offre "
                "avant la fin de la période d'essai&nbsp;:", days=d)
            return subject, _wrap(_gettext("Votre essai Premium continue 🎁"), "#6366F1",
                                  body, _gettext("Continuer en Premium"))

        if new_stage == 2:
            subject = _gettext("Dernier jour de votre essai Premium ⏳")
            body = hello + _P % _gettext(
                "Votre essai Premium se termine <strong>demain</strong>. Sans abonnement, "
                "vous perdrez l'accès à&nbsp;:")
            return subject, _wrap(_gettext("Votre essai se termine demain"), "#D97706",
                                  body, _gettext("Garder Premium"))

        # new_stage == 3
        subject = _gettext("Votre essai Premium est terminé : réactivez-le en 1 clic")
        body = hello + _P % _gettext(
            "Votre essai Premium est terminé. Vous gardez l'accès à la planification de "
            "vos cours, mais les fonctionnalités suivantes sont désormais verrouillées&nbsp;:")
        return subject, _wrap(_gettext("Réactivez votre accès Premium"), "#DC2626",
                              body, _gettext("Passer à Premium"))


def send_due_trial_reminders():
    """Envoie toutes les relances d'essai dues. Idempotent.

    Retourne un dict de compteurs : {'sent': {...}, 'failed': N, 'candidates': N}.
    """
    sent = {'j5': 0, 'j1': 0, 'expired': 0}
    failed = 0
    skipped = 0

    # Candidats : ont eu un premium daté ET n'ont pas encore reçu les 3 relances.
    candidates = User.query.filter(
        User.premium_until.isnot(None),
        db.or_(User.trial_reminder_stage.is_(None),
               User.trial_reminder_stage < 3),
    ).all()

    for user in candidates:
        if not user.email:
            continue

        # Adresse structurellement injoignable : on n'essaie même pas, sinon
        # ce compte redevient candidat à chaque passage, indéfiniment.
        if is_undeliverable(user.email):
            skipped += 1
            continue

        info = user.get_trial_info()
        stage = user.trial_reminder_stage or 0
        decision = None  # (new_stage, compteur_key, days)

        if info['state'] == 'trial_expired' and stage < 3:
            decision = (3, 'expired', 0)
        elif info['state'] == 'trial_active':
            days = info.get('days_remaining') or 0
            if days <= 1 and stage < 2:
                decision = (2, 'j1', days)
            elif days <= 5 and stage < 1:
                decision = (1, 'j5', days)
        # états 'paying' / 'unlimited' / 'free' : aucune relance

        if not decision:
            continue

        new_stage, key, days = decision
        # Langue du destinataire (boucle de fond : pas de requête, la langue
        # est imposée pour la construction ET l'envoi).
        with force_locale(email_locale(user.locale)):
            subject, html = _content_for_stage(new_stage, days)
            ok = send_email(user.email, subject, html)
        if ok:
            user.trial_reminder_stage = new_stage
            db.session.commit()
            sent[key] += 1
        else:
            db.session.rollback()
            failed += 1

    total = sent['j5'] + sent['j1'] + sent['expired']
    # print() en plus du logger : sur Render, seule la sortie standard remonte
    # dans les journaux (le logger.info de ce module n'y apparaissait pas).
    resume = ("[trial_reminders] candidats=%s envoyés=%s (J-5=%s, J-1=%s, exp=%s) "
              "échecs=%s ignorés=%s" % (len(candidates), total, sent['j5'], sent['j1'],
                                        sent['expired'], failed, skipped))
    logger.info(resume)
    print(resume, flush=True)
    return {'sent': sent, 'failed': failed, 'skipped': skipped,
            'candidates': len(candidates)}


# Garde de démarrage unique (par process). Empêche de lancer la boucle deux
# fois (ex. appelée à la fois depuis render_production et depuis before_request).
_loop_started = False


def start_background_loop(app):
    """Démarre la boucle de fond (greenthread eventlet) qui envoie les
    relances toutes les 6 h. Idempotent au niveau process : un seul loop.

    Robuste au point d'entrée : peut être appelée depuis render_production
    (mono-process eventlet) ET depuis un hook before_request (worker gunicorn
    eventlet). La garde `_loop_started` évite tout double démarrage.
    """
    global _loop_started
    if _loop_started:
        return
    try:
        import eventlet
    except Exception:
        logger.warning("[trial_reminders] eventlet indisponible — boucle non démarrée")
        return
    _loop_started = True

    def _loop():
        eventlet.sleep(120)  # laisser l'app démarrer
        while True:
            try:
                with app.app_context():
                    send_due_trial_reminders()
            except Exception:
                logger.exception("[trial_reminders] erreur dans la boucle de fond")
            try:
                with app.app_context():
                    from services.conversion_emails import send_due_conversion_emails
                    send_due_conversion_emails()
            except Exception as e:
                print(f"[conversion_emails] erreur dans la boucle de fond: {e}", flush=True)
            eventlet.sleep(6 * 3600)  # toutes les 6 heures

    eventlet.spawn_n(_loop)
    logger.info("[trial_reminders] boucle de fond démarrée (vérif toutes les 6 h)")
