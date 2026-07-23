import os
from datetime import datetime, timezone
from magen3 import Magen3Client

client = Magen3Client(
    os.environ["MAGEN3_GATEWAY_URL"],
    os.environ["MAGEN3_AGENT_ID"],
    os.environ["MAGEN3_AGENT_KEY"],
)

received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
decision = client.check_intent({
    "executionWalletAddress": "0x2222222222222222222222222222222222222222",
    "action": {
        "type": "x402 Payment",
        "amount": 1,
        "asset": "USDC",
        "target": "https://api.example.com/data",
        "targetType": "x402 Merchant",
        "x402": {
            "version": 2,
            "scheme": "exact",
            "resourceUrl": "https://api.example.com/data",
            "method": "GET",
            "merchantDomain": "api.example.com",
            "payTo": "0x1111111111111111111111111111111111111111",
            "asset": "USDC",
            "network": "eip155:84532",
            "facilitator": "https://x402.org/facilitator",
            "amountAtomic": "1000000",
            "maxTimeoutSeconds": 300,
            "requirementsReceivedAt": received_at,
            "requestId": f"python-{int(datetime.now().timestamp())}",
            "paymentRequiredHash": "b" * 64,
            "settlementStatus": "not_submitted",
            "settlementAttempt": 0,
        },
    },
})

print(decision)
# Create the real payment signature only after an Allowed decision.
