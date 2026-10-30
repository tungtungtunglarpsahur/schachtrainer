// Startseite: Tagesplan, Fortschritt und Schnellstart-Kacheln.
import { html } from '../../vendor/preact-htm.js';
import { useStore, todayView, streakNow, rankFor, saveSoon, eloOf } from '../lib/store.js';
import { useContent, TRACKS, THEME_GROUPS } from '../lib/content.js';
import { todayPlan, taskProgress, buildPath, nextLessons, duePuzzles } from '../lib/progress.js';
import { Icon, Ring, Bar, PieceIcon, Spinner } from '../ui/kit.js';
import { dueMistakes } from '../lib/mistakes.js';
import { useNet } from '../lib/online.js';

// Aus der Einstiegs-Umfrage: „Wo hakt es?“ → passende Trainings.
const FOCUS = {
  blunders: { href: '#/puzzles/theme-hang', title: 'Nichts mehr einstellen', sub: 'Hängende Figuren sehen – bei dir und beim Gegner', art: 'defense', icon: 'wR' },
  tactics: { href: '#/puzzles/theme-fork', title: 'Taktik-Blick', sub: 'Gabeln, Fesselungen, Abzüge', art: 'tactic', icon: 'wN' },
  strategy: { href: '#/learn', title: 'Pläne finden', sub: 'Strategie im Lernpfad', art: 'mix', icon: 'wB' },
  openings: { href: '#/openings', title: 'Dein Repertoire', sub: 'Eröffnungen verstehen statt auswendig lernen', art: 'open', icon: 'wB' },
  endgames: { href: '#/puzzles/theme-end', title: 'Endspiele gewinnen', sub: 'Technik, die Punkte bringt', art: 'end', icon: 'wK' },
  mates: { href: '#/puzzles/theme-m2', title: 'Mattsetzen', sub: 'Matt in 2 – Muster einschleifen', art: 'mate', icon: 'wQ' },
  time: { href: '#/puzzles/rush', title: 'Schneller rechnen', sub: 'Rätsel-Rush gegen die Uhr', art: 'rush', icon: 'wQ' },
};

function taskInfo(task, content) {
  switch (task.kind) {
    case 'lesson': {
      const l = content.lessonById[task.id];
      const u = l && content.unitById[l.unit];
      return { title: l?.title || 'Lektion', sub: u ? `${TRACKS[u.track]?.name} · ${u.title}` : '', href: `#/lesson/${task.id}`, icon: u?.icon || 'wP', min: l?.minutes || 4, tag: 'Lektion' };
    }
    case 'review':
      return { title: `${task.count} Fehler wiederholen`, sub: 'Rätsel, die du zuletzt verpasst hast', href: '#/puzzles/review', icon: 'wR', min: Math.ceil(task.count * 0.8), tag: 'Wiederholung' };
    case 'puzzles':
      return { title: `${task.count} Rätsel lösen`, sub: task.themes ? 'Passend zu deiner Lektion' : 'Auf deinem Niveau', href: `#/puzzles/train${task.themes ? `?themes=${task.themes.join(',')}` : ''}`, icon: 'wN', min: task.count, tag: 'Taktik' };
    case 'opening': {
      const [id, i] = task.key.split('#');
      const o = content.openingById[id];
      return { title: o ? o.name : 'Eröffnung', sub: o?.lines[i]?.name || '', href: `#/opening/${id}?line=${i}`, icon: 'wB', min: 4, tag: 'Eröffnung' };
    }
    case 'play':
      return { title: 'Probepartie mit Coach', sub: `Gegner um ${task.elo} Elo`, href: `#/play?elo=${task.elo}`, icon: 'bK', min: 10, tag: 'Spielen' };
    default:
      return { title: '', sub: '', href: '#/', icon: 'wP', min: 0, tag: '' };
  }
}

