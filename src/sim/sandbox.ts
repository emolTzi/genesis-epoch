// L4 微观文明沙盘：基于主体的模型（agent-based model）。
//   地形：程序生成的大陆，温度随纬度、海拔与全球温度变化，决定生物群系与土地肥力。
//   主体：聚落。耕作、增殖、拓殖、贸易、传染、战争。
//   政体：由聚落组成。生产力 P、生产关系容量 R、矛盾 C 在政体层面涌现，C 越过阈值即社会形态更替。
//   全局：人与自然的张力 E 由各政体的生产累积，改变气温与肥力；核战争与生态崩溃是两种毁灭。
// 宏观的双环模型（civ.ts）是它的平均场近似：两者共享容纳上限、跃迁阈值与风险随合作程度变化的形式。
// 示意性模型：用于可视化理论机制，并非历史预测。

import { mulberry32, hashString, type Rng } from '../core/rng';

export const SB_W = 72;
export const SB_H = 44;
export const SB_HORIZON = 680;
const N = SB_W * SB_H;
const MAX_SETTLEMENTS = 230;
/** 各社会形态的容纳上限，与宏观模型一致。 */
const CAPS = [2, 8, 40, 600, 1e12];
export const SB_LEAP = 0.6;
/** 技术进步的基础速率。 */
const TECH_RATE = 0.0105;
/** 工业时代之后人与自然张力的累积系数与生态约束的修复系数（示意取值，经蒙特卡洛校准）。 */
const E_IND = 1.95;
const E_REC = 0.0022;

export const SB_STAGES = ['原始社会', '奴隶社会', '封建社会', '资本主义社会', '社会主义社会'] as const;
export const ERAS = ['农耕', '青铜与文字', '铁器', '印刷与远航', '蒸汽', '电力', '核能', '信息', '人工智能'] as const;
/** 每个技术时代在沙盘纪年中的每步年数：越往后，历史越密集。 */
const YEARS_PER_TICK = [36, 26, 18, 10, 4, 2.2, 1.4, 1, 0.8];

export const BIOMES = ['深海', '浅海', '冰原', '苔原', '草原', '森林', '荒漠', '山地'] as const;
export type Biome = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SandboxParams {
  /** 合作程度 κ。 */
  coop: number;
  /** 生态约束 ε。 */
  eco: number;
  /** 开放交流 ο：贸易与技术扩散，也让瘟疫传得更快。 */
  openness: number;
  /** 制度弹性 ρ：生产关系跟上生产力的速度。 */
  reform: number;
}

export const SB_DEFAULTS: SandboxParams = { coop: 0.6, eco: 0.5, openness: 0.5, reform: 0.5 };

export interface Settlement {
  id: number;
  name: string;
  x: number;
  y: number;
  /** 人口（万人）。 */
  pop: number;
  /** 土地承载力（万人）。 */
  cap: number;
  polity: number;
  founded: number;
  /** 瘟疫剩余步数；负数为免疫期。 */
  plague: number;
  famine: boolean;
  /** 遭受核打击。 */
  ruined: boolean;
  coast: boolean;
  log: { t: number; text: string }[];
}

export interface Polity {
  id: number;
  name: string;
  hue: number;
  alive: boolean;
  capital: number;
  stage: number;
  tech: number;
  P: number;
  R: number;
  C: number;
  pop: number;
  /** 合作倾向：在全局合作程度上的个体差异。 */
  trait: number;
  founded: number;
  cells: number;
}

export interface Route {
  a: number;
  b: number;
  vol: number;
  sea: boolean;
}

export interface War {
  a: number;
  b: number;
  start: number;
  /** 前线格子。 */
  front: number[];
  nuclear: boolean;
}

export type SbEventKind = 'found' | 'leap' | 'leap2' | 'split' | 'war' | 'peace' | 'plague' | 'famine' | 'era' | 'ally' | 'union' | 'crisis' | 'nuke' | 'collapse' | 'fate' | 'act' | 'conquest';

export interface SbEvent {
  t: number;
  year: number;
  kind: SbEventKind;
  text: string;
  /** 事件发生的格子，用于镜头定位与特效。 */
  cell?: number;
  polity?: number;
}

export type SbFate = '延续' | '生态崩溃' | '自我毁灭' | '未能开始';

export interface Crisis {
  /** 第几次核危机：0 对应我们世界的 1962，1 对应 1983。 */
  k: 0 | 1;
  a: number;
  b: number;
  cell: number;
}

export type SbAction =
  | { type: 'tech'; cell: number }
  | { type: 'plague'; cell: number }
  | { type: 'drought'; cell: number }
  | { type: 'peace'; cell: number }
  | { type: 'restore'; cell: number };

export type LogEntry =
  | { t: number; kind: 'params'; values: Partial<SandboxParams> }
  | { t: number; kind: 'act'; action: SbAction }
  | { t: number; kind: 'crisis'; choice: 'wait' | 'launch' };

export interface Series {
  pop: number[];
  P: number[];
  R: number[];
  C: number[];
  E: number[];
  wars: number[];
  polities: number[];
  /** 各社会形态的人口占比。 */
  share: number[][];
  year: number[];
}

/* ─────────────── 噪声 ─────────────── */

