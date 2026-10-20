"""Google Cloud Text-to-Speech helper for the Genesis Epoch narration.

Two engines share one interface:

* ``chirp3`` (default) — Chirp 3: HD voices, endpoint ``v1/text:synthesize``.
  Voice names look like ``cmn-CN-Chirp3-HD-Charon``.
* ``gemini`` — Gemini-TTS, endpoint ``v1beta1/text:synthesize``. Voice names are
  short (``Kore``, ``Charon`` …), the model goes in ``voice.modelName``, and an
  optional natural-language ``prompt`` steers style. Chinese (``cmn-CN``) is in
  preview and the per-minute quota is tight, so requests retry on HTTP 429.

Auth: ``gcloud auth print-access-token`` (one browser login, no API key stored).

Settings, in order: environment, then ``video/.tts.env``, then ``<repo>/.tts.env``.
Every setting has an environment variable so other tools can just call the CLI:

    GOOGLE_TTS_ENGINE            chirp3 | gemini                (default chirp3)
    GOOGLE_TTS_MODEL             gemini-2.5-flash-tts           (gemini only)
    GOOGLE_TTS_VOICE             cmn-CN-Chirp3-HD-Charon        (chirp3)
    GOOGLE_TTS_GEMINI_VOICE      Kore                           (gemini)
    GOOGLE_TTS_PROMPT            style instruction              (gemini only)
    GOOGLE_TTS_SPEAKING_RATE     1.0
    GOOGLE_TTS_PROJECT           quota/billing project
    GOOGLE_TTS_ENDPOINT_CHIRP3   override endpoint
    GOOGLE_TTS_ENDPOINT_GEMINI   override endpoint
    GOOGLE_TTS_RETRY_SECONDS     70 (sleep between 429 retries)

CLI:
    python gtts.py voices [--engine gemini]
    python gtts.py say "文本" out.wav [--engine gemini] [--voice Kore] [--prompt "…"]
                       [--rate 1.1] [--model gemini-2.5-pro-tts]
"""
import base64
import io
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

ENDPOINT_CHIRP3 = 'https://texttospeech.googleapis.com/v1/text:synthesize'
ENDPOINT_GEMINI = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize'
VOICES_ENDPOINT = 'https://texttospeech.googleapis.com/v1/voices'
HERE = Path(__file__).resolve().parent
ENV_FILES = (HERE / '.tts.env', HERE.parent / '.tts.env')
GCLOUD_FALLBACK = Path(os.environ.get('LOCALAPPDATA', '')) / \
    'Google' / 'Cloud SDK' / 'google-cloud-sdk' / 'bin' / 'gcloud.cmd'

KNOWN_KEYS = (
    'GOOGLE_TTS_ENGINE', 'GOOGLE_TTS_MODEL', 'GOOGLE_TTS_VOICE',
    'GOOGLE_TTS_GEMINI_VOICE', 'GOOGLE_TTS_PROMPT', 'GOOGLE_TTS_SPEAKING_RATE',
    'GOOGLE_TTS_PROJECT', 'GOOGLE_TTS_ENDPOINT_CHIRP3',
    'GOOGLE_TTS_ENDPOINT_GEMINI', 'GOOGLE_TTS_RETRY_SECONDS',
)
_token_cache = {}


def load_config():
    """Return GOOGLE_TTS_* settings from the env files, overridden by the environment."""
    cfg = {}
    for path in ENV_FILES:
        if not path.exists():
            continue
        for line in path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            name, value = line.split('=', 1)
            cfg[name.strip()] = value.strip().strip('"').strip("'")
    for name in KNOWN_KEYS:
        if os.environ.get(name):
            cfg[name] = os.environ[name]
    return cfg


def gcloud_exe():
    found = shutil.which('gcloud') or shutil.which('gcloud.cmd')
    if found:
        return found
    if GCLOUD_FALLBACK.exists():
        return str(GCLOUD_FALLBACK)
    raise RuntimeError('gcloud not found on PATH; install the Google Cloud CLI first')


