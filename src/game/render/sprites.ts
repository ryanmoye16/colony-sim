import type { Scene } from 'phaser';
import { TileType } from '../world/tile';

interface SpriteDef
{
    pixels: string[];
    palette: Record<string, string>;
}

function renderToCanvas (sprite: SpriteDef): HTMLCanvasElement
{
    const w = sprite.pixels[0].length;
    const h = sprite.pixels.length;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    for (let y = 0; y < h; y++)
    {
        const row = sprite.pixels[y];
        for (let x = 0; x < w; x++)
        {
            const c = row[x];
            if (c === ' ') continue;
            const color = sprite.palette[c];
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    return canvas;
}

export function registerPixelSprite (scene: Scene, key: string, sprite: SpriteDef): void
{
    if (scene.textures.exists(key)) return;
    const canvas = renderToCanvas(sprite);
    scene.textures.addCanvas(key, canvas);
}

// ----------------------------------------------------------------------------
// Settlers (16x16). Top-down colonist with hair, face (eyes), shoulders/sleeves,
// body, legs.
// H = hair, S = skin, E = eyes, T = shirt (varies). Space = transparent.
// ----------------------------------------------------------------------------

const SETTLER_PIXELS_IDLE: string[] = [
    '................',
    '......HHHH......',
    '....HSSSSSSH....',
    '...HSSSSSSSSH...',
    '...HSESSSSEH...',
    '....HSSSSSSH....',
    '....TTTTTTTT....',
    '...TTTTTTTTTT...',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '.....PPPPPP.....',
    '.....PPPPPP.....',
    '.....PPPPPP.....',
    '.....PPPPPP.....',
    '......PPPP......',
    '......PPPP......',
];

const SETTLER_PIXELS_WALK_A: string[] = [
    '................',
    '......HHHH......',
    '....HSSSSSSH....',
    '...HSSSSSSSSH...',
    '...HSESSSSEH...',
    '....HSSSSSSH....',
    '....TTTTTTTT....',
    '...TTTTTTTTTT...',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '.....PPPPPP.....',
    '.....PPPPPP.....',
    '....PP....PP....',
    '....PP....PP....',
    '....PP....PP....',
    '....PP....PP....',
];

const SETTLER_PIXELS_WALK_B: string[] = [
    '................',
    '......HHHH......',
    '....HSSSSSSH....',
    '...HSSSSSSSSH...',
    '...HSESSSSEH...',
    '....HSSSSSSH....',
    '....TTTTTTTT....',
    '...TTTTTTTTTT...',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '.....PPPPPP.....',
    '.....PPPPPP.....',
    '.....PPPPPP.....',
    '.....PPPPPP.....',
    '.....PP..PP.....',
    '......PPPP......',
];

const SETTLER_PALETTE_BASE: Record<string, string> = {
    H: '#3a1a0a',
    S: '#f0c8a0',
    E: '#1a1a1a',
    P: '#5a3a1a',
};

const settlerWithShirt = (shirtColor: string): { idle: SpriteDef; walkA: SpriteDef; walkB: SpriteDef } => ({
    idle: { pixels: SETTLER_PIXELS_IDLE, palette: { ...SETTLER_PALETTE_BASE, T: shirtColor } },
    walkA: { pixels: SETTLER_PIXELS_WALK_A, palette: { ...SETTLER_PALETTE_BASE, T: shirtColor } },
    walkB: { pixels: SETTLER_PIXELS_WALK_B, palette: { ...SETTLER_PALETTE_BASE, T: shirtColor } },
});

const SETTLERS = {
    red: settlerWithShirt('#cc4040'),
    blue: settlerWithShirt('#4060cc'),
    green: settlerWithShirt('#40a060'),
    orange: settlerWithShirt('#cc8840'),
};

// ----------------------------------------------------------------------------
// Items (8x8). S/s = stone, R/r = apple, g = leaf, b/B/w = log.
// ----------------------------------------------------------------------------

const ITEM_STONE: SpriteDef = {
    pixels: [
        '..SSSS..',
        '.SSSSSS.',
        'SSSSSSSS',
        'SSssssSS',
        'SSssssSS',
        'SSSSSSSS',
        '.SSSSSS.',
        '..SSSS..',
    ],
    palette: { S: '#808080', s: '#b0b0b0' },
};

const ITEM_FOOD: SpriteDef = {
    pixels: [
        '...g....',
        '.ggg....',
        '.gRRg...',
        'RRRRRRR.',
        'RrrRRRRR',
        'RrrRRRRR',
        '.RRRRRR.',
        '..RRRR..',
    ],
    palette: { g: '#4adc4a', R: '#cc3030', r: '#ee5050' },
};

const ITEM_WOOD: SpriteDef = {
    pixels: [
        '.bbbbbb.',
        'bBBBBBBb',
        'bBwwwwBb',
        'bBwwwwBb',
        'bBwwwwBb',
        'bBwwwwBb',
        'bBBBBBBb',
        '.bbbbbb.',
    ],
    palette: { b: '#4a2a0a', B: '#8b5a2b', w: '#c89060' },
};

// ----------------------------------------------------------------------------
// Tiles (16x16). Each designed to tile cleanly without vertical-line artifacts.
// '.' = base, ' ' = transparent. Drawn pixel-by-pixel.
// ----------------------------------------------------------------------------

const TILE_EMPTY: SpriteDef = {
    pixels: Array(16).fill('DDDDDDDDDDDDDDDD'),
    palette: { D: '#0a0a0e' },
};

// Grass variants: scattered tufts at varied positions for visual variety.
const TILE_GRASS_A: SpriteDef = {
    pixels: [
        '................',
        '...GG..........',
        '................',
        '.......GG......',
        '................',
        '..GG............',
        '................',
        '..........GG...',
        '................',
        '...GG..........',
        '................',
        '......GG.......',
        '................',
        '..GG............',
        '................',
        '........GG.....',
    ],
    palette: { '.': '#5a9b3a', G: '#3a6a1a' },
};

const TILE_GRASS_B: SpriteDef = {
    pixels: [
        '................',
        '...........GG..',
        '................',
        '..GG............',
        '................',
        '.......GG.......',
        '................',
        '...GG...........',
        '................',
        '..........GG....',
        '................',
        '....GG..........',
        '................',
        '........GG......',
        '................',
        '......GG........',
    ],
    palette: { '.': '#5a9b3a', G: '#3a6a1a' },
};

const TILE_GRASS_C: SpriteDef = {
    pixels: [
        '................',
        '..GG............',
        '................',
        '..........GG....',
        '................',
        '...GG...........',
        '................',
        '......GG........',
        '................',
        '........GG......',
        '................',
        '..GG............',
        '................',
        '.........GG.....',
        '................',
        '....GG..........',
    ],
    palette: { '.': '#5a9b3a', G: '#3a6a1a' },
};

const TILE_GRASS_VARIANTS_UNUSED = [TILE_GRASS_A, TILE_GRASS_B, TILE_GRASS_C];
void TILE_GRASS_VARIANTS_UNUSED;

// Water: scattered wave highlights.
const TILE_WATER: SpriteDef = {
    pixels: [
        '................',
        '...WW...........',
        '................',
        '..........WW....',
        '................',
        '..WW............',
        '................',
        '............WW..',
        '................',
        '....WW..........',
        '................',
        '......WW........',
        '................',
        '..WW............',
        '................',
        '.........WW.....',
    ],
    palette: { '.': '#2f5b8a', W: '#7fb0d8' },
};

// Stone: scattered dark spots and cracks.
const TILE_STONE: SpriteDef = {
    pixels: [
        '................',
        '...D............',
        '................',
        '......D.........',
        '...D............',
        '................',
        '........D.......',
        '................',
        '..D.............',
        '................',
        '......D.........',
        '................',
        '...D............',
        '................',
        '........D.......',
        '................',
    ],
    palette: { '.': '#808080', D: '#505050' },
};

// Sand: scattered darker dots.
const TILE_SAND: SpriteDef = {
    pixels: [
        '................',
        '..S............S',
        '................',
        '........S.......',
        '................',
        '....S...........',
        '................',
        '..S.............',
        '................',
        '..........S.....',
        '................',
        '...S............',
        '................',
        '......S.........',
        'S..............S',
        '................',
    ],
    palette: { '.': '#e8c878', S: '#c8a850' },
};

// Tree: round canopy with multi-tone leaves and visible brown trunk.
// L = light canopy, M = mid, D = dark, h = highlight, k = trunk.
// Tiled forests look continuous because dots/leaves are not in fixed column rows.
const TILE_TREE: SpriteDef = {
    pixels: [
        '................',
        '.....DDhDD......',
        '....DhLLLhDD....',
        '...DLLLLLLLMD...',
        '..hLLMMMMMMLLD..',
        '..LLMMMMMMMMLh..',
        '.DLLMMMMMMDDMDL.',
        '.hLMMMMMDDDDDh..',
        '..LMMMMMDDDDL...',
        '...LLMMDDDLL....',
        '....DLhLLhLD....',
        '.....DDDDDD.....',
        '........kkk.....',
        '........kkk.....',
        '........kkk.....',
        '................',
    ],
    palette: {
        '.': '#4a8b3a',
        D: '#1a3a1a',
        L: '#3a7a3a',
        M: '#2a5a2a',
        h: '#5aaa5a',
        k: '#4a2a1a',
    },
};

const TILE_DIRT: SpriteDef = {
    pixels: [
        '................',
        '..D.......D.....',
        '................',
        '......D.........',
        '...D............',
        '................',
        '..D.............',
        '................',
        '........D.......',
        '................',
        '......D.........',
        '................',
        '..D.............',
        '........D.......',
        '...D............',
        '................',
    ],
    palette: { '.': '#6a4a2a', D: '#3a1a0a' },
};

const TILE_WALL: SpriteDef = {
    pixels: [
        'WWWWWWWWWWWWWWWW',
        'WbbbbWbbbbWbbbbW',
        'WbWbWbWbWbWbWbWb',
        'WbbbbWbbbbWbbbbW',
        'WWWWWWWWWWWWWWWW',
        'WbbbbWbbbbWbbbbW',
        'WbWbWbWbWbWbWbWb',
        'WbbbbWbbbbWbbbbW',
        'WWWWWWWWWWWWWWWW',
        'WbbbbWbbbbWbbbbW',
        'WbWbWbWbWbWbWbWb',
        'WbbbbWbbbbWbbbbW',
        'WWWWWWWWWWWWWWWW',
        'WbbbbWbbbbWbbbbW',
        'WbWbWbWbWbWbWbWb',
        'WWWWWWWWWWWWWWWW',
    ],
    palette: { W: '#1a1a1a', b: '#909090' },
};

const TILE_FLOOR: SpriteDef = {
    pixels: [
        'PPPPPPPPPPPPPPPP',
        'PWWWWWWWWWWWWWWP',
        'PWWWWWWWWWWWWWWP',
        'PPPPPPPPPPPPPPPP',
        'PWWWWWWWWWWWWWWP',
        'PWWWWWWWWWWWWWWP',
        'PPPPPPPPPPPPPPPP',
        'PWWWWWWWWWWWWWWP',
        'PWWWWWWWWWWWWWWP',
        'PPPPPPPPPPPPPPPP',
        'PWWWWWWWWWWWWWWP',
        'PWWWWWWWWWWWWWWP',
        'PPPPPPPPPPPPPPPP',
        'PWWWWWWWWWWWWWWP',
        'PWWWWWWWWWWWWWWP',
        'PPPPPPPPPPPPPPPP',
    ],
    palette: { P: '#5a3a1a', W: '#a08060' },
};

const TILE_TILLED: SpriteDef = {
    pixels: [
        '................',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
        '..F........F....',
    ],
    palette: { '.': '#6a4022', F: '#3a1a08' },
};

const TILE_SNOW: SpriteDef = {
    pixels: [
        '................',
        '...S............',
        '................',
        '..........S.....',
        '................',
        '......S.........',
        '................',
        '..S.............',
        '................',
        '........S.......',
        '................',
        '.....S..........',
        '................',
        '...S............',
        '................',
        '..........S.....',
    ],
    palette: { '.': '#f0f0f8', S: '#a8c0e0' },
};

// ----------------------------------------------------------------------------
// Registration
// ----------------------------------------------------------------------------

export function registerAllPixelSprites (scene: Scene): void
{
    registerPixelSprite(scene, 'settler-red', SETTLERS.red.idle);
    registerPixelSprite(scene, 'settler-red-walk-a', SETTLERS.red.walkA);
    registerPixelSprite(scene, 'settler-red-walk-b', SETTLERS.red.walkB);
    registerPixelSprite(scene, 'settler-blue', SETTLERS.blue.idle);
    registerPixelSprite(scene, 'settler-blue-walk-a', SETTLERS.blue.walkA);
    registerPixelSprite(scene, 'settler-blue-walk-b', SETTLERS.blue.walkB);
    registerPixelSprite(scene, 'settler-green', SETTLERS.green.idle);
    registerPixelSprite(scene, 'settler-green-walk-a', SETTLERS.green.walkA);
    registerPixelSprite(scene, 'settler-green-walk-b', SETTLERS.green.walkB);
    registerPixelSprite(scene, 'settler-orange', SETTLERS.orange.idle);
    registerPixelSprite(scene, 'settler-orange-walk-a', SETTLERS.orange.walkA);
    registerPixelSprite(scene, 'settler-orange-walk-b', SETTLERS.orange.walkB);

    registerPixelSprite(scene, 'stone', ITEM_STONE);
    registerPixelSprite(scene, 'food', ITEM_FOOD);
    registerPixelSprite(scene, 'wood', ITEM_WOOD);

    registerPixelSprite(scene, 'tile-empty', TILE_EMPTY);
    registerPixelSprite(scene, 'tile-dirt', TILE_DIRT);
    registerPixelSprite(scene, 'tile-grass-a', TILE_GRASS_A);
    registerPixelSprite(scene, 'tile-grass-b', TILE_GRASS_B);
    registerPixelSprite(scene, 'tile-grass-c', TILE_GRASS_C);
    registerPixelSprite(scene, 'tile-stone', TILE_STONE);
    registerPixelSprite(scene, 'tile-water', TILE_WATER);
    registerPixelSprite(scene, 'tile-sand', TILE_SAND);
    registerPixelSprite(scene, 'tile-tree', TILE_TREE);
    registerPixelSprite(scene, 'tile-wall', TILE_WALL);
    registerPixelSprite(scene, 'tile-floor', TILE_FLOOR);
    registerPixelSprite(scene, 'tile-tilled', TILE_TILLED);
    registerPixelSprite(scene, 'tile-snow', TILE_SNOW);
}

export const TILE_VARIANT_KEYS: Partial<Record<number, string[]>> = {
    [TileType.Grass]: ['tile-grass-a', 'tile-grass-b', 'tile-grass-c'],
};

export function getTileTextureKey (type: TileType, tx: number, ty: number): string
{
    const variants = TILE_VARIANT_KEYS[type];
    if (variants && variants.length > 0)
    {
        const h = (tx * 73856093) ^ (ty * 19349663);
        return variants[Math.abs(h) % variants.length];
    }
    return TILE_TEXTURE_KEYS[type] ?? 'tile-empty';
}

export const TILE_TEXTURE_KEYS: Record<number, string> = {
    [TileType.Empty]: 'tile-empty',
    [TileType.Dirt]: 'tile-dirt',
    [TileType.Grass]: 'tile-grass',
    [TileType.Stone]: 'tile-stone',
    [TileType.Water]: 'tile-water',
    [TileType.Sand]: 'tile-sand',
    [TileType.Tree]: 'tile-tree',
    [TileType.Wall]: 'tile-wall',
    [TileType.Floor]: 'tile-floor',
    [TileType.TilledSoil]: 'tile-tilled',
    [TileType.Snow]: 'tile-snow',
};

export const ITEM_TEXTURE_KEYS: Record<string, string> = {
    stone: 'stone',
    food: 'food',
    wood: 'wood',
};
