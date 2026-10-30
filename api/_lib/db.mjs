// Datenspeicher für den Online-Teil: Upstash Redis (über Vercel verbunden) per REST.
// Ohne Zugangsdaten und mit LK_MEMORY=1 (lokale Tests) läuft alles im Arbeitsspeicher.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const MEMORY = !URL_ || !TOKEN ? process.env.LK_MEMORY === '1' : false;

export const configured = Boolean((URL_ && TOKEN) || MEMORY);

// ---------- Upstash REST ----------
async function rest(cmds) {
  const res = await fetch(`${URL_.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error(`redis http ${res.status}`);
  const out = await res.json();
  return out.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

// ---------- Arbeitsspeicher (nur für Tests) ----------
const mem = { kv: new Map(), exp: new Map() };
const alive = (k) => {
  const e = mem.exp.get(k);
  if (e && e <= Date.now()) {
    mem.kv.delete(k);
    mem.exp.delete(k);
  }
  return mem.kv.has(k);
};
const val = (k, make) => {
  if (!alive(k) && make) mem.kv.set(k, make());
  return mem.kv.get(k);
};
function memCmd([c, ...a]) {
  c = c.toUpperCase();
  const k = a[0];
  switch (c) {
    case 'PING':
      return 'PONG';
    case 'GET':
      return alive(k) ? mem.kv.get(k) : null;
    case 'SET': {
      let ex = null;
      let nx = false;
      for (let i = 2; i < a.length; i++) {
        const o = String(a[i]).toUpperCase();
        if (o === 'NX') nx = true;
        else if (o === 'EX') ex = Number(a[++i]) * 1000;
        else if (o === 'PX') ex = Number(a[++i]);
      }
      if (nx && alive(k)) return null;
      mem.kv.set(k, String(a[1]));
      if (ex) mem.exp.set(k, Date.now() + ex);
      else mem.exp.delete(k);
      return 'OK';
    }
    case 'GETDEL': {
      const v = alive(k) ? mem.kv.get(k) : null;
      mem.kv.delete(k);
      mem.exp.delete(k);
      return v;
    }
    case 'DEL':
      return a.reduce((n, x) => n + (mem.kv.delete(x) ? 1 : 0), 0);
    case 'EXPIRE':
      if (!alive(k)) return 0;
      mem.exp.set(k, Date.now() + Number(a[1]) * 1000);
      return 1;
    case 'INCR': {
      const n = Number(alive(k) ? mem.kv.get(k) : 0) + 1;
      mem.kv.set(k, String(n));
      return n;
    }
    case 'HSET': {
      const h = val(k, () => new Map());
      for (let i = 1; i < a.length; i += 2) h.set(String(a[i]), String(a[i + 1]));
      return 1;
    }
    case 'HINCRBY': {
      const h = val(k, () => new Map());
      const n = Number(h.get(String(a[1])) || 0) + Number(a[2]);
      h.set(String(a[1]), String(n));
      return n;
    }
    case 'HGETALL': {
      if (!alive(k)) return [];
      return [...mem.kv.get(k)].flat();
    }
    case 'SADD': {
      const s = val(k, () => new Set());
      a.slice(1).forEach((m) => s.add(String(m)));
      return 1;
    }
    case 'SREM': {
      if (!alive(k)) return 0;
      a.slice(1).forEach((m) => mem.kv.get(k).delete(String(m)));
      return 1;
    }
    case 'SISMEMBER':
      return alive(k) && mem.kv.get(k).has(String(a[1])) ? 1 : 0;
    case 'SMEMBERS':
      return alive(k) ? [...mem.kv.get(k)] : [];
    case 'ZADD': {
      const z = val(k, () => new Map());
      z.set(String(a[2]), Number(a[1]));
      return 1;
    }
    case 'ZREM':
      if (alive(k)) a.slice(1).forEach((m) => mem.kv.get(k).delete(String(m)));
      return 1;
    case 'ZSCORE': {
      const s = alive(k) ? mem.kv.get(k).get(String(a[1])) : undefined;
      return s === undefined ? null : String(s);
    }
    case 'ZCARD':
      return alive(k) ? mem.kv.get(k).size : 0;
    case 'ZREVRANK': {
      if (!alive(k)) return null;
      const list = [...mem.kv.get(k)].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1));
      const i = list.findIndex(([m]) => m === String(a[1]));
      return i < 0 ? null : i;
    }
    case 'ZREVRANGE': {
      if (!alive(k)) return [];
      const list = [...mem.kv.get(k)].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1));
      const stop = Number(a[2]) < 0 ? list.length + Number(a[2]) : Number(a[2]);
      return list.slice(Number(a[1]), stop + 1).flatMap(([m, s]) => (a[3] ? [m, String(s)] : [m]));
    }
    case 'ZRANGEBYSCORE': {
      if (!alive(k)) return [];
      const lo = a[1] === '-inf' ? -Infinity : Number(a[1]);
      const hi = a[2] === '+inf' ? Infinity : Number(a[2]);
      return [...mem.kv.get(k)].filter(([, s]) => s >= lo && s <= hi).sort((x, y) => x[1] - y[1]).flatMap(([m, s]) => (String(a[3]).toUpperCase() === 'WITHSCORES' ? [m, String(s)] : [m]));
    }
    case 'ZRANGEBYLEX': {
      if (!alive(k)) return [];
      const lo = String(a[1]).slice(1);
      const hi = String(a[2]).slice(1);
      const count = a[5] ? Number(a[5]) : Infinity;
      return [...mem.kv.get(k).keys()].filter((m) => m >= lo && m <= hi).sort().slice(0, count);
    }
    case 'LPUSH': {
      const l = val(k, () => []);
      a.slice(1).forEach((x) => l.unshift(String(x)));
      return l.length;
    }
    case 'LTRIM': {
      if (alive(k)) mem.kv.set(k, mem.kv.get(k).slice(Number(a[1]), Number(a[2]) + 1));
      return 'OK';
    }
    case 'LRANGE': {
      if (!alive(k)) return [];
      const l = mem.kv.get(k);
      const stop = Number(a[2]) < 0 ? l.length + Number(a[2]) : Number(a[2]);
      return l.slice(Number(a[1]), stop + 1);
    }
    case 'EVAL': {
      // Nur das Compare-and-Set-Skript dieser App: KEYS[1]=Schlüssel, ARGV=[erwartete Version, neuer Wert, TTL]
      const key = a[2];
      const [want, next, ttl] = a.slice(3);
      if (!alive(key)) return -1;
      const m = /"v":(\d+)/.exec(mem.kv.get(key));
      if (!m || Number(m[1]) !== Number(want)) return 0;
      mem.kv.set(key, String(next));
      mem.exp.set(key, Date.now() + Number(ttl) * 1000);
      return 1;
    }
    default:
      throw new Error(`memory store: ${c} not supported`);
  }
}

/** Mehrere Befehle in einem Rutsch (Upstash-Pipeline). */
export async function multi(cmds) {
  if (!cmds.length) return [];
  if (!MEMORY) return rest(cmds.map((c) => c.map(String)));
  return cmds.map(memCmd);
}
export const cmd = async (...c) => (await multi([c]))[0];

export const getJSON = async (k) => {
  const v = await cmd('GET', k);
  return v ? JSON.parse(v) : null;
};
export const hgetall = async (k) => {
  const flat = await cmd('HGETALL', k);
  if (!flat || !flat.length) return null;
  if (!Array.isArray(flat)) return flat;
  const o = {};
  for (let i = 0; i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
};

const CAS = `local cur = redis.call('GET', KEYS[1])
if not cur then return -1 end
local v = string.match(cur, '"v":(%d+)')
if tonumber(v) ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`;

/** Speichert obj nur, wenn die gespeicherte Version noch expect ist (gleichzeitige Züge sicher). */
export async function casJSON(key, expect, obj, ttl) {
  const r = await cmd('EVAL', CAS, 1, key, expect, JSON.stringify(obj), ttl);
  return Number(r) === 1;
}
