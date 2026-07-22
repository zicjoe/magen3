# Compliance Controls

## Status

Compliance Controls is **Foundation Available**.

It provides deterministic pre-signing checks for non-sensitive compliance evidence, jurisdiction and counterparty policy, screening status, risk rating, and exact matches from an operator-configured feed. It does not bundle or certify a KYC/KYB provider, sanctions-data provider, legal rules engine, or jurisdiction-specific compliance determination.

## Privacy boundary

Magen3 must not receive raw personal identity data. The Gateway rejects names, dates of birth, identity-document and tax identifiers, residential addresses, email addresses, phone numbers, uploaded documents, selfies, and biometric data.

External identity or screening systems should retain personal data and send Magen3 only:

- Verification status
- Provider label
- Opaque reference
- Issue, expiry, or screening timestamp
- Two-letter jurisdiction code
- Opaque VASP identifier
- Optional 32-byte data hash
- Non-sensitive risk rating

## Intent schema

Add evidence under `action.compliance`:

```json
{
  "source": "treasury-agent",
  "agentId": "AGENT_ID",
  "executionWalletAddress": "01...",
  "action": {
    "type": "Transfer",
    "amount": 25,
    "asset": "CSPR",
    "target": "01...",
    "targetType": "Wallet Address",
    "compliance": {
      "originatorJurisdiction": "NG",
      "beneficiaryJurisdiction": "GB",
      "counterpartyType": "VASP",
      "originatorAttestation": {
        "status": "Verified",
        "provider": "Reviewed Identity Provider",
        "reference": "att_originator_123",
        "issuedAt": "2026-07-22T12:00:00.000Z",
        "expiresAt": "2026-07-23T12:00:00.000Z"
      },
      "beneficiaryAttestation": {
        "status": "Verified",
        "provider": "Reviewed Identity Provider",
        "reference": "att_beneficiary_456",
        "issuedAt": "2026-07-22T12:00:00.000Z",
        "expiresAt": "2026-07-23T12:00:00.000Z"
      },
      "travelRule": {
        "status": "Complete",
        "reference": "travel_rule_789",
        "dataHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "screening": {
        "status": "Clear",
        "provider": "Reviewed Screening Provider",
        "reference": "screening_123",
        "screenedAt": "2026-07-22T12:00:00.000Z"
      },
      "riskRating": "Low",
      "originatorVaspId": "vasp-originator",
      "beneficiaryVaspId": "vasp-beneficiary"
    }
  }
}
```

The normal authentication headers and Gateway endpoint remain unchanged.

## Policy controls

Compliance settings are stored in `policy.structuredRules`:

```json
{
  "complianceControlsEnabled": true,
  "complianceControlMode": "Review",
  "complianceUnavailableAction": "Review",
  "complianceRequiredActions": ["Transfer", "DAO Treasury Payment", "Bridge"],
  "complianceRequireOriginatorAttestation": true,
  "complianceRequireBeneficiaryAttestation": true,
  "complianceRequireTravelRule": true,
  "complianceTravelRuleThreshold": 1,
  "complianceRequireSanctionsScreening": true,
  "complianceAllowedJurisdictions": [],
  "complianceBlockedJurisdictions": [],
  "complianceReviewJurisdictions": [],
  "complianceAllowedCounterpartyTypes": ["VASP", "Organization", "Self-hosted Wallet"],
  "complianceAcceptedProviders": [],
  "complianceMaxAttestationAgeSeconds": 86400,
  "complianceMaxScreeningAgeSeconds": 3600,
  "complianceMaximumRiskRating": "Medium"
}
```

`Observe` records violations as warnings, `Review` returns Review Required, and `Enforce` blocks policy violations. Explicit configured-feed block matches and rejected attestations are treated as hard failures. `Warn`, `Review`, or `Block` determines behavior when required evidence or a configured feed is unavailable.

## Optional exact-match feed

Configure at most one source:

```env
COMPLIANCE_CONTROLS_FEED_JSON={"version":"1","source":"Reviewed compliance feed","generatedAt":"2026-07-22T18:00:00.000Z","indicators":[],"restrictedJurisdictions":[]}
# COMPLIANCE_CONTROLS_FEED_PATH=backend/data/compliance-controls.example.json
# COMPLIANCE_CONTROLS_FEED_URL=https://compliance.example/feed.json
# COMPLIANCE_CONTROLS_API_KEY=provider-secret
COMPLIANCE_CONTROLS_CACHE_TTL_MS=300000
COMPLIANCE_CONTROLS_MAX_AGE_MS=86400000
COMPLIANCE_CONTROLS_REQUEST_TIMEOUT_MS=2500
```

Feed records can identify exact Casper public keys, account hashes, Contract Hashes, Package Hashes, opaque VASP IDs, and restricted two-letter jurisdiction codes. Feed timestamps and record expiries are enforced. A feed no-match does not prove that a target is clear or lawful.

Refresh the bundled synthetic demonstration feed before use:

```bash
pnpm compliance:refresh-example-feed
```

## Status endpoint

```http
GET /api/compliance-controls/status
```

The endpoint returns sanitized availability, freshness, source label, counts, and safe error information. It does not expose provider credentials, raw file paths, remote URLs, or the indicator list.

## Decision and audit behavior

Compliance Controls emits structured findings with `pass`, `warning`, `fail`, `unavailable`, or `skipped`. Findings include the triggering rule, non-sensitive evidence, and remediation. The final Allowed, Blocked, or Review Required result remains deterministic and is stored with the Security Pipeline, audit record, and Casper decision-proof flow.

## Security limitations

- The module validates submitted evidence; it does not independently prove that an attestation is truthful unless the operator trusts the provider.
- Exact matching does not discover aliases, derived account hashes, beneficial ownership, or related entities.
- A clear screening status or feed no-match is not a guarantee of compliance.
- Operators remain responsible for provider due diligence, data licensing, retention, privacy, and jurisdiction-specific legal review.
