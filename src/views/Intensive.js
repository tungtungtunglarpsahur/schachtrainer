// Intensiv-Plan: einrichten, Überblick über alle Tage, Abschluss.
import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { update, useStore, dayKey } from '../lib/store.js';
import { useContent } from '../lib/content.js';
import { todayPlan, taskProgress, checkAchievements } from '../lib/progress.js';
import { SCHEDULES, DAY_OPTIONS, MINUTE_OPTIONS, dayBlock, planDay, intensiveActive, intensiveFinished } from '../lib/intensive.js';
import { Icon, PieceIcon, Spinner, Modal, toast, announce, confetti } from '../ui/kit.js';

const WHY = [
  ['wR', 'Erst die Punkte, die am meisten bringen', 'Nichts einstellen, Gabeln, Mattbilder – das entscheidet die meisten Partien.'],
  ['wN', 'Jeden Tag ein Schwerpunkt', 'Lektionen, echte Rätsel und Sehtraining zum selben Thema – so bleibt es hängen.'],
  ['wK', 'Mit Generalprobe', 'Am Ende spielst du Partien wie im Turnier und arbeitest deine Fehler auf.'],
];

export function Intensive() {
  const s = useStore();
  const content = useContent();
  if (!content) return html`<${Spinner} />`;
  if (intensiveActive(s)) return html`<${Overview} s=${s} content=${content} />`;
  if (intensiveFinished(s)) return html`<${Finished} s=${s} />`;
  return html`<${Setup} s=${s} />`;
}

function Setup({ s }) {
  const [days, setDays] = useState(7);
  const [minutes, setMinutes] = useState(Math.max(30, Math.min(90, s.profile.minutes >= 45 ? 60 : 45)));
  const start = () => {
    update((st) => {
      st.intensive = {
        start: dayKey(),
        days,
        minutes,
        startPuzzle: st.puzzle.rating,
        startPlay: st.play.rating,
        startSolved: st.puzzle.solved,
        startLessons: Object.values(st.lessons).filter((l) => l.done).length,
      };
      st.plan = null;
    });
    toast(`Los geht's: ${days} Tage Intensiv-Plan!`, { icon: 'wK' });
    location.hash = '#/';
  };
  return html`<div class="page intensive">
    <section class="hero-card int-hero">
      <div class="hero-left">
        <p class="eyebrow"><${Icon} name="bolt" size=${16} /> Intensiv-Plan</p>
        <h1>Bald ein Turnier? Hol in wenigen Tagen das Maximum raus.</h1>
        <p class="muted">Jeden Tag ein Schwerpunkt – genau in der Reihenfolge, die in Amateurpartien die meisten Punkte bringt. Dein Tagesplan auf der Startseite stellt sich automatisch um.</p>
      </div>
    </section>

    <section class="card int-setup">
      <div class="int-field">
        <span class="int-label">Wie viele Tage hast du?</span>
        <div class="seg big" role="group">
          ${DAY_OPTIONS.map((d) => html`<button class=${days === d ? 'on' : ''} onClick=${() => setDays(d)}><b>${d}</b><small>Tage</small></button>`)}
        </div>
      </div>
      <div class="int-field">
        <span class="int-label">Wie viel Zeit pro Tag?</span>
        <div class="seg big" role="group">
          ${MINUTE_OPTIONS.map((m) => html`<button class=${minutes === m ? 'on' : ''} onClick=${() => setMinutes(m)}><b>${m}</b><small>Min</small></button>`)}
        </div>
      </div>
      <div class="int-preview">
        ${SCHEDULES[days].map((_, i) => {
          const b = dayBlock(days, i);
          return html`<div class="int-day"><span class="int-num">${i + 1}</span><${PieceIcon} p=${b.icon} size=${30} /><span><b>${b.title}</b><small>${b.goal}</small></span></div>`;
        })}
      </div>
      <button class="btn primary xl" onClick=${start}><${Icon} name="bolt" /> Plan starten</button>
    </section>

    <div class="int-why">
      ${WHY.map(([p, t, d]) => html`<div class="card int-why-card"><${PieceIcon} p=${p} size=${34} /><b>${t}</b><small class="muted">${d}</small></div>`)}
    </div>
  </div>`;
}

