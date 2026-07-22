const VALUE_BEARING_ACTIONS = new Set([
  "Transfer",
  "Swap",
  "Stake",
  "Deposit to Vault",
  "DAO Treasury Payment",
]);

const PREFLIGHT_ACTIONS = new Set([
  ...VALUE_BEARING_ACTIONS,
  "Contract Interaction",
  "Claim Rewards",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return {
    module: "Execution Simulation",
    status,
    severity,
    rule,
    message,
    evidence,
    remediation,
  };
}

function parsePositiveIntegerString(value) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) return null;
  try {
    const parsed = BigInt(text);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function parseCasperTtlMs(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
  }
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] === "ms" ? 1 : match[2] === "s" ? 1_000 : match[2] === "m" ? 60_000 : 3_600_000;
  const result = amount * multiplier;
  return Number.isFinite(result) && result > 0 && Number.isSafeInteger(result) ? result : null;
}

const ISO_8601_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseIsoTimestamp(value) {
  const raw = clean(value);
  if (!ISO_8601_TIMESTAMP.test(raw)) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function runtimeArgsCount(runtimeArgs) {
  return runtimeArgs && typeof runtimeArgs === "object" && !Array.isArray(runtimeArgs)
    ? Object.keys(runtimeArgs).length
    : 0;
}

export function evaluateExecutionSimulation({ request, now = new Date() }) {
  const actionType = clean(request.actionType);
  const findings = [];
  const checksPassed = [];
  const checksFailed = [];
  let hardBlock = false;
  let needsReview = false;
  let scoreDelta = 0;

  if (!PREFLIGHT_ACTIONS.has(actionType)) {
    findings.push(finding({
      status: "skipped",
      rule: "Execution preflight applicability",
      message: `Execution preflight is not required for ${actionType || "this action"}.`,
      evidence: { actionType },
    }));
    return { findings, checksPassed, checksFailed, hardBlock, needsReview, scoreDelta };
  }

  findings.push(finding({
    status: "pass",
    rule: "Execution preflight applicability",
    message: `Deterministic execution preflight is applicable to ${actionType}.`,
    evidence: { actionType, mode: "high-level intent preflight" },
  }));
  checksPassed.push(`Execution preflight is applicable to ${actionType}`);

  const amount = Number(request.amount ?? 0);
  if (VALUE_BEARING_ACTIONS.has(actionType)) {
    if (!Number.isFinite(amount) || amount <= 0) {
      const message = `${actionType} requires a positive execution amount.`;
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Positive execution amount",
        message,
        evidence: { actionType, receivedAmount: request.amount },
        remediation: "Provide a positive numeric amount before retrying the intent.",
      }));
      checksFailed.push(message);
      hardBlock = true;
      scoreDelta += 28;
    } else {
      findings.push(finding({
        status: "pass",
        rule: "Positive execution amount",
        message: `${actionType} includes a positive amount of ${amount} ${clean(request.asset) || "units"}.`,
        evidence: { actionType, amount, asset: clean(request.asset) },
      }));
      checksPassed.push(`${actionType} amount is positive`);
    }
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Positive execution amount",
      message: `${actionType} does not require a positive transfer amount for preflight validation.`,
      evidence: { actionType, amount },
    }));
  }

  const paymentAmountMotesRaw = clean(request.paymentAmountMotes);
  if (paymentAmountMotesRaw) {
    const payment = parsePositiveIntegerString(paymentAmountMotesRaw);
    if (!payment) {
      const message = "paymentAmountMotes must be a positive integer expressed in motes.";
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Payment budget format",
        message,
        evidence: { received: paymentAmountMotesRaw },
        remediation: "Use a positive integer string for action.preflight.paymentAmountMotes.",
      }));
      checksFailed.push(message);
      hardBlock = true;
      scoreDelta += 24;
    } else {
      findings.push(finding({
        status: "pass",
        rule: "Payment budget format",
        message: "The proposed payment budget is a valid positive mote amount.",
        evidence: { paymentAmountMotes: payment.toString() },
      }));
      checksPassed.push("Payment budget uses a valid positive mote amount");
    }
  } else {
    findings.push(finding({
      status: "warning",
      severity: "low",
      rule: "Payment budget available",
      message: "No payment budget was supplied, so Magen3 could not preflight the proposed execution fee limit.",
      evidence: { actionType },
      remediation: "Include action.preflight.paymentAmountMotes when the execution adapter has calculated a payment budget.",
    }));
    scoreDelta += 2;
  }

  const gasPriceTolerance = request.gasPriceTolerance;
  if (gasPriceTolerance !== null && gasPriceTolerance !== undefined && gasPriceTolerance !== "") {
    if (!Number.isInteger(gasPriceTolerance) || gasPriceTolerance <= 0) {
      const message = "gasPriceTolerance must be a positive integer when supplied.";
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Gas-price tolerance format",
        message,
        evidence: { received: gasPriceTolerance },
        remediation: "Use a positive integer gas-price tolerance supported by the target Casper network.",
      }));
      checksFailed.push(message);
      hardBlock = true;
      scoreDelta += 20;
    } else {
      findings.push(finding({
        status: "pass",
        rule: "Gas-price tolerance format",
        message: "The proposed gas-price tolerance is a valid positive integer.",
        evidence: { gasPriceTolerance },
      }));
      checksPassed.push("Gas-price tolerance is structurally valid");
    }
  } else {
    findings.push(finding({
      status: "warning",
      severity: "low",
      rule: "Gas-price tolerance available",
      message: "No gas-price tolerance was supplied for transaction construction preflight.",
      evidence: { actionType },
      remediation: "Include action.preflight.gasPriceTolerance when constructing a Casper 2.x transaction.",
    }));
    scoreDelta += 1;
  }

  const ttlRaw = clean(request.ttl);
  const ttlMs = ttlRaw ? parseCasperTtlMs(ttlRaw) : null;
  if (ttlRaw && ttlMs === null) {
    const message = "Transaction TTL must be a positive duration such as 30m, 1h, or milliseconds.";
    findings.push(finding({
      status: "fail",
      severity: "high",
      rule: "Transaction TTL format",
      message,
      evidence: { received: ttlRaw },
      remediation: "Provide a positive TTL such as 30m or 1h, and keep it within the target network chainspec limit.",
    }));
    checksFailed.push(message);
    hardBlock = true;
    scoreDelta += 22;
  } else if (ttlMs !== null) {
    const unusuallyLong = ttlMs > 2 * 60 * 60 * 1_000;
    findings.push(finding({
      status: unusuallyLong ? "warning" : "pass",
      severity: unusuallyLong ? "medium" : "info",
      rule: "Transaction TTL format",
      message: unusuallyLong
        ? "The TTL is structurally valid but exceeds two hours; confirm it is accepted by the target network chainspec."
        : "The proposed transaction TTL is structurally valid.",
      evidence: { ttl: ttlRaw, ttlMs },
      remediation: unusuallyLong ? "Use a shorter TTL or verify the current Casper chainspec maximum before signing." : "",
    }));
    checksPassed.push("Transaction TTL is structurally valid");
    if (unusuallyLong) {
      needsReview = true;
      scoreDelta += 9;
    }
  } else {
    findings.push(finding({
      status: "warning",
      severity: "low",
      rule: "Transaction TTL available",
      message: "No transaction TTL was supplied, so expiry could not be evaluated.",
      evidence: { actionType },
      remediation: "Include action.preflight.ttl when the execution adapter constructs the transaction.",
    }));
    scoreDelta += 1;
  }

  const timestampRaw = clean(request.transactionTimestamp);
  let timestampMs = null;
  if (timestampRaw) {
    timestampMs = parseIsoTimestamp(timestampRaw);
    if (timestampMs === null) {
      const message = "Transaction timestamp must be a valid ISO-8601 timestamp when supplied.";
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Transaction timestamp format",
        message,
        evidence: { received: timestampRaw },
        remediation: "Use an ISO-8601 UTC timestamp generated when the transaction is constructed.",
      }));
      checksFailed.push(message);
      hardBlock = true;
      scoreDelta += 20;
    } else {
      const futureOffset = timestampMs - now.getTime();
      const futureDated = futureOffset > 5 * 60 * 1_000;
      findings.push(finding({
        status: futureDated ? "warning" : "pass",
        severity: futureDated ? "medium" : "info",
        rule: "Transaction timestamp format",
        message: futureDated
          ? "The transaction timestamp is more than five minutes in the future."
          : "The transaction timestamp is a valid ISO-8601 value.",
        evidence: { transactionTimestamp: timestampRaw, futureOffsetMs: futureOffset },
        remediation: futureDated ? "Regenerate the transaction timestamp close to signing time." : "",
      }));
      checksPassed.push("Transaction timestamp is structurally valid");
      if (futureDated) {
        needsReview = true;
        scoreDelta += 10;
      }
    }
  } else {
    findings.push(finding({
      status: "warning",
      severity: "low",
      rule: "Transaction timestamp available",
      message: "No transaction timestamp was supplied, so freshness and expiry could not be evaluated.",
      evidence: { actionType },
      remediation: "Include action.preflight.timestamp when the execution adapter constructs the transaction.",
    }));
    scoreDelta += 1;
  }

  if (Number.isFinite(timestampMs) && ttlMs !== null) {
    const expiresAt = timestampMs + ttlMs;
    if (expiresAt <= now.getTime()) {
      const message = "The proposed transaction metadata is already expired.";
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Transaction freshness",
        message,
        evidence: { transactionTimestamp: timestampRaw, ttl: ttlRaw, expiresAt: new Date(expiresAt).toISOString(), evaluatedAt: now.toISOString() },
        remediation: "Rebuild the transaction with a current timestamp and valid TTL before retrying.",
      }));
      checksFailed.push(message);
      hardBlock = true;
      scoreDelta += 28;
    } else {
      findings.push(finding({
        status: "pass",
        rule: "Transaction freshness",
        message: "The proposed transaction metadata has not expired.",
        evidence: { expiresAt: new Date(expiresAt).toISOString(), evaluatedAt: now.toISOString() },
      }));
      checksPassed.push("Transaction metadata has not expired");
    }
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Transaction freshness",
      message: "Freshness evaluation requires both a valid timestamp and TTL.",
      evidence: { timestampSupplied: Boolean(timestampRaw), ttlSupplied: Boolean(ttlRaw) },
    }));
  }

  const transactionHash = clean(request.transactionHash).replace(/^transaction-hash-/i, "");
  if (transactionHash) {
    if (!/^[0-9a-f]{64}$/i.test(transactionHash)) {
      const message = "transactionHash must be a 64-character hexadecimal hash when supplied.";
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Transaction hash format",
        message,
        evidence: { received: clean(request.transactionHash) },
        remediation: "Provide the canonical 64-character transaction hash, or omit it before construction.",
      }));
      checksFailed.push(message);
      hardBlock = true;
      scoreDelta += 18;
    } else {
      findings.push(finding({
        status: "pass",
        rule: "Transaction hash format",
        message: "The proposed transaction hash is structurally valid.",
        evidence: { transactionHash },
      }));
      checksPassed.push("Transaction hash is structurally valid");
    }
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Transaction hash format",
      message: "No transaction hash is expected until an execution adapter has constructed the transaction.",
      evidence: { actionType },
    }));
  }

  if (actionType === "Swap") {
    const slippageBps = request.slippageBps;
    if (slippageBps !== null && slippageBps !== undefined && slippageBps !== "") {
      if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
        const message = "slippageBps must be an integer between 0 and 10000.";
        findings.push(finding({
          status: "fail",
          severity: "high",
          rule: "Swap slippage bounds",
          message,
          evidence: { received: slippageBps },
          remediation: "Provide slippage in basis points between 0 and 10000. Policy-specific maximum slippage remains a future enforced rule.",
        }));
        checksFailed.push(message);
        hardBlock = true;
        scoreDelta += 24;
      } else {
        findings.push(finding({
          status: "pass",
          rule: "Swap slippage bounds",
          message: "The proposed slippage value is structurally valid.",
          evidence: { slippageBps, slippagePercent: slippageBps / 100 },
          remediation: "This validates structure only; Magen3 does not yet enforce a policy maximum slippage.",
        }));
        checksPassed.push("Swap slippage value is structurally valid");
      }
    } else {
      findings.push(finding({
        status: "warning",
        severity: "low",
        rule: "Swap slippage available",
        message: "No slippage value was supplied for swap preflight.",
        evidence: { actionType },
        remediation: "Include action.preflight.slippageBps. Policy-specific maximum slippage remains Preview.",
      }));
      scoreDelta += 2;
    }

    const expectedOutput = finiteNumber(request.expectedOutput);
    const minimumReceived = finiteNumber(request.minimumReceived);
    if (expectedOutput !== null || minimumReceived !== null) {
      if (expectedOutput === null || minimumReceived === null || expectedOutput < 0 || minimumReceived < 0) {
        const message = "Swap output bounds require non-negative expectedOutput and minimumReceived values together.";
        findings.push(finding({
          status: "fail",
          severity: "high",
          rule: "Swap output bounds",
          message,
          evidence: { expectedOutput: request.expectedOutput, minimumReceived: request.minimumReceived },
          remediation: "Provide both expectedOutput and minimumReceived as non-negative numbers.",
        }));
        checksFailed.push(message);
        hardBlock = true;
        scoreDelta += 22;
      } else if (minimumReceived > expectedOutput) {
        const message = "minimumReceived cannot exceed expectedOutput.";
        findings.push(finding({
          status: "fail",
          severity: "high",
          rule: "Swap output bounds",
          message,
          evidence: { expectedOutput, minimumReceived },
          remediation: "Correct the quote or minimum-received value before requesting a signature.",
        }));
        checksFailed.push(message);
        hardBlock = true;
        scoreDelta += 24;
      } else {
        findings.push(finding({
          status: "pass",
          rule: "Swap output bounds",
          message: "The minimum-received value does not exceed the quoted output.",
          evidence: { expectedOutput, minimumReceived },
        }));
        checksPassed.push("Swap output bounds are internally consistent");
      }
    } else {
      findings.push(finding({
        status: "warning",
        severity: "low",
        rule: "Swap output bounds available",
        message: "Expected output and minimum received were not supplied, so quote consistency was not evaluated.",
        evidence: { actionType },
        remediation: "Include expectedOutput and minimumReceived after route quotation and before wallet signing.",
      }));
      scoreDelta += 2;
    }
  }

  if (actionType === "Contract Interaction") {
    const count = runtimeArgsCount(request.runtimeArgs);
    if (request.runtimeArgs !== undefined && request.runtimeArgs !== null) {
      if (typeof request.runtimeArgs !== "object" || Array.isArray(request.runtimeArgs)) {
        const message = "runtimeArgs must be an object when supplied.";
        findings.push(finding({
          status: "fail",
          severity: "high",
          rule: "Runtime arguments structure",
          message,
          evidence: { receivedType: Array.isArray(request.runtimeArgs) ? "array" : typeof request.runtimeArgs },
          remediation: "Provide runtime arguments as a JSON object keyed by argument name.",
        }));
        checksFailed.push(message);
        hardBlock = true;
        scoreDelta += 18;
      } else {
        findings.push(finding({
          status: "pass",
          rule: "Runtime arguments structure",
          message: `Runtime arguments are represented as an object with ${count} field${count === 1 ? "" : "s"}.`,
          evidence: { runtimeArgCount: count, runtimeArgNames: Object.keys(request.runtimeArgs).slice(0, 25) },
          remediation: "Argument names are structurally visible, but CLType validation requires contract metadata or stateful simulation.",
        }));
        checksPassed.push("Runtime arguments use an object structure");
      }
    } else {
      findings.push(finding({
        status: "warning",
        severity: "low",
        rule: "Runtime arguments available",
        message: "No runtime-argument summary was supplied for the contract call.",
        evidence: { entryPoint: clean(request.entryPoint) },
        remediation: "Include action.preflight.runtimeArgs when the adapter resolves contract arguments. CLType validation remains unavailable without verified contract metadata.",
      }));
      scoreDelta += 1;
    }
  }

  findings.push(finding({
    status: "unavailable",
    severity: "info",
    rule: "Stateful speculative execution",
    message: "Full Casper speculative execution was not run. The current Gateway evaluates high-level intent before wallet signing, while Casper speculative execution operates on a constructed transaction or deploy and is disabled by default on nodes.",
    evidence: {
      preflightMode: "deterministic construction metadata",
      statefulSimulationExecuted: false,
      requiresConstructedTransaction: true,
    },
    remediation: "Treat this module as Foundation Available. Add a dedicated, secured speculative-execution adapter only when Magen3 can construct and safely submit the exact transaction without weakening the wallet-signing boundary.",
  }));

  return { findings, checksPassed, checksFailed, hardBlock, needsReview, scoreDelta };
}
