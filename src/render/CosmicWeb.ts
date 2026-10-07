// 第①幕：大爆炸与宇宙网。粒子从奇点附近膨胀，冷却后沿纤维聚集，第一代恒星在节点处点亮。

import * as THREE from 'three';
import { mulberry32, gaussian } from '../core/rng';

export class CosmicWeb {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;

  constructor(count: number) {
    const r = mulberry32(1998);
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < 70; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const rad = Math.cbrt(r()) * 6.5;
      const s = Math.sqrt(1 - u * u);
      nodes.push(new THREE.Vector3(rad * s * Math.cos(th), rad * u * 0.8, rad * s * Math.sin(th)));
    }
    const edges: [number, number][] = [];
    nodes.forEach((n, i) => {
      const near = nodes
        .map((m, j) => ({ j, d: n.distanceTo(m) }))
        .filter((x) => x.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const x of near) if (i < x.j) edges.push([i, x.j]);
    });
    const pos = new Float32Array(count * 3);
    const start = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const star = new Float32Array(count);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      if (r() < 0.68) {
        const [a, b] = edges[Math.floor(r() * edges.length)];
        tmp.copy(nodes[a]).lerp(nodes[b], r());
        const th = 0.07 + 0.05 * r();
        tmp.add(new THREE.Vector3(gaussian(r) * th, gaussian(r) * th, gaussian(r) * th));
      } else {
        const n = nodes[Math.floor(r() * nodes.length)];
        const th = 0.12 + 0.2 * r();
        tmp.set(n.x + gaussian(r) * th, n.y + gaussian(r) * th, n.z + gaussian(r) * th);
      }
      pos.set([tmp.x, tmp.y, tmp.z], i * 3);
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rr = 0.02 + r() * 0.08;
      start.set([rr * s * Math.cos(th), rr * u, rr * s * Math.sin(th)], i * 3);
      seed[i] = r();
      star[i] = r() < 0.04 ? 1 : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('start', new THREE.BufferAttribute(start, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('star', new THREE.BufferAttribute(star, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uExpand: { value: 1 }, uCool: { value: 1 }, uStars: { value: 1 }, uTime: { value: 0 },
        uPixel: { value: 1 }, uOpacity: { value: 1 }, uDead: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 start; attribute float seed; attribute float star;
        uniform float uExpand; uniform float uCool; uniform float uStars; uniform float uTime; uniform float uPixel; uniform float uDead;
        varying vec3 vCol; varying float vA;
        void main(){
          float e = 1.0 - pow(1.0 - clamp(uExpand,0.0,1.0), 3.0);
          vec3 p = mix(start, position, e);
          vec3 hot = vec3(1.0, 0.95, 0.85);
          vec3 cold = mix(vec3(0.42,0.36,1.0), vec3(0.25,0.8,0.95), seed);
          vec3 c = mix(hot, cold, uCool);
          float flare = star * uStars * (0.6 + 0.4*sin(uTime*2.0 + seed*40.0));
          c = mix(c, vec3(1.0, 0.86, 0.55), flare);
          c = mix(c, vec3(0.55, 0.12, 0.1), uDead);
          vCol = c;
          vA = (mix(1.0, 0.5 + 0.5*seed, uCool) + flare) * (1.0 - 0.6*uDead);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.4 + 2.6*flare + (1.0-uCool)*1.5) * uPixel * (18.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying vec3 vCol; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vCol, a*vA*0.55*uOpacity); }
      `,
    });
    const pts = new THREE.Points(g, this.mat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPixel.value = pr;
  }

  set(expand: number, cool: number, stars: number): void {
    this.mat.uniforms.uExpand.value = expand;
    this.mat.uniforms.uCool.value = cool;
    this.mat.uniforms.uStars.value = stars;
  }

  setDead(v: number): void {
    this.mat.uniforms.uDead.value = v;
  }

  setOpacity(a: number): void {
    this.mat.uniforms.uOpacity.value = a;
    this.group.visible = a > 0.002;
  }

  update(dt: number, t: number): void {
    this.mat.uniforms.uTime.value = t;
    this.group.rotation.y += dt * 0.02;
  }
}
