import type { Scene } from 'phaser';
import type { System } from './index';
import type { ECSWorld } from '../world';
import { Position, Render, Life, AI } from '../components';
import type { PositionData, RenderData, LifeData, AIData } from '../components';
import { TILE_SIZE, getAgeStage, LIFESPAN_TICKS } from '../../config/game.config';

const BASE_SIZE = TILE_SIZE * 0.95;

export class RenderSyncSystem implements System
{
    constructor (private readonly scene: Scene) {}

    update (ecs: ECSWorld, tick: number, _dt: number): void
    {
        ecs.forEach<PositionData>(Position, (entity, pos) => {
            const render = ecs.getComponent<RenderData>(entity, Render);
            if (!render?.gameObject) return;
            const img = render.gameObject as unknown as Phaser.GameObjects.Image;

            const ai = ecs.getComponent<AIData>(entity, AI);
            const moving = !!(ai?.path && ai.pathIndex < ai.path.length && ai.state !== 'wandering');
            const bob = moving ? Math.sin(tick * 0.35) * (TILE_SIZE * 0.06) : 0;

            img.x = pos.tx * TILE_SIZE + TILE_SIZE / 2;
            img.y = pos.ty * TILE_SIZE + TILE_SIZE / 2 + bob;

            if (moving)
            {
                const baseKey = render.textureKey;
                const phase = Math.floor(tick / 12) % 2;
                const walkKey = phase === 0 ? `${baseKey}-walk-a` : `${baseKey}-walk-b`;
                if (img.texture.key !== walkKey && this.scene.textures.exists(walkKey))
                {
                    img.setTexture(walkKey);
                }
            }
            else if (img.texture.key !== render.textureKey)
            {
                if (this.scene.textures.exists(render.textureKey))
                {
                    img.setTexture(render.textureKey);
                }
            }

            const life = ecs.getComponent<LifeData>(entity, Life);
            if (life)
            {
                const stage = getAgeStage(life.birthTick, tick, LIFESPAN_TICKS);
                let sizeScale = 1.0;
                if (stage === 'infant') sizeScale = 0.4;
                else if (stage === 'child') sizeScale = 0.6;
                else if (stage === 'elder') sizeScale = 0.85;
                const displaySize = BASE_SIZE * sizeScale;
                img.setDisplaySize(displaySize, displaySize);
            }
        });
    }
}
