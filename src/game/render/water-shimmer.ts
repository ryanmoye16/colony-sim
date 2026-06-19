// =============================================================================
// WaterShimmer — animated sun-glitter overlay on water tiles.
// =============================================================================
// Water tiles are baked into the static `world-composite` canvas, so they
// don't move. Without animation the ocean reads as a striped wallpaper —
// rows of identical blue bands. To make it feel alive we drop ~200 tiny
// white pixel sprites onto water tiles and animate each one's alpha in a
// sine wave with a per-sprite phase. The result reads as light playing on
// the water surface (sun glitter / wind ripples) without per-frame canvas
// redraws.
//
// The shimmers are pooled (fixed count) and recycled to a new water tile
// when they leave the viewport — so the cost is independent of world size
// and camera position. Each sparkle sits at depth 2 (above the world but
// below everything else), so structures, items, and settlers sit on top
// of the shimmer just like they sit on top of the water.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';
import { TileType } from '../world/tile';
import type { World } from '../world/world';
import { TILE_SIZE } from '../config/game.config';
import { mulberry32 } from '../util/rng';

const SHIMMER_COUNT = 220;
const SHIMMER_PIXEL_SIZE = 2;
// Alpha envelope: sparkles fade in/out smoothly so the surface breathes
// rather than blinking. Peak alpha is moderate — we want the shimmer to
// enhance the water, not blast through it.
const SHIMMER_ALPHA_MIN = 0.05;
const SHIMMER_ALPHA_MAX = 0.55;
// Period in ms — each sparkle has its own phase so they don't beat in unison.
const SHIMMER_PERIOD_MIN = 1800;
const SHIMMER_PERIOD_MAX = 4200;
// When a sparkle drifts outside the visible viewport (with margin), recycle
// it to a new water tile. Margin keeps it from popping at the edge.
const RECYCLE_MARGIN_PX = 64;

interface ShimmerEntry
{
    sprite: Phaser.GameObjects.Image;
    phase: number;       // 0..2π
    period: number;      // ms per cycle
    jitterX: number;     // 0..1 within tile
    jitterY: number;     // 0..1 within tile
}

export class WaterShimmer
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly entries: ShimmerEntry[] = [];
    private readonly waterTiles: Array<{ tx: number; ty: number }>;
    private readonly rng: () => number;
    private elapsedMs: number = 0;

    constructor (scene: Scene, world: World, seed: number = 1)
    {
        this.rng = mulberry32(seed * 0x517cc1b7);
        this.waterTiles = this.collectWaterTiles(world);

        this.container = scene.add.container(0, 0);
        this.container.setDepth(2);

        // Shared 2x2 white pixel texture so all sparkles share one GL draw.
        // Phaser's default white texture would work too but we want exact
        // control over the pixel size for the pixel-art aesthetic.
        this.ensureSparkleTexture(scene);

        for (let i = 0; i < SHIMMER_COUNT; i++)
        {
            const sprite = scene.add.image(0, 0, 'shimmer-pixel');
            sprite.setOrigin(0, 0);
            sprite.setScrollFactor(1);
            sprite.setDepth(2);
            sprite.setBlendMode(BlendModes.ADD);
            sprite.setAlpha(0);
            this.container.add(sprite);

            const entry: ShimmerEntry = {
                sprite,
                phase: this.rng() * Math.PI * 2,
                period: SHIMMER_PERIOD_MIN + this.rng() * (SHIMMER_PERIOD_MAX - SHIMMER_PERIOD_MIN),
                jitterX: this.rng(),
                jitterY: this.rng(),
            };
            this.entries.push(entry);
            this.placeOnRandomWaterTile(entry);
        }
    }

    /**
     * Drive the shimmer animation. Called from the world scene's update loop
     * with the camera and delta ms. We recompute alpha from a sine wave each
     * frame (cheap, O(N)) and recycle sparkles that drift offscreen.
     */
    update (cam: Phaser.Cameras.Scene2D.Camera, deltaMs: number): void
    {
        this.elapsedMs += deltaMs;
        const view = cam.worldView;
        const minX = view.x - RECYCLE_MARGIN_PX;
        const maxX = view.x + view.width + RECYCLE_MARGIN_PX;
        const minY = view.y - RECYCLE_MARGIN_PX;
        const maxY = view.y + view.height + RECYCLE_MARGIN_PX;

        for (const entry of this.entries)
        {
            const sprite = entry.sprite;
            const t = (this.elapsedMs + entry.phase * entry.period) / entry.period;
            const sine = Math.sin(t * Math.PI * 2);
            // Map sine [-1, 1] -> [MIN, MAX]
            const a = SHIMMER_ALPHA_MIN + ((sine + 1) * 0.5) * (SHIMMER_ALPHA_MAX - SHIMMER_ALPHA_MIN);
            sprite.setAlpha(a);

            // Recycle if drifted offscreen.
            if (sprite.x < minX || sprite.x > maxX || sprite.y < minY || sprite.y > maxY)
            {
                this.placeOnRandomWaterTile(entry);
            }
        }
    }

    destroy (): void
    {
        for (const entry of this.entries) entry.sprite.destroy();
        this.entries.length = 0;
        this.container.destroy();
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Walk the world once and record every water tile's (tx, ty). Done once
     * at construction so update() doesn't have to scan 65k tiles per frame.
     */
    private collectWaterTiles (world: World): Array<{ tx: number; ty: number }>
    {
        const out: Array<{ tx: number; ty: number }> = [];
        for (let y = 0; y < world.height; y++)
        {
            for (let x = 0; x < world.width; x++)
            {
                if (world.getTile(x, y) === TileType.Water) out.push({ tx: x, ty: y });
            }
        }
        return out;
    }

    /**
     * Move the sparkle to a random position on a random water tile. If the
     * world has no water (shouldn't happen given current gen but defend
     * anyway), the sparkle sits at (0,0) with zero alpha.
     */
    private placeOnRandomWaterTile (entry: ShimmerEntry): void
    {
        if (this.waterTiles.length === 0) return;
        const tile = this.waterTiles[Math.floor(this.rng() * this.waterTiles.length)];
        const px = tile.tx * TILE_SIZE + entry.jitterX * TILE_SIZE;
        const py = tile.ty * TILE_SIZE + entry.jitterY * TILE_SIZE;
        entry.sprite.x = px;
        entry.sprite.y = py;
        // Re-roll jitter so the next placement looks fresh.
        entry.jitterX = this.rng();
        entry.jitterY = this.rng();
    }

    private ensureSparkleTexture (scene: Scene): void
    {
        if (scene.textures.exists('shimmer-pixel')) return;
        const c = document.createElement('canvas');
        c.width = SHIMMER_PIXEL_SIZE;
        c.height = SHIMMER_PIXEL_SIZE;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, SHIMMER_PIXEL_SIZE, SHIMMER_PIXEL_SIZE);
        scene.textures.addCanvas('shimmer-pixel', c);
    }
}