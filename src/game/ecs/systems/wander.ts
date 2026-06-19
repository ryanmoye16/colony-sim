import type { System } from './index';
import type { ECSWorld } from '../world';
import { Position, AI, Needs, Inventory } from '../components';
import type { PositionData, AIData, NeedsData, InventoryData } from '../components';
import { isWalkable, TileType } from '../../world/tile';
import type { World as WorldModel } from '../../world/world';
import type { JobQueue } from '../../jobs/job-queue';
import { findPath } from '../../pathfinding/pathfinder';
import type { LifeSystem } from './life';

const DIRS: ReadonlyArray<readonly [number, number]> = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
];

const WANDER_MIN_DELAY = 30;
const WANDER_DELAY_RANGE = 60;
const SEEK_STEP_DELAY = 10;
const POST_EAT_DELAY = 30;
const POST_JOB_DELAY = 15;
const POST_CHAT_DELAY = 60;
const CHAT_SOCIAL_BOOST = 0.3;

export class WanderSystem implements System
{
    constructor (
        private readonly worldModel: WorldModel,
        private readonly foodSource: { tx: number; ty: number },
        private readonly jobQueue: JobQueue,
        private readonly lifeSystem: LifeSystem,
        private readonly rng: () => number,
        private readonly onStepped?: (entity: number, tx: number, ty: number, facing: string, tickMs: number) => void,
    ) {}

    update (ecs: ECSWorld, tick: number, _dt: number): void
    {
        ecs.forEach<AIData>(AI, (entity, ai) => {
            if (tick < ai.nextMoveAt) return;

            const pos = ecs.getComponent<PositionData>(entity, Position);
            if (!pos) return;

            if (ai.state === 'wandering') this.handleWander(entity, pos, ai, tick);
            else if (ai.state === 'seeking_food') this.handleSeekFood(ecs, entity, pos, ai, tick);
            else if (ai.state === 'seeking_social') this.handleSeekSocial(ecs, entity, pos, ai, tick);
            else if (ai.state === 'working') this.handleWorking(ecs, entity, pos, ai, tick);
        });
    }

    private handleWander (entity: number, pos: PositionData, ai: AIData, tick: number): void
    {
        const dir = DIRS[Math.floor(this.rng() * DIRS.length)]!;
        const ntx = pos.tx + dir[0];
        const nty = pos.ty + dir[1];

        if (!this.worldModel.inBounds(ntx, nty)) return;
        if (!isWalkable(this.worldModel.getTile(ntx, nty))) return;

        pos.tx = ntx;
        pos.ty = nty;
        ai.facing = dir[0] > 0 ? 'e' : dir[0] < 0 ? 'w' : dir[1] > 0 ? 's' : 'n';
        ai.nextMoveAt = tick + WANDER_MIN_DELAY + Math.floor(this.rng() * WANDER_DELAY_RANGE);
        this.onStepped?.(entity, ntx, nty, ai.facing, tick);
    }

    private handleSeekFood (
        ecs: ECSWorld, entity: number, pos: PositionData, ai: AIData, tick: number,
    ): void
    {
        if (!ai.path)
        {
            ai.path = findPath(this.worldModel, pos.tx, pos.ty, this.foodSource.tx, this.foodSource.ty);
            ai.pathIndex = 0;
            if (!ai.path)
            {
                ai.state = 'wandering';
                ai.nextMoveAt = tick + 60;
                return;
            }
        }

        if (ai.pathIndex >= ai.path.length)
        {
            const needs = ecs.getComponent<NeedsData>(entity, Needs);
            if (needs) needs.hunger = 1.0;
            ai.state = 'wandering';
            ai.path = null;
            ai.pathIndex = 0;
            ai.nextMoveAt = tick + POST_EAT_DELAY;
            return;
        }

        const next = ai.path[ai.pathIndex];
        const dx = next.tx - pos.tx;
        const dy = next.ty - pos.ty;
        pos.tx = next.tx;
        pos.ty = next.ty;
        if (dx > 0) ai.facing = 'e';
        else if (dx < 0) ai.facing = 'w';
        else if (dy > 0) ai.facing = 's';
        else if (dy < 0) ai.facing = 'n';
        ai.pathIndex++;
        ai.nextMoveAt = tick + SEEK_STEP_DELAY;
        this.onStepped?.(entity, pos.tx, pos.ty, ai.facing, tick);
    }

