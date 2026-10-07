// 第①幕 · 天地玄黄（L0 物理常数）：大爆炸、宇宙网、α–α_s 可行孤岛。
// 回答“宇宙为什么允许生命存在”。本源之钥第一次游玩时封印，走完终章或以首席科学家身份校准后解锁。

import * as THREE from 'three';
import { Act } from './Act';
import type { Fadeable } from '../app/App';
import { CosmicWeb } from '../render/CosmicWeb';
import { SCRIPT, type ActId } from '../data/script';
import { HOYLE_WINDOW, evalL0 } from '../sim/universe';
import { h, fitCanvas, COLORS, MONO_FONT, SANS_FONT } from '../ui/dom';
import { button, paramSlider, section, verdictBox, type SliderHandle } from '../ui/panel';
import { ease } from '../core/tween';

const X_RANGE = 10;
const Y_RANGE = 5;

export class OriginAct extends Act {
  readonly id = 'origin' as const;
  web: CosmicWeb | null = null;
  webFade!: Fadeable;
  private canvas: HTMLCanvasElement | null = null;
  private verdict = verdictBox();
  private lambda: SliderHandle | null = null;
  private dragging = false;

  private ensureWeb(): CosmicWeb {
    if (!this.web) {
      this.web = new CosmicWeb(this.app.stage.count(60000));
      this.web.setPixelRatio(this.app.stage.renderer.getPixelRatio());
      this.web.group.visible = false;
      this.app.stage.scene.add(this.web.group);
      this.webFade = { group: this.web.group, setOpacity: (a) => this.web!.setOpacity(a) };
    }
    return this.web;
  }

  fadeables(): Fadeable[] {
    return this.web ? [this.webFade] : [];
  }

