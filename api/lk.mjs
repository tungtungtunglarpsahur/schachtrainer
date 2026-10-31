// Learning King – Online-Server (eine einzige Vercel-Funktion unter /api/lk).
// Konten, Fortschritt-Sync, Freunde, Einladungen (eigene Spiele), Matchsuche, Partien mit Uhr
// und Wertung nach Glicko-2 (wie chess.com/lichess). Daten liegen in Upstash Redis.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Chess } from './_lib/chess.mjs';
import { configured, cmd, multi, getJSON, hgetall, casJSON } from './_lib/db.mjs';
import { update as glicko, inflate, provisional, START_RD, START_VOL } from './_lib/glicko.mjs';

const scrypt = promisify(scryptCb);
const DAY = 86400;
const GAME_TTL = 14 * DAY;
const SESSION_TTL = 400 * DAY;
const CH_TTL = 30 * 60;
// So lange hat jede Seite für ihren ersten Zug, sonst wird abgebrochen. Bei Einladungen etwas länger,
// weil der Herausforderer vielleicht gerade woanders in der App ist.
const firstMoveMs = (g) => (g.cid ? 60000 : 40000);
const ABANDON_MS = 60000; // so lange muss der Gegner am Zug und offline sein, bevor man den Sieg beanspruchen kann
const POOLS = { '3+2': [3, 2], '5+3': [5, 3], '10+0': [10, 0], '15+10': [15, 10] };
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (message, status = 400, code) => {
  throw new HttpError(status, message, code);
};

// ---------- Hilfen ----------
const idOf = (n) => String(n || '').trim().toLowerCase();
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const RESERVED = new Set(['admin', 'learningking', 'learning_king', 'support', 'system', 'moderator', 'mod', 'stockfish', 'gast', 'guest', 'null', 'undefined', 'testbot']);
const BAD = ['nazi', 'hitler', 'fick', 'fuck', 'hure', 'nutte', 'wichs', 'schwuchtel', 'nigg', 'neger', 'penis', 'vagina', 'porn', 'fotze', 'kanake', 'arschloch', 'bitch', 'slut', 'whore', 'cunt'];
const token = (n = 24) => randomBytes(n).toString('base64url');
const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

async function hashPass(pass, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(String(pass), salt, 32);
  return { salt, hash: key.toString('hex') };
}
async function checkPass(pass, salt, hash) {
  const { hash: h } = await hashPass(pass, salt);
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const rankOf = (r) =>
  r >= 2100 ? 'Learning King' : r >= 1800 ? 'König' : r >= 1500 ? 'Dame' : r >= 1200 ? 'Turm' : r >= 900 ? 'Läufer' : r >= 600 ? 'Springer' : 'Bauer';

const pub = (u) =>
  u && {
    name: u.name,
    r: Math.round(num(u.r, 800)),
    rd: Math.round(num(u.rd, START_RD)),
    prov: provisional(num(u.rd, START_RD)),
    rank: rankOf(num(u.r, 800)),
    games: num(u.games),
    w: num(u.w),
    l: num(u.l),
    d: num(u.d),
    peak: Math.round(num(u.peak, num(u.r, 800))),
    created: num(u.created),
  };

async function rateLimit(key, max, windowSec) {
  const n = await cmd('INCR', `rl:${key}`);
  if (n === 1) await cmd('EXPIRE', `rl:${key}`, windowSec);
  if (n > max) fail('Zu viele Versuche – warte kurz und probier es dann nochmal.', 429);
}

async function auth(req, required = true) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const id = t && t.length < 100 ? await cmd('GET', `s:${t}`) : null;
  if (!id) {
    if (required) fail('Bitte melde dich an.', 401, 'auth');
    return null;
  }
  const user = await hgetall(`u:${id}`);
  if (!user) {
    if (required) fail('Konto nicht gefunden.', 401, 'auth');
    return null;
  }
  return { id, user, token: t };
}

