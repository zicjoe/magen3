import test from "node:test";
import assert from "node:assert/strict";
import { canonicalAssetReference, evaluateAssetIdentity } from "./assetIdentity.mjs";

test("resolves native assets without treating symbols as global identity", () => {
  const result = canonicalAssetReference({ chainName: "base-sepolia", asset: "ETH" });
  assert.equal(result.canonicalId, "evm:base-sepolia:native:native");
  assert.equal(result.native, true);
});

test("resolves token identity using network and contract address", () => {
  const result = canonicalAssetReference({ chainFamily: "EVM", chainId: "84532", chainName: "base-sepolia", asset: "USDC", tokenAddress: "0xAbC", tokenDecimals: 6 });
  assert.equal(result.canonicalId, "evm:84532:fungible_token:0xabc");
  assert.equal(result.decimals, 6);
});

test("unresolved symbol-only token fails closed to review when required", () => {
  const result = evaluateAssetIdentity({ request: { chainName: "unknown", asset: "USDC" }, policy: { structuredRules: { assetIdentityRequired: true } } });
  assert.equal(result.needsReview, true);
  assert.equal(result.context.resolved, false);
});

test("metadata conflicts are field specific", () => {
  const canonicalId = "evm:84532:fungible_token:0xabc";
  const result = evaluateAssetIdentity({ request: { chainFamily: "EVM", chainId: "84532", tokenAddress: "0xabc", asset: "FAKE", tokenDecimals: 18 }, policy: { structuredRules: { assetIdentity: { registry: { [canonicalId]: { symbol: "USDC", decimals: 6 } } } } } });
  assert.equal(result.needsReview, true);
  assert.deepEqual(result.context.metadataConflicts.map((item) => item.field), ["symbol", "decimals"]);
});

test("blocked canonical identities are deterministic", () => {
  const canonicalId = "evm:84532:fungible_token:0xabc";
  const result = evaluateAssetIdentity({ request: { chainFamily: "EVM", chainId: "84532", tokenAddress: "0xabc", asset: "USDC" }, policy: { structuredRules: { assetIdentity: { blockedCanonicalIds: [canonicalId] } } } });
  assert.equal(result.hardBlock, true);
});
