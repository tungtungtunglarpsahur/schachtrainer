// Startseite: Tagesplan, Fortschritt und Schnellstart-Kacheln.
import { html } from '../../vendor/preact-htm.js';
import { useStore, todayView, streakNow, rankFor, saveSoon, eloOf, update } from '../lib/store.js';
import { useContent, TRACKS, THEME_GROUPS, themeName } from '../lib/content.js';
import { todayPlan, taskProgress, buildPath, nextLessons } from '../lib/progress.js';
import { Icon, Ring, Bar, PieceIcon, Spinner } from '../ui/kit.js';
import { dueMistakes } from '../lib/mistakes.js';
import { useNet } from '../lib/online.js';
import { intensiveActive, goalMinutes, planDay, dayBlock } from '../lib/intensive.js';
import { taskInfo } from '../lib/plan-info.js';

// Aus der Einstiegs-Umfrage: „Wo hakt es?“ → passende Trainings.
const FOCUS = {
  blunders: { href: '#/puzzles/theme-hang', lesson: 'strategy-blundercheck', title: 'Nichts mehr einstellen', sub: 'Hängende Figuren sehen – bei dir und beim Gegner', icon: 'wR' },
  tactics: { href: '#/puzzles/theme-fork', lesson: 'tactics-fork', title: 'Taktik-Blick', sub: 'Gabeln, Fesselungen, Abzüge', icon: 'wN' },
  strategy: { href: '#/learn', lesson: 'strategy-worst-piece', title: 'Pläne finden', sub: 'Strategie im Lernpfad', icon: 'wB' },
  openings: { href: '#/openings', lesson: 'strategy-develop', title: 'Dein Repertoire', sub: 'Eröffnungen verstehen statt auswendig lernen', icon: 'wB' },
  endgames: { href: '#/puzzles/theme-end', lesson: 'end-king-active', title: 'Endspiele gewinnen', sub: 'Technik, die Punkte bringt', icon: 'wK' },
  mates: { href: '#/puzzles/theme-m2', lesson: 'mates-backrank', title: 'Mattsetzen', sub: 'Mattbilder erkennen und ausführen', icon: 'wQ' },
  time: { href: '#/puzzles/rush', title: 'Schneller rechnen', sub: 'Rätsel-Rush gegen die Uhr', icon: 'wQ' },
};

// Hinweis auf Neuerungen – einmal wegklicken, dann bis zur nächsten Version weg.
const NEWS = '2.4';

// Schnellstart: kompakt, alles mit einem Tipp erreichbar.
const QUICK = [
  { href: '#/puzzles/train', title: 'Rätsel', sub: 'Passend zu deinem Rating', icon: 'wN' },
  { href: '#/puzzles/rush', title: 'Rätsel-Rush', sub: '3 Minuten Vollgas', icon: 'wQ' },
  { href: '#/vision', title: 'Sehtraining', sub: 'Brettblick in 60 s', icon: 'wR' },
  { href: '#/learn', title: 'Lernpfad', sub: 'Lektionen Schritt für Schritt', icon: 'wP' },
  { href: '#/play', title: 'Partie mit Coach', sub: 'Gegen Bots von 400–3000', icon: 'bK' },
  { href: '#/online', title: 'Online spielen', sub: 'Echte Gegner, echte Elo', icon: 'wK' },
  { href: '#/openings', title: 'Eröffnungen', sub: 'Gute erste Züge', icon: 'wB' },
  { href: '#/puzzles/mine', title: 'Partie-Fehler', sub: 'Aus deinen Partien', icon: 'bQ' },
];

const DAY = 864e5;
const weekMinutes = (s) => {
  let sec = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    sec += s.days[k]?.seconds || 0;
  }
  return Math.round(sec / 60);
};

export function GameTile({ href, title, sub, art, badge, icon }) {
  return html`<a href=${href} class=${`tile art-${art}`}>
    ${badge && html`<span class="tile-badge">${badge}</span>`}
    <span class="tile-piece"><${PieceIcon} p=${icon} size=${74} /></span>
    <span class="tile-text"><b>${title}</b><small>${sub}</small></span>
  </a>`;
}

export function QuickTile({ href, title, sub, icon, badge, hot }) {
  return html`<a href=${href} class=${`quick ${hot ? 'hot' : ''}`}>
    <span class="quick-ico"><${PieceIcon} p=${icon} size=${30} /></span>
    <span class="quick-text"><b>${title}</b><small>${sub}</small></span>
    ${badge ? html`<span class="quick-badge">${badge}</span>` : null}
  </a>`;
}

