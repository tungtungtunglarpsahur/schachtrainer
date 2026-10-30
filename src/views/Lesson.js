// Lektions-Player: Schritt für Schritt, mit Fortschrittsbalken und Abschluss-Screen.
import { html, useState } from '../../vendor/preact-htm.js';
import { update, useStore } from '../lib/store.js';
import { useContent, TRACKS } from '../lib/content.js';
import { recordLesson, checkAchievements, buildPath, nextLessons } from '../lib/progress.js';
import { Board } from '../ui/Board.js';
import { Icon, Md, Spinner, announce, confetti } from '../ui/kit.js';
import { SequenceTask, GoalTask, StarsTask, PlayTask, QuizTask } from '../ui/Tasks.js';
import { play } from '../lib/sound.js';

const TITLES = { stars: 'Bewegung', move: 'Dein Zug', line: 'Zugfolge', quiz: 'Frage', play: 'Ausspielen', info: '' };

export function LessonView({ id }) {
  const s = useStore();
  const content = useContent();
  const [i, setI] = useState(0);
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [result, setResult] = useState(null);
  const [startedAt] = useState(Date.now());

  if (!content) return html`<${Spinner} />`;
  const lesson = content.lessonById[id];
  if (!lesson) return html`<div class="page"><h1>Lektion nicht gefunden</h1><a href="#/learn" class="btn primary">Zum Lernpfad</a></div>`;
  const unit = content.unitById[lesson.unit];
  const step = lesson.steps[i];
  const interactive = step && step.type !== 'info';
  const canContinue = !interactive || solved;

  const next = () => {
    if (i + 1 < lesson.steps.length) {
      setI(i + 1);
      setSolved(false);
      return;
    }
    let res;
    let fresh = [];
    update((st) => {
      res = recordLesson(st, lesson, mistakes);
      fresh = checkAchievements(st);
    });
    play('win');
    confetti();
    announce(fresh);
    setResult({ ...res, seconds: Math.round((Date.now() - startedAt) / 1000) });
  };

  const mistake = () => setMistakes((m) => m + 1);
  const done = () => setSolved(true);

  if (result) {
    const path = buildPath(content, s.profile);
    const nxt = nextLessons(path, s, 1)[0];
    return html`<div class="lesson-done">
      <div class="done-burst">${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}</div>
      <h1>Lektion geschafft!</h1>
      <p class="muted">${lesson.title}</p>
      <div class="summary-grid">
        <div><small>XP</small><b>+${result.xp}</b></div>
        <div><small>Fehler</small><b>${mistakes}</b></div>
        <div><small>Zeit</small><b>${Math.floor(result.seconds / 60)}:${String(result.seconds % 60).padStart(2, '0')}</b></div>
      </div>
      <div class="btn-row center">
        <a class="btn ghost" href="#/">Zur Startseite</a>
        ${nxt ? html`<a class="btn primary" href=${`#/lesson/${nxt.id}`}>Nächste Lektion: ${nxt.title} <${Icon} name="next" /></a>` : html`<a class="btn primary" href="#/puzzles/train">Rätsel lösen</a>`}
      </div>
    </div>`;
  }

  const key = `${id}-${i}`;
  let body;
  switch (step.type) {
    case 'info':
      body = step.fen ? html`<${Board} fen=${step.fen} orientation=${step.orientation || 'w'} arrows=${step.arrows || []} marks=${step.marks || {}} />` : null;
      break;
    case 'stars':
      body = html`<${StarsTask} key=${key} step=${step} onDone=${(ok, rating) => { if (rating < 3) mistake(); done(); }} />`;
      break;
    case 'move':
      body = html`<${GoalTask} key=${key} step=${step} onDone=${done} onMistake=${mistake} />`;
      break;
    case 'line':
      body = html`<${SequenceTask} key=${key} fen=${step.fen} moves=${step.moves} hint=${step.hint} orientation=${step.orientation} onDone=${done} onMistake=${mistake} />`;
      break;
    case 'quiz':
      body = html`<${QuizTask} key=${key} step=${step} onDone=${done} onMistake=${mistake} />`;
      break;
    case 'play':
      body = html`<${PlayTask} key=${key} step=${step} onDone=${done} onMistake=${mistake} />`;
      break;
    default:
      body = null;
  }

  const hasBoard = step.type !== 'quiz' ? step.type !== 'info' || step.fen : step.fen;
  return html`<div class="lesson" style=${{ '--c': TRACKS[unit?.track]?.color }}>
    <header class="lesson-top">
      <a href="#/learn" class="icon-btn" aria-label="Lektion verlassen"><${Icon} name="x" /></a>
      <div class="lesson-progress"><div style=${{ width: `${(i / lesson.steps.length) * 100}%` }}></div></div>
      <span class="lesson-count">${i + 1}/${lesson.steps.length}</span>
    </header>
    <div class=${`lesson-body ${hasBoard ? 'with-board' : 'text-only'}`}>
      <div class="lesson-text">
        <small class="tag">${unit?.title} · ${lesson.title}${TITLES[step.type] ? ' · ' + TITLES[step.type] : ''}</small>
        <${Md} class="lesson-md" text=${step.text} />
        ${solved && step.success ? html`<${Md} class="explain good" text=${step.success} />` : null}
        ${step.type === 'quiz' && !step.fen ? body : null}
      </div>
      ${step.type === 'quiz' && !step.fen ? null : html`<div class="lesson-board">${body}</div>`}
    </div>
    <footer class=${`lesson-foot ${solved ? 'solved' : ''}`}>
      <span>${solved ? html`<b class="good-text"><${Icon} name="check" /> Richtig!</b>` : interactive ? 'Löse die Aufgabe, um weiterzumachen.' : ''}</span>
      <div class="btn-row">
        ${interactive && !solved && html`<button class="btn ghost" onClick=${() => { mistake(); done(); }}>Überspringen</button>`}
        <button class="btn primary lg" disabled=${!canContinue} onClick=${next}>${i + 1 < lesson.steps.length ? 'Weiter' : 'Abschließen'} <${Icon} name="next" /></button>
      </div>
    </footer>
  </div>`;
}
