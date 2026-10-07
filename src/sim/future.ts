// L5 未来：此刻的地球就是正在运行的那一次推演。
// 观众调整四个未来参量，模型给出未来千年（示意）的存活曲线；
// “历史合力”把每位观众的选择视为一支力向量（恩格斯 1890 年致布洛赫的信），合成文明走向。

import { mulberry32 } from '../core/rng';

export interface FutureInput {
  coop: number;
  carbon: number;
  ai: number;
  defense: number;
}

/** 每“十年”一步，共 100 步 = 1000 年（示意）。 */
export const FUTURE_STEPS = 100;

/** 单步风险分解（示意参数，用来表达方向与相对大小，不是预测）。 */
export function stepRisks(f: FutureInput) {
  return {
    war: 0.0062 * Math.pow(1 - f.coop, 1.3),
    climate: 0.0048 * Math.pow(1 - f.carbon, 1.6),
    ai: 0.0053 * Math.pow(1 - f.ai, 1.5),
    // 大型撞击的千年概率本就很低；防御的意义主要在于“能改写参量”
    impact: 0.00002 * (1 - 0.9 * f.defense),
  };
}

export interface FutureResult {
  /** 每步的存活比例，长度 FUTURE_STEPS + 1。 */
  curve: number[];
  survival: number;
  /** 各风险在失败中的占比。 */
  causes: Record<'war' | 'climate' | 'ai' | 'impact', number>;
}

export function simulateFuture(f: FutureInput, runs = 2000, seed = 2026): FutureResult {
  const r = mulberry32(seed);
  const risks = stepRisks(f);
  const alive = new Array(FUTURE_STEPS + 1).fill(0);
  const causes = { war: 0, climate: 0, ai: 0, impact: 0 };
  for (let i = 0; i < runs; i++) {
    let dead = false;
    alive[0]++;
    for (let s = 1; s <= FUTURE_STEPS; s++) {
      if (!dead) {
        const x = r();
        let acc = 0;
        for (const k of ['war', 'climate', 'ai', 'impact'] as const) {
          acc += risks[k];
          if (x < acc) {
            dead = true;
            causes[k]++;
            break;
          }
        }
      }
      if (!dead) alive[s]++;
    }
  }
  const curve = alive.map((a) => a / runs);
  const failed = Math.max(1, runs - alive[FUTURE_STEPS]);
  return {
    curve,
    survival: curve[FUTURE_STEPS],
    causes: {
      war: causes.war / failed,
      climate: causes.climate / failed,
      ai: causes.ai / failed,
      impact: causes.impact / failed,
    },
  };
}

/** 解析式的千年存活概率（与蒙特卡洛互相校验）。 */
export function analyticSurvival(f: FutureInput): number {
  const k = stepRisks(f);
  const p = k.war + k.climate + k.ai + k.impact;
  return Math.pow(1 - p, FUTURE_STEPS);
}

export interface Observer {
  vec: FutureInput;
}

/** 生成“其他观测者”的选择：围绕中等取值分散（示意人群）。 */
export function crowd(n: number, seed = 1890): FutureInput[] {
  const r = mulberry32(seed);
  const jitter = () => Math.min(1, Math.max(0, 0.5 + (r() + r() + r() - 1.5) * 0.45));
  return Array.from({ length: n }, () => ({ coop: jitter(), carbon: jitter(), ai: jitter(), defense: jitter() }));
}

/** 合力：所有观测者选择的平均。 */
export function resultant(list: FutureInput[]): FutureInput {
  const n = Math.max(1, list.length);
  const s = { coop: 0, carbon: 0, ai: 0, defense: 0 };
  for (const f of list) {
    s.coop += f.coop;
    s.carbon += f.carbon;
    s.ai += f.ai;
    s.defense += f.defense;
  }
  return { coop: s.coop / n, carbon: s.carbon / n, ai: s.ai / n, defense: s.defense / n };
}

/** 现状基线：低于它的选择表现为反向的力。 */
export const BASELINE = 0.3;

/** 把四维选择投影成平面上的一支力向量：横轴“发展与治理”，纵轴“合作与生态”。 */
export function project(f: FutureInput): [number, number] {
  const x = ((f.ai - BASELINE) * 1.0 + (f.defense - BASELINE) * 0.6) / 1.6;
  const y = ((f.coop - BASELINE) * 1.0 + (f.carbon - BASELINE) * 0.8) / 1.8;
  return [x, y];
}
