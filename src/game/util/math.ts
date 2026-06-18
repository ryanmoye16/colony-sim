export function clamp (value: number, min: number, max: number): number
{
    return Math.max(min, Math.min(max, value));
}

export function lerp (a: number, b: number, t: number): number
{
    return a + (b - a) * t;
}

export function chunkKey (cx: number, cy: number): string
{
    return `${cx},${cy}`;
}

export function worldToChunk (wx: number, wy: number, chunkSize: number): [number, number]
{
    return [Math.floor(wx / chunkSize), Math.floor(wy / chunkSize)];
}

export function mod (a: number, n: number): number
{
    return ((a % n) + n) % n;
}
