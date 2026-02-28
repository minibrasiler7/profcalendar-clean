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
            addPlayerSprite: (data) => {
                // data from combat:student_joined is {participant: {...}}
                const p = data.participant || data;
                addPlayerSprite(scene, p);
            },
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
 * Get grid pixel position from grid coordinates
 */
function gridToPixel(gridX, gridY) {
    return {
        x: ARENA.padding + gridX * GRID.tileSize + GRID.tileSize / 2,
        y: ARENA.padding + gridY * GRID.tileSize + GRID.tileSize / 2
    };
}

/**
 * Add a player sprite to the arena
 * Server data: {id, student_id, student_name, avatar_class, level, current_hp, max_hp, current_mana, max_mana, grid_x, grid_y, is_alive, skills}
 */
function addPlayerSprite(scene, player) {
    if (!scene || !player) return;

    const playerId = player.id;
    if (scene.entities.players[playerId]) {
        // Already exists, just update
        updatePlayerSprite(scene, playerId, player);
        return;
    }

    // Use grid position from server
    const pos = gridToPixel(player.grid_x || 1, player.grid_y || 0);
    const x = pos.x;
    const y = pos.y;

    // Get player color based on class
    const avatarClass = player.avatar_class || 'guerrier';
    const classColor = COLORS.playerClasses[avatarClass] || '#667eea';

    // Create player sprite (circle)
    const circle = scene.add.circle(0, 0, 24, parseInt(classColor.replace('#', '0x')));
    circle.setStrokeStyle(2, 0xffffff);

    // Class initial letter
    const classLetter = scene.add.text(0, 0, avatarClass.charAt(0).toUpperCase(), {
        font: 'bold 18px Arial',
        fill: '#ffffff',
        align: 'center'
    });
    classLetter.setOrigin(0.5, 0.5);

    // Create player container at grid position
    const playerGroup = scene.add.container(x, y, [circle, classLetter]);

    // Add name text
    const displayName = player.student_name || ('Élève ' + player.student_id);
    const nameText = scene.add.text(0, 32, displayName, {
        font: '11px Arial',
        fill: COLORS.text,
        align: 'center'
    });
    nameText.setOrigin(0.5, 0);
    playerGroup.add(nameText);

    // Add HP bar
    const hpBarBg = scene.add.rectangle(0, 46, 48, 8, 0x1a1a2e);
    hpBarBg.setStrokeStyle(1, 0x10b981);
    const hpPercent = Math.max(0, Math.min(1, (player.current_hp || 0) / (player.max_hp || 1)));
    const hpBarFill = scene.add.rectangle(-24 + 22 * hpPercent, 46, 44 * hpPercent, 6, 0x10b981);
    hpBarFill.setOrigin(0, 0.5);
    hpBarFill.x = -22;
    hpBarFill.width = 44 * hpPercent;
    playerGroup.add([hpBarBg, hpBarFill]);

    // Store player data
    scene.entities.players[playerId] = {
        container: playerGroup,
        circle,
        nameText,
        hpBarFill,
        hpBarBg,
        maxHp: player.max_hp || 100,
        currentHp: player.current_hp || 100,
        mana: player.current_mana || 0,
        maxMana: player.max_mana || 50,
        avatarClass: avatarClass,
        studentName: displayName,
        isAlive: player.is_alive !== false
    };

    // Update player roster in side panel
    updatePlayerRoster(scene);

    console.log('Player sprite added:', displayName, 'at grid', player.grid_x, player.grid_y);
}

/**
 * Add a monster sprite to the arena
 * Server data: {id, monster_type, name, level, max_hp, current_hp, attack, defense, grid_x, grid_y, is_alive, skills}
 */
