"""
Service de nettoyage de fin d'année.
Supprime les données opérationnelles de l'année écoulée et met à jour la configuration.
"""
from datetime import date, timedelta
from extensions import db


def _delete_student_dependencies(student_ids):
    """
    Supprime toutes les données liées aux élèves (FK) avant de pouvoir supprimer les élèves.
    Doit être appelé AVANT Student.query.delete().
    """
    if not student_ids:
        return

    from models.attendance import Attendance
    from models.absence_justification import AbsenceJustification
    from models.evaluation import EvaluationGrade
    from models.student import Grade, StudentFile
    from models.lesson_memo import StudentRemark
    from models.sanctions import StudentSanctionRecord
    from models.student_sanctions import StudentSanctionCount
    from models.student_group import StudentGroupMembership
    from models.mixed_group import MixedGroupStudent
    from models.accommodation import StudentAccommodation
    from models.student_info_history import StudentInfoHistory
    from models.file_sharing import StudentFileShare
    from models.class_collaboration import StudentClassroomLink
    from models.parent import ParentChild
    from models.student_access_code import StudentAccessCode

    # Supprimer toutes les tables avec FK vers students
    Attendance.query.filter(Attendance.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    AbsenceJustification.query.filter(AbsenceJustification.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    EvaluationGrade.query.filter(EvaluationGrade.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    Grade.query.filter(Grade.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentRemark.query.filter(StudentRemark.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentSanctionRecord.query.filter(StudentSanctionRecord.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentSanctionCount.query.filter(StudentSanctionCount.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentGroupMembership.query.filter(StudentGroupMembership.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    MixedGroupStudent.query.filter(MixedGroupStudent.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentAccommodation.query.filter(StudentAccommodation.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentInfoHistory.query.filter(StudentInfoHistory.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentFileShare.query.filter(StudentFileShare.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentClassroomLink.query.filter(StudentClassroomLink.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    ParentChild.query.filter(ParentChild.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentAccessCode.query.filter(StudentAccessCode.student_id.in_(student_ids)).delete(synchronize_session='fetch')
    StudentFile.query.filter(StudentFile.student_id.in_(student_ids)).delete(synchronize_session='fetch')


def _delete_classroom_dependencies(classroom_id):
    """
    Supprime toutes les données liées à une classe (FK) avant de pouvoir supprimer la classe.
    Gère aussi la chaîne de collaboration (classes dérivées des enseignants spécialisés).
    Doit être appelé AVANT db.session.delete(classroom).
    """
    from models.class_file import ClassFile, ClassFolder
    from models.class_collaboration import SharedClassroom, StudentClassroomLink, ClassMaster
    from models.classroom_access_code import ClassroomAccessCode
    from models.sanctions import ClassroomSanctionImport
    from models.parent import ClassCode
    from models.student import Grade, Student, ClassroomChapter, LegacyClassFile
    from models.invitation_classroom import InvitationClassroom
    from models.evaluation import Evaluation, EvaluationGrade
    from models.attendance import Attendance
    from models.lesson_memo import LessonMemo
    from models.lesson_blank_sheet import LessonBlankSheet
    from models.seating_plan import SeatingPlan
    from models.student_group import StudentGroup, StudentGroupMembership
    from models.decoupage import DecoupageAssignment
    from models.schedule import Schedule
    from models.planning import Planning
    from models.file_manager import FileShare
    from models.mixed_group import MixedGroup
    from models.user_preferences import UserSanctionPreferences

    # --- 1. Gérer la chaîne de collaboration ---
    # Si cette classe est une classe originale (maître de classe),
    # on détache les classes dérivées des enseignants spécialisés
    # SANS les supprimer — les spécialisés conservent leurs données
    # (les PDFs d'archive sont générés en amont comme filet de sécurité)

    # Supprimer uniquement les enregistrements SharedClassroom (le lien)
    # Les classes dérivées et toutes leurs données restent intactes
    SharedClassroom.query.filter_by(original_classroom_id=classroom_id).delete(synchronize_session='fetch')
    SharedClassroom.query.filter_by(derived_classroom_id=classroom_id).delete(synchronize_session='fetch')

    # --- 2. Supprimer les élèves de cette classe et leurs dépendances ---
    class_student_ids = [s.id for s in Student.query.filter_by(classroom_id=classroom_id).all()]
    if class_student_ids:
        _delete_student_dependencies(class_student_ids)
        Student.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # --- 3. Supprimer toutes les tables avec FK vers classrooms ---
    # Fichiers et dossiers de classe
    ClassFile.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')
    ClassFolder.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Liens élèves-classes
    StudentClassroomLink.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Codes d'accès de classe
    ClassroomAccessCode.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Import de sanctions
    ClassroomSanctionImport.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Codes de classe (parents)
    ClassCode.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Fichiers legacy
    LegacyClassFile.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Chapitres de classe
    ClassroomChapter.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Évaluations (supprimer d'abord les notes des évals)
    eval_ids = [e.id for e in Evaluation.query.filter_by(classroom_id=classroom_id).all()]
    if eval_ids:
        EvaluationGrade.query.filter(EvaluationGrade.evaluation_id.in_(eval_ids)).delete(synchronize_session='fetch')
    Evaluation.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Notes legacy
    Grade.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Présences
    Attendance.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Mémos de cours (nullable)
    LessonMemo.query.filter(LessonMemo.classroom_id == classroom_id).delete(synchronize_session='fetch')

    # Feuilles blanches (nullable)
    LessonBlankSheet.query.filter(LessonBlankSheet.classroom_id == classroom_id).delete(synchronize_session='fetch')

    # Plans de classe
    SeatingPlan.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Groupes d'élèves (supprimer d'abord les memberships)
    group_ids = [g.id for g in StudentGroup.query.filter_by(classroom_id=classroom_id).all()]
    if group_ids:
        StudentGroupMembership.query.filter(
            StudentGroupMembership.group_id.in_(group_ids)
        ).delete(synchronize_session='fetch')
    StudentGroup.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Découpage
    DecoupageAssignment.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Horaires
    Schedule.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # Plannings (nullable)
    Planning.query.filter(Planning.classroom_id == classroom_id).delete(synchronize_session='fetch')

    # Partages de fichiers (nullable)
    FileShare.query.filter(FileShare.classroom_id == classroom_id).delete(synchronize_session='fetch')

    # Invitations de classe
    InvitationClassroom.query.filter_by(target_classroom_id=classroom_id).delete(synchronize_session='fetch')

    # TeacherInvitation (FK target_classroom_id)
    try:
        from models.teacher_invitation import TeacherInvitation
        TeacherInvitation.query.filter_by(target_classroom_id=classroom_id).delete(synchronize_session='fetch')
    except (ImportError, AttributeError):
        pass

    # MixedGroup auto_classroom_id (nullable - mettre à NULL)
    MixedGroup.query.filter_by(auto_classroom_id=classroom_id).update(
        {'auto_classroom_id': None}, synchronize_session='fetch'
    )

    # Préférences de sanctions
    UserSanctionPreferences.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')

    # ClassMaster a ondelete='CASCADE' mais on le supprime explicitement par sécurité
    ClassMaster.query.filter_by(classroom_id=classroom_id).delete(synchronize_session='fetch')


def get_classroom_collaboration_info(classroom_id):
    """
    Vérifie si une classe a des collaborations actives.

    Returns:
        dict: {
            'has_collaborations': bool,
            'teachers': [{'id': int, 'username': str, 'email': str}],
            'count': int,
            'derived_classrooms': [{'id': int, 'name': str, 'subject': str}]
        }
    """
    from models.class_collaboration import SharedClassroom, TeacherCollaboration
    from models.user import User

    shared = SharedClassroom.query.filter_by(original_classroom_id=classroom_id).all()

    if not shared:
        return {
            'has_collaborations': False,
            'teachers': [],
            'count': 0,
            'derived_classrooms': []
        }

    teachers = []
    derived_classrooms = []
    seen_teacher_ids = set()

    for sc in shared:
        collab = sc.collaboration
        if collab and collab.specialized_teacher_id not in seen_teacher_ids:
            teacher = User.query.get(collab.specialized_teacher_id)
            if teacher:
                teachers.append({
                    'id': teacher.id,
                    'username': teacher.username,
                    'email': teacher.email or ''
                })
                seen_teacher_ids.add(collab.specialized_teacher_id)

        derived_classrooms.append({
            'id': sc.derived_classroom_id,
            'name': sc.derived_classroom.name if sc.derived_classroom else '?',
            'subject': sc.subject
        })

    return {
        'has_collaborations': True,
        'teachers': teachers,
        'count': len(teachers),
        'derived_classrooms': derived_classrooms
    }


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
        'collab_classes_deleted': 0,
        'backup_pdfs_generated': 0,
    }

    # Utiliser no_autoflush pour éviter les erreurs de FK pendant le nettoyage
    with db.session.no_autoflush:

        # Collecter les IDs avant de commencer les suppressions
        all_student_ids = [s.id for s in Student.query.filter_by(user_id=user.id).all()]
        classroom_ids = [c.id for c in Classroom.query.filter_by(user_id=user.id).all()]

        # =========================================================
        # 1. Supprimer les données opérationnelles liées à l'année
        # =========================================================

        # Plannings (leçons concrètes avec dates)
        count = Planning.query.filter_by(user_id=user.id).delete()
        summary['plannings_deleted'] = count

        # Présences
        count = Attendance.query.filter_by(user_id=user.id).delete()
        summary['attendance_deleted'] = count

        # Justifications d'absence
        if all_student_ids:
            count = AbsenceJustification.query.filter(
                AbsenceJustification.student_id.in_(all_student_ids)
            ).delete(synchronize_session='fetch')
            summary['justifications_deleted'] = count

        # Évaluations et notes
        if classroom_ids:
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
        if all_student_ids:
            count = StudentSanctionRecord.query.filter(
                StudentSanctionRecord.student_id.in_(all_student_ids)
            ).delete(synchronize_session='fetch')
            summary['sanctions_deleted'] = count

        # Remettre les compteurs de sanctions à 0
        if all_student_ids:
            count = StudentSanctionCount.query.filter(
                StudentSanctionCount.student_id.in_(all_student_ids)
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
                # Vérifier les collaborations et compter les classes dérivées supprimées
                collab_info = get_classroom_collaboration_info(classroom.id)
                if collab_info['has_collaborations']:
                    summary['collab_classes_deleted'] += len(collab_info['derived_classrooms'])

                    # Générer des PDFs de sauvegarde pour les enseignants spécialisés
                    # AVANT la suppression des données
                    try:
                        from services.year_end_archive import generate_and_store_backup_pdfs
                        pdf_count = generate_and_store_backup_pdfs(classroom.id, user)
                        summary['backup_pdfs_generated'] += pdf_count
                    except Exception as e:
                        import logging
                        logging.getLogger(__name__).error(
                            f"Erreur génération PDF backup pour classe {classroom.id}: {e}"
                        )

                # Supprimer TOUTES les dépendances FK (y compris la chaîne de collaboration)
                _delete_classroom_dependencies(classroom.id)

                # Supprimer la classe elle-même
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
                year_diff = new_year_start.year - user.school_year_start.year if user.school_year_start else 1
                if year_diff < 1:
                    year_diff = 1
                h.start_date = h.start_date.replace(year=h.start_date.year + year_diff)
                h.end_date = h.end_date.replace(year=h.end_date.year + year_diff)
        else:
            # Supprimer toutes les vacances
            Holiday.query.filter_by(user_id=user.id).delete()

    # =========================================================
    # 5. Commit (en dehors du no_autoflush)
    # =========================================================
    db.session.commit()

    return summary
