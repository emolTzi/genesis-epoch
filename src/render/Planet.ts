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
  private haloMat: THREE.ShaderMaterial;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
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
        varying vec3 vPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vT; varying vec3 vB;
        void main(){
          vPos = position; vUv = uv;
          vN = normalize(mat3(modelMatrix) * normal);
          // 切平面基（与片元着色器中的局部基一致），转到世界空间供凹凸使用
          vec3 p = normalize(position);
          vec3 t = normalize(cross(p, abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vT = normalize(mat3(modelMatrix) * t);
          vB = normalize(mat3(modelMatrix) * cross(p, t));
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
        varying vec3 vPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vT; varying vec3 vB;
        ${NOISE3D}
        // 地表高程：域扭曲的大陆 + 山脊多重分形的山脉（内陆才隆起）
        float seaLv(){ return mix(0.25, 0.54, clamp(uSea, 0.0, 1.0)); }
        float continent(vec3 p){
          vec3 q = p * 1.5 + uSeed * 0.6;
          vec3 w = vec3(fbm4(q + 1.7), fbm4(q + 9.2), fbm4(q + 4.4)) - 0.5;
          return fbm(p * 2.1 + uSeed + w * 0.5);
        }
        float relief(vec3 p, float inland){
          float r = 1.0 - abs(fbm4(p * 5.5 + uSeed * 1.3) * 2.0 - 1.0);
          return r * r * r * inland * 0.9 + fbm4(p * 24.0 + uSeed) * 0.25;
        }
        void main(){
          vec3 p = normalize(vPos);
          float h = continent(p);
          float seaLevel = seaLv();
          float land = smoothstep(seaLevel, seaLevel + 0.01, h);
          float inland = smoothstep(seaLevel + 0.015, seaLevel + 0.12, h);
          float lat = abs(p.y);
          float detail = fbm4(p*9.0 + uSeed*1.7);
          float mtn = relief(p, inland);
          float elev = max(0.0, h - seaLevel) * 2.2 + mtn * 0.35;
          // 气候带：赤道湿润、副热带（约 ±25°）干旱、中纬度湿润；温度随纬度与海拔下降
          float moist = fbm4(p * 3.2 + uSeed + 7.0) + 0.28 * exp(-pow(lat / 0.16, 2.0)) - 0.36 * exp(-pow((lat - 0.42) / 0.13, 2.0)) + 0.1 * exp(-pow((lat - 0.75) / 0.15, 2.0));
          float temp = 1.0 - lat * 1.05 - elev * 0.9;
          vec3 rainforest = vec3(0.035, 0.11, 0.035), forest = vec3(0.07, 0.15, 0.05), boreal = vec3(0.05, 0.1, 0.06);
          vec3 grass = vec3(0.24, 0.27, 0.12), savanna = vec3(0.36, 0.32, 0.16);
          vec3 sand = vec3(0.62, 0.5, 0.32), redSand = vec3(0.52, 0.32, 0.18), tundra = vec3(0.3, 0.29, 0.24);
          vec3 rock = mix(vec3(0.26, 0.22, 0.19), vec3(0.42, 0.37, 0.31), detail);
          vec3 veg = mix(savanna, grass, smoothstep(0.38, 0.52, moist));
          veg = mix(veg, mix(forest, rainforest, smoothstep(0.6, 0.9, temp)), smoothstep(0.5, 0.64, moist));
          veg = mix(veg, boreal, smoothstep(0.42, 0.3, temp) * smoothstep(0.45, 0.55, moist));
          vec3 barren = mix(sand, redSand, smoothstep(0.45, 0.7, detail));
          float desert = smoothstep(0.42, 0.3, moist) * smoothstep(0.35, 0.55, temp);
          vec3 ground = mix(veg, barren, desert);
          ground = mix(ground, tundra, smoothstep(0.36, 0.22, temp));
          ground = mix(ground, rock, smoothstep(0.35, 0.65, mtn) * 0.8);
          // 生命参量低时大陆裸露
          ground = mix(mix(rock, barren, 0.4), ground, clamp(uLife, 0.0, 1.0));
          ground *= 0.85 + 0.3 * fbm4(p * 40.0 + uSeed);
          // 海洋：大陆架浅、远洋深
          vec3 ocean = mix(vec3(0.004, 0.02, 0.07), vec3(0.01, 0.06, 0.13), smoothstep(seaLevel - 0.16, seaLevel - 0.04, h));
          ocean = mix(ocean, vec3(0.03, 0.16, 0.2), smoothstep(seaLevel - 0.03, seaLevel, h));
          float dry = 1.0 - smoothstep(0.0, 0.12, uSea);
          vec3 basin = mix(vec3(0.16,0.12,0.10), rock*0.85, land);
          vec3 col = mix(mix(ocean, ground, land), basin, dry);
          // 高山积雪与极地冰盖
          col = mix(col, vec3(0.86, 0.89, 0.93), smoothstep(0.55, 0.75, mtn + (1.0 - temp) * 0.5) * land);
          float iceLine = mix(0.93, -0.08, clamp(uIce,0.0,1.0));
          float ice = smoothstep(iceLine, iceLine + 0.05, lat + 0.07*(detail - 0.5));
          col = mix(col, vec3(0.84,0.89,0.95), ice);
          vec3 venus = vec3(0.78,0.58,0.30) * (0.75 + 0.45*fbm4(p*4.0 + vec3(uTime*0.02)));
          col = mix(col, venus, uScorch);
          vec3 dayRaw = texture2D(uDay, vUv).rgb;
          // Real Earth: gentle grade, retain ocean/land separation and night-light headroom.
          float dayLum = dot(dayRaw, vec3(0.2126, 0.7152, 0.0722));
          vec3 dayC = dayRaw * vec3(1.045, 1.065, 1.035);
          dayC = pow(max(dayC, vec3(0.0)), vec3(0.94));
          dayC = mix(vec3(dayLum), dayC, 1.12);
          dayC += vec3(0.005, 0.008, 0.012) * (1.0 - dayLum);
          col = mix(col, dayC, uEarth);

          // Carbon/sulfur-rich impact provinces: fractal, subtle strata and only a faint edge glow.
          float hz = 0.0;
          float hzEdge = 0.0;
          for (int i = 0; i < 9; i++) {
            float sd = dot(p, uCaps[i].xyz);
            hz = max(hz, smoothstep(uCaps[i].w - 0.025, uCaps[i].w + 0.018, sd));
            float edgeD = abs(sd - uCaps[i].w);
            hzEdge = max(hzEdge, smoothstep(0.032, 0.0, edgeD));
          }
          float deposit = fbm4(p * 15.0 + uSeed * 2.1);
          float strata = 0.72 + 0.28 * sin((p.x * 2.1 + p.y * 3.7 + p.z * 4.3) * 46.0 + deposit * 8.0);
          float mineral = smoothstep(0.28, 0.72, deposit) * (0.55 + 0.45 * strata);
          vec3 mineralC = mix(col * 0.48, vec3(0.30, 0.14, 0.055), 0.52 + 0.20 * mineral);
          col = mix(col, mineralC, hz * uHazard * (0.32 + 0.30 * mineral));
          col += vec3(0.16, 0.055, 0.012) * hzEdge * uHazard * (0.35 + 0.25 * mineral);

          vec3 N0 = normalize(vN); vec3 L = normalize(uSun); vec3 V = normalize(cameraPosition - vW);
          vec3 T = normalize(cross(p, abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 B = cross(p, T);
          float e0 = mtn;
          float dd = 0.004;
          float e1 = relief(normalize(p + T * dd), inland);
          float e2 = relief(normalize(p + B * dd), inland);
          vec3 bumpW = (normalize(vT) * (e1 - e0) + normalize(vB) * (e2 - e0)) / dd;
          vec3 N = normalize(N0 - bumpW * 0.018 * land * (1.0 - uEarth) * (1.0 - uScorch));
          // Real Earth: derive fine surface relief from the day texture luminance.
          vec2 texel = vec2(1.0 / 1024.0, 1.0 / 512.0);
          float l0 = dot(texture2D(uDay, vUv).rgb, vec3(0.333));
          float lx = dot(texture2D(uDay, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.333));
          float ly = dot(texture2D(uDay, vUv + vec2(0.0, texel.y)).rgb, vec3(0.333));
          float landDetail = smoothstep(0.015, 0.075, dayLum);
          vec3 earthN = normalize(N0 - normalize(vT) * (lx - l0) * 0.95 - normalize(vB) * (ly - l0) * 0.95);
          N = normalize(mix(N, earthN, uEarth * landDetail));
          float ndl = dot(N, L);
          float ndl0 = dot(N0, L);
          float dayMask = smoothstep(-0.15, 0.25, ndl0);
          vec3 lit = col * (0.012 + 1.14*pow(max((ndl + 0.06) / 1.06, 0.0), 0.82));
          // Two-scale cloud shadowing, so clouds never read as a sticker.
          float cloudN = fbm(p*3.2 + uSeed*0.7 + vec3(uTime*0.012, 0.0, uTime*0.006));
          float cloudFine = fbm(p*10.0 + uSeed*1.9 + vec3(uTime*0.018, uTime*0.006, 0.0));
          float cloudShadow = smoothstep(0.48, 0.72, cloudN + (cloudFine - 0.5) * 0.18);
          lit *= 1.0 - cloudShadow * mix(0.28, 0.16, uEarth) * (1.0 - uScorch);
          float mu = max(dot(N, V), 0.0);
          float clear = (1.0 - uDead) * (1.0 - uScorch);
          lit += vec3(0.20, 0.44, 1.0) * pow(1.0 - mu, 2.4) * smoothstep(-0.1, 0.5, ndl) * mix(0.42, 0.30, uEarth) * clear;
          float earthWater = smoothstep(0.015, 0.07, dayC.b - dayC.r * 0.82);
          float water = mix((1.0-land)*(1.0-dry), earthWater, uEarth) * (1.0-ice) * (1.0-uScorch);
          vec3 H = normalize(L + V);
          // Narrow sun glint; real Earth gets a much smaller highlight footprint.
          float fresW = 0.02 + 0.98 * pow(1.0 - max(dot(N0, V), 0.0), 5.0);
          float nh = max(dot(N0, H), 0.0);
          float specTight = mix(220.0, 620.0, uEarth);
          float specGain = mix(1.55, 0.34, uEarth);
          lit += vec3(1.0, 0.92, 0.75) * (pow(nh, specTight) * specGain + pow(nh, 28.0) * mix(0.07, 0.018, uEarth)) * water * max(ndl0, 0.0);
          lit += vec3(0.23, 0.38, 0.62) * fresW * water * 0.22 * dayMask;

          float coast = smoothstep(seaLevel + 0.07, seaLevel + 0.005, h);
          float cityBase = smoothstep(0.52, 0.66, fbm4(p*9.0 + uSeed * 2.3) + coast * 0.18) * smoothstep(0.75, 0.2, lat);
          float cityN = cityBase * smoothstep(0.45, 0.75, fbm4(p*60.0 + uSeed)) * land * (1.0-ice) * (1.0-uScorch) * (1.0-dry) * (1.0 - desert * 0.7);
          float nightL = dot(texture2D(uNight, vUv).rgb, vec3(0.333));
          float cityTex = smoothstep(0.035, 0.46, nightL);
          float cities = mix(cityN, cityTex * (0.72 + 0.55 * fbm4(p * 75.0 + uSeed)), uEarth);
          vec3 cityTint = mix(vec3(1.0, 0.66, 0.28), vec3(1.0, 0.80, 0.48), smoothstep(0.2, 0.8, nightL));
          vec3 lights = cityTint * cities * uCity * (1.0 - dayMask) * mix(4.2, 5.2, uEarth) * (1.0 - uDead);
          lit += vec3(0.012, 0.020, 0.038) * nightL * (1.0 - dayMask) * (1.0 - uEarth);

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
          // 域扭曲叠加细碎的卷云，边缘更锐利
          vec3 w = vec3(fbm4(p * 6.0 + uSeed + uTime * 0.01), fbm4(p * 6.0 + uSeed + 5.2), fbm4(p * 6.0 + uSeed + 9.7)) - 0.5;
          float fine = fbm4(p * 14.0 + w * 1.4 + uSeed * 0.3);
          n = n * 0.82 + fine * 0.22 - 0.04;
          float cover = mix(0.72, 0.38, clamp(uCloud,0.0,1.0));
          float a = smoothstep(cover, cover + 0.12, n) * (0.62 + 0.38 * smoothstep(0.3, 0.7, fine));
          a = max(a, uScorch*0.92);
          float ndl = dot(normalize(vN), normalize(uSun));
          vec3 c = mix(vec3(0.86), vec3(0.95,0.8,0.5), uScorch);
          c = mix(c, vec3(0.45,0.42,0.42), uDead*0.6);
          vec3 lit = c * (0.02 + 1.0*max(ndl, 0.0));
          gl_FragColor = vec4(lit, a * (0.72 - 0.42*uEarth) * uOpacity);
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

    // 外层光晕：越过行星边缘的大气辉光，向光面明亮、晨昏线泛暖、背光面幽暗
    this.haloMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: { uSun: this.mat.uniforms.uSun, uScorch: this.mat.uniforms.uScorch, uDead: this.mat.uniforms.uDead, uEarth: this.mat.uniforms.uEarth, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vNv; varying vec3 vNw;
        void main(){ vNv = normalize(normalMatrix * normal); vNw = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uScorch; uniform float uDead; uniform float uOpacity; uniform float uEarth;
        varying vec3 vNv; varying vec3 vNw;
        void main(){
          float k = clamp(-normalize(vNv).z / 0.5, 0.0, 1.0);
          float i = pow(k, 1.9);
          float s = dot(normalize(vNw), normalize(uSun));
          float day = smoothstep(-0.35, 0.45, s);
          vec3 c = mix(vec3(0.035, 0.07, 0.28), vec3(0.24, 0.58, 1.0), day);
          c += vec3(1.0, 0.45, 0.16) * exp(-s*s/0.045) * mix(0.4, 0.20, uEarth);
          c = mix(c, vec3(1.0, 0.62, 0.3), uScorch * 0.8);
          c = mix(c, vec3(0.32, 0.3, 0.32), uDead * 0.75);
          gl_FragColor = vec4(c * i * (0.18 + 1.35 * day), i * uOpacity * mix(1.0, 0.72, uEarth));
        }
      `,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.17, segments / 2, segments / 4), this.haloMat);

    this.spin.add(this.surface, clouds);
    this.group.add(this.spin, atmo, halo);
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
    this.haloMat.uniforms.uOpacity.value = a;
    this.group.visible = a > 0.002;
  }

  /** 世界坐标点转换为行星本体坐标中的单位方向（随自转一起转动）。 */
  localDir(world: THREE.Vector3): [number, number, number] {
    const v = this.surface.worldToLocal(world.clone()).normalize();
    return [v.x, v.y, v.z];
  }

  update(dt: number, t: number, cam?: THREE.Camera): void {
    if (cam) {
      // 太阳始终位于镜头左前上方：约六成日面朝向观众，晨昏线与夜面灯火同时入画
      this.group.getWorldPosition(this.tmpA);
      cam.getWorldPosition(this.tmpB).sub(this.tmpA).setY(0).normalize();
      const a = -1.05;
      const sun = this.mat.uniforms.uSun.value as THREE.Vector3;
      const want = this.tmpA.set(this.tmpB.x * Math.cos(a) - this.tmpB.z * Math.sin(a), 0.46, this.tmpB.x * Math.sin(a) + this.tmpB.z * Math.cos(a)).normalize();
      sun.lerp(want, Math.min(1, dt * 2)).normalize();
    }
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
