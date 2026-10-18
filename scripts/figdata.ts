// 为作品介绍文档导出图表数据：全部由作品自身的推演引擎计算，确保文档中的每一张图都与作品一致。
//   npx tsx scripts/figdata.ts   →  docs/submission/data/*.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultParams, EDITABLE } from '../src/data/params';
import { evaluateStatic } from '../src/sim/universe';
import { equilibrium, perturbation, surfaceTemp, weatheringRate } from '../src/sim/thermostat';
import { HAZARD_CAPS, isHazard, hazardFraction, type Vec3 } from '../src/sim/kpg';
import { runMonteCarlo } from '../src/sim/montecarlo';
import { TwinLorenz, fitGrowth, LYAPUNOV } from '../src/sim/lorenz';
import { NODES, survivalLadder } from '../src/sim/causal';
import { survivalRate, simulateCiv } from '../src/sim/civ';
import { simulateFuture, crowd, resultant, project, analyticSurvival, stepRisks } from '../src/sim/future';
import { Sandbox, SB_W, SB_H, SB_DEFAULTS, sandboxSurvival } from '../src/sim/sandbox';
import type { Params } from '../src/sim/types';

const OUT = join(import.meta.dirname, '..', 'docs', 'submission', 'data');
mkdirSync(OUT, { recursive: true });
const save = (name: string, data: unknown) => {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data));
  console.log('wrote', name);
};
const base = defaultParams();
const lin = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const logs = (a: number, b: number, n: number) => lin(Math.log10(a), Math.log10(b), n).map((x) => 10 ** x);
const stat = (s: string) => (s === 'fail' ? 2 : s === 'warn' ? 1 : 0);

// 1. 六层筛选
save('ladder', survivalLadder(12000));

// 2. L0：α–α_s 可行孤岛 + Λ
{
  const A = lin(-10, 10, 161);
  const S = lin(-5, 5, 161);
  const grid = S.map((s) => A.map((a) => stat(evaluateStatic({ ...base, alpha_dev: a, alphas_dev: s }).L0.checks.find((c) => c.id === 'carbon')!.verdict.status)));
  const L = logs(0.01, 1000, 200);
  const lam = L.map((l) => stat(evaluateStatic({ ...base, lambda_ratio: l }).L0.checks.find((c) => c.id === 'galaxies')!.verdict.status));
  save('l0', { alpha: A, alphas: S, grid, lambda: L, lambdaStatus: lam });
}

// 3. L1×L2：恒星质量 × 轨道 → 判定类别与地表温度
{
  const M = lin(0.1, 2, 120);
  const Aa = logs(0.05, 3, 160);
  const cls: number[][] = [];
  const temp: number[][] = [];
  const teq: number[][] = [];
  const titles = new Map<string, number>();
  for (const m of M) {
    const rc: number[] = [];
    const rt: number[] = [];
    const rq: number[] = [];
    for (const a of Aa) {
      const r = evaluateStatic({ ...base, star_mass: m, orbit_a: a });
      let t = '通过';
      if (r.firstFail === 1) t = r.L1.verdict.title;
      else if (r.firstFail === 2) t = r.L2.verdict.title;
      else if (r.L1.verdict.status === 'warn' || r.L2.verdict.status === 'warn') t = '通过（警示）';
      if (!titles.has(t)) titles.set(t, titles.size);
      rc.push(titles.get(t)!);
      rt.push(Number(r.L2.values.temp ?? NaN));
      rq.push(Number(r.L1.values.teq));
    }
    cls.push(rc);
    temp.push(rt);
    teq.push(rq);
  }
  save('l1', { mass: M, orbit: Aa, cls, temp, teq, labels: [...titles.keys()] });
}

