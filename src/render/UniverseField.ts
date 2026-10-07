// 终章：一万个平行宇宙。每个光点是一次德雷克方程抽样；N < 1 的宇宙依次熄灭。

import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import type { DrakeSample } from '../sim/montecarlo';

export class UniverseField {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;

  constructor(samples: DrakeSample[]) {
    const n = samples.length;
    const r = mulberry32(10000);
    const pos = new Float32Array(n * 3);
    const order = new Float32Array(n);
    const alive = new Float32Array(n);
    // 按 log N 排序决定熄灭先后：越接近 0 的越先熄灭
    const idx = samples.map((s, i) => ({ i, l: Math.log10(Math.max(s.N, 1e-300)) })).sort((a, b) => a.l - b.l);
    const rank = new Float32Array(n);
    idx.forEach((o, k) => (rank[o.i] = k / n));
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rad = 7 + Math.pow(r(), 0.6) * 26;
      pos.set([rad * s * Math.cos(th), rad * u * 0.75, rad * s * Math.sin(th)], i * 3);
      order[i] = rank[i];
      alive[i] = samples[i].N >= 1 ? 1 : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('order', new THREE.BufferAttribute(order, 1));
    g.setAttribute('alive', new THREE.BufferAttribute(alive, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uPixel: { value: 1 }, uOpacity: { value: 1 }, uDeadFrac: { value: 0.5 } },
      vertexShader: /* glsl */ `
        attribute float order; attribute float alive;
        uniform float uProgress; uniform float uTime; uniform float uPixel; uniform float uDeadFrac;
        varying float vLit; varying float vAlive;
        void main(){
          float cut = uProgress * uDeadFrac;
          float off = (1.0 - alive) * smoothstep(order - 0.02, order + 0.002, cut);
          vLit = 1.0 - off;
          vAlive = alive;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.8 + 0.2*sin(uTime*2.0 + order*300.0);
          gl_PointSize = (1.6 + vAlive*uProgress*1.2) * tw * uPixel * (30.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform float uProgress; varying float vLit; varying float vAlive;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 c = mix(vec3(0.65,0.75,1.0), vec3(1.0,0.82,0.5), vAlive*uProgress);
          vec3 dead = vec3(0.35,0.08,0.06);
          gl_FragColor = vec4(mix(dead, c, vLit), a * mix(0.12, 0.8, vLit) * uOpacity);
        }
      `,
    });
    const pts = new THREE.Points(g, this.mat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  setDeadFraction(f: number): void {
    this.mat.uniforms.uDeadFrac.value = f;
  }

  setProgress(p: number): void {
    this.mat.uniforms.uProgress.value = p;
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPixel.value = pr;
  }

  setOpacity(a: number): void {
    this.mat.uniforms.uOpacity.value = a;
    this.group.visible = a > 0.002;
  }

  update(dt: number, t: number): void {
    this.mat.uniforms.uTime.value = t;
    this.group.rotation.y += dt * 0.01;
  }
}
