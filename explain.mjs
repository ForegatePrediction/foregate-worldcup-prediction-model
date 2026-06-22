// Explainability layer — turn a prediction into short, human "driving factors" for research notes
// and data cards. Pure functions; the model computes probabilities, this only describes them.
import { HOME_ADV } from "./elo.mjs";

const title = (s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Driving factors for a single match (1X2).
export function explainMatch(a, b, ratingA, ratingB, p, homeBonusA = 0) {
  const out = [];
  const diff = (ratingA + homeBonusA) - ratingB;
  const strong = Math.abs(diff) >= 60 ? (p.winA > p.winB ? a : b) : null;
  if (strong) out.push(`${title(strong)} is ${Math.abs(diff).toFixed(0)} Elo points stronger — the model's lean`);
  else out.push(`Both sides rated within ${Math.abs(diff).toFixed(0)} Elo — close to a coin-flip`);
  if (homeBonusA >= HOME_ADV) out.push(`${title(a)} gets the host-nation venue bonus (+${HOME_ADV} Elo)`);
  else if (homeBonusA <= -HOME_ADV) out.push(`${title(b)} gets the host-nation venue bonus (+${HOME_ADV} Elo)`);
  if (p.draw >= 0.28) out.push(`Tight rating + low-scoring tendency -> elevated draw chance (${(p.draw*100).toFixed(0)}%)`);
  out.push(`Expected score ${p.expectedGoalsA.toFixed(1)}-${p.expectedGoalsB.toFixed(1)}, over-2.5 goals ${(p.over25*100).toFixed(0)}%`);
  return out;
}

// Driving factors for a team's tournament outlook.
export function explainTeam(row) {
  const out = [];
  out.push(`Calibrated Elo ${row.elo}, Group ${row.group}; advance probability ${(row.advance*100).toFixed(0)}%`);
  if (row.champion >= 0.08) out.push(`Title favourite (${(row.champion*100).toFixed(1)}%)`);
  else if (row.champion >= 0.03) out.push(`Live title contender (${(row.champion*100).toFixed(1)}%)`);
  else if (row.advance >= 0.5) out.push(`Solid qualifier, capable of a deep knockout run`);
  else out.push(`Advancing from the group is already a challenge`);
  return out;
}
