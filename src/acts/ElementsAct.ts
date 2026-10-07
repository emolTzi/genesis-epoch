// 第③幕 · 云腾致雨（L2 行星化学）：碳–硅酸盐恒温器，失控温室与雪球行星。

import * as THREE from 'three';
import { Act } from './Act';
import type { ActId } from '../data/script';
import { SCRIPT } from '../data/script';
import { perturbation } from '../sim/thermostat';
import { evalL1, evalL2, fmt } from '../sim/universe';
import type { LayerReport, ParamValue } from '../sim/types';
import type { PlanetLook } from '../render/Planet';
import { h, fitCanvas, COLORS, MONO_FONT } from '../ui/dom';
import { button, paramSlider, readouts, section, verdictBox, type SliderHandle } from '../ui/panel';
import { ease } from '../core/tween';
import { THEORY } from '../data/theory';

/** 由 L2 推演结果决定行星外观（尚无生命）。 */
export function lookFromClimate(l2: LayerReport): Partial<PlanetLook> {
  const t = Number(l2.values.temp);
  const title = l2.verdict.title;
  if (title === '失控温室' || title === '温室失控') return { scorch: 1, sea: 0.1, ice: 0, cloud: 1 };
  if (title === '永久冰封' || title === '雪球行星' || t < 260) return { scorch: 0, sea: 1, ice: 1, cloud: 0.35 };
  if (t < 273.15) return { scorch: 0, sea: 1, ice: 0.6, cloud: 0.45 };
  return { scorch: Math.max(0, (t - 330) / 40), sea: 1, ice: Math.max(0.04, Math.min(0.5, (290 - t) / 45 + 0.12)), cloud: 0.5 };
}

export class ElementsAct extends Act {
  readonly id = 'elements' as const;
  private sliders: Record<string, SliderHandle> = {};
  private read = readouts([
    ['板块构造', 'tect'],
    ['稳态 CO₂（相对工业化前）', 'co2'],
    ['稳态地表温度', 'temp'],
    ['有效辐照度', 'seff'],
  ]);
  private verdict = verdictBox();
  private chart: HTMLCanvasElement | null = null;
  private dTeq = 20;

