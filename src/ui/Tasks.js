// Interaktive Aufgaben: Zugfolgen (Rätsel), Zielzüge, Sterne-Minispiel, Ausspielen gegen Engine, Quiz.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { Board } from './Board.js';
import { Icon, Md } from './kit.js';
import { fenFromMap, parseUci, safeChess, toUci, FILES, scoreCp } from '../lib/chess-util.js';
import { engine } from '../lib/engine.js';
import { play, playMove } from '../lib/sound.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Zugfolge: Lernender spielt moves[0], [2], …; Gegner antwortet automatisch.
 * `setup`: erster Zug kommt vom Gegner (Lichess-Rätsel).
 */
export function SequenceTask({ fen, moves, setup = false, orientation, onDone, onMistake, hint, solveLabel = 'Lösung zeigen', showControls = true }) {
  const [state, setState] = useState(() => ({ fen, idx: 0, last: null }));
  const [flash, setFlash] = useState(null);
  const [status, setStatus] = useState(setup ? 'setup' : 'play');
  const [mistakes, setMistakes] = useState(0);
  const [helpLevel, setHelpLevel] = useState(0);
  const alive = useRef(true);
  const learner = useRef(null);
  useEffect(() => () => (alive.current = false), []);

  const apply = (st, uci) => {
    const c = safeChess(st.fen);
    const m = c.move(parseUci(uci));
    playMove(m, c);
    return { fen: c.fen(), idx: st.idx + 1, last: [m.from, m.to] };
  };

  useEffect(() => {
    learner.current = setup ? (fen.split(' ')[1] === 'w' ? 'b' : 'w') : fen.split(' ')[1];
    if (setup) {
      (async () => {
        await wait(650);
        if (!alive.current) return;
        setState((st) => apply(st, moves[0]));
        setStatus('play');
      })();
    }
  }, []);

  const finish = (ok, m) => {
    setStatus(ok ? 'done' : 'failed');
    if (ok) play('good');
    onDone?.(ok, m);
  };

  const onMove = async ({ from, to, promotion }) => {
    if (status !== 'play' && status !== 'wrong') return;
    const expected = moves[state.idx];
    const c = safeChess(state.fen);
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = toUci(m);
    // Jedes Matt zählt, auch wenn es nicht der hinterlegte Zug ist.
    const ok = uci === expected || c.isCheckmate();
    if (!ok) {
      play('bad');
      setFlash({ sq: to, kind: 'bad', key: Date.now() });
      setStatus('wrong');
      setMistakes((x) => x + 1);
      onMistake?.();
      return;
    }
    playMove(m, c);
    setFlash({ sq: to, kind: 'good', key: Date.now() });
    setHelpLevel(0);
    let st = { fen: c.fen(), idx: state.idx + 1, last: [m.from, m.to] };
    setState(st);
    if (st.idx >= moves.length || c.isCheckmate()) return finish(true, mistakes);
    setStatus('opp');
    await wait(450);
    if (!alive.current) return;
    st = apply(st, moves[st.idx]);
    setState(st);
    if (st.idx >= moves.length) return finish(true, mistakes);
    setStatus('play');
  };

  const showSolution = async () => {
    setStatus('solving');
    let st = state;
    while (st.idx < moves.length && alive.current) {
      st = apply(st, moves[st.idx]);
      setState(st);
      await wait(600);
    }
    if (alive.current) finish(false, mistakes + 1);
  };

  const exp = moves[state.idx] && parseUci(moves[state.idx]);
  const marks = helpLevel >= 1 && exp && (status === 'play' || status === 'wrong') ? { [exp.from]: 'y' } : {};
  const arrows = helpLevel >= 2 && exp && (status === 'play' || status === 'wrong') ? [[exp.from, exp.to, 'g']] : [];

  return html`<div class="task-wrap">
    <${Board} fen=${state.fen} orientation=${orientation || learner.current || 'w'} movable=${status === 'play' || status === 'wrong' ? learner.current : null}
      onMove=${onMove} lastMove=${state.last} flash=${flash} marks=${marks} arrows=${arrows} />
    ${showControls &&
    html`<div class="task-controls">
      ${status === 'wrong' && html`<span class="feedback bad"><${Icon} name="x" /> Nicht ganz – versuch's nochmal.</span>`}
      ${status === 'opp' && html`<span class="feedback">Gegner zieht …</span>`}
      ${(status === 'play' || status === 'wrong') &&
      html`<div class="btn-row">
        <button class="btn ghost" onClick=${() => {
          setHelpLevel(helpLevel + 1);
          if (helpLevel === 0) onMistake?.('hint');
        }} disabled=${helpLevel >= 2}><${Icon} name="bulb" /> ${helpLevel === 0 ? 'Tipp' : 'Mehr Hilfe'}</button>
        <button class="btn ghost" onClick=${showSolution}><${Icon} name="eye" /> ${solveLabel}</button>
      </div>`}
      ${helpLevel >= 1 && hint && (status === 'play' || status === 'wrong') ? html`<${Md} class="hint-text" text=${hint} />` : null}
    </div>`}
  </div>`;
}

