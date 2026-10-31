// Merkzettel: die „Merke“-Regel jeder Lektion auf einer Seite – zum Wiederholen vor dem Turnier.
import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { useStore, update, today } from '../lib/store.js';
import { useContent, TRACKS } from '../lib/content.js';
import { Icon, Md, PieceIcon, Spinner } from '../ui/kit.js';

/** Die Merke-Regel einer Lektion (ohne das „Merke:“ davor) oder null. */
export function merkeOf(lesson) {
  const st = [...(lesson.steps || [])].reverse().find((x) => x.type === 'info' && /^\*\*Merke/.test(x.text || ''));
  return st ? st.text.replace(/^\*\*Merke:?\*\*:?\s*/, '') : null;
}

export function Notes() {
  const s = useStore();
  const content = useContent();
  const [all, setAll] = useState(false);
  // Für den Tagesplan (Generalprobe): Merkzettel heute angesehen.
  useEffect(() => {
    if (!today(s).notes) update((st) => {
      today(st).notes = 1;
    });
  }, []);
  if (!content) return html`<${Spinner} />`;
  const groups = content.units
    .map((u) => ({ unit: u, items: (content.lessonsByUnit[u.id] || []).map((l) => ({ l, rule: merkeOf(l), done: !!s.lessons[l.id]?.done })).filter((x) => x.rule) }))
    .filter((g) => g.items.length);
  const doneCount = groups.reduce((a, g) => a + g.items.filter((x) => x.done).length, 0);
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const shown = groups.map((g) => ({ ...g, items: all ? g.items : g.items.filter((x) => x.done) })).filter((g) => g.items.length);
  return html`<div class="page notes">
    <div class="page-head">
      <div><h1>Merkzettel</h1><p class="muted">Die wichtigste Regel aus jeder Lektion – ideal zum Durchlesen vor einer Partie oder einem Turnier.</p></div>
      <div class="seg" role="group">
        <button class=${!all ? 'on' : ''} onClick=${() => setAll(false)}>Gelernt (${doneCount})</button>
        <button class=${all ? 'on' : ''} onClick=${() => setAll(true)}>Alle (${total})</button>
      </div>
    </div>
    ${shown.length === 0 &&
    html`<section class="card">
      <h3>Noch leer</h3>
      <p class="muted">Jede Lektion endet mit einer Merkregel. Sobald du Lektionen abschließt, sammeln sie sich hier.</p>
      <div class="btn-row"><a class="btn primary" href="#/learn"><${Icon} name="path" /> Zum Lernpfad</a><button class="btn ghost" onClick=${() => setAll(true)}>Alle Regeln ansehen</button></div>
    </section>`}
    ${shown.map(
      (g) => html`<section class="notes-unit" style=${{ '--c': TRACKS[g.unit.track]?.color }}>
        <header><span class="unit-ico"><${PieceIcon} p=${g.unit.icon} size=${26} /></span><div><small class="tag">${TRACKS[g.unit.track]?.name}</small><h3>${g.unit.title}</h3></div></header>
        <div class="notes-list">
          ${g.items.map(
            ({ l, rule, done }) => html`<a class=${`note ${done ? 'done' : ''}`} href=${`#/lesson/${l.id}`}>
              <span class="note-head"><b>${l.title}</b>${done ? html`<${Icon} name="check" size=${15} />` : html`<small>noch offen</small>`}</span>
              <${Md} class="note-text" text=${rule} />
            </a>`,
          )}
        </div>
      </section>`,
    )}
  </div>`;
}
