// Aufgaben des Tagesplans für die Anzeige (Titel, Link, Symbol) – und „Weiter im Plan“ nach einer Übung.
import { TRACKS, themeName } from './content.js';
import { VISION } from './vision.js';
import { todayPlan, taskProgress } from './progress.js';

export function taskInfo(task, content) {
  switch (task.kind) {
    case 'lesson': {
      const l = content.lessonById[task.id];
      const u = l && content.unitById[l.unit];
      return { title: l?.title || 'Lektion', sub: u ? `${TRACKS[u.track]?.name} · ${u.title}` : '', href: `#/lesson/${task.id}`, icon: u?.icon || 'wP', min: l?.minutes || 4, tag: 'Lektion' };
    }
    case 'review':
      return { title: `${task.count} Fehler wiederholen`, sub: 'Rätsel, die du zuletzt verpasst hast', href: '#/puzzles/review', icon: 'wR', min: Math.ceil(task.count * 0.8), tag: 'Wiederholung' };
    case 'puzzles':
      return {
        title: `${task.count} Rätsel lösen`,
        sub: task.themes ? [...new Set(task.themes.map(themeName))].slice(0, 3).join(' · ') : 'Auf deinem Niveau',
        href: `#/puzzles/train${task.themes ? `?themes=${task.themes.join(',')}` : ''}`,
        icon: 'wN',
        min: task.count,
        tag: 'Taktik',
      };
    case 'opening': {
      const [id, i] = task.key.split('#');
      const o = content.openingById[id];
      return { title: o ? o.name : 'Eröffnung', sub: o?.lines[i]?.name || '', href: `#/opening/${id}?line=${i}`, icon: 'wB', min: 4, tag: 'Eröffnung' };
    }
    case 'play':
      return task.count > 1
        ? { title: `${task.count} Partien mit Coach`, sub: `Gegner um ${task.elo} Elo – danach Fehler ansehen`, href: `#/play?elo=${task.elo}`, icon: 'bK', min: 12 * task.count, tag: 'Spielen' }
        : { title: 'Probepartie mit Coach', sub: `Gegner um ${task.elo} Elo`, href: `#/play?elo=${task.elo}`, icon: 'bK', min: 10, tag: 'Spielen' };
    case 'vision': {
      const v = VISION[task.mode] || VISION.hanging;
      return { title: `Sehtraining: ${v.title}`, sub: 'Eine Runde zum Aufwärmen', href: `#/vision/${task.mode}`, icon: v.icon, min: 2, tag: 'Brettblick' };
    }
    case 'notes':
      return { title: 'Merkzettel durchlesen', sub: 'Alle Merkregeln aus deinen Lektionen – kurz vor dem Turnier', href: '#/notes', icon: 'wK', min: 5, tag: 'Wiederholen' };
    case 'rush':
      return { title: 'Rätsel-Rush', sub: '3 Minuten, 3 Leben – Taktik unter Zeitdruck', href: '#/puzzles/rush', icon: 'wQ', min: 4, tag: 'Tempo' };
    default:
      return { title: '', sub: '', href: '#/', icon: 'wP', min: 0, tag: '' };
  }
}

/** Nächste offene Aufgabe im heutigen Plan (außer der, von der man gerade kommt). */
export function nextPlanStep(content, s, skipHref = null) {
  if (!content) return null;
  const plan = todayPlan(content, s);
  for (const t of plan.tasks) {
    if (taskProgress(t, s, plan) >= 1) continue;
    const info = taskInfo(t, content);
    if (skipHref && info.href.split('?')[0] === skipHref.split('?')[0]) continue;
    return info;
  }
  return null;
}
