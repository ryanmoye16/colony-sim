// Render a contact sheet of the new sprites to /tmp/sprites-contact.svg
// by reading the procedural logic directly. No TS imports to keep it simple.
import { mkdirSync, writeFileSync } from 'node:fs';

const PALETTE = {
    skinHi: '#fce0c4', skinBase: '#e8b89a', skinMid: '#c89274', skinShd: '#8e5a3e', skinOut: '#5e3422',
    hairHi: '#7a4a2a', hairBase: '#4a2614', hairShd: '#2a1408',
    bootHi: '#5a3a1a', bootBase: '#3a2410', bootShd: '#1f1408',
    belt: '#2a1a08',
    // Odd Realm palette — bruised plum earth, lime multi-tone grass, purple stone.
    earthHi: '#a87a6a', earthBase: '#7a4a44', earthMid: '#4a2840', earthShd: '#2a1430', earthOut: '#18081c',
    grassHi: '#bcd84a', grassBase: '#7eb838', grassMid: '#4a8a2a', grassShd: '#2a5a1c',
    leafHi: '#a8d850', leafBase: '#6aa838', leafMid: '#3e7820', leafShd: '#1f4a14', leafOut: '#102e0a',
    woodHi: '#a87454', woodBase: '#7a4a30', woodMid: '#4a2a18', woodShd: '#26140a',
    stoneHi: '#c89ac8', stoneBase: '#8a5a90', stoneMid: '#5e3068', stoneShd: '#3a1844', stoneOut: '#1a0824',
    waterHi: '#8ce4f8', waterBase: '#3868a8', waterMid: '#1f3a78', waterShd: '#0e1c44',
    sandHi: '#f4e0a8', sandBase: '#dcc078', sandMid: '#b89048', sandShd: '#8a6428',
    snowHi: '#f8f8fc', snowBase: '#d4c8e0', snowMid: '#9888b4', snowShd: '#5a4878',
    stoneMHi: '#a87aa8', stoneMBase: '#6a3c70', stoneMMid: '#421e4a', stoneMShd: '#1c0a26',
};

// Mulberry32 RNG
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function setPx(row, x, ch) {
    return row.slice(0, x) + ch + row.slice(x + 1);
}

// === NEW procedural functions (copy of the source) ===

function makeGrassVariant(seed) {
    const rng = mulberry32(seed * 0x9e3779b1);
    const g = Array.from({ length: 16 }, () => Array(16).fill('.'));
    // Dithered olive shadow patches (Odd Realm style, random phase)
    const patchCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < patchCount; i++) {
        const cx = 1 + Math.floor(rng() * 12);
        const cy = 1 + Math.floor(rng() * 12);
        const w = 3 + Math.floor(rng() * 3);
        const h = 3 + Math.floor(rng() * 3);
        const phase = rng() < 0.5 ? 0 : 1;
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const x = cx + dx, y = cy + dy;
                if (x > 15 || y > 15) continue;
                if ((dx + dy + phase) % 2 === 0) g[y][x] = 's';
                else g[y][x] = '.';
            }
        }
    }
    // Vertical 2-px grass blades (lime tip + olive base)
    const tuftCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < tuftCount; i++) {
        const cx = 1 + Math.floor(rng() * 14);
        const cy = 1 + Math.floor(rng() * 13);
        g[cy][cx] = 'l';
        if (cy + 1 < 16) g[cy + 1][cx] = 'g';
    }
    // Single lime blades
    for (let i = 0; i < 3; i++) {
        const cx = 1 + Math.floor(rng() * 14);
        const cy = 1 + Math.floor(rng() * 14);
        if (g[cy][cx] === '.') g[cy][cx] = 'l';
    }
    // Lime speckles
    for (let i = 0; i < 5; i++) {
        const cx = 1 + Math.floor(rng() * 14);
        const cy = 1 + Math.floor(rng() * 14);
        if (g[cy][cx] === '.') g[cy][cx] = 'l';
    }
    return g.map((r) => r.join(''));
}

