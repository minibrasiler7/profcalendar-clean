"""Décaler les planifications quand un cours n'a pas pu être donné.

Outil personnel (cf. utils/owner_features.py). Le contenu prévu pour un créneau glisse
sur le créneau suivant de la même série, et ainsi de suite :

  mode « next »  le prochain cours de la classe, quel que soit le jour (mathématiques) ;
  mode « week »  le même créneau la semaine suivante (sciences : un TP reste un TP,
                 un cours reste un cours).

Le glissement s'arrête au premier créneau libre. S'il n'y en a pas jusqu'à la fin de
l'année, le dernier contenu est ajouté à celui du dernier cours : rien n'est perdu.
Ce qui appartient à la date et non au contenu reste en place (le demi-groupe prévu ce
jour-là). Les fichiers éphémères suivent leur planification, date d'expiration comprise.
"""
import unicodedata
from datetime import date as _date, timedelta

from extensions import db

MAX_CHAIN = 400
OVERFLOW_SEPARATOR = '— Reporté (plus de créneau libre avant la fin de l’année) —'


class ShiftError(Exception):
    """Décalage impossible (message destiné à l'utilisateur)."""


def _norm(text):
    text = unicodedata.normalize('NFD', (text or '').lower())
    return ''.join(c for c in text if unicodedata.category(c) != 'Mn')


def default_mode(classroom):
    """Sciences : même créneau la semaine suivante. Sinon : prochain cours de la classe."""
    return 'week' if 'science' in _norm(getattr(classroom, 'subject', '')) else 'next'


def _is_empty(planning):
    return not (planning.title or '').strip() and not (planning.description or '').strip() \
        and planning.resources.count() == 0


class _Calendar:
    """Créneaux de cours d'un enseignant : horaire type moins les vacances."""

    def __init__(self, user, blocked_dates=()):
        from models.schedule import Schedule
        from models.user import Holiday
        self.user = user
        self.blocked = set(blocked_dates)
        self.holidays = [(h.start_date, h.end_date) for h in Holiday.query.filter_by(user_id=user.id).all()]
        self.year_end = user.school_year_end or _date(_date.today().year + 1, 7, 31)
        # {classe: {jour de semaine: [périodes de début de bloc]}}
        self.by_class = {}
        rows = Schedule.query.filter_by(user_id=user.id).filter(Schedule.classroom_id.isnot(None)).all()
        for row in rows:
            if row.merged_with_previous:
                continue          # 2e période d'un bloc : la planification est sur la 1re
            self.by_class.setdefault(row.classroom_id, {}).setdefault(row.weekday, []).append(row.period_number)
        for days in self.by_class.values():
            for periods in days.values():
                periods.sort()

    def is_free_day(self, day):
        return day in self.blocked or any(a <= day <= b for a, b in self.holidays)

    def has_slot(self, classroom_id, day, period):
        return period in self.by_class.get(classroom_id, {}).get(day.weekday(), [])

    def after(self, classroom_id, day, period, mode):
        """Créneaux de la série, strictement après (day, period), jusqu'à la fin de l'année."""
        days = self.by_class.get(classroom_id, {})
        if mode == 'week':
            cur = day + timedelta(days=7)
            while cur <= self.year_end:
                if not self.is_free_day(cur) and period in days.get(cur.weekday(), []):
                    yield (cur, period)
                cur += timedelta(days=7)
            return
        cur = day
        while cur <= self.year_end:
            if not self.is_free_day(cur):
                for p in days.get(cur.weekday(), []):
                    if (cur, p) > (day, period):
                        yield (cur, p)
            cur += timedelta(days=1)


def _load(user, start):
    """Planifications de l'enseignant à partir de `start`, indexées par créneau."""
    from models.planning import Planning
    rows = Planning.query.filter(Planning.user_id == user.id, Planning.date >= start).all()
    return {(p.date, p.period_number): p for p in rows}


