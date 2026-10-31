// Sehtraining: kurze Runden für den Brettblick. Wer schneller sieht, was hängt und welche Schachs es gibt,
// übersieht in Partien weniger – das bringt gerade in wenigen Tagen viel.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, useStore, today } from '../lib/store.js';
import { safeChess, loosePieces, parseUci, FILES } from '../lib/chess-util.js';
import { Board } from '../ui/Board.js';
import { Icon, Spinner, PieceIcon, confetti, announce } from '../ui/kit.js';
import { checkAchievements } from '../lib/progress.js';
import { play } from '../lib/sound.js';
import { VISION, VISION_MODES } from '../lib/vision.js';
import { nextPlanStep } from '../lib/plan-info.js';
import { usePuzzles, useContent } from '../lib/content.js';

export { VISION, VISION_MODES };

const rnd = (n) => Math.floor(Math.random() * n);

/** Rätsel-Stellung, wie sie der Löser sieht (nach dem ersten Zug des Gegners). */
function puzzleFen(p) {
  const c = safeChess(p.fen);
  try {
    c.move(parseUci(p.moves[0]));
    return c.fen();
  } catch {
    return null;
  }
}

function nextHanging(db, used) {
  for (let t = 0; t < 500; t++) {
    const p = db.list[rnd(db.list.length)];
    if (used.has(p.id)) continue;
    const fen = puzzleFen(p);
    const c = fen && safeChess(fen);
    if (!c) continue;
    const targets = [...loosePieces(c, 'w'), ...loosePieces(c, 'b')].map((x) => x.square);
    if (targets.length >= 1 && targets.length <= 3) {
      used.add(p.id);
      return { fen, targets, orientation: 'w' };
    }
  }
  return null;
}

