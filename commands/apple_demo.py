"""Commande Flask CLI : crée/réactive les comptes de démonstration App Store.

Usage côté Render shell :
    flask create-apple-demo

Crée (ou réactive — idempotent) un compte ÉLÈVE et un compte PARENT déjà
**vérifiés et connectables**, rattachés à la classe identifiée par les codes
d'accès. Aucun email à recevoir : les comptes sont pré-vérifiés. À renseigner
ensuite dans App Store Connect → App Review Information.

Les valeurs par défaut correspondent aux infos fournies ; surchargeables via
options (`--email`, `--password`, `--student-code`, `--parent-code`).
"""

import click
from flask.cli import with_appcontext


@click.command('create-apple-demo')
@click.option('--email', default='testappleeleveparent@gmail.com',
              help='Email des comptes démo (élève + parent).')
@click.option('--password', default='AppleReview2026!',
              help='Mot de passe des comptes démo ProfCalendar (à fournir à Apple).')
@click.option('--student-code', default='UVQ56V',
              help="Code d'accès de classe (ClassroomAccessCode) identifiant la classe de l'élève.")
@click.option('--parent-code', default='XOKGFE',
              help='Code de classe (ClassCode) pour relier le parent à l\'enseignant.')
@with_appcontext
def create_apple_demo_command(email, password, student_code, parent_code):
    """Crée/réactive les comptes démo élève + parent pour la review Apple."""
    from extensions import db
    from werkzeug.security import generate_password_hash
    from utils.encryption import encryption_engine
    from models.user import User
    from models.classroom_access_code import ClassroomAccessCode
    from models.parent import Parent, ParentChild, ClassCode
    from models.student import Student
    from models.rpg import StudentRPGProfile

    email = email.strip().lower()
    student_code = student_code.strip().upper()
    parent_code = parent_code.strip().upper()

    # 1. Classe de l'élève via le code d'accès classe
    cac = ClassroomAccessCode.query.filter_by(code=student_code).first()
    if not cac:
        click.echo(f"❌ Code élève introuvable : {student_code}. Vérifiez le code dans l'app/le site.")
        return
    classroom = cac.classroom
    teacher = User.query.get(classroom.user_id)
    click.echo(f"✓ Classe élève : {classroom.name} ({classroom.subject}) — enseignant {teacher.email}")

    # 2. Enseignant du parent via le code de classe (sinon : même enseignant que l'élève)
    cc = ClassCode.query.filter_by(code=parent_code).first()
    if cc:
        parent_teacher_id = cc.user_id
        click.echo(f"✓ Code parent OK → enseignant id={parent_teacher_id}")
    else:
        parent_teacher_id = teacher.id
        click.echo(f"⚠️  Code parent introuvable ({parent_code}) — parent lié au même enseignant que l'élève.")

    email_h = encryption_engine.hash_email(email)

    # 3. Élève démo : créer ou réactiver, pré-vérifié + connectable
    student = Student.query.filter_by(email_hash=email_h, classroom_id=classroom.id).first()
    if not student:
        student = Student(classroom_id=classroom.id, user_id=teacher.id,
                          first_name='Démo', last_name='Apple', email=email)
        db.session.add(student)
        click.echo("  → nouvel élève démo créé")
    else:
        click.echo("  → élève démo existant réactivé")
    student.password_hash = generate_password_hash(password)
    student.email_verified = True
    student.is_authenticated = True
    db.session.commit()

    # 4. Profil RPG (onglet Missions) — best effort, ne bloque pas si échec
    try:
        if not StudentRPGProfile.query.filter_by(student_id=student.id).first():
            db.session.add(StudentRPGProfile(student_id=student.id, avatar_class='guerrier'))
            db.session.commit()
            click.echo("  → profil RPG créé")
    except Exception as e:
        db.session.rollback()
        click.echo(f"  (profil RPG ignoré : {e})")

    # 5. Parent démo : créer ou réactiver, pré-vérifié + lié à l'enseignant
    parent = Parent.query.filter_by(email_hash=email_h).first()
    if not parent:
        parent = Parent(email=email, first_name='Démo', last_name='Apple')
        db.session.add(parent)
        click.echo("  → nouveau parent démo créé")
    else:
        click.echo("  → parent démo existant réactivé")
    parent.set_password(password)
    parent.email_verified = True
    parent.teacher_id = parent_teacher_id
    parent.teacher_name = teacher.username
    parent.class_code = parent_code
    parent.is_verified = True
    db.session.commit()

    # 6. Lien parent → élève
    if not ParentChild.query.filter_by(parent_id=parent.id, student_id=student.id).first():
        db.session.add(ParentChild(parent_id=parent.id, student_id=student.id,
                                   relationship='parent', is_primary=True))
        db.session.commit()
        click.echo("  → lien parent-élève créé")

    # 7. Récapitulatif des identifiants
    click.echo("\n" + "=" * 56)
    click.echo("✅ COMPTES DÉMO PRÊTS — à coller dans App Store Connect")
    click.echo("=" * 56)
    click.echo(f"  ÉLÈVE   email        : {email}")
    click.echo(f"          mot de passe : {password}")
    click.echo(f"  PARENT  email        : {email}")
    click.echo(f"          mot de passe : {password}")
    click.echo(f"          nom enseignant : {teacher.username}")
    click.echo(f"          code de classe : {parent_code}")
    click.echo("=" * 56 + "\n")


def register_apple_demo_command(app):
    app.cli.add_command(create_apple_demo_command)
