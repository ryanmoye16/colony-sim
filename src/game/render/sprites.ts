// =============================================================================
// Pixel Art — Master Palette & Sprite Definitions
// =============================================================================
// All sprites in the game draw from a single shared ~32-color master palette.
// This keeps the world visually unified and lets us tune mood by tweaking
// palette entries.
//
// Each sprite is a character grid (1 char = 1 pixel) with a palette map that
// translates characters to hex colors. The grid is rendered pixel-by-pixel into
// a CanvasTexture via Phaser's `addCanvas`.
//
// Shading model: light comes from top-left.
//   - Base color   = the local tone
//   - Highlight    = +1 lighter step, placed on top/left edges
//   - Shadow       = -1 darker step, placed on bottom/right edges
//   - Outline      = darkest tone in the family, used sparingly for silhouette
// =============================================================================

import type { Scene } from 'phaser';
import { TileType } from '../world/tile';

// -----------------------------------------------------------------------------
// Master palette (32 colors)
// Grouped by semantic family. Indices are stable — reordering will break
// existing lookups. Append new colors, never reorder.
// -----------------------------------------------------------------------------

export const PALETTE = {
    // Skin (5 tones)
    skinHi:      '#fce0c4',
    skinBase:    '#e8b89a',
    skinMid:     '#c89274',
    skinShd:     '#8e5a3e',
    skinOut:     '#5e3422',

    // Hair (3 tones — used across all hair colors)
    hairHi:      '#7a4a2a',
    hairBase:    '#4a2614',
    hairShd:     '#2a1408',

    // Boots / leather (3 tones)
    bootHi:      '#5a3a1a',
    bootBase:    '#3a2410',
    bootShd:     '#1f1408',

    // Belt (1 tone)
    belt:        '#2a1a08',

    // Earth / dirt (5 tones)
    earthHi:     '#a08060',
    earthBase:   '#7a5a3a',
    earthMid:    '#5a3a20',
    earthShd:    '#3a2210',
    earthOut:    '#1f1408',

    // Grass (4 tones)
    grassHi:     '#a8d860',
    grassBase:   '#74a838',
    grassMid:    '#4e7820',
    grassShd:    '#2e4e10',

    // Tree canopy (5 tones — for shaded trees)
    leafHi:      '#8ed058',
    leafBase:    '#5e9828',
    leafMid:     '#3e7018',
    leafShd:     '#244e0c',
    leafOut:     '#143008',

    // Wood (4 tones — for logs/trunks)
    woodHi:      '#c89060',
    woodBase:    '#9a6234',
    woodMid:     '#6a3e1c',
    woodShd:     '#3a2008',

    // Stone (5 tones)
    stoneHi:     '#c8c8d0',
    stoneBase:   '#909098',
    stoneMid:    '#686870',
    stoneShd:    '#3e3e46',
    stoneOut:    '#1e1e26',

    // Water (4 tones)
    waterHi:     '#8ed0f8',
    waterBase:   '#5890c8',
    waterMid:    '#3868a0',
    waterShd:    '#1e3e6e',

    // Sand (4 tones)
    sandHi:      '#f4e0a8',
    sandBase:    '#dcc078',
    sandMid:     '#b89048',
    sandShd:    '#8a6428',

    // Snow (4 tones)
    snowHi:      '#ffffff',
    snowBase:    '#e8ecf4',
    snowMid:     '#bcc4d8',
    snowShd:    '#7e8aa8',

    // Masonry (wall + floor) (4 tones)
    stoneMHi:    '#a8a8b0',
    stoneMBase:  '#7a7a82',
    stoneMMid:   '#52525a',
    stoneMShd:   '#2e2e36',

    // Iron / dark metal accents (used in items)
    iron:        '#404048',
    ironHi:      '#686870',

    // Generic utility
    white:       '#f8f8f8',
    black:       '#080808',
    void:        '#0a0a0e', // unfilled tile void color
} as const;

export type PaletteKey = keyof typeof PALETTE;

// -----------------------------------------------------------------------------
// Sprite definition
// -----------------------------------------------------------------------------

interface SpriteDef {
    pixels: string[];
    palette: Record<string, string>;
    /**
     * If true, '.' is treated as fully transparent (no fill).
     * If false (default), '.' is filled with the palette '.' key.
     */
    transparentDot?: boolean;
}

