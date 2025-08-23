from extensions import db
from datetime import datetime, timedelta

class ClassroomAccessCode(db.Model):
    __tablename__ = 'classroom_access_codes'
    
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    code = db.Column(db.String(6), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Relations
    classroom = db.relationship('Classroom', backref='classroom_access_codes')
    created_by = db.relationship('User', backref='created_classroom_codes')
    
    def is_valid(self):
        """Vérifier si le code est valide"""
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return False
        return True
    
    def is_expired(self):
        """Vérifier si le code est expiré (durée de validité: 1 an)"""
        from datetime import timedelta
        if not self.created_at:
            return True
        expiry_date = self.created_at + timedelta(days=365)
        return datetime.utcnow() > expiry_date
    
    @property
    def expires_at_one_year(self):
        """Date d'expiration du code (1 an)"""
        from datetime import timedelta
        if not self.created_at:
            return None
        return self.created_at + timedelta(days=365)
    
    @staticmethod
    def generate_code(length=6):
        """Génère un code aléatoire unique"""
        import string
        import secrets
        characters = string.ascii_uppercase + string.digits
        while True:
            code = ''.join(secrets.choice(characters) for _ in range(length))
            if not ClassroomAccessCode.query.filter_by(code=code).first():
                return code