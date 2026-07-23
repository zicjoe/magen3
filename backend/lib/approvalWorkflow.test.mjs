import assert from "node:assert/strict";
import test from "node:test";

import {
  approvalExecutionAuthorized,
  computeApprovalBindingHash,
  createApprovalRequest,
  expireApproval,
  respondToApproval,
} from "./approvalWorkflow.mjs";

const OWNER = `01${"c".repeat(64)}`;
const APPROVER_TWO = `01${"d".repeat(64)}`;

function audit(overrides = {}) {
  return {
    id: "AUD-1",
    agentId: "MAG-AGENT-1",
    action: "Transfer",
    amount: 30,
    target: `01${"b".repeat(64)}`,
    targetType: "Wallet Address",
    executionWalletAddress: `01${"a".repeat(64)}`,
    policyUsed: "Treasury Policy",
    decision: "Review Required",
    risk: "Medium",
    riskScore: 45,
    primaryReason: "Amount exceeds review threshold",
    originalIntent: { action: { type: "Transfer", amount: 30 } },
    ...overrides,
  };
}

function policy(overrides = {}) {
  return {
    id: "POL-1",
    name: "Treasury Policy",
    structuredRules: {
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Quorum",
      approvalRequiredCount: 2,
      approvalApproverWallets: [OWNER, APPROVER_TWO],
      approvalAllowOwnerFallback: false,
      approvalExpiryMinutes: 60,
      approvalRequireRejectComment: true,
      ...overrides,
    },
  };
}

test("approval binding is stable and changes when protected intent parameters change", () => {
  const first = computeApprovalBindingHash(audit());
  const same = computeApprovalBindingHash(audit());
  const changed = computeApprovalBindingHash(audit({ amount: 31 }));
  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("quorum requires distinct eligible wallets and authorizes only after completion", () => {
  const request = createApprovalRequest({ auditLog: audit(), policy: policy(), ownerWalletAddress: OWNER, now: new Date("2026-07-23T10:00:00Z") });
  assert.equal(request.reviewStatus, "Pending");
  const one = respondToApproval(request, { walletAddress: OWNER, response: "Approve" }, new Date("2026-07-23T10:05:00Z"));
  assert.equal(one.reviewStatus, "Pending");
  assert.equal(approvalExecutionAuthorized(one, new Date("2026-07-23T10:06:00Z")), false);
  assert.throws(() => respondToApproval(one, { walletAddress: OWNER, response: "Approve" }, new Date("2026-07-23T10:06:30Z")), /already responded/i);
  const two = respondToApproval(one, { walletAddress: APPROVER_TWO, response: "Approve", comment: "Reviewed" }, new Date("2026-07-23T10:10:00Z"));
  assert.equal(two.reviewStatus, "Approved");
  assert.equal(approvalExecutionAuthorized(two, new Date("2026-07-23T10:11:00Z")), true);
});

test("one authorized rejection ends the workflow and requires a comment", () => {
  const request = createApprovalRequest({ auditLog: audit(), policy: policy(), ownerWalletAddress: OWNER });
  assert.throws(() => respondToApproval(request, { walletAddress: OWNER, response: "Reject" }), /comment is required/i);
  const rejected = respondToApproval(request, { walletAddress: OWNER, response: "Reject", comment: "Recipient must be corrected" });
  assert.equal(rejected.reviewStatus, "Rejected");
  assert.equal(rejected.rejectionReason, "Recipient must be corrected");
});

test("expired approvals cannot authorize execution", () => {
  const request = createApprovalRequest({ auditLog: audit(), policy: policy({ approvalRequiredCount: 1, approvalExpiryMinutes: 5 }), ownerWalletAddress: OWNER, now: new Date("2026-07-23T10:00:00Z") });
  const approved = respondToApproval(request, { walletAddress: OWNER, response: "Approve" }, new Date("2026-07-23T10:01:00Z"));
  const expired = expireApproval(approved, new Date("2026-07-23T10:06:00Z"));
  assert.equal(expired.reviewStatus, "Expired");
  assert.equal(approvalExecutionAuthorized(expired, new Date("2026-07-23T10:06:00Z")), false);
});

test("unauthorized wallets cannot respond to an approval request", () => {
  const request = createApprovalRequest({ auditLog: audit(), policy: policy(), ownerWalletAddress: OWNER });
  const outsider = `01${"e".repeat(64)}`;
  assert.throws(
    () => respondToApproval(request, { walletAddress: outsider, response: "Approve" }),
    /not an authorized approver/i,
  );
});

test("separation of duties prevents the execution wallet from self-approving", () => {
  const executionWallet = `01${"a".repeat(64)}`;
  const request = createApprovalRequest({
    auditLog: audit({ executionWalletAddress: executionWallet }),
    policy: policy({
      approvalRequiredCount: 1,
      approvalApproverWallets: [executionWallet],
      approvalSeparationOfDuties: true,
    }),
    ownerWalletAddress: OWNER,
  });
  assert.throws(
    () => respondToApproval(request, { walletAddress: executionWallet, response: "Approve" }),
    /separation of duties/i,
  );
});

test("missing approvers produces a configuration-required request instead of a false approval path", () => {
  const request = createApprovalRequest({
    auditLog: audit(),
    policy: policy({
      approvalApproverWallets: [],
      approvalAllowOwnerFallback: false,
      approvalRequiredCount: 2,
    }),
    ownerWalletAddress: OWNER,
  });
  assert.equal(request.reviewStatus, "Configuration Required");
  assert.equal(request.approverWallets.length, 0);
  assert.equal(approvalExecutionAuthorized(request), false);
});

test("Single mode always requires exactly one approval", () => {
  const request = createApprovalRequest({
    auditLog: audit(),
    policy: policy({
      approvalWorkflowMode: "Single",
      approvalRequiredCount: 5,
      approvalApproverWallets: [OWNER, APPROVER_TWO],
    }),
    ownerWalletAddress: OWNER,
  });
  assert.equal(request.reviewContext.mode, "Single");
  assert.equal(request.requiredApprovals, 1);
});
