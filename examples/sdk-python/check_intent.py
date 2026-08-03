import os
from datetime import datetime, timezone
from magen3 import Magen3Client

for key in ("MAGEN3_GATEWAY_URL", "MAGEN3_AGENT_ID", "MAGEN3_API_KEY", "CASPER_EXECUTION_WALLET"):
    if not os.getenv(key):
        raise RuntimeError(f"{key} is required")

client = Magen3Client(os.environ["MAGEN3_GATEWAY_URL"], os.environ["MAGEN3_AGENT_ID"], os.environ["MAGEN3_API_KEY"])
response = client.check_intent({
    "source": "Magen3 SDK Python Example",
    "targetChain": "casper-testnet",
    "executionWalletAddress": os.environ["CASPER_EXECUTION_WALLET"],
    "goal": "Validate an external agent intent before execution",
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
})
print({"decision": response["result"]["decision"], "risk": response["result"].get("risk"), "reason": response["result"].get("reason"), "auditLogId": response.get("auditLog", {}).get("id"), "nextAction": response.get("nextAction")})
