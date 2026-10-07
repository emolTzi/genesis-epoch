// 观测档案：知识卡。每张卡标注学科、层级、置信等级与出处，供观众深入阅读，也可单独用于课堂。

import type { Confidence } from '../sim/types';

export interface Card {
  id: string;
  title: string;
  layer: string;
  discipline: string;
  confidence: Confidence;
  body: string;
  formula?: string;
  sources: string;
  /** 辩证法视角卡片。 */
  dialectic?: boolean;
}

export const CARDS: Card[] = [
  {
    id: 'hoyle', title: '霍伊尔态与碳的诞生', layer: 'L0', discipline: '核天体物理', confidence: 'gu',
    body: '恒星内部三个氦核结合成碳，需要碳-12 在约 7.65 MeV 处有一个共振能级。1953 年霍伊尔从“我们由碳构成”反推出这个能级，随后被实验证实。强相互作用或电磁相互作用稍有偏移，共振位置就会移动，碳或氧几乎无法合成。',
    formula: '|Δα_s/α_s| ≲ 0.5%，|Δα/α| ≲ 4%',
    sources: 'Hoyle 1954, ApJS 1:121；Oberhummer, Csótó & Schlattl 2000, Science 289:88',
  },
  {
    id: 'lambda', title: '宇宙学常数与星系', layer: 'L0', discipline: '宇宙学', confidence: 'gu',
    body: '宇宙学常数驱动宇宙加速膨胀。Weinberg 在 1987 年论证：如果它比观测值大得多，物质会在聚集成星系之前就被拉散。作品用“100 倍”作为示意阈值，只表达这一论证的量级。',
    sources: 'Weinberg 1987, PRL 59:2607；Planck 2018 VI',
  },
  {
    id: 'teq', title: '平衡温度与宜居带', layer: 'L1', discipline: '天体物理', confidence: 'shi',
    body: '行星吸收的恒星辐射与向外辐射的热量相等时的温度叫平衡温度。地球的平衡温度约 255 K，比实际平均气温低 33 K，差值来自温室效应。保守宜居带由更完整的气候模型给出，太阳的约为 0.99–1.68 AU。',
    formula: 'T_eq = [L★(1−A) / (16πσa²)]^¼ = T★·√(R★/2a)·(1−A)^¼',
    sources: 'Kopparapu et al. 2013, ApJ 765:131',
  },
  {
    id: 'mass-lum', title: '恒星质量决定寿命', layer: 'L1', discipline: '天体物理', confidence: 'gu',
    body: '主序星光度大约随质量的四次方增长，燃料却只随质量线性增加，所以越重的恒星死得越快。太阳主序寿命约 100 亿年；1.5 倍太阳质量的恒星只有约 30 亿年，短于地球演化出人类所用的约 45 亿年。',
    formula: 'L ∝ M⁴（0.43–2 M☉），t ≈ 10 Gyr · (M/M☉) / (L/L☉)',
    sources: '质光关系分段近似（Duric 2004）',
  },
  {
    id: 'moon', title: '月亮与自转轴（争议）', layer: 'L1', discipline: '天体力学', confidence: 'zheng',
    body: 'Laskar 等（1993）发现没有月球时地球自转轴倾角可能在 0°–85° 间混沌变化，气候将剧烈摆动。Lissauer 等（2012）的模拟则显示，无月地球的倾角变化幅度与时间尺度可能比预想小得多。作品把“没有大卫星”只当作警示，不判失败。',
    sources: 'Laskar, Joutel & Robutel 1993, Nature 361:615；Lissauer, Barnes & Chambers 2012, Icarus 217:77',
  },
  {
    id: 'thermostat', title: '碳–硅酸盐恒温器', layer: 'L2', discipline: '地球化学', confidence: 'gu',
    body: '火山向大气补充 CO₂；雨水溶解 CO₂ 侵蚀硅酸盐岩石，碳最终沉积为海底碳酸盐。温度越高风化越快，CO₂ 被移除越多，温度回落：这是让地球在数十亿年里保持液态水的负反馈。板块构造把碳酸盐带回地幔，循环得以闭合。',
    formula: 'W = W₀·(pCO₂/p₀)^0.3·exp((T−288 K)/13.7 K)',
    sources: 'Walker, Hays & Kasting 1981, JGR 86:9776',
  },
  {
    id: 'runaway', title: '失控温室与金星', layer: 'L2', discipline: '行星科学', confidence: 'gu',
    body: '行星接收的辐照超过某个阈值后，蒸发的水汽本身加强温室效应，形成正反馈；水汽到达高层大气被紫外线分解，氢逃逸到太空，海洋不可逆地流失。金星很可能走过这条路。',
    sources: 'Kasting 1988, Icarus 74:472；Kopparapu et al. 2013',
  },
  {
    id: 'kpg', title: '那 13% 的地表', layer: 'L3', discipline: '古生物学', confidence: 'gu',
    body: '约 6600 万年前，一颗直径约 10 公里的小行星撞上今墨西哥的希克苏鲁伯。撞击点岩层富含有机质与硫，产生的烟尘与硫酸盐气溶胶遮蔽阳光，非鸟恐龙灭绝。Kaiho 与 Oshima 估算，同样的撞击只有落在约 13% 的地表才会引发大灭绝。',
    sources: 'Schulte et al. 2010, Science 327:1214；Kaiho & Oshima 2017, Sci. Rep. 7:14855',
  },
  {
    id: 'abiogenesis', title: '生命起源：只有一个样本', layer: 'L3', discipline: '生物化学', confidence: 'tui',
    body: '地球上的生命出现得很早，但这并不说明生命容易出现：我们必然发现自己身处一颗已经有生命的行星上（人择选择效应）。只有一个样本时，生命起源的概率可能接近 1，也可能小到难以想象。',
    sources: 'Spiegel & Turner 2012, PNAS 109:395；Sandberg et al. 2018',
  },
  {
    id: 'pr', title: '生产力与生产关系', layer: 'L4', discipline: '马克思主义理论', confidence: 'yi',
    body: '生产力是人们改造自然的能力，生产关系是人们在生产中结成的关系。生产关系适合生产力时促进其发展；不适合时成为桎梏，矛盾积累到一定程度，社会形态发生更替。第⑤幕的双环全息仪把这一机制可视化，模型是示意性的，不做历史预测。',
    formula: 'C = (P − R)/R，C > 阈值 ⇒ 社会形态更替',
    sources: '马克思《〈政治经济学批判〉序言》（1859）；《马克思主义基本原理》',
  },
  {
    id: 'moments', title: '千钧一发：1962 与 1983', layer: 'L4', discipline: '历史', confidence: 'shi',
    body: '1962 年古巴导弹危机中，苏联潜艇 B-59 上发射核鱼雷需三名军官一致同意，瓦西里·阿尔希波夫投了反对票。1983 年 9 月 26 日，苏联预警卫星报告美国导弹来袭，值班军官斯坦尼斯拉夫·彼得罗夫判断为系统误报。两次危机都取决于个人的选择。',
    sources: '美国国家安全档案馆解密文件等公开史料',
  },
  {
    id: 'drake', title: '德雷克方程与费米悖论', layer: 'L5', discipline: '天文学', confidence: 'tui',
    body: 'N = R★·f_p·n_e·f_l·f_i·f_c·L。各因子的不确定性跨越许多个数量级。Sandberg 等（2018）指出，把不确定性当真地传播下去，“银河系中只有我们”就有相当可观的概率，费米悖论因此不再那么令人惊讶。终章的一万个宇宙即按此思路抽样，区间为本作品设定。',
    formula: 'N = R★ · f_p · n_e · f_l · f_i · f_c · L',
    sources: 'Drake 1961；Sandberg, Drexler & Ord 2018, arXiv:1806.02404',
  },
  {
    id: 'chaos', title: '混沌与蝴蝶效应', layer: '方法', discipline: '数学', confidence: 'shi',
    body: 'Lorenz 在 1963 年发现，一个只有三个变量的确定性方程组，初值相差极小，轨迹也会按指数分离。最大李雅普诺夫指数约 0.906：精度提高一万倍，可预测的时间只延长约 10 个单位。',
    formula: '|δ(t)| ≈ |δ₀|·e^{λt}，λ ≈ 0.906',
    sources: 'Lorenz 1963, J. Atmos. Sci. 20:130',
  },
  {
    id: 'force', title: '历史合力', layer: 'L5', discipline: '马克思主义理论', confidence: 'yi',
    body: '恩格斯在 1890 年致布洛赫的信中说，历史结果是无数单个意志相互交错形成的合力。终章把每位观众的选择当作一支力向量，所有向量的合成决定文明走向；你的那一支很小，但不为零。',
    sources: '恩格斯 1890 年 9 月致约·布洛赫的信',
  },
  {
    id: 'freedom', title: '自由与必然：知识即权限', layer: '全局', discipline: '马克思主义理论', confidence: 'yi',
    body: '恩格斯认为，自由在于认识自然规律，并据此有计划地让规律为一定目的服务。作品的核心机制正是这句话的交互化：你理解了哪一层规律，才能改变哪一层参量。',
    sources: '恩格斯《反杜林论》（1878）',
  },
  {
    id: 'd-quality', title: '辩证法视角：量变与质变', layer: '跨学科', discipline: '唯物辩证法', confidence: 'yi', dialectic: true,
    body: '水温一度一度升高，在 100 °C 突然沸腾；Logistic 映射的参数缓慢增大，系统在特定值突然分岔；生产力持续积累，社会形态在矛盾越过阈值时更替。三者机制不同，作品只把它们并列，作为理解“量变到质变”的类比。',
    sources: '恩格斯《自然辩证法》；May 1976, Nature 261:459',
  },
  {
    id: 'd-unity', title: '辩证法视角：对立统一', layer: '跨学科', discipline: '唯物辩证法', confidence: 'yi', dialectic: true,
    body: '恒星能稳定燃烧数十亿年，是因为向内的引力与向外的气体压力、辐射压处处平衡（流体静力学平衡）。燃料耗尽，平衡打破，恒星走向死亡，并把碳、氧、铁撒向宇宙，成为下一代恒星与行星的原料。',
    formula: 'dP/dr = −G·m(r)·ρ(r)/r²',
    sources: '恒星结构基本方程',
  },
  {
    id: 'd-chance', title: '辩证法视角：偶然与必然', layer: '跨学科', discipline: '唯物辩证法', confidence: 'yi', dialectic: true,
    body: '同一组参数，换一个宇宙编号，结局可能不同，这是偶然；把 500 个平行宇宙放在一起，存活率随合作程度稳定上升，这是必然。必然性通过大量偶然性为自己开辟道路。',
    sources: '《马克思主义基本原理》',
  },
];
