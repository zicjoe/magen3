import assert from "node:assert/strict";
import test from "node:test";
import { buildContractArgumentFingerprint, evaluateContractArgumentPolicies } from "./contractArgumentPolicies.mjs";

const CONTRACT = `contract-${"a".repeat(64)}`;
const ALLOWED = `01${"1".repeat(64)}`;
const BLOCKED = `account-hash-${"2".repeat(64)}`;

function policy(overrides = {}) {
  return { id: "POL-ARG", structuredRules: {
    contractArgumentControlsEnabled: true,
    contractArgumentMode: "Review",
    contractArgumentUnknownRuleAction: "Review",
    contractArgumentUnknownArgumentAction: "Block",
    contractArgumentRules: [{
      id: "transfer-rule",
      contract: CONTRACT,
      entryPoint: "transfer",
      requiredArgs: ["recipient", "amount", "mode"],
      allowedArgs: ["recipient", "amount", "mode", "force"],
      argumentTypes: { recipient: "address", amount: "integer", mode: "string", force: "boolean" },
      numericLimits: { amount: { min: 1, max: 100 } },
      addressRules: { recipient: { allowed: [ALLOWED], blocked: [BLOCKED] } },
      booleanRules: { force: { allowed: [false] } },
      enumRules: { mode: ["safe", "standard"] },
    }],
    ...overrides,
  }};
}
function request(runtimeArgs, overrides = {}) {
  return { actionType: "Contract Interaction", targetType: "Trusted Contract", target: CONTRACT, entryPoint: "transfer", runtimeArgs, ...overrides };
}

test("allows arguments that satisfy the exact contract and entry-point rule", () => {
  const result = evaluateContractArgumentPolicies({ request: request({ recipient: ALLOWED, amount: "10", mode: "safe", force: false }), policy: policy() });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.ok(result.findings.some((item) => item.rule === "Contract argument numeric limit" && item.status === "pass"));
  assert.equal(result.context.ruleId, "transfer-rule");
});

test("routes missing required arguments to review in Review mode", () => {
  const result = evaluateContractArgumentPolicies({ request: request({ recipient: ALLOWED, amount: 10 }), policy: policy() });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Required contract argument" && item.status === "warning"));
});

test("blocks unknown arguments according to policy", () => {
  const result = evaluateContractArgumentPolicies({ request: request({ recipient: ALLOWED, amount: 10, mode: "safe", drain: true }), policy: policy() });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Allowed contract arguments" && item.status === "fail"));
});

test("blocks blocked addresses even when mode is Observe", () => {
  const result = evaluateContractArgumentPolicies({ request: request({ recipient: BLOCKED, amount: 10, mode: "safe" }), policy: policy({ contractArgumentMode: "Observe" }) });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Blocked contract argument address"));
});

test("enforces numeric, boolean, enum, and type policies", () => {
  const result = evaluateContractArgumentPolicies({ request: request({ recipient: ALLOWED, amount: "101.5", mode: "unsafe", force: true }), policy: policy({ contractArgumentMode: "Enforce" }) });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Contract argument type" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Contract argument numeric limit" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Contract argument boolean policy" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "Contract argument enum policy" && item.status === "fail"));
});

test("unknown contract and entry-point rules follow the configured action", () => {
  const result = evaluateContractArgumentPolicies({ request: request({ amount: 1 }, { entryPoint: "withdraw" }), policy: policy({ contractArgumentUnknownRuleAction: "Block" }) });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Configured contract argument rule" && item.status === "fail"));
});

test("disabled and non-contract flows remain backward compatible", () => {
  const disabled = evaluateContractArgumentPolicies({ request: request({ amount: 1 }), policy: policy({ contractArgumentControlsEnabled: false }) });
  const transfer = evaluateContractArgumentPolicies({ request: { actionType: "Transfer", targetType: "Wallet Address", runtimeArgs: { amount: 1 } }, policy: policy() });
  assert.ok(disabled.findings.every((item) => item.status === "skipped"));
  assert.ok(transfer.findings.every((item) => item.status === "skipped"));
});

test("fingerprints are canonical and change when protected arguments change", () => {
  const one = buildContractArgumentFingerprint({ target: CONTRACT, entryPoint: "transfer", runtimeArgs: { amount: "10", recipient: ALLOWED } });
  const same = buildContractArgumentFingerprint({ target: CONTRACT, entryPoint: "transfer", runtimeArgs: { recipient: ALLOWED, amount: "10" } });
  const changed = buildContractArgumentFingerprint({ target: CONTRACT, entryPoint: "transfer", runtimeArgs: { recipient: ALLOWED, amount: "11" } });
  assert.equal(one, same);
  assert.notEqual(one, changed);
});
