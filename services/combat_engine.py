"""
Combat Engine — Logique de combat RPG tactique en classe.
Gère la création de sessions, les rounds, les réponses, les actions et l'exécution.
"""
import random
import math
from datetime import datetime
from extensions import db
from models.combat import (
    CombatSession, CombatParticipant, CombatMonster,
    MONSTER_PRESETS, DIFFICULTY_CONFIGS
)


class CombatEngine:
    """Moteur de combat RPG"""

    # ─── Création de session ─────────────────────────────────
    @staticmethod
    def create_session(teacher_id, classroom_id, exercise_id, difficulty='medium'):
        """Crée une session de combat et place les monstres sur la grille."""
        config = DIFFICULTY_CONFIGS.get(difficulty, DIFFICULTY_CONFIGS['medium'])

        # Calculer le niveau moyen des élèves de la classe
        from models.rpg import StudentRPGProfile
        from models.student import Student
        students = Student.query.filter_by(classroom_id=classroom_id).all()
        student_ids = [s.id for s in students]
        rpg_profiles = StudentRPGProfile.query.filter(
            StudentRPGProfile.student_id.in_(student_ids)
        ).all() if student_ids else []
        avg_level = max(1, int(sum(p.level for p in rpg_profiles) / len(rpg_profiles))) if rpg_profiles else 1

        # Créer la session
        session = CombatSession(
            teacher_id=teacher_id,
            classroom_id=classroom_id,
            exercise_id=exercise_id,
            difficulty=difficulty,
            status='waiting',
            current_round=0,
            current_phase='waiting',
            map_config_json={
                'width': 10,
                'height': 8,
                'tile_size': 64,
            },
        )
        db.session.add(session)
        db.session.flush()  # Pour obtenir session.id

        # Placer les monstres
        monster_x_start = 7  # Côté droit de la grille
        monster_y = 1
        for monster_group in config['monsters']:
            preset = MONSTER_PRESETS.get(monster_group['type'])
            if not preset:
                continue
            level = max(1, avg_level + monster_group.get('level_offset', 0))
            for i in range(monster_group['count']):
                hp = preset['base_hp'] + preset['hp_per_level'] * (level - 1)
                atk = preset['base_attack'] + preset['attack_per_level'] * (level - 1)
                defense = preset['base_defense'] + preset['defense_per_level'] * (level - 1)
                mag_def = preset['base_magic_defense'] + preset['magic_defense_per_level'] * (level - 1)

                monster = CombatMonster(
                    combat_session_id=session.id,
                    monster_type=monster_group['type'],
                    name=f"{preset['name']} {i+1}" if monster_group['count'] > 1 else preset['name'],
                    level=level,
                    max_hp=hp,
                    current_hp=hp,
                    attack=atk,
                    defense=defense,
                    magic_defense=mag_def,
                    grid_x=monster_x_start + (i % 2),
                    grid_y=monster_y,
                    is_alive=True,
                    skills_json=preset['skills'],
                )
                db.session.add(monster)
                monster_y += 2
                if monster_y >= 8:
                    monster_y = 1
                    monster_x_start += 1

        db.session.commit()
        return session

    # ─── Rejoindre une session ───────────────────────────────
    @staticmethod
    def join_session(session_id, student_id):
        """Un élève rejoint le combat. Crée un CombatParticipant avec snapshot des stats."""
        session = CombatSession.query.get(session_id)
        if not session or session.status not in ('waiting', 'active'):
            return None, "Session invalide ou terminée"

        # Vérifier si déjà participant
        existing = CombatParticipant.query.filter_by(
            combat_session_id=session_id, student_id=student_id
        ).first()
        if existing:
            return existing, None

        # Charger le profil RPG
        from models.rpg import StudentRPGProfile
        from models.student import Student
        student = Student.query.get(student_id)
        rpg = StudentRPGProfile.query.filter_by(student_id=student_id).first()

        if not student:
            return None, "Élève non trouvé"

        # Snapshot des stats
        avatar_class = rpg.avatar_class if rpg else 'guerrier'
        level = rpg.level if rpg else 1
        max_hp = rpg.max_hp if rpg else 90
        max_mana = rpg.max_mana if rpg else 45
        skills = rpg.get_active_skills() if rpg else []
        stats = {
            'force': rpg.stat_force if rpg else 5,
            'defense': rpg.stat_defense if rpg else 5,
            'defense_magique': rpg.stat_defense_magique if rpg else 5,
            'vie': rpg.stat_vie if rpg else 5,
            'intelligence': rpg.stat_intelligence if rpg else 5,
        }

        snapshot = {
            'name': f"{student.first_name} {student.last_name[:1]}.",
            'avatar_class': avatar_class,
            'level': level,
            'stats': stats,
            'skills': skills,
        }

        # Position sur la grille (côté gauche)
        existing_count = CombatParticipant.query.filter_by(combat_session_id=session_id).count()
        grid_x = 1 + (existing_count % 2)
        grid_y = 1 + (existing_count // 2) * 2

        participant = CombatParticipant(
            combat_session_id=session_id,
            student_id=student_id,
            snapshot_json=snapshot,
            current_hp=max_hp,
            max_hp=max_hp,
            current_mana=max_mana,
            max_mana=max_mana,
            grid_x=grid_x,
            grid_y=min(grid_y, 7),
            is_alive=True,
        )
        db.session.add(participant)
        db.session.commit()
        return participant, None

    # ─── Démarrer un round ───────────────────────────────────
    @staticmethod
    def start_round(session_id):
        """Démarre un nouveau round : sélectionne une question aléatoire."""
        session = CombatSession.query.get(session_id)
        if not session:
            return None, "Session non trouvée"

        from models.exercise import ExerciseBlock, Exercise
        exercise = Exercise.query.get(session.exercise_id)
        if not exercise:
            return None, "Exercice non trouvé"

        # Sélectionner un bloc aléatoire (types supportés pour le combat)
        supported_types = ['qcm', 'short_answer', 'fill_blank']
        blocks = ExerciseBlock.query.filter(
            ExerciseBlock.exercise_id == session.exercise_id,
            ExerciseBlock.block_type.in_(supported_types)
        ).all()

        if not blocks:
            # Fallback : tous les blocs
            blocks = ExerciseBlock.query.filter_by(exercise_id=session.exercise_id).all()

        if not blocks:
            return None, "Aucune question disponible"

        block = random.choice(blocks)

        # Nouveau round
        session.current_round += 1
        session.current_phase = 'question'
        session.current_block_id = block.id
        session.status = 'active'

        # Reset les participants pour ce round
        for p in session.participants:
            if p.is_alive:
                p.reset_round()

        db.session.commit()

        # Préparer les données de la question
        question_data = {
            'block_id': block.id,
            'block_type': block.block_type,
            'title': block.title,
            'config': block.config_json,
            'round': session.current_round,
        }

        return question_data, None

    # ─── Soumettre une réponse ───────────────────────────────
    @staticmethod
    def submit_answer(session_id, student_id, answer):
        """Soumet la réponse d'un élève et détermine si elle est correcte."""
        session = CombatSession.query.get(session_id)
        if not session or session.current_phase != 'question':
            return None, "Pas en phase de question"

        participant = CombatParticipant.query.filter_by(
            combat_session_id=session_id, student_id=student_id
        ).first()
        if not participant or not participant.is_alive:
            return None, "Participant non trouvé ou KO"
        if participant.answered:
            return {'already_answered': True, 'is_correct': participant.is_correct}, None

        # Grader la réponse
        from models.exercise import ExerciseBlock, Exercise
        block = ExerciseBlock.query.get(session.current_block_id)
        exercise = Exercise.query.get(session.exercise_id)
        if not block:
            return None, "Bloc non trouvé"

        from routes.student_auth import grade_block
        accept_typos = exercise.accept_typos if exercise else False
        is_correct, _ = grade_block(block, answer, accept_typos)

        participant.answered = True
        participant.is_correct = is_correct
        db.session.commit()

        # Vérifier si tous ont répondu
        alive_participants = [p for p in session.participants if p.is_alive]
        all_answered = all(p.answered for p in alive_participants)

        return {
            'is_correct': is_correct,
            'all_answered': all_answered,
        }, None

    # ─── Soumettre une action ────────────────────────────────
    @staticmethod
    def submit_action(session_id, student_id, skill_id, target_id, target_type='monster'):
        """Soumet l'action choisie par un élève (skill + cible)."""
        session = CombatSession.query.get(session_id)
        if not session or session.current_phase != 'action':
            return None, "Pas en phase d'action"

        participant = CombatParticipant.query.filter_by(
            combat_session_id=session_id, student_id=student_id
        ).first()
        if not participant or not participant.is_alive or not participant.is_correct:
            return None, "Non autorisé à agir"
        if participant.action_submitted:
            return {'already_submitted': True}, None

        # Valider le skill
        snapshot = participant.snapshot_json or {}
        skills = snapshot.get('skills', [])
        skill = next((s for s in skills if s.get('id') == skill_id), None)
        if not skill:
            return None, "Compétence non trouvée"

        # Valider le coût mana
        cost = skill.get('cost', 0)
        if participant.current_mana < cost:
            return None, "Mana insuffisant"

        participant.selected_action_json = {
            'skill_id': skill_id,
            'skill': skill,
            'target_id': target_id,
            'target_type': target_type,
        }
        participant.action_submitted = True
        db.session.commit()

        # Vérifier si tous les élèves corrects ont soumis leur action
        correct_alive = [p for p in session.participants if p.is_alive and p.is_correct]
        all_submitted = all(p.action_submitted for p in correct_alive)

        return {
            'submitted': True,
            'all_submitted': all_submitted,
        }, None

    # ─── Passer en phase action ──────────────────────────────
    @staticmethod
    def transition_to_action(session_id):
        """Passe la session en phase action."""
        session = CombatSession.query.get(session_id)
        if session:
            session.current_phase = 'action'
            db.session.commit()

    # ─── Exécuter le round ───────────────────────────────────
    @staticmethod
    def execute_round(session_id):
        """Exécute toutes les actions des élèves, puis les monstres attaquent."""
        session = CombatSession.query.get(session_id)
        if not session:
            return None, "Session non trouvée"

        session.current_phase = 'execute'
        animations = []

        # --- Phase 1 : Actions des élèves (tri par intelligence) ---
        acting_participants = [
            p for p in session.participants
            if p.is_alive and p.is_correct and p.action_submitted and p.selected_action_json
        ]
        # Trier par intelligence (initiative)
        acting_participants.sort(
            key=lambda p: (p.snapshot_json or {}).get('stats', {}).get('intelligence', 5),
            reverse=True
        )

        for p in acting_participants:
            action = p.selected_action_json
            skill = action.get('skill', {})
            target_id = action.get('target_id')
            target_type = action.get('target_type', 'monster')

            stats = (p.snapshot_json or {}).get('stats', {})
            skill_type = skill.get('type', 'attack')
            skill_damage = skill.get('damage', 0)
            skill_cost = skill.get('cost', 0)
            skill_heal = skill.get('heal', 0)

            # Déduire le mana
            p.current_mana = max(0, p.current_mana - skill_cost)

            if skill_type == 'attack':
                # Attaque physique
                target = CombatMonster.query.get(target_id) if target_type == 'monster' else None
                if target and target.is_alive:
                    force = stats.get('force', 5)
                    damage = max(1, int(force * skill_damage / 10) - target.defense)
                    actual = target.take_damage(damage)
                    animations.append({
                        'type': 'attack',
                        'attacker_type': 'player',
                        'attacker_id': p.id,
                        'attacker_name': (p.snapshot_json or {}).get('name', '?'),
                        'target_type': 'monster',
                        'target_id': target.id,
                        'target_name': target.name,
                        'skill_name': skill.get('name', '?'),
                        'damage': actual,
                        'target_hp': target.current_hp,
                        'target_max_hp': target.max_hp,
                        'killed': not target.is_alive,
                    })

            elif skill_type == 'heal':
                # Soin — cible un allié ou soi-même
                if target_type == 'player':
                    target_p = CombatParticipant.query.get(target_id)
                else:
                    target_p = p  # Auto-soin par défaut

                if target_p and target_p.is_alive:
                    intelligence = stats.get('intelligence', 5)
                    heal_amount = max(1, int(intelligence * skill_heal / 10))
                    target_p.current_hp = min(target_p.max_hp, target_p.current_hp + heal_amount)
                    animations.append({
                        'type': 'heal',
                        'attacker_type': 'player',
                        'attacker_id': p.id,
                        'attacker_name': (p.snapshot_json or {}).get('name', '?'),
                        'target_type': 'player',
                        'target_id': target_p.id,
                        'target_name': (target_p.snapshot_json or {}).get('name', '?'),
                        'skill_name': skill.get('name', '?'),
                        'heal': heal_amount,
                        'target_hp': target_p.current_hp,
                        'target_max_hp': target_p.max_hp,
                    })

            elif skill_type == 'defense':
                # Buff de défense (simplifié : réduit les dégâts du prochain tour monstre)
                animations.append({
                    'type': 'defense',
                    'attacker_type': 'player',
                    'attacker_id': p.id,
                    'attacker_name': (p.snapshot_json or {}).get('name', '?'),
                    'skill_name': skill.get('name', '?'),
                })

            elif skill_type == 'buff':
                animations.append({
                    'type': 'buff',
                    'attacker_type': 'player',
                    'attacker_id': p.id,
                    'attacker_name': (p.snapshot_json or {}).get('name', '?'),
                    'skill_name': skill.get('name', '?'),
                })

        # --- Phase 2 : Tour des monstres ---
        alive_monsters = [m for m in session.monsters if m.is_alive]
        alive_players = [p for p in session.participants if p.is_alive]

        for monster in alive_monsters:
            if not alive_players:
                break

            # IA simple : attaque l'élève avec le moins de HP
            target = min(alive_players, key=lambda p: p.current_hp)

            # Choisir un skill aléatoire
            skills = monster.skills_json or []
            if not skills:
                skills = [{'id': 'basic_attack', 'name': 'Attaque', 'type': 'physical', 'damage': 8, 'target': 'single'}]

            # Filtrer les skills single-target
            single_skills = [s for s in skills if s.get('target') == 'single']
            skill = random.choice(single_skills) if single_skills else skills[0]

            if skill.get('target') == 'all':
                # Attaque de zone sur tous les joueurs
                for target_p in alive_players:
                    damage = max(1, int(monster.attack * skill.get('damage', 8) / 10) -
                                 ((target_p.snapshot_json or {}).get('stats', {}).get('defense', 5)))
                    target_p.current_hp = max(0, target_p.current_hp - damage)
                    if target_p.current_hp <= 0:
                        target_p.is_alive = False

                    animations.append({
                        'type': 'monster_attack',
                        'attacker_type': 'monster',
                        'attacker_id': monster.id,
                        'attacker_name': monster.name,
                        'target_type': 'player',
                        'target_id': target_p.id,
                        'target_name': (target_p.snapshot_json or {}).get('name', '?'),
                        'skill_name': skill.get('name', '?'),
                        'damage': damage,
                        'target_hp': target_p.current_hp,
                        'target_max_hp': target_p.max_hp,
                        'killed': not target_p.is_alive,
                    })
            else:
                # Attaque single-target
                skill_type = skill.get('type', 'physical')
                if skill_type == 'magical':
                    player_def = (target.snapshot_json or {}).get('stats', {}).get('defense_magique', 5)
                else:
                    player_def = (target.snapshot_json or {}).get('stats', {}).get('defense', 5)

                damage = max(1, int(monster.attack * skill.get('damage', 8) / 10) - player_def)
                target.current_hp = max(0, target.current_hp - damage)
                if target.current_hp <= 0:
                    target.is_alive = False

                animations.append({
                    'type': 'monster_attack',
                    'attacker_type': 'monster',
                    'attacker_id': monster.id,
                    'attacker_name': monster.name,
                    'target_type': 'player',
                    'target_id': target.id,
                    'target_name': (target.snapshot_json or {}).get('name', '?'),
                    'skill_name': skill.get('name', '?'),
                    'damage': damage,
                    'target_hp': target.current_hp,
                    'target_max_hp': target.max_hp,
                    'killed': not target.is_alive,
                })

            # Re-filtrer les joueurs vivants après chaque monstre
            alive_players = [p for p in session.participants if p.is_alive]

        # Régénération mana (petite quantité chaque tour)
        for p in session.participants:
            if p.is_alive:
                p.current_mana = min(p.max_mana, p.current_mana + 5)

        session.current_phase = 'round_end'
        db.session.commit()

        return animations, None

    # ─── Vérifier fin de combat ──────────────────────────────
    @staticmethod
    def check_end_condition(session_id):
        """Retourne 'victory', 'defeat', ou None si le combat continue."""
        session = CombatSession.query.get(session_id)
        if not session:
            return None

        alive_monsters = [m for m in session.monsters if m.is_alive]
        alive_players = [p for p in session.participants if p.is_alive]

        if not alive_monsters:
            return 'victory'
        if not alive_players:
            return 'defeat'
        return None

    # ─── Distribuer les récompenses ──────────────────────────
    @staticmethod
    def distribute_rewards(session_id):
        """Distribue XP et or aux élèves après la victoire."""
        session = CombatSession.query.get(session_id)
        if not session:
            return {}

        config = DIFFICULTY_CONFIGS.get(session.difficulty, DIFFICULTY_CONFIGS['medium'])
        xp_mult = config.get('xp_multiplier', 1.0)
        gold_mult = config.get('gold_multiplier', 1.0)

        base_xp = 50 * session.current_round
        base_gold = 20 * session.current_round

        rewards = {}
        from models.rpg import StudentRPGProfile
        for p in session.participants:
            rpg = StudentRPGProfile.query.filter_by(student_id=p.student_id).first()
            if not rpg:
                continue

            # Bonus pour être vivant
            alive_bonus = 1.5 if p.is_alive else 0.5
            xp = int(base_xp * xp_mult * alive_bonus)
            gold = int(base_gold * gold_mult * alive_bonus)

            old_level = rpg.level
            rpg.add_xp(xp)
            rpg.add_gold(gold)

            rewards[p.student_id] = {
                'xp': xp,
                'gold': gold,
                'leveled_up': rpg.level > old_level,
                'new_level': rpg.level,
            }

        session.status = 'completed'
        session.ended_at = datetime.utcnow()
        db.session.commit()

        return rewards

    # ─── Fin du combat (défaite) ─────────────────────────────
    @staticmethod
    def end_combat_defeat(session_id):
        """Termine le combat en défaite — XP consolation réduite."""
        session = CombatSession.query.get(session_id)
        if not session:
            return {}

        rewards = {}
        from models.rpg import StudentRPGProfile
        for p in session.participants:
            rpg = StudentRPGProfile.query.filter_by(student_id=p.student_id).first()
            if not rpg:
                continue
            xp = max(10, 10 * session.current_round)
            rpg.add_xp(xp)
            rewards[p.student_id] = {'xp': xp, 'gold': 0, 'leveled_up': False, 'new_level': rpg.level}

        session.status = 'completed'
        session.ended_at = datetime.utcnow()
        db.session.commit()
        return rewards
