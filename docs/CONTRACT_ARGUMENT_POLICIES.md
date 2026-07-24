# Contract Argument Policies

Status: **Live**  
Protection area: **Contract & Permission Safety**  
Gateway status endpoint: `GET /api/contract-argument-controls/status`

Contract Argument Policies apply deterministic policy to the public unsigned runtime arguments of an exact contract and entry point before wallet signing. The control extends Contract Validation: contract identity answers *which contract and entry point is being called*, while Contract Argument Policies answer *whether the supplied arguments are permitted for that exact call*.

It does not inspect private keys, wallet signatures, signed deploys, encrypted application secrets, or arbitrary hidden contract state.

## Applicability

The control runs only when all of the following are true:

- the active policy enables `contractArgumentControlsEnabled`;
- the request is a direct contract intent;
- the request contains an entry point;
- public runtime arguments are submitted under `action.preflight.runtimeArgs`.

Legacy policies remain compatible because the control is disabled unless deliberately configured. Generic contract calls without an enabled rule continue through the existing Contract Validation and risk pipeline.

## Gateway intent example

```json
{
  "agentId": "MAG-AGENT-EXAMPLE",
  "executionWalletAddress": "01...",
  "targetChain": "casper-testnet",
  "action": {
    "type": "Contract Interaction",
    "target": "contract-package-hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "targetType": "Trusted Contract",
    "contractIdentifierType": "Package Hash",
    "entryPoint": "transfer",
    "chainName": "casper-test",
    "preflight": {
      "runtimeArgs": {
        "recipient": "01bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "amount": "25",
        "allow_partial": false,
        "transfer_mode": "direct"
      }
    }
  }
}
```

`runtimeArgs` may contain plain JSON values or CLValue-style envelopes with a public `parsed` or `value` field. Do not include signing material or secret application data.

## Policy fields

Contract Argument Policies use the existing `structuredRules` object:

```json
{
  "contractArgumentControlsEnabled": true,
  "contractArgumentMode": "Review",
  "contractArgumentUnknownRuleAction": "Review",
  "contractArgumentUnknownArgumentAction": "Block",
  "contractArgumentRules": [
    {
      "id": "treasury-transfer-v1",
      "contract": "contract-package-hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "entryPoint": "transfer",
      "requiredArgs": ["recipient", "amount"],
      "allowedArgs": ["recipient", "amount", "allow_partial", "transfer_mode"],
      "argumentTypes": {
        "recipient": "address",
        "amount": "u512",
        "allow_partial": "boolean",
        "transfer_mode": "string"
      },
      "numericLimits": {
        "amount": { "min": 1, "max": 1000 }
      },
      "addressRules": {
        "recipient": {
          "allowed": ["01bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          "blocked": []
        }
      },
      "booleanRules": {
        "allow_partial": { "allowed": [false] }
      },
      "enumRules": {
        "transfer_mode": ["direct", "escrow"]
      },
      "unknownArgumentAction": "Block"
    }
  ]
}
```

### Modes

- `Observe` records non-blocking warnings for ordinary policy violations.
- `Review` routes ordinary policy violations to Human Approval.
- `Enforce` blocks ordinary policy violations.

Explicitly blocked addresses hard-block in every mode. Malformed rule configuration never counts as a pass; Enforce mode fails closed, while Review mode requires review.

### Unknown-rule and unknown-argument actions

`contractArgumentUnknownRuleAction` controls a direct contract call for which no exact contract-and-entry-point rule exists.

`contractArgumentUnknownArgumentAction` controls arguments not listed in the matching rule. A rule-level `unknownArgumentAction` overrides the policy default for that rule.

Supported values are `Warn`, `Review`, and `Block`.

## Supported rule types

### Required arguments

Every name in `requiredArgs` must be present and must not resolve to `null`, `undefined`, or an empty string.

### Allowed arguments

When `allowedArgs` is non-empty, every supplied argument name must appear in that list. If `allowedArgs` is omitted, Magen3 derives it from the required, type, numeric, address, boolean, and enum rule keys.

### Argument types

Supported type families include:

