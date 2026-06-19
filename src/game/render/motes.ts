// =============================================================================
// Motes — slow-drifting ambient dust particles.
// =============================================================================
// Tiny 1-2px specks that drift upward at 1-2 px/sec with gentle horizontal
// wobble. Spawned across the visible world area so the air always has a few
// visible motes regardless of camera position. Each mote lives 6-12 seconds
// before recycling, so the population churns slowly.
//
// World-anchored (scrollFactor 1) so they stay put as the camera pans.
// Depth 52 sits them between settler (10) and tint (50) — visible but
// not loud. Additive blend makes them glow softly against any background.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';
import { mulberry32 } from '../util/rng';

interface Mote
{
    sprite: Phaser.GameObjects.Image;
    originX: number;
    originY: number;
    bobPhase: number;
    bobAmp: number;
    baseSize: number;
    peakAlpha: number;
    vy: number;
    vx: number;
    lifetime: number;
    startedAt: number;
    driftRange: number;  // max horizontal drift before teleport-back
}

const MOTE_POOL_SIZE = 120;
const MOTE_W = 2;
const MOTE_H = 2;

export class Motes
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly motes: Mote[] = [];
    private readonly rng: () => number;
    private readonly worldW: number;
    private readonly worldH: number;

    constructor (scene: Scene, worldWidthTiles: number, worldHeightTiles: number, seed: number = 1)
    {
        this.rng = mulberry32((seed ^ 0x12345678) >>> 0);
        this.worldW = worldWidthTiles * 16;
        this.worldH = worldHeightTiles * 16;

        this.container = scene.add.container(0, 0);
        this.container.setDepth(52);

        this.ensureTexture(scene);

        for (let i = 0; i < MOTE_POOL_SIZE; i++)
        {
            const sprite = scene.add.image(0, 0, 'mote-dust');
            sprite.setOrigin(0.5, 0.5);
            sprite.setScrollFactor(1);
            sprite.setDepth(52);
            sprite.setBlendMode(BlendModes.ADD);
            sprite.setAlpha(0);
            this.container.add(sprite);

            const mote: Mote = {
                sprite,
                originX: 0,
                originY: 0,
                bobPhase: 0,
                bobAmp: 0,
                baseSize: 0,
                peakAlpha: 0,
                vy: 0,
                vx: 0,
                lifetime: 0,
                startedAt: 0,
                driftRange: 0,
            };
            this.motes.push(mote);
            // Stagger initial spawn across a long window so they don't all
            // appear at once at sim tick 0. Each mote gets a random age in
            // [0, 12s] — at sim start, motes are scattered across their
            // lifetime curves.
            this.respawn(mote, -this.rng() * 12000);
        }
    }

    update (tickMs: number, _dtMs: number = 0): void
    {
        for (const m of this.motes)
        {
            const age = tickMs - m.startedAt;
            if (age >= m.lifetime)
            {
                this.respawn(m, tickMs);
                continue;
            }
            const t = age / m.lifetime;
            // Motes fade in/out gently so the population never feels like
            // it pops in or out at full alpha.
            let a;
            if (t < 0.2) a = (t / 0.2) * m.peakAlpha;
            else if (t > 0.7) a = m.peakAlpha * Math.max(0, 1 - (t - 0.7) / 0.3);
            else a = m.peakAlpha;

            const driftX = (this.rng() - 0.5) * m.driftRange;
            const bob = Math.sin(tickMs * 0.0008 + m.bobPhase) * m.bobAmp;
            m.sprite.x = m.originX + m.vx * (age / 1000) + bob + driftX;
            m.sprite.y = m.originY - m.vy * (age / 1000);
            m.sprite.setAlpha(a);
            m.sprite.setDisplaySize(m.baseSize, m.baseSize);
        }
    }

    destroy (): void
    {
        for (const m of this.motes) m.sprite.destroy();
        this.motes.length = 0;
        this.container.destroy();
    }

    private respawn (m: Mote, tickMs: number): void
    {
        // Spawn anywhere in the world. Motes that drift out of bounds
        // (e.g. origin near a corner) recycle early on the next update.
        m.originX = this.rng() * this.worldW;
        m.originY = this.rng() * this.worldH;
        m.vy = 1.0 + this.rng() * 1.5;        // 1.0-2.5 px/sec upward
        m.vx = (this.rng() - 0.5) * 0.6;      // ±0.3 px/sec sideways
        m.bobPhase = this.rng() * Math.PI * 2;
        m.bobAmp = 1.0 + this.rng() * 2.0;
        m.driftRange = this.rng() * 4;
        m.lifetime = 6000 + this.rng() * 6000;
        m.peakAlpha = 0.18 + this.rng() * 0.22;
        m.baseSize = 1 + Math.floor(this.rng() * 2);
        m.startedAt = tickMs;
        m.sprite.x = m.originX;
        m.sprite.y = m.originY;
        m.sprite.setAlpha(0);
        m.sprite.setDisplaySize(m.baseSize, m.baseSize);
    }

    private ensureTexture (scene: Scene): void
    {
        if (scene.textures.exists('mote-dust')) return;
        const c = document.createElement('canvas');
        c.width = MOTE_W;
        c.height = MOTE_H;
        const ctx = c.getContext('2d')!;
        const cx = MOTE_W / 2;
        const cy = MOTE_H / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0, 'rgba(255, 250, 240, 1.0)');
        grad.addColorStop(0.6, 'rgba(255, 245, 220, 0.5)');
        grad.addColorStop(1, 'rgba(255, 240, 200, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, MOTE_W, MOTE_H);
        scene.textures.addCanvas('mote-dust', c);
    }
}
