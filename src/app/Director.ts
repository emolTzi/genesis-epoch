// 导演：章节切换、导览模式与自由模式。

import type { App, Fadeable } from './App';
import { GuideAbort } from './App';
import { ACT_ORDER, type ActId } from '../data/script';
import type { Act } from '../acts/Act';
import { HallAct } from '../acts/HallAct';
import { OriginAct } from '../acts/OriginAct';
import { StarsAct } from '../acts/StarsAct';
import { ElementsAct } from '../acts/ElementsAct';
import { LifeAct } from '../acts/LifeAct';
import { CivAct } from '../acts/CivAct';
import { FinaleAct } from '../acts/FinaleAct';
import { newUniverseId } from '../core/rng';

export class Director {
  readonly acts: Record<ActId, Act>;
  current: Act | null = null;
  private busy = false;
  /** 切换进行中收到的跳转请求，切换结束后执行。 */
  private pending: ActId | null = null;
  /** 导览倍速（预览用，地址栏加 ?speed=4）。 */
  readonly speed = Math.min(20, Math.max(0.5, Number(new URLSearchParams(location.search).get('speed')) || 1));
  private skipping = false;

  constructor(private app: App) {
    this.acts = {
      hall: new HallAct(app, this),
      origin: new OriginAct(app, this),
      stars: new StarsAct(app, this),
      elements: new ElementsAct(app, this),
      life: new LifeAct(app, this),
      civ: new CivAct(app, this),
      finale: new FinaleAct(app, this),
    };
    app.onParamsApplied = () => this.current?.refresh();
  }

  /** 清场：淡出所有不在 keep 中、且当前可见的场景对象。 */
  async clearStage(keep: Fadeable[], ms = 900): Promise<void> {
    const all: Fadeable[] = [this.app.hallFade, this.app.planetFade, ...Object.values(this.acts).flatMap((a) => a.fadeables())];
    const keepGroups = new Set(keep.map((k) => k.group));
    await Promise.all(all.filter((f) => f.group.visible && !keepGroups.has(f.group)).map((f) => this.app.fade(f, 1, 0, ms)));
  }

  index(id: ActId): number {
    return ACT_ORDER.indexOf(id);
  }

  async goTo(id: ActId): Promise<void> {
    if (this.busy) {
      this.pending = id;
      return;
    }
    this.busy = true;
    const prev = this.current?.id ?? null;
    try {
      if (this.current) await this.current.exit();
      const s = this.app.state;
      s.act = id;
      s.reached = Math.max(s.reached, this.index(id));
      this.app.hud.setAct(id);
      this.current = this.acts[id];
      await this.current.enter(prev);
    } finally {
      this.busy = false;
      if (this.pending && this.pending !== this.current?.id) {
        const p = this.pending;
        this.pending = null;
        void this.goTo(p);
      } else this.pending = null;
    }
  }

  /** 自由模式：进入下一幕。 */
  async next(): Promise<void> {
    const i = this.index(this.current?.id ?? 'hall');
    const nextId = ACT_ORDER[Math.min(ACT_ORDER.length - 1, i + 1)];
    this.app.state.reached = Math.max(this.app.state.reached, this.index(nextId));
    await this.goTo(nextId);
  }

  /** 换一个宇宙：保留钥匙，从第①幕重新开始。 */
  async newUniverse(seed = newUniverseId()): Promise<void> {
    this.app.state.newUniverse(seed);
    this.app.toasts.show(`新的宇宙编号 ${seed}，文明“${this.app.state.civName}”`);
    void this.app.observer.nameCivilization(seed).then((n) => {
      if (n && this.app.state.seed === seed) this.app.state.setCivName(n, 'ai');
    });
    await this.goTo('origin');
  }

  /* ───────── 导览模式 ───────── */

  async startGuided(): Promise<void> {
    const app = this.app;
    const s = app.state;
    s.mode = 'guided';
    app.guideAbort = false;
    app.guideElapsed = 0;
    app.guideRate = this.speed;
    app.toggleGuidePause(false);
    app.hud.setMode('guided');
    app.rig.orbitEnabled = false;
    s.newUniverse(2026);
    s.setRank(2);
    s.reached = 0;
    let last: ActId = 'hall';
    let completed = false;
    try {
      for (const id of ACT_ORDER) {
        last = id;
        await this.goTo(id);
        this.skipping = false;
        app.tw.rate = this.speed;
        await this.acts[id].guided();
        app.tw.rate = this.speed;
      }
      completed = true;
    } catch (e) {
      if (!(e instanceof GuideAbort)) throw e;
      app.tw.finishAll();
    }
    app.tw.rate = 1;
    app.guideAbort = false;
    app.modals.auto = null;
    app.subtitle.hide();
    this.toFree(last, !completed);
  }

  skipAct(): void {
    if (this.app.state.mode !== 'guided' || this.skipping) return;
    this.skipping = true;
    this.app.toggleGuidePause(false);
    this.app.tw.rate = 25;
  }

  exitGuided(): void {
    if (this.app.state.mode !== 'guided') return;
    this.app.guideAbort = true;
    this.app.toggleGuidePause(false);
    this.app.tw.finishAll();
  }

  private toFree(at: ActId, reenter: boolean): void {
    const app = this.app;
    app.state.mode = 'free';
    app.hud.setMode('free');
    app.rig.orbitEnabled = true;
    app.state.reached = Math.max(app.state.reached, this.index(at));
    app.hud.setAct(at);
    // 中途退出导览：以自由模式重新进入当前幕，恢复可交互的面板；导览完整结束时保留终章画面
    if (reenter) void this.goTo(at);
  }

  toggleMode(): void {
    if (this.app.state.mode === 'guided') this.exitGuided();
    else void this.startGuided();
  }
}
