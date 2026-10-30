// Probepartien gegen Bots (Elo 400–3000) mit Live-Coach, Matt-Finder, Drohungen und Uhr.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, useStore, saveNow } from '../lib/store.js';
import { useContent } from '../lib/content.js';
import { engine, botMove, nullMoveFen, warmup } from '../lib/engine.js';
import { classify, explain, threatText, hintFor, accuracyOf, winOf, CLASSES } from '../lib/coach.js';
import { recordGame, checkAchievements } from '../lib/progress.js';
import { Chess, START_FEN, parseUci, safeChess, sanDe, toUci, whiteScore, capturedPieces, colorName } from '../lib/chess-util.js';
import { Board, squaresIn } from '../ui/Board.js';
import { Coach, EvalBar, Icon, Md, Modal, PieceIcon, ThinkingDots, announce, confetti } from '../ui/kit.js';
import { play, playMove } from '../lib/sound.js';
import { recordMistake } from '../lib/mistakes.js';
import { estimateRating } from '../lib/rating.js';

export const BOTS = [
  { name: 'Benni', elo: 400, desc: 'Hat gestern erst die Regeln gelernt', icon: 'bP', art: 'b1', style: 'random', hello: 'Hi! Ich hab gestern erst gelernt, wie der Springer zieht. Sei nett zu mir!' },
  { name: 'Lena', elo: 700, desc: 'Spielt gern auf Angriff, vergisst die Deckung', icon: 'bN', art: 'b2', style: 'attack', hello: 'Ich greife an. Immer. Pass auf deinen König auf!' },
  { name: 'Kai', elo: 1000, desc: 'Solider Hobbyspieler', icon: 'bB', art: 'b3', style: 'balanced', hello: 'Lass uns eine schöne Partie spielen. Ich nehme mir Zeit für jeden Zug.' },
  { name: 'Mira', elo: 1300, desc: 'Taktisch wach, strategisch lernend', icon: 'bR', art: 'b4', style: 'tactical', hello: 'Ich liebe Gabeln. Und Spieße. Und Fesselungen. Du bist gewarnt.' },
  { name: 'Viktor', elo: 1600, desc: 'Vereinsspieler mit Plan', icon: 'bQ', art: 'b5', style: 'solid', hello: 'Erst entwickeln, dann rochieren, dann denken. Ein Plan schlägt jede Panik.' },
  { name: 'Nova', elo: 2000, desc: 'Expertin – bestraft jeden Fehler', icon: 'bK', art: 'b6', style: 'tactical', hello: 'Jeder hängende Bauer gehört mir. Konzentrier dich.' },
  { name: 'Titan', elo: 2500, desc: 'Meisterniveau', icon: 'bK', art: 'b7', style: 'solid', hello: 'Ruhig, präzise, geduldig. So spielen Meister.' },
  { name: 'Stockfish', elo: 3000, desc: 'Volle Stärke. Viel Glück.', icon: 'bK', art: 'b8', style: 'balanced', hello: 'Bereit? Ich bin immer bereit.' },
];

/** Bot für die Einstufungspartie: passt seine Stärke nach jedem deiner Züge an. */
const TESTBOT = { name: 'Testbot', elo: 1000, desc: 'Passt sich deinem Spiel an', icon: 'bN', art: 'b3', style: 'balanced', hello: 'Ich passe mich deinem Spiel an. Spiel ganz normal – nach 20 Zügen bekommst du deine Wertung.' };
const TEST_MOVES = 20;
const clampElo = (x) => Math.max(400, Math.min(2400, Math.round(x)));
const clampBot = (x) => Math.max(300, Math.min(2600, Math.round(x)));

const STYLE_LABEL = { random: 'Chaotisch', attack: 'Angriff', balanced: 'Ausgewogen', tactical: 'Taktisch', solid: 'Positionell' };

/** Wie lange der Bot „überlegt“, bevor er zieht. */
export const SPEEDS = [
  { id: 'relaxed', label: 'Gemütlich', f: 1.6, desc: 'Lässt sich richtig Zeit – wie ein echter Gegner am Brett' },
  { id: 'normal', label: 'Normal', f: 1, desc: 'Menschliches Tempo: schnell in der Eröffnung, länger bei schweren Stellungen' },
  { id: 'fast', label: 'Flott', f: 0.5, desc: 'Kurze Bedenkzeit' },
  { id: 'instant', label: 'Sofort', f: 0.12, desc: 'Zieht fast ohne Pause' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Zahl, die hochzählt (für die Wertung nach der Testpartie). */
function CountUp({ to, ms = 1400 }) {
  const [v, setV] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches ? to : 0);
  useEffect(() => {
    if (v === to) return;
    const t0 = performance.now();
    let id = requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) id = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(id);
  }, [to]);
  return html`<span>${v}</span>`;
}

