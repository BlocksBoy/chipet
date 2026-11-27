/**
 * 全站音效与背景音乐：全部用 Web Audio 实时合成，不需要音频文件。
 * 浏览器要求先有一次用户交互才能出声，首个 pointerdown / keydown 时自动解锁。
 */

const KEY = 'chipet.sound';

let enabled = readPref();
let rev = 0;
const subs = new Set<() => void>();

function readPref() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function subscribeSound(cb: () => void) {
  subs.add(cb);
  return () => { subs.delete(cb); };
}
export const getSoundRev = () => rev;
export const isSoundOn = () => enabled;

export function setSoundOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  rev += 1;
  subs.forEach((f) => f());
  const c = on ? audio() : ctx;
  if (c && graph) graph.master.gain.setTargetAtTime(on ? 1 : 0, c.currentTime, 0.05);
}

/* ───────────── 音频图 ───────────── */

interface Graph {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  amb: GainNode;
  verb: GainNode;
}

let ctx: AudioContext | null = null;
let graph: Graph | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    graph = buildGraph(ctx);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function buildGraph(c: AudioContext): Graph {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(c.destination);

  const master = c.createGain();
  master.gain.value = enabled ? 1 : 0;
  master.connect(comp);

  const bus = (v: number) => {
    const g = c.createGain();
    g.gain.value = v;
    g.connect(master);
    return g;
  };

  // 合成一段衰减噪声当混响脉冲，给街景和招式一点空间感
  const len = Math.floor(c.sampleRate * 2.4);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const wet = bus(0.55);
  conv.connect(wet);
  const verb = c.createGain();
  verb.connect(conv);

  return { master, sfx: bus(0.8), music: bus(0.34), amb: bus(0.26), verb };
}

function noiseBuf(c: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

/* ───────────── 基础发声 ───────────── */

interface Voice {
  /** 相对现在的延迟（秒） */
  at?: number;
  dur?: number;
  attack?: number;
  gain?: number;
  /** 混响发送量 0–1 */
  verb?: number;
  dest?: AudioNode;
  /** 左右声像 -1–1 */
  pan?: number;
}

interface ToneOpts extends Voice {
  type?: OscillatorType;
  /** 频率滑向 */
  to?: number;
  lowpass?: number;
  detune?: number;
}

interface NoiseOpts extends Voice {
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
}

function out(c: AudioContext, node: AudioNode, o: Voice) {
  let tail = node;
  if (o.pan) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    node.connect(p);
    tail = p;
  }
  tail.connect(o.dest ?? graph!.sfx);
  if (o.verb) {
    const s = c.createGain();
    s.gain.value = o.verb;
    tail.connect(s);
    s.connect(graph!.verb);
  }
}

function envelope(c: AudioContext, t0: number, o: Voice) {
  const g = c.createGain();
  const peak = Math.max(0.0002, o.gain ?? 0.3);
  const a = o.attack ?? 0.005;
  const dur = o.dur ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.01, dur));
  return g;
}

function ready() {
  if (!enabled) return null;
  const c = audio();
  return c && graph ? c : null;
}

function tone(freq: number, o: ToneOpts = {}) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const dur = o.dur ?? 0.2;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
  if (o.detune) osc.detune.value = o.detune;
  const env = envelope(c, t0, o);
  if (o.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    osc.connect(f);
    f.connect(env);
  } else {
    osc.connect(env);
  }
  out(c, env, o);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(o: NoiseOpts = {}) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const dur = o.dur ?? 0.2;
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1200, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
  f.Q.value = o.q ?? 0.9;
  const env = envelope(c, t0, o);
  src.connect(f);
  f.connect(env);
  out(c, env, o);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

