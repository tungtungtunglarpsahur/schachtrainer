// Tutorial nach der Umfrage: sieben kurze Bildschirme, zwei davon zum Mitmachen am Brett.
// Am Ende geht es direkt ins Testspiel (#/play?test=1) – oder erst mal zur Startseite.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, useStore } from '../lib/store.js';
import { START_FEN, safeChess } from '../lib/chess-util.js';
import { Board } from '../ui/Board.js';
import { Icon, Logo, PieceIcon, Ring, ThinkingDots, confetti } from '../ui/kit.js';
import { play, playMove } from '../lib/sound.js';

const STEPS = ['how', 'move', 'puzzle', 'bots', 'marks', 'nav', 'progress', 'test'];

// Schritt „Figur ziehen“: nur Könige und ein Bauer – der Bauer soll von e2 nach e4.
const MOVE_FEN = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
// Schritt „Rätsel“: Grundreihenmatt mit Ta8#.
const PUZZLE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

const finish = (hash) => {
  // Hatte jemand in der Umfrage den Rätsel-Einstufungstest gewählt, führt „Später“ dorthin.
  location.hash = hash === '#/' && /placement/.test(location.hash) ? '#/puzzles/placement' : hash;
  update((s) => {
    s.profile.tutorialDone = true;
  });
};

/** Mitmach-Brett: genau ein richtiger Zug, alles andere wird freundlich zurückgesetzt. */
function Practice({ fen, target, marks, arrows, hintArrows, wrongText, onSolved, solved, solvedText, tip = null, checkMate = false }) {
  const [pos, setPos] = useState(fen);
  const [last, setLast] = useState(null);
  const [flash, setFlash] = useState(null);
  const [msg, setMsg] = useState(null);
  const [wrong, setWrong] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onMove = ({ from, to, promotion }) => {
    if (solved) return;
    const c = safeChess(pos);
    let m;
    try {
      m = c.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return;
    }
    playMove(m, c);
    setPos(c.fen());
    setLast([m.from, m.to]);
    const ok = m.from + m.to === target && (!checkMate || c.isCheckmate());
    if (ok) {
      setFlash({ sq: m.to, kind: 'good', key: Date.now() });
      setMsg(null);
      play(checkMate ? 'win' : 'good');
      if (checkMate) confetti(70);
      onSolved();
      return;
    }
    setFlash({ sq: m.to, kind: 'bad', key: Date.now() });
    setWrong((n) => n + 1);
    setMsg(typeof wrongText === 'function' ? wrongText(m) : wrongText);
    play('bad');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPos(fen);
      setLast(null);
    }, 900);
  };

  const showHint = wrong >= 2 && !solved;
  return html`<div class="tu-practice">
    <div class=${`tu-board ${solved ? 'is-solved' : ''}`}>
      <${Board}
        fen=${pos}
        orientation="w"
        movable=${solved ? null : 'w'}
        onMove=${onMove}
        lastMove=${last}
        marks=${solved ? {} : marks || {}}
        arrows=${solved ? [] : [...(arrows || []), ...(showHint ? hintArrows || [] : [])]}
        flash=${flash}
      />
    </div>
    <div class="tu-feedback" aria-live="polite">
      ${solved
        ? html`<p class="tu-ok"><span class="tu-ok-ico"><${Icon} name="check" size=${18} /></span>${solvedText}</p>`
        : msg
          ? html`<p class="tu-hint" key=${wrong}>${msg}${showHint && hintArrows ? ' Der Pfeil zeigt dir den Weg.' : ''}</p>`
          : tip
            ? html`<p class="tu-tip"><${Icon} name="bulb" size=${18} /> <span>${tip}</span></p>`
            : null}
    </div>
  </div>`;
}

