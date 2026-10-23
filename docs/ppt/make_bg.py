# -*- coding: utf-8 -*-
"""为封面与结尾页生成 16:9 背景图：封面用 AI 主视觉，结尾用文明夜景截图（裁掉界面）。"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / 'docs' / 'submission' / 'shots'
ART = ROOT / 'docs' / 'assets' / 'gpt' / '01_cover.png'
OUT = Path(__file__).resolve().parent / 'assets'
OUT.mkdir(parents=True, exist_ok=True)


def crop_16x9(img: Image.Image, cx: float, cy: float, scale: float) -> Image.Image:
    w, h = img.size
    cw = min(w, int(h * 16 / 9 * scale))
    ch = int(cw * 9 / 16)
    x = int(min(max(cx * w - cw / 2, 0), w - cw))
    y = int(min(max(cy * h - ch / 2, 0), h - ch))
    return img.crop((x, y, x + cw, y + ch)).resize((1920, 1080), Image.LANCZOS)


def layer(img: Image.Image, left=0.9, fade_from=0.40, fade_to=0.78, bottom=0.85, dim=1.0) -> Image.Image:
    base = np.asarray(img.convert('RGB')).astype(np.float32) * dim
    h, w, _ = base.shape
    x = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    a_left = left * np.clip((fade_to - x) / (fade_to - fade_from), 0, 1)
    a_bottom = bottom * np.clip((y - 0.6) / 0.4, 0, 1) ** 1.3
    a = np.clip(a_left + a_bottom, 0, 1)[:, :, None]
    out = base * (1 - a)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


cover = crop_16x9(Image.open(ART), 0.5, 0.52, 0.98)
layer(cover, left=0.9, fade_from=0.42, fade_to=0.8, bottom=0.9).save(OUT / 'cover_bg.png')

closing = crop_16x9(Image.open(SHOTS / 's09_civ_night.png'), 0.45, 0.55, 0.45)
closing = closing.filter(ImageFilter.GaussianBlur(1.4))
layer(closing, left=0.5, fade_from=0.6, fade_to=1.0, bottom=0.85, dim=0.78).save(OUT / 'closing_bg.png')

print('cover_bg.png / closing_bg.png written to', OUT)
