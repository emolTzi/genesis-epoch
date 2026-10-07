// 观测者·零号：自然语言 → 参数提议 → 校验闸门 → 确定性引擎（沙盒）→ 按认知深度解释。
// 原则：LLM 提议，模型裁决。所有数值都由引擎计算，LLM 只负责翻译与讲解。

import { EDITABLE } from '../data/params';
import { OFFLINE_FALLBACK, matchOffline } from '../data/offline';
import { evaluateStatic, type StaticReport } from '../sim/universe';
import { simulateCiv, survivalRate } from '../sim/civ';
import type { Depth, KeyId, LayerReport, ParamValue } from '../sim/types';
import { DEPTH_NAMES, LAYER_NAMES } from '../sim/types';
import { chat, loadConfig, type ProviderConfig } from './provider';
import { contextText, retrieve } from './rag';
import { extractJson, parseProposal, validate, type Validation } from './schema';

export interface ObserverContext {
  params: Record<string, ParamValue>;
  keys: Set<KeyId>;
  depth: Depth;
  seed: number;
}

export interface SandboxResult {
  lines: string[];
  firstFail: number | null;
  survival?: number;
}

export interface ObserverReply {
  text: string;
  /** online：大模型生成；offline：离线预置；fallback：在线失败后改用离线。 */
  source: 'online' | 'offline' | 'fallback';
  validation?: Validation;
  sandbox?: SandboxResult;
  error?: string;
}

/** 在沙盒里推演改动后的宇宙，不影响当前旅程。 */
export function sandbox(base: Record<string, ParamValue>, v: Validation, seed: number): SandboxResult {
  const p = { ...base };
  for (const a of v.applied) p[a.param] = a.to;
  const rep: StaticReport = evaluateStatic(p);
  const lines: string[] = [];
  const layers: LayerReport[] = [rep.L0, rep.L1, rep.L2, rep.L3];
  for (const L of layers) {
    const s = L.verdict.status;
    if (s === 'fail' || s === 'warn') lines.push(`${LAYER_NAMES[L.layer]}：${s === 'fail' ? '失败' : '警示'}，${L.verdict.title}。${L.verdict.detail}`);
    if (s === 'fail') break;
  }
  const touchesCiv = v.applied.some((a) => ['eco', 'coop', 'choice_1962', 'choice_1983'].includes(a.param));
  let survival: number | undefined;
  if (rep.firstFail === null && touchesCiv) {
    const eco = Number(p.eco);
    const coop = Number(p.coop);
    const run = simulateCiv({ eco, coop, seed, choice1962: p.choice_1962 as 'wait', choice1983: p.choice_1983 as 'wait' }, false);
    survival = survivalRate(eco, coop, 300);
    lines.push(`${LAYER_NAMES[4]}：本宇宙的结局为“${run.fate}”；同参数 300 个平行宇宙的存活率约 ${Math.round(survival * 100)}%。`);
  }
  if (!lines.length) lines.push('沙盒推演：L0–L3 全部通过。');
  return { lines, firstFail: rep.firstFail, survival };
}

function registrySummary(): string {
  return EDITABLE.map((d) => {
    const range = d.kind === 'number' ? `${d.min}–${d.max}${d.unit ? ' ' + d.unit : ''}` : d.kind === 'boolean' ? 'true/false' : (d.choices ?? []).map((c) => c.value).join('/');
    return `${d.id}｜${d.name}｜L${d.layer}｜取值 ${range}｜默认 ${String(d.value)}`;
  }).join('\n');
}

const PLANNER = (depth: Depth) => `你是“创世纪元”实验室的主控 AI“观测者·零号”。你的唯一任务是把观众的问题翻译成对参数注册表的修改提议。
规则：
1. 只输出一个 JSON 对象，格式为 {"intent":"counterfactual|explain|generate","changes":[{"param":"参数编号","to":值}],"rationale":"一句中文说明"}。
2. 只能使用下表中的参数编号，不得编造参数；数值使用表中单位。
3. 观众只是提问、不需要改参数时，intent 用 "explain"，changes 为空数组。
4. 一次最多改动 4 个参数。
5. 你不计算任何结果，结果由确定性引擎给出。
观众的讲解深度：${DEPTH_NAMES[depth]}。
参数注册表（编号｜名称｜层｜取值｜默认）：
${registrySummary()}`;

