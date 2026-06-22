# 🏆 ForeGate World Cup 2026 Prediction Model

> 繁體中文版說明:[README.zh-Hant.md](README.zh-Hant.md)

An open-source, transparent, hit-rate-published statistical model for the 2026 FIFA World Cup —
**event-weighted Elo → Dixon-Coles bivariate Poisson → full-tournament Monte Carlo**. No ML black
box, no bookmaker odds as input. Deterministic, reproducible, auditable.

The repo ships with **real data**: the official 48-team field with current national-team Elo from
World Football Elo ([eloratings.net](https://www.eloratings.net)), the official FIFA group draw, and
a real match history derived from [martj42 international results](https://github.com/martj42/international_results)
(CC0). Ratings can be refreshed daily during the tournament (see [Daily updates](#daily-updates)).

---

## Quick start

Zero dependencies, Node 18+. The repo already contains real ratings, so you can predict immediately
after cloning:

```bash
git clone https://github.com/<you>/foregate-worldcup-model.git
cd foregate-worldcup-model

node predict.mjs spain germany     # head-to-head 1X2 + goals + driving factors
node predict.mjs usa mexico usa    # 3rd arg = home team (host-nation bonus)
node simulate.mjs 10000 2026       # full-tournament Monte Carlo (champion / advance odds)
node build.mjs                     # emit JSON + CSV datasets (for reports / data cards / API)
node backtest.mjs                  # reproduce the out-of-sample hit-rate
```

`predict.mjs` prints win/draw/loss, expected goals, over/under 2.5, BTTS, the most likely scorelines,
and short driving factors.

---

## Methodology

### 1. Team strength (event-weighted Elo) — `elo.mjs` + `calibrate.mjs`
Each team starts from a long-run prior and is calibrated match-by-match on recent real
internationals. The update rule borrows the essentials of World Football Elo:

- **Event-importance K**: World Cup finals K=60 > continental cups 50 > qualifiers 40 > Nations
  League 32 > friendlies 20. Big games move ratings more than friendlies.
- **Goal-difference multiplier**: win by 2 ×1.5, by 3 ×1.75… a big win is stronger evidence.
- **18-month half-life time decay**: recent form weighs more.
- **Host-nation venue bonus**: only USA/MEX/CAN, only at home in 2026, +75 Elo.
- **70/30 shrink**: final = 0.7×calibrated + 0.3×prior, to damp friendly noise.

### 2. Single match (Dixon-Coles bivariate Poisson) — `elo.mjs`
Rating difference → expected goals λ (`1.35 + diff/350`, clamped 0.3–3.5) → bivariate Poisson over a
0–8 goal grid → win/draw/loss, over/under, BTTS, top-N scorelines. The **Dixon-Coles τ correction**
(ρ = −0.13) fixes plain Poisson's under-count of low-scoring draws (0-0, 1-1).

### 3. Full-tournament Monte Carlo — `simulate.mjs`
2026 format: 12 groups × 4 → top 2 + 8 best third-placed = 32 → Round of 32 → R16 → QF → SF → Final.
- Default **10,000 seeded simulations** (`mulberry32` fixed seed → same input always gives the same
  output = auditable).
- Group games sample realistic scorelines (draws allowed); knockouts use `allowDraw=false` with a
  penalty-shootout nudge by Elo.
- **90-minute result (1X2) and advancement (incl. shootouts) are strictly separated** — advancement
  rate is never used as a 90-minute win probability.
- Outputs each team's **advance / R16 / QF / SF / final / champion** probabilities + a 95%
  confidence interval on the champion probability.

### 4. Explainability layer — `explain.mjs`
Every output carries short "driving factors" (rating gap, home edge, draw tendency, expected score)
ready to drop into research notes / data cards.

---

## Backtest & published hit-rate — `backtest.mjs`

Walk-forward, **out-of-sample, no look-ahead**: each match is predicted from ratings built only on
prior matches, then the ratings are updated. Reports accuracy, Brier, **RPS** (the proper score for
ordered 1X2), log-loss, **ECE** (calibration error) and a reliability curve, against baselines.

On ~8,000 real internationals (martj42 data, 2018 onward), the model lands around **57–58% result
accuracy** with **excellent calibration (ECE ≈ 1.6%)** — Brier and RPS far beat the uniform
baseline. Honest framing: raw accuracy is roughly level with "just pick the higher-Elo side"; the
model's real value is calibrated probabilities. We make **no claim to beat the betting market**.
Failures are published, nothing hidden; during the tournament a live "predicted X / hit Y / current
Z%" counter rolls forward.

---

## Deliverables — `build.mjs` → `outputs/`

| File | Contents |
|---|---|
| `outputs/foregate-tournament.json` / `.csv` | 48 teams: stage-advance + champion probs + **confidence interval** + driving factors |
| `outputs/foregate-matches.json` / `.csv` | group matches: 1X2 + over/under + BTTS + top score + driving factors |
| `data/elo-calibrated.json` | Calibrated Elo for the 48 teams |
| `data/tournament-odds.json` | Raw Monte Carlo probabilities |
| `data/model-backtest.json` | Backtest metrics (recomputed by `node backtest.mjs`) |

Fields include team/match ID, all probabilities, confidence intervals, and driving factors — ready
for reports / data cards / landing pages / widgets / API.

---

## Data

- **Teams & Elo** — the official 48 qualified teams with current national-team Elo from
  [World Football Elo (eloratings.net)](https://www.eloratings.net). Regenerate with
  `node data/import-elo.mjs`. (Note: ClubElo is **club** football and has no national teams.)
- **Group draw** — the official FIFA 2026 draw in `data/groups.json` (12 groups of 4).
- **Match history** — `data/results.json`, derived from
  [martj42 international results](https://github.com/martj42/international_results) (CC0). Rebuild with:
  ```bash
  mkdir -p data/raw            # gitignored — raw downloads stay local
  # download results.csv into data/raw/
  node data/import-real.mjs data/raw/results.csv 2018-01-01
  ```

### Roadmap
- xG as a cleaner strength signal (FBref via [soccerdata](https://github.com/probberechts/soccerdata); national-team xG coverage is limited).
- Bayesian hierarchical model for interval scoreline distributions.

### Attribution
Elo: World Football Elo (eloratings.net). Results: martj42 (CC0). Each dataset follows its own license.

---

## Daily updates

National-team Elo shifts as tournament results come in. `update-elo.mjs` fetches the latest
eloratings.net snapshot, rewrites the 48-team ratings, and re-runs the simulation and dataset build:

```bash
node update-elo.mjs            # refresh Elo -> simulate -> build
```

A ready-to-use GitHub Actions workflow (`.github/workflows/daily-update.yml`) runs this automatically
once a day and commits the refreshed `data/` and `outputs/`.

---

## File overview

| File | Purpose |
|---|---|
| `elo.mjs` | Match model: Elo, event-weighted K, goal-diff multiplier, Dixon-Coles, bivariate Poisson, seeded RNG |
| `calibrate.mjs` | Build calibrated Elo (time decay + importance weighting) |
| `backtest.mjs` | Walk-forward out-of-sample backtest (accuracy/Brier/RPS/log-loss/ECE) |
| `simulate.mjs` | Full-tournament Monte Carlo (champion / advance probabilities) |
| `explain.mjs` | Explainability / driving factors |
| `predict.mjs` | Head-to-head prediction CLI |
| `build.mjs` | Emit JSON + CSV deliverables |
| `update-elo.mjs` | Refresh Elo from eloratings.net, then re-simulate + rebuild (for daily updates) |
| `data/import-elo.mjs` | Load the official 48 teams + real Elo |
| `data/import-real.mjs` | Import real internationals (martj42 CSV → results.json) |

---

## License

MIT — see [LICENSE](LICENSE). Bundled data follows its own license (World Football Elo; martj42 CC0).
Not betting advice; probabilities are statistical estimates.
