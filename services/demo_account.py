"""Compte de démonstration en lecture seule.

Un visiteur qui n'a pas (encore) d'abonnement peut explorer ProfCalendar sur un
compte d'exemple bien rempli : trois classes, des élèves fictifs, un horaire,
les vacances vaudoises, des cours planifiés autour de la date du jour, des
notes, des présences, un plan de classe et deux PDF. Les écritures sont
bloquées par utils/demo_mode.py ; ce module ne fait que créer le compte et
rafraîchir ses données datées (planifications, présences, vacances) pour que
la démo montre toujours la semaine en cours.

Tout est créé par l'application elle-même, au premier passage sur /demo, puis
rafraîchi au besoin (idempotent, protégé par un verrou Postgres).
"""
import io
import json
import secrets
from datetime import date, datetime, time, timedelta

from extensions import db

DEMO_EMAIL = 'demo-readonly@profcalendar.org'
DEMO_MARKER = 'demo-v1'          # rangé dans users.referral_code (12 car. max)
_LOCK_KEY = 735102026            # verrou consultatif Postgres (pg_advisory_xact_lock)

CLASSES = [  # nom, matière, couleur
    ('9VP2', 'Mathématiques', '#4F46E5'),
    ('11VG1', 'Mathématiques', '#10B981'),
    ('10VP3', 'Sciences', '#F59E0B'),
]
STUDENTS = {
    '9VP2': ['Lucas Bianchi', 'Zoé Blanc', 'Adrien Bovet', 'Maxime Dubois', 'Léa Favre', 'Hugo Keller', 'Théo Martin',
             'Noah Meier', 'Lina Morel', 'Chloé Müller', 'Sarah Nguyen', 'Inès Perret', 'Camille Rochat', 'Emma Rossi',
             'Nolan Schmid'],
    '11VG1': ['Yann Dupuis', 'Elsa Girard', 'Mathis Fontaine', 'Jade Roux', 'Louis Baumann', 'Nina Vuille', 'Eliott Pittet',
              'Margaux Jaquet', 'Arthur Michaud', 'Léonie Rey'],
    '10VP3': ['Manon Berger', 'Rayan Costa', 'Alice Weber', 'Sami Haddad', 'Lou Chappuis', 'Jules Gerber', 'Clara Monnier',
              'Ethan Reymond'],
}
# Horaire type : jour (0 = lundi) → classes des périodes 1, 2, 3…
GRID = {
    0: ['9VP2', '9VP2', '11VG1', None, '10VP3', '10VP3'],
    1: ['11VG1', '11VG1', '9VP2', '9VP2', None, '10VP3'],
    2: ['9VP2', '10VP3', '10VP3', None],
    3: ['11VG1', '9VP2', '9VP2', '10VP3', '11VG1'],
    4: ['9VP2', '9VP2', '11VG1', '11VG1', '10VP3'],
}
TITLES = {
    '9VP2': ['Fractions : addition et soustraction', 'Fractions : multiplication', 'Exercices p. 42 à 44', 'Test formatif sur les fractions',
             'Correction du test', 'Introduction aux pourcentages', 'Pourcentages : exercices', 'Figures planes : périmètres',
             'Figures planes : aires', 'Théorème de Pythagore'],
    '11VG1': ['Fonctions affines : lecture graphique', 'Pente et ordonnée à l’origine', 'Problèmes de modélisation', 'Révisions du chapitre 3',
              'Évaluation significative', 'Correction et remédiation', 'Systèmes d’équations'],
    '10VP3': ['Le cycle de l’eau', 'Expérience : les états de la matière', 'Rapport de laboratoire', 'Mélanges et solutions',
              'Évaluation : la matière', 'La photosynthèse'],
}
DESCRIPTION = ("- [ ] Rappel de la leçon précédente\n- [ ] Nouvelle notion au tableau\n- [ ] Exercices en binômes\n"
               "- [ ] Devoirs : fiche d’exercices")


def _school_year(today):
    start = today.year if today.month >= 8 else today.year - 1
    return f'{start}-{start + 1}', date(start, 8, 24), date(start + 1, 7, 2)


