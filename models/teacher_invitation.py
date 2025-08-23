from extensions import db
from datetime import datetime, timedelta
import secrets
import string

class TeacherInvitation(db.Model):
    """Invitations envoyées par les enseignants spécialisés aux maîtres de classe"""
    __tablename__ = 'teacher_invitations'
    
    id = db.Column(db.Integer, primary_key=True)
    requesting_teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    target_master_teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    target_classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)  # Classe du maître à rejoindre
    proposed_class_name = db.Column(db.String(100), nullable=False)  # Nom de classe proposé par l'enseignant
    proposed_subject = db.Column(db.String(100), nullable=False)  # Matière proposée
    proposed_color = db.Column(db.String(7), nullable=False, default='#4F46E5')  # Couleur proposée
    message = db.Column(db.Text)  # Message optionnel de l'enseignant
    selected_student_ids = db.Column(db.Text)  # IDs des élèves sélectionnés (JSON string)
    status = db.Column(db.String(20), default='pending')  # pending, accepted, rejected, expired
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, default=lambda: datetime.utcnow() + timedelta(days=30))
    responded_at = db.Column(db.DateTime)
    response_message = db.Column(db.Text)  # Message de réponse du maître
    
    # Relations
    requesting_teacher = db.relationship('User', foreign_keys=[requesting_teacher_id], backref='sent_invitations')
    target_master_teacher = db.relationship('User', foreign_keys=[target_master_teacher_id], backref='received_invitations')
    target_classroom = db.relationship('Classroom', foreign_keys=[target_classroom_id])
    
    # Index unique pour éviter les invitations en double (une seule invitation 'pending' par paire de teachers)
    __table_args__ = (
        db.Index('idx_pending_invitations', 'requesting_teacher_id', 'target_master_teacher_id', 'status'),
    )
    
    def is_valid(self):
        """Vérifie si l'invitation est encore valide"""
        return (self.status == 'pending' and 
                self.expires_at > datetime.utcnow())
    
    def accept(self, response_message=None):
        """Accepte l'invitation"""
        self.status = 'accepted'
        self.responded_at = datetime.utcnow()
        if response_message:
            self.response_message = response_message
        
        # Si c'est une invitation pour classe mixte, ajouter les élèves
        if self.proposed_subject == "Classe mixte":
            self._add_students_to_mixed_class()
        
        db.session.commit()
    
    def _add_students_to_mixed_class(self):
        """Ajoute les élèves sélectionnés à la classe mixte après acceptation d'invitation"""
        try:
            from models.mixed_group import MixedGroup, MixedGroupStudent
            from models.student import Student
            import json
            
            # Trouver la classe mixte créée par le demandeur avec ce nom
            mixed_group = MixedGroup.query.filter_by(
                teacher_id=self.requesting_teacher_id,
                name=self.proposed_class_name
            ).first()
            
            if not mixed_group:
                print(f"DEBUG: No mixed group found with name '{self.proposed_class_name}' for teacher {self.requesting_teacher_id}")
                return
            
            # Récupérer les IDs des élèves sélectionnés depuis l'invitation
            selected_student_ids = []
            if self.selected_student_ids:
                try:
                    selected_student_ids = json.loads(self.selected_student_ids)
                    print(f"DEBUG: Found {len(selected_student_ids)} selected students in invitation: {selected_student_ids}")
                except json.JSONDecodeError:
                    print(f"DEBUG: Failed to parse selected_student_ids: {self.selected_student_ids}")
                    return
            else:
                print("DEBUG: No selected students found in invitation - falling back to all students")
                # Fallback: si pas d'élèves sélectionnés stockés, prendre tous les élèves (comportement ancien)
                target_students = Student.query.filter_by(classroom_id=self.target_classroom_id).all()
                selected_student_ids = [s.id for s in target_students]
            
            # Ajouter seulement les élèves sélectionnés
            added_count = 0
            for student_id in selected_student_ids:
                student = Student.query.get(student_id)
                if not student:
                    print(f"DEBUG: Student with ID {student_id} not found")
                    continue
                    
                # Vérifier si l'élève n'est pas déjà dans le groupe mixte
                existing_link = MixedGroupStudent.query.filter_by(
                    mixed_group_id=mixed_group.id,
                    student_id=student.id
                ).first()
                
                if not existing_link:
                    # Ajouter l'élève au groupe mixte
                    mixed_student = MixedGroupStudent(
                        mixed_group_id=mixed_group.id,
                        student_id=student.id
                    )
                    db.session.add(mixed_student)
                    added_count += 1
                    print(f"DEBUG: Added student {student.id} ({student.first_name} {student.last_name}) to mixed group")
                    
                    # Copier l'élève dans la classe auto-créée
                    if mixed_group.auto_classroom:
                        auto_student = Student(
                            classroom_id=mixed_group.auto_classroom.id,
                            user_id=mixed_group.teacher_id,
                            first_name=student.first_name,
                            last_name=student.last_name,
                            email=student.email,
                            date_of_birth=student.date_of_birth,
                            parent_email_mother=student.parent_email_mother,
                            parent_email_father=student.parent_email_father,
                            additional_info=student.additional_info
                        )
                        db.session.add(auto_student)
                else:
                    print(f"DEBUG: Student {student.id} ({student.first_name} {student.last_name}) already in mixed group")
            
            print(f"DEBUG: Added {added_count} selected students to mixed group '{mixed_group.name}' after invitation acceptance")
            
        except Exception as e:
            print(f"ERROR: Failed to add students to mixed class: {str(e)}")
            # Ne pas faire rollback ici car on est dans une transaction plus large
    
    def reject(self, response_message=None):
        """Rejette l'invitation"""
        self.status = 'rejected'
        self.responded_at = datetime.utcnow()
        if response_message:
            self.response_message = response_message
        db.session.commit()
    
    def expire(self):
        """Marque l'invitation comme expirée"""
        if self.status == 'pending':
            self.status = 'expired'
            db.session.commit()
    
    def __repr__(self):
        return f'<TeacherInvitation {self.requesting_teacher.username} -> {self.target_master_teacher.username}>'