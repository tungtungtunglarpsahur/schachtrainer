// Einstufung: Bayes-Schätzung der Spielstärke aus der Qualität deiner Züge und dem Ergebnis.
//
// Modell: Ein Spieler mit Wertung r verliert pro Zug im Schnitt mu(r) Centipawns gegenüber dem
// besten Zug (wie der bekannte „durchschnittliche Centipawn-Verlust“). Anders als Gewinnchancen
// flacht das in schon verlorenen Stellungen nicht ab – Zufallszüge werden also nicht schöngerechnet.
// Jeder Zug ist ein Beweisstück (Exponential-Likelihood), Eröffnungszüge zählen weniger.
// Dazu kommt das Ergebnis gegen den (sich anpassenden) Bot über die Elo-Formel und eine
// Vorab-Schätzung aus der Umfrage. Ergebnis: Mittelwert und 80-%-Bereich der Verteilung.

/**
 * Erwarteter Centipawn-Verlust pro Mittelspielzug bei Wertung r – kalibriert mit den Bots dieser App
 * (je 12 Partien à 20 Züge, gemessen genau wie in der Testpartie): 136 bei 400, 112 bei 700,
 * 75 bei 1000, 53 bei 1300, 29 bei 1600, 24 bei 2000.
 */
export const expectedLoss = (r) => 244 * Math.exp(-r / 760) + 5;
/** In der Eröffnung sind die Verluste für alle kleiner (gemessen: Züge 1–4 ≈ 40 %, 5–8 ≈ 70 %). */
const phase = (moveNo) => (moveNo <= 4 ? 0.4 : moveNo <= 8 ? 0.7 : 1);
/** Einzelne Züge werden bei 1000 Centipawns gedeckelt, damit ein einziger Fehler nicht alles bestimmt. */
const CAP = 1000;
/**
 * Züge einer Partie hängen zusammen (ähnliche Stellungen, ein Fehler zieht den nächsten nach sich).
 * Deshalb zählt jeder Zug nur halb. Getestet an 216 gemessenen Partien: mittlerer Fehler 212 statt 245,
 * und der angezeigte 80-%-Bereich enthält die wahre Stärke in 75 % statt nur 53 % der Fälle.
 */
const TEMPER = 0.5;

/** Gewicht eines Zuges: Eröffnungszüge unterscheiden Spielstärken kaum, sie zählen weniger. */
export const moveWeight = (moveNo) => (moveNo <= 4 ? 0.5 : moveNo <= 8 ? 0.8 : 1);

const GRID = [];
for (let r = 100; r <= 2900; r += 10) GRID.push(r);

/**
 * @param {object} o
 * @param {{loss:number, move:number}[]} o.moves  Centipawn-Verlust des Zuges und Zugnummer
 * @param {number} o.prior        Startschätzung (z. B. aus der Umfrage)
 * @param {number} [o.priorSd]    Unsicherheit der Startschätzung
 * @param {number|null} [o.score] Ergebnis aus deiner Sicht 0…1 (Sieg 1, Remis 0,5) oder null
 * @param {number|null} [o.opponent] Stärke des Gegners (für das Ergebnis)
 */
export function estimateRating({ moves, prior, priorSd = 400, score = null, opponent = null }) {
  const logp = GRID.map((r) => {
    const base = expectedLoss(r);
    let lm = 0;
    for (const m of moves) {
      const mu = base * phase(m.move);
      const loss = Math.min(CAP, Math.max(0, m.loss || 0));
      lm += moveWeight(m.move) * (-Math.log(mu) - loss / mu);
    }
    let lp = TEMPER * lm - ((r - prior) ** 2) / (2 * priorSd * priorSd);
    if (score != null && opponent != null) {
      const p = 1 / (1 + Math.pow(10, (opponent - r) / 400));
      lp += 1.5 * (score * Math.log(p) + (1 - score) * Math.log(1 - p));
    }
    return lp;
  });
  const max = Math.max(...logp);
  const w = logp.map((x) => Math.exp(x - max));
  const sum = w.reduce((a, b) => a + b, 0);
  const mean = GRID.reduce((a, r, i) => a + r * w[i], 0) / sum;
  let acc = 0;
  let low = GRID[0];
  let high = GRID[GRID.length - 1];
  let lowSet = false;
  for (let i = 0; i < GRID.length; i++) {
    acc += w[i] / sum;
    if (!lowSet && acc >= 0.1) {
      low = GRID[i];
      lowSet = true;
    }
    if (acc >= 0.9) {
      high = GRID[i];
      break;
    }
  }
  const round = (x) => Math.round(x / 10) * 10;
  return { rating: round(mean), low: round(low), high: round(high) };
}

/**
 * Korrektur für die Testpartie gegen den sich anpassenden Bot. Gemessen in 20 kompletten Testpartien
 * mit Bots bekannter Stärke (600, 1000, 1400, 1800): Die Rohschätzung streut zu weit nach außen.
 * Diese lineare Anpassung senkt den mittleren Fehler von 232 auf 157 Elo (Leave-one-out-geprüft).
 */
export const testCorrection = (r) => Math.round((363 + 0.682 * r) / 10) * 10;
