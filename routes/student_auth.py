from flask import Blueprint, render_template, redirect, url_for, flash, request, session, jsonify
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
import logging
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, Length, ValidationError

logger = logging.getLogger(__name__)

student_auth_bp = Blueprint('student_auth', __name__, url_prefix='/student')

def _check_student_email_verified_session():
    """Vérifie email_verified pour les routes basées sur session['student_id'].
    Retourne un redirect si l'email n'est pas vérifié, sinon None."""
    student_id = session.get('student_id')
    if not student_id:
        return None
    student = Student.query.get(student_id)
    if student and not student.email_verified:
        try:
            verification = EmailVerification.create_verification(student.email, 'student')
            db.session.commit()
            send_verification_code(student.email, verification.code, 'student')
        except Exception:
            pass
        session.pop('student_id', None)
        session.pop('user_type', None)
        session['pending_user_id'] = student.id
        session['pending_user_type'] = 'student'
        session['verification_email'] = student.email
        flash('Veuillez vérifier votre adresse email avant de continuer.', 'info')
        return redirect(url_for('student_auth.verify_email_code'))
    return None


@student_auth_bp.before_request
def check_student_email_verified():
    """Vérifier que l'email est vérifié pour toutes les routes protégées."""
    # Routes qui ne nécessitent pas de vérification d'email
    public_routes = [
        'student_auth.login', 'student_auth.register',
        'student_auth.verify_code', 'student_auth.verify_email_code',
        'student_auth.resend_code', 'student_auth.logout'
    ]
    if request.endpoint in public_routes:
        return None

    # Vérification pour les utilisateurs connectés via Flask-Login
    if current_user.is_authenticated and isinstance(current_user, Student):
        if not current_user.email_verified:
            # Envoyer un nouveau code et rediriger vers la vérification
            try:
                verification = EmailVerification.create_verification(current_user.email, 'student')
                db.session.commit()
                send_verification_code(current_user.email, verification.code, 'student')
            except Exception:
                pass
            session['pending_user_id'] = current_user.id
            session['pending_user_type'] = 'student'
            session['verification_email'] = current_user.email
            logout_user()
            session.pop('user_type', None)
            flash('Veuillez vérifier votre adresse email avant de continuer.', 'info')
            return redirect(url_for('student_auth.verify_email_code'))

    # Vérification pour les routes basées sur session['student_id']
    redirect_response = _check_student_email_verified_session()
    if redirect_response:
        return redirect_response

    return None

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
        email_input = form.email.data.strip().lower()
        student = Student.query.filter_by(email_hash=encryption_engine.hash_email(email_input)).first()

        # Fallback : recherche par email en clair si le hash ne correspond pas
        if not student:
            all_students = Student.query.filter(Student.password_hash.isnot(None)).all()
            for s in all_students:
                if s.email and s.email.strip().lower() == email_input:
                    student = s
                    # Mettre à jour le hash pour les prochaines connexions
                    try:
                        student.email_hash = encryption_engine.hash_email(email_input)
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                    break

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

                # Vérifier si l'email est vérifié avant de connecter
                if not student.email_verified:
                    verification = EmailVerification.create_verification(student.email, 'student')
                    db.session.commit()
                    send_verification_code(student.email, verification.code, 'student')
                    session['pending_user_id'] = student.id
                    session['pending_user_type'] = 'student'
                    session['verification_email'] = student.email
                    flash('Code d\'accès validé ! Veuillez maintenant vérifier votre email.', 'info')
                    return redirect(url_for('student_auth.verify_email_code'))

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

    # Double vérification : email vérifié (sécurité supplémentaire)
    if not student.email_verified:
        try:
            verification = EmailVerification.create_verification(student.email, 'student')
            db.session.commit()
            send_verification_code(student.email, verification.code, 'student')
        except Exception:
            pass
        session['pending_user_id'] = student.id
        session['pending_user_type'] = 'student'
        session['verification_email'] = student.email
        logout_user()
        session.pop('user_type', None)
        flash('Veuillez vérifier votre adresse email avant de continuer.', 'info')
        return redirect(url_for('student_auth.verify_email_code'))
    
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

    if not student.email_verified:
        return redirect(url_for('student_auth.verify_email_code'))
    
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
@login_required
def files():
    """Affichage des fichiers partagés par les enseignants"""
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user

    if not student.email_verified:
        return redirect(url_for('student_auth.verify_email_code'))
    
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
@login_required
def download_file(file_id):
    """Télécharger un fichier partagé avec l'élève"""
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user

    if not student.email_verified:
        return redirect(url_for('student_auth.verify_email_code'))
    
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

        if not class_file.user_file:
            flash('Fichier source introuvable.', 'error')
            return redirect(url_for('student_auth.files'))

        user_file = class_file.user_file

        # Essayer d'abord le BLOB
        if user_file.file_content:
            from flask import Response
            mimetype = user_file.mime_type or 'application/octet-stream'
            return Response(
                user_file.file_content,
                mimetype=mimetype,
                headers={
                    'Content-Disposition': f'attachment; filename="{user_file.original_filename}"'
                }
            )

        # Sinon, fichier physique
        file_path = os.path.join(current_app.root_path, user_file.get_file_path())

        if not os.path.exists(file_path):
            flash('Fichier physique introuvable.', 'error')
            return redirect(url_for('student_auth.files'))

        return send_file(
            file_path,
            as_attachment=True,
            download_name=user_file.original_filename
        )

    except Exception as e:
        flash(f'Erreur lors du téléchargement: {str(e)}', 'error')
        return redirect(url_for('student_auth.files'))

