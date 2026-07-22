import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalThreatIdentity,
  evaluateThreatIntelligence,
  getThreatIntelligenceSnapshot,
  normalizeThreatFeed,
  resetThreatIntelligenceCache,
  summarizeThreatIntelligenceSnapshot,
} from "./threatIntelligence.mjs";

const WALLET = `01${"1".repeat(64)}`;
const TARGET = `01${"2".repeat(64)}`;
const CONTRACT = `contract-${"3".repeat(64)}`;

function snapshot(indicators = []) {
  return normalizeThreatFeed({
    version: "1",
    source: "test feed",
    generatedAt: new Date().toISOString(),
    indicators,
  });
}

function policy(overrides = {}) {
  return {
    riskMode: "Balanced",
    structuredRules: {
      threatIntelligenceMode: "Enforce",
      threatIntelligenceMinConfidence: 70,
      threatIntelligenceUnavailableAction: "Warn",
      ...overrides,
    },
  };
}

test("normalizes Casper wallets, account hashes, contracts, and package hashes", () => {
  assert.equal(canonicalThreatIdentity(WALLET)?.canonical, `wallet:${WALLET.toLowerCase()}`);
  assert.equal(canonicalThreatIdentity(`account-hash-${"a".repeat(64)}`)?.canonical, `account:account-hash-${"a".repeat(64)}`);
  assert.equal(canonicalThreatIdentity(CONTRACT)?.canonical, `contract:${"3".repeat(64)}`);
  assert.equal(canonicalThreatIdentity(`contract-package-${"4".repeat(64)}`)?.canonical, `package:${"4".repeat(64)}`);
  assert.equal(canonicalThreatIdentity("not-an-identifier"), null);
});

test("blocks an exact high-severity match in Enforce mode", () => {
  const result = evaluateThreatIntelligence({
    request: { executionWalletAddress: WALLET, target: TARGET, targetType: "Wallet Address", actionType: "Transfer" },
    policy: policy(),
    snapshot: snapshot([{ value: TARGET, severity: "high", confidence: 95, label: "Known phishing destination" }]),
  });

  assert.equal(result.hardBlock, true);
  assert.equal(result.needsReview, false);
  assert.equal(result.findings.some((item) => item.status === "fail" && item.rule === "Known threat indicator match"), true);
  assert.equal(result.context.matchedIndicators[0].severity, "high");
});

test("requires review for a high-severity match in Review mode", () => {
  const result = evaluateThreatIntelligence({
    request: { executionWalletAddress: WALLET, target: CONTRACT, contractIdentifierType: "Contract Hash", targetType: "Unknown Contract", actionType: "Contract Interaction" },
    policy: policy({ threatIntelligenceMode: "Review" }),
    snapshot: snapshot([{ value: CONTRACT, identifierType: "Contract Hash", severity: "critical", confidence: 99, label: "Known exploit contract" }]),
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.status === "warning"), true);
});

test("Observe mode records a match without changing authorization", () => {
  const result = evaluateThreatIntelligence({
    request: { executionWalletAddress: WALLET, target: TARGET, targetType: "Wallet Address", actionType: "Transfer" },
    policy: policy({ threatIntelligenceMode: "Observe" }),
    snapshot: snapshot([{ value: TARGET, severity: "critical", confidence: 99, label: "Observed target" }]),
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.findings.some((item) => item.status === "warning"), true);
});

test("does not enforce a match below the policy confidence threshold", () => {
  const result = evaluateThreatIntelligence({
    request: { executionWalletAddress: WALLET, target: TARGET, targetType: "Wallet Address", actionType: "Transfer" },
    policy: policy({ threatIntelligenceMinConfidence: 90 }),
    snapshot: snapshot([{ value: TARGET, severity: "critical", confidence: 60, label: "Low confidence match" }]),
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.findings.some((item) => item.message.includes("below the policy threshold")), true);
});

test("reports unavailable feeds without silently passing", () => {
  const result = evaluateThreatIntelligence({
    request: { executionWalletAddress: WALLET, target: TARGET, targetType: "Wallet Address", actionType: "Transfer" },
    policy: policy({ threatIntelligenceUnavailableAction: "Warn" }),
    snapshot: { status: "unavailable", sourceName: "No feed", indicators: [], indicatorCount: 0, error: "not configured" },
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.findings.some((item) => item.status === "unavailable"), true);
  assert.equal(result.findings.some((item) => item.status === "pass" && item.rule === "Threat feed availability"), false);
});

test("can fail closed when a policy requires a feed", () => {
  const result = evaluateThreatIntelligence({
    request: { executionWalletAddress: WALLET, target: TARGET, targetType: "Wallet Address", actionType: "Transfer" },
    policy: policy({ threatIntelligenceUnavailableAction: "Block" }),
    snapshot: { status: "unavailable", sourceName: "No feed", indicators: [], indicatorCount: 0 },
  });

  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.status === "fail" && item.rule === "Threat feed availability"), true);
});


test("does not let a low-confidence critical match hide an enforceable high-confidence match", () => {
  const secondTarget = `contract-${"9".repeat(64)}`;
  const result = evaluateThreatIntelligence({
    request: {
      executionWalletAddress: WALLET,
      target: secondTarget,
      contractIdentifierType: "Contract Hash",
      targetType: "Unknown Contract",
      actionType: "Contract Interaction",
    },
    policy: policy({ threatIntelligenceMinConfidence: 70 }),
    snapshot: snapshot([
      { value: WALLET, severity: "critical", confidence: 20, label: "Low confidence wallet signal" },
      { value: secondTarget, identifierType: "Contract Hash", severity: "high", confidence: 95, label: "High confidence contract signal" },
    ]),
  });

  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.status === "fail" && item.evidence?.label === "High confidence contract signal"), true);
  assert.equal(result.context.matchedIndicators.length, 2);
});

