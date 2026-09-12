"""API de l'évaluation formative (fonction optionnelle).

Tout est refusé tant que l'enseignant n'a pas activé la fonction dans ses
paramètres : inutile de laisser une API vivante pour une fonction masquée.

Voir models/formative.py pour le modèle de données, et routes/settings.py pour
l'activation et l'échelle d'appréciation.
"""
import re
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from extensions import db
from routes import teacher_required
from routes.evaluations import user_can_access_classroom
from models.classroom import Classroom
from models.student import Student
from models.formative import FormativeAssessment, FormativeEntry, FormativeLevel

formative_bp = Blueprint('formative', __name__, url_prefix='/api/formative')

_HEX_COLOR = re.compile(r'^#[0-9A-Fa-f]{6}$')


def _enabled():
    """L'enseignant a-t-il activé la fonction ?"""
    from models.user_preferences import UserPreferences
    prefs = UserPreferences.query.filter_by(user_id=current_user.id).first()
    return bool(prefs and prefs.formative_enabled)


def _require_enabled():
    """Réponse d'erreur si la fonction est désactivée, sinon None."""
    if not _enabled():
        return jsonify({'success': False, 'error': 'Fonction désactivée'}), 403
    return None


def _clean_color(value):
    """Couleur de pastille : hexadécimal #RRGGBB, ou None."""
    value = (value or '').strip()
    return value.upper() if _HEX_COLOR.match(value) else None


def _owned_assessment(assessment_id):
    """Évaluation appartenant à l'enseignant connecté, ou None."""
    return FormativeAssessment.query.filter_by(
        id=assessment_id, user_id=current_user.id).first()


# ----------------------------------------------------------------- échelle

@formative_bp.route('/levels', methods=['GET'])
@login_required
@teacher_required
def list_levels():
    levels = FormativeLevel.query.filter_by(user_id=current_user.id).order_by(
        FormativeLevel.position, FormativeLevel.id).all()
    return jsonify({'success': True, 'levels': [l.to_dict() for l in levels]})


@formative_bp.route('/levels', methods=['POST'])
@login_required
@teacher_required
def create_level():
    data = request.get_json(silent=True) or {}
    label = (data.get('label') or '').strip()
    if not label:
        return jsonify({'success': False, 'error': 'Libellé manquant'}), 400
    if len(label) > 60:
        label = label[:60]
    last = FormativeLevel.query.filter_by(user_id=current_user.id).order_by(
        FormativeLevel.position.desc()).first()
    level = FormativeLevel(user_id=current_user.id, label=label,
                           position=(last.position + 1) if last else 0)
    db.session.add(level)
    db.session.commit()
    return jsonify({'success': True, 'level': level.to_dict()})


@formative_bp.route('/levels/<int:level_id>', methods=['PUT'])
@login_required
@teacher_required
def update_level(level_id):
    level = FormativeLevel.query.filter_by(id=level_id, user_id=current_user.id).first()
    if not level:
        return jsonify({'success': False, 'error': 'Niveau introuvable'}), 404
    data = request.get_json(silent=True) or {}
    label = (data.get('label') or '').strip()
    if not label:
        return jsonify({'success': False, 'error': 'Libellé manquant'}), 400
    level.label = label[:60]
    db.session.commit()
    return jsonify({'success': True, 'level': level.to_dict()})


@formative_bp.route('/levels/<int:level_id>', methods=['DELETE'])
@login_required
@teacher_required
def delete_level(level_id):
    """Supprime un niveau. Les appréciations déjà posées avec ce niveau
    retombent à « aucune » (FK ON DELETE SET NULL) plutôt que de disparaître :
    le commentaire et la pastille de l'élève sont conservés."""
    level = FormativeLevel.query.filter_by(id=level_id, user_id=current_user.id).first()
    if not level:
        return jsonify({'success': False, 'error': 'Niveau introuvable'}), 404
    FormativeEntry.query.filter_by(level_id=level.id).update(
        {'level_id': None}, synchronize_session=False)
    db.session.delete(level)
    db.session.commit()
    return jsonify({'success': True})


