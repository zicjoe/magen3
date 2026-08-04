from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any, Callable, Dict, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen


class Magen3Error(RuntimeError):
    def __init__(self, message: str, status: int = 0, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


Transport = Callable[[str, str, Dict[str, str], Optional[bytes], float], Any]


def get_agent_message(response: Mapping[str, Any]) -> str:
    """Return the safe user-facing explanation supplied by Magen3."""
    result = response.get("result") if isinstance(response, Mapping) else {}
    result = result if isinstance(result, Mapping) else {}
    top_explanation = response.get("decisionExplanation") if isinstance(response, Mapping) else {}
    top_explanation = top_explanation if isinstance(top_explanation, Mapping) else {}
    result_explanation = result.get("decisionExplanation") if isinstance(result, Mapping) else {}
    result_explanation = result_explanation if isinstance(result_explanation, Mapping) else {}
    return str(
        (response.get("agentMessage") if isinstance(response, Mapping) else "")
        or top_explanation.get("userMessage")
        or result_explanation.get("userMessage")
        or result.get("primaryReason")
        or result.get("reason")
        or (response.get("nextAction") if isinstance(response, Mapping) else "")
        or "Magen3 returned no user-facing explanation."
    )


def is_execution_approved(response: Mapping[str, Any]) -> bool:
    """True only when the exact evaluated action may reach signing/submission."""
    result = response.get("result") if isinstance(response, Mapping) else {}
    result = result if isinstance(result, Mapping) else {}
    return response.get("executionApproved") is True and result.get("decision") == "Allowed"


def build_protected_parameters(intent: Mapping[str, Any]) -> Dict[str, Any]:
    """Build the exact non-secret parameter snapshot used by Instruction Integrity."""
    action = intent.get("action") if isinstance(intent, Mapping) else {}
    action = action if isinstance(action, Mapping) else {}
    token_permission = action.get("tokenPermission") if isinstance(action.get("tokenPermission"), Mapping) else {}
    bridge = action.get("bridge") if isinstance(action.get("bridge"), Mapping) else {}
    x402 = action.get("x402") if isinstance(action.get("x402"), Mapping) else {}
    privileged = action.get("privilegedAction") if isinstance(action.get("privilegedAction"), Mapping) else {}
    upgrade = action.get("contractUpgrade") if isinstance(action.get("contractUpgrade"), Mapping) else {}
    preflight = action.get("preflight") if isinstance(action.get("preflight"), Mapping) else {}
    target = str(action.get("target") or "").strip()
    chain_name = str(
        action.get("chainName")
        or token_permission.get("network")
        or bridge.get("destinationChain")
        or x402.get("network")
        or intent.get("targetChain")
        or ""
    ).strip()
    destination = str(
        bridge.get("destinationAddress")
        or x402.get("payTo")
        or token_permission.get("spender")
        or target
    ).strip()
    contract = str(
        upgrade.get("contract")
        or privileged.get("contract")
        or token_permission.get("tokenContract")
        or target
    ).strip()
    runtime_args = preflight.get("runtimeArgs")
    if not isinstance(runtime_args, Mapping):
        runtime_args = None
    else:
        runtime_args = dict(runtime_args)
    amount_value = action.get("amount") or 0
    try:
        numeric_amount = float(amount_value)
        normalized_amount: Any = int(numeric_amount) if numeric_amount.is_integer() else numeric_amount
    except (TypeError, ValueError):
        normalized_amount = 0
    return {
        "actionType": str(action.get("type") or "").strip(),
        "amount": normalized_amount,
        "asset": str(action.get("asset") or "").strip(),
        "outputAsset": str(action.get("outputAsset") or "").strip(),
        "target": target,
        "targetType": str(action.get("targetType") or "").strip(),
        "entryPoint": str(action.get("entryPoint") or "").strip(),
        "chainName": chain_name,
        "destination": destination,
        "contract": contract,
        "runtimeArgs": runtime_args,
    }


def hash_protected_parameters(parameters: Mapping[str, Any]) -> str:
    """Generate the backend-compatible SHA-256 protected-parameter fingerprint."""
    canonical = json.dumps(dict(parameters), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def create_instruction_integrity_binding(
    intent: Mapping[str, Any],
    *,
    goal_id: str,
    original_user_request: str,
    original_protected_parameters: Optional[Mapping[str, Any]] = None,
    initiated_by: str = "user",
    intent_source: str = "user",
    source_domains: Optional[list[str]] = None,
    external_content_used: bool = False,
    user_confirmed: bool = True,
    source_trust_level: str = "trusted",
    parameter_change_reason: str = "",
    original_permission_scopes: Optional[list[str]] = None,
    current_permission_scopes: Optional[list[str]] = None,
) -> Dict[str, Any]:
    """Create consistent provenance, hashes, and an exact original parameter snapshot."""
    current = build_protected_parameters(intent)
    original = dict(original_protected_parameters or current)
    return {
        "goalId": goal_id,
        "originalUserGoalHash": hashlib.sha256(original_user_request.encode("utf-8")).hexdigest(),
        "initiatedBy": initiated_by,
        "intentSource": intent_source,
        "sourceDomains": list(source_domains or []),
        "externalContentUsed": external_content_used,
        "userConfirmed": user_confirmed,
        "sourceTrustLevel": source_trust_level,
        "parameterChangeReason": parameter_change_reason or None,
        "originalParameterHash": hash_protected_parameters(original),
        "currentParameterHash": hash_protected_parameters(current),
        "originalProtectedParameters": original,
        "originalPermissionScopes": list(original_permission_scopes or []),
        "currentPermissionScopes": list(current_permission_scopes or []),
    }


def _normalize_gateway_url(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("gateway_url is required")
    parsed = urlsplit(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("gateway_url must be an absolute http(s) URL")
    path = parsed.path.rstrip("/")
    marker = path.lower().find("/api/agent-gateway")
    if marker >= 0:
        path = path[:marker]
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", "")).rstrip("/")


def _api_key_from_env(env: Mapping[str, str]) -> str:
    return str(
        env.get("MAGEN3_API_KEY")
        or env.get("MAGEN3_AGENT_KEY")
        or env.get("MAGEN3_AGENT_API_KEY")
        or ""
    ).strip()


def _default_transport(method: str, url: str, headers: Dict[str, str], data: Optional[bytes], timeout: float) -> Any:
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as error:
        raw = error.read().decode("utf-8")
        try:
            body = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            body = raw
        message = body.get("error") if isinstance(body, dict) and body.get("error") else f"Magen3 request failed with HTTP {error.code}"
        raise Magen3Error(str(message), error.code, body) from error
    except URLError as error:
        raise Magen3Error(f"Magen3 request failed: {error.reason}") from error


@dataclass(frozen=True)
class Magen3Client:
    gateway_url: str
    agent_id: str
    api_key: str
    timeout: float = 15.0
    auth_mode: str = "header"
    transport: Transport = _default_transport

    def __post_init__(self) -> None:
        object.__setattr__(self, "gateway_url", _normalize_gateway_url(self.gateway_url))
        if not self.agent_id.strip():
            raise ValueError("agent_id is required")
        if not self.api_key.strip():
            raise ValueError("api_key is required")
        if self.auth_mode not in {"header", "bearer"}:
            raise ValueError("auth_mode must be 'header' or 'bearer'")

    @classmethod
    def from_env(
        cls,
        env: Optional[Mapping[str, str]] = None,
        *,
        transport: Transport = _default_transport,
    ) -> "Magen3Client":
        source = os.environ if env is None else env
        gateway_url = str(source.get("MAGEN3_GATEWAY_URL") or "").strip()
        agent_id = str(source.get("MAGEN3_AGENT_ID") or "").strip()
        api_key = _api_key_from_env(source)
        missing = [
            name
            for name, value in (
                ("MAGEN3_GATEWAY_URL", gateway_url),
                ("MAGEN3_AGENT_ID", agent_id),
                ("MAGEN3_API_KEY", api_key),
            )
            if not value
        ]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
        try:
            timeout = float(source.get("MAGEN3_TIMEOUT_MS", "15000")) / 1000.0
        except (TypeError, ValueError):
            timeout = 15.0
        if timeout <= 0:
            timeout = 15.0
        auth_mode = "bearer" if source.get("MAGEN3_AUTH_MODE") == "bearer" else "header"
        return cls(
            gateway_url=gateway_url,
            agent_id=agent_id,
            api_key=api_key,
            timeout=timeout,
            auth_mode=auth_mode,
            transport=transport,
        )

    def verify_agent(self) -> Dict[str, Any]:
        return self._request("GET", f"/api/agent-gateway/me?agentId={quote(self.agent_id)}")

    def check_intent(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        wallet = str(intent.get("executionWalletAddress", "")).strip()
        action = intent.get("action")
        if not wallet:
            raise ValueError("executionWalletAddress is required")
        if not isinstance(action, dict) or not str(action.get("type", "")).strip():
            raise ValueError("action.type is required")
        if not str(action.get("target", "")).strip():
            raise ValueError("action.target is required")
        payload = dict(intent)
        payload["agentId"] = self.agent_id
        payload.setdefault("walletAddress", wallet)
        return self._request("POST", "/api/agent-gateway/intents", payload)


    def get_approval(self, approval_or_audit_id: str) -> Dict[str, Any]:
        identifier = str(approval_or_audit_id or "").strip()
        if not identifier:
            raise ValueError("approval_or_audit_id is required")
        return self._request("GET", f"/api/agent-gateway/approvals/{quote(identifier)}?agentId={quote(self.agent_id)}")

    def report_x402_settlement(self, update: Dict[str, Any]) -> Dict[str, Any]:
        audit_log_id = str(update.get("auditLogId", "")).strip()
        fingerprint = str(update.get("requestFingerprint", "")).strip()
        if not audit_log_id:
            raise ValueError("auditLogId is required")
        if not fingerprint:
            raise ValueError("requestFingerprint is required")
        payload = dict(update)
        payload["agentId"] = self.agent_id
        return self._request("POST", "/api/agent-gateway/x402/settlements", payload)

    def report_execution_reconciliation(self, update: Dict[str, Any]) -> Dict[str, Any]:
        audit_log_id = str(update.get("auditLogId", "")).strip()
        if not audit_log_id:
            raise ValueError("auditLogId is required")
        payload = dict(update)
        payload["agentId"] = self.agent_id
        return self._request("POST", "/api/agent-gateway/executions/reconcile", payload)

    def poll_execution_reconciliation(self, options: Dict[str, Any]) -> Dict[str, Any]:
        audit_log_id = str(options.get("auditLogId", "")).strip()
        if not audit_log_id:
            raise ValueError("auditLogId is required")
        prohibited = next((key for key in options if key.lower() in {"rpcurl", "rpcendpoint", "providerurl", "endpoint"}), None)
        if prohibited:
            raise ValueError(f"{prohibited} is not accepted; RPC endpoints are configured on the Magen3 backend")
        payload = dict(options)
        payload["agentId"] = self.agent_id
        return self._request("POST", "/api/agent-gateway/executions/poll", payload)

    def require_allowed(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        response = self.check_intent(intent)
        if not is_execution_approved(response):
            result = response.get("result", {})
            raise Magen3Error(f"Magen3 returned {result.get('decision')}: {get_agent_message(response)}", 403, response)
        return response

    @staticmethod
    def agent_message(response: Mapping[str, Any]) -> str:
        return get_agent_message(response)

    @staticmethod
    def execution_approved(response: Mapping[str, Any]) -> bool:
        return is_execution_approved(response)

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.auth_mode == "bearer":
            headers["Authorization"] = f"Bearer {self.api_key}"
        else:
            headers["x-magen3-agent-key"] = self.api_key
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        result = self.transport(method, f"{self.gateway_url.rstrip('/')}{path}", headers, data, self.timeout)
        if not isinstance(result, dict):
            raise Magen3Error("Magen3 returned an invalid response", 0, result)
        return result
