import type { ECSWorld } from '../ecs/world';
import type { World } from '../world/world';
import type { PositionData, RenderData } from '../ecs/components';
import { Position, Render } from '../ecs/components';
import { TileType } from '../world/tile';
import { TILE_SIZE } from '../config/game.config';

const MINIMAP_SIZE = 180;

const TILE_COLORS: Record<number, string> = {
    [TileType.Empty]: '#0a0a0e',
    [TileType.Dirt]: '#6a4a2a',
    [TileType.Grass]: '#5a9b3a',
    [TileType.Stone]: '#808080',
    [TileType.Water]: '#2f5b8a',
    [TileType.Sand]: '#e8c878',
    [TileType.Tree]: '#1a3a1a',
    [TileType.Wall]: '#444444',
    [TileType.Floor]: '#a08060',
    [TileType.TilledSoil]: '#5a3018',
    [TileType.Snow]: '#f0f0f8',
};

const SHIRT_COLORS: Record<string, string> = {
    'settler-red': '#cc4040',
    'settler-blue': '#4060cc',
    'settler-green': '#40a060',
    'settler-orange': '#cc8840',
};

export class MiniMap
{
    private readonly root: HTMLDivElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly terrainCanvas: HTMLCanvasElement;
    private readonly terrainCtx: CanvasRenderingContext2D;
    private terrainDirty = true;
    private off: Array<() => void> = [];

    constructor (
        private readonly world: World,
        private readonly ecs: ECSWorld,
        private readonly camScrollX: () => number,
        private readonly camScrollY: () => number,
        private readonly camZoom: () => number,
        private readonly camWidth: () => number,
        private readonly camHeight: () => number,
    )
    {
        this.root = document.createElement('div');
        this.root.id = 'minimap';

        this.canvas = document.createElement('canvas');
        this.canvas.width = MINIMAP_SIZE;
        this.canvas.height = MINIMAP_SIZE;
        this.ctx = this.canvas.getContext('2d')!;

        this.terrainCanvas = document.createElement('canvas');
        this.terrainCanvas.width = MINIMAP_SIZE;
        this.terrainCanvas.height = MINIMAP_SIZE;
        this.terrainCtx = this.terrainCanvas.getContext('2d')!;

        this.root.appendChild(this.canvas);
        document.body.appendChild(this.root);

        this.off.push(world.events.on('tile.changed', () => { this.terrainDirty = true; }));
    }

    refresh (): void
    {
        if (this.terrainDirty)
        {
            this.drawTerrain();
            this.terrainDirty = false;
        }
        this.drawOverlay();
    }

    destroy (): void
    {
        this.off.forEach((f) => f());
        this.off = [];
        this.root.remove();
    }

    private drawTerrain (): void
    {
        const w = this.world.width;
        const h = this.world.height;
        const scaleX = MINIMAP_SIZE / w;
        const scaleY = MINIMAP_SIZE / h;
        this.terrainCtx.fillStyle = '#000';
        this.terrainCtx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
        const img = this.terrainCtx.getImageData(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
        const data = img.data;
        for (let py = 0; py < MINIMAP_SIZE; py++)
        {
            const ty = Math.floor(py / scaleY);
            for (let px = 0; px < MINIMAP_SIZE; px++)
            {
                const tx = Math.floor(px / scaleX);
                const t = this.world.getTile(tx, ty);
                const color = TILE_COLORS[t] ?? '#000';
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                const i = (py * MINIMAP_SIZE + px) * 4;
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
                data[i + 3] = 255;
            }
        }
        this.terrainCtx.putImageData(img, 0, 0);
    }

    private drawOverlay (): void
    {
        this.ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
        this.ctx.drawImage(this.terrainCanvas, 0, 0);

        const w = this.world.width;
        const h = this.world.height;
        const scaleX = MINIMAP_SIZE / w;
        const scaleY = MINIMAP_SIZE / h;

        this.ecs.forEach<PositionData>(Position, (entity, pos) => {
            const render = this.ecs.getComponent<RenderData>(entity, Render);
            const key = render?.textureKey ?? '';
            const color = SHIRT_COLORS[key] ?? '#ffffff';
            this.ctx.fillStyle = color;
            this.ctx.fillRect(pos.tx * scaleX - 1, pos.ty * scaleY - 1, 3, 3);
        });

        const sx = (this.camScrollX() / TILE_SIZE) * scaleX;
        const sy = (this.camScrollY() / TILE_SIZE) * scaleY;
        const vw = (this.camWidth() / this.camZoom() / TILE_SIZE) * scaleX;
        const vh = (this.camHeight() / this.camZoom() / TILE_SIZE) * scaleY;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(sx, sy, vw, vh);
    }
}
