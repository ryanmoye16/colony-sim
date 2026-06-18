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

// Common base — every settler shares skin, eyes, boots, pants, belt, outline.
const SETTLER_BASE_PALETTE: Record<string, string> = {
    ...SKIN_PALETTE,
    ...BOOTS,
    ...BELT,
    ...EYES_MOUTH,
    ...PANTS,
    ...OUTFIT,
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
    '.oPoooPoooPoooPo', // legs shifted
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

// South carrying — holding item in front (hands visible)
const SETTLER_S_CARRY = [
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
    '.oSuuuTTuuuuutSX',
    '.ouTTuuuTuuuTTtX', // arms wrapped around item
    '.oPPoPpoPoPpoPPo',
    '.oPo.oPo.oPo.oPo',
];

// EAST (right-facing profile) — idle
const SETTLER_E_IDLE = [
    '....jjjjjjj.....',
    '...jHHHHHHHj....',
    '..jHHHHHHHHHj...',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSfffeSfffSffXo', // eye on the visible side
    '.ofSSSSSfffSffXo',
    '.oSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuutX..',
    '.ouuuuTTuuuuttX.',
    '.ouTuTuuuTuuuTut',
    '.oTuTuuTuTuuTut.',
    '.oPPoPPoPPoPPoPo',
    '.oPo.oPo.oPo.oPo',
    '.oPo.oPo.oPo.oPo',
];

// East walk A — leading leg forward
const SETTLER_E_WALK_A = [
    '....jjjjjjj.....',
    '...jHHHHHHHj....',
    '..jHHHHHHHHHj...',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSfffeSfffSffXo',
    '.ofSSSSSfffSffXo',
    '.oSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuutX..',
    '.ouuuuTTuuuuttX.',
    '.ouTuTuuuTuuuTut',
    '.oTuTuuTuTuuTut.',
    '.oPPoPPoPPoPPoPo',
    '.oPoooPoooPoooPo', // shifted
    '.oPoooPoooPoooPo',
];

// East walk B
const SETTLER_E_WALK_B = [
    '....jjjjjjj.....',
    '...jHHHHHHHj....',
    '..jHHHHHHHHHj...',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSfffeSfffSffXo',
    '.ofSSSSSfffSffXo',
    '.oSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuutX..',
    '.ouuuuTTuuuuttX.',
    '.ouTuTuuuTuuuTut',
    '.oTuTuuTuTuuTut.',
    '.oPPoPPoPPoPPoPo',
    '.ooPoooPoooPoooP',
    '.ooPoooPoooPoooP',
];

// East carrying
const SETTLER_E_CARRY = [
    '....jjjjjjj.....',
    '...jHHHHHHHj....',
    '..jHHHHHHHHHj...',
    '.jHHsssoosssHHj.',
    '.jHHsfffsfffsHH.',
    '.oSfffeSfffSffXo',
    '.ofSSSSSfffSffXo',
    '.oSSmmmSSSXffXo',
    '..oSSSSSSSSSXXo.',
    '..ouuuTTuuuutX..',
    '..uuuTTTTtuuuSX.', // arm holding item in front
    '.ouTuTuuuTuuuTut',
    '.oTuTuuTuTuuTut.',
    '.oPPoPPoPPoPPoPo',
    '.oPo.oPo.oPo.oPo',
    '.oPo.oPo.oPo.oPo',
];

// NORTH (back of head) — idle
const SETTLER_N_IDLE = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHHHHHHHHHHHj.',
    '.jHHsHHHssHHsHHj.', // back of head detail
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '..oHHHHHHHHHHXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPo.oPo.oPo.oPo',
];

const SETTLER_N_WALK_A = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHHHHHHHHHHHj.',
    '.jHHsHHHssHHsHHj.',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '..oHHHHHHHHHHXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPoooPoooPoooPo',
];

const SETTLER_N_WALK_B = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHHHHHHHHHHHj.',
    '.jHHsHHHssHHsHHj.',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '..oHHHHHHHHHHXo.',
    '..ouuuTTuuuuutX.',
    '.ouuuuTTuuuuuttX',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.ooPoooPoooPoooP',
];

const SETTLER_N_CARRY = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHHHHHHHHHHHj.',
    '.jHHsHHHssHHsHHj.',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '.oHHHHHHHHHHHHXo',
    '..oHHHHHHHHHHXo.',
    '..ouuuTTuuuuutX.',
    '..uuuTTTTtuuuSX.',
    '.ouTuTuuuTuuuTut',
    '.oPPoPPoPPoPPoPo',
    '.oPo.oPo.oPo.oPo',
];

// WEST (left-facing profile) — mirrored from EAST
function mirrorRow(row: string): string {
    return row.split('').reverse().join('');
}
function mirrorSprite(rows: string[]): string[] {
    return rows.map(mirrorRow);
}

