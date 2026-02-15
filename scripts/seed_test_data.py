"""
Script de seed pour créer des données de test.
Crée 5 enseignants avec 4 classes chacun, 10 élèves par classe,
des collaborations, des évaluations, des remarques, des sanctions et des aménagements.

Usage:
    flask seed-test-data

    Ou directement:
    python scripts/seed_test_data.py
"""
from datetime import date, time, datetime, timedelta
import random

random.seed(42)  # Reproductible

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
COLLABORATIONS = [
    (0, 1, 'Français'),
    (1, 0, 'Mathématiques'),
    (2, 3, 'Allemand'),
    (3, 2, 'Sciences'),
    (4, 0, 'Arts visuels'),
]

# Noms d'évaluations par matière
EVAL_NAMES = {
    'Français':       ['Dictée n°1', 'Rédaction', 'Compréhension de texte', 'Grammaire', 'Conjugaison'],
    'Mathématiques':  ['Test fractions', 'Géométrie', 'Algèbre', 'Problèmes', 'Calcul mental'],
    'Histoire':       ['La Révolution française', 'La 2e Guerre mondiale', 'Les Romains'],
    'Géographie':     ['Les cantons suisses', 'Hydrographie', 'Climat et relief'],
    'Allemand':       ['Vocabulaire Kap. 3', 'Lesen', 'Grammatik', 'Hören'],
    'Anglais':        ['Vocabulary Unit 4', 'Reading comprehension', 'Grammar test'],
    'Sciences':       ['Les cellules', 'L\'énergie', 'Le système solaire', 'Les écosystèmes'],
    'Physique':       ['Électricité', 'Mécanique', 'Optique'],
    'Biologie':       ['Génétique', 'Le corps humain', 'Les plantes'],
    'Chimie':         ['Les atomes', 'Réactions chimiques', 'Tableau périodique'],
    'Arts visuels':   ['Perspective', 'Portrait', 'Composition'],
    'Musique':        ['Rythme', 'Solfège', 'Culture musicale'],
    'Éducation physique': ['Endurance', 'Gymnastique', 'Sport collectif'],
    'ACT':            ['Projet bois', 'Couture', 'Travail métal'],
}

# Remarques types
REMARK_TEMPLATES = [
    "Bon travail aujourd'hui, continue ainsi !",
    "Bavardages excessifs pendant le cours.",
    "A oublié ses affaires de cours.",
    "Excellente participation en classe.",
    "Devoirs non rendus.",
    "Comportement perturbateur, avertissement donné.",
    "Belle progression ces dernières semaines.",
    "Retard non justifié.",
    "Travail de groupe exemplaire.",
    "Manque de concentration et de sérieux.",
    "A aidé un camarade en difficulté.",
    "Tenue inadaptée en cours d'EPS.",
    "Très bonne présentation orale.",
    "Utilisation du téléphone en classe.",
    "Progrès remarquable en expression écrite.",
]

# Modèles de sanctions
SANCTION_TEMPLATES_DATA = [
    {
        'name': 'Oubli de matériel',
        'description': "L'élève a oublié son matériel de cours",
        'thresholds': [
            {'count': 3, 'options': ["Mot dans l'agenda", "Avertissement oral"]},
            {'count': 6, 'options': ["Copie pages 12-13", "Exercices supplémentaires"]},
            {'count': 9, 'options': ["Retenue de 45 min", "Convocation des parents"]},
        ]
    },
    {
        'name': 'Bavardage',
        'description': "L'élève bavarde de manière excessive en classe",
        'thresholds': [
            {'count': 3, 'options': ["Changement de place", "Avertissement écrit"]},
            {'count': 6, 'options': ["Copie du règlement", "Retenue de 30 min"]},
            {'count': 9, 'options': ["Retenue de 1h", "Entretien avec le doyen"]},
        ]
    },
    {
        'name': 'Devoirs non faits',
        'description': "L'élève n'a pas fait ses devoirs",
        'thresholds': [
            {'count': 3, 'options': ["Faire les devoirs en retenue", "Avertissement"]},
            {'count': 5, 'options': ["Retenue avec travail doublé", "Appel aux parents"]},
            {'count': 8, 'options': ["Rapport au doyen", "Entretien parents-enseignant"]},
        ]
    },
]