def _run_gcloud(args, timeout=60):
    exe = gcloud_exe()
    proc = subprocess.run([exe, *args], capture_output=True, text=True,
                          timeout=timeout,
                          creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip().splitlines()
        msg = detail[-1] if detail else f'gcloud exited {proc.returncode}'
        raise RuntimeError(f'gcloud {" ".join(args)} failed: {msg}')
    return proc.stdout.strip()


def access_token(cfg=None):
    """Return a cached OAuth access token from the gcloud CLI."""
    now = time.time()
    if _token_cache.get('expires', 0) > now:
        return _token_cache['token']
    token = _run_gcloud(['auth', 'print-access-token']).splitlines()[-1].strip()
    if not token:
        raise RuntimeError('empty access token; run: gcloud auth login')
    _token_cache.update(token=token, expires=now + 3000)
    return token


def project(cfg=None):
    cfg = cfg if cfg is not None else load_config()
    proj = (cfg.get('GOOGLE_TTS_PROJECT') or '').strip()
    if proj:
        return proj
    try:
        return _run_gcloud(['config', 'get-value', 'project']).strip()
    except RuntimeError:
        return ''


def _request(url, body=None, cfg=None, timeout=180):
    cfg = cfg if cfg is not None else load_config()
    retry = float(cfg.get('GOOGLE_TTS_RETRY_SECONDS') or 70)
    headers = {
        'Authorization': f'Bearer {access_token(cfg)}',
        'Content-Type': 'application/json; charset=utf-8',
    }
    proj = project(cfg)
    if proj:
        headers['x-goog-user-project'] = proj
    data = None if body is None else json.dumps(body).encode('utf-8')

    for attempt in (1, 2, 3):
        req = urllib.request.Request(
            url, data=data, headers=headers,
            method='GET' if body is None else 'POST')
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', 'replace')
            try:
                detail = json.loads(detail)['error']['message']
            except Exception:
                pass
            if exc.code == 429 and attempt < 3:
                time.sleep(retry)
                continue
            raise RuntimeError(f'TTS HTTP {exc.code}: {detail}') from None
    raise RuntimeError('TTS request failed after retries')


def list_voices(language='cmn-CN', cfg=None):
    return _request(f'{VOICES_ENDPOINT}?languageCode={language}',
                    cfg=cfg).get('voices', [])


def engine_of(cfg=None):
    cfg = cfg if cfg is not None else load_config()
    return (cfg.get('GOOGLE_TTS_ENGINE') or 'chirp3').strip().lower()


def default_voice(cfg=None, engine=None):
    cfg = cfg if cfg is not None else load_config()
    if (engine or engine_of(cfg)) == 'gemini':
        return cfg.get('GOOGLE_TTS_GEMINI_VOICE') or 'Kore'
    return cfg.get('GOOGLE_TTS_VOICE') or 'cmn-CN-Chirp3-HD-Achernar'


def _lang_of(voice):
    """'cmn-CN-Chirp3-HD-Charon' -> 'cmn-CN'; 'Kore' -> cfg/default 'cmn-CN'."""
    parts = voice.split('-')
    if len(parts) >= 2 and len(parts[0]) in (2, 3) and len(parts[1]) == 2:
        return f'{parts[0]}-{parts[1]}'
    return 'cmn-CN'


def _wavify(audio, sample_rate):
    if audio[:4] == b'RIFF':
        return audio
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        out.writeframes(audio)
    return buf.getvalue()


def synthesize(text, voice=None, speaking_rate=None, sample_rate=24000,
               cfg=None, engine=None, model=None, prompt=None):
    """Synthesise `text` and return WAV bytes (LINEAR16)."""
    cfg = cfg if cfg is not None else load_config()
    engine = (engine or engine_of(cfg)).lower()
    voice = voice or default_voice(cfg)
    if speaking_rate is None:
        try:
            speaking_rate = float(cfg.get('GOOGLE_TTS_SPEAKING_RATE') or 1.0)
        except ValueError:
            speaking_rate = 1.0
    audio_cfg = {
        'audioEncoding': 'LINEAR16',
        'sampleRateHertz': sample_rate,
        'speakingRate': speaking_rate,
    }

    if engine == 'gemini':
        model = model or cfg.get('GOOGLE_TTS_MODEL') or 'gemini-2.5-flash-tts'
        prompt = prompt if prompt is not None else cfg.get('GOOGLE_TTS_PROMPT')
        name = voice.split('-')[-1] if '-' in voice else voice
        body = {
            'input': {'prompt': prompt, 'text': text} if prompt else {'text': text},
            'voice': {'languageCode': _lang_of(voice) if '-' in voice else 'cmn-CN',
                      'name': name, 'modelName': model},
            'audioConfig': audio_cfg,
        }
        endpoint = cfg.get('GOOGLE_TTS_ENDPOINT_GEMINI') or ENDPOINT_GEMINI
    else:
        body = {
            'input': {'text': text},
            'voice': {'languageCode': _lang_of(voice), 'name': voice},
            'audioConfig': audio_cfg,
        }
        endpoint = cfg.get('GOOGLE_TTS_ENDPOINT_CHIRP3') or ENDPOINT_CHIRP3

    payload = _request(endpoint, body, cfg=cfg)
    return _wavify(base64.b64decode(payload['audioContent']), sample_rate)


def parse_args(argv):
    """Tiny flag parser: positional args keep the old `say text out [voice]` order."""
    args, opts = [], {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith('--'):
            key = a[2:]
            if '=' in key:
                key, value = key.split('=', 1)
            else:
                value = argv[i + 1] if i + 1 < len(argv) else ''
                i += 1
            opts[key.replace('-', '_')] = value
        else:
            args.append(a)
        i += 1
    return args, opts


def main(argv):
    if len(argv) < 2 or argv[1] not in ('voices', 'say'):
        print(__doc__)
        return 2
    rest, opts = parse_args(argv[2:])
    cfg = load_config()
    engine = opts.get('engine') or engine_of(cfg)

    if argv[1] == 'voices':
        for v in list_voices():
            print(f"{v['name']:<32} {v.get('ssmlGender', ''):<8} "
                  f"{v.get('naturalSampleRateHertz', '')}")
        return 0

    if len(rest) < 2:
        print('usage: python gtts.py say "text" out.wav [--engine gemini] [--voice Kore]')
        return 2
    text, out = rest[0], rest[1]
    voice = opts.get('voice') or (rest[2] if len(rest) > 2 else default_voice(cfg, engine))
    wav = synthesize(text, voice, cfg=cfg, engine=engine,
                     model=opts.get('model'), prompt=opts.get('prompt'),
                     speaking_rate=float(opts['rate']) if 'rate' in opts else None)
    Path(out).write_bytes(wav)
    print(f'{len(wav) / 1024:.1f} KiB -> {out} ({engine}, {voice})')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
