from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for
from flask_login import login_required, current_user, logout_user
from extensions import db
from models.user_preferences import UserPreferences
from models.parent import ClassCode
from models.classroom import Classroom
import secrets
import string
import logging

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__, url_prefix='/settings')

@settings_bp.route('/')
@login_required
def index():
    """Page principale des paramètres utilisateur"""
    # Récupérer ou créer les préférences de l'utilisateur
    preferences = UserPreferences.get_or_create_for_user(current_user.id)
    
    return render_template('settings/index.html', preferences=preferences)

@settings_bp.route('/update-accommodations-display', methods=['POST'])
@login_required
def update_accommodations_display():
    """Mettre à jour les préférences d'affichage des aménagements"""
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    show_accommodations = data.get('show_accommodations')
    
    if show_accommodations not in ['none', 'emoji', 'name']:
        return jsonify({'success': False, 'message': 'Valeur invalide'}), 400
    
    try:
        # Récupérer ou créer les préférences
        preferences = UserPreferences.get_or_create_for_user(current_user.id)
        
        # Mettre à jour la préférence
        preferences.show_accommodations = show_accommodations
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Préférences mises à jour avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@settings_bp.route('/class-codes')
@login_required
def class_codes():
    """Gestion des codes de classe pour les parents"""
    # Récupérer tous les codes de classe de l'utilisateur
    codes = ClassCode.query.filter_by(user_id=current_user.id).all()
    
    # Récupérer toutes les classes de l'utilisateur
    classrooms = current_user.classrooms.all()
    
    return render_template('settings/class_codes.html', codes=codes, classrooms=classrooms)