// ---------- Partien ----------
const sideOf = (g, id) => (g.w === id ? 'w' : g.b === id ? 'b' : null);
const turnOf = (g) => (g.moves.length % 2 === 0 ? 'w' : 'b');
const replay = (g) => {
  const c = new Chess();
  for (const m of g.moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  return c;
};

/** Kann diese Seite mit dem, was sie noch hat, überhaupt mattsetzen? (für „Zeit abgelaufen“) */
function canMate(c, side) {
  let minor = 0;
  for (const row of c.board())
    for (const p of row) {
      if (!p || p.color !== side) continue;
      if (p.type === 'p' || p.type === 'r' || p.type === 'q') return true;
      if (p.type === 'n' || p.type === 'b') minor++;
    }
  return minor >= 2;
}

/** Uhrzeiten jetzt (die laufende Uhr ist schon heruntergezählt). */
function liveClock(g, now = Date.now()) {
  if (!g.tc || !g.clock) return null;
  const c = { ...g.clock };
  if (g.status === 'active' && g.moves.length >= 2) c[turnOf(g)] = Math.max(0, c[turnOf(g)] - (now - g.turnAt));
  return c;
}

function view(g, me) {
  const now = Date.now();
  return {
    v: g.v,
    id: g.id,
    w: { name: g.wn, r: g.wr, rank: rankOf(g.wr) },
    b: { name: g.bn, r: g.br, rank: rankOf(g.br) },
    you: sideOf(g, me),
    rated: g.rated,
    tc: g.tc,
    moves: g.moves,
    fen: g.fen,
    clock: liveClock(g, now),
    firstDeadline: g.status === 'active' && g.moves.length < 2 ? g.turnAt + firstMoveMs(g) : null,
    turnAt: g.turnAt,
    status: g.status,
    result: g.result,
    reason: g.reason,
    drawOffer: g.drawOffer,
    rc: g.rc || null,
    created: g.created,
    ended: g.endedAt || null,
    bot: g.bot || null,
    botStyle: g.botStyle || null,
    now,
  };
}

async function createGame(a, b, { tc, rated, colorFor = 'r', cid = null }) {
  const [ua, ub] = await Promise.all([hgetall(`u:${a}`), hgetall(`u:${b}`)]);
  if (!ua || !ub) fail('Spieler nicht gefunden.', 404);
  let white = a;
  let black = b;
  if (colorFor === 'b' || (colorFor === 'r' && Math.random() < 0.5)) [white, black] = [b, a];
  const uw = white === a ? ua : ub;
  const ubk = white === a ? ub : ua;
  const ms = tc ? Math.round(tc.m * 60000) : null;
  const now = Date.now();
  const g = {
    v: 1,
    id: token(6),
    w: white,
    b: black,
    wn: uw.name,
    bn: ubk.name,
    wr: Math.round(num(uw.r, 800)),
    br: Math.round(num(ubk.r, 800)),
    rated: !!rated,
    tc: tc || null,
    moves: [],
    fen: START_FEN,
    clock: tc ? { w: ms, b: ms } : null,
    turnAt: now,
    created: now,
    status: 'active',
    result: null,
    reason: null,
    drawOffer: null,
    rc: null,
    cid,
  };
  await multi([
    ['SET', `g:${g.id}`, JSON.stringify(g), 'EX', GAME_TTL],
    ['SET', `ug:${white}`, g.id, 'EX', 12 * 3600],
    ['SET', `ug:${black}`, g.id, 'EX', 12 * 3600],
  ]);
  return g;
}

// ---------- Bot-Gegner für die Matchsuche ----------
// Ist nach 10–20 Sekunden (zufällig je Suche) kein Mensch da, spielt man gegen einen Bot mit einem
// echt wirkenden Namen. Jeder Name hat eine feste „Heim-Elo“ und einen Spielstil – so passt alles zusammen.
const BOT_AFTER_ENV = Number(process.env.LK_BOT_AFTER) || 0;
const botAfter = () => BOT_AFTER_ENV || Math.round(10 + Math.random() * 10);
/** Suchfenster für Menschen: wächst schnell, weil nach spätestens 20 s ein Bot kommt. */
const matchWindow = (waited) => (waited > 25 ? 5000 : Math.round(150 + waited * 35));
const BOT_NAMES = [
  'getownedlol', 'sinistermaxin666', 'sinistermax666', 'bxnabi', 'bxn_abi', '_608_', 'six08', '608vibes', 'ezclap',
  'ggezlol', 'skillissue', 'skillissue99', 'cryaboutit', 'touchgrass', 'gotouchgrass', 'wompwomp', 'wompwomp67',
  'unluckybro', 'malding', 'maldingmax', 'cookedfr', 'imsocooked', 'nocapfr', 'frfrnocap', 'deadassbro',
  'bruhmoment', 'bruhhh', 'sheeesh', 'yeetusdeletus', 'lowkeygoated', 'highkeytrash', 'uaregoated', 'ratiodlol',
  'lplusratio', 'wrizzwill', 'rizzlerben', 'sigmalukas', 'sigmagrindset', 'gigachadtim', 'aurafarmer', 'aurafarming',
  'npcnils', 'maincharacter', 'sidequestsid', 'fanumtax', 'brainrotbo', 'delulu', 'skibidiknight', 'skibidirizz',
  'ohiorook', 'ohiobishop', 'mewingmax', 'sixseven67', 'sixsevenking', '67kid', 'tungtungsahur', 'tralalero',
  'bombardiro', 'patapim', 'lirililarila', 'cappuccinoninja', 'chimpanzini', 'enpassantgod', 'holyhell',
  'googleenpassant', 'bongcloudking', 'bongcloudmain', 'hangingqueen', 'freequeen', 'queenblunder', 'blunderking',
  'blundermachine', 'hangmyqueen', 'sacthequeen', 'sacrificelord', 'gambitgoblin', 'londonmain', 'londonsystem',
  'carokannenjoyer', 'sizilianer', 'sicilianmain', 'kingsgambit', 'fianchettoking', 'fianchettofan', 'zugzwangzach',
  'pawnstorm', 'pawnstorm2010', 'pawnpusher', 'knightrider', 'horsey', 'horseyenjoyer', 'thehorseyguy',
  'bishoplover', 'longcastle', 'shortcastle', 'stalematelord', 'pattpeter', 'remisrudi', 'elohell', 'elofarmer',
  'elohunter', 'ratingfarmer', '800elogod', 'queentrader', 'mateinone', 'mateinfun', 'smotheredking', 'scholarsmate',
  'schaefermatt', 'fourmovemate', 'forkmaster', 'gabelgott', 'fesselfred', 'spiessbuerger', 'turmtom',
  'laeuferlukas', 'springerjunge', 'bauernopfer', 'damentausch', 'mattin2', 'checkcheckmate', 'rochaderalf',
  'enpassanted', 'damenopfer', 'tiltedtobi', 'schachmattsam', 'kingslayerk', 'dragondan', 'caroklaus', 'mrmoves',
  'checkmatechris', 'ghostrook', 'lowkeygm', 'nocapchess', 'susspringer', 'bruhmoment77', 'toxictobi',
  'captaincheck', 'mattmeister', 'xxturmxx', 'bauerbernd', 'springersven', 'ohneplan88', 'pferdefanlea',
  'noscopebishop', 'lukas2009', 'leon2010', 'finn07', 'jonas14', 'paulgg', 'timmy2011', 'maxi2008', 'emilxd',
  'noahhh', 'eliasz', 'benni09', 'felixxx', 'moritz08', 'niklas2010', 'jannik11', 'lucagg', 'ali2009', 'mert07',
  'yusuf2010', 'emre2008', 'can09', 'deniz2011', 'kaan07', 'mehmet10', 'omar2009', 'karim08', 'ahmedxd', 'aylin2010',
  'leonie09', 'mia2011', 'emmaxo', 'hannah08', 'lilly2010', 'lenaxd', 'sophie11', 'marie2009', 'leagg', 'anna2008',
  'sarah10', 'julia09', 'nele2011', 'julexo', 'ella2010', 'zoe07', 'kevin2011', 'leonking07', 'miaplays', 'emilyx3',
  'noobmaster09', 'finnff', 'jonash', 'alik13', 'mertgg', 'deniz07', 'yusufxd', 'lucalol', 'paulpwnz', 'annabanana',
  'timtamtom', 'lillyxo', 'hannahb', 'jannik2010', 'maximx', 'niklas99', 'ben10', 'moritzftw', 'lealol', 'sophiech',
  'ayokarim', 'omarmvp', 'emirx', 'eliassz', 'noahk', 'louisv', 'vincent08', 'timott', 'lukasgg', 'felixfx',
  'janole', 'xxsniperxx', 'darkknight666', 'shadowhunter', 'nightfury', 'toxicgamer', 'proplayer2010', 'noobslayer',
  'dragonslayer', 'voidwalker', 'silentassassin', 'sweatlord', 'tryhardtim', 'ragequitter', 'alttabber', 'afkking',
  'brbmom', 'basementking', 'gamingchair', 'rgbking', 'kebabking', 'doenerdame', 'doenerboss', 'pommesking',
  'currywurst', 'bratwurstbob', 'pizzapawn', 'nudelnaldo', 'schnitzelsam', 'nutellanoob', 'gummibaer',
  'kartoffelkopf', 'toastbrot', 'apfelschorle', 'eistee', 'maultasche', 'brezelbub', 'spaetzlespieler', 'schachopa',
  'papajens', 'klaus1965', 'wernerschach', 'petrak', 'bernd1971', 'schachfreund', 'derspringer', 'chessfan2012',
  'tom1987', 'julian_k', 'checkmatemachine', 'wallahkrise', 'digga2009', 'diggaaa', 'brudermoment', 'alterschwede',
  'ehrenmann', 'ehrenlos', 'lostking', 'sadboy07', 'tiltproof', 'quickscoper', 'ragequit', 'campingking',
  'goofygambit', 'amogusrook', 'sk8erboi09', 'goofyahh', 'grindinggreg', 'xdxaver', 'sheeshsven', 'yeetyannik',
  'cookedcris', 'npcenergy', 'rizzmaster', 'chessrizz', 'checkmyrizz', 'gyrorook', 'loserbracket', 'letmecook',
  'justwin', 'ihatelosing', 'pleasebenice', 'idkchess', 'newtochess', 'learningchess', 'chessisfun', 'justvibing',
  'vibecheck', 'vibingknight', 'sleepyking', 'lazybishop', 'angrypawn', 'happyrook', 'crazyqueen', 'chillknight',
  'madbishop',
];
const hash32 = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};
const STYLES = ['balanced', 'attack', 'tactical', 'solid'];
const BOTS = BOT_NAMES.map((name) => {
  const h = hash32(name);
  return { name, id: idOf(name), home: 350 + (h % 1750), style: STYLES[(h >>> 12) % STYLES.length] };
});
const BOT_IDS = new Set(BOTS.map((b) => b.id));
const rand = (a, b) => a + Math.random() * (b - a);