@student_auth_bp.route('/preview/<int:file_id>')
@login_required
def preview_file(file_id):
    """Prévisualiser un fichier partagé avec l'élève (affichage dans le navigateur)"""
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user

    if not student.email_verified:
        return redirect(url_for('student_auth.verify_email_code'))

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

        if not class_file.user_file:
            flash('Fichier source introuvable.', 'error')
            return redirect(url_for('student_auth.files'))

        user_file = class_file.user_file
        mimetype = user_file.mime_type or 'application/octet-stream'

        # Essayer d'abord le BLOB
        if user_file.file_content:
            from flask import Response
            return Response(
                user_file.file_content,
                mimetype=mimetype,
                headers={
                    'Content-Disposition': f'inline; filename="{user_file.original_filename}"'
                }
            )

        # Sinon, fichier physique
        file_path = os.path.join(current_app.root_path, user_file.get_file_path())

        if not os.path.exists(file_path):
            flash('Fichier physique introuvable.', 'error')
            return redirect(url_for('student_auth.files'))

        # Envoyer le fichier pour affichage dans le navigateur (pas en téléchargement)
        return send_file(file_path, mimetype=mimetype)
        
    except Exception as e:
        flash(f'Erreur lors de la prévisualisation: {str(e)}', 'error')
        return redirect(url_for('student_auth.files'))

@student_auth_bp.route('/teachers')
@login_required
def teachers():
    """Afficher la liste des enseignants de l'élève"""
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user

    if not student.email_verified:
        return redirect(url_for('student_auth.verify_email_code'))
    
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


# ============================================================
# MISSIONS (Exercices interactifs)
# ============================================================

@student_auth_bp.route('/missions')
@login_required
def missions():
    """Page 'Mes missions' — liste des exercices publiés pour l'élève"""
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user
    from models.exercise_progress import ExercisePublication, StudentExerciseAttempt
    from models.exercise import Exercise

    # Récupérer les publications pour la classe de l'élève
    publications = ExercisePublication.query.filter_by(
        classroom_id=student.classroom_id
    ).order_by(ExercisePublication.published_at.desc()).all()

    # Enrichir avec les tentatives de l'élève
    missions_data = []
    now = datetime.utcnow()
    for pub in publications:
        exercise = pub.exercise
        if not exercise:
            continue

        attempt = StudentExerciseAttempt.query.filter_by(
            student_id=student.id,
            exercise_id=exercise.id
        ).filter(StudentExerciseAttempt.completed_at.isnot(None)).order_by(
            StudentExerciseAttempt.completed_at.desc()
        ).first()

        # Cooldown 24h : calculer temps restant si déjà complété
        cooldown_remaining = None
        on_cooldown = False
        if attempt and attempt.completed_at:
            elapsed = (now - attempt.completed_at).total_seconds()
            cooldown_secs = 24 * 3600  # 24 heures
            if elapsed < cooldown_secs:
                cooldown_remaining = int(cooldown_secs - elapsed)
                on_cooldown = True

        missions_data.append({
            'exercise': exercise,
            'publication': pub,
            'attempt': attempt,
            'status': 'completed' if (attempt and attempt.is_completed) else ('in_progress' if attempt else 'todo'),
            'on_cooldown': on_cooldown,
            'cooldown_remaining': cooldown_remaining,
        })

    # RPG profile
    from models.rpg import StudentRPGProfile
    rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()

    return render_template('student/missions.html',
                           student=student,
                           missions=missions_data,
                           rpg=rpg)


@student_auth_bp.route('/missions/<int:exercise_id>')
@login_required
def solve_exercise(exercise_id):
    """Résoudre un exercice"""
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user
    from models.exercise import Exercise
    from models.exercise_progress import ExercisePublication, StudentExerciseAttempt
    from models.rpg import StudentRPGProfile

    # Vérifier que l'élève a choisi un personnage
    rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()
    if not rpg or not rpg.avatar_class:
        flash('Tu dois d\'abord choisir ton personnage avant de lancer une mission !', 'warning')
        return redirect(url_for('student_auth.rpg_dashboard'))

    exercise = Exercise.query.get_or_404(exercise_id)

    # Vérifier que l'exercice est publié pour la classe de l'élève
    pub = ExercisePublication.query.filter_by(
        exercise_id=exercise_id,
        classroom_id=student.classroom_id
    ).first()
    if not pub:
        flash('Exercice non disponible.', 'error')
        return redirect(url_for('student_auth.missions'))

    # Vérifier si déjà complété
    existing_attempt = StudentExerciseAttempt.query.filter_by(
        student_id=student.id,
        exercise_id=exercise_id,
    ).filter(StudentExerciseAttempt.completed_at.isnot(None)).order_by(
        StudentExerciseAttempt.completed_at.desc()
    ).first()

    # Cooldown 24h
    if existing_attempt and existing_attempt.completed_at:
        elapsed = (datetime.utcnow() - existing_attempt.completed_at).total_seconds()
        if elapsed < 24 * 3600:
            remaining = int(24 * 3600 - elapsed)
            hours = remaining // 3600
            minutes = (remaining % 3600) // 60
            flash(f'Tu dois attendre encore {hours}h{minutes:02d} avant de refaire cette mission !', 'warning')
            return redirect(url_for('student_auth.missions'))

    return render_template('student/exercise_solve.html',
                           student=student,
                           exercise=exercise,
                           rpg=rpg,
                           already_completed=existing_attempt is not None,
                           previous_attempt=existing_attempt)


