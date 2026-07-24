import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signMessage } from "node:crypto";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_NETWORK_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

function reviewer() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return {
    walletAddress: `01${der.subarray(der.length - 32).toString("hex")}`,
    sign: (message) => signMessage(null, Buffer.from(message, "utf8"), privateKey).toString("hex"),
  };
}

const EXECUTION = `01${"a".repeat(64)}`;
const DESTINATION = `01${"b".repeat(64)}`;

async function fixture() {
  const treasuryOne = reviewer();
  const treasuryTwo = reviewer();
  const security = reviewer();
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Organizational Approval Agent",
    type: "Treasury Agent",
    purpose: "Organizational quorum integration",
    permissionLevel: "Full Execution with Review",
    walletAddress: treasuryOne.walletAddress,
    executionCapabilities: ["Treasury Operations", "Wallet Management"],
  });
  await store.createPolicy({
    name: "Organizational Approval Policy",
    agentId: agent.id,
    walletAddress: treasuryOne.walletAddress,
    maxTransaction: 100,
    dailyLimit: 1000,
    approvalThreshold: 20,
    trustedContracts: [DESTINATION],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Quorum",
      approvalRequiredCount: 1,
      approvalApproverWallets: [],
      approvalAllowOwnerFallback: false,
      approvalExpiryMinutes: 60,
      approvalRequireRejectComment: true,
      requireCryptographicReviewerSignature: true,
      approvalSignatureLifetimeSeconds: 300,
      requireReviewerChainBinding: true,
      requireApprovalDomainSeparation: true,
      approvalSignatureChainName: "casper-test",
      approvalOrganizationalQuorumEnabled: true,
      approvalGroups: [
        { id: "treasury", name: "Treasury", role: "Treasury Approver", wallets: [treasuryOne.walletAddress, treasuryTwo.walletAddress] },
        { id: "security", name: "Security", role: "Security Approver", wallets: [security.walletAddress] },
      ],
      approvalTiers: [{
        id: "high-value",
        name: "High Value Treasury",
        priority: 10,
        minAmount: 25,
        actions: ["Transfer"],
        capabilities: ["Treasury Operations"],
        requiredGroups: [{ groupId: "treasury", approvals: 2 }, { groupId: "security", approvals: 1 }],
        requiredApprovals: 3,
        executionDelaySeconds: 0,
        executionWindowSeconds: 1800,
      }],
    },
  });
  return { store, agent, reviewers: [treasuryOne, treasuryTwo, security] };
}

async function signedApprove(store, approvalId, signer) {
  const issued = await store.createApprovalChallenge(approvalId, { walletAddress: signer.walletAddress, response: "Approve" });
  return store.respondApproval(approvalId, {
    walletAddress: signer.walletAddress,
    response: "Approve",
    challengeId: issued.challenge.id,
    signatureHex: signer.sign(issued.challenge.message),
  });
}

test("Gateway resolves tier, enforces group quorum, and permits execution only after all groups approve", async () => {
  const { store, agent, reviewers } = await fixture();
  const response = await store.submitAgentGatewayIntent({
    source: "organizational-approval-test",
    agentId: agent.id,
    executionWalletAddress: EXECUTION,
    action: { type: "Transfer", amount: 30, asset: "CSPR", target: DESTINATION, targetType: "Wallet Address" },
  }, { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Review Required");
  assert.equal(response.approval.resolvedTier.id, "high-value");
  assert.equal(response.approval.requiredApprovals, 3);
  assert.equal(response.approval.groupProgress.length, 2);
  assert.ok(response.auditLog.moduleFindings.some((finding) => finding.rule === "Organizational approval quorum"));

  const one = await signedApprove(store, response.approval.id, reviewers[0]);
  assert.equal(one.approval.reviewStatus, "Pending");
  const two = await signedApprove(store, response.approval.id, reviewers[1]);
  assert.equal(two.approval.reviewStatus, "Pending");
  assert.equal(two.approval.groupProgress.find((group) => group.groupId === "treasury").satisfied, true);
  await assert.rejects(() => store.confirmExecutionDeploy(response.auditLog.id, { deployHash: "c".repeat(64), signedBy: EXECUTION }), /completed approval quorum/i);

  const three = await signedApprove(store, response.approval.id, reviewers[2]);
  assert.equal(three.approval.reviewStatus, "Approved");
  assert.equal(three.approval.organizationalQuorum.satisfied, true);
  assert.equal(three.approval.mayProceedToSigning, true);
  assert.equal(three.auditLog.approvalReceivedCount, 3);
  assert.ok(three.auditLog.moduleFindings.some((finding) => finding.rule === "Organizational approval quorum" && finding.status === "pass"));

  const execution = await store.confirmExecutionDeploy(response.auditLog.id, { deployHash: "d".repeat(64), signedBy: EXECUTION });
  assert.equal(execution.auditLog.executionStatus, "executed");
});