/** Passende Bot-Person zur Elo: erst ganz in der Nähe suchen, dann weiter; nie einen echten Namen. */
async function pickBot(r) {
  for (const range of [120, 250, 500, 5000]) {
    const near = BOTS.filter((b) => Math.abs(b.home - r) <= range).sort(() => Math.random() - 0.5).slice(0, 6);
    if (!near.length) continue;
    const real = await multi(near.map((b) => ['GET', `n:${b.id}`]));
    const free = near.filter((_, i) => !real[i]);
    if (free.length) return free[0];
  }
  return BOTS[Math.floor(Math.random() * BOTS.length)];
}

async function createBotGame(me, { tc, persona = null, rating = null, humanColor = null }) {
  const r = Math.round(num(me.user.r, 800));
  const bot = persona || (await pickBot(r));
  let botR = rating ?? (Math.abs(bot.home - r) <= 150 ? bot.home : r + rand(-60, 60)) + rand(-20, 20);
  botR = Math.max(100, Math.round(botR));
  const humanWhite = humanColor ? humanColor === 'w' : Math.random() < 0.5;
  const bid = `~${bot.id}`;
  const ms = Math.round(tc.m * 60000);
  const now = Date.now();
  const g = {
    v: 1,
    id: token(6),
    w: humanWhite ? me.id : bid,
    b: humanWhite ? bid : me.id,
    wn: humanWhite ? me.user.name : bot.name,
    bn: humanWhite ? bot.name : me.user.name,
    wr: humanWhite ? r : botR,
    br: humanWhite ? botR : r,
    rated: true,
    tc,
    moves: [],
    fen: START_FEN,
    clock: { w: ms, b: ms },
    turnAt: now,
    created: now,
    status: 'active',
    result: null,
    reason: null,
    drawOffer: null,
    rc: null,
    cid: null,
    bot: humanWhite ? 'b' : 'w',
    botStyle: bot.style,
  };
  await multi([['SET', `g:${g.id}`, JSON.stringify(g), 'EX', GAME_TTL], ['SET', `ug:${me.id}`, g.id, 'EX', 12 * 3600]]);
  return g;
}