@student_auth_bp.route('/missions/<int:exercise_id>/check-block', methods=['POST'])
@login_required
def check_block_answer(exercise_id):
    """Vérifier la réponse d'un seul bloc (feedback immédiat)"""
    if not isinstance(current_user, Student):
        return jsonify({'success': False, 'message': 'Non autorisé'}), 403

    from models.exercise import Exercise, ExerciseBlock

    exercise = Exercise.query.get_or_404(exercise_id)
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Données manquantes'}), 400

    block_id = data.get('block_id')
    answer = data.get('answer', {})

    block = ExerciseBlock.query.get(block_id)
    if not block or block.exercise_id != exercise.id:
        return jsonify({'success': False, 'message': 'Bloc non trouvé'}), 404

    accept_typos = exercise.accept_typos if hasattr(exercise, 'accept_typos') else False
    is_correct, points_earned = grade_block(block, answer, accept_typos=accept_typos)

    correct_answer_text = get_correct_answer_text(block) if not is_correct else None

    return jsonify({
        'success': True,
        'is_correct': is_correct,
        'points_earned': points_earned,
        'max_points': block.points or 0,
        'correct_answer': correct_answer_text,
    })


@student_auth_bp.route('/missions/<int:exercise_id>/submit', methods=['POST'])
@login_required
def submit_exercise(exercise_id):
    """Soumettre les réponses d'un exercice"""
    if not isinstance(current_user, Student):
        return jsonify({'success': False, 'message': 'Non autorisé'}), 403

    student = current_user
    from models.exercise import Exercise, ExerciseBlock
    from models.exercise_progress import ExercisePublication, StudentExerciseAttempt, StudentBlockAnswer
    from models.rpg import StudentRPGProfile, Badge, StudentBadge

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Données manquantes'}), 400

    exercise = Exercise.query.get_or_404(exercise_id)

    # Vérifier publication
    pub = ExercisePublication.query.filter_by(
        exercise_id=exercise_id,
        classroom_id=student.classroom_id
    ).first()
    if not pub:
        return jsonify({'success': False, 'message': 'Exercice non disponible'}), 403

    try:
        # Créer la tentative
        attempt = StudentExerciseAttempt(
            student_id=student.id,
            exercise_id=exercise_id,
            publication_id=pub.id,
            started_at=datetime.utcnow(),
        )
        db.session.add(attempt)
        db.session.flush()

        base_score = 0
        total_max = 0
        combo_bonus_xp = 0
        raw_answers = data.get('answers', {})
        # Support both dict format (web) and list format (mobile)
        if isinstance(raw_answers, list):
            answers_data = {}
            for item in raw_answers:
                bid = str(item.get('block_id', ''))
                answers_data[bid] = item.get('answer', {})
        else:
            answers_data = raw_answers
        accept_typos = exercise.accept_typos if hasattr(exercise, 'accept_typos') else False

        logger.info(f"[SUBMIT] Exercise {exercise_id}: answers_keys={list(answers_data.keys())}, blocks={[b.id for b in exercise.blocks]}")

        # Corriger chaque bloc et calculer le combo côté serveur
        combo_streak = 0
        block_results = []
        for block in exercise.blocks:
            block_answer = answers_data.get(str(block.id), {})
            is_correct, points = grade_block(block, block_answer, accept_typos=accept_typos)

            logger.info(f"[SUBMIT] Block {block.id} ({block.block_type}): correct={is_correct}, base_pts={points}/{block.points}, answer_keys={list(block_answer.keys()) if isinstance(block_answer, dict) else 'N/A'}")

            # Calculer le multiplicateur combo côté serveur
            if is_correct and points == (block.points or 0):
                # Réponse 100% correcte -> incrémenter le streak
                combo_streak += 1
            else:
                # Réponse incorrecte ou partielle -> reset
                combo_streak = 0

            mult = min(combo_streak, 3)  # 1=x1, 2=x2, 3+=x3
            if mult < 1:
                mult = 1
            boosted_points = points * mult
            combo_bonus_xp += (boosted_points - points)

            logger.info(f"[SUBMIT] Block {block.id}: streak={combo_streak}, mult=x{mult}, boosted={boosted_points}")

            base_score += points
            total_max += block.points
            block_results.append({
                'block_id': block.id,
                'is_correct': is_correct,
                'base_points': points,
                'multiplier': mult,
                'boosted_points': boosted_points,
            })

            answer = StudentBlockAnswer(
                attempt_id=attempt.id,
                block_id=block.id,
                answer_json=block_answer,
                is_correct=is_correct,
                points_earned=boosted_points,
            )
            db.session.add(answer)

        # Score de base pour le pourcentage (sans combo)
        attempt.score = base_score
        attempt.max_score = total_max
        attempt.completed_at = datetime.utcnow()
        attempt.calculate_rewards(exercise)

        # Ajouter le bonus combo aux XP gagnés
        attempt.xp_earned = (attempt.xp_earned or 0) + combo_bonus_xp
        logger.info(f"[SUBMIT] Final: base_score={base_score}/{total_max}, combo_bonus_xp={combo_bonus_xp}, total_xp={attempt.xp_earned}")

        # Mettre à jour le profil RPG
        rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()
        if not rpg:
            rpg = StudentRPGProfile(student_id=student.id)
            db.session.add(rpg)
            db.session.flush()

        rpg.add_xp(attempt.xp_earned)
        rpg.add_gold(attempt.gold_earned)

        # Vérifier les badges
        check_badges(student, rpg)

        # Attribuer un objet RPG aléatoire
        from models.rpg import award_random_item
        item_won = award_random_item(student.id, attempt.score_percentage or 0)

        db.session.commit()

        total_with_combo = base_score + combo_bonus_xp
        result = {
            'success': True,
            'score': base_score,
            'max_score': total_max,
            'percentage': attempt.score_percentage,
            'xp_earned': attempt.xp_earned,
            'gold_earned': attempt.gold_earned,
            'combo_bonus_xp': combo_bonus_xp,
            'total_with_combo': total_with_combo,
            'new_level': rpg.level,
            'results': block_results,
        }
        if item_won:
            result['item_won'] = item_won.to_dict()

        return jsonify(result)

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@student_auth_bp.route('/rpg')
@login_required
def rpg_dashboard():
    """Dashboard RPG de l'élève"""
    if not isinstance(current_user, Student):
        return redirect(url_for('student_auth.login'))

    student = current_user
    from models.rpg import StudentRPGProfile, Badge, StudentBadge, StudentItem

    rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()
    if not rpg:
        rpg = StudentRPGProfile(student_id=student.id)
        db.session.add(rpg)
        db.session.commit()

    # Tous les badges (earned + locked)
    all_badges = Badge.query.filter_by(is_active=True).all()
    earned_badge_ids = {sb.badge_id for sb in StudentBadge.query.filter_by(student_id=student.id)}

    badges_data = []
    for badge in all_badges:
        badges_data.append({
            'badge': badge,
            'earned': badge.id in earned_badge_ids,
        })

    # Inventaire d'objets
    inventory = StudentItem.query.filter_by(student_id=student.id).all()

    # Parser les JSON pour éviter les crashs si stockés en TEXT
    import json as _json
    def _safe_dict(val):
        if isinstance(val, dict):
            return val
        if isinstance(val, str):
            try:
                parsed = _json.loads(val)
                if isinstance(parsed, dict):
                    return parsed
            except (ValueError, TypeError):
                pass
        return {}

    def _safe_list(val):
        if isinstance(val, list):
            return val
        if isinstance(val, str):
            try:
                parsed = _json.loads(val)
                if isinstance(parsed, list):
                    return parsed
            except (ValueError, TypeError):
                pass
        return []

    equipment_dict = _safe_dict(rpg.equipment_json)
    evolutions_list = _safe_list(rpg.evolutions_json)
    active_skills_list = _safe_list(rpg.active_skills_json)

    # Parser stat_bonus_json pour chaque item de l'inventaire
    for si in inventory:
        if si.item and si.item.stat_bonus_json and isinstance(si.item.stat_bonus_json, str):
            try:
                si.item.stat_bonus_json = _json.loads(si.item.stat_bonus_json)
            except (ValueError, TypeError):
                si.item.stat_bonus_json = {}

    # Construire l'arbre d'évolution
    evolution_tree = None
    if rpg.avatar_class:
        from models.rpg import CLASS_EVOLUTIONS, CLASS_DESCRIPTIONS
        avatar_class = rpg.avatar_class
        evolution_data = CLASS_EVOLUTIONS.get(avatar_class, {})
        class_desc = CLASS_DESCRIPTIONS.get(avatar_class, {})

        chosen_evolutions = evolutions_list or []
        chosen_evolution_ids = {e.get('evolution_id') for e in chosen_evolutions if isinstance(e, dict)}
        chosen_levels = {e.get('level') for e in chosen_evolutions if isinstance(e, dict)}

        evolution_tree = {
            'base_class': {
                'id': avatar_class,
                'name': class_desc.get('name', avatar_class),
                'subtitle': class_desc.get('subtitle', ''),
                'description': class_desc.get('description', ''),
                'strengths': class_desc.get('strengths', []),
                'weaknesses': class_desc.get('weaknesses', []),
                'playstyle': class_desc.get('playstyle', ''),
            },
            'evolution_levels': []
        }

        for level in sorted(evolution_data.keys()):
            choices = evolution_data[level]
            level_group = {
                'level': level,
                'is_unlocked': rpg.level >= level,
                'is_chosen': level in chosen_levels,
                'evolutions': []
            }

            for choice in choices:
                evo_id = choice.get('id')
                is_chosen = evo_id in chosen_evolution_ids
                level_group['evolutions'].append({
                    'id': evo_id,
                    'name': choice.get('name', evo_id),
                    'description': choice.get('description', ''),
                    'stat_bonus': choice.get('stat_bonus', {}),
                    'is_chosen': is_chosen,
                    'is_available': (rpg.level >= level) and (level not in chosen_levels),
                })

            evolution_tree['evolution_levels'].append(level_group)

    return render_template('student/rpg_dashboard.html',
                           student=student,
                           rpg=rpg,
                           badges=badges_data,
                           inventory=inventory,
                           equipment_dict=equipment_dict,
                           evolutions_list=evolutions_list,
                           active_skills_list=active_skills_list,
                           evolution_tree=evolution_tree)


