from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_required, current_user
from extensions import db
from models.user import User, Holiday, Break
from models.classroom import Classroom
from models.college import College, CollegeHoliday, CollegeBreak
from flask_wtf import FlaskForm
from wtforms import StringField, DateField, TimeField, IntegerField, FieldList, FormField, BooleanField, SubmitField, SelectField, RadioField
from wtforms.validators import DataRequired, NumberRange
from datetime import datetime, time
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.vaud_holidays import get_vaud_holidays

# ========================================
# NOUVEAU SYSTÈME DE COLLABORATION SIMPLE
# ========================================

def _cleanup_mixed_class_residual_links(current_user):
    """
    Nettoie les liens résiduels de classes mixtes supprimées pour éviter la reconstitution automatique
    """
    try:
        from models.mixed_group import MixedGroup, MixedGroupStudent
        from models.teacher_invitation import TeacherInvitation
        
        # Supprimer les invitations en attente de l'utilisateur actuel
        pending_invitations = TeacherInvitation.query.filter_by(
            requesting_teacher_id=current_user.id,
            status='pending'
        ).all()
        
        for invitation in pending_invitations:
            db.session.delete(invitation)
            print(f"DEBUG: Deleted pending invitation to teacher {invitation.target_master_teacher_id}")
        
        # Supprimer les liens d'élèves des groupes mixtes de l'utilisateur qui n'ont plus de groupe mixte actif
        orphaned_student_links = MixedGroupStudent.query.join(
            MixedGroup, MixedGroupStudent.mixed_group_id == MixedGroup.id
        ).filter(MixedGroup.teacher_id == current_user.id).all()
        
        for link in orphaned_student_links:
            # Vérifier si le groupe mixte associé existe encore
            mixed_group = MixedGroup.query.get(link.mixed_group_id)
            if not mixed_group:
                db.session.delete(link)
                print(f"DEBUG: Deleted orphaned student link for student {link.student_id}")
        
        db.session.commit()
        print(f"DEBUG: Cleaned up residual mixed class links for user {current_user.id}")
        
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Failed to cleanup residual links: {str(e)}")

def _cleanup_orphaned_schedules():
    """
    Nettoie automatiquement les plannings orphelins qui référencent des groupes mixtes ou classes supprimés
    """
    try:
        from models.schedule import Schedule
        
        # Supprimer les plannings qui référencent des groupes mixtes supprimés
        orphaned_mixed_group_schedules = db.session.execute(
            db.text("""
                DELETE FROM schedules 
                WHERE mixed_group_id IS NOT NULL 
                AND mixed_group_id NOT IN (SELECT id FROM mixed_groups)
            """)
        )
        
        # Supprimer les plannings qui référencent des classes supprimées
        orphaned_classroom_schedules = db.session.execute(
            db.text("""
                DELETE FROM schedules 
                WHERE classroom_id IS NOT NULL 
                AND classroom_id NOT IN (SELECT id FROM classrooms)
            """)
        )
        
        db.session.commit()
        print(f"DEBUG: Cleaned up orphaned schedules (mixed groups and classrooms)")
        
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Failed to cleanup orphaned schedules: {str(e)}")

def _handle_join_by_access_code(request, current_user):
    """
    Nouveau système pour rejoindre une classe via code d'accès
    Support: code → maître → classe → nom personnalisé + multiples disciplines
    """
    from models.class_collaboration import TeacherAccessCode, TeacherCollaboration, SharedClassroom
    from models.student import Student
    
    # DEBUG: Afficher toutes les données reçues
    print("DEBUG _handle_join_by_access_code: Form data received:")
    for key, value in request.form.items():
        print(f"  {key} = '{value}'")
    
    # Récupérer les données du formulaire (nouvelle structure)
    access_code = request.form.get('access_code', '').strip().upper()
    target_classroom_id = request.form.get('join_target_classroom_id', '').strip()
    personal_class_name = request.form.get('personal_class_name', '').strip()
    
    # Récupérer les disciplines depuis l'interface
    disciplines = []
    
    for key in request.form.keys():
        if key.startswith('join_disciplines[') and key.endswith('][subject]'):
            index = key.split('[')[1].split(']')[0]
            subject = request.form.get(f'join_disciplines[{index}][subject]', '').strip()
            color = request.form.get(f'join_disciplines[{index}][color]', '#4F46E5').strip()
            
            if subject:
                disciplines.append({
                    'subject': subject,
                    'color': color
                })
    
    # Validation des champs
    if not all([access_code, target_classroom_id, personal_class_name]) or not disciplines:
        flash('Code, classe cible, nom personnalisé et au moins une discipline requis', 'error')
        return None
    
    # 1. Vérifier le code d'accès
    code_obj = TeacherAccessCode.query.filter_by(code=access_code).first()
    if not code_obj or not code_obj.is_valid():
        flash('Code d\'accès invalide ou expiré', 'error')
        return None
    
    master_teacher = code_obj.master_teacher
    
    # 2. Vérifier la classe cible
    target_classroom = Classroom.query.filter_by(
        id=target_classroom_id,
        user_id=master_teacher.id
    ).first()
    
    if not target_classroom:
        flash('Classe cible introuvable', 'error')
        return None
    
    # 3. Vérifier l'unicité pour chaque discipline
    for discipline in disciplines:
        existing_class = Classroom.query.filter_by(
            user_id=current_user.id,
            class_group=personal_class_name,  # Nom personnalisé
            subject=discipline['subject']
        ).first()
        
        if existing_class:
            flash(f'Vous avez déjà une classe avec le nom \"{personal_class_name}\" en {discipline["subject"]}', 'error')
            return None
    
    # 4. Créer ou récupérer la collaboration
    collaboration = TeacherCollaboration.query.filter_by(
        specialized_teacher_id=current_user.id,
        master_teacher_id=master_teacher.id
    ).first()
    
    if not collaboration:
        collaboration = TeacherCollaboration(
            specialized_teacher_id=current_user.id,
            master_teacher_id=master_teacher.id,
            access_code_id=code_obj.id
        )
        db.session.add(collaboration)
        db.session.flush()
    
    # 5. Créer les classes spécialisées pour chaque discipline
    created_classes = []
    total_copied_students = 0
    
    # Récupérer les élèves originaux une seule fois
    original_students = Student.query.filter_by(classroom_id=target_classroom.id).all()
    
    for discipline in disciplines:
        # Créer la classe spécialisée
        specialized_classroom = Classroom(
            user_id=current_user.id,
            name=target_classroom.name,  # Nom original du maître
            class_group=personal_class_name,  # Nom personnalisé (même pour toutes)
            subject=discipline['subject'],
            color=discipline['color']
        )
        db.session.add(specialized_classroom)
        db.session.flush()
        
        # Créer le lien de partage
        shared_classroom = SharedClassroom(
            collaboration_id=collaboration.id,
            original_classroom_id=target_classroom.id,
            derived_classroom_id=specialized_classroom.id,
            subject=discipline['subject']
        )
        db.session.add(shared_classroom)
        
        # Copier tous les élèves pour cette discipline
        for original_student in original_students:
            derived_student = Student(
                classroom_id=specialized_classroom.id,
                user_id=current_user.id,
                first_name=original_student.first_name,
                last_name=original_student.last_name,
                email=original_student.email,
                date_of_birth=original_student.date_of_birth,
                parent_email_mother=original_student.parent_email_mother,
                parent_email_father=original_student.parent_email_father,
                additional_info=original_student.additional_info
            )
            db.session.add(derived_student)
            total_copied_students += 1
        
        created_classes.append(discipline['subject'])
    
    # 6. Utiliser le code et valider
    code_obj.use_code()
    
    try:
        db.session.commit()
        disciplines_list = ', '.join(created_classes)
        flash(f'Classes "{personal_class_name}" créées avec succès ! Disciplines: {disciplines_list}. {total_copied_students} élèves copiés de la classe de {master_teacher.username}', 'success')
        return redirect(url_for('setup.manage_classrooms'))
    except Exception as e:
        db.session.rollback()
        flash(f'Erreur lors de la création : {str(e)}', 'error')
        return None

def _handle_invitation_request(request, current_user):
    """
    Nouveau système pour envoyer une invitation
    Support de multiples disciplines avec même personal_class_name
    """
    from models.teacher_invitation import TeacherInvitation
    
    # Récupérer les données du formulaire (nouvelle structure)
    master_teacher_name = request.form.get('invite_master_teacher_name', '').strip()
    target_classroom_id = request.form.get('target_classroom_id', '').strip()
    message = request.form.get('invite_message', '').strip()
    personal_class_name = request.form.get('personal_class_name', '').strip()
    
    # Récupérer les disciplines depuis l'interface
    disciplines = []
    
    for key in request.form.keys():
        if key.startswith('disciplines[') and key.endswith('][subject]'):
            index = key.split('[')[1].split(']')[0]
            subject = request.form.get(f'disciplines[{index}][subject]', '').strip()
            color = request.form.get(f'disciplines[{index}][color]', '#4F46E5').strip()
            
            if subject:
                disciplines.append({
                    'subject': subject,
                    'color': color
                })
    
    # Validation
    if not all([master_teacher_name, target_classroom_id, personal_class_name]) or not disciplines:
        flash('Tous les champs sont requis (maître, classe cible, nom personnalisé, disciplines)', 'error')
        return None
    
    # 1. Trouver le maître de classe
    master_teacher = User.query.filter(
        (User.username.ilike(f'%{master_teacher_name}%')) |
        (User.email.ilike(f'%{master_teacher_name}%'))
    ).first()
    
    if not master_teacher:
        flash('Maître de classe introuvable', 'error')
        return None
    
    # 2. Vérifier la classe cible
    target_classroom = Classroom.query.filter_by(
        id=target_classroom_id,
        user_id=master_teacher.id
    ).first()
    
    if not target_classroom:
        flash('Classe cible introuvable', 'error')
        return None
    
    # 3. Vérifier l'unicité pour chaque discipline
    for discipline in disciplines:
        existing_class = Classroom.query.filter_by(
            user_id=current_user.id,
            class_group=personal_class_name,
            subject=discipline['subject']
        ).first()
        
        if existing_class:
            flash(f'Vous avez déjà une classe avec le nom "{personal_class_name}" en {discipline["subject"]}', 'error')
            return None
        
        # Vérifier qu'il n'y a pas déjà une invitation identique en attente
        existing_invitation = TeacherInvitation.query.filter_by(
            requesting_teacher_id=current_user.id,
            target_classroom_id=target_classroom.id,
            proposed_subject=discipline['subject'],
            status='pending'
        ).first()
        
        if existing_invitation:
            flash(f'Vous avez déjà une invitation en attente pour cette classe en {discipline["subject"]}', 'error')
            return None
    
    # 4. Créer les classes temporaires et invitations pour chaque discipline
    created_invitations = []
    
    for discipline in disciplines:
        # Créer la classe temporaire
        temp_classroom = Classroom(
            user_id=current_user.id,
            name=target_classroom.name,  # Nom original
            class_group=personal_class_name,  # Nom personnalisé
            subject=discipline['subject'],
            color=discipline['color'],
            is_temporary=True  # Invisible jusqu'à acceptation
        )
        db.session.add(temp_classroom)
        db.session.flush()
        
        # Créer l'invitation
        invitation = TeacherInvitation(
            target_master_teacher_id=master_teacher.id,
            requesting_teacher_id=current_user.id,
            target_classroom_id=target_classroom.id,
            proposed_class_name=personal_class_name,
            proposed_subject=discipline['subject'],
            proposed_color=discipline['color'],
            message=message,
            status='pending'
        )
        db.session.add(invitation)
        created_invitations.append(discipline['subject'])
    
    try:
        db.session.commit()
        disciplines_list = ', '.join(created_invitations)
        flash(f'Invitations envoyées à {master_teacher.username} pour la classe "{personal_class_name}" en {disciplines_list}', 'success')
        return redirect(url_for('setup.manage_classrooms'))
    except Exception as e:
        db.session.rollback()
        flash(f'Erreur lors de l\'envoi : {str(e)}', 'error')
        return None

setup_bp = Blueprint('setup', __name__, url_prefix='/setup')

@setup_bp.route('/colleges/search', methods=['POST'])
@login_required
def search_colleges():
    """API pour l'autocomplétion des noms de collèges"""
    data = request.get_json()
    query = data.get('query', '').strip()
    
    if len(query) < 2:
        return jsonify({'colleges': []})
    
    # Rechercher les collèges qui commencent par la requête
    colleges = College.query.filter(
        College.name.ilike(f'{query}%')
    ).order_by(College.name).limit(10).all()
    
    results = []
    for college in colleges:
        results.append({
            'id': college.id,
            'name': college.name,
            'has_config': bool(college.school_year_start)  # Indique si le collège a une config complète
        })
    
    return jsonify({'colleges': results})

@setup_bp.route('/colleges/config', methods=['POST'])
@login_required
def get_college_config():
    """API pour récupérer la configuration d'un collège"""
    data = request.get_json()
    college_name = data.get('college_name', '').strip()
    
    if not college_name:
        return jsonify({'exists': False})
    
    college = College.query.filter_by(name=college_name).first()
    
    if college and college.school_year_start:
        return jsonify({
            'exists': True,
            'has_config': True,
            'data': college.to_dict()
        })
    elif college:
        return jsonify({
            'exists': True,
            'has_config': False,
            'message': 'Ce collège existe mais n\'a pas de configuration complète'
        })
    else:
        return jsonify({
            'exists': False,
            'message': 'Nouveau collège - vous pouvez créer sa configuration'
        })

class ClassroomForm(FlaskForm):
    name = StringField('Nom de la classe', validators=[DataRequired()])
    subject = StringField('Matière enseignée', validators=[DataRequired()])
    color = StringField('Couleur', validators=[DataRequired()], default='#4F46E5')

class ClassroomSetupForm(FlaskForm):
    setup_type = RadioField('Type de configuration', 
                           choices=[
                               ('master', 'Créer mes propres classes (maître de classe)'),
                               ('specialized', 'Me lier à un enseignant existant (enseignant spécialisé)')
                           ],
                           validators=[DataRequired()],
                           default='master')
    
    # Pour la création de classes (maître)
    classrooms = FieldList(FormField(ClassroomForm), min_entries=1)
    
    # Pour la liaison (spécialisé)
    access_code = StringField('Code d\'accès')
    master_teacher_name = StringField('Nom du maître de classe')
    
    submit = SubmitField('Valider')

class HolidayForm(FlaskForm):
    name = StringField('Nom des vacances/congé', validators=[DataRequired()])
    start_date = DateField('Date de début', validators=[DataRequired()])
    end_date = DateField('Date de fin', validators=[DataRequired()])

class BreakForm(FlaskForm):
    name = StringField('Nom de la pause', validators=[DataRequired()])
    start_time = TimeField('Heure de début', validators=[DataRequired()])
    end_time = TimeField('Heure de fin', validators=[DataRequired()])
    is_major_break = BooleanField('Grande pause (pas de pause intercours après)')

