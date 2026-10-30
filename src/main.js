// Einstieg: Router, App-Rahmen, Zeitmessung.
import { html, render, useEffect, useState } from '../vendor/preact-htm.js';
import { useStore, update, today, todayView, streakNow, rankFor, storageOk, state, SURVEY_VERSION } from './lib/store.js';
import { loadContent } from './lib/content.js';
import { Icon, Logo, Toasts, Ring } from './ui/kit.js';
import { Onboarding } from './views/Onboarding.js';
import { Tutorial } from './views/Tutorial.js';
import { Home } from './views/Home.js';
import { Learn } from './views/Learn.js';
import { LessonView } from './views/Lesson.js';
import { PuzzleHub, PuzzleTrainer } from './views/Puzzles.js';
import { Play } from './views/Play.js';
import { GameReview } from './views/Review.js';
import { Openings, OpeningTrainer } from './views/Openings.js';
import { Analysis } from './views/Analysis.js';
import { Progress } from './views/Progress.js';
import { Settings } from './views/Settings.js';

const NAV = [
  { href: '#/', icon: 'home', label: 'Start' },
  { href: '#/learn', icon: 'path', label: 'Lernpfad' },
  { href: '#/puzzles', icon: 'puzzle', label: 'Rätsel' },
  { href: '#/play', icon: 'play', label: 'Spielen' },
  { href: '#/progress', icon: 'chart', label: 'Fortschritt' },
  { href: '#/openings', icon: 'book', label: 'Eröffnungen' },
  { href: '#/analysis', icon: 'scope', label: 'Analyse' },
  { href: '#/settings', icon: 'gear', label: 'Einstellungen' },
];
// Unten auf dem Handy: Start, Rätsel, Spielen, Fortschritt + „Mehr“.
const TABS = [NAV[0], NAV[2], NAV[3], NAV[4]];
const MORE = [NAV[1], NAV[5], NAV[6], NAV[7]];


const parseHash = () => {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: new URLSearchParams(query), raw: path || '/' };
};

function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    let page = parseHash().parts[0] || '';
    const on = () => {
      const next = parseHash();
      const go = () => {
        setR(next);
        window.scrollTo(0, 0);
      };
      // Weicher Übergang nur beim Wechsel zwischen Bereichen (nicht bei jedem Zug im Analysebrett).
      const changed = (next.parts[0] || '') !== page;
      page = next.parts[0] || '';
      const calm = state.settings.animation === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (changed && !calm && document.startViewTransition) {
        try {
          document.startViewTransition(() => new Promise((done) => {
            go();
            setTimeout(done, 30);
          }));
          return;
        } catch {}
      }
      go();
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

const TRAINING = new Set(['lesson', 'puzzles', 'play', 'review', 'opening', 'analysis', 'openings']);

// Aktive Lernzeit zählen: nur sichtbar, nur bei Interaktion in der letzten Minute.
let lastInput = Date.now();
['pointerdown', 'keydown', 'wheel'].forEach((e) => addEventListener(e, () => (lastInput = Date.now()), { passive: true }));
setInterval(() => {
  const first = parseHash().parts[0];
  if (document.visibilityState !== 'visible' || Date.now() - lastInput > 60e3 || !TRAINING.has(first)) return;
  update((s) => {
    today(s).seconds += 15;
  });
}, 15e3);

// Wie eine App: Festhalten soll nichts markieren, kein Kopieren-Menü öffnen
// und keine Figur, kein Bild und keinen Link als „Kopie“ herausziehen.
const editable = (t) => {
  const el = t && t.nodeType === 3 ? t.parentElement : t;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], .selectable');
};
const touchDevice = matchMedia('(hover: none), (pointer: coarse)');
addEventListener('dragstart', (e) => {
  if (!editable(e.target)) e.preventDefault();
});
addEventListener('selectstart', (e) => {
  if (!editable(e.target)) e.preventDefault();
});
addEventListener('contextmenu', (e) => {
  if (touchDevice.matches && !editable(e.target)) e.preventDefault();
});

// Leiste unten (Handy & iPad hochkant): beim Runterscrollen ausblenden, beim Hochscrollen
// und ganz oben wieder zeigen. Abschaltbar in den Einstellungen.
const smallScreen = matchMedia('(max-width: 900px)');
function useBarHidden(enabled, routeKey, pinned) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => setHidden(false), [routeKey]);
  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    let lastY = Math.max(0, scrollY);
    let run = 0;
    let raf = 0;
    const check = () => {
      raf = 0;
      const y = Math.max(0, scrollY);
      const dy = y - lastY;
      lastY = y;
      if (!smallScreen.matches || y < 48) {
        run = 0;
        setHidden(false);
        return;
      }
      if (!dy) return;
      if (Math.sign(dy) !== Math.sign(run)) run = 0;
      run += dy;
      if (run > 28) setHidden(true);
      else if (run < -18) setHidden(false);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);
  const on = enabled && hidden && !pinned;
  useEffect(() => {
    document.documentElement.classList.toggle('bar-hidden', on);
  }, [on]);
  useEffect(() => () => document.documentElement.classList.remove('bar-hidden'), []);
  return on;
}

