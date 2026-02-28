/**
 * Phaser 3 Combat Arena Scene
 * Displays the combat grid with players and monsters
 */

// Color scheme
const COLORS = {
    background: '#1a1a2e',
    gridLine: '#16213e',
    playerClasses: {
        guerrier: '#ef4444',
        mage: '#667eea',
        archer: '#10b981',
        guerisseur: '#f59e0b'
    },
    monsterTypes: {
        slime: '#3b82f6',
        goblin: '#22c55e',
        orc: '#78716c',
        skeleton: '#d4d4d8',
        dragon: '#ef4444'
    },
    hpBar: { bg: '#1a1a2e', fill: '#10b981' },
    manaBar: { bg: '#1a1a2e', fill: '#3b82f6' },
    text: '#ffffff',
    damage: '#ef4444',
    heal: '#10b981'
};

const GRID = {
    width: 10,
    height: 8,
    tileSize: 64
};

const ARENA = {
    width: GRID.width * GRID.tileSize,
    height: GRID.height * GRID.tileSize,
    padding: 40
};

const GAME_CONFIG = {
    type: Phaser.AUTO,
    parent: 'phaser-game',
    width: ARENA.width + ARENA.padding * 2,
    height: ARENA.height + ARENA.padding,
    backgroundColor: COLORS.background,
    scene: {
        init: initScene,
        create: createScene,
        update: updateScene
    },
    render: {
        antialiasGL: true,
        pixelArt: false
    }
};

// Global game reference
let gameInstance = null;
let currentGameState = {
    round: 1,
    phase: 'Attente',
    players: {},
    monsters: {},
    animations: []
};

/**
 * Initialize scene
 */
function initScene() {
    this.entities = {
        players: {},
        monsters: {}
    };
    this.animationQueue = [];
    this.isAnimating = false;
    this.gridStartX = ARENA.padding;
    this.gridStartY = ARENA.padding;
}

/**
 * Create scene (setup graphics, sprites, UI)
 */
function createScene() {
    const scene = this;
    gameInstance = this;

    // Draw grid background
    drawGrid(scene);

    // Create containers for entities
    scene.playerContainer = scene.add.container(0, 0);
    scene.monsterContainer = scene.add.container(0, 0);

    // Set up socket integration
    if (typeof CombatSocketInstance !== 'undefined') {
        CombatSocketInstance.setGameInstance({
            updateState: (state) => updateGameState(scene, state),
            addPlayerSprite: (student) => addPlayerSprite(scene, student),
            playAnimations: (animations) => playAnimations(scene, animations),
            updatePhase: (phase, data) => updatePhase(scene, phase, data),
            updateRound: (round, phase) => updateRoundDisplay(scene, round, phase)
        });
    }

    console.log('Phaser scene created');
}

/**
 * Update scene
 */
function updateScene() {
    // Per-frame updates if needed
}

/**
 * Draw the grid background
 */
function drawGrid(scene) {
    const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
    graphics.setDepth(-100);

    const startX = ARENA.padding;
    const startY = ARENA.padding;

    // Draw grid tiles
    for (let row = 0; row < GRID.height; row++) {
        for (let col = 0; col < GRID.width; col++) {
            const x = startX + col * GRID.tileSize;
            const y = startY + row * GRID.tileSize;

            // Alternate grass/dirt colors
            const isEvenRow = row % 2 === 0;
            const isEvenCol = col % 2 === 0;
            const shouldBeDark = isEvenRow === isEvenCol;

            const tileColor = shouldBeDark ? 0x0f3460 : 0x16213e;
            graphics.fillStyle(tileColor, 1);
            graphics.fillRect(x, y, GRID.tileSize, GRID.tileSize);
        }
    }

    // Draw grid overlay lines
    graphics.lineStyle(1, 0x16213e, 0.5);
    for (let row = 0; row <= GRID.height; row++) {
        const y = ARENA.padding + row * GRID.tileSize;
        graphics.lineBetween(ARENA.padding, y, ARENA.padding + ARENA.width, y);
    }

    for (let col = 0; col <= GRID.width; col++) {
        const x = ARENA.padding + col * GRID.tileSize;
        graphics.lineBetween(x, ARENA.padding, x, ARENA.padding + ARENA.height);
    }

    graphics.generateTexture('gridTexture', GAME_CONFIG.width, GAME_CONFIG.height);
    graphics.destroy();

    const background = scene.add.sprite(
        GAME_CONFIG.width / 2,
        GAME_CONFIG.height / 2,
        'gridTexture'
    );
    background.setDepth(-50);
    background.setOrigin(0.5, 0.5);
}

