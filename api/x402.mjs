// x402 pay-per-call gate (HTTP 402 Payment Required) for the A2MCP service.
// Implements the standard x402 handshake; the chain-specific verify/settle calls go to an
// OKX Payment facilitator (URL + key supplied via env). NOTHING secret is hard-coded — every
// value below comes from environment variables you set on your host (e.g. Render → Environment).
//
// Flow:
//   1) Client calls a paid endpoint with no payment  -> 402 + `accepts` (price, asset, payTo, network).
//   2) Client pays and retries with header `X-PAYMENT: <payload>`.
//   3) We POST the payload to the facilitator /verify; if valid -> serve 200, then /settle.
//
// Turn it on by setting PAYWALL_ENABLED=true (off by default, so the free endpoint keeps working).

const CFG = {
  enabled: process.env.PAYWALL_ENABLED === "true",
  price: process.env.PRICE_USDG || "0.01",           // per-call price (intro/funnel price)
  asset: process.env.PAY_ASSET || "USDG",
  network: process.env.PAY_NETWORK || "x-layer",      // OKX X Layer mainnet
  payTo: process.env.PAY_TO_ADDRESS || "",            // your Agentic Wallet receiving address
  facilitator: (process.env.OKX_FACILITATOR_URL || "").replace(/\/$/, ""), // OKX Payment SDK facilitator
  facilitatorKey: process.env.OKX_FACILITATOR_KEY || "",
};

export function paywallEnabled() { return CFG.enabled; }

// Build the 402 challenge body (x402 standard shape).
export function paymentRequired(resource) {
  return {
    x402Version: 1,
    error: "payment required",
    accepts: [{
      scheme: "exact",
      network: CFG.network,
      asset: CFG.asset,
      maxAmountRequired: CFG.price,
      payTo: CFG.payTo,
      resource,
      description: "ForeGate World Cup prediction (per call)",
      mimeType: "application/json",
    }],
  };
}

// Verify a payment payload via the OKX facilitator. Returns { ok, info }.
export async function verifyPayment(xPaymentHeader, resource) {
  if (!xPaymentHeader) return { ok: false, reason: "no X-PAYMENT header" };
  if (!CFG.facilitator) return { ok: false, reason: "OKX_FACILITATOR_URL not configured" };
  try {
    const r = await fetch(`${CFG.facilitator}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(CFG.facilitatorKey ? { Authorization: `Bearer ${CFG.facilitatorKey}` } : {}) },
      body: JSON.stringify({ payment: xPaymentHeader, requirements: paymentRequired(resource).accepts[0] }),
    });
    const info = await r.json().catch(() => ({}));
    // TODO: adjust the success field name to match the OKX facilitator response (e.g. info.valid / info.isValid).
    return { ok: r.ok && (info.valid === true || info.isValid === true), info };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
}

// Settle (capture) after serving. Returns a settlement string for the X-PAYMENT-RESPONSE header, or null.
export async function settlePayment(xPaymentHeader, resource) {
  if (!CFG.facilitator || !xPaymentHeader) return null;
  try {
    const r = await fetch(`${CFG.facilitator}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(CFG.facilitatorKey ? { Authorization: `Bearer ${CFG.facilitatorKey}` } : {}) },
      body: JSON.stringify({ payment: xPaymentHeader, requirements: paymentRequired(resource).accepts[0] }),
    });
    const info = await r.json().catch(() => ({}));
    return r.ok ? JSON.stringify(info) : null;
  } catch { return null; }
}

export const paymentConfig = CFG;
