"""Commande Flask CLI : entonnoir d'activation et de monétisation.

Usage (shell Render de PROD, pour interroger la vraie base) :
    flask funnel-stats
    flask funnel-stats --show-users           # liste détaillée par utilisateur
    flask funnel-stats --include-test          # n'exclut pas les comptes de test
    flask funnel-stats --days 30               # fenêtre pour les inscriptions récentes

Pourquoi : le site a des inscrits mais peu/pas d'activation (personne ne crée
de classe, personne ne s'abonne). Cette commande mesure OÙ les gens décrochent
dans le parcours, pour savoir quoi corriger en priorité au lieu de deviner.

Le parcours mesuré (chaque étape = nombre d'enseignants distincts qui l'ont
atteinte) :

    Inscrit → Email vérifié → Setup de base → Horaire configuré
            → 1+ classe → 1+ élève → 1+ leçon planifiée → Premium actif

Un gros décrochage entre deux étapes = c'est LÀ qu'il faut agir.
"""

import click
from flask.cli import with_appcontext
from datetime import datetime, timedelta


# Emails considérés comme comptes de test / démo / propriétaire — exclus par
# défaut pour que les chiffres reflètent les VRAIS utilisateurs.
TEST_EMAILS = {
    'testappleprofcalendar@proton.me',
    'loicstrauch@proton.me',
}
# Tout email contenant l'un de ces fragments est aussi traité comme test.
TEST_FRAGMENTS = ('test', 'demo', 'example.com', '+test')


def _is_test_user(user) -> bool:
    if getattr(user, 'is_admin', False):
        return True
    email = (user.email or '').lower()
    if email in TEST_EMAILS:
        return True
    return any(frag in email for frag in TEST_FRAGMENTS)


@click.command('funnel-stats')
@click.option('--show-users', is_flag=True, default=False,
              help="Affiche la ligne détaillée de chaque utilisateur.")
@click.option('--include-test', is_flag=True, default=False,
              help="N'exclut pas les comptes de test/démo/admin.")
@click.option('--days', default=30, type=int,
              help="Fenêtre (jours) pour le compteur d'inscriptions récentes.")
