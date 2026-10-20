# 语音合成（Cloud TTS）快调用

给其他 agent / 其他工具用的速查页。**不需要 API Key**：凭据来自本机已登录的 gcloud 账号（`gcloud auth login` 已完成）。

## 一、环境变量（已写入用户级，开新终端即生效）

| 变量 | 值 | 说明 |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | `project-7af3b5b5-0159-414f-9ae` | 已开通结算与 TTS API 的项目 |
| `GOOGLE_TTS_PROJECT` | 同上 | 计费/配额项目（会作为 `x-goog-user-project` 发送） |
| `GOOGLE_TTS_ENGINE` | `chirp3` | 默认引擎：`chirp3` 或 `gemini` |
| `GOOGLE_TTS_MODEL` | `gemini-2.5-flash-tts` | Gemini 引擎的模型（另可用 `gemini-2.5-pro-tts`） |
| `GOOGLE_TTS_VOICE` | `cmn-CN-Chirp3-HD-Charon` | Chirp3 默认音色 |
| `GOOGLE_TTS_GEMINI_VOICE` | `Kore` | Gemini 默认音色（短名，如 `Charon`、`Puck`） |
| `GOOGLE_TTS_PROMPT` | 沉稳纪录片语气… | Gemini 的风格提示词（作为 `input.prompt` 发送，不会被念出来） |
| `GOOGLE_TTS_SPEAKING_RATE` | `1.2` | 全片统一语速（与 `video/.tts.env` 一致） |
| `GOOGLE_TTS_ENDPOINT_CHIRP3` | `…/v1/text:synthesize` | 可覆盖 |
| `GOOGLE_TTS_ENDPOINT_GEMINI` | `…/v1beta1/text:synthesize` | Gemini 必须 v1beta1 |
| `GOOGLE_TTS_RETRY_SECONDS` | `70` | 429 时的重试间隔（Gemini 配额很紧） |
| `GOOGLE_TTS_HELPER` | `…\video\gtts.py` | 脚本路径 |
| `GOOGLE_TTS_CLI` | `…\video\bin\tts.cmd` | 命令行封装 |
| `GOOGLE_TTS_CACHE` | `…\video\out\tts-cache` | 逐句缓存目录 |

`video/.tts.env` 仍是本机配置的落盘副本（已 gitignore），优先级低于环境变量。

## 二、三种调用方式

```bat
:: 1) 命令行（已加入 PATH，新终端直接可用）
tts say "在已知的宇宙里，我们只确认过一次文明。" out.wav
tts say "同一句话。" gemini.wav --engine gemini --voice Charon
tts say "换模型。" pro.wav --engine gemini --model gemini-2.5-pro-tts
tts voices
```

```powershell
# 2) 直接跑脚本（不依赖 PATH）
python C:\Development\genesis-epoch\video\gtts.py say "文本" out.wav --engine gemini
```

```python
# 3) 在 Python 里调用（与 voice.py 同一套接口）
import sys; sys.path.insert(0, r'C:\Development\genesis-epoch\video')
import gtts

wav = gtts.synthesize('文本', 'cmn-CN-Chirp3-HD-Charon')                  # Chirp3，返回 WAV bytes
wav = gtts.synthesize('文本', engine='gemini', voice='Kore')              # Gemini
open('out.wav', 'wb').write(wav)
```

## 三、两个引擎的差别

| | chirp3（默认，成片在用） | gemini |
|---|---|---|
| 模型 | 固定 | `gemini-2.5-flash-tts` / `gemini-2.5-pro-tts` |
| 音色名 | `cmn-CN-Chirp3-HD-Charon` | `Kore`、`Charon`、`Puck`… |
| 风格控制 | 无 | `input.prompt` 自然语言指令 |
| 中文状态 | GA | **Preview**（`cmn-CN`） |
| 配额 | 宽松 | 每分钟个位数请求，容易 429（脚本已按 70s 退避重试 3 次） |
| 计费 | 按字符 | 高于 Chirp3 |

## 四、注意

- 批量合成（40 句旁白）请用 chirp3；Gemini 适合少量、需要情绪控制的句子。
- 返回 `LINEAR16` 即 24 kHz 单声道 WAV；要 MP3 需在 `audioConfig.audioEncoding` 改，但 `synthesize()` 只封装 WAV。
- 令牌有效期约 1 小时，`gtts.py` 每次进程启动会重新取，无需手工维护。
- 本页所有变量都不含密钥；不要把 access token 写进环境变量或仓库。
