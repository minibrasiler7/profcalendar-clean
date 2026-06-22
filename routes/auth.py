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
from wtforms.validators import DataRequired, Email, EqualTo, Length, ValidationError, Regexp
from datetime import datetime, timedelta
# i18n : _ traduit immédiatement (flash, à l'exécution d'une requête) ;
# _l est "paresseux" (libellés de formulaires définis au niveau du module,
# évalués au rendu — sinon ils figeraient la langue du démarrage du serveur).
from flask_babel import gettext as _, lazy_gettext as _l

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

class LoginForm(FlaskForm):
    email = StringField(_l('Email'), validators=[DataRequired(), Email()])
    password = PasswordField(_l('Mot de passe'), validators=[DataRequired()])
    submit = SubmitField(_l('Se connecter'))

class RegisterForm(FlaskForm):
    username = StringField(_l("Nom d'utilisateur"), validators=[
        DataRequired(),
        Length(min=3, max=80, message=_l("Le nom d'utilisateur doit contenir entre 3 et 80 caractères"))
    ])
    email = StringField(_l('Email'), validators=[DataRequired(), Email()])
    password = PasswordField(_l('Mot de passe'), validators=[
        DataRequired(),
        Length(min=8, message=_l("Le mot de passe doit contenir au moins 8 caractères")),
        Regexp(r'(?=.*[A-Z])(?=.*[0-9])', message=_l("Le mot de passe doit contenir au moins une majuscule et un chiffre"))
    ])
    password_confirm = PasswordField(_l('Confirmer le mot de passe'), validators=[
        DataRequired(),
        EqualTo('password', message=_l('Les mots de passe doivent correspondre'))
    ])
    submit = SubmitField(_l("S'inscrire"))

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError(_("Ce nom d'utilisateur est déjà pris."))

    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user:
            raise ValidationError(_('Cette adresse email est déjà enregistrée.'))

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
        # Protection brute force : max 5 tentatives par 15 minutes
        login_attempts = session.get('login_attempts', 0)
        lockout_until = session.get('login_lockout')
        if lockout_until:
            from datetime import datetime
            if datetime.utcnow().timestamp() < lockout_until:
                remaining = int(lockout_until - datetime.utcnow().timestamp()) // 60 + 1
                flash(_('Trop de tentatives. Réessayez dans %(min)d minute(s).', min=remaining), 'error')
                return render_template('auth/login.html', form=form)
            else:
                session.pop('login_lockout', None)
                session['login_attempts'] = 0
                login_attempts = 0

        # Vérifier d'abord si c'est un email de parent
        from models.parent import Parent
        from utils.encryption import encryption_engine
        parent_check = Parent.query.filter_by(email_hash=encryption_engine.hash_email(form.email.data)).first()
        if parent_check:
            flash(_('Cet email appartient à un compte parent. Veuillez utiliser la connexion parent.'), 'error')
            return render_template('auth/login.html', form=form)

        # Ensuite vérifier l'enseignant
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.check_password(form.password.data):
            # Reset des tentatives en cas de succès
            session.pop('login_attempts', None)
            session.pop('login_lockout', None)
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
                    flash(_('Veuillez vérifier votre adresse email. Un nouveau code vous a été envoyé.'), 'info')
                else:
                    flash(_("Impossible d'envoyer le code de vérification. Veuillez réessayer ou contacter le support."), 'error')
                return redirect(url_for('auth.verify_email'))

            # Vérifier si la 2FA est activée
            if user.totp_enabled:
                session['pending_totp_user_id'] = user.id
                session['pending_totp_next'] = request.args.get('next', '')
                return redirect(url_for('auth.verify_totp'))

            session.clear()  # Nettoyer la session pour éviter les conflits
            session['user_type'] = 'teacher'  # Marquer comme enseignant dans la session
            login_user(user, remember=True)
            next_page = request.args.get('next')
            if not next_page or urlparse(next_page).netloc != '':
                # Déterminer où rediriger en fonction de l'état de configuration.
                # Les nouveaux comptes ont setup_completed/schedule_completed=True
                # (apply_smart_defaults) → ils vont droit au tableau de bord.
                # On ne garde le guidage pas-à-pas que pour d'éventuels comptes
                # "legacy" restés en cours de configuration. On ne force PLUS la
                # création d'une classe avant d'entrer (c'était un mur) : le
                # dashboard affiche un appel à l'action pour créer la 1re classe.
                if not user.setup_completed:
                    if not user.school_year_start or not user.day_start_time:
                        next_page = url_for('setup.initial_setup')
                    else:
                        next_page = url_for('setup.manage_classrooms')
                elif not user.schedule_completed:
                    next_page = url_for('schedule.weekly_schedule')
                else:
                    next_page = url_for('planning.dashboard')
            return redirect(next_page)
        else:
            # Incrémenter les tentatives échouées
            session['login_attempts'] = session.get('login_attempts', 0) + 1
            if session['login_attempts'] >= 5:
                from datetime import datetime
                session['login_lockout'] = datetime.utcnow().timestamp() + 900  # 15 minutes
                flash(_('Trop de tentatives. Compte verrouillé pour 15 minutes.'), 'error')
            else:
                remaining = 5 - session['login_attempts']
                flash(_('Email ou mot de passe incorrect. %(n)d tentative(s) restante(s).', n=remaining), 'error')

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
        # Onboarding sans friction : on pré-remplit la config avec des défauts
        # romands (horaire 8h-16h, périodes 45 min, année scolaire en cours…)
        # et on marque le setup comme fait. Le prof arrive DIRECTEMENT dans
        # l'app au lieu de buter sur l'assistant de configuration qui faisait
        # fuir 100% des inscrits. Tout reste éditable ensuite dans les réglages.
        user.apply_smart_defaults()
        db.session.add(user)
        db.session.commit()

        # Essai gratuit : 30 jours de Premium offerts à l'inscription — ou 60
        # si le prof vient d'un lien de parrainage. On relie alors le filleul au
        # parrain ; le parrain est récompensé (+30 j) à la vérification email du
        # filleul (voir verify_email), pas avant, pour éviter les faux comptes.
        ref_code = session.pop('ref_code', None)
        referrer = User.query.filter_by(referral_code=ref_code).first() if ref_code else None
        if referrer and referrer.id != user.id:
            user.referred_by_id = referrer.id
            user.grant_premium_access(days=60)
        else:
            user.grant_premium_access(days=30)

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
            flash(_('Un code de vérification a été envoyé à votre adresse email.'), 'info')
        else:
            flash(_("Compte créé, mais impossible d'envoyer le code de vérification. Veuillez réessayer."), 'error')
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

            # Email de bienvenue / onboarding (non bloquant : send_email gère ses
            # propres erreurs, et on isole tout échec pour ne jamais casser
            # l'inscription). Complète les relances d'essai (services/trial_reminders).
            try:
                from services.onboarding_emails import send_welcome_email
                send_welcome_email(user.email, user.username)
            except Exception:
                pass

            # Parrainage : récompenser le parrain (+30 j de Premium) maintenant
            # que le filleul a confirmé son email. Une seule fois (verify-success
            # ne se produit qu'une fois par compte).
            if user.referred_by_id:
                try:
                    referrer = User.query.get(user.referred_by_id)
                    if referrer:
                        referrer.add_premium_days(30)
                except Exception:
                    pass

            flash(_('Bienvenue sur ProfCalendar ! 🎉 Tu profites de 30 jours de Premium offerts — toutes les fonctionnalités débloquées.'),
                  'success')
            # On entre DIRECTEMENT dans l'app : la config est déjà pré-remplie
            # (apply_smart_defaults à l'inscription) et l'essai Premium 30 j est
            # déjà actif. Le choix d'abonnement est proposé plus tard, une fois
            # le prof actif — avant, l'écran de plan ici faisait fuir tout le
            # monde alors qu'ils avaient déjà 30 j gratuits.
            return redirect(url_for('planning.dashboard'))
        else:
            flash(_('Code invalide ou expiré.'), 'error')

    return render_template('auth/verify_email.html', email=user.email)

