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

// Tint alpha — how strong the time-of-day color overlays the world. 0.50
// made the screen unmistakable at every hour but washed out the underlying
// tile art at midday (the cream tint pushed everything to a yellow-green
// that lost the forest-vs-grass contrast). 0.34 is the sweet spot — the
// hour reads on screen (dawn vs dusk vs night is clear) while grass stays
// green and forest stays dark.
const TINT_ALPHA = 0.34;

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
        this.tintRect = scene.add.rectangle(0, 0, cam.width, cam.height, 0x1a1f3a, TINT_ALPHA);
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
        this.tintRect.setFillStyle(tintColor, TINT_ALPHA);

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
    }

    destroy (): void
    {
        this.tintRect.destroy();
        this.vignette.destroy();
        for (const leaf of this.leaves) leaf.sprite.destroy();
        this.leaves.length = 0;
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

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
}