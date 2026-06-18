import type { World as WorldModel } from '../../world/world';
import { TileType, isWalkable } from '../../world/tile';
import type { JobQueue } from '../job-queue';
import type { Time } from '../../time/time';

const SCAN_INTERVAL_TICKS = 600;
const MAX_PENDING_JOBS = 3;

const DIRS: ReadonlyArray<readonly [number, number]> = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
];

export class MineWorkGiver
{
    private lastScan: number = 0;

    update (world: WorldModel, jobQueue: JobQueue, sim: Time): void
    {
        if (sim.tick - this.lastScan < SCAN_INTERVAL_TICKS) return;
        this.lastScan = sim.tick;

        let count = 0;
        for (const job of jobQueue.getAllJobs())
        {
            if (job.type === 'mine' && (job.state === 'pending' || job.state === 'claimed'))
            {
                count++;
            }
        }
        if (count >= MAX_PENDING_JOBS) return;

        for (let y = 0; y < world.height; y++)
        {
            for (let x = 0; x < world.width; x++)
            {
                if (world.getTile(x, y) !== TileType.Stone) continue;

                let adj: { tx: number; ty: number } | null = null;
                for (const [dx, dy] of DIRS)
                {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (world.inBounds(nx, ny) && isWalkable(world.getTile(nx, ny)))
                    {
                        adj = { tx: nx, ty: ny };
                        break;
                    }
                }
                if (!adj) continue;

                jobQueue.add('mine', adj, 1, undefined, { tx: x, ty: y });
                count++;
                if (count >= MAX_PENDING_JOBS) return;
            }
        }
    }
}
