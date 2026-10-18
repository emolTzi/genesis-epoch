# 作品介绍文档的技术图：读取 scripts/figdata.ts 导出的引擎数据，统一深空科技风格绘制。
#   python scripts/figures.py  →  docs/submission/figs/*.png
import json
import math
import pathlib

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib import font_manager
from matplotlib.patches import FancyArrowPatch, Circle, Rectangle
import numpy as np
import networkx as nx

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'docs' / 'submission' / 'data'
FIGS = ROOT / 'docs' / 'submission' / 'figs'
FIGS.mkdir(parents=True, exist_ok=True)

# ───── 风格 ─────
for f in ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/msyhbd.ttc']:
    try:
        font_manager.fontManager.addfont(f)
    except Exception:
        pass
BG = '#060810'
PANEL = '#0a0d1b'
INK = '#e3e6f4'
INK2 = '#a3a9c9'
INK3 = '#6c7293'
GRID = '#1e2440'
GOLD = '#f5c66b'
CYAN = '#3ff2e6'
RED = '#ff6152'
VIOLET = '#a497ff'
GREEN = '#8be28f'
BLUE = '#5aa9ff'
plt.rcParams.update({
    'font.family': ['Microsoft YaHei', 'DejaVu Sans'],
    'axes.unicode_minus': False,
    'figure.facecolor': BG, 'axes.facecolor': PANEL, 'savefig.facecolor': BG,
    'axes.edgecolor': '#2a3157', 'axes.labelcolor': INK2, 'axes.titlecolor': INK,
    'xtick.color': INK3, 'ytick.color': INK3, 'text.color': INK,
    'axes.grid': True, 'grid.color': GRID, 'grid.linewidth': 0.6, 'grid.alpha': 0.9,
    'axes.titlesize': 11.5, 'axes.titleweight': 'bold', 'axes.labelsize': 9.5,
    'xtick.labelsize': 8.5, 'ytick.labelsize': 8.5, 'legend.fontsize': 8.5,
    'legend.facecolor': '#0d1124', 'legend.edgecolor': '#2a3157', 'legend.framealpha': 0.9,
    'mathtext.fontset': 'dejavusans',
})


def load(name):
    return json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))


def tag(ax, s):
    ax.text(0.012, 0.985, s, transform=ax.transAxes, ha='left', va='top', fontsize=10, color=CYAN, fontweight='bold',
            bbox=dict(boxstyle='round,pad=0.25', fc='#0d1124', ec='#2a3157', lw=0.8))


def foot(fig, s):
    fig.text(0.995, 0.006, s, ha='right', va='bottom', fontsize=7.5, color=INK3)


def save(fig, name):
    foot(fig, '数据：《创世纪元》推演引擎实算 · 可复现')
    fig.savefig(FIGS / f'{name}.png', dpi=220)
    plt.close(fig)
    print('fig', name)


def corner_glow(ax):
    for s in ax.spines.values():
        s.set_linewidth(0.9)


# ───── 图 1：六层概率筛选 ─────
def fig_funnel():
    lad = load('ladder')['fractions']
    names = ['L0 物理常数', 'L1 天体', 'L2 行星化学', 'L3 生命', 'L4 文明']
    vals = [1.0] + lad
    fig = plt.figure(figsize=(10, 4.6))
    ax = fig.add_axes([0.06, 0.12, 0.6, 0.78])
    x = np.arange(len(vals))
    lv = np.log10(vals)
    ax.fill_between(x, lv, -6, color=CYAN, alpha=0.08, step=None)
    ax.plot(x, lv, color=CYAN, lw=2.2, marker='o', ms=7, mfc=BG, mec=CYAN, mew=2)
    for i, v in enumerate(vals):
        lab = '全部参数组合' if i == 0 else (f'1/{1 / v:,.0f}' if v < 0.1 else f'{v * 100:.0f}%')
        ax.annotate(lab, (i, lv[i]), xytext=(0, 12), textcoords='offset points', ha='center', fontsize=9, color=GOLD if i else INK)
    ax.set_xticks(x, ['参数空间'] + names, rotation=0)
    ax.set_ylim(-6, 0.8)
    ax.set_yticks(range(-6, 1), [f'10$^{{{k}}}$' for k in range(-6, 1)])
    ax.set_ylabel('能走过该层的比例（对数）')
    ax.set_title('六层宇宙的概率筛选：参数空间均匀抽样 12 000 次', loc='left')
    tag(ax, 'a')
    # 右侧：每层的条件通过率
    ax2 = fig.add_axes([0.72, 0.12, 0.26, 0.78])
    cond = [vals[i + 1] / vals[i] for i in range(len(vals) - 1)]
    cols = [CYAN, BLUE, VIOLET, GOLD, RED]
    ax2.barh(range(len(cond))[::-1], cond, color=cols, alpha=0.85, height=0.62)
    for i, c in enumerate(cond):
        ax2.text(c + 0.02, len(cond) - 1 - i, f'{c * 100:.1f}%', va='center', fontsize=8.5, color=INK)
    ax2.set_yticks(range(len(cond))[::-1], names)
    ax2.set_xlim(0, 1.15)
    ax2.set_xlabel('条件通过率（在上一层通过的前提下）')
    ax2.set_title('逐层条件概率', loc='left')
    tag(ax2, 'b')
    save(fig, 'fig01_funnel')


