from config import Config
from flask import Flask, redirect, url_for, flash
from flask_login import current_user
from extensions import db, login_manager, migrate
import logging
import stripe

def create_app(config_name='development'):
    """Factory pour créer l'application Flask"""
    app = Flask(__name__)
    
    # Configuration
    if config_name == 'production':
        from config_production import ProductionConfig
        app.config.from_object(ProductionConfig)
    else:
        app.config.from_object(Config)

    # Forcer le rechargement des templates en production pour éviter le cache
    app.config['TEMPLATES_AUTO_RELOAD'] = True
    app.jinja_env.auto_reload = True

    # Initialisation des extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Veuillez vous connecter pour accéder à cette page.'
    
    # Initialisation du moteur de chiffrement
    try:
        from utils.encryption import encryption_engine
        encryption_engine.init_app(app)
        if encryption_engine.is_enabled:
            print("✅ Chiffrement des données activé")
        else:
            print("⚠️  Chiffrement désactivé (ENCRYPTION_KEY non définie)")
    except ImportError:
        print("❌ Module de chiffrement non trouvé")

    # Enregistrer les filtres Jinja2
    try:
        from utils.jinja_filters import register_filters
        register_filters(app)
        print("✅ Filtres Jinja2 enregistrés")
    except ImportError:
        print("❌ Filtres Jinja2 non trouvés")
    
    # Import du modèle EmailVerification pour les migrations Alembic
    from models.email_verification import EmailVerification

    # Rendre csrf_token() disponible dans tous les templates Jinja2
    from flask_wtf.csrf import generate_csrf
    app.jinja_env.globals['csrf_token'] = generate_csrf

    # Enregistrement des blueprints
    from routes.auth import auth_bp
    from routes.planning import planning_bp
    from routes.schedule import schedule_bp
    from routes.setup import setup_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(planning_bp)
    app.register_blueprint(schedule_bp)
    app.register_blueprint(setup_bp)
    
    # Blueprints additionnels avec gestion d'erreur
    try:
        from routes.parent_auth import parent_auth_bp
        app.register_blueprint(parent_auth_bp)
    except ImportError:
        print("parent_auth blueprint non trouvé")

    try:
        from routes.student_auth import student_auth_bp  
        app.register_blueprint(student_auth_bp)
    except ImportError:
        print("student_auth blueprint non trouvé")

    try:
        from routes.collaboration import collaboration_bp
        app.register_blueprint(collaboration_bp)
    except ImportError:
        print("collaboration blueprint non trouvé")
        
    try:
        from routes.evaluations import evaluations_bp
        app.register_blueprint(evaluations_bp)
    except ImportError:
        print("evaluations blueprint non trouvé")
        
    try:
        from routes.attendance import attendance_bp
        app.register_blueprint(attendance_bp)
    except ImportError:
        print("attendance blueprint non trouvé")
        
    try:
        from routes.sanctions import sanctions_bp
        app.register_blueprint(sanctions_bp)
    except ImportError:
        print("sanctions blueprint non trouvé")
        
    try:
        from routes.settings import settings_bp
        app.register_blueprint(settings_bp)
    except ImportError:
        print("settings blueprint non trouvé")
        
    try:
        from routes.file_manager import file_manager_bp
        app.register_blueprint(file_manager_bp)
        print("✅ file_manager blueprint ajouté")
    except ImportError:
        print("❌ file_manager blueprint non trouvé")
        
    try:
        from routes.class_files import class_files_bp
        app.register_blueprint(class_files_bp)
        print("✅ class_files blueprint ajouté")
    except ImportError:
        print("❌ class_files blueprint non trouvé")
        
    # Blueprint temporaire pour migration schedule
    try:
        from migrate_schedule_fields import migrate_schedule_bp
        app.register_blueprint(migrate_schedule_bp)
        print("✅ migrate_schedule blueprint ajouté (temporaire)")
    except ImportError:
        print("❌ migrate_schedule blueprint non trouvé")

    # Blueprint push tokens
    try:
        from routes.push import push_bp
        app.register_blueprint(push_bp)
        print("✅ push blueprint ajouté")
    except ImportError:
        print("❌ push blueprint non trouvé")

    # Debug blueprint
    try:
        from routes.debug_constraint import debug_bp
        app.register_blueprint(debug_bp)
        print("✅ debug blueprint ajouté")
    except ImportError:
        print("❌ debug blueprint non trouvé")

    # Blueprint send to students
    try:
        from routes.send_to_students import send_to_students_bp
        app.register_blueprint(send_to_students_bp)
        print("✅ send_to_students blueprint ajouté")
    except ImportError:
        print("❌ send_to_students blueprint non trouvé")

    # Blueprint API mobile (JWT)
    try:
        from routes.api import api_bp
        app.register_blueprint(api_bp)
        print("✅ api blueprint ajouté")
    except ImportError:
        print("❌ api blueprint non trouvé")

    # Blueprint fin d'année scolaire
    try:
        from routes.year_end import year_end_bp
        app.register_blueprint(year_end_bp)
        print("✅ year_end blueprint ajouté")
    except ImportError:
        print("❌ year_end blueprint non trouvé")

    # Blueprint abonnements
    try:
        from routes.subscription import subscription_bp
        app.register_blueprint(subscription_bp)
        print("✅ subscription blueprint ajouté")
    except ImportError:
        print("❌ subscription blueprint non trouvé")

    # Blueprint exercices interactifs
    try:
        from routes.exercises import exercises_bp
        app.register_blueprint(exercises_bp)
        print("✅ exercises blueprint ajouté")
    except ImportError:
        print("❌ exercises blueprint non trouvé")

    # Blueprint administration
    try:
        from routes.admin import admin_bp
        app.register_blueprint(admin_bp)
        print("✅ admin blueprint ajouté")
    except ImportError:
        print("❌ admin blueprint non trouvé")

    # Commandes CLI pour les données de test
    try:
        from scripts.seed_test_data import register_seed_command
        register_seed_command(app)
        print("✅ Commandes seed-test-data enregistrées")
    except ImportError:
        print("❌ Commandes seed non trouvées")

    # Initialisation Stripe
    stripe.api_key = app.config.get('STRIPE_SECRET_KEY')

    # Migration: ajouter les colonnes si elles n'existent pas
    with app.app_context():
        try:
            # Colonnes TOTP
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(32)"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE"
            ))
            # Colonnes abonnement/premium
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'freemium'"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)"
            ))
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP"
            ))
            # Colonne préférence de tri des élèves
            db.session.execute(db.text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS student_sort_pref VARCHAR(20) DEFAULT 'last_name'"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Table subscriptions
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    stripe_subscription_id VARCHAR(255),
                    stripe_customer_id VARCHAR(255),
                    status VARCHAR(50) DEFAULT 'active',
                    billing_cycle VARCHAR(20),
                    price_id VARCHAR(255),
                    amount INTEGER,
                    currency VARCHAR(10) DEFAULT 'chf',
                    current_period_start TIMESTAMP,
                    current_period_end TIMESTAMP,
                    canceled_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Table vouchers
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS vouchers (
                    id SERIAL PRIMARY KEY,
                    code VARCHAR(50) UNIQUE NOT NULL,
                    voucher_type VARCHAR(50) NOT NULL,
                    duration_days INTEGER,
                    max_uses INTEGER,
                    current_uses INTEGER DEFAULT 0,
                    created_by_id INTEGER NOT NULL REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE
                )
            """))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Table d'association user_voucher_redemptions
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS user_voucher_redemptions (
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
                    redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, voucher_id)
                )
            """))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Tables exercices interactifs + RPG
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS exercises (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(200) NOT NULL,
                    description TEXT,
                    subject VARCHAR(100),
                    level VARCHAR(50),
                    accept_typos BOOLEAN DEFAULT FALSE,
                    is_published BOOLEAN DEFAULT FALSE,
                    is_draft BOOLEAN DEFAULT TRUE,
                    total_points INTEGER DEFAULT 0,
                    bonus_gold_threshold INTEGER DEFAULT 80,
                    badge_threshold INTEGER DEFAULT 100,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS exercise_blocks (
                    id SERIAL PRIMARY KEY,
                    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
                    block_type VARCHAR(30) NOT NULL,
                    position INTEGER DEFAULT 0,
                    title VARCHAR(200),
                    duration INTEGER,
                    config_json JSONB DEFAULT '{}',
                    points INTEGER DEFAULT 10,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS exercise_publications (
                    id SERIAL PRIMARY KEY,
                    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
                    classroom_id INTEGER NOT NULL REFERENCES classrooms(id),
                    planning_id INTEGER REFERENCES plannings(id),
                    published_by INTEGER NOT NULL REFERENCES users(id),
                    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS student_exercise_attempts (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL REFERENCES students(id),
                    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
                    publication_id INTEGER REFERENCES exercise_publications(id),
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    score INTEGER DEFAULT 0,
                    max_score INTEGER DEFAULT 0,
                    xp_earned INTEGER DEFAULT 0,
                    gold_earned INTEGER DEFAULT 0
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS student_block_answers (
                    id SERIAL PRIMARY KEY,
                    attempt_id INTEGER NOT NULL REFERENCES student_exercise_attempts(id) ON DELETE CASCADE,
                    block_id INTEGER NOT NULL REFERENCES exercise_blocks(id) ON DELETE CASCADE,
                    answer_json JSONB DEFAULT '{}',
                    is_correct BOOLEAN DEFAULT FALSE,
                    points_earned INTEGER DEFAULT 0,
                    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS student_rpg_profiles (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id),
                    avatar_class VARCHAR(20) DEFAULT 'guerrier',
                    avatar_accessories_json JSONB DEFAULT '{}',
                    xp_total INTEGER DEFAULT 0,
                    level INTEGER DEFAULT 1,
                    gold INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS badges (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    description VARCHAR(300),
                    icon VARCHAR(50) DEFAULT 'trophy',
                    color VARCHAR(7) DEFAULT '#FFD700',
                    category VARCHAR(50),
                    condition_type VARCHAR(50),
                    condition_value INTEGER DEFAULT 1,
                    condition_extra VARCHAR(100),
                    is_active BOOLEAN DEFAULT TRUE
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS student_badges (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL REFERENCES students(id),
                    badge_id INTEGER NOT NULL REFERENCES badges(id),
                    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(student_id, badge_id)
                )
            """))
            db.session.commit()
            print("✅ Tables exercices/RPG créées")
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Tables exercices/RPG: {e}")

        # Migrations colonnes exercices (v2: durée par question, typos, badge_threshold)
        try:
            db.session.execute(db.text("ALTER TABLE exercise_blocks ADD COLUMN IF NOT EXISTS duration INTEGER"))
            db.session.execute(db.text("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS accept_typos BOOLEAN DEFAULT FALSE"))
            db.session.execute(db.text("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS badge_threshold INTEGER DEFAULT 100"))
            db.session.execute(db.text("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS folder_id INTEGER"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Insérer les badges par défaut
        try:
            from models.rpg import Badge, DEFAULT_BADGES
            existing_count = db.session.execute(db.text("SELECT COUNT(*) FROM badges")).scalar()
            if existing_count == 0:
                for badge_data in DEFAULT_BADGES:
                    badge = Badge(**badge_data)
                    db.session.add(badge)
                db.session.commit()
                print(f"✅ {len(DEFAULT_BADGES)} badges par défaut insérés")
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Badges par défaut: {e}")

        # Créer les tables RPG items + insérer les objets par défaut
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS rpg_items (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    description VARCHAR(300),
                    icon VARCHAR(50) DEFAULT 'box',
                    color VARCHAR(7) DEFAULT '#6b7280',
                    category VARCHAR(50),
                    rarity VARCHAR(20) DEFAULT 'common',
                    is_active BOOLEAN DEFAULT TRUE
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS student_items (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL REFERENCES students(id),
                    item_id INTEGER NOT NULL REFERENCES rpg_items(id),
                    quantity INTEGER DEFAULT 1,
                    obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Tables RPG items: {e}")

        # Migration: ajouter colonnes stats, évolutions, compétences, équipement au profil RPG
        try:
            for col_name, col_type, col_default in [
                ('stat_force', 'INTEGER', '5'),
                ('stat_defense', 'INTEGER', '5'),
                ('stat_defense_magique', 'INTEGER', '5'),
                ('stat_vie', 'INTEGER', '5'),
                ('stat_intelligence', 'INTEGER', '5'),
                ('evolutions_json', 'JSONB', "'[]'"),
                ('active_skills_json', 'JSONB', "'[]'"),
                ('equipment_json', 'JSONB', "'{}'"),
            ]:
                try:
                    db.session.execute(db.text(
                        f"ALTER TABLE student_rpg_profiles ADD COLUMN IF NOT EXISTS {col_name} {col_type} DEFAULT {col_default}"
                    ))
                except Exception:
                    pass
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Migration stats RPG: {e}")

        # Migration: ajouter colonnes stat_bonus_json, special_ability, equip_slot, class_restriction aux rpg_items
        try:
            for col_name, col_type in [
                ('stat_bonus_json', 'JSONB'),
                ('special_ability', 'VARCHAR(200)'),
                ('equip_slot', 'VARCHAR(20)'),
                ('class_restriction', 'VARCHAR(50)'),
            ]:
                try:
                    db.session.execute(db.text(
                        f"ALTER TABLE rpg_items ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
                    ))
                except Exception:
                    pass
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Migration rpg_items: {e}")

        # Re-seed RPG items si les nouveaux champs sont vides (mise à jour avec stat_bonus)
        try:
            from models.rpg import RPGItem, DEFAULT_ITEMS
            existing_items = db.session.execute(db.text("SELECT COUNT(*) FROM rpg_items")).scalar()
            if existing_items == 0:
                for item_data in DEFAULT_ITEMS:
                    item = RPGItem(**item_data)
                    db.session.add(item)
                db.session.commit()
                print(f"✅ {len(DEFAULT_ITEMS)} objets RPG par défaut insérés")
            else:
                # Mettre à jour les items existants avec les nouveaux champs
                for item_data in DEFAULT_ITEMS:
                    existing = RPGItem.query.filter_by(name=item_data['name']).first()
                    if existing:
                        if 'stat_bonus_json' in item_data and not existing.stat_bonus_json:
                            existing.stat_bonus_json = item_data.get('stat_bonus_json')
                        if 'special_ability' in item_data and not existing.special_ability:
                            existing.special_ability = item_data.get('special_ability')
                        if 'equip_slot' in item_data and not existing.equip_slot:
                            existing.equip_slot = item_data.get('equip_slot')
                    else:
                        item = RPGItem(**item_data)
                        db.session.add(item)
                db.session.commit()
                print("✅ Objets RPG mis à jour avec bonus stats")
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Objets RPG par défaut: {e}")

        # Seed équipements de classe de base et évolutions
        try:
            from models.rpg import seed_class_equipment
            msg = seed_class_equipment(db.session)
            print(msg)
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Équipements de classe: {e}")

        # Table planning_resources (pour les ressources ajoutées aux planifications)
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS planning_resources (
                    id SERIAL PRIMARY KEY,
                    planning_id INTEGER NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
                    resource_type VARCHAR(20) NOT NULL,
                    resource_id INTEGER NOT NULL,
                    display_name VARCHAR(255) NOT NULL,
                    display_icon VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'linked',
                    mode VARCHAR(20),
                    publication_id INTEGER,
                    position INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Migration: ajouter mode et is_active sur exercise_publications + fix NULL published_by
        try:
            db.session.execute(db.text(
                "ALTER TABLE exercise_publications ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'classique'"
            ))
            db.session.execute(db.text(
                "ALTER TABLE exercise_publications ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE"
            ))
            # Fix NULL published_by : mettre le premier user trouvé
            db.session.execute(db.text(
                "UPDATE exercise_publications SET published_by = (SELECT id FROM users LIMIT 1) WHERE published_by IS NULL"
            ))
            # Rendre published_by nullable pour éviter les crashs futurs
            db.session.execute(db.text(
                "ALTER TABLE exercise_publications ALTER COLUMN published_by DROP NOT NULL"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Migration: changer la FK de student_file_shares de class_files vers class_files_v2
        try:
            # Vérifier si la contrainte pointe encore vers class_files (legacy)
            result = db.session.execute(db.text("""
                SELECT tc.constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name
                WHERE tc.table_name = 'student_file_shares'
                    AND tc.constraint_type = 'FOREIGN KEY'
                    AND ccu.table_name = 'class_files'
                    AND ccu.column_name = 'id'
            """))
            old_fk = result.fetchone()
            if old_fk:
                constraint_name = old_fk[0]
                db.session.execute(db.text(
                    f"ALTER TABLE student_file_shares DROP CONSTRAINT {constraint_name}"
                ))
                db.session.execute(db.text(
                    "ALTER TABLE student_file_shares ADD CONSTRAINT student_file_shares_file_id_fkey "
                    "FOREIGN KEY (file_id) REFERENCES class_files_v2(id)"
                ))
                db.session.commit()
                print("✅ Migration FK student_file_shares: class_files → class_files_v2")
            else:
                db.session.commit()
        except Exception:
            db.session.rollback()

    # Middleware : contrôle d'accès premium
    PREMIUM_ENDPOINTS = {
        'evaluations.', 'attendance.', 'sanctions.',
        'collaboration.', 'file_manager.', 'class_files.',
        'exercises.'
    }
    PREMIUM_EXACT = {'planning.manage_classes', 'planning.decoupage'}

    @app.before_request
    def check_premium_access():
        """Redirige les utilisateurs freemium vers la page pricing pour les routes premium"""
        from flask import request
        from models.user import User

        if not request.endpoint:
            return

        # Vérifier si c'est un endpoint premium
        is_premium_route = request.endpoint in PREMIUM_EXACT
        if not is_premium_route:
            for prefix in PREMIUM_ENDPOINTS:
                if request.endpoint.startswith(prefix):
                    is_premium_route = True
                    break

        if not is_premium_route:
            return

        # Vérifier l'authentification et le type d'utilisateur
        if not current_user.is_authenticated:
            return

        if not isinstance(current_user, User):
            return

        # Vérifier l'accès premium
        if not current_user.has_premium_access():
            flash('Cette fonctionnalité nécessite un abonnement Premium.', 'warning')
            return redirect(url_for('subscription.pricing'))

    @app.route('/')
    def index():
        return redirect(url_for('auth.login'))

    return app

# Création de l'instance par défaut
app = create_app()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
