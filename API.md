# ForeGate Prediction API

A tiny HTTP wrapper around the model — for serving predictions to apps, data cards, or an
agent marketplace. Zero dependencies, Node 18+.

## Run locally
```bash
node server.mjs           # http://localhost:3000  (or set PORT)
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + endpoint list |
| GET | `/teams` | List the 48 team slugs + Elo snapshot date |
| GET | `/predict?home=<slug>&away=<slug>[&homeTeam=<slug>]` | Full single-match prediction |
| GET | `/tournament[?limit=N]` | Champion / advance probabilities per team |

`homeTeam` is optional; set it (to `home` or `away`) only for a host-nation match (USA/MEX/CAN), otherwise the venue is neutral. Team slugs are lowercase, hyphenated (e.g. `south-korea`, `ivory-coast`, `dr-congo`) — see `/teams`.

### Example
```
GET /predict?home=spain&away=germany
```
```json
{
  "match": "spain vs germany",
  "venue": "neutral",
  "ratings": { "spain": 2129, "germany": 1954 },
  "result_1x2": { "home_win": 0.60, "draw": 0.25, "away_win": 0.15 },
  "expected_goals": { "home": 1.9, "away": 0.9, "supremacy": 1.0 },
  "over_under_2_5": { "over": 0.52, "under": 0.48 },
  "btts": { "yes": 0.49, "no": 0.51 },
  "asian_handicap": { "favourite": "spain", "line": -1.0 },
  "likely_scores": [ { "score": "1-0", "p": 0.12 } ],
  "drivers": [ "Spain is ... Elo points stronger — the model's lean" ],
  "model": { "method": "event-weighted Elo + Dixon-Coles Poisson", "eloSnapshot": "2026-06-21", "deterministic": true }
}
```

Output is deterministic: the same inputs + same Elo snapshot always return the same numbers (auditable).

## Deploy (serverless / free tier)

The engine is tiny and stateless, so a free tier is plenty.

- **Render / Railway / Fly** — Node web service, start command `node server.mjs` (binds `PORT`). Zero config.
- **Vercel** — `api/predict.mjs` is a ready serverless function (`/api/predict?...`). Add other endpoints similarly.
- **Cloudflare Workers** — reuse `predictMatch()` from `api/core.mjs` inside an `export default { fetch }` handler.

Keep ratings current by running `node update-elo.mjs` (or the daily GitHub Actions workflow), then redeploy / let the host pull the refreshed `data/`.

## Next step: monetize on OKX Agent Marketplace (A2MCP)
This API is the A2MCP service endpoint. To accept pay-per-call, wrap it with the OKX Payment SDK
(x402) — see the marketplace's integration docs — then register the public URL as an A2MCP ASP.
