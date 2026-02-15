"""
Blueprint pour la gestion de fin d'année scolaire.
Wizard multi-étapes : Archivage → Gestion des classes → Nouvelles dates → Confirmation.
"""
from datetime import date, datetime, timedelta
from flask import (
    Blueprint, render_template, request, redirect, url_for,
    flash, session, jsonify, make_response, current_app
)
from flask_login import login_required, current_user
from extensions import db

year_end_bp = Blueprint('year_end', __name__, url_prefix='/year-end')


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _get_user_classrooms():
    """Récupère toutes les classes de l'utilisateur courant."""
    from models.classroom import Classroom
    return Classroom.query.filter_by(user_id=current_user.id).order_by(Classroom.name).all()


def _get_user_mixed_groups():
    """Récupère tous les groupes mixtes de l'utilisateur courant."""
    from models.mixed_group import MixedGroup
    return MixedGroup.query.filter_by(teacher_id=current_user.id, is_active=True).order_by(MixedGroup.name).all()


def _get_students_data_for_class(classroom_id):
    """
    Collecte toutes les données d'un élève pour le rapport PDF.
    Réutilise les mêmes données que la page manage-classes.
    """
    from models.student import Student, Grade
    from models.attendance import Attendance
    from models.evaluation import Evaluation, EvaluationGrade
    from models.student_sanctions import StudentSanctionCount
    from models.lesson_memo import StudentRemark

    students = Student.query.filter_by(
        classroom_id=classroom_id, user_id=current_user.id
    ).order_by(Student.last_name, Student.first_name).all()

    students_data = []
    for student in students:
        # Absences et retards
        attendances = Attendance.query.filter_by(
            student_id=student.id, user_id=current_user.id
        ).all()
        absences_count = sum(1 for a in attendances if a.status == 'absent')
        late_count = sum(1 for a in attendances if a.status == 'late')
        late_minutes_total = sum(a.late_minutes or 0 for a in attendances if a.status == 'late')

        # Notes (évaluations modernes)
        grades_list = []
        evals = Evaluation.query.filter_by(classroom_id=classroom_id).all()
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
        remarks_list = StudentRemark.query.filter_by(
            student_id=student.id, user_id=current_user.id
        ).order_by(StudentRemark.source_date.desc()).all()
        remarks = []
        for r in remarks_list:
            remarks.append({
                'content': r.content,
                'date': r.source_date if hasattr(r, 'source_date') else None,
            })

        students_data.append({
            'student': student,
            'absences_count': absences_count,
            'late_count': late_count,
            'late_minutes_total': late_minutes_total,
            'grades': grades_list,
            'average': average,
            'sanctions': sanctions,
            'remarks': remarks,
        })

    return students_data


def _school_year_label(start, end):
    """Renvoie un label comme '2025-2026'."""
    if start and end:
        return f'{start.year}-{end.year}'
    return 'Année inconnue'


# ─────────────────────────────────────────────
# Étape 1 : Archivage
# ─────────────────────────────────────────────

@year_end_bp.route('/')
@login_required
def step1():
    """Étape 1 : vue d'ensemble et archivage PDF."""
    classrooms = _get_user_classrooms()
    mixed_groups = _get_user_mixed_groups()

    # Compter les élèves par classe
    from models.student import Student
    class_info = []
    for c in classrooms:
        count = Student.query.filter_by(classroom_id=c.id, user_id=current_user.id).count()
        class_info.append({'classroom': c, 'student_count': count})

    return render_template('year_end/wizard.html',
        step=1,
        class_info=class_info,
        mixed_groups=mixed_groups,
        school_year=_school_year_label(current_user.school_year_start, current_user.school_year_end),
    )


