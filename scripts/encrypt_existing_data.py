#!/usr/bin/env python3
"""
Script de migration pour chiffrer les données existantes en base.

Usage:
    python scripts/encrypt_existing_data.py              # Mode dry-run (simulation)
    python scripts/encrypt_existing_data.py --execute    # Exécution réelle

Ce script:
1. Lit les données en clair de chaque table sensible
2. Chiffre les champs sensibles avec Fernet
3. Calcule les hash SHA-256 des emails
4. Met à jour les enregistrements en base

⚠️ IMPORTANT:
- Faites une sauvegarde de la base AVANT d'exécuter ce script
- Assurez-vous que ENCRYPTION_KEY est définie dans .env
- Exécutez d'abord en mode dry-run pour vérifier
"""
import os
import sys

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app import create_app
from extensions import db
from utils.encryption import encryption_engine
from sqlalchemy import text


def is_already_encrypted(value):
    """Heuristique pour détecter si une valeur est déjà chiffrée (base64 Fernet)."""
    if not value or not isinstance(value, str):
        return False
    # Les tokens Fernet commencent par 'gAAAAA'
    return value.startswith('gAAAAA') and len(value) > 100


def encrypt_table_fields(table_name, fields, email_fields=None, dry_run=True):
    """
    Chiffre les champs spécifiés d'une table.

    Args:
        table_name: Nom de la table SQL
        fields: Liste des noms de colonnes à chiffrer
        email_fields: Dict {colonne_email: colonne_hash} pour les emails
        dry_run: Si True, ne fait que simuler
    """
    email_fields = email_fields or {}

    print(f"\n{'='*50}")
    print(f"Table: {table_name}")
    print(f"{'='*50}")

    # Lire tous les enregistrements
    result = db.session.execute(text(f"SELECT id, {', '.join(fields)} FROM {table_name}"))
    rows = result.fetchall()
    columns = result.keys()

    print(f"  Enregistrements trouvés: {len(rows)}")

    encrypted_count = 0
    skipped_count = 0

    for row in rows:
        row_dict = dict(zip(columns, row))
        record_id = row_dict['id']
        updates = {}

        for field in fields:
            value = row_dict.get(field)
            if value is None:
                continue

            # Vérifier si déjà chiffré
            if is_already_encrypted(str(value)):
                skipped_count += 1
                continue

            # Chiffrer la valeur
            encrypted_value = encryption_engine.encrypt(str(value))
            updates[field] = encrypted_value

            # Si c'est un champ email, calculer le hash
            if field in email_fields:
                hash_column = email_fields[field]
                email_hash = encryption_engine.hash_email(str(value))
                updates[hash_column] = email_hash

        if updates:
            if dry_run:
                print(f"  [DRY-RUN] ID {record_id}: {len(updates)} champs à chiffrer")
            else:
                set_clauses = ', '.join([f"{k} = :val_{k}" for k in updates.keys()])
                params = {f"val_{k}": v for k, v in updates.items()}
                params['id'] = record_id
                db.session.execute(
                    text(f"UPDATE {table_name} SET {set_clauses} WHERE id = :id"),
                    params
                )
                encrypted_count += 1

    if not dry_run:
        db.session.commit()

    print(f"  Chiffrés: {encrypted_count} | Ignorés (déjà chiffrés): {skipped_count}")
    return encrypted_count


def main():
    dry_run = '--execute' not in sys.argv

    if dry_run:
        print("\n🔍 MODE DRY-RUN (simulation)")
        print("   Ajoutez --execute pour exécuter réellement\n")
    else:
        print("\n⚡ MODE EXÉCUTION RÉELLE")
        print("   Les données seront modifiées en base\n")
        response = input("   Confirmez (oui/non): ")
        if response.lower() != 'oui':
            print("   Annulé.")
            return

    app = create_app()

    with app.app_context():
        # Vérifier que le chiffrement est activé
        if not encryption_engine.is_enabled:
            print("❌ ERREUR: ENCRYPTION_KEY non définie dans .env")
            print("   Générez une clé avec: python scripts/generate_encryption_key.py")
            sys.exit(1)

        print("✅ Moteur de chiffrement initialisé")

        total = 0

        # 1. Students
        total += encrypt_table_fields(
            'students',
            ['first_name', 'last_name', 'email', 'date_of_birth',
             'parent_email_mother', 'parent_email_father', 'additional_info'],
            email_fields={'email': 'email_hash'},
            dry_run=dry_run
        )

        # 2. Parents
        total += encrypt_table_fields(
            'parents',
            ['first_name', 'last_name', 'email'],
            email_fields={'email': 'email_hash'},
            dry_run=dry_run
        )

        # 3. Attendance (comment uniquement)
        total += encrypt_table_fields(
            'attendance',
            ['comment'],
            dry_run=dry_run
        )

        # 4. Student Accommodations
        total += encrypt_table_fields(
            'student_accommodations',
            ['custom_name', 'custom_description', 'notes'],
            dry_run=dry_run
        )

        # 5. Sanction Templates
        total += encrypt_table_fields(
            'sanction_templates',
            ['name', 'description'],
            dry_run=dry_run
        )

        # 6. Sanction Options
        total += encrypt_table_fields(
            'sanction_options',
            ['description'],
            dry_run=dry_run
        )

        # 7. Student Sanction Records
        total += encrypt_table_fields(
            'student_sanction_records',
            ['notes'],
            dry_run=dry_run
        )

        # 8. Lesson Memos
        total += encrypt_table_fields(
            'lesson_memos',
            ['content'],
            dry_run=dry_run
        )

        # 9. Student Remarks
        total += encrypt_table_fields(
            'student_remarks',
            ['content'],
            dry_run=dry_run
        )

        # 10. Absence Justifications
        total += encrypt_table_fields(
            'absence_justifications',
            ['other_reason_text', 'teacher_response'],
            dry_run=dry_run
        )

        # 11. Student Info History
        total += encrypt_table_fields(
            'student_info_history',
            ['content'],
            dry_run=dry_run
        )

        # 12. Grades (title et comment)
        total += encrypt_table_fields(
            'grades',
            ['title', 'comment'],
            dry_run=dry_run
        )

        print(f"\n{'='*50}")
        print(f"Total enregistrements {'à chiffrer' if dry_run else 'chiffrés'}: {total}")
        print(f"{'='*50}")

        if dry_run:
            print("\n💡 Pour exécuter: python scripts/encrypt_existing_data.py --execute")


if __name__ == '__main__':
    main()
