from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_required, current_user
from extensions import db
from models.classroom import Classroom
from models.schedule import Schedule
from datetime import datetime, time, timedelta

schedule_bp = Blueprint('schedule', __name__, url_prefix='/schedule')

def calculate_periods(user):
    """Calcule les périodes en fonction de la configuration de l'utilisateur"""
    periods = []
    start_time = datetime.combine(datetime.today(), user.day_start_time)
    end_time = datetime.combine(datetime.today(), user.day_end_time)

    # Récupérer les pauses majeures
    major_breaks = [(b.start_time, b.end_time) for b in user.breaks.filter_by(is_major_break=True).all()]

    current_time = start_time
    period_number = 1

    while current_time < end_time:
        period_end = current_time + timedelta(minutes=user.period_duration)

        # Vérifier si cette période chevauche avec une pause majeure
        period_start_time = current_time.time()
        period_end_time = period_end.time()

        is_before_major_break = False
        for break_start, break_end in major_breaks:
            if period_end_time >= break_start and period_start_time < break_start:
                # La période se termine au début de la pause majeure
                period_end = datetime.combine(datetime.today(), break_start)
                is_before_major_break = True
                break

        periods.append({
            'number': period_number,
            'start': current_time.time(),
            'end': period_end.time()
        })

        # Calculer le prochain début de période
        if is_before_major_break:
            # Trouver la fin de la pause majeure
            for break_start, break_end in major_breaks:
                if period_end.time() == break_start:
                    current_time = datetime.combine(datetime.today(), break_end)
                    break
        else:
            # Ajouter la pause intercours normale
            current_time = period_end + timedelta(minutes=user.break_duration)

        period_number += 1

        # Vérifier si on dépasse la fin de journée
        if current_time >= end_time:
            break

    return periods

@schedule_bp.route('/weekly')
@login_required
def weekly_schedule():
    # Vérifier d'abord que la configuration de base est complète
    if not current_user.school_year_start or not current_user.day_start_time:
        flash('Veuillez d\'abord compléter la configuration initiale.', 'warning')
        return redirect(url_for('setup.initial_setup'))

    if current_user.classrooms.count() == 0:
        flash('Veuillez d\'abord ajouter au moins une classe.', 'warning')
        return redirect(url_for('setup.manage_classrooms'))

    # Si déjà complété, proposer d'aller au tableau de bord
    if current_user.schedule_completed:
        flash('Votre horaire type est déjà configuré. Vous pouvez le modifier ici.', 'info')

    # Récupérer les groupes mixtes d'abord pour filtrer les classes auto-créées
    from models.mixed_group import MixedGroup
    mixed_groups = MixedGroup.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    
    # IDs des classes auto-créées pour les groupes mixtes (à exclure)
    auto_classroom_ids = {group.auto_classroom_id for group in mixed_groups if group.auto_classroom_id}
    
    # Récupérer les classes en excluant celles auto-créées pour les groupes mixtes
    classrooms = [c for c in current_user.classrooms.all() if c.id not in auto_classroom_ids]

    # Convertir les classrooms en dictionnaires pour JSON
    classrooms_dict = [{
        'id': c.id,
        'name': c.name,
        'subject': c.subject,
        'color': c.color,
        'type': 'classroom'
    } for c in classrooms]
    
    # Ajouter les groupes mixtes avec emoji
    for group in mixed_groups:
        classrooms_dict.append({
            'id': group.id,
            'name': group.name,
            'subject': group.subject,
            'color': group.color,
            'type': 'mixed_group'
        })

    periods = calculate_periods(current_user)

    # Convertir les périodes pour JSON
    periods_json = []
    for period in periods:
        periods_json.append({
            'number': period['number'],
            'start': period['start'].strftime('%H:%M'),
            'end': period['end'].strftime('%H:%M')
        })

    schedules = current_user.schedules.all()

    # Organiser les horaires par jour et période
    schedule_grid = {}
    for schedule in schedules:
        key = f"{schedule.weekday}_{schedule.period_number}"
        schedule_grid[key] = schedule

    days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']

    return render_template('setup/weekly_schedule.html',
                         classrooms=classrooms,
                         classrooms_json=classrooms_dict,
                         periods=periods,
                         periods_json=periods_json,
                         schedule_grid=schedule_grid,
                         days=days)

