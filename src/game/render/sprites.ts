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
import { mulberry32 } from '../util/rng';

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

    // Earth / dirt (5 tones) — Odd Realm bruised/plum palette. Warm earth on top,
    // cool dark plum below. This is what makes the soil feel damp and atmospheric.
    earthHi:     '#a87a6a',
    earthBase:   '#7a4a44',
    earthMid:    '#4a2840',
    earthShd:    '#2a1430',
    earthOut:    '#18081c',

    // Grass (4 tones) — Odd Realm multi-tone: yellowish-lime, mid green, olive.
    // The base is the bright life-green, shadow is the cool mossy olive.
    grassHi:     '#bcd84a',
    grassBase:   '#7eb838',
    grassMid:    '#4a8a2a',
    grassShd:    '#2a5a1c',

    // Tree canopy (5 tones — for shaded trees) — Odd Realm clumpy crowns.
    // Bright lime top, deep forest bottom. Outlines are dark forest green, not black.
    leafHi:      '#a8d850',
    leafBase:    '#6aa838',
    leafMid:     '#3e7820',
    leafShd:     '#1f4a14',
    leafOut:     '#102e0a',

    // Wood (4 tones — for logs/trunks). Slightly cooler than the old warm brown
    // so it sits with the plum earth palette without competing.
    woodHi:      '#a87454',
    woodBase:    '#7a4a30',
    woodMid:     '#4a2a18',
    woodShd:     '#26140a',

    // Stone (5 tones) — Odd Realm defining choice: PURPLE / plum, not grey.
    // This is the biggest single art-style change. Stone tiles read as deep
    // magenta rock rather than neutral cobblestone.
    stoneHi:     '#c89ac8',
    stoneBase:   '#8a5a90',
    stoneMid:    '#5e3068',
    stoneShd:    '#3a1844',
    stoneOut:    '#1a0824',

    // Water (4 tones) — Odd Realm: vibrant cyan shallow band, mid teal,
    // deep navy. The Hi color is more cyan (less lavender) for a foam feel.
    waterHi:     '#8ce4f8',
    waterBase:   '#3868a8',
    waterMid:    '#1f3a78',
    waterShd:    '#0e1c44',

    // Sand (4 tones)
    sandHi:      '#f4e0a8',
    sandBase:    '#dcc078',
    sandMid:     '#b89048',
    sandShd:     '#8a6428',

    // Snow (4 tones) — Odd Realm keeps the cool purple tint even on snow,
    // so shadows drift toward the plum end of the palette.
    snowHi:      '#f8f8fc',
    snowBase:    '#d4c8e0',
    snowMid:     '#9888b4',
    snowShd:     '#5a4878',

    // Masonry (wall + floor) (4 tones) — purple/plum to match the new stone.
    // Walls are constructed stone so they share the stone family palette.
    stoneMHi:    '#a87aa8',
    stoneMBase:  '#6a3c70',
    stoneMMid:   '#421e4a',
    stoneMShd:   '#1c0a26',

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