const GOAL_TEST = {
  check: (c) => c.inCheck(),
  mate: (c) => c.isCheckmate(),
  capture: (c, m) => !!m.captured,
  promote: (c, m) => !!m.promotion,
  castle: (c, m) => m.flags.includes('k') || m.flags.includes('q'),
};

/** Ein Zug mit Ziel (Schach geben, mattsetzen, exakter Zug …). */
export function GoalTask({ step, onDone, onMistake }) {
  const [fen, setFen] = useState(step.fen);
  const [last, setLast] = useState(null);
  const [flash, setFlash] = useState(null);
  const [status, setStatus] = useState('play');
  const [help, setHelp] = useState(0);
  const turn = step.fen.split(' ')[1];

  const onMove = ({ from, to, promotion }) => {
    if (status === 'done') return;
    const c = safeChess(fen);
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = toUci(m);
    // Ein Matt ist immer richtig – auch wenn ein anderer Zug hinterlegt ist.
    const ok = c.isCheckmate() || (step.goal === 'exact' ? step.solutions.includes(uci) || step.solutions.includes(uci.slice(0, 4)) : GOAL_TEST[step.goal]?.(c, m));
    if (ok) {
      playMove(m, c);
      play('good');
      setFen(c.fen());
      setLast([m.from, m.to]);
      setFlash({ sq: to, kind: 'good', key: Date.now() });
      setStatus('done');
      onDone?.(true);
    } else {
      play('bad');
      setFlash({ sq: to, kind: 'bad', key: Date.now() });
      setStatus('wrong');
      onMistake?.();
    }
  };

  const sol = step.solutions?.[0] ? parseUci(step.solutions[0]) : null;
  return html`<div class="task-wrap">
    <${Board} fen=${fen} orientation=${step.orientation || turn} movable=${status === 'done' ? null : turn} onMove=${onMove} lastMove=${last} flash=${flash}
      arrows=${status !== 'done' && help >= 2 && sol ? [[sol.from, sol.to, 'g']] : status === 'done' ? [] : step.arrows || []}
      marks=${status !== 'done' && help >= 1 && sol ? { [sol.from]: 'y' } : step.marks || {}} />
    <div class="task-controls">
      ${status === 'wrong' && html`<span class="feedback bad"><${Icon} name="x" /> Das war's noch nicht.</span>`}
      ${status !== 'done' &&
      html`<div class="btn-row"><button class="btn ghost" onClick=${() => {
        setHelp(help + 1);
        if (!help) onMistake?.('hint');
      }} disabled=${help >= (sol ? 2 : 1)}><${Icon} name="bulb" /> Tipp</button></div>`}
      ${help >= 1 && step.hint && status !== 'done' ? html`<${Md} class="hint-text" text=${step.hint} />` : null}
    </div>
  </div>`;
}

// ---------- Sterne-Minispiel ----------

const xy = (sq) => [sq.charCodeAt(0) - 97, +sq[1] - 1];
const sq = (x, y) => FILES[x] + (y + 1);

function starDests(piece, pos, walls, enemies) {
  const kind = piece[1];
  const [x, y] = xy(pos);
  const out = [];
  const inB = (a, b) => a >= 0 && a < 8 && b >= 0 && b < 8;
  if ('RBQ'.includes(kind)) {
    const dirs = [];
    if (kind !== 'B') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    if (kind !== 'R') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    for (const [dx, dy] of dirs) {
      let nx = x + dx;
      let ny = y + dy;
      while (inB(nx, ny)) {
        const t = sq(nx, ny);
        if (walls.has(t)) break;
        out.push(t);
        if (enemies[t]) break;
        nx += dx;
        ny += dy;
      }
    }
  } else if (kind === 'N') {
    for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]])
      if (inB(x + dx, y + dy) && !walls.has(sq(x + dx, y + dy))) out.push(sq(x + dx, y + dy));
  } else if (kind === 'K') {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && inB(x + dx, y + dy) && !walls.has(sq(x + dx, y + dy))) out.push(sq(x + dx, y + dy));
  } else if (kind === 'P') {
    const d = piece[0] === 'w' ? 1 : -1;
    const start = piece[0] === 'w' ? 1 : 6;
    const free = (t) => !walls.has(t) && !enemies[t];
    if (inB(x, y + d) && free(sq(x, y + d))) {
      out.push(sq(x, y + d));
      if (y === start && free(sq(x, y + 2 * d))) out.push(sq(x, y + 2 * d));
    }
    for (const dx of [-1, 1]) if (inB(x + dx, y + d) && enemies[sq(x + dx, y + d)]) out.push(sq(x + dx, y + d));
  }
  return out;
}

export function StarsTask({ step, onDone }) {
  const init = () => ({ pos: step.start, stars: [...step.stars], enemies: { ...(step.enemies || {}) }, moves: 0, last: null });
  const [st, setSt] = useState(init);
  const [done, setDone] = useState(false);
  const walls = new Set(step.walls || []);
  const map = { ...st.enemies, [st.pos]: step.piece };
  const fen = fenFromMap(map, step.piece[0]);

  const onMove = ({ from, to }) => {
    if (done) return;
    const enemies = { ...st.enemies };
    const captured = !!enemies[to];
    delete enemies[to];
    const stars = st.stars.filter((x) => x !== to);
    const got = stars.length < st.stars.length;
    const next = { pos: to, stars, enemies, moves: st.moves + 1, last: [from, to] };
    setSt(next);
    if (got) play('star');
    else play(captured ? 'capture' : 'move');
    if (!stars.length) {
      setDone(true);
      const rating = next.moves <= step.par ? 3 : next.moves <= step.par + 2 ? 2 : 1;
      setTimeout(() => play('good'), 150);
      onDone?.(true, rating, next.moves);
    }
  };

  const rating = done ? (st.moves <= step.par ? 3 : st.moves <= step.par + 2 ? 2 : 1) : 0;
  return html`<div class="task-wrap">
    <${Board} fen=${fen} orientation="w" movable=${done ? null : step.piece[0]} onMove=${onMove} lastMove=${st.last} stars=${st.stars} walls=${[...walls]}
      noPromotion dests=${(s) => (s === st.pos ? starDests(step.piece, st.pos, walls, st.enemies) : [])} />
    <div class="task-controls">
      <div class="stars-meta">
        <span>Züge: <b>${st.moves}</b></span><span>Bestwert: <b>${step.par}</b></span><span>Sterne übrig: <b>${st.stars.length}</b></span>
      </div>
      ${done && html`<div class="feedback good">${'★'.repeat(rating)}${'☆'.repeat(3 - rating)} ${rating === 3 ? 'Perfekt – kürzester Weg!' : `Geschafft in ${st.moves} Zügen. Geht's kürzer?`}</div>`}
      ${(done ? rating < 3 : st.moves > 0) && html`<button class="btn ghost" onClick=${() => { setSt(init()); setDone(false); }}><${Icon} name="repeat" /> Nochmal</button>`}
    </div>
  </div>`;
}

// ---------- Ausspielen gegen die Engine ----------

export function PlayTask({ step, onDone, onMistake }) {
  const learner = step.fen.split(' ')[1];
  const [fen, setFen] = useState(step.fen);
  const [last, setLast] = useState(null);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('play');
  const [msg, setMsg] = useState('');
  const alive = useRef(true);
  useEffect(() => () => (alive.current = false), []);

  const reset = () => {
    setFen(step.fen);
    setLast(null);
    setCount(0);
    setStatus('play');
    setMsg('');
  };

  const hold = step.goal === 'hold';
  const win = (text) => {
    setStatus('done');
    setMsg(text);
    play('win');
    onDone?.(true);
  };
  const lose = (text) => {
    setStatus('failed');
    setMsg(text);
    play('bad');
    onMistake?.();
  };

  const onMove = async ({ from, to, promotion }) => {
    if (status !== 'play') return;
    const c = safeChess(fen);
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    playMove(m, c);
    const n = count + 1;
    setCount(n);
    setFen(c.fen());
    setLast([m.from, m.to]);
    if ((step.goal === 'mate' && c.isCheckmate()) || (step.goal === 'promote' && m.promotion)) {
      win(step.goal === 'mate' ? `Schachmatt in ${n} Zügen!` : 'Umgewandelt!');
      return;
    }
    if (c.isGameOver()) {
      if (hold) win(c.isCheckmate() ? 'Sogar gewonnen – stark!' : 'Remis! Du hast die Stellung gehalten.');
      else lose(c.isStalemate() ? 'Patt! Der König hat kein Feld mehr, steht aber nicht im Schach. Das ist nur Remis.' : 'Remis – das Ziel ist verfehlt.');
      return;
    }
    if (n >= step.maxMoves && !hold) {
      lose(`Zu viele Züge (${step.maxMoves}). Versuch es mit einem klareren Plan.`);
      return;
    }
    setStatus('thinking');
    const t0 = Date.now();
    const r = await engine.analyze(c.fen(), { depth: 14, movetime: 500 });
    if (!alive.current || !r?.bestmove) return;
    // Remis halten: Steht die Engine (am Zug) klar auf Gewinn, ist die Stellung verloren.
    const cp = r.lines?.[0]?.score ? scoreCp(r.lines[0].score) : 0;
    if (hold && n >= step.maxMoves) {
      if (cp < 200) win(`Gehalten! ${n} Züge sauber verteidigt – die Stellung ist Remis.`);
      else lose('Fast – aber jetzt steht die Engine auf Gewinn. Schau dir die Technik nochmal an.');
      return;
    }
    await wait(Math.max(0, 900 + Math.random() * 600 - (Date.now() - t0))); // kurz „überlegen“ wie ein Mensch
    if (!alive.current) return;
    const reply = c.move(parseUci(r.bestmove));
    playMove(reply, c);
    setFen(c.fen());
    setLast([reply.from, reply.to]);
    if (c.isGameOver()) {
      if (hold && !c.isCheckmate()) win('Remis! Du hast die Stellung gehalten.');
      else lose(hold ? 'Matt – diesmal hat die Engine gewonnen. Nochmal!' : 'Die Partie ist vorbei, ohne dass du dein Ziel erreicht hast.');
      return;
    }
    if (hold && cp >= 500) {
      lose('Jetzt gewinnt die Engine. Halte dich an die Technik aus der Lektion und versuch es nochmal.');
      return;
    }
    setStatus('play');
  };

  return html`<div class="task-wrap">
    <${Board} fen=${fen} orientation=${learner} movable=${status === 'play' ? learner : null} onMove=${onMove} lastMove=${last} />
    <div class="task-controls">
      <div class="stars-meta"><span>${hold ? 'Gehalten' : 'Züge'}: <b>${count}</b> / ${step.maxMoves}</span>${status === 'thinking' ? html`<span>Engine denkt …</span>` : null}</div>
      ${msg && html`<div class=${`feedback ${status === 'done' ? 'good' : 'bad'}`}>${msg}</div>`}
      ${status === 'failed' && html`<button class="btn secondary" onClick=${reset}><${Icon} name="repeat" /> Nochmal versuchen</button>`}
    </div>
  </div>`;
}

// ---------- Quiz ----------

export function QuizTask({ step, onDone, onMistake }) {
  const [picked, setPicked] = useState(null);
  const [wrong, setWrong] = useState(new Set());
  const choose = (i) => {
    if (picked === step.answer) return;
    setPicked(i);
    if (i === step.answer) {
      play('good');
      onDone?.(wrong.size === 0);
    } else {
      play('bad');
      setWrong(new Set([...wrong, i]));
      onMistake?.();
    }
  };
  return html`<div class="quiz">
    ${step.fen && html`<${Board} fen=${step.fen} orientation=${step.orientation || 'w'} arrows=${step.arrows || []} marks=${step.marks || {}} />`}
    <div class="quiz-options">
      ${step.options.map(
        (o, i) => html`<button class=${`quiz-opt ${wrong.has(i) ? 'wrong' : ''} ${picked === step.answer && i === step.answer ? 'right' : ''}`} onClick=${() => choose(i)} disabled=${wrong.has(i)}>
          <span class="quiz-key">${String.fromCharCode(65 + i)}</span><${Md} text=${o} tag="span" />
        </button>`,
      )}
    </div>
    ${picked === step.answer && step.explain ? html`<${Md} class="explain good" text=${step.explain} />` : null}
    ${picked !== null && picked !== step.answer ? html`<p class="feedback bad">Leider nicht. Probier eine andere Antwort.</p>` : null}
  </div>`;
}
