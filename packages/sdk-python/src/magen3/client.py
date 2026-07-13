from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class Magen3Error(RuntimeError):
    def __init__(self, message: str, status: int = 0, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


Transport = Callable[[str, str, Dict[str, str], Optional[bytes], float], Any]


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
        if not self.gateway_url.strip():
            raise ValueError("gateway_url is required")
        if not self.agent_id.strip():
            raise ValueError("agent_id is required")
        if not self.api_key.strip():
            raise ValueError("api_key is required")
        if self.auth_mode not in {"header", "bearer"}:
            raise ValueError("auth_mode must be 'header' or 'bearer'")

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

    def require_allowed(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        response = self.check_intent(intent)
        result = response.get("result", {})
        if result.get("decision") != "Allowed":
            raise Magen3Error(f"Magen3 returned {result.get('decision')}: {result.get('reason')}", 403, response)
        return response

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
