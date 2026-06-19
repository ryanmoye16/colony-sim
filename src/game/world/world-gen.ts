import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from '../util/rng';
import { World } from './world';
import { TileType } from './tile';
import { generateDecorations } from './decoration';

export interface WorldGenOptions
{
    seed: number;
}

const ELEVATION_FREQUENCY = 0.01;
const MOISTURE_FREQUENCY = 0.008;
const MOISTURE_OFFSET = 1000;
const VARIANT_FREQUENCY = 0.05;
const VARIANT_OFFSET = 5000;

const WATER_LEVEL = 0.32;
const BEACH_LEVEL = 0.36;
const STONE_LEVEL = 0.72;
const SNOW_LEVEL = 0.88;
const DESERT_MOISTURE = 0.35;
const FOREST_MOISTURE = 0.72;

// Forest generation: we DON'T scatter trees uniformly across the forest
// biome. Instead we drop a small number of "seed" trees, then run a
// cellular growth pass that spreads trees from seeds to adjacent tiles.
// Tuned for sparse groves with clearings between them — total forest
// coverage ends up around 6-8% of the world, with trees clustered.
const SEED_TREE_RATE = 0.04;    // 4% of forest tiles start as seeds
const SEED_BUSH_RATE = 0.02;
const GROW_NEIGHBOR_THRESHOLD = 1; // need ≥1 tree neighbor to grow
const GROW_PROBABILITY = 0.22;     // chance to grow when threshold met
const GROW_PASSES = 2;             // 2 passes — let groves expand ~2 tiles

export function generateWorld (world: World, options: WorldGenOptions): void
{
    const rng = mulberry32(options.seed);
    const noise2D = createNoise2D(rng);

    // Pass 1: assign base biome + seed trees. The seed pass uses low
    // density so the world starts mostly grass in forest areas; the
    // grow pass below adds clustered trees around the seeds.
    for (let y = 0; y < world.height; y++)
    {
        for (let x = 0; x < world.width; x++)
        {
            const elev = normalize(noise2D(x * ELEVATION_FREQUENCY, y * ELEVATION_FREQUENCY));
            const moist = normalize(noise2D(
                x * MOISTURE_FREQUENCY + MOISTURE_OFFSET,
                y * MOISTURE_FREQUENCY + MOISTURE_OFFSET,
            ));
            const variant = normalize(noise2D(
                x * VARIANT_FREQUENCY + VARIANT_OFFSET,
                y * VARIANT_FREQUENCY + VARIANT_OFFSET,
            ));
            world.setTile(x, y, determineBiome(elev, moist, variant));
        }
    }

    // Pass 2: grow trees from seeds via cellular automaton. Each pass
    // iterates all forest-eligible tiles and promotes a tile to a tree
    // if it has ≥ GROW_NEIGHBOR_THRESHOLD tree neighbors. This creates
    // groves that spread outward, with clearings in between.
    for (let pass = 0; pass < GROW_PASSES; pass++)
    {
        growForest(world, options.seed + pass * 7919);
    }

    // Pass 3: convert some trees to alternate types (bushes, pines) so
    // groves have internal variety. ~15% of trees → pine, ~10% → bush.
    diversifyForestTypes(world, options.seed + 12345);

    // Post-process: sprinkle biome edge tiles at sand↔water and grass↔sand
    // boundaries. Uses the per-tile variant noise to pick deterministic edges.
    sprinkleBiomeEdges(world, options.seed);

    // Scatter decorative clutter (ferns, pebbles, mushrooms, twigs) on
    // grass/dirt tiles. Deterministic per seed.
    world.decorations = generateDecorations(world, options.seed);
}

export function determineBiome (elev: number, moist: number, variant: number = 0.5): TileType
{
    if (elev < WATER_LEVEL) return TileType.Water;
    if (elev < BEACH_LEVEL) return TileType.Sand;
    if (elev < STONE_LEVEL)
    {
        if (moist < DESERT_MOISTURE) return TileType.Sand;
        if (moist > FOREST_MOISTURE)
        {
            // Seed only: most forest-eligible tiles stay grass here. The
            // growForest pass below fills in clusters around these seeds,
            // which yields clearings rather than a uniform tree field.
            if (variant < SEED_BUSH_RATE) return TileType.TreeBush;
            if (variant < SEED_BUSH_RATE + SEED_TREE_RATE) return TileType.Tree;
            return TileType.Grass;
        }
        return TileType.Grass;
    }
    if (elev < SNOW_LEVEL) return TileType.Stone;
    return TileType.Snow;
}

