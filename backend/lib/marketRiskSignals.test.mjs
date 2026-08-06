import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMarketRiskSignals,
  getMarketRiskSignalsSnapshot,
  normalizeMarketRiskFeed,
  resetMarketRiskSignalsCache,
  summarizeMarketRiskSignalsSnapshot,
} from "./marketRiskSignals.mjs";

const NOW = new Date("2026-08-06T11:00:00.000Z");
const policy = (overrides = {}) => ({
  structuredRules: {
    marketRiskSignals: {
      enabled: true,
      minSources: 2,
      minConfidence: 70,
      maxEvidenceAgeSeconds: 120,
      maxVolatilityBps: 1000,
      maxSpreadBps: 200,
      maxStablecoinDepegBps: 200,
      minLiquidityCoverageBps: 10000,
      maxProviderDisagreementBps: 300,
      ...overrides,
    },
  },
});
const request = (overrides = {}) => ({
  actionType: "Swap",
  asset: "USDC",
  outputAsset: "DAI",
  marketRiskNetwork: "base-sepolia",
  marketRiskVenue: "aggregator-a",
  marketRiskPoolId: "pool-1",
  amount: 10,
  tradingRouteQuoteId: "quote-1",
  ...overrides,
});
const observation = (source, overrides = {}) => ({
  id: `${source}-observation`,
  baseAsset: "USDC",
  quoteAsset: "DAI",
  network: "base-sepolia",
  venue: "aggregator-a",
  poolId: "pool-1",
  inputAmount: "10",
  quoteId: "quote-1",
  source,
  confidence: 90,
  observedAt: "2026-08-06T10:59:30.000Z",
  volatilityBps: 100,
  spreadBps: 20,
  stablecoinDepegBps: 10,
  liquidityCoverageBps: 25000,
  poolImbalanceBps: 300,
  manipulationScore: 5,
  ...overrides,
});
const snapshot = (overrides = {}) => normalizeMarketRiskFeed({
  version: "1",
  source: "test-feed",
  generatedAt: "2026-08-06T10:59:30.000Z",
  observations: [observation("source-a"), observation("source-b", { volatilityBps: 120, spreadBps: 25 })],
  ...overrides,
}, { sourceType: "inline", now: NOW });

test("normalizes bounded market-risk observations and preserves provenance", () => {
  const feed = snapshot();
  assert.equal(feed.observationCount, 2);
  assert.equal(feed.pairCount, 1);
  assert.equal(feed.observations[0].pair, "USDC/DAI");
  assert.equal(feed.observations[0].metrics.liquidityCoverageBps, 25000);
});

