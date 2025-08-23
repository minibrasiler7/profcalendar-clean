from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from flask_login import login_required, current_user
from extensions import db
from functools import wraps
from models.class_collaboration import ClassMaster, TeacherAccessCode, TeacherCollaboration, SharedClassroom, StudentClassroomLink
from models.classroom import Classroom
from models.student import Student
from models.user import User
from datetime import datetime, timedelta

collaboration_bp = Blueprint('collaboration', __name__, url_prefix='/collaboration')

# Décorateur pour vérifier que c'est bien un enseignant qui est connecté
def teacher_required(f):
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        from models.user import User
        if not isinstance(current_user, User):
            # Pour les requêtes AJAX, retourner une erreur JSON
            if request.is_json or request.headers.get('Accept') == 'application/json':
                return jsonify({'error': 'Accès réservé aux enseignants'}), 403
            
            flash('Accès réservé aux enseignants', 'error')
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated_function

@collaboration_bp.route('/')
@teacher_required
def index():
    """Page principale des codes d'accès"""
    from models.classroom_access_code import ClassroomAccessCode
    from models.parent import ClassCode
    from models.student import Student
    
    # 1. Récupérer les codes d'accès élèves (ClassroomAccessCode) avec auto-renewal
    # Seuls les maîtres de classe ou les créateurs sans maître peuvent voir les codes
    student_codes = []
    from models.class_collaboration import ClassMaster
    from models.mixed_group import MixedGroup
    
    # Récupérer toutes les classes où l'utilisateur peut gérer les codes d'accès élèves
    # Cela inclut : classes originales (créées par lui) + classes où il est maître + classes dérivées (via collaboration)
    all_classrooms = Classroom.query.all()
    authorized_classrooms = []
    
    for classroom in all_classrooms:
        # Exclure les classes mixtes (elles ne doivent jamais avoir de codes d'accès)
        # Une classe mixte est identifiée par sa présence dans MixedGroup.auto_classroom_id
        is_mixed_group_classroom = MixedGroup.query.filter_by(auto_classroom_id=classroom.id).first()
        if is_mixed_group_classroom:
            continue
            
        # Exclure les classes dérivées (créées via collaboration)
        # Une classe dérivée est identifiée par sa présence dans SharedClassroom
        is_derived_class = SharedClassroom.query.filter_by(derived_classroom_id=classroom.id).first()
        if is_derived_class:
            continue
            
        class_master = ClassMaster.query.filter_by(classroom_id=classroom.id).first()
        is_class_master = class_master and class_master.master_teacher_id == current_user.id
        is_owner = classroom.user_id == current_user.id
        
        # L'utilisateur peut gérer les codes élèves s'il est :
        # - Propriétaire de la classe originale (pas dérivée)
        # - Ou maître de classe (même si pas propriétaire)
        if is_owner or is_class_master:
            authorized_classrooms.append(classroom)
    
    for classroom in authorized_classrooms:
        access_code = ClassroomAccessCode.query.filter_by(classroom_id=classroom.id).first()
        if not access_code:
            # Créer automatiquement un code d'accès élève s'il n'existe pas
            access_code = ClassroomAccessCode(
                classroom_id=classroom.id,
                code=ClassroomAccessCode.generate_code(),
                created_at=datetime.utcnow(),
                created_by_user_id=current_user.id
            )
            db.session.add(access_code)
            db.session.commit()
        elif access_code.is_expired():
            # Renouveler automatiquement si expiré
            access_code.code = ClassroomAccessCode.generate_code()
            access_code.created_at = datetime.utcnow()
            db.session.commit()
        
        student_count = Student.query.filter_by(classroom_id=classroom.id).count()
        student_codes.append({
            'classroom_id': classroom.id,
            'classroom_name': f"{classroom.name} - {classroom.subject}",
            'code': access_code.code,
            'created_at': access_code.created_at,
            'expires_at': access_code.expires_at_one_year,
            'student_count': student_count
        })
    
    # 2. Récupérer les codes d'accès parents (ClassCode)
    # Les codes parents sont uniquement accessibles aux classes ORIGINALES de l'enseignant
    # PAS aux classes obtenues via collaboration
    parent_codes = []
    original_classrooms = []
    
    # Ne récupérer que les classes dont l'enseignant est propriétaire ET maître de classe (ou créateur sans maître)
    for classroom in all_classrooms:
        # Vérifier si l'utilisateur est propriétaire de cette classe
        if classroom.user_id != current_user.id:
            continue
            
        # Exclure les classes mixtes (pas de codes parents)
        is_mixed_group_classroom = MixedGroup.query.filter_by(auto_classroom_id=classroom.id).first()
        if is_mixed_group_classroom:
            continue
            
        # Exclure les classes dérivées (pas de codes parents)
        is_derived_class = SharedClassroom.query.filter_by(derived_classroom_id=classroom.id).first()
        if is_derived_class:
            continue
            
        class_master = ClassMaster.query.filter_by(classroom_id=classroom.id).first()
        is_class_master = class_master and class_master.master_teacher_id == current_user.id
        is_creator_no_master = (not class_master)
        
        if is_class_master or is_creator_no_master:
            original_classrooms.append(classroom)
    
    for classroom in original_classrooms:
        # Créer automatiquement un code parent s'il n'existe pas ou le renouveler s'il est expiré
        parent_code = ClassCode.query.filter_by(classroom_id=classroom.id).first()
        if not parent_code:
            from datetime import timedelta
            parent_code = ClassCode(
                classroom_id=classroom.id,
                user_id=current_user.id,
                code=ClassCode.generate_code(),
                is_active=True,
                created_at=datetime.utcnow()
            )
            db.session.add(parent_code)
            db.session.commit()
        elif parent_code.is_expired():
            # Renouveler automatiquement le code expiré
            parent_code.code = ClassCode.generate_code()
            parent_code.created_at = datetime.utcnow()
            db.session.commit()
        
        parent_codes.append({
            'classroom_id': classroom.id,
            'classroom_name': f"{classroom.name} - {classroom.subject}",
            'code': parent_code.code,
            'created_at': parent_code.created_at,
            'expires_at': parent_code.expires_at
        })
    
    # 3. Récupérer le code d'accès enseignant actuel avec auto-renewal
    teacher_code = TeacherAccessCode.query.filter_by(
        master_teacher_id=current_user.id,
        is_active=True
    ).first()
    
    # Auto-renouveler le code enseignant s'il est expiré
    if teacher_code and teacher_code.is_expired():
        teacher_code.code = TeacherAccessCode.generate_code()
        teacher_code.created_at = datetime.utcnow()
        teacher_code.expires_at = teacher_code.expires_at_one_year
        db.session.commit()
    
    # Vérifier si l'utilisateur collabore avec des maîtres de classe
    collaborations = TeacherCollaboration.query.filter_by(
        specialized_teacher_id=current_user.id,
        is_active=True
    ).all()
    master_teachers = [collab.master_teacher for collab in collaborations]
    
    # Récupérer les codes d'accès générés par cet enseignant (APRÈS la création potentielle)
    access_codes = TeacherAccessCode.query.filter_by(
        master_teacher_id=current_user.id,
        is_active=True
    ).all()
    
    print(f"DEBUG: Found {len(access_codes)} access codes for user {current_user.id}")
    
    # Récupérer les enseignants qui collaborent avec cet enseignant
    collaborating_teachers = current_user.get_collaborating_teachers()
    
    # Récupérer les classes qui ont déjà un maître de classe cette année
    current_year = f"{datetime.now().year}-{datetime.now().year + 1}"
    existing_masters = ClassMaster.query.filter_by(school_year=current_year).all()
    classes_with_masters = {master.classroom_id for master in existing_masters}
    
    # Pour chaque classe de l'utilisateur actuel, vérifier s'il y a des raisons qui l'empêchent de devenir maître
    for classroom in current_user.classrooms:
        # Cas 1: Vérifier si cette classe est une classe dérivée (l'utilisateur est enseignant spécialisé)
        # Dans ce cas, il ne peut pas devenir maître de sa classe dérivée
        is_derived_class = SharedClassroom.query.filter_by(
            derived_classroom_id=classroom.id
        ).first()
        
        if is_derived_class:
            # Cette classe est une classe dérivée, l'utilisateur ne peut pas en devenir maître
            classes_with_masters.add(classroom.id)
            continue
            
        # Cas 2: Vérifier si l'utilisateur actuel est enseignant spécialisé pour cette classe originale
        # (collabore avec un autre maître pour cette classe)
        is_specialized_for_this_class = db.session.query(TeacherCollaboration).join(
            SharedClassroom, TeacherCollaboration.id == SharedClassroom.collaboration_id
        ).filter(
            TeacherCollaboration.specialized_teacher_id == current_user.id,
            TeacherCollaboration.is_active == True,
            SharedClassroom.original_classroom_id == classroom.id
        ).first()
        
        if is_specialized_for_this_class:
            classes_with_masters.add(classroom.id)
    
    return render_template('collaboration/index.html',
                         student_codes=student_codes,
                         parent_codes=parent_codes,
                         teacher_code=teacher_code)