/**
 * Add a player sprite to the arena
 */
function addPlayerSprite(scene, player) {
    if (!scene || !player) return;

    const playerId = player.id || player.user_id;
    if (scene.entities.players[playerId]) {
        return; // Player already exists
    }

    // Position players on left side of grid, staggered
    const playerIndex = Object.keys(scene.entities.players).length;
    const playerSlots = 4;
    const spacingY = ARENA.height / (playerSlots + 1);
    const x = ARENA.padding + GRID.tileSize * 1;
    const y = ARENA.padding + spacingY * (playerIndex + 1);

    // Get player color based on class
    const classColor = COLORS.playerClasses[player.class] || '#667eea';

    // Create player sprite (circle)
    const circle = scene.add.circle(x, y, 24, parseInt(classColor.replace('#', '0x')));
    circle.setStrokeStyle(2, 0xffffff);

    // Create player container
    const playerGroup = scene.add.container(x, y, [circle]);

    // Add name text
    const nameText = scene.add.text(0, 32, player.username || 'Player', {
        font: '12px Arial',
        fill: COLORS.text,
        align: 'center'
    });
    nameText.setOrigin(0.5, 0);
    playerGroup.add(nameText);

    // Add HP bar
    const hpBarBg = scene.add.rectangle(0, 46, 48, 8, 0x1a1a2e);
    hpBarBg.setStrokeStyle(1, 0x10b981);
    const hpBarFill = scene.add.rectangle(-22, 46, 44, 6, 0x10b981);
    playerGroup.add([hpBarBg, hpBarFill]);

    // Store player data
    scene.entities.players[playerId] = {
        container: playerGroup,
        circle,
        nameText,
        hpBarFill,
        hpBarBg,
        maxHp: player.max_hp || 100,
        currentHp: player.hp || 100,
        mana: player.mana || 0,
        maxMana: player.max_mana || 50,
        class: player.class,
        username: player.username
    };

    // Update player roster in UI
    updatePlayerRoster(scene);
}

/**
 * Add a monster sprite to the arena
 */
function addMonsterSprite(scene, monster) {
    if (!scene || !monster) return;

    const monsterId = monster.id;
    if (scene.entities.monsters[monsterId]) {
        return; // Monster already exists
    }

    // Position monsters on right side of grid, staggered
    const monsterIndex = Object.keys(scene.entities.monsters).length;
    const monsterSlots = 3;
    const spacingY = ARENA.height / (monsterSlots + 1);
    const x = ARENA.padding + GRID.tileSize * (GRID.width - 2);
    const y = ARENA.padding + spacingY * (monsterIndex + 1);

    // Get monster color
    const monsterColor = COLORS.monsterTypes[monster.type] || '#3b82f6';

    // Create monster sprite (rectangle)
    const shape = scene.add.rectangle(x, y, 40, 50, parseInt(monsterColor.replace('#', '0x')));
    shape.setStrokeStyle(2, 0xffffff);

    // Create monster container
    const monsterGroup = scene.add.container(x, y, [shape]);

    // Add name text
    const nameText = scene.add.text(0, 32, monster.name || 'Monster', {
        font: '12px Arial',
        fill: COLORS.text,
        align: 'center'
    });
    nameText.setOrigin(0.5, 0);
    monsterGroup.add(nameText);

    // Add HP bar
    const hpBarBg = scene.add.rectangle(0, 46, 48, 8, 0x1a1a2e);
    hpBarBg.setStrokeStyle(1, 0xef4444);
    const hpBarFill = scene.add.rectangle(-22, 46, 44, 6, 0xef4444);
    monsterGroup.add([hpBarBg, hpBarFill]);

    // Store monster data
    scene.entities.monsters[monsterId] = {
        container: monsterGroup,
        shape,
        nameText,
        hpBarFill,
        hpBarBg,
        maxHp: monster.max_hp || 50,
        currentHp: monster.hp || 50,
        name: monster.name,
        type: monster.type
    };

    // Update monster roster in UI
    updateMonsterRoster(scene);
}

/**
 * Update game state from server
 */