/** 合成猫叫：锯齿波过两个元音共振峰，音高先扬后落 */
function meow(at = 0, pitch = 620, gain = 0.16, dest?: AudioNode) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + at;
  const dur = 0.52;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(pitch * 0.85, t0);
  osc.frequency.linearRampToValueAtTime(pitch * 1.32, t0 + dur * 0.38);
  osc.frequency.linearRampToValueAtTime(pitch * 0.78, t0 + dur);
  const vib = c.createOscillator();
  const vibAmt = c.createGain();
  vib.frequency.value = 7;
  vibAmt.gain.value = pitch * 0.02;
  vib.connect(vibAmt);
  vibAmt.connect(osc.frequency);
  const mix = c.createGain();
  for (const [fq, q, g] of [[900, 6, 1], [1900, 8, 0.6], [3100, 10, 0.25]] as const) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(fq * 0.75, t0);
    bp.frequency.linearRampToValueAtTime(fq, t0 + dur * 0.4);
    bp.frequency.linearRampToValueAtTime(fq * 0.8, t0 + dur);
    bp.Q.value = q;
    const bg = c.createGain();
    bg.gain.value = g;
    osc.connect(bp);
    bp.connect(bg);
    bg.connect(mix);
  }
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain * 2.4, t0 + 0.06);
  env.gain.setValueAtTime(gain * 2.4, t0 + dur * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  mix.connect(env);
  out(c, env, { verb: 0.18, dest });
  osc.start(t0);
  vib.start(t0);
  osc.stop(t0 + dur + 0.05);
  vib.stop(t0 + dur + 0.05);
}

function woof(at = 0, gain = 0.2) {
  for (const [i, p] of [[0, 1], [0.21, 0.92]] as const) {
    tone(230 * p, { at: at + i, dur: 0.13, type: 'sawtooth', to: 150 * p, lowpass: 900, gain, attack: 0.008, verb: 0.15 });
    noise({ at: at + i, dur: 0.09, freq: 700, q: 1.4, gain: gain * 0.6 });
  }
}

function chirp(at: number, dest: AudioNode, pan: number) {
  const n = 2 + Math.floor(Math.random() * 3);
  const base = 2800 + Math.random() * 1400;
  for (let i = 0; i < n; i++) {
    tone(base * (1 + Math.random() * 0.1), {
      at: at + i * (0.09 + Math.random() * 0.05),
      dur: 0.07,
      to: base * 1.45,
      gain: 0.05 + Math.random() * 0.03,
      attack: 0.004,
      verb: 0.35,
      dest,
      pan,
    });
  }
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/* ───────────── 遛猫大道 ───────────── */

export const walkSfx = {
  start() {
    // 自行车铃「叮叮」
    for (const at of [0, 0.16]) {
      tone(2350, { at, dur: 0.55, gain: 0.09, verb: 0.3, attack: 0.002 });
      tone(3310, { at, dur: 0.4, gain: 0.05, verb: 0.3, attack: 0.002 });
    }
  },
  jump() {
    noise({ dur: 0.22, freq: 500, to: 1700, q: 1.2, gain: 0.08 });
    tone(360, { dur: 0.13, to: 640, type: 'triangle', gain: 0.07 });
  },
  climb() {
    tone(320, { dur: 0.06, to: 220, type: 'triangle', gain: 0.08 });
    tone(360, { at: 0.1, dur: 0.06, to: 250, type: 'triangle', gain: 0.08 });
    noise({ at: 0.05, dur: 0.12, freq: 2400, q: 0.7, gain: 0.04 });
  },
  land(hard: boolean) {
    tone(150, { dur: 0.15, to: 55, gain: hard ? 0.3 : 0.16 });
    noise({ dur: 0.08, filter: 'lowpass', freq: 900, gain: hard ? 0.12 : 0.06 });
  },
  fish() {
    [1318.5, 1760, 2637].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.38, gain: 0.09, verb: 0.45, attack: 0.003 }));
    tone(3520, { at: 0.18, dur: 0.3, type: 'triangle', gain: 0.03, verb: 0.5 });
  },
  hit() {
    tone(270, { dur: 0.2, to: 110, type: 'triangle', gain: 0.26 });
    noise({ dur: 0.1, filter: 'lowpass', freq: 1300, gain: 0.14 });
    meow(0.1, 760, 0.12);
  },
  greet(kind: 'dog' | 'cat' | 'flowers' | 'coffee') {
    tone(784, { dur: 0.25, type: 'triangle', gain: 0.07, verb: 0.3 });
    tone(1047, { at: 0.1, dur: 0.32, type: 'triangle', gain: 0.07, verb: 0.3 });
    if (kind === 'dog') woof(0.2);
    else if (kind === 'cat') meow(0.2, 600 + Math.random() * 120);
    else tone(392, { at: 0.2, dur: 0.3, to: 494, gain: 0.05, verb: 0.2 });
  },
  pigeons() {
    for (let i = 0; i < 11; i++) {
      noise({ at: i * 0.045 + Math.random() * 0.01, dur: 0.05, freq: 900 + Math.random() * 700, q: 0.8, gain: 0.11 * (1 - i / 13) });
    }
  },
  over() {
    [784, 659.3, 523.3].forEach((f, i) => tone(f, { at: i * 0.14, dur: 0.6, type: 'triangle', gain: 0.08, verb: 0.4 }));
    tone(261.6, { at: 0.42, dur: 1.2, type: 'triangle', gain: 0.06, verb: 0.5 });
    meow(0.55, 560, 0.1);
  },
};

