// 顶栏、文明链条（概率筛选）、尺度读数与导览控制条。

import { h, clear, fracText, sup } from './dom';
import { ACTS, ACT_ORDER, type ActId } from '../data/script';
import type { State } from '../app/state';
import type { KeyId, Status } from '../sim/types';

export interface HudHandlers {
  onAct: (id: ActId) => void;
  onMode: () => void;
  onObserver: () => void;
  onArchive: () => void;
  onGraves: () => void;
  onSettings: () => void;
  onSound: () => void;
  onGuidePause: () => void;
  onGuideSkip: () => void;
  onGuideExit: () => void;
}

const LAYER_LABELS = ['L0 物理常数', 'L1 天体', 'L2 行星化学', 'L3 生命', 'L4 文明', 'L5 未来'];
const KEY_ORDER: KeyId[] = ['core', 'star', 'elem', 'life', 'civ', 'future'];

export class Hud {
  readonly el: HTMLElement;
  readonly chainEl: HTMLElement;
  readonly scaleEl: HTMLElement;
  readonly guideEl: HTMLElement;
  private nowEl: HTMLElement;
  private dotsEl: HTMLElement;
  private layerEls: HTMLLIElement[] = [];
  private civEl: HTMLElement;
  private seedEl: HTMLElement;
  private keyEls: HTMLSpanElement[] = [];
  private scaleText: HTMLElement;
  private scaleMark: HTMLElement;
  private modeBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private guideFill: HTMLElement;
  private guideTime: HTMLElement;
  private guidePause: HTMLButtonElement;
  private fracEls: HTMLElement[] = [];

  constructor(private state: State, private on: HudHandlers) {
    this.nowEl = h('div', { class: 'now' });
    this.dotsEl = h('div', { class: 'dots', role: 'navigation', 'aria-label': '章节' });
    this.modeBtn = h('button', { class: 'tool', type: 'button', onclick: () => on.onMode() }, '导览');
    this.soundBtn = h('button', { class: 'tool on', type: 'button', onclick: () => on.onSound(), 'aria-label': '声音' }, '声音');
    this.el = h('header', { class: 'hud' },
      h('div', { class: 'brand' }, h('b', {}, '创世纪元'), h('small', {}, 'AI 文明诞生概率实验室')),
      h('div', { class: 'act-ind' }, this.nowEl, this.dotsEl),
      h('div', { class: 'tools' },
        this.modeBtn,
        h('button', { class: 'tool', type: 'button', onclick: () => on.onObserver() }, h('span', {}, '零号'), h('span', { class: 'lbl' }, '·提问')),
        h('button', { class: 'tool', type: 'button', onclick: () => on.onArchive() }, '档案'),
        h('button', { class: 'tool', type: 'button', onclick: () => on.onGraves() }, '墓园'),
        h('button', { class: 'tool', type: 'button', onclick: () => on.onSettings() }, '设置'),
        this.soundBtn,
      ),
    );

    this.civEl = h('div', { class: 'civ' });
    this.seedEl = h('div', { class: 'seed' });
    const layers = h('ul', { class: 'layers' });
    LAYER_LABELS.forEach((label) => {
      const frac = h('span', { class: 'frac' }, '');
      this.fracEls.push(frac);
      const li = h('li', {}, h('i', {}), h('span', {}, label), frac);
      this.layerEls.push(li);
      layers.append(li);
    });
    const keyrow = h('div', { class: 'keyrow', 'aria-label': '钥匙' });
    KEY_ORDER.forEach((k) => {
      const s = h('span', { class: k, title: k });
      this.keyEls.push(s);
      keyrow.append(s);
    });
    this.chainEl = h('aside', { class: 'chain', 'aria-label': '文明链条' },
      h('h4', {}, h('span', {}, '你的文明'), h('span', {}, '参数空间存活比例')),
      this.civEl,
      this.seedEl,
      layers,
      keyrow,
      h('div', { class: 'note' }, '右侧比例：在本作品设定的参数取值范围内随机抽样，能走过该层的比例。'),
    );

    this.scaleText = h('div', {}, '');
    this.scaleMark = h('i', {});
    this.scaleEl = h('div', { class: 'scale' },
      this.scaleText,
      h('div', { class: 'bar' }, this.scaleMark),
      h('div', { class: 'ticks' }, h('span', {}, '10⁰ m'), h('span', {}, '10¹³'), h('span', {}, '10²⁶ m')),
    );

    this.guideFill = h('i', {});
    this.guideTime = h('span', { class: 'mono' }, '0:00 / 5:35');
    this.guidePause = h('button', { type: 'button', onclick: () => on.onGuidePause() }, '暂停');
    this.guideEl = h('div', { class: 'guide-bar', hidden: true },
      h('span', {}, '导览'),
      h('div', { class: 'bar' }, this.guideFill),
      this.guideTime,
      this.guidePause,
      h('button', { type: 'button', onclick: () => on.onGuideSkip() }, '跳过本幕'),
      h('button', { type: 'button', onclick: () => on.onGuideExit() }, '退出导览'),
    );

    state.ev.on('keys', () => this.renderKeys());
    state.ev.on('layers', () => this.renderLayers());
    state.ev.on('universe', () => this.renderCiv());
    state.ev.on('params', ({ ripple }) => this.ripple(ripple));
    this.renderKeys();
    this.renderLayers();
    this.renderCiv();
    this.setAct('hall');
  }

