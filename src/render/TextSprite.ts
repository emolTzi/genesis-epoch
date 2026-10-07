// 以画布生成文字贴图的精灵，用于三维空间中的标签。

import * as THREE from 'three';

export const DISPLAY_FONT = '"GE Serif", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "SimSun", serif';

export class TextSprite {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private text = '';
  private color = '#e7e9f3';

  constructor(text: string, opts: { color?: string; height?: number } = {}) {
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.renderOrder = 20;
    this.color = opts.color ?? this.color;
    this.set(text, opts.height ?? 0.26);
  }

  set(text: string, height = this.sprite.scale.y || 0.26, color = this.color): void {
    this.text = text;
    this.color = color;
    const px = 64;
    const ctx = this.canvas.getContext('2d')!;
    ctx.font = `600 ${px}px ${DISPLAY_FONT}`;
    const w = Math.ceil(ctx.measureText(text).width) + 24;
    this.canvas.width = w;
    this.canvas.height = px + 24;
    ctx.font = `600 ${px}px ${DISPLAY_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(text, 12, (px + 24) / 2);
    this.tex.needsUpdate = true;
    this.sprite.scale.set((height * w) / (px + 24), height, 1);
  }

  /** 字体加载完成后重绘。 */
  refresh(): void {
    this.set(this.text);
  }

  setOpacity(a: number): void {
    (this.sprite.material as THREE.SpriteMaterial).opacity = a;
  }
}
