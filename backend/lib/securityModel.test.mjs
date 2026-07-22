import assert from "node:assert/strict";
import test from "node:test";

import {
  legacyTypeFromCapabilities,
  normalizeExecutionCapabilities,
  recommendedModuleIds,
  recommendedPolicyTemplate,
} from "./securityModel.mjs";

test("normalizes valid multi-capability registrations without duplicates", () => {
  assert.deepEqual(
    normalizeExecutionCapabilities(["Trading", "Wallet Management", "Trading", "invalid"]),
    ["Trading", "Wallet Management"],
  );
});

test("maps legacy agents conservatively when capability metadata is absent", () => {
  assert.deepEqual(normalizeExecutionCapabilities(undefined, "Treasury Agent"), ["Treasury Operations", "Wallet Management"]);
  assert.deepEqual(normalizeExecutionCapabilities(undefined, "Custom Agent"), ["Custom"]);
});

test("recommends modules and an enforceable starter policy from capabilities", () => {
  const capabilities = ["Trading", "Wallet Management", "dApp Interactions"];
  const modules = recommendedModuleIds(capabilities);
  assert.ok(modules.includes("identity-authentication"));
  assert.ok(modules.includes("policy-enforcement"));
  assert.ok(modules.includes("contract-validation"));
  assert.ok(modules.includes("execution-simulation"));
  assert.equal(recommendedPolicyTemplate(capabilities), "DeFi Automation");
  assert.equal(legacyTypeFromCapabilities(capabilities), "Trading Agent");
  assert.equal(recommendedPolicyTemplate(["Enterprise Automation", "Treasury Operations"]), "Enterprise Controlled Automation");
});