  setLadder(fractions: number[]): void {
    fractions.forEach((f, i) => (this.fracEls[i].textContent = fracText(f)));
    this.fracEls[5].textContent = '由你决定';
  }

  setAct(id: ActId): void {
    const a = ACTS[id];
    clear(this.nowEl);
    this.nowEl.append(h('span', {}, a.no), h('b', {}, a.title), h('em', {}, a.layer));
    clear(this.dotsEl);
    const idx = ACT_ORDER.indexOf(id);
    ACT_ORDER.forEach((aid, i) => {
      const b = h('button', {
        type: 'button',
        title: `${ACTS[aid].no} ${ACTS[aid].title}`,
        'aria-label': `${ACTS[aid].no} ${ACTS[aid].title}`,
        class: i === idx ? 'here' : i < this.state.reached || i <= this.state.reached ? 'done' : '',
        onclick: () => this.on.onAct(aid),
      });
      b.disabled = i > this.state.reached || this.state.mode === 'guided';
      this.dotsEl.append(b);
    });
  }

  setMode(mode: 'guided' | 'free'): void {
    this.modeBtn.textContent = mode === 'guided' ? '自由探索' : '导览';
    this.modeBtn.title = mode === 'guided' ? '退出导览，自由探索' : '从头播放导览（约 5 分 35 秒）';
    this.guideEl.hidden = mode !== 'guided';
  }

  setSound(on: boolean): void {
    this.soundBtn.classList.toggle('on', on);
    this.soundBtn.textContent = on ? '声音' : '静音';
  }

  setGuideProgress(elapsed: number, total: number, paused: boolean): void {
    const f = Math.min(1, elapsed / total);
    this.guideFill.style.width = `${f * 100}%`;
    const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    this.guideTime.textContent = `${mm(elapsed)} / ${mm(total)}`;
    this.guidePause.textContent = paused ? '继续' : '暂停';
  }

  /** 尺度读数：exp 为以米为单位的数量级。 */
  setScale(exp: number): void {
    this.scaleText.textContent = `尺度 ~10${sup(Math.round(exp))} m`;
    this.scaleMark.style.left = `${Math.max(0, Math.min(100, (exp / 26) * 100))}%`;
  }

  private renderCiv(): void {
    this.civEl.textContent = this.state.civName;
    this.seedEl.textContent = `宇宙编号 ${this.state.seed} · 名字${this.state.civNameSource === 'ai' ? '由 AI 生成' : '由程序生成'}`;
  }

  private renderKeys(): void {
    KEY_ORDER.forEach((k, i) => this.keyEls[i].classList.toggle('on', this.state.keys.has(k)));
  }

  private renderLayers(): void {
    this.state.layers.forEach((s: Status, i) => {
      this.layerEls[i].className = s === 'pending' || s === 'locked' ? '' : s;
    });
  }

  /** 因果涟漪：受影响的层依次闪烁。 */
  private ripple(layers: string[][]): void {
    const layerIdx = new Set<number>();
    const map: Record<string, number> = { alpha: 0, alphas: 0, lambda: 0, carbon: 0, star: 1, orbit: 1, pmass: 1, moon: 1, tect: 2, climate: 2, abio: 3, complex: 3, kpg: 3, P: 4, R: 4, E: 4, C: 4 };
    layers.flat().forEach((n) => layerIdx.add(n.startsWith('f_') ? 5 : map[n] ?? 5));
    [...layerIdx].sort().forEach((li, k) => {
      setTimeout(() => {
        const el = this.layerEls[li];
        el.classList.add('ripple');
        setTimeout(() => el.classList.remove('ripple'), 420);
      }, k * 140);
    });
  }
}
