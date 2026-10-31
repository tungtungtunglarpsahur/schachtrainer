// Intensiv-Plan: wenige Tage bis zum Turnier (oder zur Partie gegen den Kumpel) – jeden Tag ein
// Schwerpunkt mit dem, was in Amateurpartien die meisten Punkte bringt. Reihenfolge nach Wirkung:
// erst nichts mehr einstellen, dann die häufigsten Taktiken, Mattbilder, Eröffnung, Endspiel, Generalprobe.
import { dayKey } from './store.js';

export const BLOCKS = {
  blunders: {
    title: 'Nichts mehr einstellen',
    goal: 'Vor jedem Zug prüfen: Was hängt? Was droht? Das allein bringt die meisten Punkte.',
    icon: 'wR',
    lessons: ['strategy-blundercheck', 'tactics-hanging', 'strategy-threats', 'strategy-cct'],
    themes: ['hangingPiece', 'trappedPiece', 'capturingDefender'],
    vision: 'hanging',
  },
  forks: {
    title: 'Gabeln & Doppelangriffe',
    goal: 'Zwei Ziele mit einem Zug – die häufigste Taktik überhaupt.',
    icon: 'wN',
    lessons: ['tactics-fork', 'tactics-double-attack', 'tactics-attraction'],
    themes: ['fork'],
    vision: 'checks',
  },
  lines: {
    title: 'Fesselung, Spieß & Abzug',
    goal: 'Linien-Taktiken mit Läufer, Turm und Dame sehen und selbst spielen.',
    icon: 'wB',
    lessons: ['tactics-pin', 'tactics-skewer', 'tactics-discovered', 'tactics-double-check', 'tactics-deflection', 'tactics-intermezzo'],
    themes: ['pin', 'skewer', 'discoveredAttack', 'xRayAttack'],
    vision: 'hanging',
  },
  mates: {
    title: 'Mattbilder',
    goal: 'Matt erkennen, bevor der Gegner es sieht – und selbst nie hineinlaufen.',
    icon: 'wQ',
    lessons: ['mates-backrank', 'mates-queen-kiss', 'mates-scan', 'mates-smothered', 'mates-arabian', 'mates-forcing', 'mates-queen-sac', 'mates-quiet'],
    themes: ['mateIn1', 'mateIn2', 'backRankMate'],
    vision: 'checks',
  },
  opening: {
    title: 'Eröffnung mit Plan',
    goal: 'Gut aus der Eröffnung kommen: Zentrum, Entwicklung, Rochade – und keine Fallen.',
    icon: 'wB',
    lessons: ['strategy-center', 'strategy-develop', 'strategy-castle', 'strategy-traps'],
    themes: ['opening', 'attackingF2F7'],
    openings: 2,
  },
  endgame: {
    title: 'Endspiele, die Punkte bringen',
    goal: 'Gewonnene Stellungen auch gewinnen – und verlorene noch retten.',
    icon: 'wK',
    lessons: ['end-king-active', 'end-square', 'end-kp', 'end-opposition', 'end-rook-behind', 'end-lucena', 'end-philidor'],
    themes: ['pawnEndgame', 'rookEndgame', 'promotion'],
  },
  final: {
    title: 'Generalprobe',
    goal: 'Spielen wie im Turnier, Fehler verstehen, Taktik-Blick im Rush schärfen.',
    icon: 'wK',
    lessons: [],
    themes: null,
    games: 2,
    rush: true,
  },
};

/** Welche Schwerpunkte an welchem Tag – je nach Länge des Plans. */
export const SCHEDULES = {
  3: [['blunders', 'forks'], ['lines', 'mates'], ['endgame', 'final']],
  5: [['blunders', 'forks'], ['lines'], ['mates'], ['opening', 'endgame'], ['final']],
  7: [['blunders'], ['forks'], ['lines'], ['mates'], ['opening'], ['endgame'], ['final']],
};

export const DAY_OPTIONS = [3, 5, 7];
export const MINUTE_OPTIONS = [30, 45, 60, 90];

const DAY = 864e5;
const parseDay = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

/** Tag im Plan (0 = erster Tag), auch über Sommer-/Winterzeit hinweg stabil. */
export function planDay(plan, now = new Date()) {
  if (!plan) return -1;
  const a = parseDay(plan.start);
  const b = parseDay(dayKey(now));
  return Math.round((b - a) / DAY);
}

export function intensiveActive(s) {
  const p = s.intensive;
  if (!p) return false;
  const d = planDay(p);
  return d >= 0 && d < p.days;
}

export function intensiveFinished(s) {
  const p = s.intensive;
  return !!p && planDay(p) >= p.days;
}

/** Die Schwerpunkte eines Tages, zusammengeführt zu einem „Tagesblock“. */
export function dayBlock(days, i) {
  const keys = (SCHEDULES[days] || SCHEDULES[7])[i] || [];
  const parts = keys.map((k) => BLOCKS[k]).filter(Boolean);
  const themes = parts.flatMap((p) => p.themes || []);
  return {
    keys,
    title: parts.map((p) => p.title).join(' + '),
    goal: parts.map((p) => p.goal).join(' '),
    icon: parts[0]?.icon || 'wK',
    lessons: parts.flatMap((p) => p.lessons),
    themes: themes.length ? themes : null,
    vision: parts.find((p) => p.vision)?.vision || null,
    openings: parts.reduce((a, p) => a + (p.openings || 0), 0),
    games: Math.max(...parts.map((p) => p.games || 0), 0),
    rush: parts.some((p) => p.rush),
    final: keys.includes('final'),
  };
}

/** Tageslimit für den Ring oben: im Intensiv-Plan dessen Minuten, sonst das normale Tagesziel. */
export function goalMinutes(s) {
  return intensiveActive(s) ? s.intensive.minutes : s.profile.minutes;
}

/**
 * Lektionen für den Tag: die ersten noch nicht gemachten – zu leichte (weit unter dem eigenen Niveau)
 * kommen nur dran, wenn sonst nichts übrig ist.
 */
export function pickDayLessons(content, s, ids, n) {
  const list = ids.map((id) => content.lessonById[id]).filter(Boolean);
  const open = list.filter((l) => !s.lessons[l.id]?.done);
  const fits = (l) => (content.unitById[l.unit]?.level ?? 1) >= s.profile.level - 1;
  return [...open.filter(fits), ...open.filter((l) => !fits(l))].slice(0, n);
}
