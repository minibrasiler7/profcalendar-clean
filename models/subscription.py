from extensions import db
from datetime import datetime


class Subscription(db.Model):
    __tablename__ = 'subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    stripe_subscription_id = db.Column(db.String(255), unique=True, nullable=True)
    stripe_customer_id = db.Column(db.String(255), nullable=False)

    # Détails de l'abonnement
    status = db.Column(db.String(50), nullable=False)  # active, canceled, past_due, incomplete
    billing_cycle = db.Column(db.String(50), nullable=False)  # monthly, annual
    price_id = db.Column(db.String(255), nullable=False)  # ID du prix Stripe
    amount = db.Column(db.Integer, nullable=False)  # Montant en centimes
    currency = db.Column(db.String(3), default='chf')

    # Dates
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    current_period_start = db.Column(db.DateTime)
    current_period_end = db.Column(db.DateTime)
    canceled_at = db.Column(db.DateTime, nullable=True)

    # Relation
    user = db.relationship('User', backref=db.backref('subscriptions', lazy='dynamic'))

    def __repr__(self):
        return f'<Subscription {self.stripe_subscription_id} ({self.status})>'
