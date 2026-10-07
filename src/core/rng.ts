// 可复现的随机数：宇宙编号即种子，同一编号得到完全相同的推演结果。

export type Rng = () => number;

/** mulberry32：32 位状态的快速伪随机数发生器，输出 [0, 1)。 */
export function mulberry32(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 字符串哈希，用于从同一宇宙编号派生互不相关的子随机流。 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 由宇宙编号与用途标签派生独立的随机流。 */
export function streamFor(seed: number, salt: string): Rng {
  return mulberry32((seed ^ hashString(salt)) >>> 0);
}

export const randRange = (r: Rng, a: number, b: number): number => a + (b - a) * r();
export const randInt = (r: Rng, a: number, b: number): number => Math.floor(randRange(r, a, b + 1));
export const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];

/** 标准正态分布（Box–Muller）。 */
export function gaussian(r: Rng): number {
  let u = 0;
  while (u === 0) u = r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 对数均匀分布：在 [lo, hi] 上每个数量级等概率。 */
export function logUniform(r: Rng, lo: number, hi: number): number {
  const a = Math.log10(lo);
  const b = Math.log10(hi);
  return Math.pow(10, a + (b - a) * r());
}

/** 生成 1–99999 之间的宇宙编号。 */
export function newUniverseId(): number {
  return 1 + Math.floor(Math.random() * 99999);
}