// 4. 行星恒温器
{
  const T = lin(200, 330, 131);
  const fb = T.map((t) => equilibrium({ teq: t, outgassing: 1, weathering: 1 }));
  const nofb = T.map((t) => surfaceTemp(t, 1));
  const tg = lin(250, 340, 91);
  const cg = lin(-3, 3, 121);
  const W = cg.map((lc) => tg.map((t) => Math.log10(weatheringRate(1, 10 ** lc, t))));
  const earth = equilibrium({ teq: 254.6, outgassing: 1, weathering: 1 });
  const resp = perturbation({ teq: 254.6, outgassing: 1, weathering: 1 }, 20);
  const sweeps = [0.25, 0.5, 1, 2, 3].map((o) => ({ outgassing: o, temp: T.map((t) => equilibrium({ teq: t, outgassing: o, weathering: 1 }).temp) }));
  save('thermo', { teq: T, fbTemp: fb.map((s) => s.temp), fbCo2: fb.map((s) => s.co2), noFb: nofb, gridT: tg, gridLogC: cg, logW: W, earth, resp, sweeps });
}

// 5. K-Pg 沉积区地图
{
  const lat = lin(-89.5, 89.5, 180);
  const lon = lin(-179.5, 179.5, 360);
  const grid = lat.map((la) => lon.map((lo) => {
    const p = (la * Math.PI) / 180;
    const l = (lo * Math.PI) / 180;
    const d: Vec3 = [Math.cos(p) * Math.cos(l), Math.sin(p), Math.cos(p) * Math.sin(l)];
    return isHazard(d) ? 1 : 0;
  }));
  save('kpg', { lat, lon, grid, caps: HAZARD_CAPS, fraction: hazardFraction() });
}

// 6. 德雷克方程蒙特卡洛
{
  const mc = runMonteCarlo(10000);
  const pick = (k: 'Rstar' | 'fp' | 'ne' | 'fl' | 'fi' | 'fc' | 'L' | 'N') => mc.samples.map((s) => Math.log10(Math.max(s[k], 1e-300)));
  save('drake', { aloneFraction: mc.aloneFraction, median: mc.medianLog10N, N: pick('N'), Rstar: pick('Rstar'), fp: pick('fp'), ne: pick('ne'), fl: pick('fl'), fi: pick('fi'), fc: pick('fc'), L: pick('L') });
}

// 7. 洛伦兹双轨迹
{
  const tw = new TwinLorenz(1e-6);
  const a: number[][] = [];
  const b: number[][] = [];
  const t: number[] = [];
  const d: number[] = [];
  while (tw.t < 40) {
    tw.step(4);
    a.push([...tw.a]);
    b.push([...tw.b]);
    t.push(tw.t);
    d.push(tw.distance());
  }
  save('lorenz', { a, b, t, d, lambda: LYAPUNOV, fit: fitGrowth(1e-9, 20), splitT: tw.splitT });
}

// 8. 文明沙盘：快照与时间序列
{
  const sb = new Sandbox(2026, SB_DEFAULTS, Number(evaluateStatic(base).L2.values.temp), true);
  const snaps: unknown[] = [];
  const at = new Set([60, 200, 360, 520]);
  const snap = () => ({
    t: sb.t, year: Math.round(sb.year), era: sb.era,
    biome: Array.from(sb.biome), owner: Array.from(sb.owner), degrade: Array.from(sb.degrade).map((x) => +x.toFixed(3)),
    elev: Array.from(sb.terrain.elev).map((x) => +x.toFixed(4)), sea: sb.terrain.seaLevel,
    settlements: sb.settlements.filter((s) => s.pop > 0).map((s) => ({ x: s.x, y: s.y, pop: +s.pop.toFixed(2), polity: s.polity, ruined: s.ruined, plague: s.plague > 0 })),
    routes: sb.routes.map((r) => ({ a: [sb.settlements[r.a].x, sb.settlements[r.a].y], b: [sb.settlements[r.b].x, sb.settlements[r.b].y], vol: +r.vol.toFixed(3), sea: r.sea })),
    hues: sb.polities.map((p) => p.hue), stages: sb.polities.map((p) => p.stage), wars: sb.wars.map((w) => w.front),
  });
  while (!sb.done) {
    if (at.has(sb.t)) snaps.push(snap());
    sb.step();
    if (sb.pendingCrisis) sb.resolveCrisis('wait');
  }
  snaps.push(snap());
  const ev = sb.events.filter((e) => e.kind !== 'found').map((e) => ({ t: e.t, kind: e.kind }));
  save('sandbox', { W: SB_W, H: SB_H, snaps, series: sb.series, fate: sb.fate, tEnd: sb.tEnd, events: ev, industrialT: sb.industrialT, aiT: sb.aiT });
}

