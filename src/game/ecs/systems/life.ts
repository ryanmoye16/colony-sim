import type { System } from './index';
import type { ECSWorld } from '../world';
import { Life, Relationship, Position, Render } from '../components';
import type { LifeData, RelationshipData, PositionData, RenderData } from '../components';
import type { Chronicle } from '../../chronicle/log';
import { LIFESPAN_TICKS, PREGNANCY_DURATION_TICKS, isAdult } from '../../config/game.config';

type SpawnChild = (tx: number, ty: number, parents: [number, number], generation: number, tick: number) => number;

const PAIRING_INTIMACY_THRESHOLD = 0.3;
const CHAT_INTIMACY_BOOST = 0.1;
const PREGNANCY_CHANCE_PER_CHAT = 0.05;

export class LifeSystem implements System
{
    constructor (
        private readonly chronicle: Chronicle,
        private readonly rng: () => number,
        private readonly spawnChild: SpawnChild,
    ) {}

    handleChat (ecs: ECSWorld, entityA: number, entityB: number, tick: number): void
    {
        const lifeA = ecs.getComponent<LifeData>(entityA, Life);
        const lifeB = ecs.getComponent<LifeData>(entityB, Life);
        const relA = ecs.getComponent<RelationshipData>(entityA, Relationship);
        const relB = ecs.getComponent<RelationshipData>(entityB, Relationship);
        if (!lifeA || !lifeB || !relA || !relB) return;

        const isPair = relA.partner === entityB && relB.partner === entityA;

        if (!isPair)
        {
            const currentA = relA.intimacy.get(entityB) ?? 0;
            relA.intimacy.set(entityB, Math.min(1, currentA + CHAT_INTIMACY_BOOST));

            if (!relA.partner && !relB.partner)
            {
                if (currentA + CHAT_INTIMACY_BOOST >= PAIRING_INTIMACY_THRESHOLD)
                {
                    relA.partner = entityB;
                    relB.partner = entityA;
                    this.chronicle.record('marriage', `Settler ${entityA} married Settler ${entityB}`, tick, { entityA, entityB });
                }
            }
            return;
        }

        if (relA.pregnant || relB.pregnant) return;

        if (!isAdult(lifeA.birthTick, tick) || !isAdult(lifeB.birthTick, tick)) return;

        if (this.rng() < PREGNANCY_CHANCE_PER_CHAT)
        {
            const pregnantRel = this.rng() < 0.5 ? relA : relB;
            pregnantRel.pregnant = { startTick: tick };
        }
    }

    update (ecs: ECSWorld, tick: number): void
    {
        const births: Array<{ entity: number; rel: RelationshipData }> = [];
        ecs.forEach<RelationshipData>(Relationship, (entity, rel) => {
            if (rel.pregnant && tick - rel.pregnant.startTick >= PREGNANCY_DURATION_TICKS)
            {
                births.push({ entity, rel });
            }
        });
        for (const { entity, rel } of births)
        {
            this.giveBirth(ecs, entity, rel, tick);
        }

        const deaths: Array<{ entity: number; life: LifeData }> = [];
        ecs.forEach<LifeData>(Life, (entity, life) => {
            if (tick - life.birthTick >= LIFESPAN_TICKS)
            {
                deaths.push({ entity, life });
            }
        });
        for (const { entity, life } of deaths)
        {
            this.die(ecs, entity, life, tick);
        }
    }

    private giveBirth (ecs: ECSWorld, parent: number, rel: RelationshipData, tick: number): void
    {
        const pos = ecs.getComponent<PositionData>(parent, Position);
        const life = ecs.getComponent<LifeData>(parent, Life);
        if (!pos || !life || rel.partner === null) return;

        const otherParent = rel.partner;
        const otherLife = ecs.getComponent<LifeData>(otherParent, Life);
        if (!otherLife) return;

        const generation = Math.max(life.generation, otherLife.generation) + 1;
        this.spawnChild(pos.tx, pos.ty, [parent, otherParent], generation, tick);

        rel.pregnant = undefined;

        this.chronicle.record(
            'birth',
            `Child of ${parent} and ${otherParent} was born (gen ${generation})`,
            tick,
            { parent, otherParent, generation },
        );
    }

    private die (ecs: ECSWorld, entity: number, life: LifeData, tick: number): void
    {
        const rel = ecs.getComponent<RelationshipData>(entity, Relationship);
        if (rel && rel.partner !== null)
        {
            const partnerRel = ecs.getComponent<RelationshipData>(rel.partner, Relationship);
            if (partnerRel) partnerRel.partner = null;
        }

        const render = ecs.getComponent<RenderData>(entity, Render);
        if (render?.gameObject)
        {
            render.gameObject.destroy();
        }
        ecs.destroyEntity(entity);
        ecs.flushDestructions();

        this.chronicle.record(
            'death',
            `Settler ${entity} died at age ${tick - life.birthTick}`,
            tick,
            { entity, generation: life.generation },
        );
    }
}
