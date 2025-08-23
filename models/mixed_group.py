from extensions import db
from datetime import datetime

class MixedGroup(db.Model):
    """
    Groupe mixte composé d'élèves de différentes classes.
    Utilisé pour les regroupements inter-classes (groupes de niveaux, options, etc.)
    """
    __tablename__ = 'mixed_groups'

    id = db.Column(db.Integer, primary_key=True)
    
    # Enseignant responsable du groupe
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Classe auto-créée pour faciliter la gestion
    auto_classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=True)
    
    # Informations du groupe
    name = db.Column(db.String(100), nullable=False)  # Ex: "Allemand niveau 1", "Maths renforcé"
    description = db.Column(db.Text)  # Description plus détaillée
    subject = db.Column(db.String(100), nullable=False)  # Matière enseignée
    
    # Couleur pour l'affichage dans le planning (optionnel)
    color = db.Column(db.String(7), default='#4a90e2')  # Code couleur hex
    
    # Statut du groupe
    is_active = db.Column(db.Boolean, default=True)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    teacher = db.relationship('User', backref=db.backref('mixed_groups', lazy='dynamic'))
    auto_classroom = db.relationship('Classroom', backref=db.backref('mixed_groups_list', uselist=True))
    
    def __repr__(self):
        return f'<MixedGroup {self.name} - {self.subject}>'
    
    def get_students(self):
        """Retourne tous les élèves de ce groupe mixte qui sont approuvés"""
        from models.student import Student
        from models.teacher_invitation import TeacherInvitation
        print(f"DEBUG: get_students called for mixed group {self.id} ({self.name}) created by teacher {self.teacher_id}")
        
        # NOUVELLE APPROCHE SIMPLIFIÉE:
        # Si l'élève est dans MixedGroupStudent ET is_active=True, il doit être inclus
        # car il a été ajouté soit :
        # 1. Directement par le créateur (ses propres élèves)
        # 2. Via code d'accès (collaboration active)
        # 3. Via invitation acceptée (ajouté automatiquement après acceptation)
        
        # Debug: Vérifier les liens mixed_group_students
        student_links = MixedGroupStudent.query.filter_by(
            mixed_group_id=self.id,
            is_active=True
        ).all()
        print(f"DEBUG: Found {len(student_links)} active student links for mixed group {self.id}")
        
        # Debug: Vérifier les invitations liées à ce groupe
        invitations = TeacherInvitation.query.filter_by(
            requesting_teacher_id=self.teacher_id,
            proposed_class_name=self.name
        ).all()
        print(f"DEBUG: Found {len(invitations)} invitations for mixed group '{self.name}':")
        for inv in invitations:
            print(f"  - Teacher {inv.target_master_teacher_id}, classroom {inv.target_classroom_id}, status: {inv.status}")
        
        approved_students = []
        for link in student_links:
            student = Student.query.get(link.student_id)
            if not student:
                print(f"DEBUG: Student with ID {link.student_id} not found in database")
                continue
                
            student_classroom = student.classroom
            if not student_classroom:
                # Élève sans classe - inclure quand même
                approved_students.append(student)
                print(f"DEBUG: Student {student.id} ({student.first_name} {student.last_name}) - no classroom, included")
                continue
            
            # NOUVELLE LOGIQUE: Si l'élève est dans MixedGroupStudent avec is_active=True,
            # cela signifie qu'il a été approuvé d'une manière ou d'une autre
            
            # Vérifier d'où vient l'élève pour le debug
            if student_classroom.user_id == self.teacher_id:
                approved_students.append(student)
                print(f"DEBUG: Student {student.id} ({student.first_name} {student.last_name}) - from creator's own class, included")
                continue
            
            # Vérifier si c'est via invitation acceptée
            invitation = TeacherInvitation.query.filter_by(
                requesting_teacher_id=self.teacher_id,
                target_classroom_id=student_classroom.id,
                status='accepted'
            ).first()
            
            if invitation:
                approved_students.append(student)
                print(f"DEBUG: Student {student.id} ({student.first_name} {student.last_name}) - from accepted invitation, included")
                continue
            
            # Vérifier si c'est via collaboration code d'accès
            from models.class_collaboration import TeacherCollaboration, SharedClassroom
            
            # L'élève peut être dans une classe dérivée ou originale
            shared_classroom_derived = SharedClassroom.query.filter_by(
                derived_classroom_id=student_classroom.id
            ).first()
            
            shared_classroom_original = SharedClassroom.query.filter_by(
                original_classroom_id=student_classroom.id
            ).first()
            
            collaboration_found = False
            
            if shared_classroom_derived:
                collaboration = TeacherCollaboration.query.filter_by(
                    id=shared_classroom_derived.collaboration_id,
                    specialized_teacher_id=self.teacher_id,
                    is_active=True
                ).first()
                if collaboration:
                    collaboration_found = True
                    print(f"DEBUG: Student {student.id} ({student.first_name} {student.last_name}) - from code access (derived class), included")
            
            if not collaboration_found and shared_classroom_original:
                collaboration = TeacherCollaboration.query.filter_by(
                    id=shared_classroom_original.collaboration_id,
                    specialized_teacher_id=self.teacher_id,
                    is_active=True
                ).first()
                if collaboration:
                    collaboration_found = True
                    print(f"DEBUG: Student {student.id} ({student.first_name} {student.last_name}) - from code access (original class), included")
            
            if collaboration_found:
                approved_students.append(student)
                continue
            
            # Si on arrive ici, l'élève est dans MixedGroupStudent mais on ne comprend pas pourquoi
            # Inclure quand même car is_active=True signifie qu'il a été approuvé
            approved_students.append(student)
            print(f"DEBUG: Student {student.id} ({student.first_name} {student.last_name}) - in mixed group but source unclear, included anyway")
        
        print(f"DEBUG: Final filtered result: {len(approved_students)} approved students")
        return approved_students
    
    def get_students_by_classroom(self):
        """Retourne les élèves groupés par classe d'origine"""
        students = self.get_students()
        by_classroom = {}
        
        for student in students:
            classroom_name = student.classroom.name if student.classroom else 'Sans classe'
            if classroom_name not in by_classroom:
                by_classroom[classroom_name] = []
            by_classroom[classroom_name].append(student)
        
        return by_classroom
    
    def get_student_count(self):
        """Retourne le nombre d'élèves dans ce groupe"""
        return MixedGroupStudent.query.filter_by(
            mixed_group_id=self.id,
            is_active=True
        ).count()
    
    def get_classrooms_involved(self):
        """Retourne la liste des classes impliquées dans ce groupe"""
        from models.classroom import Classroom
        from models.student import Student
        
        # Récupérer les IDs des classes des élèves de ce groupe
        classroom_ids = db.session.query(Student.classroom_id).join(
            MixedGroupStudent, Student.id == MixedGroupStudent.student_id
        ).filter(
            MixedGroupStudent.mixed_group_id == self.id,
            MixedGroupStudent.is_active == True,
            Student.classroom_id.isnot(None)
        ).distinct().all()
        
        # Extraire les IDs et récupérer les objets Classroom
        ids = [classroom_id[0] for classroom_id in classroom_ids if classroom_id[0] is not None]
        
        if not ids:
            return []
            
        return Classroom.query.filter(Classroom.id.in_(ids)).all()


