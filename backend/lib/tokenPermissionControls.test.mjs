import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenPermissionFingerprint, evaluateTokenPermissionControls } from "./tokenPermissionControls.mjs";

const OWNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";
const BLOCKED = "0x4444444444444444444444444444444444444444";
const NOW = new Date("2026-07-23T12:00:00.000Z");

function policy(overrides = {}) {
  return {
    trustedContracts: [TOKEN],
    structuredRules: {
      tokenPermissionControlsEnabled: true,
      tokenPermissionMode: "Enforce",
      tokenPermissionUnknownSpenderAction: "Review",
      tokenPermissionUnlimitedApprovalAction: "Block",
      tokenPermissionMaxApprovalAmount: 1000,
      tokenPermissionMaxApprovalToTransactionRatio: 2,
      tokenPermissionMaxLifetimeSeconds: 3600,
      tokenPermissionRequireExpiry: true,
      tokenPermissionRequireAllowanceReset: false,
      tokenPermissionApprovedSpenders: [SPENDER],
      tokenPermissionBlockedSpenders: [BLOCKED],
      tokenPermissionAllowNftOperatorApproval: false,
      tokenPermissionAllowBatchApproval: false,
      tokenPermissionRequireChainBinding: true,
      tokenPermissionRequireNonce: true,
      tokenPermissionMaximumBatchSize: 5,
      ...overrides,
    },
  };
}

function request(permission = {}) {
  return {
    agentId: "MAG-1",
    actionType: "Token Approval",
    amount: 100,
    target: TOKEN,
    targetType: "Token Contract",
    executionWalletAddress: OWNER,
    tokenPermission: {
      kind: "Token Approval",
      standard: "ERC-20",
      network: "eip155:1",
      tokenContract: TOKEN,
      owner: OWNER,
      spender: SPENDER,
      approvalAmount: 100,
      intendedTransactionAmount: 100,
      deadline: "2026-07-23T12:30:00.000Z",
      oneTime: true,
      ...permission,
    },
  };
}

test("bounded approved token approval passes", () => {
  const result = evaluateTokenPermissionControls({ request: request(), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.status, "passed");
  assert.ok(result.findings.some((item) => item.rule === "Approved spender" && item.status === "pass"));
});

test("unlimited approval blocks under configured action", () => {
  const result = evaluateTokenPermissionControls({ request: request({ unlimited: true, approvalAmount: "unlimited" }), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Unlimited token approval" && item.status === "fail"));
});

test("unknown spender routes to review independently of Enforce mode", () => {
  const result = evaluateTokenPermissionControls({ request: request({ spender: "0x5555555555555555555555555555555555555555" }), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Unknown spender" && item.status === "warning"));
});

test("blocked spender is a hard block", () => {
  const result = evaluateTokenPermissionControls({ request: request({ spender: BLOCKED }), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Blocked spender"));
});

test("expired permit and missing nonce block", () => {
  const result = evaluateTokenPermissionControls({ request: request({ kind: "Permit Authorization", deadline: "2026-07-23T11:59:00.000Z", nonce: "" }), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Expired token permission"));
  assert.ok(result.findings.some((item) => item.rule === "Permit nonce"));
});

test("reused permit fingerprint and signature hash block", () => {
  const permission = { ...request().tokenPermission, kind: "Permit Authorization", nonce: "nonce:1", permitIdentifier: "permit:1", permitSignatureHash: "a".repeat(64) };
  const fingerprint = buildTokenPermissionFingerprint(permission);
  const auditLogs = [{ id: "AUD-OLD", agentId: "MAG-1", originalIntent: { action: { tokenPermission: { ...permission, fingerprint } } } }];
  const result = evaluateTokenPermissionControls({ request: request(permission), policy: policy(), auditLogs, now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Reused permit signature"));
  assert.ok(result.findings.some((item) => item.rule === "Permit replay"));
});

test("changed parameters under reused permit identifier block", () => {
  const oldPermission = { ...request().tokenPermission, kind: "Permit Authorization", nonce: "nonce:1", permitIdentifier: "permit:stable", spender: SPENDER };
  const auditLogs = [{ id: "AUD-OLD", agentId: "MAG-1", originalIntent: { action: { tokenPermission: oldPermission } } }];
  const result = evaluateTokenPermissionControls({ request: request({ ...oldPermission, spender: "0x5555555555555555555555555555555555555555" }), policy: policy(), auditLogs, now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Changed permit parameters"));
});

test("NFT operator and oversized batch use policy controls", () => {
  const nft = evaluateTokenPermissionControls({ request: request({ kind: "NFT Operator Approval", operatorApprovalForAll: true }), policy: policy(), now: NOW });
  assert.equal(nft.hardBlock, true);
  const batch = evaluateTokenPermissionControls({ request: request({ kind: "Batch Approval", batch: Array.from({ length: 6 }, (_, index) => ({ spender: `0x${String(index + 5).repeat(40).slice(0, 40)}`, approvalAmount: 1 })) }), policy: policy({ tokenPermissionAllowBatchApproval: true }), now: NOW });
  assert.equal(batch.hardBlock, true);
  assert.ok(batch.findings.some((item) => item.rule === "Maximum token approval batch size"));
});

test("disabled control remains backward-compatible and does not block", () => {
  const result = evaluateTokenPermissionControls({ request: request(), policy: policy({ tokenPermissionControlsEnabled: false }), now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.status, "disabled");
});


test("permit without a deadline blocks even when policy mode observes", () => {
  const result = evaluateTokenPermissionControls({
    request: request({ kind: "Permit Authorization", deadline: "", nonce: "8" }),
    policy: policy({ tokenPermissionMode: "Observe", tokenPermissionRequireExpiry: false }),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Token permission expiration" && item.status === "fail"));
});

test("EIP-155 chain ID mismatch blocks the permit", () => {
  const result = evaluateTokenPermissionControls({
    request: request({ kind: "Permit Authorization", chainId: "8453", nonce: "9" }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "EVM chain ID binding" && item.status === "fail"));
});

test("batch items enforce spender policy and multiple-spender review", () => {
  const second = "0x5555555555555555555555555555555555555555";
  const result = evaluateTokenPermissionControls({
    request: request({
      kind: "Batch Approval",
      batch: [
        { network: "eip155:1", tokenContract: TOKEN, owner: OWNER, spender: SPENDER, approvalAmount: 25 },
        { network: "eip155:1", tokenContract: TOKEN, owner: OWNER, spender: second, approvalAmount: 25 },
      ],
    }),
    policy: policy({ tokenPermissionAllowBatchApproval: true, tokenPermissionUnknownSpenderAction: "Review" }),
    now: NOW,
  });
  assert.equal(result.hardBlock, true, "Enforce mode blocks mode-governed multiple-spender authority");
  assert.ok(result.findings.some((item) => item.rule === "Unknown batch spender"));
  assert.ok(result.findings.some((item) => item.rule === "Multiple batch spenders"));
});
