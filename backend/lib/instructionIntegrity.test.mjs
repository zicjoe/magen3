import assert from "node:assert/strict";
import test from "node:test";
import { buildInstructionParameterFingerprint, buildInstructionProtectedParameters, evaluateInstructionIntegrity } from "./instructionIntegrity.mjs";

const HASH = "a".repeat(64);
function policy(overrides = {}) {
  return { id: "POL-INSTRUCTION", structuredRules: {
    instructionIntegrityEnabled: true,
    instructionIntegrityMode: "Review",
    requireGoalBindingForActions: ["Transfer", "x402 Payment", "DAO Treasury Payment"],
    requireUserConfirmationForExternalContent: true,
    allowedSourceDomains: ["trusted.example"],
    blockedSourceDomains: ["evil.example"],
    externalContentHighRiskAction: "Review",
    allowParameterChangesAfterGoal: false,
    requireParameterChangeReason: true,
    ...overrides,
  }};
}
function request(overrides = {}) {
  const base = {
    actionType: "Transfer",
    amount: 10,
    asset: "CSPR",
    target: `01${"1".repeat(64)}`,
    targetType: "Wallet Address",
    chainName: "casper-test",
    instructionIntegrityMetadataSupplied: true,
    instructionGoalId: "goal-transfer-001",
    instructionOriginalUserGoalHash: HASH,
    instructionInitiatedBy: "user",
    instructionIntentSource: "user",
    instructionSourceDomains: [],
    instructionExternalContentUsed: false,
    instructionUserConfirmed: true,
    instructionSourceTrustLevel: "trusted",
    instructionOriginalPermissionScopes: ["transfer"],
    instructionCurrentPermissionScopes: ["transfer"],
  };
  const merged = { ...base, ...overrides };
  const fingerprint = buildInstructionParameterFingerprint(merged);
  return { instructionOriginalParameterHash: fingerprint, instructionCurrentParameterHash: fingerprint, ...merged };
}

test("allows trusted goal-bound intent with unchanged protected parameters", () => {
  const result = evaluateInstructionIntegrity({ request: request(), policy: policy() });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.rule === "Stable goal binding" && item.status === "pass"));
  assert.equal(result.context.parametersChanged, false);
});

test("missing required goal binding routes to review", () => {
  const req = request({ instructionGoalId: "", instructionOriginalUserGoalHash: "" });
  const result = evaluateInstructionIntegrity({ request: req, policy: policy() });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Stable goal binding" && item.status === "warning"));
});

test("blocked source domain fails closed", () => {
  const result = evaluateInstructionIntegrity({ request: request({ instructionSourceDomains: ["sub.evil.example"], instructionExternalContentUsed: true, instructionIntentSource: "webpage", instructionSourceTrustLevel: "untrusted" }), policy: policy() });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Blocked instruction source"));
});

test("external content changing protected parameters requires review", () => {
  const req = request({ amount: 25, instructionExternalContentUsed: true, instructionIntentSource: "webpage", instructionSourceDomains: ["trusted.example"], instructionSourceTrustLevel: "untrusted", instructionUserConfirmed: false });
  req.instructionOriginalParameterHash = buildInstructionParameterFingerprint({ ...req, amount: 10 });
  req.instructionCurrentParameterHash = buildInstructionParameterFingerprint(req);
  const result = evaluateInstructionIntegrity({ request: req, policy: policy() });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "External-content confirmation"));
});

test("external resource cannot authorize x402 payment to itself", () => {
  const req = request({ actionType: "x402 Payment", x402MerchantDomain: "pay.example", x402ResourceUrl: "https://pay.example/resource", instructionExternalContentUsed: true, instructionIntentSource: "webpage", instructionSourceDomains: ["pay.example"], instructionSourceTrustLevel: "untrusted", instructionUserConfirmed: false });
  req.instructionOriginalParameterHash = buildInstructionParameterFingerprint(req);
  req.instructionCurrentParameterHash = req.instructionOriginalParameterHash;
  const result = evaluateInstructionIntegrity({ request: req, policy: policy({ allowedSourceDomains: ["pay.example"] }) });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "External resource self-authorization"));
});

test("tool output cannot expand its own permission scope", () => {
  const result = evaluateInstructionIntegrity({ request: request({ instructionInitiatedBy: "tool", instructionIntentSource: "tool-output", instructionToolName: "payments.send", instructionOriginalPermissionScopes: ["read"], instructionCurrentPermissionScopes: ["read", "transfer"] }), policy: policy() });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Tool permission-scope containment"));
});

test("mismatched supplied current hash is rejected as contradictory provenance", () => {
  const result = evaluateInstructionIntegrity({ request: request({ instructionCurrentParameterHash: "b".repeat(64) }), policy: policy() });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Valid instruction provenance" && item.status === "fail"));
});

test("legacy policies remain backward compatible", () => {
  const result = evaluateInstructionIntegrity({ request: { actionType: "Transfer", amount: 1 }, policy: { structuredRules: {} } });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.every((item) => item.status === "skipped"));
});


test("returns a precise diagnostic for a current parameter hash mismatch", () => {
  const result = evaluateInstructionIntegrity({ request: request({ instructionCurrentParameterHash: "b".repeat(64) }), policy: policy() });
  const finding = result.findings.find((item) => item.rule === "Valid instruction provenance" && item.status === "fail");
  assert.equal(finding.evidence.code, "INSTRUCTION_CURRENT_PARAMETER_HASH_MISMATCH");
  assert.equal(finding.evidence.field, "currentParameterHash");
  assert.match(finding.message, /calculated the transaction-verification hash differently/i);
  assert.match(finding.remediation, /SDK binding helper/i);
});

test("names the exact changed protected field when the original snapshot is supplied", () => {
  const original = request({ amount: 10 });
  const originalProtectedParameters = buildInstructionProtectedParameters(original);
  const changed = request({ amount: 25, instructionOriginalProtectedParameters: originalProtectedParameters });
  changed.instructionOriginalParameterHash = buildInstructionParameterFingerprint(original);
  changed.instructionCurrentParameterHash = buildInstructionParameterFingerprint(changed);
  const result = evaluateInstructionIntegrity({ request: changed, policy: policy() });
  const finding = result.findings.find((item) => item.rule === "Protected parameter binding" && item.status === "warning");
  assert.equal(finding.evidence.code, "INSTRUCTION_PROTECTED_PARAMETER_MISMATCH");
  assert.equal(finding.evidence.field, "amount");
  assert.deepEqual(finding.evidence.mismatchFields, ["amount"]);
  assert.equal(finding.evidence.expected, 10);
  assert.equal(finding.evidence.received, 25);
  assert.match(finding.message, /amount changed from 10 to 25/i);
});

test("identifies each missing goal-binding field", () => {
  const result = evaluateInstructionIntegrity({ request: request({ instructionGoalId: "", instructionOriginalUserGoalHash: "" }), policy: policy() });
  const finding = result.findings.find((item) => item.rule === "Stable goal binding" && item.status === "warning");
  assert.equal(finding.evidence.code, "INSTRUCTION_GOAL_BINDING_MISSING");
  assert.deepEqual(finding.evidence.missingFields, ["goalId", "originalUserGoalHash"]);
  assert.match(finding.message, /goal ID and original request hash/i);
});
