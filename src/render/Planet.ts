// 程序化行星：海陆、冰盖、植被、城市灯火、失控温室、灭绝灰烬、撞击沉积区，
// 终章可平滑过渡到 NASA 公有领域的真实地球影像。

import * as THREE from 'three';
import { NOISE3D } from './glsl';
import type { Cap } from '../sim/kpg';
import dayUrl from '../assets/textures/earth_day.jpg';
import nightUrl from '../assets/textures/earth_night.jpg';

export interface PlanetLook {
  sea: number;
  ice: number;
  life: number;
  city: number;
  scorch: number;
  earth: number;
  hazard: number;
  dead: number;
  cloud: number;
  scar: number;
}

export const LOOK_EARTHLIKE: PlanetLook = {
  sea: 1, ice: 0.12, life: 0.85, city: 0, scorch: 0, earth: 0, hazard: 0, dead: 0, cloud: 0.5, scar: 0,
};

const loader = new THREE.TextureLoader();
let dayTex: THREE.Texture | null = null;
let nightTex: THREE.Texture | null = null;
function textures(): [THREE.Texture, THREE.Texture] {
  if (!dayTex) {
    dayTex = loader.load(dayUrl);
    dayTex.colorSpace = THREE.SRGBColorSpace;
    nightTex = loader.load(nightUrl);
    nightTex.colorSpace = THREE.SRGBColorSpace;
  }
  return [dayTex, nightTex!];
}

export class Planet {
  readonly group = new THREE.Group();
  /** 承载海陆的球体，用于射线拾取。 */
  readonly surface: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private atmoMat: THREE.ShaderMaterial;
  readonly spin = new THREE.Group();
  look: PlanetLook = { ...LOOK_EARTHLIKE };
  target: PlanetLook = { ...LOOK_EARTHLIKE };
  spinRate = 0.05;

