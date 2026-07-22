import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAction } from "./policyEngine.mjs";

const agent = {
  id: "MAG-AGENT-test",
  name: "YieldBot AI",
  status: "Active",
};

const basePolicy = {
  id: "POL-test",
  name: "Trusted Wallet Transfer Policy",
  agentId: agent.id,
  maxTransaction: 50,
  dailyLimit: 200,
  approvalThreshold: 25,
  trustedContracts: [
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ],
  blockedActions: [],
  riskMode: "Balanced",
  status: "Active",
};

function evaluate(request, policy = basePolicy) {
  return evaluateAction({
    request: {
      agentId: agent.id,
      actionType: "Transfer",
      amount: 15,
      targetType: "Wallet Address",
      walletAddress: "execution-wallet",
      ...request,
    },
    agents: [agent],
    policies: [policy],
    auditLogs: [],
  });
}

test("allows trusted wallet-address transfers within policy limits", () => {
  const result = evaluate({
    target: "0123456789ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef",
  });

  assert.equal(result.decision, "Allowed");
  assert.match(result.policyChecksPassed.join("\n"), /Target is trusted or policy-approved/);
});

test("reviews untrusted wallet-address transfers in balanced mode", () => {
  const result = evaluate({
    target: "unknown-wallet-address",
  });

  assert.equal(result.decision, "Review Required");
  assert.match(result.policyChecksFailed.join("\n"), /trusted target list/);
});

test("blocks wallet-address transfers when Transfer is blocked", () => {
  const result = evaluate(
    {
      target: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    {
      ...basePolicy,
      blockedActions: ["Transfer"],
    },
  );

  assert.equal(result.decision, "Blocked");
});

test("returns structured findings, pipeline stages, and deterministic guidance", () => {
  const result = evaluate({
    target: "unknown-wallet-address",
    amount: 30,
  });

  assert.equal(result.decision, "Review Required");
  assert.ok(Array.isArray(result.moduleFindings));
  assert.ok(result.moduleFindings.some((finding) => finding.status === "warning"));
  assert.ok(Array.isArray(result.pipelineStages));
  assert.ok(result.pipelineStages.some((stage) => stage.id === "risk-assessment"));
  assert.ok(result.primaryReason);
  assert.ok(result.triggeredRule);
  assert.ok(result.suggestedResolution);
});

test("does not silently pass execution simulation when the module is unavailable", () => {
  const result = evaluate({
    actionType: "Swap",
    targetType: "Trusted Contract",
    target: basePolicy.trustedContracts[0],
    amount: 10,
  });

  const simulation = result.moduleFindings.find((finding) => finding.module === "Execution Simulation");
  assert.equal(simulation?.status, "unavailable");
  assert.notEqual(simulation?.status, "pass");
});

test("blocks revoked agents even outside the authenticated gateway route", () => {
  const result = evaluateAction({
    request: {
      agentId: agent.id,
      actionType: "Transfer",
      amount: 1,
      target: basePolicy.trustedContracts[0],
      targetType: "Wallet Address",
      walletAddress: "execution-wallet",
    },
    agents: [{ ...agent, status: "Revoked" }],
    policies: [basePolicy],
    auditLogs: [],
  });

  assert.equal(result.decision, "Blocked");
  assert.equal(result.moduleFindings[0].rule, "Active agent required");
});
