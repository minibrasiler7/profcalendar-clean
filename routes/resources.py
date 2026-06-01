"""Ressources gratuites publiques (SEO / acquisition).

Pages indexables par Google ciblant ce que les enseignants cherchent
réellement (ex. « vacances scolaires Vaud 2026-2027 »). Chaque page est
gratuite, imprimable, et propose un lien doux vers l'inscription
ProfCalendar. Objectif : faire venir du trafic organique qualifié.
"""

from datetime import datetime

from flask import Blueprint, render_template, abort

from data.school_calendars import get_calendar, list_calendars

resources_bp = Blueprint('resources', __name__, url_prefix='/ressources')

_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
_MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
         'août', 'septembre', 'octobre', 'novembre', 'décembre']


def _fr_date(iso):
    """'2026-08-17' → 'lundi 17 août 2026'."""
    if not iso:
        return None
    d = datetime.strptime(iso, '%Y-%m-%d')
    return f"{_JOURS[d.weekday()]} {d.day} {_MOIS[d.month]} {d.year}"


def _enrich(cal):
    """Ajoute des libellés FR aux périodes pour l'affichage."""
    enriched = dict(cal)
    periods = []
    for p in cal['periods']:
        q = dict(p)
        q['start_fr'] = _fr_date(p['start'])
        q['end_fr'] = _fr_date(p.get('end'))
        periods.append(q)
    enriched['periods'] = periods
    return enriched


@resources_bp.route('/calendrier-scolaire')
def calendar_index():
    """Hub : liste des calendriers scolaires disponibles."""
    calendars = list_calendars()
    return render_template('resources/calendar_index.html', calendars=calendars)


@resources_bp.route('/calendrier-scolaire/<slug>')
def calendar_page(slug):
    """Page calendrier d'un canton / d'une année scolaire."""
    cal = get_calendar(slug)
    if not cal:
        abort(404)
    return render_template('resources/calendar.html',
                           cal=_enrich(cal), slug=slug)


def register_resources(app):
    app.register_blueprint(resources_bp)
