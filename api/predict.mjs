// Vercel-style serverless function: /api/predict?home=spain&away=germany[&homeTeam=spain]
// Deploy to Vercel (or any platform using the (req,res) handler signature).
// For Cloudflare Workers, wrap predictMatch() in an export default { fetch } handler instead.
import { predictMatch } from "./core.mjs";

export default function handler(req, res) {
  const { home, away, homeTeam } = req.query || {};
  const out = predictMatch(home, away, homeTeam);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(out.error ? 400 : 200).send(JSON.stringify(out, null, 2));
}