class InitialSetupForm(FlaskForm):
    # Copie de configuration
    college_name = StringField('Nom du collège (optionnel)', 
                              description='Entrez le nom de votre collège pour copier sa configuration ou en créer un nouveau')
    
    # Année scolaire
    school_year_start = DateField('Début de l\'année scolaire')
    school_year_end = DateField('Fin de l\'année scolaire')

    # Horaires
    day_start_time = TimeField('Heure de début des cours')
    day_end_time = TimeField('Heure de fin des cours')
    period_duration = IntegerField('Durée d\'une période (minutes)', validators=[
        NumberRange(min=30, max=120, message="La durée doit être entre 30 et 120 minutes")
    ])
    break_duration = IntegerField('Durée de la pause intercours (minutes)', validators=[
        NumberRange(min=5, max=30, message="La pause doit être entre 5 et 30 minutes")
    ])
    
    # Fuseau horaire
    timezone_offset = IntegerField('Décalage horaire (heures)', validators=[
        NumberRange(min=-12, max=12, message="Le décalage doit être entre -12 et +12 heures")
    ], default=0)

    submit = SubmitField('Valider la configuration')
    
    def validate(self, extra_validators=None):
        """Validation personnalisée : les champs sont requis seulement si on ne copie pas"""
        initial_validation = super().validate(extra_validators)
        
        # Si on copie d'un collège existant, pas besoin de valider les autres champs
        if self.college_name.data:
            return True
            
        # Sinon, vérifier que tous les champs sont remplis
        errors = False
        if not self.school_year_start.data:
            self.school_year_start.errors.append('Ce champ est requis.')
            errors = True
        if not self.school_year_end.data:
            self.school_year_end.errors.append('Ce champ est requis.')
            errors = True
        if not self.day_start_time.data:
            self.day_start_time.errors.append('Ce champ est requis.')
            errors = True
        if not self.day_end_time.data:
            self.day_end_time.errors.append('Ce champ est requis.')
            errors = True
        if not self.period_duration.data:
            self.period_duration.errors.append('Ce champ est requis.')
            errors = True
        if not self.break_duration.data:
            self.break_duration.errors.append('Ce champ est requis.')
            errors = True
            
        return initial_validation and not errors

@setup_bp.route('/initial', methods=['GET', 'POST'])
@login_required
def initial_setup():
    form = InitialSetupForm()

    if form.validate_on_submit():
        # Vérifier s'il faut copier la configuration d'un collège
        if form.college_name.data:
            college_name = form.college_name.data.strip()
            college = College.query.filter_by(name=college_name).first()
            
            if college and college.school_year_start:
                # Copier la configuration du collège existant
                current_user.school_year_start = college.school_year_start
                current_user.school_year_end = college.school_year_end
                current_user.day_start_time = college.day_start_time
                current_user.day_end_time = college.day_end_time
                current_user.period_duration = college.period_duration
                current_user.break_duration = college.break_duration
                current_user.college_name = college_name  # Associer l'utilisateur au collège
                
                try:
                    db.session.commit()
                    flash(f'Configuration copiée depuis le collège "{college_name}" avec succès !', 'success')
                    return redirect(url_for('setup.manage_holidays'))
                except Exception as e:
                    db.session.rollback()
                    flash(f'Erreur lors de la copie : {str(e)}', 'error')
            else:
                # Nouveau collège ou collège sans configuration
                # On continue avec la configuration manuelle et on créera le collège plus tard
                current_user.college_name = college_name
        
        # Configuration manuelle (sans copie)
        # Mise à jour des informations utilisateur avec les données du formulaire
        current_user.school_year_start = form.school_year_start.data
        current_user.school_year_end = form.school_year_end.data
        current_user.day_start_time = form.day_start_time.data
        current_user.day_end_time = form.day_end_time.data
        current_user.period_duration = form.period_duration.data
        current_user.break_duration = form.break_duration.data
        current_user.timezone_offset = form.timezone_offset.data

        # Créer ou mettre à jour le collège si spécifié
        if hasattr(current_user, 'college_name') and current_user.college_name:
            college = College.query.filter_by(name=current_user.college_name).first()
            if not college:
                # Créer un nouveau collège
                college = College(
                    name=current_user.college_name,
                    created_by_id=current_user.id,
                    school_year_start=form.school_year_start.data,
                    school_year_end=form.school_year_end.data,
                    day_start_time=form.day_start_time.data,
                    day_end_time=form.day_end_time.data,
                    period_duration=form.period_duration.data,
                    break_duration=form.break_duration.data
                )
                db.session.add(college)
            elif not college.school_year_start:
                # Mettre à jour un collège existant sans configuration
                college.school_year_start = form.school_year_start.data
                college.school_year_end = form.school_year_end.data
                college.day_start_time = form.day_start_time.data
                college.day_end_time = form.day_end_time.data
                college.period_duration = form.period_duration.data
                college.break_duration = form.break_duration.data

        try:
            db.session.commit()
            flash('Configuration initiale enregistrée avec succès !', 'success')
            return redirect(url_for('setup.manage_holidays'))
        except Exception as e:
            db.session.rollback()
            flash(f'Erreur lors de la sauvegarde : {str(e)}', 'error')

    # Pré-remplir si déjà configuré
    if current_user.school_year_start:
        form.school_year_start.data = current_user.school_year_start
        form.school_year_end.data = current_user.school_year_end
        form.day_start_time.data = current_user.day_start_time
        form.day_end_time.data = current_user.day_end_time
        form.period_duration.data = current_user.period_duration
        form.break_duration.data = current_user.break_duration
        form.timezone_offset.data = current_user.timezone_offset or 0

    # Ajouter l'heure du serveur au template
    from datetime import datetime
    server_time = datetime.utcnow().strftime('%H:%M:%S')
    
    return render_template('setup/initial_setup.html', form=form, server_time=server_time)

@setup_bp.route('/check-teacher', methods=['POST'])
@login_required
def check_teacher():
    """Vérifier si un enseignant existe et retourner ses paramètres"""
    
    username_or_email = request.json.get('username_or_email', '').strip()
    
    if not username_or_email:
        return jsonify({'exists': False})
    
    teacher = User.query.filter(
        ((User.username == username_or_email) | 
         (User.email == username_or_email)) &
        (User.id != current_user.id)
    ).first()
    
    if teacher and teacher.school_year_start:
        return jsonify({
            'exists': True,
            'data': {
                'school_year_start': teacher.school_year_start.strftime('%Y-%m-%d') if teacher.school_year_start else '',
                'school_year_end': teacher.school_year_end.strftime('%Y-%m-%d') if teacher.school_year_end else '',
                'day_start_time': teacher.day_start_time.strftime('%H:%M') if teacher.day_start_time else '',
                'day_end_time': teacher.day_end_time.strftime('%H:%M') if teacher.day_end_time else '',
                'period_duration': teacher.period_duration,
                'break_duration': teacher.break_duration
            }
        })
    elif teacher:
        return jsonify({
            'exists': True,
            'incomplete': True,
            'message': f"L'enseignant {teacher.username} n'a pas encore de configuration complète."
        })
    else:
        return jsonify({'exists': False})

@setup_bp.route('/search-teachers', methods=['POST'])
@login_required
def search_teachers():
    """API pour l'autocomplétion des noms d'enseignants"""
    data = request.get_json()
    query = data.get('query', '').strip()
    
    if len(query) < 2:
        return jsonify({'teachers': []})
    
    # Rechercher seulement les enseignants qui sont maîtres de classe
    from models.class_collaboration import ClassMaster
    
    # Joindre avec ClassMaster pour récupérer seulement les maîtres de classe
    teachers = User.query.join(ClassMaster, User.id == ClassMaster.master_teacher_id).filter(
        User.id != current_user.id,  # Exclure l'utilisateur actuel
        User.college_name == current_user.college_name,  # Même collège
        (User.username.ilike(f'{query}%') | User.email.ilike(f'{query}%'))  # Commence par la requête
    ).order_by(User.username).limit(10).all()
    
    results = []
    for teacher in teachers:
        results.append({
            'id': teacher.id,
            'username': teacher.username,
            'email': teacher.email,
            'display_name': f"{teacher.username} ({teacher.email})",
            'is_master': True  # Toujours True car on ne récupère que les maîtres
        })
    
    return jsonify({'teachers': results})

@setup_bp.route('/api/teacher-classes/<int:teacher_id>', methods=['GET'])
@login_required
def get_teacher_classes_by_id(teacher_id):
    """API pour récupérer les classes d'un enseignant par son ID"""
    print(f"DEBUG: get_teacher_classes_by_id called with teacher_id: {teacher_id}")
    
    # Vérifier que l'enseignant existe
    teacher = User.query.get(teacher_id)
    if not teacher:
        print(f"DEBUG: Teacher with ID {teacher_id} not found")
        return jsonify({'classes': [], 'error': 'Teacher not found'}), 404
    
    print(f"DEBUG: Found teacher: {teacher.username}")
    
    # Récupérer les classes où cet enseignant est maître de classe
    from models.class_collaboration import ClassMaster
    class_masters = ClassMaster.query.filter_by(master_teacher_id=teacher_id).all()
    
    print(f"DEBUG: Found {len(class_masters)} class master entries")
    
    # Grouper par classe principale (class_group)
    from collections import defaultdict
    groups = defaultdict(list)
    
    for cm in class_masters:
        classroom = cm.classroom
        group_name = classroom.class_group or classroom.name
        groups[group_name].append(classroom)
        print(f"DEBUG: Added classroom {classroom.name} to group {group_name}")
    
    results = []
    for group_name, classrooms in groups.items():
        # Prendre la première classe pour représenter le groupe
        primary_classroom = classrooms[0]
        subjects = [c.subject for c in classrooms]
        
        results.append({
            'id': primary_classroom.id,
            'name': group_name,
            'subject': ', '.join(subjects),
            'subjects': subjects,
            'color': primary_classroom.color,
            'classroom_ids': [c.id for c in classrooms]
        })
        print(f"DEBUG: Added result: {group_name} with subjects {subjects}")
    
    print(f"DEBUG: Returning {len(results)} classes")
    return jsonify({'classes': results})

@setup_bp.route('/get-teacher-classes', methods=['POST'])
@login_required
def get_teacher_classes():
    """API pour récupérer les classes d'un maître de classe"""
    data = request.get_json()
    teacher_name = data.get('teacher_name', '').strip()
    
    print(f"DEBUG: get_teacher_classes called with teacher_name: '{teacher_name}'")
    
    if not teacher_name:
        print("DEBUG: No teacher name provided")
        return jsonify({'classes': []})
    
    # Trouver l'enseignant (recherche exacte et avec correspondance partielle)
    teacher = User.query.filter(
        (User.username.ilike(teacher_name) | 
         User.email.ilike(teacher_name) |
         User.username.ilike(f'%{teacher_name}%') | 
         User.email.ilike(f'%{teacher_name}%')),
        User.id != current_user.id
    ).first()
    
    print(f"DEBUG: Found teacher: {teacher.username if teacher else 'None'}")
    
    if not teacher:
        print("DEBUG: Teacher not found")
        return jsonify({'classes': []})
    
    # Récupérer les classes dont il est maître
    from models.class_collaboration import ClassMaster
    class_masters = ClassMaster.query.filter_by(master_teacher_id=teacher.id).all()
    
    print(f"DEBUG: Found {len(class_masters)} class_masters for teacher {teacher.username}")
    
    # Grouper par class_group
    from collections import defaultdict
    groups = defaultdict(list)
    
    for cm in class_masters:
        classroom = cm.classroom
        group_name = classroom.class_group or classroom.name
        groups[group_name].append(classroom)
        print(f"DEBUG: Added classroom {classroom.name} to group {group_name}")
    
    results = []
    for group_name, classrooms in groups.items():
        # Prendre la première classe pour représenter le groupe
        primary_classroom = classrooms[0]
        subjects = [c.subject for c in classrooms]
        
        results.append({
            'group_name': group_name,
            'classroom_id': primary_classroom.id,
            'subjects': subjects,
            'subject_list': ', '.join(subjects),
            'color': primary_classroom.color
        })
        print(f"DEBUG: Added result: {group_name} with subjects {subjects}")
    
    print(f"DEBUG: Returning {len(results)} class groups")
    return jsonify({'classes': results})

@setup_bp.route('/send-invitation', methods=['POST'])
@login_required
def send_invitation():
    """Envoyer une invitation à un maître de classe"""
    from models.teacher_invitation import TeacherInvitation
    
    data = request.get_json()
    master_teacher_name = data.get('master_teacher_name', '').strip()
    target_classroom_id = data.get('target_classroom_id')
    class_name = data.get('class_name', '').strip()
    subject = data.get('subject', '').strip()
    color = data.get('color', '#4F46E5').strip()
    message = data.get('message', '').strip()
    
    if not master_teacher_name or not target_classroom_id or not class_name or not subject:
        return jsonify({
            'success': False,
            'message': 'Nom du maître, classe cible, nom de classe et matière requis'
        })
    
    # Trouver le maître de classe
    master_teacher = User.query.filter(
        (User.username.ilike(master_teacher_name) | User.email.ilike(master_teacher_name)),
        User.id != current_user.id
    ).first()
    
    if not master_teacher:
        return jsonify({
            'success': False,
            'message': 'Enseignant introuvable'
        })
    
    # Vérifier que c'est bien un maître de classe
    from models.class_collaboration import ClassMaster
    is_master = ClassMaster.query.filter_by(master_teacher_id=master_teacher.id).first()
    if not is_master:
        return jsonify({
            'success': False,
            'message': 'Cet enseignant n\'est pas maître de classe'
        })
    
    # Vérifier qu'il n'y a pas déjà une invitation en attente
    existing_invitation = TeacherInvitation.query.filter_by(
        requesting_teacher_id=current_user.id,
        target_master_teacher_id=master_teacher.id,
        target_classroom_id=target_classroom_id,
        status='pending'
    ).first()
    
    if existing_invitation:
        return jsonify({
            'success': False,
            'message': 'Une invitation est déjà en attente pour cette classe'
        })
    
    # Créer l'invitation
    invitation = TeacherInvitation(
        requesting_teacher_id=current_user.id,
        target_master_teacher_id=master_teacher.id,
        target_classroom_id=target_classroom_id,
        proposed_class_name=class_name,
        proposed_subject=subject,
        proposed_color=color,
        message=message
    )
    
    db.session.add(invitation)
    
    # Créer temporairement la classe pour que l'enseignant puisse l'utiliser
    temp_classroom = Classroom(
        user_id=current_user.id,
        name=class_name,
        subject=subject,
        color=color,
        is_temporary=True  # Flag pour indiquer que c'est temporaire
    )
    db.session.add(temp_classroom)
    
    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'Invitation envoyée à {master_teacher.username}. Vous pouvez déjà utiliser la classe "{class_name}" dans votre horaire.'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Erreur lors de l\'envoi : {str(e)}'
        })

