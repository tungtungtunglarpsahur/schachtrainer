// Einstellungen: Aussehen, Sound, Sprachausgabe, Spiel, Plan, Teilen, Daten.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { useStore, update, exportData, importData, resetAll, LEVELS, rankFor } from '../lib/store.js';
import { useNet, logout, pushProgress, loggedIn } from '../lib/online.js';
import { GOALS, MINUTES } from './Onboarding.js';
import { Board } from '../ui/Board.js';
import { Icon, toast } from '../ui/kit.js';
import { SPEEDS } from './Play.js';
import { play, previewSound, SOUND_PACKS } from '../lib/sound.js';
import { speak, speakMove, unlockSpeech, germanVoices, onVoices, ttsSupported, stopSpeaking } from '../lib/speech.js';

const THEMES = [
  { id: 'slate', name: 'Graphit' },
  { id: 'green', name: 'Turnier' },
  { id: 'wood', name: 'Holz' },
  { id: 'neon', name: 'Carbon' },
  { id: 'ice', name: 'Eis' },
];

const APP_THEMES = [
  { id: 'graphit', name: 'Graphit', bg: '#0a0a0b', bar: '#111113', panel: '#1c1c20', panel2: '#2a2a30' },
  { id: 'oled', name: 'OLED', bg: '#000000', bar: '#060606', panel: '#121214', panel2: '#1e1e21' },
  { id: 'mitternacht', name: 'Mitternacht', bg: '#070a12', bar: '#0d1322', panel: '#172138', panel2: '#24314d' },
  { id: 'espresso', name: 'Espresso', bg: '#0d0a08', bar: '#16110d', panel: '#271e17', panel2: '#372b21' },
  { id: 'nebel', name: 'Nebel', bg: '#121316', bar: '#1a1b20', panel: '#2a2b32', panel2: '#383943' },
];

const EFFECTS = [
  { id: 'off', label: 'Aus', desc: 'Keine Effekte – ruhig und schlicht.' },
  { id: 'subtle', label: 'Dezent', desc: 'Kleine Lichteffekte beim Schlagen und bei Schach.' },
  { id: 'full', label: 'Voll', desc: 'Funken beim Schlagen, Leuchten bei Schach, große Show beim Matt.' },
];

const COACH = [
  { id: 'full', label: 'Voll', desc: 'Live-Bewertung, Drohungen, Matt-Alarm und Tipps.' },
  { id: 'quiet', label: 'Leise', desc: 'Meldet sich nur bei Fehlern – mit Zurücknehmen.' },
  { id: 'off', label: 'Aus', desc: 'Echte Partie ganz ohne Hilfe.' },
];

const SECTIONS = [
  { id: 'st-account', label: 'Konto', icon: 'user' },
  { id: 'st-look', label: 'Aussehen', icon: 'palette' },
  { id: 'st-sound', label: 'Sound', icon: 'sound' },
  { id: 'st-voice', label: 'Sprache', icon: 'bubble' },
  { id: 'st-game', label: 'Spiel', icon: 'play' },
  { id: 'st-plan', label: 'Plan', icon: 'clock' },
  { id: 'st-share', label: 'Teilen', icon: 'share' },
  { id: 'st-data', label: 'Daten', icon: 'download' },
];

const GLYPHS = {
  bubble: 'M4 5h16v11h-9l-5 4v-4H4zM8 10h.01M12 10h.01M16 10h.01',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.1 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3zM7.5 12h.01M9 7.5h.01M14.5 7h.01',
  share: 'M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
};

