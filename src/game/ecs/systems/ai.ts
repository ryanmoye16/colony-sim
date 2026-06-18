import type { System } from './index';
import type { ECSWorld } from '../world';
import { AI, Needs } from '../components';
import type { AIData, NeedsData } from '../components';
import type { JobQueue } from '../../jobs/job-queue';

const HUNGER_THRESHOLD = 0.5;
const HUNGER_FULL = 0.95;
const SOCIAL_THRESHOLD = 0.4;
const SOCIAL_FULL = 0.95;

export class AISystem implements System
{
    constructor (private readonly jobQueue: JobQueue) {}

    update (ecs: ECSWorld, _tick: number, _dt: number): void
    {
        ecs.forEach<AIData>(AI, (entity, ai) => {
            const needs = ecs.getComponent<NeedsData>(entity, Needs);

            if (ai.state !== 'seeking_food' && needs && needs.hunger < HUNGER_THRESHOLD)
            {
                if (ai.state === 'working' && ai.jobId !== undefined)
                {
                    this.jobQueue.cancel(ai.jobId);
                }
                ai.state = 'seeking_food';
                ai.path = null;
                ai.pathIndex = 0;
                ai.jobId = undefined;
                ai.jobPhase = undefined;
                return;
            }

            if (ai.state === 'seeking_food' && needs && needs.hunger >= HUNGER_FULL)
            {
                ai.state = 'wandering';
                ai.path = null;
                ai.pathIndex = 0;
                return;
            }

            if (
                ai.state !== 'seeking_social'
                && needs
                && needs.hunger >= HUNGER_THRESHOLD
                && needs.social < SOCIAL_THRESHOLD
            )
            {
                if (ai.state === 'working' && ai.jobId !== undefined)
                {
                    this.jobQueue.cancel(ai.jobId);
                }
                ai.state = 'seeking_social';
                ai.path = null;
                ai.pathIndex = 0;
                ai.jobId = undefined;
                ai.jobPhase = undefined;
                return;
            }

            if (ai.state === 'seeking_social' && needs && needs.social >= SOCIAL_FULL)
            {
                ai.state = 'wandering';
                ai.path = null;
                ai.pathIndex = 0;
                return;
            }

            if (
                ai.state === 'wandering'
                && (!needs || (needs.hunger >= HUNGER_THRESHOLD && needs.social >= SOCIAL_THRESHOLD))
            )
            {
                const job = this.jobQueue.claim(entity);
                if (job)
                {
                    ai.state = 'working';
                    ai.jobId = job.id;
                    ai.jobPhase = 'go_to_target';
                    ai.path = null;
                    ai.pathIndex = 0;
                }
            }
        });
    }
}
