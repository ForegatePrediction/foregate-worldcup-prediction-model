#!/usr/bin/env node
// Monte Carlo simulation of the full 48-team 2026 tournament.
// 12 groups -> top 2 + 8 best thirds = 32 -> Round of 32 -> R16 -> QF -> SF -> Final.
// Seeded RNG => fully reproducible & auditable. Outputs per-team stage-advance probabilities.
//   node simulate.mjs [sims=10000] [seed=2026]
import { readFileSync, writeFileSync } from "node:fs";
import { sampleMatch, mulberry32, HOME_ADV } from "./elo.mjs";

const D = (f) => new URL(`./data/${f}`, import.meta.url);
const eloData = JSON.parse(readFileSync(D("elo-calibrated.json"), "utf8"));
const { ratings } = eloData;
const synthetic = eloData.dataIsSynthetic !== false;
const { homeNations } = JSON.parse(readFileSync(D("seed-elo.json"), "utf8"));
const { groups } = JSON.parse(readFileSync(D("groups.json"), "utf8"));
const HOSTS = new Set(homeNations);

const SIMS = parseInt(process.argv[2] || "10000", 10);
const SEED = parseInt(process.argv[3] || "2026", 10);
const rng = mulberry32(SEED);

const GLETTERS = Object.keys(groups);
const allTeams = GLETTERS.flatMap((g) => groups[g]);

// Venue bonus for team a vs b: hosts get +HOME_ADV at "home"; expressed as bonus on side A.
const hostBonus = (a, b) => (HOSTS.has(a) ? HOME_ADV : 0) - (HOSTS.has(b) ? HOME_ADV : 0);

// Standard single-elimination seed order for a bracket of size n (1-indexed seed positions).
function seedOrder(n) {
  let arr = [1];
  while (arr.length < n) { const size = arr.length * 2; const next = []; for (const s of arr) { next.push(s); next.push(size + 1 - s); } arr = next; }
  return arr;
}
const ORDER32 = seedOrder(32);

const stages = ["advance", "r16", "qf", "sf", "final", "champion"]; // 32 / 16 / 8 / 4 / 2 / 1
const count = Object.fromEntries(allTeams.map((t) => [t, Object.fromEntries(stages.map((s) => [s, 0]))]));

function playGroup(teams) {
  const tbl = Object.fromEntries(teams.map((t) => [t, { pts: 0, gd: 0, gf: 0, t }]));
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const a = teams[i], b = teams[j];
    const { goalsA, goalsB } = sampleMatch(ratings[a], ratings[b], hostBonus(a, b), true, rng);
    tbl[a].gf += goalsA; tbl[b].gf += goalsB; tbl[a].gd += goalsA - goalsB; tbl[b].gd += goalsB - goalsA;
    if (goalsA > goalsB) tbl[a].pts += 3; else if (goalsA < goalsB) tbl[b].pts += 3; else { tbl[a].pts++; tbl[b].pts++; }
  }
  const ranked = teams.map((t) => tbl[t]).sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || rng() - 0.5);
  return ranked; // [winner, runner-up, third, fourth]
}

function knockout(a, b) {
  const { goalsA, goalsB } = sampleMatch(ratings[a], ratings[b], hostBonus(a, b), false, rng);
  return goalsA >= goalsB ? a : b; // allowDraw=false guarantees a winner
}

for (let s = 0; s < SIMS; s++) {
  const winners = [], runners = [], thirds = [];
  for (const g of GLETTERS) {
    const r = playGroup(groups[g]);
    winners.push({ ...r[0], g }); runners.push({ ...r[1], g }); thirds.push({ ...r[2], g });
  }
  // 8 best third-placed teams.
  const bestThirds = thirds.slice().sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || rng() - 0.5).slice(0, 8);
  const qualifiers = [...winners, ...runners, ...bestThirds];
  for (const q of qualifiers) count[q.t].advance++;

  // Seed the 32: winners first, then runners, then best thirds; within each by pts/gd/gf.
  const seeded = [
    ...winners.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf),
    ...runners.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf),
    ...bestThirds,
  ].map((q) => q.t);

  // Place into the bracket by standard seeding, then collapse adjacent pairs each round.
  let bracket = ORDER32.map((pos) => seeded[pos - 1]);
  const stageNames = ["r16", "qf", "sf", "final", "champion"];
  for (const stage of stageNames) {
    const next = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const w = knockout(bracket[i], bracket[i + 1]);
      next.push(w); count[w][stage]++;
    }
    bracket = next;
  }
}

const z = 1.96;
const teamsOut = allTeams.map((t) => {
  const c = count[t];
  const champ = c.champion / SIMS;
  const ci = z * Math.sqrt(Math.max(champ * (1 - champ), 1e-9) / SIMS);
  return {
    team: t, elo: ratings[t],
    group: GLETTERS.find((g) => groups[g].includes(t)),
    advance: +(c.advance / SIMS).toFixed(4),
    r16: +(c.r16 / SIMS).toFixed(4),
    qf: +(c.qf / SIMS).toFixed(4),
    sf: +(c.sf / SIMS).toFixed(4),
    final: +(c.final / SIMS).toFixed(4),
    champion: +champ.toFixed(4),
    championCI: [Math.max(0, +(champ - ci).toFixed(4)), +(champ + ci).toFixed(4)],
  };
}).sort((a, b) => b.champion - a.champion);

writeFileSync(D("tournament-odds.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sims: SIMS, seed: SEED, dataIsSynthetic: synthetic, eloSource: eloData.source || null,
  method: "Seeded Monte Carlo over groups -> top2 + 8 best thirds -> Round of 32 -> Final. 95% CI on champion via binomial normal approx.",
  teams: teamsOut,
}, null, 2) + "\n");

console.log(`\n=== ForeGate tournament Monte Carlo — ${SIMS} sims, seed ${SEED} ===\n`);
console.log("Team           Grp  Champion  Final    SF     QF    R16  Advance");
for (const t of teamsOut.slice(0, 16)) {
  const p = (x) => (x * 100).toFixed(1).padStart(5);
  console.log(`${t.team.padEnd(14)} ${t.group}   ${p(t.champion)}%  ${p(t.final)}% ${p(t.sf)}% ${p(t.qf)}% ${p(t.r16)}% ${p(t.advance)}%`);
}
console.log(synthetic
  ? `\n[!] Synthetic sample data — illustrative odds only. -> wrote data/tournament-odds.json`
  : `\n[OK] Real Elo (${eloData.source || "imported"}). -> wrote data/tournament-odds.json`);