function addMonsterSprite(scene, monster) {
    if (!scene || !monster) return;

    const monsterId = monster.id;
    if (scene.entities.monsters[monsterId]) {
        updateMonsterSprite(scene, monsterId, monster);
        return;
    }

    // Use grid position from server
    const pos = gridToPixel(monster.grid_x || 7, monster.grid_y || 0);
    const x = pos.x;
    const y = pos.y;

    // Get monster color based on type
    const monsterType = monster.monster_type || 'slime';
    const monsterColor = COLORS.monsterTypes[monsterType] || '#3b82f6';

    // Create monster sprite (rectangle)
    const shape = scene.add.rectangle(0, 0, 40, 50, parseInt(monsterColor.replace('#', '0x')));
    shape.setStrokeStyle(2, 0xffffff);

    // Monster type initial
    const typeLetter = scene.add.text(0, 0, monsterType.charAt(0).toUpperCase(), {
        font: 'bold 18px Arial',
        fill: '#ffffff',
        align: 'center'
    });
    typeLetter.setOrigin(0.5, 0.5);

    // Create monster container
    const monsterGroup = scene.add.container(x, y, [shape, typeLetter]);

    // Add name text
    const nameText = scene.add.text(0, 32, monster.name || 'Monstre', {
        font: '11px Arial',
        fill: COLORS.text,
        align: 'center'
    });
    nameText.setOrigin(0.5, 0);
    monsterGroup.add(nameText);

    // Add HP bar
    const hpBarBg = scene.add.rectangle(0, 46, 48, 8, 0x1a1a2e);
    hpBarBg.setStrokeStyle(1, 0xef4444);
    const hpPercent = Math.max(0, Math.min(1, (monster.current_hp || 0) / (monster.max_hp || 1)));
    const hpBarFill = scene.add.rectangle(0, 46, 44 * hpPercent, 6, 0xef4444);
    hpBarFill.setOrigin(0, 0.5);
    hpBarFill.x = -22;
    hpBarFill.width = 44 * hpPercent;
    monsterGroup.add([hpBarBg, hpBarFill]);

    // Store monster data
    scene.entities.monsters[monsterId] = {
        container: monsterGroup,
        shape,
        nameText,
        hpBarFill,
        hpBarBg,
        maxHp: monster.max_hp || 50,
        currentHp: monster.current_hp || 50,
        name: monster.name,
        monsterType: monsterType,
        isAlive: monster.is_alive !== false
    };

    // Update monster roster in side panel
    updateMonsterRoster(scene);

    console.log('Monster sprite added:', monster.name, 'at grid', monster.grid_x, monster.grid_y);
}

/**
 * Update game state from server
 * Server sends: {session_id, status, round, phase, participants: [...], monsters: [...], all_monsters: [...]}
 */
function updateGameState(scene, state) {
    if (!scene) return;

    console.log('updateGameState:', state.phase, 'round:', state.round,
        'participants:', (state.participants || []).length,
        'monsters:', (state.monsters || []).length);

    currentGameState = state;

    // Update round display
    updateRoundDisplay(scene, state.round, state.phase);

    // Update or create players from participants array
    const participants = state.participants || [];
    participants.forEach(p => {
        if (!scene.entities.players[p.id]) {
            addPlayerSprite(scene, p);
        } else {
            updatePlayerSprite(scene, p.id, p);
        }
    });

    // Update or create monsters from all_monsters array (includes dead ones for display)
    const allMonsters = state.all_monsters || state.monsters || [];
    allMonsters.forEach(m => {
        if (!scene.entities.monsters[m.id]) {
            addMonsterSprite(scene, m);
        } else {
            updateMonsterSprite(scene, m.id, m);
        }
    });
}

/**
 * Update a player sprite with new data
 */
