import assert from "node:assert/strict";
import test from "node:test";
import { buildTokenPermissionFingerprint, evaluateTokenPermissionControls } from "./tokenPermissionControls.mjs";

const NOW = new Date("2026-07-24T08:00:00.000Z");
const OWNER = `01${"1".repeat(64)}`;
const SPENDER = `01${"2".repeat(64)}`;
const OTHER_SPENDER = `01${"3".repeat(64)}`;
const BLOCKED_SPENDER = `01${"4".repeat(64)}`;
const TOKEN = `contract-${"5".repeat(64)}`;

function policy(overrides = {}) {
  return {
    id: "POL-token-permission",
    structuredRules: {
      tokenPermissionControlsEnabled: true,
      tokenPermissionMode: "Review",
      tokenPermissionUnknownSpenderAction: "Review",
      tokenPermissionUnlimitedApprovalAction: "Review",
      tokenPermissionMaxApprovalAmount: 1000,
      tokenPermissionMaxApprovalToTransactionRatio: 2,
      tokenPermissionMaxLifetimeSeconds: 3600,
      tokenPermissionRequireExpiry: true,
      tokenPermissionRequireAllowanceReset: false,
      tokenPermissionApprovedSpenders: [SPENDER],
      tokenPermissionBlockedSpenders: [BLOCKED_SPENDER],
      tokenPermissionAllowNftOperatorApproval: false,
      tokenPermissionAllowBatchApproval: false,
      tokenPermissionRequireChainBinding: true,
      tokenPermissionRequireNonce: true,
      tokenPermissionMaximumBatchSize: 3,
      ...overrides,
    },
  };
}

function request(overrides = {}) {
  return {
    agentId: "AGT-token-permission",
    actionType: "Contract Interaction",
    chainName: "casper-test",
    tokenPermissionMetadataSupplied: true,
    tokenPermissionType: "Fungible Token Approval",
    tokenPermissionOwner: OWNER,
    tokenPermissionTokenContract: TOKEN,
    tokenPermissionTokenStandard: "CEP-18",
    tokenPermissionSpender: SPENDER,
    tokenPermissionApprovalAmount: 100,
    tokenPermissionIntendedTransactionAmount: 100,
    tokenPermissionUnlimited: false,
    tokenPermissionNonce: "",
    tokenPermissionPermitId: "",
    tokenPermissionDeadline: "",
    tokenPermissionReusable: false,
    tokenPermissionChainId: "",
    tokenPermissionNetwork: "casper-test",
    tokenPermissionApprovedProtocol: "trusted-router",
    tokenPermissionOperatorForAll: false,
    tokenPermissionBatchItems: [],
    tokenPermissionAllowanceResetExpected: false,
    ...overrides,
  };
}

function has(result, rule, status) {
  return result.findings.some((item) => item.rule === rule && (!status || item.status === status));
}