test("a feed without a source timestamp is stale rather than implicitly fresh", async () => {
  resetThreatIntelligenceCache();
  const loaded = await getThreatIntelligenceSnapshot({
    force: true,
    env: {
      THREAT_INTELLIGENCE_FEED_JSON: JSON.stringify({ indicators: [{ value: TARGET, severity: "high", confidence: 90 }] }),
      THREAT_INTELLIGENCE_CACHE_TTL_MS: "1000",
    },
    now: new Date("2026-07-22T00:00:00.000Z"),
  });

  assert.equal(loaded.status, "stale");
  assert.match(loaded.error, /older than/i);
});

test("loads a local JSON feed and marks old data stale", async () => {
  resetThreatIntelligenceCache();
  const dir = await mkdtemp(join(tmpdir(), "magen3-threat-"));
  const feedPath = join(dir, "feed.json");
  await writeFile(feedPath, JSON.stringify({
    source: "local test",
    generatedAt: "2025-01-01T00:00:00.000Z",
    indicators: [{ value: TARGET, severity: "high", confidence: 90 }],
  }));

  const loaded = await getThreatIntelligenceSnapshot({
    force: true,
    env: {
      THREAT_INTELLIGENCE_FEED_PATH: feedPath,
      THREAT_INTELLIGENCE_MAX_AGE_MS: "60000",
      THREAT_INTELLIGENCE_CACHE_TTL_MS: "1000",
    },
    now: new Date("2026-07-22T00:00:00.000Z"),
  });

  assert.equal(loaded.status, "stale");
  assert.equal(loaded.indicatorCount, 1);
  assert.equal(loaded.sourceType, "file");
});


test("deduplication keeps the higher-severity indicator before comparing confidence", () => {
  const normalized = normalizeThreatFeed({
    generatedAt: new Date().toISOString(),
    indicators: [
      { value: TARGET, severity: "critical", confidence: 75, label: "Critical signal" },
      { value: TARGET, severity: "low", confidence: 99, label: "Low signal" },
      { value: TARGET, severity: "critical", confidence: 85, label: "Stronger critical signal" },
    ],
  });

  assert.equal(normalized.indicatorCount, 1);
  assert.equal(normalized.indicators[0].severity, "critical");
  assert.equal(normalized.indicators[0].confidence, 85);
  assert.equal(normalized.indicators[0].label, "Stronger critical signal");
});

test("a feed timestamp too far in the future is stale", async () => {
  resetThreatIntelligenceCache();
  const loaded = await getThreatIntelligenceSnapshot({
    force: true,
    env: {
      THREAT_INTELLIGENCE_FEED_JSON: JSON.stringify({
        generatedAt: "2026-07-22T01:00:00.000Z",
        indicators: [{ value: TARGET, severity: "high", confidence: 90 }],
      }),
      THREAT_INTELLIGENCE_CACHE_TTL_MS: "1000",
    },
    now: new Date("2026-07-22T00:00:00.000Z"),
  });

  assert.equal(loaded.status, "stale");
  assert.match(loaded.error, /too far in the future/i);
});

test("public feed summaries expose active counts but not configured file paths or raw loader errors", () => {
  const now = new Date("2026-07-22T00:00:00.000Z");
  const normalized = normalizeThreatFeed({
    generatedAt: now.toISOString(),
    indicators: [
      { value: TARGET, severity: "high", confidence: 90 },
      { value: CONTRACT, severity: "high", confidence: 90, expiresAt: "2026-07-21T23:00:00.000Z" },
    ],
  }, { sourceType: "file", sourceName: "/srv/magen3/private/feed.json", now });
  const summary = summarizeThreatIntelligenceSnapshot({
    ...normalized,
    status: "stale",
    error: "ENOENT: no such file or directory, open '/srv/magen3/private/feed.json'",
  }, now);

  assert.equal(summary.indicatorCount, 2);
  assert.equal(summary.activeIndicatorCount, 1);
  assert.equal(summary.sourceName, "Configured local feed");
  assert.equal(summary.error.includes("/srv/magen3"), false);
  assert.equal("indicators" in summary, false);
});
