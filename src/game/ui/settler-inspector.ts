import type { Scene } from 'phaser';
import type { ECSWorld } from '../ecs/world';
import { Position, Render, Needs, AI, Inventory, Life, Relationship } from '../ecs/components';
import type { RenderData, NeedsData, AIData, InventoryData, LifeData, RelationshipData } from '../ecs/components';
import { LIFESPAN_TICKS, getAgeStage } from '../config/game.config';

interface StateVisualizer
{
    dot: HTMLDivElement;
    label: HTMLSpanElement;
}

export class SettlerInspector
{
    private readonly root: HTMLDivElement;
    private readonly portraitCanvas: HTMLCanvasElement;
    private readonly portraitCtx: CanvasRenderingContext2D;
    private readonly headerEl: HTMLDivElement;
    private readonly stageEl: HTMLDivElement;
    private readonly stateRow: HTMLDivElement;
    private readonly stateVis: StateVisualizer;
    private readonly jobEl: HTMLDivElement;
    private readonly hungerBar: HTMLDivElement;
    private readonly hungerVal: HTMLSpanElement;
    private readonly hungerWarn: HTMLSpanElement;
    private readonly socialBar: HTMLDivElement;
    private readonly socialVal: HTMLSpanElement;
    private readonly socialWarn: HTMLSpanElement;
    private readonly carryingEl: HTMLDivElement;
    private readonly relationsEl: HTMLDivElement;
    private entityId: number | null = null;
    private off: Array<() => void> = [];

    constructor (private readonly ecs: ECSWorld, private readonly scene: Scene)
    {
        this.root = document.createElement('div');
        this.root.id = 'settler-inspector';
        this.root.style.display = 'none';

        this.portraitCanvas = document.createElement('canvas');
        this.portraitCanvas.className = 'inspector-portrait';
        this.portraitCanvas.width = 32;
        this.portraitCanvas.height = 32;
        this.portraitCtx = this.portraitCanvas.getContext('2d')!;
        this.portraitCtx.imageSmoothingEnabled = false;

        this.headerEl = document.createElement('div');
        this.headerEl.className = 'inspector-header';
        this.headerEl.appendChild(this.portraitCanvas);

        this.stageEl = document.createElement('div');
        this.stageEl.className = 'inspector-stage';

        this.stateRow = document.createElement('div');
        this.stateRow.className = 'inspector-state';

        const dot = document.createElement('div');
        dot.className = 'inspector-dot';
        const label = document.createElement('span');
        label.className = 'inspector-state-label';
        this.stateRow.appendChild(dot);
        this.stateRow.appendChild(label);
        this.stateVis = { dot, label };

        this.jobEl = document.createElement('div');
        this.jobEl.className = 'inspector-job';

        const hungerRow = document.createElement('div');
        hungerRow.className = 'inspector-bar-row';
        const hungerLabel = document.createElement('span');
        hungerLabel.className = 'inspector-bar-label';
        hungerLabel.textContent = 'Hunger';
        this.hungerBar = document.createElement('div');
        this.hungerBar.className = 'inspector-bar inspector-bar-hunger';
        const hungerFill = document.createElement('div');
        hungerFill.className = 'inspector-bar-fill';
        this.hungerBar.appendChild(hungerFill);
        this.hungerVal = document.createElement('span');
        this.hungerVal.className = 'inspector-bar-value';
        this.hungerWarn = document.createElement('span');
        this.hungerWarn.className = 'inspector-warn';
        this.hungerWarn.textContent = '!';
        this.hungerWarn.style.display = 'none';
        hungerRow.appendChild(hungerLabel);
        hungerRow.appendChild(this.hungerBar);
        hungerRow.appendChild(this.hungerVal);
        hungerRow.appendChild(this.hungerWarn);

        const socialRow = document.createElement('div');
        socialRow.className = 'inspector-bar-row';
        const socialLabel = document.createElement('span');
        socialLabel.className = 'inspector-bar-label';
        socialLabel.textContent = 'Social';
        this.socialBar = document.createElement('div');
        this.socialBar.className = 'inspector-bar inspector-bar-social';
        const socialFill = document.createElement('div');
        socialFill.className = 'inspector-bar-fill';
        this.socialBar.appendChild(socialFill);
        this.socialVal = document.createElement('span');
        this.socialVal.className = 'inspector-bar-value';
        this.socialWarn = document.createElement('span');
        this.socialWarn.className = 'inspector-warn';
        this.socialWarn.textContent = '!';
        this.socialWarn.style.display = 'none';
        socialRow.appendChild(socialLabel);
        socialRow.appendChild(this.socialBar);
        socialRow.appendChild(this.socialVal);
        socialRow.appendChild(this.socialWarn);

        this.carryingEl = document.createElement('div');
        this.carryingEl.className = 'inspector-carrying';

        this.relationsEl = document.createElement('div');
        this.relationsEl.className = 'inspector-relations';

        this.root.appendChild(this.headerEl);
        this.root.appendChild(this.stageEl);
        this.root.appendChild(this.stateRow);
        this.root.appendChild(this.jobEl);
        this.root.appendChild(hungerRow);
        this.root.appendChild(socialRow);
        this.root.appendChild(this.carryingEl);
        this.root.appendChild(this.relationsEl);

        document.body.appendChild(this.root);
    }

    show (entityId: number): void
    {
        if (this.entityId === entityId) return;
        this.entityId = entityId;
        this.root.style.display = 'flex';
    }

    hide (): void
    {
        this.entityId = null;
        this.root.style.display = 'none';
    }

