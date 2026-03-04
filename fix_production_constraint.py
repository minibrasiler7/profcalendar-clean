"""
Script pour fixer la contrainte sur la VRAIE base de production Render
Ce script doit être exécuté sur Render via le shell
"""

import os
import psycopg
from urllib.parse import urlparse

def fix_constraint():
    # Utiliser DATABASE_URL de l'environnement (variable Render)
    database_url = os.environ.get('DATABASE_URL')

    if not database_url:
        print("❌ DATABASE_URL non définie")
        print("Ce script doit être exécuté sur Render avec:")
        print("  python fix_production_constraint.py")
        return False

    # IMPORTANT: psycopg n'accepte pas le préfixe +psycopg (utilisé par SQLAlchemy)
    # Convertir postgresql+psycopg:// en postgresql://
    if database_url.startswith('postgresql+psycopg://'):
        database_url = database_url.replace('postgresql+psycopg://', 'postgresql://')
        print("✅ URL convertie de SQLAlchemy vers format psycopg")

    # Afficher la DB (masquer le mot de passe)
    parsed = urlparse(database_url)
    db_display = f"{parsed.scheme}://***@{parsed.hostname}/{parsed.path.lstrip('/')}"
    print(f"Base de données: {db_display}")
    print()

    try:
        # Se connecter
        print("Connexion à la base de données...")
        conn = psycopg.connect(database_url)
        cur = conn.cursor()
        print("✅ Connecté")
        print()

        # 1. Vérifier la contrainte actuelle
        print("1. Vérification de la contrainte actuelle...")
        cur.execute("""
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'plannings'::regclass
            AND conname = '_classroom_or_mixed_group_planning'
        """)

        row = cur.fetchone()
        if row:
            print(f"   Contrainte trouvée: {row[0][:100]}...")
            if '(classroom_id IS NULL) AND (mixed_group_id IS NULL)' in row[0]:
                print("   ✅ Déjà à jour!")
                conn.close()
                return True
            else:
                print("   ⚠️  Ancienne version - mise à jour nécessaire")
        else:
            print("   ⚠️  Aucune contrainte trouvée")
        print()

        # 2. Supprimer l'ancienne contrainte
        print("2. Suppression de l'ancienne contrainte...")
        cur.execute("""
            ALTER TABLE plannings
            DROP CONSTRAINT IF EXISTS _classroom_or_mixed_group_planning
        """)
        print("   ✅ Supprimée")
        print()

        # 3. Créer la nouvelle contrainte
        print("3. Création de la nouvelle contrainte...")
        cur.execute("""
            ALTER TABLE plannings
            ADD CONSTRAINT _classroom_or_mixed_group_planning
            CHECK (
                (classroom_id IS NULL AND mixed_group_id IS NULL) OR
                (classroom_id IS NOT NULL AND mixed_group_id IS NULL) OR
                (classroom_id IS NULL AND mixed_group_id IS NOT NULL)
            )
        """)
        print("   ✅ Créée")
        print()

        # 4. Commit
        print("4. Commit...")
        conn.commit()
        print("   ✅ Committé")
        print()

        # 5. Vérification
        print("5. Vérification...")
        cur.execute("""
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'plannings'::regclass
            AND conname = '_classroom_or_mixed_group_planning'
        """)
        row = cur.fetchone()
        if row:
            print(f"   Nouvelle définition: {row[0][:150]}...")
        print()

        # 6. Test
        print("6. Test d'insertion...")
        try:
            cur.execute("""
                INSERT INTO plannings
                (user_id, classroom_id, mixed_group_id, date, period_number, title, description, created_at, updated_at)
                VALUES (1, NULL, NULL, '2099-12-31', 99, 'TEST', 'Test', NOW(), NOW())
                RETURNING id
            """)
            test_row = cur.fetchone()
            test_id = test_row[0]
            print(f"   ✅ Insertion réussie (ID: {test_id})")

            # Nettoyage
            cur.execute(f"DELETE FROM plannings WHERE id = {test_id}")
            conn.commit()
            print("   ✅ Test nettoyé")
        except Exception as e:
            print(f"   ❌ Test échoué: {e}")
            conn.rollback()
            conn.close()
            return False

        print()
        print("=" * 60)
        print("✅ MIGRATION RÉUSSIE!")
        print("=" * 60)

        conn.close()
        return True

    except Exception as e:
        print()
        print("=" * 60)
        print("❌ ERREUR")
        print("=" * 60)
        print(f"Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    import sys
    success = fix_constraint()
    sys.exit(0 if success else 1)
