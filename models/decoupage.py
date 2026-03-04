from datetime import datetime
from extensions import db


class Decoupage(db.Model):
    """Modèle de découpage annuel - permet de structurer l'année en périodes thématiques"""
    __tablename__ = 'decoupages'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)      # "Découpage Maths 2024"
    subject = db.Column(db.String(100), nullable=False)   # "Mathématiques"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)

    # Relations
    user = db.relationship('User', backref=db.backref('decoupages', lazy='dynamic'))
    periods = db.relationship('DecoupagePeriod', backref='decoupage',
                             lazy='dynamic', cascade='all, delete-orphan',
                             order_by='DecoupagePeriod.order')

    def get_total_weeks(self):
        """Calcule la durée totale du découpage en semaines"""
        return sum(p.duration for p in self.periods)

    def to_dict(self):
        """Convertit le découpage en dictionnaire pour l'API"""
        return {
            'id': self.id,
            'name': self.name,
            'subject': self.subject,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'periods': [p.to_dict() for p in self.periods.order_by(DecoupagePeriod.order)],
            'total_weeks': self.get_total_weeks(),
            'assignments_count': self.assignments.count()
        }

    def __repr__(self):
        return f'<Decoupage {self.name} - {self.subject}>'


class DecoupagePeriod(db.Model):
    """Période d'un découpage - représente une unité thématique"""
    __tablename__ = 'decoupage_periods'

    id = db.Column(db.Integer, primary_key=True)
    decoupage_id = db.Column(db.Integer, db.ForeignKey('decoupages.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)      # "Les fractions"
    duration = db.Column(db.Float, nullable=False)        # 3.0 = 3 semaines, 2.5 = 2.5 sem
    color = db.Column(db.String(7), nullable=False)       # "#FF5733"
    order = db.Column(db.Integer, nullable=False)         # Position dans le découpage

    def to_dict(self):
        """Convertit la période en dictionnaire pour l'API"""
        return {
            'id': self.id,
            'decoupage_id': self.decoupage_id,
            'name': self.name,
            'duration': self.duration,
            'color': self.color,
            'order': self.order
        }

    def __repr__(self):
        return f'<DecoupagePeriod {self.name} ({self.duration} sem)>'


class DecoupageAssignment(db.Model):
    """Assignation d'un découpage à une classe"""
    __tablename__ = 'decoupage_assignments'

    id = db.Column(db.Integer, primary_key=True)
    decoupage_id = db.Column(db.Integer, db.ForeignKey('decoupages.id'), nullable=False)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    start_week = db.Column(db.Integer, default=1)         # Semaine de début (1-52)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    decoupage = db.relationship('Decoupage', backref=db.backref('assignments', lazy='dynamic'))
    classroom = db.relationship('Classroom', backref=db.backref('decoupage_assignments', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('decoupage_id', 'classroom_id', name='_decoupage_classroom_uc'),
    )

    def to_dict(self):
        """Convertit l'assignation en dictionnaire pour l'API"""
        return {
            'id': self.id,
            'decoupage_id': self.decoupage_id,
            'classroom_id': self.classroom_id,
            'classroom_name': self.classroom.name if self.classroom else None,
            'start_week': self.start_week,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<DecoupageAssignment {self.decoupage_id} -> {self.classroom_id}>'
