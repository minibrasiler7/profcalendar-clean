from extensions import db

class InvitationClassroom(db.Model):
    """Classes proposées dans une invitation (permet les invitations multi-classes)"""
    __tablename__ = 'invitation_classrooms'
    
    id = db.Column(db.Integer, primary_key=True)
    invitation_id = db.Column(db.Integer, db.ForeignKey('teacher_invitations.id'), nullable=False)
    target_classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    proposed_class_name = db.Column(db.String(100), nullable=False)
    proposed_subject = db.Column(db.String(100), nullable=False)
    proposed_color = db.Column(db.String(7), nullable=False, default='#4F46E5')
    
    # Relations
    invitation = db.relationship('TeacherInvitation', backref='invitation_classrooms')
    target_classroom = db.relationship('Classroom')
    
    # Index unique pour éviter les doublons de matières pour une même invitation
    __table_args__ = (
        db.UniqueConstraint('invitation_id', 'target_classroom_id', 'proposed_subject', name='unique_invitation_discipline'),
    )
    
    def __repr__(self):
        return f'<InvitationClassroom {self.proposed_class_name} -> {self.target_classroom.name}>'