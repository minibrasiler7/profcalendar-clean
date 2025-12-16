from flask import Blueprint, request, jsonify
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
            return jsonify({'success': False, 'message': 'Aucun fichier spécifié'}), 400
        
        if not selected_students_json:
            return jsonify({'success': False, 'message': 'Aucun élève sélectionné'}), 400
        
        # Parser la liste des élèves
        import json
        try:
            selected_students = json.loads(selected_students_json)
        except json.JSONDecodeError:
            return jsonify({'success': False, 'message': 'Format des élèves invalide'}), 400
        
        if not selected_students:
            return jsonify({'success': False, 'message': 'Aucun élève sélectionné'}), 400
        
        student_ids = [int(student['id']) for student in selected_students]
        print(f"📋 Élèves sélectionnés: {student_ids}")
        print(f"📁 Fichier à partager: ID {file_id}")

        # Récupérer le fichier à partager
        class_file = ClassFile.query.get(int(file_id))
        if not class_file:
            return jsonify({'success': False, 'message': 'Fichier introuvable'}), 404

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
                return jsonify({'success': False, 'message': 'Accès non autorisé à cette classe'}), 403

        # Vérifier que tous les élèves appartiennent à la même classe
        students = Student.query.filter(
            Student.id.in_(student_ids),
            Student.classroom_id == classroom.id
        ).all()

        if len(students) != len(student_ids):
            return jsonify({'success': False, 'message': 'Certains élèves ne sont pas dans cette classe'}), 400
        
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
            'message': f'Document envoyé avec succès à {shares_created} élève(s)',
            'file_id': class_file.id,
            'shares_created': shares_created
        })
        
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi du PDF: {str(e)}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erreur serveur: {str(e)}'}), 500