function valueNoise(rng: Rng): (x: number, y: number) => number {
  const P = 256;
  const tab = new Float32Array(P * P);
  for (let i = 0; i < tab.length; i++) tab[i] = rng();
  const at = (i: number, j: number) => tab[(((j % P) + P) % P) * P + (((i % P) + P) % P)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = s(x - i);
    const fy = s(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 5): number {
  let a = 0.5;
  let f = 1;
  let s = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    s += a * n(x * f + o * 17.3, y * f + o * 9.1);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

/* ─────────────── 地形 ─────────────── */

export interface Terrain {
  /** 连续高度场，用于渲染；分辨率为格子的 sub 倍。 */
  height: (fx: number, fy: number) => number;
  elev: Float32Array;
  moist: Float32Array;
  land: Uint8Array;
  coast: Uint8Array;
  seaLevel: number;
}

/** 生成大陆。同一编号得到同一片土地。 */
export function makeTerrain(seed: number): Terrain {
  const rng = mulberry32((seed ^ hashString('terrain')) >>> 0);
  const n1 = valueNoise(rng);
  const n2 = valueNoise(rng);
  const ox = rng() * 100;
  const oy = rng() * 100;
  const height = (fx: number, fy: number) => {
    const nx = fx / SB_W - 0.5;
    const ny = fy / SB_H - 0.5;
    const e = fbm(n1, ox + fx * 0.075, oy + fy * 0.075, 5);
    const ridge = 1 - Math.abs(fbm(n2, ox + fx * 0.05, oy + fy * 0.05, 3) * 2 - 1);
    const edge = Math.pow(Math.max(Math.abs(nx) * 2, Math.abs(ny) * 2), 3);
    return e * 0.85 + ridge * 0.3 - edge * 0.55;
  };
  const elev = new Float32Array(N);
  const moist = new Float32Array(N);
  for (let y = 0; y < SB_H; y++) {
    for (let x = 0; x < SB_W; x++) {
      const i = y * SB_W + x;
      elev[i] = height(x + 0.5, y + 0.5);
      moist[i] = fbm(n2, 50 + x * 0.09, 70 + y * 0.09, 4);
    }
  }
  // 海平面取高度的 57% 分位，保证不同编号的陆地比例相近
  const sorted = Float32Array.from(elev).sort();
  const seaLevel = sorted[Math.floor(N * 0.57)];
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = elev[i] > seaLevel ? 1 : 0;
  const coast = new Uint8Array(N);
  for (let y = 0; y < SB_H; y++) {
    for (let x = 0; x < SB_W; x++) {
      const i = y * SB_W + x;
      if (!land[i]) continue;
      for (const [dx, dy] of NB4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < SB_W && yy < SB_H && !land[yy * SB_W + xx]) coast[i] = 1;
      }
      // 海岸更湿润
      if (coast[i]) moist[i] = Math.min(1, moist[i] + 0.12);
    }
  }
  return { height, elev, moist, land, coast, seaLevel };
}

const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** 半径 r 以内的格子偏移（圆形）。 */
function disc(r: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= r + 0.01) out.push([dx, dy, d]);
  }
  return out;
}
const DISC2 = disc(2);
const DISC4 = disc(4);

/** 格子温度（K）：全球平均地表温度 + 纬度与海拔修正。 */
export function cellTemp(globalK: number, y: number, elevAboveSea: number): number {
  const lat = Math.abs((y + 0.5) / SB_H - 0.5) * 2;
  return globalK + 13 - 40 * Math.pow(lat, 1.6) - 60 * Math.max(0, elevAboveSea);
}

export function biomeOf(t: Terrain, i: number, tempK: number): Biome {
  const above = t.elev[i] - t.seaLevel;
  if (!t.land[i]) return above < -0.06 ? 0 : tempK < 262 ? 2 : 1;
  if (tempK < 261) return 2;
  if (above > 0.27) return 7;
  if (tempK < 271) return 3;
  const m = t.moist[i];
  if (m < 0.36 && tempK > 286) return 6;
  if (m > 0.55) return 5;
  return 4;
}

const BIOME_FERT = [0, 0, 0.02, 0.12, 0.85, 0.6, 0.08, 0.12];

/* ─────────────── 名字 ─────────────── */

const S1 = ['澜', '锦', '岐', '临', '沅', '昆', '阆', '洛', '邺', '苍', '渭', '岷', '湘', '溱', '汾', '琅', '庐', '嵩', '舒', '瀛', '朔', '霍', '甘', '湛', '濮', '淇', '允', '芮', '郢', '颍'];
const S2 = ['邑', '城', '原', '川', '州', '台', '阳', '浦', '陵', '丘', '野', '津', '泽', '关', '堡', '渡'];
const P1 = ['夏', '殷', '虞', '弦', '昭', '岱', '衡', '溟', '燧', '翎', '穹', '曜', '澄', '珩', '岚', '璇'];

/* ─────────────── 模型 ─────────────── */

export class Sandbox {
  readonly seed: number;
  readonly terrain: Terrain;
  params: SandboxParams;
  /** 全球平均地表温度（K），来自第③幕的行星恒温器。 */
  readonly baseTemp: number;
  /** 交互模式：核危机时暂停，等待观众选择。 */
  interactive: boolean;
  t = 0;
  year = 1;
  E = 0.05;
  /** 全球温度偏移（K）：人与自然的张力与核冬天。 */
  dT = 0;
  nuclearWinter = 0;
  fertility = new Float32Array(N);
  degrade = new Float32Array(N);
  biome = new Uint8Array(N);
  owner = new Int16Array(N).fill(-1);
  /** 干旱剩余步数。 */
  drought = new Float32Array(N);
  settlements: Settlement[] = [];
  polities: Polity[] = [];
  routes: Route[] = [];
  wars: War[] = [];
  allies = new Set<string>();
  events: SbEvent[] = [];
  series: Series = { pop: [], P: [], R: [], C: [], E: [], wars: [], polities: [], share: [], year: [] };
  fate: SbFate | null = null;
  tEnd = SB_HORIZON;
  crisisCount = 0;
  pendingCrisis: Crisis | null = null;
  /** 参数变化、干预与危机选择的记录：回溯时据此确定性地重放。 */
  log: LogEntry[] = [];
  era = 0;
  aiT: number | null = null;
  industrialT: number | null = null;
  union = false;
  private rng: Rng;
  private shock: number;
  private nameUsed = new Set<string>();
  private peaceSince = new Map<string, number>();

  constructor(seed: number, params: SandboxParams = SB_DEFAULTS, baseTemp = 288, interactive = false) {
    this.seed = seed;
    this.params = { ...params };
    this.baseTemp = baseTemp;
    this.interactive = interactive;
    this.terrain = makeTerrain(seed);
    this.rng = mulberry32((seed ^ hashString('sandbox')) >>> 0);
    this.shock = 0.6 + 0.8 * this.rng();
    this.updateClimate();
    this.seedCradles();
    this.updateOwnership();
    this.record();
    // 上游参数（轨道、恒星、恒温器）让地表过冷或过热时，可能找不到可以耕作的土地
    if (!this.polities.length) this.end('未能开始', '这颗行星上没有可以耕作的土地，文明无从开始。');
  }

  /* ───── 公共接口 ───── */

