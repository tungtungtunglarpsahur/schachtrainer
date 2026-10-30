// Synthetische Sounds über WebAudio – keine Audiodateien nötig.
// Vier Sound-Pakete (settings.soundPack): klassik, holz, minimal, arcade.
// Lautstärke (settings.volume, 0–1) läuft über einen gemeinsamen Master-Regler.
// API: play(name), playMove(m, chess), previewSound(pack?)
// Namen: move, capture, check, good, bad, win, star, tick, select, notify
import { state } from './store.js';

let ctx = null;
let master = null;
let noise = null;

const volume = () => {
  const v = Number(state.settings.volume);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
};

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = volume();
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.15, slide = 0, attack = 0.008 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Kurzes Rauschen durch einen Bandpass – klingt wie eine Figur, die aufs Brett gesetzt wird. */
function knock(at = 0, gain = 0.5, freq = 1800, { q = 1.2, len = 0.05 } = {}) {
  const c = ac();
  if (!c) return;
  if (!noise || noise.sampleRate !== c.sampleRate) {
    const n = Math.floor(c.sampleRate * 0.12);
    noise = c.createBuffer(1, n, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + len + 0.02);
}

const KLASSIK = {
  move: () => {
    knock(0, 0.55, 1500);
    tone(220, { dur: 0.06, type: 'triangle', gain: 0.08 });
  },
  capture: () => {
    knock(0, 0.8, 900);
    knock(0.03, 0.4, 2200);
    tone(160, { dur: 0.08, type: 'triangle', gain: 0.1 });
  },
  check: () => {
    knock(0, 0.5, 1500);
    tone(880, { at: 0.02, dur: 0.12, type: 'square', gain: 0.04 });
    tone(660, { at: 0.1, dur: 0.14, type: 'square', gain: 0.04 });
  },
  good: () => [523, 659, 784].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.18, gain: 0.12 })),
  bad: () => tone(196, { dur: 0.22, type: 'sawtooth', gain: 0.05, slide: 0.7 }),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.3, gain: 0.11 })),
  star: () => {
    tone(1047, { dur: 0.1, gain: 0.1 });
    tone(1568, { at: 0.06, dur: 0.16, gain: 0.08 });
  },
  tick: () => tone(1200, { dur: 0.03, type: 'square', gain: 0.02 }),
  select: () => knock(0, 0.18, 2600, { len: 0.025 }),
  notify: () => {
    tone(660, { dur: 0.14, gain: 0.08 });
    tone(880, { at: 0.09, dur: 0.2, gain: 0.07 });
  },
};

// Holz: tiefer, wärmer, Marimba statt Glocken.
const marimba = (f, at = 0, gain = 0.13) => {
  tone(f, { at, dur: 0.32, gain, attack: 0.004 });
  tone(f * 4, { at, dur: 0.05, gain: gain * 0.25, attack: 0.002 });
};
const HOLZ = {
  move: () => {
    knock(0, 0.7, 850, { q: 2.2, len: 0.07 });
    tone(140, { dur: 0.07, type: 'triangle', gain: 0.07 });
  },
  capture: () => {
    knock(0, 0.85, 700, { q: 2, len: 0.08 });
    knock(0.045, 0.55, 1050, { q: 2, len: 0.06 });
  },
  check: () => {
    knock(0, 0.6, 850, { q: 2.2, len: 0.07 });
    marimba(587, 0.03, 0.08);
    marimba(440, 0.12, 0.08);
  },
  good: () => [392, 494, 587].forEach((f, i) => marimba(f, i * 0.08)),
  bad: () => {
    marimba(220, 0, 0.1);
    marimba(196, 0.12, 0.09);
  },
  win: () => [392, 494, 587, 784, 988].forEach((f, i) => marimba(f, i * 0.09, 0.12)),
  star: () => {
    marimba(784, 0, 0.1);
    marimba(1175, 0.07, 0.08);
  },
  tick: () => knock(0, 0.25, 1300, { q: 3, len: 0.02 }),
  select: () => knock(0, 0.22, 1200, { q: 2.5, len: 0.03 }),
  notify: () => {
    marimba(587, 0, 0.09);
    marimba(784, 0.1, 0.08);
  },
};