function makeDecoratedGrass(seed, deco) {
    const rows = makeGrassVariant(seed);
    const h = ((seed * 246343) ^ 0xbeef) >>> 0;
    const cx = 4 + (h % 8);
    const cy = 4 + ((h >>> 4) % 8);
    if (deco === 'flower') {
        rows[cy - 1] = setPx(rows[cy - 1], cx, 'p');
        rows[cy + 1] = setPx(rows[cy + 1], cx, 'p');
        rows[cy] = setPx(rows[cy], cx - 1, 'p');
        rows[cy] = setPx(rows[cy], cx + 1, 'p');
        rows[cy] = setPx(rows[cy], cx, 'y');
    } else if (deco === 'rock') {
        const placements = [[0,0,'h'],[1,0,'h'],[2,0,'h'],[0,1,'R'],[1,1,'R'],[2,1,'h']];
        for (const [dx, dy, ch] of placements) {
            const x = cx + dx, y = cy + dy;
            if (x < 15 && y < 15 && x > 0 && y > 0) rows[y] = setPx(rows[y], x, ch);
        }
    } else {
        rows[cy] = setPx(rows[cy], cx - 1, 'M');
        rows[cy] = setPx(rows[cy], cx, 'M');
        rows[cy] = setPx(rows[cy], cx + 1, 'M');
        rows[cy + 1] = setPx(rows[cy + 1], cx, 'W');
        rows[cy + 2] = setPx(rows[cy + 2], cx, 'k');
        rows[cy + 3] = setPx(rows[cy + 3], cx, 'k');
    }
    return rows;
}

function makeDirtVariant(seed) {
    const rng = mulberry32(seed * 0x85ebca6b);
    const g = Array.from({ length: 16 }, () => Array(16).fill('.'));
    for (let x = 0; x < 16; x++) g[0][x] = 'h';
    for (let x = 0; x < 16; x++) g[15][x] = 'd';
    for (let y = 1; y < 15; y++) { g[y][0] = '.'; g[y][15] = '.'; }
    const pebbleCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < pebbleCount; i++) {
        const cx = 2 + Math.floor(rng() * 12);
        const cy = 2 + Math.floor(rng() * 12);
        g[cy][cx] = 'h';
        g[cy][cx + 1] = 'h';
        g[cy + 1][cx] = 's';
        g[cy + 1][cx + 1] = 'd';
    }
    const crackCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < crackCount; i++) {
        const cy = 3 + Math.floor(rng() * 10);
        const cx = 2 + Math.floor(rng() * 10);
        const len = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < len && cx + k < 14; k++) g[cy][cx + k] = 'd';
    }
    return g.map((r) => r.join(''));
}

function makeStoneVariant(seed) {
    const rng = mulberry32(seed * 0xc2b2ae35);
    const g = Array.from({ length: 16 }, () => Array(16).fill('.'));
    for (let x = 0; x < 16; x++) g[8][x] = 'o';
    for (let y = 0; y < 16; y++) g[y][8] = 'o';
    function paintBlock(x0, y0, w, h, shd, hi) {
        for (let x = x0; x < x0 + w && x < 15; x++) if (g[y0][x] !== 'o') g[y0][x] = hi;
        for (let y = y0; y < y0 + h && y < 15; y++) if (g[y][x0] !== 'o') g[y][x0] = hi;
        for (let x = x0; x < x0 + w && x < 15; x++) if (g[y0 + h - 1][x] !== 'o') g[y0 + h - 1][x] = shd;
        for (let y = y0; y < y0 + h && y < 15; y++) if (g[y][x0 + w - 1] !== 'o') g[y][x0 + w - 1] = shd;
        const speckles = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < speckles; i++) {
            const sx = x0 + 1 + Math.floor(rng() * (w - 2));
            const sy = y0 + 1 + Math.floor(rng() * (h - 2));
            if (g[sy][sx] !== 'o') g[sy][sx] = shd;
        }
    }
    paintBlock(1, 1, 7, 7, 'd', 'h');
    paintBlock(9, 1, 7, 7, 'd', 'h');
    paintBlock(1, 9, 7, 7, 'd', 'h');
    paintBlock(9, 9, 6, 6, 'd', 'h');
    for (const x of [2, 4, 6, 10, 12, 14]) {
        if (g[1][x] !== undefined && g[1][x] !== 'o') g[1][x] = 'h';
        if (g[9][x] !== undefined && g[9][x] !== 'o') g[9][x] = 'h';
    }
    return g.map((r) => r.join(''));
}

