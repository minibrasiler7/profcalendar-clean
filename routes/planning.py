from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_required, current_user
from extensions import db
from models.planning import Planning
from models.classroom import Classroom
from models.schedule import Schedule
from models.lesson_memo import LessonMemo, StudentRemark
from models.student import Student
from models.student_info_history import StudentInfoHistory
from datetime import datetime, timedelta
from datetime import date as date_type
import calendar
from routes import teacher_required
import secrets
import string
from models.classroom_access_code import ClassroomAccessCode

planning_bp = Blueprint('planning', __name__, url_prefix='/planning')

@planning_bp.route('/migrate-pinning')
@login_required 
def migrate_pinning():
    """Migration temporaire pour ajouter les colonnes d'épinglage"""
    try:
        # Vérifier que l'utilisateur a les droits (optionnel, à supprimer après migration)
        if current_user.id != 1:  # Adapter selon votre système
            return jsonify({'error': 'Non autorisé'}), 403
            
        # Ajouter les colonnes
        with db.engine.connect() as conn:
            conn.execute(db.text("ALTER TABLE class_files_v2 ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE"))
            conn.execute(db.text("ALTER TABLE class_files_v2 ADD COLUMN IF NOT EXISTS pin_order INTEGER DEFAULT 0"))
            conn.commit()
        
        return jsonify({'success': True, 'message': 'Migration terminée avec succès'})
    except Exception as e:
        current_app.logger.error(f"Erreur migration: {e}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def can_edit_student(student_id, current_user):
    """Vérifier si l'utilisateur peut modifier un élève"""
    from models.student import Student
    from models.class_collaboration import SharedClassroom, TeacherCollaboration
    
    # Récupérer l'élève
    student = Student.query.get(student_id)
    if not student:
        return False, "Élève non trouvé"
    
    classroom = student.classroom
    
    # Si l'utilisateur est propriétaire de la classe, il peut tout faire
    if classroom.user_id == current_user.id:
        return True, None
    
    # Vérifier si c'est un enseignant spécialisé pour cette classe
    shared_classroom = SharedClassroom.query.filter_by(
        derived_classroom_id=classroom.id
    ).first()
    
    if shared_classroom:
        collaboration = TeacherCollaboration.query.filter_by(
            id=shared_classroom.collaboration_id,
            specialized_teacher_id=current_user.id,
            is_active=True
        ).first()
        
        if collaboration:
            # Enseignant spécialisé : ne peut pas modifier, seulement supprimer/ajouter
            return False, "Les enseignants spécialisés ne peuvent pas modifier les élèves, seulement les supprimer ou en ajouter depuis la classe du maître"
    
    return False, "Accès non autorisé"

def can_add_student_to_class(classroom_id, current_user):
    """Vérifier si l'utilisateur peut ajouter un élève à une classe"""
    from models.class_collaboration import SharedClassroom, TeacherCollaboration
    
    classroom = Classroom.query.get(classroom_id)
    if not classroom:
        print(f"DEBUG can_add_student_to_class - Classroom {classroom_id} not found")
        return False, "Classe non trouvée", None
    
    print(f"DEBUG can_add_student_to_class - Classroom owner: {classroom.user_id}, Current user: {current_user.id}")
    
    # Vérifier d'abord si c'est une classe dérivée (enseignant spécialisé)
    shared_classroom = SharedClassroom.query.filter_by(
        derived_classroom_id=classroom.id
    ).first()
    
    print(f"DEBUG can_add_student_to_class - Shared classroom found: {shared_classroom is not None}")
    
    if shared_classroom:
        collaboration = TeacherCollaboration.query.filter_by(
            id=shared_classroom.collaboration_id,
            specialized_teacher_id=current_user.id,
            is_active=True
        ).first()
        
        print(f"DEBUG can_add_student_to_class - Collaboration found: {collaboration is not None}")
        
        if collaboration:
            # C'est un enseignant spécialisé pour cette classe dérivée
            original_classroom = shared_classroom.original_classroom
            print(f"DEBUG can_add_student_to_class - Original classroom: {original_classroom.id if original_classroom else None}")
            return True, None, original_classroom
    
    # Si l'utilisateur est propriétaire de la classe ET ce n'est pas une classe dérivée
    if classroom.user_id == current_user.id:
        print("DEBUG can_add_student_to_class - User is classroom owner (normal class)")
        return True, None, None
    
    print("DEBUG can_add_student_to_class - Access denied")
    return False, "Accès non autorisé", None

def user_can_access_classroom(user_id, classroom_id):
    """Vérifie si un utilisateur peut accéder à une classe (directement ou via collaboration)"""
    print(f"DEBUG user_can_access_classroom: user_id={user_id}, classroom_id={classroom_id}")
    
    classroom = Classroom.query.filter_by(id=classroom_id).first()
    if not classroom:
        print(f"DEBUG user_can_access_classroom: classroom {classroom_id} not found")
        return False
    
    print(f"DEBUG user_can_access_classroom: classroom owner is user {classroom.user_id}")
    
    # 1. Vérifier si c'est sa propre classe
    if classroom.user_id == user_id:
        print(f"DEBUG user_can_access_classroom: user {user_id} owns classroom {classroom_id}")
        return True
    
    # 2. Vérifier si c'est une classe dérivée et l'utilisateur est maître de classe
    from models.class_collaboration import SharedClassroom, ClassMaster, TeacherCollaboration
    shared_classroom = SharedClassroom.query.filter_by(derived_classroom_id=classroom_id).first()
    
    print(f"DEBUG user_can_access_classroom: shared_classroom found: {shared_classroom is not None}")
    
    if shared_classroom:
        # Vérifier si l'utilisateur actuel est maître de la classe originale
        class_master = ClassMaster.query.filter_by(
            classroom_id=shared_classroom.original_classroom_id,
            master_teacher_id=user_id
        ).first()
        
        print(f"DEBUG user_can_access_classroom: class_master found: {class_master is not None}")
        
        if class_master:
            print(f"DEBUG user_can_access_classroom: user {user_id} is master of original classroom")
            return True
    
    # 3. Vérifier si l'utilisateur est enseignant spécialisé avec accès à cette classe originale
    # Chercher si l'utilisateur a une collaboration active donnant accès à la classe originale de classroom_id
    collaborations = TeacherCollaboration.query.filter_by(
        specialized_teacher_id=user_id,
        is_active=True
    ).all()
    
    print(f"DEBUG user_can_access_classroom: found {len(collaborations)} active collaborations for specialized teacher {user_id}")
    
    for collaboration in collaborations:
        shared_classrooms = SharedClassroom.query.filter_by(
            collaboration_id=collaboration.id
        ).all()
        
        for shared_classroom in shared_classrooms:
            print(f"DEBUG user_can_access_classroom: checking shared classroom - original: {shared_classroom.original_classroom_id}, derived: {shared_classroom.derived_classroom_id}")
            if shared_classroom.original_classroom_id == classroom_id:
                print(f"DEBUG user_can_access_classroom: specialized teacher {user_id} has access to original classroom {classroom_id}")
                return True
    
    # 4. Vérifier si l'utilisateur est maître et cette classe appartient à un enseignant spécialisé dans son groupe
    master_classes = ClassMaster.query.filter_by(master_teacher_id=user_id).all()
    
    print(f"DEBUG user_can_access_classroom: user {user_id} is master of {len(master_classes)} classes")
    
    for master_class in master_classes:
        # Vérifier s'il y a des classes dérivées pour ce maître
        collaborations = TeacherCollaboration.query.filter_by(
            master_teacher_id=user_id,
            is_active=True
        ).all()
        
        for collaboration in collaborations:
            shared_classrooms = SharedClassroom.query.filter_by(
                collaboration_id=collaboration.id,
                derived_classroom_id=classroom_id
            ).all()
            
            if shared_classrooms:
                print(f"DEBUG user_can_access_classroom: master {user_id} has access to derived classroom {classroom_id}")
                return True
    
    print(f"DEBUG user_can_access_classroom: user {user_id} has NO access to classroom {classroom_id}")
    return False

def user_can_access_student(user_id, student_id):
    """Vérifie si un utilisateur peut accéder à un élève (directement ou via collaboration)"""
    from models.student import Student
    
    print(f"DEBUG: user_can_access_student called with user_id={user_id}, student_id={student_id}")
    
    # 1. Vérifier si l'élève appartient directement à une classe de l'utilisateur
    student = Student.query.filter_by(id=student_id, user_id=user_id).first()
    if student:
        print(f"DEBUG: Student {student_id} found directly owned by user {user_id}")
        return student
    
    # 2. Vérifier si l'utilisateur peut accéder à l'élève via une collaboration
    from models.class_collaboration import SharedClassroom, TeacherCollaboration, ClassMaster
    
    # Trouver l'élève (peu importe le propriétaire)
    student = Student.query.filter_by(id=student_id).first()
    if not student:
        print(f"DEBUG: Student {student_id} not found at all")
        return None
    
    print(f"DEBUG: Student {student_id} found, belongs to classroom {student.classroom_id}, owned by user {student.user_id}")
    
    # Vérifier si l'utilisateur actuel a accès à la classe de cet élève via collaboration
    print(f"DEBUG: About to check user_can_access_classroom({user_id}, {student.classroom_id})")
    try:
        has_access = user_can_access_classroom(user_id, student.classroom_id)
        print(f"DEBUG: user_can_access_classroom returned: {has_access}")
        if has_access:
            print(f"DEBUG: User {user_id} has access to classroom {student.classroom_id} via collaboration")
            return student
    except Exception as e:
        print(f"DEBUG: ERROR in user_can_access_classroom: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"DEBUG: User {user_id} does NOT have access to student {student_id}")
    return None

@planning_bp.route('/api/day/<date_str>')
@login_required
def get_day_plannings(date_str):
    """API endpoint pour récupérer les planifications d'une journée"""
    try:
        print(f"📅 Requête pour les planifications du {date_str}")
        
        # Parser la date
        planning_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        # Récupérer l'ID de la classe depuis les paramètres de requête
        classroom_id = request.args.get('classroom_id')
        print(f"🏫 Classe ID: {classroom_id}")
        
        # Construire la requête de base
        query = Planning.query.filter_by(
            user_id=current_user.id,
            date=planning_date
        )
        
        # Filtrer par classe ou groupe mixte si spécifié
        if classroom_id and classroom_id != '':
            if classroom_id.startswith('mixed_group_'):
                # Extraire l'ID du groupe mixte : mixed_group_1 -> 1
                mixed_group_id = int(classroom_id.split('_')[2])
                query = query.filter_by(mixed_group_id=mixed_group_id)
            elif classroom_id.startswith('classroom_'):
                # Extraire l'ID de la classe : classroom_21 -> 21
                class_id = int(classroom_id.split('_')[1])
                query = query.filter_by(classroom_id=class_id)
            else:
                # Format ancien (ID numérique direct)
                query = query.filter_by(classroom_id=int(classroom_id))
        
        # Récupérer les planifications
        plannings = query.all()
        print(f"📊 Nombre de planifications trouvées: {len(plannings)}")
        
        # Récupérer les périodes de l'utilisateur
        periods = calculate_periods(current_user)
        periods_dict = {p['number']: p for p in periods}
        
        # Construire la réponse
        result = []
        for planning in plannings:
            period_info = periods_dict.get(planning.period_number)
            
            try:
                # Récupérer les informations de classe ou groupe mixte avec gestion d'erreur
                classroom_name = ''
                classroom_subject = ''
                classroom_color = '#4F46E5'
                
                if planning.classroom:
                    classroom_name = planning.classroom.name or ''
                    classroom_subject = planning.classroom.subject or ''
                    classroom_color = planning.classroom.color or '#4F46E5'
                elif planning.mixed_group:
                    classroom_name = planning.mixed_group.name or ''
                    classroom_subject = planning.mixed_group.subject or ''
                    classroom_color = planning.mixed_group.color or '#4F46E5'
                
                result.append({
                    'id': planning.id,
                    'period': planning.period_number,
                    'period_start': period_info['start'].strftime('%H:%M') if period_info else '',
                    'period_end': period_info['end'].strftime('%H:%M') if period_info else '',
                    'classroom_id': planning.classroom_id,
                    'mixed_group_id': planning.mixed_group_id,
                    'classroom_name': classroom_name,
                    'classroom_subject': classroom_subject,
                    'classroom_color': classroom_color,
                    'title': planning.title or '',
                    'description': planning.description or '',
                    'group_id': planning.group_id,
                    'type': 'mixed_group' if planning.mixed_group_id else 'classroom'
                })
            except Exception as plan_error:
                print(f"Erreur lors du traitement de la planification {planning.id}: {plan_error}")
                # Continuer avec les autres planifications
        
        # Trier par période
        result.sort(key=lambda x: x['period'])
        
        print(f"✅ Réponse construite avec {len(result)} planifications")
        
        return jsonify({
            'success': True,
            'plannings': result
        })
        
    except ValueError as e:
        print(f"❌ Erreur ValueError dans get_day_plannings: {e}")
        return jsonify({
            'success': False,
            'error': 'Format de date invalide'
        }), 400
    except Exception as e:
        print(f"❌ Erreur dans get_day_plannings: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def get_week_dates(week_date):
    """Retourne les dates du lundi au vendredi de la semaine contenant la date donnée"""
    # Trouver le lundi de la semaine
    days_since_monday = week_date.weekday()
    monday = week_date - timedelta(days=days_since_monday)

    # Générer les 5 jours de la semaine
    week_dates = []
    for i in range(5):  # Lundi à Vendredi
        week_dates.append(monday + timedelta(days=i))

    return week_dates

def is_holiday(date_to_check, user):
    """Vérifie si une date est pendant les vacances et retourne le nom si c'est le cas"""
    for holiday in user.holidays.all():
        if holiday.start_date <= date_to_check <= holiday.end_date:
            return holiday.name
    return None

def is_school_year(date, user):
    """Vérifie si une date est dans l'année scolaire"""
    return user.school_year_start <= date <= user.school_year_end

def get_current_or_next_lesson(user):
    """Trouve le cours actuel ou le prochain cours - suit la logique de la vue calendrier"""
    from datetime import time as time_type, datetime
    from utils.vaud_holidays import is_holiday
    from flask import request
    
    # Mode debug : permettre de simuler une heure/date spécifique via paramètres URL
    debug_date = request.args.get('debug_date')  # Format: 2025-09-02
    debug_time = request.args.get('debug_time')  # Format: 08:00 ou 14:30
    
    if debug_date or debug_time:
        current_app.logger.error(f"=== DEBUG MODE === debug_date={debug_date}, debug_time={debug_time}")
        
        # Utiliser la date de debug si fournie, sinon la date actuelle
        if debug_date:
            try:
                current_date = datetime.strptime(debug_date, '%Y-%m-%d').date()
            except ValueError:
                current_app.logger.error(f"=== DEBUG MODE === Invalid debug_date format: {debug_date}")
                current_date = user.get_local_datetime().date()
        else:
            current_date = user.get_local_datetime().date()
        
        # Utiliser l'heure de debug si fournie, sinon l'heure actuelle
        if debug_time:
            try:
                current_time = datetime.strptime(debug_time, '%H:%M').time()
            except ValueError:
                current_app.logger.error(f"=== DEBUG MODE === Invalid debug_time format: {debug_time}")
                current_time = user.get_local_datetime().time()
        else:
            current_time = user.get_local_datetime().time()
        
        weekday = current_date.weekday()
        current_app.logger.error(f"=== DEBUG MODE === Using debug date/time: {current_date} {current_time} (weekday: {weekday})")
    else:
        # Obtenir l'heure actuelle selon le fuseau horaire de l'utilisateur
        now = user.get_local_datetime()
        current_time = now.time()
        current_date = now.date()
        weekday = current_date.weekday()
    
    current_app.logger.error(f"🚀 NEW LESSON DETECTION DEPLOYED 🚀 current_time: {current_time}, date: {current_date}, weekday: {weekday}")

    # Récupérer les périodes du jour
    periods = calculate_periods(user)
    current_app.logger.error(f"=== LESSON DEBUG === Periods found: {len(periods)}")
    
    def is_lesson_period(planning=None, schedule=None):
        """Vérifie si une période représente un cours (pas de type 'Autre')"""
        if planning:
            # Planning avec classroom ou mixed_group
            return planning.classroom_id or planning.mixed_group_id
        elif schedule:
            # Schedule avec classroom ou mixed_group (pas custom_task_title qui est 'Autre')
            return schedule.classroom_id or schedule.mixed_group_id
        return False
    
    def get_lesson_for_period(date, period_number, weekday_num):
        """Récupère une leçon pour une période donnée - suit la logique du calendrier"""
        # 1. Chercher d'abord dans Planning (priorité comme le calendrier)
        planning = Planning.query.filter_by(
            user_id=user.id,
            date=date,
            period_number=period_number
        ).first()
        
        current_app.logger.error(f"=== LESSON DEBUG === P{period_number} on {date}: Planning found: {planning is not None}, classroom_id: {getattr(planning, 'classroom_id', None)}, mixed_group_id: {getattr(planning, 'mixed_group_id', None)}")
        
        if planning and is_lesson_period(planning=planning):
            period_info = next((p for p in periods if p['number'] == period_number), None)
            if not period_info:
                return None
                
            # Vérifier s'il y a des planifications fusionnées avec les périodes suivantes
            end_period = period_number
            end_time = period_info['end']
            is_merged = False
            
            # D'abord vérifier l'horaire type (Schedule) pour les périodes fusionnées
            schedule = Schedule.query.filter_by(
                user_id=user.id,
                weekday=weekday_num,
                period_number=period_number
            ).first()
            
            current_app.logger.error(f"=== MERGED PERIODS DEBUG === P{period_number} weekday {weekday_num}: Schedule found: {schedule is not None}")
            if schedule:
                current_app.logger.error(f"=== MERGED PERIODS DEBUG === Schedule has_merged_next: {getattr(schedule, 'has_merged_next', False)}")
            
            if schedule and hasattr(schedule, 'has_merged_next') and schedule.has_merged_next:
                # Utiliser la logique des Schedule pour les périodes fusionnées
                current_period = period_number + 1
                while current_period <= len(periods):
                    next_schedule = Schedule.query.filter_by(
                        user_id=user.id,
                        weekday=weekday_num,
                        period_number=current_period
                    ).first()
                    
                    if (next_schedule and 
                        hasattr(next_schedule, 'merged_with_previous') and 
                        next_schedule.merged_with_previous):
                        end_period = current_period
                        end_period_info = next((p for p in periods if p['number'] == current_period), None)
                        if end_period_info:
                            end_time = end_period_info['end']
                        is_merged = True
                        
                        if not (hasattr(next_schedule, 'has_merged_next') and next_schedule.has_merged_next):
                            break
                        current_period += 1
                    else:
                        break
            else:
                # Si pas de fusion dans Schedule, chercher les planifications consécutives identiques
                current_period = period_number + 1
                while current_period <= len(periods):
                    next_planning = Planning.query.filter_by(
                        user_id=user.id,
                        date=date,
                        period_number=current_period
                    ).first()
                    
                    # Vérifier si la planification suivante est identique (même classe/groupe mixte)
                    if (next_planning and 
                        next_planning.classroom_id == planning.classroom_id and
                        next_planning.mixed_group_id == planning.mixed_group_id and
                        next_planning.group_id == planning.group_id and
                        is_lesson_period(planning=next_planning)):
                        
                        end_period = current_period
                        end_period_info = next((p for p in periods if p['number'] == current_period), None)
                        if end_period_info:
                            end_time = end_period_info['end']
                        is_merged = True
                        current_period += 1
                    else:
                        break
                
            lesson = type('obj', (object,), {
                'classroom_id': planning.classroom_id,
                'mixed_group_id': planning.mixed_group_id,
                'period_number': planning.period_number,
                'end_period_number': end_period,
                'weekday': weekday_num,
                'start_time': period_info['start'],
                'end_time': end_time,
                'classroom': planning.classroom if planning.classroom_id else None,
                'mixed_group': planning.mixed_group if planning.mixed_group_id else None,
                'is_merged': is_merged
            })()
            return lesson
        
        # 2. Si pas de Planning, chercher dans Schedule (fallback comme le calendrier)
        schedule = Schedule.query.filter_by(
            user_id=user.id,
            weekday=weekday_num,
            period_number=period_number
        ).first()
        
        current_app.logger.error(f"=== LESSON DEBUG === P{period_number} on {date}: Schedule found: {schedule is not None}, classroom_id: {getattr(schedule, 'classroom_id', None)}, mixed_group_id: {getattr(schedule, 'mixed_group_id', None)}")
        
        if schedule and is_lesson_period(schedule=schedule):
            period_info = next((p for p in periods if p['number'] == period_number), None)
            if not period_info:
                return None
            
            # Gestion des périodes fusionnées
            end_period = period_number
            end_time = period_info['end']
            
            # Vérifier si cette période est fusionnée avec les suivantes
            if hasattr(schedule, 'has_merged_next') and schedule.has_merged_next:
                current_period = period_number + 1
                while current_period <= len(periods):
                    next_schedule = Schedule.query.filter_by(
                        user_id=user.id,
                        weekday=weekday_num,
                        period_number=current_period
                    ).first()
                    
                    if (next_schedule and 
                        hasattr(next_schedule, 'merged_with_previous') and 
                        next_schedule.merged_with_previous):
                        end_period = current_period
                        end_period_info = next((p for p in periods if p['number'] == current_period), None)
                        if end_period_info:
                            end_time = end_period_info['end']
                        
                        if not (hasattr(next_schedule, 'has_merged_next') and next_schedule.has_merged_next):
                            break
                        current_period += 1
                    else:
                        break
            
            lesson = type('obj', (object,), {
                'classroom_id': schedule.classroom_id,
                'mixed_group_id': schedule.mixed_group_id,
                'period_number': schedule.period_number,
                'end_period_number': end_period,
                'weekday': schedule.weekday,
                'start_time': period_info['start'],
                'end_time': end_time,
                'classroom': schedule.classroom,
                'mixed_group': schedule.mixed_group,
                'is_merged': schedule.period_number != end_period
            })()
            return lesson
        
        return None

    # 1. Vérifier si on est actuellement en cours
    for period in periods:
        if period['start'] <= current_time <= period['end']:
            lesson = get_lesson_for_period(current_date, period['number'], weekday)
            if lesson:
                current_app.logger.error(f"=== LESSON DEBUG === Current lesson found: P{lesson.period_number}")
                return lesson, True, current_date

    # 2. Si pas de cours actuel, chercher le prochain aujourd'hui
    for period in periods:
        if period['start'] > current_time:
            lesson = get_lesson_for_period(current_date, period['number'], weekday)
            if lesson:
                current_app.logger.error(f"=== LESSON DEBUG === Next lesson today: P{lesson.period_number}")
                return lesson, False, current_date

    # 3. Chercher dans les jours suivants (jusqu'à 2 semaines)
    for days_ahead in range(1, 15):
        search_date = current_date + timedelta(days=days_ahead)
        search_weekday = search_date.weekday()
        
        current_app.logger.error(f"=== LESSON DEBUG === Checking date: {search_date}, weekday: {search_weekday}")
        
        # Ignorer les week-ends et les jours fériés
        if search_weekday >= 5:  # Samedi ou dimanche
            current_app.logger.error(f"=== LESSON DEBUG === Skipping weekend: {search_date}")
            continue
            
        if is_holiday(search_date, user):
            current_app.logger.error(f"=== LESSON DEBUG === Skipping holiday: {search_date}")
            continue
        
        # Pour chaque période du jour, chercher une leçon
        current_app.logger.error(f"=== LESSON DEBUG === Checking all periods for {search_date}")
        for period in periods:
            current_app.logger.error(f"=== LESSON DEBUG === Checking period P{period['number']} on {search_date}")
            lesson = get_lesson_for_period(search_date, period['number'], search_weekday)
            if lesson:
                current_app.logger.error(f"=== LESSON DEBUG === Next lesson found on {search_date}: P{lesson.period_number}")
                return lesson, False, search_date

    return None, False, None

@planning_bp.route('/')
@teacher_required
def dashboard():
    # Vérifier que la configuration de base est complète
    if not current_user.setup_completed:
        if not current_user.school_year_start:
            flash('Veuillez d\'abord compléter la configuration initiale.', 'warning')
            return redirect(url_for('setup.initial_setup'))
        elif current_user.classrooms.filter_by(is_temporary=False).count() == 0:
            flash('Veuillez d\'abord ajouter au moins une classe.', 'warning')
            return redirect(url_for('setup.manage_classrooms'))
        else:
            flash('Veuillez terminer la configuration de base.', 'warning')
            return redirect(url_for('setup.manage_holidays'))

    # Vérifier que l'horaire type est complété
    if not current_user.schedule_completed:
        flash('Veuillez d\'abord créer votre horaire type.', 'warning')
        return redirect(url_for('schedule.weekly_schedule'))

    # Statistiques pour le tableau de bord (uniquement classes non temporaires)
    classrooms_count = current_user.classrooms.filter_by(is_temporary=False).count()
    schedules_count = current_user.schedules.count()

    # Obtenir la semaine actuelle
    today = date_type.today()
    week_dates = get_week_dates(today)

    # Plannings de la semaine
    week_plannings = Planning.query.filter(
        Planning.user_id == current_user.id,
        Planning.date >= week_dates[0],
        Planning.date <= week_dates[4]
    ).options(
        db.joinedload(Planning.classroom),
        db.joinedload(Planning.mixed_group),
        db.joinedload(Planning.group)
    ).all()

    # Chercher le cours actuel ou le prochain
    lesson, is_current_lesson, lesson_date = get_current_or_next_lesson(current_user)

    # Récupérer les invitations reçues (en tant que maître de classe)
    from models.teacher_invitation import TeacherInvitation
    from models.invitation_classroom import InvitationClassroom
    received_invitations = TeacherInvitation.query.filter_by(
        target_master_teacher_id=current_user.id,
        status='pending'
    ).order_by(TeacherInvitation.created_at.desc()).all()
    
    # Enrichir chaque invitation avec ses disciplines
    for invitation in received_invitations:
        invitation.disciplines = InvitationClassroom.query.filter_by(
            invitation_id=invitation.id
        ).all()

    # Récupérer les mémos pour aujourd'hui et cette semaine
    from models.lesson_memo import LessonMemo

    # Mémos pour aujourd'hui
    today_memos = LessonMemo.query.filter(
        LessonMemo.user_id == current_user.id,
        LessonMemo.target_date == today,
        LessonMemo.is_completed == False
    ).options(
        db.joinedload(LessonMemo.classroom),
        db.joinedload(LessonMemo.mixed_group)
    ).order_by(LessonMemo.target_period).all()

    import logging
    logger = logging.getLogger(__name__)
    logger.error(f"DEBUG Dashboard - today: {today}")
    logger.error(f"DEBUG Dashboard - today_memos count: {len(today_memos)}")
    for memo in today_memos:
        logger.error(f"  - Memo ID {memo.id}: target_date={memo.target_date}, content={memo.content[:50]}")

    # Mémos pour cette semaine (sans compter aujourd'hui)
    week_memos = LessonMemo.query.filter(
        LessonMemo.user_id == current_user.id,
        LessonMemo.target_date > today,
        LessonMemo.target_date <= week_dates[4],
        LessonMemo.is_completed == False
    ).options(
        db.joinedload(LessonMemo.classroom),
        db.joinedload(LessonMemo.mixed_group)
    ).order_by(LessonMemo.target_date, LessonMemo.target_period).all()

    logger.error(f"DEBUG Dashboard - week_dates: {week_dates}")
    logger.error(f"DEBUG Dashboard - week_memos count: {len(week_memos)}")
    for memo in week_memos:
        logger.error(f"  - Memo ID {memo.id}: target_date={memo.target_date}, content={memo.content[:50]}")

    # Récupérer la liste des classes pour le filtre
    from models.mixed_group import MixedGroup
    mixed_groups = MixedGroup.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    auto_classroom_ids = {group.auto_classroom_id for group in mixed_groups if group.auto_classroom_id}
    user_classrooms = [c for c in current_user.classrooms.filter_by(is_temporary=False).all() if c.id not in auto_classroom_ids]

    return render_template('planning/dashboard.html',
                         classrooms_count=classrooms_count,
                         schedules_count=schedules_count,
                         week_plannings_count=len(week_plannings),
                         today=today,
                         current_lesson=lesson if is_current_lesson else None,
                         next_lesson=lesson if not is_current_lesson else None,
                         lesson_date=lesson_date,
                         received_invitations=received_invitations,
                         today_memos=today_memos,
                         week_memos=week_memos,
                         user_classrooms=user_classrooms,
                         user_mixed_groups=mixed_groups)

@planning_bp.route('/calendar')
@login_required
def calendar_view():
    # Vérifier la configuration
    if not current_user.setup_completed:
        flash('Veuillez d\'abord compléter la configuration initiale.', 'warning')
        return redirect(url_for('setup.initial_setup'))

    if not current_user.schedule_completed:
        flash('Veuillez d\'abord créer votre horaire type.', 'warning')
        return redirect(url_for('schedule.weekly_schedule'))

    # Obtenir la semaine à afficher
    week_str = request.args.get('week')
    if week_str:
        try:
            current_week = datetime.strptime(week_str, '%Y-%m-%d').date()
        except ValueError:
            current_week = date_type.today()
    else:
        current_week = date_type.today()

    # Obtenir les dates de la semaine
    week_dates = get_week_dates(current_week)

    # Récupérer les groupes mixtes d'abord pour filtrer les classes auto-créées
    from models.mixed_group import MixedGroup
    mixed_groups = MixedGroup.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    
    # IDs des classes auto-créées pour les groupes mixtes (à exclure)
    auto_classroom_ids = {group.auto_classroom_id for group in mixed_groups if group.auto_classroom_id}
    
    # Récupérer les classes non temporaires en excluant celles auto-créées pour les groupes mixtes
    classrooms = [c for c in current_user.classrooms.filter_by(is_temporary=False).all() if c.id not in auto_classroom_ids]

    # Convertir les classrooms en dictionnaires pour JSON
    classrooms_dict = [{
        'id': c.id,
        'name': c.name,
        'subject': c.subject,
        'color': c.color,
        'type': 'classroom'
    } for c in classrooms]
    
    # Ajouter les groupes mixtes
    for group in mixed_groups:
        classrooms_dict.append({
            'id': group.id,
            'name': group.name,
            'subject': group.subject,
            'color': group.color,
            'type': 'mixed_group'
        })

    periods = calculate_periods(current_user)
    schedules = current_user.schedules.all()
    
    # Créer une structure pour tracker les périodes fusionnées par jour
    merged_info = {}
    for schedule in schedules:
        day_key = schedule.weekday
        if day_key not in merged_info:
            merged_info[day_key] = {}
        
        period_num = schedule.period_number
        merged_info[day_key][period_num] = {
            'is_merged': schedule.is_merged,
            'merged_with_previous': schedule.merged_with_previous,
            'has_merged_next': schedule.has_merged_next
        }

    # Convertir les périodes pour JSON (convertir les objets time en chaînes)
    periods_json = []
    for period in periods:
        periods_json.append({
            'number': period['number'],
            'start': period['start'].strftime('%H:%M'),
            'end': period['end'].strftime('%H:%M')
        })

    # Organiser les horaires par jour et période en gérant les périodes fusionnées
    schedule_grid = {}
    merged_periods = set()  # Set pour tracker les périodes fusionnées à ignorer
    
    for schedule in schedules:
        key = f"{schedule.weekday}_{schedule.period_number}"
        
        # Si cette période est fusionnée avec la précédente, on l'ignore dans l'affichage
        if schedule.merged_with_previous:
            merged_periods.add(key)
            continue
        
        schedule_grid[key] = schedule
        
        # Si cette période a une fusion suivante, on l'étend
        if schedule.has_merged_next:
            schedule_grid[key].is_merged_display = True

    # Récupérer les plannings de la semaine (pour toutes les classes et groupes mixtes)
    week_plannings = Planning.query.filter(
        Planning.user_id == current_user.id,
        Planning.date >= week_dates[0],
        Planning.date <= week_dates[4]
    ).options(
        db.joinedload(Planning.classroom),
        db.joinedload(Planning.mixed_group),
        db.joinedload(Planning.group)
    ).all()

    # Organiser les plannings par date et période avec les infos de checklist
    planning_grid = {}
    for planning in week_plannings:
        key = f"{planning.date}_{planning.period_number}"
        planning_grid[key] = planning

        # Ajouter les informations de checklist pour chaque planning
        # Cette information sera accessible dans le template
        planning.checklist_summary = planning.get_checklist_summary()
        planning.checklist_items = planning.get_checklist_items_with_states()

# Dans la fonction generate_annual_calendar, modifier la partie qui organise les plannings
# (vers la ligne 245)

    # Organiser les plannings par date avec infos de checklist
    plannings_by_date = {}
    for planning in week_plannings:
        date_str = planning.date.strftime('%Y-%m-%d')
        if date_str not in plannings_by_date:
            plannings_by_date[date_str] = []

        # Obtenir le résumé des checkboxes
        checklist_summary = planning.get_checklist_summary()

        planning_data = {
            'title': planning.title or f'P{planning.period_number}',
            'period': planning.period_number,
            'checklist_summary': checklist_summary
        }

        plannings_by_date[date_str].append(planning_data)

    # Organiser les plannings par date et période
    planning_grid = {}
    for planning in week_plannings:
        key = f"{planning.date}_{planning.period_number}"
        planning_grid[key] = planning

    # Vérifier si les dates sont en vacances et récupérer les noms
    holidays_info = {}
    for date in week_dates:
        date_str = date.strftime('%Y-%m-%d')
        holiday_name = is_holiday(date, current_user)
        holidays_info[date_str] = {
            'is_holiday': holiday_name is not None,
            'name': holiday_name
        }

    # Générer les données annuelles pour chaque classe et groupe mixte
    annual_data = {}
    for classroom in classrooms:
        annual_data[f"classroom_{classroom.id}"] = generate_annual_calendar(classroom, 'classroom')
    
    for group in mixed_groups:
        annual_data[f"mixed_group_{group.id}"] = generate_annual_calendar(group, 'mixed_group')

    # Sélectionner la première classe par défaut
    default_id = f"classroom_{classrooms[0].id}" if classrooms else (f"mixed_group_{mixed_groups[0].id}" if mixed_groups else None)
    selected_classroom_id = request.args.get('classroom', default_id)

    # Créer une version JSON-serializable de schedule_grid
    schedule_grid_json = {}
    for key, schedule in schedule_grid.items():
        if schedule.classroom_id and schedule.classroom:
            schedule_grid_json[key] = {
                'classroom_id': schedule.classroom_id,
                'weekday': schedule.weekday,
                'period_number': schedule.period_number,
                'classroom_name': schedule.classroom.name,
                'classroom_subject': schedule.classroom.subject,
                'classroom_color': schedule.classroom.color,
                'type': 'classroom'
            }
        elif schedule.classroom_id and not schedule.classroom:
            # Cas d'un planning orphelin - classe supprimée
            print(f"WARNING: Found orphaned schedule {schedule.id} with deleted classroom_id {schedule.classroom_id} in planning calendar")
            continue
        elif schedule.mixed_group_id and schedule.mixed_group:
            schedule_grid_json[key] = {
                'mixed_group_id': schedule.mixed_group_id,
                'weekday': schedule.weekday,
                'period_number': schedule.period_number,
                'classroom_name': schedule.mixed_group.name,
                'classroom_subject': schedule.mixed_group.subject,
                'classroom_color': schedule.mixed_group.color,
                'type': 'mixed_group'
            }
        elif schedule.mixed_group_id and not schedule.mixed_group:
            # Cas d'un planning orphelin - groupe mixte supprimé
            print(f"WARNING: Found orphaned schedule {schedule.id} with deleted mixed_group_id {schedule.mixed_group_id} in planning calendar")
            continue
        elif schedule.custom_task_title:
            schedule_grid_json[key] = {
                'weekday': schedule.weekday,
                'period_number': schedule.period_number,
                'classroom_name': schedule.custom_task_title,
                'classroom_subject': 'Autre',
                'classroom_color': '#6B7280',
                'type': 'custom'
            }

    # Récupérer les mémos pour cette semaine
    from models.lesson_memo import LessonMemo
    week_memos = LessonMemo.query.filter(
        LessonMemo.user_id == current_user.id,
        LessonMemo.target_date >= week_dates[0],
        LessonMemo.target_date <= week_dates[4],
        LessonMemo.is_completed == False
    ).options(
        db.joinedload(LessonMemo.classroom),
        db.joinedload(LessonMemo.mixed_group)
    ).all()

    # Organiser les mémos par date
    memos_by_date = {}
    for memo in week_memos:
        date_str = memo.target_date.strftime('%Y-%m-%d')
        if date_str not in memos_by_date:
            memos_by_date[date_str] = []
        memos_by_date[date_str].append(memo)

    return render_template('planning/calendar_view.html',
                         week_dates=week_dates,
                         current_week=current_week,
                         classrooms=classrooms,
                         classrooms_json=classrooms_dict,
                         periods=periods,  # Utiliser les périodes originales
                         periods_json=periods_json,
                         schedule_grid=schedule_grid,
                         schedule_grid_json=schedule_grid_json,
                         planning_grid=planning_grid,
                         annual_data=annual_data,
                         holidays_info=holidays_info,
                         selected_classroom_id=selected_classroom_id,
                         days=['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
                         today=date_type.today(),
                         merged_info=merged_info,  # Passer les infos de fusion par jour
                         memos_by_date=memos_by_date)  # Ajouter les mémos

def calculate_periods(user):
    """Calcule les périodes en fonction de la configuration de l'utilisateur"""
    from routes.schedule import calculate_periods as calc_periods
    return calc_periods(user)

@planning_bp.route('/check_day_planning/<date>/<classroom_id>')
@login_required
def check_day_planning(date, classroom_id):
    """Vérifie si un jour a des planifications pour la classe sélectionnée"""
    try:
        print(f"🔍 check_day_planning called: date={date}, classroom_id={classroom_id}")
        date_obj = datetime.strptime(date, '%Y-%m-%d').date()
        
        # Parser l'ID de classe
        if classroom_id.startswith('classroom_'):
            actual_classroom_id = int(classroom_id.split('_')[1])
            mixed_group_id = None
            print(f"📚 Checking for classroom: {actual_classroom_id}")
        elif classroom_id.startswith('mixed_group_'):
            actual_classroom_id = None
            mixed_group_id = int(classroom_id.split('_')[2])
            print(f"👥 Checking for mixed group: {mixed_group_id}")
        else:
            print(f"❌ Invalid classroom_id format: {classroom_id}")
            return jsonify({'success': False, 'message': 'Format d\'ID invalide'})
        
        # Vérifier s'il y a des planifications pour cette classe ce jour-là
        query = Planning.query.filter_by(
            user_id=current_user.id,
            date=date_obj
        )
        
        if actual_classroom_id:
            query = query.filter_by(classroom_id=actual_classroom_id)
            print(f"🔎 Querying with classroom_id={actual_classroom_id}")
        elif mixed_group_id:
            query = query.filter_by(mixed_group_id=mixed_group_id)
            print(f"🔎 Querying with mixed_group_id={mixed_group_id}")
        
        # Debug: afficher la requête SQL générée
        print(f"🗄️ SQL Query: {query}")
        
        result = query.first()
        has_planning = result is not None
        
        print(f"📊 Query result: {result}")
        print(f"✅ Has planning: {has_planning}")
        
        return jsonify({
            'success': True,
            'has_planning': has_planning
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        })

def generate_annual_calendar(item, item_type='classroom'):
    """Génère les données du calendrier annuel pour une classe ou un groupe mixte"""
    print(f"🗓️ generate_annual_calendar called for {item_type}: {item.name} (ID: {item.id})")
    
    # Calculer toutes les semaines de l'année scolaire
    start_date = current_user.school_year_start
    end_date = current_user.school_year_end

    # Récupérer toutes les vacances
    holidays = current_user.holidays.all()

    # Récupérer tous les plannings pour cette classe ou ce groupe mixte
    if item_type == 'mixed_group':
        all_plannings = Planning.query.filter_by(
            user_id=current_user.id,
            mixed_group_id=item.id
        ).all()
        print(f"👥 Found {len(all_plannings)} plannings for mixed group {item.id}")
    else:
        all_plannings = Planning.query.filter_by(
            user_id=current_user.id,
            classroom_id=item.id
        ).all()
        print(f"📚 Found {len(all_plannings)} plannings for classroom {item.id}")
    
    # Debug: afficher les plannings trouvés
    for planning in all_plannings:
        print(f"  📝 Planning: {planning.date} P{planning.period_number} - {planning.title}")
    
    # Organiser les plannings par date
    plannings_by_date = {}
    for planning in all_plannings:
        date_str = planning.date.strftime('%Y-%m-%d')
        if date_str not in plannings_by_date:
            plannings_by_date[date_str] = []
        plannings_by_date[date_str].append({
            'title': planning.title or f'P{planning.period_number}',
            'period': planning.period_number
        })
    
    print(f"📅 Plannings by date: {plannings_by_date}")

    weeks = []
    current_date = start_date
    # Aller au lundi de la première semaine
    current_date -= timedelta(days=current_date.weekday())

    week_number = 0  # Compteur de semaines scolaires (hors vacances)

    while current_date <= end_date:
        week_dates = get_week_dates(current_date)

        # Vérifier si cette semaine est pendant les vacances
        week_holiday = None

        # Pour chaque période de vacances
        for holiday in holidays:
            # Compter combien de jours ouvrables (lundi-vendredi) sont en vacances
            days_in_holiday = 0
            for i in range(5):  # Seulement lundi à vendredi
                date_to_check = week_dates[i]
                if holiday.start_date <= date_to_check <= holiday.end_date:
                    days_in_holiday += 1

            # Si au moins 3 jours ouvrables sont en vacances, c'est une semaine de vacances
            if days_in_holiday >= 3:
                week_holiday = holiday.name
                break

        # Incrémenter le compteur seulement si ce n'est pas une semaine de vacances
        if not week_holiday and current_date >= start_date:
            week_number += 1

        week_info = {
            'start_date': week_dates[0],
            'dates': week_dates,
            'has_class': [False] * 5,  # Par défaut, pas de cours
            'plannings': {},  # Plannings de la semaine
            'holidays_by_day': [None] * 5,  # Nom des vacances par jour
            'is_holiday': week_holiday is not None,
            'holiday_name': week_holiday,
            'holiday_name_short': week_holiday.replace("Vacances d'", "Vac.").replace("Vacances de ", "Vac. ").replace("Relâches de ", "Relâches ") if week_holiday else None,
            'week_number': week_number if not week_holiday else None,
            'formatted_date': week_dates[0].strftime('%d/%m')  # Date du lundi
        }

        # Vérifier pour chaque jour si la classe a cours et s'il y a des vacances
        for i in range(5):  # 0 à 4 pour lundi à vendredi
            date_to_check = week_dates[i]
            date_str = date_to_check.strftime('%Y-%m-%d')

            # Vérifier si c'est un jour de vacances
            holiday_name = is_holiday(date_to_check, current_user)
            if holiday_name:
                week_info['holidays_by_day'][i] = holiday_name

            if not is_school_year(date_to_check, current_user) or holiday_name:
                continue

            # Vérifier dans l'horaire type si cette classe/groupe mixte a cours ce jour
            weekday = i
            if item_type == 'mixed_group':
                has_schedule = Schedule.query.filter_by(
                    user_id=current_user.id,
                    mixed_group_id=item.id,
                    weekday=weekday
                ).first() is not None
            else:
                has_schedule = Schedule.query.filter_by(
                    user_id=current_user.id,
                    classroom_id=item.id,
                    weekday=weekday
                ).first() is not None

            # Vérifier s'il y a des planifications spécifiques pour ce jour
            has_planning = date_str in plannings_by_date
            
            # Un jour a des cours s'il y a soit un horaire type, soit une planification spécifique
            week_info['has_class'][i] = has_schedule or has_planning
            
            print(f"    📅 {date_str} (day {i}): has_schedule={has_schedule}, has_planning={has_planning}, final={has_schedule or has_planning}")

            # Ajouter les plannings pour ce jour
            if has_planning:
                week_info['plannings'][date_str] = plannings_by_date[date_str]

        weeks.append(week_info)
        current_date += timedelta(days=7)

    return weeks
@planning_bp.route('/save_planning', methods=['POST'])
@login_required
def save_planning():
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    try:
        date_str = data.get('date')
        period_number = data.get('period_number')
        classroom_id = data.get('classroom_id')
        mixed_group_id = data.get('mixed_group_id')  # Nouveau : gérer les groupes mixtes
        title = data.get('title', '')
        description = data.get('description', '')
        checklist_states = data.get('checklist_states', {})  # Récupérer les états des checkboxes
        group_id = data.get('group_id')  # Récupérer l'ID du groupe

        # Convertir les IDs en entiers
        if classroom_id:
            try:
                classroom_id = int(classroom_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400
        
        if mixed_group_id:
            try:
                mixed_group_id = int(mixed_group_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de groupe mixte invalide'}), 400
        
        if group_id:
            try:
                group_id = int(group_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de groupe invalide'}), 400

        # Convertir la date
        planning_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Vérifier la classe ou le groupe mixte
        if classroom_id:
            classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
            if not classroom:
                return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
        elif mixed_group_id:
            from models.mixed_group import MixedGroup
            mixed_group = MixedGroup.query.filter_by(id=mixed_group_id, teacher_id=current_user.id).first()
            if not mixed_group:
                return jsonify({'success': False, 'message': 'Groupe mixte non trouvé'}), 404

        # Vérifier le groupe si spécifié
        if group_id:
            from models.student_group import StudentGroup
            group = StudentGroup.query.filter_by(
                id=group_id,
                classroom_id=classroom_id,
                user_id=current_user.id
            ).first()
            if not group:
                return jsonify({'success': False, 'message': 'Groupe non trouvé'}), 404

        # Chercher un planning existant
        existing = Planning.query.filter_by(
            user_id=current_user.id,
            date=planning_date,
            period_number=period_number
        ).first()

        if (classroom_id or mixed_group_id or title or description):
            if existing:
                # Mettre à jour
                existing.classroom_id = classroom_id
                existing.mixed_group_id = mixed_group_id
                existing.title = title
                existing.description = description
                existing.group_id = group_id  # Sauvegarder l'ID du groupe
                existing.set_checklist_states(checklist_states)  # Sauvegarder les états des checkboxes
            else:
                # Créer nouveau
                planning = Planning(
                    user_id=current_user.id,
                    classroom_id=classroom_id,
                    mixed_group_id=mixed_group_id,
                    date=planning_date,
                    period_number=period_number,
                    title=title,
                    description=description,
                    group_id=group_id  # Sauvegarder l'ID du groupe
                )
                planning.set_checklist_states(checklist_states)  # Sauvegarder les états des checkboxes
                db.session.add(planning)
        else:
            # Supprimer si vide
            if existing:
                db.session.delete(existing)

        db.session.commit()
        return jsonify({'success': True})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/get_available_periods/<date>')
@login_required
def get_available_periods(date):
    """Retourne les périodes disponibles pour une date avec leur état de planification"""
    try:
        planning_date = datetime.strptime(date, '%Y-%m-%d').date()
        weekday = planning_date.weekday()

        # Récupérer les périodes du jour
        periods = calculate_periods(current_user)

        # Récupérer les plannings existants pour cette date
        existing_plannings = Planning.query.filter_by(
            user_id=current_user.id,
            date=planning_date
        ).all()

        planning_by_period = {p.period_number: p for p in existing_plannings}

        # Récupérer l'horaire type pour ce jour
        schedules = Schedule.query.filter_by(
            user_id=current_user.id,
            weekday=weekday
        ).all()

        schedule_by_period = {s.period_number: s for s in schedules}

        # Construire la réponse
        result_periods = []
        for period in periods:
            period_info = {
                'number': period['number'],
                'start': period['start'].strftime('%H:%M'),
                'end': period['end'].strftime('%H:%M'),
                'hasPlanning': period['number'] in planning_by_period,
                'hasSchedule': period['number'] in schedule_by_period
            }

            if period['number'] in schedule_by_period:
                period_info['defaultClassroom'] = schedule_by_period[period['number']].classroom_id

            result_periods.append(period_info)

        return jsonify({
            'success': True,
            'periods': result_periods
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/test-sanctions')
@login_required
def test_sanctions():
    """Page de test pour le système de sanctions"""
    # Obtenir la leçon actuelle pour les données de contexte
    lesson, is_current_lesson, lesson_date = get_current_or_next_lesson(current_user)
    
    return render_template('planning/test_sanctions.html',
                         lesson=lesson,
                         lesson_date=lesson_date,
                         is_current=is_current_lesson)

@planning_bp.route('/debug/move-files/<int:from_classroom>/<int:to_classroom>')
@login_required
def debug_move_files(from_classroom, to_classroom):
    """Route de debug pour déplacer des fichiers entre classes"""
    try:
        from models.student import LegacyClassFile as ClassFile
        from models.classroom import Classroom
        
        # Vérifier que les deux classes appartiennent à l'utilisateur
        source_classroom = Classroom.query.filter_by(id=from_classroom, user_id=current_user.id).first()
        target_classroom = Classroom.query.filter_by(id=to_classroom, user_id=current_user.id).first()
        
        if not source_classroom or not target_classroom:
            return jsonify({'success': False, 'message': 'Classes introuvables'}), 404
        
        # Récupérer tous les fichiers de la classe source
        files_to_move = ClassFile.query.filter_by(classroom_id=from_classroom).all()
        
        current_app.logger.error(f"=== FILE MOVE DEBUG === Moving {len(files_to_move)} files from {source_classroom.name} to {target_classroom.name}")
        
        # Déplacer chaque fichier
        for file in files_to_move:
            file.classroom_id = to_classroom
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Moved {len(files_to_move)} files from {source_classroom.name} to {target_classroom.name}',
            'moved_count': len(files_to_move)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error moving files: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

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
        
        # Si pas de planification trouvée et que c'est une période fusionnée,
        # chercher dans les périodes précédentes fusionnées
        if not planning and hasattr(lesson, 'is_merged') and lesson.is_merged:
            current_app.logger.error(f"=== MERGED PLANNING DEBUG === No planning for P{lesson.period_number}, searching in merged periods")
            
            # Chercher dans les périodes précédentes jusqu'au début de la fusion
            for check_period in range(lesson.period_number - 1, 0, -1):
                planning = Planning.query.filter_by(
                    user_id=current_user.id,
                    date=lesson_date,
                    period_number=check_period
                ).first()
                
                if planning:
                    current_app.logger.error(f"=== MERGED PLANNING DEBUG === Found planning in P{check_period}, using for P{lesson.period_number}")
                    break
                
                # Vérifier si cette période précédente est aussi fusionnée
                schedule = Schedule.query.filter_by(
                    user_id=current_user.id,
                    weekday=lesson_date.weekday(),
                    period_number=check_period
                ).first()
                
                if not (schedule and hasattr(schedule, 'has_merged_next') and schedule.has_merged_next):
                    # Cette période n'est pas fusionnée, arrêter la recherche
                    break

    # Déterminer la classroom à utiliser
    lesson_classroom = None
    current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === lesson has classroom_id: {hasattr(lesson, 'classroom_id')}, value: {getattr(lesson, 'classroom_id', None)}")
    current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === lesson has mixed_group_id: {hasattr(lesson, 'mixed_group_id')}, value: {getattr(lesson, 'mixed_group_id', None)}")
    
    # Fonction pour trouver une classroom qui a des fichiers
    def find_classroom_with_files():
        from models.class_file import ClassFile
        
        # Obtenir toutes les classes de l'utilisateur qui ont des fichiers
        classrooms_with_files = db.session.query(
            Classroom.id, 
            Classroom.name,
            db.func.count(ClassFile.id).label('file_count')
        ).join(ClassFile, Classroom.id == ClassFile.classroom_id).filter(
            Classroom.user_id == current_user.id
        ).group_by(Classroom.id, Classroom.name).all()
        
        current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === Found {len(classrooms_with_files)} classrooms with files:")
        for classroom_id, name, file_count in classrooms_with_files:
            current_app.logger.error(f"=== LESSON CLASSROOM DEBUG ===   - Classroom {classroom_id} ({name}): {file_count} files")
        
        # Si on trouve des classrooms avec des fichiers, utiliser la première
        if classrooms_with_files:
            classroom_id_with_files = classrooms_with_files[0][0]
            return Classroom.query.get(classroom_id_with_files)
        
        return None
    
    if hasattr(lesson, 'classroom_id') and lesson.classroom_id:
        lesson_classroom = Classroom.query.get(lesson.classroom_id)
        current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === Using classroom {lesson.classroom_id}, found: {lesson_classroom is not None}")
        
        # Vérifier si cette classroom a des fichiers
        from models.class_file import ClassFile
        file_count = ClassFile.query.filter_by(classroom_id=lesson.classroom_id).count()
        current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === Classroom {lesson.classroom_id} has {file_count} files")
        
        # Si cette classroom n'a pas de fichiers, conserver la classe originale
        if file_count == 0:
            current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === No files in lesson classroom {lesson.classroom_id}, but keeping original classroom")
            
    elif hasattr(lesson, 'mixed_group_id') and lesson.mixed_group_id:
        # Pour les groupes mixtes, chercher une classroom avec des fichiers
        from models.mixed_group import MixedGroup
        mixed_group = MixedGroup.query.get(lesson.mixed_group_id)
        current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === Using mixed group {lesson.mixed_group_id}, found: {mixed_group is not None}")
        
        if mixed_group and mixed_group.classrooms:
            # Chercher parmi les classrooms du groupe mixte celle qui a des fichiers
            from models.class_file import ClassFile
            for classroom in mixed_group.classrooms:
                file_count = ClassFile.query.filter_by(classroom_id=classroom.id).count()
                current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === Mixed group classroom {classroom.id} has {file_count} files")
                if file_count > 0:
                    lesson_classroom = classroom
                    current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === Using mixed group classroom with files: {classroom.id}")
                    break
            
            # Si aucune classroom du groupe mixte n'a de fichiers, utiliser la première
            if not lesson_classroom and mixed_group.classrooms:
                lesson_classroom = mixed_group.classrooms[0]
                current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === No files in mixed group classrooms, using first: {lesson_classroom.id}")
                
                # Conserver la première classroom du groupe même sans fichiers
                current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === No files found, keeping first classroom of mixed group")
    
    current_app.logger.error(f"=== LESSON CLASSROOM DEBUG === Final lesson_classroom: {lesson_classroom.id if lesson_classroom else None}")

    # Récupérer les élèves
    students = []
    if planning:
        # Si on a une planification, utiliser sa méthode get_students() pour gérer les groupes
        students = planning.get_students()
    elif lesson_classroom:
        # Sinon, utiliser tous les élèves de la classe
        students = lesson_classroom.get_students()
    
    if students:
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
            from flask import request
            end_datetime = datetime.combine(lesson_date, end_period['end'])
            
            # Mode debug : utiliser l'heure de debug si disponible
            debug_time = request.args.get('debug_time')
            debug_date = request.args.get('debug_date')
            
            if debug_time or debug_date:
                # Utiliser la même logique de debug que get_current_or_next_lesson
                if debug_date:
                    try:
                        debug_date_obj = datetime.strptime(debug_date, '%Y-%m-%d').date()
                    except ValueError:
                        debug_date_obj = lesson_date
                else:
                    debug_date_obj = lesson_date
                
                if debug_time:
                    try:
                        debug_time_obj = datetime.strptime(debug_time, '%H:%M').time()
                        now_datetime = datetime.combine(debug_date_obj, debug_time_obj)
                    except ValueError:
                        now_datetime = current_user.get_local_datetime()
                else:
                    now_datetime = current_user.get_local_datetime()
                    
                current_app.logger.error(f"=== TIMER DEBUG === Using debug now: {now_datetime}, end: {end_datetime}")
            else:
                now_datetime = current_user.get_local_datetime()

            if end_datetime > now_datetime.replace(tzinfo=None):
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

    # Récupérer les sanctions (coches) si classroom disponible
    if lesson_classroom:
        from models.sanctions import SanctionTemplate, ClassroomSanctionImport
        from models.student_sanctions import StudentSanctionCount

        # Vérifier si mode centralisé
        class_master = ClassMaster.query.filter_by(classroom_id=lesson_classroom.id).first()

        if class_master:
            # Mode centralisé : récupérer les sanctions du maître de classe
            imported_sanctions = SanctionTemplate.query.filter_by(
                user_id=class_master.master_teacher_id,
                is_active=True
            ).order_by(SanctionTemplate.name).all()
        else:
            # Mode normal : récupérer les sanctions importées pour cette classe
            imported_sanctions = db.session.query(SanctionTemplate).join(ClassroomSanctionImport).filter(
                ClassroomSanctionImport.classroom_id == lesson_classroom.id,
                ClassroomSanctionImport.is_active == True,
                SanctionTemplate.user_id == current_user.id,
                SanctionTemplate.is_active == True
            ).distinct().order_by(SanctionTemplate.name).all()

        # Créer le tableau des coches pour chaque élève/sanction
        if imported_sanctions and students:
            for student in students:
                sanctions_data[student.id] = {}
                for sanction in imported_sanctions:
                    count = StudentSanctionCount.query.filter_by(
                        student_id=student.id,
                        template_id=sanction.id
                    ).first()
                    sanctions_data[student.id][sanction.id] = count.check_count if count else 0

    # Récupérer le plan de classe si disponible
    if lesson_classroom:
        from models.seating_plan import SeatingPlan
        seating_plan_obj = SeatingPlan.query.filter_by(
            classroom_id=lesson_classroom.id,
            is_active=True
        ).first()

        # Convertir en dictionnaire pour la sérialisation JSON
        if seating_plan_obj:
            import json
            seating_plan = {
                'id': seating_plan_obj.id,
                'name': seating_plan_obj.name,
                'plan_data': json.loads(seating_plan_obj.plan_data) if isinstance(seating_plan_obj.plan_data, str) else seating_plan_obj.plan_data
            }
        else:
            seating_plan = None

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

@planning_bp.route('/get-class-resources/<int:classroom_id>')
@login_required
def get_class_resources(classroom_id):
    """Récupérer les ressources d'une classe avec structure hiérarchique et épinglage"""
    try:
        from models.class_file import ClassFile
        from models.student import LegacyClassFile
        from models.classroom import Classroom
        
        # Vérifier que la classe appartient à l'utilisateur
        classroom = Classroom.query.filter_by(
            id=classroom_id,
            user_id=current_user.id
        ).first()
        
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe introuvable'}), 404
        
        # Récupérer les fichiers des DEUX systèmes
        new_class_files = ClassFile.query.filter_by(classroom_id=classroom_id).all()
        legacy_class_files = LegacyClassFile.query.filter_by(classroom_id=classroom_id).all()
        
        total_files = len(new_class_files) + len(legacy_class_files)
        current_app.logger.error(f"=== CLASS RESOURCES DEBUG === Found {len(new_class_files)} new files + {len(legacy_class_files)} legacy files = {total_files} total for classroom {classroom_id}")
        current_app.logger.error(f"=== CLASS RESOURCES DEBUG === Classroom name: {classroom.name}")
        
        # Organiser les fichiers par structure hiérarchique
        files_data = []
        pinned_files = []
        
        # Traiter les fichiers du nouveau système (sans épinglage)
        for file in new_class_files:
            folder_path = file.folder_path or ''
            
            file_data = {
                'id': file.id,
                'original_filename': file.user_file.original_filename if file.user_file else 'Fichier supprimé',
                'file_type': file.user_file.file_type if file.user_file else 'unknown',
                'file_size': file.user_file.file_size if file.user_file else 0,
                'folder_path': folder_path,
                'is_pinned': file.is_pinned,
                'pin_order': file.pin_order,
                'uploaded_at': file.copied_at.isoformat() if file.copied_at else None
            }
            
            if file.is_pinned:
                pinned_files.append(file_data)
            else:
                files_data.append(file_data)
        
        # Traiter les fichiers du système legacy (avec épinglage)
        for file in legacy_class_files:
            # Extraire le chemin du dossier depuis la description
            folder_path = ''
            if file.description and "Copié dans le dossier:" in file.description:
                folder_path = file.description.split("Copié dans le dossier:")[1].strip()
            
            file_data = {
                'id': file.id,
                'original_filename': file.original_filename,
                'file_type': file.file_type,
                'file_size': file.file_size,
                'folder_path': folder_path,
                'is_pinned': file.is_pinned,
                'pin_order': file.pin_order,
                'uploaded_at': file.uploaded_at.isoformat() if file.uploaded_at else None
            }
            
            if file.is_pinned:
                pinned_files.append(file_data)
            else:
                files_data.append(file_data)
        
        # Trier les fichiers épinglés par pin_order
        pinned_files.sort(key=lambda x: x['pin_order'])
        
        return jsonify({
            'success': True,
            'pinned_files': pinned_files,
            'files': files_data,
            'class_name': classroom.name
        })
        
    except Exception as e:
        print(f"Erreur lors de la récupération des ressources: {e}")
        return jsonify({
            'success': False,
            'message': 'Erreur lors de la récupération des ressources'
        }), 500

@planning_bp.route('/toggle-pin-resource', methods=['POST'])
@login_required
def toggle_pin_resource():
    """Épingler ou désépingler une ressource"""
    try:
        from models.class_file import ClassFile
        from models.classroom import Classroom
        
        data = request.get_json()
        file_id = data.get('file_id')
        
        if not file_id:
            return jsonify({'success': False, 'message': 'ID de fichier manquant'}), 400
        
        # D'abord chercher dans le nouveau système
        new_class_file = db.session.query(ClassFile).join(
            Classroom, ClassFile.classroom_id == Classroom.id
        ).filter(
            ClassFile.id == file_id,
            Classroom.user_id == current_user.id
        ).first()
        
        if new_class_file:
            # Toggle pinning status
            new_class_file.is_pinned = not new_class_file.is_pinned
            
            if new_class_file.is_pinned:
                # Si on épingle, trouver le prochain numéro d'ordre
                max_pin_order = db.session.query(db.func.max(ClassFile.pin_order)).filter(
                    ClassFile.classroom_id == new_class_file.classroom_id,
                    ClassFile.is_pinned == True
                ).scalar() or 0
                new_class_file.pin_order = max_pin_order + 1
                message = f'Fichier "{new_class_file.user_file.original_filename}" épinglé'
            else:
                # Si on désépingle, remettre pin_order à 0
                new_class_file.pin_order = 0
                message = f'Fichier "{new_class_file.user_file.original_filename}" désépinglé'
            
            db.session.commit()
            
            return jsonify({
                'success': True, 
                'message': message,
                'is_pinned': new_class_file.is_pinned,
                'pin_order': new_class_file.pin_order
            })
        
        # Fallback vers le système legacy
        from models.student import LegacyClassFile
        class_file = db.session.query(LegacyClassFile).join(
            Classroom, LegacyClassFile.classroom_id == Classroom.id
        ).filter(
            LegacyClassFile.id == file_id,
            Classroom.user_id == current_user.id
        ).first()
        
        if not class_file:
            return jsonify({'success': False, 'message': 'Fichier introuvable'}), 404
        
        # Basculer l'état d'épinglage
        class_file.is_pinned = not class_file.is_pinned
        
        if class_file.is_pinned:
            # Si on épingle, donner le prochain ordre d'épinglage
            max_pin_order = db.session.query(db.func.max(LegacyClassFile.pin_order)).filter_by(
                classroom_id=class_file.classroom_id,
                is_pinned=True
            ).scalar() or 0
            class_file.pin_order = max_pin_order + 1
        else:
            # Si on désépingle, remettre l'ordre à 0
            class_file.pin_order = 0
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'is_pinned': class_file.is_pinned,
            'message': f'Fichier {"épinglé" if class_file.is_pinned else "désépinglé"}'
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Erreur lors de l'épinglage: {e}")
        return jsonify({'success': False, 'message': 'Erreur lors de l\'épinglage'}), 500

# Ajoutez cette route après la route lesson_view dans votre fichier planning.py

@planning_bp.route('/debug-centralized/<int:classroom_id>')
@login_required
def debug_centralized(classroom_id):
    """Route de debug pour le mode centralisé"""
    from models.user_preferences import UserSanctionPreferences
    from models.class_collaboration import ClassMaster
    from models.sanctions import SanctionTemplate
    
    # 1. Vérifier les préférences de l'utilisateur actuel
    prefs = UserSanctionPreferences.get_or_create_for_user_classroom(current_user.id, classroom_id)
    
    # 2. Vérifier s'il y a un maître de classe (chercher dans tout le groupe)
    class_master = None
    target_classroom = Classroom.query.get(classroom_id)
    group_name = target_classroom.class_group or target_classroom.name
    
    # Chercher le maître de classe dans toutes les classes du même groupe
    group_classrooms = Classroom.query.filter(
        (Classroom.class_group == group_name) if target_classroom.class_group 
        else (Classroom.name == group_name)
    ).all()
    
    for classroom in group_classrooms:
        class_master = ClassMaster.query.filter_by(classroom_id=classroom.id).first()
        if class_master:
            break
    
    # 3. Récupérer les modèles du maître de classe (s'il existe)
    master_templates = []
    if class_master:
        master_templates = SanctionTemplate.query.filter_by(
            user_id=class_master.master_teacher_id,
            is_active=True
        ).all()
    
    # 4. Récupérer les modèles de l'utilisateur actuel
    user_templates = SanctionTemplate.query.filter_by(
        user_id=current_user.id,
        is_active=True
    ).all()
    
    # 5. Tester la méthode is_class_master()
    is_master = prefs.is_class_master()
    can_change = prefs.can_change_mode()
    
    debug_info = {
        'classroom_id': classroom_id,
        'current_user_id': current_user.id,
        'current_user_name': current_user.username,
        'preferences_mode': prefs.display_mode,
        'is_locked': prefs.is_locked,
        'locked_by_user_id': prefs.locked_by_user_id,
        'is_class_master': is_master,
        'can_change_mode': can_change,
        'class_master_exists': class_master is not None,
        'class_master_id': class_master.master_teacher_id if class_master else None,
        'class_master_name': class_master.master_teacher.username if class_master else None,
        'master_templates_count': len(master_templates),
        'master_templates': [{'id': t.id, 'name': t.name} for t in master_templates],
        'user_templates_count': len(user_templates),
        'user_templates': [{'id': t.id, 'name': t.name} for t in user_templates]
    }
    
    return jsonify(debug_info)

@planning_bp.route('/debug-all-preferences')
@login_required
def debug_all_preferences():
    """Debug toutes les préférences de sanctions"""
    from models.user_preferences import UserSanctionPreferences
    
    all_prefs = UserSanctionPreferences.query.all()
    
    preferences_list = []
    for pref in all_prefs:
        preferences_list.append({
            'id': pref.id,
            'user_id': pref.user_id,
            'user_name': pref.user.username,
            'classroom_id': pref.classroom_id,
            'classroom_name': f"{pref.classroom.name} {pref.classroom.subject}",
            'display_mode': pref.display_mode,
            'is_locked': pref.is_locked,
            'locked_by_user_id': pref.locked_by_user_id
        })
    
    return jsonify({
        'total_preferences': len(preferences_list),
        'preferences': preferences_list
    })

@planning_bp.route('/force-centralized/<int:classroom_id>')
@login_required
def force_centralized(classroom_id):
    """Force le mode centralisé pour une classe et tout son groupe"""
    from models.user_preferences import UserSanctionPreferences
    
    try:
        # Récupérer la classe
        classroom = Classroom.query.get(classroom_id)
        if not classroom:
            return jsonify({'error': 'Classe non trouvée'})
        
        group_name = classroom.class_group or classroom.name
        
        # Trouver toutes les classes du groupe
        group_classrooms = Classroom.query.filter(
            (Classroom.class_group == group_name) if classroom.class_group 
            else (Classroom.name == group_name)
        ).all()
        
        updated_count = 0
        
        # Pour chaque classe du groupe
        for group_classroom in group_classrooms:
            # Récupérer tous les utilisateurs qui ont accès à cette classe
            users_with_access = [group_classroom.user_id]  # Propriétaire
            
            # Ajouter les utilisateurs collaborateurs si applicable
            # ... (code de collaboration si nécessaire)
            
            # Mettre à jour/créer les préférences pour chaque utilisateur
            for user_id in users_with_access:
                pref = UserSanctionPreferences.get_or_create_for_user_classroom(user_id, group_classroom.id)
                pref.display_mode = 'centralized'
                updated_count += 1
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Mode centralisé appliqué à {updated_count} préférences',
            'group_classrooms': len(group_classrooms),
            'group_name': group_name
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)})

@planning_bp.route('/manage-classes')
@login_required
def manage_classes():
    """Gestion des classes - élèves, notes, fichiers et sanctions"""
    from models.student import Student, Grade
    from models.sanctions import SanctionTemplate, ClassroomSanctionImport
    from models.student_sanctions import StudentSanctionCount
    from models.user_preferences import UserSanctionPreferences
    from models.class_collaboration import ClassMaster

    # Récupérer le groupe de classe sélectionné
    selected_class_group = request.args.get('classroom', '')
    selected_tab = request.args.get('tab', 'students')  # onglet par défaut : students
    
    # Récupérer les groupes mixtes d'abord pour filtrer les classes auto-créées
    from models.mixed_group import MixedGroup
    mixed_groups = MixedGroup.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    
    # IDs des classes auto-créées pour les groupes mixtes (à exclure)
    auto_classroom_ids = {group.auto_classroom_id for group in mixed_groups if group.auto_classroom_id}
    
    # Récupérer uniquement les classes non temporaires (approuvées) en excluant les classes auto-créées
    all_classrooms = [c for c in current_user.classrooms.filter_by(is_temporary=False).all() if c.id not in auto_classroom_ids]

    if not all_classrooms:
        # Vérifier s'il y a des classes temporaires
        temp_classrooms = current_user.classrooms.filter_by(is_temporary=True).all()
        if temp_classrooms:
            flash('Vos classes sont en attente d\'approbation par le maître de classe. Vous ne pouvez pas encore accéder à la gestion.', 'warning')
        else:
            flash('Veuillez d\'abord créer au moins une classe.', 'warning')
        return redirect(url_for('setup.manage_classrooms'))
    
    # Regrouper les classes par class_group
    from collections import defaultdict
    classrooms_by_group = defaultdict(list)
    for classroom in all_classrooms:
        # Vérifier si c'est une classe auto-créée pour un groupe mixte
        has_mixed_groups = hasattr(classroom, 'mixed_groups_list') and classroom.mixed_groups_list
        if has_mixed_groups:
            # Pour les groupes mixtes, utiliser le nom du groupe mixte avec émoji
            mixed_group = classroom.mixed_groups_list[0]  # Prendre le premier groupe mixte
            group_name = f"🔀 {mixed_group.name}"
        else:
            group_name = classroom.class_group or classroom.name
        classrooms_by_group[group_name].append(classroom)
    
    # Créer la structure de données pour le template
    class_groups = []
    for group_name, group_classrooms in sorted(classrooms_by_group.items()):
        # Trier les classes du groupe par matière
        group_classrooms.sort(key=lambda c: c.subject)
        
        # Vérifier s'il y a un maître de classe dans ce groupe
        has_master = False
        from models.class_collaboration import ClassMaster
        for classroom in group_classrooms:
            if ClassMaster.query.filter_by(classroom_id=classroom.id).first():
                has_master = True
                break
        
        # Créer un objet représentant le groupe
        class_group = {
            'name': group_name,
            'classrooms': group_classrooms,
            'subjects': [c.subject for c in group_classrooms],
            'is_multi_subject': len(group_classrooms) > 1,
            'has_class_master': has_master
        }
        class_groups.append(class_group)
    
    # Ajouter les groupes mixtes comme groupes séparés
    for mixed_group in mixed_groups:
        # Créer un objet "classroom" factice pour le groupe mixte
        mixed_class_group = {
            'name': f"🔀 {mixed_group.name}",
            'classrooms': [mixed_group],  # Le groupe mixte lui-même
            'subjects': [mixed_group.subject],
            'is_multi_subject': False,
            'is_mixed_group': True
        }
        class_groups.append(mixed_class_group)
    
    # Si aucun groupe sélectionné, prendre le premier
    if not selected_class_group or not any(g['name'] == selected_class_group for g in class_groups):
        selected_class_group = class_groups[0]['name'] if class_groups else None
    
    # Trouver le groupe sélectionné
    selected_group = next((g for g in class_groups if g['name'] == selected_class_group), None)
    if not selected_group:
        flash('Groupe de classe non trouvé.', 'error')
        return redirect(url_for('setup.manage_classrooms'))

    # Récupérer temporairement la première classe (sera redéfinie plus tard si mode centralisé)
    primary_classroom = selected_group['classrooms'][0]
    
    # Vérifier si c'est un groupe mixte (nouvelle logique)
    is_mixed_group_class = selected_group.get('is_mixed_group', False)
    
    # Si il y a plusieurs groupes mixtes pour cette classe, sélectionner le bon selon l'URL
    mixed_group = None
    if is_mixed_group_class:
        # Pour les groupes mixtes, primary_classroom EST le groupe mixte
        mixed_group = primary_classroom
        print(f"DEBUG: Selected mixed group {mixed_group.id} ({mixed_group.name})")
    
    # Récupérer temporairement les données de la classe (sera redéfini plus tard si mode centralisé)
    if is_mixed_group_class and mixed_group:
        # Pour les classes mixtes, récupérer les élèves depuis le groupe mixte
        students = mixed_group.get_students()
        print(f"DEBUG: Mixed group class - found {len(students)} students")
    else:
        # NOUVEAU: Vérifier si c'est un groupe de classes dérivées (collaboration)
        from models.class_collaboration import SharedClassroom
        first_classroom = selected_group['classrooms'][0]
        shared_classroom = SharedClassroom.query.filter_by(derived_classroom_id=first_classroom.id).first()
        
        if shared_classroom:
            # C'est un groupe de classes dérivées - récupérer les élèves de la classe originale
            original_classroom = Classroom.query.get(shared_classroom.original_classroom_id)
            if original_classroom:
                students = Student.query.filter_by(classroom_id=original_classroom.id).all()
                print(f"DEBUG: Derived class group - found {len(students)} students from original class {original_classroom.name}")
            else:
                print("DEBUG: ERROR - Original classroom not found")
                students = []
        elif selected_group['is_multi_subject']:
            # Pour les classes normales avec plusieurs disciplines, dédupliquer les élèves
            print(f"DEBUG: Multi-subject group - deduplicating students from {len(selected_group['classrooms'])} classrooms")
            all_students = []
            seen_students = set()  # Pour éviter les doublons basés sur nom/prénom
            
            for classroom in selected_group['classrooms']:
                classroom_students = Student.query.filter_by(classroom_id=classroom.id).all()
                print(f"DEBUG: Classroom {classroom.name} has {len(classroom_students)} students")
                
                for student in classroom_students:
                    # Utiliser nom + prénom comme clé de déduplication
                    student_key = (student.first_name.strip().lower(), student.last_name.strip().lower())
                    if student_key not in seen_students:
                        seen_students.add(student_key)
                        all_students.append(student)
                        print(f"DEBUG: Added student {student.full_name}")
                    else:
                        print(f"DEBUG: Skipped duplicate student {student.full_name}")
            
            students = all_students
            print(f"DEBUG: After deduplication - found {len(students)} unique students")
        else:
            # Pour les classes avec une seule discipline
            students = primary_classroom.get_students()
            print(f"DEBUG: Single subject class - found {len(students)} students")
    
    # Trier les élèves par nom
    students = sorted(students, key=lambda s: (s.last_name, s.first_name))
    
    # Convertir les étudiants en dictionnaires pour le JSON (utilisé en JavaScript)
    students_json = []
    for student in students:
        students_json.append({
            'id': student.id,
            'first_name': student.first_name,
            'last_name': student.last_name,
            'full_name': student.full_name,
            'email': student.email
        })

    # D'abord, déterminer si l'utilisateur est maître de classe pour ce groupe
    temp_is_class_master = False
    for classroom in selected_group['classrooms']:
        master_record = ClassMaster.query.filter_by(classroom_id=classroom.id).first()
        if master_record and master_record.master_teacher_id == current_user.id:
            temp_is_class_master = True
            break
    
    # Récupérer les notes groupées par discipline/matière
    classroom_ids = [c.id for c in selected_group['classrooms']]
    
    # Si l'utilisateur est maître de classe, inclure aussi les notes des enseignants spécialisés
    all_relevant_classrooms = list(selected_group['classrooms'])
    if temp_is_class_master:
        # Récupérer les classes dérivées des enseignants spécialisés
        from models.class_collaboration import TeacherCollaboration, SharedClassroom
        
        # Trouver le maître de classe pour ce groupe
        master_teacher_id = None
        for classroom in selected_group['classrooms']:
            master_record = ClassMaster.query.filter_by(classroom_id=classroom.id).first()
            if master_record:
                master_teacher_id = master_record.master_teacher_id
                break
        
        if master_teacher_id:
            # Récupérer les classes des collaborateurs de ce maître de classe
            collaborations = TeacherCollaboration.query.filter_by(
                master_teacher_id=current_user.id,
                is_active=True
            ).all()
            
            for collaboration in collaborations:
                shared_classrooms = SharedClassroom.query.filter_by(
                    collaboration_id=collaboration.id
                ).all()
                
                for shared_classroom in shared_classrooms:
                    derived_classroom = Classroom.query.get(shared_classroom.derived_classroom_id)
                    if derived_classroom:
                        # Vérifier si cette classe dérivée concerne le même groupe
                        original_classroom = Classroom.query.get(shared_classroom.original_classroom_id)
                        if original_classroom:
                            for group_classroom in selected_group['classrooms']:
                                if (original_classroom.class_group == group_classroom.class_group or
                                    original_classroom.name == group_classroom.name):
                                    all_relevant_classrooms.append(derived_classroom)
                                    classroom_ids.append(derived_classroom.id)
                                    break
    
    recent_grades = Grade.query.filter(Grade.classroom_id.in_(classroom_ids)).order_by(Grade.date.desc()).limit(10).all()
    
    # Grouper les notes par discipline pour l'affichage
    grades_by_subject = {}
    for classroom in all_relevant_classrooms:
        subject = classroom.subject
        grades_for_classroom = Grade.query.filter(Grade.classroom_id == classroom.id).order_by(Grade.date.desc()).all()
        
        # Déterminer si cette classe appartient à un enseignant spécialisé
        is_from_specialized_teacher = classroom not in selected_group['classrooms']
        
        # Marquer chaque note avec des métadonnées
        enriched_grades = []
        for grade in grades_for_classroom:
            enriched_grades.append({
                'grade': grade,
                'is_from_specialized_teacher': is_from_specialized_teacher,
                'teacher_name': classroom.user.username if classroom.user else 'Inconnu',
                'classroom_id': classroom.id
            })
        
        if subject in grades_by_subject:
            # Si la matière existe déjà, ajouter les notes à la liste existante
            grades_by_subject[subject]['enriched_grades'].extend(enriched_grades)
            # Marquer qu'il y a des notes d'enseignants spécialisés
            if is_from_specialized_teacher:
                grades_by_subject[subject]['has_specialized_grades'] = True
            # Maintenir la classroom principale (celle du maître de classe)
            if not is_from_specialized_teacher:
                grades_by_subject[subject]['classroom'] = classroom
        else:
            grades_by_subject[subject] = {
                'classroom': classroom,
                'enriched_grades': enriched_grades,
                'has_specialized_grades': is_from_specialized_teacher,
                'is_editable': not is_from_specialized_teacher,
                # Garder l'ancien format pour la compatibilité
                'grades': [item['grade'] for item in enriched_grades]
            }

    # Convertir les classes en dictionnaires pour le JSON (utilisé en JavaScript)
    # Inclure toutes les classes pertinentes (y compris celles des enseignants spécialisés)
    classrooms_json = []
    for classroom in all_relevant_classrooms:
        # Déterminer si cette classe est éditable (pas d'un enseignant spécialisé)
        is_editable = classroom in selected_group['classrooms']
        
        classrooms_json.append({
            'id': classroom.id,
            'name': classroom.name,
            'subject': classroom.subject,
            'is_editable': is_editable
        })

    # Récupérer les modèles de sanctions importés dans toutes les matières du groupe
    # En mode centralisé, récupérer les modèles du maître de classe pour tous les enseignants
    
    # D'abord, vérifier le mode de sanction pour cette classe
    # On vérifie si le groupe est en mode centralisé en cherchant le maître de classe
    first_classroom = Classroom.query.get(classroom_ids[0])
    group_name = first_classroom.class_group or first_classroom.name
    
    # Trouver s'il y a un maître de classe dans le groupe
    group_classrooms = Classroom.query.filter(
        (Classroom.class_group == group_name) if first_classroom.class_group 
        else (Classroom.name == group_name)
    ).all()
    
    class_master = None
    for classroom in group_classrooms:
        class_master = ClassMaster.query.filter_by(classroom_id=classroom.id).first()
        if class_master:
            break
    
    # Vérifier si le groupe est en mode centralisé (en regardant les préférences du maître)
    is_centralized_mode = False
    if class_master:
        master_prefs = UserSanctionPreferences.query.filter_by(
            user_id=class_master.master_teacher_id,
            classroom_id=class_master.classroom_id
        ).first()
        if master_prefs and master_prefs.display_mode == 'centralized':
            is_centralized_mode = True
    
    print(f"DEBUG: Group {group_name} is in centralized mode: {is_centralized_mode}")
    
    # En mode centralisé, redéfinir primary_classroom et students pour utiliser ceux du maître de classe
    if is_centralized_mode and class_master:
        # Utiliser la classe du maître de classe pour récupérer les élèves
        primary_classroom = Classroom.query.get(class_master.classroom_id)
        print(f"DEBUG: Using master's classroom {class_master.classroom_id} for students in centralized mode")
        
        # Redéfinir les variables qui dépendent de primary_classroom
        is_mixed_group_class = hasattr(primary_classroom, 'mixed_group') and primary_classroom.mixed_group is not None
        mixed_group = primary_classroom.mixed_group if is_mixed_group_class else None
        
        # Récupérer les élèves de la classe du maître
        students = primary_classroom.get_students()
        students = sorted(students, key=lambda s: (s.last_name, s.first_name))
        print(f"DEBUG: Retrieved {len(students)} students from master's classroom")
        
        # Redéfinir students_json avec les nouveaux élèves
        students_json = []
        for student in students:
            students_json.append({
                'id': student.id,
                'first_name': student.first_name,
                'last_name': student.last_name,
                'full_name': student.full_name,
                'email': student.email
            })
    else:
        print(f"DEBUG: Using first classroom of group for students in normal mode")
    
    if is_centralized_mode:
        # En mode centralisé, récupérer TOUS les modèles actifs du maître de classe
        if class_master:
            # Récupérer TOUS les modèles actifs du maître de classe (pas seulement les importés)
            imported_sanctions = SanctionTemplate.query.filter_by(
                user_id=class_master.master_teacher_id,
                is_active=True
            ).order_by(SanctionTemplate.name).all()
            print(f"DEBUG: Found {len(imported_sanctions)} sanctions from master {class_master.master_teacher_id}")
        else:
            imported_sanctions = []
            print("DEBUG: No class master found")
    else:
        # Mode normal : récupérer les modèles de l'utilisateur actuel
        imported_sanctions = db.session.query(SanctionTemplate).join(ClassroomSanctionImport).filter(
            ClassroomSanctionImport.classroom_id.in_(classroom_ids),
            ClassroomSanctionImport.is_active == True,
            SanctionTemplate.user_id == current_user.id,
            SanctionTemplate.is_active == True
        ).distinct().order_by(SanctionTemplate.name).all()

    # Créer le tableau des coches pour chaque élève/sanction
    sanctions_data = {}
    for student in students:
        sanctions_data[student.id] = {}
        for sanction in imported_sanctions:
            # Récupérer ou créer le compteur de coches
            count = StudentSanctionCount.query.filter_by(
                student_id=student.id,
                template_id=sanction.id
            ).first()
            
            if not count:
                # Créer un nouveau compteur à 0
                count = StudentSanctionCount(
                    student_id=student.id,
                    template_id=sanction.id,
                    check_count=0
                )
                db.session.add(count)
            
            sanctions_data[student.id][sanction.id] = count.check_count
    
    # Sauvegarder les nouveaux compteurs créés
    db.session.commit()
    
    # Si le groupe est en mode centralisé, s'assurer que l'utilisateur actuel a les bonnes préférences
    if is_centralized_mode and class_master:
        print(f"DEBUG: Ensuring user {current_user.id} has correct centralized preferences")
        
        # Pour chaque classe du groupe, créer/mettre à jour les préférences de l'utilisateur actuel
        for classroom in group_classrooms:
            user_pref = UserSanctionPreferences.query.filter_by(
                user_id=current_user.id,
                classroom_id=classroom.id
            ).first()
            
            if not user_pref:
                # Créer les préférences manquantes
                print(f"DEBUG: Creating missing preferences for user {current_user.id}, classroom {classroom.id}")
                user_pref = UserSanctionPreferences(
                    user_id=current_user.id,
                    classroom_id=classroom.id,
                    display_mode='centralized',
                    is_locked=(current_user.id != class_master.master_teacher_id),
                    locked_by_user_id=class_master.master_teacher_id if current_user.id != class_master.master_teacher_id else None
                )
                db.session.add(user_pref)
            elif user_pref.display_mode != 'centralized' and current_user.id != class_master.master_teacher_id:
                # Mettre à jour les préférences pour qu'elles soient en mode centralisé
                print(f"DEBUG: Updating preferences for user {current_user.id}, classroom {classroom.id}")
                user_pref.display_mode = 'centralized'
                user_pref.is_locked = True
                user_pref.locked_by_user_id = class_master.master_teacher_id
        
        db.session.commit()
        print("DEBUG: User preferences updated for centralized mode")
    
    # Récupérer les préférences de sanctions pour toutes les classes (pour la couronne dans le sélecteur)
    classroom_preferences = {}
    is_class_master = False
    for group in class_groups:
        if not group.get('is_mixed_group', False):  # Exclure les groupes mixtes
            for classroom in group['classrooms']:
                pref = UserSanctionPreferences.get_or_create_for_user_classroom(current_user.id, classroom.id)
                classroom_preferences[classroom.id] = pref
                
                # Vérifier si l'utilisateur est maître de cette classe
                if pref.is_class_master():
                    is_class_master = True
    # Récupérer les justifications d'absence pour cette classe
    from models.absence_justification import AbsenceJustification
    justifications = AbsenceJustification.query.join(
        Student, AbsenceJustification.student_id == Student.id
    ).filter(
        Student.classroom_id == primary_classroom.id
    ).order_by(AbsenceJustification.created_at.desc()).limit(50).all()

    # Vérifier si l'utilisateur peut éditer les élèves de cette classe
    from models.class_collaboration import SharedClassroom, TeacherCollaboration
    can_edit_students = True  # Par défaut True si c'est sa classe
    
    # Vérifier si c'est une classe dérivée (enseignant spécialisé)
    shared_classroom = SharedClassroom.query.filter_by(
        derived_classroom_id=primary_classroom.id
    ).first()
    
    collaboration = None
    if shared_classroom:
        collaboration = TeacherCollaboration.query.filter_by(
            id=shared_classroom.collaboration_id,
            specialized_teacher_id=current_user.id,
            is_active=True
        ).first()
        
        if collaboration:
            can_edit_students = False  # Enseignant spécialisé ne peut pas éditer

    # Pour les enseignants spécialisés, récupérer les élèves disponibles de la classe du maître
    available_students = []
    is_specialized_teacher = False
    print(f"DEBUG manage_classes - shared_classroom exists: {shared_classroom is not None}")
    print(f"DEBUG manage_classes - collaboration exists: {collaboration is not None}")
    if shared_classroom and collaboration:
        is_specialized_teacher = True
        # Récupérer tous les élèves de la classe originale (maître)
        master_students = Student.query.filter_by(classroom_id=shared_classroom.original_classroom_id).all()
        
        # Récupérer les élèves déjà présents dans la classe dérivée
        current_student_names = {(s.first_name, s.last_name) for s in students}
        
        # Filtrer pour ne garder que ceux qui ne sont pas déjà dans la classe dérivée
        for master_student in master_students:
            if (master_student.first_name, master_student.last_name) not in current_student_names:
                available_students.append({
                    'id': master_student.id,
                    'first_name': master_student.first_name,
                    'last_name': master_student.last_name,
                    'full_name': master_student.full_name,
                    'email': master_student.email
                })

    # Récupérer les données des enseignants de la classe (pour les maîtres de classe et enseignants spécialisés)
    class_teachers = []
    actual_class_master_id = None
    show_teachers_tab = False
    
    # Vérifier si l'utilisateur est soit maître de classe, soit enseignant spécialisé
    if not is_mixed_group_class:
        # Vérifier si l'utilisateur est enseignant spécialisé dans ce groupe
        is_specialized_teacher_in_group = False
        from models.class_collaboration import TeacherCollaboration, SharedClassroom
        
        # Chercher si l'utilisateur actuel a des collaborations en tant qu'enseignant spécialisé
        user_collaborations = TeacherCollaboration.query.filter_by(
            specialized_teacher_id=current_user.id,
            is_active=True
        ).all()
        
        for collaboration in user_collaborations:
            # Vérifier si cette collaboration concerne une classe de ce groupe
            shared_classrooms = SharedClassroom.query.filter_by(
                collaboration_id=collaboration.id
            ).all()
            
            for shared_classroom in shared_classrooms:
                derived_classroom = Classroom.query.get(shared_classroom.derived_classroom_id)
                if derived_classroom:
                    # Vérifier si cette classe dérivée appartient au groupe sélectionné
                    for group_classroom in selected_group['classrooms']:
                        if (derived_classroom.class_group == group_classroom.class_group or 
                            derived_classroom.name == group_classroom.name):
                            is_specialized_teacher_in_group = True
                            break
                if is_specialized_teacher_in_group:
                    break
            if is_specialized_teacher_in_group:
                break
        
        show_teachers_tab = temp_is_class_master or is_specialized_teacher_in_group
        
    if show_teachers_tab:
        # D'abord, trouver qui est vraiment le maître de classe
        from models.class_collaboration import ClassMaster, TeacherCollaboration
        from models.user import User
        
        # Chercher le vrai maître de classe dans le groupe
        for classroom in selected_group['classrooms']:
            master_record = ClassMaster.query.filter_by(classroom_id=classroom.id).first()
            if master_record:
                actual_class_master_id = master_record.master_teacher_id
                break
        
        # Si on n'a pas trouvé de maître depuis le groupe sélectionné mais qu'on est enseignant spécialisé,
        # récupérer le maître depuis nos collaborations
        if not actual_class_master_id and is_specialized_teacher_in_group:
            for collaboration in user_collaborations:
                # Vérifier si cette collaboration concerne ce groupe
                shared_classrooms = SharedClassroom.query.filter_by(
                    collaboration_id=collaboration.id
                ).all()
                
                for shared_classroom in shared_classrooms:
                    derived_classroom = Classroom.query.get(shared_classroom.derived_classroom_id)
                    if derived_classroom:
                        for group_classroom in selected_group['classrooms']:
                            if (derived_classroom.class_group == group_classroom.class_group or 
                                derived_classroom.name == group_classroom.name):
                                actual_class_master_id = collaboration.master_teacher_id
                                break
                    if actual_class_master_id:
                        break
                if actual_class_master_id:
                    break
        
        # Récupérer tous les enseignants qui collaborent dans ce groupe
        teachers_in_group = {}  # teacher_id -> subjects list
        
        # 1. Ajouter le maître de classe s'il existe (même s'il n'a pas de classe directe dans le groupe)
        if actual_class_master_id:
            teachers_in_group[actual_class_master_id] = []
        
        # 2. Ajouter tous les propriétaires de classes du groupe
        for classroom in selected_group['classrooms']:
            teacher_id = classroom.user_id
            if teacher_id not in teachers_in_group:
                teachers_in_group[teacher_id] = []
            teachers_in_group[teacher_id].append(classroom.subject)
        
        # 3. Récupérer les matières du maître de classe depuis ses classes maîtrisées
        if actual_class_master_id:
            master_classrooms = Classroom.query.filter_by(user_id=actual_class_master_id).all()
            for master_classroom in master_classrooms:
                # Vérifier si cette classe du maître fait partie du même groupe
                for group_classroom in selected_group['classrooms']:
                    if (master_classroom.class_group == group_classroom.class_group or 
                        master_classroom.name == group_classroom.name):
                        if master_classroom.subject not in teachers_in_group[actual_class_master_id]:
                            teachers_in_group[actual_class_master_id].append(master_classroom.subject)
        
        # 4. Si on a un maître de classe, ajouter tous ses collaborateurs
        if actual_class_master_id:
            # Récupérer tous les enseignants spécialisés qui collaborent avec le maître
            collaborations = TeacherCollaboration.query.filter_by(
                master_teacher_id=actual_class_master_id,
                is_active=True
            ).all()
            
            for collaboration in collaborations:
                specialized_teacher_id = collaboration.specialized_teacher_id
                if specialized_teacher_id not in teachers_in_group:
                    teachers_in_group[specialized_teacher_id] = []
                
                # Récupérer les matières de l'enseignant spécialisé depuis ses classes dérivées
                from models.class_collaboration import SharedClassroom
                shared_classrooms = SharedClassroom.query.filter_by(
                    collaboration_id=collaboration.id
                ).all()
                
                for shared_classroom in shared_classrooms:
                    # Récupérer la classe dérivée pour obtenir la matière
                    derived_classroom = Classroom.query.get(shared_classroom.derived_classroom_id)
                    if derived_classroom and derived_classroom.subject not in teachers_in_group[specialized_teacher_id]:
                        teachers_in_group[specialized_teacher_id].append(derived_classroom.subject)
        
        # 5. Créer la liste des enseignants avec leurs informations
        for teacher_id, subjects in teachers_in_group.items():
            teacher = User.query.get(teacher_id)
            if teacher:
                # Pour le maître de classe, s'il n'a pas de matières spécifiques, donner un label général
                display_subjects = subjects
                if teacher.id == actual_class_master_id and not subjects:
                    display_subjects = ['Maître de classe']
                elif not subjects:
                    display_subjects = ['Non spécifié']
                
                class_teachers.append({
                    'id': teacher.id,
                    'full_name': teacher.username,  # Utiliser username comme nom complet
                    'email': teacher.email,
                    'subjects': display_subjects,
                    'is_current_user': teacher.id == current_user.id,
                    'is_class_master': teacher.id == actual_class_master_id
                })

    # Déterminer si l'utilisateur peut gérer les codes d'accès
    # Soit il est maître de classe, soit il est créateur et il n'y a pas de maître
    # Note: Les groupes mixtes n'ont jamais de codes d'accès
    from models.class_collaboration import ClassMaster
    
    if is_mixed_group_class:
        # Les groupes mixtes n'ont jamais de codes d'accès
        can_manage_access_codes = False
    else:
        primary_class_master = ClassMaster.query.filter_by(classroom_id=primary_classroom.id).first()
        is_primary_class_master = primary_class_master and primary_class_master.master_teacher_id == current_user.id
        is_creator_no_master = (primary_classroom.user_id == current_user.id and not primary_class_master)
        can_manage_access_codes = is_primary_class_master or is_creator_no_master

    return render_template('planning/manage_classes.html',
                         class_groups=class_groups,
                         selected_group=selected_group,
                         selected_class_group=selected_class_group,
                         primary_classroom=primary_classroom,
                         selected_tab=selected_tab,
                         students=students,
                         students_json=students_json,
                         classrooms_json=classrooms_json,
                         recent_grades=recent_grades,
                         grades_by_subject=grades_by_subject,
                         imported_sanctions=imported_sanctions,
                         sanctions_data=sanctions_data,
                         justifications=justifications,
                         can_edit_students=can_edit_students,
                         available_students=available_students,
                         is_specialized_teacher=is_specialized_teacher,
                         is_mixed_group_class=is_mixed_group_class,
                         mixed_group=mixed_group,
                         classroom_preferences=classroom_preferences,
                         is_class_master=is_class_master,
                         can_manage_access_codes=can_manage_access_codes,
                         show_teachers_tab=show_teachers_tab,
                         class_teachers=class_teachers)


@planning_bp.route('/update-sanction-count', methods=['POST'])
@login_required
def update_sanction_count():
    """Mettre à jour le nombre de coches pour une sanction d'un élève"""
    from models.student_sanctions import StudentSanctionCount
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        student_id = data.get('student_id')
        template_id = data.get('template_id')
        new_count = data.get('count')
        
        if student_id is None or template_id is None or new_count is None:
            return jsonify({'success': False, 'message': 'Données manquantes'}), 400
        
        # Vérifier que l'élève appartient à une classe accessible par l'utilisateur
        from models.student import Student
        from models.user_preferences import UserSanctionPreferences
        from models.class_collaboration import ClassMaster
        
        # D'abord, chercher l'élève dans les classes de l'utilisateur
        student = Student.query.join(Classroom).filter(
            Student.id == student_id,
            Classroom.user_id == current_user.id
        ).first()
        
        # Si pas trouvé, vérifier si l'utilisateur peut accéder à cet élève via le mode centralisé
        if not student:
            # Chercher l'élève dans toutes les classes
            student = Student.query.get(student_id)
            if student and student.classroom:
                # Vérifier si la classe de l'élève fait partie d'un groupe en mode centralisé
                classroom = student.classroom
                group_name = classroom.class_group or classroom.name
                
                # Chercher s'il y a un maître de classe pour ce groupe
                group_classrooms = Classroom.query.filter(
                    (Classroom.class_group == group_name) if classroom.class_group 
                    else (Classroom.name == group_name)
                ).all()
                
                class_master = None
                for gc in group_classrooms:
                    class_master = ClassMaster.query.filter_by(classroom_id=gc.id).first()
                    if class_master:
                        break
                
                # Vérifier si le groupe est en mode centralisé ET si l'utilisateur a des préférences dans ce groupe
                if class_master:
                    user_has_access = False
                    for gc in group_classrooms:
                        user_pref = UserSanctionPreferences.query.filter_by(
                            user_id=current_user.id,
                            classroom_id=gc.id
                        ).first()
                        if user_pref and user_pref.display_mode == 'centralized':
                            user_has_access = True
                            break
                    
                    if not user_has_access:
                        student = None  # L'utilisateur n'a pas accès à cet élève
                else:
                    student = None  # Pas de mode centralisé
            else:
                student = None
        
        if not student:
            return jsonify({'success': False, 'message': 'Élève non trouvé ou accès non autorisé'}), 404
        
        # Récupérer ou créer le compteur
        count_record = StudentSanctionCount.query.filter_by(
            student_id=student_id,
            template_id=template_id
        ).first()
        
        if not count_record:
            count_record = StudentSanctionCount(
                student_id=student_id,
                template_id=template_id,
                check_count=0
            )
            db.session.add(count_record)
        
        # Mettre à jour le compteur
        count_record.check_count = max(0, int(new_count))  # Ne pas aller en dessous de 0
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Compteur mis à jour',
            'new_count': count_record.check_count
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/update-sanction-display-preferences', methods=['POST'])
@login_required
def update_sanction_display_preferences():
    """Mettre à jour les préférences d'affichage des coches avec gestion complexe"""
    from models.user_preferences import UserSanctionPreferences
    from models.student_sanctions import StudentSanctionCount
    from models.student import Student
    
    data = request.get_json()
    display_mode = data.get('display_mode')
    classroom_id = data.get('classroom_id')
    confirmed = data.get('confirmed', False)
    
    # Convertir classroom_id en entier
    if classroom_id:
        try:
            classroom_id = int(classroom_id)
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400
    
    print(f"DEBUG: update_sanction_display_preferences called")
    print(f"DEBUG: user_id={current_user.id}, username={current_user.username}")
    print(f"DEBUG: classroom_id={classroom_id}, display_mode={display_mode}, confirmed={confirmed}")
    
    if display_mode not in ['unified', 'separated', 'centralized']:
        return jsonify({'success': False, 'message': 'Mode d\'affichage invalide'}), 400
    
    if not classroom_id:
        return jsonify({'success': False, 'message': 'ID de classe manquant'}), 400
    
    try:
        # Récupérer les préférences pour cette classe
        preferences = UserSanctionPreferences.get_or_create_for_user_classroom(current_user.id, classroom_id)
        
        print(f"DEBUG: preferences found - mode={preferences.display_mode}, is_locked={preferences.is_locked}")
        print(f"DEBUG: is_class_master={preferences.is_class_master()}, can_change_mode={preferences.can_change_mode()}")
        
        # Vérifier si l'utilisateur peut changer le mode
        if not preferences.can_change_mode():
            locked_by = preferences.locked_by_user.username if preferences.locked_by_user else "le maître de classe"
            print(f"DEBUG: Access denied - locked by {locked_by}")
            return jsonify({
                'success': False, 
                'message': f'Mode verrouillé par {locked_by}. Seul le maître de classe peut modifier ce paramètre.'
            }), 403
        
        # Si mode centralisé, vérifier que l'utilisateur est maître de cette classe
        if display_mode == 'centralized' and not preferences.is_class_master():
            print(f"DEBUG: Access denied - not class master for centralized mode")
            return jsonify({
                'success': False, 
                'message': 'Seuls les maîtres de classe peuvent utiliser le mode centralisé'
            }), 403
        
        # Si pas encore confirmé, demander confirmation (sauf si même mode)
        if not confirmed and preferences.display_mode != display_mode:
            return jsonify({
                'success': False, 
                'requires_confirmation': True,
                'message': 'Changer de mode remettra toutes les coches à zéro. Êtes-vous sûr ?'
            })
        
        # Récupérer l'ancien mode pour gérer les transitions
        old_mode = preferences.display_mode
        
        print(f"DEBUG: Changing mode from {old_mode} to {display_mode}")
        
        # Mettre à jour les préférences de base
        preferences.display_mode = display_mode
        
        print(f"DEBUG: Updated preferences for user {current_user.id}, classroom {classroom_id} to {display_mode}")
        
        db.session.commit()
        
        print(f"DEBUG: Mode updated successfully")
        
        # Gérer les transitions complexes
        if old_mode != display_mode:
            if display_mode == 'centralized':
                # Transition vers mode centralisé
                UserSanctionPreferences.lock_classroom_for_centralized_mode(classroom_id, current_user.id)
                UserSanctionPreferences.copy_sanction_templates_to_all_teachers(classroom_id, current_user.id)
                message = 'Mode centralisé activé. Les modèles de sanctions ont été copiés vers tous les enseignants.'
                
            elif old_mode == 'centralized':
                # Transition depuis mode centralisé
                UserSanctionPreferences.unlock_classroom_from_centralized_mode(classroom_id, current_user.id)
                UserSanctionPreferences.cleanup_after_centralized_mode(classroom_id, current_user.id)
                message = 'Mode centralisé désactivé. Les autres enseignants peuvent maintenant modifier leurs préférences.'
                
            else:
                # Transition entre modes non-centralisés (unified <-> separated)
                # Remettre les coches à zéro pour toutes les classes du même groupe
                
                # Récupérer la classe pour trouver le groupe
                classroom = Classroom.query.get(classroom_id)
                if classroom:
                    # Trouver toutes les classes du même groupe
                    group_name = classroom.class_group or classroom.name
                    group_classrooms = Classroom.query.filter_by(user_id=current_user.id).filter(
                        (Classroom.class_group == group_name) if classroom.class_group 
                        else (Classroom.name == group_name)
                    ).all()
                    
                    group_classroom_ids = [c.id for c in group_classrooms]
                    
                    # Récupérer tous les élèves de toutes les classes du groupe
                    student_ids = [s.id for s in Student.query.filter(Student.classroom_id.in_(group_classroom_ids)).all()]
                    
                    # Récupérer les sanctions importées dans toutes les classes du groupe
                    from models.sanctions import SanctionTemplate, ClassroomSanctionImport
                    
                    # En mode centralisé, utiliser les modèles du maître de classe
                    if display_mode == 'centralized' or old_mode == 'centralized':
                        from models.class_collaboration import ClassMaster
                        
                        class_master = ClassMaster.query.filter_by(classroom_id=classroom_id).first()
                        
                        if class_master:
                            imported_template_ids = db.session.query(SanctionTemplate.id).filter(
                                SanctionTemplate.user_id == class_master.master_teacher_id,
                                SanctionTemplate.is_active == True
                            ).distinct().all()
                        else:
                            imported_template_ids = []
                    else:
                        # Mode normal
                        imported_template_ids = db.session.query(SanctionTemplate.id).join(ClassroomSanctionImport).filter(
                            ClassroomSanctionImport.classroom_id.in_(group_classroom_ids),
                            ClassroomSanctionImport.is_active == True,
                            SanctionTemplate.user_id == current_user.id,
                            SanctionTemplate.is_active == True
                        ).distinct().all()
                    
                    template_ids = [t[0] for t in imported_template_ids]
                    
                    if student_ids and template_ids:
                        # Remettre à zéro tous les compteurs pour ces élèves et ces sanctions
                        StudentSanctionCount.query.filter(
                            StudentSanctionCount.student_id.in_(student_ids),
                            StudentSanctionCount.template_id.in_(template_ids)
                        ).update({'check_count': 0}, synchronize_session=False)
                        db.session.commit()
                
                mode_names = {
                    'unified': 'unifié',
                    'separated': 'séparé par discipline'
                }
                message = f'Mode {mode_names.get(display_mode, display_mode)} activé. Les coches ont été remises à zéro.'
        else:
            message = 'Préférences mises à jour avec succès'
        
        return jsonify({
            'success': True,
            'message': message,
            'new_mode': display_mode
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erreur: {str(e)}'}), 500

@planning_bp.route('/reset-all-sanctions', methods=['POST'])
@login_required
def reset_all_sanctions():
    """Réinitialiser toutes les coches d'une classe à zéro"""
    from models.student_sanctions import StudentSanctionCount
    from models.student import Student
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        try:
            classroom_id = int(data.get('classroom_id')) if data.get('classroom_id') else None
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400
        
        if not classroom_id:
            return jsonify({'success': False, 'message': 'ID de classe manquant'}), 400
        
        # Vérifier que la classe appartient à l'utilisateur
        classroom = Classroom.query.filter_by(
            id=classroom_id,
            user_id=current_user.id
        ).first()
        
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
        
        # Récupérer tous les élèves de la classe
        student_ids = [s.id for s in Student.query.filter_by(classroom_id=classroom_id).all()]
        
        if student_ids:
            # Réinitialiser tous les compteurs à 0 pour cette classe
            StudentSanctionCount.query.filter(
                StudentSanctionCount.student_id.in_(student_ids)
            ).update({'check_count': 0}, synchronize_session=False)
            
            db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Toutes les coches ont été réinitialisées à zéro'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/add-student', methods=['POST'])
@login_required
def add_student():
    """Ajouter un nouvel élève à une classe"""
    from models.student import Student

    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    try:
        try:
            classroom_id = int(data.get('classroom_id')) if data.get('classroom_id') else None
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400
            
        if not classroom_id:
            return jsonify({'success': False, 'message': 'ID de classe manquant'}), 400
        
        # Vérifier les permissions avec la nouvelle fonction
        can_add, error_message, original_classroom = can_add_student_to_class(classroom_id, current_user)
        if not can_add:
            return jsonify({'success': False, 'message': error_message}), 403

        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        email = data.get('email', '').strip() if data.get('email') else None
        parent_email_mother = data.get('parent_email_mother', '').strip() if data.get('parent_email_mother') else None
        parent_email_father = data.get('parent_email_father', '').strip() if data.get('parent_email_father') else None

        # Validation du prénom obligatoire
        if not first_name:
            return jsonify({'success': False, 'message': 'Le prénom est obligatoire'}), 400

        # Si c'est un enseignant spécialisé, l'élève doit exister dans la classe du maître
        if original_classroom:
            # Vérifier que l'élève existe dans la classe originale
            original_student = Student.query.filter_by(
                classroom_id=original_classroom.id,
                first_name=first_name,
                last_name=last_name
            ).first()
            
            if not original_student:
                return jsonify({
                    'success': False,
                    'message': f'L\'élève {first_name} {last_name or ""} n\'existe pas dans la classe du maître de classe. Vous ne pouvez ajouter que des élèves déjà présents dans la classe du maître.'
                }), 400

        # Vérifier si un élève avec ce prénom existe déjà dans la classe
        existing_student = Student.query.filter_by(
            classroom_id=classroom_id,
            first_name=first_name
        ).first()

        # Si un élève avec ce prénom existe et qu'aucun nom n'est fourni
        if existing_student and not last_name:
            return jsonify({
                'success': False,
                'message': f'Un élève nommé {first_name} existe déjà dans cette classe. Veuillez ajouter un nom de famille pour les différencier.'
            }), 400

        # Créer le nouvel élève
        student = Student(
            classroom_id=classroom_id,
            user_id=current_user.id,
            first_name=first_name,
            last_name=last_name,
            email=email,
            parent_email_mother=parent_email_mother,
            parent_email_father=parent_email_father
        )

        db.session.add(student)
        db.session.flush()  # Pour obtenir l'ID de l'élève
        
        # Si c'est un enseignant spécialisé, créer le lien StudentClassroomLink
        if original_classroom:
            from models.class_collaboration import StudentClassroomLink, SharedClassroom
            
            # Récupérer la classe partagée pour obtenir la matière
            shared_classroom = SharedClassroom.query.filter_by(
                derived_classroom_id=classroom_id
            ).first()
            
            if shared_classroom:
                student_link = StudentClassroomLink(
                    student_id=student.id,
                    classroom_id=classroom_id,
                    subject=shared_classroom.subject,
                    is_primary=False,
                    added_by_teacher_id=current_user.id
                )
                db.session.add(student_link)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{student.full_name} a été ajouté avec succès',
            'student': {
                'id': student.id,
                'first_name': student.first_name,
                'last_name': student.last_name,
                'full_name': student.full_name,
                'email': student.email,
                'initials': student.first_name[0] + (student.last_name[0] if student.last_name else '')
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/add-student-from-master', methods=['POST'])
@login_required
def add_student_from_master():
    """Ajouter un élève existant de la classe du maître à la classe dérivée"""
    from models.student import Student
    from models.class_collaboration import StudentClassroomLink, SharedClassroom

    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    try:
        try:
            classroom_id = int(data.get('classroom_id')) if data.get('classroom_id') else None
            master_student_id = int(data.get('master_student_id')) if data.get('master_student_id') else None
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'IDs invalides'}), 400
        
        if not classroom_id or not master_student_id:
            return jsonify({'success': False, 'message': 'Données manquantes'}), 400

        # Debug : afficher les informations
        print(f"DEBUG add_student_from_master - User ID: {current_user.id}")
        print(f"DEBUG add_student_from_master - Classroom ID: {classroom_id}")
        
        # Vérifier les permissions
        can_add, error_message, original_classroom = can_add_student_to_class(classroom_id, current_user)
        print(f"DEBUG add_student_from_master - can_add: {can_add}, error: {error_message}")
        if not can_add:
            return jsonify({'success': False, 'message': error_message}), 403

        if not original_classroom:
            return jsonify({'success': False, 'message': 'Cette fonction est réservée aux enseignants spécialisés'}), 403

        # Récupérer l'élève de la classe du maître
        master_student = Student.query.filter_by(
            id=master_student_id,
            classroom_id=original_classroom.id
        ).first()

        if not master_student:
            return jsonify({'success': False, 'message': 'Élève non trouvé dans la classe du maître'}), 404

        # Vérifier qu'il n'existe pas déjà dans la classe dérivée
        existing_student = Student.query.filter_by(
            classroom_id=classroom_id,
            first_name=master_student.first_name,
            last_name=master_student.last_name
        ).first()

        if existing_student:
            return jsonify({'success': False, 'message': 'Cet élève est déjà dans la classe'}), 400

        # Créer une copie de l'élève pour la classe dérivée
        derived_student = Student(
            classroom_id=classroom_id,
            user_id=current_user.id,
            first_name=master_student.first_name,
            last_name=master_student.last_name,
            email=master_student.email,
            date_of_birth=master_student.date_of_birth,
            parent_email_mother=master_student.parent_email_mother,
            parent_email_father=master_student.parent_email_father,
            additional_info=master_student.additional_info
        )

        db.session.add(derived_student)
        db.session.flush()  # Pour obtenir l'ID de l'élève
        
        # Créer le lien StudentClassroomLink
        shared_classroom = SharedClassroom.query.filter_by(
            derived_classroom_id=classroom_id
        ).first()
        
        if shared_classroom:
            student_link = StudentClassroomLink(
                student_id=derived_student.id,
                classroom_id=classroom_id,
                subject=shared_classroom.subject,
                is_primary=False,
                added_by_teacher_id=current_user.id
            )
            db.session.add(student_link)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{derived_student.full_name} a été ajouté avec succès',
            'student': {
                'id': derived_student.id,
                'first_name': derived_student.first_name,
                'last_name': derived_student.last_name,
                'full_name': derived_student.full_name,
                'email': derived_student.email,
                'initials': derived_student.first_name[0] + (derived_student.last_name[0] if derived_student.last_name else '')
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/delete-student/<int:student_id>', methods=['DELETE'])
@login_required
def delete_student(student_id):
    """Supprimer un élève"""
    from models.student import Student
    from models.class_collaboration import StudentClassroomLink

    try:
        # Vérifier que l'élève existe et appartient à une classe de l'utilisateur
        student = Student.query.join(Classroom).filter(
            Student.id == student_id,
            Classroom.user_id == current_user.id
        ).first()

        if not student:
            return jsonify({'success': False, 'message': 'Élève non trouvé'}), 404

        student_name = student.full_name

        # Supprimer d'abord toutes les données liées à cet élève manuellement
        from models.evaluation import EvaluationGrade
        from models.attendance import Attendance
        from models.student_sanctions import StudentSanctionCount
        from models.absence_justification import AbsenceJustification
        
        # Supprimer tous les liens et données associées
        StudentClassroomLink.query.filter_by(student_id=student_id).delete()
        EvaluationGrade.query.filter_by(student_id=student_id).delete()
        Attendance.query.filter_by(student_id=student_id).delete()
        StudentSanctionCount.query.filter_by(student_id=student_id).delete()
        AbsenceJustification.query.filter_by(student_id=student_id).delete()
        
        # Supprimer les autres relations si elles existent
        try:
            from models.accommodation import Accommodation
            Accommodation.query.filter_by(student_id=student_id).delete()
        except ImportError:
            pass
            
        try:
            from models.parent import ParentStudentConnection
            ParentStudentConnection.query.filter_by(student_id=student_id).delete()
        except ImportError:
            pass
            
        try:
            from models.student_group import StudentGroupMembership
            StudentGroupMembership.query.filter_by(student_id=student_id).delete()
        except ImportError:
            pass

        # Si c'est une classe dérivée, récupérer l'info de l'élève original pour le retour
        from models.class_collaboration import SharedClassroom
        original_student_info = None
        shared_classroom = SharedClassroom.query.filter_by(
            derived_classroom_id=student.classroom_id
        ).first()
        
        if shared_classroom:
            # Chercher l'élève correspondant dans la classe originale
            original_student = Student.query.filter_by(
                classroom_id=shared_classroom.original_classroom_id,
                first_name=student.first_name,
                last_name=student.last_name
            ).first()
            
            if original_student:
                original_student_info = {
                    'id': original_student.id,
                    'first_name': original_student.first_name,
                    'last_name': original_student.last_name,
                    'full_name': original_student.full_name,
                    'email': original_student.email
                }

        # Enfin, supprimer l'élève
        db.session.delete(student)
        db.session.commit()

        response_data = {
            'success': True,
            'message': f'{student_name} a été supprimé avec succès'
        }
        
        # Ajouter l'info de l'élève original si disponible
        if original_student_info:
            response_data['original_student'] = original_student_info

        return jsonify(response_data)

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/generate-class-code/<int:classroom_id>', methods=['POST'])
@login_required
def generate_class_code(classroom_id):
    """Générer un code d'accès pour toute une classe"""
    
    try:
        print(f"Tentative de génération de code pour la classe ID: {classroom_id}")  # Debug
        
        # Vérifier que l'utilisateur a le droit de générer un code pour cette classe
        # Soit il est maître de classe, soit il est le créateur et il n'y a pas de maître
        from models.class_collaboration import ClassMaster
        
        classroom = Classroom.query.get(classroom_id)
        if not classroom:
            print(f"Classe non trouvée pour ID: {classroom_id}")  # Debug
            return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
        
        # Vérifier si l'utilisateur est maître de classe
        class_master = ClassMaster.query.filter_by(classroom_id=classroom_id).first()
        is_class_master = class_master and class_master.master_teacher_id == current_user.id
        
        # Vérifier si l'utilisateur est le créateur et qu'il n'y a pas de maître
        is_creator_no_master = (classroom.user_id == current_user.id and not class_master)
        
        if not (is_class_master or is_creator_no_master):
            print(f"Accès refusé - User {current_user.id} n'est ni maître ni créateur sans maître")  # Debug
            return jsonify({'success': False, 'message': 'Seul le maître de classe peut générer les codes d\'accès'}), 403
        
        print(f"Classe trouvée: {classroom.name}")  # Debug
        
        # Générer un code unique de 6 caractères
        def generate_code():
            return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
        
        # S'assurer que le code est unique
        while True:
            code = generate_code()
            existing = ClassroomAccessCode.query.filter_by(code=code).first()
            if not existing:
                break
        
        # Supprimer l'ancien code s'il existe
        old_code = ClassroomAccessCode.query.filter_by(classroom_id=classroom_id).first()
        if old_code:
            db.session.delete(old_code)
        
        # Créer le nouveau code d'accès
        access_code = ClassroomAccessCode(
            classroom_id=classroom_id,
            code=code,
            created_by_user_id=current_user.id,
            expires_at=datetime.utcnow() + timedelta(days=30)  # Valide pendant 30 jours
        )
        
        db.session.add(access_code)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'code': code,
            'classroom_name': f"{classroom.name} - {classroom.subject}",
            'message': 'Code d\'accès généré avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Erreur lors de la génération du code de classe: {e}")  # Debug
        import traceback
        traceback.print_exc()  # Debug
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/update-student', methods=['PUT'])
@login_required
def update_student():
    """Modifier un élève"""
    from models.student import Student

    data = request.get_json()
    student_id = data.get('student_id')

    if not data or not student_id:
        return jsonify({'success': False, 'message': 'Données invalides'}), 400

    try:
        # Vérifier les permissions avec la nouvelle fonction
        can_edit, error_message = can_edit_student(student_id, current_user)
        if not can_edit:
            return jsonify({'success': False, 'message': error_message}), 403

        # Récupérer l'élève
        student = Student.query.get(student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Élève non trouvé'}), 404

        # Récupérer les nouvelles valeurs
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        email = data.get('email', '').strip() if data.get('email') else None
        parent_email_mother = data.get('parent_email_mother', '').strip() if data.get('parent_email_mother') else None
        parent_email_father = data.get('parent_email_father', '').strip() if data.get('parent_email_father') else None

        # Validation du prénom obligatoire
        if not first_name:
            return jsonify({'success': False, 'message': 'Le prénom est obligatoire'}), 400

        # Si le prénom change, vérifier les doublons
        if first_name != student.first_name:
            existing_student = Student.query.filter(
                Student.classroom_id == student.classroom_id,
                Student.first_name == first_name,
                Student.id != student_id
            ).first()

            if existing_student and not last_name:
                return jsonify({
                    'success': False,
                    'message': f'Un autre élève nommé {first_name} existe déjà dans cette classe. Veuillez ajouter un nom de famille pour les différencier.'
                }), 400

        # Mettre à jour l'élève
        student.first_name = first_name
        student.last_name = last_name
        student.email = email
        student.parent_email_mother = parent_email_mother
        student.parent_email_father = parent_email_father

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{student.full_name} a été modifié avec succès',
            'student': {
                'id': student.id,
                'first_name': student.first_name,
                'last_name': student.last_name,
                'full_name': student.full_name,
                'email': student.email,
                'parent_email_mother': student.parent_email_mother,
                'parent_email_father': student.parent_email_father,
                'initials': student.first_name[0] + (student.last_name[0] if student.last_name else '')
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/get-student/<int:student_id>')
@login_required
def get_student(student_id):
    """Récupérer les informations d'un élève"""
    from models.student import Student

    try:
        # Vérifier que l'élève existe et appartient à une classe de l'utilisateur
        student = Student.query.join(Classroom).filter(
            Student.id == student_id,
            Classroom.user_id == current_user.id
        ).first()

        if not student:
            return jsonify({'success': False, 'message': 'Élève non trouvé'}), 404

        return jsonify({
            'success': True,
            'student': {
                'id': student.id,
                'first_name': student.first_name,
                'last_name': student.last_name or '',
                'email': student.email or '',
                'parent_email_mother': student.parent_email_mother or '',
                'parent_email_father': student.parent_email_father or ''
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/update-attendance', methods=['POST'])
@login_required
def update_attendance():
    """Mettre à jour la présence d'un élève"""
    from models.attendance import Attendance
    from models.student import Student

    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    try:
        student_id = data.get('student_id')
        classroom_id = data.get('classroom_id')
        date_str = data.get('date')
        period_number = data.get('period_number')
        status = data.get('status', 'present')
        late_minutes = data.get('late_minutes')
        
        # Convertir les IDs en entiers
        try:
            if student_id:
                student_id = int(student_id)
            if classroom_id:
                classroom_id = int(classroom_id)
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'IDs invalides'}), 400

        print(f"DEBUG update_attendance: student_id={student_id}, classroom_id={classroom_id}, date={date_str}, period={period_number}")
        
        # Convertir la date
        date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Vérifier que l'élève appartient à une classe de l'utilisateur
        # Peut être soit dans une classe normale, soit dans un groupe mixte
        student = Student.query.join(Classroom).filter(
            Student.id == student_id,
            Classroom.user_id == current_user.id
        ).first()
        
        # Si pas trouvé dans les classes normales, vérifier les groupes mixtes
        mixed_group = None
        if not student:
            print(f"DEBUG: Student {student_id} not found in normal classes, checking mixed groups...")
            from models.mixed_group import MixedGroup, MixedGroupStudent
            # Vérifier si l'élève fait partie d'un groupe mixte créé par l'utilisateur
            mixed_group_student = db.session.query(MixedGroupStudent).join(
                MixedGroup, MixedGroupStudent.mixed_group_id == MixedGroup.id
            ).join(
                Student, MixedGroupStudent.student_id == Student.id
            ).filter(
                Student.id == student_id,
                MixedGroup.teacher_id == current_user.id,
                MixedGroupStudent.is_active == True
            ).first()
            
            print(f"DEBUG: Mixed group student found: {mixed_group_student is not None}")
            
            if mixed_group_student:
                # Récupérer l'objet Student et le groupe mixte
                student = Student.query.get(student_id)
                mixed_group = MixedGroup.query.get(mixed_group_student.mixed_group_id)
                print(f"DEBUG: Retrieved student from mixed group: {student}")
                print(f"DEBUG: Mixed group auto_classroom_id: {mixed_group.auto_classroom_id}")
                
                # Utiliser l'auto_classroom_id du groupe mixte comme classroom_id si pas fourni
                if not classroom_id and mixed_group.auto_classroom_id:
                    classroom_id = mixed_group.auto_classroom_id
                    print(f"DEBUG: Using auto_classroom_id: {classroom_id}")
        
        print(f"DEBUG: Final student check: {student is not None}")
        print(f"DEBUG: Final classroom_id: {classroom_id}")
        
        if not student:
            return jsonify({'success': False, 'message': 'Élève non trouvé ou non autorisé'}), 404
        
        # S'assurer qu'on a un classroom_id valide
        if not classroom_id:
            return jsonify({'success': False, 'message': 'classroom_id manquant'}), 400

        # Chercher un enregistrement existant
        attendance = Attendance.query.filter_by(
            student_id=student_id,
            date=date,
            period_number=period_number
        ).first()

        if attendance:
            # Mettre à jour l'existant
            attendance.status = status
            attendance.late_minutes = late_minutes if status == 'late' and late_minutes else None
            attendance.updated_at = datetime.utcnow()
        else:
            # Créer un nouveau
            attendance = Attendance(
                student_id=student_id,
                classroom_id=classroom_id,
                user_id=current_user.id,
                date=date,
                period_number=period_number,
                status=status,
                late_minutes=late_minutes if status == 'late' and late_minutes else None
            )
            db.session.add(attendance)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Présence mise à jour',
            'attendance': {
                'student_id': student_id,
                'status': status,
                'late_minutes': attendance.late_minutes
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/get-attendance-stats/<date>/<int:period>')
@login_required
def get_attendance_stats(date, period):
    """Obtenir les statistiques de présence pour un cours"""
    from models.attendance import Attendance

    try:
        # Convertir la date
        course_date = datetime.strptime(date, '%Y-%m-%d').date()

        # Récupérer toutes les présences pour ce cours
        attendances = Attendance.query.filter_by(
            user_id=current_user.id,
            date=course_date,
            period_number=period
        ).all()

        stats = {
            'present': 0,
            'absent': 0,
            'late': 0,
            'total': 0
        }

        for attendance in attendances:
            stats['total'] += 1
            stats[attendance.status] += 1

        return jsonify({
            'success': True,
            'stats': stats
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/save-lesson-planning', methods=['POST'])
@login_required
def save_lesson_planning():
    """Sauvegarder la planification depuis la vue leçon"""
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    try:
        date_str = data.get('date')
        period_number = data.get('period_number')
        classroom_id = data.get('classroom_id')
        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        checklist_states = data.get('checklist_states', {})
        
        # Convertir classroom_id en entier
        if classroom_id:
            try:
                classroom_id = int(classroom_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400

        # Convertir la date
        planning_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Vérifier la classe
        classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404

        # Chercher un planning existant
        existing = Planning.query.filter_by(
            user_id=current_user.id,
            date=planning_date,
            period_number=period_number
        ).first()

        if existing:
            # Mettre à jour
            existing.classroom_id = classroom_id
            existing.title = title
            existing.description = description
            existing.set_checklist_states(checklist_states)
        else:
            # Créer nouveau
            planning = Planning(
                user_id=current_user.id,
                classroom_id=classroom_id,
                date=planning_date,
                period_number=period_number,
                title=title,
                description=description
            )
            planning.set_checklist_states(checklist_states)
            db.session.add(planning)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Planification enregistrée avec succès',
            'planning': {
                'title': title,
                'description': description
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
# Vérifier que cette route existe à la fin du fichier routes/planning.py
# Si elle n'existe pas, l'ajouter après la route save_lesson_planning

@planning_bp.route('/update-checklist-states', methods=['POST'])
@login_required
def update_checklist_states():
    """Mettre à jour uniquement les états des checkboxes"""
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    try:
        date_str = data.get('date')
        period_number = data.get('period_number')
        checklist_states = data.get('checklist_states', {})

        # Convertir la date
        planning_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Chercher le planning existant
        planning = Planning.query.filter_by(
            user_id=current_user.id,
            date=planning_date,
            period_number=period_number
        ).first()

        if planning:
            # Mettre à jour les états des checkboxes
            planning.set_checklist_states(checklist_states)
            db.session.commit()

            return jsonify({
                'success': True,
                'message': 'États des checkboxes mis à jour'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Planification non trouvée'
            }), 404

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/get_planning/<date>/<int:period>')
@login_required
def get_planning(date, period):
    try:
        planning_date = datetime.strptime(date, '%Y-%m-%d').date()
        planning = Planning.query.filter_by(
            user_id=current_user.id,
            date=planning_date,
            period_number=period
        ).first()

        if planning:
            return jsonify({
                'success': True,
                'planning': {
                    'classroom_id': planning.classroom_id,
                    'title': planning.title,
                    'description': planning.description,
                    'group_id': planning.group_id,  # Ajouter l'ID du groupe
                    'checklist_states': planning.get_checklist_states()  # Ajouter les états des checkboxes
                }
            })
        else:
            # Retourner l'horaire type par défaut
            weekday = planning_date.weekday()
            schedule = Schedule.query.filter_by(
                user_id=current_user.id,
                weekday=weekday,
                period_number=period
            ).first()

            if schedule:
                return jsonify({
                    'success': True,
                    'planning': {
                        'classroom_id': schedule.classroom_id,
                        'title': '',
                        'description': '',
                        'group_id': None,  # Pas de groupe par défaut
                        'checklist_states': {}
                    }
                })

        return jsonify({'success': True, 'planning': None})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/save_file_annotations', methods=['POST'])
@login_required
def save_file_annotations():
    """Sauvegarde les annotations d'un fichier"""
    try:
        print(f"[DEBUG] === DEBUT save_file_annotations ===")
        
        data = request.get_json()
        file_id = data.get('file_id')
        annotations = data.get('annotations', [])
        
        print(f"[DEBUG] file_id={file_id}, nb_annotations={len(annotations)}")
        
        if not file_id:
            return jsonify({'success': False, 'message': 'ID de fichier manquant'}), 400
        
        # Vérifier que le fichier appartient à l'utilisateur (fichier de classe)
        from models.file_manager import UserFile, FileAnnotation
        from models.student import LegacyClassFile as ClassFile
        
        # D'abord chercher dans user_files
        user_file = UserFile.query.filter_by(id=file_id, user_id=current_user.id).first()
        file_found = bool(user_file)
        
        if not user_file:
            # Vérifier si c'est un fichier de classe
            class_file = ClassFile.query.filter_by(id=file_id).first()
            if class_file and class_file.classroom.user_id == current_user.id:
                file_found = True
                print(f"[DEBUG] Fichier de classe trouvé: {class_file.original_filename}")
            else:
                print(f"[DEBUG] Fichier non trouvé ou accès refusé")
                return jsonify({'success': False, 'message': 'Fichier non trouvé'}), 404
        
        if not file_found:
            return jsonify({'success': False, 'message': 'Fichier non trouvé'}), 404
        
        print(f"[DEBUG] Fichier validé, suppression des anciennes annotations...")
        
        # Supprimer les anciennes annotations
        deleted_count = FileAnnotation.query.filter_by(
            file_id=file_id,
            user_id=current_user.id
        ).delete()
        
        print(f"[DEBUG] {deleted_count} anciennes annotations supprimées")
        
        # Sauvegarder les nouvelles annotations
        if annotations:
            print(f"[DEBUG] Création de nouvelles annotations...")
            new_annotation = FileAnnotation(
                file_id=file_id,
                user_id=current_user.id,
                annotations_data=annotations
            )
            db.session.add(new_annotation)
            print(f"[DEBUG] Nouvelles annotations ajoutées à la session")
        
        db.session.commit()
        print(f"[DEBUG] === FIN save_file_annotations - SUCCESS ===")
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"[ERROR] Erreur dans save_file_annotations: {e}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/check-sanction-thresholds', methods=['POST'])
@login_required
def check_sanction_thresholds():
    """Vérifier les seuils de sanctions franchis pendant la période"""
    from models.sanctions import SanctionTemplate, SanctionThreshold, SanctionOption, ClassroomSanctionImport
    from models.student_sanctions import StudentSanctionCount
    from models.student import Student
    import random
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        classroom_id = data.get('classroom_id')
        initial_counts = data.get('initial_counts', {})  # Compteurs au début de la période
        
        # Convertir classroom_id en entier
        if classroom_id:
            try:
                classroom_id = int(classroom_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400
        
        # Vérifier que la classe appartient à l'utilisateur
        classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
        
        # Récupérer les sanctions importées dans cette classe
        # En mode centralisé, récupérer les modèles du maître de classe
        from models.user_preferences import UserSanctionPreferences
        
        classroom_prefs = UserSanctionPreferences.get_or_create_for_user_classroom(current_user.id, classroom_id)
        
        if classroom_prefs.display_mode == 'centralized':
            # En mode centralisé, récupérer TOUS les modèles actifs du maître de classe
            from models.class_collaboration import ClassMaster
            
            class_master = ClassMaster.query.filter_by(classroom_id=classroom_id).first()
            
            if class_master:
                imported_sanctions = SanctionTemplate.query.filter_by(
                    user_id=class_master.master_teacher_id,
                    is_active=True
                ).all()
            else:
                imported_sanctions = []
        else:
            # Mode normal : récupérer les modèles de l'utilisateur actuel
            imported_sanctions = db.session.query(SanctionTemplate).join(ClassroomSanctionImport).filter(
                ClassroomSanctionImport.classroom_id == classroom_id,
                ClassroomSanctionImport.is_active == True,
                SanctionTemplate.user_id == current_user.id,
                SanctionTemplate.is_active == True
            ).all()
        
        # Récupérer les élèves de la classe
        students = Student.query.filter_by(classroom_id=classroom_id).all()
        
        threshold_breaches = []
        
        for student in students:
            for sanction_template in imported_sanctions:
                # Récupérer le compteur actuel
                current_count = StudentSanctionCount.query.filter_by(
                    student_id=student.id,
                    template_id=sanction_template.id
                ).first()
                
                current_value = current_count.check_count if current_count else 0
                initial_value = int(initial_counts.get(f"{student.id}_{sanction_template.id}", 0))
                
                # Vérifier quels seuils ont été franchis pendant cette période
                thresholds = sanction_template.thresholds.order_by(SanctionThreshold.check_count).all()
                
                for threshold in thresholds:
                    # Seuil franchi si: initial < seuil <= current
                    if initial_value < threshold.check_count <= current_value:
                        # Tirer au sort une sanction pour ce seuil
                        available_options = threshold.sanctions.filter_by(is_active=True).all()
                        if available_options:
                            selected_option = random.choice(available_options)
                            
                            threshold_breaches.append({
                                'student_id': student.id,
                                'student_name': student.full_name,
                                'sanction_template': sanction_template.name,
                                'threshold': threshold.check_count,
                                'sanction_text': selected_option.description,
                                'min_days_deadline': selected_option.min_days_deadline,
                                'option_id': selected_option.id
                            })
        
        return jsonify({
            'success': True,
            'threshold_breaches': threshold_breaches
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/calculate-next-lesson-date', methods=['POST'])
@login_required
def calculate_next_lesson_date():
    """Calculer la prochaine date de cours pour une classe après un délai minimum"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        classroom_id = data.get('classroom_id')
        min_days = data.get('min_days', 0)
        current_date = datetime.strptime(data.get('current_date'), '%Y-%m-%d').date()
        
        # Convertir classroom_id en entier
        if classroom_id:
            try:
                classroom_id = int(classroom_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400
        
        # Date minimale = date actuelle + nombre de jours minimum
        min_date = current_date + timedelta(days=min_days)
        
        # Récupérer l'horaire type pour cette classe
        schedules = Schedule.query.filter_by(
            user_id=current_user.id,
            classroom_id=classroom_id
        ).order_by(Schedule.weekday, Schedule.period_number).all()
        
        if not schedules:
            return jsonify({
                'success': True,
                'next_date': None,
                'message': 'Aucun cours programmé pour cette classe'
            })
        
        # Chercher la prochaine date de cours
        search_date = min_date
        max_search_days = 365  # Limiter la recherche à un an
        
        for days_ahead in range(max_search_days):
            check_date = search_date + timedelta(days=days_ahead)
            weekday = check_date.weekday()
            
            # Vérifier si c'est un jour de vacances
            if is_holiday(check_date, current_user):
                continue
            
            # Vérifier si cette classe a cours ce jour
            day_schedule = [s for s in schedules if s.weekday == weekday]
            if day_schedule:
                # Prendre la première période du jour
                first_period = min(day_schedule, key=lambda x: x.period_number)
                return jsonify({
                    'success': True,
                    'next_date': check_date.strftime('%Y-%m-%d'),
                    'weekday': weekday,
                    'period_number': first_period.period_number,
                    'formatted_date': check_date.strftime('%d/%m/%Y')
                })
        
        return jsonify({
            'success': True,
            'next_date': None,
            'message': 'Aucune date trouvée dans les 365 prochains jours'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/add-sanction-to-planning', methods=['POST'])
@login_required
def add_sanction_to_planning():
    """Ajouter une sanction à récupérer dans la planification d'un cours"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        date_str = data.get('date')
        period_number = data.get('period_number')
        classroom_id = data.get('classroom_id')
        student_name = data.get('student_name')
        sanction_text = data.get('sanction_text')
        
        # Convertir classroom_id en entier
        if classroom_id:
            try:
                classroom_id = int(classroom_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400
        
        planning_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        # Chercher une planification existante
        existing = Planning.query.filter_by(
            user_id=current_user.id,
            date=planning_date,
            period_number=period_number
        ).first()
        
        # Texte de la sanction à ajouter
        sanction_reminder = f"☐ {student_name} : {sanction_text}"
        
        if existing:
            # Ajouter à la description existante
            if existing.description:
                existing.description += f"\n\n{sanction_reminder}"
            else:
                existing.description = sanction_reminder
        else:
            # Créer une nouvelle planification
            planning = Planning(
                user_id=current_user.id,
                classroom_id=classroom_id,
                date=planning_date,
                period_number=period_number,
                title="",
                description=sanction_reminder
            )
            db.session.add(planning)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Sanction ajoutée à la planification'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/get_file_annotations/<int:file_id>')
@login_required 
def get_file_annotations(file_id):
    """Récupère les annotations d'un fichier"""
    try:
        print(f"[DEBUG] === DEBUT get_file_annotations file_id={file_id} ===")
        
        # Vérifier que le fichier appartient à l'utilisateur
        from models.file_manager import UserFile, FileAnnotation
        from models.student import LegacyClassFile as ClassFile
        
        # D'abord chercher dans user_files
        user_file = UserFile.query.filter_by(id=file_id, user_id=current_user.id).first()
        file_found = bool(user_file)
        
        if not user_file:
            # Vérifier si c'est un fichier de classe
            class_file = ClassFile.query.filter_by(id=file_id).first()
            if class_file and class_file.classroom.user_id == current_user.id:
                file_found = True
                print(f"[DEBUG] Fichier de classe trouvé: {class_file.original_filename}")
            else:
                print(f"[DEBUG] Fichier non trouvé ou accès refusé")
                return jsonify({'success': False, 'message': 'Fichier non trouvé'}), 404
        
        if not file_found:
            return jsonify({'success': False, 'message': 'Fichier non trouvé'}), 404
        
        print(f"[DEBUG] Recherche des annotations...")
        
        # Récupérer les annotations
        annotation = FileAnnotation.query.filter_by(
            file_id=file_id,
            user_id=current_user.id
        ).first()
        
        annotations = annotation.annotations_data if annotation else []
        
        print(f"[DEBUG] {len(annotations)} annotations trouvées")
        print(f"[DEBUG] === FIN get_file_annotations - SUCCESS ===")
        
        return jsonify({
            'success': True,
            'annotations': annotations
        })
        
    except Exception as e:
        print(f"[ERROR] Erreur dans get_file_annotations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/check-master-plan-available/<path:classroom_param>')
@login_required
def check_master_plan_available(classroom_param):
    """Vérifier si le plan du maître de classe est disponible et a été modifié"""
    from models.seating_plan import SeatingPlan
    from models.class_collaboration import ClassMaster
    import json
    
    try:
        # Déterminer l'ID de classroom selon le format du paramètre
        classroom_id = None
        classroom = None
        
        # Vérifier si c'est un nom de groupe mixte avec emoji
        if classroom_param.startswith('🔀 '):
            # Classe mixte - le bouton ne doit PAS apparaître pour les classes mixtes
            return jsonify({'show_button': False, 'message': 'Bouton non disponible pour les classes mixtes'})
        else:
            # Classe normale - chercher par nom
            classroom = Classroom.query.filter_by(
                name=classroom_param,
                user_id=current_user.id
            ).first()
            if classroom:
                classroom_id = classroom.id

        if not classroom or not classroom_id:
            return jsonify({'show_button': False, 'message': 'Classe non trouvée'})

        # Déterminer le groupe de classe
        group_name = classroom.class_group or classroom.name
        
        # Trouver s'il y a un maître de classe dans le groupe
        group_classrooms = Classroom.query.filter(
            (Classroom.class_group == group_name) if classroom.class_group 
            else (Classroom.name == group_name)
        ).all()
        
        class_master = None
        master_classroom_id = None
        for group_classroom in group_classrooms:
            class_master = ClassMaster.query.filter_by(classroom_id=group_classroom.id).first()
            if class_master:
                master_classroom_id = group_classroom.id
                break
        
        # Si pas de maître de classe trouvé, le bouton ne doit pas être affiché
        if not class_master:
            return jsonify({'show_button': False, 'message': 'Aucun maître de classe trouvé'})
        
        # Si l'utilisateur actuel est le maître de classe, le bouton ne doit pas être affiché
        if class_master.master_teacher_id == current_user.id:
            return jsonify({'show_button': False, 'message': 'Vous êtes le maître de classe'})
        
        # Vérifier si le maître de classe a un plan de classe
        master_plan = SeatingPlan.query.filter_by(
            classroom_id=master_classroom_id,
            user_id=class_master.master_teacher_id,
            is_active=True
        ).first()
        
        if not master_plan:
            return jsonify({'show_button': False, 'message': 'Le maître de classe n\'a pas de plan'})
        
        # Vérifier si l'utilisateur actuel a déjà un plan
        current_plan = SeatingPlan.query.filter_by(
            classroom_id=classroom_id,
            user_id=current_user.id,
            is_active=True
        ).first()
        
        # Le bouton doit être affiché si :
        # 1. Il y a un maître de classe
        # 2. Le maître a un plan
        # 3. L'utilisateur n'est pas le maître de classe
        # 4. Ce n'est pas une classe mixte (déjà vérifié plus haut)
        # Le bouton est TOUJOURS visible dans ces conditions (pas de restriction sur la date)
        show_button = True
        
        return jsonify({
            'show_button': show_button,
            'master_plan_updated': master_plan.updated_at.isoformat() if master_plan else None,
            'current_plan_updated': current_plan.updated_at.isoformat() if current_plan else None
        })
        
    except Exception as e:
        print(f"Erreur lors de la vérification du plan du maître: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'show_button': False, 'message': str(e)}), 500


@planning_bp.route('/load-master-seating-plan/<path:classroom_param>')
@login_required
def load_master_seating_plan(classroom_param):
    """Charger le plan de classe du maître de classe"""
    from models.seating_plan import SeatingPlan
    from models.class_collaboration import ClassMaster
    import json
    
    try:
        # Déterminer l'ID de classroom selon le format du paramètre
        classroom_id = None
        classroom = None
        
        # Vérifier si c'est un nom de groupe mixte avec emoji
        if classroom_param.startswith('🔀 '):
            # Classe mixte - trouver l'auto_classroom associée
            from models.mixed_group import MixedGroup
            mixed_group_name = classroom_param[2:]  # Enlever "🔀 "
            mixed_group = MixedGroup.query.filter_by(
                teacher_id=current_user.id,
                name=mixed_group_name
            ).first()
            
            if mixed_group and mixed_group.auto_classroom_id:
                classroom_id = mixed_group.auto_classroom_id
                classroom = Classroom.query.get(classroom_id)
        else:
            # Classe normale - chercher par nom
            classroom = Classroom.query.filter_by(
                name=classroom_param,
                user_id=current_user.id
            ).first()
            if classroom:
                classroom_id = classroom.id

        if not classroom or not classroom_id:
            return jsonify({'success': False, 'message': 'Classe non trouvée'})

        # Déterminer le groupe de classe
        group_name = classroom.class_group or classroom.name
        
        # Trouver s'il y a un maître de classe dans le groupe
        group_classrooms = Classroom.query.filter(
            (Classroom.class_group == group_name) if classroom.class_group 
            else (Classroom.name == group_name)
        ).all()
        
        class_master = None
        master_classroom_id = None
        for group_classroom in group_classrooms:
            class_master = ClassMaster.query.filter_by(classroom_id=group_classroom.id).first()
            if class_master:
                master_classroom_id = group_classroom.id
                break
        
        if not class_master:
            return jsonify({'success': False, 'message': 'Aucun maître de classe trouvé'})
        
        if class_master.master_teacher_id == current_user.id:
            return jsonify({'success': False, 'message': 'Vous êtes le maître de classe'})
        
        # Récupérer le plan du maître de classe
        master_plan = SeatingPlan.query.filter_by(
            classroom_id=master_classroom_id,
            user_id=class_master.master_teacher_id,
            is_active=True
        ).first()
        
        if not master_plan:
            return jsonify({'success': False, 'message': 'Le maître de classe n\'a pas de plan'})
        
        # Retourner les données du plan
        plan_data = json.loads(master_plan.plan_data)
        
        return jsonify({
            'success': True,
            'plan_data': plan_data,
            'message': 'Plan du maître de classe chargé'
        })
        
    except Exception as e:
        print(f"Erreur lors du chargement du plan du maître: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/save-seating-plan', methods=['POST'])
@login_required
def save_seating_plan():
    """Sauvegarder un plan de classe"""
    from models.seating_plan import SeatingPlan
    import json
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        classroom_param = data.get('classroom_id')
        plan_data = data.get('plan_data')
        name = data.get('name', 'Plan par défaut')
        
        print(f"DEBUG save_seating_plan: classroom_param={classroom_param}, user_id={current_user.id}")
        
        if not classroom_param or not plan_data:
            return jsonify({'success': False, 'message': 'Données manquantes'}), 400
        
        # Déterminer l'ID de classroom selon le format du paramètre
        classroom_id = None
        classroom = None
        
        # Vérifier si c'est un ID numérique ou un nom
        try:
            # Essayer d'abord comme ID numérique
            classroom_id = int(classroom_param)
            classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
        except (ValueError, TypeError):
            # Si ce n'est pas un ID numérique, traiter comme nom de classe
            if classroom_param.startswith('🔀 '):
                # Classe mixte - trouver l'auto_classroom associée
                from models.mixed_group import MixedGroup
                mixed_group_name = classroom_param[2:]  # Enlever "🔀 "
                mixed_group = MixedGroup.query.filter_by(
                    teacher_id=current_user.id,
                    name=mixed_group_name
                ).first()
                
                if mixed_group and mixed_group.auto_classroom_id:
                    classroom_id = mixed_group.auto_classroom_id
                    classroom = Classroom.query.get(classroom_id)
            else:
                # Classe normale - chercher par nom
                classroom = Classroom.query.filter_by(
                    name=classroom_param,
                    user_id=current_user.id
                ).first()
                
                # Si pas trouvé directement, vérifier si c'est une classe dérivée (collaboration)
                if not classroom:
                    from models.class_collaboration import SharedClassroom
                    # Chercher une classe dérivée avec ce nom
                    derived_classroom = Classroom.query.filter_by(name=classroom_param).first()
                    if derived_classroom:
                        # Vérifier si l'utilisateur a accès à cette classe via collaboration
                        shared = SharedClassroom.query.filter_by(
                            derived_classroom_id=derived_classroom.id
                        ).first()
                        if shared:
                            # Vérifier que l'utilisateur a les droits sur cette classe dérivée
                            from models.class_collaboration import TeacherCollaboration
                            collaboration = TeacherCollaboration.query.filter_by(
                                shared_classroom_id=shared.id,
                                specialized_teacher_id=current_user.id,
                                is_active=True
                            ).first()
                            if collaboration:
                                classroom = derived_classroom
                                classroom_id = derived_classroom.id
                
                if classroom and not classroom_id:
                    classroom_id = classroom.id
        
        print(f"DEBUG save_seating_plan: Found classroom={classroom.name if classroom else None}, classroom_id={classroom_id}")
        
        if not classroom or not classroom_id:
            print(f"DEBUG save_seating_plan: FAILED - classroom={classroom}, classroom_id={classroom_id}")
            return jsonify({'success': False, 'message': 'Classe non trouvée ou accès non autorisé'}), 404
        
        # Désactiver les anciens plans pour cette classe
        SeatingPlan.query.filter_by(
            classroom_id=classroom_id,
            user_id=current_user.id,
            is_active=True
        ).update({'is_active': False})
        
        # Créer le nouveau plan
        seating_plan = SeatingPlan(
            classroom_id=classroom_id,
            user_id=current_user.id,
            name=name,
            plan_data=json.dumps(plan_data),
            is_active=True
        )
        
        db.session.add(seating_plan)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Plan de classe sauvegardé avec succès',
            'plan_id': seating_plan.id
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@planning_bp.route('/load-seating-plan/<path:classroom_param>')
@login_required
def load_seating_plan(classroom_param):
    """Charger le plan de classe actif"""
    from models.seating_plan import SeatingPlan
    import json
    
    try:
        # Déterminer l'ID de classroom selon le format du paramètre
        classroom_id = None
        classroom = None
        
        # Vérifier si c'est un nom de groupe mixte avec emoji
        if classroom_param.startswith('🔀 '):
            # Classe mixte - trouver l'auto_classroom associée
            from models.mixed_group import MixedGroup
            mixed_group_name = classroom_param[2:]  # Enlever "🔀 "
            mixed_group = MixedGroup.query.filter_by(
                teacher_id=current_user.id,
                name=mixed_group_name
            ).first()
            
            if mixed_group and mixed_group.auto_classroom:
                classroom_id = mixed_group.auto_classroom.id
                classroom = mixed_group.auto_classroom
        else:
            # Format numérique ou nom de classe normale
            try:
                # Essayer de convertir en entier (ancien format)
                classroom_id = int(classroom_param)
                classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
            except ValueError:
                # Format nom de classe normale - chercher par nom
                # Pour les classes normales, le paramètre est le nom du groupe de classe
                # On doit chercher la première classroom de ce groupe
                from models.classroom import Classroom
                classrooms = Classroom.query.filter_by(
                    user_id=current_user.id,
                    class_group=classroom_param
                ).all()
                
                if classrooms:
                    classroom = classrooms[0]  # Prendre la première
                    classroom_id = classroom.id
        
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
        
        # Récupérer le plan actif
        seating_plan = SeatingPlan.query.filter_by(
            classroom_id=classroom_id,
            user_id=current_user.id,
            is_active=True
        ).first()
        
        if seating_plan:
            return jsonify({
                'success': True,
                'plan_data': json.loads(seating_plan.plan_data),
                'name': seating_plan.name,
                'plan_id': seating_plan.id
            })
        else:
            return jsonify({
                'success': True,
                'plan_data': None,
                'message': 'Aucun plan sauvegardé pour cette classe'
            })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ===== ROUTES POUR LA GESTION DES GROUPES =====

@planning_bp.route('/get-groups/<classroom_param>')
@login_required
def get_groups(classroom_param):
    """Récupérer tous les groupes d'une classe"""
    try:
        from models.student_group import StudentGroup, StudentGroupMembership
        from models.student import Student
        
        # Déterminer la classe selon le format du paramètre (ID numérique ou nom)
        classroom = None
        classroom_id = None
        
        try:
            # Essayer d'abord comme ID numérique
            classroom_id = int(classroom_param)
            classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
        except (ValueError, TypeError):
            # Si ce n'est pas un ID numérique, traiter comme nom de classe
            if classroom_param.startswith('🔀 '):
                # Classe mixte - trouver l'auto_classroom associée
                from models.mixed_group import MixedGroup
                mixed_group_name = classroom_param[2:]  # Enlever "🔀 "
                mixed_group = MixedGroup.query.filter_by(
                    teacher_id=current_user.id,
                    name=mixed_group_name
                ).first()
                
                if mixed_group and mixed_group.auto_classroom_id:
                    classroom_id = mixed_group.auto_classroom_id
                    classroom = Classroom.query.get(classroom_id)
            else:
                # Classe normale - chercher par class_group
                classroom = Classroom.query.filter_by(
                    class_group=classroom_param,
                    user_id=current_user.id
                ).first()
                
                if classroom:
                    classroom_id = classroom.id
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
        
        # Récupérer les groupes de cette classe
        groups = StudentGroup.query.filter_by(
            classroom_id=classroom_id,
            user_id=current_user.id
        ).all()
        
        groups_data = []
        for group in groups:
            # Récupérer les élèves de ce groupe
            students = db.session.query(Student).join(
                StudentGroupMembership,
                Student.id == StudentGroupMembership.student_id
            ).filter(
                StudentGroupMembership.group_id == group.id
            ).all()
            
            groups_data.append({
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'color': group.color,
                'students': [{
                    'id': student.id,
                    'first_name': student.first_name,
                    'last_name': student.last_name
                } for student in students],
                'student_count': len(students)
            })
        
        return jsonify({
            'success': True,
            'groups': groups_data
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/get-group/<int:group_id>')
@login_required
def get_group(group_id):
    """Récupérer un groupe spécifique"""
    try:
        from models.student_group import StudentGroup, StudentGroupMembership
        
        # Vérifier que le groupe appartient à l'utilisateur
        group = StudentGroup.query.filter_by(id=group_id, user_id=current_user.id).first()
        if not group:
            return jsonify({'success': False, 'message': 'Groupe non trouvé'}), 404
        
        # Récupérer les IDs des élèves de ce groupe
        student_ids = [membership.student_id for membership in group.memberships]
        
        return jsonify({
            'success': True,
            'group': {
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'color': group.color,
                'student_ids': student_ids
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/create-group', methods=['POST'])
@login_required
def create_group():
    """Créer un nouveau groupe"""
    try:
        from models.student_group import StudentGroup, StudentGroupMembership
        from models.student import Student
        
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
        
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        color = data.get('color', '#4F46E5')
        classroom_id = data.get('classroom_id')
        student_ids = data.get('student_ids', [])
        
        if not name:
            return jsonify({'success': False, 'message': 'Le nom du groupe est obligatoire'}), 400
        
        # Déterminer la classe selon le format du paramètre (ID numérique ou nom)
        classroom = None
        actual_classroom_id = None
        
        if classroom_id:
            try:
                # Essayer d'abord comme ID numérique
                actual_classroom_id = int(classroom_id)
                classroom = Classroom.query.filter_by(id=actual_classroom_id, user_id=current_user.id).first()
            except (ValueError, TypeError):
                # Si ce n'est pas un ID numérique, traiter comme nom de classe
                if isinstance(classroom_id, str):
                    if classroom_id.startswith('🔀 '):
                        # Classe mixte - trouver l'auto_classroom associée
                        from models.mixed_group import MixedGroup
                        mixed_group_name = classroom_id[2:]  # Enlever "🔀 "
                        mixed_group = MixedGroup.query.filter_by(
                            teacher_id=current_user.id,
                            name=mixed_group_name
                        ).first()
                        
                        if mixed_group and mixed_group.auto_classroom_id:
                            actual_classroom_id = mixed_group.auto_classroom_id
                            classroom = Classroom.query.get(actual_classroom_id)
                    else:
                        # Classe normale - chercher par class_group (nom de classe)
                        classroom = Classroom.query.filter_by(
                            class_group=classroom_id,
                            user_id=current_user.id
                        ).first()
                        
                        if classroom:
                            actual_classroom_id = classroom.id
                
                if not classroom:
                    return jsonify({'success': False, 'message': f'Classe non trouvée: {classroom_id}'}), 404
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
        
        # Vérifier que tous les élèves appartiennent à cette classe
        if student_ids:
            # Convertir student_ids en entiers
            try:
                student_ids = [int(sid) for sid in student_ids]
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'IDs d\'élèves invalides'}), 400
            
            valid_students = Student.query.filter(
                Student.id.in_(student_ids),
                Student.classroom_id == actual_classroom_id
            ).count()
            if valid_students != len(student_ids):
                return jsonify({'success': False, 'message': 'Certains élèves ne sont pas valides'}), 400
        
        # Créer le groupe
        group = StudentGroup(
            classroom_id=actual_classroom_id,
            user_id=current_user.id,
            name=name,
            description=description or None,
            color=color
        )
        db.session.add(group)
        db.session.flush()  # Pour obtenir l'ID du groupe
        
        # Ajouter les élèves au groupe
        for student_id in student_ids:
            membership = StudentGroupMembership(
                group_id=group.id,
                student_id=student_id
            )
            db.session.add(membership)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Groupe "{name}" créé avec succès',
            'group_id': group.id
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/update-group/<int:group_id>', methods=['POST'])
@login_required
def update_group(group_id):
    """Mettre à jour un groupe existant"""
    try:
        from models.student_group import StudentGroup, StudentGroupMembership
        from models.student import Student
        
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
        
        # Vérifier que le groupe appartient à l'utilisateur
        group = StudentGroup.query.filter_by(id=group_id, user_id=current_user.id).first()
        if not group:
            return jsonify({'success': False, 'message': 'Groupe non trouvé'}), 404
        
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        color = data.get('color', '#4F46E5')
        student_ids = data.get('student_ids', [])
        
        if not name:
            return jsonify({'success': False, 'message': 'Le nom du groupe est obligatoire'}), 400
        
        # Vérifier que tous les élèves appartiennent à cette classe
        if student_ids:
            valid_students = Student.query.filter(
                Student.id.in_(student_ids),
                Student.classroom_id == group.classroom_id
            ).count()
            if valid_students != len(student_ids):
                return jsonify({'success': False, 'message': 'Certains élèves ne sont pas valides'}), 400
        
        # Mettre à jour le groupe
        group.name = name
        group.description = description or None
        group.color = color
        
        # Supprimer les anciennes associations
        StudentGroupMembership.query.filter_by(group_id=group_id).delete()
        
        # Ajouter les nouvelles associations
        for student_id in student_ids:
            membership = StudentGroupMembership(
                group_id=group_id,
                student_id=student_id
            )
            db.session.add(membership)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Groupe "{name}" mis à jour avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/delete-group/<int:group_id>', methods=['DELETE'])
@login_required
def delete_group(group_id):
    """Supprimer un groupe"""
    try:
        from models.student_group import StudentGroup
        
        # Vérifier que le groupe appartient à l'utilisateur
        group = StudentGroup.query.filter_by(id=group_id, user_id=current_user.id).first()
        if not group:
            return jsonify({'success': False, 'message': 'Groupe non trouvé'}), 404
        
        group_name = group.name
        db.session.delete(group)  # Les memberships seront supprimés automatiquement (cascade)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Groupe "{group_name}" supprimé avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/apply-group-pattern', methods=['POST'])
@login_required
def apply_group_pattern():
    """Appliquer un pattern de groupes jusqu'à la fin de l'année"""
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        from models.student_group import StudentGroup
        
        start_date_str = data.get('start_date')
        period_number = data.get('period_number')
        classroom_id = data.get('classroom_id')
        title = data.get('title', '')
        description = data.get('description', '')
        checklist_states = data.get('checklist_states', {})
        pattern_type = data.get('pattern_type')  # 'same' ou 'alternate'
        selected_group_id = data.get('group_id')
        
        # Convertir les IDs en entiers
        if classroom_id:
            try:
                classroom_id = int(classroom_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400
        
        if selected_group_id:
            try:
                selected_group_id = int(selected_group_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'ID de groupe invalide'}), 400
        
        # Convertir la date de début
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        start_weekday = start_date.weekday()
        
        # Vérifier la classe
        classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
        
        # Vérifier que cette classe a cours à cette période ce jour de la semaine
        schedule = Schedule.query.filter_by(
            user_id=current_user.id,
            classroom_id=classroom_id,
            weekday=start_weekday,
            period_number=period_number
        ).first()
        
        if not schedule:
            return jsonify({'success': False, 'message': 'Aucun cours programmé pour cette classe à cette période'}), 400
        
        # Récupérer tous les groupes de la classe pour l'alternance
        all_groups = []
        if pattern_type == 'alternate':
            groups = StudentGroup.query.filter_by(
                classroom_id=classroom_id,
                user_id=current_user.id
            ).order_by(StudentGroup.name).all()
            all_groups = [group.id for group in groups]
            
            if not all_groups:
                return jsonify({'success': False, 'message': 'Aucun groupe trouvé pour cette classe'}), 400
        
        # Calculer toutes les dates jusqu'à la fin de l'année scolaire
        current_date = start_date
        created_count = 0
        group_index = 0  # Pour l'alternance
        
        # Si on fait de l'alternance, trouver l'index du groupe sélectionné
        if pattern_type == 'alternate' and selected_group_id:
            try:
                group_index = all_groups.index(int(selected_group_id))
            except (ValueError, TypeError):
                group_index = 0
        
        while current_date <= current_user.school_year_end:
            # Vérifier si c'est un jour de vacances
            if is_holiday(current_date, current_user):
                current_date += timedelta(days=7)
                continue
            
            # Déterminer le groupe pour cette date
            if pattern_type == 'same':
                group_to_assign = selected_group_id
            elif pattern_type == 'alternate':
                group_to_assign = all_groups[group_index % len(all_groups)]
                group_index += 1
            else:
                group_to_assign = selected_group_id
            
            # Chercher une planification existante
            existing = Planning.query.filter_by(
                user_id=current_user.id,
                date=current_date,
                period_number=period_number
            ).first()
            
            if existing:
                # Mettre à jour la planification existante
                existing.classroom_id = classroom_id
                existing.title = title
                existing.description = description
                existing.group_id = group_to_assign
                existing.set_checklist_states(checklist_states)
            else:
                # Créer une nouvelle planification
                planning = Planning(
                    user_id=current_user.id,
                    classroom_id=classroom_id,
                    date=current_date,
                    period_number=period_number,
                    title=title,
                    description=description,
                    group_id=group_to_assign
                )
                planning.set_checklist_states(checklist_states)
                db.session.add(planning)
            
            created_count += 1
            current_date += timedelta(days=7)  # Passer à la semaine suivante
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{created_count} planifications créées/mises à jour avec succès',
            'created_count': created_count
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/get-accommodation-templates')
@login_required
def get_accommodation_templates():
    """Récupérer tous les modèles d'aménagements de l'utilisateur"""
    try:
        from models.accommodation import AccommodationTemplate
        
        templates = AccommodationTemplate.query.filter_by(
            user_id=current_user.id,
            is_active=True
        ).order_by(AccommodationTemplate.category, AccommodationTemplate.name).all()
        
        # Si aucun template n'existe, créer des aménagements prédéfinis de base
        if not templates:
            default_templates = [
                {
                    'name': 'Temps majoré (1/3 temps)',
                    'description': 'Temps supplémentaire de 1/3 pour les évaluations',
                    'emoji': '⏰',
                    'category': 'Temps',
                    'is_time_extension': True,
                    'time_multiplier': 1.33
                },
                {
                    'name': 'Temps majoré (1/2 temps)',
                    'description': 'Temps supplémentaire de 1/2 pour les évaluations',
                    'emoji': '⏱️',
                    'category': 'Temps',
                    'is_time_extension': True,
                    'time_multiplier': 1.5
                },
                {
                    'name': 'Utilisation de l\'ordinateur',
                    'description': 'Autorisation d\'utiliser un ordinateur pour la rédaction',
                    'emoji': '💻',
                    'category': 'Matériel',
                    'is_time_extension': False,
                    'time_multiplier': None
                },
                {
                    'name': 'Lecture des consignes',
                    'description': 'Lecture à haute voix des consignes',
                    'emoji': '📖',
                    'category': 'Consignes',
                    'is_time_extension': False,
                    'time_multiplier': None
                },
                {
                    'name': 'Reformulation des consignes',
                    'description': 'Reformulation ou explication des consignes',
                    'emoji': '💬',
                    'category': 'Consignes',
                    'is_time_extension': False,
                    'time_multiplier': None
                },
                {
                    'name': 'Évaluation séparée',
                    'description': 'Composition dans une salle séparée',
                    'emoji': '🏠',
                    'category': 'Environnement',
                    'is_time_extension': False,
                    'time_multiplier': None
                },
                {
                    'name': 'Police agrandie',
                    'description': 'Documents avec police de caractères agrandie',
                    'emoji': '🔍',
                    'category': 'Matériel',
                    'is_time_extension': False,
                    'time_multiplier': None
                },
                {
                    'name': 'Calculatrice autorisée',
                    'description': 'Utilisation d\'une calculatrice',
                    'emoji': '🔢',
                    'category': 'Matériel',
                    'is_time_extension': False,
                    'time_multiplier': None
                }
            ]
            
            for template_data in default_templates:
                template = AccommodationTemplate(
                    user_id=current_user.id,
                    **template_data
                )
                db.session.add(template)
            
            db.session.commit()
            
            # Récupérer les templates nouvellement créés
            templates = AccommodationTemplate.query.filter_by(
                user_id=current_user.id,
                is_active=True
            ).order_by(AccommodationTemplate.category, AccommodationTemplate.name).all()
        
        templates_data = []
        for template in templates:
            templates_data.append({
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'emoji': template.emoji,
                'category': template.category,
                'is_time_extension': template.is_time_extension,
                'time_multiplier': template.time_multiplier
            })
        
        return jsonify({
            'success': True,
            'templates': templates_data
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/get-student-accommodations/<path:classroom_param>')
@login_required
def get_student_accommodations(classroom_param):
    """Récupérer tous les aménagements des élèves d'une classe"""
    try:
        from models.accommodation import StudentAccommodation
        from models.student import Student
        
        print(f"DEBUG: get_student_accommodations called with param: '{classroom_param}' by user {current_user.id}")
        
        # Déterminer l'ID de classroom selon le format du paramètre
        classroom_id = None
        students = []
        
        # Vérifier si c'est un nom de groupe mixte avec emoji
        if classroom_param.startswith('🔀 '):
            # Classe mixte - récupérer les élèves depuis le groupe mixte
            from models.mixed_group import MixedGroup
            mixed_group_name = classroom_param[2:]  # Enlever "🔀 "
            mixed_group = MixedGroup.query.filter_by(
                teacher_id=current_user.id,
                name=mixed_group_name
            ).first()
            
            if not mixed_group:
                return jsonify({'success': False, 'message': 'Groupe mixte non trouvé'}), 404
                
            # Pour les groupes mixtes, récupérer les élèves via get_students()
            students = mixed_group.get_students()
            students = sorted(students, key=lambda s: (s.last_name, s.first_name))
        else:
            # Format numérique ou nom de classe normale
            try:
                # Essayer de convertir en entier (ancien format)
                classroom_id = int(classroom_param)
                classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
                if not classroom:
                    return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
                students = Student.query.filter_by(classroom_id=classroom_id).order_by(Student.last_name, Student.first_name).all()
            except ValueError:
                # Format nom de classe normale - chercher par nom
                print(f"DEBUG: Searching for classrooms with class_group='{classroom_param}' for user {current_user.id}")
                # D'abord, chercher les classes de l'utilisateur actuel
                classrooms = Classroom.query.filter_by(
                    user_id=current_user.id,
                    class_group=classroom_param
                ).all()
                
                print(f"DEBUG: Found {len(classrooms)} classrooms directly owned by user")
                
                # Pour l'instant, on se concentre sur les classes directement possédées
                # TODO: Ajouter la logique pour les classes dérivées plus tard
                print(f"DEBUG: Skipping collaboration logic for now")
                
                if not classrooms:
                    return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
                    
                # Récupérer les élèves de toutes les classrooms du groupe avec déduplication
                print(f"DEBUG: Processing {len(classrooms)} classrooms for students")
                seen_students = set()  # Pour éviter les doublons basés sur nom/prénom
                for classroom in classrooms:
                    class_students = Student.query.filter_by(classroom_id=classroom.id).all()
                    print(f"DEBUG: Classroom {classroom.id} ({classroom.name}) has {len(class_students)} students")
                    for student in class_students:
                        # Utiliser nom + prénom comme clé de déduplication
                        student_key = (student.first_name.strip().lower(), student.last_name.strip().lower())
                        if student_key not in seen_students:
                            seen_students.add(student_key)
                            students.append(student)
                            print(f"DEBUG: Added student {student.full_name}")
                        else:
                            print(f"DEBUG: Skipped duplicate student {student.full_name}")
                print(f"DEBUG: Final student count after deduplication: {len(students)}")
                students = sorted(students, key=lambda s: (s.last_name, s.first_name))
        
        students_data = []
        for student in students:
            accommodations = StudentAccommodation.query.filter_by(
                student_id=student.id,
                is_active=True
            ).all()
            
            accommodations_data = []
            for acc in accommodations:
                accommodations_data.append({
                    'id': acc.id,
                    'name': acc.name,
                    'description': acc.description,
                    'emoji': acc.emoji,
                    'is_time_extension': acc.is_time_extension,
                    'time_multiplier': acc.time_multiplier,
                    'notes': acc.notes,
                    'is_template': acc.template_id is not None
                })
            
            students_data.append({
                'id': student.id,
                'first_name': student.first_name,
                'last_name': student.last_name,
                'full_name': student.full_name,
                'accommodations': accommodations_data
            })
        
        return jsonify({
            'success': True,
            'students': students_data
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/add-student-accommodation', methods=['POST'])
@login_required
def add_student_accommodation():
    """Ajouter un aménagement à un élève"""
    try:
        from models.accommodation import StudentAccommodation, AccommodationTemplate
        from models.student import Student
        
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
        
        student_id = data.get('student_id')
        accommodation_type = data.get('accommodation_type')  # 'template' ou 'custom'
        notes = data.get('notes', '')
        
        # Vérifier que l'utilisateur peut accéder à cet élève (direct ou via collaboration)
        student = user_can_access_student(current_user.id, student_id)
        
        if not student:
            return jsonify({'success': False, 'message': 'Élève non trouvé ou accès non autorisé'}), 404
        
        # Créer l'aménagement selon le type
        if accommodation_type == 'template':
            template_id = data.get('template_id')
            template = AccommodationTemplate.query.filter_by(
                id=template_id,
                user_id=current_user.id
            ).first()
            
            if not template:
                return jsonify({'success': False, 'message': 'Modèle d\'aménagement non trouvé'}), 404
            
            accommodation = StudentAccommodation(
                student_id=student_id,
                template_id=template_id,
                notes=notes
            )
        else:  # custom
            name = data.get('custom_name', '').strip()
            description = data.get('custom_description', '').strip()
            emoji = data.get('custom_emoji', '🔧').strip()
            is_time_extension = data.get('custom_is_time_extension', False)
            time_multiplier = data.get('custom_time_multiplier')
            
            if not name:
                return jsonify({'success': False, 'message': 'Le nom de l\'aménagement est obligatoire'}), 400
            
            accommodation = StudentAccommodation(
                student_id=student_id,
                custom_name=name,
                custom_description=description,
                custom_emoji=emoji,
                custom_is_time_extension=is_time_extension,
                custom_time_multiplier=float(time_multiplier) if time_multiplier else None,
                notes=notes
            )
        
        db.session.add(accommodation)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Aménagement ajouté avec succès',
            'accommodation_id': accommodation.id
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/delete-student-accommodation/<int:accommodation_id>', methods=['DELETE'])
@login_required
def delete_student_accommodation(accommodation_id):
    """Supprimer un aménagement d'élève"""
    try:
        from models.accommodation import StudentAccommodation
        from models.student import Student
        
        # Récupérer l'aménagement et vérifier les permissions
        accommodation = StudentAccommodation.query.filter_by(id=accommodation_id).first()
        
        if not accommodation:
            return jsonify({'success': False, 'message': 'Aménagement non trouvé'}), 404
        
        # Vérifier que l'utilisateur peut accéder à cet élève
        student = user_can_access_student(current_user.id, accommodation.student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Accès non autorisé'}), 403
        
        # Vérifier que c'est bien son aménagement (pour les enseignants spécialisés)
        if accommodation.template_id:
            # Aménagement basé sur un template
            if accommodation.template.user_id != current_user.id:
                # Vérifier si c'est un maître de classe qui peut supprimer tous les aménagements
                from models.class_collaboration import ClassMaster
                is_class_master = ClassMaster.query.filter_by(
                    classroom_id=student.classroom_id,
                    master_teacher_id=current_user.id
                ).first() is not None
                
                if not is_class_master:
                    return jsonify({'success': False, 'message': 'Vous ne pouvez supprimer que vos propres aménagements'}), 403
        
        db.session.delete(accommodation)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Aménagement supprimé avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/api/slot/<date_str>/<int:period>')
@login_required
def get_slot_data(date_str, period):
    """API endpoint pour récupérer les données d'un slot de planning"""
    try:
        planning_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        weekday = planning_date.weekday()
        
        # Récupérer la période pour les horaires
        periods = calculate_periods(current_user)
        period_info = next((p for p in periods if p['number'] == period), None)
        
        if not period_info:
            return jsonify({'success': False, 'message': 'Période invalide'}), 400
        
        # Chercher un planning existant
        planning = Planning.query.filter_by(
            user_id=current_user.id,
            date=planning_date,
            period_number=period
        ).first()
        
        # Récupérer l'horaire type par défaut
        schedule = Schedule.query.filter_by(
            user_id=current_user.id,
            weekday=weekday,
            period_number=period
        ).first()
        
        result = {
            'period': period,
            'period_start': period_info['start'].strftime('%H:%M'),
            'period_end': period_info['end'].strftime('%H:%M'),
            'has_schedule': schedule is not None,
            'default_classroom_id': schedule.classroom_id if schedule else None,
            'has_planning': planning is not None
        }
        
        if planning:
            result.update({
                'classroom_id': planning.classroom_id,
                'title': planning.title or '',
                'description': planning.description or '',
                'group_id': planning.group_id,
                'checklist_states': planning.get_checklist_states()
            })
        elif schedule:
            result.update({
                'classroom_id': schedule.classroom_id,
                'title': '',
                'description': '',
                'group_id': None,
                'checklist_states': {}
            })
        else:
            result.update({
                'classroom_id': None,
                'title': '',
                'description': '',
                'group_id': None,
                'checklist_states': {}
            })
        
        return jsonify({
            'success': True,
            'slot': result
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ===== ROUTES POUR LE RAPPORT ÉLÈVE =====

@planning_bp.route('/students/<int:classroom_id>')
@login_required
def get_classroom_students(classroom_id):
    """Récupérer la liste des élèves d'une classe"""
    try:
        from models.student import Student
        from models.classroom import Classroom
        
        # Vérifier que la classe appartient à l'utilisateur
        classroom = Classroom.query.filter_by(
            id=classroom_id,
            user_id=current_user.id
        ).first()
        
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe introuvable'}), 404
        
        # Récupérer les élèves de la classe
        students = Student.query.filter_by(
            classroom_id=classroom_id
        ).order_by(Student.last_name, Student.first_name).all()
        
        return jsonify({
            'success': True,
            'students': [
                {
                    'id': student.id,
                    'first_name': student.first_name,
                    'last_name': student.last_name,
                    'email': student.email
                }
                for student in students
            ]
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>')
@login_required
def get_student_report_info(student_id):
    """Récupérer les informations de base d'un élève"""
    try:
        print(f"DEBUG get_student_report_info: called for student_id={student_id} by user {current_user.id}")
        from models.student import Student
        from models.student_group import StudentGroup, StudentGroupMembership
        
        student = user_can_access_student(current_user.id, student_id)
        print(f"DEBUG get_student_report_info: user_can_access_student returned: {student}")
        
        if not student:
            print(f"DEBUG get_student_report_info: access denied, returning 404")
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        # Récupérer les groupes de l'élève
        groups = db.session.query(StudentGroup).join(
            StudentGroupMembership,
            StudentGroup.id == StudentGroupMembership.group_id
        ).filter(
            StudentGroupMembership.student_id == student_id,
            StudentGroup.user_id == current_user.id
        ).all()
        
        return jsonify({
            'success': True,
            'student': {
                'id': student.id,
                'first_name': student.first_name,
                'last_name': student.last_name,
                'email': student.email,
                'parent_email_mother': student.parent_email_mother,
                'parent_email_father': student.parent_email_father,
            },
            'groups': [{'id': g.id, 'name': g.name} for g in groups]
        })
        
    except Exception as e:
        print(f"DEBUG get_student_report_info: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/accommodations')
@login_required
def get_student_report_accommodations(student_id):
    """Récupérer les aménagements d'un élève selon le rôle"""
    try:
        from models.accommodation import StudentAccommodation, AccommodationTemplate
        from models.class_collaboration import ClassMaster
        from models.user import User
        
        # Vérifier l'accès à l'élève
        student = user_can_access_student(current_user.id, student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        # Vérifier si l'utilisateur actuel est maître de classe pour cette classe
        is_class_master = ClassMaster.query.filter_by(
            classroom_id=student.classroom_id,
            master_teacher_id=current_user.id
        ).first() is not None
        
        # Récupérer tous les aménagements de l'élève (prédéfinis et personnalisés)
        accommodations = StudentAccommodation.query.filter(
            StudentAccommodation.student_id == student_id,
            StudentAccommodation.is_active == True
        ).all()
        
        valid_accommodations = []
        
        if is_class_master:
            # Maître de classe : voir tous les aménagements avec attribution
            for acc in accommodations:
                teacher_name = "Inconnu"
                is_own = False
                
                if acc.template_id and acc.template:
                    # Aménagement prédéfini
                    template_user = User.query.filter_by(id=acc.template.user_id).first()
                    teacher_name = template_user.username if template_user else "Inconnu"
                    is_own = acc.template.user_id == current_user.id
                else:
                    # Aménagement personnalisé - pour l'instant, on ne peut pas identifier l'auteur
                    teacher_name = "Aménagement personnalisé"
                    is_own = False  # On ne peut pas déterminer l'auteur pour les aménagements personnalisés
                
                valid_accommodations.append({
                    'name': acc.name,
                    'emoji': acc.emoji,
                    'time_multiplier': acc.time_multiplier,
                    'teacher_name': teacher_name,
                    'is_own': is_own
                })
        else:
            # Enseignant spécialisé : voir seulement ses propres aménagements prédéfinis
            # Note: Les aménagements personnalisés ne peuvent pas être filtrés par auteur car le modèle n'a pas de user_id
            print(f"DEBUG: Enseignant spécialisé {current_user.id} vérifie {len(accommodations)} aménagements")
            for acc in accommodations:
                print(f"DEBUG: Aménagement {acc.id} - template_id: {acc.template_id}, template exists: {acc.template is not None}")
                if acc.template:
                    print(f"DEBUG: Template user_id: {acc.template.user_id}, current_user.id: {current_user.id}")
                
                # Vérifier si c'est son aménagement prédéfini
                if acc.template_id and acc.template and acc.template.user_id == current_user.id:
                    print(f"DEBUG: Aménagement {acc.id} appartient à l'enseignant spécialisé")
                    valid_accommodations.append({
                        'name': acc.name,
                        'emoji': acc.emoji,
                        'time_multiplier': acc.time_multiplier,
                        'teacher_name': current_user.username,
                        'is_own': True
                    })
                else:
                    print(f"DEBUG: Aménagement {acc.id} N'appartient PAS à l'enseignant spécialisé")
        
        return jsonify({
            'success': True,
            'accommodations': valid_accommodations
        })
        
    except Exception as e:
        print(f"ERROR in get_student_report_accommodations: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/grades')
@login_required
def get_student_report_grades(student_id):
    """Récupérer les notes d'un élève selon le rôle"""
    try:
        # Vérifier d'abord l'accès à l'élève
        student = user_can_access_student(current_user.id, student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        from models.evaluation import EvaluationGrade, Evaluation
        from models.classroom import Classroom
        from models.class_collaboration import ClassMaster, TeacherCollaboration, SharedClassroom
        from models.user import User
        
        # Déterminer le rôle de l'utilisateur actuel
        is_master = ClassMaster.query.filter_by(
            classroom_id=student.classroom_id,
            master_teacher_id=current_user.id
        ).first() is not None
        
        if is_master:
            # Maître de classe : voir toutes les évaluations avec attribution des enseignants
            # Récupérer toutes les notes de cet élève avec les informations des évaluations et enseignants
            grades_query = db.session.query(
                EvaluationGrade, 
                Evaluation, 
                Classroom,
                User
            ).join(
                Evaluation,
                EvaluationGrade.evaluation_id == Evaluation.id
            ).join(
                Classroom,
                Evaluation.classroom_id == Classroom.id
            ).join(
                User,
                Classroom.user_id == User.id
            ).filter(
                EvaluationGrade.student_id == student_id
            ).order_by(Evaluation.date.desc()).all()
            
            grades = [
                {
                    'evaluation_name': evaluation.title,
                    'score': grade.points,
                    'max_score': evaluation.max_points,
                    'date': evaluation.date.strftime('%d/%m/%Y') if evaluation.date else '',
                    'teacher_name': user.username,
                    'is_own': user.id == current_user.id,
                    'subject': classroom.subject
                }
                for grade, evaluation, classroom, user in grades_query
            ]
            
        else:
            # Enseignant spécialisé : voir seulement ses propres évaluations
            grades_query = db.session.query(
                EvaluationGrade, 
                Evaluation, 
                Classroom
            ).join(
                Evaluation,
                EvaluationGrade.evaluation_id == Evaluation.id
            ).join(
                Classroom,
                Evaluation.classroom_id == Classroom.id
            ).filter(
                EvaluationGrade.student_id == student_id,
                Classroom.user_id == current_user.id
            ).order_by(Evaluation.date.desc()).all()
            
            grades = [
                {
                    'evaluation_name': evaluation.title,
                    'score': grade.points,
                    'max_score': evaluation.max_points,
                    'date': evaluation.date.strftime('%d/%m/%Y') if evaluation.date else '',
                    'teacher_name': current_user.username,
                    'is_own': True,
                    'subject': classroom.subject
                }
                for grade, evaluation, classroom in grades_query
            ]
        
        # Organiser les notes par discipline pour l'affichage en tableau
        subjects_data = {}
        for grade in grades:
            subject = grade['subject']
            teacher = grade['teacher_name']
            
            if subject not in subjects_data:
                subjects_data[subject] = {
                    'subject': subject,
                    'teacher_name': teacher,
                    'evaluations': []
                }
            
            subjects_data[subject]['evaluations'].append({
                'evaluation_name': grade['evaluation_name'],
                'score': grade['score'],
                'max_score': grade['max_score'],
                'date': grade['date'],
                'is_own': grade['is_own']
            })
        
        # Trier les évaluations par date dans chaque matière
        for subject_data in subjects_data.values():
            subject_data['evaluations'].sort(key=lambda x: x['date'], reverse=True)
        
        return jsonify({
            'success': True,
            'grades': grades,  # Format original pour compatibilité
            'subjects_table': list(subjects_data.values())  # Format tableau
        })
        
    except Exception as e:
        print(f"ERROR in get_student_report_grades: {str(e)}")
        print(f"ERROR traceback: {e.__class__.__name__}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/sanctions')
@login_required
def get_student_report_sanctions(student_id):
    """Récupérer les sanctions/coches d'un élève selon le rôle"""
    try:
        from models.sanctions import SanctionTemplate
        from models.student_sanctions import StudentSanctionCount
        from models.student import Student
        from models.user_preferences import UserSanctionPreferences
        from models.class_collaboration import ClassMaster
        from models.user import User
        
        # Vérifier d'abord l'accès à l'élève
        student = user_can_access_student(current_user.id, student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        # Vérifier si l'utilisateur actuel est maître de classe pour cette classe
        is_class_master = ClassMaster.query.filter_by(
            classroom_id=student.classroom_id,
            master_teacher_id=current_user.id
        ).first() is not None
        
        print(f"DEBUG sanctions - User {current_user.id} accessing student {student_id}")
        print(f"DEBUG sanctions - Student classroom: {student.classroom_id}")
        print(f"DEBUG sanctions - Is class master: {is_class_master}")
        
        # Vérifier le mode de sanction pour cette classe (du maître de classe)
        class_master = ClassMaster.query.filter_by(classroom_id=student.classroom_id).first()
        if class_master:
            master_prefs = UserSanctionPreferences.get_or_create_for_user_classroom(
                class_master.master_teacher_id, student.classroom_id
            )
            is_centralized_mode = master_prefs.display_mode == 'centralized'
        else:
            is_centralized_mode = False
        
        sanctions = []
        
        if is_class_master:
            if is_centralized_mode:
                # Maître de classe en mode centralisé : voir seulement ses propres sanctions
                sanctions = db.session.query(StudentSanctionCount, SanctionTemplate).join(
                    SanctionTemplate,
                    StudentSanctionCount.template_id == SanctionTemplate.id
                ).filter(
                    StudentSanctionCount.student_id == student_id,
                    SanctionTemplate.user_id == current_user.id,
                    SanctionTemplate.is_active == True,
                    StudentSanctionCount.check_count > 0
                ).all()
                
                sanctions_data = [
                    {
                        'name': sanction_template.name,
                        'description': sanction_template.description,
                        'count': student_sanction.check_count,
                        'teacher_name': current_user.username,
                        'is_own': True
                    }
                    for student_sanction, sanction_template in sanctions
                ]
            else:
                # Maître de classe en mode normal : voir toutes les sanctions avec attribution
                all_sanctions = db.session.query(StudentSanctionCount, SanctionTemplate, User).join(
                    SanctionTemplate,
                    StudentSanctionCount.template_id == SanctionTemplate.id
                ).join(
                    User,
                    SanctionTemplate.user_id == User.id
                ).filter(
                    StudentSanctionCount.student_id == student_id,
                    SanctionTemplate.is_active == True,
                    StudentSanctionCount.check_count > 0
                ).all()
                
                print(f"DEBUG sanctions - Maître de classe (mode normal): {len(all_sanctions)} sanctions trouvées")
                for sanction, template, user in all_sanctions:
                    print(f"  - Template: {template.name} (User: {user.username}), Count: {sanction.check_count}")
                
                sanctions_data = [
                    {
                        'name': sanction_template.name,
                        'description': sanction_template.description,
                        'count': student_sanction.check_count,
                        'teacher_name': user.username,
                        'is_own': user.id == current_user.id
                    }
                    for student_sanction, sanction_template, user in all_sanctions
                ]
        else:
            # Enseignant spécialisé : voir seulement ses propres sanctions
            # Il faut chercher dans toutes les tables de sanctions car l'élève peut avoir
            # des entrées liées aux templates de l'enseignant spécialisé
            sanctions = db.session.query(StudentSanctionCount, SanctionTemplate).join(
                SanctionTemplate,
                StudentSanctionCount.template_id == SanctionTemplate.id
            ).filter(
                StudentSanctionCount.student_id == student_id,
                SanctionTemplate.user_id == current_user.id,
                SanctionTemplate.is_active == True,
                StudentSanctionCount.check_count > 0
            ).all()
            
            print(f"DEBUG sanctions - Enseignant spécialisé: {len(sanctions)} sanctions trouvées")
            for sanction, template in sanctions:
                print(f"  - Template: {template.name} (User: {template.user_id}), Count: {sanction.check_count}")
            
            sanctions_data = [
                {
                    'name': sanction_template.name,
                    'description': sanction_template.description,
                    'count': student_sanction.check_count,
                    'teacher_name': current_user.username,
                    'is_own': True
                }
                for student_sanction, sanction_template in sanctions
            ]
        
        return jsonify({
            'success': True,
            'sanctions': sanctions_data
        })
        
    except Exception as e:
        print(f"ERROR in get_student_report_sanctions: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/attendance')
@login_required
def get_student_report_attendance(student_id):
    """Récupérer les absences d'un élève selon le rôle"""
    try:
        from models.attendance import Attendance
        from models.classroom import Classroom
        from models.class_collaboration import ClassMaster
        from models.user import User
        
        # Vérifier d'abord l'accès à l'élève
        student = user_can_access_student(current_user.id, student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        # Vérifier si l'utilisateur actuel est maître de classe pour cette classe
        is_class_master = ClassMaster.query.filter_by(
            classroom_id=student.classroom_id,
            master_teacher_id=current_user.id
        ).first() is not None
        
        print(f"DEBUG attendance - User {current_user.id} accessing student {student_id}")
        print(f"DEBUG attendance - Student classroom: {student.classroom_id}")
        print(f"DEBUG attendance - Is class master: {is_class_master}")
        
        if is_class_master:
            # Maître de classe : voir toutes les absences avec attribution des enseignants
            attendances = db.session.query(Attendance, Classroom, User).join(
                Classroom,
                Attendance.classroom_id == Classroom.id
            ).join(
                User,
                Classroom.user_id == User.id
            ).filter(
                Attendance.student_id == student_id,
                Attendance.status.in_(['absent', 'late'])
            ).order_by(Attendance.date.desc()).all()
            
            print(f"DEBUG attendance - Maître de classe: {len(attendances)} absences trouvées")
            for attendance, classroom, user in attendances:
                print(f"  - Date: {attendance.date}, Status: {attendance.status}, Classroom: {classroom.name} (User: {user.username})")
            
            attendance_data = [
                {
                    'date': attendance.date.strftime('%d/%m/%Y'),
                    'period_number': attendance.period_number,
                    'status': attendance.status,
                    'late_minutes': attendance.late_minutes,
                    'classroom_name': classroom.name,
                    'teacher_name': user.username,
                    'is_own': user.id == current_user.id
                }
                for attendance, classroom, user in attendances
            ]
        else:
            # Enseignant spécialisé : voir seulement les absences qu'il a saisies dans ses classes
            attendances = db.session.query(Attendance, Classroom).join(
                Classroom,
                Attendance.classroom_id == Classroom.id
            ).filter(
                Attendance.student_id == student_id,
                Classroom.user_id == current_user.id,
                Attendance.status.in_(['absent', 'late'])
            ).order_by(Attendance.date.desc()).all()
            
            print(f"DEBUG attendance - Enseignant spécialisé: {len(attendances)} absences trouvées")
            for attendance, classroom in attendances:
                print(f"  - Date: {attendance.date}, Status: {attendance.status}, Classroom: {classroom.name} (ID: {classroom.id})")
            
            attendance_data = [
                {
                    'date': attendance.date.strftime('%d/%m/%Y'),
                    'period_number': attendance.period_number,
                    'status': attendance.status,
                    'late_minutes': attendance.late_minutes,
                    'classroom_name': classroom.name,
                    'teacher_name': current_user.username,
                    'is_own': True
                }
                for attendance, classroom in attendances
            ]
        
        return jsonify({
            'success': True,
            'attendance': attendance_data
        })
        
    except Exception as e:
        print(f"ERROR in get_student_report_attendance: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/additional-info', methods=['POST'])
@login_required
def student_report_additional_info(student_id):
    """Sauvegarder les informations supplémentaires d'un élève dans l'historique"""
    try:
        from models.student import Student
        from models.student_info_history import StudentInfoHistory
        
        student = user_can_access_student(current_user.id, student_id)
        
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        data = request.get_json()
        additional_info = data.get('additional_info', '').strip()
        
        if not additional_info:
            return jsonify({'success': False, 'message': 'Aucune information fournie'}), 400
        
        # Créer un nouvel enregistrement dans l'historique
        info_history = StudentInfoHistory(
            student_id=student_id,
            user_id=current_user.id,
            content=additional_info
        )
        db.session.add(info_history)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Informations sauvegardées'
        })
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/additional-info', methods=['GET'])
@login_required
def get_student_additional_info(student_id):
    """Récupérer les informations supplémentaires les plus récentes d'un élève"""
    try:
        from models.student import Student
        from models.student_info_history import StudentInfoHistory
        
        student = user_can_access_student(current_user.id, student_id)
        
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        # Récupérer la dernière information supplémentaire ajoutée par l'utilisateur actuel
        latest_info = StudentInfoHistory.query.filter_by(
            student_id=student_id,
            user_id=current_user.id
        ).order_by(StudentInfoHistory.created_at.desc()).first()
        
        if latest_info:
            return jsonify({
                'success': True,
                'additional_info': latest_info.content
            })
        else:
            return jsonify({
                'success': True,
                'additional_info': ''
            })
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/info-history')
@login_required
def get_student_info_history(student_id):
    """Récupérer l'historique des informations d'un élève selon le rôle"""
    try:
        from models.student import Student
        from models.student_info_history import StudentInfoHistory
        from models.class_collaboration import ClassMaster
        
        student = user_can_access_student(current_user.id, student_id)
        
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        # Vérifier si l'utilisateur actuel est maître de classe pour cette classe
        is_class_master = ClassMaster.query.filter_by(
            classroom_id=student.classroom_id,
            master_teacher_id=current_user.id
        ).first() is not None
        
        if is_class_master:
            # Maître de classe : voir toutes les informations avec attribution
            history = StudentInfoHistory.query.filter_by(
                student_id=student_id
            ).order_by(StudentInfoHistory.created_at.desc()).all()
            
            return jsonify({
                'success': True,
                'history': [
                    {
                        'id': info.id,
                        'content': info.content,
                        'created_at': info.created_at.strftime('%d/%m/%Y à %H:%M'),
                        'teacher_name': info.user.username if info.user else "Enseignant inconnu",
                        'is_own': info.user_id == current_user.id
                    }
                    for info in history
                ]
            })
        else:
            # Enseignant spécialisé : voir seulement ses propres informations
            history = StudentInfoHistory.query.filter_by(
                student_id=student_id,
                user_id=current_user.id
            ).order_by(StudentInfoHistory.created_at.desc()).all()
            
            return jsonify({
                'success': True,
                'history': [
                    {
                        'id': info.id,
                        'content': info.content,
                        'created_at': info.created_at.strftime('%d/%m/%Y à %H:%M'),
                        'teacher_name': info.user.username if info.user else "Vous",
                        'is_own': True
                    }
                    for info in history
                ]
            })
        
    except Exception as e:
        print(f"ERROR in get_student_info_history: {str(e)}")
        print(f"ERROR traceback: {e.__class__.__name__}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/behavior-summary')
@login_required
def get_student_behavior_summary(student_id):
    """Récupérer un résumé compact des sanctions et absences d'un élève"""
    try:
        from models.sanctions import SanctionTemplate
        from models.student_sanctions import StudentSanctionCount
        from models.attendance import Attendance
        from models.classroom import Classroom
        from models.class_collaboration import ClassMaster
        from models.user_preferences import UserSanctionPreferences
        from models.user import User
        from datetime import datetime, timedelta
        
        # Vérifier d'abord l'accès à l'élève
        student = user_can_access_student(current_user.id, student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        # Vérifier si l'utilisateur actuel est maître de classe pour cette classe
        is_class_master = ClassMaster.query.filter_by(
            classroom_id=student.classroom_id,
            master_teacher_id=current_user.id
        ).first() is not None
        
        # Vérifier le mode de sanction pour cette classe (du maître de classe)
        class_master = ClassMaster.query.filter_by(classroom_id=student.classroom_id).first()
        if class_master:
            master_prefs = UserSanctionPreferences.get_or_create_for_user_classroom(
                class_master.master_teacher_id, student.classroom_id
            )
            is_centralized_mode = master_prefs.display_mode == 'centralized'
        else:
            is_centralized_mode = False
        
        # Récupérer les sanctions
        if is_class_master:
            if is_centralized_mode:
                # Mode centralisé: voir seulement ses propres sanctions
                sanctions_query = db.session.query(StudentSanctionCount, SanctionTemplate, User).join(
                    SanctionTemplate,
                    StudentSanctionCount.template_id == SanctionTemplate.id
                ).join(
                    User,
                    SanctionTemplate.user_id == User.id
                ).filter(
                    StudentSanctionCount.student_id == student_id,
                    SanctionTemplate.user_id == current_user.id,
                    StudentSanctionCount.check_count > 0
                )
            else:
                # Mode normal: voir toutes les sanctions
                sanctions_query = db.session.query(StudentSanctionCount, SanctionTemplate, User).join(
                    SanctionTemplate,
                    StudentSanctionCount.template_id == SanctionTemplate.id
                ).join(
                    User,
                    SanctionTemplate.user_id == User.id
                ).filter(
                    StudentSanctionCount.student_id == student_id,
                    StudentSanctionCount.check_count > 0
                )
        else:
            # Enseignant spécialisé: voir seulement ses propres sanctions
            sanctions_query = db.session.query(StudentSanctionCount, SanctionTemplate, User).join(
                SanctionTemplate,
                StudentSanctionCount.template_id == SanctionTemplate.id
            ).join(
                User,
                SanctionTemplate.user_id == User.id
            ).filter(
                StudentSanctionCount.student_id == student_id,
                SanctionTemplate.user_id == current_user.id,
                StudentSanctionCount.check_count > 0
            )
        
        sanctions_data = sanctions_query.all()
        
        # Récupérer les absences
        if is_class_master:
            if is_centralized_mode:
                # Mode centralisé: voir seulement ses propres absences
                attendance_query = db.session.query(Attendance, User).join(
                    User,
                    Attendance.user_id == User.id
                ).filter(
                    Attendance.student_id == student_id,
                    Attendance.user_id == current_user.id,
                    Attendance.status.in_(['absent', 'late'])
                )
            else:
                # Mode normal: voir toutes les absences
                attendance_query = db.session.query(Attendance, User).join(
                    User,
                    Attendance.user_id == User.id
                ).filter(
                    Attendance.student_id == student_id,
                    Attendance.status.in_(['absent', 'late'])
                )
        else:
            # Enseignant spécialisé: voir seulement ses propres absences
            attendance_query = db.session.query(Attendance, User).join(
                User,
                Attendance.user_id == User.id
            ).filter(
                Attendance.student_id == student_id,
                Attendance.user_id == current_user.id,
                Attendance.status.in_(['absent', 'late'])
            )
        
        attendance_data = attendance_query.order_by(Attendance.date.desc()).all()
        
        # Organiser les données par enseignant pour les sanctions
        sanctions_summary = {}
        
        # Traiter les sanctions
        for sanction_count, template, user in sanctions_data:
            teacher_id = user.id
            teacher_name = user.username
            
            if teacher_id not in sanctions_summary:
                sanctions_summary[teacher_id] = {
                    'teacher_name': teacher_name,
                    'is_own': teacher_id == current_user.id,
                    'sanctions_count': 0,
                    'sanctions_details': []
                }
            
            sanctions_summary[teacher_id]['sanctions_count'] += sanction_count.check_count
            sanctions_summary[teacher_id]['sanctions_details'].append({
                'name': template.name,
                'count': sanction_count.check_count,
                'emoji': template.emoji if hasattr(template, 'emoji') else '⚠️'
            })
        
        # Grouper les absences par date et statut pour détecter les plages consécutives
        attendance_by_date = {}
        
        # D'abord organiser toutes les absences par date
        for attendance, user in attendance_data:
            date_key = attendance.date.strftime('%Y-%m-%d')
            if date_key not in attendance_by_date:
                attendance_by_date[date_key] = []
            
            attendance_by_date[date_key].append({
                'date': attendance.date,
                'period': attendance.period_number,
                'status': attendance.status,
                'teacher_id': user.id,
                'teacher_name': user.username
            })
        
        # Organiser les données par date plutôt que par enseignant
        attendance_by_day = []
        
        # Traiter les absences groupées par date
        for date_key, absences_of_day in attendance_by_date.items():
            # Trier par période pour détecter les plages consécutives
            absences_of_day.sort(key=lambda x: x['period'])
            
            # Pour cette date, créer une entrée avec tous les détails
            date_entry = {
                'date': absences_of_day[0]['date'].strftime('%d/%m'),
                'date_obj': absences_of_day[0]['date'],  # Pour le tri
                'periods_details': [],
                'total_absences': len(absences_of_day)
            }
            
            # Grouper par statut (absent/late) pour traiter séparément
            by_status = {}
            for absence in absences_of_day:
                status = absence['status']
                if status not in by_status:
                    by_status[status] = []
                by_status[status].append(absence)
            
            # Pour chaque statut, détecter les plages consécutives
            for status, status_absences in by_status.items():
                if not status_absences:
                    continue
                    
                # Grouper les périodes consécutives
                groups = []
                current_group = [status_absences[0]]
                
                for i in range(1, len(status_absences)):
                    prev_period = current_group[-1]['period']
                    curr_period = status_absences[i]['period']
                    
                    # Si la période est consécutive, ajouter au groupe
                    if curr_period == prev_period + 1:
                        current_group.append(status_absences[i])
                    else:
                        # Sinon, finaliser le groupe et en commencer un nouveau
                        groups.append(current_group)
                        current_group = [status_absences[i]]
                
                # Ajouter le dernier groupe
                groups.append(current_group)
                
                # Pour chaque groupe, créer un détail de période
                for group in groups:
                    # Utiliser le dernier enseignant du groupe comme demandé
                    last_teacher = group[-1]
                    
                    # Créer le texte de la plage
                    if len(group) == 1:
                        period_text = f"P{group[0]['period']}"
                    else:
                        period_text = f"P{group[0]['period']}-P{group[-1]['period']}"
                    
                    date_entry['periods_details'].append({
                        'period_range': period_text,
                        'status': status,
                        'status_text': 'Absent' if status == 'absent' else 'Retard',
                        'teacher_name': last_teacher['teacher_name'],
                        'teacher_id': last_teacher['teacher_id'],
                        'is_own': last_teacher['teacher_id'] == current_user.id,
                        'count': len(group)
                    })
            
            attendance_by_day.append(date_entry)
        
        # Trier par date décroissante (plus récentes en premier)
        attendance_by_day.sort(key=lambda x: x['date_obj'], reverse=True)
        
        # Limiter aux 10 jours les plus récents pour l'affichage
        attendance_by_day = attendance_by_day[:10]
        
        # Convertir en listes triées
        sanctions_list = []
        for teacher_id, data in sanctions_summary.items():
            sanctions_list.append(data)
        
        # Trier par: ses propres données en premier, puis par nom
        sanctions_list.sort(key=lambda x: (not x['is_own'], x['teacher_name']))
        
        return jsonify({
            'success': True,
            'sanctions': sanctions_list,
            'attendance': attendance_by_day,
            'is_class_master': is_class_master,
            'is_centralized_mode': is_centralized_mode
        })
        
    except Exception as e:
        print(f"ERROR in get_student_behavior_summary: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/<int:student_id>/files')
@login_required
def get_student_report_files(student_id):
    """Récupérer les fichiers associés à un élève"""
    try:
        from models.student import StudentFile
        
        files = StudentFile.query.filter_by(
            student_id=student_id,
            user_id=current_user.id
        ).order_by(StudentFile.upload_date.desc()).all()
        
        return jsonify({
            'success': True,
            'files': [
                {
                    'id': f.id,
                    'original_name': f.original_name,
                    'upload_date': f.upload_date.strftime('%d/%m/%Y à %H:%M')
                }
                for f in files
            ]
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/upload-file', methods=['POST'])
@login_required
def upload_student_report_file():
    """Upload un fichier pour un élève"""
    try:
        import os
        import uuid
        from werkzeug.utils import secure_filename
        from models.student import StudentFile
        
        student_id = request.form.get('student_id')
        files = request.files.getlist('files')
        
        if not student_id or not files:
            return jsonify({'success': False, 'message': 'Données manquantes'}), 400
        
        # Vérifier que l'élève appartient à l'utilisateur
        from models.student import Student
        student = Student.query.filter_by(
            id=student_id,
            user_id=current_user.id
        ).first()
        
        if not student:
            return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
        
        uploaded_files = []
        upload_dir = os.path.join(current_app.root_path, 'uploads', 'student_files', str(student_id))
        os.makedirs(upload_dir, exist_ok=True)
        
        for file in files:
            if file.filename:
                # Générer un nom unique
                file_extension = os.path.splitext(secure_filename(file.filename))[1]
                unique_filename = str(uuid.uuid4()) + file_extension
                file_path = os.path.join(upload_dir, unique_filename)
                
                # Sauvegarder le fichier
                file.save(file_path)
                
                # Créer l'enregistrement en base
                student_file = StudentFile(
                    student_id=student_id,
                    user_id=current_user.id,
                    original_name=file.filename,
                    file_path=file_path,
                    file_size=os.path.getsize(file_path)
                )
                db.session.add(student_file)
                uploaded_files.append(file.filename)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'{len(uploaded_files)} fichier(s) uploadé(s)',
            'files': uploaded_files
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/file/<int:file_id>/download')
@login_required
def download_student_report_file(file_id):
    """Télécharger un fichier d'élève"""
    try:
        from models.student import StudentFile
        from flask import send_file
        
        student_file = StudentFile.query.filter_by(
            id=file_id,
            user_id=current_user.id
        ).first()
        
        if not student_file:
            return jsonify({'success': False, 'message': 'Fichier introuvable'}), 404
        
        return send_file(
            student_file.file_path,
            as_attachment=True,
            download_name=student_file.original_name
        )
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/student/file/<int:file_id>', methods=['DELETE'])
@login_required
def delete_student_report_file(file_id):
    """Supprimer un fichier d'élève"""
    try:
        import os
        from models.student import StudentFile
        
        student_file = StudentFile.query.filter_by(
            id=file_id,
            user_id=current_user.id
        ).first()
        
        if not student_file:
            return jsonify({'success': False, 'message': 'Fichier introuvable'}), 404
        
        # Supprimer le fichier physique
        if os.path.exists(student_file.file_path):
            os.remove(student_file.file_path)
        
        # Supprimer l'enregistrement en base
        db.session.delete(student_file)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Fichier supprimé'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/update-justification-status', methods=['POST'])
@login_required
def update_justification_status():
    """Mettre à jour le statut d'une justification d'absence"""
    from models.absence_justification import AbsenceJustification
    from datetime import datetime
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        justification_id = data.get('justification_id')
        status = data.get('status')
        
        if not justification_id or not status:
            return jsonify({'success': False, 'message': 'ID de justification et statut requis'}), 400
        
        if status not in ['pending', 'approved', 'rejected']:
            return jsonify({'success': False, 'message': 'Statut invalide'}), 400
        
        # Récupérer la justification
        justification = AbsenceJustification.query.get(justification_id)
        if not justification:
            return jsonify({'success': False, 'message': 'Justification non trouvée'}), 404
        
        # Vérifier que l'enseignant a le droit de modifier cette justification
        # (l'élève doit être dans une de ses classes)
        student_classroom = justification.student.classroom
        if not student_classroom or student_classroom.user_id != current_user.id:
            return jsonify({'success': False, 'message': 'Non autorisé'}), 403
        
        # Mettre à jour le statut
        justification.status = status
        justification.processed_at = datetime.utcnow()
        justification.processed_by = current_user.id
        
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Statut mis à jour avec succès'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/update-teacher-response', methods=['POST'])
@login_required
def update_teacher_response():
    """Mettre à jour la réponse de l'enseignant pour une justification"""
    from models.absence_justification import AbsenceJustification
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    try:
        justification_id = data.get('justification_id')
        teacher_response = data.get('teacher_response', '')
        
        if not justification_id:
            return jsonify({'success': False, 'message': 'ID de justification requis'}), 400
        
        # Récupérer la justification
        justification = AbsenceJustification.query.get(justification_id)
        if not justification:
            return jsonify({'success': False, 'message': 'Justification non trouvée'}), 404
        
        # Vérifier que l'enseignant a le droit de modifier cette justification
        student_classroom = justification.student.classroom
        if not student_classroom or student_classroom.user_id != current_user.id:
            return jsonify({'success': False, 'message': 'Non autorisé'}), 403
        
        # Mettre à jour la réponse
        justification.teacher_response = teacher_response.strip() if teacher_response else None
        
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Note sauvegardée avec succès'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@planning_bp.route('/api/mixed-group-available-students')
@login_required
def get_mixed_group_available_students():
    """Récupérer les élèves disponibles pour un groupe mixte"""
    try:
        from models.mixed_group import MixedGroup, MixedGroupStudent
        from models.student import Student
        from models.class_collaboration import TeacherCollaboration, SharedClassroom
        from models.teacher_invitation import TeacherInvitation
        
        classroom_param = request.args.get('classroom', '')
        print(f"DEBUG: Received classroom parameter: '{classroom_param}'")
        
        # Vérifier si c'est un nom de groupe mixte avec emoji
        if classroom_param.startswith('🔀 '):
            # Extraire le nom du groupe mixte (enlever l'emoji)
            mixed_group_name = classroom_param[2:]  # Enlever "🔀 "
            print(f"DEBUG: Extracted mixed group name from emoji format: '{mixed_group_name}'")
        elif classroom_param.startswith('MIXED_'):
            # Format ancien - extraire le nom du groupe mixte depuis le paramètre
            # Extraire le nom du groupe mixte
            parts = classroom_param.split('_')
            if len(parts) < 4:
                return jsonify({'success': False, 'message': 'Format de classe mixte invalide'})
            
            mixed_group_name = '_'.join(parts[1:-2])
            print(f"DEBUG: Extracted mixed group name from MIXED format: '{mixed_group_name}'")
        else:
            return jsonify({'success': False, 'message': 'Paramètre de classe invalide - doit être un groupe mixte'})
        
        # Trouver le groupe mixte
        mixed_group = MixedGroup.query.filter_by(
            teacher_id=current_user.id,
            name=mixed_group_name
        ).first()
        
        if not mixed_group:
            return jsonify({'success': False, 'message': 'Groupe mixte non trouvé'})
        
        # Récupérer les élèves déjà dans le groupe mixte
        existing_student_ids = set()
        existing_links = MixedGroupStudent.query.filter_by(
            mixed_group_id=mixed_group.id,
            is_active=True
        ).all()
        for link in existing_links:
            existing_student_ids.add(link.student_id)
        
        print(f"DEBUG: Mixed group {mixed_group.id} already has {len(existing_student_ids)} students")
        
        # Récupérer tous les élèves disponibles des classes sources
        available_students = []
        
        # Tracker pour éviter les doublons entre les différentes sources
        added_student_ids = set()
        
        # 1. Élèves des classes du créateur
        own_classrooms = current_user.classrooms.filter_by(is_temporary=False).all()
        print(f"DEBUG: Found {len(own_classrooms)} own classrooms")
        
        # Récupérer les groupes mixtes pour filtrer les classes auto-créées
        user_mixed_groups = MixedGroup.query.filter_by(teacher_id=current_user.id, is_active=True).all()
        auto_classroom_ids = {group.auto_classroom_id for group in user_mixed_groups if group.auto_classroom_id}
        print(f"DEBUG: Auto-created classroom IDs to exclude: {auto_classroom_ids}")
        
        for classroom in own_classrooms:
            # Éviter les classes auto-créées pour groupes mixtes
            if classroom.id in auto_classroom_ids:
                print(f"DEBUG: Skipping auto-created classroom {classroom.id} ({classroom.name})")
                continue
                
            classroom_students = Student.query.filter_by(classroom_id=classroom.id).all()
            print(f"DEBUG: Classroom {classroom.name} has {len(classroom_students)} students")
            
            for student in classroom_students:
                if student.id not in existing_student_ids:
                    available_students.append({
                        'id': student.id,
                        'full_name': student.full_name,
                        'source_class_name': classroom.name,
                        'source_type': 'own'
                    })
                    # Ajouter au tracker pour éviter les doublons dans les autres sections
                    added_student_ids.add(student.id)
                    print(f"DEBUG: Added student {student.full_name} from own class {classroom.name}")
                else:
                    print(f"DEBUG: Student {student.full_name} already in mixed group, skipping")
        
        # 2. Élèves des classes jointes par code d'accès
        # D'abord, debug : voir TOUTES les collaborations dans la DB
        all_collaborations_in_db = TeacherCollaboration.query.all()
        print(f"DEBUG: Total collaborations in DB: {len(all_collaborations_in_db)}")
        for collab in all_collaborations_in_db:
            print(f"  - Collaboration {collab.id}: master={collab.master_teacher_id}, specialized={collab.specialized_teacher_id}, active={collab.is_active}")
        
        # Debug : voir TOUS les SharedClassroom aussi
        all_shared_classrooms = SharedClassroom.query.all() 
        print(f"DEBUG: Total shared classrooms in DB: {len(all_shared_classrooms)}")
        for sc in all_shared_classrooms:
            collab = TeacherCollaboration.query.get(sc.collaboration_id)
            print(f"  - SharedClassroom {sc.id}: collab={sc.collaboration_id}, original={sc.original_classroom_id}, derived={sc.derived_classroom_id}")
            if collab:
                print(f"    → Collaboration: master={collab.master_teacher_id}, specialized={collab.specialized_teacher_id}, active={collab.is_active}")
        
        # Chercher les collaborations où l'utilisateur actuel est l'enseignant spécialisé
        collaborations = TeacherCollaboration.query.filter_by(
            specialized_teacher_id=current_user.id,
            is_active=True
        ).all()
        print(f"DEBUG: Found {len(collaborations)} collaborations where current user ({current_user.id}) is specialized teacher")
        
        # Aussi chercher les collaborations où l'utilisateur actuel est le maître de classe
        # (au cas où il aurait rejoint via code mais est maintenant dans un groupe mixte)
        master_collaborations = TeacherCollaboration.query.filter_by(
            master_teacher_id=current_user.id,
            is_active=True
        ).all()
        print(f"DEBUG: Found {len(master_collaborations)} collaborations where current user ({current_user.id}) is master teacher")
        
        # Combiner les deux listes
        all_collaborations = collaborations + master_collaborations
        print(f"DEBUG: Total {len(all_collaborations)} collaborations for code access")
        
        for collaboration in all_collaborations:
            print(f"DEBUG: Processing collaboration {collaboration.id} - master: {collaboration.master_teacher_id}, specialized: {collaboration.specialized_teacher_id}")
            shared_classrooms = SharedClassroom.query.filter_by(
                collaboration_id=collaboration.id
            ).all()
            print(f"DEBUG: Found {len(shared_classrooms)} shared classrooms for collaboration {collaboration.id}")
            
            for shared_classroom in shared_classrooms:
                # Pour les groupes mixtes, on veut TOUS les élèves de la classe originale
                # (pas seulement ceux qui ont été sélectionnés dans la classe dérivée)
                original_students = Student.query.filter_by(
                    classroom_id=shared_classroom.original_classroom_id
                ).all()
                
                students_to_use = original_students
                original_classroom_name = shared_classroom.original_classroom.name if shared_classroom.original_classroom else 'Unknown'
                print(f"DEBUG: Code access - class {original_classroom_name} has {len(students_to_use)} students from original classroom")
                
                for student in students_to_use:
                    if student.id not in existing_student_ids and student.id not in added_student_ids:
                        available_students.append({
                            'id': student.id,
                            'full_name': student.full_name,
                            'source_class_name': original_classroom_name,
                            'source_type': 'code_access'
                        })
                        added_student_ids.add(student.id)
                        print(f"DEBUG: Added student {student.full_name} from code access class {original_classroom_name}")
                    elif student.id in existing_student_ids:
                        print(f"DEBUG: Student {student.full_name} already in mixed group, skipping")
                    else:
                        print(f"DEBUG: Student {student.full_name} already added from another source, skipping")
        
        # 2.5. NOUVEAU : Retrouver les classes sources à partir des élèves déjà dans le groupe mixte
        # Analyser les élèves actuels du groupe mixte pour identifier leurs classes d'origine
        current_mixed_students = MixedGroupStudent.query.filter_by(
            mixed_group_id=mixed_group.id,
            is_active=True
        ).all()
        
        source_classrooms_found = set()
        for link in current_mixed_students:
            student = Student.query.get(link.student_id)
            if student and student.classroom_id:
                # Vérifier si cette classe n'appartient PAS à l'utilisateur actuel
                classroom = student.classroom
                if classroom and classroom.user_id != current_user.id:
                    source_classrooms_found.add(student.classroom_id)
                    print(f"DEBUG: Found source classroom {classroom.id} ({classroom.name}) from student {student.full_name}")
        
        print(f"DEBUG: Found {len(source_classrooms_found)} source classrooms from current mixed group students")
        
        # Récupérer tous les élèves de ces classes sources
        for classroom_id in source_classrooms_found:
            classroom = Classroom.query.get(classroom_id)
            if classroom:
                classroom_students = Student.query.filter_by(classroom_id=classroom_id).all()
                print(f"DEBUG: Source classroom {classroom.name} has {len(classroom_students)} students")
                
                for student in classroom_students:
                    if student.id not in existing_student_ids and student.id not in added_student_ids:
                        available_students.append({
                            'id': student.id,
                            'full_name': student.full_name,
                            'source_class_name': classroom.name,
                            'source_type': 'mixed_group_source'
                        })
                        added_student_ids.add(student.id)
                        print(f"DEBUG: Added student {student.full_name} from mixed group source class {classroom.name}")
                    elif student.id in existing_student_ids:
                        print(f"DEBUG: Student {student.full_name} already in mixed group, skipping")
                    else:
                        print(f"DEBUG: Student {student.full_name} already added from another source, skipping")
        
        # 3. Élèves des invitations acceptées
        accepted_invitations = TeacherInvitation.query.filter_by(
            requesting_teacher_id=current_user.id,
            status='accepted'
        ).all()
        print(f"DEBUG: Found {len(accepted_invitations)} accepted invitations")
        
        # Créer un set des IDs de classes propres pour éviter les doublons
        own_classroom_ids = {classroom.id for classroom in current_user.classrooms.filter_by(is_temporary=False).all()}
        
        for invitation in accepted_invitations:
            # Skip si c'est une invitation pour une classe que l'utilisateur possède déjà
            if invitation.target_classroom_id in own_classroom_ids:
                print(f"DEBUG: Skipping invitation for own class {invitation.target_classroom.name if invitation.target_classroom else 'Unknown'}")
                continue
                
            invitation_students = Student.query.filter_by(
                classroom_id=invitation.target_classroom_id
            ).all()
            print(f"DEBUG: Accepted invitation - class {invitation.target_classroom.name if invitation.target_classroom else 'Unknown'} has {len(invitation_students)} students")
            
            for student in invitation_students:
                if student.id not in existing_student_ids and student.id not in added_student_ids:
                    available_students.append({
                        'id': student.id,
                        'full_name': student.full_name,
                        'source_class_name': invitation.target_classroom.name if invitation.target_classroom else 'Classe inconnue',
                        'source_type': 'invitation'
                    })
                    added_student_ids.add(student.id)
                    print(f"DEBUG: Added student {student.full_name} from accepted invitation class {invitation.target_classroom.name if invitation.target_classroom else 'Unknown'}")
                elif student.id in added_student_ids:
                    print(f"DEBUG: Student {student.full_name} already added from another source, skipping")
        
        print(f"DEBUG: Found {len(available_students)} available students for mixed group")
        
        return jsonify({
            'success': True,
            'students': available_students
        })
        
    except Exception as e:
        print(f"ERROR in get_mixed_group_available_students: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

@planning_bp.route('/api/add-mixed-group-students', methods=['POST'])
@login_required
def add_mixed_group_students():
    """Ajouter des élèves à un groupe mixte"""
    try:
        from models.mixed_group import MixedGroup, MixedGroupStudent
        from models.student import Student
        
        data = request.get_json()
        classroom_param = data.get('classroom', '')
        student_ids = data.get('student_ids', [])
        
        if not student_ids:
            return jsonify({'success': False, 'message': 'Aucun élève sélectionné'})
        
        # Vérifier si c'est un nom de groupe mixte avec emoji
        if classroom_param.startswith('🔀 '):
            # Extraire le nom du groupe mixte (enlever l'emoji)
            mixed_group_name = classroom_param[2:]  # Enlever "🔀 "
        elif classroom_param.startswith('MIXED_'):
            # Format ancien - extraire le nom du groupe mixte depuis le paramètre
            parts = classroom_param.split('_')
            if len(parts) < 4:
                return jsonify({'success': False, 'message': 'Format de classe mixte invalide'})
            mixed_group_name = '_'.join(parts[1:-2])
        else:
            return jsonify({'success': False, 'message': 'Paramètre de classe invalide'})
        
        # Trouver le groupe mixte
        mixed_group = MixedGroup.query.filter_by(
            teacher_id=current_user.id,
            name=mixed_group_name
        ).first()
        
        if not mixed_group:
            return jsonify({'success': False, 'message': 'Groupe mixte non trouvé'})
        
        added_count = 0
        
        for student_id in student_ids:
            student = Student.query.get(student_id)
            if not student:
                continue
            
            # Vérifier si l'élève n'est pas déjà dans le groupe
            existing_link = MixedGroupStudent.query.filter_by(
                mixed_group_id=mixed_group.id,
                student_id=student_id
            ).first()
            
            if not existing_link:
                # Ajouter l'élève au groupe mixte
                mixed_student = MixedGroupStudent(
                    mixed_group_id=mixed_group.id,
                    student_id=student_id
                )
                db.session.add(mixed_student)
                added_count += 1
                
                # Copier l'élève dans la classe auto-créée
                if mixed_group.auto_classroom:
                    auto_student = Student(
                        classroom_id=mixed_group.auto_classroom.id,
                        user_id=current_user.id,
                        first_name=student.first_name,
                        last_name=student.last_name,
                        email=student.email,
                        date_of_birth=student.date_of_birth,
                        parent_email_mother=student.parent_email_mother,
                        parent_email_father=student.parent_email_father,
                        additional_info=student.additional_info
                    )
                    db.session.add(auto_student)
        
        db.session.commit()
        
        print(f"DEBUG: Added {added_count} students to mixed group '{mixed_group.name}'")
        
        return jsonify({
            'success': True,
            'message': f'{added_count} élève(s) ajouté(s) avec succès',
            'added_count': added_count
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"ERROR in add_mixed_group_students: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

@planning_bp.route('/api/delete-mixed-group-student', methods=['POST'])
@login_required
def delete_mixed_group_student():
    """Supprimer un élève d'un groupe mixte"""
    try:
        from models.mixed_group import MixedGroup, MixedGroupStudent
        from models.student import Student
        
        data = request.get_json()
        classroom_param = data.get('classroom', '')
        student_id = data.get('student_id')
        
        if not student_id:
            return jsonify({'success': False, 'message': 'ID élève manquant'})
        
        # Vérifier si c'est un nom de groupe mixte avec emoji
        if classroom_param.startswith('🔀 '):
            # Extraire le nom du groupe mixte (enlever l'emoji)
            mixed_group_name = classroom_param[2:]  # Enlever "🔀 "
        elif classroom_param.startswith('MIXED_'):
            # Format ancien - extraire le nom du groupe mixte depuis le paramètre
            parts = classroom_param.split('_')
            if len(parts) < 4:
                return jsonify({'success': False, 'message': 'Format de classe mixte invalide'})
            mixed_group_name = '_'.join(parts[1:-2])
        else:
            return jsonify({'success': False, 'message': 'Paramètre de classe invalide'})
        
        # Trouver le groupe mixte
        mixed_group = MixedGroup.query.filter_by(
            teacher_id=current_user.id,
            name=mixed_group_name
        ).first()
        
        if not mixed_group:
            return jsonify({'success': False, 'message': 'Groupe mixte non trouvé'})
        
        # Trouver l'élève dans le groupe mixte
        mixed_student_link = MixedGroupStudent.query.filter_by(
            mixed_group_id=mixed_group.id,
            student_id=student_id
        ).first()
        
        if not mixed_student_link:
            return jsonify({'success': False, 'message': 'Élève non trouvé dans le groupe mixte'})
        
        # Supprimer l'élève du groupe mixte
        db.session.delete(mixed_student_link)
        
        # Supprimer aussi l'élève de la classe auto-créée s'il existe
        if mixed_group.auto_classroom:
            auto_student = Student.query.filter_by(
                classroom_id=mixed_group.auto_classroom.id,
                first_name=mixed_student_link.student.first_name,
                last_name=mixed_student_link.student.last_name,
                email=mixed_student_link.student.email
            ).first()
            
            if auto_student:
                db.session.delete(auto_student)
        
        db.session.commit()
        
        print(f"DEBUG: Removed student {student_id} from mixed group '{mixed_group.name}'")
        
        return jsonify({
            'success': True,
            'message': 'Élève supprimé du groupe mixte avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"ERROR in delete_mixed_group_student: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

# ==================== ROUTES POUR LES MÉMOS ET REMARQUES ====================

@planning_bp.route('/create_lesson_memo', methods=['POST'])
@login_required
@teacher_required
def create_lesson_memo():
    """Créer un nouveau mémo de classe"""
    import logging
    logger = logging.getLogger(__name__)
    logger.error("=" * 80)
    logger.error("DEBUG create_lesson_memo - DEBUT")
    try:
        data = request.get_json()
        logger.error(f"DEBUG - Raw data: {data}")

        classroom_id = data.get('classroom_id')
        mixed_group_id = data.get('mixed_group_id')
        source_date_str = data.get('source_date')
        source_period = data.get('source_period')
        content = data.get('content')
        date_type_param = data.get('date_type')
        target_date_str = data.get('target_date')

        logger.error(f"DEBUG - Parsed values:")
        logger.error(f"  classroom_id: {classroom_id}")
        logger.error(f"  mixed_group_id: {mixed_group_id}")
        logger.error(f"  source_date_str: {source_date_str}")
        logger.error(f"  source_period: {source_period}")
        logger.error(f"  content: {content}")
        logger.error(f"  date_type_param: {date_type_param}")

        if not content:
            print("DEBUG - ERROR: Content is empty!")
            return jsonify({'success': False, 'error': 'Contenu requis'}), 400

        source_date = datetime.strptime(source_date_str, '%Y-%m-%d').date()
        print(f"DEBUG - source_date parsed: {source_date}")
        
        # Calculer la date cible selon le type
        target_date = None
        target_period = None
        
        if date_type_param == 'next_lesson':
            # Trouver le prochain cours avec cette classe
            logger.error(f"DEBUG - Calculating next_lesson from source_date={source_date}, classroom_id={classroom_id}, mixed_group_id={mixed_group_id}")
            next_schedule = None
            current_day = source_date + timedelta(days=1)

            # Chercher dans les 30 prochains jours
            for day_count in range(30):
                weekday = current_day.weekday()
                logger.error(f"DEBUG - Checking day {day_count}: {current_day}, weekday={weekday}")

                # Chercher un créneau pour cette classe ce jour-là
                if classroom_id:
                    schedules = Schedule.query.filter_by(
                        user_id=current_user.id,
                        classroom_id=classroom_id,
                        weekday=weekday
                    ).order_by(Schedule.period_number).all()
                else:
                    schedules = Schedule.query.filter_by(
                        user_id=current_user.id,
                        mixed_group_id=mixed_group_id,
                        weekday=weekday
                    ).order_by(Schedule.period_number).all()

                logger.error(f"DEBUG - Found {len(schedules)} schedules for this day")

                if schedules:
                    # Prendre la première période non fusionnée avec la précédente
                    for sched in schedules:
                        logger.error(f"DEBUG - Checking schedule period={sched.period_number}, merged_with_previous={sched.merged_with_previous}")
                        if not sched.merged_with_previous:
                            next_schedule = sched
                            target_date = current_day
                            target_period = sched.period_number
                            logger.error(f"DEBUG - FOUND next lesson: date={target_date}, period={target_period}")
                            break

                    if next_schedule:
                        break

                current_day += timedelta(days=1)

            if not next_schedule:
                logger.error("DEBUG - WARNING: No next lesson found in the next 30 days!")
                
        elif date_type_param == 'next_week':
            target_date = source_date + timedelta(days=7)
            
        elif date_type_param == 'custom' and target_date_str:
            target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
        
        # Debug
        print(f"DEBUG create_lesson_memo:")
        print(f"  date_type: {date_type_param}")
        print(f"  source_date: {source_date}")
        print(f"  target_date: {target_date}")
        print(f"  target_period: {target_period}")
        print(f"  content: {content}")

        # Créer le mémo
        memo = LessonMemo(
            user_id=current_user.id,
            classroom_id=classroom_id,
            mixed_group_id=mixed_group_id,
            source_date=source_date,
            source_period=source_period,
            target_date=target_date,
            target_period=target_period,
            content=content
        )

        db.session.add(memo)
        db.session.commit()

        print(f"  Mémo créé avec ID: {memo.id}")

        return jsonify({'success': True, 'memo_id': memo.id})
        
    except Exception as e:
        db.session.rollback()
        print(f"DEBUG - EXCEPTION in create_lesson_memo: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@planning_bp.route('/create_student_remark', methods=['POST'])
@login_required
@teacher_required
def create_student_remark():
    """Créer une nouvelle remarque élève"""
    print("=" * 80)
    print("DEBUG create_student_remark - DEBUT")
    try:
        data = request.get_json()
        print(f"DEBUG - Raw data: {data}")

        student_id = data.get('student_id')
        source_date_str = data.get('source_date')
        source_period = data.get('source_period')
        content = data.get('content')

        print(f"DEBUG - Parsed values:")
        print(f"  student_id: {student_id}")
        print(f"  source_date_str: {source_date_str}")
        print(f"  source_period: {source_period}")
        print(f"  content: {content}")

        if not student_id or not content:
            print("DEBUG - ERROR: student_id or content is missing!")
            return jsonify({'success': False, 'error': 'Données manquantes'}), 400

        source_date = datetime.strptime(source_date_str, '%Y-%m-%d').date()
        print(f"DEBUG - source_date parsed: {source_date}")
        
        # Créer la remarque
        remark = StudentRemark(
            user_id=current_user.id,
            student_id=student_id,
            source_date=source_date,
            source_period=source_period,
            content=content
        )
        
        db.session.add(remark)
        
        # Ajouter également à l'historique des informations supplémentaires
        info_entry = StudentInfoHistory(
            student_id=student_id,
            user_id=current_user.id,
            content=f"[{source_date.strftime('%d/%m/%Y')}] {content}"
        )
        db.session.add(info_entry)
        
        db.session.commit()

        print(f"DEBUG - Remark created with ID: {remark.id}")
        print("=" * 80)
        return jsonify({'success': True, 'remark_id': remark.id})

    except Exception as e:
        db.session.rollback()
        print(f"DEBUG - EXCEPTION in create_student_remark: {str(e)}")
        import traceback
        traceback.print_exc()
        print("=" * 80)
        return jsonify({'success': False, 'error': str(e)}), 500


@planning_bp.route('/get_lesson_memos_remarks', methods=['GET'])
@login_required
@teacher_required
def get_lesson_memos_remarks():
    """Récupérer tous les mémos et remarques pour une leçon"""
    try:
        date_str = request.args.get('date')
        period = request.args.get('period', type=int)
        
        lesson_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        # Récupérer les mémos
        memos = LessonMemo.query.filter_by(
            user_id=current_user.id,
            source_date=lesson_date,
            source_period=period
        ).all()
        
        # Récupérer les remarques
        remarks = StudentRemark.query.filter_by(
            user_id=current_user.id,
            source_date=lesson_date,
            source_period=period
        ).all()
        
        # Formater les données
        memos_data = [{
            'id': m.id,
            'content': m.content,
            'target_date': m.target_date.isoformat() if m.target_date else None,
            'is_completed': m.is_completed
        } for m in memos]
        
        remarks_data = [{
            'id': r.id,
            'content': r.content,
            'student_id': r.student_id,
            'student_name': f"{r.student.first_name} {r.student.last_name}"
        } for r in remarks]
        
        return jsonify({
            'success': True,
            'memos': memos_data,
            'remarks': remarks_data
        })
        
    except Exception as e:
        print(f"Erreur lors de la récupération des mémos/remarques: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@planning_bp.route('/update_lesson_memo/<int:memo_id>', methods=['PUT'])
@login_required
@teacher_required
def update_lesson_memo(memo_id):
    """Mettre à jour un mémo"""
    try:
        memo = LessonMemo.query.get_or_404(memo_id)
        
        if memo.user_id != current_user.id:
            return jsonify({'success': False, 'error': 'Non autorisé'}), 403
        
        data = request.get_json()
        if 'content' in data:
            memo.content = data['content']
        if 'is_completed' in data:
            memo.is_completed = data['is_completed']
        
        db.session.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@planning_bp.route('/delete_lesson_memo/<int:memo_id>', methods=['DELETE'])
@login_required
@teacher_required
def delete_lesson_memo(memo_id):
    """Supprimer un mémo"""
    try:
        memo = LessonMemo.query.get_or_404(memo_id)
        
        if memo.user_id != current_user.id:
            return jsonify({'success': False, 'error': 'Non autorisé'}), 403
        
        db.session.delete(memo)
        db.session.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@planning_bp.route('/update_student_remark/<int:remark_id>', methods=['PUT'])
@login_required
@teacher_required
def update_student_remark(remark_id):
    """Mettre à jour une remarque"""
    try:
        remark = StudentRemark.query.get_or_404(remark_id)
        
        if remark.user_id != current_user.id:
            return jsonify({'success': False, 'error': 'Non autorisé'}), 403
        
        data = request.get_json()
        if 'content' in data:
            remark.content = data['content']
        
        db.session.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@planning_bp.route('/delete_student_remark/<int:remark_id>', methods=['DELETE'])
@login_required
@teacher_required
def delete_student_remark(remark_id):
    """Supprimer une remarque"""
    try:
        remark = StudentRemark.query.get_or_404(remark_id)
        
        if remark.user_id != current_user.id:
            return jsonify({'success': False, 'error': 'Non autorisé'}), 403
        
        db.session.delete(remark)
        db.session.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
