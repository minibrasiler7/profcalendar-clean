from extensions import db
from datetime import datetime
import math
import random


class StudentRPGProfile(db.Model):
    """Profil RPG d'un élève (avatar chihuahua, XP, or)"""
    __tablename__ = 'student_rpg_profiles'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), unique=True, nullable=False)
    avatar_class = db.Column(db.String(20), nullable=True)  # mage, guerrier, archer, guerisseur (None = pas encore choisi)
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
        items_list = []
        try:
            items_list = [si.to_dict() for si in StudentItem.query.filter_by(student_id=self.student_id).all()]
        except Exception:
            pass
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
            'items': items_list,
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


class RPGItem(db.Model):
    """Définition d'un objet RPG (potion, arme, etc.)"""
    __tablename__ = 'rpg_items'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(300))
    icon = db.Column(db.String(50), default='box')  # FontAwesome icon
    color = db.Column(db.String(7), default='#6b7280')
    category = db.Column(db.String(50))  # potion, arme, bouclier, parchemin, tresor
    rarity = db.Column(db.String(20), default='common')  # common, rare, epic, legendary
    is_active = db.Column(db.Boolean, default=True)

    @property
    def rarity_color(self):
        return {
            'common': '#9ca3af',
            'rare': '#3b82f6',
            'epic': '#a855f7',
            'legendary': '#f59e0b',
        }.get(self.rarity, '#9ca3af')

    @property
    def rarity_label(self):
        return {
            'common': 'Commun',
            'rare': 'Rare',
            'epic': 'Épique',
            'legendary': 'Légendaire',
        }.get(self.rarity, 'Commun')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'icon': self.icon,
            'color': self.color,
            'category': self.category,
            'rarity': self.rarity,
            'rarity_color': self.rarity_color,
            'rarity_label': self.rarity_label,
        }

    def __repr__(self):
        return f'<RPGItem {self.name} ({self.rarity})>'


