// 从作品的数据与引擎直接生成文档，保证文档与作品内容一致。
// 运行：npm run docs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PARAMS } from '../src/data/params';
import { CARDS } from '../src/data/cards';
import { THEORY } from '../src/data/theory';
import { SCRIPT, ACTS, ACT_ORDER } from '../src/data/script';
import { OFFLINE } from '../src/data/offline';
import { EPIPHANIES } from '../src/data/epiphanies';
import { CONFIDENCE_NAMES, KEY_NAMES } from '../src/sim/types';
import { survivalLadder } from '../src/sim/causal';
import { runMonteCarlo } from '../src/sim/montecarlo';
import { equilibriumTemp, habitableZone, mainSequenceLifetimeGyr } from '../src/sim/formulas';
import { hazardFraction } from '../src/sim/kpg';
import { simulateCiv, survivalRate } from '../src/sim/civ';
import { analyticSurvival } from '../src/sim/future';
import { fitGrowth } from '../src/sim/lorenz';
import { equilibrium, perturbation } from '../src/sim/thermostat';

const DOCS = join(import.meta.dirname, '..', 'docs');
mkdirSync(DOCS, { recursive: true });
const HEAD = (title: string) => `# ${title}\n\n> 本文件由 \`npm run docs\` 从作品源码自动生成，请勿手工修改；内容变化请改源码后重新生成。\n\n`;
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/* 参数与文献 */
{
  let md = HEAD('参数注册表与文献');
  md += '置信等级：' + Object.values(CONFIDENCE_NAMES).join(' / ') + '。“示意”表示理论模型参数，用于表达机制与方向，不是测量值。\n\n';
  md += '| 编号 | 符号 | 名称 | 层 | 参考值 | 取值范围 | 钥匙 | 置信 | 作用 | 出处 | 说明 |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const p of PARAMS) {
    const range = p.kind === 'fact' ? '只读' : p.kind === 'number' ? `${p.min}–${p.max}${p.unit ? ' ' + p.unit : ''}` : p.kind === 'boolean' ? '有 / 无' : (p.choices ?? []).map((c) => c.value).join(' / ');
    md += `| ${p.id} | ${esc(p.symbol)} | ${p.name} | L${p.layer} | ${esc(p.reference)} | ${esc(range)} | ${KEY_NAMES[p.key]} | ${CONFIDENCE_NAMES[p.confidence]} | ${esc(p.role)} | ${esc(p.source)} | ${esc(p.note ?? '')} |\n`;
  }
  writeFileSync(join(DOCS, '参数与文献.md'), md);
}

