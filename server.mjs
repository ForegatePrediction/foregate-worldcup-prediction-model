#!/usr/bin/env node
// Zero-dependency HTTP server exposing the ForeGate prediction API.
// Runs anywhere Node 18+ runs (Render / Railway / Fly / a VPS): `node server.mjs`.
// Binds the PORT env var (default 3000).
//   GET /health
//   GET /teams
//   GET /predict?home=spain&away=germany[&homeTeam=spain]
//   GET /tournament[?limit=10]
import { createServer } from "node:http";
import { listTeams, predictMatch, tournament } from "./api/core.mjs";
import { paywallEnabled, buildChallenge, decodePaymentSignature, verifyAndSettle } from "./api/x402.mjs";

const PORT = process.env.PORT || 3000;
const PAID = new Set(["/predict", "/tournament"]); // /health and /teams stay free

const send = (res, code, body, extraHeaders = {}) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", ...extraHeaders });
  res.end(JSON.stringify(body, null, 2));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = url.searchParams;
  try {
    // x402 v2 pay-per-call gate (only when PAYWALL_ENABLED=true).
    if (paywallEnabled() && PAID.has(url.pathname)) {
      const resourceUrl = `https://${req.headers.host}${url.pathname}`;
      const decoded = decodePaymentSignature(req.headers["payment-signature"]);
      if (!decoded) return send(res, 402, await buildChallenge(resourceUrl));
      const v = await verifyAndSettle(decoded);
      if (!v.ok) return send(res, 402, await buildChallenge(resourceUrl));
      res.setHeader("PAYMENT-RESPONSE", Buffer.from(JSON.stringify(v.response)).toString("base64"));
    }
    switch (url.pathname) {
      case "/":
      case "/health":
        return send(res, 200, { status: "ok", service: "foregate-worldcup-prediction", paywall: paywallEnabled(), endpoints: ["/teams", "/predict?home=&away=&homeTeam=", "/tournament?limit="] });
      case "/teams":
        return send(res, 200, listTeams());
      case "/predict": {
        const out = predictMatch(q.get("home"), q.get("away"), q.get("homeTeam"));
        return send(res, out.error ? 400 : 200, out);
      }
      case "/tournament": {
        const limit = q.get("limit") ? parseInt(q.get("limit"), 10) : null;
        return send(res, 200, tournament(limit));
      }
      default:
        return send(res, 404, { error: "Not found", endpoints: ["/health", "/teams", "/predict", "/tournament"] });
    }
  } catch (e) {
    return send(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => console.log(`ForeGate prediction API on http://localhost:${PORT}`));
