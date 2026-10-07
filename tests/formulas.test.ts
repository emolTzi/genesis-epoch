import { describe, expect, it } from 'vitest';
import {
  effectiveFlux,
  equilibriumTemp,
  equilibriumTempFromStar,
  escapeVelocity,
  greenhouseWarming,
  habitableZone,
  kardashev,
  luminosityFromMass,
  mainSequenceLifetimeGyr,
} from '../src/sim/formulas';

describe('平衡温度', () => {
  it('地球 a = 1 AU、A = 0.30 时约 254.6 K', () => {
    expect(equilibriumTemp(1, 0.3)).toBeCloseTo(254.6, 0);
  });
  it('光度形式与 T★、R★ 形式一致', () => {
    for (const a of [0.5, 1, 2.4]) {
      expect(equilibriumTemp(a, 0.3)).toBeCloseTo(equilibriumTempFromStar(a, 0.3), 0);
    }
  });
  it('2.4 AU 时约 164 K，冰点以下', () => {
    expect(equilibriumTemp(2.4, 0.3)).toBeCloseTo(164.3, 0);
  });
  it('随距离按 a^(−1/2) 变化', () => {
    expect(equilibriumTemp(4, 0.3) / equilibriumTemp(1, 0.3)).toBeCloseTo(0.5, 5);
  });
});

describe('恒星', () => {
  it('太阳：光度 1，主序寿命约 10 Gyr', () => {
    expect(luminosityFromMass(1)).toBeCloseTo(1, 5);
    expect(mainSequenceLifetimeGyr(1)).toBeCloseTo(10, 5);
  });
  it('质量越大寿命越短', () => {
    expect(mainSequenceLifetimeGyr(1.5)).toBeLessThan(mainSequenceLifetimeGyr(1));
    expect(mainSequenceLifetimeGyr(1.5)).toBeLessThan(4.54);
  });
  it('太阳的保守宜居带约 0.99–1.68 AU', () => {
    const hz = habitableZone(1);
    expect(hz.inner).toBeCloseTo(0.993, 2);
    expect(hz.outer).toBeCloseTo(1.676, 2);
  });
  it('地球处有效辐照度为 1', () => {
    expect(effectiveFlux(1, 1)).toBe(1);
  });
});

describe('行星与文明', () => {
  it('地球逃逸速度约 11.2 km/s', () => {
    expect(escapeVelocity(1)).toBeCloseTo(11.19, 1);
  });
  it('工业化前 CO₂ 对应 33 K 温室增温，加倍增温 3 K', () => {
    expect(greenhouseWarming(1)).toBeCloseTo(33, 5);
    expect(greenhouseWarming(2) - greenhouseWarming(1)).toBeCloseTo(3, 5);
  });
  it('卡尔达肖夫 I 型对应 10^16 W', () => {
    expect(kardashev(1e16)).toBeCloseTo(1, 5);
  });
});
