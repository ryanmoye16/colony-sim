// =============================================================================
// Smoke — slow drifting puffs above active fire sources.
// =============================================================================
// Each firepit (or any lit source) emits a small puff of smoke at a
// configurable cadence. Puffs drift upward with a sine-wave wobble,
// fade in from invisible to peak alpha, then fade out. We pool the
// sprites so the cost is independent of how many fires are burning.
//
// Smoke is world-positioned (scrollFactor 1) so it stays anchored to
// the fire source as the camera pans. Depth 53 sits it between the
// rain layer and the vignette, matching other particle effects.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';
import { mulberry32 } from '../util/rng';

interface SmokeSource
{
    tx: number;
    ty: number;
    cadenceMs: number;     // average ms between puffs
    nextEmitAt: number;    // sim tick when next puff should appear
    active: boolean;
}

interface SmokePuff
{
    sprite: Phaser.GameObjects.Image;
    active: boolean;
    expiresAt: number;     // sim tick when puff should be reclaimed
    fadeIn: number;        // ms — alpha ramps from 0 to peak
    fadeOut: number;       // ms — alpha ramps from peak to 0
    lifetime: number;      // total ms
    originX: number;       // world px where puff was emitted
    originY: number;
    vy: number;            // px/sec upward drift
    vx: number;            // px/sec sideways drift (slow)
    bobPhase: number;
    bobAmp: number;
    baseSize: number;      // starting display size in px
    peakAlpha: number;
    // Cached for fade math
    startedAt: number;
}

const PUFF_POOL_SIZE = 48;
const PUFF_HEIGHT_PX = 6;
const PUFF_WIDTH_PX = 6;

