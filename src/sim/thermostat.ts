// 行星恒温器：碳–硅酸盐循环的极简模型（示意）。
// 火山脱气 V 向大气补充 CO₂；硅酸盐风化 W 随温度与 CO₂ 升高而加快，把 CO₂ 埋入碳酸盐。
// 稳态 V = W 决定 CO₂ 分压，进而决定地表温度。温度升高 → 风化加快 → CO₂ 减少 → 降温：负反馈。

import { WEATHERING_BETA, WEATHERING_TE } from './constants';
import { greenhouseWarming } from './formulas';

const LN2 = Math.LN2;

export interface ThermostatInput {
  /** 无温室时的平衡温度，K。 */
  teq: number;
  /** 火山脱气强度（地球 = 1）。 */
  outgassing: number;
  /** 风化效率（地球 = 1）。 */
  weathering: number;
}

export interface ThermostatState {
  /** CO₂ 相对工业化前分压。 */
  co2: number;
  /** 地表温度，K。 */
  temp: number;
  /** 是否被夹在模型上下限（表示失控）。 */
  clampedHigh: boolean;
  clampedLow: boolean;
}

const LOG_C_MIN = Math.log(1e-3);
const LOG_C_MAX = Math.log(1e5);

export function surfaceTemp(teq: number, co2: number): number {
  return teq + greenhouseWarming(co2);
}

/** 风化速率（地球稳态为 1 左右）。 */
export function weatheringRate(w: number, co2: number, temp: number): number {
  return w * Math.pow(co2, WEATHERING_BETA) * Math.exp((temp - 288) / WEATHERING_TE);
}

/**
 * 求稳态：ln W(T(c), c) = ln V。左侧随 ln c 单调递增，二分法求根。
 * V = 0 时 CO₂ 被持续移除；W = 0 时 CO₂ 无限累积。
 */
export function equilibrium(input: ThermostatInput): ThermostatState {
  const { teq, outgassing: v, weathering: w } = input;
  if (v <= 1e-6) {
    const c = Math.exp(LOG_C_MIN);
    return { co2: c, temp: surfaceTemp(teq, c), clampedHigh: false, clampedLow: true };
  }
  if (w <= 1e-6) {
    const c = Math.exp(LOG_C_MAX);
    return { co2: c, temp: surfaceTemp(teq, c), clampedHigh: true, clampedLow: false };
  }
  const f = (lc: number) => {
    const c = Math.exp(lc);
    return Math.log(w) + WEATHERING_BETA * lc + (surfaceTemp(teq, c) - 288) / WEATHERING_TE - Math.log(v);
  };
  if (f(LOG_C_MAX) < 0) {
    const c = Math.exp(LOG_C_MAX);
    return { co2: c, temp: surfaceTemp(teq, c), clampedHigh: true, clampedLow: false };
  }
  if (f(LOG_C_MIN) > 0) {
    const c = Math.exp(LOG_C_MIN);
    return { co2: c, temp: surfaceTemp(teq, c), clampedHigh: false, clampedLow: true };
  }
  let lo = LOG_C_MIN;
  let hi = LOG_C_MAX;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  const c = Math.exp((lo + hi) / 2);
  return { co2: c, temp: surfaceTemp(teq, c), clampedHigh: false, clampedLow: false };
}

export interface ResponseCurve {
  t: number[];
  withFeedback: number[];
  withoutFeedback: number[];
}

/**
 * 扰动实验：t = 0 时恒星变亮（平衡温度升高 dTeq），比较“有反馈”与“CO₂ 冻结不变”的地表温度。
 * 时间单位为示意的“百万年”，弛豫时间取数十个单位。
 */
export function perturbation(input: ThermostatInput, dTeq: number, steps = 240): ResponseCurve {
  const base = equilibrium(input);
  const teq2 = input.teq + dTeq;
  const t: number[] = [];
  const withFb: number[] = [];
  const noFb: number[] = [];
  let lc = Math.log(base.co2);
  const k = 0.06;
  for (let i = 0; i < steps; i++) {
    const time = i - 20;
    const teq = time < 0 ? input.teq : teq2;
    const c = Math.exp(lc);
    const temp = surfaceTemp(teq, c);
    t.push(time);
    withFb.push(temp);
    noFb.push(surfaceTemp(teq, base.co2));
    if (time >= 0 && input.outgassing > 1e-6) {
      const W = weatheringRate(input.weathering, c, temp);
      // 对数空间弛豫：脱气多于风化时 CO₂ 上升，反之下降
      lc += k * Math.log(Math.max(input.outgassing, 1e-9) / Math.max(W, 1e-9));
      lc = Math.min(LOG_C_MAX, Math.max(LOG_C_MIN, lc));
    }
  }
  return { t, withFeedback: withFb, withoutFeedback: noFb };
}

/** CO₂ 每加倍的温度变化，供界面解释。 */
export const warmingPerEfold = 3 / LN2;