@student_auth_bp.route('/rpg/avatar', methods=['POST'])
@login_required
def update_avatar():
    """Choisir ou modifier l'avatar"""
    if not isinstance(current_user, Student):
        return jsonify({'success': False}), 403

    data = request.get_json()
    from models.rpg import StudentRPGProfile

    rpg = StudentRPGProfile.query.filter_by(student_id=current_user.id).first()
    if not rpg:
        rpg = StudentRPGProfile(student_id=current_user.id)
        db.session.add(rpg)

    if data.get('avatar_class'):
        new_class = data['avatar_class']
        if new_class in ('mage', 'guerrier', 'archer', 'guerisseur'):
            # Si changement de classe → reset complet (sauf première sélection)
            if rpg.avatar_class and rpg.avatar_class != new_class:
                if not data.get('confirm_reset'):
                    return jsonify({
                        'success': False,
                        'needs_confirmation': True,
                        'message': 'Changer de classe réinitialisera ton niveau, équipement et or.',
                    })
                rpg.reset_for_class_change()
            rpg.avatar_class = new_class
            rpg.recalculate_stats()

    if data.get('accessories'):
        rpg.avatar_accessories_json = data['accessories']

    db.session.commit()
    return jsonify({'success': True, 'profile': rpg.to_dict()})


