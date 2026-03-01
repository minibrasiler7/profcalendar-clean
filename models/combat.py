from extensions import db
from datetime import datetime
import json


# ═══════════════════════════════════════════════════════════════════
#  MONSTER PRESETS — stats de base par type et par niveau
# ═══════════════════════════════════════════════════════════════════

MONSTER_PRESETS = {
    'slime': {
        'name': 'Slime',
        'base_hp': 30, 'base_attack': 5, 'base_defense': 2, 'base_magic_defense': 2,
        'hp_per_level': 8, 'attack_per_level': 2, 'defense_per_level': 1, 'magic_defense_per_level': 1,
        'skills': [
            {'id': 'slime_tackle', 'name': 'Charge gluante', 'type': 'physical', 'damage': 8, 'target': 'single'},
        ],
    },
    'goblin': {
        'name': 'Gobelin',
        'base_hp': 40, 'base_attack': 8, 'base_defense': 3, 'base_magic_defense': 2,
        'hp_per_level': 10, 'attack_per_level': 3, 'defense_per_level': 1, 'magic_defense_per_level': 1,
        'skills': [
            {'id': 'goblin_slash', 'name': 'Coup de lame', 'type': 'physical', 'damage': 10, 'target': 'single'},
            {'id': 'goblin_throw', 'name': 'Lancer de pierre', 'type': 'physical', 'damage': 6, 'target': 'single'},
        ],
    },
    'orc': {
        'name': 'Orc',
        'base_hp': 60, 'base_attack': 10, 'base_defense': 6, 'base_magic_defense': 3,
        'hp_per_level': 15, 'attack_per_level': 4, 'defense_per_level': 2, 'magic_defense_per_level': 1,
        'skills': [
            {'id': 'orc_smash', 'name': 'Écrasement', 'type': 'physical', 'damage': 15, 'target': 'single'},
            {'id': 'orc_roar', 'name': 'Rugissement', 'type': 'buff', 'damage': 0, 'target': 'self'},
        ],
    },
    'skeleton': {
        'name': 'Squelette',
        'base_hp': 35, 'base_attack': 9, 'base_defense': 4, 'base_magic_defense': 5,
        'hp_per_level': 10, 'attack_per_level': 3, 'defense_per_level': 2, 'magic_defense_per_level': 2,
        'skills': [
            {'id': 'skeleton_slash', 'name': 'Coup d\'os', 'type': 'physical', 'damage': 12, 'target': 'single'},
            {'id': 'skeleton_curse', 'name': 'Malédiction', 'type': 'magical', 'damage': 10, 'target': 'single'},
        ],
    },
    'dragon': {
        'name': 'Dragon',
        'base_hp': 120, 'base_attack': 15, 'base_defense': 10, 'base_magic_defense': 8,
        'hp_per_level': 25, 'attack_per_level': 5, 'defense_per_level': 3, 'magic_defense_per_level': 3,
        'skills': [
            {'id': 'dragon_claw', 'name': 'Griffe draconique', 'type': 'physical', 'damage': 20, 'target': 'single'},
            {'id': 'dragon_breath', 'name': 'Souffle de feu', 'type': 'magical', 'damage': 25, 'target': 'all'},
            {'id': 'dragon_tail', 'name': 'Coup de queue', 'type': 'physical', 'damage': 15, 'target': 'single'},
        ],
    },
}

# Configurations de combat prédéfinies par difficulté
DIFFICULTY_CONFIGS = {
    'easy': {
        'monsters': [
            {'type': 'slime', 'count': 3, 'level_offset': -1},
        ],
        'xp_multiplier': 1.0,
        'gold_multiplier': 1.0,
    },
    'medium': {
        'monsters': [
            {'type': 'goblin', 'count': 2, 'level_offset': 0},
            {'type': 'slime', 'count': 2, 'level_offset': 0},
        ],
        'xp_multiplier': 1.5,
        'gold_multiplier': 1.5,
    },
    'hard': {
        'monsters': [
            {'type': 'orc', 'count': 2, 'level_offset': 0},
            {'type': 'skeleton', 'count': 2, 'level_offset': 1},
        ],
        'xp_multiplier': 2.0,
        'gold_multiplier': 2.0,
    },
    'boss': {
        'monsters': [
            {'type': 'dragon', 'count': 1, 'level_offset': 2},
            {'type': 'goblin', 'count': 2, 'level_offset': 0},
        ],
        'xp_multiplier': 3.0,
        'gold_multiplier': 3.0,
    },
}


