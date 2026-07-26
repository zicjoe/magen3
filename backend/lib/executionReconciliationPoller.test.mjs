import test from "node:test";
import assert from "node:assert/strict";
import { getExecutionReconciliationPollingStatus, pollExecutionTransaction } from "./executionReconciliationPoller.mjs";

const TX = "a".repeat(64);
const EVM_TX = `0x${"b".repeat(64)}`;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("polling remains opt-in and does not expose configured RPC URLs", () => {
  const disabled = getExecutionReconciliationPollingStatus({ CASPER_RPC_URL: "https://rpc.example/rpc" });
  assert.equal(disabled.enabled, false);
  assert.equal("rpcUrl" in disabled, false);
  const enabled = getExecutionReconciliationPollingStatus({ RECONCILIATION_POLLING_ENABLED: "true", CASPER_RPC_URL: "https://rpc.example/rpc" });
  assert.equal(enabled.configured, true);
  assert.match(enabled.securityBoundary, /SSRF/i);
});

test("polls a successful Casper execution with backend-configured RPC", async () => {
  const calls = [];
  const result = await pollExecutionTransaction({
    transactionHash: TX,
    chainFamily: "Casper",
    env: { RECONCILIATION_POLLING_ENABLED: "true", CASPER_RPC_URL: "https://rpc.example/rpc", CASPER_CHAIN_NAME: "casper-test" },
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return response({ jsonrpc: "2.0", id: 1, result: { transaction: { hash: TX }, execution_info: { block_hash: "c".repeat(64), execution_result: { Success: { effect: {} } } }, finalized_approvals: [{ signer: "01" }] } });
    },
  });
  assert.equal(result.status, "confirmed");
  assert.equal(result.transactionHash, TX);
  assert.equal(result.finalized, true);
  assert.equal(calls[0].url, "https://rpc.example/rpc");
  assert.equal(calls[0].body.method, "info_get_transaction");
});

test("polls a failed Casper execution without leaking raw provider data", async () => {
  const result = await pollExecutionTransaction({
    transactionHash: TX,
    env: { RECONCILIATION_POLLING_ENABLED: "true", CASPER_RPC_URL: "https://rpc.example/rpc" },
    fetchImpl: async () => response({ result: { deploy: { hash: TX }, execution_results: [{ block_hash: "d".repeat(64), result: { Failure: { error_message: "revert" } } }] } }),
  });
  assert.equal(result.status, "failed");
  assert.match(result.failureReason, /revert/);
});

test("polls EVM receipts and calculates confirmations", async () => {
  const calls = [];
  const result = await pollExecutionTransaction({
    transactionHash: EVM_TX,
    chainFamily: "EVM",
    chainName: "eip155:84532",
    env: { RECONCILIATION_POLLING_ENABLED: "true", RECONCILIATION_EVM_RPC_URL: "https://evm.example/rpc" },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body.method);
      if (body.method === "eth_getTransactionReceipt") return response({ result: { status: "0x1", blockNumber: "0x64", blockHash: `0x${"c".repeat(64)}` } });
      return response({ result: "0x66" });
    },
  });
  assert.equal(result.status, "confirmed");
  assert.equal(result.confirmations, 3);
  assert.deepEqual(calls, ["eth_getTransactionReceipt", "eth_blockNumber"]);
});

test("rejects caller-controlled or insecure RPC configuration", async () => {
  await assert.rejects(() => pollExecutionTransaction({ transactionHash: TX, env: { RECONCILIATION_POLLING_ENABLED: "true", CASPER_RPC_URL: "http://evil.example/rpc" }, fetchImpl: async () => response({}) }), /not configured/);
});