# ───── 图 2：L0 可行孤岛 ─────
def fig_l0():
    d = load('l0')
    A = np.array(d['alpha'])
    S = np.array(d['alphas'])
    G = np.array(d['grid'])
    fig = plt.figure(figsize=(10, 5.2))
    ax = fig.add_axes([0.07, 0.11, 0.5, 0.8])
    # 用到“孤岛中心”的距离做一层伪三维光照，突出可行区
    AA, SS = np.meshgrid(A, S)
    r = np.sqrt((AA / 4) ** 2 + (SS / 0.5) ** 2)
    field = np.exp(-r ** 2 * 0.9)
    ax.imshow(field, extent=[A[0], A[-1], S[0], S[-1]], origin='lower', aspect='auto', cmap=mcolors.LinearSegmentedColormap.from_list('g', [PANEL, '#123a4a', CYAN]), alpha=0.9)
    ax.contour(A, S, G, levels=[0.5], colors=[GOLD], linewidths=2)
    ax.contourf(A, S, G, levels=[0.5, 2.5], colors=[RED], alpha=0.18)
    ax.plot([0], [0], marker='*', ms=16, color=GOLD, mec=BG)
    ax.annotate('我们的宇宙', (0, 0), xytext=(1.2, 1.2), color=GOLD, fontsize=9, arrowprops=dict(arrowstyle='-', color=GOLD, lw=0.8))
    for v in [-4, 4]:
        ax.axvline(v, color=GOLD, lw=0.7, ls='--', alpha=0.6)
    for v in [-0.5, 0.5]:
        ax.axhline(v, color=GOLD, lw=0.7, ls='--', alpha=0.6)
    ax.text(-9.6, 4.4, '碳或氧几乎消失（红色区域）', color=RED, fontsize=8.5)
    ax.text(4.2, -4.6, 'Δα = ±4%', color=GOLD, fontsize=8)
    ax.text(-9.6, 0.6, 'Δα$_s$ = ±0.5%', color=GOLD, fontsize=8)
    ax.set_xlabel('精细结构常数偏移 Δα/α（%）')
    ax.set_ylabel('强相互作用偏移 Δα$_s$/α$_s$（%）')
    ax.set_title('L0 可行孤岛：只有极窄的常数组合能同时产出碳与氧', loc='left')
    tag(ax, 'a')
    ax2 = fig.add_axes([0.64, 0.56, 0.34, 0.35])
    L = np.array(d['lambda'])
    st = np.array(d['lambdaStatus'])
    ax2.fill_between(L, 0, 1, where=st == 0, color=CYAN, alpha=0.35, step='mid', label='星系可以形成')
    ax2.fill_between(L, 0, 1, where=st == 2, color=RED, alpha=0.35, step='mid', label='星系无法形成')
    ax2.axvline(1, color=GOLD, lw=1.5)
    ax2.text(1.2, 0.85, '现值', color=GOLD, fontsize=8)
    ax2.set_xscale('log')
    ax2.set_yticks([])
    ax2.set_xlabel('宇宙学常数 Λ/Λ₀')
    ax2.set_title('宇宙学常数的示意上限（100 倍）', loc='left', fontsize=10)
    ax2.legend(loc='lower left', fontsize=7.5)
    tag(ax2, 'b')
    ax3 = fig.add_axes([0.64, 0.11, 0.34, 0.33])
    ax3.axis('off')
    ax3.text(0, 0.95, '三阿尔法过程与霍伊尔态', fontsize=10, fontweight='bold', color=INK, va='top')
    lines = [r'$3\,^4\mathrm{He} \rightarrow\, ^8\mathrm{Be} + ^4\mathrm{He} \rightarrow\, ^{12}\mathrm{C}^{*}(0^+_2,\ 7.654\ \mathrm{MeV})$',
             r'$^{12}\mathrm{C} + ^4\mathrm{He} \rightarrow\, ^{16}\mathrm{O} + \gamma$',
             r'$\Delta E_R \propto \Delta\alpha_s,\ \Delta\alpha$：共振能级偏移 → 碳氧产率指数变化',
             '判据：|Δα$_s$| ≤ 0.5% 且 |Δα| ≤ 4%（Oberhummer 等，2000）']
    for i, s in enumerate(lines):
        ax3.text(0, 0.72 - i * 0.22, s, fontsize=8.6, color=INK2 if i < 3 else GOLD, va='top')
    save(fig, 'fig02_l0_island')


# ───── 图 3：恒星质量 × 轨道 ─────
def fig_l1():
    d = load('l1')
    M = np.array(d['mass'])
    A = np.array(d['orbit'])
    C = np.array(d['cls'])
    T = np.array(d['temp'], dtype=float) - 273.15
    labels = d['labels']
    pal = {'通过': CYAN, '通过（警示）': '#2a8f8a', '冰封': '#9ec9ff', '蒸干': '#ff8a3d', '恒星寿命太短': VIOLET, '失控温室': RED, '雪球行星': '#d7e6ff', '永久冰封': '#bcd6ff', '温室失控': '#ff4b3e', '大气逃逸': '#8a8fa8', '厚重气态包层': '#c79a5c'}
    cols = [pal.get(l, '#555b7a') for l in labels]
    cmap = mcolors.ListedColormap(cols)
    fig = plt.figure(figsize=(10.5, 5.6))
    ax = fig.add_axes([0.07, 0.11, 0.62, 0.8])
    ax.pcolormesh(A, M, C, cmap=cmap, vmin=-0.5, vmax=len(labels) - 0.5, shading='nearest', alpha=0.78)
    Tm = np.ma.masked_invalid(T)
    cs = ax.contour(A, M, Tm, levels=[-50, 0, 15, 50, 100], colors=[INK], linewidths=0.7, alpha=0.75)
    ax.clabel(cs, fmt=lambda v: f'{v:.0f}°C', fontsize=7.5, colors=INK)
    # 保守宜居带：S_eff = 1.015 / 0.356，L ∝ M^4（0.43–2 M☉）
    def lum(m):
        return np.where(m < 0.43, 0.23 * m ** 2.3, np.where(m < 2, m ** 4, 1.4 * m ** 3.5))
    Lm = lum(M)
    ax.plot(np.sqrt(Lm / 1.015), M, color=GOLD, lw=1.6, ls='--')
    ax.plot(np.sqrt(Lm / 0.356), M, color=GOLD, lw=1.6, ls='--')
    ax.text(0.62, 1.86, '保守宜居带\nS$_{eff}$ = 1.015 … 0.356', color=GOLD, fontsize=8.5)
    ax.plot([1], [1], marker='*', ms=15, color=GOLD, mec=BG)
    ax.annotate('地球 · 太阳', (1, 1), xytext=(1.4, 0.72), color=GOLD, fontsize=9, arrowprops=dict(arrowstyle='-', color=GOLD, lw=0.8))
    ax.set_xscale('log')
    ax.set_xlabel('轨道半长轴 a（AU，对数）')
    ax.set_ylabel('恒星质量 M★（M☉）')
    ax.set_title('L1×L2 判定相图：19 200 个（恒星，轨道）组合逐点推演', loc='left')
    tag(ax, 'a')
    lax = fig.add_axes([0.72, 0.11, 0.26, 0.8])
    lax.axis('off')
    lax.text(0, 1, '判定类别', fontsize=10, fontweight='bold', va='top')
    for i, (l, c) in enumerate(zip(labels, cols)):
        n = int((C == i).sum())
        lax.add_patch(Rectangle((0, 0.9 - i * 0.07), 0.07, 0.045, color=c, alpha=0.85, transform=lax.transAxes))
        lax.text(0.1, 0.92 - i * 0.07, f'{l}  ({n / C.size * 100:.1f}%)', fontsize=8.5, color=INK2, va='center', transform=lax.transAxes)
    y0 = 0.9 - len(labels) * 0.07 - 0.05
    for i, s in enumerate([r'$T_{eq} = \left[\dfrac{L_\star(1-A)}{16\pi\sigma a^2}\right]^{1/4}$', r'$L_\star \approx M_\star^{4}\ (0.43\text{–}2\,M_\odot)$', r'$t_{MS} \approx 10\,\mathrm{Gyr}\cdot M/L$', '等值线：稳态地表温度（°C）']):
        lax.text(0, y0 - i * 0.085, s, fontsize=9 if i < 3 else 8.5, color=INK if i < 3 else INK3, va='top', transform=lax.transAxes)
    save(fig, 'fig03_l1_phase')


