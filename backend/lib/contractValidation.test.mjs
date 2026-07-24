import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCasperContractIdentifier,
  evaluateContractValidation,
  isContractIntent,
} from "./contractValidation.mjs";

const CONTRACT_HASH = `contract-${"a".repeat(64)}`;
const PACKAGE_HASH = `contract-package-${"b".repeat(64)}`;
const UNAPPROVED_CONTRACT = `contract-${"c".repeat(64)}`;
const BLOCKED_CONTRACT = `contract-package-${"d".repeat(64)}`;
const EXECUTION_WALLET = `01${"e".repeat(64)}`;

const basePolicy = {
  riskMode: "Balanced",
  trustedContracts: [CONTRACT_HASH, PACKAGE_HASH],
  structuredRules: {
    blockedContracts: [BLOCKED_CONTRACT],
    allowedEntryPoints: ["call", "swap", "deposit"],
  },
};

function request(overrides = {}) {
  return {
    actionType: "Contract Interaction",
    target: CONTRACT_HASH,
    targetType: "Trusted Contract",
    contractIdentifierType: "Contract Hash",
    entryPoint: "call",
    contractVersion: null,
    chainName: "casper-test",
    ...overrides,
  };
}

test("classifies explicit Casper Contract Hash and Package Hash formats", () => {
  const contract = classifyCasperContractIdentifier(CONTRACT_HASH);
  const pkg = classifyCasperContractIdentifier(PACKAGE_HASH);

  assert.equal(contract.valid, true);
  assert.equal(contract.kind, "contract-hash");
  assert.equal(pkg.valid, true);
  assert.equal(pkg.kind, "package-hash");
});

test("rejects wallet identifiers and ambiguous generic hashes as contract identities", () => {
  const wallet = classifyCasperContractIdentifier(EXECUTION_WALLET);
  const ambiguous = classifyCasperContractIdentifier(`hash-${"f".repeat(64)}`);
  const explicit = classifyCasperContractIdentifier(`hash-${"f".repeat(64)}`, "Package Hash");

  assert.equal(wallet.valid, false);
  assert.equal(wallet.kind, "wallet-public-key");
  assert.equal(ambiguous.valid, false);
  assert.equal(ambiguous.kind, "ambiguous-hash");
  assert.equal(explicit.valid, true);
  assert.equal(explicit.kind, "package-hash");
});

test("detects contract intents from action or target classification", () => {
  assert.equal(isContractIntent({ actionType: "Contract Interaction", targetType: "Wallet Address" }), true);
  assert.equal(isContractIntent({ actionType: "Transfer", targetType: "Unknown Contract" }), true);
  assert.equal(isContractIntent({ actionType: "Transfer", targetType: "Wallet Address" }), false);
});

test("allows an approved contract with valid metadata", () => {
  const result = evaluateContractValidation({ request: request(), policy: basePolicy });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.approved, true);
  assert.ok(result.findings.some((finding) => finding.rule === "Approved contract" && finding.status === "pass"));
  assert.ok(result.findings.some((finding) => finding.rule === "Allowed contract entry points" && finding.status === "pass"));
});

test("target labels never grant trust to an unapproved contract", () => {
  const result = evaluateContractValidation({
    request: request({ target: UNAPPROVED_CONTRACT, targetType: "Trusted Contract" }),
    policy: basePolicy,
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.approved, false);
  assert.ok(result.findings.some((finding) => finding.rule === "Approved contract" && finding.status === "warning"));
});

test("blocks an unapproved contract in Conservative mode", () => {
  const result = evaluateContractValidation({
    request: request({ target: UNAPPROVED_CONTRACT, targetType: "Unknown Contract" }),
    policy: { ...basePolicy, riskMode: "Conservative" },
  });

  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((finding) => finding.rule === "Approved contract" && finding.status === "fail"));
});

test("blocks malformed contract targets and wallet masquerading as contracts", () => {
  const malformed = evaluateContractValidation({ request: request({ target: "CONTRACT_HASH" }), policy: basePolicy });
  const wallet = evaluateContractValidation({ request: request({ target: EXECUTION_WALLET }), policy: basePolicy });

  assert.equal(malformed.hardBlock, true);
  assert.equal(wallet.hardBlock, true);
  assert.ok(wallet.findings.some((finding) => finding.rule === "Valid Casper contract identifier" && finding.status === "fail"));
});

