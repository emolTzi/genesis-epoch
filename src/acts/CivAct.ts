// 第⑤幕 · 文明动力学（L4 文明）：微观文明沙盘。
// 从行星表面俯冲到一张全息沙盘：聚落耕作、拓殖、贸易、传染、争战，政体的生产力与生产关系在其中涌现。
// 观众实时调节参量、回溯时间轴改写历史、直接干预，并在核危机时刻做出选择。

import * as THREE from 'three';
import { Act } from './Act';
import type { Fadeable } from '../app/App';
import type { ActId } from '../data/script';
import { SCRIPT } from '../data/script';
import { SandTable } from '../render/SandTable';
import { Sandbox, SB_DEFAULTS, SB_HORIZON, SB_STAGES, ERAS, type SandboxParams, type SbEvent, type Series, type SbFate, type Settlement } from '../sim/sandbox';
import { survivalRate } from '../sim/civ';
import { civEventText } from '../data/chronicle';
import { h, clear, fitCanvas, COLORS, MONO_FONT, SANS_FONT } from '../ui/dom';
import { button, paramSlider, readouts, section, type SliderHandle, folded, openSection } from '../ui/panel';
import { SandboxDock, EventFeed, StatTiles, popText, drawShare, type Tool } from '../ui/sandboxUi';
import { ease } from '../core/tween';
import { twinBody } from '../ui/twin';
import SbWorker from '../sim/sandbox.worker?worker&inline';

/** 1× 时每秒推演的步数。 */
const TICKS_PER_SEC = 7;
const STAGE_COLORS = ['#5b6180', '#7d6fd6', '#2fb5ad', '#e0b25c', '#e8705f'];
const PARAM_IDS = ['coop', 'eco', 'openness', 'reform'] as const;
const LOW_COOP: SandboxParams = { coop: 0.05, eco: 0.5, openness: 0.5, reform: 0.5 };

export class CivAct extends Act {
  readonly id = 'civ' as const;
  private table: SandTable | null = null;
  private tableFade!: Fadeable;
  private dock!: SandboxDock;
  private feed!: EventFeed;
  private tip!: HTMLElement;
  sb: Sandbox | null = null;
  /** 当前分支的初始参数（回溯重放用）。 */
  private params0: SandboxParams = { ...SB_DEFAULTS };
  /** 上一条分支的世界曲线，回溯后作为对照（蝴蝶效应）。 */
  private ghost: Series | null = null;
  private playing = false;
  private speed = 2;
  private acc = 0;
  private tool: Tool = 'look';
  /** 危机或结局弹窗进行中，暂停推演。 */
  private busy = false;
  /** 当前推演是否计入本宇宙（默认推演不计入）。 */
  private userRun = true;
  private passed = false;
  private uiClock = 0;
  private toastBudget = 0;
  private sliders: Partial<Record<(typeof PARAM_IDS)[number], SliderHandle>> = {};
  private chart: HTMLCanvasElement | null = null;
  private shareCv: HTMLCanvasElement | null = null;
  private inspector: HTMLElement | null = null;
  private verdictEl: HTMLElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  private tiles = new StatTiles([
    { id: 'pop', label: '世界人口', color: COLORS.gold },
    { id: 'pol', label: '政体', color: COLORS.cyan },
    { id: 'war', label: '进行中的战争', color: COLORS.entropy },
    { id: 'C', label: '平均矛盾 C', color: COLORS.entropy },
    { id: 'E', label: '人与自然张力 E', color: COLORS.violet },
    { id: 'P', label: '平均生产力 P', color: COLORS.gold },
  ]);
  private read = readouts([
    ['平均场估计 · 500 个宇宙', 'mf'],
    ['微观抽样 · 40 个宇宙', 'micro'],
  ]);
  private worker: Worker | null = null;
  private job = 0;
  private onCrisisResolved: (() => void) | null = null;

  fadeables(): Fadeable[] {
    return this.table ? [this.tableFade] : [];
  }

  private ensure(): void {
    if (this.table) return;
    const app = this.app;
    this.table = new SandTable();
    this.table.group.visible = false;
    app.stage.scene.add(this.table.group);
    this.tableFade = { group: this.table.group, setOpacity: (a) => this.table!.setOpacity(a) };
    this.dock = new SandboxDock({
      onPlay: () => this.setPlaying(!this.playing),
      onSpeed: (s) => this.setSpeed(s),
      onScrub: (t) => this.rewind(t),
      onTool: (t) => this.setTool(t),
    });
    this.feed = new EventFeed((e) => this.focusEvent(e));
    this.tip = h('div', { class: 'sb-tip', hidden: true });
    const root = app.panel.el.parentElement!;
    root.append(this.dock.el, this.feed.el, this.tip);
  }

