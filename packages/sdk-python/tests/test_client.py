import json
import unittest
from magen3 import Magen3Client, Magen3Error, build_delegation_attestation_message, build_protected_parameters, create_instruction_integrity_binding, get_agent_message, hash_delegation_attestation, hash_protected_parameters, is_execution_approved


class ClientTests(unittest.TestCase):

    def test_builds_backend_compatible_instruction_binding(self):
        intent = {
            "source": "YieldBot",
            "targetChain": "base-sepolia",
            "executionWalletAddress": "0x" + "1" * 40,
            "action": {
                "type": "Transfer",
                "amount": 5,
                "asset": "USDC",
                "target": "0x" + "2" * 40,
                "targetType": "Wallet Address",
            },
        }
        protected = build_protected_parameters(intent)
        self.assertEqual(protected["chainName"], "base-sepolia")
        self.assertEqual(protected["destination"], intent["action"]["target"])
        self.assertRegex(hash_protected_parameters(protected), r"^[0-9a-f]{64}$")
        binding = create_instruction_integrity_binding(
            intent,
            goal_id="goal:yieldbot-transfer-1",
            original_user_request="Send 5 USDC to " + intent["action"]["target"],
        )
        self.assertEqual(binding["originalParameterHash"], binding["currentParameterHash"])
        self.assertEqual(binding["originalProtectedParameters"], protected)
        self.assertRegex(binding["originalUserGoalHash"], r"^[0-9a-f]{64}$")

    def test_delegation_attestation_builder(self):
        delegation = {
            "delegationId": "dlg-python-builder-001", "delegatingWallet": "01" + "1" * 64, "delegate": "session-agent",
            "sessionKey": "01" + "2" * 64, "allowedNetworks": ["casper-test"], "allowedContracts": ["contract-package-hash-example"],
            "allowedMethods": ["Transfer"], "allowedAssets": ["CSPR"], "nativeAmountLimit": 25, "tokenAmountLimits": {"TEST": 10},
            "maxTransactionAmount": 10, "maxFrequency": 5, "validFrom": "2026-07-25T00:00:00.000Z", "expiresAt": "2026-07-25T01:00:00.000Z",
            "revocationStatus": "Active", "delegationDepth": 0, "redelegationAllowed": False, "nonce": "nonce-python-builder-001", "chainName": "casper-test",
        }
        message = build_delegation_attestation_message(delegation, "MAG-PY-1")
        self.assertIn("Magen3 Delegated Permission Attestation", message)
        self.assertIn("Allowed Methods: transfer", message)
        self.assertIn("does not sign or submit a blockchain transaction", message)
        self.assertEqual(len(hash_delegation_attestation(delegation, "MAG-PY-1")), 64)

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

    def test_agent_message_prefers_user_ready_gateway_explanation(self):
        response = {
            "agentMessage": "Magen3 paused this action because the destination is new. No human approval is required yet. Nothing was signed or sent.",
            "result": {"decision": "Review Required", "primaryReason": "The destination is new."},
        }
        self.assertEqual(get_agent_message(response), response["agentMessage"])

    def test_execution_approval_requires_allowed_and_explicit_execution_approval(self):
        self.assertTrue(is_execution_approved({"executionApproved": True, "result": {"decision": "Allowed"}}))
        self.assertFalse(is_execution_approved({"executionApproved": False, "result": {"decision": "Allowed"}}))
        self.assertFalse(is_execution_approved({"executionApproved": True, "result": {"decision": "Review Required"}}))

    def test_require_allowed_fails_closed_when_allowed_is_not_execution_approved(self):
        def transport(*_):
            return {
                "executionApproved": False,
                "agentMessage": "Magen3 has not approved execution. Nothing was signed or sent.",
                "result": {"decision": "Allowed", "primaryReason": "Additional execution evidence is required."},
            }
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        with self.assertRaisesRegex(Magen3Error, "not approved execution"):
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


    def test_execution_reconciliation_reporting(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured.update({"method": method, "url": url, "headers": headers, "payload": json.loads(data.decode())})
            return {"ok": True, "reconciliation": {"status": "confirmed", "confirmations": 3}}

        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.report_execution_reconciliation({
            "auditLogId": "AUDIT-EXEC-1",
            "status": "confirmed",
            "transactionHash": "0x" + "d" * 64,
            "attempt": 1,
            "confirmations": 3,
            "finalized": True,
            "provider": "casper-rpc-primary",
            "resourceDelivered": True,
        })
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["url"], "https://api.example/api/agent-gateway/executions/reconcile")
        self.assertEqual(captured["headers"]["x-magen3-agent-key"], "secret")
        self.assertEqual(captured["payload"]["agentId"], "MAG-1")
        self.assertEqual(captured["payload"]["auditLogId"], "AUDIT-EXEC-1")
        self.assertNotIn("signedTransaction", captured["payload"])
        self.assertEqual(result["reconciliation"]["status"], "confirmed")

    def test_execution_reconciliation_requires_audit_id(self):
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=lambda *_: {})
        with self.assertRaisesRegex(ValueError, "auditLogId is required"):
            client.report_execution_reconciliation({"status": "pending"})

    def test_execution_reconciliation_polling(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured.update({"method": method, "url": url, "payload": json.loads(data.decode())})
            return {"ok": True, "reconciliation": {"status": "pending", "provider": "configured-casper-rpc"}}

        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.poll_execution_reconciliation({"auditLogId": "AUDIT-POLL-1", "chainFamily": "casper", "chainName": "casper-test"})
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["url"], "https://api.example/api/agent-gateway/executions/poll")
        self.assertEqual(captured["payload"]["agentId"], "MAG-1")
        self.assertNotIn("rpcUrl", captured["payload"])
        self.assertEqual(result["reconciliation"]["status"], "pending")

    def test_execution_reconciliation_polling_rejects_rpc_url(self):
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=lambda *_: {})
        with self.assertRaisesRegex(ValueError, "not accepted"):
            client.poll_execution_reconciliation({"auditLogId": "AUDIT-POLL-1", "rpcUrl": "https://evil.example"})

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


    def test_delegation_metadata_and_sanitized_context_pass_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed", "delegationSafetyContext": {"delegationId": "dlg-python-001", "signatureVerified": True, "signatureHash": "d" * 64, "signatureAlgorithm": "Ed25519", "allowedMethods": ["Transfer"], "violations": []}}}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({"executionWalletAddress": "01" + "1" * 64, "action": {"type": "Transfer", "amount": 1, "asset": "CSPR", "target": "01" + "3" * 64, "delegation": {"delegationId": "dlg-python-001", "delegatingWallet": "01" + "1" * 64, "delegate": "01" + "2" * 64, "sessionKey": "01" + "2" * 64, "allowedNetworks": ["casper-test"], "allowedMethods": ["Transfer"], "allowedAssets": ["CSPR"], "maxTransactionAmount": 5, "maxFrequency": 2, "validFrom": "2026-07-25T00:00:00.000Z", "expiresAt": "2026-07-25T01:00:00.000Z", "revocationStatus": "Active", "delegationDepth": 0, "redelegationAllowed": False, "nonce": "nonce-python-001", "chainName": "casper-test", "attestationHash": "a" * 64, "attestationSignature": "b" * 128}}})
        self.assertEqual(captured["payload"]["action"]["delegation"]["delegationId"], "dlg-python-001")
        self.assertEqual(captured["payload"]["action"]["delegation"]["attestationSignature"], "b" * 128)
        self.assertTrue(result["result"]["delegationSafetyContext"]["signatureVerified"])
        self.assertEqual(result["result"]["delegationSafetyContext"]["signatureHash"], "d" * 64)


    def test_rpc_chain_integrity_metadata_and_context_pass_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed", "rpcChainIntegrityContext": {"metadataSupplied": True, "selectedProviderId": "primary", "networkAgreement": True, "providerAgreement": True, "violations": []}}}
        client = Magen3Client("https://api.example", "MAG-RPC-1", "secret", transport=transport)
        result = client.check_intent({"executionWalletAddress": "01" + "1" * 64, "action": {"type": "Transfer", "amount": 1, "asset": "CSPR", "target": "01" + "2" * 64, "chainName": "casper-test", "rpcIntegrity": {
            "expectedChainName": "casper-test", "expectedNetworkIdentifier": "casper-testnet", "expectedGenesisHash": "a" * 64,
            "selectedEndpoint": "https://node.testnet.casper.network/rpc", "selectedProviderId": "primary",
            "providerObservations": [{"providerId": "primary", "endpoint": "https://node.testnet.casper.network/rpc", "chainName": "casper-test", "networkIdentifier": "casper-testnet", "genesisHash": "a" * 64, "tls": True, "synced": True, "latestBlockHeight": 125000, "latestBlockTimestamp": "2026-07-25T00:00:00.000Z", "responseTimestamp": "2026-07-25T00:00:05.000Z", "timedOut": False, "rateLimited": False, "speculative": False}],
            "automaticFailoverUsed": False,
        }}})
        self.assertEqual(captured["payload"]["action"]["rpcIntegrity"]["selectedProviderId"], "primary")
        self.assertTrue(result["result"]["rpcChainIntegrityContext"]["networkAgreement"])
        self.assertEqual(result["result"]["rpcChainIntegrityContext"]["violations"], [])



    def test_gas_sponsorship_fee_safety_metadata_and_context_pass_through(self):
        captured = {}
        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed", "gasSponsorshipFeeSafetyContext": {"metadataSupplied": True, "chainFamily": "Casper", "sponsor": "magen3-relayer", "payerMatches": True, "fingerprint": "f" * 64, "violations": []}}}
        client = Magen3Client("https://api.example", "MAG-FEE-1", "secret", transport=transport)
        result = client.check_intent({"executionWalletAddress": "01" + "1" * 64, "action": {"type": "Transfer", "amount": 1, "asset": "CSPR", "target": "01" + "2" * 64, "chainName": "casper-test", "feeSafety": {
            "chainFamily": "Casper", "chainName": "casper-test", "networkFee": 1, "feeUnit": "CSPR", "sponsor": "magen3-relayer",
            "sponsorshipId": "sponsor-python-1", "sponsorshipExpiry": "2026-07-25T03:00:00.000Z", "sponsorshipScopes": ["Transfer"], "sponsorSignatureHash": "a" * 64,
            "expectedPayer": "magen3-relayer", "actualPayer": "magen3-relayer", "sponsored": True, "sponsorshipAvailable": True
        }}})
        self.assertEqual(captured["payload"]["action"]["feeSafety"]["sponsor"], "magen3-relayer")
        self.assertTrue(result["result"]["gasSponsorshipFeeSafetyContext"]["payerMatches"])
        self.assertEqual(result["result"]["gasSponsorshipFeeSafetyContext"]["violations"], [])



    def test_normalizes_legacy_full_gateway_endpoint(self):
        captured = {}

        def transport(method, url, headers, data, timeout):
            captured["url"] = url
            return {"ok": True}

        client = Magen3Client(
            "https://api.example/api/agent-gateway/intents",
            "MAG-1",
            "secret",
            transport=transport,
        )
        client.verify_agent()
        self.assertEqual(captured["url"], "https://api.example/api/agent-gateway/me?agentId=MAG-1")

    def test_from_env_uses_canonical_variables(self):
        client = Magen3Client.from_env({
            "MAGEN3_GATEWAY_URL": "https://api.example",
            "MAGEN3_AGENT_ID": "MAG-1",
            "MAGEN3_API_KEY": "canonical-secret",
        })
        self.assertEqual(client.gateway_url, "https://api.example")
        self.assertEqual(client.api_key, "canonical-secret")

    def test_from_env_accepts_legacy_api_key_aliases(self):
        first = Magen3Client.from_env({
            "MAGEN3_GATEWAY_URL": "https://api.example",
            "MAGEN3_AGENT_ID": "MAG-1",
            "MAGEN3_AGENT_KEY": "legacy-one",
        })
        second = Magen3Client.from_env({
            "MAGEN3_GATEWAY_URL": "https://api.example",
            "MAGEN3_AGENT_ID": "MAG-1",
            "MAGEN3_AGENT_API_KEY": "legacy-two",
        })
        self.assertEqual(first.api_key, "legacy-one")
        self.assertEqual(second.api_key, "legacy-two")

    def test_trading_route_metadata_passes_through(self):
        captured = {}

        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {
                "ok": True,
                "executionApproved": False,
                "result": {
                    "decision": "Review Required",
                    "tradingRouteIntegrityContext": {
                        "status": "review_required",
                        "routeFingerprint": "a" * 64,
                    },
                },
            }

        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({
            "executionWalletAddress": "0x0000000000000000000000000000000000000001",
            "action": {
                "type": "Swap",
                "amount": 10,
                "asset": "USDC",
                "outputAsset": "DAI",
                "target": "0x1111111111111111111111111111111111111111",
                "tradingRoute": {
                    "quoteProvider": "approved-aggregator",
                    "quoteId": "quote-1",
                    "router": "0x1111111111111111111111111111111111111111",
                    "tokenPath": ["USDC", "WETH", "DAI"],
                    "inputAsset": "USDC",
                    "outputAsset": "DAI",
                    "inputAmount": 10,
                    "expectedOutput": 9.9,
                    "minimumOutput": 9.8,
                    "payloadHash": "b" * 64,
                },
            },
        })
        route = captured["payload"]["action"]["tradingRoute"]
        self.assertEqual(route["quoteId"], "quote-1")
        self.assertEqual(route["tokenPath"], ["USDC", "WETH", "DAI"])
        self.assertEqual(result["result"]["tradingRouteIntegrityContext"]["status"], "review_required")


    def test_market_risk_metadata_passes_through(self):
        captured = {}

        def transport(method, url, headers, data, timeout):
            captured["payload"] = json.loads(data.decode())
            return {
                "ok": True,
                "executionApproved": False,
                "result": {
                    "decision": "Review Required",
                    "marketRiskSignalsContext": {
                        "status": "review_required",
                        "pair": "USDC/DAI",
                        "providerCount": 2,
                    },
                },
            }

        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        result = client.check_intent({
            "executionWalletAddress": "0x0000000000000000000000000000000000000001",
            "action": {
                "type": "Swap",
                "amount": 10,
                "asset": "USDC",
                "outputAsset": "DAI",
                "target": "0x1111111111111111111111111111111111111111",
                "marketRisk": {
                    "baseAsset": "USDC",
                    "quoteAsset": "DAI",
                    "network": "base-sepolia",
                    "venue": "approved-aggregator",
                    "poolId": "pool-1",
                },
            },
        })
        market = captured["payload"]["action"]["marketRisk"]
        self.assertEqual(market["network"], "base-sepolia")
        self.assertEqual(market["poolId"], "pool-1")
        self.assertEqual(result["result"]["marketRiskSignalsContext"]["status"], "review_required")

    def test_across_bridge_metadata_and_polling_pass_through(self):
        captured = []

        def transport(method, url, headers, data, timeout):
            payload = json.loads(data.decode()) if data else None
            captured.append((method, url, payload))
            if url.endswith("/api/agent-gateway/intents"):
                return {"ok": True, "executionApproved": True, "result": {"decision": "Allowed", "bridgeProviderIntegrationContext": {"status": "passed"}}, "bridgeProviderExecution": {"providerId": "across-testnet", "payloadHash": "a" * 64, "routeFingerprint": "b" * 64, "approvals": [], "transaction": {"chainId": "11155420", "to": "0x5555555555555555555555555555555555555555", "data": "0x1234", "value": "0"}}}
            return {"ok": True, "reconciliation": {"status": "delivered"}, "bridgeProviderObservation": {"status": "delivered"}}

        client = Magen3Client("https://api.example", "MAG-BRIDGE", "secret", transport=transport)
        result = client.check_intent({
            "executionWalletAddress": "0x1111111111111111111111111111111111111111",
            "action": {"type": "Bridge", "amount": 1, "asset": "USDC", "target": "0x5555555555555555555555555555555555555555", "bridge": {"providerId": "across-testnet", "sourceChainId": 11155420, "destinationChainId": 84532, "sourceToken": "0x3333333333333333333333333333333333333333", "destinationToken": "0x4444444444444444444444444444444444444444", "amountAtomic": "1000000", "recipient": "0x2222222222222222222222222222222222222222", "tradeType": "exactInput"}},
        })
        self.assertEqual(captured[0][2]["action"]["bridge"]["amountAtomic"], "1000000")
        self.assertEqual(result["bridgeProviderExecution"]["providerId"], "across-testnet")
        polled = client.poll_bridge_provider({"auditLogId": "AUD-1", "transactionHash": "0x" + "a" * 64})
        self.assertTrue(captured[1][1].endswith("/api/agent-gateway/bridge/poll"))
        self.assertEqual(polled["reconciliation"]["status"], "delivered")


    def test_bridge_provider_discovery_and_quote_methods(self):
        captured = []

        def transport(method, url, headers, data, timeout):
            payload = json.loads(data.decode()) if data else None
            captured.append((method, url, payload))
            if url.endswith("/api/bridge-provider-integration/status"):
                return {"ok": True, "bridgeProviderIntegration": {"status": "foundation_available", "providerId": "across-testnet"}}
            if "/api/bridge-providers/chains" in url:
                return {"ok": True, "bridgeProviderIntegration": {"status": "available", "chains": []}}
            if "/api/bridge-providers/tokens" in url:
                return {"ok": True, "bridgeProviderIntegration": {"status": "available", "tokens": []}}
            return {"ok": True, "provider": {"id": "across-testnet", "environment": "testnet"}, "evidence": {"status": "succeeded"}, "unsignedTransactions": {"approvals": [], "bridge": {"to": "0x" + "5" * 40, "data": "0x1234", "value": "0"}}}

        client = Magen3Client("https://api.example", "MAG-BRIDGE", "secret", transport=transport)
        self.assertEqual(client.get_bridge_provider_status()["bridgeProviderIntegration"]["providerId"], "across-testnet")
        client.list_bridge_provider_chains()
        client.list_bridge_provider_tokens(11155420)
        quote_response = client.request_bridge_provider_quote({
            "providerId": "across-testnet",
            "sourceChainId": 11155420,
            "destinationChainId": 84532,
            "inputToken": "0x" + "3" * 40,
            "outputToken": "0x" + "4" * 40,
            "amountAtomic": "1000000",
            "depositor": "0x" + "1" * 40,
            "recipient": "0x" + "2" * 40,
        })
        self.assertEqual(quote_response["provider"]["id"], "across-testnet")
        self.assertTrue(captured[1][1].endswith("/api/bridge-providers/chains?providerId=across-testnet"))
        self.assertIn("chainId=11155420", captured[2][1])
        self.assertEqual(captured[3][2]["agentId"], "MAG-BRIDGE")
        self.assertEqual(captured[3][2]["quote"]["amountAtomic"], "1000000")

    def test_bridge_provider_quote_rejects_provider_url(self):
        client = Magen3Client("https://api.example", "MAG-BRIDGE", "secret", transport=lambda *args: {})
        with self.assertRaisesRegex(ValueError, "not accepted"):
            client.request_bridge_provider_quote({
                "sourceChainId": 11155420,
                "destinationChainId": 84532,
                "inputToken": "0x" + "3" * 40,
                "outputToken": "0x" + "4" * 40,
                "amountAtomic": "1000000",
                "depositor": "0x" + "1" * 40,
                "recipient": "0x" + "2" * 40,
                "providerUrl": "https://evil.example",
            })

    def test_bridge_poll_rejects_provider_credentials(self):
        client = Magen3Client("https://api.example", "MAG-BRIDGE", "secret", transport=lambda *args: {})
        with self.assertRaisesRegex(ValueError, "not accepted"):
            client.poll_bridge_provider({"auditLogId": "AUD-1", "providerUrl": "https://evil.example"})


    def test_threat_intelligence_status_method(self):
        captured = []
        def transport(method, url, headers, data, timeout):
            captured.append((method, url))
            return {"ok": True, "threatIntelligence": {"status": "available", "availableProviderIds": ["goplus"]}}
        client = Magen3Client("https://api.example", "MAG-THREAT", "secret", transport=transport)
        result = client.get_threat_intelligence_status()
        self.assertTrue(captured[0][1].endswith("/api/threat-intelligence/status"))
        self.assertEqual(result["threatIntelligence"]["availableProviderIds"], ["goplus"])

