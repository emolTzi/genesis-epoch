// 第④幕：K-Pg 撞击体、尾迹与撞击闪光。

import * as THREE from 'three';
import type { Tweens } from '../core/tween';
import { ease } from '../core/tween';

export class Impactor {
  readonly group = new THREE.Group();
  private rock: THREE.Mesh;
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private flash: THREE.Sprite;
  private wave: THREE.Mesh;
  private debris: THREE.Points;
  private debrisVel: THREE.Vector3[] = [];
  private debrisBase: Float32Array;
  private dust: THREE.Sprite;

  constructor() {
    this.rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.075, 1),
      new THREE.MeshStandardMaterial({ color: 0x5b524a, roughness: 1, emissive: new THREE.Color(0xff6a20).multiplyScalar(1.6) }),
    );
    const tg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 30 }, () => new THREE.Vector3()));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(1, 0.62, 0.32).multiplyScalar(3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,230,1)');
    grd.addColorStop(0.3, 'rgba(255,170,80,0.6)');
    grd.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dustCanvas = document.createElement('canvas');
    dustCanvas.width = dustCanvas.height = 256;
    const dctx = dustCanvas.getContext('2d')!;
    const dgr = dctx.createRadialGradient(128, 128, 4, 128, 128, 122);
    dgr.addColorStop(0, 'rgba(255,176,92,0.9)');
    dgr.addColorStop(0.28, 'rgba(198,92,42,0.54)');
    dgr.addColorStop(0.68, 'rgba(82,64,56,0.18)');
    dgr.addColorStop(1, 'rgba(40,34,30,0)');
    dctx.fillStyle = dgr;
    dctx.fillRect(0, 0, 256, 256);
    const dustTex = new THREE.CanvasTexture(dustCanvas);
    dustTex.colorSpace = THREE.SRGBColorSpace;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    this.wave = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const debrisCount = 280;
    this.debrisBase = new Float32Array(debrisCount * 3);
    const debrisGeo = new THREE.BufferGeometry();
    debrisGeo.setAttribute('position', new THREE.BufferAttribute(this.debrisBase, 3));
    debrisGeo.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: debrisCount }, (_, i) => (i * 0.61803398875) % 1), 1));
    const debrisMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uPixel: { value: 1 } },
      vertexShader: `attribute float aSeed; uniform float uPixel; varying float vSeed; varying float vFade;
        void main(){ vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFade = clamp(1.0 + mv.z * 0.06, 0.0, 1.0);
          gl_PointSize = min(4.5, (0.9 + aSeed * 2.2) * uPixel * (10.0 / max(2.0, -mv.z))); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uOpacity; varying float vSeed; varying float vFade;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
          vec3 hot = mix(vec3(1.0,0.28,0.06), vec3(1.0,0.82,0.44), vSeed);
          gl_FragColor = vec4(hot, a * uOpacity * (0.35 + 0.65 * vSeed) * vFade); }`,
    });
    this.debris = new THREE.Points(debrisGeo, debrisMat);
    this.debris.frustumCulled = false;
    this.dust = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: new THREE.Color(1, 0.78, 0.55), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    this.group.add(this.rock, this.trail, this.flash, this.wave, this.debris, this.dust);
    this.group.visible = false;
  }

  /**
   * 撞击动画：从远处沿弧线飞向行星表面 world 点。
   * planetCenter 用于计算撞击面的法向。
   */
  async strike(tw: Tweens, world: THREE.Vector3, planetCenter: THREE.Vector3, ms = 2200): Promise<void> {
    this.group.visible = true;
    const normal = world.clone().sub(planetCenter).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    const from = world.clone().add(normal.clone().multiplyScalar(4)).add(side.multiplyScalar(2.5));
    const ctrl = world.clone().add(normal.clone().multiplyScalar(2));
    this.trailPts = [];
    (this.flash.material as THREE.SpriteMaterial).opacity = 0;
    (this.wave.material as THREE.MeshBasicMaterial).opacity = 0;
    const p = new THREE.Vector3();
    await tw.run(ms, (k) => {
      const a = from.clone().lerp(ctrl, k);
      const b = ctrl.clone().lerp(world, k);
      p.copy(a.lerp(b, k));
      this.rock.position.copy(p);
      this.rock.rotation.x += 0.2;
      this.trailPts.unshift(p.clone());
      if (this.trailPts.length > 30) this.trailPts.pop();
      const arr = this.trail.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 30; i++) {
        const q = this.trailPts[Math.min(i, this.trailPts.length - 1)];
        arr.setXYZ(i, q.x, q.y, q.z);
      }
      arr.needsUpdate = true;
    }, ease.inCubic);
    this.rock.visible = false;
    this.trail.visible = false;
    this.flash.position.copy(world);
    this.wave.position.copy(world).add(normal.clone().multiplyScalar(0.01));
    this.wave.lookAt(world.clone().add(normal));
    // Debris: a hemispherical spray of hot fragments and a slowly expanding dust plume.
    const count = this.debrisBase.length / 3;
    const tangentA = new THREE.Vector3(1, 0, 0).cross(normal).normalize();
    if (tangentA.lengthSq() < 0.01) tangentA.set(0, 1, 0).cross(normal).normalize();
    const tangentB = normal.clone().cross(tangentA).normalize();
    this.debrisVel = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const lateral = tangentA.clone().multiplyScalar(Math.cos(a) * r).add(tangentB.clone().multiplyScalar(Math.sin(a) * r));
      const speed = 0.22 + Math.random() * 0.85;
      this.debrisVel.push(normal.clone().multiplyScalar(0.34 + Math.random() * 0.8).add(lateral.multiplyScalar(speed)).multiplyScalar(0.7));
      this.debrisBase[i * 3] = world.x;
      this.debrisBase[i * 3 + 1] = world.y;
      this.debrisBase[i * 3 + 2] = world.z;
    }
    (this.debris.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.debris.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0;
    (this.debris.material as THREE.ShaderMaterial).uniforms.uPixel.value = Math.min(2.2, window.devicePixelRatio || 1);
    this.dust.position.copy(world).add(normal.clone().multiplyScalar(0.06));
    this.dust.scale.setScalar(0.2);
    (this.dust.material as THREE.SpriteMaterial).opacity = 0;
    const pos = this.debris.geometry.getAttribute('position') as THREE.BufferAttribute;
    const base = Float32Array.from(this.debrisBase);
    await tw.run(2800, (k) => {
      const flashK = Math.min(1, k / 0.16);
      (this.flash.material as THREE.SpriteMaterial).opacity = flashK < 1 ? flashK : Math.max(0, 1 - (k - 0.16) / 0.7);
      const s = 0.22 + Math.min(1, k / 0.12) * 1.02;
      this.flash.scale.set(s, s, 1);
      (this.wave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - k / 0.72));
      this.wave.scale.setScalar(0.04 + k * 0.9);
      const drag = 1 - Math.exp(-k * 3.4);
      for (let i = 0; i < count; i++) {
        const v = this.debrisVel[i];
        const ballistic = 1.4 * k - 2.6 * k * k;
        pos.setXYZ(i, base[i * 3] + v.x * drag, base[i * 3 + 1] + v.y * drag + ballistic * 0.25, base[i * 3 + 2] + v.z * drag);
      }
      pos.needsUpdate = true;
      (this.debris.material as THREE.ShaderMaterial).uniforms.uOpacity.value = k < 0.05 ? k / 0.05 : Math.max(0, 1 - (k - 0.18) / 0.75);
      this.dust.scale.setScalar(0.08 + Math.pow(Math.min(1, k * 1.5), 0.7) * 0.62);
      (this.dust.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.42 * (1 - k / 0.9));
    }, ease.outCubic);
    this.group.visible = false;
    this.debris.visible = true;
    this.dust.visible = true;
    this.rock.visible = true;
    this.trail.visible = true;
  }
}