@collaboration_bp.route('/create-teacher-code', methods=['POST'])
@teacher_required
def create_teacher_code():
    """Créer un nouveau code d'accès enseignant"""
    try:
        data = request.get_json()
        validity_days = data.get('validity_days')
        max_uses = data.get('max_uses')
        
        # Désactiver les anciens codes
        old_codes = TeacherAccessCode.query.filter_by(
            master_teacher_id=current_user.id,
            is_active=True
        ).all()
        
        for code in old_codes:
            code.is_active = False
        
        # Créer le nouveau code avec 1 an de validité automatique
        expires_at = datetime.utcnow() + timedelta(days=365)
        
        new_code = TeacherAccessCode(
            master_teacher_id=current_user.id,
            code=TeacherAccessCode.generate_code(),
            expires_at=expires_at
        )
        
        db.session.add(new_code)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Code enseignant créé avec succès',
            'code': new_code.code
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@collaboration_bp.route('/regenerate-teacher-code', methods=['POST'])
@teacher_required
def regenerate_teacher_code():
    """Régénérer le code d'accès enseignant"""
    try:
        # Récupérer le code actuel
        current_code = TeacherAccessCode.query.filter_by(
            master_teacher_id=current_user.id,
            is_active=True
        ).first()
        
        if not current_code:
            return jsonify({'success': False, 'message': 'Aucun code actuel trouvé'}), 404
        
        # Désactiver l'ancien code
        current_code.is_active = False
        
        # Créer un nouveau code avec 1 an de validité
        new_code = TeacherAccessCode(
            master_teacher_id=current_user.id,
            code=TeacherAccessCode.generate_code(),
            expires_at=datetime.utcnow() + timedelta(days=365)
        )
        
        db.session.add(new_code)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Code enseignant régénéré avec succès',
            'code': new_code.code
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@collaboration_bp.route('/become-master/<int:classroom_id>')
@teacher_required
def become_master(classroom_id):
    """Devenir maître de classe pour une classe existante"""
    classroom = Classroom.query.get_or_404(classroom_id)
    
    # Vérifier que l'enseignant est propriétaire de cette classe
    if classroom.teacher != current_user:
        flash('Vous devez être le propriétaire de cette classe pour devenir maître de classe', 'error')
        return redirect(url_for('collaboration.index'))
    
    # Vérifier qu'il n'y a pas déjà un maître pour cette classe cette année
    current_year = f"{datetime.now().year}-{datetime.now().year + 1}"
    existing_master = ClassMaster.query.filter_by(
        classroom_id=classroom_id,
        school_year=current_year
    ).first()
    
    if existing_master:
        # Vérifier si c'est le même enseignant qui essaie de redevenir maître
        if existing_master.master_teacher_id == current_user.id:
            flash('Vous êtes déjà maître de classe pour cette classe', 'info')
        else:
            flash('Il y a déjà un maître de classe pour cette classe cette année', 'error')
        return redirect(url_for('collaboration.index'))
    
    # Vérifier si cette classe est une classe dérivée (enseignant spécialisé)
    is_derived_class = SharedClassroom.query.filter_by(
        derived_classroom_id=classroom_id
    ).first()
    
    if is_derived_class:
        flash('Vous ne pouvez pas devenir maître de classe d\'une classe dérivée. Seules les classes originales peuvent avoir un maître de classe.', 'error')
        return redirect(url_for('collaboration.index'))
    
    # Vérifier que l'enseignant n'est pas un enseignant spécialisé pour cette classe originale
    # Un enseignant spécialisé ne peut pas devenir maître de classe d'une classe pour laquelle il collabore déjà
    is_specialized_teacher = TeacherCollaboration.query.filter_by(
        specialized_teacher_id=current_user.id,
        is_active=True
    ).join(
        SharedClassroom,
        TeacherCollaboration.id == SharedClassroom.collaboration_id
    ).filter(
        SharedClassroom.original_classroom_id == classroom_id
    ).first()
    
    if is_specialized_teacher:
        flash('Vous ne pouvez pas devenir maître de classe d\'une classe pour laquelle vous êtes enseignant spécialisé', 'error')
        return redirect(url_for('collaboration.index'))
    
    # Créer le maître de classe
    master = ClassMaster(
        classroom_id=classroom_id,
        master_teacher_id=current_user.id,
        school_year=current_year
    )
    db.session.add(master)
    db.session.commit()
    
    flash(f'Vous êtes maintenant maître de classe pour {classroom.name}', 'success')
    return redirect(url_for('collaboration.index'))