@setup_bp.route('/classrooms', methods=['GET', 'POST'])
@login_required
def manage_classrooms():
    """Route pour gérer les classes après la configuration initiale"""
    # Détecter si on vient du dashboard
    from_dashboard = request.args.get('from_dashboard', '0') == '1'
    
    # Utiliser un formulaire simple pour l'ajout de classes individuelles
    form = ClassroomForm()
    
    if request.method == 'POST':
        action_type = request.form.get('action_type')
        
        if action_type == 'create':
            # Création d'une nouvelle classe
            if form.validate_on_submit():
                # Extraire le nom de la classe (avant le tiret)
                import re
                match = re.match(r'^([^-]+?)(?:\s*-\s*.*)?$', form.name.data.strip())
                class_group = match.group(1).strip() if match else form.name.data
                
                # IMPORTANT: Vérifier que le class_group n'est pas utilisé par une classe mixte
                existing_mixed_class = Classroom.query.filter(
                    Classroom.class_group.like(f"MIXED_{class_group}%")
                ).first()
                
                if existing_mixed_class:
                    flash(f'Le nom de classe "{class_group}" est déjà utilisé par une classe mixte. Veuillez choisir un autre nom.', 'error')
                    return render_template('setup/manage_classrooms.html', form=form, classrooms=classrooms)
                
                classroom = Classroom(
                    user_id=current_user.id,
                    name=form.name.data,
                    subject=form.subject.data,
                    color=form.color.data or '#4F46E5',
                    class_group=class_group
                )
                db.session.add(classroom)
                try:
                    db.session.commit()
                    
                    # Importer le modèle ClassMaster pour synchroniser
                    from models.class_collaboration import ClassMaster
                    from datetime import datetime
                    
                    # Déterminer l'année scolaire actuelle
                    current_year = datetime.now().year
                    if datetime.now().month >= 8:  # Année scolaire commence en août
                        school_year = f"{current_year}-{current_year + 1}"
                    else:
                        school_year = f"{current_year - 1}-{current_year}"
                    
                    # Vérifier si l'enseignant est déjà maître d'une classe de ce groupe
                    existing_master_classes = Classroom.query.filter_by(
                        user_id=current_user.id,
                        class_group=class_group,
                        is_class_master=True
                    ).first()
                    
                    if existing_master_classes:
                        # L'enseignant est déjà maître d'une classe de ce groupe
                        # Il devient donc maître de cette nouvelle classe aussi
                        classroom.is_class_master = True
                        
                        # Créer l'entrée ClassMaster correspondante
                        existing_class_master = ClassMaster.query.filter_by(
                            classroom_id=classroom.id,
                            school_year=school_year
                        ).first()
                        
                        if not existing_class_master:
                            class_master = ClassMaster(
                                classroom_id=classroom.id,
                                master_teacher_id=current_user.id,
                                school_year=school_year
                            )
                            db.session.add(class_master)
                        
                        db.session.commit()
                        
                        # Mettre à jour toutes les autres classes du même groupe pour qu'elles soient aussi maîtrisées
                        other_classes_in_group = Classroom.query.filter_by(
                            user_id=current_user.id,
                            class_group=class_group
                        ).filter(Classroom.id != classroom.id).all()
                        
                        for other_class in other_classes_in_group:
                            if not other_class.is_class_master:
                                other_class.is_class_master = True
                                
                                # Créer l'entrée ClassMaster correspondante
                                existing_other_master = ClassMaster.query.filter_by(
                                    classroom_id=other_class.id,
                                    school_year=school_year
                                ).first()
                                
                                if not existing_other_master:
                                    other_class_master = ClassMaster(
                                        classroom_id=other_class.id,
                                        master_teacher_id=current_user.id,
                                        school_year=school_year
                                    )
                                    db.session.add(other_class_master)
                        
                        db.session.commit()
                    
                    # Sinon, ne pas marquer automatiquement comme maître - laisser le bouton "Devenir maître" disponible
                    
                    flash(f'Classe "{classroom.name}" créée avec succès !', 'success')
                    return redirect(url_for('setup.manage_classrooms'))
                except Exception as e:
                    db.session.rollback()
                    flash(f'Erreur lors de la création de la classe : {str(e)}', 'error')
                    
        elif action_type == 'join':
            # NOUVEAU SYSTÈME: Rejoindre une classe via code d'accès
            result = _handle_join_by_access_code(request, current_user)
            if result:
                return result
                
        elif action_type == 'join_old':
            # Rejoindre une classe existante avec multiples disciplines
            print("DEBUG JOIN: Form data received:", dict(request.form))
            access_code = request.form.get('access_code', '').strip().upper()
            master_teacher_name = request.form.get('master_teacher_name', '').strip()
            target_classroom_id = request.form.get('join_target_classroom_id', '').strip()
            print(f"DEBUG JOIN: access_code='{access_code}', master_teacher_name='{master_teacher_name}', target_classroom_id='{target_classroom_id}'")
            
            # Récupérer les disciplines pour le code d'accès
            join_disciplines = []
            for key in request.form.keys():
                if key.startswith('join_disciplines[') and key.endswith('][class_name]'):
                    index = key.split('[')[1].split(']')[0]
                    class_name = request.form.get(f'join_disciplines[{index}][class_name]', '').strip()
                    subject = request.form.get(f'join_disciplines[{index}][subject]', '').strip()
                    color = request.form.get(f'join_disciplines[{index}][color]', '#4F46E5').strip()
                    
                    if class_name and subject:
                        join_disciplines.append({
                            'class_name': class_name,
                            'subject': subject,
                            'color': color
                        })
            
            print(f"DEBUG JOIN: Found {len(join_disciplines)} disciplines:", join_disciplines)
            
            if not access_code or not master_teacher_name or not target_classroom_id or not join_disciplines:
                print(f"DEBUG JOIN: Missing required fields - access_code: {bool(access_code)}, master_teacher_name: {bool(master_teacher_name)}, target_classroom_id: {bool(target_classroom_id)}, join_disciplines: {bool(join_disciplines)}")
                flash('Code d\'accès, maître de classe, classe cible et au moins une discipline requis', 'error')
            else:
                from models.class_collaboration import TeacherAccessCode, TeacherCollaboration
                
                # Rechercher le code d'accès
                code_obj = TeacherAccessCode.query.filter_by(code=access_code).first()
                
                if code_obj:
                    print(f"DEBUG JOIN: Found access code '{access_code}' belonging to teacher_id={code_obj.master_teacher_id} ({code_obj.master_teacher.username})")
                else:
                    print(f"DEBUG JOIN: Access code '{access_code}' not found")
                
                if not code_obj or not code_obj.is_valid():
                    flash('Code d\'accès invalide ou expiré', 'error')
                else:
                    # Vérifier que le nom du maître correspond
                    master_teacher = code_obj.master_teacher
                    print(f"DEBUG JOIN: Code belongs to {master_teacher.username}, but user wants to join {master_teacher_name}'s class")
                    if (master_teacher_name.lower() != master_teacher.username.lower() and 
                        master_teacher_name.lower() != master_teacher.email.lower()):
                        flash(f'Le nom ne correspond pas au maître de classe', 'error')
                    else:
                        # Vérifier que la classe cible existe et appartient au maître
                        print(f"DEBUG JOIN: Looking for target_classroom with id={target_classroom_id}, user_id={master_teacher.id}")
                        target_classroom = Classroom.query.filter_by(
                            id=target_classroom_id,
                            user_id=master_teacher.id
                        ).first()
                        
                        if target_classroom:
                            owner = User.query.get(target_classroom.user_id)
                            owner_name = owner.username if owner else "Unknown"
                            print(f"DEBUG JOIN: Found target_classroom: id={target_classroom.id}, name='{target_classroom.name}', subject='{target_classroom.subject}', owner='{owner_name}'")
                        else:
                            print(f"DEBUG JOIN: No target_classroom found for id={target_classroom_id}, user_id={master_teacher.id}")
                        
                        if not target_classroom:
                            flash('Classe cible introuvable', 'error')
                        else:
                            # Vérifier s'il y a déjà une collaboration ou en créer une
                            existing_collaboration = TeacherCollaboration.query.filter_by(
                                specialized_teacher_id=current_user.id,
                                master_teacher_id=master_teacher.id
                            ).first()
                            
                            if not existing_collaboration:
                                # Créer une nouvelle collaboration
                                collaboration = TeacherCollaboration(
                                    specialized_teacher_id=current_user.id,
                                    master_teacher_id=master_teacher.id,
                                    access_code_id=code_obj.id
                                )
                                db.session.add(collaboration)
                                db.session.flush()  # Pour obtenir l'ID
                            else:
                                collaboration = existing_collaboration
                            
                            # Créer les classes pour chaque discipline
                            from models.class_collaboration import SharedClassroom
                            created_classes = []
                            
                            # Déterminer le nom de classe commun (sans la matière)
                            # Ex: "11VG2 - Histoire" -> "11VG2"
                            first_class_name = join_disciplines[0]['class_name']
                            if ' - ' in first_class_name:
                                potential_class_group = first_class_name.split(' - ')[0].strip()
                            else:
                                potential_class_group = first_class_name.strip()
                            
                            # CORRECTION: Vérifier s'il existe déjà un class_group pour cette classe SPECIFIQUE dans CETTE collaboration
                            existing_classroom_in_group = Classroom.query.join(
                                SharedClassroom, 
                                Classroom.id == SharedClassroom.derived_classroom_id
                            ).filter(
                                SharedClassroom.collaboration_id == collaboration.id,
                                SharedClassroom.original_classroom_id == target_classroom.id,
                                Classroom.user_id == current_user.id,
                                Classroom.class_group.isnot(None)
                            ).first()
                            
                            if existing_classroom_in_group:
                                # Utiliser le class_group existant SEULEMENT pour cette collaboration spécifique
                                class_group = existing_classroom_in_group.class_group
                                print(f"DEBUG JOIN: Using existing class_group: '{class_group}' from THIS collaboration {collaboration.id}")
                            else:
                                # Nouveau group - NE PAS utiliser un group existant d'une autre collaboration
                                class_group = potential_class_group
                                print(f"DEBUG JOIN: Creating new class_group: '{class_group}' for collaboration {collaboration.id}")
                                
                                # VERIFICATION IMPORTANTE: S'assurer qu'on ne mélange pas avec d'autres collaborations
                                conflicting_classes = Classroom.query.filter_by(
                                    user_id=current_user.id,
                                    class_group=class_group
                                ).all()
                                
                                # VERIFICATION CLASSE MIXTE: S'assurer qu'on ne conflit pas avec une classe mixte
                                mixed_conflict = Classroom.query.filter(
                                    Classroom.class_group.like(f"MIXED_{class_group}%")
                                ).first()
                                
                                if conflicting_classes or mixed_conflict:
                                    # Il y a des classes avec le même groupe ou conflit avec classe mixte - créer un nom unique
                                    class_group = f"{potential_class_group}_{master_teacher.username}"
                                    print(f"DEBUG JOIN: Group conflict detected! Using unique group: '{class_group}'")
                            
                            for discipline in join_disciplines:
                                # Vérifier si une classe similaire existe déjà
                                existing_classroom = Classroom.query.filter_by(
                                    user_id=current_user.id,
                                    name=discipline['class_name'],
                                    subject=discipline['subject'],
                                    class_group=class_group
                                ).first()
                                
                                if existing_classroom:
                                    print(f"DEBUG JOIN: Using existing classroom for {discipline['subject']}")
                                    specialized_classroom = existing_classroom
                                else:
                                    # Créer la classe spécialisée avec regroupement
                                    specialized_classroom = Classroom(
                                        user_id=current_user.id,
                                        name=discipline['class_name'],
                                        subject=discipline['subject'],
                                        color=discipline['color'],
                                        class_group=class_group  # Regrouper toutes les disciplines
                                    )
                                    db.session.add(specialized_classroom)
                                    db.session.flush()  # Pour obtenir l'ID
                                    print(f"DEBUG JOIN: Created new classroom for {discipline['subject']}")
                                
                                # Vérifier si le lien de classe partagée existe déjà
                                existing_shared = SharedClassroom.query.filter_by(
                                    collaboration_id=collaboration.id,
                                    original_classroom_id=target_classroom.id,
                                    subject=discipline['subject']
                                ).first()
                                
                                if not existing_shared:
                                    # Créer le lien de classe partagée
                                    shared_classroom = SharedClassroom(
                                        collaboration_id=collaboration.id,
                                        original_classroom_id=target_classroom.id,
                                        derived_classroom_id=specialized_classroom.id,
                                        subject=discipline['subject']
                                    )
                                    db.session.add(shared_classroom)
                                    print(f"DEBUG JOIN: Created SharedClassroom for subject {discipline['subject']}")
                                else:
                                    print(f"DEBUG JOIN: SharedClassroom already exists for subject {discipline['subject']}, skipping")
                                created_classes.append(discipline['class_name'])
                            
                            # Copier les élèves de la classe originale vers toutes les classes dérivées créées
                            print(f"DEBUG JOIN: Copying students from original classroom {target_classroom.id}")
                            
                            # Importer Student pour la copie des élèves
                            from models.student import Student
                            
                            # Récupérer tous les élèves de la classe originale
                            original_students = Student.query.filter_by(classroom_id=target_classroom.id).all()
                            print(f"DEBUG JOIN: Found {len(original_students)} students in original classroom '{target_classroom.name}' (id={target_classroom.id})")
                            
                            # Log des noms des élèves pour debug
                            for i, student in enumerate(original_students[:5]):  # Afficher seulement les 5 premiers
                                print(f"DEBUG JOIN: Student {i+1}: {student.first_name} {student.last_name} (from classroom {student.classroom_id})")
                            if len(original_students) > 5:
                                print(f"DEBUG JOIN: ... and {len(original_students) - 5} more students")
                            
                            # Pour chaque discipline créée, copier les élèves
                            for discipline in join_disciplines:
                                # Trouver la classe dérivée correspondante
                                derived_classroom = Classroom.query.filter_by(
                                    user_id=current_user.id,
                                    name=discipline['class_name'],
                                    subject=discipline['subject'],
                                    class_group=class_group
                                ).first()
                                
                                if derived_classroom:
                                    print(f"DEBUG JOIN: Copying students to derived classroom {derived_classroom.id} (name='{derived_classroom.name}', subject='{discipline['subject']}')")
                                    
                                    # Vérifier s'il y a déjà des élèves dans cette classe (pour debug seulement)
                                    existing_students = Student.query.filter_by(classroom_id=derived_classroom.id).all()
                                    existing_students_count = len(existing_students)
                                    if existing_students_count > 0:
                                        print(f"DEBUG JOIN: Classroom already has {existing_students_count} students - will add to them")
                                        print("DEBUG JOIN: Existing students:")
                                        for i, student in enumerate(existing_students[:3]):
                                            print(f"  - {student.first_name} {student.last_name} (from classroom_id: {student.classroom_id})")
                                        if existing_students_count > 3:
                                            print(f"  - ... and {existing_students_count - 3} more")
                                    else:
                                        print(f"DEBUG JOIN: No existing students - will copy all students from original class")
                                    
                                    # Copier chaque élève (en évitant les doublons)
                                    copied_count = 0
                                    for original_student in original_students:
                                        # Vérifier si un élève avec les mêmes nom/prénom existe déjà
                                        existing_duplicate = Student.query.filter_by(
                                            classroom_id=derived_classroom.id,
                                            first_name=original_student.first_name,
                                            last_name=original_student.last_name
                                        ).first()
                                        
                                        if existing_duplicate:
                                            print(f"DEBUG JOIN: Student {original_student.first_name} {original_student.last_name} already exists in classroom, skipping")
                                            continue
                                        
                                        # Créer une copie de l'élève pour la classe dérivée
                                        derived_student = Student(
                                            classroom_id=derived_classroom.id,
                                            user_id=current_user.id,  # L'enseignant spécialisé devient propriétaire
                                            first_name=original_student.first_name,
                                            last_name=original_student.last_name,
                                            email=original_student.email,
                                            date_of_birth=original_student.date_of_birth,
                                            parent_email_mother=original_student.parent_email_mother,
                                            parent_email_father=original_student.parent_email_father,
                                            additional_info=original_student.additional_info
                                        )
                                        db.session.add(derived_student)
                                        db.session.flush()  # Pour obtenir l'ID
                                        
                                        # Créer le lien entre élève et classe
                                        from models.class_collaboration import StudentClassroomLink
                                        student_link = StudentClassroomLink(
                                            student_id=derived_student.id,
                                            classroom_id=derived_classroom.id,
                                            subject=discipline['subject'],
                                            is_primary=False,
                                            added_by_teacher_id=current_user.id
                                        )
                                        db.session.add(student_link)
                                        copied_count += 1
                                        print(f"DEBUG JOIN: Copied student {original_student.first_name} {original_student.last_name}")
                                    
                                    print(f"DEBUG JOIN: Copied {copied_count} new students to {discipline['subject']} class")
                            
                            # Utiliser le code
                            code_obj.use_code()
                            
                            try:
                                db.session.commit()
                                disciplines_list = ', '.join(created_classes)
                                flash(f'Collaboration établie avec {master_teacher.username} ! Classes créées : {disciplines_list}', 'success')
                                return redirect(url_for('setup.manage_classrooms'))
                            except Exception as e:
                                db.session.rollback()
                                flash(f'Erreur lors de la création des classes : {str(e)}', 'error')
        
        elif action_type == 'invite':
            # NOUVEAU SYSTÈME: Envoyer une invitation
            result = _handle_invitation_request(request, current_user)
            if result:
                return result
                
        elif action_type == 'invite_old':
            # Envoyer une invitation multi-disciplines à un maître de classe
            master_teacher_name = request.form.get('invite_master_teacher_name', '').strip()
            target_classroom_id = request.form.get('target_classroom_id', '').strip()
            message = request.form.get('invite_message', '').strip()
            
            # Récupérer les disciplines
            disciplines = []
            for key in request.form.keys():
                if key.startswith('disciplines[') and key.endswith('][class_name]'):
                    index = key.split('[')[1].split(']')[0]
                    class_name = request.form.get(f'disciplines[{index}][class_name]', '').strip()
                    subject = request.form.get(f'disciplines[{index}][subject]', '').strip()
                    color = request.form.get(f'disciplines[{index}][color]', '#4F46E5').strip()
                    
                    if class_name and subject:
                        disciplines.append({
                            'class_name': class_name,
                            'subject': subject,
                            'color': color
                        })
            
            if not master_teacher_name or not target_classroom_id or not disciplines:
                flash('Nom du maître, classe cible et au moins une discipline requis', 'error')
            else:
                from models.teacher_invitation import TeacherInvitation
                from models.invitation_classroom import InvitationClassroom
                
                # Trouver le maître de classe
                master_teacher = User.query.filter(
                    (User.username.ilike(master_teacher_name) | User.email.ilike(master_teacher_name)),
                    User.id != current_user.id
                ).first()
                
                if not master_teacher:
                    flash('Enseignant introuvable', 'error')
                else:
                    # Vérifier que c'est bien un maître de classe
                    from models.class_collaboration import ClassMaster
                    is_master = ClassMaster.query.filter_by(master_teacher_id=master_teacher.id).first()
                    if not is_master:
                        flash('Cet enseignant n\'est pas maître de classe', 'error')
                    else:
                        # Vérifier qu'il n'y a pas déjà une invitation en attente pour ce maître
                        existing_pending_invitation = TeacherInvitation.query.filter_by(
                            requesting_teacher_id=current_user.id,
                            target_master_teacher_id=master_teacher.id,
                            status='pending'
                        ).first()
                        
                        if existing_pending_invitation:
                            flash('Une invitation est déjà en attente pour cet enseignant. Attendez sa réponse avant d\'en envoyer une nouvelle.', 'error')
                        else:
                            # Créer l'invitation principale (avec la première discipline comme référence)
                            first_discipline = disciplines[0]
                            invitation = TeacherInvitation(
                                requesting_teacher_id=current_user.id,
                                target_master_teacher_id=master_teacher.id,
                                target_classroom_id=target_classroom_id,
                                proposed_class_name=first_discipline['class_name'],
                                proposed_subject=first_discipline['subject'],
                                proposed_color=first_discipline['color'],
                                message=message
                            )
                            db.session.add(invitation)
                            db.session.flush()  # Pour obtenir l'ID de l'invitation
                            
                            # Créer les enregistrements pour chaque discipline
                            discipline_names = []
                            for discipline in disciplines:
                                invitation_classroom = InvitationClassroom(
                                    invitation_id=invitation.id,
                                    target_classroom_id=target_classroom_id,
                                    proposed_class_name=discipline['class_name'],
                                    proposed_subject=discipline['subject'],
                                    proposed_color=discipline['color']
                                )
                                db.session.add(invitation_classroom)
                                discipline_names.append(discipline['subject'])
                            
                            # Créer temporairement une classe pour que l'enseignant puisse l'utiliser (première discipline)
                            temp_classroom = Classroom(
                                user_id=current_user.id,
                                name=first_discipline['class_name'],
                                subject=first_discipline['subject'],
                                color=first_discipline['color'],
                                is_temporary=True  # Flag temporaire
                            )
                            db.session.add(temp_classroom)
                            
                            try:
                                db.session.commit()
                                subject_list = ", ".join(discipline_names)
                                flash(f'Invitation envoyée à {master_teacher.username} pour enseigner {len(disciplines)} discipline(s): {subject_list}. Vous pouvez déjà utiliser vos classes dans votre horaire.', 'success')
                                return redirect(url_for('setup.manage_classrooms'))
                            except Exception as e:
                                db.session.rollback()
                                flash(f'Erreur lors de l\'envoi : {str(e)}', 'error')
        
        elif action_type == 'invite_mixed':
            # Envoyer une invitation pour classe mixte à un maître de classe
            master_teacher_name = request.form.get('mixed_master_teacher_name', '').strip()
            target_classroom_id = request.form.get('mixed_target_classroom_id', '').strip()
            message = request.form.get('mixed_invite_message', '').strip()
            
            if not master_teacher_name or not target_classroom_id:
                flash('Nom du maître et classe cible requis', 'error')
            else:
                from models.teacher_invitation import TeacherInvitation
                from models.invitation_classroom import InvitationClassroom
                
                # Trouver le maître de classe
                master_teacher = User.query.filter(
                    (User.username.ilike(master_teacher_name) | User.email.ilike(master_teacher_name)),
                    User.id != current_user.id
                ).first()
                
                if not master_teacher:
                    flash('Enseignant introuvable', 'error')
                else:
                    # Vérifier que c'est bien un maître de classe
                    from models.class_collaboration import ClassMaster
                    is_master = ClassMaster.query.filter_by(master_teacher_id=master_teacher.id).first()
                    if not is_master:
                        flash('Cet enseignant n\'est pas maître de classe', 'error')
                    else:
                        # Vérifier qu'il n'y a pas déjà une invitation en attente pour ce maître
                        existing_pending_invitation = TeacherInvitation.query.filter_by(
                            requesting_teacher_id=current_user.id,
                            target_master_teacher_id=master_teacher.id,
                            status='pending'
                        ).first()
                        
                        # NOTE: Ne pas créer d'invitation ici - elle sera créée lors de la création de la classe mixte
                        # Juste ajouter la classe aux sources pour l'instant
                        try:
                            db.session.commit()
                            flash(f'Classe de {master_teacher.username} ajoutée aux sources. L\'invitation sera envoyée lors de la création de la classe mixte.', 'success')
                            return redirect(url_for('setup.manage_classrooms'))
                        except Exception as e:
                            db.session.rollback()
                            flash(f'Erreur lors de l\'envoi : {str(e)}', 'error')
        
        elif action_type == 'create_mixed':
            # Créer une classe mixte
            mixed_name = request.form.get('mixed_name', '').strip()
            mixed_subject = request.form.get('mixed_subject', '').strip()
            mixed_color = request.form.get('mixed_color', '#4F46E5').strip()
            
            # Récupérer les données des classes sources et étudiants sélectionnés
            import json
            source_classes_json = request.form.get('source_classes', '[]')
            selected_students_json = request.form.get('selected_students', '[]')
            
            try:
                source_classes = json.loads(source_classes_json)
                selected_students = json.loads(selected_students_json)
                
                print(f"DEBUG: Parsed source_classes: {source_classes}")
                print(f"DEBUG: Type of source_classes: {type(source_classes)}")
                print(f"DEBUG: Parsed selected_students: {selected_students}")
                print(f"DEBUG: Type of selected_students: {type(selected_students)}")
                print(f"DEBUG: Number of selected_students: {len(selected_students)}")
                
                if source_classes:
                    print(f"DEBUG: First source class type: {type(source_classes[0])}")
                    print(f"DEBUG: First source class: {source_classes[0]}")
                
                if selected_students:
                    print(f"DEBUG: First selected student: {selected_students[0]}")
                    selected_count = sum(1 for student in selected_students if isinstance(student, dict) and student.get('selected', False))
                    print(f"DEBUG: Number of students marked as selected: {selected_count}")
                    
            except json.JSONDecodeError as e:
                print(f"DEBUG: JSON decode error: {e}")
                flash(f'Erreur dans les données des classes sources: {str(e)}', 'error')
                return redirect(url_for('setup.manage_classrooms'))
            
            if not mixed_name or not mixed_subject or not source_classes:
                flash('Nom, matière et au moins deux classes sources requis pour créer une classe mixte', 'error')
            elif len(source_classes) < 2:
                flash('Une classe mixte nécessite au moins 2 classes sources', 'error')
            else:
                # Traiter les classes sources avec codes d'accès et invitations
                processed_sources = []
                errors = []
                
                for source_class in source_classes:
                    print(f"DEBUG: Processing source_class: {source_class}")
                    print(f"DEBUG: source_class type: {type(source_class)}")
                    
                    if source_class.get('type') == 'code_access':
                        # Pour les classes mixtes, on vérifie juste le code d'accès sans créer de collaboration
                        access_code = source_class.get('access_code', '').strip().upper()
                        target_classroom_id = source_class.get('target_classroom_id')
                        
                        # Convertir en entier si c'est une chaîne
                        if isinstance(target_classroom_id, str):
                            try:
                                target_classroom_id = int(target_classroom_id)
                            except ValueError:
                                errors.append(f"ID de classe invalide pour {source_class.get('name', 'classe inconnue')}")
                                continue
                        
                        if access_code and target_classroom_id:
                            from models.class_collaboration import TeacherAccessCode
                            
                            # Vérifier le code d'accès
                            code_obj = TeacherAccessCode.query.filter_by(code=access_code).first()
                            
                            if code_obj and code_obj.is_valid():
                                # Vérifier que la classe cible existe
                                target_classroom = Classroom.query.get(target_classroom_id)
                                if target_classroom:
                                    # Pour les classes mixtes, on ajoute juste la classe source sans créer de collaboration
                                    print(f"DEBUG: Code d'accès valide pour classe mixte: {source_class.get('name')}")
                                    processed_sources.append(source_class)
                                else:
                                    errors.append(f"Classe cible introuvable: {target_classroom_id}")
                            else:
                                errors.append(f"Code d'accès invalide pour {source_class.get('name', 'classe inconnue')}")
                        else:
                            errors.append(f"Code d'accès ou classe cible manquant pour {source_class.get('name', 'classe inconnue')}")
                    
                    elif source_class.get('type') == 'invitation':
                        # Pour les classes mixtes, on vérifie juste que l'enseignant et la classe existent
                        teacher_name = source_class.get('teacher_name', '').strip()
                        target_classroom_id = source_class.get('target_classroom_id')
                        
                        # Convertir en entier si c'est une chaîne
                        if isinstance(target_classroom_id, str):
                            try:
                                target_classroom_id = int(target_classroom_id)
                            except ValueError:
                                errors.append(f"ID de classe invalide pour invitation à {teacher_name}")
                                continue
                        
                        if teacher_name and target_classroom_id:
                            # Vérifier que l'enseignant existe
                            master_teacher = User.query.filter(
                                (User.username.ilike(teacher_name) | User.email.ilike(teacher_name)),
                                User.id != current_user.id
                            ).first()
                            
                            # Vérifier que la classe cible existe
                            target_classroom = Classroom.query.get(target_classroom_id)
                            
                            if master_teacher and target_classroom:
                                # Pour les classes mixtes, on ajoute juste la classe source sans créer d'invitation
                                print(f"DEBUG: Enseignant et classe trouvés pour classe mixte: {source_class.get('name')}")
                                # Ajouter les informations nécessaires pour l'invitation
                                source_class['master_teacher_id'] = master_teacher.id
                                source_class['classroom_id'] = target_classroom.id
                                processed_sources.append(source_class)
                            else:
                                if not master_teacher:
                                    errors.append(f"Enseignant introuvable: {teacher_name}")
                                if not target_classroom:
                                    errors.append(f"Classe cible introuvable: {target_classroom_id}")
                        else:
                            errors.append(f"Enseignant ou classe cible manquant pour l'invitation")
                    
                    elif source_class.get('type') == 'own':
                        # Classe propre - déjà accessible
                        print(f"DEBUG: Adding own class: {source_class.get('name')}")
                        processed_sources.append(source_class)
                    
                    elif source_class.get('type') == 'external':
                        # Classe externe - ajout direct
                        print(f"DEBUG: Adding external class: {source_class.get('name')}")
                        processed_sources.append(source_class)
                    
                    else:
                        print(f"DEBUG: Unknown source class type: {source_class.get('type')} for class {source_class.get('name')}")
                        processed_sources.append(source_class)  # Ajouter quand même
                
                if errors:
                    for error in errors:
                        flash(error, 'error')
                
                if processed_sources:
                    # Nettoyer les liens résiduels avant de créer la nouvelle classe mixte
                    _cleanup_mixed_class_residual_links(current_user)
                    
                    # Créer la classe mixte
                    try:
                        from models.mixed_group import MixedGroup, MixedGroupStudent
                        
                        # Créer d'abord une classe automatique pour le groupe mixte
                        # IMPORTANT: Utiliser un class_group spécifique pour les classes mixtes
                        import time
                        mixed_class_group = f"MIXED_{mixed_name}_{current_user.id}_{int(time.time())}"
                        
                        auto_classroom = Classroom(
                            user_id=current_user.id,
                            name=mixed_name,
                            subject=mixed_subject,
                            color=mixed_color,
                            class_group=mixed_class_group  # Groupe spécifique pour éviter le regroupement avec les classes normales
                        )
                        db.session.add(auto_classroom)
                        db.session.flush()  # Pour obtenir l'ID de la classe
                        
                        # Créer le groupe mixte avec les noms des classes sources
                        source_class_names = [source.get('name', 'Classe inconnue') for source in processed_sources]
                        sources_description = "SOURCES:" + ",".join(source_class_names)
                        
                        # NOUVEAU: Supprimer tout ancien groupe mixte avec le même nom (nettoyage préventif)
                        existing_mixed_groups = MixedGroup.query.filter_by(
                            teacher_id=current_user.id,
                            name=mixed_name
                        ).all()
                        
                        for existing_group in existing_mixed_groups:
                            print(f"DEBUG: Found existing mixed group {existing_group.id} with same name '{mixed_name}' - cleaning up")
                            
                            # Supprimer les liens élèves-groupe mixte
                            db.session.execute(
                                db.text("DELETE FROM mixed_group_students WHERE mixed_group_id = :mixed_group_id"),
                                {"mixed_group_id": existing_group.id}
                            )
                            
                            # Supprimer les invitations liées
                            db.session.execute(
                                db.text("DELETE FROM teacher_invitations WHERE requesting_teacher_id = :user_id AND proposed_class_name = :class_name"),
                                {"user_id": current_user.id, "class_name": mixed_name}
                            )
                            
                            # Supprimer le groupe mixte
                            db.session.delete(existing_group)
                            print(f"DEBUG: Cleaned up existing mixed group {existing_group.id}")
                        
                        # Créer le nouveau groupe mixte
                        mixed_group = MixedGroup(
                            teacher_id=current_user.id,
                            auto_classroom_id=auto_classroom.id,
                            name=mixed_name,
                            subject=mixed_subject,
                            color=mixed_color,
                            description=sources_description
                        )
                        db.session.add(mixed_group)
                        db.session.flush()  # Pour obtenir l'ID
                        
                        # Ajouter les étudiants sélectionnés SEULEMENT pour les classes avec accès direct
                        # (pas les classes ajoutées via invitation - elles seront ajoutées après acceptation)
                        student_count = 0
                        added_student_ids = set()  # Pour éviter les doublons
                        print(f"DEBUG: Processing {len(selected_students)} student entries")
                        
                        for i, student_data in enumerate(selected_students):
                            print(f"DEBUG: Student {i}: {student_data}, type: {type(student_data)}")
                            if isinstance(student_data, dict) and student_data.get('selected', False):
                                student_id = student_data['student_id']
                                source_type = student_data.get('source_type', 'unknown')
                                source_class_name = student_data.get('source_class_name', 'unknown')
                                
                                print(f"DEBUG: Processing student {student_id} from source_type='{source_type}' class='{source_class_name}'")
                                
                                # IMPORTANT: Ne pas ajouter les élèves des classes ajoutées par invitation
                                # Ces élèves seront ajoutés seulement après acceptation de l'invitation
                                if source_type == 'invitation':
                                    print(f"DEBUG: Student {student_id} from invitation source - will be added after acceptance")
                                    continue
                                elif source_type == 'code_access':
                                    print(f"DEBUG: Student {student_id} from code_access source - will be added immediately")
                                else:
                                    print(f"DEBUG: Student {student_id} from unknown source_type='{source_type}' - will be added")
                                
                                # Vérifier que l'étudiant n'est pas déjà ajouté
                                if student_id in added_student_ids:
                                    print(f"DEBUG: Student {student_id} already added, skipping")
                                    continue
                                
                                # Vérifier que l'étudiant n'est pas déjà dans ce groupe mixte
                                existing_link = MixedGroupStudent.query.filter_by(
                                    mixed_group_id=mixed_group.id,
                                    student_id=student_id
                                ).first()
                                
                                if existing_link:
                                    print(f"DEBUG: Student {student_id} already in mixed group, skipping")
                                    continue
                                
                                print(f"DEBUG: Adding student {student_id} to mixed group {mixed_group.id} (source: {source_type})")
                                
                                # Vérifier que l'étudiant existe
                                from models.student import Student
                                student = Student.query.get(student_id)
                                if not student:
                                    print(f"ERROR: Student with ID {student_id} not found!")
                                    continue
                                
                                print(f"DEBUG: Student found: {student.full_name}")
                                mixed_student = MixedGroupStudent(
                                    mixed_group_id=mixed_group.id,
                                    student_id=student_id
                                )
                                db.session.add(mixed_student)
                                added_student_ids.add(student_id)
                                student_count += 1
                                print(f"DEBUG: Successfully added student {student_id} to mixed group")
                        
                        # Copier les étudiants sélectionnés dans la classe auto-créée pour qu'ils apparaissent dans la gestion de classe
                        # SEULEMENT ceux qui ont été ajoutés (pas ceux en attente d'invitation)
                        print(f"DEBUG: Copying {student_count} confirmed students to auto_classroom {auto_classroom.id}")
                        for student_data in selected_students:
                            if isinstance(student_data, dict) and student_data.get('selected', False):
                                student_id = student_data['student_id']
                                source_type = student_data.get('source_type', 'unknown')
                                
                                # Ne pas copier les élèves des classes ajoutées par invitation
                                if source_type == 'invitation':
                                    print(f"DEBUG: Student {student_id} from invitation source - not copying until acceptance")
                                    continue
                                
                                # Vérifier que l'étudiant a été ajouté au groupe mixte
                                if student_id not in added_student_ids:
                                    print(f"DEBUG: Student {student_id} was not added to mixed group, skipping copy")
                                    continue
                                
                                original_student = Student.query.get(student_id)
                                
                                if original_student:
                                    # Créer une copie de l'élève pour la classe auto-créée
                                    auto_student = Student(
                                        classroom_id=auto_classroom.id,
                                        user_id=current_user.id,
                                        first_name=original_student.first_name,
                                        last_name=original_student.last_name,
                                        email=original_student.email,
                                        date_of_birth=original_student.date_of_birth,
                                        parent_email_mother=original_student.parent_email_mother,
                                        parent_email_father=original_student.parent_email_father,
                                        additional_info=original_student.additional_info
                                    )
                                    db.session.add(auto_student)
                                    print(f"DEBUG: Copied student {original_student.full_name} to auto_classroom")
                        
                        # Envoyer les invitations aux maîtres des classes ajoutées via invitation
                        print(f"DEBUG: Processing invitations for {len(processed_sources)} source classes")
                        for source in processed_sources:
                            if source.get('type') == 'invitation':
                                master_teacher_id = source.get('master_teacher_id')
                                source_classroom_id = source.get('classroom_id')
                                
                                if master_teacher_id and source_classroom_id:
                                    # Vérifier qu'il n'y a pas déjà une invitation en attente
                                    from models.teacher_invitation import TeacherInvitation
                                    existing_invitation = TeacherInvitation.query.filter_by(
                                        requesting_teacher_id=current_user.id,
                                        target_master_teacher_id=master_teacher_id,
                                        status='pending'
                                    ).first()
                                    
                                    if not existing_invitation:
                                        # Récupérer les élèves sélectionnés pour cette classe source
                                        selected_students_for_source = []
                                        for student in selected_students:
                                            if (isinstance(student, dict) and 
                                                student.get('selected', False) and 
                                                student.get('source_type') == 'invitation' and
                                                str(student.get('student_id')) and
                                                source.get('name') == student.get('source_class_name')):
                                                selected_students_for_source.append(student['student_id'])
                                        
                                        import json
                                        selected_student_ids_json = json.dumps(selected_students_for_source)
                                        print(f"DEBUG: Selected students for invitation to teacher {master_teacher_id}: {selected_students_for_source}")
                                        
                                        # Créer une invitation pour le maître de la classe source
                                        invitation = TeacherInvitation(
                                            requesting_teacher_id=current_user.id,
                                            target_master_teacher_id=master_teacher_id,
                                            target_classroom_id=source_classroom_id,
                                            proposed_class_name=mixed_name,  # Nom de la classe mixte
                                            proposed_subject="Classe mixte",  # Matière générique pour classe mixte
                                            proposed_color="#9333ea",  # Couleur spécifique pour les classes mixtes
                                            message=f"Demande d'accès pour inclusion dans la classe mixte '{mixed_name}'. Les élèves sélectionnés de votre classe seront inclus dans ce regroupement inter-classes.",
                                            selected_student_ids=selected_student_ids_json  # Stocker les élèves sélectionnés
                                        )
                                        db.session.add(invitation)
                                        print(f"DEBUG: Created invitation for teacher {master_teacher_id} for mixed class '{mixed_name}' with {len(selected_students_for_source)} selected students")
                                    else:
                                        print(f"DEBUG: Invitation already exists for teacher {master_teacher_id}, skipping")
                        
                        db.session.commit()
                        
                        # Compter les élèves en attente d'invitation
                        pending_count = sum(1 for student in selected_students 
                                          if isinstance(student, dict) and student.get('selected', False) and student.get('source_type') == 'invitation')
                        
                        if pending_count > 0:
                            flash(f'Classe mixte "{mixed_name}" créée avec succès avec {student_count} élève(s) ajouté(s) immédiatement et {pending_count} élève(s) en attente d\'approbation. Les invitations ont été envoyées aux maîtres de classe concernés.', 'success')
                        else:
                            flash(f'Classe mixte "{mixed_name}" créée avec succès avec {student_count} élève(s) !', 'success')
                        
                        return redirect(url_for('setup.manage_classrooms'))
                        
                    except Exception as e:
                        db.session.rollback()
                        flash(f'Erreur lors de la création de la classe mixte : {str(e)}', 'error')
                else:
                    flash('Aucune classe source valide pour créer la classe mixte', 'error')
    
    # Récupérer toutes les classes (propres et liées)
    classrooms = current_user.classrooms.all()
    
    # Récupérer les informations sur les classes dont l'utilisateur est maître
    from models.class_collaboration import TeacherCollaboration, SharedClassroom, ClassMaster
    from models.teacher_invitation import TeacherInvitation
    
    master_classroom_ids = [cm.classroom_id for cm in ClassMaster.query.filter_by(master_teacher_id=current_user.id).all()]
    
    # Récupérer tous les maîtres de classe existants pour afficher leur nom
    all_class_masters = {}
    for cm in ClassMaster.query.join(User).all():
        all_class_masters[cm.classroom_id] = {
            'teacher_id': cm.master_teacher_id,
            'teacher_name': cm.master_teacher.username,
            'teacher_email': cm.master_teacher.email
        }
    
    # Ajouter les maîtres des classes dérivées (classes rejointes via collaboration)
    derived_class_masters = {}
    shared_classrooms = SharedClassroom.query.join(
        TeacherCollaboration, SharedClassroom.collaboration_id == TeacherCollaboration.id
    ).filter(TeacherCollaboration.specialized_teacher_id == current_user.id).all()
    
    for shared in shared_classrooms:
        # Pour chaque classe dérivée, récupérer le maître de la classe originale
        original_master = ClassMaster.query.filter_by(
            classroom_id=shared.original_classroom_id
        ).join(User).first()
        
        if original_master:
            derived_class_masters[shared.derived_classroom_id] = {
                'teacher_id': original_master.master_teacher_id,
                'teacher_name': original_master.master_teacher.username,
                'teacher_email': original_master.master_teacher.email,
                'is_derived': True,  # Marquer comme classe dérivée
                'original_classroom_id': shared.original_classroom_id
            }
    
    # Fusionner les deux dictionnaires
    all_class_masters.update(derived_class_masters)
    
    # Récupérer aussi les classes liées via collaboration
    collaborations = TeacherCollaboration.query.filter_by(
        specialized_teacher_id=current_user.id
    ).all()
    
    linked_classrooms = []
    for collab in collaborations:
        shared = SharedClassroom.query.filter_by(
            collaboration_id=collab.id
        ).all()
        for s in shared:
            linked_classrooms.append({
                'classroom': s.derived_classroom,
                'master_teacher': collab.master_teacher,
                'is_linked': True
            })
    
    # Récupérer les invitations reçues (en tant que maître)
    received_invitations = TeacherInvitation.query.filter_by(
        target_master_teacher_id=current_user.id,
        status='pending'
    ).all()
    
    # Récupérer les invitations envoyées (en tant qu'enseignant spécialisé)
    sent_invitations = TeacherInvitation.query.filter_by(
        requesting_teacher_id=current_user.id
    ).filter(TeacherInvitation.status.in_(['pending', 'accepted', 'rejected'])).all()
    
    return render_template('setup/manage_classrooms.html', 
                         form=form, 
                         classrooms=classrooms,
                         linked_classrooms=linked_classrooms,
                         master_classroom_ids=master_classroom_ids,
                         all_class_masters=all_class_masters,
                         received_invitations=received_invitations,
                         sent_invitations=sent_invitations,
                         from_dashboard=from_dashboard)

