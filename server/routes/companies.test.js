// Run with: node --test server/routes/companies.test.js
// No network: the missing-key answer is returned before any request to Logo.dev is made.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import companiesRouter from "./companies.js";
import { missingKeyWarnings } from "../startupWarnings.js";
import { SEARCH_NOT_CONFIGURED } from "../../shared/companySearchError.js";

async function get(url, env) {
  const saved = process.env.LOGO_DEV_SECRET_KEY;
  if (env === undefined) delete process.env.LOGO_DEV_SECRET_KEY;
  else process.env.LOGO_DEV_SECRET_KEY = env;
  const app = express();
  app.use("/api/companies", companiesRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`);
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
    if (saved === undefined) delete process.env.LOGO_DEV_SECRET_KEY;
    else process.env.LOGO_DEV_SECRET_KEY = saved;
  }
}

test("search without LOGO_DEV_SECRET_KEY answers 503 with the stable code, not a generic 500", async () => {
  const { status, body } = await get("/api/companies/search?q=acme");
  assert.equal(status, 503);
  assert.equal(body.code, SEARCH_NOT_CONFIGURED);
  assert.equal(body.code, "search_not_configured");
  assert.ok(body.error);
});

test("a short query still returns an empty list without a key", async () => {
  const { status, body } = await get("/api/companies/search?q=a");
  assert.equal(status, 200);
  assert.deepEqual(body, { results: [] });
});

test("startup names each missing key, what stops, and the fix", () => {
  const lines = missingKeyWarnings({});
  assert.equal(lines.length, 2);
  assert.match(lines[0], /LOGO_DEV_SECRET_KEY.*company search.*\.env.*restart/);
  assert.match(lines[1], /ANTHROPIC_API_KEY.*scoring.*\.env.*restart/);
});

test("startup warns only for the key that is missing; blank counts as missing", () => {
  assert.deepEqual(missingKeyWarnings({ LOGO_DEV_SECRET_KEY: "x", ANTHROPIC_API_KEY: "y" }), []);
  const one = missingKeyWarnings({ LOGO_DEV_SECRET_KEY: "  ", ANTHROPIC_API_KEY: "y" });
  assert.equal(one.length, 1);
  assert.match(one[0], /LOGO_DEV_SECRET_KEY/);
});
