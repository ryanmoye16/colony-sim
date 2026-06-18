type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>>
{
    private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

    on<K extends keyof Events> (event: K, handler: Handler<Events[K]>): () => void
    {
        if (!this.handlers[event])
        {
            this.handlers[event] = new Set();
        }
        this.handlers[event]!.add(handler);
        return () => { this.handlers[event]!.delete(handler); };
    }

    emit<K extends keyof Events> (event: K, payload: Events[K]): void
    {
        this.handlers[event]?.forEach((h) => h(payload));
    }

    clear<K extends keyof Events> (event: K): void
    {
        this.handlers[event]?.clear();
    }
}
