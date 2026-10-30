// Stockfish 18 (WASM, ein Thread) im Web Worker. Alle Suchen laufen nacheinander.
import { parseUci, safeChess, scoreCp } from './chess-util.js';

const ENGINE_URL = new URL('../../vendor/stockfish/stockfish.js', import.meta.url);

function parseInfo(line) {
  const t = line.split(' ');
  const r = { depth: 0, multipv: 1, pv: [] };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        r.depth = +t[++i];
        break;
      case 'multipv':
        r.multipv = +t[++i];
        break;
      case 'score': {
        const kind = t[++i];
        const v = +t[++i];
        r.score = kind === 'mate' ? { mate: v } : { cp: v };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          r.bound = true;
          i++;
        }
        break;
      }
      case 'pv':
        r.pv = t.slice(i + 1);
        i = t.length;
        break;
      default:
    }
  }
  return r.score ? r : null;
}

class Engine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.queue = Promise.resolve();
    this.current = null;
    this.waitFor = null;
    this.options = {};
    this.epoch = 0;
    this.failed = false;
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(ENGINE_URL);
      } catch (e) {
        this.failed = true;
        reject(e);
        return;
      }
      this.worker.onmessage = (e) => this.onLine(String(e.data));
      this.worker.onerror = (e) => {
        this.failed = true;
        reject(e);
      };
      this.waitFor = {
        token: 'uciok',
        resolve: () => {
          this.send('setoption name Hash value 32');
          this.waitFor = { token: 'readyok', resolve };
          this.send('isready');
        },
      };
      this.send('uci');
    });
    return this.ready;
  }

  send(cmd) {
    this.worker.postMessage(cmd);
  }

  onLine(line) {
    if (this.waitFor && line.startsWith(this.waitFor.token)) {
      const w = this.waitFor;
      this.waitFor = null;
      w.resolve();
      return;
    }
    this.current?.onLine(line);
  }

  setOption(name, value) {
    const v = String(value);
    if (this.options[name] === v) return;
    this.options[name] = v;
    this.send(`setoption name ${name} value ${v}`);
  }

  enqueue(fn) {
    const epoch = this.epoch;
    const p = this.queue.then(async () => {
      if (epoch !== this.epoch) return null;
      await this.start();
      return fn();
    });
    this.queue = p.catch(() => null);
    return p;
  }

  /** Bricht laufende und wartende Suchen ab (deren Promises liefern null bzw. Teilergebnis). */
  cancelAll() {
    this.epoch++;
    if (this.current) this.send('stop');
  }

  search(fen, { depth, movetime, multipv = 1, limitElo = null, onInfo } = {}) {
    return new Promise((resolve) => {
      this.setOption('UCI_LimitStrength', limitElo ? 'true' : 'false');
      if (limitElo) this.setOption('UCI_Elo', Math.max(1320, Math.min(3190, Math.round(limitElo))));
      this.setOption('MultiPV', multipv);
      const turn = fen.split(' ')[1];
      const lines = [];
      let reached = 0;
      this.current = {
        onLine: (line) => {
          if (line.startsWith('info') && line.includes(' pv ')) {
            const info = parseInfo(line);
            if (!info || info.bound) return;
            lines[info.multipv - 1] = info;
            if (info.multipv === 1) reached = info.depth;
            onInfo?.({ lines: lines.filter(Boolean), depth: reached, turn, fen });
          } else if (line.startsWith('bestmove')) {
            this.current = null;
            const best = line.split(' ')[1];
            resolve({ bestmove: best && best !== '(none)' ? best : null, lines: lines.filter(Boolean), depth: reached, turn, fen });
          }
        },
      };
      this.send(`position fen ${fen}`);
      let go = 'go';
      if (depth) go += ` depth ${depth}`;
      if (movetime) go += ` movetime ${movetime}`;
      if (!depth && !movetime) go += ' depth 12';
      this.send(go);
    });
  }

  analyze(fen, opts) {
    return this.enqueue(() => this.search(fen, opts));
  }

  newGame() {
    return this.enqueue(
      () =>
        new Promise((resolve) => {
          this.send('ucinewgame');
          this.waitFor = { token: 'readyok', resolve };
          this.send('isready');
        }),
    );
  }
}

export const engine = new Engine();

/** Nimmt die Engine früh in Betrieb, damit der erste Zug schnell kommt. */
export function warmup() {
  engine.start().catch(() => {});
}

/**
 * Zug für einen Bot mit gegebener Elo.
 * Ab 1400 nutzt Stockfish seine eingebaute Stärkebegrenzung; darunter wählen wir
 * menschlicher: mehrere Kandidaten, gewichtet nach Bewertung, mit gelegentlichen Patzern.
 */
export async function botMove(fen, elo, style = 'balanced') {
  if (elo >= 3000) {
    const r = await engine.analyze(fen, { movetime: 1200 });
    return r?.bestmove ?? null;
  }
  if (elo >= 1400) {
    const r = await engine.analyze(fen, { movetime: Math.round(300 + (elo - 1400) * 0.35), limitElo: elo });
    return r?.bestmove ?? null;
  }
  const t = Math.max(0, Math.min(1, (elo - 400) / 1000));
  const r = await engine.analyze(fen, { depth: Math.round(3 + t * 7), multipv: 8 });
  if (!r) return null;
  const chess = safeChess(fen);
  const legal = chess ? chess.moves({ verbose: true }) : [];
  if (!legal.length) return null;
  if (Math.random() < 0.2 - t * 0.17) {
    const m = legal[Math.floor(Math.random() * legal.length)];
    return m.from + m.to + (m.promotion || '');
  }
  const lines = r.lines.filter((l) => l.pv?.[0]);
  if (!lines.length) return r.bestmove;
  const best = scoreCp(lines[0].score);
  const temp = 220 - t * 185;
  // Spielstil: unter fast gleich guten Zügen bevorzugt jeder Bot „seine“ Art Zug.
  const byUci = new Map(legal.map((m) => [m.from + m.to + (m.promotion || ''), m]));
  const flavor = (uci) => {
    const m = byUci.get(uci);
    if (!m || style === 'balanced') return 0;
    const check = m.san.includes('+');
    const castle = m.san.startsWith('O-O');
    if (style === 'attack') return (check ? 70 : 0) + (m.captured ? 25 : 0) + (m.piece === 'q' || m.piece === 'r' ? 15 : 0);
    if (style === 'tactical') return (m.captured ? 55 : 0) + (check ? 45 : 0);
    if (style === 'solid') return (castle ? 80 : 0) + (m.captured && m.piece !== 'p' ? -15 : 0) + (m.piece === 'p' && 'cdef'.includes(m.to[0]) ? 15 : 0);
    if (style === 'random') return Math.random() * 60;
    return 0;
  };
  const weights = lines.map((l) => Math.exp(-(best - scoreCp(l.score) - flavor(l.pv[0])) / temp));
  let x = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lines.length; i++) {
    x -= weights[i];
    if (x <= 0) return lines[i].pv[0];
  }
  return lines[0].pv[0];
}

/** Stellung mit vertauschtem Zugrecht ("Was droht der Gegner?"). null, wenn nicht sinnvoll. */
export function nullMoveFen(fen) {
  const c = safeChess(fen);
  if (!c || c.inCheck()) return null;
  const p = fen.split(' ');
  p[1] = p[1] === 'w' ? 'b' : 'w';
  p[3] = '-';
  const f = p.join(' ');
  const c2 = safeChess(f);
  return c2 ? f : null;
}

export { parseUci };
