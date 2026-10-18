// 实时读数：任何参量变化后，六层宇宙各自的判定与关键数值。顶栏文明链条与参数台共用。

import type { StaticReport } from './universe';
import type { Params, Status } from './types';
import { survivalRate } from './civ';
import { analyticSurvival } from './future';

export interface LayerLive {
  status: Status;
  /** 简短判定，例如“液态水窗口”。 */
  title: string;
  /** 链条右侧的短读数，例如“T_eq 255 K”。 */
  short: string;
  /** 参数台中的一行说明。 */
  detail: string;
}

let mfKey = '';
let mfVal = 0;

/** 宏观平均场模型的文明存活率（带缓存）。 */
export function civSurvival(p: Params): number {
  const key = `${p.eco}|${p.coop}`;
  if (key !== mfKey) {
    mfKey = key;
    mfVal = survivalRate(Number(p.eco), Number(p.coop));
  }
  return mfVal;
}

export function futureSurvival(p: Params): number {
  return analyticSurvival({ coop: Number(p.fut_coop), carbon: Number(p.fut_carbon), ai: Number(p.fut_ai), defense: Number(p.fut_defense) });
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function liveLayers(p: Params, r: StaticReport): LayerLive[] {
  const L1 = r.L1.values;
  const L2 = r.L2.values;
  const teq = Number(L1.teq);
  const temp = Number(L2.temp);
  const upstream = (i: number) => r.firstFail !== null && r.firstFail < i;
  const block = (i: number, s: LayerLive): LayerLive => (upstream(i) ? { status: 'fail', title: '上游已断裂', short: '—', detail: `L${r.firstFail} 层已经失败，这一层不会发生。` } : s);
  const civ = civSurvival(p);
  const fut = futureSurvival(p);
  return [
    {
      status: r.L0.verdict.status,
      title: r.L0.verdict.title,
      short: r.L0.verdict.status === 'fail' ? '断裂' : '碳氧 ✓',
      detail: `Δα ${Number(p.alpha_dev).toFixed(1)}% · Δα_s ${Number(p.alphas_dev).toFixed(2)}% · Λ ×${Number(p.lambda_ratio).toPrecision(2)}`,
    },
    block(1, {
      status: r.L1.verdict.status,
      title: r.L1.verdict.title,
      short: `T_eq ${teq.toFixed(0)} K`,
      detail: `平衡温度 ${teq.toFixed(0)} K · 宜居带 ${Number(L1.hzInner).toFixed(2)}–${Number(L1.hzOuter).toFixed(2)} AU · 恒星寿命 ${Number(L1.life).toPrecision(2)} Gyr`,
    }),
    block(2, {
      status: r.L2.verdict.status,
      title: r.L2.verdict.title,
      short: isFinite(temp) ? `${(temp - 273.15).toFixed(0)} °C` : '—',
      detail: `稳态地表 ${(temp - 273.15).toFixed(1)} °C · CO₂ 为工业化前的 ${Number(L2.co2).toPrecision(2)} 倍`,
    }),
    block(3, {
      status: r.L3.verdict.status,
      title: r.L3.verdict.title,
      short: p.kpg_site === 'hazard' ? '撞击 ✓' : '恐龙延续',
      detail: r.L3.checks.map((c) => c.verdict.title).join(' · '),
    }),
    block(4, {
      status: civ >= 0.5 ? 'ok' : civ >= 0.2 ? 'warn' : 'fail',
      title: `存活率 ${pct(civ)}`,
      short: `存活 ${pct(civ)}`,
      detail: `合作 ${Number(p.coop).toFixed(2)} · 生态约束 ${Number(p.eco).toFixed(2)}：500 个平行宇宙中延续到推演终点的比例（宏观平均场模型）`,
    }),
    block(5, {
      status: fut >= 0.5 ? 'ok' : fut >= 0.2 ? 'warn' : 'fail',
      title: `千年存活 ${pct(fut)}`,
      short: `千年 ${pct(fut)}`,
      detail: '四个未来参量下，未来千年的存活概率（情景模型，示意，不是预测）',
    }),
  ];
}
