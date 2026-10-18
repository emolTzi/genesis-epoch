import { describe, expect, it } from 'vitest';
import { Sandbox, SB_DEFAULTS, SB_HORIZON, makeTerrain, sandboxSurvival, SB_W, SB_H, type SandboxParams } from '../src/sim/sandbox';
import { survivalRate } from '../src/sim/civ';

const P = (o: Partial<SandboxParams> = {}): SandboxParams => ({ ...SB_DEFAULTS, ...o });

describe('微观文明沙盘：可复现', () => {
  it('同一宇宙编号得到同一片大陆', () => {
    const a = makeTerrain(2026);
    const b = makeTerrain(2026);
    expect(Array.from(a.land)).toEqual(Array.from(b.land));
    const c = makeTerrain(2027);
    expect(Array.from(a.land)).not.toEqual(Array.from(c.land));
  });

  it('陆地约占 43%（海平面取高度分位）', () => {
    const t = makeTerrain(7);
    const land = t.land.reduce((s, v) => s + v, 0) / (SB_W * SB_H);
    expect(land).toBeGreaterThan(0.4);
    expect(land).toBeLessThan(0.46);
  });

  it('同编号、同参数的两次推演完全一致', () => {
    const a = new Sandbox(2026, P());
    const b = new Sandbox(2026, P());
    for (let i = 0; i < 300; i++) {
      a.step();
      b.step();
    }
    expect(a.series.pop).toEqual(b.series.pop);
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
  });

  it('回溯重放：带参数改动与干预的历史可以逐步复现', () => {
    const a = new Sandbox(101, P(), 288, true);
    for (let i = 0; i < 120; i++) a.step();
    a.setParams({ coop: 0.9 });
    const s = a.settlements[0];
    a.act({ type: 'tech', cell: s.y * SB_W + s.x });
    for (let i = 0; i < 80; i++) a.step();
    const b = Sandbox.replay(101, P(), 288, a.log, a.t, true);
    expect(b.t).toBe(a.t);
    expect(b.worldPop()).toBeCloseTo(a.worldPop(), 9);
    expect(b.polities.map((p) => p.tech)).toEqual(a.polities.map((p) => p.tech));
  });
});

describe('微观文明沙盘：涌现', () => {
  const run = new Sandbox(2026, P());
  run.runToEnd();

  it('聚落拓殖、商路形成、社会形态依次更替', () => {
    expect(run.settlements.length).toBeGreaterThan(60);
    expect(run.events.some((e) => e.kind === 'leap')).toBe(true);
    expect(run.events.some((e) => e.kind === 'era')).toBe(true);
    const stages = run.polities.map((p) => p.stage);
    expect(Math.max(...stages)).toBeGreaterThanOrEqual(3);
  });

  it('质变发生在矛盾越过阈值时，且生产关系随之重置', () => {
    const sb = new Sandbox(7, P());
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) {
      const before = sb.polities.map((p) => p.stage);
      sb.step();
      sb.polities.forEach((p, k) => {
        if (k < before.length && p.stage > before[k]) {
          seen = true;
          expect(p.R).toBeGreaterThan(p.P);
        }
      });
    }
    expect(seen).toBe(true);
  });

  it('同一时刻不同政体可以处在不同的社会形态（统一性与多样性）', () => {
    const sb = new Sandbox(555, P());
    let diverse = false;
    while (!sb.done && !diverse) {
      sb.step();
      const stages = new Set(sb.polities.filter((p) => p.alive).map((p) => p.stage));
      if (stages.size >= 2) diverse = true;
    }
    expect(diverse).toBe(true);
  });

  it('推演在终点或毁灭时结束', () => {
    expect(run.done).toBe(true);
    expect(run.tEnd).toBeLessThanOrEqual(SB_HORIZON);
  });
});

describe('微观文明沙盘：参量的方向', () => {
  it('合作程度越高，存活率越高（24 个宇宙）', () => {
    const low = sandboxSurvival(P({ coop: 0.2 }), 24);
    const high = sandboxSurvival(P({ coop: 0.9 }), 24);
    expect(high).toBeGreaterThan(low + 0.3);
  }, 240000);

  it('生态约束很弱时，生态崩溃占多数', () => {
    let eco = 0;
    for (let i = 0; i < 16; i++) {
      const sb = new Sandbox(1 + i * 7919, P({ eco: 0.1, coop: 0.9 }));
      if (sb.runToEnd() === '生态崩溃') eco++;
    }
    expect(eco).toBeGreaterThan(8);
  }, 240000);

  it('开放交流越高，技术扩散越快', () => {
    const tech = (o: number) => {
      const sb = new Sandbox(2026, P({ openness: o }));
      for (let i = 0; i < 300; i++) sb.step();
      return sb.polities.filter((p) => p.alive).reduce((s, p) => s + p.tech, 0) / sb.polities.filter((p) => p.alive).length;
    };
    expect(tech(0.95)).toBeGreaterThan(tech(0.05));
  });

  it('与宏观平均场模型趋势一致：两者的存活率都随合作程度上升', () => {
    const macroLow = survivalRate(0.5, 0.2);
    const macroHigh = survivalRate(0.5, 0.9);
    const microLow = sandboxSurvival(P({ coop: 0.2 }), 16, 3);
    const microHigh = sandboxSurvival(P({ coop: 0.9 }), 16, 3);
    expect(macroHigh).toBeGreaterThan(macroLow);
    expect(microHigh).toBeGreaterThan(microLow);
  }, 240000);
});

describe('微观文明沙盘：跨层耦合与干预', () => {
  it('地表过冷时找不到可耕作的土地，文明无从开始', () => {
    const sb = new Sandbox(2026, P(), 225);
    expect(sb.fate).toBe('未能开始');
  });

  it('全球变暖让荒漠扩张、承载力下降', () => {
    const cool = new Sandbox(2026, P(), 288);
    const hot = new Sandbox(2026, P(), 304);
    const desert = (sb: Sandbox) => sb.biome.reduce((s, b) => s + (b === 6 ? 1 : 0), 0);
    expect(desert(hot)).toBeGreaterThan(desert(cool));
  });

  it('调停可以结束一场战争', () => {
    const sb = new Sandbox(2026, P({ coop: 0.05 }));
    while (!sb.wars.length && !sb.done) sb.step();
    expect(sb.wars.length).toBeGreaterThan(0);
    const w = sb.wars[0];
    const cell = w.front[0];
    const n = sb.wars.length;
    sb.act({ type: 'peace', cell });
    expect(sb.wars.length).toBe(n - 1);
  });

  it('核危机在交互模式下等待观众选择；克制则停火，发射则毁灭', () => {
    const find = () => {
      const sb = new Sandbox(2026, P({ coop: 0.05 }), 288, true);
      while (!sb.pendingCrisis && !sb.done) sb.step();
      return sb;
    };
    const a = find();
    expect(a.pendingCrisis).not.toBeNull();
    a.resolveCrisis('wait');
    expect(a.done).toBe(false);
    const b = find();
    b.resolveCrisis('launch');
    expect(b.fate).toBe('自我毁灭');
  });
});