export class Smoke
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly puffs: SmokePuff[] = [];
    private readonly sources: SmokeSource[] = [];
    private readonly rng: () => number;

    constructor (scene: Scene, seed: number = 1)
    {
        this.rng = mulberry32(seed * 0x85ebca6b);
        this.container = scene.add.container(0, 0);
        this.container.setDepth(53);

        this.ensurePuffTexture(scene);

        for (let i = 0; i < PUFF_POOL_SIZE; i++)
        {
            const sprite = scene.add.image(0, 0, 'smoke-puff');
            sprite.setOrigin(0.5, 0.5);
            sprite.setScrollFactor(1);
            sprite.setDepth(53);
            sprite.setBlendMode(BlendModes.NORMAL);
            sprite.setAlpha(0);
            this.container.add(sprite);
            this.puffs.push({
                sprite,
                active: false,
                expiresAt: 0,
                fadeIn: 0,
                fadeOut: 0,
                lifetime: 0,
                originX: 0,
                originY: 0,
                vy: 0,
                vx: 0,
                bobPhase: 0,
                bobAmp: 0,
                baseSize: 0,
                peakAlpha: 0,
                startedAt: 0,
            });
        }
    }

    /**
     * Register a fire source. `tick` is the current sim tick so the first
     * puff is scheduled deterministically.
     */
    addSource (tx: number, ty: number, cadenceMs: number = 1800, tick: number = 0): void
    {
        this.sources.push({
            tx, ty,
            cadenceMs,
            nextEmitAt: tick + cadenceMs * this.rng(),
            active: true,
        });
    }

    setSourceActive (tx: number, ty: number, active: boolean): void
    {
        for (const s of this.sources)
        {
            if (s.tx === tx && s.ty === ty)
            {
                s.active = active;
            }
        }
    }

    /**
     * Step the smoke forward by `dtMs` real-time. Uses sim tick for source
     * cadence so puffs stay in lockstep with game time even when the player
     * pauses/scrubs the sim.
     */
    update (tickMs: number, _dtMs: number = 0): void
    {
        // 1. Emit new puffs from active sources.
        for (const src of this.sources)
        {
            if (!src.active) continue;
            if (tickMs < src.nextEmitAt) continue;
            // Stagger slightly so consecutive puffs don't all start at the
            // exact same offset (would look like a column).
            this.emitPuff(src.tx, src.ty, tickMs);
            src.nextEmitAt = tickMs + src.cadenceMs * (0.7 + this.rng() * 0.6);
        }

        // 2. Update active puffs.
        for (const puff of this.puffs)
        {
            if (!puff.active) continue;
            const age = tickMs - puff.startedAt;
            if (age >= puff.lifetime)
            {
                puff.active = false;
                puff.sprite.setAlpha(0);
                continue;
            }
            // Alpha envelope: 0 -> peak (over fadeIn), peak -> 0 (over fadeOut).
            let a;
            if (age < puff.fadeIn)
            {
                a = (age / puff.fadeIn) * puff.peakAlpha;
            }
            else if (age < puff.lifetime - puff.fadeOut)
            {
                a = puff.peakAlpha;
            }
            else
            {
                const t = (puff.lifetime - age) / puff.fadeOut;
                a = puff.peakAlpha * Math.max(0, t);
            }
            // Drift up + sideways wobble.
            const bob = Math.sin(tickMs * 0.003 + puff.bobPhase) * puff.bobAmp;
            puff.sprite.x = puff.originX + puff.vx * (age / 1000) + bob;
            puff.sprite.y = puff.originY - puff.vy * (age / 1000);
            puff.sprite.setAlpha(a);
            // Puff grows as it rises — fresh smoke is small, dispersed
            // smoke is wide and faint.
            const grow = 1.0 + (age / puff.lifetime) * 1.8;
            puff.sprite.setDisplaySize(puff.baseSize * grow, puff.baseSize * grow);
        }
    }

    destroy (): void
    {
        for (const p of this.puffs) p.sprite.destroy();
        this.puffs.length = 0;
        this.sources.length = 0;
        this.container.destroy();
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Pull a free puff from the pool (or recycle the oldest active one) and
     * configure it as a fresh emission at (tx, ty).
     */
    private emitPuff (tx: number, ty: number, tickMs: number): void
    {
        let puff = this.puffs.find((p) => !p.active);
        if (!puff)
        {
            puff = this.puffs.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
        }
        const TILE = 16;
        puff.originX = tx * TILE + TILE / 2 + (this.rng() - 0.5) * 3;
        puff.originY = ty * TILE + 4;
        puff.sprite.x = puff.originX;
        puff.sprite.y = puff.originY;
        puff.vy = 10 + this.rng() * 8;      // 10-18 px/sec upward
        puff.vx = (this.rng() - 0.5) * 5;   // -2.5..2.5 px/sec sideways drift
        puff.bobPhase = this.rng() * Math.PI * 2;
        puff.bobAmp = 1.5 + this.rng() * 1.5;
        puff.fadeIn = 800 + this.rng() * 400;
        puff.fadeOut = 2200 + this.rng() * 800;
        puff.lifetime = puff.fadeIn + 1600 + this.rng() * 1000 + puff.fadeOut;
        puff.peakAlpha = 0.55 + this.rng() * 0.15;
        puff.baseSize = 5 + this.rng() * 3;
        puff.sprite.setDisplaySize(puff.baseSize, puff.baseSize);
        puff.sprite.setAlpha(0);
        puff.startedAt = tickMs;
        puff.active = true;
        puff.expiresAt = tickMs + puff.lifetime;
    }

    private ensurePuffTexture (scene: Scene): void
    {
        if (scene.textures.exists('smoke-puff')) return;
        const c = document.createElement('canvas');
        c.width = PUFF_WIDTH_PX;
        c.height = PUFF_HEIGHT_PX;
        const ctx = c.getContext('2d')!;
        const cx = PUFF_WIDTH_PX / 2;
        const cy = PUFF_HEIGHT_PX / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0, 'rgba(232, 232, 240, 0.95)');
        grad.addColorStop(0.5, 'rgba(220, 220, 232, 0.6)');
        grad.addColorStop(1, 'rgba(200, 200, 215, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, PUFF_WIDTH_PX, PUFF_HEIGHT_PX);
        scene.textures.addCanvas('smoke-puff', c);
    }
}