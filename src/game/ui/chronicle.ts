import { Chronicle, ChronicleEvent, ChronicleEventType } from '../chronicle/log';
import { TICKS_PER_DAY, DAYS_PER_YEAR, DAYS_PER_SEASON } from '../config/game.config';
import { seasonName } from '../time/time';

type Filter = ChronicleEventType | 'all';

const FILTERS: ReadonlyArray<{ label: string; value: Filter }> = [
    { label: 'All', value: 'all' },
    { label: 'Births', value: 'birth' },
    { label: 'Deaths', value: 'death' },
    { label: 'Marriages', value: 'marriage' },
];

export class ChronicleUI
{
    private readonly root: HTMLDivElement;
    private readonly eventList: HTMLDivElement;
    private readonly filterButtons: Map<Filter, HTMLButtonElement> = new Map();
    private readonly escHandler: (e: KeyboardEvent) => void;
    private isOpen: boolean = false;
    private activeFilter: Filter = 'all';

    constructor (private readonly chronicle: Chronicle)
    {
        this.root = document.createElement('div');
        this.root.id = 'chronicle-panel';

        const header = document.createElement('div');
        header.className = 'chronicle-header';
        const title = document.createElement('span');
        title.textContent = 'Chronicle';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.close());
        header.appendChild(closeBtn);
        this.root.appendChild(header);

        const filtersEl = document.createElement('div');
        filtersEl.className = 'chronicle-filters';
        for (const opt of FILTERS)
        {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = opt.label;
            btn.className = 'chronicle-filter' + (this.activeFilter === opt.value ? ' active' : '');
            btn.addEventListener('click', () => this.setFilter(opt.value));
            filtersEl.appendChild(btn);
            this.filterButtons.set(opt.value, btn);
        }
        this.root.appendChild(filtersEl);

        this.eventList = document.createElement('div');
        this.eventList.className = 'chronicle-events';
        this.root.appendChild(this.eventList);

        this.root.style.display = 'none';
        document.body.appendChild(this.root);

        this.escHandler = (e) => {
            if (e.key === 'Escape' && this.isOpen)
            {
                e.preventDefault();
                this.close();
            }
        };
        document.addEventListener('keydown', this.escHandler);
    }

    toggle (): void
    {
        if (this.isOpen) this.close();
        else this.open();
    }

    open (): void
    {
        this.isOpen = true;
        this.root.style.display = 'flex';
        this.refresh();
    }

    close (): void
    {
        this.isOpen = false;
        this.root.style.display = 'none';
    }

    refresh (): void
    {
        if (!this.isOpen) return;
        this.eventList.innerHTML = '';

        const events = [...this.chronicle.getAll()].sort((a, b) => b.tick - a.tick);
        const filtered = this.activeFilter === 'all'
            ? events
            : events.filter((e) => e.type === this.activeFilter);

        if (filtered.length === 0)
        {
            const empty = document.createElement('div');
            empty.className = 'chronicle-empty';
            empty.textContent = this.activeFilter === 'all' ? 'No events yet.' : 'No events of this type.';
            this.eventList.appendChild(empty);
            return;
        }

        for (const event of filtered)
        {
            this.eventList.appendChild(this.renderEvent(event));
        }
    }

    destroy (): void
    {
        this.close();
        document.removeEventListener('keydown', this.escHandler);
        this.root.remove();
    }

    private setFilter (filter: Filter): void
    {
        this.activeFilter = filter;
        for (const [value, btn] of this.filterButtons)
        {
            btn.classList.toggle('active', value === filter);
        }
        this.refresh();
    }

    private renderEvent (event: ChronicleEvent): HTMLDivElement
    {
        const el = document.createElement('div');
        el.className = 'chronicle-event';

        const date = document.createElement('span');
        date.className = 'chronicle-event-date';
        date.textContent = this.formatDate(event.tick);
        el.appendChild(date);

        const type = document.createElement('span');
        const typeClass = event.type.split('.')[0].split('-')[0];
        type.className = `chronicle-event-type chronicle-type-${typeClass}`;
        type.textContent = event.type;
        el.appendChild(type);

        const msg = document.createElement('span');
        msg.className = 'chronicle-event-message';
        msg.textContent = event.message;
        el.appendChild(msg);

        return el;
    }

    private formatDate (tick: number): string
    {
        const totalDays = Math.floor(tick / TICKS_PER_DAY);
        const year = Math.floor(totalDays / DAYS_PER_YEAR) + 1;
        const dayOfYear = totalDays % DAYS_PER_YEAR;
        const season = Math.floor(dayOfYear / DAYS_PER_SEASON);
        const day = dayOfYear + 1;
        return `Y${year} ${seasonName(season).slice(0, 3)} D${day}`;
    }
}