@year_end_bp.route('/export-class/<int:classroom_id>/pdf')
@login_required
def export_class_pdf(classroom_id):
    """Télécharge le rapport PDF d'une classe."""
    from models.classroom import Classroom
    from services.year_end_pdf import generate_class_report_pdf

    classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first_or_404()
    students_data = _get_students_data_for_class(classroom_id)

    year_label = _school_year_label(current_user.school_year_start, current_user.school_year_end)
    teacher_name = current_user.username or 'Enseignant'

    pdf_bytes = generate_class_report_pdf(classroom, students_data, year_label, teacher_name)

    response = make_response(pdf_bytes)
    safe_name = classroom.name.replace(' ', '_').replace('/', '-')
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename=rapport_{safe_name}_{year_label}.pdf'
    return response


@year_end_bp.route('/export-all/pdf')
@login_required
def export_all_pdf(classroom_id=None):
    """Télécharge un PDF consolidé avec tous les rapports de toutes les classes."""
    from models.classroom import Classroom
    from services.year_end_pdf import generate_class_report_pdf
    import io

    classrooms = _get_user_classrooms()
    year_label = _school_year_label(current_user.school_year_start, current_user.school_year_end)
    teacher_name = current_user.username or 'Enseignant'

    # On génère un PDF par classe et on les combine
    # Pour simplifier, on génère un seul gros PDF avec toutes les classes
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm, mm
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    elements = []

    # Page de garde globale
    elements.append(Spacer(1, 5*cm))
    elements.append(Paragraph(
        f'<font size="20"><b>Rapports de fin d\'année</b></font>',
        styles['Title']
    ))
    elements.append(Spacer(1, 1*cm))
    elements.append(Paragraph(f'Année scolaire : {year_label}', styles['Normal']))
    elements.append(Paragraph(f'Enseignant : {teacher_name}', styles['Normal']))
    elements.append(Paragraph(
        f'Généré le : {datetime.now().strftime("%d/%m/%Y à %H:%M")}',
        styles['Normal']
    ))
    elements.append(Paragraph(f'Nombre de classes : {len(classrooms)}', styles['Normal']))

    for classroom in classrooms:
        elements.append(PageBreak())
        students_data = _get_students_data_for_class(classroom.id)

        # En-tête de la classe
        elements.append(Paragraph(
            f'<font size="16" color="#4F46E5"><b>{classroom.name}</b></font>',
            styles['Title']
        ))
        if classroom.subject:
            elements.append(Paragraph(f'Matière : {classroom.subject}', styles['Normal']))
        elements.append(Paragraph(f'Nombre d\'élèves : {len(students_data)}', styles['Normal']))
        elements.append(Spacer(1, 5*mm))

        # Tableau récapitulatif de la classe
        from reportlab.platypus import Table, TableStyle, HRFlowable
        from reportlab.lib.styles import ParagraphStyle

        if students_data:
            summary_data = [['Élève', 'Abs.', 'Ret.', 'Moy.']]
            for sd in students_data:
                s = sd['student']
                name = f'{s.first_name} {s.last_name}'
                avg = f'{sd["average"]:.1f}' if sd.get('average') is not None else '—'
                summary_data.append([name, str(sd['absences_count']), str(sd['late_count']), avg])

            t = Table(summary_data, colWidths=[8*cm, 2.5*cm, 2.5*cm, 2.5*cm])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(t)

        # Fiches individuelles
        for sd in students_data:
            elements.append(PageBreak())
            s = sd['student']
            elements.append(Paragraph(
                f'<font size="13" color="#4F46E5"><b>{s.first_name} {s.last_name}</b></font> — {classroom.name}',
                styles['Normal']
            ))
            elements.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#E5E7EB'), spaceAfter=3*mm))

            # Présences
            elements.append(Paragraph(
                f'<b>Présences :</b> Absences: {sd["absences_count"]} | '
                f'Retards: {sd["late_count"]} | Minutes: {sd["late_minutes_total"]}',
                styles['Normal']
            ))
            elements.append(Spacer(1, 2*mm))

            # Notes
            if sd['grades']:
                elements.append(Paragraph('<b>Notes :</b>', styles['Normal']))
                for g in sd['grades']:
                    d = g['date'].strftime('%d/%m') if g.get('date') else ''
                    elements.append(Paragraph(
                        f'  • {g["title"]} : {g["points"]}/{g["max"]} ({d})',
                        styles['Normal']
                    ))
                if sd['average'] is not None:
                    elements.append(Paragraph(
                        f'  <b>Moyenne : {sd["average"]:.1f}/6</b>',
                        styles['Normal']
                    ))
                elements.append(Spacer(1, 2*mm))

            # Sanctions
            if sd['sanctions']:
                elements.append(Paragraph('<b>Sanctions :</b>', styles['Normal']))
                for sanc in sd['sanctions']:
                    elements.append(Paragraph(
                        f'  • {sanc["name"]} : {sanc["count"]} coche(s)',
                        styles['Normal']
                    ))
                elements.append(Spacer(1, 2*mm))

            # Remarques
            if sd['remarks']:
                elements.append(Paragraph('<b>Remarques :</b>', styles['Normal']))
                for rem in sd['remarks']:
                    d = rem['date'].strftime('%d/%m/%Y') if rem.get('date') else ''
                    elements.append(Paragraph(f'  {d} — {rem["content"]}', styles['Normal']))

    if elements:
        doc.build(elements)

    buffer.seek(0)
    response = make_response(buffer.getvalue())
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename=rapports_fin_annee_{year_label}.pdf'
    return response


