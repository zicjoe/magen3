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


    def test_compliance_evidence_passes_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed"}}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        client.check_intent({
            "executionWalletAddress": "01abc",
            "action": {
                "type": "Transfer",
                "amount": 5,
                "target": "01def",
                "compliance": {
                    "originatorJurisdiction": "NG",
                    "beneficiaryJurisdiction": "US",
                    "counterpartyType": "VASP",
                    "originatorAttestation": {"status": "Verified", "provider": "Verified Provider", "reference": "ORIGINATOR-001"},
                    "travelRule": {"status": "Complete", "reference": "TRAVEL-RULE-001", "dataHash": "a" * 64},
                    "screening": {"status": "Clear", "provider": "Verified Provider", "reference": "SCREEN-001"}
                }
            }
        })
        self.assertEqual(captured["payload"]["action"]["compliance"]["travelRule"]["status"], "Complete")
        self.assertEqual(captured["payload"]["action"]["compliance"]["originatorAttestation"]["reference"], "ORIGINATOR-001")

    def test_execution_integrity_lifecycle_passes_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed"}}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        client.check_intent({
            "executionWalletAddress": "01abc",
            "action": {
                "type": "Transfer",
                "amount": 5,
                "target": "01def",
                "lifecycle": {
                    "intentId": "intent:python-0001",
                    "idempotencyKey": "idempotency:python-0001",
                    "sequence": 3,
                    "createdAt": "2026-07-23T10:00:00.000Z",
                    "expiresAt": "2026-07-23T10:10:00.000Z",
                    "attempt": 0
                }
            }
        })
        self.assertEqual(captured["payload"]["action"]["lifecycle"]["intentId"], "intent:python-0001")
        self.assertEqual(captured["payload"]["action"]["lifecycle"]["sequence"], 3)


    def test_token_permission_metadata_passes_through_without_signatures(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {
                "ok": True,
                "executionApproved": True,
                "result": {
                    "decision": "Allowed",
                    "tokenPermissionControlsContext": {
                        "classification": "Fungible Token Approval",
                        "fingerprint": "a" * 64,
                        "replayStatus": "clear",
                    },
                },
            }

        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({
            "executionWalletAddress": "0x0000000000000000000000000000000000000001",
            "targetChain": "ethereum-sepolia",
            "action": {
                "type": "Contract Call",
                "target": "0x1111111111111111111111111111111111111111",
                "targetType": "Trusted Contract",
                "tokenPermission": {
                    "permissionType": "Fungible Token Approval",
                    "owner": "0x0000000000000000000000000000000000000001",
                    "tokenContract": "0x1111111111111111111111111111111111111111",
                    "spender": "0x2222222222222222222222222222222222222222",
                    "approvalAmount": 25,
                    "intendedTransactionAmount": 20,
                    "unlimited": False,
                    "network": "ethereum-sepolia",
                },
            },
        })

        permission = captured["payload"]["action"]["tokenPermission"]
        self.assertEqual(permission["spender"], "0x2222222222222222222222222222222222222222")
        self.assertNotIn("signature", permission)
        self.assertEqual(result["result"]["tokenPermissionControlsContext"]["replayStatus"], "clear")

    def test_privileged_action_metadata_passes_through_without_signatures(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {
                "ok": True,
                "executionApproved": False,
                "result": {
                    "decision": "Review Required",
                    "privilegedActionControlsContext": {
                        "classifiedAction": "Proxy Upgrade",
                        "parameterFingerprint": "b" * 64,
                        "approvalRequired": True,
                        "requiredApprovalCount": 2,
                    },
                },
            }

        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({
            "executionWalletAddress": "01" + "1" * 64,
            "action": {
                "type": "Contract Interaction",
                "target": "contract-hash-" + "2" * 64,
                "entryPoint": "upgrade_to",
                "chainName": "casper-test",
                "privilegedAction": {
                    "classifiedAction": "Proxy Upgrade",
                    "contract": "contract-hash-" + "2" * 64,
                    "entryPoint": "upgrade_to",
                    "currentValue": "contract-hash-" + "3" * 64,
                    "requestedValue": "contract-hash-" + "4" * 64,
                    "implementation": "contract-hash-" + "4" * 64,
                    "classifierSource": "python-sdk-test",
                    "classifierVersion": "1.0.0",
                    "network": "casper-test",
                },
            },
        })

        metadata = captured["payload"]["action"]["privilegedAction"]
        self.assertEqual(metadata["classifiedAction"], "Proxy Upgrade")
        self.assertNotIn("signature", metadata)
        self.assertEqual(result["result"]["privilegedActionControlsContext"]["requiredApprovalCount"], 2)

    def test_get_approval(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured.update(method=method, url=url, headers=headers, data=data)
            return {
                "ok": True,
                "approval": {
                    "id": "APR-1",
                    "auditLogId": "AUDIT-1",
                    "reviewStatus": "Approved",
                    "bindingHash": "a" * 64,
                    "requiredApprovals": 1,
                    "approvalsReceived": 1,
                    "verifiedApprovalsReceived": 1,
                    "verifiedResponses": 1,
                    "signatureRequired": True,
                    "signatureDomain": "magen3.approval-response.v1",
                    "signatureChainName": "casper-test",
                    "responses": [{"walletAddress": "01abc", "response": "Approved", "timestamp": "2026-07-23T11:00:00.000Z", "signatureVerified": True, "signatureAlgorithm": "Ed25519", "signatureHash": "b" * 64, "memberGroupIds": ["treasury"], "groupIds": ["treasury"]}],
                    "remainingApprovals": 0,
                    "resolvedTier": {"id": "high-value", "name": "High Value Treasury"},
                    "groupProgress": [{"groupId": "treasury", "groupName": "Treasury", "required": 1, "received": 1, "remaining": 0, "satisfied": True}],
                    "organizationalQuorum": {"enabled": True, "satisfied": True},
                    "executionWindowStatus": "open",
                    "expiresAt": "2026-07-23T12:00:00.000Z",
                    "mayProceedToSigning": True,
                },
            }
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.get_approval("AUDIT-1")
        self.assertEqual(captured["method"], "GET")
        self.assertTrue(captured["url"].endswith("/api/agent-gateway/approvals/AUDIT-1?agentId=MAG-1"))
        self.assertIsNone(captured["data"])
        self.assertTrue(result["approval"]["mayProceedToSigning"])
        self.assertTrue(result["approval"]["signatureRequired"])
        self.assertEqual(result["approval"]["verifiedApprovalsReceived"], 1)
        self.assertTrue(result["approval"]["responses"][0]["signatureVerified"])
        self.assertEqual(result["approval"]["resolvedTier"]["name"], "High Value Treasury")
        self.assertTrue(result["approval"]["organizationalQuorum"]["satisfied"])
        self.assertEqual(result["approval"]["responses"][0]["memberGroupIds"], ["treasury"])

    def test_x402_authorization_and_settlement_reporting(self):
        captured = []
        def transport(method, url, headers, data, timeout):
            payload = json.loads(data.decode())
            captured.append({"method": method, "url": url, "payload": payload})
            if url.endswith("/api/agent-gateway/x402/settlements"):
                return {"ok": True, "settlement": {"status": "confirmed"}}
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed"}, "auditLog": {"id": "AUDIT-X402-1"}}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        client.check_intent({
            "executionWalletAddress": "0x0000000000000000000000000000000000000002",
            "action": {
                "type": "x402 Payment",
                "amount": 1,
                "asset": "USDC",
                "target": "https://api.example.com/data",
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
                    "validUntil": "2026-07-23T12:00:00.000Z",
                    "requestId": "request-001",
                    "paymentRequiredHash": "b" * 64
                }
            }
        })
        client.report_x402_settlement({
            "auditLogId": "AUDIT-X402-1",
            "status": "confirmed",
            "requestFingerprint": "a" * 64,
            "transactionHash": "0x" + "c" * 64,
            "attempt": 1,
            "resourceDelivered": True
        })
        self.assertEqual(captured[0]["payload"]["action"]["x402"]["scheme"], "exact")
        self.assertEqual(captured[1]["url"], "https://api.example/api/agent-gateway/x402/settlements")
        self.assertEqual(captured[1]["payload"]["agentId"], "MAG-1")
        self.assertNotIn("paymentSignature", captured[1]["payload"])


    def test_contract_argument_runtime_args_and_context_pass_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {
                "ok": True,
                "executionApproved": True,
                "result": {
                    "decision": "Allowed",
                    "contractArgumentPoliciesContext": {
                        "target": "contract-package-hash-" + "a" * 64,
                        "entryPoint": "transfer",
                        "ruleId": "transfer-rule",
                        "parameterFingerprint": "c" * 64,
                        "evaluatedArguments": ["recipient", "amount"],
                        "violations": [],
                    },
                },
            }

        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({
            "executionWalletAddress": "01" + "1" * 64,
            "action": {
                "type": "Contract Interaction",
                "target": "contract-package-hash-" + "a" * 64,
                "targetType": "Trusted Contract",
                "contractIdentifierType": "Package Hash",
                "entryPoint": "transfer",
                "chainName": "casper-test",
                "preflight": {
                    "runtimeArgs": {
                        "recipient": "01" + "2" * 64,
                        "amount": "25",
                    },
                },
            },
        })

        self.assertEqual(captured["payload"]["action"]["preflight"]["runtimeArgs"]["amount"], "25")
        self.assertEqual(result["result"]["contractArgumentPoliciesContext"]["ruleId"], "transfer-rule")
        self.assertEqual(result["result"]["contractArgumentPoliciesContext"]["violations"], [])

    def test_emergency_circuit_breaker_response_passes_through(self):
        pause = {
            "id": "EPAUSE-1",
            "agentId": "MAG-1",
            "scopeType": "Agent",
            "scopeValue": "MAG-1",
            "enforcementAction": "Blocked",
            "triggerType": "Manual",
            "reason": "Investigating repeated execution failures",
            "status": "Active",
            "createdAt": "2026-07-24T10:00:00.000Z",
            "expiresAt": "2026-07-24T11:00:00.000Z",
        }

        def transport(*_):
            return {
                "ok": True,
                "executionApproved": False,
                "result": {
                    "decision": "Blocked",
                    "reason": "An active emergency pause blocks this execution.",
                    "emergencyControlsContext": {
                        "evaluated": True,
                        "active": True,
                        "automatic": False,
                        "enforcementAction": "Blocked",
                        "matchingPauses": [pause],
                        "pause": pause,
                    },
                },
                "emergencyPause": pause,
            }

        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({
            "executionWalletAddress": "01abc",
            "action": {"type": "Transfer", "amount": 1, "target": "01def"},
        })
        self.assertTrue(result["result"]["emergencyControlsContext"]["active"])
        self.assertEqual(result["result"]["emergencyControlsContext"]["pause"]["scopeType"], "Agent")
        self.assertEqual(result["emergencyPause"]["id"], "EPAUSE-1")


    def test_instruction_integrity_metadata_and_context_pass_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {
                "ok": True, "executionApproved": True,
                "result": {
                    "decision": "Allowed",
                    "instructionIntegrityContext": {
                        "metadataSupplied": True, "goalId": "goal:transfer-001",
                        "intentSource": "user", "externalContentUsed": False,
                        "currentParameterHash": "c" * 64, "parametersChanged": False, "violations": [],
                    },
                },
            }
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({
            "executionWalletAddress": "01" + "1" * 64,
            "action": {
                "type": "Transfer", "amount": 5, "target": "01" + "2" * 64,
                "instructionIntegrity": {
                    "goalId": "goal:transfer-001", "originalUserGoalHash": "a" * 64,
                    "initiatedBy": "user", "intentSource": "user", "sourceDomains": [],
                    "externalContentUsed": False, "userConfirmed": True, "sourceTrustLevel": "trusted",
                    "originalPermissionScopes": ["wallet:transfer"],
                    "currentPermissionScopes": ["wallet:transfer"],
                },
            },
        })
        self.assertEqual(captured["payload"]["action"]["instructionIntegrity"]["goalId"], "goal:transfer-001")
        self.assertEqual(result["result"]["instructionIntegrityContext"]["violations"], [])

    def test_tool_mcp_integrity_metadata_and_context_pass_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed", "toolMcpIntegrityContext": {"serverId": "mcp-main", "toolName": "wallet.transfer", "approvedServer": True, "approvedTool": True, "violations": []}}}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({"executionWalletAddress": "01" + "1" * 64, "action": {"type": "Transfer", "amount": 1, "target": "01" + "2" * 64, "toolIntegrity": {"mcpServerId": "mcp-main", "mcpServerUrl": "https://mcp.example", "toolName": "wallet.transfer", "toolVersion": "1.0.0", "manifestHash": "a" * 64, "schemaHash": "b" * 64, "descriptionHash": "c" * 64, "permissionScopes": ["wallet:read"], "credentialScope": "wallet-limited", "tls": True, "toolOrigin": "magen3-mcp"}}})
        self.assertEqual(captured["payload"]["action"]["toolIntegrity"]["toolName"], "wallet.transfer")
        self.assertTrue(result["result"]["toolMcpIntegrityContext"]["approvedTool"])


if __name__ == "__main__":
    unittest.main()
