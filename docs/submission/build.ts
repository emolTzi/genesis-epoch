// 作品介绍文档排版：HTML 正文 + 自动生成的附录 → Paged.js 分页 → Edge 无头模式输出 PDF。
//   npx tsx docs/submission/build.ts            生成 HTML 与 PDF
//   npx tsx docs/submission/build.ts --html     只生成 HTML（调试版式用）
// 正文在 content/*.html，按文件名顺序拼接。约定的标记：
//   $$…$$ / \(…\)                    KaTeX 公式（构建时渲染为 HTML，不依赖运行时脚本）
//   <fig src="figs/x.png" cap="…">     图片，自动编号为“图 章-序”，可加 wide / dark / note="…"
//   <gpt id="01_cover" cap="…">        ChatGPT 生成的素材（docs/assets/gpt/<id>.*），自动加“AI 生成”标注；缺失时显示占位框
//   <ref n="3">                        文献引用上标，链接到参考文献条目
//   <!--GLOSSARY--> <!--PARAMS--> <!--KEYVALUES--> <!--TOC-->   由数据自动生成的表格与目录
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, relative } from 'node:path';
import katex from 'katex';
import { chromium } from 'playwright-core';
import { GLOSSARY, GLOSSARY_FIELDS } from '../../src/data/glossary';
import { PARAMS } from '../../src/data/params';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '..', '..');
// 两本文档共用这一条流水线：DOC=tech 时读 tech/content，输出《技术文档》。
const DOC = process.env.DOC === 'tech' ? 'tech' : 'intro';
const SRC = DOC === 'tech' ? join(HERE, 'tech') : HERE;
const DOC_LABEL = DOC === 'tech' ? '技术文档' : '作品介绍文档';
const OUT = join(SRC, 'out');
const NAME = `创世纪元-${DOC_LABEL}`;
mkdirSync(OUT, { recursive: true });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const has = (tag: string, name: string) => new RegExp(`\\s${name}(\\s|>|/)`).test(tag);
/** 图片路径相对于输出目录。 */
const rel = (p: string) => relative(OUT, join(HERE, p)).replace(/\\/g, '/');

let html = readdirSync(join(SRC, 'content'))
  .filter((f) => f.endsWith('.html'))
  .sort()
  .map((f) => readFileSync(join(SRC, 'content', f), 'utf8'))
  .join('\n');

// ───── 章节扉页：<chapter id no title en art>导语</chapter> ─────
const gptFile = (gid: string) => {
  const dir = join(ROOT, 'docs', 'assets', 'gpt');
  const f = existsSync(dir) ? readdirSync(dir).find((x) => x.startsWith(`${gid}.`) && /\.(png|jpe?g|webp)$/i.test(x)) : undefined;
  return f ? relative(OUT, join(dir, f)).replace(/\\/g, '/') : null;
};
html = html.replace(/<chapter\b([^>]*)>([\s\S]*?)<\/chapter>/g, (_, a: string, desc: string) => {
  const art = attr(a, 'art');
  const src = art ? gptFile(art) : null;
  const bg = src ? `<img src="${src}" alt="">` : `<div class="placeholder"></div>`;
  return `<section class="opener"><div class="bg">${bg}</div><div class="shade"></div><div class="num">${attr(a, 'no')}</div><h1 id="${attr(a, 'id')}" class="t">${attr(a, 'title')}</h1><div class="k">${attr(a, 'en') ?? ''}</div><div class="d">${desc.trim()}</div>${src ? '<span class="ai-badge">AI 生成</span>' : ''}</section>`;
});
html = html.replace(/<cover\s*\/?>/, () => {
  const src = gptFile('01_cover');
  return `<section class="cover"><div class="art">${src ? `<img src="${src}" alt="">` : '<div class="placeholder"></div>'}</div><div class="veil"></div>
<div class="head"><span>2026 · 第十四届全国大学生数字媒体科技作品及创意竞赛</span><span>${DOC_LABEL}</span></div>
<div class="title"><div class="zh">创世纪元</div><div class="sub">AI 文明诞生概率实验室</div><div class="en">GENESIS EPOCH · AI CIVILIZATION PROBABILITY LAB</div></div>
<div class="slogan">你对规律的认识，决定你能改变宇宙的哪一层。</div>
<div class="meta"><div><b>参赛赛项</b>指定命题 · 科幻+及元宇宙数字作品</div><div><b>作品形态</b>Web 3D 实时交互 · 单文件离线运行</div><div><b>核心技术</b>神经符号协同 · 基于主体的文明推演 · GPU 程序化渲染</div></div>
${src ? '<span class="ai-badge">封面图 AI 生成</span>' : ''}</section>`;
});

