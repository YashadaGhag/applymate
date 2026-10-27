import { Router } from "express";
import { searchCities, resolveLocation } from "../geo/cities.js";

const router = Router();

/**
 * GET /api/locations/search?q=<query>
 * Returns { results: [{ label, city, region, country, countryCode }] }, up to 8, from the
 * offline city list (server/geo/cities.json). Fewer than 2 characters returns no results.
 */
router.get("/search", (req, res) => {
  const q = String(req.query.q ?? "").slice(0, 100);
  res.json({ results: searchCities(q) });
});

/**
 * POST /api/locations/resolve
 * Body: { texts: string[] }. Returns { locations: [location | null] } in the same order.
 * Used to upgrade locations saved as plain strings before locations were structured.
 */
router.post("/resolve", (req, res) => {
  const texts = req.body?.texts;
  if (!Array.isArray(texts) || texts.length > 50 || !texts.every((t) => typeof t === "string")) {
    return res.status(400).json({ error: "Expected body.texts to be an array of up to 50 strings." });
  }
  res.json({ locations: texts.map(resolveLocation) });
});

export default router;
