import { Scene, GameObjects } from 'phaser';
import { World as WorldModel } from '../world/world';
import { TILE_SIZE, INITIAL_SETTLER_AGE_TICKS, type SimSpeed } from '../config/game.config';
import { Time } from '../time/time';
import { HUD } from '../ui/hud';
import { WorldRenderer } from '../render/world-renderer';
import { CameraController } from '../render/camera-controller';
import { Atmosphere } from '../render/atmosphere';
import { PointLights, lightBoostForHour } from '../render/point-lights';
import { SettlerShadows } from '../render/shadows';
import { DecorationRenderer } from '../render/decoration-renderer';
import { WaterShimmer } from '../render/water-shimmer';
import { generateWorld } from '../world/world-gen';
import { ECSWorld } from '../ecs/world';
import { createSettler, createChildSettler } from '../entities/settler';
import { WanderSystem } from '../ecs/systems/wander';
import { RenderSyncSystem } from '../ecs/systems/render-sync';
import { NeedsSystem } from '../ecs/systems/needs';
import { AISystem } from '../ecs/systems/ai';
import { LifeSystem } from '../ecs/systems/life';
import { Chronicle } from '../chronicle/log';
import { ChronicleUI } from '../ui/chronicle';
import { MiniMap } from '../ui/minimap';
import { SettlerInspector } from '../ui/settler-inspector';
import { serialize, deserialize } from '../save/serializer';
import { SAVE_VERSION } from '../save/schema-version';
import { Position, Render, AI } from '../ecs/components';
import type { PositionData, RenderData, AIData } from '../ecs/components';
import { ITEM_TEXTURE_KEYS, resolveTextureKey, STRUCTURE_SPRITE_KEYS } from '../render/sprites';
import { mulberry32 } from '../util/rng';
import { JobQueue } from '../jobs/job-queue';
import { MineWorkGiver } from '../jobs/work-givers/mine';
import { HaulWorkGiver } from '../jobs/work-givers/haul';

const WORLD_SEED = 42;
const SETTLER_SEED = WORLD_SEED * 7 + 1;
// Central world coords (128, 128) put structures in the lake. Move them
// to known-walkable land — the spawn area near (110, 110) is in a clearing
// where the spawn settlers are also placed.
const FOOD_SOURCE = { tx: 80, ty: 110 };
const STOCKPILE = { tx: 70, ty: 130 };

export class World extends Scene
{
    private world: WorldModel | null = null;
    private sim: Time | null = null;
    private hud: HUD | null = null;
    private chronicle: Chronicle | null = null;
    private worldRenderer: WorldRenderer | null = null;
    private cameraController: CameraController | null = null;
    private cursorText: GameObjects.Text | null = null;
    private ecs: ECSWorld | null = null;
    private settlerContainer: GameObjects.Container | null = null;
    private itemContainer: GameObjects.Container | null = null;
    private shadows: SettlerShadows | null = null;
    private atmosphere: Atmosphere | null = null;
    private pointLights: PointLights | null = null;
    private decorationRenderer: DecorationRenderer | null = null;
    private waterShimmer: WaterShimmer | null = null;
    private foodMarker: GameObjects.Image | null = null;
    private stockpileMarker: GameObjects.Image | null = null;
    private foodSource: { tx: number; ty: number } | null = null;
    private stockpile: { tx: number; ty: number } | null = null;
    private lastSeason: number = -1;
    private itemMarkers: Map<number, GameObjects.Image> = new Map();
    private itemBobPhases: Map<number, number> = new Map();
    private itemBobSeeds: Map<number, number> = new Map();
    private jobQueue: JobQueue | null = null;
    private mineWorkGiver: MineWorkGiver | null = null;
    private haulWorkGiver: HaulWorkGiver | null = null;
    private needs: NeedsSystem | null = null;
    private ai: AISystem | null = null;
    private lifeSystem: LifeSystem | null = null;
    private wander: WanderSystem | null = null;
    private renderSync: RenderSyncSystem | null = null;
    private chronicleUI: ChronicleUI | null = null;
    private selectedEntity: number | null = null;
    private selectionRing: GameObjects.Arc | null = null;
    private pathPreviewContainer: GameObjects.Container | null = null;
    private minimap: MiniMap | null = null;
    private inspector: SettlerInspector | null = null;
    private portrait: GameObjects.Image | null = null;
    private portraitBob: number = 0;

