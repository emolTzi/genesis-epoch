// 校验闸门：LLM 只能“提议”参数；提议必须通过这里的校验才会交给确定性引擎。
// 规则：参数必须在注册表中、类型正确、落在可行范围内（越界则夹回并说明）、观众持有对应钥匙。

import { PARAM_INDEX } from '../data/params';
import type { KeyId, ParamValue } from '../sim/types';
import { KEY_NAMES } from '../sim/types';

export type Intent = 'counterfactual' | 'explain' | 'generate';

export interface Proposal {
  intent: Intent;
  changes: { param: string; to: unknown }[];
  rationale?: string;
}

export interface Applied {
  param: string;
  name: string;
  from: ParamValue;
  to: ParamValue;
  clamped?: boolean;
}

export interface Validation {
  ok: boolean;
  intent: Intent;
  applied: Applied[];
  rejected: { param: string; reason: string }[];
  rationale?: string;
}

const INTENTS: Intent[] = ['counterfactual', 'explain', 'generate'];
const MAX_CHANGES = 4;

/** 从模型回复中提取第一个 JSON 对象。 */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('回复中没有 JSON 对象');
  return JSON.parse(text.slice(start, end + 1));
}

export function parseProposal(raw: unknown): Proposal {
  if (!raw || typeof raw !== 'object') throw new Error('提议不是对象');
  const o = raw as Record<string, unknown>;
  const intent = INTENTS.includes(o.intent as Intent) ? (o.intent as Intent) : 'explain';
  const changes = Array.isArray(o.changes) ? (o.changes as unknown[]) : [];
  return {
    intent,
    changes: changes
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({ param: String(c.param ?? ''), to: c.to })),
    rationale: typeof o.rationale === 'string' ? o.rationale.slice(0, 300) : undefined,
  };
}

export function validate(p: Proposal, current: Record<string, ParamValue>, keys: Set<KeyId>): Validation {
  const applied: Applied[] = [];
  const rejected: { param: string; reason: string }[] = [];
  if (p.changes.length > MAX_CHANGES) {
    rejected.push({ param: '*', reason: `一次最多改动 ${MAX_CHANGES} 个参量，其余已忽略。` });
  }
  for (const c of p.changes.slice(0, MAX_CHANGES)) {
    const def = PARAM_INDEX[c.param];
    if (!def) {
      rejected.push({ param: c.param, reason: '注册表中没有这个参量。' });
      continue;
    }
    if (def.kind === 'fact') {
      rejected.push({ param: c.param, reason: `“${def.name}”是只读的参考事实，不能修改。` });
      continue;
    }
    if (!keys.has(def.key)) {
      rejected.push({ param: c.param, reason: `改动“${def.name}”需要${KEY_NAMES[def.key]}，你尚未解锁。` });
      continue;
    }
    let to: ParamValue;
    let clamped = false;
    if (def.kind === 'number') {
      const n = typeof c.to === 'number' ? c.to : Number(c.to);
      if (!Number.isFinite(n)) {
        rejected.push({ param: c.param, reason: `“${def.name}”需要一个数值。` });
        continue;
      }
      const lo = def.min ?? -Infinity;
      const hi = def.max ?? Infinity;
      to = Math.min(hi, Math.max(lo, n));
      clamped = to !== n;
    } else if (def.kind === 'boolean') {
      if (typeof c.to === 'boolean') to = c.to;
      else if (c.to === 'true' || c.to === 'false') to = c.to === 'true';
      else {
        rejected.push({ param: c.param, reason: `“${def.name}”只能是 true 或 false。` });
        continue;
      }
    } else {
      const allowed = (def.choices ?? []).map((x) => x.value);
      if (!allowed.includes(String(c.to))) {
        rejected.push({ param: c.param, reason: `“${def.name}”只能取：${allowed.join('、')}。` });
        continue;
      }
      to = String(c.to);
    }
    applied.push({ param: c.param, name: def.name, from: current[c.param], to, clamped });
  }
  return { ok: applied.length > 0 || p.intent === 'explain', intent: p.intent, applied, rejected, rationale: p.rationale };
}
