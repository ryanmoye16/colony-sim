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