    constructor ()
    {
        super('World');
    }

    create ()
    {
        this.world = new WorldModel();
        generateWorld(this.world, { seed: WORLD_SEED });

        this.sim = new Time();
        // Re-bake the world on season change so trees shift through spring
        // green → autumn orange → winter bare/snowy. Trees are baked into
        // the static world-composite canvas, so the only way to change their
        // color is to redraw — but this is rare (every 30 days) so the cost
        // is negligible.
        this.sim.on('time.season', () => {
            if (this.world && this.worldRenderer)
            {
                this.worldRenderer.setSeason(this.sim!.season);
                this.worldRenderer.restoreAll(this, this.world);
            }
        });
        this.hud = new HUD(this.sim);
        this.hud.setZoomChangeCallback((zoom) => {
            this.cameraController?.setZoom(zoom);
        });
        this.hud.setZoom(this.cameraController?.zoom ?? 2);

        this.chronicle = new Chronicle();

        this.worldRenderer = new WorldRenderer(this, this.world);
        this.cameraController = new CameraController(
            this,
            this.world.width * TILE_SIZE,
            this.world.height * TILE_SIZE,
        );
        this.hud.setZoom(this.cameraController.zoom);

        this.ecs = new ECSWorld();
        this.settlerContainer = this.add.container(0, 0);
        this.settlerContainer.setDepth(10);
        this.itemContainer = this.add.container(0, 0);
        this.itemContainer.setDepth(8);
        this.pathPreviewContainer = this.add.container(0, 0);
        this.pathPreviewContainer.setDepth(11);

        // Atmospheric layer (tint + vignette + wind particles) sits above
        // the world and below HUD. Settler drop-shadows live just under the
        // settler sprites at depth 9.
        this.atmosphere = new Atmosphere(this, WORLD_SEED);
        this.shadows = new SettlerShadows(this);

        // Point-light pools at fixed world locations (campfire near spawn,
        // lanterns at stockpile and food source). These are the odd-realm
        // signature — smooth radial light that bleeds across the pixel grid.
        const firepit = this.world.findWalkableAt(128, 128);
        this.pointLights = new PointLights(this, [
            { tx: firepit.tx, ty: firepit.ty, radius: 128, color: 0xff8a3c, intensity: 1.0, flicker: true },  // central campfire (breathes)
            { tx: STOCKPILE.tx, ty: STOCKPILE.ty, radius: 72, color: 0xffd28a, intensity: 0.7, flicker: false }, // lantern — steady
            { tx: FOOD_SOURCE.tx, ty: FOOD_SOURCE.ty, radius: 60, color: 0xffc070, intensity: 0.6, flicker: false }, // lantern — steady
        ]);

        // Decoration clutter — ferns, pebbles, mushrooms, twigs scattered on
        // grass/dirt tiles. Static once placed; doesn't redraw on tile.changed.
        this.decorationRenderer = new DecorationRenderer(this, this.world);

        // Animated sun-glitter on water tiles — the baked water art is
        // static, so without this the ocean reads as striped wallpaper.
        this.waterShimmer = new WaterShimmer(this, this.world, WORLD_SEED);

        const spawnPoints = [
            this.world.findWalkableAt(128, 128),
            this.world.findWalkableAt(96, 96),
            this.world.findWalkableAt(160, 160),
        ];
        // Randomize hair style + color for each initial settler.
        const colors = ['red', 'blue', 'green', 'orange', 'purple'];
        const styles = ['', '-long', '-bald', '-hat'];
        const settlerTextures = spawnPoints.map((_, i) => {
            const color = colors[i % colors.length];
            const style = styles[i % styles.length];
            return `settler-${color}${style}`;
        });
        for (let i = 0; i < spawnPoints.length; i++)
        {
            createSettler(
                this.ecs, this, this.settlerContainer,
                spawnPoints[i].tx, spawnPoints[i].ty, settlerTextures[i],
                null, 1, -INITIAL_SETTLER_AGE_TICKS,
                this.shadows,
            );
        }

        // Fog of war removed — player wanted full visibility from the start.

        this.foodSource = this.world.findWalkableAt(FOOD_SOURCE.tx, FOOD_SOURCE.ty);
        // Food source marker — Kenney red potion sprite on the ground tile.
        // Sits at depth 6 (above tiles, below items) so it reads as a
        // structure placed on the world, not as a UI overlay.
        this.foodMarker = this.add.image(
            this.foodSource.tx * TILE_SIZE + TILE_SIZE / 2,
            this.foodSource.ty * TILE_SIZE + TILE_SIZE / 2,
            STRUCTURE_SPRITE_KEYS.foodSource,
        );
        this.foodMarker.setDisplaySize(TILE_SIZE, TILE_SIZE);
        this.foodMarker.setDepth(6);

        this.stockpile = this.world.findWalkableAt(STOCKPILE.tx, STOCKPILE.ty);
        // Stockpile marker — Kenney chest sprite. Replaces the old debug
        // yellow rectangle. Chest reads as a wooden box that settlers can
        // haul to.
        this.stockpileMarker = this.add.image(
            this.stockpile.tx * TILE_SIZE + TILE_SIZE / 2,
            this.stockpile.ty * TILE_SIZE + TILE_SIZE / 2,
            STRUCTURE_SPRITE_KEYS.stockpile,
        ) as GameObjects.Image;
        this.stockpileMarker.setDisplaySize(TILE_SIZE, TILE_SIZE);
        this.stockpileMarker.setDepth(6);

        this.world.events.on('item.added', (event) => this.spawnItemVisual(event));
        this.world.events.on('item.removed', (event) => this.removeItemVisual(event));

        const rng = mulberry32(SETTLER_SEED);
        this.jobQueue = new JobQueue();
        this.mineWorkGiver = new MineWorkGiver();
        this.haulWorkGiver = new HaulWorkGiver(this.stockpile);
        this.needs = new NeedsSystem();
        this.ai = new AISystem(this.jobQueue);
        this.lifeSystem = new LifeSystem(
            this.chronicle,
            rng,
            (tx, ty, parents, generation, tick) => createChildSettler(
                this.ecs!, this, this.settlerContainer!,
                tx, ty, parents, generation, tick, 'settler-orange',
                this.shadows,
            ),
        );
        this.wander = new WanderSystem(this.world, this.foodSource, this.jobQueue, this.lifeSystem, rng);
        this.renderSync = new RenderSyncSystem(this, this.shadows);
        this.chronicleUI = new ChronicleUI(this.chronicle);
        this.minimap = new MiniMap(
            this.world,
            this.ecs,
            () => this.cameraController?.cam.scrollX ?? 0,
            () => this.cameraController?.cam.scrollY ?? 0,
            () => this.cameraController?.zoom ?? 1,
            () => this.cameraController?.cam.width ?? 1024,
            () => this.cameraController?.cam.height ?? 768,
        );
        this.inspector = new SettlerInspector(this.ecs, this);

        this.cursorText = this.add.text(8, 8, '', {
            fontFamily: 'Courier New',
            fontSize: 12,
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.55)',
            padding: { x: 6, y: 4 },
        });
        this.cursorText.setScrollFactor(0);
        this.cursorText.setDepth(1000);