  constructor(seed = 1, segments = 128) {
    const [day, night] = textures();
    const caps = Array.from({ length: 9 }, () => new THREE.Vector4(0, 1, 0, 2));
    this.mat = new THREE.ShaderMaterial({
      transparent: false,
      uniforms: {
        uSun: { value: new THREE.Vector3(-0.8, 0.3, 0.5).normalize() },
        uTime: { value: 0 },
        uSeed: { value: new THREE.Vector3(seed * 1.37 % 10, seed * 2.11 % 10, seed * 0.73 % 10) },
        uSea: { value: 1 }, uIce: { value: 0.12 }, uLife: { value: 0.85 }, uCity: { value: 0 },
        uScorch: { value: 0 }, uEarth: { value: 0 }, uHazard: { value: 0 }, uDead: { value: 0 },
        uScar: { value: 0 },
        uCaps: { value: caps },
        uImpact: { value: new THREE.Vector4(0, 0, 1, 0) },
        uDay: { value: day }, uNight: { value: night },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){
          vPos = position; vUv = uv;
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uTime; uniform vec3 uSeed;
        uniform float uSea; uniform float uIce; uniform float uLife; uniform float uCity; uniform float uScorch;
        uniform float uEarth; uniform float uHazard; uniform float uDead; uniform float uScar; uniform float uOpacity;
        uniform vec4 uCaps[9]; uniform vec4 uImpact;
        uniform sampler2D uDay; uniform sampler2D uNight;
        varying vec3 vPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        ${NOISE3D}
        void main(){
          vec3 p = normalize(vPos);
          float h = fbm(p*2.1 + uSeed);
          float seaLevel = mix(0.25, 0.555, clamp(uSea,0.0,1.0));
          float land = smoothstep(seaLevel, seaLevel + 0.012, h);
          float lat = abs(p.y);
          float detail = fbm4(p*9.0 + uSeed*1.7);
          vec3 ocean = mix(vec3(0.008,0.035,0.10), vec3(0.03,0.16,0.29), smoothstep(seaLevel-0.12, seaLevel, h));
          vec3 rock = mix(vec3(0.28,0.22,0.18), vec3(0.50,0.42,0.33), detail);
          vec3 green = mix(vec3(0.08,0.21,0.08), vec3(0.22,0.31,0.13), detail);
          float desert = smoothstep(0.55, 0.7, fbm4(p*3.0 + 7.0)) * smoothstep(0.55, 0.12, lat);
          vec3 ground = mix(rock, green, clamp(uLife,0.0,1.0) * (1.0 - desert*0.85));
          float dry = 1.0 - smoothstep(0.0, 0.12, uSea);
          vec3 basin = mix(vec3(0.16,0.12,0.10), rock*0.85, land);
          vec3 col = mix(mix(ocean, ground, land), basin, dry);
          float iceLine = mix(0.93, -0.08, clamp(uIce,0.0,1.0));
          float ice = smoothstep(iceLine, iceLine + 0.05, lat + 0.07*(detail - 0.5));
          col = mix(col, vec3(0.84,0.89,0.95), ice);
          vec3 venus = vec3(0.78,0.58,0.30) * (0.75 + 0.45*fbm4(p*4.0 + vec3(uTime*0.02)));
          col = mix(col, venus, uScorch);
          vec3 dayC = texture2D(uDay, vUv).rgb;
          col = mix(col, dayC, uEarth);
          float hz = 0.0;
          for (int i = 0; i < 9; i++) { hz = max(hz, step(uCaps[i].w, dot(p, uCaps[i].xyz))); }
          float stripes = step(0.5, fract((p.x + p.y*0.6 + p.z) * 30.0));
          col = mix(col, vec3(1.0,0.42,0.12) * (0.55 + 0.45*stripes), hz * uHazard * 0.7);

          vec3 N = normalize(vN); vec3 L = normalize(uSun); vec3 V = normalize(cameraPosition - vW);
          float ndl = dot(N, L);
          float dayMask = smoothstep(-0.15, 0.25, ndl);
          vec3 lit = col * (0.02 + 0.95*max(ndl, 0.0));
          float earthWater = smoothstep(0.02, 0.08, dayC.b - dayC.r);
          float water = mix((1.0-land)*(1.0-dry), earthWater, uEarth) * (1.0-ice) * (1.0-uScorch);
          vec3 H = normalize(L + V);
          lit += vec3(1.0,0.9,0.7) * pow(max(dot(N,H),0.0), 110.0) * water * 0.32 * max(ndl,0.0);

          float cityN = smoothstep(0.6, 0.74, fbm4(p*22.0 + uSeed)) * land * (1.0-ice) * (1.0-uScorch) * (1.0-dry);
          float nightL = dot(texture2D(uNight, vUv).rgb, vec3(0.333));
          float cities = mix(cityN, smoothstep(0.08, 0.6, nightL) * 1.4, uEarth);
          vec3 lights = vec3(1.0,0.66,0.28) * cities * uCity * (1.0 - dayMask) * 2.6 * (1.0 - uDead);

          lit = mix(lit, lit*vec3(0.5,0.47,0.46) + vec3(0.025,0.018,0.016)*(1.0-dayMask), uDead*0.8);
          vec3 idir = normalize(uImpact.xyz);
          float ia = acos(clamp(dot(p, idir), -1.0, 1.0));
          float glow = exp(-ia*ia/0.003) * uImpact.w;
          float scar = exp(-ia*ia/0.03) * uScar;
          lit = mix(lit, lit*0.3 + vec3(0.03,0.01,0.0), scar);
          vec3 emiss = lights + vec3(1.0,0.48,0.12) * glow * 4.0;
          gl_FragColor = vec4(lit + emiss, uOpacity);
        }
      `,
    });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(1, segments, segments / 2), this.mat);

    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uSun: this.mat.uniforms.uSun, uTime: this.mat.uniforms.uTime, uSeed: this.mat.uniforms.uSeed,
        uCloud: { value: 0.5 }, uScorch: this.mat.uniforms.uScorch, uDead: this.mat.uniforms.uDead,
        uEarth: this.mat.uniforms.uEarth, uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos; varying vec3 vN;
        void main(){ vPos = position; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uTime; uniform vec3 uSeed; uniform float uCloud; uniform float uScorch;
        uniform float uDead; uniform float uEarth; uniform float uOpacity;
        varying vec3 vPos; varying vec3 vN;
        ${NOISE3D}
        void main(){
          vec3 p = normalize(vPos);
          float n = fbm(p*3.2 + uSeed*0.7 + vec3(uTime*0.012, 0.0, uTime*0.006));
          float cover = mix(0.72, 0.38, clamp(uCloud,0.0,1.0));
          float a = smoothstep(cover, cover + 0.16, n);
          a = max(a, uScorch*0.92);
          float ndl = dot(normalize(vN), normalize(uSun));
          vec3 c = mix(vec3(0.86), vec3(0.95,0.8,0.5), uScorch);
          c = mix(c, vec3(0.45,0.42,0.42), uDead*0.6);
          vec3 lit = c * (0.02 + 1.0*max(ndl, 0.0));
          gl_FragColor = vec4(lit, a * (0.72 - 0.3*uEarth) * uOpacity);
        }
      `,
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, segments / 2, segments / 4), this.cloudMat);

    this.atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: {
        uSun: this.mat.uniforms.uSun, uScorch: this.mat.uniforms.uScorch, uDead: this.mat.uniforms.uDead,
        uIce: this.mat.uniforms.uIce, uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vW;
        void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uScorch; uniform float uDead; uniform float uIce; uniform float uOpacity;
        varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float f = pow(1.0 - max(dot(normalize(vN), V), 0.0), 2.4);
          float s = smoothstep(-0.35, 0.6, dot(normalize(vN), normalize(uSun)));
          vec3 c = mix(vec3(0.12,0.24,0.7), vec3(0.35,0.8,1.0), s);
          c = mix(c, vec3(1.0,0.6,0.25), uScorch);
          c = mix(c, vec3(0.5,0.5,0.55), uDead*0.7);
          c = mix(c, vec3(0.7,0.85,1.0), uIce*0.3);
          gl_FragColor = vec4(c * f * (0.12 + 0.75*s), f * 0.8 * uOpacity);
        }
      `,
    });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, segments / 2, segments / 4), this.atmoMat);

    this.spin.add(this.surface, clouds);
    this.group.add(this.spin, atmo);
  }

  setSun(dir: THREE.Vector3): void {
    (this.mat.uniforms.uSun.value as THREE.Vector3).copy(dir).normalize();
  }

  setCaps(caps: Cap[]): void {
    const arr = this.mat.uniforms.uCaps.value as THREE.Vector4[];
    caps.slice(0, 9).forEach((c, i) => arr[i].set(c.dir[0], c.dir[1], c.dir[2], c.cosR));
  }

  setImpact(dir: [number, number, number], strength: number): void {
    (this.mat.uniforms.uImpact.value as THREE.Vector4).set(dir[0], dir[1], dir[2], strength);
  }

  setLook(l: Partial<PlanetLook>, immediate = false): void {
    Object.assign(this.target, l);
    if (immediate) Object.assign(this.look, l);
  }

  setOpacity(a: number): void {
    this.mat.uniforms.uOpacity.value = a;
    this.mat.transparent = a < 0.999;
    this.cloudMat.uniforms.uOpacity.value = a;
    this.atmoMat.uniforms.uOpacity.value = a;
    this.group.visible = a > 0.002;
  }

  /** 世界坐标点转换为行星本体坐标中的单位方向（随自转一起转动）。 */
  localDir(world: THREE.Vector3): [number, number, number] {
    const v = this.surface.worldToLocal(world.clone()).normalize();
    return [v.x, v.y, v.z];
  }

  update(dt: number, t: number): void {
    const k = Math.min(1, dt * 1.8);
    const u = this.mat.uniforms;
    (Object.keys(this.look) as (keyof PlanetLook)[]).forEach((key) => {
      this.look[key] += (this.target[key] - this.look[key]) * k;
    });
    u.uSea.value = this.look.sea;
    u.uIce.value = this.look.ice;
    u.uLife.value = this.look.life;
    u.uCity.value = this.look.city;
    u.uScorch.value = this.look.scorch;
    u.uEarth.value = this.look.earth;
    u.uHazard.value = this.look.hazard;
    u.uDead.value = this.look.dead;
    u.uScar.value = this.look.scar;
    this.cloudMat.uniforms.uCloud.value = this.look.cloud;
    u.uTime.value = t;
    this.spin.rotation.y += dt * this.spinRate;
  }
}
