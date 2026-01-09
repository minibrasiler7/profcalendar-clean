from flask import Blueprint, request, jsonify
from flask_login import current_user, login_required
from extensions import db
from models.push_token import PushToken

push_bp = Blueprint('push', __name__, url_prefix='/api/push')


@push_bp.route('/register', methods=['POST'])
@login_required
def register_push_token():
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or '').strip()
    platform = (data.get('platform') or 'unknown').lower()

    if not token:
        return jsonify({'success': False, 'message': 'Token manquant'}), 400

    # Eviter les doublons token
    existing = PushToken.query.filter_by(token=token).first()
    if existing:
        # Réassocier si user différent, sinon juste update timestamp
        existing.user_id = current_user.id
        existing.platform = platform or existing.platform
    else:
        new_token = PushToken(user_id=current_user.id, platform=platform, token=token)
        db.session.add(new_token)

    db.session.commit()
    return jsonify({'success': True})