/** Ergebnis eintragen (nur einmal dank Compare-and-Set) und Wertungen anpassen. */
async function endGame(g, result, reason) {
  const before = g.v;
  const over = { ...g, v: g.v + 1, status: 'over', result, reason, drawOffer: null, endedAt: Date.now() };
  if (g.tc && g.clock) over.clock = liveClock(g);
  const aborted = reason === 'Abgebrochen';
  const sw = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
  const cmds = [];
  // Wertung VOR dem Speichern ausrechnen – so sieht jeder, der das Ende liest, sofort die Elo-Änderung.
  const humans = ['w', 'b'].filter((s) => s !== g.bot); // bei Bot-Partien nur der Mensch
  if (over.rated && !aborted) {
    const now = Date.now();
    // Bot-Gegner zählen wie ein eingespielter Spieler mit ihrer angezeigten Elo
    const load = async (s) => {
      if (s === g.bot) return { u: null, P: { r: num(s === 'w' ? g.wr : g.br, 800), rd: 70, vol: START_VOL } };
      const u = (await hgetall(`u:${g[s]}`)) || {};
      return { u, P: { r: num(u.r, 800), rd: inflate(num(u.rd, START_RD), num(u.vol, START_VOL), num(u.last), now), vol: num(u.vol, START_VOL) } };
    };
    const [W, B] = await Promise.all([load('w'), load('b')]);
    const nw = glicko(W.P, B.P, sw);
    const nb = glicko(B.P, W.P, 1 - sw);
    over.rc = { w: Math.round(nw.r) - Math.round(W.P.r), b: Math.round(nb.r) - Math.round(B.P.r), wNew: Math.round(nw.r), bNew: Math.round(nb.r) };
    const key = (x) => (x === 1 ? 'w' : x === 0 ? 'l' : 'd');
    for (const [s, cur, nxt, score] of [['w', W, nw, sw], ['b', B, nb, 1 - sw]]) {
      if (s === g.bot) continue;
      const id = g[s];
      cmds.push(
        ['HSET', `u:${id}`, 'r', nxt.r.toFixed(2), 'rd', nxt.rd.toFixed(2), 'vol', nxt.vol.toFixed(5), 'last', now, 'peak', Math.max(num(cur.u.peak), nxt.r).toFixed(0)],
        ['HINCRBY', `u:${id}`, 'games', 1],
        ['HINCRBY', `u:${id}`, key(score), 1],
        ['ZADD', 'lb', nxt.r.toFixed(2), id],
      );
    }
  }
  if (!(await casJSON(`g:${g.id}`, before, over, GAME_TTL))) return null; // jemand anderes war schneller
  if (!aborted) {
    const sum = (me) => JSON.stringify({ id: g.id, at: Date.now(), you: sideOf(g, me), w: g.wn, b: g.bn, wr: g.wr, br: g.br, result, reason, rated: over.rated, rc: over.rc ? (me === g.w ? over.rc.w : over.rc.b) : null, moves: g.moves.length });
    for (const s of humans) cmds.push(['LPUSH', `h:${g[s]}`, sum(g[s])], ['LTRIM', `h:${g[s]}`, 0, 29]);
  }
  cmds.push(['DEL', ...humans.map((s) => `ug:${g[s]}`)]);
  await multi(cmds);
  return over;
}

/** Zeit abgelaufen oder erster Zug nicht gemacht? Dann jetzt beenden. */
async function checkClock(g) {
  if (g.status !== 'active') return g;
  const now = Date.now();
  if (g.moves.length < 2) {
    if (now - g.turnAt > firstMoveMs(g)) return (await endGame(g, '1/2-1/2', 'Abgebrochen')) || (await getJSON(`g:${g.id}`));
    return g;
  }
  if (!g.tc) return g;
  const side = turnOf(g);
  if (side === g.bot) return g; // Bot zieht über das Gerät des Menschen – ist der weg, soll er nicht „auf Zeit“ gewinnen
  if (g.clock[side] - (now - g.turnAt) > 0) return g;
  const other = side === 'w' ? 'b' : 'w';
  const draw = !canMate(replay(g), other);
  const res = draw ? '1/2-1/2' : other === 'w' ? '1-0' : '0-1';
  return (await endGame(g, res, draw ? 'Zeit abgelaufen – zu wenig Material' : 'Zeit abgelaufen')) || (await getJSON(`g:${g.id}`));
}

// ---------- Aktionen ----------
const A = {};

A.health = async () => {
  if (!configured) return { ok: true, configured, db: 'fehlt' };
  try {
    return { ok: true, configured, db: (await cmd('PING')) === 'PONG' ? 'ok' : 'komisch' };
  } catch (e) {
    return { ok: false, configured, db: 'Fehler: ' + String(e.message || e).slice(0, 80) };
  }
};

/** Gründlicher Selbsttest (nur Wegwerf-Schlüssel): klappt alles, was Partien und Konten brauchen? */
async function deepHealth(ip) {
  await rateLimit(`hc:${ip}`, 10, 600);
  const k = `t:hc:${token(4)}`;
  const out = { ok: true };
  const step = async (name, fn) => {
    try {
      const good = await fn();
      out[name] = good ? 'ok' : 'falsch';
      if (!good) out.ok = false;
    } catch (e) {
      out[name] = 'Fehler: ' + String(e.message || e).slice(0, 80);
      out.ok = false;
    }
  };
  const t0 = Date.now();
  await step('ping', async () => (await cmd('PING')) === 'PONG');
  out.ms = Date.now() - t0;
  await step('set', async () => (await cmd('SET', k, JSON.stringify({ v: 1, x: 'a' }), 'EX', 60)) === 'OK');
  await step('cas', async () => (await casJSON(k, 1, { v: 2, x: 'b' }, 60)) && !(await casJSON(k, 1, { v: 3 }, 60)));
  await step('getdel', async () => JSON.parse(await cmd('GETDEL', k)).v === 2 && (await cmd('GET', k)) === null);
  await step('nx', async () => (await cmd('SET', k, '1', 'NX', 'PX', 5000)) === 'OK' && (await cmd('SET', k, '1', 'NX', 'PX', 5000)) === null);
  await step('lex', async () => {
    await multi([['ZADD', `${k}:z`, 0, 'anna_1'], ['ZADD', `${k}:z`, 0, 'ben'], ['EXPIRE', `${k}:z`, 60]]);
    const r = await cmd('ZRANGEBYLEX', `${k}:z`, '[an', '[an\xff', 'LIMIT', 0, 5);
    return r.length === 1 && r[0] === 'anna_1';
  });
  await step('hash', async () => {
    await multi([['HSET', `${k}:h`, 'r', '800', 'name', 'X'], ['HINCRBY', `${k}:h`, 'w', 1], ['EXPIRE', `${k}:h`, 60]]);
    const h = await hgetall(`${k}:h`);
    return h && h.r === '800' && Number(h.w) === 1;
  });
  await multi([['DEL', k, `${k}:z`, `${k}:h`]]);
  return out;
}

