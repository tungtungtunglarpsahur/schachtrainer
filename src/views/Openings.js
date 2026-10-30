// Eröffnungen: Repertoire-Übersicht und Trainer (Lernen → Üben mit Wiederholung).
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, useStore } from '../lib/store.js';
import { useContent } from '../lib/content.js';
import { lineKey, recordOpeningDrill, checkAchievements, dueOpeningLines } from '../lib/progress.js';
import { Chess, sanDe } from '../lib/chess-util.js';
import { Board } from '../ui/Board.js';
import { Icon, Md, Spinner, Bar, announce } from '../ui/kit.js';
import { play, playMove } from '../lib/sound.js';

export function Openings() {
  const s = useStore();
  const content = useContent();
  if (!content) return html`<${Spinner} />`;
  if (!content.openings.length) return html`<div class="page"><h1>Eröffnungen</h1><p class="muted">Das Repertoire wird gerade erstellt. Schau gleich nochmal vorbei.</p></div>`;
  const due = dueOpeningLines(s);
  const groups = [
    { title: 'Mit Weiß', items: content.openings.filter((o) => o.side === 'w') },
    { title: 'Mit Schwarz', items: content.openings.filter((o) => o.side === 'b') },
  ];
  const firstDue = due[0]?.split('#');
  return html`<div class="page">
    <div class="page-head">
      <div><h1>Eröffnungen</h1><p class="muted">Erst verstehen, dann aus dem Kopf spielen. Wiederholung genau dann, wenn du sie brauchst.</p></div>
      ${firstDue && html`<a class="btn primary" href=${`#/opening/${firstDue[0]}?line=${firstDue[1]}&mode=drill`}><${Icon} name="repeat" /> ${due.length} fällig – wiederholen</a>`}
    </div>
    ${groups.map(
      (g) => html`<section>
        <div class="section-head"><h2>${g.title}</h2></div>
        <div class="opening-grid">
          ${g.items.map((o) => {
            const keys = o.lines.map((_, i) => lineKey(o.id, i));
            const learned = keys.filter((k) => s.openings.lines[k]?.box >= 1).length;
            const forYou = (s.profile.survey?.openings || []).includes(o.id);
            return html`<a href=${`#/opening/${o.id}`} class=${`opening-card ${forYou ? 'for-you' : ''}`}>
              <div class="oc-top"><span class="eco">${o.eco}</span>${forYou ? html`<span class="for-you-tag">Für dich</span>` : null}<span class="lvl">${'●'.repeat(o.level)}${'○'.repeat(Math.max(0, 4 - o.level))}</span></div>
              <b>${o.name}</b>
              <small>${o.summary}</small>
              <div class="oc-foot"><${Bar} value=${learned / o.lines.length} /><span>${learned}/${o.lines.length} Linien</span></div>
            </a>`;
          })}
        </div>
      </section>`,
    )}
  </div>`;
}

export function OpeningTrainer({ id, query }) {
  const s = useStore();
  const content = useContent();
  const [lineIdx, setLineIdx] = useState(+(query.get('line') || 0));
  const [mode, setMode] = useState(query.get('mode') || 'learn');
  if (!content) return html`<${Spinner} />`;
  const o = content.openingById[id];
  if (!o) return html`<div class="page"><h1>Eröffnung nicht gefunden</h1></div>`;
  const line = o.lines[lineIdx] || o.lines[0];
  const key = lineKey(o.id, lineIdx);
  const card = s.openings.lines[key];
  return html`<div class="page opening-page">
    <div class="page-head">
      <div><a href="#/openings" class="link">← Alle Eröffnungen</a><h1>${o.name}</h1><p class="muted">${o.summary}</p></div>
      <div class="seg">
        <button class=${mode === 'learn' ? 'on' : ''} onClick=${() => setMode('learn')}>Lernen</button>
        <button class=${mode === 'drill' ? 'on' : ''} onClick=${() => setMode('drill')}>Üben</button>
      </div>
    </div>
    <div class="pills">
      ${o.lines.map((l, i) => {
        const c = s.openings.lines[lineKey(o.id, i)];
        return html`<button class=${`pill ${i === lineIdx ? 'on' : ''}`} onClick=${() => setLineIdx(i)}>${c?.box >= 1 ? '✓ ' : ''}${l.name}</button>`;
      })}
    </div>
    ${mode === 'learn'
      ? html`<${LearnLine} key=${key} o=${o} line=${line} onDrill=${() => setMode('drill')} />`
      : html`<${DrillLine} key=${key + 'd'} o=${o} line=${line} lkey=${key} card=${card} onNext=${() => setLineIdx((lineIdx + 1) % o.lines.length)} />`}
    <section class="card ideas">
      <h3>Typische Pläne</h3>
      <ul>${o.ideas.map((t) => html`<li><${Md} text=${t} tag="span" /></li>`)}</ul>
    </section>
  </div>`;
}

function fenAt(line, n) {
  const c = new Chess();
  let last = null;
  for (let i = 0; i < n; i++) last = c.move(line.moves[i].san);
  return { fen: c.fen(), last: last ? [last.from, last.to] : null, move: last };
}

function LearnLine({ o, line, onDrill }) {
  const [n, setN] = useState(0);
  const { fen, last } = fenAt(line, n);
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'ArrowRight') setN((x) => Math.min(line.moves.length, x + 1));
      if (e.key === 'ArrowLeft') setN((x) => Math.max(0, x - 1));
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    if (n > 0) playMove(fenAt(line, n).move);
  }, [n]);
  const note = n > 0 ? line.moves[n - 1].note : 'Klick auf „Weiter“ oder nutze die Pfeiltasten. Jeder Zug wird erklärt.';
  return html`<div class="trainer-grid">
    <div class="trainer-board"><${Board} fen=${fen} orientation=${o.side} lastMove=${last} /></div>
    <aside class="card trainer-side">
      <small class="tag">${line.name} · Zug ${n}/${line.moves.length}</small>
      ${n > 0 && html`<h2 class="move-title">${Math.ceil(n / 2)}${n % 2 ? '.' : '...'} ${sanDe(line.moves[n - 1].san)}</h2>`}
      <${Md} class="lesson-md" text=${note} />
      <div class="btn-row">
        <button class="btn ghost" disabled=${n === 0} onClick=${() => setN(n - 1)}><${Icon} name="back" /></button>
        ${n < line.moves.length
          ? html`<button class="btn primary" onClick=${() => setN(n + 1)}>Weiter <${Icon} name="next" /></button>`
          : html`<button class="btn primary" onClick=${onDrill}><${Icon} name="repeat" /> Jetzt üben</button>`}
      </div>
      <div class="move-list compact">
        ${line.moves.map((m, i) => html`${i % 2 === 0 ? html`<span class="mv-num">${i / 2 + 1}.</span>` : null}<button class=${`mv ${i === n - 1 ? 'cur' : ''}`} onClick=${() => setN(i + 1)}>${sanDe(m.san)}</button>`)}
      </div>
    </aside>
  </div>`;
}

function DrillLine({ o, line, lkey, card, onNext }) {
  const [n, setN] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [msg, setMsg] = useState(null);
  const [flash, setFlash] = useState(null);
  const [shown, setShown] = useState(null);
  const [done, setDone] = useState(null);
  const alive = useRef(true);
  useEffect(() => () => (alive.current = false), []);
  const { fen, last } = fenAt(line, n);
  const myTurn = (n % 2 === 0) === (o.side === 'w');

  useEffect(() => {
    if (done) return;
    if (n >= line.moves.length) {
      finish(mistakes);
      return;
    }
    if (!myTurn) {
      const t = setTimeout(() => {
        if (!alive.current) return;
        playMove(fenAt(line, n + 1).move);
        setN(n + 1);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [n, done]);

  const finish = (m) => {
    let res;
    let fresh = [];
    update((st) => {
      res = recordOpeningDrill(st, lkey, m);
      fresh = checkAchievements(st);
    });
    announce(fresh);
    play(m ? 'move' : 'win');
    setDone({ mistakes: m, ...res });
  };

  const onMove = ({ from, to, promotion }) => {
    const c = new Chess(fen);
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const want = line.moves[n];
    if (m.san === want.san) {
      playMove(m, c);
      setFlash({ sq: to, kind: 'good', key: Date.now() });
      setMsg(null);
      setShown(null);
      setN(n + 1);
    } else {
      play('bad');
      setFlash({ sq: to, kind: 'bad', key: Date.now() });
      setMistakes(mistakes + 1);
      const wm = new Chess(fen).move(want.san);
      setShown([wm.from, wm.to, 'g']);
      setMsg(`Hier spielt man **${sanDe(want.san)}**. ${want.note}`);
    }
  };

  if (n >= line.moves.length && done)
    return html`<div class="card center-card">
      <h2>${done.mistakes ? 'Linie durchgespielt' : 'Fehlerfrei! 🔥'}</h2>
      <p class="muted">${done.mistakes ? `${done.mistakes} Fehler – diese Linie kommt bald wieder.` : 'Die nächste Wiederholung kommt erst in ein paar Tagen.'} +${done.xp} XP</p>
      <div class="btn-row center">
        <button class="btn secondary" onClick=${() => { setN(0); setMistakes(0); setDone(null); setMsg(null); }}><${Icon} name="repeat" /> Nochmal</button>
        <button class="btn primary" onClick=${onNext}>Nächste Linie <${Icon} name="next" /></button>
      </div>
    </div>`;

  return html`<div class="trainer-grid">
    <div class="trainer-board"><${Board} fen=${fen} orientation=${o.side} movable=${myTurn && !done ? o.side : null} onMove=${onMove} lastMove=${last} flash=${flash} arrows=${shown ? [shown] : []} /></div>
    <aside class="card trainer-side">
      <small class="tag">${line.name} · Üben${card ? ` · Stufe ${card.box + 1}` : ''}</small>
      <h2>${myTurn ? 'Dein Zug' : 'Gegner zieht …'}</h2>
      <p class="muted">Spiel die Linie aus dem Kopf. Bei einem Fehler zeige ich dir den richtigen Zug.</p>
      ${n > 0 && !msg && html`<${Md} class="hint-text" text=${`${sanDe(line.moves[n - 1].san)}: ${line.moves[n - 1].note}`} />`}
      ${msg && html`<${Md} class="explain bad" text=${msg} />`}
      <div class="stars-meta"><span>Zug <b>${n}</b>/${line.moves.length}</span><span>Fehler <b>${mistakes}</b></span></div>
    </aside>
  </div>`;
}
