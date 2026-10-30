// Online-Partie gegen einen Menschen: Brett, Uhren, Remis/Aufgabe, Ergebnis mit Elo-Änderung.
import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { Chess } from '../../vendor/chess.js';
import { Board } from '../ui/Board.js';
import { Icon, Modal, Spinner, toast, confetti, CountUp } from '../ui/kit.js';
import { play, playMove } from '../lib/sound.js';
import { speakMove } from '../lib/speech.js';
import { sanDe, START_FEN } from '../lib/chess-util.js';
import { rankFor } from '../lib/store.js';
import { api, refreshMe, tcLabel, useNet } from '../lib/online.js';

const turnOf = (g) => (g.moves.length % 2 === 0 ? 'w' : 'b');
const fmt = (ms) => {
  if (ms === null || ms === undefined) return '∞';
  const t = Math.ceil(ms / 1000);
  if (ms < 10000) return `0:${String(Math.max(0, ms / 1000).toFixed(1)).padStart(4, '0')}`;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function OnlineGame({ id }) {
  const net = useNet();
  const [g, setG] = useState(null);
  const [side, setSide] = useState(null);
  const [err, setErr] = useState('');
  const [askResign, setAskResign] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [rematch, setRematch] = useState(null);
  const [presence, setPresence] = useState(null);
  const [, tick] = useState(0);
  const lastPing = useRef(0);
  const gRef = useRef(null);
  const sideRef = useRef(null);
  const recvAt = useRef(Date.now());
  const oppSince = useRef(Date.now());
  const lowBeep = useRef(0);

  const apply = (view, { sound = true } = {}) => {
    const prev = gRef.current;
    recvAt.current = Date.now();
    if (view.you && !sideRef.current) {
      sideRef.current = view.you;
      setSide(view.you);
    }
    gRef.current = view;
    setG(view);
    if (prev && view.moves.length > prev.moves.length && sound) {
      // Neuer Zug vom Gegner: Ton und (falls an) Ansage
      try {
        const c = new Chess();
        let m = null;
        for (const u of view.moves) m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        if (m && m.color !== sideRef.current) {
          playMove(m, c);
          speakMove(m.san, { color: m.color });
        }
      } catch {}
    }
    if (view.moves.length !== prev?.moves.length) oppSince.current = Date.now();
    if (view.status === 'over' && prev?.status === 'active') finished(view);
  };

  const finished = (view) => {
    setShowResult(true);
    refreshMe();
    const me = sideRef.current;
    const won = (view.result === '1-0' && me === 'w') || (view.result === '0-1' && me === 'b');
    if (view.reason === 'Abgebrochen') play('notify');
    else if (won) {
      play('win');
      confetti(80);
    } else if (view.result === '1/2-1/2') play('notify');
    else play('bad');
  };

  // Laden und regelmäßig nachsehen (schnell, wenn der Gegner am Zug ist)
  useEffect(() => {
    let alive = true;
    let timer = null;
    const loop = async () => {
      const cur = gRef.current;
      try {
        // Alle 20 s „ich bin da“ melden und sehen, ob der Gegner noch online ist
        const ping = !cur || (cur.status === 'active' && Date.now() - lastPing.current > 20000);
        if (ping) lastPing.current = Date.now();
        const r = await api('game.get', { id, ...(cur ? { v: cur.v } : {}), ...(ping ? { ping: true } : {}) });
        if (!alive) return;
        if (r.presence) setPresence(r.presence);
        // Antworten, die von einem neueren Stand überholt wurden (z. B. eigener Zug dazwischen), ignorieren
        const now = gRef.current;
        if (r.game && now && (r.game.v < now.v || (r.game.v === now.v && r.game.moves.length < now.moves.length))) r.game = null;
        if (r.game) {
          const first = !cur;
          apply(r.game, { sound: !first });
          // Gerade erst zu Ende (z. B. Seite neu geladen)? Dann das Ergebnis zeigen – alte Partien nicht.
          if (first && r.game.status === 'over' && r.game.ended && r.game.now - r.game.ended < 60000) setShowResult(true);
          if (first && r.game.status === 'active' && r.game.moves.length === 0) play('notify');
        } else if (r.same && gRef.current) {
          gRef.current = { ...gRef.current, clock: r.clock ?? gRef.current.clock, now: r.now ?? gRef.current.now };
          recvAt.current = Date.now();
          setG(gRef.current);
        }
      } catch (e) {
        if (e.status === 404) return setErr(e.message);
      }
      if (!alive) return;
      const v = gRef.current;
      if (!v || v.status !== 'active') return;
      const myTurn = sideRef.current && turnOf(v) === sideRef.current;
      const delay = document.visibilityState !== 'visible' ? 5000 : myTurn ? 4000 : Date.now() - oppSince.current < 15000 ? 1000 : 2000;
      timer = setTimeout(loop, delay);
    };
    loop();
    const vis = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        loop();
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [id]);

  // Kurz nach der Partie alle 4 s nach einer Revanche-Einladung sehen (2 Minuten lang)
  const recent = g?.status === 'over' && g.ended && g.now - g.ended < 120000;
  useEffect(() => {
    if (!recent) return;
    let n = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (++n > 30) return clearInterval(t);
      refreshMe();
    }, 4000);
    return () => clearInterval(t);
  }, [recent]);

  // Uhren flüssig herunterzählen
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 200);
    return () => clearInterval(i);
  }, []);

  const sans = useMemo(() => {
    if (!g) return [];
    const c = new Chess();
    return g.moves.map((u) => {
      try {
        return c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san;
      } catch {
        return u;
      }
    });
  }, [g?.moves.length, g?.id]);
  // Zugliste immer bis zum letzten Zug scrollen
  const movesRef = useRef(null);
  useEffect(() => {
    const el = movesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sans.length]);

  // Revanche: eigene Einladung abwarten oder die des Gegners annehmen
  const oppName = g && side ? g[side === 'w' ? 'b' : 'w'].name : null;
  const incomingRematch = g && g.status !== 'active' && oppName ? net.invites.find((c) => c.from.name === oppName) : null;
  const acceptRematch = async () => {
    try {
      const r = await api('challenge.accept', { cid: incomingRematch.cid });
      location.hash = `#/online/game/${r.game}`;
    } catch (e) {
      toast(e.message);
      refreshMe();
    }
  };
  useEffect(() => {
    if (!rematch) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await api('challenge.get', { cid: rematch.cid });
        if (r.game) location.hash = `#/online/game/${r.game}`;
        else if (r.declined) {
          toast(`${r.by || 'Dein Gegner'} will gerade keine Revanche.`);
          setRematch(null);
        }
      } catch (e) {
        if (e.status === 404) {
          toast('Keine Antwort auf die Revanche.');
          setRematch(null);
        }
      }
    }, 2500);
    return () => clearInterval(t);
  }, [rematch?.cid]);
  // Beide haben gleichzeitig „Revanche“ gedrückt: Einer (fest nach Namen) nimmt an, der andere wartet.
  useEffect(() => {
    if (!rematch || !incomingRematch || !side) return;
    if (g[side].name.toLowerCase() < oppName.toLowerCase()) {
      api('challenge.cancel', { cid: rematch.cid }).catch(() => {});
      acceptRematch();
    }
  }, [rematch?.cid, incomingRematch?.cid]);

  if (err) return html`<div class="page center-page"><h1>Partie nicht gefunden</h1><p class="muted">${err}</p><a class="btn primary" href="#/online">Zum Online-Bereich</a></div>`;
  if (!g) return html`<${Spinner} label="Partie wird geladen …" />`;

  const me = side;
  const opp = me === 'w' ? 'b' : 'w';
  const bottom = me || 'w';
  const top = bottom === 'w' ? 'b' : 'w';
  const active = g.status === 'active';
  const myTurn = active && me && turnOf(g) === me;
  const clockOf = (s) => {
    if (!g.clock) return null;
    let ms = g.clock[s];
    if (active && g.moves.length >= 2 && turnOf(g) === s) ms -= Date.now() - recvAt.current;
    return Math.max(0, ms);
  };
  const myClock = me ? clockOf(me) : null;
  if (myTurn && myClock !== null && myClock < 10000 && myClock > 0) {
    const sec = Math.ceil(myClock / 1000);
    if (lowBeep.current !== sec) {
      lowBeep.current = sec;
      play('tick');
    }
  }
  const serverNow = g.now + (Date.now() - recvAt.current);
  const firstLeft = g.firstDeadline ? Math.max(0, Math.ceil((g.firstDeadline - serverNow) / 1000)) : null;
  // Gegner offline, während seine Uhr läuft? Nach einer Minute kann man den Sieg beanspruchen (wie bei chess.com).
  const oppAway = !!(active && me && g.moves.length >= 2 && turnOf(g) === opp && presence && presence[opp] === false);
  const claimIn = oppAway ? Math.max(0, Math.ceil((60000 - (serverNow - g.turnAt)) / 1000)) : null;

  const onMove = async ({ from, to, promotion }) => {
    const v = gRef.current;
    if (!v || v.status !== 'active' || turnOf(v) !== sideRef.current) return;
    const c = new Chess(v.fen);
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = m.from + m.to + (m.promotion || '');
    playMove(m, c);
    // Sofort anzeigen, der Server bestätigt gleich
    const clock = v.clock && v.moves.length >= 2 ? { ...v.clock, [m.color]: v.clock[m.color] - (Date.now() - recvAt.current) + (v.tc?.inc || 0) * 1000 } : v.clock;
    const serverNow = v.now + (Date.now() - recvAt.current);
    const optimistic = { ...v, moves: [...v.moves, uci], fen: c.fen(), clock, now: serverNow, turnAt: serverNow, drawOffer: v.drawOffer && v.drawOffer !== m.color ? null : v.drawOffer };
    gRef.current = optimistic;
    recvAt.current = Date.now();
    oppSince.current = Date.now();
    setG(optimistic);
    try {
      const r = await api('game.move', { id, uci, ply: v.moves.length });
      if (r.game.v >= (gRef.current?.v || 0)) {
        gRef.current = v; // für den Vergleich in apply (kein doppelter Ton)
        apply({ ...r.game, you: null }, { sound: false });
      }
    } catch (e) {
      toast(e.message);
      const r = await api('game.get', { id }).catch(() => null);
      if (r?.game) {
        gRef.current = null;
        apply(r.game, { sound: false });
      }
    }
  };

  const act = async (a, extra = {}) => {
    try {
      const r = await api(a, { id, ...extra });
      const before = gRef.current;
      gRef.current = { ...before };
      apply(r.game, { sound: false });
    } catch (e) {
      toast(e.message);
    }
  };

  const playerBar = (s) => {
    const p = g[s];
    const rank = rankFor(p.r);
    const running = active && turnOf(g) === s;
    const ms = clockOf(s);
    return html`<div class=${`player ${running ? 'to-move' : ''}`}>
      <span class="player-name">
        <span class="on-avatar sm" style=${{ '--rank': rank.color }}><span class=${`piece-icon piece ${rank.icon}`}></span></span>
        <span>${p.name}</span><span class="elo-badge">${p.r}</span>${s === me ? html`<small class="on-you">du</small>` : active && presence && presence[s] === false ? html`<small class="on-off">offline</small>` : null}
      </span>
      ${g.tc ? html`<span class=${`clock ${running && g.moves.length >= 2 ? 'run' : ''} ${ms !== null && ms < 20000 ? 'low' : ''}`}>${fmt(ms)}</span>` : html`<span class="clock">∞</span>`}
    </div>`;
  };

  const last = g.moves.length ? [g.moves[g.moves.length - 1].slice(0, 2), g.moves[g.moves.length - 1].slice(2, 4)] : null;
  const result = (() => {
    if (g.status !== 'over') return null;
    if (g.reason === 'Abgebrochen') return { title: 'Partie abgebrochen', tone: 'draw' };
    if (g.result === '1/2-1/2') return { title: 'Remis', tone: 'draw' };
    const won = (g.result === '1-0' && me === 'w') || (g.result === '0-1' && me === 'b');
    if (!me) return { title: g.result === '1-0' ? 'Weiß gewinnt' : 'Schwarz gewinnt', tone: 'draw' };
    return { title: won ? 'Gewonnen!' : 'Verloren', tone: won ? 'win' : 'loss' };
  })();
  const rc = g.rc && me ? { diff: g.rc[me], now: me === 'w' ? g.rc.wNew : g.rc.bNew } : null;
  const rankChange = rc ? [rankFor(rc.now - rc.diff), rankFor(rc.now)] : null;

  const startRematch = async () => {
    try {
      const r = await api('challenge.create', { to: g[opp].name, tc: g.tc, color: opp, rated: g.rated });
      if (r.game) location.hash = `#/online/game/${r.game}`; // der Gegner wollte auch schon
      else setRematch(r.challenge);
    } catch (e) {
      toast(e.message);
    }
  };

  const analysis = `#/analysis?fen=${encodeURIComponent(START_FEN)}&moves=${g.moves.join(',')}`;
  return html`<div class="page game on-game">
    <div class="game-grid">
      <div class="game-board-col">
        ${playerBar(top)}
        <div class="board-with-eval">
          <${Board} fen=${g.fen} orientation=${bottom} movable=${myTurn ? me : null} onMove=${onMove} lastMove=${last} />
        </div>
        ${playerBar(bottom)}
      </div>
      <aside class="game-side">
        <div class="card coach-feed on-status">
          <small class="tag">${tcLabel(g.tc)} · ${g.rated ? 'gewertet' : 'ungewertet'}</small>
          ${active
            ? html`<p class="on-turn">${!me ? 'Du schaust zu.' : myTurn ? html`<b>Du bist am Zug.</b>` : html`<span class="thinking"><span class="thinking-dots"><i></i><i></i><i></i></span> ${g[opp].name} überlegt …</span>`}</p>
              ${firstLeft !== null && html`<p class="on-first">${turnOf(g) === me ? `Mach deinen ersten Zug – noch ${firstLeft} s` : `Warte auf den ersten Zug – noch ${firstLeft} s`}</p>`}
              ${g.drawOffer && g.drawOffer !== me && me && html`<div class="on-offer"><span><b>${g[opp].name}</b> bietet Remis an.</span>
                <div class="btn-row"><button class="btn primary" onClick=${() => act('game.draw', { act: 'accept' })}>Annehmen</button><button class="btn ghost" onClick=${() => act('game.draw', { act: 'decline' })}>Ablehnen</button></div></div>`}
              ${g.drawOffer === me && html`<p class="muted small">Remis angeboten – warte auf Antwort …</p>`}
              ${oppAway && html`<div class="on-away">
                <span><b>${g[opp].name}</b> ist offline.</span>
                ${claimIn > 0
                  ? html`<small>Kommt ${g[opp].name} nicht zurück, kannst du in ${claimIn} s den Sieg beanspruchen.</small>`
                  : html`<button class="btn primary" onClick=${() => act('game.claim')}><${Icon} name="trophy" /> Sieg beanspruchen</button>`}
              </div>`}`
            : html`<p class="on-turn"><b>${result?.title}</b> · ${g.reason}</p>`}
        </div>
        ${sans.length > 0 &&
        html`<div class="card moves" ref=${movesRef}>
          <div class="move-list">
            ${sans.map((san, i) => html`${i % 2 === 0 ? html`<span class="mv-num">${i / 2 + 1}.</span>` : null}<span class="mv">${sanDe(san)}</span>`)}
          </div>
        </div>`}
        ${me && active && html`<div class="game-actions">
          <button class="btn ghost" disabled=${g.moves.length < 2 || g.drawOffer === me} onClick=${() => act('game.draw', { act: 'offer' })}><${Icon} name="repeat" /> Remis</button>
          <button class="btn ghost danger" onClick=${() => setAskResign(true)}><${Icon} name="flag" /> ${g.moves.length < 2 ? 'Abbrechen' : 'Aufgeben'}</button>
        </div>`}
        ${!active && html`<div class="btn-row">
          ${me && html`<button class="btn primary" onClick=${() => setShowResult(true)}><${Icon} name="trophy" /> Ergebnis</button>`}
          <a class="btn ghost" href=${analysis}><${Icon} name="scope" /> Analysieren</a>
          <a class="btn ghost" href="#/online">Neues Spiel</a>
        </div>`}
      </aside>
    </div>

    ${askResign &&
    html`<${Modal} onClose=${() => setAskResign(false)}>
      <div class="game-over">
        <h2>${g.moves.length < 2 ? 'Partie abbrechen?' : 'Wirklich aufgeben?'}</h2>
        <p class="muted">${g.moves.length < 2 ? 'Vor dem ersten Zug zählt das nicht für die Elo.' : 'Die Partie zählt dann als Niederlage.'}</p>
        <div class="btn-row center">
          <button class="btn ghost" onClick=${() => setAskResign(false)}>Weiterspielen</button>
          <button class="btn primary" onClick=${() => {
            setAskResign(false);
            act('game.resign');
          }}><${Icon} name="flag" /> ${g.moves.length < 2 ? 'Abbrechen' : 'Aufgeben'}</button>
        </div>
      </div>
    <//>`}

    ${showResult && result && me &&
    html`<${Modal} onClose=${() => setShowResult(false)}>
      <div class="game-over on-result">
        <div class=${`go-badge ${result.tone === 'win' ? 'win' : result.tone === 'loss' ? 'loss' : 'draw'}`}>${result.title}</div>
        <p class="muted">${g.reason} · gegen ${g[opp].name}</p>
        ${rc
          ? html`<div class="on-elochange">
              <span class="on-elo-now"><${CountUp} to=${rc.now} /></span>
              <span class=${`on-rc ${rc.diff >= 0 ? 'up' : 'down'}`}>${rc.diff >= 0 ? '+' : ''}${rc.diff}</span>
            </div>
            ${rankChange && rankChange[0].name !== rankChange[1].name && html`<p class="on-rankup">${rankChange[1].index > rankChange[0].index ? '🎉 Neuer Rang: ' : 'Neuer Rang: '}<b>${rankChange[1].name}</b></p>`}`
          : html`<p class="muted small">${g.reason === 'Abgebrochen' ? 'Abgebrochene Partien zählen nicht.' : 'Ungewertet – deine Elo bleibt gleich.'}</p>`}
        ${rematch
          ? html`<p class="muted"><span class="thinking-dots"><i></i><i></i><i></i></span> Warte auf ${g[opp].name} …</p>`
          : incomingRematch
          ? html`<p class="muted"><b>${g[opp].name}</b> will eine Revanche.</p>
              <button class="btn primary xl" onClick=${acceptRematch}><${Icon} name="repeat" /> Revanche annehmen</button>`
          : null}
        <div class="btn-row center">
          ${!rematch && !incomingRematch && g.reason !== 'Abgebrochen' && html`<button class="btn primary" onClick=${startRematch}><${Icon} name="repeat" /> Revanche</button>`}
          <a class="btn secondary" href="#/online"><${Icon} name="bolt" /> Neues Spiel</a>
          <a class="btn ghost" href=${analysis}><${Icon} name="scope" /> Analysieren</a>
        </div>
      </div>
    <//>`}
  </div>`;
}
