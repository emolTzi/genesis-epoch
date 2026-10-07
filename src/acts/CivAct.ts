// 第⑤幕 · 始制文字（L4 文明）：生产力 / 生产关系双环全息仪、千钧一发的历史时刻、文明熄灭。

import * as THREE from 'three';
import { Act } from './Act';
import type { Fadeable } from '../app/App';
import type { ActId } from '../data/script';
import { SCRIPT } from '../data/script';
import { CivRings } from '../render/CivRings';
import { simulateCiv, survivalRate, STAGES, STAGES_SHORT, HORIZON, type CivRun } from '../sim/civ';
import { civEventText } from '../data/chronicle';
import { h, fitCanvas, COLORS, MONO_FONT, SANS_FONT } from '../ui/dom';
import { button, paramSlider, readouts, section, type SliderHandle } from '../ui/panel';
import type { ParamValue } from '../sim/types';
import { ease } from '../core/tween';
import { twinBody } from '../ui/twin';

const CITY_BY_STAGE = [0.02, 0.15, 0.35, 0.7, 1];

/** 找一个“合作程度很低时较早自我毁灭”的平行宇宙，用于默认推演。 */
function collapseSeed(): number {
  for (let s = 1; s < 2000; s++) {
    const r = simulateCiv({ eco: 0.5, coop: 0.05, seed: s }, false);
    if (r.fate === '自我毁灭' && r.industrialT !== null && r.tEnd > r.industrialT + 70 && r.tEnd < 430) return s;
  }
  return 7;
}

export class CivAct extends Act {
  readonly id = 'civ' as const;
  private rings: CivRings | null = null;
  private ringsFade!: Fadeable;
  private sliders: Record<string, SliderHandle> = {};
  private chart: HTMLCanvasElement | null = null;
  private read = readouts([
    ['到达的社会形态', 'stage'],
    ['质变次数', 'leaps'],
    ['这个宇宙的结局', 'fate'],
    ['同参数 500 个平行宇宙存活率', 'mc'],
  ]);
  private run: CivRun | null = null;
  private shown = 0;
  private playing = false;
  private passed = false;
  private nextBtn: HTMLButtonElement | null = null;

  fadeables(): Fadeable[] {
    return this.rings ? [this.ringsFade] : [];
  }

