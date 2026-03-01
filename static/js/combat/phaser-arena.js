/**
 * Phaser.js Isometric Combat Arena (FFT-like)
 * Renders the combat grid in isometric view with depth sorting.
 */

const TILE_W = 64;
const TILE_H = 32;
const TILE_DEPTH = 16;
const SPRITE_SIZE = 72;

class CombatArena extends Phaser.Scene {
    constructor() {
        super({ key: 'CombatArena' });
        this.mapConfig = null;
        this.gridW = 10;
        this.gridH = 8;
        this.tileSprites = {};    // {`${x}_${y}`: sprite}
        this.highlightSprites = {}; // {`${x}_${y}`: sprite}
        this.entitySprites = {};  // {id: {sprite, hpBar, nameText, ...}}
        this.participants = [];
        this.monsters = [];
        this.currentPhase = 'waiting';
        this.currentRound = 0;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    preload() {
        // Isometric tiles
        this.load.image('iso_grass', '/static/img/combat/tiles/iso_grass.png');
        this.load.image('iso_stone', '/static/img/combat/tiles/iso_stone.png');
        this.load.image('iso_dirt', '/static/img/combat/tiles/iso_dirt.png');
        this.load.image('iso_water', '/static/img/combat/tiles/iso_water.png');
        this.load.image('iso_wall', '/static/img/combat/tiles/iso_wall.png');

        // Highlight tiles
        this.load.image('hl_move', '/static/img/combat/tiles/iso_highlight_move.png');
        this.load.image('hl_attack', '/static/img/combat/tiles/iso_highlight_attack.png');
        this.load.image('hl_heal', '/static/img/combat/tiles/iso_highlight_heal.png');
        this.load.image('hl_selected', '/static/img/combat/tiles/iso_highlight_selected.png');

        // Directional chihuahua sprites (4 classes × 4 directions × 4 states)
        // Default facing: nw_idle (north-west idle frame)
        const classes = ['guerrier', 'mage', 'archer', 'guerisseur'];
        const dirs = ['se', 'sw', 'ne', 'nw'];
        const states = ['idle', 'attack', 'hurt', 'ko'];
        for (const cls of classes) {
            for (const dir of dirs) {
                for (const state of states) {
                    this.load.image(`chi_${cls}_${dir}_${state}`, `/static/img/combat/chihuahua/${cls}_${dir}_${state}.png`);
                }
            }
        }

        // Monster sprites
        const monsterTypes = ['goblin', 'orc', 'slime', 'skeleton', 'dragon'];
        const monsterStates = ['idle', 'attack', 'hurt', 'ko'];
        for (const m of monsterTypes) {
            for (const s of monsterStates) {
                this.load.image(`mon_${m}_${s}`, `/static/img/combat/monsters/${m}_iso_${s}.png`);
            }
        }

        // Effects
        this.load.image('fx_slash', '/static/img/combat/effects/iso_slash.png');
        this.load.image('fx_fireball', '/static/img/combat/effects/iso_fireball.png');
        this.load.image('fx_heal', '/static/img/combat/effects/iso_heal.png');
        this.load.image('fx_shield', '/static/img/combat/effects/iso_shield.png');
    }

    create() {
        // Parse map config
        this.mapConfig = typeof MAP_CONFIG === 'string' ? JSON.parse(MAP_CONFIG) : MAP_CONFIG;
        this.gridW = this.mapConfig ? this.mapConfig.width : 10;
        this.gridH = this.mapConfig ? this.mapConfig.height : 8;

        // Center the iso grid
        const canvasW = this.sys.game.config.width;
        const canvasH = this.sys.game.config.height;
        this.offsetX = canvasW / 2;
        this.offsetY = 80;

        // Draw the grid
        this.drawGrid();

        // Register with socket
        if (typeof CombatSocketInstance !== 'undefined') {
            CombatSocketInstance.setGameInstance(this);
        }

        // ── Camera controls: drag to pan (any button) + scroll to zoom ──
        this._isDragging = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._camStartX = 0;
        this._camStartY = 0;

        this.input.on('pointerdown', (pointer) => {
            this._isDragging = true;
            this._dragStartX = pointer.x;
            this._dragStartY = pointer.y;
            this._camStartX = this.cameras.main.scrollX;
            this._camStartY = this.cameras.main.scrollY;
        });

        this.input.on('pointermove', (pointer) => {
            if (!this._isDragging || !pointer.isDown) return;
            const cam = this.cameras.main;
            const dx = (pointer.x - this._dragStartX) / cam.zoom;
            const dy = (pointer.y - this._dragStartY) / cam.zoom;
            cam.scrollX = this._camStartX - dx;
            cam.scrollY = this._camStartY - dy;
        });

        this.input.on('pointerup', () => {
            this._isDragging = false;
        });

        // Scroll to zoom — simple centered zoom
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            const cam = this.cameras.main;
            const zoomStep = deltaY > 0 ? -0.1 : 0.1;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom + zoomStep, 0.3, 3.0));
        });

        // Disable right-click context menu
        this.input.mouse.disableContextMenu();
    }

    // ── Isometric coordinate conversion ──

    gridToIso(gx, gy) {
        const isoX = (gx - gy) * (TILE_W / 2) + this.offsetX;
        const isoY = (gx + gy) * (TILE_H / 2) + this.offsetY;
        return { x: isoX, y: isoY };
    }

    isoToGrid(isoX, isoY) {
        const rx = isoX - this.offsetX;
        const ry = isoY - this.offsetY;
        const gx = (rx / (TILE_W / 2) + ry / (TILE_H / 2)) / 2;
        const gy = (ry / (TILE_H / 2) - rx / (TILE_W / 2)) / 2;
        return { x: Math.round(gx), y: Math.round(gy) };
    }

    // ── Grid rendering ──

    /**
     * Redraw the entire grid (called when map_config changes, e.g., after resize_for_players).
     * Also clears and re-adds all entities.
     */
    redrawGrid(newMapConfig) {
        console.log('[Arena] redrawGrid called, new size:', newMapConfig.width, 'x', newMapConfig.height);

        // Update config
        this.mapConfig = newMapConfig;
        this.gridW = newMapConfig.width || 10;
        this.gridH = newMapConfig.height || 8;

        // Recenter
        const canvasW = this.sys.game.config.width;
        this.offsetX = canvasW / 2;

        // Destroy old tile sprites
        for (const key in this.tileSprites) {
            this.tileSprites[key].destroy();
        }
        this.tileSprites = {};

        // Destroy old entity sprites
        for (const id in this.entitySprites) {
            const ent = this.entitySprites[id];
            if (ent.sprite) ent.sprite.destroy();
            if (ent.name) ent.name.destroy();
            if (ent.hpBg) ent.hpBg.destroy();
            if (ent.hpFill) ent.hpFill.destroy();
        }
        this.entitySprites = {};

        // Clear highlights
        this.clearHighlights();

        // Redraw
        this.drawGrid();
    }

    drawGrid() {
        const tiles = this.mapConfig ? this.mapConfig.tiles : null;
        const obstacles = this.mapConfig ? (this.mapConfig.obstacles || []) : [];

        // Build obstacle lookup
        const obstacleMap = {};
        for (const obs of obstacles) {
            obstacleMap[`${obs.x}_${obs.y}`] = obs.type;
        }

        // Draw tiles from back to front (painter's algorithm)
        for (let gy = 0; gy < this.gridH; gy++) {
            for (let gx = 0; gx < this.gridW; gx++) {
                const { x, y } = this.gridToIso(gx, gy);
                const key = `${gx}_${gy}`;
                const obsType = obstacleMap[key];

                let tileKey = 'iso_grass';
                if (obsType === 'water') {
                    tileKey = 'iso_water';
                } else if (obsType === 'wall') {
                    tileKey = 'iso_wall';
                } else if (tiles && tiles[gy] && tiles[gy][gx]) {
                    const tType = tiles[gy][gx];
                    if (tType === 'stone') tileKey = 'iso_stone';
                    else if (tType === 'dirt') tileKey = 'iso_dirt';
                    else if (tType === 'water') tileKey = 'iso_water';
                    else if (tType === 'wall') tileKey = 'iso_wall';
                }

                const tile = this.add.image(x, y, tileKey);
                tile.setOrigin(0.5, 0.5);
                tile.setDepth(gx + gy);
                this.tileSprites[key] = tile;
            }
        }
    }

    // ── Highlight tiles ──

    clearHighlights() {
        for (const key in this.highlightSprites) {
            this.highlightSprites[key].destroy();
        }
        this.highlightSprites = {};
    }

    showHighlights(tiles, type = 'move') {
        this.clearHighlights();
        const texKey = type === 'attack' ? 'hl_attack' : type === 'heal' ? 'hl_heal' : 'hl_move';

        for (const t of tiles) {
            const tx = t.x !== undefined ? t.x : t[0];
            const ty = t.y !== undefined ? t.y : t[1];
            const { x, y } = this.gridToIso(tx, ty);
            const key = `${tx}_${ty}`;
            const hl = this.add.image(x, y, texKey);
            hl.setOrigin(0.5, 0.5);
            hl.setDepth(tx + ty + 0.5);
            hl.setAlpha(0.7);

            // Pulse animation
            this.tweens.add({
                targets: hl,
                alpha: { from: 0.5, to: 0.9 },
                duration: 800,
                yoyo: true,
                repeat: -1,
            });

            this.highlightSprites[key] = hl;
        }
    }

    // ── Entity sprite management ──

    _getDirection(fromX, fromY, toX, toY) {
        const dx = toX - fromX;
        const dy = toY - fromY;
        if (dx >= 0 && dy >= 0) return 'se';
        if (dx >= 0 && dy < 0) return 'ne';
        if (dx < 0 && dy >= 0) return 'sw';
        return 'nw';
    }

    addParticipant(p) {
        const id = `player_${p.student_id || p.id}`;
        if (this.entitySprites[id]) return;

        const cls = (p.avatar_class || (p.snapshot_json && p.snapshot_json.avatar_class) || 'guerrier').toLowerCase();
        const { x, y } = this.gridToIso(p.grid_x, p.grid_y);
        const dir = 'ne';  // Default facing direction

        // Use NE idle sprite as default
        const spriteKey = `chi_${cls}_${dir}_idle`;
        const fallbackKey = `chi_${cls}_se_idle`;
        const usedKey = this.textures.exists(spriteKey) ? spriteKey : fallbackKey;
        const sprite = this.add.image(x, y - TILE_DEPTH, usedKey);
        sprite.setOrigin(0.5, 0.8);
        sprite.setScale(SPRITE_SIZE / Math.max(sprite.width, sprite.height, 1));
        sprite.setDepth(p.grid_x + p.grid_y + 1);

        // Name label
        const name = this.add.text(x, y - TILE_DEPTH - 50, p.student_name || 'Élève', {
            fontSize: '11px',
            fontFamily: 'Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(9999);

        // HP bar
        const barWidth = 36;
        const barY = y - TILE_DEPTH - 38;
        const hpBg = this.add.rectangle(x, barY, barWidth, 4, 0x333333).setDepth(9999);
        const maxHp = (p.snapshot_json && p.snapshot_json.max_hp) || p.max_hp || 100;
        const curHp = p.current_hp !== undefined ? p.current_hp : maxHp;
        const hpPct = Math.max(0, curHp / maxHp);
        const hpColor = hpPct > 0.5 ? 0x10b981 : hpPct > 0.25 ? 0xf59e0b : 0xef4444;
        const hpFill = this.add.rectangle(
            x - barWidth / 2 + (barWidth * hpPct) / 2,
            barY,
            barWidth * hpPct,
            4,
            hpColor
        ).setDepth(9999);

        this.entitySprites[id] = {
            sprite, name, hpBg, hpFill,
            data: p,
            type: 'player',
            cls: cls,
            direction: dir,
            state: p.is_alive !== false ? 'idle' : 'ko',
            isMoving: false,
        };

        // Start idle animation (bobbing + sprite cycling)
        this._startIdleAnimation(id);
    }

    /**
     * Looping idle animation: bob up/down and cycle between idle frames
     * of the current facing direction to simulate breathing.
     * Works for both players and monsters.
     */
    _startIdleAnimation(id) {
        const ent = this.entitySprites[id];
        if (!ent) return;

        // Only skip if the entity is already moving or KO
        if ((ent.type === 'player' && ent.isMoving) || ent.state === 'ko') return;

        // Bobbing tween (gentle up/down)
        if (ent._idleTween) ent._idleTween.destroy();
        ent._idleTween = this.tweens.add({
            targets: ent.sprite,
            y: ent.sprite.y - 3,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Sprite frame cycling: alternate idle ↔ attack frame every 600ms
        // This simulates a simple 2-frame walk/idle animation
        if (ent._idleTimer) ent._idleTimer.destroy();
        let frame = 0;
        const idleFrames = ['idle', 'idle']; // both idle — we'll add subtle scale change instead
        ent._idleTimer = this.time.addEvent({
            delay: 500,
            loop: true,
            callback: () => {
                if ((ent.type === 'player' && ent.isMoving) || ent.state === 'ko') return;
                frame = (frame + 1) % 2;
                // Subtle scale pulse for "breathing"
                const baseScale = SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1);
                ent.sprite.setScale(baseScale * (frame === 0 ? 1.0 : 1.03));
            },
        });
    }

    /**
     * Stop idle animation (when moving or KO).
     */
    _stopIdleAnimation(id) {
        const ent = this.entitySprites[id];
        if (!ent) return;
        if (ent._idleTween) { ent._idleTween.destroy(); ent._idleTween = null; }
        if (ent._idleTimer) { ent._idleTimer.destroy(); ent._idleTimer = null; }
    }

    addMonster(m) {
        const id = `monster_${m.id}`;
        if (this.entitySprites[id]) return;

        const monType = (m.monster_type || 'goblin').toLowerCase();
        const { x, y } = this.gridToIso(m.grid_x, m.grid_y);

        const spriteKey = `mon_${monType}_idle`;
        const sprite = this.add.image(x, y - TILE_DEPTH, spriteKey);
        sprite.setOrigin(0.5, 0.8);
        sprite.setDepth(m.grid_x + m.grid_y + 1);

        // Name
        const name = this.add.text(x, y - TILE_DEPTH - 36, m.name || monType, {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#ff6b6b',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(9999);

        // HP bar
        const barWidth = 30;
        const barY = y - TILE_DEPTH - 26;
        const hpBg = this.add.rectangle(x, barY, barWidth, 4, 0x333333).setDepth(9999);
        const maxHp = m.max_hp || 100;
        const curHp = m.current_hp !== undefined ? m.current_hp : maxHp;
        const hpPct = Math.max(0, curHp / maxHp);
        const hpFill = this.add.rectangle(
            x - barWidth / 2 + (barWidth * hpPct) / 2,
            barY,
            barWidth * hpPct,
            4,
            0xef4444
        ).setDepth(9999);

        this.entitySprites[id] = {
            sprite, name, hpBg, hpFill,
            data: m,
            type: 'monster',
            monType: monType,
            state: m.is_alive !== false ? 'idle' : 'ko',
        };

        // Start idle animation for monsters
        this._startIdleAnimation(id);
    }

    /**
     * Move an entity to a grid position — simple teleport or single-step tween.
     * For path-following, use animateAlongPath() instead.
     */
    updateEntityPosition(id, gx, gy, animate = true) {
        const ent = this.entitySprites[id];
        if (!ent) return;

        const { x, y } = this.gridToIso(gx, gy);
        const targetY = y - TILE_DEPTH;

        // Update direction for players
        if (ent.type === 'player' && ent.data) {
            const newDir = this._getDirection(ent.data.grid_x, ent.data.grid_y, gx, gy);
            if (newDir !== ent.direction) {
                ent.direction = newDir;
                const texKey = `chi_${ent.cls}_${newDir}_idle`;
                if (this.textures.exists(texKey)) {
                    ent.sprite.setTexture(texKey);
                    ent.sprite.setScale(SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1));
                }
            }
        }

        if (animate) {
            this.tweens.add({
                targets: [ent.sprite],
                x: x, y: targetY,
                duration: 300, ease: 'Linear',
                onComplete: () => { ent.sprite.setDepth(gx + gy + 1); },
            });
            this.tweens.add({ targets: ent.name, x: x, y: targetY - (ent.type === 'monster' ? 36 : 50), duration: 300, ease: 'Linear' });
            const barY = targetY - (ent.type === 'monster' ? 26 : 38);
            this.tweens.add({ targets: [ent.hpBg], x: x, y: barY, duration: 300, ease: 'Linear' });
            this.tweens.add({ targets: [ent.hpFill], x: x, y: barY, duration: 300, ease: 'Linear' });
        } else {
            ent.sprite.setPosition(x, targetY);
            ent.sprite.setDepth(gx + gy + 1);
            const nameYOff = ent.type === 'monster' ? 36 : 50;
            const barYOff = ent.type === 'monster' ? 26 : 38;
            ent.name.setPosition(x, targetY - nameYOff);
            ent.hpBg.setPosition(x, targetY - barYOff);
            ent.hpFill.setPosition(x, targetY - barYOff);
        }
    }

    /**
     * Animate a player entity along a series of grid cells (path).
     * Changes direction sprite at each step.
     * @param {string} id - entity ID (e.g., 'player_34')
     * @param {Array<{x,y}>} path - ordered list of grid positions
     */
    animateAlongPath(id, path) {
        const ent = this.entitySprites[id];
        if (!ent || !path || path.length < 2) return;

        // Stop idle animation during movement
        ent.isMoving = true;
        this._stopIdleAnimation(id);

        const stepDuration = 250; // ms per cell
        let stepIdx = 1; // start from step 1 (step 0 is current position)

        const doStep = () => {
            if (stepIdx >= path.length) {
                // Movement complete — restart idle
                ent.isMoving = false;
                this._startIdleAnimation(id);
                return;
            }

            const prevCell = path[stepIdx - 1];
            const cell = path[stepIdx];
            const { x, y } = this.gridToIso(cell.x, cell.y);
            const targetY = y - TILE_DEPTH;

            // Update direction based on movement
            const newDir = this._getDirection(prevCell.x, prevCell.y, cell.x, cell.y);
            if (newDir !== ent.direction) {
                ent.direction = newDir;
                const texKey = `chi_${ent.cls}_${newDir}_idle`;
                if (this.textures.exists(texKey)) {
                    ent.sprite.setTexture(texKey);
                    ent.sprite.setScale(SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1));
                }
            }

            // Tween sprite + name + HP bars to next cell
            this.tweens.add({
                targets: [ent.sprite],
                x: x, y: targetY,
                duration: stepDuration,
                ease: 'Linear',
                onComplete: () => {
                    ent.sprite.setDepth(cell.x + cell.y + 1);
                    stepIdx++;
                    doStep(); // Next step
                },
            });
            this.tweens.add({
                targets: ent.name,
                x: x, y: targetY - 50,
                duration: stepDuration, ease: 'Linear',
            });
            const barY = targetY - 38;
            this.tweens.add({
                targets: [ent.hpBg],
                x: x, y: barY,
                duration: stepDuration, ease: 'Linear',
            });
            this.tweens.add({
                targets: [ent.hpFill],
                x: x, y: barY,
                duration: stepDuration, ease: 'Linear',
            });
        };

        doStep();
    }

    updateEntityHP(id, curHp, maxHp) {
        const ent = this.entitySprites[id];
        if (!ent) return;

        const barWidth = 30;
        const pct = Math.max(0, Math.min(1, curHp / maxHp));
        const hpColor = ent.type === 'monster' ? 0xef4444
            : (pct > 0.5 ? 0x10b981 : pct > 0.25 ? 0xf59e0b : 0xef4444);

        ent.hpFill.width = barWidth * pct;
        ent.hpFill.fillColor = hpColor;
        const baseX = ent.hpBg.x;
        ent.hpFill.x = baseX - barWidth / 2 + (barWidth * pct) / 2;
    }

    setEntityState(id, state) {
        const ent = this.entitySprites[id];
        if (!ent) return;

        ent.state = state;
        let texKey;
        if (ent.type === 'player') {
            texKey = `chi_${ent.cls}_${ent.direction || 'se'}_${state}`;
        } else {
            texKey = `mon_${ent.monType}_${state}`;
        }

        if (this.textures.exists(texKey)) {
            ent.sprite.setTexture(texKey);
        }

        if (state === 'ko') {
            ent.sprite.setAlpha(0.5);
            ent.name.setAlpha(0.5);
        } else {
            ent.sprite.setAlpha(1);
            ent.name.setAlpha(1);
        }
    }

    // ── Full state update from server ──

    updateState(state) {
        if (!state) return;

        // Check if map config changed (e.g., after resize_for_players)
        if (state.map_config) {
            const newW = state.map_config.width;
            const newH = state.map_config.height;
            const oldW = this.mapConfig ? this.mapConfig.width : 0;
            const oldH = this.mapConfig ? this.mapConfig.height : 0;

            if (newW !== oldW || newH !== oldH) {
                console.log(`[Arena] Map size changed: ${oldW}x${oldH} → ${newW}x${newH}, redrawing...`);
                this.redrawGrid(state.map_config);
            }
        }

        // Update round/phase
        if (state.current_round !== undefined) {
            // Show round banner if round changed
            if (this.currentRound !== state.current_round) {
                this._showRoundBanner(state.current_round);
            }
            this.currentRound = state.current_round;
            const roundEl = document.getElementById('round-number');
            if (roundEl) roundEl.textContent = 'Round ' + state.current_round;
        }
        if (state.current_phase) {
            this.currentPhase = state.current_phase;
            if (typeof CombatSocketInstance !== 'undefined') {
                CombatSocketInstance.updatePhaseIndicator(state.current_phase);
            }
        }

        // Update participants
        if (state.participants) {
            this.participants = state.participants;
            for (const p of state.participants) {
                const id = `player_${p.student_id}`;
                if (!this.entitySprites[id]) {
                    this.addParticipant(p);
                } else {
                    const ent = this.entitySprites[id];
                    const oldData = ent.data;
                    // Don't override position during path animation
                    if (!ent.isMoving && (oldData.grid_x !== p.grid_x || oldData.grid_y !== p.grid_y)) {
                        this.updateEntityPosition(id, p.grid_x, p.grid_y, true);
                    }
                    const maxHp = (p.snapshot_json && p.snapshot_json.max_hp) || p.max_hp || 100;
                    this.updateEntityHP(id, p.current_hp, maxHp);

                    if (!p.is_alive && ent.state !== 'ko') {
                        this.setEntityState(id, 'ko');
                    } else if (p.is_alive && ent.state === 'ko') {
                        this.setEntityState(id, 'idle');
                    }
                    ent.data = p;
                }
            }
            this.updatePlayerRoster(state.participants);
        }

        // Update monsters
        if (state.monsters) {
            this.monsters = state.monsters;
            for (const m of state.monsters) {
                const id = `monster_${m.id}`;
                if (!this.entitySprites[id]) {
                    this.addMonster(m);
                } else {
                    const ent = this.entitySprites[id];
                    const oldData = ent.data;
                    if (oldData.grid_x !== m.grid_x || oldData.grid_y !== m.grid_y) {
                        this.updateEntityPosition(id, m.grid_x, m.grid_y, true);
                    }
                    this.updateEntityHP(id, m.current_hp, m.max_hp);
                    if (!m.is_alive && ent.state !== 'ko') {
                        this.setEntityState(id, 'ko');
                    }
                    ent.data = m;
                }
            }
            this.updateMonsterRoster(state.monsters);
        }
    }

    // ── Phase change handler ──

    onPhaseChange(phase) {
        this.currentPhase = phase;
        this.clearHighlights();

        // Show phase banner
        this._showPhaseBanner(phase);

        if (typeof CombatSocketInstance !== 'undefined') {
            if (phase === 'move') {
                CombatSocketInstance.addCombatLogEntry('Phase de déplacement', 'phase');
            } else if (phase === 'action') {
                CombatSocketInstance.addCombatLogEntry('Phase d\'action', 'phase');
            }
        }
    }

    /**
     * Display a dramatic phase transition banner
     */
    _showPhaseBanner(phase) {
        const phaseTexts = {
            'move': { text: 'DÉPLACEMENT', color: 0x3b82f6, bgColor: '#3b82f6' },
            'question': { text: 'QUESTION', color: 0xeab308, bgColor: '#eab308' },
            'action': { text: 'ATTAQUE!', color: 0xdc2626, bgColor: '#dc2626' },
            'execute': { text: 'EXÉCUTION!', color: 0xf97316, bgColor: '#f97316' },
            'monster_turn': { text: 'TOUR DES MONSTRES', color: 0xa855f7, bgColor: '#a855f7' },
        };

        const phaseInfo = phaseTexts[phase] || { text: phase.toUpperCase(), color: 0x6366f1, bgColor: '#6366f1' };
        const canvasW = this.sys.game.config.width;
        const canvasH = this.sys.game.config.height;

        // Semi-transparent background for banner
        const bgGraphics = this.add.graphics();
        bgGraphics.fillStyle(0x000000, 0.5);
        bgGraphics.fillRect(-canvasW, canvasH / 2 - 50, canvasW * 3, 100);
        bgGraphics.setDepth(10001);

        // Phase text banner
        const bannerText = this.add.text(canvasW / 2, canvasH / 2, phaseInfo.text, {
            fontSize: '64px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: phaseInfo.bgColor,
            strokeThickness: 6,
        }).setOrigin(0.5).setDepth(10002);

        // Animate banner: slide in from left, stay, fade out
        bannerText.x = -canvasW / 2;
        this.tweens.add({
            targets: bannerText,
            x: canvasW / 2,
            duration: 500,
            ease: 'Power2.out',
        });

        // Keep visible for 1.5 seconds, then fade out
        this.time.delayedCall(1500, () => {
            this.tweens.add({
                targets: [bannerText, bgGraphics],
                alpha: 0,
                duration: 400,
                ease: 'Linear',
                onComplete: () => {
                    bannerText.destroy();
                    bgGraphics.destroy();
                },
            });
        });
    }

    /**
     * Display round counter
     */
    _showRoundBanner(roundNum) {
        const canvasW = this.sys.game.config.width;
        const canvasH = this.sys.game.config.height;

        const roundText = this.add.text(canvasW / 2, 100, `ROUND ${roundNum}`, {
            fontSize: '48px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: '#fbbf24',
            stroke: '#92400e',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(10000);

        // Scale up, stay, then fade away
        roundText.setScale(0.5);
        this.tweens.add({
            targets: roundText,
            scale: 1,
            duration: 400,
            ease: 'Back.out',
        });

        this.time.delayedCall(2000, () => {
            this.tweens.add({
                targets: roundText,
                alpha: 0,
                duration: 500,
                ease: 'Linear',
                onComplete: () => roundText.destroy(),
            });
        });
    }

    // ── Move result handler ──

    onMoveResult(result) {
        if (!result) return;

        // Server sends: {student_id, participant_id, from_x, from_y, to_x, to_y, path}
        const toX = result.to_x;
        const toY = result.to_y;
        const path = result.path; // Array of {x, y} cells

        // Find entity by participant_id or student_id
        for (const id in this.entitySprites) {
            const ent = this.entitySprites[id];
            if (ent.type === 'player' && ent.data &&
                (ent.data.id === result.participant_id || ent.data.student_id === result.student_id)) {

                // Use path animation if available, otherwise simple move
                if (path && path.length > 1) {
                    this.animateAlongPath(id, path);
                } else {
                    this.updateEntityPosition(id, toX, toY, true);
                }
                ent.data.grid_x = toX;
                ent.data.grid_y = toY;

                if (typeof CombatSocketInstance !== 'undefined') {
                    CombatSocketInstance.addCombatLogEntry(
                        `${ent.data.student_name || 'Joueur'} se déplace vers (${toX},${toY})`, 'default'
                    );
                }
                break;
            }
        }
    }

    // ── Animations from execute phase ──

    playAnimations(animations) {
        if (!animations || !Array.isArray(animations)) return;

        let delay = 0;
        for (const anim of animations) {
            this.time.delayedCall(delay, () => {
                this._playOneAnimation(anim);
            });
            delay += 900;
        }

        this.time.delayedCall(delay + 300, () => {
            this.clearHighlights();
        });
    }

    _playOneAnimation(anim) {
        const type = anim.type;

        if (type === 'monster_move') {
            this._playMonsterMoveAnim(anim);
        } else if (type === 'attack' || type === 'monster_attack') {
            this._playAttackAnim(anim);
        } else if (type === 'heal') {
            this._playHealAnim(anim);
        } else if (type === 'buff') {
            this._playBuffAnim(anim);
        }

        // Log
        if (typeof CombatSocketInstance !== 'undefined') {
            const dmg = anim.damage || anim.heal || 0;
            const logType = type === 'heal' ? 'heal' : 'damage';
            let msg = '';
            if (type === 'monster_move') {
                msg = `${anim.monster_name || 'Monstre'} se déplace`;
            } else if (type === 'attack') {
                msg = `${anim.attacker_name || '?'} → ${anim.target_name || '?'} : ${dmg} dégâts`;
            } else if (type === 'heal') {
                msg = `${anim.attacker_name || '?'} soigne ${anim.target_name || '?'} : +${dmg} HP`;
            } else if (type === 'monster_attack') {
                msg = `${anim.attacker_name || 'Monstre'} → ${anim.target_name || '?'} : ${dmg} dégâts`;
            } else {
                msg = `${anim.attacker_name || '?'} utilise ${anim.skill_name || 'compétence'}`;
            }
            CombatSocketInstance.addCombatLogEntry(msg, logType);
        }
    }

    _playMonsterMoveAnim(anim) {
        const monsterId = `monster_${anim.monster_id}`;
        const entity = this.entitySprites[monsterId];
        if (!entity) return;

        const newIso = this.gridToIso(anim.to_x, anim.to_y);
        entity.data = entity.data || {};
        entity.data.grid_x = anim.to_x;
        entity.data.grid_y = anim.to_y;

        const dx = newIso.x - entity.sprite.x;
        const dy = (newIso.y - TILE_DEPTH) - entity.sprite.y;

        // Move all parts of the entity together
        const parts = [entity.sprite, entity.hpBg, entity.hpFill, entity.name].filter(Boolean);
        for (const part of parts) {
            this.tweens.add({
                targets: part,
                x: part.x + dx,
                y: part.y + dy,
                duration: 400,
                ease: 'Power2',
            });
        }

        // Update depth after move
        this.time.delayedCall(420, () => {
            if (entity.sprite) entity.sprite.setDepth(anim.to_x + anim.to_y + 1);
        });
    }

    _playAttackAnim(anim) {
        const attackerId = anim.attacker_type === 'monster'
            ? `monster_${anim.attacker_id}` : `player_${anim.attacker_id}`;
        const targetId = anim.target_type === 'monster'
            ? `monster_${anim.target_id}` : `player_${anim.target_id}`;

        const attacker = this.entitySprites[attackerId];
        const target = this.entitySprites[targetId];

        if (attacker) {
            // Face towards target
            if (attacker.type === 'player' && target) {
                const dir = this._getDirection(
                    attacker.data.grid_x, attacker.data.grid_y,
                    target.data.grid_x, target.data.grid_y
                );
                attacker.direction = dir;
            }
            this.setEntityState(attackerId, 'attack');
            this.time.delayedCall(500, () => {
                this.setEntityState(attackerId, 'idle');
            });
        }

        if (target) {
            const dmg = anim.damage || 0;
            const isCritical = anim.critical || false;
            const isHeavyHit = dmg > 10;

            // Camera shake on heavy hits
            if (isHeavyHit || isCritical) {
                this.cameras.main.shake(200, 0.02);
            }

            const fxKey = anim.skill_type === 'magic' ? 'fx_fireball' : 'fx_slash';
            if (this.textures.exists(fxKey)) {
                const fx = this.add.image(target.sprite.x, target.sprite.y, fxKey);
                fx.setDepth(9998);
                fx.setAlpha(0);
                this.tweens.add({
                    targets: fx,
                    alpha: 1,
                    scale: { from: 0.5, to: 1.3 },
                    duration: 350,
                    yoyo: true,
                    onComplete: () => fx.destroy(),
                });
            }

            // Particle scatter effect on impact
            if (isHeavyHit) {
                this._createImpactParticles(target.sprite.x, target.sprite.y, dmg);
            }

            // Target flash white on hit
            this.time.delayedCall(100, () => {
                if (target.sprite) {
                    const originalTint = target.sprite.tint;
                    target.sprite.setTint(0xffffff);
                    this.time.delayedCall(150, () => {
                        if (target.sprite) target.sprite.clearTint();
                    });
                }
            });

            // Screen flash overlay for big hits
            if (isHeavyHit || isCritical) {
                this._screenFlash(dmg > 30 ? 0.3 : 0.15);
            }

            // Damage number - make it bigger and more dramatic
            if (dmg > 0) {
                const prefix = isCritical ? 'CRIT! -' : '-';
                this._showDamageNumber(target.sprite.x, target.sprite.y - 20, dmg, '#ff4444', isCritical);
            }

            // Hurt flash
            this.time.delayedCall(200, () => {
                this.setEntityState(targetId, 'hurt');
                this.time.delayedCall(400, () => {
                    if (anim.killed) {
                        this._playKOAnimation(targetId);
                    } else {
                        this.setEntityState(targetId, 'idle');
                    }
                });
            });

            if (anim.target_hp !== undefined && anim.target_max_hp) {
                this.time.delayedCall(300, () => {
                    this.updateEntityHP(targetId, anim.target_hp, anim.target_max_hp);
                });
            }
        }
    }

    _playHealAnim(anim) {
        const targetId = `player_${anim.target_id}`;
        const target = this.entitySprites[targetId];

        if (target && this.textures.exists('fx_heal')) {
            const fx = this.add.image(target.sprite.x, target.sprite.y, 'fx_heal');
            fx.setDepth(9998);
            fx.setAlpha(0);
            this.tweens.add({
                targets: fx,
                alpha: 1,
                scale: { from: 0.8, to: 1.5 },
                duration: 500,
                yoyo: true,
                onComplete: () => fx.destroy(),
            });
        }

        if (target && anim.heal) {
            this._showHealNumber(target.sprite.x, target.sprite.y - 20, anim.heal);
        }

        if (anim.target_hp !== undefined && anim.target_max_hp) {
            this.updateEntityHP(targetId, anim.target_hp, anim.target_max_hp);
        }
    }

    _playBuffAnim(anim) {
        const targetId = `player_${anim.target_id || anim.attacker_id}`;
        const target = this.entitySprites[targetId];

        if (target && this.textures.exists('fx_shield')) {
            const fx = this.add.image(target.sprite.x, target.sprite.y, 'fx_shield');
            fx.setDepth(9998);
            fx.setAlpha(0);
            this.tweens.add({
                targets: fx,
                alpha: 0.8,
                duration: 500,
                yoyo: true,
                onComplete: () => fx.destroy(),
            });
        }
    }

    /**
     * Create particle scatter effect from impact point
     */
    _createImpactParticles(x, y, damage) {
        const particleCount = Math.min(8, Math.floor(damage / 5));
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const speed = 150 + Math.random() * 100;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            const particle = this.add.circle(x, y, 3, 0xff6b6b);
            particle.setDepth(9998);

            this.tweens.add({
                targets: particle,
                x: x + vx * 0.5,
                y: y + vy * 0.5,
                alpha: { from: 0.8, to: 0 },
                scale: { from: 1, to: 0.3 },
                duration: 600,
                ease: 'Power2.out',
                onComplete: () => particle.destroy(),
            });
        }
    }

    /**
     * Flash the screen with a color overlay
     */
    _screenFlash(intensity = 0.2) {
        const canvasW = this.sys.game.config.width;
        const canvasH = this.sys.game.config.height;

        const flash = this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, 0xffffff);
        flash.setDepth(10000);
        flash.setAlpha(intensity);

        this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 250,
            ease: 'Power2.out',
            onComplete: () => flash.destroy(),
        });
    }

    /**
     * Play dramatic KO animation: shrink, spin, gray out, fade
     */
    _playKOAnimation(id) {
        const ent = this.entitySprites[id];
        if (!ent) return;

        this._stopIdleAnimation(id);

        // Shrink and spin
        this.tweens.add({
            targets: ent.sprite,
            scale: 0.3,
            rotation: Math.PI * 2,
            duration: 600,
            ease: 'Back.in',
        });

        // Turn gray
        this.time.delayedCall(300, () => {
            if (ent.sprite) {
                ent.sprite.setTint(0x808080);
            }
        });

        // Fade out
        this.time.delayedCall(600, () => {
            this.tweens.add({
                targets: [ent.sprite, ent.name, ent.hpBg, ent.hpFill],
                alpha: 0.3,
                duration: 400,
                ease: 'Linear',
                onComplete: () => {
                    this.setEntityState(id, 'ko');
                },
            });
        });
    }

    _showDamageNumber(x, y, value, color, isCritical = false) {
        const prefix = isCritical ? 'CRIT! ' : '';
        const text = this.add.text(x, y, prefix + '-' + Math.abs(value), {
            fontSize: isCritical ? '32px' : '24px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: color,
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(10000);

        // Start small, scale up, then float away
        text.setScale(0.5);
        this.tweens.add({
            targets: text,
            scale: isCritical ? 1.3 : 1.0,
            y: y - 50,
            alpha: { from: 1, to: 0 },
            duration: 1400,
            ease: 'Power2.out',
            onComplete: () => text.destroy(),
        });
    }

    _showHealNumber(x, y, value) {
        const text = this.add.text(x, y, '+' + Math.abs(value), {
            fontSize: '24px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: '#10b981',
            stroke: '#059669',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(10000);

        // Start small, scale up, then float away
        text.setScale(0.5);
        this.tweens.add({
            targets: text,
            scale: 1.0,
            y: y - 50,
            alpha: { from: 1, to: 0 },
            duration: 1400,
            ease: 'Power2.out',
            onComplete: () => text.destroy(),
        });
    }

    // ── Side panel updates ──

    updatePlayerRoster(participants) {
        const container = document.getElementById('players-list');
        if (!container) return;

        container.innerHTML = participants.map(p => {
            const maxHp = (p.snapshot_json && p.snapshot_json.max_hp) || p.max_hp || 100;
            const maxMana = (p.snapshot_json && p.snapshot_json.max_mana) || p.max_mana || 50;
            const hpPct = Math.max(0, Math.min(100, Math.round((p.current_hp / maxHp) * 100)));
            const manaPct = Math.max(0, Math.min(100, Math.round((p.current_mana / maxMana) * 100)));
            const alive = p.is_alive !== false;
            const cls = p.avatar_class || (p.snapshot_json && p.snapshot_json.avatar_class) || '?';

            return `
                <div class="entity-card" style="opacity:${alive ? 1 : 0.4}">
                    <div class="entity-name">${p.student_name || 'Élève'} <small style="color:#a0aec0">${cls}</small></div>
                    <div class="bar-label"><span>HP</span><span>${p.current_hp}/${maxHp}</span></div>
                    <div class="hp-bar-container">
                        <div class="hp-bar-fill" style="width:${hpPct}%;background:${hpPct > 50 ? '#10b981' : hpPct > 25 ? '#f59e0b' : '#ef4444'}"></div>
                    </div>
                    <div class="bar-label"><span>Mana</span><span>${p.current_mana}/${maxMana}</span></div>
                    <div class="mana-bar-container">
                        <div class="mana-bar-fill" style="width:${manaPct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateMonsterRoster(monsters) {
        const container = document.getElementById('monsters-list');
        if (!container) return;

        container.innerHTML = monsters.map(m => {
            const hpPct = Math.max(0, Math.min(100, Math.round((m.current_hp / m.max_hp) * 100)));
            const alive = m.is_alive !== false;

            return `
                <div class="entity-card" style="opacity:${alive ? 1 : 0.4}">
                    <div class="entity-name" style="color:#ef4444">${m.name || m.monster_type} <small>Nv.${m.level || 1}</small></div>
                    <div class="bar-label"><span>HP</span><span>${m.current_hp}/${m.max_hp}</span></div>
                    <div class="hp-bar-container">
                        <div class="hp-bar-fill" style="width:${hpPct}%;background:#ef4444"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Show victory or defeat screen on the Phaser canvas
     */
    showCombatEndScreen(isVictory) {
        const canvasW = this.sys.game.config.width;
        const canvasH = this.sys.game.config.height;

        // Semi-transparent overlay
        const overlay = this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, 0x000000);
        overlay.setAlpha(0.6);
        overlay.setDepth(10010);

        // Victory/Defeat text
        const resultText = isVictory ? 'VICTOIRE!' : 'DÉFAITE';
        const resultColor = isVictory ? '#10b981' : '#ef4444';
        const resultStroke = isVictory ? '#059669' : '#dc2626';

        const text = this.add.text(canvasW / 2, canvasH / 2, resultText, {
            fontSize: '96px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: resultColor,
            stroke: resultStroke,
            strokeThickness: 8,
        }).setOrigin(0.5).setDepth(10011);

        text.setScale(0);
        this.tweens.add({
            targets: text,
            scale: 1,
            duration: 600,
            ease: 'Back.out',
        });

        // Particle burst around text
        this._createVictoryParticles(canvasW / 2, canvasH / 2, isVictory);
    }

    /**
     * Create celebratory or mournful particles
     */
    _createVictoryParticles(centerX, centerY, isVictory) {
        const particleCount = 20;
        const color = isVictory ? 0xfbbf24 : 0xff6b6b;

        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const speed = 200 + Math.random() * 200;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            const particle = this.add.circle(centerX, centerY, 4, color);
            particle.setDepth(10010);

            this.tweens.add({
                targets: particle,
                x: centerX + vx,
                y: centerY + vy,
                alpha: { from: 0.8, to: 0 },
                scale: { from: 1, to: 0 },
                duration: 1000,
                ease: 'Power2.out',
                onComplete: () => particle.destroy(),
            });
        }
    }
}

// ── Initialize Phaser ──

document.addEventListener('DOMContentLoaded', () => {
    const gameContainer = document.getElementById('phaser-game');
    if (!gameContainer) return;

    const config = {
        type: Phaser.AUTO,
        parent: 'phaser-game',
        width: window.innerWidth - 500,
        height: window.innerHeight - 60,
        transparent: true,
        scene: CombatArena,
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
    };

    const game = new Phaser.Game(config);

    window.addEventListener('resize', () => {
        game.scale.resize(window.innerWidth - 500, window.innerHeight - 60);
    });
});
