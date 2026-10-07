// 字幕、弹窗与提示。

import { h, clear } from './dom';
import { RANKS, KEY_NAMES, CONFIDENCE_NAMES, type KeyId, type Confidence } from '../sim/types';
import { AHA_LINE, type Epiphany } from '../data/epiphanies';

export class Subtitle {
  readonly el: HTMLElement;
  private line: HTMLElement;
  private timer = 0;

  constructor() {
    this.line = h('div', { class: 'line' });
    this.el = h('div', { class: 'subtitle', 'aria-live': 'polite' }, h('div', { class: 'who' }, '观测者 · 零号'), this.line);
    this.el.style.opacity = '0';
  }

  show(text: string, holdMs?: number): void {
    clearTimeout(this.timer);
    this.line.textContent = text;
    this.line.classList.toggle('quote', text.startsWith('“'));
    this.el.style.opacity = '1';
    if (holdMs) this.timer = window.setTimeout(() => this.hide(), holdMs);
  }

  hide(): void {
    this.el.style.opacity = '0';
  }
}

export class Toasts {
  readonly el = h('div', { class: 'toast-root', 'aria-live': 'polite' });
  show(text: string, kind: '' | 'key' | 'bad' = '', ms = 3200): void {
    const t = h('div', { class: `toast ${kind}` }, text);
    this.el.append(t);
    setTimeout(() => t.remove(), ms);
  }
}

export interface ModalButton {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

export class Modals {
  readonly el = h('div', { hidden: true });
  private resolve: ((v: string) => void) | null = null;
  /** 导览模式下自动选择的按钮值与延时。 */
  auto: { value: string; ms: number } | null = null;

  open(cls: string, body: (Node | string)[], buttons: ModalButton[]): Promise<string> {
    this.close('');
    clear(this.el);
    const row = h('div', { class: 'btns' });
    const box = h('div', { class: `modal ${cls}`, role: 'dialog', 'aria-modal': 'true' }, ...body, row);
    for (const b of buttons) {
      row.append(h('button', { type: 'button', class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`, onclick: () => this.close(b.value) }, b.label));
    }
    this.el.className = 'modal-wrap';
    this.el.append(box);
    this.el.hidden = false;
    (row.querySelector('.primary') as HTMLButtonElement | null)?.focus();
    return new Promise((res) => {
      this.resolve = res;
      if (this.auto) {
        const { value, ms } = this.auto;
        setTimeout(() => this.close(value), ms);
      }
    });
  }

  close(value: string): void {
    this.el.hidden = true;
    const r = this.resolve;
    this.resolve = null;
    r?.(value);
  }

  calibration(current: number): Promise<number> {
    let chosen = current;
    const btns: HTMLButtonElement[] = [];
    const grid = h('div', { class: 'ranks', role: 'group', 'aria-label': '认知坐标' });
    RANKS.forEach((r, i) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(i === current), onclick: () => {
        chosen = i;
        btns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
        desc.textContent = describe(i);
      } }, h('b', {}, r.name), h('small', {}, r.stage));
      btns.push(b);
      grid.append(b);
    });
    const describe = (i: number) => `初始点亮：${RANKS[i].keys.map((k) => KEY_NAMES[k]).join('、')}；讲解深度：${['浅', '中', '深'][RANKS[i].depth]}。没有钥匙的层级，可以在探索中通过“顿悟”解锁。`;
    const desc = h('p', {}, describe(current));
    return this.open('', [
      h('div', { class: 'tag' }, '序章 · 认知校准'),
      h('h2', {}, '选择你的认知坐标'),
      h('p', {}, '你对规律的认识，决定你能改变宇宙的哪一层。小字为大致对应的学段。'),
      grid,
      desc,
    ], [{ label: '校准完成', value: 'ok', primary: true }]).then(() => chosen);
  }

  epiphany(e: Epiphany, depth: 0 | 1 | 2, alreadyHeld = false): Promise<string> {
    return this.open('epiphany', [
      h('div', { class: 'tag' }, `顿悟 · ${KEY_NAMES[e.key]}`),
      h('h2', {}, e.headline),
      h('p', {}, e.tiers[depth]),
      e.formula ? h('span', { class: 'eq' }, e.formula) : null,
      h('div', { class: 'aha' }, AHA_LINE),
      h('p', {}, alreadyHeld ? `你持有${KEY_NAMES[e.key]}，可以亲手修正它。` : `${KEY_NAMES[e.key]}已解锁。`),
      h('div', { class: 'src' }, `出处：${e.sources}`),
    ].filter(Boolean) as Node[], [{ label: '转动这一环', value: 'ok', primary: true }]);
  }

  fate(o: { name: string; layer: number; cause: string; detail: string; epitaph: string }): Promise<string> {
    return this.open('fate', [
      h('div', { class: 'tag' }, `L${o.layer} · 文明链条断裂`),
      h('h2', {}, `${o.name}熄灭了`),
      h('p', {}, h('b', {}, o.cause), '。', o.detail),
      h('div', { class: 'epitaph' }, `“${o.epitaph}”`),
      h('p', { class: 'src' }, '它已归入实验大厅外圈的文明墓园。'),
    ], [
      { label: '回溯到本幕开始', value: 'rewind', primary: true },
      { label: '换一个宇宙重新开始', value: 'new' },
    ]);
  }

  info(tag: string, title: string, body: (Node | string)[], ok = '继续'): Promise<string> {
    return this.open('', [h('div', { class: 'tag' }, tag), h('h2', {}, title), ...body], [{ label: ok, value: 'ok', primary: true }]);
  }
}

export function confidenceChip(c: Confidence): HTMLElement {
  return h('span', { class: `chip c-${c}` }, CONFIDENCE_NAMES[c]);
}

export function keyName(k: KeyId): string {
  return KEY_NAMES[k];
}