// Odd Realm clumpy-tree generator (port of makeClumpyTree in sprites.ts).
function clump(g, cx, cy, r, fill, rng) {
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 <= r * r + (rng() < 0.2 ? 1 : 0)) {
                const x = cx + dx, y = cy + dy;
                if (x < 0 || x > 15 || y < 0 || y > 15) continue;
                g[y][x] = fill;
            }
            if (dy === -r && dx === 0) {
                const x = cx + dx, y = cy + dy;
                if (x >= 0 && x <= 15 && y >= 0 && y <= 15) g[y][x] = 'h';
            }
            if (dy === r && dx === 0) {
                const x = cx + dx, y = cy + dy;
                if (x >= 0 && x <= 15 && y >= 0 && y <= 15) g[y][x] = 'D';
            }
        }
    }
}

function makeClumpyTree(seed) {
    const rng = mulberry32(seed * 0xbaadf00d);
    const g = Array.from({ length: 16 }, () => Array(16).fill('g'));
    const arrangements = [
        [[5, 5, 4], [10, 5, 4], [7, 8, 4], [3, 8, 3], [12, 8, 3]],
        [[4, 6, 4], [11, 6, 4], [7, 9, 4], [2, 9, 3], [13, 9, 3]],
        [[6, 4, 4], [10, 7, 4], [4, 9, 3], [12, 9, 3], [8, 11, 2]],
        [[5, 6, 4], [10, 6, 4], [3, 9, 3], [12, 9, 3], [7, 10, 3]],
        [[7, 5, 5], [3, 8, 3], [12, 8, 3], [5, 10, 3], [10, 10, 3]],
    ];
    const arr = arrangements[Math.floor(rng() * arrangements.length)];
    for (const [cx, cy, r] of arr) clump(g, cx, cy, r, 'L', rng);
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            if (g[y][x] !== 'L') continue;
            const above = y > 0 ? g[y - 1][x] : 'g';
            const below = y < 15 ? g[y + 1][x] : 'g';
            if (above === 'g') g[y][x] = 'h';
            else if (below === 'g') g[y][x] = 'D';
        }
    }
    for (let i = 0; i < 6; i++) {
        const x = 2 + Math.floor(rng() * 12);
        const y = 2 + Math.floor(rng() * 10);
        if (g[y][x] === 'L' || g[y][x] === 'h') g[y][x] = 'M';
    }
    return g.map((r) => r.join(''));
}

function makeWaterVariant(seed) {
    const rng = mulberry32(seed * 0x27d4eb2f);
    const g = Array.from({ length: 16 }, () => Array(16).fill('.'));

    // Per-column band offsets — small jitter per column so the boundary meanders.
    const shallowEnd = new Array(16);
    const midEnd = new Array(16);
    const baseShallow = 4 + Math.floor(rng() * 2);  // 4-5
    const baseMid = 9 + Math.floor(rng() * 2);     // 9-10
    for (let x = 0; x < 16; x++) {
        shallowEnd[x] = Math.max(2, Math.min(7, baseShallow + Math.floor(rng() * 3) - 1));
        midEnd[x] = Math.max(8, Math.min(13, baseMid + Math.floor(rng() * 3) - 1));
    }

    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
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
    for (let i = 0; i < waveCount; i++) {
        const x = Math.floor(rng() * 14);
        const cy = 1 + Math.floor(rng() * Math.max(1, shallowEnd[x] - 1));
        const len = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < len && x + k < 16; k++) g[cy][x + k] = 'h';
    }

    // 1-2 deep dark spots
    for (let i = 0; i < 2; i++) {
        const x = Math.floor(rng() * 14);
        const cy = midEnd[x] + 1 + Math.floor(rng() * Math.max(1, 16 - midEnd[x] - 2));
        if (cy < 16) g[cy][x] = 'd';
    }

    return g.map((r) => r.join(''));
}

