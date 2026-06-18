export type JobType = 'mine' | 'haul';

export type JobState = 'pending' | 'claimed' | 'complete' | 'cancelled';

export interface Job
{
    id: number;
    type: JobType;
    priority: number;
    target: { tx: number; ty: number };
    target2?: { tx: number; ty: number };
    workTile?: { tx: number; ty: number };
    itemId?: number;
    state: JobState;
    claimedBy?: number;
}
