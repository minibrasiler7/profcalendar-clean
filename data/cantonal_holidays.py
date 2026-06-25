"""Vacances scolaires + jours fériés par canton romand (import dans l'app).

Source unique pour l'import des vacances sur /setup/holidays : l'utilisateur
choisit son canton et son année scolaire, et l'app remplit les périodes.

Deux composantes :
  1. VACATIONS — périodes de vacances scolaires OFFICIELLES, vérifiées sur les
     sources cantonales (vd.ch, ge.ch, fr.ch, ne.ch, jura.ch, be.ch) recoupées
     avec une 2ᵉ source concordante. Dates ISO 'YYYY-MM-DD', end=None pour un
     marqueur d'un seul jour (rentrée). NE PAS inventer : n'ajouter une année
     que si elle est officiellement publiée et vérifiée.
  2. Jours fériés — calculés de façon DÉTERMINISTE (Pâques + fêtes mobiles +
     dates fixes + règles cantonales légales). Plus fiable que du scraping.

`get_import_periods(canton, school_year)` fusionne les deux : vacances + jours
fériés cantonaux isolés (ceux qui ne tombent ni dans une période de vacances ni
un week-end), avec la fin de l'été reliée à la rentrée suivante.
"""

from datetime import date, timedelta


# ─────────────────────────── moteur jours fériés ───────────────────────────
def easter(year):
    """Dimanche de Pâques (algorithme grégorien de Meeus/Jones/Butcher)."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _nth_weekday(year, month, weekday, n):
    """n-ième (1-based) `weekday` (lundi=0 … dimanche=6) du mois."""
    d = date(year, month, 1)
    shift = (weekday - d.weekday()) % 7
    return d + timedelta(days=shift + 7 * (n - 1))


def feries_for_year(year):
    """Toutes les dates possibles de jours fériés pour l'année civile."""
    E = easter(year)
    return {
        'nouvel_an': date(year, 1, 1),
        'saint_berchtold': date(year, 1, 2),
        'premier_mars': date(year, 3, 1),
        'vendredi_saint': E - timedelta(days=2),
        'lundi_paques': E + timedelta(days=1),
        'premier_mai': date(year, 5, 1),
        'ascension': E + timedelta(days=39),
        'lundi_pentecote': E + timedelta(days=50),
        'fete_dieu': E + timedelta(days=60),
        'vingt_trois_juin': date(year, 6, 23),
        # Jeûne genevois : jeudi après le 1er dimanche de septembre
        'jeune_genevois': _nth_weekday(year, 9, 6, 1) + timedelta(days=4),
        'premier_aout': date(year, 8, 1),
        'assomption': date(year, 8, 15),
        # Lundi du Jeûne fédéral : lundi après le 3e dimanche de septembre
        'jeune_federal_lundi': _nth_weekday(year, 9, 6, 3) + timedelta(days=1),
        'toussaint': date(year, 11, 1),
        'immaculee_conception': date(year, 12, 8),
        'noel': date(year, 12, 25),
        'saint_etienne': date(year, 12, 26),
        'restauration_geneve': date(year, 12, 31),
    }


FERIE_LABEL = {
    'nouvel_an': "Nouvel An",
    'saint_berchtold': "Saint-Berchtold (2 janvier)",
    'premier_mars': "1er mars (Instauration de la République)",
    'vendredi_saint': "Vendredi saint",
    'lundi_paques': "Lundi de Pâques",
    'premier_mai': "1er mai (Fête du travail)",
    'ascension': "Ascension",
    'lundi_pentecote': "Lundi de Pentecôte",
    'fete_dieu': "Fête-Dieu",
    'vingt_trois_juin': "23 juin (Indépendance jurassienne)",
    'jeune_genevois': "Jeûne genevois",
    'premier_aout': "1er août (Fête nationale)",
    'assomption': "Assomption",
    'jeune_federal_lundi': "Lundi du Jeûne fédéral",
    'toussaint': "Toussaint",
    'immaculee_conception': "Immaculée Conception",
    'noel': "Noël",
    'saint_etienne': "Saint-Étienne (26 décembre)",
    'restauration_geneve': "Restauration de la République (31 décembre)",
}

