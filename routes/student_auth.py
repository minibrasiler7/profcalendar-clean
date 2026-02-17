from flask import Blueprint, render_template, redirect, url_for, flash, request, session
from flask_login import login_user, logout_user, current_user, login_required
from extensions import db
from models.student import Student
from models.student_access_code import StudentAccessCode
from models.class_collaboration import SharedClassroom
from models.email_verification import EmailVerification
from services.email_service import send_verification_code
from werkzeug.security import check_password_hash, generate_password_hash
from datetime import datetime, timedelta
import string
import random
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, Length, ValidationError

student_auth_bp = Blueprint('student_auth', __name__, url_prefix='/student')

class StudentLoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Mot de passe', validators=[DataRequired()])
    submit = SubmitField('Se connecter')

class StudentAccessCodeForm(FlaskForm):
    code = StringField('Code d\'accès', validators=[DataRequired(), Length(min=6, max=6)])
    submit = SubmitField('Valider')

class StudentRegisterForm(FlaskForm):
    student_email = StringField('Email élève (celui donné à votre enseignant)', validators=[DataRequired(), Email()])
    password = PasswordField('Mot de passe', validators=[
        DataRequired(),
        Length(min=8, message='Le mot de passe doit contenir au moins 8 caractères')
    ])
    confirm_password = PasswordField('Confirmer le mot de passe', validators=[
        DataRequired(),
        EqualTo('password', message='Les mots de passe doivent correspondre')
    ])
    access_code = StringField('Code d\'accès fourni par votre enseignant', validators=[
        DataRequired(),
        Length(min=6, max=6, message='Le code doit contenir exactement 6 caractères')
    ])
    submit = SubmitField('Créer mon compte')