@auth_bp.route('/resend-code', methods=['POST'])
def resend_code():
    """Renvoyer un code de vérification (rate limit: 1/min via session)"""
    user_id = session.get('pending_user_id')
    if not user_id or session.get('pending_user_type') != 'teacher':
        return redirect(url_for('auth.register'))

    user = User.query.get(user_id)
    if not user:
        return redirect(url_for('auth.register'))

    # Rate limit fiable via session (immunisé aux race conditions DB)
    last_sent = session.get('last_code_sent_at')
    if last_sent:
        elapsed = (datetime.utcnow() - datetime.fromisoformat(last_sent)).total_seconds()
        if elapsed < 60:
            flash(_('Veuillez attendre %(sec)d secondes avant de renvoyer un code.', sec=int(60 - elapsed)), 'error')
            return redirect(url_for('auth.verify_email'))

    verification = EmailVerification.create_verification(user.email, 'teacher')
    db.session.commit()

    session['last_code_sent_at'] = datetime.utcnow().isoformat()

    email_sent = send_verification_code(user.email, verification.code, 'teacher')
    if email_sent:
        flash(_('Un nouveau code a été envoyé.'), 'success')
    else:
        flash(_("Impossible d'envoyer le code. Veuillez réessayer."), 'error')
    return redirect(url_for('auth.verify_email'))

@auth_bp.route('/verify-totp', methods=['GET', 'POST'])
def verify_totp():
    """Vérification du code TOTP pour la double authentification"""
    user_id = session.get('pending_totp_user_id')
    if not user_id:
        return redirect(url_for('auth.login'))

    user = User.query.get(user_id)
    if not user or not user.totp_enabled:
        session.pop('pending_totp_user_id', None)
        return redirect(url_for('auth.login'))

    if request.method == 'POST':
        code = request.form.get('totp_code', '').strip()

        import pyotp
        totp = pyotp.TOTP(user.totp_secret)
        # valid_window=1 accepte le code précédent et suivant (±30s)
        if totp.verify(code, valid_window=1):
            # Nettoyer la session TOTP
            next_page = session.get('pending_totp_next', '')
            session.pop('pending_totp_user_id', None)
            session.pop('pending_totp_next', None)

            # Connecter l'utilisateur
            session['user_type'] = 'teacher'
            login_user(user, remember=True)

            if not next_page or urlparse(next_page).netloc != '':
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
            flash(_('Code invalide. Veuillez réessayer.'), 'error')

    return render_template('auth/verify_totp.html', email=user.email)


@auth_bp.route('/logout')
@login_required
def logout():
    session.pop('user_type', None)  # Retirer le type d'utilisateur de la session
    logout_user()
    flash(_('Vous avez été déconnecté avec succès.'), 'info')
    return redirect(url_for('auth.login'))
