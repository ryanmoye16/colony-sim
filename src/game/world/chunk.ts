import { CHUNK_SIZE, TILES_PER_CHUNK } from '../config/game.config';
import { TileType } from './tile';

export class Chunk
{
    readonly tiles: Uint16Array = new Uint16Array(TILES_PER_CHUNK);
    version: number = 0;
    dirty: boolean = true;

    getTile (lx: number, ly: number): TileType
    {
        return this.tiles[ly * CHUNK_SIZE + lx] as TileType;
    }

    setTile (lx: number, ly: number, type: TileType): void
    {
        this.tiles[ly * CHUNK_SIZE + lx] = type;
        this.dirty = true;
        this.version++;
    }

    fill (type: TileType): void
    {
        this.tiles.fill(type);
        this.dirty = true;
        this.version++;
    }
}
