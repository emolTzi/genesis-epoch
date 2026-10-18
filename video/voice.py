# Chinese narration for the Genesis Epoch demo.
# Default engine: Google Cloud Text-to-Speech (Chirp 3: HD) via the gcloud login.
# Fallback engine: the offline Microsoft Huihui voice (`--engine sapi`).
# Either way each line is fitted into its caption window, then widened into a room.
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, resample_poly

import gtts

SR = 44100
# 全片统一语速（可由 GOOGLE_TTS_SPEAKING_RATE 覆盖）；不逐句调整，保证听感一致。
RATE = 1.08
CACHE = Path(__file__).resolve().parent / 'out' / 'tts-cache'

LINE_REPLACEMENTS = {
    '2.4 AU': '二点四天文单位', '1 AU': '一个天文单位', '164 K': '一百六十四开尔文',
    '13%': '百分之十三', '0.8%': '百分之零点八', '52%': '百分之五十二',
    'K-Pg': 'K P G', 'L0': 'L零', 'L1': 'L一', 'L2': 'L二', 'L3': 'L三',
    'L4': 'L四', 'L5': 'L五', 'AI': 'A I', 'Web 3D': 'Web 三D',
    '—': '，', '–': '，', '\n': ' ',
}


def read_wav(path):
    sr, x = wavfile.read(str(path))
    if x.dtype == np.int16:
        x = x.astype(np.float32) / 32768.0
    elif x.dtype == np.int32:
        x = x.astype(np.float32) / 2147483648.0
    else:
        x = x.astype(np.float32)
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != SR:
        x = resample_poly(x, SR, sr).astype(np.float32)
    return x


def clean_text(t):
    for a, b in LINE_REPLACEMENTS.items():
        t = t.replace(a, b)
    return re.sub(r'\s+', ' ', t).strip()


def google_line(text, rate, voice):
    """Synthesise one line with Cloud TTS, cached on disk between renders."""
    CACHE.mkdir(parents=True, exist_ok=True)
    tag = hashlib.sha1(f'{voice}|{rate:.2f}|{text}'.encode('utf-8')).hexdigest()[:16]
    wav = CACHE / f'{tag}.wav'
    if not wav.exists():
        wav.write_bytes(gtts.synthesize(text, voice, speaking_rate=rate))
    return read_wav(wav)


def sapi_line(voice, text, rate, path):
    voice.Rate = int(rate)
    voice.Volume = 100
    stream = __import__('win32com.client').client.Dispatch('SAPI.SpFileStream')
    stream.Open(str(path), 3, False)
    voice.AudioOutputStream = stream
    voice.Speak(text)
    stream.Close()
    return read_wav(path)


def sapi_voice():
    import win32com.client as win32
    voice = win32.Dispatch('SAPI.SpVoice')
    voices = voice.GetVoices()
    for i in range(voices.Count):
        v = voices.Item(i)
        try:
            desc = v.GetDescription()
        except Exception:
            desc = ''
        if 'Huihui' in desc or 'Chinese' in desc:
            voice.Voice = v
            break
    return voice


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    engine = 'sapi' if '--engine=sapi' in sys.argv or '--sapi' in sys.argv else 'google'
    film_path, out_path = args[0], args[1]
    film = json.load(open(film_path, encoding='utf-8'))
    caps = film.get('captions', [])
    duration = float(film.get('duration', 0)) + 1.2
    n = int(duration * SR)
    track = np.zeros(n, np.float32)

    cfg = gtts.load_config()
    voice_name = gtts.default_voice(cfg)
    global RATE
    RATE = float(cfg.get('GOOGLE_TTS_SPEAKING_RATE') or RATE)
    voice = sapi_voice() if engine == 'sapi' else None
    tmp = Path(tempfile.mkdtemp(prefix='ge_voice_'))
    made = 0
    fitted = 0

    for i, c in enumerate(caps):
        text = clean_text(str(c.get('text', '')))
        if not text:
            continue
        start = max(0.0, float(c.get('start', 0)))
        end = max(start + 0.8, float(c.get('end', start + 5)))
        hold = end - start

        if engine == 'google':
            # 全片统一语速：一句只合成一次，不再按窗口临时加速，避免忽快忽慢。
            x = google_line(text, RATE, voice_name)
            dur = len(x) / SR
        else:
            best = None
            for rate in (2, 3, 4):
                x = sapi_line(voice, text, rate, tmp / f'{i:03d}_{rate}.wav')
                if best is None or len(x) < len(best):
                    best = x
                if len(best) / SR <= hold - 0.08:
                    break
            x = best
            dur = len(x) / SR

        # 极少数仍超窗的句子：让 TTS 用略快一点的自然语速重说一次，避免整体变调。
        if dur > hold + 0.08 and engine == 'google':
            faster = min(1.32, RATE * dur / max(hold - 0.10, 0.4))
            if faster > RATE * 1.02:
                x2 = google_line(text, faster, voice_name)
                if len(x2) < len(x):
                    x, dur = x2, len(x2) / SR

        # Last-resort fit keeps the narration inside its caption.
        if dur > hold + 0.08:
            over = dur - hold
            target_n = max(1, int((hold - 0.06) * SR))
            x = np.interp(np.linspace(0, len(x) - 1, target_n),
                          np.arange(len(x)), x).astype(np.float32)
            dur = target_n / SR
            fitted += 1
            if engine == 'google':
                print(f'  [fit] #{i + 1} 超出 {over:.2f}s：{text[:24]}')

        # Gentle speech shaping: remove rumble, add a small room tail, normalize the line.
        sos = butter(2, 85 / (SR / 2), 'high', output='sos')
        x = sosfilt(sos, x).astype(np.float32)
        rms = float(np.sqrt(np.mean(x * x) + 1e-12))
        x = (x / max(rms, 1e-5) * 0.085).astype(np.float32)
        fade = min(int(0.015 * SR), len(x) // 3)
        if fade > 0:
            x[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
            x[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)

        i0 = int(start * SR)
        if i0 < n:
            take = min(len(x), n - i0)
            track[i0:i0 + take] += x[:take]
            d1 = int(0.085 * SR)
            if i0 + take + d1 < n:
                track[i0 + d1:i0 + take + d1] += x[:take] * 0.075
            d2 = int(0.17 * SR)
            if i0 + take + d2 < n:
                track[i0 + d2:i0 + take + d2] += x[:take] * 0.032
        made += 1

    peak = float(np.max(np.abs(track)) + 1e-9)
    if peak > 0.92:
        track *= 0.92 / peak
    stereo = np.repeat(track[:, None], 2, axis=1)
    wavfile.write(out_path, SR, (np.clip(stereo, -1, 1) * 32767).astype(np.int16))
    who = 'SAPI' if engine == 'sapi' else f'{voice_name} @{RATE:g}×'
    print(f'narrated {made} lines via {who} -> {out_path} ({duration:.1f}s), {fitted} lines time-fitted')


if __name__ == '__main__':
    main()
