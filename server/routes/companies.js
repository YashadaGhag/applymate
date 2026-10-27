import { Router } from "express";
import { SEARCH_NOT_CONFIGURED } from "../../shared/companySearchError.js";

const router = Router();

/**
 * GET /api/companies/search?q=<query>
 * Normalized response: { results: [{ name, domain }] }
 *
 * Uses Logo.dev's Search API (secret key, server-side only) to find
 * company name/domain matches. Logo images are never fetched or built
 * here — the client builds the img.logo.dev URL itself at render time
 * via src/utils/logo.js, using the publishable key.
 */
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 2) {
    return res.json({ results: [] });
  }

  const secretKey = process.env.LOGO_DEV_SECRET_KEY;

  if (!secretKey) {
    // A stable code, so the page can tell a missing key (retrying cannot help) from a failed request.
    return res.status(503).json({
      error: "Company search is not configured on the server.",
      code: SEARCH_NOT_CONFIGURED,
    });
  }

  try {
    const response = await fetch(`https://api.logo.dev/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    if (!response.ok) {
      return res.status(502).json({ error: "Company search provider returned an error." });
    }

    const data = await response.json();
    const rawResults = Array.isArray(data) ? data : data.results || [];

    const results = rawResults
      .filter((item) => item && item.domain)
      .slice(0, 10)
      .map((item) => ({
        name: item.name || item.domain,
        domain: item.domain,
      }));

    res.json({ results });
  } catch {
    res.status(502).json({ error: "Could not reach the company search provider." });
  }
});

export default router;