    refresh (tick: number): void
    {
        if (this.entityId === null) return;
        const entity = this.entityId;
        if (!this.ecs.hasComponent(entity, Position))
        {
            this.hide();
            return;
        }
        const render = this.ecs.getComponent<RenderData>(entity, Render);
        const life = this.ecs.getComponent<LifeData>(entity, Life);
        const needs = this.ecs.getComponent<NeedsData>(entity, Needs);
        const ai = this.ecs.getComponent<AIData>(entity, AI);
        const inv = this.ecs.getComponent<InventoryData>(entity, Inventory);
        const rel = this.ecs.getComponent<RelationshipData>(entity, Relationship);

        const id = entity;
        const gen = life?.generation ?? 1;
        const stage = life ? getAgeStage(life.birthTick, tick, LIFESPAN_TICKS) : 'adult';
        const ageTicks = life ? Math.max(0, tick - life.birthTick) : 0;

        const moving = !!(ai?.path && ai.pathIndex < ai.path.length && ai.state !== 'wandering');
        const phase = Math.floor(tick / 12) % 2;
        const baseKey = render?.textureKey ?? 'settler-red';
        const portraitKey = moving
            ? (phase === 0 ? `${baseKey}-walk-a` : `${baseKey}-walk-b`)
            : baseKey;
        this.drawPortrait(portraitKey);

        this.headerEl.innerHTML = '';
        this.headerEl.appendChild(this.portraitCanvas);
        const info = document.createElement('div');
        info.className = 'inspector-info';
        info.innerHTML = `<span class="inspector-id">#${id}</span><span class="inspector-gen">Gen ${gen}</span><span class="inspector-shirt" style="background:${this.shirtColor(baseKey)}"></span>`;
        this.headerEl.appendChild(info);
        this.stageEl.textContent = `${stage}  ·  age ${this.formatAge(ageTicks)}`;

        const state = ai?.state ?? 'wandering';
        const stateColor = this.stateColor(state);
        this.stateVis.dot.style.background = stateColor;
        this.stateVis.label.textContent = this.stateLabel(state);

        const jobLine = this.jobDescription(ai);
        this.jobEl.textContent = jobLine;
        this.jobEl.style.display = jobLine ? 'block' : 'none';

        const hungerRaw = needs?.hunger ?? 0;
        const socialRaw = needs?.social ?? 0;
        const hunger = Math.max(0, Math.min(100, hungerRaw * 100));
        const social = Math.max(0, Math.min(100, socialRaw * 100));
        const hungerFill = this.hungerBar.firstElementChild as HTMLDivElement;
        const socialFill = this.socialBar.firstElementChild as HTMLDivElement;
        hungerFill.style.width = `${hunger}%`;
        hungerFill.style.background = this.barColor(hunger, '#cc4040', '#ffaa44', '#40cc60');
        this.hungerVal.textContent = `${hunger.toFixed(0)}`;
        this.hungerWarn.style.display = hunger < 20 ? 'inline' : 'none';
        socialFill.style.width = `${social}%`;
        socialFill.style.background = this.barColor(social, '#4060cc', '#66aaff', '#80c0ff');
        this.socialVal.textContent = `${social.toFixed(0)}`;
        this.socialWarn.style.display = social < 20 ? 'inline' : 'none';

        const carry = inv?.carriedType;
        this.carryingEl.textContent = carry ? `Carrying: ${carry}` : '';
        this.carryingEl.style.display = carry ? 'block' : 'none';

        this.relationsEl.innerHTML = '';
        if (rel?.partner !== null && rel?.partner !== undefined)
        {
            const line = document.createElement('div');
            line.textContent = `Partner: #${rel.partner}`;
            this.relationsEl.appendChild(line);
        }
        if (life?.parents)
        {
            const line = document.createElement('div');
            line.textContent = `Parents: ${life.parents.map((p: number) => `#${p}`).join(', ')}`;
            this.relationsEl.appendChild(line);
        }
        this.relationsEl.style.display = this.relationsEl.children.length > 0 ? 'block' : 'none';
    }

    destroy (): void
    {
        this.off.forEach((f) => f());
        this.off = [];
        this.root.remove();
    }

    private drawPortrait (textureKey: string): void
    {
        const tex = this.scene.textures.get(textureKey) as Phaser.Textures.CanvasTexture | null;
        const canvas = tex?.getCanvas();
        if (!canvas) return;
        this.portraitCtx.clearRect(0, 0, 32, 32);
        this.portraitCtx.drawImage(canvas, 0, 0, 16, 16, 0, 0, 32, 32);
    }

    private formatAge (ticks: number): string
    {
        const days = Math.floor(ticks / 60);
        if (days < 60) return `${days}d`;
        const years = Math.floor(days / 60);
        return `${years}y ${days % 60}d`;
    }

    private shirtColor (key: string): string
    {
        if (key.includes('red')) return '#cc4040';
        if (key.includes('blue')) return '#4060cc';
        if (key.includes('green')) return '#40a060';
        if (key.includes('orange')) return '#cc8840';
        return '#888';
    }

    private stateColor (state: string): string
    {
        if (state === 'seeking_food') return '#66ff66';
        if (state === 'seeking_social') return '#66aaff';
        if (state === 'working') return '#ffaa44';
        return '#cccccc';
    }

    private stateLabel (state: string): string
    {
        if (state === 'seeking_food') return 'Hungry';
        if (state === 'seeking_social') return 'Lonely';
        if (state === 'working') return 'Working';
        return 'Idle';
    }

    private jobDescription (ai: AIData | undefined): string
    {
        if (!ai?.jobId) return '';
        if (ai.state === 'working')
        {
            return `Job #${ai.jobId} · phase ${ai.jobPhase ?? '?'}`;
        }
        return '';
    }

    private barColor (value: number, low: string, mid: string, high: string): string
    {
        if (value < 40) return low;
        if (value < 70) return mid;
        return high;
    }
}
