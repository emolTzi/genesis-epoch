# -*- coding: utf-8 -*-
"""生成《创世纪元》作品汇报 PPT（16:9，匿名评审版）。

用法：python docs/ppt/make_bg.py && python docs/ppt/build_ppt.py
输出：docs/创世纪元-作品汇报.pptx
"""
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / 'docs' / 'submission' / 'shots'
FIGS = ROOT / 'docs' / 'submission' / 'figs'
ASSETS = Path(__file__).resolve().parent / 'assets'
OUT = ROOT / 'docs' / '创世纪元-作品汇报.pptx'

W, H = 13.333, 7.5
BG = RGBColor(0x05, 0x06, 0x0A)
CARD = RGBColor(0x0D, 0x12, 0x26)
CARD2 = RGBColor(0x11, 0x18, 0x30)
INK = RGBColor(0xF4, 0xF6, 0xFB)
MUTED = RGBColor(0x9F, 0xB0, 0xD0)
DIM = RGBColor(0x6F, 0x7A, 0x96)
CYAN = RGBColor(0x3F, 0xF2, 0xE6)
GOLD = RGBColor(0xF5, 0xC6, 0x6B)
VIOLET = RGBColor(0xA4, 0x97, 0xFF)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
PAPER = RGBColor(0xF7, 0xF8, 0xFB)
INK_DARK = RGBColor(0x33, 0x3A, 0x4A)
FONT = '微软雅黑'

prs = Presentation()
prs.slide_width = Inches(W)
prs.slide_height = Inches(H)
BLANK = prs.slide_layouts[6]


def slide():
    s = prs.slides.add_slide(BLANK)
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg.fill.solid()
    bg.fill.fore_color.rgb = BG
    bg.line.fill.background()
    bg.shadow.inherit = False
    return s


def rect(s, x, y, w, h, color, radius=0.04, line=None):
    shp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.adjustments[0] = radius
    shp.fill.solid()
    shp.fill.fore_color.rgb = color
    if line:
        shp.line.color.rgb = line
        shp.line.width = Pt(0.75)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def bar(s, x, y, w, h, color):
    shp = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.fill.solid()
    shp.fill.fore_color.rgb = color
    shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def text(s, x, y, w, h, runs, size=14, color=INK, bold=False, align=PP_ALIGN.LEFT,
         line_spacing=1.35, anchor=MSO_ANCHOR.TOP):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    para = tf.paragraphs[0]
    para.alignment = align
    para.line_spacing = line_spacing
    if isinstance(runs, str):
        runs = [(runs, {})]
    for txt, style in runs:
        r = para.add_run()
        r.text = txt
        r.font.name = style.get('font', FONT)
        r.font.size = Pt(style.get('size', size))
        r.font.bold = style.get('bold', bold)
        r.font.color.rgb = style.get('color', color)
        if style.get('spc'):
            r.font._rPr.set('spc', str(style['spc']))
    return tb


def bullets(s, x, y, w, h, items, size=14, color=MUTED, gap=10, bullet_color=CYAN):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = 1.42
        p.space_after = Pt(gap)
        dot = p.add_run()
        dot.text = '· '
        dot.font.name = FONT
        dot.font.size = Pt(size)
        dot.font.bold = True
        dot.font.color.rgb = bullet_color
        if isinstance(item, str):
            item = [(item, {})]
        for txt, style in item:
            r = p.add_run()
            r.text = txt
            r.font.name = FONT
            r.font.size = Pt(style.get('size', size))
            r.font.bold = style.get('bold', False)
            r.font.color.rgb = style.get('color', color)
    return tb


def picture_cover(s, path, x, y, w, h, border=False):
    iw, ih = Image.open(path).size
    src, dst = iw / ih, w / h
    pic = s.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
    if src > dst:
        c = (1 - dst / src) / 2
        pic.crop_left = pic.crop_right = c
    else:
        c = (1 - src / dst) / 2
        pic.crop_top = pic.crop_bottom = c
    if border:
        pic.line.color.rgb = RGBColor(0x2A, 0x36, 0x55)
        pic.line.width = Pt(0.75)
    return pic


