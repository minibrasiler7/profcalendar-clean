from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_required, current_user
from extensions import db
from models.user import User
from models.subscription import Subscription
from models.voucher import Voucher
from datetime import datetime
import stripe

subscription_bp = Blueprint('subscription', __name__, url_prefix='/subscription')


@subscription_bp.route('/pricing')
def pricing():
    """Page de tarification avec les différentes offres"""
    is_premium = False
    if current_user.is_authenticated and hasattr(current_user, 'has_premium_access'):
        is_premium = current_user.has_premium_access()

    return render_template('subscription/pricing.html',
                           stripe_public_key=current_app.config.get('STRIPE_PUBLIC_KEY'),
                           is_premium=is_premium)


@subscription_bp.route('/checkout', methods=['POST'])
@login_required
def checkout():
    """Créer une session Stripe Checkout"""
    data = request.get_json()
    billing_cycle = data.get('billing_cycle', 'monthly')

    if billing_cycle == 'annual':
        price_id = current_app.config.get('STRIPE_PRICE_ANNUAL')
    else:
        price_id = current_app.config.get('STRIPE_PRICE_MONTHLY')

    if not price_id:
        return jsonify({'error': 'Configuration de prix manquante'}), 500

    try:
        stripe.api_key = current_app.config.get('STRIPE_SECRET_KEY')

        # Créer ou récupérer le client Stripe
        if not current_user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.username,
                metadata={'user_id': str(current_user.id)}
            )
            current_user.stripe_customer_id = customer.id
            db.session.commit()

        # Créer la session Checkout
        checkout_session = stripe.checkout.Session.create(
            customer=current_user.stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=url_for('subscription.success', _external=True) + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=url_for('subscription.pricing', _external=True),
            client_reference_id=str(current_user.id),
            locale='fr',
        )

        return jsonify({'checkout_url': checkout_session.url})

    except stripe.error.StripeError as e:
        current_app.logger.error(f"Erreur Stripe: {e}")
        return jsonify({'error': str(e)}), 400


@subscription_bp.route('/success')
@login_required
def success():
    """Page de succès après abonnement"""
    return render_template('subscription/success.html')


@subscription_bp.route('/manage')
@login_required
def manage():
    """Page de gestion de l'abonnement"""
    subscription = Subscription.query.filter_by(
        user_id=current_user.id
    ).order_by(Subscription.created_at.desc()).first()

    return render_template('subscription/manage.html',
                           subscription=subscription,
                           is_premium=current_user.has_premium_access(),
                           premium_until=current_user.premium_until)


@subscription_bp.route('/customer-portal')
@login_required
def customer_portal():
    """Rediriger vers le portail client Stripe"""
    if not current_user.stripe_customer_id:
        flash('Aucun abonnement actif trouvé.', 'error')
        return redirect(url_for('subscription.pricing'))

    try:
        stripe.api_key = current_app.config.get('STRIPE_SECRET_KEY')
        portal_session = stripe.billing_portal.Session.create(
            customer=current_user.stripe_customer_id,
            return_url=url_for('subscription.manage', _external=True),
        )
        return redirect(portal_session.url)
    except stripe.error.StripeError as e:
        current_app.logger.error(f"Erreur portail Stripe: {e}")
        flash('Erreur lors de l\'accès au portail de facturation.', 'error')
        return redirect(url_for('subscription.manage'))


@subscription_bp.route('/redeem-voucher', methods=['POST'])
@login_required
def redeem_voucher():
    """Utiliser un bon pour obtenir l'accès premium"""
    data = request.get_json()
    code = data.get('code', '').strip().upper()

    if not code:
        return jsonify({'error': 'Veuillez entrer un code.'}), 400

    voucher = Voucher.query.filter_by(code=code).first()

    if not voucher:
        return jsonify({'error': 'Code invalide.'}), 404

    if not voucher.is_valid():
        if not voucher.is_active:
            return jsonify({'error': 'Ce bon n\'est plus actif.'}), 400
        if voucher.expires_at and voucher.expires_at < datetime.utcnow():
            return jsonify({'error': 'Ce bon a expiré.'}), 400
        if voucher.max_uses is not None and voucher.current_uses >= voucher.max_uses:
            return jsonify({'error': 'Ce bon a atteint sa limite d\'utilisation.'}), 400

    if current_user in voucher.users:
        return jsonify({'error': 'Vous avez déjà utilisé ce bon.'}), 400

    try:
        voucher.redeem(current_user)

        msg = 'Bon activé avec succès ! Vous avez maintenant accès à toutes les fonctionnalités premium.'
        if voucher.voucher_type == 'free_days' and voucher.duration_days:
            msg += f' (Accès pour {voucher.duration_days} jours)'

        return jsonify({
            'success': True,
            'message': msg,
            'premium_until': current_user.premium_until.isoformat() if current_user.premium_until else None
        })
    except Exception as e:
        current_app.logger.error(f"Erreur utilisation bon: {e}")
        return jsonify({'error': 'Erreur lors de l\'activation du bon.'}), 500


