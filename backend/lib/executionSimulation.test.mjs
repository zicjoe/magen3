import assert from "node:assert/strict";
import test from "node:test";

import { evaluateExecutionSimulation, parseCasperTtlMs } from "./executionSimulation.mjs";

const NOW = new Date("2026-07-22T10:00:00.000Z");

function evaluate(overrides = {}) {
  return evaluateExecutionSimulation({
    now: NOW,
    request: {
      actionType: "Transfer",
      amount: 5,
      asset: "CSPR",
      paymentAmountMotes: "5000000000",
      gasPriceTolerance: 1,
      ttl: "30m",
      transactionTimestamp: "2026-07-22T09:55:00.000Z",
      transactionHash: "",
      ...overrides,
    },
  });
}

test("parses supported Casper TTL duration forms", () => {
  assert.equal(parseCasperTtlMs("30m"), 1_800_000);
  assert.equal(parseCasperTtlMs("1h"), 3_600_000);
  assert.equal(parseCasperTtlMs("90000"), 90_000);
  assert.equal(parseCasperTtlMs("bad"), null);
});

test("passes deterministic construction preflight while keeping stateful simulation unavailable", () => {
  const result = evaluate();
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.rule === "Payment budget format" && item.status === "pass"));
  assert.ok(result.findings.some((item) => item.rule === "Transaction freshness" && item.status === "pass"));
  assert.ok(result.findings.some((item) => item.rule === "Stateful speculative execution" && item.status === "unavailable"));
});

test("blocks zero-value transfers", () => {
  const result = evaluate({ amount: 0 });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Positive execution amount" && item.status === "fail"));
});

test("blocks malformed payment budgets", () => {
  const result = evaluate({ paymentAmountMotes: "-1" });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Payment budget format" && item.status === "fail"));
});

test("blocks non-ISO timestamp text even when JavaScript Date parsing would accept it", () => {
  const result = evaluate({ transactionTimestamp: "July 22, 2026 10:00:00 UTC" });

  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Transaction timestamp format" && item.status === "fail"));
});

test("blocks already-expired transaction metadata", () => {
  const result = evaluate({
    transactionTimestamp: "2026-07-22T08:00:00.000Z",
    ttl: "30m",
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Transaction freshness" && item.status === "fail"));
});

test("requires review for unusually long structurally valid TTL", () => {
  const result = evaluate({ ttl: "3h" });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Transaction TTL format" && item.status === "warning"));
});

test("blocks invalid swap bounds", () => {
  const result = evaluate({
    actionType: "Swap",
    slippageBps: 10_001,
    expectedOutput: 10,
    minimumReceived: 11,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Swap slippage bounds" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Swap output bounds" && item.status === "fail"));
});

test("accepts structurally consistent swap metadata without claiming policy slippage enforcement", () => {
  const result = evaluate({
    actionType: "Swap",
    slippageBps: 300,
    expectedOutput: 9.8,
    minimumReceived: 9.5,
  });
  assert.equal(result.hardBlock, false);
  assert.ok(result.findings.some((item) => item.rule === "Swap slippage bounds" && item.status === "pass"));
  assert.ok(result.findings.some((item) => item.rule === "Swap output bounds" && item.status === "pass"));
  assert.ok(result.findings.some((item) => item.rule === "Stateful speculative execution" && item.status === "unavailable"));
});