A.register = async ({ body, ip }) => {
  const name = String(body.name || '').trim();
  const id = idOf(name);
  if (!NAME_RE.test(name)) fail('Der Benutzername braucht 3–16 Zeichen: Buchstaben, Zahlen oder _.');
  if (RESERVED.has(id) || BAD.some((w) => id.includes(w))) fail('Diesen Benutzernamen kannst du leider nicht nehmen.');
  const pass = String(body.pass || '');
  if (pass.length < 4 || pass.length > 64) fail('Das Passwort braucht mindestens 4 Zeichen.');
  await rateLimit(`reg:${ip}`, 30, 3600); // großzügig: ganze Schulklasse im selben WLAN
  const start = Math.max(100, Math.min(2400, Math.round(num(body.start, 800))));
  const { salt, hash } = await hashPass(pass);
  const now = Date.now();
  if (BOT_IDS.has(id)) fail('Diesen Benutzernamen gibt es schon – nimm einen anderen.', 409);
  const taken = await cmd('SET', `n:${id}`, '1', 'NX');
  if (!taken) fail('Diesen Benutzernamen gibt es schon – nimm einen anderen.', 409);
  const rd = body.fromTest ? 220 : START_RD;
  const t = token();
  await multi([
    ['HSET', `u:${id}`, 'name', name, 'salt', salt, 'hash', hash, 'r', start, 'rd', rd, 'vol', START_VOL, 'games', 0, 'w', 0, 'l', 0, 'd', 0, 'peak', start, 'created', now, 'last', 0],
    ['ZADD', 'names', 0, id],
    ['ZADD', 'lb', start, id],
    ['SET', `s:${t}`, id, 'EX', SESSION_TTL],
  ]);
  return { token: t, user: pub(await hgetall(`u:${id}`)) };
};

A.login = async ({ body }) => {
  const id = idOf(body.name);
  if (!id) fail('Gib deinen Benutzernamen ein.');
  await rateLimit(`login:${id}`, 12, 600);
  const u = await hgetall(`u:${id}`);
  if (!u || !(await checkPass(body.pass, u.salt, u.hash))) fail('Benutzername oder Passwort stimmt nicht.', 401);
  const t = token();
  await cmd('SET', `s:${t}`, id, 'EX', SESSION_TTL);
  return { token: t, user: pub(u) };
};

A.logout = async ({ me }) => {
  await cmd('DEL', `s:${me.token}`);
  return { ok: true };
};

A.me = async ({ me, body }) => {
  const cmds = [['GET', `ug:${me.id}`], ['SMEMBERS', `ci:${me.id}`], ['SMEMBERS', `co:${me.id}`]];
  if (body.ping) cmds.push(['SET', `on:${me.id}`, '1', 'EX', 75]);
  const [gid, inbox, outbox] = await multi(cmds);
  let game = null;
  if (gid) {
    const g = await getJSON(`g:${gid}`);
    if (g && g.status === 'active') game = { id: g.id, vs: g.w === me.id ? g.bn : g.wn, moves: g.moves.length };
  }
  const [invites, outgoing] = await Promise.all([loadChallenges(me.id, inbox, 'ci'), loadChallenges(me.id, outbox, 'co')]);
  return { user: pub(me.user), game, invites, outgoing: outgoing.length };
};

// Fortschritt (Lektionen, Rätsel, Einstellungen …) auf dem Server sichern
A['sync.get'] = async ({ me }) => (await getJSON(`p:${me.id}`)) || { at: 0, data: null };
A['sync.put'] = async ({ me, body }) => {
  const data = body.data;
  if (!data || typeof data !== 'object') fail('Keine Daten.');
  const raw = JSON.stringify({ at: num(body.at, Date.now()), data });
  if (raw.length > 900000) fail('Fortschritt zu groß.', 413);
  const cur = await getJSON(`p:${me.id}`);
  if (cur && cur.at > num(body.at)) return { stale: true, at: cur.at };
  await cmd('SET', `p:${me.id}`, raw);
  return { ok: true };
};

A.search = async ({ body }) => {
  const q = idOf(body.q).replace(/[^a-z0-9_]/g, '');
  if (q.length < 1) return { users: [] };
  const ids = await cmd('ZRANGEBYLEX', 'names', `[${q}`, `[${q}\xff`, 'LIMIT', 0, 12);
  const users = await multi(ids.map((i) => ['HGETALL', `u:${i}`]));
  const online = await multi(ids.map((i) => ['GET', `on:${i}`]));
  return { users: users.map((u, i) => ({ ...pub(flat(u)), online: !!online[i] })).filter((u) => u.name) };
};
const flat = (arr) => {
  if (!arr || !Array.isArray(arr)) return arr;
  const o = {};
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
};

A.profile = async ({ body, me }) => {
  const id = idOf(body.name) || me?.id;
  const u = await hgetall(`u:${id}`);
  if (!u) fail('Spieler nicht gefunden.', 404);
  const [hist, rank, isFriend, on] = await multi([['LRANGE', `h:${id}`, 0, 19], ['ZREVRANK', 'lb', id], me ? ['SISMEMBER', `fr:${me.id}`, id] : ['GET', 'x'], ['GET', `on:${id}`]]);
  return { user: pub(u), place: rank === null ? null : Number(rank) + 1, history: (hist || []).map((h) => JSON.parse(h)), friend: !!Number(isFriend), online: !!on };
};

A.friends = async ({ me }) => {
  const ids = await cmd('SMEMBERS', `fr:${me.id}`);
  if (!ids.length) return { friends: [] };
  const res = await multi([...ids.map((i) => ['HGETALL', `u:${i}`]), ...ids.map((i) => ['GET', `on:${i}`]), ...ids.map((i) => ['GET', `ug:${i}`])]);
  const n = ids.length;
  return {
    friends: ids
      .map((i, k) => ({ ...pub(flat(res[k])), online: !!res[n + k], playing: !!res[2 * n + k] }))
      .filter((f) => f.name)
      .sort((a, b) => b.online - a.online || a.name.localeCompare(b.name)),
  };
};
A['friend.add'] = async ({ me, body }) => {
  const id = idOf(body.name);
  if (id === me.id) fail('Das bist du selbst 🙂');
  if (!(await hgetall(`u:${id}`))) fail('Spieler nicht gefunden.', 404);
  await cmd('SADD', `fr:${me.id}`, id);
  return { ok: true };
};
A['friend.remove'] = async ({ me, body }) => {
  await cmd('SREM', `fr:${me.id}`, idOf(body.name));
  return { ok: true };
};

