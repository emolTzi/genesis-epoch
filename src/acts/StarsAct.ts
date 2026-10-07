// 第②幕 · 日月盈昃（L1 天体）：从宇宙网潜入银河系，再潜入恒星系；宜居带与平衡温度。

import * as THREE from 'three';
import { Act } from './Act';
import type { Fadeable } from '../app/App';
import { Galaxy } from '../render/Galaxy';
import { StarSystem } from '../render/StarSystem';
import { SCRIPT, type ActId } from '../data/script';
import { evalL1, fmt } from '../sim/universe';
import { h } from '../ui/dom';
import { button, paramSlider, readouts, section, stateChip, verdictBox, type SliderHandle } from '../ui/panel';
import type { ParamValue } from '../sim/types';
import { ease } from '../core/tween';

export class StarsAct extends Act {
  readonly id = 'stars' as const;
  galaxy: Galaxy | null = null;
  system: StarSystem | null = null;
  galaxyFade!: Fadeable;
  systemFade!: Fadeable;
  private sliders: Record<string, SliderHandle> = {};
  private read = readouts([
    ['恒星光度 L★', 'L'],
    ['主序寿命', 'life'],
    ['保守宜居带', 'hz'],
    ['平衡温度 T_eq', 'teq'],
    ['地表一阶估计', 'ts'],
    ['逃逸速度', 'vesc'],
  ]);
  private verdict = verdictBox();
  private checksEl = h('div', { class: 'read' });
  private moonBtns: HTMLButtonElement[] = [];

  private ensure(): void {
    const app = this.app;
    if (!this.galaxy) {
      this.galaxy = new Galaxy(app.stage.count(42000));
      this.galaxy.setPixelRatio(app.stage.renderer.getPixelRatio());
      this.galaxy.group.visible = false;
      app.stage.scene.add(this.galaxy.group);
      this.galaxyFade = { group: this.galaxy.group, setOpacity: (a) => this.galaxy!.setOpacity(a) };
    }
    if (!this.system) {
      this.system = new StarSystem();
      this.system.group.visible = false;
      app.stage.scene.add(this.system.group);
      this.systemFade = { group: this.system.group, setOpacity: (a) => this.system!.setOpacity(a) };
    }
  }

  fadeables(): Fadeable[] {
    return this.system ? [this.galaxyFade, this.systemFade] : [];
  }