# ───── 图 4：行星恒温器 ─────
def fig_thermo():
    d = load('thermo')
    T = np.array(d['teq'])
    fig = plt.figure(figsize=(11, 4.4))
    ax = fig.add_axes([0.05, 0.13, 0.28, 0.75])
    for i, s in enumerate(d['sweeps']):
        ax.plot(T, np.array(s['temp']) - 273.15, color=plt.cm.cool(i / 4), lw=1, alpha=0.6, label=f'脱气 ×{s["outgassing"]}')
    ax.plot(T, np.array(d['noFb']) - 273.15, color=RED, lw=2, ls='--', label='无反馈（CO₂ 固定）')
    ax.plot(T, np.array(d['fbTemp']) - 273.15, color=CYAN, lw=2.4, label='有反馈（地球）')
    ax.axhspan(0, 100, color=CYAN, alpha=0.05)
    ax.axvline(254.6, color=GOLD, lw=0.8, ls=':')
    ax.text(256, -60, '地球 T$_{eq}$ = 254.6 K', color=GOLD, fontsize=8)
    ax.set_xlabel('平衡温度 T$_{eq}$（K）')
    ax.set_ylabel('稳态地表温度（°C）')
    ax.set_ylim(-80, 120)
    ax.set_title('负反馈压平了温度曲线', loc='left')
    ax.legend(loc='lower right', fontsize=7)
    tag(ax, 'a')
    ax2 = fig.add_axes([0.37, 0.13, 0.25, 0.75])
    tg = np.array(d['gridT'])
    lc = np.array(d['gridLogC'])
    W = np.array(d['logW'])
    im = ax2.contourf(tg - 273.15, lc, W, levels=30, cmap=mcolors.LinearSegmentedColormap.from_list('w', ['#0b1b3a', '#174a6b', CYAN, GOLD]))
    ax2.contour(tg - 273.15, lc, W, levels=[0], colors=[RED], linewidths=2)
    ax2.text(-18, -2.6, 'W = V（火山补给 = 风化移除）', color=RED, fontsize=8)
    e = d['earth']
    ax2.plot([e['temp'] - 273.15], [math.log10(e['co2'])], marker='*', ms=13, color=GOLD, mec=BG)
    ax2.set_xlabel('地表温度（°C）')
    ax2.set_ylabel('log$_{10}$ pCO$_2$/p$_0$')
    ax2.set_title('风化速率场 log$_{10}$W(T, pCO$_2$)', loc='left')
    cb = fig.colorbar(im, ax=ax2, fraction=0.05, pad=0.02)
    cb.ax.tick_params(labelsize=7)
    tag(ax2, 'b')
    ax3 = fig.add_axes([0.745, 0.13, 0.24, 0.75])
    r = d['resp']
    t = np.array(r['t'])
    ax3.plot(t, np.array(r['withoutFeedback']) - 273.15, color=RED, lw=2, ls='--', label='无反馈')
    ax3.plot(t, np.array(r['withFeedback']) - 273.15, color=CYAN, lw=2.4, label='有反馈')
    ax3.axvline(0, color=GOLD, lw=0.8, ls=':')
    ax3.text(2, ax3.get_ylim()[0] + 1, '恒星变亮 ΔT$_{eq}$ = +20 K', color=GOLD, fontsize=8)
    ax3.set_xlabel('时间（示意单位：百万年）')
    ax3.set_ylabel('地表温度（°C）')
    ax3.set_title('扰动响应：升温被削减一半以上', loc='left')
    ax3.legend(loc='lower right', fontsize=7.5)
    tag(ax3, 'c')
    fig.text(0.05, 0.955, r'$W = W_0\,(p\mathrm{CO_2}/p_0)^{0.3}\,e^{(T-288\,\mathrm{K})/13.7\,\mathrm{K}}$      $T = T_{eq} + 33\,\mathrm{K} + 3\,\mathrm{K}\cdot\log_2(p\mathrm{CO_2}/p_0)$      稳态：$V = W$，二分法求解',
             fontsize=9.5, color=GOLD)
    save(fig, 'fig04_thermostat')


