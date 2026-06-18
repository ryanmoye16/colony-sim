import { Scene, GameObjects, Textures } from 'phaser';
import { World } from '../world/world';
import { TILE_SIZE } from '../config/game.config';
import { TileType } from '../world/tile';
import { getTileTextureKey, WALL_TEXTURE_KEY } from './sprites';

export class WorldRenderer
{
    readonly image: GameObjects.Image;
    private readonly textureKey: string;

    constructor (scene: Scene, world: World)
    {
        this.textureKey = 'world-composite';
        this.drawAll(scene, world);
        this.image = scene.add.image(0, 0, this.textureKey);
        this.image.setOrigin(0, 0);

        world.events.on('tile.changed', (event) => {
            // Re-render this tile AND its 4 neighbors (so wall caps update).
            this.redrawTile(scene, event.wx, event.wy, world);
            this.redrawTile(scene, event.wx - 1, event.wy, world);
            this.redrawTile(scene, event.wx + 1, event.wy, world);
            this.redrawTile(scene, event.wx, event.wy - 1, world);
            this.redrawTile(scene, event.wx, event.wy + 1, world);
        });
    }

    private drawAll (scene: Scene, world: World): void
    {
        const canvas = document.createElement('canvas');
        canvas.width = world.width * TILE_SIZE;
        canvas.height = world.height * TILE_SIZE;
        const ctx = canvas.getContext('2d')!;

        for (let y = 0; y < world.height; y++)
        {
            for (let x = 0; x < world.width; x++)
            {
                this.drawTileTo(ctx, scene, x, y, world, world.getTile(x, y));
            }
        }

        if (scene.textures.exists(this.textureKey))
        {
            scene.textures.remove(this.textureKey);
        }
        scene.textures.addCanvas(this.textureKey, canvas);
    }

    private drawTileTo (ctx: CanvasRenderingContext2D, scene: Scene, x: number, y: number, world: World, type: TileType): void
    {
        const key = this.getKeyForTile(world, x, y, type);
        const tex = scene.textures.get(key) as Textures.CanvasTexture | null;
        if (!tex) return;
        const src = tex.getCanvas();
        if (!src) return;

        // Bake a soft drop-shadow under trees. The shadow is part of the
        // static world-composite canvas so it costs nothing per frame and
        // stays put when settlers walk over it. Plum tint (#18081c at 0.35
        // alpha) matches the earth palette so it reads as ground shade
        // rather than a black blob.
        if (type === TileType.Tree || type === TileType.TreePine || type === TileType.TreeBush)
        {
            const sx = x * TILE_SIZE + TILE_SIZE / 2;
            const sy = y * TILE_SIZE + TILE_SIZE * 0.85;
            ctx.fillStyle = 'rgba(24, 8, 28, 0.35)';
            ctx.beginPath();
            ctx.ellipse(sx, sy, TILE_SIZE * 0.42, TILE_SIZE * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.drawImage(src, x * TILE_SIZE, y * TILE_SIZE);
    }

    // Pick a texture key for a tile. For walls, use neighbor-aware variant.
    private getKeyForTile (world: World, x: number, y: number, type: TileType): string
    {
        if (type === TileType.Wall)
        {
            const n = world.inBounds(x, y - 1) && world.getTile(x, y - 1) === TileType.Wall ? 1 : 0;
            const s = world.inBounds(x, y + 1) && world.getTile(x, y + 1) === TileType.Wall ? 1 : 0;
            const e = world.inBounds(x + 1, y) && world.getTile(x + 1, y) === TileType.Wall ? 1 : 0;
            const w = world.inBounds(x - 1, y) && world.getTile(x - 1, y) === TileType.Wall ? 1 : 0;
            const key = WALL_TEXTURE_KEY(n, e, s, w);
            return key;
        }
        return getTileTextureKey(type, x, y);
    }

    private redrawTile (scene: Scene, wx: number, wy: number, world: World): void
    {
        if (!world.inBounds(wx, wy)) return;
        const tex = scene.textures.get(this.textureKey) as Textures.CanvasTexture | null;
        if (!tex) return;
        const canvas = tex.getCanvas();
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const type = world.getTile(wx, wy);
        // Clear the tile first
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.clearRect(wx * TILE_SIZE, wy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        this.drawTileTo(ctx, scene, wx, wy, world, type);
        tex.update();
    }

    restoreAll (scene: Scene, world: World): void
    {
        this.drawAll(scene, world);
        this.image.setTexture(this.textureKey);
    }

    destroy (): void
    {
        this.image.destroy();
    }
}
