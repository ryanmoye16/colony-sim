import { Chunk } from './chunk';
import { chunkKey, mod } from '../util/math';
import { CHUNK_SIZE, DEFAULT_WORLD_WIDTH, DEFAULT_WORLD_HEIGHT } from '../config/game.config';
import { TileType, isWalkable } from './tile';
import { EventBus } from '../util/event-bus';
import type { DecorationEntry } from './decoration';

export const CHUNKS_X = Math.ceil(DEFAULT_WORLD_WIDTH / CHUNK_SIZE);
export const CHUNKS_Y = Math.ceil(DEFAULT_WORLD_HEIGHT / CHUNK_SIZE);

export type ItemId = number;

export interface Item
{
    id: ItemId;
    type: string;
    amount: number;
    tx: number;
    ty: number;
}

export interface WorldEvents extends Record<string, unknown>
{
    'item.added': { id: ItemId; type: string; amount: number; tx: number; ty: number };
    'item.removed': { id: ItemId; type: string };
    'tile.changed': { wx: number; wy: number; type: TileType };
}

export class World
{
    readonly chunks: Map<string, Chunk> = new Map();
    readonly items: Map<ItemId, Item> = new Map();
    readonly events: EventBus<WorldEvents> = new EventBus();
    width: number = DEFAULT_WORLD_WIDTH;
    height: number = DEFAULT_WORLD_HEIGHT;
    decorations: DecorationEntry[] = [];
    /**
     * Per-tile reveal state for fog of war:
     *   0 = unseen (full black)
     *   1 = seen but not currently visible (50% black)
     *   2 = currently visible (no fog)
     * Lazily sized to width*height; on legacy saves it's empty (size 0) and
     * the renderer treats that as "fully fogged".
     */
    reveal: Uint8Array = new Uint8Array(0);
    private nextItemId: ItemId = 1;

    private ensureReveal (): void
    {
        const expected = this.width * this.height;
        if (this.reveal.length !== expected)
        {
            this.reveal = new Uint8Array(expected);
        }
    }

    /**
     * Mark every tile within radius (Chebyshev distance) of (tx, ty) as
     * currently visible (level 2). Tiles formerly at level 2 outside the
     * new vision circles decay to level 1 ("seen but not visible") only
     * when this is called from FogOfWar's decay pass — see that file.
     */
    revealAround (tx: number, ty: number, radius: number): void
    {
        this.ensureReveal();
        const r = Math.max(0, radius | 0);
        for (let dy = -r; dy <= r; dy++)
        {
            for (let dx = -r; dx <= r; dx++)
            {
                if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
                const wx = tx + dx;
                const wy = ty + dy;
                if (!this.inBounds(wx, wy)) continue;
                this.reveal[wy * this.width + wx] = 2;
            }
        }
    }

    /**
     * Decay all "currently visible" tiles to "seen but not visible" (2 → 1).
     * Tiles at level 0 (unseen) stay unseen. Called by FogOfWar after
     * settler positions are processed each tick.
     */
    decayReveal (): void
    {
        if (this.reveal.length === 0) return;
        for (let i = 0; i < this.reveal.length; i++)
        {
            if (this.reveal[i] === 2) this.reveal[i] = 1;
        }
    }

    /** Reveal the entire map. Used by reveal-on-click to scout. */
    revealAll (): void
    {
        this.ensureReveal();
        this.reveal.fill(2);
    }

    getChunk (cx: number, cy: number): Chunk
    {
        const key = chunkKey(cx, cy);
        let chunk = this.chunks.get(key);
        if (!chunk)
        {
            chunk = new Chunk();
            this.chunks.set(key, chunk);
        }
        return chunk;
    }

    hasChunk (cx: number, cy: number): boolean
    {
        return this.chunks.has(chunkKey(cx, cy));
    }

    getTile (wx: number, wy: number): TileType
    {
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cy = Math.floor(wy / CHUNK_SIZE);
        const lx = mod(wx, CHUNK_SIZE);
        const ly = mod(wy, CHUNK_SIZE);
        return this.getChunk(cx, cy).getTile(lx, ly);
    }

