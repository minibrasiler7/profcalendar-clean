from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from extensions import db
from routes import admin_required
from models.user import User
from models.subscription import Subscription
from models.voucher import Voucher
from datetime import datetime

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


@admin_bp.route('/dashboard')
@admin_required
def dashboard():
    """Tableau de bord administrateur"""
    total_users = User.query.count()
    premium_users = User.query.filter(User.subscription_tier == 'premium').count()
    active_subscriptions = Subscription.query.filter_by(status='active').count()
    active_vouchers = Voucher.query.filter_by(is_active=True).count()

    # Revenus mensuels estimés
    active_subs = Subscription.query.filter_by(status='active').all()
    monthly_revenue = 0
    for sub in active_subs:
        if sub.billing_cycle == 'monthly':
            monthly_revenue += sub.amount
        elif sub.billing_cycle == 'annual':
            monthly_revenue += sub.amount / 12
    monthly_revenue = monthly_revenue / 100  # Convertir centimes en CHF

    # Derniers abonnements
    recent_subs = Subscription.query.order_by(
        Subscription.created_at.desc()
    ).limit(10).all()

    return render_template('admin/dashboard.html',
                           total_users=total_users,
                           premium_users=premium_users,
                           active_subscriptions=active_subscriptions,
                           active_vouchers=active_vouchers,
                           monthly_revenue=monthly_revenue,
                           recent_subscriptions=recent_subs)


@admin_bp.route('/vouchers')
@admin_required
def vouchers():
    """Gestion des bons"""
    all_vouchers = Voucher.query.order_by(Voucher.created_at.desc()).all()
    return render_template('admin/vouchers.html', vouchers=all_vouchers)


@admin_bp.route('/vouchers/create', methods=['POST'])
@admin_required
def create_voucher():
    """Créer un nouveau bon"""
    data = request.get_json()

    code = (data.get('code') or Voucher.generate_code()).upper()
    voucher_type = data.get('type', 'free_days')
    duration_days = data.get('duration_days')
    max_uses = data.get('max_uses')
    expires_at = None

    if data.get('expires_at'):
        try:
            expires_at = datetime.fromisoformat(data['expires_at'])
        except ValueError:
            return jsonify({'error': 'Date d\'expiration invalide'}), 400

    # Vérifier que le code n'existe pas déjà
    if Voucher.query.filter_by(code=code).first():
        return jsonify({'error': f'Le code "{code}" existe déjà'}), 400

    voucher = Voucher(
        code=code,
        voucher_type=voucher_type,
        duration_days=int(duration_days) if voucher_type == 'free_days' and duration_days else None,
        max_uses=int(max_uses) if max_uses else None,
        created_by_id=current_user.id,
        expires_at=expires_at,
    )

    db.session.add(voucher)
    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'Bon {voucher.code} créé avec succès',
            'code': voucher.code,
        })
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erreur création bon: {e}")
        return jsonify({'error': 'Erreur lors de la création du bon'}), 500


@admin_bp.route('/vouchers/<int:voucher_id>/toggle', methods=['POST'])
@admin_required
def toggle_voucher(voucher_id):
    """Activer/désactiver un bon"""
    voucher = Voucher.query.get(voucher_id)
    if not voucher:
        return jsonify({'error': 'Bon non trouvé'}), 404

    voucher.is_active = not voucher.is_active
    db.session.commit()

    return jsonify({'success': True, 'is_active': voucher.is_active})


@admin_bp.route('/subscribers')
@admin_required
def subscribers():
    """Liste des abonnés premium"""
    premium_users = User.query.filter(User.subscription_tier == 'premium').all()
    all_users = User.query.order_by(User.created_at.desc()).all()

    return render_template('admin/subscribers.html',
                           premium_users=premium_users,
                           all_users=all_users)


@admin_bp.route('/subscribers/<int:user_id>/revoke', methods=['POST'])
@admin_required
def revoke_premium(user_id):
    """Révoquer l'accès premium d'un utilisateur"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    user.revoke_premium_access()
    return jsonify({'success': True, 'message': f'Accès premium révoqué pour {user.username}'})


@admin_bp.route('/subscribers/<int:user_id>/grant', methods=['POST'])
@admin_required
def grant_premium(user_id):
    """Accorder manuellement l'accès premium"""
    data = request.get_json()
    days = data.get('days')

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    user.grant_premium_access(days=int(days) if days else None)
    return jsonify({'success': True, 'message': f'Accès premium accordé à {user.username}'})
