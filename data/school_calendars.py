"""Données des calendriers scolaires cantonaux (ressources SEO gratuites).

But : attirer du trafic d'enseignants qui cherchent « vacances scolaires
<canton> <année> » — une recherche récurrente, à forte intention, et un
public parfait pour une app de planification. Chaque page est gratuite,
imprimable, cite la source officielle, et propose un lien doux vers
ProfCalendar.

⚠️ EXACTITUDE : les dates ci-dessous proviennent des sources cantonales
officielles (lien `official_url`). Vérifie-les avant chaque rentrée — les
cantons publient parfois des ajustements. Ajouter un canton = ajouter une
entrée dans CALENDARS (la route et le template sont génériques).

Format des dates : 'YYYY-MM-DD'. `end=None` pour un événement d'un seul jour
(ex. la rentrée).
"""

CALENDARS = {
    "vaud-2026-2027": {
        "canton": "Vaud",
        "canton_slug": "vaud",
        "school_year": "2026-2027",
        "official_url": "https://www.vd.ch/formation/jours-feries-et-vacances-scolaires",
        "source_label": "État de Vaud (vd.ch)",
        "updated": "2026-06",
        # Source officielle vd.ch (vérifiée 06.2026).
        "periods": [
            {"name": "Rentrée scolaire", "start": "2026-08-17", "end": None,
             "note": "Reprise des cours"},
            {"name": "Vacances d'automne", "start": "2026-10-10", "end": "2026-10-25"},
            {"name": "Vacances de Noël", "start": "2026-12-24", "end": "2027-01-10"},
            {"name": "Relâches de février", "start": "2027-02-06", "end": "2027-02-14"},
            {"name": "Vacances de Pâques", "start": "2027-03-26", "end": "2027-04-11"},
            {"name": "Vacances d'été", "start": "2027-07-03", "end": "2027-08-22",
             "note": "Fin de l'année scolaire"},
        ],
    },
}


def get_calendar(slug):
    """Retourne le calendrier pour un slug donné, ou None."""
    return CALENDARS.get(slug)


def list_calendars():
    """Liste (slug, data) triée par canton puis année, pour le hub et le sitemap."""
    return sorted(
        CALENDARS.items(),
        key=lambda kv: (kv[1]["canton"], kv[1]["school_year"]),
    )
