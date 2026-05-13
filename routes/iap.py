"""Routes Flask pour les In-App Purchases Apple.

Endpoints exposés :

  POST /api/iap/products
    Renvoie la liste des product IDs définis dans App Store Connect. L'app
    iOS utilise StoreKit 2 ``Product.products(for: [...])`` pour récupérer
    leurs détails. Source de vérité serveur = pas de hardcoded côté Swift.

  POST /api/iap/validate-transaction
    Reçoit un JWS signé d'Apple (transaction.jwsRepresentation) envoyé par
    l'app iOS juste après un achat ou un Transaction.updates. Vérifie la
    signature avec la chaîne Apple Root CA G3, met à jour la DB.

  POST /api/iap/notifications
    Webhook App Store Server Notifications V2 — Apple envoie ici un JWS
    pour chaque événement (renouvellement, annulation, remboursement,
    grâce, etc.). Pas de session : c'est Apple → notre serveur.

  POST /api/iap/restore
    L'utilisateur clique « Restaurer mes achats » dans l'app. iOS envoie
    toutes ses transactions actives, on les valide une par une.
"""

import logging
import os

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

from extensions import db
from utils.apple_iap import (
    verify_signed_jws,
    process_transaction_for_user,
    find_latest_transaction_in_payload,
    DEFAULT_BUNDLE_ID,
)

logger = logging.getLogger(__name__)

iap_bp = Blueprint('iap', __name__, url_prefix='/api/iap')


# Liste des product IDs configurés dans App Store Connect.
# IMPORTANT : ces IDs doivent matcher EXACTEMENT ceux créés dans
# App Store Connect → Monetization → Subscriptions.
IAP_PRODUCT_IDS = [
    'ch.teacherplanner.teacher.premium.monthly',
    'ch.teacherplanner.teacher.premium.annual',
]


@iap_bp.route('/products', methods=['GET'])
@login_required
def list_products():
    """Retourne la liste des product_ids d'abonnement."""
    return jsonify({
        'success': True,
        'product_ids': IAP_PRODUCT_IDS,
        'bundle_id': os.environ.get('APPLE_IAP_BUNDLE_ID', DEFAULT_BUNDLE_ID),
    })


@iap_bp.route('/validate-transaction', methods=['POST'])
@login_required
def validate_transaction():
    """Valide une transaction Apple envoyée par l'app iOS.

    Body JSON attendu :
      {
        "signed_transaction": "eyJ...<JWS>..."  // transaction.jwsRepresentation
      }
    """
    data = request.get_json(silent=True) or {}
    signed_tx = data.get('signed_transaction')

    if not signed_tx:
        return jsonify({
            'success': False,
            'message': 'signed_transaction manquant'
        }), 400

    try:
        tx_info = verify_signed_jws(signed_tx)
    except ValueError as e:
        logger.warning(f"[IAP] Validation JWS échouée pour user {current_user.id} : {e}")
        return jsonify({
            'success': False,
            'message': f'Signature Apple invalide : {e}'
        }), 400
    except Exception as e:
        logger.exception(f"[IAP] Erreur inattendue lors de la validation JWS")
        return jsonify({
            'success': False,
            'message': f'Erreur de validation : {e}'
        }), 500

    # On vérifie aussi que le user qui a posté est bien celui qui a payé.
    # appAccountToken (UUID) est passé par l'app iOS au moment de l'achat
    # pour lier la transaction à un user_id ProfCalendar. Pas obligatoire
    # mais recommandé Apple.
    app_account_token = tx_info.get('appAccountToken')
    if app_account_token:
        # On stockera le token pour audit ; ici on s'assure juste que rien
        # ne lie déjà la transaction à un AUTRE user (process_transaction_for_user
        # le vérifie de toute façon).
        logger.info(f"[IAP] appAccountToken: {app_account_token} pour user {current_user.id}")

    try:
        sub = process_transaction_for_user(current_user, tx_info, raw_jws=signed_tx)
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception("[IAP] Erreur process_transaction_for_user")
        return jsonify({'success': False, 'message': str(e)}), 500

    return jsonify({
        'success': True,
        'subscription': {
            'product_id': sub.product_id,
            'status': sub.status,
            'expires_date': sub.expires_date.isoformat() if sub.expires_date else None,
            'environment': sub.environment,
        },
        'is_premium': current_user.has_premium_access(),
    })


