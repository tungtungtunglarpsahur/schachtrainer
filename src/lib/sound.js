// Synthetische Sounds über WebAudio – keine Audiodateien nötig.
import { state } from './store.js';

let ctx = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.15, slide = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function knock(at = 0, gain = 0.5, freq = 1800) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const SOUNDS = {
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
  good: () => {
    [523, 659, 784].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.18, gain: 0.12 }));
  },
  bad: () => {
    tone(196, { dur: 0.22, type: 'sawtooth', gain: 0.05, slide: 0.7 });
  },
  win: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.3, gain: 0.11 }));
  },
  star: () => {
    tone(1047, { dur: 0.1, gain: 0.1 });
    tone(1568, { at: 0.06, dur: 0.16, gain: 0.08 });
  },
  tick: () => tone(1200, { dur: 0.03, type: 'square', gain: 0.02 }),
};

export function play(name) {
  if (!state.settings.sound) return;
  try {
    SOUNDS[name]?.();
  } catch {
    /* Audio ist optional */
  }
}

/** Passender Sound für einen chess.js-Zug. */
export function playMove(m, chess) {
  if (chess?.inCheck()) play('check');
  else if (m?.captured) play('capture');
  else play('move');
}
