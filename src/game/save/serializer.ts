import type { World as WorldModel } from '../world/world';
import type { Time } from '../time/time';
import type { ECSWorld } from '../ecs/world';
import type { Chronicle } from '../chronicle/log';
import { SAVE_VERSION } from './schema-version';

export interface SaveData
{
    version: number;
    savedAt: number;
    world: ReturnType<WorldModel['serialize']>;
    time: { tick: number; speed: number };
    ecs: ReturnType<ECSWorld['serialize']>;
    chronicle: ReturnType<Chronicle['serialize']>;
}

export function serialize (state: {
    world: WorldModel;
    time: Time;
    ecs: ECSWorld;
    chronicle: Chronicle;
}): string
{
    const data: SaveData = {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        world: state.world.serialize(),
        time: { tick: state.time.tick, speed: state.time.speed },
        ecs: state.ecs.serialize(),
        chronicle: state.chronicle.serialize(),
    };
    return JSON.stringify(data);
}

export function deserialize (json: string): SaveData | null
{
    try
    {
        const data = JSON.parse(json);
        if (typeof data.version !== 'number') return null;
        return data as SaveData;
    }
    catch
    {
        return null;
    }
}