def _demo_pdf(title, subtitle, items):
    """PDF A4 simple (reportlab) : titre + rubriques numérotées."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4); w, h = A4
    c.setFont('Helvetica-Bold', 20); c.drawString(2 * cm, h - 2.5 * cm, title)
    c.setFont('Helvetica', 11); c.drawString(2 * cm, h - 3.2 * cm, subtitle)
    c.line(2 * cm, h - 3.5 * cm, w - 2 * cm, h - 3.5 * cm)
    y = h - 5 * cm
    for head, text in items:
        c.setFont('Helvetica-Bold', 13); c.drawString(2 * cm, y, head); y -= 0.7 * cm
        c.setFont('Helvetica', 11); c.drawString(2.4 * cm, y, text); y -= 1.3 * cm
    c.setLineWidth(1.2)
    c.line(3 * cm, 4 * cm, 9 * cm, 4 * cm); c.line(3 * cm, 4 * cm, 3 * cm, 8 * cm); c.line(3 * cm, 8 * cm, 9 * cm, 4 * cm)
    c.circle(14 * cm, 6 * cm, 2 * cm)
    c.showPage(); c.save()
    return buf.getvalue()


def _lock():
    if db.engine.dialect.name == 'postgresql':
        db.session.execute(db.text('SELECT pg_advisory_xact_lock(:k)'), {'k': _LOCK_KEY})


def get_demo_user():
    from models.user import User
    return User.query.filter_by(email=DEMO_EMAIL).first()


def ensure_demo_account():
    """Crée le compte de démo s'il n'existe pas, puis rafraîchit ses données
    datées si nécessaire. Retourne l'utilisateur. Commit inclus."""
    user = get_demo_user()
    if user is None or user.referral_code != DEMO_MARKER:
        _lock()
        user = get_demo_user()            # un autre processus a pu le créer entre-temps
        if user is None:
            user = _create_demo_account()
        elif user.referral_code != DEMO_MARKER:
            user.referral_code = DEMO_MARKER
        db.session.commit()
    if _dated_data_stale(user):
        _lock()
        if _dated_data_stale(user):
            _refresh_dated_data(user)
        db.session.commit()
    return user