@schedule_bp.route('/save', methods=['POST'])
@login_required
def save_schedule():
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    try:
        weekday = data.get('weekday')
        period_number = data.get('period_number')
        classroom_id_param = data.get('classroom_id')
        mixed_group_id_param = data.get('mixed_group_id')
        custom_task_title_raw = data.get('custom_task_title', '')
        custom_task_title = custom_task_title_raw.strip() if custom_task_title_raw else ''
        item_type = data.get('type', 'classroom')  # 'classroom', 'mixed_group' ou 'custom'
        
        # Initialiser les variables
        classroom_id = None
        mixed_group_id = None

        # Vérifier si un horaire existe déjà pour ce créneau
        existing = Schedule.query.filter_by(
            user_id=current_user.id,
            weekday=weekday,
            period_number=period_number
        ).first()

        if classroom_id_param or mixed_group_id_param or custom_task_title:
            # Vérifier selon le type
            if item_type == 'mixed_group' and mixed_group_id_param:
                from models.mixed_group import MixedGroup
                mixed_group = MixedGroup.query.filter_by(id=mixed_group_id_param, teacher_id=current_user.id).first()
                if not mixed_group:
                    return jsonify({'success': False, 'message': 'Groupe mixte non trouvé'}), 404
                classroom_id = None
                mixed_group_id = mixed_group_id_param
                custom_task_title = None
            elif item_type == 'classroom' and classroom_id_param:
                # Vérifier que la classe appartient à l'utilisateur
                classroom = Classroom.query.filter_by(id=classroom_id_param, user_id=current_user.id).first()
                if not classroom:
                    return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
                classroom_id = classroom_id_param
                mixed_group_id = None
                custom_task_title = None
            elif item_type == 'custom' and custom_task_title:
                if not custom_task_title:
                    return jsonify({'success': False, 'message': 'Le titre de la tâche est obligatoire'}), 400
                classroom_id = None
                mixed_group_id = None
            else:
                return jsonify({'success': False, 'message': 'Paramètres invalides'}), 400

            # Calculer les heures de début et fin
            periods = calculate_periods(current_user)
            period = next((p for p in periods if p['number'] == period_number), None)
            if not period:
                return jsonify({'success': False, 'message': 'Période non valide'}), 400

            if existing:
                # Mettre à jour
                existing.classroom_id = classroom_id
                existing.mixed_group_id = mixed_group_id
                existing.custom_task_title = custom_task_title
                existing.start_time = period['start']
                existing.end_time = period['end']
            else:
                # Créer nouveau
                schedule = Schedule(
                    user_id=current_user.id,
                    classroom_id=classroom_id,
                    mixed_group_id=mixed_group_id,
                    custom_task_title=custom_task_title,
                    weekday=weekday,
                    period_number=period_number,
                    start_time=period['start'],
                    end_time=period['end']
                )
                db.session.add(schedule)
        else:
            # Supprimer l'horaire si pas de classe ou groupe mixte sélectionné
            if existing:
                db.session.delete(existing)

        db.session.commit()
        return jsonify({'success': True})

    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"❌ Erreur dans save_schedule: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'message': str(e)}), 500

@schedule_bp.route('/validate', methods=['POST'])
@login_required
def validate_schedule():
    # Vérifier qu'il y a au moins un cours dans l'horaire
    schedules_count = current_user.schedules.count()
    if schedules_count == 0:
        flash('Veuillez ajouter au moins un cours dans votre horaire type.', 'warning')
        return redirect(url_for('schedule.weekly_schedule'))

    # Marquer l'horaire comme complété et s'assurer que le setup de base est aussi marqué comme complété
    current_user.schedule_completed = True
    current_user.setup_completed = True
    db.session.commit()

    flash('Horaire type validé avec succès ! Vous pouvez maintenant accéder à votre calendrier.', 'success')
    return redirect(url_for('planning.dashboard'))

@schedule_bp.route('/view')
@login_required
def view_schedule():
    """Affichage simple de l'horaire type sans navigation ni progression"""
    # Vérifier que l'horaire est configuré
    if not current_user.schedule_completed:
        flash('Veuillez d\'abord configurer votre horaire type.', 'warning')
        return redirect(url_for('schedule.weekly_schedule'))

    # Récupérer les groupes mixtes d'abord pour filtrer les classes auto-créées
    from models.mixed_group import MixedGroup
    mixed_groups = MixedGroup.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    
    # IDs des classes auto-créées pour les groupes mixtes (à exclure)
    auto_classroom_ids = {group.auto_classroom_id for group in mixed_groups if group.auto_classroom_id}
    
    # Récupérer les classes en excluant celles auto-créées pour les groupes mixtes
    classrooms = [c for c in current_user.classrooms.all() if c.id not in auto_classroom_ids]

    # Convertir les classrooms en dictionnaires pour JSON
    classrooms_dict = [{
        'id': c.id,
        'name': c.name,
        'subject': c.subject,
        'color': c.color,
        'type': 'classroom'
    } for c in classrooms]
    
    # Ajouter les groupes mixtes avec emoji
    for group in mixed_groups:
        classrooms_dict.append({
            'id': group.id,
            'name': group.name,
            'subject': group.subject,
            'color': group.color,
            'type': 'mixed_group'
        })

    periods = calculate_periods(current_user)

    # Convertir les périodes pour JSON
    periods_json = []
    for period in periods:
        periods_json.append({
            'number': period['number'],
            'start': period['start'].strftime('%H:%M'),
            'end': period['end'].strftime('%H:%M')
        })

    schedules = current_user.schedules.all()

    # Organiser les horaires par jour et période
    schedule_grid = {}
    schedule_grid_json = {}
    for schedule in schedules:
        key = f"{schedule.weekday}_{schedule.period_number}"
        schedule_grid[key] = schedule
        # Créer une version JSON-serializable pour JavaScript
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
            print(f"WARNING: Found orphaned schedule {schedule.id} with deleted classroom_id {schedule.classroom_id}")
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
            print(f"WARNING: Found orphaned schedule {schedule.id} with deleted mixed_group_id {schedule.mixed_group_id}")
            continue

    days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']

    # Créer une version JSON-sérialisable de current_user
    current_user_json = {
        'id': current_user.id,
        'period_duration': current_user.period_duration or 45,
        'day_start_time': current_user.day_start_time.strftime('%H:%M') if current_user.day_start_time else '08:00',
        'day_end_time': current_user.day_end_time.strftime('%H:%M') if current_user.day_end_time else '17:00'
    }

    return render_template('schedule/view_schedule.html',
                         classrooms=classrooms,
                         classrooms_json=classrooms_dict,
                         periods=periods,
                         periods_json=periods_json,
                         schedule_grid=schedule_grid,
                         schedule_grid_json=schedule_grid_json,
                         days=days,
                         current_user=current_user,
                         current_user_json=current_user_json)

