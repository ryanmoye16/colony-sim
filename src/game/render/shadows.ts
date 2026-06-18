// =============================================================================
// SettlerShadows — soft drop-shadows under each settler.
// =============================================================================
// Each settler gets a small ellipse beneath its feet. The shadow stays on the
// ground while the settler bobs upward (when walking) so the settler appears
// to lift off the shadow. That's how cheap, no-texture 2D games fake "depth".
//
// Shadows live in their own container at depth 9 — between items (depth 8)
// and settler sprites (depth 10). They're tinted plum (#18081c at alpha 0.35)
// to match the earth palette and avoid looking like generic black blobs.
// =============================================================================

import type { Scene } from 'phaser';

const SHADOW_WIDTH = 9;
const SHADOW_HEIGHT = 3;
const SHADOW_COLOR = 0x18081c; // earthOut — plum, not pure black
const SHADOW_ALPHA = 0.55;

interface ShadowEntry {
    ellipse: Phaser.GameObjects.Ellipse;
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
     * Create a shadow for a settler at the given pixel position. Idempotent —
     * if a shadow already exists for this entity, just updates its position.
     */
    attach (entity: number, x: number, y: number): void
    {
        let entry = this.entries.get(entity);
        if (!entry)
        {
            const ellipse = this.scene.add.ellipse(x, y, SHADOW_WIDTH, SHADOW_HEIGHT, SHADOW_COLOR, SHADOW_ALPHA);
            this.container.add(ellipse);
            entry = { ellipse };
            this.entries.set(entity, entry);
        }
        entry.ellipse.setPosition(x, y);
    }

    /**
     * Move the shadow. `bob` is the vertical offset the settler sprite has
     * above its feet — the shadow stays at `y` regardless (the feet stay
     * planted), so just take the feet position.
     */
    update (entity: number, x: number, y: number): void
    {
        const entry = this.entries.get(entity);
        if (!entry) return;
        entry.ellipse.setPosition(x, y);
    }

    detach (entity: number): void
    {
        const entry = this.entries.get(entity);
        if (!entry) return;
        entry.ellipse.destroy();
        this.entries.delete(entity);
    }

    /**
     * Detach every shadow whose entity is no longer in the given entity set.
     * Called from the render loop after iterating ECS entities.
     */
    pruneTo (liveEntities: Set<number>): void
    {
        for (const [entity, entry] of this.entries)
        {
            if (!liveEntities.has(entity))
            {
                entry.ellipse.destroy();
                this.entries.delete(entity);
            }
        }
    }

    destroy (): void
    {
        for (const entry of this.entries.values()) entry.ellipse.destroy();
        this.entries.clear();
        this.container.destroy();
    }
}