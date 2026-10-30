// Gesamter Lernstand, lokal im Browser (localStorage). Kein Account, kein Server.
import { useEffect, useReducer } from '../../vendor/preact-htm.js';

const KEY = 'gambit.v1';
const listeners = new Set();
let saveTimer = null;
export let storageOk = true;

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
    settings: { sound: true, boardTheme: 'slate', coords: true, autoQueen: false, animation: true, coach: 'full', showEval: true, notation: 'de', botSpeed: 'normal' },
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
  listeners.forEach((l) => l());
}

export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
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

// ---------- Ränge (wie VIP-Stufen) ----------

export const RANKS = [
  { name: 'Bauer', xp: 0, color: '#b89474', icon: 'wP' },
  { name: 'Springer', xp: 300, color: '#c3c7ce', icon: 'wN' },
  { name: 'Läufer', xp: 900, color: '#dcc58a', icon: 'wB' },
  { name: 'Turm', xp: 2000, color: '#a3bfd8', icon: 'wR' },
  { name: 'Dame', xp: 4000, color: '#c3b6e0', icon: 'wQ' },
  { name: 'König', xp: 8000, color: '#e6e6ea', icon: 'wK' },
  { name: 'Großmeister', xp: 15000, color: '#ffffff', icon: 'wK' },
];

export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const r = RANKS[i];
  const next = RANKS[i + 1];
  return { ...r, index: i, next, progress: next ? (xp - r.xp) / (next.xp - r.xp) : 1 };
}

// ---------- Backup ----------

export function exportData() {
  saveNow();
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gambit-backup-${dayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importData(file) {
  const data = JSON.parse(await file.text());
  if (!data || data.v !== 1 || !data.profile) throw new Error('Das ist keine gambit-Sicherung.');
  state = merge(defaults(), data);
  saveNow();
  listeners.forEach((l) => l());
}

export function resetAll() {
  state = defaults();
  saveNow();
  listeners.forEach((l) => l());
}