if __name__ == "__main__":
    unittest.main()

class TestX402MeteredUpto(unittest.TestCase):
    def test_create_and_apply_authorization_event(self):
        calls = []
        def transport(method, url, headers, data, timeout):
            calls.append((method, url, json.loads(data.decode())))
            return {"ok": True}
        client = Magen3Client("https://api.example", "MAG-1", "secret", transport=transport)
        client.create_x402_authorization({"auditLogId":"AUD-1","mode":"upto","maximumAuthorizedAtomic":"1000"})
        client.apply_x402_authorization_event({"auditLogId":"AUD-1","type":"reserve","eventId":"e1","idempotencyKey":"k1","amountAtomic":"500"})
        self.assertTrue(calls[0][1].endswith("/api/agent-gateway/x402/authorizations"))
        self.assertEqual(calls[0][2]["agentId"], "MAG-1")
        self.assertTrue(calls[1][1].endswith("/api/agent-gateway/x402/authorization-events"))
        self.assertEqual(calls[1][2]["idempotencyKey"], "k1")

class TestProductionOracleStatus(unittest.TestCase):
    def test_oracle_validation_status_method(self):
        captured = []
        def transport(method, url, headers, data, timeout):
            captured.append((method, url))
            return {"ok": True, "oracleValidation": {"status": "available", "configuredProviderIds": ["pyth_hermes"]}}
        client = Magen3Client("https://api.example", "MAG-ORACLE", "secret", transport=transport)
        result = client.get_oracle_validation_status()
        self.assertTrue(captured[0][1].endswith("/api/oracle-validation/status"))
        self.assertEqual(result["oracleValidation"]["configuredProviderIds"], ["pyth_hermes"])


class TestProductionComplianceStatus(unittest.TestCase):
    def test_compliance_controls_status_method(self):
        captured = []
        def transport(method, url, headers, data, timeout):
            captured.append((method, url))
            return {"ok": True, "complianceControls": {"status": "available", "configuredProviderIds": ["ofac_api"]}}
        client = Magen3Client("https://api.example", "MAG-COMPLIANCE", "secret", transport=transport)
        result = client.get_compliance_controls_status()
        self.assertTrue(captured[0][1].endswith("/api/compliance-controls/status"))
        self.assertEqual(result["complianceControls"]["configuredProviderIds"], ["ofac_api"])