@student_auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Page de connexion pour les élèves"""
    if current_user.is_authenticated:
        return redirect(url_for('student_auth.dashboard'))
    
    form = StudentLoginForm()
    
    if form.validate_on_submit():
        from utils.encryption import encryption_engine
        student = Student.query.filter_by(email_hash=encryption_engine.hash_email(form.email.data)).first()
        
        if student and student.password_hash and check_password_hash(student.password_hash, form.password.data):
            # Vérifier si l'élève a déjà validé un code d'accès
            if not student.is_authenticated:
                session['student_id'] = student.id
                return redirect(url_for('student_auth.verify_code'))

            # Vérifier si l'email est vérifié
            if not student.email_verified:
                verification = EmailVerification.create_verification(student.email, 'student')
                db.session.commit()
                email_sent = send_verification_code(student.email, verification.code, 'student')

                session['pending_user_id'] = student.id
                session['pending_user_type'] = 'student'
                session['verification_email'] = student.email
                if email_sent:
                    flash('Veuillez vérifier votre adresse email. Un nouveau code vous a été envoyé.', 'info')
                else:
                    flash('Impossible d\'envoyer le code de vérification. Veuillez réessayer.', 'error')
                return redirect(url_for('student_auth.verify_email_code'))

            # Mettre à jour la dernière connexion
            student.last_login = datetime.utcnow()
            db.session.commit()

            # Connexion de l'élève via Flask-Login
            session['user_type'] = 'student'
            login_user(student, remember=True)
            flash('Connexion réussie !', 'success')
            return redirect(url_for('student_auth.dashboard'))
        else:
            flash('Email ou mot de passe incorrect.', 'error')
    
    return render_template('student/login.html', form=form)

@student_auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    """Page d'inscription pour les élèves"""
    form = StudentRegisterForm()
    
    if form.validate_on_submit():
        # Vérifier le code d'accès de classe
        from models.classroom_access_code import ClassroomAccessCode
        code = ClassroomAccessCode.query.filter_by(code=form.access_code.data.upper()).first()
        
        if not code or not code.is_valid():
            flash('Code d\'accès invalide ou expiré.', 'error')
            return render_template('student/register.html', form=form)
        
        # Chercher l'élève dans la classe associée au code (par email_hash car email est chiffré)
        from models.student import Student
        from utils.encryption import encryption_engine
        student_email = form.student_email.data.strip().lower()
        student_email_hash = encryption_engine.hash_email(student_email)

        # Recherche par hash si disponible, sinon fallback sur comparaison en Python
        if student_email_hash:
            student = Student.query.filter_by(
                classroom_id=code.classroom_id,
                email_hash=student_email_hash
            ).first()
        else:
            # Fallback: chiffrement désactivé, chercher par email en clair
            student = Student.query.filter_by(
                classroom_id=code.classroom_id,
                email=student_email
            ).first()

        # Si pas trouvé par hash, essayer en Python (cas de données legacy sans hash)
        if not student:
            all_students = Student.query.filter_by(classroom_id=code.classroom_id).all()
            for s in all_students:
                if s.email and s.email.strip().lower() == student_email:
                    student = s
                    break
        
        if not student:
            flash('Aucun élève trouvé avec cet email dans cette classe. Vérifiez avec votre enseignant.', 'error')
            return render_template('student/register.html', form=form)
        
        # Vérifier que l'élève n'a pas déjà un compte
        if student.password_hash:
            # Si l'email n'est pas vérifié, renvoyer un code et rediriger
            if not student.email_verified:
                try:
                    verification = EmailVerification.create_verification(student.email, 'student')
                    db.session.commit()
                    send_verification_code(student.email, verification.code, 'student')
                    session['pending_user_id'] = student.id
                    session['pending_user_type'] = 'student'
                    session['verification_email'] = student.email
                    flash('Un compte existe déjà mais l\'email n\'est pas vérifié. Un nouveau code vous a été envoyé.', 'info')
                    return redirect(url_for('student_auth.verify_email_code'))
                except Exception:
                    pass
            flash('Un compte existe déjà pour cet élève.', 'error')
            return render_template('student/register.html', form=form)
        
        # Créer le compte
        student.password_hash = generate_password_hash(form.password.data)
        student.is_authenticated = True

        try:
            # Générer et envoyer le code de vérification email
            verification = EmailVerification.create_verification(student.email, 'student')
            db.session.commit()

            email_sent = send_verification_code(student.email, verification.code, 'student')

            # Stocker l'ID en session pour la vérification
            session['pending_user_id'] = student.id
            session['pending_user_type'] = 'student'
            session['verification_email'] = student.email

            if email_sent:
                flash('Un code de vérification a été envoyé à votre adresse email.', 'info')
            else:
                flash('Compte créé, mais impossible d\'envoyer le code. Veuillez réessayer.', 'error')
            return redirect(url_for('student_auth.verify_email_code'))
        except Exception as e:
            db.session.rollback()
            flash(f'Erreur lors de la création du compte : {str(e)}', 'error')

    return render_template('student/register.html', form=form)

@student_auth_bp.route('/verify-code', methods=['GET', 'POST'])
def verify_code():
    """Vérification du code d'accès pour les élèves déjà inscrits"""
    if 'student_id' not in session:
        return redirect(url_for('student_auth.login'))
    
    student = Student.query.get(session['student_id'])
    if not student:
        session.pop('student_id', None)
        return redirect(url_for('student_auth.login'))
    
    form = StudentAccessCodeForm()
    
    if form.validate_on_submit():
        # Vérifier le code d'accès de classe
        from models.classroom_access_code import ClassroomAccessCode
        code = ClassroomAccessCode.query.filter_by(
            classroom_id=student.classroom_id,
            code=form.code.data.upper()
        ).first()
        
        if code and code.is_valid():
            student.is_authenticated = True
            student.last_login = datetime.utcnow()

            try:
                db.session.commit()
                # Connexion via Flask-Login
                session['user_type'] = 'student'
                login_user(student, remember=True)
                flash('Code validé avec succès !', 'success')
                return redirect(url_for('student_auth.dashboard'))
            except Exception as e:
                db.session.rollback()
                flash(f'Erreur : {str(e)}', 'error')
        else:
            flash('Code invalide ou expiré.', 'error')
    
    return render_template('student/verify_code.html', form=form, student=student)

