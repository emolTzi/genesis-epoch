// 宇宙推演：L0–L3 的确定性判定。
// 结论统一采用“在已知物理定律与本模型假设下”的口径；每项检查都引用注册表中的参数编号。

import { EARTH_TIME_TO_HUMANS_GYR, T_BOIL, T_FREEZE } from './constants';
import {
  effectiveFlux,
  effectiveTemp,
  equilibriumTemp,
  escapeVelocity,
  habitableZone,
  luminosityFromMass,
  mainSequenceLifetimeGyr,
  planetRadius,
} from './formulas';
import { equilibrium } from './thermostat';
import type { LayerReport, Params, Status, Verdict } from './types';

const num = (p: Params, id: string): number => Number(p[id]);

function v(status: Status, title: string, detail: string, refs?: string[]): Verdict {
  return { status, title, detail, refs };
}

/** 取多项检查中最严重的状态。 */
function worst(checks: { verdict: Verdict }[]): Verdict {
  const order: Status[] = ['fail', 'warn', 'ok'];
  for (const s of order) {
    const hit = checks.find((c) => c.verdict.status === s);
    if (hit) return hit.verdict;
  }
  return v('ok', '通过', '');
}

/* ─────────────── L0 物理常数 ─────────────── */

/** Oberhummer et al. 2000：强力偏移约 0.5% 或库仑力偏移约 4%，碳或氧几乎全部消失。 */
export const HOYLE_WINDOW = { alphaPct: 4, alphasPct: 0.5 };
/** Λ 的示意阈值（倍于现值），只表达 Weinberg 1987 论证的量级。 */
export const LAMBDA_LIMIT = 100;

export function evalL0(p: Params): LayerReport {
  const da = num(p, 'alpha_dev');
  const ds = num(p, 'alphas_dev');
  const lam = num(p, 'lambda_ratio');
  const checks: LayerReport['checks'] = [];

  const inHoyle = Math.abs(da) <= HOYLE_WINDOW.alphaPct && Math.abs(ds) <= HOYLE_WINDOW.alphasPct;
  checks.push({
    id: 'carbon',
    label: '碳与氧的合成',
    verdict: inHoyle
      ? v('ok', '碳与氧同时充足', '霍伊尔态位于三阿尔法过程的共振窗口内，恒星能同时合成碳与氧。', ['hoyle', 'alphas_dev', 'alpha_dev'])
      : v(
          'fail',
          '碳或氧几乎消失',
          `强相互作用偏移 ${ds.toFixed(2)}%、库仑力偏移 ${da.toFixed(1)}%，超出约 ±0.5% 与 ±4% 的窗口。恒星中的碳或氧几乎全部消失，碳基生命与水都失去原料。`,
          ['hoyle', 'alphas_dev', 'alpha_dev'],
        ),
  });
  checks.push({
    id: 'galaxies',
    label: '星系形成',
    verdict:
      lam <= LAMBDA_LIMIT
        ? v('ok', '星系可以形成', `宇宙学常数为现值的 ${fmt(lam)} 倍，物质有时间在引力下聚集成星系。`, ['lambda_ratio'])
        : v('fail', '星系无法形成', `宇宙学常数为现值的 ${fmt(lam)} 倍，加速膨胀过早主导，物质来不及聚集成星系（示意阈值）。`, ['lambda_ratio']),
  });
  return {
    layer: 0,
    verdict: worst(checks),
    values: { alphaDev: da, alphasDev: ds, lambda: lam, inHoyle },
    checks,
  };
}

/* ─────────────── L1 天体 ─────────────── */

