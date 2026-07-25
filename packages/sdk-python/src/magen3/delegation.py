from __future__ import annotations

import hashlib
from typing import Any, Dict, Iterable, Mapping


def _clean(value: Any) -> str:
    return str(value if value is not None else "").strip()


def _canonical_list(value: Any) -> list[str]:
    source: Iterable[Any] = value if isinstance(value, list) else []
    return sorted({_clean(item).lower() for item in source if _clean(item)})


def _number_text(value: Any) -> str:
    if value is None or value == "":
        return ""
    number = float(value)
    return str(int(number)) if number.is_integer() else str(number)


def build_delegation_attestation_message(delegation: Mapping[str, Any], agent_id: str, domain: str = "magen3.delegation.v1") -> str:
    """Build the exact public message that the delegating Casper wallet must sign."""
    limits: Dict[str, float] = {}
    raw_limits = delegation.get("tokenAmountLimits")
    if isinstance(raw_limits, dict):
        for asset, value in raw_limits.items():
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            if _clean(asset) and number >= 0:
                limits[_clean(asset)] = number
    token_limits = ",".join(f"{asset.lower()}={_number_text(limits[asset])}" for asset in sorted(limits))
    depth = delegation.get("delegationDepth")
    lines = [
        "Magen3 Delegated Permission Attestation",
        "Version: 1",
        f"Domain: {_clean(domain or 'magen3.delegation.v1')}",
        f"Chain: {_clean(delegation.get('chainName') or 'casper-test')}",
        f"Delegation ID: {_clean(delegation.get('delegationId'))}",
        f"Agent ID: {_clean(agent_id)}",
        f"Delegating Wallet: {_clean(delegation.get('delegatingWallet'))}",
        f"Delegate: {_clean(delegation.get('delegate'))}",
        f"Session Key: {_clean(delegation.get('sessionKey'))}",
        f"Allowed Networks: {','.join(_canonical_list(delegation.get('allowedNetworks')))}",
        f"Allowed Contracts: {','.join(_canonical_list(delegation.get('allowedContracts')))}",
        f"Allowed Methods: {','.join(_canonical_list(delegation.get('allowedMethods')))}",
        f"Allowed Assets: {','.join(_canonical_list(delegation.get('allowedAssets')))}",
        f"Native Amount Limit: {_number_text(delegation.get('nativeAmountLimit'))}",
        f"Token Amount Limits: {token_limits}",
        f"Max Transaction Amount: {_number_text(delegation.get('maxTransactionAmount'))}",
        f"Max Frequency: {_number_text(delegation.get('maxFrequency'))}",
        f"Valid From: {_clean(delegation.get('validFrom'))}",
        f"Expires At: {_clean(delegation.get('expiresAt'))}",
        f"Revocation Status: {_clean(delegation.get('revocationStatus') or 'Active')}",
        f"Delegation Depth: {'0' if depth is None or depth == '' else int(float(depth))}",
        f"Redelegation Allowed: {'true' if delegation.get('redelegationAllowed') is True else 'false'}",
        f"Nonce: {_clean(delegation.get('nonce'))}",
        "",
        "Signing this message authorizes only the bounded delegation above. It does not sign or submit a blockchain transaction.",
    ]
    return "\n".join(str(item) for item in lines)


def hash_delegation_attestation(delegation: Mapping[str, Any], agent_id: str, domain: str = "magen3.delegation.v1") -> str:
    return hashlib.sha256(build_delegation_attestation_message(delegation, agent_id, domain).encode("utf-8")).hexdigest()
