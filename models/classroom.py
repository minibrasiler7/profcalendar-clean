from extensions import db

class Classroom(db.Model):
    __tablename__ = 'classrooms'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    subject = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(7), nullable=False)  # Format hexadécimal #RRGGBB
    class_group = db.Column(db.String(100))  # Nom de la classe sans la matière (ex: "6A")
    is_class_master = db.Column(db.Boolean, default=False)  # Est maître de classe
    is_temporary = db.Column(db.Boolean, default=False)  # Classe temporaire en attente d'approbation

    # Relations
    schedules = db.relationship('Schedule', backref='classroom', lazy='dynamic', cascade='all, delete-orphan')
    plannings = db.relationship('Planning', backref='classroom', lazy='dynamic', cascade='all, delete-orphan')

    def get_students(self):
        """Récupère les élèves de la classe (normale ou groupe mixte).

        Cas « classe à plusieurs disciplines » : une même classe (ex. 9VP2)
        enseignée dans deux matières est stockée comme PLUSIEURS Classroom
        (même class_group/nom, sujets différents) qui PARTAGENT une seule liste
        d'élèves. Les élèves ne sont saisis que sur une des classes du groupe
        (la 1re par matière) ; on renvoie donc l'union des élèves de TOUTES les
        classes du groupe, quelle que soit la discipline affichée — sinon la 2e
        discipline montre une liste vide alors que ce sont les mêmes élèves.
        """
        if hasattr(self, 'mixed_group') and self.mixed_group:
            # C'est une classe auto-créée pour un groupe mixte
            return self.mixed_group.get_students()

        from models.student import Student
        group_ids = self.get_group_classroom_ids()
        if len(group_ids) > 1:
            return Student.query.filter(Student.classroom_id.in_(group_ids)).all()
        return Student.query.filter_by(classroom_id=self.id).all()

    def get_group_classroom_ids(self):
        """IDs des classes du même GROUPE que celle-ci (même class_group ; à
        défaut même nom) pour cet enseignant — c'est ainsi que deux disciplines
        d'une même classe partagent leur liste d'élèves. Même règle de
        regroupement que la page « Gérer les classes » : `class_group or name`.
        """
        from models.classroom import Classroom
        key = self.class_group or self.name
        return [
            c.id
            for c in Classroom.query.filter_by(user_id=self.user_id).all()
            if (c.class_group or c.name) == key
        ]

    def __repr__(self):
        return f'<Classroom {self.name} - {self.subject}>'