// SOUTH (front-facing) — idle frame.
// Odd Realm chibi style: large blocky head (rows 0-8) with hair on top, two
// simple eye dots, no mouth. Small body (rows 9-15) with shirt + pants + boots.
// Outline is the skin-family dark (skinOut), not pure black — that's the
// "color-shifted outline" Odd Realm uses.
//
//   rows 0-2: hair top
//   rows 3-4: face forehead / eyes
//   rows 5-8: chin + shirt collar
//   rows 9-12: shirt body
//   row  13:  belt
//   rows 14-15: legs + boots
const SETTLER_S_IDLE = [
    '....jjjjjjjj....',
    '...jHHHHHHHHj...',
    '..jHHHHHHHHHHj..',
    '.jHHssffssffHHj.',
    '.jHHsffSffSffHj.',
    '.oSSfeeSfeeSffXo', // forehead + eye line
    '.ofSffSffSffSffo',
    '.oSSSSSSSSSSSSo', // chin
    '..oSSSSSSSSXXo.', // chin shadow
    '..ouuuTTuuuutX.', // shirt top
    '.ouuuuTTuuuuuTo',
    '.ouuuuTTuuuuuTo',
    '.ouuuuTTuuuuuTo',
    '.oPPoPPoPPoPPoP', // belt
    '.oPoooPoooPoooP', // legs
    '.bb..bb..bb..bb', // boots
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

// GRASS — Odd Realm multi-tone grass:
//   - Bright lime highlights ('l' = grassHi)
//   - Mid green body ('.' = grassBase, the dominant tone)
//   - Olive shadow patches ('s' = grassShd, the cool mossy tone)
//   - Dithered checkerboard between body and shadow so transitions feel painted,
//     not stamped.
// Feature placement is intentional — tuft clusters, grass blades, and shadow
// patches — but the BASE color is also multi-toned, which is what gives Odd
// Realm grass its painted feel.
function makeGrassVariant(seed: number): string[] {
    const rng = mulberry32(seed * 0x9e3779b1);
    const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));

    // 1-2 olive shadow patches, each a small dithered rectangle that mixes
    // grassBase and grassShd in a checkerboard. Each patch has its OWN
    // checkerboard phase so adjacent tiles don't form one giant repeating
    // carpet. This is the Odd Realm "dirt shadow under foliage" look.
    const patchCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < patchCount; i++)
    {
        const cx = 1 + Math.floor(rng() * 12);
        const cy = 1 + Math.floor(rng() * 12);
        const w = 3 + Math.floor(rng() * 3); // 3-5
        const h = 3 + Math.floor(rng() * 3); // 3-5
        const phase = rng() < 0.5 ? 0 : 1;   // random checkerboard phase
        for (let dy = 0; dy < h; dy++)
        {
            for (let dx = 0; dx < w; dx++)
            {
                const x = cx + dx;
                const y = cy + dy;
                if (x > 15 || y > 15) continue;
                if ((dx + dy + phase) % 2 === 0) g[y][x] = 's';
                else g[y][x] = '.';
            }
        }
    }

    // 3-5 small L-tuft clusters (lime highlight + mid) — bright grass tufts.
    // Use a 1x2 vertical blade rather than a 2x2 block to avoid the dominant
    // diamond pattern that a 2x2 block forms when tiled across the whole map.
    const tuftCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < tuftCount; i++)
    {
        const cx = 1 + Math.floor(rng() * 14);
        const cy = 1 + Math.floor(rng() * 13);
        // Vertical 2-px blade — lime tip on top, olive base below
        g[cy][cx] = 'l';
        if (cy + 1 < 16) g[cy + 1][cx] = 'g';
    }

    // 2-3 vertical 1-pixel grass blades (highlight)
    for (let i = 0; i < 3; i++)
    {
        const cx = 1 + Math.floor(rng() * 14);
        const cy = 1 + Math.floor(rng() * 14);
        if (g[cy][cx] === '.') g[cy][cx] = 'l';
    }

    // A handful of single lime speckles scattered around for visual life
    for (let i = 0; i < 5; i++)
    {
        const cx = 1 + Math.floor(rng() * 14);
        const cy = 1 + Math.floor(rng() * 14);
        if (g[cy][cx] === '.') g[cy][cx] = 'l';
    }

    return g.map((r) => r.join(''));
}

// Map grass-variant pixels to the Odd Realm 4-tone palette.
function grassPalette (): Record<string, string>
{
    return {
        '.': PALETTE.grassBase,  // body — mid green
        l: PALETTE.grassHi,      // bright lime highlight
        g: PALETTE.grassMid,      // olive mid
        s: PALETTE.grassShd,      // deep mossy shadow
    };
}

// GRASS-with-decorations — overlays a flower, rock, or mushroom on a base
// grass tile. The decoration is hand-shaped for clean readability.
function makeDecoratedGrass(seed: number, deco: 'flower' | 'rock' | 'mushroom'): string[] {
    const rows = makeGrassVariant(seed);
    const h = ((seed * 246343) ^ 0xbeef) >>> 0;
    const cx = 4 + (h % 8);
    const cy = 4 + ((h >>> 4) % 8);
    if (deco === 'flower')
    {
        // 5-petal flower: pink petals + yellow center
        rows[cy - 1] = setPx(rows[cy - 1], cx, 'p');
        rows[cy + 1] = setPx(rows[cy + 1], cx, 'p');
        rows[cy] = setPx(rows[cy], cx - 1, 'p');
        rows[cy] = setPx(rows[cy], cx + 1, 'p');
        rows[cy] = setPx(rows[cy], cx, 'y');
    }
    else if (deco === 'rock')
    {
        // 3x2 octagonal rock cluster with hi/lo shading
        const placements: Array<[number, number, string]> = [
            [0, 0, 'h'], [1, 0, 'h'], [2, 0, 'h'],
            [0, 1, 'R'], [1, 1, 'R'], [2, 1, 'h'],
        ];
        for (const [dx, dy, ch] of placements)
        {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 15 && y < 15 && x > 0 && y > 0) rows[y] = setPx(rows[y], x, ch);
        }
    }
    else
    {
        // mushroom: 3-wide red cap with white dot, brown stem
        rows[cy] = setPx(rows[cy], cx - 1, 'M');
        rows[cy] = setPx(rows[cy], cx, 'M');
        rows[cy] = setPx(rows[cy], cx + 1, 'M');
        rows[cy + 1] = setPx(rows[cy + 1], cx, 'W');
        rows[cy + 2] = setPx(rows[cy + 2], cx, 'k');
        rows[cy + 3] = setPx(rows[cy + 3], cx, 'k');
    }
    return rows;
}

function setPx (row: string, x: number, ch: string): string
{
    return row.slice(0, x) + ch + row.slice(x + 1);
}

