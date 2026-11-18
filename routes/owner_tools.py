"""Outils personnels : thèmes et exercices, décalage des planifications, fiche d'objectifs.

Toutes les routes sont réservées (utils/owner_features.owner_required) : pour un autre
compte elles répondent 404 et rien n'apparaît dans l'interface.
"""
import hashlib
import json
from datetime import datetime

from flask import Blueprint, jsonify, make_response, render_template, request
from flask_login import current_user, login_required

from extensions import db
from models.classroom import Classroom
from models.course_theme import CourseTheme, exercise_code
from utils.owner_features import owner_required

owner_tools_bp = Blueprint('owner_tools', __name__, url_prefix='/perso')


def _classroom(classroom_id):
    return Classroom.query.filter_by(id=int(classroom_id), user_id=current_user.id).first_or_404()


def _theme(theme_id):
    return CourseTheme.query.filter_by(id=int(theme_id), user_id=current_user.id).first_or_404()


def _now_period(user):
    """Dernière période commencée aujourd'hui (pour savoir si un cours du jour est passé)."""
    try:
        from routes.schedule import calculate_periods
        now = user.get_local_datetime()
        started = [p['number'] for p in calculate_periods(user) if p['start'] <= now.time()]
        return (now.date(), max(started) if started else 0)
    except Exception:
        return (datetime.utcnow().date(), None)


def _state(classroom, theme_id=None, title=None):
    from services import theme_progress as tp
    tp.ensure_default_themes(current_user)
    themes = tp.themes_for_class(current_user, classroom)
    today, period = _now_period(current_user)
    scan = tp.scan_class(current_user, classroom, themes, today=today, now_period=period)
    theme = next((t for t in themes if theme_id and t.id == int(theme_id)), None) \
        or tp.current_theme(current_user, classroom, themes, scan, title=title)
    return {
        'success': True,
        'classroom': {'id': classroom.id, 'name': classroom.name, 'subject': classroom.subject},
        'themes': [{'id': t.id, 'label': t.label} for t in themes],
        'selected': tp.theme_state(current_user, classroom, theme, scan) if theme else None,
    }


# ---------------------------------------------------------------- thèmes et exercices

@owner_tools_bp.route('/api/class/<int:classroom_id>/themes')
@login_required
@owner_required
def class_themes(classroom_id):
    classroom = _classroom(classroom_id)
    title, planned = request.args.get('title'), False
    if request.args.get('date') and request.args.get('period', type=int):
        # Titre du cours ouvert : il désigne le thème (« NO nombres relatifs »).
        from models.planning import Planning
        try:
            day = datetime.strptime(request.args['date'], '%Y-%m-%d').date()
            planning = Planning.query.filter_by(user_id=current_user.id, date=day,
                                                period_number=request.args.get('period', type=int)).first()
            if planning and planning.classroom_id == classroom.id:
                title = title or planning.title
                planned = bool((planning.title or '').strip() or (planning.description or '').strip()
                               or planning.resources.count())
        except ValueError:
            pass
    payload = _state(classroom, theme_id=request.args.get('theme_id', type=int), title=title)
    payload['slot_planned'] = planned          # un contenu à décaler si le cours n'a pas lieu
    return jsonify(payload)


@owner_tools_bp.route('/api/class/<int:classroom_id>/theme/<int:theme_id>/marks', methods=['POST'])
@login_required
@owner_required
def save_marks(classroom_id, theme_id):
    """Marques posées à la main. Valeurs : exercices « done » / « todo » / null (revenir à
    ce que disent les planifications) ; notions « seen » / « unseen » / null."""
    from services import theme_progress as tp
    classroom, theme = _classroom(classroom_id), _theme(theme_id)
    data = request.get_json(silent=True) or {}
    row = tp.get_progress(current_user, classroom, theme, create=True)
    valid_codes = {e['code'] for e in theme.all_exercises()}
    marks = row.exercise_marks
    for code, value in (data.get('exercises') or {}).items():
        if code not in valid_codes:
            continue
        if value in ('done', 'todo'):
            marks[code] = value
        else:
            marks.pop(code, None)
    row.set_exercise_marks(marks)
    valid_notions = {str(n.get('n')) for n in theme.notions}
    nmarks = row.notion_marks
    for n, value in (data.get('notions') or {}).items():
        if str(n) not in valid_notions:
            continue
        if value in ('seen', 'unseen'):
            nmarks[str(n)] = value
        else:
            nmarks.pop(str(n), None)
    row.set_notion_marks(nmarks)
    if data.get('current') is True:
        from models.course_theme import CourseThemeProgress
        CourseThemeProgress.query.filter(CourseThemeProgress.classroom_id == classroom.id,
                                         CourseThemeProgress.id != row.id).update({'is_current': False})
        row.is_current = True
    elif data.get('current') is False:
        row.is_current = False
    db.session.commit()
    return jsonify(_state(classroom, theme_id=theme.id))


@owner_tools_bp.route('/themes')
@login_required
@owner_required
def themes_page():
    from services import theme_progress as tp
    tp.ensure_default_themes(current_user)
    themes = CourseTheme.query.filter_by(user_id=current_user.id).order_by(CourseTheme.position, CourseTheme.id).all()
    return render_template('owner/themes.html', themes=[t.to_dict() for t in themes])


