// Schachbrett: Klicken oder Ziehen, Pfeile (Rechtsklick / Malmodus), Umwandlung, Animationen und Effekte.
import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { FILES, parseFen, safeChess, kingSquare } from '../lib/chess-util.js';
import { useStore } from '../lib/store.js';
import { play } from '../lib/sound.js';

const xyOf = (sq, o) => {
  const f = sq.charCodeAt(0) - 97;
  const r = +sq[1] - 1;
  return o === 'w' ? [f, 7 - r] : [7 - f, r];
};
const sqOf = (x, y, o) => (o === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1));

/**
 * Ordnet Figuren stabile IDs zu, damit Züge animiert werden.
 * Liefert die Figuren und die verschwundenen (geschlagenen) Figuren.
 */
function trackPieces(memo, pieces) {
  const prev = memo.map;
  const next = {};
  const pending = [];
  for (const [sq, p] of Object.entries(pieces)) {
    if (prev[sq] && prev[sq].p === p) next[sq] = prev[sq];
    else pending.push([sq, p]);
  }
  const used = new Set(Object.values(next).map((e) => e.id));
  const vanished = Object.entries(prev).filter(([, e]) => !used.has(e.id));
  for (const [sq, p] of pending) {
    let best = -1;
    let bestD = 99;
    const [x, y] = xyOf(sq, 'w');
    vanished.forEach(([vs, e], i) => {
      if (e.p !== p) return;
      const [vx, vy] = xyOf(vs, 'w');
      const d = Math.abs(vx - x) + Math.abs(vy - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      next[sq] = { id: vanished[best][1].id, p };
      vanished.splice(best, 1);
    } else next[sq] = { id: memo.seq++, p };
  }
  memo.map = next;
  // Feste Reihenfolge nach ID: sonst verschiebt Preact DOM-Knoten, und Gleit-Animationen brechen ab.
  const list = Object.entries(next).map(([sq, e]) => ({ sq, ...e })).sort((a, b) => a.id - b.id);
  return { list, gone: vanished.map(([sq, e]) => ({ sq, ...e })) };
}

const ARROW_COLORS = { g: '#5ee08f', r: '#f87171', b: '#8fb3ff', y: '#f2cf6b', o: '#ffa94d' };
// Farbe eigener Pfeile wie bei chess.com: normal orange, Shift grün, Strg/Cmd rot, Alt blau.
const arrowColor = (e) => (e?.shiftKey ? 'g' : e?.ctrlKey || e?.metaKey ? 'r' : e?.altKey ? 'b' : 'o');

/** Felder, die in einem Coach-Text vorkommen („… auf e6 …“), für das Aufleuchten. */
export function squaresIn(text) {
  return [...new Set(String(text || '').match(/\b[a-h][1-8]\b/g) || [])];
}

let fxSeq = 0;

export function Board({
  fen,
  orientation = 'w',
  movable = null, // 'w' | 'b' | 'both' | null
  onMove,
  lastMove = null,
  arrows = [],
  marks = {},
  stars = null,
  walls = null,
  dests = null, // optional: (sq) => [sq]
  noPromotion = false,
  flash = null, // { sq, kind: 'good'|'bad', key }
  badges = null, // { [sq]: { sym, tone } } – Zug-Symbole wie ?? oder ★ auf dem Feld
  drawMode = false, // true: Ziehen malt Pfeile statt Figuren zu bewegen (für Touch)
  className = '',
}) {
  const s = useStore();
  const { boardTheme, coords, autoQueen, animation } = s.settings;
  const effects = animation === false ? 'off' : s.settings.effects || 'full';
  const pieces = useMemo(() => parseFen(fen), [fen]);
  const chess = useMemo(() => (dests ? null : safeChess(fen)), [fen, dests]);
  const memo = useRef({ map: {}, seq: 1 });
  const trackedRes = useMemo(() => trackPieces(memo.current, pieces), [pieces]);
  const tracked = trackedRes.list;
  // Auswahl gilt nur für die Stellung, in der sie getroffen wurde – so löscht ein neuer Zug des Gegners
  // eine alte Auswahl sofort, aber nie eine frische (kein nachlaufender Effekt, der Tipps verschluckt).
  const [selRaw, setSelRaw] = useState(null);
  const sel = selRaw && selRaw.fen === fen ? selRaw.sq : null;
  const setSel = (sq) => setSelRaw(sq ? { sq, fen } : null);
  // Ziehen ohne Neu-Rendern pro Bewegung: Position im Ref, die Figur wird direkt verschoben.
  const dragRef = useRef(null);
  const [dragSq, setDragSq] = useState(null);
  const [hover, setHover] = useState(null);
  const [promo, setPromo] = useState(null);
  const [userArrows, setUserArrows] = useState([]);
  const [userMarks, setUserMarks] = useState({});
  const rightStart = useRef(null);
  // Pfeile per Finger/Maus erst nach kurzem Festhalten – Tippen und Wischen malt keine Pfeile mehr.
  const hold = useRef(null);
  const HOLD_MS = 380;
  const [preview, setPreview] = useState(null);
  const [ghosts, setGhosts] = useState([]);
  const [fx, setFx] = useState([]);
  const [shake, setShake] = useState(0);
  const prevFen = useRef(null);
  const timers = useRef([]);
  const ref = useRef();

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    clearTimeout(hold.current?.timer);
  }, []);

  useEffect(() => {
    // Beim ersten Anzeigen nichts zurücksetzen – sonst geht ein sehr schneller erster Tipp verloren,
    // weil dieser Effekt erst nach dem Zeichnen läuft.
    const first = prevFen.current === null;
    prevFen.current = fen;
    if (first) return;
    setPromo((x) => (x && x.fen !== fen ? null : x));
    setUserArrows([]);
    setUserMarks({});
    // Nur ein Ziehen abbrechen, das noch in der alten Stellung begonnen hat
    if (dragRef.current && dragRef.current.fen !== fen) endDrag(true);
    const gone = trackedRes.gone;
    if (gone.length && gone.length <= 2 && animation !== false) {
      const add = gone.map((g) => ({ ...g, key: 'g' + ++fxSeq }));
      setGhosts((x) => [...x, ...add]);
      later(() => setGhosts((x) => x.filter((g) => !add.includes(g))), 380);
    }
    if (effects === 'off') return;
    const items = [];
    // Geschlagene Figur (bei Umwandlung verschwindet zusätzlich der Bauer vom Startfeld – der zählt nicht).
    const promoPawn = lastMove ? gone.find((g) => g.sq === lastMove[0]) : null;
    const victim = gone.length <= 2 ? gone.find((g) => g !== promoPawn) : null;
    if (victim && (gone.length === 1 || promoPawn)) items.push({ kind: 'burst', sq: victim.sq, color: victim.p[0] });
    else if (lastMove && gone.length <= 1 && effects === 'full') items.push({ kind: 'land', sq: lastMove[1] });
    if (chess?.inCheck()) {
      const k = kingSquare(chess, chess.turn());
      if (k) items.push({ kind: chess.isCheckmate() ? 'mate' : 'check', sq: k });
      if (chess.isCheckmate() && effects === 'full') {
        setShake(1);
        later(() => setShake(0), 650);
      }
    }
    if (!items.length) return;
    const add = items.map((it) => ({ ...it, key: 'f' + ++fxSeq }));
    setFx((x) => [...x, ...add]);
    later(() => setFx((x) => x.filter((f) => !add.includes(f))), 1100);
  }, [fen]);

  const turn = fen.split(' ')[1] || 'w';
  const destsFor = (sq) => {
    if (dests) return dests(sq);
    if (!chess) return [];
    return [...new Set(chess.moves({ square: sq, verbose: true }).map((m) => m.to))];
  };
  const canPick = (sq) => {
    const p = pieces[sq];
    if (!p || !movable || !onMove) return false;
    if (movable !== 'both' && p[0] !== movable) return false;
    return dests ? true : p[0] === turn;
  };
  const selDests = useMemo(() => (sel ? destsFor(sel) : []), [sel, fen, dests, chess]);

  const squareAt = (e, rect) => {
    const r = rect || ref.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * 8);
    const y = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return sqOf(x, y, orientation);
  };
  const posAt = (e, r) => [((e.clientX - r.left) / r.width) * 8, ((e.clientY - r.top) / r.height) * 8];
  // Die Figur sitzt immer mittig genau unter Maus oder Finger.
  // Wichtig: Vergrößern im selben transform (nach translate), sonst wandert die Figur vom Zeiger weg.
  const dragTransform = (d) => `translate(${(d.x - 0.5) * 100}%, ${(d.y - 0.5) * 100}%) scale(1.1)`;
  // back = Figur zurück aufs Feld stellen. Nötig, weil sie beim Ziehen direkt (ohne Preact) verschoben
  // wird – endet das Ziehen ohne Zug, weiß Preact sonst nicht, dass es sie zurückstellen muss.
  const endDrag = (back = false) => {
    const d = dragRef.current;
    if (d?.el) {
      d.el.classList.remove('dragging');
      if (back) d.el.style.transform = place(d.sq);
    }
    dragRef.current = null;
    setDragSq(null);
    setHover(null);
  };

  const doMove = (from, to) => {
    setSel(null);
    const p = pieces[from];
    const last = to[1] === '8' || to[1] === '1';
    if (!noPromotion && p && p[1] === 'P' && last && chess) {
      if (autoQueen) onMove({ from, to, promotion: 'q' });
      else setPromo({ from, to, color: p[0], fen });
      return;
    }
    try {
      navigator.vibrate?.(6);
    } catch {}
    onMove({ from, to });
  };

  const startArrow = (e, sq, viaHold = false) => {
    rightStart.current = { sq, rect: ref.current.getBoundingClientRect(), color: arrowColor(e), tap: e.button !== 2 && !viaHold, pid: e.pointerId };
    try {
      ref.current.setPointerCapture?.(e.pointerId);
    } catch {}
  };
  const finishArrow = (e) => {
    const st = rightStart.current;
    rightStart.current = null;
    setPreview(null);
    const to = squareAt(e, st.rect);
    if (!to) return;
    if (st.sq === to) {
      // Rechtsklick oder Tippen im Malmodus: Feld markieren. Normales Tippen: Pfeile wegräumen.
      if (!st.tap || drawMode) setUserMarks((m) => ({ ...m, [to]: m[to] ? undefined : st.color }));
      else {
        setUserArrows([]);
        setUserMarks({});
      }
      return;
    }
    setUserArrows((a) => {
      const i = a.findIndex((x) => x[0] === st.sq && x[1] === to);
      return i >= 0 ? a.filter((_, j) => j !== i) : [...a, [st.sq, to, st.color]];
    });
  };

  const onPointerDown = (e) => {
    if (promo) return;
    if (dragRef.current || rightStart.current || hold.current) return; // zweiter Finger während eines Zuges: ignorieren
    const sq = squareAt(e);
    if (!sq) return;
    if (e.button === 2 || (e.button === 0 && drawMode)) {
      e.preventDefault();
      startArrow(e, sq);
      return;
    }
    if (e.button !== 0) return;
    if (sel && sel !== sq && selDests.includes(sq)) {
      setUserArrows([]);
      setUserMarks({});
      doMove(sel, sq);
      return;
    }
    if (!canPick(sq)) {
      // Kurz tippen: Auswahl und eigene Pfeile weg. Festhalten (ca. 0,4 s): Pfeil ziehen bzw. Feld markieren.
      setSel(null);
      clearTimeout(hold.current?.timer);
      const keys = { button: 0, pointerId: e.pointerId, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey };
      hold.current = {
        sq,
        pid: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        timer: setTimeout(() => {
          if (!hold.current || hold.current.sq !== sq) return;
          hold.current = null;
          try {
            navigator.vibrate?.(8);
          } catch {}
          startArrow(keys, sq, true);
          setPreview(null);
        }, HOLD_MS),
      };
      try {
        ref.current.setPointerCapture?.(e.pointerId);
      } catch {}
      return;
    }
    e.preventDefault();
    setUserArrows([]);
    setUserMarks({});
    setSel(sq);
    const rect = ref.current.getBoundingClientRect();
    const [x, y] = posAt(e, rect);
    const id = tracked.find((t) => t.sq === sq)?.id;
    const el = ref.current.querySelector(`.pieces [data-id="${id}"]`);
    // Sofort aufnehmen: die Figur springt mittig unter den Zeiger (wie bei chess.com).
    dragRef.current = { sq, id, el, x, y, rect, sx: e.clientX, sy: e.clientY, moved: false, hover: sq, pid: e.pointerId, fen };
    if (el) {
      el.style.transform = dragTransform(dragRef.current);
      el.classList.add('dragging');
    }
    play('select');
    setDragSq(sq);
    try {
      ref.current.setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e) => {
    const hd = hold.current;
    if (hd && hd.pid === e.pointerId && Math.hypot(e.clientX - hd.x, e.clientY - hd.y) > 10) {
      // Bewegt, bevor die Haltezeit um war: kein Pfeil.
      clearTimeout(hd.timer);
      hold.current = { ...hd, moved: true, timer: null };
    }
    const st = rightStart.current;
    if (st) {
      if (st.pid !== e.pointerId) return;
      const to = squareAt(e, st.rect);
      const pv = to && to !== st.sq ? [st.sq, to, st.color] : null;
      if (pv?.[1] !== preview?.[1]) setPreview(pv);
      return;
    }
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    // Stellung hat sich während des Ziehens geändert (z. B. Zurücknehmen): nicht mehr schreiben.
    if (d.el && !d.el.classList.contains('dragging')) return;
    const [x, y] = posAt(e, d.rect);
    d.x = x;
    d.y = y;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
    // Direkt schreiben – kein Warten auf das nächste Rendern, deshalb klebt die Figur am Zeiger.
    if (d.el) d.el.style.transform = dragTransform(d);
    const h = x >= 0 && x < 8 && y >= 0 && y < 8 ? sqOf(Math.floor(x), Math.floor(y), orientation) : null;
    if (h !== d.hover) {
      d.hover = h;
      setHover(h);
    }
  };

  const onPointerUp = (e) => {
    const hu = hold.current;
    if (hu && hu.pid === e.pointerId) {
      clearTimeout(hu.timer);
      hold.current = null;
      if (!hu.moved) {
        // Kurzer Tipp auf ein leeres Feld: eigene Pfeile und Markierungen wegräumen.
        setUserArrows([]);
        setUserMarks({});
      }
      return;
    }
    if (rightStart.current) {
      if (rightStart.current.pid === e.pointerId) finishArrow(e);
      return;
    }
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    const to = squareAt(e, d.rect);
    const moves = d.moved && to && to !== d.sq && destsFor(d.sq).includes(to);
    endDrag(!moves);
    if (moves) doMove(d.sq, to);
    else if (d.moved && to !== d.sq) setSel(null);
  };

  const cancelAll = () => {
    clearTimeout(hold.current?.timer);
    hold.current = null;
    rightStart.current = null;
    setPreview(null);
    endDrag(true);
  };

  const allMarks = { ...marks, ...userMarks };
  const lastSet = lastMove ? new Set(lastMove) : null;
  const checkSq = useMemo(() => (chess?.inCheck() ? kingSquare(chess, turn) : null), [chess]);
  const allArrows = [...arrows, ...userArrows, ...(preview ? [[...preview.slice(0, 2), preview[2], 'preview']] : [])];

  const squares = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const sq = sqOf(x, y, orientation);
      const light = (sq.charCodeAt(0) - 97 + +sq[1]) % 2 === 1;
      const cls = ['sq', light ? 'light' : 'dark'];
      if (sel === sq) cls.push('sel');
      if (lastSet?.has(sq)) cls.push('last');
      if (checkSq === sq) cls.push('check');
      if (allMarks[sq]) cls.push(`mark-${allMarks[sq]}`);
      if (selDests.includes(sq)) cls.push(pieces[sq] ? 'dest cap' : 'dest');
      if (flash?.sq === sq) cls.push(`flash-${flash.kind}`);
      if (hover === sq && dragSq && hover !== dragSq) cls.push('hover');
      squares.push(html`<div key=${sq} class=${cls.join(' ')}>
        ${coords && x === 0 ? html`<span class="co rank">${sq[1]}</span>` : null}
        ${coords && y === 7 ? html`<span class="co file">${sq[0]}</span>` : null}
      </div>`);
    }

  const place = (sq) => {
    const [x, y] = xyOf(sq, orientation);
    return `translate(${x * 100}%, ${y * 100}%)`;
  };
  const at = (sq) => {
    const [x, y] = xyOf(sq, orientation);
    return { left: `${x * 12.5}%`, top: `${y * 12.5}%` };
  };

  return html`<div
    ref=${ref}
    class=${`board theme-${boardTheme} ${animation ? '' : 'no-anim'} ${movable ? 'interactive' : ''} ${dragSq ? 'grabbing' : ''} ${shake ? 'fx-shake' : ''} fx-${effects} ${className}`}
    onPointerDown=${onPointerDown}
    onPointerMove=${onPointerMove}
    onPointerUp=${onPointerUp}
    onPointerCancel=${cancelAll}
    onContextMenu=${(e) => e.preventDefault()}
  >
    <div class="squares">${squares}</div>
    ${walls?.map((sq) => html`<div class="overlay wall" style=${{ transform: place(sq) }}></div>`)}
    ${stars?.map((sq) => html`<div class="overlay star" key=${'s' + sq} style=${{ transform: place(sq) }}><span>★</span></div>`)}
    <div class="pieces">
      ${ghosts.map((g) => html`<div key=${g.key} class=${`piece ${g.p} leaving`} style=${{ transform: place(g.sq) }}></div>`)}
      ${tracked.map(({ id, sq, p }) => {
        const d = dragRef.current;
        const dragging = dragSq === sq && d;
        const style = { transform: dragging ? dragTransform(d) : place(sq) };
        return html`<div key=${id} data-id=${id} class=${`piece ${p} ${dragging ? 'dragging' : ''} ${promo?.from === sq ? 'ghost' : ''}`} style=${style}></div>`;
      })}
    </div>
    <div class="fx-layer" aria-hidden="true">
      ${fx.map((f) =>
        f.kind === 'burst'
          ? html`<span key=${f.key} class=${`fx-burst c-${f.color}`} style=${at(f.sq)}>${Array.from({ length: effects === 'full' ? 10 : 6 }, (_, i) => html`<i style=${{ '--a': `${(360 / (effects === 'full' ? 10 : 6)) * i + 12}deg` }}></i>`)}</span>`
          : html`<span key=${f.key} class=${`fx-${f.kind}`} style=${at(f.sq)}><i></i></span>`,
      )}
    </div>
    <svg class="arrows" viewBox="0 0 8 8">
      <defs>
        ${Object.entries(ARROW_COLORS).map(
          ([k, c]) => html`<marker id=${'ah-' + k} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill=${c} /></marker>`,
        )}
      </defs>
      ${allArrows.map(([a, b, c = 'g', kind], i) => {
        const [x1, y1] = xyOf(a, orientation);
        const [x2, y2] = xyOf(b, orientation);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ex = x2 + 0.5 - (dx / len) * 0.36;
        const ey = y2 + 0.5 - (dy / len) * 0.36;
        const sx = x1 + 0.5 + (dx / len) * 0.18;
        const sy = y1 + 0.5 + (dy / len) * 0.18;
        const col = ARROW_COLORS[c] ? c : 'g';
        return html`<line key=${kind || i} class=${kind === 'preview' ? 'arrow-preview' : ''} x1=${sx} y1=${sy} x2=${ex} y2=${ey} stroke=${ARROW_COLORS[col]} stroke-width="0.2" stroke-linecap="round" opacity=${kind === 'preview' ? 0.55 : 0.82} marker-end=${`url(#ah-${col})`} />`;
      })}
    </svg>
    ${badges &&
    Object.entries(badges).map(([sq, b]) => {
      const [x, y] = xyOf(sq, orientation);
      return html`<span key=${'b' + sq + b.sym} class=${`move-badge t-${b.tone}`} style=${{ left: `${(x + 1) * 12.5}%`, top: `${y * 12.5}%` }}>${b.sym}</span>`;
    })}
    ${promo &&
    html`<div class="promo-backdrop" onPointerDown=${(e) => {
      e.stopPropagation();
      setPromo(null);
    }}>
      <div class="promo" style=${{ left: `${xyOf(promo.to, orientation)[0] * 12.5}%`, [xyOf(promo.to, orientation)[1] === 0 ? 'top' : 'bottom']: 0 }}>
        ${['q', 'n', 'r', 'b'].map(
          (t) => html`<button class=${`piece-btn piece ${promo.color}${t.toUpperCase()}`} onPointerDown=${(e) => {
            e.stopPropagation();
            const p = promo;
            setPromo(null);
            onMove({ from: p.from, to: p.to, promotion: t });
          }}></button>`,
        )}
      </div>
    </div>`}
  </div>`;
}
