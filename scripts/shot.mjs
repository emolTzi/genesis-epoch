// 开发用截图脚本：用 Edge 无头模式（GPU）打开本地开发服务器，按计划执行脚本并截图。
//   node scripts/shot.mjs <输出目录> <计划 JSON 文件>
// 计划为数组，每步可含 js（在页面中执行的表达式）、wait（毫秒）、shot（截图文件名）、clip（截图区域）。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../video/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const [out, planFile, url = 'http://localhost:5179/'] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack).split('\n').slice(0, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
await page.goto(url, { timeout: 120000 });
await page.waitForFunction(() => !!window.__genesis, null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.getByRole('button', { name: '自由探索' }).click();
await page.waitForTimeout(800);
for (const step of plan) {
  if (step.js) console.log('js:', JSON.stringify(await page.evaluate(step.js)));
  if (step.key) await page.keyboard.press(step.key);
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.shot) {
    await page.screenshot({ path: `${out}/${step.shot}.png`, clip: step.clip, timeout: 120000 });
    console.log('shot', step.shot);
  }
}
await browser.close();
