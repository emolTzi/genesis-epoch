// 第④幕：K-Pg 撞击体、尾迹与撞击闪光。

import * as THREE from 'three';
import type { Tweens } from '../core/tween';
import { ease } from '../core/tween';

export class Impactor {
  readonly group = new THREE.Group();
  private rock: THREE.Mesh;
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private flash: THREE.Sprite;
  private wave: THREE.Mesh;

  constructor() {
    this.rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.075, 1),
      new THREE.MeshStandardMaterial({ color: 0x5b524a, roughness: 1, emissive: new THREE.Color(0xff6a20).multiplyScalar(1.6) }),
    );
    const tg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 30 }, () => new THREE.Vector3()));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(1, 0.62, 0.32).multiplyScalar(3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,230,1)');
    grd.addColorStop(0.3, 'rgba(255,170,80,0.6)');
    grd.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    this.wave = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.group.add(this.rock, this.trail, this.flash, this.wave);
    this.group.visible = false;
  }

  /**
   * 撞击动画：从远处沿弧线飞向行星表面 world 点。
   * planetCenter 用于计算撞击面的法向。
   */
  async strike(tw: Tweens, world: THREE.Vector3, planetCenter: THREE.Vector3, ms = 2200): Promise<void> {
    this.group.visible = true;
    const normal = world.clone().sub(planetCenter).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    const from = world.clone().add(normal.clone().multiplyScalar(4)).add(side.multiplyScalar(2.5));
    const ctrl = world.clone().add(normal.clone().multiplyScalar(2));
    this.trailPts = [];
    (this.flash.material as THREE.SpriteMaterial).opacity = 0;
    (this.wave.material as THREE.MeshBasicMaterial).opacity = 0;
    const p = new THREE.Vector3();
    await tw.run(ms, (k) => {
      const a = from.clone().lerp(ctrl, k);
      const b = ctrl.clone().lerp(world, k);
      p.copy(a.lerp(b, k));
      this.rock.position.copy(p);
      this.rock.rotation.x += 0.2;
      this.trailPts.unshift(p.clone());
      if (this.trailPts.length > 30) this.trailPts.pop();
      const arr = this.trail.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 30; i++) {
        const q = this.trailPts[Math.min(i, this.trailPts.length - 1)];
        arr.setXYZ(i, q.x, q.y, q.z);
      }
      arr.needsUpdate = true;
    }, ease.inCubic);
    this.rock.visible = false;
    this.trail.visible = false;
    this.flash.position.copy(world);
    this.wave.position.copy(world).add(normal.clone().multiplyScalar(0.01));
    this.wave.lookAt(world.clone().add(normal));
    await tw.run(1600, (k) => {
      (this.flash.material as THREE.SpriteMaterial).opacity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const s = 0.3 + k * 2.2;
      this.flash.scale.set(s, s, 1);
      (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      this.wave.scale.setScalar(0.05 + k * 0.55);
    }, ease.outCubic);
    this.group.visible = false;
    this.rock.visible = true;
    this.trail.visible = true;
  }
}
