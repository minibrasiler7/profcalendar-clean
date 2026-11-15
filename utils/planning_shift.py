"""Décaler les planifications d'une classe vers le cours suivant, et reporter
des tâches non faites sur le cours suivant.

Vocabulaire
-----------
* créneau : un couple (date, numéro de période) où la classe a cours. Une
  période fusionnée avec la précédente n'est pas un créneau : le cours est
  porté par la première période du bloc.
* série : les planifications d'une même classe (ou d'un même groupe mixte) et
  d'un même groupe d'élèves. Une classe entière et ses demi-groupes forment
  donc des séries distinctes : décaler la théorie ne touche pas les TP.

Les créneaux d'une classe entière viennent de l'horaire type (hors vacances).
Ceux d'un demi-groupe viennent des planifications déjà posées pour ce groupe
(la rotation des groupes n'est écrite nulle part ailleurs).
"""
import re
from datetime import timedelta

from extensions import db
from models.planning import Planning, EphemeralFile
from models.schedule import Schedule

CHECKBOX_RE = re.compile(r'^(\s*)\[([ xX])\]\s*(.*)$')


class ShiftError(Exception):
    """Décalage ou report impossible (message destiné à l'enseignant)."""


# ----------------------------------------------------------------- créneaux

def _own_holidays(user):
    try:
        return [(h.start_date, h.end_date) for h in user.holidays.all()]
    except Exception:
        return []


def _is_school_day(d, user, own):
    from utils.vaud_holidays import is_holiday
    return not is_holiday(d, user) and not any(a <= d <= b for a, b in own)


def _horizon(user, start):
    end = getattr(user, 'school_year_end', None)
    if not end or end < start:
        end = start + timedelta(days=400)
    return end


def _series_filter(planning):
    """Critères SQLAlchemy qui désignent la série de `planning`."""
    return dict(
        user_id=planning.user_id,
        classroom_id=planning.classroom_id,
        mixed_group_id=planning.mixed_group_id,
        group_id=planning.group_id,
    )


def _same_series(a, b):
    return (a.classroom_id == b.classroom_id and a.mixed_group_id == b.mixed_group_id
            and a.group_id == b.group_id)


def is_empty(planning):
    """Une planification sans titre, sans texte et sans ressource : un simple
    marqueur (par exemple « ce lundi, c'est le groupe 2 »)."""
    if (planning.title or '').strip() or (planning.description or '').strip():
        return False
    return planning.resources.count() == 0


def _schedule_periods(user, planning):
    """{jour de semaine: [périodes]} où la classe (ou le groupe mixte) a cours."""
    q = Schedule.query.filter_by(user_id=user.id)
    if planning.classroom_id:
        q = q.filter_by(classroom_id=planning.classroom_id)
    else:
        q = q.filter_by(mixed_group_id=planning.mixed_group_id)
    by_weekday = {}
    for s in q.all():
        if s.merged_with_previous:
            continue
        by_weekday.setdefault(s.weekday, set()).add(s.period_number)
    return {wd: sorted(ps) for wd, ps in by_weekday.items()}


def series_slots(user, planning):
    """Créneaux de la série, dans l'ordre, à partir de celui de `planning`
    (inclus). Renvoie [(date, période, planification ou None)].

    Un créneau occupé par une planification d'une autre série (autre classe,
    autre groupe, tâche personnelle) est ignoré : on ne l'écrase jamais.
    """
    start = planning.date
    end = _horizon(user, start)
    own = _own_holidays(user)
    origin = (planning.date, planning.period_number)

    occupied = {
        (p.date, p.period_number): p
        for p in Planning.query.filter(
            Planning.user_id == user.id, Planning.date >= start, Planning.date <= end
        ).all()
    }

    if planning.group_id:
        # Demi-groupe : les créneaux sont ceux déjà attribués à ce groupe…
        mine = sorted(
            (k for k, p in occupied.items() if _same_series(p, planning) and k >= origin)
        )
        slots = [(d, n, occupied[(d, n)]) for d, n in mine]
        # … puis, au-delà, les créneaux libres du même jour et de la même période.
        last_d, last_n = mine[-1] if mine else origin
        d = last_d + timedelta(days=7)
        periods = _schedule_periods(user, planning).get(last_d.weekday(), [])
        while d <= end and last_n in periods:
            if _is_school_day(d, user, own) and (d, last_n) not in occupied:
                slots.append((d, last_n, None))
            d += timedelta(days=7)
        return slots

    by_weekday = _schedule_periods(user, planning)
    # Périodes réservées aux demi-groupes de cette classe (par exemple le TP du
    # lundi matin) : la classe entière n'y a jamais cours, même les semaines où
    # aucun groupe n'y est encore inscrit.
    group_periods = {
        (p.date.weekday(), p.period_number)
        for p in Planning.query.filter(
            Planning.user_id == user.id,
            Planning.classroom_id == planning.classroom_id,
            Planning.mixed_group_id == planning.mixed_group_id,
            Planning.group_id.isnot(None),
        ).all()
    }
    slots = [(planning.date, planning.period_number, planning)]
    d = start
    while d <= end:
        if d.weekday() in by_weekday and _is_school_day(d, user, own):
            for n in by_weekday[d.weekday()]:
                if (d, n) <= origin:
                    continue
                p = occupied.get((d, n))
                if p is not None and not _same_series(p, planning):
                    continue
                if p is None and (d.weekday(), n) in group_periods:
                    continue
                slots.append((d, n, p))
        d += timedelta(days=1)
    return slots


# ------------------------------------------------------------------ décaler