# Aménagements types
ACCOMMODATION_TEMPLATES_DATA = [
    {'name': 'Temps supplémentaire 1/3', 'emoji': '⏱️', 'category': 'Temps',
     'description': "Temps supplémentaire de 1/3 pour les évaluations",
     'is_time_extension': True, 'time_multiplier': 1.33},
    {'name': 'Temps supplémentaire 1/2', 'emoji': '⏰', 'category': 'Temps',
     'description': "Temps supplémentaire de 50% pour les évaluations",
     'is_time_extension': True, 'time_multiplier': 1.5},
    {'name': 'Ordinateur', 'emoji': '💻', 'category': 'Matériel',
     'description': "Utilisation d'un ordinateur pour les travaux écrits",
     'is_time_extension': False, 'time_multiplier': None},
    {'name': 'Place au premier rang', 'emoji': '🪑', 'category': 'Espace',
     'description': "Placement au premier rang pour meilleure concentration",
     'is_time_extension': False, 'time_multiplier': None},
    {'name': 'Consignes simplifiées', 'emoji': '📝', 'category': 'Consignes',
     'description': "Reformulation et simplification des consignes",
     'is_time_extension': False, 'time_multiplier': None},
    {'name': 'Évaluation orale', 'emoji': '🎤', 'category': 'Évaluation',
     'description': "Possibilité de passer certaines évaluations à l'oral",
     'is_time_extension': False, 'time_multiplier': None},
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
    from models.evaluation import Evaluation, EvaluationGrade
    from models.lesson_memo import StudentRemark
    from models.sanctions import SanctionTemplate, SanctionThreshold, SanctionOption, ClassroomSanctionImport
    from models.student_sanctions import StudentSanctionCount
    from models.accommodation import AccommodationTemplate, StudentAccommodation

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
    all_students = {}    # all_students[classroom_id] = [student, ...]
    student_counter = 0

    CLASS_COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444']

    for teacher_idx, user in enumerate(users):
        teacher_classrooms = []
        classes = CLASSES_PER_TEACHER[teacher_idx]

        for ci_idx, class_info in enumerate(classes):
            classroom = Classroom(
                name=class_info['name'],
                subject=class_info['subject'],
                user_id=user.id,
                color=CLASS_COLORS[ci_idx % len(CLASS_COLORS)],
                is_class_master=class_info['is_master'],
            )
            db.session.add(classroom)
            db.session.flush()
            teacher_classrooms.append(classroom)

            # Créer la maîtrise de classe
            if class_info['is_master']:
                cm = ClassMaster(
                    classroom_id=classroom.id,
                    master_teacher_id=user.id,
                    school_year='2025-2026',
                )
                db.session.add(cm)

            # Créer 10 élèves
            classroom_students = []
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
                classroom_students.append(student)

            student_counter += 10
            db.session.flush()
            all_students[classroom.id] = classroom_students

            print(f'  📚 Classe: {class_info["name"]} ({class_info["subject"]}) '
                  f'pour {user.username} — 10 élèves'
                  f'{" ★ Maîtrise" if class_info["is_master"] else ""}')

        all_classrooms.append(teacher_classrooms)

    db.session.flush()

    # ─── 3. Créer les codes d'accès ───
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
        master_classroom = all_classrooms[master_idx][0]  # Première = maîtrise

        collab = TeacherCollaboration(
            specialized_teacher_id=spec_teacher.id,
            master_teacher_id=master_teacher.id,
            access_code_id=access_codes[master_teacher.id].id,
            is_active=True,
        )
        db.session.add(collab)
        db.session.flush()

        derived_classroom = Classroom(
            name=f'{master_classroom.name}',
            subject=subject,
            user_id=spec_teacher.id,
            color='#8B5CF6',
        )
        db.session.add(derived_classroom)
        db.session.flush()

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

    db.session.flush()

    # ─── 5. Créer les évaluations et les notes ───
    print()
    print('📊 Évaluations et notes:')
    base_date = date(2025, 9, 1)

    for teacher_idx, user in enumerate(users):
        eval_count = 0
        for ci_idx, classroom in enumerate(all_classrooms[teacher_idx]):
            subject = CLASSES_PER_TEACHER[teacher_idx][ci_idx]['subject']
            eval_names = EVAL_NAMES.get(subject, ['Test 1', 'Test 2', 'Test 3'])

            # Créer 3-5 évaluations par classe
            num_evals = min(len(eval_names), random.randint(3, 5))
            for e_idx in range(num_evals):
                eval_date = base_date + timedelta(days=14 * (e_idx + 1) + random.randint(0, 7))
                max_pts = random.choice([20, 30, 40, 50, 60])

                evaluation = Evaluation(
                    classroom_id=classroom.id,
                    title=eval_names[e_idx],
                    type='significatif' if e_idx % 2 == 0 else 'ta',
                    date=eval_date,
                    max_points=max_pts,
                    min_points=0,
                )
                db.session.add(evaluation)
                db.session.flush()

                # Donner des notes à chaque élève
                students = all_students.get(classroom.id, [])
                for student in students:
                    # Générer une note réaliste (entre 40% et 100% des points max)
                    min_score = int(max_pts * 0.25)
                    max_score = max_pts
                    points = round(random.uniform(min_score, max_score), 1)
                    # Quelques élèves n'ont pas encore de note (5% de chance)
                    if random.random() < 0.05:
                        points = None

                    grade = EvaluationGrade(
                        evaluation_id=evaluation.id,
                        student_id=student.id,
                        points=points,
                        date=datetime.combine(eval_date, time(10, 0)),
                    )
                    db.session.add(grade)

                eval_count += 1

        print(f'  📝 {user.username}: {eval_count} évaluations créées')

    db.session.flush()

    # ─── 6. Créer les remarques ───
    print()
    print('💬 Remarques:')
    for teacher_idx, user in enumerate(users):
        remark_count = 0
        for ci_idx, classroom in enumerate(all_classrooms[teacher_idx]):
            students = all_students.get(classroom.id, [])
            # 3-6 remarques par classe, réparties sur différents élèves
            num_remarks = random.randint(3, 6)
            for r_idx in range(num_remarks):
                student = random.choice(students)
                remark_date = base_date + timedelta(days=random.randint(7, 120))
                remark = StudentRemark(
                    user_id=user.id,
                    student_id=student.id,
                    source_date=remark_date,
                    source_period=random.randint(1, 8),
                    content=random.choice(REMARK_TEMPLATES),
                    send_to_parent_and_student=random.random() < 0.3,
                )
                db.session.add(remark)
                remark_count += 1

        print(f'  💬 {user.username}: {remark_count} remarques créées')

    db.session.flush()

    # ─── 7. Créer les modèles de sanctions et les coches ───
    print()
    print('⚠️  Sanctions:')
    for teacher_idx, user in enumerate(users):
        teacher_templates = []

        for st_data in SANCTION_TEMPLATES_DATA:
            template = SanctionTemplate(
                user_id=user.id,
                name=st_data['name'],
                description=st_data['description'],
                is_active=True,
            )
            db.session.add(template)
            db.session.flush()
            teacher_templates.append(template)

            # Créer les seuils et options
            for th_data in st_data['thresholds']:
                threshold = SanctionThreshold(
                    template_id=template.id,
                    check_count=th_data['count'],
                )
                db.session.add(threshold)
                db.session.flush()

                for opt_idx, opt_desc in enumerate(th_data['options']):
                    option = SanctionOption(
                        threshold_id=threshold.id,
                        description=opt_desc,
                        min_days_deadline=3 + opt_idx * 2,
                        order_index=opt_idx,
                        is_active=True,
                    )
                    db.session.add(option)

        # Importer les sanctions dans chaque classe et ajouter des coches
        check_count = 0
        for ci_idx, classroom in enumerate(all_classrooms[teacher_idx]):
            for template in teacher_templates:
                # Importer le modèle dans la classe
                imp = ClassroomSanctionImport(
                    classroom_id=classroom.id,
                    template_id=template.id,
                    is_active=True,
                )
                db.session.add(imp)

                # Donner des coches à certains élèves (60% des élèves, 0-5 coches)
                students = all_students.get(classroom.id, [])
                for student in students:
                    if random.random() < 0.6:
                        num_checks = random.randint(1, 5)
                        sc = StudentSanctionCount(
                            student_id=student.id,
                            template_id=template.id,
                            check_count=num_checks,
                        )
                        db.session.add(sc)
                        check_count += 1

        print(f'  ⚠️  {user.username}: {len(teacher_templates)} modèles de sanctions, {check_count} entrées de coches')

    db.session.flush()

    # ─── 8. Créer les aménagements ───
    print()
    print('♿ Aménagements:')
    for teacher_idx, user in enumerate(users):
        # Créer les templates d'aménagement pour cet enseignant
        teacher_accom_templates = []
        for at_data in ACCOMMODATION_TEMPLATES_DATA:
            accom_template = AccommodationTemplate(
                user_id=user.id,
                name=at_data['name'],
                description=at_data['description'],
                emoji=at_data['emoji'],
                category=at_data['category'],
                is_time_extension=at_data['is_time_extension'],
                time_multiplier=at_data['time_multiplier'],
                is_active=True,
            )
            db.session.add(accom_template)
            teacher_accom_templates.append(accom_template)

        db.session.flush()

        # Assigner des aménagements à ~20% des élèves (1-2 aménagements par élève)
        accom_count = 0
        for ci_idx, classroom in enumerate(all_classrooms[teacher_idx]):
            students = all_students.get(classroom.id, [])
            for student in students:
                if random.random() < 0.20:
                    # 1 ou 2 aménagements
                    num_accom = random.randint(1, 2)
                    chosen = random.sample(teacher_accom_templates, min(num_accom, len(teacher_accom_templates)))
                    for tmpl in chosen:
                        sa = StudentAccommodation(
                            student_id=student.id,
                            template_id=tmpl.id,
                            is_active=True,
                            notes='',
                        )
                        db.session.add(sa)
                        accom_count += 1

        print(f'  ♿ {user.username}: {accom_count} aménagements assignés')

    # ─── 9. Commit ───
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
    print(f'   • Évaluations, notes, remarques, sanctions et aménagements ajoutés')
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
    from models.evaluation import Evaluation, EvaluationGrade
    from models.lesson_memo import StudentRemark
    from models.sanctions import SanctionTemplate, SanctionThreshold, SanctionOption, ClassroomSanctionImport
    from models.student_sanctions import StudentSanctionCount, StudentSanctionRecord
    from models.accommodation import AccommodationTemplate, StudentAccommodation
    from models.file_manager import UserFile, FileFolder

    test_users = User.query.filter(User.email.like('%@profcalendar.dev')).all()
    test_user_ids = [u.id for u in test_users]

    if not test_user_ids:
        return

    # ─── Ordre correct de suppression (respecter les FK) ───

    # 1. Récupérer toutes les classes des utilisateurs de test
    test_classrooms = Classroom.query.filter(Classroom.user_id.in_(test_user_ids)).all()
    test_classroom_ids = [c.id for c in test_classrooms]

    # 2. Récupérer les élèves
    test_students = Student.query.filter(Student.user_id.in_(test_user_ids)).all()
    test_student_ids = [s.id for s in test_students]

    # 3. Supprimer les aménagements des élèves
    if test_student_ids:
        StudentAccommodation.query.filter(
            StudentAccommodation.student_id.in_(test_student_ids)
        ).delete(synchronize_session='fetch')

    # 4. Supprimer les templates d'aménagement
    AccommodationTemplate.query.filter(
        AccommodationTemplate.user_id.in_(test_user_ids)
    ).delete(synchronize_session='fetch')

    # 5. Supprimer les sanctions des élèves
    if test_student_ids:
        StudentSanctionRecord.query.filter(
            StudentSanctionRecord.student_id.in_(test_student_ids)
        ).delete(synchronize_session='fetch')
        StudentSanctionCount.query.filter(
            StudentSanctionCount.student_id.in_(test_student_ids)
        ).delete(synchronize_session='fetch')

    # 6. Supprimer les imports de sanctions dans les classes
    if test_classroom_ids:
        ClassroomSanctionImport.query.filter(
            ClassroomSanctionImport.classroom_id.in_(test_classroom_ids)
        ).delete(synchronize_session='fetch')

    # 7. Supprimer les templates de sanctions (cascade supprime thresholds et options)
    templates = SanctionTemplate.query.filter(
        SanctionTemplate.user_id.in_(test_user_ids)
    ).all()
    for t in templates:
        # Supprimer manuellement la chaîne thresholds → options
        thresholds = SanctionThreshold.query.filter_by(template_id=t.id).all()
        for th in thresholds:
            SanctionOption.query.filter_by(threshold_id=th.id).delete(synchronize_session='fetch')
            db.session.delete(th)
        db.session.delete(t)
    db.session.flush()

    # 8. Supprimer les remarques
    StudentRemark.query.filter(
        StudentRemark.user_id.in_(test_user_ids)
    ).delete(synchronize_session='fetch')

    # 9. Supprimer les notes d'évaluation puis les évaluations
    if test_classroom_ids:
        eval_ids = [e.id for e in Evaluation.query.filter(
            Evaluation.classroom_id.in_(test_classroom_ids)
        ).all()]
        if eval_ids:
            EvaluationGrade.query.filter(
                EvaluationGrade.evaluation_id.in_(eval_ids)
            ).delete(synchronize_session='fetch')
            Evaluation.query.filter(
                Evaluation.id.in_(eval_ids)
            ).delete(synchronize_session='fetch')

    # 10. Supprimer les fichiers et dossiers
    UserFile.query.filter(UserFile.user_id.in_(test_user_ids)).delete(synchronize_session='fetch')
    FileFolder.query.filter(FileFolder.user_id.in_(test_user_ids)).delete(synchronize_session='fetch')

    # 11. Supprimer les liens élèves-classes
    if test_student_ids:
        StudentClassroomLink.query.filter(
            StudentClassroomLink.student_id.in_(test_student_ids)
        ).delete(synchronize_session='fetch')

    # 12. IMPORTANT : SharedClassroom AVANT TeacherCollaboration (FK)
    collab_ids = [c.id for c in TeacherCollaboration.query.filter(
        (TeacherCollaboration.specialized_teacher_id.in_(test_user_ids)) |
        (TeacherCollaboration.master_teacher_id.in_(test_user_ids))
    ).all()]

    if collab_ids:
        SharedClassroom.query.filter(
            SharedClassroom.collaboration_id.in_(collab_ids)
        ).delete(synchronize_session='fetch')

    TeacherCollaboration.query.filter(
        (TeacherCollaboration.specialized_teacher_id.in_(test_user_ids)) |
        (TeacherCollaboration.master_teacher_id.in_(test_user_ids))
    ).delete(synchronize_session='fetch')

    # 13. Supprimer les classes et leurs dépendances
    for c in test_classrooms:
        try:
            from services.year_end_cleanup import _delete_classroom_dependencies
            _delete_classroom_dependencies(c.id)
            db.session.delete(c)
        except Exception:
            pass

    db.session.flush()

    # 14. Supprimer les codes d'accès
    TeacherAccessCode.query.filter(
        TeacherAccessCode.master_teacher_id.in_(test_user_ids)
    ).delete(synchronize_session='fetch')

    # 15. Supprimer les ClassMaster restants
    ClassMaster.query.filter(
        ClassMaster.master_teacher_id.in_(test_user_ids)
    ).delete(synchronize_session='fetch')

    # 16. Supprimer les préférences
    from models.user_preferences import UserSanctionPreferences, UserPreferences
    if test_classroom_ids:
        UserSanctionPreferences.query.filter(
            UserSanctionPreferences.user_id.in_(test_user_ids)
        ).delete(synchronize_session='fetch')
    UserPreferences.query.filter(
        UserPreferences.user_id.in_(test_user_ids)
    ).delete(synchronize_session='fetch')

    # 17. Supprimer les élèves
    if test_student_ids:
        Student.query.filter(Student.id.in_(test_student_ids)).delete(synchronize_session='fetch')

    # 18. Supprimer les utilisateurs
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
