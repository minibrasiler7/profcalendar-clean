"""Tests du décalage des planifications et du report de tâches.

Lancement :  python3 -m unittest tests.test_planning_shift -v
Base SQLite en mémoire : aucune donnée réelle n'est touchée.
"""
import os
import sys
import unittest
from datetime import date, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask  # noqa: E402
from extensions import db  # noqa: E402


def make_app():
    app = Flask(__name__)
    app.config.update(SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
                      SQLALCHEMY_TRACK_MODIFICATIONS=False, SECRET_KEY='test')
    db.init_app(app)
    return app


class ShiftTestCase(unittest.TestCase):
    def setUp(self):
        import importlib
        import pkgutil
        import models
        # Toutes les tables doivent être connues avant create_all (clés étrangères).
        for module in pkgutil.iter_modules(models.__path__):
            importlib.import_module('models.' + module.name)
        from models.user import User
        from models.classroom import Classroom
        from models.schedule import Schedule
        from models.student_group import StudentGroup

        self.app = make_app()
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()

        # Compte hors de Suisse : pas de vacances vaudoises implicites, le
        # calendrier du test ne dépend que des vacances saisies ci-dessous.
        self.user = User(username='prof', email='prof@example.org', password_hash='x',
                         region='intl', school_year_start=date(2026, 8, 17),
                         school_year_end=date(2027, 7, 2))
        db.session.add(self.user)
        db.session.flush()
        self.maths = Classroom(user_id=self.user.id, name='9A', subject='Maths', color='#111111')
        self.sci = Classroom(user_id=self.user.id, name='9A', subject='Sciences', color='#222222')
        db.session.add_all([self.maths, self.sci])
        db.session.flush()
        self.g1 = StudentGroup(user_id=self.user.id, classroom_id=self.sci.id, name='Groupe 1')
        self.g2 = StudentGroup(user_id=self.user.id, classroom_id=self.sci.id, name='Groupe 2')
        db.session.add_all([self.g1, self.g2])

        def sched(classroom, weekday, period, merged=False):
            db.session.add(Schedule(user_id=self.user.id, classroom_id=classroom.id, weekday=weekday,
                                    period_number=period, start_time=time(8, 0), end_time=time(8, 45),
                                    merged_with_previous=merged))
        # Maths : lundi P3, mardi P2-P3 (double), jeudi P4. Sciences : lundi P1 (TP), lundi P4.
        sched(self.maths, 0, 3)
        sched(self.maths, 1, 2)
        sched(self.maths, 1, 3, merged=True)
        sched(self.maths, 3, 4)
        sched(self.sci, 0, 1)
        sched(self.sci, 0, 4)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    # -- aides
    def plan(self, classroom, d, period, title='', description='', group=None, states=None):
        from models.planning import Planning
        p = Planning(user_id=self.user.id, classroom_id=classroom.id, date=d, period_number=period,
                     title=title, description=description, group_id=group.id if group else None)
        if states:
            p.set_checklist_states(states)
        db.session.add(p)
        db.session.commit()
        return p

    def at(self, d, period):
        from models.planning import Planning
        return Planning.query.filter_by(user_id=self.user.id, date=d, period_number=period).first()

    # -- décalage
    def test_shift_moves_every_following_lesson_to_the_next_slot(self):
        from utils.planning_shift import apply_shift
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'A', '[ ] a')   # lundi
        self.plan(self.maths, date(2026, 11, 17), 2, 'B', '[ ] b')       # mardi (double)
        self.plan(self.maths, date(2026, 11, 19), 4, 'C', '[ ] c')       # jeudi
        done = apply_shift(self.user, a)
        self.assertEqual(len(done), 3)
        self.assertIsNone(self.at(date(2026, 11, 16), 3))
        self.assertEqual(self.at(date(2026, 11, 17), 2).title, 'A')
        self.assertIsNone(self.at(date(2026, 11, 17), 3))                # P3 = suite du bloc
        self.assertEqual(self.at(date(2026, 11, 19), 4).title, 'B')
        self.assertEqual(self.at(date(2026, 11, 23), 3).title, 'C')      # lundi suivant

    def test_shift_stops_at_the_first_empty_lesson(self):
        from utils.planning_shift import apply_shift
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'A')
        self.plan(self.maths, date(2026, 11, 19), 4, 'C')                # le mardi 17 est vide
        apply_shift(self.user, a)
        self.assertEqual(self.at(date(2026, 11, 17), 2).title, 'A')
        self.assertEqual(self.at(date(2026, 11, 19), 4).title, 'C')      # n'a pas bougé

    def test_shift_skips_holidays(self):
        from models.user import Holiday
        from utils.planning_shift import apply_shift
        db.session.add(Holiday(user_id=self.user.id, name='Pont', start_date=date(2026, 11, 17),
                               end_date=date(2026, 11, 17)))
        db.session.commit()
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'A')
        apply_shift(self.user, a)
        self.assertIsNone(self.at(date(2026, 11, 17), 2))
        self.assertEqual(self.at(date(2026, 11, 19), 4).title, 'A')

    def test_shift_leaves_other_classes_and_groups_alone(self):
        from utils.planning_shift import apply_shift
        theory = self.plan(self.sci, date(2026, 11, 16), 4, 'Théorie 1')
        self.plan(self.sci, date(2026, 11, 23), 4, 'Théorie 2')
        tp = self.plan(self.sci, date(2026, 11, 23), 1, 'TP g2', group=self.g2)
        maths = self.plan(self.maths, date(2026, 11, 23), 3, 'Maths')
        apply_shift(self.user, theory)
        self.assertEqual(self.at(date(2026, 11, 23), 4).title, 'Théorie 1')
        self.assertEqual(self.at(date(2026, 11, 30), 4).title, 'Théorie 2')
        self.assertEqual(self.at(date(2026, 11, 23), 1).id, tp.id)
        self.assertEqual(self.at(date(2026, 11, 23), 3).id, maths.id)

    def test_group_shift_follows_the_group_rotation(self):
        from utils.planning_shift import apply_shift
        g1a = self.plan(self.sci, date(2026, 11, 16), 1, 'TP1', group=self.g1)
        self.plan(self.sci, date(2026, 11, 23), 1, 'TP1', group=self.g2)
        self.plan(self.sci, date(2026, 11, 30), 1, 'TP2', group=self.g1)
        self.plan(self.sci, date(2026, 12, 7), 1, 'TP2', group=self.g2)
        self.plan(self.sci, date(2026, 12, 14), 1, '', group=self.g1)    # marqueur vide
        apply_shift(self.user, g1a)
        first = self.at(date(2026, 11, 16), 1)
        self.assertEqual((first.title, first.group_id), ('', self.g1.id))   # le créneau reste au groupe 1
        self.assertEqual(self.at(date(2026, 11, 30), 1).title, 'TP1')
        self.assertEqual(self.at(date(2026, 12, 14), 1).title, 'TP2')
        self.assertEqual(self.at(date(2026, 11, 23), 1).group_id, self.g2.id)
        self.assertEqual(self.at(date(2026, 12, 7), 1).title, 'TP2')

    def test_ephemeral_files_follow_the_lesson(self):
        from models.planning import EphemeralFile
        from utils.planning_shift import apply_shift
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'A')
        db.session.add(EphemeralFile(user_id=self.user.id, planning_id=a.id, original_filename='pdj.pdf',
                                     expires_on=date(2026, 11, 17)))
        db.session.commit()
        apply_shift(self.user, a)
        self.assertEqual(EphemeralFile.query.one().expires_on, date(2026, 11, 18))

    def test_shift_refused_when_the_year_is_full(self):
        from utils.planning_shift import apply_shift, ShiftError
        self.user.school_year_end = date(2026, 11, 20)
        db.session.commit()
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'A')
        self.plan(self.maths, date(2026, 11, 17), 2, 'B')
        self.plan(self.maths, date(2026, 11, 19), 4, 'C')
        with self.assertRaises(ShiftError):
            apply_shift(self.user, a)
        db.session.rollback()
        self.assertEqual(self.at(date(2026, 11, 16), 3).title, 'A')      # rien n'a bougé

    def test_dry_run_changes_nothing(self):
        from utils.planning_shift import plan_shift
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'A')
        self.plan(self.maths, date(2026, 11, 17), 2, 'B')
        moves, absorber = plan_shift(self.user, a)
        self.assertEqual([(m[1], m[2]) for m in moves], [(date(2026, 11, 17), 2), (date(2026, 11, 19), 4)])
        self.assertIsNone(absorber)
        self.assertEqual(self.at(date(2026, 11, 16), 3).title, 'A')

    # -- report de tâches
    def test_postpone_unchecked_tasks(self):
        from utils.planning_shift import postpone_tasks
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'A', 'Intro\n[ ] un\n[ ] deux\n[ ] trois',
                      states={'0': True, '2': False})
        b = self.plan(self.maths, date(2026, 11, 17), 2, 'B', '[ ] quatre\n[ ] cinq', states={'1': True})
        count, d, n = postpone_tasks(self.user, a)
        self.assertEqual((count, d, n), (2, date(2026, 11, 17), 2))
        self.assertEqual(a.description, 'Intro\n[ ] un')
        self.assertEqual(a.get_checklist_states(), {'0': True})
        self.assertEqual(b.description, '[ ] deux\n[ ] trois\n[ ] quatre\n[ ] cinq')
        self.assertEqual(b.get_checklist_states(), {'3': True})

    def test_postpone_one_task_creates_the_next_lesson(self):
        from utils.planning_shift import postpone_tasks
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'Relatifs', '[ ] un\n[ ] deux', states={'0': True})
        count, d, n = postpone_tasks(self.user, a, indices=[1])
        self.assertEqual((count, d, n), (1, date(2026, 11, 17), 2))
        nxt = self.at(d, n)
        self.assertEqual((nxt.title, nxt.description, nxt.classroom_id), ('Relatifs', '[ ] deux', self.maths.id))
        self.assertEqual(a.description, '[ ] un')

    def test_postpone_without_task_is_refused(self):
        from utils.planning_shift import postpone_tasks, ShiftError
        a = self.plan(self.maths, date(2026, 11, 16), 3, 'A', '[ ] un', states={'0': True})
        with self.assertRaises(ShiftError):
            postpone_tasks(self.user, a)


if __name__ == '__main__':
    unittest.main()