- text: `string`, `text`, `bytes`, `hash`;
- numeric: `number`, `decimal`, `float`;
- integers: `integer`, `int`, `u8`, `u32`, `u64`, `u128`, `u256`, `u512`;
- booleans: `boolean`, `bool`;
- identities: `address`, `account`, `contract`, `recipient`;
- collections: `array`, `list`, `tuple`, `object`, `map`;
- `null`.

Numeric strings are accepted for numeric and integer policies so public Casper amounts such as U512 values can be represented without unsafe JavaScript rounding.

### Numeric limits

Each named argument may define a minimum, maximum, or both. A non-numeric value violates a numeric rule.

### Address policies

Address rules support allowlists and blocklists for supported Casper public keys, account hashes, contract/package identifiers, and EVM addresses. A blocklist match always produces a hard Blocked result.

### Boolean and enum rules

Boolean rules restrict a parameter to configured true/false values. Enum rules restrict a string value to a configured set.

## Deterministic fingerprint and Human Approval

Magen3 computes a SHA-256 fingerprint over:

- the canonical contract identifier;
- the exact entry point;
- canonicalized runtime arguments with stable object-key ordering.

The result is returned in `contractArgumentPoliciesContext.parameterFingerprint` and stored with the audit evidence.

Human Approval already binds the complete normalized intent, including `runtimeArgs`. Changing an argument after approval changes the approval binding and the argument fingerprint, so the previous approval cannot authorize the modified call.

## Findings and decisions

Findings use the shared model:

- `pass` for a rule that ran and passed;
- `warning` for an Observe-mode or Review-mode violation;
- `fail` for a blocking violation;
- `unavailable` for relevant but invalid or unavailable rule evidence;
- `skipped` when the control is disabled or not applicable.

Final decision precedence remains:

1. Blocked
2. Review Required
3. Allowed

The response may include:

```json
{
  "contractArgumentPoliciesContext": {
    "target": "contract-package-hash-...",
    "entryPoint": "transfer",
    "ruleId": "treasury-transfer-v1",
    "mode": "Review",
    "parameterFingerprint": "64-character-sha256",
    "evaluatedArguments": ["recipient", "amount"],
    "requiredArguments": ["recipient", "amount"],
    "allowedArguments": ["recipient", "amount", "allow_partial", "transfer_mode"],
    "violations": [],
    "approvalBindingNote": "The existing Human Approval binding covers the complete normalized intent, including runtimeArgs and this fingerprint."
  }
}
```

## Audit evidence

Audit records retain the normalized public runtime arguments, matching rule ID, structured findings, received and expected values, remediation, parameter fingerprint, policy, final decision, approval binding, Casper decision proof, and later execution state where available.

Magen3 must not receive or persist private keys, mnemonics, wallet signatures, raw signed transactions, wallet approvals, provider credentials, or secret application data in `runtimeArgs`.

## UI

The existing Policies page exposes:

- enable/disable;
- Observe, Review, or Enforce mode;
- no-matching-rule action;
- unknown-argument action;
- a collapsed advanced JSON rule editor with validation.

The control also appears in:

- Agent Shield → Contract & Permission Safety;
- Agent Details Security Coverage;
- Integration Health;
- Security Pipeline;
- Audit Logs;
- Intent Playground.

It does not add a new sidebar item.

## SDK and MCP boundary

The JavaScript/TypeScript SDK, Python SDK, and MCP tool use the same `action.preflight.runtimeArgs` object. MCP may submit and explain public runtime arguments, but it cannot override policy, approve a review, sign a transaction, or provide secret material.

## Testing expectations

A complete regression set should cover:

- exact matching rule;
- missing required argument;
- unknown argument;
- type mismatch;
- numeric minimum and maximum;
- blocked address;
- address not in allowlist;
- forbidden boolean;
- invalid enum;
- duplicate matching rules;
- malformed rule configuration;
- Observe, Review, and Enforce modes;
- argument fingerprint changes;
- exact Human Approval binding;
- generic-contract backward compatibility;
- memory-store and PostgreSQL persistence paths.

## Security boundary

A passing runtime-argument rule means the declared public arguments satisfy the configured deterministic policy. It does not prove that the contract is economically safe, that its implementation has not changed, that chain state will remain unchanged, or that execution will succeed. Contract Validation, Contract Upgrade Safety, Threat Intelligence, simulation, wallet review, and post-execution reconciliation remain separate controls.
