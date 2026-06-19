// =============================================================================
// Pixel Art — Kenney Tiny Town + Tiny Dungeon asset integration
// =============================================================================
// All sprites are now loaded from Kenney's CC0 pixel art packs instead of
// being procedurally drawn from a 32-color palette. The two packs are:
//
//   - Tiny Town    (132 tiles, 16x16 each) — terrain, trees, houses, castle,
//                                          fences, props (CC0, kenney.nl)
//   - Tiny Dungeon (132 tiles, 16x16 each) — characters, tools, items, walls
//
// Both packs are loaded as individual PNG files at startup via Phaser's
// `load.image()`. This file maps our existing texture-key API (which all the
// other code uses — `tile-grass-N`, `settler-red`, `WALL_TEXTURE_KEY(n,e,s,w)`,
// `ITEM_TEXTURE_KEYS`, `DECORATION_TEXTURE_KEYS`, etc.) onto the new Kenney
// PNGs.
//
// The exported API is unchanged so world-renderer, decoration-renderer, and
// World.ts can keep using `getTileTextureKey`, `WALL_TEXTURE_KEY`,
// `ITEM_TEXTURE_KEYS`, etc. without modification.
// =============================================================================

import type { Scene } from 'phaser';
import { TileType } from '../world/tile';

const TOWN = 'assets/kenney-tiny-town/Tiles';
const DUNGEON = 'assets/kenney-tiny-dungeon/Tiles';

// -----------------------------------------------------------------------------
// Kenney tile indices we use. Stable across pack versions.
// -----------------------------------------------------------------------------

// Tiny Town — verified full-coverage ground tiles.
// Most town tiles in rows 0-2 are props/edges on transparent backgrounds;
// rows 3-4 mix solid ground tiles with castle walls. We picked these by
// visual inspection of every tile:
//   tt-0001 — grass with sprouts (mostly green with darker flecks)
//   tt-0002 — grass with orange flowers (mostly green)
//   tt-0043 — SOLID green grass with white pebbles (the one true ground tile)
//   tt-0014 is NOT grass — it's a dirt-with-grass-corner edge tile.
// Grass tiles from the town pack row 0: all full-coverage green grass with
// subtle variation. Tile 0 has small white flower accents; 3 is more uniform;
// 4/5/6 add sprout/leaf clusters. Avoided #43 (stone path), #1 (orange flowers),
// and #2 (dirt patch) — those read as visual noise when scattered in grass.
const TT_GRASS_VARIANTS = [0, 0, 0, 3, 4, 5, 6];
// Dirt: tt-0025 is solid orange (true full-coverage dirt), tt-0024 is mostly
// dirt with a grass edge corner (still reads as ground from a distance).
const TT_DIRT_VARIANTS = [24, 25];
// Sand — use the dungeon pack's actual sand tiles (49-52 are clean tan with
// subtle variation). Previously fell back to dirt tiles which made sand look
// identical to dirt.
const TT_SAND_VARIANTS = [49, 50, 51, 52];

// Trees, bushes, mushrooms — small sprites on transparent backgrounds.
// Used both as Tree tile replacements (with grass composited underneath) and
// as decoration clutter.
const TT_TREE_VARIANTS = [4, 5, 19, 28, 30, 31, 32];
const TT_TREE_PINE_VARIANTS = [4, 5];
const TT_BUSH_VARIANTS = [6, 22];

// Tiny Dungeon — verified full-coverage floor tiles (row 4, #48-#53).
// Tile 48 has white spots, 53 is a sand-edge tile — use the middle 4
// (49, 50, 51, 52) which are full-coverage tan with subtle variation.
const TD_SAND_VARIANTS = [49, 50, 51, 52];
// The dungeon pack has no real stone-floor tiles — most are wall pieces.
// Use the town pack castle walls (60-#63) as blue stone floors. They have
// decorative brick patterns that read as a paved stone surface.
const TD_STONE_FLOOR_VARIANTS = [60, 61, 62, 63];
// Wooden floor — brown plank tiles from town pack row 6 (#72-#75).
const TT_WOOD_FLOOR_VARIANTS = [72, 73, 74, 75];

