from extensions import db
from datetime import datetime
import math
import random
import json


# ═══════════════════════════════════════════════════════════════════
#  CLASS DEFINITIONS — stats de base, évolutions, compétences
# ═══════════════════════════════════════════════════════════════════

CLASS_BASE_STATS = {
    'guerrier': {'force': 8, 'defense': 7, 'defense_magique': 3, 'vie': 9, 'intelligence': 3},
    'mage':     {'force': 2, 'defense': 3, 'defense_magique': 8, 'vie': 5, 'intelligence': 9},
    'archer':   {'force': 6, 'defense': 4, 'defense_magique': 4, 'vie': 6, 'intelligence': 6},
    'guerisseur': {'force': 3, 'defense': 5, 'defense_magique': 7, 'vie': 7, 'intelligence': 8},
}

CLASS_DESCRIPTIONS = {
    'guerrier': {
        'name': 'Guerrier',
        'subtitle': 'Maître du combat rapproché',
        'description': 'Le Guerrier est un combattant redoutable au corps à corps. Sa force brute et sa résistance en font un pilier de l\'équipe.',
        'strengths': ['Force physique élevée', 'Grande résistance (Vie)', 'Bonne défense physique'],
        'weaknesses': ['Faible défense magique', 'Intelligence basse', 'Lent mais puissant'],
        'playstyle': 'Tank / DPS mêlée',
    },
    'archer': {
        'name': 'Archer',
        'subtitle': 'Tireur d\'élite agile',
        'description': 'L\'Archer frappe de loin avec précision. Agile et polyvalent, il excelle dans les attaques à distance.',
        'strengths': ['Attaques à distance', 'Stats équilibrées', 'Bonne agilité'],
        'weaknesses': ['Défense physique moyenne', 'Fragile au corps à corps', 'Vie moyenne'],
        'playstyle': 'DPS distance / Support',
    },
    'mage': {
        'name': 'Mage',
        'subtitle': 'Maître des éléments',
        'description': 'Le Mage contrôle les forces élémentaires. Ses sorts dévastateurs touchent de larges zones, mais il est fragile.',
        'strengths': ['Intelligence maximale', 'Dégâts de zone (AoE)', 'Forte défense magique'],
        'weaknesses': ['Très fragile physiquement', 'Peu de vie', 'Force très basse'],
        'playstyle': 'DPS magique / Contrôle',
    },
    'guerisseur': {
        'name': 'Moine',
        'subtitle': 'Gardien sacré',
        'description': 'Le Moine soigne et protège ses alliés. Il combine magie défensive et combats au bâton.',
        'strengths': ['Soins puissants', 'Buffs d\'équipe', 'Bonne défense magique et vie'],
        'weaknesses': ['Force faible', 'Dégâts limités', 'Défense physique moyenne'],
        'playstyle': 'Healer / Support',
    },
}

# Stats gagnées par niveau selon la classe
CLASS_STATS_PER_LEVEL = {
    'guerrier':   {'force': 2, 'defense': 2, 'defense_magique': 0.5, 'vie': 2, 'intelligence': 0.5},
    'mage':       {'force': 0.5, 'defense': 0.5, 'defense_magique': 2, 'vie': 1, 'intelligence': 2},
    'archer':     {'force': 1.5, 'defense': 1, 'defense_magique': 1, 'vie': 1.5, 'intelligence': 1.5},
    'guerisseur': {'force': 0.5, 'defense': 1, 'defense_magique': 2, 'vie': 1.5, 'intelligence': 2},
}

