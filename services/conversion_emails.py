"""Relances vers l'essai gratuit et rappel de fin d'essai App Store.

Constat (novembre 2026) : la plupart des inscrits créent leur compte puis
s'arrêtent sur la page d'abonnement sans démarrer l'essai de 14 jours, et
personne ne les relançait. Trois e-mails, chacun envoyé une seule fois :

    relance_j1  ~1 jour après l'inscription, si aucun abonnement n'a jamais été pris
    relance_j5  ~5 jours après, même condition (dernière relance, plus personnelle)
    essai_apple_fin:<transaction>  2 jours avant la fin d'un essai App Store qui se
                renouvellera : date du premier débit et comment annuler (Stripe envoie
                lui-même son rappel pour les essais web)

Comptes concernés : la relance J+1 vaut pour tous les inscrits depuis le passage
au payant (CONVERSION_EMAILS_SINCE, 9 octobre 2026 : les anciens inscrits sans
abonnement l'ont reçue une fois, avec l'accord de l'utilisateur, le 5 novembre).
La relance J+5 ne vaut que pour les comptes créés depuis J5_SINCE et au moins
4 jours après la J+1. Idempotence : table email_log.
Appelé par la boucle de fond de services/trial_reminders.py (toutes les 6 h).
"""
import os
import logging
from datetime import datetime, timedelta

from flask_babel import gettext as _gettext, force_locale, format_date as _format_date, \
    get_locale as _babel_get_locale

from extensions import db
from models.user import User
from models.email_log import EmailLog
from services.email_service import send_email, email_language, email_locale
from services.trial_reminders import is_undeliverable

logger = logging.getLogger(__name__)

APP_BASE_URL = os.environ.get('APP_BASE_URL', 'https://profcalendar.org').rstrip('/')
PRICING_URL = APP_BASE_URL + '/subscription/pricing'
DEMO_URL = APP_BASE_URL + '/demo'
VIDEO_PRESENTATION = 'https://youtu.be/nclRivko3j4'
VIDEO_BIEN_DEMARRER = 'https://youtu.be/brrMJjjiFqA'

SINCE = os.environ.get('CONVERSION_EMAILS_SINCE', '2026-10-09')
J5_SINCE = os.environ.get('CONVERSION_EMAILS_J5_SINCE', '2026-11-05')
# Jour + mois en toutes lettres, selon la langue : « 18 novembre »,
# « 18 November », « 18. November », « 18 de noviembre », « 18 novembre ».
_DATE_PATTERNS = {'de': 'd. MMMM', 'es': "d 'de' MMMM"}


def _day_month(d):
    """Date « jour mois » dans la langue courante de l'e-mail."""
    try:
        loc = str(_babel_get_locale() or 'fr')
        return _format_date(d, format=_DATE_PATTERNS.get(loc.split('_')[0], 'd MMMM'))
    except Exception:
        # Hors app_context (appel direct, tests) : Babel sans Flask, en français.
        from babel.dates import format_date as _babel_format_date
        return _babel_format_date(d, format='d MMMM', locale='fr')


def _hello(name):
    return _gettext('Bonjour %(name)s,', name=name) if name else _gettext('Bonjour,')


def _frame(title, body_html, button_label=None, button_url=None):
    button = ''
    if button_label:
        button = f"""
            <div style="text-align:center; margin:1.5rem 0 0.5rem;">
                <a href="{button_url}" style="display:inline-block; background:#4F46E5; color:#fff; text-decoration:none;
                   font-weight:600; padding:0.85rem 1.75rem; border-radius:0.5rem;">{button_label}</a>
            </div>"""
    reply = _gettext('Une question ou un blocage&nbsp;? Répondez simplement à cet e-mail&nbsp;: '
                     'je vous réponds personnellement.')
    footer = _gettext('Vous recevez cet e-mail parce que vous avez créé un compte ProfCalendar. '
                      'Répondez «&nbsp;stop&nbsp;» pour ne plus en recevoir.')
    return f"""
    <div style="font-family:'Inter',Arial,sans-serif; max-width:540px; margin:0 auto; padding:2rem;">
        <div style="text-align:center; margin-bottom:1.5rem;">
            <h1 style="color:#2d3748; font-size:1.5rem; margin:0;">ProfCalendar</h1>
        </div>
        <div style="background:#ffffff; border:1px solid #E5E7EB; border-radius:12px; padding:1.75rem; color:#374151; line-height:1.55;">
            <h2 style="color:#4F46E5; font-size:1.25rem; margin:0 0 1rem;">{title}</h2>
            {body_html}
            {button}
            <p style="color:#6B7280; font-size:0.9rem; margin-top:1.5rem;">
                {reply}<br>
                Loïc, ProfCalendar
            </p>
        </div>
        <p style="color:#A0AEC0; font-size:0.72rem; text-align:center; margin-top:1.5rem;">
            {footer}
        </p>
    </div>"""


