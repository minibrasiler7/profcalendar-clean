from extensions import db
from datetime import datetime
import math


class StudentRPGProfile(db.Model):
    """Profil RPG d'un élève (avatar chihuahua, XP, or)"""
    __tablename__ = 'student_rpg_profiles'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), unique=True, nullable=False)
    avatar_class = db.Column(db.String(20), default='guerrier')  # mage, guerrier, archer, guerisseur
    avatar_accessories_json = db.Column(db.JSON, default=dict)
    # Ex: {"hat": "wizard_hat", "weapon": "staff", "armor": "robe"}
    xp_total = db.Column(db.Integer, default=0)
    level = db.Column(db.Integer, default=1)
    gold = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    student = db.relationship('Student', backref=db.backref('rpg_profile', uselist=False))
    badges = db.relationship('StudentBadge', backref='profile', lazy='dynamic',
                             cascade='all, delete-orphan',
                             primaryjoin='StudentRPGProfile.student_id == StudentBadge.student_id',
                             foreign_keys='StudentBadge.student_id')

    @staticmethod
    def calculate_level(xp):
        """Calcule le niveau à partir de l'XP total"""
        # Formule : niveau = floor(sqrt(xp / 100)) + 1
        # Niveau 1 = 0 XP, Niveau 2 = 100 XP, Niveau 3 = 400 XP, etc.
        if xp <= 0:
            return 1
        return int(math.floor(math.sqrt(xp / 100))) + 1

    @staticmethod
    def xp_for_level(level):
        """XP nécessaire pour atteindre un niveau donné"""
        if level <= 1:
            return 0
        return ((level - 1) ** 2) * 100

    @property
    def xp_for_next_level(self):
        """XP nécessaire pour le prochain niveau"""
        return self.xp_for_level(self.level + 1)

    @property
    def xp_progress(self):
        """Progression vers le prochain niveau (0-100%)"""
        current_level_xp = self.xp_for_level(self.level)
        next_level_xp = self.xp_for_next_level
        if next_level_xp == current_level_xp:
            return 100
        progress = ((self.xp_total - current_level_xp) / (next_level_xp - current_level_xp)) * 100
        return min(100, max(0, round(progress)))

    def add_xp(self, amount):
        """Ajouter de l'XP et mettre à jour le niveau"""
        self.xp_total += amount
        self.level = self.calculate_level(self.xp_total)

    def add_gold(self, amount):
        """Ajouter de l'or"""
        self.gold += amount

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'avatar_class': self.avatar_class,
            'avatar_accessories': self.avatar_accessories_json,
            'xp_total': self.xp_total,
            'level': self.level,
            'gold': self.gold,
            'xp_for_next_level': self.xp_for_next_level,
            'xp_progress': self.xp_progress,
            'badges': [sb.to_dict() for sb in self.badges] if self.badges else [],
        }

    def __repr__(self):
        return f'<StudentRPGProfile student={self.student_id} level={self.level}>'


class Badge(db.Model):
    """Définition d'un badge"""
    __tablename__ = 'badges'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(300))
    icon = db.Column(db.String(50), default='trophy')  # Nom d'icône FontAwesome
    color = db.Column(db.String(7), default='#FFD700')  # Couleur du badge
    category = db.Column(db.String(50))  # maths, sciences, general, etc.
    condition_type = db.Column(db.String(50))
    # Types: exercises_completed, perfect_scores, subject_exercises, block_type_completed
    condition_value = db.Column(db.Integer, default=1)
    condition_extra = db.Column(db.String(100))  # Ex: subject name, block type
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'icon': self.icon,
            'color': self.color,
            'category': self.category,
        }

    def __repr__(self):
        return f'<Badge {self.name}>'


class StudentBadge(db.Model):
    """Badge obtenu par un élève"""
    __tablename__ = 'student_badges'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    badge_id = db.Column(db.Integer, db.ForeignKey('badges.id'), nullable=False)
    earned_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Unique constraint: un badge par élève
    __table_args__ = (
        db.UniqueConstraint('student_id', 'badge_id', name='uq_student_badge'),
    )

    # Relations
    student = db.relationship('Student', backref=db.backref('student_badges', lazy='dynamic'))
    badge = db.relationship('Badge', backref=db.backref('student_badges', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'badge': self.badge.to_dict() if self.badge else None,
            'earned_at': self.earned_at.isoformat() if self.earned_at else None,
        }

    def __repr__(self):
        return f'<StudentBadge student={self.student_id} badge={self.badge_id}>'


# Badges par défaut à insérer
DEFAULT_BADGES = [
    {
        'name': 'Premier pas',
        'description': 'Compléter ton premier exercice',
        'icon': 'star',
        'color': '#4CAF50',
        'category': 'general',
        'condition_type': 'exercises_completed',
        'condition_value': 1,
    },
    {
        'name': 'Apprenti',
        'description': 'Compléter 5 exercices',
        'icon': 'book',
        'color': '#2196F3',
        'category': 'general',
        'condition_type': 'exercises_completed',
        'condition_value': 5,
    },
    {
        'name': 'Persévérant',
        'description': 'Compléter 10 exercices',
        'icon': 'fire',
        'color': '#FF9800',
        'category': 'general',
        'condition_type': 'exercises_completed',
        'condition_value': 10,
    },
    {
        'name': 'Champion',
        'description': 'Compléter 25 exercices',
        'icon': 'crown',
        'color': '#9C27B0',
        'category': 'general',
        'condition_type': 'exercises_completed',
        'condition_value': 25,
    },
    {
        'name': 'Perfectionniste',
        'description': 'Obtenir 100% sur 3 exercices',
        'icon': 'gem',
        'color': '#E91E63',
        'category': 'general',
        'condition_type': 'perfect_scores',
        'condition_value': 3,
    },
    {
        'name': 'Sans faute',
        'description': 'Obtenir 100% sur 10 exercices',
        'icon': 'diamond',
        'color': '#00BCD4',
        'category': 'general',
        'condition_type': 'perfect_scores',
        'condition_value': 10,
    },
    {
        'name': 'Maître des QCM',
        'description': 'Réussir 10 blocs QCM',
        'icon': 'check-circle',
        'color': '#8BC34A',
        'category': 'general',
        'condition_type': 'block_type_completed',
        'condition_value': 10,
        'condition_extra': 'qcm',
    },
    {
        'name': 'Explorateur des graphiques',
        'description': 'Réussir 5 blocs graphiques',
        'icon': 'chart-line',
        'color': '#3F51B5',
        'category': 'general',
        'condition_type': 'block_type_completed',
        'condition_value': 5,
        'condition_extra': 'graph',
    },
    {
        'name': 'As du tri',
        'description': 'Réussir 5 blocs classement',
        'icon': 'sort',
        'color': '#FF5722',
        'category': 'general',
        'condition_type': 'block_type_completed',
        'condition_value': 5,
        'condition_extra': 'sorting',
    },
    {
        'name': 'Détective visuel',
        'description': 'Réussir 5 blocs image interactive',
        'icon': 'search',
        'color': '#795548',
        'category': 'general',
        'condition_type': 'block_type_completed',
        'condition_value': 5,
        'condition_extra': 'image_position',
    },
]
