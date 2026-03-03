/**
 * Socket.IO Client for Combat Arena (Isometric FFT-like)
 * Handles real-time communication between teacher projector and student devices
 */

class CombatSocket {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.gameInstance = null;
        this.callbacks = {};
    }

    connect() {
        this.socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 10
        });

        this.socket.on('connect', () => {
            console.log('Socket connected:', this.socket.id);
            this.connected = true;
            this.joinCombatRoom();
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.connected = false;
            this.showError('Connexion perdue avec le serveur');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.showError('Erreur de connexion: ' + error.message);
        });

        // ── State updates ──
        this.socket.on('combat:state_update', (state) => {
            console.log('State update:', state);
            if (this.gameInstance) {
                this.gameInstance.updateState(state);
            }
            // Update alive player count
            if (state && state.participants) {
                const alive = state.participants.filter(p => p.is_alive !== false).length;
                const el = document.getElementById('alive-count');
                if (el) el.textContent = alive;
            }
            this._fire('onStateUpdate', state);
        });

        this.socket.on('combat:student_joined', (data) => {
            console.log('Student joined:', data);
            if (this.gameInstance && data.participant) {
                this.gameInstance.addParticipant(data.participant);
            }
            this._fire('onStudentJoined', data);
        });

        // ── Question phase ──
        this.socket.on('combat:question', (questionData) => {
            console.log('Question received:', questionData);
            this.showQuestionOverlay(questionData);
            this._fire('onQuestion', questionData);
        });

        this.socket.on('combat:answer_progress', (progress) => {
            console.log('Answer progress:', progress);
            this.updateAnswerProgress(progress);
            this._fire('onAnswerProgress', progress);
        });

        this.socket.on('combat:all_answered', (data) => {
            console.log('All students answered, phase:', data.phase);
            this.hideQuestionOverlay();
            this.addCombatLogEntry('✓ Tous les élèves ont répondu', 'phase');
            this._fire('onAllAnswered', data);
        });

        // ── Phase changes ──
        this.socket.on('combat:phase_change', (data) => {
            console.log('Phase change:', data.phase);
            this.updatePhaseIndicator(data.phase);
            if (this.gameInstance && typeof this.gameInstance.onPhaseChange === 'function') {
                this.gameInstance.onPhaseChange(data.phase);
            }
            this._fire('onPhaseChange', data);
        });

        // ── Move phase ──
        this.socket.on('combat:move_result', (result) => {
            console.log('Move result:', result);
            if (this.gameInstance && typeof this.gameInstance.onMoveResult === 'function') {
                this.gameInstance.onMoveResult(result);
            }
            this._fire('onMoveResult', result);
        });

        // ── Action phase ──
        this.socket.on('combat:action_progress', (progress) => {
            console.log('Action progress:', progress);
            this._fire('onActionProgress', progress);
        });

        this.socket.on('combat:show_attack_range', (data) => {
            console.log('Show attack range:', data);
            if (this.gameInstance) {
                const type = data.skill_type === 'heal' ? 'heal' : 'attack';
                this.gameInstance.showHighlights(data.tiles, type);
            }
            this._fire('onShowAttackRange', data);
        });

        // ── Round started ──
        this.socket.on('combat:round_started', (data) => {
            console.log('Round started:', data);
            const roundNum = data.round || '?';
            document.getElementById('round-number').textContent = 'Round ' + roundNum;
            this.addCombatLogEntry(`══ Round ${roundNum} ══`, 'phase');
            this._fire('onRoundStarted', data);
        });

        // ── Execution ──
        this.socket.on('combat:execute', (executionData) => {
            console.log('Executing animations:', executionData);
            // Log each animation to combat log
            if (executionData.animations) {
                for (const anim of executionData.animations) {
                    this._logAnimation(anim);
                }
            }
            if (this.gameInstance && typeof this.gameInstance.playAnimations === 'function') {
                this.gameInstance.playAnimations(executionData.animations);
            }
            this._fire('onExecute', executionData);
        });

        // ── Combat end ──
        this.socket.on('combat:finished', (result) => {
            console.log('Combat finished:', result);
            this.showFinishedScreen(result);
            this._fire('onFinished', result);
        });

        this.socket.on('combat:error', (errorData) => {
            console.error('Combat error:', errorData);
            this.showError(errorData.error || 'Une erreur est survenue');
            this._fire('onError', errorData);
        });
    }

    _fire(event, data) {
        if (this.callbacks[event]) this.callbacks[event](data);
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    joinCombatRoom() {
        if (!this.socket || !this.connected) return;
        console.log('Joining combat room:', SESSION_ID);
        this.socket.emit('combat:teacher_join', { session_id: SESSION_ID });
    }

    startRound() {
        if (!this.connected) { this.showError('Non connecté'); return; }
        this.socket.emit('combat:start_round', { session_id: SESSION_ID });
    }

    forceExecute() {
        if (!this.connected) { this.showError('Non connecté'); return; }
        this.socket.emit('combat:force_execute', { session_id: SESSION_ID });
    }

    forceMoveEnd() {
        if (!this.connected) { this.showError('Non connecté'); return; }
        console.log('Forcing move phase end');
        this.socket.emit('combat:force_move_end', { session_id: SESSION_ID });
    }

    setGameInstance(instance) {
        this.gameInstance = instance;
        console.log('Game instance set');
    }

    // ── UI helpers ──

    updatePhaseIndicator(phase) {
        const el = document.getElementById('phase-name');
        const indicator = document.getElementById('phase-indicator');
        if (!el) return;

        const labels = {
            'waiting': 'Attente',
            'question': 'Question',
            'move': 'Déplacement',
            'action': 'Action',
            'execute': 'Exécution',
            'monster_turn': 'Tour Monstres',
            'round_end': 'Fin du Round',
        };
        el.textContent = labels[phase] || phase;

        if (indicator) {
            indicator.className = 'phase-indicator';
            if (phase === 'question') indicator.classList.add('phase-question');
            else if (phase === 'move') indicator.classList.add('phase-move');
            else if (phase === 'action') indicator.classList.add('phase-action');
            else if (phase === 'execute') indicator.classList.add('phase-execute');
        }
    }

    updateAnswerProgress(progress) {
        const total = progress.total || 1;
        const answered = progress.answered || 0;
        const pct = Math.round((answered / total) * 100);

        const fill = document.getElementById('overlay-progress-fill');
        const info = document.getElementById('overlay-progress');
        if (fill) fill.style.width = pct + '%';
        if (info) info.textContent = answered + '/' + total;
    }

    showQuestionOverlay(qData) {
        const overlay = document.getElementById('overlay-message');
        const title = document.getElementById('overlay-title');
        const progress = document.getElementById('overlay-progress');

        if (overlay && title) {
            title.textContent = qData.title || 'Les élèves répondent...';
            if (progress) progress.textContent = '0/?';
            overlay.style.display = 'block';
        }
        this.addCombatLogEntry('Round ' + (qData.round || '?') + ' — ' + (qData.title || 'Question'), 'phase');
    }

    hideQuestionOverlay() {
        const overlay = document.getElementById('overlay-message');
        if (overlay) overlay.style.display = 'none';
    }

    showFinishedScreen(result) {
        const overlay = document.getElementById('overlay-message');
        const title = document.getElementById('overlay-title');
        const isVictory = result.result === 'victory';

        // Show Phaser end screen with particles
        if (this.gameInstance && typeof this.gameInstance.showCombatEndScreen === 'function') {
            this.gameInstance.showCombatEndScreen(isVictory);
        }

        if (overlay && title) {
            title.textContent = isVictory ? '🎉 VICTOIRE!' : '💀 DÉFAITE...';
            overlay.style.display = 'block';
            overlay.style.backgroundColor = isVictory ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
            overlay.style.borderColor = isVictory ? '#10b981' : '#ef4444';
        }
        this.addCombatLogEntry(isVictory ? '🎉 VICTOIRE!' : '💀 DÉFAITE...', 'phase');
    }

    addCombatLogEntry(message, type = 'default') {
        const log = document.getElementById('combat-log');
        if (!log) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry ' + type;
        entry.textContent = message;
        log.appendChild(entry);

        while (log.children.length > 15) {
            log.removeChild(log.firstChild);
        }
        log.scrollTop = log.scrollHeight;
    }

    _logAnimation(anim) {
        if (!anim) return;
        const type = anim.type;
        const attacker = anim.attacker_name || '???';
        const target = anim.target_name || '???';

        if (type === 'attack') {
            const dmg = anim.damage || 0;
            const skillName = anim.skill_name || 'Attaque';
            const killed = anim.killed ? ' 💀 KO!' : '';
            this.addCombatLogEntry(`⚔ ${attacker} → ${target} : ${skillName} (-${dmg} HP)${killed}`, 'damage');
        } else if (type === 'monster_attack') {
            const dmg = anim.damage || 0;
            const skillName = anim.skill_name || 'Attaque';
            const killed = anim.killed ? ' 💀 KO!' : '';
            this.addCombatLogEntry(`🔴 ${attacker} → ${target} : ${skillName} (-${dmg} HP)${killed}`, 'damage');
        } else if (type === 'monster_move') {
            this.addCombatLogEntry(`🔴 ${anim.monster_name || 'Monstre'} se déplace`, 'default');
        } else if (type === 'heal') {
            const heal = anim.heal || 0;
            this.addCombatLogEntry(`💚 ${attacker} soigne ${target} (+${heal} HP)`, 'heal');
        } else if (type === 'buff' || type === 'defense') {
            this.addCombatLogEntry(`🛡 ${attacker} utilise ${anim.skill_name || 'Défense'}`, 'default');
        }
    }

    showError(message) {
        const container = document.getElementById('error-container');
        if (!container) return;

        const error = document.createElement('div');
        error.className = 'error-message';
        error.textContent = message;
        container.appendChild(error);

        setTimeout(() => {
            if (container.contains(error)) container.removeChild(error);
        }, 5000);

        this.addCombatLogEntry('⚠ ' + message, 'error');
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
        }
    }
}

// Global instance
const CombatSocketInstance = new CombatSocket();

document.addEventListener('DOMContentLoaded', () => {
    CombatSocketInstance.connect();

    // Single Start button — auto-advance handles everything after
    const btnStart = document.getElementById('btn-start-combat');
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            CombatSocketInstance.startRound();
            btnStart.style.display = 'none'; // Hide after starting
        });
    }

    console.log('Socket client initialized');
});

window.CombatSocket = CombatSocketInstance;
