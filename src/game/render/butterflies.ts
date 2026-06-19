// =============================================================================
// Butterflies — small colorful critters that drift across grass clearings.
// =============================================================================
// A handful of 2-3px butterflies wander the world during the day. Each picks
// a color (white, yellow, blue, orange, pink), home point, and gentle drift
// direction. They oscillate vertically with a fast "flap" (4-6 Hz sine)
// which reads as fluttering flight. Visibility scales with day-strength so
// they're gone by dusk when the fireflies take over.
//
// World-anchored (scrollFactor 1) so they stay in place as the camera pans.
// Depth 58 (above fireflies at 57, well below UI) so they're visible against
// forest and grass without crowding the action.
// =============================================================================

import type { Scene } from 'phaser';
import { mulberry32 } from '../util/rng';
import type { World } from '../world/world';

interface Butterfly
{
    sprite: Phaser.GameObjects.Image;
    wingSprite: Phaser.GameObjects.Image;
    homeX: number;
    homeY: number;
    vx: number;
    vy: number;
    bobPhase: number;
    bobPeriod: number;
    wanderRadius: number;
    color: number;
}

const BUTTERFLY_POOL_SIZE = 12;
const BUTTERFLY_W = 4;
const BUTTERFLY_H = 3;
const WING_W = 7;
const WING_H = 4;

// Color variants. Warm and cool pastels so the butterflies read as small
// bright dots against the green/brown forest.
const BUTTERFLY_COLORS = [
    0xffffff, // white (cabbage)
    0xffe070, // yellow (sulphur)
    0x80c8ff, // blue (common blue)
    0xff9870, // orange (monarch-ish)
    0xffaad8, // pink
];

// Hour-of-day -> butterfly visibility multiplier. They prefer daylight and
// disappear by dusk. Peak 11:00-15:00.
function butterflyStrengthAtHour (hour: number): number
{
    const h = ((hour % 24) + 24) % 24;
    if (h < 6 || h > 19) return 0;
    if (h < 8) return (h - 6) / 2;          // dawn ramp-up
    if (h > 17) return Math.max(0, (19 - h) / 2); // dusk ramp-down
    return 1.0;
}

