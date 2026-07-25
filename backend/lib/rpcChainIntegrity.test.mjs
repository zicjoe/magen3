import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRpcChainIntegrity, getRpcChainIntegrityStatus } from "./rpcChainIntegrity.mjs";

const GENESIS = "a".repeat(64);
const TX = "b".repeat(64);
const STATE = "c".repeat(64);
function policy(overrides = {}) {
  return { structuredRules: {
    rpcIntegrityEnabled: true,
    rpcIntegrityMode: "Review",
    approvedRpcEndpoints: [
      { id: "primary", endpoint: "https://primary.example/rpc", chainName: "casper-test", networkIdentifier: "casper-testnet", genesisHash: GENESIS },
      { id: "secondary", endpoint: "https://secondary.example/rpc", chainName: "casper-test", networkIdentifier: "casper-testnet", genesisHash: GENESIS },
    ],
    rpcIntegrityRequireTls: true,
    rpcIntegrityMaximumBlockAgeSeconds: 120,
    rpcIntegrityMinimumProviders: 2,
    rpcIntegrityMaximumHeightDifference: 5,
    rpcIntegrityDisagreementAction: "Block",
    rpcIntegrityUnavailableAction: "Review",
    rpcIntegrityRequireNetworkIdentity: true,
    rpcIntegrityAllowAutomaticFailover: false,
    ...overrides,
  } };
}
function observation(id, endpoint, height = 100, overrides = {}) {
  return {
    providerId: id,
    endpoint,
    chainName: "casper-test",
    networkIdentifier: "casper-testnet",
    genesisHash: GENESIS,
    tls: true,
    synced: true,
    latestBlockHeight: height,
    latestBlockTimestamp: new Date(Date.now() - 10_000).toISOString(),
    responseTimestamp: new Date().toISOString(),
    timedOut: false,
    rateLimited: false,
    speculative: false,
    transactionStatusHash: TX,
    contractStateHash: STATE,
    ...overrides,
  };
}
function request(overrides = {}) {
  return {
    agentId: "AG-RPC",
    chainName: "casper-test",
    rpcIntegrityMetadataSupplied: true,
    rpcExpectedChainName: "casper-test",
    rpcExpectedNetworkIdentifier: "casper-testnet",
    rpcExpectedGenesisHash: GENESIS,
    rpcSelectedProviderId: "primary",
    rpcSelectedEndpoint: "https://primary.example/rpc",
    rpcProviderObservations: [
      observation("primary", "https://primary.example/rpc", 101),
      observation("secondary", "https://secondary.example/rpc", 100),
    ],
    rpcAutomaticFailoverUsed: false,
    rpcFailoverFrom: "",
    rpcFailoverReason: "",
    ...overrides,
  };
}

test("healthy approved providers pass deterministic RPC integrity checks", () => {
  const result = evaluateRpcChainIntegrity({ request: request(), policy: policy(), auditLogs: [] });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.status, "passed");
  assert.equal(result.context.networkAgreement, true);
  assert.equal(result.context.approvedProviderCount, 2);
});

test("missing metadata follows unavailable Review action", () => {
  const result = evaluateRpcChainIntegrity({ request: { agentId: "AG-RPC" }, policy: policy(), auditLogs: [] });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.status === "unavailable"), true);
});

test("wrong chain identity hard-blocks", () => {
  const observations = [observation("primary", "https://primary.example/rpc", 101, { chainName: "casper-mainnet" }), observation("secondary", "https://secondary.example/rpc", 100)];
  const result = evaluateRpcChainIntegrity({ request: request({ rpcProviderObservations: observations }), policy: policy(), auditLogs: [] });
  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.rule === "Network identity binding" && item.status === "fail"), true);
});

test("unapproved selected endpoint requires review in Review mode", () => {
  const rogue = observation("rogue", "https://rogue.example/rpc", 101);
  const result = evaluateRpcChainIntegrity({ request: request({ rpcSelectedProviderId: "rogue", rpcSelectedEndpoint: rogue.endpoint, rpcProviderObservations: [rogue, observation("secondary", "https://secondary.example/rpc", 100)] }), policy: policy(), auditLogs: [] });
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.rule === "Approved RPC endpoint"), true);
});

