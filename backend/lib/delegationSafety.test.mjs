import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { buildDelegationAttestationHash, buildDelegationAttestationMessage, evaluateDelegationSafety } from "./delegationSafety.mjs";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPublicKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const WALLET = `01${rawPublicKey}`;
const DELEGATE = `01${"2".repeat(64)}`;
const TARGET = `01${"3".repeat(64)}`;
const NOW = new Date("2026-07-25T00:00:00.000Z");

function policy(overrides = {}) {
  return { id: "POL-DELEGATION", structuredRules: {
    delegationControlsEnabled: true,
    delegationMode: "Review",
    requireExpiringDelegation: true,
    maximumDelegationLifetime: 3600,
    maximumDelegationDepth: 1,
    allowRedelegation: false,
    approvedDelegates: [DELEGATE],
    blockedDelegates: [],
    revokedDelegationIds: [],
    unknownDelegateAction: "Review",
    requireScopeBinding: true,
    requireCryptographicDelegationAttestation: true,
    delegationUnavailableAction: "Review",
    ...overrides,
  }};
}
function unsigned(overrides = {}) {
  return {
    domain: "magen3.delegation.v1",
    chainName: "casper-test",
    delegationId: "dlg-test-001",
    agentId: "AGT-DELEGATION",
    delegatingWallet: WALLET,
    delegate: DELEGATE,
    sessionKey: DELEGATE,
    allowedNetworks: ["casper-test"],
    allowedContracts: [],
    allowedMethods: ["Transfer"],
    allowedAssets: ["CSPR"],
    nativeAmountLimit: 25,
    tokenAmountLimits: {},
    maxTransactionAmount: 25,
    maxFrequency: 3,
    validFrom: "2026-07-24T23:55:00.000Z",
    expiresAt: "2026-07-25T00:55:00.000Z",
    revocationStatus: "Active",
    delegationDepth: 0,
    redelegationAllowed: false,
    nonce: "nonce-delegation-001",
    ...overrides,
  };
}
function request(overrides = {}, attestationOverrides = {}) {
  const attestation = unsigned(attestationOverrides);
  const message = buildDelegationAttestationMessage(attestation);
  const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("hex");
  return {
    agentId: attestation.agentId,
    actionType: "Transfer",
    amount: 10,
    asset: "CSPR",
    target: TARGET,
    targetType: "Wallet Address",
    chainName: "casper-test",
    executionWalletAddress: WALLET,
    delegationMetadataSupplied: true,
    delegationId: attestation.delegationId,
    delegationDelegatingWallet: attestation.delegatingWallet,
    delegationDelegate: attestation.delegate,
    delegationSessionKey: attestation.sessionKey,
    delegationAllowedNetworks: attestation.allowedNetworks,
    delegationAllowedContracts: attestation.allowedContracts,
    delegationAllowedMethods: attestation.allowedMethods,
    delegationAllowedAssets: attestation.allowedAssets,
    delegationNativeAmountLimit: attestation.nativeAmountLimit,
    delegationTokenAmountLimits: attestation.tokenAmountLimits,
    delegationMaxTransactionAmount: attestation.maxTransactionAmount,
    delegationMaxFrequency: attestation.maxFrequency,
    delegationValidFrom: attestation.validFrom,
    delegationExpiresAt: attestation.expiresAt,
    delegationRevocationStatus: attestation.revocationStatus,
    delegationDepth: attestation.delegationDepth,
    delegationRedelegationAllowed: attestation.redelegationAllowed,
    delegationNonce: attestation.nonce,
    delegationChainName: attestation.chainName,
    delegationAttestationHash: buildDelegationAttestationHash(attestation),
    delegationAttestationSignature: signature,
    ...overrides,
  };
}

function evaluate(req, pol = policy(), auditLogs = []) {
  return evaluateDelegationSafety({ request: req, policy: pol, agent: { id: "AGT-DELEGATION", executionCapabilities: ["Wallet Management"] }, auditLogs, now: NOW });
}

test("allows valid signed scoped delegation", () => {
  const result = evaluate(request());
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.signatureVerified, true);
  assert.match(result.context.signatureHash, /^[0-9a-f]{64}$/);
});

test("expired delegation blocks", () => {
  const result = evaluate(request({}, { expiresAt: "2026-07-24T23:59:00.000Z" }));
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Delegation expiration"));
});

test("revoked delegation blocks", () => {
  const result = evaluate(request(), policy({ revokedDelegationIds: ["dlg-test-001"] }));
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Delegation revocation"));
});

test("method outside scope blocks", () => {
  const result = evaluate(request({ actionType: "Stake" }, { allowedMethods: ["Transfer"] }));
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Delegated method scope"));
});

test("amount outside delegated limit blocks", () => {
  const result = evaluate(request({ amount: 30 }));
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Delegated transaction amount"));
});

test("redelegation violation blocks", () => {
  const result = evaluate(request({}, { redelegationAllowed: true }));
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Redelegation restriction"));
});

test("invalid signature blocks", () => {
  const req = request();
  req.delegationAttestationSignature = "00".repeat(64);
  const result = evaluate(req);
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Cryptographic delegation attestation"));
});

test("missing signature follows unavailable review behavior", () => {
  const result = evaluate(request({ delegationAttestationSignature: "" }));
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
});

test("frequency limit blocks after matching historical uses", () => {
  const auditLogs = [0, 1, 2].map((index) => ({ agentId: "AGT-DELEGATION", decision: "Allowed", timestamp: new Date(NOW.getTime() - (index + 1) * 60_000).toISOString(), originalIntent: { delegation: { delegationId: "dlg-test-001" } } }));
  const result = evaluate(request(), policy(), auditLogs);
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Delegated frequency limit"));
});

test("legacy policy remains backward compatible", () => {
  const result = evaluateDelegationSafety({ request: { actionType: "Transfer", amount: 1 }, policy: { structuredRules: {} } });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.every((item) => item.status === "skipped"));
});