function updateGameState(scene, state) {
    if (!scene) return;

    currentGameState = state;

    // Update round display
    updateRoundDisplay(scene, state.round, state.phase);

    // Update or create players
    if (state.players) {
        Object.values(state.players).forEach(player => {
            if (!scene.entities.players[player.id]) {
                addPlayerSprite(scene, player);
            } else {
                updatePlayerSprite(scene, player.id, player);
            }
        });
    }

    // Update or create monsters
    if (state.monsters) {
        Object.values(state.monsters).forEach(monster => {
            if (!scene.entities.monsters[monster.id]) {
                addMonsterSprite(scene, monster);
            } else {
                updateMonsterSprite(scene, monster.id, monster);
            }
        });
    }
}

/**
 * Update a player sprite with new data
 */
function updatePlayerSprite(scene, playerId, playerData) {
    const player = scene.entities.players[playerId];
    if (!player) return;

    player.currentHp = playerData.hp || playerData.currentHp;
    player.maxHp = playerData.max_hp || playerData.maxHp;
    player.mana = playerData.mana || 0;
    player.maxMana = playerData.max_mana || player.maxMana;

    // Update HP bar
    const hpPercent = Math.max(0, Math.min(1, player.currentHp / player.maxHp));
    player.hpBarFill.width = 44 * hpPercent;
    player.hpBarFill.x = -22 + (44 * hpPercent) / 2;

    // Fade out if dead
    if (player.currentHp <= 0) {
        player.container.setAlpha(0.5);
        player.circle.setFillStyle(0x888888);
    } else {
        player.container.setAlpha(1);
    }

    // Update roster
    updatePlayerRoster(scene);
}

/**
 * Update a monster sprite with new data
 */
function updateMonsterSprite(scene, monsterId, monsterData) {
    const monster = scene.entities.monsters[monsterId];
    if (!monster) return;

    monster.currentHp = monsterData.hp || monsterData.currentHp;
    monster.maxHp = monsterData.max_hp || monsterData.maxHp;

    // Update HP bar
    const hpPercent = Math.max(0, Math.min(1, monster.currentHp / monster.maxHp));
    monster.hpBarFill.width = 44 * hpPercent;
    monster.hpBarFill.x = -22 + (44 * hpPercent) / 2;

    // Fade out if dead
    if (monster.currentHp <= 0) {
        monster.container.setAlpha(0.5);
        monster.shape.setFillStyle(0x888888);
    } else {
        monster.container.setAlpha(1);
    }

    // Update roster
    updateMonsterRoster(scene);
}

/**
 * Play animations sequentially
 */
function playAnimations(scene, animations) {
    if (!Array.isArray(animations) || animations.length === 0) {
        if (typeof CombatSocketInstance !== 'undefined' && CombatSocketInstance.socket) {
            CombatSocketInstance.socket.emit('combat:animations_done', { session_id: SESSION_ID });
        }
        return;
    }

    scene.animationQueue = [...animations];
    executeNextAnimation(scene);
}

/**
 * Execute next animation in queue
 */
function executeNextAnimation(scene) {
    if (scene.animationQueue.length === 0) {
        scene.isAnimating = false;
        if (typeof CombatSocketInstance !== 'undefined' && CombatSocketInstance.socket) {
            CombatSocketInstance.socket.emit('combat:animations_done', { session_id: SESSION_ID });
        }
        return;
    }

    const animation = scene.animationQueue.shift();
    scene.isAnimating = true;

    console.log('Playing animation:', animation);

    switch (animation.type) {
        case 'attack':
            playAttackAnimation(scene, animation, () => executeNextAnimation(scene));
            break;
        case 'heal':
            playHealAnimation(scene, animation, () => executeNextAnimation(scene));
            break;
        case 'monster_attack':
            playMonsterAttackAnimation(scene, animation, () => executeNextAnimation(scene));
            break;
        case 'ko':
            playKoAnimation(scene, animation, () => executeNextAnimation(scene));
            break;
        default:
            executeNextAnimation(scene);
    }
}

/**
 * Play attack animation
 */
