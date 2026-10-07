// 万宇宙蒙特卡洛：德雷克方程各因子按 Sandberg, Drexler & Ord 2018 的思路
// 取对数均匀或宽对数正态分布，一次抽样即一次平行实验。
// 区间为本作品设定（示意，参照该文的取值思路），结果是“本模型下”的比例，不代表该论文的结论数值。

import { gaussian, logUniform, mulberry32, type Rng } from '../core/rng';

export interface DrakeSample {
  Rstar: number;
  fp: number;
  ne: number;
  fl: number;
  fi: number;
  fc: number;
  L: number;
  /** 银河系中当前可被探测的技术文明数量。 */
  N: number;
}

export const DRAKE_RANGES = {
  Rstar: [1, 100] as const, // 恒星形成率，颗/年
  fp: [0.1, 1] as const, // 拥有行星的恒星比例
  ne: [0.1, 1] as const, // 每个行星系中宜居行星数
  fi: [0.001, 1] as const, // 演化出智能的比例
  fc: [0.01, 1] as const, // 发展出可探测技术的比例
  L: [100, 1e10] as const, // 文明可被探测的时长，年
  /** 生命起源：f_l = 1 − exp(−λVt)，log₁₀(λVt) ~ N(0, σ)。 */
  abioSigma: 50,
};

export function sampleDrake(r: Rng): DrakeSample {
  const Rstar = logUniform(r, ...DRAKE_RANGES.Rstar);
  const fp = logUniform(r, ...DRAKE_RANGES.fp);
  const ne = logUniform(r, ...DRAKE_RANGES.ne);
  const x = gaussian(r) * DRAKE_RANGES.abioSigma;
  const lambdaVt = Math.pow(10, Math.max(-300, Math.min(300, x)));
  const fl = -Math.expm1(-lambdaVt);
  const fi = logUniform(r, ...DRAKE_RANGES.fi);
  const fc = logUniform(r, ...DRAKE_RANGES.fc);
  const L = logUniform(r, ...DRAKE_RANGES.L);
  const N = Rstar * fp * ne * fl * fi * fc * L;
  return { Rstar, fp, ne, fl, fi, fc, L, N };
}

export interface MonteCarloResult {
  samples: DrakeSample[];
  /** N < 1 的比例：银河系中很可能只有我们（或一个都没有）。 */
  aloneFraction: number;
  medianLog10N: number;
}

export function runMonteCarlo(n = 10000, seed = 1806_02404): MonteCarloResult {
  const r = mulberry32(seed);
  const samples: DrakeSample[] = [];
  let alone = 0;
  for (let i = 0; i < n; i++) {
    const s = sampleDrake(r);
    samples.push(s);
    if (s.N < 1) alone++;
  }
  const logs = samples.map((s) => Math.log10(Math.max(s.N, 1e-300))).sort((a, b) => a - b);
  return { samples, aloneFraction: alone / n, medianLog10N: logs[Math.floor(n / 2)] };
}
