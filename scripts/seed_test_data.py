"""
Script de seed pour créer des données de test.
Crée 5 enseignants avec 4 classes chacun, 10 élèves par classe,
et des collaborations entre enseignants.

Usage:
    flask seed-test-data

    Ou directement:
    python scripts/seed_test_data.py
"""
from datetime import date, time, datetime, timedelta
import random


# ─── Données fictives ───────────────────────────────────────────────

TEACHERS = [
    {'username': 'Marie Dupont',    'email': 'marie.dupont.test@profcalendar.dev',    'password': 'Test1234!'},
    {'username': 'Jean Martin',     'email': 'jean.martin.test@profcalendar.dev',     'password': 'Test1234!'},
    {'username': 'Sophie Bernard',  'email': 'sophie.bernard.test@profcalendar.dev',  'password': 'Test1234!'},
    {'username': 'Luc Favre',       'email': 'luc.favre.test@profcalendar.dev',       'password': 'Test1234!'},
    {'username': 'Anne Rochat',     'email': 'anne.rochat.test@profcalendar.dev',     'password': 'Test1234!'},
]

# 4 classes par enseignant : la première est la maîtrise de classe
CLASSES_PER_TEACHER = [
    [
        {'name': '9VG1', 'subject': 'Français',     'is_master': True},
        {'name': '10VG2', 'subject': 'Français',    'is_master': False},
        {'name': '11VG3', 'subject': 'Histoire',    'is_master': False},
        {'name': '9VG4', 'subject': 'Géographie',   'is_master': False},
    ],
    [
        {'name': '10VG1', 'subject': 'Mathématiques', 'is_master': True},
        {'name': '9VG2', 'subject': 'Mathématiques',  'is_master': False},
        {'name': '11VG1', 'subject': 'Sciences',      'is_master': False},
        {'name': '10VG3', 'subject': 'Physique',       'is_master': False},
    ],
    [
        {'name': '11VG2', 'subject': 'Allemand',  'is_master': True},
        {'name': '9VG3', 'subject': 'Allemand',   'is_master': False},
        {'name': '10VG4', 'subject': 'Anglais',   'is_master': False},
        {'name': '11VG4', 'subject': 'Anglais',   'is_master': False},
    ],
    [
        {'name': '9VP1', 'subject': 'Sciences',   'is_master': True},
        {'name': '10VP1', 'subject': 'Biologie',  'is_master': False},
        {'name': '11VP1', 'subject': 'Chimie',    'is_master': False},
        {'name': '9VP2', 'subject': 'Physique',   'is_master': False},
    ],
    [
        {'name': '10VP2', 'subject': 'Arts visuels',       'is_master': True},
        {'name': '11VP2', 'subject': 'Musique',            'is_master': False},
        {'name': '9VP3', 'subject': 'Éducation physique',  'is_master': False},
        {'name': '10VP3', 'subject': 'ACT',                'is_master': False},
    ],
]

# Prénoms et noms suisses romands
FIRST_NAMES = [
    'Emma', 'Léa', 'Chloé', 'Lina', 'Alice', 'Mia', 'Zoé', 'Louise', 'Camille', 'Jade',
    'Noah', 'Liam', 'Lucas', 'Ethan', 'Nathan', 'Louis', 'Hugo', 'Gabriel', 'Arthur', 'Jules',
    'Margaux', 'Inès', 'Sarah', 'Manon', 'Eva', 'Mathilde', 'Clara', 'Anna', 'Juliette', 'Éloïse',
    'Théo', 'Raphaël', 'Léon', 'Adam', 'Tom', 'Maxime', 'Antoine', 'Samuel', 'Noé', 'Oscar',
    'Élise', 'Nora', 'Lola', 'Nina', 'Agathe', 'Romane', 'Aurore', 'Célia', 'Lucie', 'Maëlle',
]
LAST_NAMES = [
    'Müller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Huber', 'Schneider', 'Meyer', 'Steiner', 'Fischer',
    'Gerber', 'Brunner', 'Baumann', 'Frei', 'Zimmermann', 'Moser', 'Widmer', 'Wyss', 'Graf', 'Roth',
    'Bianchi', 'Rossi', 'Ferrari', 'Colombo', 'Fontana', 'Ricci', 'Moretti', 'Conti', 'Esposito', 'Romano',
    'Bonvin', 'Carron', 'Cretton', 'Dorsaz', 'Fellay', 'Fournier', 'Luyet', 'Pralong', 'Rausis', 'Vouillamoz',
    'Blanc', 'Chevalley', 'Dufour', 'Jacot', 'Monnet', 'Pache', 'Reymond', 'Rochat', 'Tinguely', 'Vuille',
]