# ───── 图 5：K-Pg 沉积区 ─────
def fig_kpg():
    d = load('kpg')
    G = np.array(d['grid'])
    lat = np.array(d['lat'])
    lon = np.array(d['lon'])
    fig = plt.figure(figsize=(10.5, 5))
    ax = fig.add_axes([0.05, 0.1, 0.7, 0.8])
    LON, LAT = np.meshgrid(lon, lat)
    ax.imshow(np.cos(np.radians(LAT)) * 0.4 + 0.2 * np.sin(np.radians(LON) * 3) * np.cos(np.radians(LAT) * 2), extent=[-180, 180, -90, 90], origin='lower', cmap=mcolors.LinearSegmentedColormap.from_list('o', ['#06101f', '#0c2340']), aspect='auto')
    ax.contourf(lon, lat, G, levels=[0.5, 1.5], colors=[GOLD], alpha=0.55)
    ax.contour(lon, lat, G, levels=[0.5], colors=[GOLD], linewidths=1.2)
    for i, c in enumerate(d['caps']):
        v = c.get('dir')
        if v is None:
            continue
        la = math.degrees(math.asin(max(-1, min(1, v[1]))))
        lo = math.degrees(math.atan2(v[2], v[0]))
        ax.plot(lo, la, marker='+', ms=9, color=RED, mew=1.6)
    rng = np.random.default_rng(66)
    pts = rng.normal(size=(600, 3))
    pts /= np.linalg.norm(pts, axis=1, keepdims=True)
    las = np.degrees(np.arcsin(pts[:, 1]))
    los = np.degrees(np.arctan2(pts[:, 2], pts[:, 0]))
    ax.scatter(los, las, s=3, color=CYAN, alpha=0.5, lw=0)
    ax.set_xlim(-180, 180)
    ax.set_ylim(-90, 90)
    ax.set_xlabel('经度（°）')
    ax.set_ylabel('纬度（°）')
    ax.set_title(f'K-Pg 撞击沉积区：9 个确定性球冠，面积标定为地表 {d["fraction"] * 100:.1f}%', loc='left')
    tag(ax, 'a')
    ax2 = fig.add_axes([0.79, 0.1, 0.19, 0.8])
    ax2.axis('off')
    txt = ['金色：富含碳氢化合物与硫的沉积区', '红色十字：球冠中心', '青色点：随机撞击点抽样（600 个）', '',
           '标定方法', '4 万个固定采样点估计并集面积', '二分搜索公共角半径', f'→ 面积 {d["fraction"] * 100:.2f}% ≈ 13%', '',
           '依据', 'Kaiho & Oshima 2017', 'Sci. Rep. 7:14855']
    for i, s in enumerate(txt):
        ax2.text(0, 0.98 - i * 0.075, s, fontsize=8.5, color=GOLD if s in ('标定方法', '依据') else INK2, fontweight='bold' if s in ('标定方法', '依据') else 'normal', va='top')
    save(fig, 'fig05_kpg')


# ───── 图 6：德雷克方程蒙特卡洛 ─────
def fig_drake():
    d = load('drake')
    N = np.clip(np.array(d['N']), -60, 12)
    fig = plt.figure(figsize=(11, 5.2))
    ax = fig.add_axes([0.05, 0.12, 0.42, 0.78])
    bins = np.linspace(-60, 12, 145)
    h, e = np.histogram(N, bins=bins)
    cen = (e[:-1] + e[1:]) / 2
    ax.bar(cen, h, width=e[1] - e[0], color=np.where(cen < 0, RED, CYAN), alpha=0.8)
    ax.axvline(0, color=GOLD, lw=1.6)
    ax.text(0.8, h.max() * 0.92, 'N = 1', color=GOLD, fontsize=9)
    ax.text(-58, h.max() * 0.92, f'N < 1：{d["aloneFraction"] * 100:.1f}%\n银河系中此刻没有第二个技术文明', color=RED, fontsize=9)
    ax.set_xlabel('log$_{10}$ N（银河系中可探测的技术文明数）')
    ax.set_ylabel('宇宙数（10 000 次抽样）')
    ax.set_title('一万个宇宙：N 的分布跨越数十个数量级', loc='left')
    tag(ax, 'a')
    keys = [('Rstar', 'R★ 恒星形成率'), ('fp', 'f$_p$ 有行星'), ('ne', 'n$_e$ 宜居行星'), ('fl', 'f$_l$ 生命起源'), ('fi', 'f$_i$ 智能'), ('fc', 'f$_c$ 技术'), ('L', 'L 文明寿命')]
    for i, (k, nm) in enumerate(keys):
        r, c = divmod(i, 3)
        a = fig.add_axes([0.53 + c * 0.155, 0.62 - r * 0.25, 0.13, 0.17])
        v = np.clip(np.array(d[k]), -30 if k == 'fl' else -12, 12)
        a.hist(v, bins=40, color=[CYAN, BLUE, VIOLET, RED, GOLD, GREEN, '#ff9bd6'][i], alpha=0.85)
        a.set_title(nm, fontsize=8.5, loc='left')
        a.tick_params(labelsize=6.5)
        a.set_yticks([])
    a = fig.add_axes([0.53 + 1 * 0.155, 0.12, 0.29, 0.17])
    a.axis('off')
    a.text(0, 0.9, r'$N = R_\star\, f_p\, n_e\, f_l\, f_i\, f_c\, L$', fontsize=12, color=GOLD, va='top')
    a.text(0, 0.45, r'$f_l = 1 - e^{-\lambda V t},\ \ \log_{10}\lambda V t \sim \mathcal{N}(0,\,50)$', fontsize=9.5, color=INK2, va='top')
    a.text(0, 0.05, '其余因子在文献区间内对数均匀抽样（Sandberg 等，2018）', fontsize=8, color=INK3, va='top')
    fig.text(0.53, 0.92, '(b) 七个因子的抽样分布（log$_{10}$）', fontsize=10, color=CYAN, fontweight='bold')
    save(fig, 'fig06_drake')


