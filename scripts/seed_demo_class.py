"""Compte de démonstration prêt à tester les devoirs (et le reste).

Crée, s'ils n'existent pas déjà :
  - 1 enseignant vérifié (avec horaire lundi→vendredi P1, donc un cours à ouvrir)
  - 1 classe (9DEMO)
  - 5 élèves avec comptes VÉRIFIÉS et activés, liés à l'enseignant
  - 5 parents avec comptes VÉRIFIÉS, chacun lié à son enfant

Mot de passe commun : profcalendar2026!

Usage (shell Render, environnement de prod = bonne DATABASE_URL + ENCRYPTION_KEY) :
    flask seed-demo-class

Idempotent : si l'enseignant de démo existe déjà, la commande ne recrée rien
et réaffiche simplement les identifiants.
"""
from datetime import date, time

PASSWORD = "profcalendar2026!"
DOMAIN = "profcalendar-demo.ch"
TEACHER_EMAIL = f"prof@{DOMAIN}"

# (prénom, nom) des 5 élèves
STUDENTS = [
    ("Emma", "Rossi"),
    ("Noah", "Meier"),
    ("Léa", "Favre"),
    ("Lucas", "Bianchi"),
    ("Chloé", "Müller"),
]


def _print_credentials():
    print("=" * 60)
    print(f"  Mot de passe (tout le monde) : {PASSWORD}")
    print(f"  Enseignant  : {TEACHER_EMAIL}")
    for i, (fn, ln) in enumerate(STUDENTS, start=1):
        print(f"  Élève {i}     : eleve{i}@{DOMAIN}   ({fn} {ln})")
    for i in range(1, len(STUDENTS) + 1):
        print(f"  Parent {i}    : parent{i}@{DOMAIN}")
    print("=" * 60)


def seed_demo_class():
    from extensions import db
    from werkzeug.security import generate_password_hash
    from models.user import User
    from models.classroom import Classroom
    from models.student import Student
    from models.schedule import Schedule
    from models.parent import Parent, ParentChild

    if User.query.filter_by(email=TEACHER_EMAIL).first():
        print("⚠️  Le compte de démo existe déjà — rien à recréer.")
        _print_credentials()
        return

    # ── Enseignant ────────────────────────────────────────────────
    teacher = User(
        username="Démo Enseignant",
        email=TEACHER_EMAIL,
        email_verified=True,
        # Année scolaire volontairement large pour qu'il y ait toujours un
        # cours à afficher quelle que soit la date du test.
        school_year_start=date(2025, 8, 1),
        school_year_end=date(2027, 7, 31),
        day_start_time=time(8, 0),
        day_end_time=time(16, 0),
        period_duration=45,
        break_duration=5,
        setup_completed=True,
        schedule_completed=True,
    )
    teacher.set_password(PASSWORD)
    db.session.add(teacher)
    db.session.flush()

    # ── Classe ────────────────────────────────────────────────────
    classroom = Classroom(
        name="9DEMO", subject="Mathématiques", class_group="9DEMO",
        color="#4F46E5", user_id=teacher.id, is_class_master=True,
    )
    db.session.add(classroom)
    db.session.flush()

    # ── Horaire : période 1, du lundi au vendredi ─────────────────
    for wd in range(5):
        db.session.add(Schedule(
            user_id=teacher.id, classroom_id=classroom.id,
            weekday=wd, period_number=1,
            start_time=time(8, 0), end_time=time(8, 45),
        ))

    # ── Élèves (comptes vérifiés + activés) + parents ─────────────
    pw_hash = generate_password_hash(PASSWORD)
    for i, (fn, ln) in enumerate(STUDENTS, start=1):
        parent_email = f"parent{i}@{DOMAIN}"
        student = Student(
            classroom_id=classroom.id, user_id=teacher.id,
            first_name=fn, last_name=ln,
            email=f"eleve{i}@{DOMAIN}",
            email_verified=True,
            is_authenticated=True,       # sinon le login force une vérif. par code
            password_hash=pw_hash,
            parent_email_mother=parent_email,
        )
        db.session.add(student)
        db.session.flush()

        parent = Parent(
            email=parent_email,
            first_name="Parent", last_name=ln,
            email_verified=True,
            is_verified=True,
            teacher_id=teacher.id,
        )
        parent.set_password(PASSWORD)
        db.session.add(parent)
        db.session.flush()
        db.session.add(ParentChild(parent_id=parent.id, student_id=student.id))

    db.session.commit()
    print("✅ Compte de démonstration créé avec succès.")
    _print_credentials()


def register_demo_class_command(app):
    """Enregistre la commande `flask seed-demo-class`."""
    @app.cli.command('seed-demo-class')
    def _seed_demo_class_cmd():
        """Crée un compte de démo (prof + 5 élèves + 5 parents, tous vérifiés)."""
        seed_demo_class()