/* ── 慵懒 lo-fi 爵士 + 街头环境声，循环生成 ── */

// 八小节和声：Fmaj9 Em9 Dm9 Cmaj9 B♭maj7 Am7 Dm9 G13（MIDI 音）
const CHORDS: number[][] = [
  [53, 64, 67, 69, 72],
  [52, 62, 66, 67, 71],
  [50, 60, 64, 65, 69],
  [48, 59, 62, 64, 67],
  [46, 57, 62, 65, 69],
  [45, 55, 60, 64, 67],
  [50, 60, 64, 65, 69],
  [43, 53, 57, 59, 64],
];
const PENTA = [72, 74, 76, 79, 81, 84];

let music: { stop: () => void } | null = null;

export function startWalkMusic() {
  if (music) return;
  const c = audio();
  if (!c || !graph) return;
  music = createWalkMusic(c, graph);
}

export function stopWalkMusic() {
  music?.stop();
  music = null;
}

function createWalkMusic(c: AudioContext, g: Graph) {
  const mOut = c.createGain();
  mOut.gain.setValueAtTime(0.0001, c.currentTime);
  mOut.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.8);
  mOut.connect(g.music);
  const aOut = c.createGain();
  aOut.gain.setValueAtTime(0.0001, c.currentTime);
  aOut.gain.exponentialRampToValueAtTime(1, c.currentTime + 2.5);
  aOut.connect(g.amb);

  // 街头底噪：远处人声/车流，慢慢起伏
  const bed = c.createBufferSource();
  bed.buffer = noiseBuf(c);
  bed.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  const bedGain = c.createGain();
  bedGain.gain.value = 0.32;
  const lfo = c.createOscillator();
  const lfoAmt = c.createGain();
  lfo.frequency.value = 0.09;
  lfoAmt.gain.value = 0.12;
  lfo.connect(lfoAmt);
  lfoAmt.connect(bedGain.gain);
  bed.connect(lp);
  lp.connect(bedGain);
  bedGain.connect(aOut);
  bed.start();
  lfo.start();

  const bpm = 84;
  const eighth = 60 / bpm / 2;
  const swing = 0.16 * eighth;
  let step = 0;
  let next = c.currentTime + 0.12;
  let nextBird = c.currentTime + 1.5 + Math.random() * 2;

  const rhodes = (n: number, t: number, len: number, gain: number) => {
    const at = t - c.currentTime;
    tone(midi(n), { at, dur: len, gain, attack: 0.012, lowpass: 2200, verb: 0.3, dest: mOut });
    tone(midi(n + 12), { at, dur: len * 0.5, type: 'triangle', gain: gain * 0.18, attack: 0.008, verb: 0.3, dest: mOut });
  };

  const tick = () => {
    if (!enabled) {
      next = c.currentTime + 0.1;
      return;
    }
    if (next < c.currentTime) next = c.currentTime + 0.05;
    while (next < c.currentTime + 0.35) {
      const bar = Math.floor(step / 8) % CHORDS.length;
      const s8 = step % 8;
      const chord = CHORDS[bar]!;
      const t = next + (s8 % 2 ? swing : 0);
      const at = t - c.currentTime;

      if (s8 === 0) chord.slice(1).forEach((n, i) => rhodes(n, t + i * 0.012, 2.6, 0.05));
      if (s8 === 3 && Math.random() < 0.6) chord.slice(2).forEach((n) => rhodes(n, t, 0.9, 0.03));
      if (s8 === 0) tone(midi(chord[0]! - 12), { at, dur: 1.1, type: 'triangle', gain: 0.16, lowpass: 520, dest: mOut });
      if (s8 === 4) tone(midi(chord[0]! - 5), { at, dur: 0.8, type: 'triangle', gain: 0.12, lowpass: 520, dest: mOut });

      if (s8 === 0 || s8 === 5) tone(118, { at, dur: 0.22, to: 44, gain: 0.32, dest: mOut });
      if (s8 === 2 || s8 === 6) {
        noise({ at, dur: 0.14, freq: 1900, q: 0.7, gain: 0.06, dest: mOut, verb: 0.2 });
        tone(190, { at, dur: 0.06, to: 150, type: 'triangle', gain: 0.04, dest: mOut });
      }
      noise({ at, dur: 0.035, filter: 'highpass', freq: 7200, gain: s8 % 2 ? 0.018 : 0.03, dest: mOut });

      if (Math.random() < (s8 % 2 ? 0.12 : 0.22)) {
        const pool = PENTA.filter((p) => chord.some((n) => (n - p) % 12 === 0)).concat(PENTA);
        const n = pool[Math.floor(Math.random() * pool.length)]!;
        tone(midi(n), { at, dur: 0.9, gain: 0.035, attack: 0.006, verb: 0.55, dest: mOut });
        tone(midi(n + 19), { at, dur: 0.35, gain: 0.006, verb: 0.55, dest: mOut });
      }

      // 黑胶底噪的噼啪声
      if (Math.random() < 0.35) noise({ at: at + Math.random() * eighth, dur: 0.012, filter: 'highpass', freq: 3000, gain: 0.02 + Math.random() * 0.02, dest: mOut });

      next += eighth;
      step += 1;
    }
    if (nextBird < c.currentTime + 0.35) {
      chirp(Math.max(0, nextBird - c.currentTime), aOut, Math.random() * 1.6 - 0.8);
      nextBird += 2.2 + Math.random() * 5;
    }
  };

  tick();
  const timer = window.setInterval(tick, 60);

  return {
    stop() {
      window.clearInterval(timer);
      const t = c.currentTime;
      mOut.gain.cancelScheduledValues(t);
      mOut.gain.setTargetAtTime(0.0001, t, 0.25);
      aOut.gain.cancelScheduledValues(t);
      aOut.gain.setTargetAtTime(0.0001, t, 0.25);
      window.setTimeout(() => {
        bed.stop();
        lfo.stop();
        mOut.disconnect();
        aOut.disconnect();
      }, 1500);
    },
  };
}