# ───── 图 7：洛伦兹双轨迹 ─────
def fig_lorenz():
    d = load('lorenz')
    a = np.array(d['a'])
    b = np.array(d['b'])
    t = np.array(d['t'])
    dist = np.array(d['d'])
    fig = plt.figure(figsize=(11, 4.8))
    ax = fig.add_axes([0.02, 0.06, 0.36, 0.86], projection='3d')
    ax.set_facecolor(PANEL)
    n = len(a)
    k = int(n * 0.9)
    ax.plot(a[:k, 0], a[:k, 1], a[:k, 2], color=GOLD, lw=0.5, alpha=0.9)
    ax.plot(b[:k, 0], b[:k, 1], b[:k, 2], color=CYAN, lw=0.5, alpha=0.7)
    for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
        axis.set_pane_color((0.04, 0.05, 0.1, 1))
        axis.line.set_color('#2a3157')
    ax.tick_params(labelsize=6.5, colors=INK3)
    ax.view_init(18, -58)
    ax.set_title('(a) 洛伦兹吸引子：两条轨迹初值只差 10$^{-6}$', loc='left', fontsize=10.5, color=INK)
    ax2 = fig.add_axes([0.45, 0.15, 0.25, 0.72])
    ax2.plot(t, a[:, 0], color=GOLD, lw=0.8, label='你')
    ax2.plot(t, b[:, 0], color=CYAN, lw=0.8, alpha=0.8, label='另一个你')
    ax2.set_xlim(0, 40)
    ax2.set_xlabel('时间 t')
    ax2.set_ylabel('x(t)')
    ax2.set_title('x 分量：约 t ≈ 20 后分道扬镳', loc='left')
    ax2.legend(loc='upper left', fontsize=7.5)
    tag(ax2, 'b')
    ax3 = fig.add_axes([0.76, 0.15, 0.22, 0.72])
    ax3.semilogy(t, dist, color=VIOLET, lw=1)
    m = t < 20
    ax3.semilogy(t[m], 1e-6 * np.exp(d['lambda'] * t[m]), color=GOLD, lw=1.6, ls='--', label=f'e$^{{\\lambda t}}$，λ = {d["lambda"]:.3f}')
    ax3.set_xlabel('时间 t')
    ax3.set_ylabel('|δ(t)|')
    ax3.set_title(f'误差指数增长（拟合 λ = {d["fit"]:.3f}）', loc='left')
    ax3.legend(loc='lower right', fontsize=7.5)
    tag(ax3, 'c')
    fig.text(0.45, 0.94, r'$\dot x = \sigma(y-x),\ \ \dot y = x(\rho - z) - y,\ \ \dot z = xy - \beta z;\ \ \sigma=10,\ \rho=28,\ \beta=8/3$；RK4，h = 0.005', fontsize=9, color=GOLD)
    save(fig, 'fig07_lorenz')


# ───── 图 8：文明沙盘快照 ─────
BIOME = ['#0a1d3a', '#15587a', '#dfe8f2', '#8e9c8c', '#6f9a40', '#2f6a39', '#caa86a', '#81786e']