# ─────────────────────────────────────────────
# Étape 2 : Gestion des classes
# ─────────────────────────────────────────────

@year_end_bp.route('/step2', methods=['GET'])
@login_required
def step2():
    """Étape 2 : choix par classe (garder/renommer/supprimer)."""
    from models.student import Student

    classrooms = _get_user_classrooms()
    mixed_groups = _get_user_mixed_groups()

    class_info = []
    from services.year_end_cleanup import get_classroom_collaboration_info
    for c in classrooms:
        count = Student.query.filter_by(classroom_id=c.id, user_id=current_user.id).count()
        collab_info = get_classroom_collaboration_info(c.id)
        class_info.append({
            'classroom': c,
            'student_count': count,
            'collaboration': collab_info,
        })

    mg_info = []
    from models.mixed_group import MixedGroupStudent
    for mg in mixed_groups:
        count = MixedGroupStudent.query.filter_by(mixed_group_id=mg.id, is_active=True).count()
        mg_info.append({'mixed_group': mg, 'student_count': count})

    return render_template('year_end/wizard.html',
        step=2,
        class_info=class_info,
        mg_info=mg_info,
    )


@year_end_bp.route('/step2', methods=['POST'])
@login_required
def step2_post():
    """Sauvegarde les choix par classe en session."""
    class_actions = {}

    # Classes normales
    for key in request.form:
        if key.startswith('action_'):
            class_id = key.replace('action_', '')
            action = request.form[key]
            new_name = request.form.get(f'rename_{class_id}', '')
            class_actions[class_id] = {
                'action': action,
                'new_name': new_name.strip() if new_name else '',
            }

    session['year_end_class_actions'] = class_actions
    return redirect(url_for('year_end.step3'))


# ─────────────────────────────────────────────
# Étape 3 : Nouvelles dates
# ─────────────────────────────────────────────

@year_end_bp.route('/step3', methods=['GET'])
@login_required
def step3():
    """Étape 3 : nouvelles dates d'année scolaire."""
    # Proposer des dates par défaut (année suivante)
    default_start = None
    default_end = None
    if current_user.school_year_start and current_user.school_year_end:
        default_start = current_user.school_year_start.replace(year=current_user.school_year_start.year + 1)
        default_end = current_user.school_year_end.replace(year=current_user.school_year_end.year + 1)

    return render_template('year_end/wizard.html',
        step=3,
        default_start=default_start,
        default_end=default_end,
    )