class CombatSession(db.Model):
    """Session de combat lancée par le prof"""
    __tablename__ = 'combat_sessions'

    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    exercise_id = db.Column(db.Integer, db.ForeignKey('exercises.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    status = db.Column(db.String(20), default='waiting')  # waiting | active | completed
    current_round = db.Column(db.Integer, default=0)
    current_phase = db.Column(db.String(20), default='waiting')  # waiting | question | action | execute | monster_turn | round_end
    difficulty = db.Column(db.String(20), default='medium')

    # Configuration de la carte (grille)
    map_config_json = db.Column(db.JSON, default=dict)

    # Bloc d'exercice courant (pour la question du tour)
    current_block_id = db.Column(db.Integer, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)

    # Relations
    participants = db.relationship('CombatParticipant', backref='session', lazy='dynamic', cascade='all, delete-orphan')
    monsters = db.relationship('CombatMonster', backref='session', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'classroom_id': self.classroom_id,
            'exercise_id': self.exercise_id,
            'teacher_id': self.teacher_id,
            'status': self.status,
            'current_round': self.current_round,
            'current_phase': self.current_phase,
            'difficulty': self.difficulty,
            'map_config': self.map_config_json or {},
            'current_block_id': self.current_block_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'participants': [p.to_dict() for p in self.participants],
            'monsters': [m.to_dict() for m in self.monsters],
        }

    def get_state(self):
        """État complet pour broadcast SocketIO"""
        return {
            'session_id': self.id,
            'status': self.status,
            'current_round': self.current_round,
            'current_phase': self.current_phase,
            'round': self.current_round,
            'phase': self.current_phase,
            'map_config': self.map_config_json or {},
            'participants': [p.to_dict() for p in self.participants],
            'monsters': [m.to_dict() for m in self.monsters if m.is_alive],
            'all_monsters': [m.to_dict() for m in self.monsters],
        }

    def __repr__(self):
        return f'<CombatSession {self.id} status={self.status}>'


class CombatParticipant(db.Model):
    """Un élève dans le combat"""
    __tablename__ = 'combat_participants'

    id = db.Column(db.Integer, primary_key=True)
    combat_session_id = db.Column(db.Integer, db.ForeignKey('combat_sessions.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)

    # Snapshot des stats au début du combat
    snapshot_json = db.Column(db.JSON, default=dict)

    # État pendant le combat
    current_hp = db.Column(db.Integer, default=100)
    current_mana = db.Column(db.Integer, default=50)
    max_hp = db.Column(db.Integer, default=100)
    max_mana = db.Column(db.Integer, default=50)
    grid_x = db.Column(db.Integer, default=0)
    grid_y = db.Column(db.Integer, default=0)
    is_alive = db.Column(db.Boolean, default=True)

    # Tour courant
    answered = db.Column(db.Boolean, default=False)
    is_correct = db.Column(db.Boolean, default=False)
    selected_action_json = db.Column(db.JSON, nullable=True)
    action_submitted = db.Column(db.Boolean, default=False)
    has_moved = db.Column(db.Boolean, default=False)

    # Relations
    student = db.relationship('Student', backref=db.backref('combat_participations', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('combat_session_id', 'student_id', name='uq_combat_student'),
    )

    def to_dict(self):
        snapshot = self.snapshot_json or {}
        return {
            'id': self.id,
            'student_id': self.student_id,
            'student_name': snapshot.get('name', f'Élève {self.student_id}'),
            'avatar_class': snapshot.get('avatar_class', 'guerrier'),
            'level': snapshot.get('level', 1),
            'current_hp': self.current_hp,
            'max_hp': self.max_hp,
            'current_mana': self.current_mana,
            'max_mana': self.max_mana,
            'grid_x': self.grid_x,
            'grid_y': self.grid_y,
            'is_alive': self.is_alive,
            'answered': self.answered,
            'is_correct': self.is_correct,
            'action_submitted': self.action_submitted,
            'has_moved': self.has_moved,
            'move_range': snapshot.get('move_range', 3),
            'skills': snapshot.get('skills', []),
        }

    def reset_round(self):
        """Réinitialise l'état du tour pour un nouveau round"""
        self.answered = False
        self.is_correct = False
        self.selected_action_json = None
        self.action_submitted = False
        self.has_moved = False

    def __repr__(self):
        return f'<CombatParticipant student={self.student_id} hp={self.current_hp}/{self.max_hp}>'


class CombatMonster(db.Model):
    """Un monstre dans le combat"""
    __tablename__ = 'combat_monsters'

    id = db.Column(db.Integer, primary_key=True)
    combat_session_id = db.Column(db.Integer, db.ForeignKey('combat_sessions.id'), nullable=False)

    monster_type = db.Column(db.String(20), nullable=False)  # slime, goblin, orc, skeleton, dragon
    name = db.Column(db.String(100), nullable=False)
    level = db.Column(db.Integer, default=1)
    max_hp = db.Column(db.Integer, default=50)
    current_hp = db.Column(db.Integer, default=50)
    attack = db.Column(db.Integer, default=5)
    defense = db.Column(db.Integer, default=3)
    magic_defense = db.Column(db.Integer, default=3)
    grid_x = db.Column(db.Integer, default=5)
    grid_y = db.Column(db.Integer, default=0)
    is_alive = db.Column(db.Boolean, default=True)
    skills_json = db.Column(db.JSON, default=list)

    def to_dict(self):
        return {
            'id': self.id,
            'monster_type': self.monster_type,
            'name': self.name,
            'level': self.level,
            'max_hp': self.max_hp,
            'current_hp': self.current_hp,
            'attack': self.attack,
            'defense': self.defense,
            'magic_defense': self.magic_defense,
            'grid_x': self.grid_x,
            'grid_y': self.grid_y,
            'is_alive': self.is_alive,
            'skills': self.skills_json or [],
        }

    def take_damage(self, amount):
        """Applique des dégâts au monstre"""
        self.current_hp = max(0, self.current_hp - amount)
        if self.current_hp <= 0:
            self.is_alive = False
        return amount

    def __repr__(self):
        return f'<CombatMonster {self.name} hp={self.current_hp}/{self.max_hp}>'
