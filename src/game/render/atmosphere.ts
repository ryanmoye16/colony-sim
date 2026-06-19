// =============================================================================
// Atmosphere — time-of-day tint, edge vignette, and wind-leaf particles.
// =============================================================================
// One full-screen rectangle at depth 50 holds the time-of-day tint. Color is
// lerped between keyframes based on hour-of-day derived from the simulation
// tick. Settlers, items, and path previews (depth 8–15) sit BELOW depth 50,
// so the tint touches them too — that's how the whole frame reads as one
// image instead of assembled sprites.
//
// The vignette is a second full-screen Graphics object at depth 55 that
// darkens the screen edges with four low-alpha rectangles, anchored to the
// camera so it stays put as the player pans.
//
// Wind-leaf particles drift across the screen in screen space — they're not
// world-positioned, so the player always sees motion. We don't animate trees
// directly because trees are baked into the static `world-composite` canvas;
// re-baking them per frame would cost ~256×256 tile redraws.
// =============================================================================

import type { Scene } from 'phaser';
import { BlendModes } from 'phaser';
import { TICKS_PER_DAY } from '../config/game.config';
import { mulberry32 } from '../util/rng';

// -----------------------------------------------------------------------------
// Time-of-day color palette
// -----------------------------------------------------------------------------
// Each entry: hour (0-24), rgb in 0-255.
// The cycle closes at hour 24 back to hour 0 so we can lerp across midnight.

interface TintKey {
    hour: number;
    r: number;
    g: number;
    b: number;
}

// Time-of-day palette. Each entry is the rgb color the screen tints toward
// at that hour. The colors are saturated enough to read clearly at game zoom:
// midday is a warm gold-cream (not white), dusk is a deep rose, and night
// is a cool indigo that turns the world blue. The lerp between these gives
// the world a clear day/night cycle instead of a constant mid-gray wash.
const TINT_KEYS: TintKey[] = [
    { hour:  0, r:  16, g:  22, b:  56 }, // deep night (cool indigo)
    { hour:  5, r:  58, g:  44, b:  96 }, // pre-dawn (purple-blue)
    { hour:  7, r: 220, g: 142, b:  82 }, // dawn (warm peach-orange)
    { hour: 10, r: 250, g: 220, b: 158 }, // morning (warm gold)
    { hour: 14, r: 252, g: 240, b: 192 }, // midday (pale warm cream)
    { hour: 18, r: 198, g:  98, b: 118 }, // dusk (deep rose)
    { hour: 21, r:  72, g:  52, b: 108 }, // evening (purple)
    { hour: 24, r:  16, g:  22, b:  56 }, // back to deep night
];

// Tint alpha — how strong the time-of-day color overlays the world. The
// hour curve is multiplied by this base value. At midday the curve is
// near zero (no tint at all, since the daytime palette is light enough
// to fight the underlying tile art), but at night we lean much harder
// into the cool blue — without strong night the world reads as "tinted
// day" rather than "after dark", and the fireflies have nothing to
// glow against.
const TINT_ALPHA_BASE = 0.36;
const TINT_ALPHA_NIGHT = 0.62;

// -----------------------------------------------------------------------------
// Vignette
// -----------------------------------------------------------------------------
// Vignette darkens the screen edges so the player feels like they're peering
// into a world instead of staring at a flat rectangle. We draw four rectangles
// at the screen edges rather than a radial gradient because the renderer is
// pixel-art (antialias=false, roundPixels=true) and soft gradients would
// stair-step into ugly bands. Pushed past 0.50 so the framing is unmistakable.

const VIGNETTE_ALPHA = 0.58;
const VIGNETTE_BAND_PX = 128;

// -----------------------------------------------------------------------------
// Wind leaves
// -----------------------------------------------------------------------------
// Each particle has its own phase, speed, and vertical bob. Particles wrap
// around the screen edges so the player always sees drift. We spawn 28
// leaves per scene — green/orange/brown mixed roughly evenly so the wind
// reads as "leaves of many kinds" rather than a single-color dust stream.
// About 1 in 6 particles falls diagonally instead of drifting horizontally,
// which gives the impression of leaves dropping from overhead branches.