def picture_contain(s, path, x, y, w, h, border=False):
    iw, ih = Image.open(path).size
    scale = min(w / iw, h / ih)
    pw, ph = iw * scale, ih * scale
    pic = s.shapes.add_picture(str(path), Inches(x + (w - pw) / 2), Inches(y + (h - ph) / 2),
                               Inches(pw), Inches(ph))
    if border:
        pic.line.color.rgb = RGBColor(0x2A, 0x36, 0x55)
        pic.line.width = Pt(0.75)
    return pic


def header(s, eyebrow, title, sub=None):
    bar(s, 0.85, 0.62, 0.06, 0.26, CYAN)
    text(s, 1.02, 0.6, 9.0, 0.3, [(eyebrow, {'size': 10.5, 'color': CYAN, 'spc': 200})], size=10.5)
    text(s, 0.85, 0.95, 11.6, 0.7, title, size=27, bold=True, color=INK)
    if sub:
        text(s, 0.85, 1.62, 11.6, 0.42, sub, size=12.5, color=MUTED)


def footer(s, n, total):
    bar(s, 0.85, 6.94, 11.63, 0.008, RGBColor(0x1E, 0x27, 0x40))
    text(s, 0.85, 7.02, 7.0, 0.25, [('创世纪元 · AI 文明诞生概率实验室', {'size': 8.5, 'color': DIM})], size=8.5)
    text(s, 10.6, 7.02, 1.9, 0.25, [(f'{n:02d} / {total:02d}', {'size': 8.5, 'color': DIM})], size=8.5,
         align=PP_ALIGN.RIGHT)


def metric(s, x, y, w, value, unit, label, color=GOLD):
    text(s, x, y, w, 0.6, [(value, {'size': 30, 'bold': True, 'color': color}),
                           (unit, {'size': 11, 'color': color})], size=30)
    text(s, x, y + 0.62, w, 0.6, label, size=9.5, color=MUTED, line_spacing=1.25)


def chip(s, x, y, w, value, label, color=GOLD):
    rect(s, x, y, w, 1.05, CARD, line=RGBColor(0x1E, 0x27, 0x40))
    text(s, x + 0.22, y + 0.16, w - 0.4, 0.42, [(value, {'size': 19, 'bold': True, 'color': color})], size=19)
    text(s, x + 0.22, y + 0.63, w - 0.4, 0.35, label, size=9, color=MUTED)


TOTAL = 19

# ── 01 封面 ─────────────────────────────────────────────
s = slide()
s.shapes.add_picture(str(ASSETS / 'cover_bg.png'), 0, 0, prs.slide_width, prs.slide_height)
bar(s, 0.95, 1.62, 0.055, 1.55, GOLD)
text(s, 1.2, 1.55, 9.6, 0.4,
     [('2026 · 第十四届全国大学生数字媒体科技作品及创意竞赛', {'size': 10.5, 'color': MUTED, 'spc': 80})], size=10.5)
text(s, 1.2, 1.9, 9.6, 0.35,
     [('指定命题「科幻+及元宇宙数字作品」', {'size': 10.5, 'color': DIM, 'spc': 60})], size=10.5)
text(s, 1.15, 2.5, 9.0, 1.3, '创世纪元', size=60, bold=True, color=INK)
text(s, 1.2, 3.72, 9.0, 0.6, [('AI 文明诞生概率实验室', {'size': 24, 'bold': True, 'color': GOLD, 'spc': 260})], size=24)
text(s, 1.2, 4.36, 9.0, 0.35, [('GENESIS EPOCH · AI CIVILIZATION PROBABILITY LAB',
                                {'size': 9.5, 'color': CYAN, 'spc': 280})], size=9.5)