# Collaborations : (index enseignant spécialisé, index maître de classe, sujet)
# Chaque enseignant est lié à un autre qui a une maîtrise de classe
COLLABORATIONS = [
    # Marie (0) se lie à Jean (1) qui est maître de 10VG1
    (0, 1, 'Français'),
    # Jean (1) se lie à Marie (0) qui est maîtresse de 9VG1
    (1, 0, 'Mathématiques'),
    # Sophie (2) se lie à Luc (3) qui est maître de 9VP1
    (2, 3, 'Allemand'),
    # Luc (3) se lie à Sophie (2) qui est maîtresse de 11VG2
    (3, 2, 'Sciences'),
    # Anne (4) se lie à Marie (0) qui est maîtresse de 9VG1
    (4, 0, 'Arts visuels'),
]


def _generate_student_email(first, last, idx):
    """Génère un email fictif pour un élève."""
    clean_first = first.lower().replace('é', 'e').replace('ë', 'e').replace('ï', 'i').replace('ô', 'o').replace('è', 'e').replace('ê', 'e').replace('à', 'a').replace('ù', 'u').replace('û', 'u').replace('î', 'i').replace('ç', 'c')
    clean_last = last.lower().replace('ü', 'u').replace('ö', 'o').replace('ä', 'a')
    return f'{clean_first}.{clean_last}{idx}@eleve.profcalendar.dev'


def _generate_parent_email(last, idx, parent_type='mother'):
    """Génère un email fictif pour un parent."""
    clean_last = last.lower().replace('ü', 'u').replace('ö', 'o').replace('ä', 'a')
    return f'{parent_type}.{clean_last}{idx}@parent.profcalendar.dev'


def seed_test_data():
    """Crée les données de test dans la base de données."""
    from extensions import db
    from models.user import User
    from models.classroom import Classroom
    from models.student import Student
    from models.schedule import Schedule
    from models.class_collaboration import (
        ClassMaster, TeacherAccessCode, TeacherCollaboration, SharedClassroom, StudentClassroomLink
    )

    print('🌱 Début du seed des données de test...')
    print('=' * 60)

    # Vérifier si les données existent déjà
    existing = User.query.filter(User.email.like('%@profcalendar.dev')).first()
    if existing:
        print('⚠️  Des données de test existent déjà (emails @profcalendar.dev)')
        print('   Suppression des anciennes données...')
        _cleanup_test_data()

    # ─── 1. Créer les enseignants ───
    users = []
    for t in TEACHERS:
        user = User(
            username=t['username'],
            email=t['email'],
            email_verified=True,
            school_year_start=date(2025, 8, 18),
            school_year_end=date(2026, 6, 26),
            day_start_time=time(8, 0),
            day_end_time=time(16, 0),
            period_duration=45,
            break_duration=5,
            setup_completed=True,
            schedule_completed=True,
        )
        user.set_password(t['password'])
        db.session.add(user)
        users.append(user)
        print(f'  👤 Enseignant: {t["username"]} ({t["email"]})')

    db.session.flush()  # Obtenir les IDs

    # ─── 2. Créer les classes et les élèves ───
    all_classrooms = []  # all_classrooms[teacher_idx][class_idx]
    student_counter = 0

    for teacher_idx, user in enumerate(users):
        teacher_classrooms = []
        classes = CLASSES_PER_TEACHER[teacher_idx]

        for class_info in classes:
            classroom = Classroom(
                name=class_info['name'],
                subject=class_info['subject'],
                user_id=user.id,
            )
            db.session.add(classroom)
            db.session.flush()
            teacher_classrooms.append(classroom)

            # Créer la maîtrise de classe
            if class_info['is_master']:
                school_year = '2025-2026'
                cm = ClassMaster(
                    classroom_id=classroom.id,
                    master_teacher_id=user.id,
                    school_year=school_year,
                )
                db.session.add(cm)

            # Créer 10 élèves
            for s_idx in range(10):
                fn = FIRST_NAMES[(student_counter + s_idx) % len(FIRST_NAMES)]
                ln = LAST_NAMES[(student_counter + s_idx) % len(LAST_NAMES)]
                student = Student(
                    first_name=fn,
                    last_name=ln,
                    email=_generate_student_email(fn, ln, student_counter + s_idx),
                    classroom_id=classroom.id,
                    user_id=user.id,
                    parent_email_mother=_generate_parent_email(ln, student_counter + s_idx, 'mere'),
                    parent_email_father=_generate_parent_email(ln, student_counter + s_idx, 'pere'),
                )
                db.session.add(student)

            student_counter += 10
            print(f'  📚 Classe: {class_info["name"]} ({class_info["subject"]}) '
                  f'pour {user.username} — 10 élèves'
                  f'{" ★ Maîtrise" if class_info["is_master"] else ""}')

        all_classrooms.append(teacher_classrooms)

    db.session.flush()

    # ─── 3. Créer les codes d'accès par défaut ───
    access_codes = {}
    for user in users:
        code = TeacherAccessCode(
            master_teacher_id=user.id,
            code=TeacherAccessCode.generate_code(6),
            max_uses=None,
            expires_at=None,
        )
        db.session.add(code)
        access_codes[user.id] = code

    db.session.flush()

    # ─── 4. Créer les collaborations ───
    print()
    print('🔗 Collaborations:')
    for spec_idx, master_idx, subject in COLLABORATIONS:
        spec_teacher = users[spec_idx]
        master_teacher = users[master_idx]

        # Trouver la classe de maîtrise du maître
        master_classroom = all_classrooms[master_idx][0]  # La première est toujours la maîtrise

        # Créer la collaboration
        collab = TeacherCollaboration(
            specialized_teacher_id=spec_teacher.id,
            master_teacher_id=master_teacher.id,
            access_code_id=access_codes[master_teacher.id].id,
            is_active=True,
        )
        db.session.add(collab)
        db.session.flush()

        # Créer la classe dérivée pour l'enseignant spécialisé
        derived_classroom = Classroom(
            name=f'{master_classroom.name}',
            subject=subject,
            user_id=spec_teacher.id,
        )
        db.session.add(derived_classroom)
        db.session.flush()

        # Lien SharedClassroom
        shared = SharedClassroom(
            collaboration_id=collab.id,
            original_classroom_id=master_classroom.id,
            derived_classroom_id=derived_classroom.id,
            subject=subject,
        )
        db.session.add(shared)

        # Copier les élèves via StudentClassroomLink
        master_students = Student.query.filter_by(
            classroom_id=master_classroom.id, user_id=master_teacher.id
        ).all()
        for student in master_students:
            link = StudentClassroomLink(
                student_id=student.id,
                classroom_id=derived_classroom.id,
                subject=subject,
                is_primary=False,
                added_by_teacher_id=spec_teacher.id,
            )
            db.session.add(link)

        print(f'  {spec_teacher.username} → {master_teacher.username} '
              f'({master_classroom.name} / {subject})')

    # ─── 5. Commit ───
    db.session.commit()

    print()
    print('=' * 60)
    print('✅ Seed terminé avec succès!')
    print()
    print('📋 Résumé:')
    print(f'   • {len(users)} enseignants créés')
    print(f'   • {len(users) * 4} classes créées + {len(COLLABORATIONS)} classes dérivées')
    print(f'   • {student_counter} élèves créés')
    print(f'   • {len(COLLABORATIONS)} collaborations établies')
    print()
    print('🔑 Identifiants (mot de passe: Test1234! pour tous):')
    for t in TEACHERS:
        print(f'   {t["email"]}')