  async enter(prev: ActId | null): Promise<void> {
    const app = this.app;
    app.sky.setMood(0x141a3c, 0x0a2a3a, 0.8);
    app.audio.setMood('elements');
    app.planet.setLook({ life: 0, city: 0, dead: 0, earth: 0, hazard: 0, scar: 0, ...lookFromClimate(app.state.report.L2) }, true);
    app.planet.spinRate = 0.08;
    app.planetRoot.position.set(0, 0, 0);
    const stars = this.dir.acts.stars as import('./StarsAct').StarsAct;
    if (prev === 'stars' && stars.system?.group.visible) {
      const sys = stars.system;
      const p = sys.planetWorld();
      const start = sys.group.position.clone();
      void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 6, el: 0.35 }, 1600);
      await app.tw.run(1600, (k) => sys.group.position.copy(start).lerp(p.clone().multiplyScalar(-1), k), ease.inOutCubic);
      app.rig.set({ dist: 3.8 });
      await app.dive(stars.systemFade, app.planetFade, 2600, 13, 7, 80, 0.03);
      sys.group.position.set(0, 0, 0);
    } else {
      void this.dir.clearStage([app.planetFade], 900);
      await app.fade(app.planetFade, app.planetRoot.visible ? 1 : 0, 1, 900);
      app.hud.setScale(7);
    }
    app.rig.minDist = 1.6;
    app.rig.maxDist = 12;
    void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 4.3, el: 0.18 }, 2000);
    this.buildPanel();
    this.takeSnapshot();
    this.commitStatus(false);
  }

  private buildPanel(): void {
    const app = this.app;
    const s = app.state;
    const locked = !s.has('elem');
    const on = (id: string) => (v: ParamValue) => this.change({ [id]: v });
    this.sliders = {
      outgassing: paramSlider('outgassing', Number(s.params.outgassing), on('outgassing'), { locked, fmt: (v) => `${v.toFixed(2)} × 地球` }),
      weathering: paramSlider('weathering', Number(s.params.weathering), on('weathering'), { locked, fmt: (v) => `${v.toFixed(2)} × 地球` }),
    };
    this.chart = h('canvas', { class: 'chart', 'aria-label': '恒星变亮后的地表温度响应：金色为有碳循环负反馈，红色为没有反馈' }) as HTMLCanvasElement;
    app.panel.open(
      this.meta,
      h('p', {}, '水能否长久保持液态，取决于一台看不见的恒温器：火山补充二氧化碳，岩石风化把它埋入海底。越热，风化越快，温度就降回来。'),
      section('行星恒温器', ...Object.values(this.sliders).map((x) => x.el),
        locked ? h('p', { class: 'hint' }, '元素之钥未解锁：先观看一次默认推演。') : null),
      section('读数', this.read.el, h('span', { class: 'eq' }, 'W = W₀·(pCO₂/p₀)^0.3·exp((T−288 K)/13.7 K)；T = T_eq + 33 K + 3 K·log₂(pCO₂/p₀)')),
      section('扰动实验：恒星变亮 +20 K', this.chart,
        h('div', { class: 'legend' }, h('span', {}, h('i', { style: `background:${COLORS.gold}` }), '有负反馈'), h('span', {}, h('i', { style: `background:${COLORS.entropy}` }), 'CO₂ 冻结不变'), h('span', {}, h('i', { style: `background:${COLORS.cyan}` }), '冰点 273 K')),
        h('p', { class: 'hint' }, '横轴为示意的时间单位（约百万年量级）。模型系数为示意取值，用来表达负反馈的方向与相对大小。')),
      section('推演结论', this.verdict.el),
      h('div', { class: 'btns' }, button(locked ? '观看默认推演' : '看一次默认推演：碳循环停摆', () => void this.demo())),
      this.nextButton('确认这一层，进入下一幕', () => void this.commit()),
    );
    this.update();
  }

  private change(changes: Record<string, ParamValue>): void {
    this.app.state.setParams(changes);
    this.update();
  }

  private update(): void {
    const s = this.app.state;
    const l1 = evalL1(s.params);
    const l2 = evalL2(s.params, l1);
    this.read.set('tect', l2.values.tectonics ? '活跃' : '停滞盖层');
    this.read.set('co2', `${fmt(Number(l2.values.co2))} 倍`);
    this.read.set('temp', `${Number(l2.values.temp).toFixed(1)} K（${(Number(l2.values.temp) - 273.15).toFixed(1)} °C）`);
    this.read.set('seff', `${Number(l1.values.seff).toFixed(3)}（内缘 1.015）`);
    this.verdict.set(l2.verdict);
    this.app.planet.setLook(lookFromClimate(l2));
    this.drawChart(Number(l1.values.teq), Number(l2.values.outEff), Number(l2.values.wthEff));
  }

  private drawChart(teq: number, out: number, wth: number): void {
    const c = this.chart;
    if (!c || !c.isConnected) return;
    const { g, w, h: H } = fitCanvas(c, 160);
    const curve = perturbation({ teq, outgassing: out, weathering: wth }, this.dTeq);
    const all = [...curve.withFeedback, ...curve.withoutFeedback, 273.15];
    const lo = Math.min(...all) - 4;
    const hi = Math.max(...all) + 4;
    const L = 38;
    const R = 8;
    const T = 10;
    const B = 18;
    const X = (i: number) => L + (i / (curve.t.length - 1)) * (w - L - R);
    const Y = (v: number) => T + ((hi - Math.min(hi, Math.max(lo, v))) / (hi - lo)) * (H - T - B);
    g.clearRect(0, 0, w, H);
    g.font = MONO_FONT;
    g.fillStyle = COLORS.ink3;
    g.strokeStyle = COLORS.rule;
    const step = Math.max(5, Math.round((hi - lo) / 4 / 5) * 5);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      g.beginPath();
      g.moveTo(L, Y(v));
      g.lineTo(w - R, Y(v));
      g.stroke();
      g.fillText(`${v.toFixed(0)}K`, 2, Y(v) + 4);
    }
    const i0 = curve.t.indexOf(0);
    g.setLineDash([3, 3]);
    g.strokeStyle = COLORS.ink3;
    g.beginPath();
    g.moveTo(X(i0), T);
    g.lineTo(X(i0), H - B);
    g.stroke();
    g.strokeStyle = COLORS.cyan;
    g.beginPath();
    g.moveTo(L, Y(273.15));
    g.lineTo(w - R, Y(273.15));
    g.stroke();
    g.setLineDash([]);
    const line = (arr: number[], color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      arr.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
      g.stroke();
    };
    line(curve.withoutFeedback, COLORS.entropy, 1.4);
    line(curve.withFeedback, COLORS.gold, 2.2);
    g.lineWidth = 1;
    g.fillStyle = COLORS.ink3;
    g.fillText('恒星变亮', X(i0) + 4, H - 4);
  }

  private commitStatus(final = true): void {
    const st = this.app.state.report.L2.verdict.status;
    if (final || st !== 'fail') this.app.state.setLayer(2, st);
  }

  /** 默认推演：风化停摆，CO₂ 无法移除，温室失控。 */
  async demo(): Promise<void> {
    const app = this.app;
    const w0 = Number(app.state.params.weathering);
    await app.tw.run(2600, (k) => {
      const w = w0 + (0.02 - w0) * k;
      this.sliders.weathering.set(w);
      this.change({ weathering: Math.round(w * 100) / 100 });
    }, ease.inOutCubic);
    this.change({ weathering: 0 });
    app.audio.extinct();
    await app.wait(1200);
    await app.epiphany('elem');
    this.buildPanel();
  }

  private async commit(): Promise<void> {
    const app = this.app;
    app.state.evaluate();
    const r = app.state.report.L2;
    if (r.verdict.status === 'fail') {
      const nature = THEORY.find((t) => t.id === 'nature')!;
      app.narrate({ text: `“${nature.quote}”`, ms: 7000 });
      const choice = await app.fate(2, r.verdict.title, r.verdict.detail);
      if (choice === 'new') return this.dir.newUniverse();
      this.restoreSnapshot();
      this.buildPanel();
      app.state.setLayer(2, 'pending');
      return;
    }
    if (app.state.report.L1.verdict.status === 'fail') {
      app.toasts.show('L1 已经失败：请回到第②幕调整轨道或恒星。', 'bad');
      return;
    }
    this.commitStatus();
    await this.dir.next();
  }

  refresh(): void {
    this.buildPanel();
  }

  async guided(): Promise<void> {
    const app = this.app;
    for (const line of SCRIPT.elements) await app.say(line);
    app.sayBg(SCRIPT.elementsDefault);
    await this.demo();
    app.check();
    app.sayBg(SCRIPT.elementsFix);
    await app.tw.run(2400, (k) => {
      const w = k;
      this.sliders.weathering.set(w);
      this.change({ weathering: Math.round(w * 100) / 100 });
    }, ease.inOutCubic);
    this.change({ weathering: 1 });
    await app.wait(4800);
    await app.say(SCRIPT.elementsQuote);
    this.commitStatus();
  }
}
