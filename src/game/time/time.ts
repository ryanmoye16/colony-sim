import { EventBus } from '../util/event-bus';
import {
    SIM_DT,
    TICKS_PER_DAY,
    DAYS_PER_SEASON,
    DAYS_PER_YEAR,
    SIM_SPEEDS,
    type SimSpeed,
} from '../config/game.config';

export interface TimeEvents extends Record<string, unknown> {
    'time.tick': { tick: number };
    'time.day': { day: number; season: number; year: number };
    'time.season': { season: number; year: number };
    'time.year': { year: number };
    'time.speed': { speed: SimSpeed };
}

const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;

export function seasonName (season: number): string
{
    return SEASON_NAMES[season] ?? 'Unknown';
}

const MAX_FRAME_DT = 0.1;

export class Time
{
    private readonly bus = new EventBus<TimeEvents>();
    private accumulator: number = 0;
    private _tick: number = 0;
    private _speed: SimSpeed = 1;

    readonly on = this.bus.on.bind(this.bus);

    get tick (): number { return this._tick; }
    set tick (v: number) { this._tick = v; }
    get speed (): SimSpeed { return this._speed; }
    get day (): number { return Math.floor(this._tick / TICKS_PER_DAY) + 1; }
    get season (): number
    {
        const dayOfYear = Math.floor(this._tick / TICKS_PER_DAY) % DAYS_PER_YEAR;
        return Math.floor(dayOfYear / DAYS_PER_SEASON);
    }
    get year (): number
    {
        return Math.floor(this._tick / (DAYS_PER_YEAR * TICKS_PER_DAY)) + 1;
    }

    setSpeed (speed: SimSpeed): void
    {
        if (!(SIM_SPEEDS as readonly number[]).includes(speed)) return;
        this._speed = speed;
        this.bus.emit('time.speed', { speed });
    }

    cycleSpeed (): SimSpeed
    {
        const idx = SIM_SPEEDS.indexOf(this._speed);
        const next = SIM_SPEEDS[(idx + 1) % SIM_SPEEDS.length];
        this.setSpeed(next);
        return next;
    }

    setTick (tick: number): void
    {
        const prevYear = this.year;
        const prevSeason = this.season;
        const prevDay = this.day;
        this._tick = tick;
        this.accumulator = 0;
        // Fire boundary events so HUD/other listeners see the jump. Without
        // this, setTick from outside (load-from-save, debug scripts) leaves
        // the date display stuck on whatever it was before the jump.
        if (this.year !== prevYear) this.bus.emit('time.year', { year: this.year });
        if (this.season !== prevSeason) this.bus.emit('time.season', { season: this.season, year: this.year });
        if (this.day !== prevDay) this.bus.emit('time.day', { day: this.day, season: this.season, year: this.year });
        this.bus.emit('time.tick', { tick: this._tick });
    }

    update (realDt: number): void
    {
        if (this._speed === 0) return;

        this.accumulator += Math.min(realDt, MAX_FRAME_DT) * this._speed;

        const prevDay = this.day;
        const prevSeason = this.season;
        const prevYear = this.year;

        while (this.accumulator >= SIM_DT)
        {
            this.accumulator -= SIM_DT;
            this._tick++;
            this.bus.emit('time.tick', { tick: this._tick });
        }

        if (this.year !== prevYear)
        {
            this.bus.emit('time.year', { year: this.year });
        }
        if (this.season !== prevSeason)
        {
            this.bus.emit('time.season', { season: this.season, year: this.year });
        }
        if (this.day !== prevDay)
        {
            this.bus.emit('time.day', { day: this.day, season: this.season, year: this.year });
        }
    }
}