# Évolutions de classe : niveau requis → 2 choix
CLASS_EVOLUTIONS = {
    'guerrier': {
        5: [
            {'id': 'chevalier', 'name': 'Chevalier', 'description': 'Tank ultime avec bouclier sacré', 'stat_bonus': {'defense': 5, 'vie': 5}},
            {'id': 'berserker', 'name': 'Berserker', 'description': 'Dégâts dévastateurs, défense réduite', 'stat_bonus': {'force': 8, 'defense': -2}},
        ],
        10: [
            {'id': 'paladin', 'name': 'Paladin', 'description': 'Guerrier sacré avec soins mineurs', 'stat_bonus': {'defense_magique': 5, 'vie': 3, 'intelligence': 3}},
            {'id': 'gladiateur', 'name': 'Gladiateur', 'description': 'Maître d\'armes polyvalent', 'stat_bonus': {'force': 4, 'defense': 3, 'vie': 3}},
        ],
    },
    'mage': {
        5: [
            {'id': 'pyromancien', 'name': 'Pyromancien', 'description': 'Maître du feu, dégâts maximum', 'stat_bonus': {'intelligence': 6, 'force': 2}},
            {'id': 'enchanteur', 'name': 'Enchanteur', 'description': 'Contrôle et buffs puissants', 'stat_bonus': {'defense_magique': 5, 'intelligence': 3}},
        ],
        10: [
            {'id': 'archimage', 'name': 'Archimage', 'description': 'Puissance magique absolue', 'stat_bonus': {'intelligence': 8, 'defense_magique': 4}},
            {'id': 'chronomancien', 'name': 'Chronomancien', 'description': 'Manipulation du temps et espace', 'stat_bonus': {'intelligence': 5, 'vie': 3, 'defense': 2}},
        ],
    },
    'archer': {
        5: [
            {'id': 'ranger', 'name': 'Ranger', 'description': 'Expert de la survie et pièges', 'stat_bonus': {'defense': 4, 'vie': 3, 'force': 2}},
            {'id': 'sniper', 'name': 'Sniper', 'description': 'Tirs critiques dévastateurs', 'stat_bonus': {'force': 6, 'intelligence': 3}},
        ],
        10: [
            {'id': 'chasseur_de_dragons', 'name': 'Chasseur de dragons', 'description': 'Tueur de monstres légendaire', 'stat_bonus': {'force': 5, 'defense': 3, 'vie': 3}},
            {'id': 'assassin', 'name': 'Assassin', 'description': 'Frappes furtives et critiques', 'stat_bonus': {'force': 7, 'intelligence': 4, 'vie': -2}},
        ],
    },
    'guerisseur': {
        5: [
            {'id': 'pretre', 'name': 'Prêtre', 'description': 'Soins surpuissants et résurrection', 'stat_bonus': {'intelligence': 5, 'vie': 4}},
            {'id': 'druide', 'name': 'Druide', 'description': 'Magie de la nature et invocations', 'stat_bonus': {'defense_magique': 4, 'intelligence': 3, 'force': 2}},
        ],
        10: [
            {'id': 'saint', 'name': 'Saint', 'description': 'Aura de guérison permanente', 'stat_bonus': {'intelligence': 6, 'vie': 5, 'defense_magique': 3}},
            {'id': 'chaman', 'name': 'Chaman', 'description': 'Esprits et magie élémentaire', 'stat_bonus': {'intelligence': 5, 'force': 3, 'defense_magique': 3}},
        ],
    },
}

# Compétences de base par classe (acquises au niveau 1)
CLASS_BASE_SKILLS = {
    'guerrier': [
        {'id': 'coup_epee', 'name': 'Coup d\'épée', 'description': 'Attaque de base au corps à corps', 'icon': 'sword', 'type': 'attack', 'damage': 10, 'cost': 0},
        {'id': 'bouclier_protect', 'name': 'Protection', 'description': 'Réduit les dégâts reçus', 'icon': 'shield', 'type': 'defense', 'damage': 0, 'cost': 5},
        {'id': 'charge', 'name': 'Charge', 'description': 'Fonce sur l\'ennemi avec puissance', 'icon': 'flash', 'type': 'attack', 'damage': 15, 'cost': 10},
    ],
    'mage': [
        {'id': 'boule_feu', 'name': 'Boule de feu', 'description': 'Lance une boule de feu', 'icon': 'flame', 'type': 'attack', 'damage': 15, 'cost': 10},
        {'id': 'barriere_magique', 'name': 'Barrière magique', 'description': 'Bouclier magique protecteur', 'icon': 'sparkles', 'type': 'defense', 'damage': 0, 'cost': 8},
        {'id': 'eclair', 'name': 'Éclair', 'description': 'Frappe électrique rapide', 'icon': 'flash', 'type': 'attack', 'damage': 12, 'cost': 8},
    ],
    'archer': [
        {'id': 'tir_precis', 'name': 'Tir précis', 'description': 'Flèche tirée avec précision', 'icon': 'locate', 'type': 'attack', 'damage': 12, 'cost': 5},
        {'id': 'pluie_fleches', 'name': 'Pluie de flèches', 'description': 'Flèches sur une large zone', 'icon': 'rainy', 'type': 'attack', 'damage': 8, 'cost': 12},
        {'id': 'esquive', 'name': 'Esquive', 'description': 'Évite la prochaine attaque', 'icon': 'body', 'type': 'defense', 'damage': 0, 'cost': 6},
    ],
    'guerisseur': [
        {'id': 'soin', 'name': 'Soin', 'description': 'Restaure des points de vie', 'icon': 'heart', 'type': 'heal', 'damage': 0, 'cost': 8, 'heal': 15},
        {'id': 'coup_baton', 'name': 'Coup de bâton', 'description': 'Frappe avec le bâton sacré', 'icon': 'fitness', 'type': 'attack', 'damage': 8, 'cost': 0},
        {'id': 'benediction', 'name': 'Bénédiction', 'description': 'Augmente les stats alliées', 'icon': 'sunny', 'type': 'buff', 'damage': 0, 'cost': 10},
    ],
}

