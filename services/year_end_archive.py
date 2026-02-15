"""
Service d'archivage de fin d'année pour les enseignants spécialisés.
Génère des PDFs de sauvegarde avant la suppression des classes partagées.
"""
import uuid
from datetime import datetime
from extensions import db


def get_or_create_archive_folder(user_id):
    """
    Récupère ou crée le dossier "Archives de fin d'année" pour un utilisateur.
    Returns: FileFolder
    """
    from models.file_manager import FileFolder

    folder = FileFolder.query.filter_by(
        user_id=user_id,
        name="Archives de fin d'année",
        parent_id=None
    ).first()

    if not folder:
        folder = FileFolder(
            user_id=user_id,
            name="Archives de fin d'année",
            color='#A855F7',
        )
        db.session.add(folder)
        db.session.flush()  # Pour obtenir l'ID sans commit

    return folder


def _get_students_data_for_archive(classroom_id, teacher_user_id):
    """
    Collecte les données élèves pour le rapport PDF d'archive.
    Similaire à _get_students_data_for_class() dans routes/year_end.py
    mais prend un user_id explicite au lieu de current_user.
    """
    from models.student import Student, Grade
    from models.attendance import Attendance
    from models.evaluation import Evaluation, EvaluationGrade
    from models.student_sanctions import StudentSanctionCount
    from models.lesson_memo import StudentRemark

    students = Student.query.filter_by(
        classroom_id=classroom_id, user_id=teacher_user_id
    ).order_by(Student.last_name, Student.first_name).all()

    students_data = []
    for student in students:
        # Absences et retards
        attendances = Attendance.query.filter_by(
            student_id=student.id, user_id=teacher_user_id
        ).all()
        absences_count = sum(1 for a in attendances if a.status == 'absent')
        late_count = sum(1 for a in attendances if a.status == 'late')
        late_minutes_total = sum(a.late_minutes or 0 for a in attendances if a.status == 'late')

        # Notes (évaluations)
        evals = Evaluation.query.filter_by(classroom_id=classroom_id).all()
        grades_list = []
        total_points = 0
        total_max = 0
        grade_count = 0
        for ev in evals:
            eg = EvaluationGrade.query.filter_by(
                evaluation_id=ev.id, student_id=student.id
            ).first()
            if eg and eg.points is not None:
                grades_list.append({
                    'title': ev.title,
                    'points': eg.points,
                    'max': ev.max_points,
                    'date': ev.date,
                })
                total_points += eg.points
                total_max += (ev.max_points or 0)
                grade_count += 1

        # Notes legacy
        legacy_grades = Grade.query.filter_by(
            student_id=student.id, classroom_id=classroom_id
        ).all()
        for lg in legacy_grades:
            grades_list.append({
                'title': lg.title,
                'points': lg.grade,
                'max': lg.max_grade,
                'date': lg.date,
            })
            if lg.grade is not None and lg.max_grade:
                total_points += lg.grade
                total_max += lg.max_grade
                grade_count += 1

        average = None
        if grade_count > 0 and total_max > 0:
            average = (total_points / total_max) * 6  # Note suisse sur 6

        # Sanctions
        sanction_counts = StudentSanctionCount.query.filter_by(
            student_id=student.id
        ).all()
        sanctions = []
        for sc in sanction_counts:
            if sc.check_count > 0:
                sanctions.append({
                    'name': sc.template.name if sc.template else 'Inconnu',
                    'count': sc.check_count,
                })

        # Remarques
        remarks = StudentRemark.query.filter_by(
            student_id=student.id, user_id=teacher_user_id
        ).order_by(StudentRemark.created_at.desc()).all()
        remarks_list = [{
            'content': r.content,
            'date': r.created_at,
        } for r in remarks]

        students_data.append({
            'student': student,
            'absences_count': absences_count,
            'late_count': late_count,
            'late_minutes_total': late_minutes_total,
            'grades': grades_list,
            'average': average,
            'sanctions': sanctions,
            'remarks': remarks_list,
        })

    return students_data


def generate_and_store_backup_pdfs(classroom_id, master_teacher):
    """
    Génère et stocke des PDFs de sauvegarde pour les enseignants spécialisés
    liés à une classe qui va être supprimée.

    Args:
        classroom_id: ID de la classe originale (maître de classe)
        master_teacher: objet User du maître de classe

    Returns:
        int: nombre de PDFs générés
    """
    from models.class_collaboration import SharedClassroom
    from models.classroom import Classroom
    from models.user import User
    from models.file_manager import UserFile
    from services.year_end_pdf import generate_class_report_pdf

    # Récupérer les classes dérivées partagées
    shared_records = SharedClassroom.query.filter_by(
        original_classroom_id=classroom_id
    ).all()

    if not shared_records:
        return 0

    # Label de l'année scolaire
    year_label = ''
    if master_teacher.school_year_start and master_teacher.school_year_end:
        year_label = f'{master_teacher.school_year_start.year}-{master_teacher.school_year_end.year}'

    pdf_count = 0
    original_classroom = Classroom.query.get(classroom_id)
    original_name = original_classroom.name if original_classroom else 'Classe'

    for shared in shared_records:
        collab = shared.collaboration
        if not collab:
            continue

        specialized_teacher = User.query.get(collab.specialized_teacher_id)
        if not specialized_teacher:
            continue

        derived_classroom = Classroom.query.get(shared.derived_classroom_id)
        if not derived_classroom:
            continue

        # Collecter les données des élèves de la classe dérivée
        students_data = _get_students_data_for_archive(
            derived_classroom.id, specialized_teacher.id
        )

        # Générer le PDF
        teacher_name = specialized_teacher.username or 'Enseignant'
        pdf_bytes = generate_class_report_pdf(
            derived_classroom, students_data, year_label, teacher_name
        )

        if not pdf_bytes:
            continue

        # Créer le dossier d'archives si nécessaire
        archive_folder = get_or_create_archive_folder(specialized_teacher.id)

        # Nom du fichier
        safe_class_name = original_name.replace(' ', '_').replace('/', '-')
        safe_subject = (shared.subject or 'matiere').replace(' ', '_').replace('/', '-')
        filename = f'archive_{safe_class_name}_{safe_subject}_{year_label}.pdf'

        # Stocker comme UserFile
        user_file = UserFile(
            user_id=specialized_teacher.id,
            folder_id=archive_folder.id,
            filename=f'{uuid.uuid4().hex}.pdf',
            original_filename=filename,
            file_type='pdf',
            file_size=len(pdf_bytes),
            mime_type='application/pdf',
            description=f'Sauvegarde de fin d\'année — {original_name} ({shared.subject}) — {year_label}. '
                        f'Classe de {master_teacher.username or "maître de classe"}.',
            file_content=pdf_bytes,
        )
        db.session.add(user_file)
        pdf_count += 1

    return pdf_count