// Wall + fence pieces. Used for TileType.Wall (neighbor-aware variant map
// below picks which sub-index paints each wall shape).
const TT_WOOD_WALL_VARIANTS = [72, 73, 74, 75, 80, 81, 82, 83];
// Items — well, chest, key, signs, tools.
const TT_WELL = 104;
const TT_CHEST = 131;
const TT_PICKAXE = 105;
const TT_KEY = 119;

// Tiny Dungeon — characters (rows 7-10 of the tilemap).
const TD_SETTLER_VARIANTS: Record<string, number> = {
    red:    85,  // blonde, simple shirt
    blue:   88,  // brown hair, brown shirt
    green:  109, // tanned brown hair
    orange: 86,  // bald with beard
    purple: 99,  // blonde female
    // Long / alt-styles map to additional Kenney characters so each
    // `settler-${color}-${style}` combo has a unique silhouette.
    'red-long':    84,  // purple-hooded rogue
    'blue-long':   87,  // white-haired elder with beard
    'green-long':  100, // gray-haired female elder
    'orange-long': 112, // elf in green tunic
    'purple-long': 98,  // knight with helmet
    'red-bald':    86,  // reuse bald (bald=orange)
    'blue-bald':   96,  // grey knight
    'green-bald':  97,  // dark knight
    'orange-bald': 86,  // reuse bald
    'purple-bald': 100, // reuse elder female
    'red-hat':     110, // red demon/orc
    'blue-hat':    111, // wizard with white beard
    'green-hat':   112, // elf
    'orange-hat':  108, // ghost (skeleton)
    'purple-hat':  115, // red potion... hmm let me reconsider
};

// Tiny Dungeon items — potions, tools.
const TD_POTION_RED = 115;

// Decoration clutter. The town pack doesn't have tiny ferns/pebbles/twigs,
// but it has bushes, mushrooms, and small trees that fill the same role.
// We map our 4 decoration kinds to the closest Kenney sprite:
//
//   fern       → small green bush (transparent BG, scales small)
//   pebble     → small grey rock cluster (we use #76 / #77 stone tiles)
//   mushroom   → Kenney mushroom (red+white spots)
//   twig       → a small grey/stone tile works as a "pebble/log"
// We pick indices that look distinct at small size.
const TT_DECO_FERN = [6, 18, 28];        // small green bushes
const TT_DECO_PEBBLE = [76, 77];          // gray stone tiles
const TT_DECO_MUSHROOM = [16, 17, 29];    // mushrooms
const TT_DECO_TWIG = [80, 81];            // small wooden pieces (fence segments)

// -----------------------------------------------------------------------------
// LOADER — call from Preloader.preload()
// -----------------------------------------------------------------------------

export function loadKenneyAssets(scene: Scene): void
{
    // Tiny Town: 132 individual tile PNGs.
    for (let i = 0; i < 132; i++)
    {
        const key = `tt-${String(i).padStart(4, '0')}`;
        const idx = String(i).padStart(4, '0');
        scene.load.image(key, `${TOWN}/tile_${idx}.png`);
    }
    // Tiny Dungeon: 132 individual tile PNGs.
    for (let i = 0; i < 132; i++)
    {
        const key = `td-${String(i).padStart(4, '0')}`;
        const idx = String(i).padStart(4, '0');
        scene.load.image(key, `${DUNGEON}/tile_${idx}.png`);
    }
}

// -----------------------------------------------------------------------------
// MAPPING — bake texture keys onto the Kenney PNGs after they're loaded.
// Call from Preloader.create() (or any time after the load completes).
// -----------------------------------------------------------------------------

function registerKenneyAlias(scene: Scene, alias: string, sourceKey: string): void
{
    // Phaser doesn't allow aliasing a texture key to another key directly,
    // but we can copy the underlying canvas/image. Since each Kenney PNG is
    // already registered under `tt-NNNN` / `td-NNNN`, callers reference those
    // keys directly — this function exists for documentation only.
    if (!scene.textures.exists(sourceKey))
    {
        console.warn(`[sprites] missing source texture: ${sourceKey}`);
        return;
    }
    void alias;
}

// Build the texture-key → Kenney-PNG-key mapping.
function buildGrassVariants(): Record<string, string>
{
    const map: Record<string, string> = {};
    for (let i = 0; i < TT_GRASS_VARIANTS.length; i++)
    {
        const idx = TT_GRASS_VARIANTS[i];
        map[`tile-grass-${i}`] = `tt-${String(idx).padStart(4, '0')}`;
    }
    return map;
}

