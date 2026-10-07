// 第⑤幕：生产力 / 生产关系双环全息仪与文明数据流。
// 双环各由若干弧段组成；社会形态更替时双环碎裂、飞散再重组（量变到质变）。

import * as THREE from 'three';
import type { Tweens } from '../core/tween';
import { ease } from '../core/tween';

const SEG = 48;

class SegRing {
  readonly mesh: THREE.InstancedMesh;
  readonly mat: THREE.MeshBasicMaterial;
  radius: number;
  burst = 0;
  private vel: THREE.Vector3[] = [];
  private spinAxis: THREE.Vector3[] = [];
  private dummy = new THREE.Object3D();

  constructor(radius: number, color: number, thickness: number) {
    this.radius = radius;
    const arc = (Math.PI * 2 * radius) / SEG;
    const geo = new THREE.BoxGeometry(arc * 0.82, thickness, thickness);
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, SEG);
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      this.vel.push(new THREE.Vector3(Math.cos(a), (Math.random() - 0.5) * 0.6, Math.sin(a)).multiplyScalar(0.6 + Math.random()));
      this.spinAxis.push(new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize());
    }
    this.layout();
  }

  layout(): void {
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const d = this.dummy;
      d.position.set(Math.cos(a) * this.radius, 0, Math.sin(a) * this.radius);
      d.position.addScaledVector(this.vel[i], this.burst * 1.8);
      d.rotation.set(0, -a + Math.PI / 2, 0);
      if (this.burst > 0) d.rotateOnAxis(this.spinAxis[i], this.burst * 4);
      d.scale.setScalar(1 - this.burst * 0.5);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class CivRings {
  readonly group = new THREE.Group();
  private P: SegRing;
  private R: SegRing;
  private streams: { pts: THREE.Points; speed: number }[] = [];
  private streamMat: THREE.PointsMaterial;
  private glowP = 0.6;
  private glowR = 0.6;

  constructor() {
    this.P = new SegRing(1.42, 0xf5c66b, 0.022);
    this.R = new SegRing(1.62, 0x3ff2e6, 0.018);
    const tilt = new THREE.Group();
    tilt.rotation.set(0.42, 0, 0.18);
    tilt.add(this.P.mesh, this.R.mesh);
    this.group.add(tilt);

    this.streamMat = new THREE.PointsMaterial({ color: 0x8ff5ee, size: 0.03, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let s = 0; s < 7; s++) {
      const n = 90;
      const pos = new Float32Array(n * 3);
      const rad = 1.12 + s * 0.035;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const gap = Math.sin(a * 5 + s) > 0.2 ? 1 : 0;
        pos.set([Math.cos(a) * rad * gap, 0, Math.sin(a) * rad * gap], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, this.streamMat);
      pts.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      this.group.add(pts);
      this.streams.push({ pts, speed: 0.15 + Math.random() * 0.25 });
    }
  }

  /** 按生产力与生产关系的相对大小设置亮度。 */
  setLevels(pNorm: number, rNorm: number): void {
    this.glowP = 0.35 + 0.65 * Math.min(1, pNorm);
    this.glowR = 0.35 + 0.65 * Math.min(1, rNorm);
  }

  setStreams(v: number): void {
    this.streamMat.opacity = 0.85 * v;
  }

  /** 质变：双环碎裂、飞散、再以更大的半径重组。 */
  async shatter(tw: Tweens): Promise<void> {
    await tw.run(700, (k) => {
      this.P.burst = k;
      this.R.burst = k;
      this.P.layout();
      this.R.layout();
    }, ease.outCubic);
    await tw.run(900, (k) => {
      this.P.burst = 1 - k;
      this.R.burst = 1 - k;
      this.P.layout();
      this.R.layout();
    }, ease.inOutCubic);
  }

  update(dt: number, t: number): void {
    this.P.mat.opacity = this.glowP * (0.85 + 0.15 * Math.sin(t * 3));
    this.R.mat.opacity = this.glowR * 0.85;
    this.P.mesh.rotation.y += dt * 0.25;
    this.R.mesh.rotation.y -= dt * 0.18;
    for (const s of this.streams) s.pts.rotateY(dt * s.speed);
  }
}
