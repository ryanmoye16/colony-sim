import { Scene, Input } from 'phaser';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.5;
const PAN_SPEED = 500;
const SCROLL_DEADZONE = 16;

interface KeyMap
{
    up: Input.Keyboard.Key;
    down: Input.Keyboard.Key;
    left: Input.Keyboard.Key;
    right: Input.Keyboard.Key;
}

export class CameraController
{
    private readonly keys: KeyMap;
    readonly cam: Phaser.Cameras.Scene2D.Camera;
    private paused: boolean = false;
    private cursorInside: boolean = false;

    constructor (scene: Scene, worldWidthPx: number, worldHeightPx: number)
    {
        this.cam = scene.cameras.main;

        this.cam.setBackgroundColor('#0a0a0a');
        this.cam.setBounds(0, 0, worldWidthPx, worldHeightPx);
        this.cam.centerOn(worldWidthPx / 2, worldHeightPx / 2);
        this.cam.setZoom(2);

        const kb = scene.input.keyboard!;
        this.keys = {
            up: kb.addKey('W'),
            down: kb.addKey('S'),
            left: kb.addKey('A'),
            right: kb.addKey('D'),
        };
        kb.addKey('UP');
        kb.addKey('DOWN');
        kb.addKey('LEFT');
        kb.addKey('RIGHT');

        scene.input.on('wheel', (_pointer: Input.Pointer, _over: unknown, _dx: number, dy: number) => {
            const current = this.cam.zoom;
            const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current + (dy > 0 ? -ZOOM_STEP : ZOOM_STEP)));
            this.cam.setZoom(next);
        });

        // Edge-pan should only engage after the player has actually moved
        // the cursor into the game window. Otherwise the cursor's pre-launch
        // position (whatever happened to be on screen when the page loaded)
        // can sit inside the deadzone and the camera starts drifting on its
        // own the moment the game boots. We track the most recent mousemove
        // inside the canvas; until that fires, edge-pan is suppressed even
        // though WASD still works.
        scene.input.on('pointermove', () => { this.cursorInside = true; });
        scene.input.on('pointerout', () => { this.cursorInside = false; });
    }

    setZoom (zoom: number): void
    {
        const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
        this.cam.setZoom(z);
    }

    setPaused (paused: boolean): void
    {
        this.paused = paused;
    }

    update (deltaMs: number): void
    {
        if (this.paused) return;
        const dt = deltaMs / 1000;
        let dx = 0;
        let dy = 0;
        if (this.keys.up.isDown) dy -= 1;
        if (this.keys.down.isDown) dy += 1;
        if (this.keys.left.isDown) dx -= 1;
        if (this.keys.right.isDown) dx += 1;

        const pointer = this.cam.scene.input.activePointer;
        // Only edge-pan after the player has actually moved the cursor into
        // the game (see constructor). WASD still works without that gate.
        if (this.cursorInside)
        {
            if (pointer.x < SCROLL_DEADZONE) dx -= 1;
            if (pointer.x > this.cam.width - SCROLL_DEADZONE) dx += 1;
            if (pointer.y < SCROLL_DEADZONE) dy -= 1;
            if (pointer.y > this.cam.height - SCROLL_DEADZONE) dy += 1;
        }

        if (dx === 0 && dy === 0) return;

        const len = Math.hypot(dx, dy);
        this.cam.scrollX += (dx / len) * PAN_SPEED * dt;
        this.cam.scrollY += (dy / len) * PAN_SPEED * dt;
    }

    destroy (): void
    {
        this.keys.up.destroy();
        this.keys.down.destroy();
        this.keys.left.destroy();
        this.keys.right.destroy();
    }

    get zoom (): number
    {
        return this.cam.zoom;
    }
}
