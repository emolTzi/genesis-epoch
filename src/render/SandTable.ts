// 第⑤幕：微观文明沙盘的三维呈现（第三版：写实地貌）。
// 一张悬浮在实验室中的大陆，按卫星影像的观感渲染：
//   · 地形：每格 6×6 细分的高度场，叠加山脊多重分形并经水力侵蚀（terrainGen.ts），有真实的山谷、冲积扇与河网；
//   · 着色：群系底色 + 逐像素微地形法线 + 陡坡岩壁与地层 + 带噪声边缘的积雪 + 环境光遮蔽 + 大气透视；
//   · 人类活动：城镇周围的田块拼布、带街道网格的城区地面、按街区排布的建筑（屋舍→石城→砖砌工厂→玻璃高楼）；
//   · 水体：入海河流与小湖；海洋按水深着色，菲涅尔天空反射、太阳闪烁与细浪花；
//   · 植被：上万棵针叶与阔叶树，避开河道、陡坡、田地与城区；
//   · 天气：程序生成的云层在地面投下移动的云影；
//   · 事件：国界、战火与烟、瘟疫、社会变革的光环、核火球与核冬天。
// 全部由推演状态驱动。

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SB_W, SB_H, cellTemp, type Sandbox, type SbEvent } from '../sim/sandbox';
import { TextSprite } from './TextSprite';
import { buildRenderTerrain, SUB, VW, VH, type RenderTerrain } from './terrainGen';

/** 每个格子在世界坐标中的边长。 */
export const CELL = 0.125;
const TW = SB_W * CELL;
const TH = SB_H * CELL;
const HALF_W = TW / 2;
const HALF_H = TH / 2;
const MAX_TREES = 16000;
const MAX_BUILD = 18000;
const MAX_HUTS = 12000;
const MAX_CHIMNEY = 900;
const MAX_SHIPS = 160;
const MAX_ROUTE_SEG = 420 * 8;
const MAX_CARAVANS = 520;
const MAX_FRONT = 700;
const MAX_SMOKE = 900;
/** 人类活动纹理（城区、田地、灯光）的细分倍数。 */
const USUB = 3;
const UW = SB_W * USUB;
const UH = SB_H * USUB;
/** 疆域贴图的细分倍数：边界按噪声抖动，呈现自然的国界线。 */
const OSUB = 4;
const OW = SB_W * OSUB;
const OH = SB_H * OSUB;

/** 卫星影像风格的地表颜色（线性空间近似）。 */
const col = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const C = {
  shoal: col(0.62, 0.58, 0.44), seabed: col(0.07, 0.14, 0.22), beach: col(0.78, 0.72, 0.55),
  grassDry: col(0.52, 0.5, 0.3), grassLush: col(0.27, 0.39, 0.16), forest: col(0.13, 0.24, 0.1), forestDark: col(0.08, 0.17, 0.08),
  tundra: col(0.45, 0.44, 0.36), desert: col(0.78, 0.66, 0.46), desertRed: col(0.7, 0.48, 0.31),
  alpine: col(0.4, 0.37, 0.33), eroded: col(0.5, 0.42, 0.31), drought: col(0.64, 0.53, 0.34), ash: col(0.24, 0.24, 0.26),
};

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 平滑值噪声（0..1）。 */
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
};

function polityColor(hue: number, l = 0.55): THREE.Color {
  return new THREE.Color().setHSL(hue, 0.78, l);
}

/** 着色器共用的噪声函数。 */
const GLSL_NOISE = /* glsl */ `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
  float fbm2(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  float clouds(vec2 p, float t){
    vec2 q = p * 0.55 + vec2(t * 0.012, t * 0.005);
    vec2 w = vec2(fbm2(q + 3.1), fbm2(q + 7.7));
    return fbm2(q * 1.7 + w * 1.6);
  }
`;

interface Fx {
  mesh: THREE.Mesh;
  life: number;
  dur: number;
  max: number;
}

interface Smoke {
  x: number;
  y: number;
  z: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  dark: number;
}

export class SandTable {
  readonly group = new THREE.Group();
  /** 用于拾取的低分辨率地形（不渲染）。 */
  readonly terrainMesh: THREE.Mesh;
  private sb: Sandbox | null = null;
  private rt: RenderTerrain | null = null;
  private terrainGeo: THREE.BufferGeometry;
  private terrainMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private heights = new Float32Array(VW * VH);
  private colors = new Float32Array(VW * VH * 3);
  private aux = new Float32Array(VW * VH * 4);
  /** 细分疆域纹素 → 所属格子（含边界抖动）。 */
  private ownerMap = new Int32Array(OW * OH);
  private ownerSig = '';
  private ownerTex: THREE.DataTexture;
  private paletteTex: THREE.DataTexture;
  /** R：城区；G：田地；B：夜间灯光。 */
  private humanTex: THREE.DataTexture;
  private urban = new Float32Array(UW * UH);
  private farm = new Float32Array(UW * UH);
  private depthTex: THREE.DataTexture;
  /** R：河流强度；G：湖泊。 */
  private waterTex: THREE.DataTexture;
  private uNight = { value: 0 };
  private uTime = { value: 0 };
  private uCloud = { value: 0.75 };
  private sun: THREE.DirectionalLight;
  private sky: THREE.HemisphereLight;
  private trees: THREE.InstancedMesh;
  private pines: THREE.InstancedMesh;
  private builds: THREE.InstancedMesh;
  private huts: THREE.InstancedMesh;
  private chimneys: THREE.InstancedMesh;
  private spires: THREE.InstancedMesh;
  private ships: THREE.InstancedMesh;
  private shipState: { route: number; phase: number; speed: number }[] = [];
  private roadGeo: THREE.BufferGeometry;
  private seaGeo: THREE.BufferGeometry;
  private seaLines: THREE.LineSegments;
  private routePaths: { pts: THREE.Vector3[]; sea: boolean }[] = [];
  private caravanGeo: THREE.BufferGeometry;
  private caravans: THREE.Points;
  private caravanState: { route: number; phase: number; speed: number }[] = [];
  private frontGeo: THREE.BufferGeometry;
  private front: THREE.Points;
  private smokeGeo: THREE.BufferGeometry;
  private smokePts: THREE.Points;
  private smoke: Smoke[] = [];
  private smokeSources: { x: number; y: number; z: number; rate: number; dark: number }[] = [];
  private fx: Fx[] = [];
  private labels: TextSprite[] = [];
  private labelText = new Map<TextSprite, string>();
  private selRing: THREE.Mesh;
  private selBeam: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private opacity = 1;
  private night = 0;
  private nightTarget = 0;
  private lastPaint = -1;
  private lastTrees = -99;
  private shadows = true;
  private quality: string | null = null;
  selected: number | null = null;

