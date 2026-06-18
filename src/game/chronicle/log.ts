export type ChronicleEventType =
    | 'birth'
    | 'death'
    | 'marriage'
    | 'divorce'
    | 'building.complete'
    | 'building.collapsed'
    | 'first.something'
    | 'disaster'
    | 'milestone';

export interface ChronicleEvent
{
    id: number;
    tick: number;
    type: ChronicleEventType;
    message: string;
    payload: Record<string, unknown>;
}

export class Chronicle
{
    private events: ChronicleEvent[] = [];
    private nextId: number = 1;

    record (type: ChronicleEventType, message: string, tick: number, payload: Record<string, unknown> = {}): ChronicleEvent
    {
        const event: ChronicleEvent = { id: this.nextId++, tick, type, message, payload };
        this.events.push(event);
        return event;
    }

    getAll (): readonly ChronicleEvent[]
    {
        return this.events;
    }

    getSince (tick: number): ChronicleEvent[]
    {
        return this.events.filter((e) => e.tick >= tick);
    }

    clear (): void
    {
        this.events = [];
    }

    serialize (): ChronicleEvent[]
    {
        return this.events.map((e) => ({ ...e }));
    }

    restore (events: ChronicleEvent[]): void
    {
        this.events = events.map((e) => ({ ...e }));
        let maxId = 0;
        for (const e of this.events)
        {
            if (e.id > maxId) maxId = e.id;
        }
        this.nextId = maxId + 1;
    }
}
