// L4 文明引擎：以历史唯物主义为框架的示意性动力学模型（用于可视化理论机制，并非历史预测）。
//   P 生产力（能量获取与技术水平）
//   R 生产关系所能容纳的生产力水平；每种社会形态有容纳上限
//   C = (P − R)/R 矛盾强度：R 跟不上时 P 的增长被拖慢（桎梏）；C 越过阈值即社会形态更替（量变到质变）
//   E 人与自然的张力：随生产力累积、被生态约束削减；越过阈值即生态崩溃
//   工业文明之后出现毁灭性技术风险，只取决于技术水平与合作程度，与社会形态名称无关。

import { mulberry32 } from '../core/rng';

export const STAGES = ['原始社会', '奴隶社会', '封建社会', '资本主义社会', '社会主义社会'] as const;
export const STAGES_SHORT = ['原始', '奴隶', '封建', '资本主义', '社会主义'] as const;
/** 各社会形态的容纳上限（相对单位）。 */
const CAPS = [2, 8, 40, 600, 1e12];
export const LEAP_THRESHOLD = 0.6;
export const HORIZON = 600;

export type Fate = '延续' | '生态崩溃' | '自我毁灭';

export interface CivInput {
  eco: number;
  coop: number;
  seed: number;
  /** 两个历史时刻的选择：'wait' 克制，'launch' 发射。 */
  choice1962?: 'wait' | 'launch';
  choice1983?: 'wait' | 'launch';
  horizon?: number;
}

export interface CivEvent {
  t: number;
  kind: 'leap' | 'ai' | 'moment' | 'fate';
  label: string;
  stage?: number;
}

export interface CivRun {
  P: number[];
  R: number[];
  C: number[];
  E: number[];
  stageAt: number[];
  leaps: number[];
  events: CivEvent[];
  stage: number;
  fate: Fate;
  tEnd: number;
  /** 进入工业文明的时刻（第 3 次质变），没有则为 null。 */
  industrialT: number | null;
  /** 1962、1983 两个历史时刻在推演时间轴上的位置。 */
  momentT: [number, number] | null;
  /** AI 作为新质生产力登场的时刻。 */
  aiT: number | null;
}

/** 推演一个文明。record=false 时只返回结局，供蒙特卡洛使用。 */
export function simulateCiv(input: CivInput, record = true): CivRun {
  const { eco, coop, seed } = input;
  const horizon = input.horizon ?? HORIZON;
  const rnd = mulberry32(seed);
  const k = 0.5;
  const shock = 0.6 + 0.8 * rnd();
  let P = 1;
  let R = 1.1;
  let stage = 0;
  let E = 0.05;
  let cap = CAPS[0];
  let fate: Fate = '延续';
  let tEnd = horizon;
  let industrialT: number | null = null;
  let momentT: [number, number] | null = null;
  let aiT: number | null = null;
  const run: CivRun = {
    P: [], R: [], C: [], E: [], stageAt: [], leaps: [], events: [],
    stage: 0, fate, tEnd, industrialT, momentT, aiT,
  };

  for (let t = 0; t < horizon; t++) {
    const gap = (P - R) / R;
    const fit = gap > 0 ? Math.max(0.1, 1 - gap * 1.4) : 1;
    P *= 1 + 0.02 * (1 + stage * 0.5) * fit * (0.85 + 0.3 * rnd());
    R = Math.min(cap, R * (1 + 0.003 + k * 0.04 * Math.max(gap, 0)));
    const C = Math.max(0, (P - R) / R);
    if (C > LEAP_THRESHOLD && stage < 4) {
      stage++;
      run.leaps.push(t);
      cap = CAPS[stage];
      R = P * 1.1;
      if (record) run.events.push({ t, kind: 'leap', label: `质变：进入${STAGES[stage]}`, stage });
      if (stage === 3) {
        industrialT = t;
        momentT = [t + 25, t + 60];
      }
    }
    if (aiT === null && stage === 4 && P > 1000) {
      aiT = t;
      if (record) run.events.push({ t, kind: 'ai', label: 'AI 作为新质生产力登场' });
    }
    E = Math.max(0, E + 0.001 * shock * (1 - eco) * Math.log10(1 + P) * (stage >= 3 ? 2.2 : 0.6) - eco * 0.0016);
    if (record) {
      run.P.push(P);
      run.R.push(R);
      run.C.push(C);
      run.E.push(Math.min(E, 1));
      run.stageAt.push(stage);
    }
    if (momentT) {
      if (t === momentT[0]) {
        if (record) run.events.push({ t, kind: 'moment', label: '1962 · B-59 潜艇' });
        if (input.choice1962 === 'launch') { fate = '自我毁灭'; tEnd = t; break; }
      }
      if (t === momentT[1]) {
        if (record) run.events.push({ t, kind: 'moment', label: '1983 · 预警误报' });
        if (input.choice1983 === 'launch') { fate = '自我毁灭'; tEnd = t; break; }
      }
    }
    if (E >= 1) { fate = '生态崩溃'; tEnd = t; break; }
    if (stage >= 3 && rnd() < 0.0045 * Math.pow(1 - coop, 1.2) * Math.min(1, Math.log10(P) / 2.5)) {
      fate = '自我毁灭';
      tEnd = t;
      break;
    }
  }
  run.stage = stage;
  run.fate = fate;
  run.tEnd = tEnd;
  run.industrialT = industrialT;
  run.momentT = momentT;
  run.aiT = aiT;
  if (record) run.events.push({ t: tEnd, kind: 'fate', label: fate === '延续' ? '延续至推演终点' : fate });
  return run;
}

/** 同参数 n 个平行宇宙的存活率（种子固定，可复现）。 */
export function survivalRate(eco: number, coop: number, n = 500): number {
  let s = 0;
  for (let i = 1; i <= n; i++) {
    if (simulateCiv({ eco, coop, seed: i * 7919 }, false).fate === '延续') s++;
  }
  return s / n;
}