const LEAF_COUNT = 28;
const LEAF_LIFETIME_MS = 6000;
const LEAF_SPEED_MIN = 8;   // px/sec
const LEAF_SPEED_MAX = 22;  // px/sec
const LEAF_VARIANTS = ['particle-leaf-green', 'particle-leaf-orange', 'particle-leaf-brown'];

// -----------------------------------------------------------------------------
// Stars
// -----------------------------------------------------------------------------
// Tiny white pixels scattered across the screen, only visible at night. In
// a top-down game there's no real "sky" to put them in, so they sit on top
// of the world like the fireflies do. Kept very small (1-2px) and dim so
// they read as distant stars rather than UI markers; the night tint
// already darkens everything, so a modest alpha is enough to be visible.

const STAR_COUNT = 60;
const STAR_PEAK_ALPHA = 0.85;
const STAR_VARIANT_PROB = 0.15;  // chance of a brighter "bright" star

interface StarState {
    sprite: Phaser.GameObjects.Image;
    baseAlpha: number;   // 0.4-1.0, randomized per star
    twinklePhase: number;
    twinklePeriod: number;
}

// -----------------------------------------------------------------------------
// Fireflies
// -----------------------------------------------------------------------------
// Small bright dots that drift in the air over the world. They're world-
// anchored (scrollFactor 1) so they appear as part of the scene, not the
// HUD. Each has its own drift direction, blink period, and a fade-in
// radius around its current position. Visibility is gated by hour-of-day:
// full strength at dusk/night, hidden during the day, with a smooth ramp.

const FIREFLY_COUNT = 50;
const FIREFLY_RADIUS_PX = 30;   // wander radius around home point
const FIREFLY_SPEED_MIN = 1.0;
const FIREFLY_SPEED_MAX = 3.0;
const FIREFLY_BLINK_PERIOD_MIN = 1400;  // ms
const FIREFLY_BLINK_PERIOD_MAX = 3600;
const FIREFLY_PEAK_ALPHA = 0.95;        // max alpha when active and dark
// Alpha is multiplied by this night factor, which is 1.0 at dusk/night and
// drops to 0 at midday. Smoothstep gives a gentle dawn/dusk fade.
const FIREFLY_NIGHT_PEAK = 1.0;
const FIREFLY_DUSK_START = 16;   // hour: visibility begins rising
const FIREFLY_DUSK_FULL = 19;    // hour: fully visible
const FIREFLY_DAWN_FULL = 5;     // hour: still fully visible
const FIREFLY_DAWN_END = 8;      // hour: back to invisible

interface FireflyState {
    sprite: Phaser.GameObjects.Image;
    homeX: number;
    homeY: number;
    vx: number;
    vy: number;
    bobPhase: number;
    bobPeriod: number;  // ms per blink cycle
    blinkPhase: number;
}

function nightFactor (hour: number): number
{
    // Smoothstep between DUSK_START->DUSK_FULL and DAWN_FULL->DAWN_END.
    // Returns 0..1, peaks at FIREFLY_NIGHT_PEAK during the dark hours.
    if (hour >= FIREFLY_DUSK_START && hour <= 24) {
        const t = (hour - FIREFLY_DUSK_START) / (24 - FIREFLY_DUSK_START);
        return FIREFLY_NIGHT_PEAK * t * t * (3 - 2 * t);
    }
    if (hour >= 0 && hour < FIREFLY_DAWN_END) {
        // Two phases: full at DAWN_FULL, fading to 0 at DAWN_END.
        if (hour <= FIREFLY_DAWN_FULL) return FIREFLY_NIGHT_PEAK;
        const t = (hour - FIREFLY_DAWN_FULL) / (FIREFLY_DAWN_END - FIREFLY_DAWN_FULL);
        return FIREFLY_NIGHT_PEAK * (1 - t) * (1 - t) * (3 - 2 * (1 - t));
    }
    if (hour >= FIREFLY_DUSK_FULL) return FIREFLY_NIGHT_PEAK;
    return 0;
}

interface LeafState {
    sprite: Phaser.GameObjects.Image;
    vx: number;
    vy: number;
    bobAmp: number;
    bobFreq: number;
    bobPhase: number;
    baseY: number;
    lifetime: number;
    age: number;
}