function playAttackAnimation(scene, animation, onComplete) {
    const attacker = scene.entities.players[animation.attacker_id];
    const target = scene.entities.monsters[animation.target_id];

    if (!attacker || !target) {
        onComplete();
        return;
    }

    const startX = attacker.container.x;
    const startY = attacker.container.y;
    const targetX = target.container.x;
    const targetY = target.container.y;

    // Flash the target
    target.shape.setFillStyle(0xffffff);

    // Move attacker toward target and back
    scene.tweens.timeline({
        tweens: [
            {
                targets: attacker.container,
                x: targetX - 30,
                y: targetY,
                duration: 200,
                ease: 'Quad.Out'
            },
            {
                targets: attacker.container,
                x: startX,
                y: startY,
                duration: 200,
                ease: 'Quad.In'
            }
        ],
        onComplete: () => {
            target.shape.setFillStyle(parseInt(COLORS.monsterTypes[target.type] || '#3b82f6'));
            // Show damage number
            showDamageNumber(scene, targetX, targetY, animation.damage, false);
            onComplete();
        }
    });

    // Log action
    CombatSocketInstance.addCombatLogEntry(
        attacker.username + ' attaque pour ' + animation.damage + ' dégâts',
        'damage'
    );
}

/**
 * Play heal animation
 */
function playHealAnimation(scene, animation, onComplete) {
    const healer = scene.entities.players[animation.caster_id];
    const target = scene.entities.players[animation.target_id];

    if (!healer || !target) {
        onComplete();
        return;
    }

    // Pulse effect on target
    scene.tweens.timeline({
        tweens: [
            {
                targets: target.container,
                scaleX: 1.1,
                scaleY: 1.1,
                duration: 150,
                ease: 'Quad.Out'
            },
            {
                targets: target.container,
                scaleX: 1,
                scaleY: 1,
                duration: 150,
                ease: 'Quad.In'
            }
        ],
        onComplete: () => {
            showDamageNumber(scene, target.container.x, target.container.y - 40, animation.heal_amount, true);
            onComplete();
        }
    });

    // Log action
    CombatSocketInstance.addCombatLogEntry(
        healer.username + ' soigne ' + target.username + ' pour ' + animation.heal_amount + ' PV',
        'heal'
    );
}

/**
 * Play monster attack animation
 */
function playMonsterAttackAnimation(scene, animation, onComplete) {
    const attacker = scene.entities.monsters[animation.attacker_id];
    const target = scene.entities.players[animation.target_id];

    if (!attacker || !target) {
        onComplete();
        return;
    }

    const startX = attacker.container.x;
    const startY = attacker.container.y;
    const targetX = target.container.x;
    const targetY = target.container.y;

    // Flash the target
    target.circle.setFillStyle(0xffffff);

    // Move attacker toward target and back
    scene.tweens.timeline({
        tweens: [
            {
                targets: attacker.container,
                x: targetX + 30,
                y: targetY,
                duration: 200,
                ease: 'Quad.Out'
            },
            {
                targets: attacker.container,
                x: startX,
                y: startY,
                duration: 200,
                ease: 'Quad.In'
            }
        ],
        onComplete: () => {
            target.circle.setFillStyle(parseInt(COLORS.playerClasses[target.class] || '#667eea'));
            showDamageNumber(scene, targetX, targetY, animation.damage, false);
            onComplete();
        }
    });

    // Log action
    CombatSocketInstance.addCombatLogEntry(
        attacker.name + ' attaque ' + target.username + ' pour ' + animation.damage + ' dégâts',
        'damage'
    );
}

/**
 * Play KO animation
 */
function playKoAnimation(scene, animation, onComplete) {
    const entity = scene.entities.players[animation.entity_id] || scene.entities.monsters[animation.entity_id];

    if (!entity) {
        onComplete();
        return;
    }

    scene.tweens.to(entity.container, {
        alpha: 0.3,
        duration: 500,
        ease: 'Quad.In',
        onComplete: onComplete
    });

    const name = entity.username || entity.name || 'Entity';
    CombatSocketInstance.addCombatLogEntry(name + ' a été vaincu!', 'damage');
}

/**
 * Show floating damage/heal number
 */
function showDamageNumber(scene, x, y, amount, isHeal = false) {
    const color = isHeal ? COLORS.heal : COLORS.damage;
    const prefix = isHeal ? '+' : '-';

    const text = scene.add.text(x, y, prefix + amount, {
        font: 'bold 24px Arial',
        fill: color
    });
    text.setOrigin(0.5, 0.5);

    scene.tweens.timeline({
        tweens: [
            {
                targets: text,
                y: y - 60,
                alpha: 0,
                duration: 1000,
                ease: 'Quad.Out'
            }
        ],
        onComplete: () => {
            text.destroy();
        }
    });
}