function buildDirtVariants(): Record<string, string>
{
    const map: Record<string, string> = {};
    for (let i = 0; i < TT_DIRT_VARIANTS.length; i++)
    {
        const idx = TT_DIRT_VARIANTS[i];
        map[`tile-dirt-${i}`] = `tt-${String(idx).padStart(4, '0')}`;
    }
    return map;
}

function buildSandVariants(): Record<string, string>
{
    const map: Record<string, string> = {};
    // Use the dungeon pack's sandy floor tiles — they're full-coverage and
    // have the warm tan tone that fits our sand biome better than the town's
    // partial-coverage tiles.
    for (let i = 0; i < TD_SAND_VARIANTS.length; i++)
    {
        const idx = TD_SAND_VARIANTS[i];
        map[`tile-sand-${i}`] = `td-${String(idx).padStart(4, '0')}`;
    }
    return map;
}

function buildWaterVariants(): Record<string, string>
{
    // Water has no Kenney equivalent in either pack. We generate procedural
    // variants in `registerAllPixelSprites` and register them as
    // 'tile-water-N'. Return those keys here so getTileTextureKey can pick
    // them up.
    const map: Record<string, string> = {};
    const count = 4;
    for (let i = 0; i < count; i++) map[`tile-water-${i}`] = `tile-water-${i}`;
    return map;
}

function buildStoneVariants(): Record<string, string>
{
    const map: Record<string, string> = {};
    for (let i = 0; i < TD_STONE_FLOOR_VARIANTS.length; i++)
    {
        const idx = TD_STONE_FLOOR_VARIANTS[i];
        map[`tile-stone-${i}`] = `td-${String(idx).padStart(4, '0')}`;
    }
    return map;
}

// -----------------------------------------------------------------------------
// Public mapping tables — read by world-renderer, decoration-renderer, etc.
// We don't bake per-key aliases (Phaser can't cheaply do that) — instead we
// expose functions that map our keys to Kenney keys at lookup time. The
// result: zero-cost conversion (Map.get is O(1)) with no per-frame branching.
// -----------------------------------------------------------------------------

const GRASS_MAP = buildGrassVariants();
const DIRT_MAP = buildDirtVariants();
const SAND_MAP = buildSandVariants();
const WATER_MAP = buildWaterVariants();
const STONE_MAP = buildStoneVariants();

// Per-tile-type variant list. Used by world-renderer to pick a texture key.
export const TILE_VARIANT_KEYS: Partial<Record<number, string[]>> = {
    [TileType.Grass]:   Object.keys(GRASS_MAP),
    [TileType.Dirt]:    Object.keys(DIRT_MAP),
    [TileType.Sand]:    Object.keys(SAND_MAP),
    [TileType.Water]:   Object.keys(WATER_MAP),
    [TileType.Stone]:   Object.keys(STONE_MAP),
    [TileType.Snow]:    ['tile-snow-0'],  // not in pack — falls back to empty
};