  get done(): boolean {
    return this.fate !== null;
  }

  setParams(values: Partial<SandboxParams>): void {
    const changed = Object.entries(values).filter(([k, v]) => this.params[k as keyof SandboxParams] !== v);
    if (!changed.length) return;
    Object.assign(this.params, values);
    this.log.push({ t: this.t, kind: 'params', values: { ...values } });
  }

  act(action: SbAction): SbEvent | null {
    this.log.push({ t: this.t, kind: 'act', action });
    return this.applyAction(action);
  }

  resolveCrisis(choice: 'wait' | 'launch'): void {
    if (!this.pendingCrisis) return;
    this.log.push({ t: this.t, kind: 'crisis', choice });
    this.applyCrisis(choice);
  }

  /** 从头确定性地重放到第 t 步：回溯与分支。 */
  static replay(seed: number, params0: SandboxParams, baseTemp: number, log: LogEntry[], until: number, interactive = true): Sandbox {
    const sb = new Sandbox(seed, params0, baseTemp, interactive);
    const queue = log.filter((e) => e.t < until || (e.t === until && e.kind !== 'crisis'));
    let qi = 0;
    while (sb.t < until && !sb.done) {
      while (qi < queue.length && queue[qi].t <= sb.t && queue[qi].kind !== 'crisis') {
        const e = queue[qi++];
        if (e.kind === 'params') sb.setParams(e.values);
        else if (e.kind === 'act') sb.act(e.action);
      }
      sb.step();
      if (sb.pendingCrisis) {
        const c = queue.findIndex((e, j) => j >= qi && e.kind === 'crisis');
        if (c < 0) break;
        const e = queue[c] as Extract<LogEntry, { kind: 'crisis' }>;
        queue.splice(c, 1);
        sb.resolveCrisis(e.choice);
      }
    }
    while (qi < queue.length && queue[qi].t <= sb.t) {
      const e = queue[qi++];
      if (e.kind === 'params') sb.setParams(e.values);
      else if (e.kind === 'act') sb.act(e.action);
    }
    return sb;
  }

  /** 推进一步。返回本步产生的事件。 */
  step(): SbEvent[] {
    if (this.done || this.pendingCrisis) return [];
    const before = this.events.length;
    const t = this.t;
    if (t % 10 === 0) this.updateClimate();
    this.growSettlements();
    if (t % 2 === 0) this.colonize();
    if (t % 4 === 0) this.updateOwnership();
    if (t % 3 === 0) this.buildRoutes();
    this.updatePolities();
    this.diplomacy();
    this.fight();
    this.spreadPlague();
    this.ecology();
    this.checkFates();
    this.t++;
    this.year += YEARS_PER_TICK[this.era];
    this.record();
    if (!this.done && this.t >= SB_HORIZON) this.end('延续', '推演到达终点，这个文明延续了下来。');
    return this.events.slice(before);
  }

  /** 无交互地一直推演到结束（蒙特卡洛与测试用）。 */
  runToEnd(maxT = SB_HORIZON): SbFate {
    while (!this.done && this.t < maxT) {
      this.step();
      if (this.pendingCrisis) this.applyCrisis(this.autoChoice());
    }
    return this.fate ?? '延续';
  }