export class Atmosphere
{
    private readonly tintRect: Phaser.GameObjects.Rectangle;
    private readonly vignette: Phaser.GameObjects.Graphics;
    private readonly leaves: LeafState[] = [];
    private readonly fireflies: FireflyState[] = [];
    private readonly stars: StarState[] = [];
    private readonly rng: () => number;

    /**
     * Convert a sim tick to a 0..24 hour value. Exposed so other systems
     * (point lights, future time-of-day UI) can stay in sync with the tint
     * cycle without recomputing the keyframe lerp.
     */
    static hourFromTick (tick: number): number
    {
        return ((tick % TICKS_PER_DAY) / TICKS_PER_DAY) * 24;
    }

    constructor (private readonly scene: Scene, seed: number = 1)
    {
        const cam = scene.cameras.main;
        this.rng = mulberry32(seed * 0x9e3779b1);

        // Tint rectangle — fills the screen, anchored to the camera, drawn
        // at depth 50 (above world/items/settlers, below HUD which sits at
        // depth 900+). Setting origin to (0,0) and scrollFactor to 0 means
        // it always covers the visible viewport.
        this.tintRect = scene.add.rectangle(0, 0, cam.width, cam.height, 0x1a1f3a, TINT_ALPHA_BASE);
        this.tintRect.setOrigin(0, 0);
        this.tintRect.setScrollFactor(0);
        this.tintRect.setDepth(50);
        this.tintRect.setBlendMode(BlendModes.NORMAL);

        // Vignette — four dark rectangles at screen edges. Repositioned on
        // resize. Drawn at depth 55 (above tint).
        this.vignette = scene.add.graphics();
        this.vignette.setScrollFactor(0);
        this.vignette.setDepth(55);
        this.vignette.setBlendMode(BlendModes.NORMAL);
        this.drawVignette();

        // Wind leaves. Anchored to screen; respawn when they exit the view.
        // Each leaf picks a color variant on spawn so the wind reads as
        // many-kinds-of-leaves, not a single-color stream.
        for (let i = 0; i < LEAF_COUNT; i++)
        {
            const variant = LEAF_VARIANTS[Math.floor(this.rng() * LEAF_VARIANTS.length)];
            const sprite = scene.add.image(0, 0, variant);
            sprite.setOrigin(0, 0);
            sprite.setScrollFactor(0);
            sprite.setDepth(56);
            sprite.setBlendMode(BlendModes.NORMAL);
            this.leaves.push(this.spawnLeaf(sprite, true));
        }

        // Fireflies. World-anchored small glow points that fade in at dusk
        // and out at dawn. Sprites start hidden — the night factor decides
        // when they become visible. We distribute them across a wide area
        // so the player sees a handful of them in any given viewport.
        this.ensureFireflyTexture(scene);
        for (let i = 0; i < FIREFLY_COUNT; i++)
        {
            const sprite = scene.add.image(0, 0, 'firefly-pixel');
            sprite.setOrigin(0.5, 0.5);
            sprite.setScrollFactor(1);
            sprite.setDepth(57);
            sprite.setBlendMode(BlendModes.ADD);
            sprite.setAlpha(0);
            const ff: FireflyState = {
                sprite,
                homeX: 0, homeY: 0,
                vx: 0, vy: 0,
                bobPhase: 0, bobPeriod: 1, blinkPhase: 0,
            };
            this.fireflies.push(ff);
            this.respawnFirefly(ff);
        }

        // Stars. Screen-anchored (scrollFactor 0) so they stay in place as
        // the player pans the camera. Distributed across the viewport with
        // a slight bias toward the upper half (where the "sky" would be).
        // Visibility scales with the night factor so they fade in at dusk
        // and out at dawn, matching the firefly schedule.
        this.ensureStarTexture(scene);
        for (let i = 0; i < STAR_COUNT; i++)
        {
            const sprite = scene.add.image(0, 0, 'star-pixel');
            sprite.setOrigin(0, 0);
            sprite.setScrollFactor(0);
            sprite.setDepth(51);
            sprite.setBlendMode(BlendModes.ADD);
            // Bias Y toward upper half so stars cluster in the "sky"
            const y = Math.pow(this.rng(), 1.6) * cam.height;
            sprite.x = this.rng() * cam.width;
            sprite.y = y;
            sprite.setAlpha(0);
            const star: StarState = {
                sprite,
                baseAlpha: 0.4 + this.rng() * 0.6,
                twinklePhase: this.rng() * Math.PI * 2,
                twinklePeriod: 1800 + this.rng() * 2200,
            };
            this.stars.push(star);
        }

        scene.scale.on('resize', () => {
            this.tintRect.setSize(cam.width, cam.height);
            this.drawVignette();
        });
    }

