// 终章 · 知过必改（L5 未来）：一万个平行宇宙、揭示地球、历史合力、未来之钥、留言化作一颗星。

import * as THREE from 'three';
import { Act } from './Act';
import type { Fadeable } from '../app/App';
import { SCRIPT } from '../data/script';
import { UniverseField } from '../render/UniverseField';
import { runMonteCarlo, type MonteCarloResult } from '../sim/montecarlo';
import { crowd, project, resultant, simulateFuture, FUTURE_STEPS, type FutureInput } from '../sim/future';
import { THEORY } from '../data/theory';
import { h, fitCanvas, COLORS, MONO_FONT, SANS_FONT, sup, fracText } from '../ui/dom';
import { button, paramSlider, readouts, section, type SliderHandle } from '../ui/panel';
import { ease } from '../core/tween';
import { DISPLAY_FONT } from '../render/TextSprite';
import { LAYER_NAMES, KEY_NAMES, type KeyId } from '../sim/types';

const EARTH_LOOK = { earth: 1, life: 1, city: 1, sea: 1, ice: 0.1, scorch: 0, dead: 0, cloud: 0.42, hazard: 0, scar: 0 };

export class FinaleAct extends Act {
  readonly id = 'finale' as const;
  private field: UniverseField | null = null;
  private fieldFade!: Fadeable;
  private mc: MonteCarloResult | null = null;
  private crowd: FutureInput[] = crowd(300);
  private mine: FutureInput | null = null;
  private sliders: Record<string, SliderHandle> = {};
  private curveCanvas: HTMLCanvasElement | null = null;
  private forceCanvas: HTMLCanvasElement | null = null;
  private read = readouts([
    ['你的选择 · 千年存活（示意）', 'mine'],
    ['所有观测者的合力 · 千年存活', 'all'],
    ['主要风险来源', 'cause'],
  ]);
  private funnelRead = readouts([
    ['平行实验次数', 'n'],
    ['N < 1 的银河系', 'alone'],
    ['log₁₀N 中位数', 'median'],
  ]);
  private stage: 'cinematic' | 'future' | 'done' = 'cinematic';

  fadeables(): Fadeable[] {
    return this.field ? [this.fieldFade] : [];
  }

  private ensure(): void {
    if (this.field) return;
    this.mc = runMonteCarlo(10000);
    this.field = new UniverseField(this.mc.samples);
    this.field.setDeadFraction(this.mc.aloneFraction);
    this.field.setPixelRatio(this.app.stage.renderer.getPixelRatio());
    this.field.group.visible = false;
    this.app.stage.scene.add(this.field.group);
    this.fieldFade = { group: this.field.group, setOpacity: (a) => this.field!.setOpacity(a) };
  }

  async enter(): Promise<void> {
    const app = this.app;
    this.ensure();
    const field = this.field!;
    app.sky.setMood(0x22163f, 0x0b2440, 0.6);
    app.audio.setMood('finale');
    this.every((dt, t) => field.update(dt, t));
    this.stage = 'cinematic';
    void this.dir.clearStage([this.fieldFade], 1200);
    field.setProgress(0);
    field.group.scale.setScalar(1);
    app.rig.minDist = 2;
    app.rig.maxDist = 70;
    app.rig.set({ target: new THREE.Vector3(0, 0, 0) });
    void app.rig.to(app.tw, { dist: 46, el: 0.28 }, 2400);
    await app.fade(this.fieldFade, 0, 1, 1800);
    app.hud.setScale(21);
    this.buildFunnelPanel();
    if (app.state.mode === 'free') void this.cinematicFree();
  }

  /** 概率筛选漏斗：参数空间存活比例逐层递减（对数刻度）。 */
  private funnel(): HTMLElement {
    const f = this.app.state.computeLadder().fractions;
    const labels = ['L0 物理常数', 'L1 天体', 'L2 行星化学', 'L3 生命', 'L4 文明'];
    const minLog = -6;
    return h('div', { class: 'funnel' }, ...f.map((v, i) => {
      const w = Math.max(2, ((Math.log10(Math.max(v, 1e-9)) - minLog) / -minLog) * 100);
      return h('div', { class: 'frow' }, h('span', {}, labels[i]), h('i', { style: `width:${w.toFixed(1)}%` }), h('b', {}, fracText(v)));
    }));
  }

