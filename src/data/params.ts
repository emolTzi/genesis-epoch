// 参数注册表：作品中每一个可调参量与每一条引用事实都在这里登记，
// 附参考值、可行范围、所需钥匙、置信等级与出处。界面、引擎、LLM 校验与文档生成共用这一份数据。
// 期刊卷页依公开文献整理，提交前需逐条对照原文核实（见 docs/待核实清单.md）。

import type { ParamDef } from '../sim/types';

export const PARAMS: ParamDef[] = [
  // ───────────── L0 物理常数（本源之钥） ─────────────
  {
    id: 'alpha_dev', symbol: 'Δα/α', name: '精细结构常数偏移', layer: 0, discipline: '物理',
    kind: 'number', unit: '%', value: 0, min: -10, max: 10, step: 0.1, key: 'core', confidence: 'gu',
    reference: 'α ≈ 1/137.036（CODATA 2018）',
    role: '与强相互作用一起决定恒星中碳与氧的产量',
    source: 'CODATA 2018；Oberhummer, Csótó & Schlattl 2000, Science 289:88',
    note: '库仑力强度偏移超过约 4%，恒星中的碳或氧几乎全部消失。',
  },
  {
    id: 'alphas_dev', symbol: 'Δα_s/α_s', name: '强相互作用强度偏移', layer: 0, discipline: '物理',
    kind: 'number', unit: '%', value: 0, min: -5, max: 5, step: 0.05, key: 'core', confidence: 'gu',
    reference: 'α_s(M_Z) ≈ 0.118（PDG 2022）',
    role: '决定 ¹²C 霍伊尔态的位置，进而决定碳与氧的产量',
    source: 'PDG 2022；Oberhummer et al. 2000；Barnes 2012, PASA 29:529',
    note: '强相互作用强度偏移超过约 0.5%，恒星中的碳或氧几乎全部消失。',
  },
  {
    id: 'lambda_ratio', symbol: 'Λ/Λ₀', name: '宇宙学常数（相对现值）', layer: 0, discipline: '宇宙学',
    kind: 'number', unit: '倍', value: 1, min: 0.01, max: 1000, log: true, key: 'core', confidence: 'yi',
    reference: 'Ω_Λ ≈ 0.69（Planck 2018）',
    role: '过大时物质来不及聚集成星系',
    source: 'Weinberg 1987, PRL 59:2607；Planck 2018 VI, A&A 641:A6',
    note: '本作品取 100 倍为“星系无法形成”的示意阈值，只表达 Weinberg 论证的量级，不是精确边界。',
  },
  {
    id: 'hoyle', symbol: 'E(0₂⁺)', name: '¹²C 霍伊尔态能级', layer: 0, discipline: '核天体物理',
    kind: 'fact', value: 7.654, unit: 'MeV', key: 'core', confidence: 'shi',
    reference: '≈7.65 MeV',
    role: '三阿尔法过程的共振态，恒星由此合成碳',
    source: 'Hoyle 1954；Oberhummer et al. 2000',
  },

  // ───────────── L1 天体（星辰之钥） ─────────────
  {
    id: 'star_mass', symbol: 'M★', name: '恒星质量', layer: 1, discipline: '天体物理',
    kind: 'number', unit: 'M☉', value: 1, min: 0.1, max: 2, step: 0.01, key: 'star', confidence: 'gu',
    reference: '太阳 1 M☉',
    role: '决定光度、主序寿命与宜居带位置',
    source: '质光关系分段近似（Duric 2004）；主序寿命 t ≈ 10 Gyr·M/L',
    note: '恒星质量低于约 0.5 M☉ 时宜居带行星可能被潮汐锁定并遭受频繁耀斑，影响尚有争议。',
  },
  {
    id: 'orbit_a', symbol: 'a', name: '轨道半长轴', layer: 1, discipline: '天体物理',
    kind: 'number', unit: 'AU', value: 1, min: 0.05, max: 3, step: 0.01, key: 'star', confidence: 'shi',
    reference: '地球 1 AU',
    role: '决定接收的辐照度与平衡温度',
    source: 'IAU 2012 B2；Kopparapu et al. 2013, ApJ 765:131',
  },
  {
    id: 'albedo', symbol: 'A', name: '邦德反照率', layer: 1, discipline: '天体物理',
    kind: 'number', value: 0.3, min: 0, max: 0.9, step: 0.01, key: 'star', confidence: 'shi',
    reference: '地球约 0.30（NASA 地球数据表 0.306）',
    role: '平衡温度公式的输入',
    source: 'NASA Earth Fact Sheet',
  },
  {
    id: 'planet_mass', symbol: 'M_p', name: '行星质量', layer: 1, discipline: '行星科学',
    kind: 'number', unit: 'M⊕', value: 1, min: 0.05, max: 10, log: true, key: 'star', confidence: 'gu',
    reference: '地球 1 M⊕',
    role: '决定逃逸速度、大气保持与板块构造',
    source: '岩质行星 R ∝ M^0.27 近似；Fulton et al. 2017, AJ 154:109（半径谷）',
    note: '0.3 M⊕ 与 8 M⊕ 两个阈值为示意：前者参照火星大气流失，后者参照厚氢氦包层的迷你海王星。',
  },
  {
    id: 'moon', symbol: '☾', name: '大卫星', layer: 1, discipline: '天体力学',
    kind: 'boolean', value: true, key: 'star', confidence: 'zheng',
    reference: '地月质量比约 1/81',
    role: '稳定自转轴倾角，进而稳定气候',
    source: 'Laskar, Joutel & Robutel 1993, Nature 361:615；Lissauer, Barnes & Chambers 2012, Icarus 217:77',
    note: '早期研究认为无月地球倾角会混沌变化；后续研究认为变化幅度与时间尺度可能有限。作品只把它当作“警示”，不判失败。',
  },
  {
    id: 'eta_earth', symbol: 'η⊕', name: '宜居带岩质行星出现率', layer: 1, discipline: '天文',
    kind: 'fact', value: '不确定性较大', key: 'star', confidence: 'gu',
    reference: '基于开普勒数据的估计，区间较宽',
    role: '概率漏斗第三层',
    source: 'Bryson et al. 2021, AJ 161:36',
  },

  // ───────────── L2 行星化学（元素之钥） ─────────────
  {
    id: 'outgassing', symbol: 'V', name: '火山脱气强度', layer: 2, discipline: '地球化学',
    kind: 'number', unit: '×地球', value: 1, min: 0, max: 3, step: 0.05, key: 'elem', confidence: 'yi',
    reference: '地球现值记为 1',
    role: '向大气补充 CO₂，是行星恒温器的输入端',
    source: 'Walker, Hays & Kasting 1981, JGR 86:9776',
  },
  {
    id: 'weathering', symbol: 'W₀', name: '硅酸盐风化效率', layer: 2, discipline: '地球化学',
    kind: 'number', unit: '×地球', value: 1, min: 0, max: 3, step: 0.05, key: 'elem', confidence: 'yi',
    reference: '地球现值记为 1',
    role: '温度越高风化越快、CO₂ 被移除越多，构成负反馈',
    source: 'Walker, Hays & Kasting 1981；Kasting 1993 等',
    note: '风化速率 W = W₀·(pCO₂/p₀)^0.3·exp((T−288 K)/13.7 K)，系数为示意取值。',
  },
  {
    id: 'tectonics', symbol: '—', name: '板块构造', layer: 2, discipline: '地球科学',
    kind: 'fact', value: '由行星质量推定', key: 'elem', confidence: 'zheng',
    reference: '地球为活跃板块构造',
    role: '把碳酸盐带回地幔再由火山释放，闭合碳循环',
    source: 'Valencia et al. 2007；O’Neill & Lenardic 2007（超级地球板块构造之争）',
    note: '作品按 0.5–5 M⊕ 视为可能有板块构造，其外为停滞盖层，边界有争议。',
  },

  // ───────────── L3 生命（生命之钥） ─────────────
  {
    id: 'kpg_site', symbol: '⊕', name: 'K-Pg 撞击点', layer: 3, discipline: '古生物学',
    kind: 'choice', value: 'hazard', key: 'life', confidence: 'gu',
    choices: [
      { value: 'hazard', label: '富含碳氢化合物与硫的沉积区（真实历史）' },
      { value: 'safe', label: '其他地区' },
    ],
    reference: '约 6600 万年前，墨西哥希克苏鲁伯',
    role: '撞在约 13% 的特定地表才会引发大灭绝，为哺乳动物与人类让出生态位',
    source: 'Kaiho & Oshima 2017, Sci. Rep. 7:14855；Schulte et al. 2010, Science 327:1214',
  },
  {
    id: 'f_life', symbol: 'f_l', name: '生命起源概率', layer: 3, discipline: '生物化学',
    kind: 'fact', value: '未知', key: 'life', confidence: 'tui',
    reference: '跨越数十个数量级的未知量',
    role: '以宽对数分布进入蒙特卡洛',
    source: 'Sandberg, Drexler & Ord 2018, arXiv:1806.02404',
  },
  {
    id: 'bottleneck', symbol: '—', name: '人类祖先人口瓶颈', layer: 3, discipline: '人类遗传学',
    kind: 'fact', value: '约 93 万–81 万年前', key: 'life', confidence: 'zheng',
    reference: '繁殖个体约 1280 名，持续约 11.7 万年',
    role: '编年史事件',
    source: 'Hu et al. 2023, Science 381:979',
    note: '该推断在学界有争议。',
  },
  {
    id: 'labor_origin', symbol: '—', name: '劳动与人类起源', layer: 3, discipline: '马克思主义理论 / 古人类学',
    kind: 'fact', value: '经典论述与现代证据并列呈现', key: 'life', confidence: 'yi',
    reference: '恩格斯《劳动在从猿到人转变过程中的作用》（1876）',
    role: '第④幕到第⑤幕的过渡',
    source: '《马克思恩格斯选集》第三版第 3 卷；现代证据：石器技术与脑容量的协同演化研究',
    note: '经典论述与现代古人类学证据分开标注，不混为一谈。',
  },

  // ───────────── L4 文明（文明之钥） ─────────────
  {
    id: 'eco', symbol: 'ε', name: '生态约束', layer: 4, discipline: '马克思主义理论 / 生态学',
    kind: 'number', value: 0.5, min: 0, max: 1, step: 0.05, key: 'civ', confidence: 'yi',
    reference: '无量纲示意参数',
    role: '削减人与自然的张力 E',
    source: '恩格斯《自然辩证法》；人与自然生命共同体',
  },
  {
    id: 'coop', symbol: 'κ', name: '合作程度', layer: 4, discipline: '博弈论 / 国际关系',
    kind: 'number', value: 0.6, min: 0, max: 1, step: 0.05, key: 'civ', confidence: 'yi',
    reference: '无量纲示意参数',
    role: '工业文明之后降低毁灭性技术的失控风险',
    source: '人类命运共同体；Axelrod 1984（重复博弈中的合作）',
  },
  {
    id: 'choice_1962', symbol: '1962', name: '1962 年 B-59 潜艇的选择', layer: 4, discipline: '历史',
    kind: 'choice', value: 'wait', key: 'civ', confidence: 'shi',
    choices: [
      { value: 'wait', label: '拒绝发射（阿尔希波夫的选择）' },
      { value: 'launch', label: '发射核鱼雷' },
    ],
    reference: '古巴导弹危机期间，苏联潜艇 B-59 上发射核鱼雷需三名军官一致同意，阿尔希波夫投了反对票',
    role: '千钧一发的历史时刻：个人的选择改变文明走向',
    source: '美国国家安全档案馆解密文件（2002）等公开史料',
  },
  {
    id: 'choice_1983', symbol: '1983', name: '1983 年预警系统的选择', layer: 4, discipline: '历史',
    kind: 'choice', value: 'wait', key: 'civ', confidence: 'shi',
    choices: [
      { value: 'wait', label: '判断为误报，不上报（彼得罗夫的选择）' },
      { value: 'launch', label: '按警报上报，触发报复' },
    ],
    reference: '1983 年 9 月 26 日，苏联预警卫星误报美国导弹来袭，值班军官彼得罗夫判断为系统故障',
    role: '千钧一发的历史时刻：个人的选择改变文明走向',
    source: '公开史料与当事人回忆',
  },
  {
    id: 'pr_model', symbol: 'P R C E', name: '生产力、生产关系、矛盾、人与自然张力', layer: 4, discipline: '马克思主义理论',
    kind: 'fact', value: '无量纲', key: 'civ', confidence: 'yi',
    reference: '以历史唯物主义为框架的示意性动力学模型',
    role: '第⑤幕文明引擎',
    source: '马克思《〈政治经济学批判〉序言》（1859）；《马克思主义基本原理》（马工程教材）',
    note: '用于可视化理论机制，并非历史预测。',
  },
  {
    id: 'civ_lifetime', symbol: 'L', name: '技术文明寿命', layer: 4, discipline: '跨学科',
    kind: 'fact', value: '未知', key: 'civ', confidence: 'tui',
    reference: '德雷克方程最后一项',
    role: '万宇宙蒙特卡洛的输入',
    source: 'Drake 1961；Sandberg et al. 2018',
  },

  // ───────────── L5 未来（未来之钥） ─────────────
  {
    id: 'fut_coop', symbol: 'κ′', name: '国际合作', layer: 5, discipline: '跨学科',
    kind: 'number', value: 0.5, min: 0, max: 1, step: 0.05, key: 'future', confidence: 'yi',
    reference: '无量纲示意参数', role: '降低战争与失控风险', source: '人类命运共同体',
  },
  {
    id: 'fut_carbon', symbol: 'δ', name: '减排与生态修复', layer: 5, discipline: '气候科学',
    kind: 'number', value: 0.5, min: 0, max: 1, step: 0.05, key: 'future', confidence: 'yi',
    reference: '无量纲示意参数', role: '削减人与自然的张力', source: '“双碳”目标；IPCC AR6',
  },
  {
    id: 'fut_ai', symbol: 'γ', name: 'AI 治理', layer: 5, discipline: '人工智能',
    kind: 'number', value: 0.5, min: 0, max: 1, step: 0.05, key: 'future', confidence: 'yi',
    reference: '无量纲示意参数', role: '让生产关系跟上新质生产力', source: '新质生产力；生产关系适应生产力发展',
  },
  {
    id: 'fut_defense', symbol: 'π', name: '行星防御', layer: 5, discipline: '天文',
    kind: 'number', value: 0.3, min: 0, max: 1, step: 0.05, key: 'future', confidence: 'yi',
    reference: '无量纲示意参数', role: '降低小天体撞击风险',
    source: 'DART 任务：Thomas et al. 2023, Nature 616:448（绕转周期缩短约 33 分钟）',
    note: '千年尺度上大型撞击概率很低，它的意义在于人类第一次有能力改写 L3 层的“灭绝事件”。',
  },
];

export const PARAM_INDEX: Record<string, ParamDef> = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

/** 可调参数（排除只读事实）。 */
export const EDITABLE = PARAMS.filter((p) => p.kind !== 'fact');

/** 我们的宇宙与地球的取值。 */
export function defaultParams(): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  for (const p of EDITABLE) out[p.id] = p.value;
  return out;
}
