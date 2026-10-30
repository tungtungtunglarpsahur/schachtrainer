// Online-Bereich: Konto, Matchsuche nach Elo, eigene Spiele per Link, Freunde, Einladungen,
// Rangliste und Profil – wie bei chess.com, nur einfacher.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { useStore, rankFor, RANKS } from '../lib/store.js';
import { Icon, PieceIcon, Spinner, toast, Modal } from '../ui/kit.js';
import { play } from '../lib/sound.js';
import { api, useNet, loggedIn, register, login, logout, refreshMe, setFastPolling, POOLS, START_LEVELS, tcLabel, tcKind, joinLink } from '../lib/online.js';

const go = (hash) => (location.hash = hash);

function RankBadge({ r, big = false }) {
  const rank = rankFor(r);
  return html`<span class=${`on-rank ${big ? 'big' : ''}`} style=${{ '--rank': rank.color }} title=${`Rang: ${rank.name}`}>
    <span class=${`piece-icon piece ${rank.icon}`}></span><b>${rank.name}</b>
  </span>`;
}

function PlayerLine({ u, right = null, sub = null }) {
  return html`<div class="on-player">
    <span class="on-avatar" style=${{ '--rank': rankFor(u.r).color }}><span class=${`piece-icon piece ${rankFor(u.r).icon}`}></span>${u.online ? html`<i class="on-dot" title="online"></i>` : null}</span>
    <span class="on-pname"><b>${u.name}</b><small>${sub || `${u.r}${u.prov ? '?' : ''} Elo · ${rankFor(u.r).name}${u.playing ? ' · spielt gerade' : ''}`}</small></span>
    ${right}
  </div>`;
}

// ---------- Anmelden / Konto erstellen ----------
export function AuthCard({ onDone, startMode = 'register' }) {
  const s = useStore();
  const [mode, setMode] = useState(startMode);
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const testElo = s.profile.placementDone && s.play.rating ? Math.round(s.play.rating) : null;
  const [start, setStart] = useState(testElo ? 'test' : 800);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const u = await register({ name: name.trim(), pass, start: start === 'test' ? testElo : start, fromTest: start === 'test' });
        toast(`Willkommen, ${u.name}! Du startest mit ${u.r} Elo.`, { icon: rankFor(u.r).icon, kind: 'good' });
        play('good');
      } else {
        const r = await login({ name: name.trim(), pass });
        toast(r.restored ? `Hallo ${r.user.name}! Dein Fortschritt ist wieder da.` : `Hallo ${r.user.name}!`, { kind: 'good' });
      }
      window.scrollTo(0, 0); // nach oben – dort stehen jetzt Name, Elo und die Reiter
      onDone?.();
    } catch (x) {
      setErr(x.message);
      play('bad');
    } finally {
      setBusy(false);
    }
  };

  return html`<form class="card on-auth" onSubmit=${submit}>
    <div class="seg on-auth-tabs" role="tablist">
      <button type="button" class=${mode === 'register' ? 'on' : ''} onClick=${() => { setMode('register'); setErr(''); }}>Konto erstellen</button>
      <button type="button" class=${mode === 'login' ? 'on' : ''} onClick=${() => { setMode('login'); setErr(''); }}>Anmelden</button>
    </div>
    <label class="field"><span>Benutzername</span>
      <input class="input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="z. B. SchachHeld_07" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="16" required />
    </label>
    <label class="field"><span>Passwort</span>
      <span class="on-pass">
        <input class="input" type=${show ? 'text' : 'password'} value=${pass} onInput=${(e) => setPass(e.target.value)} placeholder="mindestens 4 Zeichen" autocomplete=${mode === 'register' ? 'new-password' : 'current-password'} maxlength="64" required />
        <button type="button" class="on-eye" onClick=${() => setShow(!show)} aria-label=${show ? 'Passwort verbergen' : 'Passwort zeigen'}><${Icon} name="eye" size=${18} /></button>
      </span>
    </label>
    ${mode === 'register' &&
    html`<div class="field"><span>Wie gut spielst du? <small class="muted">– damit startet deine Elo, wie bei chess.com</small></span>
      <div class="on-levels">
        ${testElo &&
        html`<button type="button" class=${`on-level ${start === 'test' ? 'on' : ''}`} onClick=${() => setStart('test')}>
          <b>Aus deinem Testspiel</b><small>Empfohlen – gemessen statt geschätzt</small><span class="on-elo">${testElo}</span>
        </button>`}
        ${START_LEVELS.map((l) => html`<button type="button" class=${`on-level ${start === l.elo ? 'on' : ''}`} onClick=${() => setStart(l.elo)}>
          <b>${l.title}</b><small>${l.sub}</small><span class="on-elo">${l.elo}</span>
        </button>`)}
      </div>
    </div>`}
    ${err && html`<p class="on-err" role="alert">${err}</p>`}
    <button class="btn primary xl" type="submit" disabled=${busy || name.trim().length < 3 || pass.length < 4}>
      ${busy ? 'Einen Moment …' : mode === 'register' ? html`<${Icon} name="check" /> Konto erstellen` : html`<${Icon} name="next" /> Anmelden`}
    </button>
    <p class="muted small on-note"><${Icon} name="check" size=${14} /> Du bleibst angemeldet und dein Fortschritt wird gesichert – auf jedem Gerät. Keine E-Mail nötig.</p>
  </form>`;
}

