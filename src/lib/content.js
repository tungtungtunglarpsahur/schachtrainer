// Lädt Lektionen, Eröffnungen und Rätsel aus data/ und indiziert sie.
import { useEffect, useState } from '../../vendor/preact-htm.js';

const TRACK_FILES = ['basics', 'mates', 'tactics', 'strategy', 'endgames'];

export const TRACKS = {
  basics: { name: 'Grundlagen', color: '#a9bdd3' },
  mates: { name: 'Mattbilder', color: '#d6a7ad' },
  tactics: { name: 'Taktik', color: '#dcc994' },
  strategy: { name: 'Strategie', color: '#bdb1d9' },
  endgames: { name: 'Endspiele', color: '#a6cdb0' },
  openings: { name: 'Eröffnungen', color: '#d8b597' },
};

let content = null;
let contentPromise = null;
let puzzles = null;
let puzzlePromise = null;

const getJson = (url) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

export function loadContent() {
  if (!contentPromise) {
    contentPromise = (async () => {
      const files = await Promise.all(TRACK_FILES.map((t) => getJson(`data/lessons/${t}.json`)));
      const units = [];
      const lessons = [];
      for (const f of files) {
        if (!f) continue;
        units.push(...(f.units || []));
        lessons.push(...(f.lessons || []));
      }
      const op = (await getJson('data/openings.json')) || { openings: [] };
      const lessonById = Object.fromEntries(lessons.map((l) => [l.id, l]));
      const unitById = Object.fromEntries(units.map((u) => [u.id, u]));
      const lessonsByUnit = {};
      for (const l of lessons) (lessonsByUnit[l.unit] ||= []).push(l);
      const openings = op.openings || [];
      content = {
        units,
        lessons,
        lessonById,
        unitById,
        lessonsByUnit,
        openings,
        openingById: Object.fromEntries(openings.map((o) => [o.id, o])),
      };
      return content;
    })();
  }
  return contentPromise;
}

export function useContent() {
  const [c, setC] = useState(content);
  useEffect(() => {
    if (!c) loadContent().then(setC);
  }, []);
  return c;
}

export function loadPuzzles() {
  if (!puzzlePromise) {
    puzzlePromise = (async () => {
      const data = (await getJson('data/puzzles.json')) || { puzzles: [] };
      const list = data.puzzles.map(([id, fen, moves, rating, themes]) => ({
        id,
        fen,
        moves: moves.split(' '),
        rating,
        themes: themes.split(' '),
      }));
      list.sort((a, b) => a.rating - b.rating);
      puzzles = { list, byId: Object.fromEntries(list.map((p) => [p.id, p])) };
      return puzzles;
    })();
  }
  return puzzlePromise;
}

export function usePuzzles() {
  const [p, setP] = useState(puzzles);
  useEffect(() => {
    if (!p) loadPuzzles().then(setP);
  }, []);
  return p;
}

/**
 * Wählt ein Rätsel nahe `rating`. `themes`: mind. eines muss passen.
 * `seen`: { id: timestamp } – kürzlich gesehene werden gemieden.
 */
export function pickPuzzle(db, { rating, themes = null, seen = {}, exclude = new Set(), spread = 120 } = {}) {
  const fresh = Date.now() - 1000 * 60 * 60 * 24 * 21;
  const fits = (p) => !exclude.has(p.id) && (!themes || themes.some((t) => p.themes.includes(t)));
  for (let w = spread; w <= 3200; w *= 2) {
    const pool = db.list.filter((p) => Math.abs(p.rating - rating) <= w && fits(p));
    const unseen = pool.filter((p) => !(seen[p.id] > fresh));
    const from = unseen.length ? unseen : w >= 1600 ? pool : [];
    if (from.length) return from[Math.floor(Math.random() * from.length)];
  }
  return db.list[Math.floor(Math.random() * db.list.length)];
}

// ---------- Rätselthemen (Lichess-Schlüssel → Deutsch) ----------

export const THEME_NAMES = {
  mate: 'Matt',
  mateIn1: 'Matt in 1',
  mateIn2: 'Matt in 2',
  mateIn3: 'Matt in 3',
  mateIn4: 'Matt in 4',
  mateIn5: 'Langes Matt',
  fork: 'Gabel',
  pin: 'Fesselung',
  skewer: 'Spieß',
  discoveredAttack: 'Abzugsangriff',
  discoveredCheck: 'Abzugsschach',
  doubleCheck: 'Doppelschach',
  backRankMate: 'Grundreihenmatt',
  hangingPiece: 'Hängende Figur',
  trappedPiece: 'Gefangene Figur',
  sacrifice: 'Opfer',
  deflection: 'Ablenkung',
  attraction: 'Hinlenkung',
  clearance: 'Räumung',
  interference: 'Verstellung',
  xRayAttack: 'Röntgenangriff',
  zugzwang: 'Zugzwang',
  promotion: 'Umwandlung',
  underPromotion: 'Unterverwandlung',
  advancedPawn: 'Vorgerückter Bauer',
  defensiveMove: 'Verteidigung',
  quietMove: 'Stiller Zug',
  smotheredMate: 'Ersticktes Matt',
  anastasiaMate: 'Anastasia-Matt',
  arabianMate: 'Arabisches Matt',
  bodenMate: 'Bodens Matt',
  hookMate: 'Hakenmatt',
  doubleBishopMate: 'Läuferpaar-Matt',
  dovetailMate: 'Schwalbenschwanz-Matt',
  rookEndgame: 'Turmendspiel',
  pawnEndgame: 'Bauernendspiel',
  queenEndgame: 'Damenendspiel',
  queenRookEndgame: 'Dame & Turm',
  bishopEndgame: 'Läuferendspiel',
  knightEndgame: 'Springerendspiel',
  opening: 'Eröffnung',
  middlegame: 'Mittelspiel',
  endgame: 'Endspiel',
  capturingDefender: 'Verteidiger schlagen',
  intermezzo: 'Zwischenzug',
  enPassant: 'En passant',
  castling: 'Rochade',
  exposedKing: 'Offener König',
  kingsideAttack: 'Königsangriff',
  queensideAttack: 'Damenflügelangriff',
  attackingF2F7: 'Angriff auf f2/f7',
  crushing: 'Vernichtend',
  advantage: 'Vorteil',
  equality: 'Ausgleich',
  short: 'Kurz',
  long: 'Lang',
  veryLong: 'Sehr lang',
  oneMove: 'Ein Zug',
  master: 'Meisterpartie',
  masterVsMaster: 'Meister gegen Meister',
  superGM: 'Super-GM',
};

