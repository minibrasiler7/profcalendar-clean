#!/usr/bin/env python3
"""
Automated Combat Test Script for ProfCalendar
==============================================
Simulates a full combat session with 2 students via SocketIO.

Usage:
  python test_combat.py [--url URL] [--session SESSION_ID]

If no --session is provided, it tries to find the latest active combat session.
"""

import socketio
import time
import json
import sys
import argparse
import requests

# ── Configuration ──
DEFAULT_URL = 'https://profcalendar-clean.onrender.com'
TEACHER_EMAIL = 'loic.strauch@edu-vd.ch'
TEACHER_PASSWORD = 'Mondoudou7'
CLASSROOM_ID = 5  # 11VP6



class CombatTester:
    """Manages a full combat test simulation."""

    def __init__(self, server_url, session_id=None, student_ids=None):
        self.server_url = server_url.rstrip('/')
        self.session_id = session_id
        self.forced_student_ids = student_ids or []
        self.room = None
        self.phase = 'waiting'
        self.round_num = 0
        self.animations = []
        self.students = []
        self.monsters = []
        self.participants = []
        self.question = None
        self.skills = {}
        self.errors = []
        self.log = []

        # Teacher SocketIO client
        self.teacher_sio = socketio.Client(
            logger=False,
            reconnection=True,
            reconnection_attempts=3,
        )
        # Student SocketIO clients
        self.student_sios = []

        self._setup_teacher_handlers()

    def _log(self, msg, level='INFO'):
        ts = time.strftime('%H:%M:%S')
        line = f"[{ts}] [{level}] {msg}"
        self.log.append(line)
        print(line)

    def _setup_teacher_handlers(self):
        sio = self.teacher_sio

        @sio.on('connect')
        def on_connect():
            self._log('Teacher CONNECTED')

        @sio.on('disconnect')
        def on_disconnect():
            self._log('Teacher DISCONNECTED', 'WARN')

        @sio.on('combat:state_update')
        def on_state(data):
            self.phase = data.get('phase', '?')
            self.round_num = data.get('round', 0)
            self.participants = data.get('participants', [])
            self.monsters = data.get('monsters', [])
            alive_p = sum(1 for p in self.participants if p.get('is_alive'))
            alive_m = sum(1 for m in self.monsters if m.get('is_alive'))
            self._log(f"STATE: phase={self.phase} round={self.round_num} players={alive_p}/{len(self.participants)} monsters={alive_m}/{len(self.monsters)}")

        @sio.on('combat:execute')
        def on_execute(data):
            anims = data.get('animations', [])
            self._log(f"EXECUTE: {len(anims)} animations")
            for i, a in enumerate(anims):
                self._log(f"  anim[{i}]: {a.get('type')} {a.get('attacker_name','?')}→{a.get('target_name','?')} dmg={a.get('damage','?')} killed={a.get('killed', False)}")
            self.animations = anims

        @sio.on('combat:finished')
        def on_finished(data):
            self._log(f"FINISHED: {data.get('result')} rewards={data.get('rewards', {})}", 'SUCCESS')
            self.phase = 'finished'

        @sio.on('combat:error')
        def on_error(data):
            self._log(f"ERROR: {data.get('error')}", 'ERROR')
            self.errors.append(data.get('error'))

        @sio.on('combat:round_started')
        def on_round_started(data):
            self._log(f"ROUND_STARTED: round={data.get('round')}")

    def _create_student_client(self, student_id, student_name):
        """Create a SocketIO client for a student."""
        sio = socketio.Client(logger=False, reconnection=True, reconnection_attempts=3)
        state = {
            'id': student_id,
            'name': student_name,
            'phase': 'waiting',
            'question': None,
            'answer_result': None,
            'skills': [],
            'skills_availability': [],
            'move_tiles': [],
            'targets': [],
        }

        @sio.on('connect')
        def on_connect():
            self._log(f"Student {student_name} (id={student_id}) CONNECTED")

        @sio.on('disconnect')
        def on_disconnect():
            self._log(f"Student {student_name} DISCONNECTED", 'WARN')

        @sio.on('combat:state_update')
        def on_state(data):
            state['phase'] = data.get('phase', '?')
            self._log(f"[{student_name}] STATE: phase={state['phase']}")

        @sio.on('combat:student_joined')
        def on_joined(data):
            p = data.get('participant', {})
            state['skills'] = data.get('skills', [])
            self._log(f"[{student_name}] JOINED: participant_id={p.get('id')} skills={len(state['skills'])}")

        @sio.on('combat:question')
        def on_question(data):
            state['question'] = data
            state['phase'] = 'question'
            self._log(f"[{student_name}] QUESTION: block_type={data.get('block_type')} title={data.get('title', '?')[:40]}")

        @sio.on('combat:answer_result')
        def on_answer_result(data):
            state['answer_result'] = data.get('is_correct')
            self._log(f"[{student_name}] ANSWER: correct={data.get('is_correct')}")

        @sio.on('combat:all_answered')
        def on_all_answered(data):
            state['phase'] = data.get('phase', 'action')
            self._log(f"[{student_name}] ALL_ANSWERED → {state['phase']}")

        @sio.on('combat:move_tiles')
        def on_move_tiles(data):
            state['move_tiles'] = data.get('tiles', [])
            self._log(f"[{student_name}] MOVE_TILES: {len(state['move_tiles'])} tiles available")

        @sio.on('combat:targets_in_range')
        def on_targets(data):
            state['targets'] = data.get('targets', [])
            self._log(f"[{student_name}] TARGETS: {len(state['targets'])} targets for skill={data.get('skill_id')}")

        @sio.on('combat:skills_availability')
        def on_skills_avail(data):
            state['skills_availability'] = data.get('available_skills', [])
            self._log(f"[{student_name}] SKILLS_AVAILABLE: {state['skills_availability']}")

        @sio.on('combat:execute')
        def on_execute(data):
            anims = data.get('animations', [])
            self._log(f"[{student_name}] EXECUTE: {len(anims)} animations")
            state['phase'] = 'execute'

        @sio.on('combat:finished')
        def on_finished(data):
            self._log(f"[{student_name}] FINISHED: {data.get('result')}")
            state['phase'] = 'finished'

        @sio.on('combat:error')
        def on_error(data):
            self._log(f"[{student_name}] ERROR: {data.get('error')}", 'ERROR')

        @sio.on('combat:phase_change')
        def on_phase_change(data):
            state['phase'] = data.get('phase', '?')
            self._log(f"[{student_name}] PHASE_CHANGE: {state['phase']}")

        return sio, state

    def login_and_get_students(self):
        """Login as teacher and get student IDs."""
        self._log("Logging in as teacher...")

        # Create a session to login
        s = requests.Session()
        # Get CSRF token if needed
        login_url = f"{self.server_url}/auth/login"
        r = s.post(login_url, data={
            'email': TEACHER_EMAIL,
            'password': TEACHER_PASSWORD,
        }, allow_redirects=False)
        self._log(f"Login response: {r.status_code}")

        # Get students in classroom
        api_url = f"{self.server_url}/api/classroom/{CLASSROOM_ID}/students"
        r = s.get(api_url)
        if r.status_code == 200:
            students = r.json()
            self._log(f"Found {len(students)} students in classroom {CLASSROOM_ID}")
            return students[:2]  # Just take 2 for testing
        else:
            self._log(f"Failed to get students: {r.status_code}", 'ERROR')
            return []

    def find_active_session(self):
        """Find the latest active combat session."""
        self._log("Looking for active combat sessions...")
        s = requests.Session()
        s.post(f"{self.server_url}/auth/login", data={
            'email': TEACHER_EMAIL,
            'password': TEACHER_PASSWORD,
        }, allow_redirects=False)

        # Use the combat version endpoint to check server is up
        r = s.get(f"{self.server_url}/combat/version")
        if r.status_code == 200:
            self._log(f"Server version: {r.json()}")

        # Try to get active combat sessions via API
        r = s.get(f"{self.server_url}/api/combat/sessions?classroom_id={CLASSROOM_ID}&status=active,waiting")
        if r.status_code == 200:
            sessions = r.json()
            if sessions:
                latest = sessions[-1]
                self._log(f"Found session {latest['id']} (status={latest.get('status')})")
                return latest['id']
        self._log("No active sessions found", 'WARN')
        return None

    def connect_teacher(self):
        """Connect teacher SocketIO client."""
        self._log(f"Connecting teacher to {self.server_url}...")
        self.teacher_sio.connect(
            self.server_url,
            transports=['websocket'],
            wait_timeout=10,
        )
        time.sleep(1)

        self.room = f'combat_{self.session_id}'
        self.teacher_sio.emit('combat:teacher_join', {
            'session_id': self.session_id,
        })
        time.sleep(2)
        self._log(f"Teacher joined room {self.room}")

    def connect_students(self, student_ids):
        """Connect student SocketIO clients and join combat."""
        for i, sid in enumerate(student_ids):
            name = f"Bot_{i+1}"
            self._log(f"Connecting student {name} (id={sid})...")
            sio, state = self._create_student_client(sid, name)
            sio.connect(
                self.server_url,
                transports=['websocket'],
                wait_timeout=10,
            )
            time.sleep(0.5)

            sio.emit('combat:student_join', {
                'session_id': self.session_id,
                'student_id': sid,
            })
            time.sleep(1)

            self.student_sios.append((sio, state, sid))

        self._log(f"{len(self.student_sios)} students connected")

    def wait_for_phase(self, target_phase, timeout=30):
        """Wait until the combat reaches a specific phase."""
        start = time.time()
        while time.time() - start < timeout:
            if self.phase == target_phase:
                return True
            if self.phase == 'finished':
                return True
            time.sleep(0.5)
        self._log(f"TIMEOUT waiting for phase '{target_phase}' (current={self.phase})", 'WARN')
        return False

    def start_round(self):
        """Teacher starts a new round."""
        self._log(f"=== Starting round (current phase={self.phase}) ===")
        self.teacher_sio.emit('combat:start_round', {
            'session_id': self.session_id,
        })
        time.sleep(2)

    def do_student_moves(self):
        """All students request move tiles and move to a random valid tile."""
        self._log("--- Move Phase ---")
        for sio, state, sid in self.student_sios:
            # Request move tiles
            sio.emit('combat:request_move_tiles', {
                'session_id': self.session_id,
                'student_id': sid,
            })
            time.sleep(1)

            tiles = state['move_tiles']
            if tiles:
                # Move to first available tile
                target = tiles[0]
                tx = target.get('x', target[0] if isinstance(target, list) else 0)
                ty = target.get('y', target[1] if isinstance(target, list) else 0)
                self._log(f"[{state['name']}] Moving to ({tx}, {ty})")
                sio.emit('combat:move', {
                    'session_id': self.session_id,
                    'student_id': sid,
                    'target_x': tx,
                    'target_y': ty,
                })
            else:
                self._log(f"[{state['name']}] No move tiles → skipping move")
                sio.emit('combat:skip_move', {
                    'session_id': self.session_id,
                    'student_id': sid,
                })
            time.sleep(0.5)

        # Wait for question phase (auto-transition after all moved)
        self.wait_for_phase('question', timeout=25)

    def do_student_answers(self):
        """All students answer the question (submit a dummy answer)."""
        self._log("--- Question Phase ---")
        time.sleep(2)  # Wait for question to arrive

        for sio, state, sid in self.student_sios:
            q = state.get('question')
            if not q:
                self._log(f"[{state['name']}] No question received, waiting...", 'WARN')
                time.sleep(3)
                q = state.get('question')

            if q:
                block_type = q.get('block_type', 'mcq')
                self._log(f"[{state['name']}] Answering {block_type} question...")

                # Build a plausible answer based on question type
                answer = {}
                config = q.get('config', {})
                if block_type == 'mcq':
                    options = config.get('options', [])
                    if options:
                        # Try to find correct answer, fall back to first option
                        correct = next((o for o in options if o.get('is_correct')), options[0])
                        answer = {'selected': correct.get('id', 0)}
                elif block_type == 'true_false':
                    answer = {'selected': True}
                elif block_type == 'fill_blank':
                    answer = {'text': 'test'}
                elif block_type == 'number':
                    answer = {'value': 0}
                elif block_type == 'open':
                    answer = {'text': 'test answer'}
                else:
                    answer = {'selected': 0}

                sio.emit('combat:submit_answer', {
                    'session_id': self.session_id,
                    'student_id': sid,
                    'block_id': q.get('block_id'),
                    'answer': answer,
                })
            else:
                self._log(f"[{state['name']}] Still no question → submitting empty answer")
                sio.emit('combat:submit_answer', {
                    'session_id': self.session_id,
                    'student_id': sid,
                    'block_id': 0,
                    'answer': {'selected': 0},
                })
            time.sleep(0.5)

        # Wait for action phase
        self.wait_for_phase('action', timeout=50)

    def do_student_actions(self):
        """Students who answered correctly choose their action."""
        self._log("--- Action Phase ---")
        time.sleep(1)

        for sio, state, sid in self.student_sios:
            if state.get('answer_result') is False:
                self._log(f"[{state['name']}] Wrong answer → no action")
                continue

            # Request skills availability
            sio.emit('combat:request_skills_availability', {
                'session_id': self.session_id,
                'student_id': sid,
            })
            time.sleep(1)

            available = state.get('skills_availability', [])
            skills = state.get('skills', [])

            if not available and skills:
                # Fall back to first skill
                available = [skills[0].get('id')]

            if available and skills:
                # Pick first available skill
                skill_id = available[0]
                skill = next((s for s in skills if s.get('id') == skill_id), skills[0])
                self._log(f"[{state['name']}] Using skill: {skill.get('name', skill_id)}")

                # Request targets
                sio.emit('combat:request_targets', {
                    'session_id': self.session_id,
                    'student_id': sid,
                    'skill_id': skill_id,
                })
                time.sleep(1)

                targets = state.get('targets', [])
                if targets:
                    target = targets[0]
                    self._log(f"[{state['name']}] Targeting: {target.get('name', '?')} (id={target.get('id')})")
                    sio.emit('combat:submit_action', {
                        'session_id': self.session_id,
                        'student_id': sid,
                        'skill_id': skill_id,
                        'target_id': target.get('id'),
                        'target_type': target.get('type', 'monster'),
                        'combo_streak': 0,
                    })
                else:
                    self._log(f"[{state['name']}] No targets in range → skipping action")
            else:
                self._log(f"[{state['name']}] No skills available")
            time.sleep(0.5)

        # Wait for execute or timeout
        time.sleep(3)
        if self.phase == 'action':
            self._log("Waiting for execute phase (timeout will trigger)...")
            self.wait_for_phase('execute', timeout=35)

    def run_full_test(self, max_rounds=5):
        """Run a complete combat test."""
        self._log("=" * 60)
        self._log("COMBAT TEST STARTED")
        self._log("=" * 60)

        try:
            # Step 1: Connect teacher
            self.connect_teacher()
            time.sleep(2)

            if not self.participants:
                self._log("No participants yet. Connecting students...")

            # Step 2: Get student IDs
            student_ids = []
            if self.forced_student_ids:
                student_ids = self.forced_student_ids
            elif self.participants:
                student_ids = [p['student_id'] for p in self.participants[:2]]
            else:
                self._log("ERROR: No student IDs! Use --students <ID1> <ID2>", 'ERROR')
                return False

            self._log(f"Using student IDs: {student_ids}")

            # Step 3: Connect students
            self.connect_students(student_ids)
            time.sleep(2)

            # Step 4: Run rounds
            for round_num in range(1, max_rounds + 1):
                self._log(f"\n{'='*50}")
                self._log(f"ROUND {round_num}")
                self._log(f"{'='*50}")

                if self.phase == 'finished':
                    self._log("Combat finished!")
                    break

                # Wait for round_end phase from auto-advance, or start manually
                if self.phase in ('waiting', 'round_end'):
                    self.start_round()
                    time.sleep(2)

                # Move phase
                if self.phase == 'move':
                    self.do_student_moves()

                # Question phase
                if self.phase == 'question':
                    self.do_student_answers()

                # Action phase
                if self.phase == 'action':
                    self.do_student_actions()

                # Wait for execute to complete and auto-advance
                self._log("Waiting for round to complete...")
                start_wait = time.time()
                while self.phase not in ('round_end', 'waiting', 'move', 'finished') and time.time() - start_wait < 30:
                    time.sleep(1)

                if self.phase == 'finished':
                    break

                # Give auto-advance time to kick in
                time.sleep(5)

            # Summary
            self._log(f"\n{'='*60}")
            self._log(f"TEST COMPLETE")
            self._log(f"{'='*60}")
            self._log(f"Rounds played: {self.round_num}")
            self._log(f"Final phase: {self.phase}")
            self._log(f"Errors encountered: {len(self.errors)}")
            for err in self.errors:
                self._log(f"  - {err}", 'ERROR')

        except Exception as e:
            self._log(f"EXCEPTION: {e}", 'ERROR')
            import traceback
            traceback.print_exc()
        finally:
            # Disconnect all clients
            self._log("Disconnecting...")
            for sio, state, sid in self.student_sios:
                try:
                    sio.disconnect()
                except:
                    pass
            try:
                self.teacher_sio.disconnect()
            except:
                pass

        return len(self.errors) == 0


def main():
    parser = argparse.ArgumentParser(description='ProfCalendar Combat Tester')
    parser.add_argument('--url', default=DEFAULT_URL, help='Server URL')
    parser.add_argument('--session', type=int, help='Combat session ID')
    parser.add_argument('--rounds', type=int, default=3, help='Max rounds to play')
    parser.add_argument('--students', nargs='+', type=int, help='Student IDs to use')
    args = parser.parse_args()

    if not args.session:
        print("No --session provided.")
        print("Create a combat session from the teacher interface first, then run:")
        print(f"  python test_combat.py --session <SESSION_ID> --students <ID1> <ID2>")
        print()
        print("Example:")
        print(f"  python test_combat.py --session 62 --students 34 35 --rounds 3")
        sys.exit(1)

    if not args.students:
        print("No --students provided.")
        print("Specify student IDs with: --students <ID1> <ID2>")
        sys.exit(1)

    tester = CombatTester(args.url, args.session, student_ids=args.students)
    success = tester.run_full_test(max_rounds=args.rounds)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
