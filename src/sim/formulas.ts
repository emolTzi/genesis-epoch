// 公式库：纯函数，全部有单元测试覆盖（tests/formulas.test.ts）。

import {
  AU,
  ECS_PER_DOUBLING,
  EARTH_GREENHOUSE,
  L_SUN,
  R_SUN,
  SEFF_INNER,
  SEFF_OUTER,
  SIGMA,
  T_SUN,
  V_ESC_EARTH,
} from './constants';

/**
 * 行星平衡温度（快速自转、全球平均）：
 * πR²(1−A)·L★/(4πa²) = 4πR²σT⁴  ⇒  T_eq = [L★(1−A) / (16πσa²)]^¼
 * 对太阳等价于 T_eq = T★·√(R★/2a)·(1−A)^¼。
 * @param aAU 轨道半长轴（AU）
 * @param albedo 邦德反照率
 * @param lumSolar 恒星光度（太阳光度为 1）
 */
export function equilibriumTemp(aAU: number, albedo: number, lumSolar = 1): number {
  const L = lumSolar * L_SUN;
  const a = aAU * AU;
  return Math.pow((L * (1 - albedo)) / (16 * Math.PI * SIGMA * a * a), 0.25);
}

/** 用 T★ 与 R★ 表达的同一公式，便于在界面上展示推导。 */
export function equilibriumTempFromStar(aAU: number, albedo: number, tStar = T_SUN, rStar = R_SUN): number {
  return tStar * Math.sqrt(rStar / (2 * aAU * AU)) * Math.pow(1 - albedo, 0.25);
}

/** 主序星质光关系分段近似（L/L☉，M/M☉）。 */
export function luminosityFromMass(m: number): number {
  if (m < 0.43) return 0.23 * Math.pow(m, 2.3);
  if (m < 2) return Math.pow(m, 4);
  return 1.4 * Math.pow(m, 3.5);
}

/** 主序寿命近似：t ≈ 10 Gyr × (M/M☉)/(L/L☉)。 */
export function mainSequenceLifetimeGyr(m: number): number {
  return (10 * m) / luminosityFromMass(m);
}

/** 主序星半径近似（R/R☉）。 */
export function radiusFromMass(m: number): number {
  return m < 1 ? Math.pow(m, 0.8) : Math.pow(m, 0.57);
}

/** 由光度与半径推得的有效温度（K）。 */
export function effectiveTemp(m: number): number {
  const L = luminosityFromMass(m);
  const R = radiusFromMass(m);
  return T_SUN * Math.pow(L / (R * R), 0.25);
}

/** 有效辐照度（地球处为 1）。 */
export function effectiveFlux(aAU: number, lumSolar: number): number {
  return lumSolar / (aAU * aAU);
}

/** 保守宜居带边界（AU）。忽略 S_eff 对恒星温度的依赖，属一阶近似。 */
export function habitableZone(lumSolar: number): { inner: number; outer: number } {
  return { inner: Math.sqrt(lumSolar / SEFF_INNER), outer: Math.sqrt(lumSolar / SEFF_OUTER) };
}

/** 岩质行星质量–半径近似 R ∝ M^0.27（R⊕，M⊕）。 */
export function planetRadius(mEarth: number): number {
  return Math.pow(mEarth, 0.27);
}

/** 逃逸速度（km/s）。 */
export function escapeVelocity(mEarth: number): number {
  return V_ESC_EARTH * Math.sqrt(mEarth / planetRadius(mEarth));
}

/** CO₂ 温室增温（K）：地球现值 33 K 加上相对工业化前浓度的对数强迫。 */
export function greenhouseWarming(co2Ratio: number, sensitivity = ECS_PER_DOUBLING): number {
  return EARTH_GREENHOUSE + sensitivity * Math.log2(Math.max(co2Ratio, 1e-6));
}

/** 卡尔达肖夫指数（萨根连续化形式），P 以瓦为单位。 */
export function kardashev(powerWatts: number): number {
  return (Math.log10(powerWatts) - 6) / 10;
}

/** 摄氏度。 */
export const toCelsius = (k: number): number => k - 273.15;
