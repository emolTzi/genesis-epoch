# 参赛演示视频制作说明（2 分 27 秒精简版）

## 成片

| 文件 | 规格 / 内容 |
|---|---|
| `out/创世纪元-演示视频.mp4` | 推荐提交版：1920×1080，30 fps，2:27，H.264 High / AAC-LC，160,943,028 字节（约 153.5 MiB） |
| `out/captions.srt` | 29 条字幕与完整时间码（UTF-8），可直接上传 |
| `out/voice.wav` | Google Cloud TTS 中文解说音轨 |
| `out/mixed.wav` | 程序化配乐 + 解说的混音母带 |
| `out/film.json` | 事件、字幕与解说时间线 |
| `out/演示视频-封面.jpg`、`out/演示视频-分镜联系表.jpg` | 投递用封面与分镜概览 |
| `docs/submission/out/创世纪元-演示视频.mp4` | 主提交目录中的同一文件 |
| `docs/submission/out/delivery/创世纪元-演示视频.mp4` | 提交包引用的交付副本 |
| `docs/submission/out/package/创世纪元-参赛提交-20261019/02_演示视频/` | 提交包内视频与 SRT |

长版与历史版本归档在 `out/archive_5min/`，不参与本次 3 分钟提交。

## 叙事顺序

| 时间 | 段落 | 真实交互 / 镜头 |
|---|---|---|
| 0:00 | 冷开场与片名 | 星场、两次文明确认、粒子片名 |
| 0:10 | 实验大厅 | 自由探索、认知校准、六把钥匙 |
| 0:17 | 参数空间 | 轨道 1 AU → 2.4 AU，L1 冰封断链 |
| 0:26 | L0 精细调节 | 宇宙网；强相互作用偏移 0.8%，L0 断裂 |
| 0:40 | L1 宜居带 | 宇宙网 → 银河系 → 恒星系；轨道往返 |
| 0:56 | L2 恒温器 | 真实地球；硅酸盐风化归零，L2 温室失控 |
| 1:11 | L3 撞击 | 点击真实历史位置，K-Pg 闪光与烟尘 |
| 1:29 | L4 文明沙盘 | 低合作崩溃 → 回卷起点 → 高合作延续 → 城市夜景 → 灰线旧分支 |
| 1:52 | L5 费米悖论 | 一万个宇宙逐点熄灭 → 真实地球 → 未来四参数 |
| 2:21 | 片尾 | 主题句、片名、团队、素材与 AI 使用说明 |

## 解说与混音

- 引擎：Google Cloud Text-to-Speech `cmn-CN-Chirp3-HD-Charon`。
- 全片统一 `speaking_rate=1.2`，共 29 条字幕；实际语音合成仅 1 条因 0.09 秒溢出做轻微时间拟合，其余全部落在字幕窗口内。
- 配乐：`score.py` 按 `film.json` 事件离线合成；`mix_audio.py` 将配乐压到解说之下并做峰值保护。
- 成片音频：AAC-LC 44.1 kHz 双声道，无爆音；最终解码峰值约 −0.22 dBFS。

## 重新渲染

```bash
npm run build          # 重新生成单文件作品 dist/index.html
node video/render.mjs  # 逐帧录制 + 配乐 + 解说 + 混音 + 封装
```

完整渲染约 15 分钟，输出 `out/video.mp4`（无声画面），随后自动生成 `out/film.json`、`out/captions.srt`、`out/score.wav`、`out/voice.wav`、`out/mixed.wav` 和最终 `out/创世纪元-演示视频.mp4`。

预览：

```bash
node video/render.mjs --preview --from 0 --to 40 --every 30
```

## 关键文件

- 叙事与交互编排：`video/overlay.js`（当前精简版）；`video/overlay_5min.js`（长版备份）。
- 配音：`video/voice.py`；Google TTS 配置见 `video/.tts.env`；离线 SAPI 可回退。
- 配乐：`video/score.py`；混音：`video/mix_audio.py`。
- 分镜：`docs/演示视频分镜脚本.md`。
