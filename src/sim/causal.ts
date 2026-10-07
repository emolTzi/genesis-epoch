// 因果图：六层节点与边，供“因果涟漪”可视化与观测档案使用；
// 以及“参数空间存活比例”：在作品设定的取值范围内随机抽样，统计能走到每一层的比例。

import { EDITABLE, defaultParams } from '../data/params';
import { mulberry32 } from '../core/rng';
import { HAZARD_FRACTION_TARGET } from './kpg';
import { survivalRate } from './civ';
import { evaluateStatic, type StaticReport } from './universe';
import type { Layer, Params, Status } from './types';

export interface CausalNode {
  id: string;
  label: string;
  layer: Layer;
  /** 直接依赖的参数。 */
  params: string[];
  /** 上游节点。 */
  deps: string[];
  /** 状态由哪一层的哪项检查给出。 */
  check?: { layer: 0 | 1 | 2 | 3; id: string };
}

export const NODES: CausalNode[] = [
  { id: 'alpha', label: 'α 精细结构常数', layer: 0, params: ['alpha_dev'], deps: [] },
  { id: 'alphas', label: 'α_s 强相互作用', layer: 0, params: ['alphas_dev'], deps: [] },
  { id: 'lambda', label: 'Λ 宇宙学常数', layer: 0, params: ['lambda_ratio'], deps: [], check: { layer: 0, id: 'galaxies' } },
  { id: 'carbon', label: '碳与氧', layer: 0, params: [], deps: ['alpha', 'alphas'], check: { layer: 0, id: 'carbon' } },
  { id: 'star', label: '恒星质量 M★', layer: 1, params: ['star_mass'], deps: ['lambda', 'carbon'], check: { layer: 1, id: 'lifetime' } },
  { id: 'orbit', label: '轨道与辐照', layer: 1, params: ['orbit_a', 'albedo'], deps: ['star'], check: { layer: 1, id: 'water' } },
  { id: 'pmass', label: '行星质量', layer: 1, params: ['planet_mass'], deps: ['carbon'], check: { layer: 1, id: 'atmosphere' } },
  { id: 'moon', label: '卫星与倾角', layer: 1, params: ['moon'], deps: [], check: { layer: 1, id: 'obliquity' } },
  { id: 'tect', label: '板块构造', layer: 2, params: [], deps: ['pmass'], check: { layer: 2, id: 'tectonics' } },
  { id: 'climate', label: '碳–硅酸盐恒温器', layer: 2, params: ['outgassing', 'weathering'], deps: ['orbit', 'tect', 'moon'], check: { layer: 2, id: 'climate' } },
  { id: 'abio', label: '生命起源 f_l', layer: 3, params: [], deps: ['climate'], check: { layer: 3, id: 'abiogenesis' } },
  { id: 'complex', label: '复杂生命', layer: 3, params: [], deps: ['abio', 'climate'], check: { layer: 3, id: 'complex' } },
  { id: 'kpg', label: 'K-Pg 撞击', layer: 3, params: ['kpg_site'], deps: ['complex'], check: { layer: 3, id: 'kpg' } },
  { id: 'P', label: '生产力 P', layer: 4, params: [], deps: ['kpg'] },
  { id: 'R', label: '生产关系 R', layer: 4, params: [], deps: ['P'] },
  { id: 'E', label: '人与自然 E', layer: 4, params: ['eco'], deps: ['P'] },
  { id: 'C', label: '矛盾与合作', layer: 4, params: ['coop', 'choice_1962', 'choice_1983'], deps: ['P', 'R'] },
  { id: 'f_coop', label: '国际合作', layer: 5, params: ['fut_coop'], deps: ['C'] },
  { id: 'f_carbon', label: '减排与修复', layer: 5, params: ['fut_carbon'], deps: ['E'] },
  { id: 'f_ai', label: 'AI 治理', layer: 5, params: ['fut_ai'], deps: ['R'] },
  { id: 'f_def', label: '行星防御', layer: 5, params: ['fut_defense'], deps: ['kpg'] },
];

export function nodeStatus(node: CausalNode, report: StaticReport): Status {
  if (!node.check) return 'pending';
  const r = [report.L0, report.L1, report.L2, report.L3][node.check.layer];
  return r.checks.find((c) => c.id === node.check!.id)?.verdict.status ?? 'pending';
}

/** 参数改变后，按层顺序列出受影响的下游节点（用于涟漪动画）。 */
export function downstreamOf(paramId: string): string[][] {
  const hit = new Set(NODES.filter((n) => n.params.includes(paramId)).map((n) => n.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of NODES) {
      if (!hit.has(n.id) && n.deps.some((d) => hit.has(d))) {
        hit.add(n.id);
        grew = true;
      }
    }
  }
  const byLayer: string[][] = [[], [], [], [], [], []];
  for (const n of NODES) if (hit.has(n.id)) byLayer[n.layer].push(n.id);
  return byLayer.filter((l) => l.length);
}

/* ─────────────── 参数空间存活比例 ─────────────── */

export interface SurvivalLadder {
  /** 依次为能走过 L0、L1、L2、L3、L4 的比例。 */
  fractions: number[];
  samples: number;
}

function sampleParam(id: string, r: () => number): number | boolean {
  const d = EDITABLE.find((p) => p.id === id)!;
  if (d.kind === 'boolean') return r() < 0.5;
  const lo = d.min!;
  const hi = d.max!;
  if (d.log) return Math.pow(10, Math.log10(lo) + (Math.log10(hi) - Math.log10(lo)) * r());
  return lo + (hi - lo) * r();
}

/**
 * 在作品设定的滑杆范围内均匀（对数参数按对数均匀）抽样 L0–L2 参数，统计逐层通过比例；
 * L3 乘以撞击点落在沉积区的比例（13%），L4 乘以默认参数下的文明存活率。
 * 结果依赖于取值范围的设定，界面上如实说明。
 */
export function survivalLadder(n = 12000, seed = 42): SurvivalLadder {
  const r = mulberry32(seed);
  const base = defaultParams();
  const ids0 = ['alpha_dev', 'alphas_dev', 'lambda_ratio'];
  const ids1 = ['star_mass', 'orbit_a', 'albedo', 'planet_mass', 'moon'];
  const ids2 = ['outgassing', 'weathering'];
  let p0 = 0;
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < n; i++) {
    const p: Params = { ...base };
    for (const id of [...ids0, ...ids1, ...ids2]) p[id] = sampleParam(id, r);
    const rep = evaluateStatic(p);
    if (rep.L0.verdict.status === 'fail') continue;
    p0++;
    if (rep.L1.verdict.status === 'fail') continue;
    p1++;
    if (rep.L2.verdict.status === 'fail') continue;
    p2++;
  }
  const f0 = p0 / n;
  const f1 = p1 / n;
  const f2 = p2 / n;
  const f3 = f2 * HAZARD_FRACTION_TARGET;
  const f4 = f3 * survivalRate(Number(base.eco), Number(base.coop), 300);
  return { fractions: [f0, f1, f2, f3, f4], samples: n };
}