  private buildFunnelPanel(): void {
    const mc = this.mc!;
    this.funnelRead.set('n', '10,000');
    this.funnelRead.set('alone', `${(mc.aloneFraction * 100).toFixed(1)}%`);
    this.funnelRead.set('median', `${mc.medianLog10N.toFixed(1)}（即 N ≈ 10${sup(Math.round(mc.medianLog10N))}）`);
    this.app.panel.open(
      this.meta,
      h('p', {}, '把同样的实验做一万次。每个光点是一个银河系：恒星形成率、行星、生命起源、智能、技术与文明寿命，都按不确定性随机抽样。'),
      section('概率筛选：你走过的每一层', this.funnel(), h('p', { class: 'hint' }, '在本作品设定的参数取值范围内随机抽样，能走过各层的比例（对数刻度）。')),
      section('万宇宙蒙特卡洛', this.funnelRead.el,
        h('span', { class: 'eq' }, 'N = R★ · f_p · n_e · f_l · f_i · f_c · L'),
        h('p', { class: 'hint' }, '取值思路参照 Sandberg, Drexler & Ord 2018；区间为本作品设定（示意），所得比例是本模型下的结果，不代表该论文的数值结论。f_l = 1 − exp(−λVt)，log₁₀λVt 服从标准差 50 的正态分布。'),
      ),
    );
  }

  /** 自由模式：不阻塞的过场，随后进入未来参量。 */
  private async cinematicFree(): Promise<void> {
    const app = this.app;
    try {
      app.narrate(SCRIPT.finale[0]);
      await this.extinguish(6000);
      app.narrate(SCRIPT.finaleAlone(Math.round(this.mc!.aloneFraction * 100)));
      await app.wait(2600);
      app.narrate(SCRIPT.finaleEarth);
      await this.revealEarth(4200);
      this.buildFuturePanel();
    } catch {
      /* 离开本幕时中止 */
    }
  }

  private async extinguish(ms: number): Promise<void> {
    const f = this.field!;
    this.app.audio.setMood('silence', 3);
    await this.app.tw.run(ms, (k) => f.setProgress(k), ease.inOutSine);
  }

  private async revealEarth(ms: number): Promise<void> {
    const app = this.app;
    app.planet.setLook(EARTH_LOOK, true);
    app.planet.spinRate = 0.04;
    app.planetRoot.position.set(0, 0, 0);
    app.planetRoot.scale.setScalar(1);
    app.planetRoot.visible = true;
    app.audio.setMood('finale', 4);
    void app.fade(app.planetFade, 0, 1, ms * 0.6);
    void app.fade(this.fieldFade, 1, 0.35, ms);
    await app.rig.to(app.tw, { dist: 3.4, el: 0.2, az: app.rig.az + 0.6 }, ms, ease.inOutCubic);
    app.hud.setScale(7);
    app.state.addChronicle({ when: '此刻', text: '这不是模拟。这是此刻的地球。', layer: 5, kind: 'fact' });
  }

  private buildFuturePanel(): void {
    const app = this.app;
    const s = app.state;
    this.stage = 'future';
    if (!s.has('future')) s.unlock('future');
    const on = () => this.updateFuture();
    this.sliders = {
      fut_coop: paramSlider('fut_coop', Number(s.params.fut_coop), (v) => { s.params.fut_coop = v; on(); }, { fmt: (v) => v.toFixed(2) }),
      fut_carbon: paramSlider('fut_carbon', Number(s.params.fut_carbon), (v) => { s.params.fut_carbon = v; on(); }, { fmt: (v) => v.toFixed(2) }),
      fut_ai: paramSlider('fut_ai', Number(s.params.fut_ai), (v) => { s.params.fut_ai = v; on(); }, { fmt: (v) => v.toFixed(2) }),
      fut_defense: paramSlider('fut_defense', Number(s.params.fut_defense), (v) => { s.params.fut_defense = v; on(); }, { fmt: (v) => v.toFixed(2) }),
    };
    this.curveCanvas = h('canvas', { class: 'chart', 'aria-label': '未来千年存活曲线：金色为你的选择，青色为所有观测者的合力' }) as HTMLCanvasElement;
    this.forceCanvas = h('canvas', { class: 'chart', 'aria-label': '历史合力：灰色细线为其他观测者的选择，金色为你的选择，青色箭头为合力' }) as HTMLCanvasElement;
    const bloch = THEORY.find((t) => t.id === 'bloch')!;
    app.panel.open(
      this.meta,
      h('p', {}, '我们正处在这棵概率树上仍在生长的那一枝。未来的参量，不再由宇宙替我们选择。'),
      section('未来之钥 · 四个参量', ...Object.values(this.sliders).map((x) => x.el)),
      section('未来千年（示意）', this.curveCanvas, this.read.el,
        h('div', { class: 'legend' }, h('span', {}, h('i', { style: `background:${COLORS.gold}` }), '你的选择'), h('span', {}, h('i', { style: `background:${COLORS.cyan}` }), '合力')),
        h('p', { class: 'hint' }, '情景模型：用来表达参量的方向与相对大小，不是预测。')),
      section('历史合力', this.forceCanvas,
        h('p', { class: 'hint' }, `“${bloch.quote}”——恩格斯 1890 年致约·布洛赫的信。每条细线是一位观测者的选择（示意人群），你的选择也是其中一支力。`),
        h('div', { class: 'btns' }, button('把我的选择汇入合力', () => void this.commitChoice(), 'primary'))),
    );
    this.updateFuture();
  }

