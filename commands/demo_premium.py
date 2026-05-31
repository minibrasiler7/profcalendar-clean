"""Commande Flask CLI pour préparer un compte démo avec abonnement Premium expiré.

Usage côté Render shell :
    flask demo-expire-premium <email>
    flask demo-grant-premium <email> [--days N]

Pourquoi : Apple App Review nous demande explicitement un compte démo
dont l'abonnement Premium est EXPIRÉ pour qu'ils puissent tester le flux
complet d'achat (paywall qui réapparaît post-expiration, restauration,
renouvellement via StoreKit Sandbox).

Le compte démo (testappleprofcalendar@proton.me) qu'on a donné à Apple
est freemium par défaut — Apple ne peut donc pas voir le scénario
post-expiration. Cette commande place le compte dans l'état
"j'ai eu Premium, il s'est terminé hier" :
  - subscription_tier = 'premium'
  - premium_until = hier (ou date custom)

Après ça, `is_premium()` renvoie False (parce que premium_until < now),
donc le paywall réapparaît exactement comme pour un vrai utilisateur
dont l'abonnement vient d'expirer.
"""

import click
from flask.cli import with_appcontext
from datetime import datetime, timedelta


@click.command('demo-expire-premium')
@click.argument('email')
@click.option('--days-ago', default=1, type=int,
              help="Combien de jours dans le passé placer la date d'expiration (défaut: 1).")
@with_appcontext
def demo_expire_premium_command(email, days_ago):
    """Place un compte dans l'état "Premium expiré" pour tester la review Apple.

    IMPORTANT — pourquoi on SUPPRIME (et non "expire") les AppleSubscription :

    Lors d'une review précédente, marquer la sub StoreKit status='expired'
    ne suffisait PAS : Apple Sandbox renouvelle automatiquement un abonnement
    toutes les ~30 min et POSTe une notification DID_RENEW sur notre webhook
    /api/iap/notifications. Ce webhook retrouve la sub par
    original_transaction_id, la repasse en 'active' et remet
    user.premium_until dans le futur → le compte redevient Premium quelques
    minutes plus tard, et Apple revoit "déjà Premium actif" au lieu du paywall.

    En SUPPRIMANT la ligne AppleSubscription, le webhook ne trouve plus la
    sub (routes/iap.py : `if not sub: return OK`) et ne peut donc PAS la
    ressusciter. C'est durable tant qu'aucune NOUVELLE transaction n'est
    poussée par l'app — ce qui n'arrive que si le reviewer achète réellement
    (cas désiré : le paywall a marché, le premium se débloque).

    Sources d'accès Premium neutralisées :
      1. subscription_tier='premium' + premium_until passé (Stripe/voucher)
      2. table apple_subscriptions : lignes SUPPRIMÉES (StoreKit)
      3. (Subscription Stripe non touchée — les testeurs Apple n'y ont pas accès)

    Après ça, is_premium() renvoie False de façon durable.
    """
    from extensions import db
    from models.user import User
    from models.apple_subscription import AppleSubscription

    user = User.query.filter_by(email=email).first()
    if not user:
        click.echo(f"❌ Aucun compte avec l'email {email}")
        raise SystemExit(1)

    expired_at = datetime.utcnow() - timedelta(days=days_ago)

    # 1. Source Stripe/voucher → expirée hier (sémantique "abonnement expiré")
    user.subscription_tier = 'premium'
    user.premium_until = expired_at
    user.stripe_subscription_id = None  # évite la branche "Stripe en parallèle"

    # 2. Source Apple StoreKit → SUPPRESSION complète (cf. docstring).
    # On loggue les original_transaction_id supprimés pour audit.
    apple_subs = AppleSubscription.query.filter_by(user_id=user.id).all()
    deleted_tx_ids = [s.original_transaction_id for s in apple_subs]
    for sub in apple_subs:
        db.session.delete(sub)

    db.session.commit()

    # Re-vérifier dans une session fraîche pour être sûr.
    db.session.refresh(user)
    still_premium = user.is_premium()

    click.echo(f"✅ {email} :")
    click.echo(f"   subscription_tier = premium")
    click.echo(f"   premium_until     = {expired_at.isoformat()} (expiré il y a {days_ago} j)")
    click.echo(f"   stripe_subscription_id = None")
    click.echo(f"   AppleSubscriptions SUPPRIMÉES : {len(apple_subs)}")
    if deleted_tx_ids:
        click.echo(f"      original_transaction_ids : {deleted_tx_ids}")
    click.echo(f"   is_premium()       = {still_premium}  (False attendu)")
    click.echo("")
    if still_premium:
        click.echo("⚠️  is_premium() renvoie ENCORE True — source non couverte.")
        click.echo("    Vérifier manuellement (Subscription Stripe ? flag admin ?).")
    else:
        click.echo("À utiliser comme démo Apple App Review :")
        click.echo("  Le reviewer voit le paywall au login. L'achat Sandbox")
        click.echo("  recrée alors une AppleSubscription et débloque le Premium.")
        click.echo("  Le webhook DID_RENEW ne peut plus ressusciter l'ancien")
        click.echo("  abonnement (ligne supprimée → webhook bail).")


@click.command('demo-grant-premium')
@click.argument('email')
@click.option('--days', default=None, type=int,
              help="Durée en jours (omettre = illimité).")
@with_appcontext
def demo_grant_premium_command(email, days):
    """Octroie Premium à un compte (utile pour annuler l'expiration de test)."""
    from extensions import db
    from models.user import User

    user = User.query.filter_by(email=email).first()
    if not user:
        click.echo(f"❌ Aucun compte avec l'email {email}")
        raise SystemExit(1)

    if days is None:
        user.subscription_tier = 'premium'
        user.premium_until = None
        db.session.commit()
        click.echo(f"✅ {email} → Premium illimité (premium_until=None)")
    else:
        ends_at = datetime.utcnow() + timedelta(days=days)
        user.subscription_tier = 'premium'
        user.premium_until = ends_at
        db.session.commit()
        click.echo(f"✅ {email} → Premium jusqu'au {ends_at.isoformat()} ({days} j)")

    click.echo(f"   is_premium() = {user.is_premium()}")


def register_demo_premium_commands(app):
    app.cli.add_command(demo_expire_premium_command)
    app.cli.add_command(demo_grant_premium_command)