@collaboration_bp.route('/generate-code', methods=['POST'])
@teacher_required
def generate_code():
    """Générer un nouveau code d'accès"""
    # Vérifier que l'utilisateur est maître d'au moins une classe
    master_classes = current_user.get_master_classes()
    if not master_classes:
        return jsonify({'success': False, 'message': 'Vous devez être maître de classe pour générer des codes'})
    
    max_uses = request.form.get('max_uses')
    expires_in_days = request.form.get('expires_in_days')
    
    # Traiter les paramètres optionnels
    max_uses = int(max_uses) if max_uses and max_uses.isdigit() else None
    
    expires_at = None
    if expires_in_days and expires_in_days.isdigit():
        expires_at = datetime.utcnow() + timedelta(days=int(expires_in_days))
    
    # Générer le code
    access_code = current_user.generate_access_code(max_uses=max_uses, expires_at=expires_at)
    
    return jsonify({
        'success': True,
        'code': access_code.code,
        'message': f'Code généré avec succès : {access_code.code}'
    })

@collaboration_bp.route('/join-teacher', methods=['GET', 'POST'])
@teacher_required
def join_teacher():
    """Se lier à un enseignant maître de classe"""
    # Debug : afficher les informations de l'utilisateur
    print(f"DEBUG - User authenticated: {current_user.is_authenticated}")
    print(f"DEBUG - User type: {type(current_user)}")
    print(f"DEBUG - User ID: {current_user.get_id() if current_user.is_authenticated else 'Not authenticated'}")
    
    if request.method == 'POST':
        access_code = request.form.get('access_code', '').strip().upper()
        master_teacher_name = request.form.get('master_teacher_name', '').strip()
        
        if not access_code or not master_teacher_name:
            flash('Code d\'accès et nom du maître de classe requis', 'error')
            return render_template('collaboration/join_teacher.html')
        
        # Rechercher le code d'accès
        code_obj = TeacherAccessCode.query.filter_by(code=access_code).first()
        
        if not code_obj or not code_obj.is_valid():
            flash('Code d\'accès invalide ou expiré', 'error')
            return render_template('collaboration/join_teacher.html')
        
        # Vérifier que le nom du maître correspond
        master_teacher = code_obj.master_teacher
        if (master_teacher_name.lower() != master_teacher.username.lower() and 
            master_teacher_name.lower() != master_teacher.email.lower()):
            flash(f'Le nom ne correspond pas. Maître de classe : {master_teacher.username}', 'error')
            return render_template('collaboration/join_teacher.html')
        
        # Vérifier qu'il n'y a pas déjà une collaboration
        existing_collaboration = TeacherCollaboration.query.filter_by(
            specialized_teacher_id=current_user.id,
            master_teacher_id=master_teacher.id
        ).first()
        
        if existing_collaboration:
            flash('Vous collaborez déjà avec cet enseignant', 'error')
            return render_template('collaboration/join_teacher.html')
        
        # Créer la collaboration
        collaboration = TeacherCollaboration(
            specialized_teacher_id=current_user.id,
            master_teacher_id=master_teacher.id,
            access_code_id=code_obj.id
        )
        db.session.add(collaboration)
        
        # Utiliser le code
        code_obj.use_code()
        
        db.session.commit()
        
        flash(f'Collaboration établie avec {master_teacher.username}', 'success')
        return redirect(url_for('collaboration.select_class', collaboration_id=collaboration.id))
    
    return render_template('collaboration/join_teacher.html')

