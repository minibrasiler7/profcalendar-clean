"""Avancement d'une classe dans un thème : exercices corrigés, notions vues.

Outil personnel (cf. utils/owner_features.py). L'état est DÉDUIT des planifications de
la classe, telles que l'enseignant les rédige déjà :

    [ ] Correction : NO107, NO108, NO109            → corrigés une fois le cours passé
    [ ] Temps pour avancer dans les exercices : …   → donnés (restent à corriger)
    [ ] Théorie : notion 3 : distance …             → notion vue une fois le cours passé

Si l'enseignant coche ses cases pendant le cours, une ligne restée décochée ne compte
pas. Une marque posée à la main (« corrigé », « à refaire », « vue ») l'emporte toujours.
"""
import json
import re
import unicodedata
from datetime import date as _date

from extensions import db
from models.course_theme import CourseTheme, CourseThemeProgress, EXERCISE_CODE_RE, exercise_code

CHECKBOX_RE = re.compile(r'^\s*\[([ xX])\]\s*')            # même règle que Planning
CORRECTION_RE = re.compile(r'corrig|correction', re.I)
NOTION_RE = re.compile(r'notions?\s*(\d{1,2})', re.I)
# « ES36 et 39 », « ES 46, 47 » : numéros qui suivent un code, sans répéter le préfixe.
CODE_LIST_RE = re.compile(r'\b([A-Z]{2})\s?(\d{1,3})((?:\s*(?:,|et|&)\s*\d{1,3}\b(?!\s*(?:min|h\b|p\b|%)))*)')


def norm(text):
    text = unicodedata.normalize('NFD', (text or '').lower())
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', text)).strip()


def theme_for_title(themes, title):
    """Thème dont le nom figure dans le titre d'un cours (« NO nombres relatifs »)."""
    key = norm(title)
    if not key:
        return None
    best = None
    for theme in themes:
        for name in (norm(theme.label), norm(theme.title)):
            if name and (key.startswith(name) or name in key or (len(key) >= 8 and name.startswith(key))):
                if best is None or len(name) > best[0]:
                    best = (len(name), theme)
    return best[1] if best else None


def codes_in(line):
    """Codes d'exercices cités dans une ligne (« NO 103 », « ES36 et 39 » → ES36, ES39)."""
    found = []
    for prefix, number, rest in CODE_LIST_RE.findall(line or ''):
        for n in [number] + re.findall(r'\d{1,3}', rest):
            code = f'{prefix}{int(n)}'
            if code not in found:
                found.append(code)
    return found


def ensure_default_themes(user):
    """Premier usage : charge les thèmes fournis (mathématiques 9e)."""
    if CourseTheme.query.filter_by(user_id=user.id).count():
        return 0
    from services.theme_import import default_themes
    n = 0
    for i, data in enumerate(default_themes()):
        theme = CourseTheme(user_id=user.id, code=data.get('code') or '', title=data.get('title') or 'Thème',
                            level=data.get('level') or '', subject=data.get('subject') or '',
                            revision=data.get('revision') or '', position=i)
        theme.set_content(data.get('objectives') or [], data.get('exercises') or [], data.get('notions') or [])
        db.session.add(theme)
        n += 1
    db.session.commit()
    return n


def themes_for_class(user, classroom):
    """Thèmes de la matière de la classe (tous, si aucun ne porte cette matière)."""
    themes = CourseTheme.query.filter_by(user_id=user.id).order_by(CourseTheme.position, CourseTheme.id).all()
    subject = norm(getattr(classroom, 'subject', ''))
    same = [t for t in themes if norm(t.subject) == subject]
    return same if same else [t for t in themes if not t.subject]


def scan_class(user, classroom, themes, today=None, now_period=None):
    """Lit les planifications de la classe. Retourne
    {'exercises': {code: {...}}, 'notions': {theme_id: {n: {...}}}, 'last_theme_id': …}"""
    from models.planning import Planning
    today = today or _date.today()
    known, specials = {}, {}
    for theme in themes:
        bases = {}
        for item in theme.all_exercises():
            known.setdefault(item['code'], theme.id)
            if not EXERCISE_CODE_RE.search(item['code']):
                # « Que sais-je ? p.142 » se reconnaît à « que sais je » dans la ligne.
                bases.setdefault(norm(re.sub(r'p\.\s*\d+.*$', '', item['code'])), []).append(item['code'])
        # Deux « Que sais-je ? » dans un même thème : impossible de savoir lequel.
        specials[theme.id] = [(base, codes[0]) for base, codes in bases.items() if base and len(codes) == 1]
    rows = db.session.query(Planning.date, Planning.period_number, Planning.title, Planning.description,
                            Planning.checklist_states) \
        .filter(Planning.user_id == user.id, Planning.classroom_id == classroom.id) \
        .order_by(Planning.date, Planning.period_number).all()

    exercises, notions = {}, {}
    current_theme, last_theme_id = None, None
    for day, period, title, description, states_raw in rows:
        theme = theme_for_title(themes, title)
        if theme is not None:
            current_theme = theme
        theme = theme or current_theme        # cours sans titre : le thème en cours continue
        past = day < today or (day == today and (now_period is None or period <= now_period))
        if theme is not None and past:
            last_theme_id = theme.id
        try:
            states = json.loads(states_raw) if states_raw else {}
        except (ValueError, TypeError):
            states = {}
        uses_ticks = any(v is True for v in states.values())
        box = -1
        for line in (description or '').split('\n'):
            is_box = bool(CHECKBOX_RE.match(line))
            if is_box:
                box += 1
            # Cours passé, cases utilisées, ligne restée décochée : pas fait.
            done_line = past and not (uses_ticks and is_box and states.get(str(box)) is not True)
            stamp = day.isoformat()
            correction = bool(CORRECTION_RE.search(line))
            labels = [c for c in codes_in(line) if c in known]
            if theme is not None and specials.get(theme.id):
                # « Que sais-je ? » existe dans chaque thème : la clé porte le thème du cours.
                low = norm(line)
                labels += [f'{theme.id}|{code}' for base, code in specials[theme.id] if base in low]
            for code in labels:
                e = exercises.setdefault(code, {'given': None, 'corrected': None, 'planned': None, 'scheduled': None})
                if correction:
                    if done_line:
                        e['corrected'] = stamp
                    elif not past and e['planned'] is None:
                        e['planned'] = stamp
                else:
                    if done_line:
                        e['given'] = e['given'] or stamp
                    elif not past and e['scheduled'] is None:
                        e['scheduled'] = stamp
            if theme is not None:
                for n in NOTION_RE.findall(line):
                    slot = notions.setdefault(theme.id, {}).setdefault(int(n), {'seen': None, 'planned': None})
                    if done_line:
                        slot['seen'] = slot['seen'] or stamp
                    elif not past and slot['planned'] is None:
                        slot['planned'] = stamp
    return {'exercises': exercises, 'notions': notions, 'last_theme_id': last_theme_id}