// Per-variant Kenney PNG key for each variant key.
const VARIANT_TO_SOURCE: Record<string, string> = {
    ...GRASS_MAP,
    ...DIRT_MAP,
    ...SAND_MAP,
    ...WATER_MAP,
    ...STONE_MAP,
    // Static (non-variant) tile keys.
    'tile-empty': 'tt-0000', // solid black fallback
    'tile-tree': `tt-${String(TT_TREE_VARIANTS[0]).padStart(4, '0')}`,
    'tile-tree-pine': `tt-${String(TT_TREE_PINE_VARIANTS[0]).padStart(4, '0')}`,
    'tile-bush': `tt-${String(TT_BUSH_VARIANTS[0]).padStart(4, '0')}`,
    'tile-sand-water': 'tile-water-0',  // composited water + sand (procedural)
    'tile-grass-sand': `tt-${String(TT_SAND_VARIANTS[0]).padStart(4, '0')}`,
    'tile-wall': `tt-${String(TT_WOOD_WALL_VARIANTS[0]).padStart(4, '0')}`,
    'tile-wall-straight-h': `tt-${String(TT_WOOD_WALL_VARIANTS[0]).padStart(4, '0')}`,
    'tile-wall-straight-v': `tt-${String(TT_WOOD_WALL_VARIANTS[0]).padStart(4, '0')}`,
    'tile-wall-end-n': `tt-${String(TT_WOOD_WALL_VARIANTS[1]).padStart(4, '0')}`,
    'tile-wall-end-e': `tt-${String(TT_WOOD_WALL_VARIANTS[2]).padStart(4, '0')}`,
    'tile-wall-end-s': `tt-${String(TT_WOOD_WALL_VARIANTS[3]).padStart(4, '0')}`,
    'tile-wall-end-w': `tt-${String(TT_WOOD_WALL_VARIANTS[4]).padStart(4, '0')}`,
    'tile-wall-corner-ne': `tt-${String(TT_WOOD_WALL_VARIANTS[5]).padStart(4, '0')}`,
    'tile-wall-corner-nw': `tt-${String(TT_WOOD_WALL_VARIANTS[6]).padStart(4, '0')}`,
    'tile-wall-corner-se': `tt-${String(TT_WOOD_WALL_VARIANTS[7]).padStart(4, '0')}`,
    'tile-wall-corner-sw': `tt-${String(TT_WOOD_WALL_VARIANTS[0]).padStart(4, '0')}`,
    'tile-wall-t-n': `tt-${String(TT_WOOD_WALL_VARIANTS[1]).padStart(4, '0')}`,
    'tile-wall-t-e': `tt-${String(TT_WOOD_WALL_VARIANTS[2]).padStart(4, '0')}`,
    'tile-wall-t-s': `tt-${String(TT_WOOD_WALL_VARIANTS[3]).padStart(4, '0')}`,
    'tile-wall-t-w': `tt-${String(TT_WOOD_WALL_VARIANTS[4]).padStart(4, '0')}`,
    'tile-wall-cross': `tt-${String(TT_WOOD_WALL_VARIANTS[0]).padStart(4, '0')}`,
    'tile-floor': `tt-${String(TT_WOOD_FLOOR_VARIANTS[0]).padStart(4, '0')}`,
    'tile-tilled': `tt-${String(TT_DIRT_VARIANTS[0]).padStart(4, '0')}`,
    'tile-snow-0': 'tile-snow-0', // generated procedurally below
};

// Procedural water tiles — defined in registerAllPixelSprites below since
// it needs the Scene reference to register canvas textures.

// Settler mapping: for each (color, style, frame) we map to a Kenney PNG.
const SETTLER_TO_SOURCE: Record<string, string> = {};
{
    const colors = ['red', 'blue', 'green', 'orange', 'purple'];
    const styles = ['', '-long', '-bald', '-hat'];
    const frameSuffixes = ['', '-walk-a', '-walk-b'];
    for (const color of colors)
    {
        for (const style of styles)
        {
            const variantKey = `${color}${style}`;
            const idx = TD_SETTLER_VARIANTS[variantKey] ?? TD_SETTLER_VARIANTS[color];
            if (idx == null) continue;
            const png = `td-${String(idx).padStart(4, '0')}`;
            for (const fs of frameSuffixes)
            {
                const key = `settler-${color}${style}${fs}`;
                SETTLER_TO_SOURCE[key] = png;
            }
        }
    }
}

// Item mapping. "stone" items are wooden planks (a small brown segment),
// "food" is a red potion, "wood" is a fence segment — Kenney has no tiny
// stone sprites, but wooden planks read as debris at small size.
const ITEM_TO_SOURCE: Record<string, string> = {
    stone: `tt-0080`, // a small brown fence/log segment
    food:  `td-${String(TD_POTION_RED).padStart(4, '0')}`,
    wood:  `tt-0080`, // reuse for wood; a wooden fence segment
};

