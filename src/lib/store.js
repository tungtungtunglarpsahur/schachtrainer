// Gesamter Lernstand, lokal im Browser (localStorage). Mit Konto zusätzlich auf dem Server gesichert.
import { useEffect, useReducer } from '../../vendor/preact-htm.js';

const KEY = 'gambit.v1';
const listeners = new Set();
let version = 0; // zählt jede Änderung – so verpasst keine Ansicht ein Update zwischen Anzeigen und Anmelden
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};
let saveTimer = null;
export let storageOk = true;

/** Version der Einstiegs-Umfrage. Ältere Profile beantworten sie einmal neu. */
export const SURVEY_VERSION = 2;

export const LEVELS = [
  { id: 0, title: 'Noch nie gespielt', sub: 'Ich fange bei null an', puzzle: 500, play: 400 },
  { id: 1, title: 'Ich kenne die Regeln', sub: 'Aber mehr auch nicht', puzzle: 700, play: 600 },
  { id: 2, title: 'Ich spiele ab und zu', sub: 'ca. 800–1200 Elo', puzzle: 1000, play: 1000 },
  { id: 3, title: 'Vereinsspieler', sub: 'ca. 1200–1600 Elo', puzzle: 1400, play: 1400 },
  { id: 4, title: 'Stark', sub: '1600+ Elo', puzzle: 1800, play: 1800 },
];

export function defaults() {
  return {
    v: 1,
    createdAt: Date.now(),
    profile: { onboarded: false, name: '', level: 1, goals: ['basics', 'mates', 'tactics', 'openings', 'strategy', 'endgames', 'play'], minutes: 15, elo: null },
    settings: {
      sound: true,
      boardTheme: 'slate',
      coords: true,
      autoQueen: false,
      animation: true,
      coach: 'full',
      showEval: true,
      notation: 'de',
      botSpeed: 'normal',
      appTheme: 'graphit',
      effects: 'full',
      volume: 0.8,
      soundPack: 'klassik',
      tts: false,
      ttsMoves: false,
      ttsVoice: '',
      ttsRate: 1,
      hideBar: true,
    },
    xp: 0,
    days: {},
    streak: { current: 0, best: 0, lastDay: null },
    lessons: {},
    puzzle: { rating: 1000, solved: 0, failed: 0, history: [], themes: {}, srs: {}, seen: {}, rushBest: 0, rushHistory: [] },
    openings: { lines: {} },
    games: [],
    play: { rating: 800, history: [] },
    achievements: {},
    plan: null,
    intensive: null, // { start, days, minutes, startPuzzle, startPlay, startSolved }
    vision: { best: {}, rounds: 0 },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved ?? base;
  const out = { ...base };
  for (const k of Object.keys(saved)) {
    const b = base[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? merge(b, saved[k]) : saved[k];
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return merge(defaults(), JSON.parse(raw));
  } catch {
    storageOk = false;
    return defaults();
  }
}

export let state = load();

function persist() {
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false;
  }
}

export function saveNow() {
  if (saveTimer) clearTimeout(saveTimer);
  persist();
}

/** Speichert gebündelt, ohne neu zu rendern (für Änderungen während des Renderns). */
export function saveSoon() {
  if (!saveTimer) saveTimer = setTimeout(persist, 250);
}

/** Ändert den Zustand (mutierend) und speichert gebündelt. */
export function update(fn) {
  fn(state);
  if (!saveTimer) saveTimer = setTimeout(persist, 250);
  notify();
}

export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  const seen = version;
  useEffect(() => {
    listeners.add(force);
    if (version !== seen) force(); // dazwischen geändert? Dann gleich neu zeichnen
    return () => listeners.delete(force);
  }, []);
  return state;
}

addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());

// Browser bitten, die Daten nicht automatisch zu löschen.
navigator.storage?.persist?.().catch(() => {});

// ---------- Tage, XP, Streak ----------

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today(s = state) {
  const k = dayKey();
  if (!s.days[k]) s.days[k] = { xp: 0, seconds: 0, puzzles: 0, lessons: [], reviews: 0, openings: 0, games: 0 };
  return s.days[k];
}

export function todayView() {
  return state.days[dayKey()] || { xp: 0, seconds: 0, puzzles: 0, lessons: [], reviews: 0, openings: 0, games: 0 };
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function streakNow(s = state) {
  const { lastDay, current } = s.streak;
  if (lastDay === dayKey() || lastDay === yesterdayKey()) return current;
  return 0;
}

export function addXp(s, n) {
  s.xp += n;
  today(s).xp += n;
  const k = dayKey();
  if (s.streak.lastDay !== k) {
    s.streak.current = s.streak.lastDay === yesterdayKey() ? s.streak.current + 1 : 1;
    s.streak.lastDay = k;
    s.streak.best = Math.max(s.streak.best, s.streak.current);
  }
}

// ---------- Ränge nach Elo (online echt, sonst aus den Partien gegen Bots) ----------

export const RANKS = [
  { name: 'Bauer', elo: 0, color: '#b89474', icon: 'wP' },
  { name: 'Springer', elo: 600, color: '#c3c7ce', icon: 'wN' },
  { name: 'Läufer', elo: 900, color: '#dcc58a', icon: 'wB' },
  { name: 'Turm', elo: 1200, color: '#a3bfd8', icon: 'wR' },
  { name: 'Dame', elo: 1500, color: '#c3b6e0', icon: 'wQ' },
  { name: 'König', elo: 1800, color: '#e6e6ea', icon: 'wK' },
  { name: 'Learning King', elo: 2100, color: '#ffffff', icon: 'wK' },
];

/** Deine Elo: online (falls angemeldet), sonst die Wertung aus den Partien gegen Bots. */
export const eloOf = (s = state) => Math.round(s.online?.r ?? s.play?.rating ?? 800);

export function rankFor(elo) {
  let i = 0;
  while (i + 1 < RANKS.length && elo >= RANKS[i + 1].elo) i++;
  const r = RANKS[i];
  const next = RANKS[i + 1];
  return { ...r, index: i, next, toNext: next ? next.elo - elo : 0, progress: next ? Math.max(0, Math.min(1, (elo - r.elo) / (next.elo - r.elo))) : 1 };
}

/** Kompletten Stand ersetzen (z. B. vom Server nach der Anmeldung). */
export function replaceState(data) {
  state = merge(defaults(), data);
  saveNow();
  notify();
}

/** Bei jeder Änderung benachrichtigt werden (für die Sicherung auf dem Server). */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Backup ----------

export function exportData() {
  saveNow();
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `learning-king-backup-${dayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importData(file) {
  const data = JSON.parse(await file.text());
  if (!data || data.v !== 1 || !data.profile) throw new Error('Das ist keine Learning-King-Sicherung.');
  state = merge(defaults(), data);
  saveNow();
  notify();
}

export function resetAll() {
  state = defaults();
  saveNow();
  notify();
}
