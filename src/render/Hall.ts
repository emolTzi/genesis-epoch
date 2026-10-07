// 实验大厅：全息地台、悬浮的往次实验星球、文明墓园星环。

import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

export interface GraveEntry {
  name: string;
  seed: number;
  layer: number;
}

export class Hall {
  readonly group = new THREE.Group();
  private floorMat: THREE.ShaderMaterial;
  private floaters: { mesh: THREE.Mesh; r: number; a: number; sp: number; y: number; inc: number }[] = [];
  private grave = new THREE.Group();
  private graveMat: THREE.MeshStandardMaterial;
  private emberMat: THREE.PointsMaterial;
  private master = 1;
  private standard: THREE.MeshStandardMaterial[] = [];
  private msgStars: THREE.Points | null = null;
  private msgMat = new THREE.PointsMaterial({ size: 0.16, color: 0xffe2a0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });

  constructor() {
    this.floorMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOpacity; varying vec2 vP;
        void main(){
          float r = length(vP); float a = atan(vP.y, vP.x);
          float rings = smoothstep(0.035, 0.0, abs(fract(r*1.25) - 0.5) - 0.46);
          float ticks = step(0.985, fract(a*36.0/6.2831853)) * step(fract(r*1.25), 0.25);
          float sweep = pow(max(0.0, cos(a - uTime*0.35)), 40.0) * smoothstep(9.0, 2.0, r);
          float fade = smoothstep(9.0, 3.0, r) * smoothstep(0.6, 1.6, r);
          vec3 c = vec3(0.25,0.95,0.9)*(rings*0.16 + ticks*0.3) + vec3(0.96,0.78,0.42)*sweep*0.2;
          gl_FragColor = vec4(c*fade, (rings*0.16+ticks*0.3+sweep*0.2)*fade*uOpacity);
        }
      `,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 96), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.3;
    this.group.add(floor);

    const r = mulberry32(11);
    const palette = [0x4fa3c7, 0xc9a46a, 0x7bc47f, 0xb98cff, 0xe0b07a, 0x88b6d8];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 + r() * 0.12, 28, 20),
        new THREE.MeshStandardMaterial({ color: palette[i], roughness: 0.75, metalness: 0.05, emissive: new THREE.Color(palette[i]).multiplyScalar(0.06) }),
      );
      this.group.add(m);
      this.standard.push(m.material as THREE.MeshStandardMaterial);
      this.floaters.push({ mesh: m, r: 4.6 + r() * 1.6, a: r() * Math.PI * 2, sp: (0.03 + r() * 0.05) * (i % 2 ? 1 : -1), y: (r() - 0.5) * 1.6, inc: (r() - 0.5) * 0.6 });
    }

    this.graveMat = new THREE.MeshStandardMaterial({ color: 0x22252f, roughness: 0.95, emissive: new THREE.Color(0x1c0805) });
    this.emberMat = new THREE.PointsMaterial({ size: 0.05, color: 0xff6152, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    this.grave.rotation.x = 0.32;
    this.grave.rotation.z = -0.12;
    this.group.add(this.grave);

    const key = new THREE.DirectionalLight(0xfff1d6, 1.4);
    key.position.set(-6, 3, 4);
    const fill = new THREE.AmbientLight(0x404a70, 0.5);
    this.group.add(key, fill);
  }

  setOpacity(a: number): void {
    this.master = a;
    this.group.visible = a > 0.002;
    this.floorMat.uniforms.uOpacity.value = a;
    for (const m of [...this.standard, this.graveMat]) {
      m.transparent = a < 0.999;
      m.opacity = a;
    }
  }

  /** 观众留言化作的星：分布在大厅上空。 */
  setMessageStars(n: number): void {
    if (this.msgStars) this.group.remove(this.msgStars);
    const count = Math.min(200, n);
    if (!count) return;
    const r = mulberry32(2049);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const el = 0.35 + r() * 0.9;
      const rad = 14 + r() * 4;
      pos.set([Math.cos(a) * Math.cos(el) * rad, Math.sin(el) * rad, Math.sin(a) * Math.cos(el) * rad], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.msgStars = new THREE.Points(g, this.msgMat);
    this.group.add(this.msgStars);
  }

  /** 用墓园数据重建暗色星环。 */
  setGraveyard(list: GraveEntry[]): void {
    this.grave.clear();
    const n = Math.min(64, list.length);
    const embers = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const rr = mulberry32(list[i].seed + i);
      const a = (i / Math.max(n, 12)) * Math.PI * 2 + rr() * 0.2;
      const rad = 7.6 + rr() * 0.8;
      const s = 0.07 + rr() * 0.09;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), this.graveMat);
      m.position.set(Math.cos(a) * rad, (rr() - 0.5) * 0.4, Math.sin(a) * rad);
      m.userData.grave = list[i];
      this.grave.add(m);
      embers.set([m.position.x, m.position.y + s, m.position.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(embers, 3));
    this.grave.add(new THREE.Points(g, this.emberMat));
  }

  update(dt: number, t: number, reduced: boolean): void {
    this.floorMat.uniforms.uTime.value = t;
    for (const f of this.floaters) {
      if (!reduced) f.a += f.sp * dt;
      f.mesh.position.set(Math.cos(f.a) * f.r, f.y + Math.sin(f.a) * f.inc, Math.sin(f.a) * f.r);
      f.mesh.rotation.y += dt * 0.2;
    }
    if (!reduced) this.grave.rotation.y += dt * 0.015;
    this.emberMat.opacity = (0.45 + 0.2 * Math.sin(t * 1.3)) * this.master;
    this.msgMat.opacity = (0.75 + 0.25 * Math.sin(t * 2.1)) * this.master;
  }
}
