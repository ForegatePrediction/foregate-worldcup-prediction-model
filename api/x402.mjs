// x402 v2 pay-per-call gate for the OKX Agent Payments Protocol (A2MCP) on X Layer (eip155:196).
// Wired to OKX's real facilitator HTTP API. Settlement is done by OKX (co-sign/HSM) — we never
// send raw chain transactions ourselves; we only build the challenge, sanity-check, and call
// OKX verify/settle.
//
// Flow:
//   1) No payment        -> 402 with the v2 challenge (accepts: upto + exact). facilitatorAddress for
//                           the "upto" scheme is fetched dynamically from OKX /supported.
//   2) PAYMENT-SIGNATURE  -> decode (base64 JSON), local sanity-check, then OKX /verify -> /settle.
//   3) On success         -> serve + PAYMENT-RESPONSE header ({status, transaction, amount, payer}).
//
// SAFE BY DEFAULT: paywall off unless PAYWALL_ENABLED=true; access DENIED unless OKX settle succeeds.

const OKX = (process.env.OKX_X402_BASE || "https://web3.okx.com/api/v6/pay/x402").replace(/\/$/, "");

const CFG = {
  enabled: process.env.PAYWALL_ENABLED === "true",
  network: process.env.PAY_NETWORK || "eip155:196",                          // X Layer mainnet
  payTo: process.env.PAY_TO_ADDRESS || "0xb7338d8e84571de0d032b5fd47f31917523d0e6f",
  amount: process.env.PAY_AMOUNT || "10000",                                 // 0.01 USD (6 decimals)
  // Stablecoin on X Layer. Default = USD₮0 (USDT). Alt USDG: 0x4ae46a509f6b1d9056937ba4500cb143933d2dc8
  asset: process.env.PAY_ASSET_CONTRACT || "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  eip712Name: process.env.PAY_EIP712_NAME || "USD₮0",
  eip712Version: process.env.PAY_EIP712_VERSION || "2",
  spenderUpto: "0x4020e7393B728A3939659E5732F87fdd8e680002",                 // x402 upto Permit2 spender
  spenderExact: "0x402085c248EeA27D92E8b30b2C58ed07f9E20001",                // x402 exact Permit2 spender
  facilitatorOverride: process.env.OKX_FACILITATOR_ADDRESS || "",            // optional static override
  apiKey: process.env.OKX_API_KEY || "",                                     // OKX API auth (see note below)
};

export function paywallEnabled() { return CFG.enabled; }

// OKX API auth headers. NOTE: OKX pay endpoints require auth. If your account uses the standard OKX
// key/secret/passphrase HMAC, sign here; if you instead use the OKXFacilitatorClient SDK, route
// verify/settle through it. Wire the real auth via env before enabling the paywall.
function okxHeaders(extra = {}) {
  return { "Content-Type": "application/json", ...(CFG.apiKey ? { "OK-ACCESS-KEY": CFG.apiKey } : {}), ...extra };
}

// facilitatorAddress is dynamic: GET /supported -> kinds[].extra.facilitatorAddress (cached 1h).
let _fac = CFG.facilitatorOverride, _facAt = 0;
async function getFacilitatorAddress() {
  if (CFG.facilitatorOverride) return CFG.facilitatorOverride;
  if (_fac && Date.now() - _facAt < 3600e3) return _fac;
  try {
    const r = await fetch(`${OKX}/supported`, { headers: okxHeaders() });
    const j = await r.json().catch(() => ({}));
    const kinds = j.kinds || (j.data && j.data.kinds) || [];
    for (const k of kinds) { const f = k && k.extra && k.extra.facilitatorAddress; if (f) { _fac = f; _facAt = Date.now(); return f; } }
  } catch { /* fall through */ }
  return _fac || "";
}

// Build the x402 v2 402 challenge.
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

// Decode PAYMENT-SIGNATURE (base64 JSON or raw JSON).
export function decodePaymentSignature(headerVal) {
  if (!headerVal) return null;
  try { return JSON.parse(Buffer.from(headerVal, "base64").toString("utf8")); }
  catch { try { return JSON.parse(headerVal); } catch { return null; } }
}

// Cheap local checks before calling OKX.
function sane(decoded) {
  const a = decoded && decoded.accepted;
  if (!a || !decoded.payload) return false;
  if (String(a.payTo).toLowerCase() !== CFG.payTo.toLowerCase()) return false;
  if (a.network !== CFG.network) return false;
  if (CFG.asset && String(a.asset).toLowerCase() !== CFG.asset.toLowerCase()) return false;
  try { if (BigInt(a.amount || 0) < BigInt(CFG.amount)) return false; } catch { return false; }
  return true;
}

// Verify then settle via OKX facilitator HTTP API. Returns { ok, response }.
export async function verifyAndSettle(decoded) {
  if (!sane(decoded)) return { ok: false, reason: "payload failed local checks" };
  try {
    const vr = await fetch(`${OKX}/verify`, { method: "POST", headers: okxHeaders(), body: JSON.stringify(decoded) });
    const v = await vr.json().catch(() => ({}));
    const verified = vr.ok && (v.valid === true || v.isValid === true || v.status === "valid");
    if (!verified) return { ok: false, reason: "verify failed", info: v };

    const sr = await fetch(`${OKX}/settle`, { method: "POST", headers: okxHeaders(), body: JSON.stringify(decoded) });
    const s = await sr.json().catch(() => ({}));
    const ok = sr.ok && (s.status === "settled" || s.status === "success");
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
