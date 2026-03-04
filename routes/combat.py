"""
Routes combat — SocketIO events + REST endpoints pour le système de combat RPG.
"""
from flask import Blueprint, request, jsonify, render_template, current_app
from flask_socketio import emit, join_room, leave_room
from flask_login import login_required, current_user
from extensions import db
from models.combat import CombatSession, CombatParticipant, CombatMonster
from services.combat_engine import CombatEngine
import logging
import time
import uuid

logger = logging.getLogger(__name__)

# Track phase tokens to prevent stale timeouts
phase_tokens = {}  # session_id -> current_phase_token

combat_bp = Blueprint('combat', __name__, url_prefix='/combat')


# ═══════════════════════════════════════════════════════════════════
#  REST ENDPOINTS (pour le prof)
# ═══════════════════════════════════════════════════════════════════

@combat_bp.route('/launch')
@login_required
def launch_page():
    """Page de lancement de combat (interface prof)."""
    from models.classroom import Classroom
    from models.exercise import Exercise
    classrooms = Classroom.query.filter_by(user_id=current_user.id).all()
    exercises = Exercise.query.filter_by(user_id=current_user.id, is_draft=False).all()
    active_sessions = CombatSession.query.filter(
        CombatSession.teacher_id == current_user.id,
        CombatSession.status.in_(['waiting', 'active'])
    ).all()
    return render_template('combat/launch.html',
                           classrooms=classrooms,
                           exercises=exercises,
                           active_sessions=active_sessions)


@combat_bp.route('/create', methods=['POST'])
@login_required
def create_combat():
    """Crée une session de combat."""
    data = request.get_json(silent=True) or {}
    classroom_id = data.get('classroom_id')
    exercise_id = data.get('exercise_id')
    difficulty = data.get('difficulty', 'medium')

    if not classroom_id or not exercise_id:
        return jsonify({'error': 'classroom_id et exercise_id requis'}), 400

    try:
        session = CombatEngine.create_session(
            teacher_id=current_user.id,
            classroom_id=classroom_id,
            exercise_id=exercise_id,
            difficulty=difficulty,
        )
        return jsonify({'success': True, 'session': session.to_dict()})
    except Exception as e:
        logger.error(f"Erreur création combat: {e}")
        return jsonify({'error': str(e)}), 500


@combat_bp.route('/<int:session_id>/arena')
@login_required
def arena(session_id):
    """Page HTML de l'arène Phaser.js (projetée par le prof)."""
    session = CombatSession.query.get_or_404(session_id)
    return render_template('combat/arena.html', session=session)


@combat_bp.route('/<int:session_id>/state')
def combat_state(session_id):
    """État actuel du combat (debug/fallback)."""
    session = CombatSession.query.get_or_404(session_id)
    return jsonify(session.get_state())


@combat_bp.route('/<int:session_id>/current_question')
@login_required
def current_question(session_id):
    """Teacher-only: returns the current block config WITH correct answers (for debug/testing)."""
    session = CombatSession.query.get_or_404(session_id)
    if not session.current_block_id:
        return jsonify({'error': 'No active question'}), 404
    from models.exercise import ExerciseBlock
    block = ExerciseBlock.query.get(session.current_block_id)
    if not block:
        return jsonify({'error': 'Block not found'}), 404
    return jsonify({
        'block_id': block.id,
        'block_type': block.block_type,
        'config': block.config_json,
    })


@combat_bp.route('/<int:session_id>/fix_skills', methods=['POST'])
@login_required
def fix_skills(session_id):
    """Temporary admin: patch participant snapshots to add default class skills."""
    session = CombatSession.query.get_or_404(session_id)
    from models.rpg import CLASS_BASE_SKILLS
    fixed = []
    for p in session.participants:
        snap = p.snapshot_json or {}
        if not snap.get('skills'):
            avatar_class = snap.get('avatar_class', 'guerrier')
            default_skills = list(CLASS_BASE_SKILLS.get(avatar_class, CLASS_BASE_SKILLS.get('guerrier', [])))
            snap['skills'] = default_skills
            p.snapshot_json = snap
            fixed.append({'participant_id': p.id, 'student_id': p.student_id, 'class': avatar_class, 'skills_count': len(default_skills)})
    db.session.commit()
    return jsonify({'fixed': fixed, 'total': len(fixed)})