@setup_bp.route('/api/own-classes', methods=['GET'])
@login_required
def get_own_classes():
    """API pour récupérer les classes utilisables : maître de classe OU sans maître"""
    try:
        from models.class_collaboration import ClassMaster
        
        # Récupérer TOUTES les classes de l'utilisateur (approuvées)
        all_user_classrooms = Classroom.query.filter_by(
            user_id=current_user.id,
            is_temporary=False
        ).all()
        
        classes_data = []
        for classroom in all_user_classrooms:
            # Vérifier si l'utilisateur est maître de cette classe
            user_is_master = ClassMaster.query.filter_by(
                classroom_id=classroom.id,
                master_teacher_id=current_user.id
            ).first() is not None
            
            # Vérifier s'il y a un maître de classe direct
            direct_master = ClassMaster.query.filter_by(
                classroom_id=classroom.id
            ).first() is not None
            
            # NOUVEAU: Vérifier si c'est une classe dérivée (liée à une classe originale)
            from models.class_collaboration import SharedClassroom
            shared_classroom = SharedClassroom.query.filter_by(
                derived_classroom_id=classroom.id
            ).first()
            
            has_master_via_collaboration = False
            if shared_classroom:
                # C'est une classe dérivée - vérifier si la classe originale a un maître
                original_master = ClassMaster.query.filter_by(
                    classroom_id=shared_classroom.original_classroom_id
                ).first()
                if original_master:
                    has_master_via_collaboration = True
                    print(f"DEBUG: Class {classroom.name} is derived from class {shared_classroom.original_classroom_id} which has master {original_master.master_teacher_id}")
            
            # Une classe a un maître si :
            # 1. Elle a un maître direct OU
            # 2. Elle est dérivée d'une classe qui a un maître
            has_any_master = direct_master or has_master_via_collaboration
            
            # Inclure la classe seulement si :
            # 1. L'utilisateur est maître de cette classe OU
            # 2. Il n'y a pas de maître de classe du tout (ni direct ni via collaboration)
            if user_is_master or not has_any_master:
                # Compter les étudiants dans cette classe spécifique
                student_count = len(classroom.get_students()) if hasattr(classroom, 'get_students') else len(classroom.students) if classroom.students else 0
                
                classes_data.append({
                    'id': classroom.id,
                    'name': classroom.name,
                    'subject': classroom.subject,
                    'color': classroom.color,
                    'student_count': student_count,
                    'is_master': user_is_master,  # Indique si l'utilisateur est maître de cette classe
                    'has_master': has_any_master,  # Indique si la classe a un maître (direct ou via collaboration)
                    'is_derived': shared_classroom is not None  # Indique si c'est une classe dérivée
                })
                print(f"DEBUG: Including class {classroom.name} - user_is_master: {user_is_master}, has_master: {has_any_master}, is_derived: {shared_classroom is not None}")
            else:
                print(f"DEBUG: Excluding class {classroom.name} - has master (direct: {direct_master}, via_collaboration: {has_master_via_collaboration})")
        
        print(f"DEBUG: Found {len(classes_data)} usable classes for user {current_user.id}")
        return jsonify({'classes': classes_data})
    except Exception as e:
        print(f"Erreur lors de la récupération des classes maîtres: {e}")
        return jsonify({'error': 'Erreur lors de la récupération des classes'}), 500

