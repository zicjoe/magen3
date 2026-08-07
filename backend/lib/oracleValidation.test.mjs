import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateOracleValidation,
  getOracleValidationSnapshot,
  normalizeOracleFeed,
  resetOracleValidationCache,
  summarizeOracleValidationSnapshot,
} from "./oracleValidation.mjs";

const NOW = new Date("2026-07-22T15:00:00.000Z");

function feed(observations = [], overrides = {}) {
  return normalizeOracleFeed({
    version: "1",
    source: "synthetic oracle test feed",
    generatedAt: NOW.toISOString(),
    observations,
    ...overrides,
  }, { now: NOW });
}

function observation(price, source, overrides = {}) {
  return {
    baseAsset: "CSPR",
    quoteAsset: "USD",
    price,
    confidence: 95,
    source,
    observedAt: NOW.toISOString(),
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    actionType: "Swap",
    amount: 10,
    asset: "CSPR",
    outputAsset: "USD",
    oracleBaseAsset: "CSPR",
    oracleQuoteAsset: "USD",
    executionPrice: 0.025,
    quoteTimestamp: NOW.toISOString(),
    ...overrides,
  };
}

function policy(overrides = {}) {
  return {
    structuredRules: {
      oracleValidationMode: "Enforce",
      oracleValidationUnavailableAction: "Warn",
      oracleValidationMaxAgeSeconds: 120,
      oracleValidationMaxDeviationBps: 300,
      oracleValidationMaxSourceSpreadBps: 500,
      oracleValidationMinConfidence: 70,
      oracleValidationMinSources: 2,
      ...overrides,
    },
  };
}

test("normalizes valid observations and rejects malformed records", () => {
  const normalized = feed([
    observation(0.025, "source-a"),
    { baseAsset: "CSPR", quoteAsset: "USD", price: -1, source: "invalid", observedAt: NOW.toISOString() },
    { baseAsset: "CSPR", quoteAsset: "CSPR", price: 1, source: "invalid", observedAt: NOW.toISOString() },
  ]);

  assert.equal(normalized.observationCount, 1);
  assert.equal(normalized.pairCount, 1);
  assert.equal(normalized.observations[0].pair, "CSPR/USD");
});