@year_end_bp.route('/step3', methods=['POST'])
@login_required
def step3_post():
    """Sauvegarde les nouvelles dates en session."""
    try:
        new_start = datetime.strptime(request.form['school_year_start'], '%Y-%m-%d').date()
        new_end = datetime.strptime(request.form['school_year_end'], '%Y-%m-%d').date()
    except (KeyError, ValueError):
        flash('Veuillez entrer des dates valides.', 'error')
        return redirect(url_for('year_end.step3'))

    if new_end <= new_start:
        flash('La date de fin doit être après la date de début.', 'error')
        return redirect(url_for('year_end.step3'))

    holiday_action = request.form.get('holiday_action', 'clear')

    session['year_end_dates'] = {
        'start': new_start.isoformat(),
        'end': new_end.isoformat(),
        'holiday_action': holiday_action,
    }

    return redirect(url_for('year_end.confirm'))


# ─────────────────────────────────────────────
# Confirmation et exécution
# ─────────────────────────────────────────────

@year_end_bp.route('/confirm', methods=['GET'])
@login_required
def confirm():
    """Page de confirmation récapitulative."""
    class_actions = session.get('year_end_class_actions', {})
    dates_info = session.get('year_end_dates', {})

    if not dates_info:
        flash('Veuillez d\'abord configurer les nouvelles dates.', 'error')
        return redirect(url_for('year_end.step3'))

    # Construire le récapitulatif
    from models.classroom import Classroom
    from models.mixed_group import MixedGroup

    recap_classes = []
    for key, info in class_actions.items():
        if key.startswith('mg_'):
            mg = MixedGroup.query.get(int(key.replace('mg_', '')))
            name = mg.name if mg else 'Inconnu'
            item_type = 'Groupe mixte'
        else:
            c = Classroom.query.get(int(key))
            name = c.name if c else 'Inconnu'
            item_type = 'Classe'

        recap_classes.append({
            'name': name,
            'type': item_type,
            'action': info['action'],
            'new_name': info.get('new_name', ''),
        })

    new_start = dates_info.get('start', '')
    new_end = dates_info.get('end', '')
    holiday_action = dates_info.get('holiday_action', 'clear')

    return render_template('year_end/wizard.html',
        step=4,
        recap_classes=recap_classes,
        new_start=new_start,
        new_end=new_end,
        holiday_action=holiday_action,
    )


@year_end_bp.route('/execute', methods=['POST'])
@login_required
def execute():
    """Exécute le nettoyage de fin d'année."""
    class_actions = session.get('year_end_class_actions', {})
    dates_info = session.get('year_end_dates', {})

    if not dates_info:
        flash('Données de session expirées. Veuillez recommencer.', 'error')
        return redirect(url_for('year_end.step1'))

    # Vérifier la confirmation
    if not request.form.get('confirm_checkbox'):
        flash('Veuillez cocher la case de confirmation.', 'error')
        return redirect(url_for('year_end.confirm'))

    try:
        new_start = date.fromisoformat(dates_info['start'])
        new_end = date.fromisoformat(dates_info['end'])
        holiday_action = dates_info.get('holiday_action', 'clear')

        from services.year_end_cleanup import execute_year_end_cleanup
        summary = execute_year_end_cleanup(
            user=current_user,
            class_actions=class_actions,
            new_year_start=new_start,
            new_year_end=new_end,
            holiday_action=holiday_action,
        )

        # Nettoyer la session
        session.pop('year_end_class_actions', None)
        session.pop('year_end_dates', None)

        flash(
            f'Nouvelle année scolaire configurée avec succès ! '
            f'{summary["plannings_deleted"]} plannings supprimés, '
            f'{summary["attendance_deleted"]} présences supprimées, '
            f'{summary["classes_deleted"]} classes supprimées, '
            f'{summary["classes_renamed"]} classes renommées. '
            f'Vous pouvez maintenant configurer vos nouvelles classes.',
            'success'
        )
        return redirect(url_for('setup.manage_classrooms'))

    except Exception as e:
        db.session.rollback()
        flash(f'Erreur lors du nettoyage : {str(e)}', 'error')
        return redirect(url_for('year_end.confirm'))