/**
 * Grow trees outward from existing tree tiles. For each forest-eligible
 * grass tile, count its 8 neighbors that are already trees (or pines).
 * If the count meets the threshold, the tile becomes a tree with
 * GROW_PROBABILITY chance. Iterating GROW_PASSES times lets groves
 * expand outward by ~1 tile per pass.
 */
function growForest (world: World, seed: number): void
{
    const rng = mulberry32(seed);
    const w = world.width;
    const h = world.height;

    // Collect promotion candidates in a first sweep so the growth doesn't
    // ripple through a single pass (we read from the previous frame and
    // write to a buffer, then commit).
    const promotions: Array<{ x: number; y: number }> = [];

    for (let y = 1; y < h - 1; y++)
    {
        for (let x = 1; x < w - 1; x++)
        {
            if (world.getTile(x, y) !== TileType.Grass) continue;
            let treeNeighbors = 0;
            for (let dy = -1; dy <= 1; dy++)
            {
                for (let dx = -1; dx <= 1; dx++)
                {
                    if (dx === 0 && dy === 0) continue;
                    const t = world.getTile(x + dx, y + dy);
                    if (t === TileType.Tree || t === TileType.TreePine) treeNeighbors++;
                }
            }
            if (treeNeighbors >= GROW_NEIGHBOR_THRESHOLD && rng() < GROW_PROBABILITY)
            {
                promotions.push({ x, y });
            }
        }
    }

    for (const p of promotions) world.setTile(p.x, p.y, TileType.Tree);
}

/**
 * Walk the world once and convert some trees to pines or bushes based
 * on a deterministic noise. This adds visual variety inside groves —
 * otherwise a cluster ends up looking like a monoculture.
 */
function diversifyForestTypes (world: World, seed: number): void
{
    const rng = mulberry32(seed);
    const w = world.width;
    const h = world.height;
    for (let y = 0; y < h; y++)
    {
        for (let x = 0; x < w; x++)
        {
            const t = world.getTile(x, y);
            if (t !== TileType.Tree) continue;
            const r = rng();
            if (r < 0.15) world.setTile(x, y, TileType.TreePine);
            else if (r < 0.25) world.setTile(x, y, TileType.TreeBush);
        }
    }
}

function sprinkleBiomeEdges (world: World, seed: number): void
{
    const rng = mulberry32(seed ^ 0xdeadbeef);
    for (let y = 1; y < world.height - 1; y++)
    {
        for (let x = 1; x < world.width - 1; x++)
        {
            const t = world.getTile(x, y);
            // Sand ↔ water: place SandWater on the SAND side of a sand-water boundary
            if (t === TileType.Sand)
            {
                const n = world.getTile(x, y - 1);
                const s = world.getTile(x, y + 1);
                if (n === TileType.Water && rng() < 0.55)
                {
                    world.setTile(x, y, TileType.SandWater);
                    continue;
                }
                if (s === TileType.Water && rng() < 0.55)
                {
                    world.setTile(x, y, TileType.SandWater);
                    continue;
                }
            }
            // Grass ↔ sand: place GrassSand on the GRASS side of a grass-sand boundary
            if (t === TileType.Grass)
            {
                const n = world.getTile(x, y - 1);
                const s = world.getTile(x, y + 1);
                if (n === TileType.Sand && rng() < 0.40)
                {
                    world.setTile(x, y, TileType.GrassSand);
                    continue;
                }
                if (s === TileType.Sand && rng() < 0.40)
                {
                    world.setTile(x, y, TileType.GrassSand);
                    continue;
                }
            }
        }
    }
}

function normalize (v: number): number
{
    return (v + 1) / 2;
}
