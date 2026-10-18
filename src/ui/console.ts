// 参数台：任何一幕都能打开。按层列出全部可调参量（持有钥匙才能拖动），
// 每一次拖动都由确定性引擎立刻重算六层判定，链条、行星与当前实验舱同步变化。

import { h, clear } from './dom';
import { paramSlider, stateChip, type SliderHandle } from './panel';
import { EDITABLE } from '../data/params';
import { KEY_NAMES, LAYER_NAMES, type KeyId, type Layer, type ParamValue } from '../sim/types';
import { liveLayers } from '../sim/live';
import type { State } from '../app/state';
import { confidenceChip } from './overlays';

/** 由幕间剧情决定、不在参数台中直接修改的参量。 */
const SKIP = new Set(['choice_1962', 'choice_1983']);

export class ParamConsole {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private verdict: HTMLElement;
  private layerHeads: { chip: HTMLElement; detail: HTMLElement }[] = [];
  private sliders = new Map<string, SliderHandle>();
  private toggles = new Map<string, (v: ParamValue) => void>();
  private timer = 0;

  constructor(private state: State, onClose: () => void, private onChanged: () => void) {
    this.verdict = h('div', { class: 'verdict' });
    this.body = h('div', { class: 'cbody' });
    this.el = h('section', { class: 'drawer console', hidden: true, 'aria-label': '参数台' },
      h('div', { class: 'dh' }, h('div', {}, h('b', {}, '参数台'), h('small', {}, '拖动任意参量，六层宇宙立刻重算')), h('button', { class: 'x', type: 'button', 'aria-label': '关闭', onclick: onClose }, '×')),
      h('div', { class: 'cverdict' }, this.verdict),
      this.body,
    );
    state.ev.on('params', () => {
      if (this.el.hidden) return;
      this.syncValues();
      this.updateLive();
    });
    state.ev.on('keys', () => !this.el.hidden && this.render());
    state.ev.on('universe', () => !this.el.hidden && this.render());
  }

  setOpen(open: boolean): void {
    this.el.hidden = !open;
    if (open) this.render();
  }

  private change(id: string, v: ParamValue): void {
    this.state.setParams({ [id]: v });
    // 当前实验舱的刷新较重，拖动停下后再做
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.onChanged(), 260);
  }

  private render(): void {
    clear(this.body);
    this.sliders.clear();
    this.toggles.clear();
    this.layerHeads = [];
    const s = this.state;
    for (let L = 0; L <= 5; L++) {
      const params = EDITABLE.filter((p) => p.layer === L && !SKIP.has(p.id));
      const chip = h('span', {});
      const detail = h('div', { class: 'cdetail' });
      this.layerHeads.push({ chip, detail });
      const sec = h('div', { class: 'csec' }, h('div', { class: 'chead' }, h('b', {}, LAYER_NAMES[L as Layer]), chip), detail);
      for (const d of params) {
        const locked = !s.has(d.key as KeyId);
        if (d.kind === 'number') {
          const sl = paramSlider(d.id, Number(s.params[d.id]), (v) => this.change(d.id, v), { locked });
          this.sliders.set(d.id, sl);
          sec.append(sl.el);
        } else if (d.kind === 'boolean') {
          const box = h('input', { type: 'checkbox', id: `c-${d.id}` }) as HTMLInputElement;
          box.checked = Boolean(s.params[d.id]);
          box.disabled = locked;
          box.addEventListener('change', () => this.change(d.id, box.checked));
          this.toggles.set(d.id, (v) => (box.checked = Boolean(v)));
          sec.append(h('label', { class: `check ${locked ? 'locked' : ''}`, for: box.id }, box, `${d.name} ${d.symbol}`, ' ', confidenceChip(d.confidence), locked ? h('span', { class: 'lock' }, `需要${KEY_NAMES[d.key as KeyId]}`) : null));
        } else if (d.kind === 'choice') {
          const seg = h('div', { class: 'seg', role: 'group', 'aria-label': d.name });
          const btns = (d.choices ?? []).map((c) => {
            const b = h('button', { type: 'button', 'aria-pressed': String(s.params[d.id] === c.value), onclick: () => this.change(d.id, c.value) }, c.label);
            b.disabled = locked;
            seg.append(b);
            return [c.value, b] as const;
          });
          this.toggles.set(d.id, (v) => btns.forEach(([val, b]) => b.setAttribute('aria-pressed', String(val === v))));
          sec.append(h('div', { class: 'ctrl' }, h('label', {}, h('span', {}, d.name, ' ', confidenceChip(d.confidence)), locked ? h('span', { class: 'lock' }, `需要${KEY_NAMES[d.key as KeyId]}`) : ''), seg));
        }
      }
      this.body.append(sec);
    }
    this.body.append(
      h('div', { class: 'btns' },
        h('button', { type: 'button', class: 'btn', onclick: () => this.resetOurs() }, '恢复为我们的宇宙'),
      ),
      h('p', { class: 'hint' }, '没有钥匙的参量会显示锁定。每一项都带置信等级，出处见观测档案的参数注册表。文明层的存活率来自 500 个平行宇宙的宏观平均场模型。'),
    );
    this.updateLive();
  }

  private resetOurs(): void {
    const out: Record<string, ParamValue> = {};
    for (const p of EDITABLE) if (this.state.has(p.key as KeyId) || p.key === 'future') out[p.id] = p.value;
    this.state.setParams(out);
    this.syncValues();
    this.onChanged();
  }

  private syncValues(): void {
    const p = this.state.params;
    this.sliders.forEach((sl, id) => {
      if (Math.abs(sl.value() - Number(p[id])) > 1e-9 && document.activeElement !== sl.input) sl.set(Number(p[id]));
    });
    this.toggles.forEach((set, id) => set(p[id]));
  }

  private updateLive(): void {
    const live = liveLayers(this.state.params, this.state.report);
    live.forEach((l, i) => {
      const head = this.layerHeads[i];
      if (!head) return;
      clear(head.chip);
      head.chip.append(stateChip(l.status, l.title));
      head.detail.textContent = l.detail;
    });
    const r = this.state.report;
    clear(this.verdict);
    if (r.firstFail !== null) {
      const layer = r[`L${r.firstFail}` as 'L0'];
      this.verdict.className = 'verdict fail';
      this.verdict.append(h('b', {}, `链条在 ${LAYER_NAMES[r.firstFail]} 断裂：${layer.verdict.title}`), '。', layer.verdict.detail);
    } else {
      this.verdict.className = 'verdict ok';
      this.verdict.append(h('b', {}, '静态四层全部通过'), `。文明层存活率 ${live[4].title.replace('存活率 ', '')}，未来千年存活 ${live[5].title.replace('千年存活 ', '')}。`);
    }
  }
}
