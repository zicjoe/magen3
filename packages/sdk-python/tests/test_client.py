import json
import unittest
from magen3 import Magen3Client, Magen3Error


class ClientTests(unittest.TestCase):
    def test_check_intent(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured.update(method=method, url=url, headers=headers, payload=json.loads(data.decode()))
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed"}}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({"executionWalletAddress": "01abc", "action": {"type": "Transfer", "target": "01def"}})
        self.assertEqual(result["result"]["decision"], "Allowed")
        self.assertEqual(captured["payload"]["agentId"], "MAG-1")
        self.assertEqual(captured["headers"]["x-magen3-agent-key"], "secret")

    def test_require_allowed(self):
        def transport(*_):
            return {"result": {"decision": "Blocked", "reason": "limit"}}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        with self.assertRaises(Magen3Error):
            client.require_allowed({"executionWalletAddress": "01abc", "action": {"type": "Transfer", "target": "01def"}})

    def test_bridge_metadata_passes_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed"}}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        client.check_intent({
            "executionWalletAddress": "01abc",
            "action": {
                "type": "Bridge",
                "amount": 10,
                "asset": "CSPR",
                "target": "contract-package-hash-" + "a" * 64,
                "bridge": {
                    "sourceChain": "casper-test",
                    "destinationChain": "ethereum-sepolia",
                    "provider": "Test Bridge",
                    "routeId": "route-001",
                    "destinationAddress": "0x0000000000000000000000000000000000000001"
                }
            }
        })
        self.assertEqual(captured["payload"]["action"]["bridge"]["provider"], "Test Bridge")


if __name__ == "__main__":
    unittest.main()