test("passes fresh multi-source signals within policy", () => {
  const result = evaluateMarketRiskSignals({ request: request(), policy: policy(), snapshot: snapshot(), now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.status, "passed");
  assert.match(result.context.evidenceFingerprint, /^[0-9a-f]{64}$/);
});

test("reviews excessive volatility", () => {
  const feed = normalizeMarketRiskFeed({ generatedAt: NOW.toISOString(), observations: [observation("a", { volatilityBps: 1600 }), observation("b", { volatilityBps: 1700 })] }, { now: NOW });
  const result = evaluateMarketRiskSignals({ request: request(), policy: policy(), snapshot: feed, now: NOW });
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Market volatility" && item.status === "warning"));
});

test("blocks stablecoin depeg under the default depeg action", () => {
  const feed = normalizeMarketRiskFeed({ generatedAt: NOW.toISOString(), observations: [observation("a", { stablecoinDepegBps: 400 }), observation("b", { stablecoinDepegBps: 420 })] }, { now: NOW });
  const result = evaluateMarketRiskSignals({ request: request(), policy: policy(), snapshot: feed, now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Stablecoin peg deviation" && item.status === "fail"));
});

test("reviews provider disagreement without treating missing evidence as zero", () => {
  const feed = normalizeMarketRiskFeed({ generatedAt: NOW.toISOString(), observations: [observation("a", { spreadBps: 10 }), observation("b", { spreadBps: 500 })] }, { now: NOW });
  const result = evaluateMarketRiskSignals({ request: request(), policy: policy(), snapshot: feed, now: NOW });
  assert.equal(result.needsReview, true);
  assert.equal(result.context.metrics.oracleDivergenceBps.completeness, "unavailable");
  assert.ok(result.findings.some((item) => item.rule === "Market-risk provider agreement"));
});

test("fails closed according to policy when the feed is unavailable", () => {
  const result = evaluateMarketRiskSignals({ request: request(), policy: policy({ required: true, unavailableAction: "block" }), snapshot: { status: "unavailable" }, now: NOW });
  assert.equal(result.hardBlock, true);
  assert.equal(result.context.status, "unavailable");
});

test("requires configured evidence categories when policy names them", () => {
  const result = evaluateMarketRiskSignals({ request: request(), policy: policy({ requiredSignals: ["oracleDivergenceBps"] }), snapshot: snapshot(), now: NOW });
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Required market-risk evidence"));
});

test("does not apply to ordinary transfers", () => {
  const result = evaluateMarketRiskSignals({ request: request({ actionType: "Transfer" }), policy: policy(), snapshot: snapshot(), now: NOW });
  assert.equal(result.context.status, "not_required");
});

test("remote feeds require HTTPS in production and expose only a sanitized failure", async () => {
  resetMarketRiskSignalsCache();
  const result = await getMarketRiskSignalsSnapshot({ env: { NODE_ENV: "production", MARKET_RISK_SIGNALS_FEED_URL: "http://127.0.0.1/private" }, now: NOW });
  assert.equal(result.status, "unavailable");
  assert.match(result.error, /HTTPS/);
});


test("sanitizes configured feed failures in public status summaries", () => {
  const summary = summarizeMarketRiskSignalsSnapshot({
    status: "unavailable",
    sourceType: "file",
    sourceName: "/private/operator/path/feed.json",
    error: "ENOENT: no such file or directory, open '/private/operator/path/feed.json'",
  });
  assert.equal(summary.sourceName, "Configured local market-risk feed");
  assert.equal(summary.error, "The configured local market-risk feed could not be loaded.");
  assert.doesNotMatch(JSON.stringify(summary), /private\/operator/);
});


test("rejects credentials embedded in remote feed URLs", async () => {
  resetMarketRiskSignalsCache();
  const result = await getMarketRiskSignalsSnapshot({ env: { NODE_ENV: "production", MARKET_RISK_SIGNALS_FEED_URL: "https://user:secret@example.com/feed.json" }, now: NOW });
  assert.equal(result.status, "unavailable");
  const summary = summarizeMarketRiskSignalsSnapshot(result);
  assert.equal(summary.error, "The configured remote market-risk feed could not be loaded.");
  assert.doesNotMatch(JSON.stringify(summary), /secret/);
});


test("requires exact amount binding for liquidity coverage evidence", () => {
  const unbound = snapshot({ observations: [observation("source-a", { inputAmount: "" }), observation("source-b", { inputAmount: "" })] });
  const result = evaluateMarketRiskSignals({ request: request(), policy: policy({ requiredSignals: ["liquidityCoverageBps"] }), snapshot: unbound, now: NOW });
  assert.equal(result.context.metrics.liquidityCoverageBps.completeness, "unavailable");
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Required market-risk evidence"));
});

test("cache keys isolate different configured feed sources", async () => {
  resetMarketRiskSignalsCache();
  const envA = {
    MARKET_RISK_SIGNALS_FEED_JSON: JSON.stringify({ generatedAt: NOW.toISOString(), observations: [observation("source-a")] }),
    MARKET_RISK_SIGNALS_CACHE_TTL_MS: "60000",
  };
  const envB = {
    MARKET_RISK_SIGNALS_FEED_JSON: JSON.stringify({ generatedAt: NOW.toISOString(), observations: [{ ...observation("source-b"), baseAsset: "ETH", quoteAsset: "USD" }] }),
    MARKET_RISK_SIGNALS_CACHE_TTL_MS: "60000",
  };
  const first = await getMarketRiskSignalsSnapshot({ env: envA, now: NOW });
  const second = await getMarketRiskSignalsSnapshot({ env: envB, now: NOW });
  assert.equal(first.observations[0].pair, "USDC/DAI");
  assert.equal(second.observations[0].pair, "ETH/USD");
});

test("marks an expired configured feed stale instead of reusing it as fresh evidence", async () => {
  resetMarketRiskSignalsCache();
  const staleTime = "2026-08-06T10:00:00.000Z";
  const result = await getMarketRiskSignalsSnapshot({
    env: {
      MARKET_RISK_SIGNALS_FEED_JSON: JSON.stringify({ generatedAt: staleTime, observations: [observation("source-a", { observedAt: staleTime })] }),
      MARKET_RISK_SIGNALS_MAX_FEED_AGE_MS: "1000",
    },
    now: NOW,
  });
  assert.equal(result.status, "stale");
  assert.ok(result.ageMs > result.maxAgeMs);
});

test("one provider cannot satisfy a multi-source quorum by duplicating observations", () => {
  const duplicateSourceFeed = normalizeMarketRiskFeed({
    generatedAt: NOW.toISOString(),
    observations: [observation("same-provider"), observation("same-provider", { id: "duplicate", observedAt: "2026-08-06T10:59:45.000Z" })],
  }, { now: NOW });
  const result = evaluateMarketRiskSignals({ request: request(), policy: policy({ minSources: 2 }), snapshot: duplicateSourceFeed, now: NOW });
  assert.equal(result.context.sourceCount, 1);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Market-risk source quorum" && item.status === "warning"));
});

test("rejects feeds that exceed the observation safety limit", () => {
  const observations = Array.from({ length: 5001 }, (_, index) => observation(`source-${index}`));
  assert.throws(() => normalizeMarketRiskFeed({ generatedAt: NOW.toISOString(), observations }, { now: NOW }), /5000-observation safety limit/);
});

test("rejects oversized remote feed responses before parsing", async () => {
  resetMarketRiskSignalsCache();
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: (name) => name.toLowerCase() === "content-length" ? "1000001" : null },
    body: null,
    text: async () => "{}",
  });
  const result = await getMarketRiskSignalsSnapshot({
    env: { NODE_ENV: "production", MARKET_RISK_SIGNALS_FEED_URL: "https://market.example/feed.json" },
    fetchImpl,
    now: NOW,
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.error, /1000000-byte safety limit/);
  assert.equal(summarizeMarketRiskSignalsSnapshot(result).error, "The configured remote market-risk feed could not be loaded.");
});

test("times out a non-responsive remote feed", async () => {
  resetMarketRiskSignalsCache();
  const fetchImpl = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const started = Date.now();
  const result = await getMarketRiskSignalsSnapshot({
    env: {
      NODE_ENV: "production",
      MARKET_RISK_SIGNALS_FEED_URL: "https://market.example/feed.json",
      MARKET_RISK_SIGNALS_REQUEST_TIMEOUT_MS: "250",
    },
    fetchImpl,
    now: NOW,
  });
  assert.equal(result.status, "unavailable");
  assert.ok(Date.now() - started < 1500);
  assert.equal(summarizeMarketRiskSignalsSnapshot(result).error, "The configured remote market-risk feed could not be loaded.");
});
