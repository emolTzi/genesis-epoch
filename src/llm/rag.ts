// 检索增强：按字符二元组重合度，从知识卡、理论库与参数注册表中挑出与问题相关的条目。

import { CARDS, type Card } from '../data/cards';
import { THEORY, type TheoryEntry } from '../data/theory';
import { PARAM_INDEX } from '../data/params';
import type { ParamDef } from '../sim/types';

function bigrams(s: string): Set<string> {
  const t = s.replace(/[\s，。、：；“”（）()·,.:;!?！？]/g, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function score(q: Set<string>, text: string): number {
  let n = 0;
  for (const g of bigrams(text)) if (q.has(g)) n++;
  return n;
}

export interface Context {
  cards: Card[];
  theory: TheoryEntry[];
  params: ParamDef[];
}

export function retrieve(question: string, paramIds: string[] = []): Context {
  const q = bigrams(question);
  const cards = CARDS.map((c) => ({ c, s: score(q, c.title + c.body) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.c);
  const theory = THEORY.map((t) => ({ t, s: score(q, t.keywords.join('') + t.mechanism) + t.keywords.filter((k) => question.includes(k)).length * 3 }))
    .filter((x) => x.s > 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)
    .map((x) => x.t);
  const params = paramIds.map((id) => PARAM_INDEX[id]).filter(Boolean);
  return { cards, theory, params };
}

export function contextText(ctx: Context): string {
  const lines: string[] = [];
  for (const p of ctx.params) lines.push(`【参量】${p.name}（${p.symbol}）：参考值 ${p.reference}；作用：${p.role}；置信：${p.confidence}；出处：${p.source}${p.note ? '；说明：' + p.note : ''}`);
  for (const c of ctx.cards) lines.push(`【知识卡】${c.title}：${c.body}（出处：${c.sources}）`);
  for (const t of ctx.theory) lines.push(`【理论库】“${t.quote}”——${t.source}。对应机制：${t.mechanism}`);
  return lines.join('\n');
}
