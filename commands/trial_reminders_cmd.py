"""Commande CLI : envoyer les relances d'essai Premium dues.

Usage (shell Render de PROD) :
    flask send-trial-reminders

Utile pour tester manuellement / forcer un envoi. Le déclenchement
automatique (toutes les 6 h) est géré par un greenthread dans
render_production.py qui appelle la même fonction.
"""

import click
from flask.cli import with_appcontext


@click.command('send-trial-reminders')
@with_appcontext
def send_trial_reminders_command():
    """Envoie les emails de relance d'essai dus (idempotent)."""
    from services.trial_reminders import send_due_trial_reminders

    result = send_due_trial_reminders()
    s = result['sent']
    click.echo("✅ Relances d'essai traitées :")
    click.echo(f"   candidats examinés : {result['candidates']}")
    click.echo(f"   J-5 envoyés        : {s['j5']}")
    click.echo(f"   J-1 envoyés        : {s['j1']}")
    click.echo(f"   expiration envoyés : {s['expired']}")
    click.echo(f"   échecs d'envoi     : {result['failed']}")
    total = s['j5'] + s['j1'] + s['expired']
    if total == 0:
        click.echo("   (aucune relance due pour le moment)")


def register_trial_reminders_command(app):
    app.cli.add_command(send_trial_reminders_command)