  settlementAt(cell: number, radius = 1.6): Settlement | null {
    const cx = cell % SB_W;
    const cy = Math.floor(cell / SB_W);
    let best: Settlement | null = null;
    let bd = radius;
    for (const s of this.settlements) {
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d <= bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  worldPop(): number {
    let p = 0;
    for (const s of this.settlements) p += s.pop;
    return p;
  }

  leader(): Polity | null {
    let best: Polity | null = null;
    for (const p of this.polities) if (p.alive && (!best || p.P > best.P)) best = p;
    return best;
  }

  /* ───── 初始化 ───── */

  private yearText(): string {
    return `第 ${Math.round(this.year)} 年`;
  }

  private emit(kind: SbEventKind, text: string, cell?: number, polity?: number): SbEvent {
    const e: SbEvent = { t: this.t, year: Math.round(this.year), kind, text, cell, polity };
    this.events.push(e);
    return e;
  }

  private uniqueName(pool1: string[], pool2: string[]): string {
    for (let k = 0; k < 40; k++) {
      const a = pool1[Math.floor(this.rng() * pool1.length)];
      const b = pool2[Math.floor(this.rng() * pool2.length)];
      const n = a + b;
      if (!this.nameUsed.has(n)) {
        this.nameUsed.add(n);
        return n;
      }
    }
    return pool1[Math.floor(this.rng() * pool1.length)] + String(this.settlements.length);
  }

  private seedCradles(): void {
    const cand: number[] = [];
    for (let i = 0; i < N; i++) if (this.terrain.land[i] && this.fertility[i] > 0.35) cand.push(i);
    cand.sort((a, b) => this.fertility[b] + this.terrain.coast[b] * 0.15 - (this.fertility[a] + this.terrain.coast[a] * 0.15));
    const chosen: number[] = [];
    for (const i of cand) {
      if (chosen.length >= 8) break;
      const x = i % SB_W;
      const y = Math.floor(i / SB_W);
      if (chosen.every((j) => Math.hypot((j % SB_W) - x, Math.floor(j / SB_W) - y) > 11)) chosen.push(i);
    }
    const hues = [0.08, 0.55, 0.92, 0.33, 0.72, 0.15, 0.45, 0.62];
    chosen.forEach((cell, k) => {
      const pid = this.polities.length;
      const name = this.uniqueName(P1, ['', '']).replace(/\d+$/, '');
      this.polities.push({
        id: pid, name: `${name}`, hue: hues[k % hues.length], alive: true, capital: -1, stage: 0, tech: 0,
        P: 1, R: 1.1, C: 0, pop: 0, trait: (this.rng() - 0.5) * 0.3, founded: 0, cells: 0,
      });
      const s = this.found(cell, pid, 2 + this.rng() * 1.5, null);
      this.polities[pid].capital = s.id;
    });
  }

  private found(cell: number, polity: number, pop: number, parent: Settlement | null): Settlement {
    const s: Settlement = {
      id: this.settlements.length,
      name: this.uniqueName(S1, S2),
      x: cell % SB_W,
      y: Math.floor(cell / SB_W),
      pop,
      cap: pop,
      polity,
      founded: this.t,
      plague: 0,
      famine: false,
      ruined: false,
      coast: !!this.terrain.coast[cell],
      log: [],
    };
    s.log.push({ t: this.t, text: parent ? `${this.yearText()}，来自${parent.name}的移民在此建立聚落。` : `${this.yearText()}，最早的农人在这片沃土上定居。` });
    this.settlements.push(s);
    return s;
  }

  private note(s: Settlement, text: string): void {
    s.log.push({ t: this.t, text: `${this.yearText()}，${text}` });
    if (s.log.length > 10) s.log.splice(1, 1);
  }

  /* ───── 气候与肥力 ───── */

  private updateClimate(): void {
    const g = this.baseTemp + this.dT - this.nuclearWinter * 18;
    const tr = this.terrain;
    for (let i = 0; i < N; i++) {
      const y = Math.floor(i / SB_W);
      const temp = cellTemp(g, y, tr.elev[i] - tr.seaLevel);
      const b = biomeOf(tr, i, temp);
      this.biome[i] = b;
      // 作物的温度适宜区间：约 15–30 °C 最佳
      const tf = Math.exp(-Math.pow((temp - 293) / 15, 2));
      this.fertility[i] = BIOME_FERT[b] * (0.35 + 0.65 * tf) * (0.7 + 0.3 * tr.moist[i]);
    }
  }

  /* ───── 聚落 ───── */

  private techYield(tech: number): number {
    return Math.pow(2, 0.95 * tech);
  }

  private growSettlements(): void {
    for (const s of this.settlements) {
      if (s.pop <= 0) continue;
      const pol = this.polities[s.polity];
      let k = 0;
      for (const [dx, dy] of DISC2) {
        const x = s.x + dx;
        const y = s.y + dy;
        if (x < 0 || y < 0 || x >= SB_W || y >= SB_H) continue;
        const i = y * SB_W + x;
        const o = this.owner[i];
        if (o !== -1 && o !== s.polity) continue;
        const dry = this.drought[i] > 0 ? 0.25 : 1;
        k += this.fertility[i] * (1 - this.degrade[i]) * dry;
      }
      if (s.coast) k += 0.6;
      // 交通与贸易让城市可以超出本地土地的承载
      const trade = 1 + Math.min(1.5, pol.tech * 0.18);
      // Physical carrying capacity has a soft ceiling: a single settlement should not
      // grow into hundreds of billions of people even when tech and trade both run high.
      const isCapital = pol.capital === s.id;
      const capCeil = (260 + 330 * pol.tech) * (isCapital ? 1.9 : 0.82);
      s.cap = Math.min(Math.max(0.05, k * this.techYield(pol.tech) * trade * 0.9), capCeil);
      if (s.ruined) s.cap *= 0.2;
      const r = 0.045 + Math.min(0.03, pol.tech * 0.004);
      s.pop += r * s.pop * (1 - s.pop / s.cap);
      s.famine = s.pop > s.cap * 1.05;
      if (s.famine) s.pop -= 0.08 * (s.pop - s.cap);
      if (s.plague > 0) {
        const medicine = Math.min(0.9, Math.max(0, (pol.tech - 4.5) / 3));
        s.pop *= 1 - 0.07 * (1 - medicine);
        s.plague--;
        if (s.plague === 0) s.plague = -45;
      } else if (s.plague < 0) s.plague++;
      if (s.pop < 0.05) s.pop = 0;
    }
    for (let i = 0; i < N; i++) if (this.drought[i] > 0) this.drought[i]--;
  }

  private colonize(): void {
    if (this.settlements.length >= MAX_SETTLEMENTS) return;
    const tr = this.terrain;
    const occupied = new Uint8Array(N);
    for (const s of this.settlements) if (s.pop > 0) {
      for (const [dx, dy] of DISC2) {
        const x = s.x + dx;
        const y = s.y + dy;
        if (x >= 0 && y >= 0 && x < SB_W && y < SB_H) occupied[y * SB_W + x] = 1;
      }
    }
    const list = this.settlements.slice();
    for (const s of list) {
      if (this.settlements.length >= MAX_SETTLEMENTS) break;
      if (s.pop < 1.2 || s.pop < s.cap * 0.62 || this.rng() > 0.22) continue;
      const pol = this.polities[s.polity];
      const reach = 3 + Math.min(5, pol.tech * 0.9) + (pol.tech >= 3 ? 4 : 0);
      let best = -1;
      let bestScore = 0.12;
      for (let k = 0; k < 14; k++) {
        const a = this.rng() * Math.PI * 2;
        const d = 3 + this.rng() * (reach - 3);
        const x = Math.round(s.x + Math.cos(a) * d);
        const y = Math.round(s.y + Math.sin(a) * d);
        if (x < 0 || y < 0 || x >= SB_W || y >= SB_H) continue;
        const i = y * SB_W + x;
        if (!tr.land[i] || occupied[i]) continue;
        const o = this.owner[i];
        if (o !== -1 && o !== s.polity) continue;
        if (pol.tech < 3 && !this.landPath(s.x, s.y, x, y)) continue;
        const score = this.fertility[i] * (1 - this.degrade[i]) + tr.coast[i] * 0.12 - d * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best < 0) continue;
      const moved = s.pop * 0.22;
      s.pop -= moved;
      const n = this.found(best, s.polity, moved, s);
      for (const [dx, dy] of DISC2) {
        const x = n.x + dx;
        const y = n.y + dy;
        if (x >= 0 && y >= 0 && x < SB_W && y < SB_H) occupied[y * SB_W + x] = 1;
      }
      if (!this.landPath(s.x, s.y, n.x, n.y)) this.emit('found', `${pol.name}的船队越过海洋，建立了${n.name}。`, best, s.polity);
    }
  }

  /** 两点之间是否有陆路（直线采样）。 */
  private landPath(x0: number, y0: number, x1: number, y1: number): boolean {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5);
    for (let k = 1; k < steps; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / steps);
      const y = Math.round(y0 + ((y1 - y0) * k) / steps);
      if (!this.terrain.land[y * SB_W + x]) return false;
    }
    return true;
  }