/**
 * Update round display
 */
function updateRoundDisplay(scene, round, phase) {
    const roundElement = document.getElementById('round-number');
    const phaseElement = document.getElementById('phase-name');
    const phaseIndicator = document.getElementById('phase-indicator');

    if (roundElement) {
        roundElement.textContent = 'Round ' + round;
    }

    if (phaseElement) {
        let phaseName = 'Attente';
        switch (phase) {
            case 'question':
                phaseName = 'Question';
                break;
            case 'action':
                phaseName = 'Action';
                break;
            case 'execute':
                phaseName = 'Exécution';
                break;
            case 'finished':
                phaseName = 'Terminé';
                break;
        }
        phaseElement.textContent = phaseName;
    }

    if (phaseIndicator) {
        phaseIndicator.className = 'phase-indicator phase-' + phase;
    }
}

/**
 * Update phase display
 */
function updatePhase(scene, phase, data) {
    updateRoundDisplay(scene, currentGameState.round, phase);
}

/**
 * Update player roster UI
 */
function updatePlayerRoster(scene) {
    const roster = document.getElementById('players-list');
    if (!roster) return;

    roster.innerHTML = '';

    Object.entries(scene.entities.players).forEach(([playerId, player]) => {
        const card = document.createElement('div');
        card.className = 'entity-card';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'entity-name';
        nameDiv.textContent = player.username;

        const hpLabel = document.createElement('div');
        hpLabel.className = 'bar-label';
        hpLabel.innerHTML = '<span>HP</span><span>' + player.currentHp + '/' + player.maxHp + '</span>';

        const hpBarContainer = document.createElement('div');
        hpBarContainer.className = 'hp-bar-container';
        const hpPercent = Math.max(0, Math.min(1, player.currentHp / player.maxHp)) * 100;
        hpBarContainer.innerHTML = '<div class="hp-bar-fill" style="width: ' + hpPercent + '%"></div>';

        const manaLabel = document.createElement('div');
        manaLabel.className = 'bar-label';
        manaLabel.innerHTML = '<span>Mana</span><span>' + player.mana + '/' + player.maxMana + '</span>';

        const manaBarContainer = document.createElement('div');
        manaBarContainer.className = 'mana-bar-container';
        const manaPercent = Math.max(0, Math.min(1, player.mana / player.maxMana)) * 100;
        manaBarContainer.innerHTML = '<div class="mana-bar-fill" style="width: ' + manaPercent + '%"></div>';

        card.appendChild(nameDiv);
        card.appendChild(hpLabel);
        card.appendChild(hpBarContainer);
        card.appendChild(manaLabel);
        card.appendChild(manaBarContainer);

        roster.appendChild(card);
    });
}

/**
 * Update monster roster UI
 */
function updateMonsterRoster(scene) {
    const roster = document.getElementById('monsters-list');
    if (!roster) return;

    roster.innerHTML = '';

    Object.entries(scene.entities.monsters).forEach(([monsterId, monster]) => {
        const card = document.createElement('div');
        card.className = 'entity-card';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'entity-name';
        nameDiv.textContent = monster.name;

        const hpLabel = document.createElement('div');
        hpLabel.className = 'bar-label';
        hpLabel.innerHTML = '<span>HP</span><span>' + monster.currentHp + '/' + monster.maxHp + '</span>';

        const hpBarContainer = document.createElement('div');
        hpBarContainer.className = 'hp-bar-container';
        const hpPercent = Math.max(0, Math.min(1, monster.currentHp / monster.maxHp)) * 100;
        hpBarContainer.innerHTML = '<div class="hp-bar-fill" style="width: ' + hpPercent + '%"></div>';

        card.appendChild(nameDiv);
        card.appendChild(hpLabel);
        card.appendChild(hpBarContainer);

        roster.appendChild(card);
    });
}

// Initialize Phaser game when document is ready
document.addEventListener('DOMContentLoaded', () => {
    const game = new Phaser.Game(GAME_CONFIG);
    console.log('Phaser game instance created');
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (typeof CombatSocketInstance !== 'undefined') {
        CombatSocketInstance.disconnect();
    }
});
