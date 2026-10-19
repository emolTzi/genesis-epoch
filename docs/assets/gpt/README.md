# ChatGPT 生成素材

用途：作品介绍文档（`docs/submission`）的封面主视觉。**作品运行画面不使用这些图像。**

- 生成方式：ChatGPT 网页版图像生成（2026-10-10），封面 1 张。
- 提示词：见 `prompts.json` 的 `items`；第 1 张附带完整的统一画风说明（`style`）。
- 文件命名：`01_cover.png`。排版程序 `docs/submission/build.ts` 按编号自动取用，缺失的图自动略去。
- 标识：文档中每张图的右上角与图注都标注“AI 生成”。

`scripts/gen-assets.mjs` 为批量生成脚本。
