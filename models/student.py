from extensions import db
from datetime import datetime
from flask_login import UserMixin
from utils.custom_types import EncryptedString, EncryptedText, EncryptedDate
from utils.encryption import encryption_engine
from sqlalchemy import event

class Student(UserMixin, db.Model):
    """Modèle pour les élèves"""
    __tablename__ = 'students'

    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    first_name = db.Column(EncryptedString(), nullable=False)
    last_name = db.Column(EncryptedString(), nullable=False)
    email = db.Column(EncryptedString())
    email_hash = db.Column(db.String(64), index=True)  # SHA-256 pour recherche par email
    date_of_birth = db.Column(EncryptedDate())
    parent_email_mother = db.Column(EncryptedString())  # Email de la mère (optionnel)
    parent_email_father = db.Column(EncryptedString())  # Email du père (optionnel)
    additional_info = db.Column(EncryptedText())  # Informations supplémentaires sur l'élève
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    email_verified = db.Column(db.Boolean, default=False)

    # Ajout pour l'authentification des élèves
    password_hash = db.Column(db.String(255))
    is_authenticated = db.Column(db.Boolean, default=False)
    last_login = db.Column(db.DateTime)

    # Jeton de notifications push Expo (app mobile) — ExponentPushToken[...]
    expo_push_token = db.Column(db.String(255))

    # Relations
    classroom = db.relationship('Classroom', backref=db.backref('students', lazy='dynamic'))
    user = db.relationship('User', backref=db.backref('students', lazy='dynamic'))

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def initials(self):
        """Retourne les initiales de l'élève"""
        initials = self.first_name[0].upper() if self.first_name else ''
        if self.last_name:
            initials += self.last_name[0].upper()
        return initials

    def get_id(self):
        """Retourne l'ID composite pour flask-login"""
        return f"student:{self.id}"

    def __repr__(self):
        return f'<Student {self.full_name}>'


# Event listeners pour maintenir email_hash automatiquement
@event.listens_for(Student, 'before_insert')
def student_before_insert(mapper, connection, target):
    if target.email:
        target.email_hash = encryption_engine.hash_email(target.email)

@event.listens_for(Student, 'before_update')
def student_before_update(mapper, connection, target):
    if target.email:
        target.email_hash = encryption_engine.hash_email(target.email)


class LegacyClassFile(db.Model):
    """Modèle pour les fichiers de classe (version legacy)"""
    __tablename__ = 'class_files'

    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(50))
    file_size = db.Column(db.Integer)  # Taille en octets
    description = db.Column(db.Text)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_pinned = db.Column(db.Boolean, default=False)  # Nouveau champ pour l'épinglage
    pin_order = db.Column(db.Integer, default=0)      # Ordre d'épinglage
    is_student_shared = db.Column(db.Boolean, default=False)  # Fichier envoyé uniquement aux élèves
    file_content = db.Column(db.LargeBinary)  # Contenu du fichier en BLOB
    mime_type = db.Column(db.String(100))  # Type MIME pour le serving

    # Relations
    classroom = db.relationship('Classroom', backref=db.backref('files', lazy='dynamic'))

    def __repr__(self):
        return f'<ClassFile {self.original_filename}>'


class StudentFile(db.Model):
    """Modèle pour les fichiers associés aux élèves"""
    __tablename__ = 'student_files'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer)
    upload_date = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    student = db.relationship('Student', backref=db.backref('files', lazy='dynamic', cascade='all, delete-orphan'))
    user = db.relationship('User', backref=db.backref('student_files', lazy='dynamic'))

    def __repr__(self):
        return f'<StudentFile {self.original_name}>'
