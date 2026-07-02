from extensions import db
from datetime import datetime


class Announcement(db.Model):
    """Annonce d'un enseignant à toute une classe.

    Visible par les parents dans leur portail, avec notification email
    optionnelle aux adresses des parents. Le contenu est un message de classe
    (diffusion générale, ex. « Sortie mardi, prévoir de bonnes chaussures ») —
    il ne contient pas de données personnelles d'élève, il est donc stocké en
    clair, contrairement aux modèles élève chiffrés.
    """
    __tablename__ = 'announcements'

    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    # Traçabilité de la notification email (affichée à l'enseignant).
    email_sent = db.Column(db.Boolean, default=False)
    email_recipients = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    user = db.relationship('User', backref=db.backref('announcements', lazy='dynamic'))
    classroom = db.relationship('Classroom', backref=db.backref('announcements', lazy='dynamic'))

    def __repr__(self):
        return f'<Announcement {self.id} classroom={self.classroom_id}>'
