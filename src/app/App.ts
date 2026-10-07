// 应用总装：渲染、状态、界面、声音、观测者·零号与章节导演。

import * as THREE from 'three';
import { Stage, setGroupOpacity } from '../render/Stage';
import { Sky } from '../render/Sky';
import { Planet } from '../render/Planet';
import { Armillary } from '../render/Armillary';
import { Hall } from '../render/Hall';
import { CameraRig } from '../render/CameraRig';
import { Tweens, ease } from '../core/tween';
import { State } from './state';
import { Hud } from '../ui/hud';
import { Subtitle, Toasts, Modals } from '../ui/overlays';
import { Panel } from '../ui/panel';
import { ObserverPanel } from '../ui/observerPanel';
import { Archive } from '../ui/archive';
import { Graveyard, Settings } from '../ui/drawers';
import { AudioEngine } from '../audio/AudioEngine';
import { Observer } from '../llm/observer';
import { EPIPHANIES } from '../data/epiphanies';
import { HAZARD_CAPS } from '../sim/kpg';
import type { Line } from '../data/script';
import type { KeyId, ParamValue } from '../sim/types';
import { KEY_NAMES } from '../sim/types';

export class GuideAbort extends Error {}

/** 可在场景间淡入淡出的对象。 */
export interface Fadeable {
  group: THREE.Object3D;
  setOpacity?: (a: number) => void;
}

