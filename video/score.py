# 演示视频配乐：按渲染时记录的事件（章节情绪、转场、解锁、撞击、质变、点击……）离线合成。
# 全部由程序生成，不使用任何外部音频素材。
#   python score.py out/film.json out/score.wav
import json
import sys

import numpy as np
from scipy.signal import oaconvolve, butter, sosfilt

SR = 44100
rng = np.random.default_rng(2026)

film = json.load(open(sys.argv[1], encoding='utf-8'))
dur = float(film['duration']) + 1.0
N = int(dur * SR)
L = np.zeros(N, np.float32)
R = np.zeros(N, np.float32)
events = film['events']


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(buf_l, buf_r, sig, t0, pan=0.0, gain=1.0):
    i0 = int(t0 * SR)
    if i0 >= N or i0 + len(sig) <= 0:
        return
    s = sig
    if i0 < 0:
        s = s[-i0:]
        i0 = 0
    s = s[: N - i0]
    gl = gain * np.sqrt(0.5 * (1 - pan))
    gr = gain * np.sqrt(0.5 * (1 + pan))
    buf_l[i0:i0 + len(s)] += (s * gl).astype(np.float32)
    buf_r[i0:i0 + len(s)] += (s * gr).astype(np.float32)


def env(n, a, r, hold=None):
    """线性起音、余弦释放的包络。"""
    e = np.ones(n, np.float32)
    na = max(1, int(a * SR))
    nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    if nr < n:
        e[-nr:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, nr)))
    return e


def lowpass(x, fc):
    sos = butter(2, fc / (SR / 2), 'low', output='sos')
    return sosfilt(sos, x).astype(np.float32)


def bandpass(x, lo, hi):
    sos = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos')
    return sosfilt(sos, x).astype(np.float32)


# ───────── 和声铺底 ─────────
# 每种情绪：和弦序列（MIDI 音高）、每个和弦时长、亮度（泛音衰减）、音量、是否带律动
D, E, F, G, A, B, C = 50, 52, 53, 55, 57, 59, 48
MOODS = {
    'open':     dict(chords=[[38, 50, 57, 64], [38, 50, 57, 62, 69]], dur=9, bright=2.2, gain=0.9, pulse=False),
    'hall':     dict(chords=[[38, 53, 57, 60, 64], [34, 53, 58, 62, 69], [31, 50, 55, 58, 65], [33, 52, 57, 61, 64]], dur=8, bright=1.8, gain=0.8, pulse=False),
    'origin':   dict(chords=[[26, 38, 45, 57, 64], [26, 38, 45, 55, 62]], dur=10, bright=2.4, gain=0.95, pulse=False),
    'stars':    dict(chords=[[41, 53, 57, 60, 64], [36, 52, 55, 62, 67], [38, 53, 57, 60, 65], [34, 53, 58, 62, 65]], dur=7, bright=1.6, gain=0.75, pulse=False),
    'elements': dict(chords=[[33, 52, 55, 60, 64], [29, 53, 57, 60, 64], [36, 52, 55, 60, 67], [31, 50, 55, 59, 62]], dur=7, bright=1.7, gain=0.75, pulse=False),
    'life':     dict(chords=[[38, 50, 57, 62, 65], [34, 50, 58, 62, 65], [29, 53, 57, 60, 65], [36, 52, 55, 60, 64]], dur=6.5, bright=1.6, gain=0.8, pulse=False),
    'civ':      dict(chords=[[38, 50, 57, 62, 65], [31, 50, 55, 58, 62], [34, 50, 58, 62, 65], [33, 52, 57, 61, 64]], dur=6, bright=1.5, gain=0.75, pulse=True),
    'finale':   dict(chords=[[38, 50, 57, 62, 66], [35, 50, 54, 59, 62], [31, 50, 55, 59, 62], [33, 52, 57, 61, 64]], dur=7, bright=1.5, gain=0.85, pulse=False),
    'silence':  dict(chords=[[38, 50, 57]], dur=8, bright=2.6, gain=0.35, pulse=False),
    'outro':    dict(chords=[[38, 54, 57, 61, 64], [31, 50, 55, 59, 66], [35, 50, 54, 57, 62], [33, 52, 57, 61, 64], [38, 54, 57, 62, 69]], dur=4, bright=1.5, gain=0.95, pulse=False),
}

# 情绪时间线：作品的 setMood 事件 + 片头 / 片尾
timeline = []
for e in events:
    if e['type'] == 'mood':
        m = e.get('mood', 'hall')
        if m not in MOODS:
            m = 'hall'
        if not timeline or timeline[-1][1] != m:
            timeline.append((e['t'], m))
outro_t = dur - 17.5
timeline = [x for x in timeline if x[0] < outro_t] + [(outro_t, 'outro')]
timeline.sort()
if not timeline or timeline[0][0] > 0.01:
    timeline.insert(0, (0.0, 'open'))