# Compétences débloquées par niveau
CLASS_LEVEL_SKILLS = {
    'guerrier': {
        3: {'id': 'tourbillon', 'name': 'Tourbillon', 'description': 'Attaque circulaire puissante', 'icon': 'sync', 'type': 'attack', 'damage': 20, 'cost': 15},
        6: {'id': 'cri_guerre', 'name': 'Cri de guerre', 'description': 'Augmente la force temporairement', 'icon': 'megaphone', 'type': 'buff', 'damage': 0, 'cost': 12},
        9: {'id': 'frappe_titan', 'name': 'Frappe du titan', 'description': 'Coup dévastateur ultime', 'icon': 'nuclear', 'type': 'attack', 'damage': 35, 'cost': 25},
    },
    'mage': {
        3: {'id': 'blizzard', 'name': 'Blizzard', 'description': 'Tempête de glace sur zone', 'icon': 'snow', 'type': 'attack', 'damage': 18, 'cost': 15},
        6: {'id': 'teleportation', 'name': 'Téléportation', 'description': 'Se déplace instantanément', 'icon': 'flash', 'type': 'utility', 'damage': 0, 'cost': 10},
        9: {'id': 'meteor', 'name': 'Météore', 'description': 'Invoque un météore destructeur', 'icon': 'planet', 'type': 'attack', 'damage': 40, 'cost': 30},
    },
    'archer': {
        3: {'id': 'fleche_poison', 'name': 'Flèche empoisonnée', 'description': 'Inflige des dégâts continus', 'icon': 'flask', 'type': 'attack', 'damage': 10, 'cost': 8},
        6: {'id': 'piege', 'name': 'Piège', 'description': 'Pose un piège au sol', 'icon': 'warning', 'type': 'utility', 'damage': 15, 'cost': 10},
        9: {'id': 'tir_ultime', 'name': 'Tir ultime', 'description': 'Flèche chargée de puissance', 'icon': 'rocket', 'type': 'attack', 'damage': 35, 'cost': 25},
    },
    'guerisseur': {
        3: {'id': 'guerison_groupe', 'name': 'Guérison de groupe', 'description': 'Soigne toute l\'équipe', 'icon': 'people', 'type': 'heal', 'damage': 0, 'cost': 15, 'heal': 10},
        6: {'id': 'purification', 'name': 'Purification', 'description': 'Retire les malus et poisons', 'icon': 'water', 'type': 'utility', 'damage': 0, 'cost': 12},
        9: {'id': 'resurrection', 'name': 'Résurrection', 'description': 'Ramène un allié tombé', 'icon': 'star', 'type': 'heal', 'damage': 0, 'cost': 30, 'heal': 50},
    },
}


