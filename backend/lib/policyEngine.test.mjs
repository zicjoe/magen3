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