test("skips non-price-sensitive intents", () => {
  const result = evaluateOracleValidation({
    request: { actionType: "Transfer", amount: 5, asset: "CSPR" },
    policy: policy(),
    snapshot: feed([observation(0.025, "source-a"), observation(0.0251, "source-b")]),
    now: NOW,
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.findings[0].status, "skipped");
});

test("passes a fresh priced intent within policy bounds", () => {
  const result = evaluateOracleValidation({
    request: request(),
    policy: policy(),
    snapshot: feed([observation(0.025, "source-a"), observation(0.0251, "source-b")]),
    now: NOW,
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.requestedPair, "CSPR/USD");
  assert.equal(result.context.sourceCount, 2);
  assert.ok(result.findings.some((item) => item.rule === "Oracle price deviation" && item.status === "pass"));
});

test("blocks excessive price deviation in Enforce mode", () => {
  const result = evaluateOracleValidation({
    request: request({ executionPrice: 0.04 }),
    policy: policy(),
    snapshot: feed([observation(0.025, "source-a"), observation(0.0251, "source-b")]),
    now: NOW,
  });

  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Oracle price deviation" && item.status === "fail"));
  assert.ok((result.context.deviationBps ?? 0) > 300);
});

test("requires review for excessive deviation in Review mode", () => {
  const result = evaluateOracleValidation({
    request: request({ executionPrice: 0.04 }),
    policy: policy({ oracleValidationMode: "Review" }),
    snapshot: feed([observation(0.025, "source-a"), observation(0.0251, "source-b")]),
    now: NOW,
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Oracle price deviation" && item.status === "warning"));
});

test("Observe mode records an anomaly without changing authorization", () => {
  const result = evaluateOracleValidation({
    request: request({ executionPrice: 0.04 }),
    policy: policy({ oracleValidationMode: "Observe" }),
    snapshot: feed([observation(0.025, "source-a"), observation(0.0251, "source-b")]),
    now: NOW,
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.rule === "Oracle price deviation" && item.status === "warning"));
});

test("does not silently pass an unavailable feed", () => {
  const result = evaluateOracleValidation({
    request: request(),
    policy: policy({ oracleValidationUnavailableAction: "Warn" }),
    snapshot: { status: "unavailable", sourceName: "No feed", observations: [], error: "not configured" },
    now: NOW,
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.rule === "Oracle feed availability" && item.status === "unavailable"));
  assert.equal(result.findings.some((item) => item.rule === "Oracle feed availability" && item.status === "pass"), false);
});

test("can require review or fail closed when the feed is unavailable", () => {
  const unavailable = { status: "unavailable", sourceName: "No feed", observations: [] };
  const review = evaluateOracleValidation({ request: request(), policy: policy({ oracleValidationUnavailableAction: "Review" }), snapshot: unavailable, now: NOW });
  const blocked = evaluateOracleValidation({ request: request(), policy: policy({ oracleValidationUnavailableAction: "Block" }), snapshot: unavailable, now: NOW });

  assert.equal(review.needsReview, true);
  assert.equal(blocked.hardBlock, true);
});

test("duplicate observations from one source cannot satisfy quorum or skew the reference", () => {
  const result = evaluateOracleValidation({
    request: request(),
    policy: policy({ oracleValidationMinSources: 2 }),
    snapshot: feed([
      observation(0.025, "SOURCE-A", { observedAt: new Date(NOW.getTime() - 1_000).toISOString() }),
      observation(0.5, "source-a", { observedAt: NOW.toISOString() }),
      observation(0.5, "Source-A", { observedAt: new Date(NOW.getTime() - 500).toISOString() }),
    ]),
    now: NOW,
  });

  assert.equal(result.context.sourceCount, 1);
  assert.equal(result.context.referencePrice, 0.5);
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Oracle source quorum" && item.status === "fail"));
});

test("enforces source quorum, confidence, and source consistency", () => {
  const result = evaluateOracleValidation({
    request: request(),
    policy: policy({ oracleValidationMinSources: 3, oracleValidationMinConfidence: 90, oracleValidationMaxSourceSpreadBps: 100 }),
    snapshot: feed([
      observation(0.02, "source-a", { confidence: 60 }),
      observation(0.03, "source-b", { confidence: 70 }),
    ]),
    now: NOW,
  });

  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Oracle source quorum" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Oracle confidence" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Oracle source consistency" && item.status === "fail"));
});

test("rejects stale observations and stale execution quotes", () => {
  const staleTime = new Date(NOW.getTime() - 10 * 60_000).toISOString();
  const noPair = evaluateOracleValidation({
    request: request(),
    policy: policy({ oracleValidationUnavailableAction: "Block" }),
    snapshot: feed([observation(0.025, "source-a", { observedAt: staleTime })]),
    now: NOW,
  });
  const staleQuote = evaluateOracleValidation({
    request: request({ quoteTimestamp: staleTime }),
    policy: policy({ oracleValidationMinSources: 1 }),
    snapshot: feed([observation(0.025, "source-a")]),
    now: NOW,
  });

  assert.equal(noPair.hardBlock, true);
  assert.ok(noPair.findings.some((item) => item.rule === "Oracle pair availability"));
  assert.equal(staleQuote.hardBlock, true);
  assert.ok(staleQuote.findings.some((item) => item.rule === "Execution quote freshness" && item.status === "fail"));
});

test("derives execution price from expected output when explicit oracle price is absent", () => {
  const result = evaluateOracleValidation({
    request: request({ executionPrice: null, amount: 10, expectedOutput: 0.25 }),
    policy: policy(),
    snapshot: feed([observation(0.025, "source-a"), observation(0.025, "source-b")]),
    now: NOW,
  });

  assert.equal(result.context.executionPrice, 0.025);
  assert.equal(result.hardBlock, false);
});

test("loads local feeds, marks missing timestamps stale, and sanitizes public summaries", async () => {
  resetOracleValidationCache();
  const dir = await mkdtemp(join(tmpdir(), "magen3-oracle-"));
  const feedPath = join(dir, "feed.json");
  await writeFile(feedPath, JSON.stringify({ source: "local test", observations: [observation(0.025, "source-a")] }));

  const loaded = await getOracleValidationSnapshot({
    force: true,
    env: { ORACLE_VALIDATION_FEED_PATH: feedPath, ORACLE_VALIDATION_CACHE_TTL_MS: "1000" },
    now: NOW,
  });
  const summary = summarizeOracleValidationSnapshot({ ...loaded, sourceName: feedPath, error: `Could not read ${feedPath}` });

  assert.equal(loaded.status, "stale");
  assert.equal(summary.observationCount, 1);
  assert.equal("observations" in summary, false);
});

test("provider-required policy does not treat a legacy feed as production-provider evidence", () => {
  const result = evaluateOracleValidation({
    request: request(),
    policy: policy({ oracleValidationProviderRequired: true, oracleValidationProviderUnavailableAction: "Block" }),
    snapshot: feed([observation(0.025, "source-a"), observation(0.0251, "source-b")]),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Oracle provider requirement" && item.status === "fail"));
});

test("stablecoin peg policy blocks trusted-price evidence outside the configured peg range", () => {
  const result = evaluateOracleValidation({
    request: request({ asset: "USDC", oracleBaseAsset: "USDC", executionPrice: 0.90 }),
    policy: policy({ oracleValidationMinSources: 1, oracleValidationStablecoinAssets: ["USDC"], oracleValidationStablecoinPegMinBps: 9800, oracleValidationStablecoinPegMaxBps: 10200 }),
    snapshot: normalizeOracleFeed({ source: "peg-feed", generatedAt: NOW.toISOString(), observations: [{ baseAsset: "USDC", quoteAsset: "USD", price: "0.90", confidence: 99, source: "source-a", observedAt: NOW.toISOString() }] }, { now: NOW }),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Stablecoin peg validation" && item.status === "fail"));
});

test("production legacy remote feeds require an explicit hostname allowlist", async () => {
  resetOracleValidationCache();
  let called = false;
  const snapshot = await getOracleValidationSnapshot({
    force: true,
    request: request(),
    env: { NODE_ENV: "production", ORACLE_VALIDATION_FEED_URL: "https://unapproved.example/feed.json" },
    now: NOW,
    fetchImpl: async () => { called = true; throw new Error("must not fetch"); },
  });
  assert.equal(called, false);
  assert.equal(snapshot.status, "unavailable");
});