# Jours fériés LÉGAUX par canton (sources : LJF Genève RSG J 1 45, RSN 941.02
# Neuchâtel, fr.ch/LEMT Fribourg, RSJU 555.1 Jura, vd.ch, feiertagskalender BE).
# Ajout (école) : Lundi de Pâques + Lundi de Pentecôte pour Fribourg et
# Neuchâtel — pas fériés au sens strict du droit du travail (jours « chômés par
# usage »), mais l'école y est fermée partout en Romandie.
FERIE_RULES = {
    'vaud': ['nouvel_an', 'saint_berchtold', 'vendredi_saint', 'lundi_paques',
             'ascension', 'lundi_pentecote', 'premier_aout', 'jeune_federal_lundi', 'noel'],
    'geneve': ['nouvel_an', 'vendredi_saint', 'lundi_paques', 'ascension',
               'lundi_pentecote', 'jeune_genevois', 'premier_aout', 'noel', 'restauration_geneve'],
    'fribourg': ['nouvel_an', 'vendredi_saint', 'lundi_paques', 'ascension', 'fete_dieu',
                 'lundi_pentecote', 'premier_aout', 'assomption', 'toussaint',
                 'immaculee_conception', 'noel'],
    'neuchatel': ['nouvel_an', 'premier_mars', 'vendredi_saint', 'lundi_paques', 'premier_mai',
                  'ascension', 'lundi_pentecote', 'premier_aout', 'noel'],
    'jura': ['nouvel_an', 'saint_berchtold', 'vendredi_saint', 'lundi_paques', 'premier_mai',
             'ascension', 'lundi_pentecote', 'fete_dieu', 'vingt_trois_juin', 'premier_aout',
             'assomption', 'toussaint', 'noel'],
    'berne-francophone': ['nouvel_an', 'saint_berchtold', 'vendredi_saint', 'lundi_paques',
                          'ascension', 'lundi_pentecote', 'premier_aout', 'noel', 'saint_etienne'],
}


# ─────────────────────────── métadonnées cantons ───────────────────────────
CANTON_META = {
    'vaud': {'label': "Vaud", 'official_url': "https://www.vd.ch/formation/jours-feries-et-vacances-scolaires",
             'source_label': "État de Vaud (vd.ch)"},
    'geneve': {'label': "Genève", 'official_url': "https://www.ge.ch/vacances-scolaires-jours-feries",
               'source_label': "République et canton de Genève (ge.ch)"},
    'fribourg': {'label': "Fribourg (francophone)", 'official_url': "https://www.fr.ch/dfac/vacances-scolaires",
                 'source_label': "État de Fribourg (fr.ch)"},
    'neuchatel': {'label': "Neuchâtel", 'official_url': "https://www.ne.ch/themes/scolarite-et-formation/calendrier-et-vacances-scolaires",
                  'source_label': "République et canton de Neuchâtel (ne.ch)"},
    'jura': {'label': "Jura", 'official_url': "https://www.jura.ch/fr/Autorites/Administration/DFNS/SEN/Vacances-scolaires/Vacances-scolaires.html",
             'source_label': "République et Canton du Jura (jura.ch)"},
    'berne-francophone': {'label': "Berne (Jura bernois, francophone)",
                          'official_url': "https://www.akvb-gemeinden.bkd.be.ch/fr/start/organisation-finanzierung/schulorganisation/schulferienplanung.html",
                          'source_label': "Canton de Berne, partie francophone (be.ch)"},
}

# Ordre d'affichage des cantons.
CANTON_ORDER = ['vaud', 'geneve', 'fribourg', 'neuchatel', 'jura', 'berne-francophone']


