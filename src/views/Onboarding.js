// Pflicht-Umfrage beim ersten Start: eine Frage pro Screen. Aus den Antworten entsteht der persönliche Plan.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { LEVELS, SURVEY_VERSION, update, useStore } from '../lib/store.js';
import { Logo, PieceIcon } from '../ui/kit.js';

export const GOALS = [
  { id: 'basics', name: 'Regeln & Grundlagen', desc: 'Figuren, Schach, Matt, Spezialzüge', icon: 'wP' },
  { id: 'tactics', name: 'Taktik', desc: 'Gabel, Fesselung, Opfer, Kombinationen', icon: 'wN' },
  { id: 'mates', name: 'Mattbilder', desc: 'Schneller und sicherer mattsetzen', icon: 'wQ' },
  { id: 'openings', name: 'Eröffnungen', desc: 'Ein Repertoire, das du verstehst', icon: 'wB' },
  { id: 'strategy', name: 'Strategie', desc: 'Pläne, Strukturen, wie Profis denken', icon: 'wR' },
  { id: 'endgames', name: 'Endspiele', desc: 'Gewonnene Stellungen auch gewinnen', icon: 'wK' },
  { id: 'play', name: 'Spielen & Coaching', desc: 'Probepartien gegen Bots mit Coach', icon: 'bN' },
];

export const MINUTES = [5, 10, 15, 20, 30, 45, 60];

const EXPERIENCE = [
  { id: 'never', title: 'Noch nie', sub: 'Ich fange ganz von vorne an' },
  { id: 'lt1', title: 'Weniger als 1 Jahr', sub: 'Ich bin noch ziemlich neu dabei' },
  { id: '1to3', title: '1–3 Jahre', sub: 'Ich habe schon einiges gespielt' },
  { id: 'gt3', title: 'Länger als 3 Jahre', sub: 'Schach begleitet mich schon lange' },
];

const FREQUENCY = [
  { id: 'rarely', title: 'Selten', sub: 'Hin und wieder mal eine Partie' },
  { id: 'monthly', title: 'Ein paar Mal im Monat', sub: 'Wenn es sich ergibt' },
  { id: 'weekly', title: 'Wöchentlich', sub: 'Fester Teil meiner Woche' },
  { id: 'daily', title: 'Täglich', sub: 'Schach ist mein Ding' },
];

const PLATFORMS = [
  { id: 'chesscom', label: 'Chess.com' },
  { id: 'lichess', label: 'Lichess' },
  { id: 'club', label: 'Verein' },
  { id: 'none', label: 'Keine' },
];

const WEAKNESSES = [
  { id: 'blunders', title: 'Ich übersehe hängende Figuren', piece: 'wP' },
  { id: 'tactics', title: 'Ich finde keine Taktiken', piece: 'wN' },
  { id: 'strategy', title: 'Ich weiß nicht, was ich planen soll', piece: 'wR' },
  { id: 'openings', title: 'Eröffnungen', piece: 'wB' },
  { id: 'endgames', title: 'Endspiele', piece: 'wK' },
  { id: 'mates', title: 'Mattsetzen', piece: 'wQ' },
  { id: 'time', title: 'Zeitnot', glyph: 'clock' },
  { id: 'unknown', title: 'Weiß ich noch nicht', glyph: 'question' },
];

const STYLES = [
  { id: 'attack', title: 'Angriff', sub: 'Ich will den König jagen', piece: 'wQ' },
  { id: 'solid', title: 'Solide & positionell', sub: 'Sicher stehen, Schritt für Schritt Druck machen', piece: 'wR' },
  { id: 'tactical', title: 'Taktisch & wild', sub: 'Opfer, Komplikationen, Chaos', piece: 'wN' },
  { id: 'unknown', title: 'Weiß ich nicht', sub: 'Finden wir gemeinsam heraus', glyph: 'question' },
];

