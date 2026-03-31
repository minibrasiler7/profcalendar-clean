from extensions import db
from datetime import datetime
import os

class ClassFile(db.Model):
    """Modèle pour les fichiers de classe - copie indépendante avec ses propres métadonnées"""
    __tablename__ = 'class_files_v2'

    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    user_file_id = db.Column(db.Integer, nullable=True)  # Référence optionnelle au fichier source (pas de FK CASCADE)
    folder_path = db.Column(db.String(500), default='')  # Chemin du dossier dans la classe
    r2_key = db.Column(db.String(500), nullable=True)  # Clé R2 de la copie dupliquée

    # Métadonnées propres (indépendantes du UserFile source)
    own_original_filename = db.Column(db.String(500), nullable=True)
    own_filename = db.Column(db.String(500), nullable=True)
    own_file_type = db.Column(db.String(50), nullable=True)
    own_file_size = db.Column(db.Integer, nullable=True)
    own_mime_type = db.Column(db.String(200), nullable=True)

    copied_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_pinned = db.Column(db.Boolean, default=False)
    pin_order = db.Column(db.Integer, default=0)

    # Relations
    classroom = db.relationship('Classroom', backref='class_files_v2')

    # Propriétés qui utilisent les colonnes propres, avec fallback vers UserFile
    @property
    def original_filename(self):
        if self.own_original_filename:
            return self.own_original_filename
        # Fallback: charger depuis UserFile si disponible
        uf = self._get_user_file()
        return uf.original_filename if uf else None

    @property
    def filename(self):
        if self.own_filename:
            return self.own_filename
        uf = self._get_user_file()
        return uf.filename if uf else None

    @property
    def file_type(self):
        if self.own_file_type:
            return self.own_file_type
        uf = self._get_user_file()
        return uf.file_type if uf else None

    @property
    def file_size(self):
        if self.own_file_size is not None:
            return self.own_file_size
        uf = self._get_user_file()
        return uf.file_size if uf else None

    @property
    def mime_type(self):
        if self.own_mime_type:
            return self.own_mime_type
        uf = self._get_user_file()
        return uf.mime_type if uf else None

    @property
    def file_content(self):
        """Pour les anciens fichiers BLOB - accès via UserFile si disponible"""
        uf = self._get_user_file()
        return uf.file_content if uf else None

    @property
    def uploaded_at(self):
        return self.copied_at

    @property
    def is_student_shared(self):
        return False

    @property
    def user_file(self):
        """Propriété pour compatibilité avec le code legacy"""
        return self._get_user_file()

    def _get_user_file(self):
        """Charge le UserFile source si disponible (lazy)"""
        if not self.user_file_id:
            return None
        try:
            from models.file_manager import UserFile
            return UserFile.query.get(self.user_file_id)
        except Exception:
            return None

    def get_full_path(self):
        """Retourne le chemin complet du fichier dans la classe"""
        name = self.original_filename or 'fichier_inconnu'
        if self.folder_path:
            return f"{self.folder_path}/{name}"
        return name

    def get_display_folder(self):
        """Retourne le dossier d'affichage (ou 'Racine' si vide)"""
        return self.folder_path if self.folder_path else "Racine"

    def __repr__(self):
        name = self.original_filename or f'ID:{self.id}'
        classroom_name = self.classroom.name if self.classroom else '?'
        return f'<ClassFile {name} in {classroom_name}>'


class ClassFolder(db.Model):
    """Modèle pour les dossiers virtuels dans les classes"""
    __tablename__ = 'class_folders'

    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    parent_path = db.Column(db.String(500), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    classroom = db.relationship('Classroom', backref='class_folders')

    def get_full_path(self):
        if self.parent_path:
            return f"{self.parent_path}/{self.name}"
        return self.name

    def __repr__(self):
        return f'<ClassFolder {self.get_full_path()} in {self.classroom.name}>'