test("provider disagreement blocks when disagreement action is Block", () => {
  const observations = [observation("primary", "https://primary.example/rpc", 101), observation("secondary", "https://secondary.example/rpc", 100, { genesisHash: "d".repeat(64) })];
  const result = evaluateRpcChainIntegrity({ request: request({ rpcProviderObservations: observations }), policy: policy(), auditLogs: [] });
  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.rule === "RPC network disagreement"), true);
});

test("stale latest block requires review in Review mode", () => {
  const old = new Date(Date.now() - 600_000).toISOString();
  const observations = [observation("primary", "https://primary.example/rpc", 101, { latestBlockTimestamp: old }), observation("secondary", "https://secondary.example/rpc", 100)];
  const result = evaluateRpcChainIntegrity({ request: request({ rpcProviderObservations: observations }), policy: policy(), auditLogs: [] });
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.rule === "Latest block freshness"), true);
});

test("block-height regression hard-blocks against audited history", () => {
  const auditLogs = [{ agentId: "AG-RPC", originalIntent: { rpcIntegrity: { providerObservations: [observation("primary", "https://primary.example/rpc", 200)] } } }];
  const result = evaluateRpcChainIntegrity({ request: request(), policy: policy(), auditLogs });
  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.rule === "Block-height regression"), true);
});

test("transaction-status inconsistency blocks", () => {
  const observations = [observation("primary", "https://primary.example/rpc", 101), observation("secondary", "https://secondary.example/rpc", 100, { transactionStatusHash: "d".repeat(64) })];
  const result = evaluateRpcChainIntegrity({ request: request({ rpcProviderObservations: observations }), policy: policy(), auditLogs: [] });
  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.rule === "Transaction-status consistency"), true);
});

test("selected speculative provider hard-blocks", () => {
  const observations = [observation("primary", "https://primary.example/rpc", 101, { speculative: true }), observation("secondary", "https://secondary.example/rpc", 100)];
  const result = evaluateRpcChainIntegrity({ request: request({ rpcProviderObservations: observations }), policy: policy(), auditLogs: [] });
  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.rule === "Speculative endpoint isolation"), true);
});

test("automatic failover requires policy authorization", () => {
  const result = evaluateRpcChainIntegrity({ request: request({ rpcAutomaticFailoverUsed: true, rpcFailoverFrom: "https://secondary.example/rpc", rpcFailoverReason: "timeout" }), policy: policy(), auditLogs: [] });
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.rule === "Authorized RPC failover"), true);
});

test("authorized complete failover passes", () => {
  const result = evaluateRpcChainIntegrity({ request: request({ rpcAutomaticFailoverUsed: true, rpcFailoverFrom: "https://secondary.example/rpc", rpcFailoverReason: "timeout" }), policy: policy({ rpcIntegrityAllowAutomaticFailover: true }), auditLogs: [] });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.findings.some((item) => item.rule === "Authorized RPC failover" && item.status === "pass"), true);
});

test("status reports Foundation Available until deployed provider adapters are verified", () => {
  const status = getRpcChainIntegrityStatus();
  assert.equal(status.status, "foundation_available");
  assert.equal(status.multiProviderAgreement, true);
});

test("missing synchronization evidence never silently passes", () => {
  const rpcRequest = request();
  delete rpcRequest.rpcProviderObservations[0].synced;
  const result = evaluateRpcChainIntegrity({ request: rpcRequest, policy: policy({ rpcIntegrityUnavailableAction: "Review" }) });
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "RPC synchronization evidence" && item.status === "unavailable"));
});

test("missing required network identity never receives a binding pass", () => {
  const rpcRequest = request();
  delete rpcRequest.rpcProviderObservations[0].networkIdentifier;
  const result = evaluateRpcChainIntegrity({ request: rpcRequest, policy: policy({ rpcIntegrityUnavailableAction: "Review" }) });
  assert.equal(result.needsReview, true);
  assert.equal(result.context.networkIdentityVerified, false);
  assert.ok(result.findings.some((item) => item.rule === "RPC network identity evidence" && item.status === "unavailable"));
  assert.equal(result.findings.some((item) => item.rule === "Network identity binding" && item.status === "pass"), false);
});