# ─────────────────────── données vacances officielles ──────────────────────
# Format : canton_slug -> school_year -> [(nom, début 'YYYY-MM-DD', fin|None), ...]
# Sources vérifiées (2 sources concordantes) — voir notes des recherches.
VACATIONS = {
    'vaud': {
        '2025-2026': [
            ("Rentrée scolaire", "2025-08-18", None),
            ("Lundi du Jeûne fédéral", "2025-09-22", None),
            ("Vacances d'automne", "2025-10-11", "2025-10-26"),
            ("Vacances de Noël", "2025-12-20", "2026-01-04"),
            ("Relâches de février", "2026-02-14", "2026-02-22"),
            ("Vacances de Pâques", "2026-04-03", "2026-04-19"),
            ("Pont de l'Ascension", "2026-05-14", "2026-05-17"),
            ("Lundi de Pentecôte", "2026-05-25", None),
            ("Vacances d'été", "2026-06-27", "2026-08-16"),
        ],
        '2026-2027': [
            ("Rentrée scolaire", "2026-08-17", None),
            ("Lundi du Jeûne fédéral", "2026-09-21", None),
            ("Vacances d'automne", "2026-10-10", "2026-10-25"),
            ("Vacances de Noël", "2026-12-24", "2027-01-10"),
            ("Relâches de février", "2027-02-06", "2027-02-14"),
            ("Vacances de Pâques", "2027-03-26", "2027-04-11"),
            ("Pont de l'Ascension", "2027-05-06", "2027-05-09"),
            ("Lundi de Pentecôte", "2027-05-17", None),
            ("Vacances d'été", "2027-07-03", "2027-08-22"),
        ],
        '2027-2028': [
            ("Rentrée scolaire", "2027-08-23", None),
            ("Lundi du Jeûne fédéral", "2027-09-20", None),
            ("Vacances d'automne", "2027-10-09", "2027-10-24"),
            ("Vacances de Noël", "2027-12-24", "2028-01-09"),
            ("Relâches de février", "2028-02-12", "2028-02-20"),
            ("Vacances de Pâques", "2028-04-14", "2028-04-30"),
            ("Pont de l'Ascension", "2028-05-25", "2028-05-28"),
            ("Lundi de Pentecôte", "2028-06-05", None),
            ("Vacances d'été", "2028-07-01", "2028-08-20"),
        ],
        '2028-2029': [
            ("Rentrée scolaire", "2028-08-21", None),
            ("Lundi du Jeûne fédéral", "2028-09-18", None),
            ("Vacances d'automne", "2028-10-14", "2028-10-29"),
            ("Vacances de Noël", "2028-12-23", "2029-01-07"),
            ("Relâches de février", "2029-02-10", "2029-02-18"),
            ("Vacances de Pâques", "2029-03-30", "2029-04-15"),
            ("Pont de l'Ascension", "2029-05-10", "2029-05-13"),
            ("Lundi de Pentecôte", "2029-05-21", None),
            ("Vacances d'été", "2029-06-30", "2029-08-19"),
        ],
        '2029-2030': [
            ("Rentrée scolaire", "2029-08-20", None),
            ("Lundi du Jeûne fédéral", "2029-09-17", None),
            ("Vacances d'automne", "2029-10-13", "2029-10-28"),
            ("Vacances de Noël", "2029-12-22", "2030-01-06"),
            ("Relâches de février", "2030-02-16", "2030-02-24"),
            ("Vacances de Pâques", "2030-04-19", "2030-05-05"),
            ("Pont de l'Ascension", "2030-05-30", "2030-06-02"),
            ("Lundi de Pentecôte", "2030-06-10", None),
            ("Vacances d'été", "2030-07-06", "2030-08-25"),
        ],
        '2030-2031': [
            ("Rentrée scolaire", "2030-08-26", None),
            ("Lundi du Jeûne fédéral", "2030-09-16", None),
            ("Vacances d'automne", "2030-10-12", "2030-10-27"),
            ("Vacances de Noël", "2030-12-21", "2031-01-05"),
            ("Relâches de février", "2031-02-15", "2031-02-23"),
            ("Vacances de Pâques", "2031-04-11", "2031-04-27"),
            ("Pont de l'Ascension", "2031-05-22", "2031-05-25"),
            ("Lundi de Pentecôte", "2031-06-02", None),
            ("Vacances d'été", "2031-07-05", "2031-08-24"),
        ],
    },
    'geneve': {
        '2025-2026': [
            ("Rentrée scolaire", "2025-08-18", None),
            ("Jeûne genevois", "2025-09-11", None),
            ("Vacances d'automne", "2025-10-20", "2025-10-24"),
            ("Vacances de Noël et Nouvel An", "2025-12-22", "2026-01-02"),
            ("Vacances de février", "2026-02-23", "2026-02-27"),
            ("Vacances de Pâques", "2026-04-03", "2026-04-17"),
            ("Vacances d'été", "2026-06-29", None),
        ],
        '2026-2027': [
            ("Rentrée scolaire", "2026-08-17", None),
            ("Jeûne genevois", "2026-09-10", None),
            ("Vacances d'automne", "2026-10-19", "2026-10-23"),
            ("Vacances de Noël et Nouvel An", "2026-12-24", "2027-01-08"),
            ("Vacances de février", "2027-02-15", "2027-02-19"),
            ("Vacances de Pâques", "2027-03-26", "2027-04-09"),
            ("Vacances d'été", "2027-07-05", None),
        ],
        '2027-2028': [
            ("Rentrée scolaire", "2027-08-26", None),
            ("Pont du Jeûne genevois", "2027-09-09", "2027-09-10"),
            ("Vacances d'automne", "2027-10-25", "2027-10-29"),
            ("Vacances de Noël et Nouvel An", "2027-12-24", "2028-01-07"),
            ("Vacances de février", "2028-02-21", "2028-02-25"),
            ("Vacances de Pâques", "2028-04-13", "2028-04-21"),
            ("Vacances d'été", "2028-07-03", "2028-08-23"),
        ],
        '2028-2029': [
            ("Rentrée scolaire", "2028-08-24", None),
            ("Pont du Jeûne genevois", "2028-09-07", "2028-09-08"),
            ("Vacances d'automne", "2028-10-23", "2028-10-27"),
            ("Vacances de Noël et Nouvel An", "2028-12-25", "2029-01-05"),
            ("Vacances de février", "2029-02-19", "2029-02-23"),
            ("Vacances de Pâques", "2029-03-29", "2029-04-06"),
            ("Vacances d'été", "2029-07-02", "2029-08-22"),
        ],
        '2029-2030': [
            ("Rentrée scolaire", "2029-08-23", None),
            ("Pont du Jeûne genevois", "2029-09-06", "2029-09-07"),
            ("Vacances d'automne", "2029-10-22", "2029-10-26"),
            ("Vacances de Noël et Nouvel An", "2029-12-24", "2030-01-04"),
            ("Vacances de février", "2030-02-25", "2030-03-01"),
            ("Vacances de Pâques", "2030-04-18", "2030-04-26"),
            ("Vacances d'été", "2030-07-01", "2030-08-21"),
        ],
    },
    'fribourg': {
        '2025-2026': [
            ("Rentrée scolaire", "2025-08-28", None),
            ("Vacances d'automne", "2025-10-13", "2025-10-24"),
            ("Vacances de Noël", "2025-12-22", "2026-01-02"),
            ("Relâches de carnaval", "2026-02-16", "2026-02-20"),
            ("Vacances de Pâques", "2026-04-03", "2026-04-17"),
            ("Vacances d'été", "2026-07-13", "2026-08-26"),
        ],
        '2026-2027': [
            ("Rentrée scolaire", "2026-08-27", None),
            ("Vacances d'automne", "2026-10-12", "2026-10-23"),
            ("Vacances de Noël", "2026-12-21", "2027-01-01"),
            ("Relâches de carnaval", "2027-02-08", "2027-02-12"),
            ("Vacances de Pâques", "2027-03-26", "2027-04-09"),
            ("Vacances d'été", "2027-07-12", "2027-08-25"),
        ],
        '2027-2028': [
            ("Rentrée scolaire", "2027-08-26", None),
            ("Vacances d'automne", "2027-10-18", "2027-10-29"),
            ("Vacances de Noël", "2027-12-20", "2027-12-31"),
            ("Relâches de carnaval", "2028-02-28", "2028-03-03"),
            ("Vacances de Pâques", "2028-04-14", "2028-04-28"),
            ("Vacances d'été", "2028-07-10", "2028-08-23"),
        ],
        '2028-2029': [
            ("Rentrée scolaire", "2028-08-24", None),
            ("Vacances d'automne", "2028-10-16", "2028-10-27"),
            ("Vacances de Noël", "2028-12-25", "2029-01-05"),
            ("Relâches de carnaval", "2029-02-12", "2029-02-16"),
            ("Vacances de Pâques", "2029-03-30", "2029-04-13"),
            ("Vacances d'été", "2029-07-09", "2029-08-22"),
        ],
        '2029-2030': [
            ("Rentrée scolaire", "2029-08-23", None),
            ("Vacances d'automne", "2029-10-15", "2029-10-26"),
            ("Vacances de Noël", "2029-12-24", "2030-01-04"),
            ("Relâches de carnaval", "2030-03-04", "2030-03-08"),
            ("Vacances de Pâques", "2030-04-19", "2030-05-03"),
            ("Vacances d'été", "2030-07-08", None),
        ],
    },
    'neuchatel': {
        '2025-2026': [
            ("Rentrée scolaire", "2025-08-18", None),
            ("Vacances d'automne", "2025-10-06", "2025-10-17"),
            ("Vacances de Noël", "2025-12-22", "2026-01-02"),
            ("Vacances du 1er mars", "2026-02-23", "2026-02-27"),
            ("Vacances de printemps", "2026-04-03", "2026-04-17"),
            ("Vacances d'été", "2026-07-06", "2026-08-14"),
        ],
        '2026-2027': [
            ("Rentrée scolaire", "2026-08-17", None),
            ("Vacances d'automne", "2026-10-05", "2026-10-16"),
            ("Vacances de Noël", "2026-12-21", "2027-01-01"),
            ("Vacances du 1er mars", "2027-03-01", "2027-03-05"),
            ("Vacances de printemps", "2027-03-26", "2027-04-09"),
            ("Vacances d'été", "2027-07-05", "2027-08-13"),
        ],
        '2027-2028': [
            ("Rentrée scolaire", "2027-08-16", None),
            ("Vacances d'automne", "2027-10-04", "2027-10-15"),
            ("Vacances de Noël", "2027-12-23", "2028-01-07"),
            ("Vacances du 1er mars", "2028-02-28", "2028-03-03"),
            ("Vacances de printemps", "2028-04-10", "2028-04-21"),
            ("Vacances d'été", "2028-07-10", "2028-08-18"),
        ],
        '2028-2029': [
            ("Rentrée scolaire", "2028-08-21", None),
            ("Vacances d'automne", "2028-10-09", "2028-10-20"),
            ("Vacances de Noël", "2028-12-25", "2029-01-05"),
            ("Vacances du 1er mars", "2029-02-26", "2029-03-02"),
            ("Vacances de printemps", "2029-03-30", "2029-04-13"),
            ("Vacances d'été", "2029-07-09", "2029-08-17"),
        ],
        '2029-2030': [
            ("Rentrée scolaire", "2029-08-20", None),
            ("Vacances d'automne", "2029-10-08", "2029-10-19"),
            ("Vacances de Noël", "2029-12-24", "2030-01-04"),
            ("Vacances du 1er mars", "2030-02-25", "2030-03-01"),
            ("Vacances de printemps", "2030-04-15", "2030-04-26"),
            ("Vacances d'été", "2030-07-08", "2030-08-16"),
        ],
    },
    'jura': {
        '2025-2026': [
            ("Vacances d'automne", "2025-10-06", "2025-10-17"),
            ("Vacances de Noël", "2025-12-22", "2026-01-02"),
            ("Relâche hivernale", "2026-02-16", "2026-02-20"),
            ("Vacances de Pâques", "2026-04-03", "2026-04-17"),
            ("Vacances d'été", "2026-07-06", "2026-08-14"),
        ],
        '2026-2027': [
            ("Rentrée scolaire", "2026-08-17", None),
            ("Vacances d'automne", "2026-10-05", "2026-10-16"),
            ("Vacances de Noël", "2026-12-24", "2027-01-08"),
            ("Relâche hivernale", "2027-02-15", "2027-02-19"),
            ("Vacances de Pâques", "2027-03-26", "2027-04-09"),
            ("Vacances d'été", "2027-07-05", "2027-08-13"),
        ],
        '2027-2028': [
            ("Rentrée scolaire", "2027-08-16", None),
            ("Vacances d'automne", "2027-10-04", "2027-10-15"),
            ("Vacances de Noël", "2027-12-24", "2028-01-07"),
            ("Relâche hivernale", "2028-02-21", "2028-02-25"),
            ("Vacances de Pâques", "2028-04-14", "2028-04-28"),
            ("Vacances d'été", "2028-07-03", "2028-08-18"),
        ],
    },
    'berne-francophone': {
        '2025-2026': [
            ("Rentrée scolaire", "2025-08-18", None),
            ("Vacances d'automne", "2025-10-06", "2025-10-17"),
            ("Vacances de Noël", "2025-12-22", "2026-01-02"),
            ("Vacances de printemps", "2026-04-03", "2026-04-17"),
            ("Vacances d'été", "2026-07-03", "2026-08-14"),
        ],
        '2026-2027': [
            ("Rentrée scolaire", "2026-08-17", None),
            ("Vacances d'automne", "2026-10-05", "2026-10-16"),
            ("Vacances de Noël", "2026-12-25", "2027-01-08"),
            ("Vacances de printemps", "2027-03-26", "2027-04-09"),
            ("Vacances d'été", "2027-07-05", "2027-08-13"),
        ],
        '2027-2028': [
            ("Rentrée scolaire", "2027-08-16", None),
            ("Vacances d'automne", "2027-10-04", "2027-10-15"),
            ("Vacances de Noël", "2027-12-27", "2028-01-07"),
            ("Vacances de printemps", "2028-04-10", "2028-04-21"),
            ("Vacances d'été", "2028-07-10", "2028-08-18"),
        ],
        '2028-2029': [
            ("Rentrée scolaire", "2028-08-21", None),
            ("Vacances d'automne", "2028-10-09", "2028-10-20"),
            ("Vacances de Noël", "2028-12-25", "2029-01-05"),
            ("Vacances de printemps", "2029-03-30", "2029-04-13"),
            ("Vacances d'été", "2029-07-09", "2029-08-17"),
        ],
        '2029-2030': [
            ("Rentrée scolaire", "2029-08-20", None),
            ("Vacances d'automne", "2029-10-08", "2029-10-19"),
            ("Vacances de Noël", "2029-12-24", "2030-01-04"),
            ("Vacances de printemps", "2030-04-08", "2030-04-19"),
            ("Vacances d'été", "2030-07-08", "2030-08-16"),
        ],
        '2030-2031': [
            ("Rentrée scolaire", "2030-08-19", None),
            ("Vacances d'automne", "2030-10-07", "2030-10-18"),
            ("Vacances de Noël", "2030-12-23", "2031-01-03"),
            ("Vacances de printemps", "2031-04-07", "2031-04-18"),
            ("Vacances d'été", "2031-07-07", "2031-08-15"),
        ],
        '2031-2032': [
            ("Rentrée scolaire", "2031-08-18", None),
            ("Vacances d'automne", "2031-10-06", "2031-10-17"),
            ("Vacances de Noël", "2031-12-22", "2032-01-02"),
            ("Vacances de printemps", "2032-03-29", "2032-04-09"),
            ("Vacances d'été", "2032-07-05", "2032-08-13"),
        ],
    },
}