export function Home() {
  const s = useStore();
  const n = useNet();
  const content = useContent();
  if (!content) return html`<${Spinner} />`;
  const before = s.plan;
  const plan = todayPlan(content, s);
  if (plan !== before) saveSoon();
  const d = todayView();
  const intensive = intensiveActive(s);
  const goalMin = goalMinutes(s);
  const goalPct = d.seconds / (goalMin * 60);
  const streak = streakNow(s);
  const rank = rankFor(eloOf(s));
  const items = plan.tasks.map((t) => ({ t, info: taskInfo(t, content), p: taskProgress(t, s, plan) }));
  const nextItem = items.find((x) => x.p < 1);
  const done = items.filter((x) => x.p >= 1).length;
  const path = buildPath(content, s.profile);
  const upcoming = nextLessons(path, s, 4);
  const mineDue = dueMistakes(s).length;
  // Fokus aus der Umfrage: zuerst die passende Lektion (solange offen), danach die Rätsel zum Thema.
  const focus = (s.profile.survey?.weaknesses || [])
    .map((w) => FOCUS[w])
    .filter(Boolean)
    .slice(0, 3)
    .map((f) => {
      const l = f.lesson && content.lessonById[f.lesson];
      return l && !s.lessons[l.id]?.done ? { ...f, href: `#/lesson/${l.id}`, sub: `Lektion: ${l.title}` } : f;
    });
  const hour = new Date().getHours();
  const hi = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hi' : 'Guten Abend';
  const allDone = done === items.length && items.length > 0;
  const day = intensive ? planDay(s.intensive) : -1;
  const block = intensive ? dayBlock(s.intensive.days, day) : null;
  const totalMin = items.reduce((a, x) => a + (x.info.min || 0), 0);

  return html`<div class="page home">
    <section class=${`hero-card home-hero ${intensive ? 'is-intensive' : ''}`}>
      <div class="hero-left">
        ${intensive
          ? html`<a class="eyebrow int-eyebrow" href="#/intensive"><${Icon} name="bolt" size=${15} /> Intensiv-Plan · Tag ${day + 1} von ${s.intensive.days}</a>`
          : html`<p class="eyebrow">${hi}${s.profile.name ? `, ${s.profile.name}` : ''} 👋</p>`}
        <h1>${allDone ? 'Tagesziel geschafft!' : intensive ? block.title : 'Dein Training für heute'}</h1>
        <p class="muted hero-sub">${intensive && !allDone ? block.goal : `${items.length} Aufgabe${items.length === 1 ? '' : 'n'} · ca. ${Math.max(goalMin, totalMin)} Min · ${done}/${items.length} erledigt`}</p>
        ${intensive &&
        html`<div class="int-strip" aria-label="Tage im Plan">
          ${Array.from({ length: s.intensive.days }, (_, i) => html`<i class=${i < day ? 'past' : i === day ? 'now' : ''}></i>`)}
        </div>`}
        ${nextItem
          ? html`<a class="btn primary xl hero-go" href=${nextItem.info.href}><${Icon} name="play" /> <span>${done ? 'Weiter' : 'Jetzt starten'}: ${nextItem.info.title}</span></a>`
          : html`<a class="btn primary xl hero-go" href="#/puzzles/train"><${Icon} name="bolt" /> <span>Bonus-Runde: Rätsel</span></a>`}
      </div>
      <div class="hero-right">
        <${Ring} value=${goalPct} size=${118} stroke=${11}>
          <b>${Math.floor(d.seconds / 60)}</b><small>von ${goalMin} Min</small>
        <//>
        <div class="hero-stats">
          <div class=${`hs ${streak ? 'fire' : ''}`}><${Icon} name="flame" /><b>${streak}</b><small>${streak === 1 ? 'Tag' : 'Tage'}</small></div>
          <div class="hs"><${Icon} name="star" /><b>${d.xp}</b><small>XP heute</small></div>
        </div>
      </div>
    </section>

    ${s.settings.newsSeen !== NEWS && s.xp > 0 &&
    html`<section class="card news-card">
      <button class="news-x" aria-label="Ausblenden" onClick=${() => update((st) => { st.settings.newsSeen = NEWS; })}><${Icon} name="x" size=${16} /></button>
      <small class="tag">Neu in Learning King</small>
      <b>Lernpfad mit Mattbildern, Taktik, Strategie und Endspielen – plus Intensiv-Plan und Sehtraining.</b>
      <div class="btn-row">
        <a class="btn secondary sm" href="#/learn"><${Icon} name="path" size=${16} /> Lernpfad</a>
        <a class="btn ghost sm" href="#/intensive"><${Icon} name="bolt" size=${16} /> Intensiv-Plan</a>
        <a class="btn ghost sm" href="#/vision"><${Icon} name="eye" size=${16} /> Sehtraining</a>
      </div>
    </section>`}
    ${n.game &&
    html`<a class="banner resume" href=${`#/online/game/${n.game.id}`}><${Icon} name="play" /> <span><b>Online-Partie gegen ${n.game.vs}</b> läuft – tippen zum Weiterspielen.</span></a>`}
    ${!s.profile.placementDone &&
    html`<a class="banner resume" href="#/play?test=1"><${Icon} name="bolt" /> <span><b>Mach dein Testspiel</b> (ca. 5 Min) – danach weißt du, wie stark du wirklich spielst.</span></a>`}
    ${mineDue > 0 &&
    html`<a class="banner resume" href="#/puzzles/mine"><${Icon} name="repeat" /> <span><b>${mineDue} Stellung${mineDue === 1 ? '' : 'en'} aus deinen Partien</b> ${mineDue === 1 ? 'wartet' : 'warten'} auf Revanche – finde diesmal den besten Zug.</span></a>`}

    <section>
      <div class="section-head"><h2>${intensive ? 'Heute im Intensiv-Plan' : 'Dein Plan für heute'}</h2><a href=${intensive ? '#/intensive' : '#/settings'} class="link">${intensive ? 'Alle Tage' : 'Plan ändern'}</a></div>
      <div class="task-list">
        ${items.map(
          ({ info, p }, i) => html`<a href=${info.href} class=${`task ${p >= 1 ? 'done' : ''} ${nextItem && info === nextItem.info ? 'next' : ''}`}>
            <span class="task-num">${i + 1}</span>
            <span class="task-ico"><${PieceIcon} p=${info.icon} size=${34} /></span>
            <span class="task-body"><small class="tag">${info.tag} · ${info.min} Min</small><b>${info.title}</b><small>${info.sub}</small>
              ${p > 0 && p < 1 ? html`<${Bar} value=${p} />` : null}</span>
            <span class="task-state">${p >= 1 ? html`<${Icon} name="check" />` : html`<${Icon} name="next" />`}</span>
          </a>`,
        )}
      </div>
    </section>

    ${!intensive &&
    s.profile.level >= 1 &&
    html`<a class="card int-promo" href="#/intensive">
      <span class="int-promo-ico"><${Icon} name="bolt" size=${22} /></span>
      <span class="int-promo-text"><b>Turnier in ein paar Tagen?</b><small>Der Intensiv-Plan holt in 3, 5 oder 7 Tagen das Maximum raus – jeden Tag ein Schwerpunkt.</small></span>
      <span class="btn secondary">Plan erstellen</span>
    </a>`}

    ${focus.length > 0 &&
    html`<section>
      <div class="section-head"><h2>Dein Fokus</h2><span class="muted small">aus deiner Umfrage</span></div>
      <div class="quick-grid">${focus.map((t) => html`<${QuickTile} href=${t.href} title=${t.title} sub=${t.sub} icon=${t.icon} hot />`)}</div>
    </section>`}

    <section>
      <div class="section-head"><h2>Schnell trainieren</h2></div>
      <div class="quick-grid">${QUICK.map((t) => html`<${QuickTile} ...${t} badge=${t.href === '#/puzzles/mine' && mineDue ? String(mineDue) : t.href === '#/online' && n.invites.length ? String(n.invites.length) : null} />`)}</div>
    </section>

    <section class="two-col">
      <div class="card">
        <div class="section-head"><h3>Als Nächstes im Lernpfad</h3><a href="#/learn" class="link">Alles ansehen</a></div>
        ${upcoming.length
          ? upcoming.map((l) => {
              const u = content.unitById[l.unit];
              return html`<a class="row-link" href=${`#/lesson/${l.id}`}><${PieceIcon} p=${u?.icon || 'wP'} size=${28} /><span><b>${l.title}</b><small>${u?.title} · ${l.minutes} Min</small></span><${Icon} name="next" /></a>`;
            })
          : html`<p class="muted">Du hast alle Lektionen durch. Respekt! 🏆</p>`}
      </div>
      <a class="card rank-card home-progress" href="#/progress" style=${{ '--rank': rank.color }}>
        <div class="section-head"><h3>Dein Fortschritt</h3><span class="link">Alles ansehen <${Icon} name="next" size=${14} /></span></div>
        <div class="rank-row"><${PieceIcon} p=${rank.icon} size=${54} /><div><b>${rank.name}</b><small>${rank.next ? `${eloOf(s)} Elo · noch ${rank.toNext} bis ${rank.next.name}` : `${eloOf(s)} Elo · höchster Rang`}</small></div></div>
        <${Bar} value=${rank.progress} color=${rank.color} />
        <div class="mini-stats">
          <div><small>Wertung</small><b>${s.play.rating}</b></div>
          <div><small>Rätsel</small><b>${s.puzzle.rating}</b></div>
          <div><small>Diese Woche</small><b>${weekMinutes(s)} min</b></div>
        </div>
      </a>
    </section>
  </div>`;
}

export { THEME_GROUPS };
