"""Évaluation formative : suivi rapide « qui a fait / réussi son travail ».

Fonction DÉSACTIVÉE par défaut (UserPreferences.formative_enabled) pour ne pas
alourdir l'interface de ceux qui n'en veulent pas. Quand elle est active, un
onglet apparaît dans « Gérer les classes ».

Trois objets :
  - FormativeLevel      : l'échelle d'appréciation, définie par l'enseignant
                          (« Acquis », « En cours », « Non acquis »…). Propre à
                          l'enseignant, partagée par toutes ses classes.
  - FormativeAssessment : un test formatif / un devoir donné à UNE discipline
                          (un Classroom précis, pas le groupe de classe : une
                          évaluation de maths n'a rien à faire en français).
  - FormativeEntry      : ce que l'élève a obtenu pour cette évaluation —
                          appréciation, commentaire et pastille de couleur,
                          chacun facultatif car l'enseignant choisit dans ses
                          paramètres lesquels des trois il utilise.
"""
from datetime import datetime

from extensions import db
from utils.custom_types import EncryptedString, EncryptedText

# Échelle proposée au premier usage. L'enseignant la modifie ensuite librement.
DEFAULT_LEVELS = ['Acquis', 'En cours d\'acquisition', 'Non acquis']

# Les trois colonnes que l'enseignant peut activer/désactiver.
FIELD_KEYS = ('level', 'comment', 'color')
DEFAULT_FIELDS = 'level,comment,color'


class FormativeLevel(db.Model):
    """Un niveau de l'échelle d'appréciation de l'enseignant.

    Volontairement SANS couleur : la couleur est la pastille, qui est une
    dimension séparée que l'enseignant peut activer indépendamment. Mélanger
    les deux rendrait l'affichage illisible quand les deux sont actives.
    """
    __tablename__ = 'formative_levels'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    label = db.Column(db.String(60), nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('formative_levels', lazy='dynamic'))

    @classmethod
    def ensure_defaults(cls, user_id):
        """Crée l'échelle par défaut si l'enseignant n'en a aucune.

        Appelé quand il active la fonction : sans niveaux, la colonne
        « appréciation » serait vide et la fonction paraîtrait cassée.
        """
        if cls.query.filter_by(user_id=user_id).first():
            return
        for i, label in enumerate(DEFAULT_LEVELS):
            db.session.add(cls(user_id=user_id, label=label, position=i))
        db.session.commit()

    def to_dict(self):
        return {'id': self.id, 'label': self.label, 'position': self.position}

    def __repr__(self):
        return f'<FormativeLevel {self.label!r}>'


class FormativeAssessment(db.Model):
    """Un test formatif ou un devoir observé, pour une discipline donnée."""
    __tablename__ = 'formative_assessments'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id', ondelete='CASCADE'),
                             nullable=False, index=True)

    title = db.Column(EncryptedString(), nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow, index=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('formative_assessments', lazy='dynamic'))
    classroom = db.relationship('Classroom', backref=db.backref('formative_assessments', lazy='dynamic'))
    entries = db.relationship('FormativeEntry', backref='assessment',
                              cascade='all, delete-orphan', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'date': self.date.isoformat() if self.date else None,
            'classroom_id': self.classroom_id,
            'subject': self.classroom.subject if self.classroom else None,
            'classroom_name': self.classroom.name if self.classroom else None,
        }

    def __repr__(self):
        return f'<FormativeAssessment {self.id} classroom={self.classroom_id}>'


class FormativeEntry(db.Model):
    """Ce qu'un élève a obtenu pour une évaluation formative.

    Les trois champs sont facultatifs : une ligne peut ne porter qu'une
    pastille, ou qu'un commentaire. Une ligne entièrement vide est supprimée
    plutôt que conservée (cf. routes/formative.py) — ça garde la grille propre.
    """
    __tablename__ = 'formative_entries'

    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.Integer, db.ForeignKey('formative_assessments.id', ondelete='CASCADE'),
                              nullable=False, index=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id', ondelete='CASCADE'),
                           nullable=False, index=True)

    # Appréciation : référence un niveau de l'échelle. ondelete SET NULL côté
    # base (cf. app.py) pour qu'un niveau supprimé n'efface pas l'entrée.
    level_id = db.Column(db.Integer, db.ForeignKey('formative_levels.id', ondelete='SET NULL'),
                         nullable=True)
    comment = db.Column(EncryptedText(), nullable=True)
    color = db.Column(db.String(7), nullable=True)   # pastille, ex. '#22C55E'

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = db.relationship('Student')
    level = db.relationship('FormativeLevel')

    __table_args__ = (
        db.UniqueConstraint('assessment_id', 'student_id', name='_formative_entry_uc'),
    )

    def is_empty(self):
        return not (self.level_id or (self.comment or '').strip() or self.color)

    def to_dict(self):
        return {
            'id': self.id,
            'assessment_id': self.assessment_id,
            'student_id': self.student_id,
            'level_id': self.level_id,
            'level_label': self.level.label if self.level else None,
            'comment': self.comment,
            'color': self.color,
        }

    def __repr__(self):
        return f'<FormativeEntry a={self.assessment_id} s={self.student_id}>'
