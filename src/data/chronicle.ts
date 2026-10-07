// 文明编年史（离线生成）：按宇宙编号确定性地组合名字、事件与墓志铭。
// 文本片段由 AI 辅助撰写、经团队审校；在线模式下可改由大模型生成，界面标注来源。

import { pick, streamFor } from '../core/rng';

const FIRST = ['澄', '曜', '朔', '岚', '璇', '衡', '昭', '垣', '溟', '曦', '珩', '霁', '烛', '辰', '渊', '岫', '弦', '翎', '燧', '穹'];
const SECOND = ['明', '川', '宁', '曜', '华', '野', '光', '原', '岳', '澜', '晖', '庭', '星', '林', '泽', '墟', '序', '洲', '火', '阙'];

export function civName(seed: number): string {
  const r = streamFor(seed, 'name');
  const a = pick(r, FIRST);
  let b = pick(r, SECOND);
  if (a === b) b = SECOND[(SECOND.indexOf(b) + 3) % SECOND.length];
  return `${a}${b}`;
}

export interface ChronicleEntry {
  /** 宇宙年龄或纪年描述。 */
  when: string;
  text: string;
  layer: number;
  /** 'fact'：真实历史；'sim'：本次推演；'gen'：生成文本。 */
  kind: 'fact' | 'sim' | 'gen';
}

export function openingEntries(seed: number): ChronicleEntry[] {
  return [
    { when: '0', text: `宇宙编号 ${seed} 诞生。`, layer: 0, kind: 'sim' },
    { when: '约 4 亿年', text: '第一代恒星点亮，开始在核心中锻造碳与氧。', layer: 0, kind: 'fact' },
  ];
}

const EPITAPHS: Record<number, string[]> = {
  0: ['它的宇宙里没有碳，也就没有它。', '常数偏了一点点，原子从未学会结合。', '星系还没来得及聚拢，空间就已撕开。'],
  1: ['它的恒星燃烧得太快，等不到它醒来。', '它离光太远，海洋在冰下沉睡。', '它离光太近，海洋化作蒸汽。', '它太小，留不住天空。'],
  2: ['恒温器停摆，它的天空越来越热。', '二氧化碳被埋尽，它在冰里度过了余生。'],
  3: ['小行星落在了别处，巨兽继续统治大地，它从未出生。', '生命停在了海洋里。'],
  4: ['它学会了点燃太阳，却没学会彼此信任。', '它向自然索取得太多，自然没有再回应。', '那一天，没有人投下反对票。'],
};

export function epitaph(seed: number, layer: number): string {
  const r = streamFor(seed, 'epitaph');
  return pick(r, EPITAPHS[layer] ?? EPITAPHS[4]);
}

/** 第⑤幕编年史：把文明引擎的事件转成纪年文本。 */
export function civEventText(label: string): string {
  if (label.includes('奴隶社会')) return '剩余产品出现，部落之间的劳动分工固定下来，第一批城邦筑起城墙。';
  if (label.includes('封建社会')) return '铁器与灌溉让土地成为财富之源，帝国与王朝在大陆上兴替。';
  if (label.includes('资本主义社会')) return '蒸汽与煤炭推动机器大工业，生产力在百年间超过此前的总和，毁灭性的力量也随之出现。';
  if (label.includes('社会主义社会')) return '生产关系再次调整，以容纳不断增长的生产力。';
  if (label.includes('AI')) return '人工智能成为新质生产力，治理能否跟上，成为新的考题。';
  if (label.includes('1962')) return '一艘潜艇在深海中失去联络，发射核鱼雷需要三个人一致同意。';
  if (label.includes('1983')) return '预警系统报告导弹来袭，值班军官只有几分钟做判断。';
  return label;
}