def _paragraphs(*texts):
    return ''.join(f'\n        <p>{t}</p>' for t in texts)


def _relance_j1(name, locale=None):
    with email_language(locale):
        body = _paragraphs(
            _hello(name),
            _gettext("Votre compte ProfCalendar est prêt. Il ne manque qu'une étape&nbsp;: démarrer votre "
                     "<strong>essai gratuit de 14 jours</strong>. Tout est débloqué pendant l'essai&nbsp;: "
                     "calendrier, page du cours, notes, présences, plan de classe et PDF annotés au stylet."),
            _gettext("<strong>Rien n'est débité pendant 14 jours.</strong> Vous pouvez arrêter à tout moment "
                     "avant la fin et vous ne payez rien. Sur iPad et iPhone, l'essai passe par votre compte "
                     "App Store&nbsp;; sur le site, votre carte est demandée mais rien n'est prélevé avant la fin, "
                     "et vous recevez un rappel par e-mail."),
            _gettext("Pas encore convaincu&nbsp;? Regardez la présentation en 2 minutes&nbsp;: "
                     "<a href=\"%(video_url)s\">%(video_url)s</a>, ou explorez un compte d'exemple déjà "
                     "rempli&nbsp;: <a href=\"%(demo_url)s\">%(demo_url)s</a>",
                     video_url=VIDEO_PRESENTATION, demo_url=DEMO_URL),
        )
        return _gettext('Votre essai gratuit de 14 jours vous attend'), _frame(
            _gettext('Votre essai gratuit vous attend'), body,
            _gettext('Démarrer mon essai gratuit'), PRICING_URL)


def _in_switzerland(user):
    """Compte dont on SAIT qu'il enseigne en Suisse : pays enregistré, ou, tant
    qu'il n'a pas été deviné, adresse e-mail en .ch. Dans le doute, la relance
    ne parle pas de canton."""
    region = getattr(user, 'region', None)
    if region:
        return region == 'ch'
    return (getattr(user, 'email', None) or '').strip().lower().endswith('.ch')


def _relance_j5(name, locale=None, swiss=False):
    with email_language(locale):
        if swiss:
            mise_en_route = _gettext(
                "Vous avez créé votre compte ProfCalendar il y a quelques jours. La mise en route prend "
                "environ deux minutes&nbsp;: vos classes, les heures de votre école, puis les vacances de "
                "votre canton. Cette vidéo la montre pas à pas&nbsp;: "
                "<a href=\"%(video_url)s\">%(video_url)s</a>", video_url=VIDEO_BIEN_DEMARRER)
        else:
            mise_en_route = _gettext(
                "Vous avez créé votre compte ProfCalendar il y a quelques jours. La mise en route prend "
                "environ deux minutes&nbsp;: vous créez vos classes, puis vous les placez dans votre "
                "horaire de la semaine. Cette vidéo la montre pas à pas&nbsp;: "
                "<a href=\"%(video_url)s\">%(video_url)s</a>", video_url=VIDEO_BIEN_DEMARRER)
        body = _paragraphs(
            _hello(name),
            mise_en_route,
            _gettext("Votre <strong>essai gratuit de 14 jours</strong> est toujours disponible&nbsp;: rien "
                     "n'est débité pendant l'essai, et vous pouvez arrêter à tout moment avant la fin."),
            _gettext("Si quelque chose vous a freiné (une fonction qui manque, une question sur le prix, un "
                     "souci technique), dites-le-moi en répondant à ce message&nbsp;: c'est précieux pour "
                     "améliorer l'outil."),
        )
        return _gettext('Besoin d’un coup de main pour démarrer ?'), _frame(
            _gettext('Besoin d’un coup de main&nbsp;?'), body,
            _gettext('Démarrer mon essai gratuit'), PRICING_URL)


