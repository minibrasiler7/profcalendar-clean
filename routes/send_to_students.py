from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from extensions import db
from models.student import ClassFile
from models.file_sharing import StudentFileShare
from models.classroom import Classroom
from models.student import Student
from datetime import datetime
import os
import uuid
from werkzeug.utils import secure_filename

send_to_students_bp = Blueprint('send_to_students', __name__, url_prefix='/api')

@send_to_students_bp.route('/send-to-students', methods=['POST'])
@login_required
def send_pdf_to_students():
    """Envoie un PDF annoté aux élèves sélectionnés depuis le lecteur PDF"""
    try:
        print("📧 Début de l'envoi du PDF aux élèves")
        
        # Récupérer les données du formulaire
        pdf_file = request.files.get('pdf_file')
        action = request.form.get('action')
        send_mode = request.form.get('send_mode')
        selected_students_json = request.form.get('selected_students')
        current_class_id = request.form.get('current_class_id')  # ID de classe fourni par le calendrier
        
        if not pdf_file:
            return jsonify({'success': False, 'message': 'Aucun fichier PDF fourni'}), 400
        
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
        print(f"🏫 Classe fournie par le calendrier: {current_class_id}")
        
        # Déterminer la classe à utiliser
        classroom = None
        
        if current_class_id:
            # Utiliser la classe fournie par le calendrier
            # Parser l'ID de classe (peut être "classroom_4" ou "mixed_group_2" ou "4")
            class_id_to_use = current_class_id
            if isinstance(current_class_id, str) and '_' in current_class_id:
                parts = current_class_id.split('_')
                class_id_to_use = int(parts[-1])  # Prendre le dernier élément (l'ID numérique)
            else:
                class_id_to_use = int(current_class_id)
            
            classroom = Classroom.query.get(class_id_to_use)
            print(f"🏫 Classe trouvée depuis l'ID du calendrier: {classroom.name if classroom else 'Non trouvée'}")
        
        if not classroom:
            # Fallback: trouver la classe à partir du premier élève
            first_student = Student.query.get(student_ids[0])
            if not first_student:
                return jsonify({'success': False, 'message': 'Élève introuvable'}), 404
            
            classroom = first_student.classroom
            print(f"🏫 Classe trouvée depuis l'élève: {classroom.name if classroom else 'Non trouvée'}")
        
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe introuvable'}), 404
        
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
        
        # Debug: afficher les informations du fichier reçu
        print(f"📄 Fichier reçu: {pdf_file}")
        print(f"📄 Nom du fichier: {pdf_file.filename}")
        print(f"📄 Type MIME: {pdf_file.content_type}")
        
        # Sauvegarder le fichier PDF
        original_filename = secure_filename(pdf_file.filename)
        if not original_filename or original_filename == '':
            original_filename = 'document_annote.pdf'
        
        # Si le nom du fichier est juste un nombre, essayer de récupérer le vrai nom depuis la DB
        if original_filename.isdigit():
            print(f"🔍 Le nom du fichier est un ID: {original_filename}, recherche du nom réel...")
            try:
                class_file = ClassFile.query.get(int(original_filename))
                if class_file and class_file.original_filename:
                    original_filename = class_file.original_filename
                    print(f"✅ Nom réel trouvé: {original_filename}")
                else:
                    original_filename = 'document_annote.pdf'
            except:
                original_filename = 'document_annote.pdf'
        
        # Pour les fichiers envoyés aux élèves, conserver le nom original mais ajouter un UUID pour éviter les conflits
        name, ext = os.path.splitext(original_filename)
        # Garder le nom original mais ajouter un UUID pour l'unicité dans le système de fichiers
        unique_filename = f"{uuid.uuid4().hex[:8]}_{original_filename}"
        
        # Créer le dossier de destination pour les fichiers partagés avec les élèves
        shared_folder = os.path.join(current_app.root_path, 'uploads', 'student_shared', str(classroom.id))
        os.makedirs(shared_folder, exist_ok=True)
        
        # Chemin complet du fichier
        file_path = os.path.join(shared_folder, unique_filename)
        
        # Sauvegarder le fichier
        pdf_file.save(file_path)
        
        # Calculer la taille du fichier
        file_size = os.path.getsize(file_path)
        
        # Créer l'entrée ClassFile (marqué comme fichier partagé avec les élèves)
        class_file = ClassFile(
            classroom_id=classroom.id,
            filename=unique_filename,
            original_filename=original_filename,  # Conserver le nom original
            file_type='pdf',
            file_size=file_size,
            description=f"Document annoté envoyé aux élèves le {datetime.now().strftime('%d/%m/%Y à %H:%M')}",
            uploaded_at=datetime.utcnow(),
            is_student_shared=True  # Marquer comme fichier partagé aux élèves
        )
        
        db.session.add(class_file)
        db.session.flush()  # Pour obtenir l'ID
        
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
        
        print(f"✅ PDF sauvegardé et partagé avec {shares_created} élève(s)")
        print(f"📁 Fichier physique: {file_path}")
        print(f"📁 Nom dans le système: {unique_filename}")
        print(f"📁 Nom original: {original_filename}")
        print(f"📋 ClassFile ID: {class_file.id}")
        
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