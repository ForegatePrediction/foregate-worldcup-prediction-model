#!/usr/bin/env node
// Daily update: fetch the latest World Football Elo (eloratings.net), refresh the 48-team ratings,
// then re-run the tournament simulation and rebuild the published datasets.
// National-team Elo shifts as results come in, so run this once a day during the tournament.
//   node update-elo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const D = (f) => new URL(`./data/${f}`, import.meta.url);
const TSV_URL = "https://www.eloratings.net/World.tsv";

// eloratings.net country code -> our slug, for the 48 qualified teams.
const CODE = {
  MX: "mexico", ZA: "south-africa", KR: "south-korea", CZ: "czech-republic",
  CA: "canada", BA: "bosnia-and-herzegovina", QA: "qatar", CH: "switzerland",
  BR: "brazil", MA: "morocco", HT: "haiti", SQ: "scotland",
  US: "usa", PY: "paraguay", AU: "australia", TR: "turkey",
  DE: "germany", CW: "curacao", CI: "ivory-coast", EC: "ecuador",
  NL: "netherlands", JP: "japan", SE: "sweden", TN: "tunisia",
  BE: "belgium", EG: "egypt", IR: "iran", NZ: "new-zealand",
  ES: "spain", CV: "cape-verde", SA: "saudi-arabia", UY: "uruguay",
  FR: "france", SN: "senegal", IQ: "iraq", NO: "norway",
  AR: "argentina", DZ: "algeria", AT: "austria", JO: "jordan",
  PT: "portugal", CD: "dr-congo", UZ: "uzbekistan", CO: "colombia",
  EN: "england", HR: "croatia", GH: "ghana", PA: "panama",
};

const seed = JSON.parse(readFileSync(D("seed-elo.json"), "utf8"));
const ratings = { ...seed.ratings };

console.log(`Fetching ${TSV_URL} ...`);
const res = await fetch(TSV_URL, { headers: { "User-Agent": "foregate-worldcup-model" } });
if (!res.ok) { console.error(`Fetch failed: HTTP ${res.status}`); process.exit(1); }
const tsv = await res.text();

let updated = 0;
for (const line of tsv.split("\n")) {
  const f = line.split("\t");
  if (f.length < 4) continue;
  const code = f[2], elo = parseInt(f[3], 10);
  const slug = CODE[code];
  if (slug && !Number.isNaN(elo)) { ratings[slug] = elo; updated++; }
}
if (updated < 40) { console.error(`Only matched ${updated}/48 teams — aborting to avoid bad data.`); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
seed.snapshotDate = today;
seed.ratings = ratings;
writeFileSync(D("seed-elo.json"), JSON.stringify(seed, null, 2) + "\n");
writeFileSync(D("elo-calibrated.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "World Football Elo — https://www.eloratings.net",
  snapshotDate: today,
  dataIsSynthetic: false,
  method: "Real World Football Elo snapshot used directly (already calibrated on all real internationals).",
  ratings,
}, null, 2) + "\n");
console.log(`Updated ${updated}/48 team ratings -> snapshot ${today}`);

// Re-run the simulation and rebuild the datasets.
const root = new URL("./", import.meta.url).pathname;
execSync("node simulate.mjs", { cwd: root, stdio: "inherit" });
execSync("node build.mjs", { cwd: root, stdio: "inherit" });
console.log("Daily update complete.");
