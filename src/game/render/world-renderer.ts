import { Scene, GameObjects, Textures } from 'phaser';
import { World } from '../world/world';
import { TILE_SIZE } from '../config/game.config';
import { TileType } from '../world/tile';
import { getTileTextureKey } from './sprites';

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
            this.redrawTile(scene, event.wx, event.wy, world.getTile(event.wx, event.wy));
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
                this.drawTileTo(ctx, scene, x, y, world.getTile(x, y));
            }
        }

        if (scene.textures.exists(this.textureKey))
        {
            scene.textures.remove(this.textureKey);
        }
        scene.textures.addCanvas(this.textureKey, canvas);
    }

    private drawTileTo (ctx: CanvasRenderingContext2D, scene: Scene, x: number, y: number, type: TileType): void
    {
        const key = getTileTextureKey(type, x, y);
        const tex = scene.textures.get(key) as Textures.CanvasTexture | null;
        if (!tex) return;
        const src = tex.getCanvas();
        if (!src) return;
        ctx.drawImage(src, x * TILE_SIZE, y * TILE_SIZE);
    }

    private redrawTile (scene: Scene, wx: number, wy: number, type: TileType): void
    {
        const tex = scene.textures.get(this.textureKey) as Textures.CanvasTexture | null;
        if (!tex) return;
        const canvas = tex.getCanvas();
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        this.drawTileTo(ctx, scene, wx, wy, type);
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