function renderToCanvas(sprite: SpriteDef): HTMLCanvasElement {
    const w = sprite.pixels[0].length;
    const h = sprite.pixels.length;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    for (let y = 0; y < h; y++) {
        const row = sprite.pixels[y];
        for (let x = 0; x < w; x++) {
            const c = row[x];
            if (c === ' ' || c === '.') {
                if (sprite.transparentDot && c === '.') continue;
                const color = sprite.palette[c];
                if (!color) continue;
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            } else {
                const color = sprite.palette[c];
                if (!color) continue;
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    return canvas;
}

export function registerPixelSprite(scene: Scene, key: string, sprite: SpriteDef): void {
    if (scene.textures.exists(key)) return;
    const canvas = renderToCanvas(sprite);
    scene.textures.addCanvas(key, canvas);
}

// -----------------------------------------------------------------------------
// Common palette shortcuts for settlers
// -----------------------------------------------------------------------------
// Every settler uses these key meanings:
//   h = hair shadow, H = hair base, j = hair highlight
//   s = skin shadow, S = skin base, f = skin highlight
//   t = shirt shadow, T = shirt base, u = shirt highlight
//   p = pants shadow, P = pants base, q = pants highlight
//   b = boot shadow, B = boot base
//   e = eye (dark)
//   m = mouth
//   l = belt/leather
//   o = outline (very dark brown — used for silhouette)
//   ' ' = transparent
//   . = transparent (alias)
// -----------------------------------------------------------------------------

const SKIN_PALETTE: Record<string, string> = {
    f: PALETTE.skinHi,
    S: PALETTE.skinBase,
    s: PALETTE.skinMid,
    X: PALETTE.skinShd,
    o: PALETTE.skinOut,
};

const HAIR_DARK: Record<string, string> = { j: PALETTE.hairHi, H: PALETTE.hairBase, h: PALETTE.hairShd };
const HAIR_BROWN: Record<string, string> = { j: '#b88a5a', H: '#7a4a2a', h: PALETTE.hairShd };
const HAIR_BLOND: Record<string, string> = { j: '#f4d880', H: PALETTE.hairHi, h: PALETTE.hairBase };
const HAIR_GREY: Record<string, string> = { j: '#c0c0c0', H: '#888888', h: '#4a4a4a' };
const HAIR_RED: Record<string, string> = { j: '#e08060', H: '#a04020', h: '#5a2008' };

const BOOTS: Record<string, string> = { B: PALETTE.bootBase, b: PALETTE.bootShd };
const BELT: Record<string, string> = { l: PALETTE.belt };

const EYES_MOUTH: Record<string, string> = { e: PALETTE.black, m: '#8e5a3e' };

const PANTS: Record<string, string> = { q: '#7a6238', P: PALETTE.earthMid, p: PALETTE.earthShd };

const OUTFIT: Record<string, string> = { o: PALETTE.skinOut };

// Hat palette — wide-brim felt hat. Three tones for depth.
const HAT: Record<string, string> = {
    W: '#7a4a26',  // hat brim highlight
    K: '#4a2a10',  // hat body
    M: '#2a1408',  // hat shadow (reserved)
};

// Common base — every settler shares skin, eyes, boots, pants, belt, outline.
const SETTLER_BASE_PALETTE: Record<string, string> = {
    ...SKIN_PALETTE,
    ...BOOTS,
    ...BELT,
    ...EYES_MOUTH,
    ...PANTS,
    ...OUTFIT,
    ...HAT,
};

function buildSettlerPalettes(hairPalette: Record<string, string>, shirt: Record<string, string>): Record<string, string> {
    return {
        ...SETTLER_BASE_PALETTE,
        ...hairPalette,
        ...shirt,
    };
}

// Shirt palettes — base, mid (shadow), highlight. Key letters:
//   u = shirt highlight, T = shirt base, t = shirt shadow
const SHIRT_RED:    Record<string, string> = { u: '#ff7878', T: '#cc3838', t: '#881818' };
const SHIRT_BLUE:   Record<string, string> = { u: '#80a8ff', T: '#3860c8', t: '#1c3890' };
const SHIRT_GREEN:  Record<string, string> = { u: '#80d880', T: '#389048', t: '#186028' };
const SHIRT_ORANGE: Record<string, string> = { u: '#ffc080', T: '#cc7838', t: '#884818' };
const SHIRT_PURPLE: Record<string, string> = { u: '#c898e0', T: '#7838a8', t: '#481868' };

const SETTLER_VARIANTS = {
    red:    { hair: HAIR_BROWN,  shirt: SHIRT_RED },
    blue:   { hair: HAIR_BLOND,  shirt: SHIRT_BLUE },
    green:  { hair: HAIR_DARK,   shirt: SHIRT_GREEN },
    orange: { hair: HAIR_RED,    shirt: SHIRT_ORANGE },
    purple: { hair: HAIR_GREY,   shirt: SHIRT_PURPLE },
} as const;

type SettlerColor = keyof typeof SETTLER_VARIANTS;

// -----------------------------------------------------------------------------
// SETTLER SPRITES — 16x16, 4 directions (South, East, North, West),
// 4 frames per direction (idle, walk-a, walk-b, carry).
// -----------------------------------------------------------------------------
// Conventions:
//   South  = facing the camera, you see face + body
//   East   = facing right, you see profile, eye visible
//   North  = facing away, you see back of head + body
//   West   = facing left, mirror of East
// Light source: top-left. Highlights on top/left, shadows on bottom/right.
// -----------------------------------------------------------------------------

// SOUTH (front-facing) — idle frame
const SETTLER_S_IDLE = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.', // hair top edge
    '.oSSfsSSSfsSffXo', // forehead
    '.ofSfffSfffSffXo', // forehead band
    '.oSfeeSfeeSffXXo', // eyes
    '.ofSffSffSffSffXo',
    '.oSSSmmmSSSXffXo', // mouth/nose
    '..oSSSSSSSSSXXo.', // chin
    '..ouuuTTuuuuutX.', // shirt top
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo', // belt + pants top
    '.oPo.oPo.oPo.oPo', // legs
];

// South walk A — right leg forward, left leg back
const SETTLER_S_WALK_A = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSSfsSSSfsSffXo',
    '.ofSfffSfffSffXo',
    '.oSfeeSfeeSffXXo',
    '.ofSffSffSffSffXo',
    '.oSSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPoooPoooPoooPo', // shifted
];

// Long-hair variants — same head, hair extends down past the shoulders.
const SETTLER_S_LONG_IDLE = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSSfsSSSfsSffXo',
    '.ofSfffSfffSffXo',
    '.oSfeeSfeeSffXXo',
    '.ofSffSffSffSffXo',
    '.oSSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..HHHHTTTTHHHH.',  // hair drapes on shoulders
    '.HHHHHTTTTHHHHH', // hair drapes wider
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPo.oPo.oPo.oPo',
];

const SETTLER_S_LONG_WALK_A = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSSfsSSSfsSffXo',
    '.ofSfffSfffSffXo',
    '.oSfeeSfeeSffXXo',
    '.ofSffSffSffSffXo',
    '.oSSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..HHHHTTTTHHHH.',
    '.HHHHHTTTTHHHHH',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPoooPoooPoooPo',
];

