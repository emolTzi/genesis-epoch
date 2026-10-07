// 渲染舞台：渲染器、摄像机、后期泛光与自适应画质。

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export type Quality = 'high' | 'mid' | 'low';

const PIXEL_RATIO: Record<Quality, number> = { high: 2, mid: 1.25, low: 0.85 };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  quality: Quality;
  /** 'auto' 时按帧率自动升降档。 */
  qualityMode: Quality | 'auto' = 'auto';
  fps = 60;
  private frames = 0;
  private fpsTime = 0;
  private lowStreak = 0;
  private last = performance.now();
  private running = false;
  private paused = false;
  onQualityChange: (q: Quality) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x020308, 1);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 4000);
    this.camera.position.set(0, 1.4, 11);
    this.quality = Stage.guessQuality();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      this.last = performance.now();
    });
    this.resize();
  }

  /** 粗略估计设备档位：移动端或小屏从中档起步。 */
  static guessQuality(): Quality {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (mobile) return 'low';
    if (Math.min(screen.width, screen.height) < 700) return 'mid';
    return 'high';
  }

  /** 粒子数量按档位缩放。 */
  count(high: number): number {
    return Math.round(high * (this.quality === 'high' ? 1 : this.quality === 'mid' ? 0.55 : 0.28));
  }

  setQualityMode(mode: Quality | 'auto'): void {
    this.qualityMode = mode;
    if (mode !== 'auto') {
      this.quality = mode;
      this.applyQuality();
    }
  }

  private applyQuality(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[this.quality]);
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
    this.bloom.enabled = this.quality !== 'low';
    this.resize();
    this.onQualityChange(this.quality);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // 竖屏时加大视野，让主体在窄屏上完整入画
    this.camera.fov = this.camera.aspect < 1 ? 45 + (1 - this.camera.aspect) * 34 : 45;
    this.camera.updateProjectionMatrix();
  }

  start(loop: (dt: number, t: number) => void): void {
    if (this.running) return;
    this.running = true;
    let t = 0;
    const tick = () => {
      requestAnimationFrame(tick);
      if (this.paused) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      t += dt;
      loop(dt, t);
      // 始终经过合成器：OutputPass 负责色调映射与 sRGB 转换，低档只关闭泛光
      this.composer.render(dt);
      this.measure(dt);
    };
    requestAnimationFrame(tick);
  }

  private measure(dt: number): void {
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime < 2) return;
    this.fps = this.frames / this.fpsTime;
    this.frames = 0;
    this.fpsTime = 0;
    if (this.qualityMode !== 'auto') return;
    if (this.fps < 38) this.lowStreak++;
    else this.lowStreak = 0;
    if (this.lowStreak >= 2 && this.quality !== 'low') {
      this.quality = this.quality === 'high' ? 'mid' : 'low';
      this.lowStreak = 0;
      this.applyQuality();
    }
  }
}

/** 统一设置一组对象的透明度：自定义着色器读 uOpacity，其余材质改 opacity。 */
export function setGroupOpacity(root: THREE.Object3D, alpha: number): void {
  root.visible = alpha > 0.002;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      const sm = m as THREE.ShaderMaterial;
      if (sm.uniforms && sm.uniforms.uOpacity) sm.uniforms.uOpacity.value = alpha;
      else {
        const base = (m.userData.baseOpacity ??= m.opacity);
        m.transparent = true;
        m.opacity = base * alpha;
      }
    }
  });
}
