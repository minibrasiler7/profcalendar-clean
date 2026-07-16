"""Devoirs (enseignant → élèves).

Phase 1 : l'enseignant crée un devoir pour une classe, avec une date de rendu
choisie parmi les prochaines dates de cours de la classe (jour de la semaine
indiqué). Le devoir apparaîtra comme une tâche à la date de rendu.

Deux types : 'submission' (l'élève rend une photo, le prof corrige) et
'exercise' (exercice interactif, suivi points/badges). Le rendu côté élève et
la correction arrivent dans les phases suivantes.
"""
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from extensions import db
from routes import teacher_required
from models.devoir import Devoir
from models.classroom import Classroom
from models.exercise import Exercise
from routes.evaluations import user_can_access_classroom

devoirs_bp = Blueprint('devoirs', __name__, url_prefix='/api/devoirs')

_WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
_MONTHS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
              'août', 'septembre', 'octobre', 'novembre', 'décembre']


def get_upcoming_class_dates(user, classroom, count=8, from_date=None):
    """Prochaines dates où la classe a cours (jours de l'horaire type), en
    sautant vacances/fériés et en restant dans l'année scolaire. Couvre toutes
    les disciplines de la classe (roster/horaire du groupe)."""
    from models.schedule import Schedule
    from utils.vaud_holidays import is_holiday

    group_ids = classroom.get_group_classroom_ids()
    weekdays = {
        s.weekday for s in Schedule.query.filter(
            Schedule.user_id == user.id,
            Schedule.classroom_id.in_(group_ids)
        ).all()
    }
    if not weekdays:
        return []

    start = from_date or user.get_local_datetime().date()
    end = user.school_year_end or (start + timedelta(days=365))
    d = start + timedelta(days=1)
    out = []
    while len(out) < count and d <= end:
        if d.weekday() in weekdays and not is_holiday(d, user):
            out.append(d)
        d += timedelta(days=1)
    return out


def _date_label(d):
    return f"{_WEEKDAYS_FR[d.weekday()]} {d.day} {_MONTHS_FR[d.month]}"