class StudentRPGProfile(db.Model):
    """Profil RPG d'un élève (avatar chihuahua, XP, or, stats)"""
    __tablename__ = 'student_rpg_profiles'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), unique=True, nullable=False)
    avatar_class = db.Column(db.String(20), nullable=True)
    avatar_accessories_json = db.Column(db.JSON, default=dict)
    xp_total = db.Column(db.Integer, default=0)
    level = db.Column(db.Integer, default=1)
    gold = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Stats (calculés à partir de la classe + level + equipment)
    stat_force = db.Column(db.Integer, default=5)
    stat_defense = db.Column(db.Integer, default=5)
    stat_defense_magique = db.Column(db.Integer, default=5)
    stat_vie = db.Column(db.Integer, default=5)
    stat_intelligence = db.Column(db.Integer, default=5)

    # Évolutions choisies (JSON: [{"level": 5, "evolution_id": "chevalier"}, ...])
    evolutions_json = db.Column(db.JSON, default=list)

    # Compétences actives (JSON: ["coup_epee", "charge", ...]) — max 6
    active_skills_json = db.Column(db.JSON, default=list)

    # Équipement actif (JSON: {"arme": item_id, "bouclier": item_id, "accessoire": item_id})
    equipment_json = db.Column(db.JSON, default=dict)

    # Relations
    student = db.relationship('Student', backref=db.backref('rpg_profile', uselist=False))

    badges = db.relationship('StudentBadge', backref='profile', lazy='dynamic',
                             cascade='all, delete-orphan',
                             primaryjoin='StudentRPGProfile.student_id == StudentBadge.student_id',
                             foreign_keys='StudentBadge.student_id')

    def _safe_json_list(self, val):
        """Retourne une liste valide à partir d'une valeur JSON (gère str, None, list)."""
        if isinstance(val, list):
            return val
        if isinstance(val, str):
            try:
                import json as _json
                parsed = _json.loads(val)
                if isinstance(parsed, list):
                    return parsed
            except (ValueError, TypeError):
                pass
        return []

    def _safe_json_dict(self, val):
        """Retourne un dict valide à partir d'une valeur JSON (gère str, None, dict)."""
        if isinstance(val, dict):
            return val
        if isinstance(val, str):
            try:
                import json as _json
                parsed = _json.loads(val)
                if isinstance(parsed, dict):
                    return parsed
            except (ValueError, TypeError):
                pass
        return {}

    @property
    def sprite_name(self):
        """Retourne le nom du sprite à afficher (évolution la plus haute ou classe de base)."""
        try:
            evolutions = self._safe_json_list(self.evolutions_json)
            if evolutions:
                latest = max(evolutions, key=lambda e: e.get('level', 0) if isinstance(e, dict) else 0)
                if isinstance(latest, dict):
                    return latest.get('evolution_id', self.avatar_class or 'guerrier')
        except Exception:
            pass
        return self.avatar_class or 'guerrier'

    @property
    def sprite_path(self):
        """Retourne le chemin relatif du sprite (avec fallback sur la classe de base)."""
        fallback = f"img/chihuahua/{self.avatar_class or 'guerrier'}.png"
        try:
            import os
            from flask import current_app
            sprite_file = f"img/chihuahua/{self.sprite_name}.png"
            static_folder = current_app.static_folder
            if static_folder:
                full_path = os.path.join(static_folder, sprite_file)
                if os.path.exists(full_path):
                    return sprite_file
        except Exception:
            pass
        return fallback

    @staticmethod
    def calculate_level(xp):
        if xp <= 0:
            return 1
        return int(math.floor(math.sqrt(xp / 100))) + 1

    @staticmethod
    def xp_for_level(level):
        if level <= 1:
            return 0
        return ((level - 1) ** 2) * 100

    @property
    def xp_for_next_level(self):
        return self.xp_for_level(self.level + 1)

    @property
    def xp_progress(self):
        current_level_xp = self.xp_for_level(self.level)
        next_level_xp = self.xp_for_next_level
        if next_level_xp == current_level_xp:
            return 100
        progress = ((self.xp_total - current_level_xp) / (next_level_xp - current_level_xp)) * 100
        return min(100, max(0, round(progress)))

    def add_xp(self, amount):
        old_level = self.level
        self.xp_total += amount
        self.level = self.calculate_level(self.xp_total)
        # Recalculer les stats si level up
        if self.level > old_level:
            self.recalculate_stats()

    def add_gold(self, amount):
        self.gold += amount

    def recalculate_stats(self):
        """Recalculer les stats basées sur classe + level + équipement"""
        cls = self.avatar_class
        if not cls or cls not in CLASS_BASE_STATS:
            return

        base = CLASS_BASE_STATS[cls]
        per_level = CLASS_STATS_PER_LEVEL.get(cls, {})

        # Stats = base + (level-1) * per_level
        lvl = self.level - 1
        self.stat_force = base['force'] + int(per_level.get('force', 1) * lvl)
        self.stat_defense = base['defense'] + int(per_level.get('defense', 1) * lvl)
        self.stat_defense_magique = base['defense_magique'] + int(per_level.get('defense_magique', 1) * lvl)
        self.stat_vie = base['vie'] + int(per_level.get('vie', 1) * lvl)
        self.stat_intelligence = base['intelligence'] + int(per_level.get('intelligence', 1) * lvl)

        # Ajouter bonus des évolutions
        evolutions = self._safe_json_list(self.evolutions_json)
        for evo in evolutions:
            if not isinstance(evo, dict):
                continue
            evo_data = self._find_evolution(evo.get('evolution_id'))
            if evo_data:
                bonus = evo_data.get('stat_bonus', {})
                self.stat_force += bonus.get('force', 0)
                self.stat_defense += bonus.get('defense', 0)
                self.stat_defense_magique += bonus.get('defense_magique', 0)
                self.stat_vie += bonus.get('vie', 0)
                self.stat_intelligence += bonus.get('intelligence', 0)

        # Ajouter bonus de l'équipement
        equipment = self._safe_json_dict(self.equipment_json)
        for slot, item_id in equipment.items():
            if item_id:
                try:
                    item = RPGItem.query.get(item_id)
                    if item and item.stat_bonus_json:
                        bonus = self._safe_json_dict(item.stat_bonus_json)
                        self.stat_force += bonus.get('force', 0)
                        self.stat_defense += bonus.get('defense', 0)
                        self.stat_defense_magique += bonus.get('defense_magique', 0)
                        self.stat_vie += bonus.get('vie', 0)
                        self.stat_intelligence += bonus.get('intelligence', 0)
                except Exception:
                    pass

    def _find_evolution(self, evolution_id):
        """Trouver les données d'une évolution par son ID"""
        if not self.avatar_class:
            return None
        evos = CLASS_EVOLUTIONS.get(self.avatar_class, {})
        for level, choices in evos.items():
            for choice in choices:
                if choice['id'] == evolution_id:
                    return choice
        return None

    def get_available_evolutions(self):
        """Retourne les évolutions disponibles (non encore choisies) pour le niveau actuel"""
        if not self.avatar_class:
            return []
        evos = CLASS_EVOLUTIONS.get(self.avatar_class, {})
        safe_evolutions = [e for e in self._safe_json_list(self.evolutions_json) if isinstance(e, dict)]
        chosen_ids = {e.get('evolution_id') for e in safe_evolutions}
        chosen_levels = {e.get('level') for e in safe_evolutions}
        available = []
        for level, choices in sorted(evos.items()):
            if self.level >= level and level not in chosen_levels:
                available.append({
                    'level': level,
                    'choices': choices,
                })
        return available

    def get_all_skills(self):
        """Retourne toutes les compétences débloquées"""
        if not self.avatar_class:
            return []
        skills = list(CLASS_BASE_SKILLS.get(self.avatar_class, []))
        level_skills = CLASS_LEVEL_SKILLS.get(self.avatar_class, {})
        for lvl, skill in sorted(level_skills.items()):
            if self.level >= lvl:
                skills.append(skill)
        return skills

    def get_active_skills(self):
        """Retourne les compétences actives (max 6)"""
        all_skills = self.get_all_skills()
        active_ids = self._safe_json_list(self.active_skills_json)
        if not active_ids:
            return all_skills[:3]
        return [s for s in all_skills if s.get('id') in active_ids][:6]

    def reset_for_class_change(self):
        """Reset complet pour changement de classe"""
        self.xp_total = 0
        self.level = 1
        self.gold = 0
        self.evolutions_json = list()
        self.active_skills_json = list()
        self.equipment_json = dict()
        self.stat_force = 5
        self.stat_defense = 5
        self.stat_defense_magique = 5
        self.stat_vie = 5
        self.stat_intelligence = 5
        # Supprimer l'inventaire
        StudentItem.query.filter_by(student_id=self.student_id).delete()

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
            'stats': {
                'force': self.stat_force,
                'defense': self.stat_defense,
                'defense_magique': self.stat_defense_magique,
                'vie': self.stat_vie,
                'intelligence': self.stat_intelligence,
            },
            'evolutions': self.evolutions_json or [],
            'available_evolutions': self.get_available_evolutions(),
            'skills': self.get_all_skills(),
            'active_skills': self.get_active_skills(),
            'equipment': self.equipment_json or {},
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
    icon = db.Column(db.String(50), default='trophy')
    color = db.Column(db.String(7), default='#FFD700')
    category = db.Column(db.String(50))
    condition_type = db.Column(db.String(50))
    condition_value = db.Column(db.Integer, default=1)
    condition_extra = db.Column(db.String(100))
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

    __table_args__ = (
        db.UniqueConstraint('student_id', 'badge_id', name='uq_student_badge'),
    )

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


