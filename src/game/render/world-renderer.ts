import { Scene, GameObjects, Textures } from 'phaser';
import { World } from '../world/world';
import { TILE_SIZE } from '../config/game.config';
import { TileType, biomeGroup } from '../world/tile';
import { getTileTextureKey, WALL_TEXTURE_KEY, resolveTextureKey } from './sprites';

// Per-season tree tints. Painted over tree pixels only (source-atop) so
// the surrounding grass/underlay keeps its natural color. Each season has
// a distinct palette so the world reads as living through the year:
//
//   Spring — fresh yellow-green push (early bloom)
//   Summer — neutral, no tint (Kenney colors as-is)
//   Autumn — heavy orange shift (most dramatic)
//   Winter — cool blue-grey lift (bare/snowy)
interface SeasonTint { r: number; g: number; b: number; alpha: number; }
const TREE_SEASON_TINTS: Record<number, SeasonTint> = {
    0: { r: 200, g: 255, b: 170, alpha: 0.28 },  // Spring — fresh yellow-green push
    1: { r: 255, g: 255, b: 255, alpha: 0.00 },  // Summer — neutral, no tint
    2: { r: 255, g: 140, b:  60, alpha: 0.55 },  // Autumn — heavy orange shift
    3: { r: 220, g: 230, b: 245, alpha: 0.40 },  // Winter — cool blue-grey lift
};

export class WorldRenderer
{
    readonly image: GameObjects.Image;
    private readonly textureKey: string;
    private treeSeason: number = 1;

    /**
     * Set the current season for tree tinting. Called from World scene
     * when the season changes; triggers a full world rebake so the new
     * tint is applied to every tree tile.
     */
    setSeason (season: number): void
    {
        this.treeSeason = season;
    }

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
        // Modify the existing canvas in place rather than recreating it.
        // Removing + re-adding the CanvasTexture under the same key doesn't
        // reliably refresh Phaser's GPU upload — the Image sprite keeps a
        // reference to the old texture object and the canvas swap is invisible.
        // In-place update + tex.update() matches what redrawTile does for
        // single tiles, and is what makes the seasonal rebake actually
        // appear on screen.
        const existing = scene.textures.exists(this.textureKey);
        let canvas: HTMLCanvasElement;
        if (existing)
        {
            const tex = scene.textures.get(this.textureKey) as Textures.CanvasTexture;
            canvas = tex.getCanvas()!;
            canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
        }
        else
        {
            canvas = document.createElement('canvas');
            canvas.width = world.width * TILE_SIZE;
            canvas.height = world.height * TILE_SIZE;
        }
        const ctx = canvas.getContext('2d')!;

        for (let y = 0; y < world.height; y++)
        {
            for (let x = 0; x < world.width; x++)
            {
                this.drawTileTo(ctx, scene, x, y, world, world.getTile(x, y));
            }
        }

