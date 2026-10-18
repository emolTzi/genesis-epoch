# Mix the generated score and narration with speech-forward loudness management.
import sys
import numpy as np
from scipy.io import wavfile

def read(path):
    sr, x = wavfile.read(path)
    if x.dtype == np.int16: x = x.astype(np.float32) / 32768.0
    elif x.dtype == np.int32: x = x.astype(np.float32) / 2147483648.0
    else: x = x.astype(np.float32)
    if x.ndim == 1: x = np.repeat(x[:, None], 2, axis=1)
    elif x.shape[1] == 1: x = np.repeat(x, 2, axis=1)
    return sr, x

def rms(x):
    return float(np.sqrt(np.mean(x * x) + 1e-12))

score_path, voice_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
sr1, bg = read(score_path)
sr2, vo = read(voice_path)
if sr1 != sr2:
    raise SystemExit('sample rate mismatch')
n = max(len(bg), len(vo))
bg = np.pad(bg, ((0, n-len(bg)), (0, 0)))
vo = np.pad(vo, ((0, n-len(vo)), (0, 0)))
# Keep the score atmospheric and the narration unmistakably on top.
bg *= 0.095 / max(rms(bg), 1e-6)
vo *= 0.145 / max(rms(vo), 1e-6)
mix = bg * 0.72 + vo
# Soft limiter / peak normalise.
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
peak = float(np.max(np.abs(mix)) + 1e-9)
if peak > 0.92:
    mix *= 0.92 / peak
wavfile.write(out_path, sr1, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
print(f'mixed {n/sr1:.1f}s -> {out_path}')