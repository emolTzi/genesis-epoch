// 名词标注：界面中出现的专业名词自动加上虚线下划线，悬停显示一句话释义，双击跳转到观测档案中的完整注释。

import { GLOSSARY, GLOSSARY_INDEX } from '../data/glossary';

/** 不标注的区域：输入控件、按钮、字幕、名词条目自身的标题等。 */
const SKIP = 'input, textarea, select, button, script, style, svg, canvas, .gl, .no-gl, .subtitle, .tool, [contenteditable]';

const forms: { text: string; id: string }[] = [];
for (const g of GLOSSARY) {
  forms.push({ text: g.term, id: g.id });
  for (const a of g.aliases ?? []) forms.push({ text: a, id: g.id });
}
// 长词优先，避免“温室效应”被“温室”抢先匹配
forms.sort((a, b) => b.text.length - a.text.length);
const byText = new Map(forms.map((f) => [f.text, f.id]));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(forms.map((f) => escape(f.text)).join('|'), 'g');

function annotateText(node: Text): void {
  const text = node.data;
  pattern.lastIndex = 0;
  if (!pattern.test(text)) return;
  pattern.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const id = byText.get(m[0]);
    if (!id || m.index === undefined) continue;
    if (m.index > last) frag.append(text.slice(last, m.index));
    const span = document.createElement('span');
    span.className = 'gl';
    span.dataset.gl = id;
    span.title = `${GLOSSARY_INDEX[id].term}：${GLOSSARY_INDEX[id].brief}（双击查看注释）`;
    span.textContent = m[0];
    frag.append(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  node.replaceWith(frag);
}

export function annotate(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    const p = (root as Text).parentElement;
    if (p && !p.closest(SKIP)) annotateText(root as Text);
    return;
  }
  if (!(root instanceof Element) || root.closest(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = (n as Text).parentElement;
      if (!p || p.closest(SKIP) || !(n as Text).data.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach(annotateText);
}

/** 在根元素上启用自动标注与双击跳转。 */
export function installGlossary(root: HTMLElement, open: (id: string) => void): void {
  let pending = new Set<Node>();
  let scheduled = false;
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') pending.add(r.target);
      else r.addedNodes.forEach((n) => pending.add(n));
    }
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
  const flush = () => {
    scheduled = false;
    const list = pending;
    pending = new Set();
    for (const n of list) if (n.isConnected) annotate(n);
    // 标注本身造成的变动不再处理
    observer.takeRecords();
  };
  annotate(root);
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  root.addEventListener('dblclick', (e) => {
    const t = (e.target as Element).closest?.('.gl') as HTMLElement | null;
    if (!t?.dataset.gl) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    open(t.dataset.gl);
  });
}