@schedule_bp.route('/merge-periods', methods=['POST'])
@login_required
def merge_periods():
    """Fusionner deux périodes consécutives avec la même classe/discipline"""
    try:
        print(f"[DEBUG] Merge periods called for user {current_user.id}")
        data = request.get_json()
        print(f"[DEBUG] Received data: {data}")
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'Aucune donnée reçue'
            })
            
        weekday = int(data.get('weekday'))
        period_start = int(data.get('period_start'))
        period_end = int(data.get('period_end'))
        
        print(f"[DEBUG] Parameters: weekday={weekday}, period_start={period_start}, period_end={period_end}")
        
        # Vérifier que les périodes sont consécutives
        if period_end != period_start + 1:
            return jsonify({
                'success': False,
                'message': 'Les périodes doivent être consécutives'
            })
        
        # Récupérer les schedules existants
        schedule_start = Schedule.query.filter_by(
            user_id=current_user.id,
            weekday=weekday,
            period_number=period_start
        ).first()
        
        schedule_end = Schedule.query.filter_by(
            user_id=current_user.id,
            weekday=weekday,
            period_number=period_end
        ).first()
        
        print(f"[DEBUG] Found schedule_start: {schedule_start}")
        print(f"[DEBUG] Found schedule_end: {schedule_end}")
        
        # Vérifier qu'ils existent et sont identiques
        if not schedule_start or not schedule_end:
            return jsonify({
                'success': False,
                'message': 'Les deux périodes doivent être assignées'
            })
        
        # Vérifier qu'ils ont la même classe/discipline
        same_class = False
        if (schedule_start.classroom_id and schedule_end.classroom_id and 
            schedule_start.classroom_id == schedule_end.classroom_id):
            same_class = True
        elif (schedule_start.mixed_group_id and schedule_end.mixed_group_id and 
              schedule_start.mixed_group_id == schedule_end.mixed_group_id):
            same_class = True
        elif (schedule_start.custom_task_title and schedule_end.custom_task_title and 
              schedule_start.custom_task_title == schedule_end.custom_task_title):
            same_class = True
            
        if not same_class:
            return jsonify({
                'success': False,
                'message': 'Les périodes doivent avoir la même classe/discipline'
            })
        
        # Marquer la période de fin comme fusionnée
        schedule_end.is_merged = True
        schedule_end.merged_with_previous = True
        
        # Marquer la période de début comme ayant une fusion
        schedule_start.has_merged_next = True
        
        print(f"[DEBUG] About to commit changes...")
        db.session.commit()
        print(f"[DEBUG] Changes committed successfully")
        
        return jsonify({
            'success': True,
            'message': 'Périodes fusionnées avec succès'
        })
        
    except Exception as e:
        print(f"[ERROR] Exception during merge: {str(e)}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Erreur lors de la fusion: {str(e)}'
        })

@schedule_bp.route('/separate-periods', methods=['POST'])
@login_required  
def separate_periods():
    """Séparer des périodes fusionnées"""
    try:
        data = request.get_json()
        weekday = int(data.get('weekday'))
        period_start = int(data.get('period_start'))
        period_end = int(data.get('period_end'))
        
        # Récupérer les schedules
        schedule_start = Schedule.query.filter_by(
            user_id=current_user.id,
            weekday=weekday,
            period_number=period_start
        ).first()
        
        schedule_end = Schedule.query.filter_by(
            user_id=current_user.id,
            weekday=weekday,
            period_number=period_end
        ).first()
        
        if not schedule_start or not schedule_end:
            return jsonify({
                'success': False,
                'message': 'Périodes non trouvées'
            })
        
        # Séparer les périodes
        schedule_end.is_merged = False
        schedule_end.merged_with_previous = False
        schedule_start.has_merged_next = False
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Périodes séparées avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Erreur lors de la séparation: {str(e)}'
        })