const SETTLER_W_IDLE = mirrorSprite(SETTLER_E_IDLE);
const SETTLER_W_WALK_A = mirrorSprite(SETTLER_E_WALK_A);
const SETTLER_W_WALK_B = mirrorSprite(SETTLER_E_WALK_B);
const SETTLER_W_CARRY = mirrorSprite(SETTLER_E_CARRY);

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
// Each has scattered grass blades on a solid grass base, with light edges top/left
// and shadow edge bottom/right for "raised tile" depth.
function makeGrassVariant(seed: number): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) {
            // Edge shading — light top/left, shadow bottom/right
            const isTop = y === 0;
            const isBottom = y === 15;
            const isLeft = x === 0;
            const isRight = x === 15;
            if (isTop) { row += 'l'; continue; }
            if (isBottom) { row += 'd'; continue; }
            if (isLeft) { row += 'g'; continue; }
            if (isRight) { row += 'd'; continue; }
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

const GRASS_VARIANTS: string[][] = [
    makeGrassVariant(1),
    makeGrassVariant(2),
    makeGrassVariant(3),
    makeGrassVariant(4),
];

// Dirt — base brown with cracks and small pebbles, with edge shading
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
            if (isLeft) { row += 'h'; continue; }
            if (isRight) { row += 'd'; continue; }
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

// Stone — multi-tone with chips and edge shading
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
            if (isLeft) { row += 'h'; continue; }
            if (isRight) { row += 'o'; continue; }
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

// Water — base blue with wave highlights and depth shadows, edge shading
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
            if (isLeft) { row += 'b'; continue; }
            if (isRight) { row += 'd'; continue; }
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

// Sand — base tan with grain dots, shadow specks, edge shading
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
            if (isLeft) { row += 'h'; continue; }
            if (isRight) { row += 'd'; continue; }
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

// Wall — masonry pattern with shaded mortar
const TILE_WALL: SpriteDef = {
    pixels: [
        'oooooooooooooooo',
        'oHHHHHHHhoHHHHHo',
        'oHhhhhhhHohhhhHo',
        'oHhhhhhhHohhhhHo',
        'oHhhhhhhHohhhhHo',
        'oHhoHHHHHhoHHHHo',
        'oHhoHHHHHhoHHHHo',
        'oooooooooooooooo',
        'oHHHHHhoHHHHHHHo',
        'oHhhhhHohhhhhhHo',
        'oHhhhhHohhhhhhHo',
        'oHhhhhHohhhhhhHo',
        'oHHHHHhoHHHHHHHo',
        'oHHHHHhoHHHHHHHo',
        'oooooooooooooooo',
        'oooooooooooooooo',
    ],
    palette: {
        o: PALETTE.stoneMShd,
        H: PALETTE.stoneMHi,
        h: PALETTE.stoneMBase,
    },
};

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
    // Settlers — 5 colors × 4 directions × 4 frames = 80 textures
    const directions = ['s', 'e', 'n', 'w'] as const;
    const frames = ['idle', 'walk-a', 'walk-b', 'carry'] as const;
    const settlerSprites: Record<string, string[]> = {
        s: { idle: SETTLER_S_IDLE, 'walk-a': SETTLER_S_WALK_A, 'walk-b': SETTLER_S_WALK_B, carry: SETTLER_S_CARRY } as unknown as string[],
        e: { idle: SETTLER_E_IDLE, 'walk-a': SETTLER_E_WALK_A, 'walk-b': SETTLER_E_WALK_B, carry: SETTLER_E_CARRY } as unknown as string[],
        n: { idle: SETTLER_N_IDLE, 'walk-a': SETTLER_N_WALK_A, 'walk-b': SETTLER_N_WALK_B, carry: SETTLER_N_CARRY } as unknown as string[],
        w: { idle: SETTLER_W_IDLE, 'walk-a': SETTLER_W_WALK_A, 'walk-b': SETTLER_W_WALK_B, carry: SETTLER_W_CARRY } as unknown as string[],
    } as unknown as Record<string, string[]>;

    for (const color of Object.keys(SETTLER_VARIANTS) as SettlerColor[]) {
        const palettes = buildSettlerPalettes(
            SETTLER_VARIANTS[color].hair,
            SETTLER_VARIANTS[color].shirt,
        );
        for (const dir of directions) {
            const dirSprites = settlerSprites[dir] as unknown as Record<string, string[]>;
            for (const frame of frames) {
                const pixels = dirSprites[frame];
                const key = `settler-${color}-${dir}-${frame}`;
                registerPixelSprite(scene, key, {
                    pixels,
                    palette: palettes,
                    transparentDot: true,
                });
            }
            // Backward-compat aliases — old code looks up `settler-red`, `settler-red-walk-a`, etc.
            // Map to south-facing idle / walk-a / walk-b so existing render-sync still works.
            if (dir === 's') {
                registerPixelSprite(scene, `settler-${color}`, {
                    pixels: dirSprites.idle,
                    palette: palettes,
                    transparentDot: true,
                });
                registerPixelSprite(scene, `settler-${color}-walk-a`, {
                    pixels: dirSprites['walk-a'],
                    palette: palettes,
                    transparentDot: true,
                });
                registerPixelSprite(scene, `settler-${color}-walk-b`, {
                    pixels: dirSprites['walk-b'],
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
    registerPixelSprite(scene, 'tile-wall', TILE_WALL);
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
