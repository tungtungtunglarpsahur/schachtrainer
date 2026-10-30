// Verbindung zum Learning-King-Server: Konto (angemeldet bleiben), Fortschritt-Sicherung,
// Einladungen und Partien. Der Server liegt unter /api/lk (Vercel-Funktion).
import { useEffect, useReducer } from '../../vendor/preact-htm.js';
import { state, update, replaceState, subscribe } from './store.js';
import { toast } from '../ui/kit.js';
import { play } from './sound.js';

const SKEY = 'lk.session';
const listeners = new Set();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

let sess = (() => {
  try {
    return JSON.parse(localStorage.getItem(SKEY)) || null;
  } catch {
    return null;
  }
})();

/** Gemeinsamer Online-Zustand für die Oberfläche. */
export const net = { user: sess?.user || null, invites: [], game: null, outgoing: 0, setup: false, offline: false };

export function useNet() {
  const [, force] = useReducer((x) => x + 1, 0);
  const seen = version;
  useEffect(() => {
    listeners.add(force);
    // Kam zwischen dem ersten Zeichnen und jetzt etwas Neues an (z. B. eine Einladung)? Dann neu zeichnen.
    if (version !== seen) force();
    return () => listeners.delete(force);
  }, []);
  return net;
}
export const loggedIn = () => !!sess?.token;

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(a, data = {}) {
  let res;
  try {
    res = await fetch('api/lk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(sess?.token ? { Authorization: `Bearer ${sess.token}` } : {}) },
      body: JSON.stringify({ a, ...data }),
    });
  } catch {
    if (!net.offline) {
      net.offline = true;
      emit();
    }
    throw new ApiError('Keine Verbindung – bist du online?', 0, 'offline');
  }
  let body = {};
  try {
    body = await res.json();
  } catch {}
  if (net.offline) {
    net.offline = false;
    emit();
  }
  if (!res.ok) {
    if (res.status === 401 && body.code === 'auth' && sess) signOutLocal();
    if (body.code === 'setup' && !net.setup) {
      net.setup = true;
      emit();
    }
    if (res.status === 404 && !body.error) throw new ApiError('Online-Spiele gibt es nur auf der Hauptseite der App.', 404, 'missing');
    throw new ApiError(body.error || 'Da ist etwas schiefgelaufen.', res.status, body.code);
  }
  return body;
}

function remember(user) {
  net.user = user;
  if (sess) {
    sess.user = user;
    try {
      localStorage.setItem(SKEY, JSON.stringify(sess));
    } catch {}
  }
  if (!state.online || state.online.r !== user.r || state.online.name !== user.name)
    update((s) => {
      s.online = { name: user.name, r: user.r };
    });
}

function saveSession(token, user) {
  sess = { token, user };
  try {
    localStorage.setItem(SKEY, JSON.stringify(sess));
  } catch {}
  remember(user);
  emit();
}

function signOutLocal() {
  sess = null;
  try {
    localStorage.removeItem(SKEY);
  } catch {}
  net.user = null;
  net.invites = [];
  net.game = null;
  update((s) => {
    s.online = null;
  });
  emit();
}

// ---------- Fortschritt sichern ----------
let pushTimer = null;
let dirty = false;
let muted = false;
const snapshot = () => {
  const { online, ...rest } = state;
  return rest;
};
const score = (d) => (d?.xp || 0) + (d?.puzzle?.solved || 0) * 3 + Object.keys(d?.lessons || {}).length * 25 + (d?.games?.length || 0) * 10;

export async function pushProgress() {
  if (!sess?.token) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  try {
    await api('sync.put', { at: Date.now(), data: snapshot() });
    dirty = false;
  } catch {}
}

/** Nach dem Anmelden: Fortschritt vom Server holen – außer dieses Gerät hat deutlich mehr. */
export async function pullProgress() {
  try {
    const r = await api('sync.get');
    const d = r.data;
    // Nur übernehmen, wenn der Server einen echten Stand hat und dieses Gerät nicht mehr Fortschritt hat.
    if (d && d.v === 1 && d.profile?.onboarded && (!state.profile.onboarded || score(d) >= score(state))) {
      muted = true;
      replaceState({ ...d, online: state.online });
      muted = false;
      return true;
    }
    await pushProgress();
  } catch {}
  return false;
}

