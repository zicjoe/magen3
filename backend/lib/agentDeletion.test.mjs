import assert from "node:assert/strict";
import test from "node:test";

import { agentDeletionReadiness } from "./agentDeletion.mjs";

const agent = { id: "MAG-AGENT-delete", name: "Delete Test Agent", status: "Revoked" };

test("agent deletion requires revocation and clear operational state", () => {
  const active = agentDeletionReadiness({ agent: { ...agent, status: "Active" } });
  assert.equal(active.allowed, false);
  assert.equal(active.blockers[0].code, "agent-active");

  const blocked = agentDeletionReadiness({
    agent,
    approvals: [{ agentId: agent.id, reviewStatus: "Pending" }],
    emergencyPauses: [{ agentId: agent.id, status: "Active" }],
    auditLogs: [{ agentId: agent.id, executionStatus: "pending" }],
  });
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.blockers.map((item) => item.code), ["pending-approvals", "active-pauses", "unresolved-executions"]);
});

test("agent deletion preserves evidence counts and removes assigned policies only", () => {
  const readiness = agentDeletionReadiness({
    agent,
    policies: [{ id: "POL-1", agentId: agent.id }, { id: "POL-other", agentId: "other" }],
    approvals: [{ id: "APR-1", agentId: agent.id, reviewStatus: "Rejected" }],
    auditLogs: [{ id: "AUD-1", agentId: agent.id, executionStatus: "blocked_not_submitted" }],
    emergencyPauses: [{ id: "PAUSE-1", agentId: agent.id, status: "Resumed" }],
  });
  assert.equal(readiness.allowed, true);
  assert.deepEqual(readiness.policyIds, ["POL-1"]);
  assert.equal(readiness.preservedEvidence.auditLogs, 1);
  assert.equal(readiness.preservedEvidence.approvals, 1);
});
