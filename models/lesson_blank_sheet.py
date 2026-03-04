"""
Modèle pour les feuilles blanches associées aux leçons
"""
from datetime import datetime
from extensions import db


class LessonBlankSheet(db.Model):
    """
    Feuilles blanches associées à une leçon spécifique (date + période)
    Similaire à LessonMemo mais pour des pages vierges annotables
    """
    __tablename__ = 'lesson_blank_sheets'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=True)

    # Date et période de la leçon
    lesson_date = db.Column(db.Date, nullable=False, index=True)
    period_number = db.Column(db.Integer, nullable=False, index=True)

    # Titre de la feuille blanche
    title = db.Column(db.String(200), default="Feuille blanche")

    # Données JSON (pages blanches + annotations)
    sheet_data = db.Column(db.JSON, nullable=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    user = db.relationship('User', backref=db.backref('blank_sheets', lazy='dynamic'))
    classroom = db.relationship('Classroom', backref=db.backref('blank_sheets', lazy='dynamic'))

    def __repr__(self):
        return f'<LessonBlankSheet {self.id}: {self.title} - {self.lesson_date} P{self.period_number}>'

    def to_dict(self):
        """Retourne un dictionnaire pour l'API"""
        return {
            'id': self.id,
            'title': self.title,
            'lesson_date': self.lesson_date.isoformat() if self.lesson_date else None,
            'period_number': self.period_number,
            'classroom_id': self.classroom_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
