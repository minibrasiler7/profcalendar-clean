from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_required, current_user
from extensions import db
from models.exercise import Exercise, ExerciseBlock, ExerciseFolder
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
    """Liste des exercices de l'enseignant - Two-panel layout"""
    # All exercises (for left panel - unorganized ones)
    exercises = Exercise.query.filter_by(user_id=current_user.id)\
        .order_by(Exercise.updated_at.desc()).all()

    # Unorganized exercises (no folder assigned)
    unorganized = [ex for ex in exercises if ex.exercise_folder_id is None]

    # Root-level folders (for right panel)
    root_folders = ExerciseFolder.query.filter_by(
        user_id=current_user.id, parent_id=None
    ).order_by(ExerciseFolder.name).all()

    # RÃ©cupÃ©rer les classes de l'enseignant pour le filtre
    classrooms = Classroom.query.filter_by(user_id=current_user.id).all()

    return render_template('exercises/list.html',
                           exercises=exercises,
                           unorganized=unorganized,
                           root_folders=root_folders,
                           classrooms=classrooms)


@exercises_bp.route('/create')
@login_required
@teacher_required
def create():
    """Page de l'Ã©diteur d'exercices (L'Atelier)"""
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
        flash('Vous n\'avez pas accÃ¨s Ã  cet exercice.', 'error')
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
        return jsonify({'success': False, 'message': 'DonnÃ©es manquantes'}), 400

    exercise_id = data.get('id')

    try:
        if exercise_id:
            # Mise Ã  jour
            exercise = Exercise.query.get(exercise_id)
            if not exercise or exercise.user_id != current_user.id:
                return jsonify({'success': False, 'message': 'Exercice non trouvÃ©'}), 404
        else:
            # CrÃ©ation
            exercise = Exercise(user_id=current_user.id)
            db.session.add(exercise)

        # Check if this is a folder-only update (only id + folder_id provided)
        is_folder_only_update = exercise_id and ('folder_id' in data or 'exercise_folder_id' in data) and 'blocks' not in data and 'title' not in data

        if is_folder_only_update:
            # Only update folder association, don't touch anything else
            if 'folder_id' in data:
                exercise.folder_id = data['folder_id'] if data['folder_id'] else None
            if 'exercise_folder_id' in data:
                exercise.exercise_folder_id = data['exercise_folder_id'] if data['exercise_folder_id'] else None
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
            if 'exercise_folder_id' in data:
                exercise.exercise_folder_id = data['exercise_folder_id'] if data['exercise_folder_id'] else None
            exercise.updated_at = datetime.utcnow()

            # Sauvegarder d'abord pour obtenir l'ID
            db.session.flush()

            # GÃ©rer les blocs
            blocks_data = data.get('blocks', [])
            existing_block_ids = set()

            for i, block_data in enumerate(blocks_data):
                block_id = block_data.get('id')
                if block_id:
                    # Mise Ãš jour du bloc existant
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

        return jsonify(zˆ	ÜİXØÙ\ÜÉÎˆYKˆ	Ù^\˜Ú\ÙWÚY	Îˆ^\˜Ú\ÙKšYˆ	ÛY\ÜØYÙIÎˆ	Ñ^\˜ÚXÙHØ]]™YØ\™0êIÂˆJB‚ˆ^Ù\^Ù\[Ûˆ\ÈN‚ˆ‹œÙ\ÜÚ[Û‹œ›Û˜XÚÊ
Bˆİ\œ™[Ø\›ÙÙÙ\‹™\œ›ÜŠˆ‘\œ™]\ˆØ]]™YØ\™H^\˜ÚXÙNˆÙ_HŠBˆ™]\›ˆœÛÛšYJÉÜİXØÙ\ÜÉÎˆ˜[ÙK	ÛY\ÜØYÙIÎˆİŠJ_JKL‚‚^\˜Ú\Ù\×Øœœ›İ]J	ËÙ›Û\œÉËY]ÙÏVÉÑÑU	×JBÙÚ[—Ü™\]Z\™YXXÚ\—Ü™\]Z\™Y™Yˆ\İÙ›Û\œÊ
N‚ˆˆˆ“\İ\ˆ\ÈÜÜÚY\œÈHÙ\İ[Û›˜Z\™HHšXÚY\œÈH	İ][\Ø]]\ˆˆˆ‚ˆN‚ˆœ›ÛH[Ù[Ë™š[WÛX[˜YÙ\ˆ[\Üš[Q›Û\‚ˆ›Û\œÈHš[Q›Û\‹œ]Y\K™š[\—ØJ\Ù\—ÚYXİ\œ™[İ\Ù\‹šY
K›Ü™\—ØJš[Q›Û\‹›˜[YJK˜[

Bˆ™]\›ˆœÛÛšYJÊ
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

    # Convertir en int pour Ã¥viter les erreurs SQL de type cast (VARCHAR vs INTEGER)
    try:
        exercise_id = int(exercise_id)
        classroom_id = int(classroom_id)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'IDs invalides'}), 400

    exercise = Exercise.query.get(exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Exercice non trouvÃ©'}), 404

    from models.exercise_progress import ExercisePublication
    from datetime import datetime

    # VÃ©rifier si dÃ©jÃ  publiÃ©
    existing = ExercisePublication.query.filter_by(
        exercise_id=exercise.id,
        classroom_id=classroom_id
    ).first()

    if existing:
        return jsonify({'success': True, 'message': 'Exercice dÃ©jÃ  dans cette classe'})

    pub = ExercisePublication(
        exercise_id=exercise.id,
        classroom_id=classroom_id,
        published_by=current_user.id,
        published_at=datetime.utcnow(),
        mode='classique',
    )
    db.session.add(pub)

    # Marquer comme publiÃ© et lier Ãš la classe
    exercise.is_published = True
    exercise.is_draft = False
    exercise.classroom_id = int(classroom_id)

    db.session.commit()
    return jsonify({'success': True, 'message': 'Exercice publiÃ©'})


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
        return jsonify({'success': False, 'error': 'Exercice non trouvÃ©'}), 404

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
    return jsonify({'success': True, 'message': 'Exercice retirÃ© de la classe'})


@exercises_bp.route('/<int:exercise_id>/delete', methods=['DELETE'])
@login_required
@teacher_required
def delete(exercise_id):
    """Supprimer un exercice et toutes ses publications/tentatives Ã©lÃ¨ves"""
    exercise = Exercise.query.get_or_404(exercise_id)
    if exercise.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisÃ©'}), 403

    try:
        # Nettoyer dans l'ordre inverse des FK:
        # StudentBlockAnswer â†’ StudentExerciseAttempt â†’ ExercisePublication â†’ Exercise
        attempts = StudentExerciseAttempt.query.filter_by(exercise_id=exercise_id).all()
        for attempt in attempts:
            StudentBlockAnswer.query.filter_by(attempt_id=attempt.id).delete()
        StudentExerciseAttempt.query.filter_by(exercise_id=exercise_id).delete()
        ExercisePublication.query.filter_by(exercise_id=exercise_id).delete()

        db.session.delete(exercise)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Exercice supprimÃ©'})
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
        return jsonify({'success': False, 'message': 'Non autorisÃ©'}), 403

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

        return jsonify({((€€€€€€€€€€€€ÍÕ•ÍÌœèQÉÕ”°(€€€€€€€€€€€€•á•É¥Í•}¥œè¹•İ}•á•É¥Í”¹¥°(€€€€€€€€€€€€µ•ÍÍ…”œè€á•É¥”‘ÕÁ±¥Å×¤œ(€€€€€€€ô¤(€€€•á•ÁĞá•ÁÑ¥½¸…Ì”è(€€€€€€€‘ˆ¹Í•ÍÍ¥½¸¹É½±±‰…¬ ¤(€€€€€€€É•ÑÕÉ¸©Í½¹¥™ä¡ìÍÕ•ÍÌœè…±Í”°€µ•ÍÍ…”œèÍÑÈ¡”¥ô¤°€ÔÀÀ(()•á•É¥Í•Í}‰À¹É½ÕÑ” œ¼ñ¥¹Ğé•á•É¥Í•}¥ø½ÁÕ‰±¥Í œ°µ•Ñ¡½‘ÌõlA=MPt¤)±½¥¹}É•ÅÕ¥É•)Ñ•…¡•É}É•ÅÕ¥É•)‘•˜ÁÕ‰±¥Í ¡•á•É¥Í•}¥¤è(€€€€ˆˆ‰AÕ‰±¥•ÈÕ¸•á•É¥”Ù•ÉÌÕ¹”½ÔÁ±ÕÍ¥•ÕÉÌ±…ÍÍ•Ìˆˆˆ(€€€•á•É¥Í”€ôá•É¥Í”¹ÅÕ•Éä¹•Ñ}½É|ĞÀĞ¡•á•É¥Í•}¥¤(€€€¥˜•á•É¥Í”¹ÕÍ•É}¥€„ôÕÉÉ•¹Ñ}ÕÍ•È¹¥è(€€€€€€€É•ÑÕÉ¸©Í½¹¥™ä¡ìÍÕ•ÍÌœè…±Í”°€µ•ÍÍ…”œè€9½¸…ÕÑ½É¥Ï¤ô¤°€ĞÀÌ((€€€‘…Ñ„€ôÉ•ÅÕ•ÍĞ¹•Ñ}©Í½¸ ¤(€€€±…ÍÍÉ½½µ}¥‘Ì€ô‘…Ñ„¹•Ğ ±…ÍÍÉ½½µ}¥‘Ìœ°mt¤(€€€Á±…¹¹¥¹}¥€ô‘…Ñ„¹•Ğ Á±…¹¹¥¹}¥œ¤((€€€¥˜¹½Ğ±…ÍÍÉ½½µ}¥‘Ìè(€€€€€€€É•ÑÕÉ¸©Í½¹¥™ä¡ìÍÕ•ÍÌœè…±Í”°€µ•ÍÍ…”œè€O¥±•Ñ¥½¹¹•è…Ôµ½¥¹ÌÕ¹”±…ÍÍ”ô¤°€ĞÀÀ((€€€ÑÉäè(€€€€€€€™½È¥¥¸±…ÍÍÉ½½µ}¥‘Ìè(€€€€€€€€€€€±…ÍÍÉ½½´€ô±…ÍÍÉ½½´¹ÅÕ•Éä¹•Ğ¡¥¤(€€€€€€€€€€€¥˜¹½Ğ±…ÍÍÉ½½´è(€€€€€€€€€€€€€€€½¹Ñ¥¹Õ”((€€€€€€€€€€€€Œ[¥É¥™¥•ÈÅÔ¥°¸•ÍĞÁ…Ì“¥«€ÁÕ‰±§¤Á½ÕÈ•ÑÑ”±…ÍÍ”(€€€€€€€€€€€•á¥ÍÑ¥¹œ€ôá•É¥Í•AÕ‰±¥…Ñ¥½¸¹ÅÕ•Éä¹™¥±Ñ•É}‰ä (€€€€€€€€€€€€€€€•á•É¥Í•}¥õ•á•É¥Í”¹¥°(€€€€€€€€€€€€€€€±…ÍÍÉ½½µ}¥õ¥(€€€€€€€€€€€€¤¹™¥ÉÍĞ ¤(€€€€€€€€€€€¥˜•á¥ÍÑ¥¹œè(€€€€€€€€€€€€€€€½¹Ñ¥¹Õ”((€€€€€€€€€€€ÁÕˆ€ôá•É¥Í•AÕ‰±¥…Ñ¥½¸ (€€€€€€€€€€€€€€€•á•É¥Í•}¥õ•á•É¥Í”¹¥°(€€€€€€€€€€€€€€€±…ÍÍÉ½½µ}¥õ¥°(€€€€€€€€€€€€€€€Á±…¹¹¥¹}¥õÁ±…¹¹¥¹}¥°(€€€€€€€€€€€€€€€ÁÕ‰±¥Í¡•‘}‰äõÕÉÉ•¹Ñ}ÕÍ•È¹¥°(€€€€€€€€€€€€€€€µ½‘”õ‘…Ñ„¹•Ğ µ½‘”œ°€±…ÍÍ¥ÅÕ”œ¤°(€€€€€€€€€€€€¤(€€€€€€€€€€€‘ˆ¹Í•ÍÍ¥½¸¹…‘¡ÁÕˆ¤((€€€€€€€•á•É¥Í”¹¥Í}ÁÕ‰±¥Í¡•€ôQÉÕ”(€€€€€€€•á•É¥Í”¹¥Í}‘É…™Ğ€ô…±Í”(€€€€€€€‘ˆ¹Í•ÍÍ¥½¸¹½µµ¥Ğ ¤((€€€€€€€É•ÑÕÉ¸©Í½¹¥™ä¡ì((€€€€€€€€€€€€ÍÕ•ÍÌœèQÉÕ”°(€€€€€€€€€€€€µ•ÍÍ…”œè˜á•É¥”ÁÕ‰±§¤Á½ÕÈí±•¸¡±…ÍÍÉ½½µ}¥‘Ì¥ô±…ÍÍ”¡Ì¤œ(€€€€€€€ô¤(€€€•á•ÁĞá•ÁÑ¥½¸…Ì”è(€€€€€€€‘ˆ¹Í•ÍÍ¥½¸¹É½±±‰…¬ ¤(€€€€€€€É•ÑÕÉ¸©Í½¹¥™ä¡ìÍÕ•ÍÌœè…±Í”°€µ•ÍÍ…”œèÍÑÈ¡”¥ô¤°€ÔÀÀ(()•á•É¥Í•Í}‰À¹É½ÕÑ” œ¼ñ¥¹Ğé•á•É¥Í•}¥ø½ÁÉ•Ù¥•Üœ¤)±½¥¹}É•ÅÕ¥É•)Ñ•…¡•É}É•ÅÕ¥É•)‘•˜ÁÉ•Ù¥•Ü¡•á•É¥Í•}¥¤è(€€€€ˆˆ‰AË¥Ù¥ÍÕ…±¥Í•ÈÕ¸•á•É¥”½µµ”Õ¸ƒ¥³¡Ù”ˆˆˆ(€€€•á•É¥Í”€ôá•É¥Í”¹ÅÕ•Éä¹•Ñ}½É|ĞÀĞ¡•á•É¥Í•}¥¤(€€€¥˜•á•É¥Í”¹ÕÍ•É}¥€„ôÕÉÉ•¹Ñ}ÕÍ•È¹¥è(€€€€€€€™±…Í  9½¸…ÕÑ½É¥Ï¤œ°€•ÉÉ½Èœ¤(€€€€€€€É•ÑÕÉ¸É•‘¥É•Ğ¡ÕÉ±}™½È •á•É¥Í•Ì¹¥¹‘•àœ¤¤((€€€‰±½­Ì€ô•á•É¥Í”¹‰±½­Ì¹½É‘•É}‰ä¡á•É¥Í•	±½¬¹Á½Í¥Ñ¥½¸¤¹…±° ¤(€€€É•ÑÕÉ¸É•¹‘•É}Ñ•µÁ±…Ñ” •á•É¥Í•Ì½ÁÉ•Ù¥•Ü¹¡Ñµ°œ°•á•É¥Í”õ•á•É¥Í”°‰±½­Ìõ‰±½­Ì¤(()•á•É¥Í•Í}‰À¹É½ÕÑ” œ¼ñ¥¹Ğé•á•É¥Í•}¥ø½ÍÑ…ÑÌœ¤)±½¥¹}É•ÅÕ¥É•)Ñ•…¡•É}É•ÅÕ¥É•)‘•˜ÍÑ…ÑÌ¡•á•É¥Í•}¥¤è(€€€€ˆˆ‰MÑ…Ñ¥ÍÑ¥ÅÕ•ÌÕ¸•á•É¥”ˆˆˆ(€€€•á•É¥Í”€ôá•É¥Í”¹ÅÕ•Éä¹•Ñ}½É|ĞÀĞ¡•á•É¥Í•}¥¤(€€€¥˜•á•É¥Í”¹ÕÍ•É}¥€„ôÕÉÉ•¹Ñ}ÕÍ•È¹¥è(€€€€€€€É•ÑÕÉ¸©Í½¹¥™ä¡ìÍÕ•ÍÌœè…±Í”°€µ•ÍÍ…”œè€9½¸…ÕÑ½É¥Ï¤ô¤°€ĞÀÌ((€€€…ÑÑ•µÁÑÌ€ôMÑÕ‘•¹Ñá•É¥Í•ÑÑ•µÁĞ¹ÅÕ•Éä¹™¥±Ñ•É}‰ä¡•á•É¥Í•}¥õ•á•É¥Í”¹¥¤¹…±° ¤(€€€½µÁ±•Ñ•€ôm„™½È„¥¸…ÑÑ•µÁÑÌ¥˜„¹¥Í}½µÁ±•Ñ•‘t((€€€ÍÑ…ÑÌ€ôì(€€€€€€€€Ñ½Ñ…±}…ÑÑ•µÁÑÌœè±•¸¡…ÑÑ•µÁÑÌ¤°(€€€€€€€€½µÁ±•Ñ•œè±•¸¡½µÁ±•Ñ•¤°(€€€€€€€€…Ù•É…•}Í½É”œèÉ½Õ¹¡ÍÕ´¡„¹Í½É•}Á•É•¹Ñ…”™½È„¥¸½µÁ±•Ñ•¤€¼±•¸¡½µÁ±•Ñ•¤¤¥˜½µÁ±•Ñ••±Í”€À°(€€€€€€€šÁ•É™•Ñ}Í½É•ÌœèÍÕ´ Ä™½È„¥¸½µÁ±•Ñ•¥˜„¹Í½É•}Á•É•¹Ñ…”€ôô€ÄÀÀ¤°(€€€€€€€€Ñ½Ñ…±}áÁ}‘¥ÍÑÉ¥‰ÕÑ•œèÍÕ´¡„¹áÁ}•…É¹•™½È„¥¸½µÁ±•Ñ•¤°(€€€ô((€€€É•ÑÕÉ¸©Í½¹¥™ä¡ìÍÕ•ÍÌœèQÉÕ”°€ÍÑ…ÑÌœèÍÑ…ÑÍô¤(()•á•É¥Í•Í}‰À¹É½ÕÑ” œ¼ñ¥¹Ğé•á•É¥Í•}¥ø½‘…Ñ„œ¤)±½¥¹}É•ÅÕ¥É•)Ñ•…¡•É}É•ÅÕ¥É•)‘•˜•Ñ}•á•É¥Í•}‘…Ñ„¡•á•É¥Í•}¥¤è(€€€€ˆˆ‰K¥ÕÃ¥É•È±•Ì‘½¹»¥•Ì)M=8Õ¸•á•É¥”€¡Á½ÕÈ°¿¥‘¥Ñ•ÕÈ¤ˆˆˆ(€€€•á•É¥Í”€ôá•É¥Í”¹ÅÕ•Éä¹•Ñ}½É|ĞÀĞ¡•á•É¥Í•}¥¤(€€€¥˜•á•É¥Í”¹ÕÍ•É}¥€„ôÕÉÉ•¹Ñ}ÕÍ•È¹¥è(€€€€€€€É•ÑÕÉ¸©Í½¹¥™ä¡ìÍÕ•ÍÌœè…±Í”°€µ•ÍÍ…”œè€9½¸…ÕÑ½É¥Ï¤ô¤°€ĞÀÌ((€€€É•ÑÕÉ¸©Í½¹¥™ä¡ì((€€€€€€€€ÍÕ•ÍÌœèQÉÕ”°(€€€€€€€€•á•É¥Í”œè•á•É¥Í”¹Ñ½}‘¥Ğ¡¥¹±Õ‘•}‰±½­ÌõQÉÕ”¤(€€€ô¤(((Œ€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô(Œ¹‘Á½¥¹ÑÌÁ½ÕÈ±”±…¹•µ•¹Ğ•ĞÍÕ¥Ù¤±¥Ù”(Œ€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô()•á•É¥Í•Í}‰À¹É½ÕÑ” œ½±…Õ¹ œ°µ•Ñ¡½‘ÌõlA=MPt¤)±½¥¹}É•ÅÕ¥É•)Ñ•…¡•É}É•ÅÕ¥É•)‘•˜±…Õ¹¡}•á•É¥Í” ¤è(€€€€ˆˆ‰AÕ‰±¥•È•Ğ±…¹•ÈÕ¸•á•É¥”Á½ÕÈÕ¹”±…ÍÍ”…Ù•ŒÕ¸µ½‘”€¡±…Ìsique/combat)"""
    data = request.get_json(silent=True) or {}
    exercise_id = data.get('exercise_id')
    classroom_id = data.get('classroom_id')
    mode = data.get('mode', 'classique')  # 'classique' ou 'combat'

    if not exercise_id or not classroom_id:
        return jsonify({'success': False, 'error': 'exercise_id et classroom_id requis'}), 400

    exercise = Exercise.query.get(exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Exercice non trouvÃ©'}), 404

    # VÃ©rifier si dÃ©jÃ  publiÃ© pour cette classe
    existing = ExercisePublication.query.filter_by(
        exercise_id=exercise.id,
        classroom_id=classroom_id
    ).first()

    if existing:
        # Mettre Ã¡ jour le mode et activer
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
    result = {
        'success': True,
        'publication_id': pub_obj.id,
        'mode': mode,
        'message': f'Exercice lancÃ© en mode {mode}'
    }

    # Si mode combat, crÃ©er une CombatSession automatiquement
    if mode == 'combat':
        try:
            from services.combat_engine import CombatEngine
            difficulty = data.get('difficulty', 'medium')
            combat_session = CombatEngine.create_session(
                teacher_id=current_user.id,
                classroom_id=classroom_id,
                exercise_id=exercise_id,
                difficulty=difficulty,
            )
            result['combat_session_id'] = combat_session.id
        except Exception as e:
            import traceback
            traceback.print_exc()
            result['combat_error'] = str(e)

    return jsonify(result)


@exercises_bp.route('/publication/<int:pub_id>/toggle-active', methods=['POST'])
@login_required
@teacher_required
def toggle_active(pub_id):
    """Activer/dÃ¢sactiver une mission live (mode combat)"""
    pub = ExercisePublication.query.get_or_404(pub_id)
    exercise = Exercise.query.get(pub.exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Non autorisÃ©'}), 403

    pub.is_active = not pub.is_active
    db.session.commit()
    return jsonify({'success': True, 'is_active': pub.is_active})


@exercises_bp.route('/publication/<int:pub_id>/live-tracking')
@login_required
@teacher_required
def live_tracking(pub_id):
    """Suivi en direct des Ã©lÃ¨ves pendant une mission"""
    pub = ExercisePublication.query.get_or_404(pub_id)
    exercise = Exercise.query.get(pub.exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Non autorisÃ©'}), 403

    from models.student import Student

    # Tous les Ã©lÃ¨ves de la classe
    students = Student.query.filter_by(classroom_id=pub.classroom_id).all()
    blocks_count = exercise.blocks.count() if exercise.blocks else 0

    tracking_data = []
    for student in students:
        # Tentative en cours ou la plus rÃ©cente
        attempt = StudentExerciseAttempt.query.filter_by(
            student_id=student.id,
            exercise_id=exercise.id
        ).order_by(StudentExerciseAttempt.started_at.desc()).first()

        if attempt:
            # Compter les rÃ©ponses donnÃ©es
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

    # RÃ©sumÃ©
    started = sum(1 for t in tracking_data if t['status'] != 'not_started')
    completed = sum(1 for t in tracking_data if t['status'] == 'completed')
    avg_score = 0
    completed_items = [t for t in tracking_data if t['status'] == 'completed' and t['score_percentage'] is not None]
    if completed_items:
        avg_score = round(sum(t['score_percentage'] for t in completed_items) / len(completed_items))

    result = {
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
    }

    # Si mode combat, inclure le combat_session_id et les participants
    if (pub.mode or 'classique') == 'combat':
        try:
            from models.combat import CombatSession, CombatParticipant
            combat = CombatSession.query.filter(
                CombatSession.classroom_id == pub.classroom_id,
                CombatSession.exercise_id == exercise.id,
                CombatSession.status.in_(['waiting', 'active'])
            ).order_by(CombatSession.created_at.desc()).first()
            if combat:
                result['combat_session_id'] = combat.id
                result['combat_status'] = combat.status
                result['combat_round'] = combat.current_round
                result['combat_phase'] = combat.current_phase
                # Participants connectÃ©s au combat
                participants = CombatParticipant.query.filter_by(
                    combat_session_id=combat.id
                ).all()
                result['combat_participants'] = len(participants)

                # Enrichir la liste d'Ã©lÃ¨ves avec les infos combat
                combat_student_ids = set()
                combat_info = {}
                for p in participants:
                    combat_student_ids.add(p.student_id)
                    snapshot = p.snapshot_json or {}
                    combat_info[p.student_id] = {
                        'in_combat': True,
                        'avatar_class': snapshot.get('avatar_class', ''),
                        'current_hp': p.current_hp,
                        'max_hp': snapshot.get('max_hp', p.current_hp),
                        'is_alive': p.is_alive,
                        'grid_x': p.grid_x,
                        'grid_y': p.grid_y,
                    }

                # Mettre Ã¡ jour chaque Ã©tudiant dans tracking_data
                for s in result['students']:
                    sid = s['student_id']
                    if sid in combat_student_ids:
                        s['in_combat'] = True
                        s['combat_info'] = combat_info[sid]
                        if s['status'] == 'not_started':
                            s['status'] = 'in_progress'
                    else:
                        s['in_combat'] = False
        except Exception:
            pass

    return jsonify(result)


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

    # VÃ©rifier le type
    allowed = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in allowed:
        return jsonify({'success': False, 'message': 'Type de fichier non supportÃ©'}), 400

    try:
        from models.file_manager import UserFile
        import os

        # Stocker dans le systÃ¨me UserFile existant
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
    """Servir une image de bloc d'exercice (accessible aux Ã©lÃ¨ves et enseignants)"""
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
    return 'Image non trouvÃ©e', 404


# ============================================================
# EXERCISE MANAGER - Gestionnaire d'exercices sÃ©parÃ©
# =========================================================

@exercises_bp.route('/manager')
@login_required
@teacher_required
def manager():
    """Page principale du gestionnaire d'exercices"""
    return render_template('exercises/manager.html')


@exercises_bp.route('/manager/folders', methods=['GET'])
@login_required
@teacher_required
def manager_list_folders():
    """API: Lister tous les dossiers d'exercices de l'utilisateur"""
    from models.exercise import ExerciseFolder
    folders = ExerciseFolder.query.filter_by(user_id=current_user.id).order_by(ExerciseFolder.name).all()
    return jsonify({

        'success': True,
        'folders': [{
            'id': f.id,
            'name': f.name,
            'parent_id': f.parent_id,
            'color': f.color,
        } for f in folders]
   })


@exercises_bp.route('/manager/folder/create', methods=['POST'])
@login_required
@teacher_required
def manager_create_folder():
    """API: CrÃ©er un dossier d'exercices"""
    from models.exercise import ExerciseFolder
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Nom requis'}), 400

    parent_id = data.get('parent_id')
    if parent_id:
        parent = ExerciseFolder.query.get(parent_id)
        if not parent or parent.user_id != current_user.id:
            return jsonify({'success': False, 'message': 'Dossier parent invalide'}), 400

    folder = ExerciseFolder(
        user_id=current_user.id,
        parent_id=parent_id,
        name=name,
        color=data.get('color', '#667eea')
    )
    db.session.add(folder)
    db.session.commit()
    return jsonify({

        'success': True,
        'folder': {'id': folder.id, 'name': folder.name, 'parent_id': folder.parent_id, 'color': folder.color}
    })



@exercises_bp.route('/manager/folder/<int:folder_id>/rename', methods=['POST'])
@login_required
@teacher_required
def manager_rename_folder(folder_id):
    """API: Renommer un dossier d'exercices"""
    from models.exercise import ExerciseFolder
    folder = ExerciseFolder.query.get_or_404(folder_id)
    if folder.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisÃ©'}), 403

    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Nom requis'}), 400

    folder.name = name
    if 'color' in data:
        folder.color = data['color']
    db.session.commit()
    return jsonify({'success': True})


@exercises_bp.route('/manager/folder/<int:folder_id>', methods=['DELETE'])
@login_required
@teacher_required
def manager_delete_folder(folder_id):
    """API: Supprimer un dossier d'exercices (et dÃ©placer les exercices Ã  la racine)"""
    from models.exercise import ExerciseFolder
    folder = ExerciseFolder.query.get_or_404(folder_id)
    if folder.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Non autorisÃ©'}), 403

    # Move exercises in this folder to root (null folder)
    Exercise.query.filter_by(exercise_folder_id=folder_id).update({'exercise_folder_id': None})
    # Move subfolders to parent
    for sub in folder.subfolders:
        sub.parent_id = folder.parent_id
    db.session.delete(folder)
    db.session.commit()
    return jsonify({'success': True})


@exercises_bp.route('/manager/contents', methods=['GET'])
@login_required
@teacher_required
def manager_contents():
    """API: Obtenir le contenu d'un dossier (sous-dossiers + exercices)"""
    from models.exercise import ExerciseFolder
    folder_id = request.args.get('folder_id', type=int)

    # Get subfolders
    if folder_id:
        subfolders = ExerciseFolder.query.filter_by(user_id=current_user.id, parent_id=folder_id).order_by(ExerciseFolder.name).all()
    else:
        subfolders = ExerciseFolder.query.filter_by(user_id=current_user.id, parent_id=None).order_by(ExerciseFolder.name).all()

    # Get exercises in this folder
    if folder_id:
        exercises = Exercise.query.filter_by(user_id=current_user.id, exercise_folder_id=folder_id).order_by(Exercise.updated_at.desc()).all()
    else:
        exercises = Exercise.query.filter_by(user_id=current_user.id, exercise_folder_id=None).order_by(Exercise.updated_at.desc()).all()

    return jsonify({
        'success': True,
        'folders': [{
            'id': f.id, 'name': f.name, 'parent_id': f.parent_id, 'color': f.color
        } for f in subfolders],
        'exercises': [{
            'id': e.id,
            'title': e.title or 'Sans titre',
            'subject': e.subject,
            'level': e.level,
            'is_published': e.is_published,
            'is_draft': e.is_draft,
            'total_points': e.total_points,
            'block_count': e.blocks.count(),
            'updated_at': e.updated_at.isoformat() if e.updated_at else None,
            'classroom_id': e.classroom_id,
        } for e in exercises]
    })


@exercises_bp.route('/manager/move-exercise', methods=['POST'])
@login_required
@teacher_required
def manager_move_exercise():
    """API: DÃ©placer un exercice dans un dossier"""
    data = request.get_json(silent=True) or {}
    exercise_id = data.get('exercise_id')
    folder_id = data.get('folder_id')  # None = racine

    exercise = Exercise.query.get(exercise_id)
    if not exercise or exercise.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Exercice non trouvÃ©'}), 404

    if folder_id:
        from models.exercise import ExerciseFolder
        folder = ExerciseFolder.query.get(folder_id)
        if not folder or folder.user_id != current_user.id:
            return jsonify({'success': False, 'message': 'Dossier invalide'}), 400

    exercise.exercise_folder_id = folder_id
    exercise.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True})


@exercises_bp.route('/manager/move-folder', methods=['POST'])
@login_required
@teacher_required
def manager_move_folder():
    """API: DÃ©placer un dossier dans un autre dossier"""
    from models.exercise import ExerciseFolder
    data = request.get_json(silent=True) or {}
    folder_id = data.get('folder_id')
    new_parent_id = data.get('new_parent_id')  # None = racine

    folder = ExerciseFolder.query.get(folder_id)
    if not folder or folder.user_id != current_user.id:
        return jsonify({'success': False, 'message': 'Dossier non trouvÃ©'}), 404

    # Prevent moving a folder into its own subtree
    if new_parent_id:
        parent = ExerciseFolder.query.get(new_parent_id)
        if not parent or parent.user_id != current_user.id:
            return jsonify({'success': False, 'message': 'Dossier parent invalide'}), 400
        # Check for circular reference
        check = parent
        while check:
            if check.id == folder.id:
                return jsonify({'success': False, 'message': 'RÃ©fÃ©rence circulaire'}), 400
            check = check.parent

    folder.parent_id = new_parent_id
    db.session.commit()
    return jsonify({'success': True})


@exercises_bp.route('/manager/breadcrumb', methods=['GET'])
@login_required
@teacher_required
def manager_breadcrumb():
    """API: Obtenir le fil d'Ariane pour un dossier"""
    from models.exercise import ExerciseFolder
    folder_id = request.args.get('folder_id', type=int)
    breadcrumb = []
    if folder_id:
        folder = ExerciseFolder.query.get(folder_id)
        while folder and folder.user_id == current_user.id:
            breadcrumb.insert(0, {'id': folder.id, 'name': folder.name})
            folder = folder.parent
    return jsonify({'success': True, 'breadcrumb': breadcrumb})