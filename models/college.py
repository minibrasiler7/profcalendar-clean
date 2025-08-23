from extensions import db
from datetime import datetime, time

class College(db.Model):
    """Modèle pour représenter un collège/établissement scolaire"""
    __tablename__ = 'colleges'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, unique=True, index=True)
    
    # Configuration partagée du collège
    school_year_start = db.Column(db.Date)
    school_year_end = db.Column(db.Date)
    day_start_time = db.Column(db.Time)
    day_end_time = db.Column(db.Time)
    period_duration = db.Column(db.Integer)  # en minutes
    break_duration = db.Column(db.Integer)   # en minutes
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Relations
    created_by = db.relationship('User', backref='created_colleges')
    holidays = db.relationship('CollegeHoliday', backref='college', lazy='dynamic', cascade='all, delete-orphan')
    breaks = db.relationship('CollegeBreak', backref='college', lazy='dynamic', cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<College {self.name}>'
    
    def to_dict(self):
        """Convertit le collège en dictionnaire pour l'API"""
        return {
            'id': self.id,
            'name': self.name,
            'school_year_start': self.school_year_start.isoformat() if self.school_year_start else None,
            'school_year_end': self.school_year_end.isoformat() if self.school_year_end else None,
            'day_start_time': self.day_start_time.strftime('%H:%M') if self.day_start_time else None,
            'day_end_time': self.day_end_time.strftime('%H:%M') if self.day_end_time else None,
            'period_duration': self.period_duration,
            'break_duration': self.break_duration
        }


class CollegeHoliday(db.Model):
    """Modèle pour les vacances au niveau du collège"""
    __tablename__ = 'college_holidays'
    
    id = db.Column(db.Integer, primary_key=True)
    college_id = db.Column(db.Integer, db.ForeignKey('colleges.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<CollegeHoliday {self.name}>'


class CollegeBreak(db.Model):
    """Modèle pour les pauses au niveau du collège"""
    __tablename__ = 'college_breaks'
    
    id = db.Column(db.Integer, primary_key=True)
    college_id = db.Column(db.Integer, db.ForeignKey('colleges.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    is_major_break = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<CollegeBreak {self.name}>'