// 虚拟时钟：在作品脚本之前注入。接管 performance.now、Date.now、requestAnimationFrame、
// setTimeout / setInterval 与 CSS 动画，使每一帧都按固定的时间步长确定性地推进，
// 渲染速度再慢，画面里的时间也是匀速的。
(() => {
  let now = 0;
  const base = Date.now();
  const realNow = performance.now.bind(performance);
  performance.now = () => now;
  Date.now = () => base + now;

  let rafQ = [];
  let rafId = 0;
  window.requestAnimationFrame = (cb) => {
    const id = ++rafId;
    rafQ.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    rafQ = rafQ.filter((r) => r.id !== id);
  };

  let timers = [];
  let tid = 1;
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = ++tid;
    timers.push({ id, at: now + Math.max(0, Number(ms) || 0), fn: typeof fn === 'function' ? fn : () => {}, args, every: 0 });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = ++tid;
    const every = Math.max(1, Number(ms) || 1);
    timers.push({ id, at: now + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => {
    timers = timers.filter((t) => t.id !== id);
  };

  const seen = new WeakMap();
  function driveCss() {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) {
        seen.set(a, now);
        try { a.pause(); } catch {}
      }
      const local = now - seen.get(a);
      try {
        const end = a.effect ? a.effect.getComputedTiming().endTime : 0;
        if (isFinite(end) && local >= end) a.finish();
        else a.currentTime = local;
      } catch {}
    }
  }

  const tick = () => new Promise((r) => queueMicrotask(r));

  window.__vt = {
    get now() { return now; },
    realNow,
    /** 推进 dt 毫秒：依次触发到期的定时器，再执行一帧动画回调。 */
    async advance(dt) {
      const target = now + dt;
      for (let guard = 0; guard < 5000; guard++) {
        let next = null;
        for (const t of timers) if (!next || t.at < next.at) next = t;
        if (!next || next.at > target) break;
        now = Math.max(now, next.at);
        if (next.every) next.at = now + next.every;
        else timers = timers.filter((t) => t !== next);
        try { next.fn(...next.args); } catch (e) { console.error(e); }
        await tick();
      }
      now = target;
      const q = rafQ;
      rafQ = [];
      for (const r of q) {
        try { r.cb(now); } catch (e) { console.error(e); }
      }
      for (let i = 0; i < 4; i++) await tick();
      driveCss();
    },
  };
})();