const COACHES = [
  { id: 'full', title: 'Erklär mir alles', sub: 'Live-Bewertung, Drohungen, Matt-Alarm und Tipps', glyph: 'chat' },
  { id: 'quiet', title: 'Nur bei Fehlern', sub: 'Ich melde mich, wenn du patzt – mit Zurücknehmen', glyph: 'alert' },
  { id: 'off', title: 'Lass mich spielen', sub: 'Echte Partien ohne Hilfe, Analyse danach', glyph: 'play' },
];

const LEVEL_PIECES = ['wP', 'wN', 'wB', 'wR', 'wQ'];

// Schwächen, die direkt einen Lernbereich freischalten.
const WEAK_TO_GOAL = { blunders: 'tactics', tactics: 'tactics', strategy: 'strategy', openings: 'openings', endgames: 'endgames', mates: 'mates' };

const OPENINGS = {
  italian: 'Italienische Partie',
  london: 'Londoner System',
  scotch: 'Schottische Partie',
  'queens-gambit': 'Damengambit',
  vienna: 'Wiener Partie',
  scandinavian: 'Skandinavisch',
  'e5-black': 'Offene Spiele mit 1…e5',
  'caro-kann': 'Caro-Kann',
  sicilian: 'Sizilianisch',
};

function recommendOpenings(style, level) {
  const strong = (level ?? 1) >= 3;
  const ids =
    style === 'attack'
      ? ['italian', 'vienna', strong ? 'sicilian' : 'scandinavian']
      : style === 'solid'
        ? ['london', 'queens-gambit', 'caro-kann']
        : style === 'tactical'
          ? ['scotch', 'vienna', strong ? 'sicilian' : 'e5-black']
          : ['italian', 'london', 'e5-black'];
  return ids.map((id) => ({ id, name: OPENINGS[id] }));
}

const STEPS = ['welcome', 'name', 'experience', 'level', 'frequency', 'goals', 'weak', 'style', 'minutes', 'coach', 'summary'];
const QUESTIONS = STEPS.length - 2;

const EYEBROW = {
  name: 'Über dich',
  experience: 'Über dich',
  level: 'Dein Niveau',
  frequency: 'Dein Alltag',
  goals: 'Deine Ziele',
  weak: 'Deine Baustellen',
  style: 'Dein Stil',
  minutes: 'Dein Alltag',
  coach: 'Dein Coach',
};

const minuteHint = (m) =>
  m == null
    ? 'Lieber kurz und jeden Tag als lang und selten.'
    : m <= 10
      ? 'Perfekt für unterwegs – kurz, aber jeden Tag.'
      : m <= 20
        ? 'Der Sweet Spot: spürbarer Fortschritt jede Woche.'
        : m <= 30
          ? 'Ernsthaftes Training – inklusive Probepartie.'
          : 'Volle Kraft – du wirst schnell besser.';

const validElo = (v) => {
  const e = parseInt(v, 10);
  return Number.isFinite(e) && e >= 100 && e <= 3300 ? e : null;
};

function mergedGoals(a) {
  const g = new Set(a.goals);
  for (const w of a.weaknesses) if (WEAK_TO_GOAL[w]) g.add(WEAK_TO_GOAL[w]);
  if (a.level === 0) g.add('basics');
  return GOALS.map((x) => x.id).filter((id) => g.has(id));
}

function initialAnswers(s) {
  const p = s.profile || {};
  const sv = p.survey || null;
  const known = !!sv || !!p.onboarded; // schon mal eingerichtet → vorbelegen
  return {
    name: p.name || '',
    experience: sv?.experience ?? null,
    level: known && Number.isInteger(p.level) ? p.level : null,
    elo: p.elo ? String(p.elo) : '',
    platform: sv?.platform ?? null,
    frequency: sv?.frequency ?? null,
    goals: known && Array.isArray(p.goals) ? p.goals.filter((g) => GOALS.some((x) => x.id === g)) : [],
    weaknesses: Array.isArray(sv?.weaknesses) ? [...sv.weaknesses] : [],
    style: sv?.style ?? null,
    minutes: known && MINUTES.includes(p.minutes) ? p.minutes : null,
    coach: sv?.coach ?? null,
  };
}

