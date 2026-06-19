// =============================================================================
// Fireflies — soft yellow-green glows that appear at dusk and disappear
// at dawn.
// =============================================================================
// Each firefly is a 2-3px warm-yellow dot with an additive halo that drifts
// around grass and forest tiles. The whole system fades in based on the
// hour-of-day: invisible at midday, peaking around 21:00, gone again by
// sunrise. They drift with sine-wave bobbing and gentle horizontal wander,
// ~6-12s per firefly before respawning.
//
// World-anchored so they stay put as the camera pans. Depth 57 sits them
// above vignette so they're visible against darkened backgrounds.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';
import { mulberry32 } from '../util/rng';
import type { World } from '../world/world';

interface Firefly
{
    sprite: Phaser.GameObjects.Image;
    halo: Phaser.GameObjects.Image;
    originX: number;
    originY: number;
    bobPhase: number;
    bobAmp: number;
    wanderPhase: number;
    wanderAmp: number;
    wanderSpeed: number;
    baseSize: number;
    peakAlpha: number;
    lifetime: number;
    startedAt: number;
}

const FIREFLY_POOL_SIZE = 28;
const FIREFLY_W = 3;
const FIREFLY_H = 3;
const HALO_W = 9;
const HALO_H = 9;

// Hour-of-day -> firefly visibility multiplier. At midday the world is
// bright and fireflies are invisible. They ramp up through dusk, peak
// around 21:00, then ramp down to dawn. Outside the window, no fireflies.
const HOUR_FIREFLY_STRENGTH: Array<[number, number]> = [
    [0, 1.0],   // midnight: full
    [6, 0.4],   // dawn: ramping down
    [8, 0.0],   // morning: gone
    [17, 0.0],  // afternoon: gone
    [19, 0.3],  // dusk: ramping up
    [21, 1.0],  // evening: full
    [24, 1.0],  // wraparound to 0
];

function fireflyStrengthAtHour (hour: number): number
{
    const h = ((hour % 24) + 24) % 24;
    for (let i = 0; i < HOUR_FIREFLY_STRENGTH.length - 1; i++)
    {
        const [h0, v0] = HOUR_FIREFLY_STRENGTH[i]!;
        const [h1, v1] = HOUR_FIREFLY_STRENGTH[i + 1]!;
        if (h >= h0 && h <= h1)
        {
            const t = (h - h0) / (h1 - h0);
            return v0 + (v1 - v0) * t;
        }
    }
    return 0;
}

