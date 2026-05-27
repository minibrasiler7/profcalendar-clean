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
    """Place un compte dans l'état "Premium expiré" pour tester la review Apple."""
    from extensions import db
    from models.user import User

    user = User.query.filter_by(email=email).first()
    if not user:
        click.echo(f"❌ Aucun compte avec l'email {email}")
        raise SystemExit(1)

    expired_at = datetime.utcnow() - timedelta(days=days_ago)
    user.subscription_tier = 'premium'
    user.premium_until = expired_at
    db.session.commit()

    click.echo(f"✅ {email} :")
    click.echo(f"   subscription_tier = premium")
    click.echo(f"   premium_until     = {expired_at.isoformat()} (expiré il y a {days_ago} j)")
    click.echo(f"   is_premium()       = {user.is_premium()}  (False attendu)")
    click.echo("")
    click.echo("À utiliser comme démo Apple App Review :")
    click.echo("  L'utilisateur voit le paywall au login. Apple peut alors")
    click.echo("  tester le rachat via StoreKit Sandbox.")


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
