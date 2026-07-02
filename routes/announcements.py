"""Annonces de classe (enseignant -> parents).

Un enseignant publie une annonce sur une de ses classes ; elle apparaît dans le
portail parent et, en option, déclenche une notification email aux parents des
élèves de la classe (via Resend, en tâche de fond pour ne pas bloquer la requête).
"""
import re
import html as _html
import threading

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from extensions import db
from models.announcement import Announcement
from models.classroom import Classroom
from models.student import Student
from routes.evaluations import user_can_access_classroom

announcements_bp = Blueprint('announcements', __name__, url_prefix='/api/announcements')

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _valid_email(value):
    return bool(value) and bool(_EMAIL_RE.match(value.strip()))


def _serialize(a, author=None):
    return {
        'id': a.id,
        'title': a.title,
        'content': a.content,
        'author': author if author is not None else (a.user.username if a.user else ''),
        'email_sent': bool(a.email_sent),
        'email_recipients': a.email_recipients or 0,
        'created_at': a.created_at.strftime('%d.%m.%Y à %H:%M') if a.created_at else '',
    }


@announcements_bp.route('/classroom/<int:classroom_id>', methods=['GET'])
@login_required
def list_announcements(classroom_id):
    """Liste les annonces d'une classe (vue enseignant)."""
    if not user_can_access_classroom(current_user.id, classroom_id):
        return jsonify({'success': False, 'message': 'Accès refusé'}), 403
    items = (Announcement.query
             .filter_by(classroom_id=classroom_id)
             .order_by(Announcement.created_at.desc())
             .all())
    return jsonify({'success': True, 'announcements': [_serialize(a) for a in items]})


@announcements_bp.route('/classroom/<int:classroom_id>', methods=['POST'])
@login_required
def create_announcement(classroom_id):
    """Crée une annonce. Notifie les parents par email si demandé."""
    if not user_can_access_classroom(current_user.id, classroom_id):
        return jsonify({'success': False, 'message': 'Accès refusé'}), 403

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()
    notify = bool(data.get('notify_email', False))

    if not title or not content:
        return jsonify({'success': False, 'message': 'Le titre et le message sont obligatoires.'}), 400
    if len(title) > 255:
        title = title[:255]

    classroom = Classroom.query.get_or_404(classroom_id)

    # Destinataires : emails des parents (mère + père) des élèves de la classe,
    # dédupliqués et validés. Les emails sont chiffrés -> déchiffrés côté Python.
    recipients = []
    if notify:
        seen = set()
        for s in Student.query.filter_by(classroom_id=classroom_id).all():
            for em in (s.parent_email_mother, s.parent_email_father):
                if _valid_email(em):
                    key = em.strip().lower()
                    if key not in seen:
                        seen.add(key)
                        recipients.append(em.strip())

    announcement = Announcement(
        classroom_id=classroom_id,
        user_id=current_user.id,
        title=title,
        content=content,
        email_sent=bool(notify and recipients),
        email_recipients=len(recipients),
    )
    db.session.add(announcement)
    db.session.commit()

    if notify and recipients:
        _send_announcement_emails_async(
            recipients, classroom.name, current_user.username, title, content
        )

    return jsonify({'success': True, 'announcement': _serialize(announcement, author=current_user.username)})


@announcements_bp.route('/<int:announcement_id>', methods=['DELETE'])
@login_required
def delete_announcement(announcement_id):
    """Supprime une annonce (enseignant ayant accès à la classe)."""
    announcement = Announcement.query.get_or_404(announcement_id)
    if not user_can_access_classroom(current_user.id, announcement.classroom_id):
        return jsonify({'success': False, 'message': 'Accès refusé'}), 403
    db.session.delete(announcement)
    db.session.commit()
    return jsonify({'success': True})


def _send_announcement_emails_async(recipients, class_name, teacher, title, content):
    """Envoie la notification email en tâche de fond.

    send_email() ne dépend que de variables d'environnement (Resend) — aucun
    contexte Flask/DB n'est requis dans le thread.
    """
    from services.email_service import send_email

    safe_title = _html.escape(title)
    safe_content = _html.escape(content).replace('\n', '<br>')
    safe_class = _html.escape(class_name or '')
    safe_teacher = _html.escape(teacher or '')
    subject = f"[{class_name}] {title}"
    body = f"""<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#4F46E5;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;">
    <div style="font-size:13px;opacity:.9;">📣 Annonce de classe · {safe_class}</div>
    <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;">{safe_title}</h1>
  </div>
  <div style="background:#ffffff;border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
    <p style="color:#111827;font-size:15px;line-height:1.6;margin:0;">{safe_content}</p>
    <p style="color:#6B7280;font-size:13px;margin:24px 0 0;">— {safe_teacher}, via ProfCalendar</p>
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">
    Vous recevez cet email car votre enfant est inscrit dans cette classe sur ProfCalendar.
  </p>
</div>"""

    def _worker():
        for to_email in recipients:
            try:
                send_email(to_email, subject, body)
            except Exception:
                pass

    threading.Thread(target=_worker, daemon=True).start()
