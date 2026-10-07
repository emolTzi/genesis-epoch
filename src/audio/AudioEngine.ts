// 生成式声音：全部由 Web Audio 实时合成，没有任何外部音频素材，不涉及版权。
// 底噪随宇宙层级变化；事件音对应钥匙解锁、质变碎裂、文明熄灭等节点。
// 旁白可选用浏览器语音合成（备用）；演示视频的配音由团队录制。

export type Mood = 'hall' | 'origin' | 'stars' | 'elements' | 'life' | 'civ' | 'finale' | 'silence';

const MOODS: Record<Mood, { base: number; cutoff: number; gain: number; shimmer: number }> = {
  hall: { base: 55, cutoff: 900, gain: 0.5, shimmer: 0.25 },
  origin: { base: 41.2, cutoff: 1400, gain: 0.6, shimmer: 0.4 },
  stars: { base: 49, cutoff: 1100, gain: 0.55, shimmer: 0.35 },
  elements: { base: 58.3, cutoff: 800, gain: 0.5, shimmer: 0.2 },
  life: { base: 65.4, cutoff: 1300, gain: 0.55, shimmer: 0.4 },
  civ: { base: 73.4, cutoff: 1600, gain: 0.55, shimmer: 0.3 },
  finale: { base: 55, cutoff: 2000, gain: 0.6, shimmer: 0.5 },
  silence: { base: 36.7, cutoff: 260, gain: 0.25, shimmer: 0 },
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private droneGain!: GainNode;
  private filter!: BiquadFilterNode;
  private oscs: OscillatorNode[] = [];
  private shimmerGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  enabled = true;
  tts = false;
  private mood: Mood = 'hall';

  /** 必须在用户手势中调用。 */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // 简易混响：衰减噪声卷积
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    conv.connect(wet).connect(this.master);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.7;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.filter.connect(this.droneGain);
    this.droneGain.connect(this.master);
    this.droneGain.connect(conv);

    const ratios = [1, 1.5, 2, 2.996, 4.01];
    for (const r of ratios) {
      const o = ctx.createOscillator();
      o.type = r === 1 ? 'sawtooth' : 'sine';
      o.frequency.value = 55 * r;
      const g = ctx.createGain();
      g.gain.value = r === 1 ? 0.12 : 0.08 / r;
      o.connect(g).connect(this.filter);
      o.start();
      this.oscs.push(o);
    }
    // 缓慢扫动滤波器，让底噪“呼吸”
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(this.filter.frequency);
    lfo.start();

    // 高频闪烁：带通噪声
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 6;
    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0;
    noise.connect(bp).connect(this.shimmerGain).connect(conv);
    noise.start();

    this.setMood(this.mood, 3);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.3);
    if (!on) this.stopSpeech();
  }

  setMood(m: Mood, seconds = 4): void {
    this.mood = m;
    const c = this.ctx;
    if (!c) return;
    const mood = MOODS[m];
    const t = c.currentTime;
    const ratios = [1, 1.5, 2, 2.996, 4.01];
    this.oscs.forEach((o, i) => o.frequency.setTargetAtTime(mood.base * ratios[i], t, seconds / 3));
    this.filter.frequency.setTargetAtTime(mood.cutoff, t, seconds / 3);
    this.droneGain.gain.setTargetAtTime(mood.gain * 0.35, t, seconds / 3);
    this.shimmerGain.gain.setTargetAtTime(mood.shimmer * 0.02, t, seconds / 3);
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; glide?: number } = {}): void {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t = c.currentTime + (opts.delay ?? 0);
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(opts.glide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, gain: number, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  /** 钥匙解锁：上行的钟声泛音。 */
  unlock(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, 2.4, { gain: 0.09, delay: i * 0.09 });
      this.tone(f * 2.01, 1.6, { gain: 0.03, delay: i * 0.09 });
    });
  }

  /** 质变：碎裂声加低频冲击。 */
  leap(): void {
    this.noiseBurst(1.2, 6000, 0.25);
    this.tone(70, 1.4, { type: 'sine', gain: 0.25, glide: 38 });
  }

  /** 文明熄灭：下行长音。 */
  extinct(): void {
    this.tone(220, 4, { type: 'triangle', gain: 0.12, glide: 55 });
    this.noiseBurst(3, 900, 0.12, 0.1);
  }

  impact(): void {
    this.noiseBurst(2.5, 3000, 0.4);
    this.tone(55, 2.8, { gain: 0.3, glide: 25 });
  }

  click(): void {
    this.tone(1400, 0.06, { type: 'square', gain: 0.02 });
  }

  chime(): void {
    this.tone(880, 1.2, { gain: 0.05 });
  }

  speak(text: string): void {
    if (!this.tts || !this.enabled || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, ''));
    u.lang = 'zh-CN';
    u.rate = 0.95;
    u.pitch = 0.9;
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith('zh'));
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  stopSpeech(): void {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
}