export function evalL1(p: Params): LayerReport {
  const m = num(p, 'star_mass');
  const a = num(p, 'orbit_a');
  const A = num(p, 'albedo');
  const mp = num(p, 'planet_mass');
  const moon = Boolean(p.moon);
  const L = luminosityFromMass(m);
  const life = mainSequenceLifetimeGyr(m);
  const hz = habitableZone(L);
  const teq = equilibriumTemp(a, A, L);
  const tFirst = teq + 33;
  const seff = effectiveFlux(a, L);
  const vesc = escapeVelocity(mp);
  const checks: LayerReport['checks'] = [];

  checks.push({
    id: 'lifetime',
    label: '恒星寿命',
    verdict:
      life >= EARTH_TIME_TO_HUMANS_GYR
        ? m < 0.5
          ? v('warn', '寿命足够，但环境严酷', `红矮星寿命长达 ${fmt(life)} Gyr，但宜居带很近，行星可能被潮汐锁定并遭受频繁耀斑（争议）。`, ['star_mass'])
          : v('ok', '寿命足够', `主序寿命约 ${fmt(life)} Gyr，长于地球演化出人类所用的约 45 亿年。`, ['star_mass'])
        : v('fail', '恒星寿命太短', `主序寿命只有约 ${fmt(life)} Gyr，短于地球演化出人类所用的约 45 亿年。`, ['star_mass']),
  });

  let water: Verdict;
  if (tFirst < T_FREEZE) water = v('fail', '冰封', `平衡温度 ${teq.toFixed(1)} K，计入 33 K 温室增温后仍低于冰点。`, ['orbit_a', 'albedo']);
  else if (tFirst > T_BOIL) water = v('fail', '蒸干', `平衡温度 ${teq.toFixed(1)} K，计入温室增温后超过沸点，海洋蒸发。`, ['orbit_a', 'albedo']);
  else if (a < hz.inner) water = v('warn', '一阶估计为液态，但已越过宜居带内缘', '水汽正反馈可能引发失控温室，需要元素之钥（L2）判断。', ['orbit_a']);
  else if (a > hz.outer) water = v('warn', '一阶估计为液态，但在宜居带外缘以外', '需要更强的温室效应维持，需要元素之钥（L2）判断。', ['orbit_a']);
  else water = v('ok', '液态水窗口', `平衡温度 ${teq.toFixed(1)} K，计入温室增温后约 ${(tFirst - 273.15).toFixed(1)} °C。`, ['orbit_a', 'albedo']);
  checks.push({ id: 'water', label: '液态水（一阶估计）', verdict: water });

  let atm: Verdict;
  if (mp < 0.3) atm = v('fail', '大气逃逸', `逃逸速度只有 ${vesc.toFixed(1)} km/s，像火星一样难以长期保住大气（示意阈值）。`, ['planet_mass']);
  else if (mp > 8) atm = v('fail', '厚重气态包层', `质量 ${fmt(mp)} M⊕，很可能吸积厚重的氢氦包层，成为迷你海王星（示意阈值）。`, ['planet_mass']);
  else if (mp > 2) atm = v('warn', '可能有较厚包层', `半径约 ${planetRadius(mp).toFixed(2)} R⊕，处在岩质与气态之间的过渡区（Fulton et al. 2017）。`, ['planet_mass']);
  else atm = v('ok', '能保住大气', `逃逸速度 ${vesc.toFixed(1)} km/s。`, ['planet_mass']);
  checks.push({ id: 'atmosphere', label: '大气保持', verdict: atm });

  checks.push({
    id: 'obliquity',
    label: '自转轴稳定',
    verdict: moon
      ? v('ok', '大卫星稳定自转轴', '倾角变化幅度小，气候长期稳定。', ['moon'])
      : v('warn', '自转轴可能大幅摆动', '没有大卫星时倾角变化可能更剧烈，影响气候稳定（学界有争议）。', ['moon']),
  });

  return {
    layer: 1,
    verdict: worst(checks),
    values: { L, life, hzInner: hz.inner, hzOuter: hz.outer, teq, tFirst, seff, vesc, tStar: effectiveTemp(m), radius: planetRadius(mp) },
    checks,
  };
}

/* ─────────────── L2 行星化学 ─────────────── */

export function hasTectonics(mp: number): boolean {
  return mp >= 0.5 && mp <= 5;
}

