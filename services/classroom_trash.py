"""Corbeille des classes supprimées : archivage (avant purge) + restauration.

Approche « archive » (et non soft-delete) : à la suppression d'une classe, on
sérialise la classe + ses élèves + évaluations + notes dans la table
deleted_classrooms (payload chiffré), PUIS la purge normale s'exécute. Aucune
des ~200 requêtes Classroom existantes n'est touchée. La restauration recrée la
classe via l'ORM. Rétention : 30 jours.
"""
import json
from datetime import datetime, timedelta, date as _date

from extensions import db

TRASH_RETENTION_DAYS = 30


def archive_classroom(classroom, actor_user_id):
    """Sérialise une classe + élèves + évaluations + notes dans la corbeille.

    Best-effort : à appeler AVANT la purge. Commit immédiat pour survivre à un
    éventuel expunge_all() de la routine de suppression. L'appelant DOIT envelopper
    cet appel dans un try/except : l'archivage ne doit jamais empêcher la suppression.

    Retourne l'entrée DeletedClassroom créée.
    """
    from models.student import Student
    from models.evaluation import Evaluation, EvaluationGrade
    from models.deleted_classroom import DeletedClassroom

    try:
        return _archive_classroom_impl(classroom, actor_user_id,
                                       Student, Evaluation, EvaluationGrade, DeletedClassroom)
    except Exception:
        # Ne JAMAIS laisser la session dans un état cassé : la suppression qui suit
        # doit pouvoir s'exécuter même si l'archivage a échoué.
        db.session.rollback()
        return None


def _archive_classroom_impl(classroom, actor_user_id, Student, Evaluation, EvaluationGrade, DeletedClassroom):
    students = Student.query.filter_by(classroom_id=classroom.id).all()
    sid_to_idx = {}
    students_payload = []
    for i, s in enumerate(students):
        sid_to_idx[s.id] = i
        students_payload.append({
            'idx': i,
            'first_name': s.first_name,
            'last_name': s.last_name,
            'email': s.email,
            'parent_email_mother': s.parent_email_mother,
            'parent_email_father': s.parent_email_father,
            'additional_info': s.additional_info,
        })

    evals = Evaluation.query.filter_by(classroom_id=classroom.id).all()
    eid_to_idx = {}
    evals_payload = []
    for j, e in enumerate(evals):
        eid_to_idx[e.id] = j
        evals_payload.append({
            'idx': j,
            'title': e.title,
            'type': e.type,
            'ta_group_name': e.ta_group_name,
            'date': e.date.isoformat() if e.date else None,
            'max_points': e.max_points,
            'min_points': e.min_points,
        })

    grades_payload = []
    if eid_to_idx and sid_to_idx:
        grades = EvaluationGrade.query.filter(
            EvaluationGrade.evaluation_id.in_(list(eid_to_idx.keys()))
        ).all()
        for g in grades:
            if g.evaluation_id in eid_to_idx and g.student_id in sid_to_idx:
                grades_payload.append({
                    'student_idx': sid_to_idx[g.student_id],
                    'eval_idx': eid_to_idx[g.evaluation_id],
                    'points': g.points,
                })

    payload = {
        'version': 1,
        'classroom': {
            'name': classroom.name,
            'subject': classroom.subject,
            'color': classroom.color,
            'class_group': classroom.class_group,
            'is_class_master': bool(getattr(classroom, 'is_class_master', False)),
            'is_temporary': bool(getattr(classroom, 'is_temporary', False)),
        },
        'students': students_payload,
        'evaluations': evals_payload,
        'grades': grades_payload,
    }

    entry = DeletedClassroom(
        user_id=actor_user_id,
        original_classroom_id=classroom.id,
        name=classroom.name,
        subject=classroom.subject,
        color=classroom.color,
        class_group=classroom.class_group,
        student_count=len(students_payload),
        payload=json.dumps(payload),
        deleted_at=datetime.utcnow(),
    )
    db.session.add(entry)
    db.session.commit()  # persiste tout de suite (avant l'expunge_all de la suppression)
    return entry


def restore_classroom(entry, user_id):
    """Recrée une classe (+ élèves + évaluations + notes) depuis une entrée corbeille.

    Retourne le nouvel objet Classroom et supprime l'entrée corbeille.
    La maîtrise de classe (collaboration) n'est pas restaurée.
    """
    from models.classroom import Classroom
    from models.student import Student
    from models.evaluation import Evaluation, EvaluationGrade

    data = json.loads(entry.payload) if entry.payload else {}
    c = data.get('classroom', {})

    classroom = Classroom(
        user_id=user_id,
        name=c.get('name') or entry.name or 'Classe restaurée',
        subject=c.get('subject') or entry.subject or '',
        color=c.get('color') or '#4F46E5',
        class_group=c.get('class_group'),
        is_class_master=False,
        is_temporary=bool(c.get('is_temporary', False)),
    )
    db.session.add(classroom)
    db.session.flush()  # -> classroom.id

    idx_to_sid = {}
    for s in data.get('students', []):
        st = Student(
            classroom_id=classroom.id,
            user_id=user_id,
            first_name=s.get('first_name') or '',
            last_name=s.get('last_name') or '',
            email=s.get('email'),
            parent_email_mother=s.get('parent_email_mother'),
            parent_email_father=s.get('parent_email_father'),
            additional_info=s.get('additional_info'),
        )
        db.session.add(st)
        db.session.flush()
        idx_to_sid[s.get('idx')] = st.id

    idx_to_eid = {}
    for e in data.get('evaluations', []):
        ev_date = None
        if e.get('date'):
            try:
                ev_date = _date.fromisoformat(e['date'])
            except Exception:
                ev_date = None
        ev = Evaluation(
            classroom_id=classroom.id,
            title=e.get('title') or 'Évaluation',
            type=e.get('type') or 'significatif',
            ta_group_name=e.get('ta_group_name'),
            date=ev_date or datetime.utcnow().date(),
            max_points=e.get('max_points') if e.get('max_points') is not None else 6.0,
            min_points=e.get('min_points') if e.get('min_points') is not None else 0,
        )
        db.session.add(ev)
        db.session.flush()
        idx_to_eid[e.get('idx')] = ev.id

    for g in data.get('grades', []):
        sid = idx_to_sid.get(g.get('student_idx'))
        eid = idx_to_eid.get(g.get('eval_idx'))
        if sid and eid:
            db.session.add(EvaluationGrade(
                evaluation_id=eid, student_id=sid, points=g.get('points'),
            ))

    db.session.delete(entry)
    db.session.commit()
    return classroom


def purge_expired_trash():
    """Supprime définitivement les entrées corbeille de plus de 30 jours.

    Retourne le nombre d'entrées purgées.
    """
    from models.deleted_classroom import DeletedClassroom
    cutoff = datetime.utcnow() - timedelta(days=TRASH_RETENTION_DAYS)
    try:
        n = DeletedClassroom.query.filter(
            DeletedClassroom.deleted_at < cutoff
        ).delete(synchronize_session=False)
        db.session.commit()
        return n
    except Exception:
        db.session.rollback()
        return 0