@collaboration_bp.route('/select-class/<int:collaboration_id>')
@teacher_required
def select_class(collaboration_id):
    """Sélectionner une classe du maître de classe"""
    collaboration = TeacherCollaboration.query.get_or_404(collaboration_id)
    
    # Vérifier que l'utilisateur est bien l'enseignant spécialisé de cette collaboration
    if collaboration.specialized_teacher_id != current_user.id:
        flash('Accès non autorisé', 'error')
        return redirect(url_for('collaboration.index'))
    
    # Récupérer les classes du maître de classe
    master_classes_raw = collaboration.master_teacher.get_master_classes()
    
    # Grouper les classes par nom de groupe pour éviter les doublons
    from collections import defaultdict
    grouped_classes = defaultdict(list)
    
    for master_class in master_classes_raw:
        classroom = master_class.classroom
        group_name = classroom.class_group or classroom.name
        grouped_classes[group_name].append(master_class)
    
    # Créer la structure finale pour le template
    master_classes_grouped = []
    for group_name, classes_in_group in grouped_classes.items():
        if len(classes_in_group) > 1:
            # Groupe multi-disciplines : combiner les matières
            subjects = sorted([c.classroom.subject for c in classes_in_group if c.classroom.subject])
            combined_subject = '/'.join(subjects)
            
            # Utiliser la première classe du groupe comme représentant
            representative_class = classes_in_group[0]
            representative_class.classroom.display_name = group_name
            representative_class.classroom.combined_subject = combined_subject
            representative_class.classroom.is_multi_subject = True
            representative_class.classroom.all_classroom_ids = [c.classroom.id for c in classes_in_group]
            
            master_classes_grouped.append(representative_class)
        else:
            # Classe unique
            single_class = classes_in_group[0]
            single_class.classroom.display_name = single_class.classroom.name
            single_class.classroom.combined_subject = single_class.classroom.subject
            single_class.classroom.is_multi_subject = False
            single_class.classroom.all_classroom_ids = [single_class.classroom.id]
            
            master_classes_grouped.append(single_class)
    
    return render_template('collaboration/select_class.html',
                         collaboration=collaboration,
                         master_classes=master_classes_grouped)