@settings_bp.route('/generate-class-code', methods=['POST'])
@login_required
def generate_class_code():
    """Générer un nouveau code de classe"""
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400
    
    classroom_id = data.get('classroom_id')

    if not classroom_id:
        return jsonify({'success': False, 'message': 'ID de classe requis'}), 400

    try:
        classroom_id = int(classroom_id)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400

    # Vérifier que la classe appartient à l'utilisateur
    classroom = Classroom.query.filter_by(id=classroom_id, user_id=current_user.id).first()
    if not classroom:
        return jsonify({'success': False, 'message': 'Classe non trouvée'}), 404
    
    try:
        # Désactiver les anciens codes pour cette classe
        ClassCode.query.filter_by(classroom_id=classroom_id, user_id=current_user.id).update({
            'is_active': False
        })
        
        # Générer un nouveau code unique
        while True:
            # Génération d'un code de 6 caractères (lettres et chiffres)
            code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
            
            # Vérifier que le code n'existe pas déjà
            existing = ClassCode.query.filter_by(code=code).first()
            if not existing:
                break
        
        # Créer le nouveau code
        new_code = ClassCode(
            classroom_id=classroom_id,
            user_id=current_user.id,
            code=code,
            is_active=True
        )
        
        db.session.add(new_code)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Nouveau code généré avec succès',
            'code': code,
            'classroom_name': classroom.name
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@settings_bp.route('/deactivate-class-code/<int:code_id>', methods=['POST'])
@login_required
def deactivate_class_code(code_id):
    """Désactiver un code de classe"""
    # Vérifier que le code appartient à l'utilisateur
    code = ClassCode.query.filter_by(id=code_id, user_id=current_user.id).first()

    if not code:
        return jsonify({'success': False, 'message': 'Code non trouvé'}), 404

    try:
        code.is_active = False
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Code désactivé avec succès'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@settings_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    """Changer le mot de passe de l'utilisateur"""
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    current_password = data.get('current_password')
    new_password = data.get('new_password')

    if not current_password or not new_password:
        return jsonify({'success': False, 'message': 'Mot de passe actuel et nouveau mot de passe requis'}), 400

    # Vérifier le mot de passe actuel
    if not current_user.check_password(current_password):
        return jsonify({'success': False, 'message': 'Le mot de passe actuel est incorrect'}), 400

    # Vérifier la longueur minimale du nouveau mot de passe
    if len(new_password) < 6:
        return jsonify({'success': False, 'message': 'Le nouveau mot de passe doit contenir au moins 6 caractères'}), 400

    try:
        # Mettre à jour le mot de passe
        current_user.set_password(new_password)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Mot de passe modifié avec succès'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@settings_bp.route('/delete-account', methods=['POST'])
@login_required
def delete_account():
    """
    Supprime le compte utilisateur et toutes ses données.
    Si l'utilisateur est maître de classe, génère d'abord des PDFs de backup
    pour les enseignants spécialisés liés.
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'Aucune donnée reçue'}), 400

    password = data.get('password')
    if not password:
        return jsonify({'success': False, 'message': 'Mot de passe requis pour confirmer la suppression'}), 400

    if not current_user.check_password(password):
        return jsonify({'success': False, 'message': 'Mot de passe incorrect'}), 400

    user_id = current_user.id
    username = current_user.username

    try:
        # ─── 1. Générer les backups PDF pour les enseignants spécialisés ───
        _generate_backup_pdfs_before_deletion(user_id)

        # ─── 2. Supprimer toutes les dépendances utilisateur ───
        _delete_all_user_data(user_id)

        # ─── 3. Supprimer l'utilisateur ───
        from models.user import User
        user = User.query.get(user_id)
        if user:
            db.session.delete(user)

        db.session.commit()

        # ─── 4. Déconnexion ───
        logout_user()

        logger.info(f"Compte supprimé: {username} (ID: {user_id})")

        return jsonify({
            'success': True,
            'message': 'Votre compte a été supprimé avec succès.',
            'redirect': '/auth/login'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur suppression compte {user_id}: {e}")
        return jsonify({'success': False, 'message': f'Erreur lors de la suppression: {str(e)}'}), 500


def _generate_backup_pdfs_before_deletion(user_id):
    """Génère des PDFs de backup pour les enseignants spécialisés liés."""
    from models.class_collaboration import ClassMaster, SharedClassroom
    from models.user import User

    user = User.query.get(user_id)
    if not user:
        return

    master_records = ClassMaster.query.filter_by(master_teacher_id=user_id).all()
    for master_record in master_records:
        shared_records = SharedClassroom.query.filter_by(
            original_classroom_id=master_record.classroom_id
        ).all()
        if shared_records:
            try:
                from services.year_end_archive import generate_and_store_backup_pdfs
                generate_and_store_backup_pdfs(master_record.classroom_id, user)
                logger.info(f"Backup PDFs générés pour classe {master_record.classroom_id}")
            except Exception as e:
                logger.error(f"Erreur génération backup PDFs classe {master_record.classroom_id}: {e}")


def _delete_all_user_data(user_id):
    """Supprime toutes les données liées à un utilisateur (respecte l'ordre des FK)."""
    from models.classroom import Classroom
    from models.student import Student, Grade, StudentFile
    from models.evaluation import Evaluation, EvaluationGrade
    from models.planning import Planning
    from models.schedule import Schedule
    from models.attendance import Attendance
    from models.lesson_memo import LessonMemo, StudentRemark
    from models.sanctions import SanctionTemplate, SanctionThreshold, SanctionOption, ClassroomSanctionImport
    from models.student_sanctions import StudentSanctionCount
    from models.accommodation import AccommodationTemplate, StudentAccommodation
    from models.class_collaboration import (
        ClassMaster, TeacherAccessCode, TeacherCollaboration, SharedClassroom, StudentClassroomLink
    )
    from models.user_preferences import UserPreferences, UserSanctionPreferences
    from models.file_manager import UserFile, FileFolder, FileAnnotation
    from models.parent import ClassCode
    from models.push_token import PushToken
    from models.teacher_invitation import TeacherInvitation
    from models.invitation_classroom import InvitationClassroom
    from models.decoupage import Decoupage
    from models.student_info_history import StudentInfoHistory
    from models.student_group import StudentGroup
    from models.lesson_blank_sheet import LessonBlankSheet
    from models.seating_plan import SeatingPlan
    from services.year_end_cleanup import _delete_classroom_dependencies

    classrooms = Classroom.query.filter_by(user_id=user_id).all()
    classroom_ids = [c.id for c in classrooms]
    students = Student.query.filter_by(user_id=user_id).all()
    student_ids = [s.id for s in students]

    # 1. Aménagements
    if student_ids:
        StudentAccommodation.query.filter(
            StudentAccommodation.student_id.in_(student_ids)
        ).delete(synchronize_session='fetch')
    AccommodationTemplate.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')

    # 2. Sanctions élèves
    if student_ids:
        try:
            from models.sanctions import StudentSanctionRecord
            StudentSanctionRecord.query.filter(
                StudentSanctionRecord.student_id.in_(student_ids)
            ).delete(synchronize_session='fetch')
        except Exception:
            pass
        StudentSanctionCount.query.filter(
            StudentSanctionCount.student_id.in_(student_ids)
        ).delete(synchronize_session='fetch')

    # 3. Imports de sanctions
    if classroom_ids:
        ClassroomSanctionImport.query.filter(
            ClassroomSanctionImport.classroom_id.in_(classroom_ids)
        ).delete(synchronize_session='fetch')

    # 4. Templates de sanctions (thresholds → options)
    for t in SanctionTemplate.query.filter_by(user_id=user_id).all():
        for th in SanctionThreshold.query.filter_by(template_id=t.id).all():
            SanctionOption.query.filter_by(threshold_id=th.id).delete(synchronize_session='fetch')
            db.session.delete(th)
        db.session.delete(t)
    db.session.flush()

    # 5. Remarques et mémos
    StudentRemark.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    LessonMemo.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')

    # 6. Notes (Grade n'a pas de user_id, on supprime via student_ids)
    if student_ids:
        Grade.query.filter(
            Grade.student_id.in_(student_ids)
        ).delete(synchronize_session='fetch')

    # 7. Évaluations
    if classroom_ids:
        eval_ids = [e.id for e in Evaluation.query.filter(
            Evaluation.classroom_id.in_(classroom_ids)).all()]
        if eval_ids:
            EvaluationGrade.query.filter(
                EvaluationGrade.evaluation_id.in_(eval_ids)
            ).delete(synchronize_session='fetch')
            Evaluation.query.filter(Evaluation.id.in_(eval_ids)).delete(synchronize_session='fetch')

    # 8. Présences
    Attendance.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')

    # 9. Fichiers
    StudentFile.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    FileAnnotation.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    UserFile.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    FileFolder.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')

    # 10. Liens élèves-classes
    if student_ids:
        StudentClassroomLink.query.filter(
            StudentClassroomLink.student_id.in_(student_ids)
        ).delete(synchronize_session='fetch')

    # 11. Invitations
    invitations = TeacherInvitation.query.filter(
        (TeacherInvitation.requesting_teacher_id == user_id) |
        (TeacherInvitation.target_master_teacher_id == user_id)
    ).all()
    for inv in invitations:
        InvitationClassroom.query.filter_by(invitation_id=inv.id).delete(synchronize_session='fetch')
        db.session.delete(inv)
    db.session.flush()

    # 12. Collaborations (SharedClassroom AVANT TeacherCollaboration)
    collab_ids = [c.id for c in TeacherCollaboration.query.filter(
        (TeacherCollaboration.specialized_teacher_id == user_id) |
        (TeacherCollaboration.master_teacher_id == user_id)
    ).all()]
    if collab_ids:
        SharedClassroom.query.filter(
            SharedClassroom.collaboration_id.in_(collab_ids)
        ).delete(synchronize_session='fetch')
    TeacherCollaboration.query.filter(
        (TeacherCollaboration.specialized_teacher_id == user_id) |
        (TeacherCollaboration.master_teacher_id == user_id)
    ).delete(synchronize_session='fetch')

    # 13. Classes et dépendances
    for c in classrooms:
        try:
            _delete_classroom_dependencies(c.id)
        except Exception as e:
            logger.warning(f"Erreur nettoyage classe {c.id}: {e}")
        try:
            db.session.delete(c)
        except Exception as e:
            logger.warning(f"Erreur suppression classe {c.id}: {e}")
    db.session.flush()

    # 14. Codes d'accès et ClassMaster
    TeacherAccessCode.query.filter_by(master_teacher_id=user_id).delete(synchronize_session='fetch')
    ClassMaster.query.filter_by(master_teacher_id=user_id).delete(synchronize_session='fetch')

    # 15. Autres données
    ClassCode.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    PushToken.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    Planning.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    Schedule.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    Decoupage.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    StudentInfoHistory.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    StudentGroup.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    LessonBlankSheet.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    SeatingPlan.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')

    # 16. Préférences
    UserSanctionPreferences.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')
    UserSanctionPreferences.query.filter_by(locked_by_user_id=user_id).update(
        {'locked_by_user_id': None, 'is_locked': False}, synchronize_session='fetch')
    UserPreferences.query.filter_by(user_id=user_id).delete(synchronize_session='fetch')

    # 17. Élèves
    if student_ids:
        Student.query.filter(Student.id.in_(student_ids)).delete(synchronize_session='fetch')

    db.session.flush()