  async enter(prev: ActId | null): Promise<void> {
    const app = this.app;
    this.ensure();
    const table = this.table!;
    app.sky.setMood(0x1d1238, 0x0c1f3a, 0.7);
    app.audio.setMood('civ');
    app.rig.minDist = 1.1;
    app.rig.maxDist = 16;
    this.passed = false;
    this.ghost = null;
    this.newRun(this.paramsFromState(), true);
    if (prev === 'life' && app.planetRoot.visible) {
      // 尺度连续缩放：从行星表面俯冲到一片大陆
      app.planet.setLook({ city: 0.1, dead: 0 });
      void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 4.2, el: 0.5 }, 1400);
      await app.wait(600).catch(() => {});
      await app.dive(app.planetFade, this.tableFade, 2400, 7, 6.6, 30, 0.08);
      app.rig.set({ dist: 9.4, el: 0.8 });
    } else {
      void this.dir.clearStage([this.tableFade], 900);
      table.group.scale.setScalar(1);
      app.rig.set({ target: new THREE.Vector3(0, 0, 0) });
      void app.rig.to(app.tw, { dist: 9.4, el: 0.8 }, 1600);
      await app.fade(this.tableFade, 0, 1, 1200);
    }
    app.hud.setScale(6.6);
    app.rig.autoRotate = 0.012;
    this.every((dt, t) => this.frame(dt, t));
    this.bindPointer();
    this.dock.el.hidden = false;
    this.feed.el.hidden = window.innerWidth < 900;
    document.body.classList.add('sb-on');
    this.dock.setGuided(app.state.mode === 'guided');
    this.dock.setSpeed(this.speed);
    this.buildPanel();
    this.takeSnapshot();
    if (app.state.mode === 'free' && app.state.has('civ')) this.setPlaying(true);
  }

  async exit(): Promise<void> {
    this.playing = false;
    this.busy = false;
    this.dock.el.hidden = true;
    this.feed.el.hidden = true;
    this.tip.hidden = true;
    document.body.classList.remove('sb-on');
    this.app.rig.autoRotate = 0.02;
    this.worker?.terminate();
    this.worker = null;
    await super.exit();
  }

  /* ───────── 推演控制 ───────── */

  private paramsFromState(): SandboxParams {
    const p = this.app.state.params;
    return { coop: Number(p.coop), eco: Number(p.eco), openness: Number(p.openness ?? 0.5), reform: Number(p.reform ?? 0.5) };
  }

  private baseTemp(): number {
    const t = Number(this.app.state.report.L2.values.temp);
    return isFinite(t) ? t : 288;
  }

  /** 新的一次推演（同一宇宙编号即同一片大陆、同一部历史）。 */
  private newRun(params: SandboxParams, user: boolean, seed = this.app.state.seed): void {
    this.params0 = { ...params };
    this.sb = new Sandbox(seed, params, this.baseTemp(), true);
    this.userRun = user;
    this.acc = 0;
    this.busy = false;
    this.table!.bind(this.sb);
    this.table!.select(null);
    this.feed.clear();
    this.feed.push(this.sb.events);
    this.app.planet.setLook({ city: 0.1, dead: 0 });
    if (this.sb.done) this.app.toasts.show('这颗行星上没有可以耕作的土地：上游的参量已经决定了这里不会有文明。', 'bad');
    this.refreshUi(true);
  }

  private setPlaying(p: boolean): void {
    if (p && this.sb?.done) {
      this.restart();
      return;
    }
    this.playing = p;
    this.dock.setPlaying(p);
  }

  private setSpeed(s: number): void {
    this.speed = s;
    this.dock.setSpeed(s);
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.dock.setTool(t);
    this.app.audio.click();
  }

  private restart(): void {
    this.ghost = null;
    this.newRun(this.paramsFromState(), true);
    this.setPlaying(true);
  }

  /** 时间轴回溯：从头确定性地重放到第 t 步，此后的历史由新的参量书写。 */
  rewind(t: number): void {
    const sb = this.sb;
    if (!sb || !this.app.state.has('civ')) return;
    const target = Math.max(0, Math.min(t, sb.t));
    if (target >= sb.t && !sb.done) return;
    this.ghost = sb.series;
    const log = sb.log.filter((e) => e.t < target);
    const next = Sandbox.replay(sb.seed, this.params0, sb.baseTemp, log, target, true);
    next.setParams(this.paramsFromState());
    this.sb = next;
    this.busy = false;
    this.table!.bind(next);
    this.feed.clear();
    this.feed.push(next.events.slice(-30));
    this.app.planet.setLook({ dead: 0 });
    if (this.userRun) this.app.state.setLayer(4, 'pending');
    this.app.toasts.show(`已回溯到第 ${Math.round(next.year)} 年。改变参量，看看历史会不会不同。`);
    this.app.state.addChronicle({ when: `沙盘第 ${Math.round(next.year)} 年`, text: '观测者回溯了时间，从这里开出一条新的历史分支。', layer: 4, kind: 'sim' });
    this.setPlaying(false);
    this.refreshUi(true);
  }

  private frame(dt: number, t: number): void {
    const app = this.app;
    const table = this.table!;
    const cam = app.stage.camera;
    table.attach(app.stage.renderer, app.stage.quality);
    table.setPointScale(app.stage.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360)), app.stage.renderer.getPixelRatio());
    table.update(dt, t);
    const sb = this.sb;
    if (!sb) return;
    if (this.playing && !this.busy && !sb.done) {
      const rate = app.state.mode === 'guided' ? app.tw.rate : 1;
      this.acc += dt * TICKS_PER_SEC * this.speed * rate;
      let n = 0;
      while (this.acc >= 1 && n < 12 && !sb.done && !sb.pendingCrisis) {
        this.acc -= 1;
        n++;
        this.handleEvents(sb.step());
      }
      if (n) table.sync();
      if (sb.pendingCrisis && !this.busy) void this.crisis();
      else if (sb.done && n) void this.ending();
    }
    this.toastBudget = Math.max(0, this.toastBudget - dt);
    this.uiClock += dt;
    if (this.uiClock > 0.2) {
      this.uiClock = 0;
      this.refreshUi();
    }
  }

  private handleEvents(events: SbEvent[]): void {
    if (!events.length) return;
    const app = this.app;
    const sb = this.sb!;
    this.feed.push(events);
    for (const e of events) {
      this.table!.burst(e);
      const lead = sb.leader();
      if (e.kind === 'era') {
        app.audio.leap();
        app.toasts.show(e.text);
        app.state.addChronicle({ when: `沙盘第 ${e.year} 年`, text: e.text, layer: 4, kind: 'sim' });
        if (sb.era === 8) app.state.addChronicle({ when: `沙盘第 ${e.year} 年`, text: civEventText('AI'), layer: 4, kind: 'sim' });
      } else if ((e.kind === 'leap' || e.kind === 'leap2') && lead && e.polity === lead.id) {
        app.audio.leap();
        if (this.toastBudget <= 0) {
          app.toasts.show(`质变：${e.text.split('：').pop()}`);
          this.toastBudget = 1.5;
        }
        app.state.addChronicle({ when: `沙盘第 ${e.year} 年`, text: civEventText(SB_STAGES[sb.polities[e.polity!].stage]), layer: 4, kind: 'sim' });
      } else if (e.kind === 'union' || e.kind === 'leap2') {
        app.toasts.show(e.text, 'key');
        app.state.addChronicle({ when: `沙盘第 ${e.year} 年`, text: e.text, layer: 4, kind: 'sim' });
      } else if (e.kind === 'nuke') {
        this.table!.nukeFlashes();
      }
    }
  }

  /** 核危机：两个拥有核武器的政体开战。前两次由观众抉择。 */
  private async crisis(): Promise<void> {
    const sb = this.sb!;
    const c = sb.pendingCrisis;
    if (!c) return;
    this.busy = true;
    const app = this.app;
    const p = this.table!.cellPos(c.cell);
    void app.rig.to(app.tw, { target: p, dist: 3.4, el: 0.85 }, 1200);
    const guided = app.state.mode === 'guided';
    if (guided) {
      app.modals.auto = { value: 'wait', ms: app.autoMs(4200) };
      app.sayBg(c.k === 0 ? SCRIPT.civ1962 : SCRIPT.civ1983);
    }
    const a = sb.polities[c.a].name;
    const b = sb.polities[c.b].name;
    const v = await app.modals.open('', c.k === 0
      ? [h('div', { class: 'tag' }, `千钧一发 · 沙盘第 ${Math.round(sb.year)} 年`), h('h2', {}, '深海中的潜艇'),
        h('p', {}, `${a}与${b}都拥有核武器，战争已经开始。一艘失去联络的潜艇遭到深水炸弹警告，发射核鱼雷需要三名军官一致同意。两人已经同意，第三个人是你。`),
        h('p', { class: 'src' }, '原型：1962 年古巴导弹危机中的 B-59 潜艇，阿尔希波夫投了反对票。')]
      : [h('div', { class: 'tag' }, `千钧一发 · 沙盘第 ${Math.round(sb.year)} 年`), h('h2', {}, '预警系统的警报'),
        h('p', {}, `${a}的预警卫星报告：${b}的五枚导弹正在飞来。按照规程应立即上报，触发报复。系统刚投入使用，你只有几分钟做判断。`),
        h('p', { class: 'src' }, '原型：1983 年预警卫星误报事件，值班军官彼得罗夫判断为系统故障。')],
    c.k === 0
      ? [{ label: '投反对票', value: 'wait', primary: true }, { label: '同意发射', value: 'launch', danger: true }]
      : [{ label: '判断为误报，不上报', value: 'wait', primary: true }, { label: '按警报上报', value: 'launch', danger: true }]);
    app.modals.auto = null;
    if (this.sb !== sb) return;
    if (v === 'wait') {
      app.state.addChronicle({ when: `沙盘第 ${Math.round(sb.year)} 年`, text: c.k === 0 ? '有一个人投了反对票，核鱼雷没有发射。' : '值班军官判断警报是误报，世界继续运转。', layer: 4, kind: 'sim' });
      if (this.userRun) app.state.setParams({ [c.k === 0 ? 'choice_1962' : 'choice_1983']: 'wait' });
    } else if (this.userRun) app.state.setParams({ [c.k === 0 ? 'choice_1962' : 'choice_1983']: 'launch' });
    sb.resolveCrisis(v === 'launch' ? 'launch' : 'wait');
    this.handleEvents(sb.events.slice(-3));
    this.table!.sync(true);
    void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 8.6, el: 0.95 }, 1400);
    this.busy = false;
    this.onCrisisResolved?.();
    if (sb.done) void this.ending();
  }

  /** 推演结束：熄灭、归档或延续。 */
  private async ending(): Promise<void> {
    const sb = this.sb!;
    if (this.busy) return;
    const fate = sb.fate as SbFate;
    this.playing = false;
    this.dock.setPlaying(false);
    this.refreshUi(true);
    const app = this.app;
    if (fate === '未能开始') return;
    if (fate !== '延续') {
      this.busy = true;
      app.audio.extinct();
      if (fate === '自我毁灭') this.table!.nukeFlashes();
      await app.tw.run(2600, (k) => app.planet.setLook({ dead: k * 0.85 }), ease.inOutSine);
      this.busy = false;
      if (!this.userRun || app.state.mode === 'guided' || this.sb !== sb) return;
      this.busy = true;
      const detail = fate === '生态崩溃' ? '人与自然的张力越过阈值，生态系统无法再支撑这个文明。' : '掌握毁灭性力量之后，冲突失控了。';
      const choice = await app.fate(4, fate, detail);
      this.busy = false;
      if (choice === 'new') {
        await this.dir.newUniverse();
        return;
      }
      // 回到灾难之前：给观众改写历史的机会
      const back = fate === '自我毁灭' ? Math.max(0, (sb.industrialT ?? sb.tEnd) - 10) : Math.max(0, sb.tEnd - 120);
      this.rewind(back);
      app.state.setLayer(4, 'pending');
    } else if (this.userRun) {
      this.passed = true;
      app.state.setLayer(4, 'ok');
      app.state.addChronicle({ when: `沙盘第 ${Math.round(sb.year)} 年`, text: '这个文明延续了下来。', layer: 4, kind: 'sim' });
      if (this.nextBtn) this.nextBtn.disabled = false;
      app.toasts.show('文明延续到了推演终点。', 'key');
    }
  }

  /* ───────── 指针：悬停与点击 ───────── */

  private bindPointer(): void {
    const app = this.app;
    const dom = app.stage.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null;
    let pending = false;
    let lastMove: PointerEvent | null = null;
    const pick = (e: PointerEvent): { cell: number; s: Settlement | null } | null => {
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, app.stage.camera);
      const hit = ray.intersectObject(this.table!.terrainMesh, false)[0];
      if (!hit || !this.sb) return null;
      const local = this.table!.group.worldToLocal(hit.point.clone());
      const cell = this.table!.cellFromLocal(local);
      if (cell === null) return null;
      return { cell, s: this.sb.settlementAt(cell, 1.4) };
    };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 6 || !quick || this.busy) return;
      const hit = pick(e);
      if (hit) this.click(hit.cell, hit.s);
    };
    const onMove = (e: PointerEvent) => {
      lastMove = e;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const ev = lastMove;
        if (!ev || down) {
          this.tip.hidden = true;
          return;
        }
        const hit = pick(ev);
        this.hover(hit?.s ?? null, ev);
      });
    };
    const onLeave = () => (this.tip.hidden = true);
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerleave', onLeave);
    this.disposers.push(() => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerleave', onLeave);
      dom.style.cursor = '';
    });
  }

  private hover(s: Settlement | null, e: PointerEvent): void {
    const dom = this.app.stage.renderer.domElement;
    if (!s || !this.sb) {
      this.tip.hidden = true;
      dom.style.cursor = this.tool === 'look' ? '' : 'crosshair';
      return;
    }
    const p = this.sb.polities[s.polity];
    clear(this.tip);
    const flag = s.ruined ? '废墟' : s.plague > 0 ? '瘟疫' : s.famine ? '饥荒' : '';
    this.tip.append(
      h('b', {}, s.name),
      h('span', {}, `${p.name} · ${popText(s.pop)} · ${ERAS[Math.min(8, Math.floor(p.tech))]}`),
    );
    if (flag) this.tip.append(h('em', { class: flag === '瘟疫' ? 'sick' : 'bad' }, flag));
    this.tip.style.left = `${e.clientX + 14}px`;
    this.tip.style.top = `${e.clientY + 12}px`;
    this.tip.hidden = false;
    dom.style.cursor = 'pointer';
  }

  private click(cell: number, s: Settlement | null): void {
    const app = this.app;
    const sb = this.sb;
    if (!sb) return;
    if (this.tool === 'look') {
      this.table!.select(s ? s.id : null);
      this.renderInspector();
      if (s) {
        app.audio.click();
        openSection(this.inspector);
      }
      return;
    }
    if (!app.state.has('civ')) {
      app.toasts.show('干预需要文明之钥：先观看一次默认推演。');
      return;
    }
    if (sb.done) {
      app.toasts.show('这次推演已经结束。拖动时间轴回到过去，再做干预。');
      return;
    }
    const e = sb.act({ type: this.tool, cell } as Parameters<Sandbox['act']>[0]);
    if (!e) {
      app.toasts.show(this.tool === 'peace' ? '这里没有正在进行的战争。' : '这里附近没有聚落。');
      return;
    }
    app.audio.click();
    this.handleEvents([e]);
    this.table!.sync(true);
    app.state.addChronicle({ when: `沙盘第 ${e.year} 年`, text: e.text, layer: 4, kind: 'sim' });
  }

  private focusEvent(e: SbEvent): void {
    if (e.cell === undefined || !this.table) return;
    const p = this.table.cellPos(e.cell);
    void this.app.rig.to(this.app.tw, { target: p, dist: 2.6, el: 0.8 }, 1200);
    this.table.ring(p.clone().setY(p.y + 0.01), 0x3ff2e6, 0.4, 1.4);
    const s = this.sb?.settlementAt(e.cell, 2.5);
    if (s) {
      this.table.select(s.id);
      this.renderInspector();
      openSection(this.inspector);
    }
  }

  /* ───────── 面板 ───────── */

  private buildPanel(): void {
    const app = this.app;
    const s = app.state;
    const locked = !s.has('civ');
    const on = (id: (typeof PARAM_IDS)[number]) => (v: number) => {
      app.state.setParams({ [id]: v });
      this.sb?.setParams({ [id]: v });
      this.scheduleMF();
    };
    this.sliders = {};
    for (const id of PARAM_IDS) this.sliders[id] = paramSlider(id, Number(s.params[id] ?? 0.5), on(id), { locked, fmt: (v) => v.toFixed(2) });
    this.chart = h('canvas', { class: 'chart', 'aria-label': '世界平均的生产力（金）、生产关系（青）、矛盾（红）与人与自然张力（紫）；灰色虚线为回溯前的分支' }) as HTMLCanvasElement;
    this.shareCv = h('canvas', { class: 'chart share', 'aria-label': '各社会形态的人口占比随时间变化' }) as HTMLCanvasElement;
    this.inspector = h('div', { class: 'insp' });
    this.verdictEl = h('div', { class: 'verdict' });
    this.nextBtn = button('进入终章：费米悖论', () => void this.dir.next(), 'primary');
    this.nextBtn.disabled = !this.passed;
    app.panel.open(
      this.meta,
      h('p', {}, '每一处灯火都是一座城邦：耕作、拓殖、贸易、争战。生产力与生产关系的矛盾在每个政体内部积累，越过阈值，社会形态随之更替。拖动参量，历史立刻改道。'),
      this.verdictEl,
      section('实时数据', this.tiles.el),
      folded('双环全息仪 · 世界平均', this.chart, this.shareCv,
        h('div', { class: 'legend' },
          h('span', {}, h('i', { style: `background:${COLORS.gold}` }), '生产力 P'),
          h('span', {}, h('i', { style: `background:${COLORS.cyan}` }), '生产关系 R'),
          h('span', {}, h('i', { style: `background:${COLORS.entropy}` }), '矛盾 C'),
          h('span', {}, h('i', { style: `background:${COLORS.violet}` }), '张力 E'),
        ),
        h('div', { class: 'legend' }, ...SB_STAGES.map((n, i) => h('span', {}, h('i', { style: `background:${STAGE_COLORS[i]}` }), n.replace('社会', '')))),
        h('p', { class: 'hint' }, '下方色带是各社会形态的人口占比：同一时刻，不同政体处在不同阶段，这就是社会发展的统一性与多样性。以历史唯物主义为框架的示意性模型，用于可视化理论机制，并非历史预测。'),
      ),
      folded('选中的聚落', this.inspector),
      section('文明参量 · 实时生效', ...PARAM_IDS.map((id) => this.sliders[id]!.el),
        locked ? h('p', { class: 'hint' }, '文明之钥未解锁：先观看一次默认推演。') : h('p', { class: 'hint' }, '推演进行中也可以拖动。开放交流让技术传得更快，也让瘟疫传得更快。')),
      folded('平行宇宙', this.read.el,
        h('p', { class: 'hint' }, '平均场估计来自宏观双环模型；微观抽样在后台线程中逐个推演同参数的沙盘宇宙。两者趋势一致，数值不必相同。'),
        h('div', { class: 'btns' }, button('运行微观抽样', () => this.sample()))),
      h('div', { class: 'btns' },
        locked ? button('观看默认推演', () => void this.demo(), 'primary') : button('从头推演', () => this.restart(), 'primary'),
        button('另一个你：蝴蝶效应', () => void this.twin()),
      ),
      h('div', { class: 'next' }, this.nextBtn),
    );
    this.dock.setLocked(locked);
    this.updateMF();
    this.renderInspector();
    this.refreshUi(true);
  }

  private mfTimer = 0;
  private scheduleMF(): void {
    clearTimeout(this.mfTimer);
    this.mfTimer = window.setTimeout(() => this.updateMF(), 180);
  }

  private updateMF(): void {
    const p = this.app.state.params;
    this.read.set('mf', `${Math.round(survivalRate(Number(p.eco), Number(p.coop)) * 100)}%`);
    this.read.set('micro', '点击下方按钮运行');
  }

  private sample(): void {
    this.worker?.terminate();
    this.worker = new SbWorker();
    const id = ++this.job;
    this.worker.onmessage = (e: MessageEvent<{ id: number; done: number; n: number; fates: Record<SbFate, number> }>) => {
      if (e.data.id !== id) return;
      const { done, n, fates } = e.data;
      const pct = Math.round((fates['延续'] / done) * 100);
      this.read.set('micro', done < n ? `${done}/${n} · 存活 ${pct}%` : `${pct}%（毁灭 ${fates['自我毁灭']} · 生态崩溃 ${fates['生态崩溃']}）`);
      if (done === n) {
        this.worker?.terminate();
        this.worker = null;
      }
    };
    this.worker.postMessage({ id, params: this.paramsFromState(), n: 40, baseTemp: this.baseTemp(), seed0: 1 });
    this.read.set('micro', '推演中…');
  }

  private refreshUi(force = false): void {
    const sb = this.sb;
    if (!sb || (!force && !this.app.panel.el.isConnected)) return;
    const s = sb.series;
    const n = s.pop.length - 1;
    const lead = sb.leader();
    const mainStage = s.share[n] ? s.share[n].indexOf(Math.max(...s.share[n])) : 0;
    this.dock.setWhen(Math.round(sb.year), ERAS[sb.era], `${SB_STAGES[Math.max(0, mainStage)]}为主`);
    this.dock.setTimeline(sb.t, SB_HORIZON);
    this.dock.setPlaying(this.playing);
    this.tiles.set('pop', popText(sb.worldPop()), s.pop, true);
    this.tiles.set('pol', `${s.polities[n]} 个`, s.polities);
    this.tiles.set('war', `${sb.wars.length} 场`, s.wars);
    this.tiles.set('C', s.C[n].toFixed(2), s.C);
    this.tiles.set('E', s.E[n].toFixed(2), s.E);
    this.tiles.set('P', lead ? `10^${Math.log10(Math.max(1, s.P[n])).toFixed(1)}` : '—', s.P, true);
    this.drawChart();
    if (this.shareCv) drawShare(this.shareCv, s.share, SB_HORIZON, STAGE_COLORS);
    if (this.table?.selected !== null) this.renderInspector();
    this.renderVerdict();
  }

  private renderVerdict(): void {
    const el = this.verdictEl;
    const sb = this.sb;
    if (!el || !sb) return;
    clear(el);
    const f = sb.fate;
    if (!f) {
      el.className = 'verdict';
      el.append(h('b', {}, this.playing ? '推演进行中' : '已暂停'), `。沙盘第 ${Math.round(sb.year)} 年，${sb.wars.length ? `${sb.wars.length} 场战争正在进行` : '暂无战争'}，人与自然张力 ${Math.min(1, sb.E).toFixed(2)}。`);
    } else if (f === '延续') {
      el.className = 'verdict ok';
      el.append(h('b', {}, '文明延续'), `。推演到达第 ${Math.round(sb.year)} 年${sb.union ? '，主要政体结成了命运与共的共同体' : ''}。`);
    } else if (f === '未能开始') {
      el.className = 'verdict fail';
      el.append(h('b', {}, '文明无从开始'), '。上游的轨道、恒星或行星恒温器让地表过冷或过热，找不到可以耕作的土地。');
    } else {
      el.className = 'verdict fail';
      el.append(h('b', {}, f), `。沙盘第 ${Math.round(sb.year)} 年。拖动下方时间轴回到过去，改变参量或直接干预，改写这段历史。`);
    }
  }

  private renderInspector(): void {
    const el = this.inspector;
    const sb = this.sb;
    if (!el || !sb) return;
    clear(el);
    const id = this.table?.selected;
    const s = id !== null && id !== undefined ? sb.settlements[id] : null;
    if (!s) {
      el.append(h('p', { class: 'hint' }, '用“观察”工具点击沙盘上的任意聚落，查看它的人口、时代、社会形态与它自己的历史。'));
      return;
    }
    const p = sb.polities[s.polity];
    const status = s.ruined ? '废墟' : s.plague > 0 ? '瘟疫流行' : s.famine ? '饥荒' : sb.wars.some((w) => w.a === p.id || w.b === p.id) ? '战争中' : '安定';
    const links = sb.routes.filter((r) => r.a === s.id || r.b === s.id).length;
    el.append(
      h('div', { class: 'insp-h' }, h('i', { style: `background:hsl(${Math.round(p.hue * 360)},78%,58%)` }), h('b', {}, s.name), h('span', {}, `${p.name} · 建于第 ${s.founded} 步`)),
      h('dl', { class: 'read' },
        ...[
          ['人口 / 承载力', `${popText(s.pop)} / ${popText(s.cap)}`],
          ['技术时代', ERAS[Math.min(8, Math.floor(p.tech))]],
          ['社会形态', SB_STAGES[p.stage]],
          ['生产力 P · 矛盾 C', `10^${Math.log10(Math.max(1, p.P)).toFixed(1)} · ${p.C.toFixed(2)}`],
          ['商路', `${links} 条`],
          ['状态', status],
        ].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
      ),
      h('ol', { class: 'hist' }, ...s.log.slice().reverse().map((l) => h('li', { class: 'on' }, l.text))),
    );
  }

  private drawChart(): void {
    const c = this.chart;
    const sb = this.sb;
    if (!c || !c.isConnected || !sb) return;
    const { g, w, h: H } = fitCanvas(c, 190);
    g.clearRect(0, 0, w, H);
    const s = sb.series;
    const L = 30;
    const Rm = 8;
    const top = 14;
    const midB = H - 62;
    const lowT = H - 52;
    const lowB = H - 16;
    const maxLog = 4.8;
    const X = (t: number) => L + (t / SB_HORIZON) * (w - L - Rm);
    const Y = (v: number) => midB - (Math.min(maxLog, Math.log10(Math.max(1, v))) / maxLog) * (midB - top);
    const Yl = (v: number) => lowB - (Math.min(1.2, v) / 1.2) * (lowB - lowT);
    g.strokeStyle = COLORS.ruleStrong;
    g.beginPath();
    g.moveTo(L, midB);
    g.lineTo(w - Rm, midB);
    g.stroke();
    g.fillStyle = COLORS.ink3;
    g.font = MONO_FONT;
    for (let d = 0; d <= 4; d += 2) g.fillText(`10${'⁰¹²³⁴'[d]}`, 2, Y(Math.pow(10, d)) + 4);
    const line = (arr: number[], yf: (v: number) => number, color: string, lw: number, dash: number[] = []) => {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.setLineDash(dash);
      g.beginPath();
      arr.forEach((v, i) => (i ? g.lineTo(X(i), yf(v)) : g.moveTo(X(i), yf(v))));
      g.stroke();
      g.setLineDash([]);
    };
    if (this.ghost) {
      line(this.ghost.P, Y, 'rgba(169,174,202,0.45)', 1.2, [4, 3]);
      line(this.ghost.E, Yl, 'rgba(169,174,202,0.35)', 1, [4, 3]);
    }
    line(s.R, Y, COLORS.cyan, 1.3);
    line(s.P, Y, COLORS.gold, 2);
    g.fillStyle = 'rgba(255,97,82,0.18)';
    g.beginPath();
    g.moveTo(X(0), Yl(0));
    s.C.forEach((v, i) => g.lineTo(X(i), Yl(v)));
    g.lineTo(X(s.C.length - 1), Yl(0));
    g.closePath();
    g.fill();
    line(s.E, Yl, COLORS.violet, 1.6);
    g.setLineDash([4, 4]);
    g.strokeStyle = COLORS.violet;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(L, Yl(1));
    g.lineTo(w - Rm, Yl(1));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = COLORS.ink3;
    g.fillText('生态阈值', w - Rm - 58, Yl(1) - 3);
    // 事件刻度：时代更替（金）、核危机（品红）
    for (const e of sb.events) {
      if (e.kind === 'era') {
        g.fillStyle = COLORS.gold;
        g.fillRect(X(e.t), midB + 1, 1, 5);
      } else if (e.kind === 'crisis') {
        g.fillStyle = '#ff4bd0';
        g.fillRect(X(e.t) - 1, top - 6, 2, midB - top + 6);
      }
    }
    // 当前时刻
    g.strokeStyle = 'rgba(231,233,243,0.5)';
    g.beginPath();
    g.moveTo(X(sb.t), top - 8);
    g.lineTo(X(sb.t), lowB);
    g.stroke();
    if (sb.fate && sb.fate !== '延续' && sb.fate !== '未能开始') {
      const ex = X(sb.tEnd);
      const ey = Y(s.P[s.P.length - 1]);
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
      g.fillText(sb.fate, Math.min(ex + 8, w - 60), ey + 4);
    }
    g.fillStyle = COLORS.ink3;
    g.font = MONO_FONT;
    const yr = s.year;
    g.fillText(`第 ${yr[0]} 年`, L, H - 2);
    const last = `第 ${yr[yr.length - 1]} 年`;
    g.fillText(last, Math.min(X(yr.length - 1), w - Rm - g.measureText(last).width), H - 2);
  }

  refresh(): void {
    // 观测者在本宇宙中应用了改动：参量实时注入正在进行的推演
    const p = this.paramsFromState();
    this.sb?.setParams(p);
    for (const id of PARAM_IDS) this.sliders[id]?.set(p[id]);
    this.updateMF();
  }

  /* ───────── 默认推演、蝴蝶效应与导览 ───────── */

  /** “另一个你”：Lorenz 双轨迹与同参数相邻宇宙的两个文明。 */
  async twin(): Promise<void> {
    const app = this.app;
    const p = app.state.params;
    const was = this.playing;
    this.setPlaying(false);
    const t = twinBody(Number(p.eco), Number(p.coop), app.state.seed);
    const shown = app.modals.info('蝴蝶效应', '另一个你', t.nodes, '回到实验舱');
    requestAnimationFrame(() => t.start());
    await shown;
    t.stop();
    if (was) this.setPlaying(true);
  }

  /** 默认推演：合作程度很低的文明。没有文明之钥时观看，结束后顿悟解锁。 */
  async demo(): Promise<void> {
    const app = this.app;
    this.newRun(LOW_COOP, false);
    this.sb!.interactive = false;
    for (const id of PARAM_IDS) this.sliders[id]?.set(LOW_COOP[id]);
    this.setSpeed(8);
    this.setPlaying(true);
    app.narrate(SCRIPT.civDefault);
    await this.until(() => !!this.sb?.done && !this.busy);
    await app.wait(2800);
    await app.epiphany('civ');
    app.planet.setLook({ dead: 0 });
    this.setSpeed(2);
    this.buildPanel();
    this.ghost = this.sb!.series;
    const back = Math.max(0, (this.sb!.industrialT ?? this.sb!.tEnd) - 20);
    this.userRun = true;
    this.rewind(back);
    this.app.toasts.show('文明之钥已在手：调高合作，再从这里推演一次。', 'key');
  }

  /** 等待某个条件成立（受导览中止影响）。 */
  private async until(cond: () => boolean): Promise<void> {
    while (!cond()) await this.app.wait(120);
  }

  async guided(): Promise<void> {
    const app = this.app;
    const sb0 = () => this.sb!;
    // 序：沙盘开始运转
    this.newRun(LOW_COOP, false);
    for (const id of PARAM_IDS) this.sliders[id]?.set(LOW_COOP[id]);
    // 旁白期间慢速推演农耕与古代，旁白结束后加速进入工业时代
    this.setSpeed(2);
    this.setPlaying(true);
    let resolved = 0;
    this.onCrisisResolved = () => {
      resolved++;
      // 第二次危机之后立即定格，留出旁白的时间
      if (resolved === 2 && !sb0().done) this.setPlaying(false);
    };
    for (const line of SCRIPT.civ) await app.say(line);
    app.sayBg(SCRIPT.civDefault);
    this.setSpeed(6);
    // 两次危机：个人的克制
    await this.until(() => resolved >= 2 || sb0().done);
    if (resolved >= 2 && !sb0().done) {
      await app.say(SCRIPT.civMoments);
      this.setPlaying(true);
    }
    await this.until(() => sb0().done && !this.busy);
    this.onCrisisResolved = null;
    await app.say(SCRIPT.civCollapse);
    await app.epiphany('civ');
    app.planet.setLook({ dead: 0 });
    this.buildPanel();
    // 回到工业时代之前，改写参量
    app.sayBg(SCRIPT.civFix);
    const sb = sb0();
    this.ghost = sb.series;
    const back = Math.max(0, (sb.industrialT ?? sb.tEnd) - 20);
    await app.tw.run(1800, (k) => {
      this.sliders.coop?.set(0.05 + (0.75 - 0.05) * k);
      this.sliders.eco?.set(0.5 + (0.65 - 0.5) * k);
    }, ease.inOutCubic);
    app.state.setParams({ coop: 0.75, eco: 0.65 });
    this.userRun = true;
    this.rewind(back);
    this.setSpeed(8);
    this.setPlaying(true);
    await this.until(() => sb0().era >= 8 || sb0().done);
    if (sb0().era >= 8) await app.say(SCRIPT.civAI);
    await this.until(() => sb0().done && !this.busy);
    app.check();
    if (sb0().fate === '延续') await app.say(SCRIPT.civSurvive);
  }
}

