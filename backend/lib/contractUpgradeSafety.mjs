import { createHash } from "node:crypto";

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const CASPER_ID = /^(?:contract-hash-|contract-|contract-package-hash-|contract-package-|package-|hash-)?[0-9a-f]{64}$/i;
const CODE_HASH = /^(?:0x)?[0-9a-f]{64}$/i;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function number(value, fallback = null) { if (value === undefined || value === null || value === "") return fallback; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function normalizeMode(value) { const v = lower(value); if (v === "observe") return "Observe"; if (["enforce", "block"].includes(v)) return "Enforce"; return "Review"; }
function normalizeAction(value, fallback = "Review") { const v = lower(value); if (["warn", "observe", "allow"].includes(v)) return "Warn"; if (["block", "enforce"].includes(v)) return "Block"; if (v === "review") return "Review"; return fallback; }
function canonical(value) { return lower(value).replace(/^contract-hash-/, "contract-").replace(/^contract-package-hash-/, "contract-package-"); }
function validIdentity(value) { const v = clean(value); return EVM_ADDRESS.test(v) || CASPER_ID.test(v) || REFERENCE.test(v); }
function unique(value, mapper = (x) => x) { return [...new Set((Array.isArray(value) ? value : []).map(mapper).filter(Boolean))]; }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.keys(value).sort().reduce((a,k)=>{a[k]=canonicalize(value[k]);return a;},{}); return value; }

function settings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.contractUpgradeControlsEnabled === true,
    mode: normalizeMode(rules.contractUpgradeMode),
    approvedImplementations: unique(rules.contractUpgradeApprovedImplementations, canonical),
    blockedImplementations: unique(rules.contractUpgradeBlockedImplementations, canonical),
    requiresApproval: rules.contractUpgradeRequiresApproval !== false,
    quorum: Math.max(1, Math.min(10, Math.trunc(number(rules.contractUpgradeQuorum, 2)))),
    delaySeconds: Math.max(0, Math.trunc(number(rules.contractUpgradeDelaySeconds, 0))),
    requireCodeHash: rules.contractUpgradeRequireCodeHash === true,
    unknownImplementationAction: normalizeAction(rules.contractUpgradeUnknownImplementationAction, "Review"),
    requireAdministrator: rules.contractUpgradeRequireAdministrator !== false,
    approvedAdministrators: unique(rules.contractUpgradeApprovedAdministrators || rules.approvedAdministrators, canonical),
  };
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) { return { module: "Contract Upgrade Safety", status, severity, rule, message, evidence, remediation }; }
function add(state, status, rule, message, evidence = {}, remediation = "", severity = "info") { state.findings.push(finding({ status, severity, rule, message, evidence, remediation })); if (status === "pass") state.checksPassed.push(message); if (["fail","warning","unavailable"].includes(status)) state.checksFailed.push(message); }
function fail(state, rule, message, evidence, remediation, hard = true) { add(state,"fail",rule,message,evidence,remediation,"high"); state.scoreDelta += 24; if (hard) state.hardBlock = true; }
function review(state, config, rule, message, evidence, remediation, action = "Review") { const block = action === "Block" || config.mode === "Enforce"; if (block) return fail(state,rule,message,evidence,remediation,true); add(state,"warning",rule,message,evidence,remediation,"medium"); state.scoreDelta += 12; if (action !== "Warn" && config.mode !== "Observe") state.needsReview = true; }

export function buildContractUpgradeFingerprint(input = {}) {
  const payload = {
    contract: canonical(input.contract), package: canonical(input.package), currentImplementation: canonical(input.currentImplementation),
    requestedImplementation: canonical(input.requestedImplementation), currentCodeHash: lower(input.currentCodeHash), requestedCodeHash: lower(input.requestedCodeHash),
    packageVersion: clean(input.packageVersion), upgradeAdministrator: canonical(input.upgradeAdministrator), network: lower(input.network),
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(payload)), "utf8").digest("hex");
}

function context(request = {}) {
  const privilegedUpgrade = ["Proxy Upgrade","Implementation Change"].includes(clean(request.privilegedActionClassifiedAction));
  const supplied = Boolean(request.contractUpgradeMetadataSupplied);
  const requestedImplementation = clean(request.contractUpgradeRequestedImplementation || request.privilegedActionImplementation || request.privilegedActionRequestedValue);
  const result = {
    metadataSupplied: supplied,
    privilegedUpgrade,
    contract: clean(request.contractUpgradeContract || request.privilegedActionContract || request.target),
    package: clean(request.contractUpgradePackage || request.privilegedActionPackage || request.contractPackageHash),
    currentImplementation: clean(request.contractUpgradeCurrentImplementation || request.privilegedActionCurrentValue),
    requestedImplementation,
    currentCodeHash: clean(request.contractUpgradeCurrentCodeHash),
    requestedCodeHash: clean(request.contractUpgradeRequestedCodeHash),
    packageVersion: clean(request.contractUpgradePackageVersion),
    upgradeAdministrator: clean(request.contractUpgradeAdministrator || request.privilegedActionRecipient),
    requestedAt: clean(request.contractUpgradeRequestedAt),
    executeAfter: clean(request.contractUpgradeExecuteAfter),
    network: clean(request.contractUpgradeNetwork || request.privilegedActionNetwork || request.chainName),
    requestNetwork: clean(request.chainName),
    target: clean(request.target),
  };
  result.parameterFingerprint = (supplied || privilegedUpgrade) ? buildContractUpgradeFingerprint(result) : "";
  return result;
}

