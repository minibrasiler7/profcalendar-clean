import random
from datetime import datetime, timedelta
from extensions import db


class EmailVerification(db.Model):
    """Modèle pour stocker les codes de vérification email"""
    __tablename__ = 'email_verifications'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), nullable=False, index=True)
    code = db.Column(db.String(6), nullable=False)
    user_type = db.Column(db.String(20), nullable=False)  # 'teacher', 'parent', 'student'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_used = db.Column(db.Boolean, default=False)

    @staticmethod
    def generate_code():
        """Génère un code aléatoire à 6 chiffres"""
        return str(random.randint(100000, 999999))

    def is_valid(self):
        """Vérifie si le code n'est pas expiré et n'a pas été utilisé"""
        return not self.is_used and datetime.utcnow() < self.expires_at

    @staticmethod
    def create_verification(email, user_type):
        """Crée un nouveau code de vérification et invalide les anciens"""
        # Invalider les anciens codes pour cet email
        EmailVerification.query.filter_by(
            email=email,
            is_used=False
        ).update({'is_used': True})

        code = EmailVerification.generate_code()
        verification = EmailVerification(
            email=email,
            code=code,
            user_type=user_type,
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        db.session.add(verification)
        db.session.flush()
        return verification

    @staticmethod
    def cleanup_expired():
        """Supprime les codes expirés de plus de 24h"""
        cutoff = datetime.utcnow() - timedelta(hours=24)
        EmailVerification.query.filter(
            EmailVerification.created_at < cutoff
        ).delete()
        db.session.commit()

    def __repr__(self):
        return f'<EmailVerification {self.email} - {self.code}>'
