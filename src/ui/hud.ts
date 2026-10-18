// 顶栏、文明链条（概率筛选）、尺度读数与导览控制条。

import { h, clear, fracText, sup } from './dom';
import { ACTS, ACT_ORDER, GUIDE_LABEL, type ActId } from '../data/script';
import type { State } from '../app/state';
import type { KeyId, Status } from '../sim/types';
import { liveLayers } from '../sim/live';
import { chevron, isOpen, onFoldAll, remember } from './fold';

export interface HudHandlers {
  onAct: (id: ActId) => void;
  onMode: () => void;
  onObserver: () => void;
  onConsole: () => void;
  onArchive: () => void;
  onGraves: () => void;
  onSettings: () => void;
  onFold: () => void;
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
  private foldBtn: HTMLButtonElement;
  private guideFill: HTMLElement;
  private guideTime: HTMLElement;
  private guidePause: HTMLButtonElement;
  private fracEls: HTMLElement[] = [];
  /** 链条右侧显示实时读数（live）或参数空间存活比例（ladder）。 */
  private chainMode: 'live' | 'ladder' = 'live';
  private ladder: number[] | null = null;
  private modeLbl!: HTMLButtonElement;
  private noteEl!: HTMLElement;
  private liveTimer = 0;
  private chainFold!: HTMLButtonElement;

  constructor(private state: State, private on: HudHandlers) {
    this.nowEl = h('div', { class: 'now' });
    this.dotsEl = h('div', { class: 'dots', role: 'navigation', 'aria-label': '章节' });
    this.modeBtn = h('button', { class: 'tool', type: 'button', onclick: () => on.onMode() }, '导览');
    this.soundBtn = h('button', { class: 'tool on', type: 'button', onclick: () => on.onSound(), 'aria-label': '声音' }, '声音');
    this.foldBtn = h('button', { class: 'tool', type: 'button', title: '收起 / 展开全部面板（快捷键 H）', onclick: () => on.onFold() }, '收起') as HTMLButtonElement;
    onFoldAll((open) => (this.foldBtn.textContent = open ? '收起' : '展开'));
    this.el = h('header', { class: 'hud' },
      h('div', { class: 'brand' }, h('b', {}, '创世纪元'), h('small', {}, 'AI 文明诞生概率实验室')),
      h('div', { class: 'act-ind' }, this.nowEl, this.dotsEl),
      h('div', { class: 'tools' },
        this.modeBtn,
        h('button', { class: 'tool accent', type: 'button', title: '参数台：拖动任意参量，六层宇宙立刻重算（快捷键 P）', onclick: () => on.onConsole() }, '参数台'),
        h('button', { class: 'tool', type: 'button', onclick: () => on.onObserver() }, h('span', {}, '零号'), h('span', { class: 'lbl' }, '·提问')),
        h('button', { class: 'tool', type: 'button', onclick: () => on.onArchive() }, '档案'),
        h('button', { class: 'tool', type: 'button', onclick: () => on.onGraves() }, '墓园'),
        h('button', { class: 'tool', type: 'button', onclick: () => on.onSettings() }, '设置'),
        this.foldBtn,
        this.soundBtn,
      ),
    );

    this.civEl = h('div', { class: 'civ' });
    this.seedEl = h('div', { class: 'seed' });
    const layers = h('ul', { class: 'layers' });
    LAYER_LABELS.forEach((label) => {
      const frac = h('span', { class: 'frac' }, '');
      this.fracEls.push(frac);
      const li = h('li', { title: label, 'data-l': label.slice(0, 2) }, h('i', {}), h('span', {}, label), frac);
      this.layerEls.push(li);
      layers.append(li);
    });
    const keyrow = h('div', { class: 'keyrow', 'aria-label': '钥匙' });
    KEY_ORDER.forEach((k) => {
      const s = h('span', { class: k, title: k });
      this.keyEls.push(s);
      keyrow.append(s);
    });
    this.modeLbl = h('button', { type: 'button', class: 'chain-mode', title: '切换：实时读数 / 参数空间存活比例', onclick: () => this.toggleChainMode() }, '实时读数 ⇄');
    this.noteEl = h('div', { class: 'note' });
    const foldBtn = h('button', { type: 'button', class: 'fold-btn', onclick: () => this.setChainMin(!this.chainEl.classList.contains('min'), true) }, chevron()) as HTMLButtonElement;
    this.chainFold = foldBtn;
    this.chainEl = h('aside', { class: 'chain', 'aria-label': '文明链条' },
      h('h4', {}, h('span', {}, '你的文明'), h('span', { class: 'h4-tools' }, this.modeLbl, foldBtn)),
      this.civEl,
      this.seedEl,
      layers,
      keyrow,
      this.noteEl,
    );

    this.scaleText = h('div', {}, '');
    this.scaleMark = h('i', {});
    this.scaleEl = h('div', { class: 'scale' },
      this.scaleText,
      h('div', { class: 'bar' }, this.scaleMark),
      h('div', { class: 'ticks' }, h('span', {}, '10⁰ m'), h('span', {}, '10¹³'), h('span', {}, '10²⁶ m')),
    );

    this.guideFill = h('i', {});
    this.guideTime = h('span', { class: 'mono' }, '0:00');
    this.guidePause = h('button', { type: 'button', onclick: () => on.onGuidePause() }, '暂停');
    this.guideEl = h('div', { class: 'guide-bar', hidden: true },
      h('span', {}, '导览'),
      h('div', { class: 'bar' }, this.guideFill),
      this.guideTime,
      this.guidePause,
      h('button', { type: 'button', onclick: () => on.onGuideSkip() }, '跳过本幕'),
      h('button', { type: 'button', onclick: () => on.onGuideExit() }, '退出导览'),
    );

    this.setChainMin(!isOpen('chain', true));
    onFoldAll((open) => this.setChainMin(!open, true));
    state.ev.on('keys', () => this.renderKeys());
    state.ev.on('layers', () => this.renderLayers());
    state.ev.on('universe', () => this.renderCiv());
    state.ev.on('params', ({ ripple }) => {
      this.ripple(ripple);
      this.scheduleLive();
    });
    state.ev.on('universe', () => this.scheduleLive());
    this.renderKeys();
    this.renderLayers();
    this.renderCiv();
    this.renderFracs();
    this.setAct('hall');
  }

