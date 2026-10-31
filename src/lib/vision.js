// Sehtraining: die Übungen (Texte, Dauer, Symbol). Die Ansicht liegt in views/Vision.js.
export const VISION = {
  hanging: {
    title: 'Was hängt?',
    sub: 'Tippe alle Figuren an, die in Gefahr sind – bei beiden Farben.',
    how: 'In Gefahr ist eine Figur, die angegriffen und nicht gedeckt ist – oder die eine billigere Figur schlagen kann. Falsch getippt kostet 3 Sekunden.',
    why: 'Die meisten Partien unter 1500 kippen, weil eine Figur hängt. Dieser Blick wird hier zum Reflex.',
    secs: 60,
    icon: 'wR',
    unit: 'Stellungen',
  },
  checks: {
    title: 'Alle Schachgebote',
    sub: 'Finde jedes Schach, das die Seite am Zug geben kann.',
    how: 'Zieh eine Figur so, dass sie Schach gibt. Jeder gefundene Schach zählt einen Punkt, die Stellung bleibt stehen. Ein Zug ohne Schach kostet 2 Sekunden.',
    why: 'Profis prüfen in jeder Stellung zuerst alle Schachs – so findet man Matts und Gabeln, die andere übersehen.',
    secs: 90,
    icon: 'wQ',
    unit: 'Schachs',
  },
  coords: {
    title: 'Koordinaten',
    sub: 'Tippe das genannte Feld – so schnell du kannst.',
    how: 'Oben steht ein Feld wie „e4“. Tippe es an. Die Koordinaten am Rand sind ausgeblendet.',
    why: 'Wer die Felder sofort findet, liest Notation, Lektionen und Analysen viel schneller.',
    secs: 30,
    icon: 'wP',
    unit: 'Felder',
  },
};
export const VISION_MODES = Object.keys(VISION);