def _cleanup_test_data():
    """Supprime les données de test existantes."""
    from extensions import db
    from models.user import User
    from models.classroom import Classroom
    from models.student import Student
    from models.class_collaboration import (
        ClassMaster, TeacherAccessCode, TeacherCollaboration, SharedClassroom, StudentClassroomLink
    )
    from services.year_end_cleanup import _delete_classroom_dependencies, _delete_student_dependencies

    test_users = User.query.filter(User.email.like('%@profcalendar.dev')).all()
    test_user_ids = [u.id for u in test_users]

    if not test_user_ids:
        return

    # Supprimer les collaborations
    TeacherCollaboration.query.filter(
        (TeacherCollaboration.specialized_teacher_id.in_(test_user_ids)) |
        (TeacherCollaboration.master_teacher_id.in_(test_user_ids))
    ).delete(synchronize_session='fetch')

    SharedClassroom.query.filter(
        SharedClassroom.collaboration_id.in_(
            db.session.query(TeacherCollaboration.id).filter(
                (TeacherCollaboration.specialized_teacher_id.in_(test_user_ids)) |
                (TeacherCollaboration.master_teacher_id.in_(test_user_ids))
            )
        )
    ).delete(synchronize_session='fetch')

    # Supprimer les classes et leurs dépendances
    classrooms = Classroom.query.filter(Classroom.user_id.in_(test_user_ids)).all()
    for c in classrooms:
        try:
            _delete_classroom_dependencies(c.id)
            db.session.delete(c)
        except Exception:
            pass

    # Supprimer les codes d'accès
    TeacherAccessCode.query.filter(
        TeacherAccessCode.master_teacher_id.in_(test_user_ids)
    ).delete(synchronize_session='fetch')

    # Supprimer les ClassMaster restants
    ClassMaster.query.filter(
        ClassMaster.master_teacher_id.in_(test_user_ids)
    ).delete(synchronize_session='fetch')

    # Supprimer les utilisateurs
    for u in test_users:
        db.session.delete(u)

    db.session.commit()
    print('   ✅ Anciennes données de test supprimées')


# ─── Flask CLI command registration ──────────────────────────────

def register_seed_command(app):
    """Enregistre la commande flask seed-test-data."""
    import click

    @app.cli.command('seed-test-data')
    def seed_command():
        """Crée des données de test (5 enseignants, classes, élèves, collaborations)."""
        seed_test_data()

    @app.cli.command('clean-test-data')
    def clean_command():
        """Supprime les données de test (@profcalendar.dev)."""
        _cleanup_test_data()
        print('✅ Données de test supprimées')
