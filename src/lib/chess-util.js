// Kleine Schach-Helfer rund um chess.js: deutsche Notation, FEN-Parsing, Bewertung.
import { Chess } from '../../vendor/chess.js';

export { Chess };

export const FILES = 'abcdefgh';
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const NAMES = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
const ACC = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' };
const POSS = { p: 'dein Bauer', n: 'dein Springer', b: 'dein Läufer', r: 'dein Turm', q: 'deine Dame', k: 'dein König' };
const DE_LETTER = { N: 'S', B: 'L', R: 'T', Q: 'D', K: 'K' };

export const pieceName = (t) => NAMES[t];
export const pieceAcc = (t) => ACC[t];
export const piecePoss = (t) => POSS[t];
export const colorName = (c) => (c === 'w' ? 'Weiß' : 'Schwarz');

/** Englische SAN → deutsche Kurznotation (Nf3 → Sf3, e8=Q → e8=D). */
export const sanDe = (san) => (san ? san.replace(/[NBRQK]/g, (c) => DE_LETTER[c]) : '');

export function parseUci(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined };
}

export const toUci = (m) => m.from + m.to + (m.promotion || '');

export function safeChess(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** FEN-Figurenstellung → { e1: 'wK', ... }. Funktioniert auch für Stellungen ohne Könige. */
export function parseFen(fen) {
  const map = {};
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        map[FILES[f] + (8 - i)] = color + ch.toUpperCase();
        f++;
      }
    }
  });
  return map;
}

/** { e1: 'wK' } → FEN (Figurenteil + Standardfelder). */
export function fenFromMap(map, turn = 'w') {
  const rows = [];
  for (let r = 8; r >= 1; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = map[FILES[f] + r];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p[0] === 'w' ? p[1] : p[1].toLowerCase();
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turn} - - 0 1`;
}

/** Zieht eine UCI-Folge auf einer Kopie und liefert die verbose-Züge. */
export function playUci(fen, ucis) {
  const c = new Chess(fen);
  const out = [];
  for (const u of ucis) {
    const m = c.move(parseUci(u));
    out.push(m);
  }
  return { chess: c, moves: out };
}

export function materialBalance(chess) {
  let w = 0;
  let b = 0;
  for (const row of chess.board())
    for (const sq of row)
      if (sq) {
        if (sq.color === 'w') w += VALUES[sq.type];
        else b += VALUES[sq.type];
      }
  return w - b;
}

/** Geschlagene Figuren pro Farbe (gegenüber vollständigem Satz). */
export function capturedPieces(fen) {
  const full = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const p of Object.values(parseFen(fen))) {
    const t = p[1].toLowerCase();
    if (t !== 'k') have[p[0]][t]++;
  }
  const lost = { w: [], b: [] };
  for (const c of ['w', 'b'])
    for (const t of ['q', 'r', 'b', 'n', 'p'])
      for (let i = have[c][t]; i < full[t]; i++) lost[c].push(t);
  return lost;
}

export function kingSquare(chess, color) {
  for (const row of chess.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === color) return sq.square;
  return null;
}

/** Figuren der Farbe `color`, die angegriffen und nicht ausreichend gedeckt sind. */
export function loosePieces(chess, color) {
  const opp = color === 'w' ? 'b' : 'w';
  const out = [];
  for (const row of chess.board())
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === 'k') continue;
      const attackers = chess.attackers(sq.square, opp);
      if (!attackers.length) continue;
      const defenders = chess.attackers(sq.square, color);
      const minAtt = Math.min(...attackers.map((a) => VALUES[chess.get(a).type] || 100));
      if (!defenders.length || minAtt < VALUES[sq.type]) out.push({ square: sq.square, type: sq.type });
    }
  return out;
}

// ---------- Bewertung ----------

/** Score (Sicht der Seite am Zug) → Centipawns, Matt als große Zahl. */
export function scoreCp(s) {
  if (!s) return 0;
  if (s.mate != null) return s.mate > 0 ? 30000 - s.mate * 100 : -30000 - s.mate * 100;
  return s.cp;
}

/** Gewinnwahrscheinlichkeit 0–100 aus Centipawns (Lichess-Formel). */
export function winPct(cp) {
  const c = Math.max(-2000, Math.min(2000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Score aus Sicht Weiß. `turn` ist die Seite am Zug, für die der Score gilt. */
export function whiteScore(s, turn) {
  if (!s) return null;
  if (turn === 'w') return s;
  return s.mate != null ? { mate: -s.mate } : { cp: -s.cp };
}

export function formatScore(s) {
  if (!s) return '–';
  if (s.mate != null) {
    if (s.mate === 0) return '#';
    return (s.mate > 0 ? '#' : '-#') + Math.abs(s.mate);
  }
  const v = s.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

/** Wandelt eine UCI-Hauptvariante in deutsche SAN-Züge um. */
export function pvToSan(fen, pv, max = 8) {
  const c = safeChess(fen);
  if (!c) return [];
  const out = [];
  for (const u of pv.slice(0, max)) {
    try {
      out.push(c.move(parseUci(u)));
    } catch {
      break;
    }
  }
  return out;
}

export function moveNumberLabel(fen, index) {
  // index: Halbzugindex ab Stellung fen
  const parts = fen.split(' ');
  const startMove = +parts[5] || 1;
  const blackFirst = parts[1] === 'b';
  const ply = index + (blackFirst ? 1 : 0);
  return { num: startMove + Math.floor(ply / 2), white: ply % 2 === 0 };
}
