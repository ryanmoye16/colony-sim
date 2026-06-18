export function mulberry32 (seed: number): () => number
{
    let a = seed >>> 0;
    return function ()
    {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function rangeInt (rng: () => number, min: number, max: number): number
{
    return Math.floor(rng() * (max - min + 1)) + min;
}

export function pick<T> (rng: () => number, items: readonly T[]): T
{
    return items[Math.floor(rng() * items.length)];
}
