// K-Pg 撞击点轮盘。
// Kaiho & Oshima 2017（Sci. Rep. 7:14855）估计：只有约 13% 的地表富含碳氢化合物与硫，
// 小行星撞在这些地方才会产生足以引发大灭绝的平流层烟尘。作品在程序化行星上
// 生成若干球冠代表这类沉积区，并把它们的并集面积标定为 13%。分布是示意，比例来自文献。

import { mulberry32 } from '../core/rng';

export type Vec3 = [number, number, number];

export interface Cap {
  dir: Vec3;
  /** 球冠角半径的余弦。 */
  cosR: number;
}

export const HAZARD_FRACTION_TARGET = 0.13;

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function randomDir(r: () => number): Vec3 {
  const u = r() * 2 - 1;
  const t = r() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(t), u, s * Math.sin(t)];
}

/** 固定的单位球面采样点，用于估计并集面积（确定性）。 */
const SAMPLES: Vec3[] = (() => {
  const r = mulberry32(66_000_000);
  const out: Vec3[] = [];
  for (let i = 0; i < 40000; i++) out.push(randomDir(r));
  return out;
})();

function inCaps(p: Vec3, caps: Cap[]): boolean {
  for (const c of caps) {
    if (p[0] * c.dir[0] + p[1] * c.dir[1] + p[2] * c.dir[2] >= c.cosR) return true;
  }
  return false;
}

function unionFraction(caps: Cap[]): number {
  let n = 0;
  for (const p of SAMPLES) if (inCaps(p, caps)) n++;
  return n / SAMPLES.length;
}

function buildCaps(): Cap[] {
  const r = mulberry32(14855);
  const centers: Vec3[] = [];
  const weights: number[] = [];
  for (let i = 0; i < 9; i++) {
    let d = randomDir(r);
    // 避开两极，沉积区多在中低纬的大陆边缘与浅海
    d = normalize([d[0], d[1] * 0.6, d[2]]);
    centers.push(d);
    weights.push(0.6 + r() * 0.8);
  }
  const make = (scale: number): Cap[] =>
    centers.map((dir, i) => ({ dir, cosR: Math.cos(Math.min(Math.PI / 2, scale * weights[i])) }));
  let lo = 0.01;
  let hi = 1.2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (unionFraction(make(mid)) < HAZARD_FRACTION_TARGET) lo = mid;
    else hi = mid;
  }
  return make((lo + hi) / 2);
}

export const HAZARD_CAPS: Cap[] = buildCaps();

export function isHazard(dir: Vec3): boolean {
  return inCaps(normalize(dir), HAZARD_CAPS);
}

export function hazardFraction(): number {
  return unionFraction(HAZARD_CAPS);
}

/** 在安全区（非沉积区）随机取一个撞击点，用于默认推演。 */
export function randomSafeSite(seed: number): Vec3 {
  const r = mulberry32(seed);
  for (let i = 0; i < 1000; i++) {
    const d = randomDir(r);
    if (!inCaps(d, HAZARD_CAPS)) return d;
  }
  return [0, 0, 1];
}

/** 沉积区中心之一，用于导览演示“真实历史”。 */
export function hazardSite(index = 0): Vec3 {
  return HAZARD_CAPS[index % HAZARD_CAPS.length].dir;
}

export function latLon(dir: Vec3): { lat: number; lon: number } {
  const d = normalize(dir);
  return { lat: (Math.asin(d[1]) * 180) / Math.PI, lon: (Math.atan2(d[2], d[0]) * 180) / Math.PI };
}