text(s, 1.2, 5.72, 9.6, 0.45, '你对规律的认识，决定你能改变宇宙的哪一层。', size=15, color=INK)

# ── 02 命题 ─────────────────────────────────────────────
s = slide()
header(s, '命题', '宇宙如此广阔，我们为什么至今没有发现外星人？')
text(s, 0.85, 1.75, 11.6, 0.4, '作品把它拆成两个问题分别回答，答案都落在可调、可算的参量上。', size=13, color=MUTED)

rect(s, 0.85, 2.45, 5.6, 3.35, CARD)
bar(s, 0.85, 2.45, 0.05, 3.35, GOLD)
text(s, 1.2, 2.72, 4.9, 0.3, [('L0', {'size': 12, 'bold': True, 'color': GOLD, 'spc': 150})], size=12)
text(s, 1.2, 3.05, 4.9, 0.6, '宇宙为什么允许生命存在？', size=19, bold=True, color=INK)
text(s, 1.2, 3.85, 4.85, 1.6, '物理常数只要偏移一点——强相互作用超过约 0.5%，恒星就几乎造不出碳或氧，生命所需的原料不存在。',
     size=12, color=MUTED, line_spacing=1.55)

rect(s, 6.9, 2.45, 5.6, 3.35, CARD)
bar(s, 6.9, 2.45, 0.05, 3.35, VIOLET)
text(s, 7.25, 2.72, 4.9, 0.3, [('L1 – L4', {'size': 12, 'bold': True, 'color': VIOLET, 'spc': 150})], size=12)
text(s, 7.25, 3.05, 4.9, 0.6, '银河系为什么一片寂静？', size=19, bold=True, color=INK)
text(s, 7.25, 3.85, 4.85, 1.6, '行星、生命、文明逐层筛选；参数空间里能走到文明层的比例只有 5.6 × 10⁻⁶，我们确实站在一条窄缝里。',
     size=12, color=MUTED, line_spacing=1.55)
text(s, 0.85, 6.15, 11.6, 0.4, '把“稀有”从一句感慨，变成可以亲手操作的实验。', size=12.5, color=CYAN)
footer(s, 2, TOTAL)

# ── 03 作品速览 ─────────────────────────────────────────
s = slide()
header(s, '作品', '一座可以亲手操作的宇宙实验室', '调节参量 → 引擎推演 → 判定这一层能否走过；失败即熄灭，可回溯改写。')
picture_cover(s, SHOTS / 's02_console.png', 6.55, 1.95, 5.95, 3.5, border=True)
metric(s, 0.85, 2.15, 1.75, '6', ' 层', '因果筛选链\n常数 → 文明')
metric(s, 2.75, 2.15, 1.75, '29', ' 项', '参数注册表\n含出处与置信')
metric(s, 4.65, 2.15, 1.75, '63', ' 项', '单元测试\n公式与可复现')
metric(s, 0.85, 3.95, 1.75, '5:10', '', '导览模式\n自动走完全片')
metric(s, 2.75, 3.95, 1.75, '1.7', ' MB', '单文件离线\n双击即可运行')
metric(s, 4.65, 3.95, 1.75, '0', ' 依赖', '运行时零请求\n字体影像内联')
text(s, 0.85, 5.55, 11.6, 0.9, '作品不是一段预渲染的动画：你改的每一个参量，都由本机的确定性引擎当场重算。',
     size=12.5, color=CYAN, line_spacing=1.4)
text(s, 0.85, 6.25, 11.6, 0.4, '右侧为参数台：任何一幕都能打开，六层判定与行星外观实时更新。', size=10.5, color=MUTED)
footer(s, 3, TOTAL)