const EXPLAINER = (depth: Depth) => `你是“创世纪元”实验室的主控 AI“观测者·零号”，语气冷静、准确、简短。
用中文回答观众的问题，${depth === 0 ? '面向小学生，用生活化的比喻，不出现公式' : depth === 1 ? '面向高中生，讲清原因与定性规律' : '面向本科及以上，可以给出公式与文献'}。
硬性要求：
1. 数值与结论只能来自“引擎推演结果”和“资料”，不得自行编造数字或文献。
2. 标注为争议、推测或示意的内容，必须说明其不确定性。
3. 涉及马克思主义理论时，只能引用“资料”中的理论库原文与对应机制，不得改写原意。
4. 不超过 220 字，不使用 Markdown 标题。`;

export class Observer {
  constructor(private getCtx: () => ObserverContext) {}

  config(): ProviderConfig | null {
    return loadConfig();
  }

  /** 在线模式下为新文明取名；离线或失败时返回 null，沿用程序生成的名字。 */
  async nameCivilization(seed: number): Promise<string | null> {
    const cfg = this.config();
    if (!cfg || !cfg.apiKey) return null;
    try {
      const text = await chat(cfg, [
        { role: 'system', content: '你为一部科幻作品中的虚构文明取名。只输出 JSON：{"name":"两个汉字"}。名字要典雅、原创，不得使用任何现有作品、品牌、真实国家或民族的名称。' },
        { role: 'user', content: `宇宙编号 ${seed}` },
      ], { json: true, timeoutMs: 15000 });
      const n = String((extractJson(text) as { name?: unknown }).name ?? '').trim();
      return /^[一-龥]{2,4}$/.test(n) ? n : null;
    } catch {
      return null;
    }
  }

  async ask(question: string): Promise<ObserverReply> {
    const cfg = this.config();
    if (cfg && cfg.apiKey) {
      try {
        return await this.online(question, cfg);
      } catch (e) {
        const off = this.offline(question);
        return { ...off, source: 'fallback', error: (e as Error).message };
      }
    }
    return this.offline(question);
  }

  offline(question: string): ObserverReply {
    const ctx = this.getCtx();
    const it = matchOffline(question);
    if (!it) return { text: OFFLINE_FALLBACK, source: 'offline' };
    if (!it.changes?.length) return { text: it.answer, source: 'offline' };
    const proposal = {
      intent: 'counterfactual' as const,
      changes: it.changes.map((c) => ({ param: c.param, to: typeof c.to === 'function' ? c.to(question) : c.to })),
    };
    const validation = validate(proposal, ctx.params, ctx.keys);
    const sb = validation.applied.length ? sandbox(ctx.params, validation, ctx.seed) : undefined;
    return { text: it.answer, source: 'offline', validation, sandbox: sb };
  }

  private async online(question: string, cfg: ProviderConfig): Promise<ObserverReply> {
    const ctx = this.getCtx();
    const planText = await chat(cfg, [
      { role: 'system', content: PLANNER(ctx.depth) },
      { role: 'user', content: question },
    ], { json: true });
    const proposal = parseProposal(extractJson(planText));
    const validation = validate(proposal, ctx.params, ctx.keys);
    const sb = validation.applied.length ? sandbox(ctx.params, validation, ctx.seed) : undefined;
    const refs = validation.applied.map((a) => a.param);
    const rag = retrieve(question, refs);
    const facts = [
      validation.applied.length ? `已应用的改动：${validation.applied.map((a) => `${a.name} ${String(a.from)} → ${String(a.to)}${a.clamped ? '（越界，已夹回范围）' : ''}`).join('；')}` : '没有参数改动。',
      validation.rejected.length ? `被校验闸门拒绝：${validation.rejected.map((r) => r.reason).join('；')}` : '',
      sb ? `引擎推演结果：\n${sb.lines.join('\n')}` : '',
    ].filter(Boolean).join('\n');
    const answer = await chat(cfg, [
      { role: 'system', content: EXPLAINER(ctx.depth) },
      { role: 'user', content: `观众的问题：${question}\n\n${facts}\n\n资料：\n${contextText(rag) || '（无）'}` },
    ]);
    return { text: answer.trim(), source: 'online', validation, sandbox: sb };
  }
}
