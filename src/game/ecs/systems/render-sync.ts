import type { Scene } from 'phaser';
import type { System } from './index';
import type { ECSWorld } from '../world';
import { Position, Render, Life, AI, Inventory } from '../components';
import type { PositionData, RenderData, LifeData, AIData, InventoryData } from '../components';
import { TILE_SIZE, getAgeStage, LIFESPAN_TICKS } from '../../config/game.config';
import type { SettlerShadows } from '../../render/shadows';
import { resolveTextureKey, ITEM_TEXTURE_KEYS } from '../../render/sprites';

const BASE_SIZE = TILE_SIZE * 0.95;

export class RenderSyncSystem implements System
{
    constructor (
        private readonly scene: Scene,
        private readonly shadows: SettlerShadows | null = null,
    ) {}

    update (ecs: ECSWorld, tick: number, _dt: number): void
    {
        const liveEntities = new Set<number>();

        ecs.forEach<PositionData>(Position, (entity, pos) => {
            const render = ecs.getComponent<RenderData>(entity, Render);
            if (!render?.gameObject) return;
            const img = render.gameObject as unknown as Phaser.GameObjects.Image;

            const ai = ecs.getComponent<AIData>(entity, AI);
            const moving = !!(ai?.path && ai.pathIndex < ai.path.length && ai.state !== 'wandering');
            // Walking bob is large and lively; idle breath is a tiny slow
            // oscillation so even stationary settlers feel like they're
            // breathing. Combined with walking bob when in motion so the
            // settler never goes fully still.
            const walkBob = moving ? Math.sin(tick * 0.35) * (TILE_SIZE * 0.06) : 0;
            const breathBob = Math.sin(tick * 0.08 + entity * 0.13) * (TILE_SIZE * 0.012);
            const bob = walkBob + breathBob;

            const feetX = pos.tx * TILE_SIZE + TILE_SIZE / 2;
            const feetY = pos.ty * TILE_SIZE + TILE_SIZE / 2;
            img.x = feetX;
            img.y = feetY + bob;

            const baseKey = render.textureKey; // e.g. 'settler-red'
            const phase = Math.floor(tick / 12) % 2;
            const walkFrame = phase === 0 ? 'walk-a' : 'walk-b';
            const aliasKey = moving ? `${baseKey}-${walkFrame}` : baseKey;
            // Resolve the alias (e.g. 'settler-red-walk-a') to the underlying
            // Kenney PNG key (e.g. 'td-0085') before passing to Phaser.
            const targetKey = resolveTextureKey(aliasKey);
            if (img.texture.key !== targetKey && this.scene.textures.exists(targetKey))
            {
                img.setTexture(targetKey);
            }

            // Mirror the sprite when facing west so the settler visually faces
            // the direction they're walking. Kenney sprites all face south by
            // default; mirroring is cheap (no texture swap) and reads correctly
            // at small pixel-art sizes.
            const facing = ai?.facing ?? 's';
            const shouldFlip = facing === 'w';
            if (img.flipX !== shouldFlip) img.setFlipX(shouldFlip);

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

            // Drop-shadow follows the feet, not the bob — the settler appears
            // to lift off the shadow while walking.
            if (this.shadows)
            {
                this.shadows.update(entity, feetX, feetY);
            }

            // Carry sprite — if the settler has picked something up, show
            // the matching item sprite above their head. Position follows
            // the settler body so it bobs along with walking. Hidden when
            // the inventory is empty so the settler reads as "unburdened."
            if (render.carrySprite)
            {
                const carry = render.carrySprite as unknown as Phaser.GameObjects.Image;
                const inv = ecs.getComponent<InventoryData>(entity, Inventory);
                if (inv && inv.carriedType && ITEM_TEXTURE_KEYS[inv.carriedType])
                {
                    const targetKey = ITEM_TEXTURE_KEYS[inv.carriedType]!;
                    if (carry.texture.key !== targetKey && this.scene.textures.exists(targetKey))
                    {
                        carry.setTexture(targetKey);
                    }
                    carry.setVisible(true);
                    // Slight independent bob so the carried item floats a
                    // little, separate from the walk bob — reads as
                    // "carried with effort" rather than rigidly attached.
                    const carryBob = Math.sin(tick * 0.18 + entity * 0.7) * 1.2;
                    carry.x = feetX;
                    carry.y = feetY + bob - TILE_SIZE * 0.55 + carryBob;
                }
                else
                {
                    carry.setVisible(false);
                }
            }

            liveEntities.add(entity);
        });

        // Remove shadows for entities that no longer exist (death, etc.).
        if (this.shadows) this.shadows.pruneTo(liveEntities);
    }
}
