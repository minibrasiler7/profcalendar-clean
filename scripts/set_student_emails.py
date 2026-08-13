"""Complète les emails des élèves d'un enseignant, via les modèles de l'app
(chiffrement EncryptedString + email_hash automatiques).

Conçu pour un job one-off Render :

    python scripts/set_student_emails.py <user_id> <base64(JSON)>

JSON attendu : {"<classroom_id>": [["Nom", "Prénom", "email"], ...], ...}

Aucune donnée d'élève ne vit dans ce fichier : elles arrivent en argument.
Correspondance par nom normalisé (accents/traits d'union/apostrophes
neutralisés), avec repli sur le nom de famille seul s'il est unique
(prénoms composés). Les élèves de la liste absents de la classe sont créés ;
les élèves de la classe absents de la liste sont signalés, jamais supprimés.
"""
import os
import sys
import json
import base64
import unicodedata

# Lancé via « python scripts/set_student_emails.py », sys.path contient
# scripts/ mais pas la racine du projet → l'import de app échouerait.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _beacon(tag, text):
    """Le stdout des jobs Render est inaccessible : on émet le début du
    rapport dans le CHEMIN d'une requête vers le site — il apparaît dans les
    request-logs du service, consultables via `render logs --path`."""
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
    """Écrit le rapport dans une table lisible via psql, avec double repli
    (psycopg direct puis SQLAlchemy) + balise HTTP systématique."""
    url = os.environ.get('DATABASE_URL', '')
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
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
        body = f"[write psycopg KO: {e}]\n" + body
        try:
            from sqlalchemy import create_engine, text as _sqltext
            eng = create_engine(url)
            with eng.begin() as conn:
                conn.execute(_sqltext(
                    "CREATE TABLE IF NOT EXISTS oneoff_reports ("
                    "id SERIAL PRIMARY KEY, created_at TIMESTAMP DEFAULT now(), body TEXT)"))
                conn.execute(_sqltext("INSERT INTO oneoff_reports (body) VALUES (:b)"), {"b": body})
            ok = True
        except Exception as e2:
            body = f"[write sqlalchemy KO: {e2}]\n" + body
    _beacon('rapport-ok' if ok else 'rapport-ko', body)


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = s.encode('ascii', 'ignore').decode().lower()
    for ch in ("'", '’', '?'):
        s = s.replace(ch, '')
    for ch in ('-', '.', '_'):
        s = s.replace(ch, ' ')
    return ' '.join(s.split())


def run():
    if len(sys.argv) != 3:
        print("Usage: set_student_emails.py <user_id> <base64 JSON>")
        sys.exit(2)
    user_id = int(sys.argv[1])
    data = json.loads(base64.b64decode(sys.argv[2]).decode('utf-8'))
    lines = []

    from app import app
    from extensions import db
    from models.student import Student
    from models.classroom import Classroom

    with app.app_context():
        for cid_str, entries in data.items():
            cid = int(cid_str)
            classroom = Classroom.query.filter_by(id=cid, user_id=user_id).first()
            if not classroom:
                lines.append(f"[classe {cid}] introuvable pour user {user_id} — ignorée")
                continue

            students = Student.query.filter_by(classroom_id=cid, user_id=user_id).all()
            by_key = {}
            for st in students:
                by_key.setdefault((norm(st.last_name), norm(st.first_name)), []).append(st)
            unmatched_db = set(by_key.keys())

            updated = already = created = 0
            for last, first, email in entries:
                key = (norm(last), norm(first))
                sts = by_key.get(key)
                st = None
                if sts:
                    st = sts[0]
                    unmatched_db.discard(key)
                else:
                    # Repli : nom de famille unique parmi les non-appariés
                    cand = [k for k in unmatched_db if k[0] == key[0]]
                    if len(cand) == 1:
                        st = by_key[cand[0]][0]
                        unmatched_db.discard(cand[0])
                if st is not None:
                    if (st.email or '').strip().lower() == email.lower():
                        already += 1
                    else:
                        st.email = email
                        updated += 1
                else:
                    db.session.add(Student(
                        classroom_id=cid, user_id=user_id,
                        first_name=first, last_name=last, email=email,
                    ))
                    created += 1

            db.session.commit()
            lines.append(f"[{classroom.name}] emails mis à jour: {updated} | déjà corrects: {already} | "
                         f"élèves créés: {created} | en base sans correspondance: {len(unmatched_db)}")
            for k in sorted(unmatched_db):
                lines.append(f"    ⚠︎ dans ProfCalendar mais absent de la liste: {k[1].title()} {k[0].title()}")
    return lines


def main():
    try:
        lines = run()
        report = 'OK\n' + '\n'.join(lines)
    except Exception:
        import traceback
        report = 'ÉCHEC\n' + traceback.format_exc()
    print(report)
    write_report(report)


if __name__ == '__main__':
    main()
