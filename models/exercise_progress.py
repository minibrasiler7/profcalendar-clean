from extensions import db
from datetime import datetime


class ExercisePublication(db.Model):
    """Publication d'un exercice vers une classe"""
    __tablename__ = 'exercise_publications'

    id = db.Column(db.Integer, primary_key=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id', ondelete='CASCADE'), nullable=False)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    planning_id = db.Column(db.Integer, db.ForeignKey('plannings.id'), nullable=True)
    published_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    published_at = db.Column(db.DateTime, default=datetime.utcnow)
    mode = db.Column(db.String(20), default='classique')  # 'classique' ou 'combat'
    is_active = db.Column(db.Boolean, default=False)  # True = mission lancée en live

    # Relations
    exercise = db.relationship('Exercise', backref=db.backref('publications', lazy='dynamic'))
    classroom = db.relationship('Classroom', backref=db.backref('exercise_publications', lazy='dynamic'))
    publisher = db.relationship('User', backref=db.backref('published_exercises', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'exercise_id': self.exercise_id,
            'classroom_id': self.classroom_id,
            'planning_id': self.planning_id,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'mode': self.mode or 'classique',
            'is_active': self.is_active or False,
        }

    def __repr__(self):
        return f'<ExercisePublication exercise={self.exercise_id} class={self.classroom_id}>'


class StudentExerciseAttempt(db.Model):
    """Tentative d'un élève sur un exercice"""
    __tablename__ = 'student_exercise_attempts'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id', ondelete='CASCADE'), nullable=False)
    publication_id = db.Column(db.Integer, db.ForeignKey('exercise_publications.id'), nullable=True)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    score = db.Column(db.Integer, default=0)
    max_score = db.Column(db.Integer, default=0)
    xp_earned = db.Column(db.Integer, default=0)
    gold_earned = db.Column(db.Integer, default=0)

    # Relations
    student = db.relationship('Student', backref=db.backref('exercise_attempts', lazy='dynamic'))
    exercise = db.relationship('Exercise', backref=db.backref('attempts', lazy='dynamic'))
    answers = db.relationship('StudentBlockAnswer', backref='attempt', lazy='dynamic',
                              cascade='all, delete-orphan')

    @property
    def is_completed(self):
        return self.completed_at is not None

    @property
    def score_percentage(self):
        if self.max_score == 0:
            return 0
        return round((self.score / self.max_score) * 100)

    def calculate_rewards(self, exercise):
        """Calculer XP et or gagnés"""
        if self.max_score == 0:
            return

        percentage = self.score_percentage
        # XP = proportionnel au score
        self.xp_earned = round((self.score / self.max_score) * exercise.total_points)
        # Or : bonus si au-dessus du seuil
        if percentage >= exercise.bonus_gold_threshold:
            self.gold_earned = max(1, self.xp_earned // 5)
        else:
            self.gold_earned = 0

    def to_dict(self):
        return {
            'id': self.id,
            'exercise_id': self.exercise_id,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'score': self.score,
            'max_score': self.max_score,
            'score_percentage': self.score_percentage,
            'xp_earned': self.xp_earned,
            'gold_earned': self.gold_earned,
            'is_completed': self.is_completed,
        }

    def __repr__(self):
        return f'<StudentExerciseAttempt student={self.student_id} exercise={self.exercise_id}>'


class StudentBlockAnswer(db.Model):
    """Réponse d'un élève à un bloc spécifique"""
    __tablename__ = 'student_block_answers'

    id = db.Column(db.Integer, primary_key=True)
    attempt_id = db.Column(db.Integer, db.ForeignKey('student_exercise_attempts.id', ondelete='CASCADE'), nullable=False)
    block_id = db.Column(db.Integer, db.ForeignKey('exercise_blocks.id', ondelete='CASCADE'), nullable=False)
    answer_json = db.Column(db.JSON, default=dict)  # Réponse de l'élève
    is_correct = db.Column(db.Boolean, default=False)
    points_earned = db.Column(db.Integer, default=0)
    answered_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    block = db.relationship('ExerciseBlock', backref=db.backref('student_answers', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'block_id': self.block_id,
            'answer_json': self.answer_json,
            'is_correct': self.is_correct,
            'points_earned': self.points_earned,
        }

    def __repr__(self):
        return f'<StudentBlockAnswer attempt={self.attempt_id} block={self.block_id}>'
