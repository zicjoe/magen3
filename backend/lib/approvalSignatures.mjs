import {
  createHash,
  createPublicKey,
  createVerify,
  ECDH,
  randomBytes,
  verify as verifySignature,
} from "node:crypto";
import { makeId } from "./ids.mjs";

export const APPROVAL_SIGNATURE_DOMAIN = "magen3.approval-response.v1";
export const DEFAULT_APPROVAL_CHAIN_NAME = "casper-test";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeWallet(value) {
  return clean(value).toLowerCase();
}

function normalizeHex(value) {
  const text = clean(value).replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]+$/.test(text) ? text : "";
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function publicKeyDetails(walletAddress) {
  const normalized = normalizeHex(walletAddress);
  if (normalized.startsWith("01") && normalized.length === 66) {
    return {
      algorithm: "Ed25519",
      tag: "01",
      publicKeyBytes: Buffer.from(normalized.slice(2), "hex"),
      normalizedWallet: normalized,
    };
  }
  if (normalized.startsWith("02") && normalized.length === 68) {
    return {
      algorithm: "Secp256k1",
      tag: "02",
      publicKeyBytes: Buffer.from(normalized.slice(2), "hex"),
      normalizedWallet: normalized,
    };
  }
  const error = new Error("Reviewer wallet must be a Casper Ed25519 or Secp256k1 public key.");
  error.status = 400;
  throw error;
}

function ed25519PublicKeyObject(publicKeyBytes) {
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([spkiPrefix, publicKeyBytes]), format: "der", type: "spki" });
}

function secp256k1PublicKeyObject(publicKeyBytes) {
  let uncompressed;
  try {
    uncompressed = ECDH.convertKey(publicKeyBytes, "secp256k1", undefined, undefined, "uncompressed");
  } catch {
    const error = new Error("Reviewer Secp256k1 public key is malformed.");
    error.status = 400;
    throw error;
  }
  if (uncompressed.length !== 65 || uncompressed[0] !== 4) {
    const error = new Error("Reviewer Secp256k1 public key is malformed.");
    error.status = 400;
    throw error;
  }
  return createPublicKey({
    key: {
      kty: "EC",
      crv: "secp256k1",
      x: base64Url(uncompressed.subarray(1, 33)),
      y: base64Url(uncompressed.subarray(33, 65)),
    },
    format: "jwk",
  });
}

function normalizeSignatureBytes(signatureHex, tag) {
  let normalized = normalizeHex(signatureHex);
  if (!normalized) {
    const error = new Error("A hexadecimal Casper Wallet message signature is required.");
    error.status = 400;
    throw error;
  }
  if (normalized.startsWith(tag) && normalized.length === 130) normalized = normalized.slice(2);
  if (normalized.length % 2 !== 0) {
    const error = new Error("The reviewer signature has an invalid hexadecimal length.");
    error.status = 400;
    throw error;
  }
  return Buffer.from(normalized, "hex");
}

export function buildApprovalChallengeMessage(challenge = {}) {
  const fields = [
    "Magen3 Cryptographic Approval Response",
    "Version: 1",
    `Domain: ${clean(challenge.domain)}`,
    `Chain: ${clean(challenge.chainName)}`,
    `Approval Request ID: ${clean(challenge.approvalRequestId)}`,
    `Audit Record ID: ${clean(challenge.auditLogId)}`,
    `Agent ID: ${clean(challenge.agentId)}`,
    `Approval Binding Hash: ${clean(challenge.approvalBindingHash)}`,
    `Response: ${clean(challenge.response)}`,
    `Reviewer Wallet: ${clean(challenge.reviewerWallet)}`,
    `Nonce: ${clean(challenge.nonce)}`,
    `Issued At: ${clean(challenge.issuedAt)}`,
    `Expires At: ${clean(challenge.expiresAt)}`,
    "",
    "Signing this message records an approval decision only. It does not sign or submit a blockchain transaction.",
  ];
  return fields.join("\n");
}

