// 银河系：双旋臂对数螺线加核球。焦点恒星位于旋臂外侧，整体偏移使焦点落在原点，便于尺度连续缩放。

import * as THREE from 'three';
import { mulberry32, gaussian } from '../core/rng';

export class Galaxy {
  readonly group = new THREE.Group();
  private disk = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  readonly focus = new THREE.Vector3();
  private markerMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true });

  constructor(count: number) {
    const r = mulberry32(2026);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const R = 6;
    for (let i = 0; i < count; i++) {
      let x: number;
      let y: number;
      let z: number;
      let c: [number, number, number];
      if (r() < 0.22) {
        const rad = Math.abs(gaussian(r)) * 0.8;
        const th = r() * Math.PI * 2;
        x = Math.cos(th) * rad;
        z = Math.sin(th) * rad;
        y = gaussian(r) * 0.25 * Math.exp(-rad);
        c = [1, 0.85, 0.6];
      } else {
        const arm = r() < 0.5 ? 0 : Math.PI;
        const t = Math.pow(r(), 0.7);
        const rad = 0.6 + t * R;
        const th = arm + Math.log(rad / 0.6) / Math.tan(0.28) * 0.5 + gaussian(r) * (0.18 + 0.1 * t);
        x = Math.cos(th) * rad + gaussian(r) * 0.12;
        z = Math.sin(th) * rad + gaussian(r) * 0.12;
        y = gaussian(r) * 0.06;
        const young = r() < 0.35;
        c = young ? [0.55, 0.7, 1] : [0.9, 0.86, 0.95];
      }
      pos.set([x, y, z], i * 3);
      col.set(c, i * 3);
      size[i] = 0.6 + Math.pow(r(), 4) * 2.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixel: { value: 1 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float size; uniform float uPixel; varying vec3 vCol;
        void main(){ vCol = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*uPixel*(14.0 / -mv.z); gl_Position = projectionMatrix*mv; }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying vec3 vCol;
        void main(){ float d = length(gl_PointCoord-0.5); gl_FragColor = vec4(vCol, smoothstep(0.5,0.0,d)*0.5*uOpacity); }
      `,
    });
    const pts = new THREE.Points(g, this.mat);
    pts.frustumCulled = false;
    this.disk.add(pts);
    // 焦点：旋臂外侧约三分之二半径处（太阳在银河系中的相对位置）
    this.focus.set(Math.cos(2.4) * 4.1, 0, Math.sin(2.4) * 4.1);
    this.disk.position.copy(this.focus).multiplyScalar(-1);
    this.group.add(this.disk);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), this.markerMat);
    this.group.add(marker);
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPixel.value = pr;
  }

  setOpacity(a: number): void {
    this.mat.uniforms.uOpacity.value = a;
    this.markerMat.opacity = a;
    this.group.visible = a > 0.002;
  }

  update(dt: number): void {
    this.disk.rotation.y += dt * 0.01;
  }
}
