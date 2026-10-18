// 微观文明沙盘的界面：底部控制台（播放、倍速、时间轴回溯、干预工具）、左侧事件流、实时数据卡片与悬停提示。

import { h, clear, fitCanvas, COLORS, MONO_FONT } from './dom';
import { chevron, isOpen, onFoldAll, remember } from './fold';
import type { SbEvent } from '../sim/sandbox';

export type Tool = 'look' | 'tech' | 'peace' | 'restore' | 'plague' | 'drought';

export const TOOLS: { id: Tool; label: string; tip: string; kind: 'good' | 'bad' | '' }[] = [
  { id: 'look', label: '观察', tip: '点击聚落查看它的人口、时代与历史', kind: '' },
  { id: 'tech', label: '传授技术', tip: '点击聚落：所属政体的生产力跃升', kind: 'good' },
  { id: 'peace', label: '调停', tip: '点击交战地区：促成停战', kind: 'good' },
  { id: 'restore', label: '修复生态', tip: '点击地区：修复退化的土地', kind: 'good' },
  { id: 'plague', label: '瘟疫', tip: '点击聚落：投下一场瘟疫，看它沿商路传播', kind: 'bad' },
  { id: 'drought', label: '大旱', tip: '点击地区：降下一场大旱', kind: 'bad' },
];

export interface DockHandlers {
  onPlay: () => void;
  onSpeed: (s: number) => void;
  onScrub: (t: number) => void;
  onTool: (t: Tool) => void;
}

export const SPEEDS = [1, 2, 4, 8];

/** 底部控制台。 */
export class SandboxDock {
  readonly el: HTMLElement;
  private playBtn: HTMLButtonElement;
  private speedBtns: HTMLButtonElement[] = [];
  private toolBtns = new Map<Tool, HTMLButtonElement>();
  private yearEl: HTMLElement;
  private eraEl: HTMLElement;
  private range: HTMLInputElement;
  private rangeLbl: HTMLElement;
  private controls: HTMLElement;
  private toolRow: HTMLElement;
  private lockNote: HTMLElement;
  private scrubbing = false;

  constructor(on: DockHandlers) {
    this.playBtn = h('button', { type: 'button', class: 'sb-play', 'aria-label': '播放或暂停', onclick: () => on.onPlay() }, '▶');
    const speeds = h('div', { class: 'sb-speed', role: 'group', 'aria-label': '倍速' });
    SPEEDS.forEach((s) => {
      const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => on.onSpeed(s) }, `${s}×`);
      this.speedBtns.push(b);
      speeds.append(b);
    });
    this.yearEl = h('b', { class: 'mono' }, '第 1 年');
    this.eraEl = h('span', {}, '农耕时代');
    this.range = h('input', { type: 'range', min: 0, max: 1, step: 1, value: 0, 'aria-label': '时间轴：拖回过去，改变参量后从那里重新推演' }) as HTMLInputElement;
    this.rangeLbl = h('span', { class: 'sb-rlbl' }, '拖动时间轴可回溯');
    this.range.addEventListener('input', () => {
      this.scrubbing = true;
      this.rangeLbl.textContent = `回溯到第 ${this.range.value} 步`;
    });
    this.range.addEventListener('change', () => {
      this.scrubbing = false;
      on.onScrub(Number(this.range.value));
    });
    this.controls = h('div', { class: 'sb-row' },
      this.playBtn,
      speeds,
      h('div', { class: 'sb-when' }, this.yearEl, this.eraEl),
      h('div', { class: 'sb-time' }, this.range, this.rangeLbl),
    );
    this.toolRow = h('div', { class: 'sb-tools', role: 'group', 'aria-label': '观测者干预' });
    TOOLS.forEach((t) => {
      const b = h('button', { type: 'button', class: `sb-tool ${t.kind}`, title: t.tip, 'aria-pressed': t.id === 'look' ? 'true' : 'false', onclick: () => on.onTool(t.id) }, t.label);
      this.toolBtns.set(t.id, b);
      this.toolRow.append(b);
    });
    this.lockNote = h('span', { class: 'sb-lock', hidden: true }, '干预与回溯需要文明之钥');
    this.el = h('div', { class: 'sb-dock', hidden: true }, this.controls, h('div', { class: 'sb-row' }, this.toolRow, this.lockNote));
  }

  setPlaying(p: boolean): void {
    this.playBtn.textContent = p ? '❚❚' : '▶';
    this.playBtn.classList.toggle('on', p);
  }

  setSpeed(s: number): void {
    this.speedBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(SPEEDS[i] === s)));
  }

  setTool(t: Tool): void {
    this.toolBtns.forEach((b, id) => b.setAttribute('aria-pressed', String(id === t)));
  }

  setWhen(year: number, era: string, stage: string): void {
    this.yearEl.textContent = `第 ${year} 年`;
    this.eraEl.textContent = `${era}时代 · ${stage}`;
  }

  setTimeline(t: number, max: number): void {
    if (this.scrubbing) return;
    this.range.max = String(Math.max(1, max));
    this.range.value = String(t);
    this.rangeLbl.textContent = `第 ${t} 步 / 共 ${max} 步`;
  }

  setLocked(locked: boolean): void {
    this.toolBtns.forEach((b, id) => (b.disabled = locked && id !== 'look'));
    this.range.disabled = locked;
    this.lockNote.hidden = !locked;
  }

  /** 导览中只显示纪年，不显示可操作的控件。 */
  setGuided(g: boolean): void {
    this.toolRow.parentElement!.hidden = g;
    this.playBtn.hidden = g;
    this.speedBtns[0].parentElement!.hidden = g;
    this.range.parentElement!.hidden = g;
  }
}