function isValid(id, a) {
  switch (id) {
    case 'experience':
      return a.experience != null;
    case 'level':
      return a.level != null && (a.level < 2 || !a.elo || validElo(a.elo) != null);
    case 'frequency':
      return a.frequency != null;
    case 'goals':
      return a.goals.length > 0;
    case 'weak':
      return a.weaknesses.length > 0;
    case 'style':
      return a.style != null;
    case 'minutes':
      return a.minutes != null;
    case 'coach':
      return a.coach != null;
    default:
      return true;
  }
}

// ---------- Eigene kleine Symbole (unabhängig vom Icon-Set der App) ----------

const GLYPHS = {
  next: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  check: 'M5 12.5 10 17.5 19.5 7',
  clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4.5V12l3 2',
  question: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.6v.1',
  chat: 'M20.5 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.4A8 8 0 1 1 20.5 11.5zM8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01',
  alert: 'M12 4 2.8 19.5h18.4zM12 10v4m0 2.8v.1',
  play: 'M8 5.5v13l10.5-6.5z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  chip: 'M7 7h10v10H7zM10 3v4m4-4v4M10 17v4m4-4v4M3 10h4m-4 4h4M17 10h4m-4 4h4',
  wifi: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M9 16a4.5 4.5 0 0 1 6 0M12 19.5h.01',
};

function Glyph({ name, size = 20, fill = false }) {
  return html`<svg class="ob-glyph" width=${size} height=${size} viewBox="0 0 24 24" fill=${fill ? 'currentColor' : 'none'} stroke=${fill ? 'none' : 'currentColor'}
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${GLYPHS[name]} /></svg>`;
}

function OptIcon({ piece, glyph }) {
  if (piece) return html`<span class="ob-ico"><${PieceIcon} p=${piece} size=${30} /></span>`;
  if (glyph) return html`<span class="ob-ico glyph"><${Glyph} name=${glyph} size=${22} fill=${glyph === 'play'} /></span>`;
  return null;
}