@combat_bp.route('/version')
def combat_version():
    """Quick version check to verify deploy."""
    return jsonify({'version': '2026-03-04-v3', 'features': ['default_skills', 'ghost_fix', 'current_question', 'fix_skills']})


# ═══════════════════════════════════════════════════════════════════
#  API REST pour le mobile (JWT auth)
# ═══════════════════════════════════════════════════════════════════

@combat_bp.route('/api/join', methods=['POST'])
def api_join_combat():
    """Endpoint mobile pour rejoindre un combat (via JWT)."""
    from routes.api import jwt_required, _get_current_student
    # Cette route sera appelée par le mobile
    pass


@combat_bp.route('/api/active/<int:classroom_id>')
def api_active_combat(classroom_id):
    """Retourne le combat actif pour une classe donnée."""
    session = CombatSession.query.filter_by(
        classroom_id=classroom_id,
        status='active'
    ).first()
    if not session:
        session = CombatSession.query.filter_by(
            classroom_id=classroom_id,
            status='waiting'
        ).first()
    if not session:
        return jsonify({'active': False})
    return jsonify({'active': True, 'session': session.to_dict()})


# ═══════════════════════════════════════════════════════════════════
#  SOCKETIO EVENTS
# ═══════════════════════════════════════════════════════════════════