def get_progress(user, classroom, theme, create=False):
    row = CourseThemeProgress.query.filter_by(classroom_id=classroom.id, theme_id=theme.id).first()
    if row is None and create:
        row = CourseThemeProgress(user_id=user.id, classroom_id=classroom.id, theme_id=theme.id)
        db.session.add(row)
    return row


def theme_state(user, classroom, theme, scan):
    """État détaillé d'un thème pour une classe (exercices et notions)."""
    row = get_progress(user, classroom, theme)
    ex_marks = row.exercise_marks if row else {}
    no_marks = row.notion_marks if row else {}

    exercises = []
    for item in theme.all_exercises():
        seen = scan['exercises'].get(item['code']) or scan['exercises'].get(f"{theme.id}|{item['code']}") or {}
        mark = ex_marks.get(item['code'])
        if mark == 'done':
            status = 'done'
        elif mark == 'todo':                  # « pas corrigé » : seule la correction passée est ignorée
            status = ('planned' if seen.get('planned') else 'given' if seen.get('given')
                      else 'scheduled' if seen.get('scheduled') else 'todo')
        elif seen.get('corrected'):
            status = 'done'
        elif seen.get('planned'):
            status = 'planned'            # correction prévue dans un cours à venir
        elif seen.get('given'):
            status = 'given'              # donné, pas encore corrigé
        elif seen.get('scheduled'):
            status = 'scheduled'          # prévu dans un cours à venir
        else:
            status = 'todo'
        exercises.append({
            'code': item['code'], 'notion': item['notion'], 'status': status, 'manual': mark in ('done', 'todo'),
            'given_on': seen.get('given'), 'corrected_on': seen.get('corrected'),
            'planned_on': seen.get('planned'), 'scheduled_on': seen.get('scheduled'),
        })

    theme_notions = scan['notions'].get(theme.id, {})
    notions = []
    for notion in theme.notions:
        n = notion.get('n')
        seen = theme_notions.get(n, {})
        mark = no_marks.get(str(n))
        if mark == 'seen':
            status = 'seen'
        elif mark == 'unseen':
            status = 'todo'
        elif seen.get('seen'):
            status = 'seen'
        elif seen.get('planned'):
            status = 'planned'
        else:
            status = 'todo'
        notions.append({
            'n': n, 'title': notion.get('title') or '', 'exercises': notion.get('exercises') or [],
            'codes': [exercise_code(x) for x in (notion.get('exercises') or [])],
            'status': status, 'manual': mark in ('seen', 'unseen'),
            'seen_on': seen.get('seen'), 'planned_on': seen.get('planned'),
        })

    counts = {k: sum(1 for e in exercises if e['status'] == k) for k in ('done', 'planned', 'given', 'scheduled', 'todo')}
    counts['total'] = len(exercises)
    counts['notions_seen'] = sum(1 for n in notions if n['status'] == 'seen')
    counts['notions_total'] = len(notions)
    return {'theme': theme.to_dict(), 'exercises': exercises, 'notions': notions, 'counts': counts,
            'is_current': bool(row and row.is_current)}


def current_theme(user, classroom, themes, scan, title=None):
    """Thème à présenter : celui du titre du cours, sinon celui marqué « en cours »,
    sinon le dernier travaillé d'après les planifications, sinon le premier."""
    by_title = theme_for_title(themes, title)
    if by_title is not None:
        return by_title
    ids = {t.id: t for t in themes}
    marked = CourseThemeProgress.query.filter_by(classroom_id=classroom.id, is_current=True).first()
    if marked and marked.theme_id in ids:
        return ids[marked.theme_id]
    if scan.get('last_theme_id') in ids:
        return ids[scan['last_theme_id']]
    return themes[0] if themes else None
