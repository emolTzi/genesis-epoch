// 全局状态：认知等级、钥匙、参数、推演报告、编年史、墓园。

import { Emitter } from '../core/events';
import { load, save } from '../core/storage';
import { defaultParams } from '../data/params';
import { civName, epitaph, openingEntries, type ChronicleEntry } from '../data/chronicle';
import { evaluateStatic, type StaticReport } from '../sim/universe';
import { downstreamOf, survivalLadder, type SurvivalLadder } from '../sim/causal';
import { RANKS, type Depth, type KeyId, type Params, type ParamValue, type Status } from '../sim/types';
import type { ActId } from '../data/script';

export interface GraveRecord {
  name: string;
  seed: number;
  layer: number;
  cause: string;
  epitaph: string;
  date: string;
  preset?: boolean;
}

export interface StarMessage {
  text: string;
  name: string;
  date: string;
}

type Events = {
  keys: Set<KeyId>;
  unlock: KeyId;
  rank: number;
  params: { changed: string[]; ripple: string[][] };
  report: StaticReport;
  layers: Status[];
  chronicle: ChronicleEntry[];
  graves: GraveRecord[];
  universe: number;
};

const GRAVE_KEY = 'ge.graves';
const STAR_KEY = 'ge.stars';

/** 预置的历史实验档案，让第一次进入的观众也能看到墓园。 */
const PRESET_GRAVES: GraveRecord[] = [
  { name: '朔岚', seed: 104, layer: 0, cause: '碳或氧几乎消失', epitaph: '它的宇宙里没有碳，也就没有它。', date: '预置档案', preset: true },
  { name: '璇川', seed: 2207, layer: 1, cause: '冰封', epitaph: '它离光太远，海洋在冰下沉睡。', date: '预置档案', preset: true },
  { name: '昭澜', seed: 3391, layer: 2, cause: '失控温室', epitaph: '恒温器停摆，它的天空越来越热。', date: '预置档案', preset: true },
  { name: '溟野', seed: 4802, layer: 3, cause: '恐龙延续，人类未必登场', epitaph: '小行星落在了别处，巨兽继续统治大地，它从未出生。', date: '预置档案', preset: true },
  { name: '燧庭', seed: 5713, layer: 4, cause: '自我毁灭', epitaph: '那一天，没有人投下反对票。', date: '预置档案', preset: true },
  { name: '霁洲', seed: 6120, layer: 4, cause: '生态崩溃', epitaph: '它向自然索取得太多，自然没有再回应。', date: '预置档案', preset: true },
  { name: '弦墟', seed: 7004, layer: 1, cause: '恒星寿命太短', epitaph: '它的恒星燃烧得太快，等不到它醒来。', date: '预置档案', preset: true },
];

export class State {
  readonly ev = new Emitter<Events>();
  rank = 2;
  keys = new Set<KeyId>(RANKS[2].keys);
  params: Params = defaultParams();
  seed = 2026;
  civName = civName(2026);
  /** 名字来源：程序生成或大模型生成。 */
  civNameSource: 'program' | 'ai' = 'program';
  report: StaticReport = evaluateStatic(this.params);
  /** L0–L5 的状态，供顶栏文明链条显示。 */
  layers: Status[] = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending'];
  chronicle: ChronicleEntry[] = openingEntries(2026);
  graves: GraveRecord[];
  stars: StarMessage[];
  ladder: SurvivalLadder | null = null;
  mode: 'guided' | 'free' = 'free';
  act: ActId = 'hall';
  /** 已经到达过的最远一幕。 */
  reached = 0;

  constructor() {
    const mine = load<GraveRecord[]>(GRAVE_KEY, []);
    this.graves = [...mine, ...PRESET_GRAVES];
    this.stars = load<StarMessage[]>(STAR_KEY, []);
  }

  get depth(): Depth {
    return RANKS[this.rank].depth as Depth;
  }

  computeLadder(): SurvivalLadder {
    this.ladder ??= survivalLadder(12000);
    return this.ladder;
  }

  setRank(r: number): void {
    this.rank = r;
    const keep = [...this.keys].filter((k) => k === 'future');
    this.keys = new Set<KeyId>([...RANKS[r].keys, ...keep]);
    this.ev.emit('rank', r);
    this.ev.emit('keys', this.keys);
  }

  has(k: KeyId): boolean {
    return this.keys.has(k);
  }

  unlock(k: KeyId): void {
    if (this.keys.has(k)) return;
    this.keys.add(k);
    this.ev.emit('unlock', k);
    this.ev.emit('keys', this.keys);
  }

  setParams(changes: Record<string, ParamValue>): void {
    const changed = Object.keys(changes).filter((k) => this.params[k] !== changes[k]);
    if (!changed.length) return;
    Object.assign(this.params, changes);
    const ripple: string[][] = [];
    for (const id of changed) downstreamOf(id).forEach((layer, i) => (ripple[i] = [...(ripple[i] ?? []), ...layer]));
    this.evaluate();
    this.ev.emit('params', { changed, ripple });
  }

  evaluate(): StaticReport {
    this.report = evaluateStatic(this.params);
    this.ev.emit('report', this.report);
    return this.report;
  }

  setLayer(i: number, s: Status): void {
    this.layers[i] = s;
    this.ev.emit('layers', this.layers);
  }

  resetLayers(from = 0): void {
    for (let i = from; i < 6; i++) this.layers[i] = 'pending';
    this.ev.emit('layers', this.layers);
  }

  addChronicle(e: ChronicleEntry): void {
    this.chronicle.push(e);
    this.ev.emit('chronicle', this.chronicle);
  }

  /** 新宇宙：参数回到我们的宇宙，更换编号与文明名字，保留钥匙。 */
  newUniverse(seed: number): void {
    this.seed = seed;
    this.civName = civName(seed);
    this.civNameSource = 'program';
    this.params = defaultParams();
    this.chronicle = openingEntries(seed);
    this.resetLayers();
    this.evaluate();
    this.ev.emit('universe', seed);
    this.ev.emit('chronicle', this.chronicle);
  }

  setCivName(name: string, source: 'program' | 'ai'): void {
    this.civName = name;
    this.civNameSource = source;
    this.ev.emit('universe', this.seed);
  }

  /** 文明熄灭：归入墓园。 */
  archive(layer: number, cause: string): GraveRecord {
    const rec: GraveRecord = {
      name: this.civName,
      seed: this.seed,
      layer,
      cause,
      epitaph: epitaph(this.seed, layer),
      date: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    const mine = this.graves.filter((g) => !g.preset);
    mine.unshift(rec);
    save(GRAVE_KEY, mine.slice(0, 60));
    this.graves = [...mine.slice(0, 60), ...PRESET_GRAVES];
    this.ev.emit('graves', this.graves);
    return rec;
  }

  clearGraves(): void {
    save(GRAVE_KEY, []);
    this.graves = [...PRESET_GRAVES];
    this.ev.emit('graves', this.graves);
  }

  addStar(text: string): void {
    this.stars.unshift({ text: text.slice(0, 120), name: this.civName, date: new Date().toLocaleDateString('zh-CN') });
    save(STAR_KEY, this.stars.slice(0, 200));
  }
}
