from datetime import datetime
from extensions import db


class PushToken(db.Model):
    __tablename__ = 'push_tokens'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    platform = db.Column(db.String(20), nullable=False)  # android | ios | web | unknown
    token = db.Column(db.String(512), nullable=False, unique=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref='push_tokens')

    __table_args__ = (
        db.Index('idx_push_token_user', 'user_id'),
    )
