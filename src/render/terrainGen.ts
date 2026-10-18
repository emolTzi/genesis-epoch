// 文明沙盘的渲染用地形：在推演引擎的大陆高度场之上，生成肉眼可信的地貌细节。
//   1. 细节：域扭曲的山脊多重分形（山脉）+ 低幅丘陵噪声；
//   2. 水力侵蚀：数万个雨滴沿坡面流动、冲刷与沉积，刻出真实的山谷与冲积扇；
//   3. 水系：优先队列填洼 → D8 流向 → 汇流累积，得到入海的河网与内陆湖泊；
//   4. 环境光遮蔽：8 方向地平线采样，谷底与山坳自然变暗。
// 只改变观感，不改变海岸线与推演结果；同一宇宙编号的结果被缓存，回溯时不再重算。
import { SB_W, SB_H, type Terrain } from '../sim/sandbox';

/** 每个格子细分的顶点数。 */
export const SUB = 6;
export const VW = SB_W * SUB + 1;
export const VH = SB_H * SUB + 1;

export interface RenderTerrain {
  /** 世界单位的高度（海面为 0，海底为负）。 */
  heights: Float32Array;
  /** 引擎高度减去海平面（用于气候与群系）。 */
  elev: Float32Array;
  /** 顶点湿度（0..1）。 */
  moist: Float32Array;
  /** 河流强度（0..1）。 */
  river: Float32Array;
  /** 湖泊水深（世界单位，0 表示不是湖）。 */
  lake: Float32Array;
  /** 环境光遮蔽（1 为无遮挡）。 */
  ao: Float32Array;
  /** 坡度（高度梯度的模）。 */
  slope: Float32Array;
}