export class Fireflies
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly fireflies: Firefly[] = [];
    private readonly rng: () => number;
    private readonly world: World;
    private currentHourStrength = 0;

    constructor (scene: Scene, world: World, seed: number = 1)
    {
        this.world = world;
        this.rng = mulberry32((seed ^ 0xfeedbeef) >>> 0);
        this.container = scene.add.container(0, 0);
        this.container.setDepth(57);

        this.ensureTextures(scene);

        for (let i = 0; i < FIREFLY_POOL_SIZE; i++)
        {
            const halo = scene.add.image(0, 0, 'firefly-halo');
            halo.setOrigin(0.5, 0.5);
            halo.setScrollFactor(1);
            halo.setDepth(57);
            halo.setBlendMode(BlendModes.ADD);
            halo.setAlpha(0);

            const sprite = scene.add.image(0, 0, 'firefly-core');
            sprite.setOrigin(0.5, 0.5);
            sprite.setScrollFactor(1);
            sprite.setDepth(57);
            sprite.setBlendMode(BlendModes.ADD);
            sprite.setAlpha(0);

            this.container.add(halo);
            this.container.add(sprite);

            const ff: Firefly = {
                sprite,
                halo,
                originX: 0,
                originY: 0,
                bobPhase: 0,
                bobAmp: 0,
                wanderPhase: 0,
                wanderAmp: 0,
                wanderSpeed: 0,
                baseSize: 0,
                peakAlpha: 0,
                lifetime: 0,
                startedAt: 0,
            };
            this.fireflies.push(ff);
            this.respawn(ff, -this.rng() * 10000);
        }
    }

    /**
     * Update fireflies. `hour` is the current in-game hour (0-24). Firefly
     * visibility is driven entirely by hour-of-day; everything else is
     * cosmetic motion.
     */
    update (tickMs: number, hour: number, _dtMs: number = 0): void
    {
        this.currentHourStrength = fireflyStrengthAtHour(hour);
        if (this.currentHourStrength < 0.01)
        {
            // Fully invisible — fast path. Don't bother updating positions.
            for (const ff of this.fireflies)
            {
                ff.sprite.setAlpha(0);
                ff.halo.setAlpha(0);
            }
            return;
        }

        for (const ff of this.fireflies)
        {
            const age = tickMs - ff.startedAt;
            if (age >= ff.lifetime)
            {
                this.respawn(ff, tickMs);
                continue;
            }
            const t = age / ff.lifetime;
            // Each firefly has its own internal fade — stronger mid-life,
            // dim at the edges of its lifetime — so they twinkle on/off.
            const lifeAlpha = t < 0.1
                ? (t / 0.1)
                : t > 0.85
                    ? Math.max(0, 1 - (t - 0.85) / 0.15)
                    : 0.7 + 0.3 * Math.sin(t * Math.PI * 4);
            const a = ff.peakAlpha * lifeAlpha * this.currentHourStrength;

            const wander = Math.sin(tickMs * 0.0005 * ff.wanderSpeed + ff.wanderPhase) * ff.wanderAmp;
            const bob = Math.sin(tickMs * 0.001 + ff.bobPhase) * ff.bobAmp;
            ff.sprite.x = ff.originX + wander;
            ff.sprite.y = ff.originY + bob;
            ff.halo.x = ff.sprite.x;
            ff.halo.y = ff.sprite.y;

            ff.sprite.setAlpha(a);
            ff.halo.setAlpha(a * 0.6);
            ff.sprite.setDisplaySize(ff.baseSize, ff.baseSize);
            ff.halo.setDisplaySize(ff.baseSize * 3.5, ff.baseSize * 3.5);
        }
    }

    destroy (): void
    {
        for (const ff of this.fireflies)
        {
            ff.sprite.destroy();
            ff.halo.destroy();
        }
        this.fireflies.length = 0;
        this.container.destroy();
    }

    private respawn (ff: Firefly, tickMs: number): void
    {
        // Spawn only on grass/forest tiles. We sample random tiles until
        // we find a walkable natural tile (cached via dustableTile logic
        // would be nice, but keep this self-contained for now).
        const W = this.world.width;
        const H = this.world.height;
        let attempts = 0;
        let tx = 0, ty = 0;
        while (attempts < 8)
        {
            tx = Math.floor(this.rng() * W);
            ty = Math.floor(this.rng() * H);
            const t = this.world.getTile(tx, ty);
            // Grass, dirt, sand — anything natural and walkable.
            if (t >= 2 && t <= 5) break;
            attempts++;
        }
        const TILE = 16;
        ff.originX = tx * TILE + TILE / 2 + (this.rng() - 0.5) * 4;
        ff.originY = ty * TILE + TILE / 2 + (this.rng() - 0.5) * 4;
        ff.bobPhase = this.rng() * Math.PI * 2;
        ff.bobAmp = 1.5 + this.rng() * 2.0;
        ff.wanderPhase = this.rng() * Math.PI * 2;
        ff.wanderAmp = 6 + this.rng() * 14;
        ff.wanderSpeed = 0.5 + this.rng() * 1.0;
        ff.lifetime = 7000 + this.rng() * 6000;
        ff.peakAlpha = 0.55 + this.rng() * 0.25;
        ff.baseSize = 2 + Math.floor(this.rng() * 2);
        ff.startedAt = tickMs;
        ff.sprite.x = ff.originX;
        ff.sprite.y = ff.originY;
        ff.halo.x = ff.originX;
        ff.halo.y = ff.originY;
        ff.sprite.setAlpha(0);
        ff.halo.setAlpha(0);
    }

    private ensureTextures (scene: Scene): void
    {
        if (!scene.textures.exists('firefly-core'))
        {
            const c = document.createElement('canvas');
            c.width = FIREFLY_W;
            c.height = FIREFLY_H;
            const ctx = c.getContext('2d')!;
            const cx = FIREFLY_W / 2;
            const cy = FIREFLY_H / 2;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
            grad.addColorStop(0, 'rgba(255, 255, 220, 1.0)');
            grad.addColorStop(0.5, 'rgba(255, 240, 130, 0.8)');
            grad.addColorStop(1, 'rgba(255, 220, 80, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, FIREFLY_W, FIREFLY_H);
            scene.textures.addCanvas('firefly-core', c);
        }
        if (!scene.textures.exists('firefly-halo'))
        {
            const c = document.createElement('canvas');
            c.width = HALO_W;
            c.height = HALO_H;
            const ctx = c.getContext('2d')!;
            const cx = HALO_W / 2;
            const cy = HALO_H / 2;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
            grad.addColorStop(0, 'rgba(255, 240, 130, 0.7)');
            grad.addColorStop(0.4, 'rgba(255, 230, 100, 0.3)');
            grad.addColorStop(1, 'rgba(255, 220, 80, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, HALO_W, HALO_H);
            scene.textures.addCanvas('firefly-halo', c);
        }
    }
}
