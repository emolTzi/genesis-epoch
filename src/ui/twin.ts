// “另一个你”：蝴蝶效应的两种呈现。
// 数学：Lorenz 系统中初值只差 ε 的两条轨迹按 e^{λt} 分离；
// 文明：同一组参数、相邻宇宙编号的两个文明，结局可能完全不同。

import { h, fitCanvas, COLORS, MONO_FONT } from './dom';
import { TwinLorenz, LYAPUNOV } from '../sim/lorenz';
import { simulateCiv, STAGES, type CivRun } from '../sim/civ';

export function twinBody(eco: number, coop: number, seed: number): { nodes: Node[]; start: () => void; stop: () => void } {
  const canvas = h('canvas', { class: 'chart', 'aria-label': '两条洛伦兹轨迹的 x–z 投影，金色为你，青色为另一个你' }) as HTMLCanvasElement;
  const dv = h('canvas', { class: 'chart', 'aria-label': '两条轨迹距离的自然对数随时间增长，虚线为理论斜率' }) as HTMLCanvasElement;
  const status = h('p', { class: 'hint' }, '');
  const mine: CivRun = simulateCiv({ eco, coop, seed }, false);
  let twinSeed = seed + 1;
  let twin = simulateCiv({ eco, coop, seed: twinSeed }, false);
  for (let k = 1; k < 200; k++) {
    const r = simulateCiv({ eco, coop, seed: seed + k }, false);
    if (r.fate !== mine.fate) {
      twinSeed = seed + k;
      twin = r;
      break;
    }
  }
  const fateText = (r: CivRun) => (r.fate === '延续' ? `延续，到达${STAGES[r.stage]}` : `${r.fate}（t = ${r.tEnd}）`);
  const nodes: Node[] = [
    h('p', {}, '在混沌系统中，初始条件只差百万分之一的两个世界，会按指数分道扬镳。精度提高一万倍，可预测的时间只多一点点。'),
    canvas,
    dv,
    status,
    h('dl', { class: 'read' },
      h('div', {}, h('dt', {}, `你的文明（宇宙 ${seed}）`), h('dd', {}, fateText(mine))),
      h('div', {}, h('dt', {}, `另一个你（宇宙 ${twinSeed}）`), h('dd', {}, fateText(twin))),
    ),
    h('p', { class: 'hint' }, `两个文明的参数完全相同（生态 ${eco.toFixed(2)}、合作 ${coop.toFixed(2)}），只是宇宙编号相邻，也就是随机历史不同。偶然决定这一次；而把 500 个平行宇宙放在一起，存活率随参数稳定变化，这是必然。`),
  ];
  let raf = 0;
  let tw = new TwinLorenz(1e-6);
  const trA: [number, number][] = [];
  const trB: [number, number][] = [];
  const lnd: [number, number][] = [];
  const draw = () => {
    const a = fitCanvas(canvas, 170);
    const g = a.g;
    g.clearRect(0, 0, a.w, a.h);
    const sc = Math.min((a.w - 20) / 48, (a.h - 16) / 52);
    const P = (p: [number, number]) => [a.w / 2 + p[0] * sc, a.h - 8 - p[1] * sc];
    const trail = (tr: [number, number][], color: string) => {
      if (tr.length < 2) return;
      g.strokeStyle = color;
      g.globalAlpha = 0.75;
      g.beginPath();
      tr.forEach((p, i) => {
        const [x, y] = P(p);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
      g.globalAlpha = 1;
      const [x, y] = P(tr[tr.length - 1]);
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    };
    trail(trA, COLORS.gold);
    trail(trB, COLORS.cyan);
    const b = fitCanvas(dv, 110);
    const gd = b.g;
    gd.clearRect(0, 0, b.w, b.h);
    const T = 30;
    const X = (t: number) => 30 + (t / T) * (b.w - 38);
    const Y = (v: number) => 8 + ((5 - v) / 25) * (b.h - 24);
    gd.strokeStyle = COLORS.rule;
    gd.font = MONO_FONT;
    gd.fillStyle = COLORS.ink3;
    [-15, -5, 5].forEach((v) => {
      gd.beginPath();
      gd.moveTo(30, Y(v));
      gd.lineTo(b.w - 8, Y(v));
      gd.stroke();
      gd.fillText(String(v), 2, Y(v) + 4);
    });
    gd.fillText('ln|δ|', 34, 16);
    gd.setLineDash([4, 4]);
    gd.strokeStyle = COLORS.ink3;
    gd.beginPath();
    gd.moveTo(X(0), Y(Math.log(1e-6)));
    const tEnd = (5 - Math.log(1e-6)) / LYAPUNOV;
    gd.lineTo(X(Math.min(T, tEnd)), Y(Math.log(1e-6) + LYAPUNOV * Math.min(T, tEnd)));
    gd.stroke();
    gd.setLineDash([]);
    gd.strokeStyle = COLORS.entropy;
    gd.lineWidth = 1.6;
    gd.beginPath();
    lnd.forEach(([t, v], i) => (i ? gd.lineTo(X(t), Y(Math.max(-20, Math.min(5, v)))) : gd.moveTo(X(t), Y(v))));
    gd.stroke();
    gd.lineWidth = 1;
    status.textContent = `t = ${tw.t.toFixed(1)}，两个世界的距离 |δ| = ${tw.distance().toExponential(2)}${tw.splitT !== null ? `；在 t ≈ ${tw.splitT.toFixed(1)} 时分道扬镳（|δ| > 1）` : ''}。λ ≈ ${LYAPUNOV}。`;
  };
  const tick = () => {
    for (let i = 0; i < 6; i++) {
      tw.step(4);
      trA.push([tw.a[0], tw.a[2]]);
      trB.push([tw.b[0], tw.b[2]]);
      if (trA.length > 1400) {
        trA.shift();
        trB.shift();
      }
      lnd.push([tw.t, Math.log(tw.distance())]);
    }
    draw();
    if (tw.t < 30) raf = requestAnimationFrame(tick);
  };
  return {
    nodes,
    start: () => {
      tw = new TwinLorenz(1e-6);
      trA.length = 0;
      trB.length = 0;
      lnd.length = 0;
      raf = requestAnimationFrame(tick);
    },
    stop: () => cancelAnimationFrame(raf),
  };
}
