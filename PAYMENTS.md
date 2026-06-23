# Monetizing the API on OKX Agent Marketplace (A2MCP · x402)

The prediction API can run **free** (default) or **pay-per-call** (x402). Toggle with one env var —
no code change, no redeploy of code (just set env on your host).

## What lives where
- **Code**: `api/x402.mjs` (payment gate) + `server.mjs` (wires it onto `/predict` and `/tournament`).
  Edited locally → pushed to GitHub → auto-deployed on Render. Same place as the API.
- **Secrets/config**: NOT in code. Set as environment variables on Render (Dashboard → your service →
  **Environment**). `.env.example` lists them. Local testing can use a `.env` (gitignored).

## How it works (x402 handshake)
1. A caller hits `/predict` with no payment → server returns **HTTP 402** with `accepts`
   (price, asset `USDG`, your `payTo` address, network `x-layer`).
2. The caller pays and retries with header `X-PAYMENT: <payload>`.
3. The server sends that payload to the **OKX Payment facilitator** `/verify`; if valid it serves the
   prediction, then calls `/settle` and returns `X-PAYMENT-RESPONSE`.

`/health` and `/teams` stay free; only `/predict` and `/tournament` are gated.

## Go-live steps (do these on Render — Openclaw handles the on-chain registration)
1. In Render → your service → **Environment**, add:
   - `PAYWALL_ENABLED=true`
   - `PRICE_USDG=0.01` (intro price; raise later)
   - `PAY_TO_ADDRESS=<your Agentic Wallet address>`  ← paste from Onchain OS (an address, not a key)
   - `OKX_FACILITATOR_URL=<from OKX Payment SDK docs>`
   - `OKX_FACILITATOR_KEY=<if the SDK issues one>`
2. Save → Render redeploys. `GET /health` will then show `"paywall": true`.
3. Register this URL as an **A2MCP ASP** on OKX Agent Marketplace (Openclaw, via Onchain OS), e.g.:
   - service name: `ForeGate World Cup Predictions`
   - endpoint: `https://foregate-worldcup-prediction.onrender.com/predict`
   - price: `0.01 USDG`

## One TODO to confirm against the real SDK
In `api/x402.mjs`, `verifyPayment()` treats the facilitator response as valid when
`info.valid === true` (or `isValid`). When you get the OKX Payment SDK docs, confirm the exact
endpoint paths (`/verify`, `/settle`) and the success field name, and tweak that one line if needed.
Everything else (402 challenge, header handling, settle, env wiring) is already in place.

## Test locally
```bash
PAYWALL_ENABLED=false node server.mjs   # free mode (current production default)
PAYWALL_ENABLED=true  node server.mjs   # paid mode: /predict returns 402 until a valid X-PAYMENT is sent
```