# ============================================================
# FUZZY MATCHING (tolérance fautes d'orthographe)
# ============================================================

def levenshtein_distance(s1, s2):
    """Calculer la distance de Levenshtein entre deux chaînes"""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row
    return prev_row[-1]


def fuzzy_match(user_answer, correct_answer, threshold=0.75):
    """Vérifier si user_answer est suffisamment proche de correct_answer.
    threshold: ratio de similarité minimum (0.75 = 75% de similarité)"""
    if not user_answer or not correct_answer:
        return False
    s1 = user_answer.strip().lower()
    s2 = correct_answer.strip().lower()
    if s1 == s2:
        return True
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return True
    distance = levenshtein_distance(s1, s2)
    similarity = 1 - (distance / max_len)
    return similarity >= threshold


# ============================================================
# GRADING HELPERS
# ============================================================

def get_correct_answer_text(block):
    """Extraire un texte lisible de la bonne réponse d'un bloc."""
    c = block.config_json
    try:
        if block.block_type == 'qcm':
            correct = [opt.get('text', '') for opt in c.get('options', []) if opt.get('is_correct')]
            return ', '.join(correct) if correct else None
        elif block.block_type == 'short_answer':
            return str(c.get('correct_answer', ''))
        elif block.block_type == 'fill_blank':
            blanks = c.get('blanks', [])
            return ', '.join(b.get('word', '') for b in blanks)
        elif block.block_type == 'sorting':
            if c.get('mode') == 'order':
                items = c.get('items', [])
                order = c.get('correct_order', [])
                return ' → '.join(items[i] for i in order if i < len(items))
            else:
                cats = c.get('categories', [])
                parts = []
                items = c.get('items', [])
                for cat in cats:
                    name = cat.get('name', '')
                    cat_items = [items[i] for i in cat.get('items', []) if i < len(items)]
                    parts.append(f"{name}: {', '.join(cat_items)}")
                return ' | '.join(parts)
        elif block.block_type == 'graph':
            correct = c.get('correct_answer', {})
            qt = c.get('question_type', 'draw_line')
            if qt == 'draw_line':
                a = correct.get('a', 0)
                b = correct.get('b', 0)
                return f"y = {a}x + {b}" if b >= 0 else f"y = {a}x - {abs(b)}"
            elif qt == 'draw_quadratic':
                a = correct.get('a', 0)
                b = correct.get('b', 0)
                cc = correct.get('c', 0)
                return f"y = {a}x² + {b}x + {cc}"
        elif block.block_type == 'matching':
            pairs = c.get('pairs', [])
            return ' | '.join(f"{p.get('left', '')} ↔ {p.get('right', '')}" for p in pairs) if pairs else None
        elif block.block_type == 'image_position':
            if c.get('interaction_type') == 'labels':
                labels = c.get('labels', [])
                return ', '.join(lbl.get('text', '') for lbl in labels) if labels else None
            zones = c.get('zones', [])
            return ', '.join(z.get('label', '') for z in zones) if zones else None
    except Exception:
        pass
    return None


def grade_block(block, answer, accept_typos=False):
    """Corriger un bloc et retourner (is_correct, points_earned)"""
    c = block.config_json
    points = block.points or 0

    if block.block_type == 'qcm':
        return grade_qcm(c, answer, points)
    elif block.block_type == 'short_answer':
        return grade_short_answer(c, answer, points, accept_typos)
    elif block.block_type == 'fill_blank':
        return grade_fill_blank(c, answer, points, accept_typos)
    elif block.block_type == 'sorting':
        return grade_sorting(c, answer, points)
    elif block.block_type == 'matching':
        return grade_matching(c, answer, points)
    elif block.block_type == 'image_position':
        # Check for labels mode
        if c.get('interaction_type') == 'labels':
            return grade_image_labels(c, answer, points, accept_typos)
        return grade_image_position(c, answer, points)
    elif block.block_type == 'graph':
        return grade_graph(c, answer, points)

    return False, 0


def grade_qcm(config, answer, max_points):
    selected = answer.get('selected', [])
    if not isinstance(selected, list):
        selected = [selected]

    correct_indices = [i for i, opt in enumerate(config.get('options', [])) if opt.get('is_correct')]
    selected_indices = [int(s) for s in selected if str(s).isdigit()]

    is_correct = set(correct_indices) == set(selected_indices)
    return is_correct, max_points if is_correct else 0


def grade_short_answer(config, answer, max_points, accept_typos=False):
    user_answer = _normalize_text(answer.get('value', ''))
    correct = _normalize_text(config.get('correct_answer', ''))

    if config.get('answer_type') == 'number':
        try:
            user_val = float(user_answer.replace(',', '.'))
            correct_val = float(correct.replace(',', '.'))
            tolerance = float(config.get('tolerance', 0))
            is_correct = abs(user_val - correct_val) <= tolerance
        except (ValueError, TypeError):
            is_correct = False
    else:
        is_correct = user_answer == correct
        if not is_correct and accept_typos:
            is_correct = fuzzy_match(user_answer, correct)
        if not is_correct:
            synonyms = [_normalize_text(s) for s in config.get('synonyms', [])]
            if accept_typos:
                is_correct = any(fuzzy_match(user_answer, s) for s in synonyms)
            else:
                is_correct = user_answer in synonyms

    logger.info(f"[GRADE] short_answer: given='{user_answer}', expected='{correct}', is_correct={is_correct}")
    return is_correct, max_points if is_correct else 0


