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
            world.setTile(x, y, determineBiome(elev, moist));
        }
    }
}

export function determineBiome (elev: number, moist: number): TileType
{
    if (elev < WATER_LEVEL) return TileType.Water;
    if (elev < BEACH_LEVEL) return TileType.Sand;
    if (elev < STONE_LEVEL)
    {
        if (moist < DESERT_MOISTURE) return TileType.Sand;
        if (moist > FOREST_MOISTURE) return TileType.Tree;
        return TileType.Grass;
    }
    if (elev < SNOW_LEVEL) return TileType.Stone;
    return TileType.Snow;
}

function normalize (v: number): number
{
    return (v + 1) / 2;
}