// Minimal: leise Klicks, keine Melodien.
const MINIMAL = {
  move: () => knock(0, 0.28, 2600, { q: 1.6, len: 0.03 }),
  capture: () => {
    knock(0, 0.35, 1900, { q: 1.6, len: 0.035 });
    knock(0.035, 0.2, 2900, { q: 1.6, len: 0.025 });
  },
  check: () => {
    knock(0, 0.3, 2600, { q: 1.6, len: 0.03 });
    tone(1320, { at: 0.03, dur: 0.07, gain: 0.025 });
  },
  good: () => tone(988, { dur: 0.12, gain: 0.05 }),
  bad: () => tone(247, { dur: 0.12, gain: 0.05 }),
  win: () => {
    tone(784, { dur: 0.14, gain: 0.05 });
    tone(1175, { at: 0.1, dur: 0.18, gain: 0.05 });
  },
  star: () => tone(1568, { dur: 0.08, gain: 0.04 }),
  tick: () => knock(0, 0.12, 3200, { len: 0.015 }),
  select: () => knock(0, 0.12, 3200, { len: 0.02 }),
  notify: () => tone(1046, { dur: 0.1, gain: 0.04 }),
};

// Arcade: verspielte 8-Bit-Blips.
const blip = (f, at = 0, dur = 0.06, gain = 0.045, slide = 0) => tone(f, { at, dur, type: 'square', gain, slide, attack: 0.002 });
const ARCADE = {
  move: () => blip(440, 0, 0.05),
  capture: () => {
    blip(330, 0, 0.06);
    blip(220, 0.05, 0.08, 0.05, 0.7);
  },
  check: () => {
    blip(880, 0, 0.05);
    blip(660, 0.07, 0.05);
    blip(880, 0.14, 0.06);
  },
  good: () => [523, 659, 784, 1047].forEach((f, i) => blip(f, i * 0.05, 0.07)),
  bad: () => blip(220, 0, 0.25, 0.05, 0.5),
  win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => blip(f, i * 0.07, 0.09)),
  star: () => {
    blip(1047, 0, 0.05);
    blip(1568, 0.05, 0.08);
  },
  tick: () => blip(1200, 0, 0.02, 0.02),
  select: () => blip(660, 0, 0.025, 0.03),
  notify: () => {
    blip(784, 0, 0.06);
    blip(1047, 0.07, 0.08);
  },
};

export const SOUND_PACKS = [
  { id: 'klassik', label: 'Klassik', desc: 'Klares Klacken und helle Töne' },
  { id: 'holz', label: 'Holz', desc: 'Warm wie ein echtes Holzbrett' },
  { id: 'minimal', label: 'Minimal', desc: 'Nur leise Klicks, keine Melodien' },
  { id: 'arcade', label: 'Arcade', desc: 'Verspielte 8-Bit-Töne' },
];
const PACKS = { klassik: KLASSIK, holz: HOLZ, minimal: MINIMAL, arcade: ARCADE };

function run(name, pack = state.settings.soundPack) {
  try {
    const p = PACKS[pack] || KLASSIK;
    (p[name] || KLASSIK[name])?.();
  } catch {
    /* Audio ist optional */
  }
}

export function play(name) {
  if (!state.settings.sound) return;
  run(name);
}

/** Passender Sound für einen chess.js-Zug. */
export function playMove(m, chess) {
  if (chess?.inCheck()) play('check');
  else if (m?.captured) play('capture');
  else play('move');
}

/** Probehören in den Einstellungen – spielt auch, wenn Sounds aus sind. */
export function previewSound(pack = state.settings.soundPack) {
  run('move', pack);
  setTimeout(() => run('capture', pack), 280);
  setTimeout(() => run('good', pack), 650);
}
