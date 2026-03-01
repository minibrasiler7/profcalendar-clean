/**
 * Phaser.js Isometric Combat Arena (FFT-like)
 * Renders the combat grid in isometric view with depth sorting.
 */

const TILE_W = 64;
const TILE_H = 32;
const TILE_DEPTH = 16;
const SPRITE_SIZE = 48;

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

        // User's own chihuahua sprites (main character images)
        const classes = ['guerrier', 'mage', 'archer', 'guerisseur'];
        for (const cls of classes) {
            this.load.image(`chi_${cls}_main`, `/static/img/chihuahua/${cls}.png`);
        }

        // Directional chihuahua sprites (4 classes × 4 directions × 4 states) for animations
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

        // Camera drag (middle click or right click)
        this.input.on('pointermove', (pointer) => {
            if (pointer.isDown && (pointer.button === 1 || pointer.button === 2)) {
                this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
                this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
            }
        });

        // Zoom with mouse wheel — zoom toward cursor position
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            const cam = this.cameras.main;
            const oldZoom = cam.zoom;
            const newZoom = Phaser.Math.Clamp(oldZoom - deltaY * 0.001, 0.4, 2.5);

            if (newZoom === oldZoom) return;

            // Calculate the world point under the cursor before zoom
            const worldX = cam.scrollX + pointer.x / oldZoom;
            const worldY = cam.scrollY + pointer.y / oldZoom;

            cam.setZoom(newZoom);

            // Adjust scroll so the world point stays under the cursor
            cam.scrollX = worldX - pointer.x / newZoom;
            cam.scrollY = worldY - pointer.y / newZoom;
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

        // Use user's own sprite first, fall back to directional sprite
        const mainKey = `chi_${cls}_main`;
        const fallbackKey = `chi_${cls}_se_idle`;
        const spriteKey = this.textures.exists(mainKey) ? mainKey : fallbackKey;
        const sprite = this.add.image(x, y - TILE_DEPTH, spriteKey);
        sprite.setOrigin(0.5, 0.8);
        // Scale down if using main sprite (user sprites are large ~1MB images)
        if (spriteKey === mainKey) {
            sprite.setScale(SPRITE_SIZE / Math.max(sprite.width, sprite.height, 1));
        }
        sprite.setDepth(p.grid_x + p.grid_y + 1);

        // Name label
        const name = this.add.text(x, y - TILE_DEPTH - 30, p.student_name || 'Élève', {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(9999);

        // HP bar
        const barWidth = 30;
        const barY = y - TILE_DEPTH - 20;
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
            direction: 'se',
            state: p.is_alive !== false ? 'idle' : 'ko',
        };
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
    }

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
                const texKey = `chi_${ent.cls}_${newDir}_${ent.state}`;
                if (this.textures.exists(texKey)) {
                    ent.sprite.setTexture(texKey);
                }
            }
        }

        if (animate) {
            this.tweens.add({
                targets: [ent.sprite],
                x: x,
                y: targetY,
                duration: 400,
                ease: 'Power2',
                onComplete: () => {
                    ent.sprite.setDepth(gx + gy + 1);
                },
            });
            this.tweens.add({
                targets: ent.name,
                x: x,
                y: targetY - (ent.type === 'monster' ? 36 : 30),
                duration: 400,
                ease: 'Power2',
            });
            const barY = targetY - (ent.type === 'monster' ? 26 : 20);
            this.tweens.add({
                targets: [ent.hpBg],
                x: x,
                y: barY,
                duration: 400,
                ease: 'Power2',
            });
            this.tweens.add({
                targets: [ent.hpFill],
                x: x,
                y: barY,
                duration: 400,
                ease: 'Power2',
            });
        } else {
            ent.sprite.setPosition(x, targetY);
            ent.sprite.setDepth(gx + gy + 1);
            const nameYOff = ent.type === 'monster' ? 36 : 30;
            const barYOff = ent.type === 'monster' ? 26 : 20;
            ent.name.setPosition(x, targetY - nameYOff);
            ent.hpBg.setPosition(x, targetY - barYOff);
            ent.hpFill.setPosition(x, targetY - barYOff);
        }
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

        // Update round/phase
        if (state.current_round !== undefined) {
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
                    if (oldData.grid_x !== p.grid_x || oldData.grid_y !== p.grid_y) {
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

        if (typeof CombatSocketInstance !== 'undefined') {
            if (phase === 'move') {
                CombatSocketInstance.addCombatLogEntry('Phase de déplacement', 'phase');
            } else if (phase === 'action') {
                CombatSocketInstance.addCombatLogEntry('Phase d\'action', 'phase');
            }
        }
    }

    // ── Move result handler ──

    onMoveResult(result) {
        if (!result) return;

        // Server sends: {student_id, participant_id, from_x, from_y, to_x, to_y}
        const toX = result.to_x;
        const toY = result.to_y;

        // Find entity by participant_id or student_id
        for (const id in this.entitySprites) {
            const ent = this.entitySprites[id];
            if (ent.type === 'player' && ent.data &&
                (ent.data.id === result.participant_id || ent.data.student_id === result.student_id)) {
                this.updateEntityPosition(id, toX, toY, true);
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

            // Damage number
            const dmg = anim.damage || 0;
            if (dmg > 0) {
                this._showDamageNumber(target.sprite.x, target.sprite.y - 20, dmg, '#ff4444');
            }

            // Hurt flash
            this.time.delayedCall(200, () => {
                this.setEntityState(targetId, 'hurt');
                this.time.delayedCall(400, () => {
                    if (anim.killed) {
                        this.setEntityState(targetId, 'ko');
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
            this._showDamageNumber(target.sprite.x, target.sprite.y - 20, -anim.heal, '#10b981');
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

    _showDamageNumber(x, y, value, color) {
        const prefix = value > 0 ? '-' : '+';
        const text = this.add.text(x, y, prefix + Math.abs(value), {
            fontSize: '16px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: color,
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(10000);

        this.tweens.add({
            targets: text,
            y: y - 40,
            alpha: { from: 1, to: 0 },
            duration: 1200,
            ease: 'Power2',
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
