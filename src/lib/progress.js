// Lernfortschritt: Ratings, Wiederholung (Spaced Repetition), Erfolge, Tagesplan.
import { addXp, dayKey, today, todayView } from './store.js';
import { SKILL_THEMES, UNIT_THEMES } from './content.js';

const DAY = 864e5;
/** Leitner-Intervalle: Box 0 = gleich nochmal, dann 1, 3, 7, 16, 35 Tage. */
const INTERVALS = [10 * 60e3, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];

const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

// ---------- Rätsel ----------

export function recordPuzzle(s, puzzle, success, { rated = true, review = false } = {}) {
  const p = s.puzzle;
  const before = p.rating;
  if (rated) {
    const k = p.solved + p.failed < 25 ? 40 : 20;
    p.rating = Math.round(Math.max(100, Math.min(3300, p.rating + k * ((success ? 1 : 0) - expected(p.rating, puzzle.rating)))));
    p.history.push([Date.now(), p.rating]);
    if (p.history.length > 600) p.history.splice(0, p.history.length - 600);
  }
  if (success) p.solved++;
  else p.failed++;
  p.seen[puzzle.id] = Date.now();
  const ids = Object.keys(p.seen);
  if (ids.length > 4000) for (const id of ids.slice(0, ids.length - 4000)) delete p.seen[id];
  for (const t of puzzle.themes) {
    if (!SKILL_THEMES.includes(t)) continue;
    const cur = p.themes[t] || [0, 0];
    p.themes[t] = [cur[0] + 1, cur[1] + (success ? 1 : 0)];
  }
  const card = p.srs[puzzle.id];
  if (!success) p.srs[puzzle.id] = { box: 0, due: Date.now() + INTERVALS[0] };
  else if (card) {
    const box = card.box + 1;
    if (box >= INTERVALS.length) delete p.srs[puzzle.id];
    else p.srs[puzzle.id] = { box, due: Date.now() + INTERVALS[box] };
  }
  const d = today(s);
  d.puzzles++;
  if (review) d.reviews++;
  const gain = success ? Math.round(6 + Math.max(0, Math.min(10, (puzzle.rating - before) / 40))) : 1;
  addXp(s, gain);
  return { delta: p.rating - before, xp: gain };
}

export function duePuzzles(s) {
  const now = Date.now();
  return Object.entries(s.puzzle.srs)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}

/** Themen mit mind. 4 Versuchen, sortiert nach Erfolgsquote. */
export function themeStats(s) {
  return Object.entries(s.puzzle.themes)
    .filter(([, [n]]) => n >= 4)
    .map(([t, [n, w]]) => ({ theme: t, n, w, rate: w / n }))
    .sort((a, b) => a.rate - b.rate);
}

// ---------- Lektionen ----------

export function recordLesson(s, lesson, mistakes) {
  const prev = s.lessons[lesson.id];
  const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
  const xp = prev?.done ? 8 : 20 + (stars === 3 ? 10 : 0);
  s.lessons[lesson.id] = { done: true, stars: Math.max(stars, prev?.stars || 0), at: Date.now(), runs: (prev?.runs || 0) + 1 };
  const d = today(s);
  if (!d.lessons.includes(lesson.id)) d.lessons.push(lesson.id);
  addXp(s, xp);
  return { stars, xp };
}

// ---------- Eröffnungen ----------

export const lineKey = (openingId, i) => `${openingId}#${i}`;

export function recordOpeningDrill(s, key, mistakes) {
  const prev = s.openings.lines[key] || { box: -1, reps: 0, lapses: 0 };
  const box = mistakes === 0 ? Math.min(prev.box + 1, INTERVALS.length - 1) : Math.max(0, prev.box - 1);
  s.openings.lines[key] = {
    box,
    due: Date.now() + (mistakes ? INTERVALS[0] : INTERVALS[Math.max(1, box)]),
    reps: prev.reps + 1,
    lapses: prev.lapses + (mistakes ? 1 : 0),
    at: Date.now(),
  };
  today(s).openings++;
  const xp = mistakes ? 4 : 12;
  addXp(s, xp);
  return { xp, box };
}

export function dueOpeningLines(s) {
  const now = Date.now();
  return Object.entries(s.openings.lines)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([k]) => k);
}

// ---------- Partien ----------

export function recordGame(s, game) {
  s.games.unshift(game);
  if (s.games.length > 60) s.games.length = 60;
  const score = game.result === 'win' ? 1 : game.result === 'draw' ? 0.5 : 0;
  if (game.rated) {
    const k = s.play.history.length < 10 ? 48 : 24;
    s.play.rating = Math.round(Math.max(100, s.play.rating + k * (score - expected(s.play.rating, game.elo))));
    s.play.history.push([Date.now(), s.play.rating]);
    if (s.play.history.length > 300) s.play.history.splice(0, s.play.history.length - 300);
  }
  today(s).games++;
  const xp = game.result === 'win' ? 30 : game.result === 'draw' ? 18 : 10;
  addXp(s, xp);
  return { xp };
}

