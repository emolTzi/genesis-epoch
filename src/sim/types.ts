// 模拟层共享类型。

/** 六把钥匙：五重环加终章的未来之钥。 */
export type KeyId = 'core' | 'star' | 'elem' | 'life' | 'civ' | 'future';

/** 置信等级：实证 / 估计 / 推测 / 争议 / 示意。 */
export type Confidence = 'shi' | 'gu' | 'tui' | 'zheng' | 'yi';

export type Layer = 0 | 1 | 2 | 3 | 4 | 5;

export type ParamValue = number | boolean | string;

export interface ParamDef {
  id: string;
  symbol: string;
  name: string;
  layer: Layer;
  discipline: string;
  /** number：滑杆；boolean：开关；choice：选项。fact：只读的参考事实。 */
  kind: 'number' | 'boolean' | 'choice' | 'fact';
  unit?: string;
  /** 默认值：本宇宙（我们的宇宙与地球）的取值。 */
  value: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  /** 滑杆按对数刻度。 */
  log?: boolean;
  choices?: { value: string; label: string }[];
  /** 改动它需要的钥匙。 */
  key: KeyId;
  confidence: Confidence;
  /** 参考值的文字表述。 */
  reference: string;
  /** 在作品中的作用。 */
  role: string;
  /** 文献出处。 */
  source: string;
  /** 补充说明（争议点、示意边界等）。 */
  note?: string;
}

export type Params = Record<string, ParamValue>;

export type Status = 'ok' | 'warn' | 'fail' | 'pending' | 'locked';

export interface Verdict {
  status: Status;
  /** 简短结论，例如“液态水窗口”。 */
  title: string;
  /** 一句解释。 */
  detail: string;
  /** 依据的参数编号，用于引用出处。 */
  refs?: string[];
}

export interface LayerReport {
  layer: Layer;
  verdict: Verdict;
  /** 该层的派生量，供界面读数与解释使用。 */
  values: Record<string, number | string | boolean>;
  /** 细分检查项。 */
  checks: { id: string; label: string; verdict: Verdict }[];
}

export const KEY_NAMES: Record<KeyId, string> = {
  core: '本源之钥',
  star: '星辰之钥',
  elem: '元素之钥',
  life: '生命之钥',
  civ: '文明之钥',
  future: '未来之钥',
};

export const LAYER_NAMES: Record<Layer, string> = {
  0: 'L0 物理常数',
  1: 'L1 天体',
  2: 'L2 行星化学',
  3: 'L3 生命',
  4: 'L4 文明',
  5: 'L5 未来',
};

export const CONFIDENCE_NAMES: Record<Confidence, string> = {
  shi: '实证',
  gu: '估计',
  tui: '推测',
  zheng: '争议',
  yi: '示意',
};

/** 认知等级与初始钥匙。 */
export const RANKS = [
  { name: '见习观测员', stage: '约小学', keys: ['star'] as KeyId[], depth: 0 },
  { name: '助理观测员', stage: '约初中', keys: ['star', 'elem'] as KeyId[], depth: 0 },
  { name: '观测员', stage: '约高中', keys: ['star', 'elem', 'life'] as KeyId[], depth: 1 },
  { name: '研究员', stage: '约本科', keys: ['star', 'elem', 'life', 'civ'] as KeyId[], depth: 2 },
  { name: '首席科学家', stage: '约硕士', keys: ['star', 'elem', 'life', 'civ', 'core'] as KeyId[], depth: 2 },
] as const;

/** 讲解深度：0 浅，1 中，2 深。 */
export type Depth = 0 | 1 | 2;
export const DEPTH_NAMES = ['浅', '中', '深'] as const;