const SETTLER_S_LONG_WALK_B = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSSfsSSSfsSffXo',
    '.ofSfffSfffSffXo',
    '.oSfeeSfeeSffXXo',
    '.ofSffSffSffSffXo',
    '.oSSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..HHHHTTTTHHHH.',
    '.HHHHHTTTTHHHHH',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.ooPoooPoooPoooP',
];

// Bald variants — no top hair, just sides.
const SETTLER_S_BALD_IDLE = [
    '................',
    '................',
    '...oSSSSSSSo...',
    '..oSSffSffSSo..',
    '.oSSffSffSffSSo',
    '.oSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSSSmmmSSSXffo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPo.oPo.oPo.oPo',
];

const SETTLER_S_BALD_WALK_A = [
    '................',
    '................',
    '...oSSSSSSSo...',
    '..oSSffSffSSo..',
    '.oSSffSffSffSSo',
    '.oSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSSSmmmSSSXffo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPoooPoooPoooPo',
];

const SETTLER_S_BALD_WALK_B = [
    '................',
    '................',
    '...oSSSSSSSo...',
    '..oSSffSffSSo..',
    '.oSSffSffSffSSo',
    '.oSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSSSmmmSSSXffo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.ooPoooPoooPoooP',
];

// Hat variants — wide-brim hat covers the top of the head. Uses W/K/M
// (uniquely for hat) so the palette is unambiguous.
const SETTLER_S_HAT_IDLE = [
    '................',
    '...WWWWWWWWWW...',
    '..WKkkkkkkkkKW..',
    '.WKkSffSffSffkKW',
    '.oSSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSfeeSfeeSffXXo',
    '.ofSffSffSffSffo',
    '.oSSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPo.oPo.oPo.oPo',
    '................',
];

const SETTLER_S_HAT_WALK_A = [
    '................',
    '...WWWWWWWWWW...',
    '..WKkkkkkkkkKW..',
    '.WKkSffSffSffkKW',
    '.oSSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSfeeSfeeSffXXo',
    '.ofSffSffSffSffo',
    '.oSSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPoooPoooPoooPo',
    '................',
];

const SETTLER_S_HAT_WALK_B = [
    '................',
    '...WWWWWWWWWW...',
    '..WKkkkkkkkkKW..',
    '.WKkSffSffSffkKW',
    '.oSSfeeSfeeSffXo',
    '.ofSffSffSffSffo',
    '.oSfeeSfeeSffXXo',
    '.ofSffSffSffSffo',
    '.oSSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.ooPoooPoooPoooP',
    '................',
];

// South walk B — left leg forward, right leg back
const SETTLER_S_WALK_B = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSSfsSSSfsSffXo',
    '.ofSfffSfffSffXo',
    '.oSfeeSfeeSffXXo',
    '.ofSffSffSffSffXo',
    '.oSSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.ooPoooPoooPoooP', // legs shifted other way
];

// -----------------------------------------------------------------------------
// TILE SPRITES — 16x16
// -----------------------------------------------------------------------------
// Each tile uses '.' as the dominant base color (no transparency, fully tiled)
// and other letters as detail dots/shapes on top.
// -----------------------------------------------------------------------------

// Empty void (unrevealed / unloaded)
const TILE_EMPTY: SpriteDef = {
    pixels: Array(16).fill('................'),
    palette: { '.': PALETTE.void },
};

// GRASS — 4 variants for visual variety when tiled.
// Each has scattered grass blades on a solid grass base. Light top edge and
// shadow bottom edge give a subtle "raised tile" feel. Left/right edges use
// the same mid color so adjacent tiles blend without harsh vertical lines.
function makeGrassVariant(seed: number): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) {
            const isTop = y === 0;
            const isBottom = y === 15;
            const isLeft = x === 0;
            const isRight = x === 15;
            if (isTop) { row += 'l'; continue; }
            if (isBottom) { row += 'd'; continue; }
            if (isLeft || isRight) { row += 'g'; continue; }
            const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
            const v = h % 100;
            if (v < 60) row += '.';        // base grass
            else if (v < 75) row += 'd';   // darker grass blade
            else if (v < 88) row += 'g';   // mid-tone grass
            else row += 'l';               // light highlight grass
        }
        rows.push(row);
    }
    return rows;
}

// GRASS-with-decorations — 3 variants: flower, rock, mushroom. Each overlays
// a small decoration on the base grass pattern, placed at a seeded position.
function makeDecoratedGrass(seed: number, deco: 'flower' | 'rock' | 'mushroom'): string[] {
    const rows = makeGrassVariant(seed);
    // Pick a small cluster of pixels for the decoration (avoid edges).
    const h = ((seed * 246343) ^ 0xbeef) >>> 0;
    const cx = 4 + (h % 8); // 4..11
    const cy = 4 + ((h >>> 4) % 8);
    if (deco === 'flower')
    {
        // tiny pink/yellow flower
        rows[cy]   = rows[cy].slice(0, cx)   + 'p' + rows[cy].slice(cx + 1);
        rows[cy-1] = rows[cy-1].slice(0, cx) + 'y' + rows[cy-1].slice(cx + 1);
        rows[cy+1] = rows[cy+1].slice(0, cx) + 'y' + rows[cy+1].slice(cx + 1);
        rows[cy]   = rows[cy].slice(0, cx-1) + 'y' + rows[cy].slice(cx);
        rows[cy]   = rows[cy].slice(0, cx+1) + 'y' + rows[cy].slice(cx + 2);
    }
    else if (deco === 'rock')
    {
        // 3x2 gray rock cluster
        const placements: Array<[number, number, string]> = [
            [0, 0, 'r'], [1, 0, 'r'], [2, 0, 'r'],
            [0, 1, 'R'], [1, 1, 'R'], [2, 1, 'r'],
        ];
        for (const [dx, dy, ch] of placements)
        {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 15 && y < 15 && x > 0 && y > 0)
            {
                rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
            }
        }
    }
    else
    {
        // mushroom: red cap with white dots, brown stem
        rows[cy]   = rows[cy].slice(0, cx-1) + 'M' + rows[cy].slice(cx);
        rows[cy]   = rows[cy].slice(0, cx)   + 'M' + rows[cy].slice(cx + 1);
        rows[cy]   = rows[cy].slice(0, cx+1) + 'M' + rows[cy].slice(cx + 2);
        rows[cy+1] = rows[cy+1].slice(0, cx) + 'W' + rows[cy+1].slice(cx + 1);
        rows[cy+2] = rows[cy+2].slice(0, cx) + 'k' + rows[cy+2].slice(cx + 1);
        rows[cy+3] = rows[cy+3].slice(0, cx) + 'k' + rows[cy+3].slice(cx + 1);
    }
    return rows;
}