  async enter(prev: ActId | null): Promise<void> {
    const app = this.app;
    if (!this.rings) {
      this.rings = new CivRings();
      app.planetRoot.add(this.rings.group);
      this.ringsFade = { group: this.rings.group };
    }
    const rings = this.rings;
    app.sky.setMood(0x1d1238, 0x0c1f3a, 0.85);
    app.audio.setMood('civ');
    app.planet.setLook({ life: 0.85, city: 0.02, dead: 0, scorch: 0, sea: 1, ice: 0.12, hazard: 0, scar: 0, cloud: 0.5 }, prev !== 'life');
    app.planet.spinRate = 0.05;
    if (prev !== 'life') {
      void this.dir.clearStage([app.planetFade, this.ringsFade], 900);
      await app.fade(app.planetFade, app.planetRoot.visible ? 1 : 0, 1, 900);
    }
    rings.group.visible = true;
    rings.setStreams(0);
    rings.setLevels(0.1, 0.1);
    this.every((dt, t) => rings.update(dt, t));
    app.hud.setScale(7);
    app.rig.minDist = 1.8;
    app.rig.maxDist = 12;
    void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 5.2, el: 0.32 }, 2000);
    this.passed = false;
    this.run = null;
    this.buildPanel();
    this.takeSnapshot();
  }

  async exit(): Promise<void> {
    this.playing = false;
    await super.exit();
  }

  private buildPanel(): void {
    const app = this.app;
    const s = app.state;
    const locked = !s.has('civ');
    const on = (id: string) => (v: ParamValue) => {
      app.state.setParams({ [id]: v });
      this.updateMC();
    };
    this.sliders = {
      eco: paramSlider('eco', Number(s.params.eco), on('eco'), { locked, fmt: (v) => v.toFixed(2) }),
      coop: paramSlider('coop', Number(s.params.coop), on('coop'), { locked, fmt: (v) => v.toFixed(2) }),
    };
    this.chart = h('canvas', { class: 'chart', 'aria-label': '文明推演曲线：金色为生产力，青色为生产关系，下栏红色为矛盾，紫色为人与自然的张力' }) as HTMLCanvasElement;
    this.nextBtn = button('进入终章：知过必改', () => void this.dir.next(), 'primary');
    this.nextBtn.disabled = !this.passed;
    app.panel.open(
      this.meta,
      h('p', {}, '生产力发展到一定阶段，会同现存的生产关系发生矛盾；矛盾积累越过阈值，旧的形式被打破，社会形态随之更替。工业文明之后，毁灭性的力量也随之出现。'),
      section('双环全息仪', this.chart,
        h('div', { class: 'legend' },
          h('span', {}, h('i', { style: `background:${COLORS.gold}` }), '生产力 P（对数）'),
          h('span', {}, h('i', { style: `background:${COLORS.cyan}` }), '生产关系 R'),
          h('span', {}, h('i', { style: `background:${COLORS.entropy}` }), '矛盾 C'),
          h('span', {}, h('i', { style: `background:${COLORS.violet}` }), '人与自然张力 E'),
        ),
        h('p', { class: 'hint' }, '以历史唯物主义为框架的示意性动力学模型，用于可视化理论机制，并非历史预测。毁灭性技术风险只取决于技术水平与合作程度，与社会形态的名称无关。'),
      ),
      section('文明参量', ...Object.values(this.sliders).map((x) => x.el), locked ? h('p', { class: 'hint' }, '文明之钥未解锁：先观看一次默认推演。') : null),
      section('读数', this.read.el),
      h('div', { class: 'btns' },
        !locked ? button('推演这个文明', () => void this.play(true), 'primary') : null,
        button(locked ? '观看默认推演' : '看一次默认推演', () => void this.demo()),
        button('另一个你：蝴蝶效应', () => void this.twin()),
      ),
      h('div', { class: 'next' }, this.nextBtn),
    );
    this.updateMC();
    this.draw();
  }

  private updateMC(): void {
    const s = this.app.state;
    this.read.set('mc', `${Math.round(survivalRate(Number(s.params.eco), Number(s.params.coop)) * 100)}%`);
  }

  /** 回放一次推演。user=true 时结果计入本宇宙（失败则归入墓园）。 */
  async play(user: boolean, override?: { eco: number; coop: number; seed: number; ms?: number }): Promise<CivRun> {
    if (this.playing) return this.run!;
    this.playing = true;
    const app = this.app;
    const p = app.state.params;
    const eco = override?.eco ?? Number(p.eco);
    const coop = override?.coop ?? Number(p.coop);
    const seed = override?.seed ?? app.state.seed;
    let run = simulateCiv({ eco, coop, seed });
    this.run = run;
    const rings = this.rings!;
    app.planet.setLook({ city: 0.02, dead: 0 });
    rings.setStreams(0.2);
    ['stage', 'leaps', 'fate'].forEach((id) => this.read.set(id, '推演中…'));
    const total = override?.ms ?? (app.state.mode === 'guided' ? 11000 : 14000);
    let lastStage = 0;
    let idx = 0;
    const handled = new Set<number>();
    this.shown = 0;
    while (this.shown < run.P.length) {
      if (!this.playing) break;
      const stepMs = total / HORIZON;
      await app.tw.wait(stepMs * 4);
      this.shown = Math.min(run.P.length, this.shown + 4);
      idx = this.shown - 1;
      const stage = run.stageAt[idx];
      if (stage > lastStage) {
        lastStage = stage;
        app.audio.leap();
        void rings.shatter(app.tw);
        app.toasts.show(`质变：进入${STAGES[stage]}`);
        app.state.addChronicle({ when: `推演 t=${idx}`, text: civEventText(STAGES[stage]), layer: 4, kind: 'sim' });
      }
      app.planet.setLook({ city: CITY_BY_STAGE[stage] });
      const maxP = Math.log10(Math.max(...run.P.slice(0, idx + 1)) + 1);
      rings.setLevels(Math.min(1, maxP / 4.5), Math.min(1, Math.log10(run.R[idx] + 1) / 4.5));
      rings.setStreams(0.2 + 0.8 * (stage / 4));
      if (run.aiT !== null && idx >= run.aiT && !handled.has(-1)) {
        handled.add(-1);
        app.toasts.show('AI 作为新质生产力登场');
        app.state.addChronicle({ when: `推演 t=${run.aiT}`, text: civEventText('AI'), layer: 4, kind: 'sim' });
      }
      if (run.momentT && user) {
        for (const [k, t] of run.momentT.entries()) {
          if (idx >= t && !handled.has(t) && t < run.tEnd + 1) {
            handled.add(t);
            const choice = await this.moment(k as 0 | 1);
            if (choice === 'launch') {
              run = simulateCiv({ eco, coop, seed, choice1962: k === 0 ? 'launch' : 'wait', choice1983: k === 1 ? 'launch' : 'wait' });
              this.run = run;
              app.state.setParams({ [k === 0 ? 'choice_1962' : 'choice_1983']: 'launch' });
            }
          }
        }
      }
      this.draw();
    }
    this.shown = run.P.length;
    this.draw();
    this.read.set('stage', STAGES[run.stage]);
    this.read.set('leaps', `${run.leaps.length} 次`);
    this.read.set('fate', run.fate === '延续' ? '延续至推演终点' : `${run.fate}（t = ${run.tEnd}）`);
    this.playing = false;
    if (run.fate !== '延续') {
      await this.lightsOut();
      if (user) {
        const detail = run.fate === '生态崩溃' ? '人与自然的张力越过阈值，生态系统无法再支撑这个文明。' : '掌握毁灭性力量之后，冲突失控了。';
        const choice = await app.fate(4, run.fate, detail);
        if (choice === 'new') {
          await this.dir.newUniverse();
          return run;
        }
        this.restoreSnapshot();
        app.planet.setLook({ dead: 0, city: 0.02 });
        this.buildPanel();
        app.state.setLayer(4, 'pending');
      }
    } else if (user) {
      this.passed = true;
      app.state.setLayer(4, 'ok');
      app.state.addChronicle({ when: '推演终点', text: '这个文明延续了下来。', layer: 4, kind: 'sim' });
      if (this.nextBtn) this.nextBtn.disabled = false;
    }
    return run;
  }

  private async lightsOut(): Promise<void> {
    const app = this.app;
    app.audio.extinct();
    this.rings!.setStreams(0);
    await app.tw.run(2600, (k) => app.planet.setLook({ city: (1 - k) * app.planet.look.city, dead: k * 0.85 }), ease.inOutSine);
  }

  /** 历史时刻：由观众做出选择。 */
  private async moment(k: 0 | 1): Promise<string> {
    const app = this.app;
    const guided = app.state.mode === 'guided';
    if (guided) {
      app.modals.auto = { value: 'wait', ms: app.autoMs(4200) };
      app.sayBg(k === 0 ? SCRIPT.civ1962 : SCRIPT.civ1983);
    }
    const v = await app.modals.open('', k === 0
      ? [h('div', { class: 'tag' }, '千钧一发 · 1962'), h('h2', {}, '深海中的潜艇'), h('p', {}, '古巴导弹危机期间，一艘失去联络的潜艇遭到深水炸弹警告。艇上携带核鱼雷，发射需要三名军官一致同意。两人已经同意，第三个人是你。')]
      : [h('div', { class: 'tag' }, '千钧一发 · 1983'), h('h2', {}, '预警系统的警报'), h('p', {}, '预警卫星报告：五枚导弹正在飞来。按照规程应立即上报，触发报复。系统刚投入使用，你只有几分钟做判断。')],
    k === 0
      ? [{ label: '投反对票', value: 'wait', primary: true }, { label: '同意发射', value: 'launch', danger: true }]
      : [{ label: '判断为误报，不上报', value: 'wait', primary: true }, { label: '按警报上报', value: 'launch', danger: true }]);
    app.modals.auto = null;
    if (v === 'wait') app.state.addChronicle({ when: k === 0 ? '1962' : '1983', text: k === 0 ? '有一个人投了反对票，核鱼雷没有发射。' : '值班军官判断警报是误报，世界继续运转。', layer: 4, kind: 'fact' });
    return v;
  }

  /** “另一个你”：Lorenz 双轨迹与同参数相邻宇宙的两个文明。 */
  async twin(): Promise<void> {
    const app = this.app;
    const p = app.state.params;
    const t = twinBody(Number(p.eco), Number(p.coop), app.state.seed);
    const shown = app.modals.info('蝴蝶效应', '另一个你', t.nodes, '回到实验舱');
    requestAnimationFrame(() => t.start());
    await shown;
    t.stop();
  }

  /** 默认推演：合作程度很低的平行文明。 */
  async demo(): Promise<void> {
    const app = this.app;
    await this.play(false, { eco: 0.5, coop: 0.05, seed: collapseSeed(), ms: app.state.mode === 'guided' ? 9000 : 10000 });
    await app.wait(800);
    await app.epiphany('civ');
    app.planet.setLook({ dead: 0, city: 0.02 });
    this.buildPanel();
  }

  private draw(): void {
    const c = this.chart;
    const run = this.run;
    if (!c || !c.isConnected) return;
    const { g, w, h: H } = fitCanvas(c, 210);
    g.clearRect(0, 0, w, H);
    if (!run) {
      g.fillStyle = COLORS.ink3;
      g.font = SANS_FONT;
      g.fillText('点击“推演这个文明”', w / 2 - 60, H / 2);
      return;
    }
    const L = 30;
    const Rm = 8;
    const top = 22;
    const midB = H - 70;
    const lowT = H - 58;
    const lowB = H - 18;
    const n = Math.min(this.shown, run.P.length);
    let maxLog = 4.5;
    run.P.forEach((v) => (maxLog = Math.max(maxLog, Math.log10(v) + 0.3)));
    const X = (t: number) => L + (t / HORIZON) * (w - L - Rm);
    const Y = (v: number) => midB - (Math.log10(Math.max(1, v)) / maxLog) * (midB - top);
    const Yl = (v: number) => lowB - (Math.min(1.2, v) / 1.2) * (lowB - lowT);
    const bounds = [0, ...run.leaps.filter((t) => t < n), Math.min(n, run.tEnd)];
    for (let s = 0; s < bounds.length - 1; s++) {
      const xa = X(bounds[s]);
      const xb = X(bounds[s + 1]);
      if (s % 2) {
        g.fillStyle = 'rgba(22,27,54,0.7)';
        g.fillRect(xa, top - 16, xb - xa, midB - top + 16);
      }
      g.fillStyle = COLORS.ink2;
      g.font = SANS_FONT;
      const label = xb - xa > 70 ? STAGES[s] : STAGES_SHORT[s];
      if (xb - xa > 24) g.fillText(label, xa + 3, top - 4);
    }
    g.setLineDash([3, 3]);
    g.strokeStyle = COLORS.gold;
    run.leaps.filter((t) => t < n).forEach((t) => {
      g.beginPath();
      g.moveTo(X(t), top - 16);
      g.lineTo(X(t), midB);
      g.stroke();
    });
    g.setLineDash([]);
    g.strokeStyle = COLORS.ruleStrong;
    g.beginPath();
    g.moveTo(L, midB);
    g.lineTo(w - Rm, midB);
    g.stroke();
    g.fillStyle = COLORS.ink3;
    g.font = MONO_FONT;
    for (let d = 0; d <= Math.floor(maxLog); d += 2) g.fillText(`10${'⁰¹²³⁴⁵⁶⁷⁸⁹'[d]}`, 2, Y(Math.pow(10, d)) + 4);
    const line = (arr: number[], yf: (v: number) => number, color: string, lw: number) => {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.beginPath();
      for (let i = 0; i < n; i++) (i ? g.lineTo(X(i), yf(arr[i])) : g.moveTo(X(i), yf(arr[i])));
      g.stroke();
    };
    line(run.R, Y, COLORS.cyan, 1.4);
    line(run.P, Y, COLORS.gold, 2.2);
    g.fillStyle = 'rgba(255,97,82,0.18)';
    g.beginPath();
    g.moveTo(X(0), Yl(0));
    for (let i = 0; i < n; i++) g.lineTo(X(i), Yl(run.C[i]));
    g.lineTo(X(Math.max(0, n - 1)), Yl(0));
    g.closePath();
    g.fill();
    line(run.C, Yl, COLORS.entropy, 1);
    line(run.E, Yl, COLORS.violet, 1.6);
    g.lineWidth = 1;
    g.setLineDash([4, 4]);
    g.strokeStyle = COLORS.violet;
    g.beginPath();
    g.moveTo(L, Yl(1));
    g.lineTo(w - Rm, Yl(1));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = COLORS.ink3;
    g.font = MONO_FONT;
    g.fillText('生态阈值', w - Rm - 58, Yl(1) - 3);
    if (run.momentT) run.momentT.forEach((t, k) => {
      if (t < n) {
        g.fillStyle = COLORS.cyan;
        g.fillText(k ? '1983' : '1962', X(t) - 12, midB + (k ? 22 : 11));
      }
    });
    if (n >= run.P.length && run.fate !== '延续') {
      const ex = X(run.tEnd);
      const ey = Y(run.P[run.P.length - 1]);
      g.strokeStyle = COLORS.entropy;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ex - 6, ey - 6);
      g.lineTo(ex + 6, ey + 6);
      g.moveTo(ex + 6, ey - 6);
      g.lineTo(ex - 6, ey + 6);
      g.stroke();
      g.fillStyle = COLORS.entropy;
      g.font = SANS_FONT;
      g.fillText(run.fate, Math.min(ex + 8, w - 60), ey + 4);
    }
  }

  refresh(): void {
    this.buildPanel();
  }

  async guided(): Promise<void> {
    const app = this.app;
    for (const line of SCRIPT.civ) await app.say(line);
    app.sayBg(SCRIPT.civDefault);
    await this.play(false, { eco: 0.5, coop: 0.05, seed: collapseSeed(), ms: 7000 });
    await app.say(SCRIPT.civCollapse);
    await app.epiphany('civ');
    app.planet.setLook({ dead: 0, city: 0.02 });
    this.buildPanel();
    app.sayBg(SCRIPT.civFix);
    await app.tw.run(1800, (k) => {
      this.sliders.coop.set(0.05 + (0.75 - 0.05) * k);
      this.sliders.eco.set(0.5 + (0.65 - 0.5) * k);
    }, ease.inOutCubic);
    app.state.setParams({ coop: 0.75, eco: 0.65 });
    this.updateMC();
    const run = await this.play(true, { eco: 0.65, coop: 0.75, seed: app.state.seed, ms: 16000 });
    app.check();
    if (run.aiT !== null) await app.say(SCRIPT.civAI);
    await app.say(SCRIPT.civMoments);
    await app.say(SCRIPT.civSurvive);
  }
}
