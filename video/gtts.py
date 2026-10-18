"""Google Cloud Text-to-Speech backend for the Genesis Epoch narration.

The narration track used to be synthesised by the offline Windows SAPI voice
(see `voice.py`).  This module talks to the Cloud TTS REST endpoint with the
gcloud CLI user credentials, so `voice.py` can keep its caption-window fitting
pipeline unchanged.

Auth: `gcloud auth print-access-token` (run once in the browser via
`gcloud auth login`).  No API key is stored anywhere.

Settings, in order: environment, then video/.tts.env, then <repo>/.tts.env.
    GOOGLE_TTS_VOICE           e.g. cmn-CN-Chirp3-HD-Achernar
    GOOGLE_TTS_PROJECT         quota/billing project; defaults to gcloud config
    GOOGLE_TTS_SPEAKING_RATE   1.0 by default

CLI:
    python gtts.py voices                # list cmn-* voices
    python gtts.py say "文本" out.wav     # one-off synthesis
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

ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'
VOICES_ENDPOINT = 'https://texttospeech.googleapis.com/v1/voices'
HERE = Path(__file__).resolve().parent
ENV_FILES = (HERE / '.tts.env', HERE.parent / '.tts.env')
GCLOUD_FALLBACK = Path(os.environ.get('LOCALAPPDATA', '')) / \
    'Google' / 'Cloud SDK' / 'google-cloud-sdk' / 'bin' / 'gcloud.cmd'

_token_cache = {}


def load_config():
    """Return a dict of GOOGLE_TTS_* settings from the environment and env file."""
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
    for name in ('GOOGLE_TTS_VOICE', 'GOOGLE_TTS_PROJECT', 'GOOGLE_TTS_SPEAKING_RATE'):
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


def _request(url, body=None, cfg=None, timeout=120):
    cfg = cfg if cfg is not None else load_config()
    data = None if body is None else json.dumps(body).encode('utf-8')
    headers = {
        'Authorization': f'Bearer {access_token(cfg)}',
        'Content-Type': 'application/json; charset=utf-8',
    }
    proj = project(cfg)
    if proj:
        headers['x-goog-user-project'] = proj
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
        raise RuntimeError(f'TTS HTTP {exc.code}: {detail}') from None


def list_voices(language='cmn-CN', cfg=None):
    return _request(f'{VOICES_ENDPOINT}?languageCode={language}',
                    cfg=cfg).get('voices', [])


def synthesize(text, voice, speaking_rate=1.0, sample_rate=24000, cfg=None):
    """Synthesise `text` and return WAV bytes."""
    cfg = cfg if cfg is not None else load_config()
    body = {
        'input': {'text': text},
        'voice': {'languageCode': '-'.join(voice.split('-')[:2]), 'name': voice},
        'audioConfig': {
            'audioEncoding': 'LINEAR16',
            'sampleRateHertz': sample_rate,
            'speakingRate': speaking_rate,
        },
    }
    payload = _request(ENDPOINT, body, cfg=cfg)
    audio = base64.b64decode(payload['audioContent'])
    if audio[:4] == b'RIFF':
        return audio
    # Some voices return headerless PCM; wrap it so `wave` can read it.
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        out.writeframes(audio)
    return buf.getvalue()


def default_voice(cfg=None):
    cfg = cfg if cfg is not None else load_config()
    return cfg.get('GOOGLE_TTS_VOICE') or 'cmn-CN-Chirp3-HD-Achernar'


def main(argv):
    if len(argv) < 2 or argv[1] not in ('voices', 'say'):
        print(__doc__)
        return 2
    if argv[1] == 'voices':
        for v in list_voices():
            print(f"{v['name']:<32} {v.get('ssmlGender', ''):<8} "
                  f"{v.get('naturalSampleRateHertz', '')}")
        return 0
    if len(argv) < 4:
        print('usage: python gtts.py say "text" out.wav [voice]')
        return 2
    text, out = argv[2], argv[3]
    voice = argv[4] if len(argv) > 4 else default_voice()
    wav = synthesize(text, voice)
    Path(out).write_bytes(wav)
    print(f'{len(wav) / 1024:.1f} KiB -> {out} ({voice})')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