def pad_voice(f, n, bright, phase):
    t = np.arange(n, dtype=np.float32) / SR
    vib = 1 + 0.0016 * np.sin(2 * np.pi * (4.2 + phase) * t)
    out = np.zeros(n, np.float32)
    for h in range(1, 7):
        if f * h > 9000:
            break
        out += np.sin(2 * np.pi * f * h * t * vib + phase * h) / (h ** bright)
    return out


def chord_at(notes, t0, length, mood):
    n = int((length + 3.5) * SR)
    e = env(n, min(2.2, length * 0.35), 3.2)
    for k, m in enumerate(notes):
        f = midi(m)
        if m < 45:  # 低音用纯正弦
            t = np.arange(n, dtype=np.float32) / SR
            sig = np.sin(2 * np.pi * f * t) * 0.9 + np.sin(4 * np.pi * f * t) * 0.15
            add(L, R, sig * e, t0, 0, 0.11 * mood['gain'])
            continue
        for det, pan in ((-4, -0.55), (4, 0.55)):
            ff = f * 2 ** (det / 1200)
            sig = pad_voice(ff, n, mood['bright'], rng.random() * 6.28)
            add(L, R, sig * e, t0, pan * (0.4 + 0.15 * k), 0.034 * mood['gain'])


def pulses(notes, t0, length, bpm=112):
    step = 60 / bpm / 2
    t = t0
    k = 0
    while t < t0 + length:
        m = notes[1 + (k * 3) % (len(notes) - 1)] + 12
        f = midi(m)
        n = int(0.42 * SR)
        tt = np.arange(n, dtype=np.float32) / SR
        sig = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 9)
        add(L, R, sig, t, 0.5 if k % 2 else -0.5, 0.032 if k % 4 == 0 else 0.018)
        t += step
        k += 1


for i, (t0, m) in enumerate(timeline):
    t1 = timeline[i + 1][0] if i + 1 < len(timeline) else dur
    mood = MOODS[m]
    t = t0
    j = 0
    while t < t1 - 0.5:
        length = min(mood['dur'], t1 - t + 1.5)
        notes = mood['chords'][j % len(mood['chords'])]
        chord_at(notes, t, length, mood)
        if mood['pulse']:
            pulses(notes, t, min(length, t1 - t))
        t += mood['dur']
        j += 1

# 高处的星光：琶音点缀
for i, (t0, m) in enumerate(timeline):
    if m not in ('hall', 'stars', 'finale', 'outro'):
        continue
    t1 = timeline[i + 1][0] if i + 1 < len(timeline) else dur
    t = t0 + 1
    scale = [74, 76, 77, 81, 84, 86, 88] if m != 'finale' and m != 'outro' else [74, 78, 81, 83, 86, 90, 93]
    while t < t1:
        f = midi(scale[int(rng.random() * len(scale))])
        n = int(1.6 * SR)
        tt = np.arange(n, dtype=np.float32) / SR
        sig = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 3.2) * np.minimum(1, tt * 200)
        add(L, R, sig, t, rng.random() * 1.6 - 0.8, 0.012)
        t += 0.45 + rng.random() * 0.9

# ───────── 音效 ─────────


def noise(n):
    return rng.standard_normal(n).astype(np.float32)


def boom(t0, f0=58, f1=28, length=2.4, g=0.5):
    n = int(length * SR)
    tt = np.arange(n, dtype=np.float32) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 3)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) * np.exp(-tt * 1.8)
    sig += lowpass(noise(n), 900) * np.exp(-tt * 6) * 0.6
    add(L, R, sig, t0, 0, g)


def riser(t_end, length=2.2, g=0.16):
    """噪声上扬：低通与高通两版按时间交叉淡化。"""
    n = int(length * SR)
    tt = np.arange(n, dtype=np.float32) / SR
    x = noise(n)
    k = (tt / length) ** 2
    out = (lowpass(x, 700) * (1 - k) + bandpass(x, 2500, 12000) * k) * k
    add(L, R, out, t_end - length, 0, g)


def whoosh(t0, g=0.13):
    n = int(1.1 * SR)
    tt = np.arange(n, dtype=np.float32) / SR
    x = bandpass(noise(n), 400, 4000)
    e = np.sin(np.pi * np.clip(tt / 1.1, 0, 1)) ** 2
    pan = np.linspace(-0.8, 0.8, n)
    add(L, R, x * e * (1 - pan) * 0.7, t0, -0.6, g)
    add(L, R, x * e * (1 + pan) * 0.7, t0, 0.6, g)


def bell(t0, f, g=0.08, length=2.4, pan=0.0):
    n = int(length * SR)
    tt = np.arange(n, dtype=np.float32) / SR
    mod = np.sin(2 * np.pi * f * 1.4 * tt) * 2.2 * np.exp(-tt * 2.5)
    sig = np.sin(2 * np.pi * f * tt + mod) * np.exp(-tt * 2.2)
    add(L, R, sig, t0, pan, g)


