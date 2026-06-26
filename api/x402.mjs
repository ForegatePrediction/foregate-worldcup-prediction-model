// x402 v2 pay-per-call gate for the OKX Agent Payments Protocol (A2MCP).
// Aligned to the real challenge/payload/response shapes provided by OKX (X Layer, eip155:196).
//
// Flow:
//   1) Caller hits a paid endpoint with no payment -> 402 with the v2 challenge (accepts: upto + exact).
//   2) Caller signs (Permit2) and retries with header `PAYMENT-SIGNATURE` (base64 JSON).
//   3) We sanity-check the payload, then verify+settle via the OKX facilitator; on success we serve
//      and return a `PAYMENT-RESPONSE` header ({status, transaction, amount, payer}).
//
// SAFE BY DEFAULT: paywall is off unless PAYWALL_ENABLED=true, and access is DENIED unless settlement
// succeeds — we never serve paid content on an unverified payment. Values OKX must confirm are left
// as env placeholders (asset contract, EIP-712 name, facilitator address, upto proxy, facilitator URL).

const CFG = {
  enabled: process.env.PAYWALL_ENABLED === "true",
  network: process.env.PAY_NETWORK || "eip155:196",                 // X Layer mainnet
  payTo: process.env.PAY_TO_ADDRESS || "0xb7338d8e84571de0d032b5fd47f31917523d0e6f",
  amount: process.env.PAY_AMOUNT || "10000",                         // 0.01 of a 6-decimals stablecoin
  asset: process.env.PAY_ASSET_CONTRACT || "",                       // USDT/USDG contract on X Layer (TODO from OKX)
  eip712Name: process.env.PAY_EIP712_NAME || "",                     // token EIP-712 domain name (TODO from OKX)
  eip712Version: process.env.PAY_EIP712_VERSION || "1",
  facilitatorAddress: process.env.OKX_FACILITATOR_ADDRESS || "",     // for the "upto" scheme (TODO from OKX)
  uptoProxy: process.env.X402_UPTO_PROXY || "",                      // spender/proxy (informational)
  facilitatorUrl: (process.env.OKX_FACILITATOR_URL || "").replace(/\/$/, ""), // verify/settle service (if provided)
  facilitatorKey: process.env.OKX_FACILITATOR_KEY || "",
};

export function paywallEnabled() { return CFG.enabled; }

// Build the x402 v2 402 challenge for a resource.
export function buildChallenge(resourceUrl, description = "World Cup 2026 Predictions") {
  const baseExtra = { name: CFG.eip712Name, version: CFG.eip712Version, assetTransferMethod: "permit2" };
  const common = {
    network: CFG.network, amount: CFG.amount, payTo: CFG.payTo, asset: CFG.asset, maxTimeoutSeconds: 300,
  };
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: { url: resourceUrl, description, mimeType: "application/json" },
    accepts: [
      { scheme: "upto", ...common, extra: { ...baseExtra, facilitatorAddress: CFG.facilitatorAddress } },
      { scheme: "exact", ...common, extra: { ...baseExtra } },
    ],
  };
}

// Decode the PAYMENT-SIGNATURE header (base64 JSON, or raw JSON).
export function decodePaymentSignature(headerVal) {
  if (!headerVal) return null;
  try { return JSON.parse(Buffer.from(headerVal, "base64").toString("utf8")); }
  catch { try { return JSON.parse(headerVal); } catch { return null; } }
}

// Basic structural checks before settlement (cheap, local, no network).
function sane(decoded) {
  const a = decoded && decoded.accepted;
  if (!a || !decoded.payload) return false;
  if (String(a.payTo).toLowerCase() !== CFG.payTo.toLowerCase()) return false;
  if (a.network !== CFG.network) return false;
  if (CFG.asset && String(a.asset).toLowerCase() !== CFG.asset.toLowerCase()) return false;
  if (BigInt(a.amount || 0) < BigInt(CFG.amount)) return false;
  return true;
}

// Verify + settle via the OKX facilitator. Returns { ok, response }.
export async function verifyAndSettle(decoded) {
  if (!sane(decoded)) return { ok: false, reason: "payload failed local checks" };
  if (!CFG.facilitatorUrl) return { ok: false, reason: "facilitator URL not configured (awaiting OKX)" };
  try {
    const r = await fetch(`${CFG.facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(CFG.facilitatorKey ? { Authorization: `Bearer ${CFG.facilitatorKey}` } : {}) },
      body: JSON.stringify(decoded),
    });
    const info = await r.json().catch(() => ({}));
    // TODO: confirm success field with OKX (here: info.status === "settled").
    const ok = r.ok && info.status === "settled";
    return { ok, response: { status: info.status || (ok ? "settled" : "failed"), transaction: info.transaction || "", amount: decoded.accepted.amount, payer: (decoded.payload.permit2Authorization && decoded.payload.permit2Authorization.from) || info.payer || "" } };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
}

export const paymentConfig = CFG;
