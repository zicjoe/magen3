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


if __name__ == "__main__":
    unittest.main()
