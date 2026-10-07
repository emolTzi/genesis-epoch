// 天穹：星云背景与闪烁星空。

import * as THREE from 'three';
import { NOISE3D } from './glsl';
import { mulberry32 } from '../core/rng';

export class Sky {
  readonly group = new THREE.Group();
  private nebulaMat: THREE.ShaderMaterial;
  private starMat: THREE.ShaderMaterial;

  constructor(starCount: number) {
    this.nebulaMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uTintA: { value: new THREE.Color(0x2a1b5c) },
        uTintB: { value: new THREE.Color(0x0b2a4a) },
        uDust: { value: new THREE.Color(0xf5c66b) },
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uTintA; uniform vec3 uTintB; uniform vec3 uDust; uniform float uIntensity;
        varying vec3 vDir;
        ${NOISE3D}
        void main(){
          vec3 d = normalize(vDir);
          float n = fbm(d*2.2 + vec3(0.0, uTime*0.004, 0.0));
          float m = fbm(d*4.5 + vec3(3.1));
          float band = exp(-pow(d.y*2.4 + 0.25*sin(d.x*3.0), 2.0));
          vec3 col = mix(vec3(0.004,0.005,0.012), uTintA*0.55, smoothstep(0.35,0.85,n)*band);
          col += uTintB*0.35*smoothstep(0.45,0.9,m)*(0.4+band);
          col += uDust*0.05*smoothstep(0.62,0.8,n*m*1.6)*band;
          gl_FragColor = vec4(col*uIntensity, 1.0);
        }
      `,
    });
    const nebula = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 32), this.nebulaMat);
    nebula.renderOrder = -10;
    this.group.add(nebula);

    const r = mulberry32(7);
    const pos = new Float32Array(starCount * 3);
    const col = new Float32Array(starCount * 3);
    const size = new Float32Array(starCount);
    const phase = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rad = 1200 + r() * 400;
      pos.set([rad * s * Math.cos(th), rad * u, rad * s * Math.sin(th)], i * 3);
      const t = r();
      const c = t < 0.15 ? [1, 0.82, 0.62] : t < 0.3 ? [0.7, 0.8, 1] : [0.95, 0.95, 1];
      col.set(c, i * 3);
      size[i] = Math.pow(r(), 6) * 3.2 + 0.7;
      phase[i] = r() * 6.28;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float phase; attribute vec3 color;
        uniform float uTime; uniform float uPixel;
        varying vec3 vCol; varying float vTw;
        void main(){
          vCol = color;
          vTw = 0.75 + 0.25*sin(uTime*1.7 + phase*3.0);
          gl_PointSize = size * uPixel * 1.6;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying vec3 vCol; varying float vTw;
        void main(){
          float d = length(gl_PointCoord-0.5);
          float a = smoothstep(0.5,0.0,d);
          gl_FragColor = vec4(vCol*vTw, a*uOpacity);
        }
      `,
    });
    const stars = new THREE.Points(g, this.starMat);
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    this.group.add(stars);
  }

  setPixelRatio(pr: number): void {
    this.starMat.uniforms.uPixel.value = pr;
  }

  setMood(a: number, b: number, intensity = 1): void {
    (this.nebulaMat.uniforms.uTintA.value as THREE.Color).setHex(a);
    (this.nebulaMat.uniforms.uTintB.value as THREE.Color).setHex(b);
    this.nebulaMat.uniforms.uIntensity.value = intensity;
  }

  setIntensity(v: number): void {
    this.nebulaMat.uniforms.uIntensity.value = v;
    this.starMat.uniforms.uOpacity.value = Math.min(1, v + 0.2);
  }

  update(t: number, camera: THREE.Camera): void {
    this.nebulaMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uTime.value = t;
    // 天穹跟随摄像机，永远在无限远
    this.group.position.copy(camera.position);
  }
}