/** Menschliche Bedenkzeit in ms – hängt von Phase, Stellung, Stärke, Uhr und Tempo ab. */
function thinkTime(chess, elo, speedId, clockMs, inc) {
  const f = (SPEEDS.find((x) => x.id === speedId) || SPEEDS[1]).f;
  const legal = chess.moves({ verbose: true });
  const ply = chess.history().length;
  const hist = chess.history({ verbose: true });
  const last = hist[hist.length - 1];
  let t;
  if (legal.length <= 1) t = 650;
  else if (ply < 8) t = 900 + Math.random() * 1000;
  else {
    const pieces = chess.board().flat().filter(Boolean).length;
    const endgame = pieces <= 12;
    t = (endgame ? 1400 : 1900) + Math.random() * (endgame ? 1600 : 2800);
    if (chess.inCheck()) t *= 0.75;
    if (legal.filter((m) => m.captured).length >= 3) t *= 1.15;
    t *= 0.8 + Math.min(1, elo / 2500) * 0.45;
    if (Math.random() < 0.12) t *= 1.7; // ab und zu ein langer Denker
  }
  if (last?.captured && legal.some((m) => m.to === last.to && m.captured)) t *= 0.6; // Zurückschlagen geht schnell
  t *= f;
  if (clockMs > 0) t = Math.min(t, Math.max(250, clockMs / 35 + inc * 600));
  return Math.round(Math.max(f < 0.3 ? 150 : 400, Math.min(t, 9000)));
}

const TIMES = [
  { id: 'none', label: 'Ohne Uhr', base: 0, inc: 0 },
  { id: '15+10', label: '15 + 10', base: 900, inc: 10 },
  { id: '10+0', label: '10 Min', base: 600, inc: 0 },
  { id: '5+3', label: '5 + 3', base: 300, inc: 3 },
  { id: '3+2', label: '3 + 2', base: 180, inc: 2 },
];

const COACH = [
  { id: 'full', label: 'Voll', desc: 'Live-Bewertung, Drohungen, Matt-Alarm, Tipps' },
  { id: 'quiet', label: 'Leise', desc: 'Warnt nur bei Fehlern, mit Zurücknehmen' },
  { id: 'off', label: 'Aus', desc: 'Echte Partie ohne Hilfe' },
];

export const botFor = (elo) => BOTS.reduce((a, b) => (Math.abs(b.elo - elo) < Math.abs(a.elo - elo) ? b : a));

export function Play({ query }) {
  const s = useStore();
  const [game, setGame] = useState(() => {
    if (query.get('test'))
      return { test: true, elo: clampElo(s.play.rating), userColor: 'w', time: 'none', coach: 'quiet', speed: s.settings.botSpeed || 'normal', startFen: START_FEN, botName: TESTBOT.name, key: 'test' };
    return query.get('resume') && s.currentGame ? s.currentGame.setup : null;
  });
  useEffect(warmup, []);
  if (game) return html`<${Game} setup=${game} resume=${!!query.get('resume') && s.currentGame} onExit=${() => setGame(null)} onNew=${(g) => setGame({ ...g, key: Date.now() })} key=${game.key || 0} />`;
  return html`<${Setup} s=${s} query=${query} onStart=${(g) => setGame({ ...g, key: Date.now() })} />`;
}

