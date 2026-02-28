/**
 * Socket.IO Client for Combat Arena
 * Handles real-time communication between teacher projector and student devices
 */

class CombatSocket {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.gameInstance = null;
        this.callbacks = {
            onStateUpdate: null,
            onStudentJoined: null,
            onQuestion: null,
            onAnswerProgress: null,
            onAllAnswered: null,
            onActionProgress: null,
            onExecute: null,
            onFinished: null,
            onError: null
        };
    }

    /**
     * Initialize socket connection
     */
    connect() {
        this.socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });

        // Connection events
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

        // Combat events
        this.socket.on('combat:state_update', (state) => {
            console.log('State update:', state);
            if (this.gameInstance && typeof this.gameInstance.updateState === 'function') {
                this.gameInstance.updateState(state);
            }
            if (this.callbacks.onStateUpdate) {
                this.callbacks.onStateUpdate(state);
            }
        });

        this.socket.on('combat:student_joined', (student) => {
            console.log('Student joined:', student);
            if (this.gameInstance && typeof this.gameInstance.addPlayerSprite === 'function') {
                this.gameInstance.addPlayerSprite(student);
            }
            if (this.callbacks.onStudentJoined) {
                this.callbacks.onStudentJoined(student);
            }
        });

        this.socket.on('combat:question', (questionData) => {
            console.log('Question received:', questionData);
            this.showQuestionOverlay(questionData);
            if (this.callbacks.onQuestion) {
                this.callbacks.onQuestion(questionData);
            }
        });

        this.socket.on('combat:answer_progress', (progress) => {
            console.log('Answer progress:', progress);
            this.updateAnswerProgress(progress);
            if (this.callbacks.onAnswerProgress) {
                this.callbacks.onAnswerProgress(progress);
            }
        });

        this.socket.on('combat:all_answered', (data) => {
            console.log('All students answered');
            this.hideQuestionOverlay();
            this.addCombatLogEntry('✓ Tous les élèves ont répondu', 'phase');
            if (this.callbacks.onAllAnswered) {
                this.callbacks.onAllAnswered(data);
            }
        });

        this.socket.on('combat:action_progress', (progress) => {
            console.log('Action phase progress:', progress);
            if (this.gameInstance && typeof this.gameInstance.updatePhase === 'function') {
                this.gameInstance.updatePhase('Action', progress);
            }
            if (this.callbacks.onActionProgress) {
                this.callbacks.onActionProgress(progress);
            }
        });

        this.socket.on('combat:execute', (executionData) => {
            console.log('Executing animations:', executionData);
            if (this.gameInstance && typeof this.gameInstance.playAnimations === 'function') {
                this.gameInstance.playAnimations(executionData.animations);
            }
            if (this.callbacks.onExecute) {
                this.callbacks.onExecute(executionData);
            }
        });

        this.socket.on('combat:round_update', (roundData) => {
            console.log('Round update:', roundData);
            if (this.gameInstance && typeof this.gameInstance.updateRound === 'function') {
                this.gameInstance.updateRound(roundData.round, roundData.phase);
            }
        });

        this.socket.on('combat:finished', (result) => {
            console.log('Combat finished:', result);
            this.showFinishedScreen(result);
            if (this.callbacks.onFinished) {
                this.callbacks.onFinished(result);
            }
        });

        this.socket.on('combat:error', (errorData) => {
            console.error('Combat error:', errorData);
            this.showError(errorData.message || 'Une erreur est survenue');
            if (this.callbacks.onError) {
                this.callbacks.onError(errorData);
            }
        });
    }

    /**
     * Join the combat room
     */
    joinCombatRoom() {
        if (!this.socket || !this.connected) {
            console.warn('Socket not connected yet');
            return;
        }

        const joinData = {
            session_id: SESSION_ID,
            classroom_id: CLASSROOM_ID,
            exercise_id: EXERCISE_ID
        };

        console.log('Joining combat room:', joinData);
        this.socket.emit('combat:teacher_join', joinData);
    }

    /**
     * Start a new round
     */
    startRound() {
        if (!this.socket || !this.connected) {
            this.showError('Non connecté au serveur');
            return;
        }

        console.log('Starting new round');
        this.socket.emit('combat:start_round', {
            session_id: SESSION_ID
        });
    }

    /**
     * Force immediate execution of current round
     */
    forceExecute() {
        if (!this.socket || !this.connected) {
            this.showError('Non connecté au serveur');
            return;
        }

        console.log('Forcing execution');
        this.socket.emit('combat:force_execute', {
            session_id: SESSION_ID
        });
    }

    /**
     * Set callback for a specific event
     */
    on(event, callback) {
        if (event in this.callbacks) {
            this.callbacks[event] = callback;
        }
    }

    /**
     * Set the game instance reference (for Phaser integration)
     */
    setGameInstance(gameInstance) {
        this.gameInstance = gameInstance;
        console.log('Game instance set');
    }

    /**
     * Update UI with answer progress
     */
    updateAnswerProgress(progress) {
        const total = progress.total || 1;
        const answered = progress.answered || 0;
        const percentage = Math.round((answered / total) * 100);

        const progressFill = document.getElementById('overlay-progress-fill');
        const progressInfo = document.getElementById('overlay-progress');

        if (progressFill) {
            progressFill.style.width = percentage + '%';
        }
        if (progressInfo) {
            progressInfo.textContent = `${answered}/${total}`;
        }
    }

    /**
     * Show question overlay
     */
    showQuestionOverlay(questionData) {
        const overlay = document.getElementById('overlay-message');
        const title = document.getElementById('overlay-title');
        const progress = document.getElementById('overlay-progress');

        if (overlay && title) {
            title.textContent = questionData.question || 'Les élèves répondent...';
            progress.textContent = '0/' + (questionData.total || 0);
            overlay.style.display = 'block';
        }

        this.addCombatLogEntry('Question: ' + (questionData.question || 'Question phase'), 'phase');
    }

    /**
     * Hide question overlay
     */
    hideQuestionOverlay() {
        const overlay = document.getElementById('overlay-message');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    /**
     * Show finished/victory screen
     */
    showFinishedScreen(result) {
        const overlay = document.getElementById('overlay-message');
        const title = document.getElementById('overlay-title');

        if (overlay && title) {
            title.textContent = result.victory ? '✓ Victoire!' : '✗ Défaite';
            overlay.style.display = 'block';
            overlay.style.backgroundColor = result.victory ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
            overlay.style.borderColor = result.victory ? '#10b981' : '#ef4444';
        }

        if (result.victory) {
            this.addCombatLogEntry('✓ VICTOIRE - Combat terminé!', 'phase');
        } else {
            this.addCombatLogEntry('✗ DÉFAITE - L\'équipe a été vaincue', 'phase');
        }
    }

    /**
     * Add entry to combat log
     */
    addCombatLogEntry(message, type = 'default') {
        const log = document.getElementById('combat-log');
        if (!log) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry ' + type;
        entry.textContent = message;

        log.appendChild(entry);

        // Keep only last 10 entries
        while (log.children.length > 10) {
            log.removeChild(log.firstChild);
        }

        // Auto-scroll to bottom
        log.scrollTop = log.scrollHeight;
    }

    /**
     * Show error message
     */
    showError(message) {
        const container = document.getElementById('error-container');
        if (!container) return;

        const error = document.createElement('div');
        error.className = 'error-message';
        error.textContent = message;

        container.appendChild(error);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (container.contains(error)) {
                container.removeChild(error);
            }
        }, 5000);

        this.addCombatLogEntry('⚠ ' + message, 'error');
    }

    /**
     * Disconnect socket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
        }
    }
}

// Create global socket instance
const CombatSocketInstance = new CombatSocket();

// Connect when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    CombatSocketInstance.connect();

    // Attach button handlers
    const btnNextRound = document.getElementById('btn-next-round');
    const btnForceExecute = document.getElementById('btn-force-execute');

    if (btnNextRound) {
        btnNextRound.addEventListener('click', () => {
            CombatSocketInstance.startRound();
        });
    }

    if (btnForceExecute) {
        btnForceExecute.addEventListener('click', () => {
            CombatSocketInstance.forceExecute();
        });
    }

    console.log('Socket client initialized');
});

// Expose global for debugging
window.CombatSocket = CombatSocketInstance;