@collaboration_bp.route('/create-shared-class', methods=['POST'])
@teacher_required
def create_shared_class():
    """Créer une classe dérivée à partir d'une classe du maître"""
    collaboration_id = request.form.get('collaboration_id')
    original_classroom_id = request.form.get('original_classroom_id')
    subject = request.form.get('subject', '').strip()
    new_class_name = request.form.get('new_class_name', '').strip()
    is_multi_subject = request.form.get('is_multi_subject') == 'true'
    all_classroom_ids = request.form.get('all_classroom_ids', '').strip()
    
    if not all([collaboration_id, original_classroom_id, subject]):
        flash('Tous les champs sont requis', 'error')
        return redirect(request.referrer)
    
    collaboration = TeacherCollaboration.query.get_or_404(collaboration_id)
    original_classroom = Classroom.query.get_or_404(original_classroom_id)
    
    # Si c'est une classe multi-disciplines, récupérer toutes les classes du groupe
    if is_multi_subject and all_classroom_ids:
        try:
            classroom_ids = [int(id.strip()) for id in all_classroom_ids.split(',') if id.strip()]
        except ValueError:
            classroom_ids = [original_classroom_id]
    else:
        classroom_ids = [original_classroom_id]
    
    # Vérifier les permissions
    if collaboration.specialized_teacher_id != current_user.id:
        flash('Accès non autorisé', 'error')
        return redirect(url_for('collaboration.index'))
    
    # Vérifier qu'il n'y a pas déjà une classe partagée pour cette collaboration/classe/matière
    existing_shared = SharedClassroom.query.filter_by(
        collaboration_id=collaboration_id,
        original_classroom_id=original_classroom_id,
        subject=subject
    ).first()
    
    if existing_shared:
        flash('Une classe existe déjà pour cette matière', 'error')
        return redirect(request.referrer)
    
    # Créer la nouvelle classe dérivée
    if not new_class_name:
        if is_multi_subject:
            # Pour les classes multi-disciplines, utiliser le nom du groupe
            group_name = original_classroom.class_group or original_classroom.name
            new_class_name = f"{group_name} - {subject}"
        else:
            new_class_name = f"{original_classroom.name} - {subject}"
    
    derived_classroom = Classroom(
        user_id=current_user.id,
        name=new_class_name,
        subject=subject,
        color=original_classroom.color,
        class_group=original_classroom.class_group  # Garder le même groupe
    )
    db.session.add(derived_classroom)
    db.session.flush()  # Pour obtenir l'ID
    
    # Créer le lien de classe partagée avec la classe principale
    shared_classroom = SharedClassroom(
        collaboration_id=collaboration_id,
        original_classroom_id=original_classroom_id,
        derived_classroom_id=derived_classroom.id,
        subject=subject
    )
    db.session.add(shared_classroom)
    
    # Copier les élèves de TOUTES les classes du groupe si multi-disciplines
    all_students = set()  # Utiliser un set pour éviter les doublons
    
    for classroom_id in classroom_ids:
        classroom_students = Student.query.filter_by(classroom_id=classroom_id).all()
        for student in classroom_students:
            # Ajouter par tuple (nom, prénom, email) pour détecter les doublons
            student_key = (student.first_name, student.last_name, student.email or '')
            all_students.add((student_key, student))
    
    # Créer les élèves dans la nouvelle classe
    for _, student in all_students:
        # Créer une copie de l'élève pour la nouvelle classe
        derived_student = Student(
            classroom_id=derived_classroom.id,
            user_id=current_user.id,  # L'enseignant spécialisé devient propriétaire
            first_name=student.first_name,
            last_name=student.last_name,
            email=student.email,
            date_of_birth=student.date_of_birth,
            parent_email_mother=student.parent_email_mother,
            parent_email_father=student.parent_email_father,
            additional_info=student.additional_info
        )
        db.session.add(derived_student)
        db.session.flush()
        
        # Créer le lien entre élève et classe
        student_link = StudentClassroomLink(
            student_id=derived_student.id,
            classroom_id=derived_classroom.id,
            subject=subject,
            is_primary=False,
            added_by_teacher_id=current_user.id
        )
        db.session.add(student_link)
    
    db.session.commit()
    
    group_info = f" (groupe {original_classroom.class_group})" if is_multi_subject else ""
    flash(f'Classe "{new_class_name}" créée avec succès{group_info}', 'success')
    return redirect(url_for('planning.manage_classes'))