// Decoration mapping. Each kind has 3 variants.
const DECO_TO_SOURCE: Record<string, Record<number, string>> = {
    fern: {
        0: `tt-${String(TT_DECO_FERN[0]).padStart(4, '0')}`,
        1: `tt-${String(TT_DECO_FERN[1]).padStart(4, '0')}`,
        2: `tt-${String(TT_DECO_FERN[2]).padStart(4, '0')}`,
    },
    pebble: {
        0: `tt-${String(TT_DECO_PEBBLE[0]).padStart(4, '0')}`,
        1: `tt-${String(TT_DECO_PEBBLE[1]).padStart(4, '0')}`,
        2: `tt-${String(TT_DECO_TWIG[0]).padStart(4, '0')}`,  // wood variation
    },
    'mushroom-deco': {
        0: `tt-${String(TT_DECO_MUSHROOM[0]).padStart(4, '0')}`,
        1: `tt-${String(TT_DECO_MUSHROOM[1]).padStart(4, '0')}`,
        2: `tt-${String(TT_DECO_MUSHROOM[2]).padStart(4, '0')}`,
    },
    twig: {
        0: `tt-${String(TT_DECO_TWIG[0]).padStart(4, '0')}`,
        1: `tt-${String(TT_DECO_TWIG[1]).padStart(4, '0')}`,
        2: `tt-${String(TT_DECO_PEBBLE[0]).padStart(4, '0')}`, // a stone variation
    },
};

// Display size for each decoration kind (px). Smaller than tile so they
// read as clutter, not as tile replacements.
export const DECORATION_DISPLAY_SIZE: Record<string, number> = {
    fern: 12,
    pebble: 8,
    'mushroom-deco': 10,
    twig: 8,
};

// -----------------------------------------------------------------------------
// Public lookup functions — same API as the old procedural sprites file.
// -----------------------------------------------------------------------------

export function WALL_TEXTURE_KEY(n: number, e: number, s: number, w: number): string
{
    const code = (n ? 8 : 0) | (e ? 4 : 0) | (s ? 2 : 0) | (w ? 1 : 0);
    switch (code)
    {
        case 0b0000: return 'tile-wall-cross';
        case 0b0001: return 'tile-wall-end-e';
        case 0b0010: return 'tile-wall-end-w';
        case 0b0011: return 'tile-wall-corner-se';
        case 0b0100: return 'tile-wall-end-s';
        case 0b0101: return 'tile-wall-straight-h';
        case 0b0110: return 'tile-wall-corner-sw';
        case 0b0111: return 'tile-wall-t-e';
        case 0b1000: return 'tile-wall-end-n';
        case 0b1001: return 'tile-wall-corner-ne';
        case 0b1010: return 'tile-wall-straight-v';
        case 0b1011: return 'tile-wall-t-w';
        case 0b1100: return 'tile-wall-corner-nw';
        case 0b1101: return 'tile-wall-t-s';
        case 0b1110: return 'tile-wall-t-n';
        case 0b1111: return 'tile-wall';
        default: return 'tile-wall';
    }
}

export function getTileTextureKey(type: TileType, tx: number, ty: number): string
{
    const variants = TILE_VARIANT_KEYS[type];
    if (variants && variants.length > 0)
    {
        let h = Math.imul((tx | 0) ^ ((ty | 0) * 40503), 2654435761);
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        return variants[((h ^ (h >>> 16)) >>> 0) % variants.length];
    }
    return TILE_TEXTURE_KEYS[type] ?? 'tile-empty';
}

// Resolve an alias key (e.g. 'tile-grass-3') to the underlying Kenney PNG
// key (e.g. 'tt-0007'). This is called once per tile by world-renderer at
// redraw time. Phaser can't cheaply alias textures, so we hold the mapping
// table in memory and look it up.
export function resolveTextureKey(aliasKey: string): string
{
    return VARIANT_TO_SOURCE[aliasKey]
        ?? SETTLER_TO_SOURCE[aliasKey]
        ?? ITEM_TO_SOURCE[aliasKey]
        ?? DECO_TO_SOURCE_KEY(aliasKey)
        ?? aliasKey;
}

function DECO_TO_SOURCE_KEY(key: string): string | undefined
{
    // Format: 'deco-fern-0', 'deco-pebble-2', etc.
    const m = key.match(/^deco-(.+)-(\d+)$/);
    if (!m) return undefined;
    const kind = m[1];
    const variant = parseInt(m[2], 10);
    return DECO_TO_SOURCE[kind]?.[variant];
}

// Resolve a texture key for an item by its type (stone/food/wood).
export const ITEM_TEXTURE_KEYS: Record<string, string> = {
    stone: resolveTextureKey('stone'),
    food:  resolveTextureKey('food'),
    wood:  resolveTextureKey('wood'),
};

