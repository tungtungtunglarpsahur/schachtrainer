// Der Coach: übersetzt Engine-Zahlen in verständliche Sätze.
import {
  VALUES, parseUci, pieceAcc, pieceName, piecePoss, pvToSan, safeChess, sanDe, scoreCp, winPct, materialBalance, loosePieces,
} from './chess-util.js';

export const CLASSES = {
  best: { label: 'Bester Zug', sym: '★', tone: 'best' },
  excellent: { label: 'Exzellent', sym: '!', tone: 'good' },
  good: { label: 'Gut', sym: '✓', tone: 'good' },
  inaccuracy: { label: 'Ungenau', sym: '?!', tone: 'inacc' },
  mistake: { label: 'Fehler', sym: '?', tone: 'mistake' },
  blunder: { label: 'Patzer', sym: '??', tone: 'blunder' },
  book: { label: 'Theorie', sym: '📖', tone: 'book' },
};

const PRAISE = ['Stark!', 'Sauber gespielt.', 'Genau so!', 'Wie ein Profi.', 'Top-Zug!', 'Saubere Sache.'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Score-Sicht des Ziehenden vor dem Zug → Gewinnchance. */
export const winOf = (score) => winPct(scoreCp(score));

/**
 * Klassifiziert einen Zug. `before`: Analyse vor dem Zug (Ziehender am Zug),
 * `after`: Analyse danach (Gegner am Zug). Liefert Verlust in Gewinnprozent.
 */
export function classify(before, after, uci) {
  if (!before?.lines?.[0] || !after) return null;
  const wBefore = winOf(before.lines[0].score);
  const afterScore = after.lines?.[0]?.score;
  // Nach dem Zug: Score aus Sicht des Gegners → umdrehen. Matt-Stellung: kein Score.
  const wAfter = afterScore ? 100 - winOf(afterScore) : after.mated ? 100 : after.stalemate ? 50 : wBefore;
  const loss = Math.max(0, wBefore - wAfter);
  let key;
  if (uci === before.lines[0].pv[0] || uci === before.bestmove) key = 'best';
  else if (loss < 2) key = 'excellent';
  else if (loss < 5) key = 'good';
  else if (loss < 10) key = 'inaccuracy';
  else if (loss < 20) key = 'mistake';
  else key = 'blunder';
  return { key, loss, wBefore, wAfter, ...CLASSES[key] };
}

/** Genauigkeit 0–100 aus Gewinnprozent-Verlust (Lichess-Formel). */
export function accuracyOf(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

const zuege = (n) => (n === 1 ? '1 Zug' : `${n} Zügen`);

/** Erklärt, was an einem Zug schlecht war bzw. was besser gewesen wäre. */
export function explain({ fenBefore, move, before, after, cls, opp = 'dein Gegner' }) {
  const out = { text: '', arrows: [] };
  if (!cls || !before?.lines?.[0]) return out;
  const best = before.lines[0];
  const bestSan = pvToSan(fenBefore, best.pv, 1)[0];
  const bestMove = bestSan ? `**${sanDe(bestSan.san)}**` : 'ein anderer Zug';
  if (bestSan && cls.key !== 'best') out.arrows.push([bestSan.from, bestSan.to, 'g']);

  if (cls.key === 'best' || cls.key === 'excellent') {
    if (best.score.mate > 0 && best.score.mate <= 3) out.text = `${pick(PRAISE)} Das führt zum Matt.`;
    else if (move.captured) out.text = `${pick(PRAISE)} Material eingesammelt.`;
    else out.text = cls.key === 'best' ? `${pick(PRAISE)} Das ist der Engine-Zug.` : pick(PRAISE);
    return out;
  }
  if (cls.key === 'good') {
    out.text = `Solider Zug. ${bestMove} war noch einen Tick besser.`;
    return out;
  }

  const fenAfter = after?.fen;
  const reply = after?.lines?.[0];
  const replyMoves = reply && fenAfter ? pvToSan(fenAfter, reply.pv, 6) : [];
  const r0 = replyMoves[0];
  if (r0) out.arrows.push([r0.from, r0.to, 'r']);

  // 1) Verpasstes Matt
  if (best.score.mate > 0) {
    out.text = `Du hattest **Matt in ${best.score.mate}**! Der Gewinnzug war ${bestMove}.`;
    return out;
  }
  // 2) Zug erlaubt Matt
  if (reply?.score?.mate > 0 && r0) {
    out.text = `Autsch – danach setzt dich ${opp} in ${zuege(reply.score.mate)} matt, los geht's mit **${sanDe(r0.san)}**. Besser: ${bestMove}.`;
    return out;
  }
  // 3) Figur hängt / Material geht verloren
  if (r0 && fenAfter) {
    const me = move.color;
    const c = safeChess(fenAfter);
    const startMat = c ? materialBalance(c) : 0;
    let worst = 0;
    if (c)
      for (const m of replyMoves.slice(0, 4)) {
        try {
          c.move(m.san);
        } catch {
          break;
        }
        const bal = (materialBalance(c) - startMat) * (me === 'w' ? 1 : -1);
        worst = Math.min(worst, bal);
      }
    if (r0.captured && worst <= -2) {
      const t = r0.captured;
      if (r0.to === move.to)
        out.text = `${cap(piecePoss(t))} auf ${move.to} steht ungedeckt – ${opp} schlägt mit **${sanDe(r0.san)}**.`;
      else out.text = `Damit gibst du ${pieceAcc(t)} auf ${r0.to} preis: **${sanDe(r0.san)}** gewinnt Material.`;
      out.text += ` Besser: ${bestMove}.`;
      return out;
    }
    // 4) Gabel / Doppelangriff durch die Antwort
    const fork = forkTargets(fenAfter, r0);
    if (fork.length >= 2 && worst <= -2) {
      out.text = `Achtung Gabel: **${sanDe(r0.san)}** greift ${fork.map((f) => `${pieceAcc(f.type)} (${f.square})`).join(' und ')} gleichzeitig an. Besser: ${bestMove}.`;
      return out;
    }
    if (worst <= -2) {
      out.text = `Nach **${sanDe(r0.san)}** verlierst du Material. ${bestMove} hätte das verhindert.`;
      return out;
    }
  }
  // 5) Verpasster Materialgewinn
  if (bestSan?.captured) {
    const loose = loosePieces(safeChess(fenBefore), move.color === 'w' ? 'b' : 'w');
    if (loose.some((l) => l.square === bestSan.to)) {
      out.text = `Verpasst: ${bestMove} hätte ${pieceAcc(bestSan.captured)} auf ${bestSan.to} gratis geschlagen.`;
      return out;
    }
  }
  const pawns = (cls.loss / 12).toFixed(1).replace('.', ',');
  out.text =
    cls.key === 'inaccuracy'
      ? `Nicht schlecht, aber ${bestMove} war genauer.`
      : `${bestMove} war deutlich stärker – dein Zug kostet etwa ${pawns} Bauerneinheiten.`;
  return out;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Welche wertvollen Figuren greift die Figur nach Zug `m` gleichzeitig an? */
function forkTargets(fen, m) {
  const c = safeChess(fen);
  if (!c) return [];
  try {
    c.move(m.san);
  } catch {
    return [];
  }
  const attacker = VALUES[m.piece] || 0;
  const victims = [];
  for (const row of c.board())
    for (const sq of row) {
      if (!sq || sq.color === m.color) continue;
      if (!c.attackers(sq.square, m.color).includes(m.to)) continue;
      if (sq.type === 'k' || VALUES[sq.type] > attacker || c.attackers(sq.square, sq.color).length === 0) victims.push(sq);
    }
  return victims;
}

/** Was droht der Gegner? `threat`: Analyse der Nullzug-Stellung (Gegner am Zug). */
export function threatText(nullFen, threat) {
  const l = threat?.lines?.[0];
  if (!l?.pv?.[0]) return null;
  const mv = pvToSan(nullFen, l.pv, 1)[0];
  if (!mv) return null;
  if (l.score.mate > 0 && l.score.mate <= 3)
    return { text: `Achtung, **Mattdrohung**: ${mv.color === 'w' ? 'Weiß' : 'Schwarz'} droht ${sanDe(mv.san)}${l.score.mate > 1 ? ` (Matt in ${l.score.mate})` : ''}.`, arrow: [mv.from, mv.to, 'r'], level: 'danger' };
  if (mv.captured && scoreCp(l.score) >= 150)
    return { text: `Achtung: ${cap(piecePoss(mv.captured))} auf ${mv.to} ist bedroht (${sanDe(mv.san)}).`, arrow: [mv.from, mv.to, 'r'], level: 'warn' };
  if (scoreCp(l.score) >= 250)
    return { text: `Dein Gegner hat eine starke Drohung: **${sanDe(mv.san)}**.`, arrow: [mv.from, mv.to, 'r'], level: 'warn' };
  return null;
}

/** Tipp in Stufen: 1 = Figur zeigen, 2 = Zug zeigen. */
export function hintFor(fen, analysis, level) {
  const l = analysis?.lines?.[0];
  if (!l?.pv?.[0]) return null;
  const m = parseUci(l.pv[0]);
  const c = safeChess(fen);
  const p = c?.get(m.from);
  if (level <= 1) return { text: `Schau dir ${p ? pieceAcc(p.type) : 'die Figur'} auf ${m.from} an.`, marks: { [m.from]: 'y' } };
  const san = pvToSan(fen, l.pv, 1)[0];
  const mate = l.score.mate > 0 ? ` – das ist Matt in ${l.score.mate}!` : '';
  return { text: `Spiel **${sanDe(san?.san || l.pv[0])}**${mate}`, arrows: [[m.from, m.to, 'g']] };
}

export { pieceName };
