// Drill-Schritt in Lektionen: echte Rätsel zum Thema – etwas leichter als das eigene Rätsel-Rating,
// weil das Muster gerade erst gelernt wurde. Ergebnisse zählen wie normale Rätsel.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { state, update } from '../lib/store.js';
import { usePuzzles, pickPuzzle } from '../lib/content.js';
import { recordPuzzle, checkAchievements } from '../lib/progress.js';
import { SequenceTask } from './Tasks.js';
import { Icon, Spinner, announce } from './kit.js';

/** Wählt `count` verschiedene Rätsel zum Thema, leicht steigend. */
export function pickDrill(db, themes, count, rating) {
  const base = Math.max(450, Math.min(2500, rating - 120));
  const exclude = new Set();
  const out = [];
  for (let k = 0; k < count; k++) {
    const p = pickPuzzle(db, { rating: base + k * 45, themes, seen: state.puzzle.seen, exclude, spread: 90 });
    if (!p || exclude.has(p.id)) continue;
    exclude.add(p.id);
    out.push(p);
  }
  return out.sort((a, b) => a.rating - b.rating);
}

export function DrillTask({ step, onDone, onMistake, onProgress }) {
  const db = usePuzzles();
  const [list, setList] = useState(null);
  const [i, setI] = useState(0);
  const [marks, setMarks] = useState([]); // je Rätsel: 'clean' | 'hint' | 'retry' | 'fail'
  const [finished, setFinished] = useState(null); // Ergebnis des aktuellen Rätsels
  const flags = useRef({ hinted: false, failed: false });
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (db && !list) setList(pickDrill(db, step.themes, step.count || 3, state.puzzle.rating));
  }, [db]);
  // Ohne Rätsel (z. B. offline ohne Daten) nicht hängen bleiben.
  useEffect(() => {
    if (list && !list.length) onDone?.(true);
  }, [list]);

  if (!db || !list) return html`<div class="task-wrap drill-wait"><${Spinner} /><p class="muted small">Rätsel werden geladen …</p></div>`;
  if (!list.length) return html`<div class="task-wrap"><p class="muted">Gerade keine passenden Rätsel – weiter geht's.</p></div>`;
  const p = list[i];
  const learner = p.fen.split(' ')[1] === 'w' ? 'b' : 'w';

  const advance = () => {
    clearTimeout(timer.current);
    if (i + 1 < list.length) {
      flags.current = { hinted: false, failed: false };
      setFinished(null);
      setI(i + 1);
    }
  };

  const settle = (ok) => {
    const outcome = !ok ? 'fail' : flags.current.failed ? 'retry' : flags.current.hinted ? 'hint' : 'clean';
    let fresh = [];
    update((st) => {
      recordPuzzle(st, p, outcome, { rated: true });
      fresh = checkAchievements(st);
    });
    announce(fresh);
    if (outcome === 'fail' || outcome === 'retry') onMistake?.();
    const next = [...marks, outcome];
    setMarks(next);
    setFinished(outcome);
    onProgress?.(next.length, list.length);
    if (next.length >= list.length) {
      onDone?.(next.every((x) => x !== 'fail'));
      return;
    }
    // Gelöst: kurz freuen, dann automatisch weiter. Lösung gezeigt: in Ruhe ansehen, dann selbst weiter.
    if (outcome !== 'fail') timer.current = setTimeout(advance, 1100);
  };

  return html`<div class="task-wrap drill">
    <div class="drill-head">
      <span class="drill-dots" aria-hidden="true">
        ${list.map((x, k) => html`<i class=${k < marks.length ? `d-${marks[k]}` : k === i ? 'd-cur' : ''}></i>`)}
      </span>
      <span class="drill-info">Rätsel ${i + 1}/${list.length} · <b>${learner === 'w' ? 'Weiß' : 'Schwarz'}</b> am Zug · ${p.rating}</span>
    </div>
    <${SequenceTask} key=${p.id} fen=${p.fen} moves=${p.moves} setup solveLabel="Lösung"
      onMistake=${(why) => {
        if (why === 'hint') flags.current.hinted = true;
        else flags.current.failed = true;
      }}
      onDone=${settle} />
    ${finished && i + 1 < list.length
      ? html`<div class="drill-next">
          <span class=${`feedback ${finished === 'fail' ? 'bad' : 'good'}`}>${finished === 'clean' ? 'Sauber gelöst!' : finished === 'fail' ? 'Schau dir die Lösung an.' : 'Geschafft!'}</span>
          <button class="btn secondary" onClick=${advance}>Nächstes Rätsel <${Icon} name="next" /></button>
        </div>`
      : null}
  </div>`;
}