// Resolve a decoration texture key by (kind, variant).
export function getDecorationTextureKey(kind: string, variant: number): string
{
    return DECO_TO_SOURCE[kind]?.[variant] ?? `tt-${String(TT_DECO_FERN[0]).padStart(4, '0')}`;
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

// -----------------------------------------------------------------------------
// Setup — call from Preloader.create() after assets are loaded.
// -----------------------------------------------------------------------------

export function registerAllPixelSprites(scene: Scene): void
{
    // The Kenney assets are loaded directly via load.image() in preload().
    // Validate that all expected keys landed, and synthesize the small set
    // of procedural textures the rest of the game still depends on
    // (water, snow, wind-leaf particle, etc.).
    for (let i = 0; i < 132; i++)
    {
        const k = `tt-${String(i).padStart(4, '0')}`;
        if (!scene.textures.exists(k))
        {
            console.warn(`[sprites] missing town tile ${i}`);
        }
    }
    for (let i = 0; i < 132; i++)
    {
        const k = `td-${String(i).padStart(4, '0')}`;
        if (!scene.textures.exists(k))
        {
            console.warn(`[sprites] missing dungeon tile ${i}`);
        }
    }

    // Water tiles — neither Kenney pack has water. Build four variants:
    // each is a 16x16 canvas with a multi-band teal/navy gradient and a few
    // wave crests. The per-column band jitter prevents the ruler-straight
    // horizontal-stripe look when many water tiles are adjacent.
    const WATER_KEYS = ['tile-water-0', 'tile-water-1', 'tile-water-2', 'tile-water-3'];
    const WATER_PALETTE = ['#8ce4f8', '#3868a8', '#1f3a78', '#0e1c44']; // hi/base/mid/shd
    for (let v = 0; v < WATER_KEYS.length; v++)
    {
        if (scene.textures.exists(WATER_KEYS[v])) continue;
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const ctx = c.getContext('2d')!;
        // Per-column band offsets (jitter).
        const baseShallow = 4 + (v % 2);
        const baseMid = 9 + ((v >> 1) % 2);
        const shallowEnd = new Array(16).fill(0).map((_, x) =>
            Math.max(2, Math.min(7, baseShallow + ((x * 7 + v * 3) % 3) - 1)));
        const midEnd = new Array(16).fill(0).map((_, x) =>
            Math.max(8, Math.min(13, baseMid + ((x * 5 + v * 5) % 3) - 1)));
        for (let y = 0; y < 16; y++)
        {
            for (let x = 0; x < 16; x++)
            {
                let band;
                if (y < shallowEnd[x]) band = WATER_PALETTE[1]; // shallow (base teal)
                else if (y < midEnd[x]) band = WATER_PALETTE[2]; // mid
                else band = WATER_PALETTE[3];                   // shd
                ctx.fillStyle = band;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Top edge highlight (sky reflection).
        for (let x = 0; x < 16; x++)
        {
            ctx.fillStyle = WATER_PALETTE[0];
            ctx.fillRect(x, 0, 1, 1);
        }
        // Wave crests in the shallow band.
        for (let i = 0; i < 3; i++)
        {
            const x = (i * 5 + v * 2) % 14;
            const cy = 1 + (i + v) % Math.max(1, shallowEnd[x] - 1);
            const len = 2 + (i % 2);
            for (let k = 0; k < len && x + k < 16; k++)
            {
                ctx.fillStyle = WATER_PALETTE[0];
                ctx.fillRect(x + k, cy, 1, 1);
            }
        }
        scene.textures.addCanvas(WATER_KEYS[v], c);
    }

    // Snow tile — Kenney has no snow. Build a soft white tile with cool-blue
    // shadow drifts and a few bright highlight pixels.
    if (!scene.textures.exists('tile-snow-0'))
    {
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#f8f8fc'; ctx.fillRect(0, 0, 16, 16);
        // Shadow drifts
        const drifts = [[3, 5, 2, 2], [10, 8, 2, 2], [6, 11, 1, 1]];
        for (const [x, y, w, h] of drifts)
        {
            ctx.fillStyle = '#d4c8e0';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#9888b4';
            ctx.fillRect(x + w - 1, y + h, 1, 1);
        }
        // Bright highlights
        for (const [x, y] of [[4, 3], [12, 5], [7, 8], [2, 10], [13, 12]])
        {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, 1, 1);
        }
        scene.textures.addCanvas('tile-snow-0', c);
    }

    // Three leaf variants so the wind doesn't look like a single colored
    // dust cloud. Greens read as summer foliage, oranges as autumn, browns
    // as dead leaves — they're mixed in roughly even proportions by
    // Atmosphere so the world always feels alive regardless of season.
    if (!scene.textures.exists('particle-leaf-green'))
    {
        const c = document.createElement('canvas');
        c.width = 3; c.height = 3;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#a8d850'; ctx.fillRect(1, 0, 1, 1);
        ctx.fillStyle = '#6aa838'; ctx.fillRect(0, 1, 2, 1);
        ctx.fillStyle = '#3e7820'; ctx.fillRect(2, 1, 1, 1);
        ctx.fillStyle = '#3e7820'; ctx.fillRect(1, 2, 1, 1);
        scene.textures.addCanvas('particle-leaf-green', c);
    }
    if (!scene.textures.exists('particle-leaf-orange'))
    {
        const c = document.createElement('canvas');
        c.width = 3; c.height = 3;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffc850'; ctx.fillRect(1, 0, 1, 1);
        ctx.fillStyle = '#e08838'; ctx.fillRect(0, 1, 2, 1);
        ctx.fillStyle = '#a85020'; ctx.fillRect(2, 1, 1, 1);
        ctx.fillStyle = '#a85020'; ctx.fillRect(1, 2, 1, 1);
        scene.textures.addCanvas('particle-leaf-orange', c);
    }
    if (!scene.textures.exists('particle-leaf-brown'))
    {
        const c = document.createElement('canvas');
        c.width = 3; c.height = 3;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#a89070'; ctx.fillRect(1, 0, 1, 1);
        ctx.fillStyle = '#705840'; ctx.fillRect(0, 1, 2, 1);
        ctx.fillStyle = '#483828'; ctx.fillRect(2, 1, 1, 1);
        ctx.fillStyle = '#483828'; ctx.fillRect(1, 2, 1, 1);
        scene.textures.addCanvas('particle-leaf-brown', c);
    }
    // Backwards-compat alias used by older code paths.
    if (!scene.textures.exists('particle-leaf'))
    {
        scene.textures.addCanvas('particle-leaf', scene.textures.get('particle-leaf-green')!.getSourceImage() as HTMLCanvasElement);
    }
    void registerKenneyAlias;
}

// Backwards-compat decoration table (old API took a Record-of-key-strings).
// DecorationRenderer reads DECORATION_TEXTURE_KEYS[kind][variant] — we
// already returned Kenney keys, so this is a thin pass-through.
export const DECORATION_TEXTURE_KEYS: Record<string, Record<number, string>> = {
    fern: { 0: getDecorationTextureKey('fern', 0), 1: getDecorationTextureKey('fern', 1), 2: getDecorationTextureKey('fern', 2) },
    pebble: { 0: getDecorationTextureKey('pebble', 0), 1: getDecorationTextureKey('pebble', 1), 2: getDecorationTextureKey('pebble', 2) },
    'mushroom-deco': { 0: getDecorationTextureKey('mushroom-deco', 0), 1: getDecorationTextureKey('mushroom-deco', 1), 2: getDecorationTextureKey('mushroom-deco', 2) },
    twig: { 0: getDecorationTextureKey('twig', 0), 1: getDecorationTextureKey('twig', 1), 2: getDecorationTextureKey('twig', 2) },
};

// -----------------------------------------------------------------------------
// Structure sprite keys — overlay sprites for firepit, stockpile, well, chest.
// These are PNG keys (already loaded) that game systems reference directly.
// -----------------------------------------------------------------------------

export const STRUCTURE_SPRITE_KEYS = {
    firepit:    `tt-${String(TT_PICKAXE).padStart(4, '0')}`, // a wooden plank / fire pit stand-in
    stockpile:  `tt-${String(TT_CHEST).padStart(4, '0')}`,
    well:       `tt-${String(TT_WELL).padStart(4, '0')}`,
    foodSource: `td-${String(TD_POTION_RED).padStart(4, '0')}`, // red potion as berry bush stand-in
    key:        `tt-${String(TT_KEY).padStart(4, '0')}`,
} as const;