// ---------- Eigene Spiele & Einladungen ----------
function cleanTc(tc) {
  if (!tc) return null;
  const m = Math.round(num(tc.m));
  const inc = Math.round(num(tc.inc));
  if (m < 1 || m > 90 || inc < 0 || inc > 60) fail('Ungültige Bedenkzeit.');
  return { m, inc };
}
async function loadChallenges(owner, cids, kind) {
  if (!cids || !cids.length) return [];
  const raws = await multi(cids.map((c) => ['GET', `c:${c}`]));
  const out = [];
  const gone = [];
  raws.forEach((r, i) => (r ? out.push(JSON.parse(r)) : gone.push(cids[i])));
  if (gone.length) await cmd('SREM', `${kind}:${owner}`, ...gone);
  return out.sort((a, b) => b.created - a.created);
}

async function acceptChallenge(me, cid) {
  const raw = await cmd('GET', `c:${cid}`);
  if (!raw) fail('Diese Einladung ist abgelaufen oder wurde schon angenommen.', 404);
  const c = JSON.parse(raw);
  if (c.from.id === me.id) fail('Das ist deine eigene Einladung – schick den Link an einen Freund.');
  if (c.to && c.to.id !== me.id) fail('Diese Einladung ist für jemand anderen.', 403);
  // Immer nur eine laufende Partie pro Person (wie bei chess.com)
  const [mine, theirs] = await Promise.all([activeGame(me.id), activeGame(c.from.id)]);
  if (mine) fail('Du spielst gerade schon eine Partie – beende sie zuerst.', 409, 'busy');
  if (theirs) fail(`${c.from.name} spielt gerade noch eine Partie – versuch es gleich nochmal.`, 409, 'busy');
  if (!(await cmd('GETDEL', `c:${cid}`))) fail('Zu spät – jemand anderes war schneller.', 409);
  const g = await createGame(c.from.id, me.id, { tc: c.tc, rated: c.rated, colorFor: c.color, cid: c.cid });
  await multi([['SET', `cg:${c.cid}`, g.id, 'EX', 3600], ['SREM', `co:${c.from.id}`, c.cid], ...(c.to ? [['SREM', `ci:${c.to.id}`, c.cid]] : [])]);
  return g.id;
}

A['challenge.create'] = async ({ me, body }) => {
  const tc = cleanTc(body.tc);
  const color = ['w', 'b', 'r'].includes(body.color) ? body.color : 'r';
  let to = null;
  if (body.to) {
    to = idOf(body.to);
    if (to === me.id) fail('Du kannst dich nicht selbst herausfordern.');
    const u = await hgetall(`u:${to}`);
    if (!u) fail('Spieler nicht gefunden.', 404);
    to = { id: to, name: u.name };
    // Hat der andere mich gerade selbst herausgefordert (z. B. beide drücken „Revanche“)? Dann gilt das als Annehmen.
    const mutual = (await loadChallenges(me.id, await cmd('SMEMBERS', `ci:${me.id}`), 'ci')).find((c) => c.from.id === to.id);
    if (mutual) return { game: await acceptChallenge(me, mutual.cid) };
  }
  await rateLimit(`ch:${me.id}`, 40, 600);
  // Ohne Uhr immer ungewertet – sonst ließe sich eine verlorene Partie endlos hinauszögern.
  const c = { cid: token(6), from: { id: me.id, name: me.user.name, r: Math.round(num(me.user.r)) }, to, tc, color, rated: !!body.rated && !!tc, created: Date.now() };
  const cmds = [['SET', `c:${c.cid}`, JSON.stringify(c), 'EX', CH_TTL], ['SADD', `co:${me.id}`, c.cid]];
  if (to) cmds.push(['SADD', `ci:${to.id}`, c.cid]);
  await multi(cmds);
  return { challenge: c };
};
A['challenge.list'] = async ({ me }) => {
  const [inc, out] = await multi([['SMEMBERS', `ci:${me.id}`], ['SMEMBERS', `co:${me.id}`]]);
  return { incoming: await loadChallenges(me.id, inc, 'ci'), outgoing: await loadChallenges(me.id, out, 'co') };
};
A['challenge.get'] = async ({ body, me }) => {
  const [raw, gid, declined] = await multi([['GET', `c:${body.cid}`], ['GET', `cg:${body.cid}`], ['GET', `cd:${body.cid}`]]);
  if (gid) return { game: gid };
  if (declined) return { declined: true, by: declined };
  if (!raw) fail('Diese Einladung ist abgelaufen oder wurde schon angenommen.', 404);
  const c = JSON.parse(raw);
  return { challenge: c, mine: me ? c.from.id === me.id : false };
};
A['challenge.accept'] = async ({ me, body }) => ({ game: await acceptChallenge(me, String(body.cid || '').slice(0, 20)) });
A['challenge.cancel'] = async ({ me, body }) => {
  const raw = await cmd('GET', `c:${body.cid}`);
  if (raw) {
    const c = JSON.parse(raw);
    const mine = c.from.id === me.id;
    const forMe = c.to && c.to.id === me.id;
    if (!mine && !forMe) fail('Nicht deine Einladung.', 403);
    await multi([
      ['DEL', `c:${c.cid}`],
      ['SREM', `co:${c.from.id}`, c.cid],
      ...(c.to ? [['SREM', `ci:${c.to.id}`, c.cid]] : []),
      // Abgelehnt? Merken, damit der Herausforderer es sofort sieht (statt „abgelaufen“).
      ...(forMe && !mine ? [['SET', `cd:${c.cid}`, c.to.name, 'EX', 600]] : []),
    ]);
  }
  return { ok: true };
};

// ---------- Matchsuche ----------
async function activeGame(id) {
  const gid = await cmd('GET', `ug:${id}`);
  if (!gid) return null;
  const g = await getJSON(`g:${gid}`);
  return g && g.status === 'active' ? g : null;
}

