// Profil: Statistiken, Rating-Verlauf, Stärken/Schwächen, Partien, Erfolge.
import { html } from '../../vendor/preact-htm.js';
import { useStore, rankFor, streakNow, RANKS, eloOf } from '../lib/store.js';
import { themeName } from '../lib/content.js';
import { themeStats, ACHIEVEMENTS } from '../lib/progress.js';
import { Bar, Icon, PieceIcon } from '../ui/kit.js';

function Spark({ data, color = 'var(--accent)' }) {
  if (data.length < 2) return html`<p class="muted small">Noch zu wenig Daten – leg los!</p>`;
  const vals = data.map((d) => d[1]);
  const min = Math.min(...vals) - 20;
  const max = Math.max(...vals) + 20;
  const W = 600;
  const H = 140;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / (max - min)) * H}`);
  return html`<svg class="spark" viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none">
    <polyline points=${pts.join(' ')} fill="none" stroke=${color} stroke-width="3" vector-effect="non-scaling-stroke" />
    <polygon points=${`0,${H} ${pts.join(' ')} ${W},${H}`} fill=${color} opacity="0.1" />
  </svg>
  <div class="spark-scale"><span>${Math.round(min + 20)}</span><span>${Math.round(max - 20)}</span></div>`;
}

export function Profile() {
  const s = useStore();
  const rank = rankFor(eloOf(s));
  const stats = themeStats(s);
  const strong = [...stats].reverse().slice(0, 5);
  const weak = stats.slice(0, 5);
  const totalMin = Math.round(Object.values(s.days).reduce((a, d) => a + d.seconds, 0) / 60);
  const lessons = Object.values(s.lessons).filter((l) => l.done).length;
  const wins = s.games.filter((g) => g.result === 'win').length;
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ k, xp: s.days[k]?.xp || 0 });
  }
  const maxXp = Math.max(1, ...days.map((d) => d.xp));

  return html`<div class="page profile">
    <section class="hero-card profile-hero" style=${{ '--rank': rank.color }}>
      <div class="hero-left">
        <p class="eyebrow">Profil</p>
        <h1>${s.profile.name || 'Dein Fortschritt'}</h1>
        <div class="rank-row"><${PieceIcon} p=${rank.icon} size=${48} /><div><b>${rank.name}</b><small>${rank.next ? `${eloOf(s)} / ${rank.next.elo} Elo bis ${rank.next.name}` : `${eloOf(s)} Elo · höchster Rang`}</small></div></div>
        <${Bar} value=${rank.progress} color=${rank.color} />
        <div class="rank-ladder">${RANKS.map((r, i) => html`<span class=${i <= rank.index ? 'on' : ''} style=${{ '--c': r.color }} title=${`${r.name} ab ${r.elo} Elo`}></span>`)}</div>
      </div>
      <div class="stat-grid">
        <div class="stat"><small>Rätsel-Rating</small><b>${s.puzzle.rating}</b></div>
        <div class="stat"><small>Spiel-Elo</small><b>${s.play.rating}</b></div>
        <div class="stat"><small>Serie</small><b>${streakNow(s)} 🔥</b><small>Rekord ${s.streak.best}</small></div>
        <div class="stat"><small>Trainiert</small><b>${totalMin >= 60 ? `${Math.floor(totalMin / 60)} h ${totalMin % 60}` : totalMin} min</b></div>
        <div class="stat"><small>Lektionen</small><b>${lessons}</b></div>
        <div class="stat"><small>Rätsel gelöst</small><b>${s.puzzle.solved}</b><small>${s.puzzle.solved + s.puzzle.failed ? Math.round((s.puzzle.solved / (s.puzzle.solved + s.puzzle.failed)) * 100) : 0} % Quote</small></div>
        <div class="stat"><small>Partien</small><b>${s.games.length}</b><small>${wins} Siege</small></div>
        <div class="stat"><small>Rush-Rekord</small><b>${s.puzzle.rushBest}</b></div>
      </div>
    </section>

    <section class="two-col">
      <div class="card"><h3>Rätsel-Rating</h3><${Spark} data=${s.puzzle.history} /></div>
      <div class="card"><h3>Spiel-Elo</h3><${Spark} data=${s.play.history} color="var(--gold)" /></div>
    </section>

    <section class="card">
      <h3>Aktivität (28 Tage)</h3>
      <div class="heat">${days.map((d) => html`<span title=${`${d.k}: ${d.xp} XP`} style=${{ opacity: d.xp ? 0.25 + 0.75 * (d.xp / maxXp) : 1 }} class=${d.xp ? 'on' : ''}></span>`)}</div>
    </section>

    <section class="two-col">
      <div class="card">
        <h3>Stärken</h3>
        ${strong.length ? strong.map((t) => html`<div class="theme-row"><span>${themeName(t.theme)}</span><${Bar} value=${t.rate} /><small>${Math.round(t.rate * 100)} %</small></div>`) : html`<p class="muted small">Löse ein paar Rätsel, dann sehen wir mehr.</p>`}
      </div>
      <div class="card">
        <h3>Baustellen</h3>
        ${weak.length ? weak.map((t) => html`<a class="theme-row" href=${`#/puzzles/train?themes=${t.theme}`}><span>${themeName(t.theme)}</span><${Bar} value=${t.rate} color="var(--danger)" /><small>${Math.round(t.rate * 100)} %</small></a>`) : html`<p class="muted small">Noch keine Daten.</p>`}
      </div>
    </section>

    <section class="card">
      <div class="section-head"><h3>Deine Partien</h3><a class="link" href="#/play">Neue Partie</a></div>
      ${s.games.length === 0 && html`<p class="muted small">Noch keine Partien gespielt.</p>`}
      <div class="games-list">
        ${s.games.slice(0, 20).map(
          (g) => html`<a class="game-row" href=${`#/review/${g.id}`}>
            <span class=${`res ${g.result}`}>${g.result === 'win' ? 'S' : g.result === 'draw' ? 'R' : 'N'}</span>
            <span><b>gegen ${g.bot} (${g.elo})</b><small>${new Date(g.date).toLocaleDateString('de-DE')} · ${g.color === 'w' ? 'Weiß' : 'Schwarz'} · ${g.reason}</small></span>
            <${Icon} name="next" />
          </a>`,
        )}
      </div>
    </section>

    <section>
      <div class="section-head"><h2>Erfolge</h2><span class="muted">${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length}</span></div>
      <div class="ach-grid">
        ${ACHIEVEMENTS.map((a) => {
          const got = s.achievements[a.id];
          return html`<div class=${`ach ${got ? 'got' : ''}`}><${PieceIcon} p=${a.icon} size=${36} /><b>${a.name}</b><small>${a.desc}</small>${got ? html`<em>${new Date(got).toLocaleDateString('de-DE')}</em>` : null}</div>`;
        })}
      </div>
    </section>
  </div>`;
}