const GRASS_VARIANTS: string[][] = [
    makeGrassVariant(1),
    makeGrassVariant(2),
    makeGrassVariant(3),
    makeGrassVariant(4),
    makeDecoratedGrass(101, 'flower'),
    makeDecoratedGrass(202, 'rock'),
    makeDecoratedGrass(303, 'mushroom'),
];

// Dirt — base brown with cracks and small pebbles. Top highlight, bottom shadow,
// left/right mid so adjacent tiles blend without harsh borders.
function makeDirtVariant(seed: number): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) {
            const isTop = y === 0;
            const isBottom = y === 15;
            const isLeft = x === 0;
            const isRight = x === 15;
            if (isTop) { row += 'h'; continue; }
            if (isBottom) { row += 'd'; continue; }
            if (isLeft || isRight) { row += '.'; continue; }
            const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
            const v = h % 100;
            if (v < 55) row += '.';          // base dirt
            else if (v < 70) row += 'h';     // highlight grain
            else if (v < 88) row += 'd';     // dark shadow
            else row += 's';                 // pebble accent
        }
        rows.push(row);
    }
    return rows;
}

const DIRT_VARIANTS: string[][] = [makeDirtVariant(1), makeDirtVariant(2)];

// Stone — multi-tone with chips. Top highlight, bottom outline, left/right mid
// (uses stoneShd for natural shadow band) so adjacent tiles blend.
function makeStoneVariant(seed: number): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) {
            const isTop = y === 0;
            const isBottom = y === 15;
            const isLeft = x === 0;
            const isRight = x === 15;
            if (isTop) { row += 'h'; continue; }
            if (isBottom) { row += 'o'; continue; }
            if (isLeft || isRight) { row += 'd'; continue; }
            const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
            const v = h % 100;
            if (v < 50) row += '.';          // base stone
            else if (v < 65) row += 'h';     // highlight chip
            else if (v < 82) row += 'd';     // shadow chip
            else if (v < 92) row += 'o';     // outline crack
            else row += 'o';                 // crack
        }
        rows.push(row);
    }
    return rows;
}

const STONE_VARIANTS: string[][] = [makeStoneVariant(1), makeStoneVariant(2), makeStoneVariant(3)];

// Water — base blue with wave highlights and depth shadows. Top highlight, bottom
// depth shadow, left/right mid so adjacent tiles blend smoothly.
function makeWaterVariant(seed: number): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) {
            const isTop = y === 0;
            const isBottom = y === 15;
            const isLeft = x === 0;
            const isRight = x === 15;
            if (isTop) { row += 'h'; continue; }
            if (isBottom) { row += 'd'; continue; }
            if (isLeft || isRight) { row += 'b'; continue; }
            const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
            const v = h % 100;
            if (v < 45) row += '.';          // base water
            else if (v < 60) row += 'd';     // depth shadow
            else if (v < 82) row += 'b';     // base mid-tone
            else row += 'h';                 // wave highlight
        }
        rows.push(row);
    }
    return rows;
}

const WATER_VARIANTS: string[][] = [makeWaterVariant(1), makeWaterVariant(2)];

// Sand — base tan with grain dots, shadow specks. Top highlight, bottom shadow,
// left/right mid so adjacent tiles blend.
function makeSandVariant(seed: number): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) {
            const isTop = y === 0;
            const isBottom = y === 15;
            const isLeft = x === 0;
            const isRight = x === 15;
            if (isTop) { row += 'h'; continue; }
            if (isBottom) { row += 'd'; continue; }
            if (isLeft || isRight) { row += '.'; continue; }
            const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
            const v = h % 100;
            if (v < 65) row += '.';          // base sand
            else if (v < 80) row += 'h';     // light grain
            else if (v < 92) row += 'd';     // shadow grain
            else row += 's';                 // dark speck
        }
        rows.push(row);
    }
    return rows;
}

const SAND_VARIANTS: string[][] = [makeSandVariant(1), makeSandVariant(2)];

// Snow — base white with cool blue shadow drifts
function makeSnowVariant(seed: number): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) {
            const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
            const v = h % 100;
            if (v < 65) row += '.';          // base snow
            else if (v < 80) row += 'h';     // bright highlight
            else if (v < 95) row += 'd';     // cool shadow
            else row += 's';                 // blue speck
        }
        rows.push(row);
    }
    return rows;
}

const SNOW_VARIANTS: string[][] = [makeSnowVariant(1), makeSnowVariant(2)];

