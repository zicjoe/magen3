import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOrganizationalEscalations,
  organizationalApprovalFinding,
  organizationalApprovalProgress,
  resolveOrganizationalApproval,
} from "./organizationalApproval.mjs";
import {
  approvalExecutionAuthorized,
  createApprovalRequest,
  expireApproval,
  respondToApproval,
} from "./approvalWorkflow.mjs";

const TREASURY_ONE = `01${"1".repeat(64)}`;
const TREASURY_TWO = `01${"2".repeat(64)}`;
const SECURITY = `01${"3".repeat(64)}`;
const BACKUP = `01${"4".repeat(64)}`;

function policy(overrides = {}) {
  return {
    id: "POL-ORG",
    name: "Organizational Treasury",
    structuredRules: {
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Quorum",
      approvalRequiredCount: 1,
      approvalAllowOwnerFallback: false,
      approvalApproverWallets: [],
      approvalExpiryMinutes: 120,
      approvalOrganizationalQuorumEnabled: true,
      approvalGroups: [
        { id: "treasury", name: "Treasury", role: "Treasury Approver", wallets: [TREASURY_ONE, TREASURY_TWO], backupGroupIds: ["backup"] },
        { id: "security", name: "Security", role: "Security Approver", wallets: [SECURITY] },
        { id: "backup", name: "Backup", role: "Backup Approver", wallets: [BACKUP] },
      ],
      approvalTiers: [
        { id: "small", name: "Small", priority: 1, maxAmount: 999, requiredGroups: [{ groupId: "treasury", approvals: 1 }], requiredApprovals: 1 },
        { id: "large", name: "Large", priority: 10, minAmount: 1000, actions: ["Transfer"], capabilities: ["Treasury Operations"], requiredGroups: [{ groupId: "treasury", approvals: 2 }, { groupId: "security", approvals: 1 }], requiredApprovals: 3, executionDelaySeconds: 1800, executionWindowSeconds: 900 },
      ],
      approvalEscalationRules: [{ id: "backup-after-10m", name: "Backup escalation", afterSeconds: 600, activateBackups: true }],
      ...overrides,
    },
  };
}

function audit(overrides = {}) {
  return {
    id: "AUD-ORG",
    agentId: "MAG-AGENT-ORG",
    action: "Transfer",
    amount: 12000,
    target: `hash-${"a".repeat(64)}`,
    targetType: "Contract Hash",
    executionWalletAddress: `01${"a".repeat(64)}`,
    policyUsed: "Organizational Treasury",
    decision: "Review Required",
    risk: "High",
    riskScore: 80,
    primaryReason: "High-value treasury transfer",
    capabilityContext: ["Treasury Operations"],
    originalIntent: { action: { type: "Transfer", amount: 12000 } },
    ...overrides,
  };
}

test("resolves the most specific highest-priority approval tier", () => {
  const resolved = resolveOrganizationalApproval({ policy: policy(), auditLog: audit(), baseApproverWallets: [], baseRequiredApprovals: 1 });
  assert.equal(resolved.resolvedTier.id, "large");
  assert.equal(resolved.requiredApprovals, 3);
  assert.deepEqual(resolved.requiredGroups, [{ groupId: "treasury", approvals: 2 }, { groupId: "security", approvals: 1 }]);
  assert.equal(resolved.configurationErrors.length, 0);
});

test("group quorum requires the configured roles and distinct wallets", () => {
  const request = createApprovalRequest({ auditLog: audit(), policy: policy(), ownerWalletAddress: TREASURY_ONE, now: new Date("2026-07-24T10:00:00Z") });
  assert.equal(request.reviewContext.organizationalQuorum.resolvedTier.id, "large");
  const first = respondToApproval(request, { walletAddress: TREASURY_ONE, response: "Approve" }, new Date("2026-07-24T10:05:00Z"));
  const second = respondToApproval(first, { walletAddress: TREASURY_TWO, response: "Approve" }, new Date("2026-07-24T10:06:00Z"));
  assert.equal(second.reviewStatus, "Pending");
  assert.equal(organizationalApprovalProgress(second).groups.find((group) => group.groupId === "treasury").satisfied, true);
  const third = respondToApproval(second, { walletAddress: SECURITY, response: "Approve" }, new Date("2026-07-24T10:10:00Z"));
  assert.equal(third.reviewStatus, "Approved");
  assert.equal(organizationalApprovalProgress(third).satisfied, true);
});

