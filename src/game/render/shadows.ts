// =============================================================================
// SettlerShadows — drop-shadows + presence halos under each settler.
// =============================================================================
// Each settler gets two stacked elements at its feet:
//   1. A thin warm "presence halo" — a stroked circle slightly larger than
//      the settler sprite. Always visible, low alpha, picks up against any
//      terrain (grass green, autumn orange, sand tan). Without this, the
//      16x16 settler disappears into the busy forest palette.
//   2. A soft drop-shadow ellipse underneath the halo. Stays planted when
//      the settler bobs while walking so the sprite appears to lift.
//
// Both layers live in the same container at depth 9 — between items (8)
// and settler sprites (10). The halo is intentionally subtle: just enough
// contrast to draw the eye, not so much that it reads as a UI overlay.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';

const SHADOW_WIDTH = 9;
const SHADOW_HEIGHT = 3;
const SHADOW_COLOR = 0x18081c; // earthOut — plum, not pure black
const SHADOW_ALPHA = 0.55;

// Halo tuning: a 2px stroke at a high-contrast cyan (#5ce0d8), blended ADD.
// ADD blend mode makes the ring additive against any underlying color, so
// it punches through the time-of-day tint and busy forest palette rather
// than blending into them. Settlers stay findable at every zoom + hour.
// Radius 14 sits clearly outside the visible settler body so the ring
// frames the feet even at zoom 1.
const HALO_RADIUS = 14;
const HALO_COLOR = 0x5ce0d8;
const HALO_ALPHA = 0.85;
const HALO_STROKE_WIDTH = 2;

interface ShadowEntry {
    ellipse: Phaser.GameObjects.Ellipse;
    halo: Phaser.GameObjects.Arc;
}

export class SettlerShadows
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly entries: Map<number, ShadowEntry> = new Map();

    constructor (private readonly scene: Scene)
    {
        this.container = scene.add.container(0, 0);
        this.container.setDepth(9);
    }

    /**
     * Create a shadow + halo for a settler at the given pixel position.
     * Idempotent — if they already exist for this entity, just update.
     */
    attach (entity: number, x: number, y: number): void
    {
        let entry = this.entries.get(entity);
        if (!entry)
        {
            const ellipse = this.scene.add.ellipse(x, y, SHADOW_WIDTH, SHADOW_HEIGHT, SHADOW_COLOR, SHADOW_ALPHA);
            this.container.add(ellipse);
            const halo = this.scene.add.circle(x, y, HALO_RADIUS, 0x000000, 0);
            halo.setStrokeStyle(HALO_STROKE_WIDTH, HALO_COLOR, HALO_ALPHA);
            halo.setBlendMode(BlendModes.ADD);
            this.container.add(halo);
            entry = { ellipse, halo };
            this.entries.set(entity, entry);
        }
        entry.ellipse.setPosition(x, y);
        entry.halo.setPosition(x, y);
    }

    /**
     * Move the shadow + halo. The shadow stays at `y` (feet planted) while
     * the settler bobs above it; the halo follows the same logic so the
     * ring stays anchored to the ground.
     */
    update (entity: number, x: number, y: number): void
    {
        const entry = this.entries.get(entity);
        if (!entry) return;
        entry.ellipse.setPosition(x, y);
        entry.halo.setPosition(x, y);
    }

    detach (entity: number): void
    {
        const entry = this.entries.get(entity);
        if (!entry) return;
        entry.ellipse.destroy();
        entry.halo.destroy();
        this.entries.delete(entity);
    }

    /**
     * Detach every shadow/halo whose entity is no longer in the given set.
     * Called from the render loop after iterating ECS entities.
     */
    pruneTo (liveEntities: Set<number>): void
    {
        for (const [entity, entry] of this.entries)
        {
            if (!liveEntities.has(entity))
            {
                entry.ellipse.destroy();
                entry.halo.destroy();
                this.entries.delete(entity);
            }
        }
    }

    destroy (): void
    {
        for (const entry of this.entries.values())
        {
            entry.ellipse.destroy();
            entry.halo.destroy();
        }
        this.entries.clear();
        this.container.destroy();
    }
}