// Tilled soil — base brown with horizontal furrow rows
const TILE_TILLED: SpriteDef = {
    pixels: [
        '................',
        '..F........F....',
        '................',
        '....F......F....',
        '................',
        '..F........F....',
        '................',
        '....F......F....',
        '................',
        '..F........F....',
        '................',
        '....F......F....',
        '................',
        '..F........F....',
        '................',
        '....F......F....',
    ],
    palette: {
        '.': '#5a3a20',
        F: '#2a1808',
    },
};

// Tree — multi-tone canopy with depth, trunk visible at base.
// Trees replace the underlying grass tile (TileType.Tree), so the base
// pixels of this sprite should be grass so the world doesn't show void
// between trees when they tile adjacent.
const TILE_TREE: SpriteDef = {
    pixels: [
        '..gg........gg.',
        '...hDDhDD......',
        '...hDLLLLhDD...',
        '..hLLLLLLLMMD..',
        '..hLLMMMMMMLLD.',
        '..LLMMMMMMMMMLh',
        '.hLMMMMMMMMDDDL',
        '.LLMMMMMMDDDDDh',
        '..LMMMMMDDDDDL.',
        '...LLMMDDDDLL..',
        '....DLhLLhLD...',
        '.....DDDDDD....',
        '......HHHHH....', // trunk highlight
        '......HHHHH....', // trunk base
        '......Hhhhh....', // trunk shadow
        '..gg........gg.',
    ],
    palette: {
        '.': PALETTE.grassBase,
        g: PALETTE.grassMid,
        h: PALETTE.leafHi,
        L: PALETTE.leafBase,
        M: PALETTE.leafMid,
        D: PALETTE.leafShd,
        H: PALETTE.woodBase,
        o: PALETTE.leafOut,
    },
};

// Pine tree — tall triangular silhouette, darker overall.
const TILE_TREE_PINE: SpriteDef = {
    pixels: [
        '..gg........gg.',
        '......DD......',
        '.....DhhD.....',
        '....DhLLhD....',
        '...DhLLLLhD...',
        '...hLLMMMLhD..',
        '..hLLMMDDLLD..',
        '..LLMMDDDLLD..',
        '.hLMMMDDDLLD...',
        '.hLMDDDDLLD....',
        '.hLMDDDLLD.....',
        '.hLDDDLLD......',
        '.hDDDDDD.......',
        '...DDhDDD......',
        '...HHHhH.......',
        '..gg.......gg..',
    ],
    palette: {
        '.': PALETTE.grassBase,
        g: PALETTE.grassMid,
        h: PALETTE.leafHi,
        L: PALETTE.leafBase,
        M: PALETTE.leafMid,
        D: PALETTE.leafShd,
        H: PALETTE.woodBase,
    },
};

// Small bush — short round canopy, no trunk.
const TILE_BUSH: SpriteDef = {
    pixels: [
        '..gg........gg.',
        '..gDDhDDhDDg...',
        '.gDLLLLLLLDDg..',
        '.hLLMMMMMMLLDg.',
        '.hLMMMMMMMMDD..',
        '..LMMMMMMDD....',
        '..hLMMMMDD.....',
        '...hLMDD.......',
        '...DDD.........',
        '..gg........gg.',
        '..gg........gg.',
        '..gg........gg.',
        '..gg........gg.',
        '..gg........gg.',
        '..gg........gg.',
        '..gg........gg.',
    ],
    palette: {
        '.': PALETTE.grassBase,
        g: PALETTE.grassMid,
        h: PALETTE.leafHi,
        L: PALETTE.leafBase,
        M: PALETTE.leafMid,
        D: PALETTE.leafShd,
    },
};

// Sand-water edge — sand on top half, water on bottom half. Used at coastlines.
const TILE_SAND_WATER: SpriteDef = {
    pixels: [
        '..hh..........',
        '..h.h.........',
        '...h..........',
        '....h.........',
        '.....h........',
        '......h.......',
        '.......h......',
        '........h.....',
        '.........h....',
        '..........b...',
        '...........b..',
        '............b.',
        '...........bb.',
        '..d........bb.',
        '.dd..........b',
        'dd............',
    ],
    palette: {
        '.': PALETTE.sandBase,
        'h': PALETTE.sandHi,
        'd': PALETTE.sandShd,
        b: PALETTE.waterBase,
    },
};

// Grass-sand edge — grass on top, sand on bottom, with small grass tufts
// in the transition.
const TILE_GRASS_SAND: SpriteDef = {
    pixels: [
        'gg............',
        '.gg...........',
        '..gg..........',
        '...gg.........',
        '....gg........',
        '.....gg.......',
        '......gg......',
        '.......gg.....',
        '........gg....',
        '.........g....',
        '..........d...',
        '...........d..',
        '..h.........d.',
        '............d.',
        '..........h...',
        '..............',
    ],
    palette: {
        '.': PALETTE.grassBase,
        g: PALETTE.grassMid,
        'd': PALETTE.sandShd,
        'h': PALETTE.sandHi,
    },
};

