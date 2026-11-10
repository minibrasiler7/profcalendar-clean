"""Pays d'enseignement d'un compte : Suisse ('ch') ou autre pays ('intl').

ProfCalendar est né en Suisse romande : import des vacances par canton, jours
fériés vaudois, heure de Zurich. Un compte créé ailleurs n'a que faire de tout
cela ; on le lui masque (``User.is_swiss``, ``is_swiss`` dans les gabarits)
pour que l'application reste la plus simple possible.

Le pays est DEVINÉ, sans géolocalisation de l'adresse IP par un service tiers :
fuseau horaire de l'appareil, langues du navigateur, domaine de l'adresse
e-mail et, s'il existe, l'en-tête de pays posé par l'hébergeur. Un seul indice
suisse suffit : un frontalier qui s'inscrit depuis la France avec son adresse
professionnelle en .ch reste « Suisse ». Le choix se corrige dans
Paramètres → Année et horaires, ou depuis la page des vacances.
"""
import re

SWISS = 'ch'
INTL = 'intl'

_TZ_RE = re.compile(r'^[A-Za-z0-9_+\-]+(/[A-Za-z0-9_+\-]+){0,2}$')


def clean_tz(tz_name):
    """Nom de fuseau IANA reconnu (« Europe/Paris »), sinon None."""
    tz_name = (tz_name or '').strip()
    if not tz_name or len(tz_name) > 64 or not _TZ_RE.match(tz_name):
        return None
    # Deux annuaires de fuseaux : celui de Python, puis pytz. Il suffit que
    # l'un des deux connaisse le nom.
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(tz_name)
        return tz_name
    except Exception:
        pass
    try:
        import pytz
        pytz.timezone(tz_name)
        return tz_name
    except Exception:
        return None


def _language_tags(languages):
    """« fr-CH,fr;q=0.9, en » → ['fr-ch', 'fr', 'en']"""
    tags = []
    for part in (languages or '').split(','):
        tag = part.split(';')[0].strip().lower().replace('_', '-')
        if tag:
            tags.append(tag)
    return tags


def guess_region(tz_name=None, languages=None, email=None, country=None):
    """'ch' dès qu'un indice désigne la Suisse ; 'intl' si l'on connaît le
    fuseau (ou le pays) et que rien ne désigne la Suisse ; None sans indice
    exploitable (le compte garde alors l'affichage complet)."""
    tz = clean_tz(tz_name)
    country = (country or '').strip().upper()
    if not re.match(r'^[A-Z]{2}$', country) or country in ('XX', 'T1'):
        country = ''
    domain = (email or '').rsplit('@', 1)[-1].strip().lower() if email and '@' in email else ''

    if (tz == 'Europe/Zurich' or country == 'CH' or domain.endswith('.ch')
            or any(tag.endswith('-ch') for tag in _language_tags(languages))):
        return SWISS
    if tz or country:
        return INTL
    return None


def apply_detected_region(user, tz_name=None, languages=None, country=None, overwrite=False):
    """Pose ``region`` et ``tz_name`` sur le compte d'après les indices reçus.
    Ne remplace jamais un pays déjà connu (sauf ``overwrite``). NE COMMITTE PAS.
    Retourne le pays retenu (ou None)."""
    tz = clean_tz(tz_name)
    if tz and (overwrite or not user.tz_name):
        user.tz_name = tz
    if user.region and not overwrite:
        return user.region
    region = guess_region(tz_name=tz, languages=languages, email=user.email, country=country)
    if region:
        user.region = region
    return region


def request_signals():
    """Indices disponibles dans la requête en cours (formulaire ou JSON)."""
    from flask import request
    data = request.get_json(silent=True) if request.is_json else None
    src = data if isinstance(data, dict) else request.form
    langs = ','.join(x for x in (str(src.get('browser_langs') or ''),
                                 request.headers.get('Accept-Language', '')) if x)
    return {
        'tz_name': str(src.get('tz_name') or ''),
        'languages': langs,
        # Posé par l'hébergeur quand il le fournit ; absent, on s'en passe.
        'country': request.headers.get('CF-IPCountry', ''),
    }


def set_region(user, region, tz_name=None):
    """Choix explicite de l'enseignant (Paramètres). NE COMMITTE PAS."""
    if region not in (SWISS, INTL):
        return False
    user.region = region
    tz = clean_tz(tz_name)
    if tz:
        user.tz_name = tz
    return True


def region_context():
    """Variables de gabarit : ``is_swiss`` (affichage complet, import par
    canton) et ``region_unknown`` (compte d'avant : pays à deviner une fois)."""
    try:
        from flask_login import current_user
        from models.user import User
        if current_user.is_authenticated and isinstance(current_user, User):
            return {'is_swiss': current_user.is_swiss,
                    'region_unknown': current_user.region is None}
    except Exception:
        pass
    return {'is_swiss': True, 'region_unknown': False}
