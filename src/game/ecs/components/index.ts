import type { GameObjects } from 'phaser';

export const Position = 'Position';
export const Render = 'Render';
export const Name = 'Name';
export const Stats = 'Stats';
export const Needs = 'Needs';
export const Skills = 'Skills';
export const Inventory = 'Inventory';
export const AI = 'AI';
export const Life = 'Life';
export const Relationship = 'Relationship';
export const Path = 'Path';

export interface AIData
{
    state: 'wandering' | 'seeking_food' | 'seeking_social' | 'working';
    nextMoveAt: number;
    path: Array<{ tx: number; ty: number }> | null;
    pathIndex: number;
    jobId?: number;
    jobPhase?: 'go_to_target' | 'go_to_target2';
}

export interface PositionData
{
    tx: number;
    ty: number;
}

export interface RenderData
{
    size: number;
    gameObject?: GameObjects.GameObject;
    textureKey: string;
}

export interface NeedsData
{
    hunger: number;
    social: number;
}

export interface InventoryData
{
    carried: number | null;
    carriedType: string | null;
}

export interface LifeData
{
    birthTick: number;
    parents: [number, number] | null;
    generation: number;
}

export interface RelationshipData
{
    partner: number | null;
    intimacy: Map<number, number>;
    pregnant?: { startTick: number };
}
