import { Time, seasonName } from '../time/time';
import { SIM_SPEEDS, type SimSpeed } from '../config/game.config';

const ZOOM_LEVELS = [1, 2, 3, 4] as const;

export class HUD
{
    private readonly root: HTMLDivElement;
    private readonly dateEl: HTMLDivElement;
    private readonly speedEl: HTMLDivElement;
    private readonly tickEl: HTMLDivElement;
    private readonly zoomEl: HTMLDivElement;
    private off: Array<() => void> = [];
    private onZoomChange: (zoom: number) => void = () => {};
    private currentZoom: number = 1;

    constructor (private readonly time: Time)
    {
        this.root = document.createElement('div');
        this.root.id = 'hud';

        this.dateEl = document.createElement('div');
        this.dateEl.className = 'hud-date';

        this.tickEl = document.createElement('div');
        this.tickEl.className = 'hud-tick';
        this.tickEl.textContent = 'Tick: 0';

        this.speedEl = document.createElement('div');
        this.speedEl.className = 'hud-speed';

        this.zoomEl = document.createElement('div');
        this.zoomEl.className = 'hud-zoom';

        this.root.appendChild(this.dateEl);
        this.root.appendChild(this.tickEl);
        this.root.appendChild(this.zoomEl);
        this.root.appendChild(this.speedEl);
        document.body.appendChild(this.root);

        this.refreshDate();
        this.refreshSpeed();
        this.refreshZoom();

        this.off.push(this.time.on('time.tick', () => this.refreshTick()));
        this.off.push(this.time.on('time.day', () => this.refreshDate()));
        this.off.push(this.time.on('time.season', () => this.refreshDate()));
        this.off.push(this.time.on('time.year', () => this.refreshDate()));
        this.off.push(this.time.on('time.speed', () => this.refreshSpeed()));

        this.speedEl.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const value = target.dataset.speed;
            if (value === undefined) return;
            this.time.setSpeed(Number(value) as SimSpeed);
        });

        this.zoomEl.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const value = target.dataset.zoom;
            if (value === undefined) return;
            const z = Number(value);
            this.currentZoom = z;
            this.onZoomChange(z);
            this.refreshZoom();
        });
    }

    setZoom (zoom: number): void
    {
        this.currentZoom = zoom;
        this.refreshZoom();
    }

    setZoomChangeCallback (cb: (zoom: number) => void): void
    {
        this.onZoomChange = cb;
    }

    destroy (): void
    {
        this.off.forEach((f) => f());
        this.off = [];
        this.root.remove();
    }

    private refreshDate (): void
    {
        this.dateEl.textContent = `Day ${this.time.day} · ${seasonName(this.time.season)} · Year ${this.time.year}`;
    }

    private refreshTick (): void
    {
        this.tickEl.textContent = `Tick: ${this.time.tick}`;
    }

    private refreshSpeed (): void
    {
        this.speedEl.innerHTML = '';
        for (const speed of SIM_SPEEDS)
        {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = speed === 0 ? 'Pause' : `${speed}x`;
            btn.dataset.speed = String(speed);
            if (speed === this.time.speed) btn.classList.add('active');
            this.speedEl.appendChild(btn);
        }
    }

    private refreshZoom (): void
    {
        this.zoomEl.innerHTML = '<span class="hud-zoom-label">Zoom</span>';
        for (const zoom of ZOOM_LEVELS)
        {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `${zoom}x`;
            btn.dataset.zoom = String(zoom);
            if (zoom === this.currentZoom) btn.classList.add('active');
            this.zoomEl.appendChild(btn);
        }
    }
}