export function evaluateContractUpgradeSafety({ request = {}, policy = {}, now = new Date() } = {}) {
  const config = settings(policy); const ctx = context(request);
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false, context: null };
  if (!ctx.metadataSupplied && !ctx.privilegedUpgrade) { add(state,"skipped","Contract upgrade applicability","The request is not classified as a contract upgrade and contains no contract-upgrade metadata."); return state; }
  if (!config.enabled) { add(state,"skipped","Contract upgrade controls enabled","Contract Upgrade Safety is not enabled by the active policy.",{ policyId: policy?.id || "" }); return state; }

  if (!ctx.contract && !ctx.package && !ctx.target) fail(state,"Upgrade target binding","Contract upgrade is missing its target contract or package.",{},"Provide the exact current contract or package identifier.");
  else if (ctx.contract && ctx.target && canonical(ctx.contract) !== canonical(ctx.target)) fail(state,"Upgrade target binding","Upgrade metadata target does not match the transaction target.",{ upgradeContract: ctx.contract, transactionTarget: ctx.target },"Bind the upgrade metadata to the exact target contract.");
  else add(state,"pass","Upgrade target binding","Contract upgrade is bound to the transaction target.",{ contract: ctx.contract || ctx.target, package: ctx.package });

  if (ctx.requestNetwork && ctx.network && lower(ctx.requestNetwork) !== lower(ctx.network)) fail(state,"Upgrade network binding","Upgrade metadata is bound to a different network.",{ metadataNetwork: ctx.network, transactionNetwork: ctx.requestNetwork },"Bind the upgrade to the exact transaction network.");
  else if (ctx.network || ctx.requestNetwork) add(state,"pass","Upgrade network binding","Upgrade metadata is bound to the transaction network.",{ network: ctx.network || ctx.requestNetwork });
  else review(state,config,"Upgrade network binding","No network binding was supplied for this upgrade.",{},"Include chainName or contractUpgrade.network.");

  if (!ctx.currentImplementation) review(state,config,"Current implementation evidence","The current implementation was not supplied.",{},"Read and include the current implementation from a trusted chain-data provider.");
  else if (!validIdentity(ctx.currentImplementation)) fail(state,"Current implementation format","Current implementation identifier is malformed.",{ currentImplementation: ctx.currentImplementation },"Provide a valid contract, account, or implementation reference.");
  else add(state,"pass","Current implementation evidence","Current implementation is present and structurally valid.",{ currentImplementation: ctx.currentImplementation });

  if (!ctx.requestedImplementation) fail(state,"Requested implementation required","Contract upgrade is missing the requested implementation.",{},"Provide the exact proposed implementation before requesting approval.");
  else if (!validIdentity(ctx.requestedImplementation)) fail(state,"Requested implementation format","Requested implementation identifier is malformed.",{ requestedImplementation: ctx.requestedImplementation },"Provide a valid implementation identifier.");
  else if (ctx.currentImplementation && canonical(ctx.currentImplementation) === canonical(ctx.requestedImplementation)) fail(state,"Implementation must change","Requested implementation matches the current implementation.",{ implementation: ctx.requestedImplementation },"Cancel the no-op upgrade or provide the intended new implementation.");
  else add(state,"pass","Requested implementation format","Requested implementation is structurally valid.",{ requestedImplementation: ctx.requestedImplementation });

  const requested = canonical(ctx.requestedImplementation);
  if (requested && config.blockedImplementations.includes(requested)) fail(state,"Blocked implementation","Requested implementation is explicitly blocked by policy.",{ requestedImplementation: ctx.requestedImplementation },"Do not execute this upgrade. Select an approved implementation.");
  else if (requested && config.approvedImplementations.length && !config.approvedImplementations.includes(requested)) review(state,config,"Approved implementation allowlist","Requested implementation is not on the approved implementation allowlist.",{ requestedImplementation: ctx.requestedImplementation, approvedImplementations: config.approvedImplementations },"Approve the implementation through governance or update policy after security review.",config.unknownImplementationAction);
  else if (requested) add(state,"pass","Approved implementation allowlist",config.approvedImplementations.length ? "Requested implementation is approved by policy." : "No implementation allowlist is configured; policy-mode handling remains active.",{ requestedImplementation: ctx.requestedImplementation });

  if (config.requireCodeHash) {
    if (!ctx.requestedCodeHash) review(state,config,"Requested code hash required","Policy requires the proposed implementation code hash, but none was supplied.",{},"Provide the verified proposed implementation code hash.");
    else if (!CODE_HASH.test(ctx.requestedCodeHash)) fail(state,"Requested code hash format","Requested implementation code hash is malformed.",{ requestedCodeHash: ctx.requestedCodeHash },"Provide a 32-byte hexadecimal code hash.");
    else add(state,"pass","Requested code hash required","Requested implementation code hash is present and valid.",{ requestedCodeHash: ctx.requestedCodeHash });
  } else add(state,"skipped","Requested code hash required","The active policy does not require a code hash.");

  if (config.requireAdministrator) {
    if (!ctx.upgradeAdministrator) review(state,config,"Upgrade administrator required","Upgrade administrator evidence is missing.",{},"Include the authorized upgrade administrator identity.");
    else if (!validIdentity(ctx.upgradeAdministrator)) fail(state,"Upgrade administrator format","Upgrade administrator identity is malformed.",{ upgradeAdministrator: ctx.upgradeAdministrator },"Provide a valid administrator identity.");
    else if (config.approvedAdministrators.length && !config.approvedAdministrators.includes(canonical(ctx.upgradeAdministrator))) fail(state,"Approved upgrade administrator","Upgrade administrator is not authorized by policy.",{ upgradeAdministrator: ctx.upgradeAdministrator, approvedAdministrators: config.approvedAdministrators },"Use an approved administrator or update governance policy.");
    else add(state,"pass","Approved upgrade administrator","Upgrade administrator is authorized by policy.",{ upgradeAdministrator: ctx.upgradeAdministrator });
  }

  const executeAfterMs = ctx.executeAfter ? Date.parse(ctx.executeAfter) : NaN;
  const requestedAtMs = ctx.requestedAt ? Date.parse(ctx.requestedAt) : now.getTime();
  const minimumExecuteAt = config.delaySeconds > 0 ? requestedAtMs + config.delaySeconds * 1000 : NaN;
  const effectiveExecuteAfterMs = config.delaySeconds > 0
    ? (Number.isFinite(executeAfterMs) ? Math.max(executeAfterMs, minimumExecuteAt) : minimumExecuteAt)
    : (Number.isFinite(executeAfterMs) ? executeAfterMs : NaN);
  if (config.delaySeconds > 0) {
    if (!Number.isFinite(executeAfterMs)) review(state,config,"Upgrade delay enforced","Policy requires an upgrade delay, but executeAfter is missing or invalid.",{ delaySeconds: config.delaySeconds },"Set executeAfter to at least the configured delay after requestedAt.");
    else if (executeAfterMs < minimumExecuteAt) fail(state,"Upgrade delay enforced","The proposed execution time does not satisfy the required upgrade delay.",{ executeAfter: ctx.executeAfter, minimumExecuteAt: new Date(minimumExecuteAt).toISOString(), delaySeconds: config.delaySeconds },"Wait for the configured delay and create a fresh approval-bound intent.");
    else if (now.getTime() < executeAfterMs) review(state,config,"Upgrade execution window","The upgrade delay has not elapsed yet.",{ executeAfter: ctx.executeAfter, now: now.toISOString() },"Wait until executeAfter before submitting the execution transaction.");
    else add(state,"pass","Upgrade delay enforced","Configured upgrade delay has elapsed.",{ executeAfter: ctx.executeAfter, delaySeconds: config.delaySeconds });
  } else add(state,"skipped","Upgrade delay enforced","No upgrade delay is configured.");

  if (config.requiresApproval) { state.needsReview = true; add(state,"warning","Upgrade approval required",`Contract upgrade requires Human Approval with a quorum of at least ${config.quorum}.`,{ requiredApprovalCount: config.quorum, parameterFingerprint: ctx.parameterFingerprint },"Complete exact-bound Human Approval before wallet signing.","high"); state.scoreDelta += 16; }
  else add(state,"pass","Upgrade approval required","The active policy does not require a dedicated contract-upgrade approval.");

  state.context = {
    ...ctx,
    effectiveExecuteAfter: Number.isFinite(effectiveExecuteAfterMs) ? new Date(effectiveExecuteAfterMs).toISOString() : "",
    config: { mode: config.mode, requiresApproval: config.requiresApproval, quorum: config.quorum, delaySeconds: config.delaySeconds, requireCodeHash: config.requireCodeHash },
    requiredApprovalCount: config.requiresApproval ? config.quorum : 0,
    approvalRequired: config.requiresApproval,
  };
  return state;
}
