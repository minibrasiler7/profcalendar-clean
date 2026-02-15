from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from extensions import db
from models.evaluation import Evaluation, EvaluationGrade
from models.classroom import Classroom
from models.student import Student
from datetime import datetime

def user_can_access_classroom(user_id, classroom_id):
    """Vérifie si un utilisateur peut accéder à une classe (directement ou via collaboration)"""
    try:
        classroom_id = int(classroom_id)
    except (TypeError, ValueError):
        return False

    classroom = Classroom.query.filter_by(id=classroom_id).first()
    if not classroom:
        print(f"DEBUG user_can_access_classroom: classroom {classroom_id} not found")
        return False
    
    print(f"DEBUG user_can_access_classroom: classroom owner is user {classroom.user_id}")
    
    # 1. Vérifier si c'est sa propre classe
    if classroom.user_id == user_id:
        print(f"DEBUG user_can_access_classroom: user {user_id} owns classroom {classroom_id}")
        return True
    
    # 2. Vérifier si c'est une classe dérivée et l'utilisateur est maître de classe
    from models.class_collaboration import SharedClassroom, ClassMaster, TeacherCollaboration
    shared_classroom = SharedClassroom.query.filter_by(derived_classroom_id=classroom_id).first()
    
    print(f"DEBUG user_can_access_classroom: shared_classroom found: {shared_classroom is not None}")
    
    if shared_classroom:
        # Vérifier si l'utilisateur actuel est maître de la classe originale
        class_master = ClassMaster.query.filter_by(
            classroom_id=shared_classroom.original_classroom_id,
            master_teacher_id=user_id
        ).first()
        
        print(f"DEBUG user_can_access_classroom: class_master found: {class_master is not None}")
        
        if class_master:
            print(f"DEBUG user_can_access_classroom: user {user_id} is master of original classroom")
            return True
    
    # 3. Vérifier si l'utilisateur est enseignant spécialisé avec accès à cette classe originale
    # Chercher si l'utilisateur a une collaboration active donnant accès à la classe originale de classroom_id
    collaborations = TeacherCollaboration.query.filter_by(
        specialized_teacher_id=user_id,
        is_active=True
    ).all()
    
    print(f"DEBUG user_can_access_classroom: found {len(collaborations)} active collaborations for specialized teacher {user_id}")
    
    for collaboration in collaborations:
        shared_classrooms = SharedClassroom.query.filter_by(
            collaboration_id=collaboration.id
        ).all()
        
        for shared_classroom in shared_classrooms:
            print(f"DEBUG user_can_access_classroom: checking shared classroom - original: {shared_classroom.original_classroom_id}, derived: {shared_classroom.derived_classroom_id}")
            if shared_classroom.original_classroom_id == classroom_id:
                print(f"DEBUG user_can_access_classroom: specialized teacher {user_id} has access to original classroom {classroom_id}")
                return True
    
    # 4. Vérifier si l'utilisateur est maître et cette classe appartient à un enseignant spécialisé dans son groupe
    master_classes = ClassMaster.query.filter_by(master_teacher_id=user_id).all()
    
    print(f"DEBUG user_can_access_classroom: user {user_id} is master of {len(master_classes)} classes")
    
    for master_class in master_classes:
        # Vérifier s'il y a des classes dérivées pour ce maître
        collaborations = TeacherCollaboration.query.filter_by(
            master_teacher_id=user_id,
            is_active=True
        ).all()
        
        for collaboration in collaborations:
            shared_classrooms = SharedClassroom.query.filter_by(
                collaboration_id=collaboration.id,
                derived_classroom_id=classroom_id
            ).all()
            
            if shared_classrooms:
                print(f"DEBUG user_can_access_classroom: master {user_id} has access to derived classroom {classroom_id}")
                return True
    
    print(f"DEBUG user_can_access_classroom: user {user_id} has NO access to classroom {classroom_id}")
    return False

evaluations_bp = Blueprint('evaluations', __name__, url_prefix='/api/evaluations')