@student_auth_bp.route('/verify-email', methods=['GET', 'POST'])
def verify_email_code():
    """Vérification du code email pour les élèves"""
    student_id = session.get('pending_user_id')
    if not student_id or session.get('pending_user_type') != 'student':
        return redirect(url_for('student_auth.register'))

    student = Student.query.get(student_id)
    if not student:
        session.pop('pending_user_id', None)
        return redirect(url_for('student_auth.register'))

    if request.method == 'POST':
        code = request.form.get('code', '').strip()

        verification = EmailVerification.query.filter_by(
            email=student.email,
            code=code,
            user_type='student',
            is_used=False
        ).first()

        if verification and verification.is_valid():
            verification.is_used = True
            student.email_verified = True
            student.last_login = datetime.utcnow()
            db.session.commit()

            # Connecter l'élève
            session.clear()
            session['user_type'] = 'student'
            login_user(student, remember=True)

            flash('Email vérifié avec succès ! Bienvenue.', 'success')
            return redirect(url_for('student_auth.dashboard'))
        else:
            flash('Code invalide ou expiré.', 'error')

    return render_template('student/verify_email.html', email=student.email)

@student_auth_bp.route('/resend-code', methods=['POST'])
def resend_code():
    """Renvoyer un code de vérification (rate limit: 1/min)"""
    student_id = session.get('pending_user_id')
    if not student_id or session.get('pending_user_type') != 'student':
        return redirect(url_for('student_auth.register'))

    student = Student.query.get(student_id)
    if not student:
        return redirect(url_for('student_auth.register'))

    last_verification = EmailVerification.query.filter_by(
        email=student.email,
        user_type='student'
    ).order_by(EmailVerification.created_at.desc()).first()

    if last_verification and (datetime.utcnow() - last_verification.created_at) < timedelta(minutes=1):
        flash('Veuillez attendre 1 minute avant de renvoyer un code.', 'error')
        return redirect(url_for('student_auth.verify_email_code'))

    verification = EmailVerification.create_verification(student.email, 'student')
    db.session.commit()

    email_sent = send_verification_code(student.email, verification.code, 'student')
    if email_sent:
        flash('Un nouveau code a été envoyé.', 'success')
    else:
        flash('Impossible d\'envoyer le code. Veuillez réessayer.', 'error')
    return redirect(url_for('student_auth.verify_email_code'))

@student_auth_bp.route('/dashboard')
@login_required
def dashboard():
    """Tableau de bord de l'élève"""
    # Vérifier que c'est bien un élève qui est connecté
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user
    if not student.is_authenticated:
        return redirect(url_for('student_auth.login'))
    
    # Récupérer toutes les copies de l'élève dans les classes dérivées
    all_student_ids = [student.id]
    
    # Trouver les classes dérivées
    shared_classrooms = SharedClassroom.query.filter_by(
        original_classroom_id=student.classroom_id
    ).all()
    
    for shared in shared_classrooms:
        derived_student = Student.query.filter_by(
            classroom_id=shared.derived_classroom_id,
            first_name=student.first_name,
            last_name=student.last_name,
            date_of_birth=student.date_of_birth
        ).first()
        if derived_student:
            all_student_ids.append(derived_student.id)
    
    # Récupérer toutes les notes
    from models.evaluation import EvaluationGrade, Evaluation
    from models.classroom import Classroom
    grades = EvaluationGrade.query.join(Evaluation).join(Classroom).filter(
        EvaluationGrade.student_id.in_(all_student_ids),
        EvaluationGrade.points.isnot(None)
    ).order_by(Evaluation.date.desc()).all()
    
    # Organiser les notes par matière avec les mêmes détails que la page grades
    grades_by_subject = {}
    for grade in grades:
        subject = grade.evaluation.classroom.subject
        if subject not in grades_by_subject:
            grades_by_subject[subject] = {
                'grades': [],
                'average': 0,
                'total_points': 0,
                'count': 0
            }
        
        grades_by_subject[subject]['grades'].append(grade)
        if grade.points is not None:
            grades_by_subject[subject]['total_points'] += grade.points
            grades_by_subject[subject]['count'] += 1
    
    # Calculer les moyennes
    for subject_data in grades_by_subject.values():
        if subject_data['count'] > 0:
            subject_data['average'] = subject_data['total_points'] / subject_data['count']
    
    # Récupérer les fichiers partagés avec l'élève (pour le dashboard, on prend les 5 plus récents)
    from models.file_sharing import StudentFileShare
    from models.class_file import ClassFile
    
    recent_shared_files = db.session.query(StudentFileShare, ClassFile).join(
        ClassFile, StudentFileShare.file_id == ClassFile.id
    ).filter(
        StudentFileShare.student_id.in_(all_student_ids),
        StudentFileShare.is_active == True
    ).order_by(StudentFileShare.shared_at.desc()).limit(5).all()
    
    # Convertir en format compatible avec le template existant
    class_files = [file for share, file in recent_shared_files]

    # Récupérer les remarques envoyées à l'élève
    from models.lesson_memo import StudentRemark
    remarks = StudentRemark.query.filter(
        StudentRemark.student_id.in_(all_student_ids),
        StudentRemark.send_to_parent_and_student == True
    ).order_by(StudentRemark.created_at.desc()).limit(20).all()

    # Compter les remarques non lues
    unread_remarks_count = StudentRemark.query.filter(
        StudentRemark.student_id.in_(all_student_ids),
        StudentRemark.send_to_parent_and_student == True,
        StudentRemark.is_viewed_by_student == False
    ).count()

    return render_template('student/dashboard.html',
                         student=student,
                         grades_by_subject=grades_by_subject,
                         class_files=class_files,
                         remarks=remarks,
                         unread_remarks_count=unread_remarks_count)

