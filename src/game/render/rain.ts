// =============================================================================
// Rain — light atmospheric drizzle with occasional splashes.
// =============================================================================
// A persistent gentle rain reads as "the world has weather" without dominating
// the frame. We pool ~140 thin diagonal streaks that fall across the camera
// viewport, each with its own speed and horizontal drift so the rain doesn't
// beat in unison. When a drop crosses the lower half of the viewport we
// briefly show a small splash sprite (a 3x1 white horizontal stroke) that
// fades out over ~280ms. Splashes sell the effect — without them the rain
// just looks like a static pattern of streaks.
//
// Drops and splashes are screen-space (`setScrollFactor(0)`) so they always
// fall over the visible viewport regardless of camera position, and they're
// pooled to keep cost independent of camera/scene size.
//
// We keep this separate from WaterShimmer because the visual logic is
// different (vertical fall vs horizontal drift), even though the pooled-
// sprite pattern is the same.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';
import { mulberry32 } from '../util/rng';

// Drop pool — vertical 1-2 px streaks that drift at a slight angle.
const DROP_COUNT = 140;
const DROP_HEIGHT_PX = 5;
const DROP_WIDTH_PX = 1;
const DROP_VY_MIN = 280;  // px/sec
const DROP_VY_MAX = 460;
const DROP_VX_MIN = 18;   // small angle drift
const DROP_VX_MAX = 38;
const DROP_ALPHA = 0.34;

// Splash pool — short horizontal strokes shown briefly when a drop "lands".
const SPLASH_COUNT = 28;
const SPLASH_WIDTH_PX = 4;
const SPLASH_HEIGHT_PX = 1;
const SPLASH_LIFETIME_MS = 280;
const SPLASH_ALPHA = 0.55;
// Below this viewport y (relative), drops spawn splashes.
const SPLASH_BAND_TOP_PCT = 0.55;

interface DropEntry
{
    sprite: Phaser.GameObjects.Image;
    vx: number;
    vy: number;
    baseX: number;     // anchor for sine-wave wobble
    wobblePhase: number;
    wobbleAmp: number;
    alphaJitter: number;
}

interface SplashEntry
{
    sprite: Phaser.GameObjects.Image;
    active: boolean;
    expiresAt: number;
    baseX: number;
    baseY: number;
    fadeDuration: number;
}

export class Rain
{
    private readonly container: Phaser.GameObjects.Container;
    private readonly drops: DropEntry[] = [];
    private readonly splashes: SplashEntry[] = [];
    private readonly rng: () => number;
    private readonly viewWidth: number;
    private readonly viewHeight: number;

    constructor (scene: Scene, seed: number = 1, viewWidth: number = 1024, viewHeight: number = 768)
    {
        this.rng = mulberry32(seed * 0x9e3779b9);
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;
        this.container = scene.add.container(0, 0);
        this.container.setDepth(53); // above tint (50), below vignette (55)

        this.ensureDropTexture(scene);
        this.ensureSplashTexture(scene);

        for (let i = 0; i < DROP_COUNT; i++)
        {
            const sprite = scene.add.image(0, 0, 'rain-drop');
            sprite.setOrigin(0, 0);
            sprite.setScrollFactor(0);
            sprite.setDepth(53);
            sprite.setBlendMode(BlendModes.NORMAL);
            this.container.add(sprite);
            const entry: DropEntry = {
                sprite,
                vx: 0,
                vy: 0,
                baseX: 0,
                wobblePhase: this.rng() * Math.PI * 2,
                wobbleAmp: 1.4 + this.rng() * 1.6,
                alphaJitter: 0.7 + this.rng() * 0.6,
            };
            this.drops.push(entry);
            this.placeDrop(entry, /*topEdge=*/true);
        }

        for (let i = 0; i < SPLASH_COUNT; i++)
        {
            const sprite = scene.add.image(0, 0, 'rain-splash');
            sprite.setOrigin(0, 0);
            sprite.setScrollFactor(0);
            sprite.setDepth(53);
            sprite.setBlendMode(BlendModes.NORMAL);
            sprite.setAlpha(0);
            this.container.add(sprite);
            const entry: SplashEntry = {
                sprite,
                active: false,
                expiresAt: 0,
                baseX: 0,
                baseY: 0,
                fadeDuration: SPLASH_LIFETIME_MS,
            };
            this.splashes.push(entry);
        }
    }