  private current(): FutureInput {
    const p = this.app.state.params;
    return { coop: Number(p.fut_coop), carbon: Number(p.fut_carbon), ai: Number(p.fut_ai), defense: Number(p.fut_defense) };
  }

  private updateFuture(): void {
    const me = this.current();
    const all = resultant([...this.crowd, ...(this.mine ? [this.mine] : [])]);
    const rMe = simulateFuture(me, 1500);
    const rAll = simulateFuture(all, 1500);
    this.read.set('mine', `${Math.round(rMe.survival * 100)}%`);
    this.read.set('all', `${Math.round(rAll.survival * 100)}%`);
    const names: Record<string, string> = { war: '战争与冲突', climate: '气候与生态', ai: 'AI 失控', impact: '小天体撞击' };
    const top = Object.entries(rMe.causes).sort((a, b) => b[1] - a[1])[0];
    this.read.set('cause', top && top[1] > 0 ? `${names[top[0]]}（${Math.round(top[1] * 100)}%）` : '—');
    this.drawCurves(rMe.curve, rAll.curve);
    this.drawForce(me, all);
  }

  private drawCurves(mine: number[], all: number[]): void {
    const c = this.curveCanvas;
    if (!c || !c.isConnected) return;
    const { g, w, h: H } = fitCanvas(c, 140);
    const L = 34;
    const R = 8;
    const T = 10;
    const B = 18;
    const X = (i: number) => L + (i / FUTURE_STEPS) * (w - L - R);
    const Y = (v: number) => T + (1 - v) * (H - T - B);
    g.clearRect(0, 0, w, H);
    g.font = MONO_FONT;
    g.fillStyle = COLORS.ink3;
    g.strokeStyle = COLORS.rule;
    [0, 0.5, 1].forEach((v) => {
      g.beginPath();
      g.moveTo(L, Y(v));
      g.lineTo(w - R, Y(v));
      g.stroke();
      g.fillText(`${v * 100}%`, 2, Y(v) + 4);
    });
    g.fillText('2026', L, H - 4);
    g.fillText('+1000 年', w - R - 52, H - 4);
    const line = (arr: number[], color: string, lw: number) => {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.beginPath();
      arr.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
      g.stroke();
    };
    line(all, COLORS.cyan, 1.6);
    line(mine, COLORS.gold, 2.2);
    g.lineWidth = 1;
  }

