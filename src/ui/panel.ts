// 右侧仪器面板与常用控件。

import { h, clear } from './dom';
import { PARAM_INDEX } from '../data/params';
import { KEY_NAMES, type KeyId, type Verdict } from '../sim/types';
import { confidenceChip } from './overlays';

export class Panel {
  readonly el = h('aside', { class: 'panel', 'aria-label': '实验舱仪器面板', hidden: true });

  open(head: { no: string; title: string; layer: string }, ...body: (Node | null | false)[]): void {
    clear(this.el);
    this.el.append(
      h('div', { class: 'ph' }, h('span', {}, `实验舱 · ${head.no}`), h('em', {}, head.layer)),
      h('h3', {}, head.title),
      ...(body.filter(Boolean) as Node[]),
    );
    this.el.hidden = false;
    this.el.scrollTop = 0;
  }

  close(): void {
    this.el.hidden = true;
    clear(this.el);
  }
}

export interface SliderHandle {
  el: HTMLElement;
  input: HTMLInputElement;
  value(): number;
  set(v: number, emit?: boolean): void;
  setLocked(locked: boolean): void;
}

/** 绑定到注册表参量的滑杆：显示单位、出处与锁定状态。 */
export function paramSlider(id: string, value: number, onInput: (v: number) => void, opts: { fmt?: (v: number) => string; locked?: boolean } = {}): SliderHandle {
  const d = PARAM_INDEX[id];
  const log = !!d.log;
  const toPos = (v: number) => (log ? Math.log10(v) : v);
  const fromPos = (p: number) => (log ? Math.pow(10, p) : p);
  const input = h('input', {
    type: 'range',
    id: `p-${id}`,
    min: toPos(d.min!),
    max: toPos(d.max!),
    step: log ? 0.01 : d.step ?? 0.01,
    value: toPos(value),
  }) as HTMLInputElement;
  const fmt = opts.fmt ?? ((v: number) => `${v.toFixed(d.step && d.step >= 0.1 ? 1 : 2)}${d.unit ? ' ' + d.unit : ''}`);
  const out = h('output', { for: input.id }, fmt(value));
  const lock = h('span', { class: 'lock', hidden: true }, `需要${KEY_NAMES[d.key as KeyId]}`);
  const el = h('div', { class: 'ctrl' },
    h('label', { for: input.id }, h('span', {}, `${d.name} ${d.symbol}`, ' ', confidenceChip(d.confidence)), out),
    input,
    lock,
  );
  input.addEventListener('input', () => {
    const v = fromPos(Number(input.value));
    out.textContent = fmt(v);
    onInput(v);
  });
  const handle: SliderHandle = {
    el,
    input,
    value: () => fromPos(Number(input.value)),
    set(v, emit = false) {
      input.value = String(toPos(v));
      out.textContent = fmt(v);
      if (emit) onInput(v);
    },
    setLocked(locked) {
      input.disabled = locked;
      el.classList.toggle('locked', locked);
      lock.hidden = !locked;
    },
  };
  handle.setLocked(!!opts.locked);
  return handle;
}

export function readouts(rows: [string, string][]): { el: HTMLElement; set: (id: string, text: string | Node) => void } {
  const cells: Record<string, HTMLElement> = {};
  const el = h('dl', { class: 'read' });
  for (const [label, id] of rows) {
    const dd = h('dd', {}, '—');
    cells[id] = dd;
    el.append(h('div', {}, h('dt', {}, label), dd));
  }
  return {
    el,
    set(id, text) {
      clear(cells[id]);
      cells[id].append(text);
    },
  };
}

export function stateChip(status: string, text: string): HTMLElement {
  const cls = status === 'ok' ? 'st-ok' : status === 'warn' ? 'st-warn' : status === 'fail' ? 'st-fail' : status === 'info' ? 'st-info' : 'st-pending';
  return h('span', { class: `state ${cls}` }, text);
}

export function verdictBox(): { el: HTMLElement; set: (v: Verdict | null, extra?: string) => void } {
  const el = h('div', { class: 'verdict' });
  return {
    el,
    set(v, extra) {
      clear(el);
      el.className = `verdict ${v ? v.status : ''}`;
      if (!v) return;
      el.append(h('b', {}, v.title), '。', v.detail);
      if (extra) el.append(h('span', { class: 'eq' }, extra));
    },
  };
}

export function section(title: string, ...children: (Node | null | false)[]): HTMLElement {
  return h('div', { class: 'sec' }, h('b', {}, title), ...(children.filter(Boolean) as Node[]));
}

export function button(label: string, onclick: () => void, kind: '' | 'primary' | 'ghost' | 'danger' = ''): HTMLButtonElement {
  return h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);
}