test("allows an approved bounded token approval", () => {
  const result = evaluateTokenPermissionControls({ request: request(), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.replayStatus, "clear");
  assert.match(result.context.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(has(result, "Approved spender", "pass"));
  assert.ok(has(result, "Approval-to-transaction ratio", "pass"));
});

test("routes an unknown spender to Review Required in Review mode", () => {
  const result = evaluateTokenPermissionControls({
    request: request({ tokenPermissionSpender: OTHER_SPENDER }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(has(result, "Approved spender", "warning"));
});

test("hard-blocks an explicitly blocked spender in every mode", () => {
  for (const mode of ["Observe", "Review", "Enforce"]) {
    const result = evaluateTokenPermissionControls({
      request: request({ tokenPermissionSpender: BLOCKED_SPENDER }),
      policy: policy({ tokenPermissionMode: mode }),
      now: NOW,
    });
    assert.equal(result.hardBlock, true, mode);
    assert.ok(has(result, "Blocked spender", "fail"));
  }
});

test("applies the configured unlimited-approval action", () => {
  const observe = evaluateTokenPermissionControls({
    request: request({ tokenPermissionApprovalAmount: null, tokenPermissionUnlimited: true }),
    policy: policy({ tokenPermissionMode: "Observe", tokenPermissionUnlimitedApprovalAction: "Review" }),
    now: NOW,
  });
  assert.equal(observe.hardBlock, false);
  assert.equal(observe.needsReview, false);
  assert.ok(has(observe, "Unlimited token authority", "warning"));

  const review = evaluateTokenPermissionControls({
    request: request({ tokenPermissionApprovalAmount: null, tokenPermissionUnlimited: true }),
    policy: policy({ tokenPermissionMode: "Review", tokenPermissionUnlimitedApprovalAction: "Review" }),
    now: NOW,
  });
  assert.equal(review.hardBlock, false);
  assert.equal(review.needsReview, true);

  const enforce = evaluateTokenPermissionControls({
    request: request({ tokenPermissionApprovalAmount: null, tokenPermissionUnlimited: true }),
    policy: policy({ tokenPermissionMode: "Enforce", tokenPermissionUnlimitedApprovalAction: "Review" }),
    now: NOW,
  });
  assert.equal(enforce.hardBlock, true);

  const explicitBlock = evaluateTokenPermissionControls({
    request: request({ tokenPermissionApprovalAmount: null, tokenPermissionUnlimited: true }),
    policy: policy({ tokenPermissionMode: "Observe", tokenPermissionUnlimitedApprovalAction: "Block" }),
    now: NOW,
  });
  assert.equal(explicitBlock.hardBlock, true);
});

test("enforces approval amount and ratio according to policy mode", () => {
  const review = evaluateTokenPermissionControls({
    request: request({ tokenPermissionApprovalAmount: 500, tokenPermissionIntendedTransactionAmount: 100 }),
    policy: policy({ tokenPermissionMaxApprovalAmount: 200, tokenPermissionMaxApprovalToTransactionRatio: 2, tokenPermissionMode: "Review" }),
    now: NOW,
  });
  assert.equal(review.hardBlock, false);
  assert.equal(review.needsReview, true);
  assert.ok(has(review, "Maximum approval amount", "warning"));
  assert.ok(has(review, "Approval-to-transaction ratio", "warning"));

  const enforce = evaluateTokenPermissionControls({
    request: request({ tokenPermissionApprovalAmount: 500, tokenPermissionIntendedTransactionAmount: 100 }),
    policy: policy({ tokenPermissionMaxApprovalAmount: 200, tokenPermissionMaxApprovalToTransactionRatio: 2, tokenPermissionMode: "Enforce" }),
    now: NOW,
  });
  assert.equal(enforce.hardBlock, true);
});

test("requires permit chain binding, nonce, deadline, and bounded lifetime", () => {
  const missing = evaluateTokenPermissionControls({
    request: request({
      tokenPermissionType: "Permit Authorization",
      tokenPermissionNetwork: "",
      chainName: "",
      tokenPermissionNonce: "",
      tokenPermissionPermitId: "permit-missing",
      tokenPermissionDeadline: "",
    }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(missing.hardBlock, false);
  assert.equal(missing.needsReview, true);
  assert.ok(has(missing, "Permit chain binding", "warning"));
  assert.ok(has(missing, "Permit nonce", "warning"));
  assert.ok(has(missing, "Permit expiration", "warning"));

  const tooLong = evaluateTokenPermissionControls({
    request: request({
      tokenPermissionType: "Permit Authorization",
      tokenPermissionNonce: "nonce-long",
      tokenPermissionPermitId: "permit-long",
      tokenPermissionDeadline: new Date(NOW.getTime() + 7200_000).toISOString(),
    }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(tooLong.hardBlock, false);
  assert.equal(tooLong.needsReview, true);
  assert.ok(has(tooLong, "Maximum permit lifetime", "warning"));
});

test("hard-blocks malformed or expired permit evidence", () => {
  const malformed = evaluateTokenPermissionControls({
    request: request({
      tokenPermissionType: "Permit Authorization",
      tokenPermissionNonce: "bad nonce with spaces",
      tokenPermissionPermitId: "permit-malformed",
      tokenPermissionDeadline: "not-a-date",
    }),
    policy: policy({ tokenPermissionMode: "Observe" }),
    now: NOW,
  });
  assert.equal(malformed.hardBlock, true);
  assert.ok(has(malformed, "Permit nonce", "fail"));
  assert.ok(has(malformed, "Permit expiration", "fail"));

  const expired = evaluateTokenPermissionControls({
    request: request({
      tokenPermissionType: "Permit Authorization",
      tokenPermissionNonce: "nonce-expired",
      tokenPermissionPermitId: "permit-expired",
      tokenPermissionDeadline: new Date(NOW.getTime() - 1000).toISOString(),
    }),
    policy: policy({ tokenPermissionMode: "Observe" }),
    now: NOW,
  });
  assert.equal(expired.hardBlock, true);
  assert.ok(has(expired, "Permit expiration", "fail"));
});

test("detects exact permit replay and protected-parameter mutation", () => {
  const current = request({
    tokenPermissionType: "Permit Authorization",
    tokenPermissionNonce: "nonce-7",
    tokenPermissionPermitId: "permit-7",
    tokenPermissionDeadline: new Date(NOW.getTime() + 1800_000).toISOString(),
  });
  const persisted = {
    permissionType: current.tokenPermissionType,
    owner: current.tokenPermissionOwner,
    tokenContract: current.tokenPermissionTokenContract,
    tokenStandard: current.tokenPermissionTokenStandard,
    spender: current.tokenPermissionSpender,
    approvalAmount: current.tokenPermissionApprovalAmount,
    intendedTransactionAmount: current.tokenPermissionIntendedTransactionAmount,
    unlimited: current.tokenPermissionUnlimited,
    nonce: current.tokenPermissionNonce,
    permitId: current.tokenPermissionPermitId,
    deadline: current.tokenPermissionDeadline,
    reusable: current.tokenPermissionReusable,
    chainId: current.tokenPermissionChainId,
    network: current.tokenPermissionNetwork,
    approvedProtocol: current.tokenPermissionApprovedProtocol,
    operatorForAll: current.tokenPermissionOperatorForAll,
    batchItems: current.tokenPermissionBatchItems,
    allowanceResetExpected: current.tokenPermissionAllowanceResetExpected,
  };
  persisted.fingerprint = buildTokenPermissionFingerprint(persisted);
  const auditLogs = [{ id: "AUD-prior", agentId: current.agentId, originalIntent: { action: { tokenPermission: persisted } } }];

  const replay = evaluateTokenPermissionControls({ request: current, policy: policy(), auditLogs, now: NOW });
  assert.equal(replay.hardBlock, true);
  assert.equal(replay.context.replayStatus, "replay");
  assert.ok(has(replay, "Permit replay protection", "fail"));

  const mutated = evaluateTokenPermissionControls({
    request: { ...current, tokenPermissionApprovalAmount: 200 },
    policy: policy(),
    auditLogs,
    now: NOW,
  });
  assert.equal(mutated.hardBlock, true);
  assert.equal(mutated.context.replayStatus, "parameter_mutation");
  assert.ok(has(mutated, "Permit parameter binding", "fail"));
});

test("routes NFT operator and batch authority according to policy", () => {
  const nft = evaluateTokenPermissionControls({
    request: request({ tokenPermissionType: "NFT Operator Approval", tokenPermissionApprovalAmount: null, tokenPermissionOperatorForAll: true }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(nft.needsReview, true);
  assert.ok(has(nft, "NFT operator approval", "warning"));

  const batch = evaluateTokenPermissionControls({
    request: request({
      tokenPermissionType: "Batch Approval",
      tokenPermissionApprovalAmount: 30,
      tokenPermissionIntendedTransactionAmount: 30,
      tokenPermissionBatchItems: [
        { tokenContract: TOKEN, spender: SPENDER, amount: 10 },
        { tokenContract: TOKEN, spender: SPENDER, amount: 20 },
      ],
    }),
    policy: policy({ tokenPermissionAllowBatchApproval: true, tokenPermissionMaximumBatchSize: 1 }),
    now: NOW,
  });
  assert.equal(batch.needsReview, true);
  assert.ok(has(batch, "Maximum approval batch size", "warning"));
});



test("safe legacy defaults require review when no approved spender is configured", () => {
  const result = evaluateTokenPermissionControls({
    request: request(),
    policy: policy({ tokenPermissionApprovedSpenders: [] }),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(has(result, "Approved spender", "warning"));
});

test("hard-blocks owner and explicit network binding mismatches", () => {
  const ownerMismatch = evaluateTokenPermissionControls({
    request: request({ executionWalletAddress: OTHER_SPENDER }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(ownerMismatch.hardBlock, true);
  assert.ok(has(ownerMismatch, "Permission owner binding", "fail"));

  const networkMismatch = evaluateTokenPermissionControls({
    request: request({ chainName: "casper-test", tokenPermissionNetwork: "casper" }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(networkMismatch.hardBlock, true);
  assert.ok(has(networkMismatch, "Token permission network binding", "fail"));
});

test("validates batch item identities, blocked spenders, and exact aggregate authority", () => {
  const contractSpender = `contract-${"7".repeat(64)}`;
  const valid = evaluateTokenPermissionControls({
    request: request({
      tokenPermissionType: "Batch Approval",
      tokenPermissionSpender: contractSpender,
      tokenPermissionApprovalAmount: 30,
      tokenPermissionIntendedTransactionAmount: 30,
      tokenPermissionBatchItems: [
        { tokenContract: TOKEN, spender: contractSpender, amount: 10 },
        { tokenContract: TOKEN, spender: contractSpender, amount: 20 },
      ],
    }),
    policy: policy({ tokenPermissionAllowBatchApproval: true, tokenPermissionApprovedSpenders: [contractSpender] }),
    now: NOW,
  });
  assert.equal(valid.hardBlock, false);
  assert.equal(valid.needsReview, false);
  assert.equal(valid.context.batchAggregateAmount, 30);
  assert.ok(has(valid, "Batch aggregate binding", "pass"));

  const aggregateMismatch = evaluateTokenPermissionControls({
    request: request({
      tokenPermissionType: "Batch Approval",
      tokenPermissionApprovalAmount: 31,
      tokenPermissionIntendedTransactionAmount: 30,
      tokenPermissionBatchItems: [
        { tokenContract: TOKEN, spender: SPENDER, amount: 10 },
        { tokenContract: TOKEN, spender: SPENDER, amount: 20 },
      ],
    }),
    policy: policy({ tokenPermissionAllowBatchApproval: true }),
    now: NOW,
  });
  assert.equal(aggregateMismatch.hardBlock, true);
  assert.ok(has(aggregateMismatch, "Batch aggregate binding", "fail"));

  const blockedBatchSpender = evaluateTokenPermissionControls({
    request: request({
      tokenPermissionType: "Batch Approval",
      tokenPermissionSpender: SPENDER,
      tokenPermissionApprovalAmount: 20,
      tokenPermissionIntendedTransactionAmount: 20,
      tokenPermissionBatchItems: [
        { tokenContract: TOKEN, spender: SPENDER, amount: 10 },
        { tokenContract: TOKEN, spender: BLOCKED_SPENDER, amount: 10 },
      ],
    }),
    policy: policy({ tokenPermissionAllowBatchApproval: true }),
    now: NOW,
  });
  assert.equal(blockedBatchSpender.hardBlock, true);
  assert.ok(has(blockedBatchSpender, "Blocked batch spender", "fail"));
});

test("generic contract calls remain backward compatible when token-permission metadata is absent", () => {
  const result = evaluateTokenPermissionControls({
    request: request({ tokenPermissionMetadataSupplied: false }),
    policy: policy({ tokenPermissionMode: "Enforce" }),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context, null);
  assert.ok(has(result, "Token permission applicability", "skipped"));
});
