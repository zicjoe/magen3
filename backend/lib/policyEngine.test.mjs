import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAction } from "./policyEngine.mjs";

const EXECUTION_WALLET = `01${"a".repeat(64)}`;
const OWNER_WALLET = `01${"c".repeat(64)}`;
const TRUSTED_DESTINATION = `01${"b".repeat(64)}`;
const UNTRUSTED_DESTINATION = `02${"d".repeat(66)}`;
const TRUSTED_CONTRACT = "contract-package-hash-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const agent = {
  id: "MAG-AGENT-test",
  name: "YieldBot AI",
  status: "Active",
  ownerWalletAddress: OWNER_WALLET,
  executionCapabilities: ["Wallet Management"],
};

const basePolicy = {
  id: "POL-test",
  name: "Trusted Wallet Transfer Policy",
  agentId: agent.id,
  maxTransaction: 50,
  dailyLimit: 200,
  approvalThreshold: 25,
  trustedContracts: [TRUSTED_DESTINATION, TRUSTED_CONTRACT],
  blockedActions: [],
  riskMode: "Balanced",
  status: "Active",
};

function evaluate(request, policy = basePolicy, auditLogs = []) {
  return evaluateAction({
    request: {
      agentId: agent.id,
      actionType: "Transfer",
      amount: 15,
      asset: "CSPR",
      targetType: "Wallet Address",
      target: TRUSTED_DESTINATION,
      walletAddress: EXECUTION_WALLET,
      executionWalletAddress: EXECUTION_WALLET,
      agentOwnerWalletAddress: OWNER_WALLET,
      ...request,
    },
    agents: [agent],
    policies: [policy],
    auditLogs,
  });
}

test("allows a valid policy-approved wallet transfer within limits", () => {
  const result = evaluate({});

  assert.equal(result.decision, "Allowed");
  assert.match(result.policyChecksPassed.join("\n"), /Wallet destination is approved/);
  assert.ok(result.moduleFindings.some((finding) =>
    finding.module === "Wallet Validation" &&
    finding.rule === "Valid execution wallet format" &&
    finding.status === "pass"));
  assert.ok(result.pipelineStages.some((stage) =>
    stage.id === "wallet-validation" && stage.status === "completed"));
});

test("reviews a valid unapproved wallet destination in balanced mode", () => {
  const result = evaluate({ target: UNTRUSTED_DESTINATION });

  assert.equal(result.decision, "Review Required");
  assert.match(result.policyChecksFailed.join("\n"), /approved target list/);
  assert.ok(result.moduleFindings.some((finding) =>
    finding.rule === "Approved wallet destination" && finding.status === "warning"));
});

test("blocks malformed execution-wallet public keys", () => {
  const result = evaluate({
    walletAddress: "execution-wallet",
    executionWalletAddress: "execution-wallet",
  });

  assert.equal(result.decision, "Blocked");
  assert.equal(result.triggeredRule, "Valid execution wallet format");
  assert.ok(result.moduleFindings.some((finding) =>
    finding.rule === "Valid execution wallet format" && finding.status === "fail"));
});

test("blocks malformed wallet destinations", () => {
  const result = evaluate({ target: "unknown-wallet-address" });

  assert.equal(result.decision, "Blocked");
  assert.ok(result.moduleFindings.some((finding) =>
    finding.rule === "Valid wallet destination" && finding.status === "fail"));
});

test("blocks exact self-transfer requests", () => {
  const result = evaluate({ target: EXECUTION_WALLET });

  assert.equal(result.decision, "Blocked");
  assert.ok(result.moduleFindings.some((finding) =>
    finding.rule === "Distinct transfer destination" && finding.status === "fail"));
});

test("blocks Transfer intents that masquerade as contract targets", () => {
  const result = evaluate({
    target: TRUSTED_CONTRACT,
    targetType: "Trusted Contract",
  });

  assert.equal(result.decision, "Blocked");
  assert.ok(result.moduleFindings.some((finding) =>
    finding.rule === "Wallet destination classification" && finding.status === "fail"));
});

test("requires human review above the active wallet threshold", () => {
  const result = evaluate({ amount: 30 });

  assert.equal(result.decision, "Review Required");
  assert.ok(result.moduleFindings.some((finding) =>
    finding.rule === "Wallet human-review threshold" && finding.status === "warning"));
});

test("blocks wallet spending that would exceed the daily limit", () => {
  const today = new Date().toISOString();
  const result = evaluate(
    { amount: 30 },
    { ...basePolicy, approvalThreshold: 100 },
    [{ agentId: agent.id, decision: "Allowed", timestamp: today, amount: 180 }],
  );

  assert.equal(result.decision, "Blocked");
  assert.ok(result.moduleFindings.some((finding) =>
    finding.rule === "Daily wallet spending limit" && finding.status === "fail"));
});

test("blocks wallet transfers when Transfer is blocked by policy", () => {
  const result = evaluate({}, { ...basePolicy, blockedActions: ["Transfer"] });
  assert.equal(result.decision, "Blocked");
});

test("returns deterministic guidance and an adaptive wallet-validation pipeline stage", () => {
  const result = evaluate({ target: UNTRUSTED_DESTINATION, amount: 30 });

  assert.equal(result.decision, "Review Required");
  assert.ok(Array.isArray(result.moduleFindings));
  assert.ok(result.moduleFindings.some((finding) => finding.status === "warning"));
  assert.ok(Array.isArray(result.pipelineStages));
  assert.ok(result.pipelineStages.some((stage) => stage.id === "wallet-validation"));
  assert.ok(result.pipelineStages.some((stage) => stage.id === "risk-assessment"));
  assert.ok(result.primaryReason);
  assert.ok(result.triggeredRule);
  assert.ok(result.suggestedResolution);
});

test("runs deterministic execution preflight without silently claiming stateful simulation", () => {
  const result = evaluate({
    actionType: "Swap",
    targetType: "Trusted Contract",
    target: TRUSTED_CONTRACT,
    amount: 10,
    paymentAmountMotes: "5000000000",
    gasPriceTolerance: 1,
    ttl: "30m",
    transactionTimestamp: new Date().toISOString(),
    slippageBps: 300,
    expectedOutput: 9.8,
    minimumReceived: 9.5,
  });

  assert.ok(result.moduleFindings.some((finding) =>
    finding.module === "Execution Simulation" &&
    finding.rule === "Execution preflight applicability" &&
    finding.status === "pass"));
  assert.ok(result.moduleFindings.some((finding) =>
    finding.module === "Execution Simulation" &&
    finding.rule === "Stateful speculative execution" &&
    finding.status === "unavailable"));
  assert.ok(result.pipelineStages.some((stage) => stage.id === "execution-simulation"));
});

test("blocks revoked agents even outside the authenticated gateway route", () => {
  const result = evaluateAction({
    request: {
      agentId: agent.id,
      actionType: "Transfer",
      amount: 1,
      target: TRUSTED_DESTINATION,
      targetType: "Wallet Address",
      walletAddress: EXECUTION_WALLET,
      executionWalletAddress: EXECUTION_WALLET,
      agentOwnerWalletAddress: OWNER_WALLET,
    },
    agents: [{ ...agent, status: "Revoked" }],
    policies: [basePolicy],
    auditLogs: [],
  });

  assert.equal(result.decision, "Blocked");
  assert.equal(result.moduleFindings[0].rule, "Active agent required");
});
