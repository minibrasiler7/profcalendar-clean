"""
Combat Engine — Logique de combat RPG tactique en classe.
Gère la création de sessions, les rounds, les réponses, les actions,
le déplacement, la portée, et l'exécution.
"""
import random
import math
from collections import deque
from datetime import datetime
from extensions import db
from models.combat import (
    CombatSession, CombatParticipant, CombatMonster,
    MONSTER_PRESETS, DIFFICULTY_CONFIGS
)


# ═══════════════════════════════════════════════════════════════════
#  TILE TYPES pour la carte
# ═══════════════════════════════════════════════════════════════════
TILE_GRASS = 'grass'
TILE_STONE = 'stone'
TILE_DIRT = 'dirt'
TILE_WATER = 'water'      # Obstacle (infranchissable)
TILE_WALL = 'wall'         # Obstacle surélevé (infranchissable)

OBSTACLE_TILES = {TILE_WATER, TILE_WALL}


class CombatEngine:
    """Moteur de combat RPG tactique"""

    # ─── Création de session ─────────────────────────────────
    @staticmethod
    def create_session(teacher_id, classroom_id, exercise_id, difficulty='medium'):
        """Crée une session de combat avec grille dynamique et monstres adaptés."""
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

        # NOTE: Use 1 as default - the grid will be resized when combat actually starts
        # This prevents oversized grids when only 1 player connects out of a large class
        num_students = 1  # Will be adjusted in resize_for_players()

        # Grille compacte par défaut (sera redimensionnée au lancement)
        grid_w = 7
        grid_h = 5

        # Générer la carte avec obstacles
        tile_map, obstacles = CombatEngine._generate_map(grid_w, grid_h)

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
                'width': grid_w,
                'height': grid_h,
                'tile_size': 64,
                'tiles': tile_map,
                'obstacles': obstacles,
            },
        )
        db.session.add(session)
        db.session.flush()

        # Calculer et placer les monstres dynamiquement
        CombatEngine._spawn_monsters(session, config, num_students, avg_level, grid_w, grid_h, obstacles)

        db.session.commit()
        return session

    @staticmethod
    def _generate_map(width, height):
        """Génère une carte avec ~15% d'obstacles, garantissant un chemin."""
        tile_types = [TILE_GRASS, TILE_STONE, TILE_DIRT]
        tile_map = []
        obstacles = []

        # Remplir la carte de tuiles de base
        for row in range(height):
            row_tiles = []
            for col in range(width):
                row_tiles.append(random.choice(tile_types))
            tile_map.append(row_tiles)

        # Placer des obstacles (~15% des cases, pas sur les bords gauche/droit)
        num_obstacles = int(width * height * 0.12)
        safe_left = 3    # Pas d'obstacle dans les 3 colonnes de gauche (spawn joueurs)
        safe_right = width - 3  # Ni dans les 3 de droite (spawn monstres)

        placed = 0
        attempts = 0
        while placed < num_obstacles and attempts < num_obstacles * 5:
            attempts += 1
            ox = random.randint(safe_left, safe_right - 1)
            oy = random.randint(0, height - 1)

            # Vérifier que la case n'est pas déjà un obstacle
            if tile_map[oy][ox] in OBSTACLE_TILES:
                continue

            obstacle_type = random.choice([TILE_WATER, TILE_WALL])
            tile_map[oy][ox] = obstacle_type
            obstacles.append({'x': ox, 'y': oy, 'type': obstacle_type})
            placed += 1

        # Vérifier qu'un chemin existe entre gauche et droite (BFS)
        # Si non, retirer des obstacles aléatoirement
        start = (1, height // 2)
        end = (width - 2, height // 2)
        if not CombatEngine._path_exists(tile_map, width, height, start, end):
            # Retirer la moitié des obstacles et réessayer
            for obs in obstacles[:len(obstacles) // 2]:
                tile_map[obs['y']][obs['x']] = TILE_STONE
            obstacles = obstacles[len(obstacles) // 2:]

        return tile_map, obstacles

    @staticmethod
    def _path_exists(tile_map, width, height, start, end):
        """Vérifie qu'un chemin existe via BFS."""
        visited = set()
        queue = deque([start])
        visited.add(start)

        while queue:
            x, y = queue.popleft()
            if x == end[0] and y == end[1]:
                return True
            for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                    if tile_map[ny][nx] not in OBSTACLE_TILES:
                        visited.add((nx, ny))
                        queue.append((nx, ny))
        return False

    @staticmethod
    def _spawn_monsters(session, config, num_players, avg_level, grid_w, grid_h, obstacles):
        """Place les monstres dynamiquement selon le nombre de joueurs et leur niveau."""
        obstacle_set = {(o['x'], o['y']) for o in obstacles}

        # Nombre dynamique de monstres
        base_count = num_players + max(1, num_players // 3)
        level_bonus = avg_level // 3
        total_monsters = base_count + level_bonus

        # Types de monstres selon la difficulté
        difficulty = session.difficulty
        if difficulty == 'easy':
            pool = [('slime', 0.6), ('goblin', 0.4)]
        elif difficulty == 'medium':
            pool = [('goblin', 0.4), ('slime', 0.3), ('orc', 0.3)]
        elif difficulty == 'hard':
            pool = [('orc', 0.35), ('skeleton', 0.35), ('goblin', 0.3)]
        else:  # boss
            pool = [('dragon', 0.15), ('orc', 0.35), ('skeleton', 0.3), ('goblin', 0.2)]

        # Générer la liste de monstres
        monster_types = []
        for m_type, weight in pool:
            count = max(1, round(total_monsters * weight))
            monster_types.extend([m_type] * count)
        random.shuffle(monster_types)
        monster_types = monster_types[:total_monsters]

        # Placer sur le côté droit de la grille
        spawn_x_start = grid_w - 3
        available_positions = []
        for gx in range(spawn_x_start, grid_w):
            for gy in range(grid_h):
                if (gx, gy) not in obstacle_set:
                    available_positions.append((gx, gy))
        random.shuffle(available_positions)

        for i, m_type in enumerate(monster_types):
            preset = MONSTER_PRESETS.get(m_type)
            if not preset:
                continue

            level_offset = 0
            if difficulty == 'boss' and m_type == 'dragon':
                level_offset = 2
            elif difficulty == 'hard':
                level_offset = 1

            level = max(1, avg_level + level_offset)
            hp = preset['base_hp'] + preset['hp_per_level'] * (level - 1)
            atk = preset['base_attack'] + preset['attack_per_level'] * (level - 1)
            defense = preset['base_defense'] + preset['defense_per_level'] * (level - 1)
            mag_def = preset['base_magic_defense'] + preset['magic_defense_per_level'] * (level - 1)

            # Position
            if i < len(available_positions):
                gx, gy = available_positions[i]
            else:
                gx, gy = grid_w - 1, i % grid_h

            # Nommer les monstres
            type_count = sum(1 for j in range(i) if monster_types[j] == m_type)
            name = f"{preset['name']} {type_count + 1}" if monster_types.count(m_type) > 1 else preset['name']

            monster = CombatMonster(
                combat_session_id=session.id,
                monster_type=m_type,
                name=name,
                level=level,
                max_hp=hp,
                current_hp=hp,
                attack=atk,
                defense=defense,
                magic_defense=mag_def,
                grid_x=gx,
                grid_y=gy,
                is_alive=True,
                skills_json=preset['skills'],
            )
            db.session.add(monster)

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
        from models.rpg import StudentRPGProfile, CLASS_MOVEMENT
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
        move_range = CLASS_MOVEMENT.get(avatar_class, 3)
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
            'move_range': move_range,
        }

        # Position sur la grille (côté gauche, éviter les obstacles)
        map_config = session.map_config_json or {}
        grid_h = map_config.get('height', 8)
        tiles = map_config.get('tiles', [])
        obstacle_set = {(o['x'], o['y']) for o in map_config.get('obstacles', [])}

        # Trouver les positions libres côté gauche
        existing_positions = set()
        for p in session.participants:
            existing_positions.add((p.grid_x, p.grid_y))

        available = []
        for gx in range(0, 3):
            for gy in range(grid_h):
                if (gx, gy) not in obstacle_set and (gx, gy) not in existing_positions:
                    available.append((gx, gy))

        if available:
            grid_x, grid_y = available[0]
        else:
            existing_count = CombatParticipant.query.filter_by(combat_session_id=session_id).count()
            grid_x = existing_count % 3
            grid_y = min(existing_count, grid_h - 1)

        participant = CombatParticipant(
            combat_session_id=session_id,
            student_id=student_id,
            snapshot_json=snapshot,
            current_hp=max_hp,
            max_hp=max_hp,
            current_mana=max_mana,
            max_mana=max_mana,
            grid_x=grid_x,
            grid_y=grid_y,
            is_alive=True,
        )
        db.session.add(participant)
        db.session.commit()
        return participant, None

    # ─── Redimensionner pour le nombre réel de joueurs ─────────
    @staticmethod
    def resize_for_players(session_id):
        """Redimensionne la grille et les monstres en fonction du nombre réel de joueurs connectés.
        Appelé au début du premier round."""
        session = CombatSession.query.get(session_id)
        if not session:
            return

        num_players = len([p for p in session.participants if p.is_alive])
        if num_players == 0:
            num_players = 1

        # Recalculer la taille de la grille
        grid_w = max(6, 5 + num_players)
        grid_h = max(5, 4 + max(1, num_players // 2))
        grid_w = min(grid_w, 14)
        grid_h = min(grid_h, 10)

        # Régénérer la carte
        tile_map, obstacles = CombatEngine._generate_map(grid_w, grid_h)

        session.map_config_json = {
            'width': grid_w,
            'height': grid_h,
            'tile_size': 64,
            'tiles': tile_map,
            'obstacles': obstacles,
        }

        # Supprimer les anciens monstres et en recréer
        for m in session.monsters:
            db.session.delete(m)
        db.session.flush()

        # Calculer le niveau moyen
        from models.rpg import StudentRPGProfile
        rpg_profiles = []
        for p in session.participants:
            rpg = StudentRPGProfile.query.filter_by(student_id=p.student_id).first()
            if rpg:
                rpg_profiles.append(rpg)
        avg_level = max(1, int(sum(r.level for r in rpg_profiles) / len(rpg_profiles))) if rpg_profiles else 1

        config = DIFFICULTY_CONFIGS.get(session.difficulty, DIFFICULTY_CONFIGS['medium'])
        obstacle_set = {(o['x'], o['y']) for o in obstacles}

        CombatEngine._spawn_monsters(session, config, num_players, avg_level, grid_w, grid_h, obstacles)

        # Replacer les joueurs sur le côté gauche si nécessaire
        existing_positions = set()
        for p in session.participants:
            if p.grid_x >= grid_w or p.grid_y >= grid_h:
                # Player is outside new grid, reposition
                available = []
                for gx in range(0, 3):
                    for gy in range(grid_h):
                        if (gx, gy) not in obstacle_set and (gx, gy) not in existing_positions:
                            available.append((gx, gy))
                if available:
                    p.grid_x, p.grid_y = available[0]
            existing_positions.add((p.grid_x, p.grid_y))

        db.session.commit()

    # ─── Pathfinding BFS ───────────────────────────────────────
    @staticmethod
    def get_reachable_tiles(session_id, participant_id):
        """Retourne les cases accessibles pour un participant (BFS avec portée de mouvement)."""
        session = CombatSession.query.get(session_id)
        participant = CombatParticipant.query.get(participant_id)
        if not session or not participant:
            return []

        map_config = session.map_config_json or {}
        width = map_config.get('width', 10)
        height = map_config.get('height', 8)
        tiles = map_config.get('tiles', [])

        snapshot = participant.snapshot_json or {}
        move_range = snapshot.get('move_range', 3)

        # Construire la grille d'occupation
        occupied = set()
        for p in session.participants:
            if p.is_alive and p.id != participant_id:
                occupied.add((p.grid_x, p.grid_y))
        for m in session.monsters:
            if m.is_alive:
                occupied.add((m.grid_x, m.grid_y))

        # BFS depuis la position du joueur
        start = (participant.grid_x, participant.grid_y)
        visited = {start: 0}
        queue = deque([(start, 0)])
        reachable = [{'x': start[0], 'y': start[1], 'distance': 0}]

        while queue:
            (cx, cy), dist = queue.popleft()
            if dist >= move_range:
                continue
            for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                    # Vérifier obstacle
                    if ny < len(tiles) and nx < len(tiles[ny]):
                        if tiles[ny][nx] in OBSTACLE_TILES:
                            continue
                    # Vérifier occupation
                    if (nx, ny) in occupied:
                        continue
                    visited[(nx, ny)] = dist + 1
                    queue.append(((nx, ny), dist + 1))
                    reachable.append({'x': nx, 'y': ny, 'distance': dist + 1})

        return reachable

    @staticmethod
    def get_targets_in_range(session_id, participant_id, skill_id):
        """Retourne les cibles valides pour un skill donné (basé sur la portée)."""
        session = CombatSession.query.get(session_id)
        participant = CombatParticipant.query.get(participant_id)
        if not session or not participant:
            return {'monsters': [], 'allies': []}

        snapshot = participant.snapshot_json or {}
        skills = snapshot.get('skills', [])
        skill = next((s for s in skills if s.get('id') == skill_id), None)
        if not skill:
            return {'monsters': [], 'allies': []}

        skill_range = skill.get('range', 1)
        skill_type = skill.get('type', 'attack')
        px, py = participant.grid_x, participant.grid_y

        def manhattan_distance(x1, y1, x2, y2):
            return abs(x1 - x2) + abs(y1 - y2)

        targets = {'monsters': [], 'allies': []}

        if skill_type in ('attack',):
            for m in session.monsters:
                if m.is_alive:
                    dist = manhattan_distance(px, py, m.grid_x, m.grid_y)
                    in_range = dist <= skill_range
                    targets['monsters'].append({
                        'id': m.id,
                        'name': m.name,
                        'current_hp': m.current_hp,
                        'max_hp': m.max_hp,
                        'distance': dist,
                        'in_range': in_range,
                        'grid_x': m.grid_x,
                        'grid_y': m.grid_y,
                    })

        if skill_type in ('heal', 'buff'):
            for p in session.participants:
                if p.is_alive:
                    dist = manhattan_distance(px, py, p.grid_x, p.grid_y)
                    in_range = dist <= skill_range
                    s = p.snapshot_json or {}
                    targets['allies'].append({
                        'id': p.id,
                        'name': s.get('name', f'Élève {p.student_id}'),
                        'current_hp': p.current_hp,
                        'max_hp': p.max_hp,
                        'distance': dist,
                        'in_range': in_range,
                        'grid_x': p.grid_x,
                        'grid_y': p.grid_y,
                    })

        return targets

    # ─── Mouvement ────────────────────────────────────────────
    @staticmethod
    def move_participant(session_id, student_id, target_x, target_y):
        """Déplace un participant vers une case cible si valide."""
        session = CombatSession.query.get(session_id)
        if not session or session.current_phase != 'move':
            return None, "Pas en phase de déplacement"

        participant = CombatParticipant.query.filter_by(
            combat_session_id=session_id, student_id=student_id
        ).first()
        if not participant or not participant.is_alive or not participant.is_correct:
            return None, "Non autorisé à se déplacer"

        # Vérifier que la case est accessible
        reachable = CombatEngine.get_reachable_tiles(session_id, participant.id)
        target_tile = next((t for t in reachable if t['x'] == target_x and t['y'] == target_y), None)
        if not target_tile:
            return None, "Case non accessible"

        old_x, old_y = participant.grid_x, participant.grid_y
        participant.grid_x = target_x
        participant.grid_y = target_y
        participant.has_moved = True
        db.session.commit()

        return {
            'student_id': student_id,
            'participant_id': participant.id,
            'from_x': old_x,
            'from_y': old_y,
            'to_x': target_x,
            'to_y': target_y,
        }, None

    # ─── Transition phase mouvement ───────────────────────────
    @staticmethod
    def transition_to_move(session_id):
        """Passe en phase de déplacement. Les élèves incorrects skipent automatiquement."""
        session = CombatSession.query.get(session_id)
        if session:
            session.current_phase = 'move'
            # Auto-skip move for incorrect players
            for p in session.participants:
                if p.is_alive and not p.is_correct:
                    p.has_moved = True
            db.session.commit()

    # ─── Démarrer un round ───────────────────────────────────
    @staticmethod
    def start_round(session_id):
        """Démarre un nouveau round : sélectionne une question aléatoire."""
        import logging
        logger = logging.getLogger(__name__)

        session = CombatSession.query.get(session_id)
        if not session:
            return None, "Session non trouvée"

        logger.info(f"[Combat] start_round session={session_id} current_round={session.current_round} participants={session.participants.count() if hasattr(session.participants, 'count') else len(session.participants)}")

        from models.exercise import ExerciseBlock, Exercise
        exercise = Exercise.query.get(session.exercise_id)
        if not exercise:
            return None, f"Exercice non trouvé (exercise_id={session.exercise_id})"

        # Sélectionner un bloc aléatoire (types supportés pour le combat)
        supported_types = ['qcm', 'short_answer', 'fill_blank']
        blocks = ExerciseBlock.query.filter(
            ExerciseBlock.exercise_id == session.exercise_id,
            ExerciseBlock.block_type.in_(supported_types)
        ).all()

        logger.info(f"[Combat] Found {len(blocks)} supported blocks for exercise {session.exercise_id}")

        if not blocks:
            blocks = ExerciseBlock.query.filter_by(exercise_id=session.exercise_id).all()
            logger.info(f"[Combat] Fallback: {len(blocks)} total blocks")

        if not blocks:
            return None, f"Aucune question disponible (exercise_id={session.exercise_id})"

        block = random.choice(blocks)
        logger.info(f"[Combat] Selected block: id={block.id} type={block.block_type} title='{block.title}'")

        # Au premier round, redimensionner la grille AVANT de modifier le round
        if session.current_round == 0:
            try:
                logger.info(f"[Combat] Resizing for {session.participants.count() if hasattr(session.participants, 'count') else len(session.participants)} players")
                CombatEngine.resize_for_players(session_id)
                # Re-fetch session after resize (it did its own commit)
                session = CombatSession.query.get(session_id)
                logger.info(f"[Combat] Resize complete, new grid: {session.map_config_json.get('width')}x{session.map_config_json.get('height')}")
            except Exception as e:
                logger.error(f"[Combat] resize_for_players FAILED: {e}", exc_info=True)
                return None, f"Erreur resize: {str(e)}"

        # Nouveau round
        session.current_round += 1
        session.current_phase = 'question'
        session.current_block_id = block.id
        session.status = 'active'

        # Reset les participants pour ce round
        for p in session.participants:
            if p.is_alive:
                p.reset_round()

        try:
            db.session.commit()
        except Exception as e:
            logger.error(f"[Combat] start_round commit FAILED: {e}", exc_info=True)
            db.session.rollback()
            return None, f"Erreur DB: {str(e)}"

        logger.info(f"[Combat] Round {session.current_round} started, phase=question, block={block.id}")

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

        snapshot = participant.snapshot_json or {}
        skills = snapshot.get('skills', [])
        skill = next((s for s in skills if s.get('id') == skill_id), None)
        if not skill:
            return None, "Compétence non trouvée"

        cost = skill.get('cost', 0)
        if participant.current_mana < cost:
            return None, "Mana insuffisant"

        # Valider la portée
        skill_range = skill.get('range', 99)
        if target_id and target_type == 'monster':
            target = CombatMonster.query.get(target_id)
            if target:
                dist = abs(participant.grid_x - target.grid_x) + abs(participant.grid_y - target.grid_y)
                if dist > skill_range:
                    return None, f"Cible hors de portée ({dist} > {skill_range})"
        elif target_id and target_type == 'player':
            target_p = CombatParticipant.query.get(target_id)
            if target_p:
                dist = abs(participant.grid_x - target_p.grid_x) + abs(participant.grid_y - target_p.grid_y)
                if dist > skill_range:
                    return None, f"Cible hors de portée ({dist} > {skill_range})"

        participant.selected_action_json = {
            'skill_id': skill_id,
            'skill': skill,
            'target_id': target_id,
            'target_type': target_type,
        }
        participant.action_submitted = True
        db.session.commit()

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
            skill_aoe = skill.get('aoe', 0)

            p.current_mana = max(0, p.current_mana - skill_cost)

            if skill_type == 'attack':
                if skill_aoe > 0:
                    # AoE attack — hit all monsters in range from target
                    center_monster = CombatMonster.query.get(target_id) if target_id else None
                    if center_monster:
                        cx, cy = center_monster.grid_x, center_monster.grid_y
                        for m in session.monsters:
                            if m.is_alive:
                                dist = abs(m.grid_x - cx) + abs(m.grid_y - cy)
                                if dist <= skill_aoe:
                                    force = stats.get('force', 5)
                                    damage = max(1, int(force * skill_damage / 10) - m.defense)
                                    actual = m.take_damage(damage)
                                    animations.append({
                                        'type': 'attack',
                                        'attacker_type': 'player', 'attacker_id': p.id,
                                        'attacker_name': (p.snapshot_json or {}).get('name', '?'),
                                        'target_type': 'monster', 'target_id': m.id,
                                        'target_name': m.name,
                                        'skill_name': skill.get('name', '?'),
                                        'damage': actual,
                                        'target_hp': m.current_hp, 'target_max_hp': m.max_hp,
                                        'killed': not m.is_alive,
                                        'is_aoe': True,
                                    })
                else:
                    # Single target attack
                    target = CombatMonster.query.get(target_id) if target_type == 'monster' else None
                    if target and target.is_alive:
                        force = stats.get('force', 5)
                        damage = max(1, int(force * skill_damage / 10) - target.defense)
                        actual = target.take_damage(damage)
                        animations.append({
                            'type': 'attack',
                            'attacker_type': 'player', 'attacker_id': p.id,
                            'attacker_name': (p.snapshot_json or {}).get('name', '?'),
                            'target_type': 'monster', 'target_id': target.id,
                            'target_name': target.name,
                            'skill_name': skill.get('name', '?'),
                            'damage': actual,
                            'target_hp': target.current_hp, 'target_max_hp': target.max_hp,
                            'killed': not target.is_alive,
                        })

            elif skill_type == 'heal':
                if target_type == 'player':
                    target_p = CombatParticipant.query.get(target_id)
                else:
                    target_p = p
                if target_p and target_p.is_alive:
                    intelligence = stats.get('intelligence', 5)
                    heal_amount = max(1, int(intelligence * skill_heal / 10))
                    target_p.current_hp = min(target_p.max_hp, target_p.current_hp + heal_amount)
                    animations.append({
                        'type': 'heal',
                        'attacker_type': 'player', 'attacker_id': p.id,
                        'attacker_name': (p.snapshot_json or {}).get('name', '?'),
                        'target_type': 'player', 'target_id': target_p.id,
                        'target_name': (target_p.snapshot_json or {}).get('name', '?'),
                        'skill_name': skill.get('name', '?'),
                        'heal': heal_amount,
                        'target_hp': target_p.current_hp, 'target_max_hp': target_p.max_hp,
                    })

            elif skill_type in ('defense', 'buff'):
                animations.append({
                    'type': skill_type,
                    'attacker_type': 'player', 'attacker_id': p.id,
                    'attacker_name': (p.snapshot_json or {}).get('name', '?'),
                    'skill_name': skill.get('name', '?'),
                })

        # --- Phase 2 : Tour des monstres (IA avec déplacement) ---
        alive_monsters = [m for m in session.monsters if m.is_alive]
        alive_players = [p for p in session.participants if p.is_alive]

        map_config = session.map_config_json or {}
        tiles = map_config.get('tiles', [])
        grid_w = map_config.get('width', 10)
        grid_h = map_config.get('height', 8)

        # Build occupied cells set (players + other monsters)
        occupied = set()
        for p in alive_players:
            occupied.add((p.grid_x, p.grid_y))
        for m in alive_monsters:
            occupied.add((m.grid_x, m.grid_y))

        for monster in alive_monsters:
            if not alive_players:
                break

            # Choisir un skill
            skills = monster.skills_json or []
            if not skills:
                skills = [{'id': 'basic_attack', 'name': 'Attaque', 'type': 'physical', 'damage': 8, 'target': 'single'}]

            skill = random.choice(skills)
            monster_range = 1  # Monstres ont portée mêlée par défaut

            # Cible : joueur avec le moins de HP
            target = min(alive_players, key=lambda p: p.current_hp)

            # IA : si hors de portée, se déplacer vers la cible
            dist = abs(monster.grid_x - target.grid_x) + abs(monster.grid_y - target.grid_y)
            if dist > monster_range:
                # Remove own position from occupied to allow movement
                occupied.discard((monster.grid_x, monster.grid_y))

                # Déplacer le monstre (max 2 cases vers la cible)
                move_budget = 2
                mx, my = monster.grid_x, monster.grid_y
                for _ in range(move_budget):
                    best_dx, best_dy = 0, 0
                    best_dist = abs(mx - target.grid_x) + abs(my - target.grid_y)
                    for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                        nx, ny = mx + dx, my + dy
                        if 0 <= nx < grid_w and 0 <= ny < grid_h:
                            # Check obstacle tiles
                            if ny < len(tiles) and nx < len(tiles[ny]):
                                if tiles[ny][nx] in OBSTACLE_TILES:
                                    continue
                            # Check occupied cells (don't walk into other entities)
                            if (nx, ny) in occupied:
                                continue
                            new_dist = abs(nx - target.grid_x) + abs(ny - target.grid_y)
                            if new_dist < best_dist:
                                best_dist = new_dist
                                best_dx, best_dy = dx, dy
                    if best_dx != 0 or best_dy != 0:
                        mx += best_dx
                        my += best_dy

                # Update occupied set
                occupied.add((mx, my))

                if mx != monster.grid_x or my != monster.grid_y:
                    animations.append({
                        'type': 'monster_move',
                        'monster_id': monster.id,
                        'monster_name': monster.name,
                        'from_x': monster.grid_x, 'from_y': monster.grid_y,
                        'to_x': mx, 'to_y': my,
                    })
                    monster.grid_x = mx
                    monster.grid_y = my

                dist = abs(monster.grid_x - target.grid_x) + abs(monster.grid_y - target.grid_y)

            # Attaquer si à portée
            if dist <= monster_range:
                if skill.get('target') == 'all':
                    for target_p in alive_players:
                        damage = max(1, int(monster.attack * skill.get('damage', 8) / 10) -
                                     ((target_p.snapshot_json or {}).get('stats', {}).get('defense', 5)))
                        target_p.current_hp = max(0, target_p.current_hp - damage)
                        if target_p.current_hp <= 0:
                            target_p.is_alive = False
                        animations.append({
                            'type': 'monster_attack',
                            'attacker_type': 'monster', 'attacker_id': monster.id,
                            'attacker_name': monster.name,
                            'target_type': 'player', 'target_id': target_p.id,
                            'target_name': (target_p.snapshot_json or {}).get('name', '?'),
                            'skill_name': skill.get('name', '?'),
                            'damage': damage,
                            'target_hp': target_p.current_hp, 'target_max_hp': target_p.max_hp,
                            'killed': not target_p.is_alive,
                        })
                else:
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
                        'attacker_type': 'monster', 'attacker_id': monster.id,
                        'attacker_name': monster.name,
                        'target_type': 'player', 'target_id': target.id,
                        'target_name': (target.snapshot_json or {}).get('name', '?'),
                        'skill_name': skill.get('name', '?'),
                        'damage': damage,
                        'target_hp': target.current_hp, 'target_max_hp': target.max_hp,
                        'killed': not target.is_alive,
                    })

            alive_players = [p for p in session.participants if p.is_alive]

        # Régénération mana
        for p in session.participants:
            if p.is_alive:
                p.current_mana = min(p.max_mana, p.current_mana + 5)

        session.current_phase = 'round_end'
        db.session.commit()

        return animations, None

    # ─── Vérifier fin de combat ──────────────────────────────
    @staticmethod
    def check_end_condition(session_id):
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
            alive_bonus = 1.5 if p.is_alive else 0.5
            xp = int(base_xp * xp_mult * alive_bonus)
            gold = int(base_gold * gold_mult * alive_bonus)
            old_level = rpg.level
            rpg.add_xp(xp)
            rpg.add_gold(gold)
            rewards[p.student_id] = {
                'xp': xp, 'gold': gold,
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