def _chain(cal, grid, classroom_id, origin, mode):
    """Déplacements nécessaires pour libérer `origin` : [(planification, créneau cible)],
    plus la planification à fusionner en fin d'année (ou None) et le créneau libre trouvé."""
    moving = grid.get(origin)
    if moving is None or moving.classroom_id != classroom_id or _is_empty(moving):
        return [], None, None
    moves, last_slot = [], origin
    for slot in cal.after(classroom_id, origin[0], origin[1], mode):
        occupant = grid.get(slot)
        if occupant is not None and occupant.classroom_id != classroom_id:
            continue                      # créneau pris par autre chose ce jour-là
        moves.append((moving, slot))
        last_slot = slot
        if occupant is None or _is_empty(occupant):
            return moves, None, slot      # créneau libre : le glissement s'arrête
        moving = occupant
        if len(moves) > MAX_CHAIN:
            raise ShiftError("Trop de planifications à décaler d'un coup.")
    if not moves:
        raise ShiftError("Aucun cours de cette classe après cette date : rien à décaler.")
    # Fin d'année atteinte : `moving` n'a plus de créneau, son contenu rejoint le dernier cours.
    return moves, moving, None


def plan_shift(user, origins, mode='auto', whole_day=False):
    """Calcule le décalage sans rien écrire.

    origins   [(date, période), …] : les cours non donnés
    mode      'auto' (selon la matière), 'next' ou 'week'
    whole_day toute la journée est perdue : aucun contenu n'atterrit ce jour-là

    Retourne {'moves': [...], 'merged': [...], 'skipped': [...]} où chaque déplacement
    donne l'identifiant de la planification, son créneau de départ et d'arrivée.
    """
    from models.classroom import Classroom
    if not origins:
        raise ShiftError('Aucun cours sélectionné.')
    origins = sorted(set(origins))
    blocked = {d for d, _ in origins} if whole_day else set()
    cal = _Calendar(user, blocked_dates=blocked)
    grid = _load(user, origins[0][0])
    start = {id(p): slot for slot, p in grid.items()}        # créneau d'origine de chaque ligne
    classes = {c.id: c for c in Classroom.query.filter_by(user_id=user.id).all()}
    final, merged, skipped, empties = {}, [], [], set()

    # Du dernier au premier : deux cours perdus de la même classe gardent leur ordre.
    for origin in reversed(origins):
        planning = grid.get(origin)
        if planning is None or planning.classroom_id is None or _is_empty(planning):
            skipped.append({'date': origin[0].isoformat(), 'period': origin[1], 'reason': 'vide'})
            continue
        classroom = classes.get(planning.classroom_id)
        if classroom is None:
            skipped.append({'date': origin[0].isoformat(), 'period': origin[1], 'reason': 'classe'})
            continue
        chosen = default_mode(classroom) if mode == 'auto' else mode
        if not cal.has_slot(classroom.id, origin[0], origin[1]) and chosen == 'week':
            chosen = 'next'               # créneau hors horaire type : pas de « même créneau »
        moves, overflow, free = _chain(cal, grid, classroom.id, origin, chosen)
        if not moves:
            continue
        if free is not None and grid.get(free) is not None:
            empties.add(grid[free].id)    # ligne vide à supprimer avant d'y poser le contenu
        # Simulation : on applique à la grille pour que le cours suivant en tienne compte.
        for planning_obj, _slot in moves:
            grid.pop(next(s for s, p in grid.items() if p is planning_obj), None)
        if overflow is not None:
            grid.pop(next((s for s, p in grid.items() if p is overflow), None), None)
            merged.append({'planning': overflow, 'into': moves[-1][0], 'mode': chosen})
        for planning_obj, slot in moves:
            grid[slot] = planning_obj
            final[planning_obj.id] = (planning_obj, slot, chosen)

    def describe(planning_obj, slot, chosen):
        src = start[id(planning_obj)]
        classroom = classes.get(planning_obj.classroom_id)
        return {
            'planning_id': planning_obj.id,
            'title': (planning_obj.title or '').strip(),
            'classroom': f'{classroom.name} · {classroom.subject}' if classroom else '',
            'classroom_id': planning_obj.classroom_id,
            'from': {'date': src[0].isoformat(), 'period': src[1]},
            'to': {'date': slot[0].isoformat(), 'period': slot[1]},
            'mode': chosen,
        }

    merged_ids = {m['planning'].id for m in merged}
    moves_out = sorted((describe(*v) for k, v in final.items() if k not in merged_ids),
                       key=lambda m: (m['classroom'], m['from']['date'], m['from']['period']))
    merged_out = [{
        'planning_id': m['planning'].id,
        'title': (m['planning'].title or '').strip(),
        'into_planning_id': m['into'].id,
        'classroom_id': m['planning'].classroom_id,
        'from': {'date': start[id(m['planning'])][0].isoformat(), 'period': start[id(m['planning'])][1]},
    } for m in merged]
    return {'moves': moves_out, 'merged': merged_out, 'skipped': skipped, 'empties': sorted(empties)}