def _fin_essai_apple(name, end, locale=None):
    with email_language(locale):
        date = _day_month(end)
        body = _paragraphs(
            _hello(name),
            _gettext('Votre essai gratuit de ProfCalendar se termine le <strong>%(date)s</strong>.', date=date),
            _gettext("Si l'outil vous convient, vous n'avez rien à faire&nbsp;: votre abonnement démarre "
                     "automatiquement par l'App Store et vous gardez toutes vos données."),
            _gettext("Si vous préférez arrêter, annulez avant cette date sur votre iPad ou votre iPhone&nbsp;: "
                     "<strong>Réglages &gt; [votre nom] &gt; Abonnements &gt; ProfCalendar &gt; Annuler "
                     "l'essai gratuit</strong>. Vous ne paierez rien."),
        )
        return (_gettext('Votre essai ProfCalendar se termine le %(date)s', date=date),
                _frame(_gettext('Votre essai se termine bientôt'), body))


def _never_subscribed(user):
    """Aucun abonnement Stripe ou App Store, jamais, et aucun accès en cours."""
    from models.subscription import Subscription
    from models.apple_subscription import AppleSubscription
    if user.lifetime_premium or user.stripe_subscription_id or user.has_premium_access():
        return False
    return (Subscription.query.filter_by(user_id=user.id).count() == 0
            and AppleSubscription.query.filter_by(user_id=user.id).count() == 0)


def _send_once(user, kind, subject, html, dry_run):
    if dry_run:
        print(f"[conversion_emails] (essai à blanc) {kind} → user {user.id}", flush=True)
        return True
    if not send_email(user.email, subject, html):
        return False
    db.session.add(EmailLog(user_id=user.id, kind=kind))
    db.session.commit()
    return True


def send_due_conversion_emails(dry_run=False, now=None):
    """Envoie les relances dues. Idempotent. Retourne les compteurs."""
    from models.apple_subscription import AppleSubscription
    now = now or datetime.utcnow()
    since = datetime.strptime(SINCE, '%Y-%m-%d')
    j5_since = datetime.strptime(J5_SINCE, '%Y-%m-%d')
    sent = {'relance_j1': 0, 'relance_j5': 0, 'essai_apple_fin': 0}
    failed = 0

    # 1) Inscrits qui n'ont pas démarré d'essai
    candidates = User.query.filter(
        User.created_at >= since,
        User.created_at <= now - timedelta(hours=20),
        User.email_verified.is_(True),
    ).all()
    for user in candidates:
        if (user.referral_code or '') == 'demo-v1' or is_undeliverable(user.email) or not _never_subscribed(user):
            continue
        done = {k: t for (k, t) in db.session.query(EmailLog.kind, EmailLog.sent_at).filter_by(user_id=user.id).all()}
        age = now - user.created_at
        name = user.username or ''
        if 'relance_j1' not in done:
            kind, build = 'relance_j1', _relance_j1
        elif ('relance_j5' not in done and user.created_at >= j5_since
              and timedelta(days=5) <= age <= timedelta(days=21)
              and now - done['relance_j1'] >= timedelta(days=4)):
            # Les vacances « de votre canton » ne se disent qu'aux comptes suisses.
            swiss = _in_switzerland(user)
            kind, build = 'relance_j5', (lambda n, swiss=swiss: _relance_j5(n, swiss=swiss))
        else:
            continue
        # Langue du destinataire : imposée pour la construction ET l'envoi
        # (boucle de fond, aucune requête en cours).
        with force_locale(email_locale(user.locale)):
            subject, html = build(name)
            ok = _send_once(user, kind, subject, html, dry_run)
        if ok:
            sent[kind] += 1
        else:
            db.session.rollback()
            failed += 1

    # 2) Essais App Store qui vont se transformer en abonnement payant d'ici ~2 jours
    trials = AppleSubscription.query.filter(
        AppleSubscription.in_intro_offer_period.is_(True),
        AppleSubscription.status == 'active',
        AppleSubscription.auto_renew_status.is_(True),
        AppleSubscription.expires_date > now,
        AppleSubscription.expires_date <= now + timedelta(hours=52),
    ).all()
    for sub in trials:
        user = User.query.get(sub.user_id)
        if not user or is_undeliverable(user.email):
            continue
        kind = f'essai_apple_fin:{sub.original_transaction_id}'
        if EmailLog.query.filter_by(user_id=user.id, kind=kind).first():
            continue
        with force_locale(email_locale(user.locale)):
            subject, html = _fin_essai_apple(user.username or '', sub.expires_date)
            ok = _send_once(user, kind, subject, html, dry_run)
        if ok:
            sent['essai_apple_fin'] += 1
        else:
            db.session.rollback()
            failed += 1

    resume = (f"[conversion_emails] {'essai à blanc ' if dry_run else ''}J+1={sent['relance_j1']} "
              f"J+5={sent['relance_j5']} fin_essai_apple={sent['essai_apple_fin']} échecs={failed}")
    print(resume, flush=True)
    return {'sent': sent, 'failed': failed}