@student_auth_bp.route('/logout')
@login_required
def logout():
    """Déconnexion de l'élève"""
    logout_user()
    session.pop('user_type', None)
    flash('Vous avez été déconnecté.', 'info')
    return redirect(url_for('student_auth.login'))

@student_auth_bp.route('/grades')
@login_required
def grades():
    """Affichage détaillé des notes"""
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user
    if not student.is_authenticated:
        return redirect(url_for('student_auth.login'))
    
    # Récupérer toutes les copies de l'élève dans les classes dérivées
    all_student_ids = [student.id]
    
    # Trouver les classes dérivées
    from models.class_collaboration import SharedClassroom
    shared_classrooms = SharedClassroom.query.filter_by(
        original_classroom_id=student.classroom_id
    ).all()
    
    for shared in shared_classrooms:
        derived_student = Student.query.filter_by(
            classroom_id=shared.derived_classroom_id,
            first_name=student.first_name,
            last_name=student.last_name,
            date_of_birth=student.date_of_birth
        ).first()
        if derived_student:
            all_student_ids.append(derived_student.id)
    
    # Récupérer toutes les notes avec plus de détails
    from models.evaluation import EvaluationGrade, Evaluation
    from models.classroom import Classroom
    grades = EvaluationGrade.query.join(Evaluation).join(Classroom).filter(
        EvaluationGrade.student_id.in_(all_student_ids),
        EvaluationGrade.points.isnot(None)
    ).order_by(Evaluation.date.desc()).all()
    
    # Organiser les notes par matière avec plus de détails
    grades_by_subject = {}
    for grade in grades:
        subject = grade.evaluation.classroom.subject
        if subject not in grades_by_subject:
            grades_by_subject[subject] = {
                'grades': [],
                'average': 0,
                'total_points': 0,
                'count': 0
            }
        
        grades_by_subject[subject]['grades'].append(grade)
        if grade.points is not None:
            grades_by_subject[subject]['total_points'] += grade.points
            grades_by_subject[subject]['count'] += 1
    
    # Calculer les moyennes
    for subject_data in grades_by_subject.values():
        if subject_data['count'] > 0:
            subject_data['average'] = subject_data['total_points'] / subject_data['count']
    
    return render_template('student/grades.html', 
                         student=student, 
                         grades_by_subject=grades_by_subject)

