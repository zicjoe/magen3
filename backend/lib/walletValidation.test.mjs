import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCasperWalletIdentifier,
  exactWalletIdentifierMatch,
  isWalletDestinationIntent,
  evaluateWalletValidation,
} from "./walletValidation.mjs";

const ED25519 = `01${"a".repeat(64)}`;
const SECP256K1 = `02${"b".repeat(66)}`;
const ACCOUNT_HASH = `account-hash-${"c".repeat(64)}`;

test("classifies supported Casper wallet identifier formats deterministically", () => {
  assert.deepEqual(
    {
      valid: classifyCasperWalletIdentifier(ED25519).valid,
      kind: classifyCasperWalletIdentifier(ED25519).kind,
    },
    { valid: true, kind: "ed25519-public-key" },
  );
  assert.equal(classifyCasperWalletIdentifier(SECP256K1).kind, "secp256k1-public-key");
  assert.equal(classifyCasperWalletIdentifier(ACCOUNT_HASH).kind, "account-hash");
});

test("execution wallets reject account hashes because a signing public key is required", () => {
  const result = classifyCasperWalletIdentifier(ACCOUNT_HASH, { allowAccountHash: false });
  assert.equal(result.valid, false);
  assert.equal(result.kind, "invalid");
});

test("rejects malformed or unsupported wallet identifiers", () => {
  assert.equal(classifyCasperWalletIdentifier("").kind, "missing");
  assert.equal(classifyCasperWalletIdentifier("01abc").valid, false);
  assert.equal(classifyCasperWalletIdentifier(`03${"d".repeat(64)}`).valid, false);
});

test("normalizes casing for exact submitted-identifier comparisons", () => {
  assert.equal(exactWalletIdentifierMatch(ED25519.toUpperCase(), ED25519), true);
  assert.equal(exactWalletIdentifierMatch(ED25519, SECP256K1), false);
});

test("treats Transfer as wallet-destination validation even when targetType is wrong", () => {
  assert.equal(isWalletDestinationIntent({ actionType: "Transfer", targetType: "Trusted Contract" }), true);
  assert.equal(isWalletDestinationIntent({ actionType: "Swap", targetType: "Wallet Address" }), true);
  assert.equal(isWalletDestinationIntent({ actionType: "Swap", targetType: "Trusted Contract" }), false);
});


test("accepts an EVM execution wallet only for explicit EVM token-permission metadata", () => {
  const evm = "0x1111111111111111111111111111111111111111";
  const tokenIntent = evaluateWalletValidation({
    request: {
      actionType: "Token Approval",
      targetType: "Token Contract",
      executionWalletAddress: evm,
      tokenPermission: { network: "eip155:1" },
    },
    policy: {},
  });
  const genericIntent = evaluateWalletValidation({
    request: {
      actionType: "Contract Interaction",
      targetType: "Unknown Contract",
      executionWalletAddress: evm,
    },
    policy: {},
  });
  assert.equal(tokenIntent.hardBlock, false);
  assert.ok(tokenIntent.findings.some((item) => item.rule === "Valid execution wallet format" && item.status === "pass"));
  assert.equal(genericIntent.hardBlock, true);
});