# ── 04 六层链条 ─────────────────────────────────────────
s = slide()
header(s, '结构', '六层宇宙：一条会断的因果链', '每一层都有自己的参量、判定与文献依据；任一层偏离，链条就在那一层断裂。')
layers = [
    ('L0', '物理常数', '3.1 × 10⁻²', GOLD),
    ('L1', '天体', '9.2 × 10⁻⁴', GOLD),
    ('L2', '行星化学', '8.3 × 10⁻⁵', GOLD),
    ('L3', '生命', '1.1 × 10⁻⁵', VIOLET),
    ('L4', '文明', '5.6 × 10⁻⁶', VIOLET),
    ('L5', '未来', '四参量情景', CYAN),
]
x0, bw, gap = 0.85, 1.72, 0.24
for i, (tag, name, val, col) in enumerate(layers):
    x = x0 + i * (bw + gap)
    rect(s, x, 2.5, bw, 2.1, CARD, line=RGBColor(0x1E, 0x27, 0x40))
    bar(s, x, 2.5, bw, 0.045, col)
    text(s, x + 0.18, 2.7, bw - 0.3, 0.3, [(tag, {'size': 11, 'bold': True, 'color': col, 'spc': 150})], size=11)
    text(s, x + 0.18, 3.02, bw - 0.3, 0.4, name, size=15, bold=True, color=INK)
    text(s, x + 0.18, 3.78, bw - 0.3, 0.35, val, size=11, color=MUTED)
text(s, 0.85, 4.85, 11.5, 0.35, '逐层通过比例（12 000 次参数空间抽样，causal.survivalLadder）', size=9.5, color=DIM)
text(s, 0.85, 5.35, 11.5, 0.5, '每一次断裂都写成一条编年史，收进“文明墓园”；同一个宇宙编号，永远得到同一部历史。',
     size=13, color=MUTED)
text(s, 0.85, 6.05, 11.5, 0.4, '失败不是终点——它是这个宇宙唯一的、可复现的结局。', size=14, color=INK)
footer(s, 4, TOTAL)

# ── 05 知识即权限 ───────────────────────────────────────
s = slide()
header(s, '机制', '知识即权限：理解了，才能改变', '五档认知坐标决定讲解深度与可改动的参量；层级之间用钥匙串联。')
grades = [('见习观测员', '小学'), ('助理观测员', '初中'), ('观测员', '高中'), ('研究员', '本科'), ('首席科学家', '硕士')]
for i, (name, stage) in enumerate(grades):
    x = 0.85 + i * 1.42
    rect(s, x, 2.3, 1.3, 0.95, CARD2 if i == 2 else CARD, line=CYAN if i == 2 else RGBColor(0x1E, 0x27, 0x40))
    text(s, x, 2.46, 1.3, 0.3, name, size=10.5, bold=True, color=INK, align=PP_ALIGN.CENTER)
    text(s, x, 2.83, 1.3, 0.3, f'约{stage}', size=9, color=MUTED, align=PP_ALIGN.CENTER)
text(s, 0.85, 3.45, 11.5, 0.35, '认知校准完成时点亮对应的钥匙；没有钥匙的层级先看后果，读完顿悟卡再解锁。', size=11, color=MUTED)
keys = [('星辰之钥', '轨道与宜居带'), ('元素之钥', '碳–硅酸盐循环'), ('生命之钥', '撞击与灭绝'), ('文明之钥', '合作与制度'), ('本源之钥', '物理常数')]
for i, (k, d) in enumerate(keys):
    x = 0.85 + i * 2.34
    rect(s, x, 4.0, 2.16, 1.35, CARD, line=RGBColor(0x1E, 0x27, 0x40))
    text(s, x + 0.2, 4.2, 1.8, 0.3, k, size=13, bold=True, color=GOLD)
    text(s, x + 0.2, 4.6, 1.8, 0.5, d, size=10, color=MUTED, line_spacing=1.25)
text(s, 0.85, 5.75, 11.5, 0.5, '“理解到了哪一层，才能改写哪一层。”', size=16, color=INK)
footer(s, 5, TOTAL)