function nextChecks(db, used) {
  for (let t = 0; t < 500; t++) {
    const p = db.list[rnd(db.list.length)];
    if (used.has(p.id)) continue;
    const fen = puzzleFen(p);
    const c = fen && safeChess(fen);
    if (!c) continue;
    const checks = c.moves({ verbose: true }).filter((m) => /[+#]/.test(m.san));
    if (checks.some((m) => m.promotion)) continue; // Umwandlungen wären beim Ziehen mehrdeutig
    const targets = [...new Set(checks.map((m) => m.from + m.to))];
    if (targets.length >= 2 && targets.length <= 6) {
      used.add(p.id);
      return { fen, targets, orientation: c.turn() };
    }
  }
  return null;
}

const ALL_SQ = Array.from({ length: 64 }, (_, i) => FILES[i % 8] + (Math.floor(i / 8) + 1));
const EMPTY = '8/8/8/8/8/8/8/8 w - - 0 1';

export function VisionHub() {
  const s = useStore();
  const best = s.vision?.best || {};
  return html`<div class="page vision-hub">
    <div class="page-head">
      <div><h1>Sehtraining</h1><p class="muted">Kurze Runden für deinen Brettblick – ideal zum Aufwärmen vor Partien und Rätseln.</p></div>
    </div>
    <div class="vision-grid">
      ${VISION_MODES.map((k) => {
        const v = VISION[k];
        return html`<a class="vision-card" href=${`#/vision/${k}`}>
          <span class="vc-ico"><${PieceIcon} p=${v.icon} size=${40} /></span>
          <span class="vc-text"><b>${v.title}</b><small>${v.sub}</small></span>
          <span class="vc-meta"><span><${Icon} name="clock" size=${14} /> ${v.secs} s</span>${best[k] ? html`<span><${Icon} name="trophy" size=${14} /> ${best[k]}</span>` : null}</span>
        </a>`;
      })}
    </div>
    <section class="card vision-why">
      <h3>Warum das so viel bringt</h3>
      <p class="muted">Starke Spieler rechnen nicht schneller – sie <b>sehen</b> schneller. Hängende Figuren, Schachs und Felder erkennen sie, ohne nachzudenken. Genau das trainierst du hier: jeden Tag eine Runde, und du übersiehst in Partien spürbar weniger.</p>
    </section>
  </div>`;
}

export function VisionDrill({ mode }) {
  const v = VISION[mode];
  const db = usePuzzles();
  if (!v) return html`<div class="page"><h1>Unbekannte Übung</h1><a class="btn primary" href="#/vision">Zum Sehtraining</a></div>`;
  if (mode !== 'coords' && !db) return html`<${Spinner} label="Stellungen werden geladen …" />`;
  return html`<${Round} key=${mode} mode=${mode} db=${db} />`;
}

function Round({ mode, db }) {
  const s = useStore();
  const v = VISION[mode];
  const [phase, setPhase] = useState('ready'); // ready | run | over
  const [left, setLeft] = useState(v.secs * 1000);
  const [score, setScore] = useState(0);
  const [pos, setPos] = useState(null); // { fen, targets, orientation }
  const [found, setFound] = useState([]);
  const [flash, setFlash] = useState(null);
  const [penalty, setPenalty] = useState(null);
  const [target, setTarget] = useState(null); // Koordinaten
  const [orient, setOrient] = useState(() => {
    try {
      return localStorage.getItem('lk.coordsSide') || 'w';
    } catch {
      return 'w';
    }
  });
  const [bestBefore] = useState(() => s.vision?.best?.[mode] || 0);
  const deadline = useRef(0);
  const used = useRef(new Set());
  const scoreRef = useRef(0);
  const lock = useRef(false);

  const newPos = () => {
    const p = mode === 'hanging' ? nextHanging(db, used.current) : nextChecks(db, used.current);
    setFound([]);
    setPos(p);
  };
  const newTarget = (prev) => {
    let t;
    do t = ALL_SQ[rnd(64)];
    while (t === prev);
    setTarget(t);
  };

  const start = () => {
    used.current = new Set();
    scoreRef.current = 0;
    setScore(0);
    setFlash(null);
    deadline.current = Date.now() + v.secs * 1000;
    setLeft(v.secs * 1000);
    if (mode === 'coords') newTarget(null);
    else newPos();
    setPhase('run');
    play('select');
  };

  const finish = () => {
    setPhase('over');
    const sc = scoreRef.current;
    const record = sc > bestBefore && sc > 0;
    let fresh = [];
    update((st) => {
      st.vision ||= { best: {}, rounds: 0 };
      st.vision.best ||= {};
      st.vision.rounds = (st.vision.rounds || 0) + 1;
      if (sc > (st.vision.best[mode] || 0)) st.vision.best[mode] = sc;
      const d = today(st);
      d.vision = (d.vision || 0) + 1;
      fresh = checkAchievements(st);
    });
    announce(fresh);
    play(record ? 'win' : 'good');
    if (record && sc >= 5) confetti(80);
  };

  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => {
      const l = deadline.current - Date.now();
      setLeft(Math.max(0, l));
      if (l <= 0) {
        clearInterval(t);
        finish();
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase]);

  const addScore = (n = 1) => {
    scoreRef.current += n;
    setScore(scoreRef.current);
  };
  const punish = (ms) => {
    deadline.current -= ms;
    setPenalty({ text: `−${ms / 1000} s`, key: Date.now() });
  };

  // --- Was hängt? ---
  const tapHanging = (sq) => {
    if (phase !== 'run' || !pos || lock.current) return;
    if (found.includes(sq)) return;
    const piece = safeChess(pos.fen)?.get(sq);
    if (!piece) return;
    if (pos.targets.includes(sq)) {
      const next = [...found, sq];
      setFound(next);
      setFlash({ sq, kind: 'good', key: Date.now() });
      play('good');
      if (next.length >= pos.targets.length) {
        addScore(1);
        lock.current = true;
        setTimeout(() => {
          lock.current = false;
          if (deadline.current > Date.now()) newPos();
        }, 450);
      }
    } else {
      setFlash({ sq, kind: 'bad', key: Date.now() });
      play('bad');
      punish(3000);
    }
  };

  // --- Alle Schachgebote ---
  const moveChecks = ({ from, to }) => {
    if (phase !== 'run' || !pos || lock.current) return;
    const key = from + to;
    if (found.includes(key)) {
      setFlash({ sq: to, kind: 'good', key: Date.now() });
      return;
    }
    if (pos.targets.includes(key)) {
      const next = [...found, key];
      setFound(next);
      addScore(1);
      setFlash({ sq: to, kind: 'good', key: Date.now() });
      play('check');
      if (next.length >= pos.targets.length) {
        lock.current = true;
        play('good');
        setTimeout(() => {
          lock.current = false;
          if (deadline.current > Date.now()) newPos();
        }, 650);
      }
    } else {
      setFlash({ sq: to, kind: 'bad', key: Date.now() });
      play('bad');
      punish(2000);
    }
  };

  // --- Koordinaten ---
  const tapCoord = (sq) => {
    if (phase !== 'run' || !target) return;
    if (sq === target) {
      addScore(1);
      setFlash({ sq, kind: 'good', key: Date.now() });
      play('move');
      newTarget(target);
    } else {
      setFlash({ sq, kind: 'bad', key: Date.now() });
      play('bad');
    }
  };
  const setSide = (o) => {
    setOrient(o);
    try {
      localStorage.setItem('lk.coordsSide', o);
    } catch {}
  };

  const content = useContent();
  const nextStep = phase === 'over' ? nextPlanStep(content, s, `#/vision/${mode}`) : null;
  const pct = Math.max(0, Math.min(1, left / (v.secs * 1000)));
  const secs = Math.ceil(left / 1000);
  const boardSide = mode === 'coords' ? (orient === 'b' ? 'b' : 'w') : pos?.orientation || 'w';

  let board;
  if (mode === 'coords') {
    board = html`<${Board} fen=${EMPTY} orientation=${boardSide} onTap=${tapCoord} hideCoords flash=${flash} />`;
  } else if (pos) {
    const marks = {};
    if (mode === 'hanging') for (const sq of found) marks[sq] = 'g';
    const arrows = mode === 'checks' ? found.map((k) => [k.slice(0, 2), k.slice(2, 4), 'g']) : [];
    board =
      mode === 'hanging'
        ? html`<${Board} key=${pos.fen} fen=${pos.fen} orientation=${pos.orientation} onTap=${tapHanging} marks=${marks} flash=${flash} />`
        : html`<${Board} key=${pos.fen} fen=${pos.fen} orientation=${pos.orientation} movable=${phase === 'run' ? pos.orientation : null} onMove=${moveChecks} snapBack noPromotion arrows=${arrows} flash=${flash} />`;
  } else {
    board = html`<${Board} fen=${EMPTY} />`;
  }

  const turnName = pos ? (pos.fen.split(' ')[1] === 'w' ? 'Weiß' : 'Schwarz') : '';
  const prompt =
    mode === 'coords'
      ? html`<div class="vr-target" key=${target}>${target || '…'}</div>`
      : mode === 'hanging'
      ? html`<p class="vr-task">Finde <b>${pos ? pos.targets.length - found.length : '–'}</b> ${pos && pos.targets.length - found.length === 1 ? 'Figur' : 'Figuren'} in Gefahr</p>`
      : html`<p class="vr-task"><b>${turnName}</b> am Zug · Schachs gefunden: <b>${found.length}/${pos ? pos.targets.length : '–'}</b></p>`;

  return html`<div class="page vision-run">
    <header class="vr-head">
      <a href="#/vision" class="icon-btn" aria-label="Zurück zum Sehtraining"><${Icon} name="back" /></a>
      <div class="vr-title"><small>Sehtraining</small><b>${v.title}</b></div>
      <div class="vr-score"><small>Punkte</small><b>${score}</b></div>
    </header>
    <div class=${`vr-timer ${secs <= 5 && phase === 'run' ? 'low' : ''}`}><i style=${{ transform: `scaleX(${phase === 'ready' ? 1 : pct})` }}></i><span>${phase === 'ready' ? `${v.secs} s` : `${secs} s`}</span>
      ${penalty && html`<em key=${penalty.key} class="vr-penalty">${penalty.text}</em>`}</div>
    <div class="vr-body">
      <div class="vr-board">${board}
        ${phase !== 'run' &&
        html`<div class="vr-overlay">
          ${phase === 'ready'
            ? html`<div class="vr-card">
                <b>${v.title}</b>
                <p>${v.how}</p>
                ${mode === 'coords' &&
                html`<div class="seg" role="group" aria-label="Brett-Seite">
                  ${[['w', 'Weiß unten'], ['b', 'Schwarz unten']].map(([k, l]) => html`<button class=${orient === k ? 'on' : ''} onClick=${() => setSide(k)}>${l}</button>`)}
                </div>`}
                <button class="btn primary lg" onClick=${start}><${Icon} name="play" /> Los geht's</button>
                ${bestBefore ? html`<small class="muted">Dein Rekord: ${bestBefore} ${v.unit}</small>` : null}
              </div>`
            : html`<div class="vr-card">
                <small class="muted">Zeit um!</small>
                <b class="vr-big">${score}</b>
                <p>${score > bestBefore && score > 0 ? 'Neuer Rekord! 🏆' : bestBefore ? `Dein Rekord: ${bestBefore}` : v.unit}</p>
                ${nextStep && html`<a class="btn primary" href=${nextStep.href}>Weiter im Plan: ${nextStep.title} <${Icon} name="next" /></a>`}
                <div class="btn-row center">
                  <button class=${`btn ${nextStep ? 'ghost' : 'primary'}`} onClick=${start}><${Icon} name="repeat" /> Nochmal</button>
                  <a class="btn ghost" href="#/vision">Andere Übung</a>
                </div>
              </div>`}
        </div>`}
      </div>
      <aside class="vr-side">
        ${phase === 'run' ? prompt : html`<p class="muted vr-why">${v.why}</p>`}
        ${phase === 'run' && mode === 'hanging' && pos
          ? html`<button class="btn ghost sm" onClick=${() => {
              punish(5000);
              newPos();
            }}>Überspringen (−5 s)</button>`
          : null}
        ${phase === 'run' && mode === 'checks' && pos
          ? html`<button class="btn ghost sm" onClick=${() => {
              punish(4000);
              newPos();
            }}>Nächste Stellung (−4 s)</button>`
          : null}
      </aside>
    </div>
  </div>`;
}
