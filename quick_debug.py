#!/usr/bin/env python3
"""
Script de debug rapide pour analyser les planifications du 2025-09-01
"""

import os
import sys
from datetime import datetime, date
from flask import Flask
from extensions import db
from models.planning import Planning
from models.schedule import Schedule

def create_app():
    app = Flask(__name__)
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'database', 'teacher_planner.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

def debug_2025_09_01():
    target_date = date(2025, 9, 1)
    weekday = target_date.weekday()
    
    print(f"=== DIAGNOSTIC RAPIDE ===")
    print(f"Date: {target_date} (weekday: {weekday})")
    
    # Toutes les planifications pour cette date
    plannings = Planning.query.filter_by(date=target_date).order_by(Planning.period_number).all()
    print(f"\nPLANNINGS pour {target_date}:")
    for p in plannings:
        lesson_type = "LESSON" if (p.classroom_id or p.mixed_group_id) else "NON-LESSON"
        print(f"  P{p.period_number}: {lesson_type} (classroom_id={p.classroom_id}, mixed_group_id={p.mixed_group_id})")
    
    # Tous les schedules pour ce jour
    schedules = Schedule.query.filter_by(weekday=weekday).order_by(Schedule.period_number).all()
    print(f"\nSCHEDULES pour weekday {weekday}:")
    for s in schedules:
        lesson_type = "LESSON" if (s.classroom_id or s.mixed_group_id) else "NON-LESSON"
        print(f"  P{s.period_number}: {lesson_type} (classroom_id={s.classroom_id}, mixed_group_id={s.mixed_group_id})")
    
    # Simulation de la logique actuelle (avant mes corrections)
    print(f"\nSIMULATION LOGIQUE ACTUELLE:")
    first_planning = Planning.query.filter_by(date=target_date).filter(
        db.or_(Planning.classroom_id.isnot(None), Planning.mixed_group_id.isnot(None))
    ).order_by(Planning.period_number).first()
    
    if first_planning:
        print(f"Premier planning trouvé: P{first_planning.period_number}")
    else:
        print("Aucun planning trouvé, cherche dans schedules...")
        first_schedule = Schedule.query.filter_by(weekday=weekday).filter(
            db.or_(Schedule.classroom_id.isnot(None), Schedule.mixed_group_id.isnot(None))
        ).order_by(Schedule.period_number).first()
        if first_schedule:
            print(f"Premier schedule trouvé: P{first_schedule.period_number}")

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        debug_2025_09_01()