def _normalize_text(text):
    """Normalise le texte pour la comparaison : apostrophes, tirets, espaces, accents cohérents."""
    import unicodedata
    if not isinstance(text, str):
        text = str(text)
    text = text.strip().lower()
    # Normaliser les apostrophes typographiques → apostrophe standard
    text = text.replace('\u2019', "'")  # RIGHT SINGLE QUOTATION MARK
    text = text.replace('\u2018', "'")  # LEFT SINGLE QUOTATION MARK
    text = text.replace('\u02BC', "'")  # MODIFIER LETTER APOSTROPHE
    text = text.replace('\u2032', "'")  # PRIME
    text = text.replace('\u00B4', "'")  # ACUTE ACCENT
    text = text.replace('\u0060', "'")  # GRAVE ACCENT
    # Normaliser les tirets
    text = text.replace('\u2013', '-')  # EN DASH
    text = text.replace('\u2014', '-')  # EM DASH
    # Normaliser les espaces multiples
    text = ' '.join(text.split())
    return text


def _strip_accents(text):
    """Retire les accents d'un texte pour comparaison plus souple."""
    import unicodedata
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def grade_fill_blank(config, answer, max_points, accept_typos=False):
    blanks = config.get('blanks', [])
    user_answers = answer.get('blanks', [])

    logger.info(f"[GRADE] fill_blank: config blanks={blanks}, user_answers={user_answers}")

    if not blanks:
        return True, max_points

    correct_count = 0
    for i, blank in enumerate(blanks):
        expected = _normalize_text(blank.get('word', ''))
        given = ''
        if i < len(user_answers):
            given = _normalize_text(user_answers[i])

        is_match = False
        if given == expected:
            is_match = True
            logger.info(f"[GRADE] fill_blank blank #{i} EXACT MATCH: expected='{expected}', given='{given}'")
        elif _strip_accents(given) == _strip_accents(expected):
            # Accept answers without accents (common on mobile keyboards)
            is_match = True
            logger.info(f"[GRADE] fill_blank blank #{i} ACCENT-STRIPPED MATCH: expected='{expected}', given='{given}'")
        elif accept_typos and fuzzy_match(given, expected):
            is_match = True
            logger.info(f"[GRADE] fill_blank blank #{i} FUZZY MATCH: expected='{expected}', given='{given}'")

        if is_match:
            correct_count += 1
        else:
            logger.warning(f"[GRADE] fill_blank blank #{i} INCORRECT: expected='{expected}', given='{given}', expected_stripped='{_strip_accents(expected)}', given_stripped='{_strip_accents(given)}'")

    ratio = correct_count / len(blanks) if blanks else 0
    points = round(ratio * max_points)
    logger.info(f"[GRADE] fill_blank result: {correct_count}/{len(blanks)} correct, ratio={ratio}, points={points}")
    return ratio == 1.0, points


def grade_sorting(config, answer, max_points):
    if config.get('mode') == 'order':
        user_order = answer.get('order', [])
        correct_order = config.get('correct_order', [])
        user_order = [int(x) for x in user_order if str(x).isdigit()]
        is_correct = user_order == correct_order
        logger.info(f"[GRADE] sorting (order mode) user_order={user_order}, correct_order={correct_order}, is_correct={is_correct}")
        return is_correct, max_points if is_correct else 0
    else:
        # Categories
        user_cats = answer.get('categories', {})
        categories = config.get('categories', [])
        correct_count = 0
        total = 0
        for ci, cat in enumerate(categories):
            expected = set(cat.get('items', []))
            given = set(int(x) for x in user_cats.get(str(ci), []) if str(x).isdigit())
            total += len(expected)
            correct_count += len(expected & given)
            logger.info(f"[GRADE] sorting (categories) category #{ci}: expected items={expected}, given items={given}, match count={len(expected & given)}")

        ratio = correct_count / total if total else 0
        logger.info(f"[GRADE] sorting (categories) result: {correct_count}/{total} correct, ratio={ratio}")
        return ratio == 1.0, round(ratio * max_points)


def grade_image_position(config, answer, max_points):
    """Corriger image interactive: chaque zone a un label et plusieurs points valides.
    L'élève doit cliquer dans le rayon d'au moins un des points de chaque zone."""
    zones = config.get('zones', [])
    clicks = answer.get('clicks', [])

    if not zones:
        return True, max_points

    # Default radius: use config value, minimum 40px
    # Enforce a minimum to be forgiving for touch-based interactions on mobile
    config_radius = config.get('default_radius', 50)
    default_radius = max(config_radius, 40)

    logger.info(f"[GRADE] image_position: config_radius={config_radius}, default_radius={default_radius}, zones_count={len(zones)}, clicks_count={len(clicks)}")
    logger.info(f"[GRADE] image_position: full config zones={zones}")
    logger.info(f"[GRADE] image_position: full clicks={clicks}")

    correct_count = 0

    for i, zone in enumerate(zones):
        zone_radius = max(zone.get('radius', default_radius), 40)  # Minimum 40px for mobile touch
        zone_points = zone.get('points', [])

        # Rétro-compatibilité: ancien format avec x/y directement sur la zone
        if not zone_points and 'x' in zone:
            zone_points = [{'x': zone['x'], 'y': zone['y']}]

        logger.info(f"[GRADE] image_position zone #{i}: radius={zone_radius}, valid_points={zone_points}")

        if i < len(clicks):
            cx = clicks[i].get('x', 0)
            cy = clicks[i].get('y', 0)
            logger.info(f"[GRADE] image_position zone #{i}: user_click=({cx}, {cy})")
            # Vérifier si le clic est dans le rayon d'au moins un des points de la zone
            for pt in zone_points:
                distance = ((cx - pt.get('x', 0)) ** 2 + (cy - pt.get('y', 0)) ** 2) ** 0.5
                logger.info(f"[GRADE] image_position zone #{i}: testing point={pt}, distance={distance:.2f}")
                if distance <= zone_radius:
                    correct_count += 1
                    logger.info(f"[GRADE] image_position zone #{i}: CORRECT (distance {distance:.2f} <= radius {zone_radius})")
                    break
            else:
                logger.warning(f"[GRADE] image_position zone #{i}: INCORRECT (all distances > radius {zone_radius})")
        else:
            logger.warning(f"[GRADE] image_position zone #{i}: NO CLICK provided")

    ratio = correct_count / len(zones) if zones else 0
    logger.info(f"[GRADE] image_position result: {correct_count}/{len(zones)} correct, ratio={ratio}")
    return ratio == 1.0, round(ratio * max_points)