@iap_bp.route('/restore', methods=['POST'])
@login_required
def restore():
    """Restaure les achats de l'utilisateur depuis une liste de JWS.

    Body JSON attendu :
      { "signed_transactions": ["<JWS>", "<JWS>", ...] }

    Renvoie le statut Premium final.
    """
    data = request.get_json(silent=True) or {}
    signed_list = data.get('signed_transactions') or []
    if not isinstance(signed_list, list):
        return jsonify({'success': False, 'message': 'signed_transactions doit être une liste'}), 400

    restored = 0
    errors = []
    for signed in signed_list:
        try:
            tx_info = verify_signed_jws(signed)
            process_transaction_for_user(current_user, tx_info, raw_jws=signed)
            restored += 1
        except Exception as e:
            errors.append(str(e))
            logger.warning(f"[IAP restore] échec sur une transaction : {e}")

    return jsonify({
        'success': True,
        'restored': restored,
        'errors': errors,
        'is_premium': current_user.has_premium_access(),
    })


@iap_bp.route('/notifications', methods=['POST'])
def app_store_notifications():
    """Webhook App Store Server Notifications V2.

    Apple POSTe ici à chaque événement d'abonnement (renouvellement,
    annulation, remboursement, etc.). Pas d'authentification de session :
    la vérification se fait via la signature JWS Apple.

    Body attendu (raw JSON) :
      { "signedPayload": "<JWS>" }

    Apple s'attend à un 200 OK pour ne pas re-tenter. Tout autre code
    déclenche un retry.
    """
    data = request.get_json(silent=True) or {}
    signed_payload = data.get('signedPayload')
    if not signed_payload:
        logger.warning("[IAP notif] body sans signedPayload")
        return ('signedPayload manquant', 400)

    try:
        payload = verify_signed_jws(signed_payload)
    except Exception as e:
        logger.exception(f"[IAP notif] vérif JWS échouée : {e}")
        # On renvoie 200 pour qu'Apple ne re-tente pas indéfiniment sur un
        # JWS invalide. Si c'est un vrai bug côté nous, on aura les logs.
        return ('JWS invalide', 200)

    notification_type = payload.get('notificationType', 'UNKNOWN')
    subtype = payload.get('subtype', '')
    logger.info(f"[IAP notif] {notification_type} / {subtype}")

    # Extraire la transaction associée
    tx_info, raw_jws = find_latest_transaction_in_payload(payload)
    if not tx_info:
        logger.warning("[IAP notif] payload sans signedTransactionInfo exploitable")
        return ('OK', 200)

    # Retrouver l'utilisateur : on fait correspondre originalTransactionId
    # à un AppleSubscription existant. La toute première transaction
    # (notification type SUBSCRIBED) est créée par /validate-transaction
    # depuis l'app, donc on a toujours le mapping AVANT que cette
    # notification n'arrive.
    from models.apple_subscription import AppleSubscription
    from models.user import User
    original_tx_id = (tx_info.get('originalTransactionId') or
                      tx_info.get('transactionId'))
    sub = AppleSubscription.query.filter_by(
        original_transaction_id=str(original_tx_id)
    ).first()
    if not sub:
        logger.warning(
            f"[IAP notif] originalTransactionId={original_tx_id} inconnu — "
            f"on attend que l'app fasse /validate-transaction d'abord"
        )
        return ('OK', 200)

    user = User.query.get(sub.user_id)
    if not user:
        logger.error(f"[IAP notif] User {sub.user_id} introuvable")
        return ('OK', 200)

    try:
        process_transaction_for_user(user, tx_info, raw_jws=raw_jws)

        # Gérer les statuts particuliers déduits du notificationType :
        #   EXPIRED      → status='expired'
        #   REVOKE       → status='revoked'
        #   GRACE_PERIOD_EXPIRED → status='expired'
        #   DID_FAIL_TO_RENEW + subtype=GRACE_PERIOD → 'in_grace_period'
        nt = notification_type.upper()
        if nt == 'EXPIRED':
            sub.status = 'expired'
        elif nt == 'REFUND' or nt == 'REVOKE':
            sub.status = 'revoked'
        elif nt == 'DID_FAIL_TO_RENEW' and 'GRACE_PERIOD' in subtype.upper():
            sub.status = 'in_grace_period'
        elif nt == 'DID_RENEW':
            sub.status = 'active'

        # Si l'abonnement n'est plus actif et que c'était la seule source
        # Premium de l'utilisateur, on retire le flag premium global.
        if not sub.is_active():
            other_active = AppleSubscription.query.filter(
                AppleSubscription.user_id == user.id,
                AppleSubscription.id != sub.id,
                AppleSubscription.status.in_(['active', 'in_grace_period'])
            ).first()
            if not other_active and not user.stripe_subscription_id:
                # Seulement si pas d'abonnement Stripe en parallèle
                user.subscription_tier = 'freemium'
                user.premium_until = None

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.exception("[IAP notif] erreur traitement")

    return ('OK', 200)
