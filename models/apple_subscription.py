"""Modèle pour suivre les abonnements achetés via In-App Purchase (Apple).

Distinct du modèle ``Subscription`` (qui suit les abonnements Stripe). Un
utilisateur peut très bien avoir les deux dans son historique (ex: il a
testé l'app iOS puis a migré sur web Stripe — chaque transaction reste
traçable).

Chaque abonnement App Store est identifié par son
``original_transaction_id`` (constant à travers tous les renouvellements).
``latest_transaction_id`` change à chaque renouvellement automatique et
permet d'identifier la transaction la plus récente reçue via les
App Store Server Notifications V2.
"""

from extensions import db
from datetime import datetime


class AppleSubscription(db.Model):
    __tablename__ = 'apple_subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # Identifiants Apple
    original_transaction_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    latest_transaction_id = db.Column(db.String(64), nullable=True)
    product_id = db.Column(db.String(120), nullable=False)
    bundle_id = db.Column(db.String(120), nullable=True)

    # Environnement (sandbox / production)
    environment = db.Column(db.String(20), default='production')

    # État de l'abonnement
    # 'active' | 'expired' | 'in_grace_period' | 'revoked' | 'pending'
    status = db.Column(db.String(20), default='active')

    # Dates importantes (toutes en UTC)
    purchase_date = db.Column(db.DateTime, nullable=True)
    expires_date = db.Column(db.DateTime, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)
    revoked_at = db.Column(db.DateTime, nullable=True)

    # Métadonnées
    auto_renew_status = db.Column(db.Boolean, default=True)
    in_trial_period = db.Column(db.Boolean, default=False)
    in_intro_offer_period = db.Column(db.Boolean, default=False)

    # Dernière JWS reçue (utile pour debug + audit Apple en cas de litige)
    last_signed_payload = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relation
    user = db.relationship('User', backref=db.backref('apple_subscriptions', lazy='dynamic'))

    def is_active(self) -> bool:
        """Renvoie True si l'abonnement donne actuellement accès Premium.

        Couvre :
          - status = 'active' avec expires_date dans le futur
          - status = 'in_grace_period' (Apple laisse un délai de 16j sur les
            renouvellements échoués pour les abonnements mensuels)
        """
        if self.status not in ('active', 'in_grace_period'):
            return False
        if self.expires_date is None:
            return False
        return self.expires_date > datetime.utcnow()

    def __repr__(self):
        return (f'<AppleSubscription user={self.user_id} '
                f'product={self.product_id} status={self.status}>')