function makeSandVariant(seed) {
    const rng = mulberry32(seed * 0x165667b1);
    const g = Array.from({ length: 16 }, () => Array(16).fill('.'));
    for (let x = 0; x < 16; x++) g[0][x] = 'h';
    for (let x = 0; x < 16; x++) g[15][x] = 'd';
    for (let y = 1; y < 15; y++) { g[y][0] = '.'; g[y][15] = '.'; }
    for (let i = 0; i < 6; i++) { const cx = 2 + Math.floor(rng() * 12); const cy = 2 + Math.floor(rng() * 12); g[cy][cx] = 'h'; }
    for (let i = 0; i < 4; i++) { const cx = 2 + Math.floor(rng() * 12); const cy = 2 + Math.floor(rng() * 12); g[cy][cx] = 'd'; }
    const cx = 3 + Math.floor(rng() * 10);
    const cy = 3 + Math.floor(rng() * 10);
    g[cy][cx] = 's';
    g[cy + 1][cx] = 's';
    return g.map((r) => r.join(''));
}

function makeSnowVariant(seed) {
    const rng = mulberry32(seed * 0xd6e8fe8a);
    const g = Array.from({ length: 16 }, () => Array(16).fill('.'));
    const driftCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < driftCount; i++) {
        const cx = 2 + Math.floor(rng() * 10);
        const cy = 4 + Math.floor(rng() * 8);
        g[cy][cx] = 'd';
        g[cy][cx + 1] = 'd';
        g[cy + 1][cx] = 'd';
        g[cy + 1][cx + 1] = 'd';
        g[cy + 2][cx] = 's';
    }
    for (let i = 0; i < 4; i++) { const cx = 2 + Math.floor(rng() * 12); const cy = 2 + Math.floor(rng() * 12); g[cy][cx] = 'h'; }
    return g.map((r) => r.join(''));
}

function makeWallVariant(n, e, s, w) {
    const base = [
        'HHHHHHHHHHHHHHHH',
        'Hhhohhhohhhohhho',
        'Hhhohhhohhhohhho',
        'Hhhohhhohhhohhho',
        'ssssoosssoosssss',
        'Hhohhhhohhhhohhho',
        'Hhohhhhohhhhohhho',
        'Hhohhhhohhhhohhho',
        'Hhohhhhohhhhohhho',
        'ssossssosssssosss',
        'Hhhohhhohhhohhho',
        'Hhhohhhohhhohhho',
        'Hhhohhhohhhohhho',
        'Hhhohhhohhhohhho',
        'Hhhohhhohhhohhho',
        'ssssssssssssssss',
    ];
    const out = base.map((r) => r.split(''));
    if (!n) { for (let x = 0; x < 16; x++) { out[0][x] = 'o'; out[1][x] = 'o'; } }
    if (!s) { for (let x = 0; x < 16; x++) { out[15][x] = 'o'; out[14][x] = 'o'; } }
    if (!w) { for (let y = 0; y < 16; y++) { out[y][0] = 'o'; out[y][1] = 'o'; } }
    if (!e) { for (let y = 0; y < 16; y++) { out[y][15] = 'o'; out[y][14] = 'o'; } }
    return out.map((r) => r.join(''));
}