function CountUp({ to, ms = 1000, delay = 0, still }) {
  const [v, setV] = useState(still ? to : 0);
  useEffect(() => {
    if (still) {
      setV(to);
      return undefined;
    }
    let raf = 0;
    const t = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [to]);
  return html`<span class="ob-num">${v}</span>`;
}

const FLOATERS = [
  { p: 'wN', x: 7, y: 16, s: 84, d: 0, r: -12 },
  { p: 'wQ', x: 83, y: 10, s: 70, d: 1.4, r: 10 },
  { p: 'wR', x: 88, y: 58, s: 60, d: 3.1, r: -6 },
  { p: 'wB', x: 10, y: 70, s: 58, d: 2.2, r: 14 },
  { p: 'wK', x: 66, y: 84, s: 76, d: 4.2, r: -8 },
  { p: 'wP', x: 46, y: 5, s: 42, d: 2.8, r: 0 },
  { p: 'wP', x: 30, y: 90, s: 38, d: 5.6, r: 6 },
];

// ---------- Hauptkomponente ----------

export function Onboarding() {
  const s = useStore();
  const [a, setA] = useState(() => initialAnswers(s));
  const [view, setView] = useState({ step: 0, dir: 'fwd', phase: 'in' });
  const [pop, setPopState] = useState(null);
  const popN = useRef(0);
  const setPop = (k) => setPopState(k ? { k, n: ++popN.current } : null);
  const stepRef = useRef(0);
  const aRef = useRef(a);
  const busy = useRef(false);
  const auto = useRef(null);
  const headRef = useRef(null);
  const nameRef = useRef(null);
  aRef.current = a;

  const still = s.settings?.animation === false || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const id = STEPS[view.step];
  const qIndex = Math.min(view.step, QUESTIONS);
  const progress = id === 'summary' ? 1 : view.step / (QUESTIONS + 1);
  const ok = isValid(id, a);

  const set = (patch) => setA((x) => ({ ...x, ...patch }));

  const go = (to) => {
    clearTimeout(auto.current);
    if (busy.current) return;
    const from = stepRef.current;
    if (to < 0 || to >= STEPS.length || to === from) return;
    const dir = to > from ? 'fwd' : 'back';
    stepRef.current = to;
    const enter = () => {
      setView({ step: to, dir, phase: 'in' });
      setPop(null);
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
    if (step >= STEPS.length - 1 || !isValid(STEPS[step], aRef.current)) return;
    go(step + 1);
  };
  const back = () => go(stepRef.current - 1);

  const choose = (key, value, { advance = true, delay = 380 } = {}) => {
    set({ [key]: value });
    setPop(`${key}:${value}`);
    clearTimeout(auto.current);
    if (advance) auto.current = setTimeout(next, delay);
  };

  const toggle = (key, value) => {
    setPop(`${key}:${value}`);
    setA((x) => {
      const has = x[key].includes(value);
      let list = has ? x[key].filter((v) => v !== value) : [...x[key], value];
      if (key === 'weaknesses' && !has) list = value === 'unknown' ? ['unknown'] : list.filter((v) => v !== 'unknown');
      return { ...x, [key]: list };
    });
  };

  const pickLevel = (lvl) => choose('level', lvl, { advance: lvl < 2 });

  // Fokus: Name-Feld bzw. Überschrift des neuen Screens.
  useEffect(() => {
    if (view.phase !== 'in') return;
    const t = setTimeout(() => {
      if (id === 'name' && nameRef.current) nameRef.current.focus({ preventScroll: true });
      else headRef.current?.focus({ preventScroll: true });
    }, still ? 0 : 60);
    return () => clearTimeout(t);
  }, [view.step, view.phase]);

  useEffect(() => {
    window.scrollTo(0, 0);
    return () => clearTimeout(auto.current);
  }, []);

  // Tastatur: Enter = weiter, 1–9 = Antwort wählen, Esc/Backspace = zurück.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      const step = STEPS[stepRef.current];
      if (e.key === 'Enter') {
        if (t.closest?.('[data-native]')) return;
        e.preventDefault();
        if (step === 'welcome') go(1);
        else if (step !== 'summary') next();
        return;
      }
      if (e.key === 'Escape' || (e.key === 'Backspace' && !inField)) {
        if (stepRef.current > 0) {
          e.preventDefault();
          back();
        }
        return;
      }
      if (inField || !/^[1-9]$/.test(e.key)) return;
      const i = +e.key - 1;
      const pickFrom = (list, fn) => list[i] && (e.preventDefault(), fn(list[i]));
      switch (step) {
        case 'experience':
          pickFrom(EXPERIENCE, (o) => choose('experience', o.id));
          break;
        case 'level':
          pickFrom(LEVELS, (l) => pickLevel(l.id));
          break;
        case 'frequency':
          pickFrom(FREQUENCY, (o) => choose('frequency', o.id));
          break;
        case 'goals':
          pickFrom(GOALS, (g) => toggle('goals', g.id));
          break;
        case 'weak':
          pickFrom(WEAKNESSES, (w) => toggle('weaknesses', w.id));
          break;
        case 'style':
          pickFrom(STYLES, (o) => choose('style', o.id));
          break;
        case 'minutes':
          pickFrom(MINUTES, (m) => choose('minutes', m, { delay: 700 }));
          break;
        case 'coach':
          pickFrom(COACHES, (o) => choose('coach', o.id));
          break;
        default:
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const L = LEVELS[a.level ?? 1];
  const known = (a.level ?? 0) >= 2 ? validElo(a.elo) : null;
  const goals = mergedGoals(a);
  const recs = recommendOpenings(a.style, a.level);

  const finish = (placement) => {
    clearTimeout(auto.current);
    const lvl = LEVELS[a.level ?? 1];
    location.hash = placement ? '#/puzzles/placement' : '#/';
    update((st) => {
      st.profile = {
        ...st.profile,
        onboarded: true,
        surveyV: SURVEY_VERSION,
        name: a.name.trim(),
        level: lvl.id,
        goals: mergedGoals(a),
        minutes: a.minutes ?? 15,
        elo: known,
        survey: {
          experience: a.experience,
          frequency: a.frequency,
          platform: lvl.id >= 2 ? a.platform : null,
          weaknesses: [...a.weaknesses],
          style: a.style,
          coach: a.coach,
          openings: recs.map((r) => r.id),
          at: Date.now(),
        },
      };
      if (!st.puzzle.history?.length) st.puzzle.rating = known ? Math.round(known * 0.9 + 150) : lvl.puzzle;
      if (!st.games?.length) st.play.rating = known || lvl.play;
      st.settings.coach = a.coach || 'full';
      st.plan = null;
    });
  };

  // ---------- Bausteine ----------

  // Wechselnde Klassennamen, damit die Pop-Animation bei jedem Tippen neu startet.
  const isPop = (key, value) => (pop && pop.k === `${key}:${value}` ? (pop.n % 2 ? 'pop' : 'pop2') : '');

  const head = (title, sub) => html`<div class="ob-head">
    <p class="ob-eyebrow">${EYEBROW[id]}</p>
    <h2 class="ob-title" tabindex="-1" ref=${headRef}>${title}</h2>
    ${sub ? html`<p class="ob-sub">${sub}</p>` : null}
  </div>`;

  const optList = (key, list, onPick, render) => html`<div class="ob-list" role="radiogroup">
    ${list.map((o, i) => {
      const on = a[key] === o.id;
      return html`<button type="button" key=${o.id} role="radio" aria-checked=${on} class=${`ob-opt ${on ? 'on' : ''} ${isPop(key, o.id)}`}
        style=${{ '--i': i }} onClick=${() => onPick(o)}>
        <span class="ob-opt-in">
          <span class="ob-key">${i + 1}</span>
          ${render ? render(o, i) : html`<${OptIcon} piece=${o.piece} glyph=${o.glyph} />`}
          <span class="ob-opt-text"><b>${o.title}</b>${o.sub ? html`<small>${o.sub}</small>` : null}</span>
          <span class="ob-tick"><${Glyph} name="check" size=${14} /></span>
        </span>
      </button>`;
    })}
  </div>`;

  const cardGrid = (key, list, cls = '') => html`<div class=${`ob-cards ${cls}`} role="group">
    ${list.map((o, i) => {
      const on = a[key].includes(o.id);
      return html`<button type="button" key=${o.id} aria-pressed=${on} class=${`ob-card ${on ? 'on' : ''} ${isPop(key, o.id)}`}
        style=${{ '--i': i }} onClick=${() => toggle(key, o.id)}>
        <span class="ob-card-in">
          <${OptIcon} piece=${o.icon || o.piece} glyph=${o.glyph} />
          <b>${o.name || o.title}</b>
          ${o.desc ? html`<small>${o.desc}</small>` : null}
          <span class="ob-tick"><${Glyph} name="check" size=${14} /></span>
        </span>
      </button>`;
    })}
  </div>`;

  const screens = {
    welcome: () => html`<div class="ob-hero">
      <div class="ob-hero-logo"><${Logo} /></div>
      <h1 class="ob-hero-title">Setz auf<br />deinen Kopf.</h1>
      <p class="ob-lead">Ein paar kurze Fragen – dann baut gambit dein persönliches Training: Lernpfad, Rätsel, Eröffnungen und Bots, die genau zu dir passen.</p>
      <button type="button" class="btn primary xl ob-start" data-native onClick=${() => go(1)}>Umfrage starten <${Glyph} name="next" /></button>
      <p class="ob-note"><${Glyph} name="clock" size=${15} /> Dauert ca. 1 Minute · bleibt auf deinem Gerät</p>
      <ul class="ob-features">
        <li><${Glyph} name="lock" size=${16} /> Kein Account</li>
        <li><${Glyph} name="chip" size=${16} /> Stockfish 18 im Browser</li>
        <li><${Glyph} name="wifi" size=${16} /> Läuft auch offline</li>
      </ul>
    </div>`,

    name: () => html`<div>
      ${head('Wie sollen wir dich nennen?', 'Optional – dein Name bleibt nur auf deinem Gerät.')}
      <div class="ob-field ob-rise">
        <input ref=${nameRef} class="input xl ob-name" placeholder="Dein Name" maxlength="24" autocomplete="given-name" enterkeyhint="next"
          value=${a.name} onInput=${(e) => set({ name: e.target.value })} />
        ${a.name.trim() ? html`<p class="ob-hello">Hi ${a.name.trim()}! Schön, dass du da bist.</p>` : null}
      </div>
    </div>`,

    experience: () => html`<div>
      ${head('Wie lange spielst du schon Schach?', a.name.trim() ? `Freut mich, ${a.name.trim()}! Damit wir wissen, wo wir anfangen.` : 'Damit wir wissen, wo wir anfangen.')}
      ${optList('experience', EXPERIENCE, (o) => choose('experience', o.id))}
    </div>`,

    level: () => html`<div>
      ${head('Wie gut spielst du gerade?', 'Sei ehrlich – wir passen Rätsel, Lektionen und Bots daran an.')}
      ${optList(
        'level',
        LEVELS.map((l) => ({ id: l.id, title: l.title, sub: l.sub, piece: LEVEL_PIECES[l.id] })),
        (o) => pickLevel(o.id),
      )}
      ${a.level >= 2 &&
      html`<div class="ob-extra">
        <label class="ob-label" for="ob-elo">Kennst du deine Elo? <span>optional</span></label>
        <input id="ob-elo" class=${`input ob-elo ${a.elo && validElo(a.elo) == null ? 'ob-invalid' : ''}`} inputmode="numeric" placeholder="z. B. 1150" maxlength="4"
          value=${a.elo} onInput=${(e) => set({ elo: e.target.value.replace(/\D/g, '') })} />
        ${a.elo && validElo(a.elo) == null ? html`<p class="ob-error">Bitte eine Zahl zwischen 100 und 3300 – oder leer lassen.</p>` : null}
        <p class="ob-label">Wo spielst du meistens? <span>optional</span></p>
        <div class="ob-seg" role="radiogroup">
          ${PLATFORMS.map(
            (p) => html`<button type="button" role="radio" aria-checked=${a.platform === p.id} class=${a.platform === p.id ? 'on' : ''}
              onClick=${() => set({ platform: a.platform === p.id ? null : p.id })}>${p.label}</button>`,
          )}
        </div>
      </div>`}
    </div>`,

    frequency: () => html`<div>
      ${head('Wie oft spielst du?', 'Danach richten wir Wiederholungen und Tempo aus.')}
      ${optList('frequency', FREQUENCY, (o) => choose('frequency', o.id), (o, i) =>
        html`<span class="ob-ico ob-bars" aria-hidden="true">${[0, 1, 2, 3].map((k) => html`<i class=${k <= i ? 'f' : ''} style=${{ height: `${7 + k * 4}px` }}></i>`)}</span>`,
      )}
    </div>`,

    goals: () => html`<div>
      ${head('Was willst du lernen?', 'Wähle alles, was dich interessiert.')}
      ${cardGrid('goals', GOALS)}
      <p class="ob-count">${a.goals.length ? `${a.goals.length} ${a.goals.length === 1 ? 'Bereich' : 'Bereiche'} gewählt` : 'Mindestens einen Bereich wählen'}</p>
    </div>`,

    weak: () => html`<div>
      ${head('Wo hakt es bei dir am meisten?', 'Mehrfachauswahl – genau da setzen wir an.')}
      ${cardGrid('weaknesses', WEAKNESSES, 'compact')}
      <p class="ob-count">${a.weaknesses.length ? (a.weaknesses.includes('unknown') ? 'Kein Problem – das finden wir beim Training heraus.' : `${a.weaknesses.length} gewählt`) : 'Mindestens eins wählen'}</p>
    </div>`,

    style: () => html`<div>
      ${head('Wie spielst du am liebsten?', 'Danach suchen wir Eröffnungen und Gegner für dich aus.')}
      ${optList('style', STYLES, (o) => choose('style', o.id))}
    </div>`,

    minutes: () => html`<div>
      ${head('Wie viel Zeit hast du pro Tag?', 'Dein Tagesplan passt genau in diese Zeit.')}
      <div class="ob-minutes" role="radiogroup">
        ${MINUTES.map(
          (m, i) => html`<button type="button" key=${m} role="radio" aria-checked=${a.minutes === m}
            class=${`ob-min ${a.minutes === m ? 'on' : ''} ${isPop('minutes', m)}`} style=${{ '--i': i }}
            onClick=${() => choose('minutes', m, { delay: 700 })}>
            <span class="ob-min-in"><b>${m}</b><small>Min</small></span>
          </button>`,
        )}
      </div>
      <p class="ob-hint" key=${String(a.minutes)}>${minuteHint(a.minutes)}</p>
    </div>`,

    coach: () => html`<div>
      ${head('Wie soll dein Coach sein?', 'Gilt für deine Partien gegen die Bots – jederzeit änderbar.')}
      ${optList('coach', COACHES, (o) => choose('coach', o.id))}
    </div>`,

    summary: () => {
      const puzzleStart = s.puzzle.history?.length ? s.puzzle.rating : known ? Math.round(known * 0.9 + 150) : L.puzzle;
      const playStart = s.games?.length ? s.play.rating : known || L.play;
      const weak = a.weaknesses.filter((w) => w !== 'unknown').map((w) => WEAKNESSES.find((x) => x.id === w)?.title).filter(Boolean);
      const style = STYLES.find((x) => x.id === a.style);
      const coach = COACHES.find((x) => x.id === a.coach);
      const minutes = a.minutes ?? 15;
      const mix = ['Lektionen', 'Rätsel auf deinem Niveau', 'Wiederholungen deiner Fehler'];
      if (goals.includes('openings')) mix.push('Eröffnungstraining');
      if (goals.includes('play') && minutes >= 20) mix.push('eine Probepartie mit Coach');
      const mixText = mix.length > 1 ? `${mix.slice(0, -1).join(', ')} und ${mix[mix.length - 1]}` : mix[0];
      let k = 0;
      const d = () => ({ '--i': k++ });
      return html`<div class="ob-summary">
        <div class="ob-done" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64"><circle class="ob-done-ring" cx="32" cy="32" r="29" /><path class="ob-done-check" d="M20 33.5 28.5 42 45 24" /></svg>
        </div>
        <h2 class="ob-title" tabindex="-1" ref=${headRef}>${a.name.trim() ? `${a.name.trim()}, dein` : 'Dein'} Plan steht.</h2>
        <p class="ob-sub">Gebaut aus deinen Antworten. Alles lässt sich später in den Einstellungen ändern.</p>
        <div class="ob-sum">
          <div class="ob-tile" style=${d()}><small>Niveau</small><b>${L.title}</b><span>${L.sub}</span></div>
          <div class="ob-tile" style=${d()}><small>Pro Tag</small><b><${CountUp} to=${minutes} delay=${250} still=${still} /> Min</b><span>${minuteHint(minutes)}</span></div>
          <div class="ob-tile" style=${d()}><small>Start-Rating</small>
            <div class="ob-ratings">
              <span><b><${CountUp} to=${puzzleStart} delay=${350} still=${still} /></b><em>Rätsel</em></span>
              <span><b><${CountUp} to=${playStart} delay=${450} still=${still} /></b><em>Spiel</em></span>
            </div>
          </div>
          <div class="ob-tile" style=${d()}><small>Spielstil</small><b>${style?.title || '–'}</b><span>${style?.sub || ''}</span></div>
          <div class="ob-tile wide" style=${d()}><small>Dein Fokus</small>
            <div class="ob-chips">${goals.map((g) => html`<span class="ob-chip">${GOALS.find((x) => x.id === g)?.name}</span>`)}</div>
          </div>
          <div class="ob-tile wide" style=${d()}><small>Daran arbeiten wir</small>
            ${weak.length ? html`<div class="ob-chips">${weak.map((w) => html`<span class="ob-chip">${w}</span>`)}</div>` : html`<span>Finden wir in deinen ersten Rätseln und Partien heraus.</span>`}
          </div>
          <div class="ob-tile wide" style=${d()}><small>Passende Eröffnungen</small>
            <div class="ob-chips">${recs.map((r) => html`<span class="ob-chip">${r.name}</span>`)}</div>
          </div>
          <div class="ob-tile wide" style=${d()}><small>Coach</small><b>${coach?.title || '–'}</b><span>${coach?.sub || ''}</span></div>
        </div>
        <p class="ob-mix" style=${d()}>Jeden Tag bekommst du ${mixText} – passend für ${minutes} Minuten.</p>
        <div class="ob-actions" style=${d()}>
          ${(a.level ?? 1) >= 1 &&
          html`<button type="button" class="btn secondary xl" data-native onClick=${() => finish(true)}><${Glyph} name="bolt" fill /> Einstufungstest (2 Min)</button>`}
          <button type="button" class="btn primary xl" data-native onClick=${() => finish(false)}>Training starten <${Glyph} name="next" /></button>
        </div>
        <button type="button" class="ob-link" data-native onClick=${() => go(1)}>Antworten ändern</button>
      </div>`;
    },
  };

  const nextLabel = id === 'name' && !a.name.trim() ? 'Ohne Namen weiter' : id === 'coach' ? 'Plan erstellen' : 'Weiter';
  const anim = view.phase === 'out' ? `out-${view.dir}` : `in-${view.dir}`;

  return html`<div class=${`ob ${id === 'welcome' ? 'ob-at-welcome' : ''} ${still ? 'ob-still' : ''}`}>
    <div class="ob-bg" aria-hidden="true">
      <div class="ob-grid"></div>
      <div class="ob-glow"></div>
      ${FLOATERS.map(
        (f, i) => html`<span class="ob-float" style=${{ left: `${f.x}%`, top: `${f.y}%`, '--s': `${f.s}px`, '--d': `${f.d}s`, '--r': `${f.r}deg`, '--n': i }}>
          <span class=${`piece-icon piece ${f.p}`}></span>
        </span>`,
      )}
    </div>

    ${id !== 'welcome' &&
    html`<header class="ob-top">
      <button type="button" class="ob-back" aria-label="Zurück" data-native onClick=${back}><${Glyph} name="back" size=${18} /></button>
      <div class="ob-track" role="progressbar" aria-valuemin="0" aria-valuemax=${QUESTIONS} aria-valuenow=${id === 'summary' ? QUESTIONS : qIndex - 1}>
        <div class="ob-fill" style=${{ transform: `scaleX(${Math.max(0.02, progress)})` }}></div>
      </div>
      <span class="ob-step">${id === 'summary' ? 'Fertig' : `Frage ${qIndex} von ${QUESTIONS}`}</span>
    </header>`}

    <main class=${`ob-main ${id === 'welcome' ? 'center' : ''}`}>
      <section key=${view.step} class=${`ob-screen ${anim} s-${id}`}>${screens[id]()}</section>
    </main>

    ${id !== 'welcome' &&
    id !== 'summary' &&
    html`<nav class="ob-nav">
      <button type="button" class="btn ghost ob-nav-back" data-native onClick=${back}><${Glyph} name="back" size=${18} /> Zurück</button>
      <button type="button" class="btn primary ob-nav-next" data-native disabled=${!ok} onClick=${next}>${nextLabel} <${Glyph} name="next" size=${18} /></button>
    </nav>`}
  </div>`;
}
