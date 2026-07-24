import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrivilegedActionFingerprint,
  classifyPrivilegedMethod,
  evaluatePrivilegedActionControls,
  normalizePrivilegedAction,
} from "./privilegedActionControls.mjs";

const CONTRACT = `contract-${"1".repeat(64)}`;
const IMPLEMENTATION = `contract-${"2".repeat(64)}`;
const OTHER_IMPLEMENTATION = `contract-${"3".repeat(64)}`;
const ADMIN = `01${"4".repeat(64)}`;
const OTHER_ADMIN = `01${"5".repeat(64)}`;

function policy(overrides = {}) {
  return {
    id: "POL-privileged",
    structuredRules: {
      privilegedActionControlsEnabled: true,
      privilegedActionMode: "Review",
      privilegedActionsRequiringReview: ["Ownership Transfer", "Proxy Upgrade", "Emergency Withdrawal"],
      privilegedActionsBlocked: [],
      approvedAdministrators: [ADMIN],
      approvedImplementations: [IMPLEMENTATION],
      privilegedActionQuorumRules: { "Ownership Transfer": 2, "Proxy Upgrade": 2 },
      unknownPrivilegedAction: "Review",
      ...overrides,
    },
  };
}

function request(overrides = {}) {
  return {
    actionType: "Contract Interaction",
    target: CONTRACT,
    targetType: "Trusted Contract",
    contractIdentifierType: "Contract Hash",
    entryPoint: "mint",
    chainName: "casper-test",
    privilegedActionMetadataSupplied: true,
    privilegedActionClassifiedAction: "Mint",
    privilegedActionContract: CONTRACT,
    privilegedActionPackage: "",
    privilegedActionEntryPoint: "mint",
    privilegedActionMethodSignature: "mint(address,uint256)",
    privilegedActionCurrentValue: null,
    privilegedActionRequestedValue: 100,
    privilegedActionRole: "",
    privilegedActionRecipient: ADMIN,
    privilegedActionImplementation: "",
    privilegedActionClassifierSource: "test-adapter",
    privilegedActionClassifierVersion: "1.0.0",
    privilegedActionNetwork: "casper-test",
    ...overrides,
  };
}

function has(result, rule, status) {
  return result.findings.some((item) => item.rule === rule && (!status || item.status === status));
}

test("normalizes supported privileged actions and deterministic method aliases", () => {
  assert.equal(normalizePrivilegedAction("transfer_ownership"), "Ownership Transfer");
  assert.equal(classifyPrivilegedMethod({ entryPoint: "upgrade_to" }).classifiedAction, "Proxy Upgrade");
  assert.equal(classifyPrivilegedMethod({ methodSignature: "grantRole(bytes32,address)" }).classifiedAction, "Role Grant");
});

test("allows a supported mint when policy does not require review", () => {
  const result = evaluatePrivilegedActionControls({ request: request(), policy: policy() });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.classifiedAction, "Mint");
  assert.match(result.context.parameterFingerprint, /^[0-9a-f]{64}$/);
  assert.ok(has(result, "Valid privileged amount", "pass"));
  assert.ok(has(result, "Privileged action human approval", "pass"));
});

