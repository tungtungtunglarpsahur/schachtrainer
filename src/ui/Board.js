// Schachbrett: Klicken oder Ziehen, Pfeile (Rechtsklick), Umwandlung, Animation.
import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { FILES, parseFen, safeChess, kingSquare } from '../lib/chess-util.js';
import { useStore } from '../lib/store.js';

const xyOf = (sq, o) => {
  const f = sq.charCodeAt(0) - 97;
  const r = +sq[1] - 1;
  return o === 'w' ? [f, 7 - r] : [7 - f, r];
};
const sqOf = (x, y, o) => (o === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1));

/** Ordnet Figuren stabile IDs zu, damit Züge animiert werden. */
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
  return Object.entries(next).map(([sq, e]) => ({ sq, ...e }));
}

const ARROW_COLORS = { g: '#5ee08f', r: '#f87171', b: '#8fb3ff', y: '#f2cf6b' };

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
  className = '',
}) {
  const s = useStore();
  const { boardTheme, coords, autoQueen, animation } = s.settings;
  const pieces = useMemo(() => parseFen(fen), [fen]);
  const chess = useMemo(() => (dests ? null : safeChess(fen)), [fen, dests]);
  const memo = useRef({ map: {}, seq: 1 });
  const tracked = useMemo(() => trackPieces(memo.current, pieces), [pieces]);
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null);
  const [promo, setPromo] = useState(null);
  const [userArrows, setUserArrows] = useState([]);
  const [userMarks, setUserMarks] = useState({});
  const rightStart = useRef(null);
  const ref = useRef();

  useEffect(() => {
    setSel(null);
    setPromo(null);
    setUserArrows([]);
    setUserMarks({});
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
  const selDests = sel ? destsFor(sel) : [];

  const squareAt = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * 8);
    const y = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return sqOf(x, y, orientation);
  };
  const posAt = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 8, ((e.clientY - r.top) / r.height) * 8];
  };

  const doMove = (from, to) => {
    setSel(null);
    const p = pieces[from];
    const last = to[1] === '8' || to[1] === '1';
    if (!noPromotion && p && p[1] === 'P' && last && chess) {
      if (autoQueen) onMove({ from, to, promotion: 'q' });
      else setPromo({ from, to, color: p[0] });
      return;
    }
    try {
      navigator.vibrate?.(6);
    } catch {}
    onMove({ from, to });
  };

  const onPointerDown = (e) => {
    if (promo) return;
    const sq = squareAt(e);
    if (!sq) return;
    if (e.button === 2) {
      rightStart.current = sq;
      return;
    }
    if (e.button !== 0) return;
    setUserArrows([]);
    setUserMarks({});
    if (sel && sel !== sq && selDests.includes(sq)) {
      doMove(sel, sq);
      return;
    }
    if (canPick(sq)) {
      e.preventDefault();
      setSel(sq);
      const [x, y] = posAt(e);
      setDrag({ sq, x, y, sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType === 'touch' || e.pointerType === 'pen' });
      ref.current.setPointerCapture?.(e.pointerId);
    } else setSel(null);
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const [x, y] = posAt(e);
    const moved = drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4;
    setDrag({ ...drag, x, y, moved });
  };

  const onPointerUp = (e) => {
    if (e.button === 2 && rightStart.current) {
      const from = rightStart.current;
      const to = squareAt(e);
      rightStart.current = null;
      if (!to) return;
      if (from === to) setUserMarks((m) => ({ ...m, [to]: m[to] ? undefined : 'r' }));
      else
        setUserArrows((a) => {
          const i = a.findIndex((x) => x[0] === from && x[1] === to);
          return i >= 0 ? a.filter((_, j) => j !== i) : [...a, [from, to, 'g']];
        });
      return;
    }
    if (!drag) return;
    const to = squareAt(e);
    const d = drag;
    setDrag(null);
    if (d.moved) {
      if (to && to !== d.sq && destsFor(d.sq).includes(to)) doMove(d.sq, to);
      else if (to !== d.sq) setSel(null);
    }
  };

  const allMarks = { ...marks, ...userMarks };
  const hoverSq = drag?.moved && drag.x >= 0 && drag.x < 8 && drag.y >= 0 && drag.y < 8 ? sqOf(Math.floor(drag.x), Math.floor(drag.y), orientation) : null;
  const lift = drag?.touch ? 0.55 : 0;
  const lastSet = lastMove ? new Set(lastMove) : null;
  const checkSq = chess?.inCheck() ? kingSquare(chess, turn) : null;
  const allArrows = [...arrows, ...userArrows];

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
      if (hoverSq === sq && drag && hoverSq !== drag.sq) cls.push('hover');
      squares.push(html`<div key=${sq} class=${cls.join(' ')}>
        ${coords && x === 0 ? html`<span class="co rank">${sq[1]}</span>` : null}
        ${coords && y === 7 ? html`<span class="co file">${sq[0]}</span>` : null}
      </div>`);
    }

  const place = (sq) => {
    const [x, y] = xyOf(sq, orientation);
    return `translate(${x * 100}%, ${y * 100}%)`;
  };

  return html`<div
    ref=${ref}
    class=${`board theme-${boardTheme} ${animation ? '' : 'no-anim'} ${movable ? 'interactive' : ''} ${className}`}
    onPointerDown=${onPointerDown}
    onPointerMove=${onPointerMove}
    onPointerUp=${onPointerUp}
    onPointerCancel=${() => setDrag(null)}
    onContextMenu=${(e) => e.preventDefault()}
  >
    <div class="squares">${squares}</div>
    ${walls?.map((sq) => html`<div class="overlay wall" style=${{ transform: place(sq) }}></div>`)}
    ${stars?.map((sq) => html`<div class="overlay star" key=${'s' + sq} style=${{ transform: place(sq) }}><span>★</span></div>`)}
    <div class="pieces">
      ${tracked.map(({ id, sq, p }) => {
        const dragging = drag?.moved && drag.sq === sq;
        const style = dragging ? { transform: `translate(${(drag.x - 0.5) * 100}%, ${(drag.y - 0.5 - lift) * 100}%)` } : { transform: place(sq) };
        return html`<div key=${id} class=${`piece ${p} ${dragging ? 'dragging' : ''} ${dragging && drag.touch ? 'touch' : ''} ${promo?.from === sq ? 'ghost' : ''}`} style=${style}></div>`;
      })}
    </div>
    <svg class="arrows" viewBox="0 0 8 8">
      <defs>
        ${Object.entries(ARROW_COLORS).map(
          ([k, c]) => html`<marker id=${'ah-' + k} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill=${c} /></marker>`,
        )}
      </defs>
      ${allArrows.map(([a, b, c = 'g'], i) => {
        const [x1, y1] = xyOf(a, orientation);
        const [x2, y2] = xyOf(b, orientation);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ex = x2 + 0.5 - (dx / len) * 0.32;
        const ey = y2 + 0.5 - (dy / len) * 0.32;
        return html`<line key=${i} x1=${x1 + 0.5} y1=${y1 + 0.5} x2=${ex} y2=${ey} stroke=${ARROW_COLORS[c] || c} stroke-width="0.17" stroke-linecap="round" opacity="0.85" marker-end=${`url(#ah-${c})`} />`;
      })}
    </svg>
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