class StudentItem(db.Model):
    """Objet RPG possédé par un élève"""
    __tablename__ = 'student_items'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('rpg_items.id'), nullable=False)
    quantity = db.Column(db.Integer, default=1)
    obtained_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship('Student', backref=db.backref('student_items', lazy='dynamic'))
    item = db.relationship('RPGItem', backref=db.backref('student_items', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': self.id,
            'item': self.item.to_dict() if self.item else None,
            'quantity': self.quantity,
            'obtained_at': self.obtained_at.isoformat() if self.obtained_at else None,
        }

    def __repr__(self):
        return f'<StudentItem student={self.student_id} item={self.item_id} x{self.quantity}>'


def award_random_item(student_id, score_percentage):
    """Attribuer un objet aléatoire en fonction du score. Retourne l'objet gagné ou None."""
    items = RPGItem.query.filter_by(is_active=True).all()
    if not items:
        return None

    # Pondération par rareté — meilleur score = plus de chance d'objet rare
    weights = {
        'common': 60,
        'rare': 25 + (score_percentage / 10),
        'epic': 10 + (score_percentage / 5),
        'legendary': 5 + (score_percentage / 4),
    }

    weighted_items = []
    for item in items:
        w = weights.get(item.rarity, 10)
        weighted_items.append((item, w))

    chosen = random.choices([i[0] for i in weighted_items],
                            weights=[i[1] for i in weighted_items], k=1)[0]

    # Vérifier si l'élève a déjà cet objet → incrémenter quantity
    existing = StudentItem.query.filter_by(student_id=student_id, item_id=chosen.id).first()
    if existing:
        existing.quantity += 1
    else:
        si = StudentItem(student_id=student_id, item_id=chosen.id)
        db.session.add(si)

    return chosen


DEFAULT_ITEMS = [
    # Potions
    {'name': 'Potion de vie', 'description': 'Restaure l\'énergie du chihuahua', 'icon': 'flask', 'color': '#ef4444', 'category': 'potion', 'rarity': 'common'},
    {'name': 'Potion de mana', 'description': 'Recharge les pouvoirs magiques', 'icon': 'flask', 'color': '#3b82f6', 'category': 'potion', 'rarity': 'common'},
    {'name': 'Potion dorée', 'description': 'Un élixir précieux et brillant', 'icon': 'flask', 'color': '#f59e0b', 'category': 'potion', 'rarity': 'rare'},
    {'name': 'Potion légendaire', 'description': 'La potion ultime des anciens', 'icon': 'flask', 'color': '#a855f7', 'category': 'potion', 'rarity': 'legendary'},
    # Armes
    {'name': 'Épée en bois', 'description': 'Une épée d\'entraînement basique', 'icon': 'gavel', 'color': '#92400e', 'category': 'arme', 'rarity': 'common'},
    {'name': 'Épée en fer', 'description': 'Solide et fiable', 'icon': 'gavel', 'color': '#6b7280', 'category': 'arme', 'rarity': 'common'},
    {'name': 'Épée enchantée', 'description': 'Brille d\'une lumière mystérieuse', 'icon': 'gavel', 'color': '#667eea', 'category': 'arme', 'rarity': 'rare'},
    {'name': 'Excalibur', 'description': 'L\'épée légendaire des rois', 'icon': 'gavel', 'color': '#f59e0b', 'category': 'arme', 'rarity': 'legendary'},
    # Boucliers
    {'name': 'Bouclier en bois', 'description': 'Protection basique mais efficace', 'icon': 'shield-alt', 'color': '#92400e', 'category': 'bouclier', 'rarity': 'common'},
    {'name': 'Bouclier en acier', 'description': 'Résistant aux coups puissants', 'icon': 'shield-alt', 'color': '#6b7280', 'category': 'bouclier', 'rarity': 'rare'},
    {'name': 'Bouclier du dragon', 'description': 'Forgé dans le feu d\'un dragon', 'icon': 'shield-alt', 'color': '#ef4444', 'category': 'bouclier', 'rarity': 'epic'},
    # Parchemins
    {'name': 'Parchemin de sagesse', 'description': 'Contient un savoir ancien', 'icon': 'scroll', 'color': '#d4a574', 'category': 'parchemin', 'rarity': 'common'},
    {'name': 'Parchemin magique', 'description': 'Écrit dans une langue oubliée', 'icon': 'scroll', 'color': '#a855f7', 'category': 'parchemin', 'rarity': 'rare'},
    {'name': 'Parchemin du destin', 'description': 'Révèle les secrets de l\'avenir', 'icon': 'scroll', 'color': '#f59e0b', 'category': 'parchemin', 'rarity': 'epic'},
    # Trésors
    {'name': 'Pièce d\'or', 'description': 'Une pièce brillante', 'icon': 'coins', 'color': '#f59e0b', 'category': 'tresor', 'rarity': 'common'},
    {'name': 'Rubis', 'description': 'Une pierre précieuse rouge sang', 'icon': 'gem', 'color': '#ef4444', 'category': 'tresor', 'rarity': 'rare'},
    {'name': 'Saphir', 'description': 'Un joyau d\'un bleu profond', 'icon': 'gem', 'color': '#3b82f6', 'category': 'tresor', 'rarity': 'rare'},
    {'name': 'Diamant', 'description': 'La gemme la plus rare et précieuse', 'icon': 'gem', 'color': '#e0e7ff', 'category': 'tresor', 'rarity': 'epic'},
    {'name': 'Couronne du roi', 'description': 'La couronne légendaire perdue', 'icon': 'crown', 'color': '#f59e0b', 'category': 'tresor', 'rarity': 'legendary'},
    # Accessoires
    {'name': 'Chapeau de sorcier', 'description': 'Pointu et mystérieux', 'icon': 'hat-wizard', 'color': '#4338ca', 'category': 'accessoire', 'rarity': 'common'},
    {'name': 'Cape d\'invisibilité', 'description': 'Se fondre dans l\'ombre', 'icon': 'user-secret', 'color': '#1e1b4b', 'category': 'accessoire', 'rarity': 'epic'},
    {'name': 'Anneau de pouvoir', 'description': 'Un anneau qui renforce son porteur', 'icon': 'ring', 'color': '#f59e0b', 'category': 'accessoire', 'rarity': 'legendary'},
]
