// Fortschritt: alles, was zeigt, wie du besser wirst – Wertungen, Woche, Kalender, Stärken, Partien, Erfolge.
import { html } from '../../vendor/preact-htm.js';
import { useStore, rankFor, streakNow, RANKS, dayKey, eloOf } from '../lib/store.js';
import { useContent, themeName } from '../lib/content.js';
import { themeStats, ACHIEVEMENTS } from '../lib/progress.js';
import { Bar, CountUp, Icon, PieceIcon, Ring } from '../ui/kit.js';

const DAY = 864e5;
// Kalendertage zurückrechnen (nicht n × 24 h – sonst verrutscht es bei der Zeitumstellung).
const keyOf = (offset) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return dayKey(d);
};
const fmtMin = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

/** Summe eines Tageswerts über einen Zeitraum (offset 0 = heute). */
function sumDays(s, from, to, pick) {
  let n = 0;
  for (let i = from; i <= to; i++) {
    const d = s.days[keyOf(i)];
    if (d) n += pick(d);
  }
  return n;
}

/** Linienkurve mit weicher Fläche; zeichnet sich beim Öffnen. */
function Curve({ data, empty }) {
  if (!data || data.length < 2) return html`<div class="pg-empty"><${Icon} name="chart" size=${22} /><span>${empty}</span></div>`;
  const pts = data.slice(-60);
  const vals = pts.map((d) => d[1]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max(20, (hi - lo) * 0.15);
  const min = lo - pad;
  const max = hi + pad;
  const W = 600;
  const H = 160;
  const xy = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - ((v - min) / (max - min)) * H]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [ex, ey] = xy[xy.length - 1];
  return html`<div class="pg-curve">
    <svg viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="pg-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.22" />
          <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${[0.25, 0.5, 0.75].map((f) => html`<line x1="0" x2=${W} y1=${H * f} y2=${H * f} class="pg-grid" />`)}
      <path d=${`${line} L${W},${H} L0,${H} Z`} fill="url(#pg-fill)" class="pg-area" />
      <path d=${line} class="pg-line" pathLength="1" vector-effect="non-scaling-stroke" />
    </svg>
    <span class="pg-dot" style=${{ left: `${(ex / W) * 100}%`, top: `${(ey / H) * 100}%` }}></span>
    <div class="pg-scale"><span>${Math.round(hi)}</span><span>${Math.round(lo)}</span></div>
  </div>`;
}

function RatingCard({ title, sub, value, data, empty }) {
  const monthAgo = Date.now() - 30 * DAY;
  const old = (data || []).find((d) => d[0] >= monthAgo);
  const diff = old ? value - old[1] : 0;
  return html`<section class="card pg-rating">
    <div class="pg-rating-head">
      <div><h3>${title}</h3><small class="muted">${sub}</small></div>
      <div class="pg-big"><b><${CountUp} to=${value} /></b>${diff ? html`<span class=${`pg-delta ${diff > 0 ? 'up' : 'down'}`}>${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)} <small>in 30 Tagen</small></span>` : null}</div>
    </div>
    <${Curve} data=${data} empty=${empty} />
  </section>`;
}