    private handleSeekSocial (
        ecs: ECSWorld, entity: number, pos: PositionData, ai: AIData, tick: number,
    ): void
    {
        let nearestEntity: number | null = null;
        let nearestPos: PositionData | null = null;
        let nearestDist = Infinity;

        ecs.forEach<PositionData>(Position, (otherEntity, otherPos) => {
            if (otherEntity === entity) return;
            const dist = Math.abs(otherPos.tx - pos.tx) + Math.abs(otherPos.ty - pos.ty);
            if (dist < nearestDist)
            {
                nearestDist = dist;
                nearestEntity = otherEntity;
                nearestPos = otherPos;
            }
        });

        if (nearestEntity === null || nearestPos === null)
        {
            ai.state = 'wandering';
            return;
        }

        const chatEntity: number = nearestEntity;
        const chatPos: PositionData = nearestPos;

        if (nearestDist <= 1)
        {
            const myNeeds = ecs.getComponent<NeedsData>(entity, Needs);
            if (myNeeds) myNeeds.social = Math.min(1, myNeeds.social + CHAT_SOCIAL_BOOST);
            const theirNeeds = ecs.getComponent<NeedsData>(chatEntity, Needs);
            if (theirNeeds) theirNeeds.social = Math.min(1, theirNeeds.social + CHAT_SOCIAL_BOOST);
            this.lifeSystem.handleChat(ecs, entity, chatEntity, tick);
            ai.state = 'wandering';
            ai.path = null;
            ai.pathIndex = 0;
            ai.nextMoveAt = tick + POST_CHAT_DELAY;
            return;
        }

        if (!ai.path)
        {
            const target = this.findAdjacentTileTo(pos.tx, pos.ty, chatPos.tx, chatPos.ty);
            if (!target)
            {
                ai.state = 'wandering';
                return;
            }
            ai.path = findPath(this.worldModel, pos.tx, pos.ty, target.tx, target.ty);
            ai.pathIndex = 0;
            if (!ai.path)
            {
                ai.state = 'wandering';
                return;
            }
        }

        if (ai.pathIndex >= ai.path.length)
        {
            ai.path = null;
            ai.pathIndex = 0;
            return;
        }

        const next = ai.path[ai.pathIndex];
        {
            const dx = next.tx - pos.tx;
            const dy = next.ty - pos.ty;
            pos.tx = next.tx;
            pos.ty = next.ty;
            if (dx > 0) ai.facing = 'e';
            else if (dx < 0) ai.facing = 'w';
            else if (dy > 0) ai.facing = 's';
            else if (dy < 0) ai.facing = 'n';
        }
        ai.pathIndex++;
        ai.nextMoveAt = tick + SEEK_STEP_DELAY;
        this.onStepped?.(entity, pos.tx, pos.ty, ai.facing, tick);
    }

    private findAdjacentTileTo (
        myX: number, myY: number, targetX: number, targetY: number,
    ): { tx: number; ty: number } | null
    {
        let best: { tx: number; ty: number } | null = null;
        let bestDist = Infinity;
        for (const [dx, dy] of DIRS)
        {
            const ax = targetX + dx;
            const ay = targetY + dy;
            if (!this.worldModel.inBounds(ax, ay)) continue;
            if (!isWalkable(this.worldModel.getTile(ax, ay))) continue;
            const dist = Math.abs(ax - myX) + Math.abs(ay - myY);
            if (dist < bestDist)
            {
                bestDist = dist;
                best = { tx: ax, ty: ay };
            }
        }
        return best;
    }

