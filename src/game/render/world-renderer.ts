import { Scene, GameObjects, Textures } from 'phaser';
import { World } from '../world/world';
import { TILE_SIZE } from '../config/game.config';
import { TileType, biomeGroup } from '../world/tile';
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
        // stays put when settlers walk over it. Plum tint (#18081c at 0.55
        // alpha) matches the earth palette so it reads as ground shade
        // rather than a black blob.
        if (type === TileType.Tree || type === TileType.TreePine || type === TileType.TreeBush)
        {
            const sx = x * TILE_SIZE + TILE_SIZE / 2;
            const sy = y * TILE_SIZE + TILE_SIZE * 0.85;
            ctx.fillStyle = 'rgba(24, 8, 28, 0.55)';
            ctx.beginPath();
            ctx.ellipse(sx, sy, TILE_SIZE * 0.48, TILE_SIZE * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Bake ambient occlusion: when a non-wall tile has a wall neighbor,
        // paint a soft dark gradient along the wall-facing edge. This gives
        // wall corners real depth — the kind of subtle shading that makes
        // a static pixel-art world feel grounded. Baked into the composite
        // canvas so it costs nothing per frame and follows wall changes
        // automatically when tiles are redrawn.
        if (type !== TileType.Wall)
        {
            this.drawAmbientOcclusion(ctx, x, y, world);
        }

        // Bake biome-edge haze: a light cool-white gradient that bleeds
        // onto this tile from a neighbor of a different biome group.
        // Pools especially hard at the water↔land and sand↔grass borders,
        // giving the world the kind of atmospheric perspective Odd Realm
        // uses to separate biomes. Baked so it's free per frame.
        if (type !== TileType.Wall && type !== TileType.Tree && type !== TileType.TreePine && type !== TileType.TreeBush)
        {
            this.drawBiomeHaze(ctx, x, y, world);
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

    // Paint a soft dark gradient along each edge of a floor tile that borders
    // a wall. The gradient is wider at the wall-facing side and fades to
    // transparent, simulating ambient occlusion. Walls facing the floor tile
    // create the dark "crevice" you see at every interior corner in Odd Realm.
    private drawAmbientOcclusion (ctx: CanvasRenderingContext2D, x: number, y: number, world: World): void
    {
        const AO_DEPTH = 5; // px of gradient falloff
        const AO_ALPHA = 0.28;

        const nWall = world.inBounds(x, y - 1) && world.getTile(x, y - 1) === TileType.Wall;
        const sWall = world.inBounds(x, y + 1) && world.getTile(x, y + 1) === TileType.Wall;
        const eWall = world.inBounds(x + 1, y) && world.getTile(x + 1, y) === TileType.Wall;
        const wWall = world.inBounds(x - 1, y) && world.getTile(x - 1, y) === TileType.Wall;

        if (!nWall && !sWall && !eWall && !wWall) return;

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (nWall)
        {
            const grad = ctx.createLinearGradient(px, py, px, py + AO_DEPTH);
            grad.addColorStop(0, `rgba(0,0,0,${AO_ALPHA})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(px, py, TILE_SIZE, AO_DEPTH);
        }
        if (sWall)
        {
            const grad = ctx.createLinearGradient(px, py + TILE_SIZE - AO_DEPTH, px, py + TILE_SIZE);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(0,0,0,${AO_ALPHA})`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, py + TILE_SIZE - AO_DEPTH, TILE_SIZE, AO_DEPTH);
        }
        if (wWall)
        {
            const grad = ctx.createLinearGradient(px, py, px + AO_DEPTH, py);
            grad.addColorStop(0, `rgba(0,0,0,${AO_ALPHA})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(px, py, AO_DEPTH, TILE_SIZE);
        }
        if (eWall)
        {
            const grad = ctx.createLinearGradient(px + TILE_SIZE - AO_DEPTH, py, px + TILE_SIZE, py);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(0,0,0,${AO_ALPHA})`);
            ctx.fillStyle = grad;
            ctx.fillRect(px + TILE_SIZE - AO_DEPTH, py, AO_DEPTH, TILE_SIZE);
        }
    }

    // Paint a soft cool-white gradient onto this tile where it borders a
    // different biome. The depth is wider than AO (10px vs 5px) and the
    // color is a light blue-grey rather than black, so the effect reads
    // as drifting mist/ground-fog rather than a shadow. Painted BEFORE
    // the tile sprite so the tile draws on top, with the haze peeking
    // out along the edges — feels like the world is breathing.
    private drawBiomeHaze (ctx: CanvasRenderingContext2D, x: number, y: number, world: World): void
    {
        const HAZE_DEPTH = 10;
        const HAZE_ALPHA = 0.32;
        // Cool blueish-white reads as atmospheric mist at any hour of day.
        // Slightly higher R than B gives a faint warm bias so the haze
        // doesn't fight the warmer terrain palettes.
        const HAZE_COLOR = '198, 210, 230';

        const myGroup = biomeGroup(world.getTile(x, y));
        if (myGroup === 0) return;

        const nGroup = world.inBounds(x, y - 1) ? biomeGroup(world.getTile(x, y - 1)) : 0;
        const sGroup = world.inBounds(x, y + 1) ? biomeGroup(world.getTile(x, y + 1)) : 0;
        const eGroup = world.inBounds(x + 1, y) ? biomeGroup(world.getTile(x + 1, y)) : 0;
        const wGroup = world.inBounds(x - 1, y) ? biomeGroup(world.getTile(x - 1, y)) : 0;

        if (nGroup === myGroup && sGroup === myGroup && eGroup === myGroup && wGroup === myGroup) return;

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (nGroup !== myGroup && nGroup !== 0)
        {
            const grad = ctx.createLinearGradient(px, py, px, py + HAZE_DEPTH);
            grad.addColorStop(0, `rgba(${HAZE_COLOR}, ${HAZE_ALPHA})`);
            grad.addColorStop(1, `rgba(${HAZE_COLOR}, 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, py, TILE_SIZE, HAZE_DEPTH);
        }
        if (sGroup !== myGroup && sGroup !== 0)
        {
            const grad = ctx.createLinearGradient(px, py + TILE_SIZE - HAZE_DEPTH, px, py + TILE_SIZE);
            grad.addColorStop(0, `rgba(${HAZE_COLOR}, 0)`);
            grad.addColorStop(1, `rgba(${HAZE_COLOR}, ${HAZE_ALPHA})`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, py + TILE_SIZE - HAZE_DEPTH, TILE_SIZE, HAZE_DEPTH);
        }
        if (wGroup !== myGroup && wGroup !== 0)
        {
            const grad = ctx.createLinearGradient(px, py, px + HAZE_DEPTH, py);
            grad.addColorStop(0, `rgba(${HAZE_COLOR}, ${HAZE_ALPHA})`);
            grad.addColorStop(1, `rgba(${HAZE_COLOR}, 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, py, HAZE_DEPTH, TILE_SIZE);
        }
        if (eGroup !== myGroup && eGroup !== 0)
        {
            const grad = ctx.createLinearGradient(px + TILE_SIZE - HAZE_DEPTH, py, px + TILE_SIZE, py);
            grad.addColorStop(0, `rgba(${HAZE_COLOR}, 0)`);
            grad.addColorStop(1, `rgba(${HAZE_COLOR}, ${HAZE_ALPHA})`);
            ctx.fillStyle = grad;
            ctx.fillRect(px + TILE_SIZE - HAZE_DEPTH, py, HAZE_DEPTH, TILE_SIZE);
        }
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
