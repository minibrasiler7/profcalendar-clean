"""Utilitaires pour valider et traiter les transactions In-App Purchase Apple.

# Comment ça marche (StoreKit 2)
1. L'app iOS effectue un achat via StoreKit 2.
2. iOS reçoit une ``Transaction`` qui contient un attribut
   ``jwsRepresentation`` : un **JSON Web Signature (JWS)** signé par Apple.
3. L'app iOS envoie ce JWS au backend (POST /api/iap/validate-transaction).
4. Le backend décode le JWS, **vérifie la chaîne de certificats Apple** dans
   l'en-tête ``x5c`` du JWS, puis valide la signature avec la clé publique
   du certificat leaf.
5. Si valide, on extrait ``original_transaction_id``, ``product_id``,
   ``expires_date`` etc. et on met à jour l'utilisateur.

# Chaîne de certificats Apple
Le JWS d'Apple contient toute la chaîne de certificats dans le header
``x5c`` :
   [0] = certificat leaf (signataire)
   [1] = certificat intermédiaire (Apple WWDR)
   [2] = certificat racine (Apple Root CA - G3)

On vérifie que :
  - chaque certificat est signé par le suivant
  - le certificat racine correspond à un AppleRootCA-G3 connu

# Endpoint App Store Server Notifications V2
Apple envoie aussi des JWS à notre serveur pour signaler les renouvellements,
annulations, remboursements, etc. Même format, même vérification.

# Configuration
Variables d'environnement attendues :
  - APPLE_IAP_BUNDLE_ID : "ch.teacherplanner.teacher" (déjà dans Info.plist)
  - APPLE_IAP_ENVIRONMENT : "sandbox" ou "production" (auto-détecté en
    général ; le JWS contient son propre champ environment)

Aucune clé privée n'est nécessaire pour la validation : tout est dans le JWS.
"""

import base64
import json
import logging
import os
from datetime import datetime
from typing import Optional, Tuple

import jwt
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding as crypto_padding, ec, rsa

logger = logging.getLogger(__name__)


# Bundle ID attendu pour les transactions ProfCalendar Enseignant.
DEFAULT_BUNDLE_ID = "ch.teacherplanner.teacher"

# Apple Root CA - G3 (PEM). Téléchargé depuis
# https://www.apple.com/certificateauthority/AppleRootCA-G3.cer puis
# converti en PEM. Permet la vérification offline complète de la chaîne.
APPLE_ROOT_CA_G3_PEM = b"""-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
"""


def _b64url_decode(data: str) -> bytes:
    """Decode base64-url with padding fix."""
    padding = '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _decode_jws_header(jws: str) -> dict:
    """Decode the JWS header (1st segment), without verifying anything yet."""
    header_segment = jws.split('.', 2)[0]
    return json.loads(_b64url_decode(header_segment))


def _verify_certificate_chain(x5c_list) -> x509.Certificate:
    """Vérifie qu'une chaîne x5c provient bien d'Apple Root CA G3.

    x5c_list : liste de strings base64 (PAS base64url) — c'est le format
    standard JWS.

    Renvoie : le certificat leaf (signataire) si la chaîne est valide.
    Lève : ValueError si la chaîne ne remonte pas à Apple Root CA G3.
    """
    # Parser tous les certificats
    certs = []
    for cert_b64 in x5c_list:
        cert_der = base64.b64decode(cert_b64)
        certs.append(x509.load_der_x509_certificate(cert_der, default_backend()))

    if len(certs) < 2:
        raise ValueError(f"Chaîne de certificats trop courte ({len(certs)})")

    # Charger Apple Root CA G3 comme ancre de confiance
    apple_root = x509.load_pem_x509_certificate(APPLE_ROOT_CA_G3_PEM, default_backend())

    # Le dernier cert de la chaîne doit être Apple Root CA G3 (ou un cert
    # signé par lui)
    last = certs[-1]
    # On compare les Subject CN
    last_subject = last.subject.rfc4514_string()
    apple_root_subject = apple_root.subject.rfc4514_string()
    if last_subject != apple_root_subject:
        # Sinon, le dernier doit être SIGNÉ par Apple Root CA G3
        _verify_signature_with(apple_root.public_key(), last)

    # Maintenant on remonte la chaîne : chaque cert[i] doit être signé par cert[i+1]
    for i in range(len(certs) - 1):
        try:
            _verify_signature_with(certs[i + 1].public_key(), certs[i])
        except Exception as e:
            raise ValueError(f"Échec vérif signature cert[{i}] -> cert[{i+1}] : {e}")

    return certs[0]  # leaf


def _verify_signature_with(public_key, cert: x509.Certificate):
    """Vérifie que `cert` est bien signé avec la clé publique donnée."""
    if isinstance(public_key, ec.EllipticCurvePublicKey):
        public_key.verify(
            cert.signature,
            cert.tbs_certificate_bytes,
            ec.ECDSA(cert.signature_hash_algorithm),
        )
    elif isinstance(public_key, rsa.RSAPublicKey):
        public_key.verify(
            cert.signature,
            cert.tbs_certificate_bytes,
            crypto_padding.PKCS1v15(),
            cert.signature_hash_algorithm,
        )
    else:
        raise ValueError(f"Type de clé publique non supporté : {type(public_key)}")


