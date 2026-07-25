import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGasSponsorshipFeeSafety } from "./gasSponsorshipFeeSafety.mjs";

const now = new Date("2026-07-25T12:00:00.000Z");
function policy(overrides = {}) {
  return { structuredRules: {
    feeSafetyEnabled: true,
    feeSafetyMode: "Review",
    feeSafetyMaximumNetworkFee: 5,
    feeSafetyMaximumGasPrice: 100,
    feeSafetyMaximumPriorityFee: 10,
    feeSafetyApprovedSponsors: ["magen3-relayer"],
    feeSafetyApprovedPaymasters: ["0x1111111111111111111111111111111111111111"],
    feeSafetySponsorshipUnavailableAction: "Review",
    feeSafetySponsoredBudget: 20,
    feeSafetyMaximumSponsoredOperations: 10,
    feeSafetyMaximumFailedSponsoredOperations: 2,
    feeSafetyLookbackSeconds: 86400,
    feeSafetyRequireSponsorshipExpiry: true,
    feeSafetyRequireSponsorEvidence: true,
    ...overrides,
  }};
}
function casper(overrides = {}) {
  return {
    agentId: "AG-1", actionType: "Transfer", chainName: "casper-test",
    feeSafetyMetadataSupplied: true, feeChainFamily: "Casper", feeChainName: "casper-test",
    feeNetworkFee: 2, feeUnit: "CSPR", feeSponsor: "magen3-relayer", feeSponsorshipId: "s-1",
    feeSponsorshipExpiry: "2026-07-25T13:00:00.000Z", feeSponsorshipScopes: ["Transfer"],
    feeSponsorSignatureHash: "a".repeat(64), feeExpectedPayer: "magen3-relayer", feeActualPayer: "magen3-relayer",
    feeSponsored: true, feeSponsorshipAvailable: true, ...overrides,
  };
}
function evm(overrides = {}) {
  return {
    agentId: "AG-1", actionType: "Contract Interaction", chainName: "ethereum-sepolia",
    feeSafetyMetadataSupplied: true, feeChainFamily: "EVM", feeChainName: "ethereum-sepolia",
    feeEstimatedGas: 100000, feeGasLimit: 120000, feeGasPrice: 50, feePriorityFee: 2, feeMaximumFee: 4,
    feePaymaster: "0x1111111111111111111111111111111111111111", feeSponsorshipId: "pm-1",
    feeSponsorshipExpiry: "2026-07-25T13:00:00.000Z", feeSponsorshipScopes: ["Contract Interaction"],
    feeSponsorSignatureHash: "b".repeat(64), feeExpectedPayer: "paymaster", feeActualPayer: "paymaster",
    feeSponsored: true, feeSponsorshipAvailable: true, ...overrides,
  };
}

test("skips disabled control", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper(), policy: policy({ feeSafetyEnabled: false }), now });
  assert.equal(result.context.status, "skipped");
});

test("allows bounded Casper sponsorship", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper(), policy: policy(), now });
  assert.equal(result.hardBlock, false); assert.equal(result.needsReview, false); assert.equal(result.context.status, "passed");
});

test("allows bounded EVM Paymaster flow", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: evm(), policy: policy(), now });
  assert.equal(result.hardBlock, false); assert.equal(result.context.paymasterApproved, true);
});

test("blocks EVM-only fields on Casper", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeGasPrice: 2 }), policy: policy(), now });
  assert.equal(result.hardBlock, true); assert.match(result.checksFailed.join(" "), /EVM-only/i);
});

test("reviews unknown sponsor in Review mode", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeSponsor: "unknown" }), policy: policy(), now });
  assert.equal(result.needsReview, true); assert.equal(result.hardBlock, false);
});

test("blocks expired sponsorship", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeSponsorshipExpiry: "2026-07-25T11:00:00.000Z" }), policy: policy(), now });
  assert.equal(result.hardBlock, true); assert.match(result.checksFailed.join(" "), /expired/i);
});

test("blocks payer mismatch", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeActualPayer: "agent-wallet" }), policy: policy(), now });
  assert.equal(result.hardBlock, true); assert.match(result.checksFailed.join(" "), /payer/i);
});

test("blocks malformed sponsor evidence hash", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeSponsorSignatureHash: "bad" }), policy: policy(), now });
  assert.equal(result.hardBlock, true);
});

test("reviews fee above maximum in Review mode", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeNetworkFee: 6 }), policy: policy(), now });
  assert.equal(result.needsReview, true); assert.equal(result.hardBlock, false);
});

test("blocks fee above maximum in Enforce mode", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeNetworkFee: 6 }), policy: policy({ feeSafetyMode: "Enforce" }), now });
  assert.equal(result.hardBlock, true);
});

test("reviews rolling sponsored budget breach", () => {
  const auditLogs = [{ agentId: "AG-1", timestamp: "2026-07-25T10:00:00.000Z", originalIntent: { feeSafety: { sponsored: true, networkFee: 19 } } }];
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeNetworkFee: 2 }), policy: policy(), auditLogs, now });
  assert.equal(result.needsReview, true); assert.match(result.checksFailed.join(" "), /budget/i);
});

test("blocks sponsorship scope mismatch", () => {
  const result = evaluateGasSponsorshipFeeSafety({ request: casper({ feeSponsorshipScopes: ["Swap"] }), policy: policy(), now });
  assert.equal(result.hardBlock, true);
});

test("protects exact fee metadata with a fingerprint", () => {
  const first = evaluateGasSponsorshipFeeSafety({ request: casper(), policy: policy(), now });
  const second = evaluateGasSponsorshipFeeSafety({ request: casper({ feeNetworkFee: 3 }), policy: policy(), now });
  assert.match(first.context.protectedFingerprint, /^[0-9a-f]{64}$/);
  assert.notEqual(first.context.protectedFingerprint, second.context.protectedFingerprint);
});