def plan_shift(user, planning):
    """Calcule le décalage sans rien modifier.

    Toutes les planifications de la série avancent d'un cours, jusqu'au
    premier créneau vide, qui absorbe le décalage. Renvoie (moves, absorber) :
    moves = [(planification, nouvelle_date, nouvelle_période)] dans l'ordre
    chronologique ; absorber = la planification vide trouvée sur le créneau
    d'arrivée, ou None.
    """
    if not planning.classroom_id and not planning.mixed_group_id:
        raise ShiftError("Seul un cours lié à une classe peut être décalé.")
    if is_empty(planning):
        raise ShiftError("Cette planification est vide : il n'y a rien à décaler.")
    slots = series_slots(user, planning)
    moves = []
    for i, (d, n, p) in enumerate(slots):
        if i > 0 and (p is None or is_empty(p)):
            return moves, p
        if p is None:
            raise ShiftError("Planification introuvable sur ce créneau.")
        if i + 1 >= len(slots):
            break
        nd, nn, _ = slots[i + 1]
        moves.append((p, nd, nn))
    raise ShiftError(
        "Il n'y a plus assez de cours avant la fin de l'année scolaire pour tout décaler."
    )


def _move(planning, new_date, new_period):
    planning.date = new_date
    planning.period_number = new_period
    # Les fichiers éphémères suivent le cours : ils expirent le lendemain.
    EphemeralFile.query.filter_by(planning_id=planning.id).update(
        {'expires_on': new_date + timedelta(days=1)}, synchronize_session=False
    )


def apply_shift(user, planning):
    """Décale la série d'un cours. Renvoie la liste des déplacements effectués
    [(titre, ancienne_date, ancienne_période, nouvelle_date, nouvelle_période)].

    La contrainte d'unicité (enseignant, date, période) impose l'ordre : on
    libère d'abord le créneau d'arrivée, puis on déplace du dernier au premier.
    """
    origin_date, origin_period = planning.date, planning.period_number
    moves, absorber = plan_shift(user, planning)
    if not moves:
        raise ShiftError("Rien à décaler.")

    if absorber is not None:
        # Mise à l'écart provisoire de la planification vide du créneau d'arrivée.
        absorber.period_number = 100000 + absorber.id
        db.session.flush()

    done = []
    for p, nd, nn in reversed(moves):
        done.append((p.title or '', p.date, p.period_number, nd, nn))
        _move(p, nd, nn)
        db.session.flush()

    if absorber is not None:
        # Elle prend la place libérée : le créneau de départ reste attribué à
        # la même classe et au même groupe.
        absorber.date, absorber.period_number = origin_date, origin_period
        db.session.flush()
    elif planning.group_id:
        # Sans marqueur, on perdrait l'information « ce jour-là, c'est ce groupe ».
        db.session.add(Planning(
            user_id=user.id, classroom_id=planning.classroom_id,
            mixed_group_id=planning.mixed_group_id, group_id=planning.group_id,
            date=origin_date, period_number=origin_period, title='', description='',
        ))
    db.session.commit()
    done.reverse()
    return done


# ----------------------------------------------------- reporter des tâches

def _split_tasks(description):
    """[(ligne, index de case ou None)] pour chaque ligne de la description."""
    out, idx = [], 0
    for line in (description or '').split('\n'):
        if CHECKBOX_RE.match(line):
            out.append((line, idx))
            idx += 1
        else:
            out.append((line, None))
    return out


def postpone_tasks(user, planning, indices=None):
    """Retire des tâches de `planning` et les place en tête du cours suivant
    de la même série. `indices` = numéros des cases à reporter ; None = toutes
    les cases non cochées. Renvoie (nombre de tâches, date cible, période cible).
    """
    if not planning.classroom_id and not planning.mixed_group_id:
        raise ShiftError("Seul un cours lié à une classe permet de reporter des tâches.")
    states = planning.get_checklist_states()
    lines = _split_tasks(planning.description)
    all_idx = [i for _, i in lines if i is not None]
    if indices is None:
        wanted = {i for i in all_idx if not states.get(str(i), False)}
    else:
        wanted = {int(i) for i in indices} & set(all_idx)
    if not wanted:
        raise ShiftError("Aucune tâche à reporter.")

    slots = series_slots(user, planning)
    if len(slots) < 2:
        raise ShiftError("Aucun cours suivant n'a été trouvé pour cette classe.")
    target_date, target_period, target = slots[1]

    moved, kept, new_states = [], [], {}
    for line, i in lines:
        if i is not None and i in wanted:
            m = CHECKBOX_RE.match(line)
            moved.append('%s[ ] %s' % (m.group(1), m.group(3)))
            continue
        if i is not None:
            if states.get(str(i), False):
                new_states[str(sum(1 for _, j in kept if j is not None))] = True
        kept.append((line, i))
    planning.description = '\n'.join(line for line, _ in kept)
    planning.set_checklist_states(new_states)

    if target is None:
        target = Planning(
            user_id=user.id, classroom_id=planning.classroom_id,
            mixed_group_id=planning.mixed_group_id, group_id=planning.group_id,
            date=target_date, period_number=target_period,
            title=planning.title or '', description='',
        )
        db.session.add(target)
    old_states = target.get_checklist_states()
    shifted = {str(int(k) + len(moved)): v for k, v in old_states.items() if str(k).isdigit()}
    existing = target.description or ''
    target.description = '\n'.join(moved) + ('\n' + existing if existing.strip() else '')
    target.set_checklist_states(shifted)
    db.session.commit()
    return len(moved), target_date, target_period
