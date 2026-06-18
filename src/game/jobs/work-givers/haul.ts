import type { World as WorldModel } from '../../world/world';
import type { JobQueue } from '../job-queue';
import type { Time } from '../../time/time';

const SCAN_INTERVAL_TICKS = 300;
const MAX_PENDING_JOBS = 3;

export class HaulWorkGiver
{
    private lastScan: number = 0;

    constructor (private readonly stockpile: { tx: number; ty: number }) {}

    update (world: WorldModel, jobQueue: JobQueue, sim: Time): void
    {
        if (sim.tick - this.lastScan < SCAN_INTERVAL_TICKS) return;
        this.lastScan = sim.tick;

        let count = 0;
        for (const job of jobQueue.getAllJobs())
        {
            if (job.type === 'haul' && (job.state === 'pending' || job.state === 'claimed'))
            {
                count++;
            }
        }
        if (count >= MAX_PENDING_JOBS) return;

        for (const item of world.items.values())
        {
            if (item.tx === this.stockpile.tx && item.ty === this.stockpile.ty) continue;
            jobQueue.add(
                'haul',
                { tx: item.tx, ty: item.ty },
                2,
                this.stockpile,
                undefined,
                item.id,
            );
            count++;
            if (count >= MAX_PENDING_JOBS) return;
        }
    }
}