class MixedGroupStudent(db.Model):
    """
    Table de liaison entre les groupes mixtes et les élèves
    """
    __tablename__ = 'mixed_group_students'

    id = db.Column(db.Integer, primary_key=True)
    
    # Relations
    mixed_group_id = db.Column(db.Integer, db.ForeignKey('mixed_groups.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    
    # Statut de participation
    is_active = db.Column(db.Boolean, default=True)
    
    # Dates de participation (optionnel pour gérer les changements en cours d'année)
    start_date = db.Column(db.Date)  # Date de début de participation
    end_date = db.Column(db.Date)    # Date de fin de participation (null = toujours actif)
    
    # Notes spécifiques à ce groupe (niveau, remarques)
    notes = db.Column(db.Text)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    mixed_group = db.relationship('MixedGroup', backref=db.backref('student_links', lazy='dynamic'))
    student = db.relationship('Student', backref=db.backref('mixed_group_links', lazy='dynamic'))
    
    # Contraintes
    __table_args__ = (
        db.UniqueConstraint('mixed_group_id', 'student_id', name='_mixed_group_student_uc'),
    )
    
    def __repr__(self):
        return f'<MixedGroupStudent Group:{self.mixed_group_id} Student:{self.student_id}>'
    
    def is_active_on_date(self, check_date):
        """Vérifie si l'élève est actif dans le groupe à une date donnée"""
        if not self.is_active:
            return False
        
        if self.start_date and check_date < self.start_date:
            return False
        
        if self.end_date and check_date > self.end_date:
            return False
        
        return True