function Overview({ s, content }) {
  const [confirm, setConfirm] = useState(false);
  const p = s.intensive;
  const idx = planDay(p);
  const plan = todayPlan(content, s);
  const items = plan.tasks.map((t) => taskProgress(t, s, plan));
  const doneToday = items.filter((x) => x >= 1).length;
  const end = () => {
    update((st) => {
      st.intensive = null;
      st.plan = null;
    });
    setConfirm(false);
    toast('Intensiv-Plan beendet. Dein normaler Tagesplan ist wieder da.');
    location.hash = '#/';
  };
  return html`<div class="page intensive">
    <div class="page-head">
      <div><p class="eyebrow"><${Icon} name="bolt" size=${16} /> Intensiv-Plan</p><h1>Tag ${idx + 1} von ${p.days}</h1>
        <p class="muted">${p.days - idx > 1 ? `Heute und noch ${p.days - idx - 1} ${p.days - idx - 1 === 1 ? 'Tag' : 'Tage'}` : 'Heute ist der letzte Tag'} · ${p.minutes} Min pro Tag · heute ${doneToday}/${items.length} erledigt</p></div>
      <a class="btn primary" href="#/"><${Icon} name="play" /> Zum Tagesplan</a>
    </div>
    <div class="int-days">
      ${SCHEDULES[p.days].map((_, i) => {
        const b = dayBlock(p.days, i);
        const state = i < idx ? 'past' : i === idx ? 'today' : 'next';
        return html`<div class=${`int-daycard ${state}`}>
          <span class="int-num">${state === 'past' ? html`<${Icon} name="check" size=${16} />` : i + 1}</span>
          <${PieceIcon} p=${b.icon} size=${34} />
          <span class="int-day-text"><small>${state === 'today' ? 'Heute' : state === 'past' ? 'Vorbei' : `Tag ${i + 1}`}</small><b>${b.title}</b><small class="muted">${b.goal}</small></span>
        </div>`;
      })}
    </div>
    <div class="int-tools">
      <a class="card int-tool" href="#/vision"><${PieceIcon} p="wR" size=${30} /><span><b>Sehtraining</b><small class="muted">Aufwärmen: 1–2 Runden vor jeder Einheit</small></span><${Icon} name="next" /></a>
      <a class="card int-tool" href="#/puzzles/rush"><${PieceIcon} p="wQ" size=${30} /><span><b>Rätsel-Rush</b><small class="muted">3 Minuten Vollgas für den Taktik-Blick</small></span><${Icon} name="next" /></a>
      <a class="card int-tool" href="#/puzzles/mine"><${PieceIcon} p="bK" size=${30} /><span><b>Deine Partie-Fehler</b><small class="muted">Aus deinen Partien – bis sie sitzen</small></span><${Icon} name="next" /></a>
      <a class="card int-tool" href="#/notes"><${PieceIcon} p="wK" size=${30} /><span><b>Merkzettel</b><small class="muted">Alle Merkregeln – vor dem Turnier durchlesen</small></span><${Icon} name="next" /></a>
    </div>
    <button class="btn ghost" onClick=${() => setConfirm(true)}><${Icon} name="x" /> Plan beenden</button>
    ${confirm &&
    html`<${Modal} onClose=${() => setConfirm(false)}>
      <h2>Intensiv-Plan beenden?</h2>
      <p class="muted">Dein Fortschritt bleibt erhalten – nur der Tagesplan geht zurück auf normal.</p>
      <div class="btn-row"><button class="btn primary" onClick=${end}>Ja, beenden</button><button class="btn ghost" onClick=${() => setConfirm(false)}>Weitermachen</button></div>
    <//>`}
  </div>`;
}

function Finished({ s }) {
  const p = s.intensive;
  const lessons = Object.values(s.lessons).filter((l) => l.done).length - (p.startLessons || 0);
  const solved = s.puzzle.solved - (p.startSolved || 0);
  const dPuzzle = s.puzzle.rating - (p.startPuzzle || s.puzzle.rating);
  // Wer wirklich trainiert hat, bekommt den Erfolg „Turnierbereit“.
  useEffect(() => {
    if (p.done || (solved < 20 && lessons < 3)) return;
    let fresh = [];
    update((st) => {
      st.intensive.done = true;
      fresh = checkAchievements(st);
    });
    announce(fresh);
    confetti(90);
  }, []);
  const restart = () =>
    update((st) => {
      st.intensive = null;
      st.plan = null;
    });
  const sign = (n) => (n > 0 ? `+${n}` : String(n));
  return html`<div class="page intensive">
    <section class="hero-card int-hero">
      <div class="hero-left">
        <p class="eyebrow">Intensiv-Plan geschafft</p>
        <h1>${p.days} Tage durchgezogen – stark! 🏆</h1>
        <p class="muted">Viel Erfolg bei deinem Turnier. Vor jedem Zug: Was droht? Was hängt? Dann spielen.</p>
      </div>
    </section>
    <div class="stat-grid">
      <div class="card stat"><small>Lektionen</small><b>${Math.max(0, lessons)}</b></div>
      <div class="card stat"><small>Rätsel gelöst</small><b>${Math.max(0, solved)}</b></div>
      <div class="card stat"><small>Rätsel-Rating</small><b>${sign(dPuzzle)}</b></div>
    </div>
    <div class="btn-row">
      <button class="btn primary" onClick=${restart}><${Icon} name="repeat" /> Neuen Plan erstellen</button>
      <a class="btn ghost" href="#/">Zur Startseite</a>
    </div>
  </div>`;
}
