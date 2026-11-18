"""Thèmes de cours (objectifs, notions, exercices) et avancement par classe.

Outil personnel (cf. utils/owner_features.py). Un thème reprend la page de garde d'un
dossier théorique : ce que l'élève doit savoir faire, la liste des exercices à faire et
les notions du chapitre, chacune avec ses exercices. L'avancement est tenu par classe :
notions vues, exercices corrigés, thème en cours.
"""
import json
import re
from datetime import datetime

from extensions import db

# « NO103 », « ES 47 », « GM12 » : deux majuscules puis un numéro.
EXERCISE_CODE_RE = re.compile(r'\b([A-Z]{2})\s?(\d{1,3})\b')


def _loads(raw, default):
    try:
        value = json.loads(raw) if raw else default
        return value if isinstance(value, type(default)) else default
    except (ValueError, TypeError):
        return default


def exercise_code(label):
    """Code d'un exercice dans un libellé : « ES20 A, B, D » → « ES20 » ; sinon le libellé."""
    m = EXERCISE_CODE_RE.search(label or '')
    return f'{m.group(1)}{int(m.group(2))}' if m else (label or '').strip()


class CourseTheme(db.Model):
    __tablename__ = 'course_themes'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    code = db.Column(db.String(10), nullable=False, default='')      # NO, ES, FA, GM…
    title = db.Column(db.String(200), nullable=False)                # « Nombres relatifs »
    level = db.Column(db.String(120))                                # « 9e année · VG niveau 2 & VP »
    subject = db.Column(db.String(100))                              # « Mathématiques »
    objectives_json = db.Column(db.Text)     # ["Connaissance et utilisation…", …]
    exercises_json = db.Column(db.Text)      # ["Que sais-je ?", "NO103", …] dans l'ordre du dossier
    notions_json = db.Column(db.Text)        # [{"n": 1, "title": "…", "exercises": ["NO110", …]}, …]
    revision = db.Column(db.String(255))
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def objectives(self):
        return _loads(self.objectives_json, [])

    @property
    def exercises(self):
        return _loads(self.exercises_json, [])

    @property
    def notions(self):
        return _loads(self.notions_json, [])

    @property
    def label(self):
        return f'{self.code} {self.title}'.strip()

    def set_content(self, objectives=None, exercises=None, notions=None):
        if objectives is not None:
            self.objectives_json = json.dumps(objectives, ensure_ascii=False)
        if exercises is not None:
            self.exercises_json = json.dumps(exercises, ensure_ascii=False)
        if notions is not None:
            self.notions_json = json.dumps(notions, ensure_ascii=False)

    def all_exercises(self):
        """Exercices du thème, sans doublon : la liste « à faire », puis ceux qui ne
        sont cités que dans une notion. Chaque entrée : {code, label, notion}."""
        by_code, order = {}, []

        def add(label, notion=None):
            code = exercise_code(label)
            if not code:
                return
            if code not in by_code:
                by_code[code] = {'code': code, 'label': code, 'notion': notion}
                order.append(code)
            elif notion is not None and by_code[code]['notion'] is None:
                by_code[code]['notion'] = notion

        for label in self.exercises:
            add(label)
        for notion in self.notions:
            for label in notion.get('exercises') or []:
                add(label, notion.get('n'))
        return [by_code[c] for c in order]

    def to_dict(self):
        return {
            'id': self.id, 'code': self.code, 'title': self.title, 'label': self.label,
            'level': self.level or '', 'subject': self.subject or '', 'revision': self.revision or '',
            'objectives': self.objectives, 'exercises': self.exercises, 'notions': self.notions,
        }


class CourseThemeProgress(db.Model):
    """Avancement d'une classe dans un thème."""
    __tablename__ = 'course_theme_progress'
    __table_args__ = (db.UniqueConstraint('classroom_id', 'theme_id', name='_classroom_theme_uc'),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id', ondelete='CASCADE'), nullable=False, index=True)
    theme_id = db.Column(db.Integer, db.ForeignKey('course_themes.id', ondelete='CASCADE'), nullable=False)
    # Marques posées à la main, prioritaires sur ce qui est déduit des planifications :
    # {"NO107": "done", "NO108": "todo"}
    exercise_marks_json = db.Column(db.Text)
    notion_marks_json = db.Column(db.Text)     # {"3": "seen", "4": "unseen"}
    is_current = db.Column(db.Boolean, default=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    theme = db.relationship('CourseTheme', backref=db.backref('progress', lazy='dynamic', cascade='all, delete-orphan'))

    @property
    def exercise_marks(self):
        return _loads(self.exercise_marks_json, {})

    @property
    def notion_marks(self):
        return _loads(self.notion_marks_json, {})

    def set_exercise_marks(self, marks):
        self.exercise_marks_json = json.dumps(marks, ensure_ascii=False)

    def set_notion_marks(self, marks):
        self.notion_marks_json = json.dumps(marks, ensure_ascii=False)