test("execution delay and window are enforced after quorum", () => {
  const request = createApprovalRequest({ auditLog: audit(), policy: policy(), ownerWalletAddress: TREASURY_ONE, now: new Date("2026-07-24T10:00:00Z") });
  const first = respondToApproval(request, { walletAddress: TREASURY_ONE, response: "Approve" }, new Date("2026-07-24T10:05:00Z"));
  const second = respondToApproval(first, { walletAddress: TREASURY_TWO, response: "Approve" }, new Date("2026-07-24T10:06:00Z"));
  const approved = respondToApproval(second, { walletAddress: SECURITY, response: "Approve" }, new Date("2026-07-24T10:10:00Z"));
  assert.equal(approvalExecutionAuthorized(approved, new Date("2026-07-24T10:39:59Z")), false);
  assert.equal(approvalExecutionAuthorized(approved, new Date("2026-07-24T10:40:00Z")), true);
  assert.equal(approvalExecutionAuthorized(approved, new Date("2026-07-24T10:55:01Z")), false);
  assert.equal(expireApproval(approved, new Date("2026-07-24T10:55:01Z")).reviewStatus, "Expired");
});

test("timed escalation activates backup reviewers for the original role without weakening distinct quorum", () => {
  const smallPolicy = policy({
    approvalWorkflowMode: "Single",
    approvalRequiredCount: 1,
    approvalTiers: [{ id: "small", name: "Small", maxAmount: 999, requiredGroups: [{ groupId: "treasury", approvals: 1 }], requiredApprovals: 1 }],
    approvalEscalationRules: [{ id: "backup", afterSeconds: 600, activateBackups: true }],
  });
  const request = createApprovalRequest({ auditLog: audit({ amount: 100 }), policy: smallPolicy, ownerWalletAddress: TREASURY_ONE, now: new Date("2026-07-24T10:00:00Z") });
  assert.equal(request.approverWallets.includes(BACKUP), false);
  const escalated = applyOrganizationalEscalations(request, new Date("2026-07-24T10:10:00Z"));
  assert.equal(escalated.approverWallets.includes(BACKUP), true);
  assert.equal(escalated.reviewContext.organizationalQuorum.escalationHistory.length, 1);
  const approved = respondToApproval(escalated, { walletAddress: BACKUP, response: "Approve" }, new Date("2026-07-24T10:11:00Z"));
  assert.equal(approved.reviewStatus, "Approved", "an activated backup group may satisfy the original role it backs up");
  assert.deepEqual(approved.responses[0].memberGroupIds, ["backup"]);
  assert.ok(approved.responses[0].groupIds.includes("treasury"));
});

test("group requirements raise total quorum to preserve distinct reviewer wallets", () => {
  const request = createApprovalRequest({
    auditLog: audit(),
    policy: policy({
      approvalRequiredCount: 1,
      approvalTiers: [{
        id: "multi-role",
        name: "Multi Role",
        requiredGroups: [{ groupId: "treasury", approvals: 1 }, { groupId: "security", approvals: 1 }],
        requiredApprovals: 1,
      }],
    }),
    ownerWalletAddress: TREASURY_ONE,
  });
  assert.equal(request.requiredApprovals, 2);
});

test("execution delay longer than approval expiry fails into Configuration Required", () => {
  const request = createApprovalRequest({
    auditLog: audit(),
    policy: policy({
      approvalExpiryMinutes: 5,
      approvalTiers: [{ id: "impossible", name: "Impossible", requiredGroups: [{ groupId: "treasury", approvals: 1 }], executionDelaySeconds: 300 }],
    }),
    ownerWalletAddress: TREASURY_ONE,
  });
  assert.equal(request.reviewStatus, "Configuration Required");
  assert.ok(request.reviewContext.organizationalQuorum.configurationErrors.some((item) => /delay must be shorter/i.test(item)));
});

test("unknown groups fail into Configuration Required", () => {
  const request = createApprovalRequest({
    auditLog: audit(),
    policy: policy({ approvalTiers: [{ id: "bad", name: "Bad", requiredGroups: [{ groupId: "missing", approvals: 1 }] }] }),
    ownerWalletAddress: TREASURY_ONE,
  });
  assert.equal(request.reviewStatus, "Configuration Required");
  assert.match(request.reviewContext.organizationalQuorum.configurationErrors[0], /not configured/i);
});