def tick(t0, f=2200, g=0.05, length=0.05):
    n = int(length * SR)
    tt = np.arange(n, dtype=np.float32) / SR
    sig = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 90) + noise(n) * np.exp(-tt * 200) * 0.3
    add(L, R, sig, t0, 0.2, g)


def rumble(t0, length=4.0, g=0.4):
    n = int(length * SR)
    tt = np.arange(n, dtype=np.float32) / SR
    sig = lowpass(noise(n), 160) * np.exp(-tt * 0.7) * 2.5
    f = 70 * np.exp(-tt * 0.5)
    sig += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 0.9)
    add(L, R, sig, t0, 0, g)


last = {}
for e in events:
    t = e['t']
    ty = e['type']
    gap = t - last.get(ty, -9)
    if ty == 'hit':
        riser(t, 2.4, 0.18)
        boom(t + 0.05, 62, 26, 3.2, 0.55)
        bell(t + 0.05, midi(74), 0.06, 3.5)
    elif ty == 'whoosh':
        whoosh(t - 0.2)
    elif ty == 'chapter':
        boom(t, 90, 45, 1.4, 0.28)
        bell(t + 0.1, midi(81), 0.05, 2.5, 0.3)
    elif ty == 'card' and gap > 0.5:
        tick(t, 1650, 0.035, 0.08)
        bell(t + 0.04, midi(88), 0.018, 0.9, -0.3)
    elif ty == 'click' and gap > 0.08:
        tick(t, 2600, 0.05)
    elif ty == 'type':
        tick(t, 3200 + rng.random() * 600, 0.018, 0.03)
    elif ty == 'hl' and gap > 0.4:
        bell(t, midi(86), 0.025, 0.8, 0.4)
    elif ty == 'modal' and gap > 0.6:
        bell(t, midi(76), 0.035, 1.6, -0.2)
        bell(t + 0.08, midi(83), 0.025, 1.6, 0.2)
    elif ty == 'unlock' and gap > 0.3:
        for k, m in enumerate((74, 78, 81, 86)):
            bell(t + k * 0.09, midi(m), 0.045, 2.2, -0.4 + k * 0.27)
    elif ty == 'chime' and gap > 0.3:
        bell(t, midi(84), 0.04, 2.0)
    elif ty == 'leap' and gap > 0.35:
        boom(t, 120, 60, 0.7, 0.12)
        bell(t, midi(79), 0.03, 1.2, 0.2)
    elif ty == 'impact' and gap > 1:
        boom(t, 70, 22, 4.0, 0.7)
        rumble(t, 3.5, 0.25)
    elif ty == 'extinct' and gap > 1:
        rumble(t, 4.5, 0.45)
    last[ty] = t

# ───────── 混响与母带 ─────────
ir_n = int(3.2 * SR)
it = np.arange(ir_n, dtype=np.float32) / SR
irL = rng.standard_normal(ir_n).astype(np.float32) * np.exp(-it * 2.1)
irR = rng.standard_normal(ir_n).astype(np.float32) * np.exp(-it * 2.1)
irL = lowpass(irL, 5000)
irR = lowpass(irR, 5000)
irL /= np.sqrt(np.sum(irL ** 2))
irR /= np.sqrt(np.sum(irR ** 2))
wetL = oaconvolve(L, irL)[:N].astype(np.float32)
wetR = oaconvolve(R, irR)[:N].astype(np.float32)
outL = L * 0.72 + wetL * 0.5
outR = R * 0.72 + wetR * 0.5

# 首尾淡入淡出
fade_in = int(1.5 * SR)
fade_out = int(3.5 * SR)
ramp = np.linspace(0, 1, fade_in, dtype=np.float32)
outL[:fade_in] *= ramp
outR[:fade_in] *= ramp
ramp = np.linspace(1, 0, fade_out, dtype=np.float32)
outL[-fade_out:] *= ramp
outR[-fade_out:] *= ramp

# 响度：RMS 约 −19 dBFS，软限幅后峰值 −1 dBFS
rms = np.sqrt(np.mean(np.concatenate([outL, outR]) ** 2)) + 1e-9
g = 10 ** (-19 / 20) / rms
outL = np.tanh(outL * g * 1.1) / 1.1
outR = np.tanh(outR * g * 1.1) / 1.1
peak = max(np.max(np.abs(outL)), np.max(np.abs(outR)))
norm = 10 ** (-1 / 20) / peak
pcm = (np.stack([outL, outR], 1) * norm * 32767).astype(np.int16)

import wave
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('score', sys.argv[2], f'{dur:.1f}s', 'moods', [m for _, m in timeline])