function TopBar({ s }) {
  const d = todayView();
  const goal = s.profile.minutes * 60;
  const streak = streakNow(s);
  const rank = rankFor(s.xp);
  return html`<header class="topbar">
    <div class="topbar-logo"><${Logo} small /></div>
    <div class="topbar-stats">
      <a href="#/progress" class=${`chip streak ${streak ? 'on' : ''}`} title="Tage in Folge"><${Icon} name="flame" size=${16} /> ${streak}</a>
      <a href="#/progress" class="chip" title="Rätsel-Rating"><${Icon} name="puzzle" size=${15} /> ${s.puzzle.rating}</a>
      <a href="#/progress" class="chip rank" style=${{ '--rank': rank.color }} title=${`Rang: ${rank.name}`}>
        <span class=${`piece-icon piece ${rank.icon}`}></span><span class="hide-sm">${rank.name}</span>
      </a>
      <a href="#/" class="chip goal" title="Tagesziel">
        <${Ring} value=${d.seconds / goal} size=${24} stroke=${3.5}><span></span><//>
        <span>${Math.floor(d.seconds / 60)}/${s.profile.minutes} Min</span>
      </a>
    </div>
  </header>`;
}

function Shell({ route, children }) {
  const s = useStore();
  const [more, setMore] = useState(false);
  const first = '#/' + (route.parts[0] || '');
  const active = (href) => (href === '#/' ? first === '#/' : first.startsWith(href.replace(/s$/, '')));
  const moreActive = MORE.some((n) => active(n.href));
  useEffect(() => setMore(false), [route.raw]);
  useBarHidden(s.settings.hideBar !== false, route.raw, more);
  return html`<div class="shell">
    <aside class="sidebar">
      <div class="sidebar-logo"><${Logo} /></div>
      <nav>
        ${NAV.map((n) => html`<a href=${n.href} title=${n.label} class=${`nav-item ${active(n.href) ? 'active' : ''}`}><${Icon} name=${n.icon} /><span>${n.label}</span></a>`)}
      </nav>
      <div class="sidebar-foot">
        <p>Kein Account. Dein Fortschritt bleibt auf diesem Gerät.</p>
        <a href="#/settings" class="link">Backup erstellen →</a>
      </div>
    </aside>
    <div class="main">
      <${TopBar} s=${s} />
      ${!storageOk ? html`<div class="banner danger">Speichern ist in diesem Browser blockiert (privater Modus?). Dein Fortschritt geht beim Schließen verloren.</div>` : null}
      <main class="content">${children}</main>
    </div>
    ${more &&
    html`<div class="more-backdrop" onClick=${() => setMore(false)}></div>
      <nav class="more-sheet" aria-label="Weitere Bereiche">
        ${MORE.map((n) => html`<a href=${n.href} class=${active(n.href) ? 'active' : ''} onClick=${() => setMore(false)}><${Icon} name=${n.icon} /><span>${n.label}</span></a>`)}
      </nav>`}
    <nav class="tabbar">
      ${TABS.map((n) => html`<a href=${n.href} class=${active(n.href) && !more ? 'active' : ''}><${Icon} name=${n.icon} size=${22} /><span>${n.label}</span></a>`)}
      <button class=${moreActive || more ? 'active' : ''} onClick=${() => setMore(!more)} aria-expanded=${more}><${Icon} name="grid" size=${22} /><span>Mehr</span></button>
    </nav>
  </div>`;
}

function App() {
  const s = useStore();
  useEffect(() => {
    const t = s.settings.appTheme || 'graphit';
    document.documentElement.dataset.apptheme = t;
    const bg = { graphit: '#0a0a0b', oled: '#000000', mitternacht: '#070a12', espresso: '#0d0a08', nebel: '#121316' }[t] || '#0a0a0b';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg);
  }, [s.settings.appTheme]);
  const route = useRoute();
  useEffect(() => {
    loadContent();
  }, []);
  if (!s.profile.onboarded || (s.profile.surveyV || 0) < SURVEY_VERSION) return html`<${Onboarding} /><${Toasts} />`;
  if (!s.profile.tutorialDone) return html`<${Tutorial} /><${Toasts} />`;
  const [a, b] = route.parts;
  let view;
  switch (a) {
    case undefined:
      view = html`<${Home} />`;
      break;
    case 'learn':
      view = html`<${Learn} />`;
      break;
    case 'lesson':
      view = html`<${LessonView} key=${b} id=${b} />`;
      break;
    case 'puzzles':
      view = b ? html`<${PuzzleTrainer} key=${route.raw} mode=${b} query=${route.query} />` : html`<${PuzzleHub} />`;
      break;
    case 'play':
      view = html`<${Play} key=${route.raw + route.query} query=${route.query} />`;
      break;
    case 'review':
      view = html`<${GameReview} key=${b} id=${b} />`;
      break;
    case 'openings':
      view = html`<${Openings} />`;
      break;
    case 'opening':
      view = html`<${OpeningTrainer} key=${route.raw + route.query} id=${b} query=${route.query} />`;
      break;
    case 'analysis':
      view = html`<${Analysis} key=${route.query.toString()} query=${route.query} />`;
      break;
    case 'progress':
    case 'profile':
      view = html`<${Progress} />`;
      break;
    case 'settings':
      view = html`<${Settings} />`;
      break;
    default:
      view = html`<${Home} />`;
  }
  const focus = a === 'lesson' || (a === 'puzzles' && b === 'placement');
  return html`${focus ? html`<div class="focus-shell">${view}</div>` : html`<${Shell} route=${route}>${view}<//>`}<${Toasts} focus=${focus} />`;
}

render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