const OUT = '/tmp/sprites';
mkdirSync(OUT, { recursive: true });

const grassPalette = { '.': PALETTE.grassBase, s: PALETTE.grassShd, g: PALETTE.grassMid, l: PALETTE.grassHi, p: '#f8d0e8', y: '#f8e838', r: '#7a5468', R: '#a87aa8', M: '#c83028', W: '#f8f8f8', k: '#4a2a10' };
const dirtPalette = { '.': PALETTE.earthBase, h: PALETTE.earthHi, d: PALETTE.earthShd, s: PALETTE.earthMid };
const stonePalette = { '.': PALETTE.stoneBase, h: PALETTE.stoneHi, d: PALETTE.stoneShd, o: PALETTE.stoneOut };
const waterPalette = { '.': PALETTE.waterBase, d: PALETTE.waterShd, b: PALETTE.waterMid, h: PALETTE.waterHi };
const sandPalette = { '.': PALETTE.sandBase, h: PALETTE.sandHi, d: PALETTE.sandMid, s: PALETTE.sandShd };
const snowPalette = { '.': PALETTE.snowBase, h: PALETTE.snowHi, d: PALETTE.snowMid, s: PALETTE.snowShd };
const wallPalette = { o: PALETTE.stoneMShd, H: PALETTE.stoneMHi, h: PALETTE.stoneMBase, s: PALETTE.stoneMMid };

