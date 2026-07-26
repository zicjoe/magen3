import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReconciliationState, reconcileExecution, reconciliationFinding, reconciliationStatusSummary } from "./executionReconciliation.mjs";

const BASE_AUDIT = {
  id: "AUD_RECON_0001",
  decision: "Allowed",
  executionStatus: "approved_pending_signature",
  executionTxHash: "",
  executionHistory: [],
};
const POLICY = { structuredRules: { reconciliationEnabled: true, maximumSubmissionAttempts: 3, requiredConfirmations: 2, finalityTimeoutSeconds: 300, replacementAllowed: true, resourceDeliveryRequired: false } };
const TX = `0x${"a".repeat(64)}`;
const REPLACEMENT = `0x${"b".repeat(64)}`;

function apply(audit, body, now = new Date("2026-07-26T12:00:00.000Z")) {
  const result = reconcileExecution({ auditLog: audit, policy: POLICY, body, now });
  return {
    ...audit,
    executionStatus: result.record.status,
    executionTxHash: result.record.transactionHash,
    executionAttemptCount: result.record.attempt,
    executionConfirmations: result.record.confirmations,
    executionRequiredConfirmations: result.record.requiredConfirmations,
    executionFinalityDeadline: result.record.finalityDeadline,
    executionFinalizedAt: result.record.finalizedAt,
    executionReplacedBy: result.record.replacementTransactionHash,
    resourceDeliveryStatus: result.record.resourceDelivered ? "delivered" : result.config.resourceDeliveryRequired ? "pending" : "not_required",
    executionReconciliation: result.record,
    executionHistory: result.history,
  };
}

test("normalizes existing execution aliases", () => {
  assert.equal(normalizeReconciliationState("approved_pending_signature"), "not_submitted");
  assert.equal(normalizeReconciliationState("executed"), "confirmed");
  assert.equal(normalizeReconciliationState("processing"), "pending");
});

test("tracks submitted, pending, and confirmed states with confirmation requirements", () => {
  const submitted = apply(BASE_AUDIT, { status: "submitted", transactionHash: TX, attempt: 1, confirmations: 0, provider: "casper-rpc" });
  assert.equal(submitted.executionStatus, "submitted");
  const pending = apply(submitted, { status: "pending", attempt: 1, confirmations: 1 });
  assert.equal(pending.executionStatus, "pending");
  assert.throws(() => apply(pending, { status: "confirmed", attempt: 1, confirmations: 1 }), /requires at least 2 confirmations/i);
  const confirmed = apply(pending, { status: "confirmed", attempt: 1, confirmations: 2 });
  assert.equal(confirmed.executionStatus, "confirmed");
  assert.ok(confirmed.executionFinalizedAt);
  assert.equal(reconciliationFinding({ record: confirmed.executionReconciliation }).status, "pass");
});

test("prevents duplicate retry while pending", () => {
  const submitted = apply(BASE_AUDIT, { status: "submitted", transactionHash: TX, attempt: 1 });
  assert.throws(() => apply(submitted, { status: "pending", attempt: 2, confirmations: 0 }), /new submission attempt is not permitted/i);
});

test("requires a higher attempt after failure", () => {
  const failed = apply(BASE_AUDIT, { status: "failed", attempt: 1, failureReason: "reverted" });
  assert.throws(() => apply(failed, { status: "submitted", transactionHash: TX, attempt: 1 }), /higher submission attempt/i);
  const retry = apply(failed, { status: "submitted", transactionHash: TX, attempt: 2 });
  assert.equal(retry.executionAttemptCount, 2);
});

test("links replacement transactions and blocks replacement when policy disables it", () => {
  const pending = apply(BASE_AUDIT, { status: "pending", transactionHash: TX, attempt: 1 });
  const replaced = apply(pending, { status: "replaced", attempt: 1, replacementTransactionHash: REPLACEMENT });
  assert.equal(replaced.executionStatus, "replaced");
  assert.equal(replaced.executionReplacedBy, REPLACEMENT);
  assert.throws(() => reconcileExecution({ auditLog: pending, policy: { structuredRules: { ...POLICY.structuredRules, replacementAllowed: false } }, body: { status: "replaced", attempt: 1, replacementTransactionHash: REPLACEMENT } }), /disabled/i);
});

test("rejects resource delivery before confirmation", () => {
  assert.throws(() => reconcileExecution({ auditLog: BASE_AUDIT, policy: POLICY, body: { status: "pending", transactionHash: TX, attempt: 1, resourceDelivered: true } }), /before execution confirmation/i);
});

test("turns a pending observation after the finality deadline into uncertain", () => {
  const submitted = apply(BASE_AUDIT, { status: "submitted", transactionHash: TX, attempt: 1 }, new Date("2026-07-26T12:00:00.000Z"));
  const timedOut = apply(submitted, { status: "pending", attempt: 1 }, new Date("2026-07-26T12:06:00.000Z"));
  assert.equal(timedOut.executionStatus, "uncertain");
  assert.equal(timedOut.executionReconciliation.finalityTimedOut, true);
});

test("status summary is honest about polling boundary", () => {
  const summary = reconciliationStatusSummary(POLICY);
  assert.equal(summary.status, "foundation-available");
  assert.equal(summary.realPollingConfigured, false);
  assert.equal(summary.authenticatedReporting, true);
});
