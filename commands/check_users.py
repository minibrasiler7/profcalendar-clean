"""Commande Flask CLI pour inspecter le niveau d'engagement d'utilisateurs.

Usage côté Render shell :
    flask check-users <email1> <email2> ...

Sortie : pour chaque email donné, un résumé complet — vérification email,
setup complété, classes créées, horaire-type rempli, plannings saisis,
et un diagnostic automatique de l'endroit où l'utilisateur s'est arrêté
dans l'onboarding.

Conçu pour répondre à la question « mes nouveaux inscrits ont-ils
compris comment utiliser le site, ou se sont-ils arrêtés en route ? ».
"""

import click
from flask.cli import with_appcontext


@click.command('check-users')
@click.argument('emails', nargs=-1, required=True)
@with_appcontext
def check_users_command(emails):
    """Inspecte le niveau d'engagement de un ou plusieurs utilisateurs."""
    from models.user import User
    from models.classroom import Classroom
    from models.planning import Planning
    from models.student import Student

    for em in emails:
        u = User.query.filter_by(email=em).first()
        if not u:
            click.echo(f"\n❌ {em} → Aucun compte trouvé")
            continue

        click.echo(f"\n{'=' * 60}")
        click.echo(f"👤 {em}")
        click.echo(f"{'=' * 60}")
        click.echo(f"  Username        : {u.username}")
        click.echo(f"  Inscrit le      : {u.created_at}")
        click.echo(f"  Email vérifié   : {u.email_verified}")
        click.echo(f"  Tier            : {u.subscription_tier} "
                   f"(premium until {u.premium_until})")
        click.echo(f"  Setup complet   : {u.setup_completed}")
        click.echo(f"  Horaire complet : {u.schedule_completed}")
        click.echo(f"  Tutoriel vu     : {u.has_seen_tour}")
        click.echo(f"  Collège         : {u.college_name or '(vide)'}")
        click.echo(f"  Année scolaire  : {u.school_year_start} → {u.school_year_end}")
        click.echo(f"  Heures journée  : {u.day_start_time} → {u.day_end_time}")
        click.echo(f"  Période / pause : {u.period_duration} min / "
                   f"{u.break_duration} min")

        # Classes créées
        classrooms = u.classrooms.all() if hasattr(u.classrooms, 'all') else list(u.classrooms)
        click.echo(f"\n  📚 Classes créées : {len(classrooms)}")
        for c in classrooms:
            try:
                nb_students = Student.query.filter_by(classroom_id=c.id).count()
            except Exception:
                nb_students = 0
            click.echo(f"     • {c.name} ({c.subject}) — {nb_students} élève(s)")

        # Horaire-type (créneaux assignés)
        try:
            schedules = u.schedules.all() if hasattr(u.schedules, 'all') else list(u.schedules)
        except Exception:
            schedules = []
        click.echo(f"\n  🗓️  Horaire type : {len(schedules)} créneau(x)")

        # Plannings effectifs : un planning « rempli » a au moins un titre,
        # une description ou une classe assignée. Les autres = juste un
        # squelette laissé par le scheduler.
        plannings = Planning.query.filter_by(user_id=u.id).all()
        plannings_with_content = [
            p for p in plannings
            if (p.title or p.description or p.classroom_id)
        ]
        click.echo(f"\n  📝 Planifications saisies : "
                   f"{len(plannings_with_content)} (sur {len(plannings)} créneaux)")
        if plannings_with_content:
            latest = sorted(plannings_with_content,
                            key=lambda p: p.updated_at or p.date,
                            reverse=True)[:3]
            for p in latest:
                title = (p.title or '(sans titre)')[:40]
                cls = p.classroom.name if p.classroom else '?'
                click.echo(f"     • {p.date} P{p.period_number} | {cls} | {title}")

        # Diagnostic automatique de l'étape où le user s'est arrêté
        click.echo(f"\n  📊 Engagement :")
        if not u.email_verified:
            click.echo(f"     ⚠️  Compte créé mais email JAMAIS vérifié")
        elif not u.setup_completed:
            click.echo(f"     ⚠️  Email vérifié mais setup initial PAS complété")
        elif not classrooms:
            click.echo(f"     ⚠️  Setup fait mais AUCUNE classe créée")
        elif not u.schedule_completed:
            click.echo(f"     ⚠️  Classes créées mais horaire-type PAS complété")
        elif not plannings_with_content:
            click.echo(f"     ⚠️  Horaire OK mais AUCUN cours planifié")
        elif len(plannings_with_content) < 5:
            click.echo(f"     🟡 Premiers cours planifiés ({len(plannings_with_content)})")
        else:
            click.echo(f"     ✅ Utilisateur actif ({len(plannings_with_content)} planifications)")

    click.echo("\n" + "=" * 60)
    click.echo("Fin du rapport.")
    click.echo("=" * 60 + "\n")


def register_check_users_command(app):
    app.cli.add_command(check_users_command)
