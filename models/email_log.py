"""Journal des e-mails automatiques déjà envoyés (un par utilisateur et par sorte).

Sert d'idempotence aux relances de conversion (services/conversion_emails.py) :
la boucle de fond peut tourner plusieurs fois par jour, chaque e-mail ne part
qu'une fois. Table créée au démarrage (app.py), sans migration.
"""
from datetime import datetime

from extensions import db


class EmailLog(db.Model):
    __tablename__ = 'email_log'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    kind = db.Column(db.String(120), nullable=False)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint('user_id', 'kind', name='uq_email_log_user_kind'),)