function updatePlayerSprite(scene, playerId, playerData) {
    const player = scene.entities.players[playerId];
    if (!player) return;

    player.currentHp = playerData.current_hp !== undefined ? playerData.current_hp : player.currentHp;
    player.maxHp = playerData.max_hp || player.maxHp;
    player.mana = playerData.current_mana !== undefined ? playerData.current_mana : player.mana;
    player.maxMana = playerData.max_mana || player.maxMana;
    player.isAlive = playerData.is_alive !== undefined ? playerData.is_alive : player.isAlive;

    // Update HP bar
    const hpPercent = Math.max(0, Math.min(1, player.currentHp / player.maxHp));
    player.hpBarFill.width = 44 * hpPercent;
    player.hpBarFill.x = -22;

    // Fade out if dead
    if (!player.isAlive || player.currentHp <= 0) {
        player.container.setAlpha(0.3);
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

    monster.currentHp = monsterData.current_hp !== undefined ? monsterData.current_hp : monster.currentHp;
    monster.maxHp = monsterData.max_hp || monster.maxHp;
    monster.isAlive = monsterData.is_alive !== undefined ? monsterData.is_alive : monster.isAlive;

    // Update HP bar
    const hpPercent = Math.max(0, Math.min(1, monster.currentHp / monster.maxHp));
    monster.hpBarFill.width = 44 * hpPercent;
    monster.hpBarFill.x = -22;

    // Fade out if dead
    if (!monster.isAlive || monster.currentHp <= 0) {
        monster.container.setAlpha(0.3);
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
        return;
    }

    const animation = scene.animationQueue.shift();
    scene.isAnimating = true;

    console.log('Playing animation:', animation.type, animation.attacker_name, '→', animation.target_name);

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
        case 'defense':
        case 'buff':
            playBuffAnimation(scene, animation, () => executeNextAnimation(scene));
            break;
        default:
            // Log and skip unknown animation type
            if (typeof CombatSocketInstance !== 'undefined') {
                CombatSocketInstance.addCombatLogEntry(
                    (animation.attacker_name || '?') + ' utilise ' + (animation.skill_name || '?'),
                    'default'
                );
            }
            executeNextAnimation(scene);
    }
}

/**
 * Play attack animation (player attacks monster)
 * animation: {type, attacker_type, attacker_id, attacker_name, target_type, target_id, target_name, skill_name, damage, target_hp, target_max_hp, killed}
 */
