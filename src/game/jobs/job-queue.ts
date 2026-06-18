import type { Job, JobType } from './job';

export class JobQueue
{
    private jobs: Map<number, Job> = new Map();
    private pending: Job[] = [];
    private nextId: number = 1;

    add (
        type: JobType,
        target: { tx: number; ty: number },
        priority: number,
        target2?: { tx: number; ty: number },
        workTile?: { tx: number; ty: number },
        itemId?: number,
    ): Job
    {
        const job: Job = {
            id: this.nextId++,
            type, priority, target, target2, workTile, itemId,
            state: 'pending',
        };
        this.jobs.set(job.id, job);
        this.insertPending(job);
        return job;
    }

    claim (entity: number): Job | null
    {
        while (this.pending.length > 0)
        {
            const job = this.pending.shift()!;
            if (job.state === 'pending')
            {
                job.state = 'claimed';
                job.claimedBy = entity;
                return job;
            }
        }
        return null;
    }

    complete (id: number): void
    {
        const job = this.jobs.get(id);
        if (job) job.state = 'complete';
    }

    cancel (id: number): void
    {
        const job = this.jobs.get(id);
        if (job) job.state = 'cancelled';
    }

    getJob (id: number): Job | undefined
    {
        return this.jobs.get(id);
    }

    getAllJobs (): Job[]
    {
        return Array.from(this.jobs.values());
    }

    private insertPending (job: Job): void
    {
        let i = 0;
        while (i < this.pending.length && this.pending[i].priority >= job.priority) i++;
        this.pending.splice(i, 0, job);
    }
}
