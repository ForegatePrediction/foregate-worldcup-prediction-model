// Prediction API core — shared by the HTTP server and serverless functions.
// Pure functions over the committed model + data; no network, no dependencies.
import { readFileSync } from "node:fs";
import { matchProb, HOME_ADV } from "../elo.mjs";
import { explainMatch, explainTeam } from "../explain.mjs";

const D = (f) => new URL(`../data/${f}`, import.meta.url);
const elo = JSON.parse(readFileSync(D("elo-calibrated.json"), "utf8"));
const { homeNations } = JSON.parse(readFileSync(D("seed-elo.json"), "utf8"));
const HOSTS = new Set(homeNations);
const RATINGS = elo.ratings;

const round2 = (x) => Math.round(x * 100) / 100;
const round4 = (x) => Math.round(x * 10000) / 10000;
const handicapLine = (sup) => round2(Math.round(Math.abs(sup) / 0.25) * 0.25);

export function listTeams() {
  return { teams: Object.keys(RATINGS).sort(), eloSnapshot: elo.snapshotDate, source: elo.source };
}

// Head-to-head prediction with all markets.
export function predictMatch(home, away, homeTeam) {
  if (!home || !away) return { error: "Provide 'home' and 'away' team slugs. See /teams." };
  const a = String(home).toLowerCase(), b = String(away).toLowerCase();
  if (RATINGS[a] == null) return { error: `Unknown team: ${a}. See /teams.` };
  if (RATINGS[b] == null) return { error: `Unknown team: ${b}. See /teams.` };

  const ht = homeTeam ? String(homeTeam).toLowerCase() : null;
  const hb = ht === a ? HOME_ADV : ht === b ? -HOME_ADV : 0;
  const p = matchProb(RATINGS[a], RATINGS[b], hb);
  const supremacy = p.expectedGoalsA - p.expectedGoalsB;
  const favourite = supremacy >= 0 ? a : b;

  return {
    match: `${a} vs ${b}`,
    venue: hb ? `${ht} at home` : "neutral",
    ratings: { [a]: RATINGS[a], [b]: RATINGS[b] },
    result_1x2: { home_win: round4(p.winA), draw: round4(p.draw), away_win: round4(p.winB) },
    expected_goals: { home: round2(p.expectedGoalsA), away: round2(p.expectedGoalsB), supremacy: round2(supremacy) },
    over_under_2_5: { over: round4(p.over25), under: round4(p.under25) },
    btts: { yes: round4(p.btts), no: round4(1 - p.btts) },
    asian_handicap: { favourite, line: -handicapLine(supremacy) },
    likely_scores: p.topScores.slice(0, 3),
    drivers: explainMatch(a, b, RATINGS[a], RATINGS[b], p, hb),
    model: { method: "event-weighted Elo + Dixon-Coles Poisson", eloSnapshot: elo.snapshotDate, deterministic: true },
  };
}

// Pre-computed tournament odds (champion / advance), refreshed by simulate.mjs + update-elo.mjs.
export function tournament(limit) {
  let t;
  try { t = JSON.parse(readFileSync(D("tournament-odds.json"), "utf8")); }
  catch { return { error: "tournament-odds.json not found — run `node simulate.mjs` first." }; }
  const teams = t.teams.map((x) => ({
    team: x.team, group: x.group, elo: x.elo,
    champion: x.champion, final: x.final, sf: x.sf, qf: x.qf, r16: x.r16, advance: x.advance,
    championCI: x.championCI, drivers: explainTeam(x),
  }));
  return { sims: t.sims, seed: t.seed, eloSnapshot: elo.snapshotDate, teams: limit ? teams.slice(0, limit) : teams };
}
