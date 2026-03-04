/**
 * Phaser.js Isometric Combat Arena (FFT-like)
 * Renders the combat grid in isometric view with depth sorting.
 */

const TILE_W = 64;
const TILE_H = 32;
const TILE_DEPTH = 8;
const SPRITE_SIZE = 72;

class CombatArena extends Phaser.Scene {
    constructor() {
        super({ key: 'CombatArena' });
        this.mapConfig = null;
        this.gridW = 10;
        this.gridH = 8;
        this.tileSprites = {};    // {`${x}_${y}`: sprite}
        this.elevationGfx = {};   // {`${x}_${y}`: graphics} — side face graphics for elevated tiles
        this.tileEffects = [];    // lava glows, water tweens, etc.
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
        // ── Loading screen ──
        const canvasW = this.sys.game.config.width;
        const canvasH = this.sys.game.config.height;

        // Loading bar background
        const barBg = this.add.rectangle(canvasW / 2, canvasH / 2 + 20, 360, 20, 0x0a0e1a);
        barBg.setStrokeStyle(1, 0x4f6bff);
        const barFill = this.add.rectangle(canvasW / 2 - 178, canvasH / 2 + 20, 0, 16, 0x4f6bff);
        barFill.setOrigin(0, 0.5);

        const loadText = this.add.text(canvasW / 2, canvasH / 2 - 40, 'CHARGEMENT', {
            fontSize: '12px', fontFamily: '"Press Start 2P", monospace', color: '#ffd700',
        }).setOrigin(0.5);

        const percentText = this.add.text(canvasW / 2, canvasH / 2 + 20, '0%', {
            fontSize: '10px', fontFamily: '"Press Start 2P", monospace', color: '#e0e7ff',
        }).setOrigin(0.5);

        const tipTexts = [
            'Astuce : Repondez vite pour des combos !',
            'Astuce : Le guerisseur peut soigner ses allies.',
            'Astuce : La foret offre un bonus de defense.',
            'Astuce : Le terrain eleve donne un avantage.',
            'Astuce : Les mages infligent des degats magiques.',
            'Astuce : Les archers attaquent a distance.',
            'Astuce : Le sable ralentit les deplacements.',
        ];
        const tipText = this.add.text(canvasW / 2, canvasH / 2 + 55, tipTexts[Math.floor(Math.random() * tipTexts.length)], {
            fontSize: '12px', fontFamily: 'Rajdhani, Arial', color: '#6b7a96', fontStyle: 'italic',
        }).setOrigin(0.5);

        this.load.on('progress', (value) => {
            barFill.width = 396 * value;
            percentText.setText(Math.round(value * 100) + '%');
        });

        this.load.on('complete', () => {
            barBg.destroy();
            barFill.destroy();
            loadText.destroy();
            percentText.destroy();
            tipText.destroy();
        });

        // ── Assets ──

        // Isometric tiles (base + new terrain types)
        this.load.image('iso_grass', '/static/img/combat/tiles/iso_grass.png');
        this.load.image('iso_stone', '/static/img/combat/tiles/iso_stone.png');
        this.load.image('iso_dirt', '/static/img/combat/tiles/iso_dirt.png');
        this.load.image('iso_water', '/static/img/combat/tiles/iso_water.png');
        this.load.image('iso_wall', '/static/img/combat/tiles/iso_wall.png');
        this.load.image('iso_forest', '/static/img/combat/tiles/iso_forest.png');
        this.load.image('iso_sand', '/static/img/combat/tiles/iso_sand.png');
        this.load.image('iso_lava', '/static/img/combat/tiles/iso_lava.png');

        // Highlight tiles
        this.load.image('hl_move', '/static/img/combat/tiles/iso_highlight_move.png');
        this.load.image('hl_attack', '/static/img/combat/tiles/iso_highlight_attack.png');
        this.load.image('hl_heal', '/static/img/combat/tiles/iso_highlight_heal.png');
        this.load.image('hl_selected', '/static/img/combat/tiles/iso_highlight_selected.png');

        // Directional chihuahua sprites (4 classes × 4 directions × 4 states)
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

        // Walk spritesheets (9 frames per sheet, 576×64)
        for (const cls of classes) {
            for (const dir of dirs) {
                this.load.spritesheet(`walk_${cls}_${dir}`, `/static/img/combat/walk_sheets/${cls}_walk_${dir}.png`, {
                    frameWidth: 64, frameHeight: 64,
                });
            }
        }

        // Monster sprites — directional sprites (se/sw/ne/nw) from PixelLab
        const monsterTypes = [
            'slime', 'rat', 'kobold', 'bat',
            'goblin', 'wolf', 'zombie', 'mushroom', 'bandit', 'fire_elemental',
            'ogre', 'vampire', 'witch', 'spider', 'golem',
            'necromancer', 'lich', 'dragon', 'hydra', 'shadow'
        ];
        const monsterDirs = ['se', 'sw', 'ne', 'nw'];
        for (const m of monsterTypes) {
            for (const d of monsterDirs) {
                this.load.image(`mon_${m}_${d}`, `/static/img/combat/monsters/${m}/${d}.png`);
            }
        }

        // Effects
        this.load.image('fx_slash', '/static/img/combat/effects/iso_slash.png');
        this.load.image('fx_fireball', '/static/img/combat/effects/iso_fireball.png');
        this.load.image('fx_heal', '/static/img/combat/effects/iso_heal.png');
        this.load.image('fx_shield', '/static/img/combat/effects/iso_shield.png');

        // ── Handle failed sprite loads gracefully ──
        this.load.on('loaderror', (fileObj) => {
            console.warn('[Arena] Failed to load:', fileObj.key, fileObj.url);
        });
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

        // ── Ambient particles ──
        this._createAmbientParticles();

        // ── Vignette overlay for cinematic feel ──
        this._createVignette();

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

    // ── Ambient effects ──

    _createAmbientParticles() {
        const canvasW = this.sys.game.config.width;
        const canvasH = this.sys.game.config.height;

        // ── Dust mote texture ──
        const gfx = this.make.graphics({ x: 0, y: 0, add: false });
        gfx.fillStyle(0xffffff, 0.6);
        gfx.fillCircle(3, 3, 3);
        gfx.generateTexture('dust_particle', 6, 6);
        gfx.destroy();

        // ── Soft glow texture ──
        const glowGfx = this.make.graphics({ x: 0, y: 0, add: false });
        glowGfx.fillStyle(0x88aaff, 0.3);
        glowGfx.fillCircle(8, 8, 8);
        glowGfx.fillStyle(0xaaccff, 0.5);
        glowGfx.fillCircle(8, 8, 4);
        glowGfx.generateTexture('glow_particle', 16, 16);
        glowGfx.destroy();

        // ── Floating dust motes (screen-space) ──
        for (let i = 0; i < 20; i++) {
            const px = Phaser.Math.Between(0, canvasW);
            const py = Phaser.Math.Between(0, canvasH);
            const p = this.add.image(px, py, 'dust_particle')
                .setAlpha(Phaser.Math.FloatBetween(0.15, 0.4))
                .setScale(Phaser.Math.FloatBetween(0.3, 1.0))
                .setDepth(9000)
                .setScrollFactor(0);

            this.tweens.add({
                targets: p,
                y: py - Phaser.Math.Between(30, 80),
                x: px + Phaser.Math.Between(-40, 40),
                alpha: { from: p.alpha, to: 0.05 },
                duration: Phaser.Math.Between(5000, 10000),
                repeat: -1,
                yoyo: true,
                delay: Phaser.Math.Between(0, 4000),
            });
        }

        // ── Firefly glows near forest tiles (world-space) ──
        if (this.tileMap) {
            const forestTiles = [];
            for (let gy = 0; gy < this.tileMap.length; gy++) {
                for (let gx = 0; gx < this.tileMap[gy].length; gx++) {
                    if (this.tileMap[gy][gx] === 'forest') forestTiles.push({ gx, gy });
                }
            }
            const numFireflies = Math.min(forestTiles.length * 2, 12);
            for (let i = 0; i < numFireflies; i++) {
                const ft = forestTiles[i % forestTiles.length];
                const pos = this.gridToIso(ft.gx, ft.gy, true);
                const fx = pos.x + Phaser.Math.Between(-20, 20);
                const fy = pos.y + Phaser.Math.Between(-30, -5);
                const elev = this.getElevation(ft.gx, ft.gy);
                const firefly = this.add.image(fx, fy, 'glow_particle')
                    .setAlpha(0)
                    .setScale(Phaser.Math.FloatBetween(0.3, 0.6))
                    .setTint(0x88ff88)
                    .setDepth((ft.gx + ft.gy) * 10 + elev + 4);

                this.tweens.add({
                    targets: firefly,
                    alpha: { from: 0, to: Phaser.Math.FloatBetween(0.3, 0.6) },
                    x: fx + Phaser.Math.Between(-15, 15),
                    y: fy + Phaser.Math.Between(-15, 10),
                    scale: { from: firefly.scale, to: firefly.scale * 1.3 },
                    duration: Phaser.Math.Between(2000, 4000),
                    repeat: -1,
                    yoyo: true,
                    delay: Phaser.Math.Between(0, 3000),
                    ease: 'Sine.easeInOut',
                });
            }
        }
    }

    _createVignette() {
        const cw = this.sys.game.config.width;
        const ch = this.sys.game.config.height;
        // Very subtle vignette — just a hint of darkening at the edges
        const vig = this.add.graphics();
        vig.setScrollFactor(0).setDepth(9500);
        const cx = cw / 2, cy = ch / 2;
        const maxR = Math.max(cw, ch) * 0.9;
        const steps = 12;
        for (let i = steps; i >= 0; i--) {
            const r = maxR * (i / steps);
            // Only darken the outer 30% — max alpha 0.12 (was 0.35)
            const alpha = i < steps * 0.7 ? 0 : ((i - steps * 0.7) / (steps * 0.3)) * 0.12;
            vig.fillStyle(0x000000, alpha);
            vig.fillEllipse(cx, cy, r * 2, r * 1.5);
        }
    }

    // ── Isometric coordinate conversion ──

    gridToIso(gx, gy, includeElevation = false) {
        const isoX = (gx - gy) * (TILE_W / 2) + this.offsetX;
        let isoY = (gx + gy) * (TILE_H / 2) + this.offsetY;
        if (includeElevation && this.elevation) {
            const elev = (this.elevation[gy] && this.elevation[gy][gx]) || 0;
            isoY -= elev * 20; // 20px per elevation level
        }
        return { x: isoX, y: isoY };
    }

    getElevation(gx, gy) {
        if (!this.elevation) return 0;
        return (this.elevation[gy] && this.elevation[gy][gx]) || 0;
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

        // Destroy old elevation side-face graphics
        for (const key in this.elevationGfx) {
            this.elevationGfx[key].destroy();
        }
        this.elevationGfx = {};

        // Destroy old tile effects (lava glows, etc.)
        for (const fx of (this.tileEffects || [])) {
            if (fx && fx.destroy) fx.destroy();
        }
        this.tileEffects = [];

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
        const elevation = this.mapConfig ? (this.mapConfig.elevation || []) : [];

        // Store elevation for gameplay use
        this.elevation = elevation;

        // Build obstacle lookup
        const obstacleMap = {};
        for (const obs of obstacles) {
            obstacleMap[`${obs.x}_${obs.y}`] = obs.type;
        }

        // Tile type to texture key mapping
        const tileTextures = {
            'grass': 'iso_grass', 'stone': 'iso_stone', 'dirt': 'iso_dirt',
            'water': 'iso_water', 'wall': 'iso_wall', 'forest': 'iso_forest',
            'sand': 'iso_sand', 'lava': 'iso_lava',
        };

        // Height offset per elevation level (pixels upward)
        const ELEV_OFFSET = 20;

        // Draw tiles from back to front (painter's algorithm)
        for (let gy = 0; gy < this.gridH; gy++) {
            for (let gx = 0; gx < this.gridW; gx++) {
                const { x, y } = this.gridToIso(gx, gy);
                const key = `${gx}_${gy}`;
                const obsType = obstacleMap[key];

                // Get tile elevation
                const elev = (elevation[gy] && elevation[gy][gx]) || 0;
                const elevPx = elev * ELEV_OFFSET;

                // Determine tile texture
                let tileKey = 'iso_grass';
                if (obsType) {
                    tileKey = tileTextures[obsType] || 'iso_wall';
                } else if (tiles && tiles[gy] && tiles[gy][gx]) {
                    tileKey = tileTextures[tiles[gy][gx]] || 'iso_grass';
                }

                // Render base tile at elevated position
                const tileY = y - elevPx;
                const tile = this.add.image(x, tileY, tileKey);
                tile.setOrigin(0.5, 0.5);
                tile.setDepth((gx + gy) * 10 + elev);
                this.tileSprites[key] = tile;

                // Draw isometric side faces to connect elevated tile to ground level
                if (elev > 0 && tileKey !== 'iso_wall') {
                    const hw = TILE_W / 2;  // 32
                    const hh = TILE_H / 2;  // 16
                    const groundY = y;       // The y position if this tile had no elevation
                    const sideGfx = this.add.graphics();
                    sideGfx.setDepth((gx + gy) * 10 + elev - 0.5);

                    // Right face (south-east side) — lighter brown
                    sideGfx.fillStyle(0x8B7355, 0.95);
                    sideGfx.beginPath();
                    sideGfx.moveTo(x, tileY + hh);              // top: bottom-center of elevated tile
                    sideGfx.lineTo(x + hw, tileY);               // top: right-center of elevated tile
                    sideGfx.lineTo(x + hw, groundY);             // bottom: right-center at ground level
                    sideGfx.lineTo(x, groundY + hh);             // bottom: bottom-center at ground level
                    sideGfx.closePath();
                    sideGfx.fillPath();

                    // Left face (south-west side) — darker brown for depth
                    sideGfx.fillStyle(0x6B5740, 0.95);
                    sideGfx.beginPath();
                    sideGfx.moveTo(x, tileY + hh);              // top: bottom-center of elevated tile
                    sideGfx.lineTo(x - hw, tileY);               // top: left-center of elevated tile
                    sideGfx.lineTo(x - hw, groundY);             // bottom: left-center at ground level
                    sideGfx.lineTo(x, groundY + hh);             // bottom: bottom-center at ground level
                    sideGfx.closePath();
                    sideGfx.fillPath();

                    // Thin edge lines for definition
                    sideGfx.lineStyle(1, 0x4a3c2a, 0.5);
                    sideGfx.lineBetween(x, tileY + hh, x, groundY + hh);
                    sideGfx.lineBetween(x + hw, tileY, x + hw, groundY);
                    sideGfx.lineBetween(x - hw, tileY, x - hw, groundY);

                    // Track for cleanup
                    this.elevationGfx[key] = sideGfx;
                }

                // Water shimmer effect
                if (tileKey === 'iso_water') {
                    this.tweens.add({
                        targets: tile, alpha: { from: 0.85, to: 1.0 },
                        duration: 1500 + Math.random() * 500,
                        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                    });
                }

                // Lava glow pulse
                if (tileKey === 'iso_lava') {
                    this.tweens.add({
                        targets: tile, alpha: { from: 0.8, to: 1.0 },
                        duration: 800 + Math.random() * 400,
                        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                    });
                    // Red glow underneath
                    const glow = this.add.circle(x, tileY + 5, 20, 0xff4400, 0.15);
                    glow.setDepth((gx + gy) * 10 - 1);
                    this.tweens.add({
                        targets: glow, alpha: { from: 0.1, to: 0.25 },
                        duration: 600, yoyo: true, repeat: -1,
                    });
                    this.tileEffects.push(glow);
                }
            }
        }

        // Show template name briefly
        if (this.mapConfig && this.mapConfig.template) {
            const templateNames = {
                'valley': '🏔️ Vallée',
                'fortress': '🏰 Forteresse',
                'river': '🌊 Rivière',
                'arena': '⚔️ Arène',
            };
            const name = templateNames[this.mapConfig.template] || this.mapConfig.template;
            const canvasW = this.sys.game.config.width;
            const mapLabel = this.add.text(canvasW / 2, 25, name, {
                fontSize: '16px', fontFamily: 'Arial', color: '#94a3b8',
                stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(20000).setScrollFactor(0).setAlpha(0);
            this.tweens.add({
                targets: mapLabel, alpha: { from: 0, to: 0.8 },
                duration: 500, yoyo: true, hold: 2000,
                onComplete: () => mapLabel.destroy(),
            });
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
            const { x, y } = this.gridToIso(tx, ty, true);
            const key = `${tx}_${ty}`;
            const hl = this.add.image(x, y, texKey);
            hl.setOrigin(0.5, 0.5);
            const hlElev = this.getElevation(tx, ty);
            hl.setDepth((tx + ty) * 10 + hlElev + 3);
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
        const { x, y } = this.gridToIso(p.grid_x, p.grid_y, true);
        const dir = 'ne';  // Default facing direction
        const elev = this.getElevation(p.grid_x, p.grid_y);

        // Use NE idle sprite as default
        const spriteKey = `chi_${cls}_${dir}_idle`;
        const fallbackKey = `chi_${cls}_se_idle`;
        const usedKey = this.textures.exists(spriteKey) ? spriteKey : fallbackKey;
        const sprite = this.add.image(x, y - TILE_DEPTH, usedKey);
        sprite.setOrigin(0.5, 0.85);
        sprite.setScale(SPRITE_SIZE / Math.max(sprite.width, sprite.height, 1));
        sprite.setDepth((p.grid_x + p.grid_y) * 10 + elev + 5);

        // Name label
        const spriteY = y - TILE_DEPTH;
        const nameY = spriteY - 45;
        const name = this.add.text(x, nameY, p.student_name || 'Élève', {
            fontSize: '11px',
            fontFamily: 'Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(9999);

        // HP bar
        const barWidth = 36;
        const barY = nameY + 12;
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
     * Looping idle animation: cycle through walk frames for a lively look.
     * Players use walk_frames (9 frames), monsters use scale pulse.
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

        if (ent._idleTimer) ent._idleTimer.destroy();

        if (ent.type === 'player') {
            // Cycle through 9 walk frames from spritesheet
            let frame = 0;
            const dir = ent.direction || 'ne';
            const cls = ent.cls || 'guerrier';
            const sheetKey = `walk_${cls}_${dir}`;
            ent._idleTimer = this.time.addEvent({
                delay: 120, // ~8 FPS walk animation
                loop: true,
                callback: () => {
                    if (ent.isMoving || ent.state === 'ko') return;
                    if (this.textures.exists(sheetKey)) {
                        ent.sprite.setTexture(sheetKey, frame);
                        const baseScale = SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1);
                        ent.sprite.setScale(baseScale);
                    }
                    frame = (frame + 1) % 9;
                },
            });
        } else {
            // Monsters: subtle scale pulse for "breathing"
            let frame = 0;
            ent._idleTimer = this.time.addEvent({
                delay: 500,
                loop: true,
                callback: () => {
                    if (ent.state === 'ko') return;
                    frame = (frame + 1) % 2;
                    const baseScale = SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1);
                    ent.sprite.setScale(baseScale * (frame === 0 ? 1.0 : 1.03));
                },
            });
        }
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

    /**
     * Completely remove an entity sprite and all its sub-objects (name, HP bars, animations).
     * Used to clean up stale/ghost sprites when entities are removed from the state.
     */
    _destroyEntity(id) {
        const ent = this.entitySprites[id];
        if (!ent) return;

        this._stopIdleAnimation(id);
        if (ent.sprite) ent.sprite.destroy();
        if (ent.name) ent.name.destroy();
        if (ent.hpBg) ent.hpBg.destroy();
        if (ent.hpFill) ent.hpFill.destroy();
        // Clean up any extra references (mana bars, etc.)
        if (ent.manaBg) ent.manaBg.destroy();
        if (ent.manaFill) ent.manaFill.destroy();

        delete this.entitySprites[id];
        console.log(`[Arena] Destroyed stale entity: ${id}`);
    }

    addMonster(m) {
        const id = `monster_${m.id}`;
        if (this.entitySprites[id]) return;

        const monType = (m.monster_type || 'goblin').toLowerCase();
        const { x, y } = this.gridToIso(m.grid_x, m.grid_y, true);
        const elev = this.getElevation(m.grid_x, m.grid_y);

        // Default direction: sw (facing players who are on the left)
        const defaultDir = 'sw';
        const spriteKey = `mon_${monType}_${defaultDir}`;
        const sprite = this.add.image(x, y - TILE_DEPTH, spriteKey);
        sprite.setOrigin(0.5, 0.85);
        sprite.setDepth((m.grid_x + m.grid_y) * 10 + elev + 5);

        // Scale the PixelLab sprites up (they're 56×56 or 48×48, we want ~SPRITE_SIZE)
        const baseScale = SPRITE_SIZE / Math.max(sprite.width, sprite.height, 1);
        sprite.setScale(baseScale);

        // Name
        const spriteY = y - TILE_DEPTH;
        const nameY = spriteY - 45;
        const name = this.add.text(x, nameY, m.name || monType, {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#ff6b6b',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(9999);

        // HP bar
        const barWidth = 30;
        const barY = nameY + 12;
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
            direction: defaultDir,
            state: m.is_alive !== false ? 'idle' : 'ko',
        };

        // If dead on arrival, apply KO state immediately
        if (m.is_alive === false) {
            this.setEntityState(id, 'ko');
        } else {
            // Start idle animation for monsters
            this._startIdleAnimation(id);
        }
    }

    /**
     * Move an entity to a grid position — simple teleport or single-step tween.
     * For path-following, use animateAlongPath() instead.
     */
    updateEntityPosition(id, gx, gy, animate = true) {
        const ent = this.entitySprites[id];
        if (!ent) return;

        const { x, y } = this.gridToIso(gx, gy, true);
        const targetY = y - TILE_DEPTH;
        const elev = this.getElevation(gx, gy);

        // Update direction for players and monsters
        if (ent.data) {
            const newDir = this._getDirection(ent.data.grid_x, ent.data.grid_y, gx, gy);
            if (newDir !== ent.direction) {
                ent.direction = newDir;
                if (ent.type === 'player') {
                    const texKey = `chi_${ent.cls}_${newDir}_idle`;
                    if (this.textures.exists(texKey)) {
                        ent.sprite.setTexture(texKey);
                        ent.sprite.setScale(SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1));
                    }
                } else {
                    // Monster: use directional sprite
                    const texKey = `mon_${ent.monType}_${newDir}`;
                    if (this.textures.exists(texKey)) {
                        ent.sprite.setTexture(texKey);
                        ent.sprite.setScale(SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1));
                    }
                }
            }
        }

        // Standardized positioning: nameY = spriteY - 45, barY = nameY + 12 = spriteY - 33
        const nameY = targetY - 45;
        const barY = nameY + 12;

        if (animate) {
            this.tweens.add({
                targets: [ent.sprite],
                x: x, y: targetY,
                duration: 300, ease: 'Linear',
                onComplete: () => { ent.sprite.setDepth((gx + gy) * 10 + elev + 5); },
            });
            this.tweens.add({ targets: ent.name, x: x, y: nameY, duration: 300, ease: 'Linear' });
            this.tweens.add({ targets: [ent.hpBg], x: x, y: barY, duration: 300, ease: 'Linear' });
            this.tweens.add({ targets: [ent.hpFill], x: x, y: barY, duration: 300, ease: 'Linear' });
        } else {
            ent.sprite.setPosition(x, targetY);
            ent.sprite.setDepth((gx + gy) * 10 + elev + 5);
            ent.name.setPosition(x, nameY);
            ent.hpBg.setPosition(x, barY);
            ent.hpFill.setPosition(x, barY);
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
        let walkFrame = 0;

        // Start walk frame cycling during movement (using spritesheet)
        const walkTimer = this.time.addEvent({
            delay: 100, // ~10 FPS walk cycle
            loop: true,
            callback: () => {
                if (!ent.isMoving) return;
                const dir = ent.direction || 'ne';
                const cls = ent.cls || 'guerrier';
                const sheetKey = `walk_${cls}_${dir}`;
                if (this.textures.exists(sheetKey)) {
                    ent.sprite.setTexture(sheetKey, walkFrame);
                    const baseScale = SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1);
                    ent.sprite.setScale(baseScale);
                }
                walkFrame = (walkFrame + 1) % 9;
            },
        });

        const doStep = () => {
            if (stepIdx >= path.length) {
                // Movement complete — stop walk cycle, restart idle
                walkTimer.destroy();
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
                walkFrame = 0; // Reset walk frame on direction change
            }

            // Tween sprite + name + HP bars to next cell
            // Standardized positioning: nameY = spriteY - 45, barY = nameY + 12 = spriteY - 33
            const nameY = targetY - 45;
            const barY = nameY + 12;

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
                x: x, y: nameY,
                duration: stepDuration, ease: 'Linear',
            });
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

        if (ent.type === 'player') {
            // Players have per-state sprites
            const texKey = `chi_${ent.cls}_${ent.direction || 'se'}_${state}`;
            if (this.textures.exists(texKey)) {
                ent.sprite.setTexture(texKey);
            }
        } else {
            // Monsters use directional sprites with visual effects for states
            const dir = ent.direction || 'sw';
            const texKey = `mon_${ent.monType}_${dir}`;
            if (this.textures.exists(texKey)) {
                ent.sprite.setTexture(texKey);
                const baseScale = SPRITE_SIZE / Math.max(ent.sprite.width, ent.sprite.height, 1);
                ent.sprite.setScale(baseScale);
            }

            // Apply visual effects based on state
            if (state === 'attack') {
                ent.sprite.setTint(0xffcccc);
                // Quick lunge forward
                this.tweens.add({
                    targets: ent.sprite,
                    scaleX: ent.sprite.scaleX * 1.15,
                    scaleY: ent.sprite.scaleY * 1.15,
                    duration: 150,
                    yoyo: true,
                    ease: 'Power2',
                    onComplete: () => { if (ent.sprite) ent.sprite.clearTint(); }
                });
            } else if (state === 'hurt') {
                ent.sprite.setTint(0xff4444);
                // Shake effect
                const origX = ent.sprite.x;
                this.tweens.add({
                    targets: ent.sprite,
                    x: origX - 4,
                    duration: 50,
                    yoyo: true,
                    repeat: 2,
                    onComplete: () => {
                        if (ent.sprite) {
                            ent.sprite.x = origX;
                            ent.sprite.clearTint();
                        }
                    }
                });
            } else if (state === 'idle') {
                ent.sprite.clearTint();
            }
        }

        if (state === 'ko') {
            ent.sprite.setAlpha(0.5);
            ent.name.setAlpha(0.5);
            if (ent.type === 'monster') {
                ent.sprite.setTint(0x666666);
            }
        } else if (state !== 'hurt' && state !== 'attack') {
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

        // Update participants — first remove stale sprites
        if (state.participants) {
            const currentPlayerIds = new Set(state.participants.map(p => `player_${p.student_id}`));
            for (const id of Object.keys(this.entitySprites)) {
                if (id.startsWith('player_') && !currentPlayerIds.has(id)) {
                    this._destroyEntity(id);
                }
            }

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

        // Update monsters — first remove stale/ghost sprites
        if (state.monsters) {
            const currentMonsterIds = new Set(state.monsters.map(m => `monster_${m.id}`));
            for (const id of Object.keys(this.entitySprites)) {
                if (id.startsWith('monster_') && !currentMonsterIds.has(id)) {
                    this._destroyEntity(id);
                }
            }

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
            const phaseLabels = {
                'move': '🏃 Phase de déplacement',
                'question': '❓ Les élèves répondent...',
                'action': '⚔️ Phase d\'action — choisissez votre attaque !',
                'execute': '💥 Exécution des actions !',
                'monster_turn': '🔴 Tour des monstres !',
                'round_end': '🔄 Fin du round',
            };
            const label = phaseLabels[phase] || phase;
            CombatSocketInstance.addCombatLogEntry(label, 'phase');
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

        const roundText = this.add.text(canvasW / 2, canvasH / 3, `ROUND ${roundNum}`, {
            fontSize: '48px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: '#fbbf24',
            stroke: '#92400e',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(10000).setScrollFactor(0);

        // Scale up, stay, then fade away
        roundText.setScale(0.5);
        this.tweens.add({
            targets: roundText,
            scale: 1,
            duration: 400,
            ease: 'Back.out',
            onComplete: () => {
                // Fade out after staying visible for 1.5 seconds
                this.time.delayedCall(1500, () => {
                    if (roundText && roundText.active) {
                        this.tweens.add({
                            targets: roundText,
                            alpha: 0,
                            duration: 500,
                            ease: 'Linear',
                            onComplete: () => {
                                if (roundText && roundText.active) roundText.destroy();
                            },
                        });
                    }
                });
            },
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
            // Face towards target (both players and monsters)
            if (target) {
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
        const absVal = Math.abs(value);
        // Damage tiers: light (1-5), normal (6-15), heavy (16+)
        let fontSize, finalScale, offsetX;
        if (isCritical) {
            fontSize = '36px';
            finalScale = 1.4;
        } else if (absVal >= 16) {
            fontSize = '30px';
            finalScale = 1.2;
        } else if (absVal >= 6) {
            fontSize = '24px';
            finalScale = 1.0;
        } else {
            fontSize = '18px';
            finalScale = 0.8;
        }
        // Random horizontal spread to avoid overlap
        offsetX = Phaser.Math.Between(-25, 25);

        const prefix = isCritical ? '💥 ' : '';
        const text = this.add.text(x + offsetX, y, prefix + '-' + absVal, {
            fontSize: fontSize,
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: color,
            stroke: '#000000',
            strokeThickness: isCritical ? 6 : 4,
        }).setOrigin(0.5).setDepth(10000);

        text.setScale(0.3);
        if (isCritical) {
            // Critical: bounce + shake + longer duration
            this.tweens.add({
                targets: text,
                scale: finalScale,
                duration: 300,
                ease: 'Back.out',
                onComplete: () => {
                    this.tweens.add({
                        targets: text,
                        x: text.x + Phaser.Math.Between(-4, 4),
                        duration: 50,
                        repeat: 5,
                        yoyo: true,
                        onComplete: () => {
                            this.tweens.add({
                                targets: text,
                                y: y - 70,
                                alpha: 0,
                                duration: 1000,
                                ease: 'Power2.out',
                                onComplete: () => text.destroy(),
                            });
                        },
                    });
                },
            });
        } else {
            // Normal: scale up + float away
            this.tweens.add({
                targets: text,
                scale: finalScale,
                y: y - 50 - (absVal >= 16 ? 15 : 0),
                alpha: { from: 1, to: 0 },
                duration: 1400,
                ease: 'Power2.out',
                onComplete: () => text.destroy(),
            });
        }

        // Heavy hit: screen shake
        if (absVal >= 16 || isCritical) {
            this.cameras.main.shake(200, isCritical ? 0.008 : 0.004);
        }
    }

    _showHealNumber(x, y, value) {
        const absVal = Math.abs(value);
        const isLargeHeal = absVal >= 15;
        const offsetX = Phaser.Math.Between(-15, 15);

        const text = this.add.text(x + offsetX, y, '+' + absVal, {
            fontSize: isLargeHeal ? '28px' : '22px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: isLargeHeal ? '#34d399' : '#10b981',
            stroke: '#059669',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(10000);

        text.setScale(0.3);
        this.tweens.add({
            targets: text,
            scale: isLargeHeal ? 1.2 : 1.0,
            y: y - 55,
            alpha: { from: 1, to: 0 },
            duration: 1500,
            ease: 'Power2.out',
            onComplete: () => text.destroy(),
        });

        // Large heal: green particle burst
        if (isLargeHeal) {
            for (let i = 0; i < 6; i++) {
                const px = x + Phaser.Math.Between(-20, 20);
                const py = y + Phaser.Math.Between(-10, 10);
                const p = this.add.circle(px, py, 3, 0x10b981).setDepth(9999).setAlpha(0.8);
                this.tweens.add({
                    targets: p,
                    y: py - Phaser.Math.Between(30, 60),
                    alpha: 0,
                    scale: 0,
                    duration: Phaser.Math.Between(600, 1000),
                    ease: 'Power2.out',
                    onComplete: () => p.destroy(),
                });
            }
        }
    }

    _showStatusText(x, y, message, color) {
        const text = this.add.text(x, y - 10, message, {
            fontSize: '16px',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            color: color,
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(10000);

        text.setScale(0.5);
        this.tweens.add({
            targets: text,
            scale: 1.0,
            y: y - 40,
            alpha: { from: 1, to: 0 },
            duration: 1200,
            ease: 'Power2.out',
            onComplete: () => text.destroy(),
        });
    }

    // ── Side panel updates ──

    updatePlayerRoster(participants) {
        const container = document.getElementById('players-list');
        if (!container) return;

        const classEmojis = { guerrier: '⚔️', mage: '🔮', archer: '🏹', guerisseur: '💚' };
        const classColors = { guerrier: '#ef4444', mage: '#818cf8', archer: '#34d399', guerisseur: '#fbbf24' };

        container.innerHTML = participants.map(p => {
            const maxHp = (p.snapshot_json && p.snapshot_json.max_hp) || p.max_hp || 100;
            const maxMana = (p.snapshot_json && p.snapshot_json.max_mana) || p.max_mana || 50;
            const hpPct = Math.max(0, Math.min(100, Math.round((p.current_hp / maxHp) * 100)));
            const manaPct = Math.max(0, Math.min(100, Math.round((p.current_mana / maxMana) * 100)));
            const alive = p.is_alive !== false;
            const cls = p.avatar_class || (p.snapshot_json && p.snapshot_json.avatar_class) || 'guerrier';
            const emoji = classEmojis[cls] || '🛡';
            const color = classColors[cls] || '#60a5fa';
            const statusIcon = alive ? (p.answered ? '✅' : '') : '💀';

            return `
                <div class="entity-card${alive ? '' : ' ko'}">
                    <div class="entity-name player" style="color:${color}">${emoji} ${p.student_name || 'Élève'} ${statusIcon}
                        <small style="color:#94a3b8;font-weight:normal">Nv.${p.level || 1}</small>
                    </div>
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

        const monsterEmojis = {
            slime: '🟢', rat: '🐀', kobold: '🦎', bat: '🦇',
            goblin: '👺', wolf: '🐺', zombie: '🧟', mushroom: '🍄', bandit: '🗡️', fire_elemental: '🔥',
            ogre: '👹', vampire: '🧛', witch: '🧙', spider: '🕷️', golem: '🗿',
            necromancer: '💀', lich: '☠️', dragon: '🐉', hydra: '🐍', shadow: '👻',
        };

        container.innerHTML = monsters.map(m => {
            const hpPct = Math.max(0, Math.min(100, Math.round((m.current_hp / m.max_hp) * 100)));
            const alive = m.is_alive !== false;
            const emoji = monsterEmojis[m.monster_type] || '👾';
            const hpColor = hpPct > 50 ? '#ef4444' : hpPct > 25 ? '#f59e0b' : '#dc2626';

            return `
                <div class="entity-card${alive ? '' : ' ko'}">
                    <div class="entity-name monster">${emoji} ${m.name || m.monster_type} <small style="color:#94a3b8;font-weight:normal">Nv.${m.level || 1}</small></div>
                    <div class="bar-label"><span>HP</span><span>${m.current_hp}/${m.max_hp}</span></div>
                    <div class="hp-bar-container">
                        <div class="hp-bar-fill" style="width:${hpPct}%;background:${hpColor}"></div>
                    </div>
                    ${m.attack ? `<div style="font-size:10px;color:#94a3b8;margin-top:3px">ATK:${m.attack} DEF:${m.defense}</div>` : ''}
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

        // Semi-transparent overlay with fade-in
        const overlay = this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH,
            isVictory ? 0x000000 : 0x1a0000);
        overlay.setAlpha(0).setDepth(10010).setScrollFactor(0);
        this.tweens.add({ targets: overlay, alpha: 0.7, duration: 400 });

        // Emoji burst
        const emoji = isVictory ? '🎉' : '💀';
        const emojiText = this.add.text(canvasW / 2, canvasH / 2 - 60, emoji, {
            fontSize: '72px',
        }).setOrigin(0.5).setDepth(10012).setScrollFactor(0).setScale(0);
        this.tweens.add({
            targets: emojiText, scale: 1, duration: 500, ease: 'Back.out',
        });

        // Main result text with dramatic entrance
        const resultText = isVictory ? 'VICTOIRE!' : 'DÉFAITE...';
        const resultColor = isVictory ? '#fbbf24' : '#ef4444';
        const resultStroke = isVictory ? '#b45309' : '#7f1d1d';

        const text = this.add.text(canvasW / 2, canvasH / 2 + 20, resultText, {
            fontSize: '80px',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            color: resultColor,
            stroke: resultStroke,
            strokeThickness: 8,
        }).setOrigin(0.5).setDepth(10012).setScrollFactor(0);

        text.setScale(0);
        this.tweens.add({
            targets: text,
            scale: 1,
            duration: 600,
            delay: 200,
            ease: 'Back.out',
            onComplete: () => {
                // Gentle pulsing glow effect
                this.tweens.add({
                    targets: text, scale: 1.05, duration: 1000,
                    yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                });
            },
        });

        // Subtitle
        const subtitle = isVictory
            ? 'Tous les monstres ont été vaincus !'
            : 'Tous les héros sont tombés...';
        const subText = this.add.text(canvasW / 2, canvasH / 2 + 80, subtitle, {
            fontSize: '20px', fontFamily: 'Arial', color: '#94a3b8',
        }).setOrigin(0.5).setDepth(10012).setScrollFactor(0).setAlpha(0);
        this.tweens.add({ targets: subText, alpha: 1, duration: 500, delay: 800 });

        // Round count
        const roundInfo = this.add.text(canvasW / 2, canvasH / 2 + 110, `Combat terminé en ${this.currentRound} rounds`, {
            fontSize: '16px', fontFamily: 'Arial', color: '#667eea',
        }).setOrigin(0.5).setDepth(10012).setScrollFactor(0).setAlpha(0);
        this.tweens.add({ targets: roundInfo, alpha: 1, duration: 500, delay: 1000 });

        // Camera effects
        if (isVictory) {
            this.cameras.main.flash(400, 255, 215, 0, true); // Golden flash
        } else {
            this.cameras.main.shake(300, 0.01);
            this.time.delayedCall(300, () => {
                this.cameras.main.flash(300, 255, 0, 0, true); // Red flash
            });
        }

        // Particle effects
        this._createVictoryParticles(canvasW / 2, canvasH / 2, isVictory);

        // Continuous confetti rain for victory
        if (isVictory) {
            this._startConfettiRain(canvasW, canvasH);
        }
    }

    _startConfettiRain(canvasW, canvasH) {
        const colors = [0xfbbf24, 0xef4444, 0x3b82f6, 0x10b981, 0xa855f7, 0xf97316];
        let spawned = 0;
        const maxConfetti = 80;

        const confettiTimer = this.time.addEvent({
            delay: 60,
            repeat: maxConfetti - 1,
            callback: () => {
                const x = Phaser.Math.Between(0, canvasW);
                const color = colors[Phaser.Math.Between(0, colors.length - 1)];
                const size = Phaser.Math.Between(3, 7);
                const isSquare = Math.random() > 0.5;

                let confetti;
                if (isSquare) {
                    confetti = this.add.rectangle(x, -10, size, size * 1.5, color);
                } else {
                    confetti = this.add.circle(x, -10, size / 2, color);
                }
                confetti.setDepth(10011).setScrollFactor(0).setAlpha(0.9);
                confetti.setAngle(Phaser.Math.Between(0, 360));

                this.tweens.add({
                    targets: confetti,
                    y: canvasH + 20,
                    x: x + Phaser.Math.Between(-60, 60),
                    angle: confetti.angle + Phaser.Math.Between(-180, 180),
                    alpha: { from: 0.9, to: 0.3 },
                    duration: Phaser.Math.Between(2000, 4000),
                    ease: 'Linear',
                    onComplete: () => confetti.destroy(),
                });
                spawned++;
            },
        });
    }

    /**
     * Create celebratory or mournful particle burst
     */
    _createVictoryParticles(centerX, centerY, isVictory) {
        const particleCount = isVictory ? 30 : 15;
        const colors = isVictory
            ? [0xfbbf24, 0xf97316, 0xef4444, 0x10b981, 0x3b82f6]
            : [0xef4444, 0x991b1b, 0x7f1d1d];

        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const speed = 150 + Math.random() * 250;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const color = colors[i % colors.length];
            const size = Phaser.Math.Between(3, 6);

            const particle = this.add.circle(centerX, centerY, size, color);
            particle.setDepth(10011).setScrollFactor(0);

            this.tweens.add({
                targets: particle,
                x: centerX + vx,
                y: centerY + vy,
                alpha: { from: 0.9, to: 0 },
                scale: { from: 1, to: 0.2 },
                duration: isVictory ? 1200 : 800,
                delay: Phaser.Math.Between(0, 200),
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

    const container = document.getElementById('phaser-game');
    const cw = container ? container.clientWidth : (window.innerWidth - 500);
    const ch = container ? container.clientHeight : (window.innerHeight - 60);
    const config = {
        type: Phaser.AUTO,
        parent: 'phaser-game',
        width: cw,
        height: ch,
        transparent: true,
        scene: CombatArena,
        scale: {
            mode: Phaser.Scale.NONE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
    };

    const game = new Phaser.Game(config);

    window.addEventListener('resize', () => {
        const c = document.getElementById('phaser-game');
        game.scale.resize(c ? c.clientWidth : (window.innerWidth - 480), c ? c.clientHeight : (window.innerHeight - 56));
    });
});