// ---------- Erfolge ----------

const sumThemes = (s, keys) => keys.reduce((a, k) => a + (s.puzzle.themes[k]?.[1] || 0), 0);
const lessonsDone = (s) => Object.values(s.lessons).filter((l) => l.done).length;
const bestWin = (s) => Math.max(0, ...s.games.filter((g) => g.result === 'win').map((g) => g.elo));

export const ACHIEVEMENTS = [
  { id: 'first-lesson', name: 'Erster Zug', desc: 'Erste Lektion abgeschlossen', icon: 'wP', test: (s) => lessonsDone(s) >= 1 },
  { id: 'lessons-10', name: 'Wissensdurst', desc: '10 Lektionen abgeschlossen', icon: 'wN', test: (s) => lessonsDone(s) >= 10 },
  { id: 'lessons-30', name: 'Bücherwurm', desc: '30 Lektionen abgeschlossen', icon: 'wB', test: (s) => lessonsDone(s) >= 30 },
  { id: 'puzzles-10', name: 'Rätselfuchs', desc: '10 Rätsel gelöst', icon: 'wN', test: (s) => s.puzzle.solved >= 10 },
  { id: 'puzzles-100', name: 'Taktiker', desc: '100 Rätsel gelöst', icon: 'wB', test: (s) => s.puzzle.solved >= 100 },
  { id: 'puzzles-500', name: 'Taktik-Maschine', desc: '500 Rätsel gelöst', icon: 'wQ', test: (s) => s.puzzle.solved >= 500 },
  { id: 'mates-50', name: 'Matt-Meister', desc: '50 Matt-Rätsel gelöst', icon: 'wK', test: (s) => sumThemes(s, ['mateIn1', 'mateIn2', 'mateIn3']) >= 50 },
  { id: 'rating-1200', name: 'Aufsteiger', desc: 'Rätsel-Rating 1200', icon: 'wR', test: (s) => s.puzzle.rating >= 1200 },
  { id: 'rating-1500', name: 'Durchblicker', desc: 'Rätsel-Rating 1500', icon: 'wR', test: (s) => s.puzzle.rating >= 1500 },
  { id: 'rating-1800', name: 'Adlerauge', desc: 'Rätsel-Rating 1800', icon: 'wQ', test: (s) => s.puzzle.rating >= 1800 },
  { id: 'rating-2100', name: 'Taktik-Legende', desc: 'Rätsel-Rating 2100', icon: 'wK', test: (s) => s.puzzle.rating >= 2100 },
  { id: 'streak-3', name: 'Dranbleiber', desc: '3 Tage in Folge gelernt', icon: 'wP', test: (s) => s.streak.best >= 3 },
  { id: 'streak-7', name: 'Wochensieger', desc: '7 Tage in Folge gelernt', icon: 'wB', test: (s) => s.streak.best >= 7 },
  { id: 'streak-30', name: 'Unaufhaltsam', desc: '30 Tage in Folge gelernt', icon: 'wK', test: (s) => s.streak.best >= 30 },
  { id: 'first-win', name: 'Erster Sieg', desc: 'Eine Probepartie gewonnen', icon: 'wN', test: (s) => s.games.some((g) => g.result === 'win') },
  { id: 'beat-1200', name: 'Bot-Bezwinger', desc: 'Einen Bot mit 1200+ besiegt', icon: 'wR', test: (s) => bestWin(s) >= 1200 },
  { id: 'beat-1600', name: 'Vereinsschreck', desc: 'Einen Bot mit 1600+ besiegt', icon: 'wQ', test: (s) => bestWin(s) >= 1600 },
  { id: 'beat-2000', name: 'Expertenkiller', desc: 'Einen Bot mit 2000+ besiegt', icon: 'wK', test: (s) => bestWin(s) >= 2000 },
  { id: 'rush-10', name: 'Blitzmerker', desc: '10 Punkte im Rätsel-Rush', icon: 'wN', test: (s) => s.puzzle.rushBest >= 10 },
  { id: 'rush-25', name: 'Turbo-Hirn', desc: '25 Punkte im Rätsel-Rush', icon: 'wQ', test: (s) => s.puzzle.rushBest >= 25 },
  { id: 'opening-5', name: 'Theoretiker', desc: '5 Eröffnungslinien sicher', icon: 'wB', test: (s) => Object.values(s.openings.lines).filter((l) => l.box >= 2).length >= 5 },
];

