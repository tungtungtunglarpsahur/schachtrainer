// „Lerne aus deinen Fehlern“: Fehler und Patzer aus deinen Partien werden zu persönlichen Aufgaben
// und kommen mit Spaced Repetition wieder (1 → 3 → 7 → 21 Tage, danach gilt die Stellung als sicher).
const DAY = 864e5;
const BOXES = [0, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY];
const MAX = 120;

/** Speichert einen Fehler aus einer Partie (doppelte Stellungen werden ignoriert). */
export function recordMistake(s, m) {
  if (!s.mistakes) s.mistakes = [];
  const key = m.fen.split(' ').slice(0, 4).join(' ');
  if (s.mistakes.some((x) => x.fen.split(' ').slice(0, 4).join(' ') === key)) return;
  s.mistakes.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), box: 0, due: Date.now(), tries: 0, ...m });
  if (s.mistakes.length > MAX) s.mistakes.length = MAX;
}

export function dueMistakes(s) {
  const now = Date.now();
  return (s.mistakes || []).filter((m) => !m.mastered && m.due <= now).sort((a, b) => a.due - b.due);
}

export function openMistakes(s) {
  return (s.mistakes || []).filter((m) => !m.mastered);
}

/** Ergebnis eintragen; liefert den neuen Kasten (0–4) zurück. */
export function gradeMistake(s, id, ok) {
  const m = (s.mistakes || []).find((x) => x.id === id);
  if (!m) return 0;
  m.tries = (m.tries || 0) + 1;
  if (ok) {
    m.box = Math.min(BOXES.length, (m.box || 0) + 1);
    if (m.box >= BOXES.length) m.mastered = true;
    else m.due = Date.now() + BOXES[m.box];
  } else {
    m.box = 0;
    m.due = Date.now() + 10 * 60e3;
  }
  return m.box;
}
