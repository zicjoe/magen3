import assert from "node:assert/strict";
import test from "node:test";
import { classifyBridgeDestinationAddress, evaluateBridgeControls } from "./bridgeControls.mjs";

const NOW = new Date("2026-07-22T16:00:00.000Z");
const EVM_DESTINATION = `0x${"a".repeat(40)}`;
const CASPER_DESTINATION = `01${"b".repeat(64)}`;

function policy(overrides = {}) {
  return {
    structuredRules: {
      bridgeControlMode: "Enforce",
      bridgeControlUnavailableAction: "Block",
      bridgeAllowedProviders: ["Test Bridge"],
      bridgeAllowedSourceChains: ["casper-test"],
      bridgeAllowedDestinationChains: ["ethereum-sepolia"],
      bridgeBlockedDestinationChains: [],
      bridgeAllowedAssets: ["CSPR"],
      bridgeMaxAmount: 100,
      bridgeMaxFeeBps: 100,
      bridgeMaxQuoteAgeSeconds: 300,
      bridgeRequireQuoteExpiry: true,
      bridgeMinSourceConfirmations: 2,
      bridgeMinDestinationConfirmations: 12,
      ...overrides,
    },
  };
}

function request(overrides = {}) {
  return {
    actionType: "Bridge",
    amount: 10,
    asset: "CSPR",
    bridgeSourceChain: "casper-test",
    bridgeDestinationChain: "ethereum-sepolia",
    bridgeProvider: "Test Bridge",
    bridgeRouteId: "route-001",
    bridgeDestinationAddress: EVM_DESTINATION,
    bridgeAsset: "CSPR",
    bridgeFeeBps: 50,
    bridgeExpectedOutput: 9.95,
    bridgeMinimumReceived: 9.8,
    bridgeQuoteTimestamp: NOW.toISOString(),
    bridgeQuoteExpiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    bridgeSourceConfirmations: 2,
    bridgeDestinationConfirmations: 12,
    ...overrides,
  };
}

test("skips non-bridge intents", () => {
  const result = evaluateBridgeControls({ request: { actionType: "Transfer" }, policy: policy(), now: NOW });
  assert.equal(result.applicable, false);
  assert.equal(result.findings[0].status, "skipped");
});

test("passes a complete policy-approved bridge route", () => {
  const result = evaluateBridgeControls({ request: request(), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.destinationAddressFamily, "evm");
  assert.ok(result.findings.some((item) => item.rule === "Approved bridge provider" && item.status === "pass"));
});

test("blocks an explicitly blocked destination chain regardless of mode", () => {
  const result = evaluateBridgeControls({
    request: request(),
    policy: policy({ bridgeControlMode: "Observe", bridgeBlockedDestinationChains: ["ethereum-sepolia"] }),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Blocked destination chain" && item.status === "fail"));
});

test("requires review for an unapproved provider in Review mode", () => {
  const result = evaluateBridgeControls({
    request: request({ bridgeProvider: "Unknown Bridge" }),
    policy: policy({ bridgeControlMode: "Review", bridgeControlUnavailableAction: "Warn" }),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Approved bridge provider" && item.status === "warning"));
});

test("Observe mode records route violations without changing authorization", () => {
  const result = evaluateBridgeControls({
    request: request({ bridgeFeeBps: 500 }),
    policy: policy({ bridgeControlMode: "Observe", bridgeControlUnavailableAction: "Warn" }),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.rule === "Maximum bridge fee" && item.status === "warning"));
});

test("missing route metadata never silently passes", () => {
  const result = evaluateBridgeControls({
    request: request({ bridgeRouteId: "", bridgeDestinationAddress: "" }),
    policy: policy({ bridgeControlUnavailableAction: "Warn" }),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.ok(result.findings.some((item) => item.rule === "Bridge route metadata" && item.status === "unavailable"));
  assert.equal(result.findings.some((item) => item.rule === "Bridge route metadata" && item.status === "pass"), false);
});

test("can require review or fail closed when bridge metadata is unavailable", () => {
  const review = evaluateBridgeControls({ request: request({ bridgeProvider: "" }), policy: policy({ bridgeControlUnavailableAction: "Review" }), now: NOW });
  const blocked = evaluateBridgeControls({ request: request({ bridgeProvider: "" }), policy: policy({ bridgeControlUnavailableAction: "Block" }), now: NOW });
  assert.equal(review.needsReview, true);
  assert.equal(blocked.hardBlock, true);
});

test("blocks stale and expired bridge quotes in Enforce mode", () => {
  const stale = evaluateBridgeControls({ request: request({ bridgeQuoteTimestamp: new Date(NOW.getTime() - 10 * 60_000).toISOString() }), policy: policy(), now: NOW });
  const expired = evaluateBridgeControls({ request: request({ bridgeQuoteExpiresAt: new Date(NOW.getTime() - 1_000).toISOString() }), policy: policy(), now: NOW });
  assert.equal(stale.hardBlock, true);
  assert.equal(expired.hardBlock, true);
  assert.ok(stale.findings.some((item) => item.rule === "Bridge quote freshness" && item.status === "fail"));
  assert.ok(expired.findings.some((item) => item.rule === "Bridge quote expiry" && item.status === "fail"));
});

test("blocks excessive fees, amount, and inconsistent output bounds", () => {
  const result = evaluateBridgeControls({
    request: request({ amount: 150, bridgeFeeBps: 250, bridgeExpectedOutput: 9, bridgeMinimumReceived: 10 }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Maximum bridge amount" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Maximum bridge fee" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Bridge output bounds" && item.status === "fail"));
});

test("validates supported Casper and EVM destination formats", () => {
  assert.equal(classifyBridgeDestinationAddress(EVM_DESTINATION, "ethereum-sepolia").valid, true);
  assert.equal(classifyBridgeDestinationAddress(CASPER_DESTINATION, "casper-test").valid, true);
  assert.equal(classifyBridgeDestinationAddress("0x1234", "ethereum-sepolia").valid, false);
  assert.equal(classifyBridgeDestinationAddress("address", "solana-devnet").kind, "unsupported-chain-family");
});

test("blocks same-chain routes and insufficient confirmation requirements", () => {
  const result = evaluateBridgeControls({
    request: request({ bridgeDestinationChain: "casper-test", bridgeDestinationAddress: CASPER_DESTINATION, bridgeSourceConfirmations: 0, bridgeDestinationConfirmations: 0 }),
    policy: policy({ bridgeAllowedDestinationChains: ["casper-test"] }),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Distinct bridge chains" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Source-chain confirmation requirement" && item.status === "fail"));
});