export function createApprovalSignatureChallenge({ review, input = {}, now = new Date(), chainName = "" }) {
  if (!review) {
    const error = new Error("Approval request not found");
    error.status = 404;
    throw error;
  }
  if (review.reviewStatus !== "Pending") {
    const error = new Error(`Approval request is ${clean(review.reviewStatus).toLowerCase()} and cannot issue a signing challenge.`);
    error.status = 409;
    throw error;
  }
  if (review.reviewContext?.requireCryptographicReviewerSignature !== true) {
    const error = new Error("The active policy does not require a cryptographic reviewer signature for this approval request.");
    error.status = 409;
    throw error;
  }

  const reviewerWallet = clean(input.walletAddress || input.reviewerWallet || input.approverWalletAddress);
  const normalizedReviewer = normalizeWallet(reviewerWallet);
  const eligible = (review.approverWallets || []).some((wallet) => normalizeWallet(wallet) === normalizedReviewer);
  if (!reviewerWallet || !eligible) {
    const error = new Error("Connected wallet is not an authorized approver for this request.");
    error.status = 403;
    throw error;
  }
  publicKeyDetails(reviewerWallet);
  if (review.reviewContext?.separationOfDuties && normalizedReviewer === normalizeWallet(review.requesterWalletAddress)) {
    const error = new Error("Separation of duties prevents the execution wallet from approving its own request.");
    error.status = 403;
    throw error;
  }
  if ((review.responses || []).some((response) => normalizeWallet(response.walletAddress) === normalizedReviewer)) {
    const error = new Error("This approver has already responded to the request.");
    error.status = 409;
    throw error;
  }

  const rawResponse = clean(input.response || input.decision).toLowerCase();
  if (!["approve", "approved", "reject", "rejected"].includes(rawResponse)) {
    const error = new Error("response must be Approve or Reject");
    error.status = 400;
    throw error;
  }
  const response = rawResponse.startsWith("reject") ? "Reject" : "Approve";
  const issued = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(issued.getTime())) {
    const error = new Error("Challenge issue time is invalid.");
    error.status = 400;
    throw error;
  }
  const lifetimeSeconds = boundedInteger(review.reviewContext?.approvalSignatureLifetimeSeconds, 300, 30, 1800);
  const reviewExpiry = new Date(review.expiresAt || 0);
  const challengeExpiryMs = Math.min(
    issued.getTime() + lifetimeSeconds * 1000,
    Number.isNaN(reviewExpiry.getTime()) ? issued.getTime() + lifetimeSeconds * 1000 : reviewExpiry.getTime(),
  );
  if (challengeExpiryMs <= issued.getTime()) {
    const error = new Error("Approval request has expired and cannot issue a signing challenge.");
    error.status = 409;
    throw error;
  }

  const requireDomain = review.reviewContext?.requireApprovalDomainSeparation !== false;
  const requireChain = review.reviewContext?.requireReviewerChainBinding !== false;
  const challenge = {
    id: makeId("APC"),
    approvalRequestId: clean(review.id),
    auditLogId: clean(review.auditLogId),
    agentId: clean(review.agentId),
    approvalBindingHash: clean(review.bindingHash),
    response,
    reviewerWallet,
    nonce: randomBytes(32).toString("hex"),
    issuedAt: issued.toISOString(),
    expiresAt: new Date(challengeExpiryMs).toISOString(),
    domain: requireDomain ? APPROVAL_SIGNATURE_DOMAIN : "Magen3",
    chainName: requireChain ? clean(chainName || process.env.CASPER_NETWORK_NAME || DEFAULT_APPROVAL_CHAIN_NAME) : "",
    status: "Pending",
    usedAt: "",
    signatureHash: "",
    signatureAlgorithm: "",
    signatureVerified: false,
    verificationError: "",
  };
  challenge.message = buildApprovalChallengeMessage(challenge);
  challenge.challengeHash = sha256Hex(challenge.message);
  return challenge;
}

export function expireApprovalSignatureChallenge(challenge, now = new Date()) {
  if (!challenge || challenge.status !== "Pending") return challenge;
  const current = now instanceof Date ? now : new Date(now);
  const expiry = new Date(challenge.expiresAt || 0);
  if (!Number.isNaN(expiry.getTime()) && current.getTime() <= expiry.getTime()) return challenge;
  return {
    ...challenge,
    status: "Expired",
    verificationError: challenge.verificationError || "Challenge expired before signature verification.",
  };
}

export function verifyCasperWalletMessageSignature({ walletAddress, message, signatureHex }) {
  const details = publicKeyDetails(walletAddress);
  const signatureBytes = normalizeSignatureBytes(signatureHex, details.tag);
  const messageBytes = Buffer.from(String(message ?? ""), "utf8");
  let valid = false;

  if (details.algorithm === "Ed25519") {
    if (signatureBytes.length !== 64) {
      const error = new Error("Ed25519 reviewer signatures must contain 64 signature bytes.");
      error.status = 400;
      throw error;
    }
    valid = verifySignature(null, messageBytes, ed25519PublicKeyObject(details.publicKeyBytes), signatureBytes);
  } else {
    const publicKey = secp256k1PublicKeyObject(details.publicKeyBytes);
    if (signatureBytes.length === 64) {
      valid = verifySignature("sha256", messageBytes, { key: publicKey, dsaEncoding: "ieee-p1363" }, signatureBytes);
    } else {
      const verifier = createVerify("sha256");
      verifier.update(messageBytes);
      verifier.end();
      valid = verifier.verify(publicKey, signatureBytes);
    }
  }

  return {
    valid,
    algorithm: details.algorithm,
    normalizedWallet: details.normalizedWallet,
    signatureHash: sha256Hex(signatureBytes),
    messageHash: sha256Hex(messageBytes),
  };
}