const TILES = [
  { href: '#/online', title: 'Online spielen', sub: 'Gegen echte Menschen – mit Elo und Rang', art: 'attack', icon: 'wQ' },
  { href: '#/play', title: 'Partie spielen', sub: 'Gegen einen Bot – der Coach hilft dir', art: 'play', icon: 'bK' },
  { href: '#/puzzles/train', title: 'Rätsel lösen', sub: 'Immer passend zu deinem Niveau', art: 'tactic', icon: 'wN' },
  { href: '#/openings', title: 'Eröffnungen', sub: 'Gute erste Züge lernen', art: 'open', icon: 'wB' },
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

export function Home() {
  const s = useStore();
  const n = useNet();
  const content = useContent();
  if (!content) return html`<${Spinner} />`;
  const before = s.plan;
  const plan = todayPlan(content, s);
  if (plan !== before) saveSoon();
  const d = todayView();
  const goalPct = d.seconds / (s.profile.minutes * 60);
  const streak = streakNow(s);
  const rank = rankFor(eloOf(s));
  const items = plan.tasks.map((t) => ({ t, info: taskInfo(t, content), p: taskProgress(t, s, plan) }));
  const nextItem = items.find((x) => x.p < 1);
  const done = items.filter((x) => x.p >= 1).length;
  const path = buildPath(content, s.profile);
  const upcoming = nextLessons(path, s, 4);
  const due = duePuzzles(s).length;
  const mineDue = dueMistakes(s).length;
  const focus = (s.profile.survey?.weaknesses || []).map((w) => FOCUS[w]).filter(Boolean).slice(0, 3);
  const hour = new Date().getHours();
  const hi = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hi' : 'Guten Abend';

  return html`<div class="page home">
    <section class="hero-card">
      <div class="hero-left">
        <p class="eyebrow">${hi}${s.profile.name ? `, ${s.profile.name}` : ''} 👋</p>
        <h1>${done === items.length && items.length ? 'Tagesziel geschafft!' : 'Dein Training für heute'}</h1>
        <p class="muted">${items.length} kurze Aufgabe${items.length === 1 ? '' : 'n'} · ca. ${s.profile.minutes} Minuten · ${done}/${items.length} erledigt</p>
        ${nextItem
          ? html`<a class="btn primary xl" href=${nextItem.info.href}><${Icon} name="play" /> ${done ? 'Weiter' : 'Jetzt starten'}: ${nextItem.info.title}</a>`
          : html`<a class="btn primary xl" href="#/puzzles/train"><${Icon} name="bolt" /> Bonus-Runde: Rätsel</a>`}
        ${!done && nextItem ? html`<p class="home-help">Tippe auf den Knopf – wir führen dich Schritt für Schritt durch dein Training.</p>` : null}
      </div>
      <div class="hero-right">
        <${Ring} value=${goalPct} size=${132} stroke=${12}>
          <b>${Math.floor(d.seconds / 60)}</b><small>von ${s.profile.minutes} Min</small>
        <//>
        <div class="hero-stats">
          <div class=${`hs ${streak ? 'fire' : ''}`}><${Icon} name="flame" /><b>${streak}</b><small>Tage</small></div>
          <div class="hs"><${Icon} name="star" /><b>${d.xp}</b><small>XP heute</small></div>
        </div>
      </div>
    </section>

    ${n.game &&
    html`<a class="banner resume" href=${`#/online/game/${n.game.id}`}><${Icon} name="play" /> <span><b>Online-Partie gegen ${n.game.vs}</b> läuft – tippen zum Weiterspielen.</span></a>`}
    ${!s.profile.placementDone &&
    html`<a class="banner resume" href="#/play?test=1"><${Icon} name="bolt" /> <span><b>Mach dein Testspiel</b> (ca. 5 Min) – danach weißt du, wie stark du wirklich spielst.</span></a>`}
    ${mineDue > 0 &&
    html`<a class="banner resume" href="#/puzzles/mine"><${Icon} name="repeat" /> <span><b>${mineDue} Stellung${mineDue === 1 ? '' : 'en'} aus deinen Partien</b> ${mineDue === 1 ? 'wartet' : 'warten'} auf Revanche – finde diesmal den besten Zug.</span></a>`}

    <section>
      <div class="section-head"><h2>Dein Plan für heute</h2><a href="#/settings" class="link">Plan ändern</a></div>
      <div class="task-list">
        ${items.map(
          ({ info, p }, i) => html`<a href=${info.href} class=${`task ${p >= 1 ? 'done' : ''}`}>
            <span class="task-num">${i + 1}</span>
            <span class="task-ico"><${PieceIcon} p=${info.icon} size=${34} /></span>
            <span class="task-body"><small class="tag">${info.tag} · ${info.min} Min</small><b>${info.title}</b><small>${info.sub}</small>
              ${p > 0 && p < 1 ? html`<${Bar} value=${p} />` : null}</span>
            <span class="task-state">${p >= 1 ? html`<${Icon} name="check" />` : html`<${Icon} name="next" />`}</span>
          </a>`,
        )}
      </div>
    </section>

    ${focus.length > 0 &&
    html`<section>
      <div class="section-head"><h2>Dein Fokus</h2><span class="muted small">aus deiner Umfrage</span></div>
      <div class="tiles">${focus.map((t) => html`<${GameTile} ...${t} />`)}</div>
    </section>`}

    <section>
      <div class="section-head"><h2>Mehr trainieren</h2></div>
      <div class="tiles">${TILES.map((t) => html`<${GameTile} ...${t} />`)}</div>
    </section>

    <section class="two-col">
      <div class="card">
        <div class="section-head"><h3>Als Nächstes im Lernpfad</h3><a href="#/learn" class="link">Alles ansehen</a></div>
        ${upcoming.length
          ? upcoming.map((l) => {
              const u = content.unitById[l.unit];
              return html`<a class="row-link" href=${`#/lesson/${l.id}`}><${PieceIcon} p=${u?.icon || 'wP'} size=${28} /><span><b>${l.title}</b><small>${u?.title}</small></span><${Icon} name="next" /></a>`;
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
