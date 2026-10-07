// 观测者·零号的离线模式：规则意图解析 + 预置回答。
// 没有网络与 API Key 时，作品仍能回答常见问题、执行常见的反事实调参。
// 预置回答由 AI 辅助撰写，需团队逐条审校（docs/审校清单.md）。界面标注“离线缓存”。

import type { ParamValue } from '../sim/types';

export interface OfflineIntent {
  id: string;
  /** 任一组关键词全部命中即匹配。 */
  patterns: string[][];
  /** 反事实调参（可选）。 */
  changes?: { param: string; to: ParamValue | ((text: string) => ParamValue) }[];
  answer: string;
}

function number(text: string, fallback: number): number {
  const m = text.match(/(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : fallback;
}

export const OFFLINE: OfflineIntent[] = [
  {
    id: 'no-moon',
    patterns: [['月'], ['卫星', '没']],
    changes: [{ param: 'moon', to: false }],
    answer: '移除大卫星后，模型给出的是“警示”而不是“失败”：早期研究认为地球自转轴倾角会混沌变化、气候剧烈摆动，后来的模拟认为变化可能有限。这一项在学界有争议，所以作品不把它判为文明的终点。',
  },
  {
    id: 'closer',
    patterns: [['近'], ['靠近'], ['金星']],
    changes: [{ param: 'orbit_a', to: (t) => (/金星/.test(t) ? 0.72 : Math.min(0.9, number(t, 0.8))) }],
    answer: '靠近恒星后，一阶估计的平衡温度升高。越过保守宜居带内缘（约 0.99 AU）后，水汽的正反馈会引发失控温室，海洋被光解、氢逃逸，行星走上金星的道路。这一层的判断属于元素之钥。',
  },
  {
    id: 'farther',
    patterns: [['远'], ['火星']],
    changes: [{ param: 'orbit_a', to: (t) => (/火星/.test(t) ? 1.52 : Math.max(1.2, number(t, 1.8))) }],
    answer: '远离恒星后，接收的辐射按距离平方衰减。保守宜居带内，碳–硅酸盐循环可以通过积累 CO₂ 部分抵消降温；再远，冰反照率正反馈会把行星锁进雪球状态。',
  },
  {
    id: 'bigger-star',
    patterns: [['恒星', '大'], ['太阳', '大'], ['恒星', '重'], ['太阳', '重']],
    changes: [{ param: 'star_mass', to: (t) => Math.max(1.2, Math.min(2, number(t, 1.5))) }],
    answer: '更重的恒星光度大约随质量的四次方增长，主序寿命迅速缩短。1.5 倍太阳质量的恒星只有约 30 亿年寿命，短于地球演化出人类所用的约 45 亿年。',
  },
  {
    id: 'dino',
    patterns: [['恐龙'], ['小行星', '别'], ['撞', '别']],
    changes: [{ param: 'kpg_site', to: 'safe' }],
    answer: '如果小行星落在约 87% 的其他地区，烟尘不足以引发全球灭绝（Kaiho & Oshima 2017）。非鸟恐龙可能继续统治陆地，哺乳动物难以占据大型生态位，人类这一具体结果不会出现。是否会出现别的智能，是未知数。',
  },
  {
    id: 'small-planet',
    patterns: [['地球', '小'], ['行星', '小']],
    changes: [{ param: 'planet_mass', to: 0.2 }],
    answer: '质量太小的行星逃逸速度低、内部冷却快，难以长期保住大气，也可能失去板块构造。火星约 0.11 个地球质量，它的大气大部分已经流失。',
  },
  {
    id: 'big-planet',
    patterns: [['地球', '大'], ['行星', '大'], ['超级地球']],
    changes: [{ param: 'planet_mass', to: 6 }],
    answer: '质量更大的行星可能吸积厚重的氢氦包层，成为迷你海王星；半径约 1.5–2 个地球半径处存在“半径谷”（Fulton et al. 2017）。超级地球是否有板块构造，学界仍有争论。',
  },
  {
    id: 'strong-force',
    patterns: [['强力'], ['强相互作用'], ['强核力']],
    changes: [{ param: 'alphas_dev', to: (t) => (/弱|减/.test(t) ? -1 : 1) * Math.abs(number(t, 1)) }],
    answer: '强相互作用强度偏移超过约 0.5%，碳-12 霍伊尔态的位置就会移动，红巨星中的碳或氧几乎全部消失（Oberhummer et al. 2000）。这属于本源之钥。注意：物理常数在整个宇宙中相同，它回答“宇宙为何允许生命”，不能解释“为何只看到我们”。',
  },
  {
    id: 'alpha',
    patterns: [['精细结构'], ['电磁']],
    changes: [{ param: 'alpha_dev', to: (t) => (/小|弱|减/.test(t) ? -1 : 1) * Math.abs(number(t, 5)) }],
    answer: '库仑力强度偏移超过约 4%，同样会让恒星中的碳或氧几乎消失。精细结构常数还决定原子大小与化学键能，几乎所有化学都依赖它。',
  },
  {
    id: 'lambda',
    patterns: [['宇宙学常数'], ['暗能量']],
    changes: [{ param: 'lambda_ratio', to: 300 }],
    answer: '宇宙学常数过大时，加速膨胀会在物质聚集成星系之前主导宇宙（Weinberg 1987）。作品用“现值的 100 倍”作为示意阈值，只表达这一论证的量级。',
  },
  {
    id: 'volcano',
    patterns: [['火山'], ['板块']],
    changes: [{ param: 'outgassing', to: 0 }],
    answer: '没有火山脱气，二氧化碳只出不进，被风化持续埋入海底。温室效应减弱，冰反照率正反馈把行星锁进永久雪球。碳循环需要板块构造来闭合。',
  },
  {
    id: 'weathering',
    patterns: [['风化'], ['二氧化碳'], ['温室']],
    changes: [{ param: 'weathering', to: 0.05 }],
    answer: '风化几乎停止时，火山补充的二氧化碳无法被移除，温度一路上升，负反馈失效。恩格斯提醒过：我们不要过分陶醉于对自然界的胜利。',
  },
  {
    id: 'cooperate',
    patterns: [['合作'], ['战争'], ['核']],
    changes: [{ param: 'coop', to: (t) => (/不|低|没有|减/.test(t) ? 0.1 : 0.9) }],
    answer: '模型中，工业文明之后的毁灭性技术风险只取决于技术水平与合作程度，与社会形态的名称无关。合作程度越高，500 个平行宇宙中的存活率越高：偶然决定这一次，规律决定概率。',
  },
  {
    id: 'petrov',
    patterns: [['彼得罗夫'], ['1983'], ['按下']],
    changes: [{ param: 'choice_1983', to: 'launch' }],
    answer: '1983 年 9 月 26 日，苏联预警卫星报告导弹来袭，值班军官彼得罗夫判断为系统误报。如果他按警报上报并触发报复，这个文明会在那一刻自我毁灭。作品用它说明：个人的选择也是参量。',
  },
  {
    id: 'arkhipov',
    patterns: [['阿尔希波夫'], ['1962'], ['潜艇']],
    changes: [{ param: 'choice_1962', to: 'launch' }],
    answer: '1962 年古巴导弹危机中，苏联潜艇 B-59 上发射核鱼雷需要三名军官一致同意，阿尔希波夫投了反对票。三个人里只要少一个反对，历史可能完全不同。',
  },
  {
    id: 'fermi',
    patterns: [['外星'], ['费米'], ['孤独'], ['只有我们']],
    answer: '把德雷克方程每个因子的不确定性当真地传播下去（Sandberg et al. 2018），“银河系中此刻只有我们”就有相当可观的概率。生命起源、智能出现、文明延续，每一道关卡的概率都可能极低，叠在一起，寂静并不奇怪。作品终章用一万次抽样呈现这一点。',
  },
  {
    id: 'freedom',
    patterns: [['钥匙'], ['权限'], ['自由'], ['必然']],
    answer: '恩格斯认为，自由不在于幻想中摆脱自然规律，而在于认识这些规律，并据此有计划地让它们为一定目的服务。作品的“知识即权限”就是这句话的交互化：你理解了哪一层规律，才能改变哪一层参量。',
  },
  {
    id: 'pr',
    patterns: [['生产力'], ['生产关系'], ['社会形态'], ['质变']],
    answer: '马克思在《〈政治经济学批判〉序言》中指出，生产力发展到一定阶段，会同现存生产关系发生矛盾，生产关系由发展形式变成桎梏，社会变革随之到来。第⑤幕的双环全息仪把这一机制做成示意性模型：矛盾积累越过阈值，双环碎裂重组。它用于可视化理论机制，不做历史预测。',
  },
  {
    id: 'butterfly',
    patterns: [['蝴蝶'], ['混沌'], ['偶然']],
    answer: '在混沌系统中，初始差异按 e^{λt} 放大，Lorenz 系统的 λ 约 0.906。精度提高一万倍，可预测的时间只多约 10 个单位。但偶然中贯穿着必然：单个宇宙的结局难以预测，大量宇宙的统计规律却是稳定的。',
  },
  {
    id: 'model',
    patterns: [['准确'], ['严谨'], ['可信'], ['真的吗']],
    answer: '作品的每个参量都登记了参考值、出处与置信等级（实证、估计、推测、争议、示意），结论统一表述为“在已知物理定律与本模型假设下”。L4 与 L5 是示意性模型，用来表达机制与方向，不是预测。你可以在观测档案里查看全部参数与文献。',
  },
  {
    id: 'future',
    patterns: [['未来'], ['我们能做'], ['怎么办']],
    answer: '终章的四个未来参量是合作、减排与生态修复、AI 治理、行星防御。它们不再由宇宙替我们选择。人类已经改写过参量：《蒙特利尔议定书》之后臭氧层正在恢复，DART 撞击让小行星的绕转周期缩短了约 33 分钟。',
  },
];

export const OFFLINE_FALLBACK =
  '离线模式下我只能回答预置的问题。可以试着问：“如果没有月球会怎样”“如果恐龙没有灭绝”“强相互作用变强 1%”“为什么没发现外星人”“什么是知识即权限”。在设置中接入大模型后，可以自由提问。';

export function matchOffline(text: string): OfflineIntent | null {
  const t = text.replace(/\s/g, '');
  for (const it of OFFLINE) {
    if (it.patterns.some((group) => group.every((kw) => t.includes(kw)))) return it;
  }
  return null;
}
