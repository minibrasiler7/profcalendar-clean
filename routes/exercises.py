from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_required, current_user
from extensions import db
from models.exercise import Exercise, ExerciseBlock
from models.exercise_progress import ExercisePublication, StudentExerciseAttempt, StudentBlockAnswer
from models.rpg import StudentRPGProfile, Badge, StudentBadge
from models.classroom import Classroom
from models.user import User
from datetime import datetime
from routes import teacher_required

exercises_bp = Blueprint('exercises', __name__, url_prefix='/exercises')


@exercises_bp.route('/')
@login_required
@teacher_required
def index():
    """Liste des exercices de l'enseignant"""
    exercises = Exercise.query.filter_by(user_id=current_user.id)\
        .order_by(Exercise.updated_at.desc()).all()

    # Récupérer les classes de l'enseignant pour le filtre
    classrooms = Classroom.query.filter_by(user_id=current_user.id).all()

    return render_template('exercises/list.html',
                           exercises=exercises,
                           classrooms=classrooms)


@exercises_bp.route('/create')
@login_required
@teacher_required
def create():
    """Page de l'éditeur d'exercices (L'Atelier)"""
    classrooms = Classroom.query.filter_by(user_id=current_user.id).all()
    return render_template('exercises/editor.html',
                           exercise=None,
                           classrooms=classrooms)


@exercises_bp.route('/<int:exercise_id>/edit')
@login_required
@teacher_required
def edit(exercise_id):
    """Modifier un exercice existant"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        flash('Vous n\'avez pas accès à cet exercice.', 'error')
        return redirect(url_for('exercises.index'))

    classrooms = Classroom.query.filter_by(user_id=current_user.id).all()
    return render_template('exercises/editor.html',
                           exercise=exercise,
                           classrooms=classrooms)


@exercises_bp.route('/save', methods=['POST'])
@login_required
@teacher_required
def save():
    """Sauvegarder un exercice (AJAX)"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Données manquantes'}), 400

    exercise_id = data.get('id')

    try:
        if exercise_id:
            # Mise à jour
            exercise = Exercise.query.get(exercise_id)
            if not exercise or exercise.user_id != current_user.id:
                return jsonify({'success': False, 'message': 'Exercice non trouvé'}), 404
        else:
            # Création
            exercise = Exercise(user_id=current_user.id)
            db.session.add(exercise)

        # Check if this is a folder-only update (only id + folder_id provided)
        is_folder_only_update = exercise_id and 'folder_id' in data and 'blocks' not in data and 'title' not in data

        if is_folder_only_update:
            # Only update folder association, don't touch anything else
            exercise.folder_id = data['folder_id'] if data['folder_id'] else None
            exercise.updated_at = datetime.utcnow()
        else:
            # Full update: update all fields
            exercise.title = data.get('title', exercise.title if exercise_id else 'Sans titre')
            exercise.description = data.get('description', exercise.description if exercise_id else '')
            exercise.subject = data.get('subject', exercise.subject if exercise_id else '')
            exercise.level = data.get('level', exercise.level if exercise_id else '')
            exercise.accept_typos = data.get('accept_typos', exercise.accept_typos if exercise_id else False)
            exercise.bonus_gold_threshold = data.get('bonus_gold_threshold', exercise.bonus_gold_threshold if exercise_id else 80)
            exercise.badge_threshold = data.get('badge_threshold', exercise.badge_threshold if exercise_id else 100)

            exercise.is_draft = data.get('is_draft', True)
            if 'folder_id' in data:
                exercise.folder_id = data['folder_id'] if data['folder_id'] else None
            exercise.updated_at = datetime.utcnow()

            # Sauvegarder d'abord pour obtenir l'ID
            db.session.flush()

            # Gérer les blocs
            blocks_data = data.get('blocks', [])
            existing_block_ids = set()

            for i, block_data in enumerate(blocks_data):
                block_id = block_data.get('id')
                if block_id:
                    # Mise à jour du bloc existant
                    block = ExerciseBlock.query.get(block_id)
                    if block and block.exercise_id == exercise.id:
                        existing_block_ids.add(block_id)
                    else:
                        block = None

                if not block_id or not block:
                    # Nouveau bloc
                    block = ExerciseBlock(exercise_id=exercise.id)
                    db.session.add(block)

                block.block_type = block_data.get('block_type', 'qcm')
                block.position = i
                block.title = block_data.get('title', '')
                block.duration = block_data.get('duration')
                block.config_json = block_data.get('config_json', {})
                block.points = block_data.get('points', 10)

                if not block_id:
                    db.session.flush()
                    existing_block_ids.add(block.id)

            # Supprimer les blocs qui ne sont plus dans la liste
            if exercise_id:
                for old_block in exercise.blocks:
                    if old_block.id not in existing_block_ids:
                        db.session.delete(old_block)

            # Recalculer les points totaux
            exercise.calculate_total_points()

        db.session.commit()

        return jsonify({
            'success': True,
            'exercise_id': exercise.id,
            'message': 'Exercice sauvegardé'
        })

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erreur sauvegarde exercice: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@exercises_bp.route('/folders', methods=['GET'])
@login_required
@teacher_required
def list_folders():
    """Lister les dossiers du gestionnaire de fichiers de l'utilisateur"""
    try:
        from models.file_manager import FileFolder
        folders = FileFolder.query.filter_by(user_id=current_user.id).order_by(FileFolder.name).all()
        return jsonify({
            'success': True,
            'folders': [{
                'id': f.id,
                'name': f.name,
                'parent_id': f.parent_id,
                'color': f.color,
            } for f in folders]
        })
    except Exception as e:
        return jsonify({'success': True, 'folders': []})


