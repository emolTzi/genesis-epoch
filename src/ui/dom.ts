// 极简 DOM 构建工具。

type Attrs = Record<string, string | number | boolean | undefined | null | EventListener>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: Element, children: (Child | Child[])[]): void {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

/** 适配高分屏的画布。 */
export function fitCanvas(c: HTMLCanvasElement, height: number): { g: CanvasRenderingContext2D; w: number; h: number } {
  const w = Math.max(10, Math.round(c.getBoundingClientRect().width || c.parentElement?.clientWidth || 300));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(height * dpr);
  c.style.height = `${height}px`;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h: height };
}

export const MONO_FONT = '11px "GE Mono", "JetBrains Mono", ui-monospace, monospace';
export const SANS_FONT = '12px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

export const COLORS = {
  gold: '#f5c66b',
  cyan: '#3ff2e6',
  entropy: '#ff6152',
  violet: '#a497ff',
  ink: '#e7e9f3',
  ink2: '#a9aeca',
  ink3: '#737997',
  rule: 'rgba(150,162,220,0.18)',
  ruleStrong: 'rgba(150,162,220,0.34)',
};

/** 把 0–1 的小数格式化为“约 1/N”或百分比。 */
export function fracText(f: number): string {
  if (f <= 0) return '0';
  if (f >= 0.1) return `${Math.round(f * 100)}%`;
  const n = 1 / f;
  if (n < 1000) return `1/${Math.round(n)}`;
  const e = Math.floor(Math.log10(n));
  return `1/${(n / Math.pow(10, e)).toFixed(1)}×10${sup(e)}`;
}

export function sup(n: number): string {
  return String(n)
    .split('')
    .map((c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]))
    .join('');
}