test("requires exact-bound approval and action-specific quorum for ownership transfer", () => {
  const result = evaluatePrivilegedActionControls({
    request: request({
      entryPoint: "transfer_ownership",
      privilegedActionClassifiedAction: "Ownership Transfer",
      privilegedActionEntryPoint: "transfer_ownership",
      privilegedActionMethodSignature: "transferOwnership(address)",
      privilegedActionCurrentValue: ADMIN,
      privilegedActionRequestedValue: OTHER_ADMIN,
      privilegedActionRecipient: OTHER_ADMIN,
    }),
    policy: policy({ approvedAdministrators: [ADMIN, OTHER_ADMIN] }),
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.context.requiredApprovalCount, 2);
  assert.equal(result.context.approvalRequired, true);
  assert.ok(has(result, "Approved administrative recipient", "pass"));
  assert.ok(has(result, "Privileged action human approval", "warning"));
});

test("hard-blocks explicitly blocked privileged actions", () => {
  const result = evaluatePrivilegedActionControls({
    request: request(),
    policy: policy({ privilegedActionsBlocked: ["Mint"] }),
  });
  assert.equal(result.hardBlock, true);
  assert.ok(has(result, "Blocked privileged action", "fail"));
});

test("follows unknown-action behavior without classifying arbitrary contract calls", () => {
  const unknown = evaluatePrivilegedActionControls({
    request: request({
      entryPoint: "custom_admin_call",
      privilegedActionClassifiedAction: "Custom Admin Mutation",
      privilegedActionEntryPoint: "custom_admin_call",
      privilegedActionMethodSignature: "customAdminCall(bytes)",
    }),
    policy: policy({ unknownPrivilegedAction: "Review" }),
  });
  assert.equal(unknown.hardBlock, false);
  assert.equal(unknown.needsReview, true);
  assert.ok(has(unknown, "Supported privileged-action classification", "warning"));

  const generic = evaluatePrivilegedActionControls({
    request: request({
      privilegedActionMetadataSupplied: false,
      privilegedActionClassifiedAction: "",
      privilegedActionEntryPoint: "deposit",
      privilegedActionMethodSignature: "",
      entryPoint: "deposit",
    }),
    policy: policy(),
  });
  assert.equal(generic.hardBlock, false);
  assert.equal(generic.needsReview, false);
  assert.equal(generic.context, null);
  assert.ok(has(generic, "Privileged action applicability", "skipped"));
});

test("auto-classifies a known entry point when explicit metadata is absent", () => {
  const result = evaluatePrivilegedActionControls({
    request: request({
      privilegedActionMetadataSupplied: false,
      privilegedActionClassifiedAction: "",
      privilegedActionEntryPoint: "",
      privilegedActionMethodSignature: "",
      entryPoint: "pause",
    }),
    policy: policy(),
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.context.classifiedAction, "Pause");
  assert.ok(has(result, "Supported privileged-action classification", "pass"));
});

test("hard-blocks contradictory declared and deterministic classifications", () => {
  const result = evaluatePrivilegedActionControls({
    request: request({
      entryPoint: "pause",
      privilegedActionClassifiedAction: "Mint",
      privilegedActionEntryPoint: "pause",
      privilegedActionMethodSignature: "pause()",
    }),
    policy: policy(),
  });
  assert.equal(result.hardBlock, true);
  assert.ok(has(result, "Consistent privileged-action classification", "fail"));
});

test("reviews or blocks unapproved administrative recipients according to mode", () => {
  const input = request({
    entryPoint: "set_admin",
    privilegedActionClassifiedAction: "Administrator Change",
    privilegedActionEntryPoint: "set_admin",
    privilegedActionMethodSignature: "setAdmin(address)",
    privilegedActionCurrentValue: ADMIN,
    privilegedActionRequestedValue: OTHER_ADMIN,
    privilegedActionRecipient: OTHER_ADMIN,
  });
  const review = evaluatePrivilegedActionControls({ request: input, policy: policy({ privilegedActionsRequiringReview: [] }) });
  assert.equal(review.hardBlock, false);
  assert.equal(review.needsReview, true);
  assert.ok(has(review, "Approved administrative recipient", "warning"));

  const enforce = evaluatePrivilegedActionControls({ request: input, policy: policy({ privilegedActionMode: "Enforce", privilegedActionsRequiringReview: [] }) });
  assert.equal(enforce.hardBlock, true);
  assert.ok(has(enforce, "Approved administrative recipient", "fail"));
});

test("validates approved implementations and rejects missing upgrade metadata", () => {
  const approved = evaluatePrivilegedActionControls({
    request: request({
      entryPoint: "upgrade_to",
      privilegedActionClassifiedAction: "Proxy Upgrade",
      privilegedActionEntryPoint: "upgrade_to",
      privilegedActionMethodSignature: "upgradeTo(address)",
      privilegedActionCurrentValue: OTHER_IMPLEMENTATION,
      privilegedActionRequestedValue: IMPLEMENTATION,
      privilegedActionRecipient: "",
      privilegedActionImplementation: IMPLEMENTATION,
    }),
    policy: policy(),
  });
  assert.equal(approved.hardBlock, false);
  assert.equal(approved.needsReview, true);
  assert.ok(has(approved, "Approved implementation", "pass"));

  const missing = evaluatePrivilegedActionControls({
    request: request({
      entryPoint: "upgrade_to",
      privilegedActionClassifiedAction: "Proxy Upgrade",
      privilegedActionEntryPoint: "upgrade_to",
      privilegedActionMethodSignature: "upgradeTo(address)",
      privilegedActionImplementation: "",
    }),
    policy: policy(),
  });
  assert.equal(missing.hardBlock, true);
  assert.ok(has(missing, "Approved implementation", "fail"));
});

test("requires role, recipient and positive amount metadata for applicable actions", () => {
  const role = evaluatePrivilegedActionControls({
    request: request({
      entryPoint: "grant_role",
      privilegedActionClassifiedAction: "Role Grant",
      privilegedActionEntryPoint: "grant_role",
      privilegedActionMethodSignature: "grantRole(bytes32,address)",
      privilegedActionRole: "",
      privilegedActionRecipient: ADMIN,
      privilegedActionRequestedValue: null,
    }),
    policy: policy({ privilegedActionsRequiringReview: [], approvedAdministrators: [ADMIN] }),
  });
  assert.equal(role.hardBlock, true);
  assert.ok(has(role, "Valid privileged role", "fail"));

  const withdrawal = evaluatePrivilegedActionControls({
    request: request({
      entryPoint: "emergency_withdraw",
      privilegedActionClassifiedAction: "Emergency Withdrawal",
      privilegedActionEntryPoint: "emergency_withdraw",
      privilegedActionMethodSignature: "emergencyWithdraw(address,uint256)",
      privilegedActionRequestedValue: 0,
      privilegedActionRecipient: ADMIN,
    }),
    policy: policy(),
  });
  assert.equal(withdrawal.hardBlock, true);
  assert.ok(has(withdrawal, "Valid privileged amount", "fail"));
});

test("hard-blocks network, target and no-op protected-value mismatches", () => {
  const network = evaluatePrivilegedActionControls({ request: request({ privilegedActionNetwork: "casper-mainnet" }), policy: policy() });
  assert.equal(network.hardBlock, true);
  assert.ok(has(network, "Privileged action network binding", "fail"));

  const target = evaluatePrivilegedActionControls({ request: request({ privilegedActionContract: OTHER_IMPLEMENTATION }), policy: policy() });
  assert.equal(target.hardBlock, true);
  assert.ok(has(target, "Privileged target binding", "fail"));

  const noOp = evaluatePrivilegedActionControls({
    request: request({
      entryPoint: "set_admin",
      privilegedActionClassifiedAction: "Administrator Change",
      privilegedActionEntryPoint: "set_admin",
      privilegedActionMethodSignature: "setAdmin(address)",
      privilegedActionCurrentValue: ADMIN,
      privilegedActionRequestedValue: ADMIN,
      privilegedActionRecipient: ADMIN,
    }),
    policy: policy({ approvedAdministrators: [ADMIN] }),
  });
  assert.equal(noOp.hardBlock, true);
  assert.ok(has(noOp, "Material privileged change", "fail"));
});

test("fingerprint changes whenever protected parameters change", () => {
  const base = {
    classifiedAction: "Ownership Transfer",
    contract: CONTRACT,
    entryPoint: "transfer_ownership",
    methodSignature: "transferOwnership(address)",
    currentValue: ADMIN,
    requestedValue: OTHER_ADMIN,
    recipient: OTHER_ADMIN,
    network: "casper-test",
  };
  const first = buildPrivilegedActionFingerprint(base);
  const second = buildPrivilegedActionFingerprint({ ...base, recipient: ADMIN, requestedValue: ADMIN });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test("disabled legacy policies skip the new control without changing generic execution", () => {
  const result = evaluatePrivilegedActionControls({
    request: request(),
    policy: policy({ privilegedActionControlsEnabled: false }),
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context, null);
  assert.ok(has(result, "Privileged action controls enabled", "skipped"));
});