@exercises_bp.route('/folders-and-classes', methods=['GET'])
@login_required
@teacher_required
def list_folders_and_classes():
    """Lister les dossiers ET les classes de l'utilisateur (pour le picker de la page liste)"""
    try:
        from models.file_manager import FileFolder
        from models.classroom import Classroom
        folders = FileFolder.query.filter_by(user_id=current_user.id).order_by(FileFolder.name).all()
        classrooms = Classroom.query.filter_by(user_id=current_user.id).order_by(Classroom.name).all()
        return jsonify({
            'success': True,
            'folders': [{'id': f.id, 'name': f.name, 'parent_id': f.parent_id, 'color': f.color} for f in folders],
            'classrooms': [{'id': c.id, 'name': c.name, 'subject': c.subject} for c in classrooms]
        })
    except Exception:
        return jsonify({'success': True, 'folders': [], 'classrooms': []})


@exercises_bp.route('/publish-to-class', methods=['POST'])
@login_required
@teacher_required
def publish_to_class():
    """Publier un exercice dans une classe (via drag & drop du file manager)"""
    data = request.get_json(silent=True) or {}
    exercise_id = data.get('exercise_id')
    classroom_id = data.get('classroom_id')

    if not exercise_id or not classroom_id:
        return jsonify({'success': False, 'error': 'exercise_id et classroom_id requis'}), 400

    # Convertir en int pour éviter les erreurs SQL de type cast (VARCHAR vs INTEGER)
    try:
        exercise_id = int(exercise_id)
        classroom_id = int(classroom_id)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'IDs invalides'}), 400

    exercise = Exercise.query.get(exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Exercice non trouvé'}), 404

    from models.exercise_progress import ExercisePublication
    from datetime import datetime

    # Vérifier si déjà publié
    existing = ExercisePublication.query.filter_by(
        exercise_id=exercise.id,
        classroom_id=classroom_id
    ).first()

    if existing:
        return jsonify({'success': True, 'message': 'Exercice déjà dans cette classe'})

    pub = ExercisePublication(
        exercise_id=exercise.id,
        classroom_id=classroom_id,
        published_by=current_user.id,
        published_at=datetime.utcnow(),
        mode='classique',
    )
    db.session.add(pub)

    # Marquer comme publié et lier à la classe
    exercise.is_published = True
    exercise.is_draft = False
    exercise.classroom_id = int(classroom_id)

    db.session.commit()
    return jsonify({'success': True, 'message': 'Exercice publié'})


@exercises_bp.route('/unlink-from-class', methods=['POST'])
@login_required
@teacher_required
def unlink_from_class():
    """Retirer un exercice d'une classe (sans le supprimer)"""
    data = request.get_json(silent=True) or {}
    exercise_id = data.get('exercise_id')
    classroom_id = data.get('classroom_id')

    if not exercise_id or not classroom_id:
        return jsonify({'success': False, 'error': 'exercise_id et classroom_id requis'}), 400

    try:
        exercise_id = int(exercise_id)
        classroom_id = int(classroom_id)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'IDs invalides'}), 400

    exercise = Exercise.query.get(exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Exercice non trouvé'}), 404

    # Retirer le lien avec la classe
    if exercise.classroom_id == classroom_id:
        exercise.classroom_id = None

    # Supprimer aussi l'ExercisePublication si elle existe
    try:
        from models.exercise_progress import ExercisePublication
        pub = ExercisePublication.query.filter_by(
            exercise_id=exercise_id,
            classroom_id=classroom_id
        ).first()
        if pub:
            db.session.delete(pub)
    except Exception:
        pass

    db.session.commit()
    return jsonify({'success': True, 'message': 'Exercice retiré de la classe'})


@exercises_bp.route('/<int:exercise_id>/delete', methods=['DELETE'])
@login_required
@teacher_required
def delete(exercise_id):
    """Supprimer un exercice et toutes ses publications/tentatives élèves"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisé'}), 403

    try:
        # Nettoyer explicitement les publications (retire des missions élèves)
        try:
            from models.exercise_progress import ExercisePublication, StudentExerciseAttempt
            ExercisePublication.query.filter_by(exercise_id=exercise_id).delete()
            StudentExerciseAttempt.query.filter_by(exercise_id=exercise_id).delete()
        except Exception:
            pass

        db.session.delete(exercise)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Exercice supprimé'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@exercises_bp.route('/<int:exercise_id>/duplicate', methods=['POST'])
@login_required
@teacher_required
def duplicate(exercise_id):
    """Dupliquer un exercice"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisé'}), 403

    try:
        new_exercise = Exercise(
            user_id=current_user.id,
            title=f"{exercise.title} (copie)",
            description=exercise.description,
            subject=exercise.subject,
            level=exercise.level,
            accept_typos=exercise.accept_typos,
            bonus_gold_threshold=exercise.bonus_gold_threshold,
            badge_threshold=exercise.badge_threshold,
            is_draft=True,
            is_published=False,
        )
        db.session.add(new_exercise)
        db.session.flush()

        for block in exercise.blocks.order_by(ExerciseBlock.position):
            new_block = ExerciseBlock(
                exercise_id=new_exercise.id,
                block_type=block.block_type,
                position=block.position,
                title=block.title,
                config_json=block.config_json,
                points=block.points,
            )
            db.session.add(new_block)

        new_exercise.calculate_total_points()
        db.session.commit()

        return jsonify({
            'success': True,
            'exercise_id': new_exercise.id,
            'message': 'Exercice dupliqué'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@exercises_bp.route('/<int:exercise_id>/publish', methods=['POST'])
@login_required
@teacher_required
def publish(exercise_id):
    """Publier un exercice vers une ou plusieurs classes"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisé'}), 403

    data = request.get_json()
    classroom_ids = data.get('classroom_ids', [])
    planning_id = data.get('planning_id')

    if not classroom_ids:
        return jsonify({'success': False, 'message': 'Sélectionnez au moins une classe'}), 400

    try:
        for cid in classroom_ids:
            classroom = Classroom.query.get(cid)
            if not classroom:
                continue

            # Vérifier qu'il n'est pas déjà publié pour cette classe
            existing = ExercisePublication.query.filter_by(
                exercise_id=exercise.id,
                classroom_id=cid
            ).first()
            if existing:
                continue

            pub = ExercisePublication(
                exercise_id=exercise.id,
                classroom_id=cid,
                planning_id=planning_id,
                published_by=current_user.id,
                mode=data.get('mode', 'classique'),
            )
            db.session.add(pub)

        exercise.is_published = True
        exercise.is_draft = False
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Exercice publié pour {len(classroom_ids)} classe(s)'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@exercises_bp.route('/<int:exercise_id>/preview')
@login_required
@teacher_required
def preview(exercise_id):
    """Prévisualiser un exercice comme un élève"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        flash('Non autorisé', 'error')
        return redirect(url_for('exercises.index'))

    return render_template('exercises/preview.html', exercise=exercise)


@exercises_bp.route('/<int:exercise_id>/stats')
@login_required
@teacher_required
def stats(exercise_id):
    """Statistiques d'un exercice"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisé'}), 403

    attempts = StudentExerciseAttempt.query.filter_by(exercise_id=exercise.id).all()
    completed = [a for a in attempts if a.is_completed]

    stats = {
        'total_attempts': len(attempts),
        'completed': len(completed),
        'average_score': round(sum(a.score_percentage for a in completed) / len(completed)) if completed else 0,
        'perfect_scores': sum(1 for a in completed if a.score_percentage == 100),
        'total_xp_distributed': sum(a.xp_earned for a in completed),
    }

    return jsonify({'success': True, 'stats': stats})


@exercises_bp.route('/<int:exercise_id>/data')
@login_required
@teacher_required
def get_exercise_data(exercise_id):
    """Récupérer les données JSON d'un exercice (pour l'éditeur)"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisé'}), 403

    return jsonify({
        'success': True,
        'exercise': exercise.to_dict(include_blocks=True)
    })


# ============================================================
# Endpoints pour le lancement et suivi live
# ============================================================

@exercises_bp.route('/launch', methods=['POST'])
@login_required
@teacher_required
def launch_exercise():
    """Publier et lancer un exercice pour une classe avec un mode (classique/combat)"""
    data = request.get_json(silent=True) or {}
    exercise_id = data.get('exercise_id')
    classroom_id = data.get('classroom_id')
    mode = data.get('mode', 'classique')  # 'classique' ou 'combat'

    if not exercise_id or not classroom_id:
        return jsonify({'success': False, 'error': 'exercise_id et classroom_id requis'}), 400

    exercise = Exercise.query.get(exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Exercice non trouvé'}), 404

    # Vérifier si déjà publié pour cette classe
    existing = ExercisePublication.query.filter_by(
        exercise_id=exercise.id,
        classroom_id=classroom_id
    ).first()

    if existing:
        # Mettre à jour le mode et activer
        existing.mode = mode
        existing.is_active = (mode == 'combat')
    else:
        pub = ExercisePublication(
            exercise_id=exercise.id,
            classroom_id=classroom_id,
            published_by=current_user.id,
            published_at=datetime.utcnow(),
            mode=mode,
            is_active=(mode == 'combat'),
        )
        db.session.add(pub)

    exercise.is_published = True
    exercise.is_draft = False
    db.session.commit()

    pub_obj = existing or pub
    return jsonify({
        'success': True,
        'publication_id': pub_obj.id,
        'mode': mode,
        'message': f'Exercice lancé en mode {mode}'
    })


@exercises_bp.route('/publication/<int:pub_id>/toggle-active', methods=['POST'])
@login_required
@teacher_required
def toggle_active(pub_id):
    """Activer/désactiver une mission live (mode combat)"""
    pub = ExercisePublication.query.get_or_404(pub_id)
    exercise = Exercise.query.get(pub.exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Non autorisé'}), 403

    pub.is_active = not pub.is_active
    db.session.commit()
    return jsonify({'success': True, 'is_active': pub.is_active})


@exercises_bp.route('/publication/<int:pub_id>/live-tracking')
@login_required
@teacher_required
def live_tracking(pub_id):
    """Suivi en direct des élèves pendant une mission"""
    pub = ExercisePublication.query.get_or_404(pub_id)
    exercise = Exercise.query.get(pub.exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Non autorisé'}), 403

    from models.student import Student

    # Tous les élèves de la classe
    students = Student.query.filter_by(classroom_id=pub.classroom_id).all()
    blocks_count = exercise.blocks.count() if exercise.blocks else 0

    tracking_data = []
    for student in students:
        # Tentative en cours ou la plus récente
        attempt = StudentExerciseAttempt.query.filter_by(
            student_id=student.id,
            exercise_id=exercise.id
        ).order_by(StudentExerciseAttempt.started_at.desc()).first()

        if attempt:
            # Compter les réponses données
            answers_count = StudentBlockAnswer.query.filter_by(
                attempt_id=attempt.id
            ).count()
            correct_count = StudentBlockAnswer.query.filter_by(
                attempt_id=attempt.id, is_correct=True
            ).count()

            status = 'completed' if attempt.is_completed else 'in_progress'
            tracking_data.append({
                'student_id': student.id,
                'name': f"{student.first_name} {student.last_name}",
                'status': status,
                'answers_count': answers_count,
                'correct_count': correct_count,
                'blocks_count': blocks_count,
                'score': attempt.score if attempt.is_completed else None,
                'max_score': attempt.max_score if attempt.is_completed else None,
                'score_percentage': attempt.score_percentage if attempt.is_completed else None,
                'xp_earned': attempt.xp_earned if attempt.is_completed else 0,
                'started_at': attempt.started_at.isoformat() if attempt.started_at else None,
                'completed_at': attempt.completed_at.isoformat() if attempt.completed_at else None,
            })
        else:
            tracking_data.append({
                'student_id': student.id,
                'name': f"{student.first_name} {student.last_name}",
                'status': 'not_started',
                'answers_count': 0,
                'correct_count': 0,
                'blocks_count': blocks_count,
                'score': None,
                'max_score': None,
                'score_percentage': None,
                'xp_earned': 0,
                'started_at': None,
                'completed_at': None,
            })

    # Résumé
    started = sum(1 for t in tracking_data if t['status'] != 'not_started')
    completed = sum(1 for t in tracking_data if t['status'] == 'completed')
    avg_score = 0
    completed_items = [t for t in tracking_data if t['status'] == 'completed' and t['score_percentage'] is not None]
    if completed_items:
        avg_score = round(sum(t['score_percentage'] for t in completed_items) / len(completed_items))

    return jsonify({
        'success': True,
        'exercise_title': exercise.title,
        'blocks_count': blocks_count,
        'total_students': len(students),
        'started': started,
        'completed': completed,
        'average_score': avg_score,
        'is_active': pub.is_active,
        'mode': pub.mode or 'classique',
        'students': tracking_data,
    })


# ============================================================
# Endpoints pour le upload d'images dans les blocs
# ============================================================

@exercises_bp.route('/upload-block-image', methods=['POST'])
@login_required
@teacher_required
def upload_block_image():
    """Upload d'une image pour un bloc (image interactive)"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'Aucun fichier'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'message': 'Nom de fichier vide'}), 400

    # Vérifier le type
    allowed = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in allowed:
        return jsonify({'success': False, 'message': 'Type de fichier non supporté'}), 400

    try:
        from models.file_manager import UserFile
        import os

        # Stocker dans le système UserFile existant
        file_data = file.read()
        user_file = UserFile(
            user_id=current_user.id,
            filename=f"exercise_block_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{ext}",
            original_filename=file.filename,
            file_content=file_data,
            file_size=len(file_data),
            mime_type=file.content_type or f'image/{ext}',
            file_type=ext,
        )
        db.session.add(user_file)
        db.session.commit()

        return jsonify({
            'success': True,
            'file_id': user_file.id,
            'url': url_for('exercises.exercise_block_image', file_id=user_file.id),
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@exercises_bp.route('/block-image/<int:file_id>')
def exercise_block_image(file_id):
    """Servir une image de bloc d'exercice (accessible aux élèves et enseignants)"""
    from models.file_manager import UserFile
    from flask import Response

    user_file = UserFile.query.get_or_404(file_id)

    if user_file.file_content:
        return Response(
            user_file.file_content,
            mimetype=user_file.mime_type or 'image/png',
            headers={
                'Content-Disposition': f'inline; filename="{user_file.original_filename}"',
                'Cache-Control': 'public, max-age=3600',
            }
        )
    return 'Image non trouvée', 404
