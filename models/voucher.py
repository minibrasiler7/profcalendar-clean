from extensions import db
from datetime import datetime
import secrets
import string


# Table d'association pour les utilisations de bons
user_voucher_redemptions = db.Table(
    'user_voucher_redemptions',
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('voucher_id', db.Integer, db.ForeignKey('vouchers.id'), primary_key=True),
    db.Column('redeemed_at', db.DateTime, default=datetime.utcnow)
)


class Voucher(db.Model):
    __tablename__ = 'vouchers'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)

    # Type de bon
    voucher_type = db.Column(db.String(50), nullable=False)  # 'free_days' ou 'unlimited'
    duration_days = db.Column(db.Integer, nullable=True)  # Pour le type free_days

    # Limites d'utilisation
    max_uses = db.Column(db.Integer, nullable=True)  # None = illimité
    current_uses = db.Column(db.Integer, default=0)

    # Info admin
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_by = db.relationship('User', foreign_keys=[created_by_id], backref='created_vouchers')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=True)  # Expiration du bon

    # Statut
    is_active = db.Column(db.Boolean, default=True)

    # Utilisateurs ayant utilisé ce bon
    users = db.relationship('User', secondary=user_voucher_redemptions,
                            backref=db.backref('redeemed_vouchers', lazy='dynamic'))

    @staticmethod
    def generate_code(length=8):
        """Génère un code de bon aléatoire"""
        chars = string.ascii_uppercase + string.digits
        # Exclure les caractères ambigus (0/O, 1/I/L)
        chars = chars.replace('0', '').replace('O', '').replace('1', '').replace('I', '').replace('L', '')
        return ''.join(secrets.choice(chars) for _ in range(length))

    def is_valid(self):
        """Vérifie si le bon est valide"""
        if not self.is_active:
            return False
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        if self.max_uses is not None and self.current_uses >= self.max_uses:
            return False
        return True

    def can_redeem(self, user):
        """Vérifie si un utilisateur peut utiliser ce bon"""
        if not self.is_valid():
            return False
        # Vérifier si l'utilisateur a déjà utilisé ce bon
        if user in self.users:
            return False
        return True

    def redeem(self, user):
        """Utiliser le bon pour un utilisateur"""
        if not self.can_redeem(user):
            raise ValueError("Impossible d'utiliser ce bon")

        self.current_uses += 1
        self.users.append(user)

        # Accorder l'accès premium
        if self.voucher_type == 'free_days' and self.duration_days:
            user.grant_premium_access(days=self.duration_days)
        elif self.voucher_type == 'unlimited':
            user.grant_premium_access()  # Sans expiration

        db.session.commit()

    def __repr__(self):
        return f'<Voucher {self.code} ({self.voucher_type})>'
