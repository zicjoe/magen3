import { createHash } from "node:crypto";
import { isContractIntent } from "./contractValidation.mjs";

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const CASPER_PUBLIC_KEY = /^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const CASPER_ACCOUNT_HASH = /^account-hash-[0-9a-f]{64}$/i;
const CASPER_CONTRACT = /^(?:(?:contract|contract-hash|contract-package|contract-package-hash|package|hash)-)?[0-9a-f]{64}$/i;
const ARGUMENT_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/;

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function array(value) { return Array.isArray(value) ? value : []; }
function uniqueStrings(value) { return [...new Set(array(value).map(clean).filter(Boolean))]; }
function normalizeMode(value) { const v = lower(value); if (v === "observe") return "Observe"; if (["enforce", "block"].includes(v)) return "Enforce"; return "Review"; }
function normalizeAction(value, fallback = "Review") { const v = lower(value); if (["warn", "observe", "allow"].includes(v)) return "Warn"; if (["block", "enforce"].includes(v)) return "Block"; if (v === "review") return "Review"; return fallback; }
function canonicalContract(value) {
  const v = lower(value);
  if (!v) return "";
  return v
    .replace(/^contract-hash-/, "contract-")
    .replace(/^contract-package-hash-/, "contract-package-")
    .replace(/^package-/, "contract-package-");
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => { out[key] = canonicalize(value[key]); return out; }, {});
  return value;
}
function unwrap(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Object.prototype.hasOwnProperty.call(value, "parsed")) return value.parsed;
    if (Object.prototype.hasOwnProperty.call(value, "value")) return value.value;
  }
  return value;
}
function displayValue(value) {
  const unwrapped = unwrap(value);
  if (typeof unwrapped === "string") return unwrapped.length > 180 ? `${unwrapped.slice(0, 177)}...` : unwrapped;
  if (typeof unwrapped === "number" || typeof unwrapped === "boolean" || unwrapped === null) return unwrapped;
  try {
    const serialized = JSON.stringify(canonicalize(unwrapped));
    return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
  } catch {
    return "[unserializable argument]";
  }
}
function numberValue(value) {
  const unwrapped = unwrap(value);
  if (typeof unwrapped === "number") return Number.isFinite(unwrapped) ? unwrapped : null;
  if (typeof unwrapped === "string" && /^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(unwrapped.trim())) {
    const parsed = Number(unwrapped);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function isIntegerValue(value) {
  const numeric = numberValue(value);
  return numeric !== null && Number.isInteger(numeric);
}
function isAddress(value) {
  const v = clean(unwrap(value));
  return EVM_ADDRESS.test(v) || CASPER_PUBLIC_KEY.test(v) || CASPER_ACCOUNT_HASH.test(v) || CASPER_CONTRACT.test(v);
}
function actualType(value) {
  const unwrapped = unwrap(value);
  if (unwrapped === null) return "null";
  if (Array.isArray(unwrapped)) return "array";
  return typeof unwrapped === "object" ? "object" : typeof unwrapped;
}
function matchesType(value, expected) {
  const type = lower(expected);
  const unwrapped = unwrap(value);
  if (["string", "text", "bytes", "hash"].includes(type)) return typeof unwrapped === "string";
  if (["number", "decimal", "float"].includes(type)) return numberValue(unwrapped) !== null;
  if (["integer", "int", "u8", "u32", "u64", "u128", "u256", "u512"].includes(type)) return isIntegerValue(unwrapped);
  if (["boolean", "bool"].includes(type)) return typeof unwrapped === "boolean";
  if (["address", "account", "contract", "recipient"].includes(type)) return isAddress(unwrapped);
  if (["array", "list", "tuple"].includes(type)) return Array.isArray(unwrapped);
  if (["object", "map"].includes(type)) return Boolean(unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped));
  if (type === "null") return unwrapped === null;
  return false;
}

function settings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.contractArgumentControlsEnabled === true,
    mode: normalizeMode(rules.contractArgumentMode),
    unknownRuleAction: normalizeAction(rules.contractArgumentUnknownRuleAction, "Review"),
    unknownArgumentAction: normalizeAction(rules.contractArgumentUnknownArgumentAction, "Review"),
    rules: array(rules.contractArgumentRules).slice(0, 100),
  };
}

