// 观测者·零号对话抽屉。

import { h } from './dom';
import type { Observer, ObserverReply } from '../llm/observer';
import type { ParamValue } from '../sim/types';

const SUGGESTIONS = ['如果没有月球会怎样？', '如果恐龙没有灭绝呢？', '强相互作用变强 1% 会怎样？', '为什么至今没发现外星人？', '什么是知识即权限？', '生产力与生产关系是什么关系？'];

export class ObserverPanel {
  readonly el: HTMLElement;
  private msgs: HTMLElement;
  private input: HTMLInputElement;
  private busy = false;

  constructor(private observer: Observer, private onApply: (changes: Record<string, ParamValue>) => void, onClose: () => void, private canApply: () => boolean) {
    this.msgs = h('div', { class: 'msgs', 'aria-live': 'polite' });
    this.input = h('input', { type: 'text', id: 'ask-input', placeholder: '向观测者·零号提问，例如“如果地球离太阳更近”', autocomplete: 'off' }) as HTMLInputElement;
    const form = h('form', { class: 'ask' }, this.input, h('button', { type: 'submit', class: 'btn primary' }, '提问'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.send(this.input.value);
    });
    const sugg = h('div', { class: 'suggest' }, ...SUGGESTIONS.map((s) => h('button', { type: 'button', onclick: () => void this.send(s) }, s)));
    this.el = h('section', { class: 'drawer', hidden: true, 'aria-label': '观测者·零号' },
      h('div', { class: 'dh' }, h('div', {}, h('b', {}, '观测者 · 零号'), h('small', {}, 'LLM 提议参数，确定性引擎裁决结果')), h('button', { class: 'x', type: 'button', 'aria-label': '关闭', onclick: onClose }, '×')),
      this.msgs,
      sugg,
      form,
    );
    this.push('ai', h('div', {}, '我负责把你的问题翻译成参数，再交给实验室的推演引擎计算。所有数值都来自引擎，不由我编造。'), '实验室');
  }

  setOpen(open: boolean): void {
    this.el.hidden = !open;
    if (open) setTimeout(() => this.input.focus(), 50);
  }

  private push(who: 'me' | 'ai', body: Node, badge?: string): void {
    const m = h('div', { class: `msg ${who}` }, badge ? h('span', { class: 'badge' }, badge) : null, body);
    this.msgs.append(m);
    this.msgs.scrollTop = this.msgs.scrollHeight;
  }

  async send(text: string): Promise<void> {
    const q = text.trim();
    if (!q || this.busy) return;
    this.busy = true;
    this.input.value = '';
    this.push('me', document.createTextNode(q));
    const pending = h('div', { class: 'msg ai' }, '推演中……');
    this.msgs.append(pending);
    let reply: ObserverReply;
    try {
      reply = await this.observer.ask(q);
    } finally {
      pending.remove();
      this.busy = false;
    }
    this.render(reply);
  }

  private render(r: ObserverReply): void {
    const badge = r.source === 'online' ? 'AI 生成' : r.source === 'fallback' ? '离线缓存 · 在线请求失败' : '离线缓存 · AI 辅助撰写';
    const body = h('div', {}, r.text);
    if (r.error) body.append(h('div', { class: 'rej' }, `在线请求失败：${r.error}`));
    const v = r.validation;
    if (v) {
      if (v.applied.length) {
        body.append(h('div', { class: 'sbx' },
          h('b', {}, '校验闸门通过：'),
          v.applied.map((a) => `${a.name} ${fmt(a.from)} → ${fmt(a.to)}${a.clamped ? '（越界，已夹回范围）' : ''}`).join('；'),
          ...(r.sandbox ? [h('br'), h('b', {}, '沙盒推演：'), ...r.sandbox.lines.flatMap((l) => [h('br'), l])] : []),
        ));
        if (this.canApply()) {
          const changes: Record<string, ParamValue> = {};
          v.applied.forEach((a) => (changes[a.param] = a.to));
          body.append(h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn', onclick: (e: Event) => {
            (e.currentTarget as HTMLButtonElement).disabled = true;
            this.onApply(changes);
          } }, '在本宇宙中应用')));
        }
      }
      for (const rej of v.rejected) body.append(h('div', { class: 'rej' }, `校验闸门拒绝：${rej.reason}`));
    }
    this.push('ai', body, badge);
  }
}

function fmt(v: ParamValue): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'boolean') return v ? '有' : '无';
  return v === 'hazard' ? '沉积区' : v === 'safe' ? '其他地区' : v === 'launch' ? '发射' : v === 'wait' ? '克制' : v;
}
