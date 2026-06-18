export type EntityId = number;

export class ECSWorld
{
    private nextId: EntityId = 1;
    private components: Map<string, Map<EntityId, unknown>> = new Map();
    private destroyed: Set<EntityId> = new Set();

    createEntity (): EntityId
    {
        return this.nextId++;
    }

    addComponent<T> (entity: EntityId, name: string, component: T): void
    {
        let map = this.components.get(name);
        if (!map)
        {
            map = new Map();
            this.components.set(name, map);
        }
        map.set(entity, component);
    }

    getComponent<T> (entity: EntityId, name: string): T | undefined
    {
        return this.components.get(name)?.get(entity) as T | undefined;
    }

    hasComponent (entity: EntityId, name: string): boolean
    {
        return this.components.get(name)?.has(entity) ?? false;
    }

    removeComponent (entity: EntityId, name: string): void
    {
        this.components.get(name)?.delete(entity);
    }

    destroyEntity (entity: EntityId): void
    {
        this.destroyed.add(entity);
    }

    flushDestructions (): void
    {
        this.destroyed.forEach((id) => {
            this.components.forEach((map) => map.delete(id));
        });
        this.destroyed.clear();
    }

    forEach<T> (name: string, callback: (entity: EntityId, component: T) => void): void
    {
        this.components.get(name)?.forEach((component, entity) => {
            callback(entity, component as T);
        });
    }

    count (name: string): number
    {
        return this.components.get(name)?.size ?? 0;
    }

    forEachEntity (callback: (entity: EntityId) => void): void
    {
        const seen = new Set<EntityId>();
        this.components.forEach((map) => {
            map.forEach((_, id) => {
                if (!seen.has(id))
                {
                    seen.add(id);
                    callback(id);
                }
            });
        });
    }

    serialize (): { nextId: number; components: Array<[string, Array<[number, unknown]>]> }
    {
        return {
            nextId: this.nextId,
            components: Array.from(this.components.entries()).map(([name, map]) => [name, Array.from(map.entries())]),
        };
    }

    clear (): void
    {
        this.nextId = 1;
        this.components.clear();
        this.destroyed.clear();
    }

    restore (state: { nextId: number; components: Array<[string, Array<[number, unknown]>]> }): void
    {
        this.nextId = state.nextId;
        this.components = new Map(
            state.components.map(([name, entries]) => [name, new Map(entries as Array<[number, unknown]>)]),
        );
        this.destroyed.clear();
    }
}