test("blocks contract calls with an incorrect target classification", () => {
  const result = evaluateContractValidation({
    request: request({ targetType: "Wallet Address" }),
    policy: basePolicy,
  });

  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((finding) => finding.rule === "Contract target classification" && finding.status === "fail"));
});

test("blocks missing or malformed entry points", () => {
  const missing = evaluateContractValidation({ request: request({ entryPoint: "" }), policy: basePolicy });
  const malformed = evaluateContractValidation({ request: request({ entryPoint: "not valid()" }), policy: basePolicy });

  assert.equal(missing.hardBlock, true);
  assert.equal(malformed.hardBlock, true);
  assert.ok(missing.findings.some((finding) => finding.rule === "Valid contract entry point" && finding.status === "fail"));
});

test("enforces blocked-contract and entry-point policy controls", () => {
  const blockedContract = evaluateContractValidation({
    request: request({ target: BLOCKED_CONTRACT, contractIdentifierType: "Package Hash" }),
    policy: basePolicy,
  });
  const blockedEntryPoint = evaluateContractValidation({
    request: request({ entryPoint: "upgrade" }),
    policy: basePolicy,
  });

  assert.equal(blockedContract.hardBlock, true);
  assert.equal(blockedEntryPoint.hardBlock, true);
  assert.ok(blockedContract.findings.some((finding) => finding.rule === "Blocked contract" && finding.status === "fail"));
  assert.ok(blockedEntryPoint.findings.some((finding) => finding.rule === "Allowed contract entry points" && finding.status === "fail"));
});

test("enforces Casper network and package-version semantics", () => {
  const wrongNetwork = evaluateContractValidation({ request: request({ chainName: "casper" }), policy: basePolicy });
  const invalidContractVersion = evaluateContractValidation({ request: request({ contractVersion: 2 }), policy: basePolicy });
  const validPackageVersion = evaluateContractValidation({
    request: request({ target: PACKAGE_HASH, contractIdentifierType: "Package Hash", contractVersion: 2 }),
    policy: basePolicy,
  });
  const invalidPackageVersion = evaluateContractValidation({
    request: request({ target: PACKAGE_HASH, contractIdentifierType: "Package Hash", contractVersion: 0 }),
    policy: basePolicy,
  });

  assert.equal(wrongNetwork.hardBlock, true);
  assert.equal(invalidContractVersion.hardBlock, true);
  assert.equal(validPackageVersion.hardBlock, false);
  assert.equal(invalidPackageVersion.hardBlock, true);
});

test("keeps high-level swap intents backward compatible when no entry point is declared", () => {
  const result = evaluateContractValidation({
    request: {
      actionType: "Swap",
      target: PACKAGE_HASH,
      targetType: "Trusted Contract",
      chainName: "casper-test",
    },
    policy: {
      ...basePolicy,
      trustedContracts: [PACKAGE_HASH],
    },
  });

  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.rule === "Valid contract entry point" && item.status === "skipped"));
});


test("validates Casper token contracts and isolates explicit EVM token permissions", () => {
  const casper = evaluateContractValidation({
    request: request({
      actionType: "Token Approval",
      targetType: "Token Contract",
      entryPoint: "approve",
    }),
    policy: { ...basePolicy, structuredRules: { ...basePolicy.structuredRules, allowedEntryPoints: ["approve"] } },
  });
  const evm = evaluateContractValidation({
    request: {
      actionType: "Token Approval",
      target: "0x2222222222222222222222222222222222222222",
      targetType: "Token Contract",
      executionWalletAddress: "0x1111111111111111111111111111111111111111",
      tokenPermission: { network: "eip155:1" },
    },
    policy: basePolicy,
  });
  assert.equal(casper.hardBlock, false);
  assert.equal(evm.hardBlock, false);
  assert.ok(evm.findings.some((item) => item.status === "skipped" && item.rule === "Chain-specific contract validation"));
});
