// 观测档案：知识卡、参数注册表、因果图、理论对照、方法说明。

import { h, clear } from './dom';
import { CARDS } from '../data/cards';
import { PARAMS } from '../data/params';
import { THEORY } from '../data/theory';
import { NODES, nodeStatus } from '../sim/causal';
import { CONFIDENCE_NAMES, KEY_NAMES, LAYER_NAMES, type Layer } from '../sim/types';
import { confidenceChip } from './overlays';
import type { State } from '../app/state';

type Tab = 'chronicle' | 'cards' | 'params' | 'graph' | 'theory' | 'method';
const TABS: [Tab, string][] = [['chronicle', '编年史'], ['cards', '知识卡'], ['params', '参数注册表'], ['graph', '因果图'], ['theory', '理论对照'], ['method', '方法与声明']];

export class Archive {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private tabs: HTMLButtonElement[] = [];
  private tab: Tab = 'chronicle';

  constructor(private state: State, onClose: () => void) {
    this.body = h('div', { class: 'obody' });
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    for (const [id, label] of TABS) {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === this.tab), onclick: () => this.show(id) }, label);
      this.tabs.push(b);
      tabs.append(b);
    }
    this.el = h('section', { class: 'overlay', hidden: true, 'aria-label': '观测档案' },
      h('div', { class: 'oh' }, h('b', {}, '观测档案'), tabs, h('button', { class: 'x', type: 'button', 'aria-label': '关闭', onclick: onClose }, '×')),
      this.body,
    );
  }

  setOpen(open: boolean): void {
    this.el.hidden = !open;
    if (open) this.show(this.tab);
  }

  show(tab: Tab): void {
    this.tab = tab;
    this.tabs.forEach((b, i) => b.setAttribute('aria-selected', String(TABS[i][0] === tab)));
    clear(this.body);
    if (tab === 'chronicle') this.body.append(this.chronicle());
    if (tab === 'cards') this.body.append(this.cards());
    if (tab === 'params') this.body.append(this.params());
    if (tab === 'graph') this.body.append(this.graph());
    if (tab === 'theory') this.body.append(this.theory());
    if (tab === 'method') this.body.append(this.method());
    this.body.scrollTop = 0;
  }

  private chronicle(): HTMLElement {
    const s = this.state;
    const kind = { fact: '真实历史', sim: '本次推演', gen: '生成文本' } as const;
    return h('div', { class: 'quote-list' },
      h('p', { class: 'hint' }, `文明“${s.civName}”的编年史，宇宙编号 ${s.seed}。“真实历史”来自地球的已知记录，“本次推演”由模型按宇宙编号确定性地生成。`),
      ...s.chronicle.map((e) => h('figure', {}, h('figcaption', {}, `${e.when} · ${kind[e.kind]} · L${e.layer}`), h('blockquote', { style: 'font-family:var(--sans);font-weight:400;font-size:14px' }, e.text))),
    );
  }

  private cards(): HTMLElement {
    return h('div', { class: 'cards' }, ...CARDS.map((c) => h('article', { class: `card ${c.dialectic ? 'dialectic' : ''}` },
      h('div', { class: 'meta' }, h('span', {}, c.layer), h('span', {}, '·'), h('span', {}, c.discipline), confidenceChip(c.confidence), c.dialectic ? h('span', { class: 'chip c-tui' }, '辩证法视角') : null),
      h('h4', {}, c.title),
      h('p', {}, c.body),
      c.formula ? h('span', { class: 'eq' }, c.formula) : null,
      h('div', { class: 'src' }, `出处：${c.sources}`),
    )));
  }

  private params(): HTMLElement {
    const rows = PARAMS.map((p) => h('tr', {},
      h('td', { class: 'k' }, p.symbol),
      h('td', {}, p.name),
      h('td', {}, `L${p.layer}`),
      h('td', {}, p.reference),
      h('td', {}, p.kind === 'fact' ? '只读' : p.kind === 'number' ? `${p.min}–${p.max}${p.unit ? ' ' + p.unit : ''}` : p.kind === 'boolean' ? '有 / 无' : (p.choices ?? []).map((c) => c.label).join(' / ')),
      h('td', {}, p.role),
      h('td', {}, KEY_NAMES[p.key]),
      h('td', {}, confidenceChip(p.confidence)),
      h('td', {}, p.source, p.note ? h('div', { class: 'src' }, p.note) : null),
    ));
    return h('div', {},
      h('p', { class: 'hint' }, `共 ${PARAMS.length} 项。置信等级：${Object.values(CONFIDENCE_NAMES).join(' / ')}。示意参数用于表达机制与方向，不是测量值。`),
      h('div', { class: 'tblwrap' }, h('table', { class: 'reg' },
        h('thead', {}, h('tr', {}, ...['符号', '名称', '层', '参考值', '取值范围', '作用', '钥匙', '置信', '出处'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...rows),
      )),
    );
  }

  private graph(): HTMLElement {
    const W = 980;
    const colx = [16, 176, 336, 496, 656, 816];
    const NW = 140;
    const NH = 34;
    const byLayer: Record<number, typeof NODES> = {};
    NODES.forEach((n) => (byLayer[n.layer] ??= []).push(n));
    const pos: Record<string, [number, number]> = {};
    let maxRows = 0;
    Object.entries(byLayer).forEach(([l, list]) => {
      maxRows = Math.max(maxRows, list.length);
      list.forEach((n, i) => (pos[n.id] = [colx[Number(l)], 52 + i * 52]));
    });
    const H = 52 + maxRows * 52 + 20;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '六层因果图，节点颜色表示当前宇宙中该环节的状态');
    const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (text) e.textContent = text;
      svg.append(e);
      return e;
    };
    ([0, 1, 2, 3, 4, 5] as Layer[]).forEach((l) => add('text', { x: colx[l] + NW / 2, y: 28, 'text-anchor': 'middle', fill: '#f5c66b', 'font-size': 12, 'font-family': 'GE Mono, monospace' }, LAYER_NAMES[l]));
    for (const n of NODES) {
      for (const d of n.deps) {
        const [x1, y1] = pos[d];
        const [x2, y2] = pos[n.id];
        const sx = x1 + NW;
        const sy = y1 + NH / 2;
        const ex = x2;
        const ey = y2 + NH / 2;
        const same = x1 === x2;
        const dPath = same ? `M ${x1 + NW / 2} ${y1 + NH} L ${x2 + NW / 2} ${y2}` : `M ${sx} ${sy} C ${sx + 20} ${sy}, ${ex - 20} ${ey}, ${ex} ${ey}`;
        add('path', { d: dPath, fill: 'none', stroke: '#737997', 'stroke-width': 1.1, opacity: 0.8 });
      }
    }
    const colors: Record<string, string> = { ok: '#f5c66b', warn: '#a497ff', fail: '#ff6152', pending: '#4a5070', locked: '#4a5070' };
    for (const n of NODES) {
      const [x, y] = pos[n.id];
      const st = n.layer <= 3 ? nodeStatus(n, this.state.report) : this.state.layers[n.layer];
      add('rect', { x, y, width: NW, height: NH, rx: 6, fill: '#161b36', stroke: colors[st] ?? '#4a5070', 'stroke-width': st === 'pending' ? 1 : 1.6 });
      add('text', { x: x + NW / 2, y: y + NH / 2 + 4.5, 'text-anchor': 'middle', fill: '#e7e9f3', 'font-size': 12.5 }, n.label);
    }
    return h('div', {},
      h('p', { class: 'hint' }, '节点边框颜色表示当前宇宙中该环节的状态：金色通过，紫色警示，红色失败，灰色未推演。任何一个上游节点改变，都会沿连线传到下游。'),
      h('div', { class: 'tblwrap' }, svg),
    );
  }

  private theory(): HTMLElement {
    return h('div', { class: 'quote-list' },
      h('p', { class: 'hint' }, '马克思主义在作品中是机制的哲学根据，不是贴在外面的口号。译文以《马克思恩格斯选集》（人民出版社，2012 年第三版）为准，卷次页码待核。'),
      ...THEORY.map((t) => h('figure', {}, h('blockquote', {}, t.quote), h('figcaption', {}, t.source), h('div', { class: 'mech' }, `对应机制：${t.mechanism}`))),
    );
  }

  private method(): HTMLElement {
    const items: [string, string][] = [
      ['表述口径', '所有结论都在“已知物理定律与本模型假设下”成立。作品不使用“绝对”“证明”等措辞。'],
      ['两个问题', '物理常数在整个宇宙中相同，所以 L0 回答“宇宙为何允许生命”；L1–L4（行星、生命、文明）回答“银河系为何寂静”。'],
      ['人择选择效应', '生命起源的概率未知。旅程沿用地球这一唯一已知样本的路径，真实的稀有程度在终章用蒙特卡洛呈现。'],
      ['示意性模型', 'L4 文明引擎与 L5 未来模型是以理论为框架的示意性模型，用于表达机制与方向，不做历史预测或未来预测。'],
      ['可复现', '宇宙编号即随机种子。同一编号得到同一部编年史与同一个结局。'],
      ['LLM 的边界', '大模型只负责把自然语言翻译成参数提议、把引擎结果讲成人话。提议必须通过校验闸门（参数存在、类型正确、在范围内、持有钥匙），所有数值由确定性引擎计算。'],
      ['生成内容标识', '大模型在线生成的回答标注“AI 生成”；离线预置回答与编年史文本由 AI 辅助撰写、经团队审校，标注“AI 辅助撰写”。'],
      ['素材与授权', '真实地球影像来自 NASA 公有领域资料；字体为思源宋体与 JetBrains Mono（SIL OFL 1.1）；声音全部由 Web Audio 实时合成。不使用《三体》的任何专有名词、角色与原文。'],
    ];
    return h('div', { class: 'quote-list' }, ...items.map(([t, b]) => h('figure', {}, h('blockquote', {}, t), h('figcaption', {}, b))));
  }
}