// ---------- Hub ----------
export function OnlineHub({ query }) {
  const n = useNet();
  const tab = query?.get('tab') || 'play';
  useEffect(() => {
    setFastPolling(true);
    return () => setFastPolling(false);
  }, []);

  if (!loggedIn())
    return html`<div class="page on-page">
      <div class="on-hero">
        <div>
          <small class="tag">Online</small>
          <h1>Spiel gegen echte Menschen</h1>
          <p class="muted">Matchsuche nach Elo, Freunde herausfordern, eigene Spiele per Link, Ränge und Rangliste – mit echter Wertung wie bei chess.com.</p>
        </div>
        <div class="on-ranks">${RANKS.map((r) => html`<span title=${`${r.name} ab ${r.elo}`} style=${{ '--rank': r.color }}><span class=${`piece-icon piece ${r.icon}`}></span><small>${r.elo}+</small></span>`)}</div>
      </div>
      ${n.setup && html`<div class="banner">Der Online-Modus wird gerade eingerichtet – bitte versuch es gleich nochmal.</div>`}
      <${AuthCard} startMode=${query?.get('login') ? 'login' : 'register'} />
    </div>`;

  const u = n.user;
  const tabs = [
    ['play', 'Spielen', 'play'],
    ['friends', 'Freunde', 'users'],
    ['top', 'Rangliste', 'trophy'],
    ['me', 'Profil', 'user'],
  ];
  return html`<div class="page on-page">
    <div class="on-head">
      <div class="on-me">
        <span class="on-avatar big" style=${{ '--rank': rankFor(u.r).color }}><span class=${`piece-icon piece ${rankFor(u.r).icon}`}></span></span>
        <div><h1>${u.name}</h1><p class="muted"><b class="on-big-elo">${u.r}${u.prov ? '?' : ''}</b> Elo · <${RankBadge} r=${u.r} /></p></div>
      </div>
      <div class="seg on-tabs">${tabs.map(([id, label, icon]) => html`<button class=${tab === id ? 'on' : ''} onClick=${() => go(id === 'play' ? '#/online' : `#/online?tab=${id}`)}><${Icon} name=${icon} size=${16} /> ${label}${id === 'play' && n.invites.length ? html`<i class="on-badge">${n.invites.length}</i>` : null}</button>`)}</div>
    </div>
    ${n.offline && html`<div class="banner danger">Keine Verbindung – Online-Spiele brauchen Internet.</div>`}
    ${n.game && html`<a class="banner resume on-resume" href=${`#/online/game/${n.game.id}`}><${Icon} name="play" /> <span><b>Laufende Partie gegen ${n.game.vs}</b> – tippen zum Weiterspielen</span></a>`}
    ${tab === 'play' && html`<${PlayTab} />`}
    ${tab === 'friends' && html`<${FriendsTab} />`}
    ${tab === 'top' && html`<${TopTab} />`}
    ${tab === 'me' && html`<${MeTab} />`}
  </div>`;
}