DEFAULT_BADGES = [
    {'name': 'Premier pas', 'description': 'Compléter ton premier exercice', 'icon': 'star', 'color': '#4CAF50', 'category': 'general', 'condition_type': 'exercises_completed', 'condition_value': 1},
    {'name': 'Apprenti', 'description': 'Compléter 5 exercices', 'icon': 'book', 'color': '#2196F3', 'category': 'general', 'condition_type': 'exercises_completed', 'condition_value': 5},
    {'name': 'Persévérant', 'description': 'Compléter 10 exercices', 'icon': 'fire', 'color': '#FF9800', 'category': 'general', 'condition_type': 'exercises_completed', 'condition_value': 10},
    {'name': 'Champion', 'description': 'Compléter 25 exercices', 'icon': 'crown', 'color': '#9C27B0', 'category': 'general', 'condition_type': 'exercises_completed', 'condition_value': 25},
    {'name': 'Perfectionniste', 'description': 'Obtenir 100% sur 3 exercices', 'icon': 'gem', 'color': '#E91E63', 'category': 'general', 'condition_type': 'perfect_scores', 'condition_value': 3},
    {'name': 'Sans faute', 'description': 'Obtenir 100% sur 10 exercices', 'icon': 'diamond', 'color': '#00BCD4', 'category': 'general', 'condition_type': 'perfect_scores', 'condition_value': 10},
    {'name': 'Maître des QCM', 'description': 'Réussir 10 blocs QCM', 'icon': 'check-circle', 'color': '#8BC34A', 'category': 'general', 'condition_type': 'block_type_completed', 'condition_value': 10, 'condition_extra': 'qcm'},
    {'name': 'Explorateur des graphiques', 'description': 'Réussir 5 blocs graphiques', 'icon': 'chart-line', 'color': '#3F51B5', 'category': 'general', 'condition_type': 'block_type_completed', 'condition_value': 5, 'condition_extra': 'graph'},
    {'name': 'As du tri', 'description': 'Réussir 5 blocs classement', 'icon': 'sort', 'color': '#FF5722', 'category': 'general', 'condition_type': 'block_type_completed', 'condition_value': 5, 'condition_extra': 'sorting'},
    {'name': 'Détective visuel', 'description': 'Réussir 5 blocs image interactive', 'icon': 'search', 'color': '#795548', 'category': 'general', 'condition_type': 'block_type_completed', 'condition_value': 5, 'condition_extra': 'image_position'},
]


