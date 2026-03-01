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

logger = logging.getLogger(__name__)

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

def register_combat_events(socketio):
    """Enregistre les événements SocketIO pour le combat."""

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
        if not session_id or not student_id:
            return

        room = f'combat_{session_id}'
        join_room(room)

        participant, error = CombatEngine.join_session(session_id, student_id)
        if error:
            emit('combat:error', {'error': error})
            return

        logger.info(f"Élève {student_id} rejoint le combat {session_id}")

        # Notifier tout le monde
        session = CombatSession.query.get(session_id)
        emit('combat:student_joined', {
            'participant': participant.to_dict(),
        }, room=room)
        emit('combat:state_update', session.get_state(), room=room)

    @socketio.on('combat:start_round')
    def on_start_round(data):
        """Le prof démarre un nouveau round."""
        session_id = data.get('session_id')
        if not session_id:
            return

        room = f'combat_{session_id}'
        question_data, error = CombatEngine.start_round(session_id)
        if error:
            emit('combat:error', {'error': error}, room=room)
            return

        logger.info(f"Round {question_data['round']} démarré pour combat {session_id}")

        # Envoyer la question à tous
        emit('combat:question', question_data, room=room)

        # Envoyer aussi l'état mis à jour
        session = CombatSession.query.get(session_id)
        emit('combat:state_update', session.get_state(), room=room)

    @socketio.on('combat:submit_answer')
    def on_submit_answer(data):
        """Un élève soumet sa réponse."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        answer = data.get('answer', {})

        if not session_id or not student_id:
            return

        room = f'combat_{session_id}'
        result, error = CombatEngine.submit_answer(session_id, student_id, answer)
        if error:
            emit('combat:error', {'error': error})
            return

        # Envoyer le résultat à l'élève
        emit('combat:answer_result', {
            'student_id': student_id,
            'is_correct': result.get('is_correct', False),
        })

        # Notifier la progression à tout le monde
        session = CombatSession.query.get(session_id)
        alive_count = sum(1 for p in session.participants if p.is_alive)
        answered_count = sum(1 for p in session.participants if p.is_alive and p.answered)
        emit('combat:answer_progress', {
            'answered': answered_count,
            'total': alive_count,
            'student_id': student_id,
            'is_correct': result.get('is_correct', False),
        }, room=room)

        # Si tous ont répondu, passer en phase mouvement d'abord
        if result.get('all_answered'):
            CombatEngine.transition_to_move(session_id)
            session = CombatSession.query.get(session_id)
            emit('combat:all_answered', {
                'phase': 'move',
            }, room=room)
            emit('combat:state_update', session.get_state(), room=room)

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

        # Vérifier si tous les joueurs corrects ont bougé (ou skip)
        session = CombatSession.query.get(session_id)
        correct_alive = [p for p in session.participants if p.is_alive and p.is_correct]
        all_moved = all(p.has_moved for p in correct_alive)
        if all_moved:
            CombatEngine.transition_to_action(session_id)
            session = CombatSession.query.get(session_id)
            emit('combat:phase_change', {'phase': 'action'}, room=room)
            emit('combat:state_update', session.get_state(), room=room)

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

        # Vérifier si tous ont bougé
        session = CombatSession.query.get(session_id)
        correct_alive = [p for p in session.participants if p.is_alive and p.is_correct]
        all_moved = all(p.has_moved for p in correct_alive)
        if all_moved:
            CombatEngine.transition_to_action(session_id)
            session = CombatSession.query.get(session_id)
            emit('combat:phase_change', {'phase': 'action'}, room=room)
            emit('combat:state_update', session.get_state(), room=room)

    @socketio.on('combat:force_move_end')
    def on_force_move_end(data):
        """Le prof force la fin de la phase de mouvement."""
        session_id = data.get('session_id')
        if not session_id:
            return
        room = f'combat_{session_id}'
        # Marquer tous comme ayant bougé
        session = CombatSession.query.get(session_id)
        if session:
            for p in session.participants:
                if p.is_alive and p.is_correct:
                    p.has_moved = True
            db.session.commit()
            CombatEngine.transition_to_action(session_id)
            session = CombatSession.query.get(session_id)
            emit('combat:phase_change', {'phase': 'action'}, room=room)
            emit('combat:state_update', session.get_state(), room=room)

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
        emit('combat:targets_in_range', {
            'skill_id': skill_id,
            'targets': targets,
        })

    @socketio.on('combat:submit_action')
    def on_submit_action(data):
        """Un élève choisit son action (skill + cible)."""
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        skill_id = data.get('skill_id')
        target_id = data.get('target_id')
        target_type = data.get('target_type', 'monster')

        if not session_id or not student_id or not skill_id:
            return

        room = f'combat_{session_id}'
        result, error = CombatEngine.submit_action(session_id, student_id, skill_id, target_id, target_type)
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

    def _execute_and_broadcast(session_id, room):
        """Exécute le round et broadcast les résultats."""
        animations, error = CombatEngine.execute_round(session_id)
        if error:
            emit('combat:error', {'error': error}, room=room)
            return

        # Envoyer les animations
        emit('combat:execute', {
            'animations': animations,
        }, room=room)

        # Vérifier la fin du combat
        end_result = CombatEngine.check_end_condition(session_id)
        if end_result == 'victory':
            rewards = CombatEngine.distribute_rewards(session_id)
            emit('combat:finished', {
                'result': 'victory',
                'rewards': {str(k): v for k, v in rewards.items()},
            }, room=room)
        elif end_result == 'defeat':
            rewards = CombatEngine.end_combat_defeat(session_id)
            emit('combat:finished', {
                'result': 'defeat',
                'rewards': {str(k): v for k, v in rewards.items()},
            }, room=room)
        else:
            # Envoyer l'état mis à jour
            session = CombatSession.query.get(session_id)
            emit('combat:state_update', session.get_state(), room=room)
