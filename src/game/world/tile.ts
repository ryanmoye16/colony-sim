export enum TileType
{
    Empty = 0,
    Dirt = 1,
    Grass = 2,
    Stone = 3,
    Water = 4,
    Sand = 5,
    Tree = 6,
    Wall = 7,
    Floor = 8,
    TilledSoil = 9,
    Snow = 10,
    TreePine = 11,
    TreeBush = 12,
    SandWater = 13,   // water-shore edge
    GrassSand = 14,  // grass-sand edge
}

export function isWalkable (type: TileType): boolean
{
    switch (type)
    {
        case TileType.Empty:
        case TileType.Water:
        case TileType.Stone:
        case TileType.Tree:
        case TileType.TreePine:
        case TileType.TreeBush:
        case TileType.Wall:
            return false;
        default:
            return true;
    }
}

/**
 * Group tile types into broad "biome" categories so we can draw haze at
 * meaningful boundaries (water↔land, sand↔grass, grass↔stone) without
 * generating false-positive fog at every per-tile variant transition.
 * Edge tiles (SandWater, GrassSand) belong to BOTH groups so the boundary
 * between a Sand tile and a SandWater tile doesn't trigger haze.
 */
export function biomeGroup (type: TileType): number
{
    switch (type)
    {
        case TileType.Water:
        case TileType.SandWater:
            return 1; // water
        case TileType.Sand:
        case TileType.GrassSand:
            return 2; // sand
        case TileType.Grass:
        case TileType.Tree:
        case TileType.TreePine:
        case TileType.TreeBush:
        case TileType.Dirt:
        case TileType.TilledSoil:
        case TileType.Floor:
        case TileType.Empty:
            return 3; // grass / ground
        case TileType.Stone:
        case TileType.Wall:
            return 4; // stone
        case TileType.Snow:
            return 5; // snow
        default:
            return 0;
    }
}