    setTile (wx: number, wy: number, type: TileType): void
    {
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cy = Math.floor(wy / CHUNK_SIZE);
        const lx = mod(wx, CHUNK_SIZE);
        const ly = mod(wy, CHUNK_SIZE);
        this.getChunk(cx, cy).setTile(lx, ly, type);
        this.events.emit('tile.changed', { wx, wy, type });
    }

    inBounds (wx: number, wy: number): boolean
    {
        return wx >= 0 && wy >= 0 && wx < this.width && wy < this.height;
    }

    forEachDirtyChunk (callback: (cx: number, cy: number, chunk: Chunk) => void): void
    {
        this.chunks.forEach((chunk, key) => {
            if (!chunk.dirty) return;
            const [cx, cy] = key.split(',').map(Number);
            callback(cx, cy, chunk);
            chunk.dirty = false;
        });
    }

    fill (type: TileType): void
    {
        for (let cy = 0; cy < CHUNKS_Y; cy++)
        {
            for (let cx = 0; cx < CHUNKS_X; cx++)
            {
                this.getChunk(cx, cy).fill(type);
            }
        }
    }

    findWalkableAt (tx: number, ty: number, searchRadius: number = 16): { tx: number; ty: number }
    {
        if (this.inBounds(tx, ty) && isWalkable(this.getTile(tx, ty))) return { tx, ty };
        for (let r = 1; r < searchRadius; r++)
        {
            for (let dy = -r; dy <= r; dy++)
            {
                for (let dx = -r; dx <= r; dx++)
                {
                    const ntx = tx + dx;
                    const nty = ty + dy;
                    if (this.inBounds(ntx, nty) && isWalkable(this.getTile(ntx, nty))) return { tx: ntx, ty: nty };
                }
            }
        }
        return { tx, ty };
    }

    addItem (type: string, amount: number, tx: number, ty: number): ItemId
    {
        const id = this.nextItemId++;
        this.items.set(id, { id, type, amount, tx, ty });
        this.events.emit('item.added', { id, type, amount, tx, ty });
        return id;
    }

    removeItem (id: ItemId): void
    {
        const item = this.items.get(id);
        if (!item) return;
        this.items.delete(id);
        this.events.emit('item.removed', { id, type: item.type });
    }

    getItem (id: ItemId): Item | undefined
    {
        return this.items.get(id);
    }

    serialize (): WorldSave
    {
        const chunks: Array<{ key: string; tiles: number[] }> = [];
        this.chunks.forEach((chunk, key) => {
            chunks.push({ key, tiles: Array.from(chunk.tiles) });
        });
        const items: Item[] = [];
        this.items.forEach((item) => items.push({ ...item }));
        return {
            width: this.width,
            height: this.height,
            chunks,
            items,
            decorations: this.decorations.map((d) => ({ ...d })),
            reveal: this.reveal.length > 0 ? Array.from(this.reveal) : undefined,
        };
    }

    restore (state: WorldSave): void
    {
        this.width = state.width;
        this.height = state.height;
        this.chunks.clear();
        for (const c of state.chunks)
        {
            const [cx, cy] = c.key.split(',').map(Number);
            const chunk = this.getChunk(cx, cy);
            for (let i = 0; i < c.tiles.length; i++)
            {
                chunk.tiles[i] = c.tiles[i];
            }
            chunk.dirty = true;
        }
        this.items.clear();
        let maxId = 0;
        for (const item of state.items)
        {
            this.items.set(item.id, { ...item });
            if (item.id > maxId) maxId = item.id;
        }
        this.nextItemId = maxId + 1;
        for (const item of this.items.values())
        {
            this.events.emit('item.added', { ...item });
        }
        this.decorations = (state.decorations ?? []).map((d) => ({ ...d }));
        if (state.reveal && state.reveal.length === this.width * this.height)
        {
            this.reveal = new Uint8Array(state.reveal);
        }
        else
        {
            this.reveal = new Uint8Array(0);
        }
    }
}

export interface WorldSave
{
    width: number;
    height: number;
    chunks: Array<{ key: string; tiles: number[] }>;
    items: Item[];
    decorations?: DecorationEntry[];
    reveal?: number[];
}