/* ───────────── 对战 ───────────── */

/** 招式种类：0 进攻 · 1 防御 · 2 技巧 · 3 合体技 */
type Kind = 0 | 1 | 2 | 3;
export interface StrikeSound { kind: Kind; power: number; dmg: number; edge: 1 | 0 | -1; bits: number[] }

const CHARGE_TOP = [520, 380, 760, 900];

export const battleSfx = {
  tap() {
    tone(1700, { dur: 0.04, gain: 0.05, attack: 0.002 });
  },
  fightStart() {
    noise({ dur: 0.5, filter: 'highpass', freq: 300, to: 4000, gain: 0.07 });
    tone(880, { at: 0.32, dur: 1.3, gain: 0.1, verb: 0.6, attack: 0.003 });
    tone(1324, { at: 0.32, dur: 0.9, gain: 0.05, verb: 0.6, attack: 0.003 });
    tone(110, { at: 0.32, dur: 0.9, type: 'triangle', gain: 0.18, to: 82 });
  },
  /** 一回合的完整音效，按 BattleFx 的节拍排好 */
  round(me: StrikeSound, op: StrikeSound, beat: { charge: number; fly: number; hit: number }, fusion: boolean) {
    for (const [s, pan] of [[me, -0.45], [op, 0.45]] as const) {
      if (s.power <= 0) {
        noise({ at: beat.charge, dur: 0.45, filter: 'lowpass', freq: 700, to: 200, gain: 0.07, pan });
        continue;
      }
      const top = CHARGE_TOP[s.kind]! * (1 + s.power * 0.08);
      tone(top * 0.3, { dur: beat.charge, to: top, type: 'sawtooth', lowpass: 1800, gain: 0.035 + s.power * 0.008, attack: beat.charge * 0.8, pan });
      if (s.kind === 3) tone(top * 0.3 * 1.5, { dur: beat.charge, to: top * 1.5, type: 'sawtooth', lowpass: 2400, gain: 0.04, attack: beat.charge * 0.8, detune: 12 });
      noise({ at: beat.charge, dur: beat.fly + 0.05, freq: 700, to: 2600, q: 1.1, gain: 0.07 + s.power * 0.01, pan: pan * 0.4 });
    }
    if (me.power > 0 && op.power > 0) {
      const at = beat.charge + beat.fly * 0.45;
      [520, 1180, 1790, 2380].forEach((f, i) => tone(f, { at, dur: 0.45 - i * 0.06, gain: 0.07, verb: 0.35, attack: 0.002 }));
      noise({ at, dur: 0.09, filter: 'highpass', freq: 2500, gain: 0.12 });
    }
    for (const [s, pan] of [[me, 0.5], [op, -0.5]] as const) impact(s, beat.hit, pan);
    if (fusion) {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, { at: beat.hit + 0.05 + i * 0.05, dur: 0.7, type: 'triangle', gain: 0.06, verb: 0.5 }));
    } else if (me.edge === 1) {
      [659.3, 880, 1318.5].forEach((f, i) => tone(f, { at: beat.hit + 0.08 + i * 0.06, dur: 0.35, type: 'square', lowpass: 3000, gain: 0.04, verb: 0.3 }));
    } else if (me.edge === -1) {
      tone(392, { at: beat.hit + 0.1, dur: 0.25, type: 'square', lowpass: 1400, gain: 0.04 });
      tone(311, { at: beat.hit + 0.28, dur: 0.4, type: 'square', lowpass: 1200, gain: 0.04 });
    }
  },
  win() {
    [523.3, 659.3, 784].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.22, type: 'square', lowpass: 3200, gain: 0.05, verb: 0.3 }));
    [523.3, 659.3, 784, 1046.5].forEach((f) => tone(f, { at: 0.38, dur: 1.4, type: 'triangle', gain: 0.07, verb: 0.55 }));
    [2093, 2637, 3136, 4186].forEach((f, i) => tone(f, { at: 0.42 + i * 0.07, dur: 0.3, gain: 0.03, verb: 0.6 }));
    meow(0.75, 720, 0.1);
  },
  lose() {
    [392, 349.2, 293.7, 246.9].forEach((f, i) => tone(f, { at: i * 0.26, dur: 0.5, type: 'triangle', lowpass: 1600, gain: 0.08, verb: 0.4 }));
    meow(1.05, 460, 0.09);
  },
  draw() {
    tone(523.3, { dur: 0.4, type: 'triangle', gain: 0.07, verb: 0.4 });
    tone(523.3, { at: 0.3, dur: 0.6, type: 'triangle', gain: 0.07, verb: 0.4 });
  },
};