function playAttackAnimation(scene, animation, onComplete) {
    const attacker = scene.entities.players[animation.attacker_id];
    const target = scene.entities.monsters[animation.target_id];

    if (!attacker || !target) {
        if (typeof CombatSocketInstance !== 'undefined') {
            CombatSocketInstance.addCombatLogEntry(
                (animation.attacker_name || '?') + ' → ' + (animation.skill_name || '?') + ' → ' + animation.damage + ' dégâts',
                'damage'
            );
        }
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
    scene.tweens.add({
        targets: attacker.container,
        x: targetX - 30,
        y: targetY,
        duration: 200,
        ease: 'Quad.Out',
        yoyo: true,
        onComplete: () => {
            const monsterType = target.monsterType || 'slime';
            const origColor = parseInt((COLORS.monsterTypes[monsterType] || '#3b82f6').replace('#', '0x'));
            target.shape.setFillStyle(origColor);

            // Update target HP
            target.currentHp = animation.target_hp;
            target.maxHp = animation.target_max_hp || target.maxHp;
            const hpPercent = Math.max(0, Math.min(1, target.currentHp / target.maxHp));
            target.hpBarFill.width = 44 * hpPercent;

            if (animation.killed) {
                target.container.setAlpha(0.3);
                target.shape.setFillStyle(0x888888);
                target.isAlive = false;
            }

            // Show damage number
            showDamageNumber(scene, targetX, targetY, animation.damage, false);
            updateMonsterRoster(scene);
            onComplete();
        }
    });

    // Log action
    if (typeof CombatSocketInstance !== 'undefined') {
        const killText = animation.killed ? ' 💀 K.O.!' : '';
        CombatSocketInstance.addCombatLogEntry(
            animation.attacker_name + ' utilise ' + animation.skill_name + ' → ' + animation.damage + ' dégâts' + killText,
            'damage'
        );
    }
}

/**
 * Play heal animation
 * animation: {type, attacker_id, attacker_name, target_id, target_name, skill_name, heal, target_hp, target_max_hp}
 */
function playHealAnimation(scene, animation, onComplete) {
    const healer = scene.entities.players[animation.attacker_id];
    const target = scene.entities.players[animation.target_id];

    if (!healer || !target) {
        onComplete();
        return;
    }

    // Pulse effect on target
    scene.tweens.add({
        targets: target.container,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 150,
        ease: 'Quad.Out',
        yoyo: true,
        onComplete: () => {
            // Update target HP
            target.currentHp = animation.target_hp;
            target.maxHp = animation.target_max_hp || target.maxHp;
            const hpPercent = Math.max(0, Math.min(1, target.currentHp / target.maxHp));
            target.hpBarFill.width = 44 * hpPercent;

            showDamageNumber(scene, target.container.x, target.container.y - 40, animation.heal, true);
            updatePlayerRoster(scene);
            onComplete();
        }
    });

    if (typeof CombatSocketInstance !== 'undefined') {
        CombatSocketInstance.addCombatLogEntry(
            animation.attacker_name + ' soigne ' + animation.target_name + ' → +' + animation.heal + ' PV',
            'heal'
        );
    }
}

/**
 * Play monster attack animation
 */
function playMonsterAttackAnimation(scene, animation, onComplete) {
    const attacker = scene.entities.monsters[animation.attacker_id];
    const target = scene.entities.players[animation.target_id];

    if (!attacker || !target) {
        if (typeof CombatSocketInstance !== 'undefined') {
            CombatSocketInstance.addCombatLogEntry(
                (animation.attacker_name || '?') + ' → ' + (animation.skill_name || '?') + ' → ' + animation.damage + ' dégâts',
                'damage'
            );
        }
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
    scene.tweens.add({
        targets: attacker.container,
        x: targetX + 30,
        y: targetY,
        duration: 200,
        ease: 'Quad.Out',
        yoyo: true,
        onComplete: () => {
            const avatarClass = target.avatarClass || 'guerrier';
            const origColor = parseInt((COLORS.playerClasses[avatarClass] || '#667eea').replace('#', '0x'));
            target.circle.setFillStyle(origColor);

            // Update target HP
            target.currentHp = animation.target_hp;
            target.maxHp = animation.target_max_hp || target.maxHp;
            const hpPercent = Math.max(0, Math.min(1, target.currentHp / target.maxHp));
            target.hpBarFill.width = 44 * hpPercent;

            if (animation.killed) {
                target.container.setAlpha(0.3);
                target.circle.setFillStyle(0x888888);
                target.isAlive = false;
            }

            showDamageNumber(scene, targetX, targetY, animation.damage, false);
            updatePlayerRoster(scene);
            onComplete();
        }
    });

    if (typeof CombatSocketInstance !== 'undefined') {
        const killText = animation.killed ? ' 💀 K.O.!' : '';
        CombatSocketInstance.addCombatLogEntry(
            animation.attacker_name + ' attaque ' + animation.target_name + ' → ' + animation.damage + ' dégâts' + killText,
            'damage'
        );
    }
}

/**
 * Play buff/defense animation
 */
function playBuffAnimation(scene, animation, onComplete) {
    const player = scene.entities.players[animation.attacker_id];

    if (player) {
        // Quick pulse effect
        scene.tweens.add({
            targets: player.container,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 200,
            ease: 'Quad.Out',
            yoyo: true,
            onComplete: onComplete
        });
    } else {
        onComplete();
    }

    if (typeof CombatSocketInstance !== 'undefined') {
        CombatSocketInstance.addCombatLogEntry(
            animation.attacker_name + ' utilise ' + animation.skill_name,
            'default'
        );
    }
}

/**
 * Show floating damage/heal number
 */
function showDamageNumber(scene, x, y, amount, isHeal) {
    const color = isHeal ? COLORS.heal : COLORS.damage;
    const prefix = isHeal ? '+' : '-';

    const text = scene.add.text(x, y - 20, prefix + amount, {
        font: 'bold 24px Arial',
        fill: color
    });
    text.setOrigin(0.5, 0.5);

    scene.tweens.add({
        targets: text,
        y: y - 80,
        alpha: 0,
        duration: 1200,
        ease: 'Quad.Out',
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
        roundElement.textContent = 'Round ' + (round || 0);
    }

    if (phaseElement) {
        let phaseName = 'Attente';
        switch (phase) {
            case 'waiting': phaseName = 'Attente'; break;
            case 'question': phaseName = 'Question'; break;
            case 'action': phaseName = 'Action'; break;
            case 'execute': phaseName = 'Exécution'; break;
            case 'round_end': phaseName = 'Fin de round'; break;
            case 'finished': phaseName = 'Terminé'; break;
        }
        phaseElement.textContent = phaseName;
    }

    if (phaseIndicator) {
        phaseIndicator.className = 'phase-indicator phase-' + (phase || 'waiting');
    }
}

/**
 * Update phase display
 */
function updatePhase(scene, phase, data) {
    updateRoundDisplay(scene, currentGameState.round, phase);
}

/**
 * Update player roster UI (left side panel)
 */
function updatePlayerRoster(scene) {
    const roster = document.getElementById('players-list');
    if (!roster) return;

    roster.innerHTML = '';

    Object.entries(scene.entities.players).forEach(([playerId, player]) => {
        const card = document.createElement('div');
        card.className = 'entity-card';
        if (!player.isAlive) card.style.opacity = '0.4';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'entity-name';
        nameDiv.textContent = player.studentName + (player.isAlive ? '' : ' 💀');

        const hpLabel = document.createElement('div');
        hpLabel.className = 'bar-label';
        hpLabel.innerHTML = '<span>HP</span><span>' + Math.max(0, player.currentHp) + '/' + player.maxHp + '</span>';

        const hpBarContainer = document.createElement('div');
        hpBarContainer.className = 'hp-bar-container';
        const hpPercent = Math.max(0, Math.min(100, (player.currentHp / player.maxHp) * 100));
        hpBarContainer.innerHTML = '<div class="hp-bar-fill" style="width: ' + hpPercent + '%"></div>';

        const manaLabel = document.createElement('div');
        manaLabel.className = 'bar-label';
        manaLabel.innerHTML = '<span>Mana</span><span>' + player.mana + '/' + player.maxMana + '</span>';

        const manaBarContainer = document.createElement('div');
        manaBarContainer.className = 'mana-bar-container';
        const manaPercent = Math.max(0, Math.min(100, (player.mana / player.maxMana) * 100));
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
 * Update monster roster UI (right side panel)
 */
function updateMonsterRoster(scene) {
    const roster = document.getElementById('monsters-list');
    if (!roster) return;

    roster.innerHTML = '';

    Object.entries(scene.entities.monsters).forEach(([monsterId, monster]) => {
        const card = document.createElement('div');
        card.className = 'entity-card';
        if (!monster.isAlive) card.style.opacity = '0.4';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'entity-name';
        nameDiv.textContent = monster.name + (monster.isAlive ? '' : ' 💀');

        const hpLabel = document.createElement('div');
        hpLabel.className = 'bar-label';
        hpLabel.innerHTML = '<span>HP</span><span>' + Math.max(0, monster.currentHp) + '/' + monster.maxHp + '</span>';

        const hpBarContainer = document.createElement('div');
        hpBarContainer.className = 'hp-bar-container';
        const hpPercent = Math.max(0, Math.min(100, (monster.currentHp / monster.maxHp) * 100));
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
