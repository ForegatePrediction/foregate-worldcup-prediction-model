#!/usr/bin/env node
// Import REAL national-team Elo priors for the 48 qualified teams from a World Football Elo
// (eloratings.net) snapshot. World Football Elo is ALREADY calibrated on all real results, so we use
// it directly as both the seed prior AND the calibrated rating the rest of the pipeline consumes.
//
// Snapshot source: https://www.eloratings.net/World.tsv  (column 4 = current Elo)
// For an automatic daily refresh during the tournament, use `node update-elo.mjs` instead.
//   node data/import-elo.mjs
import { readFileSync, writeFileSync } from "node:fs";

const D = (f) => new URL(`./${f}`, import.meta.url);
const SNAPSHOT_DATE = "2026-06-21";
const HOME_NATIONS = ["usa", "mexico", "canada"];

// The 48 qualified teams (official 2026 finals) -> real current Elo (eloratings.net).
const SNAPSHOT = {
  // Group A
  mexico: 1896, "south-africa": 1527, "south-korea": 1771, "czech-republic": 1696,
  // Group B
  canada: 1777, "bosnia-and-herzegovina": 1596, qatar: 1437, switzerland: 1885,
  // Group C
  brazil: 1986, morocco: 1866, haiti: 1528, scotland: 1768,
  // Group D
  usa: 1820, paraguay: 1816, australia: 1799, turkey: 1813,
  // Group E
  germany: 1954, curacao: 1427, "ivory-coast": 1728, ecuador: 1890,
  // Group F
  netherlands: 1972, japan: 1910, sweden: 1727, tunisia: 1585,
  // Group G
  belgium: 1879, egypt: 1711, iran: 1756, "new-zealand": 1578,
  // Group H
  spain: 2129, "cape-verde": 1606, "saudi-arabia": 1598, uruguay: 1870,
  // Group I
  france: 2084, senegal: 1839, iraq: 1592, norway: 1929,
  // Group J
  argentina: 2128, algeria: 1759, austria: 1857, jordan: 1653,
  // Group K
  portugal: 1967, "dr-congo": 1674, uzbekistan: 1698, colombia: 1998,
  // Group L
  england: 2055, croatia: 1881, ghana: 1557, panama: 1683,
};

const slugs = Object.keys(SNAPSHOT);
if (slugs.length !== 48) { console.error(`Expected 48 teams, got ${slugs.length}.`); process.exit(1); }
const ratings = {};
for (const s of slugs) ratings[s] = SNAPSHOT[s];

writeFileSync(D("seed-elo.json"), JSON.stringify({
  _note: `REAL national-team Elo for the 48 qualified teams, from World Football Elo (eloratings.net), snapshot ${SNAPSHOT_DATE}. Hosts get a venue bonus only when playing at home (USA/MEX/CAN 2026).`,
  source: "https://www.eloratings.net/World.tsv",
  snapshotDate: SNAPSHOT_DATE,
  homeNations: HOME_NATIONS,
  ratings,
}, null, 2) + "\n");

writeFileSync(D("elo-calibrated.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "World Football Elo — https://www.eloratings.net",
  snapshotDate: SNAPSHOT_DATE,
  dataIsSynthetic: false,
  method: "Real World Football Elo snapshot used directly (already calibrated on all real internationals).",
  ratings,
}, null, 2) + "\n");

const top = Object.entries(ratings).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`Imported REAL Elo for ${slugs.length} qualified teams (eloratings.net ${SNAPSHOT_DATE})`);
console.log("-> data/seed-elo.json and data/elo-calibrated.json");
console.log("Top 10:", top.map(([t, r]) => `${t} ${r}`).join("  "));