function Ico({ name, size = 20 }) {
  if (!GLYPHS[name]) return html`<${Icon} name=${name} size=${size} />`;
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${GLYPHS[name]} /></svg>`;
}

function Toggle({ label, desc, value, onChange }) {
  return html`<label class="toggle-row">
    <span><b>${label}</b>${desc ? html`<small>${desc}</small>` : null}</span>
    <span class="switch"><input type="checkbox" checked=${value} onChange=${(e) => onChange(e.target.checked)} /><span></span></span>
  </label>`;
}

function Head({ id, icon, title, sub }) {
  return html`<div class="st-head">
    <span class="st-ico"><${Ico} name=${icon} size=${22} /></span>
    <div><h2 id=${id + '-title'}>${title}</h2>${sub ? html`<p>${sub}</p>` : null}</div>
  </div>`;
}

const shareUrl = () => location.origin + location.pathname;
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

export function Settings() {
  const s = useStore();
  const n = useNet();
  const u = n.user;
  const st = s.settings;
  const file = useRef();
  const link = useRef();
  const [voices, setVoices] = useState(() => germanVoices());
  useEffect(() => onVoices(() => setVoices(germanVoices())), []);
  useEffect(() => () => stopSpeaking(), []);
  const tts = ttsSupported();
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const set = (k, v) => update((x) => (x.settings[k] = v));
  const setProfile = (k, v) =>
    update((x) => {
      x.profile[k] = v;
      x.plan = null;
    });
  const toggleGoal = (id) => {
    const g = new Set(s.profile.goals);
    g.has(id) ? g.delete(id) : g.add(id);
    if (g.size) setProfile('goals', [...g]);
  };
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: smooth(), block: 'start' });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast('Link kopiert – jetzt einfach in den Gruppenchat einfügen.', { kind: 'good' });
    } catch {
      try {
        link.current?.select();
        document.execCommand('copy');
        toast('Link kopiert', { kind: 'good' });
      } catch {
        toast('Markiere den Link und kopiere ihn.');
      }
    }
  };
  const shareApp = async () => {
    try {
      await navigator.share({ title: 'Learning King – Schach lernen', text: 'Lern mit mir Schach! Rätsel, Lektionen und Bots mit Coach – kostenlos und ohne Anmeldung.', url: shareUrl() });
    } catch {
      /* abgebrochen */
    }
  };

  const speedDesc = (SPEEDS.find((x) => x.id === (st.botSpeed || 'normal')) || SPEEDS[1]).desc;
  const pack = SOUND_PACKS.find((p) => p.id === (st.soundPack || 'klassik')) || SOUND_PACKS[0];
  const volume = Number.isFinite(Number(st.volume)) ? Number(st.volume) : 0.8;
  const rate = Number(st.ttsRate) || 1;
  const effects = st.effects || 'full';

  return html`<div class="page settings st">
    <div class="page-head"><div><h1>Einstellungen</h1><p class="muted">${u ? 'Alles wird sofort gespeichert – und auf deinem Konto gesichert.' : 'Alles wird sofort gespeichert – auf diesem Gerät.'}</p></div></div>

    <nav class="st-nav" aria-label="Bereiche">
      ${SECTIONS.map((x) => html`<button onClick=${() => jump(x.id)}><${Ico} name=${x.icon} size=${16} />${x.label}</button>`)}
    </nav>

    <${AccountCard} u=${u} />

    <section class="card st-card" id="st-look">
      <${Head} id="st-look" icon="palette" title="Aussehen" sub="Farben, Brett und Effekte" />
      <span class="st-label">App-Thema<small>Die Grundfarbe der ganzen App. Weiß bleibt der Akzent.</small></span>
      <div class="st-themes" role="radiogroup" aria-label="App-Thema">
        ${APP_THEMES.map(
          (t) => html`<button role="radio" aria-checked=${(st.appTheme || 'graphit') === t.id} class=${`st-theme ${(st.appTheme || 'graphit') === t.id ? 'on' : ''}`} onClick=${() => set('appTheme', t.id)}>
            <span class="st-mock" style=${{ '--m-bg': t.bg, '--m-bar': t.bar, '--m-panel': t.panel, '--m-panel2': t.panel2 }}><i class="m-side"></i><i class="m-card"></i><i class="m-btn"></i><i class="m-card2"></i><i class="m-dot"></i></span>
            ${(st.appTheme || 'graphit') === t.id ? html`<span class="tick"><${Icon} name="check" size=${12} /></span>` : null}
            ${t.name}
          </button>`,
        )}
      </div>

      <span class="st-label">Brett</span>
      <div class="st-board">
        <div class="theme-pick">
          ${THEMES.map((t) => html`<button class=${`theme-swatch ${st.boardTheme === t.id ? 'on' : ''}`} onClick=${() => set('boardTheme', t.id)}>
            <span class=${`swatch theme-${t.id}`}><i></i><i></i><i></i><i></i></span>${t.name}
          </button>`)}
        </div>
        <div class="settings-preview"><${Board} fen="r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3" lastMove=${['g1', 'f3']} arrows=${[['f3', 'g5', 'g']]} /></div>
      </div>

      <div class="st-row">
        <span><b>Effekte</b><small>${(EFFECTS.find((x) => x.id === effects) || EFFECTS[2]).desc}</small></span>
        <div class="seg">${EFFECTS.map((x) => html`<button class=${effects === x.id ? 'on' : ''} onClick=${() => set('effects', x.id)}>${x.label}</button>`)}</div>
      </div>
      <${Toggle} label="Animationen" desc="Weiche Übergänge und gleitende Figuren" value=${st.animation} onChange=${(v) => set('animation', v)} />
      <${Toggle} label="Leiste unten ausblenden" desc="Auf Handy und iPad wird die Leiste beim Runterscrollen immer durchsichtiger, bis sie verschwindet – beim Hochscrollen kommt sie genauso zurück." value=${st.hideBar !== false} onChange=${(v) => set('hideBar', v)} />
    </section>

    <section class="card st-card" id="st-sound">
      <${Head} id="st-sound" icon="sound" title="Sound" sub="Klänge beim Ziehen, Schlagen und Lösen" />
      <${Toggle} label="Sounds" desc="Klänge an oder aus" value=${st.sound} onChange=${(v) => {
        set('sound', v);
        if (v) play('notify');
      }} />
      <div class="st-row">
        <span><b>Lautstärke</b></span>
        <div class=${`st-range ${st.sound ? '' : 'off'}`} style=${{ flex: '1 1 260px' }}>
          <${Icon} name="sound" size=${18} />
          <input type="range" min="0" max="1" step="0.05" value=${volume} aria-label="Lautstärke"
            onInput=${(e) => set('volume', +e.target.value)} onChange=${() => play('move')} />
          <output>${Math.round(volume * 100)} %</output>
        </div>
      </div>
      <div class="st-row">
        <span><b>Sound-Paket</b><small>${pack.desc}</small></span>
        <div class="seg wrap">${SOUND_PACKS.map((p) => html`<button class=${pack.id === p.id ? 'on' : ''} onClick=${() => {
          set('soundPack', p.id);
          previewSound(p.id);
        }}>${p.label}</button>`)}</div>
      </div>
      <div class="st-actions"><button class="btn ghost" onClick=${() => previewSound()}><${Icon} name="play" /> Probehören</button></div>
    </section>

    <section class="card st-card" id="st-voice">
      <${Head} id="st-voice" icon="bubble" title="Sprachausgabe" sub="Der Coach liest dir Tipps und Züge vor" />
      ${tts
        ? html`
            <${Toggle} label="Coach spricht" desc="Tipps und Fehler-Erklärungen werden vorgelesen" value=${!!st.tts} onChange=${(v) => {
              set('tts', v);
              if (v) {
                unlockSpeech();
                speak('Super! Ab jetzt lese ich dir die Tipps vor.', { force: true, interrupt: false });
              } else stopSpeaking();
            }} />
            <${Toggle} label="Züge ansagen" desc="Jeder Zug wird angesagt, z. B. „Weiß: Springer f3“" value=${!!st.ttsMoves} onChange=${(v) => {
              set('ttsMoves', v);
              if (v) {
                unlockSpeech();
                speakMove('Sf3', { color: 'w', force: true });
              } else stopSpeaking();
            }} />
            <div class="st-row">
              <span><b>Stimme</b><small>${voices.length ? `${voices.length} deutsche Stimme${voices.length === 1 ? '' : 'n'} auf diesem Gerät` : 'Stimmen werden geladen …'}</small></span>
              <select class="input st-select" style=${{ flex: '1 1 240px', maxWidth: '360px' }} value=${st.ttsVoice || ''} aria-label="Stimme" onChange=${(e) => {
                set('ttsVoice', e.target.value);
                unlockSpeech();
                speak('So klinge ich. Springer f3.', { force: true });
              }}>
                <option value="">Automatisch (beste deutsche Stimme)</option>
                ${voices.map((v) => html`<option value=${v.uri}>${v.name} (${v.lang})</option>`)}
              </select>
            </div>
            <div class="st-row">
              <span><b>Sprechtempo</b></span>
              <div class="st-range" style=${{ flex: '1 1 260px' }}>
                <span class="small muted">langsam</span>
                <input type="range" min="0.8" max="1.3" step="0.05" value=${rate} aria-label="Sprechtempo"
                  onInput=${(e) => set('ttsRate', +e.target.value)} onChange=${() => speak('So schnell spreche ich.', { force: true })} />
                <output>${rate.toFixed(2).replace('.', ',')}×</output>
              </div>
            </div>
            <div class="st-actions">
              <button class="btn ghost" onClick=${() => {
                unlockSpeech();
                speak('Hallo! Ich bin dein Schach-Coach. Sf3+', { force: true });
              }}><${Icon} name="play" /> Stimme testen</button>
            </div>`
        : html`<div class="st-note"><${Icon} name="bulb" size=${18} /><span>Dieser Browser kann leider nicht vorlesen. Probier Safari, Chrome oder Edge – dann erscheinen hier die Einstellungen.</span></div>`}
    </section>

    <section class="card st-card" id="st-game">
      <${Head} id="st-game" icon="play" title="Spiel & Training" sub="Bots, Coach und Rätsel" />
      <div class="st-row">
        <span><b>Bot-Tempo</b><small>${speedDesc}</small></span>
        <div class="seg wrap">${SPEEDS.map((x) => html`<button class=${(st.botSpeed || 'normal') === x.id ? 'on' : ''} onClick=${() => set('botSpeed', x.id)}>${x.label}</button>`)}</div>
      </div>
      <div class="st-row">
        <span><b>Coach</b><small>${(COACH.find((c) => c.id === st.coach) || COACH[0]).desc}</small></span>
        <div class="seg">${COACH.map((c) => html`<button class=${st.coach === c.id ? 'on' : ''} onClick=${() => set('coach', c.id)}>${c.label}</button>`)}</div>
      </div>
      <${Toggle} label="Automatisch zur Dame umwandeln" desc="Bauern auf der letzten Reihe werden sofort zur Dame" value=${st.autoQueen} onChange=${(v) => set('autoQueen', v)} />
      <${Toggle} label="Rätsel: automatisch weiter" desc="Nach richtiger Lösung direkt zum nächsten Rätsel" value=${st.autoNext !== false} onChange=${(v) => set('autoNext', v)} />
      <${Toggle} label="Bewertungsbalken in Partien" desc="Zeigt, wer besser steht (nur mit Coach „Voll“)" value=${st.showEval} onChange=${(v) => set('showEval', v)} />
      <${Toggle} label="Koordinaten anzeigen" desc="Buchstaben und Zahlen am Brettrand" value=${st.coords} onChange=${(v) => set('coords', v)} />
    </section>

    <section class="card st-card" id="st-plan">
      <${Head} id="st-plan" icon="clock" title="Dein Plan" sub="Name, Zeit pro Tag, Niveau und Ziele" />
      <label class="field"><span>Name</span><input class="input" value=${s.profile.name} placeholder="Dein Name" onInput=${(e) => setProfile('name', e.target.value)} /></label>
      <div class="field"><span>Zeit pro Tag</span>
        <div class="seg wrap">${MINUTES.map((m) => html`<button class=${s.profile.minutes === m ? 'on' : ''} onClick=${() => setProfile('minutes', m)}>${m} Min</button>`)}</div>
      </div>
      <div class="field"><span>Niveau</span>
        <div class="seg wrap">${LEVELS.map((l) => html`<button class=${s.profile.level === l.id ? 'on' : ''} onClick=${() => setProfile('level', l.id)}>${l.title}</button>`)}</div>
      </div>
      <div class="field"><span>Ziele</span>
        <div class="seg wrap">${GOALS.map((g) => html`<button class=${s.profile.goals.includes(g.id) ? 'on' : ''} onClick=${() => toggleGoal(g.id)}>${g.name}</button>`)}</div>
      </div>
      <a class="st-int" href="#/intensive"><${Icon} name="bolt" /><span><b>${s.intensive ? 'Intensiv-Plan läuft' : 'Intensiv-Plan'}</b><small>${s.intensive ? `${s.intensive.days} Tage · ${s.intensive.minutes} Min pro Tag – ansehen oder beenden` : 'Bald ein Turnier? 3, 5 oder 7 Tage gezielt trainieren'}</small></span><${Icon} name="next" /></a>
      <span class="st-label">Neu einstufen und Hilfe<small>Dein Fortschritt bleibt dabei erhalten.</small></span>
      <div class="st-actions" style=${{ marginTop: 0 }}>
        <button class="btn secondary" onClick=${() => (location.hash = '#/play?test=1')}><${Icon} name="play" /> Testspiel wiederholen</button>
        <a class="btn ghost" href="#/puzzles/placement"><${Icon} name="bolt" /> Rätsel-Einstufung</a>
        <button class="btn ghost" onClick=${() => update((x) => { x.profile.tutorialDone = false; })}><${Icon} name="bulb" /> Tutorial ansehen</button>
        <button class="btn ghost" onClick=${() => update((x) => { x.profile.onboarded = false; })}><${Icon} name="repeat" /> Umfrage wiederholen</button>
      </div>
    </section>

    <section class="card st-card" id="st-share">
      <${Head} id="st-share" icon="share" title="App teilen" sub="Für Freunde, Familie oder deine Schulgruppe" />
      <p class="muted small" style=${{ margin: 0 }}>Schick einfach den Link. Jeder bekommt seinen eigenen Fortschritt – ganz ohne Anmeldung. Mit kostenlosem Konto ist er auf jedem Gerät da, und ihr könnt online gegeneinander spielen.</p>
      <div class="st-link">
        <input ref=${link} class="input" readonly value=${shareUrl()} aria-label="Link zur App" onFocus=${(e) => e.target.select()} />
        <button class="btn primary" onClick=${copyLink}><${Icon} name="check" /> Link kopieren</button>
        ${canShare ? html`<button class="btn secondary" onClick=${shareApp}><${Ico} name="share" /> Teilen</button>` : null}
      </div>
      <div class="st-steps">
        <div class="st-step"><b>iPhone & iPad</b><span>In Safari auf <kbd>Teilen</kbd> tippen, dann <kbd>Zum Home-Bildschirm</kbd>. Schon startet Learning King wie eine App. <a class="link" href="#/install">Anleitung mit Video →</a></span></div>
        <div class="st-step"><b>Android</b><span>In Chrome oben rechts auf <kbd>⋮</kbd> tippen, dann <kbd>App installieren</kbd> oder <kbd>Zum Startbildschirm</kbd>.</span></div>
        <div class="st-step"><b>Computer</b><span>In Chrome oder Edge rechts in der Adressleiste auf <kbd>Installieren</kbd> klicken.</span></div>
        <div class="st-step"><b>Offline</b><span>Einmal geöffnet, läuft Learning King auch ohne Internet weiter.</span></div>
        <div class="st-step"><b>Gut zu wissen</b><span>Die App auf dem Home-Bildschirm hat ihren eigenen Speicher. Am einfachsten meldest du dich dort mit deinem Konto an – dann ist alles wieder da. Ohne Konto: hier unten <kbd>Backup herunterladen</kbd>, dann in der App <kbd>Backup laden</kbd>.</span></div>
      </div>
    </section>

    <section class="card st-card" id="st-data">
      <${Head} id="st-data" icon="download" title="Deine Daten" sub="Backup, Wiederherstellen, Zurücksetzen" />
      <p class="muted small">${u
        ? 'Dein Fortschritt liegt im Speicher dieses Browsers und wird automatisch auf deinem Konto gesichert. Ein Backup als Datei geht trotzdem jederzeit.'
        : 'Dein Fortschritt liegt im Speicher dieses Browsers. Ohne Konto gilt: Wenn du die Browserdaten löschst, ist er weg – mach ab und zu ein Backup.'}</p>
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
      <h3>Über Learning King</h3>
      <p class="muted small">Engine: Stockfish 18 (GPLv3) · Regeln: chess.js (BSD) · Rätsel: Lichess-Datenbank (CC0) · Figuren: Colin M. L. Burnett (GPLv2+) · UI: Preact (MIT) + htm (Apache-2.0) · Schrift: Geist (OFL).</p>
    </section>
  </div>`;
}

/** Konto & Online: angemeldet bleiben, Fortschritt sichern, abmelden. */
function AccountCard({ u }) {
  const [busy, setBusy] = useState(false);
  const rank = u ? rankFor(u.r) : null;
  const saveNow = async () => {
    setBusy(true);
    await pushProgress();
    setBusy(false);
    toast('Fortschritt gesichert', { kind: 'good' });
  };
  return html`<section class="card st-card" id="st-account">
    <${Head} id="st-account" icon="user" title="Konto & Online" sub=${u ? 'Du bist angemeldet und bleibst es auch' : 'Angemeldet bleiben, Fortschritt sichern, online spielen'} />
    ${u
      ? html`<div class="st-account">
            <span class="on-avatar big" style=${{ '--rank': rank.color }}><span class=${`piece-icon piece ${rank.icon}`}></span></span>
            <div><b>${u.name}</b><small>${u.r}${u.prov ? '?' : ''} Elo · ${rank.name} · ${u.games || 0} Online-${u.games === 1 ? 'Partie' : 'Partien'}</small></div>
          </div>
          <p class="muted small">Dein Fortschritt wird automatisch auf deinem Konto gesichert. Auf einem anderen Gerät oder in der App auf dem Home-Bildschirm einfach anmelden – alles ist wieder da.</p>
          <div class="btn-row">
            <a class="btn primary" href="#/online"><${Icon} name="globe" /> Online spielen</a>
            <button class="btn secondary" disabled=${busy} onClick=${saveNow}><${Icon} name="upload" /> Jetzt sichern</button>
            <button class="btn ghost" onClick=${async () => {
              await logout();
              toast('Abgemeldet. Dein Fortschritt bleibt auf diesem Gerät.');
            }}><${Icon} name="back" /> Abmelden</button>
          </div>`
      : html`<p class="muted small">Mit einem kostenlosen Konto bleibst du angemeldet, dein Fortschritt ist auf jedem Gerät da und du kannst gegen echte Menschen spielen – mit Elo und Rang wie bei chess.com. Keine E-Mail nötig.</p>
          <div class="btn-row">
            <a class="btn primary" href="#/online"><${Icon} name="user" /> Konto erstellen</a>
            <a class="btn ghost" href="#/online?login=1"><${Icon} name="next" /> Anmelden</a>
          </div>`}
  </section>`;
}

/** Zweistufiges Zurücksetzen statt Browser-Popup. */
function ResetButton() {
  const [armed, setArmed] = useState(false);
  if (!armed) return html`<button class="btn ghost danger" onClick=${() => setArmed(true)}><${Icon} name="trash" /> Alles zurücksetzen</button>`;
  return html`<span class="btn-row">
    <button class="btn primary" onClick=${async () => {
      // Mit Konto: erst abmelden – der Stand auf dem Konto bleibt so erhalten.
      if (loggedIn()) await logout();
      resetAll();
      location.hash = '#/';
    }}><${Icon} name="trash" /> Ja, alles löschen</button>
    <button class="btn ghost" onClick=${() => setArmed(false)}>Abbrechen</button>
  </span>`;
}
