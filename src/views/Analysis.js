// Analysebrett: freie Züge, Stockfish-Varianten, Matt-Finder, FEN/PGN laden.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { useStore } from '../lib/store.js';
import { engine, warmup } from '../lib/engine.js';
import { Chess, START_FEN, parseUci, pvToSan, safeChess, sanDe, whiteScore, formatScore } from '../lib/chess-util.js';
import { Board } from '../ui/Board.js';
import { EvalBar, Icon, toast } from '../ui/kit.js';
import { playMove } from '../lib/sound.js';

export function Analysis({ query }) {
  useStore();
  const [rootFen] = useState(() => safeChess(query.get('fen') || '')?.fen() || START_FEN);
  const chessRef = useRef(null);
  if (!chessRef.current) {
    const c = new Chess(rootFen);
    for (const u of (query.get('moves') || '').split(',').filter(Boolean)) {
      try {
        c.move(parseUci(u));
      } catch {
        break;
      }
    }
    chessRef.current = c;
  }
  const [, setTick] = useState(0);
  const [ply, setPly] = useState(chessRef.current.history().length);
  const [lines, setLines] = useState([]);
  const [depth, setDepth] = useState(0);
  const [orientation, setOrientation] = useState(chessRef.current.turn());
  const [on, setOn] = useState(true);
  const [input, setInput] = useState('');
  const token = useRef(0);
  useEffect(warmup, []);

  const hist = chessRef.current.history({ verbose: true });
  const view = new Chess(rootFen);
  for (const m of hist.slice(0, ply)) view.move(m.san);
  const fen = view.fen();

  useEffect(() => {
    setLines([]);
    setDepth(0);
    if (!on || view.isGameOver()) return;
    const t = ++token.current;
    engine.cancelAll();
    engine.analyze(fen, {
      depth: 20,
      movetime: 6000,
      multipv: 3,
      onInfo: (r) => {
        if (t !== token.current) return;
        setLines(r.lines);
        setDepth(r.depth);
      },
    });
    return () => {
      token.current++;
      engine.cancelAll();
    };
  }, [fen, on]);

  const onMove = ({ from, to, promotion }) => {
    const c = chessRef.current;
    // Variante ab aktueller Stellung: spätere Züge verwerfen
    while (c.history().length > ply) c.undo();
    try {
      const m = c.move({ from, to, promotion });
      playMove(m, c);
    } catch {
      return;
    }
    setPly(c.history().length);
    setTick((x) => x + 1);
  };

  const load = () => {
    const txt = input.trim();
    if (!txt) return;
    const asFen = safeChess(txt);
    if (asFen) {
      location.hash = `#/analysis?fen=${encodeURIComponent(asFen.fen())}`;
      return;
    }
    const c = new Chess();
    try {
      c.loadPgn(txt);
      const moves = c.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
      const start = c.getHeaders().FEN || START_FEN;
      location.hash = `#/analysis?fen=${encodeURIComponent(start)}&moves=${moves.join(',')}`;
    } catch {
      toast('Das ist weder eine gültige FEN noch eine PGN.', { kind: 'danger' });
    }
  };

  const turn = fen.split(' ')[1];
  const top = lines[0];
  const score = top ? whiteScore(top.score, turn) : null;
  const bestArrow = top?.pv?.[0] ? [[top.pv[0].slice(0, 2), top.pv[0].slice(2, 4), 'g']] : [];
  const mate = top?.score?.mate;
  const status = view.isCheckmate() ? 'Schachmatt' : view.isStalemate() ? 'Patt' : view.isDraw() ? 'Remis' : view.inCheck() ? 'Schach!' : null;

  return html`<div class="page analysis">
    <div class="page-head"><div><h1>Analysebrett</h1><p class="muted">Ziehe beide Seiten. Rechtsklick zeichnet Pfeile. Stockfish rechnet live mit.</p></div></div>
    <div class="game-grid">
      <div class="game-board-col">
        <div class="board-with-eval">
          <${EvalBar} score=${score} orientation=${orientation} />
          <${Board} fen=${fen} orientation=${orientation} movable="both" onMove=${onMove} lastMove=${ply ? [hist[ply - 1].from, hist[ply - 1].to] : null} arrows=${on ? bestArrow : []} />
        </div>
        <div class="nav-row">
          <button class="btn ghost" onClick=${() => setPly(0)}>⏮</button>
          <button class="btn ghost" onClick=${() => setPly(Math.max(0, ply - 1))}><${Icon} name="back" /></button>
          <button class="btn ghost" onClick=${() => setPly(Math.min(hist.length, ply + 1))}><${Icon} name="next" /></button>
          <button class="btn ghost" onClick=${() => setPly(hist.length)}>⏭</button>
          <button class="btn ghost" onClick=${() => setOrientation(orientation === 'w' ? 'b' : 'w')}><${Icon} name="flip" /></button>
          <a class="btn ghost" href=${`#/play?fen=${encodeURIComponent(fen)}`}><${Icon} name="play" /> Gegen Bot ausspielen</a>
        </div>
      </div>
      <aside class="game-side">
        ${status && html`<div class="mate-alert static"><b>${status}</b></div>`}
        ${!status && mate != null && html`<div class=${`mate-alert ${mate > 0 ? '' : 'danger'}`}><${Icon} name="flame" /> <b>${mate > 0 ? `${turn === 'w' ? 'Weiß' : 'Schwarz'} hat Matt in ${mate}` : `${turn === 'w' ? 'Schwarz' : 'Weiß'} setzt in ${-mate} matt`}</b></div>`}
        <div class="card engine-card">
          <div class="engine-head">
            <label class="switch"><input type="checkbox" checked=${on} onChange=${(e) => setOn(e.target.checked)} /><span></span> Stockfish 18</label>
            <span class="muted small">Tiefe ${depth}</span>
          </div>
          ${on &&
          lines.map((l) => {
            const san = pvToSan(fen, l.pv, 10);
            return html`<div class="pv-line">
              <span class="pv-score">${formatScore(whiteScore(l.score, turn))}</span>
              <span class="pv-moves">${san.map((m, i) => html`<button class="mv" onClick=${() => {
                const c = chessRef.current;
                while (c.history().length > ply) c.undo();
                for (const mm of san.slice(0, i + 1)) c.move(mm.san);
                setPly(c.history().length);
                setTick((x) => x + 1);
              }}>${sanDe(m.san)}</button>`)}</span>
            </div>`;
          })}
        </div>
        <div class="card moves">
          <div class="move-list">
            ${hist.map((m, i) => html`${m.color === 'w' ? html`<span class="mv-num">${Math.floor(i / 2) + 1}.</span>` : null}<button class=${`mv ${i === ply - 1 ? 'cur' : ''}`} onClick=${() => setPly(i + 1)}>${sanDe(m.san)}</button>`)}
          </div>
        </div>
        <div class="card">
          <h3>Stellung laden</h3>
          <textarea class="input" rows="3" placeholder="FEN oder PGN einfügen" value=${input} onInput=${(e) => setInput(e.target.value)}></textarea>
          <div class="btn-row">
            <button class="btn secondary" onClick=${load}>Laden</button>
            <button class="btn ghost" onClick=${() => { navigator.clipboard?.writeText(fen); toast('FEN kopiert'); }}>FEN kopieren</button>
            <a class="btn ghost" href="#/analysis">Neu</a>
          </div>
        </div>
      </aside>
    </div>
  </div>`;
}