const N = VW * VH;
const cache = new Map<number, RenderTerrain>();

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: number) {
  const perm = new Float32Array(512 * 512);
  const r = rng(seed ^ 0x9e3779b9);
  for (let i = 0; i < perm.length; i++) perm[i] = r();
  const at = (x: number, y: number) => perm[((y & 511) << 9) | (x & 511)];
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildRenderTerrain(tr: Terrain, seed: number): RenderTerrain {
  const hit = cache.get(seed);
  if (hit) return hit;
  const noise = makeNoise(seed);
  const fbm = (x: number, y: number, oct: number) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    for (let o = 0; o < oct; o++) {
      s += a * noise(x * f, y * f);
      f *= 2.03;
      a *= 0.5;
    }
    return s;
  };
  /** 山脊多重分形：尖锐的山脊线，越高处细节越多。 */
  const ridged = (x: number, y: number) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    let w = 1;
    for (let o = 0; o < 5; o++) {
      let n = 1 - Math.abs(noise(x * f + o * 17.3, y * f) * 2 - 1);
      n *= n * w;
      w = Math.min(1, n * 1.8);
      s += a * n;
      f *= 2.1;
      a *= 0.5;
    }
    return s;
  };

  const heights = new Float32Array(N);
  const base = new Float32Array(N);
  const elev = new Float32Array(N);
  const moist = new Float32Array(N);
  const land = new Uint8Array(N);
  for (let vy = 0; vy < VH; vy++) {
    for (let vx = 0; vx < VW; vx++) {
      const i = vy * VW + vx;
      const e = tr.height(vx / SUB, vy / SUB) - tr.seaLevel;
      elev[i] = e;
      let h: number;
      if (e > 0) {
        // 域扭曲让山脉蜿蜒而不呈网格状
        const wx = vx + (fbm(vx * 0.02, vy * 0.02, 3) - 0.5) * 40;
        const wy = vy + (fbm(vx * 0.02 + 31, vy * 0.02 + 7, 3) - 0.5) * 40;
        const mtn = smooth(0.03, 0.26, e);
        const r = ridged(wx * 0.022, wy * 0.022);
        const hills = fbm(vx * 0.07, vy * 0.07, 4) - 0.5;
        h = e * 1.15 + 0.004 + r * r * 0.16 * mtn + hills * 0.018 * smooth(0.0, 0.06, e);
        land[i] = 1;
      } else {
        h = Math.max(-0.34, e * 1.15 - 0.004);
      }
      heights[i] = h;
      base[i] = h;
      // 湿度：格子中心值的双线性插值
      const fx = Math.max(0, Math.min(SB_W - 1.001, vx / SUB - 0.5));
      const fy = Math.max(0, Math.min(SB_H - 1.001, vy / SUB - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const m = tr.moist;
      const c0 = y0 * SB_W + x0;
      moist[i] = (m[c0] * (1 - tx) + m[c0 + 1] * tx) * (1 - ty) + (m[c0 + SB_W] * (1 - tx) + m[c0 + SB_W + 1] * tx) * ty;
    }
  }

  erode(heights, land, rng(seed ^ 0x51ed270b));
  for (let i = 0; i < N; i++) {
    if (land[i]) heights[i] = Math.max(0.003, heights[i]);
    else heights[i] = base[i];
  }

  const { river, lake } = hydrology(heights, land, moist);
  for (let i = 0; i < N; i++) {
    if (river[i] > 0) heights[i] = Math.max(0.0015, heights[i] - river[i] * 0.004);
    if (lake[i] > 0) heights[i] += lake[i];
    // 河谷湿润，植被更茂盛
    moist[i] = Math.min(1, moist[i] + river[i] * 0.18 + (lake[i] > 0 ? 0.1 : 0));
  }

  const step = 0.125 / SUB;
  const slope = new Float32Array(N);
  for (let vy = 1; vy < VH - 1; vy++) {
    for (let vx = 1; vx < VW - 1; vx++) {
      const i = vy * VW + vx;
      slope[i] = Math.hypot((heights[i + 1] - heights[i - 1]) / (2 * step), (heights[i + VW] - heights[i - VW]) / (2 * step));
    }
  }
  const ao = ambientOcclusion(heights, step);
  const out: RenderTerrain = { heights, elev, moist, river, lake, ao, slope };
  if (cache.size > 2) cache.delete(cache.keys().next().value!);
  cache.set(seed, out);
  return out;
}

/** 雨滴水力侵蚀（参照 Beyer 2015 与 Lague 2019 的粒子法）。 */
function erode(h: Float32Array, land: Uint8Array, r: () => number): void {
  const DROPS = 60000;
  const LIFE = 34;
  const INERTIA = 0.06;
  const CAPACITY = 5;
  const MIN_CAP = 0.0004;
  const ERODE = 0.35;
  const DEPOSIT = 0.3;
  const EVAP = 0.02;
  const GRAV = 4;
  const RADIUS = 2;
  // 侵蚀笔刷
  const bx: number[] = [];
  const by: number[] = [];
  const bw: number[] = [];
  let wsum = 0;
  for (let dy = -RADIUS; dy <= RADIUS; dy++) for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) continue;
    bx.push(dx);
    by.push(dy);
    bw.push(1 - d / (RADIUS + 0.5));
    wsum += 1 - d / (RADIUS + 0.5);
  }
  for (let k = 0; k < bw.length; k++) bw[k] /= wsum;
  const grad = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = x - xi;
    const v = y - yi;
    const i = yi * VW + xi;
    const a = h[i];
    const b = h[i + 1];
    const c = h[i + VW];
    const d = h[i + VW + 1];
    return { gx: (b - a) * (1 - v) + (d - c) * v, gy: (c - a) * (1 - u) + (d - b) * u, h: a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v };
  };
  for (let n = 0; n < DROPS; n++) {
    let x = 2 + r() * (VW - 5);
    let y = 2 + r() * (VH - 5);
    if (!land[Math.floor(y) * VW + Math.floor(x)]) continue;
    let dx = 0;
    let dy = 0;
    let speed = 1;
    let water = 1;
    let sed = 0;
    for (let life = 0; life < LIFE; life++) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const u = x - xi;
      const v = y - yi;
      const g = grad(x, y);
      dx = dx * INERTIA - g.gx * (1 - INERTIA);
      dy = dy * INERTIA - g.gy * (1 - INERTIA);
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) break;
      dx /= len;
      dy /= len;
      x += dx;
      y += dy;
      if (x < 2 || y < 2 || x >= VW - 3 || y >= VH - 3) break;
      const ni = Math.floor(y) * VW + Math.floor(x);
      if (!land[ni]) {
        // 入海：泥沙在河口沉积
        break;
      }
      const dh = grad(x, y).h - g.h;
      const cap = Math.max(-dh * speed * water * CAPACITY, MIN_CAP);
      const i = yi * VW + xi;
      if (sed > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * DEPOSIT;
        sed -= amt;
        h[i] += amt * (1 - u) * (1 - v);
        h[i + 1] += amt * u * (1 - v);
        h[i + VW] += amt * (1 - u) * v;
        h[i + VW + 1] += amt * u * v;
      } else {
        const amt = Math.min((cap - sed) * ERODE, -dh);
        for (let k = 0; k < bw.length; k++) {
          const j = (yi + by[k]) * VW + xi + bx[k];
          if (!land[j]) continue;
          const w = amt * bw[k];
          const take = Math.min(w, Math.max(0, h[j] - 0.002));
          h[j] -= take;
          sed += take;
        }
      }
      // 下坡（dh < 0）加速，上坡减速
      speed = Math.sqrt(Math.max(0, speed * speed - dh * GRAV));
      water *= 1 - EVAP;
    }
  }
}

