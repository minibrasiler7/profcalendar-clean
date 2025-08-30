@planning_bp.route('/lesson')
@login_required
def lesson_view():
    """Affiche la vue du cours actuel ou du prochain cours - VERSION SIMPLIFIÉE"""
    from models.student import Student
    from models.attendance import Attendance
    from models.class_collaboration import ClassMaster
    from models.user_preferences import UserSanctionPreferences

    current_app.logger.error("=== LESSON VIEW === Using get_current_or_next_lesson()")
    
    # Utiliser la même logique que le dashboard
    lesson, is_current, lesson_date = get_current_or_next_lesson(current_user)
    
    if not lesson:
        current_app.logger.error("=== LESSON VIEW === No lesson found")
        return render_template('planning/lesson_view.html', 
                             lesson=None, 
                             is_current_lesson=False)
    
    current_app.logger.error(f"=== LESSON VIEW === Found lesson: P{lesson.period_number} on {lesson_date}")

    # Obtenir les données nécessaires pour le template
    periods = calculate_periods(current_user)
    
    # Récupérer la planification si elle existe
    planning = None
    if hasattr(lesson, 'classroom_id') and lesson.classroom_id:
        planning = Planning.query.filter_by(
            user_id=current_user.id,
            date=lesson_date,
            period_number=lesson.period_number
        ).first()

    # Déterminer la classroom à utiliser
    lesson_classroom = None
    if hasattr(lesson, 'classroom_id') and lesson.classroom_id:
        lesson_classroom = Classroom.query.get(lesson.classroom_id)
    elif hasattr(lesson, 'mixed_group_id') and lesson.mixed_group_id:
        # Pour les groupes mixtes, utiliser la première classroom du groupe
        mixed_group = MixedGroup.query.get(lesson.mixed_group_id)
        if mixed_group and mixed_group.classrooms:
            lesson_classroom = mixed_group.classrooms[0]

    # Récupérer les élèves
    students = []
    if lesson_classroom:
        students = lesson_classroom.get_students()
        students = sorted(students, key=lambda s: (s.last_name, s.first_name))

    # Récupérer les présences existantes pour ce cours
    attendance_records = {}
    if students:
        attendances = Attendance.query.filter_by(
            date=lesson_date,
            period_number=lesson.period_number
        ).filter(
            Attendance.student_id.in_([s.id for s in students])
        ).all()
        
        for attendance in attendances:
            attendance_records[attendance.student_id] = attendance

    # Calculer le temps restant si cours en cours
    remaining_seconds = 0
    time_remaining = ""

    if is_current:
        # Pour les périodes fusionnées, utiliser l'heure de fin de la dernière période
        end_period_number = getattr(lesson, 'end_period_number', lesson.period_number)
        end_period = next((p for p in periods if p['number'] == end_period_number), None)
        
        if end_period:
            from datetime import datetime
            end_datetime = datetime.combine(lesson_date, end_period['end'])
            now_datetime = current_user.get_local_datetime()  # Utiliser le fuseau horaire local

            if end_datetime > now_datetime:
                remaining_seconds = int((end_datetime - now_datetime.replace(tzinfo=None)).total_seconds())
                hours = remaining_seconds // 3600
                minutes = (remaining_seconds % 3600) // 60
                
                if hours > 0:
                    time_remaining = f"{hours}h{minutes:02d}min"
                else:
                    time_remaining = f"{minutes}min"

    # Template variables minimales
    sanctions_data = {}
    student_accommodations = {}
    imported_sanctions = []
    seating_plan = None
    current_group = None

    # Importer la fonction de rendu des checkboxes
    from utils.jinja_filters import render_planning_with_checkboxes

    return render_template('planning/lesson_view.html',
                         lesson=lesson,
                         planning=planning,
                         is_current=is_current,
                         lesson_date=lesson_date,
                         time_remaining=time_remaining,
                         remaining_seconds=remaining_seconds,
                         students=students,
                         attendance_records=attendance_records,
                         imported_sanctions=imported_sanctions,
                         sanctions_data=sanctions_data,
                         seating_plan=seating_plan,
                         current_group=current_group,
                         lesson_classroom=lesson_classroom,
                         student_accommodations=student_accommodations,
                         accommodation_display=True,
                         render_planning_with_checkboxes=render_planning_with_checkboxes)