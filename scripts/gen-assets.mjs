// 用 ChatGPT 网页版（经 opencli 驱动作者本人已登录的浏览器）批量生成作品素材。
//   node scripts/gen-assets.mjs [id ...]
// 提示词见 docs/assets/gpt/prompts.json；结果保存为 docs/assets/gpt/<id>.<ext>，
// 生成记录（提示词、时间、对话链接）追加到 docs/assets/gpt/log.json，作为 AI 使用说明的依据。
// 已存在的素材会跳过；要重做某张，删除对应文件或在命令行指定它的 id。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'docs', 'assets', 'gpt');
const OPENCLI = process.env.OPENCLI_MAIN ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js');
const spec = JSON.parse(readFileSync(join(DIR, 'prompts.json'), 'utf8'));
const only = process.argv.slice(2);
const logPath = join(DIR, 'log.json');
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
const done = (id) => readdirSync(DIR).some((f) => f.startsWith(`${id}.`) && /\.(png|jpe?g|webp)$/.test(f));

for (const item of spec.items) {
  if (only.length ? !only.includes(item.id) : done(item.id)) continue;
  const prompt = `请直接生成一张图片，不要提问。这是参赛作品《创世纪元：AI文明诞生概率实验室》的系列素材之一。${item.kind === 'product' ? spec.productStyle : spec.style}${item.prompt}`;
  const tmp = join(DIR, 'raw', item.id);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const started = new Date().toISOString();
  console.log(`[${item.id}] generating…`);
  let out = '';
  try {
    // 直接用 node 调用 opencli 入口，避免 Windows 命令行转义破坏中文提示词
    out = execFileSync(process.execPath, [OPENCLI, 'chatgpt', 'image', prompt, '--op', tmp, '--timeout', '420', '-f', 'json'], { encoding: 'utf8', timeout: 480_000 });
  } catch (e) {
    console.log(`[${item.id}] failed: ${String(e.stdout || e.message).slice(0, 400)}`);
    continue;
  }
  const files = readdirSync(tmp).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (!files.length) {
    console.log(`[${item.id}] no image saved: ${out.slice(0, 400)}`);
    continue;
  }
  const ext = files[0].split('.').pop().toLowerCase();
  renameSync(join(tmp, files[0]), join(DIR, `${item.id}.${ext}`));
  rmSync(tmp, { recursive: true, force: true });
  let link = '';
  try {
    const parsed = JSON.parse(out);
    link = (Array.isArray(parsed) ? parsed[0] : parsed)?.link ?? '';
  } catch {}
  log.push({ id: item.id, tool: 'ChatGPT 网页版图像生成', started, finished: new Date().toISOString(), prompt, link });
  writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`[${item.id}] saved ${item.id}.${ext}`);
}
console.log('all done');