/** 填洼、流向与汇流：返回河流强度与湖泊水深。 */
function hydrology(h: Float32Array, land: Uint8Array, moist: Float32Array): { river: Float32Array; lake: Float32Array } {
  // 优先队列填洼（Barnes 等 2014）：从海岸向内陆，保证每个陆地顶点都能流入大海
  const filled = Float32Array.from(h);
  const done = new Uint8Array(N);
  const heap: number[] = [];
  const key = (i: number) => filled[i];
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (key(heap[p]) <= key(heap[c])) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && key(heap[l]) < key(heap[m])) m = l;
        if (r < heap.length && key(heap[r]) < key(heap[m])) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  for (let i = 0; i < N; i++) {
    const x = i % VW;
    const y = (i / VW) | 0;
    if (!land[i] || x === 0 || y === 0 || x === VW - 1 || y === VH - 1) {
      done[i] = 1;
      if (land[i]) push(i);
      else {
        // 与陆地相邻的海面顶点作为出口
        let nearLand = false;
        for (let dy = -1; dy <= 1 && !nearLand; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < VW && yy < VH && land[yy * VW + xx]) {
            nearLand = true;
            break;
          }
        }
        if (nearLand) push(i);
      }
    }
  }
  // 填平的洼地上加入微小的随机坡度，让河道蜿蜒而不是走直线
  const jitter = rng(0x2b7e1516 ^ N);
  while (heap.length) {
    const i = pop();
    const x = i % VW;
    const y = (i / VW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= VW || yy >= VH) continue;
      const j = yy * VW + xx;
      if (done[j]) continue;
      done[j] = 1;
      filled[j] = Math.max(filled[j], filled[i] + 2e-6 + jitter() * 3e-5);
      push(j);
    }
  }
  // D8 流向：流向最陡的下游邻居
  const down = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const x = i % VW;
    const y = (i / VW) | 0;
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= VW || yy >= VH) continue;
      const j = yy * VW + xx;
      const drop = (filled[i] - (land[j] ? filled[j] : Math.min(filled[j], 0))) / (dx && dy ? 1.414 : 1);
      if (drop > best) {
        best = drop;
        down[i] = j;
      }
    }
  }
  // 汇流累积：按填洼后的高度从高到低传递，降水量随湿度
  const order = Array.from({ length: N }, (_, i) => i).filter((i) => land[i]);
  order.sort((a, b) => filled[b] - filled[a]);
  const acc = new Float32Array(N);
  for (const i of order) acc[i] += 0.3 + moist[i];
  for (const i of order) {
    const j = down[i];
    if (j >= 0 && land[j]) acc[j] += acc[i];
  }
  const river = new Float32Array(N);
  const lake = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const a = Math.log10(1 + acc[i]);
    river[i] = smooth(1.75, 2.85, a);
    const depth = filled[i] - h[i];
    if (depth > 0.004) lake[i] = depth;
  }
  // 只保留小湖：大片洼地在推演中是可耕地，渲染成湖会与聚落矛盾
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!lake[i] || seen[i]) continue;
    const comp: number[] = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k];
      const x = c % VW;
      const y = (c / VW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= VW || yy >= VH) continue;
        const j = yy * VW + xx;
        if (lake[j] && !seen[j]) {
          seen[j] = 1;
          comp.push(j);
        }
      }
    }
    if (comp.length > 220 || comp.length < 6) for (const c of comp) lake[c] = 0;
  }
  // 河道加宽一圈，避免细到看不见
  const wide = Float32Array.from(river);
  for (let i = 0; i < N; i++) {
    if (river[i] < 0.35) continue;
    const x = i % VW;
    const y = (i / VW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= VW || yy >= VH) continue;
      const j = yy * VW + xx;
      if (land[j]) wide[j] = Math.max(wide[j], river[i] * 0.55);
    }
  }
  return { river: wide, lake };
}

/** 地平线环境光遮蔽：8 个方向、指数步长采样。 */
function ambientOcclusion(h: Float32Array, step: number): Float32Array {
  const ao = new Float32Array(N);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
  const dist = [1, 2, 4, 7, 11, 17, 26];
  const hAt = (x: number, y: number) => Math.max(0, h[Math.max(0, Math.min(VH - 1, Math.round(y))) * VW + Math.max(0, Math.min(VW - 1, Math.round(x)))]);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const h0 = Math.max(0, h[y * VW + x]);
      let occ = 0;
      for (const [dx, dy] of dirs) {
        let maxS = 0;
        for (const d of dist) {
          const s = (hAt(x + dx * d, y + dy * d) - h0) / (d * step);
          if (s > maxS) maxS = s;
        }
        occ += maxS / Math.sqrt(1 + maxS * maxS);
      }
      ao[y * VW + x] = 1 - Math.min(0.85, (occ / dirs.length) * 1.25);
    }
  }
  return ao;
}