@formative_bp.route('/levels/reorder', methods=['POST'])
@login_required
@teacher_required
def reorder_levels():
    data = request.get_json(silent=True) or {}
    ids = data.get('ids') or []
    levels = {l.id: l for l in FormativeLevel.query.filter_by(user_id=current_user.id).all()}
    for position, raw_id in enumerate(ids):
        try:
            level = levels.get(int(raw_id))
        except (TypeError, ValueError):
            continue
        if level:
            level.position = position
    db.session.commit()
    return jsonify({'success': True})


# ------------------------------------------------------------ évaluations

@formative_bp.route('/assessments', methods=['GET'])
@login_required
@teacher_required
def list_assessments():
    """Évaluations d'une discipline + la grille complète (élèves × évaluations).

    Tout est renvoyé en une requête : l'onglet affiche un tableau, pas une
    fiche par élève.
    """
    err = _require_enabled()
    if err:
        return err
    try:
        classroom_id = int(request.args.get('classroom_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'classroom_id invalide'}), 400
    if not user_can_access_classroom(current_user.id, classroom_id):
        return jsonify({'success': False, 'error': 'Accès refusé'}), 403

    classroom = Classroom.query.get_or_404(classroom_id)
    assessments = FormativeAssessment.query.filter_by(
        user_id=current_user.id, classroom_id=classroom_id
    ).order_by(FormativeAssessment.date.desc(), FormativeAssessment.id.desc()).all()

    # Le roster est partagé entre les disciplines d'une même classe : on prend
    # get_students() et non les élèves de ce seul Classroom.
    students = classroom.get_students()
    sort_by_last = getattr(current_user, 'student_sort_pref', 'first_name') == 'last_name'
    students.sort(key=lambda s: ((s.last_name or '').lower(), (s.first_name or '').lower())
                  if sort_by_last else ((s.first_name or '').lower(), (s.last_name or '').lower()))

    entries = []
    if assessments:
        entries = FormativeEntry.query.filter(
            FormativeEntry.assessment_id.in_([a.id for a in assessments])).all()

    return jsonify({
        'success': True,
        'assessments': [a.to_dict() for a in assessments],
        'students': [{'id': s.id, 'first_name': s.first_name, 'last_name': s.last_name}
                     for s in students],
        'entries': [e.to_dict() for e in entries],
    })


@formative_bp.route('/assessments', methods=['POST'])
@login_required
@teacher_required
def create_assessment():
    err = _require_enabled()
    if err:
        return err
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

    try:
        date = datetime.strptime(data.get('date'), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        date = current_user.get_local_datetime().date()

    assessment = FormativeAssessment(user_id=current_user.id, classroom_id=classroom_id,
                                     title=title[:200], date=date)
    db.session.add(assessment)
    db.session.commit()
    return jsonify({'success': True, 'assessment': assessment.to_dict()})


@formative_bp.route('/assessments/<int:assessment_id>', methods=['PUT'])
@login_required
@teacher_required
def update_assessment(assessment_id):
    err = _require_enabled()
    if err:
        return err
    assessment = _owned_assessment(assessment_id)
    if not assessment:
        return jsonify({'success': False, 'error': 'Évaluation introuvable'}), 404
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if title:
        assessment.title = title[:200]
    if data.get('date'):
        try:
            assessment.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'success': False, 'error': 'Date invalide'}), 400
    db.session.commit()
    return jsonify({'success': True, 'assessment': assessment.to_dict()})


@formative_bp.route('/assessments/<int:assessment_id>', methods=['DELETE'])
@login_required
@teacher_required
def delete_assessment(assessment_id):
    err = _require_enabled()
    if err:
        return err
    assessment = _owned_assessment(assessment_id)
    if not assessment:
        return jsonify({'success': False, 'error': 'Évaluation introuvable'}), 404
    db.session.delete(assessment)     # cascade sur les entrées
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------- entrées

@formative_bp.route('/entries', methods=['POST'])
@login_required
@teacher_required
def upsert_entry():
    """Enregistre l'appréciation d'un élève. Une entrée devenue entièrement
    vide est supprimée plutôt que gardée : la grille ne doit montrer que ce que
    l'enseignant a réellement posé."""
    err = _require_enabled()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    try:
        assessment_id = int(data.get('assessment_id'))
        student_id = int(data.get('student_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'Paramètres invalides'}), 400

    assessment = _owned_assessment(assessment_id)
    if not assessment:
        return jsonify({'success': False, 'error': 'Évaluation introuvable'}), 404

    # L'élève doit bien appartenir au roster de la classe visée.
    if student_id not in {s.id for s in assessment.classroom.get_students()}:
        return jsonify({'success': False, 'error': 'Élève hors de cette classe'}), 403

    # Une clé ABSENTE du corps signifie « colonne désactivée dans les
    # paramètres » : on laisse la valeur déjà enregistrée intacte. Sans ça,
    # masquer temporairement le commentaire effacerait silencieusement les
    # commentaires existants à la première modification d'appréciation.
    level_id = None
    if 'level_id' in data:
        level_id = data.get('level_id')
        if level_id in ('', None):
            level_id = None
        else:
            try:
                level_id = int(level_id)
            except (TypeError, ValueError):
                return jsonify({'success': False, 'error': 'Niveau invalide'}), 400
            if not FormativeLevel.query.filter_by(id=level_id, user_id=current_user.id).first():
                return jsonify({'success': False, 'error': 'Niveau introuvable'}), 404

    comment = (data.get('comment') or '').strip() or None
    color = _clean_color(data.get('color'))

    entry = FormativeEntry.query.filter_by(
        assessment_id=assessment_id, student_id=student_id).first()

    if entry is None:
        if not (level_id or comment or color):
            return jsonify({'success': True, 'entry': None})   # rien à enregistrer
        entry = FormativeEntry(assessment_id=assessment_id, student_id=student_id)
        db.session.add(entry)

    if 'level_id' in data:
        entry.level_id = level_id
    if 'comment' in data:
        entry.comment = comment
    if 'color' in data:
        entry.color = color

    if entry.is_empty():
        db.session.delete(entry)
        db.session.commit()
        return jsonify({'success': True, 'entry': None})

    db.session.commit()
    return jsonify({'success': True, 'entry': entry.to_dict()})


# ----------------------------------------------------------- rapport élève

@formative_bp.route('/student/<int:student_id>', methods=['GET'])
@login_required
@teacher_required
def student_formative(student_id):
    """Évaluations formatives d'un élève, pour le rapport élève.

    Ne renvoie que les évaluations de l'enseignant connecté : un collègue ne
    voit pas les appréciations formatives des autres disciplines.
    """
    from routes.planning import user_can_access_student
    if not user_can_access_student(current_user.id, student_id):
        return jsonify({'success': False, 'error': 'Accès refusé'}), 404
    if not _enabled():
        return jsonify({'success': True, 'enabled': False, 'items': []})

    rows = db.session.query(FormativeEntry, FormativeAssessment).join(
        FormativeAssessment, FormativeEntry.assessment_id == FormativeAssessment.id
    ).filter(
        FormativeEntry.student_id == student_id,
        FormativeAssessment.user_id == current_user.id,
    ).order_by(FormativeAssessment.date.desc()).all()

    items = []
    for entry, assessment in rows:
        items.append({
            'title': assessment.title,
            'date': assessment.date.isoformat() if assessment.date else None,
            'subject': assessment.classroom.subject if assessment.classroom else None,
            'level_label': entry.level.label if entry.level else None,
            'comment': entry.comment,
            'color': entry.color,
        })
    return jsonify({'success': True, 'enabled': True, 'items': items})
