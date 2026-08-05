import { createHash } from "node:crypto";

const SCHEMA_VERSION = "magen3.asset-contract-risk.v1";
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HEX = /^0x[0-9a-f]*$/i;
const MAX_CODE_BYTES = 256_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e019a6f2f8f6f6f7f6f5f4f3f2f1f0ef";

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function hashHex(value) { return createHash("sha256").update(value).digest("hex"); }
function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "", field = "assetContract" }) {
  return { module: "Asset Contract Risk", control: "Asset contract structural risk", status, severity, rule, message, evidence, remediation, field };
}
function normalizeAction(value, fallback = "review") {
  const action = lower(value || fallback);
  return ["allow", "warn", "review", "block"].includes(action) ? action : fallback;
}
function applyAction(state, action, message, score = 25) {
  if (action === "block") { state.hardBlock = true; state.scoreDelta += Math.max(score, 45); }
  else if (action === "review") { state.needsReview = true; state.scoreDelta += score; }
  else if (action === "warn") state.scoreDelta += Math.min(score, 12);
  if (action !== "allow") state.checksFailed.push(message);
}
function providerConfig(env = process.env) {
  const url = clean(env.ASSET_CONTRACT_RISK_EVM_RPC_URL || env.STATEFUL_SIMULATION_EVM_RPC_URL);
  const providerId = clean(env.ASSET_CONTRACT_RISK_EVM_PROVIDER_ID || env.STATEFUL_SIMULATION_EVM_PROVIDER_ID || "trusted-evm-rpc");
  const chainId = clean(env.ASSET_CONTRACT_RISK_EVM_CHAIN_ID || env.STATEFUL_SIMULATION_EVM_CHAIN_ID);
  if (!url) return { configured: false, providerId, chainId };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) return { configured: false, invalid: true, providerId, chainId };
    return { configured: true, url, providerId, chainId };
  } catch { return { configured: false, invalid: true, providerId, chainId }; }
}
async function rpc({ url, method, params = [], fetchImpl, signal }) {
  const response = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal });
  const text = await response.text();
  if (text.length > MAX_CODE_BYTES * 3) throw Object.assign(new Error("Provider response exceeded the asset contract risk limit"), { code: "OVERSIZED_PROVIDER_RESPONSE" });
  let payload;
  try { payload = JSON.parse(text); } catch { throw Object.assign(new Error("Provider returned malformed JSON"), { code: "MALFORMED_PROVIDER_RESPONSE" }); }
  if (!response.ok || payload.error) throw Object.assign(new Error(clean(payload.error?.message || `Provider HTTP ${response.status}`)), { code: "PROVIDER_ERROR" });
  return payload.result;
}
function slotAddress(value) {
  const hex = lower(value).replace(/^0x/, "").padStart(64, "0");
  const address = `0x${hex.slice(-40)}`;
  return /^0x0{40}$/.test(address) ? "" : address;
}
function inspectBytecode(code) {
  const normalized = lower(code);
  const byteLength = Math.max(0, (normalized.length - 2) / 2);
  const body = normalized.slice(2);
  return {
    present: normalized !== "0x" && body.length > 0,
    byteLength,
    codeHash: hashHex(normalized),
    minimalProxy: /^363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/i.test(body),
    containsDelegateCallOpcode: body.includes("f4"),
    containsSelfDestructOpcode: body.includes("ff"),
  };
}
export async function inspectAssetContractRisk({ request = {}, fetchImpl = fetch, env = process.env, now = new Date() } = {}) {
  const identity = object(request.assetIdentity);
  const chainFamily = clean(identity.chainFamily || request.chainFamily).toUpperCase();
  const address = clean(identity.contractAddress || request.assetContractAddress || request.tokenAddress);
  const requested = Boolean(address && identity.assetType !== "native");
  if (!requested) return { schemaVersion: SCHEMA_VERSION, status: "not_applicable", requested: false, evidenceCompleteness: { bytecode: "not_applicable", proxySlots: "not_applicable" } };
  if (chainFamily !== "EVM") return { schemaVersion: SCHEMA_VERSION, status: "unsupported", requested: true, chainFamily, contractAddress: address, errorClassification: "UNSUPPORTED_CHAIN_FAMILY", evidenceCompleteness: { bytecode: "unsupported", proxySlots: "unsupported" } };
  if (!ADDRESS.test(address)) return { schemaVersion: SCHEMA_VERSION, status: "failed", requested: true, chainFamily, contractAddress: address, errorClassification: "INVALID_CONTRACT_ADDRESS", evidenceCompleteness: { bytecode: "unavailable", proxySlots: "unavailable" } };
  const config = providerConfig(env);
  if (!config.configured) return { schemaVersion: SCHEMA_VERSION, status: "unavailable", requested: true, chainFamily, contractAddress: lower(address), providerId: config.providerId, errorClassification: config.invalid ? "INVALID_PROVIDER_CONFIGURATION" : "PROVIDER_NOT_CONFIGURED", evidenceCompleteness: { bytecode: "unavailable", proxySlots: "unavailable" } };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.ASSET_CONTRACT_RISK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  const startedAt = now.toISOString();
  try {
    const [rpcChainId, blockNumber] = await Promise.all([
      rpc({ url: config.url, method: "eth_chainId", fetchImpl, signal: controller.signal }),
      rpc({ url: config.url, method: "eth_blockNumber", fetchImpl, signal: controller.signal }),
    ]);
    if (config.chainId && BigInt(rpcChainId).toString() !== BigInt(config.chainId).toString()) throw Object.assign(new Error("Trusted provider chain ID does not match configuration"), { code: "CHAIN_ID_MISMATCH" });
    const blockTag = blockNumber || "latest";
    const [code, implementationSlot] = await Promise.all([
      rpc({ url: config.url, method: "eth_getCode", params: [address, blockTag], fetchImpl, signal: controller.signal }),
      rpc({ url: config.url, method: "eth_getStorageAt", params: [address, EIP1967_IMPLEMENTATION_SLOT, blockTag], fetchImpl, signal: controller.signal }).catch(() => null),
    ]);
    if (!HEX.test(code || "") || (code.length - 2) / 2 > MAX_CODE_BYTES) throw Object.assign(new Error("Provider returned malformed or oversized bytecode"), { code: "MALFORMED_BYTECODE" });
    const inspection = inspectBytecode(code);
    const implementationAddress = implementationSlot ? slotAddress(implementationSlot) : "";
    const evidence = {
      schemaVersion: SCHEMA_VERSION, status: "succeeded", requested: true, chainFamily: "EVM", chainId: BigInt(rpcChainId).toString(),
      network: clean(identity.network || request.chainName), contractAddress: lower(address), canonicalAssetId: clean(identity.canonicalId), providerId: config.providerId,
      requestedAt: startedAt, completedAt: new Date().toISOString(), blockNumber: BigInt(blockTag).toString(), ...inspection,
      proxy: { detected: Boolean(inspection.minimalProxy || implementationAddress), minimalProxy: inspection.minimalProxy, implementationAddress, implementationSlotObserved: implementationSlot !== null },
      evidenceCompleteness: { bytecode: "observed", proxySlots: implementationSlot === null ? "unavailable" : "observed", privilegedMethods: "unsupported", transferRestrictions: "unsupported", taxes: "unsupported", honeypot: "unsupported", ownership: "unsupported", threatHistory: "unsupported" },
    };
    evidence.evidenceHash = hashHex(JSON.stringify(evidence));
    return evidence;
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return { schemaVersion: SCHEMA_VERSION, status: timedOut ? "timed_out" : "failed", requested: true, chainFamily: "EVM", contractAddress: lower(address), providerId: config.providerId, errorClassification: timedOut ? "PROVIDER_TIMEOUT" : clean(error.code || "PROVIDER_ERROR"), message: clean(error.message), evidenceCompleteness: { bytecode: "unavailable", proxySlots: "unavailable" } };
  } finally { clearTimeout(timeout); }
}
function settings(policy = {}) {
  const rules = object(policy.structuredRules);
  const config = object(rules.assetContractRisk);
  return {
    required: config.required === true,
    unavailableAction: normalizeAction(config.unavailableAction, config.required ? "review" : "warn"),
    unsupportedAction: normalizeAction(config.unsupportedAction, config.required ? "review" : "warn"),
    noCodeAction: normalizeAction(config.noCodeAction, "block"),
    proxyAction: normalizeAction(config.proxyAction, "review"),
    delegateCallAction: normalizeAction(config.delegateCallAction, "review"),
    selfDestructAction: normalizeAction(config.selfDestructAction, "review"),
    allowedCodeHashes: Array.isArray(config.allowedCodeHashes) ? config.allowedCodeHashes.map(lower).filter(Boolean) : [],
    blockedCodeHashes: Array.isArray(config.blockedCodeHashes) ? config.blockedCodeHashes.map(lower).filter(Boolean) : [],
    allowedImplementationAddresses: Array.isArray(config.allowedImplementationAddresses) ? config.allowedImplementationAddresses.map(lower).filter(Boolean) : [],
  };
}
export function evaluateAssetContractRisk({ request = {}, policy = {} } = {}) {
  const config = settings(policy);
  const evidence = object(request.assetContractRiskEvidence);
  const state = { hardBlock: false, needsReview: false, scoreDelta: 0, findings: [], checksPassed: [], checksFailed: [], context: { ...evidence, policy: config } };
  if (evidence.status === "not_applicable" || !evidence.status) return state;
  if (["unsupported", "unavailable", "failed", "timed_out"].includes(evidence.status)) {
    const action = evidence.status === "unsupported" ? config.unsupportedAction : config.unavailableAction;
    const message = `Asset contract risk evidence is ${evidence.status.replace("_", " ")}.`;
    state.findings.push(finding({ status: action === "block" ? "fail" : "warning", severity: config.required ? "high" : "medium", rule: "Asset contract evidence availability", message, evidence: { status: evidence.status, classification: evidence.errorClassification }, remediation: "Configure a trusted supported provider or use an asset contract whose structural evidence can be verified." }));
    applyAction(state, action, message);
    return state;
  }
  const codeHash = lower(evidence.codeHash);
  if (!evidence.present) {
    const message = "The resolved asset contract address has no deployed bytecode at the inspected block.";
    state.findings.push(finding({ status: config.noCodeAction === "block" ? "fail" : "warning", severity: "critical", rule: "Deployed asset contract code", message, evidence: { contractAddress: evidence.contractAddress, blockNumber: evidence.blockNumber }, remediation: "Verify the asset contract address, network, and deployment state." }));
    applyAction(state, config.noCodeAction, message, 50);
  }
  if (config.blockedCodeHashes.includes(codeHash)) {
    const message = "The asset contract bytecode hash is blocked by policy.";
    state.hardBlock = true; state.scoreDelta += 60; state.checksFailed.push(message);
    state.findings.push(finding({ status: "fail", severity: "critical", rule: "Blocked asset bytecode", message, evidence: { codeHash }, remediation: "Use an asset contract permitted by policy." }));
  }
  if (config.allowedCodeHashes.length && !config.allowedCodeHashes.includes(codeHash)) {
    const message = "The asset contract bytecode hash is not on the policy allowlist.";
    state.hardBlock = true; state.scoreDelta += 55; state.checksFailed.push(message);
    state.findings.push(finding({ status: "fail", severity: "critical", rule: "Allowed asset bytecode", message, evidence: { codeHash }, remediation: "Use an approved code hash or update the policy through an authorized administrator." }));
  }
  if (evidence.proxy?.detected) {
    const implementation = lower(evidence.proxy.implementationAddress);
    const approved = implementation && config.allowedImplementationAddresses.includes(implementation);
    if (!approved) {
      const message = "The asset contract appears upgradeable or delegates execution through a proxy, and its implementation is not explicitly approved.";
      state.findings.push(finding({ status: config.proxyAction === "block" ? "fail" : "warning", severity: "high", rule: "Asset proxy implementation", message, evidence: evidence.proxy, remediation: "Approve the exact implementation address or use a non-upgradeable/verified asset contract." }));
      applyAction(state, config.proxyAction, message, 30);
    }
  }
  if (evidence.containsDelegateCallOpcode && !evidence.proxy?.detected) {
    const message = "The asset bytecode contains delegate-call capability that could not be bound to an approved proxy implementation.";
    state.findings.push(finding({ status: config.delegateCallAction === "block" ? "fail" : "warning", severity: "high", rule: "Unbound delegate-call capability", message, evidence: { codeHash }, remediation: "Review the verified source and approve the exact implementation model before execution." }));
    applyAction(state, config.delegateCallAction, message, 25);
  }
  if (evidence.containsSelfDestructOpcode) {
    const message = "The asset bytecode contains a destructive opcode indicator; bytecode presence alone does not prove reachability.";
    state.findings.push(finding({ status: config.selfDestructAction === "block" ? "fail" : "warning", severity: "high", rule: "Destructive opcode indicator", message, evidence: { codeHash }, remediation: "Review verified source and execution reachability before authorizing the asset." }));
    applyAction(state, config.selfDestructAction, message, 22);
  }
  if (!state.hardBlock && !state.needsReview && state.findings.length === 0) {
    const message = "The asset contract has deployed bytecode and no configured structural contract-risk rule was triggered.";
    state.checksPassed.push(message);
    state.findings.push(finding({ status: "pass", rule: "Asset contract structural evidence", message, evidence: { contractAddress: evidence.contractAddress, codeHash, blockNumber: evidence.blockNumber, evidenceCompleteness: evidence.evidenceCompleteness } }));
  }
  return state;
}