// 9. 相图：合作 × 生态约束（宏观精细网格 + 微观抽样）
{
  const C = lin(0, 1, 21);
  const Ec = lin(0, 1, 21);
  const macro = Ec.map((e) => C.map((c) => survivalRate(e, c, 300)));
  const Cm = [0.1, 0.3, 0.5, 0.7, 0.9];
  const Em = [0.1, 0.3, 0.5, 0.7, 0.9];
  const micro = Em.map((e) => Cm.map((c) => sandboxSurvival({ ...SB_DEFAULTS, coop: c, eco: e }, 12, 11)));
  console.log('micro phase done');
  const curveC = lin(0, 1, 11);
  const macroCurve = curveC.map((c) => survivalRate(0.5, c, 500));
  const microCurve = curveC.map((c) => sandboxSurvival({ ...SB_DEFAULTS, coop: c }, 16, 3));
  save('phase', { C, E: Ec, macro, Cm, Em, micro, curveC, macroCurve, microCurve });
}

// 10. 宏观双环模型的一次推演
{
  const run = simulateCiv({ eco: 0.65, coop: 0.75, seed: 2026 });
  save('civ', { P: run.P, R: run.R, C: run.C, E: run.E, stageAt: run.stageAt, leaps: run.leaps, fate: run.fate, tEnd: run.tEnd });
}

// 11. 未来情景与历史合力
{
  const scen = { 现状基线: { coop: 0.3, carbon: 0.3, ai: 0.3, defense: 0.3 }, 默认: { coop: 0.5, carbon: 0.5, ai: 0.5, defense: 0.3 }, 共同努力: { coop: 0.78, carbon: 0.78, ai: 0.78, defense: 0.78 }, 对立: { coop: 0.1, carbon: 0.2, ai: 0.2, defense: 0.1 } };
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(scen)) out[k] = { ...simulateFuture(f, 4000), analytic: analyticSurvival(f), risks: stepRisks(f) };
  const people = crowd(240);
  save('future', { scen: out, vectors: people.map(project), resultant: project(resultant(people)) });
}

// 12. 单参数敏感度：其他参数取地球值，扫过滑杆全程
{
  const ids = ['alpha_dev', 'alphas_dev', 'lambda_ratio', 'star_mass', 'orbit_a', 'albedo', 'planet_mass', 'outgassing', 'weathering'];
  const res = ids.map((id) => {
    const d = EDITABLE.find((p) => p.id === id)!;
    const xs = d.log ? logs(d.min!, d.max!, 400) : lin(d.min!, d.max!, 400);
    const st = xs.map((x) => {
      const r = evaluateStatic({ ...base, [id]: x } as Params);
      return r.firstFail !== null ? 2 : r.L1.verdict.status === 'warn' || r.L2.verdict.status === 'warn' || r.L0.verdict.status === 'warn' ? 1 : 0;
    });
    const pass = st.filter((s) => s < 2).length / st.length;
    return { id, name: d.name, symbol: d.symbol, unit: d.unit ?? '', log: !!d.log, min: d.min, max: d.max, value: d.value, xs, st, pass };
  });
  save('sensitivity', res);
}

// 13. 因果图
save('causal', NODES);
console.log('all done');