/* 旁白文稿 */
{
  let md = HEAD('旁白文稿（观测者·零号）');
  md += '导览模式按以下顺序播放字幕。演示视频的配音由团队成员按本文稿录制，录制时可按语气微调停顿，但不改动事实性内容。括号内为字幕停留时长。\n\n';
  const sec = (title: string, lines: { text: string; ms: number }[]) => {
    md += `## ${title}\n\n`;
    for (const l of lines) md += `- ${l.text}（${(l.ms / 1000).toFixed(1)} 秒）\n`;
    md += '\n';
  };
  sec(`${ACTS.hall.no} · ${ACTS.hall.title}`, [...SCRIPT.prologue, SCRIPT.prologueCalibrated('观测员', '星辰、元素、生命三环'), SCRIPT.prologueStart(2026)]);
  sec(`${ACTS.origin.no} · ${ACTS.origin.title}`, [...SCRIPT.origin, SCRIPT.originSealed, SCRIPT.originStars]);
  sec(`${ACTS.stars.no} · ${ACTS.stars.title}`, [...SCRIPT.stars, SCRIPT.starsDefault, SCRIPT.starsFix]);
  sec(`${ACTS.elements.no} · ${ACTS.elements.title}`, [...SCRIPT.elements, SCRIPT.elementsDefault, SCRIPT.elementsFix, SCRIPT.elementsQuote]);
  sec(`${ACTS.life.no} · ${ACTS.life.title}`, [...SCRIPT.life, SCRIPT.lifeDefault, SCRIPT.lifeSafe, SCRIPT.lifeHazard, SCRIPT.lifeChoose, SCRIPT.lifeExtinction, SCRIPT.lifeLabor]);
  sec(`${ACTS.civ.no} · ${ACTS.civ.title}`, [...SCRIPT.civ, SCRIPT.civDefault, SCRIPT.civCollapse, SCRIPT.civFix, SCRIPT.civ1962, SCRIPT.civ1983, SCRIPT.civAI, SCRIPT.civMoments, SCRIPT.civSurvive]);
  const mc = runMonteCarlo(10000);
  sec(`${ACTS.finale.no} · ${ACTS.finale.title}`, [...SCRIPT.finale, SCRIPT.finaleAlone(Math.round(mc.aloneFraction * 100)), SCRIPT.finaleFermi, SCRIPT.finaleSample, SCRIPT.finaleEarth, SCRIPT.finaleBranch, SCRIPT.finaleParams, SCRIPT.finaleForce, SCRIPT.finaleYou, SCRIPT.finaleThesis, SCRIPT.finaleKey, SCRIPT.finaleGive, SCRIPT.finaleStar]);
  md += '## 顿悟卡（按认知深度三档）\n\n';
  for (const e of Object.values(EPIPHANIES)) {
    md += `### ${KEY_NAMES[e.key]} · ${e.headline}\n\n- 浅：${e.tiers[0]}\n- 中：${e.tiers[1]}\n- 深：${e.tiers[2]}\n- 出处：${e.sources}\n\n`;
  }
  writeFileSync(join(DOCS, '旁白文稿.md'), md);
}

/* 知识卡与理论 */
{
  let md = HEAD('观测档案：知识卡');
  for (const c of CARDS) md += `## ${c.title}\n\n- 层级：${c.layer} · ${c.discipline} · 置信：${CONFIDENCE_NAMES[c.confidence]}${c.dialectic ? ' · 辩证法视角' : ''}\n\n${c.body}\n\n${c.formula ? `公式：\`${c.formula}\`\n\n` : ''}出处：${c.sources}\n\n`;
  writeFileSync(join(DOCS, '知识卡.md'), md);
  let tm = HEAD('理论对照（马克思主义经典标准表述）');
  tm += '译文以《马克思恩格斯选集》（人民出版社，2012 年第三版）为准，卷次页码须在提交前逐条核对。\n\n';
  for (const t of THEORY) tm += `## ${t.id}\n\n> ${t.quote}\n\n- 出处：${t.source}\n- 对应机制：${t.mechanism}\n\n`;
  writeFileSync(join(DOCS, '理论对照.md'), tm);
  let om = HEAD('观测者·零号离线问答');
  om += '离线模式下，以下问法会被规则匹配并给出预置回答；带“调参”的条目会经过校验闸门后在沙盒中推演。预置回答由 AI 辅助撰写，须经团队审校。\n\n';
  for (const it of OFFLINE) om += `## ${it.id}\n\n- 关键词：${it.patterns.map((g) => g.join('+')).join(' / ')}\n- 调参：${it.changes ? it.changes.map((c) => c.param).join('、') : '无'}\n\n${it.answer}\n\n`;
  writeFileSync(join(DOCS, '离线问答.md'), om);
}

