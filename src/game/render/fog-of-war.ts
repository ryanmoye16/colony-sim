// =============================================================================
// FogOfWar — chunked reveal-based fog overlay.
// =============================================================================
// Each tile has a reveal level (0=unseen, 1=seen, 2=visible). We draw dark
// rectangles over unseen (full black) and seen-but-not-visible (50% black)
// tiles within the camera viewport. Visible tiles get no fog.
//
// Performance: we iterate tile-by-tile but only across the camera's
// worldView (typically ~30-60 tiles per axis at zoom 2-4), so we touch
// 1000-4000 tiles per frame. Each is at most one fillRect call. Cost is
// negligible.
// =============================================================================

import type { Scene, Cameras } from 'phaser';
import { TILE_SIZE } from '../config/game.config';
import type { World } from '../world/world';

const UNSEEN_ALPHA = 0.94;
const SEEN_ALPHA = 0.62;
const UNSEEN_COLOR = 0x06040c; // near-black plum, matches earth palette
const SEEN_COLOR = 0x0c0820;

export class FogOfWar
{
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly radius: number;

    constructor (scene: Scene, private readonly world: World, radius: number = 6)
    {
        this.radius = radius;
        this.graphics = scene.add.graphics();
        this.graphics.setDepth(60);
        this.graphics.setScrollFactor(1);
    }

    /**
     * Reveal tiles around every settler position. Call once per tick before
     * `decay` so settler vision expands the lit area.
     */
    revealFromSettlers (settlerPositions: Array<{ tx: number; ty: number }>): void
    {
        for (const p of settlerPositions) this.world.revealAround(p.tx, p.ty, this.radius);
    }

    /**
     * Reveal a single tile and its neighbors. Used by the right-click scout
     * action.
     */
    revealAround (tx: number, ty: number, radius: number = 6): void
    {
        this.world.revealAround(tx, ty, radius);
    }

    /**
     * Decay all currently-visible tiles to "seen but not visible" so the next
     * reveal pass can re-light the area around moving settlers.
     */
    decay (): void
    {
        this.world.decayReveal();
    }

    /**
     * Reveal an entire map. Bound to a key in World.ts so the player can
     * scout ("see all").
     */
    revealAll (): void
    {
        this.world.revealAll();
    }

    /**
     * Redraw the fog overlay. Cheap: only iterates tiles within the camera
     * viewport and emits at most one fillRect per tile.
     */
    update (cam: Cameras.Scene2D.Camera): void
    {
        const reveal = this.world.reveal;
        if (reveal.length === 0)
        {
            // Legacy save / no reveal data — draw the world fully fogged.
            this.drawFullyFogged(cam);
            return;
        }

        const view = cam.worldView;
        const x0 = Math.max(0, Math.floor(view.x / TILE_SIZE));
        const y0 = Math.max(0, Math.floor(view.y / TILE_SIZE));
        const x1 = Math.min(this.world.width - 1, Math.ceil((view.x + view.width) / TILE_SIZE));
        const y1 = Math.min(this.world.height - 1, Math.ceil((view.y + view.height) / TILE_SIZE));

        this.graphics.clear();

        for (let ty = y0; ty <= y1; ty++)
        {
            for (let tx = x0; tx <= x1; tx++)
            {
                const lvl = reveal[ty * this.world.width + tx];
                if (lvl === 2) continue; // visible — no fog
                if (lvl === 0)
                {
                    this.graphics.fillStyle(UNSEEN_COLOR, UNSEEN_ALPHA);
                }
                else
                {
                    this.graphics.fillStyle(SEEN_COLOR, SEEN_ALPHA);
                }
                this.graphics.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    /**
     * Fallback when there's no reveal data: cover the entire viewport with
     * full fog. This is what happens on legacy saves.
     */
    private drawFullyFogged (cam: Cameras.Scene2D.Camera): void
    {
        const view = cam.worldView;
        this.graphics.clear();
        this.graphics.fillStyle(UNSEEN_COLOR, UNSEEN_ALPHA);
        this.graphics.fillRect(view.x, view.y, view.width, view.height);
    }

    destroy (): void
    {
        this.graphics.destroy();
    }
}