export class Butterflies
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly butterflies: Butterfly[] = [];
    private readonly rng: () => number;
    private readonly world: World;

    constructor (scene: Scene, world: World, seed: number = 1)
    {
        this.world = world;
        this.rng = mulberry32((seed ^ 0xb7eeb11e) >>> 0);
        this.container = scene.add.container(0, 0);
        this.container.setDepth(58);

        this.ensureTextures(scene);

        for (let i = 0; i < BUTTERFLY_POOL_SIZE; i++)
        {
            const color = BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length]!;
            const sprite = scene.add.image(0, 0, 'butterfly-body');
            sprite.setOrigin(0.5, 0.5);
            sprite.setScrollFactor(1);
            sprite.setDepth(58);
            sprite.setTint(color);
            sprite.setAlpha(0);

            const wingSprite = scene.add.image(0, 0, 'butterfly-wing');
            wingSprite.setOrigin(0.5, 0.5);
            wingSprite.setScrollFactor(1);
            wingSprite.setDepth(58);
            wingSprite.setTint(color);
            wingSprite.setAlpha(0);

            this.container.add(sprite);
            this.container.add(wingSprite);

            const bf: Butterfly = {
                sprite,
                wingSprite,
                homeX: 0,
                homeY: 0,
                vx: 0,
                vy: 0,
                bobPhase: 0,
                bobPeriod: 0,
                wanderRadius: 0,
                color,
            };
            this.butterflies.push(bf);
            this.respawn(bf);
        }
    }

    update (tickMs: number, hour: number, _dtMs: number = 0): void
    {
        const strength = butterflyStrengthAtHour(hour);
        if (strength < 0.01)
        {
            for (const bf of this.butterflies)
            {
                bf.sprite.setAlpha(0);
                bf.wingSprite.setAlpha(0);
            }
            return;
        }
        const baseAlpha = 0.85;

        for (const bf of this.butterflies)
        {
            // Drift
            bf.sprite.x += bf.vx * (_dtMs || 16);
            bf.sprite.y += bf.vy * (_dtMs || 16);
            bf.wingSprite.x = bf.sprite.x;
            const dx = bf.sprite.x - bf.homeX;
            const dy = bf.sprite.y - bf.homeY;
            if (dx * dx + dy * dy > bf.wanderRadius * bf.wanderRadius)
            {
                this.respawn(bf);
                continue;
            }

            // Flap — fast oscillation of vertical offset reads as wings.
            // We use a sin wave at 4-6 Hz and compress to small amplitude.
            const flap = Math.sin((tickMs / bf.bobPeriod) * Math.PI * 2);
            const bobY = flap * 1.5;
            bf.sprite.y += bobY;
            bf.wingSprite.y = bf.sprite.y;

            // Wing scale pulses with the flap. Closed wings = thin, open
            // wings = wide. Use the absolute of the sine to make it pulse
            // outward symmetrically.
            const wingScale = 0.4 + Math.abs(flap) * 0.6;
            bf.wingSprite.setScale(wingScale, 0.7 + Math.abs(flap) * 0.3);

            // Face the direction of travel
            const facing = bf.vx >= 0 ? 1 : -1;
            bf.sprite.setFlipX(false);
            bf.wingSprite.setFlipX(facing < 0);

            bf.sprite.setAlpha(strength * baseAlpha);
            bf.wingSprite.setAlpha(strength * baseAlpha * 0.85);
        }
    }

    destroy (): void
    {
        for (const bf of this.butterflies)
        {
            bf.sprite.destroy();
            bf.wingSprite.destroy();
        }
        this.butterflies.length = 0;
        this.container.destroy();
    }

    private respawn (bf: Butterfly): void
    {
        // Spawn on grass/forest tiles (types 2-5: grass, grass-dark, dirt, sand).
        // Walkable, natural — like fireflies.
        const W = this.world.width;
        const H = this.world.height;
        let attempts = 0;
        let tx = 0, ty = 0;
        while (attempts < 8)
        {
            tx = Math.floor(this.rng() * W);
            ty = Math.floor(this.rng() * H);
            const t = this.world.getTile(tx, ty);
            if (t >= 2 && t <= 5) break;
            attempts++;
        }
        const TILE = 16;
        bf.homeX = tx * TILE + TILE / 2 + (this.rng() - 0.5) * 4;
        bf.homeY = ty * TILE + TILE / 2 + (this.rng() - 0.5) * 4;
        bf.sprite.x = bf.homeX;
        bf.sprite.y = bf.homeY;
        bf.wingSprite.x = bf.homeX;
        bf.wingSprite.y = bf.homeY;
        // Slow horizontal drift, very small vertical
        const angle = this.rng() * Math.PI * 2;
        const speed = 0.02 + this.rng() * 0.04; // px per ms
        bf.vx = Math.cos(angle) * speed;
        bf.vy = Math.sin(angle) * speed * 0.3;
        bf.bobPhase = this.rng() * Math.PI * 2;
        bf.bobPeriod = 140 + this.rng() * 80; // 4-6 Hz flap
        bf.wanderRadius = 40 + this.rng() * 30;
        bf.sprite.setAlpha(0);
        bf.wingSprite.setAlpha(0);
    }

    private ensureTextures (scene: Scene): void
    {
        // Body: a small dark vertical smudge (the butterfly's body).
        if (!scene.textures.exists('butterfly-body'))
        {
            const c = document.createElement('canvas');
            c.width = BUTTERFLY_W;
            c.height = BUTTERFLY_H;
            const ctx = c.getContext('2d')!;
            ctx.fillStyle = 'rgba(20, 14, 8, 1)';
            ctx.fillRect(1, 0, 2, 3);
            ctx.fillRect(2, 0, 1, 1);
            scene.textures.addCanvas('butterfly-body', c);
        }
        // Wings: a wider horizontal smudge that scales with the flap.
        // Two lobes — top and bottom — meeting in the middle.
        if (!scene.textures.exists('butterfly-wing'))
        {
            const c = document.createElement('canvas');
            c.width = WING_W;
            c.height = WING_H;
            const ctx = c.getContext('2d')!;
            // Upper wings (top half)
            ctx.fillStyle = 'rgba(255, 255, 255, 1)';
            ctx.fillRect(0, 0, 7, 1);
            ctx.fillRect(1, 1, 5, 1);
            // Lower wings (bottom half, slightly narrower)
            ctx.fillRect(0, 3, 6, 1);
            ctx.fillRect(1, 2, 5, 1);
            scene.textures.addCanvas('butterfly-wing', c);
        }
    }
}