def verify_signed_jws(jws_string: str,
                     expected_bundle_id: Optional[str] = None) -> dict:
    """Vérifie un JWS signé par Apple et renvoie son payload décodé.

    Args:
        jws_string: le JWS complet (3 segments séparés par des points)
        expected_bundle_id: si fourni, on vérifie aussi ``payload['bundleId']``

    Returns:
        dict du payload décodé.

    Raises:
        ValueError si la signature ou la chaîne de certs est invalide.
    """
    if not jws_string or jws_string.count('.') != 2:
        raise ValueError("Format JWS invalide")

    # 1) Extraire et vérifier la chaîne de certificats depuis le header
    header = _decode_jws_header(jws_string)
    x5c = header.get('x5c')
    if not x5c or not isinstance(x5c, list):
        raise ValueError("Header JWS sans chaîne x5c")

    leaf_cert = _verify_certificate_chain(x5c)

    # 2) Récupérer la clé publique du leaf et vérifier la signature du JWS
    public_key_pem = leaf_cert.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    # Apple utilise ES256 (ECDSA + P-256 + SHA-256)
    algorithm = header.get('alg', 'ES256')
    try:
        payload = jwt.decode(
            jws_string,
            public_key_pem,
            algorithms=[algorithm],
            options={"verify_signature": True, "verify_exp": False, "verify_aud": False},
        )
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Signature JWS invalide : {e}")

    # 3) Vérif bundle ID (anti-replay d'un JWS d'une autre app)
    bundle_id = expected_bundle_id or os.environ.get(
        'APPLE_IAP_BUNDLE_ID', DEFAULT_BUNDLE_ID)
    payload_bundle = payload.get('bundleId') or payload.get('appAppleId')
    if payload_bundle and payload.get('bundleId') and payload['bundleId'] != bundle_id:
        raise ValueError(
            f"Bundle ID inattendu : {payload['bundleId']} vs {bundle_id}")

    return payload


def _ms_to_datetime(ms: Optional[int]) -> Optional[datetime]:
    if ms is None:
        return None
    return datetime.utcfromtimestamp(ms / 1000.0)


def process_transaction_for_user(user, transaction_info: dict,
                                 raw_jws: Optional[str] = None) -> 'AppleSubscription':
    """Met à jour (ou crée) un AppleSubscription pour cet utilisateur à partir
    d'un payload de transaction Apple vérifié.

    transaction_info : dict issu de verify_signed_jws() pour une transaction
    individuelle. Format Apple :
      {
        "transactionId": "...",
        "originalTransactionId": "...",
        "bundleId": "...",
        "productId": "ch.teacherplanner.teacher.premium.monthly",
        "purchaseDate": <timestamp ms>,
        "expiresDate": <timestamp ms>,
        "environment": "Sandbox" | "Production",
        "revocationDate": <timestamp ms or absent>,
        ...
      }
    """
    from models.apple_subscription import AppleSubscription
    from extensions import db

    original_tx_id = (transaction_info.get('originalTransactionId') or
                      transaction_info.get('transactionId'))
    if not original_tx_id:
        raise ValueError("Transaction sans originalTransactionId")

    sub = AppleSubscription.query.filter_by(
        original_transaction_id=original_tx_id
    ).first()
    if sub is None:
        sub = AppleSubscription(
            user_id=user.id,
            original_transaction_id=str(original_tx_id),
        )
        db.session.add(sub)
    elif sub.user_id != user.id:
        # Cas particulier : une même transaction Apple ne peut pas changer
        # d'utilisateur ProfCalendar. On rejette pour ne pas leak un accès
        # Premium entre comptes.
        raise ValueError(
            f"originalTransactionId déjà associé à user {sub.user_id}")

    sub.latest_transaction_id = str(transaction_info.get('transactionId') or '')
    sub.product_id = str(transaction_info.get('productId') or '')
    sub.bundle_id = str(transaction_info.get('bundleId') or '')
    env = str(transaction_info.get('environment') or 'Production').lower()
    sub.environment = 'sandbox' if 'sandbox' in env else 'production'

    sub.purchase_date = _ms_to_datetime(transaction_info.get('purchaseDate'))
    sub.expires_date = _ms_to_datetime(transaction_info.get('expiresDate'))

    revocation_date = _ms_to_datetime(transaction_info.get('revocationDate'))
    if revocation_date:
        sub.status = 'revoked'
        sub.revoked_at = revocation_date
    elif sub.expires_date and sub.expires_date <= datetime.utcnow():
        sub.status = 'expired'
    else:
        sub.status = 'active'

    sub.in_trial_period = bool(transaction_info.get('inTrialPeriod', False))
    sub.in_intro_offer_period = bool(transaction_info.get('offerType')
                                     == 1)

    if raw_jws:
        sub.last_signed_payload = raw_jws[:8000]  # cap pour éviter blob géant

    # Mettre à jour l'accès Premium global de l'utilisateur si l'abonnement
    # est actif (la méthode has_premium_access() s'appuie aussi sur ces
    # données mais on synchronise les colonnes legacy pour cohérence).
    if sub.is_active():
        user.subscription_tier = 'premium'
        if sub.expires_date and (
                not user.premium_until or sub.expires_date > user.premium_until):
            user.premium_until = sub.expires_date

    db.session.commit()
    return sub


def find_latest_transaction_in_payload(payload: dict) -> Tuple[Optional[dict], Optional[str]]:
    """Étant donné un payload de notification App Store V2 décodé, extrait la
    transaction la plus récente et son JWS brut.

    Apple envoie une structure :
      {
        "notificationType": "DID_RENEW",
        "data": {
          "signedTransactionInfo": "<JWS de la transaction>",
          "signedRenewalInfo": "<JWS d'info de renouvellement>",
          ...
        },
        ...
      }
    """
    data = payload.get('data', {}) or {}
    signed_tx = data.get('signedTransactionInfo')
    if not signed_tx:
        return None, None
    try:
        tx_info = verify_signed_jws(signed_tx)
        return tx_info, signed_tx
    except Exception as e:
        logger.error(f"[apple_iap] Impossible de décoder signedTransactionInfo : {e}")
        return None, None