  async enter(prev: ActId | null): Promise<void> {
    const app = this.app;
    this.ensure();
    const sys = this.system!;
    const gal = this.galaxy!;
    app.sky.setMood(0x1c1648, 0x08223f, 0.85);
    app.audio.setMood('stars');
    this.every((dt, t) => {
      gal.update(dt);
      sys.update(dt, t, !app.reduced);
    });
    sys.group.position.set(0, 0, 0);
    this.syncVisuals();
    app.rig.minDist = 3;
    app.rig.maxDist = 26;
    this.buildPanel();
    const origin = this.dir.acts.origin as import('./OriginAct').OriginAct;
    if (prev === 'origin' && origin.web) {
      void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 12, el: 0.5 }, 2000);
      await app.dive(origin.webFade, this.galaxyFade, 2800, 25, 21, 40, 0.03);
      await app.wait(app.state.mode === 'guided' ? 1400 : 600).catch(() => {});
      sys.setDisk(1);
      sys.setOthers(0);
      await app.dive(this.galaxyFade, this.systemFade, 2600, 21, 13, 60, 0.02);
      void this.formPlanets();
    } else {
      void this.dir.clearStage([this.systemFade], 900);
      sys.setDisk(0);
      sys.setOthers(1);
      await app.fade(this.systemFade, 0, 1, 900);
      app.hud.setScale(13);
    }
    void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 10, el: 0.62, az: 0.2 }, 2200);
    this.takeSnapshot();
    this.commitStatus(false);
  }

  /** 吸积盘消散，行星成形。 */
  private async formPlanets(): Promise<void> {
    const sys = this.system!;
    await this.app.tw.run(4200, (k) => {
      sys.setDisk(1 - k);
      sys.setOthers(k);
    }, ease.inOutSine);
  }

  private syncVisuals(): void {
    const s = this.app.state;
    const sys = this.system!;
    const r = s.report.L1;
    sys.setStar(Number(r.values.tStar), Number(r.values.L));
    sys.setHabitableZone(Number(r.values.hzInner), Number(r.values.hzOuter));
    sys.setOrbit(Number(s.params.orbit_a));
    const water = r.checks.find((c) => c.id === 'water')!.verdict;
    sys.setPlanetColor(water.title === '冰封' ? 0xbfe3f2 : water.title === '蒸干' ? 0xe0603a : water.status === 'warn' ? 0xa497ff : 0x3e8fb0);
  }

  private buildPanel(): void {
    const app = this.app;
    const s = app.state;
    const locked = !s.has('star');
    const on = (id: string) => (v: ParamValue) => this.change({ [id]: v });
    this.sliders = {
      star_mass: paramSlider('star_mass', Number(s.params.star_mass), on('star_mass'), { locked }),
      orbit_a: paramSlider('orbit_a', Number(s.params.orbit_a), on('orbit_a'), { locked }),
      albedo: paramSlider('albedo', Number(s.params.albedo), on('albedo'), { locked, fmt: (v) => v.toFixed(2) }),
      planet_mass: paramSlider('planet_mass', Number(s.params.planet_mass), on('planet_mass'), { locked }),
    };
    this.moonBtns = [true, false].map((v) =>
      h('button', { type: 'button', 'aria-pressed': String(s.params.moon === v), onclick: () => this.change({ moon: v }) }, v ? '有大卫星' : '没有大卫星') as HTMLButtonElement,
    );
    app.panel.open(
      this.meta,
      h('p', {}, '在一条旋臂的外缘，气体坍缩成恒星，剩下的尘埃在盘中聚成行星。行星能否拥有液态水，首先取决于它离恒星多远。'),
      section('恒星与行星', ...Object.values(this.sliders).map((x) => x.el), h('div', { class: 'seg', role: 'group', 'aria-label': '大卫星' }, ...this.moonBtns)),
      section('读数', this.read.el, h('span', { class: 'eq' }, 'T_eq = [L★(1−A)/(16πσa²)]^¼ = T★·√(R★/2a)·(1−A)^¼')),
      section('推演结论', this.verdict.el, this.checksEl),
      h('div', { class: 'btns' }, button('看一次默认推演：2.4 AU', () => void this.demo())),
      h('p', { class: 'hint' }, '画面中恒星与行星的大小经过放大，轨道距离按比例（1 AU = 2.2 个场景单位）。'),
      this.nextButton('确认这一层，进入下一幕', () => void this.commit()),
    );
    this.updateReadouts();
  }

  private change(changes: Record<string, ParamValue>): void {
    this.app.state.setParams(changes);
    this.moonBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(this.app.state.params.moon === (i === 0))));
    this.syncVisuals();
    this.updateReadouts();
  }

  private updateReadouts(): void {
    const r = evalL1(this.app.state.params);
    const v = r.values;
    this.read.set('L', `${fmt(Number(v.L))} L☉`);
    this.read.set('life', `${fmt(Number(v.life))} Gyr`);
    this.read.set('hz', `${Number(v.hzInner).toFixed(2)}–${Number(v.hzOuter).toFixed(2)} AU`);
    this.read.set('teq', `${Number(v.teq).toFixed(1)} K`);
    this.read.set('ts', `${Number(v.tFirst).toFixed(1)} K（${(Number(v.tFirst) - 273.15).toFixed(1)} °C）`);
    this.read.set('vesc', `${Number(v.vesc).toFixed(1)} km/s`);
    this.verdict.set(r.verdict);
    this.checksEl.replaceChildren(...r.checks.map((c) => h('div', {}, h('dt', {}, c.label), h('dd', {}, stateChip(c.verdict.status, c.verdict.title)))));
  }

  private commitStatus(final = true): void {
    const st = this.app.state.report.L1.verdict.status;
    if (final || st !== 'fail') this.app.state.setLayer(1, st);
  }

  /** 默认推演：行星在 2.4 AU 处形成并冰封，随后给出顿悟讲解。 */
  async demo(): Promise<void> {
    const app = this.app;
    const a0 = Number(app.state.params.orbit_a);
    await app.tw.run(2600, (k) => {
      const a = a0 + (2.4 - a0) * k;
      this.sliders.orbit_a.set(a);
      this.change({ orbit_a: Math.round(a * 100) / 100, albedo: 0.3 });
    }, ease.inOutCubic);
    await app.epiphany('star');
  }

  private async commit(): Promise<void> {
    const app = this.app;
    app.state.evaluate();
    const r = app.state.report.L1;
    if (r.verdict.status === 'fail') {
      const fail = r.checks.find((c) => c.verdict.status === 'fail')!;
      const choice = await app.fate(1, fail.verdict.title, fail.verdict.detail);
      if (choice === 'new') return this.dir.newUniverse();
      this.restoreSnapshot();
      this.buildPanel();
      this.syncVisuals();
      app.state.setLayer(1, 'pending');
      return;
    }
    this.commitStatus();
    await this.dir.next();
  }

  refresh(): void {
    this.buildPanel();
    this.syncVisuals();
  }

  async guided(): Promise<void> {
    const app = this.app;
    for (const line of SCRIPT.stars) await app.say(line);
    app.sayBg(SCRIPT.starsDefault);
    await this.demo();
    app.check();
    const a0 = Number(app.state.params.orbit_a);
    app.sayBg(SCRIPT.starsFix);
    await app.tw.run(2600, (k) => {
      const a = a0 + (1 - a0) * k;
      this.sliders.orbit_a.set(a);
      this.change({ orbit_a: Math.round(a * 100) / 100 });
    }, ease.inOutCubic);
    this.change({ orbit_a: 1 });
    await app.wait(2400);
    this.commitStatus();
  }
}