  /** 收起时只显示文明名字与六层状态点。 */
  setChainMin(min: boolean, user = false): void {
    this.chainEl.classList.toggle('min', min);
    this.chainFold.title = min ? '展开文明链条' : '收起文明链条（H 键收起全部）';
    this.chainFold.setAttribute('aria-expanded', String(!min));
    if (user) remember('chain', !min);
  }

  setLadder(fractions: number[]): void {
    this.ladder = fractions;
    this.renderFracs();
  }

  private toggleChainMode(): void {
    this.chainMode = this.chainMode === 'live' ? 'ladder' : 'live';
    this.renderFracs();
  }

  private scheduleLive(): void {
    if (this.chainMode !== 'live') return;
    clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => this.renderFracs(), 120);
  }

  /** 链条右侧：实时读数（随参量变化）或参数空间存活比例（固定）。 */
  private renderFracs(): void {
    if (this.chainMode === 'ladder') {
      this.modeLbl.textContent = '参数空间比例 ⇄';
      this.noteEl.textContent = '右侧比例：在本作品设定的参数取值范围内随机抽样，能走过该层的比例。';
      this.fracEls.forEach((el, i) => {
        el.className = 'frac';
        el.title = '';
        el.textContent = i === 5 ? '由你决定' : this.ladder ? fracText(this.ladder[i]) : '…';
      });
      return;
    }
    this.modeLbl.textContent = '实时读数 ⇄';
    this.noteEl.textContent = '右侧为实时读数：在参数台或实验舱中拖动参量，引擎立刻重算。点击标题切换为参数空间比例。';
    liveLayers(this.state.params, this.state.report).forEach((l, i) => {
      const el = this.fracEls[i];
      el.className = `frac live st-${l.status}`;
      el.textContent = l.short;
      el.title = `${l.title}：${l.detail}`;
      // 收起时用状态点的颜色表达实时判定
      this.layerEls[i].dataset.live = l.status;
      this.layerEls[i].title = `${LAYER_LABELS[i]} · ${l.title}`;
    });
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
    this.modeBtn.title = mode === 'guided' ? '退出导览，自由探索' : `从头播放导览（${GUIDE_LABEL}）`;
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