  private drawForce(me: FutureInput, all: FutureInput): void {
    const c = this.forceCanvas;
    if (!c || !c.isConnected) return;
    const { g, w, h: H } = fitCanvas(c, 190);
    const cx = w / 2;
    const cy = H / 2;
    const k = Math.min(w, H) * 0.62;
    g.clearRect(0, 0, w, H);
    g.strokeStyle = COLORS.rule;
    g.beginPath();
    g.moveTo(0, cy);
    g.lineTo(w, cy);
    g.moveTo(cx, 0);
    g.lineTo(cx, H);
    g.stroke();
    g.fillStyle = COLORS.ink3;
    g.font = SANS_FONT;
    g.fillText('发展与治理 →', w - 86, cy - 6);
    g.fillText('合作与生态 ↑', cx + 6, 14);
    g.strokeStyle = 'rgba(169,174,202,0.16)';
    for (const f of this.crowd) {
      const [x, y] = project(f);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + x * k, cy - y * k);
      g.stroke();
    }
    const arrow = (v: [number, number], color: string, width: number) => {
      const ex = cx + v[0] * k;
      const ey = cy - v[1] * k;
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(ex, ey);
      g.stroke();
      const a = Math.atan2(ey - cy, ex - cx);
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex - 9 * Math.cos(a - 0.4), ey - 9 * Math.sin(a - 0.4));
      g.lineTo(ex - 9 * Math.cos(a + 0.4), ey - 9 * Math.sin(a + 0.4));
      g.closePath();
      g.fill();
      g.lineWidth = 1;
    };
    const rv = project(all);
    arrow([rv[0], rv[1]], COLORS.cyan, 2.6);
    arrow(project(me), COLORS.gold, 2.2);
    g.fillStyle = COLORS.ink3;
    g.font = MONO_FONT;
    g.fillText('青：合力　金：你的选择', 6, H - 6);
  }

  private async commitChoice(): Promise<void> {
    const app = this.app;
    if (this.stage === 'done') return;
    this.mine = this.current();
    this.updateFuture();
    app.audio.chime();
    app.toasts.show('你的选择已汇入合力：它很小，但不为零。');
    app.state.setLayer(5, 'ok');
    app.state.addChronicle({ when: '此刻', text: '一位观测者把自己的选择汇入了历史合力。', layer: 5, kind: 'sim' });
    await app.wait(1200).catch(() => {});
    await this.handOver();
  }

  /** 交出未来之钥：浑天仪六环全部点亮，环绕此刻的地球。 */
  private async handOver(): Promise<void> {
    const app = this.app;
    this.stage = 'done';
    const thesis = THEORY.find((t) => t.id === 'thesis11')!;
    if (app.state.mode === 'free') app.narrate({ text: `“${thesis.quote}”`, ms: 6000 });
    app.armillary.setKeys(new Set<KeyId>([...app.state.keys, 'future']));
    app.hallRoot.visible = true;
    app.hall.setOpacity(0);
    await app.fade({ group: app.armillary.group, setOpacity: (a) => app.armillary.setOpacity(a) }, 0, 1, 2400);
    void app.rig.to(app.tw, { dist: 10.5, el: 0.16 }, 3200);
    if (!app.state.has('core')) app.state.unlock('core');
    app.armillary.pulse('future');
    this.buildEndPanel();
  }

  private buildEndPanel(): void {
    const app = this.app;
    const s = app.state;
    const input = h('input', { type: 'text', id: 'star-msg', maxlength: 120, placeholder: '写下你想对未来说的话', style: 'width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--rule-strong);background:var(--deck-solid)' }) as HTMLInputElement;
    const layers = s.layers.map((st, i) => `${LAYER_NAMES[i as 0]}：${st === 'ok' ? '通过' : st === 'warn' ? '警示' : st === 'fail' ? '失败' : '—'}`);
    app.panel.open(
      this.meta,
      h('p', {}, '知识让你读懂宇宙的过去；而未来的钥匙，握在每一个人手里。'),
      section('你的实验', h('p', {}, `文明“${s.civName}”，宇宙编号 ${s.seed}。本源之钥已解锁：选择“重写本源”，可以回到第①幕改写宇宙的常数。`), h('p', { class: 'hint' }, layers.join('；')), h('p', { class: 'hint' }, `已点亮：${[...s.keys].map((k) => KEY_NAMES[k]).join('、')}。编年史共 ${s.chronicle.length} 条。`)),
      section('留言化作一颗星', input, h('div', { class: 'btns' }, button('点亮这颗星', () => {
        const t = input.value.trim();
        if (!t) return;
        s.addStar(t);
        app.hall.setMessageStars(s.stars.length);
        app.audio.chime();
        app.toasts.show('你的留言成为了实验大厅上空的一颗星。');
        input.value = '';
      }, 'primary'))),
      h('div', { class: 'btns' },
        button('生成我的宇宙海报', () => void this.poster()),
        button('重写本源（二周目）', () => void this.dir.newUniverse()),
        button('回到实验大厅', () => void this.dir.goTo('hall')),
      ),
    );
  }

  /** “我的宇宙”海报：生成图片，观众可长按或右键保存。 */
  private async poster(): Promise<void> {
    const app = this.app;
    const s = app.state;
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1350;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(760, 260, 50, 540, 600, 1100);
    grd.addColorStop(0, '#2a1b5c');
    grd.addColorStop(0.6, '#0a0b1a');
    grd.addColorStop(1, '#05060a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1080, 1350);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`;
      g.fillRect(Math.random() * 1080, Math.random() * 1350, 1.5, 1.5);
    }
    const shot = app.stage.renderer.domElement;
    app.stage.composer.render(0);
    try {
      const sw = Math.min(shot.width, shot.height);
      g.drawImage(shot, (shot.width - sw) / 2, (shot.height - sw) / 2, sw, sw, 140, 300, 800, 800);
    } catch {
      /* 某些环境禁止读取 WebGL 画面 */
    }
    g.textAlign = 'center';
    g.fillStyle = '#e7e9f3';
    g.font = `900 120px ${DISPLAY_FONT}`;
    g.fillText('创世纪元', 540, 190);
    g.fillStyle = '#f5c66b';
    g.font = `900 40px ${DISPLAY_FONT}`;
    g.fillText(`文明 · ${s.civName}`, 540, 262);
    g.fillStyle = '#a9aeca';
    g.font = '32px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(`宇宙编号 ${s.seed} · 已点亮 ${s.keys.size} 把钥匙`, 540, 1170);
    g.fillStyle = '#e7e9f3';
    g.font = `900 38px ${DISPLAY_FONT}`;
    g.fillText('未来的钥匙，握在每一个人手里。', 540, 1240);
    g.fillStyle = '#737997';
    g.font = '24px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('AI 文明诞生概率实验室 · 第十四届全国大学生数字媒体科技作品及创意竞赛', 540, 1300);
    const url = c.toDataURL('image/png');
    await app.modals.info('我的宇宙', `${s.civName} 的海报`, [
      h('img', { src: url, alt: `${s.civName}的宇宙海报`, style: 'width:100%;border-radius:10px;border:1px solid var(--rule)' }),
      h('p', { class: 'hint' }, '在图片上右键或长按即可保存。'),
      h('a', { href: url, download: `创世纪元-${s.civName}-${s.seed}.png`, class: 'btn', style: 'display:inline-block;text-decoration:none;margin-top:6px' }, '下载 PNG'),
    ], '关闭');
  }

  async exit(): Promise<void> {
    await super.exit();
    this.app.planet.setLook({ earth: 0 });
  }

  async guided(): Promise<void> {
    const app = this.app;
    await app.say(SCRIPT.finale[0]);
    app.sayBg(SCRIPT.finale[1]);
    await this.extinguish(8000);
    await app.say(SCRIPT.finaleAlone(Math.round(this.mc!.aloneFraction * 100)));
    await app.say(SCRIPT.finaleFermi);
    app.sayBg(SCRIPT.finaleSample);
    await this.revealEarth(4200);
    await app.say(SCRIPT.finaleEarth);
    await app.say(SCRIPT.finaleBranch);
    this.buildFuturePanel();
    app.sayBg(SCRIPT.finaleParams);
    await app.tw.run(4000, (k) => {
      for (const id of ['fut_coop', 'fut_carbon', 'fut_ai', 'fut_defense']) {
        const v = Number(this.app.state.params[id]);
        const target = 0.78;
        const x = v + (target - v) * k;
        this.sliders[id].set(x);
      }
    }, ease.inOutCubic);
    for (const id of ['fut_coop', 'fut_carbon', 'fut_ai', 'fut_defense']) app.state.params[id] = 0.78;
    this.updateFuture();
    await app.wait(2500);
    await app.say(SCRIPT.finaleForce);
    this.mine = this.current();
    this.updateFuture();
    app.state.setLayer(5, 'ok');
    await app.say(SCRIPT.finaleYou);
    await app.say(SCRIPT.finaleThesis);
    app.sayBg(SCRIPT.finaleKey);
    await this.handOver();
    await app.wait(2600);
    await app.say(SCRIPT.finaleGive);
    await app.say(SCRIPT.finaleStar);
  }
}