@student_auth_bp.route('/files')
def files():
    """Affichage des fichiers partagés par les enseignants"""
    if 'student_id' not in session or session.get('user_type') != 'student':
        return redirect(url_for('student_auth.login'))
    
    student = Student.query.get(session['student_id'])
    if not student:
        return redirect(url_for('student_auth.login'))
    
    # Récupérer tous les élèves liés (classe originale + classes dérivées)
    all_student_ids = [student.id]
    
    # Trouver les classes dérivées
    from models.class_collaboration import SharedClassroom
    shared_classrooms = SharedClassroom.query.filter_by(
        original_classroom_id=student.classroom_id
    ).all()
    
    for shared in shared_classrooms:
        derived_student = Student.query.filter_by(
            classroom_id=shared.derived_classroom_id,
            first_name=student.first_name,
            last_name=student.last_name,
            date_of_birth=student.date_of_birth
        ).first()
        if derived_student:
            all_student_ids.append(derived_student.id)
    
    # Récupérer seulement les fichiers spécifiquement partagés avec cet élève
    from models.file_sharing import StudentFileShare
    from models.class_file import ClassFile
    
    shared_files = db.session.query(StudentFileShare, ClassFile).join(
        ClassFile, StudentFileShare.file_id == ClassFile.id
    ).filter(
        StudentFileShare.student_id.in_(all_student_ids),
        StudentFileShare.is_active == True
    ).order_by(StudentFileShare.shared_at.desc()).all()
    
    # Marquer les fichiers comme vus
    for share, file in shared_files:
        share.mark_as_viewed()
    
    return render_template('student/files.html', student=student, shared_files=shared_files)

@student_auth_bp.route('/download/<int:file_id>')
def download_file(file_id):
    """Télécharger un fichier partagé avec l'élève"""
    if 'student_id' not in session or session.get('user_type') != 'student':
        return redirect(url_for('student_auth.login'))
    
    student = Student.query.get(session['student_id'])
    if not student:
        return redirect(url_for('student_auth.login'))
    
    try:
        from flask import send_file, current_app
        from models.file_sharing import StudentFileShare
        from models.class_file import ClassFile
        import os
        
        # Récupérer tous les élèves liés (classe originale + classes dérivées)
        all_student_ids = [student.id]
        
        # Trouver les classes dérivées
        from models.class_collaboration import SharedClassroom
        shared_classrooms = SharedClassroom.query.filter_by(
            original_classroom_id=student.classroom_id
        ).all()
        
        for shared in shared_classrooms:
            derived_student = Student.query.filter_by(
                classroom_id=shared.derived_classroom_id,
                first_name=student.first_name,
                last_name=student.last_name,
                date_of_birth=student.date_of_birth
            ).first()
            if derived_student:
                all_student_ids.append(derived_student.id)
        
        # Vérifier que le fichier est partagé avec cet élève
        file_share = db.session.query(StudentFileShare, ClassFile).join(
            ClassFile, StudentFileShare.file_id == ClassFile.id
        ).filter(
            StudentFileShare.file_id == file_id,
            StudentFileShare.student_id.in_(all_student_ids),
            StudentFileShare.is_active == True
        ).first()
        
        if not file_share:
            flash('Fichier introuvable ou non autorisé.', 'error')
            return redirect(url_for('student_auth.files'))
        
        share, class_file = file_share
        
        # Marquer comme vu
        share.mark_as_viewed()
        
        # Construire le chemin du fichier selon le type
        if class_file.is_student_shared:
            # Fichier partagé avec les élèves
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'student_shared', 
                                   str(class_file.classroom_id), class_file.filename)
        else:
            # Fichier normal de classe
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'class_files', 
                                   str(class_file.classroom_id), class_file.filename)
        
        if not os.path.exists(file_path):
            flash('Fichier physique introuvable.', 'error')
            return redirect(url_for('student_auth.files'))
        
        return send_file(
            file_path, 
            as_attachment=True,
            download_name=class_file.original_filename
        )
        
    except Exception as e:
        flash(f'Erreur lors du téléchargement: {str(e)}', 'error')
        return redirect(url_for('student_auth.files'))