  async enter(prev: ActId | null): Promise<void> {
    const app = this.app;
    const web = this.ensureWeb();
    app.sky.setMood(0x1a1240, 0x061a33, 0.75);
    app.audio.setMood('origin');
    this.every((dt, t) => web.update(dt, t));
    void this.dir.clearStage([this.webFade], 1400);
    web.group.scale.setScalar(1);
    web.setOpacity(1);
    web.setDead(this.app.state.report.L0.verdict.status === 'fail' ? 1 : 0);
    app.rig.minDist = 4;
    app.rig.maxDist = 30;
    void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 13, el: 0.25 }, 2400);
    this.buildPanel();
    this.takeSnapshot();
    app.state.resetLayers(0);
    if (prev === 'hall' || prev === null) void this.bigBang(this.app.state.mode === 'guided' ? 9000 : 5200);
    else web.set(1, 1, 1);
    this.commitStatus();
  }

  async exit(): Promise<void> {
    await super.exit();
    this.canvas = null;
  }

  /** 大爆炸：粒子从奇点附近膨胀并冷却，随后第一代恒星点亮。 */
  async bigBang(ms: number): Promise<void> {
    const web = this.web!;
    web.set(0, 0, 0);
    this.app.audio.leap();
    await this.app.tw.run(ms, (k) => {
      web.set(ease.outCubic(Math.min(1, k * 1.4)), Math.min(1, k * 1.15), Math.max(0, (k - 0.65) / 0.35));
      this.app.hud.setScale(-14 + (25 + 14) * ease.outExpo(k));
    }, ease.linear);
  }

  private commitStatus(): void {
    const v = this.app.state.report.L0.verdict.status;
    this.app.state.setLayer(0, v === 'ok' ? 'ok' : v);
  }

  private buildPanel(): void {
    const app = this.app;
    const s = app.state;
    const core = s.has('core');
    this.canvas = h('canvas', { class: 'chart', 'aria-label': 'α–α_s 可行孤岛图：横轴为精细结构常数偏移，纵轴为强相互作用偏移，金色矩形为碳与氧同时充足的窗口' }) as HTMLCanvasElement;
    this.bindCanvas(this.canvas);
    this.lambda = paramSlider('lambda_ratio', Number(s.params.lambda_ratio), (v) => this.preview({ lambda_ratio: v }), {
      fmt: (v) => `${v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0)} 倍`,
      locked: !core,
    });
    this.verdict.set(s.report.L0.verdict);
    app.panel.open(
      this.meta,
      h('p', {}, '约一百三十八亿年前，宇宙从一个极热极密的状态开始膨胀。基本相互作用的强弱在这一刻写定，决定了原子能否稳定、恒星能否造出碳。'),
      section('可行孤岛 · α 与 α_s',
        this.canvas,
        h('div', { class: 'legend' }, h('span', {}, h('i', { style: `background:${COLORS.gold}` }), '碳与氧同时充足（±4% × ±0.5%）'), h('span', {}, h('i', { style: `background:${COLORS.entropy}` }), '碳或氧几乎消失')),
        h('p', { class: 'hint' }, `窗口约占图面积的 ${(((2 * HOYLE_WINDOW.alphaPct) / (2 * X_RANGE)) * ((2 * HOYLE_WINDOW.alphasPct) / (2 * Y_RANGE)) * 100).toFixed(0)}%。依据：Oberhummer, Csótó & Schlattl 2000, Science 289:88。`),
        core ? h('p', { class: 'hint' }, '本源之钥已解锁：在图上拖动坐标，改写这个宇宙的常数。') : h('p', { class: 'hint' }, '本源之钥封印中：这一次，宇宙按我们所知的常数诞生。走完终章，或以“首席科学家”身份校准后可以改写。'),
      ),
      section('宇宙学常数', this.lambda.el),
      section('推演结论', this.verdict.el, h('p', { class: 'hint' }, '注意：物理常数在整个宇宙中处处相同。它回答“宇宙为何允许生命”，不能解释“为何只看到我们”。')),
      core ? h('div', { class: 'btns' }, button('按这组常数创造宇宙', () => void this.commit())) : null,
      this.nextButton('继续：日月盈昃', () => void this.tryNext()),
    );
    requestAnimationFrame(() => this.drawIsland());
  }

  private bindCanvas(c: HTMLCanvasElement): void {
    const pick = (e: PointerEvent) => {
      if (!this.app.state.has('core')) return;
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = 1 - ((e.clientY - r.top) / r.height) * 2;
      const da = Math.round(Math.max(-1, Math.min(1, x)) * X_RANGE * 10) / 10;
      const ds = Math.round(Math.max(-1, Math.min(1, y)) * Y_RANGE * 20) / 20;
      this.preview({ alpha_dev: da, alphas_dev: ds });
    };
    c.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      c.setPointerCapture(e.pointerId);
      pick(e);
    });
    c.addEventListener('pointermove', (e) => this.dragging && pick(e));
    c.addEventListener('pointerup', () => (this.dragging = false));
  }

  /** 预览：直接改动参数并重新推演 L0。 */
  private preview(changes: Record<string, number>): void {
    this.app.state.setParams(changes);
    this.verdict.set(this.app.state.report.L0.verdict);
    this.drawIsland();
    this.web?.setDead(this.app.state.report.L0.verdict.status === 'fail' ? 0.7 : 0);
  }

  private drawIsland(): void {
    const c = this.canvas;
    if (!c || !c.isConnected) return;
    const { g, w, h: H } = fitCanvas(c, 190);
    const s = this.app.state;
    const X = (v: number) => ((v + X_RANGE) / (2 * X_RANGE)) * w;
    const Y = (v: number) => H - ((v + Y_RANGE) / (2 * Y_RANGE)) * H;
    g.clearRect(0, 0, w, H);
    g.fillStyle = 'rgba(255,97,82,0.10)';
    g.fillRect(0, 0, w, H);
    g.strokeStyle = COLORS.rule;
    g.lineWidth = 1;
    for (let v = -X_RANGE; v <= X_RANGE; v += 5) {
      g.beginPath();
      g.moveTo(X(v), 0);
      g.lineTo(X(v), H);
      g.stroke();
    }
    for (let v = -Y_RANGE; v <= Y_RANGE; v += 2.5) {
      g.beginPath();
      g.moveTo(0, Y(v));
      g.lineTo(w, Y(v));
      g.stroke();
    }
    const x0 = X(-HOYLE_WINDOW.alphaPct);
    const x1 = X(HOYLE_WINDOW.alphaPct);
    const y0 = Y(HOYLE_WINDOW.alphasPct);
    const y1 = Y(-HOYLE_WINDOW.alphasPct);
    g.fillStyle = 'rgba(245,198,107,0.35)';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = COLORS.gold;
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = COLORS.ink3;
    g.font = MONO_FONT;
    g.fillText('Δα/α →', w - 52, H - 6);
    g.fillText('Δα_s/α_s ↑', 6, 14);
    g.fillText('-10%', 4, H / 2 - 4);
    g.fillText('+10%', w - 34, H / 2 - 4);
    g.fillText('+5%', w / 2 + 4, 12);
    g.fillText('-5%', w / 2 + 4, H - 4);
    g.font = SANS_FONT;
    g.fillStyle = COLORS.gold;
    g.fillText('可行孤岛', x1 + 6, y0 - 4);
    const px = X(Number(s.params.alpha_dev));
    const py = Y(Number(s.params.alphas_dev));
    const ok = s.report.L0.checks[0].verdict.status === 'ok';
    g.fillStyle = ok ? COLORS.cyan : COLORS.entropy;
    g.beginPath();
    g.arc(px, py, 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = ok ? COLORS.cyan : COLORS.entropy;
    g.beginPath();
    g.arc(px, py, 10, 0, Math.PI * 2);
    g.stroke();
    if (!s.has('core')) {
      g.fillStyle = 'rgba(5,6,10,0.45)';
      g.fillRect(0, 0, w, H);
      g.fillStyle = COLORS.violet;
      g.font = SANS_FONT;
      g.fillText('本源之钥封印中', w / 2 - 42, H / 2 + 22);
    }
  }

  /** 按当前常数创造宇宙；若失败，文明链条在 L0 断裂。 */
  private async commit(): Promise<boolean> {
    const app = this.app;
    const rep = evalL0(app.state.params);
    app.state.evaluate();
    if (rep.verdict.status === 'fail') {
      this.web?.setDead(1);
      const fail = rep.checks.find((c) => c.verdict.status === 'fail')!;
      const choice = await app.fate(0, fail.verdict.title, fail.verdict.detail);
      if (choice === 'new') await this.dir.newUniverse();
      else {
        app.state.setParams({ alpha_dev: 0, alphas_dev: 0, lambda_ratio: 1 });
        this.web?.setDead(0);
        this.buildPanel();
        this.commitStatus();
      }
      return false;
    }
    this.web?.setDead(0);
    await this.bigBang(3500);
    this.commitStatus();
    return true;
  }

  private async tryNext(): Promise<void> {
    if (this.app.state.report.L0.verdict.status === 'fail') {
      await this.commit();
      return;
    }
    this.commitStatus();
    await this.dir.next();
  }

  refresh(): void {
    this.buildPanel();
    this.commitStatus();
  }

  async guided(): Promise<void> {
    const app = this.app;
    for (const line of SCRIPT.origin) await app.say(line);
    if (app.state.has('core')) {
      await app.say(SCRIPT.originOpen);
      this.preview({ alphas_dev: 1.2 });
      await app.wait(1600);
      this.preview({ alphas_dev: 0 });
    } else await app.say(SCRIPT.originSealed);
    await app.say(SCRIPT.originStars);
    this.commitStatus();
  }
}
