"""
API REST JSON + JWT pour l'application mobile React Native (Expo).
Blueprint : /api/v1/
"""

from flask import Blueprint, request, jsonify, current_app, send_file
from extensions import db
from functools import wraps
from datetime import datetime, timedelta
import jwt
import os

api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

# ─────────────────────────── helpers JWT ───────────────────────────

def generate_token(user_type, user_id, expires_hours=720):
    """Génère un JWT pour un élève ou un parent (30 jours par défaut)."""
    payload = {
        'user_type': user_type,
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(hours=expires_hours),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')


def decode_token(token):
    """Décode et valide un JWT. Retourne le payload ou None."""
    try:
        return jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def jwt_required(user_type=None):
    """Décorateur : exige un JWT valide. user_type = 'student' | 'parent' | None (les deux)."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return jsonify({'error': 'Token manquant'}), 401
            token = auth_header.split(' ', 1)[1]
            payload = decode_token(token)
            if payload is None:
                return jsonify({'error': 'Token invalide ou expiré'}), 401
            if user_type and payload.get('user_type') != user_type:
                return jsonify({'error': 'Accès non autorisé'}), 403
            request.jwt_payload = payload
            return f(*args, **kwargs)
        return wrapper
    return decorator


def _get_current_student():
    """Retourne l'objet Student à partir du JWT."""
    from models.student import Student
    return Student.query.get(request.jwt_payload['user_id'])


def _get_current_parent():
    """Retourne l'objet Parent à partir du JWT."""
    from models.parent import Parent
    return Parent.query.get(request.jwt_payload['user_id'])


def _get_all_student_ids(student):
    """Retourne tous les IDs liés à un élève (original + classes dérivées)."""
    from models.class_collaboration import SharedClassroom
    all_ids = [student.id]
    shared = SharedClassroom.query.filter_by(
        original_classroom_id=student.classroom_id
    ).all()
    for sc in shared:
        from models.student import Student
        derived = Student.query.filter_by(
            classroom_id=sc.derived_classroom_id,
            first_name=student.first_name,
            last_name=student.last_name,
            date_of_birth=student.date_of_birth
        ).first()
        if derived:
            all_ids.append(derived.id)
    return all_ids


# ═══════════════════════════════════════════════════════════════════
#                       AUTH — STUDENT
# ═══════════════════════════════════════════════════════════════════

@api_bp.route('/auth/student/login', methods=['POST'])
def student_login():
    """Connexion élève → JWT."""
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400

    from utils.encryption import encryption_engine
    from models.student import Student
    from werkzeug.security import check_password_hash

    student = Student.query.filter_by(email_hash=encryption_engine.hash_email(email)).first()

    # Fallback : recherche par email en clair si le hash ne correspond pas
    if not student:
        all_students = Student.query.filter(Student.password_hash.isnot(None)).all()
        for s in all_students:
            if s.email and s.email.strip().lower() == email:
                student = s
                try:
                    student.email_hash = encryption_engine.hash_email(email)
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                break

    if not student or not student.password_hash:
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    if not check_password_hash(student.password_hash, password):
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    if not student.is_authenticated:
        return jsonify({'error': 'Compte non activé. Validez votre code d\'accès via le site web.'}), 403

    if not student.email_verified:
        # Envoyer un nouveau code de vérification
        from models.email_verification import EmailVerification
        from services.email_service import send_verification_code
        verification = EmailVerification.create_verification(student.email, 'student')
        db.session.commit()
        send_verification_code(student.email, verification.code, 'student')
        return jsonify({
            'error': 'Email non vérifié',
            'needs_verification': True,
            'student_id': student.id
        }), 403

    student.last_login = datetime.utcnow()
    db.session.commit()

    token = generate_token('student', student.id)
    return jsonify({
        'token': token,
        'user': {
            'id': student.id,
            'first_name': student.first_name,
            'last_name': student.last_name,
            'email': student.email,
            'classroom': student.classroom.name if student.classroom else None
        }
    })


@api_bp.route('/auth/student/register', methods=['POST'])
def student_register():
    """Inscription élève : code d'accès classe + email + mot de passe."""
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    access_code = data.get('access_code', '').strip().upper()

    if not email or not password or not access_code:
        return jsonify({'error': 'Email, mot de passe et code d\'accès requis'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Le mot de passe doit contenir au moins 8 caractères'}), 400

    from models.classroom_access_code import ClassroomAccessCode
    from models.student import Student
    from utils.encryption import encryption_engine
    from werkzeug.security import generate_password_hash

    code = ClassroomAccessCode.query.filter_by(code=access_code).first()
    if not code or not code.is_valid():
        return jsonify({'error': 'Code d\'accès invalide ou expiré'}), 400

    email_hash = encryption_engine.hash_email(email)

    # Recherche par hash
    student = None
    if email_hash:
        student = Student.query.filter_by(
            classroom_id=code.classroom_id,
            email_hash=email_hash
        ).first()

    # Fallback comparaison en clair
    if not student:
        all_students = Student.query.filter_by(classroom_id=code.classroom_id).all()
        for s in all_students:
            if s.email and s.email.strip().lower() == email:
                student = s
                break

    if not student:
        return jsonify({'error': 'Aucun élève trouvé avec cet email dans cette classe.'}), 404

    if student.password_hash:
        # Si l'email n'est pas vérifié, renvoyer un code et rediriger vers vérification
        if not student.email_verified:
            try:
                from models.email_verification import EmailVerification
                from services.email_service import send_verification_code
                verification = EmailVerification.create_verification(student.email, 'student')
                db.session.commit()
                send_verification_code(student.email, verification.code, 'student')
                return jsonify({
                    'success': True,
                    'message': 'Un compte existe déjà mais l\'email n\'est pas vérifié. Un nouveau code vous a été envoyé.',
                    'needs_verification': True,
                    'student_id': student.id
                })
            except Exception:
                pass
        return jsonify({'error': 'Un compte existe déjà pour cet élève.'}), 409

    student.password_hash = generate_password_hash(password)
    student.is_authenticated = True

    try:
        from models.email_verification import EmailVerification
        from services.email_service import send_verification_code
        verification = EmailVerification.create_verification(student.email, 'student')
        db.session.commit()
        send_verification_code(student.email, verification.code, 'student')

        return jsonify({
            'success': True,
            'message': 'Compte créé. Un code de vérification a été envoyé par email.',
            'needs_verification': True,
            'student_id': student.id
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors de la création du compte'}), 500


@api_bp.route('/auth/student/verify-email', methods=['POST'])
def student_verify_email():
    """Vérification email élève → JWT."""
    data = request.get_json(silent=True) or {}
    student_id = data.get('student_id')
    code = data.get('code', '').strip()

    if not student_id or not code:
        return jsonify({'error': 'ID élève et code requis'}), 400

    from models.student import Student
    from models.email_verification import EmailVerification

    student = Student.query.get(student_id)
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    verification = EmailVerification.query.filter_by(
        email=student.email,
        code=code,
        user_type='student',
        is_used=False
    ).first()

    if not verification or not verification.is_valid():
        return jsonify({'error': 'Code invalide ou expiré'}), 400

    verification.is_used = True
    student.email_verified = True
    student.last_login = datetime.utcnow()
    db.session.commit()

    token = generate_token('student', student.id)
    return jsonify({
        'token': token,
        'user': {
            'id': student.id,
            'first_name': student.first_name,
            'last_name': student.last_name,
            'email': student.email,
            'classroom': student.classroom.name if student.classroom else None
        }
    })


@api_bp.route('/auth/student/resend-code', methods=['POST'])
def student_resend_code():
    """Renvoyer un code de vérification email à l'élève."""
    data = request.get_json(silent=True) or {}
    student_id = data.get('student_id')
    if not student_id:
        return jsonify({'error': 'ID élève requis'}), 400

    from models.student import Student
    from models.email_verification import EmailVerification
    from services.email_service import send_verification_code

    student = Student.query.get(student_id)
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    last = EmailVerification.query.filter_by(
        email=student.email, user_type='student'
    ).order_by(EmailVerification.created_at.desc()).first()

    if last and (datetime.utcnow() - last.created_at) < timedelta(minutes=1):
        return jsonify({'error': 'Veuillez attendre 1 minute avant de renvoyer un code.'}), 429

    verification = EmailVerification.create_verification(student.email, 'student')
    db.session.commit()
    email_sent = send_verification_code(student.email, verification.code, 'student')

    return jsonify({'success': email_sent, 'message': 'Code envoyé' if email_sent else 'Échec d\'envoi'})


# ═══════════════════════════════════════════════════════════════════
#                       AUTH — PARENT
# ═══════════════════════════════════════════════════════════════════

@api_bp.route('/auth/parent/login', methods=['POST'])
def parent_login():
    """Connexion parent → JWT."""
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400

    from utils.encryption import encryption_engine
    from models.parent import Parent

    parent = Parent.query.filter_by(email_hash=encryption_engine.hash_email(email)).first()

    # Fallback : recherche par email en clair si le hash ne correspond pas
    if not parent:
        all_parents = Parent.query.all()
        for p in all_parents:
            if p.email and p.email.strip().lower() == email:
                parent = p
                try:
                    parent.email_hash = encryption_engine.hash_email(email)
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                break

    if not parent or not parent.check_password(password):
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    if not parent.email_verified:
        from models.email_verification import EmailVerification
        from services.email_service import send_verification_code
        verification = EmailVerification.create_verification(email, 'parent')
        db.session.commit()
        send_verification_code(email, verification.code, 'parent')
        return jsonify({
            'error': 'Email non vérifié',
            'needs_verification': True,
            'parent_id': parent.id
        }), 403

    parent.last_login = datetime.utcnow()
    db.session.commit()

    token = generate_token('parent', parent.id)
    return jsonify({
        'token': token,
        'user': {
            'id': parent.id,
            'first_name': parent.first_name,
            'last_name': parent.last_name,
            'email': parent.email,
            'needs_link': parent.teacher_id is None
        }
    })


@api_bp.route('/auth/parent/register', methods=['POST'])
def parent_register():
    """Inscription parent."""
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()

    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Le mot de passe doit contenir au moins 6 caractères'}), 400

    import re
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return jsonify({'error': 'Format d\'email invalide'}), 400

    from utils.encryption import encryption_engine
    from models.parent import Parent

    existing_parent = Parent.query.filter_by(email_hash=encryption_engine.hash_email(email)).first()
    if existing_parent:
        # Si l'email n'est pas vérifié, renvoyer un code et rediriger vers vérification
        if not existing_parent.email_verified:
            try:
                from models.email_verification import EmailVerification
                from services.email_service import send_verification_code
                verification = EmailVerification.create_verification(email, 'parent')
                db.session.commit()
                send_verification_code(email, verification.code, 'parent')
                return jsonify({
                    'success': True,
                    'message': 'Un compte existe déjà mais l\'email n\'est pas vérifié. Un nouveau code vous a été envoyé.',
                    'needs_verification': True,
                    'parent_id': existing_parent.id
                })
            except Exception:
                pass
        return jsonify({'error': 'Un compte avec cet email existe déjà'}), 409

    try:
        parent = Parent(email=email, first_name=first_name, last_name=last_name)
        parent.set_password(password)
        db.session.add(parent)
        db.session.flush()

        from models.email_verification import EmailVerification
        from services.email_service import send_verification_code
        verification = EmailVerification.create_verification(email, 'parent')
        db.session.commit()
        send_verification_code(email, verification.code, 'parent')

        return jsonify({
            'success': True,
            'message': 'Compte créé. Un code de vérification a été envoyé.',
            'needs_verification': True,
            'parent_id': parent.id
        })
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors de la création du compte'}), 500


@api_bp.route('/auth/parent/verify-email', methods=['POST'])
def parent_verify_email():
    """Vérification email parent → JWT."""
    data = request.get_json(silent=True) or {}
    parent_id = data.get('parent_id')
    code = data.get('code', '').strip()

    if not parent_id or not code:
        return jsonify({'error': 'ID parent et code requis'}), 400

    from models.parent import Parent
    from models.email_verification import EmailVerification

    parent = Parent.query.get(parent_id)
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    verification = EmailVerification.query.filter_by(
        email=parent.email,
        code=code,
        user_type='parent',
        is_used=False
    ).first()

    if not verification or not verification.is_valid():
        return jsonify({'error': 'Code invalide ou expiré'}), 400

    verification.is_used = True
    parent.email_verified = True
    parent.last_login = datetime.utcnow()
    db.session.commit()

    token = generate_token('parent', parent.id)
    return jsonify({
        'token': token,
        'user': {
            'id': parent.id,
            'first_name': parent.first_name,
            'last_name': parent.last_name,
            'email': parent.email,
            'needs_link': parent.teacher_id is None
        }
    })


@api_bp.route('/auth/parent/resend-code', methods=['POST'])
def parent_resend_code():
    """Renvoyer un code de vérification email au parent."""
    data = request.get_json(silent=True) or {}
    parent_id = data.get('parent_id')
    if not parent_id:
        return jsonify({'error': 'ID parent requis'}), 400

    from models.parent import Parent
    from models.email_verification import EmailVerification
    from services.email_service import send_verification_code

    parent = Parent.query.get(parent_id)
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    last = EmailVerification.query.filter_by(
        email=parent.email, user_type='parent'
    ).order_by(EmailVerification.created_at.desc()).first()

    if last and (datetime.utcnow() - last.created_at) < timedelta(minutes=1):
        return jsonify({'error': 'Veuillez attendre 1 minute.'}), 429

    verification = EmailVerification.create_verification(parent.email, 'parent')
    db.session.commit()
    email_sent = send_verification_code(parent.email, verification.code, 'parent')

    return jsonify({'success': email_sent, 'message': 'Code envoyé' if email_sent else 'Échec d\'envoi'})


@api_bp.route('/auth/parent/link-child', methods=['POST'])
@jwt_required(user_type='parent')
def parent_link_child():
    """Lier un parent à un enseignant/classe via teacher_name + class_code."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    data = request.get_json(silent=True) or {}
    teacher_name = data.get('teacher_name', '').strip()
    class_code = data.get('class_code', '').strip().upper()

    if not teacher_name or not class_code:
        return jsonify({'error': 'Nom de l\'enseignant et code de classe requis'}), 400

    from models.parent import ClassCode, ParentChild
    from models.student import Student

    code_obj = ClassCode.query.filter_by(code=class_code, is_active=True).first()
    if not code_obj:
        return jsonify({'error': 'Code de classe introuvable'}), 404

    teacher = code_obj.user
    tname = teacher_name.lower()
    if tname != teacher.username.lower() and tname != teacher.email.lower():
        return jsonify({'error': f'Le nom de l\'enseignant ne correspond pas.'}), 400

    # Première liaison : définir le teacher_id
    if not parent.teacher_id:
        parent.teacher_name = teacher_name
        parent.class_code = class_code
        parent.teacher_id = teacher.id

    # Liaison automatique des enfants
    from routes.parent_auth import link_children_automatically
    children_linked = link_children_automatically(parent, code_obj.classroom_id)

    if children_linked > 0:
        parent.is_verified = True

    db.session.commit()

    msg = f'{children_linked} enfant(s) trouvé(s) et lié(s).' if children_linked > 0 else 'Aucun enfant trouvé avec votre email dans cette classe.'

    return jsonify({'success': True, 'message': msg, 'children_linked': children_linked})


# ═══════════════════════════════════════════════════════════════════
#                       STUDENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@api_bp.route('/student/dashboard', methods=['GET'])
@jwt_required(user_type='student')
def student_dashboard():
    """Résumé du dashboard élève : notes récentes, fichiers, remarques."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    all_ids = _get_all_student_ids(student)

    # Notes récentes
    from models.evaluation import EvaluationGrade, Evaluation
    from models.classroom import Classroom
    grades = EvaluationGrade.query.join(Evaluation).join(Classroom).filter(
        EvaluationGrade.student_id.in_(all_ids),
        EvaluationGrade.points.isnot(None)
    ).order_by(Evaluation.date.desc()).limit(10).all()

    grades_data = []
    for g in grades:
        grades_data.append({
            'id': g.id,
            'subject': g.evaluation.classroom.subject,
            'title': g.evaluation.title,
            'type': g.evaluation.type,
            'points': g.points,
            'max_points': g.evaluation.max_points,
            'date': g.evaluation.date.isoformat()
        })

    # Fichiers récents
    from models.file_sharing import StudentFileShare
    from models.class_file import ClassFile
    recent_files = db.session.query(StudentFileShare, ClassFile).join(
        ClassFile, StudentFileShare.file_id == ClassFile.id
    ).filter(
        StudentFileShare.student_id.in_(all_ids),
        StudentFileShare.is_active == True
    ).order_by(StudentFileShare.shared_at.desc()).limit(5).all()

    files_data = [{
        'id': f.id,
        'filename': f.user_file.original_filename if f.user_file else 'Fichier inconnu',
        'file_type': f.user_file.file_type if f.user_file else None,
        'shared_at': s.shared_at.isoformat(),
        'message': s.message
    } for s, f in recent_files]

    # Remarques
    from models.lesson_memo import StudentRemark
    remarks = StudentRemark.query.filter(
        StudentRemark.student_id.in_(all_ids),
        StudentRemark.send_to_parent_and_student == True
    ).order_by(StudentRemark.created_at.desc()).limit(20).all()

    remarks_data = [{
        'id': r.id,
        'content': r.content,
        'date': r.source_date.isoformat(),
        'period': r.source_period,
        'is_read': r.is_viewed_by_student,
        'created_at': r.created_at.isoformat()
    } for r in remarks]

    unread = StudentRemark.query.filter(
        StudentRemark.student_id.in_(all_ids),
        StudentRemark.send_to_parent_and_student == True,
        StudentRemark.is_viewed_by_student == False
    ).count()

    return jsonify({
        'student': {
            'id': student.id,
            'first_name': student.first_name,
            'last_name': student.last_name,
            'classroom': student.classroom.name if student.classroom else None,
            'subject': student.classroom.subject if student.classroom else None
        },
        'recent_grades': grades_data,
        'recent_files': files_data,
        'remarks': remarks_data,
        'unread_remarks_count': unread
    })


@api_bp.route('/student/grades', methods=['GET'])
@jwt_required(user_type='student')
def student_grades():
    """Notes détaillées par matière pour l'élève."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    all_ids = _get_all_student_ids(student)

    from models.evaluation import EvaluationGrade, Evaluation
    from models.classroom import Classroom

    grades = EvaluationGrade.query.join(Evaluation).join(Classroom).filter(
        EvaluationGrade.student_id.in_(all_ids),
        EvaluationGrade.points.isnot(None)
    ).order_by(Evaluation.date.desc()).all()

    subjects = {}
    for g in grades:
        subject = g.evaluation.classroom.subject
        if subject not in subjects:
            subjects[subject] = {
                'subject': subject,
                'classroom_name': g.evaluation.classroom.name,
                'grades': [],
                'total_significatif': 0, 'count_significatif': 0,
                'total_ta': 0, 'count_ta': 0
            }

        subjects[subject]['grades'].append({
            'id': g.id,
            'title': g.evaluation.title,
            'type': g.evaluation.type,
            'ta_group': g.evaluation.ta_group_name,
            'points': g.points,
            'max_points': g.evaluation.max_points,
            'date': g.evaluation.date.isoformat()
        })

        if g.points is not None:
            if g.evaluation.type == 'significatif':
                subjects[subject]['total_significatif'] += g.points
                subjects[subject]['count_significatif'] += 1
            elif g.evaluation.type == 'ta':
                subjects[subject]['total_ta'] += g.points
                subjects[subject]['count_ta'] += 1

    # Calculer moyennes
    result = {}
    for subj, data in subjects.items():
        avg_s = data['total_significatif'] / data['count_significatif'] if data['count_significatif'] > 0 else None
        avg_t = data['total_ta'] / data['count_ta'] if data['count_ta'] > 0 else None

        if avg_s is not None and avg_t is not None:
            avg_general = round(avg_s * 0.6 + avg_t * 0.4, 2)
        elif avg_s is not None:
            avg_general = round(avg_s, 2)
        elif avg_t is not None:
            avg_general = round(avg_t, 2)
        else:
            avg_general = None

        result[subj] = {
            'subject': subj,
            'classroom_name': data['classroom_name'],
            'grades': data['grades'],
            'averages': {
                'significatif': round(avg_s, 2) if avg_s else None,
                'ta': round(avg_t, 2) if avg_t else None,
                'general': avg_general
            }
        }

    return jsonify({'subjects': result, 'has_grades': len(result) > 0})


@api_bp.route('/student/files', methods=['GET'])
@jwt_required(user_type='student')
def student_files():
    """Fichiers partagés avec l'élève."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    all_ids = _get_all_student_ids(student)

    from models.file_sharing import StudentFileShare
    from models.class_file import ClassFile

    shared = db.session.query(StudentFileShare, ClassFile).join(
        ClassFile, StudentFileShare.file_id == ClassFile.id
    ).filter(
        StudentFileShare.student_id.in_(all_ids),
        StudentFileShare.is_active == True
    ).order_by(StudentFileShare.shared_at.desc()).all()

    files_data = [{
        'id': f.id,
        'filename': f.user_file.original_filename if f.user_file else 'Fichier inconnu',
        'file_type': f.user_file.file_type if f.user_file else None,
        'file_size': f.user_file.file_size if f.user_file else None,
        'shared_at': s.shared_at.isoformat(),
        'message': s.message,
        'viewed': s.viewed_at is not None
    } for s, f in shared]

    return jsonify({'files': files_data})


@api_bp.route('/student/files/<int:file_id>/download', methods=['GET'])
@jwt_required(user_type='student')
def student_download_file(file_id):
    """Télécharger un fichier partagé."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    all_ids = _get_all_student_ids(student)

    from models.file_sharing import StudentFileShare
    from models.class_file import ClassFile

    result = db.session.query(StudentFileShare, ClassFile).join(
        ClassFile, StudentFileShare.file_id == ClassFile.id
    ).filter(
        StudentFileShare.file_id == file_id,
        StudentFileShare.student_id.in_(all_ids),
        StudentFileShare.is_active == True
    ).first()

    if not result:
        return jsonify({'error': 'Fichier non trouvé'}), 404

    share, class_file = result
    share.mark_as_viewed()

    if not class_file.user_file:
        return jsonify({'error': 'Fichier source introuvable'}), 404

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
        return jsonify({'error': 'Fichier physique introuvable'}), 404

    return send_file(file_path, as_attachment=True, download_name=user_file.original_filename)


@api_bp.route('/student/teachers', methods=['GET'])
@jwt_required(user_type='student')
def student_teachers():
    """Liste des enseignants de l'élève."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    from models.class_collaboration import SharedClassroom

    teachers_list = []

    # Maître de classe
    if student.classroom and student.classroom.teacher:
        t = student.classroom.teacher
        teachers_list.append({
            'name': t.username,
            'email': t.email,
            'subject': student.classroom.subject,
            'role': 'Maître de classe',
            'classroom_name': student.classroom.name
        })

    # Enseignants spécialisés
    derived = SharedClassroom.query.filter_by(
        original_classroom_id=student.classroom_id
    ).all()
    for dc in derived:
        sc = dc.derived_classroom
        if sc and sc.teacher:
            teachers_list.append({
                'name': sc.teacher.username,
                'email': sc.teacher.email,
                'subject': sc.subject,
                'role': 'Enseignant spécialisé',
                'classroom_name': sc.name
            })

    return jsonify({'teachers': teachers_list})


@api_bp.route('/student/remarks/<int:remark_id>/read', methods=['POST'])
@jwt_required(user_type='student')
def student_mark_remark_read(remark_id):
    """Marquer une remarque comme lue par l'élève."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    all_ids = _get_all_student_ids(student)

    from models.lesson_memo import StudentRemark
    remark = StudentRemark.query.filter(
        StudentRemark.id == remark_id,
        StudentRemark.student_id.in_(all_ids)
    ).first()

    if not remark:
        return jsonify({'error': 'Remarque non trouvée'}), 404

    remark.is_viewed_by_student = True
    db.session.commit()
    return jsonify({'success': True})


# ═══════════════════════════════════════════════════════════════════
#                       PARENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@api_bp.route('/parent/dashboard', methods=['GET'])
@jwt_required(user_type='parent')
def parent_dashboard():
    """Dashboard parent : liste des enfants + résumé."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    from models.parent import ParentChild
    from models.student import Student
    from models.lesson_memo import StudentRemark

    children_data = []
    links = ParentChild.query.filter_by(parent_id=parent.id).all()

    for link in links:
        student = Student.query.get(link.student_id)
        if not student:
            continue
        children_data.append({
            'id': student.id,
            'first_name': student.first_name,
            'last_name': student.last_name,
            'classroom': student.classroom.name if student.classroom else None,
            'relationship': link.relationship
        })

    # Remarques non lues
    student_ids = [c['id'] for c in children_data]
    unread = 0
    if student_ids:
        unread = StudentRemark.query.filter(
            StudentRemark.student_id.in_(student_ids),
            StudentRemark.send_to_parent_and_student == True,
            StudentRemark.is_viewed_by_parent == False
        ).count()

    return jsonify({
        'parent': {
            'id': parent.id,
            'first_name': parent.first_name,
            'last_name': parent.last_name,
            'needs_link': parent.teacher_id is None
        },
        'children': children_data,
        'unread_remarks_count': unread
    })


@api_bp.route('/parent/children/<int:student_id>/attendance', methods=['GET'])
@jwt_required(user_type='parent')
def parent_child_attendance(student_id):
    """Absences et retards d'un enfant."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    from models.parent import ParentChild
    pc = ParentChild.query.filter_by(parent_id=parent.id, student_id=student_id).first()
    if not pc:
        return jsonify({'error': 'Accès non autorisé'}), 403

    from models.student import Student
    from models.attendance import Attendance
    from routes.parent_auth import get_all_linked_students

    student = Student.query.get_or_404(student_id)
    linked = get_all_linked_students(student_id)
    linked_ids = [s.id for s in linked]

    attendances = Attendance.query.filter(
        Attendance.student_id.in_(linked_ids)
    ).filter(
        Attendance.status.in_(['absent', 'late'])
    ).order_by(Attendance.date.desc(), Attendance.period_number).limit(100).all()

    by_date = {}
    for a in attendances:
        dk = a.date.strftime('%d/%m/%Y')
        if dk not in by_date:
            by_date[dk] = {'date': dk, 'date_iso': a.date.isoformat(), 'periods': []}
        by_date[dk]['periods'].append({
            'period': a.period_number,
            'status': a.status,
            'note': a.comment or '',
            'late_minutes': a.late_minutes if a.status == 'late' else None,
            'subject': a.classroom.subject if a.classroom else ''
        })

    data = sorted(by_date.values(), key=lambda x: x['date_iso'], reverse=True)

    return jsonify({
        'student_name': f'{student.first_name} {student.last_name}',
        'attendance_data': data
    })


@api_bp.route('/parent/children/<int:student_id>/grades', methods=['GET'])
@jwt_required(user_type='parent')
def parent_child_grades(student_id):
    """Notes d'un enfant."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    from models.parent import ParentChild
    pc = ParentChild.query.filter_by(parent_id=parent.id, student_id=student_id).first()
    if not pc:
        return jsonify({'error': 'Accès non autorisé'}), 403

    from models.student import Student
    from models.evaluation import EvaluationGrade, Evaluation
    from models.classroom import Classroom
    from routes.parent_auth import get_all_linked_students

    student = Student.query.get_or_404(student_id)
    linked = get_all_linked_students(student_id)
    linked_ids = [s.id for s in linked]

    grades_query = db.session.query(EvaluationGrade, Evaluation, Classroom).join(
        Evaluation, EvaluationGrade.evaluation_id == Evaluation.id
    ).join(
        Classroom, Evaluation.classroom_id == Classroom.id
    ).filter(
        EvaluationGrade.student_id.in_(linked_ids),
        EvaluationGrade.points.isnot(None)
    ).order_by(Classroom.subject, Evaluation.date).all()

    subjects_data = {}
    for grade, evaluation, classroom in grades_query:
        subject = classroom.subject
        if subject not in subjects_data:
            subjects_data[subject] = {
                'subject_name': subject,
                'classroom_name': classroom.name,
                'grades': [],
                'total_significatif': 0, 'count_significatif': 0,
                'total_ta': 0, 'count_ta': 0
            }

        subjects_data[subject]['grades'].append({
            'title': evaluation.title,
            'type': evaluation.type,
            'ta_group': evaluation.ta_group_name,
            'points': round(grade.points, 2) if grade.points else None,
            'max_points': evaluation.max_points,
            'date': evaluation.date.isoformat()
        })

        if grade.points is not None:
            if evaluation.type == 'significatif':
                subjects_data[subject]['total_significatif'] += grade.points
                subjects_data[subject]['count_significatif'] += 1
            elif evaluation.type == 'ta':
                subjects_data[subject]['total_ta'] += grade.points
                subjects_data[subject]['count_ta'] += 1

    # Moyennes
    for data in subjects_data.values():
        avg_s = data['total_significatif'] / data['count_significatif'] if data['count_significatif'] > 0 else None
        avg_t = data['total_ta'] / data['count_ta'] if data['count_ta'] > 0 else None

        if avg_s is not None and avg_t is not None:
            avg_g = round(avg_s * 0.6 + avg_t * 0.4, 2)
        elif avg_s is not None:
            avg_g = round(avg_s, 2)
        elif avg_t is not None:
            avg_g = round(avg_t, 2)
        else:
            avg_g = None

        data['averages'] = {
            'significatif': round(avg_s, 2) if avg_s else None,
            'ta': round(avg_t, 2) if avg_t else None,
            'general': avg_g
        }
        # Nettoyage
        del data['total_significatif'], data['count_significatif']
        del data['total_ta'], data['count_ta']

    return jsonify({
        'student_name': f'{student.first_name} {student.last_name}',
        'subjects_data': subjects_data,
        'has_grades': len(subjects_data) > 0
    })


@api_bp.route('/parent/children/<int:student_id>/sanctions', methods=['GET'])
@jwt_required(user_type='parent')
def parent_child_sanctions(student_id):
    """Coches d'un enfant par discipline."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    from models.parent import ParentChild
    pc = ParentChild.query.filter_by(parent_id=parent.id, student_id=student_id).first()
    if not pc:
        return jsonify({'error': 'Accès non autorisé'}), 403

    from models.student import Student
    from models.student_sanctions import StudentSanctionCount
    from models.sanctions import SanctionTemplate, ClassroomSanctionImport
    from models.classroom import Classroom
    from routes.parent_auth import get_all_linked_students

    student = Student.query.get_or_404(student_id)
    linked = get_all_linked_students(student_id)
    linked_ids = [s.id for s in linked]

    classrooms = Classroom.query.join(Student).filter(Student.id.in_(linked_ids)).all()

    sanctions_by_subject = {}
    total_checks = 0

    for classroom in classrooms:
        subject = classroom.subject
        imports = ClassroomSanctionImport.query.filter_by(
            classroom_id=classroom.id, is_active=True
        ).all()

        if subject not in sanctions_by_subject:
            sanctions_by_subject[subject] = {
                'subject_name': subject,
                'classroom_name': classroom.name,
                'total_checks': 0,
                'templates': []
            }

        for imp in imports:
            template = SanctionTemplate.query.get(imp.template_id)
            if not template:
                continue
            sc = StudentSanctionCount.query.filter_by(
                student_id=student_id, template_id=template.id
            ).first()
            cc = sc.check_count if sc else 0

            sanctions_by_subject[subject]['templates'].append({
                'template_name': template.name,
                'check_count': cc
            })
            if cc > 0:
                sanctions_by_subject[subject]['total_checks'] += cc
                total_checks += cc

    return jsonify({
        'student_name': f'{student.first_name} {student.last_name}',
        'sanctions_by_subject': sanctions_by_subject,
        'total_checks': total_checks,
        'has_sanctions': total_checks > 0
    })


@api_bp.route('/parent/children/<int:student_id>/teachers', methods=['GET'])
@jwt_required(user_type='parent')
def parent_child_teachers(student_id):
    """Enseignants d'un enfant."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    from models.parent import ParentChild
    pc = ParentChild.query.filter_by(parent_id=parent.id, student_id=student_id).first()
    if not pc:
        return jsonify({'error': 'Accès non autorisé'}), 403

    from models.student import Student
    from models.class_collaboration import SharedClassroom

    student = Student.query.get_or_404(student_id)
    teachers = []

    if student.classroom and student.classroom.teacher:
        t = student.classroom.teacher
        teachers.append({
            'name': t.username,
            'email': t.email,
            'subject': student.classroom.subject,
            'role': 'Maître de classe',
            'classroom_name': student.classroom.name
        })

    derived = SharedClassroom.query.filter_by(
        original_classroom_id=student.classroom_id
    ).all()
    for dc in derived:
        sc = dc.derived_classroom
        if sc and sc.teacher:
            teachers.append({
                'name': sc.teacher.username,
                'email': sc.teacher.email,
                'subject': sc.subject,
                'role': 'Enseignant spécialisé',
                'classroom_name': sc.name
            })

    return jsonify({
        'student_name': f'{student.first_name} {student.last_name}',
        'teachers': teachers
    })


@api_bp.route('/parent/remarks', methods=['GET'])
@jwt_required(user_type='parent')
def parent_remarks():
    """Remarques pour tous les enfants du parent."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    from models.parent import ParentChild
    from models.lesson_memo import StudentRemark
    from models.student import Student

    links = ParentChild.query.filter_by(parent_id=parent.id).all()
    student_ids = [l.student_id for l in links]

    if not student_ids:
        return jsonify({'remarks': [], 'unread_count': 0})

    remarks = StudentRemark.query.filter(
        StudentRemark.student_id.in_(student_ids),
        StudentRemark.send_to_parent_and_student == True
    ).order_by(StudentRemark.created_at.desc()).limit(50).all()

    remarks_data = []
    for r in remarks:
        st = Student.query.get(r.student_id)
        remarks_data.append({
            'id': r.id,
            'student_name': f'{st.first_name} {st.last_name}' if st else 'Inconnu',
            'student_id': r.student_id,
            'content': r.content,
            'date': r.source_date.isoformat(),
            'period': r.source_period,
            'is_read': r.is_viewed_by_parent,
            'created_at': r.created_at.isoformat()
        })

    unread = StudentRemark.query.filter(
        StudentRemark.student_id.in_(student_ids),
        StudentRemark.send_to_parent_and_student == True,
        StudentRemark.is_viewed_by_parent == False
    ).count()

    return jsonify({'remarks': remarks_data, 'unread_count': unread})


@api_bp.route('/parent/remarks/<int:remark_id>/read', methods=['POST'])
@jwt_required(user_type='parent')
def parent_mark_remark_read(remark_id):
    """Marquer une remarque comme lue par le parent."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    from models.parent import ParentChild
    from models.lesson_memo import StudentRemark

    links = ParentChild.query.filter_by(parent_id=parent.id).all()
    student_ids = [l.student_id for l in links]

    remark = StudentRemark.query.filter(
        StudentRemark.id == remark_id,
        StudentRemark.student_id.in_(student_ids)
    ).first()

    if not remark:
        return jsonify({'error': 'Remarque non trouvée'}), 404

    remark.is_viewed_by_parent = True
    db.session.commit()
    return jsonify({'success': True})


@api_bp.route('/parent/justify-absence', methods=['POST'])
@jwt_required(user_type='parent')
def parent_justify_absence():
    """Soumettre une justification d'absence."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    data = request.get_json(silent=True) or {}
    student_id = data.get('student_id')
    absence_date_str = data.get('absence_date')
    reason_type = data.get('reason')
    other_reason = data.get('other_reason_text', '')
    periods = data.get('periods', [])

    if not student_id or not absence_date_str or not reason_type or not periods:
        return jsonify({'error': 'Données incomplètes'}), 400

    from models.parent import ParentChild
    pc = ParentChild.query.filter_by(parent_id=parent.id, student_id=student_id).first()
    if not pc:
        return jsonify({'error': 'Accès non autorisé'}), 403

    try:
        absence_date = datetime.strptime(absence_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Format de date invalide'}), 400

    from models.absence_justification import AbsenceJustification
    justification = AbsenceJustification(
        student_id=student_id,
        parent_id=parent.id,
        absence_date=absence_date,
        reason_type=reason_type,
        other_reason_text=other_reason if reason_type == 'autre' else None,
        dispense_subject=data.get('dispense_subject') if reason_type == 'dispense' else None,
        dispense_start_date=datetime.strptime(data['dispense_start'], '%Y-%m-%d').date() if data.get('dispense_start') else None,
        dispense_end_date=datetime.strptime(data['dispense_end'], '%Y-%m-%d').date() if data.get('dispense_end') else None
    )
    justification.set_periods_list([{'period': p} for p in periods])

    db.session.add(justification)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Justification envoyée avec succès.',
        'justification_id': justification.id
    })


@api_bp.route('/parent/add-child', methods=['POST'])
@jwt_required(user_type='parent')
def parent_add_child():
    """Ajouter un enfant supplémentaire via teacher_name + class_code."""
    parent = _get_current_parent()
    if not parent:
        return jsonify({'error': 'Parent non trouvé'}), 404

    data = request.get_json(silent=True) or {}
    teacher_name = data.get('teacher_name', '').strip()
    class_code = data.get('class_code', '').strip().upper()

    if not teacher_name or not class_code:
        return jsonify({'error': 'Nom de l\'enseignant et code de classe requis'}), 400

    from models.parent import ClassCode
    from routes.parent_auth import link_children_automatically

    code_obj = ClassCode.query.filter_by(code=class_code, is_active=True).first()
    if not code_obj:
        return jsonify({'error': 'Code de classe introuvable'}), 404

    teacher = code_obj.user
    tname = teacher_name.lower()
    if tname != teacher.username.lower() and tname != teacher.email.lower():
        return jsonify({'error': 'Le nom de l\'enseignant ne correspond pas.'}), 400

    # Mettre à jour le teacher_id si pas encore défini
    if not parent.teacher_id:
        parent.teacher_id = teacher.id
        parent.teacher_name = teacher_name
        parent.class_code = class_code

    children_linked = link_children_automatically(parent, code_obj.classroom_id)
    db.session.commit()

    msg = f'{children_linked} enfant(s) lié(s).' if children_linked > 0 else 'Aucun enfant trouvé.'
    return jsonify({'success': True, 'message': msg, 'children_linked': children_linked})


# ═══════════════════════════════════════════════════════════════════
#                    MISSIONS / EXERCISES
# ═══════════════════════════════════════════════════════════════════

@api_bp.route('/student/missions', methods=['GET'])
@jwt_required(user_type='student')
def student_list_missions():
    """Lister les missions/exercices publiés pour la classe de l'élève."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    if not student.classroom_id:
        return jsonify({'missions': []})

    try:
        from models.exercise import Exercise
        from models.exercise_progress import ExercisePublication, StudentExerciseAttempt

        # Requête brute pour éviter les crashs si colonnes manquantes
        publications = db.session.execute(db.text(
            "SELECT id, exercise_id, published_at, "
            "COALESCE(mode, 'classique') as mode "
            "FROM exercise_publications "
            "WHERE classroom_id = :cid "
            "ORDER BY published_at DESC"
        ), {'cid': student.classroom_id}).fetchall()

        now = datetime.utcnow()
        missions_data = []
        for pub_row in publications:
            exercise = Exercise.query.get(pub_row.exercise_id)
            if not exercise:
                continue

            # Cooldown 24h
            last_attempt = StudentExerciseAttempt.query.filter_by(
                student_id=student.id, exercise_id=exercise.id
            ).filter(StudentExerciseAttempt.completed_at.isnot(None)).order_by(
                StudentExerciseAttempt.completed_at.desc()
            ).first()

            on_cooldown = False
            cooldown_remaining = 0
            if last_attempt and last_attempt.completed_at:
                elapsed = (now - last_attempt.completed_at).total_seconds()
                cooldown_secs = 24 * 3600
                if elapsed < cooldown_secs:
                    on_cooldown = True
                    cooldown_remaining = int(cooldown_secs - elapsed)

            try:
                blocks_count = exercise.blocks.count()
            except Exception:
                blocks_count = 0

            missions_data.append({
                'id': pub_row.id,
                'exercise_id': exercise.id,
                'title': exercise.title,
                'description': exercise.description or '',
                'subject': exercise.subject or '',
                'blocks_count': blocks_count,
                'xp_reward': exercise.total_points or 0,
                'published_at': pub_row.published_at.isoformat() if pub_row.published_at else '',
                'on_cooldown': on_cooldown,
                'cooldown_remaining': cooldown_remaining,
                'mode': pub_row.mode or 'classique',
            })

        return jsonify({'missions': missions_data})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'missions': [], 'error': str(e)}), 200


@api_bp.route('/student/missions/<int:mission_id>', methods=['GET'])
@jwt_required(user_type='student')
def student_get_mission(mission_id):
    """Obtenir les détails d'une mission avec ses blocs."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    if not student.classroom_id:
        return jsonify({'error': 'Accès non autorisé'}), 403

    from models.exercise import Exercise, ExerciseBlock
    from models.exercise_progress import ExercisePublication

    publication = ExercisePublication.query.filter_by(
        id=mission_id,
        classroom_id=student.classroom_id
    ).first()

    if not publication:
        return jsonify({'error': 'Mission non trouvée'}), 404

    exercise = publication.exercise
    if not exercise:
        return jsonify({'error': 'Exercice non trouvé'}), 404

    blocks_data = []
    for block in exercise.blocks.order_by(ExerciseBlock.position).all():
        blocks_data.append({
            'id': block.id,
            'position': block.position or 0,
            'block_type': block.block_type,
            'title': block.title or '',
            'duration': block.duration,
            'config_json': block.config_json or {},
            'points': block.points or 10
        })

    return jsonify({
        'mission': {
            'id': publication.id,
            'exercise_id': exercise.id,
            'title': exercise.title,
            'description': exercise.description or '',
            'subject': exercise.subject or '',
            'total_points': exercise.total_points or 0,
            'accept_typos': exercise.accept_typos or False,
            'blocks': blocks_data
        }
    })


@api_bp.route('/student/missions/<int:mission_id>/check-block', methods=['POST'])
@jwt_required(user_type='student')
def student_check_block(mission_id):
    """Vérifier la réponse d'un seul bloc (feedback immédiat)."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    from models.exercise import Exercise, ExerciseBlock
    from models.exercise_progress import ExercisePublication
    from routes.student_auth import grade_block

    publication = ExercisePublication.query.filter_by(
        id=mission_id,
        classroom_id=student.classroom_id
    ).first()
    if not publication:
        return jsonify({'error': 'Mission non trouvée'}), 404

    exercise = publication.exercise
    if not exercise:
        return jsonify({'error': 'Exercice non trouvé'}), 404

    data = request.get_json(silent=True) or {}
    block_id = data.get('block_id')
    answer = data.get('answer', {})

    block = ExerciseBlock.query.get(block_id)
    if not block or block.exercise_id != exercise.id:
        return jsonify({'error': 'Bloc non trouvé'}), 404

    accept_typos = exercise.accept_typos if hasattr(exercise, 'accept_typos') else False
    is_correct, points_earned = grade_block(block, answer, accept_typos=accept_typos)

    from routes.student_auth import get_correct_answer_text
    correct_answer_text = get_correct_answer_text(block) if not is_correct else None

    return jsonify({
        'success': True,
        'is_correct': is_correct,
        'points_earned': points_earned,
        'max_points': block.points or 0,
        'correct_answer': correct_answer_text,
    })


@api_bp.route('/student/missions/<int:mission_id>/submit', methods=['POST'])
@jwt_required(user_type='student')
def student_submit_mission(mission_id):
    """Soumettre les réponses à une mission et obtenir un score."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    if not student.classroom_id:
        return jsonify({'error': 'Accès non autorisé'}), 403

    from models.exercise import Exercise, ExerciseBlock
    from models.exercise_progress import (
        ExercisePublication, StudentExerciseAttempt, StudentBlockAnswer
    )
    from routes.student_auth import grade_block, check_badges

    publication = ExercisePublication.query.filter_by(
        id=mission_id,
        classroom_id=student.classroom_id
    ).first()

    if not publication:
        return jsonify({'error': 'Mission non trouvée'}), 404

    exercise = publication.exercise
    if not exercise:
        return jsonify({'error': 'Exercice non trouvé'}), 404

    # Cooldown 24h : vérifier avant de soumettre
    last_attempt = StudentExerciseAttempt.query.filter_by(
        student_id=student.id, exercise_id=exercise.id
    ).filter(StudentExerciseAttempt.completed_at.isnot(None)).order_by(
        StudentExerciseAttempt.completed_at.desc()
    ).first()
    if last_attempt and last_attempt.completed_at:
        elapsed = (datetime.utcnow() - last_attempt.completed_at).total_seconds()
        if elapsed < 24 * 3600:
            remaining = int(24 * 3600 - elapsed)
            hours = remaining // 3600
            minutes = (remaining % 3600) // 60
            return jsonify({
                'error': f'Cooldown actif. Réessaie dans {hours}h{minutes:02d}.',
                'on_cooldown': True,
                'cooldown_remaining': remaining
            }), 429

    data = request.get_json(silent=True)
    if data is None:
        # JSON parsing failed — try force-parsing
        data = request.get_json(force=True, silent=True) or {}
    answers = data.get('answers', [])

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[SUBMIT] mission_id={mission_id}, student={student.id}, "
                f"exercise={exercise.id}, answers_count={len(answers)}")

    # Si aucune réponse envoyée, tenter de récupérer depuis le body brut
    if not answers:
        logger.warning(f"[SUBMIT] Empty answers! raw body: {request.data[:500] if request.data else 'None'}")

    # Créer une tentative
    attempt = StudentExerciseAttempt(
        student_id=student.id,
        exercise_id=exercise.id,
        publication_id=publication.id
    )
    db.session.add(attempt)
    db.session.flush()

    total_points_earned = 0
    max_points = 0
    blocks_results = []

    # Traiter chaque réponse
    for answer_data in answers:
        block_id = answer_data.get('block_id')
        user_answer = answer_data.get('answer', {})  # {} au lieu de '' pour éviter les crashes .get()

        if not block_id:
            logger.warning(f"[SUBMIT] Skipping answer with no block_id: {answer_data}")
            continue

        block = ExerciseBlock.query.get(block_id)
        if not block or block.exercise_id != exercise.id:
            logger.warning(f"[SUBMIT] Block {block_id} not found or wrong exercise "
                           f"(block.exercise_id={block.exercise_id if block else 'N/A'}, "
                           f"expected={exercise.id})")
            continue

        max_points += (block.points or 0)

        # Grader le bloc — returns (is_correct, points_earned)
        try:
            accept_typos = exercise.accept_typos if hasattr(exercise, 'accept_typos') else False
            is_correct, points_earned = grade_block(block, user_answer, accept_typos)
        except Exception as e:
            logger.error(f"[SUBMIT] grade_block error block={block_id} type={block.block_type}: {e}")
            is_correct, points_earned = False, 0

        total_points_earned += points_earned

        # Enregistrer la réponse
        block_answer = StudentBlockAnswer(
            attempt_id=attempt.id,
            block_id=block_id,
            answer_json=user_answer if isinstance(user_answer, (dict, list)) else {'raw': user_answer},
            is_correct=is_correct,
            points_earned=points_earned
        )
        db.session.add(block_answer)

        blocks_results.append({
            'block_id': block_id,
            'is_correct': is_correct,
            'points_earned': points_earned
        })

    logger.info(f"[SUBMIT] Results: {total_points_earned}/{max_points} points, "
                f"{len(blocks_results)} blocks graded")

    # Calculer le score final
    attempt.score = total_points_earned
    attempt.max_score = max_points
    attempt.completed_at = datetime.utcnow()

    # XP et or via le profil RPG
    from models.rpg import StudentRPGProfile
    rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()
    xp_earned = 0
    gold_earned = 0

    if rpg:
        xp_earned = total_points_earned
        rpg.add_xp(xp_earned)
        attempt.xp_earned = xp_earned

        # Bonus or si score >= seuil
        score_pct = (total_points_earned / max_points * 100) if max_points > 0 else 0
        gold_threshold = exercise.bonus_gold_threshold or 80
        if score_pct >= gold_threshold:
            gold_earned = max(1, total_points_earned // 10)
            rpg.add_gold(gold_earned)
            attempt.gold_earned = gold_earned

        # Vérifier les badges (la fonction ajoute directement en DB)
        check_badges(student, rpg)

        # Attribuer un objet RPG aléatoire
        from models.rpg import award_random_item
        score_pct_val = (total_points_earned / max_points * 100) if max_points > 0 else 0
        item_won = award_random_item(student.id, score_pct_val)

    db.session.commit()

    score_pct_result = round((total_points_earned / max_points * 100) if max_points > 0 else 0, 1)
    result = {
        'success': True,
        'attempt_id': attempt.id,
        'score': attempt.score,
        'max_score': attempt.max_score,
        'score_percentage': score_pct_result,
        'percentage': score_pct_result,
        'xp_earned': xp_earned,
        'gold_earned': gold_earned,
        'new_level': rpg.level if rpg else 1,
        'blocks_results': blocks_results
    }
    if rpg and item_won:
        result['item_won'] = item_won.to_dict()

    return jsonify(result)


@api_bp.route('/student/rpg/profile', methods=['GET'])
@jwt_required(user_type='student')
def student_rpg_profile():
    """Obtenir le profil RPG de l'élève (XP, niveau, or, avatar, badges)."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    from models.rpg import StudentRPGProfile, Badge, StudentBadge, StudentItem, CLASS_DESCRIPTIONS, CLASS_BASE_STATS

    rpg_profile = StudentRPGProfile.query.filter_by(student_id=student.id).first()

    if not rpg_profile:
        rpg_profile = StudentRPGProfile(
            student_id=student.id,
            xp_total=0,
            gold=0,
        )
        db.session.add(rpg_profile)
        db.session.commit()

    level = rpg_profile.level
    xp_for_next_level = rpg_profile.xp_for_next_level
    xp_progress = rpg_profile.xp_progress

    # Récupérer les badges (safe)
    badges_data = []
    try:
        student_badges = StudentBadge.query.filter_by(student_id=student.id).all()
        for sb in student_badges:
            badge = Badge.query.get(sb.badge_id)
            if badge:
                badges_data.append({
                    'id': badge.id,
                    'name': badge.name,
                    'description': badge.description or '',
                    'icon': badge.icon or '',
                    'earned_at': sb.earned_at.isoformat() if sb.earned_at else None
                })
    except Exception:
        pass

    # Récupérer l'inventaire d'objets (safe)
    items_data = []
    try:
        student_items = StudentItem.query.filter_by(student_id=student.id).all()
        items_data = [si.to_dict() for si in student_items]
    except Exception:
        pass

    # Stats, skills, evolutions (safe)
    try:
        stats = {
            'force': getattr(rpg_profile, 'stat_force', 5) or 5,
            'defense': getattr(rpg_profile, 'stat_defense', 5) or 5,
            'defense_magique': getattr(rpg_profile, 'stat_defense_magique', 5) or 5,
            'vie': getattr(rpg_profile, 'stat_vie', 5) or 5,
            'intelligence': getattr(rpg_profile, 'stat_intelligence', 5) or 5,
        }
    except Exception:
        stats = {'force': 5, 'defense': 5, 'defense_magique': 5, 'vie': 5, 'intelligence': 5}

    try:
        all_skills = rpg_profile.get_all_skills()
    except Exception:
        all_skills = []

    try:
        active_skills = rpg_profile.get_active_skills()
    except Exception:
        active_skills = []

    try:
        available_evolutions = rpg_profile.get_available_evolutions()
    except Exception:
        available_evolutions = []

    try:
        evolutions_data = rpg_profile._safe_json_list(rpg_profile.evolutions_json)
    except Exception:
        evolutions_data = []

    try:
        equipment_data = rpg_profile._safe_json_dict(rpg_profile.equipment_json)
    except Exception:
        equipment_data = {}

    try:
        sprite_name = rpg_profile.sprite_name if rpg_profile.avatar_class else None
        sprite_path = rpg_profile.sprite_path if rpg_profile.avatar_class else None
    except Exception:
        sprite_name = rpg_profile.avatar_class
        sprite_path = f"img/chihuahua/{rpg_profile.avatar_class or 'guerrier'}.png"

    return jsonify({
        'rpg_profile': {
            'student_id': student.id,
            'student_name': f'{student.first_name} {student.last_name}',
            'xp_total': rpg_profile.xp_total,
            'level': level,
            'xp_for_next_level': xp_for_next_level,
            'xp_progress': xp_progress,
            'gold': rpg_profile.gold,
            'avatar_class': rpg_profile.avatar_class,
            'sprite_name': sprite_name,
            'sprite_path': sprite_path,
            'stats': stats,
            'evolutions': evolutions_data,
            'available_evolutions': available_evolutions,
            'skills': all_skills,
            'active_skills': active_skills,
            'equipment': equipment_data,
            'badges': badges_data,
            'items': items_data,
        },
        'class_descriptions': CLASS_DESCRIPTIONS,
    })


@api_bp.route('/student/rpg/avatar', methods=['POST'])
@jwt_required(user_type='student')
def student_update_avatar():
    """Mettre à jour la classe d'avatar de l'élève (reset si changement)."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    data = request.get_json(silent=True) or {}
    avatar_class = (data.get('avatar_class') or data.get('class') or '').strip()
    confirm_reset = data.get('confirm_reset', False)

    if not avatar_class:
        return jsonify({'error': 'Classe d\'avatar requise'}), 400

    valid_classes = ['guerrier', 'mage', 'archer', 'guerisseur']
    if avatar_class not in valid_classes:
        return jsonify({'error': f'Classe d\'avatar invalide. Valides: {", ".join(valid_classes)}'}), 400

    from models.rpg import StudentRPGProfile, CLASS_BASE_STATS

    rpg_profile = StudentRPGProfile.query.filter_by(student_id=student.id).first()

    if not rpg_profile:
        rpg_profile = StudentRPGProfile(
            student_id=student.id,
            xp_total=0,
            gold=0,
            avatar_class=avatar_class
        )
        db.session.add(rpg_profile)
        db.session.flush()
        rpg_profile.recalculate_stats()
    else:
        # Si changement de classe → reset complet (nécessite confirmation)
        if rpg_profile.avatar_class and rpg_profile.avatar_class != avatar_class:
            if not confirm_reset:
                return jsonify({
                    'success': False,
                    'needs_confirmation': True,
                    'message': 'Changer de classe réinitialisera ton niveau à 1, tu perdras tout ton équipement et ton or. Confirme pour continuer.',
                    'current_class': rpg_profile.avatar_class,
                    'new_class': avatar_class,
                })
            # Reset complet
            rpg_profile.reset_for_class_change()

        rpg_profile.avatar_class = avatar_class
        rpg_profile.recalculate_stats()

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Avatar changé en {avatar_class}',
        'avatar_class': rpg_profile.avatar_class,
        'profile': rpg_profile.to_dict(),
    })


@api_bp.route('/student/rpg/class-info', methods=['GET'])
@jwt_required(user_type='student')
def student_rpg_class_info():
    """Obtenir les descriptions détaillées des classes."""
    from models.rpg import CLASS_DESCRIPTIONS, CLASS_BASE_STATS
    return jsonify({'classes': CLASS_DESCRIPTIONS, 'base_stats': CLASS_BASE_STATS})


@api_bp.route('/student/rpg/evolution-tree', methods=['GET'])
@jwt_required(user_type='student')
def student_rpg_evolution_tree():
    """Obtenir l'arbre d'évolution avec les états de déverrouillage."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    from models.rpg import StudentRPGProfile, CLASS_EVOLUTIONS, CLASS_DESCRIPTIONS

    rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()
    if not rpg or not rpg.avatar_class:
        return jsonify({'evolution_tree': {}, 'current_level': 1})

    avatar_class = rpg.avatar_class
    evolution_tree = CLASS_EVOLUTIONS.get(avatar_class, {})
    class_desc = CLASS_DESCRIPTIONS.get(avatar_class, {})

    # Parse des évolutions choisies pour connaître celles qui sont déverrouillées
    chosen_evolutions = rpg.evolutions_json or []
    chosen_evolution_ids = {e.get('evolution_id') for e in chosen_evolutions if isinstance(e, dict)}
    chosen_levels = {e.get('level') for e in chosen_evolutions if isinstance(e, dict)}

    # Construire l'arbre
    tree_data = {
        'base_class': {
            'id': avatar_class,
            'name': class_desc.get('name', avatar_class),
            'subtitle': class_desc.get('subtitle', ''),
            'description': class_desc.get('description', ''),
            'strengths': class_desc.get('strengths', []),
            'weaknesses': class_desc.get('weaknesses', []),
            'playstyle': class_desc.get('playstyle', ''),
            'level': 1,
        },
        'evolution_levels': []
    }

    # Organiser les évolutions par niveau
    for level in sorted(evolution_tree.keys()):
        choices = evolution_tree[level]
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

        tree_data['evolution_levels'].append(level_group)

    return jsonify({
        'evolution_tree': tree_data,
        'current_level': rpg.level,
        'current_class': avatar_class,
    })


@api_bp.route('/student/rpg/evolve', methods=['POST'])
@jwt_required(user_type='student')
def student_rpg_evolve():
    """Choisir une évolution de classe."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    from models.rpg import StudentRPGProfile, CLASS_EVOLUTIONS

    rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()
    if not rpg or not rpg.avatar_class:
        return jsonify({'error': 'Profil RPG non trouvé ou classe non choisie'}), 400

    data = request.get_json(silent=True) or {}
    evolution_id = data.get('evolution_id', '').strip()
    evolution_level = data.get('level')

    if not evolution_id or not evolution_level:
        return jsonify({'error': 'ID d\'évolution et niveau requis'}), 400

    # Vérifier que l'évolution est disponible
    available = rpg.get_available_evolutions()
    valid = False
    for evo_group in available:
        if evo_group['level'] == evolution_level:
            for choice in evo_group['choices']:
                if choice['id'] == evolution_id:
                    valid = True
                    break

    if not valid:
        return jsonify({'error': 'Évolution non disponible'}), 400

    evolutions = rpg.evolutions_json or []
    evolutions.append({'level': evolution_level, 'evolution_id': evolution_id})
    rpg.evolutions_json = evolutions
    rpg.recalculate_stats()

    db.session.commit()
    return jsonify({'success': True, 'profile': rpg.to_dict()})


@api_bp.route('/student/rpg/equip', methods=['POST'])
@jwt_required(user_type='student')
def student_rpg_equip():
    """Équiper un objet."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    from models.rpg import StudentRPGProfile, RPGItem, StudentItem

    rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()
    if not rpg:
        return jsonify({'error': 'Profil RPG non trouvé'}), 400

    data = request.get_json(silent=True) or {}
    item_id = data.get('item_id')
    unequip = data.get('unequip', False)

    if unequip:
        slot = data.get('slot')
        if slot:
            equipment = rpg.equipment_json or {}
            equipment.pop(slot, None)
            rpg.equipment_json = equipment
            rpg.recalculate_stats()
            db.session.commit()
            return jsonify({'success': True, 'profile': rpg.to_dict()})
        return jsonify({'error': 'Slot requis pour déséquiper'}), 400

    if not item_id:
        return jsonify({'error': 'ID d\'objet requis'}), 400

    # Vérifier que l'élève possède l'objet
    student_item = StudentItem.query.filter_by(student_id=student.id, item_id=item_id).first()
    if not student_item:
        return jsonify({'error': 'Objet non possédé'}), 400

    item = RPGItem.query.get(item_id)
    if not item or not item.equip_slot:
        return jsonify({'error': 'Cet objet ne peut pas être équipé'}), 400

    equipment = rpg.equipment_json or {}
    equipment[item.equip_slot] = item_id
    rpg.equipment_json = equipment
    rpg.recalculate_stats()

    db.session.commit()
    return jsonify({'success': True, 'profile': rpg.to_dict()})


@api_bp.route('/student/rpg/skills', methods=['POST'])
@jwt_required(user_type='student')
def student_rpg_skills():
    """Modifier les compétences actives (max 6)."""
    student = _get_current_student()
    if not student:
        return jsonify({'error': 'Élève non trouvé'}), 404

    from models.rpg import StudentRPGProfile

    rpg = StudentRPGProfile.query.filter_by(student_id=student.id).first()
    if not rpg:
        return jsonify({'error': 'Profil RPG non trouvé'}), 400

    data = request.get_json(silent=True) or {}
    skill_ids = data.get('skill_ids', [])

    if len(skill_ids) > 6:
        return jsonify({'error': 'Maximum 6 compétences actives'}), 400

    # Vérifier que toutes les compétences sont débloquées
    all_skills = rpg.get_all_skills()
    all_skill_ids = {s['id'] for s in all_skills}
    for sid in skill_ids:
        if sid not in all_skill_ids:
            return jsonify({'error': f'Compétence {sid} non débloquée'}), 400

    rpg.active_skills_json = skill_ids
    db.session.commit()
    return jsonify({'success': True, 'profile': rpg.to_dict()})
