// =============================================================================
// Decoration generation — ferns, pebbles, mushrooms, twigs scattered on
// grass/dirt tiles.
// =============================================================================
// Deterministic per-seed: same world seed → same decorations every load.
// Density: ~1 decoration per 5 grass/dirt tiles, biased to scatter evenly
// rather than clump. We never place on walls, water, trees, stone, sand, or
// snow — those biomes have their own visual identity.
// =============================================================================

import type { World } from './world';
import { TileType } from './tile';
import { mulberry32 } from '../util/rng';

export type DecorationKind = 'fern' | 'pebble' | 'mushroom-deco' | 'twig';

export interface DecorationEntry
{
    tx: number;
    ty: number;
    kind: DecorationKind;
    variant: number; // 0..2 — picks between sprite variants
}

const TARGET_DENSITY = 0.20; // ~1 decoration per 5 walkable tiles
const KINDS: DecorationKind[] = ['fern', 'fern', 'pebble', 'pebble', 'mushroom-deco', 'twig'];

export function generateDecorations (world: World, seed: number): DecorationEntry[]
{
    const rng = mulberry32(seed ^ 0xb16b00b5);
    const decorations: DecorationEntry[] = [];
    const total = world.width * world.height;
    const target = Math.floor(total * TARGET_DENSITY);

    let attempts = 0;
    const maxAttempts = target * 4;
    while (decorations.length < target && attempts < maxAttempts)
    {
        attempts++;
        const tx = Math.floor(rng() * world.width);
        const ty = Math.floor(rng() * world.height);
        const tile = world.getTile(tx, ty);
        // Only on grass or dirt — keeps each biome's silhouette clear.
        if (tile !== TileType.Grass && tile !== TileType.Dirt) continue;
        // Avoid clumping: skip if any 8-neighbor already has a decoration.
        if (hasNeighborDecoration(decorations, tx, ty, 1)) continue;

        const kind = KINDS[Math.floor(rng() * KINDS.length)];
        const variant = Math.floor(rng() * 3);
        decorations.push({ tx, ty, kind, variant });
    }

    return decorations;
}

function hasNeighborDecoration (existing: DecorationEntry[], tx: number, ty: number, r: number): boolean
{
    for (const d of existing)
    {
        if (Math.abs(d.tx - tx) <= r && Math.abs(d.ty - ty) <= r) return true;
    }
    return false;
}