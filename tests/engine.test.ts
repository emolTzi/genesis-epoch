import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/data/params';
import { mulberry32, streamFor } from '../src/core/rng';
import { evaluateStatic, HOYLE_WINDOW } from '../src/sim/universe';
import { equilibrium, perturbation } from '../src/sim/thermostat';
import { hazardFraction, isHazard, randomSafeSite, hazardSite } from '../src/sim/kpg';
import { simulateCiv, survivalRate, STAGES } from '../src/sim/civ';
import { analyticSurvival, simulateFuture } from '../src/sim/future';
import { runMonteCarlo } from '../src/sim/montecarlo';
import { fitGrowth, LYAPUNOV } from '../src/sim/lorenz';
import { downstreamOf, survivalLadder } from '../src/sim/causal';

describe('随机数可复现', () => {
  it('同一种子得到同一序列', () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('不同用途标签得到不同序列', () => {
    expect(streamFor(1, 'a')()).not.toBe(streamFor(1, 'b')());
  });
});

describe('我们的宇宙', () => {
  it('默认参数（地球）通过 L0–L3', () => {
    const r = evaluateStatic(defaultParams());
    expect(r.firstFail).toBeNull();
    expect(r.L2.values.temp as number).toBeGreaterThan(280);
    expect(r.L2.values.temp as number).toBeLessThan(295);
  });
  it('强相互作用偏移超出 0.5% 时 L0 失败', () => {
    const p = { ...defaultParams(), alphas_dev: HOYLE_WINDOW.alphasPct + 0.1 };
    expect(evaluateStatic(p).firstFail).toBe(0);
  });
  it('轨道移到 2.4 AU 时 L1 冰封', () => {
    const r = evaluateStatic({ ...defaultParams(), orbit_a: 2.4 });
    expect(r.firstFail).toBe(1);
    expect(r.L1.checks.find((c) => c.id === 'water')!.verdict.title).toBe('冰封');
  });
  it('金星轨道一阶估计为液态，但 L2 判定失控温室', () => {
    const r = evaluateStatic({ ...defaultParams(), orbit_a: 0.72 });
    expect(r.L1.checks.find((c) => c.id === 'water')!.verdict.status).toBe('warn');
    expect(r.L2.verdict.title).toBe('失控温室');
  });
  it('恒星 1.5 M☉ 寿命太短', () => {
    expect(evaluateStatic({ ...defaultParams(), star_mass: 1.5 }).firstFail).toBe(1);
  });
  it('没有大卫星只给出警示，不判失败', () => {
    const r = evaluateStatic({ ...defaultParams(), moon: false });
    expect(r.L1.verdict.status).toBe('warn');
    expect(r.firstFail).toBeNull();
  });
  it('撞击点在其他地区时人类未必登场', () => {
    expect(evaluateStatic({ ...defaultParams(), kpg_site: 'safe' }).firstFail).toBe(3);
  });
  it('停止火山脱气导致永久冰封', () => {
    expect(evaluateStatic({ ...defaultParams(), outgassing: 0 }).L2.verdict.title).toBe('永久冰封');
  });
});

describe('行星恒温器', () => {
  it('地球稳态 CO₂ 接近工业化前', () => {
    const eq = equilibrium({ teq: 254.6, outgassing: 1, weathering: 1 });
    expect(eq.co2).toBeGreaterThan(0.8);
    expect(eq.co2).toBeLessThan(1.4);
  });
  it('负反馈把升温削减到约一半', () => {
    const c = perturbation({ teq: 254.6, outgassing: 1, weathering: 1 }, 20);
    const last = c.t.length - 1;
    const start = c.withFeedback[0];
    const dWith = c.withFeedback[last] - start;
    const dWithout = c.withoutFeedback[last] - start;
    expect(dWithout).toBeCloseTo(20, 0);
    expect(dWith).toBeLessThan(dWithout * 0.6);
    expect(dWith).toBeGreaterThan(dWithout * 0.35);
  });
});

describe('K-Pg 撞击点', () => {
  it('沉积区并集约占地表 13%', () => {
    expect(hazardFraction()).toBeGreaterThan(0.12);
    expect(hazardFraction()).toBeLessThan(0.14);
  });
  it('安全点与沉积区判定一致', () => {
    expect(isHazard(randomSafeSite(7))).toBe(false);
    expect(isHazard(hazardSite(0))).toBe(true);
  });
});

describe('L4 文明引擎', () => {
  it('同一宇宙编号结果完全复现', () => {
    const a = simulateCiv({ eco: 0.5, coop: 0.6, seed: 2026 });
    const b = simulateCiv({ eco: 0.5, coop: 0.6, seed: 2026 });
    expect(a.fate).toBe(b.fate);
    expect(a.leaps).toEqual(b.leaps);
  });
  it('默认宇宙 2026 依次经历四次质变，到达社会主义社会', () => {
    const r = simulateCiv({ eco: 0.5, coop: 0.6, seed: 2026 });
    expect(r.leaps.length).toBe(4);
    expect(STAGES[r.stage]).toBe('社会主义社会');
    expect(r.fate).toBe('延续');
  });
  it('存活率随合作程度与生态约束上升', () => {
    expect(survivalRate(0.5, 0.9)).toBeGreaterThan(survivalRate(0.5, 0.3));
    expect(survivalRate(0.8, 0.6)).toBeGreaterThan(survivalRate(0.2, 0.6));
  });
  it('导览脚本使用的参数（宇宙 2026、生态 0.65、合作 0.75）让文明延续并出现 AI', () => {
    const r = simulateCiv({ eco: 0.65, coop: 0.75, seed: 2026 });
    expect(r.fate).toBe('延续');
    expect(r.aiT).not.toBeNull();
    expect(r.momentT).not.toBeNull();
  });
  it('在历史时刻选择发射即自我毁灭', () => {
    const r = simulateCiv({ eco: 0.5, coop: 0.6, seed: 2026, choice1983: 'launch' });
    expect(r.fate).toBe('自我毁灭');
    expect(r.tEnd).toBe(r.momentT![1]);
  });
});

describe('L5 未来', () => {
  it('蒙特卡洛与解析式一致', () => {
    const f = { coop: 0.5, carbon: 0.5, ai: 0.5, defense: 0.3 };
    expect(simulateFuture(f, 6000).survival).toBeCloseTo(analyticSurvival(f), 1);
  });
  it('更高的合作、减排与治理提高存活率', () => {
    const lo = analyticSurvival({ coop: 0.2, carbon: 0.2, ai: 0.2, defense: 0.2 });
    const hi = analyticSurvival({ coop: 0.9, carbon: 0.9, ai: 0.9, defense: 0.9 });
    expect(hi).toBeGreaterThan(lo + 0.3);
  });
});

describe('万宇宙蒙特卡洛', () => {
  it('结果可复现，且“只有我们”的比例在 0 与 1 之间', () => {
    const a = runMonteCarlo(4000);
    const b = runMonteCarlo(4000);
    expect(a.aloneFraction).toBe(b.aloneFraction);
    expect(a.aloneFraction).toBeGreaterThan(0.2);
    expect(a.aloneFraction).toBeLessThan(0.95);
  });
});

describe('蝴蝶效应', () => {
  it('Lorenz 系统差异增长率接近最大李雅普诺夫指数', () => {
    const g = fitGrowth(1e-9, 22);
    expect(g).toBeGreaterThan(LYAPUNOV - 0.25);
    expect(g).toBeLessThan(LYAPUNOV + 0.25);
  });
});

describe('因果图', () => {
  it('改动强相互作用会一路影响到 L5', () => {
    const layers = downstreamOf('alphas_dev');
    expect(layers.length).toBeGreaterThanOrEqual(5);
  });
  it('参数空间存活比例逐层递减', () => {
    const { fractions } = survivalLadder(3000);
    for (let i = 1; i < fractions.length; i++) expect(fractions[i]).toBeLessThanOrEqual(fractions[i - 1]);
    expect(fractions[0]).toBeLessThan(0.1);
  });
});
