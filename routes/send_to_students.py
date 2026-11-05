from flask import Blueprint, request, jsonify
from flask_babel import gettext as _gettext
from flask_login import login_required, current_user
from extensions import db
from models.class_file import ClassFile
from models.file_sharing import StudentFileShare
from models.classroom import Classroom
from models.student import Student

send_to_students_bp = Blueprint('send_to_students', __name__, url_prefix='/api')

@send_to_students_bp.route('/send-to-students', methods=['POST'])
@login_required
def send_pdf_to_students():
    """Partage un fichier existant avec les élèves sélectionnés"""
    try:
        print("📧 Début du partage du fichier avec les élèves")

        # Récupérer les données du formulaire
        file_id = request.form.get('file_id')  # ID du fichier à partager
        selected_students_json = request.form.get('selected_students')
        current_class_id = request.form.get('current_class_id')  # ID de classe fourni par le calendrier

        if not file_id:
            return jsonify({'success': False, 'message': _gettext('Aucun fichier spécifié')}), 400
        
        if not selected_students_json:
            return jsonify({'success': False, 'message': _gettext('Aucun élève sélectionné')}), 400
        
        # Parser la liste des élèves
        import json
        try:
            selected_students = json.loads(selected_students_json)
        except json.JSONDecodeError:
            return jsonify({'success': False, 'message': _gettext('Format des élèves invalide')}), 400
        
        if not selected_students:
            return jsonify({'success': False, 'message': _gettext('Aucun élève sélectionné')}), 400
        
        student_ids = [int(student['id']) for student in selected_students]
        print(f"📋 Élèves sélectionnés: {student_ids}")
        print(f"📁 Fichier à partager: ID {file_id}")

        # Récupérer le fichier à partager
        class_file = ClassFile.query.get(int(file_id))
        if not class_file:
            return jsonify({'success': False, 'message': _gettext('Fichier introuvable')}), 404

        # Récupérer la classe depuis le fichier
        classroom = class_file.classroom
        print(f"🏫 Classe du fichier: {classroom.name}")

        # Vérifier que l'utilisateur a accès à cette classe
        if classroom.user_id != current_user.id:
            # Vérifier s'il s'agit d'une collaboration (enseignant spécialisé)
            from models.class_collaboration import SharedClassroom, TeacherCollaboration
            shared_classroom = SharedClassroom.query.filter_by(
                derived_classroom_id=classroom.id
            ).first()

            is_authorized = False
            if shared_classroom:
                collaboration = TeacherCollaboration.query.filter_by(
                    id=shared_classroom.collaboration_id,
                    specialized_teacher_id=current_user.id,
                    is_active=True
                ).first()
                if collaboration:
                    is_authorized = True

            if not is_authorized:
                return jsonify({'success': False, 'message': _gettext('Accès non autorisé à cette classe')}), 403

        # Vérifier que tous les élèves appartiennent à la classe ou à une classe liée
        from models.class_collaboration import SharedClassroom

        # Collecter tous les classroom_ids liés (original + dérivés)
        valid_classroom_ids = [classroom.id]
        # Chercher les classes dérivées de cette classe
        derived = SharedClassroom.query.filter_by(original_classroom_id=classroom.id).all()
        for d in derived:
            valid_classroom_ids.append(d.derived_classroom_id)
        # Chercher si cette classe est une dérivée (pour trouver l'originale)
        original = SharedClassroom.query.filter_by(derived_classroom_id=classroom.id).first()
        if original:
            valid_classroom_ids.append(original.original_classroom_id)
            # Et aussi les autres dérivées de la même originale
            siblings = SharedClassroom.query.filter_by(
                original_classroom_id=original.original_classroom_id
            ).all()
            for s in siblings:
                if s.derived_classroom_id not in valid_classroom_ids:
                    valid_classroom_ids.append(s.derived_classroom_id)

        students = Student.query.filter(
            Student.id.in_(student_ids),
            Student.classroom_id.in_(valid_classroom_ids)
        ).all()

        if len(students) != len(student_ids):
            return jsonify({'success': False, 'message': _gettext('Certains élèves ne sont pas dans cette classe')}), 400
        
        # Créer les partages avec les élèves
        shares_created = 0
        message = f"Document annoté envoyé par {current_user.username}"
        
        for student_id in student_ids:
            # Vérifier si le partage existe déjà (peu probable mais sécuritaire)
            existing_share = StudentFileShare.query.filter_by(
                file_id=class_file.id,
                student_id=student_id
            ).first()
            
            if not existing_share:
                new_share = StudentFileShare(
                    file_id=class_file.id,
                    student_id=student_id,
                    shared_by_teacher_id=current_user.id,
                    message=message,
                    is_active=True
                )
                db.session.add(new_share)
                shares_created += 1
        
        db.session.commit()

        print(f"✅ Fichier partagé avec {shares_created} élève(s)")
        print(f"📁 ClassFile ID: {class_file.id}")
        print(f"📁 Nom: {class_file.user_file.original_filename}")
        
        return jsonify({
            'success': True,
            'message': _gettext('Document envoyé avec succès à %(count)s élève(s)', count=shares_created),
            'file_id': class_file.id,
            'shares_created': shares_created
        })
        
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi du PDF: {str(e)}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': _gettext('Erreur serveur: %(error)s', error=str(e))}), 500