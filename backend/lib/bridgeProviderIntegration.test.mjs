import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBridgeProviderEvidenceToRequest,
  discoverBridgeProviderChains,
  evaluateBridgeProviderIntegration,
  getBridgeProviderIntegrationStatus,
  normalizeBridgeProviderRequest,
  pollBridgeProviderTransfer,
  prepareBridgeProviderIntegration,
} from "./bridgeProviderIntegration.mjs";

const WALLET = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const INPUT = "0x3333333333333333333333333333333333333333";
const OUTPUT = "0x4444444444444444444444444444444444444444";
const ROUTER = "0x5555555555555555555555555555555555555555";
const TX_HASH = `0x${"a".repeat(64)}`;
const NOW = new Date("2026-08-06T11:00:00.000Z");
const TEST_SECRET = "bridge-provider-test-secret-0123456789abcdef";
const TEST_ENV = { NODE_ENV: "test", BRIDGE_PROVIDER_EVIDENCE_SECRET: TEST_SECRET, BRIDGE_PROVIDER_ACROSS_BASE_URL: "http://127.0.0.1:9999/api" };
const request = (overrides = {}) => ({
  actionType: "Bridge",
  targetType: "Bridge Contract",
  target: ROUTER,
  executionWalletAddress: WALLET,
  bridgeProviderId: "across-testnet",
  bridgeSourceChainId: 11155420,
  bridgeDestinationChainId: 84532,
  bridgeInputToken: INPUT,
  bridgeOutputToken: OUTPUT,
  bridgeAmountAtomic: "1000000",
  bridgeDepositor: WALLET,
  bridgeRecipient: RECIPIENT,
  bridgeDestinationAddress: RECIPIENT,
  bridgeTradeType: "exactInput",
  ...overrides,
});
const quote = (overrides = {}) => ({
  id: "quote-1",
  inputAmount: "1000000",
  outputAmount: "990000",
  quoteExpiryTimestamp: 1786014060,
  expectedFillTime: 30,
  simulationSuccess: true,
  fees: { total: { amount: "10000" } },
  approvalTxns: [],
  swapTx: { chainId: "11155420", from: WALLET, to: ROUTER, data: "0x1234", value: "0", gas: "210000" },
  ...overrides,
});
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => JSON.stringify(body),
});
const policy = (config = {}) => ({ structuredRules: { bridgeProviderIntegration: { enabled: true, required: true, allowedAdapters: ["across-testnet"], ...config } } });



test("advertises the current Across EVM testnet allowlist without misclassifying Solana Devnet", () => {
  const status = getBridgeProviderIntegrationStatus({ BRIDGE_PROVIDER_EVIDENCE_SECRET: TEST_SECRET });
  const expected = [421614, 84532, 168587773, 808813, 37111, 4202, 919, 11155420, 80002, 11155111, 129399, 1301];
  assert.deepEqual(new Set(status.allowedTestnetChainIds), new Set(expected));
  assert.equal(status.allowedTestnetChainIds.includes(133268194659241), false);
});

test("legacy bridge metadata does not silently trigger a provider call", async () => {
  let called = false;
  const result = await prepareBridgeProviderIntegration({ request: { actionType: "Bridge", bridgeProvider: "Legacy Provider" }, fetchImpl: async () => { called = true; } });
  assert.equal(result.status, "not_requested");
  assert.equal(called, false);
});

