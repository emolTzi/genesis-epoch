# -*- coding: utf-8 -*-
"""把本仓库的说明类 Markdown 转成可打印的 HTML（不依赖第三方库）。

支持的语法（够用即可）：#/##/### 标题、> 引用、| 表格 |、- 项目符号、
1. 编号列表、**粗体**、`行内代码`、[链接](url)、--- 分隔线。
"""
import html
import re
import sys
from pathlib import Path

CSS = """
@page { size: A4; margin: 16mm 15mm 16mm 15mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif;
       font-size: 10.5pt; line-height: 1.75; color: #24292f; margin: 0; }
h1 { font-size: 21pt; font-weight: 800; margin: 0 0 14px; padding-bottom: 8px;
     border-bottom: 1.4pt solid #d0d7de; letter-spacing: 0.02em; }
h2 { font-size: 14.5pt; font-weight: 700; color: #1f4e79; margin: 22px 0 10px; }
h3 { font-size: 12pt; font-weight: 700; color: #1f4e79; margin: 18px 0 8px; }
p { margin: 0 0 9px; text-align: justify; }
blockquote { margin: 0 0 16px; padding: 10px 14px; background: #f4f1fb;
             border-left: 3.5pt solid #a78bfa; color: #3d3d4d; }
blockquote p { margin: 0 0 4px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 8.8pt; }
th, td { border: 0.6pt solid #d8dee4; padding: 5px 7px; vertical-align: top; text-align: left; }
th { background: #f2f4f7; font-weight: 700; }
tr:nth-child(even) td { background: #fafbfc; }
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 0.92em;
       background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
ul, ol { margin: 0 0 10px; padding-left: 22px; }
li { margin: 0 0 5px; }
a { color: #0b62c4; text-decoration: none; }
hr { border: 0; border-top: 0.8pt solid #d0d7de; margin: 18px 0; }
"""


def inline(text: str) -> str:
    t = html.escape(text)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
    return t


def convert(md: str) -> str:
    lines = md.splitlines()
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()

        if not s:
            i += 1
            continue

        if s.startswith('---') and set(s) == {'-'}:
            out.append('<hr>')
            i += 1
            continue

        m = re.match(r'^(#{1,3})\s+(.*)$', s)
        if m:
            level = len(m.group(1))
            out.append(f'<h{level}>{inline(m.group(2))}</h{level}>')
            i += 1
            continue

        if s.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                buf.append(lines[i].strip().lstrip('>').strip())
                i += 1
            body = ''.join(f'<p>{inline(x)}</p>' for x in buf if x)
            out.append(f'<blockquote>{body}</blockquote>')
            continue

        if s.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:\-|]+\|$', lines[i + 1].strip()):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            head, body = rows[0], rows[2:]
            n = len(head)
            widths = {2: [26, 74], 3: [18, 52, 30], 4: [16, 44, 11, 29], 5: [14, 34, 12, 12, 28]}.get(
                n, [round(100 / n)] * n)
            colgroup = '<colgroup>' + ''.join(f'<col style="width:{w}%">' for w in widths) + '</colgroup>'
            th = ''.join(f'<th>{inline(c)}</th>' for c in head)
            trs = ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body)
            out.append(f'<table>{colgroup}<thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>')
            continue

        if re.match(r'^[-*]\s+', s):
            items = []
            while i < len(lines) and re.match(r'^[-*]\s+', lines[i].strip()):
                items.append(re.sub(r'^[-*]\s+', '', lines[i].strip()))
                i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>')
            continue

        if re.match(r'^\d+\.\s+', s):
            items = []
            while i < len(lines) and re.match(r'^\d+\.\s+', lines[i].strip()):
                items.append(re.sub(r'^\d+\.\s+', '', lines[i].strip()))
                i += 1
            out.append('<ol>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ol>')
            continue

        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{1,3}\s|>|\||[-*]\s|\d+\.\s)', lines[i].strip()):
            buf.append(lines[i].strip())
            i += 1
        out.append(f'<p>{inline(" ".join(buf))}</p>')
    return '\n'.join(out)


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    md = src.read_text(encoding='utf-8')
    title = next((l.lstrip('# ').strip() for l in md.splitlines() if l.startswith('# ')), src.stem)
    body = convert(md)
    page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>{CSS}</style></head><body>
{body}
</body></html>"""
    dst.write_text(page, encoding='utf-8')
    print(f'{src.name} -> {dst.name}')


if __name__ == '__main__':
    main()
