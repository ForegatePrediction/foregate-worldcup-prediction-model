#!/usr/bin/env node
// Walk-forward, OUT-OF-SAMPLE backtest on data/results.json. Each match is predicted from ratings
// built ONLY on prior matches, then scored — no look-ahead. Reports accuracy, Brier, RPS, log-loss,
// calibration (ECE) and baselines, and persists data/model-backtest.json.
//   node backtest.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { matchProb, expectedScore, baseK, goalDiffMult, HOME_ADV } from "./elo.mjs";

const D = (f) => new URL(`./data/${f}`, import.meta.url);
const { ratings: SEED, homeNations } = JSON.parse(readFileSync(D("seed-elo.json"), "utf8"));
const HOSTS = new Set(homeNations);
const BURN_IN = 150;

const resultsData = JSON.parse(readFileSync(D("results.json"), "utf8"));
const { matches } = resultsData;
const synthetic = /synthetic/i.test(resultsData._note || "");
const R = {};
const key = (s, nm) => s ?? `ghost:${nm}`;
const getR = (s, nm) => { const k = key(s, nm); if (R[k] == null) R[k] = (s && SEED[s] != null) ? SEED[s] : 1500; return R[k]; };
const setR = (s, nm, v) => { R[key(s, nm)] = v; };

// RPS — proper scoring rule for ORDERED 1X2 outcomes. Lower = better.
const rps3 = (p, y) => 0.5 * ((p[0] - y[0]) ** 2 + (p[0] + p[1] - y[0] - y[1]) ** 2);
const BINS = 10;
const calib = Array.from({ length: BINS }, () => ({ sumP: 0, sumY: 0, n: 0 }));

let n = 0, hit = 0, brier = 0, logloss = 0, rps = 0, rpsU = 0;
let favN = 0, favHit = 0, baseHome = 0, baseElo = 0, eH = 0, eD = 0, eA = 0, i = 0;

for (const m of matches) {
  if (m.hg == null || m.ag == null) continue;
  const ra = getR(m.homeSlug, m.homeName), rb = getR(m.awaySlug, m.awayName);
  const homeBonus = HOSTS.has(m.homeSlug) ? HOME_ADV / 2 : 0;

  if (i >= BURN_IN) {
    const p = matchProb(ra, rb, homeBonus);
    const probs = [p.winA, p.draw, p.winB];
    const actual = m.hg > m.ag ? 0 : m.hg < m.ag ? 2 : 1;
    const y = [actual === 0 ? 1 : 0, actual === 1 ? 1 : 0, actual === 2 ? 1 : 0];
    const pred = probs.indexOf(Math.max(...probs));
    if (pred === actual) hit++;
    brier += (probs[0]-y[0])**2 + (probs[1]-y[1])**2 + (probs[2]-y[2])**2;
    logloss += -Math.log(Math.max(1e-12, probs[actual]));
    rps += rps3(probs, y); rpsU += rps3([1/3,1/3,1/3], y);
    for (let k = 0; k < 3; k++) { const b = Math.min(BINS-1, Math.floor(probs[k]*BINS)); calib[b].sumP += probs[k]; calib[b].sumY += y[k]; calib[b].n++; }
    if (Math.max(...probs) >= 0.5) { favN++; if (pred === actual) favHit++; }
    if (actual === 0) { baseHome++; eH++; } else if (actual === 1) eD++; else eA++;
    if ((expectedScore(ra, rb, homeBonus) >= 0.5 ? 0 : 2) === actual) baseElo++;
    n++;
  }

  const exp = expectedScore(ra, rb, homeBonus);
  const score = m.hg > m.ag ? 1 : m.hg < m.ag ? 0 : 0.5;
  const delta = baseK(m.leagueName) * goalDiffMult(m.hg - m.ag) * (score - exp);
  setR(m.homeSlug, m.homeName, ra + delta);
  setR(m.awaySlug, m.awayName, rb - delta);
  i++;
}

const pct = (x) => (x * 100).toFixed(1) + "%";
const ece = calib.reduce((s, b) => s + (b.n ? Math.abs(b.sumP/b.n - b.sumY/b.n) * b.n : 0), 0) / (3 * n);
console.log(`\n=== ForeGate walk-forward backtest — ${n}/${matches.length} matches (burn-in ${BURN_IN}) ===`);
console.log(`Eval outcome split: home ${pct(eH/n)}  draw ${pct(eD/n)}  away ${pct(eA/n)}\n`);
console.log(`MODEL`);
console.log(`  Accuracy (top pick):   ${pct(hit/n)}`);
console.log(`  Favourite acc (p>=50%):${pct(favHit/favN)}  (${favN} matches)`);
console.log(`  Brier (3-way, lower):  ${(brier/n).toFixed(3)}`);
console.log(`  Log-loss (lower):      ${(logloss/n).toFixed(3)}`);
console.log(`  RPS (lower):           ${(rps/n).toFixed(4)}`);
console.log(`  ECE (calibration):     ${(ece*100).toFixed(1)}%\n`);
console.log(`BASELINES (same matches)`);
console.log(`  Always pick home:      ${pct(baseHome/n)}`);
console.log(`  Pick higher-Elo team:  ${pct(baseElo/n)}`);
console.log(`  Coin-flip (uniform):   Brier 0.667 · log-loss 1.099 · RPS ${(rpsU/n).toFixed(4)}\n`);
console.log(`CALIBRATION (reliability)`);
for (const [k, b] of calib.entries()) { if (!b.n) continue; console.log(`  ${String(k*10).padStart(2)}-${String((k+1)*10).padStart(3)}%   model ${(b.sumP/b.n*100).toFixed(0).padStart(3)}%  ->  happened ${(b.sumY/b.n*100).toFixed(0).padStart(3)}%   (n=${b.n})`); }

writeFileSync(D("model-backtest.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  method: "Walk-forward out-of-sample: each match predicted from ratings built only on prior matches; Elo updated after. Burn-in skipped.",
  dataIsSynthetic: synthetic,
  dataSource: resultsData.source || (synthetic ? "synthetic sample" : "imported"),
  totalMatches: matches.length, evaluated: n, burnIn: BURN_IN,
  outcomeSplit: { home: +(eH/n).toFixed(4), draw: +(eD/n).toFixed(4), away: +(eA/n).toFixed(4) },
  model: { accuracy: +(hit/n).toFixed(4), brier: +(brier/n).toFixed(4), logloss: +(logloss/n).toFixed(4),
           rps: +(rps/n).toFixed(4), ece: +ece.toFixed(4), favouriteAccuracy: +(favHit/favN).toFixed(4), favouriteCount: favN },
  baselines: { alwaysHome: +(baseHome/n).toFixed(4), eloPickNoDraw: +(baseElo/n).toFixed(4),
               uniformBrier: 0.6667, uniformLogloss: 1.0986, uniformRps: +(rpsU/n).toFixed(4) },
  calibration: { ece: +ece.toFixed(4), bins: calib.map((c, k) => ({ range: [k/10, (k+1)/10], n: c.n,
    avgPred: c.n ? +(c.sumP/c.n).toFixed(4) : null, obsFreq: c.n ? +(c.sumY/c.n).toFixed(4) : null })) },
}, null, 2) + "\n");
console.log(synthetic
  ? `\n[!] Metrics are on SYNTHETIC sample data — for pipeline validation only, not a real hit-rate.`
  : `\n[OK] Metrics computed on REAL data (${resultsData.source || "imported results"}). This is a publishable hit-rate.`);
console.log("-> wrote data/model-backtest.json");