  constructor() {
    // ───── 台座：深色台体与细光边 ─────
    const slab = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.24, 0.42, TH + 0.24), new THREE.MeshStandardMaterial({ color: 0x0a0e1c, roughness: 0.45, metalness: 0.7, transparent: true }));
    slab.position.y = -0.55;
    slab.receiveShadow = true;
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(0x3ff2e6).multiplyScalar(1.5), transparent: true, opacity: 0.45 }));
    rim.position.copy(slab.position);
    const tickPts: number[] = [];
    for (let i = 0; i <= SB_W; i += 4) tickPts.push(i * CELL - HALF_W, -0.33, HALF_H + 0.12, i * CELL - HALF_W, -0.33, HALF_H + 0.12 + (i % 12 ? 0.05 : 0.1));
    for (let j = 0; j <= SB_H; j += 4) tickPts.push(-HALF_W - 0.12, -0.33, j * CELL - HALF_H, -HALF_W - 0.12 - (j % 12 ? 0.05 : 0.1), -0.33, j * CELL - HALF_H);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3));
    const ticks = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(0x3ff2e6).multiplyScalar(1.2), transparent: true, opacity: 0.4 }));
    this.group.add(slab, rim, ticks);
    // Holographic under-glow: reads as a projected diorama, not a floating game map.
    const underMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 1 }, uNight: this.uNight },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uOpacity; uniform float uNight; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float edge = smoothstep(1.12, 0.78, max(abs(p.x), abs(p.y)));
          float band = smoothstep(0.12, 0.0, abs(max(abs(p.x), abs(p.y)) - 0.91));
          float sweep = pow(max(0.0, cos(atan(p.y, p.x) * 7.0 + uNight * 2.0)), 10.0);
          vec3 c = mix(vec3(0.06, 0.4, 0.46), vec3(0.44, 0.33, 0.14), uNight);
          float a = (0.16 + 0.24 * sweep) * edge + band * 0.3;
          gl_FragColor = vec4(c * (0.55 + sweep * 0.8), a * uOpacity * (0.35 + 0.45 * uNight));
        }`,
    });
    const underGlow = new THREE.Mesh(new THREE.PlaneGeometry(TW + 1.8, TH + 1.8), underMat);
    underGlow.rotation.x = -Math.PI / 2;
    underGlow.position.y = -0.78;
    underGlow.renderOrder = -2;
    this.group.add(underGlow);
    // Thin luminous perimeter frame.
    const framePts: number[] = [];
    const fw = TW / 2 + 0.16, fh = TH / 2 + 0.16;
    for (const [a, b, c, d] of [[-fw, -fh, fw, -fh], [fw, -fh, fw, fh], [fw, fh, -fw, fh], [-fw, fh, -fw, -fh]]) framePts.push(a, -0.32, b, c, -0.32, d);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(framePts, 3));
    const frame = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: new THREE.Color(0x3ff2e6).multiplyScalar(1.6), transparent: true, opacity: 0.52, blending: THREE.AdditiveBlending }));
    this.group.add(frame);

    // ───── 光照：低角度暖阳勾勒地形，蓝色天光补暗部 ─────
    this.sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
    this.sun.position.set(-6.8, 4.2, 3.8);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -6.2; sc.right = 6.2; sc.top = 6.2; sc.bottom = -6.2; sc.near = 0.5; sc.far = 20;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.01;
    this.sky = new THREE.HemisphereLight(0x9fc4ff, 0x3b3226, 0.65);
    this.group.add(this.sun, this.sun.target, this.sky);

    // ───── 数据纹理 ─────
    this.ownerTex = new THREE.DataTexture(new Uint8Array(OW * OH * 4), OW, OH, THREE.RGBAFormat);
    this.ownerTex.magFilter = this.ownerTex.minFilter = THREE.NearestFilter;
    this.paletteTex = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat);
    this.paletteTex.magFilter = this.paletteTex.minFilter = THREE.NearestFilter;
    this.humanTex = new THREE.DataTexture(new Uint8Array(UW * UH * 4), UW, UH, THREE.RGBAFormat);
    this.humanTex.magFilter = this.humanTex.minFilter = THREE.LinearFilter;
    this.depthTex = new THREE.DataTexture(new Uint8Array(VW * VH * 4), VW, VH, THREE.RGBAFormat);
    this.depthTex.magFilter = this.depthTex.minFilter = THREE.LinearFilter;
    this.waterTex = new THREE.DataTexture(new Uint8Array(VW * VH * 4), VW, VH, THREE.RGBAFormat);
    this.waterTex.magFilter = this.waterTex.minFilter = THREE.LinearFilter;
    for (const t of [this.ownerTex, this.paletteTex, this.humanTex, this.depthTex, this.waterTex]) t.needsUpdate = true;

    // ───── 地形 ─────
    this.terrainGeo = new THREE.PlaneGeometry(TW, TH, VW - 1, VH - 1);
    this.terrainGeo.rotateX(-Math.PI / 2);
    this.terrainGeo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.terrainGeo.setAttribute('aAux', new THREE.BufferAttribute(this.aux, 4));
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, transparent: true });
    this.terrainMat.defines = { DETAIL: 1 };
    const uOwner = { value: this.ownerTex };
    const uPal = { value: this.paletteTex };
    const uHuman = { value: this.humanTex };
    const uWater = { value: this.waterTex };
    const uSize = { value: new THREE.Vector2(TW, TH) };
    const uCells = { value: new THREE.Vector2(OW, OH) };
    this.terrainMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uOwner, uPal, uHuman, uWater, uSize, uCells, uNight: this.uNight, uTime: this.uTime, uCloud: this.uCloud });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aAux; varying vec4 vAux; varying vec3 vTab; varying vec3 vLN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTab = position; vAux = aAux; vLN = objectNormal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vAux; varying vec3 vTab; varying vec3 vLN;
          uniform sampler2D uOwner; uniform sampler2D uPal; uniform sampler2D uHuman; uniform sampler2D uWater;
          uniform vec2 uSize; uniform vec2 uCells; uniform float uNight; uniform float uTime; uniform float uCloud;
          ${GLSL_NOISE}
          vec2 ownRG(vec2 c){ vec4 t = texture2D(uOwner, (c + 0.5) / uCells); return vec2(floor(t.r * 255.0 + 0.5), t.g); }
          float bord(vec2 c, float o){ vec2 n = ownRG(c); return (n.x != o && n.y > 0.5) ? 1.0 : 0.0; }
          vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // 逐像素微地形：用噪声梯度扰动法线，山地强、平原弱
          float isLand = smoothstep(0.0006, 0.004, vTab.y);
          vec3 nW = normalize(vLN);
          #if DETAIL == 1
            vec2 q = vTab.xz * 85.0;
            float b0 = fbm2(q);
            float gx = (fbm2(q + vec2(0.3, 0.0)) - b0) / 0.3;
            float gz = (fbm2(q + vec2(0.0, 0.3)) - b0) / 0.3;
            float rough = 0.25 + 0.75 * smoothstep(0.08, 0.45, 1.0 - nW.y) + smoothstep(0.08, 0.3, vTab.y) * 0.6;
            nW = normalize(nW + vec3(-gx, 0.0, -gz) * 0.32 * rough * isLand);
            normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          #endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float slope = 1.0 - nW.y;
          float m1 = fbm2(vTab.xz * 13.0);
          float m2 = vn(vTab.xz * 240.0);
          diffuseColor.rgb *= mix(1.0, 0.8 + 0.4 * m1, isLand) * mix(1.0, 0.92 + 0.16 * m2, isLand);
          // 陡坡岩壁与地层
          float rock = smoothstep(0.3, 0.55, slope + (m1 - 0.5) * 0.2) * isLand;
          vec3 rockC = mix(vec3(0.33, 0.31, 0.29), vec3(0.52, 0.49, 0.45), m2) * (0.88 + 0.24 * sin(vTab.y * 380.0 + m1 * 7.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, rockC, rock * 0.9);
          // 积雪：噪声边缘，偏好缓坡
          float snow = smoothstep(0.42, 0.62, vAux.w + (m1 - 0.5) * 0.4) * smoothstep(0.8, 0.3, slope) * isLand;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.97), snow);
          // 人类活动：田块拼布与城区
          vec4 hu = texture2D(uHuman, vTab.xz / uSize + 0.5);
          // 田块：各地块朝向不同，大小不一，颜色贴近周围的土地
          float region = floor(vn(vTab.xz * 5.0) * 6.0);
          vec2 fp = rot2(vTab.xz, region * 0.55 + 0.3) * vec2(120.0, 75.0);
          vec2 fi = floor(fp); vec2 ff = fract(fp);
          float fh = h21(fi + region * 13.0);
          vec3 fieldC = diffuseColor.rgb * mix(vec3(1.08, 1.05, 0.82), vec3(0.88, 1.06, 0.84), fh);
          fieldC = mix(fieldC, vec3(0.56, 0.5, 0.34), step(0.82, h21(fi + 3.7)) * 0.7);
          float hedge = 1.0 - smoothstep(0.0, 0.06, min(min(ff.x, 1.0 - ff.x), min(ff.y, 1.0 - ff.y)));
          fieldC *= 1.0 - hedge * 0.18;
          float farm = smoothstep(0.35, 0.7, hu.g + (m1 - 0.5) * 0.45) * isLand * (1.0 - rock) * (1.0 - snow) * smoothstep(0.3, 0.12, slope);
          diffuseColor.rgb = mix(diffuseColor.rgb, fieldC, farm * 0.7);
          vec2 up = rot2(vTab.xz, 0.42) * 240.0;
          vec2 uf = fract(up); vec2 ui = floor(up);
          float street = 1.0 - step(0.14, min(uf.x, uf.y));
          vec3 urbanC = mix(vec3(0.46, 0.44, 0.41), vec3(0.6, 0.57, 0.52), h21(ui));
          urbanC = mix(urbanC, vec3(0.25, 0.25, 0.26), street);
          float urban = smoothstep(0.22, 0.5, hu.r + (m2 - 0.5) * 0.2) * isLand;
          diffuseColor.rgb = mix(diffuseColor.rgb, urbanC, urban * 0.92);
          // 河流与湖泊
          vec4 wt = texture2D(uWater, vTab.xz / uSize + 0.5);
          float riv = smoothstep(0.58, 0.78, wt.r + (m2 - 0.5) * 0.06);
          float lak = smoothstep(0.35, 0.6, wt.g + (m1 - 0.5) * 0.2);
          float wtr = max(riv, lak) * (1.0 - snow * 0.8) * isLand;
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.09, 0.2, 0.25), vec3(0.05, 0.13, 0.2), lak), wtr);
          roughnessFactor = mix(roughnessFactor, 0.1, wtr);
          // 环境光遮蔽
          diffuseColor.rgb *= mix(0.3, 1.0, vAux.x);
          // 云影
          float cs = clouds(vTab.xz, uTime);
          diffuseColor.rgb *= 1.0 - smoothstep(0.5, 0.7, cs) * 0.38 * uCloud * (1.0 - uNight);
          // 国界
          vec2 cc = (vTab.xz / uSize + 0.5) * uCells;
          vec2 ci = floor(cc); vec2 cf = fract(cc);
          float o = ownRG(ci).x;
          if (o > 0.5) {
            float edge = max(
              max(bord(ci + vec2(1.0, 0.0), o) * smoothstep(0.78, 1.0, cf.x), bord(ci - vec2(1.0, 0.0), o) * smoothstep(0.22, 0.0, cf.x)),
              max(bord(ci + vec2(0.0, 1.0), o) * smoothstep(0.78, 1.0, cf.y), bord(ci - vec2(0.0, 1.0), o) * smoothstep(0.22, 0.0, cf.y)));
            vec3 pc = texture2D(uPal, vec2((o - 0.5) / 256.0, 0.5)).rgb;
            diffuseColor.rgb = mix(diffuseColor.rgb, pc, 0.03 + 0.4 * edge);
            totalEmissiveRadiance += pc * edge * (0.07 + uNight * 0.22);
          }
          // 夜景：城区街灯与道路网的暖光
          float li = hu.b;
          float lamp = step(0.7, h21(floor(vTab.xz * 300.0))) * (0.5 + 0.5 * h21(floor(vTab.xz * 300.0) + 7.0));
          totalEmissiveRadiance += vec3(1.0, 0.64, 0.28) * (lamp * 1.05 + street * 0.68 * urban + 0.08) * smoothstep(0.12, 0.66, li) * uNight;
          totalEmissiveRadiance += vec3(1.0, 0.46, 0.16) * urban * urban * uNight * 0.022;
          diffuseColor.rgb *= 1.0 - uNight * 0.62;`)
        .replace('#include <fog_fragment>', `#include <fog_fragment>
          // 大气透视：远处略带蓝灰
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(vec3(0.52, 0.62, 0.74), vec3(0.03, 0.04, 0.08), uNight), smoothstep(5.5, 17.0, length(vViewPosition)) * 0.28);`);
    };
    const terrain = new THREE.Mesh(this.terrainGeo, this.terrainMat);
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    this.group.add(terrain);
    const pickGeo = new THREE.PlaneGeometry(TW, TH, SB_W, SB_H);
    pickGeo.rotateX(-Math.PI / 2);
    this.terrainMesh = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.group.add(this.terrainMesh);

    // ───── 海洋：水深、菲涅尔天空反射、太阳闪烁、浅滩透出海底 ─────
    const waterGeo = new THREE.PlaneGeometry(TW, TH, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: this.uTime, uNight: this.uNight, uOpacity: { value: 1 }, uDepth: { value: this.depthTex }, uSize, uSun: { value: this.sun.position.clone().normalize() } },
      vertexShader: /* glsl */ `
        varying vec3 vPos; varying vec3 vW;
        void main(){ vPos = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uNight; uniform float uOpacity; uniform sampler2D uDepth; uniform vec2 uSize; uniform vec3 uSun;
        varying vec3 vPos; varying vec3 vW;
        ${GLSL_NOISE}
        vec2 waveGrad(vec2 p, float t){
          vec2 g = vec2(0.0);
          float a = 0.022; float f = 38.0;
          for (int i = 0; i < 6; i++) {
            float ang = float(i) * 2.17 + 0.4;
            vec2 d = vec2(cos(ang), sin(ang));
            g += d * cos(dot(p, d) * f + t * (1.0 + float(i) * 0.37)) * a;
            f *= 1.55; a *= 0.72;
          }
          float e = 0.004;
          float n0 = fbm2(p * 60.0 + t * 0.2);
          g += vec2(fbm2(p * 60.0 + vec2(e * 60.0, 0.0) + t * 0.2) - n0, fbm2(p * 60.0 + vec2(0.0, e * 60.0) + t * 0.2) - n0) / e * 0.0009;
          return g;
        }
        void main(){
          vec2 uv = vPos.xz / uSize + 0.5;
          float depth = texture2D(uDepth, uv).r * 0.36;
          if (depth <= 0.0004) discard;
          vec2 g = waveGrad(vPos.xz, uTime);
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 V = normalize(cameraPosition - vW);
          vec3 L = normalize(uSun);
          float cosT = max(dot(N, V), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          vec3 shallow = vec3(0.12, 0.42, 0.44), mid = vec3(0.04, 0.17, 0.26), deep = vec3(0.012, 0.05, 0.12);
          vec3 col = mix(shallow, mid, smoothstep(0.0, 0.03, depth));
          col = mix(col, deep, smoothstep(0.03, 0.22, depth));
          vec3 R = reflect(-V, N);
          vec3 skyC = mix(vec3(0.62, 0.72, 0.84), vec3(0.22, 0.38, 0.66), clamp(R.y, 0.0, 1.0));
          skyC = mix(skyC, vec3(0.02, 0.03, 0.07), uNight);
          col = mix(col, skyC, fres);
          float sd = max(dot(R, L), 0.0);
          col += vec3(1.0, 0.9, 0.72) * (pow(sd, 380.0) * 4.0 + pow(sd, 36.0) * 0.12) * (1.0 - uNight * 0.9);
          float shore = 1.0 - smoothstep(0.0, 0.008, depth);
          float foam = smoothstep(0.62, 0.92, sin(depth * 900.0 - uTime * 2.4 + vn(vPos.xz * 90.0) * 5.0) * 0.5 + 0.5) * shore * vn(vPos.xz * 140.0 + uTime);
          col = mix(col, vec3(0.9, 0.94, 0.96), foam * 0.7 * (1.0 - uNight * 0.6));
          col *= mix(1.0, 0.4, uNight);
          float a = mix(0.35, 0.94, smoothstep(0.0, 0.05, depth));
          gl_FragColor = vec4(col, max(a, fres * 0.9) * uOpacity);
        }`,
    });
    const water = new THREE.Mesh(waterGeo, this.waterMat);
    water.position.y = 0.0012;
    water.renderOrder = 2;
    this.group.add(water);

    // ───── 树木 ─────
    const trunk = new THREE.CylinderGeometry(0.0011, 0.0015, 0.009, 5).translate(0, 0.0045, 0);
    const pineTop = mergeGeometries([new THREE.ConeGeometry(0.0085, 0.022, 7).translate(0, 0.017, 0), new THREE.ConeGeometry(0.006, 0.018, 7).translate(0, 0.027, 0)]);
    const pineGeo = mergeGeometries([trunk.clone(), pineTop]);
    const crown = mergeGeometries([
      new THREE.IcosahedronGeometry(0.0085, 1).scale(1, 0.85, 1).translate(0, 0.016, 0),
      new THREE.IcosahedronGeometry(0.0062, 1).translate(0.004, 0.022, 0.002),
      new THREE.IcosahedronGeometry(0.0058, 1).translate(-0.0035, 0.021, -0.003),
    ]);
    const leafGeo = mergeGeometries([trunk.toNonIndexed(), crown]);
    const treeMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true, color: 0xffffff, transparent: true });
    this.pines = new THREE.InstancedMesh(pineGeo, treeMat, MAX_TREES / 2);
    this.trees = new THREE.InstancedMesh(leafGeo, treeMat, MAX_TREES / 2);
    for (const m of [this.pines, this.trees]) {
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }

    // ───── 建筑 ─────
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    // 坡屋顶民居：墙体白、屋顶以顶点色加深，再乘以实例颜色
    const walls = box.clone().toNonIndexed();
    const roof = new THREE.ConeGeometry(0.76, 0.62, 4).rotateY(Math.PI / 4).translate(0, 1.3, 0).toNonIndexed();
    const tint = (g: THREE.BufferGeometry, r: number, gg: number, b: number) => {
      const n = g.getAttribute('position').count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([r, gg, b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const hutGeo = mergeGeometries([tint(walls, 1, 1, 1), tint(roof, 0.78, 0.5, 0.38)]);
    const stdMat = (rough = 0.8, vc = false) => new THREE.MeshStandardMaterial({ roughness: rough, metalness: 0.02, color: 0xffffff, transparent: true, vertexColors: vc });
    this.huts = new THREE.InstancedMesh(hutGeo, stdMat(0.9, true), MAX_HUTS);
    const winMat = stdMat(0.55);
    winMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = this.uNight;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vNw; varying vec3 vLoc;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLoc = position;
          #ifdef USE_INSTANCING
            vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
            vNw = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
          #else
            vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vNw = normalize(mat3(modelMatrix) * objectNormal);
          #endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vNw; varying vec3 vLoc; uniform float uNight;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float side = 1.0 - abs(vNw.y);
          vec2 g = vec2((vWp.x + vWp.z) * 210.0, vWp.y * 300.0);
          vec2 f = fract(g);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.8) * step(0.5, side) * step(0.04, vLoc.y);
          float lit = step(0.45, h21(floor(g)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.26, 0.32), win * 0.55);
          roughnessFactor = mix(roughnessFactor, 0.2, win);
          // 屋顶略深
          diffuseColor.rgb *= mix(1.0, 0.78, step(0.5, vNw.y));
          totalEmissiveRadiance += vec3(1.0, 0.79, 0.46) * win * lit * uNight * 1.35;`);
    };
    this.builds = new THREE.InstancedMesh(box, winMat, MAX_BUILD);
    this.chimneys = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 8).translate(0, 0.5, 0), stdMat(0.9), MAX_CHIMNEY);
    const spireGeo = mergeGeometries([new THREE.CylinderGeometry(0.32, 0.5, 0.5, 12).translate(0, 0.25, 0), new THREE.CylinderGeometry(0.12, 0.26, 1.5, 12).translate(0, 1.2, 0), new THREE.ConeGeometry(0.12, 0.5, 12).translate(0, 2.2, 0)]);
    const spireMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xf5c66b), emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.5, transparent: true });
    this.spires = new THREE.InstancedMesh(spireGeo, spireMat, 64);
    for (const m of [this.huts, this.builds, this.chimneys, this.spires]) {
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }

    // ───── 船只 ─────
    const hull = new THREE.BoxGeometry(0.026, 0.006, 0.009).translate(0, 0.003, 0);
    const sail = new THREE.ConeGeometry(0.007, 0.022, 3).translate(0, 0.017, 0);
    this.ships = new THREE.InstancedMesh(mergeGeometries([hull, sail]), new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.6, transparent: true }), MAX_SHIPS);
    this.ships.count = 0;
    this.ships.castShadow = true;
    this.ships.frustumCulled = false;
    this.group.add(this.ships);

    // ───── 道路与海路 ─────
    this.roadGeo = new THREE.BufferGeometry();
    this.roadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_ROUTE_SEG * 6 * 3), 3));
    this.roadGeo.setAttribute('aVol', new THREE.BufferAttribute(new Float32Array(MAX_ROUTE_SEG * 6), 1));
    const roadMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uNight: this.uNight, uOpacity: { value: 1 } },
      vertexShader: 'attribute float aVol; varying float vVol; void main(){ vVol = aVol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uNight; uniform float uOpacity; varying float vVol; void main(){ vec3 day = vec3(0.34, 0.31, 0.27); vec3 nightC = vec3(1.0, 0.62, 0.28) * (0.5 + vVol); gl_FragColor = vec4(mix(day, nightC, uNight), (0.5 + 0.35 * vVol) * uOpacity); }',
    });
    const roads = new THREE.Mesh(this.roadGeo, roadMat);
    roads.renderOrder = 3;
    roads.frustumCulled = false;
    this.group.add(roads);
    this.seaGeo = new THREE.BufferGeometry();
    this.seaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_ROUTE_SEG * 2 * 3), 3));
    this.seaLines = new THREE.LineSegments(this.seaGeo, new THREE.LineDashedMaterial({ color: new THREE.Color(0x9fe8ff).multiplyScalar(1.2), dashSize: 0.03, gapSize: 0.03, transparent: true, opacity: 0.35 }));
    this.seaLines.frustumCulled = false;
    this.seaLines.renderOrder = 4;
    this.group.add(this.seaLines);

    // ───── 光点：商队、前线 ─────
    this.caravanGeo = new THREE.BufferGeometry();
    this.caravanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_CARAVANS * 3), 3));
    this.caravanGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_CARAVANS * 3), 3));
    this.caravanGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_CARAVANS).fill(0.018), 1));
    this.caravans = new THREE.Points(this.caravanGeo, glowMaterial());
    this.caravans.frustumCulled = false;
    this.caravans.renderOrder = 6;
    this.group.add(this.caravans);
    this.frontGeo = new THREE.BufferGeometry();
    this.frontGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_FRONT * 3), 3));
    this.frontGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_FRONT * 3), 3));
    this.frontGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_FRONT).fill(0.06), 1));
    this.front = new THREE.Points(this.frontGeo, glowMaterial());
    this.front.frustumCulled = false;
    this.front.renderOrder = 7;
    this.group.add(this.front);

    // ───── 烟 ─────
    this.smokeGeo = new THREE.BufferGeometry();
    this.smokeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SMOKE * 3), 3));
    this.smokeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SMOKE * 3), 3));
    this.smokeGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_SMOKE), 1));
    this.smokeGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX_SMOKE), 1));
    this.smokePts = new THREE.Points(this.smokeGeo, smokeMaterial());
    this.smokePts.frustumCulled = false;
    this.smokePts.renderOrder = 8;
    this.group.add(this.smokePts);

    // ───── 云层：域扭曲 fbm，镜头靠近时淡出 ─────
    const cloudGeo = new THREE.PlaneGeometry(TW, TH, 1, 1);
    cloudGeo.rotateX(-Math.PI / 2);
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: this.uTime, uNight: this.uNight, uCloud: this.uCloud, uOpacity: { value: 1 }, uSize, uScale: { value: 1 } },
      vertexShader: /* glsl */ `varying vec3 vPos; varying vec3 vW; void main(){ vPos = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uNight; uniform float uCloud; uniform float uOpacity; uniform vec2 uSize; uniform float uScale;
        varying vec3 vPos; varying vec3 vW;
        ${GLSL_NOISE}
        void main(){
          float c = clouds(vPos.xz, uTime);
          float fine = fbm2(vPos.xz * 3.8 + vec2(uTime * 0.03, -uTime * 0.018));
          float feather = fbm2(vPos.xz * 11.0 + vec2(-uTime * 0.05, uTime * 0.022));
          c = c + (fine - 0.5) * 0.15 + (feather - 0.5) * 0.055;
          float a = smoothstep(0.54, 0.80, c) * (0.45 + 0.55 * smoothstep(0.38, 0.72, fine));
          float edge = smoothstep(0.0, 0.08, 0.5 - abs(vPos.x / uSize.x)) * smoothstep(0.0, 0.08, 0.5 - abs(vPos.z / uSize.y));
          float near = smoothstep(1.4 * uScale, 4.2 * uScale, distance(cameraPosition, vW));
          vec3 col = mix(vec3(0.70, 0.74, 0.80), vec3(0.99, 1.0, 1.0), smoothstep(0.52, 0.88, c));
          col = mix(col, vec3(0.08, 0.09, 0.12), uNight * 0.9);
          gl_FragColor = vec4(col, a * 0.54 * mix(1.0, 0.42, uNight) * edge * near * uCloud * uOpacity);
        }`,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, this.cloudMat);
    cloudMesh.position.y = 1.1;
    cloudMesh.renderOrder = 9;
    cloudMesh.onBeforeRender = () => {
      this.cloudMat.uniforms.uScale.value = Math.max(0.2, this.group.scale.x);
    };
    this.group.add(cloudMesh);

    // ───── 特效环与选中标记 ─────
    const ringGeo = new THREE.RingGeometry(0.8, 1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.renderOrder = 10;
      this.group.add(m);
      this.fx.push({ mesh: m, life: 0, dur: 1, max: 1 });
    }
    this.selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ff2e6).multiplyScalar(2), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    this.selRing.visible = false;
    this.selBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ff2e6).multiplyScalar(2), transparent: true, opacity: 0.7, depthWrite: false }));
    this.selBeam.visible = false;
    this.group.add(this.selRing, this.selBeam);
    for (let i = 0; i < 8; i++) {
      const l = new TextSprite('', { height: 0.017 });
      (l.sprite.material as THREE.SpriteMaterial).sizeAttenuation = false;
      l.sprite.visible = false;
      this.labels.push(l);
      this.group.add(l.sprite);
    }
  }

  /** 连接渲染器：开启阴影（低画质时关闭阴影与逐像素细节）。 */
  attach(renderer: THREE.WebGLRenderer, quality: 'high' | 'mid' | 'low'): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.sun.shadow.map?.dispose();
    this.shadows = quality !== 'low';
    renderer.shadowMap.enabled = this.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = this.shadows;
    this.sun.shadow.mapSize.set(quality === 'high' ? 4096 : 2048, quality === 'high' ? 4096 : 2048);
    this.sun.shadow.map = null;
    this.terrainMat.defines = { DETAIL: quality === 'low' ? 0 : 1 };
    this.terrainMat.needsUpdate = true;
    if (this.sb) this.lastTrees = -99;
  }

  /* ───── 坐标 ───── */

  /** 高度场双线性插值；fx、fy 以格子为单位。 */
  heightAt(fx: number, fy: number): number {
    const gx = Math.max(0, Math.min(VW - 1.001, fx * SUB));
    const gy = Math.max(0, Math.min(VH - 1.001, fy * SUB));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    const i = y0 * VW + x0;
    const h = this.heights;
    return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - ty) + (h[i + VW] * (1 - tx) + h[i + VW + 1] * tx) * ty;
  }

  /** 某处的地表属性（最近顶点）。 */
  private vertexAt(fx: number, fy: number): number {
    const gx = Math.max(0, Math.min(VW - 1, Math.round(fx * SUB)));
    const gy = Math.max(0, Math.min(VH - 1, Math.round(fy * SUB)));
    return gy * VW + gx;
  }

  private xyPos(fx: number, fy: number, lift = 0): THREE.Vector3 {
    return new THREE.Vector3(fx * CELL - HALF_W, Math.max(0, this.heightAt(fx, fy)) + lift, fy * CELL - HALF_H);
  }

  /** 格子中心的台面局部坐标。 */
  cellPos(cell: number, lift = 0): THREE.Vector3 {
    return this.xyPos((cell % SB_W) + 0.5, Math.floor(cell / SB_W) + 0.5, lift);
  }

  cellFromLocal(p: THREE.Vector3): number | null {
    const x = Math.floor((p.x + HALF_W) / CELL);
    const y = Math.floor((p.z + HALF_H) / CELL);
    if (x < 0 || y < 0 || x >= SB_W || y >= SB_H) return null;
    return y * SB_W + x;
  }

  /* ───── 绑定推演 ───── */

  bind(sb: Sandbox): void {
    this.sb = sb;
    const tr = sb.terrain;
    const rt = buildRenderTerrain(tr, sb.seed);
    this.rt = rt;
    this.heights.set(rt.heights);
    const pos = this.terrainGeo.getAttribute('position') as THREE.BufferAttribute;
    const depth = this.depthTex.image.data as Uint8Array;
    for (let i = 0; i < VW * VH; i++) {
      const h = this.heights[i];
      pos.setY(i, h);
      const d = Math.max(0, Math.min(1, -h / 0.36));
      depth[i * 4] = Math.round(d * 255);
      depth[i * 4 + 3] = 255;
      this.aux[i * 4] = rt.ao[i];
      this.aux[i * 4 + 1] = rt.river[i];
      this.aux[i * 4 + 2] = rt.lake[i];
      const wd = this.waterTex.image.data as Uint8Array;
      wd[i * 4] = Math.round(rt.river[i] * 255);
      wd[i * 4 + 1] = rt.lake[i] > 0 ? 255 : 0;
      wd[i * 4 + 3] = 255;
    }
    this.waterTex.needsUpdate = true;
    pos.needsUpdate = true;
    this.terrainGeo.computeVertexNormals();
    this.terrainGeo.computeBoundingSphere();
    // 疆域细分纹素：按噪声抖动映射到格子，G 通道标记陆地
    const od = this.ownerTex.image.data as Uint8Array;
    for (let oy = 0; oy < OH; oy++) {
      for (let ox = 0; ox < OW; ox++) {
        const j = oy * OW + ox;
        const fx = (ox + 0.5) / OSUB + (vnoise(ox * 0.17, oy * 0.17) - 0.5) * 1.1 + (vnoise(ox * 0.5 + 40, oy * 0.5) - 0.5) * 0.35;
        const fy = (oy + 0.5) / OSUB + (vnoise(ox * 0.17 + 91, oy * 0.17 + 13) - 0.5) * 1.1 + (vnoise(ox * 0.5, oy * 0.5 + 40) - 0.5) * 0.35;
        let cx = Math.max(0, Math.min(SB_W - 1, Math.floor(fx)));
        let cy = Math.max(0, Math.min(SB_H - 1, Math.floor(fy)));
        if (!tr.land[cy * SB_W + cx]) {
          cx = Math.min(SB_W - 1, Math.floor(ox / OSUB));
          cy = Math.min(SB_H - 1, Math.floor(oy / OSUB));
        }
        const landHere = this.heightAt((ox + 0.5) / OSUB, (oy + 0.5) / OSUB) > 0.004;
        this.ownerMap[j] = landHere ? cy * SB_W + cx : -1;
        od[j * 4 + 1] = landHere ? 255 : 0;
        od[j * 4 + 3] = 255;
      }
    }
    this.ownerSig = '';
    this.depthTex.needsUpdate = true;
    // 拾取网格贴合高度
    const pp = this.terrainMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let j = 0; j <= SB_H; j++) for (let i = 0; i <= SB_W; i++) pp.setY(j * (SB_W + 1) + i, Math.max(0, this.heightAt(i, j)));
    pp.needsUpdate = true;
    this.terrainMesh.geometry.computeBoundingSphere();
    this.terrainMesh.geometry.computeBoundingBox();
    this.lastPaint = -1;
    this.lastTrees = -99;
    this.selected = null;
    this.smoke.length = 0;
    this.fx.forEach((f) => (f.mesh.visible = false));
    this.sync(true);
  }

  /* ───── 每步同步 ───── */

  sync(force = false): void {
    const sb = this.sb;
    if (!sb) return;
    if (force || sb.t - this.lastPaint >= 6 || sb.done) {
      this.paintTerrain();
      this.lastPaint = sb.t;
    }
    this.paintOwners();
    this.paintHuman();
    if (force || sb.t - this.lastTrees >= 8 || sb.done) {
      this.layoutTrees();
      this.lastTrees = sb.t;
    }
    this.layoutCities();
    this.layoutRoutes();
    this.layoutFront();
    this.layoutLabels();
    this.nightTarget = sb.era >= 4 ? Math.min(0.94, 0.74 + (sb.era - 4) * 0.045) : sb.era >= 3 ? 0.26 : 0;
    if (sb.fate === '自我毁灭') this.nightTarget = 0.98;
    this.uCloud.value = sb.nuclearWinter > 0 ? 1 : 0.75;
  }

  /** 顶点颜色：温度、湿度、海拔连续混合群系；积雪强度写入 aAux.w，由片元着色器做噪声边缘。 */
  private paintTerrain(): void {
    const sb = this.sb!;
    const rt = this.rt!;
    const g = sb.baseTemp + sb.dT - sb.nuclearWinter * 18;
    const c = new THREE.Color();
    const tmp = new THREE.Color();
    for (let vy = 0; vy < VH; vy++) {
      const cy = Math.min(SB_H - 1, Math.floor(vy / SUB));
      for (let vx = 0; vx < VW; vx++) {
        const i = vy * VW + vx;
        const h = this.heights[i];
        const cx = Math.min(SB_W - 1, Math.floor(vx / SUB));
        const cell = cy * SB_W + cx;
        const n = vnoise(vx * 0.15, vy * 0.15);
        let snow = 0;
        if (h <= 0) {
          c.copy(C.shoal).lerp(C.seabed, smooth(0, 0.08, -h));
        } else {
          const e = Math.max(0, rt.elev[i]);
          const t = cellTemp(g, vy / SUB - 0.5, e);
          const m = rt.moist[i];
          c.copy(C.grassDry).lerp(C.grassLush, smooth(0.3, 0.62, m));
          const forest = smooth(0.48, 0.62, m) * smooth(268, 277, t) * (1 - smooth(0.2, 0.3, e));
          tmp.copy(C.forest).lerp(C.forestDark, n);
          c.lerp(tmp, forest);
          const desert = smooth(0.42, 0.3, m) * smooth(281, 291, t);
          tmp.copy(C.desert).lerp(C.desertRed, smooth(0.3, 0.9, n) * 0.6);
          c.lerp(tmp, desert);
          c.lerp(C.tundra, smooth(277, 267, t));
          c.lerp(C.alpine, smooth(0.18, 0.3, e));
          snow = Math.max(smooth(268, 258, t), smooth(0.3, 0.42, e));
          c.lerp(C.beach, (1 - smooth(0.002, 0.012, h)) * (1 - snow) * (1 - rt.river[i]));
          const dg = sb.degrade[cell];
          if (dg > 0) c.lerp(C.eroded, Math.min(0.85, dg));
          if (sb.drought[cell] > 0) c.lerp(C.drought, 0.5);
        }
        if (sb.nuclearWinter > 0) c.lerp(C.ash, sb.nuclearWinter * 0.55);
        this.colors[i * 3] = c.r;
        this.colors[i * 3 + 1] = c.g;
        this.colors[i * 3 + 2] = c.b;
        this.aux[i * 4 + 3] = snow;
      }
    }
    (this.terrainGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.terrainGeo.getAttribute('aAux') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** 政体疆域与调色板。 */
  private paintOwners(): void {
    const sb = this.sb!;
    const sig = sb.owner.join(',');
    if (sig !== this.ownerSig) {
      this.ownerSig = sig;
      const od = this.ownerTex.image.data as Uint8Array;
      for (let i = 0; i < OW * OH; i++) {
        const c = this.ownerMap[i];
        od[i * 4] = c < 0 ? 0 : sb.owner[c] + 1;
      }
      this.ownerTex.needsUpdate = true;
    }
    const pd = this.paletteTex.image.data as Uint8Array;
    sb.polities.forEach((p, i) => {
      if (i > 254) return;
      const c = polityColor(p.hue, 0.58);
      pd[i * 4] = Math.round(c.r * 255);
      pd[i * 4 + 1] = Math.round(c.g * 255);
      pd[i * 4 + 2] = Math.round(c.b * 255);
      pd[i * 4 + 3] = 255;
    });
    this.paletteTex.needsUpdate = true;
  }

  /** 城区半径（世界单位）。 */
  private cityRadius(pop: number, era: number): number {
    return (0.018 + 0.034 * Math.min(3.2, Math.log10(1 + pop))) * (1 + Math.min(era, 8) * 0.09);
  }

  /** 人类活动纹理：城区、田地与夜间灯光。 */
  private paintHuman(): void {
    const sb = this.sb!;
    this.urban.fill(0);
    this.farm.fill(0);
    const lit = new Float32Array(UW * UH);
    const glow = sb.era >= 4 ? 1 : sb.era >= 2 ? 0.45 : 0.25;
    const texel = CELL / USUB;
    for (const s of sb.settlements) {
      if (s.pop <= 0.05) continue;
      const era = Math.min(8, Math.floor(sb.polities[s.polity].tech));
      const R = this.cityRadius(s.pop, era) / texel;
      const F = R * 1.9 + 1.2;
      const cx = (s.x + 0.5) * USUB;
      const cy = (s.y + 0.5) * USUB;
      const reach = Math.ceil(F + 1);
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        const x = Math.floor(cx + dx);
        const y = Math.floor(cy + dy);
        if (x < 0 || y < 0 || x >= UW || y >= UH) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const j = y * UW + x;
        if (!s.ruined) this.urban[j] = Math.max(this.urban[j], smooth(R * 1.05, R * 0.55, d));
        else this.urban[j] = Math.max(this.urban[j], smooth(R * 0.9, R * 0.4, d) * 0.6);
        if (!s.ruined) this.farm[j] = Math.max(this.farm[j], smooth(F, F * 0.5, d) * (sb.degrade[s.y * SB_W + s.x] > 0.5 ? 0.3 : 1));
        const v = s.ruined ? 0 : Math.min(1, Math.log10(1 + s.pop) / 3) * glow;
        lit[j] = Math.max(lit[j], v * smooth(R * 1.6, R * 0.3, d));
      }
    }
    const hd = this.humanTex.image.data as Uint8Array;
    for (let j = 0; j < UW * UH; j++) {
      hd[j * 4] = Math.round(this.urban[j] * 255);
      hd[j * 4 + 1] = Math.round(this.farm[j] * 255);
      hd[j * 4 + 2] = Math.round(Math.min(1, lit[j]) * 255);
      hd[j * 4 + 3] = 255;
    }
    this.humanTex.needsUpdate = true;
  }

  private humanAt(fx: number, fy: number): { urban: number; farm: number } {
    const x = Math.max(0, Math.min(UW - 1, Math.floor(fx * USUB)));
    const y = Math.max(0, Math.min(UH - 1, Math.floor(fy * USUB)));
    const j = y * UW + x;
    return { urban: this.urban[j], farm: this.farm[j] };
  }

  /** 树木：按群系撒布，避开河道、湖泊、陡坡、田地与城区。 */
  private layoutTrees(): void {
    const sb = this.sb!;
    const rt = this.rt!;
    const d = this.dummy;
    const col = new THREE.Color();
    const warm = new THREE.Color(0x6b5a2a);
    let np = 0;
    let nt = 0;
    const cap = this.shadows ? MAX_TREES / 2 : MAX_TREES / 4;
    for (let cy = 0; cy < SB_H; cy++) {
      for (let cx = 0; cx < SB_W; cx++) {
        const cell = cy * SB_W + cx;
        if (!sb.terrain.land[cell] || sb.degrade[cell] > 0.35 || sb.nuclearWinter > 0.3) continue;
        const b = sb.biome[cell];
        const per = b === 5 ? 11 : b === 4 ? 2.2 : b === 3 ? 3.5 : b === 7 ? 1.5 : 0;
        const k = Math.floor(per + hash(cx, cy));
        for (let j = 0; j < k; j++) {
          const fx = cx + hash(cx * 3 + j, cy * 7);
          const fy = cy + hash(cx * 5, cy * 11 + j);
          const vi = this.vertexAt(fx, fy);
          const h = this.heightAt(fx, fy);
          if (h < 0.006 || rt.river[vi] > 0.2 || rt.lake[vi] > 0 || rt.slope[vi] > 2.2) continue;
          const hu = this.humanAt(fx, fy);
          if (hu.urban > 0.2 || hu.farm > 0.45 + hash(fx, j) * 0.4) continue;
          const pine = b === 3 || b === 7 || (b === 5 && (hash(j, cell) > 0.6 || rt.elev[vi] > 0.12));
          const m = pine ? this.pines : this.trees;
          const n = pine ? np : nt;
          if (n >= cap) continue;
          const s = 0.6 + hash(fx, fy) * 0.5;
          d.position.set(fx * CELL - HALF_W, h - 0.0008, fy * CELL - HALF_H);
          d.rotation.set((hash(j, fy) - 0.5) * 0.12, hash(fy, fx) * 6.28, (hash(fx, j) - 0.5) * 0.12);
          d.scale.set(s, s * (0.85 + hash(j, fx) * 0.4), s);
          d.updateMatrix();
          m.setMatrixAt(n, d.matrix);
          if (pine) col.setHSL(0.37 + hash(cell, j) * 0.03, 0.42, 0.11 + hash(j, cell) * 0.04);
          else col.setHSL(0.24 + hash(cell, j) * 0.07, 0.48, 0.15 + hash(j, cell) * 0.07);
          if (sb.dT > 2) col.lerp(warm, Math.min(0.6, (sb.dT - 2) / 4));
          m.setColorAt(n, col);
          if (pine) np++;
          else nt++;
        }
      }
    }
    this.pines.count = np;
    this.trees.count = nt;
    for (const m of [this.pines, this.trees]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** 城市：沿各自朝向的街区网格排布建筑，按技术时代改变材质与高度。 */
  private layoutCities(): void {
    const sb = this.sb!;
    const rt = this.rt!;
    const d = this.dummy;
    const c = new THREE.Color();
    let nb = 0;
    let nh = 0;
    let nc = 0;
    let ns = 0;
    this.smokeSources = [];
    const capitals = new Set(sb.polities.filter((p) => p.alive).map((p) => p.capital));
    for (const s of [...sb.settlements].sort((a, b) => b.pop - a.pop)) {
      if (s.pop <= 0.05) continue;
      const p = sb.polities[s.polity];
      const era = Math.min(8, Math.floor(p.tech));
      const cxw = (s.x + 0.5) * CELL - HALF_W;
      const czw = (s.y + 0.5) * CELL - HALF_H;
      const tier = Math.log10(1 + s.pop);
      const R = this.cityRadius(s.pop, era);
      const sp = era <= 1 ? 0.0068 : era <= 3 ? 0.0078 : era <= 5 ? 0.0090 : 0.0105;
      const ang = 0.42 + (hash(s.id, 1) - 0.5) * 0.5;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const K = Math.ceil(R / sp);
      const limit = s.ruined ? 24 : Math.min(260, Math.floor(24 + tier * 42 + era * 15));
      let placed = 0;
      for (let gi = -K; gi <= K && placed < limit; gi++) {
        for (let gj = -K; gj <= K && placed < limit; gj++) {
          // 每隔几排留出街道
          if (gi % 3 === 0 || gj % 4 === 0) continue;
          const lx = gi * sp;
          const lz = gj * sp;
          const dist = Math.hypot(lx, lz) / R;
          const r1 = hash(s.id * 7 + gi, gj);
          const r2 = hash(gj * 3 + s.id, gi + 11);
          if (dist > 0.85 + r1 * 0.3) continue;
          if (r2 > Math.exp(-dist * dist * 1.8) * 0.95 + 0.04) continue;
          const x = cxw + lx * ca - lz * sa;
          const z = czw + lx * sa + lz * ca;
          const fx = (x + HALF_W) / CELL;
          const fy = (z + HALF_H) / CELL;
          const vi = this.vertexAt(fx, fy);
          const h = this.heightAt(fx, fy);
          if (h < 0.004 || rt.river[vi] > 0.35 || rt.lake[vi] > 0 || rt.slope[vi] > 2.6) continue;
          placed++;
          d.rotation.set(0, -ang + (r1 - 0.5) * 0.08, 0);
          d.position.set(x, h - 0.0015, z);
          if (s.ruined) {
            d.scale.set(sp * (0.4 + r1 * 0.4), 0.002 + r2 * 0.004, sp * (0.4 + r2 * 0.4));
            d.rotation.z = (r1 - 0.5) * 0.5;
            d.updateMatrix();
            if (nb < MAX_BUILD) {
              this.builds.setMatrixAt(nb, d.matrix);
              this.builds.setColorAt(nb++, c.setRGB(0.11, 0.1, 0.1));
            }
            continue;
          }
          const center = Math.max(0, 1 - dist);
          if (era <= 3) {
            // 坡屋顶民居与石砌房屋
            const w = sp * (0.55 + r1 * 0.3);
            const hh = era <= 1 ? 0.004 + r2 * 0.003 : 0.005 + r2 * 0.006 + center * 0.004;
            d.scale.set(w, hh, w * (0.75 + r2 * 0.5));
            d.updateMatrix();
            if (nh < MAX_HUTS) {
              this.huts.setMatrixAt(nh, d.matrix);
              if (era <= 1) c.setRGB(0.62, 0.53, 0.4);
              else c.setRGB(0.72, 0.68, 0.6);
              c.multiplyScalar(0.85 + r1 * 0.25);
              this.huts.setColorAt(nh++, c);
            }
            continue;
          }
          let w = sp * (0.62 + r1 * 0.28);
          let hh: number;
          if (era <= 5) hh = 0.007 + r2 * 0.012 + center * 0.01;
          else hh = 0.01 + r2 * 0.02 + Math.pow(center, 2.2) * Math.min(0.15, 0.03 + tier * 0.035) * (1 + (era - 6) * 0.3);
          const factory = era >= 4 && era <= 6 && dist > 0.45 && r1 > 0.72;
          if (factory) w *= 1.5;
          d.scale.set(w, factory ? hh * 0.6 : hh, w * (0.8 + r2 * 0.4));
          d.updateMatrix();
          if (nb < MAX_BUILD) {
            this.builds.setMatrixAt(nb, d.matrix);
            if (factory) c.setHSL(0.08 + r2 * 0.02, 0.22, 0.30 + r1 * 0.08);
            else if (era <= 5) c.setHSL(0.045 + r2 * 0.035, 0.26 + r1 * 0.12, 0.38 + r2 * 0.18);
            else if (hh > 0.05) c.setHSL(0.54 + r2 * 0.055, 0.15, 0.48 + r1 * 0.20);
            else c.setHSL(0.08 + r2 * 0.05, 0.12, 0.52 + r1 * 0.18);
            this.builds.setColorAt(nb++, c);
          }
          // 工业时代的烟囱与烟
          if (factory && nc < MAX_CHIMNEY) {
            d.position.set(x + w * 0.35, h, z);
            d.rotation.set(0, 0, 0);
            d.scale.set(0.0028, hh * 0.6 + 0.02, 0.0028);
            d.updateMatrix();
            this.chimneys.setMatrixAt(nc, d.matrix);
            this.chimneys.setColorAt(nc++, c.setRGB(0.36, 0.25, 0.22));
            this.smokeSources.push({ x: x + w * 0.35, y: h + hh * 0.6 + 0.02, z, rate: (1 - sb.params.eco) * 0.8 + 0.1, dark: 0.35 });
          }
        }
      }
      // 首都地标
      if (capitals.has(s.id) && ns < 64 && !s.ruined) {
        const sc = 0.012 + 0.006 * Math.min(3, tier) + era * 0.002;
        const base = Math.max(0, this.heightAt(s.x + 0.5, s.y + 0.5));
        d.position.set(cxw, base, czw);
        d.rotation.set(0, 0, 0);
        d.scale.set(sc * 0.6, sc * (era >= 6 ? 3.4 : 1.8), sc * 0.6);
        d.updateMatrix();
        this.spires.setMatrixAt(ns, d.matrix);
        this.spires.setColorAt(ns++, c.copy(polityColor(p.hue, 0.72)).lerp(new THREE.Color(0xf2efe6), 0.5));
      }
    }
    this.builds.count = nb;
    this.huts.count = nh;
    this.chimneys.count = nc;
    this.spires.count = ns;
    for (const m of [this.builds, this.huts, this.chimneys, this.spires]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (this.selected !== null) this.placeSelection();
  }

  private layoutRoutes(): void {
    const sb = this.sb!;
    const pos = this.roadGeo.getAttribute('position') as THREE.BufferAttribute;
    const vol = this.roadGeo.getAttribute('aVol') as THREE.BufferAttribute;
    const sea = this.seaGeo.getAttribute('position') as THREE.BufferAttribute;
    this.routePaths = [];
    let v = 0;
    let sv = 0;
    const maxVol = Math.max(1, ...sb.routes.slice(0, 10).map((r) => r.vol));
    for (const r of sb.routes) {
      const a = sb.settlements[r.a];
      const b = sb.settlements[r.b];
      if (a.pop <= 0 || b.pop <= 0) continue;
      const pts: THREE.Vector3[] = [];
      const segs = 8;
      for (let k = 0; k <= segs; k++) {
        const f = k / segs;
        // 道路略微弯曲，贴合地形
        const bend = Math.sin(f * Math.PI) * (hash(r.a, r.b) - 0.5) * 0.6;
        const ox = -(b.y - a.y) * bend * 0.15;
        const oy = (b.x - a.x) * bend * 0.15;
        const p = this.xyPos(a.x + 0.5 + (b.x - a.x) * f + ox, a.y + 0.5 + (b.y - a.y) * f + oy, 0.0025);
        if (r.sea) p.y = 0.01 + Math.sin(f * Math.PI) * 0.03;
        pts.push(p);
      }
      this.routePaths.push({ pts, sea: r.sea });
      const w = Math.min(1, r.vol / maxVol);
      if (r.sea) {
        for (let k = 0; k < segs && sv < MAX_ROUTE_SEG * 2; k++) {
          sea.setXYZ(sv++, pts[k].x, pts[k].y, pts[k].z);
          sea.setXYZ(sv++, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
        }
        continue;
      }
      const half = 0.0018 + w * 0.0026;
      for (let k = 0; k < segs && v < MAX_ROUTE_SEG * 6; k++) {
        const p0 = pts[k];
        const p1 = pts[k + 1];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const L = Math.hypot(dx, dz) || 1;
        const nx = (-dz / L) * half;
        const nz = (dx / L) * half;
        const quad = [[p0.x + nx, p0.y, p0.z + nz], [p0.x - nx, p0.y, p0.z - nz], [p1.x + nx, p1.y, p1.z + nz], [p1.x + nx, p1.y, p1.z + nz], [p0.x - nx, p0.y, p0.z - nz], [p1.x - nx, p1.y, p1.z - nz]];
        for (const q of quad) {
          pos.setXYZ(v, q[0], q[1], q[2]);
          vol.setX(v++, w);
        }
      }
    }
    this.roadGeo.setDrawRange(0, v);
    pos.needsUpdate = true;
    vol.needsUpdate = true;
    this.seaGeo.setDrawRange(0, sv);
    sea.needsUpdate = true;
    this.seaLines.computeLineDistances();
    // 商队与船只
    const land = this.routePaths.map((p, i) => (p.sea ? -1 : i)).filter((i) => i >= 0);
    const seaR = this.routePaths.map((p, i) => (p.sea ? i : -1)).filter((i) => i >= 0);
    const want = Math.min(MAX_CARAVANS, Math.round(land.length * 1.1));
    while (this.caravanState.length < want) this.caravanState.push({ route: 0, phase: hash(this.caravanState.length, 9), speed: 0.12 + hash(this.caravanState.length, 4) * 0.2 });
    this.caravanState.length = want;
    this.caravanState.forEach((cs, i) => (cs.route = land.length ? land.at(i % land.length)! : 0));
    this.caravanGeo.setDrawRange(0, land.length ? want : 0);
    const ws = Math.min(MAX_SHIPS, seaR.length);
    while (this.shipState.length < ws) this.shipState.push({ route: 0, phase: hash(this.shipState.length, 5), speed: 0.06 + hash(this.shipState.length, 8) * 0.06 });
    this.shipState.length = ws;
    this.shipState.forEach((ss, i) => (ss.route = seaR.at(i % Math.max(1, seaR.length)) ?? 0));
    this.ships.count = ws;
  }

  private layoutFront(): void {
    const sb = this.sb!;
    const pos = this.frontGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.frontGeo.getAttribute('color') as THREE.BufferAttribute;
    let n = 0;
    for (const w of sb.wars) {
      for (let k = 0; k < w.front.length && n < MAX_FRONT; k += 2) {
        const p = this.cellPos(w.front[k], 0.012);
        pos.setXYZ(n, p.x, p.y, p.z);
        if (w.nuclear) col.setXYZ(n, 1.6, 0.5, 1.2);
        else col.setXYZ(n, 1.7, 0.45, 0.16);
        if (k % 6 === 0) this.smokeSources.push({ x: p.x, y: p.y, z: p.z, rate: 0.7, dark: 0.8 });
        n++;
      }
    }
    this.frontGeo.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private layoutLabels(): void {
    const sb = this.sb!;
    const caps = sb.polities.filter((p) => p.alive && sb.settlements[p.capital]).sort((a, b) => b.pop - a.pop).slice(0, this.labels.length);
    this.labels.forEach((l, i) => {
      const p = caps[i];
      if (!p) {
        l.sprite.visible = false;
        return;
      }
      const s = sb.settlements[p.capital];
      const c = '#' + polityColor(p.hue, 0.74).getHexString();
      const text = `${p.name} · ${s.name}`;
      if (this.labelText.get(l) !== text + c) {
        l.set(text, 0.017, c);
        this.labelText.set(l, text + c);
      }
      l.sprite.position.copy(this.xyPos(s.x + 0.5, s.y + 0.5, 0.24 + 0.05 * Math.log10(1 + s.pop)));
      l.sprite.visible = true;
    });
  }

  /* ───── 选中与特效 ───── */

  select(id: number | null): void {
    this.selected = id;
    this.selRing.visible = id !== null;
    this.selBeam.visible = id !== null;
    if (id !== null) this.placeSelection();
  }

  private placeSelection(): void {
    const s = this.sb?.settlements[this.selected!];
    if (!s) return;
    const p = this.xyPos(s.x + 0.5, s.y + 0.5, 0.006);
    this.selRing.position.copy(p);
    this.selRing.scale.setScalar(0.09 + 0.025 * Math.log10(1 + s.pop));
    this.selBeam.position.copy(p);
    this.selBeam.scale.set(1, 0.8, 1);
  }

  settlementPos(id: number): THREE.Vector3 | null {
    const s = this.sb?.settlements[id];
    return s ? this.xyPos(s.x + 0.5, s.y + 0.5) : null;
  }

  burst(e: SbEvent): void {
    if (e.cell === undefined) return;
    const map: Partial<Record<SbEvent['kind'], [number, number, number]>> = {
      leap: [0xf5c66b, 0.6, 1.6], leap2: [0xfff1d0, 0.9, 2], split: [0xff6152, 0.5, 1.4], war: [0xff6152, 0.45, 1.2],
      conquest: [0xff8a52, 0.25, 0.9], plague: [0x9dff6a, 0.35, 1.6], ally: [0x3ff2e6, 0.5, 1.4], peace: [0x3ff2e6, 0.35, 1.2],
      crisis: [0xff4bd0, 0.9, 1.8], era: [0xfff1d0, 0.8, 1.8], act: [0xa497ff, 0.5, 1.4], found: [0x3ff2e6, 0.2, 0.9],
    };
    const m = map[e.kind];
    if (!m) return;
    this.ring(this.cellPos(e.cell, 0.01), m[0], m[1], m[2]);
  }

  /** 核战争：被打击的城市升起火球与蘑菇云。 */
  nukeFlashes(): void {
    const sb = this.sb;
    if (!sb) return;
    let k = 0;
    for (const s of sb.settlements) {
      if (!s.ruined) continue;
      const p = this.xyPos(s.x + 0.5, s.y + 0.5, 0.01);
      const delay = (k++ % 24) * 90;
      setTimeout(() => {
        this.ring(p, 0xffffff, 0.55, 2.4);
        this.ring(p, 0xffa040, 0.3, 1.6);
        for (let j = 0; j < 14; j++) this.emitSmoke(p.x + (hash(j, k) - 0.5) * 0.02, p.y, p.z + (hash(k, j) - 0.5) * 0.02, 0.9, 0.05 + j * 0.004, 0.5);
      }, delay);
    }
  }

  ring(p: THREE.Vector3, color: number, size: number, dur: number): void {
    const f = this.fx.find((x) => x.life <= 0) ?? this.fx[0];
    f.mesh.position.copy(p);
    (f.mesh.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(2.2);
    f.life = dur;
    f.dur = dur;
    f.max = size;
    f.mesh.visible = true;
  }

  private emitSmoke(x: number, y: number, z: number, dark: number, vy = 0.03, size = 0.02): void {
    if (this.smoke.length >= MAX_SMOKE) this.smoke.shift();
    this.smoke.push({ x, y, z, vy, life: 0, max: 2.2 + hash(x, z) * 1.8, size: size * 0.72, dark });
  }

  /* ───── 每帧 ───── */

  setOpacity(a: number): void {
    this.opacity = a;
    this.waterMat.uniforms.uOpacity.value = a;
    this.cloudMat.uniforms.uOpacity.value = a;
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || m === this.waterMat || m === this.cloudMat) return;
      if (m instanceof THREE.ShaderMaterial) {
        if (m.uniforms.uOpacity) m.uniforms.uOpacity.value = a;
        return;
      }
      if ('opacity' in m && m.transparent) {
        const base = (m.userData.baseOpacity ??= m.opacity) as number;
        m.opacity = base * a;
      }
    });
    this.group.visible = a > 0.002;
  }

  setPointScale(px: number, dpr = 1): void {
    for (const m of [this.caravans.material, this.front.material] as THREE.ShaderMaterial[]) {
      m.uniforms.uScale.value = px;
      m.uniforms.uMaxPx.value = (m === this.caravans.material ? 8 : 22) * dpr;
    }
    (this.smokePts.material as THREE.ShaderMaterial).uniforms.uScale.value = px;
  }

  update(dt: number, t: number): void {
    this.uTime.value = t;
    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 0.8);
    this.uNight.value = this.night;
    // 白天暖阳，夜晚冷月
    this.sun.intensity = 3.2 * (1 - this.night * 0.86) * this.opacity;
    this.sun.color.setRGB(1, 0.93 - this.night * 0.12, 0.83 + this.night * 0.15);
    this.sky.intensity = 0.65 * (1 - this.night * 0.5) * this.opacity;
    this.sky.color.setRGB(0.62 - this.night * 0.4, 0.77 - this.night * 0.45, 1);
    // 商队
    const pos = this.caravanGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.caravanGeo.getAttribute('color') as THREE.BufferAttribute;
    const tmp = new THREE.Vector3();
    this.caravanState.forEach((c, i) => {
      const path = this.routePaths[c.route];
      if (!path) return;
      c.phase = (c.phase + dt * c.speed) % 2;
      const f = c.phase < 1 ? c.phase : 2 - c.phase;
      const seg = Math.min(7, Math.floor(f * 8));
      tmp.copy(path.pts[seg]).lerp(path.pts[seg + 1], f * 8 - seg);
      pos.setXYZ(i, tmp.x, tmp.y + 0.005, tmp.z);
      col.setXYZ(i, 1.5, 1.1, 0.45);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    // 船只
    const d = this.dummy;
    const ahead = new THREE.Vector3();
    this.shipState.forEach((s, i) => {
      const path = this.routePaths[s.route];
      if (!path) return;
      s.phase = (s.phase + dt * s.speed) % 2;
      const fwd = s.phase < 1;
      const f = fwd ? s.phase : 2 - s.phase;
      const seg = Math.min(7, Math.floor(f * 8));
      tmp.copy(path.pts[seg]).lerp(path.pts[seg + 1], f * 8 - seg);
      ahead.copy(path.pts[Math.min(8, seg + 1)]).sub(path.pts[seg]);
      d.position.set(tmp.x, 0.0022, tmp.z);
      d.rotation.set(0, Math.atan2(-(fwd ? ahead.z : -ahead.z), fwd ? ahead.x : -ahead.x), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.ships.setMatrixAt(i, d.matrix);
    });
    this.ships.instanceMatrix.needsUpdate = true;
    (this.front.material as THREE.ShaderMaterial).uniforms.uFlicker.value = t;
    // 烟
    for (const s of this.smokeSources) if (Math.random() < s.rate * dt * 1.4) this.emitSmoke(s.x, s.y, s.z, s.dark);
    const sp = this.smokeGeo.getAttribute('position') as THREE.BufferAttribute;
    const sc = this.smokeGeo.getAttribute('color') as THREE.BufferAttribute;
    const ss = this.smokeGeo.getAttribute('size') as THREE.BufferAttribute;
    const sa = this.smokeGeo.getAttribute('alpha') as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life += dt;
      if (s.life > s.max) {
        this.smoke.splice(i, 1);
        continue;
      }
      s.y += s.vy * dt;
      s.x += dt * 0.008;
      const k = s.life / s.max;
      sp.setXYZ(n, s.x, s.y, s.z);
      const g = 0.6 - s.dark * 0.4 - this.night * 0.15;
      sc.setXYZ(n, g, g, g * 1.02);
      ss.setX(n, s.size * (1 + k * 2.5));
      sa.setX(n, (1 - k) * Math.min(1, s.life * 4) * 0.26 * this.opacity);
      n++;
    }
    this.smokeGeo.setDrawRange(0, n);
    sp.needsUpdate = sc.needsUpdate = ss.needsUpdate = sa.needsUpdate = true;
    // 特效环
    for (const f of this.fx) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = 1 - Math.max(0, f.life) / f.dur;
      f.mesh.scale.setScalar(0.02 + f.max * Math.sqrt(k));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9 * this.opacity;
      if (f.life <= 0) f.mesh.visible = false;
    }
    if (this.selected !== null) {
      this.selRing.rotation.y = t * 0.8;
      (this.selBeam.material as THREE.MeshBasicMaterial).opacity = (0.45 + 0.25 * Math.sin(t * 4)) * this.opacity;
    }
  }
}

/** 加色混合的圆形光点（每个点可设颜色与大小）。 */
function glowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { uScale: { value: 520 }, uFlicker: { value: 0 }, uOpacity: { value: 1 }, uMaxPx: { value: 26 } },
    vertexShader: /* glsl */ `
      attribute float size; varying vec3 vColor; uniform float uScale; uniform float uFlicker; uniform float uMaxPx;
      void main() {
        vColor = color * (0.75 + 0.25 * sin(uFlicker * 9.0 + position.x * 40.0 + position.z * 31.0));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(size * uScale / -mv.z, uMaxPx);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; uniform float uOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * a * a, a * uOpacity);
      }`,
  });
}

/** 柔和的烟团（普通混合）。 */
function smokeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: { uScale: { value: 520 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute float alpha; varying vec3 vColor; varying float vA; uniform float uScale;
      void main() { vColor = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(size * uScale / -mv.z, 11.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; gl_FragColor = vec4(vColor, a); }`,
  });
}