    /**
     * Step the rain forward by `deltaMs`. We compute drop velocities from
     * stored config so per-frame cost is O(DROP_COUNT + activeSplashes).
     * Drops that leave the bottom of the viewport get recycled to the top.
     */
    update (deltaMs: number, elapsedMs: number): void
    {
        const dt = deltaMs / 1000;
        const w = this.viewWidth;
        const h = this.viewHeight;
        const now = elapsedMs;

        for (const drop of this.drops)
        {
            // Wobble x around the base position so the rain has a slight
            // wavy feel rather than a perfectly straight diagonal.
            const wobble = Math.sin(now * 0.006 + drop.wobblePhase) * drop.wobbleAmp;
            drop.sprite.x = drop.baseX + wobble;
            drop.sprite.y += drop.vy * dt;

            // Recycle when off the bottom.
            if (drop.sprite.y > h + 8)
            {
                this.placeDrop(drop, /*topEdge=*/true);
                continue;
            }

            // Spawn a splash if the drop just crossed the splash band and
            // we're near the bottom-half of the viewport. Probability is
            // low so we don't get a constant splatter.
            const splashBandTop = h * SPLASH_BAND_TOP_PCT;
            if (drop.sprite.y >= splashBandTop
                && drop.sprite.y - drop.vy * dt < splashBandTop
                && this.rng() < 0.18)
            {
                this.spawnSplash(drop.sprite.x, drop.sprite.y + drop.sprite.displayHeight);
            }

            drop.baseX += drop.vx * dt;
            if (drop.baseX > w + 4) drop.baseX -= (w + 8);
            if (drop.baseX < -4) drop.baseX += (w + 8);

            // Keep alpha stable (slight per-drop jitter baked in).
            drop.sprite.setAlpha(DROP_ALPHA * drop.alphaJitter);
        }

        // Splashes fade out then deactivate.
        for (const splash of this.splashes)
        {
            if (!splash.active) continue;
            const remaining = splash.expiresAt - now;
            if (remaining <= 0)
            {
                splash.active = false;
                splash.sprite.setAlpha(0);
                continue;
            }
            const t = remaining / splash.fadeDuration; // 1 -> 0
            splash.sprite.setAlpha(SPLASH_ALPHA * t);
            // Expand slightly as it fades so it reads as a ripple, not a dot.
            const scale = 1.0 + (1.0 - t) * 0.8;
            splash.sprite.setScale(scale, 1);
        }
    }

    destroy (): void
    {
        for (const d of this.drops) d.sprite.destroy();
        for (const s of this.splashes) s.sprite.destroy();
        this.drops.length = 0;
        this.splashes.length = 0;
        this.container.destroy();
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Place a drop at a random x near the top of the viewport (or above it),
     * with a freshly-rolled velocity. The wobble amplitude carries over so
     * each drop has its own personality; only phase and velocity vary.
     */
    private placeDrop (drop: DropEntry, topEdge: boolean): void
    {
        drop.baseX = this.rng() * (this.viewWidth + 16) - 8;
        drop.sprite.x = drop.baseX;
        drop.sprite.y = topEdge
            ? -this.rng() * (this.viewHeight * 0.6)
            : -this.rng() * 8;
        drop.vy = DROP_VY_MIN + this.rng() * (DROP_VY_MAX - DROP_VY_MIN);
        drop.vx = DROP_VX_MIN + this.rng() * (DROP_VX_MAX - DROP_VX_MIN);
        drop.wobblePhase = this.rng() * Math.PI * 2;
        drop.alphaJitter = 0.7 + this.rng() * 0.6;
    }

    /**
     * Show a splash sprite at the given screen position. Picks the first
     * inactive splash from the pool; if all are busy, takes the oldest.
     */
    private spawnSplash (x: number, y: number, now: number = 0): void
    {
        let splash = this.splashes.find((s) => !s.active);
        if (!splash)
        {
            // All busy — pick the one with the soonest expiry.
            splash = this.splashes.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b));
        }
        splash.baseX = x - SPLASH_WIDTH_PX / 2;
        splash.baseY = y;
        splash.sprite.x = splash.baseX;
        splash.sprite.y = splash.baseY;
        splash.sprite.setScale(1, 1);
        splash.sprite.setAlpha(SPLASH_ALPHA);
        splash.active = true;
        splash.expiresAt = now + splash.fadeDuration;
    }

    private ensureDropTexture (scene: Scene): void
    {
        if (scene.textures.exists('rain-drop')) return;
        const c = document.createElement('canvas');
        c.width = DROP_WIDTH_PX;
        c.height = DROP_HEIGHT_PX;
        const ctx = c.getContext('2d')!;
        // Slight vertical fade — top alpha lower than bottom so the streak
        // looks like motion blur rather than a hard rectangle.
        for (let y = 0; y < DROP_HEIGHT_PX; y++)
        {
            const t = (y + 1) / DROP_HEIGHT_PX;
            const a = Math.round(255 * t);
            ctx.fillStyle = `rgba(220, 232, 248, ${(a / 255).toFixed(2)})`;
            ctx.fillRect(0, y, DROP_WIDTH_PX, 1);
        }
        scene.textures.addCanvas('rain-drop', c);
    }

    private ensureSplashTexture (scene: Scene): void
    {
        if (scene.textures.exists('rain-splash')) return;
        const c = document.createElement('canvas');
        c.width = SPLASH_WIDTH_PX;
        c.height = SPLASH_HEIGHT_PX;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#e0eaff';
        ctx.fillRect(0, 0, SPLASH_WIDTH_PX, SPLASH_HEIGHT_PX);
        scene.textures.addCanvas('rain-splash', c);
    }
}