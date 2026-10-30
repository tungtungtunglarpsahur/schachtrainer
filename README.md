<p align="center"><img src="assets/logo.svg" alt="gambit" width="360"></p>

<h3 align="center">Setz auf deinen Kopf.</h3>
<p align="center">Dein persönlicher Schachtrainer – ohne Account, alles bleibt auf deinem Gerät.</p>

---

## Neu in Version 2

- **Neues Design „Graphit“** – Schwarz, Grautöne, Weiß als Akzent. Weiche Seitenübergänge, gestaffelte Einblendungen, Federn-Animationen bei Buttons, Karten und Brett. Respektiert „Bewegung reduzieren“.
- **iPhone & iPad** – Tab-Leiste mit „Mehr“-Menü auf dem Handy, Icon-Leiste auf dem iPad quer, Brett passt sich jeder Höhe an, Safe-Areas, Homescreen-Icons. Beim Ziehen mit dem Finger schwebt die Figur über dem Finger und das Zielfeld wird markiert.
- **Pflicht-Umfrage beim Start** – 9 kurze Fragen (Erfahrung, Niveau, Elo, Ziele, Schwächen, Spielstil, Zeit, Coach). Daraus entstehen Plan, Startwertungen, Coach-Stufe und der Bereich **„Dein Fokus“** auf der Startseite. In den Einstellungen jederzeit wiederholbar.
- **Bots spielen wie Menschen** – echte Bedenkzeit (schnell in der Eröffnung, länger in schweren Stellungen, flott beim Zurückschlagen, angepasst an die Uhr), wählbares **Bot-Tempo** (Gemütlich/Normal/Flott/Sofort), **VS-Intro** vor jeder Partie, „denkt nach …“-Anzeige und eigene **Spielstile** (Angriff, Taktisch, Positionell, Chaotisch).
- **Deine Partie-Fehler** – jeder Fehler und Patzer aus deinen Partien wird automatisch zur persönlichen Aufgabe. Die Engine akzeptiert alles, was fast so gut ist wie der beste Zug; mit Spaced Repetition (1 → 3 → 7 → 21 Tage), bis die Stellung sitzt.
- Aufgeben mit Bestätigungsdialog statt Browser-Popup, „Für dich“-Empfehlung bei den Bots.

## Was gambit kann

- **Persönlicher Lernplan** – beim ersten Start beantwortest du eine kurze Umfrage zu Niveau, Zielen, Schwächen und Zeit pro Tag (5–60 Min). Daraus entsteht jeden Tag ein passender Mix aus Lektionen, Rätseln, Wiederholungen, Eröffnungstraining und Probepartien.
- **Lernpfad wie Duolingo, nur tiefer** – interaktive Lektionen von den Regeln bis zu Turmendspielen: Sterne-Minispiele für die Gangart, Zielzüge, Zugfolgen, Quiz und Ausspielen gegen die Engine.
- **~4.000 echte Rätsel** aus der Lichess-Datenbank (Elo 400–2900), mit eigenem Rätsel-Rating, Themen-Training, Stärken/Schwächen-Analyse und **Spaced Repetition** für verpasste Rätsel.
- **Rätsel-Rush** – 3 Minuten, 3 Leben, immer schwerer.
- **Einstufungstest** – 8 adaptive Rätsel bestimmen deinen Startwert.
- **Probepartien gegen Bots von 400 bis 3000 Elo** mit Uhr und **Live-Coach**:
  - erklärt Fehler in normalem Deutsch („Dein Springer auf e5 hängt …“) und bietet Zurücknehmen an,
  - zeigt **„Matt in N möglich!“**, Drohungen des Gegners und Tipps in zwei Stufen,
  - Bewertungsbalken und Eröffnungserkennung.
- **Partieanalyse** – jeder Zug klassifiziert (Bester Zug … Patzer), Genauigkeit in %, Bewertungskurve, Schlüsselmomente.
- **Eröffnungstrainer** – 15 Eröffnungen, 41 Linien, jeder Zug erklärt; erst lernen, dann aus dem Kopf üben mit Wiederholung.
- **Analysebrett** – Stockfish 18 live mit 3 Varianten, Matt-Finder, FEN/PGN laden, Pfeile per Rechtsklick.
- **Profil** – Ränge (Bauer → Großmeister), Serien, Rating-Verläufe, Aktivität, 21 Erfolge.
- **Alles lokal** – Fortschritt im Browser-Speicher, Backup als Datei exportieren/importieren, läuft offline (PWA, installierbar).

## Starten

gambit ist eine statische Web-App ohne Build-Schritt.

**GitHub Pages:** Repository → *Settings* → *Pages* → *Deploy from a branch* → `main` / `root`. Nach einer Minute läuft die App unter `https://<name>.github.io/<repo>/`.

**Lokal:** im Projektordner einen beliebigen Webserver starten, z. B.

```bash
python -m http.server 8000
```

und `http://localhost:8000` öffnen. (Direkt per Doppelklick auf `index.html` geht nicht, weil Browser Module und die Engine nur über HTTP laden.)

## Aufbau

```
index.html, styles.css, onboarding.css, sw.js, manifest.webmanifest
src/main.js            Router, App-Rahmen, Zeitmessung
src/lib/               Speicher, Engine (Stockfish), Coach, Fortschritt, Inhalte, Sound, Partie-Fehler (mistakes.js)
src/ui/                Brett, Aufgaben-Typen, UI-Bausteine
src/views/             Start, Umfrage (Onboarding), Lernpfad, Lektion, Rätsel, Partie-Fehler, Spielen, Analyse, Eröffnungen, Profil, Einstellungen
data/                  Lektionen, Eröffnungen, Rätsel (JSON) – Format: docs/CONTENT_FORMAT.md
tools/validate_content.py   prüft alle Inhalte mit python-chess
vendor/                chess.js, Preact + htm, Stockfish 18 (WASM)
```

Inhalte prüfen:

```bash
pip install chess
python tools/validate_content.py
```

## Lizenzen & Danke

- [Stockfish](https://stockfishchess.org) 18 – GPLv3 (`vendor/stockfish/Copying.txt`), WASM-Build aus dem npm-Paket `stockfish`
- [chess.js](https://github.com/jhlywa/chess.js) – BSD-2-Clause (`vendor/chess.js.LICENSE`)
- [Preact](https://preactjs.com) – MIT (`vendor/preact.LICENSE`), [htm](https://github.com/developit/htm) – Apache-2.0 (`vendor/htm.LICENSE`)
- Rätsel: [Lichess-Puzzle-Datenbank](https://database.lichess.org/#puzzles) – CC0
- Figuren: „cburnett“ von Colin M. L. Burnett – GPLv2+
- Schriften: Geist, Geist Mono (Google Fonts, OFL)
