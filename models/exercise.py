from extensions import db
from datetime import datetime


class Exercise(db.Model):
    """Modèle principal pour les exercices interactifs"""
    __tablename__ = 'exercises'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    subject = db.Column(db.String(100))
    level = db.Column(db.String(50))
    accept_typos = db.Column(db.Boolean, default=False)  # tolérer les fautes d'orthographe
    is_published = db.Column(db.Boolean, default=False)
    is_draft = db.Column(db.Boolean, default=True)
    total_points = db.Column(db.Integer, default=0)  # XP total calculé
    bonus_gold_threshold = db.Column(db.Integer, default=80)  # % pour bonus or
    badge_threshold = db.Column(db.Integer, default=100)  # % minimum pour badge
    folder_id = db.Column(db.Integer, nullable=True)  # Lien vers FileFolder du gestionnaire de fichiers
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    user = db.relationship('User', backref=db.backref('exercises', lazy='dynamic'))
    blocks = db.relationship('ExerciseBlock', backref='exercise', lazy='dynamic',
                             cascade='all, delete-orphan', order_by='ExerciseBlock.position')

    def calculate_total_points(self):
        """Recalculer le total de points XP"""
        self.total_points = sum(b.points for b in self.blocks if b.points)
        return self.total_points

    def to_dict(self, include_blocks=False):
        """Sérialiser en dictionnaire"""
        data = {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'subject': self.subject,
            'level': self.level,
            'accept_typos': self.accept_typos,
            'is_published': self.is_published,
            'is_draft': self.is_draft,
            'total_points': self.total_points,
            'bonus_gold_threshold': self.bonus_gold_threshold,
            'badge_threshold': self.badge_threshold,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_blocks:
            data['blocks'] = [b.to_dict() for b in self.blocks.order_by(ExerciseBlock.position)]
        return data

    def __repr__(self):
        return f'<Exercise {self.id}: {self.title}>'


class ExerciseBlock(db.Model):
    """Bloc individuel dans un exercice (QCM, réponse courte, etc.)"""
    __tablename__ = 'exercise_blocks'

    id = db.Column(db.Integer, primary_key=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id', ondelete='CASCADE'), nullable=False)
    block_type = db.Column(db.String(30), nullable=False)
    # Types: qcm, short_answer, fill_blank, sorting, image_position, graph
    position = db.Column(db.Integer, default=0)
    title = db.Column(db.String(200))  # Titre/question du bloc
    duration = db.Column(db.Integer)  # durée en secondes pour cette question
    config_json = db.Column(db.JSON, default=dict)  # Configuration complète du bloc
    points = db.Column(db.Integer, default=10)  # XP pour ce bloc
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Structures de config_json par type:
    #
    # QCM:
    # {
    #   "question": "...",
    #   "options": [{"text": "...", "is_correct": true, "feedback": "..."}],
    #   "multiple_answers": false
    # }
    #
    # SHORT_ANSWER:
    # {
    #   "question": "...",
    #   "answer_type": "text" | "number",
    #   "correct_answer": "...",
    #   "tolerance": 0.1,  (pour nombres)
    #   "synonyms": ["mot1", "mot2"]
    # }
    #
    # FILL_BLANK:
    # {
    #   "text_template": "Le {soleil} brille dans le {ciel}",
    #   "blanks": [{"word": "soleil", "position": 0}, {"word": "ciel", "position": 1}]
    # }
    #
    # SORTING:
    # {
    #   "mode": "order" | "categories",
    #   "items": ["item1", "item2", "item3"],
    #   "correct_order": [0, 1, 2],  (pour mode order)
    #   "categories": [{"name": "Cat A", "items": [0, 1]}, {"name": "Cat B", "items": [2]}]
    # }
    #
    # IMAGE_POSITION:
    # {
    #   "image_file_id": 123,  (UserFile ID)
    #   "image_url": "/file_manager/preview/123",
    #   "zones": [{"label": "Coeur", "points": [{"x":100,"y":200},{"x":150,"y":210}], "radius": 30}]
    #   // Chaque zone a un label et peut avoir PLUSIEURS points valides
    # }
    #
    # GRAPH:
    # {
    #   "graph_type": "cartesian",
    #   "x_label": "x", "y_label": "y",
    #   "x_min": -10, "x_max": 10, "y_min": -10, "y_max": 10,
    #   "grid": true,
    #   "question_type": "draw_line" | "draw_quadratic",
    #   // draw_line: l'enseignant donne f(x) = ax + b, l'élève déplace 2 points
    #   "correct_answer": {"a": 2, "b": 1}
    #   // draw_quadratic: l'enseignant donne f(x) = ax² + bx + c, l'élève déplace 3 points
    #   "correct_answer": {"a": 1, "b": 0, "c": -2}
    #   "tolerance": 0.5
    # }

    def to_dict(self):
        """Sérialiser en dictionnaire"""
        return {
            'id': self.id,
            'block_type': self.block_type,
            'position': self.position,
            'title': self.title,
            'duration': self.duration,
            'config_json': self.config_json,
            'points': self.points,
        }

    def __repr__(self):
        return f'<ExerciseBlock {self.id}: {self.block_type} @pos{self.position}>'
