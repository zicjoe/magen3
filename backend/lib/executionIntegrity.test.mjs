import test from "node:test";
import assert from "node:assert/strict";
import { buildIntentFingerprint, evaluateExecutionIntegrity } from "./executionIntegrity.mjs";

const NOW = new Date("2026-07-23T10:00:00.000Z");
const WALLET = `01${"a".repeat(64)}`;

function request(overrides = {}) {
  const base = {
    agentId: "MAG-AGENT-1",
    executionWalletAddress: WALLET,
    actionType: "Transfer",
    amount: 5,
    asset: "CSPR",
    target: `01${"b".repeat(64)}`,
    targetType: "Wallet Address",
    lifecycleIntentId: "intent-0001",
    lifecycleIdempotencyKey: "idem-0001",
    lifecycleSequence: 1,
    lifecycleCreatedAt: "2026-07-23T09:59:30.000Z",
    lifecycleExpiresAt: "2026-07-23T10:04:30.000Z",
    lifecycleAttempt: 0,
  };
  const merged = { ...base, ...overrides };
  if (overrides.lifecycleIntentFingerprint === undefined) {
    merged.lifecycleIntentFingerprint = buildIntentFingerprint(merged);
  }
  return merged;
}

function policy(overrides = {}) {
  return {
    structuredRules: {
      lifecycleControlsEnabled: true,
      lifecycleControlMode: "Enforce",
      lifecycleUnavailableAction: "Block",
      lifecycleRequireIntentId: true,
      lifecycleRequireIdempotencyKey: true,
      lifecycleRequireCreatedAt: true,
      lifecycleRequireExpiry: true,
      lifecycleRequireSequence: true,
      lifecyclePreventDuplicateFingerprint: true,
      lifecyclePreventRetryAfterUncertain: true,
      lifecycleMaxIntentAgeSeconds: 600,
      lifecycleMaxFutureSkewSeconds: 60,
      lifecycleMaxLifetimeSeconds: 600,
      lifecycleReplayWindowSeconds: 86400,
      lifecycleMaxRetryAttempts: 3,
      ...overrides,
    },
  };
}

function auditFromRequest(req, overrides = {}) {
  return {
    id: overrides.id || "AUD-OLD",
    agentId: req.agentId,
    timestamp: overrides.timestamp || "2026-07-23T09:59:40.000Z",
    decision: overrides.decision || "Allowed",
    executionStatus: overrides.executionStatus || "approved_pending_signature",
    executionTxHash: overrides.executionTxHash || "",
    originalIntent: {
      lifecycle: {
        intentId: req.lifecycleIntentId,
        idempotencyKey: req.lifecycleIdempotencyKey,
        sequence: req.lifecycleSequence,
        createdAt: req.lifecycleCreatedAt,
        expiresAt: req.lifecycleExpiresAt,
        attempt: req.lifecycleAttempt,
        intentFingerprint: buildIntentFingerprint(req),
      },
      action: { preflight: { transactionHash: req.transactionHash || "" } },
    },
  };
}

test("allows a fresh fully bound lifecycle intent", () => {
  const req = request();
  const result = evaluateExecutionIntegrity({ request: req, policy: policy(), auditLogs: [], now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.status, "passed");
  assert.equal(result.context.fingerprint, buildIntentFingerprint(req));
  assert.ok(result.findings.some((item) => item.rule === "Intent ID replay prevention" && item.status === "pass"));
});

test("blocks a reused intent ID and idempotency key", () => {
  const req = request();
  const result = evaluateExecutionIntegrity({ request: req, policy: policy(), auditLogs: [auditFromRequest(req)], now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Intent ID replay prevention" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Duplicate idempotency key" && item.status === "fail"));
});

test("blocks parameter mutation behind an existing idempotency key", () => {
  const oldRequest = request();
  const changed = request({ lifecycleIntentId: "intent-0002", amount: 7 });
  changed.lifecycleIntentFingerprint = buildIntentFingerprint(changed);
  const result = evaluateExecutionIntegrity({ request: changed, policy: policy(), auditLogs: [auditFromRequest(oldRequest)], now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Idempotency parameter mutation"));
});

test("blocks expired intents", () => {
  const req = request({ lifecycleExpiresAt: "2026-07-23T09:59:59.000Z" });
  req.lifecycleIntentFingerprint = buildIntentFingerprint(req);
  const result = evaluateExecutionIntegrity({ request: req, policy: policy(), auditLogs: [], now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Expired intent" && item.status === "fail"));
});

test("blocks a retry while the prior execution is unresolved", () => {
  const prior = request();
  const next = request({
    lifecycleIntentId: "intent-0002",
    lifecycleIdempotencyKey: "idem-0002",
    lifecycleSequence: 2,
    lifecycleRetryOf: "AUD-OLD",
    lifecycleAttempt: 1,
  });
  next.lifecycleIntentFingerprint = buildIntentFingerprint(next);
  const result = evaluateExecutionIntegrity({ request: next, policy: policy(), auditLogs: [auditFromRequest(prior)], now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Retry after uncertain execution"));
});

test("legacy requests remain non-breaking under Observe and Warn defaults", () => {
  const result = evaluateExecutionIntegrity({
    request: { agentId: "MAG-AGENT-1", actionType: "Transfer", amount: 1, asset: "CSPR", target: WALLET },
    policy: { structuredRules: {} },
    auditLogs: [],
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.status === "unavailable"));
});

test("legacy policies do not silently activate duplicate fingerprint blocking", () => {
  const req = request({
    lifecycleIntentId: "",
    lifecycleIdempotencyKey: "",
    lifecycleSequence: null,
    lifecycleCreatedAt: "",
    lifecycleExpiresAt: "",
    lifecycleIntentFingerprint: "",
  });
  const previous = auditFromRequest(req, {
    decision: "Allowed",
    executionStatus: "approved_pending_signature",
  });
  const result = evaluateExecutionIntegrity({
    request: req,
    policy: { structuredRules: {} },
    auditLogs: [previous],
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.rule === "Duplicate intent fingerprint" && item.status === "skipped"));
});
