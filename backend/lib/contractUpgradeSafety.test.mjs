import assert from "node:assert/strict";
import test from "node:test";
import { evaluateContractUpgradeSafety, buildContractUpgradeFingerprint } from "./contractUpgradeSafety.mjs";

const CONTRACT = `contract-${"1".repeat(64)}`;
const CURRENT = `contract-${"2".repeat(64)}`;
const NEXT = `contract-${"3".repeat(64)}`;
const BLOCKED = `contract-${"4".repeat(64)}`;
const ADMIN = `01${"5".repeat(64)}`;
const HASH = "a".repeat(64);

function policy(overrides = {}) {
  return { id: "POL-upgrade", structuredRules: {
    contractUpgradeControlsEnabled: true,
    contractUpgradeMode: "Review",
    contractUpgradeApprovedImplementations: [NEXT],
    contractUpgradeBlockedImplementations: [BLOCKED],
    contractUpgradeRequiresApproval: true,
    contractUpgradeQuorum: 2,
    contractUpgradeDelaySeconds: 0,
    contractUpgradeRequireCodeHash: true,
    contractUpgradeApprovedAdministrators: [ADMIN],
    contractUpgradeUnknownImplementationAction: "Review",
    ...overrides,
  }};
}
function request(overrides = {}) {
  return {
    contractUpgradeMetadataSupplied: true,
    contractUpgradeContract: CONTRACT,
    contractUpgradeCurrentImplementation: CURRENT,
    contractUpgradeRequestedImplementation: NEXT,
    contractUpgradeRequestedCodeHash: HASH,
    contractUpgradeAdministrator: ADMIN,
    contractUpgradeNetwork: "casper-test",
    chainName: "casper-test",
    target: CONTRACT,
    ...overrides,
  };
}

test("approved upgrade requires exact-bound quorum review", () => {
  const result = evaluateContractUpgradeSafety({ request: request(), policy: policy() });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.context.requiredApprovalCount, 2);
  assert.match(result.context.parameterFingerprint, /^[0-9a-f]{64}$/);
  assert.ok(result.findings.some((item) => item.rule === "Approved implementation allowlist" && item.status === "pass"));
});

test("blocked implementation and target mutation fail closed", () => {
  const blocked = evaluateContractUpgradeSafety({ request: request({ contractUpgradeRequestedImplementation: BLOCKED }), policy: policy() });
  assert.equal(blocked.hardBlock, true);
  assert.ok(blocked.findings.some((item) => item.rule === "Blocked implementation" && item.status === "fail"));
  const target = evaluateContractUpgradeSafety({ request: request({ contractUpgradeContract: `contract-${"9".repeat(64)}` }), policy: policy() });
  assert.equal(target.hardBlock, true);
  assert.ok(target.findings.some((item) => item.rule === "Upgrade target binding" && item.status === "fail"));
});

test("code hash and administrator rules are enforced", () => {
  const missingHash = evaluateContractUpgradeSafety({ request: request({ contractUpgradeRequestedCodeHash: "" }), policy: policy({ contractUpgradeMode: "Enforce" }) });
  assert.equal(missingHash.hardBlock, true);
  const wrongAdmin = evaluateContractUpgradeSafety({ request: request({ contractUpgradeAdministrator: `01${"7".repeat(64)}` }), policy: policy() });
  assert.equal(wrongAdmin.hardBlock, true);
});

test("upgrade delay blocks early execution and passes after the delay", () => {
  const requestedAt = "2026-07-24T10:00:00.000Z";
  const executeAfter = "2026-07-24T10:30:00.000Z";
  const early = evaluateContractUpgradeSafety({ request: request({ contractUpgradeRequestedAt: requestedAt, contractUpgradeExecuteAfter: executeAfter }), policy: policy({ contractUpgradeDelaySeconds: 1800 }), now: new Date("2026-07-24T10:10:00.000Z") });
  assert.equal(early.needsReview, true);
  assert.ok(early.findings.some((item) => item.rule === "Upgrade execution window"));
  const ready = evaluateContractUpgradeSafety({ request: request({ contractUpgradeRequestedAt: requestedAt, contractUpgradeExecuteAfter: executeAfter }), policy: policy({ contractUpgradeDelaySeconds: 1800 }), now: new Date("2026-07-24T10:31:00.000Z") });
  assert.ok(ready.findings.some((item) => item.rule === "Upgrade delay enforced" && item.status === "pass"));
});

test("fingerprint changes when protected implementation changes", () => {
  const one = buildContractUpgradeFingerprint({ contract: CONTRACT, currentImplementation: CURRENT, requestedImplementation: NEXT, network: "casper-test" });
  const two = buildContractUpgradeFingerprint({ contract: CONTRACT, currentImplementation: CURRENT, requestedImplementation: BLOCKED, network: "casper-test" });
  assert.notEqual(one, two);
});
