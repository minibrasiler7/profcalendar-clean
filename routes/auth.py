import os
from flask import Blueprint, render_template, redirect, url_for, flash, request, session
from flask_login import login_user, logout_user, login_required, current_user
from urllib.parse import urlparse
from extensions import db
from models.user import User
from models.email_verification import EmailVerification
from services.email_service import send_verification_code
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, Length, ValidationError
from datetime import datetime, timedelta

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Mot de passe', validators=[DataRequired()])
    submit = SubmitField('Se connecter')

class RegisterForm(FlaskForm):
    username = StringField('Nom d\'utilisateur', validators=[
        DataRequired(),
        Length(min=3, max=80, message="Le nom d'utilisateur doit contenir entre 3 et 80 caractères")
    ])
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Mot de passe', validators=[
        DataRequired(),
        Length(min=6, message="Le mot de passe doit contenir au moins 6 caractères")
    ])
    password_confirm = PasswordField('Confirmer le mot de passe', validators=[
        DataRequired(),
        EqualTo('password', message='Les mots de passe doivent correspondre')
    ])
    submit = SubmitField('S\'inscrire')

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError('Ce nom d\'utilisateur est déjà pris.')

    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user:
            raise ValidationError('Cette adresse email est déjà enregistrée.')

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    # Si un parent est connecté, le déconnecter
    if current_user.is_authenticated:
        from models.parent import Parent
        if isinstance(current_user, Parent):
            logout_user()
            session.clear()
        else:
            return redirect(url_for('planning.dashboard'))

    form = LoginForm()
    if form.validate_on_submit():
        # Vérifier d'abord si c'est un email de parent
        from models.parent import Parent
        from utils.encryption import encryption_engine
        parent_check = Parent.query.filter_by(email_hash=encryption_engine.hash_email(form.email.data)).first()
        if parent_check:
            flash('Cet email appartient à un compte parent. Veuillez utiliser la connexion parent.', 'error')
            return render_template('auth/login.html', form=form)
        
        # Ensuite vérifier l'enseignant
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.check_password(form.password.data):
            # Bypass vérification email en mode dev (variable d'environnement)
            skip_verification = os.environ.get('SKIP_EMAIL_VERIFICATION', '').lower() == 'true'
            if skip_verification and not user.email_verified:
                user.email_verified = True
                db.session.commit()

            # Vérifier si l'email est vérifié
            if not user.email_verified:
                # Renvoyer un code et rediriger vers la vérification
                verification = EmailVerification.create_verification(user.email, 'teacher')
                db.session.commit()
                email_sent = send_verification_code(user.email, verification.code, 'teacher')

                session['pending_user_id'] = user.id
                session['pending_user_type'] = 'teacher'
                session['verification_email'] = user.email
                if email_sent:
                    flash('Veuillez vérifier votre adresse email. Un nouveau code vous a été envoyé.', 'info')
                else:
                    flash('Impossible d\'envoyer le code de vérification. Veuillez réessayer ou contacter le support.', 'error')
                return redirect(url_for('auth.verify_email'))

            session.clear()  # Nettoyer la session pour éviter les conflits
            session['user_type'] = 'teacher'  # Marquer comme enseignant dans la session
            login_user(user, remember=True)
            next_page = request.args.get('next')
            if not next_page or urlparse(next_page).netloc != '':
                # Déterminer où rediriger en fonction de l'état de configuration
                if not user.school_year_start or not user.day_start_time:
                    next_page = url_for('setup.initial_setup')
                elif user.classrooms.count() == 0:
                    next_page = url_for('setup.manage_classrooms')
                elif not user.setup_completed:
                    next_page = url_for('setup.manage_holidays')
                elif not user.schedule_completed:
                    next_page = url_for('schedule.weekly_schedule')
                else:
                    next_page = url_for('planning.dashboard')
            return redirect(next_page)
        else:
            flash('Email ou mot de passe incorrect.', 'error')

    return render_template('auth/login.html', form=form)

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('planning.dashboard'))

    form = RegisterForm()
    if form.validate_on_submit():
        user = User(
            username=form.username.data,
            email=form.email.data
        )
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()

        # Créer automatiquement un code d'accès par défaut pour les enseignants spécialisés
        from models.class_collaboration import TeacherAccessCode
        default_access_code = TeacherAccessCode(
            master_teacher_id=user.id,
            code=TeacherAccessCode.generate_code(6),
            max_uses=None,
            expires_at=None
        )
        db.session.add(default_access_code)

        # Générer et envoyer le code de vérification email
        verification = EmailVerification.create_verification(user.email, 'teacher')
        db.session.commit()

        email_sent = send_verification_code(user.email, verification.code, 'teacher')

        # Stocker l'ID utilisateur en session pour la vérification
        session['pending_user_id'] = user.id
        session['pending_user_type'] = 'teacher'
        session['verification_email'] = user.email

        if email_sent:
            flash('Un code de vérification a été envoyé à votre adresse email.', 'info')
        else:
            flash('Compte créé, mais impossible d\'envoyer le code de vérification. Veuillez réessayer.', 'error')
        return redirect(url_for('auth.verify_email'))
    else:
        if form.errors:
            for field, errors in form.errors.items():
                for error in errors:
                    flash(f'{field}: {error}', 'error')

    return render_template('auth/register.html', form=form)