function impact(s: StrikeSound, at: number, pan: number) {
  if (s.dmg <= 0) {
    noise({ at, dur: 0.25, filter: 'lowpass', freq: 900, gain: 0.05, pan });
    return;
  }
  const k = Math.min(1.6, 0.7 + s.dmg * 0.12);
  switch (s.kind) {
    case 0:
      noise({ at, dur: 0.17, filter: 'highpass', freq: 4200, to: 900, gain: 0.2 * k, pan });
      noise({ at: at + 0.05, dur: 0.12, filter: 'highpass', freq: 3600, to: 800, gain: 0.12 * k, pan });
      break;
    case 1:
      [330, 742, 1121, 1630].forEach((f, i) => tone(f, { at, dur: 0.7 - i * 0.1, type: i ? 'sine' : 'triangle', gain: 0.08 * k, verb: 0.4, attack: 0.002, pan }));
      break;
    case 2:
      (s.bits.length ? s.bits : [1, 0, 1, 1]).slice(0, 6).forEach((b, i) => {
        tone(b ? 1318.5 : 880, { at: at + i * 0.04, dur: 0.05, type: 'square', lowpass: 4200, gain: 0.05 * k, pan });
      });
      break;
    default:
      tone(92, { at, dur: 0.95, to: 28, gain: 0.5, attack: 0.004 });
      noise({ at, dur: 0.85, filter: 'lowpass', freq: 2400, to: 160, gain: 0.3, verb: 0.5 });
      tone(1900, { at, dur: 0.35, to: 180, type: 'sawtooth', lowpass: 5000, gain: 0.06 });
      return;
  }
  tone(140, { at, dur: 0.26, to: 46, gain: 0.32 * k, pan });
  noise({ at, dur: 0.07, filter: 'lowpass', freq: 1600, gain: 0.12 * k, pan });
}
