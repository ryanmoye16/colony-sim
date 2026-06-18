export const TILE_SIZE = 16;
export const CHUNK_SIZE = 16;
export const TILES_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE;

export const DEFAULT_WORLD_WIDTH = 256;
export const DEFAULT_WORLD_HEIGHT = 256;

export const SIM_TICKS_PER_SECOND = 60;
export const SIM_DT = 1 / SIM_TICKS_PER_SECOND;

export const SECONDS_PER_DAY = 24;
export const TICKS_PER_DAY = SECONDS_PER_DAY * SIM_TICKS_PER_SECOND;
export const DAYS_PER_SEASON = 30;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;

export const SIM_SPEEDS = [0, 1, 2, 3, 4] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

export const SETTLER_LIFESPAN_YEARS = 60;
export const SETTLER_ADULT_AGE = 12;
export const SETTLER_ELDER_AGE = 50;
export const SETTLER_PREGNANCY_DAYS = 270;

export const LIFESPAN_TICKS = 8000;
export const PREGNANCY_DURATION_TICKS = 500;
export const INITIAL_SETTLER_AGE_TICKS = 3000;

export type AgeStage = 'infant' | 'child' | 'adult' | 'elder';

export function getAgeStage (birthTick: number, currentTick: number, lifespan: number = LIFESPAN_TICKS): AgeStage
{
    const ratio = (currentTick - birthTick) / lifespan;
    if (ratio < 0.05) return 'infant';
    if (ratio < 0.2) return 'child';
    if (ratio < 0.83) return 'adult';
    return 'elder';
}

export function isAdult (birthTick: number, currentTick: number, lifespan: number = LIFESPAN_TICKS): boolean
{
    const stage = getAgeStage(birthTick, currentTick, lifespan);
    return stage === 'adult';
}