/** Prüft Erfolge, schaltet neue frei und gibt sie zurück. */
export function checkAchievements(s) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements[a.id] && a.test(s)) {
      s.achievements[a.id] = Date.now();
      fresh.push(a);
    }
  }
  return fresh;
}

// ---------- Lernpfad & Tagesplan ----------

const TRACK_ORDER = { basics: 0, mates: 1, tactics: 2, strategy: 3, openings: 3, endgames: 4 };

export function buildPath(content, profile) {
  const goals = new Set(profile.goals);
  const order = new Map(content.units.map((u, i) => [u.id, i]));
  const units = content.units.filter((u) => goals.has(u.track) || (u.track === 'basics' && profile.level === 0));
  units.sort((a, b) => a.level - b.level || TRACK_ORDER[a.track] - TRACK_ORDER[b.track] || order.get(a.id) - order.get(b.id));
  return units.map((u) => ({
    unit: u,
    known: u.track === 'basics' ? u.level < profile.level : u.level < profile.level - 1,
    lessons: content.lessonsByUnit[u.id] || [],
  }));
}

export function nextLessons(path, s, n = 1) {
  const out = [];
  for (const pass of [false, true])
    for (const p of path) {
      if (p.known !== pass) continue;
      for (const l of p.lessons) {
        if (!s.lessons[l.id]?.done && !out.includes(l)) out.push(l);
        if (out.length >= n) return out;
      }
    }
  return out;
}

function nextOpeningKey(content, s) {
  const due = dueOpeningLines(s);
  if (due.length) return due[0];
  const lvl = s.profile.level;
  const ops = content.openings.filter((o) => o.level <= Math.max(1, lvl)).sort((a, b) => a.level - b.level);
  for (const o of ops)
    for (let i = 0; i < o.lines.length; i++) {
      const k = lineKey(o.id, i);
      if (!s.openings.lines[k]) return k;
    }
  return null;
}

/** Absolute Anfänger bekommen Rätsel erst, wenn sie Schach & Matt kennen. */
export function canDoPuzzles(s, content) {
  if (s.profile.level >= 1) return true;
  return Object.keys(s.lessons).some((id) => ['basics-check', 'mates-first'].includes(content?.lessonById[id]?.unit));
}

/** Erstellt (einmal pro Tag) den Plan passend zu Zeit, Niveau und Zielen. */
export function todayPlan(content, s) {
  const key = dayKey();
  if (s.plan?.date === key && s.plan.minutes === s.profile.minutes) return s.plan;
  const M = s.profile.minutes;
  const goals = new Set(s.profile.goals);
  const path = buildPath(content, s.profile);
  const tasks = [];
  const due = duePuzzles(s).length;
  if (due) tasks.push({ kind: 'review', count: Math.min(due, Math.max(3, Math.round(M * 0.2))) });
  const nL = M <= 10 ? 1 : M <= 20 ? 2 : M <= 30 ? 3 : M <= 45 ? 4 : 5;
  const lessons = nextLessons(path, s, nL);
  for (const l of lessons) tasks.push({ kind: 'lesson', id: l.id });
  if (canDoPuzzles(s, content)) {
    const unit = lessons[0] ? content.lessonById[lessons[0].id]?.unit : null;
    const weak = themeStats(s).filter((t) => t.rate < 0.55).slice(0, 3).map((t) => t.theme);
    const themes = (unit && UNIT_THEMES[unit]) || (weak.length ? weak : null);
    tasks.push({ kind: 'puzzles', count: Math.max(3, Math.round(M * 0.4)), themes });
  }
  if (goals.has('openings') && s.profile.level >= 1 && content.openings.length) {
    const k = nextOpeningKey(content, s);
    if (k) tasks.push({ kind: 'opening', key: k });
  }
  if (goals.has('play') && s.profile.level >= 1 && M >= 20) tasks.push({ kind: 'play', elo: s.play.rating });
  s.plan = { date: key, minutes: M, tasks };
  return s.plan;
}

/** Fortschritt einer Planaufgabe 0..1 – aus den heutigen Zählern berechnet. */
export function taskProgress(task, s, plan) {
  const d = todayView();
  if (task.kind === 'lesson') return d.lessons.includes(task.id) ? 1 : 0;
  if (task.kind === 'review') return Math.min(1, d.reviews / task.count);
  if (task.kind === 'puzzles') return Math.min(1, d.puzzles / (task.count + (plan.tasks.find((t) => t.kind === 'review')?.count || 0)));
  if (task.kind === 'opening') return Math.min(1, d.openings / 1);
  if (task.kind === 'play') return Math.min(1, d.games / 1);
  return 0;
}