# ────────────────────────────── API publique ───────────────────────────────
def _d(s):
    return date.fromisoformat(s) if s else None


def available_cantons():
    """Liste ordonnée [{'slug','label'}] des cantons disponibles."""
    return [{'slug': s, 'label': CANTON_META[s]['label']}
            for s in CANTON_ORDER if s in VACATIONS]


def available_years(canton):
    """Années scolaires disponibles pour un canton, triées croissant."""
    return sorted(VACATIONS.get(canton, {}).keys())


def years_by_canton():
    """{slug: [school_year, ...]} pour alimenter le sélecteur côté client."""
    return {s: available_years(s) for s in CANTON_ORDER if s in VACATIONS}


def all_school_years():
    ys = set()
    for c in VACATIONS.values():
        ys.update(c.keys())
    return sorted(ys)


def default_school_year(start_date=None):
    """Année scolaire 'YYYY-YYYY' à présélectionner."""
    if start_date is None:
        return None
    y = start_date.year
    sy = f"{y - 1}-{y}" if start_date.month < 8 else f"{y}-{y + 1}"
    return sy


def canton_label(canton):
    return CANTON_META.get(canton, {}).get('label', canton)


def _vacation_periods(canton, school_year):
    """Périodes de vacances (nom, début:date, fin:date), rentrée exclue,
    fin d'été reliée à la rentrée de l'année suivante si dispo."""
    raw = VACATIONS.get(canton, {}).get(school_year)
    if not raw:
        return []
    y1 = int(school_year[:4])
    out = []
    for name, s, e in raw:
        if name == "Rentrée scolaire":
            continue
        sd = _d(s)
        ed = _d(e) if e else None
        if ed is None and name.startswith("Vacances d'été"):
            nxt = VACATIONS.get(canton, {}).get(f"{y1 + 1}-{y1 + 2}")
            if nxt:
                rentree = next((_d(x[1]) for x in nxt if x[0] == "Rentrée scolaire"), None)
                if rentree:
                    ed = rentree - timedelta(days=1)
            if ed is None:
                ed = date(y1 + 1, 8, 22)
        if ed is None:
            ed = sd
        out.append((name, sd, ed))
    return out