def _create_demo_account():
    from models.user import User
    from models.classroom import Classroom
    from models.student import Student
    from models.schedule import Schedule
    from models.evaluation import Evaluation, EvaluationGrade
    from models.seating_plan import SeatingPlan
    from models.file_manager import UserFile, FileFolder
    from models.class_file import ClassFile
    from models.user_preferences import DashboardTask, DashboardLink
    from routes.schedule import calculate_periods

    today = date.today()
    _, sy_start, sy_end = _school_year(today)
    user = User(username='Mme Favre', email=DEMO_EMAIL, email_verified=True)
    user.set_password(secrets.token_urlsafe(32))      # jamais communiqué : accès par /demo uniquement
    user.lifetime_premium = True
    user.subscription_tier = 'premium'
    user.has_seen_tour = True
    user.referral_code = DEMO_MARKER
    user.apply_smart_defaults()
    user.school_year_start, user.school_year_end = sy_start, sy_end
    db.session.add(user); db.session.flush()
    user.add_default_breaks(); db.session.flush()

    classes = {}
    for name, subject, color in CLASSES:
        c = Classroom(name=name, subject=subject, class_group=name, color=color, user_id=user.id)
        db.session.add(c); db.session.flush(); classes[name] = c
        for full in STUDENTS[name]:
            first, last = full.split(' ', 1)
            db.session.add(Student(classroom_id=c.id, user_id=user.id, first_name=first, last_name=last))
    db.session.flush()

    periods = {p['number']: p for p in calculate_periods(user)}
    for wd, row in GRID.items():
        for i, cname in enumerate(row, start=1):
            if cname and i in periods:
                db.session.add(Schedule(user_id=user.id, classroom_id=classes[cname].id, weekday=wd, period_number=i,
                                        start_time=periods[i]['start'], end_time=periods[i]['end'],
                                        room='B204' if cname == '9VP2' else ('A12' if cname == '11VG1' else 'Labo 2')))

    # Évaluations et notes (9VP2 et 11VG1)
    import random
    rnd = random.Random(7)
    for cname, evals in (('9VP2', [('Test 1 — Fractions', 30, 24), ('Test 2 — Nombres relatifs', 40, 10)]),
                         ('11VG1', [('Évaluation — Fonctions affines', 36, 17)])):
        studs = Student.query.filter_by(classroom_id=classes[cname].id).all()
        for title, maxp, days_ago in evals:
            ev = Evaluation(classroom_id=classes[cname].id, title=title, type='significatif',
                            date=today - timedelta(days=days_ago), max_points=maxp, min_points=0)
            db.session.add(ev); db.session.flush()
            for s in studs:
                pts = round(rnd.uniform(0.45, 1.0) * maxp * 2) / 2
                db.session.add(EvaluationGrade(evaluation_id=ev.id, student_id=s.id, points=pts,
                                               date=datetime.combine(ev.date, time(10, 0))))

    # Plan de classe de 9VP2 : bureau + 8 tables doubles
    studs = Student.query.filter_by(classroom_id=classes['9VP2'].id).order_by(Student.id).all()
    elements = [{'id': 'element-1', 'type': 'teacher-desk', 'x': 250, 'y': 24}]
    placement, n = [], 2
    for row in range(3):
        for col in range(3):
            if row == 2 and col == 2:
                continue
            eid = f'element-{n}'; n += 1
            elements.append({'id': eid, 'type': 'desk-double', 'x': 40 + col * 200, 'y': 130 + row * 110})
            for slot in range(2):
                if studs:
                    s = studs.pop(0)
                    placement.append({'student_id': str(s.id), 'student_name': f'{s.first_name} {s.last_name}',
                                      'element_id': eid, 'slot_index': slot})
    db.session.add(SeatingPlan(classroom_id=classes['9VP2'].id, user_id=user.id, name='Plan par défaut', is_active=True,
                               plan_data=json.dumps({'classroom_id': str(classes['9VP2'].id), 'elements': elements,
                                                     'students_placement': placement})))

    # Fichiers : un dossier, deux PDF, copiés et épinglés dans 9VP2
    folder = FileFolder(user_id=user.id, name='Mathématiques 9e', color='#4F46E5'); db.session.add(folder); db.session.flush()
    docs = [
        ('figures_planes.pdf', 'Figures planes — Théorie.pdf', True,
         _demo_pdf('Figures planes — Théorie', '9VP2 · Mathématiques',
                   [('1. Le triangle', 'Un polygone à trois côtés ; la somme de ses angles vaut 180°.'),
                    ('2. Le triangle rectangle', 'Il possède un angle droit ; le côté opposé est l’hypoténuse.'),
                    ('3. Le théorème de Pythagore', 'Dans un triangle rectangle : a² + b² = c².'),
                    ('4. Le cercle', 'Périmètre : 2·π·r ; aire : π·r².')])),
        ('fiche_fractions.pdf', 'Fiche d’exercices — Fractions.pdf', False,
         _demo_pdf('Fiche d’exercices — Fractions', '9VP2 · Mathématiques',
                   [('Exercice 1', 'Calcule : 3/4 + 1/6 = ?'), ('Exercice 2', 'Calcule : 5/8 − 1/4 = ?'),
                    ('Exercice 3', 'Simplifie la fraction 18/24.'), ('Exercice 4', 'Range dans l’ordre : 2/3 ; 3/5 ; 7/10.')])),
    ]
    for i, (fname, orig, pinned, data) in enumerate(docs):
        uf = UserFile(user_id=user.id, folder_id=folder.id, filename=fname, original_filename=orig, file_type='pdf',
                      file_size=len(data), mime_type='application/pdf', file_content=data)
        db.session.add(uf); db.session.flush()
        db.session.add(ClassFile(classroom_id=classes['9VP2'].id, user_file_id=uf.id, folder_path='',
                                 is_pinned=pinned, pin_order=1 if pinned else 0))

    # Tableau de bord : quelques tâches et liens
    for pos, (title, done) in enumerate([('Corriger le test 2 de 9VP2', False), ('Préparer la sortie au musée (10VP3)', False),
                                         ('Imprimer les fiches de révision', True)]):
        db.session.add(DashboardTask(user_id=user.id, title=title, is_done=done, position=pos))
    for pos, (url, alias, icon) in enumerate([('https://www.plandetudes.ch', 'Plan d’études romand', '📘'),
                                              ('https://www.vd.ch/formation', 'DGEO Vaud', '🏫')]):
        db.session.add(DashboardLink(user_id=user.id, url=url, alias=alias, icon=icon, position=pos))

    db.session.flush()
    _refresh_dated_data(user)
    return user