    update (tick: number, deltaMs: number): void
    {
        // 1. Update tint color from hour-of-day. setFillStyle is the public
        // Phaser API for updating a Rectangle's color/alpha in place;
        // writing fillColor directly updates the field but doesn't
        // propagate through the renderer, so the screen stays whatever
        // color the rectangle was constructed with.
        const hour = Atmosphere.hourFromTick(tick);
        const { r, g, b } = this.lerpTint(hour);
        const tintColor = (r << 16) | (g << 8) | b;
        // Alpha scales with darkness so the day stays vibrant (low alpha
        // so the warm tint doesn't wash out grass/forest contrast) and
        // night actually reads as night (high alpha so the cool blue
        // dominates the screen). Same alpha at all hours used to make
        // night feel like "tinted day" — now the dark hours get a
        // noticeably heavier wash.
        const darkness = this.hourDarkness(hour);
        const alpha = TINT_ALPHA_BASE + (TINT_ALPHA_NIGHT - TINT_ALPHA_BASE) * darkness;
        this.tintRect.setFillStyle(tintColor, alpha);

        // 2. Update leaves.
        const dt = deltaMs / 1000;
        const cam = this.scene.cameras.main;
        const w = cam.width;
        for (const leaf of this.leaves)
        {
            leaf.age += deltaMs;
            leaf.sprite.x += leaf.vx * dt;
            leaf.sprite.y = leaf.baseY + Math.sin(leaf.age * 0.001 * leaf.bobFreq + leaf.bobPhase) * leaf.bobAmp;

            // Alpha fades in over the first 25% of life, out over the last 25%.
            const t = leaf.age / leaf.lifetime;
            let alpha: number;
            if (t < 0.25) alpha = t / 0.25;
            else if (t > 0.75) alpha = (1 - t) / 0.25;
            else alpha = 1;
            leaf.sprite.setAlpha(alpha * 0.85);

            // Respawn when offscreen or expired.
            const offscreenX = leaf.vx > 0 ? leaf.sprite.x > w + 4 : leaf.sprite.x < -4;
            const expired = leaf.age >= leaf.lifetime;
            if (offscreenX || expired)
            {
                this.respawnLeaf(leaf, false);
            }
        }

        // 3. Update fireflies. Night factor scales the whole system's alpha
        // so they fade in at dusk and out at dawn. Each firefly has its own
        // blink phase on top of that, producing a twinkling field rather
        // than a uniform glow.
        const night = nightFactor(hour);
        for (const ff of this.fireflies)
        {
            // Drift around home, with direction re-rolled when the wander
            // radius is exceeded so the firefly orbits a fixed area
            // instead of sailing off into the void.
            ff.sprite.x += ff.vx * dt;
            ff.sprite.y += ff.vy * dt;
            const dx = ff.sprite.x - ff.homeX;
            const dy = ff.sprite.y - ff.homeY;
            if (dx * dx + dy * dy > FIREFLY_RADIUS_PX * FIREFLY_RADIUS_PX)
            {
                this.respawnFirefly(ff);
                continue;
            }
            // Blink envelope: a sin wave with a moderate peak. Squared
            // for a softer transition than sin^3 — at any moment roughly
            // half the fireflies are in their bright half, so the field
            // reads as a continuous twinkling glow rather than a few
            // bright dots on a dark background. Per-firefly phase stops
            // them from beating in unison.
            const blinkT = (tick + ff.blinkPhase) / ff.bobPeriod;
            const blink = Math.max(0, Math.sin(blinkT * Math.PI * 2));
            const blinkSoft = blink * blink; // soften
            ff.sprite.setAlpha(night * FIREFLY_PEAK_ALPHA * blinkSoft);
        }

        // Stars: fade in at night with the same night factor as fireflies.
        // Each star has its own per-star twinkle envelope (subtle, not a
        // hard blink) so the field reads as a sky full of slowly-varying
        // points rather than a static grid.
        for (const star of this.stars)
        {
            const twinkleT = (tick + star.twinklePhase * 100) / star.twinklePeriod;
            const twinkle = 0.6 + 0.4 * Math.sin(twinkleT * Math.PI * 2);
            star.sprite.setAlpha(night * STAR_PEAK_ALPHA * star.baseAlpha * twinkle);
        }
    }

