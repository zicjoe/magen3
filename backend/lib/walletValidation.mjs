import { classifyX402Recipient } from "./x402PaymentControls.mjs";

const ED25519_PUBLIC_KEY = /^01[0-9a-f]{64}$/i;
const SECP256K1_PUBLIC_KEY = /^02[0-9a-f]{66}$/i;
const ACCOUNT_HASH = /^account-hash-[0-9a-f]{64}$/i;

export const WALLET_DESTINATION_ACTIONS = new Set(["Transfer"]);

function clean(value) {
  return String(value ?? "").trim();
}

export function classifyCasperWalletIdentifier(value, { allowAccountHash = true } = {}) {
  const raw = clean(value);
  const normalized = raw.toLowerCase();

  if (!raw) {
    return {
      value: raw,
      normalized,
      valid: false,
      kind: "missing",
      reason: "No wallet identifier was provided.",
    };
  }

  if (ED25519_PUBLIC_KEY.test(raw)) {
    return {
      value: raw,
      normalized,
      valid: true,
      kind: "ed25519-public-key",
      label: "Ed25519 public key",
      reason: "Valid Casper Ed25519 public key format.",
    };
  }

  if (SECP256K1_PUBLIC_KEY.test(raw)) {
    return {
      value: raw,
      normalized,
      valid: true,
      kind: "secp256k1-public-key",
      label: "Secp256k1 public key",
      reason: "Valid Casper Secp256k1 public key format.",
    };
  }

  if (allowAccountHash && ACCOUNT_HASH.test(raw)) {
    return {
      value: raw,
      normalized,
      valid: true,
      kind: "account-hash",
      label: "Account hash",
      reason: "Valid Casper account-hash format.",
    };
  }

  return {
    value: raw,
    normalized,
    valid: false,
    kind: "invalid",
    reason: allowAccountHash
      ? "Expected a Casper Ed25519 or Secp256k1 public key, or an account-hash identifier."
      : "Expected a Casper Ed25519 or Secp256k1 public key that can sign an execution transaction.",
  };
}

export function isWalletDestinationIntent(request = {}) {
  return request.targetType === "Wallet Address" || WALLET_DESTINATION_ACTIONS.has(request.actionType);
}

export function normalizeTrustedTargets(policy = {}) {
  return (Array.isArray(policy.trustedContracts) ? policy.trustedContracts : [])
    .map((target) => clean(target).toLowerCase())
    .filter(Boolean);
}

export function exactWalletIdentifierMatch(a, b) {
  const left = clean(a).toLowerCase();
  const right = clean(b).toLowerCase();
  return Boolean(left && right && left === right);
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return {
    module: "Wallet Validation",
    status,
    severity,
    rule,
    message,
    evidence,
    remediation,
  };
}