@setup_bp.route('/api/class-students/<int:class_id>', methods=['GET'])
@login_required
def get_class_students(class_id):
    """API pour récupérer les élèves d'une classe"""
    try:
        # Vérifier que l'utilisateur a accès à cette classe
        classroom = Classroom.query.get_or_404(class_id)
        
        # Vérifier les permissions
        if classroom.user_id != current_user.id:
            # Vérifier si c'est une classe partagée
            from models.class_collaboration import SharedClassroom
            shared = SharedClassroom.query.filter_by(
                original_classroom_id=class_id
            ).join(
                SharedClassroom.collaboration
            ).filter_by(specialized_teacher_id=current_user.id).first()
            
            if not shared:
                return jsonify({'error': 'Accès non autorisé'}), 403
        
        students_data = []
        for student in classroom.students:
            students_data.append({
                'id': student.id,
                'full_name': student.full_name,
                'first_name': student.first_name,
                'last_name': student.last_name
            })
        
        return jsonify({
            'students': students_data,
            'class_group': classroom.class_group,
            'classroom_name': classroom.name
        })
    except Exception as e:
        print(f"Erreur lors de la récupération des élèves: {e}")
        return jsonify({'error': 'Erreur lors de la récupération des élèves'}), 500

@setup_bp.route('/api/validate-access-code', methods=['POST'])
@login_required
def validate_access_code():
    """API pour valider un code d'accès"""
    try:
        data = request.get_json()
        access_code = data.get('access_code', '').strip().upper()
        target_classroom_id = data.get('target_classroom_id')
        
        if not access_code or not target_classroom_id:
            return jsonify({'valid': False, 'error': 'Code d\'accès ou classe cible manquant'})
        
        # Vérifier le code d'accès
        from models.class_collaboration import TeacherAccessCode, ClassMaster
        code_obj = TeacherAccessCode.query.filter_by(code=access_code).first()
        
        if not code_obj or not code_obj.is_valid():
            return jsonify({'valid': False, 'error': 'Code d\'accès invalide ou expiré'})
        
        # Vérifier que la classe cible existe
        target_classroom = Classroom.query.get(target_classroom_id)
        if not target_classroom:
            return jsonify({'valid': False, 'error': 'Classe cible introuvable'})
        
        # IMPORTANT: Vérifier que le code d'accès appartient au maître de cette classe spécifique
        class_master = ClassMaster.query.filter_by(classroom_id=target_classroom_id).first()
        if not class_master:
            return jsonify({'valid': False, 'error': 'Aucun maître trouvé pour cette classe'})
        
        if code_obj.master_teacher_id != class_master.master_teacher_id:
            return jsonify({'valid': False, 'error': 'Ce code d\'accès ne correspond pas à cette classe'})
        
        return jsonify({'valid': True, 'message': 'Code d\'accès valide pour cette classe'})
        
    except Exception as e:
        print(f"Erreur lors de la validation du code d'accès: {e}")
        return jsonify({'valid': False, 'error': 'Erreur lors de la validation'}), 500