async function tryMatch(me, q) {
  const id = me.id;
  if (!(await cmd('SET', `lock:${q.pool}`, id, 'NX', 'PX', 3000))) return null;
  try {
    const waited = (Date.now() - q.since) / 1000;
    const win = matchWindow(waited);
    const list = await cmd('ZRANGEBYSCORE', `q:${q.pool}`, q.r - win, q.r + win, 'WITHSCORES');
    const cands = [];
    for (let i = 0; i < list.length; i += 2) if (list[i] !== id) cands.push({ id: list[i], d: Math.abs(Number(list[i + 1]) - q.r) });
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands) {
      const other = await getJSON(`m:${c.id}`);
      if (!other || other.pool !== q.pool) {
        await cmd('ZREM', `q:${q.pool}`, c.id);
        continue;
      }
      await multi([['ZREM', `q:${q.pool}`, id, c.id], ['DEL', `m:${id}`, `m:${c.id}`]]);
      const [m, inc] = POOLS[q.pool];
      return await createGame(id, c.id, { tc: { m, inc }, rated: true, colorFor: 'r' });
    }
    // Lange gewartet und kein Mensch da? Dann ein Gegner aus dem Bot-Pool (unter derselben Sperre,
    // damit nicht gleichzeitig noch ein Mensch zugeteilt wird).
    if (waited >= (q.ba || botAfter()) && (await getJSON(`m:${id}`))) {
      await multi([['ZREM', `q:${q.pool}`, id], ['DEL', `m:${id}`]]);
      const [m, inc] = POOLS[q.pool];
      return await createBotGame(me, { tc: { m, inc } });
    }
    return null;
  } finally {
    await cmd('DEL', `lock:${q.pool}`);
  }
}

A['queue.join'] = async ({ me, body }) => {
  const pool = String(body.pool || '');
  if (!POOLS[pool]) fail('Unbekannte Bedenkzeit.');
  const g = await activeGame(me.id);
  if (g) return { matched: g.id };
  const q = { pool, r: Math.round(num(me.user.r, 800)), since: Date.now(), ba: botAfter() };
  await multi([['SET', `m:${me.id}`, JSON.stringify(q), 'EX', 8], ['ZADD', `q:${pool}`, q.r, me.id], ['SET', `on:${me.id}`, '1', 'EX', 75]]);
  const m = await tryMatch(me, q);
  return m ? { matched: m.id } : { waiting: true, since: q.since };
};
A['queue.poll'] = async ({ me }) => {
  const g = await activeGame(me.id);
  if (g) return { matched: g.id };
  const q = await getJSON(`m:${me.id}`);
  if (!q) return { idle: true };
  await multi([['SET', `m:${me.id}`, JSON.stringify(q), 'EX', 8], ['ZADD', `q:${q.pool}`, q.r, me.id]]);
  const m = await tryMatch(me, q);
  const waited = (Date.now() - q.since) / 1000;
  const win = matchWindow(waited);
  return m ? { matched: m.id } : { waiting: true, since: q.since, range: win >= 5000 ? null : win };
};
A['queue.leave'] = async ({ me }) => {
  const q = await getJSON(`m:${me.id}`);
  await multi([['DEL', `m:${me.id}`], ...(q ? [['ZREM', `q:${q.pool}`, me.id]] : [])]);
  return { ok: true };
};

// ---------- Partie ----------
async function loadGame(gid) {
  const g = await getJSON(`g:${String(gid || '').slice(0, 20)}`);
  if (!g) fail('Partie nicht gefunden.', 404);
  return g;
}

A['game.get'] = async ({ me, body }) => {
  let g = await loadGame(body.id);
  g = await checkClock(g);
  // Ab und zu (ping): „ich bin da“ melden und nachsehen, ob der Gegner noch da ist.
  let presence;
  if (body.ping && g.status === 'active') {
    const mine = me ? sideOf(g, me.id) : null;
    const res = await multi([...(mine ? [['SET', `on:${me.id}`, '1', 'EX', 75]] : []), ['GET', `on:${g.w}`], ['GET', `on:${g.b}`]]);
    const [ow, ob] = res.slice(-2);
    presence = { w: !!ow || mine === 'w' || g.bot === 'w', b: !!ob || mine === 'b' || g.bot === 'b' };
  }
  if (body.v && Number(body.v) === g.v) return { same: true, clock: liveClock(g), now: Date.now(), presence };
  return { game: view(g, me?.id), presence };
};

/** Gegner offline und lässt seine Uhr laufen? Nach einer Minute kann man den Sieg beanspruchen. */
A['game.claim'] = async ({ me, body }) => {
  let g = await loadGame(body.id);
  const side = sideOf(g, me.id);
  if (!side) fail('Das ist nicht deine Partie.', 403);
  g = await checkClock(g);
  if (g.status !== 'active') return { game: view(g, me.id) };
  const opp = side === 'w' ? 'b' : 'w';
  if (opp === g.bot) fail('Dein Gegner ist noch da.', 409);
  if (g.moves.length < 2 || turnOf(g) !== opp) fail('Das geht nur, wenn dein Gegner am Zug ist.', 409);
  if (Date.now() - g.turnAt < ABANDON_MS) fail('Warte noch kurz – vielleicht kommt dein Gegner gleich zurück.', 409);
  if (await cmd('GET', `on:${g[opp]}`)) fail('Dein Gegner ist wieder da.', 409);
  const out = (await endGame(g, side === 'w' ? '1-0' : '0-1', 'Gegner hat die Partie verlassen')) || (await getJSON(`g:${g.id}`));
  return { game: view(out, me.id) };
};

/** In Bot-Partien schickt das Gerät des Menschen auch die Züge des Bots (as: 'bot'). */
function actingSide(g, me, body) {
  const side = sideOf(g, me.id);
  if (!side) fail('Das ist nicht deine Partie.', 403);
  if (body.as !== 'bot') return side;
  if (!g.bot || side === g.bot) fail('Nicht erlaubt.', 403);
  return g.bot;
}

