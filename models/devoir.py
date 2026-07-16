from datetime import datetime
from extensions import db
from utils.custom_types import EncryptedString, EncryptedText


class Devoir(db.Model):
    """Un devoir donné par l'enseignant à une classe, à rendre pour une date.

    Deux types :
      - 'submission' : l'élève rend un travail (photo → PDF), le prof corrige et
                       renvoie individuellement.
      - 'exercise'   : un exercice interactif assigné ; le suivi (points, badge)
                       se fait via StudentExerciseAttempt.

    La classe visée est résolue via le ROSTER PARTAGÉ (classroom.get_students()),
    donc un devoir couvre bien tous les élèves de la classe même quand celle-ci
    est enseignée en plusieurs disciplines.
    """
    __tablename__ = 'devoirs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False, index=True)

    devoir_type = db.Column(db.String(20), nullable=False, default='submission')  # submission | exercise
    title = db.Column(EncryptedString(), nullable=False)
    instructions = db.Column(EncryptedText(), nullable=True)  # consignes optionnelles

    due_date = db.Column(db.Date, nullable=False, index=True)  # date de rendu
    due_period = db.Column(db.Integer, nullable=True)

    # type 'submission' : document optionnel partagé à toute la classe (clé R2)
    document_key = db.Column(db.String(255), nullable=True)
    document_name = db.Column(db.String(255), nullable=True)

    # type 'exercise' : exercice interactif assigné
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id'), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('devoirs', lazy='dynamic'))
    classroom = db.relationship('Classroom', backref=db.backref('devoirs', lazy='dynamic'))
    exercise = db.relationship('Exercise')

    def get_students(self):
        """Élèves concernés = roster partagé de la classe (multi-disciplines)."""
        return self.classroom.get_students() if self.classroom else []

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.devoir_type,
            'title': self.title,
            'instructions': self.instructions,
            'classroom_id': self.classroom_id,
            'classroom_name': self.classroom.name if self.classroom else None,
            'subject': self.classroom.subject if self.classroom else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'due_period': self.due_period,
            'document_name': self.document_name,
            'has_document': bool(self.document_key),
            'exercise_id': self.exercise_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<Devoir {self.id} {self.devoir_type} due={self.due_date}>'
