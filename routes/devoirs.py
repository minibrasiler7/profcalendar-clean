"""Devoirs (enseignant → élèves).

Phase 1 : l'enseignant crée un devoir pour une classe, avec une date de rendu
choisie parmi les prochaines dates de cours de la classe (jour de la semaine
indiqué). Le devoir apparaîtra comme une tâche à la date de rendu.

Deux types : 'submission' (l'élève rend une photo, le prof corrige) et
'exercise' (exercice interactif, suivi points/badges). Le rendu côté élève et
la correction arrivent dans les phases suivantes.
"""
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from extensions import db
from routes import teacher_required
from models.devoir import Devoir
from models.classroom import Classroom
from models.exercise import Exercise
from routes.evaluations import user_can_access_classroom

devoirs_bp = Blueprint('devoirs', __name__, url_prefix='/api/devoirs')

_WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
_MONTHS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
              'août', 'septembre', 'octobre', 'novembre', 'décembre']


def get_upcoming_class_dates(user, classroom, count=8, from_date=None):
    """Prochaines dates où la classe a cours (jours de l'horaire type), en
    sautant vacances/fériés et en restant dans l'année scolaire. Couvre toutes
    les disciplines de la classe (roster/horaire du groupe)."""
    from models.schedule import Schedule
    from utils.vaud_holidays import is_holiday

    group_ids = classroom.get_group_classroom_ids()
    weekdays = {
        s.weekday for s in Schedule.query.filter(
            Schedule.user_id == user.id,
            Schedule.classroom_id.in_(group_ids)
        ).all()
    }
    if not weekdays:
        return []

    start = from_date or user.get_local_datetime().date()
    end = user.school_year_end or (start + timedelta(days=365))
    d = start + timedelta(days=1)
    out = []
    while len(out) < count and d <= end:
        if d.weekday() in weekdays and not is_holiday(d, user):
            out.append(d)
        d += timedelta(days=1)
    return out


def _date_label(d):
    return f"{_WEEKDAYS_FR[d.weekday()]} {d.day} {_MONTHS_FR[d.month]}"


@devoirs_bp.route('/suggest-dates', methods=['GET'])
@login_required
@teacher_required
def suggest_dates():
    """Prochaines dates de cours de la classe (avec le jour de la semaine)."""
    try:
        classroom_id = int(request.args.get('classroom_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'classroom_id invalide'}), 400
    if not user_can_access_classroom(current_user.id, classroom_id):
        return jsonify({'success': False, 'error': 'Accès refusé'}), 403
    classroom = Classroom.query.get_or_404(classroom_id)
    dates = get_upcoming_class_dates(current_user, classroom, count=10)
    return jsonify({
        'success': True,
        'dates': [
            {'date': d.isoformat(), 'weekday': _WEEKDAYS_FR[d.weekday()], 'label': _date_label(d)}
            for d in dates
        ],
    })


@devoirs_bp.route('/exercises', methods=['GET'])
@login_required
@teacher_required
def list_exercises_for_picker():
    """Exercices interactifs de l'enseignant — pour le sélecteur d'un devoir de
    type 'exercise'. Les publiés d'abord."""
    exs = Exercise.query.filter_by(user_id=current_user.id).order_by(
        Exercise.is_published.desc(), Exercise.updated_at.desc()
    ).all()
    return jsonify({'success': True, 'exercises': [
        {'id': e.id, 'title': e.title, 'subject': e.subject or '', 'published': bool(e.is_published)}
        for e in exs
    ]})


@devoirs_bp.route('/create', methods=['POST'])
@login_required
@teacher_required
def create_devoir():
    """Crée un devoir. Corps JSON : classroom_id, type, title, instructions?,
    due_date (YYYY-MM-DD), due_period?, exercise_id? (si type=exercise)."""
    data = request.get_json(silent=True) or {}

    try:
        classroom_id = int(data.get('classroom_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'classroom_id invalide'}), 400
    if not user_can_access_classroom(current_user.id, classroom_id):
        return jsonify({'success': False, 'error': 'Accès refusé'}), 403

    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'Titre manquant'}), 400

    devoir_type = data.get('type') if data.get('type') in ('submission', 'exercise') else 'submission'

    try:
        due_date = datetime.strptime(data.get('due_date'), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'Date de rendu invalide'}), 400

    due_period = data.get('due_period')
    try:
        due_period = int(due_period) if due_period not in (None, '') else None
    except (TypeError, ValueError):
        due_period = None

    exercise_id = None
    if devoir_type == 'exercise':
        try:
            exercise_id = int(data.get('exercise_id'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'Exercice manquant'}), 400
        if not Exercise.query.filter_by(id=exercise_id, user_id=current_user.id).first():
            return jsonify({'success': False, 'error': 'Exercice introuvable'}), 404

    devoir = Devoir(
        user_id=current_user.id,
        classroom_id=classroom_id,
        devoir_type=devoir_type,
        title=title,
        instructions=((data.get('instructions') or '').strip() or None),
        due_date=due_date,
        due_period=due_period,
        exercise_id=exercise_id,
    )
    db.session.add(devoir)
    db.session.commit()
    return jsonify({'success': True, 'devoir': devoir.to_dict()})


@devoirs_bp.route('/list', methods=['GET'])
@login_required
@teacher_required
def list_devoirs():
    """Devoirs de l'enseignant. Filtres optionnels : ?date=YYYY-MM-DD (date de
    rendu), ?classroom_id=X."""
    q = Devoir.query.filter_by(user_id=current_user.id)
    date_str = request.args.get('date')
    if date_str:
        try:
            q = q.filter(Devoir.due_date == datetime.strptime(date_str, '%Y-%m-%d').date())
        except ValueError:
            return jsonify({'success': False, 'error': 'date invalide'}), 400
    cid = request.args.get('classroom_id')
    if cid:
        try:
            q = q.filter(Devoir.classroom_id == int(cid))
        except ValueError:
            pass
    devoirs = q.order_by(Devoir.due_date.asc(), Devoir.created_at.asc()).all()
    return jsonify({'success': True, 'devoirs': [d.to_dict() for d in devoirs]})


@devoirs_bp.route('/<int:devoir_id>', methods=['DELETE'])
@login_required
@teacher_required
def delete_devoir(devoir_id):
    devoir = Devoir.query.filter_by(id=devoir_id, user_id=current_user.id).first()
    if not devoir:
        return jsonify({'success': False, 'error': 'Devoir introuvable'}), 404
    db.session.delete(devoir)
    db.session.commit()
    return jsonify({'success': True})