A['game.move'] = async ({ me, body }) => {
  let g = await loadGame(body.id);
  const side = actingSide(g, me, body);
  g = await checkClock(g);
  if (g.status !== 'active') return { game: view(g, me.id) };
  if (turnOf(g) !== side) fail('Du bist gerade nicht am Zug.', 409, 'stale');
  if (Number(body.ply) !== g.moves.length) fail('Die Partie hat sich geändert.', 409, 'stale');
  const c = replay(g);
  const uci = String(body.uci || '');
  let m;
  try {
    m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  } catch {
    fail('Ungültiger Zug.', 422);
  }
  const now = Date.now();
  let spent = now - g.turnAt;
  // Bot: nur die echte Bedenkzeit abziehen, nie mehr als ein vernünftiger Anteil (falls der Mensch kurz weg war)
  if (side === g.bot) spent = Math.min(spent, Math.max(1500, (g.clock?.[side] || 0) / 12));
  const next = { ...g, v: g.v + 1, moves: [...g.moves, m.from + m.to + (m.promotion || '')], fen: c.fen(), turnAt: now };
  if (g.tc && g.moves.length >= 2) next.clock = { ...g.clock, [side]: Math.max(side === g.bot ? 300 : 0, g.clock[side] - spent) + g.tc.inc * 1000 };
  if (g.drawOffer && g.drawOffer !== side) next.drawOffer = null; // Gegner zieht statt anzunehmen = abgelehnt
  if (!(await casJSON(`g:${g.id}`, g.v, next, GAME_TTL))) fail('Die Partie hat sich geändert.', 409, 'stale');
  let end = null;
  if (c.isCheckmate()) end = [side === 'w' ? '1-0' : '0-1', 'Schachmatt'];
  else if (c.isStalemate()) end = ['1/2-1/2', 'Patt'];
  else if (c.isInsufficientMaterial()) end = ['1/2-1/2', 'Zu wenig Material'];
  else if (c.isThreefoldRepetition()) end = ['1/2-1/2', 'Stellungswiederholung'];
  else if (c.isDraw()) end = ['1/2-1/2', '50-Züge-Regel'];
  const out = end ? (await endGame(next, ...end)) || (await getJSON(`g:${g.id}`)) : next;
  return { game: view(out, me.id) };
};

A['game.resign'] = async ({ me, body }) => {
  const g = await loadGame(body.id);
  const side = actingSide(g, me, body);
  if (g.status !== 'active') return { game: view(g, me.id) };
  const early = g.moves.length < 2;
  const out = (await endGame(g, early ? '1/2-1/2' : side === 'w' ? '0-1' : '1-0', early ? 'Abgebrochen' : 'Aufgabe')) || (await getJSON(`g:${g.id}`));
  return { game: view(out, me.id) };
};

A['game.draw'] = async ({ me, body }) => {
  const g = await loadGame(body.id);
  const side = actingSide(g, me, body);
  if (g.status !== 'active') return { game: view(g, me.id) };
  const act = body.act;
  if (act === 'accept' && g.drawOffer && g.drawOffer !== side) {
    const out = (await endGame(g, '1/2-1/2', 'Remis vereinbart')) || (await getJSON(`g:${g.id}`));
    return { game: view(out, me.id) };
  }
  const next = { ...g, v: g.v + 1, drawOffer: act === 'offer' ? (g.moves.length < 2 ? g.drawOffer : side) : act === 'decline' && g.drawOffer !== side ? null : g.drawOffer };
  if (!(await casJSON(`g:${g.id}`, g.v, next, GAME_TTL))) fail('Die Partie hat sich geändert.', 409, 'stale');
  return { game: view(next, me.id) };
};

/** Revanche in einer Bot-Partie: gleiche Person, Farben getauscht, Elo wie nach der Partie. */
A['game.rematch'] = async ({ me, body }) => {
  const g = await loadGame(body.id);
  const side = sideOf(g, me.id);
  if (!side || !g.bot || g.status !== 'over') fail('Eine Revanche geht hier gerade nicht.', 409);
  if (await activeGame(me.id)) fail('Du spielst gerade schon eine Partie – beende sie zuerst.', 409, 'busy');
  const name = g.bot === 'w' ? g.wn : g.bn;
  const persona = BOTS.find((b) => b.name === name) || { name, id: idOf(name), home: 800, style: g.botStyle || 'balanced' };
  const rating = g.rc ? (g.bot === 'w' ? g.rc.wNew : g.rc.bNew) : g.bot === 'w' ? g.wr : g.br;
  const ng = await createBotGame(me, { tc: g.tc, persona, rating, humanColor: side === 'w' ? 'b' : 'w' });
  return { game: ng.id };
};

A.history = async ({ me, body }) => {
  const id = idOf(body.name) || me.id;
  return { history: ((await cmd('LRANGE', `h:${id}`, 0, 29)) || []).map((h) => JSON.parse(h)) };
};

A.leaderboard = async ({ me }) => {
  const raw = await cmd('ZREVRANGE', 'lb', 0, 49, 'WITHSCORES');
  const ids = [];
  for (let i = 0; i < raw.length; i += 2) ids.push(raw[i]);
  const users = ids.length ? await multi(ids.map((i) => ['HGETALL', `u:${i}`])) : [];
  const place = me ? await cmd('ZREVRANK', 'lb', me.id) : null;
  return { top: users.map((u) => pub(flat(u))).filter((u) => u && u.name), place: place === null ? null : Number(place) + 1, total: await cmd('ZCARD', 'lb') };
};

const OPEN = new Set(['health', 'register', 'login', 'search', 'profile', 'leaderboard', 'game.get', 'challenge.get']);

// ---------- Einstieg ----------
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1_000_000) fail('Anfrage zu groß.', 413);
  }
  return data ? JSON.parse(data) : {};
}

export default async function handler(req, res) {
  const send = (status, obj) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
  };
  try {
    // GET nur für den Gesundheits-Check: /api/lk?a=health
    if (req.method === 'GET' && /[?&]a=health\b/.test(req.url || '')) {
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
      return send(200, configured && /[?&]deep=1\b/.test(req.url || '') ? await deepHealth(ip) : await A.health());
    }
    if (req.method !== 'POST') return send(405, { error: 'Nur POST.' });
    const body = await readBody(req);
    const action = String(body.a || '');
    const fn = A[action];
    if (!fn) return send(404, { error: 'Unbekannte Aktion.' });
    if (!configured) return send(503, { error: 'Der Online-Modus wird gerade eingerichtet.', code: 'setup' });
    // Abfragen während der Partie (mit Version) brauchen kein Konto – spart Datenbank-Zugriffe.
    const me = action === 'game.get' && body.v && !body.ping ? null : await auth(req, !OPEN.has(action));
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
    const out = await fn({ body, me, ip, req });
    return send(200, out);
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message, code: e.code });
    if (e instanceof SyntaxError) return send(400, { error: 'Ungültige Anfrage.' });
    console.error(e);
    return send(500, { error: 'Da ist etwas schiefgelaufen. Probier es gleich nochmal.' });
  }
}
