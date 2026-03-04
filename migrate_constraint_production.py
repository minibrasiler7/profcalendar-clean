"""
Script de migration pour mettre à jour la contrainte _classroom_or_mixed_group_planning
sur la base de données de PRODUCTION.

Ce script doit être exécuté UNE SEULE FOIS après le déploiement sur Render.

Usage:
    python migrate_constraint_production.py
"""

from app import app, db
import sys

def migrate_constraint():
    """Migrer la contrainte vers la syntaxe explicite"""
    print("=" * 80)
    print("MIGRATION DE LA CONTRAINTE _classroom_or_mixed_group_planning")
    print("=" * 80)
    print()

    with app.app_context():
        try:
            # Étape 1: Vérifier la contrainte actuelle
            print("1. Vérification de la contrainte actuelle...")
            result = db.session.execute(db.text("""
                SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conrelid = 'plannings'::regclass
                AND conname = '_classroom_or_mixed_group_planning'
            """))

            row = result.fetchone()
            if row:
                print(f"   Contrainte trouvée: {row[0][:100]}...")

                # Vérifier si c'est déjà la nouvelle version
                if '(classroom_id IS NULL) AND (mixed_group_id IS NULL)' in row[0]:
                    print("   ✅ La contrainte est déjà à jour (syntaxe explicite)")
                    print()
                    print("Aucune migration nécessaire!")
                    return True
                else:
                    print("   ⚠️  Ancienne version détectée (doit être migrée)")
            else:
                print("   ⚠️  Aucune contrainte trouvée (sera créée)")

            print()

            # Étape 2: Supprimer l'ancienne contrainte
            print("2. Suppression de l'ancienne contrainte...")
            db.session.execute(db.text("""
                ALTER TABLE plannings
                DROP CONSTRAINT IF EXISTS _classroom_or_mixed_group_planning
            """))
            print("   ✅ Contrainte supprimée")
            print()

            # Étape 3: Créer la nouvelle contrainte avec syntaxe explicite
            print("3. Création de la nouvelle contrainte...")
            db.session.execute(db.text("""
                ALTER TABLE plannings
                ADD CONSTRAINT _classroom_or_mixed_group_planning
                CHECK (
                    (classroom_id IS NULL AND mixed_group_id IS NULL) OR
                    (classroom_id IS NOT NULL AND mixed_group_id IS NULL) OR
                    (classroom_id IS NULL AND mixed_group_id IS NOT NULL)
                )
            """))
            print("   ✅ Nouvelle contrainte créée")
            print()

            # Étape 4: Commit
            print("4. Commit des changements...")
            db.session.commit()
            print("   ✅ Changements commitées")
            print()

            # Étape 5: Vérification
            print("5. Vérification de la nouvelle contrainte...")
            result = db.session.execute(db.text("""
                SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conrelid = 'plannings'::regclass
                AND conname = '_classroom_or_mixed_group_planning'
            """))

            row = result.fetchone()
            if row:
                print(f"   Définition: {row[0]}")
                print()

            # Étape 6: Test
            print("6. Test d'insertion avec les deux colonnes NULL...")
            from models.planning import Planning
            from datetime import date

            test_planning = Planning(
                user_id=1,
                classroom_id=None,
                mixed_group_id=None,
                date=date(2099, 12, 31),  # Date lointaine pour éviter les conflits
                period_number=99,
                title='TEST MIGRATION',
                description='Ce planning sera supprimé immédiatement'
            )

            db.session.add(test_planning)
            db.session.flush()
            test_id = test_planning.id
            print(f"   ✅ Test réussi! (ID: {test_id})")

            # Nettoyage du test
            db.session.delete(test_planning)
            db.session.commit()
            print("   ✅ Planning de test nettoyé")
            print()

            print("=" * 80)
            print("✅ MIGRATION RÉUSSIE!")
            print("=" * 80)
            print()
            print("La contrainte a été mise à jour avec succès.")
            print("Les périodes 'Autre' (sans classe ni groupe) peuvent maintenant être créées.")
            print()

            return True

        except Exception as e:
            print()
            print("=" * 80)
            print("❌ ERREUR LORS DE LA MIGRATION")
            print("=" * 80)
            print(f"Erreur: {e}")
            print()
            db.session.rollback()

            import traceback
            print("Traceback complet:")
            traceback.print_exc()
            print()

            return False

if __name__ == '__main__':
    print()
    print("Ce script va modifier la contrainte CHECK sur la table 'plannings'")
    print("dans la base de données de PRODUCTION.")
    print()

    # Afficher l'environnement
    with app.app_context():
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
        # Masquer le mot de passe pour la sécurité
        if '@' in db_uri:
            parts = db_uri.split('@')
            db_display = parts[0].split(':')[0] + ':***@' + parts[1]
        else:
            db_display = db_uri

        print(f"Base de données: {db_display}")
        print()

    response = input("Confirmer la migration ? (oui/non): ")

    if response.lower() in ['oui', 'yes', 'y', 'o']:
        print()
        success = migrate_constraint()
        sys.exit(0 if success else 1)
    else:
        print()
        print("Migration annulée.")
        sys.exit(0)