const GRASS_VARIANTS: string[][] = [
    makeGrassVariant(1),
    makeGrassVariant(2),
    makeGrassVariant(3),
    makeGrassVariant(4),
    makeGrassVariant(5),
    makeGrassVariant(6),
    makeGrassVariant(7),
    makeGrassVariant(8),
    makeGrassVariant(9),
    makeGrassVariant(10),
    makeGrassVariant(11),
    makeGrassVariant(12),
    makeDecoratedGrass(101, 'flower'),
    makeDecoratedGrass(202, 'rock'),
    makeDecoratedGrass(303, 'mushroom'),
];

// Dirt — base brown with a few intentional pebble clusters, small cracks,
// and edge bands. Reads as "packed earth" rather than "speckled noise".
function makeDirtVariant(seed: number): string[] {
    const rng = mulberry32(seed * 0x85ebca6b);
    const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));

    // No edge bands — let the pebble clusters do all the work.

    // 2-3 small pebble clusters (2x2 rounded squares)
    const pebbleCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < pebbleCount; i++)
    {
        const cx = 2 + Math.floor(rng() * 12);
        const cy = 2 + Math.floor(rng() * 12);
        g[cy][cx] = 'h';
        g[cy][cx + 1] = 'h';
        g[cy + 1][cx] = 's';
        g[cy + 1][cx + 1] = 'd';
    }

    // 1-2 short horizontal cracks (1-pixel wide, 2-3 pixels long)
    const crackCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < crackCount; i++)
    {
        const cy = 3 + Math.floor(rng() * 10);
        const cx = 2 + Math.floor(rng() * 10);
        const len = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < len && cx + k < 14; k++) g[cy][cx + k] = 'd';
    }

    return g.map((r) => r.join(''));
}

const DIRT_VARIANTS: string[][] = [
    makeDirtVariant(1), makeDirtVariant(2), makeDirtVariant(3), makeDirtVariant(4),
];

// Stone — a clean 2x2 grid of irregular cobble blocks separated by dark grout.
// Each block is a 7x7 region with its own highlight on the top-left and
// shadow on the bottom-right, reading as a packed stone surface.
function makeStoneVariant(seed: number): string[] {
    const rng = mulberry32(seed * 0xc2b2ae35);
    const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));

    // 2x2 cobble layout: blocks at (1-7, 1-7), (9-14, 1-7), (1-7, 9-14), (9-14, 9-14)
    // Grout lines on row 8 and column 8
    for (let x = 0; x < 16; x++) g[8][x] = 'o';
    for (let y = 0; y < 16; y++) g[y][8] = 'o';

    // Block 1: top-left
    paintBlock(g, 1, 1, 7, 7, 'd', 'h', rng);
    // Block 2: top-right
    paintBlock(g, 9, 1, 7, 7, 'd', 'h', rng);
    // Block 3: bottom-left
    paintBlock(g, 1, 9, 7, 7, 'd', 'h', rng);
    // Block 4: bottom-right
    paintBlock(g, 9, 9, 6, 6, 'd', 'h', rng);

    // A few highlight pixels on top edge of each block (rim light)
    for (const x of [2, 4, 6, 10, 12, 14])
    {
        if (g[1][x] !== undefined && g[1][x] !== 'o') g[1][x] = 'h';
        if (g[9][x] !== undefined && g[9][x] !== 'o') g[9][x] = 'h';
    }

    return g.map((r) => r.join(''));
}

function paintBlock (g: string[][], x0: number, y0: number, w: number, h: number, shd: string, hi: string, rng: () => number): void
{
    // Top edge highlight
    for (let x = x0; x < x0 + w && x < 15; x++)
    {
        if (g[y0][x] !== 'o') g[y0][x] = hi;
    }
    // Left edge highlight
    for (let y = y0; y < y0 + h && y < 15; y++)
    {
        if (g[y][x0] !== 'o') g[y][x0] = hi;
    }
    // Bottom-right shadow band
    for (let x = x0; x < x0 + w && x < 15; x++)
    {
        if (g[y0 + h - 1][x] !== 'o') g[y0 + h - 1][x] = shd;
    }
    for (let y = y0; y < y0 + h && y < 15; y++)
    {
        if (g[y][x0 + w - 1] !== 'o') g[y][x0 + w - 1] = shd;
    }
    // 1-2 dark speckles inside
    const speckles = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < speckles; i++)
    {
        const sx = x0 + 1 + Math.floor(rng() * (w - 2));
        const sy = y0 + 1 + Math.floor(rng() * (h - 2));
        if (g[sy][sx] !== 'o') g[sy][sx] = shd;
    }
}

const STONE_VARIANTS: string[][] = [
    makeStoneVariant(1), makeStoneVariant(2), makeStoneVariant(3), makeStoneVariant(4), makeStoneVariant(5), makeStoneVariant(6),
];