def _theme_payload(data):
    """Champs d'un thème depuis le formulaire (une entrée par ligne)."""
    def lines(key):
        return [l.strip() for l in (data.get(key) or '').replace('\r', '').split('\n') if l.strip()]
    from services.theme_import import _tokens
    objectives = [('– ' + l.lstrip('-–• ').strip()) if l[:1] in '-–' else l.lstrip('• ').strip() for l in lines('objectives')]
    exercises = _tokens(' '.join(lines('exercises')))
    notions = []
    for i, line in enumerate(lines('notions'), start=1):
        title, _, codes = line.partition('|')
        notions.append({'n': i, 'title': title.strip(), 'exercises': _tokens(codes)})
    return objectives, exercises, notions


@owner_tools_bp.route('/api/themes/save', methods=['POST'])
@login_required
@owner_required
def save_theme():
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'error': 'Le titre est obligatoire.'}), 400
    if data.get('id'):
        theme = _theme(data['id'])
    else:
        theme = CourseTheme(user_id=current_user.id,
                            position=CourseTheme.query.filter_by(user_id=current_user.id).count())
        db.session.add(theme)
    theme.code = (data.get('code') or '').strip().upper()[:10]
    theme.title = title[:200]
    theme.level = (data.get('level') or '').strip()[:120]
    theme.subject = (data.get('subject') or '').strip()[:100]
    theme.revision = (data.get('revision') or '').strip()[:255]
    theme.set_content(*_theme_payload(data))
    db.session.commit()
    return jsonify({'success': True, 'theme': theme.to_dict()})


@owner_tools_bp.route('/api/themes/<int:theme_id>/delete', methods=['POST'])
@login_required
@owner_required
def delete_theme(theme_id):
    theme = _theme(theme_id)
    db.session.delete(theme)
    db.session.commit()
    return jsonify({'success': True})


@owner_tools_bp.route('/api/themes/import', methods=['POST'])
@login_required
@owner_required
def import_theme():
    """Lit un dossier théorique (PDF) et renvoie le thème proposé, sans l'enregistrer."""
    up = request.files.get('file')
    if not up or not up.filename.lower().endswith('.pdf'):
        return jsonify({'success': False, 'error': 'Choisissez un fichier PDF.'}), 400
    try:
        from services.theme_import import parse_theory_pdf
        parsed = parse_theory_pdf(up.stream)
    except Exception as exc:
        return jsonify({'success': False, 'error': f'Lecture du PDF impossible ({exc.__class__.__name__}).'}), 400
    if not parsed.get('title'):
        return jsonify({'success': False, 'error': "Ce PDF n'a pas la mise en page d'un dossier théorique."}), 400
    return jsonify({'success': True, 'theme': parsed})


# ---------------------------------------------------------------- décalage

def _origins(data):
    out = []
    for item in data.get('origins') or []:
        try:
            out.append((datetime.strptime(item['date'], '%Y-%m-%d').date(), int(item['period'])))
        except (KeyError, ValueError, TypeError):
            continue
    return out


def _signature(plan):
    core = [(m['planning_id'], m['from']['date'], m['from']['period'], m['to']['date'], m['to']['period']) for m in plan['moves']]
    core += [('merge', m['planning_id'], m['into_planning_id']) for m in plan['merged']]
    return hashlib.sha1(json.dumps(core, sort_keys=True).encode()).hexdigest()


def _compute_shift(data):
    from services.planning_shift import plan_shift
    mode = data.get('mode') if data.get('mode') in ('auto', 'next', 'week') else 'auto'
    return plan_shift(current_user, _origins(data), mode=mode, whole_day=bool(data.get('whole_day')))


@owner_tools_bp.route('/api/day/<date_str>')
@login_required
@owner_required
def day_lessons(date_str):
    """Cours planifiés d'une journée (pour proposer lesquels décaler)."""
    from models.planning import Planning
    from services.planning_shift import default_mode
    try:
        day = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'success': False, 'error': 'Date invalide.'}), 400
    classes = {c.id: c for c in Classroom.query.filter_by(user_id=current_user.id).all()}
    rows = Planning.query.filter_by(user_id=current_user.id, date=day).order_by(Planning.period_number).all()
    lessons = [{
        'period': p.period_number, 'title': (p.title or '').strip(),
        'classroom': f'{classes[p.classroom_id].name} · {classes[p.classroom_id].subject}',
        'mode': default_mode(classes[p.classroom_id]),
    } for p in rows if p.classroom_id in classes and ((p.title or '').strip() or (p.description or '').strip())]
    return jsonify({'success': True, 'date': day.isoformat(), 'lessons': lessons})


@owner_tools_bp.route('/api/shift/preview', methods=['POST'])
@login_required
@owner_required
def shift_preview():
    from services.planning_shift import ShiftError
    try:
        plan = _compute_shift(request.get_json(silent=True) or {})
    except ShiftError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    return jsonify({'success': True, 'plan': plan, 'signature': _signature(plan)})