// Höchstens alle 90 s sichern (schont die kostenlose Datenbank) – und sofort, wenn die App
// in den Hintergrund geht oder geschlossen wird.
const PUSH_EVERY = 90000;
subscribe(() => {
  if (!sess?.token || muted) return;
  dirty = true;
  if (!pushTimer) pushTimer = setTimeout(pushProgress, PUSH_EVERY);
});
const flush = () => {
  if (dirty && sess?.token) pushProgress();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
addEventListener('pagehide', flush);

// ---------- Konto ----------
export async function register({ name, pass, start, fromTest }) {
  const r = await api('register', { name, pass, start, fromTest });
  saveSession(r.token, r.user);
  await pushProgress();
  startLoop();
  return r.user;
}
export async function login({ name, pass }) {
  const r = await api('login', { name, pass });
  saveSession(r.token, r.user);
  const restored = await pullProgress();
  startLoop();
  return { user: r.user, restored };
}
export async function logout() {
  await pushProgress();
  try {
    await api('logout');
  } catch {}
  signOutLocal();
}

// ---------- Regelmäßig nachsehen (Einladungen, laufende Partie) ----------
let loop = null;
let fast = false;
let seenOnce = false;
const declined = new Set(); // gerade abgelehnt – nicht wieder auftauchen lassen, bis der Server es weiß

/** Einladung annehmen: Partie startet, direkt hin. */
export async function acceptInvite(c) {
  const r = await api('challenge.accept', { cid: c.cid });
  net.invites = net.invites.filter((x) => x.cid !== c.cid);
  emit();
  location.hash = `#/online/game/${r.game}`;
  return r.game;
}
/** Einladung ablehnen – verschwindet sofort, der andere sieht „abgelehnt“. */
export async function declineInvite(c) {
  declined.add(c.cid);
  net.invites = net.invites.filter((x) => x.cid !== c.cid);
  emit();
  try {
    await api('challenge.cancel', { cid: c.cid });
  } catch {}
}
export async function refreshMe() {
  if (!sess?.token) return null;
  try {
    const r = await api('me', { ping: true });
    const before = new Set(net.invites.map((c) => c.cid));
    const prevGame = net.game?.id || null;
    remember(r.user);
    net.invites = (r.invites || []).filter((c) => !declined.has(c.cid));
    net.game = r.game;
    net.outgoing = r.outgoing || 0;
    net.setup = false;
    emit();
    // Neue Herausforderung? Ton – das Fenster mit Annehmen/Ablehnen erscheint von selbst.
    // (In Lektionen gibt es kein Fenster, dort nur ein kurzer Hinweis.)
    const fresh = net.invites.filter((c) => !before.has(c.cid));
    if (seenOnce && fresh.length && !/^#\/online\/game\//.test(location.hash)) {
      play('notify');
      if (/^#\/(lesson|puzzles\/placement)/.test(location.hash))
        toast(`**${fresh[0].from.name}** fordert dich heraus – nach der Lektion annehmen.`, { ms: 5000 });
    }
    // Jemand hat deine Einladung angenommen? Dann direkt zur Partie (wie bei chess.com).
    const g = net.game;
    if (g && g.id !== prevGame && g.moves === 0 && !location.hash.startsWith(`#/online/game/${g.id}`)) {
      play('notify');
      toast(`Deine Partie gegen **${g.vs}** beginnt!`);
      location.hash = `#/online/game/${g.id}`;
    }
    seenOnce = true;
    return r;
  } catch {
    return null;
  }
}
function startLoop() {
  if (loop) return;
  refreshMe();
  let tick = 0;
  loop = setInterval(() => {
    tick++;
    if (!sess?.token || document.visibilityState !== 'visible') return;
    // Im Online-Bereich (oder wenn eine eigene Einladung offen ist) alle 15 s, sonst jede Minute –
    // schont die kostenlose Datenbank.
    if (fast || net.outgoing > 0 || tick % 4 === 0) refreshMe();
  }, 15000);
}
/** Online-Bereich offen? Dann öfter nach Einladungen sehen. */
export function setFastPolling(on) {
  fast = on;
  if (on) refreshMe();
}
if (sess?.token) startLoop();

// ---------- Kleine Helfer für die Oberfläche ----------
export const tcLabel = (tc) => (!tc ? 'Ohne Uhr' : `${tc.m} + ${tc.inc}`);
export const tcKind = (tc) => {
  if (!tc) return 'Fernschach';
  const t = tc.m * 60 + tc.inc * 40;
  return t < 180 ? 'Bullet' : t < 480 ? 'Blitz' : t < 1500 ? 'Schnell' : 'Klassisch';
};
export const POOLS = [
  { id: '3+2', m: 3, inc: 2, kind: 'Blitz' },
  { id: '5+3', m: 5, inc: 3, kind: 'Blitz' },
  { id: '10+0', m: 10, inc: 0, kind: 'Schnell' },
  { id: '15+10', m: 15, inc: 10, kind: 'Schnell' },
];
export const START_LEVELS = [
  { elo: 400, title: 'Neu im Schach', sub: 'Ich lerne gerade die Regeln' },
  { elo: 800, title: 'Anfänger', sub: 'Ich kenne die Regeln und spiele ab und zu' },
  { elo: 1200, title: 'Fortgeschritten', sub: 'Ich spiele regelmäßig und kenne Taktiken' },
  { elo: 1800, title: 'Profi', sub: 'Vereinsspieler mit Turniererfahrung' },
];
export const joinLink = (cid) => `${location.origin}${location.pathname}#/online/join/${cid}`;