@devoirs_bp.route('/suggest-dates', methods=['GET'])
@login_required
@teacher_required
def suggest_dates():
    """Prochaines dates de cours de la classe (avec le jour de la semaine)."""
    try:
        classroom_id = int(request.args.get('classroom_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'classroom_id invalide'}), 400
    if not user_can_access_classroom(current_user.id, classroom_id):
        return jsonify({'success': False, 'error': 'Accès refusé'}), 403
    classroom = Classroom.query.get_or_404(classroom_id)
    dates = get_upcoming_class_dates(current_user, classroom, count=10)
    return jsonify({
        'success': True,
        'dates': [
            {'date': d.isoformat(), 'weekday': _WEEKDAYS_FR[d.weekday()], 'label': _date_label(d)}
            for d in dates
        ],
    })


@devoirs_bp.route('/exercises', methods=['GET'])
@login_required
@teacher_required
def list_exercises_for_picker():
    """Exercices interactifs de l'enseignant — pour le sélecteur d'un devoir de
    type 'exercise'. Les publiés d'abord."""
    exs = Exercise.query.filter_by(user_id=current_user.id).order_by(
        Exercise.is_published.desc(), Exercise.updated_at.desc()
    ).all()
    return jsonify({'success': True, 'exercises': [
        {'id': e.id, 'title': e.title, 'subject': e.subject or '', 'published': bool(e.is_published)}
        for e in exs
    ]})


@devoirs_bp.route('/create', methods=['POST'])
@login_required
@teacher_required
def create_devoir():
    """Crée un devoir. Corps JSON : classroom_id, type, title, instructions?,
    due_date (YYYY-MM-DD), due_period?, exercise_id? (si type=exercise)."""
    data = request.get_json(silent=True) or {}

    try:
        classroom_id = int(data.get('classroom_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'classroom_id invalide'}), 400
    if not user_can_access_classroom(current_user.id, classroom_id):
        return jsonify({'success': False, 'error': 'Accès refusé'}), 403

    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'Titre manquant'}), 400

    devoir_type = data.get('type') if data.get('type') in ('submission', 'exercise') else 'submission'

    try:
        due_date = datetime.strptime(data.get('due_date'), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'Date de rendu invalide'}), 400

    due_period = data.get('due_period')
    try:
        due_period = int(due_period) if due_period not in (None, '') else None
    except (TypeError, ValueError):
        due_period = None

    exercise_id = None
    if devoir_type == 'exercise':
        try:
            exercise_id = int(data.get('exercise_id'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'Exercice manquant'}), 400
        if not Exercise.query.filter_by(id=exercise_id, user_id=current_user.id).first():
            return jsonify({'success': False, 'error': 'Exercice introuvable'}), 404

    devoir = Devoir(
        user_id=current_user.id,
        classroom_id=classroom_id,
        devoir_type=devoir_type,
        title=title,
        instructions=((data.get('instructions') or '').strip() or None),
        due_date=due_date,
        due_period=due_period,
        exercise_id=exercise_id,
    )
    db.session.add(devoir)
    db.session.commit()
    return jsonify({'success': True, 'devoir': devoir.to_dict()})


@devoirs_bp.route('/list', methods=['GET'])
@login_required
@teacher_required
def list_devoirs():
    """Devoirs de l'enseignant. Filtres optionnels : ?date=YYYY-MM-DD (date de
    rendu), ?classroom_id=X."""
    q = Devoir.query.filter_by(user_id=current_user.id)
    date_str = request.args.get('date')
    if date_str:
        try:
            q = q.filter(Devoir.due_date == datetime.strptime(date_str, '%Y-%m-%d').date())
        except ValueError:
            return jsonify({'success': False, 'error': 'date invalide'}), 400
    cid = request.args.get('classroom_id')
    if cid:
        try:
            q = q.filter(Devoir.classroom_id == int(cid))
        except ValueError:
            pass
    devoirs = q.order_by(Devoir.due_date.asc(), Devoir.created_at.asc()).all()
    return jsonify({'success': True, 'devoirs': [d.to_dict() for d in devoirs]})


@devoirs_bp.route('/<int:devoir_id>', methods=['DELETE'])
@login_required
@teacher_required
def delete_devoir(devoir_id):
    devoir = Devoir.query.filter_by(id=devoir_id, user_id=current_user.id).first()
    if not devoir:
        return jsonify({'success': False, 'error': 'Devoir introuvable'}), 404
    db.session.delete(devoir)
    db.session.commit()
    return jsonify({'success': True})


# ============================================================
# PHASE 4 — Correction des rendus (côté enseignant)
# ============================================================

def _files_to_pdf_bytes(files):
    """Uploads -> (pdf_bytes, page_count). Un PDF est gardé tel quel ; des
    images sont fusionnées en un PDF. (None, 0) si rien d'exploitable."""
    import io
    from PIL import Image
    files = [f for f in files if f and f.filename]
    if not files:
        return None, 0
    if len(files) == 1 and (
        (files[0].mimetype or '') == 'application/pdf' or files[0].filename.lower().endswith('.pdf')):
        data = files[0].read()
        return (data, 1) if data else (None, 0)
    try:
        imgs = [Image.open(f.stream).convert('RGB') for f in files[:30]]
        if not imgs:
            return None, 0
        buf = io.BytesIO()
        imgs[0].save(buf, format='PDF', save_all=True, append_images=imgs[1:])
        return buf.getvalue(), len(imgs)
    except Exception:
        return None, 0


@devoirs_bp.route('/<int:devoir_id>/submissions', methods=['GET'])
@login_required
@teacher_required
def devoir_submissions(devoir_id):
    """Liste (JSON) des rendus d'un devoir : tout le roster + état de chacun."""
    from models.devoir import Devoir, DevoirSubmission
    devoir = Devoir.query.filter_by(id=devoir_id, user_id=current_user.id).first()
    if not devoir:
        return jsonify({'success': False, 'error': 'Devoir introuvable'}), 404
    subs = {s.student_id: s for s in DevoirSubmission.query.filter_by(devoir_id=devoir_id).all()}
    rows = []
    for st in devoir.get_students():
        sub = subs.get(st.id)
        rows.append({
            'student_id': st.id,
            'student_name': st.full_name,
            'submission_id': sub.id if sub else None,
            'submitted': bool(sub and sub.pdf_filename),
            'submitted_at': sub.submitted_at.strftime('%d.%m.%Y %H:%M') if (sub and sub.submitted_at) else None,
            'page_count': sub.page_count if sub else 0,
            'corrected': bool(sub and sub.corrected_filename),
        })
    rows.sort(key=lambda r: (not r['submitted'], r['student_name']))
    return jsonify({'success': True, 'devoir': devoir.to_dict(), 'submissions': rows})


def _serve_devoir_pdf(submission_id, which):
    """Sert le PDF d'un rendu ('file') ou de la correction ('corrected') à
    l'enseignant propriétaire du devoir."""
    from flask import Response
    from models.devoir import Devoir, DevoirSubmission
    from services.r2_storage import download_file_from_r2
    sub = DevoirSubmission.query.get(submission_id)
    if not sub:
        return "Introuvable", 404
    devoir = Devoir.query.get(sub.devoir_id)
    if not devoir or devoir.user_id != current_user.id:
        return "Accès refusé", 403
    fn = sub.pdf_filename if which == 'file' else sub.corrected_filename
    if not fn:
        return "Aucun fichier", 404
    data = download_file_from_r2(devoir.user_id, fn)
    if not data:
        return "Fichier introuvable", 404
    label = 'rendu.pdf' if which == 'file' else 'correction.pdf'
    return Response(data, mimetype='application/pdf',
                    headers={'Content-Disposition': f'inline; filename="{label}"'})


@devoirs_bp.route('/submissions/<int:submission_id>/file', methods=['GET'])
@login_required
@teacher_required
def submission_file(submission_id):
    return _serve_devoir_pdf(submission_id, 'file')


@devoirs_bp.route('/submissions/<int:submission_id>/corrected', methods=['GET'])
@login_required
@teacher_required
def submission_corrected_teacher(submission_id):
    return _serve_devoir_pdf(submission_id, 'corrected')


@devoirs_bp.route('/submissions/<int:submission_id>/correct', methods=['POST'])
@login_required
@teacher_required
def correct_submission(submission_id):
    """L'enseignant renvoie la correction (PDF annoté ou photos) — stockée
    individuellement pour CET élève uniquement."""
    import uuid
    from datetime import datetime as _dt
    from models.devoir import Devoir, DevoirSubmission
    from services.r2_storage import upload_file_to_r2, delete_file_from_r2, is_r2_enabled
    sub = DevoirSubmission.query.get(submission_id)
    if not sub:
        return jsonify({'success': False, 'error': 'Introuvable'}), 404
    devoir = Devoir.query.get(sub.devoir_id)
    if not devoir or devoir.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Accès refusé'}), 403
    pdf_bytes, _pages = _files_to_pdf_bytes(request.files.getlist('correction'))
    if not pdf_bytes:
        return jsonify({'success': False, 'error': 'Aucun fichier de correction'}), 400
    if not is_r2_enabled():
        return jsonify({'success': False, 'error': 'Stockage indisponible'}), 503
    teacher_id = devoir.user_id
    filename = f"devoir{devoir.id}_eleve{sub.student_id}_corr_{uuid.uuid4().hex[:8]}.pdf"
    if not upload_file_to_r2(pdf_bytes, teacher_id, filename, 'application/pdf'):
        return jsonify({'success': False, 'error': "Échec de l'envoi"}), 500
    if sub.corrected_filename:
        try:
            delete_file_from_r2(teacher_id, sub.corrected_filename)
        except Exception:
            pass
    sub.corrected_filename = filename
    sub.corrected_at = _dt.utcnow()
    sub.status = 'corrected'
    db.session.commit()
    return jsonify({'success': True})


def purge_old_devoir_files(days=7):
    """Supprime (R2 + DB) les rendus dont le devoir a une date de rendu de plus
    de `days` jours. À planifier (cron Render : flask purge-devoir-files)."""
    from datetime import date, timedelta
    from models.devoir import Devoir, DevoirSubmission
    from services.r2_storage import delete_file_from_r2
    cutoff = date.today() - timedelta(days=days)
    old = (DevoirSubmission.query.join(Devoir, DevoirSubmission.devoir_id == Devoir.id)
           .filter(Devoir.due_date < cutoff).all())
    n = 0
    for sub in old:
        devoir = Devoir.query.get(sub.devoir_id)
        tid = devoir.user_id if devoir else None
        if tid:
            for fn in (sub.pdf_filename, sub.corrected_filename):
                if fn:
                    try:
                        delete_file_from_r2(tid, fn)
                    except Exception:
                        pass
        db.session.delete(sub)
        n += 1
    db.session.commit()
    return n


def register_devoir_commands(app):
    """Commande CLI `flask purge-devoir-files` (à planifier via cron Render)."""
    @app.cli.command('purge-devoir-files')
    def _purge_cmd():
        """Purge les rendus de devoirs > 7 jours après la date de rendu."""
        n = purge_old_devoir_files(7)
        print(f"✅ {n} rendu(s) purgé(s).")
