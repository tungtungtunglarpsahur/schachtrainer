// Kleine UI-Bausteine: Logo, Icons, Fortschrittsring, Eval-Balken, Toasts, Konfetti.
import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { formatScore, scoreCp, winPct } from '../lib/chess-util.js';

export function Logo({ small = false }) {
  return html`<a href="#/" class=${`logo ${small ? 'small' : ''}`} aria-label="gambit Startseite">
    <span class="logo-mark"><i></i><i></i><i></i><i></i></span>
    <span class="wordmark">gamb<span class="i">ı<b></b></span>t</span>
  </a>`;
}

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  path: 'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm12 12a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 9v2a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4',
  puzzle: 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
  play: 'M7 4v16l13-8z',
  book: 'M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm8.5 4 2-1.5-2-3.5-2.4.8a7 7 0 0 0-1.7-1L16 4h-4l-.4 2.8a7 7 0 0 0-1.7 1L7.5 7 5.5 10.5l2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-.8a7 7 0 0 0 1.7 1L12 22h4l.4-2.8a7 7 0 0 0 1.7-1l2.4.8 2-3.5-2-1.5a7 7 0 0 0 0-2z',
  scope: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm10 17-5-5',
  flame: 'M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 10.5 11C10.5 7 12 2 12 2z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  check: 'M4 12.5 9.5 18 20 6',
  x: 'M5 5l14 14M19 5 5 19',
  back: 'M15 5l-7 7 7 7',
  flip: 'M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.8-1 1.5-1 2.5H9c0-1-.2-1.7-1-2.5A6 6 0 0 1 12 3z',
  flag: 'M5 21V4m0 0h12l-2 4 2 4H5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a4 4 0 0 0 4 4m8-4h4a4 4 0 0 1-4 4M12 13v4m-4 4h8',
  next: 'M9 5l7 7-7 7',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M4 20h16',
  upload: 'M12 20V9m0 0-4 4m4-4 4 4M4 4h16',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4v5l3 2',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-3v2a4 4 0 0 1-4 4H4',
  sound: 'M4 9v6h4l5 4V5L8 9zm12-1a5 5 0 0 1 0 8',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  cpu: 'M8 8h8v8H8zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  pause: 'M8 5v14M16 5v14',
};

export function Icon({ name, size = 20 }) {
  const d = ICONS[name];
  const filled = ['play', 'flame', 'bolt', 'star'].includes(name);
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill=${filled ? 'currentColor' : 'none'} stroke=${filled ? 'none' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${d} /></svg>`;
}

export function PieceIcon({ p, size = 28 }) {
  return html`<span class=${`piece-icon piece ${p}`} style=${{ width: size + 'px', height: size + 'px' }}></span>`;
}

export function Ring({ value, size = 64, stroke = 7, children, color = 'var(--accent)' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return html`<div class="ring" style=${{ width: size + 'px', height: size + 'px' }}>
    <svg width=${size} height=${size}>
      <circle cx=${size / 2} cy=${size / 2} r=${r} stroke="var(--line)" stroke-width=${stroke} fill="none" />
      <circle cx=${size / 2} cy=${size / 2} r=${r} stroke=${color} stroke-width=${stroke} fill="none" stroke-linecap="round"
        stroke-dasharray=${c} stroke-dashoffset=${c * (1 - v)} transform=${`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    <div class="ring-label">${children}</div>
  </div>`;
}

export function Bar({ value, color }) {
  return html`<div class="bar"><div style=${{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}></div></div>`;
}

/** Bewertungsbalken; `score` aus Sicht Weiß. */
export function EvalBar({ score, orientation = 'w' }) {
  const w = score ? (score.mate != null ? (score.mate > 0 ? 100 : score.mate < 0 ? 0 : 50) : winPct(scoreCp(score))) : 50;
  const pct = orientation === 'w' ? w : 100 - w;
  return html`<div class=${`evalbar ${orientation === 'b' ? 'flipped' : ''}`} title="Bewertung">
    <div class="evalbar-fill" style=${{ height: `${pct}%` }}></div>
    <span class=${`evalbar-label ${w >= 50 ? 'white' : 'black'}`}>${formatScore(score)}</span>
  </div>`;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Mini-Markdown: **fett**, *kursiv*, Zeilenumbrüche. */
export function Md({ text, tag = 'div', class: cls = '' }) {
  const h = esc(text || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  return html`<${tag} class=${`md ${cls}`} dangerouslySetInnerHTML=${{ __html: h }} />`;
}

export function Modal({ children, onClose, wide = false }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return html`<div class="modal-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class=${`modal ${wide ? 'wide' : ''}`}>${children}</div>
  </div>`;
}

// ---------- Toasts ----------

let toastSet = null;
let toastSeq = 0;

export function toast(text, { icon = null, kind = 'info', ms = 3200 } = {}) {
  const id = ++toastSeq;
  toastSet?.((t) => [...t, { id, text, icon, kind }]);
  setTimeout(() => toastSet?.((t) => t.filter((x) => x.id !== id)), ms);
}

export function Toasts({ focus = false }) {
  const [items, setItems] = useState([]);
  toastSet = setItems;
  return html`<div class=${`toasts ${focus ? 'focus' : ''}`}>
    ${items.map((t) => html`<div key=${t.id} class=${`toast ${t.kind}`}>${t.icon ? html`<${PieceIcon} p=${t.icon} size=${26} />` : null}<${Md} text=${t.text} tag="span" /></div>`)}
  </div>`;
}

export function announce(achievements) {
  for (const a of achievements) {
    toast(`**Erfolg freigeschaltet:** ${a.name}`, { icon: a.icon, kind: 'gold', ms: 4500 });
  }
  if (achievements.length) confetti();
}

// ---------- Konfetti ----------

export function confetti(n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth;
  c.height = innerHeight;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  const colors = ['#ffffff', '#e4e4e7', '#a1a1aa', '#e8c46a', '#71717a'];
  const parts = Array.from({ length: n }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    r: Math.random() * 6 + 3,
    a: Math.random() * Math.PI,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frame = 0;
  const step = () => {
    g.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.4;
      p.x += p.vx;
      p.y += p.vy;
      p.a += 0.15;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.a);
      g.fillStyle = p.c;
      g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      g.restore();
    }
    if (++frame < 120) requestAnimationFrame(step);
    else c.remove();
  };
  step();
}

/** Drei hüpfende Punkte, z. B. „Bot denkt nach“. */
export function ThinkingDots() {
  return html`<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
}

export function Spinner({ label = 'Lädt …' }) {
  return html`<div class="spinner"><div class="boot-mark"></div><span>${label}</span></div>`;
}

export function Coach({ text, tone = 'info', children }) {
  return html`<div class=${`coach ${tone}`}>
    <div class="coach-avatar"><span class="logo-mark"><i></i><i></i><i></i><i></i></span></div>
    <div class="coach-bubble">${text ? html`<${Md} text=${text} />` : null}${children}</div>
  </div>`;
}