    destroy (): void
    {
        this.tintRect.destroy();
        this.vignette.destroy();
        for (const leaf of this.leaves) leaf.sprite.destroy();
        this.leaves.length = 0;
        for (const ff of this.fireflies) ff.sprite.destroy();
        this.fireflies.length = 0;
        for (const star of this.stars) star.sprite.destroy();
        this.stars.length = 0;
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    // Returns 0..1, where 0 is full daylight and 1 is deepest night. Used
    // to scale the tint alpha so the day keeps grass/forest contrast and
    // the night actually looks like night.
    private hourDarkness (hour: number): number
    {
        // Sample the luma of the current tint keyframe color as the
        // darkness metric — black/blue is dark, gold/cream is light. This
        // automatically tracks whatever palette we set without needing a
        // separate hour schedule.
        const { r, g, b } = this.lerpTint(hour);
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return Math.max(0, Math.min(1, 1 - luma));
    }

    private lerpTint (hour: number): { r: number; g: number; b: number }
    {
        // Find the two keyframes we're between.
        let lo = TINT_KEYS[0];
        let hi = TINT_KEYS[TINT_KEYS.length - 1];
        for (let i = 0; i < TINT_KEYS.length - 1; i++)
        {
            if (hour >= TINT_KEYS[i].hour && hour < TINT_KEYS[i + 1].hour)
            {
                lo = TINT_KEYS[i];
                hi = TINT_KEYS[i + 1];
                break;
            }
        }
        const span = hi.hour - lo.hour;
        const t = span === 0 ? 0 : (hour - lo.hour) / span;
        return {
            r: Math.round(lo.r + (hi.r - lo.r) * t),
            g: Math.round(lo.g + (hi.g - lo.g) * t),
            b: Math.round(lo.b + (hi.b - lo.b) * t),
        };
    }

    private drawVignette (): void
    {
        const cam = this.scene.cameras.main;
        const w = cam.width;
        const h = cam.height;
        this.vignette.clear();
        const color = 0x0a0810;
        // Top
        this.vignette.fillStyle(color, VIGNETTE_ALPHA);
        this.vignette.fillRect(0, 0, w, VIGNETTE_BAND_PX);
        // Bottom
        this.vignette.fillRect(0, h - VIGNETTE_BAND_PX, w, VIGNETTE_BAND_PX);
        // Left
        this.vignette.fillRect(0, 0, VIGNETTE_BAND_PX, h);
        // Right
        this.vignette.fillRect(w - VIGNETTE_BAND_PX, 0, VIGNETTE_BAND_PX, h);
    }

    private spawnLeaf (sprite: Phaser.GameObjects.Image, initial: boolean): LeafState
    {
        const state = this.makeLeafState(sprite, initial);
        sprite.x = state.sprite.x;
        sprite.y = state.sprite.y;
        sprite.setAlpha(0);
        return state;
    }

    private respawnLeaf (leaf: LeafState, _initial: boolean): void
    {
        const cam = this.scene.cameras.main;
        const h = cam.height;
        // Move it to just off the left edge so it drifts into view.
        leaf.vx = LEAF_SPEED_MIN + this.rng() * (LEAF_SPEED_MAX - LEAF_SPEED_MIN);
        // ~1 in 6 leaves falls diagonally (dropping from above) instead of
        // drifting purely horizontally. The diagonal ones get a small vy
        // and a slightly slower vx so they read as "falling" rather than
        // "moving sideways fast".
        if (this.rng() < 0.18)
        {
            leaf.vx *= 0.65;
            leaf.vy = 6 + this.rng() * 10;
        }
        else
        {
            leaf.vy = 0;
        }
        leaf.baseY = 8 + this.rng() * (h - 16);
        leaf.bobAmp = 4 + this.rng() * 8;
        leaf.bobFreq = 1.5 + this.rng() * 2.5;
        leaf.bobPhase = this.rng() * Math.PI * 2;
        leaf.age = 0;
        leaf.lifetime = LEAF_LIFETIME_MS * (0.8 + this.rng() * 0.4);
        // Pick a fresh variant so each leaf can be a different color over time.
        const variant = LEAF_VARIANTS[Math.floor(this.rng() * LEAF_VARIANTS.length)];
        leaf.sprite.setTexture(variant);
        leaf.sprite.x = -8;
        leaf.sprite.y = leaf.baseY;
    }

    private makeLeafState (sprite: Phaser.GameObjects.Image, initial: boolean): LeafState
    {
        const cam = this.scene.cameras.main;
        const w = cam.width;
        const h = cam.height;
        const vx = LEAF_SPEED_MIN + this.rng() * (LEAF_SPEED_MAX - LEAF_SPEED_MIN);
        const vy = this.rng() < 0.18 ? 6 + this.rng() * 10 : 0;
        const baseY = 8 + this.rng() * (h - 16);
        sprite.x = initial ? this.rng() * w : -8;
        sprite.y = baseY;
        return {
            sprite,
            vx: vy > 0 ? vx * 0.65 : vx,
            vy,
            bobAmp: 4 + this.rng() * 8,
            bobFreq: 1.5 + this.rng() * 2.5,
            bobPhase: this.rng() * Math.PI * 2,
            baseY,
            lifetime: LEAF_LIFETIME_MS * (0.8 + this.rng() * 0.4),
            age: initial ? this.rng() * LEAF_LIFETIME_MS * 0.5 : 0,
        };
    }

    // Place a firefly at a random world-space position with a random drift
    // direction. The wander radius is enforced each frame, so the firefly
    // stays near its home point — orbit behavior, not a single flyaway
    // trajectory. We distribute home points across a wide area so that
    // wherever the player pans the camera, a few fireflies are visible.
    private respawnFirefly (ff: FireflyState): void
    {
        // Spawn within a generous world-space area centered on (128,128)
        // with ~100 tile radius. The exact extent doesn't matter — the
        // point is to spread fireflies across a wide area so the camera
        // always frames a handful of them.
        ff.homeX = 128 * 16 + (this.rng() - 0.5) * 200 * 16;
        ff.homeY = 128 * 16 + (this.rng() - 0.5) * 200 * 16;
        // Random drift direction at low speed
        const angle = this.rng() * Math.PI * 2;
        const speed = FIREFLY_SPEED_MIN + this.rng() * (FIREFLY_SPEED_MAX - FIREFLY_SPEED_MIN);
        ff.vx = Math.cos(angle) * speed;
        ff.vy = Math.sin(angle) * speed;
        ff.bobPeriod = FIREFLY_BLINK_PERIOD_MIN + this.rng() * (FIREFLY_BLINK_PERIOD_MAX - FIREFLY_BLINK_PERIOD_MIN);
        ff.blinkPhase = this.rng() * ff.bobPeriod;
        ff.bobPhase = this.rng() * Math.PI * 2;
        ff.sprite.x = ff.homeX;
        ff.sprite.y = ff.homeY;
    }

    // Shared 2x2 yellow-green pixel for fireflies. Stored once so all
    // fireflies share a single GL texture.
    private ensureFireflyTexture (scene: Scene): void
    {
        if (scene.textures.exists('firefly-pixel')) return;
        const c = document.createElement('canvas');
        c.width = 3;
        c.height = 3;
        const ctx = c.getContext('2d')!;
        // Yellow-green, slightly warm so it reads as warm light against
        // the cool night tint. Bright enough to glow under ADD blend.
        ctx.fillStyle = '#dfff8a';
        ctx.fillRect(0, 0, 3, 3);
        scene.textures.addCanvas('firefly-pixel', c);
    }

    // Shared 1x1 white pixel for stars. Tiny because we want them to
    // read as distant points; the night tint does most of the work and
    // these are just the highlights.
    private ensureStarTexture (scene: Scene): void
    {
        if (scene.textures.exists('star-pixel')) return;
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        scene.textures.addCanvas('star-pixel', c);
    }
}