@auth_bp.route('/verify-email', methods=['GET', 'POST'])
def verify_email():
    """Vérification du code email pour les enseignants"""
    user_id = session.get('pending_user_id')
    if not user_id or session.get('pending_user_type') != 'teacher':
        return redirect(url_for('auth.register'))

    user = User.query.get(user_id)
    if not user:
        session.pop('pending_user_id', None)
        return redirect(url_for('auth.register'))

    if request.method == 'POST':
        code = request.form.get('code', '').strip()

        verification = EmailVerification.query.filter_by(
            email=user.email,
            code=code,
            user_type='teacher',
            is_used=False
        ).first()

        if verification and verification.is_valid():
            verification.is_used = True
            user.email_verified = True
            db.session.commit()

            # Connecter l'utilisateur
            session['user_type'] = 'teacher'
            login_user(user, remember=True)
            # Nettoyer la session de vérification
            session.pop('pending_user_id', None)
            session.pop('pending_user_type', None)
            session.pop('verification_email', None)

            flash('Email vérifié avec succès ! Bienvenue sur ProfCalendar.', 'success')
            return redirect(url_for('setup.initial_setup'))
        else:
            flash('Code invalide ou expiré.', 'error')

    return render_template('auth/verify_email.html', email=user.email)

@auth_bp.route('/resend-code', methods=['POST'])
def resend_code():
    """Renvoyer un code de vérification (rate limit: 1/min)"""
    user_id = session.get('pending_user_id')
    if not user_id or session.get('pending_user_type') != 'teacher':
        return redirect(url_for('auth.register'))

    user = User.query.get(user_id)
    if not user:
        return redirect(url_for('auth.register'))

    # Rate limit: vérifier le dernier envoi
    last_verification = EmailVerification.query.filter_by(
        email=user.email,
        user_type='teacher'
    ).order_by(EmailVerification.created_at.desc()).first()

    if last_verification and (datetime.utcnow() - last_verification.created_at) < timedelta(minutes=1):
        flash('Veuillez attendre 1 minute avant de renvoyer un code.', 'error')
        return redirect(url_for('auth.verify_email'))

    verification = EmailVerification.create_verification(user.email, 'teacher')
    db.session.commit()

    email_sent = send_verification_code(user.email, verification.code, 'teacher')
    if email_sent:
        flash('Un nouveau code a été envoyé.', 'success')
    else:
        flash('Impossible d\'envoyer le code. Veuillez réessayer.', 'error')
    return redirect(url_for('auth.verify_email'))

@auth_bp.route('/logout')
@login_required
def logout():
    session.pop('user_type', None)  # Retirer le type d'utilisateur de la session
    logout_user()
    flash('Vous avez été déconnecté avec succès.', 'info')
    return redirect(url_for('auth.login'))
