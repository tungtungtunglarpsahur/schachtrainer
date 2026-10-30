// Glicko-2 – das Wertungssystem von chess.com und lichess, hier pro Partie gerechnet.
// Neue Spieler (große Unsicherheit RD) bewegen sich schnell, erfahrene langsam.
const SCALE = 173.7178;
const TAU = 0.5;
export const START_RD = 250;
export const START_VOL = 0.06;
const MIN_RD = 45;
const MAX_RD = 350;

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu, muj, phij) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/** Unsicherheit wächst mit Pausen (pro Tag ohne Partie). */
export function inflate(rd, vol, lastPlayed, now = Date.now()) {
  const days = lastPlayed ? Math.max(0, (now - lastPlayed) / 86400000) : 0;
  const phi = rd / SCALE;
  return Math.min(MAX_RD, Math.sqrt(phi * phi + vol * vol * days) * SCALE);
}

/** Erwartete Punktzahl von a gegen b (0..1). */
export const expectedScore = (a, b) => E((a.r - 1500) / SCALE, (b.r - 1500) / SCALE, b.rd / SCALE);

/**
 * Neue Wertung nach einer Partie.
 * me/opp: { r, rd, vol }, score: 1 Sieg · 0.5 Remis · 0 Niederlage. Ergebnis: { r, rd, vol }.
 */
export function update(me, opp, score) {
  const mu = (me.r - 1500) / SCALE;
  const phi = me.rd / SCALE;
  const muj = (opp.r - 1500) / SCALE;
  const phij = opp.rd / SCALE;
  const gj = g(phij);
  const e = E(mu, muj, phij);
  const v = 1 / (gj * gj * e * (1 - e));
  const delta = v * gj * (score - e);

  // Neue Volatilität (Illinois-Verfahren aus Glickmans Paper)
  const a = Math.log(me.vol * me.vol);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 60 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * gj * (score - e);
  return {
    r: Math.max(100, muNew * SCALE + 1500),
    rd: Math.min(MAX_RD, Math.max(MIN_RD, phiNew * SCALE)),
    vol: Math.min(0.12, Math.max(0.03, vol)),
  };
}

/** Wertung gilt als vorläufig (wie das „?“ bei lichess), solange sie noch unsicher ist. */
export const provisional = (rd) => rd > 110;