const tiles = [
    ['grass-0', makeGrassVariant(1), grassPalette],
    ['grass-1', makeGrassVariant(2), grassPalette],
    ['grass-2', makeGrassVariant(3), grassPalette],
    ['grass-3', makeGrassVariant(4), grassPalette],
    ['grass-4', makeGrassVariant(5), grassPalette],
    ['grass-5', makeGrassVariant(6), grassPalette],
    ['grass-6', makeGrassVariant(7), grassPalette],
    ['grass-7', makeGrassVariant(8), grassPalette],
    ['grass-8', makeGrassVariant(9), grassPalette],
    ['grass-9', makeGrassVariant(10), grassPalette],
    ['grass-10', makeGrassVariant(11), grassPalette],
    ['grass-11', makeGrassVariant(12), grassPalette],
    ['grass-flower', makeDecoratedGrass(101, 'flower'), grassPalette],
    ['grass-rock', makeDecoratedGrass(202, 'rock'), grassPalette],
    ['grass-mushroom', makeDecoratedGrass(303, 'mushroom'), grassPalette],
    ['dirt-0', makeDirtVariant(1), dirtPalette],
    ['dirt-1', makeDirtVariant(2), dirtPalette],
    ['stone-0', makeStoneVariant(1), stonePalette],
    ['stone-1', makeStoneVariant(2), stonePalette],
    ['water-0', makeWaterVariant(1), waterPalette],
    ['water-1', makeWaterVariant(2), waterPalette],
    ['water-2', makeWaterVariant(3), waterPalette],
    ['water-3', makeWaterVariant(4), waterPalette],
    ['sand-0', makeSandVariant(1), sandPalette],
    ['snow-0', makeSnowVariant(1), snowPalette],
    ['wall (surrounded)', makeWallVariant(1, 0, 1, 0), wallPalette],
    ['wall straight-v', makeWallVariant(0, 1, 0, 1), wallPalette],
    ['wall corner-ne', makeWallVariant(0, 0, 1, 1), wallPalette],
    ['wall end-n', makeWallVariant(0, 0, 1, 0), wallPalette],
    ['wall cross', makeWallVariant(0, 0, 0, 0), wallPalette],
    ['tree', makeClumpyTree(1), { '.': PALETTE.grassBase, g: PALETTE.grassMid, h: PALETTE.leafHi, L: PALETTE.leafBase, M: PALETTE.leafMid, D: PALETTE.leafShd, H: PALETTE.woodBase, o: PALETTE.leafOut }],
    ['tree-pine', makeClumpyTree(2), { '.': PALETTE.grassBase, g: PALETTE.grassMid, h: PALETTE.leafHi, L: PALETTE.leafBase, M: PALETTE.leafMid, D: PALETTE.leafShd, H: PALETTE.woodBase, o: PALETTE.leafOut }],
    ['bush', (() => {
        const g = Array.from({ length: 16 }, () => Array(16).fill('g'));
        const rng = mulberry32(0xb75d00b1);
        clump(g, 7, 5, 3, 'L', rng);
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                if (g[y][x] !== 'L') continue;
                const above = y > 0 ? g[y - 1][x] : 'g';
                const below = y < 15 ? g[y + 1][x] : 'g';
                if (above === 'g') g[y][x] = 'h';
                else if (below === 'g') g[y][x] = 'D';
            }
        }
        return g.map((r) => r.join(''));
    })(), { '.': PALETTE.grassBase, g: PALETTE.grassMid, h: PALETTE.leafHi, L: PALETTE.leafBase, M: PALETTE.leafMid, D: PALETTE.leafShd }],

    // Edge tiles — coastline and biome borders
    ['sand-water', [
        'S....S....s....',
        '.S.............',
        '...s.......S...',
        '........S......',
        '..S............',
        '..........s....',
        '.....S.........',
        '........S......',
        'sssssssssssssss',
        'HHHHHHHHHHHHsss',
        'HHHHHHHHHhhssss',
        'WBWBWBWBsssssss',
        'WWWWWWWWWWsssss',
        'WWWWWWWWWWWWsss',
        'WWWWWWWWWWWWWWW',
        'WWWWWWWWWWWWWWW',
    ], { '.': PALETTE.sandBase, S: PALETTE.sandHi, s: PALETTE.sandMid, H: PALETTE.waterHi, B: PALETTE.waterBase, W: PALETTE.waterMid }],
    ['grass-sand', [
        'g.gg.g.gg.g.gg.g',
        'g.g.g.ggg.g.g.gg',
        'g.gg.g.g.gg.g.gg',
        'g.g.gg.g.g.g.g.g',
        'g.g.g.g.gg.gg.g.',
        'g.gg.g.g.g.gg.gg',
        'g.g.g.gg.g.g.g.g',
        'gsgsgsgsgsgsgsgs',
        'sgsgsgsgsgsgsgsg',
        '..S..s....s..S..',
        '..s....S..s..s.',
        '...S..s....S....',
        '..s....S..s..S..',
        '....S..s..S..s..',
        '..s..S....s..S..',
        '...S..s....s....',
    ], { '.': PALETTE.sandBase, S: PALETTE.sandHi, s: PALETTE.sandMid, g: PALETTE.grassMid }],
];

const cols = 4;
const cellW = 16 * 8 + 16;
const cellH = 16 * 8 + 24;
const rows = Math.ceil(tiles.length / cols);
let sheet = `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" width="${cols * cellW}" height="${rows * cellH}" style="background:#222;font-family:monospace">`;
tiles.forEach(([name, pixels, palette], i) => {
    const cx = (i % cols) * cellW;
    const cy = Math.floor(i / cols) * cellH;
    sheet += `<g transform="translate(${cx + 8} ${cy + 8})">`;
    for (let y = 0; y < pixels.length; y++) {
        for (let x = 0; x < pixels[y].length; x++) {
            const c = pixels[y][x];
            if (c === ' ') continue;
            const color = palette[c];
            if (!color) continue;
            sheet += `<rect x="${x * 8}" y="${y * 8}" width="8" height="8" fill="${color}"/>`;
        }
    }
    sheet += `</g><text x="${cx + 8}" y="${cy + cellH - 6}" fill="#fff" font-size="12">${name}</text>`;
});
sheet += '</svg>';

writeFileSync(`${OUT}/contact-sheet.svg`, sheet);
console.log(`Wrote ${OUT}/contact-sheet.svg`);