    private handleWorking (
        ecs: ECSWorld, entity: number, pos: PositionData, ai: AIData, tick: number,
    ): void
    {
        if (ai.jobId === undefined)
        {
            ai.state = 'wandering';
            ai.jobPhase = undefined;
            return;
        }

        const job = this.jobQueue.getJob(ai.jobId);
        if (!job || job.state === 'cancelled' || job.state === 'complete')
        {
            ai.state = 'wandering';
            ai.jobId = undefined;
            ai.jobPhase = undefined;
            return;
        }

        const phase = ai.jobPhase ?? 'go_to_target';
        const target = phase === 'go_to_target' ? job.target : job.target2;
        if (!target)
        {
            this.jobQueue.complete(job.id);
            ai.state = 'wandering';
            ai.jobId = undefined;
            ai.jobPhase = undefined;
            ai.nextMoveAt = tick + POST_JOB_DELAY;
            return;
        }

        if (!ai.path)
        {
            ai.path = findPath(this.worldModel, pos.tx, pos.ty, target.tx, target.ty);
            ai.pathIndex = 0;
            if (!ai.path)
            {
                this.jobQueue.cancel(job.id);
                ai.state = 'wandering';
                ai.jobId = undefined;
                ai.jobPhase = undefined;
                return;
            }
        }

        if (ai.pathIndex >= ai.path.length)
        {
            this.performJobAction(ecs, entity, job, phase);

            if (phase === 'go_to_target' && job.target2)
            {
                ai.jobPhase = 'go_to_target2';
                ai.path = null;
                ai.pathIndex = 0;
            }
            else
            {
                this.jobQueue.complete(job.id);
                ai.state = 'wandering';
                ai.jobId = undefined;
                ai.jobPhase = undefined;
                ai.nextMoveAt = tick + POST_JOB_DELAY;
            }
            return;
        }

        const next = ai.path[ai.pathIndex];
        {
            const dx = next.tx - pos.tx;
            const dy = next.ty - pos.ty;
            pos.tx = next.tx;
            pos.ty = next.ty;
            if (dx > 0) ai.facing = 'e';
            else if (dx < 0) ai.facing = 'w';
            else if (dy > 0) ai.facing = 's';
            else if (dy < 0) ai.facing = 'n';
        }
        ai.pathIndex++;
        ai.nextMoveAt = tick + SEEK_STEP_DELAY;
        this.onStepped?.(entity, pos.tx, pos.ty, ai.facing, tick);
    }

    private performJobAction (
        ecs: ECSWorld, entity: number, job: { type: string; id: number; workTile?: { tx: number; ty: number }; target2?: { tx: number; ty: number }; itemId?: number },
        phase: 'go_to_target' | 'go_to_target2',
    ): void
    {
        if (job.type === 'mine' && phase === 'go_to_target')
        {
            const stone = job.workTile;
            if (stone)
            {
                this.worldModel.setTile(stone.tx, stone.ty, TileType.Dirt);
                this.worldModel.addItem('stone', 1, stone.tx, stone.ty);
            }
        }
        else if (job.type === 'haul' && phase === 'go_to_target')
        {
            if (job.itemId === undefined) return;
            const item = this.worldModel.getItem(job.itemId);
            if (!item)
            {
                this.jobQueue.cancel(job.id);
                return;
            }
            const inventory = ecs.getComponent<InventoryData>(entity, Inventory);
            if (inventory)
            {
                inventory.carried = item.id;
                inventory.carriedType = item.type;
            }
            this.worldModel.removeItem(item.id);
        }
        else if (job.type === 'haul' && phase === 'go_to_target2')
        {
            const inventory = ecs.getComponent<InventoryData>(entity, Inventory);
            if (inventory && inventory.carried !== null && inventory.carriedType && job.target2)
            {
                this.worldModel.addItem(inventory.carriedType, 1, job.target2.tx, job.target2.ty);
                inventory.carried = null;
                inventory.carriedType = null;
            }
        }
    }
}
