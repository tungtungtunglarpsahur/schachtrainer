// Einstieg: Router, App-Rahmen, Zeitmessung.
import { html, render, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import { useStore, update, today, todayView, streakNow, rankFor, storageOk, state, SURVEY_VERSION, eloOf } from './lib/store.js';
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
import { InstallGuide } from './views/Install.js';
import { OnlineHub, JoinView, InvitePopup } from './views/Online.js';
import { OnlineGame } from './views/OnlineGame.js';
import { VisionHub, VisionDrill } from './views/Vision.js';
import { Intensive } from './views/Intensive.js';
import { Notes } from './views/Notes.js';
import { goalMinutes } from './lib/intensive.js';
import { useNet } from './lib/online.js';
import { isIOS, isStandalone } from './lib/device.js';

const NAV = [
  { href: '#/', icon: 'home', label: 'Start' },
  { href: '#/learn', icon: 'path', label: 'Lernpfad' },
  { href: '#/puzzles', icon: 'puzzle', label: 'Rätsel' },
  { href: '#/play', icon: 'play', label: 'Spielen' },
  { href: '#/online', icon: 'globe', label: 'Online' },
  { href: '#/intensive', icon: 'bolt', label: 'Intensiv-Plan' },
  { href: '#/vision', icon: 'eye', label: 'Sehtraining' },
  { href: '#/notes', icon: 'pen', label: 'Merkzettel' },
  { href: '#/progress', icon: 'chart', label: 'Fortschritt' },
  { href: '#/openings', icon: 'book', label: 'Eröffnungen' },
  { href: '#/analysis', icon: 'scope', label: 'Analyse' },
  { href: '#/settings', icon: 'gear', label: 'Einstellungen' },
];
// Unten auf dem Handy: Start, Rätsel, Spielen, Online + „Mehr“.
const TABS = [NAV[0], NAV[2], NAV[3], NAV[4]];
const MORE = [NAV[1], NAV[5], NAV[6], NAV[7], NAV[8], NAV[9], NAV[10], NAV[11]];


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
      // In eine Online-Partie ohne Überblendung: währenddessen nimmt die Seite keine Tipps an,
      // und der erste Zug soll sofort gehen.
      const toGame = next.parts[0] === 'online' && next.parts[1] === 'game';
      if (changed && !calm && !toGame && document.startViewTransition) {
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

const TRAINING = new Set(['lesson', 'puzzles', 'play', 'review', 'opening', 'analysis', 'openings', 'online', 'vision']);

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
// Kein Reinzoomen mit zwei Fingern (iPhone/iPad melden das als „gesture“-Ereignis).
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(t, (e) => e.preventDefault(), { passive: false });
addEventListener(
  'touchmove',
  (e) => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

// Leiste unten (Handy & iPad hochkant): wird beim Runterscrollen Stück für Stück durchsichtiger,
// bis sie ganz verschwindet – beim Hochscrollen genauso wieder zurück. Ganz oben ist sie immer da.
// Direkt an die Scroll-Position gekoppelt (keine Animation, die abläuft), deshalb absolut ruhig.
const smallScreen = matchMedia('(max-width: 900px)');
const calmMotion = matchMedia('(prefers-reduced-motion: reduce)');
const FADE_DIST = 160; // so viele Pixel Scrollen von ganz sichtbar bis unsichtbar
function useBarFade(enabled, routeKey, pinned, bar) {
  const v = useRef(1);
  const pin = useRef(pinned);
  pin.current = pinned;
  const apply = (val) => {
    v.current = val;
    const el = bar.current;
    if (!el) return;
    const full = val >= 0.999;
    el.style.opacity = full ? '' : val.toFixed(3);
    el.style.transform = full || calmMotion.matches ? '' : `translate3d(0, ${((1 - val) * 12).toFixed(2)}px, 0)`;
    el.classList.toggle('faded', val < 0.25);
  };
  useEffect(() => apply(1), [routeKey]);
  useEffect(() => {
    if (pinned) apply(1);
  }, [pinned]);
  useEffect(() => {
    if (!enabled) {
      apply(1);
      return;
    }
    let lastY = Math.max(0, scrollY);
    let raf = 0;
    const tick = () => {
      raf = 0;
      const y = Math.max(0, scrollY);
      const dy = y - lastY;
      lastY = y;
      if (!smallScreen.matches || pin.current) return apply(1);
      // Runter: durchsichtiger. Hoch: sichtbarer. Nahe ganz oben: mindestens so sichtbar, wie man oben ist.
      let next = Math.min(1, Math.max(0, v.current - dy / FADE_DIST));
      next = Math.max(next, 1 - y / FADE_DIST);
      if (Math.abs(next - v.current) > 0.001) apply(next);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      apply(1);
    };
  }, [enabled]);
}

function TopBar({ s }) {
  const d = todayView();
  const goalMin = goalMinutes(s);
  const goal = goalMin * 60;
  const streak = streakNow(s);
  const rank = rankFor(eloOf(s));
  return html`<header class="topbar">
    <div class="topbar-logo"><${Logo} small /></div>
    <div class="topbar-stats">
      <a href="#/progress" class=${`chip streak ${streak ? 'on' : ''}`} title="Tage in Folge"><${Icon} name="flame" size=${16} /> ${streak}</a>
      <a href="#/progress" class="chip" title="Rätsel-Rating"><${Icon} name="puzzle" size=${15} /> ${s.puzzle.rating}</a>
      <a href="#/progress" class="chip rank" style=${{ '--rank': rank.color }} title=${`Rang: ${rank.name}`}>
        <span class=${`piece-icon piece ${rank.icon}`}></span><span class="hide-sm">${rank.name}</span>
      </a>
      <a href="#/" class="chip goal" title="Tagesziel">
        <${Ring} value=${d.seconds / goal} size=${24} stroke=${3.5}><span class="goal-min">${Math.floor(d.seconds / 60)}</span><//>
        <span>${Math.floor(d.seconds / 60)}/${goalMin} Min</span>
      </a>
    </div>
  </header>`;
}

function SidebarFoot() {
  const n = useNet();
  return html`<div class="sidebar-foot">
    ${n.user
      ? html`<p>Angemeldet als <b>${n.user.name}</b>. Dein Fortschritt wird automatisch gesichert.</p><a href="#/online" class="link">Online spielen →</a>`
      : html`<p>Mit einem kostenlosen Konto ist dein Fortschritt auf jedem Gerät da – und du spielst online.</p><a href="#/online" class="link">Konto erstellen →</a>`}
  </div>`;
}

function Shell({ route, children }) {
  const s = useStore();
  const n = useNet();
  const inv = n.invites.length;
  const badge = (href) => (href === '#/online' && inv ? html`<i class="nav-badge" aria-label=${`${inv} Einladung${inv === 1 ? '' : 'en'}`}>${inv}</i>` : null);
  const [more, setMore] = useState(false);
  const first = '#/' + (route.parts[0] || '');
  const active = (href) => (href === '#/' ? first === '#/' : first.startsWith(href.replace(/s$/, '')));
  const moreActive = MORE.some((n) => active(n.href));
  useEffect(() => setMore(false), [route.raw]);
  const barRef = useRef(null);
  useBarFade(s.settings.hideBar !== false, route.raw, more, barRef);
  return html`<div class="shell">
    <aside class="sidebar">
      <div class="sidebar-logo"><${Logo} /></div>
      <nav>
        ${NAV.map((x) => html`<a href=${x.href} title=${x.label} class=${`nav-item ${active(x.href) ? 'active' : ''}`}><${Icon} name=${x.icon} /><span>${x.label}</span>${badge(x.href)}</a>`)}
      </nav>
      <${SidebarFoot} />
    </aside>
    <div class="main">
      <${TopBar} s=${s} />
      ${!storageOk ? html`<div class="banner danger">Speichern ist in diesem Browser blockiert (privater Modus?). Dein Fortschritt geht beim Schließen verloren.</div>` : null}
      <main class="content">${children}</main>
    </div>
    ${more &&
    html`<div class="more-backdrop" onClick=${() => setMore(false)}></div>
      <nav class="more-sheet" aria-label="Weitere Bereiche">
        ${MORE.map((x) => html`<a href=${x.href} class=${active(x.href) ? 'active' : ''} onClick=${() => setMore(false)}><${Icon} name=${x.icon} /><span>${x.label}</span></a>`)}
      </nav>`}
    <nav ref=${barRef} class="tabbar">
      ${TABS.map((x) => html`<a href=${x.href} class=${active(x.href) && !more ? 'active' : ''}><${Icon} name=${x.icon} size=${22} /><span>${x.label}</span>${badge(x.href)}</a>`)}
      <button type="button" class=${moreActive || more ? 'active' : ''} onClick=${() => setMore(!more)} aria-expanded=${more}><${Icon} name="grid" size=${22} /><span>Mehr</span></button>
    </nav>
    <${InvitePopup} route=${route} />
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
  // iPhone & iPad im Browser: ganz am Anfang zeigen, wie die App auf den Home-Bildschirm kommt.
  // (Die App dort hat einen eigenen Speicher – deshalb vor der Umfrage.)
  const installFirst = isIOS && !isStandalone() && !s.profile.onboarded && !s.profile.surveyV && !s.profile.installSkipped;
  const [a, b, c] = route.parts;
  // Einladungs-Link oder laufende Online-Partie: direkt hin – Umfrage und Tutorial können warten.
  const direct = a === 'online' && (b === 'join' || b === 'game') && c;
  const gated = installFirst || !s.profile.onboarded || (s.profile.surveyV || 0) < SURVEY_VERSION || !s.profile.tutorialDone;
  if (direct && gated)
    return html`<div class="focus-shell lite-shell">
        <header class="lite-head"><${Logo} small /></header>
        <main class="content">${b === 'game' ? html`<${OnlineGame} key=${c} id=${c} />` : html`<${JoinView} key=${c} cid=${c} />`}</main>
      </div><${Toasts} focus />`;
  if (installFirst || a === 'install') return html`<${InstallGuide} first=${installFirst} /><${Toasts} />`;
  if (!s.profile.onboarded || (s.profile.surveyV || 0) < SURVEY_VERSION) return html`<${Onboarding} /><${Toasts} />`;
  if (!s.profile.tutorialDone) return html`<${Tutorial} /><${Toasts} />`;
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
    case 'vision':
      view = b ? html`<${VisionDrill} key=${b} mode=${b} />` : html`<${VisionHub} />`;
      break;
    case 'intensive':
      view = html`<${Intensive} />`;
      break;
    case 'notes':
      view = html`<${Notes} />`;
      break;
    case 'online':
      view =
        b === 'game' && c
          ? html`<${OnlineGame} key=${c} id=${c} />`
          : b === 'join' && c
          ? html`<${JoinView} key=${c} cid=${c} />`
          : html`<${OnlineHub} query=${route.query} />`;
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
