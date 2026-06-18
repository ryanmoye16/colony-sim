import type { ECSWorld } from '../world';

export interface System
{
    update (world: ECSWorld, tick: number, dt: number): void;
}