  /** 势力范围：每个陆地格子归影响力最大的聚落所属政体。 */
  private updateOwnership(): void {
    const infl = new Float32Array(N);
    const own = new Int16Array(N).fill(-1);
    for (const s of this.settlements) {
      if (s.pop <= 0) continue;
      const w = Math.sqrt(s.pop);
      const tier = s.pop > 80 ? 4 : s.pop > 20 ? 3 : 2;
      for (const [dx, dy, d] of DISC4) {
        if (d > tier + 0.01) continue;
        const x = s.x + dx;
        const y = s.y + dy;
        if (x < 0 || y < 0 || x >= SB_W || y >= SB_H) continue;
        const i = y * SB_W + x;
        if (!this.terrain.land[i]) continue;
        const v = w / (1 + d * d);
        if (v > infl[i]) {
          infl[i] = v;
          own[i] = s.polity;
        }
      }
    }
    this.owner = own;
    for (const p of this.polities) p.cells = 0;
    for (let i = 0; i < N; i++) if (own[i] >= 0) this.polities[own[i]].cells++;
  }

  /* ───── 贸易 ───── */

  private atWar(a: number, b: number): boolean {
    return this.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
  }

  private allied(a: number, b: number): boolean {
    return a === b || this.allies.has(a < b ? `${a}-${b}` : `${b}-${a}`);
  }

  private buildRoutes(): void {
    const live = this.settlements.filter((s) => s.pop >= 1.5);
    const routes: Route[] = [];
    const seen = new Set<string>();
    const o = this.params.openness;
    for (const s of live) {
      const ps = this.polities[s.polity];
      const D = 5 + ps.tech * 2.6 + o * 4;
      const near: [number, Settlement][] = [];
      for (const q of live) {
        if (q === s) continue;
        const d = Math.hypot(q.x - s.x, q.y - s.y);
        if (d > D) continue;
        if (q.polity !== s.polity) {
          if (this.atWar(s.polity, q.polity)) continue;
          // 不同政体之间的贸易受开放程度限制
          if (!this.allied(s.polity, q.polity) && o < 0.15) continue;
        }
        near.push([d, q]);
      }
      near.sort((a, b) => a[0] - b[0]);
      const k = 1 + Math.round(o * 2);
      for (const [d, q] of near.slice(0, k)) {
        const key = s.id < q.id ? `${s.id}-${q.id}` : `${q.id}-${s.id}`;
        if (seen.has(key)) continue;
        const land = this.landPath(s.x, s.y, q.x, q.y);
        const pq = this.polities[q.polity];
        if (!land && Math.min(ps.tech, pq.tech) < 3) continue;
        seen.add(key);
        const cross = s.polity === q.polity ? 1 : 0.4 + o;
        routes.push({ a: s.id, b: q.id, vol: Math.sqrt(s.pop * q.pop) / (1 + d) * cross, sea: !land });
      }
    }
    routes.sort((a, b) => b.vol - a.vol);
    this.routes = routes.slice(0, 420);
  }

  /* ───── 政体：生产力与生产关系 ───── */

  private updatePolities(): void {
    const pops = new Float64Array(this.polities.length);
    for (const s of this.settlements) pops[s.polity] += s.pop;
    const links = new Float64Array(this.polities.length);
    const diffuse = new Float64Array(this.polities.length);
    for (const r of this.routes) {
      const a = this.settlements[r.a].polity;
      const b = this.settlements[r.b].polity;
      links[a] += 1;
      links[b] += 1;
      if (a !== b) {
        const pa = this.polities[a];
        const pb = this.polities[b];
        const w = this.params.openness * 0.004 * Math.min(1, r.vol);
        diffuse[a] += Math.max(0, pb.tech - pa.tech) * w;
        diffuse[b] += Math.max(0, pa.tech - pb.tech) * w;
      }
    }
    let maxTech = 0;
    // 遍历快照：本步分裂出的新政体从下一步开始计算
    for (const p of this.polities.slice(0, pops.length)) {
      if (!p.alive) continue;
      p.pop = pops[p.id];
      if (p.pop <= 0.01) {
        p.alive = false;
        continue;
      }
      const gap = (p.P - p.R) / p.R;
      const fit = gap > 0 ? Math.max(0.1, 1 - gap * 1.4) : 1;
      const conn = 1 + this.params.openness * 0.7 * Math.min(1, links[p.id] / 8);
      const scale = 0.55 + 0.25 * Math.log10(1 + p.pop);
      const war = this.wars.some((w) => w.a === p.id || w.b === p.id) ? 0.85 : 1;
      p.tech += TECH_RATE * (1 + p.stage * 0.42) * (1 + Math.max(0, p.tech - 3.5) * 0.8) * fit * conn * scale * war * (0.85 + 0.3 * this.rng()) + diffuse[p.id];
      p.P = Math.pow(10, p.tech * 0.5);
      p.R = Math.min(CAPS[p.stage], p.R * (1 + 0.003 + this.params.reform * 0.04 * Math.max(gap, 0)));
      p.C = Math.max(0, (p.P - p.R) / p.R);
      if (p.C > SB_LEAP && p.stage < 4) this.revolution(p);
      maxTech = Math.max(maxTech, p.tech);
    }
    const era = Math.min(ERAS.length - 1, Math.floor(maxTech));
    if (era > this.era) {
      this.era = era;
      const lead = this.leader();
      const cap = lead ? this.settlements[lead.capital] : null;
      this.emit('era', `${lead?.name ?? ''}率先进入${ERAS[era]}时代。`, cap ? cap.y * SB_W + cap.x : undefined, lead?.id);
      if (era === 4 && this.industrialT === null) this.industrialT = this.t;
      if (era === 8 && this.aiT === null) this.aiT = this.t;
    }
  }