def apply_shift(user, plan):
    """Écrit un décalage calculé par plan_shift. Tout ou rien."""
    from models.planning import Planning, PlanningResource, EphemeralFile
    moves, merged = plan.get('moves') or [], plan.get('merged') or []
    if not moves:
        raise ShiftError('Rien à décaler.')
    ids = [m['planning_id'] for m in moves] + [m['planning_id'] for m in merged] + list(plan.get('empties') or [])
    rows = {p.id: p for p in Planning.query.filter(Planning.user_id == user.id, Planning.id.in_(ids)).all()}
    if len(rows) != len(set(ids)):
        raise ShiftError('Les planifications ont changé entre-temps. Recommencez.')
    for m in moves:                       # rien n'a bougé depuis l'aperçu ?
        p = rows[m['planning_id']]
        if p.date.isoformat() != m['from']['date'] or p.period_number != m['from']['period']:
            raise ShiftError('Les planifications ont changé entre-temps. Recommencez.')
    try:
        # Le demi-groupe appartient à la date : on le relève avant de bouger quoi que ce soit.
        group_at = {(p.date, p.period_number): p.group_id for p in rows.values()}

        # 1. Fin d'année : le contenu sans créneau rejoint le dernier cours.
        for m in merged:
            src, dst = rows[m['planning_id']], rows[m['into_planning_id']]
            extra = '\n'.join(x for x in [(src.title or '').strip(), (src.description or '').strip()] if x)
            if extra:
                dst.description = ((dst.description or '').rstrip() + f'\n\n{OVERFLOW_SEPARATOR}\n' + extra).strip()
            offset = dst.resources.count()
            for i, res in enumerate(src.resources.order_by(PlanningResource.position).all()):
                res.planning_id, res.position = dst.id, offset + i
            db.session.query(EphemeralFile).filter(EphemeralFile.planning_id == src.id) \
                .update({EphemeralFile.planning_id: dst.id}, synchronize_session=False)
            db.session.flush()
            db.session.delete(src)
        # 2. Lignes vides des créneaux d'arrivée.
        for pid in plan.get('empties') or []:
            db.session.delete(rows[pid])
        db.session.flush()

        # 3. Deux temps, pour ne jamais heurter l'unicité (enseignant, date, période) :
        #    tout sort d'abord sur des périodes provisoires, puis prend sa place.
        for i, m in enumerate(moves):
            rows[m['planning_id']].period_number = 10000 + i
        db.session.flush()
        for m in moves:
            p = rows[m['planning_id']]
            new_date = _date.fromisoformat(m['to']['date'])
            target = (new_date, int(m['to']['period']))
            p.date, p.period_number = target
            p.group_id = group_at.get(target)
            db.session.query(EphemeralFile).filter(EphemeralFile.planning_id == p.id) \
                .update({EphemeralFile.expires_on: new_date + timedelta(days=1)}, synchronize_session=False)
        db.session.commit()
    except ShiftError:
        db.session.rollback()
        raise
    except Exception:
        db.session.rollback()
        raise
    return {'moved': len(moves), 'merged': len(merged)}
