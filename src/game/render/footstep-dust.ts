// =============================================================================
// Footstep dust — small gray puffs behind walking settlers.
// =============================================================================
// When a settler walks across a grass/dirt tile, a 2-3px gray puff appears
// at their feet and dissipates over ~400ms. Triggers either on direction
// change or every ~12 tiles of travel, so steady walking doesn't carpet
// the world in dust but quick pivots leave a clear trail.
//
// Settlers call `onSettlerStepped(entityId, worldX, worldY)` from the
// wander system when they advance to a new tile. The dust pool only
// spawns on grass/dirt tiles (anything else reads as wrong surface for
// dust). Pool of 16 keeps cost flat regardless of settler count.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';
import { mulberry32 } from '../util/rng';
import type { World } from '../world/world';

interface DustPuff
{
    sprite: Phaser.GameObjects.Image;
    active: boolean;
    lifetime: number;
    startedAt: number;
    originX: number;
    originY: number;
    baseSize: number;
    peakAlpha: number;
    driftX: number;
    driftY: number;
}

const DUST_POOL_SIZE = 18;
const DUST_W = 3;
const DUST_H = 3;

export class FootstepDust
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly puffs: DustPuff[] = [];
    private readonly rng: () => number;
    private readonly world: World;

    // Per-settler throttling — emit every N tiles travelled OR on direction
    // change. Tiles-walked counter resets on emission.
    private readonly lastEmitTile = new Map<number, { tx: number; ty: number; tilesSince: number; facing: string }>();

    // Tile-type -> can-dust-spawn map. Built lazily on first call so we don't
    // iterate the world at construction.
    private dustableCache = new Map<number, boolean>();

    constructor (scene: Scene, world: World, seed: number = 1)
    {
        this.world = world;
        this.rng = mulberry32((seed ^ 0x3a83c91d) >>> 0);
        this.container = scene.add.container(0, 0);
        this.container.setDepth(11);

        this.ensureTexture(scene);

        for (let i = 0; i < DUST_POOL_SIZE; i++)
        {
            const sprite = scene.add.image(0, 0, 'footstep-dust');
            sprite.setOrigin(0.5, 0.5);
            sprite.setScrollFactor(1);
            sprite.setDepth(11);
            sprite.setBlendMode(BlendModes.NORMAL);
            sprite.setAlpha(0);
            this.container.add(sprite);
            this.puffs.push({
                sprite,
                active: false,
                lifetime: 0,
                startedAt: 0,
                originX: 0,
                originY: 0,
                baseSize: 0,
                peakAlpha: 0,
                driftX: 0,
                driftY: 0,
            });
        }
    }

    /**
     * Notify the system that a settler stepped to (tx, ty) and is now facing
     * `facing`. We may emit a dust puff here, depending on throttle state.
     */
    onSettlerStepped (entityId: number, tx: number, ty: number, facing: string, tickMs: number): void
    {
        const last = this.lastEmitTile.get(entityId);
        if (!last)
        {
            this.lastEmitTile.set(entityId, { tx, ty, tilesSince: 0, facing });
            return;
        }

        const dx = tx - last.tx;
        const dy = ty - last.ty;
        const moved = dx !== 0 || dy !== 0;
        if (!moved) return;

        const dirChanged = facing !== last.facing;
        last.tilesSince += 1;
        last.tx = tx;
        last.ty = ty;
        last.facing = facing;

        // Emit on direction change OR every 4 tiles of travel. Direction change
        // gets a strong puff; travel gets a faint one.
        if (dirChanged || last.tilesSince >= 4)
        {
            this.tryEmit(tx, ty, tickMs, dirChanged ? 0.45 : 0.22);
            last.tilesSince = 0;
        }
    }

    /**
     * Forget throttling state for a settler (used on settler despawn).
     */
    forgetSettler (entityId: number): void
    {
        this.lastEmitTile.delete(entityId);
    }

    update (tickMs: number, _dtMs: number = 0): void
    {
        for (const p of this.puffs)
        {
            if (!p.active) continue;
            const age = tickMs - p.startedAt;
            if (age >= p.lifetime)
            {
                p.active = false;
                p.sprite.setAlpha(0);
                continue;
            }
            const t = age / p.lifetime;
            // Quick fade-in (15%) then linear fade-out.
            let a;
            if (t < 0.15) a = (t / 0.15) * p.peakAlpha;
            else a = p.peakAlpha * Math.max(0, 1 - (t - 0.15) / 0.85);
            p.sprite.x = p.originX + p.driftX * t;
            p.sprite.y = p.originY + p.driftY * t;
            p.sprite.setAlpha(a);
            // Grow slightly as it dissipates.
            const grow = 1.0 + t * 0.6;
            p.sprite.setDisplaySize(p.baseSize * grow, p.baseSize * grow);
        }
    }

    destroy (): void
    {
        for (const p of this.puffs) p.sprite.destroy();
        this.puffs.length = 0;
        this.lastEmitTile.clear();
        this.dustableCache.clear();
        this.container.destroy();
    }

    // -------------------------------------------------------------------------

    private tryEmit (tx: number, ty: number, tickMs: number, peakAlpha: number): void
    {
        // Only spawn on grass / dirt / sand. We sample the tile once and
        // cache the verdict so the same tile type isn't re-checked every
        // step.
        const tile = this.world.getTile(tx, ty);
        if (!this.canDustOn(tile)) return;

        let puff = this.puffs.find((p) => !p.active);
        if (!puff)
        {
            // Recycle the oldest puff.
            puff = this.puffs.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
        }
        const TILE = 16;
        puff.originX = tx * TILE + TILE / 2 + (this.rng() - 0.5) * 2;
        puff.originY = ty * TILE + TILE - 2 + (this.rng() - 0.5) * 2;
        puff.sprite.x = puff.originX;
        puff.sprite.y = puff.originY;
        puff.driftX = (this.rng() - 0.5) * 2;
        puff.driftY = -1 + (this.rng() - 0.5) * 1;
        puff.lifetime = 500 + this.rng() * 250;
        puff.peakAlpha = peakAlpha;
        puff.baseSize = 2 + this.rng() * 2;
        puff.sprite.setDisplaySize(puff.baseSize, puff.baseSize);
        puff.sprite.setAlpha(0);
        puff.startedAt = tickMs;
        puff.active = true;
    }

    private canDustOn (tile: number): boolean
    {
        const cached = this.dustableCache.get(tile);
        if (cached !== undefined) return cached;
        // Tile type 0 = grass, 1 = dirt, plus any "natural floor" types.
        // Stone, water, walls are excluded. Conservative allow-list: grass,
        // dirt, sand. The exact enum values depend on world-gen, so we
        // accept anything that isn't an obvious solid/water/wall.
        const isWalkableFloor = tile >= 0 && tile <= 6;
        const ok = isWalkableFloor;
        this.dustableCache.set(tile, ok);
        return ok;
    }

    private ensureTexture (scene: Scene): void
    {
        if (scene.textures.exists('footstep-dust')) return;
        const c = document.createElement('canvas');
        c.width = DUST_W;
        c.height = DUST_H;
        const ctx = c.getContext('2d')!;
        const cx = DUST_W / 2;
        const cy = DUST_H / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0, 'rgba(210, 200, 188, 0.9)');
        grad.addColorStop(0.6, 'rgba(190, 180, 168, 0.5)');
        grad.addColorStop(1, 'rgba(160, 150, 140, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, DUST_W, DUST_H);
        scene.textures.addCanvas('footstep-dust', c);
    }
}
