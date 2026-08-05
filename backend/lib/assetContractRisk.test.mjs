import test from "node:test";
import assert from "node:assert/strict";
import { inspectAssetContractRisk, evaluateAssetContractRisk } from "./assetContractRisk.mjs";

function mockFetch(results) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    const result = results[body.method];
    return { ok: true, status: 200, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result: typeof result === "function" ? result(body.params) : result }) };
  };
}
const request = { chainName: "base-sepolia", assetIdentity: { chainFamily: "EVM", chainId: "84532", network: "base-sepolia", assetType: "fungible_token", canonicalId: "evm:84532:fungible_token:0x1111111111111111111111111111111111111111", contractAddress: "0x1111111111111111111111111111111111111111" } };

test("observes EVM bytecode through trusted RPC", async () => {
  const evidence = await inspectAssetContractRisk({ request, env: { ASSET_CONTRACT_RISK_EVM_RPC_URL: "https://rpc.example", ASSET_CONTRACT_RISK_EVM_CHAIN_ID: "84532" }, fetchImpl: mockFetch({ eth_chainId: "0x14a34", eth_blockNumber: "0x10", eth_getCode: "0x6001600055", eth_getStorageAt: "0x0" }) });
  assert.equal(evidence.status, "succeeded"); assert.equal(evidence.present, true); assert.equal(evidence.chainId, "84532");
});
test("no deployed code blocks by default", () => {
  const result = evaluateAssetContractRisk({ request: { assetContractRiskEvidence: { status: "succeeded", present: false, evidenceCompleteness: {} } }, policy: {} });
  assert.equal(result.hardBlock, true);
});
test("unavailable required evidence reviews", () => {
  const result = evaluateAssetContractRisk({ request: { assetContractRiskEvidence: { status: "unavailable" } }, policy: { structuredRules: { assetContractRisk: { required: true } } } });
  assert.equal(result.needsReview, true);
});
test("blocked bytecode hash deterministically blocks", () => {
  const result = evaluateAssetContractRisk({ request: { assetContractRiskEvidence: { status: "succeeded", present: true, codeHash: "abc", proxy: {}, evidenceCompleteness: {} } }, policy: { structuredRules: { assetContractRisk: { blockedCodeHashes: ["abc"] } } } });
  assert.equal(result.hardBlock, true);
});
test("unapproved proxy requires review", () => {
  const result = evaluateAssetContractRisk({ request: { assetContractRiskEvidence: { status: "succeeded", present: true, codeHash: "abc", proxy: { detected: true, implementationAddress: "0x2222222222222222222222222222222222222222" }, evidenceCompleteness: {} } }, policy: {} });
  assert.equal(result.needsReview, true);
});
test("non-EVM evidence is explicitly unsupported", async () => {
  const evidence = await inspectAssetContractRisk({ request: { assetIdentity: { chainFamily: "CASPER", assetType: "fungible_token", contractAddress: "hash-x" } } });
  assert.equal(evidence.status, "unsupported");
});
