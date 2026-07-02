from extensions import db
from datetime import datetime
from utils.custom_types import EncryptedText


class DeletedClassroom(db.Model):
    """Corbeille : classe supprimée, archivée 30 jours pour restauration.

    Le payload (JSON de la classe + élèves + évaluations + notes) est chiffré au
    repos (EncryptedText) car il contient des données personnelles d'élèves en
    clair. La restauration recrée la classe via l'ORM (re-chiffrement par champ).
    Après 30 jours, l'entrée est purgée définitivement.

    Champs dénormalisés (name/subject/…) : permettent d'afficher la corbeille
    sans déchiffrer le payload.
    """
    __tablename__ = 'deleted_classrooms'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    original_classroom_id = db.Column(db.Integer)  # la classe d'origine n'existe plus
    name = db.Column(db.String(100))
    subject = db.Column(db.String(100))
    color = db.Column(db.String(7))
    class_group = db.Column(db.String(100))
    student_count = db.Column(db.Integer, default=0)
    payload = db.Column(EncryptedText)  # JSON chiffré : classe + élèves + évals + notes
    deleted_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('deleted_classrooms', lazy='dynamic'))

    def __repr__(self):
        return f'<DeletedClassroom {self.name} deleted_at={self.deleted_at}>'
