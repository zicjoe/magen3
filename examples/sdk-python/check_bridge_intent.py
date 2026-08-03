import os
from datetime import datetime, timedelta, timezone
from magen3 import Magen3Client

required = (
    "MAGEN3_GATEWAY_URL",
    "MAGEN3_AGENT_ID",
    "MAGEN3_API_KEY",
    "CASPER_EXECUTION_WALLET",
    "CASPER_BRIDGE_CONTRACT",
    "BRIDGE_DESTINATION_ADDRESS",
)
for key in required:
    if not os.getenv(key):
        raise RuntimeError(f"{key} is required")

now = datetime.now(timezone.utc)
bridge_contract = os.environ["CASPER_BRIDGE_CONTRACT"]
client = Magen3Client(
    os.environ["MAGEN3_GATEWAY_URL"],
    os.environ["MAGEN3_AGENT_ID"],
    os.environ["MAGEN3_API_KEY"],
)
response = client.check_intent({
    "source": "Magen3 Bridge Controls Python Example",
    "targetChain": "casper-testnet",
    "executionWalletAddress": os.environ["CASPER_EXECUTION_WALLET"],
    "goal": "Validate a provider-supplied bridge route before signing",
    "reason": "Bridge Controls SDK integration test",
    "action": {
        "type": "Bridge",
        "amount": float(os.getenv("BRIDGE_AMOUNT", "10")),
        "asset": os.getenv("BRIDGE_ASSET", "CSPR"),
        "target": bridge_contract,
        "targetType": "Bridge Contract",
        "contractIdentifierType": "Package Hash" if bridge_contract.startswith("contract-package-") else "Contract Hash",
        "chainName": os.getenv("CASPER_CHAIN_NAME", "casper-test"),
        "preflight": {
            "paymentAmountMotes": os.getenv("BRIDGE_PAYMENT_MOTES", "5000000000"),
            "gasPriceTolerance": 1,
            "ttl": "30m",
            "timestamp": now.isoformat().replace("+00:00", "Z"),
        },
        "bridge": {
            "sourceChain": os.getenv("BRIDGE_SOURCE_CHAIN", "casper-test"),
            "destinationChain": os.getenv("BRIDGE_DESTINATION_CHAIN", "ethereum-sepolia"),
            "provider": os.getenv("BRIDGE_PROVIDER", "Reviewed Bridge Adapter"),
            "routeId": os.getenv("BRIDGE_ROUTE_ID", f"route-{int(now.timestamp())}"),
            "destinationAddress": os.environ["BRIDGE_DESTINATION_ADDRESS"],
            "asset": os.getenv("BRIDGE_ASSET", "CSPR"),
            "feeBps": float(os.getenv("BRIDGE_FEE_BPS", "50")),
            "expectedOutput": float(os.getenv("BRIDGE_EXPECTED_OUTPUT", "9.95")),
            "minimumReceived": float(os.getenv("BRIDGE_MINIMUM_RECEIVED", "9.8")),
            "quoteTimestamp": now.isoformat().replace("+00:00", "Z"),
            "quoteExpiresAt": (now + timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
            "sourceConfirmations": int(os.getenv("BRIDGE_SOURCE_CONFIRMATIONS", "2")),
            "destinationConfirmations": int(os.getenv("BRIDGE_DESTINATION_CONFIRMATIONS", "12")),
        },
    },
})
print({
    "decision": response["result"]["decision"],
    "risk": response["result"].get("risk"),
    "reason": response["result"].get("primaryReason", response["result"].get("reason")),
    "bridgeControlsContext": response["result"].get("bridgeControlsContext"),
    "auditLogId": response.get("auditLog", {}).get("id"),
    "nextAction": response.get("nextAction"),
})