// Water — Odd Realm style: 3 depth bands (shallow cyan, mid teal, deep navy).
// To kill the strong horizontal stripe effect when many water tiles are
// adjacent, each COLUMN gets its own band offset (per-column jitter). That
// makes the bands meander like water surface, not run as ruler-straight
// lines. Boundary rows are dithered; wave crests only in the shallow band.
function makeWaterVariant(seed: number): string[] {
    const rng = mulberry32(seed * 0x27d4eb2f);
    const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));

    // Per-column band offsets — small jitter per column so the boundary meanders.
    const shallowEnd = new Array<number>(16);
    const midEnd = new Array<number>(16);
    const baseShallow = 4 + Math.floor(rng() * 2);  // 4-5
    const baseMid = 9 + Math.floor(rng() * 2);     // 9-10
    for (let x = 0; x < 16; x++)
    {
        shallowEnd[x] = Math.max(2, Math.min(7, baseShallow + Math.floor(rng() * 3) - 1));
        midEnd[x] = Math.max(8, Math.min(13, baseMid + Math.floor(rng() * 3) - 1));
    }

    for (let y = 0; y < 16; y++)
    {
        for (let x = 0; x < 16; x++)
        {
            const band =
                y < shallowEnd[x] ? 'b' :
                y < midEnd[x]     ? '.' :
                                    'd';
            g[y][x] = band;
        }
    }

    // Top edge highlight (sky reflection)
    for (let x = 0; x < 16; x++) g[0][x] = 'h';

    // Wave crests in the shallow band only — short cyan dashes
    const waveCount = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < waveCount; i++)
    {
        const x = Math.floor(rng() * 14);
        const cy = 1 + Math.floor(rng() * Math.max(1, shallowEnd[x] - 1));
        const len = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < len && x + k < 16; k++) g[cy][x + k] = 'h';
    }

    // 1-2 deep dark spots
    for (let i = 0; i < 2; i++)
    {
        const x = Math.floor(rng() * 14);
        const cy = midEnd[x] + 1 + Math.floor(rng() * Math.max(1, 16 - midEnd[x] - 2));
        if (cy < 16) g[cy][x] = 'd';
    }

    return g.map((r) => r.join(''));
}

const WATER_VARIANTS: string[][] = [
    makeWaterVariant(1), makeWaterVariant(2), makeWaterVariant(3), makeWaterVariant(4),
];

// Sand — base tan with a few intentional grain dots and small shell/pebble
// clusters. Edge bands for tile-to-tile blending.
function makeSandVariant(seed: number): string[] {
    const rng = mulberry32(seed * 0x165667b1);
    const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));

    // No edge bands — let the grain dots do the work.

    // A small handful of grain dots (1-px highlights + 1-px shadows)
    for (let i = 0; i < 6; i++)
    {
        const cx = 2 + Math.floor(rng() * 12);
        const cy = 2 + Math.floor(rng() * 12);
        g[cy][cx] = 'h';
    }
    for (let i = 0; i < 4; i++)
    {
        const cx = 2 + Math.floor(rng() * 12);
        const cy = 2 + Math.floor(rng() * 12);
        g[cy][cx] = 'd';
    }
    // 1 dark speck (a small pebble)
    const cx = 3 + Math.floor(rng() * 10);
    const cy = 3 + Math.floor(rng() * 10);
    g[cy][cx] = 's';
    g[cy + 1][cx] = 's';

    return g.map((r) => r.join(''));
}

const SAND_VARIANTS: string[][] = [
    makeSandVariant(1), makeSandVariant(2), makeSandVariant(3), makeSandVariant(4),
];

// Snow — base white with a few large cool-blue shadow drifts and bright
// highlight pixels. Reads as soft snow with subtle topography.
function makeSnowVariant(seed: number): string[] {
    const rng = mulberry32(seed * 0xd6e8fe8a);
    const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('.'));

    // 1-2 large cool shadow drifts (an L-shape of mid-blue)
    const driftCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < driftCount; i++)
    {
        const cx = 2 + Math.floor(rng() * 10);
        const cy = 4 + Math.floor(rng() * 8);
        g[cy][cx] = 'd';
        g[cy][cx + 1] = 'd';
        g[cy + 1][cx] = 'd';
        g[cy + 1][cx + 1] = 'd';
        g[cy + 2][cx] = 's';
    }

    // A few bright highlight pixels (sun on top of drifts)
    for (let i = 0; i < 4; i++)
    {
        const cx = 2 + Math.floor(rng() * 12);
        const cy = 2 + Math.floor(rng() * 12);
        g[cy][cx] = 'h';
    }

    return g.map((r) => r.join(''));
}

const SNOW_VARIANTS: string[][] = [
    makeSnowVariant(1), makeSnowVariant(2), makeSnowVariant(3), makeSnowVariant(4),
];

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

// Tree — Odd Realm style: clumpy round canopy made of 2-3 overlapping circular
// foliage clumps. Trunk is mostly hidden by the low-hanging foliage (just a few
// dark-brown pixels at the bottom-center). No tall silhouette.
//
// Trees sit on top of the grass tile (TileType.Tree), so the surrounding pixels
// are grass so adjacent trees don't show void between them.