  private revolution(p: Polity): void {
    const cap = this.settlements[p.capital];
    const cell = cap ? cap.y * SB_W + cap.x : undefined;
    // 跨越式发展：与先进得多的政体密切交往时，可能越过一个阶段
    let jump = 1;
    if (p.stage <= 2) {
      const advanced = this.polities.some((q) => q.alive && q !== p && q.stage >= p.stage + 2 && (this.allied(p.id, q.id) || this.trades(p.id, q.id)));
      if (advanced && this.rng() < 0.3 * this.params.openness) jump = 2;
    }
    const target = Math.min(4, p.stage + jump);
    p.stage = target;
    p.R = p.P * 1.1;
    p.C = 0;
    if (jump === 2) this.emit('leap2', `${p.name}在与先进文明的交往中，跨越了一个发展阶段，进入${SB_STAGES[target]}。`, cell, p.id);
    else this.emit('leap', `${p.name}的矛盾越过阈值，旧的生产关系被打破：进入${SB_STAGES[target]}。`, cell, p.id);
    if (cap) this.note(cap, `社会变革，${p.name}进入${SB_STAGES[target]}。`);
    // 合作程度低时，变革可能演变成分裂
    const coop = this.coopOf(p);
    if (this.rng() < 0.45 * Math.pow(1 - coop, 1.5)) this.split(p);
  }

  private trades(a: number, b: number): boolean {
    for (const r of this.routes) {
      const pa = this.settlements[r.a].polity;
      const pb = this.settlements[r.b].polity;
      if ((pa === a && pb === b) || (pa === b && pb === a)) return true;
    }
    return false;
  }

  private coopOf(p: Polity): number {
    return Math.max(0, Math.min(1, this.params.coop + p.trait));
  }

  private split(p: Polity): void {
    const own = this.settlements.filter((s) => s.polity === p.id && s.pop > 0);
    const cap = this.settlements[p.capital];
    if (own.length < 4 || !cap) return;
    const ang = this.rng() * Math.PI * 2;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const breakaway = own.filter((s) => (s.x - cap.x) * nx + (s.y - cap.y) * ny > 2);
    if (breakaway.length < 2) return;
    const id = this.polities.length;
    const newCap = breakaway.reduce((a, b) => (b.pop > a.pop ? b : a));
    const name = this.uniqueName(P1, ['', '']).replace(/\d+$/, '');
    this.polities.push({
      id, name, hue: (p.hue + 0.37 + this.rng() * 0.2) % 1, alive: true, capital: newCap.id, stage: p.stage, tech: p.tech * 0.98,
      P: p.P, R: p.R, C: 0, pop: 0, trait: p.trait + (this.rng() - 0.5) * 0.2, founded: this.t, cells: 0,
    });
    for (const s of breakaway) {
      s.polity = id;
      this.note(s, `脱离${p.name}，归属新的政体${name}。`);
    }
    this.emit('split', `${p.name}在变革中分裂，${newCap.name}一带独立为${name}。`, newCap.y * SB_W + newCap.x, id);
    this.startWar(p.id, id);
  }

  /* ───── 外交与战争 ───── */

  private borders(): Map<string, number[]> {
    const m = new Map<string, number[]>();
    const own = this.owner;
    for (let y = 0; y < SB_H; y++) {
      for (let x = 0; x < SB_W - 1; x++) {
        const i = y * SB_W + x;
        const a = own[i];
        if (a < 0) continue;
        const r = own[i + 1];
        const d = y < SB_H - 1 ? own[i + SB_W] : -1;
        for (const [b, j] of [[r, i + 1], [d, i + SB_W]] as const) {
          if (b < 0 || b === a) continue;
          const key = a < b ? `${a}-${b}` : `${b}-${a}`;
          if (!m.has(key)) m.set(key, []);
          m.get(key)!.push(i, j);
        }
      }
    }
    return m;
  }

  private diplomacy(): void {
    if (this.t % 2) return;
    const borders = this.borders();
    const pressure = (p: Polity) => {
      let over = 0;
      let n = 0;
      for (const s of this.settlements) if (s.polity === p.id && s.pop > 0) {
        over += s.pop / Math.max(0.05, s.cap);
        n++;
      }
      return n ? over / n : 0;
    };
    for (const [key, cells] of borders) {
      const [a, b] = key.split('-').map(Number);
      const pa = this.polities[a];
      const pb = this.polities[b];
      if (!pa.alive || !pb.alive || this.atWar(a, b)) continue;
      const coop = (this.coopOf(pa) + this.coopOf(pb)) / 2;
      if (this.allied(a, b)) continue;
      const press = Math.max(pressure(pa), pressure(pb));
      const pWar = 0.011 * Math.pow(1 - coop, 1.6) * (0.4 + press) * Math.min(1, cells.length / 12);
      if (this.rng() < pWar) {
        this.startWar(a, b, cells);
        continue;
      }
      // 长期和平与贸易的邻邦可能结盟
      const since = this.peaceSince.get(key) ?? this.t;
      this.peaceSince.set(key, since);
      if (this.t - since > 30 && this.trades(a, b) && this.rng() < 0.02 * coop * coop) {
        this.allies.add(key);
        const cap = this.settlements[pa.capital];
        this.emit('ally', `${pa.name}与${pb.name}结成同盟，互通有无。`, cap ? cap.y * SB_W + cap.x : undefined, a);
      }
    }
    this.checkUnion();
  }

  private checkUnion(): void {
    if (this.union || this.era < 6) return;
    const major = this.polities.filter((p) => p.alive && p.pop > this.worldPop() * 0.05);
    if (major.length < 2) return;
    for (let i = 0; i < major.length; i++) for (let j = i + 1; j < major.length; j++) {
      if (!this.allied(major[i].id, major[j].id)) return;
    }
    this.union = true;
    this.emit('union', '主要政体全部结成同盟：一个命运与共的共同体出现了。');
  }

  private startWar(a: number, b: number, front?: number[]): void {
    if (this.atWar(a, b)) return;
    const pa = this.polities[a];
    const pb = this.polities[b];
    const cells = front ?? this.borders().get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? [];
    const nuclear = pa.tech >= 6 && pb.tech >= 6;
    const w: War = { a, b, start: this.t, front: cells.slice(0, 60), nuclear };
    this.wars.push(w);
    this.peaceSince.delete(a < b ? `${a}-${b}` : `${b}-${a}`);
    const cell = cells.length ? cells[Math.floor(cells.length / 2)] : undefined;
    this.emit('war', `${pa.name}与${pb.name}爆发战争。`, cell, a);
    if (nuclear) this.crisis(w);
  }

