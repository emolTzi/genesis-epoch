// 演示视频渲染器：用 Edge 无头模式打开作品单文件，按虚拟时钟逐帧推进并截图，
// 交给 ffmpeg 编码；结束后生成配乐与字幕，再合成最终的 MP4。
//
//   node render.mjs                         完整渲染
//   node render.mjs --preview --every 30    每秒抽一帧到 out/preview，用于检查画面
//   node render.mjs --preview --from 60 --to 120 --every 15
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const preview = flag('preview');
const every = opt('every', 30);
const from = opt('from', 0);
const to = opt('to', 1e9);
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const prevDir = join(out, 'preview');
if (preview) {
  rmSync(prevDir, { recursive: true, force: true });
  mkdirSync(prevDir, { recursive: true });
}
const ffmpeg = execFileSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const FPS = cfg.fps;

const browser = await chromium.launch({
  channel: 'msedge',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: cfg.width, height: cfg.height }, deviceScaleFactor: cfg.scale });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript({ content: readFileSync(join(here, 'vt.js'), 'utf8') });
const url = pathToFileURL(join(here, '..', 'dist', 'index.html')).href + `?speed=${cfg.speed}`;
await page.goto(url);
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => !!window.__genesis);
  if (ok) break;
  await page.evaluate(() => window.__vt.advance(1000 / 30));
}
const font = readFileSync(join(here, 'fonts', 'film-serif.woff2')).toString('base64');
await page.addStyleTag({ content: `@font-face { font-family: 'FilmSerif'; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 900; }` });
await page.evaluate(async (c) => {
  window.__filmConfig = c;
  await document.fonts.load("900 60px FilmSerif", '创世纪元知识即权限');
  await document.fonts.ready;
}, cfg);
await page.addScriptTag({ path: join(here, 'overlay.js') });

let enc = null;
const videoPath = join(out, 'video.mp4');
if (!preview) {
  enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=pc:out_range=tv,format=yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(FPS), '-movflags', '+faststart', videoPath], { stdio: ['pipe', 'inherit', 'inherit'] });
}
const write = (buf) => new Promise((res) => (enc.stdin.write(buf) ? res() : enc.stdin.once('drain', res)));

const t0 = Date.now();
let frame = 0;
for (;;) {
  const t = frame / FPS;
  const r = await page.evaluate((tt) => window.__film.frame(tt), t);
  if (r.done || t > to) break;
  if (preview) {
    if (t >= from && frame % every === 0) {
      const mm = String(Math.floor(t / 60)).padStart(2, '0');
      const ss = (t % 60).toFixed(1).padStart(4, '0');
      await page.screenshot({ path: join(prevDir, `f_${mm}m${ss}s.jpg`), type: 'jpeg', quality: 80 });
    }
  } else {
    await write(await page.screenshot({ type: 'jpeg', quality: 94, timeout: 120000 }));
  }
  if (frame % 300 === 0) console.log(`t=${t.toFixed(1)}s act=${r.act} mode=${r.mode} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  frame++;
}
const data = await page.evaluate(() => window.__film.data());
writeFileSync(join(out, 'film.json'), JSON.stringify(data, null, 1));
await browser.close();
console.log(`frames=${frame} duration=${(frame / FPS).toFixed(1)}s render=${((Date.now() - t0) / 1000).toFixed(0)}s`);

// 字幕：按出现顺序，后一条出现时前一条结束
const caps = data.captions.slice().sort((a, b) => a.start - b.start);
const ts = (x) => {
  const ms = Math.round(x * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), f = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(f).padStart(3, '0')}`;
};
const srt = caps.map((c, i) => {
  const end = Math.min(c.end, caps[i + 1] ? caps[i + 1].start - 0.05 : c.end);
  return `${i + 1}\n${ts(c.start)} --> ${ts(Math.max(c.start + 0.8, end))}\n${c.text}\n`;
}).join('\n');
writeFileSync(join(out, 'captions.srt'), srt, 'utf8');

if (!preview) {
  enc.stdin.end();
  await new Promise((res) => enc.on('close', res));
  const wav = join(out, 'score.wav');
  execFileSync('python', [join(here, 'score.py'), join(out, 'film.json'), wav], { stdio: 'inherit' });
  let finalAudio = wav;
  try {
    const voice = join(out, 'voice.wav');
    const mixed = join(out, 'mixed.wav');
    execFileSync('python', [join(here, 'voice.py'), join(out, 'film.json'), voice], { stdio: 'inherit' });
    execFileSync('python', [join(here, 'mix_audio.py'), wav, voice, mixed], { stdio: 'inherit' });
    finalAudio = mixed;
  } catch (e) {
    console.warn('voice-over unavailable, using score only:', e.message);
  }
  const final = join(out, `${cfg.title}-演示视频.mp4`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', videoPath, '-i', finalAudio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' });
  console.log('done:', final, existsSync(final));
}
