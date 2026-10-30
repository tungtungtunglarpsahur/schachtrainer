// Rätsel: Hub, Training (mit Rating), Themen, Wiederholung, Rush und Einstufungstest.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, useStore } from '../lib/store.js';
import { usePuzzles, pickPuzzle, THEME_GROUPS, themeName, SKILL_THEMES } from '../lib/content.js';
import { recordPuzzle, duePuzzles, checkAchievements, themeStats } from '../lib/progress.js';
import { SequenceTask } from '../ui/Tasks.js';
import { Icon, Spinner, announce, confetti, Bar } from '../ui/kit.js';
import { GameTile } from './Home.js';
import { play } from '../lib/sound.js';
import { colorName } from '../lib/chess-util.js';
import { MyMistakes } from './Mistakes.js';
import { dueMistakes, openMistakes } from '../lib/mistakes.js';

export function PuzzleHub() {
  const s = useStore();
  const due = duePuzzles(s).length;
  const weak = themeStats(s).slice(0, 4);
  const mineDue = dueMistakes(s).length;
  const mineOpen = openMistakes(s).length;
  return html`<div class="page">
    <div class="page-head">
      <div><h1>Rätsel</h1><p class="muted">Rating <b>${s.puzzle.rating}</b> · ${s.puzzle.solved} gelöst · Rush-Rekord ${s.puzzle.rushBest}</p></div>
      <a class="btn primary" href="#/puzzles/train"><${Icon} name="play" /> Training starten</a>
    </div>
    <div class="tiles">
      <${GameTile} href="#/puzzles/train" title="Training" sub="Endlos, passt sich deinem Rating an" art="tactic" badge="HOT" icon="wN" />
      <${GameTile} href="#/puzzles/rush" title="Rätsel-Rush" sub="3 Minuten, 3 Leben, immer schwerer" art="rush" badge="LIVE" icon="wQ" />
      <${GameTile} href="#/puzzles/mine" title="Deine Partie-Fehler" sub=${mineOpen ? `${mineDue} fällig · ${mineOpen} gesammelt` : 'Aus deinen Partien – automatisch'} art="play" badge=${mineDue ? String(mineDue) : 'NEU'} icon="bK" />
      <${GameTile} href="#/puzzles/review" title="Rätsel wiederholen" sub=${due ? `${due} fällig – Spaced Repetition` : 'Gerade nichts fällig'} art="defense" badge=${due ? String(due) : null} icon="wR" />
    </div>
    ${weak.length > 0 &&
    html`<section class="card">
      <div class="section-head"><h3>Deine Baustellen</h3><span class="muted">aus deinen Ergebnissen</span></div>
      <div class="weak-list">
        ${weak.map((w) => html`<a class="weak" href=${`#/puzzles/train?themes=${w.theme}`}><span>${themeName(w.theme)}</span><${Bar} value=${w.rate} color=${w.rate < 0.5 ? 'var(--danger)' : 'var(--gold)'} /><small>${Math.round(w.rate * 100)} %</small></a>`)}
      </div>
    </section>`}
    <section>
      <div class="section-head"><h2>Nach Thema</h2></div>
      <div class="tiles small">
        ${THEME_GROUPS.map((g) => html`<a href=${`#/puzzles/theme-${g.id}`} class=${`tile small art-${g.art}`}><span class="tile-text"><b>${g.name}</b><small>${g.desc}</small></span></a>`)}
      </div>
    </section>
  </div>`;
}

export function PuzzleTrainer({ mode, query }) {
  if (mode === 'mine') return html`<${MyMistakes} />`;
  return html`<${PuzzleDb} mode=${mode} query=${query} />`;
}

function PuzzleDb({ mode, query }) {
  const db = usePuzzles();
  if (!db) return html`<${Spinner} label="Rätsel werden geladen …" />`;
  if (!db.list.length) return html`<div class="page"><h1>Keine Rätsel gefunden</h1></div>`;
  if (mode === 'rush') return html`<${Rush} db=${db} />`;
  if (mode === 'placement') return html`<${Placement} db=${db} />`;
  return html`<${Training} db=${db} mode=${mode} query=${query} />`;
}

const OUTCOME = {
  clean: { label: 'Richtig!', tone: 'good', text: 'Gelöst!' },
  hint: { label: 'Mit Tipp gelöst', tone: 'mid', text: 'Gelöst – mit Tipp bleibt dein Rating gleich.' },
  retry: { label: 'Gelöst – im 2. Anlauf', tone: 'mid', text: 'Geschafft! Weil der erste Zug nicht saß, zählt nur der halbe Verlust. Das Rätsel kommt bald zur Wiederholung.' },
  fail: { label: 'Verfehlt', tone: 'bad', text: 'Lösung gezeigt – kommt in die Wiederholung.' },
};
// In der Wiederholung gibt es kein Rating – dort ohne Punkte-Hinweise.
const REVIEW_TEXT = { clean: 'Gelöst!', hint: 'Mit Tipp gelöst – kommt bald nochmal.', retry: 'Geschafft – im 2. Anlauf. Kommt bald nochmal.', fail: 'Lösung gezeigt – kommt bald nochmal.' };

function Training({ db, mode, query }) {
  const s = useStore();
  const review = mode === 'review';
  const group = mode.startsWith('theme-') ? THEME_GROUPS.find((g) => g.id === mode.slice(6)) : null;
  const themes = group ? group.themes : query.get('themes') ? query.get('themes').split(',') : null;
  const choose = () => {
    if (review) {
      const id = duePuzzles(s)[0];
      return id ? db.byId[id] : null;
    }
    return pickPuzzle(db, { rating: s.puzzle.rating, themes, seen: s.puzzle.seen });
  };
  const [puzzle, setPuzzle] = useState(choose);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false); // falscher Zug gemacht
  const [hinted, setHinted] = useState(false); // Tipp benutzt
  const [session, setSession] = useState({ ok: 0, total: 0, streak: 0 });

  // outcome: 'clean' (sofort gelöst), 'hint' (mit Tipp), 'retry' (nach Fehlversuch), 'fail' (Lösung gezeigt)
  const settle = (outcome) => {
    if (result) return;
    let r;
    let fresh = [];
    update((st) => {
      r = recordPuzzle(st, puzzle, outcome, { rated: !review, review });
      fresh = checkAchievements(st);
    });
    announce(fresh);
    setResult(r);
    const solved = outcome !== 'fail';
    setSession((x) => ({ ok: x.ok + (solved ? 1 : 0), total: x.total + 1, streak: outcome === 'clean' ? x.streak + 1 : outcome === 'hint' ? x.streak : 0 }));
    if (outcome === 'clean' && session.streak + 1 >= 5 && (session.streak + 1) % 5 === 0) confetti(60);
  };

  const next = () => {
    setResult(null);
    setFailed(false);
    setHinted(false);
    setPuzzle(choose());
  };

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Enter' && result) next();
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  // Flüssig trainieren: nach einer richtigen Lösung geht es von allein weiter.
  const auto = s.settings.autoNext !== false;
  useEffect(() => {
    if (!result || result.outcome === 'fail' || !auto) return;
    const t = setTimeout(next, 1600);
    return () => clearTimeout(t);
  }, [result, auto]);

  if (!puzzle)
    return html`<div class="page center-page"><h1>Alles wiederholt! 🎉</h1><p class="muted">Gerade sind keine Fehler fällig. Neue Fehler landen automatisch hier.</p><a class="btn primary" href="#/puzzles/train">Weiter trainieren</a></div>`;

  const side = puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w';
  const title = review ? 'Wiederholung' : group ? group.name : themes ? themes.map(themeName).join(', ') : 'Rätsel-Training';
  return html`<div class="page trainer">
    <div class="trainer-grid">
      <div class="trainer-board">
        <${SequenceTask} key=${puzzle.id} fen=${puzzle.fen} moves=${puzzle.moves} setup
          onMistake=${(why) => (why === 'hint' ? setHinted(true) : setFailed(true))}
          onDone=${(ok) => settle(!ok ? 'fail' : failed ? 'retry' : hinted ? 'hint' : 'clean')} solveLabel="Lösung" />
      </div>
      <aside class="trainer-side card">
        <small class="tag">${title}</small>
        <h2 class="turn-title"><span class=${`turn-dot ${side}`}></span>${colorName(side)} am Zug</h2>
        <p class="muted">${result
          ? review ? REVIEW_TEXT[result.outcome] : OUTCOME[result.outcome].text
          : failed ? (review ? 'Nicht ganz – versuch\'s nochmal.' : 'Nicht ganz – versuch\'s nochmal. Findest du es jetzt, verlierst du nur halb so viele Punkte.')
          : hinted ? (review ? 'Tipp genutzt – lös es zu Ende.' : 'Mit Tipp bleibt dein Rating gleich – lös es zu Ende.')
          : 'Finde den besten Zug.'}</p>
        ${result &&
        html`<div class=${`result-box ${OUTCOME[result.outcome].tone}`}>
          <b>${OUTCOME[result.outcome].label}</b>
          ${!review && html`<span class="delta">${result.delta > 0 ? '+' : result.delta === 0 ? '±' : ''}${result.delta}</span>`}
          <span>+${result.xp} XP</span>
        </div>
        <div class="theme-chips">${puzzle.themes.filter((t) => SKILL_THEMES.includes(t) || t.startsWith('mateIn')).map((t) => html`<span class="tchip">${themeName(t)}</span>`)}<span class="tchip dim">Rätsel ${puzzle.rating}</span></div>
        ${result.outcome !== 'fail' && auto && html`<div class="auto-next"><span></span></div>`}
        <div class="btn-row">
          <button class="btn primary" onClick=${next}>Nächstes <${Icon} name="next" /></button>
          <a class="btn ghost" href=${`#/analysis?fen=${encodeURIComponent(puzzle.fen)}&moves=${puzzle.moves.join(',')}`}><${Icon} name="scope" /> Analysieren</a>
        </div>`}
        ${!result && failed && html`<button class="btn ghost" onClick=${() => settle('fail')}>Aufgeben & weiter</button>`}
        <label class="toggle-row auto-toggle">
          <span><b>Automatisch weiter</b><small>Nach richtiger Lösung direkt das nächste Rätsel</small></span>
          <span class="switch"><input type="checkbox" checked=${auto} onChange=${(e) => update((st) => { st.settings.autoNext = e.target.checked; })} /><span></span></span>
        </label>
        <div class="mini-stats">
          <div><small>Rating</small><b>${s.puzzle.rating}</b></div>
          <div><small>Heute</small><b>${session.ok}/${session.total}</b></div>
          <div><small>Serie</small><b>${session.streak}${session.streak >= 3 ? ' 🔥' : ''}</b></div>
        </div>
      </aside>
    </div>
  </div>`;
}

// ---------- Rush ----------

function Rush({ db }) {
  const s = useStore();
  const [phase, setPhase] = useState('ready');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [time, setTime] = useState(180);
  const [puzzle, setPuzzle] = useState(null);
  const used = useRef(new Set());
  const scoreRef = useRef(0);
  const settled = useRef(null);

  const draw = (n) => {
    const p = pickPuzzle(db, { rating: 600 + n * 55, exclude: used.current, spread: 80 });
    used.current.add(p.id);
    setPuzzle(p);
  };

  const start = () => {
    used.current = new Set();
    scoreRef.current = 0;
    setScore(0);
    setLives(3);
    setTime(180);
    setPhase('run');
    draw(0);
  };

  const end = () => {
    setPhase('over');
    const sc = scoreRef.current;
    let fresh = [];
    update((st) => {
      st.puzzle.rushHistory.push([Date.now(), sc]);
      if (sc > st.puzzle.rushBest) st.puzzle.rushBest = sc;
      fresh = checkAchievements(st);
    });
    announce(fresh);
    if (sc >= 10) confetti();
  };

  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => {
      setTime((x) => {
        if (x <= 1) {
          clearInterval(t);
          end();
          return 0;
        }
        if (x <= 11) play('tick');
        return x - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  if (phase === 'ready' || phase === 'over')
    return html`<div class="page center-page rush-intro">
      <div class="rush-logo"><${Icon} name="bolt" size=${56} /></div>
      <h1>${phase === 'over' ? `${score} Punkte!` : 'Rätsel-Rush'}</h1>
      <p class="muted">${phase === 'over' ? (score >= s.puzzle.rushBest && score > 0 ? 'Neuer Rekord! 🏆' : `Dein Rekord: ${s.puzzle.rushBest}`) : '3 Minuten. 3 Leben. Jedes Rätsel wird schwerer. Kein Tipp, kein Zurück.'}</p>
      <button class="btn primary xl" onClick=${start}><${Icon} name="play" /> ${phase === 'over' ? 'Nochmal' : 'Start'}</button>
      <a href="#/puzzles" class="link">Zurück zu den Rätseln</a>
    </div>`;

  const onDone = (ok) => {
    if (settled.current === puzzle.id) return;
    settled.current = puzzle.id;
    if (ok) {
      scoreRef.current++;
      setScore(scoreRef.current);
      setTimeout(() => draw(scoreRef.current), 250);
    }
  };
  const onMistake = () => {
    if (settled.current === puzzle.id) return;
    settled.current = puzzle.id;
    setLives((l) => {
      const n = l - 1;
      if (n <= 0) setTimeout(end, 300);
      else setTimeout(() => draw(scoreRef.current), 500);
      return n;
    });
  };

  return html`<div class="page trainer rush">
    <div class="rush-bar">
      <span class=${`rush-time ${time <= 10 ? 'low' : ''}`}><${Icon} name="clock" /> ${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}</span>
      <span class="rush-score">${score}</span>
      <span class="rush-lives">${[0, 1, 2].map((i) => html`<span class=${i < lives ? 'on' : ''}>♥</span>`)}</span>
    </div>
    <div class="trainer-board narrow">
      ${puzzle && html`<${SequenceTask} key=${puzzle.id} fen=${puzzle.fen} moves=${puzzle.moves} setup showControls=${false} onDone=${onDone} onMistake=${onMistake} />`}
    </div>
  </div>`;
}

// ---------- Einstufungstest ----------

function Placement({ db }) {
  const s = useStore();
  const [n, setN] = useState(0);
  const [rating, setRating] = useState(s.puzzle.rating);
  const [puzzle, setPuzzle] = useState(() => pickPuzzle(db, { rating: s.puzzle.rating, spread: 60 }));
  const [history, setHistory] = useState([]);
  const TOTAL = 8;
  const settled = useRef(null);

  const answer = (ok) => {
    if (settled.current === puzzle.id) return;
    settled.current = puzzle.id;
    const step = n < 3 ? 300 : n < 6 ? 160 : 90;
    const r = Math.max(400, Math.min(2800, rating + (ok ? step : -step)));
    const h = [...history, ok];
    setHistory(h);
    setRating(r);
    if (n + 1 >= TOTAL) {
      update((st) => {
        st.puzzle.rating = r;
        st.puzzle.history.push([Date.now(), r]);
        if (!st.profile.elo) st.play.rating = Math.max(400, Math.round(r * 0.85));
        st.plan = null;
      });
      setN(TOTAL);
      play('win');
      return;
    }
    setN(n + 1);
    setTimeout(() => setPuzzle(pickPuzzle(db, { rating: r, spread: 60 })), 600);
  };

  if (n >= TOTAL)
    return html`<div class="page center-page">
      <h1>Dein Startwert: ${rating}</h1>
      <p class="muted">${history.filter(Boolean).length} von ${TOTAL} gelöst. Rätsel und Bots passen sich ab jetzt daran an.</p>
      <a class="btn primary xl" href="#/">Zum Tagesplan <${Icon} name="next" /></a>
    </div>`;

  return html`<div class="page trainer placement">
    <header class="lesson-top">
      <a href="#/" class="icon-btn" aria-label="Test abbrechen"><${Icon} name="x" /></a>
      <div class="lesson-progress"><div style=${{ width: `${(n / TOTAL) * 100}%` }}></div></div>
      <span class="lesson-count">${n + 1}/${TOTAL}</span>
    </header>
    <p class="center muted">Einstufungstest – finde den besten Zug. Kein Stress: Fehler sind hier Informationen.</p>
    <div class="trainer-board narrow">
      <${SequenceTask} key=${puzzle.id} fen=${puzzle.fen} moves=${puzzle.moves} setup showControls=${false}
        onDone=${(ok) => answer(ok)} onMistake=${() => answer(false)} />
    </div>
  </div>`;
}
