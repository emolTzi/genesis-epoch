// 界面折叠：记住观众对每个面板、每个分节的展开 / 收起选择，并支持一键收起全部浮层（快捷键 H）。

import { load, save } from '../core/storage';

const KEY = 'genesis.fold.v1';
const prefs: Record<string, boolean> = load(KEY, {});
const listeners = new Set<(open: boolean) => void>();

/** 读取展开状态；没有记录时用默认值。 */
export function isOpen(id: string, fallback: boolean): boolean {
  return prefs[id] ?? fallback;
}

export function remember(id: string, open: boolean): void {
  prefs[id] = open;
  save(KEY, prefs);
}

/** 浮层（左侧链条、右侧面板、事件流）订阅“全部收起 / 展开”。返回取消订阅函数。 */
export function onFoldAll(fn: (open: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function foldAll(open: boolean): void {
  listeners.forEach((fn) => fn(open));
}

/** 折叠按钮上的箭头。 */
export function chevron(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('class', 'chev');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M3 4.5l3 3 3-3');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.6');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}
