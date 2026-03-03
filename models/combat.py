from extensions import db
from datetime import datetime
import json


# ═══════════════════════════════════════════════════════════════════
#  MONSTER PRESETS — stats de base par type et par niveau
# ═══════════════════════════════════════════════════════════════════

MONSTER_PRESETS = {
    # ═══════════════════════════════════════════════════════════════
    #  TIER EASY — Monstres faibles pour les premiers combats
    # ═══════════════════════════════════════════════════════════════
    'slime': {
        'name': 'Slime',
        'base_hp': 25, 'base_attack': 4, 'base_defense': 1, 'base_magic_defense': 1,
        'hp_per_level': 6, 'attack_per_level': 1, 'defense_per_level': 1, 'magic_defense_per_level': 1,
        'move_range': 2,
        'skills': [
            {'id': 'slime_tackle', 'name': 'Charge gluante', 'type': 'physical', 'damage': 6, 'target': 'single', 'range': 1},
            {'id': 'slime_spit', 'name': 'Crachat acide', 'type': 'magical', 'damage': 4, 'target': 'single', 'range': 2},
        ],
    },
    'rat': {
        'name': 'Rat géant',
        'base_hp': 20, 'base_attack': 5, 'base_defense': 1, 'base_magic_defense': 0,
        'hp_per_level': 5, 'attack_per_level': 2, 'defense_per_level': 0, 'magic_defense_per_level': 0,
        'move_range': 3,
        'skills': [
            {'id': 'rat_bite', 'name': 'Morsure', 'type': 'physical', 'damage': 7, 'target': 'single', 'range': 1},
            {'id': 'rat_scratch', 'name': 'Griffure rapide', 'type': 'physical', 'damage': 5, 'target': 'single', 'range': 1},
        ],
    },
    'kobold': {
        'name': 'Kobold',
        'base_hp': 22, 'base_attack': 4, 'base_defense': 2, 'base_magic_defense': 1,
        'hp_per_level': 6, 'attack_per_level': 2, 'defense_per_level': 1, 'magic_defense_per_level': 0,
        'move_range': 2,
        'skills': [
            {'id': 'kobold_stab', 'name': 'Coup de dague', 'type': 'physical', 'damage': 7, 'target': 'single', 'range': 1},
            {'id': 'kobold_trap', 'name': 'Piège sournois', 'type': 'physical', 'damage': 5, 'target': 'single', 'range': 2},
        ],
    },
    'bat': {
        'name': 'Chauve-souris',
        'base_hp': 15, 'base_attack': 6, 'base_defense': 0, 'base_magic_defense': 2,
        'hp_per_level': 4, 'attack_per_level': 2, 'defense_per_level': 0, 'magic_defense_per_level': 1,
        'move_range': 4,
        'skills': [
            {'id': 'bat_screech', 'name': 'Cri strident', 'type': 'magical', 'damage': 5, 'target': 'all', 'range': 2},
            {'id': 'bat_drain', 'name': 'Drain de vie', 'type': 'magical', 'damage': 6, 'target': 'single', 'range': 1},
        ],
    },

    # ═══════════════════════════════════════════════════════════════
    #  TIER MEDIUM — Monstres intermédiaires
    # ═══════════════════════════════════════════════════════════════
    'goblin': {
        'name': 'Gobelin',
        'base_hp': 35, 'base_attack': 8, 'base_defense': 3, 'base_magic_defense': 2,
        'hp_per_level': 8, 'attack_per_level': 3, 'defense_per_level': 1, 'magic_defense_per_level': 1,
        'move_range': 2,
        'skills': [
            {'id': 'goblin_slash', 'name': 'Coup de lame', 'type': 'physical', 'damage': 10, 'target': 'single', 'range': 1},
            {'id': 'goblin_throw', 'name': 'Lancer de pierre', 'type': 'physical', 'damage': 7, 'target': 'single', 'range': 3},
        ],
    },
    'wolf': {
        'name': 'Loup',
        'base_hp': 38, 'base_attack': 10, 'base_defense': 3, 'base_magic_defense': 1,
        'hp_per_level': 9, 'attack_per_level': 3, 'defense_per_level': 1, 'magic_defense_per_level': 1,
        'move_range': 3,
        'skills': [
            {'id': 'wolf_bite', 'name': 'Morsure féroce', 'type': 'physical', 'damage': 12, 'target': 'single', 'range': 1},
            {'id': 'wolf_howl', 'name': 'Hurlement', 'type': 'buff', 'damage': 0, 'target': 'self', 'range': 0},
        ],
    },
    'zombie': {
        'name': 'Zombie',
        'base_hp': 50, 'base_attack': 7, 'base_defense': 5, 'base_magic_defense': 1,
        'hp_per_level': 12, 'attack_per_level': 2, 'defense_per_level': 2, 'magic_defense_per_level': 0,
        'move_range': 1,
        'skills': [
            {'id': 'zombie_slam', 'name': 'Coup putride', 'type': 'physical', 'damage': 11, 'target': 'single', 'range': 1},
            {'id': 'zombie_vomit', 'name': 'Vomi toxique', 'type': 'magical', 'damage': 8, 'target': 'single', 'range': 2},
        ],
    },
    'mushroom': {
        'name': 'Champignon',
        'base_hp': 30, 'base_attack': 5, 'base_defense': 4, 'base_magic_defense': 6,
        'hp_per_level': 8, 'attack_per_level': 2, 'defense_per_level': 1, 'magic_defense_per_level': 2,
        'move_range': 1,
        'skills': [
            {'id': 'mushroom_spore', 'name': 'Nuage de spores', 'type': 'magical', 'damage': 8, 'target': 'all', 'range': 2},
            {'id': 'mushroom_heal', 'name': 'Régénération', 'type': 'heal', 'damage': 10, 'target': 'self', 'range': 0},
        ],
    },
    'bandit': {
        'name': 'Bandit',
        'base_hp': 40, 'base_attack': 9, 'base_defense': 3, 'base_magic_defense': 2,
        'hp_per_level': 10, 'attack_per_level': 3, 'defense_per_level': 1, 'magic_defense_per_level': 1,
        'move_range': 2,
        'skills': [
            {'id': 'bandit_stab', 'name': 'Coup en traître', 'type': 'physical', 'damage': 12, 'target': 'single', 'range': 1},
            {'id': 'bandit_arrow', 'name': 'Flèche empoisonnée', 'type': 'physical', 'damage': 9, 'target': 'single', 'range': 4},
        ],
    },
    'fire_elemental': {
        'name': 'Élémentaire de feu',
        'base_hp': 35, 'base_attack': 6, 'base_defense': 2, 'base_magic_defense': 8,
        'hp_per_level': 8, 'attack_per_level': 3, 'defense_per_level': 1, 'magic_defense_per_level': 3,
        'move_range': 2,
        'skills': [
            {'id': 'fire_bolt', 'name': 'Trait de feu', 'type': 'magical', 'damage': 13, 'target': 'single', 'range': 3},
            {'id': 'fire_nova', 'name': 'Nova de flammes', 'type': 'magical', 'damage': 9, 'target': 'all', 'range': 2},
        ],
    },

    # ═══════════════════════════════════════════════════════════════
    #  TIER HARD — Monstres puissants
    # ═══════════════════════════════════════════════════════════════
    'ogre': {
        'name': 'Ogre',
        'base_hp': 70, 'base_attack': 12, 'base_defense': 7, 'base_magic_defense': 3,
        'hp_per_level': 15, 'attack_per_level': 4, 'defense_per_level': 2, 'magic_defense_per_level': 1,
        'move_range': 2,
        'skills': [
            {'id': 'ogre_smash', 'name': 'Écrasement', 'type': 'physical', 'damage': 18, 'target': 'single', 'range': 1},
            {'id': 'ogre_stomp', 'name': 'Piétinement', 'type': 'physical', 'damage': 12, 'target': 'all', 'range': 1},
        ],
    },
    'vampire': {
        'name': 'Vampire',
        'base_hp': 55, 'base_attack': 11, 'base_defense': 5, 'base_magic_defense': 7,
        'hp_per_level': 12, 'attack_per_level': 4, 'defense_per_level': 2, 'magic_defense_per_level': 3,
        'move_range': 3,
        'skills': [
            {'id': 'vampire_bite', 'name': 'Morsure vampirique', 'type': 'physical', 'damage': 14, 'target': 'single', 'range': 1},
            {'id': 'vampire_drain', 'name': 'Drain d\'âme', 'type': 'magical', 'damage': 12, 'target': 'single', 'range': 2},
            {'id': 'vampire_charm', 'name': 'Charme obscur', 'type': 'magical', 'damage': 8, 'target': 'all', 'range': 3},
        ],
    },
    'witch': {
        'name': 'Sorcière',
        'base_hp': 45, 'base_attack': 6, 'base_defense': 3, 'base_magic_defense': 9,
        'hp_per_level': 10, 'attack_per_level': 3, 'defense_per_level': 1, 'magic_defense_per_level': 3,
        'move_range': 2,
        'skills': [
            {'id': 'witch_hex', 'name': 'Maléfice', 'type': 'magical', 'damage': 15, 'target': 'single', 'range': 4},
            {'id': 'witch_curse', 'name': 'Malédiction de masse', 'type': 'magical', 'damage': 10, 'target': 'all', 'range': 3},
            {'id': 'witch_heal', 'name': 'Potion de soin', 'type': 'heal', 'damage': 15, 'target': 'ally', 'range': 3},
        ],
    },
    'spider': {
        'name': 'Araignée géante',
        'base_hp': 50, 'base_attack': 10, 'base_defense': 5, 'base_magic_defense': 4,
        'hp_per_level': 11, 'attack_per_level': 3, 'defense_per_level': 2, 'magic_defense_per_level': 1,
        'move_range': 3,
        'skills': [
            {'id': 'spider_bite', 'name': 'Morsure venimeuse', 'type': 'physical', 'damage': 13, 'target': 'single', 'range': 1},
            {'id': 'spider_web', 'name': 'Toile d\'araignée', 'type': 'magical', 'damage': 6, 'target': 'single', 'range': 3},
        ],
    },
    'golem': {
        'name': 'Golem',
        'base_hp': 80, 'base_attack': 13, 'base_defense': 10, 'base_magic_defense': 5,
        'hp_per_level': 18, 'attack_per_level': 4, 'defense_per_level': 3, 'magic_defense_per_level': 2,
        'move_range': 1,
        'skills': [
            {'id': 'golem_punch', 'name': 'Poing de pierre', 'type': 'physical', 'damage': 20, 'target': 'single', 'range': 1},
            {'id': 'golem_quake', 'name': 'Séisme', 'type': 'physical', 'damage': 12, 'target': 'all', 'range': 2},
        ],
    },

    # ═══════════════════════════════════════════════════════════════
    #  TIER BOSS — Monstres ultimes
    # ═══════════════════════════════════════════════════════════════
    'necromancer': {
        'name': 'Nécromancien',
        'base_hp': 65, 'base_attack': 8, 'base_defense': 5, 'base_magic_defense': 10,
        'hp_per_level': 14, 'attack_per_level': 4, 'defense_per_level': 2, 'magic_defense_per_level': 4,
        'move_range': 2,
        'skills': [
            {'id': 'necro_bolt', 'name': 'Trait nécrotique', 'type': 'magical', 'damage': 16, 'target': 'single', 'range': 4},
            {'id': 'necro_drain', 'name': 'Drain vital', 'type': 'magical', 'damage': 12, 'target': 'single', 'range': 3},
            {'id': 'necro_curse', 'name': 'Malédiction mortelle', 'type': 'magical', 'damage': 10, 'target': 'all', 'range': 3},
        ],
    },
    'lich': {
        'name': 'Liche',
        'base_hp': 75, 'base_attack': 7, 'base_defense': 6, 'base_magic_defense': 12,
        'hp_per_level': 16, 'attack_per_level': 4, 'defense_per_level': 2, 'magic_defense_per_level': 5,
        'move_range': 2,
        'skills': [
            {'id': 'lich_frost', 'name': 'Souffle glacial', 'type': 'magical', 'damage': 18, 'target': 'all', 'range': 3},
            {'id': 'lich_death', 'name': 'Rayon de mort', 'type': 'magical', 'damage': 25, 'target': 'single', 'range': 4},
            {'id': 'lich_shield', 'name': 'Bouclier spectral', 'type': 'buff', 'damage': 0, 'target': 'self', 'range': 0},
        ],
    },
    'dragon': {
        'name': 'Dragon',
        'base_hp': 120, 'base_attack': 15, 'base_defense': 10, 'base_magic_defense': 8,
        'hp_per_level': 25, 'attack_per_level': 5, 'defense_per_level': 3, 'magic_defense_per_level': 3,
        'move_range': 2,
        'skills': [
            {'id': 'dragon_claw', 'name': 'Griffe draconique', 'type': 'physical', 'damage': 20, 'target': 'single', 'range': 1},
            {'id': 'dragon_breath', 'name': 'Souffle de feu', 'type': 'magical', 'damage': 22, 'target': 'all', 'range': 3},
            {'id': 'dragon_tail', 'name': 'Coup de queue', 'type': 'physical', 'damage': 15, 'target': 'single', 'range': 1},
        ],
    },
    'hydra': {
        'name': 'Hydre',
        'base_hp': 100, 'base_attack': 13, 'base_defense': 8, 'base_magic_defense': 6,
        'hp_per_level': 22, 'attack_per_level': 5, 'defense_per_level': 3, 'magic_defense_per_level': 2,
        'move_range': 1,
        'skills': [
            {'id': 'hydra_bite', 'name': 'Triple morsure', 'type': 'physical', 'damage': 18, 'target': 'single', 'range': 1},
            {'id': 'hydra_acid', 'name': 'Crachat d\'acide', 'type': 'magical', 'damage': 14, 'target': 'all', 'range': 2},
            {'id': 'hydra_regen', 'name': 'Régénération', 'type': 'heal', 'damage': 15, 'target': 'self', 'range': 0},
        ],
    },
    'shadow': {
        'name': 'Ombre',
        'base_hp': 60, 'base_attack': 14, 'base_defense': 4, 'base_magic_defense': 11,
        'hp_per_level': 13, 'attack_per_level': 5, 'defense_per_level': 2, 'magic_defense_per_level': 4,
        'move_range': 4,
        'skills': [
            {'id': 'shadow_strike', 'name': 'Frappe des ténèbres', 'type': 'physical', 'damage': 16, 'target': 'single', 'range': 1},
            {'id': 'shadow_void', 'name': 'Vortex du néant', 'type': 'magical', 'damage': 20, 'target': 'single', 'range': 3},
            {'id': 'shadow_cloak', 'name': 'Voile d\'ombre', 'type': 'buff', 'damage': 0, 'target': 'self', 'range': 0},
        ],
    },
}