@setup_bp.route('/api/mixed-class-students/<int:class_id>', methods=['POST'])
@login_required
def get_mixed_class_students(class_id):
    """API pour récupérer les élèves d'une classe pour une classe mixte (avec validation par code d'accès)"""
    try:
        data = request.get_json()
        access_code = data.get('access_code', '').strip().upper() if data else None
        print(f"DEBUG mixed-class-students: class_id={class_id}, data={data}, access_code={access_code}")
        
        # Vérifier que la classe existe
        classroom = Classroom.query.get_or_404(class_id)
        
        # Vérifier l'accès via différents moyens
        has_access = False
        access_reason = "none"
        
        # 1. Si l'utilisateur est propriétaire de la classe
        if classroom.user_id == current_user.id:
            has_access = True
            access_reason = "owner"
            print(f"DEBUG: Access granted - user {current_user.id} is owner of class {class_id}")
        
        # 2. Si l'utilisateur a déjà une collaboration existante
        if not has_access:
            from models.class_collaboration import SharedClassroom, TeacherCollaboration
            shared = SharedClassroom.query.filter_by(
                original_classroom_id=class_id
            ).join(
                SharedClassroom.collaboration
            ).filter_by(specialized_teacher_id=current_user.id).first()
            
            if shared:
                has_access = True
                access_reason = "collaboration"
                print(f"DEBUG: Access granted - user {current_user.id} has collaboration for class {class_id}")
        
        # 3. Si un code d'accès valide est fourni
        if not has_access and access_code:
            from models.class_collaboration import TeacherAccessCode, ClassMaster
            code_obj = TeacherAccessCode.query.filter_by(code=access_code).first()
            print(f"DEBUG: Code lookup for '{access_code}': {code_obj is not None}")
            
            if code_obj and code_obj.is_valid():
                print(f"DEBUG: Code is valid, checking class master for class {class_id}")
                # Vérifier que ce code donne accès à cette classe (via le maître de classe)
                class_master = ClassMaster.query.filter_by(classroom_id=class_id).first()
                print(f"DEBUG: Class master found: {class_master is not None}")
                if class_master:
                    print(f"DEBUG: Class master teacher_id: {class_master.master_teacher_id}, Code teacher_id: {code_obj.master_teacher_id}")
                
                if class_master and class_master.master_teacher_id == code_obj.master_teacher_id:
                    has_access = True
                    access_reason = "access_code"
                    print(f"DEBUG: Access granted - valid code for class {class_id}")
        
        # 4. Si l'utilisateur a une invitation acceptée pour cette classe
        if not has_access:
            from models.teacher_invitation import TeacherInvitation
            accepted_invitation = TeacherInvitation.query.filter_by(
                requesting_teacher_id=current_user.id,
                target_classroom_id=class_id,
                status='accepted'
            ).first()
            
            if accepted_invitation:
                has_access = True
                access_reason = "accepted_invitation"
                print(f"DEBUG: Access granted - accepted invitation for class {class_id}")
        
        # 5. Pour les classes mixtes : permettre l'accès si le propriétaire de la classe est maître de classe
        if not has_access:
            from models.class_collaboration import ClassMaster
            class_master = ClassMaster.query.filter_by(
                classroom_id=class_id,
                master_teacher_id=classroom.user_id
            ).first()
            
            if class_master:
                has_access = True
                access_reason = "mixed_class_access"
                print(f"DEBUG: Access granted - class {class_id} owner {classroom.user_id} is a class master (mixed class access)")
        
        print(f"DEBUG: Final access result for class {class_id}: {has_access} (reason: {access_reason})")
        print(f"DEBUG: Class owner: {classroom.user_id}, Current user: {current_user.id}")
        
        if not has_access:
            print(f"DEBUG: Access denied for class {class_id} owned by user {classroom.user_id}")
            return jsonify({'error': 'Accès non autorisé à cette classe'}), 403
        
        # Récupérer les élèves
        students_data = []
        for student in classroom.students:
            students_data.append({
                'id': student.id,
                'full_name': student.full_name,
                'first_name': student.first_name,
                'last_name': student.last_name
            })
        
        print(f"DEBUG mixed-class-students: Found {len(students_data)} students for class {classroom.name}")
        return jsonify({'students': students_data})
    except Exception as e:
        print(f"Erreur lors de la récupération des élèves pour classe mixte: {e}")
        return jsonify({'error': 'Erreur lors de la récupération des élèves'}), 500