@collaboration_bp.route('/deactivate-code/<int:code_id>')
@teacher_required
def deactivate_code(code_id):
    """Désactiver un code d'accès"""
    access_code = TeacherAccessCode.query.get_or_404(code_id)
    
    if access_code.master_teacher_id != current_user.id:
        flash('Accès non autorisé', 'error')
        return redirect(url_for('collaboration.index'))
    
    access_code.is_active = False
    db.session.commit()
    
    flash('Code d\'accès désactivé', 'success')
    return redirect(url_for('collaboration.index'))

@collaboration_bp.route('/end-collaboration/<int:collaboration_id>')
@teacher_required
def end_collaboration(collaboration_id):
    """Terminer une collaboration"""
    collaboration = TeacherCollaboration.query.get_or_404(collaboration_id)
    
    # Vérifier que l'utilisateur est soit le maître soit l'enseignant spécialisé
    if collaboration.specialized_teacher_id != current_user.id and collaboration.master_teacher_id != current_user.id:
        flash('Accès non autorisé', 'error')
        return redirect(url_for('collaboration.index'))
    
    collaboration.is_active = False
    db.session.commit()
    
    flash('Collaboration terminée', 'success')
    return redirect(url_for('collaboration.index'))

@collaboration_bp.route('/delete-collaboration/<int:collaboration_id>')
@teacher_required
def delete_collaboration(collaboration_id):
    """Supprimer complètement une collaboration et ses classes dérivées"""
    collaboration = TeacherCollaboration.query.get_or_404(collaboration_id)
    
    # Vérifier que l'utilisateur est l'enseignant spécialisé de cette collaboration
    if collaboration.specialized_teacher_id != current_user.id:
        flash('Seul l\'enseignant spécialisé peut supprimer sa collaboration', 'error')
        return redirect(url_for('collaboration.index'))
    
    try:
        # Récupérer toutes les classes partagées de cette collaboration
        shared_classrooms = SharedClassroom.query.filter_by(collaboration_id=collaboration_id).all()
        
        # Pour chaque classe partagée, supprimer la classe dérivée et ses données
        for shared_classroom in shared_classrooms:
            derived_classroom = shared_classroom.derived_classroom
            
            # Supprimer les liens élève-classe pour cette classe dérivée
            StudentClassroomLink.query.filter_by(classroom_id=derived_classroom.id).delete()
            
            # Supprimer les élèves de la classe dérivée
            # (cela supprime automatiquement les notes, absences, etc. grâce aux cascades)
            from models.student import Student
            Student.query.filter_by(classroom_id=derived_classroom.id).delete()
            
            # Supprimer la classe dérivée elle-même
            db.session.delete(derived_classroom)
            
            # Supprimer l'enregistrement de classe partagée
            db.session.delete(shared_classroom)
        
        # Supprimer la collaboration
        db.session.delete(collaboration)
        
        db.session.commit()
        flash('Collaboration et classes associées supprimées avec succès', 'success')
        
    except Exception as e:
        db.session.rollback()
        flash(f'Erreur lors de la suppression : {str(e)}', 'error')
    
    return redirect(url_for('collaboration.index'))