export function evaluateWalletValidation({ request = {}, policy = {}, auditLogs = [], dailyUsed = 0 } = {}) {
  const findings = [];
  const checksPassed = [];
  const checksFailed = [];
  let scoreDelta = 0;
  let hardBlock = false;
  let needsReview = false;

  const executionWalletAddress = clean(request.executionWalletAddress || request.walletAddress);
  const ownerWalletAddress = clean(request.agentOwnerWalletAddress || request.ownerWalletAddress);
  const x402Payment = request.actionType === "x402 Payment";
  const executionWallet = x402Payment
    ? classifyX402Recipient(executionWalletAddress, request.x402Network)
    : classifyCasperWalletIdentifier(executionWalletAddress, { allowAccountHash: false });
  const executionWalletLabel = x402Payment
    ? executionWallet.family === "evm" ? "EVM payment address" : executionWallet.family === "solana" ? "Solana payment address" : "network payment address"
    : executionWallet.label;
  const walletDestination = isWalletDestinationIntent(request);
  const target = clean(request.target);
  const destination = classifyCasperWalletIdentifier(target, { allowAccountHash: true });
  const amount = Number(request.amount || 0);
  const maxTransaction = Number(policy.maxTransaction || 0);
  const dailyLimit = Number(policy.dailyLimit || 0);
  const approvalThreshold = Number(policy.approvalThreshold || 0);
  const projectedDailySpend = Number(dailyUsed || 0) + amount;
  const trustedTargets = normalizeTrustedTargets(policy);
  const destinationTrusted = Boolean(destination.normalized && trustedTargets.includes(destination.normalized));
  const strictMode = policy.riskMode === "Conservative";
  const relaxedMode = policy.riskMode === "Aggressive";

  if (!executionWalletAddress) {
    const message = x402Payment ? "x402 payment wallet address is missing." : "Execution wallet public key is missing.";
    checksFailed.push(message);
    scoreDelta += 45;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "critical",
      rule: "Execution wallet required",
      message,
      evidence: { executionWalletAddress: "", requiredFormat: x402Payment ? "Public payment-wallet address matching the selected CAIP-2 network" : "Casper Ed25519 or Secp256k1 public key" },
      remediation: x402Payment
        ? "Provide the public address of the wallet that will create PAYMENT-SIGNATURE. Never provide its private key or signed payment payload."
        : "Provide the public key of the wallet that would sign the real transaction. Never provide a private key.",
    }));
  } else if (!executionWallet.valid) {
    const message = x402Payment
      ? "Execution wallet does not match the selected x402 payment network."
      : "Execution wallet is not a valid Casper signing public key.";
    checksFailed.push(message);
    scoreDelta += 45;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "critical",
      rule: "Valid execution wallet format",
      message,
      evidence: {
        executionWalletAddress,
        detectedFormat: executionWallet.kind,
        expected: x402Payment
          ? "An EVM address for eip155 networks or a Solana base58 address for solana networks"
          : "66-character Ed25519 key beginning 01, or 68-character Secp256k1 key beginning 02",
        network: x402Payment ? request.x402Network || "" : "casper",
      },
      remediation: x402Payment
        ? "Use the public address of the wallet registered for the selected x402 network."
        : "Connect a Casper Wallet and submit its public key as executionWalletAddress before retrying.",
    }));
  } else {
    const message = `Execution wallet uses a valid ${executionWalletLabel} format.`;
    checksPassed.push(message);
    findings.push(finding({
      status: "pass",
      rule: "Valid execution wallet format",
      message,
      evidence: { executionWalletAddress, format: executionWallet.kind, network: x402Payment ? request.x402Network || "" : "casper" },
    }));
  }

  if (ownerWalletAddress) {
    const sameAsOwner = exactWalletIdentifierMatch(ownerWalletAddress, executionWalletAddress);
    findings.push(finding({
      status: "pass",
      rule: "Independent execution wallet context",
      message: sameAsOwner
        ? "The connected owner wallet is also the execution wallet for this request."
        : "The execution wallet is evaluated independently from the Magen3 owner wallet.",
      evidence: { sameAsOwner, ownerWalletAddress, executionWalletAddress },
    }));
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Independent execution wallet context",
      message: "Owner-wallet comparison was skipped because owner context was not supplied to this evaluation path.",
      evidence: { executionWalletAddress },
    }));
  }

  if (WALLET_DESTINATION_ACTIONS.has(request.actionType) && request.targetType !== "Wallet Address") {
    const message = `Transfer actions must classify the destination as Wallet Address, not ${request.targetType || "an unspecified target type"}.`;
    checksFailed.push(message);
    scoreDelta += 35;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "high",
      rule: "Wallet destination classification",
      message,
      evidence: { actionType: request.actionType, receivedTargetType: request.targetType || "" },
      remediation: "Set action.targetType to Wallet Address and provide a valid Casper wallet destination.",
    }));
  } else if (walletDestination) {
    findings.push(finding({
      status: "pass",
      rule: "Wallet destination classification",
      message: "The intent is correctly classified for wallet-destination validation.",
      evidence: { actionType: request.actionType, targetType: request.targetType },
    }));
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Wallet destination classification",
      message: "Destination-wallet checks were skipped because this intent targets a non-wallet resource.",
      evidence: { actionType: request.actionType, targetType: request.targetType },
    }));
  }

  if (walletDestination) {
    if (!target) {
      const message = "Wallet destination is missing.";
      checksFailed.push(message);
      scoreDelta += 35;
      hardBlock = true;
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Valid wallet destination",
        message,
        evidence: { target: "" },
        remediation: "Provide the recipient's Casper public key or account-hash identifier.",
      }));
    } else if (!destination.valid) {
      const message = "Wallet destination is not a valid Casper public key or account-hash identifier.";
      checksFailed.push(message);
      scoreDelta += 35;
      hardBlock = true;
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Valid wallet destination",
        message,
        evidence: { target, detectedFormat: destination.kind },
        remediation: "Replace the destination with a valid Casper public key or account-hash before retrying.",
      }));
    } else {
      const message = `Wallet destination uses a valid ${destination.label} format.`;
      checksPassed.push(message);
      findings.push(finding({
        status: "pass",
        rule: "Valid wallet destination",
        message,
        evidence: { target, format: destination.kind },
      }));
    }

    if (executionWallet.valid && destination.valid && exactWalletIdentifierMatch(executionWalletAddress, target)) {
      const message = "Transfer source and destination resolve to the same submitted wallet identifier.";
      checksFailed.push(message);
      scoreDelta += 30;
      hardBlock = true;
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Distinct transfer destination",
        message,
        evidence: { executionWalletAddress, target, comparison: "normalized exact identifier" },
        remediation: "Use the intended recipient wallet. Magen3 blocks exact self-transfer requests to prevent accidental execution.",
      }));
    } else if (executionWallet.valid && destination.valid) {
      findings.push(finding({
        status: "pass",
        rule: "Distinct transfer destination",
        message: "Execution wallet and destination are distinct submitted identifiers.",
        evidence: { executionWalletAddress, target, comparison: "normalized exact identifier" },
      }));
    } else {
      findings.push(finding({
        status: "skipped",
        rule: "Distinct transfer destination",
        message: "Self-transfer comparison was skipped because one or both wallet identifiers are invalid.",
        evidence: { executionWalletValid: executionWallet.valid, destinationValid: destination.valid },
      }));
    }

    if (destination.valid && destinationTrusted) {
      const message = "Wallet destination is approved by the active policy.";
      checksPassed.push(message);
      findings.push(finding({
        status: "pass",
        rule: "Approved wallet destination",
        message,
        evidence: { target, approvedTargetCount: trustedTargets.length },
      }));
    } else if (destination.valid) {
      const message = "Wallet destination is not in the active policy's approved target list.";
      checksFailed.push(message);
      scoreDelta += strictMode ? 35 : 25;
      if (strictMode) hardBlock = true;
      else needsReview = true;
      findings.push(finding({
        status: strictMode ? "fail" : "warning",
        severity: strictMode ? "high" : "medium",
        rule: "Approved wallet destination",
        message,
        evidence: { target, approvedTargetCount: trustedTargets.length, riskMode: policy.riskMode || "Balanced" },
        remediation: "Use an approved destination, or add this wallet to Trusted Targets after authorized review.",
      }));
    } else {
      findings.push(finding({
        status: "skipped",
        rule: "Approved wallet destination",
        message: "Destination allowlist evaluation was skipped because the wallet destination is invalid.",
        evidence: { target },
      }));
    }
  }

  if (x402Payment) {
    findings.push(finding({
      status: "skipped",
      rule: "Maximum transaction amount",
      message: "The generic Casper transaction limit is not applied to x402 payments; x402 per-payment and asset-specific limits are evaluated by x402 Payment Controls.",
      evidence: { asset: request.asset || request.x402Asset || "", amount },
    }));
    findings.push(finding({
      status: "skipped",
      rule: "Daily wallet spending limit",
      message: "The generic Casper daily limit is not applied to x402 payments; x402 authorization-window limits are evaluated separately.",
      evidence: { asset: request.asset || request.x402Asset || "", amount },
    }));
    findings.push(finding({
      status: "skipped",
      rule: "Wallet human-review threshold",
      message: "The generic Casper review threshold is not applied to x402 payments; the x402 review threshold controls payment authorization.",
      evidence: { asset: request.asset || request.x402Asset || "", amount },
    }));
  } else {
    if (maxTransaction > 0 && amount > maxTransaction) {
      const message = `Amount exceeds max transaction limit (${amount} > ${maxTransaction} CSPR)`;
      checksFailed.push(message);
      scoreDelta += 30;
      hardBlock = true;
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Maximum transaction amount",
        message,
        evidence: { received: amount, maximum: maxTransaction, asset: request.asset || "CSPR" },
        remediation: `Reduce the amount to ${maxTransaction} CSPR or less, or update the policy if authorized.`,
      }));
    } else {
      const message = `Amount within max transaction limit (${amount} ≤ ${maxTransaction} CSPR)`;
      checksPassed.push(message);
      findings.push(finding({
        status: "pass",
        rule: "Maximum transaction amount",
        message,
        evidence: { received: amount, maximum: maxTransaction, asset: request.asset || "CSPR" },
      }));
    }

    if (dailyLimit > 0 && projectedDailySpend > dailyLimit) {
      const message = `Daily wallet spending limit would be exceeded (${projectedDailySpend} > ${dailyLimit} CSPR)`;
      checksFailed.push(message);
      scoreDelta += 25;
      hardBlock = true;
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Daily wallet spending limit",
        message,
        evidence: { usedToday: Number(dailyUsed || 0), requested: amount, projected: projectedDailySpend, maximum: dailyLimit },
        remediation: "Reduce the amount or wait until the daily window resets. Only an authorized policy owner should raise the limit.",
      }));
    } else {
      const message = `Daily wallet spending remains within policy (${projectedDailySpend} ≤ ${dailyLimit} CSPR)`;
      checksPassed.push(message);
      findings.push(finding({
        status: "pass",
        rule: "Daily wallet spending limit",
        message,
        evidence: { usedToday: Number(dailyUsed || 0), requested: amount, projected: projectedDailySpend, maximum: dailyLimit },
      }));
    }

    if (approvalThreshold > 0 && amount > approvalThreshold) {
      const message = `Amount exceeds the wallet review threshold (${amount} > ${approvalThreshold} CSPR)`;
      checksFailed.push(message);
      scoreDelta += relaxedMode ? 10 : 18;
      needsReview = true;
      findings.push(finding({
        status: "warning",
        severity: "medium",
        rule: "Wallet human-review threshold",
        message,
        evidence: { received: amount, threshold: approvalThreshold, asset: request.asset || "CSPR" },
        remediation: `Reduce the amount to ${approvalThreshold} CSPR or less, or obtain authorized human review.`,
      }));
    } else {
      const message = `Amount is below the wallet review threshold (${amount} ≤ ${approvalThreshold} CSPR)`;
      checksPassed.push(message);
      findings.push(finding({
        status: "pass",
        rule: "Wallet human-review threshold",
        message,
        evidence: { received: amount, threshold: approvalThreshold, asset: request.asset || "CSPR" },
      }));
    }
  }
  return {
    findings,
    checksPassed,
    checksFailed,
    scoreDelta,
    hardBlock,
    needsReview,
    walletDestination,
    executionWallet,
    destination,
    destinationTrusted,
    projectedDailySpend,
    auditLogCount: Array.isArray(auditLogs) ? auditLogs.length : 0,
  };
}
