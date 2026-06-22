#!/usr/bin/env node
// Head-to-head predictor from calibrated ratings, with 1X2 / goals / BTTS and driving factors.
//   node predict.mjs brazil argentina            (neutral venue)
//   node predict.mjs usa mexico usa               (3rd arg = home team)
import { readFileSync } from "node:fs";
import { matchProb, HOME_ADV } from "./elo.mjs";
import { explainMatch } from "./explain.mjs";

const { ratings } = JSON.parse(readFileSync(new URL("./data/elo-calibrated.json", import.meta.url), "utf8"));
const [a, b, home] = process.argv.slice(2);

if (!a || !b) {
  console.log("Usage: node predict.mjs <teamA> <teamB> [homeTeam]\n\nTeams:\n  " + Object.keys(ratings).sort().join(", "));
  process.exit(0);
}
const ra = ratings[a], rb = ratings[b];
if (ra == null || rb == null) { console.error(`Unknown team: ${ra == null ? a : b}\nAvailable: ${Object.keys(ratings).sort().join(", ")}`); process.exit(1); }

const hb = home === a ? HOME_ADV : home === b ? -HOME_ADV : 0;
const p = matchProb(ra, rb, hb);
const bar = (x) => "#".repeat(Math.round(x * 30));

console.log(`\n  ${a} (Elo ${ra})  vs  ${b} (Elo ${rb})${hb ? `   [${home} at home]` : "   [neutral]"}\n`);
console.log(`  ${a.padEnd(16)} win  ${(p.winA*100).toFixed(1).padStart(5)}%  ${bar(p.winA)}`);
console.log(`  ${"draw".padEnd(16)}      ${(p.draw*100).toFixed(1).padStart(5)}%  ${bar(p.draw)}`);
console.log(`  ${b.padEnd(16)} win  ${(p.winB*100).toFixed(1).padStart(5)}%  ${bar(p.winB)}`);
console.log(`\n  expected goals:  ${p.expectedGoalsA.toFixed(2)} - ${p.expectedGoalsB.toFixed(2)}`);
console.log(`  over 2.5: ${(p.over25*100).toFixed(0)}%   under 2.5: ${(p.under25*100).toFixed(0)}%   BTTS: ${(p.btts*100).toFixed(0)}%`);
console.log(`  likely scores:  ${p.topScores.slice(0,3).map((s) => `${s.score} (${(s.p*100).toFixed(0)}%)`).join("   ")}`);
console.log(`\n  Driving factors:`);
for (const f of explainMatch(a, b, ra, rb, p, hb)) console.log(`   - ${f}`);
console.log("");