function normalizeRule(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { valid: false, errors: ["Rule must be an object."], index };
  const contract = canonicalContract(raw.contract || raw.target || raw.contractIdentifier);
  const entryPoint = clean(raw.entryPoint || raw.entry_point || raw.method);
  const requiredArgs = uniqueStrings(raw.requiredArgs || raw.required_args);
  const allowedArgs = uniqueStrings(raw.allowedArgs || raw.allowed_args);
  const argumentTypes = raw.argumentTypes && typeof raw.argumentTypes === "object" && !Array.isArray(raw.argumentTypes) ? raw.argumentTypes : {};
  const numericLimits = raw.numericLimits && typeof raw.numericLimits === "object" && !Array.isArray(raw.numericLimits) ? raw.numericLimits : {};
  const addressRules = raw.addressRules && typeof raw.addressRules === "object" && !Array.isArray(raw.addressRules) ? raw.addressRules : {};
  const booleanRules = raw.booleanRules && typeof raw.booleanRules === "object" && !Array.isArray(raw.booleanRules) ? raw.booleanRules : {};
  const enumRules = raw.enumRules && typeof raw.enumRules === "object" && !Array.isArray(raw.enumRules) ? raw.enumRules : {};
  const errors = [];
  if (!contract) errors.push("contract is required");
  if (!entryPoint) errors.push("entryPoint is required");
  for (const name of [...requiredArgs, ...allowedArgs, ...Object.keys(argumentTypes), ...Object.keys(numericLimits), ...Object.keys(addressRules), ...Object.keys(booleanRules), ...Object.keys(enumRules)]) {
    if (!ARGUMENT_NAME.test(name)) errors.push(`Invalid argument name: ${name}`);
  }
  const inferredAllowed = uniqueStrings([
    ...requiredArgs,
    ...Object.keys(argumentTypes),
    ...Object.keys(numericLimits),
    ...Object.keys(addressRules),
    ...Object.keys(booleanRules),
    ...Object.keys(enumRules),
  ]);
  return {
    valid: errors.length === 0,
    errors,
    index,
    id: clean(raw.id || raw.name || `${contract}:${entryPoint}`),
    contract,
    entryPoint,
    requiredArgs,
    allowedArgs: allowedArgs.length > 0 ? allowedArgs : inferredAllowed,
    argumentTypes,
    numericLimits,
    addressRules,
    booleanRules,
    enumRules,
    unknownArgumentAction: normalizeAction(raw.unknownArgumentAction || raw.unknown_argument_action, ""),
  };
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Contract Argument Policies", status, severity, rule, message, evidence, remediation };
}
function add(state, status, rule, message, evidence = {}, remediation = "", severity = "info") {
  state.findings.push(finding({ status, severity, rule, message, evidence, remediation }));
  if (status === "pass") state.checksPassed.push(message);
  if (["fail", "warning", "unavailable"].includes(status)) state.checksFailed.push(message);
}
function hardFail(state, rule, message, evidence, remediation, severity = "high") {
  add(state, "fail", rule, message, evidence, remediation, severity);
  state.scoreDelta += severity === "critical" ? 35 : 24;
  state.hardBlock = true;
  state.violations.push({ rule, message });
}
function policyViolation(state, config, action, rule, message, evidence, remediation, severity = "medium") {
  const effective = action || (config.mode === "Enforce" ? "Block" : config.mode === "Observe" ? "Warn" : "Review");
  if (effective === "Block") return hardFail(state, rule, message, evidence, remediation, severity === "medium" ? "high" : severity);
  add(state, "warning", rule, message, evidence, remediation, severity);
  state.scoreDelta += 12;
  state.violations.push({ rule, message });
  if (effective !== "Warn") state.needsReview = true;
}
function unavailable(state, config, rule, message, evidence, remediation) {
  if (config.mode === "Enforce") return hardFail(state, rule, message, evidence, remediation);
  add(state, "unavailable", rule, message, evidence, remediation, "medium");
  state.scoreDelta += 12;
  state.needsReview = config.mode !== "Observe";
  state.violations.push({ rule, message });
}