// Wall — masonry pattern. Procedural variants based on neighbor configuration.
// Neighbor flags: N=8, E=4, S=2, W=1 → 0..15.
// At exposed edges, a darker 'o' cap is added (top/bottom row or left/right col).
function makeWallVariant (n: 0 | 1, e: 0 | 1, s: 0 | 1, w: 0 | 1): SpriteDef
{
    // Brick pattern base (no caps)
    const base: string[] = [
        'HHHHHHHHHHHHHHHH', // 0
        'HhhhhhhhhhhhhhhH', // 1
        'HhhhhhhhhhhhhhhH', // 2
        'HhhhhhhhhhhhhhhH', // 3
        'HhhhhhhhhhhhhhhH', // 4
        'HhHhhhhhhhhhhHh', // 5 (offset brick)
        'HhHhhhhhhhhhhHh', // 6
        'HHHHHHHHHHHHHHHH', // 7 (horizontal mortar)
        'HhhhhhhhhhhhhhhH', // 8
        'HhhhhhhhhhhhhhhH', // 9
        'HhHhhhhhhhhhhHh', // 10
        'HhHhhhhhhhhhhHh', // 11
        'HhhhhhhhhhhhhhhH', // 12
        'HHHHHHHHHHHHHHHH', // 13 (mortar)
        'HHHHHHHHHHHHHHHH', // 14
        'HHHHHHHHHHHHHHHH', // 15
    ];
    // Add caps (o) on edges that have no wall neighbor
    const out = base.map((r) => r.split(''));
    if (!n) for (let x = 0; x < 16; x++) out[0][x]  = 'o';
    if (!s) for (let x = 0; x < 16; x++) out[15][x] = 'o';
    if (!w) for (let y = 0; y < 16; y++) out[y][0]  = 'o';
    if (!e) for (let y = 0; y < 16; y++) out[y][15] = 'o';
    // Always have an outline at the very corners (so cap is visible)
    return { pixels: out.map((r) => r.join('')), palette: {
        o: PALETTE.stoneMShd,
        H: PALETTE.stoneMHi,
        h: PALETTE.stoneMBase,
    } };
}

const TILE_WALL = makeWallVariant(1, 0, 1, 0);
const TILE_WALL_END_N   = makeWallVariant(0, 0, 1, 0);
const TILE_WALL_END_E   = makeWallVariant(1, 0, 1, 1);
const TILE_WALL_END_S   = makeWallVariant(1, 0, 0, 0);
const TILE_WALL_END_W   = makeWallVariant(1, 1, 1, 0);
const TILE_WALL_CORNER_NE = makeWallVariant(0, 0, 1, 1);
const TILE_WALL_CORNER_NW = makeWallVariant(0, 1, 1, 0);
const TILE_WALL_CORNER_SE = makeWallVariant(1, 0, 0, 1);
const TILE_WALL_CORNER_SW = makeWallVariant(1, 1, 0, 0);
const TILE_WALL_T_N   = makeWallVariant(1, 0, 0, 1);
const TILE_WALL_T_E   = makeWallVariant(1, 1, 1, 1);
const TILE_WALL_T_S   = makeWallVariant(0, 0, 0, 1);
const TILE_WALL_T_W   = makeWallVariant(0, 1, 1, 1);
const TILE_WALL_CROSS = makeWallVariant(0, 0, 0, 0);
const TILE_WALL_STRAIGHT_H = makeWallVariant(1, 0, 1, 0); // same as TILE_WALL
const TILE_WALL_STRAIGHT_V = makeWallVariant(0, 1, 0, 1);

// Map (n,e,s,w) booleans to a wall texture key.
export function WALL_TEXTURE_KEY (n: number, e: number, s: number, w: number): string
{
    // n=8, e=4, s=2, w=1
    const code = (n ? 8 : 0) | (e ? 4 : 0) | (s ? 2 : 0) | (w ? 1 : 0);
    switch (code)
    {
        case 0b0000: return 'tile-wall-cross';   // all 4 sides exposed (isolated, no cap) - actually this is the cap-on-all-sides
        case 0b0001: return 'tile-wall-end-e';    // W only
        case 0b0010: return 'tile-wall-end-w';    // S only
        case 0b0011: return 'tile-wall-corner-se'; // S+W
        case 0b0100: return 'tile-wall-end-s';    // E only
        case 0b0101: return 'tile-wall-straight-h'; // E+W
        case 0b0110: return 'tile-wall-corner-sw'; // S+E
        case 0b0111: return 'tile-wall-t-e';      // S+E+W (no N)
        case 0b1000: return 'tile-wall-end-n';    // N only
        case 0b1001: return 'tile-wall-corner-ne'; // N+W
        case 0b1010: return 'tile-wall-straight-v'; // N+S
        case 0b1011: return 'tile-wall-t-w';      // N+S+W (no E)
        case 0b1100: return 'tile-wall-corner-nw'; // N+E
        case 0b1101: return 'tile-wall-t-s';      // N+E+W (no S)
        case 0b1110: return 'tile-wall-t-n';      // N+E+S (no W)
        case 0b1111: return 'tile-wall';          // all sides connect
        default: return 'tile-wall';
    }
}

// Floor — wood plank pattern with shaded gaps
const TILE_FLOOR: SpriteDef = {
    pixels: [
        'HHHHHHHHHHHHHHHH',
        'HhhhhhhhhhhhhhhH',
        'HhhhhhhhhhhhhhhH',
        'HhhhhhhhhhhhhhhH',
        'oooooooooooooooo',
        'HHHHHHHHHHHHHHHH',
        'HhhhhhhhhhhhhhhH',
        'HhhhhhhhhhhhhhhH',
        'oooooooooooooooo',
        'HHHHHHHHHHHHHHHH',
        'HhhhhhhhhhhhhhhH',
        'HhhhhhhhhhhhhhhH',
        'oooooooooooooooo',
        'HHHHHHHHHHHHHHHH',
        'HhhhhhhhhhhhhhhH',
        'oooooooooooooooo',
    ],
    palette: {
        o: PALETTE.earthShd,
        H: PALETTE.woodHi,
        h: PALETTE.woodBase,
    },
};

// -----------------------------------------------------------------------------
// ITEM SPRITES — 8x8
// -----------------------------------------------------------------------------
// Items are placed on top of tiles and need strong silhouettes.
// -----------------------------------------------------------------------------

// Stone — irregular chunk with multi-tone shading
const ITEM_STONE: SpriteDef = {
    pixels: [
        '...HHHHH..',
        '..HHhhhHH.',
        '.HHhhhhhHH',
        'HhhhhhhhHH',
        'HhhhhhhdHH',
        'HhhhhhddHH',
        '.HhhhhddH.',
        '..HHHHHH..',
    ],
    palette: {
        H: PALETTE.stoneHi,
        h: PALETTE.stoneBase,
        d: PALETTE.stoneShd,
    },
};

