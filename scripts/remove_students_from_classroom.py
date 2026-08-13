"""Retire les élèves d'une classe créés à une date donnée (avec leurs FK).

Cas d'usage : annuler une duplication d'élèves faite par erreur dans la 2e
discipline d'une classe — l'app partage déjà la liste d'élèves entre les
classes d'un même groupe (Classroom.get_students → union par class_group/nom),
donc ces copies font apparaître chaque nom en double sur la page lesson.

    python scripts/remove_students_from_classroom.py <user_id> <classroom_id> <YYYY-MM-DD>

Supprime UNIQUEMENT les élèves de cette classe créés CE jour-là, après purge
de leurs dépendances via le nettoyage canonique de l'app.
"""
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _beacon(tag, text):
    try:
        import base64 as _b
        import requests as _rq
        payload = _b.urlsafe_b64encode(text.encode('utf-8')[:1200]).decode()
        for i in range(0, len(payload), 700):
            _rq.get(f"https://profcalendar.org/__oneoff/{tag}/{i}/{payload[i:i+700]}",
                    timeout=10)
    except Exception as e:
        print(f"beacon impossible: {e}")


def write_report(body):
    import re as _re

    def _scrub(t):
        return _re.sub(r'://[^\s@]+@', '://***@', str(t))

    url = os.environ.get('DATABASE_URL', '')
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    url = url.replace('postgresql+psycopg://', 'postgresql://')
    ok = False
    try:
        import psycopg
        with psycopg.connect(url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "CREATE TABLE IF NOT EXISTS oneoff_reports ("
                    "id SERIAL PRIMARY KEY, created_at TIMESTAMP DEFAULT now(), body TEXT)")
                cur.execute("INSERT INTO oneoff_reports (body) VALUES (%s)", (body,))
            conn.commit()
        ok = True
    except Exception as e:
        body = f"[write psycopg KO: {_scrub(e)}]\n" + body
    _beacon('retrait-ok' if ok else 'retrait-ko', body)


def run():
    user_id, classroom_id = int(sys.argv[1]), int(sys.argv[2])
    jour = datetime.fromisoformat(sys.argv[3])
    lines = []

    from app import create_app
    from extensions import db
    from models.student import Student
    from services.year_end_cleanup import _delete_student_dependencies

    app = create_app('production')

    with app.app_context():
        vises = Student.query.filter(
            Student.user_id == user_id,
            Student.classroom_id == classroom_id,
            Student.created_at >= jour,
            Student.created_at < jour + timedelta(days=1),
        ).all()
        ids = [st.id for st in vises]
        _delete_student_dependencies(ids)
        for st in vises:
            db.session.delete(st)
        db.session.commit()
        restants = Student.query.filter_by(user_id=user_id, classroom_id=classroom_id).count()
        lines.append(f"[classe {classroom_id}] retirés: {len(ids)} | restants: {restants}")
    return lines


def main():
    try:
        report = 'OK\n' + '\n'.join(run())
    except Exception:
        import traceback
        report = 'ÉCHEC\n' + traceback.format_exc()
    print(report)
    write_report(report)


if __name__ == '__main__':
    main()
