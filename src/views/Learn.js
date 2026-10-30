// Lernpfad: Einheiten in persönlicher Reihenfolge, Lektionen als Knoten.
import { html, useState } from '../../vendor/preact-htm.js';
import { useStore } from '../lib/store.js';
import { useContent, TRACKS } from '../lib/content.js';
import { buildPath, nextLessons } from '../lib/progress.js';
import { Bar, Icon, PieceIcon, Spinner } from '../ui/kit.js';

export function Learn() {
  const s = useStore();
  const content = useContent();
  const [filter, setFilter] = useState('all');
  const [showKnown, setShowKnown] = useState(false);
  if (!content) return html`<${Spinner} />`;
  if (!content.units.length) return html`<div class="page"><h1>Lernpfad</h1><p class="muted">Die Lektionen werden gerade erstellt. Schau gleich nochmal vorbei.</p></div>`;

  const path = buildPath(content, s.profile);
  const next = nextLessons(path, s, 1)[0];
  const tracks = [...new Set(path.map((p) => p.unit.track))];
  const visible = path.filter((p) => (filter === 'all' || p.unit.track === filter) && (showKnown || !p.known || filter !== 'all'));
  const knownCount = path.filter((p) => p.known).length;
  const total = path.reduce((a, p) => a + p.lessons.length, 0);
  const doneN = path.reduce((a, p) => a + p.lessons.filter((l) => s.lessons[l.id]?.done).length, 0);
  const extra = content.units.filter((u) => !path.some((p) => p.unit.id === u.id));

  return html`<div class="page learn">
    <div class="page-head">
      <div><h1>Dein Lernpfad</h1><p class="muted">${doneN} von ${total} Lektionen · sortiert nach deinem Niveau und deinen Zielen</p></div>
      ${next && html`<a class="btn primary" href=${`#/lesson/${next.id}`}><${Icon} name="play" /> Weiter: ${next.title}</a>`}
    </div>
    <${Bar} value=${total ? doneN / total : 0} />
    <div class="pills">
      <button class=${`pill ${filter === 'all' ? 'on' : ''}`} onClick=${() => setFilter('all')}>Alle</button>
      ${tracks.map((t) => html`<button class=${`pill ${filter === t ? 'on' : ''}`} style=${{ '--c': TRACKS[t]?.color }} onClick=${() => setFilter(t)}>${TRACKS[t]?.name}</button>`)}
    </div>
    ${knownCount > 0 && filter === 'all' && html`<button class="known-toggle" onClick=${() => setShowKnown(!showKnown)}>
      ${showKnown ? 'Bekannte Grundlagen ausblenden' : `${knownCount} Einheiten, die du wahrscheinlich schon kannst, einblenden`}
    </button>`}
    <div class="units">
      ${visible.map((p) => html`<${UnitCard} p=${p} s=${s} next=${next} />`)}
    </div>
    ${visible.length === 0 &&
    html`<section class="card">
      <h3>Die Grundlagen hast du drauf</h3>
      <p class="muted">Für dein Niveau geht es mit gezieltem Training weiter – Rätsel nach Thema, Eröffnungen und Partien mit Coach.</p>
      <div class="btn-row">
        <a class="btn primary" href="#/puzzles/theme-fork"><${Icon} name="puzzle" /> Taktik</a>
        <a class="btn ghost" href="#/puzzles/theme-patterns">Mattbilder</a>
        <a class="btn ghost" href="#/puzzles/theme-end">Endspiele</a>
        <a class="btn ghost" href="#/openings">Eröffnungen</a>
        <a class="btn ghost" href="#/play">Partie mit Coach</a>
      </div>
    </section>`}
    ${extra.length > 0 &&
    html`<details class="extra-units"><summary>Weitere Einheiten außerhalb deiner Ziele (${extra.length})</summary>
      <div class="units">${extra.map((u) => html`<${UnitCard} p=${{ unit: u, known: false, lessons: content.lessonsByUnit[u.id] || [] }} s=${s} next=${next} />`)}</div>
    </details>`}
  </div>`;
}

function UnitCard({ p, s, next }) {
  const { unit, lessons, known } = p;
  const done = lessons.filter((l) => s.lessons[l.id]?.done).length;
  const track = TRACKS[unit.track] || {};
  return html`<section class=${`unit ${known ? 'known' : ''}`} style=${{ '--c': track.color }}>
    <header class="unit-head">
      <${PieceIcon} p=${unit.icon} size=${44} />
      <div><small class="tag">${track.name}${known ? ' · wahrscheinlich bekannt' : ''}</small><h3>${unit.title}</h3><p class="muted">${unit.description}</p></div>
      <span class="unit-count">${done}/${lessons.length}</span>
    </header>
    <div class="nodes">
      ${lessons.map((l, i) => {
        const st = s.lessons[l.id];
        const cur = next?.id === l.id;
        return html`<a href=${`#/lesson/${l.id}`} class=${`node ${st?.done ? 'done' : ''} ${cur ? 'current' : ''}`} style=${{ '--off': `${Math.sin(i * 1.1) * 38}px` }}>
          <span class="node-dot">${st?.done ? html`<${Icon} name="check" />` : i + 1}</span>
          <span class="node-text"><b>${l.title}</b><small>${l.minutes} Min${st?.stars ? ' · ' + '★'.repeat(st.stars) + '☆'.repeat(3 - st.stars) : ''}</small></span>
        </a>`;
      })}
    </div>
  </section>`;
}
