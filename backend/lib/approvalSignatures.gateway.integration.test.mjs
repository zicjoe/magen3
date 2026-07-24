import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signMessage } from "node:crypto";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_NETWORK_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

function edSigner() {
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
  const reviewer = edSigner();
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Signed Approval Agent",
    type: "Treasury Agent",
    purpose: "Cryptographic reviewer signature integration",
    permissionLevel: "Full Execution with Review",
    walletAddress: reviewer.walletAddress,
    executionCapabilities: ["Treasury Operations", "Wallet Management"],
  });
  await store.createPolicy({
    name: "Signed Approval Policy",
    agentId: agent.id,
    walletAddress: reviewer.walletAddress,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 20,
    trustedContracts: [DESTINATION],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Single",
      approvalRequiredCount: 1,
      approvalApproverWallets: [reviewer.walletAddress],
      approvalAllowOwnerFallback: false,
      approvalExpiryMinutes: 60,
      approvalRequireRejectComment: true,
      requireCryptographicReviewerSignature: true,
      approvalSignatureLifetimeSeconds: 300,
      requireReviewerChainBinding: true,
      requireApprovalDomainSeparation: true,
      approvalSignatureChainName: "casper-test",
    },
  });
  return { store, agent, reviewer };
}

async function requestReview(store, agent) {
  return store.submitAgentGatewayIntent({
    source: "signed-approval-test",
    agentId: agent.id,
    executionWalletAddress: EXECUTION,
    action: { type: "Transfer", amount: 30, asset: "CSPR", target: DESTINATION, targetType: "Wallet Address" },
  }, { apiKey: agent.apiKey });
}

test("signed reviewer response is verified, counted toward quorum, and stored as hash evidence", async () => {
  const { store, agent, reviewer } = await fixture();
  const response = await requestReview(store, agent);
  assert.equal(response.approval.signatureRequired, true);
  assert.equal(response.approval.approvalsReceived, 0);

  await assert.rejects(
    () => store.respondApproval(response.approval.id, { walletAddress: reviewer.walletAddress, response: "Approve" }),
    /one-time approval signature challenge/i,
  );

  const issued = await store.createApprovalChallenge(response.approval.id, { walletAddress: reviewer.walletAddress, response: "Approve" });
  assert.equal(issued.challenge.status, "Pending");
  assert.match(issued.challenge.message, /Magen3 Cryptographic Approval Response/);

  const signed = await store.respondApproval(response.approval.id, {
    walletAddress: reviewer.walletAddress,
    response: "Approve",
    challengeId: issued.challenge.id,
    signatureHex: reviewer.sign(issued.challenge.message),
  });
  assert.equal(signed.approval.reviewStatus, "Approved");
  assert.equal(signed.approval.verifiedApprovalsReceived, 1);
  assert.equal(signed.approval.mayProceedToSigning, true);
  assert.equal(signed.approval.responses[0].signatureVerified, true);
  assert.equal(signed.approval.responses[0].signatureAlgorithm, "Ed25519");
  assert.match(signed.approval.responses[0].signatureHash, /^[a-f0-9]{64}$/);
  assert.equal("signatureHex" in signed.approval.responses[0], false);
});

test("one-time challenge cannot be replayed or used for a changed response", async () => {
  const { store, agent, reviewer } = await fixture();
  const response = await requestReview(store, agent);
  const issued = await store.createApprovalChallenge(response.approval.id, { walletAddress: reviewer.walletAddress, response: "Approve" });
  await assert.rejects(
    () => store.respondApproval(response.approval.id, {
      walletAddress: reviewer.walletAddress,
      response: "Reject",
      comment: "Changed response",
      challengeId: issued.challenge.id,
      signatureHex: reviewer.sign(issued.challenge.message),
    }),
    /does not match the signed challenge/i,
  );
  const approved = await store.respondApproval(response.approval.id, {
    walletAddress: reviewer.walletAddress,
    response: "Approve",
    challengeId: issued.challenge.id,
    signatureHex: reviewer.sign(issued.challenge.message),
  });
  assert.equal(approved.approval.reviewStatus, "Approved");
  await assert.rejects(
    () => store.respondApproval(response.approval.id, {
      walletAddress: reviewer.walletAddress,
      response: "Approve",
      challengeId: issued.challenge.id,
      signatureHex: reviewer.sign(issued.challenge.message),
    }),
    /cannot accept another response|already used|already responded|cannot be reused/i,
  );
});