@owner_tools_bp.route('/api/shift/apply', methods=['POST'])
@login_required
@owner_required
def shift_apply():
    from services.planning_shift import ShiftError, apply_shift
    data = request.get_json(silent=True) or {}
    try:
        plan = _compute_shift(data)
        if _signature(plan) != data.get('signature'):
            return jsonify({'success': False, 'error': 'Les planifications ont changé depuis l’aperçu. Recommencez.'}), 409
        result = apply_shift(current_user, plan)
    except ShiftError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    return jsonify({'success': True, **result})


# ---------------------------------------------------------------- fiche d'objectifs

def _objectives_pdf(source):
    """Construit la fiche à partir des paramètres (query string ou JSON).
    Retourne (octets, nom de fichier, classe)."""
    from services.objectives_pdf import build_objectives_pdf

    def val(key, default=None):
        value = source.get(key, default)
        return default if value is None else value

    classroom = _classroom(int(val('classroom_id', 0) or 0))
    theme = _theme(int(val('theme_id', 0) or 0))

    def pick(key):
        raw = val(key, '')
        items = raw if isinstance(raw, list) else str(raw).split(',')
        wanted = {int(x) for x in items if str(x).strip().isdigit()}
        return [n for n in theme.notions if n.get('n') in wanted]

    today = current_user.get_local_datetime().date()
    pdf = build_objectives_pdf(
        theme, classroom.name, pick('notions'),
        date_label=today.strftime('%d.%m.%Y'),
        heading=str(val('heading', 'Objectifs') or 'Objectifs')[:60],
        show_objectives=str(val('objectives', '1')) not in ('0', 'False', 'false'),
        show_exercises=str(val('exercises', '1')) not in ('0', 'False', 'false'),
        upcoming=pick('upcoming'),
    )
    name = f'Objectifs - {classroom.name} - {theme.label}.pdf'.replace('/', '-')
    return pdf, name, classroom


@owner_tools_bp.route('/api/objectifs/attach', methods=['POST'])
@login_required
@owner_required
def attach_objectives():
    """Crée la fiche d'objectifs et la joint au cours (fichier éphémère, comme un PDF
    déposé à la main : supprimé le lendemain du cours)."""
    from datetime import timedelta
    from models.planning import EphemeralFile, Planning, PlanningResource
    data = request.get_json(silent=True) or {}
    try:
        day = datetime.strptime(data.get('date') or '', '%Y-%m-%d').date()
        period = int(data.get('period'))
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Cours introuvable.'}), 400
    pdf, name, classroom = _objectives_pdf(data)
    planning = Planning.query.filter_by(user_id=current_user.id, date=day, period_number=period).first()
    if planning is None:
        planning = Planning(user_id=current_user.id, date=day, period_number=period, classroom_id=classroom.id,
                            title='', description='')
        db.session.add(planning)
        db.session.flush()
    elif planning.classroom_id != classroom.id:
        return jsonify({'success': False, 'error': "Ce créneau est planifié pour une autre classe."}), 409

    eph = EphemeralFile(user_id=current_user.id, planning_id=planning.id, original_filename=name, file_type='pdf',
                        mime_type='application/pdf', file_size=len(pdf), expires_on=day + timedelta(days=1))
    try:
        import uuid
        from services.r2_storage import is_r2_enabled, upload_to_r2_key
        if is_r2_enabled():
            key = f'ephemeral/{current_user.id}/{uuid.uuid4()}.pdf'
            if upload_to_r2_key(pdf, key, 'application/pdf'):
                eph.r2_key = key
    except Exception:
        pass
    if not eph.r2_key:
        eph.file_content = pdf
    db.session.add(eph)
    db.session.flush()
    # Une fiche du même nom déjà jointe à ce cours est remplacée.
    for old in planning.resources.filter_by(resource_type='ephemeral', display_name=name).all():
        db.session.delete(old)
    resource = PlanningResource(planning_id=planning.id, resource_type='ephemeral', resource_id=eph.id,
                                display_name=name, display_icon='hourglass-half', status='linked',
                                position=planning.resources.count())
    db.session.add(resource)
    db.session.commit()
    return jsonify({'success': True, 'planning_id': planning.id, 'ephemeral_id': eph.id, 'name': name,
                    'url': f'/planning/ephemeral/{eph.id}'})


@owner_tools_bp.route('/objectifs.pdf')
@login_required
@owner_required
def objectives_pdf():
    """Fiche d'objectifs : notions choisies (`notions=1,2,3`), et éventuellement celles à
    venir (`upcoming=4,5`). `download=1` propose l'enregistrement au lieu de l'affichage."""
    pdf, name, _classroom_obj = _objectives_pdf(request.args)
    resp = make_response(pdf)
    resp.headers['Content-Type'] = 'application/pdf'
    disposition = 'attachment' if request.args.get('download') == '1' else 'inline'
    from urllib.parse import quote
    resp.headers['Content-Disposition'] = f"{disposition}; filename*=UTF-8''{quote(name)}"
    resp.headers['Cache-Control'] = 'private, no-store'
    return resp


__all__ = ['owner_tools_bp', 'exercise_code']