test("fetches an exact-input Across testnet quote and binds the unsigned source transaction", async () => {
  let requestedUrl = "";
  const result = await prepareBridgeProviderIntegration({
    request: request(),
    now: NOW,
    env: TEST_ENV,
    fetchImpl: async (url) => { requestedUrl = String(url); return response(quote()); },
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.sourceTransaction.to, ROUTER);
  assert.equal(result.inputAmountAtomic, "1000000");
  assert.match(result.payloadHash, /^[0-9a-f]{64}$/);
  assert.match(result.routeFingerprint, /^[0-9a-f]{64}$/);
  assert.match(requestedUrl, /\/swap\/approval/);
  assert.match(requestedUrl, /tradeType=exactInput/);
  assert.match(requestedUrl, /amount=1000000/);
});

test("rejects min-output semantics before contacting a provider", async () => {
  let called = false;
  const result = await prepareBridgeProviderIntegration({ request: request({ bridgeTradeType: "minOutput" }), fetchImpl: async () => { called = true; } });
  assert.equal(result.status, "unsupported");
  assert.equal(result.error.code, "UNSUPPORTED_BRIDGE_TRADE_TYPE");
  assert.equal(called, false);
});

test("blocks payload mutation after a successful provider quote", async () => {
  const evidence = await prepareBridgeProviderIntegration({ request: request(), now: NOW, env: TEST_ENV, fetchImpl: async () => response(quote()) });
  evidence.sourceTransaction.data = "0xabcd";
  const result = evaluateBridgeProviderIntegration({ request: { ...request(), bridgeProviderIntegrationEvidence: evidence }, policy: policy() });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Bridge payload binding" && item.status === "fail"));
});

test("uses the configured fallback for unsupported providers", () => {
  const result = evaluateBridgeProviderIntegration({ request: { ...request({ bridgeProviderId: "unknown-provider" }), bridgeProviderIntegrationEvidence: { status: "unsupported", adapterId: "unknown-provider", error: { message: "unsupported" } } }, policy: policy({ unsupportedAction: "block" }) });
  assert.equal(result.hardBlock, true);
});

test("polls Across by depositTxnRef only and maps filled to delivered", async () => {
  let requestedUrl = "";
  const result = await pollBridgeProviderTransfer({ providerId: "across-testnet", depositTransactionHash: TX_HASH, now: NOW, env: TEST_ENV, fetchImpl: async (url) => { requestedUrl = String(url); return response({ status: "filled", fillTxnRef: `0x${"b".repeat(64)}` }); } });
  assert.equal(result.status, "delivered");
  assert.match(requestedUrl, /depositTxnRef=/);
  assert.doesNotMatch(requestedUrl, /originChainId/);
});

test("discovers testnet chains through the registered provider adapter", async () => {
  const result = await discoverBridgeProviderChains({ env: TEST_ENV, fetchImpl: async () => response({ chains: [{ chainId: 11155420 }] }) });
  assert.equal(result.status, "available");
  assert.equal(result.chains[0].chainId, 11155420);
});

test("rejects wallet, recipient, and token drift before contacting a provider", async () => {
  for (const overrides of [
    { bridgeDepositor: RECIPIENT },
    { bridgeRecipient: WALLET },
    { assetContractAddress: OUTPUT },
  ]) {
    let called = false;
    const result = await prepareBridgeProviderIntegration({ request: request(overrides), fetchImpl: async () => { called = true; } });
    assert.equal(result.status, "failed");
    assert.equal(called, false);
  }
});

test("enriches Bridge Controls with provider-owned route metadata without changing the protected amount", async () => {
  const evidence = await prepareBridgeProviderIntegration({ request: request(), now: NOW, env: TEST_ENV, fetchImpl: async () => response(quote()) });
  const enriched = applyBridgeProviderEvidenceToRequest(request(), evidence);
  assert.equal(enriched.bridgeProvider, "Across Testnet");
  assert.equal(enriched.bridgeSourceChain, "eip155:11155420");
  assert.equal(enriched.target, ROUTER);
  assert.equal(enriched.bridgeAmountAtomic, "1000000");
  assert.equal(enriched.bridgeFeeBps, 100);
  assert.equal(normalizeBridgeProviderRequest(enriched).tradeType, "exactInput");
});

test("attests evidence and rejects a modified recipient even when the provider payload is unchanged", async () => {
  const evidence = await prepareBridgeProviderIntegration({ request: request(), now: NOW, env: TEST_ENV, fetchImpl: async () => response(quote()) });
  assert.match(evidence.attestation.signature, /^[0-9a-f]{64}$/);
  const modified = structuredClone(evidence);
  modified.recipient = WALLET;
  const result = evaluateBridgeProviderIntegration({
    request: { ...request(), bridgeProviderIntegrationEvidence: modified },
    policy: policy(),
    env: TEST_ENV,
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Bridge evidence attestation"));
});

test("rejects mainnet chain IDs before any provider request", async () => {
  let called = false;
  const result = await prepareBridgeProviderIntegration({
    request: request({ bridgeSourceChainId: 1, bridgeDestinationChainId: 8453 }),
    env: TEST_ENV,
    fetchImpl: async () => { called = true; return response(quote()); },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "BRIDGE_MAINNET_OR_UNSUPPORTED_CHAIN");
  assert.equal(called, false);
});

test("fails closed when evidence attestation configuration is absent", async () => {
  let called = false;
  const result = await prepareBridgeProviderIntegration({
    request: request(),
    env: { NODE_ENV: "test", BRIDGE_PROVIDER_ACROSS_BASE_URL: "http://127.0.0.1:9999/api" },
    fetchImpl: async () => { called = true; return response(quote()); },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.error.code, "BRIDGE_PROVIDER_ATTESTATION_UNAVAILABLE");
  assert.equal(called, false);
});

test("invalidates stale provider evidence under the configured policy maximum", async () => {
  const evidence = await prepareBridgeProviderIntegration({ request: request(), now: NOW, env: TEST_ENV, fetchImpl: async () => response(quote()) });
  const result = evaluateBridgeProviderIntegration({
    request: { ...request(), bridgeProviderIntegrationEvidence: evidence },
    policy: policy({ maximumEvidenceAgeSeconds: 30 }),
    env: TEST_ENV,
    now: new Date(NOW.getTime() + 31_000),
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Bridge evidence attestation"));
});

test("normalizes current nested token amount response fields", async () => {
  const result = await prepareBridgeProviderIntegration({
    request: request(),
    now: NOW,
    env: TEST_ENV,
    fetchImpl: async () => response(quote({
      inputAmount: undefined,
      outputAmount: undefined,
      inputToken: { address: INPUT, amount: "1000000" },
      outputToken: { address: OUTPUT, amount: "990000" },
    })),
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.inputAmountAtomic, "1000000");
  assert.equal(result.outputAmountAtomic, "990000");
});

test("rejects oversized provider responses before parsing", async () => {
  const result = await prepareBridgeProviderIntegration({
    request: request(),
    env: TEST_ENV,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === "content-length" ? "1000001" : null },
      text: async () => JSON.stringify(quote()),
    }),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.error.code, "BRIDGE_PROVIDER_RESPONSE_TOO_LARGE");
});

test("normalizes malformed provider JSON as unavailable without leaking internals", async () => {
  const result = await prepareBridgeProviderIntegration({
    request: request(),
    env: TEST_ENV,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "not-json",
    }),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.error.code, "BRIDGE_PROVIDER_INVALID_JSON");
  assert.doesNotMatch(result.error.message, /stack|authorization|secret/i);
});

test("times out a non-responsive provider through AbortSignal", async () => {
  const timeoutEnv = { ...TEST_ENV, BRIDGE_PROVIDER_TIMEOUT_MS: "250" };
  const result = await prepareBridgeProviderIntegration({
    request: request(),
    env: timeoutEnv,
    fetchImpl: async (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });
  assert.equal(result.status, "timed_out");
  assert.equal(result.error.code, "BRIDGE_PROVIDER_TIMEOUT");
});
