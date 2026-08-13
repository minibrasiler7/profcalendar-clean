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
import sys
import json
import base64
import unicodedata


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = s.encode('ascii', 'ignore').decode().lower()
    for ch in ("'", '’', '?'):
        s = s.replace(ch, '')
    for ch in ('-', '.', '_'):
        s = s.replace(ch, ' ')
    return ' '.join(s.split())


def main():
    if len(sys.argv) != 3:
        print("Usage: set_student_emails.py <user_id> <base64 JSON>")
        sys.exit(2)
    user_id = int(sys.argv[1])
    data = json.loads(base64.b64decode(sys.argv[2]).decode('utf-8'))

    from app import app
    from extensions import db
    from models.student import Student
    from models.classroom import Classroom

    with app.app_context():
        for cid_str, entries in data.items():
            cid = int(cid_str)
            classroom = Classroom.query.filter_by(id=cid, user_id=user_id).first()
            if not classroom:
                print(f"[classe {cid}] introuvable pour user {user_id} — ignorée")
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
            print(f"[{classroom.name}] emails mis à jour: {updated} | déjà corrects: {already} | "
                  f"élèves créés: {created} | en base sans correspondance: {len(unmatched_db)}")
            for k in sorted(unmatched_db):
                print(f"    ⚠︎ dans ProfCalendar mais absent de la liste: {k[1].title()} {k[0].title()}")


if __name__ == '__main__':
    main()
