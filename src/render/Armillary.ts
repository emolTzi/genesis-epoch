// 浑天仪五重环（加终章的未来之环）：知识即权限的视觉核心。
// 由外向内：文明、生命、元素、星辰、本源；未来之环在终章出现于最外层。

import * as THREE from 'three';
import type { KeyId } from '../sim/types';
import { KEY_NAMES } from '../sim/types';
import { TextSprite } from './TextSprite';

interface Ring {
  key: KeyId;
  holder: THREE.Group;
  spin: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  glow: THREE.MeshBasicMaterial;
  ticks: THREE.PointsMaterial;
  label: TextSprite;
  on: number;
  target: number;
  pulse: number;
  speed: number;
  dir: number;
  visible: number;
  visibleTarget: number;
}

const DEFS: { key: KeyId; r: number; rot: [number, number, number] }[] = [
  { key: 'future', r: 3.55, rot: [Math.PI / 2 - 0.06, 0.2, -0.12] },
  { key: 'civ', r: 3.05, rot: [Math.PI / 2 + 0.18, 0, 0.1] },
  { key: 'life', r: 2.62, rot: [0.15, Math.PI / 2, 0] },
  { key: 'elem', r: 2.2, rot: [Math.PI / 2 + 0.41, 0.3, 0] },
  { key: 'star', r: 1.8, rot: [0.95, 0.6, 0.2] },
  { key: 'core', r: 1.42, rot: [Math.PI / 2 - 0.25, 0, 0.55] },
];

const LOCK = new THREE.Color(0x3a4166);
const LOCK_TICK = new THREE.Color(0x5b6388);
const GOLD = new THREE.Color(0xf5c66b);
const CYAN = new THREE.Color(0x3ff2e6);
const WHITE = new THREE.Color(0xfff1d0);

export class Armillary {
  readonly group = new THREE.Group();
  private rings: Ring[] = [];
  private labelsOn = 1;
  private master = 1;

  constructor() {
    DEFS.forEach((d, idx) => {
      const holder = new THREE.Group();
      holder.rotation.set(...d.rot);
      this.group.add(holder);
      const spin = new THREE.Group();
      holder.add(spin);
      const mat = new THREE.MeshBasicMaterial({ color: LOCK.clone(), transparent: true, opacity: 0.5 });
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.014, 8, 256), mat));
      const glow = new THREE.MeshBasicMaterial({ color: GOLD.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.06, 8, 256), glow));
      const n = 72;
      const tp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = d.r + (i % 6 === 0 ? 0.05 : 0);
        tp.set([Math.cos(a) * rr, Math.sin(a) * rr, 0], i * 3);
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
      const ticks = new THREE.PointsMaterial({ size: 0.06, color: LOCK_TICK.clone(), transparent: true, opacity: 0.9, depthWrite: false });
      spin.add(new THREE.Points(tg, ticks));
      const label = new TextSprite(KEY_NAMES[d.key], { height: 0.2, color: '#a9aeca' });
      label.sprite.position.set(0, d.r + 0.18, 0);
      holder.add(label.sprite);
      const isFuture = d.key === 'future';
      this.rings.push({
        key: d.key, holder, spin, mat, glow, ticks, label, on: 0, target: 0, pulse: 0,
        speed: 0.05 + idx * 0.016, dir: idx % 2 ? -1 : 1,
        visible: isFuture ? 0 : 1, visibleTarget: isFuture ? 0 : 1,
      });
    });
  }

  setKeys(keys: Set<KeyId>, immediate = false): void {
    for (const r of this.rings) {
      r.target = keys.has(r.key) ? 1 : 0;
      if (r.key === 'future') r.visibleTarget = keys.has('future') ? 1 : 0;
      if (immediate) {
        r.on = r.target;
        r.visible = r.visibleTarget;
      }
    }
  }

  pulse(key: KeyId): void {
    const r = this.rings.find((x) => x.key === key);
    if (r) r.pulse = 1;
  }

  /** 整体透明度（大厅淡入淡出）。 */
  setOpacity(a: number): void {
    this.master = a;
    this.group.visible = a > 0.002;
  }

  setLabels(v: number): void {
    this.labelsOn = v;
  }

  refreshLabels(): void {
    for (const r of this.rings) r.label.refresh();
  }

  update(dt: number, reduced: boolean): void {
    const k = Math.min(1, dt * 3);
    for (const r of this.rings) {
      r.on += (r.target - r.on) * k;
      r.visible += (r.visibleTarget - r.visible) * Math.min(1, dt * 1.5);
      r.pulse = Math.max(0, r.pulse - dt * 0.6);
      const hue = r.key === 'core' ? CYAN : r.key === 'future' ? WHITE : GOLD;
      r.mat.color.copy(LOCK).lerp(hue, r.on).multiplyScalar(1 + 0.6 * r.on);
      const m = this.master;
      r.mat.opacity = (0.4 + 0.55 * r.on) * r.visible * m;
      r.glow.color.copy(hue).multiplyScalar(2.4);
      r.glow.opacity = (0.16 * r.on + 0.6 * r.pulse) * r.visible * m;
      r.ticks.color.copy(LOCK_TICK).lerp(hue, r.on);
      r.ticks.opacity = 0.9 * r.visible * m;
      r.label.setOpacity((0.45 + 0.55 * r.on) * r.visible * this.labelsOn * m);
      r.label.sprite.material.color.copy(new THREE.Color(0xa9aeca).lerp(hue, r.on));
      r.holder.visible = r.visible > 0.01;
      if (!reduced) r.spin.rotation.z += r.dir * r.speed * dt * (0.25 + r.on * 1.6 + r.pulse * 4);
    }
  }
}