@evaluations_bp.route('/classroom/<int:classroom_id>')
@login_required
def get_classroom_evaluations(classroom_id):
    """Récupérer toutes les évaluations d'une classe"""
    try:
        # Vérifier que la classe est accessible par l'utilisateur
        if not user_can_access_classroom(current_user.id, classroom_id):
            return jsonify({'success': False, 'message': 'Classe introuvable ou accès non autorisé'}), 404
        
        # Récupérer toutes les évaluations avec leurs notes
        evaluations = Evaluation.query.filter_by(classroom_id=classroom_id).order_by(Evaluation.date.desc()).all()
        print(f"DEBUG: Found {len(evaluations)} evaluations for classroom {classroom_id}")
        
        evaluations_data = []
        ta_groups = set()
        
        for evaluation in evaluations:
            # Récupérer les notes de cette évaluation
            grades = EvaluationGrade.query.filter_by(evaluation_id=evaluation.id).all()
            grades_data = []
            
            for grade in grades:
                grades_data.append({
                    'student_id': grade.student_id,
                    'points': grade.points
                })
            
            evaluation_data = {
                'id': evaluation.id,
                'title': evaluation.title,
                'type': evaluation.type,
                'ta_group_name': evaluation.ta_group_name,
                'date': evaluation.date.isoformat() if evaluation.date else None,
                'max_points': evaluation.max_points,
                'min_points': evaluation.min_points,
                'grades': grades_data,
                'average': evaluation.get_average()
            }
            
            evaluations_data.append(evaluation_data)
            
            # Collecter les groupes TA
            if evaluation.ta_group_name:
                ta_groups.add(evaluation.ta_group_name)
        
        return jsonify({
            'success': True,
            'evaluations': evaluations_data,
            'ta_groups': list(ta_groups)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erreur: {str(e)}'}), 500

@evaluations_bp.route('/create', methods=['POST'])
@login_required
def create_evaluation():
    """Créer une nouvelle évaluation avec ses notes"""
    try:
        data = request.get_json()
        
        classroom_id = data.get('classroom_id')
        title = data.get('title', '').strip()
        date_str = data.get('date')
        max_points = data.get('max_points')
        min_points = data.get('min_points', 0)
        eval_type = data.get('type')
        ta_group_name = data.get('ta_group_name', '').strip() if data.get('ta_group_name') else None
        grades_data = data.get('grades', [])

        # Cast classroom_id to int (envoyé comme string depuis le frontend)
        if classroom_id is not None:
            try:
                classroom_id = int(classroom_id)
            except (TypeError, ValueError):
                return jsonify({'success': False, 'message': 'ID de classe invalide'}), 400

        # Validation
        if not all([classroom_id, title, date_str, max_points, eval_type]):
            return jsonify({'success': False, 'message': 'Paramètres manquants'}), 400
        
        if eval_type not in ['significatif', 'ta']:
            return jsonify({'success': False, 'message': 'Type d\'évaluation invalide'}), 400
        
        if eval_type == 'ta' and not ta_group_name:
            return jsonify({'success': False, 'message': 'Nom du groupe TA requis'}), 400
        
        # Vérifier que la classe appartient à l'utilisateur
        classroom = Classroom.query.filter_by(
            id=classroom_id,
            user_id=current_user.id
        ).first()
        
        if not classroom:
            return jsonify({'success': False, 'message': 'Classe introuvable'}), 404
        
        # Convertir la date
        try:
            date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'success': False, 'message': 'Format de date invalide'}), 400
        
        # Créer l'évaluation
        evaluation = Evaluation(
            classroom_id=classroom_id,
            title=title,
            type=eval_type,
            ta_group_name=ta_group_name,
            date=date,
            max_points=float(max_points),
            min_points=float(min_points)
        )
        
        db.session.add(evaluation)
        db.session.flush()  # Pour obtenir l'ID
        
        # Créer les notes
        print(f"DEBUG: Creating evaluation for classroom {classroom_id} by user {current_user.id}")
        print(f"DEBUG: Received {len(grades_data)} grades to process")
        
        for grade_data in grades_data:
            student_id = grade_data.get('student_id')
            points = grade_data.get('points')
            
            print(f"DEBUG: Processing grade for student {student_id} with points {points}")
            
            if student_id and points is not None:
                # Vérifier que l'élève est accessible par l'utilisateur (direct ou via collaboration)
                student = None
                
                # D'abord, vérifier si l'élève appartient directement à une classe de l'utilisateur
                student = Student.query.join(Classroom).filter(
                    Student.id == student_id,
                    Classroom.class_group == classroom.class_group,
                    Classroom.user_id == current_user.id
                ).first()
                
                # Si pas trouvé directement, vérifier via les collaborations (enseignant spécialisé)
                if not student:
                    from models.class_collaboration import SharedClassroom, TeacherCollaboration
                    
                    # Vérifier si c'est une classe dérivée (enseignant spécialisé)
                    shared_classroom = SharedClassroom.query.filter_by(
                        derived_classroom_id=classroom.id
                    ).first()
                    
                    if shared_classroom:
                        # Vérifier que l'utilisateur actuel est bien l'enseignant spécialisé de cette collaboration
                        collaboration = TeacherCollaboration.query.filter_by(
                            id=shared_classroom.collaboration_id,
                            specialized_teacher_id=current_user.id,
                            is_active=True
                        ).first()
                        
                        if collaboration:
                            # L'élève doit être dans la classe originale du maître de classe
                            student = Student.query.filter_by(
                                id=student_id,
                                classroom_id=shared_classroom.original_classroom_id
                            ).first()
                
                if student:
                    print(f"DEBUG: Student {student_id} found, creating grade with points {points}")
                    grade = EvaluationGrade(
                        evaluation_id=evaluation.id,
                        student_id=student_id,
                        points=float(points)
                    )
                    db.session.add(grade)
                else:
                    print(f"DEBUG: Student {student_id} NOT FOUND - skipping grade creation")
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Évaluation créée avec succès',
            'evaluation': {
                'id': evaluation.id,
                'title': evaluation.title,
                'type': evaluation.type,
                'ta_group_name': evaluation.ta_group_name
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erreur: {str(e)}'}), 500

@evaluations_bp.route('/<int:evaluation_id>')
@login_required
def get_evaluation(evaluation_id):
    """Récupérer une évaluation spécifique"""
    try:
        # Vérifier que l'évaluation appartient à une classe accessible
        evaluation = Evaluation.query.filter_by(id=evaluation_id).first()
        
        if not evaluation or not user_can_access_classroom(current_user.id, evaluation.classroom_id):
            return jsonify({'success': False, 'message': 'Évaluation introuvable'}), 404
        
        # Récupérer les notes
        grades = EvaluationGrade.query.filter_by(evaluation_id=evaluation_id).all()
        grades_data = []
        
        for grade in grades:
            grades_data.append({
                'student_id': grade.student_id,
                'points': grade.points,
                'percentage': grade.get_percentage(),
                'note_swiss': grade.get_note_swiss()
            })
        
        evaluation_data = {
            'id': evaluation.id,
            'title': evaluation.title,
            'type': evaluation.type,
            'ta_group_name': evaluation.ta_group_name,
            'date': evaluation.date.isoformat() if evaluation.date else None,
            'max_points': evaluation.max_points,
            'min_points': evaluation.min_points,
            'grades': grades_data,
            'average': evaluation.get_average(),
            'grade_distribution': evaluation.get_grade_distribution()
        }
        
        return jsonify({
            'success': True,
            'evaluation': evaluation_data
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erreur: {str(e)}'}), 500

@evaluations_bp.route('/<int:evaluation_id>', methods=['PUT'])
@login_required
def update_evaluation(evaluation_id):
    """Modifier une évaluation"""
    try:
        # Vérifier que l'évaluation appartient à une classe accessible
        evaluation = Evaluation.query.filter_by(id=evaluation_id).first()
        
        if not evaluation or not user_can_access_classroom(current_user.id, evaluation.classroom_id):
            return jsonify({'success': False, 'message': 'Évaluation introuvable'}), 404
        
        data = request.get_json()
        
        # Mettre à jour les champs
        if 'title' in data:
            evaluation.title = data['title'].strip()
        
        if 'date' in data:
            try:
                evaluation.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'success': False, 'message': 'Format de date invalide'}), 400
        
        if 'max_points' in data:
            evaluation.max_points = float(data['max_points'])
        
        if 'min_points' in data:
            evaluation.min_points = float(data['min_points'])
        
        # Mettre à jour les notes si fournies
        if 'grades' in data:
            # Supprimer les anciennes notes
            EvaluationGrade.query.filter_by(evaluation_id=evaluation_id).delete()
            
            # Créer les nouvelles notes
            classroom = evaluation.classroom  # Récupérer la classe de l'évaluation
            for grade_data in data['grades']:
                student_id = grade_data.get('student_id')
                points = grade_data.get('points')
                
                if student_id and points is not None:
                    # Vérifier que l'élève est accessible par l'utilisateur (direct ou via collaboration)
                    student = None
                    
                    # D'abord, vérifier si l'élève appartient directement à une classe de l'utilisateur
                    student = Student.query.join(Classroom).filter(
                        Student.id == student_id,
                        Classroom.class_group == classroom.class_group,
                        Classroom.user_id == current_user.id
                    ).first()
                    
                    # Si pas trouvé directement, vérifier via les collaborations (enseignant spécialisé)
                    if not student:
                        from models.class_collaboration import SharedClassroom, TeacherCollaboration
                        
                        # Vérifier si c'est une classe dérivée (enseignant spécialisé)
                        shared_classroom = SharedClassroom.query.filter_by(
                            derived_classroom_id=classroom.id
                        ).first()
                        
                        if shared_classroom:
                            # Vérifier que l'utilisateur actuel est bien l'enseignant spécialisé de cette collaboration
                            collaboration = TeacherCollaboration.query.filter_by(
                                id=shared_classroom.collaboration_id,
                                specialized_teacher_id=current_user.id,
                                is_active=True
                            ).first()
                            
                            if collaboration:
                                # L'élève doit être dans la classe originale du maître de classe
                                student = Student.query.filter_by(
                                    id=student_id,
                                    classroom_id=shared_classroom.original_classroom_id
                                ).first()
                    
                    if student:
                        grade = EvaluationGrade(
                            evaluation_id=evaluation_id,
                            student_id=student_id,
                            points=float(points)
                        )
                        db.session.add(grade)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Évaluation modifiée avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erreur: {str(e)}'}), 500

@evaluations_bp.route('/<int:evaluation_id>', methods=['DELETE'])
@login_required
def delete_evaluation(evaluation_id):
    """Supprimer une évaluation"""
    try:
        # Vérifier que l'évaluation appartient à une classe accessible
        evaluation = Evaluation.query.filter_by(id=evaluation_id).first()
        
        if not evaluation or not user_can_access_classroom(current_user.id, evaluation.classroom_id):
            return jsonify({'success': False, 'message': 'Évaluation introuvable'}), 404
        
        # Supprimer l'évaluation (les notes seront supprimées automatiquement via cascade)
        db.session.delete(evaluation)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Évaluation supprimée avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erreur: {str(e)}'}), 500