def _grade_line_from_points(points, correct, tolerance):
    """Grade a line (y=ax+b) from 2 user-placed points."""
    if len(points) < 2:
        logger.warning(f"[GRADE] graph (line): insufficient points ({len(points)} < 2)")
        return False
    x1, y1 = float(points[0]['x']), float(points[0]['y'])
    x2, y2 = float(points[1]['x']), float(points[1]['y'])
    if abs(x2 - x1) < 0.001:
        logger.warning(f"[GRADE] graph (line): vertical line not valid")
        return False
    user_a = (y2 - y1) / (x2 - x1)
    user_b = y1 - user_a * x1
    expected_a = float(correct.get('a', 0))
    expected_b = float(correct.get('b', 0))
    a_ok = abs(user_a - expected_a) <= tolerance
    b_ok = abs(user_b - expected_b) <= tolerance
    logger.info(f"[GRADE] graph (line): points=({x1},{y1}),({x2},{y2}) => user_a={user_a:.4f} (expected {expected_a}, ok={a_ok}), user_b={user_b:.4f} (expected {expected_b}, ok={b_ok})")
    return a_ok and b_ok


def grade_matching(config, answer, max_points):
    """Corriger les associations : chaque paire correcte rapporte des points proportionnels."""
    pairs = config.get('pairs', [])
    associations = answer.get('associations', {})

    if not pairs:
        return True, max_points

    logger.info(f"[GRADE] matching: pairs={pairs}, associations={associations}")

    correct_count = 0
    for left_idx_str, right_idx in associations.items():
        left_idx = int(left_idx_str)
        # A correct association means left_idx maps to the same index right_idx
        # (pairs[i].left should be matched with pairs[i].right, so correct is left_idx == right_idx)
        if left_idx == right_idx:
            correct_count += 1
            logger.info(f"[GRADE] matching pair {left_idx} -> {right_idx}: CORRECT")
        else:
            logger.warning(f"[GRADE] matching pair {left_idx} -> {right_idx}: INCORRECT (expected {left_idx})")

    ratio = correct_count / len(pairs) if pairs else 0
    points = round(ratio * max_points)
    logger.info(f"[GRADE] matching result: {correct_count}/{len(pairs)} correct, ratio={ratio}, points={points}")
    return ratio == 1.0, points


def grade_image_labels(config, answer, max_points, accept_typos=False):
    """Corriger les labels sur image : comparer chaque label saisi à la réponse attendue."""
    labels = config.get('labels', [])
    user_labels = answer.get('labels', {})

    if not labels:
        return True, max_points

    logger.info(f"[GRADE] image_labels: config labels={labels}, user_labels={user_labels}")

    correct_count = 0
    for i, label in enumerate(labels):
        expected = _normalize_text(label.get('text', ''))
        given = _normalize_text(user_labels.get(str(i), ''))

        is_match = False
        if given == expected:
            is_match = True
            logger.info(f"[GRADE] image_labels label #{i} EXACT MATCH: expected='{expected}', given='{given}'")
        elif _strip_accents(given) == _strip_accents(expected):
            is_match = True
            logger.info(f"[GRADE] image_labels label #{i} ACCENT-STRIPPED MATCH")
        elif accept_typos and fuzzy_match(given, expected):
            is_match = True
            logger.info(f"[GRADE] image_labels label #{i} FUZZY MATCH")

        if is_match:
            correct_count += 1
        else:
            logger.warning(f"[GRADE] image_labels label #{i} INCORRECT: expected='{expected}', given='{given}'")

    ratio = correct_count / len(labels) if labels else 0
    points = round(ratio * max_points)
    logger.info(f"[GRADE] image_labels result: {correct_count}/{len(labels)} correct, ratio={ratio}, points={points}")
    return ratio == 1.0, points


