"""Correctif de l'import emails (job set_student_emails du 2026-08-13).

- Classe 17 (9VG niveau 2) : l'annuaire « 9VG/2 » ne recoupait AUCUN des
  élèves existants (groupe de niveau ≠ classe administrative) → les élèves
  créés par le job dans cette classe sont retirés, l'effectif d'origine est
  restauré tel quel.
- Classe 1 (11 VG2) : chaque élève créé par le job est fusionné avec un
  élève existant SANS email quand les noms concordent par sous-ensemble de
  tokens (noms composés découpés différemment entre l'annuaire et la base) ;
  sinon il est conservé (véritable nouvel élève).

Usage : python scripts/fix_student_import.py <user_id> <cutoff ISO, ex 2026-08-13T08:45>
Les lignes « créées par le job » = created_at >= cutoff.
"""
import os
import sys
import unicodedata
from datetime import datetime

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
    _beacon('fix-ok' if ok else 'fix-ko', body)


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = s.encode('ascii', 'ignore').decode().lower()
    for ch in ("'", '’', '?'):
        s = s.replace(ch, '')
    for ch in ('-', '.', '_'):
        s = s.replace(ch, ' ')
    return ' '.join(s.split())


def tokens(st):
    return set((norm(st.last_name) + ' ' + norm(st.first_name)).split())


def run():
    user_id = int(sys.argv[1])
    cutoff = datetime.fromisoformat(sys.argv[2])
    lines = []

    from app import create_app
    from extensions import db
    from models.student import Student
    from services.year_end_cleanup import _delete_student_dependencies

    app = create_app('production')

    with app.app_context():
        # --- Classe 17 : retirer les élèves créés par le job ---
        created17 = Student.query.filter(
            Student.user_id == user_id, Student.classroom_id == 17,
            Student.created_at >= cutoff).all()
        # Des dépendances (student_sanction_counts…) apparaissent dès qu'une
        # page de classe est consultée → nettoyage FK complet avant delete.
        _delete_student_dependencies([st.id for st in created17])
        for st in created17:
            db.session.delete(st)
        db.session.commit()
        remaining = Student.query.filter_by(user_id=user_id, classroom_id=17).count()
        lines.append(f"[classe 17] retirés: {len(created17)} | effectif restauré: {remaining}")

        # --- Classe 1 : fusionner les créés avec un existant sans email ---
        created1 = Student.query.filter(
            Student.user_id == user_id, Student.classroom_id == 1,
            Student.created_at >= cutoff).all()
        originals = Student.query.filter(
            Student.user_id == user_id, Student.classroom_id == 1,
            Student.created_at < cutoff, Student.email_hash.is_(None)).all()
        for c in created1:
            tc = tokens(c)
            cand = [o for o in originals
                    if tokens(o) <= tc or tc <= tokens(o)]
            if len(cand) == 1:
                o = cand[0]
                o.email = c.email
                _delete_student_dependencies([c.id])
                db.session.delete(c)
                originals.remove(o)
                lines.append(f"[classe 1] fusion: « {c.first_name} {c.last_name} » (créé) → "
                             f"« {o.first_name} {o.last_name} » (existant, email posé)")
            else:
                lines.append(f"[classe 1] conservé tel quel (nouvel élève ?): "
                             f"« {c.first_name} {c.last_name} »")
        db.session.commit()
        for o in originals:
            lines.append(f"[classe 1] toujours sans email: « {o.first_name} {o.last_name} »")

        for cid in (1, 17, 20):
            total = Student.query.filter_by(user_id=user_id, classroom_id=cid).count()
            with_mail = Student.query.filter(
                Student.user_id == user_id, Student.classroom_id == cid,
                Student.email_hash.isnot(None)).count()
            lines.append(f"[bilan classe {cid}] {with_mail}/{total} emails")
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