function WeekTile({ label, now, before, unit = '', fmt = (x) => x }) {
  const diff = now - before;
  return html`<div class="pg-week-tile">
    <small>${label}</small>
    <b><${CountUp} to=${now} />${unit}</b>
    <span class=${`pg-delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>${diff > 0 ? `↑ ${fmt(diff)} mehr` : diff < 0 ? `↓ ${fmt(-diff)} weniger` : 'wie letzte Woche'}</span>
  </div>`;
}

export function Progress() {
  const s = useStore();
  const content = useContent();
  const rank = rankFor(eloOf(s));
  const streak = streakNow(s);
  const totalMin = Math.round(Object.values(s.days).reduce((a, d) => a + (d.seconds || 0), 0) / 60);
  const stats = themeStats(s);
  const strong = [...stats].reverse().filter((t) => t.rate >= 0.5).slice(0, 5);
  const weak = stats.filter((t) => t.rate < 0.75).slice(0, 5);

  const week = {
    min: [sumDays(s, 0, 6, (d) => d.seconds || 0), sumDays(s, 7, 13, (d) => d.seconds || 0)].map((x) => Math.round(x / 60)),
    puzzles: [sumDays(s, 0, 6, (d) => d.puzzles || 0), sumDays(s, 7, 13, (d) => d.puzzles || 0)],
    games: [sumDays(s, 0, 6, (d) => d.games || 0), sumDays(s, 7, 13, (d) => d.games || 0)],
    xp: [sumDays(s, 0, 6, (d) => d.xp || 0), sumDays(s, 7, 13, (d) => d.xp || 0)],
  };

  // Kalender: 12 Wochen, Spalten = Wochen (Mo–So)
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // Mo = 0
  const cells = [];
  for (let i = 12 * 7 - 1 - (6 - dow); i >= -(6 - dow); i--) {
    const k = keyOf(i);
    const d = i >= 0 ? s.days[k] : null;
    const m = d ? Math.round((d.seconds || 0) / 60) : 0;
    const xp = d?.xp || 0;
    const lvl = i < 0 ? -1 : !m && !xp ? 0 : m < 5 && xp < 30 ? 1 : m < 15 ? 2 : m < 30 ? 3 : 4;
    cells.push({ k, m, xp, lvl });
  }
  const activeDays = cells.filter((c) => c.lvl > 0).length;

  const lessonsTotal = content?.lessons?.length || 0;
  const lessonsDone = Object.values(s.lessons).filter((l) => l.done).length;
  const linesTotal = content ? content.openings.reduce((a, o) => a + o.lines.length, 0) : 0;
  const linesDone = Object.values(s.openings.lines).filter((l) => l.box >= 2).length;
  const mistakes = s.mistakes || [];
  const mastered = mistakes.filter((m) => m.mastered).length;

  const wins = s.games.filter((g) => g.result === 'win').length;
  const draws = s.games.filter((g) => g.result === 'draw').length;
  const losses = s.games.filter((g) => g.result === 'loss').length;
  const games = Math.max(1, s.games.length);
  const got = Object.keys(s.achievements).length;

  return html`<div class="page pg">
    <section class="hero-card pg-hero" style=${{ '--rank': rank.color }}>
      <div class="pg-hero-main">
        <p class="eyebrow">Dein Fortschritt</p>
        <h1>${s.profile.name ? `Stark, ${s.profile.name}!` : 'Du wirst besser.'}</h1>
        <div class="rank-row"><${PieceIcon} p=${rank.icon} size=${48} /><div><b>${rank.name}</b><small>${rank.next ? `${eloOf(s)} Elo · noch ${rank.toNext} Elo bis ${rank.next.name}` : `${eloOf(s)} Elo · höchster Rang`}</small></div></div>
        <${Bar} value=${rank.progress} color=${rank.color} />
        <div class="rank-ladder">${RANKS.map((r, i) => html`<span class=${i <= rank.index ? 'on' : ''} style=${{ '--c': r.color }} title=${`${r.name} ab ${r.elo} Elo`}></span>`)}</div>
      </div>
      <div class="pg-hero-stats">
        <div class="pg-stat"><${Icon} name="flame" /><b><${CountUp} to=${streak} /></b><small>${streak === 1 ? 'Tag' : 'Tage'} am Stück</small></div>
        <div class="pg-stat"><${Icon} name="clock" /><b>${fmtMin(totalMin)}</b><small>trainiert</small></div>
        <div class="pg-stat"><${Icon} name="star" /><b><${CountUp} to=${s.xp} /></b><small>XP gesamt</small></div>
      </div>
    </section>

    <section>
      <div class="section-head"><h2>Diese Woche</h2><span class="muted small">im Vergleich zur Woche davor</span></div>
      <div class="pg-week">
        <${WeekTile} label="Trainiert" now=${week.min[0]} before=${week.min[1]} unit=" min" fmt=${(x) => `${x} min`} />
        <${WeekTile} label="Rätsel gelöst" now=${week.puzzles[0]} before=${week.puzzles[1]} />
        <${WeekTile} label="Partien" now=${week.games[0]} before=${week.games[1]} />
        <${WeekTile} label="XP" now=${week.xp[0]} before=${week.xp[1]} />
      </div>
    </section>

    <div class="two-col">
      <${RatingCard} title="Spiel-Wertung" sub="Wie stark du gegen Bots spielst (Elo)" value=${s.play.rating} data=${s.play.history} empty="Spiel eine Partie – dann siehst du hier deine Kurve." />
      <${RatingCard} title="Rätsel-Wertung" sub="Wie gut du Taktik siehst" value=${s.puzzle.rating} data=${s.puzzle.history} empty="Löse ein paar Rätsel – dann siehst du hier deine Kurve." />
    </div>

    <section class="card">
      <div class="section-head"><h3>Dein Kalender</h3><span class="muted small">${activeDays} aktive Tage in 12 Wochen</span></div>
      <div class="pg-cal">${cells.map((c) => html`<span class=${`l${c.lvl}`} title=${c.lvl < 0 ? '' : `${c.k}: ${c.m} min · ${c.xp} XP`}></span>`)}</div>
      <div class="pg-legend"><span>weniger</span>${[0, 1, 2, 3, 4].map((l) => html`<i class=${`l${l}`}></i>`)}<span>mehr</span></div>
    </section>

    <section>
      <div class="section-head"><h2>Was du schon kannst</h2></div>
      <div class="pg-rings">
        <a class="card pg-ring" href="#/learn">
          <${Ring} value=${lessonsTotal ? lessonsDone / lessonsTotal : 0} size=${86} stroke=${8}><b>${lessonsDone}</b><small>von ${lessonsTotal}</small><//>
          <span><b>Lektionen</b><small>im Lernpfad abgeschlossen</small></span>
        </a>
        <a class="card pg-ring" href="#/openings">
          <${Ring} value=${linesTotal ? linesDone / linesTotal : 0} size=${86} stroke=${8}><b>${linesDone}</b><small>von ${linesTotal}</small><//>
          <span><b>Eröffnungen</b><small>Linien sitzen sicher</small></span>
        </a>
        <a class="card pg-ring" href="#/puzzles/mine">
          <${Ring} value=${mistakes.length ? mastered / mistakes.length : 0} size=${86} stroke=${8}><b>${mastered}</b><small>von ${mistakes.length}</small><//>
          <span><b>Eigene Fehler</b><small>aus Partien gemeistert</small></span>
        </a>
        <a class="card pg-ring" href="#/puzzles">
          <${Ring} value=${s.puzzle.solved + s.puzzle.failed ? s.puzzle.solved / (s.puzzle.solved + s.puzzle.failed) : 0} size=${86} stroke=${8}><b>${s.puzzle.solved}</b><small>gelöst</small><//>
          <span><b>Rätsel</b><small>${s.puzzle.solved + s.puzzle.failed ? `${Math.round((s.puzzle.solved / (s.puzzle.solved + s.puzzle.failed)) * 100)} % richtig` : 'noch keine'}</small></span>
        </a>
      </div>
    </section>

    <div class="two-col">
      <section class="card">
        <h3>Deine Stärken</h3>
        ${strong.length
          ? strong.map((t) => html`<div class="theme-row"><span>${themeName(t.theme)}</span><${Bar} value=${t.rate} /><small>${Math.round(t.rate * 100)} %</small></div>`)
          : html`<p class="muted small">Löse ein paar Rätsel – dann zeigen wir dir, was du besonders gut kannst.</p>`}
      </section>
      <section class="card">
        <h3>Hier lohnt sich Training</h3>
        ${weak.length
          ? weak.map((t) => html`<a class="theme-row" href=${`#/puzzles/train?themes=${t.theme}`}><span>${themeName(t.theme)}</span><${Bar} value=${t.rate} color="var(--danger)" /><small>${Math.round(t.rate * 100)} %</small></a>`)
          : html`<p class="muted small">Noch keine Daten. Nach ein paar Rätseln siehst du hier, woran du arbeiten kannst.</p>`}
      </section>
    </div>

    <section class="card">
      <div class="section-head"><h3>Deine Partien</h3><a class="link" href="#/play">Neue Partie <${Icon} name="next" size=${14} /></a></div>
      ${s.games.length
        ? html`<div class="pg-record">
              <div class="pg-wdl"><i class="w" style=${{ flex: wins / games }}></i><i class="d" style=${{ flex: draws / games }}></i><i class="l" style=${{ flex: losses / games }}></i></div>
              <div class="pg-wdl-legend"><span><i class="w"></i>${wins} Siege</span><span><i class="d"></i>${draws} Remis</span><span><i class="l"></i>${losses} Niederlagen</span></div>
            </div>
            <div class="games-list">
              ${s.games.slice(0, 12).map(
                (g) => html`<a class="game-row" href=${`#/review/${g.id}`}>
                  <span class=${`res ${g.result}`}>${g.result === 'win' ? 'S' : g.result === 'draw' ? 'R' : 'N'}</span>
                  <span><b>gegen ${g.bot} (${g.elo})</b><small>${new Date(g.date).toLocaleDateString('de-DE')} · ${g.color === 'w' ? 'Weiß' : 'Schwarz'} · ${g.reason}</small></span>
                  <${Icon} name="next" />
                </a>`,
              )}
            </div>`
        : html`<div class="pg-empty"><${Icon} name="play" size=${22} /><span>Noch keine Partien. <a class="link" href="#/play">Jetzt eine spielen</a></span></div>`}
    </section>

    <section>
      <div class="section-head"><h2>Erfolge</h2><span class="muted">${got} von ${ACHIEVEMENTS.length}</span></div>
      <div class="ach-grid">
        ${ACHIEVEMENTS.map((a) => {
          const when = s.achievements[a.id];
          return html`<div class=${`ach ${when ? 'got' : ''}`}><${PieceIcon} p=${a.icon} size=${36} /><b>${a.name}</b><small>${a.desc}</small>${when ? html`<em>${new Date(when).toLocaleDateString('de-DE')}</em>` : null}</div>`;
        })}
      </div>
    </section>
  </div>`;
}