function clump (g: string[][], cx: number, cy: number, r: number, fill: string, rng: () => number): void
{
    // Filled circle of `fill` with a couple of highlight ('h') pixels on top
    // and shadow ('D') pixels on bottom, so each clump has its own shading.
    for (let dy = -r; dy <= r; dy++)
    {
        for (let dx = -r; dx <= r; dx++)
        {
            const d2 = dx * dx + dy * dy;
            if (d2 <= r * r + (rng() < 0.2 ? 1 : 0))
            {
                const x = cx + dx;
                const y = cy + dy;
                if (x < 0 || x > 15 || y < 0 || y > 15) continue;
                g[y][x] = fill;
            }
            // Top-left rim: a 1-px highlight at the very top of the clump
            if (dy === -r && dx === 0)
            {
                const x = cx + dx;
                const y = cy + dy;
                if (x >= 0 && x <= 15 && y >= 0 && y <= 15) g[y][x] = 'h';
            }
            // Bottom rim shadow
            if (dy === r && dx === 0)
            {
                const x = cx + dx;
                const y = cy + dy;
                if (x >= 0 && x <= 15 && y >= 0 && y <= 15) g[y][x] = 'D';
            }
        }
    }
}

// Build a tree as 2-3 overlapping round clumps. The clumps are placed so the
// overall silhouette is a 3-clump arrangement (left tall, right tall, center
// low) — Odd Realm's signature "bushy" tree shape.
function makeClumpyTree (seed: number): string[]
{
    const rng = mulberry32(seed * 0xbaadf00d);
    const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('g'));

    // Odd Realm trees: foliage fills almost the entire tile, no visible
    // trunk. Several large overlapping round clumps so the silhouette is
    // bumpy, not balloon-shaped. Clumps are positioned in the middle and
    // upper portion of the tile so the bottom edge has at least a little
    // grass showing — that's the "sitting on grass" feel.
    const arrangements: Array<Array<[number, number, number]>> = [
        // [cx, cy, r] — cy values biased to the upper-middle so the canopy
        // is wide and lumpy, with a flat-ish bottom that hides the ground.
        [[5, 5, 4], [10, 5, 4], [7, 8, 4], [3, 8, 3], [12, 8, 3]],
        [[4, 6, 4], [11, 6, 4], [7, 9, 4], [2, 9, 3], [13, 9, 3]],
        [[6, 4, 4], [10, 7, 4], [4, 9, 3], [12, 9, 3], [8, 11, 2]],
        [[5, 6, 4], [10, 6, 4], [3, 9, 3], [12, 9, 3], [7, 10, 3]],
        [[7, 5, 5], [3, 8, 3], [12, 8, 3], [5, 10, 3], [10, 10, 3]],
    ];
    const arr = arrangements[Math.floor(rng() * arrangements.length)];

    // Fill the foliage clumps (last pass wins, so we draw left-to-right
    // and the rightmost clump covers the others — that's how Odd Realm
    // builds depth).
    for (const [cx, cy, r] of arr)
    {
        clump(g, cx, cy, r, 'L', rng);
    }

    // Re-apply highlights + shadows on the OUTER pixels of each clump, so the
    // shading reads against neighbors. Walk top-down: any 'L' pixel with 'g'
    // (grass/empty) above becomes 'h' (highlight), any 'L' pixel with 'g'
    // below becomes 'D' (shadow).
    for (let y = 0; y < 16; y++)
    {
        for (let x = 0; x < 16; x++)
        {
            if (g[y][x] !== 'L') continue;
            const above = y > 0 ? g[y - 1][x] : 'g';
            const below = y < 15 ? g[y + 1][x] : 'g';
            if (above === 'g') g[y][x] = 'h';
            else if (below === 'g') g[y][x] = 'D';
        }
    }

    // Sprinkle a few 'M' (mid green) interior pixels for variation.
    for (let i = 0; i < 6; i++)
    {
        const x = 2 + Math.floor(rng() * 12);
        const y = 2 + Math.floor(rng() * 10);
        if (g[y][x] === 'L' || g[y][x] === 'h') g[y][x] = 'M';
    }

    return g.map((r) => r.join(''));
}

