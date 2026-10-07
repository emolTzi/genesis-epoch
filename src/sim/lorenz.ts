// Lorenz 系统：“另一个你”双宇宙对照的数学内核。
// dx/dt = σ(y − x), dy/dt = x(ρ − z) − y, dz/dt = xy − βz；σ = 10, ρ = 28, β = 8/3（Lorenz 1963）。
// 最大李雅普诺夫指数约 0.906：初始差异按 e^{λt} 放大。

export type V3 = [number, number, number];

export const SIGMA_L = 10;
export const RHO_L = 28;
export const BETA_L = 8 / 3;
export const LYAPUNOV = 0.9056;

function f(s: V3): V3 {
  return [SIGMA_L * (s[1] - s[0]), s[0] * (RHO_L - s[2]) - s[1], s[0] * s[1] - BETA_L * s[2]];
}

export function rk4(s: V3, h: number): V3 {
  const k1 = f(s);
  const k2 = f([s[0] + (h / 2) * k1[0], s[1] + (h / 2) * k1[1], s[2] + (h / 2) * k1[2]]);
  const k3 = f([s[0] + (h / 2) * k2[0], s[1] + (h / 2) * k2[1], s[2] + (h / 2) * k2[2]]);
  const k4 = f([s[0] + h * k3[0], s[1] + h * k3[1], s[2] + h * k3[2]]);
  return [
    s[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    s[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    s[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

export class TwinLorenz {
  a: V3;
  b: V3;
  t = 0;
  readonly h: number;
  readonly eps: number;
  splitT: number | null = null;
  constructor(eps: number, h = 0.005) {
    this.eps = eps;
    this.h = h;
    this.a = [1, 1, 20];
    this.b = [1 + eps, 1, 20];
  }
  distance(): number {
    return Math.hypot(this.a[0] - this.b[0], this.a[1] - this.b[1], this.a[2] - this.b[2]);
  }
  step(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.a = rk4(this.a, this.h);
      this.b = rk4(this.b, this.h);
      this.t += this.h;
      if (this.splitT === null && this.distance() > 1) this.splitT = this.t;
    }
  }
}

/** 用最小二乘拟合 ln|δ| 的增长斜率，用于单元测试与界面读数。 */
export function fitGrowth(eps: number, tMax: number, h = 0.005): number {
  const tw = new TwinLorenz(eps, h);
  const xs: number[] = [];
  const ys: number[] = [];
  while (tw.t < tMax) {
    tw.step(20);
    const d = tw.distance();
    if (d < 1e-1) {
      xs.push(tw.t);
      ys.push(Math.log(d));
    }
  }
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return num / den;
}