def _rentree_date(canton, school_year):
    raw = VACATIONS.get(canton, {}).get(school_year, [])
    return next((_d(x[1]) for x in raw if x[0] == "Rentrée scolaire"), None)


def get_import_periods(canton, school_year, include_feries=True):
    """Liste fusionnée [{'name','start':date,'end':date,'kind'}] prête à importer.

    Vacances scolaires + jours fériés cantonaux ISOLÉS (hors vacances, hors
    week-end), triés par date. Renvoie [] si la sélection est inconnue.
    """
    vac = _vacation_periods(canton, school_year)
    if not vac:
        return []
    result = [{'name': n, 'start': s, 'end': e, 'kind': 'vacances'} for (n, s, e) in vac]

    if include_feries:
        y1 = int(school_year[:4])
        # Fenêtre [rentrée → fin de l'été] ; repli au 1er septembre si la rentrée
        # d'une année passée n'est pas listée (exclut le 1er août d'avant-rentrée).
        window_start = _rentree_date(canton, school_year) or date(y1, 9, 1)
        summer_end = max((e for (_, _, e) in vac), default=None)
        if window_start and summer_end:
            keys = FERIE_RULES.get(canton, [])
            for yr in range(window_start.year, summer_end.year + 1):
                fy = feries_for_year(yr)
                for k in keys:
                    d = fy[k]
                    if window_start <= d <= summer_end and d.weekday() < 5:
                        if not any(s <= d <= e for (_, s, e) in vac):
                            result.append({'name': FERIE_LABEL[k], 'start': d, 'end': d, 'kind': 'ferie'})

    # dédup (date, nom) + tri
    seen = set()
    deduped = []
    for r in sorted(result, key=lambda r: (r['start'], r['name'])):
        key = (r['start'], r['name'])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped
