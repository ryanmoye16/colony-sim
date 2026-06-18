import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from '../util/rng';
import { World } from './world';
import { TileType } from './tile';

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
const FOREST_MOISTURE = 0.62;

export function generateWorld (world: World, options: WorldGenOptions): void
{
    const rng = mulberry32(options.seed);
    const noise2D = createNoise2D(rng);

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

    // Post-process: sprinkle biome edge tiles at sand↔water and grass↔sand
    // boundaries. Uses the per-tile variant noise to pick deterministic edges.
    sprinkleBiomeEdges(world, options.seed);
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
            // Pick tree variant based on per-tile variant noise
            if (variant < 0.15) return TileType.TreeBush;
            if (variant < 0.30) return TileType.TreePine;
            return TileType.Tree;
        }
        return TileType.Grass;
    }
    if (elev < SNOW_LEVEL) return TileType.Stone;
    return TileType.Snow;
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
