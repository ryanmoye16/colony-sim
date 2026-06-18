import type { World as WorldModel } from '../world/world';
import { isWalkable } from '../world/tile';

interface Node
{
    x: number;
    y: number;
    path: Array<{ tx: number; ty: number }>;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
];

export function findPath (
    world: WorldModel,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
): Array<{ tx: number; ty: number }> | null
{
    if (!world.inBounds(startX, startY) || !world.inBounds(endX, endY)) return null;
    if (startX === endX && startY === endY) return [];

    const visited = new Set<string>();
    visited.add(`${startX},${startY}`);

    const queue: Node[] = [{ x: startX, y: startY, path: [] }];

    while (queue.length > 0)
    {
        const current = queue.shift()!;
        for (const [dx, dy] of DIRS)
        {
            const nx = current.x + dx;
            const ny = current.y + dy;
            const key = `${nx},${ny}`;
            if (visited.has(key)) continue;
            if (!world.inBounds(nx, ny)) continue;
            if (!isWalkable(world.getTile(nx, ny))) continue;

            const newPath = current.path.concat([{ tx: nx, ty: ny }]);
            if (nx === endX && ny === endY) return newPath;

            visited.add(key);
            queue.push({ x: nx, y: ny, path: newPath });
        }
    }

    return null;
}
