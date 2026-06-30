// x402 v2 pay-per-call gate for the OKX Agent Payments Protocol (A2MCP) on X Layer (eip155:196).
// Calls OKX's facilitator HTTP API (/supported, /verify, /settle) with standard OKX HMAC auth.
// OKX co-signs/settles (HSM) — we never send raw chain transactions ourselves.
//
// Auth: OK-ACCESS-{KEY,SIGN,PASSPHRASE,TIMESTAMP}. sign = base64(hmacSHA256(secret,
//       timestamp + METHOD + requestPath(+query) + body)); GET body = "". Implemented below.
//       (Equivalent to the OKXFacilitatorClient SDK; swap to the SDK here if preferred.)
//
// SAFE BY DEFAULT: paywall off unless PAYWALL_ENABLED=true; access DENIED unless OKX settle succeeds.
// Secrets come only from env (set on the host), never hard-coded.
import crypto from "node:crypto";

const BASE = (process.env.OKX_BASE_URL || "https://web3.okx.com").replace(/\/$/, "");
const P = { supported: "/api/v6/pay/x402/supported", verify: "/api/v6/pay/x402/verify", settle: "/api/v6/pay/x402/settle" };

const CFG = {
  enabled: process.env.PAYWALL_ENABLED === "true",
  network: process.env.PAY_NETWORK || "eip155:196",
  payTo: process.env.OKX_X402_PAY_TO || process.env.PAY_TO_ADDRESS || "0xb7338d8e84571de0d032b5fd47f31917523d0e6f",
  amount: process.env.PAY_AMOUNT || "10000",                       // 0.01 USD (6 decimals)
  asset: process.env.PAY_ASSET_CONTRACT || "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USD₮0; USDG alt in .env.example
  eip712Name: process.env.PAY_EIP712_NAME || "USD₮0",
  eip712Version: process.env.PAY_EIP712_VERSION || "2",
  spenderUpto: "0x4020e7393B728A3939659E5732F87fdd8e680002",
  spenderExact: "0x402085c248EeA27D92E8b30b2C58ed07f9E20001",
  facilitatorOverride: process.env.OKX_FACILITATOR_ADDRESS || "",
  apiKey: process.env.OKX_API_KEY || "",
  secretKey: process.env.OKX_SECRET_KEY || "",
  passphrase: process.env.OKX_PASSPHRASE || "",
};

export function paywallEnabled() { return CFG.enabled; }

// Build signed OKX headers. requestPath must include any query string; body is the exact JSON string.
function okxHeaders(method, requestPath, body = "") {
  const h = { "Content-Type": "application/json" };
  if (!CFG.apiKey || !CFG.secretKey || !CFG.passphrase) return h; // unsigned -> OKX will reject -> safe deny
  const ts = new Date().toISOString();
  const prehash = ts + method.toUpperCase() + requestPath + (body || "");
  const sign = crypto.createHmac("sha256", CFG.secretKey).update(prehash).digest("base64");
  return { ...h, "OK-ACCESS-KEY": CFG.apiKey, "OK-ACCESS-SIGN": sign, "OK-ACCESS-PASSPHRASE": CFG.passphrase, "OK-ACCESS-TIMESTAMP": ts };
}

// fetch with a hard timeout so a slow/hung OKX call never blocks the response.
async function fetchT(url, opts = {}, ms = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); }
  finally { clearTimeout(t); }
}
async function okxGet(path, ms = 10000) {
  const r = await fetchT(`${BASE}${path}`, { headers: okxHeaders("GET", path, "") }, ms);
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}
async function okxPost(path, payloadObj, ms = 25000) {
  const body = JSON.stringify(payloadObj);
  const r = await fetchT(`${BASE}${path}`, { method: "POST", headers: okxHeaders("POST", path, body), body }, ms);
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}

// facilitatorAddress is dynamic: GET /supported -> kinds[].extra.facilitatorAddress (cached 1h).
let _fac = CFG.facilitatorOverride, _facAt = 0;
async function getFacilitatorAddress() {
  if (CFG.facilitatorOverride) return CFG.facilitatorOverride;
  if (_fac && Date.now() - _facAt < 3600e3) return _fac;
  try {
    const { json } = await okxGet(P.supported, 6000);
    const kinds = json.kinds || (json.data && json.data.kinds) || [];
    for (const k of kinds) { const f = k && k.extra && k.extra.facilitatorAddress; if (f) { _fac = f; _facAt = Date.now(); return f; } }
  } catch { /* fall through */ }
  return _fac || "";
}

export async function buildChallenge(resourceUrl, description = "World Cup 2026 Predictions") {
  const facilitatorAddress = await getFacilitatorAddress();
  const baseExtra = { name: CFG.eip712Name, version: CFG.eip712Version, assetTransferMethod: "permit2" };
  const common = { network: CFG.network, amount: CFG.amount, payTo: CFG.payTo, asset: CFG.asset, maxTimeoutSeconds: 300 };
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: { url: resourceUrl, description, mimeType: "application/json" },
    accepts: [
      { scheme: "upto", ...common, extra: { ...baseExtra, facilitatorAddress } },
      { scheme: "exact", ...common, extra: { ...baseExtra } },
    ],
  };
}

export function decodePaymentSignature(headerVal) {
  if (!headerVal) return null;
  if (typeof headerVal === "object") return headerVal;              // already parsed
  let s = String(headerVal).trim();
  if (Array.isArray(headerVal)) s = String(headerVal[0] || "").trim();
  // 1) raw JSON
  if (s.startsWith("{")) { try { return JSON.parse(s); } catch { /* next */ } }
  // 2) base64 / base64url JSON
  try {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/");
    const txt = Buffer.from(norm, "base64").toString("utf8");
    if (txt.includes("{")) return JSON.parse(txt.slice(txt.indexOf("{")));
  } catch { /* next */ }
  // 3) URL-encoded JSON
  try { return JSON.parse(decodeURIComponent(s)); } catch { /* give up */ }
  return null;
}

function sane(decoded) {
  const a = decoded && decoded.accepted;
  if (!a || !decoded.payload) return false;
  if (String(a.payTo).toLowerCase() !== CFG.payTo.toLowerCase()) return false;
  if (a.network !== CFG.network) return false;
  if (CFG.asset && String(a.asset).toLowerCase() !== CFG.asset.toLowerCase()) return false;
  try { if (BigInt(a.amount || 0) < BigInt(CFG.amount)) return false; } catch { return false; }
  return true;
}

// Verify then settle via OKX facilitator. Returns { ok, response }.
export async function verifyAndSettle(decoded) {
  if (!sane(decoded)) return { ok: false, reason: "payload failed local checks" };
  try {
    const ver = await okxPost(P.verify, decoded);
    const v = ver.json || {};
    if (!(ver.ok && (v.valid === true || v.isValid === true || v.status === "valid"))) return { ok: false, reason: "verify failed", info: v };

    const set = await okxPost(P.settle, decoded);
    const s = set.json || {};
    const ok = set.ok && (s.status === "settled" || s.status === "success");
    return {
      ok,
      response: {
        status: s.status || (ok ? "settled" : "failed"),
        transaction: s.transaction || s.txHash || "",
        amount: decoded.accepted.amount,
        payer: (decoded.payload.permit2Authorization && decoded.payload.permit2Authorization.from) || s.payer || "",
      },
    };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
}

export const paymentConfig = CFG;