const TILE_TREE: SpriteDef = {
    pixels: makeClumpyTree(1),
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

// Pine-conifer — Odd Realm conifers are still clumpy but more vertically
// stacked: 3 clumps roughly along a vertical axis, slightly asymmetric.
const TILE_TREE_PINE: SpriteDef = {
    pixels: makeClumpyTree(2),
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

// Small bush — a single small round clump, no trunk.
const TILE_BUSH: SpriteDef = {
    pixels: (() => {
        const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill('g'));
        const rng = mulberry32(0xb75d00b1);
        clump(g, 7, 5, 3, 'L', rng);
        for (let y = 0; y < 16; y++)
        {
            for (let x = 0; x < 16; x++)
            {
                if (g[y][x] !== 'L') continue;
                const above = y > 0 ? g[y - 1][x] : 'g';
                const below = y < 15 ? g[y + 1][x] : 'g';
                if (above === 'g') g[y][x] = 'h';
                else if (below === 'g') g[y][x] = 'D';
            }
        }
        return g.map((r) => r.join(''));
    })(),
    palette: {
        '.': PALETTE.grassBase,
        g: PALETTE.grassMid,
        h: PALETTE.leafHi,
        L: PALETTE.leafBase,
        M: PALETTE.leafMid,
        D: PALETTE.leafShd,
    },
};

// Sand-water edge — sand on top, water on bottom, with a foam line and the
// proper water banding (Hi → Base → Mid → Shd) so coastlines read continuous
// with the rest of the water. The sand uses the same palette as the sand
// variants: base, hi (pebble highlights), shd (darker pebble clusters),
// and a sandMid (medium tan) for the wet sand strip at the waterline.
const TILE_SAND_WATER: SpriteDef = {
    pixels: [
        'S....S....s....', //  0 — sand top
        '.S.............',
        '...s.......S...',
        '........S......',
        '..S............',
        '..........s....',
        '.....S.........',
        '........S......', //  7 — sand bottom
        'sssssssssssssss', //  8 — wet sand (mid) strip
        'HHHHHHHHHHHHHHH', //  9 — foam line (waterHi)
        'WBWBWBWBWBWBWBW', // 10 — water hi band with foam dots
        'WWWWWWWWWWWWWWW', // 11 — water base band
        'WWWWWWWWWWWWWWW', // 12
        'WWWWWWWWWWWWWWW', // 13 — water mid
        'WWWWWWWWWWWWWWW', // 14 — water shd
        'WWWWWWWWWWWWWWW', // 15
    ],
    palette: {
        '.': PALETTE.sandBase,
        S: PALETTE.sandHi,
        s: PALETTE.sandMid,
        H: PALETTE.waterHi,
        B: PALETTE.waterBase,
        W: PALETTE.waterMid,
    },
};

// Grass-sand edge — dithered transition (Odd Realm style).
// Rows 0-6 are grass; rows 9-15 are sand; rows 7-8 are a dithered mix
// checkerboard of grass and sand pixels. This is the "painted" look that
// Odd Realm uses at biome boundaries.
const TILE_GRASS_SAND: SpriteDef = {
    pixels: [
        'g.gg.g.gg.g.gg.g', //  0 — grass top w/ scattered tufts
        'g.g.g.ggg.g.g.gg',
        'g.gg.g.g.gg.g.gg',
        'g.g.gg.g.g.g.g.g',
        'g.g.g.g.gg.gg.g.',
        'g.gg.g.g.g.gg.gg',
        'g.g.g.gg.g.g.g.g', //  6
        'gsgsgsgsgsgsgsgs', //  7 — dithered transition row
        'sgsgsgsgsgsgsgsg', //  8 — dithered transition row (flipped phase)
        '..S..s....s..S..', //  9 — sand starts
        '..s....S..s..s.',
        '...S..s....S....',
        '..s....S..s..S..',
        '....S..s..S..s..',
        '..s..S....s..S..', // 14
        '...S..s....s....', // 15
    ],
    palette: {
        '.': PALETTE.sandBase,
        S: PALETTE.sandHi,
        s: PALETTE.sandMid,
        g: PALETTE.grassMid,
    },
};

// Wall — masonry pattern with a clear bevel. Every row of bricks has a
// 1-px light cap on top (the lit edge) and a 1-px shadow on the bottom
// (the unlit edge), so the wall reads as a stack of 3D blocks. Vertical
// mortar lines run between brick columns. Exposed sides get a 2-px band
// of the wall's vertical face (dark stone).
function makeWallVariant (n: 0 | 1, e: 0 | 1, s: 0 | 1, w: 0 | 1): SpriteDef
{
    // 3 brick rows × 5 rows each, alternating vertical-mortar offset.
    // Row layout: 0=highlight cap, 1-3=brick body, 4=shadow + horizontal mortar.
    // Vertical mortar at x=4, 8, 12 (3-px wide bricks) or x=2, 7, 12 (offset).
    const base: string[] = [
        'HHHHHHHHHHHHHHHH', // 0  — top highlight
        'Hhhohhhohhhohhho', // 1  — body (mortar @ 4,8,12)
        'Hhhohhhohhhohhho', // 2
        'Hhhohhhohhhohhho', // 3
        'ssssoosssoosssss', // 4  — bottom shadow + horizontal mortar
        'Hhohhhhohhhhohhho', // 5  — body, offset (mortar @ 2,7,12)
        'Hhohhhhohhhhohhho', // 6
        'Hhohhhhohhhhohhho', // 7
        'Hhohhhhohhhhohhho', // 8
        'ssossssosssssosss', // 9  — shadow + mortar, offset
        'Hhhohhhohhhohhho', // 10 — body, back to first offset
        'Hhhohhhohhhohhho', // 11
        'Hhhohhhohhhohhho', // 12
        'Hhhohhhohhhohhho', // 13
        'Hhhohhhohhhohhho', // 14
        'ssssssssssssssss', // 15 — bottom shadow band
    ];
    const out = base.map((r) => r.split(''));

    // Caps: exposed sides get a 2-px band of dark stone (the wall's face).
    if (!n)
    {
        for (let x = 0; x < 16; x++) { out[0][x] = 'o'; out[1][x] = 'o'; }
    }
    if (!s)
    {
        for (let x = 0; x < 16; x++) { out[15][x] = 'o'; out[14][x] = 'o'; }
    }
    if (!w)
    {
        for (let y = 0; y < 16; y++) { out[y][0] = 'o'; out[y][1] = 'o'; }
    }
    if (!e)
    {
        for (let y = 0; y < 16; y++) { out[y][15] = 'o'; out[y][14] = 'o'; }
    }
    return { pixels: out.map((r) => r.join('')), palette: {
        o: PALETTE.stoneMShd,
        H: PALETTE.stoneMHi,
        h: PALETTE.stoneMBase,
        s: PALETTE.stoneMMid,
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

// Particle leaf — tiny 3x3 leaf, two-tone for cheap shading. The atmosphere
// system spawns a few of these and drifts them across the screen so the world
// feels alive even though the trees themselves are baked into the static
// world-composite canvas.
const PARTICLE_LEAF: SpriteDef = {
    pixels: [
        '.hL',
        'hLM',
        '.M.',
    ],
    palette: {
        h: PALETTE.leafHi,
        L: PALETTE.leafBase,
        M: PALETTE.leafMid,
    },
};

// -----------------------------------------------------------------------------
// DECORATION SPRITES — 6x6, scattered on grass/dirt tiles as environmental
// clutter. Read small at the world zoom level — a single fern sprig, a
// pebble cluster, a mushroom, a fallen twig.
// -----------------------------------------------------------------------------

const DECO_FERN_0: SpriteDef = {
    pixels: [
        '......',
        '..h...',
        '.hLh..',
        '.hLM..',
        '.hLMh.',
        '..M...',
    ],
    palette: {
        h: PALETTE.leafHi,
        L: PALETTE.leafBase,
        M: PALETTE.leafMid,
    },
};
const DECO_FERN_1: SpriteDef = {
    pixels: [
        '......',
        '.h....',
        'hLM...',
        'hLMh..',
        '.LMh..',
        '..M...',
    ],
    palette: {
        h: PALETTE.leafHi,
        L: PALETTE.leafBase,
        M: PALETTE.leafMid,
    },
};
const DECO_FERN_2: SpriteDef = {
    pixels: [
        '......',
        '..h...',
        '.hLM..',
        'hLMM..',
        '.LMM..',
        '..M...',
    ],
    palette: {
        h: PALETTE.leafHi,
        L: PALETTE.leafBase,
        M: PALETTE.leafMid,
    },
};

// Pebble cluster — small ovals with one bright highlight each.
const DECO_PEBBLE_0: SpriteDef = {
    pixels: [
        '......',
        '......',
        '.s....',
        'sh....',
        '.h....',
        '......',
    ],
    palette: {
        s: PALETTE.stoneShd,
        h: PALETTE.stoneHi,
    },
};
const DECO_PEBBLE_1: SpriteDef = {
    pixels: [
        '......',
        '......',
        '..sh..',
        '.shh..',
        '..s...',
        '......',
    ],
    palette: {
        s: PALETTE.stoneShd,
        h: PALETTE.stoneHi,
    },
};
const DECO_PEBBLE_2: SpriteDef = {
    pixels: [
        '......',
        '......',
        '.sh...',
        'shh...',
        '.ss...',
        '......',
    ],
    palette: {
        s: PALETTE.stoneShd,
        h: PALETTE.stoneHi,
    },
};

// Mushroom — small red cap with white dot on top, brown stem.
const DECO_MUSHROOM_0: SpriteDef = {
    pixels: [
        '......',
        '..r...',
        '.rRr..',
        '.rWr..',
        '..k...',
        '..k...',
    ],
    palette: {
        r: '#c83028',
        R: '#e85040',
        W: '#f8f8f8',
        k: '#5a3818',
    },
};
const DECO_MUSHROOM_1: SpriteDef = {
    pixels: [
        '......',
        '.rR...',
        'rRRr..',
        'rWRr..',
        '..k...',
        '..k...',
    ],
    palette: {
        r: '#c83028',
        R: '#e85040',
        W: '#f8f8f8',
        k: '#5a3818',
    },
};
const DECO_MUSHROOM_2: SpriteDef = {
    pixels: [
        '......',
        '..r...',
        '.rRr..',
        '.rWr..',
        '..kk..',
        '..k...',
    ],
    palette: {
        r: '#c83028',
        R: '#e85040',
        W: '#f8f8f8',
        k: '#5a3818',
    },
};

// Twig — a short curved stick lying on the ground.
const DECO_TWIG_0: SpriteDef = {
    pixels: [
        '......',
        '......',
        '......',
        '.hh...',
        'sss...',
        '......',
    ],
    palette: {
        h: PALETTE.woodHi,
        s: PALETTE.woodShd,
    },
};
const DECO_TWIG_1: SpriteDef = {
    pixels: [
        '......',
        '......',
        '......',
        '..hh..',
        '.sss..',
        '......',
    ],
    palette: {
        h: PALETTE.woodHi,
        s: PALETTE.woodShd,
    },
};
const DECO_TWIG_2: SpriteDef = {
    pixels: [
        '......',
        '......',
        '..h...',
        '.hh...',
        'sss...',
        '......',
    ],
    palette: {
        h: PALETTE.woodHi,
        s: PALETTE.woodShd,
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
                ...grassPalette(),
                // Decoration keys for grass-with-* variants
                p: '#f8d0e8', // flower pink
                y: '#f8e838', // flower yellow center
                r: '#7a5468', // rock shadow (plum, matches Odd Realm pebble)
                R: '#a87aa8', // rock highlight (purple, matches stone family)
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

    // Atmosphere particles
    registerPixelSprite(scene, 'particle-leaf', PARTICLE_LEAF);

    // Decorations — 3 variants each for fern, pebble, mushroom, twig
    registerPixelSprite(scene, 'deco-fern-0', DECO_FERN_0);
    registerPixelSprite(scene, 'deco-fern-1', DECO_FERN_1);
    registerPixelSprite(scene, 'deco-fern-2', DECO_FERN_2);
    registerPixelSprite(scene, 'deco-pebble-0', DECO_PEBBLE_0);
    registerPixelSprite(scene, 'deco-pebble-1', DECO_PEBBLE_1);
    registerPixelSprite(scene, 'deco-pebble-2', DECO_PEBBLE_2);
    registerPixelSprite(scene, 'deco-mushroom-0', DECO_MUSHROOM_0);
    registerPixelSprite(scene, 'deco-mushroom-1', DECO_MUSHROOM_1);
    registerPixelSprite(scene, 'deco-mushroom-2', DECO_MUSHROOM_2);
    registerPixelSprite(scene, 'deco-twig-0', DECO_TWIG_0);
    registerPixelSprite(scene, 'deco-twig-1', DECO_TWIG_1);
    registerPixelSprite(scene, 'deco-twig-2', DECO_TWIG_2);
}

// -----------------------------------------------------------------------------
// Tile variant selection (used by world-renderer to pick a tile-grass variant
// deterministically per tile coordinate).
// -----------------------------------------------------------------------------

export const TILE_VARIANT_KEYS: Partial<Record<number, string[]>> = {
    [TileType.Grass]: [
        'tile-grass-0','tile-grass-1','tile-grass-2','tile-grass-3',
        'tile-grass-4','tile-grass-5','tile-grass-6','tile-grass-7',
        'tile-grass-8','tile-grass-9','tile-grass-10','tile-grass-11',
    ],
    [TileType.Dirt]: ['tile-dirt-0', 'tile-dirt-1', 'tile-dirt-2', 'tile-dirt-3'],
    [TileType.Stone]: ['tile-stone-0', 'tile-stone-1', 'tile-stone-2', 'tile-stone-3', 'tile-stone-4', 'tile-stone-5'],
    [TileType.Water]: ['tile-water-0', 'tile-water-1', 'tile-water-2', 'tile-water-3'],
    [TileType.Sand]: ['tile-sand-0', 'tile-sand-1', 'tile-sand-2', 'tile-sand-3'],
    [TileType.Snow]: ['tile-snow-0', 'tile-snow-1', 'tile-snow-2', 'tile-snow-3'],
};

export function getTileTextureKey(type: TileType, tx: number, ty: number): string {
    const variants = TILE_VARIANT_KEYS[type];
    if (variants && variants.length > 0) {
        // PCG-style 2D hash: gives uniform distribution across a 10x10 region
        // even when tx and ty vary by 1. The previous XOR hash had bad
        // adjacent-tile collisions, causing visible "diamond carpet" patterns.
        let h = Math.imul((tx | 0) ^ ((ty | 0) * 40503), 2654435761);
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        return variants[((h ^ (h >>> 16)) >>> 0) % variants.length];
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

// Decoration texture keys — indexed by kind + variant. Used by
// DecorationRenderer to map a DecorationEntry to its sprite key.
export const DECORATION_TEXTURE_KEYS: Record<string, Record<number, string>> = {
    fern: { 0: 'deco-fern-0', 1: 'deco-fern-1', 2: 'deco-fern-2' },
    pebble: { 0: 'deco-pebble-0', 1: 'deco-pebble-1', 2: 'deco-pebble-2' },
    'mushroom-deco': { 0: 'deco-mushroom-0', 1: 'deco-mushroom-1', 2: 'deco-mushroom-2' },
    twig: { 0: 'deco-twig-0', 1: 'deco-twig-1', 2: 'deco-twig-2' },
};

// Display size (in pixels) for each decoration kind. These are smaller than
// the full tile so they read as clutter sitting on the ground rather than
// objects replacing the tile.
export const DECORATION_DISPLAY_SIZE: Record<string, number> = {
    fern: 10,
    pebble: 8,
    'mushroom-deco': 9,
    twig: 10,
};
