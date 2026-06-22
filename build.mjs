#!/usr/bin/env node
// Assemble the publishable dataset (JSON + CSV) for research notes / data cards / API / widgets.
// Reads calibrated ratings + tournament odds + group draw; writes ./outputs.
// Each row carries probabilities, a confidence interval, and short driving factors.
//   node build.mjs   (run `simulate` first)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { matchProb, HOME_ADV } from "./elo.mjs";
import { explainMatch, explainTeam } from "./explain.mjs";

const D = (f) => new URL(`./data/${f}`, import.meta.url);
const O = (f) => new URL(`./outputs/${f}`, import.meta.url);
mkdirSync(new URL("./outputs/", import.meta.url), { recursive: true });

const { ratings } = JSON.parse(readFileSync(D("elo-calibrated.json"), "utf8"));
const tourney = JSON.parse(readFileSync(D("tournament-odds.json"), "utf8"));
const { groups } = JSON.parse(readFileSync(D("groups.json"), "utf8"));
const { homeNations } = JSON.parse(readFileSync(D("seed-elo.json"), "utf8"));
const HOSTS = new Set(homeNations);
const synthetic = tourney.dataIsSynthetic !== false;

const csv = (rows) => rows.map((r) => r.map((v) => {
  const s = Array.isArray(v) ? v.join(" | ") : String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(",")).join("\n") + "\n";

// ---- 1) Per-team tournament dataset ----
const teamRows = tourney.teams.map((t) => ({
  team: t.team, group: t.group, elo: t.elo,
  advance: t.advance, r16: t.r16, qf: t.qf, sf: t.sf, final: t.final,
  champion: t.champion, championCI: t.championCI,
  drivers: explainTeam(t),
}));

writeFileSync(O("foregate-tournament.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), sims: tourney.sims, seed: tourney.seed,
  dataIsSynthetic: synthetic, eloSource: tourney.eloSource || null, teams: teamRows,
}, null, 2) + "\n");

writeFileSync(O("foregate-tournament.csv"), csv([
  ["team","group","elo","advance","r16","qf","sf","final","champion","champion_ci_lo","champion_ci_hi","drivers"],
  ...teamRows.map((r) => [r.team, r.group, r.elo, r.advance, r.r16, r.qf, r.sf, r.final, r.champion,
    r.championCI[0], r.championCI[1], r.drivers]),
]));

// ---- 2) Every group-stage match: 1X2 + goals + drivers ----
const matchRows = [];
for (const [g, teams] of Object.entries(groups)) {
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const a = teams[i], b = teams[j];
    const hb = (HOSTS.has(a) ? HOME_ADV : 0) - (HOSTS.has(b) ? HOME_ADV : 0);
    const p = matchProb(ratings[a], ratings[b], hb);
    matchRows.push({
      matchId: `G${g}-${a}-${b}`, group: g, home: a, away: b,
      pHome: +p.winA.toFixed(4), pDraw: +p.draw.toFixed(4), pAway: +p.winB.toFixed(4),
      expGoalsHome: +p.expectedGoalsA.toFixed(2), expGoalsAway: +p.expectedGoalsB.toFixed(2),
      over25: +p.over25.toFixed(4), btts: +p.btts.toFixed(4),
      topScore: p.topScores[0].score, topScoreP: p.topScores[0].p,
      drivers: explainMatch(a, b, ratings[a], ratings[b], p, hb),
    });
  }
}
writeFileSync(O("foregate-matches.json"), JSON.stringify({ generatedAt: new Date().toISOString(), dataIsSynthetic: synthetic, matches: matchRows }, null, 2) + "\n");
writeFileSync(O("foregate-matches.csv"), csv([
  ["match_id","group","home","away","p_home","p_draw","p_away","exp_goals_home","exp_goals_away","over_2_5","btts","top_score","top_score_p","drivers"],
  ...matchRows.map((m) => [m.matchId, m.group, m.home, m.away, m.pHome, m.pDraw, m.pAway, m.expGoalsHome, m.expGoalsAway, m.over25, m.btts, m.topScore, m.topScoreP, m.drivers]),
]));

console.log(`Built dataset -> outputs/`);
console.log(`  foregate-tournament.json / .csv   (${teamRows.length} teams: champion/advance + CI + drivers)`);
console.log(`  foregate-matches.json / .csv      (${matchRows.length} group matches: 1X2 + goals + drivers)`);
