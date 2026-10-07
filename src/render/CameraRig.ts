// 摄像机：补间运镜与自由模式下的拖动环绕、滚轮缩放。

import * as THREE from 'three';
import type { Tweens, Ease } from '../core/tween';
import { ease } from '../core/tween';

export class CameraRig {
  readonly target = new THREE.Vector3();
  /** 环绕参数：方位角、仰角、距离。 */
  az = 0.3;
  el = 0.12;
  dist = 11;
  minDist = 1.6;
  maxDist = 40;
  orbitEnabled = true;
  autoRotate = 0.02;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private velAz = 0;
  private moving = 0;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    dom.addEventListener('pointerdown', (e) => {
      if (!this.orbitEnabled || e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.az -= dx * 0.005;
      this.el = Math.max(-1.2, Math.min(1.25, this.el + dy * 0.004));
      this.velAz = -dx * 0.02;
    });
    const end = () => (this.dragging = false);
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.orbitEnabled) return;
        e.preventDefault();
        this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * (1 + Math.sign(e.deltaY) * 0.08)));
      },
      { passive: false },
    );
  }

  /** 补间到新的环绕位置。 */
  async to(tw: Tweens, o: { target?: THREE.Vector3; az?: number; el?: number; dist?: number }, ms = 2000, e: Ease = ease.inOutCubic): Promise<void> {
    const t0 = this.target.clone();
    const t1 = o.target ? o.target.clone() : t0.clone();
    const a0 = this.az;
    const a1 = o.az ?? a0;
    const e0 = this.el;
    const e1 = o.el ?? e0;
    const d0 = this.dist;
    const d1 = o.dist ?? d0;
    this.moving++;
    await tw.run(ms, (k) => {
      this.target.copy(t0).lerp(t1, k);
      this.az = a0 + (a1 - a0) * k;
      this.el = e0 + (e1 - e0) * k;
      // 距离按对数插值，远近切换更自然
      this.dist = Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * k);
    }, e);
    this.moving--;
  }

  set(o: { target?: THREE.Vector3; az?: number; el?: number; dist?: number }): void {
    if (o.target) this.target.copy(o.target);
    if (o.az !== undefined) this.az = o.az;
    if (o.el !== undefined) this.el = o.el;
    if (o.dist !== undefined) this.dist = o.dist;
  }

  update(dt: number, reduced: boolean): void {
    if (!this.dragging && !this.moving && !reduced) {
      this.az += (this.autoRotate + this.velAz) * dt;
      this.velAz *= 0.94;
    }
    const c = Math.cos(this.el);
    this.camera.position.set(
      this.target.x + this.dist * c * Math.sin(this.az),
      this.target.y + this.dist * Math.sin(this.el),
      this.target.z + this.dist * c * Math.cos(this.az),
    );
    this.camera.lookAt(this.target);
  }
}