export function Tutorial() {
  const s = useStore();
  const [view, setView] = useState({ step: 0, dir: 'fwd', phase: 'in' });
  const [solved, setSolved] = useState({ move: false, puzzle: false });
  const stepRef = useRef(0);
  const busy = useRef(false);
  const solvedRef = useRef(solved);
  solvedRef.current = solved;
  const touch = useRef(null);

  const still = s.settings?.animation === false || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 901px)').matches;
  const id = STEPS[view.step];
  const canNext = (step) => {
    const k = STEPS[step];
    return k === 'move' ? solvedRef.current.move : k === 'puzzle' ? solvedRef.current.puzzle : true;
  };

  const go = (to) => {
    if (busy.current) return;
    const from = stepRef.current;
    if (to < 0 || to >= STEPS.length || to === from) return;
    const dir = to > from ? 'fwd' : 'back';
    stepRef.current = to;
    const enter = () => {
      setView({ step: to, dir, phase: 'in' });
      window.scrollTo(0, 0);
    };
    if (still) {
      enter();
      return;
    }
    busy.current = true;
    setView((v) => ({ ...v, dir, phase: 'out' }));
    setTimeout(() => {
      enter();
      busy.current = false;
    }, 170);
  };
  const next = () => {
    const step = stepRef.current;
    if (step < STEPS.length - 1 && canNext(step)) go(step + 1);
  };
  const back = () => go(stepRef.current - 1);
  const skip = (k) => {
    setSolved((x) => ({ ...x, [k]: true }));
    solvedRef.current = { ...solvedRef.current, [k]: true };
    go(stepRef.current + 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement))) {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // Wischen links/rechts – aber nicht auf dem Brett, dort werden Figuren gezogen.
  const onTouchStart = (e) => {
    if (e.target.closest?.('.board')) {
      touch.current = null;
      return;
    }
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e) => {
    const st = touch.current;
    touch.current = null;
    if (!st) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;
    if (Date.now() - st.t > 700 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) next();
    else back();
  };

  const name = (s.profile.name || '').trim();
  const head = (eyebrow, title, sub) => html`<header class="tu-head">
    <p class="tu-eyebrow">${eyebrow}</p>
    <h1 class="tu-title">${title}</h1>
    ${sub ? html`<p class="tu-sub">${sub}</p>` : null}
  </header>`;

  const screens = {
    how: () => html`
      <div class="tu-logo"><${Logo} /></div>
      ${head(name ? `Willkommen, ${name}` : 'Willkommen', 'So funktioniert Learning King', 'Drei Dinge – mehr brauchst du nicht.')}
      <ul class="tu-rows">
        ${[
          ['wP', 'Lernen', 'Kurze Lektionen erklären dir Schritt für Schritt, wie Schach funktioniert.'],
          ['wN', 'Rätsel', 'Jeden Tag ein paar Aufgaben. So bekommst du den Blick für gute Züge.'],
          ['wK', 'Spielen', 'Partien gegen Computer-Gegner. Ein Coach hilft dir dabei.'],
        ].map(
          ([p, t, d], i) => html`<li class="tu-row" style=${{ '--i': i }}>
            <span class="tu-row-ico"><${PieceIcon} p=${p} size=${40} /></span>
            <span><b>${t}</b><small>${d}</small></span>
          </li>`,
        )}
      </ul>
      <p class="tu-note"><${Icon} name="check" size=${16} /> Alles wird automatisch gespeichert – du musst dich nirgends anmelden.</p>`,

    move: () => html`
      ${head('Schritt 1 · Figuren ziehen', 'So ziehst du eine Figur', 'Tippe auf den Bauern und dann auf das grüne Feld – oder zieh ihn mit dem Finger dorthin.')}
      <${Practice}
        fen=${MOVE_FEN}
        target="e2e4"
        marks=${{ e2: 'y', e4: 'g' }}
        arrows=${[['e2', 'e4', 'g']]}
        wrongText=${(m) => (m.piece === 'k' ? 'Das war der König. Nimm den Bauern – die kleine Figur vor ihm.' : 'Fast! Am Anfang darf der Bauer zwei Felder gehen. Probier das grüne Feld.')}
        solved=${solved.move}
        solvedText="Super! Genau so ziehst du eine Figur."
        onSolved=${() => setSolved((x) => ({ ...x, move: true }))}
      />`,

    puzzle: () => html`
      ${head('Schritt 2 · Rätsel', 'Dein erstes Rätsel', 'Weiß ist am Zug und setzt sofort matt. Findest du den Zug?')}
      <${Practice}
        tip="Tipp: Der schwarze König kann nicht weg – seine eigenen Bauern stehen im Weg." 
        fen=${PUZZLE_FEN}
        target="a1a8"
        checkMate
        hintArrows=${[['a1', 'a8', 'g']]}
        wrongText="Nicht ganz. Schau auf die oberste Reihe – dort steht der König."
        solved=${solved.puzzle}
        solvedText="Schachmatt! Du hast dein erstes Rätsel gelöst."
        onSolved=${() => setSolved((x) => ({ ...x, puzzle: true }))}
      />`,

    bots: () => html`
      ${head('Schritt 3 · Spielen', 'Gegen Bots spielen', 'Bots sind Computer-Gegner. Sie überlegen wie Menschen ein paar Sekunden, bevor sie ziehen.')}
      <div class="tu-bot">
        <span class="tu-bot-ico"><${PieceIcon} p="bB" size=${30} /></span>
        <b>Kai</b><span class="tu-chip">1000</span>
        <span class="tu-bot-think"><${ThinkingDots} /> denkt nach</span>
      </div>
      <div class="tu-coach">
        <span class="tu-coach-ico"><${Icon} name="bulb" size=${18} /></span>
        <p><b>Dein Coach passt auf.</b> Machst du einen Fehler, warnt er dich – und du darfst es nochmal versuchen.</p>
      </div>
      <ul class="tu-buttons">
        ${[
          ['bulb', 'Tipp', 'Zeigt dir einen guten Zug, wenn du nicht weiterweißt.'],
          ['undo', 'Zurück', 'Nimmt deinen letzten Zug zurück.'],
          ['flag', 'Aufgeben', 'Beendet die Partie. Danach kannst du sie dir ansehen.'],
        ].map(
          ([ic, t, d], i) => html`<li style=${{ '--i': i }}>
            <span class="tu-fakebtn"><${Icon} name=${ic} size=${18} /> ${t}</span>
            <small>${d}</small>
          </li>`,
        )}
      </ul>`,

    marks: () => html`
      ${head('Schritt 4 · Pfeile & Symbole', 'Pfeile und Markierungen', 'So planst du Züge – und erkennst Fehler auf einen Blick.')}
      <div class="tu-demo" aria-hidden="true">
        <${Board} fen=${START_FEN} orientation="w" movable=${null} arrows=${[['e2', 'e4', 'g'], ['g1', 'f3', 'g'], ['d8', 'h4', 'r']]} marks=${{ f2: 'r' }} />
      </div>
      <div class="tu-feature" style=${{ '--i': 0 }}>
        <span class="tu-fakebtn"><${Icon} name="pen" size=${18} /> Pfeile</span>
        <p><b>Pfeile malen wie bei chess.com.</b> Tippe unten auf <b>Pfeile</b> und zieh von Feld zu Feld – am Computer einfach mit Rechtsklick ziehen. Von einem leeren Feld aus kannst du auch direkt einen Pfeil ziehen.</p>
      </div>
      <div class="tu-feature" style=${{ '--i': 1 }}>
        <span class="tu-mark-demo" aria-hidden="true"><${PieceIcon} p="wN" size=${36} /><b>??</b></span>
        <div>
          <p><b>Fehler leuchten rot.</b> Wenn du einen Fehler machst, leuchtet die betroffene Figur rot auf, und am Zug steht ein Symbol:</p>
          <div class="tu-symbols">
            <span class="tu-sym bad"><b>??</b> Patzer</span>
            <span class="tu-sym mid"><b>?</b> Fehler</span>
            <span class="tu-sym good"><b>★</b> Bester Zug</span>
          </div>
        </div>
      </div>`,

    nav: () => html`
      ${head('Schritt 5 · Zurechtfinden', wide ? 'Links findest du alles' : 'Unten findest du alles', wide ? 'Die Leiste am linken Rand bringt dich überall hin.' : 'Die Leiste am unteren Rand bringt dich überall hin.')}
      <div class="tu-tabbar" aria-hidden="true">
        ${[
          ['home', 'Start'],
          ['puzzle', 'Rätsel'],
          ['play', 'Spielen'],
          ['chart', 'Fortschritt'],
          ['grid', 'Mehr'],
        ].map(([ic, t], i) => html`<span class="tu-tab" style=${{ '--i': i }}><${Icon} name=${ic} size=${22} /><small>${t}</small></span>`)}
      </div>
      <ul class="tu-list">
        ${[
          ['home', 'Start', 'Dein Plan für heute – einfach von oben nach unten.'],
          ['puzzle', 'Rätsel', 'Aufgaben, die genau zu deinem Niveau passen.'],
          ['play', 'Spielen', 'Partien gegen Bots – vom Anfänger bis zum Profi.'],
          ['chart', 'Fortschritt', 'Hier siehst du, wie du besser wirst.'],
          ['grid', 'Mehr', 'Lernpfad, Eröffnungen, Analyse und Einstellungen.'],
        ].map(
          ([ic, t, d], i) => html`<li style=${{ '--i': i }}>
            <span class="tu-list-ico"><${Icon} name=${ic} size=${20} /></span>
            <span><b>${t}</b><small>${d}</small></span>
          </li>`,
        )}
      </ul>`,

    progress: () => html`
      ${head('Schritt 6 · Fortschritt', 'So siehst du, dass du besser wirst', null)}
      <ul class="tu-stats">
        <li style=${{ '--i': 0 }}>
          <span class="tu-stat-vis tu-flame"><${Icon} name="flame" size=${30} /></span>
          <span><b>Serie</b><small>Wie viele Tage du am Stück trainiert hast. Jeden Tag ein bisschen reicht schon.</small></span>
        </li>
        <li style=${{ '--i': 1 }}>
          <span class="tu-stat-vis tu-num">${s.play.rating}</span>
          <span><b>Wertung</b><small>Deine Wertung zeigt, wie stark du spielst. Sie steigt, wenn du gewinnst und Rätsel löst. (Profis nennen das Elo.)</small></span>
        </li>
        <li style=${{ '--i': 2 }}>
          <span class="tu-stat-vis"><${Ring} value=${0.66} size=${56} stroke=${6}><small class="tu-ring-l">${s.profile.minutes || 15}′</small><//></span>
          <span><b>Tagesziel</b><small>Der Ring füllt sich, während du trainierst. Dein Ziel: ${s.profile.minutes || 15} Minuten am Tag.</small></span>
        </li>
      </ul>`,

    test: () => html`
      ${head('Fast geschafft', 'Jetzt dein Testspiel', 'Du spielst eine kurze Partie gegen einen Bot. Er passt sich deinem Können an. Am Ende bekommst du deine Wertung.')}
      <div class="tu-vs" aria-hidden="true">
        <span class="tu-vs-side"><${PieceIcon} p="wK" size=${64} /><small>${name || 'Du'}</small></span>
        <span class="tu-vs-mark">VS</span>
        <span class="tu-vs-side bot"><${PieceIcon} p="bN" size=${64} /><small>Test-Bot</small></span>
      </div>
      <ul class="tu-checks">
        ${['Keine Angst vor Fehlern – der Coach hilft dir.', 'Du kannst jederzeit aufgeben.', 'Danach weißt du, wo du stehst.'].map(
          (t, i) => html`<li style=${{ '--i': i }}><span class="tu-check"><${Icon} name="check" size=${14} /></span>${t}</li>`,
        )}
      </ul>
      <div class="tu-cta">
        <button type="button" class="btn primary xl tu-start" onClick=${() => finish('#/play?test=1')}><${Icon} name="play" /> Testspiel starten</button>
        <button type="button" class="tu-later" onClick=${() => finish('#/')}>Später – erst mal umschauen</button>
      </div>`,
  };

  const anim = still ? '' : view.phase === 'out' ? `out-${view.dir}` : `in-${view.dir}`;
  const ok = canNext(view.step);
  const interactive = id === 'move' || id === 'puzzle';
  const last = view.step === STEPS.length - 1;

  return html`<div class=${`tu ${still ? 'tu-still' : ''}`} onTouchStart=${onTouchStart} onTouchEnd=${onTouchEnd}>
    <div class="tu-bg" aria-hidden="true"></div>
    <header class="tu-top">
      <div class="tu-dots" role="progressbar" aria-valuemin="1" aria-valuemax=${STEPS.length} aria-valuenow=${view.step + 1} aria-label="Fortschritt im Tutorial">
        ${STEPS.map((_, i) => html`<span class=${`tu-dot ${i === view.step ? 'on' : i < view.step ? 'done' : ''}`}></span>`)}
      </div>
      <span class="tu-count">${view.step + 1} von ${STEPS.length}</span>
      ${!last && html`<button type="button" class="tu-skip" onClick=${() => go(STEPS.length - 1)}>Überspringen</button>`}
    </header>

    <main class="tu-main">
      <section key=${view.step} class=${`tu-screen ${anim} s-${id}`}>${screens[id]()}</section>
    </main>

    <nav class="tu-nav">
      ${view.step > 0
        ? html`<button type="button" class="btn ghost tu-nav-back" onClick=${back}><${Icon} name="back" size=${18} /> Zurück</button>`
        : html`<span></span>`}
      ${!last &&
      html`<div class="tu-nav-right">
        ${interactive && !ok && html`<button type="button" class="tu-later small" onClick=${() => skip(id)}>Überspringen</button>`}
        <button type="button" class="btn primary tu-nav-next" disabled=${!ok} onClick=${next}>
          ${view.step === 0 ? "Los geht's" : 'Weiter'} <${Icon} name="next" size=${18} />
        </button>
      </div>`}
    </nav>
  </div>`;
}
