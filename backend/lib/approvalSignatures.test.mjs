import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as signMessage, ECDH } from "node:crypto";
import test from "node:test";
import {
  APPROVAL_SIGNATURE_DOMAIN,
  createApprovalSignatureChallenge,
  verifyApprovalSignatureChallenge,
  verifyCasperWalletMessageSignature,
} from "./approvalSignatures.mjs";

function edSigner() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const walletAddress = `01${der.subarray(der.length - 32).toString("hex")}`;
  return {
    walletAddress,
    sign: (message) => signMessage(null, Buffer.from(message, "utf8"), privateKey).toString("hex"),
  };
}

function secpSigner() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  const compressed = ECDH.convertKey(Buffer.concat([Buffer.from([4]), x, y]), "secp256k1", undefined, undefined, "compressed");
  return {
    walletAddress: `02${compressed.toString("hex")}`,
    sign: (message) => signMessage("sha256", Buffer.from(message, "utf8"), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex"),
  };
}

function reviewFor(walletAddress, overrides = {}) {
  return {
    id: "APR_TEST",
    auditLogId: "AUD_TEST",
    agentId: "AGT_TEST",
    bindingHash: createHash("sha256").update("exact intent").digest("hex"),
    reviewStatus: "Pending",
    requesterWalletAddress: "01" + "33".repeat(32),
    approverWallets: [walletAddress],
    responses: [],
    expiresAt: "2026-07-24T13:00:00.000Z",
    reviewContext: {
      requireCryptographicReviewerSignature: true,
      approvalSignatureLifetimeSeconds: 300,
      requireReviewerChainBinding: true,
      requireApprovalDomainSeparation: true,
      approvalSignatureChainName: "casper-test",
    },
    ...overrides,
  };
}

const now = new Date("2026-07-24T12:00:00.000Z");

test("verifies Ed25519 Casper Wallet message signatures", () => {
  const signer = edSigner();
  const message = "Magen3 exact challenge bytes\n";
  const result = verifyCasperWalletMessageSignature({ walletAddress: signer.walletAddress, message, signatureHex: signer.sign(message) });
  assert.equal(result.valid, true);
  assert.equal(result.algorithm, "Ed25519");
});

test("verifies Secp256k1 Casper Wallet message signatures", () => {
  const signer = secpSigner();
  const message = "Magen3 exact challenge bytes";
  const result = verifyCasperWalletMessageSignature({ walletAddress: signer.walletAddress, message, signatureHex: signer.sign(message) });
  assert.equal(result.valid, true);
  assert.equal(result.algorithm, "Secp256k1");
});

test("creates and verifies an exact-bound one-time challenge", () => {
  const signer = edSigner();
  const review = reviewFor(signer.walletAddress);
  const challenge = createApprovalSignatureChallenge({ review, input: { walletAddress: signer.walletAddress, response: "Approve" }, now });
  assert.equal(challenge.domain, APPROVAL_SIGNATURE_DOMAIN);
  assert.equal(challenge.chainName, "casper-test");
  const result = verifyApprovalSignatureChallenge({
    challenge,
    review,
    input: { walletAddress: signer.walletAddress, response: "Approve", signatureHex: signer.sign(challenge.message) },
    now: new Date("2026-07-24T12:01:00.000Z"),
  });
  assert.equal(result.challenge.status, "Used");
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.signatureAlgorithm, "Ed25519");
  assert.ok(result.verification.signatureHash);
  assert.ok(result.verification.nonceHash);
});

test("rejects a response changed after the challenge was issued", () => {
  const signer = edSigner();
  const review = reviewFor(signer.walletAddress);
  const challenge = createApprovalSignatureChallenge({ review, input: { walletAddress: signer.walletAddress, response: "Approve" }, now });
  assert.throws(() => verifyApprovalSignatureChallenge({
    challenge,
    review,
    input: { walletAddress: signer.walletAddress, response: "Reject", signatureHex: signer.sign(challenge.message) },
    now,
  }), /does not match the signed challenge/);
});

test("rejects a wrong signer", () => {
  const signer = edSigner();
  const attacker = edSigner();
  const review = reviewFor(signer.walletAddress);
  const challenge = createApprovalSignatureChallenge({ review, input: { walletAddress: signer.walletAddress, response: "Approve" }, now });
  assert.throws(() => verifyApprovalSignatureChallenge({
    challenge,
    review,
    input: { walletAddress: signer.walletAddress, response: "Approve", signatureHex: attacker.sign(challenge.message) },
    now,
  }), /verification failed/);
});

test("rejects expired challenges", () => {
  const signer = edSigner();
  const review = reviewFor(signer.walletAddress);
  const challenge = createApprovalSignatureChallenge({ review, input: { walletAddress: signer.walletAddress, response: "Approve" }, now });
  assert.throws(() => verifyApprovalSignatureChallenge({
    challenge,
    review,
    input: { walletAddress: signer.walletAddress, response: "Approve", signatureHex: signer.sign(challenge.message) },
    now: new Date("2026-07-24T12:10:00.000Z"),
  }), /expired/);
});

test("rejects replay of a used challenge", () => {
  const signer = edSigner();
  const review = reviewFor(signer.walletAddress);
  const challenge = createApprovalSignatureChallenge({ review, input: { walletAddress: signer.walletAddress, response: "Approve" }, now });
  const used = verifyApprovalSignatureChallenge({ challenge, review, input: { walletAddress: signer.walletAddress, response: "Approve", signatureHex: signer.sign(challenge.message) }, now }).challenge;
  assert.throws(() => verifyApprovalSignatureChallenge({
    challenge: used,
    review,
    input: { walletAddress: signer.walletAddress, response: "Approve", signatureHex: signer.sign(challenge.message) },
    now,
  }), /cannot be reused/);
});

test("rejects an approval binding changed after challenge creation", () => {
  const signer = edSigner();
  const review = reviewFor(signer.walletAddress);
  const challenge = createApprovalSignatureChallenge({ review, input: { walletAddress: signer.walletAddress, response: "Approve" }, now });
  assert.throws(() => verifyApprovalSignatureChallenge({
    challenge,
    review: { ...review, bindingHash: "ff".repeat(32) },
    input: { walletAddress: signer.walletAddress, response: "Approve", signatureHex: signer.sign(challenge.message) },
    now,
  }), /binding no longer matches/);
});