// Food — round apple with leaf and highlight
const ITEM_FOOD: SpriteDef = {
    pixels: [
        '...j......',
        '..jLLj....',
        '.jLhhLj...',
        '.jLhhhLj..',
        '.jLrrrrLj.',
        '.jLrrrrrLj',
        '..jLrrrrLj',
        '...jLLLLj.',
    ],
    palette: {
        j: PALETTE.leafShd,
        L: PALETTE.leafBase,
        h: '#ee5040',
        r: '#cc2828',
    },
};

// Wood — log with rings, end-on view
const ITEM_WOOD: SpriteDef = {
    pixels: [
        '..HHHHHH..',
        '.HhhhhhhH.',
        'HhbbbbbbhH',
        'HhboooooH.',
        'HhbBBBBBbH',
        'HhbBBBBBbH',
        '.HbbbbbbH.',
        '..HHHHHH..',
    ],
    palette: {
        H: PALETTE.woodHi,
        h: PALETTE.woodBase,
        b: PALETTE.woodMid,
        B: PALETTE.woodHi,
        o: PALETTE.woodShd,
    },
};

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

export function registerAllPixelSprites(scene: Scene): void {
    // Settlers — 5 colors × 3 frames (idle / walk-a / walk-b) = 15 textures.
    // Single direction: at this sprite scale (16x16 displayed at ~0.95×tile),
    // direction isn't visible to the player.
    const frames: Array<{ name: string; pixels: string[] }> = [
        { name: 'idle', pixels: SETTLER_S_IDLE },
        { name: 'walk-a', pixels: SETTLER_S_WALK_A },
        { name: 'walk-b', pixels: SETTLER_S_WALK_B },
    ];
    const longFrames: Array<{ name: string; pixels: string[] }> = [
        { name: 'idle', pixels: SETTLER_S_LONG_IDLE },
        { name: 'walk-a', pixels: SETTLER_S_LONG_WALK_A },
        { name: 'walk-b', pixels: SETTLER_S_LONG_WALK_B },
    ];
    const baldFrames: Array<{ name: string; pixels: string[] }> = [
        { name: 'idle', pixels: SETTLER_S_BALD_IDLE },
        { name: 'walk-a', pixels: SETTLER_S_BALD_WALK_A },
        { name: 'walk-b', pixels: SETTLER_S_BALD_WALK_B },
    ];
    const hatFrames: Array<{ name: string; pixels: string[] }> = [
        { name: 'idle', pixels: SETTLER_S_HAT_IDLE },
        { name: 'walk-a', pixels: SETTLER_S_HAT_WALK_A },
        { name: 'walk-b', pixels: SETTLER_S_HAT_WALK_B },
    ];

    for (const color of Object.keys(SETTLER_VARIANTS) as SettlerColor[]) {
        const palettes = buildSettlerPalettes(
            SETTLER_VARIANTS[color].hair,
            SETTLER_VARIANTS[color].shirt,
        );
        for (const frame of frames) {
            const baseName = frame.name === 'idle' ? `settler-${color}` : `settler-${color}-${frame.name}`;
            registerPixelSprite(scene, baseName, {
                pixels: frame.pixels,
                palette: palettes,
                transparentDot: true,
            });
        }
        for (const [suffix, frameList] of [
            ['long', longFrames],
            ['bald', baldFrames],
            ['hat', hatFrames],
        ] as const)
        {
            for (const frame of frameList)
            {
                const key = frame.name === 'idle' ? `settler-${color}-${suffix}` : `settler-${color}-${suffix}-${frame.name}`;
                registerPixelSprite(scene, key, {
                    pixels: frame.pixels,
                    palette: palettes,
                    transparentDot: true,
                });
            }
        }
    }

    // Tiles — register all variants
    registerPixelSprite(scene, 'tile-empty', TILE_EMPTY);

    for (let i = 0; i < GRASS_VARIANTS.length; i++) {
        registerPixelSprite(scene, `tile-grass-${i}`, {
            pixels: GRASS_VARIANTS[i],
            palette: {
                '.': PALETTE.grassBase,
                d: PALETTE.grassMid,
                g: PALETTE.grassBase,
                l: PALETTE.grassHi,
                // Decoration keys for grass-with-* variants
                p: '#f8d0e8', // flower pink
                y: '#f8e838', // flower yellow center
                r: '#5a5a5a', // rock shadow
                R: '#7a7a7a', // rock highlight
                M: '#c83028', // mushroom red cap
                W: '#f8f8f8', // mushroom white dot
                k: '#4a2a10', // mushroom stem
            },
        });
    }

    for (let i = 0; i < DIRT_VARIANTS.length; i++) {
        registerPixelSprite(scene, `tile-dirt-${i}`, {
            pixels: DIRT_VARIANTS[i],
            palette: {
                '.': PALETTE.earthBase,
                h: PALETTE.earthHi,
                d: PALETTE.earthShd,
                s: PALETTE.earthMid,
            },
        });
    }

    for (let i = 0; i < STONE_VARIANTS.length; i++) {
        registerPixelSprite(scene, `tile-stone-${i}`, {
            pixels: STONE_VARIANTS[i],
            palette: {
                '.': PALETTE.stoneBase,
                h: PALETTE.stoneHi,
                d: PALETTE.stoneShd,
                o: PALETTE.stoneOut,
            },
        });
    }

    for (let i = 0; i < WATER_VARIANTS.length; i++) {
        registerPixelSprite(scene, `tile-water-${i}`, {
            pixels: WATER_VARIANTS[i],
            palette: {
                '.': PALETTE.waterBase,
                d: PALETTE.waterShd,
                b: PALETTE.waterMid,
                h: PALETTE.waterHi,
            },
        });
    }

    for (let i = 0; i < SAND_VARIANTS.length; i++) {
        registerPixelSprite(scene, `tile-sand-${i}`, {
            pixels: SAND_VARIANTS[i],
            palette: {
                '.': PALETTE.sandBase,
                h: PALETTE.sandHi,
                d: PALETTE.sandMid,
                s: PALETTE.sandShd,
            },
        });
    }

    for (let i = 0; i < SNOW_VARIANTS.length; i++) {
        registerPixelSprite(scene, `tile-snow-${i}`, {
            pixels: SNOW_VARIANTS[i],
            palette: {
                '.': PALETTE.snowBase,
                h: PALETTE.snowHi,
                d: PALETTE.snowMid,
                s: PALETTE.snowShd,
            },
        });
    }

    registerPixelSprite(scene, 'tile-tree', TILE_TREE);
    registerPixelSprite(scene, 'tile-tree-pine', TILE_TREE_PINE);
    registerPixelSprite(scene, 'tile-bush', TILE_BUSH);
    registerPixelSprite(scene, 'tile-sand-water', TILE_SAND_WATER);
    registerPixelSprite(scene, 'tile-grass-sand', TILE_GRASS_SAND);
    registerPixelSprite(scene, 'tile-wall', TILE_WALL);
    registerPixelSprite(scene, 'tile-wall-straight-h', TILE_WALL_STRAIGHT_H);
    registerPixelSprite(scene, 'tile-wall-straight-v', TILE_WALL_STRAIGHT_V);
    registerPixelSprite(scene, 'tile-wall-end-n', TILE_WALL_END_N);
    registerPixelSprite(scene, 'tile-wall-end-e', TILE_WALL_END_E);
    registerPixelSprite(scene, 'tile-wall-end-s', TILE_WALL_END_S);
    registerPixelSprite(scene, 'tile-wall-end-w', TILE_WALL_END_W);
    registerPixelSprite(scene, 'tile-wall-corner-ne', TILE_WALL_CORNER_NE);
    registerPixelSprite(scene, 'tile-wall-corner-nw', TILE_WALL_CORNER_NW);
    registerPixelSprite(scene, 'tile-wall-corner-se', TILE_WALL_CORNER_SE);
    registerPixelSprite(scene, 'tile-wall-corner-sw', TILE_WALL_CORNER_SW);
    registerPixelSprite(scene, 'tile-wall-t-n', TILE_WALL_T_N);
    registerPixelSprite(scene, 'tile-wall-t-e', TILE_WALL_T_E);
    registerPixelSprite(scene, 'tile-wall-t-s', TILE_WALL_T_S);
    registerPixelSprite(scene, 'tile-wall-t-w', TILE_WALL_T_W);
    registerPixelSprite(scene, 'tile-wall-cross', TILE_WALL_CROSS);
    registerPixelSprite(scene, 'tile-floor', TILE_FLOOR);
    registerPixelSprite(scene, 'tile-tilled', TILE_TILLED);

    // Items
    registerPixelSprite(scene, 'stone', ITEM_STONE);
    registerPixelSprite(scene, 'food', ITEM_FOOD);
    registerPixelSprite(scene, 'wood', ITEM_WOOD);
}