test("tier resolution requires every configured amount, action, capability, and contract condition", () => {
  const target = `hash-${"b".repeat(64)}`;
  const matched = resolveOrganizationalApproval({
    policy: policy({
      approvalTiers: [
        { id: "fallback", name: "Fallback", priority: 1, requiredGroups: [{ groupId: "treasury", approvals: 1 }] },
        { id: "contract-admin", name: "Contract Admin", priority: 50, minAmount: 5000, actions: ["Contract Call"], capabilities: ["Treasury Operations"], contracts: [target], requiredGroups: [{ groupId: "security", approvals: 1 }] },
      ],
    }),
    auditLog: audit({ action: "Contract Call", amount: 6000, target }),
    baseApproverWallets: [],
    baseRequiredApprovals: 1,
  });
  assert.equal(matched.resolvedTier.id, "contract-admin");

  const wrongContract = resolveOrganizationalApproval({
    policy: policy({
      approvalTiers: [
        { id: "fallback", name: "Fallback", priority: 1, requiredGroups: [{ groupId: "treasury", approvals: 1 }] },
        { id: "contract-admin", name: "Contract Admin", priority: 50, minAmount: 5000, actions: ["Contract Call"], capabilities: ["Treasury Operations"], contracts: [target], requiredGroups: [{ groupId: "security", approvals: 1 }] },
      ],
    }),
    auditLog: audit({ action: "Contract Call", amount: 6000, target: `hash-${"c".repeat(64)}` }),
    baseApproverWallets: [],
    baseRequiredApprovals: 1,
  });
  assert.equal(wrongContract.resolvedTier.id, "fallback");
});

test("terminal organizational approval states produce a fail finding", () => {
  const request = createApprovalRequest({ auditLog: audit(), policy: policy(), ownerWalletAddress: TREASURY_ONE, now: new Date("2026-07-24T10:00:00Z") });
  const rejected = respondToApproval(request, { walletAddress: TREASURY_ONE, response: "Reject", comment: "Security review rejected the transfer." }, new Date("2026-07-24T10:05:00Z"));
  const finding = organizationalApprovalFinding(rejected);
  assert.equal(finding.status, "fail");
  assert.match(finding.message, /ended as rejected/i);
});

test("resolved organizational tiers can vary quorum without being flattened by the legacy base count", () => {
  const tieredPolicy = policy({
    approvalRequiredCount: 3,
    approvalTiers: [
      { id: "small", name: "Small", maxAmount: 999, requiredGroups: [{ groupId: "treasury", approvals: 1 }], requiredApprovals: 1 },
      { id: "medium", name: "Medium", minAmount: 1000, maxAmount: 9999, requiredGroups: [{ groupId: "treasury", approvals: 2 }], requiredApprovals: 2 },
      { id: "large", name: "Large", minAmount: 10000, requiredGroups: [{ groupId: "treasury", approvals: 2 }, { groupId: "security", approvals: 1 }], requiredApprovals: 3 },
    ],
  });
  const small = createApprovalRequest({ auditLog: audit({ amount: 500 }), policy: tieredPolicy, ownerWalletAddress: TREASURY_ONE });
  const medium = createApprovalRequest({ auditLog: audit({ amount: 5000 }), policy: tieredPolicy, ownerWalletAddress: TREASURY_ONE });
  const large = createApprovalRequest({ auditLog: audit({ amount: 15000 }), policy: tieredPolicy, ownerWalletAddress: TREASURY_ONE });
  assert.equal(small.requiredApprovals, 1);
  assert.equal(medium.requiredApprovals, 2);
  assert.equal(large.requiredApprovals, 3);
});

test("an escalation that adds a required role also activates that role's eligible reviewers", () => {
  const escalatedPolicy = policy({
    approvalTiers: [{ id: "standard", name: "Standard", requiredGroups: [{ groupId: "treasury", approvals: 1 }], requiredApprovals: 1 }],
    approvalEscalationRules: [{ id: "security-after-5m", afterSeconds: 300, requiredGroups: [{ groupId: "security", approvals: 1 }], requiredApprovals: 2 }],
  });
  const request = createApprovalRequest({ auditLog: audit({ amount: 100 }), policy: escalatedPolicy, ownerWalletAddress: TREASURY_ONE, now: new Date("2026-07-24T10:00:00Z") });
  assert.equal(request.approverWallets.includes(SECURITY), false);
  const escalated = applyOrganizationalEscalations(request, new Date("2026-07-24T10:05:00Z"));
  assert.equal(escalated.approverWallets.includes(SECURITY), true);
  assert.equal(escalated.requiredApprovals, 2);
});