export function evalL2(p: Params, l1: LayerReport): LayerReport {
  const mp = num(p, 'planet_mass');
  const tect = hasTectonics(mp);
  const out = num(p, 'outgassing') * (tect ? 1 : 0.3);
  const wth = num(p, 'weathering') * (tect ? 1 : 0.2);
  const teq = Number(l1.values.teq);
  const seff = Number(l1.values.seff);
  const hzIn = Number(l1.values.hzInner);
  const a = num(p, 'orbit_a');
  const eq = equilibrium({ teq, outgassing: out, weathering: wth });
  const checks: LayerReport['checks'] = [];

  checks.push({
    id: 'tectonics',
    label: '板块构造',
    verdict: tect
      ? v('ok', '板块构造活跃', '碳酸盐随板块俯冲回到地幔，再由火山释放，碳循环闭合。', ['tectonics', 'planet_mass'])
      : v('warn', '停滞盖层', '行星质量超出约 0.5–5 M⊕，可能没有板块构造，碳循环减弱（边界有争议）。', ['tectonics', 'planet_mass']),
  });

  let climate: Verdict;
  if (a < hzIn) {
    climate = v('fail', '失控温室', `有效辐照度 ${seff.toFixed(3)}，超过保守宜居带内缘的 1.015。水汽进入高层大气被光解，氢逃逸，海洋不可逆地流失，走上金星的道路。`, ['orbit_a']);
  } else if (eq.clampedHigh || eq.temp > T_BOIL) {
    climate = v('fail', '温室失控', `风化移除不了火山补充的 CO₂，CO₂ 不断累积，地表升到 ${eq.temp.toFixed(0)} K。`, ['weathering', 'outgassing']);
  } else if (eq.clampedLow) {
    climate = v('fail', '永久冰封', `CO₂ 几乎被完全移除且得不到补充，地表 ${eq.temp.toFixed(0)} K，冰反照率正反馈锁死雪球状态。`, ['outgassing']);
  } else if (eq.temp < 260) {
    climate = v('fail', '雪球行星', `稳态地表约 ${eq.temp.toFixed(0)} K，冰反照率正反馈让全球冰封。`, ['outgassing', 'weathering', 'orbit_a']);
  } else if (eq.temp < T_FREEZE) {
    climate = v('warn', '冰期边缘', `稳态地表约 ${eq.temp.toFixed(0)} K，低纬可能仍有液态海洋。`, ['outgassing', 'weathering']);
  } else if (eq.temp > 330) {
    climate = v('warn', '炎热', `稳态地表约 ${(eq.temp - 273.15).toFixed(0)} °C，对复杂生命而言过热。`, ['outgassing', 'weathering']);
  } else {
    climate = v('ok', '恒温器工作', `稳态 CO₂ 为工业化前的 ${fmt(eq.co2)} 倍，地表约 ${(eq.temp - 273.15).toFixed(1)} °C。`, ['outgassing', 'weathering']);
  }
  checks.push({ id: 'climate', label: '长期气候', verdict: climate });

  return {
    layer: 2,
    verdict: worst(checks),
    values: { co2: eq.co2, temp: eq.temp, tectonics: tect, outEff: out, wthEff: wth },
    checks,
  };
}

/* ─────────────── L3 生命 ─────────────── */

export function evalL3(p: Params, l1: LayerReport, l2: LayerReport): LayerReport {
  const checks: LayerReport['checks'] = [];
  const temp = Number(l2.values.temp);
  checks.push({
    id: 'abiogenesis',
    label: '生命起源',
    verdict: v('warn', '按唯一已知样本推演', '生命起源概率 f_l 未知，可能极小。本次推演沿用地球这一唯一已知样本的路径（人择选择效应），真实的稀有程度在终章用蒙特卡洛呈现。', ['f_life']),
  });
  checks.push({
    id: 'complex',
    label: '复杂生命',
    verdict:
      l1.verdict.status === 'fail' || l2.verdict.status === 'fail'
        ? v('fail', '前置条件不满足', '行星或气候层已经失败。', [])
        : temp > 320
          ? v('warn', '高温限制', '高温环境下复杂多细胞生命受限。', [])
          : v('ok', '复杂生命可以出现', '大氧化事件后形成臭氧层，寒武纪生命大爆发得以发生。', []),
  });
  const site = String(p.kpg_site);
  checks.push({
    id: 'kpg',
    label: 'K-Pg 撞击',
    verdict:
      site === 'hazard'
        ? v('ok', '大灭绝发生', '撞击点富含碳氢化合物与硫，烟尘遮天，非鸟恐龙灭绝，哺乳动物获得了生态位。', ['kpg_site'])
        : v('fail', '恐龙延续，人类未必登场', '撞击点落在约 87% 的其他地区，未引发全球性灭绝。非鸟恐龙可能继续统治陆地，人类这一具体结果不会出现（反事实推演）。', ['kpg_site']),
  });
  const decisive = checks.filter((c) => c.id !== 'abiogenesis');
  return { layer: 3, verdict: worst(decisive), values: { site }, checks };
}

/* ─────────────── 汇总 ─────────────── */

export interface StaticReport {
  L0: LayerReport;
  L1: LayerReport;
  L2: LayerReport;
  L3: LayerReport;
  /** 第一个失败的层；全部通过时为 null。 */
  firstFail: 0 | 1 | 2 | 3 | null;
}

export function evaluateStatic(p: Params): StaticReport {
  const L0 = evalL0(p);
  const L1 = evalL1(p);
  const L2 = evalL2(p, L1);
  const L3 = evalL3(p, L1, L2);
  const list = [L0, L1, L2, L3];
  const idx = list.findIndex((r) => r.verdict.status === 'fail');
  return { L0, L1, L2, L3, firstFail: idx < 0 ? null : (idx as 0 | 1 | 2 | 3) };
}

export function fmt(x: number): string {
  if (!isFinite(x)) return '∞';
  const ax = Math.abs(x);
  if (ax >= 1000 || (ax > 0 && ax < 0.01)) return x.toExponential(1).replace('e+', '×10^').replace('e-', '×10^-');
  if (ax >= 100) return x.toFixed(0);
  if (ax >= 10) return x.toFixed(1);
  return x.toFixed(2);
}
