# 演示视频渲染

演示视频由程序逐帧渲染：用 Edge 无头模式打开作品单文件 `dist/index.html`，以虚拟时钟逐帧推进真实作品并截图，叠加动态图形、字幕与光标操作，再交给 ffmpeg 编码。画面中的作品内容全部是项目实际运行结果。

新版成片细节、时间轴与优化记录见 [README_参赛剪辑.md](README_参赛剪辑.md)。

## 快速使用

```bash
# 在项目根目录
npm run build
node video/render.mjs
```

建议提交文件：

- `video/out/创世纪元-演示视频.mp4`（1920×1080，30 fps，约 5:52，H.264/AAC）
- `video/out/captions.srt`（字幕与解说时间码）
- `docs/submission/out/创世纪元-演示视频.mp4`（与提交版一致）

## 修改

- 团队信息：编辑 `config.json` 的 `team`、`school`、`members` 与 `title`。
- 节奏和旁白：编辑 `overlay.js` 中的 `coldOpen`、各幕 `*Story` 函数和 `say/sayWait`。
- 配乐：`score.py` 根据 `film.json` 中的章节、点击、解锁与撞击事件离线生成。
- 中文解说：`voice.py` 调用 Windows 中文语音，按字幕窗口自动选择语速；`mix_audio.py` 混音。
- 修改作品源码后，必须先运行 `npm run build`。

## 预览

```bash
node video/render.mjs --preview --from 0 --to 120 --every 30
```

预览帧写入 `out/preview/`，每 30 帧截图一次。完整渲染约 35–45 分钟，输出无声画面 `out/video.mp4`，随后自动生成 `out/score.wav`、`out/voice.wav`、`out/mixed.wav`、`out/captions.srt` 与最终 MP4。

## 依赖

Windows、Microsoft Edge、Node.js、Python 3，以及 numpy、scipy、Pillow、imageio-ffmpeg、pywin32。配乐、语音与画面均为离线生成；运行时不需要网络。