def register_combat_events(socketio, app=None):
    """Enregistre les événements SocketIO pour le combat."""
    if app is None:
        from flask import current_app
        app_ref = current_app._get_current_object()
    else:
        app_ref = app

    @socketio.on('combat:teacher_join')
    def on_teacher_join(data):
        """Le prof rejoint la room du combat."""
        session_id = data.get('session_id')
        if not session_id:
            return
        room = f'combat_{session_id}'
        join_room(room)
        logger.info(f"Prof rejoint la room combat {session_id}")

        session = CombatSession.query.get(session_id)
        if session:
            emit('combat:state_update', session.get_state(), room=room)

    @socketio.on('combat:student_join')
    def on_student_join(data):
        """Un élève rejoint le combat."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        logger.info(f"[Combat:{session_id}] student_join: student_id={student_id}")
        if not session_id or not student_id:
            return

        room = f'combat_{session_id}'
        join_room(room)

        try:
            participant, error = CombatEngine.join_session(session_id, student_id)
            if error:
                logger.error(f"[Combat:{session_id}] join_session ERROR: {error}")
                emit('combat:error', {'error': error})
                return

            logger.info(f"[Combat:{session_id}] Élève {student_id} rejoint — hp={participant.current_hp}/{participant.max_hp} class={participant.snapshot_json.get('avatar_class','?')}")

            # Notifier tout le monde
            session = CombatSession.query.get(session_id)
            emit('combat:student_joined', {
                'participant': participant.to_dict(),
            }, room=room)
            emit('combat:state_update', session.get_state(), room=room)
        except Exception as e:
            logger.error(f"[Combat:{session_id}] student_join EXCEPTION: {e}", exc_info=True)
            emit('combat:error', {'error': f'Erreur serveur: {str(e)}'})

    @socketio.on('combat:start_round')
    def on_start_round(data):
        """Le prof démarre un nouveau round. Flow: move → question → action → execute."""
        session_id = data.get('session_id')
        if not session_id:
            logger.error("[Combat] start_round: no session_id in data")
            return

        room = f'combat_{session_id}'
        logger.info(f"[Combat] start_round called for session {session_id}")

        try:
            round_data, error = CombatEngine.start_round(session_id)
        except Exception as e:
            logger.error(f"[Combat] start_round EXCEPTION: {e}", exc_info=True)
            emit('combat:error', {'error': f'Erreur serveur: {str(e)}'}, room=room)
            return

        if error:
            logger.error(f"[Combat] start_round error: {error}")
            emit('combat:error', {'error': error}, room=room)
            return

        logger.info(f"[Combat] Round {round_data['round']} started, phase=move")

        # Envoyer l'état mis à jour (phase=move, tout le monde peut se déplacer)
        session = CombatSession.query.get(session_id)
        state = session.get_state()
        logger.info(f"[Combat] Sending state_update: phase={state['phase']}, round={state['round']}, participants={len(state['participants'])}, monsters={len(state['monsters'])}")
        emit('combat:state_update', state, room=room)

        # Start 20-second auto-timeout for move phase
        phase_token = str(uuid.uuid4())
        phase_tokens[session_id] = phase_token
        logger.info(f"[Combat:{session_id}] Starting 20s auto-timeout for move phase (token={phase_token})")
        _auto_timeout_move_phase(socketio, session_id, room, phase_token, 20)

    @socketio.on('combat:submit_answer')
    def on_submit_answer(data):
        """Un élève soumet sa réponse."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        answer = data.get('answer', {})

        if not session_id or not student_id:
            return

        room = f'combat_{session_id}'
        logger.info(f"[Combat:{session_id}] submit_answer: student={student_id} answer_keys={list(answer.keys()) if isinstance(answer, dict) else type(answer)}")

        result, error = CombatEngine.submit_answer(session_id, student_id, answer)
        if error:
            logger.error(f"[Combat:{session_id}] submit_answer ERROR: {error}")
            emit('combat:error', {'error': error})
            return

        is_correct = result.get('is_correct', False)
        logger.info(f"[Combat:{session_id}] submit_answer: student={student_id} correct={is_correct} all_answered={result.get('all_answered')}")

        # Envoyer le résultat à l'élève
        emit('combat:answer_result', {
            'student_id': student_id,
            'is_correct': is_correct,
        })

        # Notifier la progression à tout le monde
        session = CombatSession.query.get(session_id)
        alive_count = sum(1 for p in session.participants if p.is_alive)
        answered_count = sum(1 for p in session.participants if p.is_alive and p.answered)
        logger.info(f"[Combat:{session_id}] Answer progress: {answered_count}/{alive_count}")
        emit('combat:answer_progress', {
            'answered': answered_count,
            'total': alive_count,
            'student_id': student_id,
            'is_correct': is_correct,
        }, room=room)

        # Si tous ont répondu, passer en phase action
        if result.get('all_answered'):
            # Check if any correct players can attack
            session = CombatSession.query.get(session_id)
            correct_alive = [p for p in session.participants if p.is_alive and p.is_correct]
            logger.info(f"[Combat:{session_id}] All answered! correct_alive={len(correct_alive)}")
            if not correct_alive:
                # Personne n'a bien répondu → exécuter directement (monstres seulement)
                logger.info(f"[Combat:{session_id}] No correct answers → direct execute (monsters only)")
                _execute_and_broadcast(session_id, room)
            else:
                logger.info(f"[Combat:{session_id}] → transition to ACTION phase")
                CombatEngine.transition_to_action(session_id)
                session = CombatSession.query.get(session_id)
                emit('combat:all_answered', {
                    'phase': 'action',
                }, room=room)
                emit('combat:state_update', session.get_state(), room=room)
                # Start 30-second auto-timeout for action phase
                phase_token = str(uuid.uuid4())
                phase_tokens[session_id] = phase_token
                logger.info(f"[Combat:{session_id}] Starting 30s auto-timeout for action phase (token={phase_token})")
                _auto_timeout_action_phase(socketio, session_id, room, phase_token, 30)

    @socketio.on('combat:request_move_tiles')
    def on_request_move_tiles(data):
        """Un élève demande ses cases de déplacement accessibles."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        if not session_id or not student_id:
            return

        participant = CombatParticipant.query.filter_by(
            combat_session_id=session_id, student_id=student_id
        ).first()
        if not participant:
            return

        tiles = CombatEngine.get_reachable_tiles(session_id, participant.id)
        emit('combat:move_tiles', {
            'tiles': tiles,
            'participant_id': participant.id,
        })

    @socketio.on('combat:move')
    def on_move(data):
        """Un élève se déplace sur la grille."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        target_x = data.get('target_x')
        target_y = data.get('target_y')

        if session_id is None or student_id is None or target_x is None or target_y is None:
            return

        room = f'combat_{session_id}'
        result, error = CombatEngine.move_participant(session_id, student_id, target_x, target_y)
        if error:
            emit('combat:error', {'error': error})
            return

        # Broadcast le déplacement à tous
        emit('combat:move_result', result, room=room)

        # Vérifier si tous les joueurs vivants ont bougé
        session = CombatSession.query.get(session_id)
        alive_players = [p for p in session.participants if p.is_alive]
        all_moved = all(p.has_moved for p in alive_players)
        if all_moved:
            _transition_to_question_phase(session_id, room)

    @socketio.on('combat:skip_move')
    def on_skip_move(data):
        """Un élève skip son déplacement."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        if not session_id or not student_id:
            return

        room = f'combat_{session_id}'
        participant = CombatParticipant.query.filter_by(
            combat_session_id=session_id, student_id=student_id
        ).first()
        if participant:
            participant.has_moved = True
            db.session.commit()

        # Vérifier si tous ont bougé → passer en phase question
        session = CombatSession.query.get(session_id)
        alive_players = [p for p in session.participants if p.is_alive]
        all_moved = all(p.has_moved for p in alive_players)
        if all_moved:
            _transition_to_question_phase(session_id, room)

    @socketio.on('combat:force_move_end')
    def on_force_move_end(data):
        """Le prof force la fin de la phase de mouvement → passe en question."""
        session_id = data.get('session_id')
        if not session_id:
            return
        room = f'combat_{session_id}'
        # Marquer tous comme ayant bougé
        session = CombatSession.query.get(session_id)
        if session:
            for p in session.participants:
                if p.is_alive:
                    p.has_moved = True
            db.session.commit()
            _transition_to_question_phase(session_id, room)

    @socketio.on('combat:request_targets')
    def on_request_targets(data):
        """Un élève demande les cibles à portée pour un skill."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        skill_id = data.get('skill_id')
        if not session_id or not student_id or not skill_id:
            return

        participant = CombatParticipant.query.filter_by(
            combat_session_id=session_id, student_id=student_id
        ).first()
        if not participant:
            return

        targets = CombatEngine.get_targets_in_range(session_id, participant.id, skill_id)
        # Flatten targets to a single list for the client
        all_targets = []
        for m in targets.get('monsters', []):
            m['target_type'] = 'monster'
            all_targets.append(m)
        for a in targets.get('allies', []):
            a['target_type'] = 'player'
            all_targets.append(a)

        # Get skill range for visualization
        snapshot = participant.snapshot_json or {}
        skills = snapshot.get('skills', [])
        skill_data = next((s for s in skills if s.get('id') == skill_id), {})
        skill_range = skill_data.get('range', 1)
        skill_type = skill_data.get('type', 'attack')

        emit('combat:targets_in_range', {
            'skill_id': skill_id,
            'targets': all_targets,
            'skill_range': skill_range,
            'skill_type': skill_type,
            'player_x': participant.grid_x,
            'player_y': participant.grid_y,
        })

        # Also emit attack range to teacher arena for visualization
        room = f'combat_{session_id}'
        range_tiles = []
        combat_session = CombatSession.query.get(session_id)
        gw = combat_session.map_config_json.get('width', 10) if combat_session and combat_session.map_config_json else 10
        gh = combat_session.map_config_json.get('height', 8) if combat_session and combat_session.map_config_json else 8
        for rx in range(gw):
            for ry in range(gh):
                dist = abs(rx - participant.grid_x) + abs(ry - participant.grid_y)
                if 0 < dist <= skill_range:
                    range_tiles.append({'x': rx, 'y': ry})
        emit('combat:show_attack_range', {
            'player_id': f'player_{student_id}',
            'tiles': range_tiles,
            'skill_type': skill_type,
        }, room=room)

    @socketio.on('combat:request_skills_availability')
    def on_request_skills_availability(data):
        """Vérifie quels skills ont au moins une cible à portée."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        if not session_id or not student_id:
            return

        participant = CombatParticipant.query.filter_by(
            combat_session_id=session_id, student_id=student_id
        ).first()
        if not participant:
            return

        snapshot = participant.snapshot_json or {}
        skills = snapshot.get('skills', [])
        available_skill_ids = []

        for skill in skills:
            skill_type = skill.get('type', 'attack')
            # Defense and buff skills are always available (self-target)
            if skill_type in ('defense', 'buff'):
                available_skill_ids.append(skill.get('id'))
                continue

            targets = CombatEngine.get_targets_in_range(session_id, participant.id, skill.get('id'))
            if skill_type == 'attack':
                has_valid = any(t.get('in_range') for t in targets.get('monsters', []))
            elif skill_type == 'heal':
                has_valid = any(t.get('in_range') for t in targets.get('allies', []))
            else:
                has_valid = True

            if has_valid:
                available_skill_ids.append(skill.get('id'))

        emit('combat:skills_availability', {
            'available_skills': available_skill_ids,
        })

    @socketio.on('combat:submit_action')
    def on_submit_action(data):
        """Un élève choisit son action (skill + cible)."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        skill_id = data.get('skill_id')
        target_id = data.get('target_id')
        target_type = data.get('target_type', 'monster')
        combo_streak = data.get('combo_streak', 0)

        if not session_id or not student_id or not skill_id:
            return

        room = f'combat_{session_id}'
        result, error = CombatEngine.submit_action(session_id, student_id, skill_id, target_id, target_type, combo_streak)
        if error:
            emit('combat:error', {'error': error})
            return

        # Notifier la progression
        session = CombatSession.query.get(session_id)
        correct_alive = sum(1 for p in session.participants if p.is_alive and p.is_correct)
        submitted = sum(1 for p in session.participants if p.is_alive and p.is_correct and p.action_submitted)
        emit('combat:action_progress', {
            'submitted': submitted,
            'total': correct_alive,
            'student_id': student_id,
        }, room=room)

        # Si toutes les actions sont soumises, exécuter le round
        if result.get('all_submitted'):
            _execute_and_broadcast(session_id, room)

    @socketio.on('combat:force_execute')
    def on_force_execute(data):
        """Le prof force l'exécution (timeout ou skip)."""
        session_id = data.get('session_id')
        if not session_id:
            return
        room = f'combat_{session_id}'
        _execute_and_broadcast(session_id, room)

    @socketio.on('combat:next_round')
    def on_next_round(data):
        """Le prof demande le prochain round."""
        session_id = data.get('session_id')
        if not session_id:
            return
        room = f'combat_{session_id}'
        on_start_round(data)

    def _transition_to_question_phase(session_id, room):
        """Helper: transition move → question. Envoie la question à tous.
        NOTE: Uses socketio.emit() not emit() because this can be called from background tasks."""
        question_data, error = CombatEngine.transition_to_question(session_id)
        if error:
            socketio.emit('combat:error', {'error': error}, room=room)
            return
        logger.info(f"[Combat] All moved → sending question to room {room}")
        socketio.emit('combat:question', question_data, room=room)
        session = CombatSession.query.get(session_id)
        socketio.emit('combat:state_update', session.get_state(), room=room)
        # Start 45-second auto-timeout for question phase
        phase_token = str(uuid.uuid4())
        phase_tokens[session_id] = phase_token
        logger.info(f"[Combat:{session_id}] Starting 45s auto-timeout for question phase (token={phase_token})")
        _auto_timeout_question_phase(socketio, session_id, room, phase_token, 45)

    def _execute_and_broadcast(session_id, room):
        """Exécute le round et broadcast les résultats.
        NOTE: Uses socketio.emit() not emit() because this can be called from background tasks."""
        logger.info(f"[Combat:{session_id}] === EXECUTE_AND_BROADCAST START ===")

        animations, error = CombatEngine.execute_round(session_id)
        if error:
            logger.error(f"[Combat:{session_id}] execute_round ERROR: {error}")
            socketio.emit('combat:error', {'error': error}, room=room)
            return

        logger.info(f"[Combat:{session_id}] execute_round OK: {len(animations)} animations")
        for i, anim in enumerate(animations):
            logger.info(f"[Combat:{session_id}]   anim[{i}]: type={anim.get('type')} "
                        f"attacker={anim.get('attacker_name','?')} → target={anim.get('target_name','?')} "
                        f"dmg={anim.get('damage','?')} hp={anim.get('target_hp','?')}/{anim.get('target_max_hp','?')} "
                        f"killed={anim.get('killed', False)}")

        # Envoyer les animations
        socketio.emit('combat:execute', {
            'animations': animations,
        }, room=room)

        # Vérifier la fin du combat
        end_result = CombatEngine.check_end_condition(session_id)
        logger.info(f"[Combat:{session_id}] check_end_condition: {end_result}")

        if end_result == 'victory':
            rewards = CombatEngine.distribute_rewards(session_id)
            logger.info(f"[Combat:{session_id}] VICTORY! rewards={rewards}")
            socketio.emit('combat:finished', {
                'result': 'victory',
                'rewards': {str(k): v for k, v in rewards.items()},
            }, room=room)
        elif end_result == 'defeat':
            rewards = CombatEngine.end_combat_defeat(session_id)
            logger.info(f"[Combat:{session_id}] DEFEAT! rewards={rewards}")
            socketio.emit('combat:finished', {
                'result': 'defeat',
                'rewards': {str(k): v for k, v in rewards.items()},
            }, room=room)
        else:
            # Envoyer l'état mis à jour
            session = CombatSession.query.get(session_id)
            logger.info(f"[Combat:{session_id}] Round end — phase={session.current_phase}, round={session.current_round}")
            socketio.emit('combat:state_update', session.get_state(), room=room)

            # Auto-avance au prochain round via background task
            logger.info(f"[Combat:{session_id}] Scheduling auto-advance in 3 seconds...")
            _auto_advance_round(socketio, session_id, room)

    def _auto_timeout_move_phase(sio, session_id, room, phase_token, timeout_sec):
        """Auto-force move phase end after timeout."""
        app = app_ref

        def _do_timeout():
            time.sleep(timeout_sec)
            with app.app_context():
                # Check if this phase token is still current
                if phase_tokens.get(session_id) != phase_token:
                    logger.info(f"[Combat:{session_id}] Skipping stale move phase timeout (token mismatch)")
                    return
                try:
                    session = CombatSession.query.get(session_id)
                    if not session or session.current_phase != 'move':
                        logger.info(f"[Combat:{session_id}] Move phase timeout: phase is no longer 'move' (current={session.current_phase if session else 'N/A'})")
                        return
                    logger.info(f"[Combat:{session_id}] Move phase timeout triggered! Forcing move end...")
                    # Mark all alive players as moved
                    for p in session.participants:
                        if p.is_alive:
                            p.has_moved = True
                    db.session.commit()
                    # Transition to question phase
                    _transition_to_question_phase(session_id, room)
                except Exception as e:
                    logger.error(f"[Combat:{session_id}] Move phase timeout EXCEPTION: {e}")
                    import traceback
                    traceback.print_exc()

        sio.start_background_task(_do_timeout)

    def _auto_timeout_question_phase(sio, session_id, room, phase_token, timeout_sec):
        """Auto-force question phase end after timeout."""
        app = app_ref

        def _do_timeout():
            time.sleep(timeout_sec)
            with app.app_context():
                # Check if this phase token is still current
                if phase_tokens.get(session_id) != phase_token:
                    logger.info(f"[Combat:{session_id}] Skipping stale question phase timeout (token mismatch)")
                    return
                try:
                    session = CombatSession.query.get(session_id)
                    if not session or session.current_phase != 'question':
                        logger.info(f"[Combat:{session_id}] Question phase timeout: phase is no longer 'question' (current={session.current_phase if session else 'N/A'})")
                        return
                    logger.info(f"[Combat:{session_id}] Question phase timeout triggered! Forcing transition to action...")
                    # Mark all alive participants as answered
                    for p in session.participants:
                        if p.is_alive:
                            p.answered = True
                    db.session.commit()
                    # Transition to action phase
                    correct_alive = [p for p in session.participants if p.is_alive and p.is_correct]
                    if not correct_alive:
                        logger.info(f"[Combat:{session_id}] No correct answers after timeout → direct execute")
                        _execute_and_broadcast(session_id, room)
                    else:
                        logger.info(f"[Combat:{session_id}] Question timeout → transition to ACTION phase")
                        CombatEngine.transition_to_action(session_id)
                        session = CombatSession.query.get(session_id)
                        sio.emit('combat:all_answered', {'phase': 'action'}, room=room)
                        sio.emit('combat:state_update', session.get_state(), room=room)
                        # Start action phase timeout
                        new_phase_token = str(uuid.uuid4())
                        phase_tokens[session_id] = new_phase_token
                        logger.info(f"[Combat:{session_id}] Starting 30s auto-timeout for action phase (token={new_phase_token})")
                        _auto_timeout_action_phase(sio, session_id, room, new_phase_token, 30)
                except Exception as e:
                    logger.error(f"[Combat:{session_id}] Question phase timeout EXCEPTION: {e}")
                    import traceback
                    traceback.print_exc()

        sio.start_background_task(_do_timeout)

    def _auto_timeout_action_phase(sio, session_id, room, phase_token, timeout_sec):
        """Auto-force action phase end after timeout."""
        app = app_ref

        def _do_timeout():
            time.sleep(timeout_sec)
            with app.app_context():
                # Check if this phase token is still current
                if phase_tokens.get(session_id) != phase_token:
                    logger.info(f"[Combat:{session_id}] Skipping stale action phase timeout (token mismatch)")
                    return
                try:
                    session = CombatSession.query.get(session_id)
                    if not session or session.current_phase != 'action':
                        logger.info(f"[Combat:{session_id}] Action phase timeout: phase is no longer 'action' (current={session.current_phase if session else 'N/A'})")
                        return
                    logger.info(f"[Combat:{session_id}] Action phase timeout triggered! Forcing execute with submitted actions...")
                    _execute_and_broadcast(session_id, room)
                except Exception as e:
                    logger.error(f"[Combat:{session_id}] Action phase timeout EXCEPTION: {e}")
                    import traceback
                    traceback.print_exc()

        sio.start_background_task(_do_timeout)

    def _auto_advance_round(sio, session_id, room):
        """Auto-avance au prochain round après un court délai."""
        app = app_ref

        def _do_advance():
            time.sleep(3)
            with app.app_context():
                try:
                    logger.info(f"[Combat:{session_id}] Auto-advance: calling start_round...")
                    result, error = CombatEngine.start_round(session_id)
                    if error:
                        logger.error(f"[Combat:{session_id}] Auto-advance start_round ERROR: {error}")
                        sio.emit('combat:error', {'error': f'Auto-advance failed: {error}'}, room=room)
                        return
                    logger.info(f"[Combat:{session_id}] Auto-advance OK: round={result['round']}")
                    sio.emit('combat:round_started', {
                        'round': result['round']
                    }, room=room)
                    session = CombatSession.query.get(session_id)
                    sio.emit('combat:state_update', session.get_state(), room=room)
                    logger.info(f"[Combat:{session_id}] Auto-advance: state_update sent, phase={session.current_phase}")
                except Exception as e:
                    logger.error(f"[Combat:{session_id}] Auto-advance EXCEPTION: {e}")
                    import traceback
                    traceback.print_exc()

        sio.start_background_task(_do_advance)
