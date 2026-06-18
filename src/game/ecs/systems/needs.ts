import type { System } from './index';
import type { ECSWorld } from '../world';
import { Needs } from '../components';
import type { NeedsData } from '../components';

const HUNGER_DECAY_PER_TICK = 1 / 300;
const SOCIAL_DECAY_PER_TICK = 1 / 600;

export class NeedsSystem implements System
{
    update (ecs: ECSWorld, _tick: number, _dt: number): void
    {
        ecs.forEach<NeedsData>(Needs, (_entity, needs) => {
            if (needs.hunger > 0)
            {
                needs.hunger = Math.max(0, needs.hunger - HUNGER_DECAY_PER_TICK);
            }
            if (needs.social > 0)
            {
                needs.social = Math.max(0, needs.social - SOCIAL_DECAY_PER_TICK);
            }
        });
    }
}
