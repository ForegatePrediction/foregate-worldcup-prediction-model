#!/usr/bin/env node
// Import REAL international results into data/results.json (the engine's main input).
// Source: martj42 "International football results from 1872 to present" (CC0 / public domain).
//   https://github.com/martj42/international_results  -> results.csv
//   columns: date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
//
// Usage:
//   node data/import-real.mjs <results.csv> [fromDate=2018-01-01] [toDate=today]
//   node data/import-real.mjs data/raw/results.csv 2022-01-01
//
// Maps full country names to the slugs used in seed-elo.json, keeps the original tournament name
// (so calibrate.mjs's event-weighted K applies), filters to played matches in the date window, and
// writes a results.json the rest of the pipeline consumes unchanged.
import { readFileSync, writeFileSync } from "node:fs";

const D = (f) => new URL(`./${f}`, import.meta.url);
const [csvPath, fromArg, toArg] = process.argv.slice(2);
if (!csvPath) { console.error("Usage: node data/import-real.mjs <results.csv> [fromDate] [toDate]"); process.exit(1); }

const fromTs = Date.parse((fromArg || "2018-01-01") + "T00:00:00Z") / 1000;
const toTs = Date.parse((toArg || new Date().toISOString().slice(0, 10)) + "T23:59:59Z") / 1000;

// Finalist names whose slug isn't just slugify(name). slugify handles the rest (south korea,
// czech republic, ivory coast, bosnia and herzegovina, saudi arabia... all map correctly).
const ALIAS = {
  "united states": "usa", "usa": "usa",
  "ir iran": "iran", "iran": "iran",
  "czechia": "czech-republic", "czech republic": "czech-republic",
  "south korea": "south-korea", "korea republic": "south-korea",
  "cote d'ivoire": "ivory-coast", "ivory coast": "ivory-coast",
};
const slugify = (name) => {
  // lowercase + strip accents FIRST, then check alias, then hyphenate.
  const norm = name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (ALIAS[norm]) return ALIAS[norm];
  return norm.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
};

// Minimal RFC-4180-ish CSV parser (handles quoted fields with commas).
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const text = readFileSync(csvPath, "utf8");
const rows = parseCSV(text);
const header = rows.shift().map((h) => h.trim().toLowerCase());
const idx = (name) => header.indexOf(name);
const iDate = idx("date"), iH = idx("home_team"), iA = idx("away_team"),
      iHS = idx("home_score"), iAS = idx("away_score"), iT = idx("tournament"),
      iCity = idx("city"), iCountry = idx("country"), iNeutral = idx("neutral");
if ([iDate, iH, iA, iHS, iAS, iT].some((x) => x < 0)) {
  console.error("Unexpected CSV header. Expected martj42 columns: date,home_team,away_team,home_score,away_score,tournament,...");
  process.exit(1);
}

const { ratings: SEED } = JSON.parse(readFileSync(D("seed-elo.json"), "utf8"));
const finalists = new Set(Object.keys(SEED));
const seenFinalists = new Set();

const matches = [];
for (const r of rows) {
  if (!r[iDate] || r[iHS] === "" || r[iAS] === "" || r[iHS] == null) continue;
  const ts = Math.floor(Date.parse(r[iDate] + "T12:00:00Z") / 1000);
  if (isNaN(ts) || ts < fromTs || ts > toTs) continue;
  const hg = parseInt(r[iHS], 10), ag = parseInt(r[iAS], 10);
  if (isNaN(hg) || isNaN(ag)) continue;
  const homeSlug = slugify(r[iH]), awaySlug = slugify(r[iA]);
  if (finalists.has(homeSlug)) seenFinalists.add(homeSlug);
  if (finalists.has(awaySlug)) seenFinalists.add(awaySlug);
  matches.push({
    ts, leagueName: (r[iT] || "Friendly").trim(),
    homeSlug, homeName: r[iH].trim(), awaySlug, awayName: r[iA].trim(),
    hg, ag,
    neutral: iNeutral >= 0 ? /true/i.test(r[iNeutral]) : false,
    city: iCity >= 0 ? r[iCity] : undefined, country: iCountry >= 0 ? r[iCountry] : undefined,
  });
}
matches.sort((x, y) => x.ts - y.ts);

writeFileSync(D("results.json"), JSON.stringify({
  _note: `Imported from ${csvPath} (martj42 international results, CC0). Window ${(fromArg||"2018-01-01")}..${(toArg||"today")}.`,
  source: "https://github.com/martj42/international_results",
  matches,
}, null, 2) + "\n");

const missing = [...finalists].filter((f) => !seenFinalists.has(f));
console.log(`Imported ${matches.length} real matches -> data/results.json`);
console.log(`Date window: ${new Date(fromTs*1000).toISOString().slice(0,10)} .. ${new Date(toTs*1000).toISOString().slice(0,10)}`);
console.log(`Finalists with data: ${seenFinalists.size}/48`);
if (missing.length) console.warn(`[!] No matches found for ${missing.length} finalist slug(s) — check name mapping: ${missing.join(", ")}`);
console.log(`Next: node calibrate.mjs && node backtest.mjs && node simulate.mjs && node build.mjs`);
