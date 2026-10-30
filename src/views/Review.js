// Partieanalyse: jeder Zug bewertet, Genauigkeit, Bewertungskurve, Erklärungen.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, useStore } from '../lib/store.js';
import { engine } from '../lib/engine.js';
import { classify, explain, accuracyOf, CLASSES } from '../lib/coach.js';
import { Chess, sanDe, whiteScore, scoreCp, winPct, formatScore } from '../lib/chess-util.js';
import { Board } from '../ui/Board.js';
import { Coach, EvalBar, Icon, Bar } from '../ui/kit.js';
import { recordMistake } from '../lib/mistakes.js';

export function GameReview({ id }) {
  const s = useStore();
  const game = s.games.find((g) => g.id === id);
  const [positions, setPositions] = useState(null);
  const [analysis, setAnalysis] = useState([]);
  const [cur, setCur] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    if (!game) return;
    const c = new Chess();
    c.loadPgn(game.pgn);
    const moves = c.history({ verbose: true });
    const r = new Chess(game.startFen || undefined);
    const list = [{ fen: r.fen(), move: null }];
    for (const m of moves) {
      r.move(m.san);
      list.push({ fen: r.fen(), move: m, mated: r.isCheckmate(), stalemate: r.isStalemate() });
    }
    setPositions(list);
    setCur(list.length - 1);
    const cached = game.review;
    if (cached?.length === list.length) {
      setAnalysis(cached);
      return;
    }
    (async () => {
      const out = [];
      for (let i = 0; i < list.length; i++) {
        if (!alive.current) return;
        const p = list[i];
        if (p.mated || p.stalemate) out.push({ fen: p.fen, lines: [], mated: p.mated, stalemate: p.stalemate, turn: p.fen.split(' ')[1] });
        else {
          const res = await engine.analyze(p.fen, { depth: 12, movetime: 450 });
          if (!res) return;
          out.push(res);
        }
        setAnalysis([...out]);
      }
      update((st) => {
        const g = st.games.find((x) => x.id === id);
        if (g) g.review = out.map((a) => ({ fen: a.fen, turn: a.turn, bestmove: a.bestmove, mated: a.mated, stalemate: a.stalemate, lines: a.lines.slice(0, 1).map((l) => ({ score: l.score, pv: l.pv.slice(0, 8) })) }));
        // Eigene Fehler und Patzer landen im Trainer „Deine Partie-Fehler“.
        for (let i = 1; i < list.length; i++) {
          const mv = list[i].move;
          if (mv.color !== game.color) continue;
          const uci = mv.from + mv.to + (mv.promotion || '');
          const k = classify(out[i - 1], out[i], uci);
          const best = out[i - 1]?.lines?.[0]?.pv?.[0];
          if (k && (k.key === 'mistake' || k.key === 'blunder') && best && best !== uci)
            recordMistake(st, { fen: list[i - 1].fen, best, played: uci, san: mv.san, cls: k.key, bot: game.bot, elo: game.elo, date: game.date });
        }
      });
    })();
    return () => {
      alive.current = false;
      engine.cancelAll();
    };
  }, [id]);

  useEffect(() => {
    const k = (e) => {
      if (!positions) return;
      if (e.key === 'ArrowLeft') setCur((x) => Math.max(0, x - 1));
      if (e.key === 'ArrowRight') setCur((x) => Math.min(positions.length - 1, x + 1));
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [positions]);

  if (!game) return html`<div class="page"><h1>Partie nicht gefunden</h1><a href="#/profile" class="btn primary">Zu deinen Partien</a></div>`;
  if (!positions) return html`<div class="page"><p>Lädt …</p></div>`;

  const done = analysis.length === positions.length;
  const cls = positions.map((p, i) => (i > 0 && analysis[i - 1] && analysis[i] ? classify(analysis[i - 1], analysis[i], p.move.from + p.move.to + (p.move.promotion || '')) : null));
  const mine = cls.map((c, i) => (i > 0 && positions[i].move.color === game.color ? c : null)).filter(Boolean);
  const theirs = cls.map((c, i) => (i > 0 && positions[i].move.color !== game.color ? c : null)).filter(Boolean);
  const acc = (arr) => (arr.length ? Math.round(arr.reduce((a, c) => a + accuracyOf(c.loss), 0) / arr.length) : null);
  const count = (arr, k) => arr.filter((c) => c.key === k).length;
  const p = positions[cur];
  const a = analysis[cur];
  const prev = analysis[cur - 1];
  const c = cls[cur];
  const ex = c && cur > 0 ? explain({ fenBefore: positions[cur - 1].fen, move: p.move, before: prev, after: a, cls: c, opp: p.move.color === game.color ? game.bot : 'du' }) : null;
  const score = a?.lines?.[0] ? whiteScore(a.lines[0].score, a.turn) : a?.mated ? { mate: a.turn === 'w' ? -0 : 0 } : null;
  const keyMoments = cls.map((x, i) => ({ x, i })).filter(({ x, i }) => x && i > 0 && positions[i].move.color === game.color && (x.key === 'mistake' || x.key === 'blunder'));

  // Bewertungskurve
  const pts = analysis.map((r, i) => {
    const sc = r.lines?.[0] ? whiteScore(r.lines[0].score, r.turn) : r.mated ? { cp: r.turn === 'w' ? -2000 : 2000 } : { cp: 0 };
    return [i, sc.mate != null ? (sc.mate > 0 ? 100 : 0) : winPct(scoreCp(sc))];
  });
  const W = 600;
  const H = 120;
  const N = Math.max(1, positions.length - 1);
  const path = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${(i / N) * W},${H - (v / 100) * H}`).join(' ');

  return html`<div class="page review">
    <div class="page-head">
      <div><h1>Analyse: ${game.result === 'win' ? 'Sieg' : game.result === 'draw' ? 'Remis' : 'Niederlage'} gegen ${game.bot} (${game.elo})</h1>
      <p class="muted">${new Date(game.date).toLocaleDateString('de-DE')} · ${game.reason} · ${Math.ceil(game.moves / 2)} Züge</p></div>
      ${!done && html`<div class="progress-pill">Analysiere … ${analysis.length}/${positions.length}</div>`}
    </div>
    <div class="game-grid">
      <div class="game-board-col">
        <div class="board-with-eval">
          <${EvalBar} score=${score} orientation=${game.color} />
          <${Board} fen=${p.fen} orientation=${game.color} lastMove=${p.move ? [p.move.from, p.move.to] : null} arrows=${ex?.arrows || []} />
        </div>
        <div class="nav-row">
          <button class="btn ghost" onClick=${() => setCur(0)}>⏮</button>
          <button class="btn ghost" onClick=${() => setCur(Math.max(0, cur - 1))}><${Icon} name="back" /></button>
          <button class="btn ghost" onClick=${() => setCur(Math.min(positions.length - 1, cur + 1))}><${Icon} name="next" /></button>
          <button class="btn ghost" onClick=${() => setCur(positions.length - 1)}>⏭</button>
          <a class="btn ghost" href=${`#/analysis?fen=${encodeURIComponent(p.fen)}`}><${Icon} name="scope" /> Ab hier analysieren</a>
        </div>
      </div>
      <aside class="game-side">
        <div class="card acc-card">
          <div class="acc"><small>Deine Genauigkeit</small><b>${acc(mine) ?? '…'}${acc(mine) != null ? ' %' : ''}</b></div>
          <div class="acc"><small>${game.bot}</small><b>${acc(theirs) ?? '…'}${acc(theirs) != null ? ' %' : ''}</b></div>
          <div class="cls-counts">
            ${['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'].map((k) => html`<span class=${`cc c-${CLASSES[k].tone}`}>${CLASSES[k].sym} ${CLASSES[k].label}: <b>${count(mine, k)}</b></span>`)}
          </div>
        </div>
        <div class="card">
          <svg class="eval-graph" viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick=${(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setCur(Math.min(analysis.length - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * N))));
          }}>
            <rect width=${W} height=${H} fill="var(--graph-bg)" />
            <line x1="0" y1=${H / 2} x2=${W} y2=${H / 2} stroke="var(--line)" />
            ${pts.length > 1 && html`<path d=${`${path} L${(pts[pts.length - 1][0] / N) * W},${H} L0,${H} Z`} fill="rgba(255,255,255,.85)" />`}
            <line x1=${(cur / N) * W} y1="0" x2=${(cur / N) * W} y2=${H} stroke="var(--accent)" stroke-width="2" />
          </svg>
        </div>
        ${c && cur > 0 && html`<${Coach} text=${`**${sanDe(p.move.san)}: ${c.label} ${c.sym}** – ${ex?.text || ''}`} tone=${c.tone} />`}
        ${a?.lines?.[0] && html`<p class="muted small">Engine: ${formatScore(score)} · Bester Zug danach: ${a.bestmove || '–'}</p>`}
        ${keyMoments.length > 0 && html`<div class="card">
          <h3>Schlüsselmomente</h3>
          ${keyMoments.map(({ x, i }) => html`<button class="row-link" onClick=${() => setCur(i)}><span class=${`cc c-${x.tone}`}>${x.sym}</span><span><b>${Math.ceil(i / 2)}. ${sanDe(positions[i].move.san)}</b><small>${x.label}</small></span></button>`)}
        </div>`}
        <div class="card moves">
          <div class="move-list">
            ${positions.slice(1).map((pp, j) => {
              const i = j + 1;
              const cl = cls[i];
              return html`${pp.move.color === 'w' ? html`<span class="mv-num">${Math.ceil(i / 2)}.</span>` : null}<button class=${`mv ${cur === i ? 'cur' : ''} ${cl ? 'c-' + cl.tone : ''}`} onClick=${() => setCur(i)}>${sanDe(pp.move.san)}${cl && ['inacc', 'mistake', 'blunder'].includes(cl.tone) ? cl.sym : ''}</button>`;
            })}
          </div>
        </div>
      </aside>
    </div>
  </div>`;
}