// ---------- Spielen: Matchsuche + eigenes Spiel + Einladungen ----------
function PlayTab() {
  const n = useNet();
  const [pool, setPool] = useState(() => localStorage.getItem('lk.pool') || '10+0');
  const [search, setSearch] = useState(null); // { since, range }
  const [custom, setCustom] = useState(false);
  const [waitFor, setWaitFor] = useState(null); // eigene Einladung, auf die gewartet wird
  const searching = useRef(false);

  // Matchsuche: alle 2,5 s nachfragen; beim Verlassen abmelden (keine Geister-Partien)
  useEffect(() => {
    if (!search) return;
    searching.current = true;
    let stop = false;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await api('queue.poll');
        if (stop) return;
        if (r.matched) {
          play('notify');
          go(`#/online/game/${r.matched}`);
        } else if (r.idle) {
          // z. B. App war kurz im Hintergrund – dann ist man aus der Warteschlange raus
          setSearch(null);
          searching.current = false;
          toast('Die Suche wurde beendet. Tippe nochmal auf „Spiel suchen“.');
        } else setSearch((x) => (x ? { ...x, range: r.range } : x));
      } catch {}
    }, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [!!search]);
  useEffect(() => () => searching.current && api('queue.leave').catch(() => {}), []);

  const startSearch = async () => {
    try {
      localStorage.setItem('lk.pool', pool);
    } catch {}
    try {
      const r = await api('queue.join', { pool });
      if (r.matched) return go(`#/online/game/${r.matched}`);
      setSearch({ since: Date.now(), range: 150 });
    } catch (e) {
      toast(e.message);
    }
  };
  const stopSearch = async () => {
    setSearch(null);
    searching.current = false;
    api('queue.leave').catch(() => {});
  };

  return html`<div class="on-grid">
    <section class="card on-match">
      <div class="section-head"><h2>Gegner suchen</h2><span class="muted">gewertet · nach Elo</span></div>
      <div class="on-pools">
        ${POOLS.map((p) => html`<button class=${`on-pool ${pool === p.id ? 'on' : ''}`} disabled=${!!search} onClick=${() => setPool(p.id)}>
          <b>${p.m} + ${p.inc}</b><small>${p.kind}</small>
        </button>`)}
      </div>
      ${search
        ? html`<div class="on-searching">
            <span class="on-radar"><i></i><i></i><i></i></span>
            <div><b>Suche Gegner …</b><small><${Elapsed} since=${search.since} /> · ${search.range ? `Elo ±${search.range}` : 'jeder Gegner'}</small></div>
            <button class="btn ghost" onClick=${stopSearch}><${Icon} name="x" /> Abbrechen</button>
          </div>`
        : html`<button class="btn primary xl on-go" onClick=${startSearch}><${Icon} name="bolt" /> Spiel suchen</button>`}
      <p class="muted small">Du bekommst einen Gegner mit ähnlicher Elo. Je länger du wartest, desto größer wird der Bereich.</p>
    </section>

    <section class="card">
      <div class="section-head"><h2>Eigenes Spiel</h2><span class="muted">für Freunde</span></div>
      ${waitFor
        ? html`<${WaitingChallenge} c=${waitFor} onEnd=${() => setWaitFor(null)} />`
        : html`<p class="muted">Bedenkzeit, Farbe und Wertung selbst wählen – dann den Link schicken oder direkt einen Freund herausfordern.</p>
            <button class="btn secondary" onClick=${() => setCustom(true)}><${Icon} name="gear" /> Spiel erstellen</button>`}
    </section>

    <section class="card on-invites">
      <div class="section-head"><h2>Einladungen</h2>${n.invites.length ? html`<span class="on-badge">${n.invites.length}</span>` : null}</div>
      ${n.invites.length
        ? n.invites.map((c) => html`<${InviteRow} key=${c.cid} c=${c} />`)
        : html`<p class="muted">Gerade keine. Wenn dich jemand herausfordert, siehst du es hier.</p>`}
    </section>
  </div>
  ${custom && html`<${CustomGame} onClose=${() => setCustom(false)} onCreated=${(c) => {
    setCustom(false);
    setWaitFor(c);
  }} />`}`;
}

