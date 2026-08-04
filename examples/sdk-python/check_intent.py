import os
from datetime import datetime, timezone
from magen3 import (
    Magen3Client,
    create_instruction_integrity_binding,
    get_agent_message,
    is_execution_approved,
)

for key in ("MAGEN3_GATEWAY_URL", "MAGEN3_AGENT_ID", "MAGEN3_API_KEY", "CASPER_EXECUTION_WALLET"):
    if not os.getenv(key):
        raise RuntimeError(f"{key} is required")

client = Magen3Client.from_env()
original_user_request = "Send 2 CSPR to the configured Casper Testnet target"
intent = {
    "source": "Magen3 SDK Python Example",
    "targetChain": "casper-testnet",
    "executionWalletAddress": os.environ["CASPER_EXECUTION_WALLET"],
    "goal": original_user_request,
    "reason": "SDK integration test",
    "action": {
        "type": "Transfer",
        "amount": 2,
        "asset": "CSPR",
        "target": os.getenv("CASPER_TARGET", os.environ["CASPER_EXECUTION_WALLET"]),
        "targetType": "Wallet Address",
        "preflight": {
            "paymentAmountMotes": "5000000000",
            "gasPriceTolerance": 1,
            "ttl": "30m",
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
    },
}
intent["action"]["instructionIntegrity"] = create_instruction_integrity_binding(
    intent,
    goal_id="goal:sdk-python-example-transfer",
    original_user_request=original_user_request,
)

response = client.check_intent(intent)
explanation = response.get("decisionExplanation") or response.get("result", {}).get("decisionExplanation") or {}
print({
    "decision": response["result"]["decision"],
    "executionApproved": is_execution_approved(response),
    "message": get_agent_message(response),
    "diagnostic": {
        "code": explanation.get("code"),
        "field": explanation.get("field"),
        "expected": explanation.get("expected"),
        "received": explanation.get("received"),
        "mismatchFields": explanation.get("mismatchFields"),
    },
    "auditLogId": response.get("auditLog", {}).get("id"),
    "nextAction": response.get("nextAction"),
})
