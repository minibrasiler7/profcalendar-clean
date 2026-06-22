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
    "geneve-2026-2027": {
        "canton": "Genève",
        "canton_slug": "geneve",
        "school_year": "2026-2027",
        "official_url": "https://www.ge.ch/vacances-scolaires-jours-feries/vacances-scolaires-2026-2027",
        "source_label": "République et canton de Genève (ge.ch)",
        "updated": "2026-06",
        # Source officielle ge.ch (vérifiée 06.2026, concordante avec 2 sources).
        "periods": [
            {"name": "Rentrée scolaire", "start": "2026-08-17", "end": None,
             "note": "Reprise des cours"},
            {"name": "Vacances d'automne", "start": "2026-10-19", "end": "2026-10-23"},
            {"name": "Vacances de Noël et Nouvel An", "start": "2026-12-24", "end": "2027-01-08"},
            {"name": "Vacances de février", "start": "2027-02-15", "end": "2027-02-19"},
            {"name": "Vacances de Pâques", "start": "2027-03-26", "end": "2027-04-09"},
            {"name": "Vacances d'été", "start": "2027-07-05", "end": None,
             "note": "Fin de l'année scolaire (dès le 5 juillet 2027)"},
        ],
    },
    "fribourg-2026-2027": {
        "canton": "Fribourg",
        "canton_slug": "fribourg",
        "school_year": "2026-2027",
        "official_url": "https://www.fr.ch/dfac/vacances-scolaires",
        "source_label": "État de Fribourg (fr.ch)",
        "updated": "2026-06",
        # Calendrier francophone (majoritaire). Vérifié 06.2026 sur 2 sources
        # concordantes (fr.ch + calendriergratuit.ch). La région de Morat/Kerzers
        # (germanophone) a un calendrier distinct.
        "periods": [
            {"name": "Rentrée scolaire", "start": "2026-08-27", "end": None,
             "note": "Reprise des cours (calendrier francophone)"},
            {"name": "Vacances d'automne", "start": "2026-10-12", "end": "2026-10-23"},
            {"name": "Vacances de Noël", "start": "2026-12-21", "end": "2027-01-01"},
            {"name": "Relâches de carnaval", "start": "2027-02-08", "end": "2027-02-12"},
            {"name": "Vacances de Pâques", "start": "2027-03-26", "end": "2027-04-09"},
            {"name": "Vacances d'été", "start": "2027-07-10", "end": "2027-08-15",
             "note": "Dernier jour de classe : vendredi 9 juillet 2027"},
        ],
    },
    "neuchatel-2026-2027": {
        "canton": "Neuchâtel",
        "canton_slug": "neuchatel",
        "school_year": "2026-2027",
        "official_url": "https://www.ne.ch/themes/scolarite-et-formation/calendrier-et-vacances-scolaires",
        "source_label": "République et canton de Neuchâtel (ne.ch)",
        "updated": "2026-06",
        # Vérifié 06.2026 sur 2 sources concordantes (ne.ch + calendriergratuit.ch).
        "periods": [
            {"name": "Rentrée scolaire", "start": "2026-08-17", "end": None,
             "note": "Reprise des cours"},
            {"name": "Vacances d'automne", "start": "2026-10-05", "end": "2026-10-16"},
            {"name": "Vacances de Noël", "start": "2026-12-21", "end": "2027-01-01"},
            {"name": "Relâches d'hiver", "start": "2027-03-01", "end": "2027-03-05"},
            {"name": "Vacances de printemps", "start": "2027-03-26", "end": "2027-04-09"},
            {"name": "Vacances d'été", "start": "2027-07-05", "end": "2027-08-13",
             "note": "Fin de l'année scolaire"},
        ],
    },
    "jura-2026-2027": {
        "canton": "Jura",
        "canton_slug": "jura",
        "school_year": "2026-2027",
        "official_url": "https://www.jura.ch/fr/Autorites/Administration/DFNS/SEN/Vacances-scolaires/Vacances-scolaires.html",
        "source_label": "République et Canton du Jura (jura.ch)",
        "updated": "2026-06",
        # Source : arrêté du Gouvernement jurassien fixant les vacances 2025-2028
        # (adopté le 10.03.2026), jura.ch — dates officielles 2026-2027.
        "periods": [
            {"name": "Rentrée scolaire", "start": "2026-08-17", "end": None,
             "note": "Reprise des cours"},
            {"name": "Vacances d'automne", "start": "2026-10-05", "end": "2026-10-16"},
            {"name": "Vacances de Noël", "start": "2026-12-24", "end": "2027-01-08"},
            {"name": "Relâche hivernale", "start": "2027-02-15", "end": "2027-02-19"},
            {"name": "Vacances de Pâques", "start": "2027-03-26", "end": "2027-04-09"},
            {"name": "Vacances d'été", "start": "2027-07-05", "end": "2027-08-13",
             "note": "Fin de l'année scolaire"},
        ],
    },
    "berne-francophone-2026-2027": {
        "canton": "Berne (partie francophone)",
        "canton_slug": "berne-francophone",
        "school_year": "2026-2027",
        "official_url": "https://www.akvb-gemeinden.bkd.be.ch/fr/start/organisation-finanzierung/schulorganisation/schulferienplanung.html",
        "source_label": "Canton de Berne, partie francophone (be.ch)",
        "updated": "2026-06",
        # Source : Direction de l'instruction publique du canton de Berne,
        # planification francophone 2025/26-2030/31 (be.ch). La « semaine blanche »
        # (relâche de février) est fixée librement par chaque école → non listée.
        "periods": [
            {"name": "Rentrée scolaire", "start": "2026-08-17", "end": None,
             "note": "Reprise des cours"},
            {"name": "Vacances d'automne", "start": "2026-10-05", "end": "2026-10-16"},
            {"name": "Vacances de Noël", "start": "2026-12-25", "end": "2027-01-08"},
            {"name": "Vacances de printemps", "start": "2027-03-26", "end": "2027-04-09"},
            {"name": "Vacances d'été", "start": "2027-07-05", "end": "2027-08-13",
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