// -----------------------------------------------------------------------------
// Tile variant selection (used by world-renderer to pick a tile-grass variant
// deterministically per tile coordinate).
// -----------------------------------------------------------------------------

export const TILE_VARIANT_KEYS: Partial<Record<number, string[]>> = {
    [TileType.Grass]: ['tile-grass-0', 'tile-grass-1', 'tile-grass-2', 'tile-grass-3'],
    [TileType.Dirt]: ['tile-dirt-0', 'tile-dirt-1'],
    [TileType.Stone]: ['tile-stone-0', 'tile-stone-1', 'tile-stone-2'],
    [TileType.Water]: ['tile-water-0', 'tile-water-1'],
    [TileType.Sand]: ['tile-sand-0', 'tile-sand-1'],
    [TileType.Snow]: ['tile-snow-0', 'tile-snow-1'],
};

export function getTileTextureKey(type: TileType, tx: number, ty: number): string {
    const variants = TILE_VARIANT_KEYS[type];
    if (variants && variants.length > 0) {
        const h = (tx * 73856093) ^ (ty * 19349663);
        return variants[Math.abs(h) % variants.length];
    }
    return TILE_TEXTURE_KEYS[type] ?? 'tile-empty';
}

// Fallback keys for tiles that don't use variants (kept for backwards compat).
export const TILE_TEXTURE_KEYS: Record<number, string> = {
    [TileType.Empty]: 'tile-empty',
    [TileType.Dirt]: 'tile-dirt-0',
    [TileType.Grass]: 'tile-grass-0',
    [TileType.Stone]: 'tile-stone-0',
    [TileType.Water]: 'tile-water-0',
    [TileType.Sand]: 'tile-sand-0',
    [TileType.Tree]: 'tile-tree',
    [TileType.TreePine]: 'tile-tree-pine',
    [TileType.TreeBush]: 'tile-bush',
    [TileType.SandWater]: 'tile-sand-water',
    [TileType.GrassSand]: 'tile-grass-sand',
    [TileType.Wall]: 'tile-wall',
    [TileType.Floor]: 'tile-floor',
    [TileType.TilledSoil]: 'tile-tilled',
    [TileType.Snow]: 'tile-snow-0',
};

export const ITEM_TEXTURE_KEYS: Record<string, string> = {
    stone: 'stone',
    food: 'food',
    wood: 'wood',
};
