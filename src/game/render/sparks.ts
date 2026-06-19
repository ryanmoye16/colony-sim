// =============================================================================
// Sparks — tiny orange embers that drift up from active fire sources.
// =============================================================================
// Firepits (and any lit source) occasionally spit a small ember that
// floats up, fades, and dies. Adds a warm flicker that smoke alone can't
// deliver — the firepit reads as "alive" rather than "smoldering."
//
// Each ember is a 1-2px additive-blend point that drifts upward with
// strong sideways wobble, brighter than smoke but smaller and shorter
// lived. Pooled across all fire sources so cost is bounded.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';
import { mulberry32 } from '../util/rng';

interface SparkSource
{
    tx: number;
    ty: number;
    cadenceMs: number;     // average ms between emissions
    nextEmitAt: number;
    active: boolean;
}

interface Spark
{
    sprite: Phaser.GameObjects.Image;
    active: boolean;
    lifetime: number;
    startedAt: number;
    originX: number;
    originY: number;
    vx: number;
    vy: number;
    bobPhase: number;
    bobAmp: number;
    peakAlpha: number;
    baseSize: number;
    hueShift: number;      // 0=warm orange, 1=cooler yellow-white
}

const SPARK_POOL_SIZE = 28;
const SPARK_W = 3;
const SPARK_H = 3;

export class Sparks
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly sparks: Spark[] = [];
    private readonly sources: SparkSource[] = [];
    private readonly rng: () => number;

    constructor (scene: Scene, seed: number = 1)
    {
        this.rng = mulberry32((seed ^ 0xa5a5a5a5) >>> 0);
        this.container = scene.add.container(0, 0);
        this.container.setDepth(54);

        this.ensureSparkTexture(scene);

        for (let i = 0; i < SPARK_POOL_SIZE; i++)
        {
            const sprite = scene.add.image(0, 0, 'spark-ember');
            sprite.setOrigin(0.5, 0.5);
            sprite.setScrollFactor(1);
            sprite.setDepth(54);
            sprite.setBlendMode(BlendModes.ADD);
            sprite.setAlpha(0);
            this.container.add(sprite);
            this.sparks.push({
                sprite,
                active: false,
                lifetime: 0,
                startedAt: 0,
                originX: 0,
                originY: 0,
                vx: 0,
                vy: 0,
                bobPhase: 0,
                bobAmp: 0,
                peakAlpha: 0,
                baseSize: 0,
                hueShift: 0,
            });
        }
    }

    addSource (tx: number, ty: number, cadenceMs: number = 180, tick: number = 0): void
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

    update (tickMs: number, _dtMs: number = 0): void
    {
        for (const src of this.sources)
        {
            if (!src.active) continue;
            if (tickMs < src.nextEmitAt) continue;
            this.emitSpark(src.tx, src.ty, tickMs);
            src.nextEmitAt = tickMs + src.cadenceMs * (0.6 + this.rng() * 0.8);
        }

        for (const sp of this.sparks)
        {
            if (!sp.active) continue;
            const age = tickMs - sp.startedAt;
            if (age >= sp.lifetime)
            {
                sp.active = false;
                sp.sprite.setAlpha(0);
                continue;
            }
            // Sparks fade quickly near end of life.
            const t = age / sp.lifetime;
            let a;
            if (t < 0.15)
            {
                a = (t / 0.15) * sp.peakAlpha;
            }
            else
            {
                a = sp.peakAlpha * Math.max(0, 1 - (t - 0.15) / 0.85);
            }
            // Drift up + sideways wobble (stronger than smoke — sparks flutter)
            const bob = Math.sin(tickMs * 0.006 + sp.bobPhase) * sp.bobAmp;
            sp.sprite.x = sp.originX + sp.vx * (age / 1000) + bob;
            sp.sprite.y = sp.originY - sp.vy * (age / 1000);
            sp.sprite.setAlpha(a);
            // Sparks don't grow — they shrink slightly as they cool.
            const shrink = 1.0 - t * 0.3;
            sp.sprite.setDisplaySize(sp.baseSize * shrink, sp.baseSize * shrink);
        }
    }

    destroy (): void
    {
        for (const s of this.sparks) s.sprite.destroy();
        this.sparks.length = 0;
        this.sources.length = 0;
        this.container.destroy();
    }

    private emitSpark (tx: number, ty: number, tickMs: number): void
    {
        let sp = this.sparks.find((s) => !s.active);
        if (!sp)
        {
            sp = this.sparks.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
        }
        const TILE = 16;
        sp.originX = tx * TILE + TILE / 2 + (this.rng() - 0.5) * 4;
        sp.originY = ty * TILE + 4;
        sp.sprite.x = sp.originX;
        sp.sprite.y = sp.originY;
        // Sparks shoot up faster and with more wobble than smoke.
        sp.vy = 22 + this.rng() * 16;       // 22-38 px/sec upward
        sp.vx = (this.rng() - 0.5) * 12;    // ±6 px/sec sideways
        sp.bobPhase = this.rng() * Math.PI * 2;
        sp.bobAmp = 1.5 + this.rng() * 2.5; // strong flutter
        sp.lifetime = 1100 + this.rng() * 600;
        sp.peakAlpha = 0.85 + this.rng() * 0.15;
        sp.baseSize = 3 + this.rng() * 2;   // 3-5px
        sp.hueShift = this.rng();
        sp.sprite.setDisplaySize(sp.baseSize, sp.baseSize);
        sp.sprite.setAlpha(0);
        sp.startedAt = tickMs;
        sp.active = true;
    }

    private ensureSparkTexture (scene: Scene): void
    {
        if (scene.textures.exists('spark-ember')) return;
        const c = document.createElement('canvas');
        c.width = SPARK_W;
        c.height = SPARK_H;
        const ctx = c.getContext('2d')!;
        const cx = SPARK_W / 2;
        const cy = SPARK_H / 2;
        // Warm orange-yellow gradient. Center is hot white, edges fade to amber.
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0, 'rgba(255, 240, 200, 1.0)');
        grad.addColorStop(0.4, 'rgba(255, 180, 80, 0.9)');
        grad.addColorStop(1, 'rgba(255, 100, 30, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SPARK_W, SPARK_H);
        scene.textures.addCanvas('spark-ember', c);
    }
}
