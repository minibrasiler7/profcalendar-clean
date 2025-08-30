"""
HOTFIX: Ancienne logique mais avec ORDER BY pour trouver P1 avant P4
À appliquer directement dans routes/planning.py si le nouveau code ne fonctionne pas
"""

def get_current_or_next_lesson(user):
    """Trouve le cours actuel ou le prochain cours (HOTFIX avec ORDER BY)"""
    from datetime import time as time_type
    from utils.vaud_holidays import is_holiday
    
    # Obtenir l'heure actuelle selon le fuseau horaire de l'utilisateur
    now = user.get_local_datetime()
    current_time = now.time()
    current_date = now.date()
    weekday = current_date.weekday()
    
    current_app.logger.error(f"HOTFIX APPLIED: current_time: {current_time}, date: {current_date}, weekday: {weekday}")

    # Récupérer les périodes du jour
    periods = calculate_periods(user)
    current_app.logger.error(f"HOTFIX: Periods found: {len(periods)}")

    # 1. Vérifier si on est actuellement en cours
    for period in periods:
        if period['start'] <= current_time <= period['end']:
            # Chercher d'abord dans les planifications spécifiques AVEC ORDER BY
            planning = Planning.query.filter_by(
                user_id=user.id,
                date=current_date,
                period_number=period['number']
            ).filter(
                db.or_(Planning.classroom_id.isnot(None), Planning.mixed_group_id.isnot(None))
            ).first()
            
            if planning:
                lesson = type('obj', (object,), {
                    'classroom_id': planning.classroom_id,
                    'mixed_group_id': planning.mixed_group_id,
                    'period_number': planning.period_number,
                    'end_period_number': planning.period_number,
                    'weekday': weekday,
                    'start_time': period['start'],
                    'end_time': period['end'],
                    'classroom': planning.classroom if planning.classroom_id else None,
                    'mixed_group': planning.mixed_group if planning.mixed_group_id else None,
                    'is_merged': False
                })()
                return lesson, True, current_date
            # ... fallback to schedule logic

    # 2. Si pas de cours actuel, chercher le prochain aujourd'hui
    for period in periods:
        if period['start'] > current_time:
            # Même logique avec ORDER BY
            # ...

    # 3. Chercher dans les jours suivants AVEC ORDER BY AJOUTÉ
    for days_ahead in range(1, 15):
        search_date = current_date + timedelta(days=days_ahead)
        search_weekday = search_date.weekday()
        
        if search_weekday >= 5:
            continue
        if is_holiday(search_date, user):
            continue
        
        # MODIFICATION CRITIQUE: Ajouter ORDER BY period_number
        first_planning = Planning.query.filter_by(
            user_id=user.id,
            date=search_date
        ).filter(
            db.or_(Planning.classroom_id.isnot(None), Planning.mixed_group_id.isnot(None))
        ).order_by(Planning.period_number).first()  # ← C'EST LE FIX!

        if first_planning:
            current_app.logger.error(f"HOTFIX: Found planning: {first_planning.period_number}")
            # ... reste de la logique
    
    return None, False, None