export function buildContractArgumentFingerprint({ target = "", entryPoint = "", runtimeArgs = {} } = {}) {
  const payload = { target: canonicalContract(target), entryPoint: clean(entryPoint), runtimeArgs: canonicalize(runtimeArgs || {}) };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export function evaluateContractArgumentPolicies({ request = {}, policy = {} } = {}) {
  const config = settings(policy);
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false, violations: [], context: null };
  const contractIntent = isContractIntent(request);
  const target = clean(request.target);
  const entryPoint = clean(request.entryPoint);
  const runtimeArgs = request.runtimeArgs && typeof request.runtimeArgs === "object" && !Array.isArray(request.runtimeArgs) ? request.runtimeArgs : null;

  if (!contractIntent || !entryPoint) {
    add(state, "skipped", "Contract argument applicability", "The request is not a direct contract call with an entry point, so Contract Argument Policies were not applicable.");
    return state;
  }
  if (!config.enabled) {
    add(state, "skipped", "Contract argument controls enabled", "Contract Argument Policies are not enabled by the active policy.", { policyId: policy?.id || "" });
    return state;
  }

  const normalizedRules = config.rules.map(normalizeRule);
  const invalidRules = normalizedRules.filter((rule) => !rule.valid);
  if (invalidRules.length > 0) {
    unavailable(state, config, "Valid contract argument configuration", "One or more Contract Argument Policy rules are malformed.", { invalidRules: invalidRules.map((rule) => ({ index: rule.index, errors: rule.errors })) }, "Fix the malformed contractArgumentRules before authorizing contract execution.");
  }

  const targetCanonical = canonicalContract(target);
  const matching = normalizedRules.filter((rule) => rule.valid && rule.contract === targetCanonical && rule.entryPoint === entryPoint);
  if (matching.length > 1) {
    hardFail(state, "Unique contract argument rule", "Multiple Contract Argument Policy rules match the same contract and entry point.", { target, entryPoint, matchingRuleIds: matching.map((rule) => rule.id) }, "Keep exactly one rule for each contract and entry point.");
    state.context = { target, entryPoint, parameterFingerprint: buildContractArgumentFingerprint({ target, entryPoint, runtimeArgs: runtimeArgs || {} }), matchingRuleIds: matching.map((rule) => rule.id), evaluatedArguments: Object.keys(runtimeArgs || {}), violations: state.violations };
    return state;
  }
  if (matching.length === 0) {
    policyViolation(state, config, config.unknownRuleAction, "Configured contract argument rule", "No Contract Argument Policy rule matches this contract and entry point.", { target, entryPoint, configuredRuleCount: normalizedRules.filter((rule) => rule.valid).length }, "Add an exact contractArgumentRules entry for this contract and entry point or disable the control for this policy.");
    state.context = { target, entryPoint, parameterFingerprint: buildContractArgumentFingerprint({ target, entryPoint, runtimeArgs: runtimeArgs || {} }), matchingRuleId: "", evaluatedArguments: Object.keys(runtimeArgs || {}), violations: state.violations };
    return state;
  }

  const rule = matching[0];
  add(state, "pass", "Configured contract argument rule", "A deterministic Contract Argument Policy rule matches the exact contract and entry point.", { ruleId: rule.id, target, entryPoint });

  const args = runtimeArgs || {};
  const argNames = Object.keys(args);
  const fingerprint = buildContractArgumentFingerprint({ target, entryPoint, runtimeArgs: args });

  for (const required of rule.requiredArgs) {
    if (!Object.prototype.hasOwnProperty.call(args, required) || unwrap(args[required]) === undefined || unwrap(args[required]) === null || unwrap(args[required]) === "") {
      policyViolation(state, config, "", "Required contract argument", `Required contract argument '${required}' is missing.`, { argument: required, target, entryPoint }, `Supply '${required}' exactly as required by the active contract argument rule.`);
    } else {
      add(state, "pass", "Required contract argument", `Required contract argument '${required}' is present.`, { argument: required });
    }
  }

  if (rule.allowedArgs.length > 0) {
    const unknown = argNames.filter((name) => !rule.allowedArgs.includes(name));
    for (const name of unknown) {
      policyViolation(state, config, rule.unknownArgumentAction || config.unknownArgumentAction, "Allowed contract arguments", `Contract argument '${name}' is not allowed for this entry point.`, { argument: name, receivedValue: displayValue(args[name]), allowedArgs: rule.allowedArgs }, `Remove '${name}' or explicitly add it to allowedArgs for this contract and entry point.`);
    }
    if (unknown.length === 0) add(state, "pass", "Allowed contract arguments", "Every supplied runtime argument is allowed by the matching rule.", { suppliedArgs: argNames, allowedArgs: rule.allowedArgs });
  } else {
    add(state, "skipped", "Allowed contract arguments", "The matching rule does not restrict argument names.", { suppliedArgs: argNames });
  }

  for (const [name, expected] of Object.entries(rule.argumentTypes)) {
    if (!Object.prototype.hasOwnProperty.call(args, name)) continue;
    if (!matchesType(args[name], expected)) {
      policyViolation(state, config, "", "Contract argument type", `Contract argument '${name}' does not match the required type '${expected}'.`, { argument: name, receivedType: actualType(args[name]), expectedType: expected, receivedValue: displayValue(args[name]) }, `Encode '${name}' as ${expected} before retrying.`);
    } else add(state, "pass", "Contract argument type", `Contract argument '${name}' matches type '${expected}'.`, { argument: name, expectedType: expected });
  }

  for (const [name, limitsRaw] of Object.entries(rule.numericLimits)) {
    if (!Object.prototype.hasOwnProperty.call(args, name)) continue;
    const limits = limitsRaw && typeof limitsRaw === "object" && !Array.isArray(limitsRaw) ? limitsRaw : {};
    const received = numberValue(args[name]);
    const min = limits.min === undefined || limits.min === null || limits.min === "" ? null : Number(limits.min);
    const max = limits.max === undefined || limits.max === null || limits.max === "" ? null : Number(limits.max);
    if (received === null) {
      policyViolation(state, config, "", "Contract argument numeric limit", `Contract argument '${name}' is not numeric.`, { argument: name, receivedValue: displayValue(args[name]), minimum: Number.isFinite(min) ? min : null, maximum: Number.isFinite(max) ? max : null }, `Supply a numeric value for '${name}'.`);
      continue;
    }
    if ((Number.isFinite(min) && received < min) || (Number.isFinite(max) && received > max)) {
      policyViolation(state, config, "", "Contract argument numeric limit", `Contract argument '${name}' is outside its permitted numeric range.`, { argument: name, receivedValue: received, minimum: Number.isFinite(min) ? min : null, maximum: Number.isFinite(max) ? max : null }, `Use a value within the configured range for '${name}'.`);
    } else add(state, "pass", "Contract argument numeric limit", `Contract argument '${name}' is within its permitted numeric range.`, { argument: name, receivedValue: received, minimum: Number.isFinite(min) ? min : null, maximum: Number.isFinite(max) ? max : null });
  }

  for (const [name, addressRuleRaw] of Object.entries(rule.addressRules)) {
    if (!Object.prototype.hasOwnProperty.call(args, name)) continue;
    const addressRule = addressRuleRaw && typeof addressRuleRaw === "object" && !Array.isArray(addressRuleRaw) ? addressRuleRaw : {};
    const received = clean(unwrap(args[name]));
    const canonicalReceived = canonicalContract(received);
    const allowed = uniqueStrings(addressRule.allowed || addressRule.allowlist).map(canonicalContract);
    const blocked = uniqueStrings(addressRule.blocked || addressRule.blocklist).map(canonicalContract);
    if (!isAddress(received)) {
      policyViolation(state, config, "", "Contract argument address format", `Contract argument '${name}' is not a valid supported address.`, { argument: name, receivedValue: displayValue(received) }, `Provide a valid Casper or EVM address for '${name}'.`);
    } else if (blocked.includes(canonicalReceived)) {
      hardFail(state, "Blocked contract argument address", `Contract argument '${name}' contains a blocked address.`, { argument: name, receivedValue: received }, `Remove the blocked address from '${name}'.`);
    } else if (allowed.length > 0 && !allowed.includes(canonicalReceived)) {
      policyViolation(state, config, "", "Allowed contract argument address", `Contract argument '${name}' is not in its address allowlist.`, { argument: name, receivedValue: received, allowedAddresses: allowed }, `Use an approved address for '${name}' or update the policy deliberately.`);
    } else add(state, "pass", "Contract argument address policy", `Contract argument '${name}' satisfies its address policy.`, { argument: name, receivedValue: received });
  }

  for (const [name, booleanRuleRaw] of Object.entries(rule.booleanRules)) {
    if (!Object.prototype.hasOwnProperty.call(args, name)) continue;
    const booleanRule = booleanRuleRaw && typeof booleanRuleRaw === "object" && !Array.isArray(booleanRuleRaw) ? booleanRuleRaw : { allowed: array(booleanRuleRaw) };
    const allowed = array(booleanRule.allowed || booleanRule.allowedValues).filter((value) => typeof value === "boolean");
    const received = unwrap(args[name]);
    if (typeof received !== "boolean") {
      policyViolation(state, config, "", "Contract argument boolean policy", `Contract argument '${name}' is not boolean.`, { argument: name, receivedValue: displayValue(received), allowedValues: allowed }, `Supply true or false for '${name}'.`);
    } else if (allowed.length > 0 && !allowed.includes(received)) {
      policyViolation(state, config, "", "Contract argument boolean policy", `Contract argument '${name}' uses a forbidden boolean value.`, { argument: name, receivedValue: received, allowedValues: allowed }, `Use an allowed boolean value for '${name}'.`);
    } else add(state, "pass", "Contract argument boolean policy", `Contract argument '${name}' satisfies its boolean policy.`, { argument: name, receivedValue: received });
  }

  for (const [name, enumRaw] of Object.entries(rule.enumRules)) {
    if (!Object.prototype.hasOwnProperty.call(args, name)) continue;
    const allowed = uniqueStrings(Array.isArray(enumRaw) ? enumRaw : enumRaw?.allowed || enumRaw?.values);
    const received = clean(unwrap(args[name]));
    if (allowed.length === 0) {
      unavailable(state, config, "Valid contract argument enum policy", `Enum policy for '${name}' has no allowed values.`, { argument: name }, `Configure at least one allowed enum value for '${name}'.`);
    } else if (!allowed.includes(received)) {
      policyViolation(state, config, "", "Contract argument enum policy", `Contract argument '${name}' is not an allowed enum value.`, { argument: name, receivedValue: received, allowedValues: allowed }, `Use one of the configured enum values for '${name}'.`);
    } else add(state, "pass", "Contract argument enum policy", `Contract argument '${name}' is an allowed enum value.`, { argument: name, receivedValue: received });
  }

  state.context = {
    target,
    entryPoint,
    ruleId: rule.id,
    mode: config.mode,
    parameterFingerprint: fingerprint,
    evaluatedArguments: argNames,
    requiredArguments: rule.requiredArgs,
    allowedArguments: rule.allowedArgs,
    violations: state.violations,
    approvalBindingNote: "The existing Human Approval binding covers the complete normalized intent, including runtimeArgs and this fingerprint.",
  };
  return state;
}