  /** 拥有核武器的两个政体开战：危机。 */
  private crisis(w: War): void {
    const cell = w.front.length ? w.front[Math.floor(w.front.length / 2)] : 0;
    this.emit('crisis', `${this.polities[w.a].name}与${this.polities[w.b].name}都拥有核武器，世界站在毁灭边缘。`, cell, w.a);
    const k = Math.min(1, this.crisisCount) as 0 | 1;
    this.crisisCount++;
    const c: Crisis = { k, a: w.a, b: w.b, cell };
    if (this.interactive && k === this.crisisCount - 1 && this.crisisCount <= 2) {
      this.pendingCrisis = c;
      return;
    }
    this.pendingCrisis = c;
    this.applyCrisis(this.autoChoice());
  }

  private autoChoice(): 'wait' | 'launch' {
    const c = this.pendingCrisis;
    if (!c) return 'wait';
    const coop = (this.coopOf(this.polities[c.a]) + this.coopOf(this.polities[c.b])) / 2;
    return this.rng() < 0.3 * Math.pow(1 - coop, 1.4) ? 'launch' : 'wait';
  }

  private applyCrisis(choice: 'wait' | 'launch'): void {
    const c = this.pendingCrisis;
    if (!c) return;
    this.pendingCrisis = null;
    if (choice === 'launch') {
      this.nuclearWar(c.a, c.b);
      return;
    }
    // 克制：战争在边缘停下
    this.wars = this.wars.filter((w) => !((w.a === c.a && w.b === c.b) || (w.a === c.b && w.b === c.a)));
    this.emit('peace', `危机在最后一刻化解：${this.polities[c.a].name}与${this.polities[c.b].name}停火。`, c.cell, c.a);
  }

  private nuclearWar(a: number, b: number): void {
    const targets = this.settlements.filter((s) => (s.polity === a || s.polity === b || this.rng() < 0.25) && s.pop > 3);
    for (const s of targets) {
      s.ruined = true;
      s.pop *= 0.15;
      this.note(s, '核火球吞没了这座城市。');
    }
    this.nuclearWinter = 1;
    this.emit('nuke', `${this.polities[a].name}与${this.polities[b].name}之间的核战争爆发。`, targets[0] ? targets[0].y * SB_W + targets[0].x : undefined, a);
    this.updateClimate();
    this.end('自我毁灭', '掌握毁灭性力量之后，冲突失控了。');
  }

  private fight(): void {
    const ended: War[] = [];
    for (const w of this.wars) {
      const pa = this.polities[w.a];
      const pb = this.polities[w.b];
      if (!pa.alive || !pb.alive) {
        ended.push(w);
        continue;
      }
      const power = (p: Polity) => Math.pow(Math.max(0.1, p.pop), 0.6) * Math.pow(1 + p.tech, 1.3);
      const fa = power(pa);
      const fb = power(pb);
      const winA = fa / (fa + fb);
      // 前线附近的聚落承受伤亡
      const frontSet = new Set(w.front);
      for (const s of this.settlements) {
        if (s.polity !== w.a && s.polity !== w.b) continue;
        let near = false;
        for (const [dx, dy] of DISC2) if (frontSet.has((s.y + dy) * SB_W + s.x + dx)) { near = true; break; }
        if (!near) continue;
        const loserSide = s.polity === w.a ? 1 - winA : winA;
        s.pop *= 1 - 0.012 * (0.5 + loserSide);
        // 攻占：弱势一方的前线聚落可能易主
        if (this.rng() < 0.035 * loserSide && s.id !== this.polities[s.polity].capital) {
          const to = s.polity === w.a ? w.b : w.a;
          const from = this.polities[s.polity];
          s.polity = to;
          this.note(s, `被${this.polities[to].name}攻占，原属${from.name}。`);
          if (s.pop > 15) this.emit('conquest', `${this.polities[to].name}攻占了${s.name}。`, s.y * SB_W + s.x, to);
        }
      }
      // 核大国之间的常规战争也有升级的可能
      if (w.nuclear && this.rng() < 0.0025 * Math.pow(1 - (this.coopOf(pa) + this.coopOf(pb)) / 2, 1.2)) {
        this.nuclearWar(w.a, w.b);
        return;
      }
      const coop = (this.coopOf(pa) + this.coopOf(pb)) / 2;
      const dur = this.t - w.start;
      if (this.rng() < 0.03 + coop * 0.05 + (dur > 40 ? 0.05 : 0)) {
        ended.push(w);
        const cell = w.front.length ? w.front[0] : undefined;
        this.emit('peace', `${pa.name}与${pb.name}签订和约，战争结束。`, cell, w.a);
      }
    }
    if (ended.length) this.wars = this.wars.filter((w) => !ended.includes(w));
    // 被吞并：政体失去全部聚落
    for (const p of this.polities) {
      if (!p.alive) continue;
      const own = this.settlements.filter((s) => s.polity === p.id && s.pop > 0);
      if (!own.length) {
        p.alive = false;
        continue;
      }
      if (!own.some((s) => s.id === p.capital)) {
        p.capital = own.reduce((a, b) => (b.pop > a.pop ? b : a)).id;
      }
    }
  }

  /* ───── 瘟疫 ───── */

  private spreadPlague(): void {
    const o = this.params.openness;
    for (const s of this.settlements) {
      if (s.plague !== 0 || s.pop < 8) continue;
      const pol = this.polities[s.polity];
      if (pol.tech > 7) continue;
      if (this.rng() < 0.00022 * Math.log10(s.pop)) this.infect(s, true);
    }
    const sick = this.settlements.filter((s) => s.plague > 0);
    if (!sick.length) return;
    const sickSet = new Set(sick.map((s) => s.id));
    for (const r of this.routes) {
      const a = this.settlements[r.a];
      const b = this.settlements[r.b];
      if (sickSet.has(a.id) && b.plague === 0 && this.rng() < 0.12 * (0.3 + o)) this.infect(b, false, a);
      else if (sickSet.has(b.id) && a.plague === 0 && this.rng() < 0.12 * (0.3 + o)) this.infect(a, false, b);
    }
  }

  private infect(s: Settlement, origin: boolean, from?: Settlement): void {
    s.plague = 9;
    if (origin) {
      this.emit('plague', `${s.name}暴发瘟疫。`, s.y * SB_W + s.x, s.polity);
      this.note(s, '瘟疫暴发。');
    } else this.note(s, `瘟疫沿商路从${from?.name ?? '远方'}传入。`);
  }