function Elapsed({ since }) {
  const [, t] = useState(0);
  useEffect(() => {
    const i = setInterval(() => t((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return html`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function InviteRow({ c }) {
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      const r = await api('challenge.accept', { cid: c.cid });
      go(`#/online/game/${r.game}`);
    } catch (e) {
      toast(e.message);
      refreshMe();
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    await api('challenge.cancel', { cid: c.cid }).catch(() => {});
    refreshMe();
  };
  return html`<div class="on-invite">
    <${PlayerLine} u=${{ name: c.from.name, r: c.from.r }} />
    <span class="on-tc">${tcLabel(c.tc)} · ${c.rated ? 'gewertet' : 'ungewertet'}</span>
    <div class="btn-row">
      <button class="btn primary" disabled=${busy} onClick=${accept}><${Icon} name="check" /> Annehmen</button>
      <button class="btn ghost" onClick=${decline}>Ablehnen</button>
    </div>
  </div>`;
}

const MINUTES = [1, 3, 5, 10, 15, 30, null];
const INCS = [0, 2, 3, 5, 10];
function CustomGame({ onClose, onCreated, to = null }) {
  const [m, setM] = useState(10);
  const [inc, setInc] = useState(0);
  const [color, setColor] = useState('r');
  const [rated, setRated] = useState(true);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const r = await api('challenge.create', { to, tc: m ? { m, inc } : null, color, rated: rated && m !== null });
      if (r.game) go(`#/online/game/${r.game}`); // die andere Person hatte dich schon herausgefordert
      else onCreated(r.challenge);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<${Modal} onClose=${onClose}>
    <div class="on-custom">
      <h2>${to ? `${to} herausfordern` : 'Eigenes Spiel'}</h2>
      <span class="on-label">Bedenkzeit (Minuten)</span>
      <div class="seg wrap">${MINUTES.map((x) => html`<button class=${m === x ? 'on' : ''} onClick=${() => setM(x)}>${x === null ? '∞' : x}</button>`)}</div>
      ${m !== null && html`<span class="on-label">Zusatz pro Zug (Sekunden)</span>
      <div class="seg wrap">${INCS.map((x) => html`<button class=${inc === x ? 'on' : ''} onClick=${() => setInc(x)}>+${x}</button>`)}</div>`}
      <span class="on-label">Deine Farbe</span>
      <div class="seg">${[['w', 'Weiß'], ['r', 'Zufall'], ['b', 'Schwarz']].map(([id, l]) => html`<button class=${color === id ? 'on' : ''} onClick=${() => setColor(id)}>${l}</button>`)}</div>
      ${m === null
        ? html`<p class="muted small">Ohne Uhr ist die Partie immer ungewertet – die Elo bleibt gleich.</p>`
        : html`<label class="toggle-row">
            <span><b>Gewertet</b><small>${rated ? 'Die Partie zählt für eure Elo.' : 'Nur zum Spaß – die Elo bleibt gleich.'}</small></span>
            <span class="switch"><input type="checkbox" checked=${rated} onChange=${(e) => setRated(e.target.checked)} /><span></span></span>
          </label>`}
      <p class="muted small">${m === null ? 'Ohne Uhr' : `${m} + ${inc} · ${tcKind({ m, inc })}`}${to ? '' : ' · Danach bekommst du einen Link zum Verschicken.'}</p>
      <div class="btn-row">
        <button class="btn primary" disabled=${busy} onClick=${create}><${Icon} name="check" /> ${to ? 'Herausfordern' : 'Spiel erstellen'}</button>
        <button class="btn ghost" onClick=${onClose}>Abbrechen</button>
      </div>
    </div>
  <//>`;
}

/** Eigene Einladung: Link teilen und warten, bis jemand annimmt. */
function WaitingChallenge({ c, onEnd }) {
  const link = joinLink(c.cid);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await api('challenge.get', { cid: c.cid });
        if (r.game) {
          play('notify');
          go(`#/online/game/${r.game}`);
        }
      } catch (e) {
        if (e.status === 404) {
          toast('Die Einladung ist abgelaufen.');
          onEnd();
        }
      }
    }, 2500);
    return () => clearInterval(t);
  }, [c.cid]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link kopiert – jetzt verschicken!', { kind: 'good' });
    } catch {
      toast('Kopieren ging nicht – halte den Link gedrückt.');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Learning King', text: `Spiel mit mir Schach (${tcLabel(c.tc)})!`, url: link });
    } catch {}
  };
  const cancel = async () => {
    await api('challenge.cancel', { cid: c.cid }).catch(() => {});
    onEnd();
  };
  return html`<div class="on-wait">
    <div class="on-searching"><span class="on-radar"><i></i><i></i><i></i></span><div><b>${c.to ? `Warte auf ${c.to.name} …` : 'Warte auf deinen Gegner …'}</b><small>${tcLabel(c.tc)} · ${c.rated ? 'gewertet' : 'ungewertet'} · Farbe: ${c.color === 'w' ? 'Weiß' : c.color === 'b' ? 'Schwarz' : 'Zufall'}</small></div></div>
    ${!c.to && html`<div class="on-link"><input class="input selectable" readonly value=${link} onFocus=${(e) => e.target.select()} />
      <button class="btn primary" onClick=${copy}><${Icon} name="copy" /> Kopieren</button>
      ${navigator.share ? html`<button class="btn secondary" onClick=${share}>Teilen</button>` : null}</div>`}
    <button class="btn ghost" onClick=${cancel}><${Icon} name="x" /> Einladung zurückziehen</button>
  </div>`;
}