# ── 06–10 五幕 ─────────────────────────────────────────
acts = [
    ('第①幕', '精细调节', '大爆炸 → 宇宙网 → 第一代恒星',
     ['拖动精细结构常数与强相互作用强度，看宇宙落在“可行孤岛”的哪一处。',
      '强相互作用偏移 0.5%，恒星几乎造不出碳或氧。',
      '本源之钥在此封印：第一次旅程，常数不可改。'],
     's03_origin.png', [('0.5%', '强相互作用偏移上限'), ('10²⁵ m', '宇宙网尺度')]),
    ('第②幕', '宜居带', '轨道一动，海洋生死',
     ['把轨道推到 2.4 AU，平衡温度跌到 164.3 K，行星冰封，链条在 L1 断裂。',
      '移回 1 AU：254.6 K，液态水出现，整条因果链重新接通。',
      '保守宜居带 0.993–1.676 AU 实时标注在图上。'],
     's04_stars.png', [('164.3 K', '2.4 AU 平衡温度'), ('0.99–1.68 AU', '保守宜居带')]),
    ('第③幕', '碳–硅酸盐循环', '一台看不见的行星恒温器',
     ['火山补充 CO₂，岩石风化把它埋进海底；越热风化越快，升温被削掉一半。',
      '恒星变亮 +20 K 时，有负反馈只升温 9.7 K。',
      '让风化停摆：二氧化碳只进不出，进入失控温室。'],
     's05_elements.png', [('9.7 K', '有反馈的升温（无反馈 20 K）'), ('×1.05', '稳态 CO₂ 浓度')]),
    ('第④幕', '演化与大灭绝', '落点决定谁能留下',
     ['6600 万年前，一颗十公里级小行星飞向地球，落点不同，历史不同。',
      '只有约 13% 的地表富含碳氢化合物与硫，撞在那里烟尘才会遮住天空。',
      '默认推演落在普通岩层：恐龙延续，人类不会出现。'],
     's06_life.png', [('13.0%', '能引发大灭绝的地表'), ('9 个', '球冠标定的沉积区')]),
    ('第⑤幕', '文明动力学', '数百座聚落，自己写历史',
     ['聚落耕作、拓殖、通商；战争与瘟疫沿边境与商路蔓延。',
      '生产力与生产关系的矛盾在每个政体内积累，越过阈值即社会形态更替。',
      '合作 0.6 存活 54%，0.9 升到 77%，0.3 跌到 37%。'],
     's07_civ.png', [('54% → 77%', '合作 0.6 → 0.9 的存活率'), ('500', '每次估计的平行宇宙数')]),
]
for i, (no, title, tagline, items, shot, chips) in enumerate(acts, start=6):
    s = slide()
    header(s, no, title, tagline)
    bullets(s, 0.85, 2.0, 5.3, 3.4, items, size=12, gap=13)
    picture_cover(s, SHOTS / shot, 6.55, 1.95, 5.95, 3.35, border=True)
    chip(s, 6.55, 5.5, 2.9, chips[0][0], chips[0][1])
    chip(s, 9.6, 5.5, 2.9, chips[1][0], chips[1][1])
    footer(s, i, TOTAL)