export function verifyApprovalSignatureChallenge({ challenge, review, input = {}, now = new Date() }) {
  if (!challenge) {
    const error = new Error("Approval signature challenge not found.");
    error.status = 404;
    throw error;
  }
  const current = expireApprovalSignatureChallenge(challenge, now);
  if (current.status !== "Pending") {
    const error = new Error(`Approval signature challenge is ${clean(current.status).toLowerCase()} and cannot be reused.`);
    error.status = 409;
    throw error;
  }
  if (!review || review.reviewStatus !== "Pending") {
    const error = new Error("Approval request is no longer pending.");
    error.status = 409;
    throw error;
  }

  const walletAddress = clean(input.walletAddress || input.reviewerWallet || input.approverWalletAddress);
  const rawResponse = clean(input.response || input.decision).toLowerCase();
  const response = rawResponse.startsWith("reject") ? "Reject" : rawResponse.startsWith("approve") ? "Approve" : "";
  if (!walletAddress || normalizeWallet(walletAddress) !== normalizeWallet(current.reviewerWallet)) {
    const error = new Error("Reviewer wallet does not match the one-time challenge signer.");
    error.status = 403;
    throw error;
  }
  if (!response || response !== current.response) {
    const error = new Error("Approval response does not match the signed challenge.");
    error.status = 409;
    throw error;
  }
  if (clean(current.approvalRequestId) !== clean(review.id)
    || clean(current.auditLogId) !== clean(review.auditLogId)
    || clean(current.agentId) !== clean(review.agentId)
    || clean(current.approvalBindingHash) !== clean(review.bindingHash)) {
    const error = new Error("Approval challenge binding no longer matches the current approval request.");
    error.status = 409;
    throw error;
  }
  if (review.reviewContext?.requireApprovalDomainSeparation !== false && current.domain !== APPROVAL_SIGNATURE_DOMAIN) {
    const error = new Error("Approval challenge domain separation is invalid.");
    error.status = 409;
    throw error;
  }
  const expectedChain = clean(review.reviewContext?.approvalSignatureChainName || process.env.CASPER_NETWORK_NAME || DEFAULT_APPROVAL_CHAIN_NAME);
  if (review.reviewContext?.requireReviewerChainBinding !== false && current.chainName !== expectedChain) {
    const error = new Error("Approval challenge chain binding is invalid.");
    error.status = 409;
    throw error;
  }
  const message = buildApprovalChallengeMessage(current);
  if (message !== current.message || sha256Hex(message) !== current.challengeHash) {
    const error = new Error("Approval challenge message integrity check failed.");
    error.status = 409;
    throw error;
  }

  const verification = verifyCasperWalletMessageSignature({
    walletAddress,
    message,
    signatureHex: input.signatureHex || input.signature,
  });
  if (!verification.valid) {
    const error = new Error("Casper Wallet reviewer signature verification failed.");
    error.status = 403;
    throw error;
  }

  const verifiedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  return {
    challenge: {
      ...current,
      status: "Used",
      usedAt: verifiedAt,
      signatureHash: verification.signatureHash,
      signatureAlgorithm: verification.algorithm,
      signatureVerified: true,
      verificationError: "",
    },
    verification: {
      verified: true,
      verifiedAt,
      challengeId: current.id,
      challengeHash: current.challengeHash,
      nonceHash: sha256Hex(current.nonce),
      signatureHash: verification.signatureHash,
      signatureAlgorithm: verification.algorithm,
      domain: current.domain,
      chainName: current.chainName,
      reviewerWallet: current.reviewerWallet,
      response: current.response,
    },
  };
}

export function approvalSignatureChallengePublicSummary(challenge) {
  if (!challenge) return null;
  return {
    id: challenge.id,
    approvalRequestId: challenge.approvalRequestId,
    auditLogId: challenge.auditLogId,
    agentId: challenge.agentId,
    approvalBindingHash: challenge.approvalBindingHash,
    response: challenge.response,
    reviewerWallet: challenge.reviewerWallet,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    domain: challenge.domain,
    chainName: challenge.chainName,
    message: challenge.message,
    challengeHash: challenge.challengeHash,
    status: challenge.status,
  };
}