def _dated_data_stale(user):
    """Planifications trop courtes vers l'avenir, ou vacances d'une autre année scolaire."""
    from models.planning import Planning
    from models.user import Holiday
    today = date.today()
    last = db.session.query(db.func.max(Planning.date)).filter(Planning.user_id == user.id).scalar()
    if last is None or last < today + timedelta(days=21):
        return True
    _, sy_start, _ = _school_year(today)
    first_holiday = db.session.query(db.func.min(Holiday.start_date)).filter(Holiday.user_id == user.id).scalar()
    return first_holiday is None or first_holiday < sy_start


def _refresh_dated_data(user):
    """Recrée les planifications (de 2 semaines avant à 6 semaines après aujourd'hui),
    les présences du dernier cours de 9VP2 et les vacances de l'année en cours."""
    from models.classroom import Classroom
    from models.student import Student
    from models.schedule import Schedule
    from models.planning import Planning
    from models.attendance import Attendance
    from models.user import Holiday
    from data.cantonal_holidays import get_import_periods

    today = date.today()
    sy_label, sy_start, sy_end = _school_year(today)
    user.school_year_start, user.school_year_end = sy_start, sy_end

    Holiday.query.filter_by(user_id=user.id).delete()
    holidays = []
    for p in get_import_periods('vaud', sy_label, True):
        db.session.add(Holiday(user_id=user.id, name=p['name'], start_date=p['start'], end_date=p['end']))
        holidays.append((p['start'], p['end']))
    in_holiday = lambda d: any(a <= d <= b for a, b in holidays)

    Planning.query.filter_by(user_id=user.id).delete()
    classes = {c.id: c.name for c in Classroom.query.filter_by(user_id=user.id).all()}
    slots = Schedule.query.filter_by(user_id=user.id).order_by(Schedule.weekday, Schedule.period_number).all()
    counters = {}
    start = today - timedelta(days=today.weekday() + 14)
    for offset in range(0, 8 * 7):
        d = start + timedelta(days=offset)
        if d.weekday() > 4 or in_holiday(d):
            continue
        for s in slots:
            if s.weekday != d.weekday() or s.classroom_id not in classes:
                continue
            titles = TITLES.get(classes[s.classroom_id], ['Cours'])
            i = counters.get(s.classroom_id, 0); counters[s.classroom_id] = i + 1
            db.session.add(Planning(user_id=user.id, classroom_id=s.classroom_id, date=d, period_number=s.period_number,
                                    title=titles[i % len(titles)], description=DESCRIPTION))

    # Présences : dernier cours de 9VP2 jusqu'à aujourd'hui (quelques absences et un retard)
    Attendance.query.filter_by(user_id=user.id).delete()
    c9 = next((cid for cid, n in classes.items() if n == '9VP2'), None)
    if c9:
        days9 = sorted({(s.weekday, s.period_number) for s in slots if s.classroom_id == c9})
        d = today
        for _ in range(21):
            if d.weekday() <= 4 and not in_holiday(d) and any(wd == d.weekday() for wd, _p in days9):
                break
            d -= timedelta(days=1)
        period = min(p for wd, p in days9 if wd == d.weekday()) if any(wd == d.weekday() for wd, _p in days9) else 1
        for i, s in enumerate(Student.query.filter_by(classroom_id=c9).order_by(Student.id).all()):
            status = 'absent' if i in (1, 9) else ('late' if i == 3 else 'present')
            db.session.add(Attendance(student_id=s.id, classroom_id=c9, user_id=user.id, date=d, period_number=period,
                                      status=status, late_minutes=5 if status == 'late' else None))
    db.session.flush()