/** Themen, die für Stärken/Schwächen zählen (keine Längen-/Phasen-Tags). */
export const SKILL_THEMES = [
  'mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'backRankMate',
  'hangingPiece', 'trappedPiece', 'sacrifice', 'deflection', 'attraction', 'clearance', 'interference',
  'xRayAttack', 'zugzwang', 'promotion', 'advancedPawn', 'defensiveMove', 'quietMove', 'smotheredMate',
  'capturingDefender', 'intermezzo', 'exposedKing', 'kingsideAttack', 'attackingF2F7', 'rookEndgame',
  'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame',
];

export const themeName = (t) => THEME_NAMES[t] || t;

/** Kacheln im Rätsel-Hub. */
export const THEME_GROUPS = [
  { id: 'mix', name: 'Gemischt', themes: null, art: 'mix', desc: 'Alles, passend zu deinem Rating' },
  { id: 'm1', name: 'Matt in 1', themes: ['mateIn1'], art: 'mate', desc: 'Finde den Gewinnzug' },
  { id: 'm2', name: 'Matt in 2', themes: ['mateIn2'], art: 'mate', desc: 'Zwei Züge zum Sieg' },
  { id: 'm3', name: 'Matt in 3+', themes: ['mateIn3', 'mateIn4', 'mateIn5'], art: 'mate', desc: 'Für Rechenkünstler' },
  { id: 'patterns', name: 'Mattbilder', themes: ['smotheredMate', 'anastasiaMate', 'arabianMate', 'bodenMate', 'hookMate', 'backRankMate', 'doubleBishopMate', 'dovetailMate'], art: 'mate', desc: 'Erstickt, Anastasia, Boden …' },
  { id: 'fork', name: 'Gabel', themes: ['fork'], art: 'tactic', desc: 'Zwei Ziele, ein Zug' },
  { id: 'pin', name: 'Fesselung & Spieß', themes: ['pin', 'skewer', 'xRayAttack'], art: 'tactic', desc: 'Linien gnadenlos nutzen' },
  { id: 'disc', name: 'Abzug & Doppelschach', themes: ['discoveredAttack', 'discoveredCheck', 'doubleCheck'], art: 'tactic', desc: 'Die versteckte Waffe' },
  { id: 'hang', name: 'Hängende Figuren', themes: ['hangingPiece', 'trappedPiece', 'capturingDefender'], art: 'tactic', desc: 'Gratis-Material einsammeln' },
  { id: 'sac', name: 'Opfer & Angriff', themes: ['sacrifice', 'kingsideAttack', 'attraction', 'deflection', 'exposedKing'], art: 'attack', desc: 'Riskant? Nein: berechnet.' },
  { id: 'def', name: 'Verteidigung', themes: ['defensiveMove', 'intermezzo', 'quietMove'], art: 'defense', desc: 'Retten, was zu retten ist' },
  { id: 'end', name: 'Endspiele', themes: ['endgame', 'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame'], art: 'end', desc: 'Der Weg zum ganzen Punkt' },
  { id: 'promo', name: 'Umwandlung', themes: ['promotion', 'advancedPawn', 'underPromotion'], art: 'end', desc: 'Bauer wird Dame' },
  { id: 'open', name: 'Eröffnungsfallen', themes: ['opening', 'attackingF2F7'], art: 'attack', desc: 'Früh zuschlagen' },
];

/** Welche Rätselthemen passen zu einer Lern-Einheit (für den Tagesplan). */
export const UNIT_THEMES = {
  'basics-check': ['mateIn1'],
  'basics-game': ['mateIn1', 'hangingPiece'],
  'mates-first': ['mateIn1', 'backRankMate'],
  'mates-basic': ['mateIn1'],
  'mates-patterns': ['smotheredMate', 'anastasiaMate', 'arabianMate', 'bodenMate', 'backRankMate', 'hookMate'],
  'mates-in-2': ['mateIn2', 'mateIn3'],
  'tactics-basics': ['hangingPiece', 'fork', 'pin', 'skewer'],
  'tactics-advanced': ['discoveredAttack', 'doubleCheck', 'deflection', 'attraction', 'intermezzo'],
  'tactics-combos': ['sacrifice', 'mateIn2', 'mateIn3', 'kingsideAttack', 'defensiveMove'],
  'strategy-thinking': ['hangingPiece', 'defensiveMove'],
  'strategy-opening': ['opening', 'attackingF2F7'],
  'strategy-middlegame': ['middlegame', 'kingsideAttack'],
  'strategy-advanced': ['quietMove', 'zugzwang'],
  'end-king': ['pawnEndgame', 'promotion'],
  'end-pawns': ['pawnEndgame', 'zugzwang'],
  'end-rooks': ['rookEndgame'],
  'end-minor': ['bishopEndgame', 'knightEndgame', 'queenEndgame'],
};