def grade_graph(config, answer, max_points):
    """Corriger le graphique: l'élève envoie les points qu'il a placés.
    On reconstitue la fonction à partir de ces points et on compare les coefficients."""
    raw_tolerance = config.get('tolerance', 0.5)
    # Tolerance de 0 est trop stricte pour des coordonnées, on met un minimum de 0.5
    tolerance = max(float(raw_tolerance), 0.5)
    correct = config.get('correct_answer', {})
    question_type = config.get('question_type', 'draw_line')

    logger.info(f"[GRADE] graph: question_type={question_type}, raw_tolerance={raw_tolerance}, effective_tolerance={tolerance}, expected={correct}, user_answer={answer}")

    try:
        if question_type in ('draw_line', 'place_point'):
            # draw_line et place_point: l'élève envoie 2 points, on calcule a et b
            points = answer.get('points', [])
            is_correct = _grade_line_from_points(points, correct, tolerance)

        elif question_type == 'draw_quadratic':
            # L'élève envoie 3 points, on calcule a, b, c de y = ax² + bx + c
            points = answer.get('points', [])
            if len(points) < 3:
                logger.warning(f"[GRADE] graph (draw_quadratic): insufficient points ({len(points)} < 3)")
                return False, 0
            x1, y1 = float(points[0]['x']), float(points[0]['y'])
            x2, y2 = float(points[1]['x']), float(points[1]['y'])
            x3, y3 = float(points[2]['x']), float(points[2]['y'])

            det = (x1**2*(x2 - x3) - x2**2*(x1 - x3) + x3**2*(x1 - x2))
            if abs(det) < 0.001:
                logger.warning(f"[GRADE] graph (draw_quadratic): colinear or identical points")
                return False, 0
            user_a = (y1*(x2 - x3) - y2*(x1 - x3) + y3*(x1 - x2)) / det
            user_b = (x1**2*(y2 - y3) - x2**2*(y1 - y3) + x3**2*(y1 - y2)) / det
            user_c = (x1**2*(x2*y3 - x3*y2) - x2**2*(x1*y3 - x3*y1) + x3**2*(x1*y2 - x2*y1)) / det

            expected_a = float(correct.get('a', 0))
            expected_b = float(correct.get('b', 0))
            expected_c = float(correct.get('c', 0))
            a_ok = abs(user_a - expected_a) <= tolerance
            b_ok = abs(user_b - expected_b) <= tolerance
            c_ok = abs(user_c - expected_c) <= tolerance
            logger.info(f"[GRADE] graph (draw_quadratic): user_a={user_a:.4f} (expected {expected_a}, ok={a_ok}), user_b={user_b:.4f} (expected {expected_b}, ok={b_ok}), user_c={user_c:.4f} (expected {expected_c}, ok={c_ok})")
            is_correct = a_ok and b_ok and c_ok

        elif question_type == 'find_expression':
            coeffs = answer.get('coefficients', {})
            find_type = config.get('find_type', 'linear')
            user_a = float(coeffs.get('a', 0))
            user_b = float(coeffs.get('b', 0))
            expected_a = float(correct.get('a', 0))
            expected_b = float(correct.get('b', 0))
            a_ok = abs(user_a - expected_a) <= tolerance
            b_ok = abs(user_b - expected_b) <= tolerance
            if find_type == 'quadratic':
                user_c = float(coeffs.get('c', 0))
                expected_c = float(correct.get('c', 0))
                c_ok = abs(user_c - expected_c) <= tolerance
                logger.info(f"[GRADE] graph (find_expression quadratic): user=[a={user_a:.4f}, b={user_b:.4f}, c={user_c:.4f}], expected=[a={expected_a:.4f}, b={expected_b:.4f}, c={expected_c:.4f}]")
                is_correct = a_ok and b_ok and c_ok
            else:
                logger.info(f"[GRADE] graph (find_expression linear): user=[a={user_a:.4f}, b={user_b:.4f}], expected=[a={expected_a:.4f}, b={expected_b:.4f}]")
                is_correct = a_ok and b_ok
        else:
            logger.error(f"[GRADE] graph: unknown question_type '{question_type}'")
            is_correct = False
    except (ValueError, TypeError, ZeroDivisionError) as e:
        logger.error(f"[GRADE] graph: exception {type(e).__name__}: {e}")
        is_correct = False

    logger.info(f"[GRADE] graph result: is_correct={is_correct}, points={max_points if is_correct else 0}")
    return is_correct, max_points if is_correct else 0


def check_badges(student, rpg):
    """Vérifier et attribuer les badges gagnés"""
    from models.rpg import Badge, StudentBadge
    from models.exercise_progress import StudentExerciseAttempt

    all_badges = Badge.query.filter_by(is_active=True).all()
    earned = {sb.badge_id for sb in StudentBadge.query.filter_by(student_id=student.id)}

    completed_attempts = StudentExerciseAttempt.query.filter_by(
        student_id=student.id
    ).filter(StudentExerciseAttempt.completed_at.isnot(None)).all()

    exercises_completed = len(completed_attempts)
    # Count perfect or above-threshold scores
    perfect_scores = 0
    for a in completed_attempts:
        if a.max_score > 0 and a.score == a.max_score:
            perfect_scores += 1
        elif a.max_score > 0 and a.exercise:
            threshold = getattr(a.exercise, 'badge_threshold', 100) or 100
            if a.score_percentage >= threshold and threshold < 100:
                perfect_scores += 1

    # Count block types completed correctly
    from models.exercise_progress import StudentBlockAnswer
    block_type_counts = {}
    for attempt in completed_attempts:
        for ans in attempt.answers:
            if ans.is_correct and ans.block:
                bt = ans.block.block_type
                block_type_counts[bt] = block_type_counts.get(bt, 0) + 1

    for badge in all_badges:
        if badge.id in earned:
            continue

        should_earn = False
        if badge.condition_type == 'exercises_completed':
            should_earn = exercises_completed >= badge.condition_value
        elif badge.condition_type == 'perfect_scores':
            should_earn = perfect_scores >= badge.condition_value
        elif badge.condition_type == 'block_type_completed':
            bt = badge.condition_extra
            should_earn = block_type_counts.get(bt, 0) >= badge.condition_value

        if should_earn:
            sb = StudentBadge(student_id=student.id, badge_id=badge.id)
            db.session.add(sb)