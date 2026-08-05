import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeSimulationValue, hashSimulationValue, normalizeEvmSimulationPayload, runStatefulSimulation, evaluateStatefulSimulationEvidence } from "./statefulSimulation.mjs";

const FROM = "0x1111111111111111111111111111111111111111";
const TO = "0x2222222222222222222222222222222222222222";

function response(result, error = null) {
  return { ok: true, status: 200, async text() { return JSON.stringify(error ? { jsonrpc: "2.0", id: 1, error } : { jsonrpc: "2.0", id: 1, result }); } };
}

function rpcFetch(results) {
  return async (_url, init) => {
    const { method } = JSON.parse(init.body);
    const value = results[method];
    return value instanceof Error ? response(null, { code: -32000, message: value.message, data: "0x08c379a0" }) : response(value);
  };
}

test("canonical hashing is stable across object key order", () => {
  assert.deepEqual(canonicalizeSimulationValue({ b: 2, a: 1 }), { a: 1, b: 2 });
  assert.equal(hashSimulationValue({ b: 2, a: 1 }), hashSimulationValue({ a: 1, b: 2 }));
});

test("rejects unsafe numeric canonicalization", () => {
  assert.throws(() => canonicalizeSimulationValue({ amount: 1.2 }), /unsafe or fractional/);
});

test("normalizes exact unsigned EVM payload", () => {
  assert.deepEqual(normalizeEvmSimulationPayload({ from: FROM, to: TO, data: "0x", value: "0x0" }), { from: FROM, to: TO, data: "0x", value: "0x0" });
});

test("genuine adapter uses chain identity, pinned eth_call, and eth_estimateGas", async () => {
  const evidence = await runStatefulSimulation({
    simulation: { requested: true, chainFamily: "EVM", chainId: "0x14a34", payload: { from: FROM, to: TO, data: "0x", value: "0x0" } },
    env: { NODE_ENV: "test", STATEFUL_SIMULATION_EVM_RPC_URL: "http://rpc.test", STATEFUL_SIMULATION_EVM_CHAIN_ID: "0x14a34" },
    fetchImpl: rpcFetch({ eth_chainId: "0x14a34", eth_blockNumber: "0x10", eth_getBlockByNumber: { hash: "0xabc", timestamp: "0x65" }, eth_call: "0x", eth_estimateGas: "0x5208" }),
  });
  assert.equal(evidence.status, "succeeded");
  assert.equal(evidence.expectedSuccess, true);
  assert.equal(evidence.gasEstimate, "0x5208");
  assert.equal(evidence.blockNumber, "0x10");
  assert.match(evidence.payloadHash, /^[0-9a-f]{64}$/);
});

test("provider revert becomes deterministic blocked finding", async () => {
  const evidence = await runStatefulSimulation({
    simulation: { requested: true, chainFamily: "EVM", payload: { from: FROM, to: TO, data: "0x", value: "0x0" } },
    env: { NODE_ENV: "test", STATEFUL_SIMULATION_EVM_RPC_URL: "http://rpc.test" },
    fetchImpl: rpcFetch({ eth_chainId: "0x1", eth_blockNumber: "0x10", eth_getBlockByNumber: { hash: "0xabc", timestamp: "0x65" }, eth_call: new Error("execution reverted: insufficient allowance") }),
  });
  assert.equal(evidence.status, "reverted");
  const result = evaluateStatefulSimulationEvidence({ request: { statefulSimulationEvidence: evidence }, policy: { structuredRules: { statefulSimulationRequired: true } } });
  assert.equal(result.hardBlock, true);
  assert.match(result.findings[0].message, /insufficient allowance/);
});

test("unsupported adapter follows review fallback", () => {
  const result = evaluateStatefulSimulationEvidence({ request: { statefulSimulationEvidence: { status: "unsupported", message: "No adapter" } }, policy: { structuredRules: { statefulSimulationRequired: true, statefulSimulationUnavailableAction: "Review" } } });
  assert.equal(result.needsReview, true);
  assert.equal(result.hardBlock, false);
});

test("expired evidence blocks", () => {
  const result = evaluateStatefulSimulationEvidence({ request: { statefulSimulationEvidence: { status: "succeeded", expectedSuccess: true, expiresAt: "2026-01-01T00:00:00.000Z" } }, policy: { structuredRules: { statefulSimulationRequired: true } }, now: new Date("2026-01-01T00:01:00.000Z") });
  assert.equal(result.hardBlock, true);
  assert.match(result.findings[0].rule, /freshness/);
});
