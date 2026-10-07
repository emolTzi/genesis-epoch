import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/data/params';
import { extractJson, parseProposal, validate } from '../src/llm/schema';
import { matchOffline, OFFLINE } from '../src/data/offline';
import { sandbox } from '../src/llm/observer';
import { retrieve } from '../src/llm/rag';
import { EDITABLE, PARAM_INDEX } from '../src/data/params';
import type { KeyId } from '../src/sim/types';

const ALL: Set<KeyId> = new Set(['core', 'star', 'elem', 'life', 'civ', 'future']);

describe('校验闸门', () => {
  it('从夹杂文字的回复中提取 JSON', () => {
    const o = extractJson('好的。\n{"intent":"counterfactual","changes":[{"param":"moon","to":false}]}\n以上。');
    expect(parseProposal(o).changes[0]).toEqual({ param: 'moon', to: false });
  });
  it('拒绝注册表中不存在的参数', () => {
    const v = validate({ intent: 'counterfactual', changes: [{ param: 'gravity_magic', to: 2 }] }, defaultParams(), ALL);
    expect(v.applied).toHaveLength(0);
    expect(v.rejected[0].reason).toContain('没有这个参量');
  });
  it('拒绝修改只读事实', () => {
    const v = validate({ intent: 'counterfactual', changes: [{ param: 'hoyle', to: 8 }] }, defaultParams(), ALL);
    expect(v.rejected[0].reason).toContain('只读');
  });
  it('越界数值被夹回范围并标注', () => {
    const v = validate({ intent: 'counterfactual', changes: [{ param: 'orbit_a', to: 50 }] }, defaultParams(), ALL);
    expect(v.applied[0].to).toBe(PARAM_INDEX.orbit_a.max);
    expect(v.applied[0].clamped).toBe(true);
  });
  it('没有对应钥匙时拒绝', () => {
    const v = validate({ intent: 'counterfactual', changes: [{ param: 'alphas_dev', to: 1 }] }, defaultParams(), new Set<KeyId>(['star']));
    expect(v.applied).toHaveLength(0);
    expect(v.rejected[0].reason).toContain('本源之钥');
  });
  it('选项型参数只接受登记过的取值', () => {
    const v = validate({ intent: 'counterfactual', changes: [{ param: 'kpg_site', to: 'mars' }] }, defaultParams(), ALL);
    expect(v.applied).toHaveLength(0);
  });
  it('一次最多改动 4 个参量', () => {
    const changes = EDITABLE.filter((p) => p.kind === 'number').slice(0, 6).map((p) => ({ param: p.id, to: p.value }));
    const v = validate({ intent: 'counterfactual', changes }, defaultParams(), ALL);
    expect(v.applied.length).toBeLessThanOrEqual(4);
  });
});

describe('离线模式', () => {
  it('常见问法都能匹配到意图', () => {
    expect(matchOffline('如果没有月球会怎样？')?.id).toBe('no-moon');
    expect(matchOffline('如果恐龙没有灭绝呢？')?.id).toBe('dino');
    expect(matchOffline('强相互作用变强 1% 会怎样')?.id).toBe('strong-force');
    expect(matchOffline('为什么至今没发现外星人？')?.id).toBe('fermi');
    expect(matchOffline('什么是知识即权限？')?.id).toBe('freedom');
  });
  it('预置的调参提议都能通过校验闸门', () => {
    for (const it of OFFLINE) {
      if (!it.changes) continue;
      const proposal = { intent: 'counterfactual' as const, changes: it.changes.map((c) => ({ param: c.param, to: typeof c.to === 'function' ? c.to('测试 1') : c.to })) };
      const v = validate(proposal, defaultParams(), ALL);
      expect(v.rejected, it.id).toHaveLength(0);
    }
  });
  it('沙盒推演不改动当前宇宙', () => {
    const base = defaultParams();
    const v = validate({ intent: 'counterfactual', changes: [{ param: 'alphas_dev', to: 1 }] }, base, ALL);
    const sb = sandbox(base, v, 2026);
    expect(sb.firstFail).toBe(0);
    expect(base.alphas_dev).toBe(0);
  });
  it('检索能找到相关的知识卡与理论条目', () => {
    const ctx = retrieve('生产力与生产关系的矛盾为什么会导致社会形态更替');
    expect(ctx.theory.map((t) => t.id)).toContain('preface1859');
  });
});