export class App {
  readonly stage: Stage;
  readonly tw = new Tweens();
  readonly state = new State();
  readonly sky: Sky;
  readonly planet: Planet;
  readonly armillary = new Armillary();
  readonly hall = new Hall();
  readonly rig: CameraRig;
  readonly audio = new AudioEngine();
  readonly observer: Observer;
  readonly hud: Hud;
  readonly subtitle = new Subtitle();
  readonly toasts = new Toasts();
  readonly modals = new Modals();
  readonly panel = new Panel();
  readonly observerPanel: ObserverPanel;
  readonly archive: Archive;
  readonly graveyard: Graveyard;
  readonly settings: Settings;
  readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** 每帧回调（各幕注册）。 */
  private updaters = new Set<(dt: number, t: number) => void>();
  guideAbort = false;
  guidePaused = false;
  /** 导览的正常倍速（预览参数 ?speed= 可调）。 */
  guideRate = 1;
  guideStart = 0;
  guideElapsed = 0;
  readonly hallRoot = new THREE.Group();
  /** 行星的承载组：各幕可移动它而不影响行星自身的自转。 */
  readonly planetRoot = new THREE.Group();
  /** 大厅（浑天仪 + 地台 + 墓园）的整体淡入淡出。 */
  readonly hallFade: Fadeable = {
    group: this.hallRoot,
    setOpacity: (a: number) => {
      this.armillary.setOpacity(a);
      this.hall.setOpacity(a);
      this.hallRoot.visible = a > 0.002;
    },
  };
  /** 行星的整体淡入淡出。 */
  readonly planetFade: Fadeable = {
    group: this.planetRoot,
    setOpacity: (a: number) => {
      this.planet.setOpacity(a);
      this.planetRoot.visible = a > 0.002;
    },
  };

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, handlers: { onAct: (id: import('../data/script').ActId) => void; onMode: () => void; onSkip: () => void; onExitGuide: () => void }) {
    this.stage = new Stage(canvas);
    this.sky = new Sky(this.stage.count(5000));
    this.stage.scene.add(this.sky.group);
    this.planet = new Planet(3, this.stage.quality === 'low' ? 96 : 160);
    this.planet.setCaps(HAZARD_CAPS);
    this.planetRoot.add(this.planet.group);
    this.hallRoot.add(this.armillary.group, this.hall.group);
    this.stage.scene.add(this.hallRoot, this.planetRoot);
    this.rig = new CameraRig(this.stage.camera, canvas);
    this.stage.onQualityChange = (q) => {
      const pr = this.stage.renderer.getPixelRatio();
      this.sky.setPixelRatio(pr);
      this.toasts.show(`画质已调整为${q === 'high' ? '高' : q === 'mid' ? '中' : '低'}`);
    };
    this.sky.setPixelRatio(this.stage.renderer.getPixelRatio());

    this.observer = new Observer(() => ({ params: this.state.params, keys: this.state.keys, depth: this.state.depth, seed: this.state.seed }));
    this.hud = new Hud(this.state, {
      onAct: handlers.onAct,
      onMode: handlers.onMode,
      onObserver: () => this.toggleDrawer('observer'),
      onArchive: () => this.toggleDrawer('archive'),
      onGraves: () => this.toggleDrawer('graves'),
      onSettings: () => this.toggleDrawer('settings'),
      onSound: () => {
        this.audio.setEnabled(!this.audio.enabled);
        this.hud.setSound(this.audio.enabled);
      },
      onGuidePause: () => this.toggleGuidePause(),
      onGuideSkip: handlers.onSkip,
      onGuideExit: handlers.onExitGuide,
    });
    this.observerPanel = new ObserverPanel(
      this.observer,
      (changes) => this.applyFromObserver(changes),
      () => this.toggleDrawer('observer', false),
      () => this.state.mode === 'free',
    );
    this.archive = new Archive(this.state, () => this.toggleDrawer('archive', false));
    this.graveyard = new Graveyard(this.state, () => this.toggleDrawer('graves', false));
    this.settings = new Settings(() => this.toggleDrawer('settings', false), {
      onQuality: (q) => this.stage.setQualityMode(q),
      onTts: (on) => (this.audio.tts = on),
    });
    ui.append(
      this.hud.el, this.hud.chainEl, this.hud.scaleEl, this.panel.el, this.subtitle.el, this.hud.guideEl,
      this.observerPanel.el, this.archive.el, this.graveyard.el, this.settings.el, this.modals.el, this.toasts.el,
    );

    this.state.ev.on('keys', (keys) => this.armillary.setKeys(keys));
    this.state.ev.on('unlock', (k) => {
      this.armillary.pulse(k);
      this.audio.unlock();
      this.toasts.show(`${KEY_NAMES[k]}已解锁`, 'key');
    });
    this.state.ev.on('graves', (g) => this.hall.setGraveyard(g));
    this.armillary.setKeys(this.state.keys, true);
    this.hall.setGraveyard(this.state.graves);
    this.hall.setMessageStars(this.state.stars.length);
    if (document.fonts) void document.fonts.ready.then(() => this.armillary.refreshLabels());

    window.addEventListener('keydown', (e) => this.onKey(e));
    new MutationObserver(() => this.updateViewOffset()).observe(this.panel.el, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('resize', () => this.updateViewOffset());
  }

  /** 桌面端右侧有仪器面板时，把画面中心向左平移，让主体落在空白区域。 */
  updateViewOffset(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cam = this.stage.camera;
    if (this.panel.el.hidden) cam.clearViewOffset();
    else if (w > 900) cam.setViewOffset(w, h, Math.min(140, w * 0.08), 0, w, h);
    // 窄屏的仪器面板在底部：把画面中心上移
    else cam.setViewOffset(w, h, 0, h * 0.2, w, h);
  }

  start(): void {
    this.stage.start((dt, t) => {
      this.tw.update(dt);
      this.rig.update(dt, this.reduced);
      this.sky.update(t, this.stage.camera);
      this.planet.update(dt, t);
      this.armillary.update(dt, this.reduced);
      this.hall.update(dt, t, this.reduced);
      for (const u of this.updaters) u(dt, t);
      if (this.state.mode === 'guided' && !this.guidePaused) {
        this.guideElapsed += dt * this.tw.rate;
        this.hud.setGuideProgress(this.guideElapsed, 335, this.guidePaused);
      }
    });
  }

  onUpdate(fn: (dt: number, t: number) => void): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  /* ───────── 导览辅助 ───────── */

  check(): void {
    if (this.guideAbort) throw new GuideAbort();
  }

  /** 显示一句旁白并等待其时长（受导览暂停与倍速影响）。 */
  async say(line: Line): Promise<void> {
    this.check();
    this.subtitle.show(line.text);
    this.audio.speak(line.text);
    await this.tw.wait(line.ms);
    this.check();
  }

  /** 与动作并行播放的旁白；被中止时静默结束。 */
  sayBg(line: Line): void {
    this.say(line).catch(() => {});
  }

  /** 自由模式下的旁白：不阻塞，按时长自动隐去。 */
  narrate(line: Line): void {
    this.subtitle.show(line.text, line.ms + 600);
    this.audio.speak(line.text);
  }

  /** 导览中自动关闭弹窗的真实延时：随导览倍速缩放。 */
  autoMs(ms: number): number {
    return ms / Math.max(this.guideRate, 0.0001);
  }

  async wait(ms: number): Promise<void> {
    this.check();
    await this.tw.wait(ms);
    this.check();
  }

  toggleGuidePause(force?: boolean): void {
    this.guidePaused = force ?? !this.guidePaused;
    this.tw.rate = this.guidePaused ? 0 : this.guideRate;
    this.hud.setGuideProgress(this.guideElapsed, 335, this.guidePaused);
    if (this.guidePaused) this.audio.stopSpeech();
  }

  /* ───────── 钥匙与顿悟 ───────── */

  /** 没有钥匙时：展示顿悟卡并解锁。导览模式下自动确认。 */
  async epiphany(key: Exclude<KeyId, 'future'>): Promise<void> {
    const e = EPIPHANIES[key];
    const held = this.state.has(key);
    if (this.state.mode === 'guided') this.modals.auto = { value: 'ok', ms: this.autoMs(5200) };
    await this.modals.epiphany(e, this.state.depth, held);
    this.modals.auto = null;
    if (held) {
      this.armillary.pulse(key);
      this.audio.unlock();
    } else this.state.unlock(key);
  }

  /** 文明链条断裂：归入墓园并询问下一步。 */
  async fate(layer: number, cause: string, detail: string): Promise<'rewind' | 'new'> {
    this.audio.extinct();
    const rec = this.state.archive(layer, cause);
    this.state.setLayer(layer, 'fail');
    if (this.state.mode === 'guided') this.modals.auto = { value: 'rewind', ms: this.autoMs(4500) };
    const v = await this.modals.fate({ name: rec.name, layer, cause, detail, epitaph: rec.epitaph });
    this.modals.auto = null;
    return v === 'new' ? 'new' : 'rewind';
  }

  /* ───────── 抽屉 ───────── */

  toggleDrawer(which: 'observer' | 'archive' | 'graves' | 'settings', open?: boolean): void {
    const map = { observer: this.observerPanel, archive: this.archive, graves: this.graveyard, settings: this.settings };
    for (const [k, v] of Object.entries(map)) {
      const isTarget = k === which;
      const willOpen = isTarget ? open ?? Boolean(v.el.hidden) : false;
      v.setOpen(willOpen);
    }
    this.audio.click();
  }

  private applyFromObserver(changes: Record<string, ParamValue>): void {
    this.state.setParams(changes);
    this.toasts.show('已在本宇宙中应用，推演结果见左侧文明链条与当前实验舱。');
    this.onParamsApplied?.();
  }

  /** 由导演注入：参数被观测者改动后刷新当前幕。 */
  onParamsApplied?: () => void;

  private onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape') {
      this.toggleDrawer('observer', false);
      this.toggleDrawer('archive', false);
    } else if (e.key === ' ' && this.state.mode === 'guided') {
      e.preventDefault();
      this.toggleGuidePause();
    } else if (e.key.toLowerCase() === 'q') this.toggleDrawer('observer');
    else if (e.key.toLowerCase() === 'a') this.toggleDrawer('archive');
  }

  /* ───────── 场景过渡 ───────── */

  async fade(obj: Fadeable, from: number, to: number, ms: number): Promise<void> {
    const set = (a: number) => (obj.setOpacity ? obj.setOpacity(a) : setGroupOpacity(obj.group, a));
    set(from);
    await this.tw.run(ms, (k) => set(from + (to - from) * k), ease.inOutSine);
  }

  /**
   * 尺度连续缩放：外层对象放大并淡出，内层对象从极小长到正常大小并淡入。
   * expFrom / expTo 为尺度读数的数量级（米）。
   */
  async dive(outer: Fadeable, inner: Fadeable, ms: number, expFrom: number, expTo: number, outerScale = 60, innerStart = 0.02): Promise<void> {
    const setO = (a: number) => (outer.setOpacity ? outer.setOpacity(a) : setGroupOpacity(outer.group, a));
    const setI = (a: number) => (inner.setOpacity ? inner.setOpacity(a) : setGroupOpacity(inner.group, a));
    const o0 = outer.group.scale.x;
    inner.group.scale.setScalar(innerStart);
    setI(0);
    inner.group.visible = true;
    await this.tw.run(ms, (k) => {
      outer.group.scale.setScalar(o0 * Math.exp(Math.log(outerScale) * k));
      inner.group.scale.setScalar(Math.exp(Math.log(innerStart) * (1 - k)));
      setO(Math.max(0, 1 - k * 1.6));
      setI(Math.min(1, Math.max(0, (k - 0.25) * 1.6)));
      this.hud.setScale(expFrom + (expTo - expFrom) * k);
    }, ease.inOutCubic);
    outer.group.visible = false;
    outer.group.scale.setScalar(o0);
    inner.group.scale.setScalar(1);
    setI(1);
  }
}