  /* ───── 人与自然 ───── */

  private ecology(): void {
    const eco = this.params.eco;
    // 世界生产力按人口加权（与宏观模型的单一文明对应）
    let Pw = 0;
    let pop = 0;
    let maxTech = 0;
    for (const p of this.polities) if (p.alive) {
      Pw += p.P * p.pop;
      pop += p.pop;
      maxTech = Math.max(maxTech, p.tech);
    }
    Pw /= Math.max(1e-6, pop);
    const industrial = maxTech >= 4;
    this.E = Math.max(0, this.E + 0.001 * this.shock * (1 - eco) * Math.log10(1 + Pw) * (industrial ? E_IND : 0.6) - eco * E_REC);
    this.dT = this.E * 5.5;
    // 工业城市周边的土地退化；生态约束高时缓慢修复
    if (this.t % 3 === 0) {
      for (const s of this.settlements) {
        if (s.pop < 10) continue;
        const pol = this.polities[s.polity];
        const press = (pol.tech >= 4 ? 0.006 : 0.0012) * (1 - eco) * Math.log10(s.pop);
        for (const [dx, dy] of DISC2) {
          const x = s.x + dx;
          const y = s.y + dy;
          if (x < 0 || y < 0 || x >= SB_W || y >= SB_H) continue;
          const i = y * SB_W + x;
          this.degrade[i] = Math.min(0.9, this.degrade[i] + press);
        }
      }
      if (eco > 0.3) for (let i = 0; i < N; i++) this.degrade[i] = Math.max(0, this.degrade[i] - (eco - 0.3) * 0.004);
    }
    if (this.nuclearWinter > 0) this.nuclearWinter = Math.max(0, this.nuclearWinter - 0.002);
  }

  private checkFates(): void {
    if (this.done) return;
    if (this.E >= 1) {
      for (const s of this.settlements) s.famine = true;
      this.emit('collapse', '人与自然的张力越过阈值：土地荒芜，城市陷入饥荒。');
      this.end('生态崩溃', '人与自然的张力越过阈值，生态系统无法再支撑这个文明。');
      return;
    }
    // 工业时代之后的失控风险（事故、误判等），与宏观模型同形
    const lead = this.leader();
    if (lead && lead.tech >= 4.5) {
      const coop = this.params.coop;
      const risk = 0.001 * Math.pow(1 - coop, 1.2) * Math.min(1, Math.log10(lead.P) / 2.5) * (this.union ? 0.2 : 1);
      if (this.rng() < risk) {
        const rivals = this.polities.filter((p) => p.alive && p.tech >= 5.5).sort((a, b) => b.P - a.P);
        if (rivals.length >= 2) this.nuclearWar(rivals[0].id, rivals[1].id);
      }
    }
  }

  private end(fate: SbFate, text: string): void {
    if (this.fate) return;
    this.fate = fate;
    this.tEnd = this.t;
    this.wars = [];
    this.emit('fate', text);
  }

  /* ───── 干预 ───── */

  private applyAction(a: SbAction): SbEvent | null {
    const x = a.cell % SB_W;
    const y = Math.floor(a.cell / SB_W);
    const s = this.settlementAt(a.cell, 3);
    switch (a.type) {
      case 'tech': {
        if (!s) return null;
        const p = this.polities[s.polity];
        p.tech += 0.35;
        this.note(s, '观测者向这里传授了一项新技术。');
        return this.emit('act', `观测者向${p.name}传授技术，生产力跃升。`, a.cell, p.id);
      }
      case 'plague': {
        if (!s) return null;
        s.plague = 0;
        this.infect(s, true);
        return this.emit('act', `观测者在${s.name}投下了一场瘟疫。`, a.cell, s.polity);
      }
      case 'drought': {
        for (const [dx, dy] of DISC4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < SB_W && yy < SB_H) this.drought[yy * SB_W + xx] = 40;
        }
        return this.emit('act', '观测者降下一场大旱，土地歉收。', a.cell);
      }
      case 'restore': {
        for (const [dx, dy] of DISC4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < SB_W && yy < SB_H) this.degrade[yy * SB_W + xx] = 0;
        }
        this.E = Math.max(0, this.E - 0.04);
        return this.emit('act', '观测者修复了一片退化的土地。', a.cell);
      }
      case 'peace': {
        const o = this.owner[a.cell];
        const w = this.wars.find((w) => w.a === o || w.b === o) ?? (s ? this.wars.find((w) => w.a === s.polity || w.b === s.polity) : undefined);
        if (!w) return null;
        this.wars = this.wars.filter((x) => x !== w);
        const key = w.a < w.b ? `${w.a}-${w.b}` : `${w.b}-${w.a}`;
        this.peaceSince.set(key, this.t);
        return this.emit('act', `观测者调停，${this.polities[w.a].name}与${this.polities[w.b].name}停战。`, a.cell, w.a);
      }
    }
  }

  /* ───── 统计 ───── */

  private record(): void {
    const s = this.series;
    let pop = 0;
    let Pw = 0;
    let Rw = 0;
    let Cw = 0;
    const share = [0, 0, 0, 0, 0];
    let alive = 0;
    for (const p of this.polities) {
      if (!p.alive) continue;
      alive++;
      pop += p.pop;
      Pw += p.P * p.pop;
      Rw += p.R * p.pop;
      Cw += p.C * p.pop;
      share[p.stage] += p.pop;
    }
    const w = Math.max(1e-6, pop);
    s.pop.push(this.worldPop());
    s.P.push(Pw / w);
    s.R.push(Rw / w);
    s.C.push(Cw / w);
    s.E.push(Math.min(1, this.E));
    s.wars.push(this.wars.length);
    s.polities.push(alive);
    s.share.push(share.map((v) => v / w));
    s.year.push(Math.round(this.year));
  }
}

/** 同参数 n 个微观宇宙的存活率（较慢，用于测试与离线校验）。 */
export function sandboxSurvival(params: SandboxParams, n: number, seed0 = 1, baseTemp = 288): number {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const sb = new Sandbox(seed0 + i * 7919, params, baseTemp, false);
    if (sb.runToEnd() === '延续') ok++;
  }
  return ok / n;
}
