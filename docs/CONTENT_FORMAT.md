# Inhaltsformat

Alle Lerninhalte liegen als JSON in `data/`. Die App lädt sie beim Start und prüft sie.
Alle Texte sind Deutsch, Du-Form, kurz, freundlich und modern. Figuren heißen
König, Dame, Turm, Läufer, Springer, Bauer. In Fließtext wird deutsche Kurznotation
benutzt (K, D, T, L, S, Bauernzüge ohne Buchstaben), z. B. „Sf3“, „Lxc6+“, „e4“.

Felder heißen immer `a1`–`h8`. Züge in Datenfeldern sind **UCI** (`e2e4`, `e7e8q`)
oder – nur in `openings.json` – **englische SAN** (`Nf3`, `O-O`).

Jede FEN muss eine legale Stellung sein (genau ein König pro Farbe, die Seite, die nicht
am Zug ist, steht nicht im Schach). Ausnahme: `stars`-Schritte haben keine FEN.

---

## `data/puzzles.json`

```json
{ "v": 1, "source": "Lichess puzzle database (CC0)",
  "puzzles": [
    ["00sHx", "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17", "e8d7 a2e6 d7d8 f7f8", 1760, "mate mateIn2 middlegame short"]
  ] }
```

Spalten: `id`, `fen`, `moves`, `rating`, `themes`.
Lichess-Konvention: `fen` ist die Stellung **vor** dem ersten Zug. Der erste Zug in
`moves` ist der Zug des Gegners, mit dem das Rätsel startet. Danach spielt der Lernende
den 2., 4., … Zug, der Gegner den 3., 5., ….
`themes` sind die originalen Lichess-Themenschlüssel (Leerzeichen-getrennt).

---

## `data/lessons/<track>.json`

```json
{ "units": [ Unit, ... ], "lessons": [ Lesson, ... ] }
```

### Unit

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | eindeutig, z. B. `"basics-pieces"` |
| `track` | `"basics"` \| `"mates"` \| `"tactics"` \| `"strategy"` \| `"endgames"` \| `"openings"` | Lernbereich |
| `level` | 0–4 | ab welchem Spielniveau die Einheit sinnvoll ist (0 = nie gespielt, 1 = kennt die Regeln, 2 = Gelegenheitsspieler ~800–1200, 3 = ~1200–1600, 4 = 1600+) |
| `title` | string | kurz, z. B. „Die Figuren“ |
| `description` | string | ein Satz |
| `icon` | string | Figurencode `wK wQ wR wB wN wP` (Symbol im Lernpfad) |

Die Reihenfolge der Units in der Datei ist die Lernreihenfolge innerhalb des Tracks.

### Lesson

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | eindeutig, z. B. `"pieces-rook"` |
| `unit` | string | `id` der Unit |
| `title` | string | z. B. „Der Turm“ |
| `subtitle` | string | ein kurzer Satz |
| `minutes` | number | geschätzte Dauer (2–8) |
| `steps` | Step[] | 5–12 Schritte, abwechslungsreich, möglichst viele interaktive |

Die Reihenfolge der Lessons in der Datei ist die Lernreihenfolge innerhalb der Unit.

### Steps

Gemeinsame optionale Felder: `orientation` (`"w"`/`"b"`, Brettansicht; Standard = Seite am Zug),
`arrows` (`[["e2","e4","g"], ...]`, Farben `g` grün, `r` rot, `b` blau, `y` gelb),
`marks` (`{"e4":"g","d5":"r"}`).

Text darf `**fett**`, `*kursiv*` und Zeilenumbrüche (`\n`) enthalten.

**1. `info`** – Erklärung, optional mit Brett.
```json
{ "type": "info", "text": "Der Turm zieht gerade ...", "fen": "8/8/8/3R4/8/8/8/K6k w - - 0 1",
  "arrows": [["d5","d8","g"],["d5","h5","g"]] }
```

**2. `stars`** – Bewegungs-Minispiel ohne Könige: eine Figur sammelt Sterne.
```json
{ "type": "stars", "text": "Sammle alle Sterne mit dem Turm.", "piece": "wR", "start": "a1",
  "stars": ["a5","e5","e8"], "par": 3, "walls": ["c5"], "enemies": {"e3": "bP"} }
```
`walls` = blockierte Felder (nicht betretbar, nicht überspringbar außer vom Springer).
`enemies` = gegnerische Figuren, die geschlagen werden dürfen (blockieren dahinter).
Ein Stern zählt nur, wenn die Figur **auf** dem Feld landet. `par` = minimale Zugzahl
(muss stimmen!). Bauern (`wP`) ziehen nur vorwärts (vom Startfeld auf Reihe 2 auch 2 Felder)
und schlagen nur `enemies` diagonal vorwärts.

**3. `move`** – Ein Zug in einer echten Stellung.
```json
{ "type": "move", "text": "Gib Schach!", "fen": "...", "goal": "check",
  "hint": "Welche Figur sieht den König?", "success": "Genau – Schach!" }
```
`goal`: `"exact"` (dann `solutions: ["d1h5", ...]` in UCI, Pflicht), `"check"`, `"mate"`,
`"capture"`, `"promote"`, `"castle"`. Bei allen außer `exact` zählt jeder legale Zug,
der das Ziel erfüllt (es muss mindestens einen geben).

**4. `line`** – Zugfolge gegen einen Gegner (wie ein Rätsel). Die Seite am Zug in `fen`
ist der Lernende.
```json
{ "type": "line", "text": "Matt in 2!", "fen": "...", "moves": ["d1h5","g8f6","h5f7"],
  "hint": "...", "success": "..." }
```
Der Lernende spielt `moves[0]`, `moves[2]`, …; die App antwortet mit `moves[1]`, ….
Ein alternativer Zug, der sofort mattsetzt, wird ebenfalls akzeptiert.

**5. `quiz`** – Multiple Choice.
```json
{ "type": "quiz", "text": "Wie viel ist ein Turm wert?", "fen": "...optional...",
  "options": ["3 Punkte","5 Punkte","9 Punkte"], "answer": 1,
  "explain": "Ein Turm ist etwa 5 Bauern wert." }
```

**6. `play`** – Stellung gegen die Engine ausspielen.
```json
{ "type": "play", "text": "Setz mit Dame und König matt.", "fen": "...", "goal": "mate",
  "maxMoves": 15 }
```
`goal`: `"mate"` (Lernender muss mattsetzen) oder `"promote"` (Lernender muss einen
Bauern umwandeln). Die Engine verteidigt bestmöglich. `maxMoves` = Züge des Lernenden.

---

## `data/openings.json`

```json
{ "openings": [ {
  "id": "italian", "name": "Italienische Partie", "eco": "C50", "side": "w", "level": 1,
  "summary": "1–2 Sätze, worum es geht.",
  "ideas": ["Kurzer Plan-Punkt", "..."],
  "lines": [ { "name": "Giuoco Piano", "moves": [
      { "san": "e4", "note": "Besetzt das Zentrum und öffnet Dame und Läufer." },
      { "san": "e5", "note": "Schwarz hält im Zentrum dagegen." } ] } ]
} ] }
```
`side` = die Farbe, die der Lernende mit dieser Eröffnung spielt. `moves` beginnen mit
dem ersten Zug von Weiß, jede Linie 8–16 Halbzüge, jeder Zug mit kurzer `note`
(max. ~140 Zeichen), die das *Warum* erklärt.
