#!/usr/bin/env python3
"""
Script de diagnostic pour comprendre pourquoi P4 est retourné au lieu de P1
"""

import os
import sys
from datetime import datetime, date
from flask import Flask
from extensions import db
from models.planning import Planning
from models.schedule import Schedule

def create_app():
    """Créer l'application Flask pour le diagnostic"""
    app = Flask(__name__)
    
    # Configuration de base (même que config.py)
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'database', 'teacher_planner.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialiser l'extension
    db.init_app(app)
    
    return app

def debug_lesson_detection():
    """Diagnostic de la détection de leçon pour 2025-09-01"""
    target_date = date(2025, 9, 1)
    weekday = target_date.weekday()  # 0 = Lundi
    
    print(f"🔍 Diagnostic pour {target_date} (weekday: {weekday})")
    
    # Chercher toutes les planifications pour cette date
    print(f"\n📋 Planifications pour {target_date}:")
    plannings = Planning.query.filter_by(date=target_date).all()
    print(f"Total planifications trouvées: {len(plannings)}")
    
    for planning in plannings:
        print(f"  - ID: {planning.id}, P{planning.period_number}, classroom_id: {planning.classroom_id}, mixed_group_id: {planning.mixed_group_id}, title: {planning.title}")
        if planning.classroom:
            print(f"    Classroom: {planning.classroom.name}")
        if planning.mixed_group:
            print(f"    Mixed Group: {planning.mixed_group.name}")
    
    # Chercher tous les schedules pour ce jour de la semaine
    print(f"\n📅 Schedules pour weekday {weekday}:")
    schedules = Schedule.query.filter_by(weekday=weekday).all()
    print(f"Total schedules trouvés: {len(schedules)}")
    
    for schedule in schedules:
        print(f"  - ID: {schedule.id}, P{schedule.period_number}, classroom_id: {schedule.classroom_id}, mixed_group_id: {schedule.mixed_group_id}, custom_task: {schedule.custom_task_title}")
        if schedule.classroom:
            print(f"    Classroom: {schedule.classroom.name}")
        if schedule.mixed_group:
            print(f"    Mixed Group: {schedule.mixed_group.name}")
    
    # Analyser les périodes dans l'ordre
    print(f"\n🎯 Analyse période par période:")
    for period_num in range(1, 10):  # P1 à P9
        print(f"\n--- Période {period_num} ---")
        
        # Chercher planning
        planning = Planning.query.filter_by(
            date=target_date,
            period_number=period_num
        ).first()
        
        if planning:
            is_lesson = planning.classroom_id or planning.mixed_group_id
            print(f"  Planning trouvé: ID={planning.id}, is_lesson={is_lesson}")
            if is_lesson:
                print(f"  ✅ LESSON DETECTED VIA PLANNING: P{period_num}")
                break
        else:
            print(f"  Pas de planning trouvé")
            
        # Chercher schedule
        schedule = Schedule.query.filter_by(
            weekday=weekday,
            period_number=period_num
        ).first()
        
        if schedule:
            is_lesson = schedule.classroom_id or schedule.mixed_group_id
            print(f"  Schedule trouvé: ID={schedule.id}, is_lesson={is_lesson}")
            if is_lesson:
                print(f"  ✅ LESSON DETECTED VIA SCHEDULE: P{period_num}")
                break
        else:
            print(f"  Pas de schedule trouvé")
    
    print(f"\n🎯 Conclusion: Le système devrait retourner la première leçon trouvée ci-dessus")

if __name__ == '__main__':
    app = create_app()
    
    with app.app_context():
        print("🚀 Début du diagnostic de détection de leçon")
        debug_lesson_detection()
        print("🎉 Diagnostic terminé!")