// Einstufung: Bayes-Schätzung der Spielstärke aus der Qualität deiner Züge und dem Ergebnis.
//
// Modell: Ein Spieler mit Wertung r verliert pro Zug im Schnitt mu(r) Prozentpunkte Gewinnchance
// (nach Engine-Bewertung). Stärkere Spieler verlieren weniger. Jeder Zug ist ein Beweisstück
// (Exponential-Likelihood), Eröffnungszüge zählen weniger, weil sie für alle leicht sind.
// Dazu kommt das Ergebnis gegen den (sich anpassenden) Bot über die Elo-Formel und eine
// Vorab-Schätzung aus der Umfrage. Ergebnis: Mittelwert und 80-%-Bereich der Verteilung.

/** Erwarteter Gewinnchancen-Verlust pro Zug (in %) bei Wertung r. */
export const expectedLoss = (r) => 30 * Math.exp(-r / 700) + 1;

/** Gewicht eines Zuges nach Zugnummer: Eröffnung ist leicht, also wenig Aussagekraft. */
export const moveWeight = (moveNo) => (moveNo <= 4 ? 0.25 : moveNo <= 8 ? 0.6 : 1);

const GRID = [];
for (let r = 100; r <= 2900; r += 10) GRID.push(r);

/**
 * @param {object} o
 * @param {{loss:number, move:number}[]} o.moves  Verlust in Prozentpunkten (0–100) und Zugnummer
 * @param {number} o.prior        Startschätzung (z. B. aus der Umfrage)
 * @param {number} [o.priorSd]    Unsicherheit der Startschätzung
 * @param {number|null} [o.score] Ergebnis aus deiner Sicht 0…1 (Sieg 1, Remis 0,5) oder null
 * @param {number|null} [o.opponent] Stärke des Gegners (für das Ergebnis)
 */
export function estimateRating({ moves, prior, priorSd = 400, score = null, opponent = null }) {
  const logp = GRID.map((r) => {
    const mu = expectedLoss(r);
    let lp = -((r - prior) ** 2) / (2 * priorSd * priorSd);
    for (const m of moves) {
      const loss = Math.min(45, Math.max(0, m.loss || 0));
      lp += moveWeight(m.move) * (-Math.log(mu) - loss / mu);
    }
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
