// „Deine Fehler“: Stellungen aus eigenen Partien, in denen du daneben gegriffen hast.
// Die Engine prüft deine Antwort – alles, was fast so gut ist wie der beste Zug, zählt.
import { html, useEffect, useMemo, useState } from '../../vendor/preact-htm.js';
import { update, useStore } from '../lib/store.js';
import { engine, warmup } from '../lib/engine.js';
import { dueMistakes, gradeMistake, openMistakes } from '../lib/mistakes.js';
import { parseUci, safeChess, sanDe, scoreCp, toUci, colorName } from '../lib/chess-util.js';
import { Board } from '../ui/Board.js';
import { Icon, ThinkingDots, confetti } from '../ui/kit.js';
import { play, playMove } from '../lib/sound.js';
import { addXp } from '../lib/store.js';

const CLS = { mistake: 'Fehler', blunder: 'Patzer' };
const ago = (t) => {
  if (!t) return '';
  const d = Math.floor((Date.now() - t) / 864e5);
  return d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`;
};

export function MyMistakes() {
  const s = useStore();
  const [queue] = useState(() => dueMistakes(s).map((m) => m.id));
  const [idx, setIdx] = useState(0);
  const [session, setSession] = useState({ ok: 0, total: 0 });
  useEffect(warmup, []);
  const open = openMistakes(s);
  const id = queue[idx];
  const item = id && (s.mistakes || []).find((m) => m.id === id);

  if (!open.length)
    return html`<div class="page center-page">
      <div class="center-card">
        <div class="done-burst">♟</div>
        <h1>Noch keine Fehler gesammelt</h1>
        <p class="muted">Spiel eine Probepartie mit Coach. Jeder Fehler und Patzer landet automatisch hier – und du übst genau die Stellungen, die dich Punkte gekostet haben.</p>
        <div class="btn-row center"><a class="btn primary lg" href="#/play"><${Icon} name="play" /> Partie spielen</a></div>
      </div>
    </div>`;

  if (!item)
    return html`<div class="page center-page">
      <div class="center-card">
        <div class="done-burst">★ ★ ★</div>
        <h1>${session.total ? 'Runde geschafft!' : 'Gerade nichts fällig'}</h1>
        <p class="muted">${session.total ? `${session.ok} von ${session.total} richtig. ` : ''}${open.length} Stellung${open.length === 1 ? '' : 'en'} in deiner Sammlung – sie kommen wieder, wenn sie fällig sind.</p>
        <div class="btn-row center">
          <a class="btn primary" href="#/play"><${Icon} name="play" /> Neue Partie</a>
          <a class="btn ghost" href="#/puzzles/train"><${Icon} name="puzzle" /> Rätsel-Training</a>
        </div>
      </div>
    </div>`;

  return html`<${MistakeTask}
    key=${item.id}
    item=${item}
    pos=${idx + 1}
    count=${queue.length}
    session=${session}
    onGraded=${(ok) => setSession((x) => ({ ok: x.ok + (ok ? 1 : 0), total: x.total + 1 }))}
    onNext=${() => setIdx(idx + 1)}
  />`;
}

function MistakeTask({ item, pos, count, session, onGraded, onNext }) {
  const side = item.fen.split(' ')[1];
  const [fen, setFen] = useState(item.fen);
  const [last, setLast] = useState(null);
  const [lines, setLines] = useState(null);
  const [state, setState] = useState('play'); // play | checking | right | wrong | shown
  const [flash, setFlash] = useState(null);
  const [arrows, setArrows] = useState([]);
  const [graded, setGraded] = useState(false);

  useEffect(() => {
    let alive = true;
    engine.analyze(item.fen, { depth: 14, movetime: 1200, multipv: 3 }).then((r) => {
      if (alive && r) setLines(r.lines.filter((l) => l.pv?.[0]));
    });
    return () => {
      alive = false;
    };
  }, []);

  const good = useMemo(() => {
    const set = new Set([item.best]);
    if (lines?.length) {
      const top = scoreCp(lines[0].score);
      for (const l of lines) if (top - scoreCp(l.score) <= 60) set.add(l.pv[0]);
    }
    return set;
  }, [lines]);

  const grade = (ok) => {
    if (graded) return;
    setGraded(true);
    update((st) => {
      gradeMistake(st, item.id, ok);
      if (ok) addXp(st, 6);
    });
    onGraded(ok);
  };

  const bestSan = (() => {
    const c = safeChess(item.fen);
    try {
      return sanDe(c.move(parseUci(item.best)).san);
    } catch {
      return item.best;
    }
  })();

  const onMove = ({ from, to, promotion }) => {
    if (state !== 'play') return;
    const c = safeChess(item.fen);
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    playMove(m, c);
    setFen(c.fen());
    setLast([m.from, m.to]);
    const uci = toUci(m);
    if (good.has(uci)) {
      setState('right');
      setFlash({ sq: m.to, kind: 'good', key: Date.now() });
      play('good');
      grade(true);
      if (session.ok + 1 >= 5 && (session.ok + 1) % 5 === 0) confetti(60);
    } else {
      setState('wrong');
      setFlash({ sq: m.to, kind: 'bad', key: Date.now() });
      play('bad');
      grade(false);
      setTimeout(() => {
        setFen(item.fen);
        setLast(null);
        setState('play');
      }, 900);
    }
  };

  const reveal = () => {
    grade(false);
    setState('shown');
    setArrows([[item.best.slice(0, 2), item.best.slice(2, 4), 'g']]);
  };

  const playedSan = item.san ? sanDe(item.san) : item.played;
  return html`<div class="page trainer">
    <div class="trainer-grid">
      <div class="trainer-board">
        <${Board} fen=${fen} orientation=${side} movable=${state === 'play' ? side : null} onMove=${onMove} lastMove=${last} arrows=${arrows} flash=${flash} />
      </div>
      <aside class="trainer-side card">
        <small class="tag">Deine Fehler · ${pos}/${count}</small>
        <h2 class="turn-title"><span class=${`turn-dot ${side}`}></span>${colorName(side)} am Zug</h2>
        <p class="muted">Gegen <b>${item.bot}</b> (${item.elo})${item.date ? ' ' + ago(item.date) : ''}: Hier hast du <b>${playedSan}</b> gespielt – ein ${CLS[item.cls] || 'Fehler'}. Findest du jetzt den besseren Zug?</p>
        ${state === 'play' && !lines && html`<p class="small thinking"><${ThinkingDots} /> Engine schaut mit …</p>`}
        ${state === 'wrong' && html`<p class="feedback bad"><${Icon} name="x" size=${18} /> Noch nicht – versuch's nochmal.</p>`}
        ${state === 'right' &&
        html`<div class="result-box good"><b>Richtig!</b><span>+6 XP</span></div>
          <p class="muted small">Die Stellung kommt in ein paar Tagen wieder – bis sie sitzt.</p>`}
        ${state === 'shown' && html`<div class="result-box bad"><b>Bester Zug: ${bestSan}</b></div><p class="muted small">Sie kommt bald noch einmal dran.</p>`}
        <div class="btn-row">
          ${state === 'right' || state === 'shown'
            ? html`<button class="btn primary" onClick=${onNext}>Weiter <${Icon} name="next" /></button>`
            : html`<button class="btn ghost" onClick=${reveal}><${Icon} name="eye" /> Lösung zeigen</button>`}
          <a class="btn ghost" href=${`#/analysis?fen=${encodeURIComponent(item.fen)}`}><${Icon} name="scope" /> Analysieren</a>
        </div>
        <div class="mini-stats">
          <div><small>Runde</small><b>${session.ok}/${session.total}</b></div>
          <div><small>Kasten</small><b>${(item.box || 0) + 1}/5</b></div>
          <div><small>Versuche</small><b>${item.tries || 0}</b></div>
        </div>
      </aside>
    </div>
  </div>`;
}