        this.portrait = this.add.image(0, 0, resolveTextureKey('settler-red'));
        this.portrait.setVisible(false);
        this.portrait.setScrollFactor(0);
        this.portrait.setDepth(900);
        this.portrait.setDisplaySize(40, 40);

        this.add.text(512, 750, 'WASD/Arrows/edge: pan  ·  Wheel: zoom  ·  Space: speed  ·  ESC: pause', {
            fontFamily: 'Courier New',
            fontSize: 12,
            color: '#aaaaaa',
            align: 'center',
        }).setOrigin(0.5);

        this.input.keyboard?.on('keydown-ESC', () => {
            this.scene.pause();
            this.scene.launch('PauseMenu');
        });

        this.input.keyboard?.on('keydown-SPACE', () => {
            this.sim?.cycleSpeed();
        });

        this.input.keyboard?.on('keydown-L', () => {
            this.chronicleUI?.toggle();
        });

        this.input.keyboard?.on('keydown-F5', () => this.save());
        this.input.keyboard?.on('keydown-F9', () => this.loadFromSave());

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.button === 0)
            {
                this.handleClick(pointer);
                return;
            }
        });

        if (typeof window !== 'undefined')
        {
            (window as unknown as { __sim: Time | null }).__sim = this.sim;
            (window as unknown as { __world: WorldModel | null }).__world = this.world;
            (window as unknown as { __ecs: ECSWorld | null }).__ecs = this.ecs;
            (window as unknown as { __cam: CameraController | null }).__cam = this.cameraController;
            (window as unknown as { __lights: PointLights | null }).__lights = this.pointLights;
            // Debug hook: dump the game canvas as a base64 PNG. Used by the
            // CDP shoot script when Page.captureScreenshot is broken on this
            // host. Tries Phaser's renderer.snapshot first (WebGL path),
            // and falls back to canvas.toDataURL for the Canvas2D renderer.
            (window as unknown as { __captureCanvas: () => string | null }).__captureCanvas = () =>
            {
                const canvas = this.game.canvas as HTMLCanvasElement | null;
                if (!canvas) return null;
                try
                {
                    // Canvas2D mode: synchronous read
                    return canvas.toDataURL('image/png');
                }
                catch
                {
                    // WebGL mode: try Phaser's async snapshot via a data:URL
                    return null;
                }
            };
            (window as unknown as { __captureCanvasAsync: (cb: (b64: string | null) => void) => void }).__captureCanvasAsync = (cb) =>
            {
                this.game.renderer.snapshot((image: HTMLImageElement | Phaser.Display.Color) =>
                {
                    if (!(image instanceof HTMLImageElement)) { cb(null); return; }
                    if (!image.src) { cb(null); return; }
                    cb(image.src);
                });
            };
            (window as unknown as { __scene: World }).__scene = this;
        }
    }

    update (_time: number, delta: number): void
    {
        this.sim?.update(delta / 1000);
        this.cameraController?.update(delta);
        // Detect season changes that bypass the time.season event — e.g.
        // when setTick() is called directly (the screenshot script does this).
        // The season event only fires when update() processes a tick that
        // crosses a boundary, so a direct setTick from outside doesn't trigger
        // it. Polling each frame covers both cases.
        if (this.sim && this.world && this.worldRenderer)
        {
            const s = this.sim.season;
            if (s !== this.lastSeason)
            {
                this.lastSeason = s;
                this.worldRenderer.setSeason(s);
                this.worldRenderer.restoreAll(this, this.world);
            }
        }
        if (this.sim && this.atmosphere)
        {
            this.atmosphere.update(this.sim.tick, delta);
            const hour = Atmosphere.hourFromTick(this.sim.tick);
            this.pointLights?.setHourlyBoost(lightBoostForHour(hour));
        }
        if (this.pointLights && this.cameraController)
        {
            this.pointLights.update(this.cameraController.cam, delta);
        }
        if (this.waterShimmer && this.cameraController)
        {
            this.waterShimmer.update(this.cameraController.cam, delta);
        }
        if (this.ecs && this.sim && this.world && this.jobQueue)
        {
            const tick = this.sim.tick;
            this.mineWorkGiver?.update(this.world, this.jobQueue, this.sim);
            this.haulWorkGiver?.update(this.world, this.jobQueue, this.sim);
            this.needs?.update(this.ecs, tick, delta);
            this.ai?.update(this.ecs, tick, delta);
            this.wander?.update(this.ecs, tick, delta);
            this.lifeSystem?.update(this.ecs, tick);
            this.renderSync?.update(this.ecs, tick, delta);
            this.updateItemBobs(tick);
            if (tick % 60 === 0)
            {
                this.chronicleUI?.refresh();
            }
        }
        this.updateCursor();
        this.updatePathPreviews();
        this.updateSelectionRing();
        this.updatePortrait();
        this.minimap?.refresh();
        if (this.inspector && this.sim) this.inspector.refresh(this.sim.tick);
    }

    private updatePortrait (): void
    {
        if (!this.portrait || !this.portrait.visible || !this.ecs || !this.sim) return;
        if (this.selectedEntity === null) return;
        const entity = this.selectedEntity;
        const render = this.ecs.getComponent<RenderData>(entity, Render);
        const ai = this.ecs.getComponent<AIData>(entity, AI);
        if (!render) return;

        const moving = !!(ai?.path && ai.pathIndex < ai.path.length && ai.state !== 'wandering');
        const phase = Math.floor(this.sim.tick / 12) % 2;
        const baseKey = render.textureKey;
        const aliasKey = moving
            ? (phase === 0 ? `${baseKey}-walk-a` : `${baseKey}-walk-b`)
            : baseKey;
        const desiredKey = resolveTextureKey(aliasKey);
        if (this.portrait.texture.key !== desiredKey && this.textures.exists(desiredKey))
        {
            this.portrait.setTexture(desiredKey);
        }

        this.portraitBob = moving ? Math.sin(this.sim.tick * 0.35) * 1.2 : 0;
        this.portrait.y = 720 + this.portraitBob;
    }

    shutdown (): void
    {
        this.hud?.destroy();
        this.worldRenderer?.destroy();
        this.cameraController?.destroy();
        this.cursorText?.destroy();
        this.settlerContainer?.destroy();
        this.itemContainer?.destroy();
        this.pathPreviewContainer?.destroy();
        this.foodMarker?.destroy();
        this.stockpileMarker?.destroy();
        this.selectionRing?.destroy();
        this.minimap?.destroy();
        this.inspector?.destroy();
        this.portrait?.destroy();
        this.atmosphere?.destroy();
        this.shadows?.destroy();
        this.pointLights?.destroy();
        this.decorationRenderer?.destroy();
        this.waterShimmer?.destroy();
        this.itemMarkers.clear();
        this.hud = null;
        this.worldRenderer = null;
        this.cameraController = null;
        this.cursorText = null;
        this.settlerContainer = null;
        this.itemContainer = null;
        this.pathPreviewContainer = null;
        this.foodMarker = null;
        this.stockpileMarker = null;
        this.selectionRing = null;
        this.minimap = null;
        this.inspector = null;
        this.portrait = null;
        this.atmosphere = null;
        this.shadows = null;
        this.pointLights = null;
        this.decorationRenderer = null;
        this.waterShimmer = null;
        this.foodSource = null;
        this.stockpile = null;
        this.jobQueue = null;
        this.mineWorkGiver = null;
        this.haulWorkGiver = null;
        this.needs = null;
        this.ai = null;
        this.lifeSystem = null;
        this.wander = null;
        this.renderSync = null;
        this.chronicleUI?.destroy();
        this.chronicleUI = null;
        this.chronicle = null;
        this.selectedEntity = null;
    }

    private spawnItemVisual (item: { id: number; type: string; tx: number; ty: number }): void
    {
        const key = ITEM_TEXTURE_KEYS[item.type] ?? 'stone';
        const marker = this.add.image(
            item.tx * TILE_SIZE + TILE_SIZE / 2,
            item.ty * TILE_SIZE + TILE_SIZE / 2,
            key,
        );
        marker.setDisplaySize(TILE_SIZE, TILE_SIZE);
        // Stash the rest Y on the sprite so the bob loop can compute
        // marker.y = baseY + bob each frame without losing the anchor.
        (marker as unknown as { _baseY: number })._baseY = item.ty * TILE_SIZE + TILE_SIZE / 2;
        this.itemContainer?.add(marker);
        this.itemMarkers.set(item.id, marker);
        // Per-item bob phase so they don't beat in unison. Seed from the
        // item id (which is a stable integer) for fully deterministic
        // animation that resumes the same on reload.
        this.itemBobPhases.set(item.id, (item.id * 0.6180339887) % (Math.PI * 2));
        this.itemBobSeeds.set(item.id, item.id);
    }

    private removeItemVisual (item: { id: number }): void
    {
        const marker = this.itemMarkers.get(item.id);
        if (marker)
        {
            marker.destroy();
            this.itemMarkers.delete(item.id);
            this.itemBobPhases.delete(item.id);
            this.itemBobSeeds.delete(item.id);
        }
    }

    /**
     * Apply a per-item vertical bob so items on the ground feel alive
     * rather than pasted onto the tile. Each item has its own phase so
     * the field of items doesn't beat in unison. The bob is small (1px)
     * and slow (~1.4s period) — subtle enough to read as "item sitting
     * there" with a hint of motion, not "item floating".
     */
    private updateItemBobs (tick: number): void
    {
        if (this.itemMarkers.size === 0) return;
        for (const [id, marker] of this.itemMarkers)
        {
            const phase = this.itemBobPhases.get(id) ?? 0;
            const baseY = (marker as unknown as { _baseY?: number })._baseY;
            if (baseY === undefined) continue; // not yet initialized
            const bob = Math.sin(tick * 0.07 + phase) * 1.0;
            marker.y = baseY + bob;
        }
    }

    private updateCursor (): void
    {
        if (!this.cursorText || !this.world || !this.cameraController) return;
        const pointer = this.input.activePointer;
        const wx = pointer.worldX;
        const wy = pointer.worldY;
        const zoom = this.cameraController.zoom.toFixed(1);
        if (wx < 0 || wy < 0 || wx >= this.world.width * TILE_SIZE || wy >= this.world.height * TILE_SIZE)
        {
            this.cursorText.setText(`Zoom: ${zoom}x\nTile: -, -`);
            return;
        }
        const tx = Math.floor(wx / TILE_SIZE);
        const ty = Math.floor(wy / TILE_SIZE);
        this.cursorText.setText(`Zoom: ${zoom}x\nTile: ${tx}, ${ty}`);
    }

    private save (): void
    {
        if (!this.world || !this.sim || !this.ecs || !this.chronicle) return;
        try
        {
            const json = serialize({
                world: this.world,
                time: this.sim,
                ecs: this.ecs,
                chronicle: this.chronicle,
            });
            localStorage.setItem('colony-sim-save', json);
            console.log('Game saved');
        }
        catch (e)
        {
            console.error('Failed to save:', e);
        }
    }

    private loadFromSave (): void
    {
        if (!this.world || !this.sim || !this.ecs || !this.chronicle || !this.settlerContainer || !this.itemContainer) return;
        const json = localStorage.getItem('colony-sim-save');
        if (!json)
        {
            console.log('No save found');
            return;
        }
        const data = deserialize(json);
        if (!data)
        {
            console.error('Failed to parse save');
            return;
        }
        if (data.version !== SAVE_VERSION)
        {
            console.warn(`Save version ${data.version} does not match current ${SAVE_VERSION}`);
            return;
        }

        this.settlerContainer.removeAll(true);
        this.itemContainer.removeAll(true);
        this.pathPreviewContainer?.removeAll(true);
        this.itemMarkers.clear();
        this.selectedEntity = null;
        this.selectionRing?.destroy();
        this.selectionRing = null;
        this.ecs.clear();

        this.world.restore(data.world);

        // Decorations live with the world model; recreate the renderer so
        // it picks up the (possibly-changed) decoration list from the save.
        this.decorationRenderer?.destroy();
        this.decorationRenderer = new DecorationRenderer(this, this.world);
        // Water shimmer reads the (possibly-restored) world tiles, so it
        // also needs to rebuild. We pool new sparkles on every load.
        this.waterShimmer?.destroy();
        this.waterShimmer = new WaterShimmer(this, this.world, WORLD_SEED);
        this.sim.setTick(data.time.tick);
        this.sim.setSpeed(data.time.speed as SimSpeed);
        this.ecs.restore(data.ecs);
        this.chronicle.restore(data.chronicle);

        this.ecs.forEachEntity((id) => {
            const pos = this.ecs!.getComponent<PositionData>(id, Position);
            const render = this.ecs!.getComponent<RenderData>(id, Render);
            if (pos && render) this.recreateSettlerSprite(id, pos, render);
        });
        // Reattach shadows for all restored settlers.
        this.ecs.forEachEntity((id) => {
            const pos = this.ecs!.getComponent<PositionData>(id, Position);
            if (pos && this.shadows)
            {
                this.shadows.attach(
                    id,
                    pos.tx * TILE_SIZE + TILE_SIZE / 2,
                    pos.ty * TILE_SIZE + TILE_SIZE / 2,
                );
            }
        });

        this.worldRenderer?.restoreAll(this, this.world);

        this.jobQueue = new JobQueue();

        console.log('Game loaded');
    }

    private recreateSettlerSprite (_entity: number, pos: PositionData, render: RenderData): void
    {
        if (!this.settlerContainer) return;
        const px = pos.tx * TILE_SIZE + TILE_SIZE / 2;
        const py = pos.ty * TILE_SIZE + TILE_SIZE / 2;
        // Resolve the alias (e.g. 'settler-red') to the Kenney PNG key
        // (e.g. 'td-0085'). Phaser doesn't alias textures, so a raw alias
        // would resolve to no texture and the sprite would be invisible.
        const sprite = this.add.image(px, py, resolveTextureKey(render.textureKey));
        this.settlerContainer.add(sprite);
        render.gameObject = sprite;
    }

    private handleClick (pointer: Phaser.Input.Pointer): void
    {
        if (!this.world || !this.ecs) return;
        const wx = pointer.worldX;
        const wy = pointer.worldY;
        if (wx < 0 || wy < 0 || wx >= this.world.width * TILE_SIZE || wy >= this.world.height * TILE_SIZE)
        {
            this.selectEntity(null);
            return;
        }
        const tx = Math.floor(wx / TILE_SIZE);
        const ty = Math.floor(wy / TILE_SIZE);

        let found: number | null = null;
        this.ecs.forEachEntity((id) => {
            if (found !== null) return;
            const pos = this.ecs!.getComponent<PositionData>(id, Position);
            if (pos && pos.tx === tx && pos.ty === ty)
            {
                found = id;
            }
        });

        this.selectEntity(found);
    }

    private selectEntity (entity: number | null): void
    {
        if (this.selectedEntity === entity) return;
        this.selectedEntity = entity;

        if (this.selectionRing)
        {
            this.selectionRing.destroy();
            this.selectionRing = null;
        }

        if (entity === null)
        {
            this.inspector?.hide();
            this.portrait?.setVisible(false);
            return;
        }
        if (!this.ecs) return;

        const pos = this.ecs.getComponent<PositionData>(entity, Position);
        if (!pos) return;

        this.selectionRing = this.add.circle(
            pos.tx * TILE_SIZE + TILE_SIZE / 2,
            pos.ty * TILE_SIZE + TILE_SIZE / 2,
            TILE_SIZE * 0.6,
            0xffff00, 0,
        );
        this.selectionRing.setStrokeStyle(2, 0xffff00, 0.9);
        this.selectionRing.setDepth(15);

        this.tweens.add({
            targets: this.selectionRing,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 600,
            yoyo: true,
            repeat: -1,
        });

        const render = this.ecs.getComponent<RenderData>(entity, Render);
        if (render && this.portrait)
        {
            this.portrait.setTexture(resolveTextureKey(render.textureKey));
            this.portrait.setVisible(true);
            this.portrait.x = 44;
            this.portrait.y = 720;
            this.portraitBob = 0;
        }

        this.inspector?.show(entity);
    }

    private updateSelectionRing (): void
    {
        if (this.selectedEntity === null || !this.selectionRing || !this.ecs) return;
        const pos = this.ecs.getComponent<PositionData>(this.selectedEntity, Position);
        if (!pos)
        {
            this.selectionRing.destroy();
            this.selectionRing = null;
            this.selectedEntity = null;
            return;
        }
        this.selectionRing.x = pos.tx * TILE_SIZE + TILE_SIZE / 2;
        this.selectionRing.y = pos.ty * TILE_SIZE + TILE_SIZE / 2;
    }

    private updatePathPreviews (): void
    {
        if (!this.pathPreviewContainer || !this.ecs) return;
        this.pathPreviewContainer.removeAll(true);

        const colorFor = (state: string): number =>
        {
            if (state === 'seeking_food') return 0x66ff66;
            if (state === 'seeking_social') return 0x66aaff;
            if (state === 'working') return 0xffaa44;
            return 0xffffff;
        };

        this.ecs.forEachEntity((id) => {
            const ai = this.ecs!.getComponent<AIData>(id, AI);
            const pos = this.ecs!.getComponent<PositionData>(id, Position);
            if (!ai || !pos || !ai.path) return;
            if (ai.pathIndex >= ai.path.length) return;
            if (ai.state !== 'seeking_food' && ai.state !== 'seeking_social' && ai.state !== 'working') return;

            const color = colorFor(ai.state);
            for (let i = ai.pathIndex; i < ai.path.length; i++)
            {
                const tile = ai.path[i];
                const dot = this.add.circle(
                    tile.tx * TILE_SIZE + TILE_SIZE / 2,
                    tile.ty * TILE_SIZE + TILE_SIZE / 2,
                    TILE_SIZE * 0.1,
                    color, 0.3,
                );
                if (dot && this.pathPreviewContainer) this.pathPreviewContainer.add(dot);
            }
        });
    }
}
