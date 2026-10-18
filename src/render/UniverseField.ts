// 终章：一万个平行宇宙。每个光点是一次德雷克方程抽样；N < 1 的宇宙依次熄灭。

import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import type { DrakeSample } from '../sim/montecarlo';

export class UniverseField {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private auraMat: THREE.SpriteMaterial;
  private master = 1;
  private progress = 0;

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
      const rad = 4 + Math.pow(r(), 0.58) * 17;
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
          float tw = 0.82 + 0.18*sin(uTime*2.0 + order*300.0);
          gl_PointSize = clamp((3.8 + vAlive * (1.6 + uProgress * 0.8)) * tw * uPixel * (30.0 / max(4.0, -mv.z)), 2.0, 8.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform float uProgress; varying float vLit; varying float vAlive;
        void main(){
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q);
          float core = smoothstep(0.24, 0.0, d);
          float halo = smoothstep(0.5, 0.06, d);
          float a = max(core, halo * 0.34);
          vec3 c = mix(vec3(0.50,0.76,1.0), vec3(1.0,0.80,0.42), vAlive * mix(0.18, 1.0, uProgress));
          vec3 dead = vec3(0.42,0.06,0.035);
          vec3 col = mix(dead, c, vLit);
          col += vec3(0.22,0.28,0.55) * halo * (1.0 - vLit) * 0.5;
          gl_FragColor = vec4(col, a * mix(0.18, 0.96, vLit) * uOpacity);
        }
      `,
    });
    const pts = new THREE.Points(g, this.mat);
    pts.frustumCulled = false;
    this.group.add(pts);

    // A soft sample-cloud aura anchors the 10,000 points as one object instead of
    // letting them disappear into the background starfield.
    const ac = document.createElement('canvas');
    ac.width = ac.height = 512;
    const ag = ac.getContext('2d')!;
    const grad = ag.createRadialGradient(256, 256, 6, 256, 256, 250);
    grad.addColorStop(0, 'rgba(190,222,255,0.34)');
    grad.addColorStop(0.18, 'rgba(95,155,255,0.20)');
    grad.addColorStop(0.52, 'rgba(55,76,180,0.075)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ag.fillStyle = grad;
    ag.fillRect(0, 0, 512, 512);
    const auraTex = new THREE.CanvasTexture(ac);
    auraTex.colorSpace = THREE.SRGBColorSpace;
    this.auraMat = new THREE.SpriteMaterial({ map: auraTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.34 });
    const aura = new THREE.Sprite(this.auraMat);
    aura.scale.set(21, 16, 1);
    aura.renderOrder = -1;
    this.group.add(aura);
  }

  setDeadFraction(f: number): void {
    this.mat.uniforms.uDeadFrac.value = f;
  }

  setProgress(p: number): void {
    this.progress = p;
    this.mat.uniforms.uProgress.value = p;
    this.auraMat.opacity = 0.34 * this.master * (1 - 0.82 * p);
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPixel.value = pr;
  }

  setOpacity(a: number): void {
    this.master = a;
    this.mat.uniforms.uOpacity.value = a;
    this.auraMat.opacity = 0.34 * a * (1 - 0.82 * this.progress);
    this.group.visible = a > 0.002;
  }

  update(dt: number, t: number): void {
    this.mat.uniforms.uTime.value = t;
    this.group.rotation.y += dt * 0.01;
  }
}
