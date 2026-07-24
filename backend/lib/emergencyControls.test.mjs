import assert from "node:assert/strict";
import test from "node:test";
import {
  activeEmergencyPauses,
  detectAutomaticEmergencyTrigger,
  emergencyPauseMatches,
  evaluateEmergencyControls,
  normalizeEmergencyAction,
  normalizeEmergencyScope,
} from "./emergencyControls.mjs";

const OWNER = `01${"1".repeat(64)}`;
const agent = { id: "MAG-AGENT-1", ownerWalletAddress: OWNER, executionCapabilities: ["Trading", "dApp Interactions"] };
const policy = { id: "POL-1", structuredRules: {} };
const request = { agentId: agent.id, actionType: "Swap", targetType: "Trusted Contract", amount: 10 };

function pause(overrides = {}) {
  return {
    id: "PAUSE-1",
    ownerWalletAddress: OWNER,
    scopeType: "Agent",
    scopeValue: agent.id,
    agentId: agent.id,
    policyId: "",
    enforcementAction: "Blocked",
    reason: "Security investigation",
    triggerType: "Manual",
    status: "Active",
    createdAt: "2026-07-24T10:00:00.000Z",
    expiresAt: "2026-07-24T12:00:00.000Z",
    ...overrides,
  };
}

test("normalizes supported pause scopes and enforcement actions", () => {
  assert.equal(normalizeEmergencyScope("all outgoing execution"), "All Execution");
  assert.equal(normalizeEmergencyScope("machine payment"), "x402");
  assert.equal(normalizeEmergencyAction("review"), "Review Required");
});

test("matches agent, capability, action, policy, trading, contract, bridge and x402 scopes", () => {
  const now = new Date("2026-07-24T11:00:00.000Z");
  assert.equal(emergencyPauseMatches({ pause: pause(), request, agent, policy, now }), true);
  assert.equal(emergencyPauseMatches({ pause: pause({ scopeType: "Capability", scopeValue: "Trading" }), request, agent, policy, now }), true);
  assert.equal(emergencyPauseMatches({ pause: pause({ scopeType: "Action", scopeValue: "Swap" }), request, agent, policy, now }), true);
  assert.equal(emergencyPauseMatches({ pause: pause({ scopeType: "Policy", scopeValue: policy.id, policyId: policy.id }), request, agent, policy, now }), true);
  assert.equal(emergencyPauseMatches({ pause: pause({ scopeType: "Trading", scopeValue: "Trading" }), request, agent, policy, now }), true);
  assert.equal(emergencyPauseMatches({ pause: pause({ scopeType: "Contract", scopeValue: "Contract" }), request, agent, policy, now }), true);
  assert.equal(emergencyPauseMatches({ pause: pause({ scopeType: "Bridge", scopeValue: "Bridge" }), request: { ...request, actionType: "Bridge" }, agent, policy, now }), true);
  assert.equal(emergencyPauseMatches({ pause: pause({ scopeType: "x402", scopeValue: "x402" }), request: { ...request, actionType: "x402 Payment" }, agent, policy, now }), true);
});

test("ignores expired and unrelated pauses", () => {
  const now = new Date("2026-07-24T13:00:00.000Z");
  assert.equal(activeEmergencyPauses({ pauses: [pause()], request, agent, policy, now }).length, 0);
  assert.equal(emergencyPauseMatches({ pause: pause({ scopeType: "Action", scopeValue: "Transfer", expiresAt: "" }), request, agent, policy, now }), false);
});

test("blocked pauses take precedence over review pauses", () => {
  const now = new Date("2026-07-24T11:00:00.000Z");
  const result = evaluateEmergencyControls({
    request,
    agent,
    policy,
    pauses: [pause({ id: "P-REVIEW", enforcementAction: "Review Required" }), pause({ id: "P-BLOCK", scopeType: "Trading" })],
    now,
  });
  assert.equal(result.hardBlock, true);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.matchingPauses.length, 2);
  assert.equal(result.findings[0].rule, "Active emergency pause");
});

test("review pauses produce Review Required without a hard block", () => {
  const result = evaluateEmergencyControls({
    request,
    agent,
    policy,
    pauses: [pause({ enforcementAction: "Review Required", expiresAt: "" })],
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.findings[0].status, "warning");
});

test("automatic trigger detection is disabled by default", () => {
  const trigger = detectAutomaticEmergencyTrigger({ request, agent, policy, auditLogs: [], result: { decision: "Blocked", moduleFindings: [] } });
  assert.equal(trigger, null);
});

test("detects replay, threat, privileged action and repeated-block triggers deterministically", () => {
  const automaticPolicy = {
    id: policy.id,
    structuredRules: {
      emergencyControlsEnabled: true,
      automaticPauseEnabled: true,
      emergencyReplayAttemptThreshold: 1,
      emergencyRepeatedBlockThreshold: 2,
      emergencyPauseDurationSeconds: 600,
    },
  };
  const replay = detectAutomaticEmergencyTrigger({
    request,
    agent,
    policy: automaticPolicy,
    auditLogs: [],
    result: { decision: "Blocked", moduleFindings: [{ module: "Execution Integrity", status: "fail", rule: "Intent ID replay prevention", message: "Replay detected" }] },
  });
  assert.equal(replay.triggerRule, "Replay-attempt threshold");
  assert.equal(replay.scopeType, "Agent");

  const threat = detectAutomaticEmergencyTrigger({
    request,
    agent,
    policy: automaticPolicy,
    auditLogs: [],
    result: { decision: "Blocked", moduleFindings: [{ module: "Threat Intelligence", status: "fail", rule: "Threat match", message: "Blocked indicator" }] },
  });
  assert.equal(threat.triggerRule, "Threat-intelligence hard match");

  const privileged = detectAutomaticEmergencyTrigger({
    request,
    agent,
    policy: automaticPolicy,
    auditLogs: [],
    result: { decision: "Blocked", moduleFindings: [{ module: "Privileged Action Controls", status: "fail", rule: "Blocked privileged action", message: "Blocked" }] },
  });
  assert.equal(privileged.scopeType, "Contract");

  const prior = [{ agentId: agent.id, decision: "Blocked", timestamp: new Date().toISOString(), moduleFindings: [] }];
  const repeated = detectAutomaticEmergencyTrigger({ request, agent, policy: automaticPolicy, auditLogs: prior, result: { decision: "Blocked", moduleFindings: [] } });
  assert.equal(repeated.triggerRule, "Repeated blocked attempts");
});
