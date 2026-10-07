// 第②幕：恒星、吸积盘、宜居带与行星轨道。1 AU = 2.2 个场景单位。

import * as THREE from 'three';
import { NOISE3D, blackbody } from './glsl';

export const AU_UNITS = 2.2;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,240,210,0.7)');
  grd.addColorStop(0.45, 'rgba(255,200,120,0.15)');
  grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StarSystem {
  readonly group = new THREE.Group();
  readonly starColor = new THREE.Color(1, 0.95, 0.85);
  private starMat: THREE.ShaderMaterial;
  private corona: THREE.Sprite;
  private hzMat: THREE.ShaderMaterial;
  private hz: THREE.Mesh;
  private diskMat: THREE.ShaderMaterial;
  private orbitLine: THREE.LineLoop;
  readonly planet: THREE.Mesh;
  private planetMat: THREE.MeshStandardMaterial;
  private others: { line: THREE.LineLoop; body: THREE.Mesh; a: number; phase: number }[] = [];
  private light = new THREE.PointLight(0xffffff, 60, 0, 1.6);
  a = 1;
  phase = 0.6;
  private master = 1;
  private othersV = 1;

  constructor() {
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: this.starColor }, uOpacity: { value: 1 } },
      transparent: true,
      vertexShader: /* glsl */ `varying vec3 vPos; varying vec3 vN; varying vec3 vW;
        void main(){ vPos = position; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec3 vPos; varying vec3 vN; varying vec3 vW;
        ${NOISE3D}
        void main(){
          vec3 p = normalize(vPos);
          float g = fbm(p*8.0 + vec3(uTime*0.05));
          float mu = max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0);
          float limb = 0.4 + 0.6*pow(mu, 0.5);
          vec3 c = uColor * (1.6 + 0.9*g) * limb;
          gl_FragColor = vec4(c, uOpacity);
        }
      `,
    });
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.42, 64, 32), this.starMat);
    this.corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: this.starColor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.corona.scale.set(2.8, 2.8, 1);
    this.group.add(star, this.corona, this.light);

    this.hzMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uInner: { value: 0.99 * AU_UNITS }, uOuter: { value: 1.67 * AU_UNITS }, uOpacity: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uInner; uniform float uOuter; uniform float uOpacity; uniform float uTime; varying vec2 vP;
        void main(){
          float r = length(vP);
          float inside = step(uInner, r) * step(r, uOuter);
          float edge = smoothstep(0.04, 0.0, abs(r-uInner)) + smoothstep(0.04, 0.0, abs(r-uOuter));
          float shimmer = 0.5 + 0.5*sin(r*18.0 - uTime*1.2);
          vec3 c = vec3(0.35, 0.95, 0.6);
          gl_FragColor = vec4(c, (inside*(0.06 + 0.04*shimmer) + edge*0.5) * uOpacity);
        }
      `,
    });
    this.hz = new THREE.Mesh(new THREE.RingGeometry(0.1, 8, 160, 1), this.hzMat);
    this.hz.rotation.x = -Math.PI / 2;
    this.group.add(this.hz);

    this.diskMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uDisk: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOpacity; uniform float uDisk; varying vec2 vP;
        ${NOISE3D}
        void main(){
          float r = length(vP); float a = atan(vP.y, vP.x);
          float swirl = fbm(vec3(a*2.0 - log(r+0.2)*3.0 + uTime*0.15, r*1.5, 1.0));
          float lanes = 0.6 + 0.4*sin(r*9.0 + swirl*4.0);
          float fall = smoothstep(7.5, 0.6, r) * smoothstep(0.45, 0.9, r);
          vec3 hot = vec3(1.0, 0.7, 0.4); vec3 cold = vec3(0.5, 0.45, 0.85);
          vec3 c = mix(hot, cold, smoothstep(0.5, 6.0, r));
          gl_FragColor = vec4(c * swirl * lanes, swirl * lanes * fall * 0.55 * uOpacity * uDisk);
        }
      `,
    });
    const disk = new THREE.Mesh(new THREE.RingGeometry(0.45, 7.5, 160, 4), this.diskMat);
    disk.rotation.x = -Math.PI / 2;
    this.group.add(disk);

    const orbitGeo = (rad: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 160; i++) {
        const t = (i / 160) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * rad, 0, Math.sin(t) * rad));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    };
    this.orbitLine = new THREE.LineLoop(orbitGeo(AU_UNITS), new THREE.LineBasicMaterial({ color: 0xf5c66b, transparent: true, opacity: 0.6 }));
    this.group.add(this.orbitLine);
    this.planetMat = new THREE.MeshStandardMaterial({ color: 0x3e8fb0, roughness: 0.6, emissive: new THREE.Color(0x0a1a22) });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 20), this.planetMat);
    this.group.add(this.planet);
    for (const [a, color, size] of [[0.39, 0x9a8f86, 0.05], [0.72, 0xd8c08a, 0.09], [1.52, 0xb4553a, 0.07], [2.77, 0x77706a, 0.04]] as const) {
      const line = new THREE.LineLoop(orbitGeo(a * AU_UNITS), new THREE.LineBasicMaterial({ color: 0x6a7096, transparent: true, opacity: 0.25 }));
      const body = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      this.group.add(line, body);
      this.others.push({ line, body, a, phase: a * 7 });
    }
    this.group.add(new THREE.AmbientLight(0x404a70, 0.35));
  }

  setStar(tempK: number, lum: number): void {
    const [r, g, b] = blackbody(tempK);
    this.starColor.setRGB(r, g, b);
    (this.corona.material as THREE.SpriteMaterial).color.copy(this.starColor);
    const s = 1.7 + 1.1 * Math.pow(lum, 0.25);
    this.corona.scale.set(s, s, 1);
    this.light.color.copy(this.starColor);
  }

  setHabitableZone(inner: number, outer: number): void {
    this.hzMat.uniforms.uInner.value = inner * AU_UNITS;
    this.hzMat.uniforms.uOuter.value = outer * AU_UNITS;
  }

  setOrbit(aAU: number): void {
    this.a = aAU;
    this.orbitLine.scale.setScalar(aAU);
  }

  setPlanetColor(hex: number): void {
    this.planetMat.color.setHex(hex);
  }

  setDisk(v: number): void {
    this.diskMat.uniforms.uDisk.value = v;
  }

  setOthers(v: number): void {
    this.othersV = v;
    this.applyOpacity();
  }

  /** 整体透明度（场景切换时使用）。 */
  setOpacity(a: number): void {
    this.master = a;
    this.group.visible = a > 0.002;
    this.applyOpacity();
  }

  private applyOpacity(): void {
    const a = this.master;
    this.starMat.uniforms.uOpacity.value = a;
    (this.corona.material as THREE.SpriteMaterial).opacity = a;
    this.hzMat.uniforms.uOpacity.value = a;
    this.diskMat.uniforms.uOpacity.value = a;
    (this.orbitLine.material as THREE.LineBasicMaterial).opacity = 0.6 * a;
    this.planetMat.transparent = a < 0.999;
    this.planetMat.opacity = a;
    for (const o of this.others) {
      (o.line.material as THREE.LineBasicMaterial).opacity = 0.25 * this.othersV * a;
      const bm = o.body.material as THREE.MeshStandardMaterial;
      bm.transparent = true;
      bm.opacity = this.othersV * a;
      o.body.visible = this.othersV > 0.05;
      o.line.visible = this.othersV > 0.05;
    }
  }

  planetWorld(target = new THREE.Vector3()): THREE.Vector3 {
    return this.planet.getWorldPosition(target);
  }

  update(dt: number, t: number, orbiting = true): void {
    this.starMat.uniforms.uTime.value = t;
    this.diskMat.uniforms.uTime.value = t;
    this.hzMat.uniforms.uTime.value = t;
    if (orbiting) this.phase += dt * 0.25 / Math.pow(Math.max(this.a, 0.05), 1.5);
    const r = this.a * AU_UNITS;
    this.planet.position.set(Math.cos(this.phase) * r, 0, Math.sin(this.phase) * r);
    for (const o of this.others) {
      if (orbiting) o.phase += dt * 0.25 / Math.pow(o.a, 1.5);
      o.body.position.set(Math.cos(o.phase) * o.a * AU_UNITS, 0, Math.sin(o.phase) * o.a * AU_UNITS);
    }
  }
}
