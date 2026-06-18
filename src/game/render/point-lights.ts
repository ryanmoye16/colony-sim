// =============================================================================
// PointLights — smooth radial light pools at fixed world positions.
// =============================================================================
// Odd Realm's most distinctive visual signature is point-light sources:
// torches, hearths, campfires emit smooth circular glows that bleed across
// the pixel grid. At night these pools of warm light define the scene; in
// daylight they fade to nearly invisible.
//
// Each light is a single Image sprite using a shared radial-gradient
// texture (white center → transparent edge). We tint per-light to give
// warm (fire) or cool (lantern) hues, and use BlendModes.SCREEN so the
// warm tint blends with whatever's underneath. ADD was tried but in
// Phaser 4's Canvas2D renderer the tint is not applied to the sprite
// pixels before the blend — the gradient renders as pure white, so ADD
// over blue water just produces cyan instead of warm orange. SCREEN with
// an orange tint correctly shifts the hue toward yellow-orange and is
// what Odd Realm's lighting looks like anyway.
//
// Depth 51 — above world/items/settlers/shadows AND above the atmosphere
// tint at depth 50. The tint darkens unlit areas (so night reads as night),
// and lights punch through it. Previously lights sat at depth 49 below the
// tint, which meant the tint's normal-blend darkening visibly dimmed the
// lit pool at night — the campfire looked like a dim smudge instead of the
// warm bloom we want.
// =============================================================================

import type { Scene, Cameras } from 'phaser';
import { BlendModes, TintModes, Math as PhaserMath } from 'phaser';
import { TILE_SIZE } from '../config/game.config';

const { Clamp } = PhaserMath;

const RADIAL_TEXTURE_KEY = 'point-light-gradient';
const RADIAL_TEXTURE_SIZE = 128;

export interface PointLightSpec
{
    tx: number;
    ty: number;
    radius: number;     // px
    color: number;      // 0xRRGGBB
    intensity: number;  // 0..1, peak alpha multiplier
}

interface LightEntry
{
    spec: PointLightSpec;
    sprite: Phaser.GameObjects.Image;
}

export class PointLights
{
    private readonly lights: LightEntry[] = [];
    private hourlyBoost: number = 1.0;

    constructor (scene: Scene, specs: PointLightSpec[])
    {
        this.ensureRadialTexture(scene);

        for (const spec of specs)
        {
            const px = spec.tx * TILE_SIZE + TILE_SIZE / 2;
            const py = spec.ty * TILE_SIZE + TILE_SIZE / 2;
            const sprite = scene.add.image(px, py, RADIAL_TEXTURE_KEY);
            sprite.setOrigin(0.5, 0.5);
            sprite.setDisplaySize(spec.radius * 2, spec.radius * 2);
            sprite.setScrollFactor(1);
            sprite.setDepth(51);
            sprite.setBlendMode(BlendModes.SCREEN);
            sprite.setAlpha(spec.intensity);
            sprite.setTint(spec.color).setTintMode(TintModes.FILL);
            this.lights.push({ spec, sprite });
        }
    }

    /**
     * Set the brightness multiplier from the time-of-day system. Caller passes
     * a value 0..1: 1 at midnight, ~0.25 at midday, smoothly interpolated.
     * We feed each light's base alpha through this multiplier so the same
     * fire that glows brightly at 02:00 dims to a flicker at 14:00.
     */
    setHourlyBoost (boost: number): void
    {
        this.hourlyBoost = Clamp(boost, 0, 1);
        for (const { spec, sprite } of this.lights)
        {
            sprite.setAlpha(spec.intensity * this.hourlyBoost);
        }
    }

    /**
     * Cull lights whose center is far outside the camera viewport — saves
     * draw calls when the player is on the opposite side of the map.
     */
    update (cam: Cameras.Scene2D.Camera): void
    {
        const view = cam.worldView;
        const margin = 96; // px of grace so lights don't pop in/out at the edge
        const minX = view.x - margin;
        const maxX = view.x + view.width + margin;
        const minY = view.y - margin;
        const maxY = view.y + view.height + margin;
        for (const { sprite } of this.lights)
        {
            const visible = sprite.x >= minX && sprite.x <= maxX && sprite.y >= minY && sprite.y <= maxY;
            sprite.setVisible(visible);
        }
    }

    destroy (): void
    {
        for (const { sprite } of this.lights) sprite.destroy();
        this.lights.length = 0;
    }

    /**
     * Build the shared radial-gradient texture. White at the center with
     * alpha 0.55, falling off through 0.42 → 0.18 → 0.04 → 0. The reduced
     * peak (was 1.0) keeps the center from blowing out to pure white —
     * SCREEN with a per-light orange tint then pushes underlying pixels
     * toward warm yellow-orange without saturating them. Pure-white
     * centers read as overexposed flash, not firelight.
     */
    private ensureRadialTexture (scene: Scene): void
    {
        if (scene.textures.exists(RADIAL_TEXTURE_KEY)) return;
        const canvas = document.createElement('canvas');
        canvas.width = RADIAL_TEXTURE_SIZE;
        canvas.height = RADIAL_TEXTURE_SIZE;
        const ctx = canvas.getContext('2d')!;
        const cx = RADIAL_TEXTURE_SIZE / 2;
        const cy = RADIAL_TEXTURE_SIZE / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0.0, 'rgba(255,255,255,0.55)');
        grad.addColorStop(0.25, 'rgba(255,255,255,0.42)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.18)');
        grad.addColorStop(0.85, 'rgba(255,255,255,0.04)');
        grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, RADIAL_TEXTURE_SIZE, RADIAL_TEXTURE_SIZE);
        scene.textures.addCanvas(RADIAL_TEXTURE_KEY, canvas);
    }
}

/**
 * Map a 0..24 hour value to a 0..1 light boost. Lights peak at midnight,
 * fade through dawn to a small flicker by midday, and rise again through
 * dusk to full bloom at 21:00. Smoothstepped so transitions feel natural.
 */
export function lightBoostForHour (hour: number): number
{
    // Three sample points per phase (smoothstep between).
    const phases: Array<[number, number]> = [
        [ 0, 1.0 ],  // midnight
        [ 5, 0.85 ], // pre-dawn
        [ 7, 0.55 ], // dawn
        [10, 0.30 ], // morning
        [14, 0.22 ], // midday
        [17, 0.35 ], // afternoon
        [19, 0.65 ], // dusk
        [21, 0.95 ], // evening
        [24, 1.0 ],  // midnight again
    ];
    if (hour <= phases[0][0] || hour >= phases[phases.length - 1][0]) return phases[0][1];
    for (let i = 0; i < phases.length - 1; i++)
    {
        const [h0, v0] = phases[i];
        const [h1, v1] = phases[i + 1];
        if (hour >= h0 && hour <= h1)
        {
            const t = (hour - h0) / (h1 - h0);
            const smooth = t * t * (3 - 2 * t); // smoothstep
            return v0 + (v1 - v0) * smooth;
        }
    }
    return 1.0;
}