function Setup({ s, query, onStart }) {
  const startElo = +query.get('elo') || s.play.rating;
  const [elo, setElo] = useState(Math.round(Math.max(400, Math.min(3000, startElo)) / 50) * 50);
  const [color, setColor] = useState('w');
  const [time, setTime] = useState('none');
  const [coach, setCoach] = useState(s.settings.coach);
  const [speed, setSpeed] = useState(SPEEDS.some((x) => x.id === s.settings.botSpeed) ? s.settings.botSpeed : 'normal');
  const recommended = botFor(s.play.rating);
  const [fen, setFen] = useState(query.get('fen') || '');
  const bot = botFor(elo);
  const fenOk = !fen || ((c) => !!c && !c.isGameOver())(safeChess(fen));

  const start = () => {
    const userColor = color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    update((st) => {
      st.settings.coach = coach;
      st.settings.botSpeed = speed;
    });
    onStart({ elo, userColor, time, coach, speed, startFen: fen && fenOk ? safeChess(fen).fen() : START_FEN, botName: bot.name });
  };

  return html`<div class="page play-setup">
    <div class="page-head"><div><h1>Probepartie</h1><p class="muted">Deine Spiel-Elo: <b>${s.play.rating}</b> · ${s.games.length} Partien</p></div></div>
    ${s.currentGame &&
    html`<a class="banner resume" href="#/play?resume=1"><${Icon} name="play" /> Laufende Partie gegen ${s.currentGame.setup.botName} (${s.currentGame.setup.elo}) fortsetzen</a>`}
    <section>
      <div class="section-head"><h2>Wähle deinen Gegner</h2></div>
      <div class="bot-grid">
        ${BOTS.map(
          (b) => html`<button class=${`bot-card art-${b.art} ${bot.name === b.name ? 'on' : ''}`} onClick=${() => setElo(b.elo)}>
            ${recommended.name === b.name && html`<span class="tile-badge">FÜR DICH</span>`}
            <${PieceIcon} p=${b.icon} size=${56} />
            <b>${b.name}</b><span class="elo-badge">${b.elo}</span><small>${b.desc}</small>
            <span class="bot-style">${STYLE_LABEL[b.style]}</span>
          </button>`,
        )}
      </div>
      <div class="elo-slider card">
        <div class="slider-head"><span>Genaue Stärke</span><b>${elo} Elo</b></div>
        <input type="range" min="400" max="3000" step="50" value=${elo} onInput=${(e) => setElo(+e.target.value)} />
        <div class="slider-scale"><span>400</span><span>1200</span><span>2000</span><span>3000</span></div>
      </div>
    </section>
    <section class="setup-grid">
      <div class="card">
        <h3>Farbe</h3>
        <div class="seg">
          ${[['w', 'Weiß'], ['r', 'Zufall'], ['b', 'Schwarz']].map(([k, l]) => html`<button class=${color === k ? 'on' : ''} onClick=${() => setColor(k)}>${l}</button>`)}
        </div>
      </div>
      <div class="card">
        <h3>Bedenkzeit</h3>
        <div class="seg wrap">${TIMES.map((t) => html`<button class=${time === t.id ? 'on' : ''} onClick=${() => setTime(t.id)}>${t.label}</button>`)}</div>
      </div>
      <div class="card">
        <h3>Bot-Tempo</h3>
        <div class="seg wrap">${SPEEDS.map((x) => html`<button class=${speed === x.id ? 'on' : ''} onClick=${() => setSpeed(x.id)}>${x.label}</button>`)}</div>
        <p class="muted small">${(SPEEDS.find((x) => x.id === speed) || SPEEDS[1]).desc}</p>
      </div>
      <div class="card">
        <h3>Coach</h3>
        <div class="seg">${COACH.map((c) => html`<button class=${coach === c.id ? 'on' : ''} onClick=${() => setCoach(c.id)}>${c.label}</button>`)}</div>
        <p class="muted small">${COACH.find((c) => c.id === coach).desc}</p>
      </div>
      <div class="card">
        <h3>Startstellung <em class="muted">optional</em></h3>
        <input class=${`input ${fenOk ? '' : 'invalid'}`} placeholder="FEN einfügen – leer = Grundstellung" value=${fen} onInput=${(e) => setFen(e.target.value.trim())} />
      </div>
    </section>
    <div class="sticky-cta"><button class="btn primary xl" disabled=${!fenOk} onClick=${start}><${Icon} name="play" /> Gegen ${bot.name} (${elo}) spielen</button></div>
  </div>`;
}

function detectOpening(content, sans) {
  if (!content || sans.length < 3) return null;
  // Nur Linien, von denen die Partie (noch) nicht abgewichen ist; eindeutig benennbar.
  let bestN = 0;
  let hits = [];
  for (const o of content.openings)
    for (const l of o.lines) {
      let n = 0;
      while (n < l.moves.length && n < sans.length && l.moves[n].san === sans[n]) n++;
      if (n < 3 || n < Math.min(sans.length, l.moves.length)) continue;
      if (n > bestN) {
        bestN = n;
        hits = [];
      }
      if (n === bestN) hits.push({ name: o.name, line: l.name });
    }
  const names = [...new Set(hits.map((h) => h.name))];
  if (names.length !== 1) return null;
  return { name: names[0], line: hits.length === 1 ? hits[0].line : '' };
}