@setup_bp.route('/classrooms/<int:classroom_id>/become-master', methods=['GET', 'POST'])
@login_required
def become_class_master(classroom_id):
    """Devenir maître d'une classe"""
    if request.method == 'GET':
        # Pour les requêtes GET, simplement rediriger
        return redirect(url_for('setup.manage_classrooms'))
    
    classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first_or_404()
    
    # NOUVEAU: Vérifier si c'est une classe dérivée (collaboration)
    from models.class_collaboration import SharedClassroom
    shared_classroom = SharedClassroom.query.filter_by(derived_classroom_id=classroom_id).first()
    
    if shared_classroom:
        # C'est une classe dérivée - on ne peut pas devenir maître
        flash('Vous ne pouvez pas devenir maître d\'une classe dérivée. Seul le maître de la classe originale peut être maître de classe.', 'error')
        return redirect(url_for('setup.manage_classrooms'))
    
    from models.class_collaboration import ClassMaster, TeacherAccessCode
    from datetime import datetime
    
    # Déterminer l'année scolaire actuelle
    current_year = datetime.now().year
    if datetime.now().month >= 8:  # Année scolaire commence en août
        school_year = f"{current_year}-{current_year + 1}"
    else:
        school_year = f"{current_year - 1}-{current_year}"
    
    # Vérifier si l'utilisateur est déjà maître de cette classe
    existing_master = ClassMaster.query.filter_by(
        classroom_id=classroom_id,
        master_teacher_id=current_user.id,
        school_year=school_year
    ).first()
    
    if existing_master:
        flash('Vous êtes déjà maître de cette classe.', 'info')
    else:
        # Récupérer toutes les classes du même groupe (même class_group ou même nom)
        group_name = classroom.class_group or classroom.name
        
        # Trouver toutes les classes de l'utilisateur avec le même nom de groupe
        group_classrooms = Classroom.query.filter_by(user_id=current_user.id).filter(
            (Classroom.class_group == group_name) if classroom.class_group 
            else (Classroom.name == group_name)
        ).all()
        
        # Créer un enregistrement de maître de classe pour TOUTES les classes du groupe
        classes_made_master = []
        for group_classroom in group_classrooms:
            # Vérifier si pas déjà maître
            existing = ClassMaster.query.filter_by(
                classroom_id=group_classroom.id,
                master_teacher_id=current_user.id,
                school_year=school_year
            ).first()
            
            if not existing:
                class_master = ClassMaster(
                    classroom_id=group_classroom.id,
                    master_teacher_id=current_user.id,
                    school_year=school_year
                )
                db.session.add(class_master)
                classes_made_master.append(f"{group_classroom.name} ({group_classroom.subject})")
            
            # Mettre à jour aussi le champ is_class_master dans Classroom
            if not group_classroom.is_class_master:
                group_classroom.is_class_master = True
        
        if classes_made_master:
            flash(f'Vous êtes maintenant maître de classe pour : {", ".join(classes_made_master)}', 'success')
        else:
            flash('Vous étiez déjà maître de toutes les classes de ce groupe.', 'info')
        
        try:
            db.session.commit()
            flash(f'Vous êtes maintenant maître de la classe "{classroom.name}".', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Erreur lors de la configuration : {str(e)}', 'error')
    
    return redirect(url_for('setup.manage_classrooms'))

@setup_bp.route('/invitations/<int:invitation_id>/respond', methods=['POST'])
@login_required
def respond_to_invitation(invitation_id):
    """Répondre à une invitation (accepter/rejeter)"""
    from models.teacher_invitation import TeacherInvitation
    from models.class_collaboration import TeacherAccessCode, TeacherCollaboration
    
    invitation = TeacherInvitation.query.filter_by(
        id=invitation_id,
        target_master_teacher_id=current_user.id,
        status='pending'
    ).first_or_404()
    
    action = request.form.get('action')
    response_message = request.form.get('response_message', '').strip()
    
    if action == 'accept':
        # Accepter l'invitation
        invitation.accept(response_message)
        
        # Vérifier si une collaboration existe déjà
        existing_collaboration = TeacherCollaboration.query.filter_by(
            specialized_teacher_id=invitation.requesting_teacher_id,
            master_teacher_id=current_user.id
        ).first()
        
        if existing_collaboration:
            # Utiliser la collaboration existante
            collaboration = existing_collaboration
            print(f"DEBUG: Utilisation de la collaboration existante {collaboration.id}")
        else:
            # Créer automatiquement un code d'accès et une collaboration
            access_code = TeacherAccessCode(
                master_teacher_id=current_user.id,
                code=TeacherAccessCode.generate_code(6),
                max_uses=1  # Code à usage unique pour cette invitation
            )
            db.session.add(access_code)
            db.session.flush()  # Pour obtenir l'ID
            
            # Créer la collaboration
            collaboration = TeacherCollaboration(
                specialized_teacher_id=invitation.requesting_teacher_id,
                master_teacher_id=current_user.id,
                access_code_id=access_code.id
            )
            db.session.add(collaboration)
            
            # Marquer le code comme utilisé
            access_code.use_code()
            print(f"DEBUG: Nouvelle collaboration créée {collaboration.id}")
        
        # S'assurer que la collaboration est bien commitée pour avoir un ID
        db.session.flush()
        
        # Traiter toutes les classes de l'invitation (multi-disciplines)
        from models.invitation_classroom import InvitationClassroom
        invitation_classrooms = InvitationClassroom.query.filter_by(invitation_id=invitation.id).all()
        
        # Si pas de disciplines spécifiques, utiliser l'ancienne logique (rétrocompatibilité)
        if not invitation_classrooms:
            invitation_classrooms = [type('obj', (object,), {
                'target_classroom_id': invitation.target_classroom_id,
                'proposed_class_name': invitation.proposed_class_name,
                'proposed_subject': invitation.proposed_subject,
                'proposed_color': invitation.proposed_color
            })()]
        
        created_classes = []
        print(f"DEBUG: Traitement de {len(invitation_classrooms)} disciplines")
        
        for idx, inv_classroom in enumerate(invitation_classrooms):
            # Pour la première classe, utiliser la classe temporaire existante
            # Pour les autres, créer de nouvelles classes
            if idx == 0:
                # CORRIGÉ: Chercher la classe temporaire par class_group ET subject
                temp_classroom = Classroom.query.filter_by(
                    user_id=invitation.requesting_teacher_id,
                    class_group=invitation.proposed_class_name,  # Le personal_class_name
                    subject=inv_classroom.proposed_subject,
                    is_temporary=True
                ).first()
                
                if temp_classroom:
                    temp_classroom.is_temporary = False
                    temp_classroom.color = inv_classroom.proposed_color
                    # Garder le nom original de la classe (pas le personal_class_name)
                    # temp_classroom.name reste celui du maître (target_classroom.name)
                    temp_classroom.subject = inv_classroom.proposed_subject
            else:
                # Créer une nouvelle classe pour les classes supplémentaires
                # CORRIGÉ: Utiliser la même structure que pour la création initiale
                target_classroom = Classroom.query.get(invitation.target_classroom_id)
                temp_classroom = Classroom(
                    user_id=invitation.requesting_teacher_id,
                    name=target_classroom.name,  # Nom original du maître
                    class_group=invitation.proposed_class_name,  # Personal_class_name
                    subject=inv_classroom.proposed_subject,
                    color=inv_classroom.proposed_color,
                    is_temporary=False
                )
                db.session.add(temp_classroom)
                db.session.flush()  # Pour obtenir l'ID
            
            if temp_classroom:
                # Créer la liaison entre la classe de l'enseignant et celle du maître
                from models.class_collaboration import SharedClassroom
                shared_classroom = SharedClassroom(
                    collaboration_id=collaboration.id,
                    original_classroom_id=inv_classroom.target_classroom_id,  # Classe du maître
                    derived_classroom_id=temp_classroom.id,  # Classe de l'enseignant
                    subject=inv_classroom.proposed_subject
                )
                db.session.add(shared_classroom)
                
                # Mettre à jour le class_group de la classe de l'enseignant pour correspondre au maître
                target_classroom = Classroom.query.get(inv_classroom.target_classroom_id)
                if target_classroom:
                    temp_classroom.class_group = target_classroom.class_group or target_classroom.name
                
                created_classes.append(temp_classroom)
        
        # CORRECTIF: Création automatique des préférences et détection du mode centralisé pour toutes les classes
        from models.user_preferences import UserSanctionPreferences
        from models.class_collaboration import ClassMaster
        
        # Traiter les préférences pour chaque classe créée
        for temp_classroom in created_classes:
            if not temp_classroom:
                continue
                
            # Trouver la classe maître correspondante via SharedClassroom
            shared_classroom = SharedClassroom.query.filter_by(
                collaboration_id=collaboration.id,
                derived_classroom_id=temp_classroom.id
            ).first()
            
            if shared_classroom:
                master_classroom_id = shared_classroom.original_classroom_id
                
                # S'assurer que les préférences du maître existent
                master_prefs = UserSanctionPreferences.query.filter_by(
                    user_id=current_user.id,
                    classroom_id=master_classroom_id
                ).first()
                
                if not master_prefs:
                    master_prefs = UserSanctionPreferences(
                        user_id=current_user.id,
                        classroom_id=master_classroom_id,
                        display_mode='unified'  # Mode par défaut
                    )
                    db.session.add(master_prefs)
                    db.session.flush()  # Pour obtenir l'ID
                
                # Créer ou mettre à jour les préférences de l'enseignant spécialisé
                specialized_prefs = UserSanctionPreferences.query.filter_by(
                    user_id=invitation.requesting_teacher_id,
                    classroom_id=temp_classroom.id
                ).first()
                
                if not specialized_prefs:
                    specialized_prefs = UserSanctionPreferences(
                        user_id=invitation.requesting_teacher_id,
                        classroom_id=temp_classroom.id,
                        display_mode='unified',  # Mode par défaut
                        is_locked=False,
                        locked_by_user_id=None
                    )
                    db.session.add(specialized_prefs)
                
                # Vérifier si le maître est en mode centralisé et appliquer le verrouillage
                if master_prefs.display_mode == 'centralized':
                    # Verrouiller automatiquement l'enseignant spécialisé
                    specialized_prefs.display_mode = 'centralized'
                    specialized_prefs.is_locked = True
                    specialized_prefs.locked_by_user_id = current_user.id
                    
                    # Appliquer le verrouillage à toutes les classes du groupe
                    UserSanctionPreferences.lock_classroom_for_centralized_mode(
                        master_classroom_id, 
                        current_user.id
                    )
        
        # Copier les élèves des classes originales vers les classes de l'enseignant spécialisé
        print(f"DEBUG ACCEPT: Copying students to {len(created_classes)} accepted classes")
        
        # Importer Student pour la copie des élèves
        from models.student import Student
        
        for temp_classroom in created_classes:
            if not temp_classroom:
                continue
                
            # Trouver la classe originale via SharedClassroom
            shared_classroom = SharedClassroom.query.filter_by(
                collaboration_id=collaboration.id,
                derived_classroom_id=temp_classroom.id
            ).first()
            
            if shared_classroom:
                original_classroom_id = shared_classroom.original_classroom_id
                print(f"DEBUG ACCEPT: Copying students from original classroom {original_classroom_id} to derived classroom {temp_classroom.id}")
                
                # Vérifier s'il y a déjà des élèves dans la classe dérivée
                existing_students_count = Student.query.filter_by(classroom_id=temp_classroom.id).count()
                if existing_students_count > 0:
                    print(f"DEBUG ACCEPT: Classroom {temp_classroom.id} already has {existing_students_count} students, skipping copy")
                    continue
                
                # Récupérer tous les élèves de la classe originale
                original_students = Student.query.filter_by(classroom_id=original_classroom_id).all()
                print(f"DEBUG ACCEPT: Found {len(original_students)} students in original classroom")
                
                # Copier chaque élève
                for original_student in original_students:
                    # Créer une copie de l'élève pour la classe dérivée
                    derived_student = Student(
                        classroom_id=temp_classroom.id,
                        user_id=invitation.requesting_teacher_id,  # L'enseignant spécialisé devient propriétaire
                        first_name=original_student.first_name,
                        last_name=original_student.last_name,
                        email=original_student.email,
                        date_of_birth=original_student.date_of_birth,
                        parent_email_mother=original_student.parent_email_mother,
                        parent_email_father=original_student.parent_email_father,
                        additional_info=original_student.additional_info
                    )
                    db.session.add(derived_student)
                    db.session.flush()  # Pour obtenir l'ID
                    
                    # Créer le lien entre élève et classe
                    from models.class_collaboration import StudentClassroomLink
                    student_link = StudentClassroomLink(
                        student_id=derived_student.id,
                        classroom_id=temp_classroom.id,
                        subject=shared_classroom.subject,
                        is_primary=False,
                        added_by_teacher_id=invitation.requesting_teacher_id
                    )
                    db.session.add(student_link)
                
                print(f"DEBUG ACCEPT: Copied {len(original_students)} students to derived classroom {temp_classroom.id}")
        
        try:
            db.session.commit()
            class_count = len(created_classes)
            if class_count > 1:
                flash(f'Invitation acceptée ! {invitation.requesting_teacher.username} peut maintenant accéder à {class_count} de vos classes.', 'success')
            else:
                flash(f'Invitation acceptée ! {invitation.requesting_teacher.username} peut maintenant accéder à vos classes.', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Erreur lors de l\'acceptation : {str(e)}', 'error')
            
    elif action == 'reject':
        # Rejeter l'invitation
        invitation.reject(response_message)
        
        # Supprimer TOUTES les classes temporaires de cette invitation
        temp_classrooms = Classroom.query.filter_by(
            user_id=invitation.requesting_teacher_id,
            class_group=invitation.proposed_class_name,  # Le personal_class_name
            is_temporary=True
        ).all()
        
        for temp_classroom in temp_classrooms:
            db.session.delete(temp_classroom)
        
        try:
            db.session.commit()
            flash(f'Invitation rejetée.', 'info')
        except Exception as e:
            db.session.rollback()
            flash(f'Erreur lors du rejet : {str(e)}', 'error')
    
    return redirect(url_for('planning.dashboard'))

@setup_bp.route('/classrooms/initial', methods=['GET', 'POST'])
@login_required
def manage_classrooms_initial():
    form = ClassroomSetupForm()
    
    if form.validate_on_submit():
        if form.setup_type.data == 'master':
            # Créer des classes en tant que maître
            for classroom_form in form.classrooms:
                if classroom_form.name.data and classroom_form.subject.data:
                    classroom = Classroom(
                        user_id=current_user.id,
                        name=classroom_form.name.data,
                        subject=classroom_form.subject.data,
                        color=classroom_form.color.data or '#4F46E5'
                    )
                    db.session.add(classroom)
            
            try:
                db.session.commit()
                # Marquer la configuration comme complète
                current_user.setup_completed = True
                db.session.commit()
                flash('Classes créées avec succès !', 'success')
                return redirect(url_for('schedule.weekly_schedule'))
            except Exception as e:
                db.session.rollback()
                flash(f'Erreur lors de la création des classes : {str(e)}', 'error')
                
        elif form.setup_type.data == 'specialized':
            # Se lier à un enseignant existant
            access_code = form.access_code.data.strip().upper()
            master_teacher_name = form.master_teacher_name.data.strip()
            
            if not access_code or not master_teacher_name:
                flash('Code d\'accès et nom du maître de classe requis', 'error')
            else:
                # Utiliser la logique de collaboration existante
                from models.class_collaboration import TeacherAccessCode, TeacherCollaboration
                
                # Rechercher le code d'accès
                code_obj = TeacherAccessCode.query.filter_by(code=access_code).first()
                
                if not code_obj or not code_obj.is_valid():
                    flash('Code d\'accès invalide ou expiré', 'error')
                else:
                    # Vérifier que le nom du maître correspond
                    master_teacher = code_obj.master_teacher
                    if (master_teacher_name.lower() != master_teacher.username.lower() and 
                        master_teacher_name.lower() != master_teacher.email.lower()):
                        flash(f'Le nom ne correspond pas. Maître de classe : {master_teacher.username}', 'error')
                    else:
                        # Vérifier qu'il n'y a pas déjà une collaboration
                        existing_collaboration = TeacherCollaboration.query.filter_by(
                            specialized_teacher_id=current_user.id,
                            master_teacher_id=master_teacher.id
                        ).first()
                        
                        if existing_collaboration:
                            flash('Vous collaborez déjà avec cet enseignant', 'error')
                        else:
                            # Créer la collaboration
                            collaboration = TeacherCollaboration(
                                specialized_teacher_id=current_user.id,
                                master_teacher_id=master_teacher.id,
                                access_code_id=code_obj.id
                            )
                            db.session.add(collaboration)
                            
                            # Utiliser le code
                            code_obj.use_code()
                            
                            try:
                                db.session.commit()
                                # Marquer la configuration comme complète
                                current_user.setup_completed = True
                                db.session.commit()
                                flash(f'Collaboration établie avec {master_teacher.username}', 'success')
                                return redirect(url_for('collaboration.select_class', collaboration_id=collaboration.id))
                            except Exception as e:
                                db.session.rollback()
                                flash(f'Erreur lors de la création de la collaboration : {str(e)}', 'error')

    # Pré-remplir avec une classe par défaut si première utilisation
    if not form.classrooms.data or len(form.classrooms.data) == 0:
        form.classrooms.append_entry()

    classrooms = current_user.classrooms.all()
    return render_template('setup/manage_classrooms.html', classrooms=classrooms, form=form)

@setup_bp.route('/classrooms/<int:id>/delete', methods=['POST'])
@login_required
def delete_classroom(id):
    classroom = Classroom.query.filter_by(id=id, user_id=current_user.id).first_or_404()
    
    from models.class_collaboration import ClassMaster, SharedClassroom
    from models.student import Student
    from models.parent import ClassCode
    from models.user_preferences import UserSanctionPreferences
    
    # Vérifier si l'utilisateur est le maître de cette classe
    is_class_master = ClassMaster.query.filter_by(
        classroom_id=classroom.id, 
        master_teacher_id=current_user.id
    ).first() is not None
    
    if is_class_master:
        # CAS 1: L'utilisateur est le maître de classe - SUPPRESSION COMPLÈTE
        print(f"DEBUG DELETE: User {current_user.id} is class master - performing complete deletion")
        
        # Vérifier s'il y a des classes dérivées (enseignants spécialisés qui utilisent cette classe)
        shared_as_original = SharedClassroom.query.filter_by(original_classroom_id=classroom.id).count()
        if shared_as_original > 0:
            flash(f'Impossible de supprimer la classe "{classroom.name}" car elle est partagée avec {shared_as_original} enseignant(s) spécialisé(s).', 'error')
            return redirect(url_for('setup.manage_classrooms'))
        
        # Supprimer tous les enregistrements liés à cette classe
        group_name = classroom.class_group or classroom.name
        
        # Trouver toutes les classes de tous les utilisateurs avec le même nom de groupe
        group_classrooms = Classroom.query.filter(
            (Classroom.class_group == group_name) if classroom.class_group 
            else (Classroom.name == group_name)
        ).all()
        
        # Vider la session pour éviter les conflits avec les objets en mémoire
        db.session.expunge_all()
        
        # Supprimer tous les enregistrements pour toutes les classes du groupe
        for group_classroom in group_classrooms:
            print(f"DEBUG DELETE: Processing group classroom {group_classroom.id}")
            
            # NOUVEAU: Supprimer tous les liens de collaboration liés à cette classe
            # 1. Supprimer les StudentClassroomLinks
            db.session.execute(
                db.text("DELETE FROM student_classroom_links WHERE classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            print(f"DEBUG DELETE: Removed all student classroom links for classroom {group_classroom.id}")
            
            # 2. Supprimer les SharedClassrooms (en tant qu'originale ET dérivée)
            db.session.execute(
                db.text("DELETE FROM shared_classrooms WHERE original_classroom_id = :classroom_id OR derived_classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            print(f"DEBUG DELETE: Removed all shared classrooms for classroom {group_classroom.id}")
            
            # 3. Supprimer les TeacherCollaboration liées (via user_id)
            db.session.execute(
                db.text("DELETE FROM teacher_collaborations WHERE master_teacher_id = :user_id OR specialized_teacher_id = :user_id"),
                {"user_id": group_classroom.user_id}
            )
            print(f"DEBUG DELETE: Removed all teacher collaborations for user {group_classroom.user_id}")
            
            # 4. Supprimer les TeacherAccessCode du maître de cette classe
            db.session.execute(
                db.text("DELETE FROM teacher_access_codes WHERE master_teacher_id = :user_id"),
                {"user_id": group_classroom.user_id}
            )
            print(f"DEBUG DELETE: Removed all access codes for user {group_classroom.user_id}")
            
            # Supprimer les préférences de sanctions EN PREMIER (pour éviter les contraintes)
            # Utiliser du SQL brut pour éviter les problèmes de relations SQLAlchemy
            db.session.execute(
                db.text("DELETE FROM user_sanction_preferences WHERE classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            print(f"DEBUG DELETE: Removed all sanction preferences for classroom {group_classroom.id}")
            
            # Supprimer les ClassMaster
            db.session.execute(
                db.text("DELETE FROM class_masters WHERE classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            
            # Supprimer les étudiants
            db.session.execute(
                db.text("DELETE FROM students WHERE classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            print(f"DEBUG DELETE: Removed all students for classroom {group_classroom.id}")
            
            # Supprimer les codes de classe
            db.session.execute(
                db.text("DELETE FROM class_codes WHERE classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            print(f"DEBUG DELETE: Removed all class codes for classroom {group_classroom.id}")
            
            # NOUVEAU: Supprimer les groupes mixtes liés à cette classe auto-créée
            # 1. Trouver tous les groupes mixtes qui utilisent cette classe comme auto_classroom
            mixed_groups_to_delete = db.session.execute(
                db.text("SELECT id FROM mixed_groups WHERE auto_classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            ).fetchall()
            
            for (mixed_group_id,) in mixed_groups_to_delete:
                print(f"DEBUG DELETE: Found mixed group {mixed_group_id} linked to classroom {group_classroom.id}")
                
                # Supprimer les liens élèves-groupe mixte
                db.session.execute(
                    db.text("DELETE FROM mixed_group_students WHERE mixed_group_id = :mixed_group_id"),
                    {"mixed_group_id": mixed_group_id}
                )
                print(f"DEBUG DELETE: Removed all mixed group students for mixed group {mixed_group_id}")
                
                # Supprimer les invitations liées à ce groupe mixte
                db.session.execute(
                    db.text("DELETE FROM teacher_invitations WHERE requesting_teacher_id = :user_id AND proposed_subject = 'Classe mixte'"),
                    {"user_id": group_classroom.user_id}
                )
                print(f"DEBUG DELETE: Removed teacher invitations for mixed groups of user {group_classroom.user_id}")
                
                # Supprimer le groupe mixte lui-même
                db.session.execute(
                    db.text("DELETE FROM mixed_groups WHERE id = :mixed_group_id"),
                    {"mixed_group_id": mixed_group_id}
                )
                print(f"DEBUG DELETE: Removed mixed group {mixed_group_id}")
            
            # Supprimer les plannings/horaires
            db.session.execute(
                db.text("DELETE FROM schedules WHERE classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            print(f"DEBUG DELETE: Removed all schedules for classroom {group_classroom.id}")
            
            # Supprimer les plannings de cours
            db.session.execute(
                db.text("DELETE FROM plannings WHERE classroom_id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            print(f"DEBUG DELETE: Removed all plannings for classroom {group_classroom.id}")
            
            # Supprimer la classe elle-même
            db.session.execute(
                db.text("DELETE FROM classrooms WHERE id = :classroom_id"),
                {"classroom_id": group_classroom.id}
            )
            print(f"DEBUG DELETE: Removed classroom {group_classroom.id}")
        
        flash(f'Classe "{classroom.name}" et toutes ses données supprimées avec succès.', 'info')
        
    else:
        # CAS 2: L'utilisateur n'est pas le maître - DÉLIAISON SIMPLE
        print(f"DEBUG DELETE: User {current_user.id} is not class master - performing simple unlinking")
        
        # Vider la session pour éviter les conflits avec les objets en mémoire
        db.session.expunge_all()
        
        # NOUVEAU: Supprimer TOUS les liens de collaboration de cet utilisateur
        # 1. Supprimer les StudentClassroomLinks
        db.session.execute(
            db.text("DELETE FROM student_classroom_links WHERE classroom_id = :classroom_id"),
            {"classroom_id": classroom.id}
        )
        print(f"DEBUG DELETE: Removed student classroom links for classroom {classroom.id}")
        
        # 2. Supprimer les SharedClassrooms où cette classe est dérivée
        db.session.execute(
            db.text("DELETE FROM shared_classrooms WHERE derived_classroom_id = :classroom_id"),
            {"classroom_id": classroom.id}
        )
        print(f"DEBUG DELETE: Removed SharedClassroom links for classroom {classroom.id}")
        
        # 3. Supprimer les TeacherCollaboration SEULEMENT si c'est la dernière classe dérivée
        # Vérifier d'abord s'il reste d'autres classes dérivées pour cet utilisateur
        from models.class_collaboration import SharedClassroom, TeacherCollaboration
        
        # Récupérer la collaboration liée à cette classe (avant suppression)
        shared_classroom = SharedClassroom.query.filter_by(derived_classroom_id=classroom.id).first()
        if shared_classroom:
            collaboration_id = shared_classroom.collaboration_id
            
            # Compter les autres classes dérivées dans la même collaboration
            other_derived_classes = SharedClassroom.query.filter_by(
                collaboration_id=collaboration_id
            ).filter(SharedClassroom.derived_classroom_id != classroom.id).count()
            
            print(f"DEBUG DELETE: Found {other_derived_classes} other derived classes in same collaboration")
            
            # Supprimer la collaboration SEULEMENT s'il n'y a pas d'autres classes dérivées
            if other_derived_classes == 0:
                db.session.execute(
                    db.text("DELETE FROM teacher_collaborations WHERE id = :collaboration_id"),
                    {"collaboration_id": collaboration_id}
                )
                print(f"DEBUG DELETE: Removed teacher collaboration {collaboration_id} (last derived class)")
            else:
                print(f"DEBUG DELETE: Kept teacher collaboration {collaboration_id} (other derived classes exist)")
        else:
            print(f"DEBUG DELETE: No SharedClassroom found for classroom {classroom.id}")
        
        # Supprimer les préférences de sanctions de l'utilisateur pour cette classe
        db.session.execute(
            db.text("DELETE FROM user_sanction_preferences WHERE user_id = :user_id AND classroom_id = :classroom_id"),
            {"user_id": current_user.id, "classroom_id": classroom.id}
        )
        print(f"DEBUG DELETE: Removed user sanction preferences for classroom {classroom.id}")
        
        # Supprimer les plannings/horaires de l'utilisateur pour cette classe
        db.session.execute(
            db.text("DELETE FROM schedules WHERE classroom_id = :classroom_id"),
            {"classroom_id": classroom.id}
        )
        print(f"DEBUG DELETE: Removed schedules for classroom {classroom.id}")
        
        # Supprimer les plannings de cours de l'utilisateur pour cette classe
        db.session.execute(
            db.text("DELETE FROM plannings WHERE classroom_id = :classroom_id"),
            {"classroom_id": classroom.id}
        )
        print(f"DEBUG DELETE: Removed plannings for classroom {classroom.id}")
        
        # NOUVEAU: Supprimer les groupes mixtes si cette classe était une classe auto-créée
        mixed_groups_to_delete = db.session.execute(
            db.text("SELECT id FROM mixed_groups WHERE auto_classroom_id = :classroom_id"),
            {"classroom_id": classroom.id}
        ).fetchall()
        
        for (mixed_group_id,) in mixed_groups_to_delete:
            print(f"DEBUG DELETE: Found mixed group {mixed_group_id} linked to classroom {classroom.id}")
            
            # Supprimer les liens élèves-groupe mixte
            db.session.execute(
                db.text("DELETE FROM mixed_group_students WHERE mixed_group_id = :mixed_group_id"),
                {"mixed_group_id": mixed_group_id}
            )
            print(f"DEBUG DELETE: Removed all mixed group students for mixed group {mixed_group_id}")
            
            # Supprimer les invitations liées à ce groupe mixte
            db.session.execute(
                db.text("DELETE FROM teacher_invitations WHERE requesting_teacher_id = :user_id AND proposed_subject = 'Classe mixte'"),
                {"user_id": current_user.id}
            )
            print(f"DEBUG DELETE: Removed teacher invitations for mixed groups of user {current_user.id}")
            
            # Supprimer le groupe mixte lui-même
            db.session.execute(
                db.text("DELETE FROM mixed_groups WHERE id = :mixed_group_id"),
                {"mixed_group_id": mixed_group_id}
            )
            print(f"DEBUG DELETE: Removed mixed group {mixed_group_id}")
        
        # Supprimer uniquement la classe de l'utilisateur (pas les étudiants, codes, etc.)
        db.session.execute(
            db.text("DELETE FROM classrooms WHERE id = :classroom_id"),
            {"classroom_id": classroom.id}
        )
        print(f"DEBUG DELETE: Removed classroom {classroom.id}")
        
        flash(f'Vous avez été délié de la classe "{classroom.name}" avec succès.', 'info')
    
    # Nettoyer automatiquement les plannings orphelins après suppression
    _cleanup_orphaned_schedules()
    
    db.session.commit()
    return redirect(url_for('setup.manage_classrooms'))

@setup_bp.route('/sync-class-masters')
@login_required
def sync_class_masters():
    """Synchroniser les maîtres de classe pour tous les groupes de classes"""
    from models.class_collaboration import ClassMaster
    
    try:
        # Récupérer tous les ClassMaster existants
        existing_masters = ClassMaster.query.filter_by(school_year="2024-2025").all()
        
        synced_count = 0
        for master in existing_masters:
            classroom = master.classroom
            group_name = classroom.class_group or classroom.name
            
            # Trouver toutes les classes du même groupe pour ce maître
            group_classrooms = Classroom.query.filter_by(user_id=master.master_teacher_id).filter(
                (Classroom.class_group == group_name) if classroom.class_group 
                else (Classroom.name == group_name)
            ).all()
            
            # Créer les enregistrements manquants
            for group_classroom in group_classrooms:
                existing = ClassMaster.query.filter_by(
                    classroom_id=group_classroom.id,
                    master_teacher_id=master.master_teacher_id,
                    school_year="2024-2025"
                ).first()
                
                if not existing:
                    new_master = ClassMaster(
                        classroom_id=group_classroom.id,
                        master_teacher_id=master.master_teacher_id,
                        school_year="2024-2025"
                    )
                    db.session.add(new_master)
                    synced_count += 1
        
        db.session.commit()
        flash(f'Synchronisation terminée. {synced_count} enregistrements de maître de classe créés.', 'success')
        
    except Exception as e:
        db.session.rollback()
        flash(f'Erreur lors de la synchronisation : {str(e)}', 'error')
    
    return redirect(url_for('setup.manage_classrooms'))

@setup_bp.route('/holidays', methods=['GET', 'POST'])
@login_required
def manage_holidays():
    # Vérifier si l'utilisateur appartient à un collège et s'il faut copier les vacances
    if current_user.college_name and current_user.holidays.count() == 0:
        college = College.query.filter_by(name=current_user.college_name).first()
        if college and college.holidays.count() > 0:
            # Copier les vacances du collège
            for college_holiday in college.holidays:
                user_holiday = Holiday(
                    user_id=current_user.id,
                    name=college_holiday.name,
                    start_date=college_holiday.start_date,
                    end_date=college_holiday.end_date
                )
                db.session.add(user_holiday)
            
            try:
                db.session.commit()
                flash(f'Vacances copiées depuis le collège "{college.name}" avec succès !', 'success')
            except Exception as e:
                db.session.rollback()
                flash(f'Erreur lors de la copie des vacances : {str(e)}', 'error')
    
    if request.method == 'POST':
        form = HolidayForm()
        if form.validate_on_submit():
            holiday = Holiday(
                user_id=current_user.id,
                name=form.name.data,
                start_date=form.start_date.data,
                end_date=form.end_date.data
            )
            db.session.add(holiday)
            
            # Si l'utilisateur appartient à un collège, ajouter aussi au niveau du collège
            if current_user.college_name:
                college = College.query.filter_by(name=current_user.college_name).first()
                if college and current_user.id == college.created_by_id:
                    # Seulement si c'est le créateur du collège
                    college_holiday = CollegeHoliday(
                        college_id=college.id,
                        name=form.name.data,
                        start_date=form.start_date.data,
                        end_date=form.end_date.data
                    )
                    db.session.add(college_holiday)
            
            db.session.commit()
            flash(f'Période de vacances "{holiday.name}" ajoutée avec succès !', 'success')
        return redirect(url_for('setup.manage_holidays'))

    holidays = current_user.holidays.all()
    form = HolidayForm()
    return render_template('setup/manage_holidays.html', holidays=holidays, form=form)

@setup_bp.route('/holidays/<int:id>/delete', methods=['POST'])
@login_required
def delete_holiday(id):
    holiday = Holiday.query.filter_by(id=id, user_id=current_user.id).first_or_404()
    db.session.delete(holiday)
    db.session.commit()
    flash(f'Période de vacances "{holiday.name}" supprimée avec succès.', 'info')
    return redirect(url_for('setup.manage_holidays'))

@setup_bp.route('/breaks', methods=['GET', 'POST'])
@login_required
def manage_breaks():
    # Vérifier si l'utilisateur appartient à un collège et s'il faut copier les pauses
    if current_user.college_name and current_user.breaks.count() == 0:
        college = College.query.filter_by(name=current_user.college_name).first()
        if college and college.breaks.count() > 0:
            # Copier les pauses du collège
            for college_break in college.breaks:
                user_break = Break(
                    user_id=current_user.id,
                    name=college_break.name,
                    start_time=college_break.start_time,
                    end_time=college_break.end_time,
                    is_major_break=college_break.is_major_break
                )
                db.session.add(user_break)
            
            try:
                db.session.commit()
                flash(f'Pauses copiées depuis le collège "{college.name}" avec succès !', 'success')
            except Exception as e:
                db.session.rollback()
                flash(f'Erreur lors de la copie des pauses : {str(e)}', 'error')
    
    if request.method == 'POST':
        form = BreakForm()
        if form.validate_on_submit():
            break_obj = Break(
                user_id=current_user.id,
                name=form.name.data,
                start_time=form.start_time.data,
                end_time=form.end_time.data,
                is_major_break=form.is_major_break.data
            )
            db.session.add(break_obj)
            
            # Si l'utilisateur appartient à un collège, ajouter aussi au niveau du collège
            if current_user.college_name:
                college = College.query.filter_by(name=current_user.college_name).first()
                if college and current_user.id == college.created_by_id:
                    # Seulement si c'est le créateur du collège
                    college_break = CollegeBreak(
                        college_id=college.id,
                        name=form.name.data,
                        start_time=form.start_time.data,
                        end_time=form.end_time.data,
                        is_major_break=form.is_major_break.data
                    )
                    db.session.add(college_break)
            
            db.session.commit()
            flash(f'Pause "{break_obj.name}" ajoutée avec succès !', 'success')
        return redirect(url_for('setup.manage_breaks'))

    breaks = current_user.breaks.all()
    form = BreakForm()
    return render_template('setup/manage_breaks.html', breaks=breaks, form=form)

@setup_bp.route('/holidays/import_vaud', methods=['POST'])
@login_required
def import_vaud_holidays():
    """Importe automatiquement les vacances scolaires vaudoises"""
    if not current_user.school_year_start:
        flash('Veuillez d\'abord configurer l\'année scolaire.', 'warning')
        return redirect(url_for('setup.initial_setup'))

    # Récupérer les vacances pour l'année scolaire
    holidays = get_vaud_holidays(current_user.school_year_start)

    if not holidays:
        flash('Aucune donnée de vacances disponible pour cette année scolaire.', 'warning')
        return redirect(url_for('setup.manage_holidays'))

    # Supprimer les anciennes vacances si demandé
    if request.form.get('replace_existing') == 'true':
        Holiday.query.filter_by(user_id=current_user.id).delete()

    # Ajouter les nouvelles vacances
    college = None
    if current_user.college_name:
        college = College.query.filter_by(name=current_user.college_name).first()
    
    for holiday_data in holidays:
        # Vérifier si cette période existe déjà
        existing = Holiday.query.filter_by(
            user_id=current_user.id,
            name=holiday_data['name'],
            start_date=holiday_data['start']
        ).first()

        if not existing:
            holiday = Holiday(
                user_id=current_user.id,
                name=holiday_data['name'],
                start_date=holiday_data['start'],
                end_date=holiday_data['end']
            )
            db.session.add(holiday)
            
            # Si c'est le créateur du collège, ajouter aussi au niveau du collège
            if college and current_user.id == college.created_by_id:
                college_holiday = CollegeHoliday(
                    college_id=college.id,
                    name=holiday_data['name'],
                    start_date=holiday_data['start'],
                    end_date=holiday_data['end']
                )
                db.session.add(college_holiday)

    try:
        db.session.commit()
        flash(f'{len(holidays)} périodes de vacances importées avec succès !', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Erreur lors de l\'import : {str(e)}', 'error')

    return redirect(url_for('setup.manage_holidays'))

@setup_bp.route('/validate_setup', methods=['GET', 'POST'])
@login_required
def validate_setup():
    """Valide que la configuration de base est complète"""
    # Vérifier que toutes les informations de base sont présentes
    if not current_user.school_year_start or not current_user.day_start_time:
        flash('Veuillez compléter la configuration initiale.', 'warning')
        return redirect(url_for('setup.initial_setup'))

    if current_user.classrooms.count() == 0:
        flash('Veuillez ajouter au moins une classe.', 'warning')
        return redirect(url_for('setup.manage_classrooms'))

    # Marquer la configuration de base comme complète
    current_user.setup_completed = True
    db.session.commit()

    flash('Configuration de base validée ! Créez maintenant votre horaire type.', 'success')
    return redirect(url_for('schedule.weekly_schedule'))

@setup_bp.route('/breaks/<int:id>/delete', methods=['POST'])
@login_required
def delete_break(id):
    break_obj = Break.query.filter_by(id=id, user_id=current_user.id).first_or_404()
    db.session.delete(break_obj)
    db.session.commit()
    flash(f'Pause "{break_obj.name}" supprimée avec succès.', 'info')
    return redirect(url_for('setup.manage_breaks'))

@setup_bp.route('/holidays/next')
@login_required 
def holidays_next():
    """Navigation vers l'étape suivante après les vacances"""
    return redirect(url_for('setup.manage_breaks'))

@setup_bp.route('/breaks/next')
@login_required
def breaks_next():
    """Navigation vers l'étape suivante après les pauses"""
    # Lors de la configuration initiale, utiliser manage_classrooms
    if not current_user.setup_completed:
        return redirect(url_for('setup.manage_classrooms'))
    else:
        return redirect(url_for('setup.manage_classrooms'))