class RPGItem(db.Model):
    """Définition d'un objet RPG (potion, arme, etc.)"""
    __tablename__ = 'rpg_items'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(300))
    icon = db.Column(db.String(50), default='box')
    color = db.Column(db.String(7), default='#6b7280')
    category = db.Column(db.String(50))  # potion, arme, bouclier, parchemin, tresor, accessoire
    rarity = db.Column(db.String(20), default='common')
    is_active = db.Column(db.Boolean, default=True)
    # Bonus stats pour les équipements (JSON: {"force": 2, "defense": 1})
    stat_bonus_json = db.Column(db.JSON, default=dict)
    # Effet spécial (description texte)
    special_ability = db.Column(db.String(200), nullable=True)
    # Slot d'équipement (arme, bouclier, accessoire, None = consommable)
    equip_slot = db.Column(db.String(20), nullable=True)

    @property
    def rarity_color(self):
        return {
            'common': '#9ca3af', 'rare': '#3b82f6',
            'epic': '#a855f7', 'legendary': '#f59e0b',
        }.get(self.rarity, '#9ca3af')

    @property
    def rarity_label(self):
        return {
            'common': 'Commun', 'rare': 'Rare',
            'epic': 'Épique', 'legendary': 'Légendaire',
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
            'stat_bonus': self.stat_bonus_json or {},
            'special_ability': self.special_ability,
            'equip_slot': self.equip_slot,
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
    """Attribuer un objet aléatoire en fonction du score."""
    items = RPGItem.query.filter_by(is_active=True).all()
    if not items:
        return None

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

    existing = StudentItem.query.filter_by(student_id=student_id, item_id=chosen.id).first()
    if existing:
        existing.quantity += 1
    else:
        si = StudentItem(student_id=student_id, item_id=chosen.id)
        db.session.add(si)

    return chosen


DEFAULT_ITEMS = [
    # Potions (consommables)
    {'name': 'Potion de vie', 'description': 'Restaure l\'énergie du chihuahua', 'icon': 'flask', 'color': '#ef4444', 'category': 'potion', 'rarity': 'common'},
    {'name': 'Potion de mana', 'description': 'Recharge les pouvoirs magiques', 'icon': 'flask', 'color': '#3b82f6', 'category': 'potion', 'rarity': 'common'},
    {'name': 'Potion dorée', 'description': 'Un élixir précieux et brillant', 'icon': 'flask', 'color': '#f59e0b', 'category': 'potion', 'rarity': 'rare'},
    {'name': 'Potion légendaire', 'description': 'La potion ultime des anciens', 'icon': 'flask', 'color': '#a855f7', 'category': 'potion', 'rarity': 'legendary'},
    # Armes (équipables)
    {'name': 'Épée en bois', 'description': 'Une épée d\'entraînement basique', 'icon': 'gavel', 'color': '#92400e', 'category': 'arme', 'rarity': 'common', 'equip_slot': 'arme', 'stat_bonus_json': {'force': 1}},
    {'name': 'Épée en fer', 'description': 'Solide et fiable', 'icon': 'gavel', 'color': '#6b7280', 'category': 'arme', 'rarity': 'common', 'equip_slot': 'arme', 'stat_bonus_json': {'force': 2}},
    {'name': 'Épée enchantée', 'description': 'Brille d\'une lumière mystérieuse', 'icon': 'gavel', 'color': '#667eea', 'category': 'arme', 'rarity': 'rare', 'equip_slot': 'arme', 'stat_bonus_json': {'force': 3, 'intelligence': 1}, 'special_ability': 'Dégâts magiques +10%'},
    {'name': 'Excalibur', 'description': 'L\'épée légendaire des rois', 'icon': 'gavel', 'color': '#f59e0b', 'category': 'arme', 'rarity': 'legendary', 'equip_slot': 'arme', 'stat_bonus_json': {'force': 6, 'defense': 2}, 'special_ability': 'Force +20% en combat'},
    {'name': 'Bâton ancien', 'description': 'Un bâton imprégné de magie', 'icon': 'gavel', 'color': '#7c3aed', 'category': 'arme', 'rarity': 'rare', 'equip_slot': 'arme', 'stat_bonus_json': {'intelligence': 4, 'defense_magique': 1}, 'special_ability': 'Sorts +15%'},
    {'name': 'Arc elfique', 'description': 'Forgé par les elfes des bois', 'icon': 'gavel', 'color': '#059669', 'category': 'arme', 'rarity': 'epic', 'equip_slot': 'arme', 'stat_bonus_json': {'force': 4, 'intelligence': 2}, 'special_ability': 'Critique +25%'},
    # Boucliers (équipables)
    {'name': 'Bouclier en bois', 'description': 'Protection basique mais efficace', 'icon': 'shield-alt', 'color': '#92400e', 'category': 'bouclier', 'rarity': 'common', 'equip_slot': 'bouclier', 'stat_bonus_json': {'defense': 2}},
    {'name': 'Bouclier en acier', 'description': 'Résistant aux coups puissants', 'icon': 'shield-alt', 'color': '#6b7280', 'category': 'bouclier', 'rarity': 'rare', 'equip_slot': 'bouclier', 'stat_bonus_json': {'defense': 4, 'vie': 1}},
    {'name': 'Bouclier du dragon', 'description': 'Forgé dans le feu d\'un dragon', 'icon': 'shield-alt', 'color': '#ef4444', 'category': 'bouclier', 'rarity': 'epic', 'equip_slot': 'bouclier', 'stat_bonus_json': {'defense': 5, 'defense_magique': 3}, 'special_ability': 'Résistance au feu'},
    # Parchemins (consommables)
    {'name': 'Parchemin de sagesse', 'description': 'Contient un savoir ancien', 'icon': 'scroll', 'color': '#d4a574', 'category': 'parchemin', 'rarity': 'common'},
    {'name': 'Parchemin magique', 'description': 'Écrit dans une langue oubliée', 'icon': 'scroll', 'color': '#a855f7', 'category': 'parchemin', 'rarity': 'rare'},
    {'name': 'Parchemin du destin', 'description': 'Révèle les secrets de l\'avenir', 'icon': 'scroll', 'color': '#f59e0b', 'category': 'parchemin', 'rarity': 'epic'},
    # Trésors (consommables)
    {'name': 'Pièce d\'or', 'description': 'Une pièce brillante', 'icon': 'coins', 'color': '#f59e0b', 'category': 'tresor', 'rarity': 'common'},
    {'name': 'Rubis', 'description': 'Une pierre précieuse rouge sang', 'icon': 'gem', 'color': '#ef4444', 'category': 'tresor', 'rarity': 'rare'},
    {'name': 'Saphir', 'description': 'Un joyau d\'un bleu profond', 'icon': 'gem', 'color': '#3b82f6', 'category': 'tresor', 'rarity': 'rare'},
    {'name': 'Diamant', 'description': 'La gemme la plus rare et précieuse', 'icon': 'gem', 'color': '#e0e7ff', 'category': 'tresor', 'rarity': 'epic'},
    {'name': 'Couronne du roi', 'description': 'La couronne légendaire perdue', 'icon': 'crown', 'color': '#f59e0b', 'category': 'tresor', 'rarity': 'legendary'},
    # Accessoires (équipables)
    {'name': 'Chapeau de sorcier', 'description': 'Pointu et mystérieux', 'icon': 'hat-wizard', 'color': '#4338ca', 'category': 'accessoire', 'rarity': 'common', 'equip_slot': 'accessoire', 'stat_bonus_json': {'intelligence': 1}},
    {'name': 'Cape d\'invisibilité', 'description': 'Se fondre dans l\'ombre', 'icon': 'user-secret', 'color': '#1e1b4b', 'category': 'accessoire', 'rarity': 'epic', 'equip_slot': 'accessoire', 'stat_bonus_json': {'defense': 3, 'defense_magique': 3}, 'special_ability': 'Esquive +20%'},
    {'name': 'Anneau de pouvoir', 'description': 'Un anneau qui renforce son porteur', 'icon': 'ring', 'color': '#f59e0b', 'category': 'accessoire', 'rarity': 'legendary', 'equip_slot': 'accessoire', 'stat_bonus_json': {'force': 3, 'intelligence': 3, 'vie': 2}, 'special_ability': 'Tous les stats +10%'},
    {'name': 'Amulette de sagesse', 'description': 'Amplifie la concentration', 'icon': 'diamond', 'color': '#06b6d4', 'category': 'accessoire', 'rarity': 'rare', 'equip_slot': 'accessoire', 'stat_bonus_json': {'intelligence': 3, 'defense_magique': 1}},
]