@with_appcontext
def funnel_stats_command(show_users, include_test, days):
    """Affiche l'entonnoir d'activation + monétisation depuis la base."""
    from extensions import db
    from models.user import User
    from models.classroom import Classroom
    from models.student import Student
    from models.planning import Planning
    from models.apple_subscription import AppleSubscription

    now = datetime.utcnow()
    since = now - timedelta(days=days)

    # --- Charger les utilisateurs ---
    all_users = User.query.order_by(User.created_at.asc()).all()
    if include_test:
        users = all_users
        excluded = 0
    else:
        users = [u for u in all_users if not _is_test_user(u)]
        excluded = len(all_users) - len(users)

    user_ids = {u.id for u in users}
    total = len(users)

    if total == 0:
        click.echo("Aucun utilisateur (réel) en base.")
        return

    # --- Ensembles d'IDs ayant franchi chaque étape "données" ---
    # (on filtre sur user_ids pour rester cohérent avec l'exclusion des tests)
    def _distinct_user_ids(model):
        rows = db.session.query(model.user_id).distinct().all()
        return {r[0] for r in rows if r[0] in user_ids}

    ids_with_classroom = _distinct_user_ids(Classroom)
    ids_with_student = _distinct_user_ids(Student)
    ids_with_lesson = _distinct_user_ids(Planning)
    ids_with_apple = _distinct_user_ids(AppleSubscription)

    # --- Compteurs d'étapes (sur les flags User) ---
    n_verified = sum(1 for u in users if u.email_verified)
    n_setup = sum(1 for u in users if getattr(u, 'setup_completed', False))
    n_schedule = sum(1 for u in users if getattr(u, 'schedule_completed', False))
    n_classroom = len(ids_with_classroom)
    n_student = len(ids_with_student)
    n_lesson = len(ids_with_lesson)
    n_premium = sum(1 for u in users if u.is_premium())
    n_stripe = sum(1 for u in users if getattr(u, 'stripe_subscription_id', None))
    n_apple = len(ids_with_apple)

    # --- Inscriptions récentes ---
    def _signed_after(dt):
        return sum(1 for u in users if u.created_at and u.created_at >= dt)
    n_7d = _signed_after(now - timedelta(days=7))
    n_30d = _signed_after(now - timedelta(days=30))
    n_90d = _signed_after(now - timedelta(days=90))
    n_window = _signed_after(since)

    # --- Affichage ---
    bar_w = 28

    def _line(label, n):
        pct = (n / total * 100) if total else 0
        filled = int(round(pct / 100 * bar_w))
        bar = '█' * filled + '·' * (bar_w - filled)
        return f"  {label:<24} {bar} {n:>4}  ({pct:5.1f}%)"

    click.echo("")
    click.echo("=" * 60)
    click.echo("  ENTONNOIR D'ACTIVATION — ProfCalendar (enseignants)")
    click.echo("=" * 60)
    if not include_test:
        click.echo(f"  (exclus : {excluded} compte(s) test/démo/admin)")
    click.echo("")
    click.echo(_line("Inscrits", total))
    click.echo(_line("Email vérifié", n_verified))
    click.echo(_line("Setup de base fait", n_setup))
    click.echo(_line("Horaire configuré", n_schedule))
    click.echo(_line("1+ classe créée", n_classroom))
    click.echo(_line("1+ élève ajouté", n_student))
    click.echo(_line("1+ leçon planifiée", n_lesson))
    click.echo(_line("Premium actif", n_premium))
    click.echo("")

    # --- Décrochages (drop-off entre étapes consécutives) ---
    steps = [
        ("Inscrits", total),
        ("Email vérifié", n_verified),
        ("Setup de base", n_setup),
        ("Horaire", n_schedule),
        ("1+ classe", n_classroom),
        ("1+ élève", n_student),
        ("1+ leçon", n_lesson),
    ]
    click.echo("  DÉCROCHAGES (où on perd le plus de monde) :")
    worst = None
    for (la, na), (lb, nb) in zip(steps, steps[1:]):
        lost = na - nb
        rate = (lost / na * 100) if na else 0
        flag = ""
        if na > 0 and (worst is None or lost > worst[2]):
            worst = (la, lb, lost, rate)
        click.echo(f"    {la:>14} → {lb:<14} : -{lost} ({rate:4.0f}% perdus)")
    if worst:
        click.echo(f"  ➜ Plus gros décrochage : {worst[0]} → {worst[1]} "
                   f"(-{worst[2]}, {worst[3]:.0f}%)")
    click.echo("")

    # --- Inscriptions dans le temps ---
    click.echo("  INSCRIPTIONS :")
    click.echo(f"    7 derniers jours  : {n_7d}")
    click.echo(f"    30 derniers jours : {n_30d}")
    click.echo(f"    90 derniers jours : {n_90d}")
    first = min((u.created_at for u in users if u.created_at), default=None)
    last = max((u.created_at for u in users if u.created_at), default=None)
    if first and last:
        click.echo(f"    1er inscrit  : {first.date()}")
        click.echo(f"    dernier      : {last.date()}")
    click.echo("")

    # --- Monétisation ---
    click.echo("  MONÉTISATION :")
    click.echo(f"    Premium actif (toutes sources) : {n_premium}")
    click.echo(f"    Abonnement Stripe (web)        : {n_stripe}")
    click.echo(f"    Abonnement Apple (StoreKit)    : {n_apple}")
    click.echo("")

    # --- Détail par utilisateur ---
    if show_users:
        click.echo("  DÉTAIL PAR UTILISATEUR (du plus ancien au plus récent) :")
        click.echo(f"    {'email':<34} {'inscrit':<11} {'vérif':<5} "
                   f"{'setup':<5} {'horaire':<7} {'cls':<4} {'élv':<4} "
                   f"{'leç':<4} {'prem':<5}")
        # Pré-calcul des comptes par user pour éviter N requêtes lourdes
        def _counts(model):
            rows = db.session.query(model.user_id, db.func.count(model.id)) \
                .group_by(model.user_id).all()
            return {uid: c for uid, c in rows}
        cls_counts = _counts(Classroom)
        std_counts = _counts(Student)
        les_counts = _counts(Planning)
        for u in users:
            d = u.created_at.date().isoformat() if u.created_at else '—'
            click.echo(
                f"    {(u.email or '')[:34]:<34} {d:<11} "
                f"{'oui' if u.email_verified else '—':<5} "
                f"{'oui' if getattr(u,'setup_completed',False) else '—':<5} "
                f"{'oui' if getattr(u,'schedule_completed',False) else '—':<7} "
                f"{cls_counts.get(u.id,0):<4} {std_counts.get(u.id,0):<4} "
                f"{les_counts.get(u.id,0):<4} "
                f"{'oui' if u.is_premium() else '—':<5}"
            )
        click.echo("")

    click.echo("=" * 60)
    click.echo("  Astuce : relance régulièrement pour suivre tes progrès.")
    click.echo("  Détail complet : flask funnel-stats --show-users")
    click.echo("=" * 60)


def register_funnel_stats_command(app):
    app.cli.add_command(funnel_stats_command)
