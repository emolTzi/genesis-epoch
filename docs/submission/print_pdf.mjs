// 把本地 HTML 用 Edge 无头模式打印成 A4 PDF。
//   node print_pdf.mjs <in.html> <out.pdf>
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(new URL('../../video/package.json', import.meta.url));
const { chromium } = require('playwright-core');

const [html, pdf] = process.argv.slice(2);
if (!html || !pdf) {
  console.error('usage: node print_pdf.mjs <in.html> <out.pdf>');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve(html)).href, { waitUntil: 'load' });
await page.pdf({
  path: resolve(pdf),
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log('pdf ->', pdf);