const KIND_CLASS: Partial<Record<SbEvent['kind'], string>> = {
  war: 'bad', split: 'bad', conquest: 'bad', plague: 'sick', famine: 'bad', crisis: 'bad', nuke: 'bad', collapse: 'bad',
  leap: 'gold', leap2: 'gold', era: 'gold', ally: 'cyan', peace: 'cyan', union: 'cyan', act: 'violet', fate: 'gold',
};

/** 左侧事件流：推演中的每一件事，点击可飞到事发地点。 */
export class EventFeed {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private count = 0;

  constructor(private onPick: (e: SbEvent) => void) {
    this.list = h('ol', { class: 'sb-feed-list' });
    const fold = h('button', { type: 'button', class: 'fold-btn', title: '收起 / 展开事件流' }, chevron()) as HTMLButtonElement;
    this.el = h('aside', { class: 'sb-feed', hidden: true, 'aria-label': '文明事件流' },
      h('h4', {}, h('span', {}, '事件流'), h('span', { class: 'h4-tools' }, h('small', {}, '点击可定位'), fold)),
      this.list,
    );
    const set = (min: boolean, user: boolean) => {
      this.el.classList.toggle('min', min);
      fold.setAttribute('aria-expanded', String(!min));
      if (user) remember('feed', !min);
    };
    fold.addEventListener('click', () => set(!this.el.classList.contains('min'), true));
    set(!isOpen('feed', true), false);
    onFoldAll((open) => set(!open, true));
  }

  clear(): void {
    clear(this.list);
    this.count = 0;
  }

  push(events: SbEvent[]): void {
    for (const e of events) {
      if (e.kind === 'found') continue;
      const li = h('li', { class: KIND_CLASS[e.kind] ?? '' },
        h('b', { class: 'mono' }, `${e.year}`),
        h('span', {}, e.text),
      );
      if (e.cell !== undefined) {
        li.tabIndex = 0;
        li.addEventListener('click', () => this.onPick(e));
        li.addEventListener('keydown', (ev) => {
          if ((ev as KeyboardEvent).key === 'Enter') this.onPick(e);
        });
      }
      this.list.prepend(li);
      this.count++;
    }
    while (this.list.childElementCount > 60) this.list.lastElementChild?.remove();
  }
}

/** 实时数据卡片：数值 + 迷你走势线。 */
export class StatTiles {
  readonly el: HTMLElement;
  private cells = new Map<string, { v: HTMLElement; c: HTMLCanvasElement; color: string }>();

  constructor(rows: { id: string; label: string; color: string }[]) {
    this.el = h('div', { class: 'tiles' });
    for (const r of rows) {
      const v = h('b', { class: 'mono' }, '—');
      const c = h('canvas', { class: 'spark', 'aria-hidden': 'true' }) as HTMLCanvasElement;
      this.cells.set(r.id, { v, c, color: r.color });
      this.el.append(h('div', { class: 'tile' }, h('span', {}, r.label), v, c));
    }
  }

  set(id: string, text: string, series?: number[], log = false): void {
    const cell = this.cells.get(id);
    if (!cell) return;
    cell.v.textContent = text;
    if (!series || !cell.c.isConnected) return;
    const { g, w, h: H } = fitCanvas(cell.c, 22);
    g.clearRect(0, 0, w, H);
    const n = series.length;
    if (n < 2) return;
    const step = Math.max(1, Math.floor(n / 120));
    const vals: number[] = [];
    for (let i = 0; i < n; i += step) vals.push(log ? Math.log10(1 + series[i]) : series[i]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi - lo < 1e-6) {
      hi += 0.5;
      lo -= 0.5;
    }
    g.strokeStyle = cell.color;
    g.lineWidth = 1.3;
    g.beginPath();
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * (w - 2) + 1;
      const y = H - 2 - ((v - lo) / (hi - lo)) * (H - 4);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }
}

/** 世界人口的友好写法（单位：万人）。 */
export function popText(wan: number): string {
  if (wan >= 10000) return `${(wan / 10000).toFixed(wan >= 100000 ? 0 : 1)} 亿`;
  if (wan >= 1) return `${Math.round(wan)} 万`;
  return `${Math.round(wan * 10000)} 人`;
}

/** 社会形态占比条：同一时刻不同政体处在不同阶段（统一性与多样性）。 */
export function drawShare(c: HTMLCanvasElement, share: number[][], horizon: number, colors: string[]): void {
  if (!c.isConnected) return;
  const { g, w, h: H } = fitCanvas(c, 34);
  g.clearRect(0, 0, w, H);
  const n = share.length;
  if (!n) return;
  const L = 30;
  const X = (t: number) => L + (t / horizon) * (w - L - 8);
  const step = Math.max(1, Math.floor(n / 240));
  for (let t = 0; t < n; t += step) {
    let y = 0;
    const s = share[t];
    for (let k = 0; k < s.length; k++) {
      if (s[k] <= 0) continue;
      const hh = s[k] * (H - 12);
      g.fillStyle = colors[k];
      g.fillRect(X(t), 2 + y, Math.max(1, X(t + step) - X(t)), hh);
      y += hh;
    }
  }
  g.fillStyle = COLORS.ink3;
  g.font = MONO_FONT;
  g.fillText('形态', 0, 14);
}