// ───── 公式 ─────
html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => katex.renderToString(tex.trim(), { displayMode: true, throwOnError: true, strict: 'ignore' }));
html = html.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => katex.renderToString(tex.trim(), { displayMode: false, throwOnError: true, strict: 'ignore' }));

// ───── 图片与 AI 素材：按章节编号 ─────
let chapter = 0;
let figN = 0;
const figIndex: { id: string; label: string; cap: string }[] = [];
html = html.replace(/<h1([^>]*)>|<fig\b[^>]*>|<gpt\b[^>]*>/g, (tag) => {
  if (tag.startsWith('<h1')) {
    if (!/class="(?:[^"]*\s)?nonum/.test(tag)) {
      chapter++;
      figN = 0;
    }
    return tag;
  }
  figN++;
  const label = `图 ${chapter}-${figN}`;
  const cap = attr(tag, 'cap') ?? '';
  const id = `fig-${chapter}-${figN}`;
  figIndex.push({ id, label, cap });
  const cls = ['figure', has(tag, 'wide') ? 'wide' : '', has(tag, 'dark') ? 'dark' : '', has(tag, 'half') ? 'half' : ''].filter(Boolean).join(' ');
  const note = attr(tag, 'note');
  if (tag.startsWith('<gpt')) {
    const gid = attr(tag, 'id')!;
    const dir = join(ROOT, 'docs', 'assets', 'gpt');
    const file = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${gid}.`) && /\.(png|jpe?g|webp)$/i.test(f)) : undefined;
    if (!file) {
      // 团队只下载到部分 AI 概念图：缺图的直接略去，不留占位框与图注。
      figN--;
      figIndex.pop();
      return '';
    }
    figN++;
    const label2 = `图 ${chapter}-${figN}`;
    const id2 = `fig-${chapter}-${figN}`;
    figIndex.push({ id: id2, label: label2, cap });
    return `<figure class="${cls} ai" id="${id2}"><img src="${relative(OUT, join(dir, file)).replace(/\\/g, '/')}" alt="${esc(cap)}"><span class="ai-badge">AI 生成</span><figcaption><b>${label2}</b>${cap}<span class="ai-note">图像由 ChatGPT 网页版根据团队撰写的提示词生成，仅作视觉概念与文创设计示意。</span></figcaption></figure>`;
  }
  const src = attr(tag, 'src')!;
  if (!existsSync(join(HERE, src))) throw new Error(`缺少图片 ${src}`);
  return `<figure class="${cls}" id="${id}"><img src="${rel(src)}" alt="${esc(cap)}"><figcaption><b>${label}</b>${cap}${note ? `<span class="fig-note">${note}</span>` : ''}</figcaption></figure>`;
});

// ───── 文献引用 ─────
html = html.replace(/<ref n="([\d,–-]+)">/g, (_, n: string) => `<sup class="cite">[${n.split(',').map((k) => `<a href="#ref-${k.split(/[–-]/)[0]}">${k}</a>`).join(',')}]</sup>`);

// ───── 由数据生成的附录 ─────
const glossary = GLOSSARY_FIELDS.map((field) => {
  const list = GLOSSARY.filter((g) => g.field === field);
  if (!list.length) return '';
  return `<h3>${field}</h3><div class="gl-list">${list
    .map((g) => `<div class="gl" id="gl-${g.id}"><h4>${esc(g.term)}${g.aliases?.length ? `<small>${g.aliases.map(esc).join(' / ')}</small>` : ''}</h4><p class="brief">${esc(g.brief)}</p><p>${esc(g.detail)}</p><p class="use"><b>在本作品中</b>${esc(g.use)}</p>${g.ref ? `<p class="gref">${esc(g.ref)}</p>` : ''}</div>`)
    .join('')}</div>`;
}).join('');
html = html.replace('<!--GLOSSARY-->', glossary);

const fmtVal = (p: (typeof PARAMS)[number]) =>
  p.kind === 'fact' ? '只读' : p.kind === 'boolean' ? '有 / 无' : p.kind === 'choice' ? (p.choices ?? []).map((c) => c.label).join(' / ') : `${p.min}–${p.max}${p.unit ? ' ' + p.unit : ''}`;
const CONF_LABEL: Record<string, string> = { shi: '实证', gu: '估计', tui: '推测', zheng: '争议', yi: '示意' };
const params = `<table class="registry"><thead><tr><th>编号</th><th>符号</th><th>名称</th><th>层</th><th>参考值</th><th>取值范围</th><th>置信</th><th>出处</th></tr></thead><tbody>${PARAMS.map(
  (p) => `<tr><td class="mono">${p.id}</td><td>${esc(p.symbol)}</td><td>${esc(p.name)}</td><td>${p.layer}</td><td>${esc(p.reference)}</td><td>${esc(fmtVal(p))}</td><td><span class="conf c-${p.confidence}">${CONF_LABEL[p.confidence] ?? p.confidence}</span></td><td class="small">${esc(p.source)}</td></tr>`,
).join('')}</tbody></table>`;
html = html.replace('<!--PARAMS-->', params);

const kv = readFileSync(join(ROOT, 'docs', '关键数值.md'), 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('| ') && !l.startsWith('| 项目') && !l.startsWith('|---'))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
html = html.replace('<!--KEYVALUES-->', `<table class="kv"><thead><tr><th>项目</th><th>数值</th><th>计算来源</th></tr></thead><tbody>${kv.map((r) => `<tr><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td><td class="mono small">${esc(r[2])}</td></tr>`).join('')}</tbody></table>`);

// ───── 目录 ─────
const heads = [...html.matchAll(/<h([12])([^>]*)id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)].filter((m) => !/no-toc/.test(m[2]));
const toc = `<nav class="toc"><h1 class="nonum no-toc" id="toc">目　录</h1><ol>${heads
  .map((m) => `<li class="l${m[1]}"><a href="#${m[3]}"><span class="tt">${m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</span><span class="dots"></span><span class="pg"></span></a></li>`)
  .join('')}</ol></nav>`;
html = html.replace('<!--TOC-->', toc);

// ───── 组装 ─────
const katexDir = join(HERE, 'node_modules', 'katex', 'dist');
cpSync(join(katexDir, 'katex.min.css'), join(OUT, 'katex', 'katex.min.css'));
cpSync(join(katexDir, 'fonts'), join(OUT, 'katex', 'fonts'), { recursive: true });
cpSync(join(HERE, 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js'), join(OUT, 'paged.polyfill.js'));
cpSync(join(HERE, 'style.css'), join(OUT, 'style.css'));

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>创世纪元：AI文明诞生概率实验室 · ${DOC_LABEL}</title>
<link rel="stylesheet" href="katex/katex.min.css">
<link rel="stylesheet" href="style.css">
<script>
window.PagedConfig = { auto: true, after: () => {
  // 分页完成后回填目录页码：找到每个锚点所在的页
  document.querySelectorAll('.toc a[href^="#"]').forEach((a) => {
    const t = document.getElementById(a.getAttribute('href').slice(1));
    const pg = t && t.closest('.pagedjs_page');
    const n = pg && pg.getAttribute('data-page-number');
    const slot = a.querySelector('.pg');
    if (slot && n) slot.textContent = n;
  });
  window.__pagedDone = true;
} };
</script>
<script src="paged.polyfill.js"></script>
</head><body>
${html}
</body></html>`;
const htmlPath = join(OUT, `${NAME}.html`);
writeFileSync(htmlPath, page);
writeFileSync(join(OUT, 'figures.json'), JSON.stringify(figIndex, null, 2));
console.log('HTML →', htmlPath, `（${figIndex.length} 幅图）`);

if (!process.argv.includes('--html')) {
  // Paged.js 用 XHR 读取样式表，file:// 下会被拦截，因此临时起一个只读的本地静态服务（仅监听 127.0.0.1）
  const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
  const server = createServer((req, res) => {
    const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
    if (!p.startsWith(ROOT) || !existsSync(p)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(p).toLowerCase()] ?? 'application/octet-stream' }).end(readFileSync(p));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ channel: 'msedge' });
  const tab = await browser.newPage();
  tab.on('pageerror', (e) => console.log('[pageerror]', e.message));
  tab.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
  await tab.goto(`http://127.0.0.1:${port}/${relative(ROOT, htmlPath).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')}`);
  await tab.waitForFunction(() => (window as unknown as { __pagedDone?: boolean }).__pagedDone === true, null, { timeout: 300_000 });
  const pages = await tab.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
  const pdfPath = join(ROOT, 'docs', `${NAME}.pdf`);
  mkdirSync(dirname(pdfPath), { recursive: true });
  await tab.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
  await browser.close();
  server.close();
  console.log('PDF  →', pdfPath, `（${pages} 页）`);
}