@student_auth_bp.route('/preview/<int:file_id>')
def preview_file(file_id):
    """Prévisualiser un fichier partagé avec l'élève (affichage dans le navigateur)"""
    if 'student_id' not in session or session.get('user_type') != 'student':
        return redirect(url_for('student_auth.login'))
    
    student = Student.query.get(session['student_id'])
    if not student:
        return redirect(url_for('student_auth.login'))
    
    try:
        from flask import send_file, current_app
        from models.file_sharing import StudentFileShare
        from models.class_file import ClassFile
        import os
        
        # Récupérer tous les élèves liés (classe originale + classes dérivées)
        all_student_ids = [student.id]
        
        # Trouver les classes dérivées
        from models.class_collaboration import SharedClassroom
        shared_classrooms = SharedClassroom.query.filter_by(
            original_classroom_id=student.classroom_id
        ).all()
        
        for shared in shared_classrooms:
            derived_student = Student.query.filter_by(
                classroom_id=shared.derived_classroom_id,
                first_name=student.first_name,
                last_name=student.last_name,
                date_of_birth=student.date_of_birth
            ).first()
            if derived_student:
                all_student_ids.append(derived_student.id)
        
        # Vérifier que le fichier est partagé avec cet élève
        file_share = db.session.query(StudentFileShare, ClassFile).join(
            ClassFile, StudentFileShare.file_id == ClassFile.id
        ).filter(
            StudentFileShare.file_id == file_id,
            StudentFileShare.student_id.in_(all_student_ids),
            StudentFileShare.is_active == True
        ).first()
        
        if not file_share:
            flash('Fichier introuvable ou non autorisé.', 'error')
            return redirect(url_for('student_auth.files'))
        
        share, class_file = file_share
        
        # Marquer comme vu
        share.mark_as_viewed()
        
        # Construire le chemin du fichier selon le type
        if class_file.is_student_shared:
            # Fichier partagé avec les élèves
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'student_shared', 
                                   str(class_file.classroom_id), class_file.filename)
        else:
            # Fichier normal de classe
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'class_files', 
                                   str(class_file.classroom_id), class_file.filename)
        
        if not os.path.exists(file_path):
            flash('Fichier physique introuvable.', 'error')
            return redirect(url_for('student_auth.files'))
        
        # Déterminer le type MIME
        mimetype = 'application/octet-stream'
        if class_file.file_type == 'pdf':
            mimetype = 'application/pdf'
        elif class_file.file_type in ['png', 'jpg', 'jpeg']:
            mimetype = f'image/{class_file.file_type}'
        elif class_file.file_type in ['txt']:
            mimetype = 'text/plain'
        elif class_file.file_type in ['doc', 'docx']:
            mimetype = 'application/msword'
        
        # Envoyer le fichier pour affichage dans le navigateur (pas en téléchargement)
        return send_file(file_path, mimetype=mimetype)
        
    except Exception as e:
        flash(f'Erreur lors de la prévisualisation: {str(e)}', 'error')
        return redirect(url_for('student_auth.files'))

@student_auth_bp.route('/teachers')
def teachers():
    """Afficher la liste des enseignants de l'élève"""
    if 'student_id' not in session or session.get('user_type') != 'student':
        return redirect(url_for('student_auth.login'))
    
    student = Student.query.get(session['student_id'])
    if not student:
        return redirect(url_for('student_auth.login'))
    
    try:
        # Récupérer l'enseignant maître de classe
        main_teacher = student.classroom.teacher
        
        # Récupérer tous les enseignants spécialisés de cette classe
        from models.class_collaboration import SharedClassroom
        
        # Trouver les classes dérivées de la classe principale
        derived_classrooms = SharedClassroom.query.filter_by(
            original_classroom_id=student.classroom_id
        ).all()
        
        teachers_list = []
        
        # Ajouter le maître de classe
        if main_teacher:
            teachers_list.append({
                'name': main_teacher.username,
                'email': main_teacher.email,
                'subject': student.classroom.subject,
                'role': 'Maître de classe',
                'classroom_name': student.classroom.name
            })
        
        # Ajouter les enseignants spécialisés
        for derived_classroom in derived_classrooms:
            specialized_classroom = derived_classroom.derived_classroom
            if specialized_classroom and specialized_classroom.teacher:
                specialized_teacher = specialized_classroom.teacher
                teachers_list.append({
                    'name': specialized_teacher.username,
                    'email': specialized_teacher.email,
                    'subject': specialized_classroom.subject,
                    'role': 'Enseignant spécialisé',
                    'classroom_name': specialized_classroom.name
                })
        
        return render_template('student/teachers.html', student=student, teachers=teachers_list)
        
    except Exception as e:
        flash(f'Erreur lors du chargement des enseignants: {str(e)}', 'error')
        return redirect(url_for('student_auth.dashboard'))