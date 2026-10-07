// 轻量补间与时间工具：替代第三方动画库，避免额外授权依赖。

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Running {
  start: number;
  dur: number;
  ease: Ease;
  step: (k: number) => void;
  resolve: () => void;
  cancelled: boolean;
}

/** 由渲染循环驱动的补间调度器；时间可按导览倍速缩放。 */
export class Tweens {
  private list: Running[] = [];
  now = 0;
  /** 时间倍率：1 为正常速度。 */
  rate = 1;

  update(dtSeconds: number): void {
    this.now += dtSeconds * 1000 * this.rate;
    const keep: Running[] = [];
    for (const r of this.list) {
      if (r.cancelled) continue;
      const k = r.dur <= 0 ? 1 : clamp((this.now - r.start) / r.dur, 0, 1);
      r.step(r.ease(k));
      if (k >= 1) r.resolve();
      else keep.push(r);
    }
    this.list = keep;
  }

  /** 在 ms 毫秒内把 k 从 0 推到 1。返回的 Promise 在结束时兑现。 */
  run(ms: number, step: (k: number) => void, e: Ease = ease.inOutCubic): Promise<void> {
    return new Promise((resolve) => {
      this.list.push({ start: this.now, dur: ms, ease: e, step, resolve, cancelled: false });
    });
  }

  /** 等待 ms 毫秒（受倍率影响）。 */
  wait(ms: number): Promise<void> {
    return this.run(ms, () => {}, ease.linear);
  }

  /** 立即完成所有进行中的补间（跳过导览时使用）。 */
  finishAll(): void {
    for (const r of this.list) {
      r.step(1);
      r.resolve();
    }
    this.list = [];
  }
}
