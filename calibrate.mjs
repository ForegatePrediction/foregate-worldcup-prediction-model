#!/usr/bin/env node
// Calibrate Elo ratings on recent internationals (data/results.json) → data/elo-calibrated.json.
// Seeds from long-run priors, then nudges with actual form (event-importance- & recency-weighted),
// and shrinks 70/30 back to prior to damp friendly noise.
//   node calibrate.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { baseK, goalDiffMult, expectedScore, HOME_ADV } from "./elo.mjs";

const D = (f) => new URL(`./data/${f}`, import.meta.url);
const { ratings: SEED, homeNations } = JSON.parse(readFileSync(D("seed-elo.json"), "utf8"));
const HOSTS = new Set(homeNations);

// Recency: 18-month half-life (in seconds).
const recency = (tsSec, nowSec) => Math.pow(0.5, ((nowSec - tsSec) / (30.44 * 86400)) / 18);

const { matches } = JSON.parse(readFileSync(D("results.json"), "utf8"));
const nowSec = matches.length ? matches[matches.length - 1].ts : Math.floor(Date.now() / 1000);

const R = {};
const key = (slug, name) => slug ?? `ghost:${name}`;
const getR = (slug, name) => { const k = key(slug, name); if (R[k] == null) R[k] = (slug && SEED[slug] != null) ? SEED[slug] : 1500; return R[k]; };
const setR = (slug, name, v) => { R[key(slug, name)] = v; };

let applied = 0;
for (const m of matches) {
  if (m.hg == null || m.ag == null) continue;
  const ra = getR(m.homeSlug, m.homeName), rb = getR(m.awaySlug, m.awayName);
  const homeBonus = HOSTS.has(m.homeSlug) ? HOME_ADV / 2 : 0;
  const exp = expectedScore(ra, rb, homeBonus);
  const score = m.hg > m.ag ? 1 : m.hg < m.ag ? 0 : 0.5;
  const k = baseK(m.leagueName) * recency(m.ts, nowSec) * goalDiffMult(m.hg - m.ag);
  const delta = k * (score - exp);
  setR(m.homeSlug, m.homeName, ra + delta);
  setR(m.awaySlug, m.awayName, rb - delta);
  applied++;
}

// 70% calibrated + 30% prior.
const ratings = {};
for (const slug of Object.keys(SEED)) ratings[slug] = Math.round(0.7 * (R[slug] ?? SEED[slug]) + 0.3 * SEED[slug]);

writeFileSync(D("elo-calibrated.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  matchesApplied: applied,
  method: "Seed priors → event-importance-K + 18-mo recency + goal-diff weighted Elo update → 70/30 shrink to prior.",
  ratings,
}, null, 2) + "\n");

const top = Object.entries(ratings).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`Calibrated ${Object.keys(ratings).length} teams from ${applied} weighted matches → data/elo-calibrated.json`);
console.log("Top 10:", top.map(([t, r]) => `${t} ${r}`).join("  "));
