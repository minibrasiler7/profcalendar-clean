"""
Route de debug pour diagnostiquer le problème de contrainte sur production
"""
from flask import Blueprint, jsonify
from extensions import db
from datetime import datetime

debug_bp = Blueprint('debug', __name__)

@debug_bp.route('/debug/constraint-info', methods=['GET'])
def constraint_info():
    """Affiche des informations de debug sur la contrainte"""
    try:
        # 1. Version du code
        import os
        git_commit = os.popen('git rev-parse --short HEAD 2>/dev/null').read().strip()

        # 2. Contrainte en DB
        result = db.session.execute(db.text("""
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'plannings'::regclass
            AND conname = '_classroom_or_mixed_group_planning'
        """))
        row = result.fetchone()
        constraint_def = row[0] if row else "NOT FOUND"

        # 3. Test d'insertion
        test_result = "NOT TESTED"
        try:
            db.session.execute(db.text("""
                INSERT INTO plannings
                (user_id, classroom_id, mixed_group_id, date, period_number, title, description, created_at, updated_at)
                VALUES (1, NULL, NULL, '2099-12-31', 98, 'DEBUG TEST', 'Test', NOW(), NOW())
                RETURNING id
            """))
            test_row = db.session.execute(db.text("SELECT currval('plannings_id_seq')")).fetchone()
            test_id = test_row[0] if test_row else None

            # Nettoyer
            if test_id:
                db.session.execute(db.text(f"DELETE FROM plannings WHERE id = {test_id}"))

            db.session.commit()
            test_result = "SUCCESS"
        except Exception as e:
            db.session.rollback()
            test_result = f"FAILED: {str(e)[:200]}"

        # 4. Configuration
        from flask import current_app
        db_uri = current_app.config.get('SQLALCHEMY_DATABASE_URI', '')
        # Masquer le mot de passe
        if '@' in db_uri:
            parts = db_uri.split('@')
            db_display = parts[0].split(':')[0] + ':***@' + parts[1]
        else:
            db_display = db_uri

        return jsonify({
            'timestamp': datetime.now().isoformat(),
            'git_commit': git_commit or 'UNKNOWN',
            'database': db_display,
            'constraint_definition': constraint_def,
            'constraint_type': 'EXPLICIT' if '(classroom_id IS NULL) AND (mixed_group_id IS NULL)' in constraint_def else 'OLD/OTHER',
            'test_insertion': test_result,
            'code_version': {
                'save_planning_route': 'CHECKING...',
                'check': 'Route /planning/save_planning uses explicit None conversion'
            }
        })

    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500
