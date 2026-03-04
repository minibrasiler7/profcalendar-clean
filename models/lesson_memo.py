from extensions import db
from datetime import datetime
from utils.custom_types import EncryptedText

class LessonMemo(db.Model):
    """Modèle pour les mémos de classe créés depuis lesson_view"""
    __tablename__ = 'lesson_memos'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=True)
    mixed_group_id = db.Column(db.Integer, db.ForeignKey('mixed_groups.id'), nullable=True)

    # Mémo créé depuis une leçon spécifique
    source_date = db.Column(db.Date, nullable=False)  # Date du cours où le mémo a été créé
    source_period = db.Column(db.Integer, nullable=False)  # Période du cours source

    # Date cible pour le rappel
    target_date = db.Column(db.Date, nullable=True)  # Date où le mémo doit apparaître
    target_period = db.Column(db.Integer, nullable=True)  # Période cible si définie

    # Contenu du mémo - CHIFFRÉ
    content = db.Column(EncryptedText(), nullable=False)

    # Métadonnées
    is_completed = db.Column(db.Boolean, default=False)  # Pour marquer comme fait
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    user = db.relationship('User', backref=db.backref('lesson_memos', lazy='dynamic'))
    classroom = db.relationship('Classroom', backref=db.backref('lesson_memos', lazy='dynamic'))
    mixed_group = db.relationship('MixedGroup', backref=db.backref('lesson_memos', lazy='dynamic'))

    def get_display_name(self):
        """Retourne le nom de la classe ou du groupe mixte"""
        if self.classroom_id:
            return self.classroom.name
        elif self.mixed_group_id:
            return self.mixed_group.name
        return "Non défini"

    def __repr__(self):
        return f'<LessonMemo {self.id} - {self.content[:30]}>'


class StudentRemark(db.Model):
    """Modèle pour les remarques élèves créées depuis lesson_view"""
    __tablename__ = 'student_remarks'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)

    # Cours source où la remarque a été créée
    source_date = db.Column(db.Date, nullable=False)
    source_period = db.Column(db.Integer, nullable=False)

    # Contenu de la remarque - CHIFFRÉ
    content = db.Column(EncryptedText(), nullable=False)

    # Envoi aux parents et élèves
    send_to_parent_and_student = db.Column(db.Boolean, default=False)
    is_viewed_by_parent = db.Column(db.Boolean, default=False)
    is_viewed_by_student = db.Column(db.Boolean, default=False)

    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    user = db.relationship('User', backref=db.backref('student_remarks', lazy='dynamic'))
    student = db.relationship('Student', backref=db.backref('remarks', lazy='dynamic'))

    def __repr__(self):
        return f'<StudentRemark {self.student_id} - {self.content[:30]}>'
