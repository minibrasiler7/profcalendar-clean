"""Ressources gratuites publiques (SEO / acquisition).

Pages indexables par Google ciblant ce que les enseignants cherchent
réellement (ex. « vacances scolaires Vaud 2026-2027 »). Chaque page est
gratuite, imprimable, et propose un lien doux vers l'inscription
ProfCalendar. Objectif : faire venir du trafic organique qualifié.
"""

from datetime import datetime

from flask import Blueprint, render_template, abort

from data.cantonal_holidays import (
    seo_calendar, seo_list, available_years, VACATIONS, CANTON_META, CANTON_ORDER,
)

resources_bp = Blueprint('resources', __name__, url_prefix='/ressources')

_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
_MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
         'août', 'septembre', 'octobre', 'novembre', 'décembre']


def _fr_date(iso):
    """'2026-08-17' → 'lundi 17 août 2026' (et '1er' pour le 1er du mois)."""
    if not iso:
        return None
    d = datetime.strptime(iso, '%Y-%m-%d')
    jour = '1er' if d.day == 1 else str(d.day)
    return f"{_JOURS[d.weekday()]} {jour} {_MOIS[d.month]} {d.year}"


def _enrich(cal):
    """Ajoute des libellés FR aux périodes et jours fériés pour l'affichage."""
    enriched = dict(cal)
    enriched['periods'] = [dict(p, start_fr=_fr_date(p['start']),
                                end_fr=_fr_date(p.get('end'))) for p in cal['periods']]
    enriched['feries'] = [dict(f, date_fr=_fr_date(f['date']))
                          for f in cal.get('feries', [])]
    return enriched


def _build_faq(cal):
    """Quelques Q/R basées sur les dates, pour la section FAQ + le JSON-LD."""
    canton, sy = cal['canton'], cal['school_year']
    def pget(prefix):
        return next((p for p in cal['periods'] if p['name'].startswith(prefix)), None)
    faq = []
    r = pget('Rentrée')
    if r:
        faq.append((f"Quand a lieu la rentrée scolaire {sy} dans le canton de {canton} ?",
                    f"La rentrée scolaire {canton} {sy} a lieu le {r['start_fr']}."))
    e = pget("Vacances d'été")
    if e and e['end_fr']:
        faq.append((f"Quand sont les vacances d'été {canton} {sy} ?",
                    f"Les vacances d'été {sy} dans le canton de {canton} vont du {e['start_fr']} au {e['end_fr']}."))
    elif e:
        faq.append((f"Quand commencent les vacances d'été {canton} {sy} ?",
                    f"Les vacances d'été {sy} dans le canton de {canton} commencent le {e['start_fr']}."))
    a = pget("Vacances d'automne")
    if a:
        faq.append((f"Quand sont les vacances d'automne {canton} {sy} ?",
                    f"Du {a['start_fr']} au {a['end_fr']}."))
    n = pget("Vacances de Noël")
    if n:
        faq.append((f"Quand sont les vacances de Noël {canton} {sy} ?",
                    f"Du {n['start_fr']} au {n['end_fr']}."))
    return faq


@resources_bp.route('/calendrier-scolaire', strict_slashes=False)
def calendar_index():
    """Hub : tous les calendriers, regroupés par canton."""
    by_canton = {}
    for slug, brief in seo_list():
        by_canton.setdefault(brief['canton_slug'],
                             {'label': brief['canton'], 'years': []})
        by_canton[brief['canton_slug']]['years'].append(
            {'slug': slug, 'year': brief['school_year']})
    groups = [by_canton[c] for c in CANTON_ORDER if c in by_canton]
    total = sum(len(g['years']) for g in groups)
    return render_template('resources/calendar_index.html',
                           groups=groups, total=total)


@resources_bp.route('/calendrier-scolaire/<slug>', strict_slashes=False)
def calendar_page(slug):
    """Page calendrier d'un canton / d'une année scolaire."""
    cal = seo_calendar(slug)
    if not cal:
        abort(404)
    cal = _enrich(cal)
    canton, sy = cal['canton_slug'], cal['school_year']
    other_years = [{'slug': canton + '-' + y, 'year': y}
                   for y in available_years(canton) if y != sy]
    other_cantons = [{'slug': c + '-' + sy, 'label': CANTON_META[c]['label']}
                     for c in CANTON_ORDER
                     if c in VACATIONS and sy in VACATIONS[c] and c != canton]
    return render_template('resources/calendar.html', cal=cal, slug=slug,
                           faq=_build_faq(cal),
                           other_years=other_years, other_cantons=other_cantons)


@resources_bp.route('/bareme', strict_slashes=False)
def bareme():
    """Outil gratuit de création de barème pour tests (100% côté client)."""
    return render_template('resources/bareme.html')


@resources_bp.route('/exercices-maths', strict_slashes=False)
def exercices_maths():
    """Générateur gratuit d'exercices de maths Cycle 3 (9H-11H) avec correction."""
    return render_template('resources/exercices_maths.html')


@resources_bp.route('/calculateur-moyenne', strict_slashes=False)
def calculateur_moyenne():
    """Outil SEO gratuit : calculateur de moyenne pondérée (+ note nécessaire)."""
    return render_template('resources/calculateur_moyenne.html')


def register_resources(app):
    app.register_blueprint(resources_bp)