def draw_snapshot(ax, s, W, H, title):
    biome = np.array(s['biome']).reshape(H, W)
    owner = np.array(s['owner']).reshape(H, W)
    rgb = np.array([mcolors.to_rgb(BIOME[b]) for b in biome.ravel()]).reshape(H, W, 3)
    elev = np.array(s['elev']).reshape(H, W)
    shade = np.clip(0.75 + (elev - s['sea']) * 0.9, 0.55, 1.15)
    rgb = np.clip(rgb * shade[..., None], 0, 1)
    hues = s['hues']
    tint = np.zeros_like(rgb)
    mask = owner >= 0
    for i, hval in enumerate(hues):
        c = mcolors.hsv_to_rgb([hval, 0.75, 0.95])
        tint[owner == i] = c
    border = np.zeros_like(mask)
    border[:, 1:] |= owner[:, 1:] != owner[:, :-1]
    border[1:, :] |= owner[1:, :] != owner[:-1, :]
    border &= mask
    rgb = np.where(mask[..., None], rgb * 0.78 + tint * 0.22, rgb)
    rgb = np.where(border[..., None], rgb * 0.35 + tint * 0.65, rgb)
    ax.imshow(rgb, extent=[0, W, H, 0], interpolation='nearest')
    for r in s['routes']:
        ax.plot([r['a'][0] + 0.5, r['b'][0] + 0.5], [r['a'][1] + 0.5, r['b'][1] + 0.5], color=CYAN if r['sea'] else GOLD, lw=0.25 + min(1.2, r['vol'] * 0.6), alpha=0.55)
    for front in s['wars']:
        for c in front[::2]:
            ax.plot(c % W + 0.5, c // W + 0.5, marker='o', ms=2.2, color=RED, alpha=0.8, lw=0)
    for st in s['settlements']:
        sz = 2 + 6 * math.log10(1 + st['pop'])
        col = '#555' if st['ruined'] else ('#9dff6a' if st['plague'] else '#fff2c8')
        ax.plot(st['x'] + 0.5, st['y'] + 0.5, marker='h', ms=sz * 0.55, color=col, mec=BG, mew=0.3)
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.grid(False)
    ax.set_title(title, loc='left', fontsize=10)


def fig_sandbox_maps():
    d = load('sandbox')
    W, H = d['W'], d['H']
    eras = ['农耕', '青铜与文字', '铁器', '印刷与远航', '蒸汽', '电力', '核能', '信息', '人工智能']
    fig = plt.figure(figsize=(11, 7.4))
    snaps = d['snaps'][:4]
    for i, s in enumerate(snaps):
        r, c = divmod(i, 2)
        ax = fig.add_axes([0.02 + c * 0.49, 0.47 - r * 0.455, 0.47, 0.4])
        n = len(s['settlements'])
        draw_snapshot(ax, s, W, H, f'({"abcd"[i]}) 第 {s["t"]} 步 · 纪年 {s["year"]} · {eras[s["era"]]}时代 · {n} 座聚落 · {len(s["routes"])} 条商路')
    fig.text(0.02, 0.972, '微观文明沙盘（宇宙编号 2026，默认参量）：72×44 格大陆上的聚落拓殖、商路、疆域与前线', fontsize=11.5, fontweight='bold')
    fig.text(0.02, 0.942, '底色：生物群系（深海、浅海、冰原、苔原、草原、森林、荒漠、山地）·  叠色：政体疆域与边界  ·  六边形：聚落（大小 ∝ log 人口）·  金线：陆上商路  ·  青线：海路  ·  红点：战争前线', fontsize=8.2, color=INK2)
    save(fig, 'fig08_sandbox_maps')


def fig_sandbox_series():
    d = load('sandbox')
    s = d['series']
    t = np.arange(len(s['pop']))
    fig = plt.figure(figsize=(11, 6.6))
    ax1 = fig.add_axes([0.07, 0.69, 0.42, 0.24])
    ax1.semilogy(t, np.maximum(1e-3, s['pop']), color=GOLD, lw=1.6)
    ax1.set_ylabel('世界人口（万）')
    ax1.set_title('人口：逻辑斯谛增长 × 技术抬升承载力', loc='left')
    tag(ax1, 'a')
    ax2 = fig.add_axes([0.56, 0.69, 0.42, 0.24])
    ax2.semilogy(t, np.maximum(1, s['P']), color=GOLD, lw=1.8, label='生产力 P')
    ax2.semilogy(t, np.maximum(1, s['R']), color=CYAN, lw=1.2, label='生产关系容量 R')
    ax2.set_title('世界平均的 P 与 R（人口加权）', loc='left')
    ax2.legend(loc='upper left', fontsize=7.5)
    tag(ax2, 'b')
    ax3 = fig.add_axes([0.07, 0.38, 0.42, 0.24])
    ax3.fill_between(t, 0, s['C'], color=RED, alpha=0.25)
    ax3.plot(t, s['C'], color=RED, lw=0.9, label='平均矛盾 C')
    ax3.plot(t, s['E'], color=VIOLET, lw=1.6, label='人与自然张力 E')
    ax3.axhline(0.6, color=GOLD, lw=0.8, ls='--')
    ax3.text(5, 0.63, '质变阈值 C = 0.6', color=GOLD, fontsize=7.5)
    ax3.axhline(1, color=VIOLET, lw=0.8, ls=':')
    ax3.set_ylim(0, 1.2)
    ax3.set_title('矛盾积累与生态张力', loc='left')
    ax3.legend(loc='upper left', fontsize=7.5)
    tag(ax3, 'c')
    ax4 = fig.add_axes([0.56, 0.38, 0.42, 0.24])
    ax4.plot(t, s['wars'], color=RED, lw=1, label='进行中的战争')
    ax4.plot(t, s['polities'], color=CYAN, lw=1.2, label='政体数')
    ax4.set_title('战争与政体', loc='left')
    ax4.legend(loc='upper left', fontsize=7.5)
    tag(ax4, 'd')
    ax5 = fig.add_axes([0.07, 0.07, 0.91, 0.24])
    share = np.array(s['share'])
    cols = ['#5b6180', '#7d6fd6', '#2fb5ad', '#e0b25c', '#e8705f']
    ax5.stackplot(t, share.T, colors=cols, alpha=0.9, labels=['原始社会', '奴隶社会', '封建社会', '资本主义社会', '社会主义社会'])
    for e in d['events']:
        if e['kind'] in ('era',):
            ax5.axvline(e['t'], color=INK, lw=0.5, alpha=0.4)
    ax5.set_ylim(0, 1)
    ax5.set_xlim(0, len(t))
    ax5.set_xlabel('推演步数')
    ax5.set_ylabel('人口占比')
    ax5.set_title('社会形态的人口占比：同一时刻多种形态并存（统一性与多样性）；竖线为技术时代更替', loc='left')
    ax5.legend(loc='upper left', ncol=5, fontsize=7.5)
    tag(ax5, 'e')
    for a in (ax1, ax2, ax3, ax4):
        a.set_xlim(0, len(t))
    fig.text(0.07, 0.965, f'沙盘时间序列：{len(t)} 步推演，结局：{d["fate"]}', fontsize=11.5, fontweight='bold')
    save(fig, 'fig09_sandbox_series')


# ───── 图 10：相图 ─────
def fig_phase():
    d = load('phase')
    fig = plt.figure(figsize=(11, 4.4))
    ax = fig.add_axes([0.05, 0.13, 0.28, 0.74])
    C = np.array(d['C'])
    E = np.array(d['E'])
    M = np.array(d['macro'])
    cm = mcolors.LinearSegmentedColormap.from_list('s', [RED, '#3a1630', '#1a2a50', CYAN])
    im = ax.contourf(C, E, M, levels=20, cmap=cm)
    cs = ax.contour(C, E, M, levels=[0.2, 0.5, 0.8], colors=[INK], linewidths=0.8)
    ax.clabel(cs, fmt=lambda v: f'{v * 100:.0f}%', fontsize=7.5)
    ax.plot([0.6], [0.5], marker='*', ms=12, color=GOLD, mec=BG)
    ax.set_xlabel('合作程度 κ')
    ax.set_ylabel('生态约束 ε')
    ax.set_title('宏观平均场：存活率相图', loc='left')
    fig.colorbar(im, ax=ax, fraction=0.05, pad=0.02).ax.tick_params(labelsize=7)
    tag(ax, 'a')
    ax2 = fig.add_axes([0.39, 0.13, 0.26, 0.74])
    Mi = np.array(d['micro'])
    ax2.imshow(Mi, origin='lower', cmap=cm, vmin=0, vmax=1, extent=[0, 1, 0, 1], aspect='auto')
    for i, e in enumerate(d['Em']):
        for j, c in enumerate(d['Cm']):
            ax2.text(c, e, f'{Mi[i][j] * 100:.0f}%', ha='center', va='center', fontsize=8.5, color=INK)
    ax2.set_xlabel('合作程度 κ')
    ax2.set_ylabel('生态约束 ε')
    ax2.set_title('微观沙盘：5×5×12 = 300 次推演', loc='left')
    ax2.grid(False)
    tag(ax2, 'b')
    ax3 = fig.add_axes([0.72, 0.13, 0.26, 0.74])
    ax3.plot(d['curveC'], np.array(d['macroCurve']) * 100, color=GOLD, lw=2, marker='o', ms=4, label='宏观平均场（500 宇宙）')
    ax3.plot(d['curveC'], np.array(d['microCurve']) * 100, color=CYAN, lw=2, marker='s', ms=4, label='微观沙盘（16 宇宙）')
    ax3.set_xlabel('合作程度 κ（ε = 0.5）')
    ax3.set_ylabel('延续到推演终点的比例（%）')
    ax3.set_title('两种模型趋势一致', loc='left')
    ax3.legend(loc='upper left', fontsize=7.5)
    tag(ax3, 'c')
    save(fig, 'fig10_phase')


# ───── 图 11：未来情景与历史合力 ─────
def fig_future():
    d = load('future')
    fig = plt.figure(figsize=(11, 4.4))
    ax = fig.add_axes([0.05, 0.13, 0.3, 0.74])
    cols = {'现状基线': INK3, '默认': BLUE, '共同努力': CYAN, '对立': RED}
    for k, v in d['scen'].items():
        yrs = np.arange(len(v['curve'])) * 10
        ax.plot(yrs, np.array(v['curve']) * 100, color=cols[k], lw=2, label=f'{k}：{v["survival"] * 100:.0f}%')
    ax.set_xlabel('未来年数')
    ax.set_ylabel('存活比例（%）')
    ax.set_title('千年情景（示意模型，4000 次抽样）', loc='left')
    ax.legend(loc='lower left', fontsize=7.5)
    tag(ax, 'a')
    ax2 = fig.add_axes([0.41, 0.13, 0.24, 0.74])
    names = list(d['scen'].keys())
    keys = ['war', 'climate', 'ai', 'impact']
    kn = ['战争', '气候', 'AI 失控', '撞击']
    kc = [RED, VIOLET, GOLD, CYAN]
    bottom = np.zeros(len(names))
    for k, n, c in zip(keys, kn, kc):
        v = np.array([d['scen'][s]['risks'][k] * 1000 for s in names])
        ax2.bar(names, v, bottom=bottom, color=c, alpha=0.85, label=n)
        bottom += v
    ax2.set_ylabel('每十年风险（‰）')
    ax2.set_title('风险分解', loc='left')
    ax2.legend(loc='upper right', fontsize=7.5)
    tag(ax2, 'b')
    ax3 = fig.add_axes([0.71, 0.13, 0.27, 0.74])
    vec = np.array(d['vectors'])
    for x, y in vec:
        ax3.annotate('', xy=(x, y), xytext=(0, 0), arrowprops=dict(arrowstyle='-|>', color=CYAN, lw=0.4, alpha=0.25, mutation_scale=5))
    rx, ry = d['resultant']
    ax3.annotate('', xy=(rx * 3, ry * 3), xytext=(0, 0), arrowprops=dict(arrowstyle='-|>', color=GOLD, lw=2.6, mutation_scale=14))
    ax3.text(rx * 3, ry * 3 + 0.04, '合力（×3）', color=GOLD, fontsize=8.5)
    ax3.axhline(0, color=INK3, lw=0.6)
    ax3.axvline(0, color=INK3, lw=0.6)
    ax3.set_xlim(-0.5, 0.7)
    ax3.set_ylim(-0.5, 0.7)
    ax3.set_xlabel('发展与治理')
    ax3.set_ylabel('合作与生态')
    ax3.set_title('历史合力：240 位观测者的力向量', loc='left')
    tag(ax3, 'c')
    save(fig, 'fig11_future')


# ───── 图 12：单参数敏感度 ─────
def fig_sensitivity():
    d = load('sensitivity')
    d = sorted(d, key=lambda r: r['pass'])
    fig = plt.figure(figsize=(11, 5.4))
    ax = fig.add_axes([0.2, 0.1, 0.58, 0.8])
    cmap = {0: CYAN, 1: '#2a8f8a', 2: RED}
    for i, r in enumerate(d):
        xs = np.array(r['xs'], dtype=float)
        st = np.array(r['st'])
        u = (np.log10(xs) - math.log10(r['min'])) / (math.log10(r['max']) - math.log10(r['min'])) if r['log'] else (xs - r['min']) / (r['max'] - r['min'])
        du = np.diff(u, append=u[-1] + (u[-1] - u[-2]))
        ax.bar(u, 0.62, width=du * 1.02, bottom=i - 0.31, color=[cmap[s] for s in st], align='edge', alpha=0.85, lw=0)
        v = r['value']
        vu = (math.log10(v) - math.log10(r['min'])) / (math.log10(r['max']) - math.log10(r['min'])) if r['log'] else (v - r['min']) / (r['max'] - r['min'])
        ax.plot([vu], [i], marker='D', ms=6, color=GOLD, mec=BG)
        ax.text(1.02, i, f'{r["pass"] * 100:.1f}%', va='center', fontsize=8.5, color=INK)
    ax.set_yticks(range(len(d)), [f'{r["name"]}  {r["symbol"]}' for r in d])
    ax.set_xlim(0, 1)
    ax.set_xticks([0, 0.25, 0.5, 0.75, 1], ['下限', '', '滑杆范围（归一化）', '', '上限'])
    ax.set_title('单参数敏感度：其余参量取地球值，逐一扫过滑杆全程（每参数 400 点）', loc='left')
    ax.grid(False)
    lax = fig.add_axes([0.83, 0.1, 0.16, 0.8])
    lax.axis('off')
    items = [(CYAN, '链条完整'), ('#2a8f8a', '通过但有警示'), (RED, '链条断裂'), (GOLD, '◆ 地球取值')]
    for i, (c, s) in enumerate(items):
        lax.add_patch(Rectangle((0, 0.9 - i * 0.08), 0.12, 0.045, color=c, transform=lax.transAxes))
        lax.text(0.18, 0.92 - i * 0.08, s, va='center', fontsize=8.5, transform=lax.transAxes)
    lax.text(0, 0.5, '右侧百分比：\n该参数可行区间\n占滑杆范围的比例', fontsize=8.5, color=INK2, va='top', transform=lax.transAxes)
    lax.text(0, 0.2, '越窄的参数，\n越是文明链条的\n“精细调节”之处', fontsize=8.5, color=GOLD, va='top', transform=lax.transAxes)
    save(fig, 'fig12_sensitivity')


# ───── 图 13：因果图 ─────
def fig_causal():
    nodes = load('causal')
    G = nx.DiGraph()
    for n in nodes:
        G.add_node(n['id'], label=n['label'], layer=n['layer'], params=n['params'])
        for dep in n['deps']:
            G.add_edge(dep, n['id'])
    layers = {}
    for n in nodes:
        layers.setdefault(n['layer'], []).append(n['id'])
    pos = {}
    for L, ids in layers.items():
        for i, nid in enumerate(ids):
            pos[nid] = (L * 2.1, (i - (len(ids) - 1) / 2) * 1.15)
    lc = [CYAN, BLUE, VIOLET, GREEN, GOLD, RED]
    fig = plt.figure(figsize=(11, 5.6))
    ax = fig.add_axes([0.01, 0.02, 0.98, 0.88])
    ax.set_facecolor(BG)
    ax.grid(False)
    ax.axis('off')
    for L in range(6):
        ax.add_patch(Rectangle((L * 2.1 - 0.95, -3.4), 1.9, 6.8, color=lc[L], alpha=0.05))
        ax.text(L * 2.1, 3.25, ['L0 物理常数', 'L1 天体', 'L2 行星化学', 'L3 生命', 'L4 文明', 'L5 未来'][L], ha='center', fontsize=10, color=lc[L], fontweight='bold')
    nx.draw_networkx_edges(G, pos, ax=ax, edge_color=INK3, arrows=True, arrowsize=10, width=0.9, connectionstyle='arc3,rad=0.08', node_size=1500)
    for nid, (x, y) in pos.items():
        n = G.nodes[nid]
        ax.add_patch(Circle((x, y), 0.36, color=PANEL, ec=lc[n['layer']], lw=1.6, zorder=3))
        ax.text(x, y + 0.02, n['label'].split(' ')[0], ha='center', va='center', fontsize=8.5, color=INK, zorder=4)
        if len(n['label'].split(' ')) > 1:
            ax.text(x, y - 0.5, n['label'].split(' ', 1)[1], ha='center', va='center', fontsize=7, color=INK2, zorder=4)
        if n['params']:
            ax.text(x, y + 0.5, ' · '.join(n['params'][:2]), ha='center', fontsize=6.3, color=lc[n['layer']], zorder=4)
    ax.set_xlim(-1.2, 12)
    ax.set_ylim(-3.6, 3.6)
    fig.text(0.01, 0.95, '参数因果图：21 个节点按宇宙层级分列，箭头由原因指向结果；改变任一参数，沿箭头传播的下游节点即“因果涟漪”', fontsize=11, fontweight='bold')
    save(fig, 'fig13_causal')


def fig_civ_macro():
    d = load('civ')
    t = np.arange(len(d['P']))
    fig = plt.figure(figsize=(11, 3.6))
    ax = fig.add_axes([0.06, 0.15, 0.6, 0.72])
    ax.semilogy(t, d['P'], color=GOLD, lw=2, label='生产力 P')
    ax.semilogy(t, d['R'], color=CYAN, lw=1.3, label='生产关系容量 R')
    names = ['原始', '奴隶', '封建', '资本主义', '社会主义']
    prev = 0
    for i, l in enumerate(d['leaps'] + [len(t)]):
        if i % 2:
            ax.axvspan(prev, l, color='#16203d', alpha=0.6)
        ax.text((prev + l) / 2, max(d['P']) * 1.6, names[i] if i < 5 else '', ha='center', fontsize=8.5, color=INK2)
        prev = l
    for l in d['leaps']:
        ax.axvline(l, color=GOLD, lw=0.8, ls='--')
    ax.set_xlabel('推演步数')
    ax.set_title('宏观双环模型：P 超出 R 的容纳上限 → 矛盾积累 → 质变', loc='left')
    ax.legend(loc='lower right', fontsize=7.5)
    tag(ax, 'a')
    ax2 = fig.add_axes([0.72, 0.15, 0.26, 0.72])
    ax2.plot(t, d['C'], color=RED, lw=1)
    ax2.plot(t, d['E'], color=VIOLET, lw=1.5)
    ax2.axhline(0.6, color=GOLD, lw=0.8, ls='--')
    ax2.set_ylim(0, 1.1)
    ax2.set_title('C（红）与 E（紫）', loc='left')
    tag(ax2, 'b')
    fig.text(0.06, 0.94, r'$C = (P-R)/R;\ \ \dot P/P = g\,(1+0.5s)\,\max(0.1,\,1-1.4C);\ \ R \leq \mathrm{CAP}_s,\ \ \mathrm{CAP} = [2, 8, 40, 600, 10^{12}]$', fontsize=9, color=GOLD)
    save(fig, 'fig14_civ_macro')


if __name__ == '__main__':
    fig_funnel()
    fig_l0()
    fig_l1()
    fig_thermo()
    fig_kpg()
    fig_drake()
    fig_lorenz()
    fig_sandbox_maps()
    fig_sandbox_series()
    fig_phase()
    fig_future()
    fig_sensitivity()
    fig_causal()
    fig_civ_macro()
