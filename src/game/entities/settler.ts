import { ECSWorld } from '../ecs/world';
import { Position, Render, AI, Needs, Inventory, Life, Relationship } from '../ecs/components';
import type { PositionData, RenderData, AIData, NeedsData, InventoryData, LifeData, RelationshipData } from '../ecs/components';
import type { GameObjects } from 'phaser';
import { isWalkable } from '../world/tile';
import type { World as WorldModel } from '../world/world';
import { TILE_SIZE } from '../config/game.config';

export function createSettler (
    ecs: ECSWorld,
    scene: Phaser.Scene,
    container: GameObjects.Container,
    tx: number,
    ty: number,
    textureKey: string,
    parents: [number, number] | null = null,
    generation: number = 1,
    birthTick: number = 0,
): number
{
    const id = ecs.createEntity();

    const pos: PositionData = { tx, ty };
    ecs.addComponent(id, Position, pos);

    const px = tx * TILE_SIZE + TILE_SIZE / 2;
    const py = ty * TILE_SIZE + TILE_SIZE / 2;
    const sprite = scene.add.image(px, py, textureKey);
    container.add(sprite);

    const render: RenderData = { size: TILE_SIZE, gameObject: sprite, textureKey };
    ecs.addComponent(id, Render, render);

    const ai: AIData = { state: 'wandering', nextMoveAt: 0, path: null, pathIndex: 0, facing: 's' };
    ecs.addComponent(id, AI, ai);

    const needs: NeedsData = { hunger: 1.0, social: 1.0 };
    ecs.addComponent(id, Needs, needs);

    const inventory: InventoryData = { carried: null, carriedType: null };
    ecs.addComponent(id, Inventory, inventory);

    const life: LifeData = { birthTick, parents, generation };
    ecs.addComponent(id, Life, life);

    const relationship: RelationshipData = { partner: null, intimacy: new Map() };
    ecs.addComponent(id, Relationship, relationship);

    return id;
}

export function createChildSettler (
    ecs: ECSWorld,
    scene: Phaser.Scene,
    container: GameObjects.Container,
    tx: number,
    ty: number,
    parents: [number, number],
    generation: number,
    birthTick: number,
    textureKey: string,
): number
{
    return createSettler(ecs, scene, container, tx, ty, textureKey, parents, generation, birthTick);
}

export function findWalkableSpawn (world: WorldModel): { tx: number; ty: number }
{
    const cx = Math.floor(world.width / 2);
    const cy = Math.floor(world.height / 2);

    for (let r = 0; r < 32; r++)
    {
        for (let dy = -r; dy <= r; dy++)
        {
            for (let dx = -r; dx <= r; dx++)
            {
                if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const tx = cx + dx;
                const ty = cy + dy;
                if (!world.inBounds(tx, ty)) continue;
                if (isWalkable(world.getTile(tx, ty))) return { tx, ty };
            }
        }
    }
    return { tx: cx, ty: cy };
}
