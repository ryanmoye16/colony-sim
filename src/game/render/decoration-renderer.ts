// =============================================================================
// DecorationRenderer — draws the world.decorations list as sprites.
// =============================================================================
// Decorations sit at depth 7, just below items (depth 8) and well below
// settlers (depth 10). They use `setOrigin(0, 0)` so each sprite anchors at
// the tile's top-left pixel, then we offset by half the difference between
// the tile and the sprite's display size to center it. This keeps the visual
// feel precise at any zoom.
// =============================================================================

import type { Scene } from 'phaser';
import { TILE_SIZE } from '../config/game.config';
import type { World } from '../world/world';
import { DECORATION_TEXTURE_KEYS, DECORATION_DISPLAY_SIZE } from './sprites';

export class DecorationRenderer
{
    private readonly container: Phaser.GameObjects.Container;

    constructor (scene: Scene, world: World)
    {
        this.container = scene.add.container(0, 0);
        this.container.setDepth(7);

        for (const deco of world.decorations)
        {
            this.spawn(deco);
        }
    }

    private spawn (deco: { tx: number; ty: number; kind: string; variant: number }): void
    {
        const keyMap = DECORATION_TEXTURE_KEYS[deco.kind];
        if (!keyMap) return;
        const key = keyMap[deco.variant] ?? keyMap[0];
        if (!this.container.scene.textures.exists(key)) return;

        const size = DECORATION_DISPLAY_SIZE[deco.kind] ?? TILE_SIZE * 0.6;
        const offset = (TILE_SIZE - size) / 2;

        const sprite = this.container.scene.add.image(
            deco.tx * TILE_SIZE + offset,
            deco.ty * TILE_SIZE + offset,
            key,
        );
        sprite.setOrigin(0, 0);
        sprite.setDisplaySize(size, size);
        this.container.add(sprite);
    }

    destroy (): void
    {
        this.container.destroy();
    }
}