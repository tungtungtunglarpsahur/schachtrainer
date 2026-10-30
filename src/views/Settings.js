// Einstellungen: Plan, Brett, Sound, Daten (Backup / Import / Zurücksetzen).
import { html, useRef, useState } from '../../vendor/preact-htm.js';
import { useStore, update, exportData, importData, resetAll, LEVELS } from '../lib/store.js';
import { GOALS, MINUTES } from './Onboarding.js';
import { Board } from '../ui/Board.js';
import { Icon, toast } from '../ui/kit.js';
import { SPEEDS } from './Play.js';

const THEMES = [
  { id: 'slate', name: 'Graphit' },
  { id: 'green', name: 'Turnier' },
  { id: 'wood', name: 'Holz' },
  { id: 'neon', name: 'Carbon' },
  { id: 'ice', name: 'Eis' },
];

function Toggle({ label, desc, value, onChange }) {
  return html`<label class="toggle-row">
    <span><b>${label}</b>${desc ? html`<small>${desc}</small>` : null}</span>
    <span class="switch"><input type="checkbox" checked=${value} onChange=${(e) => onChange(e.target.checked)} /><span></span></span>
  </label>`;
}

export function Settings() {
  const s = useStore();
  const file = useRef();
  const set = (k, v) => update((st) => (st.settings[k] = v));
  const setProfile = (k, v) =>
    update((st) => {
      st.profile[k] = v;
      st.plan = null;
    });
  const toggleGoal = (id) => {
    const g = new Set(s.profile.goals);
    g.has(id) ? g.delete(id) : g.add(id);
    if (g.size) setProfile('goals', [...g]);
  };

  return html`<div class="page settings">
    <div class="page-head"><div><h1>Einstellungen</h1><p class="muted">Alles wird sofort auf diesem Gerät gespeichert.</p></div></div>

    <section class="card">
      <h3>Dein Plan</h3>
      <label class="field"><span>Name</span><input class="input" value=${s.profile.name} onInput=${(e) => setProfile('name', e.target.value)} /></label>
      <div class="field"><span>Zeit pro Tag</span>
        <div class="seg wrap">${MINUTES.map((m) => html`<button class=${s.profile.minutes === m ? 'on' : ''} onClick=${() => setProfile('minutes', m)}>${m} Min</button>`)}</div>
      </div>
      <div class="field"><span>Niveau</span>
        <div class="seg wrap">${LEVELS.map((l) => html`<button class=${s.profile.level === l.id ? 'on' : ''} onClick=${() => setProfile('level', l.id)}>${l.title}</button>`)}</div>
      </div>
      <div class="field"><span>Ziele</span>
        <div class="seg wrap">${GOALS.map((g) => html`<button class=${s.profile.goals.includes(g.id) ? 'on' : ''} onClick=${() => toggleGoal(g.id)}>${g.name}</button>`)}</div>
      </div>
      <a class="btn secondary" href="#/puzzles/placement"><${Icon} name="bolt" /> Einstufungstest wiederholen</a>
    </section>

    <section class="card survey-card">
      <h3>Deine Umfrage</h3>
      <p class="muted small">Deine Antworten bestimmen Tagesplan, Rätsel-Niveau, Eröffnungen und Coach. Wenn sich etwas geändert hat, beantworte die Fragen einfach neu – dein Fortschritt bleibt erhalten.</p>
      <button class="btn secondary" onClick=${() => update((st) => { st.profile.onboarded = false; })}><${Icon} name="repeat" /> Umfrage wiederholen</button>
    </section>

    <section class="card help-card">
      <h3>Hilfe & Einstieg</h3>
      <p class="muted small">Schau dir die kurze Einführung nochmal an oder spiel das Testspiel erneut, um deine Wertung neu zu bestimmen.</p>
      <div class="btn-row">
        <button class="btn secondary" onClick=${() => update((st) => { st.profile.tutorialDone = false; })}><${Icon} name="bulb" /> Tutorial nochmal ansehen</button>
        <button class="btn ghost" onClick=${() => (location.hash = '#/play?test=1')}><${Icon} name="play" /> Testspiel wiederholen</button>
      </div>
    </section>

    <section class="card">
      <h3>Brett & Spiel</h3>
      <div class="theme-pick">
        ${THEMES.map((t) => html`<button class=${`theme-swatch ${s.settings.boardTheme === t.id ? 'on' : ''}`} onClick=${() => set('boardTheme', t.id)}>
          <span class=${`swatch theme-${t.id}`}><i></i><i></i><i></i><i></i></span>${t.name}
        </button>`)}
      </div>
      <div class="settings-preview"><${Board} fen="r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3" lastMove=${['g1', 'f3']} arrows=${[['f3', 'g5', 'g']]} /></div>
      <${Toggle} label="Sounds" value=${s.settings.sound} onChange=${(v) => set('sound', v)} />
      <${Toggle} label="Koordinaten anzeigen" value=${s.settings.coords} onChange=${(v) => set('coords', v)} />
      <${Toggle} label="Animationen" value=${s.settings.animation} onChange=${(v) => set('animation', v)} />
      <${Toggle} label="Automatisch zur Dame umwandeln" value=${s.settings.autoQueen} onChange=${(v) => set('autoQueen', v)} />
      <${Toggle} label="Bewertungsbalken in Partien" desc="Nur im Coach-Modus „Voll“" value=${s.settings.showEval} onChange=${(v) => set('showEval', v)} />
      <${Toggle} label="Rätsel: automatisch weiter" desc="Nach richtiger Lösung direkt zum nächsten Rätsel" value=${s.settings.autoNext !== false} onChange=${(v) => set('autoNext', v)} />
      <div class="toggle-row" style=${{ cursor: 'default', flexWrap: 'wrap' }}>
        <span><b>Bot-Tempo</b><small>${(SPEEDS.find((x) => x.id === (s.settings.botSpeed || 'normal')) || SPEEDS[1]).desc}</small></span>
        <div class="seg wrap">${SPEEDS.map((x) => html`<button class=${(s.settings.botSpeed || 'normal') === x.id ? 'on' : ''} onClick=${() => set('botSpeed', x.id)}>${x.label}</button>`)}</div>
      </div>
    </section>

    <section class="card">
      <h3>Deine Daten</h3>
      <p class="muted small">gambit hat keinen Server und keinen Account. Dein Fortschritt liegt im Speicher dieses Browsers. Wenn du die Browserdaten löschst, ist er weg – mach ab und zu ein Backup.</p>
      <div class="btn-row">
        <button class="btn primary" onClick=${() => { exportData(); toast('Backup heruntergeladen'); }}><${Icon} name="download" /> Backup herunterladen</button>
        <button class="btn secondary" onClick=${() => file.current.click()}><${Icon} name="upload" /> Backup laden</button>
        <input ref=${file} type="file" accept="application/json,.json" hidden onChange=${async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            await importData(f);
            toast('Backup geladen', { kind: 'good' });
          } catch (err) {
            toast(err.message || 'Datei konnte nicht gelesen werden', { kind: 'danger' });
          }
          e.target.value = '';
        }} />
        <${ResetButton} />
      </div>
    </section>

    <section class="card credits">
      <h3>Über gambit</h3>
      <p class="muted small">Engine: Stockfish 18 (GPLv3) · Regeln: chess.js (BSD) · Rätsel: Lichess-Datenbank (CC0) · Figuren: Colin M. L. Burnett (GPLv2+) · UI: Preact (MIT) + htm (Apache-2.0).</p>
    </section>
  </div>`;
}

/** Zweistufiges Zurücksetzen statt Browser-Popup. */
function ResetButton() {
  const [armed, setArmed] = useState(false);
  if (!armed) return html`<button class="btn ghost danger" onClick=${() => setArmed(true)}><${Icon} name="trash" /> Alles zurücksetzen</button>`;
  return html`<span class="btn-row">
    <button class="btn primary" onClick=${() => {
      resetAll();
      location.hash = '#/';
    }}><${Icon} name="trash" /> Ja, alles löschen</button>
    <button class="btn ghost" onClick=${() => setArmed(false)}>Abbrechen</button>
  </span>`;
}
