// ForeGate — match model: Elo (event-weighted) + Dixon-Coles bivariate Poisson.
// References: World Football Elo (eloratings.net); Maher (1982); Dixon & Coles (1997); 538 SPI.
// Deterministic by design: pass a seeded RNG and the same inputs always give the same output.

// --- Home / venue advantage (Elo points). 2026: only host nations get it, and only at home. ---
export const HOME_ADV = 75;

// --- Dixon-Coles low-score correction. ρ ~ -0.13 empirically; fixes Poisson's 0-0/1-1 under-count. ---
export const DC_RHO = -0.13;

// --- Event-importance K (World Football Elo style): big tournaments move ratings more than friendlies. ---
export function baseK(leagueName = "") {
  const n = String(leagueName).toLowerCase();
  if (/qualif/.test(n)) return 40;                            // any qualification (WC/Euro/...)
  if (/world cup/.test(n)) return 60;                         // WC finals
  if (/copa am|euro|asian cup|afric.*cup|afcon|gold cup|nations cup|confederations/.test(n)) return 50;
  if (/nations league/.test(n)) return 32;
  if (/friendl/.test(n)) return 20;
  return 30;
}

// --- Goal-difference multiplier: a 3-0 win is stronger evidence than a 1-0 win. ---
export function goalDiffMult(gd) {
  const d = Math.abs(gd);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8; // 3 → 1.75, 4 → 1.875, ...
}

// --- Elo win expectancy (logistic on rating difference). ---
export function expectedScore(ratingA, ratingB, homeBonusA = 0) {
  return 1 / (1 + Math.pow(10, (ratingB - (ratingA + homeBonusA)) / 400));
}

// --- Rating difference → expected goals (Poisson λ). Flat denominator keeps single-match
//     variance near real-football upset frequency. ---
export function expectedGoals(rating, opponent, homeBonus = 0) {
  const diff = (rating + homeBonus) - opponent;
  const lambda = 1.35 + diff / 350;
  return Math.max(0.3, Math.min(3.5, lambda));
}

export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

export function poissonSample(lambda, rng = Math.random) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

function dcTau(a, b, lambda, mu, rho) {
  if (a === 0 && b === 0) return 1 - lambda * mu * rho;
  if (a === 0 && b === 1) return 1 + lambda * rho;
  if (a === 1 && b === 0) return 1 + mu * rho;
  if (a === 1 && b === 1) return 1 - rho;
  return 1;
}

// --- 1X2 + goals distribution via Dixon-Coles bivariate Poisson over 0–8 goals each side. ---
export function matchProb(ratingA, ratingB, homeBonusA = 0) {
  const lambda = expectedGoals(ratingA, ratingB, homeBonusA);
  const mu = expectedGoals(ratingB, ratingA, -homeBonusA / 2);
  let winA = 0, draw = 0, winB = 0, over25 = 0, btts = 0;
  const grid = [];
  for (let a = 0; a <= 8; a++) {
    const pA = poissonPmf(a, lambda);
    for (let b = 0; b <= 8; b++) {
      const p = pA * poissonPmf(b, mu) * dcTau(a, b, lambda, mu, DC_RHO);
      grid.push({ a, b, p });
      if (a > b) winA += p; else if (a < b) winB += p; else draw += p;
      if (a + b >= 3) over25 += p;
      if (a >= 1 && b >= 1) btts += p;
    }
  }
  const total = winA + draw + winB;
  grid.sort((x, y) => y.p - x.p);
  const topScores = grid.slice(0, 5).map((g) => ({ score: `${g.a}-${g.b}`, p: +(g.p / total).toFixed(4) }));
  return {
    winA: winA / total, draw: draw / total, winB: winB / total,
    over25: over25 / total, under25: 1 - over25 / total, btts: btts / total,
    expectedGoalsA: lambda, expectedGoalsB: mu, topScores,
  };
}

// --- Sample a scoreline for Monte Carlo. allowDraw=false → shoot-out nudge toward higher Elo. ---
export function sampleMatch(ratingA, ratingB, homeBonusA = 0, allowDraw = true, rng = Math.random) {
  const eA = expectedGoals(ratingA, ratingB, homeBonusA);
  const eB = expectedGoals(ratingB, ratingA, -homeBonusA / 2);
  let goalsA = poissonSample(eA, rng);
  let goalsB = poissonSample(eB, rng);
  if (!allowDraw && goalsA === goalsB) {
    if (rng() < expectedScore(ratingA, ratingB, homeBonusA)) goalsA += 1; else goalsB += 1;
  }
  return { goalsA, goalsB };
}

// --- Deterministic RNG (mulberry32). Seed it for reproducible, auditable simulations. ---
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