// ---------- Freunde ----------
function FriendsTab() {
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [friends, setFriends] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [waitFor, setWaitFor] = useState(null);
  const load = () =>
    api('friends')
      .then((r) => setFriends(r.friends))
      .catch(() => setFriends([]));
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 20000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) return setFound(null);
    const t = setTimeout(() => api('search', { q: q.trim() }).then((r) => setFound(r.users)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const isFriend = (name) => friends?.some((f) => f.name.toLowerCase() === name.toLowerCase());
  const add = async (name) => {
    try {
      await api('friend.add', { name });
      toast(`${name} ist jetzt in deiner Freundesliste.`, { kind: 'good' });
      load();
    } catch (e) {
      toast(e.message);
    }
  };
  const remove = async (name) => {
    await api('friend.remove', { name }).catch(() => {});
    load();
  };
  const me = useNet().user;
  return html`<div class="on-grid">
    <section class="card">
      <div class="section-head"><h2>Leute suchen</h2></div>
      <label class="on-search"><${Icon} name="scope" size=${18} /><input class="input" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Benutzername eingeben …" autocapitalize="off" autocorrect="off" spellcheck="false" /></label>
      ${found && !found.length && html`<p class="muted">Niemand gefunden.</p>`}
      ${found?.filter((u) => u.name !== me?.name).map((u) => html`<${PlayerLine} u=${u} right=${html`<div class="btn-row tight">
        ${isFriend(u.name) ? html`<span class="muted small">Freund</span>` : html`<button class="btn ghost" onClick=${() => add(u.name)}><${Icon} name="star" size=${16} /> Hinzufügen</button>`}
        <button class="btn secondary" onClick=${() => setChallenge(u.name)}><${Icon} name="bolt" size=${16} /> Spielen</button>
      </div>`} />`)}
    </section>
    <section class="card">
      <div class="section-head"><h2>Deine Freunde</h2><span class="muted">${friends ? friends.filter((f) => f.online).length : 0} online</span></div>
      ${waitFor && html`<${WaitingChallenge} c=${waitFor} onEnd=${() => setWaitFor(null)} />`}
      ${!friends ? html`<${Spinner} label="Lädt …" />` : !friends.length ? html`<p class="muted">Noch keine Freunde. Such oben nach ihrem Benutzernamen.</p>` : friends.map((f) => html`<${PlayerLine} u=${f} right=${html`<div class="btn-row tight">
        <button class="btn secondary" onClick=${() => setChallenge(f.name)}><${Icon} name="bolt" size=${16} /> Herausfordern</button>
        <button class="icon-btn" title="Entfernen" onClick=${() => remove(f.name)}><${Icon} name="x" size=${16} /></button>
      </div>`} />`)}
    </section>
  </div>
  ${challenge && html`<${CustomGame} to=${challenge} onClose=${() => setChallenge(null)} onCreated=${(c) => {
    setChallenge(null);
    setWaitFor(c);
    toast(`Einladung an ${c.to?.name} geschickt.`, { kind: 'good' });
  }} />`}`;
}

// ---------- Rangliste ----------
function TopTab() {
  const [data, setData] = useState(null);
  const me = useNet().user;
  useEffect(() => {
    api('leaderboard').then(setData).catch((e) => setData({ error: e.message }));
  }, []);
  if (!data) return html`<${Spinner} label="Rangliste lädt …" />`;
  if (data.error) return html`<p class="muted">${data.error}</p>`;
  return html`<section class="card on-top">
    <div class="section-head"><h2>Rangliste</h2><span class="muted">${data.place ? `Du bist Platz ${data.place} von ${data.total}` : `${data.total} Spieler`}</span></div>
    <ol class="on-board">
      ${data.top.map((u, i) => html`<li class=${u.name === me?.name ? 'me' : ''}>
        <span class=${`on-place p${i + 1}`}>${i + 1}</span>
        <${PlayerLine} u=${u} sub=${`${rankFor(u.r).name} · ${u.games || 0} ${u.games === 1 ? 'Partie' : 'Partien'}`} right=${html`<b class="on-elo-r">${u.r}${u.prov ? '?' : ''}</b>`} />
      </li>`)}
    </ol>
  </section>`;
}

// ---------- Profil ----------
function MeTab() {
  const n = useNet();
  const u = n.user;
  const [data, setData] = useState(null);
  useEffect(() => {
    api('profile', { name: u.name }).then(setData).catch(() => setData({ history: [] }));
  }, []);
  const rank = rankFor(u.r);
  return html`<div class="on-grid">
    <section class="card on-stats" style=${{ '--rank': rank.color }}>
      <div class="rank-row"><${PieceIcon} p=${rank.icon} size=${54} /><div><b>${rank.name}</b><small>${rank.next ? `Noch ${rank.toNext} Elo bis ${rank.next.name}` : 'Höchster Rang'}</small></div></div>
      <div class="on-ladder">${RANKS.map((r, i) => html`<span class=${i <= rank.index ? 'on' : ''} style=${{ '--c': r.color }} title=${`${r.name} ab ${r.elo}`}></span>`)}</div>
      <div class="summary-grid">
        <div><small>Elo</small><b>${u.r}${u.prov ? '?' : ''}</b></div>
        <div><small>Bestwert</small><b>${u.peak}</b></div>
        <div><small>Platz</small><b>${data?.place || '–'}</b></div>
      </div>
      <div class="summary-grid">
        <div><small>Siege</small><b>${u.w}</b></div>
        <div><small>Remis</small><b>${u.d}</b></div>
        <div><small>Niederlagen</small><b>${u.l}</b></div>
      </div>
      ${u.prov && html`<p class="muted small">Das „?“ heißt: Deine Wertung ist noch vorläufig. Nach ein paar Partien wird sie genau – am Anfang bewegt sie sich deshalb stärker.</p>`}
      <button class="btn ghost" onClick=${async () => {
        await logout();
        toast('Abgemeldet.');
      }}><${Icon} name="back" /> Abmelden</button>
    </section>
    <section class="card">
      <div class="section-head"><h2>Letzte Partien</h2></div>
      ${!data ? html`<${Spinner} label="Lädt …" />` : !data.history?.length ? html`<p class="muted">Noch keine Online-Partien. Los geht's!</p>` : data.history.map((h) => {
        const won = (h.result === '1-0' && h.you === 'w') || (h.result === '0-1' && h.you === 'b');
        const draw = h.result === '1/2-1/2';
        const opp = h.you === 'w' ? h.b : h.w;
        return html`<a class="on-hist" href=${`#/online/game/${h.id}`}>
          <span class=${`on-res ${won ? 'win' : draw ? 'draw' : 'loss'}`}>${won ? 'S' : draw ? 'R' : 'N'}</span>
          <span><b>gegen ${opp}</b><small>${h.reason} · ${Math.ceil(h.moves / 2)} ${Math.ceil(h.moves / 2) === 1 ? 'Zug' : 'Züge'}</small></span>
          ${h.rated && h.rc !== null ? html`<b class=${`on-rc ${h.rc >= 0 ? 'up' : 'down'}`}>${h.rc >= 0 ? '+' : ''}${h.rc}</b>` : html`<small class="muted">ungewertet</small>`}
        </a>`;
      })}
    </section>
  </div>`;
}

// ---------- Einladungs-Link öffnen ----------
export function JoinView({ cid }) {
  const n = useNet();
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () =>
    api('challenge.get', { cid })
      .then((r) => (r.game ? go(`#/online/game/${r.game}`) : setC({ ...r.challenge, mine: r.mine })))
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, [cid, !!n.user]);
  const accept = async () => {
    setBusy(true);
    try {
      const r = await api('challenge.accept', { cid });
      go(`#/online/game/${r.game}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="page on-page on-join">
    ${err
      ? html`<div class="card center"><h2>Hm.</h2><p class="muted">${err}</p><a class="btn primary" href="#/online">Zum Online-Bereich</a></div>`
      : !c
      ? html`<${Spinner} label="Einladung wird geladen …" />`
      : html`<div class="card on-join-card">
          <small class="tag">Einladung</small>
          <h1>${c.from.name} will mit dir spielen</h1>
          <${PlayerLine} u=${{ name: c.from.name, r: c.from.r }} />
          <p class="muted">${tcLabel(c.tc)} · ${tcKind(c.tc)} · ${c.rated ? 'gewertet' : 'ungewertet'}</p>
          ${c.mine
            ? html`<p class="muted">Das ist deine eigene Einladung – schick den Link an einen Freund.</p>`
            : loggedIn()
            ? html`<button class="btn primary xl" disabled=${busy} onClick=${accept}><${Icon} name="play" /> Annehmen und spielen</button>`
            : html`<p class="muted">Zum Spielen brauchst du ein Konto – dauert 20 Sekunden.</p><${AuthCard} onDone=${load} />`}
        </div>`}
  </div>`;
}