# ── 11 数据四联 ─────────────────────────────────────────
s = slide()
header(s, '数据', '四张图，四种证据', '全部由作品引擎计算、Python 绘制，可由源码复现。')
plates = [
    ('fig02_l0_island.png', '图 1　可行孤岛：α 与 αs 平面上能留下碳氧的区域'),
    ('fig03_l1_phase.png', '图 2　宜居带：轨道半长轴 × 恒星质量的相位图'),
    ('fig04_thermostat.png', '图 3　恒温器：有/无负反馈时的升温路径'),
    ('fig05_kpg.png', '图 4　K-Pg 沉积区：9 个球冠并集标定到地表 13.0%'),
]
for i, (fig, cap) in enumerate(plates):
    x = 0.85 + (i % 2) * 5.9
    y = 1.95 + (i // 2) * 2.35
    rect(s, x, y, 5.65, 2.2, CARD, radius=0.03, line=RGBColor(0x1E, 0x27, 0x40))
    picture_contain(s, FIGS / fig, x + 0.12, y + 0.08, 5.41, 1.74)
    text(s, x + 0.18, y + 1.88, 5.3, 0.28, cap, size=9, color=MUTED)
footer(s, 11, TOTAL)

# ── 12 终章 ─────────────────────────────────────────────
s = slide()
header(s, '终章', '费米悖论：一万个宇宙，与此刻的地球', '把同一场实验做一万次，看有多少银河系至今沉默。')
picture_cover(s, SHOTS / 's10_finale.png', 0.85, 2.0, 6.3, 3.55, border=True)
picture_contain(s, FIGS / 'fig06_drake.png', 7.5, 1.95, 5.0, 2.4)
metric(s, 7.5, 4.55, 2.3, '51.6', '%', '银河系里找不到\n第二个技术文明')
metric(s, 9.95, 4.55, 2.3, '10⁴', '', '德雷克方程抽样\n不确定性如实传播')
text(s, 0.85, 5.85, 11.6, 0.45, '在这片寂静里，有一个确定的样本——这不是模拟，这是此刻的地球。', size=13, color=CYAN)
footer(s, 12, TOTAL)

# ── 13 技术架构 ─────────────────────────────────────────
s = slide()
header(s, '技术', '确定性内核 + 智能外壳', '大模型只提议，校验闸门把关，所有数值由推演引擎计算。')
layers = [
    ('体验层', '章节导演 · 导览/自由模式 · 认知坐标 · 观测档案', CARD2),
    ('表现层', 'Three.js 场景 · 程序化着色器 · Web Audio', CARD2),
    ('智能层', '意图解析 · 校验闸门 · 检索增强 · 离线兜底', RGBColor(0x1A, 0x14, 0x36)),
    ('模拟层', '纯函数推演引擎（不依赖界面与渲染）', CARD2),
    ('数据层', '参数注册表 · 理论库 · 知识卡 · 旁白', CARD2),
]
for i, (name, desc, col) in enumerate(layers):
    y = 1.95 + i * 0.78
    rect(s, 0.85, y, 7.3, 0.64, col, line=RGBColor(0x1E, 0x27, 0x40))
    text(s, 1.05, y + 0.16, 1.25, 0.35, name, size=12, bold=True, color=CYAN if i == 2 else INK)
    text(s, 2.35, y + 0.19, 5.6, 0.35, desc, size=10.5, color=MUTED)
rect(s, 8.55, 1.95, 3.95, 1.9, CARD)
text(s, 8.8, 2.15, 3.5, 0.35, '提议 → 闸门 → 裁决', size=13, bold=True, color=GOLD)
text(s, 8.8, 2.6, 3.45, 1.5,
     '参数必须在注册表中、类型正确、落在范围内、观众持有钥匙；一次最多 4 项。越界夹回并说明。',
     size=10, color=MUTED, line_spacing=1.45)
rect(s, 8.55, 4.1, 3.95, 1.85, CARD)
text(s, 8.8, 4.3, 3.5, 0.35, '一份数据，多处使用', size=13, bold=True, color=GOLD)
text(s, 8.8, 4.75, 3.45, 1.1, '参数注册表同时驱动滑杆、判定、LLM 校验与文档生成，杜绝“文档与代码对不上”。',
     size=10, color=MUTED, line_spacing=1.45)
footer(s, 13, TOTAL)

# ── 14 可验证 ───────────────────────────────────────────
s = slide()
header(s, '验证', '每个数字都能复算', '模型是示意性的，但计算是真做的：纯函数、有单元测试、可由源码复现。')
picture_contain(s, FIGS / 'fig13_causal.png', 7.0, 1.95, 5.5, 3.7)
bullets(s, 0.85, 2.0, 5.6, 3.4, [
    [('63 项单元测试', {'bold': True, 'color': INK}), ('：公式数值、逐层判定、ABM 确定性、闸门拒绝规则。', {})],
    [('13.0%', {'bold': True, 'color': GOLD}), (' 的 K-Pg 沉积区用 4 万个采样点标定，与文献一致。', {})],
    [('51.6%', {'bold': True, 'color': GOLD}), (' 由 10 000 次蒙特卡洛抽样得到，不是写死的文案。', {})],
    [('三条命令复现', {'bold': True, 'color': INK}), ('：npm test / npm run build / npm run docs。', {})],
], size=11.5, gap=14)
text(s, 0.85, 5.6, 5.7, 0.8, '同一宇宙编号，永远得到同一部编年史——评委可以交叉核对。',
     size=12, color=CYAN, line_spacing=1.4)
footer(s, 14, TOTAL)

# ── 15 工程与交付 ───────────────────────────────────────
s = slide()
header(s, '工程', '一个 HTML 文件，双击就能跑', '展厅、机房、教室都不一定联网，所以作品把一切都带在身上。')
cols = [
    ('1.7 MB', '单文件交付', '脚本、字体子集、NASA 影像、worker 全部内联；运行时零网络请求。'),
    ('0 依赖', '运行时', '不加载任何 CDN；three.js 打包进同一个文件。'),
    ('3 档', '画质自适应', '连续两秒低于 38 fps 自动降档；离屏暂停渲染。'),
    ('1 条', '构建命令', 'npm run build：类型检查后产出单个 HTML，约 470 毫秒。'),
]
for i, (v, t, d) in enumerate(cols):
    x = 0.85 + (i % 2) * 5.95
    y = 1.95 + (i // 2) * 2.2
    rect(s, x, y, 5.5, 1.9, CARD)
    text(s, x + 0.3, y + 0.28, 2.1, 0.5, v, size=24, bold=True, color=GOLD)
    text(s, x + 2.45, y + 0.33, 2.8, 0.3, t, size=12, bold=True, color=INK)
    text(s, x + 0.3, y + 0.95, 4.9, 0.8, d, size=10.5, color=MUTED, line_spacing=1.35)
footer(s, 15, TOTAL)

# ── 16 创新点 ───────────────────────────────────────────
s = slide()
header(s, '创新', '四个不只是“好看”的设计决定')
cards = [
    ('01', '知识即权限', '用钥匙机制组织整场体验：理解了才能改，学习成为探索的动力。', CYAN),
    ('02', '真实模型驱动叙事', '每一次失败都来自引擎计算结果，可复现、可核验，不是预设动画。', GOLD),
    ('03', 'LLM 提议，模型裁决', '大模型无法编造数字；闸门与离线兜底让 AI 交互既开放又可靠。', VIOLET),
    ('04', '理论落到机制', '生产力与生产关系、必然与偶然、历史合力，都做成可操作的参量。', CYAN),
]
for i, (n, t, d, col) in enumerate(cards):
    x = 0.85 + (i % 2) * 5.95
    y = 1.95 + (i // 2) * 2.25
    rect(s, x, y, 5.5, 1.95, CARD)
    text(s, x + 0.3, y + 0.22, 0.6, 0.4, [(n, {'size': 16, 'bold': True, 'color': col})], size=16)
    text(s, x + 0.95, y + 0.24, 4.2, 0.35, t, size=14, bold=True, color=INK)
    text(s, x + 0.3, y + 0.92, 4.95, 0.85, d, size=10.5, color=MUTED, line_spacing=1.4)
footer(s, 16, TOTAL)

# ── 17 应用 ─────────────────────────────────────────────
s = slide()
header(s, '应用', '同一件作品，四种打开方式')
apps = [
    ('科技馆 · 天文馆', '导览模式 5 分 10 秒自动播放，大屏循环；自由模式适合触摸屏展台。', 's01_hall.png'),
    ('课堂', '按学段分五档讲解深度，同一现象对不同年级给不同解释。', 's11_glossary.png'),
    ('思政课', '第⑤幕与终章讨论“必然与自由”“人与自然”。', 's09_civ_night.png'),
    ('网络传播', '单文件即网页；留言化作一颗星，形成可分享的“我的宇宙”。', 's10_finale.png'),
]
for i, (t, d, img) in enumerate(apps):
    x = 0.85 + (i % 2) * 5.95
    y = 1.9 + (i // 2) * 2.4
    picture_cover(s, SHOTS / img, x, y, 2.55, 2.15, border=True)
    text(s, x + 2.75, y + 0.12, 2.7, 0.35, t, size=13, bold=True, color=GOLD)
    text(s, x + 2.75, y + 0.58, 2.7, 1.4, d, size=9.5, color=MUTED, line_spacing=1.4)
footer(s, 17, TOTAL)

# ── 18 分工与 AI 边界 ───────────────────────────────────
s = slide()
header(s, '分工与披露', '团队做了什么，AI 做了什么')
rect(s, 0.85, 1.9, 5.6, 1.55, CARD)
text(s, 1.1, 2.1, 5.0, 0.35, [('成员A（队长）', {'size': 13, 'bold': True, 'color': GOLD})], size=13)
text(s, 1.1, 2.55, 5.1, 0.85, '选题与作品方向、技术路线、五轮审计意见、章节与旁白审定、视频画面与解说口径。',
     size=10.5, color=MUTED, line_spacing=1.45)
rect(s, 6.9, 1.9, 5.6, 1.55, CARD)
text(s, 7.15, 2.1, 5.0, 0.35, [('成员B（队员）', {'size': 13, 'bold': True, 'color': GOLD})], size=13)
text(s, 7.15, 2.55, 5.1, 0.85, '内容与文案审校、参数与文献核对、测试验收与材料检查。',
     size=10.5, color=MUTED, line_spacing=1.45)
rect(s, 0.85, 3.7, 11.65, 1.55, CARD2, line=RGBColor(0x1E, 0x27, 0x40))
text(s, 1.1, 3.9, 11.2, 0.35, [('人工智能工具的使用', {'size': 12.5, 'bold': True, 'color': CYAN})], size=12.5)
text(s, 1.1, 4.3, 11.15, 0.9,
     '团队先人工搭框架、写示例，AI 按样板批量生成重复性代码，团队逐条校验；文档封面图由 ChatGPT 生成，演示视频解说由 Cloud TTS 合成。'
     '运行时的大模型只负责把问题翻译成参数提议，数值全部由引擎计算，详见《人工智能工具使用说明》。',
     size=10, color=MUTED, line_spacing=1.45)
text(s, 0.85, 5.6, 11.6, 0.4, '以上分工与审计意见逐条记录在《决策日志》，可在源码仓库中核对。', size=10, color=DIM)
footer(s, 18, TOTAL)

# ── 19 结尾 ─────────────────────────────────────────────
s = slide()
s.shapes.add_picture(str(ASSETS / 'closing_bg.png'), 0, 0, prs.slide_width, prs.slide_height)
text(s, 0.9, 2.2, 11.5, 0.4, [('创世纪元 · AI 文明诞生概率实验室', {'size': 11, 'color': MUTED, 'spc': 200})], size=11)
text(s, 0.9, 2.75, 11.5, 0.8, '文明诞生是低概率的奇迹；', size=30, bold=True, color=INK)
text(s, 0.9, 3.55, 11.5, 0.8, '未来的钥匙，握在每一个人手里。', size=30, bold=True, color=INK)
text(s, 0.9, 4.85, 11.5, 0.45, '未来之钥，交给你。', size=18, color=GOLD)
text(s, 0.9, 6.3, 11.5, 0.35, '单文件 HTML，双击即可离线运行；导览约 5 分 10 秒。', size=10.5, color=MUTED)
footer(s, 19, TOTAL)

prs.save(OUT)
print(f'{len(prs.slides._sldIdLst)} slides -> {OUT}')
