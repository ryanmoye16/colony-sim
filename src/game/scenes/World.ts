import { Scene, GameObjects } from 'phaser';
import { World as WorldModel } from '../world/world';
import { TILE_SIZE, INITIAL_SETTLER_AGE_TICKS, type SimSpeed } from '../config/game.config';
import { Time } from '../time/time';
import { HUD } from '../ui/hud';
import { WorldRenderer } from '../render/world-renderer';
import { CameraController } from '../render/camera-controller';
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
import { ITEM_TEXTURE_KEYS } from '../render/sprites';
import { mulberry32 } from '../util/rng';
import { JobQueue } from '../jobs/job-queue';
import { MineWorkGiver } from '../jobs/work-givers/mine';
import { HaulWorkGiver } from '../jobs/work-givers/haul';

const WORLD_SEED = 42;
const SETTLER_SEED = WORLD_SEED * 7 + 1;
const FOOD_SOURCE = { tx: 192, ty: 128 };
const STOCKPILE = { tx: 192, ty: 192 };

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
    private foodMarker: GameObjects.Arc | null = null;
    private stockpileMarker: GameObjects.Rectangle | null = null;
    private foodSource: { tx: number; ty: number } | null = null;
    private stockpile: { tx: number; ty: number } | null = null;
    private itemMarkers: Map<number, GameObjects.Image> = new Map();
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
            );
        }

        this.foodSource = this.world.findWalkableAt(FOOD_SOURCE.tx, FOOD_SOURCE.ty);
        this.foodMarker = this.add.circle(
            this.foodSource.tx * TILE_SIZE + TILE_SIZE / 2,
            this.foodSource.ty * TILE_SIZE + TILE_SIZE / 2,
            TILE_SIZE * 0.4,
            0x55ff55, 0.9,
        );
        this.foodMarker.setStrokeStyle(2, 0x004400, 1);
        this.foodMarker.setDepth(5);

        this.stockpile = this.world.findWalkableAt(STOCKPILE.tx, STOCKPILE.ty);
        this.stockpileMarker = this.add.rectangle(
            this.stockpile.tx * TILE_SIZE + TILE_SIZE / 2,
            this.stockpile.ty * TILE_SIZE + TILE_SIZE / 2,
            TILE_SIZE, TILE_SIZE,
            0xffff00, 0.3,
        );
        this.stockpileMarker.setStrokeStyle(2, 0xaaaa00, 0.8);
        this.stockpileMarker.setDepth(4);

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
            ),
        );
        this.wander = new WanderSystem(this.world, this.foodSource, this.jobQueue, this.lifeSystem, rng);
        this.renderSync = new RenderSyncSystem(this);
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

        this.portrait = this.add.image(0, 0, 'settler-red');
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
            if (pointer.button !== 0) return;
            this.handleClick(pointer);
        });

        if (typeof window !== 'undefined')
        {
            (window as unknown as { __sim: Time | null }).__sim = this.sim;
            (window as unknown as { __world: WorldModel | null }).__world = this.world;
            (window as unknown as { __ecs: ECSWorld | null }).__ecs = this.ecs;
            (window as unknown as { __cam: CameraController | null }).__cam = this.cameraController;
        }
    }

    update (_time: number, delta: number): void
    {
        this.sim?.update(delta / 1000);
        this.cameraController?.update(delta);
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
        const desiredKey = moving
            ? (phase === 0 ? `${baseKey}-walk-a` : `${baseKey}-walk-b`)
            : baseKey;
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
        this.itemContainer?.add(marker);
        this.itemMarkers.set(item.id, marker);
    }

    private removeItemVisual (item: { id: number }): void
    {
        const marker = this.itemMarkers.get(item.id);
        if (marker)
        {
            marker.destroy();
            this.itemMarkers.delete(item.id);
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
        this.sim.setTick(data.time.tick);
        this.sim.setSpeed(data.time.speed as SimSpeed);
        this.ecs.restore(data.ecs);
        this.chronicle.restore(data.chronicle);

        this.ecs.forEachEntity((id) => {
            const pos = this.ecs!.getComponent<PositionData>(id, Position);
            const render = this.ecs!.getComponent<RenderData>(id, Render);
            if (pos && render) this.recreateSettlerSprite(id, pos, render);
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
        const sprite = this.add.image(px, py, render.textureKey);
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
            this.portrait.setTexture(render.textureKey);
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
