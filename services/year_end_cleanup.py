"""
Service de nettoyage de fin d'année.
Supprime les données opérationnelles de l'année écoulée et met à jour la configuration.
"""
from datetime import date, timedelta
from extensions import db


def execute_year_end_cleanup(user, class_actions, new_year_start, new_year_end, holiday_action='clear'):
    """
    Exécute le nettoyage complet de fin d'année en une transaction.

    Args:
        user: objet User (current_user)
        class_actions: dict {classroom_id: {'action': 'keep'|'rename'|'delete', 'new_name': str}}
                       Inclut aussi les mixed_groups avec clé 'mg_<id>'
        new_year_start: date - nouvelle date de début d'année
        new_year_end: date - nouvelle date de fin d'année
        holiday_action: 'shift' (décaler d'un an) ou 'clear' (supprimer)

    Returns:
        dict avec le résumé des actions effectuées
    """
    from models.planning import Planning
    from models.attendance import Attendance
    from models.absence_justification import AbsenceJustification
    from models.evaluation import Evaluation, EvaluationGrade
    from models.student import Grade, Student
    from models.lesson_memo import LessonMemo, StudentRemark
    from models.sanctions import StudentSanctionRecord
    from models.student_sanctions import StudentSanctionCount
    from models.seating_plan import SeatingPlan
    from models.student_group import StudentGroup, StudentGroupMembership
    from models.decoupage import DecoupageAssignment
    from models.classroom import Classroom
    from models.mixed_group import MixedGroup, MixedGroupStudent
    from models.user import Holiday
    from models.schedule import Schedule

    summary = {
        'plannings_deleted': 0,
        'attendance_deleted': 0,
        'justifications_deleted': 0,
        'evaluations_deleted': 0,
        'grades_deleted': 0,
        'memos_deleted': 0,
        'remarks_deleted': 0,
        'sanctions_deleted': 0,
        'sanctions_reset': 0,
        'seating_plans_deleted': 0,
        'classes_deleted': 0,
        'classes_renamed': 0,
        'classes_kept': 0,
        'mixed_groups_deleted': 0,
    }

    # =========================================================
    # 1. Supprimer les données opérationnelles liées à l'année
    # =========================================================

    # Plannings (leçons concrètes avec dates)
    count = Planning.query.filter_by(user_id=user.id).delete()
    summary['plannings_deleted'] = count

    # Présences
    count = Attendance.query.filter_by(user_id=user.id).delete()
    summary['attendance_deleted'] = count

    # Justifications d'absence — liées aux élèves, pas directement au user
    # On passe par les students de ce user
    student_ids = [s.id for s in Student.query.filter_by(user_id=user.id).all()]
    if student_ids:
        count = AbsenceJustification.query.filter(
            AbsenceJustification.student_id.in_(student_ids)
        ).delete(synchronize_session='fetch')
        summary['justifications_deleted'] = count

    # Évaluations et notes — via les classrooms du user
    classroom_ids = [c.id for c in Classroom.query.filter_by(user_id=user.id).all()]
    if classroom_ids:
        # D'abord supprimer les EvaluationGrade liées aux évaluations du user
        eval_ids = [e.id for e in Evaluation.query.filter(
            Evaluation.classroom_id.in_(classroom_ids)
        ).all()]
        if eval_ids:
            count = EvaluationGrade.query.filter(
                EvaluationGrade.evaluation_id.in_(eval_ids)
            ).delete(synchronize_session='fetch')
            summary['grades_deleted'] += count

        count = Evaluation.query.filter(
            Evaluation.classroom_id.in_(classroom_ids)
        ).delete(synchronize_session='fetch')
        summary['evaluations_deleted'] = count

    # Anciennes notes (legacy Grade model)
    if classroom_ids:
        count = Grade.query.filter(
            Grade.classroom_id.in_(classroom_ids)
        ).delete(synchronize_session='fetch')
        summary['grades_deleted'] += count

    # Mémos de cours
    count = LessonMemo.query.filter_by(user_id=user.id).delete()
    summary['memos_deleted'] = count

    # Remarques élèves
    count = StudentRemark.query.filter_by(user_id=user.id).delete()
    summary['remarks_deleted'] = count

    # Sanctions attribuées (records)
    if student_ids:
        count = StudentSanctionRecord.query.filter(
            StudentSanctionRecord.student_id.in_(student_ids)
        ).delete(synchronize_session='fetch')
        summary['sanctions_deleted'] = count

    # Remettre les compteurs de sanctions à 0
    if student_ids:
        count = StudentSanctionCount.query.filter(
            StudentSanctionCount.student_id.in_(student_ids)
        ).update({'check_count': 0}, synchronize_session='fetch')
        summary['sanctions_reset'] = count

    # Plans de classe
    if classroom_ids:
        count = SeatingPlan.query.filter(
            SeatingPlan.classroom_id.in_(classroom_ids)
        ).delete(synchronize_session='fetch')
        summary['seating_plans_deleted'] = count

    # Assignations de découpage
    if classroom_ids:
        DecoupageAssignment.query.filter(
            DecoupageAssignment.classroom_id.in_(classroom_ids)
        ).delete(synchronize_session='fetch')

    # =========================================================
    # 2. Gérer les classes selon les choix de l'utilisateur
    # =========================================================
    for classroom in Classroom.query.filter_by(user_id=user.id).all():
        key = str(classroom.id)
        action_info = class_actions.get(key, {'action': 'keep'})
        action = action_info.get('action', 'keep')

        if action == 'delete':
            # Supprimer les élèves de cette classe
            Student.query.filter_by(classroom_id=classroom.id, user_id=user.id).delete()
            # Supprimer les groupes d'élèves
            groups = StudentGroup.query.filter_by(classroom_id=classroom.id).all()
            for g in groups:
                StudentGroupMembership.query.filter_by(group_id=g.id).delete()
                db.session.delete(g)
            # Supprimer les horaires liés à cette classe
            Schedule.query.filter_by(user_id=user.id, classroom_id=classroom.id).delete()
            # Supprimer la classe
            db.session.delete(classroom)
            summary['classes_deleted'] += 1

        elif action == 'rename':
            new_name = action_info.get('new_name', classroom.name)
            classroom.name = new_name
            summary['classes_renamed'] += 1
            # Vider les groupes d'élèves (les compositions changent)
            groups = StudentGroup.query.filter_by(classroom_id=classroom.id).all()
            for g in groups:
                StudentGroupMembership.query.filter_by(group_id=g.id).delete()

        else:  # keep
            summary['classes_kept'] += 1
            # Vider les groupes d'élèves
            groups = StudentGroup.query.filter_by(classroom_id=classroom.id).all()
            for g in groups:
                StudentGroupMembership.query.filter_by(group_id=g.id).delete()

    # Groupes mixtes
    for mg in MixedGroup.query.filter_by(teacher_id=user.id).all():
        key = f'mg_{mg.id}'
        action_info = class_actions.get(key, {'action': 'keep'})
        action = action_info.get('action', 'keep')

        if action == 'delete':
            MixedGroupStudent.query.filter_by(mixed_group_id=mg.id).delete()
            Schedule.query.filter_by(user_id=user.id, mixed_group_id=mg.id).delete()
            db.session.delete(mg)
            summary['mixed_groups_deleted'] += 1
        else:
            # Vider les membres du groupe (à reconfigurer)
            MixedGroupStudent.query.filter_by(mixed_group_id=mg.id).delete()

    # =========================================================
    # 3. Mettre à jour les dates de l'année scolaire
    # =========================================================
    user.school_year_start = new_year_start
    user.school_year_end = new_year_end

    # =========================================================
    # 4. Gérer les vacances
    # =========================================================
    if holiday_action == 'shift':
        # Décaler toutes les vacances d'un an
        holidays = Holiday.query.filter_by(user_id=user.id).all()
        for h in holidays:
            # Calculer la différence en années entre l'ancienne et la nouvelle année
            year_diff = new_year_start.year - user.school_year_start.year if user.school_year_start else 1
            if year_diff < 1:
                year_diff = 1
            h.start_date = h.start_date.replace(year=h.start_date.year + year_diff)
            h.end_date = h.end_date.replace(year=h.end_date.year + year_diff)
    else:
        # Supprimer toutes les vacances
        Holiday.query.filter_by(user_id=user.id).delete()

    # =========================================================
    # 5. Commit
    # =========================================================
    db.session.commit()

    return summary