        if (existing)
        {
            const tex = scene.textures.get(this.textureKey) as Textures.CanvasTexture;
            tex.update();
        }
        else
        {
            scene.textures.addCanvas(this.textureKey, canvas);
        }
    }

    private drawTileTo (ctx: CanvasRenderingContext2D, scene: Scene, x: number, y: number, world: World, type: TileType): void
    {
        // For tree tiles, paint a grass underlay first. Kenney's tree
        // sprites are small (10-14px tall) on a transparent 16x16 canvas —
        // without an underlay, the void between the canopy and the tile
        // border shows the world background color (#0a0a0a) and the trees
        // look like they're floating in black. Compositing grass underneath
        // reads as a tree growing on grass, which is what we want.
        if (type === TileType.Tree || type === TileType.TreePine || type === TileType.TreeBush)
        {
            const grassKey = resolveTextureKey(getTileTextureKey(TileType.Grass, x, y));
            const grassTex = scene.textures.get(grassKey);
            const grassSrc = grassTex
                ? ((grassTex as Textures.CanvasTexture).getCanvas?.() ?? grassTex.getSourceImage())
                : null;
            if (grassSrc) ctx.drawImage(grassSrc, x * TILE_SIZE, y * TILE_SIZE);
            // The tree sprite goes on top. We don't get a chance to skip
            // the ambient-occlusion / biome-haze passes below because they
            // look fine on the grass underlay, so we still let them run.
        }

        const key = resolveTextureKey(this.getKeyForTile(world, x, y, type));
        const tex = scene.textures.get(key);
        if (!tex) return;
        // Texture source can be either a CanvasTexture (procedural) or an
        // Image texture (PNG). getCanvas() returns null for image textures,
        // so fall back to getSourceImage() which returns an HTMLImageElement.
        // CanvasRenderingContext2D.drawImage accepts both.
        const src = (tex as Textures.CanvasTexture).getCanvas?.() ?? (tex.getSourceImage() as CanvasImageSource);
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

        ctx.drawImage(src, x * TILE_SIZE, y * TILE_SIZE);

        // Seasonal tree tint: paint a color over ONLY the tree pixels using
        // source-atop, so the surrounding grass underlay isn't affected. The
        // tint shifts trees through spring green → autumn orange → winter
        // bare/snowy so the world feels like it lives through the year.
        if (type === TileType.Tree || type === TileType.TreePine || type === TileType.TreeBush)
        {
            const tint = TREE_SEASON_TINTS[this.treeSeason];
            if (tint && tint.alpha > 0)
            {
                ctx.save();
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${tint.alpha})`;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.restore();
            }
        }

        // Bake biome-edge haze ON TOP of the tile sprite so it actually shows
        // (Kenney tiles are fully opaque, so painting under them is invisible).
        // The haze bleeds in from any neighbor of a different biome group —
        // strongest at water↔land and sand↔grass borders, giving the world
        // atmospheric perspective. Pools ~14px deep at full alpha and falls off
        // quickly so the boundary reads as a soft transition, not a hard edge.
        if (type !== TileType.Wall && type !== TileType.Tree && type !== TileType.TreePine && type !== TileType.TreeBush)
        {
            this.drawBiomeHaze(ctx, x, y, world);
        }

        // Bake shoreline foam on water tiles where they meet land. Painted
        // on top so the white pixels actually show against the deep blue
        // water (without that, foam under the sprite is invisible). Sits in
        // a 2-3px band along the land-facing edge with sparse gaps so it
        // reads as small breaking waves rather than a hard white outline.
        if (type === TileType.Water || type === TileType.SandWater)
        {
            this.drawShorelineFoam(ctx, x, y, world);
        }
    }

    // Paint white foam pixels along the edges of a water tile that face a
    // non-water neighbor. Sparse 2px blocks with random gaps give the
    // impression of small breaking waves lapping at the shore, not a hard
    // outline. Deterministic per-tile so the foam doesn't change between
    // redraws (which would happen on tile.changed for adjacent tiles).
    private drawShorelineFoam (ctx: CanvasRenderingContext2D, x: number, y: number, world: World): void
    {
        const FOAM_DEPTH = 2;
        const FOAM_ALPHA = 0.65;
        // Per-tile deterministic noise so foam is stable across redraws
        // (re-rolls only happen when adjacent tiles change, not per frame).
        const seed = (x * 73856093) ^ (y * 19349663);
        const rand = (i: number) => {
            let s = (seed + i * 83492791) | 0;
            s = (s ^ (s >>> 13)) * 1274126177 | 0;
            return ((s ^ (s >>> 16)) >>> 0) / 0xffffffff;
        };

        const isLand = (tx: number, ty: number) => {
            if (!world.inBounds(tx, ty)) return false;
            const t = world.getTile(tx, ty);
            return t !== TileType.Water && t !== TileType.SandWater;
        };

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        ctx.save();
        ctx.fillStyle = `rgba(240, 248, 255, ${FOAM_ALPHA})`;

        // North edge: foam in a row of 2px blocks, sparse gaps
        if (isLand(x, y - 1))
        {
            for (let i = 0; i < TILE_SIZE; i += 2)
            {
                if (rand(i) < 0.55) ctx.fillRect(px + i, py, 2, FOAM_DEPTH);
            }
        }
        // South edge
        if (isLand(x, y + 1))
        {
            for (let i = 0; i < TILE_SIZE; i += 2)
            {
                if (rand(i + 100) < 0.55) ctx.fillRect(px + i, py + TILE_SIZE - FOAM_DEPTH, 2, FOAM_DEPTH);
            }
        }
        // West edge
        if (isLand(x - 1, y))
        {
            for (let i = 0; i < TILE_SIZE; i += 2)
            {
                if (rand(i + 200) < 0.55) ctx.fillRect(px, py + i, FOAM_DEPTH, 2);
            }
        }
        // East edge
        if (isLand(x + 1, y))
        {
            for (let i = 0; i < TILE_SIZE; i += 2)
            {
                if (rand(i + 300) < 0.55) ctx.fillRect(px + TILE_SIZE - FOAM_DEPTH, py + i, FOAM_DEPTH, 2);
            }
        }
        ctx.restore();
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
    // different biome. Painted AFTER the tile sprite so the haze actually
    // shows on top of the opaque Kenney tiles — without that, the gradient
    // is completely hidden by the grass/dirt/sand art. Bumped depth to 14px
    // and alpha to 0.55 so the soft transition is unmistakable. The cool
    // blueish-white reads as drifting mist/ground-fog at any hour of day.
    private drawBiomeHaze (ctx: CanvasRenderingContext2D, x: number, y: number, world: World): void
    {
        const HAZE_DEPTH = 14;
        const HAZE_ALPHA = 0.55;
        // Cool blueish-white reads as atmospheric mist at any hour of day.
        // Slightly higher R than B gives a faint warm bias so the haze
        // doesn't fight the warmer terrain palettes.
        const HAZE_COLOR = '210, 222, 240';

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
        // Force Phaser to re-upload the canvas to GPU. setTexture alone doesn't
        // always pick up the new pixels — Phaser's renderer caches the texture
        // object reference, and CanvasTexture.update() only marks dirty for
        // the next frame. After restoring we set the texture again, then
        // refresh the Image sprite so it re-binds.
        this.image.setTexture(this.textureKey);
        const tex = scene.textures.get(this.textureKey) as Textures.CanvasTexture;
        if (tex && (tex as unknown as { update?: () => void }).update) tex.update();
    }

    destroy (): void
    {
        this.image.destroy();
    }
}