function Game({ setup, resume, onExit, onNew }) {
  const s = useStore();
  const content = useContent();
  const { elo, userColor, coach, startFen, botName } = setup;
  const speed = setup.speed || s.settings.botSpeed || 'normal';
  const test = !!setup.test;
  const bot = test ? TESTBOT : BOTS.find((b) => b.name === botName) || botFor(elo);
  const eloRef = useRef(elo);
  const accRef = useRef([]); // Testpartie: { loss, move } je eigenem Zug
  const botElosRef = useRef([]);
  const testScoreRef = useRef(null);
  const [botElo, setBotElo] = useState(elo);
  const [testResult, setTestResult] = useState(null);
  const [badge, setBadge] = useState(null);
  const [glow, setGlow] = useState({});
  const [draw, setDraw] = useState(false);
  const tc = TIMES.find((t) => t.id === setup.time) || TIMES[0];
  const chessRef = useRef(null);
  const tokenRef = useRef(0);
  const beforeRef = useRef(null);
  const [fen, setFen] = useState(startFen);
  const [last, setLast] = useState(null);
  const [status, setStatus] = useState('init');
  const [evalScore, setEvalScore] = useState(null);
  const [msgs, setMsgs] = useState([
    {
      text: test
        ? `**Testpartie:** Du spielst ${colorName(userColor)}. Der Bot startet bei ${elo} und passt sich nach jedem Zug an dich an. Nach ${TEST_MOVES} Zügen bekommst du deine Wertung.`
        : `Los geht's gegen **${botName}** (${elo}). Du spielst ${colorName(userColor)}.${coach !== 'off' ? ' Ich schaue dir über die Schulter.' : ''}`,
      tone: 'info',
    },
  ]);
  const [intro, setIntro] = useState(resume ? null : 'in');
  const [askResign, setAskResign] = useState(false);
  const [threat, setThreat] = useState(null);
  const [mate, setMate] = useState(null);
  const [hint, setHint] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [paused, setPaused] = useState(null);
  const [classes, setClasses] = useState([]);
  const [over, setOver] = useState(null);
  const [orientation, setOrientation] = useState(userColor);
  const [clock, setClock] = useState({ w: tc.base * 1000, b: tc.base * 1000 });
  const takebacks = useRef(0);
  const skipIntro = useRef(null);
  const caught = useRef(0);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const classesRef = useRef([]);
  const setCls = (fn) => {
    classesRef.current = fn(classesRef.current);
    setClasses(classesRef.current);
  };
  const addInc = (color) => {
    if (!tc.inc) return;
    clockRef.current = { ...clockRef.current, [color]: clockRef.current[color] + tc.inc * 1000 };
    setClock(clockRef.current);
  };

  const say = (m) => setMsgs((x) => [...x.slice(-30), m]);
  const chess = () => chessRef.current;

  const persist = () => {
    update((st) => {
      st.currentGame = { setup, moves: chess().history({ verbose: true }).map(toUci), clock: clockRef.current, classes: classesRef.current, takebacks: takebacks.current };
    });
  };

  // ---------- Partie starten / fortsetzen ----------
  useEffect(() => {
    const c = new Chess(startFen);
    if (resume) {
      for (const u of resume.moves) c.move(parseUci(u));
      takebacks.current = resume.takebacks || 0;
      if (resume.clock) {
        clockRef.current = resume.clock;
        setClock(resume.clock);
      }
      setCls(() => resume.classes || []);
    }
    chessRef.current = c;
    setFen(c.fen());
    engine.newGame();
    const go = () => (c.turn() === userColor ? userTurn() : botTurn());
    let timers = [];
    if (resume) go();
    else {
      setStatus('intro');
      const begin = () => {
        if (!timers.length) return;
        timers.forEach(clearTimeout);
        timers = [];
        setIntro('out');
        setTimeout(() => setIntro(null), 380);
        say({ text: `**${botName}:** „${bot.hello}“`, tone: 'bot' });
        go();
      };
      skipIntro.current = begin;
      timers = [setTimeout(begin, 2300)];
    }
    return () => {
      timers.forEach(clearTimeout);
      tokenRef.current++;
      engine.cancelAll();
    };
  }, []);

  // ---------- Uhr ----------
  useEffect(() => {
    if (!tc.base || over || status === 'init' || status === 'intro' || status === 'thinking') return;
    const t = setInterval(() => {
      const side = chess().turn();
      if (paused) return;
      setClock((c) => {
        const n = { ...c, [side]: Math.max(0, c[side] - 100) };
        if (n[side] === 0) finish(side === userColor ? 'loss' : 'win', 'Zeit abgelaufen');
        return n;
      });
    }, 100);
    return () => clearInterval(t);
  }, [over, status, paused]);

  const checkOver = () => {
    const c = chess();
    if (!c.isGameOver()) return false;
    if (c.isCheckmate()) finish(c.turn() === userColor ? 'loss' : 'win', 'Schachmatt');
    else if (c.isStalemate()) finish('draw', 'Patt');
    else if (c.isThreefoldRepetition()) finish('draw', 'Dreifache Wiederholung');
    else if (c.isInsufficientMaterial()) finish('draw', 'Ungenügendes Material');
    else finish('draw', '50-Züge-Regel');
    return true;
  };

  /**
   * Auswertung der Testpartie (siehe lib/rating.js): Qualität jedes Zuges + Ergebnis gegen den
   * Bot + Startschätzung aus der Umfrage → wahrscheinlichste Wertung und 80-%-Bereich.
   */
  const finishTest = (result, reason) => {
    const c = chess();
    const moves = accRef.current;
    const bots = botElosRef.current;
    const opponent = bots.length ? bots.reduce((a, b) => a + b, 0) / bots.length : eloRef.current;
    const score = reason === 'Testende' ? (testScoreRef.current ?? 0.5) : result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    const res = estimateRating({ moves, prior: elo, priorSd: s.profile.elo ? 300 : 400, score, opponent });
    const est = Math.max(100, Math.min(2900, res.rating));
    const avg = moves.length ? moves.reduce((a, m) => a + accuracyOf(m.loss), 0) / moves.length : 0;
    const counts = (k) => classesRef.current.filter((x) => x === k).length;
    const gid = Date.now().toString(36);
    update((st) => {
      st.play.rating = est;
      st.play.history.push([Date.now(), est]);
      st.profile.placementDone = true;
      st.profile.placement = { rating: est, low: res.low, high: res.high, date: Date.now() };
      st.currentGame = null;
      recordGame(st, { id: gid, date: Date.now(), pgn: c.pgn(), result, reason: reason === 'Testende' ? 'Testpartie' : reason, color: userColor, elo: eloRef.current, bot: 'Testbot', moves: c.history().length, rated: false, startFen, classes: classesRef.current });
    });
    saveNow();
    setStatus('over');
    setTestResult({ id: gid, est, low: res.low, high: res.high, avg: Math.round(avg), botElo: Math.round(opponent / 10) * 10, best: counts('best') + counts('excellent'), good: counts('good'), bad: counts('mistake') + counts('blunder'), moves: moves.length });
    play('win');
    confetti(90);
  };

  const finish = (result, reason) => {
    if (chessRef.current.__over) return;
    chessRef.current.__over = true;
    tokenRef.current++;
    engine.cancelAll();
    if (test) {
      finishTest(result, reason);
      return;
    }
    const c = chess();
    c.setHeader('White', userColor === 'w' ? s.profile.name || 'Du' : `${botName} (${elo})`);
    c.setHeader('Black', userColor === 'b' ? s.profile.name || 'Du' : `${botName} (${elo})`);
    c.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    c.setHeader('Result', result === 'draw' ? '1/2-1/2' : (result === 'win') === (userColor === 'w') ? '1-0' : '0-1');
    if (startFen !== START_FEN) {
      c.setHeader('SetUp', '1');
      c.setHeader('FEN', startFen);
    }
    const id = Date.now().toString(36);
    const rated = startFen === START_FEN && takebacks.current === 0 && c.history().length >= 10;
    const before = s.play.rating;
    let fresh = [];
    let xp = 0;
    update((st) => {
      xp = recordGame(st, { id, date: Date.now(), pgn: c.pgn(), result, reason, color: userColor, elo, bot: botName, moves: c.history().length, rated, startFen, classes: classesRef.current }).xp;
      st.currentGame = null;
      fresh = checkAchievements(st);
    });
    saveNow();
    setOver({ result, reason, id, xp, rated, delta: s.play.rating - before });
    setStatus('over');
    play(result === 'win' ? 'win' : result === 'draw' ? 'move' : 'bad');
    if (result === 'win') confetti();
    announce(fresh);
  };

  // ---------- Benutzer am Zug: Hintergrund-Analyse ----------
  const userTurn = () => {
    const token = ++tokenRef.current;
    setStatus('user');
    setHint(null);
    setHintLevel(0);
    setThreat(null);
    setMate(null);
    const f = chess().fen();
    if (coach === 'off') {
      beforeRef.current = null;
      return;
    }
    const p = engine.analyze(f, { depth: 13, movetime: 800, multipv: 2 });
    beforeRef.current = p;
    p.then((r) => {
      if (!r || token !== tokenRef.current) return;
      const top = r.lines[0];
      if (top) setEvalScore(whiteScore(top.score, r.turn));
      if (coach === 'full' && top?.score.mate > 0) setMate({ n: top.score.mate, uci: top.pv[0] });
    });
    if (coach === 'full') {
      const nf = nullMoveFen(f);
      if (nf)
        engine.analyze(nf, { depth: 10, movetime: 300 }).then((r) => {
          if (!r || token !== tokenRef.current) return;
          const t = threatText(nf, r);
          if (t) setThreat(t);
        });
    }
  };

  // ---------- Bot am Zug ----------
  const botTurn = async () => {
    const token = ++tokenRef.current;
    setStatus('bot');
    const t0 = Date.now();
    const c0 = chess();
    const want = thinkTime(c0, eloRef.current, speed, tc.base ? clockRef.current[c0.turn()] : 0, tc.inc);
    let uci = null;
    try {
      uci = await botMove(c0.fen(), eloRef.current, bot.style);
    } catch {
      // Engine nicht verfügbar: lieber ein zufälliger legaler Zug als eine hängende Partie.
      const legal = c0.moves({ verbose: true });
      const m = legal[Math.floor(Math.random() * legal.length)];
      uci = m ? m.from + m.to + (m.promotion || '') : null;
    }
    if (token !== tokenRef.current) return;
    if (!uci) {
      checkOver();
      return;
    }
    await sleep(Math.max(0, want - (Date.now() - t0)));
    if (token !== tokenRef.current) return;
    const c = chess();
    const m = c.move(parseUci(uci));
    playMove(m, c);
    addInc(m.color);
    setFen(c.fen());
    setLast([m.from, m.to]);
    setBadge(null);
    setGlow({});
    persist();
    if (!checkOver()) userTurn();
  };

  // ---------- Benutzerzug ----------
  const onMove = async ({ from, to, promotion }) => {
    if (status !== 'user' || paused) return;
    const c = chess();
    const fenBefore = c.fen();
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const token = ++tokenRef.current;
    playMove(m, c);
    addInc(m.color);
    setFen(c.fen());
    setLast([m.from, m.to]);
    setHint(null);
    setThreat(null);
    setMate(null);
    setBadge(null);
    setGlow({});
    persist();
    const ply = c.history().length - 1;
    if (c.isGameOver()) {
      checkOver();
      return;
    }
    if (coach === 'off') {
      botTurn();
      return;
    }
    setStatus('thinking');
    const before = await beforeRef.current;
    const after = await engine.analyze(c.fen(), { depth: 12, movetime: 600 });
    if (token !== tokenRef.current) return;
    if (after?.lines[0]) setEvalScore(whiteScore(after.lines[0].score, after.turn));
    const cls = classify(before, after, toUci(m));
    if (cls)
      setCls((x) => {
        const n = [...x];
        n[ply] = cls.key;
        return n;
      });
    const bad = cls && (cls.key === 'mistake' || cls.key === 'blunder');
    if (cls) setBadge({ [m.to]: { sym: cls.sym, tone: cls.tone } });
    if (test && cls) {
      // Jeder Zug fließt in die Schätzung ein; der Bot spielt danach ungefähr auf deinem geschätzten Niveau.
      accRef.current.push({ loss: cls.loss, move: Math.floor(ply / 2) + 1 });
      const est = estimateRating({ moves: accRef.current, prior: elo, priorSd: s.profile.elo ? 300 : 400 });
      eloRef.current = clampBot(0.5 * eloRef.current + 0.5 * est.rating);
      botElosRef.current.push(eloRef.current);
      setBotElo(eloRef.current);
      if (accRef.current.length >= TEST_MOVES) {
        // Nach 20 Zügen: die Stellung zählt als Ergebnis (deine Gewinnchance laut Engine).
        const sc = after?.lines?.[0]?.score;
        testScoreRef.current = sc ? (100 - winOf(sc)) / 100 : 0.5;
        finish('draw', 'Testende');
        return;
      }
    }
    const bestUci = before?.lines?.[0]?.pv?.[0];
    if (bad && bestUci && bestUci !== toUci(m)) {
      caught.current++;
      update((st) => recordMistake(st, { fen: fenBefore, best: bestUci, played: toUci(m), san: m.san, cls: cls.key, bot: botName, elo, date: Date.now() }));
    }
    if (cls && (bad || (coach === 'full' && (cls.key === 'inaccuracy' || ((cls.key === 'best' || cls.key === 'excellent') && (m.captured || m.san.includes('+') || Math.random() < 0.15)))))) {
      const ex = explain({ fenBefore, move: m, before, after, cls, opp: botName });
      if (ex.text) {
        say({ text: `**${cls.label} ${cls.sym}** – ${ex.text}`, tone: cls.tone, arrows: ex.arrows });
        const hot = squaresIn(ex.text);
        if (hot.length) setGlow(Object.fromEntries(hot.map((q) => [q, bad || cls.key === 'inaccuracy' ? 'glow-r' : 'glow-g'])));
        if (bad && test) setHint({ arrows: ex.arrows });
        if (bad && !test) {
          setHint({ arrows: ex.arrows });
          setPaused({ text: ex.text, cls });
          setStatus('paused');
          return;
        }
      }
    }
    botTurn();
  };

  const takeback = () => {
    tokenRef.current++;
    engine.cancelAll();
    const c = chess();
    if (paused) {
      c.undo();
    } else {
      if (c.turn() === userColor) c.undo();
      c.undo();
    }
    takebacks.current++;
    setPaused(null);
    setBadge(null);
    setGlow({});
    setFen(c.fen());
    const h = c.history({ verbose: true });
    const lm = h[h.length - 1];
    setLast(lm ? [lm.from, lm.to] : null);
    setCls((x) => x.slice(0, h.length));
    say({ text: 'Zurückgenommen. Neuer Versuch!', tone: 'info' });
    persist();
    if (c.turn() === userColor) userTurn();
    else botTurn();
  };

  const continueAnyway = () => {
    setPaused(null);
    setHint(null);
    botTurn();
  };

  const askHint = async () => {
    const token = tokenRef.current;
    const lvl = hintLevel + 1;
    setHintLevel(lvl);
    const r = await beforeRef.current;
    if (token !== tokenRef.current) return;
    const h = hintFor(chess().fen(), r, lvl);
    if (h) {
      setHint(h);
      say({ text: `💡 ${h.text}`, tone: 'info' });
    }
  };

  const resign = () => setAskResign(true);

  const c = chessRef.current;
  const hist = c ? c.history({ verbose: true }) : [];
  const sans = hist.map((m) => m.san);
  const opening = detectOpening(content, sans);
  const lost = capturedPieces(fen);
  const fmt = (ms) => {
    const t = Math.ceil(ms / 1000);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  const showEval = coach === 'full' && s.settings.showEval;
  const arrows = [...(hint?.arrows || []), ...(coach === 'full' && threat && status === 'user' ? [threat.arrow] : [])];
  const threatGlow = coach === 'full' && threat && status === 'user' ? Object.fromEntries(squaresIn(threat.text).map((q) => [q, 'glow-y'])) : {};
  const marks = { ...threatGlow, ...glow, ...(hint?.marks || {}) };
  const top = orientation === userColor ? (userColor === 'w' ? 'b' : 'w') : userColor;
  const bottom = top === 'w' ? 'b' : 'w';
  const playerLine = (side) => {
    const isBot = side !== userColor;
    const thinkingNow = isBot && status === 'bot';
    return html`<div class=${`player ${c && c.turn() === side && !over && status !== 'intro' ? 'to-move' : ''} ${thinkingNow ? 'thinking' : ''}`}>
      <span class="player-name">${isBot ? html`<${PieceIcon} p=${bot.icon} size=${26} /> <span>${botName}</span> <span class="elo-badge">${test ? botElo : elo}</span>` : html`<${PieceIcon} p=${userColor + 'K'} size=${26} /> <span>${s.profile.name || 'Du'}</span> <span class="elo-badge">${s.play.rating}</span>`}</span>
      ${thinkingNow ? html`<span class="bot-status"><${ThinkingDots} /> <span class="hide-sm">denkt nach</span></span>` : null}
      <span class="captured">${lost[side === 'w' ? 'b' : 'w'].map((t) => html`<span class=${`piece-icon piece ${side === 'w' ? 'b' : 'w'}${t.toUpperCase()}`}></span>`)}</span>
      ${tc.base ? html`<span class=${`clock ${c && c.turn() === side && !over ? 'run' : ''} ${clock[side] < 20000 ? 'low' : ''}`}>${fmt(clock[side])}</span>` : null}
    </div>`;
  };

  return html`<div class="page game">
    <div class="game-grid">
      <div class="game-board-col">
        ${playerLine(top)}
        <div class="board-with-eval">
          ${showEval && html`<${EvalBar} score=${evalScore} orientation=${orientation} />`}
          <${Board} fen=${fen} orientation=${orientation} movable=${status === 'user' && !paused ? userColor : null} onMove=${onMove} lastMove=${last} arrows=${arrows} marks=${marks} badges=${badge} drawMode=${draw} />
        </div>
        ${draw && html`<p class="draw-hint">Pfeil-Modus: von Feld zu Feld ziehen · Feld antippen markiert es · <b>Pfeile</b> nochmal tippen zum Spielen</p>`}
        ${playerLine(bottom)}
      </div>
      <aside class="game-side">
        ${mate && status === 'user' && html`<div class="mate-alert" onClick=${() => setHint({ arrows: [[mate.uci.slice(0, 2), mate.uci.slice(2, 4), 'g']] })}>
          <${Icon} name="flame" /> <b>Matt in ${mate.n} möglich!</b> <span>Findest du es? Tippen für Lösung</span>
        </div>`}
        ${coach === 'full' && threat && status === 'user' && html`<div class=${`threat ${threat.level}`}><${Md} text=${threat.text} tag="span" /></div>`}
        <div class="card coach-feed">
          ${test &&
          html`<div class="test-progress"><span>Testpartie · Zug ${Math.min(TEST_MOVES, accRef.current.length + 1)} von ${TEST_MOVES}</span><div class="bar"><div style=${{ width: `${(accRef.current.length / TEST_MOVES) * 100}%` }}></div></div></div>`}
          ${msgs.slice(-4).map((m) => html`<${Coach} text=${m.text} tone=${m.tone} />`)}
          ${paused && html`<div class="btn-row">
            <button class="btn primary" onClick=${takeback}><${Icon} name="undo" /> Zug zurücknehmen</button>
            <button class="btn ghost" onClick=${continueAnyway}>Trotzdem weiter</button>
          </div>`}
          ${status === 'bot' && html`<p class="small thinking"><${ThinkingDots} /> ${botName} überlegt …</p>`}
          ${status === 'thinking' && html`<p class="small thinking"><${ThinkingDots} /> Coach prüft deinen Zug …</p>`}
        </div>
        ${opening && html`<div class="opening-tag"><${Icon} name="book" size=${16} /> ${opening.name} <small>${opening.line}</small></div>`}
        <div class="card moves">
          <div class="move-list">
            ${hist.map((m, i) => {
              const cl = classes[i] ? CLASSES[classes[i]] : null;
              const label = (i + (startFen.split(' ')[1] === 'b' ? 1 : 0)) % 2 === 0 ? html`<span class="mv-num">${Math.floor(i / 2) + 1}.</span>` : null;
              return html`${label}<span class=${`mv ${cl ? 'c-' + cl.tone : ''}`} title=${cl?.label || ''}>${sanDe(m.san)}${cl && ['inacc', 'mistake', 'blunder'].includes(cl.tone) ? cl.sym : ''}</span>`;
            })}
          </div>
        </div>
        <div class="game-actions">
          ${coach !== 'off' && !test && html`<button class="btn ghost" onClick=${askHint} disabled=${status !== 'user' || hintLevel >= 2}><${Icon} name="bulb" /> Tipp</button>`}
          ${!test && html`<button class="btn ghost" onClick=${takeback} disabled=${!hist.length || status === 'over' || status === 'init'}><${Icon} name="undo" /> Zurück</button>`}
          <button class=${`btn ghost ${draw ? 'on' : ''}`} onClick=${() => setDraw(!draw)} aria-pressed=${draw}><${Icon} name="pen" /> Pfeile</button>
          <button class="btn ghost" onClick=${() => setOrientation(orientation === 'w' ? 'b' : 'w')}><${Icon} name="flip" /> Drehen</button>
          <button class="btn ghost danger" onClick=${resign} disabled=${status === 'over' || status === 'intro'}><${Icon} name="flag" /> Aufgeben</button>
        </div>
      </aside>
    </div>
    ${over &&
    !over.hidden &&
    html`<${Modal} onClose=${() => setOver({ ...over, hidden: true })}>
      ${html`<div class="game-over">
        <div class=${`go-badge ${over.result}`}>${over.result === 'win' ? 'Sieg!' : over.result === 'draw' ? 'Remis' : 'Niederlage'}</div>
        <p class="muted">${over.reason}</p>
        <div class="summary-grid">
          <div><small>XP</small><b>+${over.xp}</b></div>
          <div><small>Spiel-Elo</small><b>${over.rated ? `${over.delta >= 0 ? '+' : ''}${over.delta}` : '–'}</b></div>
          <div><small>Züge</small><b>${Math.ceil(hist.length / 2)}</b></div>
        </div>
        ${!over.rated && html`<p class="muted small">Nicht gewertet (Zurücknahmen, eigene Startstellung oder sehr kurze Partie).</p>`}
        ${caught.current > 0 &&
        html`<a class="banner resume" href="#/puzzles/mine"><${Icon} name="repeat" /> <span><b>${caught.current} ${caught.current === 1 ? 'Fehler' : 'Fehler'}</b> aus dieser Partie gesammelt – jetzt gezielt üben</span></a>`}
        <div class="btn-row center">
          <a class="btn primary" href=${`#/review/${over.id}`}><${Icon} name="scope" /> Partie analysieren</a>
          <button class="btn secondary" onClick=${() => onNew({ ...setup, userColor: userColor === 'w' ? 'b' : 'w' })}><${Icon} name="repeat" /> Revanche</button>
          <button class="btn ghost" onClick=${onExit}>Neuer Gegner</button>
        </div>
      </div>`}
    <//>`}
    ${over?.hidden && html`<div class="btn-row center"><a class="btn primary" href=${`#/review/${over.id}`}>Partie analysieren</a><button class="btn ghost" onClick=${onExit}>Neue Partie</button></div>`}
    ${testResult &&
    html`<${Modal} onClose=${() => (location.hash = '#/')}>
      <div class="game-over test-result">
        <small class="tag">Deine Einstufung</small>
        <div class="test-elo"><${CountUp} to=${testResult.est} /><small>Elo</small></div>
        <p class="test-range">Wahrscheinlich zwischen <b>${testResult.low}</b> und <b>${testResult.high}</b></p>
        <p class="muted">So stark spielst du ungefähr. Ab jetzt passt sich deine Wertung mit jeder Partie an.</p>
        <div class="summary-grid">
          <div><small>Genauigkeit</small><b>${testResult.avg} %</b></div>
          <div><small>Starke Züge</small><b>${testResult.best}</b></div>
          <div><small>Fehler</small><b>${testResult.bad}</b></div>
        </div>
        <p class="muted small">${testResult.moves} Züge ausgewertet · der Bot spielte im Schnitt auf ${testResult.botElo}.</p>
        <div class="btn-row center">
          <a class="btn primary xl" href="#/"><${Icon} name="play" /> Los geht's</a>
          <a class="btn ghost" href=${`#/review/${testResult.id}`}><${Icon} name="scope" /> Partie ansehen</a>
        </div>
      </div>
    <//>`}
    ${askResign &&
    html`<${Modal} onClose=${() => setAskResign(false)}>
      <div class="game-over">
        <h2>Wirklich aufgeben?</h2>
        <p class="muted">Die Partie zählt dann als Niederlage. Du kannst sie danach trotzdem analysieren.</p>
        <div class="btn-row center">
          <button class="btn ghost" onClick=${() => setAskResign(false)}>Weiterspielen</button>
          <button class="btn primary" onClick=${() => {
            setAskResign(false);
            finish('loss', 'Aufgegeben');
          }}><${Icon} name="flag" /> Aufgeben</button>
        </div>
      </div>
    <//>`}
    ${intro &&
    html`<div class=${`vs-intro ${intro === 'out' ? 'out' : ''}`} onClick=${() => skipIntro.current?.()}>
      <div class="vs-card">
        <div class="vs-side"><${PieceIcon} p="wK" size=${110} /><b>${s.profile.name || 'Du'}</b><small>${colorName(userColor)} · ${s.play.rating}</small></div>
        <div class="vs-mark">VS</div>
        <div class="vs-side right"><${PieceIcon} p=${bot.icon} size=${110} /><b>${botName}</b><small>${STYLE_LABEL[bot.style]} · ${elo}</small></div>
        <div class="vs-quote">„${bot.hello}“</div>
        <div class="vs-foot">${tc.base ? `${tc.label} · ` : ''}Bot-Tempo: ${SPEEDS.find((x) => x.id === speed)?.label || 'Normal'} · Tippen zum Starten</div>
      </div>
    </div>`}
  </div>`;
}