@subscription_bp.route('/webhook', methods=['POST'])
def webhook():
    """Gérer les webhooks Stripe"""
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')
    webhook_secret = current_app.config.get('STRIPE_WEBHOOK_SECRET')

    try:
        stripe.api_key = current_app.config.get('STRIPE_SECRET_KEY')
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError:
        return jsonify({'error': 'Payload invalide'}), 400
    except stripe.error.SignatureVerificationError:
        return jsonify({'error': 'Signature invalide'}), 400

    event_type = event['type']
    data_object = event['data']['object']

    if event_type == 'customer.subscription.created':
        _handle_subscription_created(data_object)
    elif event_type == 'customer.subscription.updated':
        _handle_subscription_updated(data_object)
    elif event_type == 'customer.subscription.deleted':
        _handle_subscription_deleted(data_object)
    elif event_type == 'invoice.payment_failed':
        _handle_payment_failed(data_object)

    return jsonify({'success': True})


def _handle_subscription_created(sub_data):
    """Traiter la création d'un abonnement"""
    user = User.query.filter_by(stripe_customer_id=sub_data['customer']).first()
    if not user:
        return

    item = sub_data['items']['data'][0]
    interval = item['price']['recurring']['interval']

    subscription = Subscription(
        user_id=user.id,
        stripe_subscription_id=sub_data['id'],
        stripe_customer_id=sub_data['customer'],
        status=sub_data['status'],
        billing_cycle='annual' if interval == 'year' else 'monthly',
        price_id=item['price']['id'],
        amount=item['price']['unit_amount'] or 0,
        currency=item['price'].get('currency', 'chf'),
        current_period_start=datetime.fromtimestamp(sub_data['current_period_start']),
        current_period_end=datetime.fromtimestamp(sub_data['current_period_end']),
    )

    user.stripe_subscription_id = sub_data['id']
    user.subscription_tier = 'premium'
    user.premium_until = datetime.fromtimestamp(sub_data['current_period_end'])

    db.session.add(subscription)
    db.session.commit()


def _handle_subscription_updated(sub_data):
    """Traiter la mise à jour d'un abonnement"""
    sub = Subscription.query.filter_by(stripe_subscription_id=sub_data['id']).first()
    if not sub:
        return

    sub.status = sub_data['status']
    sub.current_period_start = datetime.fromtimestamp(sub_data['current_period_start'])
    sub.current_period_end = datetime.fromtimestamp(sub_data['current_period_end'])

    user = User.query.get(sub.user_id)
    if user:
        if sub_data['status'] == 'active':
            user.subscription_tier = 'premium'
            user.premium_until = datetime.fromtimestamp(sub_data['current_period_end'])
        elif sub_data['status'] in ('past_due', 'unpaid'):
            pass  # Garder premium mais marquer comme en retard

    db.session.commit()


def _handle_subscription_deleted(sub_data):
    """Traiter l'annulation d'un abonnement"""
    user = User.query.filter_by(stripe_subscription_id=sub_data['id']).first()
    if not user:
        return

    user.subscription_tier = 'freemium'
    user.premium_until = None
    user.stripe_subscription_id = None

    sub = Subscription.query.filter_by(stripe_subscription_id=sub_data['id']).first()
    if sub:
        sub.status = 'canceled'
        sub.canceled_at = datetime.utcnow()

    db.session.commit()


def _handle_payment_failed(invoice_data):
    """Traiter un échec de paiement"""
    user = User.query.filter_by(stripe_customer_id=invoice_data['customer']).first()
    if user:
        # Ne pas révoquer immédiatement, Stripe réessaiera
        sub = Subscription.query.filter_by(user_id=user.id, status='active').first()
        if sub:
            sub.status = 'past_due'
            db.session.commit()