/* 关键数值 */
{
  const ladder = survivalLadder(12000);
  const mc = runMonteCarlo(10000);
  const civ = simulateCiv({ eco: 0.65, coop: 0.75, seed: 2026 });
  const hz = habitableZone(1);
  const pert = perturbation({ teq: equilibriumTemp(1, 0.3), outgassing: 1, weathering: 1 }, 20);
  const last = pert.t.length - 1;
  const dWith = pert.withFeedback[last] - pert.withFeedback[0];
  const eq = equilibrium({ teq: equilibriumTemp(1, 0.3), outgassing: 1, weathering: 1 });
  const rows: [string, string, string][] = [
    ['地球平衡温度（a = 1 AU，A = 0.30）', `${equilibriumTemp(1, 0.3).toFixed(1)} K`, 'formulas.equilibriumTemp'],
    ['2.4 AU 处平衡温度', `${equilibriumTemp(2.4, 0.3).toFixed(1)} K`, '第②幕默认推演'],
    ['太阳保守宜居带', `${hz.inner.toFixed(3)}–${hz.outer.toFixed(3)} AU`, 'Kopparapu et al. 2013 的 S_eff 边界'],
    ['太阳主序寿命 / 1.5 M☉ 主序寿命', `${mainSequenceLifetimeGyr(1).toFixed(1)} / ${mainSequenceLifetimeGyr(1.5).toFixed(2)} Gyr`, '质光关系分段近似'],
    ['地球恒温器稳态', `CO₂ ×${eq.co2.toFixed(2)}，${eq.temp.toFixed(1)} K`, 'thermostat.equilibrium'],
    ['恒星变亮 +20 K 时有负反馈的升温', `${dWith.toFixed(1)} K（无反馈 20 K）`, 'thermostat.perturbation'],
    ['K-Pg 沉积区占地表比例（程序标定）', `${(hazardFraction() * 100).toFixed(1)}%`, 'Kaiho & Oshima 2017 约 13%'],
    ['参数空间存活比例 L0 / L1 / L2 / L3 / L4', ladder.fractions.map((f) => f.toExponential(2)).join(' / '), `causal.survivalLadder，${ladder.samples} 次抽样`],
    ['万宇宙中 N < 1 的比例', `${(mc.aloneFraction * 100).toFixed(1)}%`, 'montecarlo.runMonteCarlo，10000 次'],
    ['万宇宙 log₁₀N 中位数', mc.medianLog10N.toFixed(2), '同上'],
    ['默认参数文明存活率（生态 0.5，合作 0.6）', `${Math.round(survivalRate(0.5, 0.6) * 100)}%`, 'civ.survivalRate，500 个平行宇宙'],
    ['合作 0.9 / 合作 0.3 存活率', `${Math.round(survivalRate(0.5, 0.9) * 100)}% / ${Math.round(survivalRate(0.5, 0.3) * 100)}%`, '同上'],
    ['导览文明（宇宙 2026）', `${civ.fate}，质变 ${civ.leaps.length} 次`, 'civ.simulateCiv'],
    ['未来千年存活（四参量 0.5/0.5/0.5/0.3）', `${Math.round(analyticSurvival({ coop: 0.5, carbon: 0.5, ai: 0.5, defense: 0.3 }) * 100)}%`, 'future.analyticSurvival，情景模型'],
    ['未来千年存活（全部 0.9 / 全部 0.1）', `${Math.round(analyticSurvival({ coop: 0.9, carbon: 0.9, ai: 0.9, defense: 0.9 }) * 100)}% / ${Math.round(analyticSurvival({ coop: 0.1, carbon: 0.1, ai: 0.1, defense: 0.1 }) * 100)}%`, '同上'],
    ['Lorenz 差异增长率拟合', fitGrowth(1e-9, 22).toFixed(3), '理论值约 0.906'],
  ];
  let md = HEAD('关键数值（由引擎计算）');
  md += '作品说明、演示视频与答辩中引用的数字均以本表为准。\n\n| 项目 | 数值 | 来源 |\n|---|---|---|\n';
  for (const [a, b, c] of rows) md += `| ${a} | ${b} | ${c} |\n`;
  md += `\n章节：${ACT_ORDER.map((id) => `${ACTS[id].no}「${ACTS[id].title}」`).join(' → ')}\n`;
  writeFileSync(join(DOCS, '关键数值.md'), md);
}

console.log('docs generated in', DOCS);
