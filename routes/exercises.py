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

        # Mettre à jour les champs
        exercise.title = data.get('title', 'Sans titre')
        exercise.description = data.get('description', '')
        exercise.subject = data.get('subject', '')
        exercise.level = data.get('level', '')
        exercise.accept_typos = data.get('accept_typos', False)
        exercise.bonus_gold_threshold = data.get('bonus_gold_threshold', 80)
        exercise.badge_threshold = data.get('badge_threshold', 100)

        exercise.is_draft = data.get('is_draft', True)
        if data.get('folder_id') is not None:
            exercise.folder_id = data.get('folder_id') or None
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
        from routes.file_manager import FileFolder
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


@exercises_bp.route('/<int:exercise_id>/delete', methods=['DELETE'])
@login_required
@teacher_required
def delete(exercise_id):
    """Supprimer un exercice"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisé'}), 403

    try:
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