# Pools de monstres par tier (pour sélection aléatoire)
TIER_EASY = ['slime', 'rat', 'kobold', 'bat']
TIER_MEDIUM = ['goblin', 'wolf', 'zombie', 'mushroom', 'bandit', 'fire_elemental']
TIER_HARD = ['ogre', 'vampire', 'witch', 'spider', 'golem']
TIER_BOSS = ['necromancer', 'lich', 'dragon', 'hydra', 'shadow']

# Configurations de combat prédéfinies par difficulté
DIFFICULTY_CONFIGS = {
    'easy': {
        'monsters': [
            {'tier': 'easy', 'count': 3, 'level_offset': -1},
        ],
        'xp_multiplier': 1.0,
        'gold_multiplier': 1.0,
    },
    'medium': {
        'monsters': [
            {'tier': 'medium', 'count': 2, 'level_offset': 0},
            {'tier': 'easy', 'count': 2, 'level_offset': 0},
        ],
        'xp_multiplier': 1.5,
        'gold_multiplier': 1.5,
    },
    'hard': {
        'monsters': [
            {'tier': 'hard', 'count': 2, 'level_offset': 0},
            {'tier': 'medium', 'count': 2, 'level_offset': 1},
        ],
        'xp_multiplier': 2.0,
        'gold_multiplier': 2.0,
    },
    'boss': {
        'monsters': [
            {'tier': 'boss', 'count': 1, 'level_offset': 2},
            {'tier': 'hard', 'count': 1, 'level_offset': 0},
            {'tier': 'medium', 'count': 2, 'level_offset': 0},
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

    # Suivi des blocs utilisés pour la rotation des questions
    used_block_ids_json = db.Column(db.JSON, default=list)

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

    monster_type = db.Column(db.String(30), nullable=False)  # see MONSTER_PRESETS keys
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
